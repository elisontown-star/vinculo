import { useState } from 'react';
import { api, type Session, type NewSession } from '../lib/api';
import { useI18n } from '../i18n';
import { LOCALE } from '../locales';

function nowLocal() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function ScalePicker({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div className="scale">
      <div className="scale-track">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button type="button" key={n} className={`scale-seg ${value && n <= value ? 'on' : ''}`} onClick={() => onChange(n)} aria-label={`${n}`} />
        ))}
      </div>
      <span className="scale-val">{value ?? '—'}</span>
    </div>
  );
}

function TopicInput({ topics, onChange }: { topics: string[]; onChange: (t: string[]) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  function commit() {
    const v = draft.trim();
    if (v && !topics.includes(v)) onChange([...topics, v]);
    setDraft('');
  }
  return (
    <div className="tags">
      {topics.map((tp) => (
        <span className="tag" key={tp}>
          {tp}
          <button type="button" onClick={() => onChange(topics.filter((x) => x !== tp))} aria-label="x">
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={topics.length ? t('ph.topicsMore') : t('ph.topics')}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}

function SessionForm({ patientId, onSaved }: { patientId: string; onSaved: () => void }) {
  const { t, o, te } = useI18n();
  const [form, setForm] = useState<NewSession & { occurredAt: string }>({ occurredAt: nowLocal(), topics: [] });
  const [scale, setScale] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof NewSession>(k: K, v: NewSession[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createSession(patientId, {
        ...form,
        occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
        emotionalScale: scale ?? undefined,
      });
      setForm({ occurredAt: nowLocal(), topics: [] });
      setScale(null);
      onSaved();
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel consult" onSubmit={save}>
      <div className="panel-head">
        <h3>{t('c.title')}</h3>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="row2">
        <div className="field">
          <label>{t('c.datetime')}</label>
          <input className="date" type="datetime-local" value={form.occurredAt} onChange={(e) => set('occurredAt', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('c.duration')}</label>
          <input type="number" min={1} max={600} placeholder={t('ph.duration')} value={form.durationMin ?? ''} onChange={(e) => set('durationMin', e.target.value ? Number(e.target.value) : undefined)} />
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label>{t('c.mood')}</label>
          <div className="chips">
            {o('moods').map((m) => (
              <button type="button" key={m} className={`chip ${form.mood === m ? 'on' : ''}`} onClick={() => set('mood', form.mood === m ? undefined : m)}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{t('c.scale')}</label>
          <ScalePicker value={scale} onChange={setScale} />
        </div>
      </div>

      <div className="field">
        <label>{t('c.objectives')}</label>
        <input placeholder={t('ph.objectives')} value={form.objectives ?? ''} onChange={(e) => set('objectives', e.target.value)} />
      </div>

      <div className="field">
        <label>{t('c.topics')}</label>
        <TopicInput topics={form.topics ?? []} onChange={(tp) => set('topics', tp)} />
      </div>

      <div className="field">
        <label>{t('c.evolution')}</label>
        <textarea rows={3} placeholder={t('ph.evolution')} value={form.evolution ?? ''} onChange={(e) => set('evolution', e.target.value)} />
      </div>

      <div className="row2">
        <div className="field">
          <label>{t('c.techniques')}</label>
          <input placeholder={t('ph.techniques')} value={form.techniques ?? ''} onChange={(e) => set('techniques', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('c.nextSteps')}</label>
          <input placeholder={t('ph.nextSteps')} value={form.nextSteps ?? ''} onChange={(e) => set('nextSteps', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>{t('c.freeNotes')}</label>
        <textarea rows={2} placeholder={t('ph.freeNotes')} value={form.freeNotes ?? ''} onChange={(e) => set('freeNotes', e.target.value)} />
      </div>

      <p className="hint">{t('c.hint')}</p>
      <button className="btn" disabled={busy}>
        {busy ? t('btn.saving') : t('btn.saveConsulta')}
      </button>
    </form>
  );
}

function Panorama({ sessions }: { sessions: Session[] }) {
  const { t, lang } = useI18n();
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(LOCALE[lang], { day: '2-digit', month: 'short', year: 'numeric' });
  const last = sessions[0];
  const scales = sessions.map((s) => s.emotionalScale).filter((n): n is number => typeof n === 'number');
  const avg = scales.length ? (scales.reduce((a, b) => a + b, 0) / scales.length).toFixed(1) : '—';
  return (
    <div className="panorama">
      <div className="stat">
        <span className="stat-n">{sessions.length}</span>
        <span className="stat-l">{t('stat.consultas')}</span>
      </div>
      <div className="stat">
        <span className="stat-n">{last ? fmt(last.occurredAt) : '—'}</span>
        <span className="stat-l">{t('stat.last')}</span>
      </div>
      <div className="stat">
        <span className="stat-n">{avg}</span>
        <span className="stat-l">{t('stat.avg')}</span>
      </div>
    </div>
  );
}

function SessionHistory({ sessions, loading }: { sessions: Session[]; loading: boolean }) {
  const { t, lang } = useI18n();
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(LOCALE[lang], { day: '2-digit', month: 'short', year: 'numeric' });
  if (loading) return <div className="hist-empty">{t('common.loading')}</div>;
  if (sessions.length === 0)
    return (
      <div className="hist-empty">
        <strong>{t('hist.emptyTitle')}</strong>
        {t('hist.emptyText')}
      </div>
    );
  return (
    <div className="hist">
      {sessions.map((s) => (
        <div className="hist-card" key={s.id}>
          <div className="hist-top">
            <span className="hist-date">{fmt(s.occurredAt)}</span>
            {typeof s.emotionalScale === 'number' && <span className="scale-badge">{s.emotionalScale}/10</span>}
          </div>
          {s.mood && <span className="hist-mood">{s.mood}</span>}
          {s.topics.length > 0 && (
            <div className="tags ro">
              {s.topics.map((tp) => (
                <span className="tag" key={tp}>
                  {tp}
                </span>
              ))}
            </div>
          )}
          {s.evolution && <p className="hist-text">{s.evolution}</p>}
        </div>
      ))}
    </div>
  );
}

export default function ConsultaTab({
  patientId,
  sessions,
  loadingSessions,
  onSaved,
}: {
  patientId: string;
  sessions: Session[];
  loadingSessions: boolean;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="consulta-tab">
      <div className="consulta-main">
        <SessionForm patientId={patientId} onSaved={onSaved} />
      </div>
      <aside className="consulta-aside">
        <div className="aside-head">{t('aside.panorama')}</div>
        <Panorama sessions={sessions} />
        <div className="aside-head">{t('aside.previous')}</div>
        <SessionHistory sessions={sessions} loading={loadingSessions} />
      </aside>
    </div>
  );
}
