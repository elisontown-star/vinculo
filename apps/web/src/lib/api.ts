const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

const token = () => localStorage.getItem('vinculo_token');
export const setToken = (t: string) => localStorage.setItem('vinculo_token', t);
export const clearToken = () => localStorage.removeItem('vinculo_token');
export const setUser = (u: unknown) => localStorage.setItem('vinculo_user', JSON.stringify(u));
export const getDeviceToken = () => localStorage.getItem('vinculo_device') ?? '';
export const setDeviceToken = (t: string) => localStorage.setItem('vinculo_device', t);
export const getUser = () => {
  const s = localStorage.getItem('vinculo_user');
  return s ? JSON.parse(s) : null;
};

export type Profile = Record<string, any>;

export type AdminClinic = {
  id: string;
  name: string;
  createdAt: number;
  isActive: boolean;
  status?: 'trial' | 'active' | 'blocked';
  trialEndsAt?: number | null;
  users: number;
  patients: number;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mfaEnabled: boolean;
  createdAt: number;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mfaEnabled: boolean;
};

export type Patient = {
  id: string;
  fullName: string;
  socialName?: string | null;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  birthDate?: number | null;
  status: string;
  photo?: string | null;
  profile?: Profile;
  deletedAt?: number | null;
  createdAt: number;
};

export type Session = {
  id: string;
  patientId: string;
  occurredAt: number;
  durationMin?: number | null;
  mood?: string | null;
  emotionalScale?: number | null;
  topics: string[];
  objectives?: string | null;
  techniques?: string | null;
  evolution?: string | null;
  nextSteps?: string | null;
  freeNotes?: string | null;
  createdAt: number;
};

export type NewSession = {
  occurredAt?: string;
  durationMin?: number;
  mood?: string;
  emotionalScale?: number;
  topics?: string[];
  objectives?: string;
  techniques?: string;
  evolution?: string;
  nextSteps?: string;
  freeNotes?: string;
};

export type TimelineEvent = {
  id: string;
  title: string;
  description?: string | null;
  eventDate?: number | null;
  category?: string | null;
  status: string;
  source: string;
};

export type PatientUpdate = {
  fullName?: string;
  socialName?: string;
  cpf?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  status?: string;
  birthDate?: string | null;
  photo?: string | null;
  profile?: Profile;
};

async function req(path: string, opts: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(opts.headers ?? {}),
      },
    });
  } catch {
    throw new Error('network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'generic');
  return data;
}


export const api = {
  register: (b: unknown) => req('/auth/register', { method: 'POST', body: JSON.stringify(b) }),
  login: (b: unknown) => req('/auth/login', { method: 'POST', headers: { 'X-Device-Token': getDeviceToken() }, body: JSON.stringify(b) }),

  forgotPassword: (email: string): Promise<{ ok: boolean }> =>
    req('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (b: { email: string; code: string; password: string }): Promise<{ ok: boolean }> =>
    req('/auth/reset-password', { method: 'POST', body: JSON.stringify(b) }),

  // --- Painel do super admin ---
  adminStats: (): Promise<{ clinics: number; users: number; patients: number }> =>
    req('/admin/stats'),
  adminClinics: (): Promise<{ clinics: AdminClinic[] }> => req('/admin/clinics'),
  adminClinicUsers: (clinicId: string): Promise<{ users: AdminUser[] }> =>
    req(`/admin/clinics/${clinicId}/users`),
  adminResetMfa: (userId: string): Promise<{ ok: boolean }> =>
    req(`/admin/users/${userId}/reset-mfa`, { method: 'POST' }),
  adminResetPassword: (userId: string): Promise<{ ok: boolean; email: string }> =>
    req(`/admin/users/${userId}/reset-password`, { method: 'POST' }),
  adminToggleClinic: (clinicId: string, isActive: boolean): Promise<{ ok: boolean }> =>
    req(`/admin/clinics/${clinicId}/active`, { method: 'POST', body: JSON.stringify({ isActive }) }),
  adminActivatePlan: (clinicId: string): Promise<{ ok: boolean }> =>
    req(`/admin/clinics/${clinicId}/activate-plan`, { method: 'POST' }),
  adminExtendTrial: (clinicId: string, days: number): Promise<{ ok: boolean }> =>
    req(`/admin/clinics/${clinicId}/extend-trial`, { method: 'POST', body: JSON.stringify({ days }) }),
  adminSearch: (q: string): Promise<{ users: (AdminUser & { clinicId: string; clinicName: string })[]; clinics: { id: string; name: string; isActive: boolean; createdAt: number }[] }> =>
    req(`/admin/search?q=${encodeURIComponent(q)}`),

  // --- Equipe da clínica (owner) ---
  teamList: (): Promise<{ members: TeamMember[] }> => req('/team'),
  teamInvite: (b: { name: string; email: string; role?: string }): Promise<{ ok: boolean; emailSent: boolean }> =>
    req('/team/invite', { method: 'POST', body: JSON.stringify(b) }),
  teamResend: (id: string): Promise<{ ok: boolean }> =>
    req(`/team/${id}/resend`, { method: 'POST' }),
  teamToggleActive: (id: string, isActive: boolean): Promise<{ ok: boolean }> =>
    req(`/team/${id}/active`, { method: 'POST', body: JSON.stringify({ isActive }) }),
  inviteInfo: (token: string): Promise<{ name: string; email: string }> =>
    req(`/team/invite/${token}`),
  inviteAccept: (token: string, password: string): Promise<{ ok: boolean; email: string }> =>
    req('/team/invite/accept', { method: 'POST', body: JSON.stringify({ token, password }) }),

  mfaSetupStart: (stepToken: string): Promise<{ secret: string; uri: string }> =>
    req('/auth/mfa/setup/start', { method: 'POST', headers: { Authorization: `Bearer ${stepToken}` } }),
  mfaSetupConfirm: (stepToken: string, code: string): Promise<{ token: string; recoveryCodes: string[]; user: unknown }> =>
    req('/auth/mfa/setup/confirm', { method: 'POST', headers: { Authorization: `Bearer ${stepToken}` }, body: JSON.stringify({ code }) }),
  loginMfa: (challengeToken: string, code: string, trustDevice?: boolean): Promise<{ token: string; deviceToken?: string; user: unknown }> =>
    req('/auth/login/mfa', { method: 'POST', headers: { Authorization: `Bearer ${challengeToken}` }, body: JSON.stringify({ code, trustDevice }) }),

  listPatients: (): Promise<{ patients: Patient[] }> => req('/patients'),
  createPatient: (b: Partial<Patient>): Promise<{ patient: Patient }> =>
    req('/patients', { method: 'POST', body: JSON.stringify(b) }),
  getPatient: (id: string): Promise<{ patient: Patient }> => req(`/patients/${id}`),
  updatePatient: (id: string, b: PatientUpdate): Promise<{ patient: Patient }> =>
    req(`/patients/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),

  listSessions: (id: string): Promise<{ sessions: Session[] }> => req(`/patients/${id}/sessions`),
  createSession: (id: string, b: NewSession): Promise<{ session: Session }> =>
    req(`/patients/${id}/sessions`, { method: 'POST', body: JSON.stringify(b) }),

  listTimeline: (id: string): Promise<{ events: TimelineEvent[] }> => req(`/patients/${id}/timeline`),
  createTimelineEvent: (
    id: string,
    b: { title: string; description?: string; year?: number; eventDate?: string; category?: string },
  ): Promise<{ event: TimelineEvent }> =>
    req(`/patients/${id}/timeline`, { method: 'POST', body: JSON.stringify(b) }),
  deleteTimelineEvent: (id: string, eventId: string): Promise<{ ok: boolean }> =>
    req(`/patients/${id}/timeline/${eventId}`, { method: 'DELETE' }),

  aiQuestions: (
    id: string,
  ): Promise<{ questions: string[]; cached?: boolean; empty?: boolean }> =>
    req(`/patients/${id}/ai-questions`),

  deletePatient: (id: string): Promise<{ ok: boolean }> =>
    req(`/patients/${id}`, { method: 'DELETE' }),

  listTrash: (): Promise<{ patients: Patient[] }> => req('/patients/trash'),
  restorePatient: (id: string): Promise<{ ok: boolean }> =>
    req(`/patients/${id}/restore`, { method: 'POST' }),
  deletePatientPermanent: (id: string): Promise<{ ok: boolean }> =>
    req(`/patients/${id}/permanent`, { method: 'DELETE' }),

  anaChat: (
    body: { patientId?: string; messages: { role: 'user' | 'assistant'; content: string }[] },
  ): Promise<{ answer: string }> =>
    req('/patients/ana-chat', { method: 'POST', body: JSON.stringify(body) }),
};
