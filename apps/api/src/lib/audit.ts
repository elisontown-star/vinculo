import { getDb } from './db';
import { auditLog } from '@vinculo/db/schema';
import type { Env } from '../types';

export async function audit(
  env: Env,
  entry: {
    clinicId: string;
    actorUserId?: string;
    action: string;
    entity: string;
    entityId?: string;
    metadata?: unknown;
  },
): Promise<void> {
  await getDb(env)
    .insert(auditLog)
    .values({
      clinicId: entry.clinicId,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    });
}
