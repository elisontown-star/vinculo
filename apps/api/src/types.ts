export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  JWT_SECRET: string;
  APP_ENV: string;
  // Origem(ns) permitida(s) no CORS (separadas por vírgula).
  WEB_ORIGIN: string;
  // Workers AI — Ana Luiza usa para sugerir perguntas de sessão.
  AI: Ai;
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
