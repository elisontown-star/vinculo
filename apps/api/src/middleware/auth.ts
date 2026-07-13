import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import type { AppBindings } from '../types';

// Exige um JWT válido e injeta o usuário (com clinicId) no contexto.
// Também valida tokenVersion contra o banco para suportar revogação de sessões.
export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: 'missing_token' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await verify(token, c.env.JWT_SECRET, 'HS256') as Record<string, unknown>;
  } catch {
    return c.json({ error: 'invalid_token' }, 401);
  }

  // Validate tokenVersion to support session revocation (password/MFA resets).
  const tokenVersion = typeof payload.tv === 'number' ? payload.tv : null;
  if (tokenVersion !== null) {
    const row = await c.env.DB
      .prepare('SELECT token_version FROM users WHERE id = ? LIMIT 1')
      .bind(String(payload.su