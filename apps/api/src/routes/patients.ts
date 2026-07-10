import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq, desc, asc, isNull, isNotNull, inArray, gt, or } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { patients, sessions, timelineEvents, clinicalShares } from '@vinculo/db/schema';
import { ANA_PERSONA, ANA_FULL_ANALYSIS } from '../lib/anaPrompt';
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
  const rows = await getDb(c.env)
    .select()
    .from(patients)
    .where(and(eq(patients.clinicId, user.clinicId), isNull(patients.deletedAt), vis))
    .orderBy(desc(patients.createdAt))
    .all();
  return c.json({ patients: rows.map((p) => serializePatient(p, false)) });
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
  const values = patientValues(input);
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
patientRoutes.get('/:id/sessions', requireClinicalAccess, async (c) => {
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

patientRoutes.post('/:id/sessions', requireClinicalAccess, zValidator('json', sessionSchema), async (c) => {
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
patientRoutes.get('/:id/timeline', requireClinicalAccess, async (c) => {
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

  // Consultas (todas)
  if (sess.length) {
    parts.push(`Consultas registradas (${sess.length}, da mais nova para a mais antiga):`);
    for (const s of sess) {
      const bits: string[] = [];
      if (s.occurredAt) bits.push(new Date(s.occurredAt).toLocaleDateString('pt-BR'));
      if (s.mood) bits.push(`humor: ${s.mood}`);
      if (typeof s.emotionalScale === 'number') bits.push(`escala: ${s.emotionalScale}/10`);
      if (s.topics?.length) bits.push(`assuntos: ${s.topics.join(', ')}`);
      if (s.evolution) bits.push(`evolução: ${s.evolution}`);
      if (s.nextSteps) bits.push(`próximos passos: ${s.nextSteps}`);
      parts.push(`- ${bits.join('; ') || 'sem detalhes'}`);
    }
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
    ANA_PERSONA +
    '\n\nTAREFA: a partir das informações do paciente, gere de 10 a 20 perguntas ABERTAS, ' +
    'empáticas e clinicamente úteis que o psicólogo pode fazer na PRÓXIMA sessão, dando ' +
    'continuidade ao processo terapêutico. Evite perguntas fechadas (de sim/não). ' +
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
    const res: any = await c.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: context },
      ],
      max_tokens: 1000,
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
      .where(eq(sessions.patientId, row.id))
      .orderBy(desc(sessions.occurredAt))
      .all();
    const eventRows = await db
      .select().from(timelineEvents)
      .where(eq(timelineEvents.patientId, row.id))
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
        .all();
      // Casa se qualquer parte do nome (>=3 letras) aparece na mensagem.
      const match = all.find((pt) => {
        if (pt.id === patientId) return false; // já é o paciente aberto
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

  const system =
    ANA_PERSONA +
    '\n\nCONTEXTO DE USO: você está num CHAT com o psicólogo. Adapte a extensão da resposta à pergunta. ' +
    'Mantenha um tom gentil e educado, mas seja breve — em conversas normais, responda em poucas frases, de forma calorosa e direta. ' +
    'Para perguntas pontuais (ex.: "qual a queixa principal?", "resuma a última sessão"), responda de forma direta e objetiva, sem a estrutura completa. ' +
    'Quando o psicólogo pedir uma ANÁLISE DO CASO, um panorama geral ou um resumo completo do paciente, use a estrutura detalhada abaixo.\n\n' +
    ANA_FULL_ANALYSIS +
    '\n\nResponda sempre em português do Brasil. Se a informação pedida não estiver no contexto, diga que não consta nos registros — nunca invente. ' +
    'Você pode receber o contexto de mais de um paciente (o que está em atendimento e outro que o psicólogo citou pelo nome). Use o contexto do paciente sobre o qual a pergunta se refere.' +
    patientContext;

  let answer = '';
  try {
    const res: any = await c.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: 2000,
      temperature: 0.7,
    });
    answer = (res?.response ?? '').toString().trim();
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('[ana-chat] ERRO:', msg);
    return c.json({ error: 'ai_failed', detail: msg }, 502);
  }

  if (!answer) return c.json({ error: 'empty' }, 502);
  return c.json({ answer });
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('[ana-chat] ERRO GERAL:', msg);
    return c.json({ error: 'chat_failed', detail: msg }, 500);
  }
});
