import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sign } from 'hono/jwt';
import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { clinics, users } from '@vinculo/db/schema';
import { hashPassword, verifyPassword } from '../lib/password';
import { audit } from '../lib/audit';
import { rateLimit, clientIp } from '../lib/ratelimit';
import type { AppBindings, Env } from '../types';

export const authRoutes = new Hono<AppBindings>();

type UserRow = { id: string; clinicId: string; role: string; name: string; email: string };

async function issueToken(env: Env, user: UserRow): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: user.id, cid: user.clinicId, role: user.role, iat: now, exp: now + 60 * 60 * 12 },
    env.JWT_SECRET,
    'HS256',
  );
}

const strongPassword = z
  .string()
  .min(8, 'weak_length')
  .max(72, 'weak_length')
  .refine((v) => /[a-z]/.test(v), 'weak_lower')
  .refine((v) => /[A-Z]/.test(v), 'weak_upper')
  .refine((v) => /[0-9]/.test(v), 'weak_number')
  .refine((v) => /[^A-Za-z0-9]/.test(v), 'weak_special');

const registerSchema = z.object({
  clinicName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: strongPassword,
});

// Cria a clínica (tenant) + o usuário dono. Ponto de entrada de uma nova clínica.
authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const ip = clientIp(c.req.raw.headers);
  if (!(await rateLimit(c.env, `register:${ip}`, 5, 300))) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  const { clinicName, name, email, password } = c.req.valid('json');
  const db = getDb(c.env);

  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) return c.json({ error: 'email_in_use' }, 409);

  const clinic = await db.insert(clinics).values({ name: clinicName }).returning().get();
  const passwordHash = await hashPassword(password);
  const user = await db
    .insert(users)
    .values({ clinicId: clinic.id, email, name, passwordHash, role: 'owner' })
    .returning()
    .get();

  await audit(c.env, {
    clinicId: clinic.id,
    actorUserId: user.id,
    action: 'register',
    entity: 'clinic',
    entityId: clinic.id,
  });

  const token = await issueToken(c.env, user);
  return c.json(
    { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } },
    201,
  );
});

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const ip = clientIp(c.req.raw.headers);
  if (!(await rateLimit(c.env, `login:${ip}`, 10, 60))) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  const { email, password } = c.req.valid('json');
  const db = getDb(c.env);

  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user || !user.isActive) return c.json({ error: 'invalid_credentials' }, 401);

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return c.json({ error: 'invalid_credentials' }, 401);

  const token = await issueToken(c.env, user);
  return c.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
