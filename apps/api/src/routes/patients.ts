import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq, desc, asc, isNull, isNotNull } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { patients, sessions, timelineEvents } from '@vinculo/db/schema';
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

type SessionRow = typeof sessions.$inferSelect;
function serializeSession(s: SessionRow) {
  return { ...s, topics: s.topics ? (JSON.parse(s.topics) as string[]) : [] };
}

// Garante que o paciente existe E pertence à clínica do usuário.
async function findPatient(c: any, user: AuthUser, id: string) {
  return getDb(c.env)
    .select()
    .from(patients)
    .where(and(eq(patients.id, id), eq(patients.clinicId, user.clinicId)))
    .get();
}

// Monta os campos do paciente a partir do corpo (tudo opcional exceto nome).
function patientValues(body: Record<string, any>) {
  const v: Record<string, any> = {};
  for (const k of ['fullName', 'socialName', 'cpf', 'email', 'phone', 'whatsapp', 'status', 'photo']) {
    if (body[k] !== undefined) v[k] = body[k];
  }
  if (body.birthDate !== undefined) v.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  if (body.profile !== undefined) v.profile = body.profile ? JSON.stringify(body.profile) : null;
  return v;
}

// ---- Pacientes -----------------------------------------------------------
patientRoutes.get('/', async (c) => {
  const user = c.get('user');
  const rows = await getDb(c.env)
    .select()
    .from(patients)
    .where(and(eq(patients.clinicId, user.clinicId), isNull(patients.deletedAt)))
    .orderBy(desc(patients.createdAt))
    .all();
  return c.json({ patients: rows.map((p) => serializePatient(p, false)) });
});

// Lista os pacientes na lixeira (excluídos logicamente).
patientRoutes.get('/trash', async (c) => {
  const user = c.get('user');
  const rows = await getDb(c.env)
    .select()
    .from(patients)
    .where(and(eq(patients.clinicId, user.clinicId), isNotNull(patients.deletedAt)))
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
  const psychologistId =
    user.role === 'psychologist' || user.role === 'owner' ? user.userId : null;
  const row = await db
    .insert(patients)
    .values({ clinicId: user.clinicId, psychologistId, fullName: body.fullName, ...patientValues(body) })
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
  return c.json({ patient: serializePatient(row) });
});

// Atualização da ficha (parcial — tudo opcional).
const updateSchema = createSchema.partial();

patientRoutes.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await findPatient(c, user, id);
  if (!existing) return c.json({ error: 'not_found' }, 404);
  const values = patientValues(c.req.valid('json'));
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
  const rows = await getDb(c.env)
    .select()
    .from(sessions)
    .where(eq(sessions.patientId, id))
    .orderBy(desc(sessions.occurredAt))
    .all();
  return c.json({ sessions: rows.map(serializeSession) });
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
      mood: body.mood ?? null,
      emotionalScale: body.emotionalScale ?? null,
      topics: body.topics && body.topics.length ? JSON.stringify(body.topics) : null,
      objectives: body.objectives ?? null,
      techniques: body.techniques ?? null,
      evolution: body.evolution ?? null,
      nextSteps: body.nextSteps ?? null,
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
  return c.json({ session: serializeSession(row) }, 201);
});

// ---- Linha do tempo ------------------------------------------------------
// Entradas manuais agora; a IA vai sugerir eventos (status "suggested") na Etapa 2.
patientRoutes.get('/:id/timeline', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!(await findPatient(c, user, id))) return c.json({ error: 'not_found' }, 404);
  const rows = await getDb(c.env)
    .select()
    .from(timelineEvents)
    .where(eq(timelineEvents.patientId, id))
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

patientRoutes.post('/:id/timeline', zValidator('json', eventSchema), async (c) => {
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

patientRoutes.delete('/:id/timeline/:eventId', async (c) => {
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

function buildPatientContext(patient: any, sess: any[], events: any[]): string {
  const p = patient.profile ?? {};
  const parts: string[] = [];
  parts.push(`Paciente: ${patient.fullName}.`);
  if (p.clinical?.complaint) parts.push(`Queixa principal: ${p.clinical.complaint}`);
  if (p.clinical?.goals) parts.push(`Objetivos: ${p.clinical.goals}`);
  if (p.clinical?.suffering) parts.push(`Nível de sofrimento: ${p.clinical.suffering}`);

  const flags: string[] = [];
  if (p.health?.depression) flags.push('indicativo de depressão');
  if (p.health?.anxiety) flags.push('indicativo de ansiedade');
  if (p.health?.bipolar) flags.push('indicativo de bipolaridade');
  if (p.health?.tdah) flags.push('indicativo de TDAH');
  if (flags.length) parts.push(`Sinalizações da ficha: ${flags.join(', ')}.`);

  const recent = sess.slice(0, 4);
  if (recent.length) {
    parts.push('Consultas recentes (da mais nova para a mais antiga):');
    for (const s of recent) {
      const bits: string[] = [];
      if (s.mood) bits.push(`humor: ${s.mood}`);
      if (typeof s.emotionalScale === 'number') bits.push(`escala emocional: ${s.emotionalScale}/10`);
      if (s.topics?.length) bits.push(`assuntos: ${s.topics.join(', ')}`);
      if (s.evolution) bits.push(`evolução: ${s.evolution}`);
      if (s.nextSteps) bits.push(`próximos passos: ${s.nextSteps}`);
      parts.push(`- ${bits.join('; ') || 'sem detalhes'}`);
    }
  }
  if (events.length) {
    const titles = events.slice(-4).map((e: any) => e.title).filter(Boolean);
    if (titles.length) parts.push(`Marcos de vida: ${titles.join(', ')}.`);
  }
  return parts.join('\n');
}

patientRoutes.get('/:id/ai-questions', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const patientRow = await findPatient(c, user, id);
  if (!patientRow) return c.json({ error: 'not_found' }, 404);

  const db = getDb(c.env);
  const profile = patientRow.profile ? JSON.parse(patientRow.profile) : {};
  const patient = { fullName: patientRow.fullName, profile };
  const sessRows = await db
    .select().from(sessions)
    .where(eq(sessions.patientId, id))
    .orderBy(desc(sessions.occurredAt))
    .all();
  const sess = sessRows.map(serializeSession);
  const eventRows = await db
    .select().from(timelineEvents)
    .where(eq(timelineEvents.patientId, id))
    .orderBy(asc(timelineEvents.eventDate))
    .all();

  // Cache por paciente + assinatura simples (nº de consultas + data da última).
  const sig = `${sess.length}:${sess[0]?.occurredAt ?? 0}`;
  const cacheKey = `ai-questions:${id}:${sig}`;
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
    'Você é a Ana Luiza, assistente de um psicólogo. A partir das informações do ' +
    'paciente, sugira de 4 a 6 perguntas abertas, empáticas e clinicamente úteis ' +
    'que o psicólogo pode fazer na PRÓXIMA sessão, dando continuidade ao processo. ' +
    'Você observa e sugere, NUNCA diagnostica. Não use jargão excessivo. ' +
    'Cada pergunta em uma linha, começando com "- ". Não escreva mais nada além das perguntas.';

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
    const res: any = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: context },
      ],
      max_tokens: 600,
      temperature: 0.6,
    });
    const text: string = (res?.response ?? '').toString().trim();
    console.log('[ana] resposta da IA:', text.slice(0, 200));
    aiDetail = text.slice(0, 300);
    questions = parseQuestions(text);
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('[ana] ERRO na chamada da IA:', msg);
    return c.json({ error: 'ai_failed', detail: msg }, 502);
  }

  if (questions.length === 0) {
    // A IA respondeu, mas não conseguimos extrair perguntas — devolve detalhe p/ diagnóstico.
    return c.json({ questions: [], raw: aiDetail });
  }

  if (questions.length) {
    // Cache por 7 dias (renova sozinho quando surgir nova consulta).
    await c.env.CACHE.put(cacheKey, JSON.stringify(questions), { expirationTtl: 604800 });
  }
  return c.json({ questions });
});

// ---- Lixeira (exclusão lógica) ---------------------------------------------

// Mover para a lixeira (não apaga; marca deletedAt). Consultas e timeline ficam.
patientRoutes.delete('/:id', async (c) => {
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
patientRoutes.post('/:id/restore', async (c) => {
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
patientRoutes.delete('/:id/permanent', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await findPatient(c, user, id);
  if (!row) return c.json({ error: 'not_found' }, 404);

  const db = getDb(c.env);
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
