import { useEffect, useMemo, useState } from 'react';
import { api, getUser, type Appointment, type Patient } from './lib/api';
import { useI18n } from './i18n';
import { IconArrowLeft } from './icons';

const DAY = 86400000;

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // segunda = 0
  x.setDate(x.getDate() - dow);
  return x;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hm(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

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

export default function AgendaView() {
  const { t } = useI18n();
  const me = getUser() as { role?: string; id?: string; name?: string } | null;
  const isPsych = me?.role === 'psychologist';

  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [psychs, setPsychs] = useState<{ id: string; name: string }[]>([]);
  const [selPsych, setSelPsych] = useState<string>('');
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY)), [weekStart]);

  useEffect(() => {
    api.agendaPsychologists().then((r) => {
      setPsychs(r.psychologists);
      const initial = isPsych && me?.id ? me.id : r.psychologists[0]?.id ?? '';
      setSelPsych(initial);
    }).catch(() => {});
  }, []);

  async function load() {
    if (!selPsych) return;
    setLoading(true);
    try {
      const from = weekStart.getTime();
      const to = from + 7 * DAY;
      const r = await api.appointmentsList(from, to, selPsych);
      setAppts(r.appointments);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [selPsych, weekStart]);

  function openCreate(day?: Date) {
    if (patients.length === 0) api.listPatients().then((r) => setPatients(r.patients.filter((p) => p.status === 'active' || true))).catch(() => {});
    const d = day ?? new Date();
    setError('');
    setForm({
      patientId: '',
      psychologistId: selPsych,
      date: ymd(d),
      time: '09:00',
      duration: 50,
      status: 'scheduled',
      notes: '',
    });
  }

  function openEdit(a: Appointment) {
    if (patients.length === 0) api.listPatients().then((r) => setPatients(r.patients)).catch(() => {});
    const s = new Date(a.startsAt);
    setError('');
    setForm({
      id: a.id,
      patientId: a.patientId,
      psychologistId: a.psychologistId ?? selPsych,
      date: ymd(s),
      time: hm(a.startsAt),
      duration: Math.max(15, Math.round((a.endsAt - a.startsAt) / 60000)),
      status: a.status,
      notes: a.notes ?? '',
    });
  }

  async function save() {
    if (!form) return;
    if (!form.patientId) { setError(t('agenda.pickPatient')); return; }
    const startsAt = new Date(`${form.date}T${form.time}`).getTime();
    const endsAt = startsAt + form.duration * 60000;
    if (!startsAt) { setError(t('agenda.pickTime')); return; }
    setBusy(true);
    setError('');
    try {
      if (form.id) {
        await api.appointmentUpdate(form.id, { startsAt, endsAt, status: form.status, notes: form.notes });
      } else {
        await api.appointmentCreate({ patientId: form.patientId, psychologistId: form.psychologistId, startsAt, endsAt, notes: form.notes || undefined });
      }
      setForm(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro');
    } finally {
      setBusy(false);
    }
  }

  async function removeAppt() {
    if (!form?.id) return;
    if (!confirm(t('agenda.confirmDelete'))) return;
    setBusy(true);
    try {
      await api.appointmentDelete(form.id);
      setForm(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro');
    } finally {
      setBusy(false);
    }
  }

  const weekLabel = `${days[0].toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} – ${days[6].toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}`;
  const todayYmd = ymd(new Date());

  return (
    <div className="agenda-wrap">
      <div className="agenda-toolbar">
        <div className="agenda-nav">
          <button className="ghost sm" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY))}>‹</button>
          <button className="ghost sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>{t('agenda.today')}</button>
          <button className="ghost sm" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY))}>›</button>
          <span className="agenda-weeklabel">{weekLabel}</span>
        </div>
        <div className="agenda-actions">
          {!isPsych && (
            <select className="agenda-psych" value={selPsych} onChange={(e) => setSelPsych(e.target.value)}>
              {psychs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button className="btn sm" onClick={() => openCreate()}>+ {t('agenda.new')}</button>
        </div>
      </div>

      {error && !form && <div className="container"><div className="error">{error}</div></div>}

      <div className="agenda-week">
        {days.map((d) => {
          const key = ymd(d);
          const dayAppts = appts
            .filter((a) => ymd(new Date(a.startsAt)) === key)
            .sort((a, b) => a.startsAt - b.startsAt);
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
                  </button>
                ))}
                {dayAppts.length === 0 && <div className="agenda-empty" onClick={() => openCreate(d)}>+</div>}
              </div>
            </div>
          );
        })}
      </div>

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
