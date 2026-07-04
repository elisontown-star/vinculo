import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { AppBindings } from './types';
import { authRoutes } from './routes/auth';
import { patientRoutes } from './routes/patients';

const app = new Hono<AppBindings>();

// Cabeçalhos de segurança.
app.use('*', secureHeaders());

// CORS: em desenvolvimento libera qualquer localhost/127.0.0.1 (qualquer porta);
// em produção, restringe às origens de WEB_ORIGIN (várias separadas por vírgula).
app.use('*', (c, next) =>
  cors({
    origin: (origin) => {
      const allowed = (c.env.WEB_ORIGIN ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const ok =
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        /^https:\/\/[a-z0-9-]+\.pages\.dev$/.test(origin) ||
        allowed.includes(origin);
      return ok ? origin : (allowed[0] ?? null);
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })(c, next),
);

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'vinculo-api',
    env: c.env.APP_ENV ?? 'unknown',
    time: new Date().toISOString(),
  }),
);

app.route('/auth', authRoutes);
app.route('/patients', patientRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
