const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

const token = () => localStorage.getItem('vinculo_token');
export const setToken = (t: string) => localStorage.setItem('vinculo_token', t);
export const clearToken = () => localStorage.removeItem('vinculo_token');
export const setUser = (u: unknown) => localStorage.setItem('vinculo_user', JSON.stringify(u));
export const getUser = () => {
  const s = localStorage.getItem('vinculo_user');
  return s ? JSON.parse(s) : null;
};

export type Profile = Record<string, any>;

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
  login: (b: unknown) => req('/auth/login', { method: 'POST', body: JSON.stringify(b) }),

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
};
