import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { creditLedger, users } from '@sub/db'
import { PLANS } from '@sub/billing'
import { db } from '@/lib/server/db'
import { fail, json, readJson } from '@/lib/server/http'
import { clientIpHash } from '@/lib/server/ip'
import { recordAudit } from '@/lib/server/audit'
import { consumeEmailVerificationToken } from '@/lib/auth/tokens'
import { createAuthSession, destroyAuthSession } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VerifyBody = z.object({ token: z.string().min(16).max(200) })

export async function POST(req: Request) {
  const parsed = VerifyBody.safeParse(await readJson(req))
  if (!parsed.success) return fail(req, 400, 'INVALID_INPUT', 'Brak tokenu weryfikacyjnego.')

  const userId = await consumeEmailVerificationToken(parsed.data.token)
  if (!userId) {
    return fail(req, 400, 'INVALID_TOKEN', 'Link wygasł lub został już użyty. Poproś o nowy.')
  }

  const rows = await db()
    .select({ id: users.id, trialGrantedAt: users.trialGrantedAt, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const user = rows[0]
  if (!user || user.deletedAt) return fail(req, 400, 'INVALID_TOKEN', 'Konto nie istnieje.')

  const now = new Date()
  await db().update(users).set({ emailVerifiedAt: now }).where(eq(users.id, userId))

  // BILLING.md §4 — trial credits land once per account, and only after the
  // address is confirmed. The idempotency key makes a replayed link harmless.
  if (!user.trialGrantedAt) {
    await db()
      .insert(creditLedger)
      .values({
        userId,
        delta: String(PLANS.trial.credits),
        reason: 'trial_grant',
        bucket: 'trial',
        idempotencyKey: `trial_grant:${userId}`,
      })
      .onConflictDoNothing()
    await db()
      .update(users)
      .set({ trialGrantedAt: now })
      .where(and(eq(users.id, userId), isNull(users.trialGrantedAt)))
  }

  await destroyAuthSession()
  await createAuthSession(userId, req.headers)

  await recordAudit({
    actorUserId: userId,
    action: 'auth.email_verified',
    target: userId,
    ipHash: clientIpHash(req.headers),
  })

  return json({ ok: true, creditsGranted: user.trialGrantedAt ? 0 : PLANS.trial.credits }, req)
}
