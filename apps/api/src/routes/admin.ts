import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  clinics,
  users,
  patients,
  sessions,
  timelineEvents,
  aiSummaries,
  aiAlerts,
  appointments,
  consents,
  documents,
} from '@vinculo/db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { sendPasswordResetEmail } from '../lib/email';
import { verifyTotp, consumeRecoveryCode } from '../lib/mfa';
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
      status: clinic.status ?? 'trial',
      trialEndsAt: clinic.trialEndsAt ?? null,
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

// --- Resetar senha: dispara e-mail de redefinição ao usuário -----------------
adminRoutes.post('/users/:id/reset-password', async (c) => {
  const userId = c.req.param('id');
  const db = getDb(c.env);
  const target = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!target) return c.json({ error: 'not_found' }, 404);
  if (target.role === 'platform_admin') return c.json({ error: 'cannot_target_admin' }, 403);

  // Gera código de 6 dígitos, guarda no KV (15 min) e envia por e-mail —
  // mesmo mecanismo do "esqueci minha senha".
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  const code = n.toString().padStart(6, '0');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const codeHash = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  await c.env.CACHE.put(
    `pwreset:${target.email}`,
    JSON.stringify({ codeHash, tries: 0 }),
    { expirationTtl: 900 },
  );

  try {
    await sendPasswordResetEmail(c.env, target.email, code);
  } catch (err) {
    console.error('[admin reset-password] envio falhou:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'email_failed' }, 502);
  }

  const admin = c.get('user');
  await audit(c.env, {
    clinicId: target.clinicId,
    actorUserId: admin.userId,
    action: 'admin_reset_password_email',
    entity: 'user',
    entityId: userId,
  });
  return c.json({ ok: true, email: target.email });
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

// --- APAGAR uma clínica permanentemente (destrutivo e irreversível) ----------
// Exige: (1) o nome exato da clínica digitado, (2) um código MFA válido do
// próprio super admin. Apaga em cascata TODOS os dados da clínica, de forma
// atômica (D1 batch = transação). O registro de auditoria é gravado ANTES da
// exclusão e sobrevive a ela (audit_log não tem FK para clinics).
const deleteClinicSchema = z.object({
  confirmName: z.string().min(1),
  mfaCode: z.string().min(1),
});
adminRoutes.post('/clinics/:id/delete', zValidator('json', deleteClinicSchema), async (c) => {
  const clinicId = c.req.param('id');
  const { confirmName, mfaCode } = c.req.valid('json');
  const db = getDb(c.env);

  const clinic = await db.select().from(clinics).where(eq(clinics.id, clinicId)).get();
  if (!clinic) return c.json({ error: 'not_found' }, 404);

  // 1) Confirmação pelo nome exato — evita apagar a clínica errada.
  if (confirmName.trim() !== clinic.name.trim()) {
    return c.json({ error: 'name_mismatch' }, 400);
  }

  // 2) MFA do próprio super admin (TOTP, com fallback para código de recuperação).
  const admin = c.get('user');
  const adminUser = await db.select().from(users).where(eq(users.id, admin.userId)).get();
  if (!adminUser || !adminUser.mfaEnabled || !adminUser.mfaSecret) {
    return c.json({ error: 'admin_mfa_required' }, 403);
  }
  let mfaOk = verifyTotp(adminUser.mfaSecret, mfaCode);
  if (!mfaOk && adminUser.mfaRecoveryCodes) {
    const remaining = await consumeRecoveryCode(mfaCode, JSON.parse(adminUser.mfaRecoveryCodes));
    if (remaining) {
      mfaOk = true;
      await db
        .update(users)
        .set({ mfaRecoveryCodes: JSON.stringify(remaining) })
        .where(eq(users.id, adminUser.id));
    }
  }
  if (!mfaOk) return c.json({ error: 'invalid_mfa' }, 401);

  // 3) Nunca apagar uma clínica que contenha um super admin (evita auto-lockout).
  const adminInClinic = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.clinicId, clinicId), eq(users.role, 'platform_admin')))
    .get();
  if (adminInClinic) return c.json({ error: 'clinic_has_admin' }, 409);

  // 4) Contadores para o registro de auditoria (antes de apagar).
  const userCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.clinicId, clinicId))
    .get();
  const patientCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(patients)
    .where(eq(patients.clinicId, clinicId))
    .get();

  // 5) Auditoria ANTES da exclusão (append-only, sobrevive à clínica).
  await audit(c.env, {
    clinicId,
    actorUserId: admin.userId,
    action: 'admin_delete_clinic',
    entity: 'clinic',
    entityId: clinicId,
    metadata: {
      name: clinic.name,
      users: userCount?.n ?? 0,
      patients: patientCount?.n ?? 0,
    },
  });

  // 6) Exclusão em cascata, atômica. Ordem filho → pai (segura para FKs).
  // NOTA: quando o R2 for ligado (documents.r2Key), apagar os blobs do bucket
  // AQUI antes de remover as linhas, para não deixar arquivos órfãos.
  await db.batch([
    db.delete(documents).where(eq(documents.clinicId, clinicId)),
    db.delete(consents).where(eq(consents.clinicId, clinicId)),
    db.delete(appointments).where(eq(appointments.clinicId, clinicId)),
    db.delete(aiAlerts).where(eq(aiAlerts.clinicId, clinicId)),
    db.delete(aiSummaries).where(eq(aiSummaries.clinicId, clinicId)),
    db.delete(timelineEvents).where(eq(timelineEvents.clinicId, clinicId)),
    db.delete(sessions).where(eq(sessions.clinicId, clinicId)),
    db.delete(patients).where(eq(patients.clinicId, clinicId)),
    db.delete(users).where(eq(users.clinicId, clinicId)),
    db.delete(clinics).where(eq(clinics.id, clinicId)),
  ]);

  return c.json({ ok: true });
});

// --- Busca global: usuários e clínicas por nome ou e-mail --------------------
adminRoutes.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim().toLowerCase();
  if (q.length < 2) return c.json({ users: [], clinics: [] });

  const db = getDb(c.env);
  const like = `%${q}%`;

  const userRows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.name}) LIKE ${like} OR lower(${users.email}) LIKE ${like}`)
    .limit(30)
    .all();

  const clinicRows = await db
    .select()
    .from(clinics)
    .where(sql`lower(${clinics.name}) LIKE ${like}`)
    .limit(30)
    .all();

  // Mapa de nomes de clínica para exibir junto do usuário.
  const clinicNames = new Map<string, string>();
  for (const cl of await db.select().from(clinics).all()) clinicNames.set(cl.id, cl.name);

  return c.json({
    users: userRows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      mfaEnabled: u.mfaEnabled,
      createdAt: u.createdAt,
      clinicId: u.clinicId,
      clinicName: clinicNames.get(u.clinicId) ?? '—',
    })),
    clinics: clinicRows.map((cl) => ({ id: cl.id, name: cl.name, isActive: cl.isActive ?? true, createdAt: cl.createdAt })),
  });
});

// --- Ativar plano mensal (tira do trial, libera acesso) ----------------------
adminRoutes.post('/clinics/:id/activate-plan', async (c) => {
  const clinicId = c.req.param('id');
  const db = getDb(c.env);
  const clinic = await db.select().from(clinics).where(eq(clinics.id, clinicId)).get();
  if (!clinic) return c.json({ error: 'not_found' }, 404);

  await db.update(clinics).set({ status: 'active', isActive: true }).where(eq(clinics.id, clinicId));
  // Reativa os logins da clínica.
  await db.update(users).set({ isActive: true }).where(eq(users.clinicId, clinicId));

  const admin = c.get('user');
  await audit(c.env, { clinicId, actorUserId: admin.userId, action: 'admin_activate_plan', entity: 'clinic', entityId: clinicId });
  return c.json({ ok: true });
});

// --- Estender/reiniciar o período de teste (dias a partir de agora) ----------
const extendSchema = z.object({ days: z.number().int().min(1).max(90) });
adminRoutes.post('/clinics/:id/extend-trial', zValidator('json', extendSchema), async (c) => {
  const clinicId = c.req.param('id');
  const { days } = c.req.valid('json');
  const db = getDb(c.env);
  const clinic = await db.select().from(clinics).where(eq(clinics.id, clinicId)).get();
  if (!clinic) return c.json({ error: 'not_found' }, 404);

  const trialEndsAt = Date.now() + days * 24 * 60 * 60 * 1000;
  await db.update(clinics).set({ status: 'trial', trialEndsAt, isActive: true }).where(eq(clinics.id, clinicId));
  await db.update(users).set({ isActive: true }).where(eq(users.clinicId, clinicId));

  const admin = c.get('user');
  await audit(c.env, { clinicId, actorUserId: admin.userId, action: 'admin_extend_trial', entity: 'clinic', entityId: clinicId });
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
