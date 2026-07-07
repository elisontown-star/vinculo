import { useMemo, useState, useEffect } from 'react';
import { api, type Patient, type Session, type TimelineEvent } from '../lib/api';
import { useI18n } from '../i18n';
import { AnaFace } from '../anaAvatar';
import { LOCALE } from '../locales';

function ageFrom(ms?: number | null): number | null {
  if (!ms) return null;
  const b = new Date(ms);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

function get(obj: any, path: string) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Conta a frequência de assuntos ao longo das sessões (temas recorrentes).
function recurringTopics(sessions: Session[]): { topic: string; count: number }[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    for (const raw of s.topics ?? []) {
      const topic = raw.trim();
      if (!topic) continue;
      map.set(topic, (map.get(topic) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .filter((x) => x.count >= 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export default function AnaLuizaTab({
  patient,
  sessions,
  events,
}: {
  patient: Patient;
  sessions: Session[];
  events: TimelineEvent[];
}) {
  const { t, lang } = useI18n();
  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString(LOCALE[lang], { day: '2-digit', month: 'short', year: 'numeric' });

  const age = ageFrom(patient.birthDate);
  const profile = patient.profile ?? {};

  const sorted = useMemo(() => [...sessions].sort((a, b) => b.occurredAt - a.occurredAt), [sessions]);
  const last = sorted[0];
  const scaled = useMemo(
    () => sorted.filter((s) => typeof s.emotionalScale === 'number').reverse(),
    [sorted],
  );
  const avgScale = scaled.length
    ? Math.round((scaled.reduce((acc, s) => acc + (s.emotionalScale as number), 0) / scaled.length) * 10) / 10
    : null;
  const trend =
    scaled.length >= 2
      ? (scaled[scaled.length - 1].emotionalScale as number) - (scaled[0].emotionalScale as number)
      : null;

  const topics = useMemo(() => recurringTopics(sessions), [sessions]);
  const confirmedEvents = useMemo(
    () => [...events].filter((e) => e.status !== 'rejected').sort((a, b) => (b.eventDate ?? 0) - (a.eventDate ?? 0)),
    [events],
  );

  const complaint = get(profile, 'clinical.complaint');
  const goals = get(profile, 'clinical.goals');
  const suffering = get(profile, 'clinical.suffering');

  // Sinalizações que valem destaque (não é diagnóstico — apenas leitura dos dados).
  const flags: string[] = [];
  if (get(profile, 'health.depression')) flags.push(t('f.depression'));
  if (get(profile, 'health.anxiety')) flags.push(t('f.anxiety'));
  if (get(profile, 'health.bipolar')) flags.push(t('f.bipolar'));
  if (get(profile, 'health.tdah')) flags.push(t('f.tdah'));
  if (get(profile, 'health.tag')) flags.push(t('f.tag'));

  const empty = sessions.length === 0 && !complaint && events.length === 0;

  // Ana Luiza (IA): sugere perguntas para a próxima sessão ao abrir a aba.
  const [aiQuestions, setAiQuestions] = useState<string[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);

  useEffect(() => {
    let alive = true;
    if (empty) return;
    setAiLoading(true);
    setAiError(false);
    api
      .aiQuestions(patient.id)
      .then((r) => {
        if (alive) setAiQuestions(r.questions ?? []);
      })
      .catch(() => {
        if (alive) setAiError(true);
      })
      .finally(() => {
        if (alive) setAiLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [patient.id, empty]);

  return (
    <div className="ana-tab">
      <div className="ana-hero">
        <div className="ana-avatar"><AnaFace className="ana-avatar-face" /></div>
        <div className="ana-hero-txt">
          <h3>{t('ana.title')}</h3>
          <p>{t('ana.subtitle')}</p>
        </div>
      </div>

      <p className="ana-disclaimer">{t('ana.disclaimer')}</p>

      {empty ? (
        <div className="ana-empty">{t('ana.empty')}</div>
      ) : (
        <>
          {/* Indicadores rápidos */}
          <div className="ana-metrics">
            <div className="ana-metric">
              <span className="am-value">{sessions.length}</span>
              <span className="am-label">{t('ana.m.sessions')}</span>
            </div>
            <div className="ana-metric">
              <span className="am-value">{avgScale ?? '—'}</span>
              <span className="am-label">{t('ana.m.avgScale')}</span>
            </div>
            <div className="ana-metric">
              <span className="am-value">
                {trend == null ? '—' : trend > 0 ? `▲ ${trend}` : trend < 0 ? `▼ ${Math.abs(trend)}` : '='}
              </span>
              <span className="am-label">{t('ana.m.trend')}</span>
            </div>
            <div className="ana-metric">
              <span className="am-value">{confirmedEvents.length}</span>
              <span className="am-label">{t('ana.m.events')}</span>
            </div>
          </div>

          {/* Resumo narrativo */}
          <section className="ana-card">
            <h4>{t('ana.overview')}</h4>
            <p className="ana-para">
              {patient.fullName}
              {age != null ? `, ${age} ${t('hdr.years')}` : ''}
              {suffering ? ` · ${t('f.suffering')}: ${suffering}` : ''}.
              {' '}
              {complaint
                ? `${t('ana.mainComplaint')}: ${complaint}`
                : t('ana.noComplaint')}
            </p>
            {goals && (
              <p className="ana-para">
                <strong>{t('f.goals')}:</strong> {goals}
              </p>
            )}
            {last && (
              <p className="ana-para ana-last">
                <strong>{t('ana.lastSession')}</strong> ({fmtDate(last.occurredAt)})
                {last.mood ? ` — ${last.mood}` : ''}
                {typeof last.emotionalScale === 'number' ? ` · ${last.emotionalScale}/10` : ''}
                {last.evolution ? `. ${last.evolution}` : ''}
              </p>
            )}
          </section>

          {/* Perguntas sugeridas pela IA para a próxima sessão */}
          <section className="ana-card ana-ai">
            <h4>
              <span className="ana-ai-spark">✦</span> {t('ana.aiQuestions')}
            </h4>
            {aiLoading && <p className="ana-para ana-ai-loading">{t('ana.aiLoading')}</p>}
            {aiError && <p className="ana-para ana-ai-err">{t('ana.aiError')}</p>}
            {!aiLoading && !aiError && aiQuestions && aiQuestions.length === 0 && (
              <p className="ana-para">{t('ana.aiEmpty')}</p>
            )}
            {!aiLoading && !aiError && aiQuestions && aiQuestions.length > 0 && (
              <ol className="ana-ai-list">
                {aiQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            )}
            <p className="ana-ai-note">{t('ana.aiNote')}</p>
          </section>

          {/* Sinalizações */}
          {flags.length > 0 && (
            <section className="ana-card">
              <h4>{t('ana.flags')}</h4>
              <div className="ana-chips">
                {flags.map((f) => (
                  <span key={f} className="ana-chip warn">
                    {f}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Temas recorrentes */}
          {topics.length > 0 && (
            <section className="ana-card">
              <h4>{t('ana.topics')}</h4>
              <div className="ana-chips">
                {topics.map((x) => (
                  <span key={x.topic} className="ana-chip">
                    {x.topic}
                    {x.count > 1 && <b className="ana-chip-n">{x.count}</b>}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Marcos da linha do tempo */}
          {confirmedEvents.length > 0 && (
            <section className="ana-card">
              <h4>{t('ana.milestones')}</h4>
              <ul className="ana-events">
                {confirmedEvents.slice(0, 6).map((e) => (
                  <li key={e.id}>
                    <span className="ana-ev-date">{e.eventDate ? fmtDate(e.eventDate) : '—'}</span>
                    <span className="ana-ev-title">{e.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
