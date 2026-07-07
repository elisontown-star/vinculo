import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { users, clinics } from '@vinculo/db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { hashPassword } from '../lib/password';
import { sendInviteEmail } from '../lib/email';
import { audit } from '../lib/audit';
import type { AppBindings } from '../types';

export const teamRoutes = new Hono<AppBindings>();

function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// ---- Rotas do dono da clínica (owner) --------------------------------------
teamRoutes.get('/', requireAuth, requireRole('owner'), async (c) => {
  const user = c.get('user');
  const rows = await getDb(c.env)
    .select()
    .from(users)
    .where(eq(users.clinicId, user.clinicId))
    .all();
  return c.json({
    members: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      mfaEnabled: u.mfaEnabled,
    })),
  });
});

const inviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['psychologist', 'secretary', 'owner']).default('psychologist'),
});

teamRoutes.post('/invite', requireAuth, requireRole('owner'), zValidator('json', inviteSchema), async (c) => {
  const user = c.get('user');
  const { name, email, role } = c.req.valid('json');
  const db = getDb(c.env);

  // E-mail já existe?
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) return c.json({ error: 'email_in_use' }, 409);

  const clinic = await db.select().from(clinics).where(eq(clinics.id, user.clinicId)).get();
  if (!clinic) return c.json({ error: 'not_found' }, 404);

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
