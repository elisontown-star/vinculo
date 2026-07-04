import { drizzle } from 'drizzle-orm/d1';
import { schema } from '@vinculo/db';
import type { Env } from '../types';

export const getDb = (env: Env) => drizzle(env.DB, { schema });
export type DB = ReturnType<typeof getDb>;
