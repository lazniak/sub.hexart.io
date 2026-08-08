/**
 * SINGLE SOURCE OF TRUTH for money.
 *
 * Every price, rate and quota in the product comes from this file. Changing any
 * number here is an owner decision (AGENTS.md §10.5) and must land together with
 * the matching update to docs/BILLING.md.
 */

/* ── Burn rates ───────────────────────────────────────────────────────────────
 * 1 credit = 1 minute of captions. Chosen so the pricing page needs no calculator.
 */
export const RATE_CAPTIONS_PER_MIN = 1.0
export const RATE_TRANSLATION_PER_LANG_PER_MIN = 0.5
export const RATE_VOICE_PER_MIN = 3.0

export type PlanCode = 'trial' | 'starter' | 'creator' | 'pro'

export interface Plan {
  code: PlanCode
  name: string
  /** Net price, minor units. VAT is added by Paddle per the customer's country. */
  priceMonthly: { pln: number; eur: number }
  priceYearly: { pln: number; eur: number } | null
  /** Credits granted per billing period. Trial grants once. */
  credits: number
  maxConcurrentSessions: number
  maxTargetLanguages: number
  voiceEnabled: boolean
  glossaryEnabled: boolean
  watermark: boolean
  apiAccess: boolean
  prioritySttQueue: boolean
}

/** Yearly billing gives two months free. */
const yearly = (monthlyPln: number, monthlyEur: number) => ({
  pln: monthlyPln * 10,
  eur: monthlyEur * 10,
})

export const PLANS: Record<PlanCode, Plan> = {
  trial: {
    code: 'trial',
    name: 'Trial',
    priceMonthly: { pln: 0, eur: 0 },
    priceYearly: null,
    credits: 10,
    maxConcurrentSessions: 1,
    maxTargetLanguages: 1,
    voiceEnabled: false,
    glossaryEnabled: false,
    watermark: true,
    apiAccess: false,
    prioritySttQueue: false,
  },
  starter: {
    code: 'starter',
    name: 'Starter',
    priceMonthly: { pln: 3900, eur: 900 },
    priceYearly: yearly(3900, 900),
    credits: 300,
    maxConcurrentSessions: 1,
    maxTargetLanguages: 1,
    voiceEnabled: false,
    glossaryEnabled: false,
    watermark: false,
    apiAccess: false,
    prioritySttQueue: false,
  },
  creator: {
    code: 'creator',
    name: 'Creator',
    priceMonthly: { pln: 9900, eur: 2300 },
    priceYearly: yearly(9900, 2300),
    credits: 1000,
    maxConcurrentSessions: 2,
    maxTargetLanguages: 3,
    voiceEnabled: true,
    glossaryEnabled: true,
    watermark: false,
    apiAccess: false,
    prioritySttQueue: false,
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    priceMonthly: { pln: 24900, eur: 5900 },
    priceYearly: yearly(24900, 5900),
    credits: 3000,
    maxConcurrentSessions: 4,
    maxTargetLanguages: 5,
    voiceEnabled: true,
    glossaryEnabled: true,
    watermark: false,
    apiAccess: true,
    prioritySttQueue: true,
  },
}

export interface TopUpPack {
  code: string
  credits: number
  price: { pln: number; eur: number }
}

/** Top-up credits are valid 12 months and survive subscription cancellation. */
export const TOPUP_PACKS: TopUpPack[] = [
  { code: 'topup_250', credits: 250, price: { pln: 3900, eur: 900 } },
  { code: 'topup_1000', credits: 1000, price: { pln: 12900, eur: 2900 } },
  { code: 'topup_4000', credits: 4000, price: { pln: 44900, eur: 10500 } },
]

export const TOPUP_VALIDITY_DAYS = 365

/* ── Runtime thresholds ─────────────────────────────────────────────────────── */

/** Credits reserved ahead of the burn so Postgres stays off the hot path. */
export const RESERVATION_WINDOW_SECONDS = 60
/** Ledger flush cadence. A relay crash costs at most this much — in the user's favour. */
export const LEDGER_FLUSH_INTERVAL_MS = 10_000
/** Grace period after the balance hits zero, so a live session ends softly. */
export const ZERO_BALANCE_GRACE_SECONDS = 60
/** Warn in the studio (never in the projector) below this share of the balance. */
export const LOW_CREDITS_WARN_RATIO = 0.2
/** Escalated warning when this little airtime remains. */
export const CRITICAL_SECONDS_LEFT = 60

export function planOf(code: string): Plan {
  const plan = PLANS[code as PlanCode]
  return plan ?? PLANS.trial
}
