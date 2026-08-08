import { auditLog } from '@sub/db'
import { db } from '@/lib/server/db'

export interface AuditEntry {
  actorUserId?: string | null
  action: string
  target?: string | null
  meta?: Record<string, unknown> | null
  ipHash?: string | null
}

/**
 * Audit writes must never take down the action they describe — a failed insert
 * is logged and swallowed, because losing the trail is strictly better than
 * failing a password change or an account deletion halfway through.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db()
      .insert(auditLog)
      .values({
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        target: entry.target ?? null,
        meta: entry.meta ?? null,
        ipHash: entry.ipHash ?? null,
      })
  } catch (err) {
    console.error('audit_write_failed', { action: entry.action, err: String(err) })
  }
}
