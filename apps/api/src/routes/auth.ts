import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sign, verify } from 'hono/jwt';
import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { clinics, users } from '@vinculo/db/schema';
import { hashPassword, verifyPassword } from '../lib/password';
import { sendPasswordResetEmail } from '../lib/email';
import { audit } from '../lib/audit';
import { requireAuth } from '../middleware/auth';
import { generateCompanyCode, isValidTaxId } from '../lib/plans';
import { rateLimit, clientIp } from '../lib/ratelimit';
import {
  newSecret,
  otpauthUri,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCodes,
  consumeRecoveryCode,
} from '../lib/mfa';
import type { AppBindings, Env } from '../types';

export const authRoutes = new Hono<AppBindings>();

type UserRow = { id: string; clinicId: string; role: string; name: string; email: string; tokenVersion: number };

// Token curto que autoriza só o passo de MFA (setup ou desafio).
async function issueStepToken(env: Env, userId: string, purpose: 'setup' | 'challenge'): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: userId, step: purpose, iat: now, exp: now + 60 * 10 }, env.JWT_SECRET, 'HS256');
}

async function readStepToken(env: Env, token: string, purpose: 'setup' | 'challenge'): Promise<string | null> {
  try {
    const p: any = await verify(token, env.JWT_SECRET, 'HS256');
    if (p.step !== purpose) return null;
    return p.sub as string;
  } catch {
    return null;
  }
}

// ---- Dispositivo confiável (pula MFA por 15 dias no mesmo navegador) --------
const TRUSTED_DEVICE_DAYS = 15;

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function trustDevice(env: Env, userId: string): Promise<string> {
  const token = randomToken();
  // Chave por usuário+token; expira automaticamente após o prazo.
  await env.CACHE.put(`trustdev:${userId}:${token}`, '1', {
    expirationTtl: TRUSTED_DEVICE_DAYS * 24 * 60 * 60,
  });
  return token;
}

async function isTrustedDevice(env: Env, userId: string, token: string): Promise<boolean> {
  if (!token || token.length < 32) return false;
  const v = await env.CACHE.get(`trustdev:${userId}:${token}`);
  return v === '1';
}

async function issueToken(env: Env, user: UserRow): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: user.id, cid: user.clinicId, role: user.role, tv: user.tokenVersion ?? 0, iat: now, exp: now + 60 * 60 * 12 },
    env.JWT_SECRET,
    'HS256',
  );
}

const strongPassword = z
  .string()
  .min(8, 'weak_length')
  .max(72, 'weak_length')
  .refine((v) => /[a-z]/.test(v), 'weak_lower')
  .refine((v) => /[A-Z]/.test(v), 'weak_upper')
  .refine((v) => /[0-9]/.test(v), 'weak_number')
  .refine((v) => /[^A-Za-z0-9]/.test(v), 'weak_special');

const registerSchema = z.object({
  clinicName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: strongPassword,
  plan: z.enum(['essencial', 'pro', 'plus']).default('essencial'),
  taxIdType: z.enum(['cnpj', 'cpf']),
  taxId: z.string().min(11).max(20),
});

// Cria a clínica (tenant) + o usuário dono. Ponto de entrada de uma nova clínica.
authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const ip = clientIp(c.req.raw.headers);
  if (!(await rateLimit(c.env, `register:${ip}`, 5, 300))) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  const { clinicName, name, email, password, plan, taxIdType, taxId } = c.req.valid('json');
  const db = getDb(c.env);

  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) return c.json({ error: 'email_in_use' }, 409);

  // Valida o documento fiscal (CPF ou CNPJ) pelos dígitos verificadores.
  const taxDigits = taxId.replace(/\D/g, '');
  if (!isValidTaxId(taxIdType, taxDigits)) {
    return c.json({ error: 'invalid_tax_id' }, 400);
  }

  // Gera um código de empresa único (com algumas tentativas para evitar colisão).
  let companyCode = generateCompanyCode();
  for (let i = 0; i < 5; i++) {
    const clash = await db.select({ id: clinics.id }).from(clinics).where(eq(clinics.companyCode, companyCode)).get();
    if (!clash) break;
    companyCode = generateCompanyCode();
  }

  const TRIAL_DAYS = 7;
  const trialEndsAt = Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const clinic = await db
    .insert(clinics)
    .values({ name: clinicName, status: 'trial', trialEndsAt, plan, taxIdType, taxId: taxDigits, companyCode })
    .returning()
    .get();
  const passwordHash = await hashPassword(password);
  const user = await db
    .insert(users)
    .values({ clinicId: clinic.id, email, name, passwordHash, role: 'owner' })
    .returning()
    .get();

  await audit(c.env, {
    clinicId: clinic.id,
    actorUserId: user.id,
    action: 'register',
    entity: 'clinic',
    entityId: clinic.id,
  });

  // MFA opcional: o novo dono entra direto (pode ativar o MFA depois, se quiser).
  const token = await issueToken(c.env, user);
  return c.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, mfaEnabled: !!user.mfaEnabled } }, 201);
});

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const ip = clientIp(c.req.raw.headers);
  if (!(await rateLimit(c.env, `login:${ip}`, 10, 60))) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  const { email, password } = c.req.valid('json');
  const db = getDb(c.env);

  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user || !user.isActive) return c.json({ error: 'invalid_credentials' }, 401);

  // Per-user rate limiting (5 attempts per 5 min) to prevent credential stuffing.
  if (!(await rateLimit(c.env, `login:u:${user.id}`, 5, 300))) {
    return c.json({ error: 'rate_limited' }, 429);
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return c.json({ error: 'invalid_credentials' }, 401);

  // Verificação de trial/plano da clínica (o platform_admin não pertence a esse ciclo).
  if (user.role !== 'platform_admin') {
    const clinic = await db.select().from(clinics).where(eq(clinics.id, user.clinicId)).get();
    if (clinic) {
      const expired = clinic.status === 'trial' && clinic.trialEndsAt != null && Date.now() > clinic.trialEndsAt;
      if (clinic.status === 'blocked' || clinic.isActive === false || expired) {
        // Marca como bloqueada (se ainda não estiver) para deixar o estado consistente.
        if (expired && clinic.status === 'trial') {
          await db.update(clinics).set({ status: 'blocked' }).where(eq(clinics.id, clinic.id));
        }
        return c.json({ error: 'clinic_blocked' }, 403);
      }
    }
  }

  // MFA opcional. Se o usuário não ativou MFA, entra direto.
  if (!user.mfaEnabled) {
    const token = await issueToken(c.env, user);
    return c.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, mfaEnabled: !!user.mfaEnabled } });
  }

  // Dispositivo confiável: se o navegador enviou um deviceToken válido, pula o MFA.
  const deviceToken = c.req.header('X-Device-Token') ?? '';
  if (deviceToken && (await isTrustedDevice(c.env, user.id, deviceToken))) {
    const token = await issueToken(c.env, user);
    return c.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, mfaEnabled: !!user.mfaEnabled } });
  }

  // MFA ativo: pede o código do app.
  const challengeToken = await issueStepToken(c.env, user.id, 'challenge');
  return c.json({ mfaRequired: true, challengeToken });
});

// ---- MFA: iniciar configuração (gera segredo + QR) --------------------------
authRoutes.post('/mfa/setup/start', async (c) => {
  const auth = c.req.header('Authorization')?.replace('Bearer ', '') ?? '';
  const userId = await readStepToken(c.env, auth, 'setup');
  if (!userId) return c.json({ error: 'invalid_step_token' }, 401);

  const db = getDb(c.env);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return c.json({ error: 'not_found' }, 404);

  const secret = newSecret();
  // Guarda o segredo provisoriamente (ainda não ativa o MFA).
  await db.update(users).set({ mfaSecret: secret }).where(eq(users.id, userId));
  const uri = otpauthUri(secret, user.email);
  return c.json({ secret, uri });
});

// ---- MFA: confirmar configuração (valida 1º código, ativa, gera recuperação) ----
const confirmSchema = z.object({ code: z.string().min(6).max(10) });
authRoutes.post('/mfa/setup/confirm', zValidator('json', confirmSchema), async (c) => {
  const auth = c.req.header('Authorization')?.replace('Bearer ', '') ?? '';
  const userId = await readStepToken(c.env, auth, 'setup');
  if (!userId) return c.json({ error: 'invalid_step_token' }, 401);

  const db = getDb(c.env);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || !user.mfaSecret) return c.json({ error: 'no_pending_setup' }, 400);

  const { code } = c.req.valid('json');
  if (!verifyTotp(user.mfaSecret, code)) return c.json({ error: 'invalid_code' }, 401);

  const recovery = generateRecoveryCodes(8);
  const hashes = await hashRecoveryCodes(recovery);
  await db
    .update(users)
    .set({ mfaEnabled: true, mfaRecoveryCodes: JSON.stringify(hashes) })
    .where(eq(users.id, userId));

  await audit(c.env, { clinicId: user.clinicId, actorUserId: user.id, action: 'mfa_enabled', entity: 'user', entityId: user.id });

  const token = await issueToken(c.env, user);
  // Retorna os códigos de recuperação UMA vez (mostrar ao usuário para guardar).
  return c.json({
    token,
    recoveryCodes: recovery,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, mfaEnabled: !!user.mfaEnabled },
  });
});

// ---- MFA opcional: ativar pelo próprio usuário já logado -------------------
// Usado pelo pop-up "Ativar MFA" (o usuário já tem sessão válida).
authRoutes.post('/mfa/enable/start', requireAuth, async (c) => {
  const sess = c.get('user');
  const db = getDb(c.env);
  const user = await db.select().from(users).where(eq(users.id, sess.userId)).get();
  if (!user) return c.json({ error: 'not_found' }, 404);
  if (user.mfaEnabled) return c.json({ error: 'already_enabled' }, 409);
  const secret = newSecret();
  await db.update(users).set({ mfaSecret: secret }).where(eq(users.id, user.id));
  return c.json({ secret, uri: otpauthUri(secret, user.email) });
});

const enableConfirmSchema = z.object({ code: z.string().min(6).max(10) });
authRoutes.post('/mfa/enable/confirm', requireAuth, zValidator('json', enableConfirmSchema), async (c) => {
  const sess = c.get('user');
  const db = getDb(c.env);
  const user = await db.select().from(users).where(eq(users.id, sess.userId)).get();
  if (!user || !user.mfaSecret) return c.json({ error: 'no_pending_setup' }, 400);
  const { code } = c.req.valid('json');
  if (!verifyTotp(user.mfaSecret, code)) return c.json({ error: 'invalid_code' }, 401);

  const recovery = generateRecoveryCodes(8);
  const hashes = await hashRecoveryCodes(recovery);
  await db.update(users).set({ mfaEnabled: true, mfaRecoveryCodes: JSON.stringify(hashes) }).where(eq(users.id, user.id));
  await audit(c.env, { clinicId: user.clinicId, actorUserId: user.id, action: 'mfa_enabled', entity: 'user', entityId: user.id });
  return c.json({ ok: true, recoveryCodes: recovery });
});

// ---- MFA: verificar código no login (app ou recuperação) --------------------
const verifySchema = z.object({ code: z.string().min(6).max(20), trustDevice: z.boolean().optional() });
authRoutes.post('/login/mfa', zValidator('json', verifySchema), async (c) => {
  const ip = clientIp(c.req.raw.headers);
  if (!(await rateLimit(c.env, `mfa:${ip}`, 10, 60))) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  const auth = c.req.header('Authorization')?.replace('Bearer ', '') ?? '';
  const userId = await readStepToken(c.env, auth, 'challenge');
  if (!userId) return c.json({ error: 'invalid_step_token' }, 401);

  const db = getDb(c.env);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || !user.mfaEnabled || !user.mfaSecret) return c.json({ error: 'invalid_credentials' }, 401);

  // Per-user MFA rate limiting (5 attempts per 5 min).
  if (!(await rateLimit(c.env, `mfa:u:${user.id}`, 5, 300))) {
    return c.json({ error: 'rate_limited' }, 429);
  }

  const { code } = c.req.valid('json');

  // 1) tenta código do app
  let valid = verifyTotp(user.mfaSecret, code);

  // 2) senão, tenta código de recuperação (consome o usado)
  if (!valid && user.mfaRecoveryCodes) {
    const remaining = await consumeRecoveryCode(code, JSON.parse(user.mfaRecoveryCodes));
    if (remaining) {
      valid = true;
      await db.update(users).set({ mfaRecoveryCodes: JSON.stringify(remaining) }).where(eq(users.id, userId));
      await audit(c.env, { clinicId: user.clinicId, actorUserId: user.id, action: 'mfa_recovery_used', entity: 'user', entityId: user.id });
    }
  }

  if (!valid) return c.json({ error: 'invalid_code' }, 401);

  const { trustDevice: trust } = c.req.valid('json');
  let deviceToken: string | undefined;
  if (trust) deviceToken = await trustDevice(c.env, user.id);

  const token = await issueToken(c.env, user);
  return c.json({ token, deviceToken, user: { id: user.id, name: user.name, email: user.email, role: user.role, mfaEnabled: !!user.mfaEnabled } });
});

// ---- Redefinição de senha por e-mail ---------------------------------------

function sixDigitCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return n.toString().padStart(6, '0');
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const forgotSchema = z.object({ email: z.string().email() });

// Passo 1: solicitar código. Responde sempre 'ok' (não revela se o e-mail existe).
authRoutes.post('/forgot-password', zValidator('json', forgotSchema), async (c) => {
  const ip = clientIp(c.req.raw.headers);
  if (!(await rateLimit(c.env, `forgot:${ip}`, 5, 300))) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  const { email } = c.req.valid('json');
  const db = getDb(c.env);
  const user = await db.select().from(users).where(eq(users.email, email)).get();

  if (user && user.isActive) {
    const code = sixDigitCode();
    const codeHash = await sha256Hex(code);
    // Guarda no KV por 15 min: chave por e-mail, valor = hash do código + tentativas.
    await c.env.CACHE.put(
      `pwreset:${email}`,
      JSON.stringify({ codeHash, tries: 0 }),
      { expirationTtl: 900 },
    );
    try {
      await sendPasswordResetEmail(c.env, email, code);
    } catch (err) {
      console.error('[forgot-password] envio falhou:', err instanceof Error ? err.message : String(err));
      // Não revela o erro ao cliente; loga para diagnóstico.
    }
  }
  // Resposta genérica sempre.
  return c.json({ ok: true });
});

const resetSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6),
  password: strongPassword,
});

// Passo 2: validar código e trocar a senha.
authRoutes.post('/reset-password', zValidator('json', resetSchema), async (c) => {
  const ip = clientIp(c.req.raw.headers);
  if (!(await rateLimit(c.env, `reset:${ip}`, 10, 300))) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  const { email, code, password } = c.req.valid('json');

  const raw = await c.env.CACHE.get(`pwreset:${email}`);
  if (!raw) return c.json({ error: 'invalid_or_expired' }, 400);

  const data = JSON.parse(raw) as { codeHash: string; tries: number };
  if (data.tries >= 5) {
    await c.env.CACHE.delete(`pwreset:${email}`);
    return c.json({ error: 'too_many_attempts' }, 429);
  }

  const codeHash = await sha256Hex(code);
  if (codeHash !== data.codeHash) {
    await c.env.CACHE.put(
      `pwreset:${email}`,
      JSON.stringify({ ...data, tries: data.tries + 1 }),
      { expirationTtl: 900 },
    );
    return c.json({ error: 'invalid_code' }, 401);
  }

  // Código válido: troca a senha.
  const db = getDb(c.env);
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) return c.json({ error: 'invalid_code' }, 401);

  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({ passwordHash, tokenVersion: (user.tokenVersion ?? 0) + 1 })
    .where(eq(users.id, user.id));

  await c.env.CACHE.delete(`pwreset:${email}`);

  await audit(c.env, {
    clinicId: user.clinicId,
    actorUserId: user.id,
    action: 'reset_password',
    entity: 'user',
    entityId: user.id,
  });

  return c.json({ ok: true });
});
