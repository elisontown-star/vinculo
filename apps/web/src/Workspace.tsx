import { useEffect, useMemo, useState } from 'react';
import { api, getUser, type Patient, type Session, type TimelineEvent } from './lib/api';
import { Brand } from './App';
import { Controls } from './Controls';
import { useI18n } from './i18n';
import { LOCALE } from './locales';
import ConsultaTab from './tabs/ConsultaTab';
import FichaTab from './tabs/FichaTab';
import TimelineTab from './tabs/TimelineTab';

type Tab = 'consulta' | 'ficha' | 'timeline';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}
function ageFrom(ms?: number | null): number | null {
  if (!ms) return null;
  const b = new Date(ms);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

function PatientRail({
  patients,
  selectedId,
  onSelect,
  onAdd,
}: {
  patients: Patient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (fullName: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const filtered = useMemo(
    () => patients.filter((p) => p.fullName.toLowerCase().includes(query.toLowerCase())),
    [patients, query],
  );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onAdd(name.trim());
      setName('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="rail">
      <div className="rail-head">
        <span className="rail-title">{t('rail.patients')}</span>
        <span className="count">{patients.length}</span>
      </div>
      <input className="rail-search" placeholder={t('rail.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="rail-list">
        {filtered.length === 0 ? (
          <p className="rail-empty">{t('rail.none')}</p>
        ) : (
          filtered.map((p) => (
            <button key={p.id} className={`rail-item ${p.id === selectedId ? 'is-active' : ''}`} onClick={() => onSelect(p.id)}>
              <span className="avatar sm">{p.photo ? <img src={p.photo} alt="" /> : initials(p.fullName)}</span>
              <span className="rail-item-name">{p.fullName}</span>
            </button>
          ))
        )}
      </div>
      <form className="rail-add" onSubmit={add}>
        <input placeholder={t('rail.newPatient')} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn sm" disabled={busy}>
          {busy ? '…' : t('btn.add')}
        </button>
      </form>
    </aside>
  );
}

export default function Workspace({ onLogout }: { onLogout: () => void }) {
  const { t, lang } = useI18n();
  const user = getUser();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [tab, setTab] = useState<Tab>('consulta');
  const [error, setError] = useState('');

  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(LOCALE[lang], { day: '2-digit', month: 'short', year: 'numeric' });

  async function loadPatients() {
    try {
      const res = await api.listPatients();
      setPatients(res.patients);
    } catch {
      setError(t('err.generic'));
    }
  }
  async function loadDetail(id: string) {
    try {
      setPatient((await api.getPatient(id)).patient);
    } catch {
      setPatient(null);
    }
  }
  async function loadSessions(id: string) {
    setLoadingSessions(true);
    try {
      setSessions((await api.listSessions(id)).sessions);
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }
  async function loadEvents(id: string) {
    setLoadingEvents(true);
    try {
      setEvents((await api.listTimeline(id)).events);
    } catch {
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }

  useEffect(() => {
    loadPatients();
  }, []);

  function select(id: string) {
    setSelectedId(id);
    setTab('consulta');
    setPatient(null);
    loadDetail(id);
    loadSessions(id);
    loadEvents(id);
  }

  async function addPatient(fullName: string) {
    const res = await api.createPatient({ fullName });
    await loadPatients();
    select(res.patient.id);
  }

  const age = ageFrom(patient?.birthDate);

  return (
    <>
      <div className="topbar">
        <Brand />
        <div className="who">
          <Controls />
          <span>{user?.name}</span>
          <button className="ghost" onClick={onLogout}>
            {t('btn.logout')}
          </button>
        </div>
      </div>

      {error && <div className="container"><div className="error">{error}</div></div>}

      <div className="workspace two">
        <PatientRail patients={patients} selectedId={selectedId} onSelect={select} onAdd={addPatient} />

        {selectedId && patient ? (
          <main className="ws-main">
            <button className="back" onClick={() => setSelectedId(null)}>
              ← {t('rail.patients')}
            </button>

            <header className="ficha-header">
              <span className="avatar lg">{patient.photo ? <img src={patient.photo} alt="" /> : initials(patient.fullName)}</span>
              <div className="fh-info">
                <h2>{patient.fullName}</h2>
                <p className="ficha-meta">
                  {patient.socialName ? `“${patient.socialName}” · ` : ''}
                  {age != null ? `${age} ${t('hdr.years')} · ` : ''}
                  {patient.email || patient.phone || t('hdr.noContact')} · {t('hdr.since')} {fmtDate(patient.createdAt)}
                </p>
              </div>
              <span className={`pill ${patient.status}`}>{patient.status === 'active' ? t('status.active') : t('status.inactive')}</span>
            </header>

            <nav className="tabs">
              <button className={tab === 'consulta' ? 'on' : ''} onClick={() => setTab('consulta')}>{t('tab.consulta')}</button>
              <button className={tab === 'ficha' ? 'on' : ''} onClick={() => setTab('ficha')}>{t('tab.ficha')}</button>
              <button className={tab === 'timeline' ? 'on' : ''} onClick={() => setTab('timeline')}>{t('tab.timeline')}</button>
            </nav>

            <div className="tab-body">
              {tab === 'consulta' && (
                <ConsultaTab key={`c-${patient.id}`} patientId={patient.id} sessions={sessions} loadingSessions={loadingSessions} onSaved={() => loadSessions(patient.id)} />
              )}
              {tab === 'ficha' && (
                <FichaTab key={`f-${patient.id}`} patient={patient} onSaved={() => { loadDetail(patient.id); loadPatients(); }} />
              )}
              {tab === 'timeline' && (
                <TimelineTab key={`t-${patient.id}`} patientId={patient.id} events={events} loading={loadingEvents} onChanged={() => loadEvents(patient.id)} />
              )}
            </div>
          </main>
        ) : (
          <div className="ws-empty">
            <div className="ws-empty-card">
              <strong>{t('empty.title')}</strong>
              <p>{t('empty.text')}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
