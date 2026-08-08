import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { consents, users } from '@sub/db'
import { db } from '@/lib/server/db'
import { fail, json, readJson } from '@/lib/server/http'
import { clientIp, clientIpHash } from '@/lib/server/ip'
import { sendMail } from '@/lib/server/mail'
import { recordAudit } from '@/lib/server/audit'
import { consumeRateLimit } from '@/lib/auth/rate-limit'
import { hashPassword, isPasswordBreached, passwordPolicyError } from '@/lib/auth/password'
import { issueEmailVerificationToken } from '@/lib/auth/tokens'
import { publicEnv } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RegisterBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1),
  acceptTerms: z.literal(true),
  termsVersion: z.string().min(1).max(20).default('1.0'),
})

/** Throwaway-mailbox domains cost us COGS with no path to revenue. SECURITY.md T4. */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
])

export async function POST(req: Request) {
  const ip = clientIp(req.headers)
  const limit = await consumeRateLimit('register', ip)
  if (!limit.allowed) {
    return fail(req, 429, 'RATE_LIMITED', 'Zbyt wiele prób rejestracji. Spróbuj później.')
  }

  const parsed = RegisterBody.safeParse(await readJson(req))
  if (!parsed.success) {
    return fail(req, 400, 'INVALID_INPUT', 'Sprawdź adres e-mail, hasło i zgodę na regulamin.')
  }

  const email = parsed.data.email.trim().toLowerCase()
  const domain = email.slice(email.lastIndexOf('@') + 1)
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return fail(req, 400, 'INVALID_INPUT', 'Ten dostawca poczty nie jest obsługiwany.')
  }

  const policyError = passwordPolicyError(parsed.data.password)
  if (policyError) return fail(req, 400, 'WEAK_PASSWORD', policyError)
  if (await isPasswordBreached(parsed.data.password)) {
    return fail(
      req,
      400,
      'WEAK_PASSWORD',
      'To hasło występuje w publicznych wyciekach. Wybierz inne.',
    )
  }

  const existing = await db()
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  if (existing[0]) {
    return fail(req, 409, 'EMAIL_TAKEN', 'Konto z tym adresem już istnieje.')
  }

  const passwordHash = await hashPassword(parsed.data.password)
  const inserted = await db()
    .insert(users)
    .values({ email, passwordHash, planCode: 'trial' })
    .returning({ id: users.id })

  const userId = inserted[0]?.id
  if (!userId) return fail(req, 500, 'INTERNAL', 'Nie udało się utworzyć konta.')

  const ipHash = clientIpHash(req.headers)
  await db().insert(consents).values({
    userId,
    kind: 'terms',
    documentVersion: parsed.data.termsVersion,
    granted: true,
    ipHash,
  })

  const token = await issueEmailVerificationToken(userId)
  const link = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/verify?token=${token}`
  await sendMail({
    to: email,
    subject: 'Potwierdź adres e-mail — sub.hexart.io',
    text: `Potwierdź adres, aby odebrać 10 darmowych credits:\n\n${link}\n\nLink jest ważny 24 godziny.`,
  })

  await recordAudit({ actorUserId: userId, action: 'auth.register', target: userId, ipHash })

  return json({ ok: true }, req, { status: 201 })
}
