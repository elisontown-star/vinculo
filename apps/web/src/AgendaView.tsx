import { useEffect, useMemo, useState } from 'react';
import { api, getUser, type Appointment, type Patient } from './lib/api';
import { useI18n } from './i18n';

const DAY = 86400000;
type Mode = 'day' | 'week' | 'month';

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d: Date): Date { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function startOfMonth(d: Date): Date { const x = startOfDay(d); x.setDate(1); return x; }
function ymd(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function hm(ms: number): string { return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }

type FormState = {
  id?: string;
  patientId: string;
  psychologistId: string;
  date: string;
  time: string;
  duration: number;
  status: Appointment['status'];
  notes: string;
};

export default function AgendaView({ onRegisterSession }: {
  onRegisterSession?: (patientId: string, prefill: { occurredAt: string; durationMin?: number }) => void;
}) {
  const { t } = useI18n();
  const me = getUser() as { role?: string; id?: string; name?: string } | null;
  const isPsych = me?.role === 'psychologist';

  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()));
  const [search, setSearch] = useState('');
  const [psychs, setPsychs] = useState<{ id: string; name: string }[]>([]);
  const [selPsych, setSelPsych] = useState<string>('');
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const rangeStart = useMemo(() => {
    if (mode === 'day') return startOfDay(anchor);
    if (mode === 'week') return startOfWeek(anchor);
    return startOfWeek(startOfMonth(anchor));
  }, [mode, anchor]);
  const rangeDays = mode === 'day' ? 1 : mode === 'week' ? 7 : 42;

  useEffect(() => {
    api.agendaPsychologists().then((r) => {
      setPsychs(r.psychologists);
      setSelPsych(isPsych && me?.id ? me.id : r.psychologists[0]?.id ?? '');
    }).catch(() => {});
  }, []);

  async function load() {
    if (!selPsych) return;
    setLoading(true);
    try {
      const from = rangeStart.getTime();
      const to = from + rangeDays * DAY;
      const r = await api.appointmentsList(from, to, selPsych);
      setAppts(r.appointments);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [selPsych, rangeStart.getTime(), rangeDays]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return appts;
    return appts.filter((a) => (a.patientName ?? '').toLowerCase().includes(q));
  }, [appts, search]);

  function byDay(d: Date): Appointment[] {
    const key = ymd(d);
    return visible.filter((a) => ymd(new Date(a.startsAt)) === key).sort((a, b) => a.startsAt - b.startsAt);
  }

  function openCreate(day?: Date) {
    if (patients.length === 0) api.listPatients().then((r) => setPatients(r.patients)).catch(() => {});
    const d = day ?? new Date();
    setError('');
    setForm({ patientId: '', psychologistId: selPsych, date: ymd(d), time: '09:00', duration: 50, status: 'scheduled', notes: '' });
  }
  function openEdit(a: Appointment) {
    if (patients.length === 0) api.listPatients().then((r) => setPatients(r.patients)).catch(() => {});
    const s = new Date(a.startsAt);
    setError('');
    const rawDur = Math.round((a.endsAt - a.startsAt) / 60000);
    const duration = rawDur > 0 && rawDur <= 180 ? rawDur : 50;
    setForm({ id: a.id, patientId: a.patientId, psychologistId: a.psychologistId ?? selPsych, date: ymd(s), time: hm(a.startsAt), duration, status: a.status, notes: a.notes ?? '' });
  }
  async function save() {
    if (!form) return;
    if (!form.patientId) { setError(t('agenda.pickPatient')); return; }
    const startsAt = new Date(`${form.date}T${form.time}`).getTime();
    const endsAt = startsAt + form.duration * 60000;
    if (!startsAt) { setError(t('agenda.pickTime')); return; }
    setBusy(true); setError('');
    try {
      if (form.id) await api.appointmentUpdate(form.id, { startsAt, endsAt, status: form.status, notes: form.notes });
      else await api.appointmentCreate({ patientId: form.patientId, psychologistId: form.psychologistId, startsAt, endsAt, notes: form.notes || undefined });
      setForm(null); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'erro'); } finally { setBusy(false); }
  }
  async function removeAppt() {
    if (!form?.id) return;
    if (!confirm(t('agenda.confirmDelete'))) return;
    setBusy(true);
    try { await api.appointmentDelete(form.id); setForm(null); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'erro'); } finally { setBusy(false); }
  }

  function shift(dir: number) {
    const d = new Date(anchor);
    if (mode === 'day') d.setDate(d.getDate() + dir);
    else if (mode === 'week') d.setDate(d.getDate() + 7 * dir);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(startOfDay(d));
  }

  const label = useMemo(() => {
    if (mode === 'day') return anchor.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long' });
    if (mode === 'week') {
      const ws = startOfWeek(anchor); const we = new Date(ws.getTime() + 6 * DAY);
      return `${ws.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} – ${we.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}`;
    }
    return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [mode, anchor]);

  const todayYmd = ymd(new Date());
  const weekDayNames = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(startOfWeek(new Date()).getTime() + i * DAY).toLocaleDateString(undefined, { weekday: 'short' })), []);

  return (
    <div className="agenda-wrap">
      <div className="agenda-toolbar">
        <div className="agenda-nav">
          <button className="ghost sm" onClick={() => shift(-1)}>‹</button>
          <button className="ghost sm" onClick={() => setAnchor(startOfDay(new Date()))}>{t('agenda.today')}</button>
          <button className="ghost sm" onClick={() => shift(1)}>›</button>
          <span className="agenda-weeklabel">{label}</span>
        </div>
        <div className="agenda-actions">
          <input className="agenda-search" placeholder={t('agenda.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="agenda-modes">
            <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>{t('agenda.day')}</button>
            <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>{t('agenda.week')}</button>
            <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>{t('agenda.month')}</button>
          </div>
          {!isPsych && (
            <select className="agenda-psych" value={selPsych} onChange={(e) => setSelPsych(e.target.value)}>
              {psychs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button className="btn sm" onClick={() => openCreate()}>+ {t('agenda.new')}</button>
        </div>
      </div>

      {error && !form && <div className="container"><div className="error">{error}</div></div>}

      {mode === 'day' && (
        <div className="agenda-day">
          {byDay(anchor).map((a) => (
            <button key={a.id} className={`agenda-card lg st-${a.status}`} onClick={() => openEdit(a)}>
              <span className="agenda-time">{hm(a.startsAt)}–{hm(a.endsAt)}</span>
              <span className="agenda-pat">{a.patientName ?? '—'}</span>
              {a.status === 'done' && <span className="agenda-status-badge">✓ Realizada</span>}
              {a.status === 'no_show' && <span className="agenda-status-badge">✗ Falta</span>}
              {a.status === 'canceled' && <span className="agenda-status-badge">Cancelado</span>}
            </button>
          ))}
          {byDay(anchor).length === 0 && <div className="agenda-empty lg" onClick={() => openCreate(anchor)}>{t('agenda.noneDay')}</div>}
        </div>
      )}

      {mode === 'week' && (
        <div className="agenda-week">
          {Array.from({ length: 7 }, (_, i) => new Date(startOfWeek(anchor).getTime() + i * DAY)).map((d) => {
            const dayAppts = byDay(d);
            const key = ymd(d);
            return (
              <div className={`agenda-col ${key === todayYmd ? 'today' : ''}`} key={key}>
                <div className="agenda-dayhead" onClick={() => openCreate(d)}>
                  <span className="agenda-dow">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span className="agenda-daynum">{d.getDate()}</span>
                </div>
                <div className="agenda-daybody">
                  {dayAppts.map((a) => (
                    <button key={a.id} className={`agenda-card st-${a.status}`} onClick={() => openEdit(a)}>
                      <span className="agenda-time">{hm(a.startsAt)}</span>
                      <span className="agenda-pat">{a.patientName ?? '—'}</span>
                      {a.status === 'done' && <span className="agenda-status-badge">✓</span>}
                      {a.status === 'no_show' && <span className="agenda-status-badge">✗</span>}
                      {a.status === 'canceled' && <span className="agenda-status-badge">–</span>}
                    </button>
                  ))}
                  {dayAppts.length === 0 && <div className="agenda-empty" onClick={() => openCreate(d)}>+</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'month' && (
        <div className="agenda-monthwrap">
          <div className="agenda-mhead-row">
            {weekDayNames.map((w) => <div className="agenda-mhead" key={w}>{w}</div>)}
          </div>
          <div className="agenda-month">
            {Array.from({ length: 42 }, (_, i) => new Date(rangeStart.getTime() + i * DAY)).map((d) => {
              const key = ymd(d);
              const inMonth = d.getMonth() === anchor.getMonth();
              const dayAppts = byDay(d);
              return (
                <div className={`agenda-mcell ${inMonth ? '' : 'out'} ${key === todayYmd ? 'today' : ''}`} key={key} onClick={() => openCreate(d)}>
                  <span className="agenda-mdaynum">{d.getDate()}</span>
                  {dayAppts.slice(0, 3).map((a) => (
                    <button key={a.id} className={`agenda-mchip st-${a.status}`} onClick={(e) => { e.stopPropagation(); openEdit(a); }}>
                      {hm(a.startsAt)} {a.patientName ?? '—'}
                    </button>
                  ))}
                  {dayAppts.length > 3 && <span className="agenda-mmore">+{dayAppts.length - 3} {t('agenda.more')}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && <div className="agenda-loading">{t('admin.loading')}</div>}

      {form && (
        <div className="admin-modal-overlay" onClick={() => !busy && setForm(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal-title">{form.id ? t('agenda.editTitle') : t('agenda.newTitle')}</h2>
            {error && <div className="admin-modal-error">{error}</div>}

            <label className="admin-modal-label">{t('agenda.patient')}</label>
            {form.id ? (
              <input className="admin-modal-input" value={patients.find((p) => p.id === form.patientId)?.fullName ?? appts.find((a) => a.id === form.id)?.patientName ?? ''} disabled />
            ) : (
              <select className="admin-modal-input" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
                <option value="">{t('agenda.pickPatient')}</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            )}

            {!isPsych && (
              <>
                <label className="admin-modal-label">{t('agenda.psychologist')}</label>
                <select className="admin-modal-input" value={form.psychologistId} onChange={(e) => setForm({ ...form, psychologistId: e.target.value })} disabled={!!form.id}>
                  {psychs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </>
            )}

            <div className="agenda-form-row">
              <div style={{ flex: 1 }}>
                <label className="admin-modal-label">{t('agenda.date')}</label>
                <input className="admin-modal-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div style={{ width: 110 }}>
                <label className="admin-modal-label">{t('agenda.time')}</label>
                <input className="admin-modal-input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
              <div style={{ width: 120 }}>
                <label className="admin-modal-label">{t('agenda.duration')}</label>
                <select className="admin-modal-input" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}>
                  {[30, 45, 50, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
            </div>

            {form.id && (
              <>
                <label className="admin-modal-label">{t('agenda.status')}</label>
                <select className="admin-modal-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Appointment['status'] })}>
                  <option value="scheduled">{t('agenda.st.scheduled')}</option>
                  <option value="done">{t('agenda.st.done')}</option>
                  <option value="no_show">{t('agenda.st.no_show')}</option>
                  <option value="canceled">{t('agenda.st.canceled')}</option>
                </select>
              </>
            )}

            <label className="admin-modal-label">{t('agenda.notes')}</label>
            <textarea className="admin-modal-input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

            {form.id && onRegisterSession && form.status === 'scheduled' && (
              <button
                type="button"
                className="btn-register-session"
                disabled={busy}
                onClick={() => {
                  const appt = appts.find((a) => a.id === form.id);
                  if (!appt) return;
                  const d = new Date(appt.startsAt);
                  const occurredAt = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                  const rawDur = Math.round((appt.endsAt - appt.startsAt) / 60000);
                  const durationMin = rawDur > 0 && rawDur <= 480 ? rawDur : form.duration > 0 && form.duration <= 180 ? form.duration : undefined;
                  setForm(null);
                  onRegisterSession(appt.patientId, { occurredAt, durationMin });
                }}
              >
                📋 Registrar consulta
              </button>
            )}

            <div className="admin-modal-actions" style={{ justifyContent: form.id ? 'space-between' : 'flex-end' }}>
              {form.id && <button className="btn-danger-outline sm" onClick={removeAppt} disabled={busy}>{t('agenda.delete')}</button>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="ghost sm" onClick={() => setForm(null)} disabled={busy}>{t('btn.cancel')}</button>
                <button className="btn sm" onClick={save} disabled={busy}>{busy ? t('btn.wait') : t('agenda.save')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
