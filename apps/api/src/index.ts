import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { AppBindings } from './types';
import { authRoutes } from './routes/auth';
import { patientRoutes } from './routes/patients';
import { adminRoutes } from './routes/admin';
import { teamRoutes } from './routes/team';
import { appointmentRoutes } from './routes/appointments';
import { metaRoutes } from './routes/meta';
import { sharesRoutes } from './routes/shares';

const app = new Hono<AppBindings>();

// Cabeçalhos de segurança.
app.use('*', secureHeaders());

// CORS: em desenvolvimento libera localhost; em produção restringe às origens
// de WEB_ORIGIN. Localhost só é permitido quando APP_ENV !== 'production'.
app.use('*', (c, next) =>
  cors({
    origin: (origin) => {
      const allowed = (c.env.WEB_ORIGIN ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      const isDev = c.env.APP_ENV !== 'production';
      const ok = (isLocalhost && isDev) || allowed.includes(origin);
      return ok ? origin : (allowed[0] ?? null);
    },
    allowHeaders: ['Content-Type', 'Authorization', 'X-Device-Token'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })(c, next),
);

// Health check com verificação real das dependências (DB e KV).
app.get('/health', async (c) => {
  const checks: Record<string, string> = {};
  try {
    await c.env.DB.prepare('SELECT 1').first();
    checks.db = 'ok';
  } catch {
    checks.db = 'error';
  }
  try {
    const probe = `health:probe:${Date.now()}`;
    await c.env.CACHE.put(probe, '1', { expirationTtl: 10 });
    await c.env.CACHE.delete(probe);
    checks.kv = 'ok';
  } catch {
    checks.kv = 'error';
  }
  const ok = Object.values(checks).every((v) => v === 'ok');
  return c.json({ ok, service: 'vinculo-api', time: new Date().toISOString(), checks }, ok ? 200 : 503);
});

app.route('/auth', authRoutes);
app.route('/patients', patientRoutes);
app.route('/admin', adminRoutes);
app.route('/team', teamRoutes);
app.route('/appointments', appointmentRoutes);
app.route('/meta', metaRoutes);
app.route('/shares', sharesRoutes);

export default app;
