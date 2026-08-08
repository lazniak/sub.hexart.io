import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '@sub/db'
import { db } from '@/lib/server/db'
import { fail, json, readJson } from '@/lib/server/http'
import { clientIp, clientIpHash } from '@/lib/server/ip'
import { recordAudit } from '@/lib/server/audit'
import { consumeRateLimit } from '@/lib/auth/rate-limit'
import { verifyPassword } from '@/lib/auth/password'
import { createAuthSession, destroyAuthSession } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LoginBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1),
})

export async function POST(req: Request) {
  const limit = await consumeRateLimit('login', clientIp(req.headers))
  if (!limit.allowed) {
    return fail(req, 429, 'RATE_LIMITED', 'Zbyt wiele prób logowania. Spróbuj za chwilę.', {
      retryAfterSeconds: limit.retryAfterSeconds,
    })
  }

  const parsed = LoginBody.safeParse(await readJson(req))
  if (!parsed.success) {
    return fail(req, 400, 'INVALID_INPUT', 'Podaj adres e-mail i hasło.')
  }

  const email = parsed.data.email.trim().toLowerCase()
  const rows = await db()
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      emailVerifiedAt: users.emailVerifiedAt,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  const user = rows[0]
  // Verify against a dummy hash when the account is missing, so response timing
  // does not tell an attacker which addresses are registered.
  const stored = user?.passwordHash ?? DUMMY_HASH
  const ok = await verifyPassword(stored, parsed.data.password)

  if (!user || user.deletedAt || !user.passwordHash || !ok) {
    return fail(req, 401, 'INVALID_CREDENTIALS', 'Nieprawidłowy e-mail lub hasło.')
  }

  // Session id rotates on every login — a fixated cookie cannot survive it.
  await destroyAuthSession()
  await createAuthSession(user.id, req.headers)

  await recordAudit({
    actorUserId: user.id,
    action: 'auth.login',
    target: user.id,
    ipHash: clientIpHash(req.headers),
  })

  return json({ ok: true, emailVerified: user.emailVerifiedAt !== null }, req)
}

/** Valid argon2id encoding of a value nobody knows; only its cost matters. */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c3ViLWhleGFydC1kdW1teQ$0ZQqZ0m4hR0Yx8m3xGZ1Zg2vWJ0bJxHqfQm1YQZ2Zg0'
