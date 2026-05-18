import type { D1Database } from '@cloudflare/workers-types';
import type { JWTPayload } from '../types';

export async function auditLog(
  db: D1Database,
  user: JWTPayload,
  action: string,
  entityType: string,
  entityId: number | null,
  note?: string
): Promise<void> {
  try {
    await db
      .prepare(
        'INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, note) VALUES (?,?,?,?,?,?)'
      )
      .bind(user.sub, user.name, action, entityType, entityId, note ?? null)
      .run();
  } catch (err) {
    console.error('[auditLog] failed to write audit record', { action, entityType, entityId, err });
  }
}
