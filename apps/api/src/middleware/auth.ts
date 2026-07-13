import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import type { AppBindings } from '../types';

// Garante que o usuário autenticado tem um dos papéis permitidos.
export function requireRole(...roles: string[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'forbidden' }, 403);
    }
    await next();
  });
}

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
      .bind(String(payload.sub))
      .first<{ token_version: number }>();
    if (!row || row.token_version !== tokenVersion) {
      return c.json({ error: 'token_revoked' }, 401);
    }
  }

  c.set('user', {
    userId: String(payload.sub),
    clinicId: String(payload.cid),
    role: String(payload.role) as any,
    name: String(payload.name ?? ''),
  });
  await next();
});
