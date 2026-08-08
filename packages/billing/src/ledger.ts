/**
 * Credit ledger — pure logic.
 *
 * The ledger is append-only. Balance is always SUM(delta); nothing ever mutates a
 * row. That is an accounting guarantee, not an optimisation: a balance that can
 * only be derived cannot silently drift.
 */

export type LedgerReason =
  | 'trial_grant'
  | 'subscription_grant'
  | 'topup_purchase'
  | 'session_usage'
  | 'refund_incident'
  | 'refund_customer'
  | 'expiry_subscription'
  | 'expiry_topup'
  | 'manual_adjustment'

/** Subscription credits expire with the period; top-ups do not. */
export type CreditBucket = 'subscription' | 'topup' | 'trial'

export interface LedgerEntry {
  id: string
  userId: string
  delta: number
  reason: LedgerReason
  bucket: CreditBucket
  sessionId?: string | null
  /** Paddle event id, session id, or job id — makes replays harmless. */
  idempotencyKey?: string | null
  /** Epoch ms. Null for buckets that never expire. */
  expiresAt?: number | null
  createdAt: number
}

export interface BucketBalance {
  bucket: CreditBucket
  balance: number
  expiresAt: number | null
}

export function balanceOf(entries: readonly LedgerEntry[]): number {
  return round4(entries.reduce((sum, e) => sum + e.delta, 0))
}

/** Balance per bucket, ignoring anything already past its expiry. */
export function bucketBalances(entries: readonly LedgerEntry[], now: number): BucketBalance[] {
  const acc = new Map<CreditBucket, BucketBalance>()
  for (const e of entries) {
    if (e.delta > 0 && e.expiresAt != null && e.expiresAt <= now) continue
    const current = acc.get(e.bucket) ?? { bucket: e.bucket, balance: 0, expiresAt: null }
    current.balance = round4(current.balance + e.delta)
    if (e.delta > 0 && e.expiresAt != null) {
      current.expiresAt =
        current.expiresAt == null ? e.expiresAt : Math.min(current.expiresAt, e.expiresAt)
    }
    acc.set(e.bucket, current)
  }
  return [...acc.values()]
}

/**
 * Spend order: whatever expires soonest goes first.
 *
 * Trial, then subscription, then top-ups. Always the arrangement that wastes the
 * least of the user's money — never the one that maximises breakage.
 */
const SPEND_ORDER: CreditBucket[] = ['trial', 'subscription', 'topup']

export interface SpendPlan {
  /** How much of the request could actually be covered. */
  covered: number
  shortfall: number
  perBucket: { bucket: CreditBucket; amount: number }[]
}

export function planSpend(
  balances: readonly BucketBalance[],
  amount: number,
): SpendPlan {
  let remaining = round4(amount)
  const perBucket: { bucket: CreditBucket; amount: number }[] = []

  for (const bucket of SPEND_ORDER) {
    if (remaining <= 0) break
    const available = balances.find((b) => b.bucket === bucket)?.balance ?? 0
    if (available <= 0) continue
    const take = round4(Math.min(available, remaining))
    perBucket.push({ bucket, amount: take })
    remaining = round4(remaining - take)
  }

  return { covered: round4(amount - remaining), shortfall: remaining, perBucket }
}

export function totalAvailable(balances: readonly BucketBalance[]): number {
  return round4(balances.reduce((s, b) => s + Math.max(0, b.balance), 0))
}

/**
 * Reservation state machine used by the relay.
 *
 * The relay reserves a window of credits ahead of the burn, so the hot path never
 * touches Postgres. Reservations are topped up as they drain and released on close.
 */
export interface Reservation {
  reserved: number
  spent: number
}

export function reservationRemaining(r: Reservation): number {
  return round4(r.reserved - r.spent)
}

export function needsTopUp(r: Reservation, ratePerSecond: number, windowSeconds: number): boolean {
  // Top up once less than a third of the window remains, so the refill has time to land.
  return reservationRemaining(r) < ratePerSecond * windowSeconds * 0.34
}

/** Unused reservation returns to the balance the moment a session closes. */
export function releaseUnused(r: Reservation): number {
  return Math.max(0, reservationRemaining(r))
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
