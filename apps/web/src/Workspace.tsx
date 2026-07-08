import { useEffect, useMemo, useState } from 'react';
import { api, getUser, type Patient, type Session, type TimelineEvent } from './lib/api';
import { Brand } from './App';
import { Controls } from './Controls';
import { useI18n } from './i18n';
import { LOCALE } from './locales';
import DadosCadastraisTab from './tabs/DadosCadastraisTab';
import ConsultaTab from './tabs/ConsultaTab';
import FichaTab from './tabs/FichaTab';
import TimelineTab from './tabs/TimelineTab';
import AnaLuizaTab from './tabs/AnaLuizaTab';
import AnaChat from './AnaChat';
import TeamPanel from './TeamPanel';
import { IconTrash, IconArrowLeft, IconChild, IconSparkle } from './icons';

type Tab = 'dados' | 'consulta' | 'ficha' | 'timeline' | 'ana';

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
  onOpenTrash,
  showTrash = true,
}: {
  patients: Patient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (fullName: string) => Promise<void>;
  onOpenTrash: () => void;
  showTrash?: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'az' | 'za' | 'recent'>('az');
  const [sortMenu, setSortMenu] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const onlyDigits = (s: string) => s.replace(/\D/g, '');
    const qDigits = onlyDigits(query);
    const list = patients.filter((p) => {
      if (!q) return true;
      const nameMatch = p.fullName.toLowerCase().includes(q);
      // CPF: compara só os dígitos, então funciona com ou sem pontuação.
      const cpfMatch = qDigits.length >= 3 && p.cpf ? onlyDigits(p.cpf).includes(qDigits) : false;
      return nameMatch || cpfMatch;
    });
    // Ordenação escolhida pelo usuário.
    const byName = (a: typeof list[number], b: typeof list[number]) =>
      a.fullName.localeCompare(b.fullName, 'pt-BR', { sensitivity: 'base' });
    if (sortBy === 'az') list.sort(byName);
    else if (sortBy === 'za') list.sort((a, b) => byName(b, a));
    else list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)); // mais recentes
    return list;
  }, [patients, query, sortBy]);

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
      <div className="rail-search-row">
        <input className="rail-search" placeholder={t('rail.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="rail-sort-wrap">
          <button
            className={`rail-sort-btn ${sortMenu ? 'on' : ''}`}
            onClick={() => setSortMenu((v) => !v)}
            title={t('rail.sortBy')}
            aria-label={t('rail.sortBy')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
            </svg>
          </button>
          {sortMenu && (
            <>
              <div className="rail-sort-backdrop" onClick={() => setSortMenu(false)} />
              <div className="rail-sort-menu">
                {(['az', 'za', 'recent'] as const).map((opt) => (
                  <button
                    key={opt}
                    className={sortBy === opt ? 'sel' : ''}
                    onClick={() => { setSortBy(opt); setSortMenu(false); }}
                  >
                    {t(opt === 'az' ? 'rail.sortAz' : opt === 'za' ? 'rail.sortZa' : 'rail.sortRecent')}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
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
      {showTrash && (
        <button className="rail-trash" onClick={onOpenTrash} title={t('trash.title')}>
          <IconTrash size={16} /> <span>{t('trash.title')}</span>
        </button>
      )}
    </aside>
  );
}

export default function Workspace({ onLogout, onBackToAdmin }: { onLogout: () => void; onBackToAdmin?: () => void }) {
  const { t, te, lang } = useI18n();
  const user = getUser();
  const isSecretary = user?.role === 'secretary';
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [tab, setTab] = useState<Tab>(getUser()?.role === 'secretary' ? 'dados' : 'consulta');
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
    setTab('dados');
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

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);
  const [showTeam, setShowTeam] = useState(false);

  useEffect(() => {
    if (!zoomPhoto) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZoomPhoto(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomPhoto]);
  const [deleting, setDeleting] = useState(false);

  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState<Patient[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState<Patient | null>(null);

  async function openTrash() {
    setTrashOpen(true);
    setTrashLoading(true);
    try {
      const res = await api.listTrash();
      setTrash(res.patients);
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setTrashLoading(false);
    }
  }

  async function restore(id: string) {
    try {
      await api.restorePatient(id);
      setTrash((t) => t.filter((p) => p.id !== id));
      await loadPatients();
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    }
  }

  async function purge(id: string) {
    try {
      await api.deletePatientPermanent(id);
      setTrash((t) => t.filter((p) => p.id !== id));
      setConfirmPurge(null);
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
      setConfirmPurge(null);
    }
  }

  async function handleDelete() {
    if (!patient) return;
    setDeleting(true);
    try {
      await api.deletePatient(patient.id);
      setConfirmDelete(false);
      setSelectedId(null);
      setPatient(null);
      await loadPatients();
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  const age = ageFrom(patient?.birthDate);

  return (
    <>
      <div className="topbar">
        <Brand />
        <div className="who">
          <Controls />
          {onBackToAdmin && (
            <button className="ghost" onClick={onBackToAdmin}><IconArrowLeft size={16} /> {t('admin.backToAdmin')}</button>
          )}
          {user?.role === 'owner' && (
            <button className="ghost" onClick={() => setShowTeam(true)}>{t('team.button')}</button>
          )}
          <span>{user?.name}</span>
          <button className="ghost" onClick={onLogout}>
            {t('btn.logout')}
          </button>
        </div>
      </div>

      {error && <div className="container"><div className="error">{error}</div></div>}

      <div className="workspace two">
        <PatientRail patients={patients} selectedId={selectedId} onSelect={select} onAdd={addPatient} onOpenTrash={openTrash} showTrash={!isSecretary} />

        {selectedId && patient ? (
          <main className="ws-main">
            <button className="back" onClick={() => setSelectedId(null)}>
              <IconArrowLeft size={15} /> {t('rail.patients')}
            </button>

            <header className="ficha-header">
              <span
                className={`avatar lg ${patient.photo ? 'clickable' : ''}`}
                onClick={() => patient.photo && setZoomPhoto(patient.photo)}
                title={patient.photo ? t('photo.zoom') : undefined}
              >
                {patient.photo ? <img src={patient.photo} alt="" /> : initials(patient.fullName)}
              </span>
              <div className="fh-info">
                <h2>{patient.fullName}</h2>
                <p className="ficha-meta">
                  {patient.socialName ? `“${patient.socialName}” · ` : ''}
                  {age != null ? `${age} ${t('hdr.years')} · ` : ''}
                  {patient.email || patient.phone || t('hdr.noContact')} · {t('hdr.since')} {fmtDate(patient.createdAt)}
                </p>
              </div>
              {patient.profile?.personal?.isChild && (
                <span className="pill child"><IconChild size={13} /> {t('hdr.childCare')}</span>
              )}
              <span className={`pill ${patient.status}`}>{patient.status === 'active' ? t('status.active') : t('status.inactive')}</span>
              {!isSecretary && (
                <button className="btn-delete-patient" onClick={() => setConfirmDelete(true)} title={t('patient.delete')}>
                  <IconTrash size={15} /> {t('patient.delete')}
                </button>
              )}
            </header>

            <nav className="tabs">
              <button className={tab === 'dados' ? 'on' : ''} onClick={() => setTab('dados')}>{t('tab.dados')}</button>
              {!isSecretary && (
                <>
                  <button className={tab === 'consulta' ? 'on' : ''} onClick={() => setTab('consulta')}>{t('tab.consulta')}</button>
                  <button className={tab === 'ficha' ? 'on' : ''} onClick={() => setTab('ficha')}>{t('tab.ficha')}</button>
                  <button className={tab === 'timeline' ? 'on' : ''} onClick={() => setTab('timeline')}>{t('tab.timeline')}</button>
                  <button className={`tab-ana ${tab === 'ana' ? 'on' : ''}`} onClick={() => setTab('ana')}>
                    <IconSparkle size={14} className="tab-ana-spark" /> {t('tab.ana')}
                  </button>
                </>
              )}
            </nav>

            <div className="tab-body">
              {tab === 'dados' && (
                <DadosCadastraisTab key={`d-${patient.id}`} patient={patient} onSaved={() => { loadDetail(patient.id); loadPatients(); }} />
              )}
              {tab === 'consulta' && (
                <ConsultaTab key={`c-${patient.id}`} patientId={patient.id} sessions={sessions} loadingSessions={loadingSessions} onSaved={() => loadSessions(patient.id)} />
              )}
              {tab === 'ficha' && (
                <FichaTab key={`f-${patient.id}`} patient={patient} onSaved={() => { loadDetail(patient.id); loadPatients(); }} />
              )}
              {tab === 'timeline' && (
                <TimelineTab key={`t-${patient.id}`} patientId={patient.id} events={events} loading={loadingEvents} onChanged={() => loadEvents(patient.id)} />
              )}
              {tab === 'ana' && (
                <AnaLuizaTab key={`a-${patient.id}`} patient={patient} sessions={sessions} events={events} />
              )}
            </div>

            {confirmDelete && (
              <div className="modal-overlay" onClick={() => !deleting && setConfirmDelete(false)}>
                <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                  <h3>{t('patient.trashTitle')}</h3>
                  <p>{t('patient.trashWarn').replace('{name}', patient.fullName)}</p>
                  <div className="modal-actions">
                    <button className="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                      {t('btn.cancel')}
                    </button>
                    <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
                      {deleting ? t('patient.deleting') : t('patient.trashConfirm')}
                    </button>
                  </div>
                </div>
              </div>
            )}
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

      {trashOpen && (
        <div className="modal-overlay" onClick={() => setTrashOpen(false)}>
          <div className="modal-box trash-box" onClick={(e) => e.stopPropagation()}>
            <h3><IconTrash size={17} /> {t('trash.title')}</h3>
            <p className="trash-sub">{t('trash.subtitle')}</p>
            {trashLoading ? (
              <p className="trash-empty">{t('trash.loading')}</p>
            ) : trash.length === 0 ? (
              <p className="trash-empty">{t('trash.empty')}</p>
            ) : (
              <ul className="trash-list">
                {trash.map((p) => (
                  <li key={p.id}>
                    <span className="avatar sm">{p.photo ? <img src={p.photo} alt="" /> : initials(p.fullName)}</span>
                    <span className="trash-name">{p.fullName}</span>
                    <span className="trash-btns">
                      <button className="ghost sm" onClick={() => restore(p.id)}>{t('trash.restore')}</button>
                      <button className="link-danger sm" onClick={() => setConfirmPurge(p)}>{t('trash.purge')}</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button className="ghost" onClick={() => setTrashOpen(false)}>{t('btn.close')}</button>
            </div>
          </div>
        </div>
      )}

      {confirmPurge && (
        <div className="modal-overlay" onClick={() => setConfirmPurge(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>{t('trash.purgeTitle')}</h3>
            <p>{t('trash.purgeWarn').replace('{name}', confirmPurge.fullName)}</p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setConfirmPurge(null)}>{t('btn.cancel')}</button>
              <button className="btn-danger" onClick={() => purge(confirmPurge.id)}>{t('trash.purgeConfirm')}</button>
            </div>
          </div>
        </div>
      )}

      {zoomPhoto && (
        <div className="photo-lightbox" onClick={() => setZoomPhoto(null)}>
          <button className="photo-lightbox-close" onClick={() => setZoomPhoto(null)} aria-label={t('btn.close')}>×</button>
          <img src={zoomPhoto} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {showTeam && <TeamPanel onClose={() => setShowTeam(false)} />}

      {!isSecretary && <AnaChat patientId={selectedId ?? undefined} />}
    </>
  );
}
