import { useState, useMemo } from 'react';
import { api, getUser, type Session, type NewSession } from '../lib/api';
import { useI18n } from '../i18n';
import { LOCALE } from '../locales';

// ── Utils ─────────────────────────────────────────────────────────────────────
function nowLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ── Scale picker ──────────────────────────────────────────────────────────────
function ScalePicker({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div className="scale">
      <div className="scale-track">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            type="button"
            key={n}
            className={`scale-seg ${value && n <= value ? 'on' : ''}`}
            onClick={() => onChange(n)}
            aria-label={String(n)}
          />
        ))}
      </div>
      <span className="scale-val">{value ?? '—'}</span>
    </div>
  );
}

// ── Topic input ───────────────────────────────────────────────────────────────
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
          <button type="button" onClick={() => onChange(topics.filter((x) => x !== tp))} aria-label="x">×</button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={topics.length ? t('ph.topicsMore') : t('ph.topics')}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
        }}
        onBlur={commit}
      />
    </div>
  );
}

// ── Formulário clínico completo (psicólogo / owner) ───────────────────────────
function FullForm({ patientId, onSaved }: { patientId: string; onSaved: () => void }) {
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
    <form className="session-form panel" onSubmit={save}>
      {error && <div className="error">{error}</div>}

      <div className="row2">
        <div className="field">
          <label>{t('c.datetime')}</label>
          <input className="date" type="datetime-local" value={form.occurredAt}
            onChange={(e) => set('occurredAt', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('c.duration')}</label>
          <input type="number" min={1} max={600} placeholder={t('ph.duration')}
            value={form.durationMin ?? ''}
            onChange={(e) => set('durationMin', e.target.value ? Number(e.target.value) : undefined)} />
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label>{t('c.mood')}</label>
          <div className="chips">
            {o('moods').map((m) => (
              <button type="button" key={m}
                className={`chip ${form.mood === m ? 'on' : ''}`}
                onClick={() => set('mood', form.mood === m ? undefined : m)}>{m}</button>
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
        <input placeholder={t('ph.objectives')} value={form.objectives ?? ''}
          onChange={(e) => set('objectives', e.target.value)} />
      </div>

      <div className="field">
        <label>{t('c.topics')}</label>
        <TopicInput topics={form.topics ?? []} onChange={(tp) => set('topics', tp)} />
      </div>

      <div className="field">
        <label>{t('c.evolution')}</label>
        <textarea rows={3} placeholder={t('ph.evolution')} value={form.evolution ?? ''}
          onChange={(e) => set('evolution', e.target.value)} />
      </div>

      <div className="row2">
        <div className="field">
          <label>{t('c.techniques')}</label>
          <input placeholder={t('ph.techniques')} value={form.techniques ?? ''}
            onChange={(e) => set('techniques', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('c.nextSteps')}</label>
          <input placeholder={t('ph.nextSteps')} value={form.nextSteps ?? ''}
            onChange={(e) => set('nextSteps', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>{t('c.freeNotes')}</label>
        <textarea rows={2} placeholder={t('ph.freeNotes')} value={form.freeNotes ?? ''}
          onChange={(e) => set('freeNotes', e.target.value)} />
      </div>

      <p className="hint">{t('c.hint')}</p>
      <button className="btn" disabled={busy}>
        {busy ? t('btn.saving') : t('btn.saveConsulta')}
      </button>
    </form>
  );
}

// ── Formulário simplificado (secretária) ──────────────────────────────────────
function SecretaryForm({ patientId, onSaved }: { patientId: string; onSaved: () => void }) {
  const { t, te } = useI18n();
  const [occurredAt, setOccurredAt] = useState(nowLocal());
  const [durationMin, setDurationMin] = useState<number | undefined>(undefined);
  const [freeNotes, setFreeNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createSession(patientId, {
        occurredAt: new Date(occurredAt).toISOString(),
        durationMin,
        freeNotes: freeNotes || undefined,
      });
      setOccurredAt(nowLocal());
      setDurationMin(undefined);
      setFreeNotes('');
      onSaved();
    } catch (err) {
      setError(te(err instanceof Error ? err.message : 'generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="session-form panel" onSubmit={save}>
      {error && <div className="error">{error}</div>}
      <div className="secretary-note">{t('c.secretaryNote')}</div>

      <div className="row2">
        <div className="field">
          <label>{t('c.datetime')}</label>
          <input className="date" type="datetime-local" value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('c.duration')}</label>
          <input type="number" min={1} max={600} placeholder={t('ph.duration')}
            value={durationMin ?? ''}
            onChange={(e) => setDurationMin(e.target.value ? Number(e.target.value) : undefined)} />
        </div>
      </div>

      <div className="field">
        <label>{t('c.freeNotes')}</label>
        <textarea rows={3} placeholder={t('ph.secretaryNotes')} value={freeNotes}
          onChange={(e) => setFreeNotes(e.target.value)} />
      </div>

      <button className="btn" disabled={busy}>
        {busy ? t('btn.saving') : t('btn.saveConsulta')}
      </button>
    </form>
  );
}

// ── Panorama ──────────────────────────────────────────────────────────────────
function Panorama({ sessions }: { sessions: Session[] }) {
  const { t, lang } = useI18n();
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString(LOCALE[lang], { day: '2-digit', month: 'short', year: 'numeric' });
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

// ── Cartão de consulta com accordion ─────────────────────────────────────────
function SessionCard({
  session: s,
  expanded,
  onToggle,
  isSecretary,
  lang,
}: {
  session: Session;
  expanded: boolean;
  onToggle: () => void;
  isSecretary: boolean;
  lang: string;
}) {
  const { t } = useI18n();
  const locale = LOCALE[lang as keyof typeof LOCALE];

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const scaleColor = (n: number) => (n >= 7 ? 'scale-high' : n >= 4 ? 'scale-mid' : 'scale-low');

  return (
    <div className={`sc-card ${expanded ? 'sc-open' : ''}`}>
      <button className="sc-head" type="button" onClick={onToggle}>
        <div className="sc-head-left">
          <span className="sc-date">{fmtDate(s.occurredAt)}</span>
          <span className="sc-time">{fmtTime(s.occurredAt)}</span>
        </div>
        <div className="sc-badges">
          {s.durationMin && <span className="sc-badge">{s.durationMin} min</span>}
          {!isSecretary && typeof s.emotionalScale === 'number' && (
            <span className={`sc-badge sc-scale ${scaleColor(s.emotionalScale)}`}>
              {s.emotionalScale}/10
            </span>
          )}
          {!isSecretary && s.mood && <span className="sc-badge sc-mood">{s.mood}</span>}
          {!isSecretary && s.topics && s.topics.length > 0 && (
            <span className="sc-badge sc-topics-count">{s.topics.length} assunto{s.topics.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <svg className={`sc-chevron ${expanded ? 'sc-open' : ''}`} width="16" height="16"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="sc-body">
          {!isSecretary && s.topics && s.topics.length > 0 && (
            <div className="sc-field">
              <span className="sc-label">{t('c.topics')}</span>
              <div className="tags ro">{s.topics.map((tp) => <span className="tag" key={tp}>{tp}</span>)}</div>
            </div>
          )}
          {!isSecretary && s.objectives && (
            <div className="sc-field">
              <span className="sc-label">{t('c.objectives')}</span>
              <p className="sc-text">{s.objectives}</p>
            </div>
          )}
          {!isSecretary && s.evolution && (
            <div className="sc-field">
              <span className="sc-label">{t('c.evolution')}</span>
              <p className="sc-text">{s.evolution}</p>
            </div>
          )}
          {!isSecretary && s.techniques && (
            <div className="sc-field">
              <span className="sc-label">{t('c.techniques')}</span>
              <p className="sc-text">{s.techniques}</p>
            </div>
          )}
          {!isSecretary && s.nextSteps && (
            <div className="sc-field">
              <span className="sc-label">{t('c.nextSteps')}</span>
              <p className="sc-text sc-nextsteps">{s.nextSteps}</p>
            </div>
          )}
          {s.freeNotes && (
            <div className="sc-field">
              <span className="sc-label">{t('c.freeNotes')}</span>
              <p className="sc-text sc-notes">{s.freeNotes}</p>
            </div>
          )}
          {!s.freeNotes && !s.evolution && !s.objectives && !s.topics?.length && !s.techniques && !s.nextSteps && (
            <p className="sc-empty-detail">{t('c.noDetail')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Histórico com busca + accordion ──────────────────────────────────────────
function SessionHistory({
  sessions,
  loading,
  isSecretary,
}: {
  sessions: Session[];
  loading: boolean;
  isSecretary: boolean;
}) {
  const { t, lang } = useI18n();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    const locale = LOCALE[lang as keyof typeof LOCALE];
    return sessions.filter((s) => {
      const dateStr = new Date(s.occurredAt).toLocaleDateString(locale, {
        day: '2-digit', month: 'long', year: 'numeric',
      });
      return (
        dateStr.toLowerCase().includes(q) ||
        s.mood?.toLowerCase().includes(q) ||
        s.topics?.some((tp) => tp.toLowerCase().includes(q)) ||
        s.evolution?.toLowerCase().includes(q) ||
        s.objectives?.toLowerCase().includes(q) ||
        s.nextSteps?.toLowerCase().includes(q) ||
        s.freeNotes?.toLowerCase().includes(q)
      );
    });
  }, [sessions, search, lang]);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (loading) return <div className="hist-empty">{t('common.loading')}</div>;

  return (
    <div className="sc-history">
      <div className="sc-search-row">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="sc-search"
          placeholder={t('c.searchPlaceholder')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setExpandedId(null); }}
        />
        {search && (
          <button type="button" className="sc-search-clear" onClick={() => setSearch('')} aria-label="limpar">×</button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="hist-empty">
          <strong>{t('hist.emptyTitle')}</strong>
          <span>{isSecretary ? t('hist.emptySecretary') : t('hist.emptyText')}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="hist-empty">{t('c.searchEmpty')}</div>
      ) : (
        <div className="sc-list">
          {filtered.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              expanded={expandedId === s.id}
              onToggle={() => toggle(s.id)}
              isSecretary={isSecretary}
              lang={lang}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
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
  const user = getUser();
  const isSecretary = user?.role === 'secretary';
  const [mode, setMode] = useState<'form' | 'history'>('history');

  function handleSaved() {
    onSaved();
    setMode('history');
  }

  return (
    <div className="consulta-v2">
      {/* Alternador de modo */}
      <div className="consulta-toggle">
        <button
          type="button"
          className={`ctoggle-btn ${mode === 'form' ? 'on' : ''}`}
          onClick={() => setMode('form')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('c.newSession')}
        </button>
        <button
          type="button"
          className={`ctoggle-btn ${mode === 'history' ? 'on' : ''}`}
          onClick={() => setMode('history')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {t('c.history')}
          {sessions.length > 0 && <span className="ctoggle-count">{sessions.length}</span>}
        </button>
      </div>

      {/* Conteúdo */}
      {mode === 'form' && (
        isSecretary
          ? <SecretaryForm patientId={patientId} onSaved={handleSaved} />
          : <FullForm patientId={patientId} onSaved={handleSaved} />
      )}

      {mode === 'history' && (
        <div className="consulta-hist-view">
          {!isSecretary && <Panorama sessions={sessions} />}
          <SessionHistory sessions={sessions} loading={loadingSessions} isSecretary={isSecretary} />
        </div>
      )}
    </div>
  );
}
