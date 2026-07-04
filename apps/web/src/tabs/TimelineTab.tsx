import { useState } from 'react';
import { api, type TimelineEvent } from '../lib/api';
import { useI18n } from '../i18n';

function yearOf(e: TimelineEvent): string {
  if (!e.eventDate) return '—';
  return String(new Date(e.eventDate).getUTCFullYear());
}

export default function TimelineTab({
  patientId,
  events,
  loading,
  onChanged,
}: {
  patientId: string;
  events: TimelineEvent[];
  loading: boolean;
  onChanged: () => void;
}) {
  const { t, te } = useI18n();
  const [year, setYear] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.createTimelineEvent(patientId, {
        title: title.trim(),
        description: description.trim() || undefined,
        year: year ? Number(year) : undefined,
      });
      setYear('');
      setTitle('');
      setDescription('');
      onChanged();
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteTimelineEvent(patientId, id);
      onChanged();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="timeline-tab">
      <form className="panel tl-add" onSubmit={add}>
        <div className="panel-head">
          <h3>{t('tl.addEvent')}</h3>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="tl-form">
          <input className="tl-year" placeholder={t('tl.year')} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
          <input className="tl-title" placeholder={t('tl.eventPh')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn sm" disabled={busy}>
            {busy ? '…' : t('btn.add')}
          </button>
        </div>
        <textarea className="tl-desc" rows={2} placeholder={t('tl.descPh')} value={description} onChange={(e) => setDescription(e.target.value)} />
        <p className="hint">{t('tl.hint')}</p>
      </form>

      <div className="tl-list">
        {loading ? (
          <div className="hist-empty">{t('common.loading')}</div>
        ) : events.length === 0 ? (
          <div className="hist-empty">
            <strong>{t('tl.emptyTitle')}</strong>
            {t('tl.emptyText')}
          </div>
        ) : (
          events.map((ev) => (
            <div className="tl-item" key={ev.id}>
              <div className="tl-ev-year">{yearOf(ev)}</div>
              <div className="tl-dot" />
              <div className="tl-content">
                <div className="tl-item-head">
                  <span className="tl-item-title">{ev.title}</span>
                  <button className="tl-del" onClick={() => remove(ev.id)} aria-label="x">
                    ×
                  </button>
                </div>
                {ev.description && <p className="tl-item-desc">{ev.description}</p>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
