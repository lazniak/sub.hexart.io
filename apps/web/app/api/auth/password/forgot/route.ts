import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '@sub/db'
import { db } from '@/lib/server/db'
import { fail, json, readJson } from '@/lib/server/http'
import { userAgentFamily } from '@/lib/server/ip'
import { sendMail } from '@/lib/server/mail'
import { consumeRateLimit } from '@/lib/auth/rate-limit'
import { issuePasswordResetToken } from '@/lib/auth/tokens'
import { publicEnv } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ForgotBody = z.object({ email: z.string().email().max(254) })

export async function POST(req: Request) {
  const parsed = ForgotBody.safeParse(await readJson(req))
  if (!parsed.success) return fail(req, 400, 'INVALID_INPUT', 'Podaj adres e-mail.')

  const email = parsed.data.email.trim().toLowerCase()

  // Keyed by address, per SECURITY.md §5 — three resets per hour per account.
  const limit = await consumeRateLimit('passwordReset', email)
  if (!limit.allowed) {
    return fail(req, 429, 'RATE_LIMITED', 'Zbyt wiele prób resetu. Spróbuj za godzinę.')
  }

  const rows = await db()
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  const user = rows[0]
  if (user && !user.deletedAt) {
    const token = await issuePasswordResetToken(user.id, userAgentFamily(req.headers))
    const link = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/reset?token=${token}`
    await sendMail({
      to: email,
      subject: 'Reset hasła — sub.hexart.io',
      text: `Ustaw nowe hasło:\n\n${link}\n\nLink jest ważny 15 minut i działa tylko w tej samej przeglądarce.`,
    })
  }

  // Identical response whether or not the account exists. SECURITY.md §2.
  return json({ ok: true }, req)
}
