import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '@sub/db'
import { db } from '@/lib/server/db'
import { fail, json, readJson } from '@/lib/server/http'
import { clientIpHash } from '@/lib/server/ip'
import { sendMail } from '@/lib/server/mail'
import { recordAudit } from '@/lib/server/audit'
import {
  hashPassword,
  isPasswordBreached,
  passwordPolicyError,
  verifyPassword,
} from '@/lib/auth/password'
import { readAuthSession, rotateAuthSession } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ChangeBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
})

export async function POST(req: Request) {
  const auth = await readAuthSession()
  if (!auth) return fail(req, 401, 'UNAUTHORIZED', 'Zaloguj się ponownie.')

  const parsed = ChangeBody.safeParse(await readJson(req))
  if (!parsed.success) return fail(req, 400, 'INVALID_INPUT', 'Podaj obecne i nowe hasło.')

  const policyError = passwordPolicyError(parsed.data.newPassword)
  if (policyError) return fail(req, 400, 'WEAK_PASSWORD', policyError)
  if (await isPasswordBreached(parsed.data.newPassword)) {
    return fail(req, 400, 'WEAK_PASSWORD', 'To hasło występuje w publicznych wyciekach.')
  }

  const rows = await db()
    .select({ passwordHash: users.passwordHash, email: users.email })
    .from(users)
    .where(eq(users.id, auth.user.id))
    .limit(1)

  const stored = rows[0]
  if (!stored?.passwordHash) {
    return fail(req, 400, 'NO_PASSWORD', 'To konto loguje się przez Google. Ustaw hasło resetem.')
  }
  if (!(await verifyPassword(stored.passwordHash, parsed.data.currentPassword))) {
    return fail(req, 400, 'INVALID_CREDENTIALS', 'Obecne hasło jest nieprawidłowe.')
  }

  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword) })
    .where(eq(users.id, auth.user.id))

  await rotateAuthSession(auth.user.id, req.headers)

  await sendMail({
    to: stored.email,
    subject: 'Hasło zostało zmienione — sub.hexart.io',
    text: 'Hasło do Twojego konta zostało właśnie zmienione. Jeśli to nie Ty — napisz na security@hexart.pl.',
  })

  await recordAudit({
    actorUserId: auth.user.id,
    action: 'auth.password_change',
    target: auth.user.id,
    ipHash: clientIpHash(req.headers),
  })

  return json({ ok: true }, req)
}
