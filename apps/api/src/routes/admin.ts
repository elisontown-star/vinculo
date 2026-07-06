import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { clinics, users, patients } from '@vinculo/db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { hashPassword } from '../lib/password';
import { audit } from '../lib/audit';
import type { AppBindings } from '../types';

export const adminRoutes = new Hono<AppBindings>();

// TODAS as rotas exigem autenticação + papel platform_admin.
// Este guard é a única porta: nenhuma rota aqui expõe dados clínicos de pacientes.
adminRoutes.use('*', requireAuth, requireRole('platform_admin'));

// --- Visão geral: todas as clínicas com contadores (sem dados de pacientes) --
adminRoutes.get('/clinics', async (c) => {
  const db = getDb(c.env);
  const rows = await db.select().from(clinics).all();

  const result = [];
  for (const clinic of rows) {
    // Contadores agregados — apenas números, nunca conteúdo.
    const userCount = await db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.clinicId, clinic.id))
      .get();
    const patientCount = await db
      .select({ n: sql<number>`count(*)` })
      .from(patients)
      .where(and(eq(patients.clinicId, clinic.id), isNull(patients.deletedAt)))
      .get();

    result.push({
      id: clinic.id,
      name: clinic.name,
      createdAt: clinic.createdAt,
      isActive: clinic.isActive ?? true,
      users: userCount?.n ?? 0,
      patients: patientCount?.n ?? 0,
    });
  }
  return c.json({ clinics: result });
});

// --- Usuários de uma clínica (metadados apenas, sem senha/segredos) ----------
adminRoutes.get('/clinics/:id/users', async (c) => {
  const clinicId = c.req.param('id');
  const db = getDb(c.env);
  const rows = await db.select().from(users).where(eq(users.clinicId, clinicId)).all();
  return c.json({
    users: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      mfaEnabled: u.mfaEnabled,
      createdAt: u.createdAt,
    })),
  });
});

// --- Resetar MFA de um usuário (o caso principal) ----------------------------
adminRoutes.post('/users/:id/reset-mfa', async (c) => {
  const userId = c.req.param('id');
  const db = getDb(c.env);
  const target = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!target) return c.json({ error: 'not_found' }, 404);
  if (target.role === 'platform_admin') return c.json({ error: 'cannot_target_admin' }, 403);

  await db
    .update(users)
    .set({ mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: null })
    .where(eq(users.id, userId));

  const admin = c.get('user');
  await audit(c.env, {
    clinicId: target.clinicId,
    actorUserId: admin.userId,
    action: 'admin_reset_mfa',
    entity: 'user',
    entityId: userId,
  });
  return c.json({ ok: true });
});

// --- Resetar senha de um usuário (gera uma temporária e retorna uma vez) -----
adminRoutes.post('/users/:id/reset-password', async (c) => {
  const userId = c.req.param('id');
  const db = getDb(c.env);
  const target = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!target) return c.json({ error: 'not_found' }, 404);
  if (target.role === 'platform_admin') return c.json({ error: 'cannot_target_admin' }, 403);

  // Senha temporária forte e aleatória.
  const temp =
    'Vc' +
    Math.random().toString(36).slice(2, 8) +
    '!' +
    Math.floor(Math.random() * 90 + 10);
  const passwordHash = await hashPassword(temp);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

  const admin = c.get('user');
  await audit(c.env, {
    clinicId: target.clinicId,
    actorUserId: admin.userId,
    action: 'admin_reset_password',
    entity: 'user',
    entityId: userId,
  });
  // Retorna a senha temporária UMA vez para o admin repassar ao usuário.
  return c.json({ ok: true, tempPassword: temp });
});

// --- Ativar/desativar uma clínica -------------------------------------------
const toggleSchema = z.object({ isActive: z.boolean() });
adminRoutes.post('/clinics/:id/active', zValidator('json', toggleSchema), async (c) => {
  const clinicId = c.req.param('id');
  const { isActive } = c.req.valid('json');
  const db = getDb(c.env);
  const clinic = await db.select().from(clinics).where(eq(clinics.id, clinicId)).get();
  if (!clinic) return c.json({ error: 'not_found' }, 404);

  await db.update(clinics).set({ isActive }).where(eq(clinics.id, clinicId));
  // Também bloqueia/reativa os logins da clínica (exceto pacientes).
  await db.update(users).set({ isActive }).where(eq(users.clinicId, clinicId));

  const admin = c.get('user');
  await audit(c.env, {
    clinicId,
    actorUserId: admin.userId,
    action: isActive ? 'admin_activate_clinic' : 'admin_deactivate_clinic',
    entity: 'clinic',
    entityId: clinicId,
  });
  return c.json({ ok: true });
});

// --- Estatísticas gerais da plataforma --------------------------------------
adminRoutes.get('/stats', async (c) => {
  const db = getDb(c.env);
  const clinicCount = await db.select({ n: sql<number>`count(*)` }).from(clinics).get();
  const userCount = await db.select({ n: sql<number>`count(*)` }).from(users).get();
  const patientCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(patients)
    .where(isNull(patients.deletedAt))
    .get();
  return c.json({
    clinics: clinicCount?.n ?? 0,
    users: userCount?.n ?? 0,
    patients: patientCount?.n ?? 0,
  });
});
