# Boas práticas de registro clínico — Vínculo

Referência que orienta a estrutura de dados e as telas do Vínculo, baseada nas normas do
Conselho Federal de Psicologia (CFP) e em boas práticas de anamnese e evolução. **Não é
parecer jurídico** — antes de um lançamento real, valide com assessoria as normas do CFP e a
LGPD aplicáveis à sua realidade.

## Fontes consultadas

- **Resolução CFP nº 001/2009** (atualizada pela nº 05/2010) — obrigatoriedade e conteúdo do
  registro documental / prontuário psicológico.
- **Lei nº 13.787/2018** — digitalização e uso de sistemas informatizados para guarda de prontuário.
- **Manual Orientativo de Registro e Elaboração de Documentos Psicológicos (CFP)**.
- Materiais sobre **anamnese psicológica** e formatos de **nota de evolução** (SOAP / DAP / BIRP /
  evolução livre).

## Princípios (CFP)

1. **Obrigatoriedade.** Todo atendimento gera registro, mantido permanentemente atualizado.
2. **Conteúdo mínimo (Art. 2º, Res. 001/2009):**
   - identificação do usuário;
   - avaliação da demanda e definição de objetivos do trabalho;
   - registro da evolução e dos procedimentos técnico-científicos;
   - registro de encaminhamento ou encerramento.
3. **Forma de escrever.** Objetivo, factual, sem julgamentos; não é preciso transcrever toda a
   fala. Usar verbos de autoria ("relatou", "informou") e aspas ao citar o paciente.
4. **Sigilo e guarda.** Caráter sigiloso; armazenamento por no mínimo **5 anos**; paciente tem
   direito de acesso ao próprio prontuário.
5. **Área de acesso restrito.** Hipóteses diagnósticas, reflexões clínicas e instrumentos de
   avaliação ficam em espaço de acesso exclusivo do psicólogo.

## Anamnese — roteiro de referência

Identificação · Queixa principal (nas palavras do paciente) · História da queixa (início, curso,
gatilhos) · História familiar · História médica e psicológica (diagnósticos, medicações, terapias
anteriores) · Situação atual (eventos recentes, nível de sofrimento, impacto) · Hábitos e estilo de
vida (rotina, sono, alimentação, atividade física, lazer) · Objetivos terapêuticos.

## Como o Vínculo implementa

| Boas práticas | Onde está no Vínculo | Status |
|---|---|---|
| Identificação do usuário | Ficha › Dados pessoais | ✅ |
| História familiar, saúde, estilo de vida | Ficha › seções correspondentes | ✅ |
| Queixa, história da queixa, objetivos, diagnósticos/tratamentos prévios, encaminhamentos | Ficha › **Quadro clínico (anamnese)** | ✅ |
| Evolução por sessão (humor, escala, assuntos, técnicas, evolução, próximos passos) | Aba Consulta | ✅ |
| Escrita objetiva e factual | Dica na tela de consulta | ✅ |
| Linha do tempo do paciente | Aba Linha do tempo | ✅ |
| Registro de encerramento/alta (motivo + resumo da trajetória) | — | ⏳ próximo |
| Nota/alerta de risco na sessão | — | ⏳ próximo |
| Área de acesso restrito (hipóteses/reflexões) | — | ⏳ próximo |
| Guarda ≥ 5 anos, consentimento, acesso do paciente, auditoria | Auditoria já existe; consentimento/retenção | ⏳ Etapa 4 (governança) |

## Próximos incrementos sugeridos

- **Encerramento/alta** do processo (motivo e resumo), atendendo ao inciso IV do Art. 2º.
- **Campo de risco** por sessão (sinalização), alimentando os alertas da Etapa 3.
- **Espaço de acesso restrito** ao psicólogo para hipóteses e reflexões.
- Na **Etapa 2 (IA)**, o resumo pré-consulta será redigido de forma objetiva e factual, e as
  sugestões de eventos/insights entrarão sempre como "sugerido → confirmado" pelo psicólogo,
  nunca como diagnóstico.
