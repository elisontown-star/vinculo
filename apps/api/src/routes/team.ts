import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { users, clinics } from '@vinculo/db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { hashPassword } from '../lib/password';
import { sendInviteEmail, sendPlanRequestEmail } from '../lib/email';
import { audit } from '../lib/audit';
import { rateLimit, clientIp } from '../lib/ratelimit';
import { PLAN_LIMITS, type PlanKey } from '../lib/plans';
import type { AppBindings } from '../types';

export const teamRoutes = new Hono<AppBindings>();

function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// ---- Rotas do dono da clínica (owner) --------------------------------------
teamRoutes.get('/', requireAuth, requireRole('owner', 'psychologist'), async (c) => {
  const user = c.get('user');
  const db = getDb(c.env);
  const rows = await db.select().from(users).where(eq(users.clinicId, user.clinicId)).all();
  const clinic = await db.select().from(clinics).where(eq(clinics.id, user.clinicId)).get();
  const plan = (clinic?.plan ?? 'essencial') as PlanKey;
  const usage = { psychologist: 0, secretary: 0 };
  for (const u of rows) {
    // O owner é um psicólogo e ocupa uma vaga de psicólogo do plano.
    if (u.role === 'psychologist' || u.role === 'owner') usage.psychologist++;
    else if (u.role === 'secretary') usage.secretary++;
  }
  return c.json({
    members: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      mfaEnabled: u.mfaEnabled,
    })),
    clinic: clinic ? { companyCode: clinic.companyCode, plan } : null,
    limits: PLAN_LIMITS[plan],
    usage,
  });
});

const inviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['psychologist', 'secretary']).default('psychologist'),
});

teamRoutes.post('/invite', requireAuth, requireRole('owner', 'psychologist'), zValidator('json', inviteSchema), async (c) => {
  const user = c.get('user');
  // Rate limit: 10 convites por clínica por hora (evita spam de e-mail).
  const ok = await rateLimit(c.env, `invite:clinic:${user.clinicId}`, 10, 3600);
  if (!ok) return c.json({ error: 'rate_limit_exceeded' }, 429);
  const { name, email, role } = c.req.valid('json');
  const db = getDb(c.env);

  // Licenciamento: um psicólogo só pode criar secretárias — nunca outro
  // psicólogo (nem owner). Só o owner adiciona psicólogos ao plano.
  if (user.role === 'psychologist' && role !== 'secretary') {
    return c.json({ error: 'forbidden_role' }, 403);
  }

  // E-mail já existe?
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) return c.json({ error: 'email_in_use' }, 409);

  const clinic = await db.select().from(clinics).where(eq(clinics.id, user.clinicId)).get();
  if (!clinic) return c.json({ error: 'not_found' }, 404);

  // Limite de vagas do plano: conta quantos já existem naquele papel (ativos e
  // convites pendentes contam) e barra se o plano estiver cheio.
  if (role === 'psychologist' || role === 'secretary') {
    const plan = (clinic.plan ?? 'essencial') as PlanKey;
    const limit = PLAN_LIMITS[plan][role];
    // O owner conta como psicólogo; secretárias contam à parte.
    const roleFilter =
      role === 'psychologist'
        ? inArray(users.role, ['psychologist', 'owner'])
        : eq(users.role, 'secretary');
    const countRow = await db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.clinicId, user.clinicId), roleFilter))
      .get();
    if ((countRow?.n ?? 0) >= limit) {
      return c.json({ error: 'plan_limit_reached', role, limit, plan }, 409);
    }
  }

  // Cria usuário inativo com hash placeholder (não permite login até ativar).
  const placeholder = await hashPassword(randomToken());
  const newUser = await db
    .insert(users)
    .values({ clinicId: user.clinicId, email, name, role, passwordHash: placeholder, isActive: false })
    .returning()
    .get();

  // Token de convite no KV (7 dias), aponta para o usuário.
  const token = randomToken();
  await c.env.CACHE.put(`invite:${token}`, JSON.stringify({ userId: newUser.id }), {
    expirationTtl: 7 * 24 * 60 * 60,
  });

  try {
    await sendInviteEmail(c.env, email, name, clinic.name, token);
  } catch (err) {
    console.error('[team invite] envio falhou:', err instanceof Error ? err.message : String(err));
    // Mantém o usuário criado; o dono pode reenviar depois.
    return c.json({ ok: true, emailSent: false, warning: 'email_failed' });
  }

  await audit(c.env, { clinicId: user.clinicId, actorUserId: user.userId, action: 'team_invite', entity: 'user', entityId: newUser.id });
  return c.json({ ok: true, emailSent: true });
});

// Reenviar convite
teamRoutes.post('/:id/resend', requireAuth, requireRole('owner'), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const db = getDb(c.env);
  const target = await db.select().from(users).where(and(eq(users.id, id), eq(users.clinicId, user.clinicId))).get();
  if (!target) return c.json({ error: 'not_found' }, 404);
  if (target.isActive) return c.json({ error: 'already_active' }, 400);

  const clinic = await db.select().from(clinics).where(eq(clinics.id, user.clinicId)).get();
  const token = randomToken();
  await c.env.CACHE.put(`invite:${token}`, JSON.stringify({ userId: target.id }), { expirationTtl: 7 * 24 * 60 * 60 });
  try {
    await sendInviteEmail(c.env, target.email, target.name, clinic?.name ?? 'Vínculo', token);
  } catch {
    return c.json({ error: 'email_failed' }, 502);
  }
  return c.json({ ok: true });
});

// Ativar/desativar um membro
const memberActiveSchema = z.object({ isActive: z.boolean() });
teamRoutes.post('/:id/active', requireAuth, requireRole('owner'), zValidator('json', memberActiveSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { isActive } = c.req.valid('json');
  if (id === user.userId) return c.json({ error: 'cannot_change_self' }, 400);
  const db = getDb(c.env);
  const target = await db.select().from(users).where(and(eq(users.id, id), eq(users.clinicId, user.clinicId))).get();
  if (!target) return c.json({ error: 'not_found' }, 404);
  if (target.role === 'owner') return c.json({ error: 'cannot_change_owner' }, 403);
  await db.update(users).set({ isActive }).where(eq(users.id, id));
  return c.json({ ok: true });
});

// ---- Rotas públicas do convite (aceitar) -----------------------------------
// Consulta os dados do convite (nome/e-mail) para preencher a tela.
teamRoutes.get('/invite/:token', async (c) => {
  const token = c.req.param('token');
  const raw = await c.env.CACHE.get(`invite:${token}`);
  if (!raw) return c.json({ error: 'invalid_or_expired' }, 404);
  const { userId } = JSON.parse(raw);
  const u = await getDb(c.env).select().from(users).where(eq(users.id, userId)).get();
  if (!u) return c.json({ error: 'invalid_or_expired' }, 404);
  return c.json({ name: u.name, email: u.email });
});

const strongPassword = z
  .string()
  .min(8)
  .refine((v) => /[a-z]/.test(v))
  .refine((v) => /[A-Z]/.test(v))
  .refine((v) => /[0-9]/.test(v))
  .refine((v) => /[^A-Za-z0-9]/.test(v));

const acceptSchema = z.object({ token: z.string().min(10), password: strongPassword });

// Define a senha e ativa a conta. Retorna que precisa configurar MFA (fluxo existente).
teamRoutes.post('/invite/accept', zValidator('json', acceptSchema), async (c) => {
  const { token, password } = c.req.valid('json');
  const raw = await c.env.CACHE.get(`invite:${token}`);
  if (!raw) return c.json({ error: 'invalid_or_expired' }, 400);
  const { userId } = JSON.parse(raw);
  const db = getDb(c.env);
  const u = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!u) return c.json({ error: 'invalid_or_expired' }, 400);

  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash, isActive: true }).where(eq(users.id, userId));
  await c.env.CACHE.delete(`invite:${token}`);
  await audit(c.env, { clinicId: u.clinicId, actorUserId: u.id, action: 'invite_accepted', entity: 'user', entityId: u.id });

  // A conta agora precisa de login normal (que vai exigir setup de MFA).
  return c.json({ ok: true, email: u.email });
});

// --- Solicitação de mudança de plano (só o psicólogo-owner) ------------------
// O owner não muda o plano sozinho: ele solicita, e a mudança é aplicada pelo
// super admin no portal. Aqui apenas enviamos um e-mail para os administradores.
const planRequestSchema = z.object({
  plan: z.enum(['essencial', 'pro', 'plus']),
  message: z.string().max(500).optional(),
});
teamRoutes.post('/plan-request', requireAuth, requireRole('owner'), zValidator('json', planRequestSchema), async (c) => {
  const user = c.get('user');
  const { plan, message } = c.req.valid('json');
  const db = getDb(c.env);

  const clinic = await db.select().from(clinics).where(eq(clinics.id, user.clinicId)).get();
  if (!clinic) return c.json({ error: 'not_found' }, 404);
  const owner = await db.select().from(users).where(eq(users.id, user.userId)).get();

  // Destinatário fixo do suporte da VTECH IT.
  const SUPPORT_EMAIL = 'suporte@vtechit.com.br';

  await sendPlanRequestEmail(c.env, {
    to: [SUPPORT_EMAIL],
    clinicName: clinic.name,
    companyCode: clinic.companyCode ?? '—',
    currentPlan: clinic.plan ?? 'essencial',
    requestedPlan: plan,
    ownerName: owner?.name ?? '—',
    ownerEmail: owner?.email ?? '—',
    message: message ?? '',
  });

  await audit(c.env, { clinicId: user.clinicId, actorUserId: user.userId, action: 'plan_request', entity: 'clinic', entityId: user.clinicId, metadata: { plan } });
  return c.json({ ok: true });
});
