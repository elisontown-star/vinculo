import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import type { AppBindings } from '../types';

// Exige um JWT válido e injeta o usuário (com clinicId) no contexto.
export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: 'missing_token' }, 401);

  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    c.set('user', {
      userId: String(payload.sub),
      clinicId: String(payload.cid),
      role: String(payload.role),
    });
  } catch {
    return c.json({ error: 'invalid_token' }, 401);
  }
  await next();
});

// Restringe uma rota a perfis específicos (RBAC).
export function requireRole(...roles: string[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) return c.json({ error: 'forbidden' }, 403);
    await next();
  });
}
