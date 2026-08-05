import { useMemo, useState } from 'react';
import { api } from './lib/api';
import type { AnaExtractResult, AnaProfile, AnaSession, AnaTimelineEvent } from './lib/api';

// Rótulos amigáveis para os campos que a Ana pode propor.
const GRUPOS: Record<string, string> = {
  personal: 'Dados pessoais',
  clinical: 'Quadro clínico',
  health: 'Saúde',
  lifestyle: 'Estilo de vida',
  relationships: 'Relacionamentos',
  financial: 'Situação financeira',
};

const CAMPOS: Record<string, string> = {
  sex: 'Sexo', gender: 'Gênero', maritalStatus: 'Estado civil', profession: 'Profissão',
  company: 'Empresa', education: 'Escolaridade', city: 'Cidade', state: 'Estado',
  complaint: 'Queixa principal', history: 'Histórico', goals: 'Objetivos do processo',
  suffering: 'Nível de sofrimento', psychiatric: 'Acompanhamento psiquiátrico',
  priorDiagnoses: 'Diagnósticos anteriores', priorTreatments: 'Tratamentos anteriores',
  medications: 'Medicações', diseases: 'Doenças', surgeries: 'Cirurgias',
  hospitalizations: 'Internações', familyHistory: 'Histórico familiar',
  sports: 'Esportes', gym: 'Academia', diet: 'Alimentação', sleep: 'Sono',
  alcohol: 'Álcool', smoking: 'Tabagismo', drugs: 'Drogas', religion: 'Religião',
  spirituality: 'Espiritualidade',
  family: 'Família', friends: 'Amigos', work: 'Trabalho', romantic: 'Vida amorosa',
  situation: 'Situação', debt: 'Endividamento', income: 'Renda',
  occurredAt: 'Data', durationMin: 'Duração (min)', mood: 'Humor',
  emotionalScale: 'Escala emocional', topics: 'Assuntos', objectives: 'Objetivos',
  techniques: 'Técnicas', evolution: 'Evolução', nextSteps: 'Próximos passos',
  freeNotes: 'Notas',
};

const rotulo = (k: string) => CAMPOS[k] ?? k;

function textoDe(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

type Props = {
  patientId: string;
  result: AnaExtractResult;
  onCancel: () => void;
  onApplied: (resumo: string) => void;
};

export default function AnaExtractReview({ patientId, result, onCancel, onApplied }: Props) {
  const { proposal, fileName, truncated } = result;

  // Cada item selecionável tem uma chave estável: "profile.grupo.campo",
  // "session.campo" ou "timeline.indice".
  const itens = useMemo(() => {
    const chaves: string[] = [];
    for (const [grupo, campos] of Object.entries(proposal.profile ?? {})) {
      for (const campo of Object.keys(campos ?? {})) chaves.push(`profile.${grupo}.${campo}`);
    }
    for (const campo of Object.keys(proposal.session ?? {})) chaves.push(`session.${campo}`);
    (proposal.timeline ?? []).forEach((_, i) => chaves.push(`timeline.${i}`));
    return chaves;
  }, [proposal]);

  // Tudo vem marcado; o psicólogo desmarca o que não quer.
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(itens));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const alterna = (k: string) =>
    setMarcados((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const nada = itens.length === 0;

  async function aplicar() {
    if (marcados.size === 0 || salvando) return;
    setSalvando(true);
    setErro('');

    const profile: AnaProfile = {};
    for (const [grupo, campos] of Object.entries(proposal.profile ?? {})) {
      for (const [campo, valor] of Object.entries(campos ?? {})) {
        if (!marcados.has(`profile.${grupo}.${campo}`)) continue;
        profile[grupo] = { ...(profile[grupo] ?? {}), [campo]: valor as string };
      }
    }

    const session: AnaSession = {};
    for (const [campo, valor] of Object.entries(proposal.session ?? {})) {
      if (marcados.has(`session.${campo}`)) (session as any)[campo] = valor;
    }

    const timeline: AnaTimelineEvent[] = (proposal.timeline ?? []).filter((_, i) =>
      marcados.has(`timeline.${i}`),
    );

    try {
      const res = await api.anaApply(patientId, {
        profile: Object.keys(profile).length ? profile : undefined,
        session: Object.keys(session).length ? session : undefined,
        timeline: timeline.length ? timeline : undefined,
      });
      const partes: string[] = [];
      if (res.applied.profileFields) partes.push(`${res.applied.profileFields} campo(s) da ficha`);
      if (res.applied.session) partes.push('1 consulta');
      if (res.applied.timeline) partes.push(`${res.applied.timeline} marco(s) na linha do tempo`);
      onApplied(partes.length ? `Preenchi ${partes.join(', ')}.` : 'Nada foi alterado.');
    } catch {
      setErro('Não consegui gravar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="ana-extract">
      <div className="ana-extract-head">
        <strong>Li o documento</strong>
        <span className="ana-extract-file">{fileName}</span>
      </div>

      {proposal.summary && <p className="ana-extract-summary">{proposal.summary}</p>}
      {truncated && (
        <p className="ana-extract-warn">
          O documento é longo — li apenas o trecho inicial.
        </p>
      )}

      {nada ? (
        <p className="ana-extract-empty">
          Não encontrei informações que se encaixem no prontuário. O arquivo ficou salvo na
          biblioteca do paciente.
        </p>
      ) : (
        <>
          <p className="ana-extract-hint">
            Desmarque o que não quiser gravar. Nada é salvo sem a sua confirmação.
          </p>

          {/* Ficha do paciente */}
          {Object.entries(proposal.profile ?? {}).map(([grupo, campos]) => (
            <div className="ana-extract-group" key={grupo}>
              <h4>{GRUPOS[grupo] ?? grupo}</h4>
              {Object.entries(campos ?? {}).map(([campo, valor]) => {
                const k = `profile.${grupo}.${campo}`;
                return (
                  <label className="ana-extract-item" key={k}>
                    <input type="checkbox" checked={marcados.has(k)} onChange={() => alterna(k)} />
                    <span className="ana-extract-label">{rotulo(campo)}</span>
                    <span className="ana-extract-value">{textoDe(valor)}</span>
                  </label>
                );
              })}
            </div>
          ))}

          {/* Consulta */}
          {proposal.session && Object.keys(proposal.session).length > 0 && (
            <div className="ana-extract-group">
              <h4>Nova consulta</h4>
              {Object.entries(proposal.session).map(([campo, valor]) => {
                const k = `session.${campo}`;
                return (
                  <label className="ana-extract-item" key={k}>
                    <input type="checkbox" checked={marcados.has(k)} onChange={() => alterna(k)} />
                    <span className="ana-extract-label">{rotulo(campo)}</span>
                    <span className="ana-extract-value">{textoDe(valor)}</span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Linha do tempo */}
          {(proposal.timeline?.length ?? 0) > 0 && (
            <div className="ana-extract-group">
              <h4>Linha do tempo</h4>
              <p className="ana-extract-sub">Entram como sugestões, para você confirmar depois.</p>
              {proposal.timeline!.map((ev, i) => {
                const k = `timeline.${i}`;
                const quando = ev.eventDate
                  ? new Date(ev.eventDate).toLocaleDateString('pt-BR')
                  : ev.year
                    ? String(ev.year)
                    : '';
                return (
                  <label className="ana-extract-item" key={k}>
                    <input type="checkbox" checked={marcados.has(k)} onChange={() => alterna(k)} />
                    <span className="ana-extract-label">{quando || 'sem data'}</span>
                    <span className="ana-extract-value">
                      {ev.title}
                      {ev.description ? ` — ${ev.description}` : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}

      {erro && <div className="ana-chat-err">{erro}</div>}

      <div className="ana-extract-actions">
        <button className="ghost" onClick={onCancel} disabled={salvando}>
          {nada ? 'Fechar' : 'Descartar'}
        </button>
        {!nada && (
          <button className="btn sm" onClick={aplicar} disabled={salvando || marcados.size === 0}>
            {salvando ? 'Gravando…' : `Gravar ${marcados.size} item(ns)`}
          </button>
        )}
      </div>
    </div>
  );
}
