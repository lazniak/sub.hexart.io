import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '@sub/db'
import { db } from '@/lib/server/db'
import { fail, json, readJson } from '@/lib/server/http'
import { clientIpHash, userAgentFamily } from '@/lib/server/ip'
import { sendMail } from '@/lib/server/mail'
import { recordAudit } from '@/lib/server/audit'
import { hashPassword, isPasswordBreached, passwordPolicyError } from '@/lib/auth/password'
import { consumePasswordResetToken } from '@/lib/auth/tokens'
import { rotateAuthSession } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ResetBody = z.object({
  token: z.string().min(16).max(200),
  password: z.string().min(1),
})

export async function POST(req: Request) {
  const parsed = ResetBody.safeParse(await readJson(req))
  if (!parsed.success) return fail(req, 400, 'INVALID_INPUT', 'Brak tokenu lub hasła.')

  const policyError = passwordPolicyError(parsed.data.password)
  if (policyError) return fail(req, 400, 'WEAK_PASSWORD', policyError)
  if (await isPasswordBreached(parsed.data.password)) {
    return fail(req, 400, 'WEAK_PASSWORD', 'To hasło występuje w publicznych wyciekach.')
  }

  const userId = await consumePasswordResetToken(parsed.data.token, userAgentFamily(req.headers))
  if (!userId) {
    return fail(
      req,
      400,
      'INVALID_TOKEN',
      'Link wygasł, został użyty lub otwarto go w innej przeglądarce.',
    )
  }

  const rows = await db()
    .select({ email: users.email, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const user = rows[0]
  if (!user || user.deletedAt) return fail(req, 400, 'INVALID_TOKEN', 'Konto nie istnieje.')

  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(users.id, userId))

  // Every other session dies with the old password. SECURITY.md §2.
  await rotateAuthSession(userId, req.headers)

  await sendMail({
    to: user.email,
    subject: 'Hasło zostało zmienione — sub.hexart.io',
    text: 'Hasło do Twojego konta zostało właśnie zmienione. Jeśli to nie Ty — napisz na security@hexart.pl.',
  })

  await recordAudit({
    actorUserId: userId,
    action: 'auth.password_reset',
    target: userId,
    ipHash: clientIpHash(req.headers),
  })

  return json({ ok: true }, req)
}
