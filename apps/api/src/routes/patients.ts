import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq, desc, asc, isNull, isNotNull, inArray, gt, gte, lte, or, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { patients, sessions, timelineEvents, clinicalShares, patientFiles, appointments } from '@vinculo/db/schema';
import { ANA_PERSONA, ANA_FULL_ANALYSIS, ANA_ACTIONS } from '../lib/anaPrompt';
import { EXTRACT_SYSTEM, proposalSchema, parseJsonObject, pruneEmpty } from '../lib/anaExtract';
import { requireAuth } from '../middleware/auth';
import { audit } from '../lib/audit';
import type { AppBindings, AuthUser } from '../types';

export const patientRoutes = new Hono<AppBindings>();
patientRoutes.use('*', requireAuth);

// ---- Serialização --------------------------------------------------------
type PatientRow = typeof patients.$inferSelect;
function serializePatient(p: PatientRow, withProfile = true) {
  const base = {
    id: p.id,
    fullName: p.fullName,
    socialName: p.socialName,
    cpf: p.cpf,
    email: p.email,
    phone: p.phone,
    whatsapp: p.whatsapp,
    birthDate: p.birthDate,
    status: p.status,
    photo: p.photo,
    deletedAt: p.deletedAt,
    createdAt: p.createdAt,
  };
  if (!withProfile) return base;
  return { ...base, profile: p.profile ? JSON.parse(p.profile) : {} };
}

// Chaves do profile consideradas clínicas (sigilo) — a secretária NÃO acessa.
const CLINICAL_KEYS = ['clinical', 'health', 'family', 'financial', 'interests', 'lifestyle', 'personality', 'relationships'];

// Para a secretária: mantém dados cadastrais (personal), remove os clínicos.
function stripClinical(serialized: any) {
  if (!serialized.profile) return serialized;
  const p = { ...serialized.profile };
  for (const k of CLINICAL_KEYS) delete p[k];
  return { ...serialized, profile: p };
}

function isSecretary(user: { role: string }) {
  return user.role === 'secretary';
}

// Middleware: bloqueia a secretária em rotas clínicas (sigilo do prontuário).
async function blockSecretary(c: any, next: any) {
  const user = c.get('user');
  if (isSecretary(user)) return c.json({ error: 'forbidden_clinical' }, 403);
  await next();
}

type SessionRow = typeof sessions.$inferSelect;
function serializeSession(s: SessionRow) {
  return { ...s, topics: s.topics ? (JSON.parse(s.topics) as string[]) : [] };
}

// Psicólogos que compartilharam pacientes com o usuário atual (acesso ativo).
async function activeGrantors(c: any, user: AuthUser): Promise<string[]> {
  const rows = await getDb(c.env)
    .select({ grantorId: clinicalShares.grantorId })
    .from(clinicalShares)
    .where(and(
      eq(clinicalShares.clinicId, user.clinicId),
      eq(clinicalShares.granteeId, user.userId),
      isNull(clinicalShares.revokedAt),
      or(isNull(clinicalShares.expiresAt), gt(clinicalShares.expiresAt, new Date())),
    ))
    .all();
  return rows.map((r) => r.grantorId);
}

// Acesso CLÍNICO a um paciente: apenas o psicólogo responsável, ou quem recebeu
// compartilhamento ativo. Owner (não responsável), secretária e platform_admin
// NÃO têm acesso clínico automático (modelo B / opção 2).
function hasClinicalAccess(user: { userId: string }, patient: { psychologistId: string | null }, grantors: string[]) {
  if (!patient.psychologistId) return false;
  return patient.psychologistId === user.userId || grantors.includes(patient.psychologistId);
}

// Garante que o paciente existe E é visível ao usuário (visão administrativa).
async function findPatient(c: any, user: AuthUser, id: string) {
  const grantors = await activeGrantors(c, user);
  const vis = visibilityFilter(user, grantors);
  return getDb(c.env)
    .select()
    .from(patients)
    .where(and(eq(patients.id, id), eq(patients.clinicId, user.clinicId), vis))
    .get();
}

// Tamanho máximo para photo (data URL Base64) e profile (JSON serializado).
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB em Base64 (~1.5 MB real)
const MAX_PROFILE_JSON_BYTES = 64 * 1024; // 64 KB

// Monta os campos do paciente a partir do corpo (tudo opcional exceto nome).
function patientValues(body: Record<string, any>) {
  const v: Record<string, any> = {};
  for (const k of ['fullName', 'socialName', 'cpf', 'email', 'phone', 'whatsapp', 'status']) {
    if (body[k] !== undefined) v[k] = body[k];
  }
  // Limita o tamanho da foto (data URL).
  if (body.photo !== undefined) {
    if (body.photo && body.photo.length > MAX_PHOTO_BYTES) {
      throw new Error('photo_too_large');
    }
    v.photo = body.photo;
  }
  if (body.birthDate !== undefined) v.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  if (body.profile !== undefined) {
    if (body.profile) {
      const serialized = JSON.stringify(body.profile);
      if (serialized.length > MAX_PROFILE_JSON_BYTES) throw new Error('profile_too_large');
      v.profile = serialized;
    } else {
      v.profile = null;
    }
  }
  return v;
}

// ---- Pacientes -----------------------------------------------------------
// Regra de visibilidade (modelo B): o dono (owner) vê todos os pacientes da
// clínica; o psicólogo vê apenas os seus. Retorna a condição extra do WHERE.
function visibilityFilter(user: { role: string; userId: string }, grantors: string[] = []) {
  if (user.role === 'owner' || user.role === 'platform_admin' || user.role === 'secretary') return undefined;
  // psychologist: vê os próprios pacientes + os compartilhados com ele
  return inArray(patients.psychologistId, [user.userId, ...grantors]);
}

// Middleware para rotas clínicas (consultas, linha do tempo, IA, Ana): só passa
// quem tem acesso clínico ao paciente do parâmetro :id.
async function requireClinicalAccess(c: any, next: any) {
  const user = c.get('user');
  const id = c.req.param('id');
  const patient = await findPatient(c, user, id);
  if (!patient) return c.json({ error: 'not_found' }, 404);
  const grantors = await activeGrantors(c, user);
  if (!hasClinicalAccess(user, patient, grantors)) return c.json({ error: 'forbidden_clinical' }, 403);
  await next();
}

patientRoutes.get('/', async (c) => {
  const user = c.get('user');
  const grantors = await activeGrantors(c, user);
  const vis = visibilityFilter(user, grantors);
  const db = getDb(c.env);
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 200), 1), 500);
  const offset = Math.max(Number(c.req.query('offset') ?? 0), 0);
  const where = and(eq(patients.clinicId, user.clinicId), isNull(patients.deletedAt), vis);

  const [rows, countRow] = await Promise.all([
    db.select().from(patients).where(where).orderBy(desc(patients.createdAt)).limit(limit).offset(offset).all(),
    db.select({ total: sql<number>`count(*)` }).from(patients).where(where).get(),
  ]);

  return c.json({
    patients: rows.map((p) => serializePatient(p, false)),
    total: countRow?.total ?? 0,
    limit,
    offset,
  });
});

// Lista os pacientes na lixeira (excluídos logicamente).
patientRoutes.get('/trash', blockSecretary, async (c) => {
  const user = c.get('user');
  const vis = visibilityFilter(user);
  const rows = await getDb(c.env)
    .select()
    .from(patients)
    .where(and(eq(patients.clinicId, user.clinicId), isNotNull(patients.deletedAt), vis))
    .orderBy(desc(patients.deletedAt))
    .all();
  return c.json({ patients: rows.map((p) => serializePatient(p, false)) });
});

// Nada é obrigatório, exceto o nome (rótulo do paciente).
const createSchema = z
  .object({
    fullName: z.string().min(1),
    socialName: z.string().optional(),
    cpf: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    birthDate: z.string().nullish(),
    status: z.enum(['active', 'inactive']).optional(),
    photo: z.string().nullish(),
    profile: z.any().optional(),
  })
  .passthrough();

patientRoutes.post('/', zValidator('json', createSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const db = getDb(c.env);
  let values: Record<string, any>;
  try {
    values = patientValues(body);
  } catch (e: any) {
    return c.json({ error: e.message ?? 'invalid_input' }, 400);
  }
  const psychologistId =
    user.role === 'psychologist' || user.role === 'owner' ? user.userId : null;
  const row = await db
    .insert(patients)
    .values({ clinicId: user.clinicId, psychologistId, fullName: body.fullName, ...values })
    .returning()
    .get();
  await audit(c.env, {
    clinicId: user.clinicId,
    actorUserId: user.userId,
    action: 'create',
    entity: 'patient',
    entityId: row.id,
  });
  return c.json({ patient: serializePatient(row) }, 201);
});

patientRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const row = await findPatient(c, user, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  const grantors = await activeGrantors(c, user);
  const clinical = hasClinicalAccess(user, row, grantors);
  const serialized = serializePatient(row);
  return c.json({
    patient: clinical
      ? { ...serialized, clinicalAccess: true }
      : { ...stripClinical(serialized), clinicalAccess: false },
  });
});

// Atualização da ficha (parcial — tudo opcional).
const updateSchema = createSchema.partial();

patientRoutes.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await findPatient(c, user, id);
  if (!existing) return c.json({ error: 'not_found' }, 404);
  const input = c.req.valid('json');
  // Sem acesso clínico (secretária, ou owner em paciente de outro psicólogo):
  // não pode gravar dados clínicos — preserva o profile clínico existente.
  const grantors = await activeGrantors(c, user);
  if (!hasClinicalAccess(user, existing, grantors) && input.profile) {
    const current = existing.profile ? JSON.parse(existing.profile) : {};
    const incoming = { ...input.profile };
    for (const k of CLINICAL_KEYS) {
      if (current[k] !== undefined) incoming[k] = current[k];
      else delete incoming[k];
    }
    input.profile = incoming;
  }
  let values: Record<string, any>;
  try {
    values = patientValues(input);
  } catch (e: any) {
    return c.json({ error: e.message ?? 'invalid_input' }, 400);
  }
  const db = getDb(c.env);
  const row = await db
    .update(patients)
    .set(values)
    .where(and(eq(patients.id, id), eq(patients.clinicId, user.clinicId)))
    .returning()
    .get();
  await audit(c.env, {
    clinicId: user.clinicId,
    actorUserId: user.userId,
    action: 'update',
    entity: 'patient',
    entityId: id,
  });
  return c.json({ patient: serializePatient(row) });
});

// ---- Consultas -----------------------------------------------------------
patientRoutes.get('/:id/sessions', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!(await findPatient(c, user, id))) return c.json({ error: 'not_found' }, 404);
  // Secretary: visibilidade permitida, mas sem dados clínicos.
  const secretary = isSecretary(user);
  if (!secretary) {
    const grantors = await activeGrantors(c, user);
    const patient = await findPatient(c, user, id);
    if (!patient || !hasClinicalAccess(user, patient, grantors)) return c.json({ error: 'forbidden_clinical' }, 403);
  }
  const rows = await getDb(c.env)
    .select()
    .from(sessions)
    .where(and(eq(sessions.patientId, id), eq(sessions.clinicId, user.clinicId)))
    .orderBy(desc(sessions.occurredAt))
    .all();
  const serialize = secretary
    ? (s: SessionRow) => ({ id: s.id, patientId: s.patientId, occurredAt: s.occurredAt, durationMin: s.durationMin, freeNotes: s.freeNotes, createdAt: s.createdAt })
    : serializeSession;
  return c.json({ sessions: rows.map(serialize) });
});

const sessionSchema = z.object({
  occurredAt: z.string().optional(),
  durationMin: z.number().int().min(1).max(600).optional(),
  mood: z.string().optional(),
  emotionalScale: z.number().int().min(1).max(10).optional(),
  topics: z.array(z.string()).optional(),
  objectives: z.string().optional(),
  techniques: z.string().optional(),
  evolution: z.string().optional(),
  nextSteps: z.string().optional(),
  freeNotes: z.string().optional(),
});

patientRoutes.post('/:id/sessions', zValidator('json', sessionSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!(await findPatient(c, user, id))) return c.json({ error: 'not_found' }, 404);
  // Secretary: pode registrar sessão, mas apenas campos não-clínicos.
  const secretary = isSecretary(user);
  if (!secretary) {
    const grantors = await activeGrantors(c, user);
    const patient = await findPatient(c, user, id);
    if (!patient || !hasClinicalAccess(user, patient, grantors)) return c.json({ error: 'forbidden_clinical' }, 403);
  }
  const body = c.req.valid('json');
  const psychologistId =
    user.role === 'psychologist' || user.role === 'owner' ? user.userId : null;
  const row = await getDb(c.env)
    .insert(sessions)
    .values({
      clinicId: user.clinicId,
      patientId: id,
      psychologistId,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      durationMin: body.durationMin ?? null,
      // Campos clínicos: bloqueados para secretária
      mood: secretary ? null : (body.mood ?? null),
      emotionalScale: secretary ? null : (body.emotionalScale ?? null),
      topics: secretary ? null : (body.topics && body.topics.length ? JSON.stringify(body.topics) : null),
      objectives: secretary ? null : (body.objectives ?? null),
      techniques: secretary ? null : (body.techniques ?? null),
      evolution: secretary ? null : (body.evolution ?? null),
      nextSteps: secretary ? null : (body.nextSteps ?? null),
      freeNotes: body.freeNotes ?? null,
    })
    .returning()
    .get();
  await audit(c.env, {
    clinicId: user.clinicId,
    actorUserId: user.userId,
    action: 'create',
    entity: 'session',
    entityId: row.id,
  });

  // Sincronizar com a agenda: marcar agendamento existente como realizado
  // ou criar um novo entry na agenda com status 'done'.
  {
    const targetMs = body.occurredAt ? new Date(body.occurredAt).getTime() : row.occurredAt instanceof Date ? row.occurredAt.getTime() : Number(row.occurredAt);
    const windowMs = 12 * 60 * 60 * 1000; // ±12h
    const candidates = await getDb(c.env)
      .select({ id: appointments.id, startsAt: appointments.startsAt })
      .from(appointments)
      .where(and(
        eq(appointments.patientId, id),
        eq(appointments.clinicId, user.clinicId),
        eq(appointments.status, 'scheduled'),
        gte(appointments.startsAt, new Date(targetMs - windowMs)),
        lte(appointments.startsAt, new Date(targetMs + windowMs)),
      ))
      .all();
    if (candidates.length > 0) {
      // Marca o agendamento mais próximo como realizado
      const closest = candidates.reduce((a, b) => {
        const aMs = a.startsAt instanceof Date ? a.startsAt.getTime() : Number(a.startsAt);
        const bMs = b.startsAt instanceof Date ? b.startsAt.getTime() : Number(b.startsAt);
        return Math.abs(aMs - targetMs) <= Math.abs(bMs - targetMs) ? a : b;
      });
      await getDb(c.env)
        .update(appointments)
        .set({ status: 'done' })
        .where(eq(appointments.id, closest.id));
    } else {
      // Nenhum agendamento encontrado: cria um na agenda já marcado como realizado
      const durMs = (body.durationMin ?? 50) * 60000;
      await getDb(c.env)
        .insert(appointments)
        .values({
          clinicId: user.clinicId,
          patientId: id,
          psychologistId,
          startsAt: new Date(targetMs),
          endsAt: new Date(targetMs + durMs),
          status: 'done',
          notes: null,
        });
    }
  }

  return c.json({ session: serializeSession(row) }, 201);
});

// ---- Editar consulta (psicólogo / owner) ------------------------------------
patientRoutes.patch('/:id/sessions/:sid', blockSecretary, zValidator('json', sessionSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const sid = c.req.param('sid');
  const grantors = await activeGrantors(c, user);
  const patient = await findPatient(c, user, id);
  if (!patient || !hasClinicalAccess(user, patient, grantors)) return c.json({ error: 'forbidden_clinical' }, 403);
  const body = c.req.valid('json');
  const existing = await getDb(c.env)
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sid), eq(sessions.patientId, id), eq(sessions.clinicId, user.clinicId)))
    .get();
  if (!existing) return c.json({ error: 'not_found' }, 404);
  const updates: Record<string, any> = {};
  if (body.occurredAt !== undefined) updates.occurredAt = new Date(body.occurredAt);
  if (body.durationMin !== undefined) updates.durationMin = body.durationMin;
  if (body.mood !== undefined) updates.mood = body.mood;
  if (body.emotionalScale !== undefined) updates.emotionalScale = body.emotionalScale;
  if (body.topics !== undefined) updates.topics = body.topics.length ? JSON.stringify(body.topics) : null;
  if (body.objectives !== undefined) updates.objectives = body.objectives;
  if (body.techniques !== undefined) updates.techniques = body.techniques;
  if (body.evolution !== undefined) updates.evolution = body.evolution;
  if (body.nextSteps !== undefined) updates.nextSteps = body.nextSteps;
  if (body.freeNotes !== undefined) updates.freeNotes = body.freeNotes;
  const row = await getDb(c.env)
    .update(sessions)
    .set(updates)
    .where(eq(sessions.id, sid))
    .returning()
    .get();
  await audit(c.env, { clinicId: user.clinicId, actorUserId: user.userId, action: 'update', entity: 'session', entityId: sid });
  return c.json({ session: serializeSession(row) });
});

// ---- Agendamentos futuros do paciente (para pré-preencher consulta) ----------
patientRoutes.get('/:id/upcoming-appointments', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!(await findPatient(c, user, id))) return c.json({ error: 'not_found' }, 404);
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const rows = await getDb(c.env)
    .select({ id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt, notes: appointments.notes })
    .from(appointments)
    .where(and(
      eq(appointments.patientId, id),
      eq(appointments.clinicId, user.clinicId),
      eq(appointments.status, 'scheduled'),
      gte(appointments.startsAt, now),
      lte(appointments.startsAt, future),
    ))
    .orderBy(asc(appointments.startsAt))
    .all();
  const toMs = (v: unknown) => (v instanceof Date ? v.getTime() : Number(v));
  return c.json({ appointments: rows.map((r) => ({ ...r, startsAt: toMs(r.startsAt), endsAt: toMs(r.endsAt) })) });
});

// ---- Linha do tempo ------------------------------------------------------
// Entradas manuais agora; a IA vai sugerir eventos (status "suggested") na Etapa 2.
patientRoutes.get('/:id/timeline', requireClinicalAccess, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!(await findPatient(c, user, id))) return c.json({ error: 'not_found' }, 404);
  const rows = await getDb(c.env)
    .select()
    .from(timelineEvents)
    .where(and(eq(timelineEvents.patientId, id), eq(timelineEvents.clinicId, user.clinicId)))
    .orderBy(asc(timelineEvents.eventDate))
    .all();
  return c.json({ events: rows });
});

const eventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  eventDate: z.string().optional(),
  year: z.number().int().optional(),
  category: z.string().optional(),
});

patientRoutes.post('/:id/timeline', requireClinicalAccess, zValidator('json', eventSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!(await findPatient(c, user, id))) return c.json({ error: 'not_found' }, 404);
  const body = c.req.valid('json');
  const eventDate = body.eventDate
    ? new Date(body.eventDate)
    : body.year
      ? new Date(Date.UTC(body.year, 0, 1))
      : null;
  const row = await getDb(c.env)
    .insert(timelineEvents)
    .values({
      clinicId: user.clinicId,
      patientId: id,
      title: body.title,
      description: body.description ?? null,
      eventDate,
      category: body.category ?? null,
      status: 'confirmed',
      source: 'manual',
    })
    .returning()
    .get();
  await audit(c.env, {
    clinicId: user.clinicId,
    actorUserId: user.userId,
    action: 'create',
    entity: 'timeline_event',
    entityId: row.id,
  });
  return c.json({ event: row }, 201);
});

patientRoutes.delete('/:id/timeline/:eventId', requireClinicalAccess, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!(await findPatient(c, user, id))) return c.json({ error: 'not_found' }, 404);
  await getDb(c.env)
    .delete(timelineEvents)
    .where(
      and(
        eq(timelineEvents.id, c.req.param('eventId')),
        eq(timelineEvents.clinicId, user.clinicId),
      ),
    );
  return c.json({ ok: true });
});

// ---- Ana Luiza: sugestões de perguntas para a próxima sessão ----------------
// Usa Workers AI. Gera de forma leve e cacheia em KV por paciente para não
// reprocessar a cada abertura da aba (mais rápido e barato). A IA observa e
// sugere — nunca diagnostica.

function calcAge(birthMs?: number | null): number | null {
  if (!birthMs) return null;
  const b = new Date(birthMs);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

function buildPatientContext(patient: any, sess: any[], events: any[]): string {
  const p = patient.profile ?? {};
  const parts: string[] = [];
  parts.push(`Paciente: ${patient.fullName}.`);

  // Dados pessoais / identificação
  const pers = p.personal ?? {};
  const age = calcAge(patient.birthDate);
  const idBits: string[] = [];
  if (age != null) idBits.push(`${age} anos`);
  if (patient.birthDate) idBits.push(`nascido(a) em ${new Date(patient.birthDate).toLocaleDateString('pt-BR')}`);
  if (patient.socialName) idBits.push(`nome social: ${patient.socialName}`);
  if (pers.sex) idBits.push(`sexo: ${pers.sex}`);
  if (pers.gender) idBits.push(`gênero: ${pers.gender}`);
  if (pers.maritalStatus) idBits.push(`estado civil: ${pers.maritalStatus}`);
  if (pers.profession) idBits.push(`profissão: ${pers.profession}`);
  if (pers.company) idBits.push(`empresa: ${pers.company}`);
  if (pers.education) idBits.push(`escolaridade: ${pers.education}`);
  if (pers.city || pers.state) idBits.push(`cidade: ${[pers.city, pers.state].filter(Boolean).join('/')}`);
  if (patient.email) idBits.push(`e-mail: ${patient.email}`);
  if (patient.phone) idBits.push(`telefone: ${patient.phone}`);
  if (idBits.length) parts.push(`Dados pessoais: ${idBits.join('; ')}.`);

  // Quadro clínico
  const cl = p.clinical ?? {};
  if (cl.complaint) parts.push(`Queixa principal: ${cl.complaint}`);
  if (cl.history) parts.push(`Histórico: ${cl.history}`);
  if (cl.goals) parts.push(`Objetivos do processo: ${cl.goals}`);
  if (cl.suffering) parts.push(`Nível de sofrimento: ${cl.suffering}`);
  if (cl.psychiatric) parts.push(`Acompanhamento psiquiátrico: ${cl.psychiatric}`);
  if (cl.priorDiagnoses) parts.push(`Diagnósticos anteriores: ${cl.priorDiagnoses}`);
  if (cl.priorTreatments) parts.push(`Tratamentos anteriores: ${cl.priorTreatments}`);

  // Saúde
  const h = p.health ?? {};
  const flags: string[] = [];
  if (h.depression) flags.push('depressão');
  if (h.anxiety) flags.push('ansiedade');
  if (h.tag) flags.push('TAG');
  if (h.tdah) flags.push('TDAH');
  if (h.bipolar) flags.push('bipolaridade');
  if (flags.length) parts.push(`Sinalizações de saúde marcadas na ficha: ${flags.join(', ')}.`);
  if (h.medications) parts.push(`Medicações: ${h.medications}`);
  if (h.diseases) parts.push(`Doenças: ${h.diseases}`);
  if (h.surgeries) parts.push(`Cirurgias: ${h.surgeries}`);
  if (h.hospitalizations) parts.push(`Internações: ${h.hospitalizations}`);
  if (h.familyHistory) parts.push(`Histórico familiar de saúde: ${h.familyHistory}`);

  // Estilo de vida
  const life = p.lifestyle ?? {};
  const lifeBits: string[] = [];
  for (const [k, label] of [
    ['sports', 'esportes'], ['gym', 'academia'], ['diet', 'alimentação'], ['sleep', 'sono'],
    ['alcohol', 'álcool'], ['smoking', 'tabagismo'], ['drugs', 'drogas'],
    ['religion', 'religião'], ['spirituality', 'espiritualidade'],
  ] as [string, string][]) {
    if (life[k]) lifeBits.push(`${label}: ${life[k]}`);
  }
  if (lifeBits.length) parts.push(`Estilo de vida: ${lifeBits.join('; ')}.`);

  // Interesses
  const it = p.interests ?? {};
  const itBits: string[] = [];
  for (const [k, label] of [
    ['books', 'livros'], ['movies', 'filmes'], ['music', 'música'], ['games', 'jogos'],
    ['social', 'redes sociais'], ['tech', 'tecnologia'], ['hobbies', 'hobbies'],
  ] as [string, string][]) {
    if (it[k]) itBits.push(`${label}: ${it[k]}`);
  }
  if (itBits.length) parts.push(`Interesses: ${itBits.join('; ')}.`);

  // Personalidade
  const per = p.personality ?? {};
  const traits: string[] = [];
  for (const [k, label] of [
    ['introvert', 'introvertido'], ['extrovert', 'extrovertido'], ['communicative', 'comunicativo'],
    ['reserved', 'reservado'], ['impulsive', 'impulsivo'], ['organized', 'organizado'], ['creative', 'criativo'],
  ] as [string, string][]) {
    if (per[k]) traits.push(label);
  }
  if (traits.length) parts.push(`Traços de personalidade: ${traits.join(', ')}.`);
  if (per.notes) parts.push(`Observações de personalidade: ${per.notes}`);

  // Relacionamentos
  const rel = p.relationships ?? {};
  const relBits: string[] = [];
  if (rel.family) relBits.push(`família: ${rel.family}`);
  if (rel.friends) relBits.push(`amigos: ${rel.friends}`);
  if (rel.work) relBits.push(`trabalho: ${rel.work}`);
  if (rel.romantic) relBits.push(`vida amorosa: ${rel.romantic}`);
  if (relBits.length) parts.push(`Relacionamentos: ${relBits.join('; ')}.`);

  // Situação financeira
  const fin = p.financial ?? {};
  const finBits: string[] = [];
  if (fin.situation) finBits.push(`situação: ${fin.situation}`);
  if (fin.debt) finBits.push(`endividamento: ${fin.debt}`);
  if (fin.work) finBits.push(`vínculo de trabalho: ${fin.work}`);
  if (fin.income) finBits.push(`renda: ${fin.income}`);
  if (finBits.length) parts.push(`Situação financeira: ${finBits.join('; ')}.`);

  // Família
  const fam = p.family ?? {};
  const famBits: string[] = [];
  if (fam.father?.name) famBits.push(`pai: ${fam.father.name}${fam.father.alive ? ` (vivo: ${fam.father.alive})` : ''}`);
  if (fam.mother?.name) famBits.push(`mãe: ${fam.mother.name}${fam.mother.alive ? ` (viva: ${fam.mother.alive})` : ''}`);
  if (fam.siblings) famBits.push(`irmãos: ${fam.siblings}`);
  if (fam.children) famBits.push(`filhos: ${fam.children}`);
  if (fam.spouse) famBits.push(`cônjuge/parceiro: ${fam.spouse}`);
  if (famBits.length) parts.push(`Família: ${famBits.join('; ')}.`);

  // Consultas (todas). A mais recente vem marcada — é dela que sai a continuidade.
  if (sess.length) {
    parts.push(`Consultas registradas (${sess.length}, da mais nova para a mais antiga):`);
    sess.forEach((s, i) => {
      const bits: string[] = [];
      if (s.occurredAt) bits.push(new Date(s.occurredAt).toLocaleDateString('pt-BR'));
      if (s.mood) bits.push(`humor: ${s.mood}`);
      if (typeof s.emotionalScale === 'number') bits.push(`escala: ${s.emotionalScale}/10`);
      if (s.topics?.length) bits.push(`assuntos: ${s.topics.join(', ')}`);
      if (s.objectives) bits.push(`objetivos da sessão: ${s.objectives}`);
      if (s.techniques) bits.push(`técnicas aplicadas: ${s.techniques}`);
      if (s.evolution) bits.push(`evolução: ${s.evolution}`);
      if (s.nextSteps) bits.push(`próximos passos combinados: ${s.nextSteps}`);
      if (s.freeNotes) bits.push(`notas do psicólogo: ${s.freeNotes}`);
      const marca = i === 0 ? '- [ÚLTIMA CONSULTA] ' : '- ';
      parts.push(`${marca}${bits.join('; ') || 'sem detalhes'}`);
    });
  }

  // Linha do tempo (completa)
  if (events.length) {
    parts.push('Linha do tempo:');
    for (const e of events) {
      const d = e.eventDate ? new Date(e.eventDate).toLocaleDateString('pt-BR') : '';
      parts.push(`- ${d ? d + ': ' : ''}${e.title}${e.description ? ` — ${e.description}` : ''}`);
    }
  }

  return parts.join('\n');
}

patientRoutes.get('/:id/ai-questions', requireClinicalAccess, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const patientRow = await findPatient(c, user, id);
  if (!patientRow) return c.json({ error: 'not_found' }, 404);

  const db = getDb(c.env);
  const profile = patientRow.profile ? JSON.parse(patientRow.profile) : {};
  const patient = { fullName: patientRow.fullName, birthDate: patientRow.birthDate, profile };
  const sessRows = await db
    .select().from(sessions)
    .where(and(eq(sessions.patientId, id), eq(sessions.clinicId, user.clinicId)))
    .orderBy(desc(sessions.occurredAt))
    .all();
  const sess = sessRows.map(serializeSession);
  const eventRows = await db
    .select().from(timelineEvents)
    .where(and(eq(timelineEvents.patientId, id), eq(timelineEvents.clinicId, user.clinicId)))
    .orderBy(asc(timelineEvents.eventDate))
    .all();

  // Cache por paciente + assinatura simples (nº de consultas + data da última).
  // O sufixo v2 invalida o cache antigo quando o prompt muda.
  const sig = `${sess.length}:${sess[0]?.occurredAt ?? 0}`;
  const cacheKey = `ai-questions:v2:${id}:${sig}`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) {
    return c.json({ questions: JSON.parse(cached), cached: true });
  }

  // Sem dados suficientes: não chama a IA.
  if (sess.length === 0 && !patient.profile?.clinical?.complaint) {
    return c.json({ questions: [], empty: true });
  }

  const context = buildPatientContext(patient, sess, eventRows);
  const system =
    ANA_PERSONA +
    `

TAREFA: gere de 10 a 16 perguntas ABERTAS que o psicólogo pode fazer na PRÓXIMA sessão.

REGRA CENTRAL — cada pergunta precisa nascer de um dado CONCRETO do prontuário:
uma fala registrada, um objetivo terapêutico definido, uma técnica ou tarefa combinada,
um evento da linha do tempo, uma variação de humor/escala entre consultas, ou algo que
ficou em aberto nos próximos passos. Se um dado não está nos registros, não invente.

DISTRIBUA as perguntas entre estes ângulos (não rotule, apenas varie):
1. Continuidade — retoma algo específico dito na última consulta.
2. Tarefa combinada — investiga o que foi acordado como próximo passo e como foi na prática.
3. Padrão — conecta dois ou mais momentos diferentes do histórico.
4. Objetivo terapêutico — mede percepção de avanço no que foi definido como meta.
5. Recurso e exceção — momentos em que a dificuldade não apareceu, ou o que ajudou.
6. Contexto de vida — relações, rotina, trabalho, sono, corpo, quando registrados.

CRITÉRIOS DE QUALIDADE:
- Comece por "Como", "O que", "Quando", "De que forma", "Me conta", "O que mudou".
- Nada de sim/não, nada de pergunta dupla, nada de sugerir diagnóstico ou conduta.
- Use os termos que o próprio paciente usou, quando estiverem registrados.
- Evite fórmulas genéricas do tipo "Como você tem lidado com X desde a última sessão?" —
  ancore em detalhe: o quê exatamente, quando, com quem, em que situação.
- Cada pergunta deve ser específica o bastante para não servir a outro paciente.

FORMATO: uma pergunta por linha, começando com "- ". Nada além das perguntas.`;

  function parseQuestions(text: string): string[] {
    const out: string[] = [];
    // 1) tenta array JSON
    const s = text.indexOf('[');
    const e = text.lastIndexOf(']');
    if (s !== -1 && e !== -1 && e > s) {
      try {
        const arr = JSON.parse(text.slice(s, e + 1));
        if (Array.isArray(arr)) {
          for (const q of arr) if (typeof q === 'string' && q.trim()) out.push(q.trim());
        }
      } catch { /* cai para o modo linha */ }
    }
    // 2) fallback: linhas que parecem perguntas (com traço, número ou "?")
    if (out.length === 0) {
      for (let line of text.split('\n')) {
        line = line.replace(/^\s*[-*\d.)\]]+\s*/, '').replace(/^["']|["']$/g, '').trim();
        if (line.length > 8 && (line.includes('?') || out.length < 6)) out.push(line);
      }
    }
    return out.filter((q) => q.length > 8).slice(0, 6);
  }

  let questions: string[] = [];
  let aiDetail = '';
  try {
    console.log('[ana] chamando Workers AI para paciente', id);
    const res: any = await c.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: context },
      ],
      max_tokens: 1200,
      temperature: 0.7,
    });
    const text: string = (res?.response ?? '').toString().trim();
    console.log('[ana] resposta da IA:', text.slice(0, 200));
    aiDetail = text.slice(0, 300);
    questions = parseQuestions(text);
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('[ana] ERRO na chamada da IA:', msg);
    return c.json({ error: 'ai_failed' }, 502);
  }

  if (questions.length === 0) {
    // A IA respondeu, mas não conseguimos extrair perguntas.
    return c.json({ questions: [] });
  }

  if (questions.length) {
    // Cache por 7 dias (renova sozinho quando surgir nova consulta).
    await c.env.CACHE.put(cacheKey, JSON.stringify(questions), { expirationTtl: 604800 });
  }
  return c.json({ questions });
});

// ---- Lixeira (exclusão lógica) ---------------------------------------------

// Mover para a lixeira (não apaga; marca deletedAt). Consultas e timeline ficam.
// ---- Biblioteca de arquivos do paciente (armazenados no R2) --------------
const FILE_CATEGORIES = ['receituario', 'guia', 'laudo', 'outros'];
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB (limite de sanidade)

// MIME types permitidos para upload — lista de permissão (allowlist).
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

// Sanitiza o nome do arquivo: remove caminhos, caracteres especiais perigosos.
function sanitizeFileName(raw: string): string {
  // Remove path separators and null bytes; keep only safe characters.
  return raw
    .replace(/[\\/\0]/g, '')
    .replace(/\.\./g, '')
    .replace(/[^\w.\-\s()À-ɏ]/g, '_')
    .trim()
    .slice(0, 200) || 'arquivo';
}

// Nível de acesso à biblioteca de um paciente:
//  'full'  -> psicólogo responsável ou compartilhamento ativo (todas as categorias)
//  'guia'  -> secretária (apenas guias — recepção/convênio)
//  'none'  -> sem acesso
async function bibliotecaLevel(c: any, user: AuthUser, patient: { psychologistId: string | null }): Promise<'full' | 'guia' | 'none'> {
  const grantors = await activeGrantors(c, user);
  if (hasClinicalAccess(user, patient, grantors)) return 'full';
  if (user.role === 'secretary') return 'guia';
  return 'none';
}

patientRoutes.get('/:id/files', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const patient = await findPatient(c, user, id);
  if (!patient) return c.json({ error: 'not_found' }, 404);
  const level = await bibliotecaLevel(c, user, patient);
  if (level === 'none') return c.json({ error: 'forbidden_clinical' }, 403);

  const where = level === 'guia'
    ? and(eq(patientFiles.patientId, id), eq(patientFiles.category, 'guia'))
    : eq(patientFiles.patientId, id);
  const rows = await getDb(c.env)
    .select({ id: patientFiles.id, category: patientFiles.category, fileName: patientFiles.fileName, mime: patientFiles.mime, size: patientFiles.size, createdAt: patientFiles.createdAt })
    .from(patientFiles)
    .where(where)
    .orderBy(desc(patientFiles.createdAt))
    .all();
  return c.json({ files: rows, level });
});

// Upload: o arquivo vai no CORPO (binário); metadados na query string.
patientRoutes.post('/:id/files', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const patient = await findPatient(c, user, id);
  if (!patient) return c.json({ error: 'not_found' }, 404);
  const level = await bibliotecaLevel(c, user, patient);
  if (level === 'none') return c.json({ error: 'forbidden_clinical' }, 403);

  const catRaw = c.req.query('category') || 'outros';
  const category = (FILE_CATEGORIES.includes(catRaw) ? catRaw : 'outros') as 'receituario' | 'guia' | 'laudo' | 'outros';
  // Secretária só pode enviar guias.
  if (level === 'guia' && category !== 'guia') return c.json({ error: 'forbidden_category' }, 403);
  const fileName = sanitizeFileName(c.req.query('fileName') || 'arquivo');
  const mimeRaw = (c.req.query('mime') || '').trim().toLowerCase();
  const mime = ALLOWED_MIME_TYPES.has(mimeRaw) ? mimeRaw : null;
  if (!mime) return c.json({ error: 'invalid_mime_type' }, 415);

  const buf = await c.req.arrayBuffer();
  if (!buf || buf.byteLength === 0) return c.json({ error: 'empty_file' }, 400);
  if (buf.byteLength > MAX_FILE_BYTES) return c.json({ error: 'file_too_large' }, 413);

  const key = `${user.clinicId}/${id}/${crypto.randomUUID()}`;
  await c.env.DOCS.put(key, buf, { httpMetadata: { contentType: mime } });

  const row = await getDb(c.env)
    .insert(patientFiles)
    .values({ clinicId: user.clinicId, patientId: id, category, fileName, mime, size: buf.byteLength, r2Key: key, uploadedBy: user.userId })
    .returning({ id: patientFiles.id })
    .get();
  await audit(c.env, { clinicId: user.clinicId, actorUserId: user.userId, action: 'file_uploaded', entity: 'patient_file', entityId: row.id });
  return c.json({ ok: true, id: row.id });
});

// ---- Ana Luiza: leitura de documento e proposta de preenchimento -----------
// O arquivo vai no CORPO (binário); metadados na query string, igual ao upload.
// A Ana lê e PROPÕE — nada é gravado aqui. Quem grava é /ana-apply.
patientRoutes.post('/:id/ana-extract', requireClinicalAccess, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const fileName = sanitizeFileName(c.req.query('fileName') || 'documento');
  const mimeRaw = (c.req.query('mime') || '').trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeRaw)) return c.json({ error: 'invalid_mime_type' }, 415);

  const buf = await c.req.arrayBuffer();
  if (!buf || buf.byteLength === 0) return c.json({ error: 'empty_file' }, 400);
  if (buf.byteLength > MAX_FILE_BYTES) return c.json({ error: 'file_too_large' }, 413);

  // 1) Arquiva na biblioteca do paciente (mantém rastro de quem enviou).
  let fileId: string | null = null;
  try {
    const key = `${user.clinicId}/${id}/${crypto.randomUUID()}`;
    await c.env.DOCS.put(key, buf, { httpMetadata: { contentType: mimeRaw } });
    const saved = await getDb(c.env)
      .insert(patientFiles)
      .values({
        clinicId: user.clinicId, patientId: id, category: 'outros', fileName,
        mime: mimeRaw, size: buf.byteLength, r2Key: key, uploadedBy: user.userId,
      })
      .returning({ id: patientFiles.id })
      .get();
    fileId = saved.id;
    await audit(c.env, { clinicId: user.clinicId, actorUserId: user.userId, action: 'file_uploaded', entity: 'patient_file', entityId: saved.id });
  } catch (err) {
    console.error('[ana-extract] falha ao arquivar:', err instanceof Error ? err.message : String(err));
    // Segue mesmo assim: a leitura é o que importa para o psicólogo.
  }

  // 2) Converte o documento em markdown (PDF, Word, planilha, imagem).
  let markdown = '';
  try {
    const conv: any = await (c.env.AI as any).toMarkdown([
      { name: fileName, blob: new Blob([buf], { type: mimeRaw }) },
    ]);
    const first = Array.isArray(conv) ? conv[0] : conv;
    if (first?.format === 'error') {
      console.error('[ana-extract] conversao falhou:', first.error);
      return c.json({ error: 'unreadable_document', fileId }, 422);
    }
    markdown = (first?.data ?? '').toString().trim();
  } catch (err) {
    console.error('[ana-extract] toMarkdown falhou:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'unreadable_document', fileId }, 422);
  }
  if (markdown.length < 20) return c.json({ error: 'no_text_found', fileId }, 422);

  // Corta documentos muito longos para caber no contexto do modelo.
  const MAX_DOC_CHARS = 24000;
  const truncated = markdown.length > MAX_DOC_CHARS;
  const docText = truncated ? markdown.slice(0, MAX_DOC_CHARS) : markdown;

  // 3) Pede a extração estruturada, informando o que já existe na ficha.
  const patientRow = await findPatient(c, user, id);
  const existing = patientRow?.profile ? JSON.parse(patientRow.profile) : {};
  const preenchidos = Object.entries(existing)
    .flatMap(([grupo, val]) =>
      val && typeof val === 'object'
        ? Object.entries(val as Record<string, unknown>).filter(([, v]) => v).map(([k]) => `${grupo}.${k}`)
        : [],
    )
    .join(', ');

  const userPrompt =
    (preenchidos ? `CAMPOS JÁ PREENCHIDOS NA FICHA (só proponha se o documento trouxer algo diferente ou mais completo): ${preenchidos}\n\n` : '') +
    `DOCUMENTO "${fileName}"${truncated ? ' (trecho inicial)' : ''}:\n\n${docText}`;

  let raw = '';
  try {
    const res: any = await c.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    });
    raw = (res?.response ?? '').toString();
  } catch (err) {
    console.error('[ana-extract] IA falhou:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'ai_failed', fileId }, 502);
  }

  const parsed = parseJsonObject(raw);
  if (!parsed) return c.json({ error: 'unparsable_response', fileId }, 502);

  const check = proposalSchema.safeParse(parsed);
  if (!check.success) return c.json({ error: 'invalid_proposal', fileId }, 502);

  const proposal = pruneEmpty(check.data) ?? {};
  await audit(c.env, { clinicId: user.clinicId, actorUserId: user.userId, action: 'ana_extract', entity: 'patient', entityId: id, metadata: { fileName, truncated } });

  return c.json({ fileId, fileName, truncated, proposal });
});

// Aplica no prontuário apenas o que o psicólogo confirmou na revisão.
const applySchema = z.object({
  profile: z.record(z.record(z.union([z.string(), z.number(), z.boolean()]))).optional(),
  session: sessionSchema.optional(),
  timeline: z.array(eventSchema).max(20).optional(),
});

patientRoutes.post('/:id/ana-apply', requireClinicalAccess, zValidator('json', applySchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { profile, session, timeline } = c.req.valid('json');
  const db = getDb(c.env);

  const patientRow = await findPatient(c, user, id);
  if (!patientRow) return c.json({ error: 'not_found' }, 404);

  const applied = { profileFields: 0, session: false, timeline: 0 };

  // 1) Ficha: mescla por grupo, preservando o que não foi enviado.
  if (profile && Object.keys(profile).length) {
    const current = patientRow.profile ? JSON.parse(patientRow.profile) : {};
    for (const [grupo, campos] of Object.entries(profile)) {
      current[grupo] = { ...(current[grupo] ?? {}), ...campos };
      applied.profileFields += Object.keys(campos).length;
    }
    const serialized = JSON.stringify(current);
    if (serialized.length > MAX_PROFILE_JSON_BYTES) return c.json({ error: 'profile_too_large' }, 413);
    await db.update(patients).set({ profile: serialized })
      .where(and(eq(patients.id, id), eq(patients.clinicId, user.clinicId)));
  }

  // 2) Consulta extraída do documento.
  if (session && Object.keys(session).length) {
    const occurredAt = session.occurredAt ? new Date(session.occurredAt) : new Date();
    await db.insert(sessions).values({
      clinicId: user.clinicId,
      patientId: id,
      psychologistId: user.userId,
      occurredAt: isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      durationMin: session.durationMin ?? null,
      mood: session.mood ?? null,
      emotionalScale: session.emotionalScale ?? null,
      topics: session.topics?.length ? JSON.stringify(session.topics) : null,
      objectives: session.objectives ?? null,
      techniques: session.techniques ?? null,
      evolution: session.evolution ?? null,
      nextSteps: session.nextSteps ?? null,
      freeNotes: session.freeNotes ?? null,
    });
    applied.session = true;
  }

  // 3) Linha do tempo: entra como sugestão, para confirmação posterior.
  if (timeline?.length) {
    for (const ev of timeline) {
      const d = ev.eventDate ? new Date(ev.eventDate) : ev.year ? new Date(ev.year, 0, 1) : null;
      await db.insert(timelineEvents).values({
        clinicId: user.clinicId,
        patientId: id,
        title: ev.title,
        description: ev.description ?? null,
        eventDate: d && !isNaN(d.getTime()) ? d : null,
        category: ev.category ?? null,
        status: 'suggested',
        source: 'ai',
      });
      applied.timeline++;
    }
  }

  await audit(c.env, { clinicId: user.clinicId, actorUserId: user.userId, action: 'ana_apply', entity: 'patient', entityId: id, metadata: applied });
  return c.json({ ok: true, applied });
});

// Download: transmite os bytes direto do R2.
patientRoutes.get('/:id/files/:fileId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const fileId = c.req.param('fileId');
  const patient = await findPatient(c, user, id);
  if (!patient) return c.json({ error: 'not_found' }, 404);
  const level = await bibliotecaLevel(c, user, patient);
  if (level === 'none') return c.json({ error: 'forbidden_clinical' }, 403);

  const row = await getDb(c.env).select().from(patientFiles).where(and(eq(patientFiles.id, fileId), eq(patientFiles.patientId, id))).get();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (level === 'guia' && row.category !== 'guia') return c.json({ error: 'forbidden_category' }, 403);
  const obj = await c.env.DOCS.get(row.r2Key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': row.mime || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
    },
  });
});

patientRoutes.delete('/:id/files/:fileId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const fileId = c.req.param('fileId');
  const patient = await findPatient(c, user, id);
  if (!patient) return c.json({ error: 'not_found' }, 404);
  const level = await bibliotecaLevel(c, user, patient);
  if (level === 'none') return c.json({ error: 'forbidden_clinical' }, 403);

  const row = await getDb(c.env).select({ r2Key: patientFiles.r2Key, category: patientFiles.category }).from(patientFiles).where(and(eq(patientFiles.id, fileId), eq(patientFiles.patientId, id))).get();
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (level === 'guia' && row.category !== 'guia') return c.json({ error: 'forbidden_category' }, 403);
  try { await c.env.DOCS.delete(row.r2Key); } catch { /* ignora */ }
  await getDb(c.env).delete(patientFiles).where(and(eq(patientFiles.id, fileId), eq(patientFiles.patientId, id)));
  await audit(c.env, { clinicId: user.clinicId, actorUserId: user.userId, action: 'file_deleted', entity: 'patient_file', entityId: fileId });
  return c.json({ ok: true });
});

patientRoutes.delete('/:id', blockSecretary, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await findPatient(c, user, id);
  if (!row) return c.json({ error: 'not_found' }, 404);

  await getDb(c.env)
    .update(patients)
    .set({ deletedAt: new Date() })
    .where(and(eq(patients.id, id), eq(patients.clinicId, user.clinicId)));

  await audit(c.env, {
    clinicId: user.clinicId,
    actorUserId: user.userId,
    action: 'trash',
    entity: 'patient',
    entityId: id,
  });
  return c.json({ ok: true });
});

// Restaurar da lixeira.
patientRoutes.post('/:id/restore', blockSecretary, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await findPatient(c, user, id);
  if (!row) return c.json({ error: 'not_found' }, 404);

  await getDb(c.env)
    .update(patients)
    .set({ deletedAt: null })
    .where(and(eq(patients.id, id), eq(patients.clinicId, user.clinicId)));

  await audit(c.env, {
    clinicId: user.clinicId,
    actorUserId: user.userId,
    action: 'restore',
    entity: 'patient',
    entityId: id,
  });
  return c.json({ ok: true });
});

// Excluir DEFINITIVAMENTE (só faz sentido para quem já está na lixeira).
patientRoutes.delete('/:id/permanent', blockSecretary, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await findPatient(c, user, id);
  if (!row) return c.json({ error: 'not_found' }, 404);

  const db = getDb(c.env);

  // C2: Apagar blobs do R2 antes de remover as linhas (evita órfãos).
  const r2Files = await db
    .select({ r2Key: patientFiles.r2Key })
    .from(patientFiles)
    .where(eq(patientFiles.patientId, id))
    .all();
  await Promise.allSettled(r2Files.map((f) => c.env.DOCS.delete(f.r2Key)));
  await db.delete(patientFiles).where(eq(patientFiles.patientId, id));

  await db.delete(timelineEvents).where(eq(timelineEvents.patientId, id));
  await db.delete(sessions).where(eq(sessions.patientId, id));
  await db.delete(patients).where(and(eq(patients.id, id), eq(patients.clinicId, user.clinicId)));

  await audit(c.env, {
    clinicId: user.clinicId,
    actorUserId: user.userId,
    action: 'delete',
    entity: 'patient',
    entityId: id,
  });
  return c.json({ ok: true });
});

// ---- Ação de agendamento proposta pela Ana ---------------------------------
// A Ana emite <<<AGENDAR>>>{...}<<<FIM>>> no texto. Aqui o bloco é retirado da
// resposta, o paciente é resolvido no banco e a proposta volta para a tela.
// Nada é gravado: quem cria a consulta é POST /appointments, após confirmação.
type AcaoAgendar = {
  type: 'schedule';
  patientId: string;
  patientName: string;
  patientEmail: string | null;
  startsAt: number;
  endsAt: number;
  durationMin: number;
  notes: string;
  // Consultas do psicólogo que colidem com o horário proposto.
  conflicts: { patientName: string | null; startsAt: number; endsAt: number }[];
};

// Agenda das próximas semanas, em texto, para a Ana responder perguntas como
// "quais horários eu tenho no dia 8?" sem precisar de uma segunda chamada.
async function agendaResumo(c: any, user: AuthUser): Promise<string> {
  const agora = Date.now();
  const ate = agora + 45 * 86400000;
  const rows = await getDb(c.env)
    .select({
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      patientName: patients.fullName,
    })
    .from(appointments)
    .leftJoin(patients, eq(patients.id, appointments.patientId))
    .where(and(
      eq(appointments.clinicId, user.clinicId),
      eq(appointments.psychologistId, user.userId),
      gte(appointments.startsAt, new Date(agora - 86400000)),
      lte(appointments.startsAt, new Date(ate)),
    ))
    .all();

  const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Number(v));
  const ativos = rows.filter((r) => r.status !== 'canceled').sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
  if (!ativos.length) {
    return '\n\nAGENDA DO PSICÓLOGO (próximos 45 dias): nenhuma consulta marcada.';
  }

  const linhas = ativos.slice(0, 80).map((r) => {
    const d = new Date(ms(r.startsAt));
    const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' });
    const hi = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    const hf = new Date(ms(r.endsAt)).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    return `- ${dia} ${hi}–${hf} · ${r.patientName ?? 'paciente'}`;
  });

  return (
    '\n\nAGENDA DO PSICÓLOGO (próximos 45 dias, fuso de Brasília) — use para responder ' +
    'sobre disponibilidade. O expediente padrão é de segunda a sexta, das 8h às 19h; ' +
    'considere livre todo horário do expediente que não estiver nesta lista:\n' +
    linhas.join('\n')
  );
}

type AcaoLembrete = {
  type: 'remind';
  appointmentId: string;
  patientName: string;
  patientEmail: string;
  startsAt: number;
  durationMin: number;
};

type AcaoAna = AcaoAgendar | AcaoLembrete;

const BLOCO_AGENDAR = /<<<AGENDAR>>>([\s\S]*?)<<<FIM>>>/;
const BLOCO_LEMBRETE = /<<<LEMBRETE>>>([\s\S]*?)<<<FIM>>>/;

// Resolve o pedido de lembrete numa consulta concreta do paciente citado.
async function extrairLembrete(
  c: any,
  user: AuthUser,
  resposta: string,
  patientIdAberto?: string,
): Promise<{ texto: string; acao: AcaoLembrete | null }> {
  const m = resposta.match(BLOCO_LEMBRETE);
  const texto = resposta.replace(/<<<LEMBRETE>>>[\s\S]*?(<<<FIM>>>|$)/, '').trim();
  if (!m) return { texto: resposta.trim(), acao: null };

  let dados: any;
  try {
    dados = JSON.parse(m[1].trim());
  } catch {
    return { texto, acao: null };
  }

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const nome = norm(String(dados?.paciente ?? ''));
  const vis = visibilityFilter(user);
  const lista = await getDb(c.env)
    .select({ id: patients.id, fullName: patients.fullName, email: patients.email })
    .from(patients)
    .where(and(eq(patients.clinicId, user.clinicId), isNull(patients.deletedAt), vis))
    .limit(300)
    .all();

  let alvo = nome
    ? lista.find((p) => norm(p.fullName) === nome) ??
      lista.find((p) => norm(p.fullName).includes(nome) || nome.includes(norm(p.fullName)))
    : undefined;
  if (!alvo && patientIdAberto) alvo = lista.find((p) => p.id === patientIdAberto);
  if (!alvo) {
    return { texto: `${texto}\n\n(Não localizei esse paciente no cadastro.)`.trim(), acao: null };
  }
  if (!alvo.email) {
    return {
      texto: `${texto}\n\n(${alvo.fullName} não tem e-mail no cadastro, então não consigo enviar o lembrete.)`.trim(),
      acao: null,
    };
  }

  // Consulta alvo: a do dia informado ou a próxima marcada.
  const data = String(dados?.data ?? '').trim();
  const temData = /^\d{4}-\d{2}-\d{2}$/.test(data);
  const de = temData ? new Date(`${data}T00:00:00-03:00`).getTime() : Date.now();
  const ate = temData ? de + 86400000 : de + 180 * 86400000;

  const candidatas = await getDb(c.env)
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
    })
    .from(appointments)
    .where(and(
      eq(appointments.clinicId, user.clinicId),
      eq(appointments.patientId, alvo.id),
      gte(appointments.startsAt, new Date(de)),
      lte(appointments.startsAt, new Date(ate)),
    ))
    .all();

  const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Number(v));
  const escolhida = candidatas
    .filter((a) => a.status !== 'canceled')
    .sort((a, b) => ms(a.startsAt) - ms(b.startsAt))[0];

  if (!escolhida) {
    return {
      texto: `${texto}\n\n(Não encontrei consulta marcada para ${alvo.fullName}${temData ? ' nesse dia' : ''}.)`.trim(),
      acao: null,
    };
  }

  return {
    texto,
    acao: {
      type: 'remind',
      appointmentId: escolhida.id,
      patientName: alvo.fullName,
      patientEmail: alvo.email,
      startsAt: ms(escolhida.startsAt),
      durationMin: Math.round((ms(escolhida.endsAt) - ms(escolhida.startsAt)) / 60000),
    },
  };
}

async function extrairAgendamento(
  c: any,
  user: AuthUser,
  resposta: string,
  patientIdAberto?: string,
): Promise<{ texto: string; acao: AcaoAgendar | null }> {
  const m = resposta.match(BLOCO_AGENDAR);
  // Remove o bloco do texto mesmo se ele estiver malformado — o psicólogo
  // nunca deve ver a marcação interna.
  const texto = resposta.replace(/<<<AGENDAR>>>[\s\S]*?(<<<FIM>>>|$)/, '').trim();
  if (!m) return { texto: resposta.trim(), acao: null };

  let dados: any;
  try {
    dados = JSON.parse(m[1].trim());
  } catch {
    return { texto, acao: null };
  }

  const data = String(dados?.data ?? '').trim();
  const hora = String(dados?.hora ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) {
    return { texto, acao: null };
  }

  // Brasília é UTC-3 o ano todo (sem horário de verão desde 2019).
  const inicio = new Date(`${data}T${hora}:00-03:00`);
  if (isNaN(inicio.getTime())) return { texto, acao: null };

  const duracao = Number.isFinite(dados?.duracao)
    ? Math.min(Math.max(Number(dados.duracao), 10), 480)
    : 50;

  // Resolve o paciente: nome citado pela Ana ou o que está aberto na tela.
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const nome = norm(String(dados?.paciente ?? ''));
  const vis = visibilityFilter(user);
  const lista = await getDb(c.env)
    .select({ id: patients.id, fullName: patients.fullName, email: patients.email })
    .from(patients)
    .where(and(eq(patients.clinicId, user.clinicId), isNull(patients.deletedAt), vis))
    .limit(300)
    .all();

  let alvo = nome
    ? lista.find((p) => norm(p.fullName) === nome) ??
      lista.find((p) => norm(p.fullName).includes(nome) || nome.includes(norm(p.fullName)))
    : undefined;
  if (!alvo && patientIdAberto) alvo = lista.find((p) => p.id === patientIdAberto);
  if (!alvo) {
    return {
      texto: `${texto}\n\n(Não localizei esse paciente no cadastro, então não montei a proposta de agendamento.)`.trim(),
      acao: null,
    };
  }

  const inicioMs = inicio.getTime();
  const fimMs = inicioMs + duracao * 60000;

  // Choque de horário: qualquer consulta ativa do psicólogo que se sobreponha.
  const doDia = await getDb(c.env)
    .select({
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      patientName: patients.fullName,
    })
    .from(appointments)
    .leftJoin(patients, eq(patients.id, appointments.patientId))
    .where(and(
      eq(appointments.clinicId, user.clinicId),
      eq(appointments.psychologistId, user.userId),
      gte(appointments.startsAt, new Date(inicioMs - 12 * 3600000)),
      lte(appointments.startsAt, new Date(fimMs + 12 * 3600000)),
    ))
    .all();

  const ms = (v: unknown) => (v instanceof Date ? v.getTime() : Number(v));
  const conflicts = doDia
    .filter((r) => r.status !== 'canceled' && ms(r.startsAt) < fimMs && ms(r.endsAt) > inicioMs)
    .map((r) => ({ patientName: r.patientName, startsAt: ms(r.startsAt), endsAt: ms(r.endsAt) }));

  return {
    texto,
    acao: {
      type: 'schedule',
      patientId: alvo.id,
      patientName: alvo.fullName,
      patientEmail: alvo.email ?? null,
      startsAt: inicioMs,
      endsAt: fimMs,
      durationMin: duracao,
      notes: String(dados?.observacoes ?? '').slice(0, 500),
      conflicts,
    },
  };
}

// ---- Chat da Ana Luiza -----------------------------------------------------
// Conversa com contexto opcional do paciente. Mantém histórico enviado pelo
// cliente. A IA observa e sugere — nunca diagnostica.
const chatSchema = z.object({
  patientId: z.string().optional(),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(20),
});

patientRoutes.post('/ana-chat', blockSecretary, zValidator('json', chatSchema), async (c) => {
  console.log('[ana-chat] rota alcançada');
  try {
  const user = c.get('user');
  const { patientId, messages } = c.req.valid('json');

  // Sem acesso clínico ao paciente informado, a Ana não responde sobre ele.
  if (patientId) {
    const p = await findPatient(c, user, patientId);
    if (!p) return c.json({ error: 'not_found' }, 404);
    const grantors = await activeGrantors(c, user);
    if (!hasClinicalAccess(user, p, grantors)) return c.json({ error: 'forbidden_clinical' }, 403);
  }

  let patientContext = '';

  // Monta o contexto completo de um paciente (registro + consultas + timeline).
  async function contextFor(row: any): Promise<string> {
    const db = getDb(c.env);
    const profile = row.profile ? JSON.parse(row.profile) : {};
    const sessRows = await db
      .select().from(sessions)
      .where(and(eq(sessions.patientId, row.id), eq(sessions.clinicId, user.clinicId)))
      .orderBy(desc(sessions.occurredAt))
      .all();
    const eventRows = await db
      .select().from(timelineEvents)
      .where(and(eq(timelineEvents.patientId, row.id), eq(timelineEvents.clinicId, user.clinicId)))
      .orderBy(asc(timelineEvents.eventDate))
      .all();
    return buildPatientContext(
      { fullName: row.fullName, socialName: row.socialName, birthDate: row.birthDate, email: row.email, phone: row.phone, profile },
      sessRows.map(serializeSession),
      eventRows,
    );
  }

  // 1) Paciente aberto no momento (se houver).
  if (patientId) {
    const row = await findPatient(c, user, patientId);
    if (row) {
      patientContext =
        '\n\nCONTEXTO DO PACIENTE EM ATENDIMENTO (use quando a pergunta for sobre "este paciente"):\n' +
        (await contextFor(row));
    }
  }

  // 2) Além do paciente aberto, procura um nome citado na última mensagem —
  //    respeitando a visibilidade (só os pacientes que este usuário pode ver).
  {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q = norm(lastUser);
    if (q.length > 2) {
      const vis = visibilityFilter(user);
      const all = await getDb(c.env)
        .select()
        .from(patients)
        .where(and(eq(patients.clinicId, user.clinicId), isNull(patients.deletedAt), vis))
        .limit(200)
        .all();
      const match = all.find((pt) => {
        if (pt.id === patientId) return false;
        const full = norm(pt.fullName);
        if (q.includes(full)) return true;
        return full.split(/\s+/).some((part) => part.length >= 3 && q.includes(part));
      });
      if (match) {
        patientContext +=
          `\n\nCONTEXTO DO PACIENTE "${match.fullName}" (citado na pergunta):\n` +
          (await contextFor(match));
      }
    }
  }

  // Data de hoje em Brasília — a Ana precisa disso para resolver "amanhã",
  // "próxima terça" e afins ao propor um agendamento.
  const hojeBR = new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit',
  });

  const system =
    ANA_PERSONA +
    '\n\nCONTEXTO DE USO: você está num CHAT com o psicólogo. Responda de forma conversacional, direta e útil, em português. Use os dados do paciente quando a pergunta for sobre ele.' +
    `\n\nDATA DE HOJE (fuso de Brasília): ${hojeBR}.` +
    (await agendaResumo(c, user)) +
    '\n\n' + ANA_ACTIONS +
    patientContext;

  let result: string;
  try {
    const resp = (await c.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any, {
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: 1024,
    })) as { response?: string };
    result = resp.response ?? 'Não consegui responder agora.';
  } catch {
    return c.json({ error: 'ai_error' }, 500);
  }

  // A Ana pode propor ações (agendar, lembrar por e-mail). Os blocos saem do
  // texto e viram cartões de confirmação — nada acontece sem o psicólogo clicar.
  const ag = await extrairAgendamento(c, user, result, patientId);
  let acao: AcaoAna | null = ag.acao;
  const lb = await extrairLembrete(c, user, ag.texto, patientId);
  if (!acao) acao = lb.acao;

  return c.json({ reply: lb.texto, action: acao });
  } catch (err: any) {
    console.error('[ana-chat] erro:', err);
    return c.json({ error: 'internal_error' }, 500);
  }
});
