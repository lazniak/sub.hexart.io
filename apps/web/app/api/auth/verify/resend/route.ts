import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '@sub/db'
import { db } from '@/lib/server/db'
import { fail, json, readJson } from '@/lib/server/http'
import { clientIp } from '@/lib/server/ip'
import { sendMail } from '@/lib/server/mail'
import { consumeRateLimit } from '@/lib/auth/rate-limit'
import { issueEmailVerificationToken } from '@/lib/auth/tokens'
import { publicEnv } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ResendBody = z.object({ email: z.string().email().max(254) })

export async function POST(req: Request) {
  const limit = await consumeRateLimit('register', clientIp(req.headers))
  if (!limit.allowed) {
    return fail(req, 429, 'RATE_LIMITED', 'Zbyt wiele prób. Spróbuj później.')
  }

  const parsed = ResendBody.safeParse(await readJson(req))
  if (!parsed.success) return fail(req, 400, 'INVALID_INPUT', 'Podaj adres e-mail.')

  const email = parsed.data.email.trim().toLowerCase()
  const rows = await db()
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt, deletedAt: users.deletedAt })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  const user = rows[0]
  if (user && !user.deletedAt && !user.emailVerifiedAt) {
    const token = await issueEmailVerificationToken(user.id)
    const link = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/verify?token=${token}`
    await sendMail({
      to: email,
      subject: 'Potwierdź adres e-mail — sub.hexart.io',
      text: `Potwierdź adres, aby odebrać 10 darmowych credits:\n\n${link}\n\nLink jest ważny 24 godziny.`,
    })
  }

  // Same answer either way — the endpoint must not confirm that an address exists.
  return json({ ok: true }, req)
}
