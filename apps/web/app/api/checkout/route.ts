import { z } from 'zod'
import { consents } from '@sub/db'
import { PLANS, TOPUP_PACKS } from '@sub/billing'
import { db } from '@/lib/server/db'
import { readAuthSession } from '@/lib/auth/session'
import { clientIpHash } from '@/lib/server/ip'
import { fail, json, readJson } from '@/lib/server/http'
import { loadCatalog } from '@/lib/server/paddle'
import { recordAudit } from '@/lib/server/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Bump when the terms change; the recorded consent must name the version it covered. */
const TERMS_VERSION = process.env.TERMS_VERSION ?? '2026-08-08'

const CheckoutRequest = z.object({
  priceId: z.string().min(1),
  /**
   * art. 38 ust. 1 pkt 13 uPK — credits are delivered immediately, which is only
   * lawful if the customer explicitly asked for performance to begin before the
   * withdrawal period ends. Unchecked means the purchase waits out the 14 days,
   * so this is a real branch, not a formality.
   */
  immediatePerformanceConsent: z.boolean(),
})

/**
 * Prepares a Paddle checkout.
 *
 * Paddle is the merchant of record, so we never touch card data. This endpoint
 * only validates the price against our own catalog, records the withdrawal
 * waiver, and hands back what Paddle.js needs to open its overlay.
 */
export async function POST(req: Request) {
  const auth = await readAuthSession()
  if (!auth) return fail(req, 401, 'UNAUTHENTICATED', 'Zaloguj się, żeby dokonać zakupu.')

  if (!auth.user.emailVerifiedAt) {
    return fail(req, 403, 'EMAIL_NOT_VERIFIED', 'Potwierdź adres e-mail przed zakupem.')
  }

  const parsed = CheckoutRequest.safeParse(await readJson(req))
  if (!parsed.success) {
    return fail(req, 400, 'INVALID_REQUEST', 'Nieprawidłowe dane zakupu.')
  }

  const entry = loadCatalog().find((e) => e.priceId === parsed.data.priceId)
  if (!entry) {
    return fail(req, 400, 'UNKNOWN_PRICE', 'Ten produkt nie jest dostępny.')
  }

  await db().insert(consents).values({
    userId: auth.user.id,
    kind: 'immediate_performance_art38',
    documentVersion: TERMS_VERSION,
    granted: parsed.data.immediatePerformanceConsent,
    ipHash: clientIpHash(req.headers),
  })

  await recordAudit({
    actorUserId: auth.user.id,
    action: 'billing.checkout_opened',
    target: entry.priceId,
    meta: {
      kind: entry.kind,
      credits: entry.credits,
      immediateConsent: parsed.data.immediatePerformanceConsent,
      termsVersion: TERMS_VERSION,
    },
    ipHash: clientIpHash(req.headers),
  })

  return json(
    {
      priceId: entry.priceId,
      kind: entry.kind,
      credits: entry.credits,
      planName: entry.planCode ? PLANS[entry.planCode].name : null,
      // Travels back on the webhook so the grant lands on the right account even
      // if the Paddle customer email differs from the one we know.
      customData: { user_id: auth.user.id },
      // Without the waiver, credits are granted after the statutory 14 days.
      deliversImmediately: parsed.data.immediatePerformanceConsent,
    },
    req,
  )
}

/** The catalog the pricing page renders against, so the two can never disagree. */
export async function GET(req: Request) {
  const catalog = loadCatalog()
  return json(
    {
      plans: Object.values(PLANS).map((plan) => ({
        code: plan.code,
        name: plan.name,
        credits: plan.credits,
        priceMonthly: plan.priceMonthly,
        priceId: catalog.find((e) => e.planCode === plan.code)?.priceId ?? null,
      })),
      topups: TOPUP_PACKS.map((pack) => ({
        code: pack.code,
        credits: pack.credits,
        price: pack.price,
        priceId: catalog.find((e) => e.kind === 'topup' && e.credits === pack.credits)?.priceId ?? null,
      })),
    },
    req,
  )
}
