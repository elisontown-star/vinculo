import { z } from 'zod';

// ---------------------------------------------------------------------------
// Extração assistida: a Ana lê um documento (PDF, Word, etc.) e PROPÕE o
// preenchimento do prontuário. Nada é gravado aqui — a proposta volta para o
// psicólogo revisar campo a campo. Regra do produto: a IA sugere, o psicólogo
// confirma.
// ---------------------------------------------------------------------------

// Campos do perfil ampliado que a Ana pode propor. Espelha o `profile` do
// paciente; qualquer chave fora desta lista é descartada na validação.
export const proposalSchema = z.object({
  profile: z
    .object({
      personal: z
        .object({
          sex: z.string().optional(),
          gender: z.string().optional(),
          maritalStatus: z.string().optional(),
          profession: z.string().optional(),
          company: z.string().optional(),
          education: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
        })
        .partial()
        .optional(),
      clinical: z
        .object({
          complaint: z.string().optional(),
          history: z.string().optional(),
          goals: z.string().optional(),
          suffering: z.string().optional(),
          psychiatric: z.string().optional(),
          priorDiagnoses: z.string().optional(),
          priorTreatments: z.string().optional(),
        })
        .partial()
        .optional(),
      health: z
        .object({
          medications: z.string().optional(),
          diseases: z.string().optional(),
          surgeries: z.string().optional(),
          hospitalizations: z.string().optional(),
          familyHistory: z.string().optional(),
        })
        .partial()
        .optional(),
      lifestyle: z
        .object({
          sports: z.string().optional(),
          gym: z.string().optional(),
          diet: z.string().optional(),
          sleep: z.string().optional(),
          alcohol: z.string().optional(),
          smoking: z.string().optional(),
          drugs: z.string().optional(),
          religion: z.string().optional(),
          spirituality: z.string().optional(),
        })
        .partial()
        .optional(),
      relationships: z
        .object({
          family: z.string().optional(),
          friends: z.string().optional(),
          work: z.string().optional(),
          romantic: z.string().optional(),
        })
        .partial()
        .optional(),
      financial: z
        .object({
          situation: z.string().optional(),
          debt: z.string().optional(),
          work: z.string().optional(),
          income: z.string().optional(),
        })
        .partial()
        .optional(),
    })
    .partial()
    .optional(),

  // Consulta encontrada no documento (ex.: uma anotação de sessão).
  session: z
    .object({
      occurredAt: z.string().optional(),
      durationMin: z.number().int().min(1).max(600).optional(),
      mood: z.string().optional(),
      emotionalScale: z.number().int().min(1).max(10).optional(),
      topics: z.array(z.string()).max(12).optional(),
      objectives: z.string().optional(),
      techniques: z.string().optional(),
      evolution: z.string().optional(),
      nextSteps: z.string().optional(),
      freeNotes: z.string().optional(),
    })
    .partial()
    .optional(),

  // Marcos datados para a linha do tempo.
  timeline: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        eventDate: z.string().optional(),
        year: z.number().int().min(1900).max(2200).optional(),
        category: z.string().max(60).optional(),
      }),
    )
    .max(20)
    .optional(),

  // Resumo curto do documento, mostrado no topo da revisão.
  summary: z.string().max(1200).optional(),
});

export type Proposal = z.infer<typeof proposalSchema>;

export const EXTRACT_SYSTEM = `Você é a Ana Luiza, assistente clínica do Vínculo Clínico.

TAREFA: ler o DOCUMENTO enviado pelo psicólogo e extrair APENAS informações que
estejam explicitamente escritas nele, devolvendo um JSON para preencher o
prontuário do paciente.

REGRAS INEGOCIÁVEIS:
- Nunca invente, deduza ou complete o que não está escrito. Na dúvida, omita o campo.
- Não gere diagnóstico, hipótese diagnóstica nem conduta. Apenas transcreva e organize.
- Omita completamente qualquer campo sem informação no documento. Não use "", null,
  "não informado" ou equivalentes.
- Se o documento não trouxer nada de útil para o prontuário, devolva {"summary": "..."}.
- Preserve os termos usados no documento; resuma sem interpretar.
- Datas no formato AAAA-MM-DD. Se só houver o ano, use o campo "year".

ONDE COLOCAR CADA COISA:
- "profile": características estáveis do paciente (quadro clínico, saúde, rotina,
  relações, trabalho, finanças).
- "session": use SOMENTE se o documento for o registro de um atendimento específico
  (anotação de sessão, evolução). "emotionalScale" de 1 a 10 apenas se houver escala
  explícita no texto.
- "timeline": acontecimentos datados e marcantes (internações, perdas, mudanças,
  início de tratamento, diagnósticos recebidos de terceiros).
- "summary": 2 a 4 frases dizendo o que é o documento e o que foi aproveitado.

SAÍDA: responda com um único objeto JSON válido, sem texto antes ou depois,
sem cercas de código.`;

// A IA às vezes embrulha o JSON em texto ou em cercas de código.
// Extrai o primeiro objeto JSON balanceado da resposta.
export function parseJsonObject(text: string): unknown | null {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// Remove chaves sem valor útil para a proposta não sugerir campos vazios.
export function pruneEmpty<T>(value: T): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s || /^(não informado|nao informado|n\/a|na|-|null)$/i.test(s)) return undefined;
    return s as unknown as T;
  }
  if (Array.isArray(value)) {
    const arr = value.map(pruneEmpty).filter((v) => v !== undefined);
    return (arr.length ? arr : undefined) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = pruneEmpty(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return (Object.keys(out).length ? out : undefined) as unknown as T;
  }
  return value;
}
