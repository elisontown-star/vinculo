# Vínculo — memória clínica inteligente para psicólogos

Monorepo do Vínculo, hospedado na **Cloudflare**. Este repositório contém a **Etapa 0 — Fundação** (o "esqueleto que anda"): já dá para **registrar uma clínica**, **fazer login** e **cadastrar/listar pacientes**, com **isolamento por clínica** garantido na camada de dados.

> ⚠️ **Dados sensíveis de saúde.** Antes de um lançamento real, valide juridicamente os prazos de retenção (LGPD × Conselho Federal de Psicologia) e os textos de consentimento. A IA do produto **observa e sugere, nunca diagnostica**.

## Arquitetura na Cloudflare

| Camada | Serviço | Papel |
|---|---|---|
| API / back-end | Workers + Hono (TS) | Rotas, autenticação, regras de negócio |
| Front-end | React + Vite | Painel (Web/Tablet + PWA no mobile) |
| Banco transacional | **D1** (SQLite) + Drizzle | Fonte da verdade. Isolamento multi-tenant por `clinic_id` |
| Busca semântica / RAG | Vectorize | 1 *namespace* por paciente (Etapa 2) |
| Embeddings | Workers AI `bge-m3` (1024d) | Vetorização do histórico (Etapa 2) |
| LLM (copiloto) | Claude via AI Gateway | Resumo humanizado pré-consulta (Etapa 2) |
| IA assíncrona | Cron + Queues + Workflows | Pré-computa resumos antes da sessão (Etapa 2) |
| Arquivos | R2 | Recibos, documentos, áudios (V2) |
| Cache | Workers KV | Resumos, fichas, busca |

## Estrutura

```
vinculo/
├─ packages/db/        # Schema Drizzle (11 tabelas, multi-tenant) + client
├─ apps/api/           # Worker + Hono (auth, pacientes) + migrações D1
└─ apps/web/           # React + Vite (login + pacientes)
```

## Pré-requisitos

- Node.js 18+ e npm
- Uma conta na Cloudflare (para o deploy)

---

## Rodar localmente

```bash
npm install
```

**1) Banco local (D1 simulado):**

```bash
# aplica as migrações num SQLite local
npm -w @vinculo/api run db:apply:local
```

> Para o modo local, o `database_id` no `apps/api/wrangler.jsonc` pode ficar como o placeholder. Ele só precisa ser real para o deploy remoto.

**2) Segredo de desenvolvimento** — crie `apps/api/.dev.vars`:

```
JWT_SECRET=uma-chave-longa-aleatoria-para-dev
```

**3) Suba a API e o front juntos (um terminal só):**

```bash
npm run dev
```

Isso sobe a API (`http://localhost:8787`) e o front (`http://localhost:5173`) ao mesmo tempo. Se preferir separados, use `npm run dev:api` e `npm run dev:web` em dois terminais.

Acesse `http://localhost:5173`, clique em **Cadastrar**, crie sua clínica e comece a adicionar pacientes.

---

## Subir na Cloudflare (produção)

Este primeiro deploy precisa criar só **D1 (banco)** e **KV (cache)**. Comandos a partir da pasta `apps/api` (exceto onde indicado).

```bash
# 1. Autenticar (abre o navegador)
npx wrangler login

# 2. Criar o banco D1 -> COLE o database_id em apps/api/wrangler.jsonc
npx wrangler d1 create vinculo

# 3. Criar o KV (cache) -> COLE o id em apps/api/wrangler.jsonc
npx wrangler kv namespace create CACHE

# 4. Definir o segredo do JWT (cole uma string longa e aleatória)
npx wrangler secret put JWT_SECRET

# 5. Aplicar as migrações no banco remoto
npx wrangler d1 migrations apply vinculo --remote

# 6. Publicar a API -> retorna uma URL *.workers.dev (guarde-a)
npx wrangler deploy
```

**7) Publicar o front-end (Cloudflare Pages)** — a partir de `apps/web`:

```bash
# aponte o front para a URL da API do passo 6
echo "VITE_API_URL=https://vinculo-api.SEU-SUBDOMINIO.workers.dev" > .env.production

# build + deploy no Pages (cria o projeto na 1ª vez)
npm run deploy
```

O CORS já aceita domínios `*.pages.dev`, então o app publicado funciona de imediato.

**8) Endurecer (opcional, produção):** troque `WEB_ORIGIN` em `apps/api/wrangler.jsonc` pela URL exata do seu front e `APP_ENV` para `"production"`; depois `npx wrangler deploy` de novo.

### Para a Etapa 2 (IA), você vai criar depois

```bash
npx wrangler vectorize create vinculo-pacientes --dimensions=1024 --metric=cosine
# e o AI Gateway + a chave da Anthropic, para chamar o Claude
```

---

## O que já funciona (Etapa 0)

- `POST /auth/register` — cria clínica + usuário dono, retorna token (JWT)
- `POST /auth/login` — autentica e retorna token
- `GET /patients` — lista pacientes **da sua clínica**
- `POST /patients` — cadastra paciente (registrado em auditoria)
- `GET /patients/:id` — abre um paciente (isolado por clínica)
- `GET /health` — verificação de saúde

Toda query de dados passa por `clinic_id`: um usuário **nunca** enxerga dados de outra clínica.

## Próximos passos

- **Etapa 1 — Núcleo clínico:** ficha completa do paciente, registro de consulta (humor, escala 1–10, assuntos, evolução), busca rápida, papéis (psicólogo/secretária) e o primeiro esboço dos portais.
- **Etapa 2 — Memória Inteligente:** ingestão → embeddings (bge-m3) → Vectorize; pipeline assíncrono que gera o resumo humanizado + perguntas sugeridas com o Claude; tela "Memória Inteligente".
- **Etapa 3+** — timeline & alertas, governança/RBAC/auditoria/consentimentos, portais completos e, na V2, gravação + transcrição de sessão.
