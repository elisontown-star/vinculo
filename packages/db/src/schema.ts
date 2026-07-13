import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Helpers ------------------------------------------------------------------
const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date());

// 1. Núcleo — organização e identidade ------------------------------------
export const clinics = sqliteTable('clinics', {
  id: id(),
  name: text('name').notNull(),
  // Código de empresa único e legível (ex.: "VTX-9F3A2C1D"), gerado na criação.
  companyCode: text('company_code'),
  // Plano contratado, definido pelo tamanho da empresa na criação.
  plan: text('plan', { enum: ['essencial', 'pro', 'plus'] }).notNull().default('essencial'),
  // Documento fiscal da empresa/profissional.
  taxIdType: text('tax_id_type', { enum: ['cnpj', 'cpf'] }),
  taxId: text('tax_id'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  // Ciclo de vida comercial: 'trial' (testando), 'active' (plano pago), 'blocked' (expirado).
  status: text('status', { enum: ['trial', 'active', 'blocked'] }).notNull().default('trial'),
  // Fim do período de teste (timestamp ms). Após essa data, se ainda em trial, bloqueia.
  trialEndsAt: integer('trial_ends_at'),
  createdAt: createdAt(),
});

export const users = sqliteTable(
  'users',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    // Perfis de acesso (RBAC). "patient" = login do Portal do Paciente.
    role: text('role', { enum: ['platform_admin', 'owner', 'psychologist', 'secretary', 'patient'] })
      .notNull()
      .default('psychologist'),
    // Preenchido quando role = 'patient', ligando o login ao prontuário.
    patientId: text('patient_id'),
    // Segredo TOTP (MFA) — populado na Etapa de autenticação forte.
    mfaSecret: text('mfa_secret'),
    // MFA ativo (TOTP confirmado pelo usuário).
    mfaEnabled: integer('mfa_enabled', { mode: 'boolean' }).notNull().default(false),
    // Códigos de recuperação (JSON de hashes) para acesso sem o app.
    mfaRecoveryCodes: text('mfa_recovery_codes'),
    // Versão do token — incrementada ao revogar sessões (reset de senha, reset de MFA).
    tokenVersion: integer('token_version').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
    clinicIdx: index('users_clinic_idx').on(t.clinicId),
  }),
);

// 2. Paciente e perfil ampliado -------------------------------------------
export const patients = sqliteTable(
  'patients',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    psychologistId: text('psychologist_id').references(() => users.id),
    fullName: text('full_name').notNull(),
    socialName: text('social_name'),
    cpf: text('cpf'),
    email: text('email'),
    phone: text('phone'),
    whatsapp: text('whatsapp'),
    birthDate: integer('birth_date', { mode: 'timestamp_ms' }),
    status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
    // Foto de perfil (data URL, redimensionada no cliente).
    photo: text('photo'),
    // Ficha ampliada em JSON: dados pessoais extras, família, situação
    // financeira, saúde, estilo de vida, interesses, personalidade,
    // relacionamentos. Tudo opcional — a IA lê este campo.
    profile: text('profile'),
    // Exclusão lógica (lixeira): quando preenchido, o paciente está na lixeira.
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => ({
    clinicIdx: index('patients_clinic_idx').on(t.clinicId),
    psychIdx: index('patients_psych_idx').on(t.psychologistId),
  }),
);

// 3. Histórico clínico -----------------------------------------------------
export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    psychologistId: text('psychologist_id').references(() => users.id),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    durationMin: integer('duration_min'),
    mood: text('mood'),
    emotionalScale: integer('emotional_scale'), // 1..10
    topics: text('topics'), // JSON array de strings
    objectives: text('objectives'),
    techniques: text('techniques'),
    evolution: text('evolution'),
    nextSteps: text('next_steps'),
    freeNotes: text('free_notes'),
    createdAt: createdAt(),
  },
  (t) => ({
    patientIdx: index('sessions_patient_idx').on(t.patientId),
  }),
);

export const timelineEvents = sqliteTable(
  'timeline_events',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    sessionId: text('session_id').references(() => sessions.id),
    title: text('title').notNull(),
    description: text('description'),
    eventDate: integer('event_date', { mode: 'timestamp_ms' }),
    category: text('category'),
    // IA sugere -> psicólogo confirma (regra de negócio da doc).
    status: text('status', { enum: ['suggested', 'confirmed'] }).notNull().default('suggested'),
    source: text('source', { enum: ['manual', 'ai'] }).notNull().default('manual'),
    createdAt: createdAt(),
  },
  (t) => ({
    patientIdx: index('timeline_patient_idx').on(t.patientId),
  }),
);

export const aiSummaries = sqliteTable(
  'ai_summaries',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    appointmentId: text('appointment_id'),
    content: text('content').notNull(),
    suggestedQuestions: text('suggested_questions'), // JSON array
    model: text('model'),
    status: text('status', { enum: ['ready', 'approved', 'discarded'] }).notNull().default('ready'),
    approvedContent: text('approved_content'),
    approvedBy: text('approved_by').references(() => users.id),
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => ({
    patientIdx: index('summaries_patient_idx').on(t.patientId),
  }),
);

export const aiAlerts = sqliteTable(
  'ai_alerts',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    type: text('type').notNull(),
    severity: text('severity', { enum: ['low', 'medium', 'high', 'critical'] })
      .notNull()
      .default('medium'),
    message: text('message').notNull(),
    status: text('status', { enum: ['active', 'reviewed'] }).notNull().default('active'),
    createdAt: createdAt(),
  },
  (t) => ({
    patientIdx: index('alerts_patient_idx').on(t.patientId),
  }),
);

// 4. Operacional, financeiro e conformidade -------------------------------
export const appointments = sqliteTable(  'appointments',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    psychologistId: text('psychologist_id').references(() => users.id),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
    status: text('status', { enum: ['scheduled', 'done', 'canceled', 'no_show'] })
      .notNull()
      .default('scheduled'),
    notes: text('notes'),
    googleEventId: text('google_event_id'),
    createdAt: createdAt(),
  },
  (t) => ({
    clinicIdx: index('appointments_clinic_idx').on(t.clinicId),
    startsIdx: index('appointments_starts_idx').on(t.startsAt),
  }),
);

export const consents = sqliteTable(
  'consents',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    type: text('type', { enum: ['general', 'recording', 'ai'] }).notNull(),
    version: text('version').notNull(),
    grantedAt: integer('granted_at', { mode: 'timestamp_ms' }),
    ip: text('ip'),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => ({
    patientIdx: index('consents_patient_idx').on(t.patientId),
  }),
);

export const documents = sqliteTable(
  'documents',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    patientId: text('patient_id')
      .notNull()
      .references(() => patients.id),
    type: text('type'),
    fileName: text('file_name').notNull(),
    r2Key: text('r2_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    patientIdx: index('documents_patient_idx').on(t.patientId),
  }),
);

// Log de auditoria imutável (append-only).
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: id(),
    clinicId: text('clinic_id').notNull(),
    actorUserId: text('actor_user_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    metadata: text('metadata'), // JSON
    createdAt: createdAt(),
  },
  (t) => ({
    clinicIdx: index('audit_clinic_idx').on(t.clinicId),
  }),
);

// Compartilhamento de acesso clínico entre psicólogos (ex.: cobertura de férias).
// O psicólogo (grantor) libera acesso aos SEUS pacientes para um colega (grantee),
// opcionalmente com data de expiração.
export const clinicalShares = sqliteTable(
  'clinical_shares',
  {
    id: id(),
    clinicId: text('clinic_id').notNull().references(() => clinics.id),
    grantorId: text('grantor_id').notNull().references(() => users.id),
    granteeId: text('grantee_id').notNull().references(() => users.id),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => ({
    granteeIdx: index('clinical_shares_grantee_idx').on(t.granteeId),
    grantorIdx: index('clinical_shares_grantor_idx').on(t.grantorId),
  }),
);

// Biblioteca de arquivos do paciente (receituário, guia, laudo, etc.).
// Metadados no banco; o arquivo em si fica no R2 (r2Key).
export const patientFiles = sqliteTable(
  'patient_files',
  {
    id: id(),
    clinicId: text('clinic_id').notNull().references(() => clinics.id),
    patientId: text('patient_id').notNull().references(() => patients.id),
    category: text('category', { enum: ['receituario', 'guia', 'laudo', 'outros'] }).notNull().default('outros'),
    fileName: text('file_name').notNull(),
    mime: text('mime'),
    size: integer('size'),
    r2Key: text('r2_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('patient_files_patient_id_idx').on(t.patientId)],
);
