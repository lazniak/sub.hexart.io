import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { billingProfiles, glossaries, users } from '@sub/db'
import { db } from '@/lib/server/db'
import { fail, json, readJson } from '@/lib/server/http'
import { clientIpHash } from '@/lib/server/ip'
import { sendMail } from '@/lib/server/mail'
import { recordAudit } from '@/lib/server/audit'
import { verifyPassword } from '@/lib/auth/password'
import { destroyAuthSession, readAuthSession, revokeOtherSessions } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DeleteBody = z.object({
  password: z.string().min(1),
  confirm: z.literal('USUŃ'),
})

/**
 * RODO art. 17 self-service deletion.
 *
 * Personal data goes immediately: address, billing profile, glossaries, every
 * session cookie. The ledger stays, because BILLING.md §5 makes it append-only
 * and Polish tax law requires the accounting trail be retained — it keeps only
 * the (now anonymous) user id, amounts and reasons.
 */
export async function POST(req: Request) {
  const auth = await readAuthSession()
  if (!auth) return fail(req, 401, 'UNAUTHORIZED', 'Zaloguj się ponownie.')

  const parsed = DeleteBody.safeParse(await readJson(req))
  if (!parsed.success) {
    return fail(req, 400, 'INVALID_INPUT', 'Podaj hasło i wpisz USUŃ, żeby potwierdzić.')
  }

  const rows = await db()
    .select({ passwordHash: users.passwordHash, email: users.email })
    .from(users)
    .where(eq(users.id, auth.user.id))
    .limit(1)

  const stored = rows[0]
  if (!stored?.passwordHash) {
    return fail(req, 400, 'NO_PASSWORD', 'Ustaw hasło przez reset, zanim usuniesz konto.')
  }
  if (!(await verifyPassword(stored.passwordHash, parsed.data.password))) {
    return fail(req, 400, 'INVALID_CREDENTIALS', 'Hasło jest nieprawidłowe.')
  }

  const originalEmail = stored.email
  await db().delete(billingProfiles).where(eq(billingProfiles.userId, auth.user.id))
  await db().delete(glossaries).where(eq(glossaries.userId, auth.user.id))
  await db()
    .update(users)
    .set({
      // The unique index is on lower(email); a per-account sentinel keeps it
      // satisfied while making the original address unrecoverable.
      email: `deleted+${auth.user.id}@invalid`,
      passwordHash: null,
      totpSecretEnc: null,
      deletedAt: new Date(),
    })
    .where(eq(users.id, auth.user.id))

  await revokeOtherSessions(auth.user.id)
  await destroyAuthSession()

  await sendMail({
    to: originalEmail,
    subject: 'Konto zostało usunięte — sub.hexart.io',
    text: 'Twoje konto zostało usunięte. Zapisy księgowe zachowujemy zgodnie z przepisami podatkowymi.',
  })

  await recordAudit({
    actorUserId: auth.user.id,
    action: 'account.delete',
    target: auth.user.id,
    ipHash: clientIpHash(req.headers),
  })

  return json({ ok: true }, req)
}
