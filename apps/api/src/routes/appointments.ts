import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { appointments, patients, users } from '@vinculo/db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { audit } from '../lib/audit';
import type { AppBindings } from '../types';

export const appointmentRoutes = new Hono<AppBindings>();

const clinicRoles = requireRole('owner', 'psychologist', 'secretary');

// Lista de psicólogos da clínica (para o seletor da agenda).
appointmentRoutes.get('/psychologists', requireAuth, clinicRoles, async (c) => {
  const u = c.get('user');
  const db = getDb(c.env);
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.clinicId, u.clinicId), inArray(users.role, ['owner', 'psychologist'])))
    .all();
  return c.json({ psychologists: rows });
});

// Lista de agendamentos num intervalo (com nome do paciente e do psicólogo).
appointmentRoutes.get('/', requireAuth, clinicRoles, async (c) => {
  const u = c.get('user');
  const db = getDb(c.env);
  const from = Number(c.req.query('from')) || Date.now() - 7 * 86400000;
  const to = Number(c.req.query('to')) || Date.now() + 30 * 86400000;
  // Janela máxima de 366 dias para evitar varredura completa da tabela.
  const MAX_WINDOW_MS = 366 * 86400000;
  if (to - from > MAX_WINDOW_MS) return c.json({ error: 'range_too_large' }, 400);
  let psychId = c.req.query('psychologistId') || null;
  // O psicólogo enxerga apenas a própria agenda.
  if (u.role === 'psychologist') psychId = u.userId;

  const conds = [
    eq(appointments.clinicId, u.clinicId),
    gte(appointments.startsAt, new Date(from)),
    lte(appointments.startsAt, new Date(to)),
  ];
  if (psychId) conds.push(eq(appointments.psychologistId, psychId));

  const rows = await db
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      psychologistId: appointments.psychologistId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      notes: appointments.notes,
      patientName: patients.fullName,
      psychologistName: users.name,
    })
    .from(appointments)
    .leftJoin(patients, eq(patients.id, appointments.patientId))
    .leftJoin(users, eq(users.id, appointments.psychologistId))
    .where(and(...conds))
    .all();

  const toMs = (v: unknown) => (v instanceof Date ? v.getTime() : Number(v));
  return c.json({
    appointments: rows.map((r) => ({ ...r, startsAt: toMs(r.startsAt), endsAt: toMs(r.endsAt) })),
  });
});

const createSchema = z.object({
  patientId: z.string(),
  psychologistId: z.string(),
  startsAt: z.number(),
  endsAt: z.number(),
  notes: z.string().max(500).optional(),
});
appointmentRoutes.post('/', requireAuth, clinicRoles, zValidator('json', createSchema), async (c) => {
  const u = c.get('user');
  const db = getDb(c.env);
  const { patientId, psychologistId, startsAt, endsAt, notes } = c.req.valid('json');

  const p = await db.select({ id: patients.id }).from(patients).where(and(eq(patients.id, patientId), eq(patients.clinicId, u.clinicId))).get();
  if (!p) return c.json({ error: 'patient_not_found' }, 404);
  const psy = await db.select({ id: users.id }).from(users).where(and(eq(users.id, psychologistId), eq(users.clinicId, u.clinicId))).get();
  if (!psy) return c.json({ error: 'psychologist_not_found' }, 404);
  if (endsAt <= startsAt) return c.json({ error: 'invalid_range' }, 400);

  const appt = await db
    .insert(appointments)
    .values({ clinicId: u.clinicId, patientId, psychologistId, startsAt: new Date(startsAt), endsAt: new Date(endsAt), status: 'scheduled', notes: notes ?? null })
    .returning()
    .get();

  await audit(c.env, { clinicId: u.clinicId, actorUserId: u.userId, action: 'appointment_created', entity: 'appointment', entityId: appt.id });
  // (Fase 2) Aqui entrará a criação do evento no Google Calendar do psicólogo.
  return c.json({ ok: true, id: appt.id });
});

const patchSchema = z.object({
  startsAt: z.number().optional(),
  endsAt: z.number().optional(),
  status: z.enum(['scheduled', 'done', 'canceled', 'no_show']).optional(),
  notes: z.string().max(500).optional(),
});
appointmentRoutes.patch('/:id', requireAuth, clinicRoles, zValidator('json', patchSchema), async (c) => {
  const u = c.get('user');
  const db = getDb(c.env);
  const id = c.req.param('id');
  const appt = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.clinicId, u.clinicId))).get();
  if (!appt) return c.json({ error: 'not_found' }, 404);

  const body = c.req.valid('json');
  const set: Record<string, unknown> = {};
  if (body.startsAt !== undefined) set.startsAt = new Date(body.startsAt);
  if (body.endsAt !== undefined) set.endsAt = new Date(body.endsAt);
  if (body.status !== undefined) set.status = body.status;
  if (body.notes !== undefined) set.notes = body.notes;
  if (Object.keys(set).length === 0) return c.json({ ok: true });

  await db.update(appointments).set(set).where(eq(appointments.id, id));
  await audit(c.env, { clinicId: u.clinicId, actorUserId: u.userId, action: 'appointment_updated', entity: 'appointment', entityId: id });
  return c.json({ ok: true });
});

appointmentRoutes.delete('/:id', requireAuth, clinicRoles, async (c) => {
  const u = c.get('user');
  const db = getDb(c.env);
  const id = c.req.param('id');
  const appt = await db.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.id, id), eq(appointments.clinicId, u.clinicId))).get();
  await db.delete(appointments).where(eq(appointments.id, id));
  await audit(c.env, { clinicId: u.clinicId, actorUserId: u.userId, action: 'appointment_deleted', entity: 'appointment', entityId: id });
  return c.json({ ok: true });
});
