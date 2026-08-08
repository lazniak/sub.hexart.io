import type { EndReason } from '@sub/contracts'

/**
 * Process-local session index.
 *
 * A session lives in exactly one relay process for its whole life (sticky routing
 * by `sessionId`), so this map is authoritative — there is no cross-process view
 * to reconcile. Concurrency counters live here for the same reason: the plan
 * limit is checked against what this process is actually running.
 */

export interface SessionHandle {
  readonly sessionId: string
  readonly userId: string
  /** Opaque, read-only, valid for this session only. Ends up in somebody's OBS. */
  readonly projectorToken: string
  close(reason: EndReason): Promise<void>
}

export class SessionRegistry<T extends SessionHandle = SessionHandle> {
  private readonly sessions = new Map<string, T>()
  private readonly byProjectorToken = new Map<string, string>()
  private readonly perUser = new Map<string, number>()

  register(session: T): void {
    if (this.sessions.has(session.sessionId)) {
      throw new Error(`session ${session.sessionId} is already registered`)
    }
    this.sessions.set(session.sessionId, session)
    this.byProjectorToken.set(session.projectorToken, session.sessionId)
    this.perUser.set(session.userId, (this.perUser.get(session.userId) ?? 0) + 1)
  }

  unregister(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.sessions.delete(sessionId)
    this.byProjectorToken.delete(session.projectorToken)
    const remaining = (this.perUser.get(session.userId) ?? 1) - 1
    if (remaining > 0) this.perUser.set(session.userId, remaining)
    else this.perUser.delete(session.userId)
  }

  get(sessionId: string): T | undefined {
    return this.sessions.get(sessionId)
  }

  byToken(projectorToken: string): T | undefined {
    const sessionId = this.byProjectorToken.get(projectorToken)
    return sessionId === undefined ? undefined : this.sessions.get(sessionId)
  }

  /** Sessions this user is running right now, checked against `plan.maxConcurrentSessions`. */
  activeFor(userId: string): number {
    return this.perUser.get(userId) ?? 0
  }

  get size(): number {
    return this.sessions.size
  }

  list(): T[] {
    return [...this.sessions.values()]
  }

  /** Used by the SIGTERM drain: close everything, tolerate individual failures. */
  async closeAll(reason: EndReason): Promise<void> {
    await Promise.allSettled(this.list().map((session) => session.close(reason)))
  }
}
