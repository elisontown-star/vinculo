import { useState, useRef, useEffect } from 'react';
import { api } from './lib/api';
import { useI18n } from './i18n';
import { AnaFace } from './anaAvatar';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function AnaChat({ patientId }: { patientId?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError('');
    try {
      const res = await api.anaChat({ patientId, messages: next.slice(-12) });
      setMessages((m) => [...m, { role: 'assistant', content: res.answer }]);
    } catch {
      setError(t('anaChat.error'));
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {!open && (
        <button className="ana-fab" onClick={() => setOpen(true)} title={t('anaChat.open')}>
          <AnaFace className="ana-fab-face" />
        </button>
      )}

      {open && (
        <div className="ana-chat">
          <div className="ana-chat-head">
            <span className="ana-chat-title">
              <AnaFace className="ana-fab-face" /> {t('anaChat.title')}
            </span>
            <button className="ana-chat-close" onClick={() => setOpen(false)}>×</button>
          </div>

          <div className="ana-chat-body" ref={bodyRef}>
            {messages.length === 0 && (
              <div className="ana-chat-welcome">
                <p>{t('anaChat.welcome')}</p>
                {patientId && <p className="ana-chat-ctx">{t('anaChat.hasPatient')}</p>}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ana-msg ${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="ana-msg assistant ana-typing">{t('anaChat.typing')}</div>}
            {error && <div className="ana-chat-err">{error}</div>}
          </div>

          <div className="ana-chat-input">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={t('anaChat.placeholder')}
              disabled={busy}
            />
            <button onClick={send} disabled={busy || !input.trim()}>➤</button>
          </div>
          <p className="ana-chat-note">{t('anaChat.note')}</p>
        </div>
      )}
    </>
  );
}
