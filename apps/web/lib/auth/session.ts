import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt, ne } from 'drizzle-orm'
import { authSessions, users } from '@sub/db'
import { db } from '@/lib/server/db'
import { clientIpHash, userAgentFamily } from '@/lib/server/ip'

/**
 * `__Host-` forces Secure, Path=/ and no Domain attribute, which means the
 * cookie cannot be planted by a sibling subdomain. SECURITY.md §2.
 */
export const SESSION_COOKIE = '__Host-sub_session'

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
/** Slide the window once a third of it is gone; avoids a write on every request. */
const SLIDE_AFTER_SECONDS = 10 * 24 * 60 * 60

export interface SessionUser {
  id: string
  email: string
  emailVerifiedAt: Date | null
  planCode: string
  role: string
}

export interface AuthContext {
  sessionId: string
  user: SessionUser
}

/**
 * The cookie carries the raw token; the table stores only its digest. A dump of
 * `auth_sessions` therefore hands an attacker nothing they can replay.
 */
function digest(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('base64url')
}

const COOKIE_ATTRS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const

/** Issues a fresh session id. Called on login, on verification and after a password change. */
export async function createAuthSession(userId: string, headers: Headers): Promise<string> {
  const rawToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)

  await db()
    .insert(authSessions)
    .values({
      id: digest(rawToken),
      userId,
      expiresAt,
      ipHash: clientIpHash(headers),
      userAgentFamily: userAgentFamily(headers),
    })

  const store = await cookies()
  store.set(SESSION_COOKIE, rawToken, { ...COOKIE_ATTRS, maxAge: SESSION_TTL_SECONDS })
  return rawToken
}

export async function readAuthSession(): Promise<AuthContext | null> {
  const store = await cookies()
  const rawToken = store.get(SESSION_COOKIE)?.value
  if (!rawToken) return null

  const sessionId = digest(rawToken)
  const rows = await db()
    .select({
      sessionId: authSessions.id,
      expiresAt: authSessions.expiresAt,
      id: users.id,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      planCode: users.planCode,
      role: users.role,
      deletedAt: users.deletedAt,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.id, sessionId), gt(authSessions.expiresAt, new Date())))
    .limit(1)

  const row = rows[0]
  if (!row || row.deletedAt) return null

  await slideIfStale(row.sessionId, row.expiresAt, rawToken)

  return {
    sessionId: row.sessionId,
    user: {
      id: row.id,
      email: row.email,
      emailVerifiedAt: row.emailVerifiedAt,
      planCode: row.planCode,
      role: row.role,
    },
  }
}

async function slideIfStale(sessionId: string, expiresAt: Date, rawToken: string): Promise<void> {
  const remaining = expiresAt.getTime() - Date.now()
  if (remaining > (SESSION_TTL_SECONDS - SLIDE_AFTER_SECONDS) * 1000) return

  const next = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
  await db().update(authSessions).set({ expiresAt: next }).where(eq(authSessions.id, sessionId))
  try {
    const store = await cookies()
    store.set(SESSION_COOKIE, rawToken, { ...COOKIE_ATTRS, maxAge: SESSION_TTL_SECONDS })
  } catch {
    // Server components cannot write cookies. The row already slid, so the next
    // request through a route handler will re-issue the cookie.
  }
}

export async function destroyAuthSession(): Promise<void> {
  const store = await cookies()
  const rawToken = store.get(SESSION_COOKIE)?.value
  if (rawToken) {
    await db()
      .delete(authSessions)
      .where(eq(authSessions.id, digest(rawToken)))
  }
  store.set(SESSION_COOKIE, '', { ...COOKIE_ATTRS, maxAge: 0 })
}

/** Password, e-mail or 2FA change invalidates every other session. SECURITY.md §2. */
export async function revokeOtherSessions(userId: string, keepSessionId?: string): Promise<void> {
  const where = keepSessionId
    ? and(eq(authSessions.userId, userId), ne(authSessions.id, keepSessionId))
    : eq(authSessions.userId, userId)
  await db().delete(authSessions).where(where)
}

/** Rotate: drop every existing session for the account, then mint a new one. */
export async function rotateAuthSession(userId: string, headers: Headers): Promise<void> {
  await revokeOtherSessions(userId)
  await createAuthSession(userId, headers)
}

export async function currentUser(): Promise<SessionUser | null> {
  return (await readAuthSession())?.user ?? null
}
