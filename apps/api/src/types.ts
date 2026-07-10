export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  JWT_SECRET: string;
  APP_ENV: string;
  // Origem(ns) permitida(s) no CORS (separadas por vírgula).
  WEB_ORIGIN: string;
  // Chave da API do Resend (envio de e-mail). Configurada como secret.
  RESEND_API_KEY: string;
  // Workers AI — Ana Luiza usa para sugerir perguntas de sessão.
  AI: Ai;
  // Armazenamento de arquivos (biblioteca do paciente) no R2.
  DOCS: R2Bucket;
  // Vectorize (VEC) entra depois, quando o RAG começar.
}

export interface AuthUser {
  userId: string;
  clinicId: string;
  role: string;
}

export type AppBindings = {
  Bindings: Env;
  Variables: { user: AuthUser };
};
