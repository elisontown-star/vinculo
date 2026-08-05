import { useState, useRef, useEffect } from 'react';
import { api, getUser } from './lib/api';
import type { AnaExtractResult, AnaAction } from './lib/api';
import { useI18n } from './i18n';
import { AnaFace } from './anaAvatar';
import AnaExtractReview from './AnaExtractReview';

type Msg = { role: 'user' | 'assistant'; content: string };

// Formatos que a Ana consegue ler (mesma allowlist do upload da biblioteca).
const ACEITOS = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp';
const MAX_BYTES = 15 * 1024 * 1024;

const ERROS: Record<string, string> = {
  invalid_mime_type: 'Formato não suportado. Envie PDF, Word, planilha ou imagem.',
  file_too_large: 'Arquivo muito grande (máximo 15 MB).',
  empty_file: 'O arquivo está vazio.',
  unreadable_document: 'Não consegui abrir esse documento.',
  no_text_found: 'Não encontrei texto legível no documento.',
  ai_failed: 'A leitura falhou. Tente novamente.',
  unparsable_response: 'A leitura falhou. Tente novamente.',
  invalid_proposal: 'A leitura falhou. Tente novamente.',
};

export default function AnaChat({ patientId }: { patientId?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lendo, setLendo] = useState(false);
  const [extracao, setExtracao] = useState<AnaExtractResult | null>(null);
  const [acao, setAcao] = useState<AnaAction | null>(null);
  const [agendando, setAgendando] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, lendo, extracao]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError('');
    try {
      // Só envia mensagens com conteúdo — a API rejeita strings vazias.
      const history = next.filter((m) => m.content?.trim()).slice(-12);
      const res = await api.anaChat({ patientId, messages: history });
      const reply = res.reply?.trim();
      if (!reply && !res.action) throw new Error('empty_reply');
      if (reply) setMessages((m) => [...m, { role: 'assistant', content: reply }]);
      setAcao(res.action ?? null);
    } catch {
      setError(t('anaChat.error'));
    } finally {
      setBusy(false);
    }
  }

  // Só aqui a consulta entra na agenda de verdade.
  async function confirmarAgendamento() {
    if (!acao || agendando) return;
    setAgendando(true);
    setError('');
    try {
      const me = getUser();
      if (!me?.id) throw new Error('no_user');
      await api.appointmentCreate({
        patientId: acao.patientId,
        psychologistId: me.id,
        startsAt: acao.startsAt,
        endsAt: acao.endsAt,
        notes: acao.notes || undefined,
      });
      const quando = new Date(acao.startsAt).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      setAcao(null);
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `Pronto — ${acao.patientName} está na agenda em ${quando}.` },
      ]);
    } catch {
      setError('Não consegui gravar na agenda. Verifique se o horário está livre.');
    } finally {
      setAgendando(false);
    }
  }

  async function anexar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite reenviar o mesmo arquivo
    if (!file || !patientId) return;
    if (file.size > MAX_BYTES) {
      setError(ERROS.file_too_large);
      return;
    }

    setError('');
    setLendo(true);
    setMessages((m) => [...m, { role: 'user', content: `📎 ${file.name}` }]);
    try {
      const res = await api.anaExtract(patientId, file);
      setExtracao(res);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(ERROS[code] ?? 'Não consegui ler o documento.');
    } finally {
      setLendo(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const ocupado = busy || lendo;

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
            <button className="ana-chat-close" onClick={() => setOpen(false)}>×</button>
            <AnaFace className="ana-title-face" />
            <span className="ana-chat-title">{t('anaChat.title')}</span>
          </div>

          <div className="ana-chat-body" ref={bodyRef}>
            {messages.length === 0 && !extracao && (
              <div className="ana-chat-welcome">
                <p>{t('anaChat.welcome')}</p>
                {patientId && <p className="ana-chat-ctx">{t('anaChat.hasPatient')}</p>}
                {patientId && (
                  <p className="ana-chat-ctx">
                    Você também pode anexar um PDF ou Word — eu leio e proponho o preenchimento
                    do prontuário.
                  </p>
                )}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ana-msg ${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="ana-msg assistant ana-typing">{t('anaChat.typing')}</div>}
            {lendo && <div className="ana-msg assistant ana-typing">Lendo o documento…</div>}

            {acao && (
              <div className="ana-action">
                <div className="ana-action-head">Confirmar agendamento</div>
                <dl className="ana-action-fields">
                  <dt>Paciente</dt>
                  <dd>{acao.patientName}</dd>
                  <dt>Data</dt>
                  <dd>
                    {new Date(acao.startsAt).toLocaleDateString('pt-BR', {
                      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
                    })}
                  </dd>
                  <dt>Horário</dt>
                  <dd>
                    {new Date(acao.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{acao.durationMin} min
                  </dd>
                  {acao.notes && (
                    <>
                      <dt>Observações</dt>
                      <dd>{acao.notes}</dd>
                    </>
                  )}
                </dl>
                <div className="ana-action-buttons">
                  <button className="ghost" onClick={() => setAcao(null)} disabled={agendando}>
                    Cancelar
                  </button>
                  <button className="btn sm" onClick={confirmarAgendamento} disabled={agendando}>
                    {agendando ? 'Agendando…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}

            {extracao && patientId && (
              <AnaExtractReview
                patientId={patientId}
                result={extracao}
                onCancel={() => setExtracao(null)}
                onApplied={(resumo) => {
                  setExtracao(null);
                  setMessages((m) => [...m, { role: 'assistant', content: resumo }]);
                }}
              />
            )}

            {error && <div className="ana-chat-err">{error}</div>}
          </div>

          <div className="ana-chat-input">
            <input
              ref={fileRef}
              type="file"
              accept={ACEITOS}
              onChange={anexar}
              style={{ display: 'none' }}
            />
            <button
              className="ana-clip"
              onClick={() => fileRef.current?.click()}
              disabled={ocupado || !patientId}
              title={patientId ? 'Anexar documento (PDF, Word, planilha ou imagem)' : 'Abra um paciente para anexar documentos'}
            >
              📎
            </button>
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={t('anaChat.placeholder')}
              disabled={ocupado}
            />
            <button onClick={send} disabled={ocupado || !input.trim()}>➤</button>
          </div>
          <p className="ana-chat-note">{t('anaChat.note')}</p>
        </div>
      )}
    </>
  );
}
