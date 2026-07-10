import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { clinicalShares, users } from '@vinculo/db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import type { AppBindings } from '../types';

export const sharesRoutes = new Hono<AppBindings>();
const clinRoles = requireRole('owner', 'psychologist');
const toMs = (v: unknown) => (v instanceof Date ? v.getTime() : v == null ? null : Number(v));

// Conceder acesso aos meus pacientes a um colega (opcional: até uma data).
const createSchema = z.object({ granteeId: z.string(), expiresAt: z.number().nullable().optional() });
sharesRoutes.post('/', requireAuth, clinRoles, zValidator('json', createSchema), async (c) => {
  const user = c.get('user');
  const db = getDb(c.env);
  const { granteeId, expiresAt } = c.req.valid('json');
  if (granteeId === user.userId) return c.json({ error: 'self' }, 400);
  const grantee = await db.select({ id: users.id, role: users.role }).from(users).where(and(eq(users.id, granteeId), eq(users.clinicId, user.clinicId))).get();
  if (!grantee || (grantee.role !== 'psychologist' && grantee.role !== 'owner')) return c.json({ error: 'invalid_grantee' }, 400);

  // Substitui um compartilhamento ativo anterior para o mesmo colega.
  await db.update(clinicalShares).set({ revokedAt: new Date() })
    .where(and(eq(clinicalShares.clinicId, user.clinicId), eq(clinicalShares.grantorId, user.userId), eq(clinicalShares.granteeId, granteeId), isNull(clinicalShares.revokedAt)));

  const row = await db.insert(clinicalShares).values({
    clinicId: user.clinicId, grantorId: user.userId, granteeId,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning().get();
  await audit(c.env, { clinicId: user.clinicId, actorUserId: user.userId, action: 'clinical_share_granted', entity: 'user', entityId: granteeId });
  return c.json({ ok: true, id: row.id });
});

// Compartilhamentos que eu concedi (granted) e os que recebi (received).
sharesRoutes.get('/', requireAuth, clinRoles, async (c) => {
  const user = c.get('user');
  const db = getDb(c.env);
  const now = Date.now();

  const grantedRows = await db.select({ id: clinicalShares.id, granteeName: users.name, expiresAt: clinicalShares.expiresAt, revokedAt: clinicalShares.revokedAt })
    .from(clinicalShares).leftJoin(users, eq(users.id, clinicalShares.granteeId))
    .where(and(eq(clinicalShares.clinicId, user.clinicId), eq(clinicalShares.grantorId, user.userId))).all();
  const receivedRows = await db.select({ id: clinicalShares.id, grantorName: users.name, expiresAt: clinicalShares.expiresAt, revokedAt: clinicalShares.revokedAt })
    .from(clinicalShares).leftJoin(users, eq(users.id, clinicalShares.grantorId))
    .where(and(eq(clinicalShares.clinicId, user.clinicId), eq(clinicalShares.granteeId, user.userId))).all();

  const active = (r: { revokedAt: unknown; expiresAt: unknown }) => !r.revokedAt && (!r.expiresAt || (toMs(r.expiresAt) as number) > now);
  return c.json({
    granted: grantedRows.filter(active).map((g) => ({ id: g.id, granteeName: g.granteeName, expiresAt: toMs(g.expiresAt) })),
    received: receivedRows.filter(active).map((r) => ({ id: r.id, grantorName: r.grantorName, expiresAt: toMs(r.expiresAt) })),
  });
});

// Revogar um compartilhamento (só quem concedeu).
sharesRoutes.delete('/:id', requireAuth, clinRoles, async (c) => {
  const user = c.get('user');
  const db = getDb(c.env);
  const id = c.req.param('id');
  const row = await db.select({ id: clinicalShares.id }).from(clinicalShares).where(and(eq(clinicalShares.id, id), eq(clinicalShares.grantorId, user.userId))).get();
  if (!row) return c.json({ error: 'not_found' }, 404);
  await db.update(clinicalShares).set({ revokedAt: new Date() }).where(eq(clinicalShares.id, id));
  await audit(c.env, { clinicId: user.clinicId, actorUserId: user.userId, action: 'clinical_share_revoked', entity: 'share', entityId: id });
  return c.json({ ok: true });
});
