import { describe, expect, it } from 'vitest'
import { findCatalogEntry, intentsForEvent, type CatalogEntry, type PaddleEvent } from './paddle.js'

const NOW = 1_800_000_000_000
const DAY = 86_400_000

const CATALOG: CatalogEntry[] = [
  { priceId: 'pri_starter', kind: 'subscription', planCode: 'starter', credits: 300 },
  { priceId: 'pri_creator', kind: 'subscription', planCode: 'creator', credits: 1000 },
  { priceId: 'pri_topup_1000', kind: 'topup', credits: 1000 },
]

function event(p: Partial<PaddleEvent> & Pick<PaddleEvent, 'eventType'>): PaddleEvent {
  return {
    eventId: p.eventId ?? 'evt_1',
    userId: p.userId ?? 'u1',
    items: p.items ?? [],
    ...p,
  }
}

describe('findCatalogEntry', () => {
  it('resolves a known price and ignores an unknown one', () => {
    expect(findCatalogEntry(CATALOG, 'pri_creator')?.credits).toBe(1000)
    expect(findCatalogEntry(CATALOG, 'pri_unknown')).toBeUndefined()
  })
})

describe('transaction.completed', () => {
  it('grants top-up credits with a 12 month expiry', () => {
    const out = intentsForEvent(
      event({ eventType: 'transaction.completed', items: [{ priceId: 'pri_topup_1000', quantity: 1 }] }),
      CATALOG,
      NOW,
    )
    expect(out.ledger).toHaveLength(1)
    expect(out.ledger[0]).toMatchObject({ delta: 1000, reason: 'topup_purchase', bucket: 'topup' })
    expect(out.ledger[0]!.expiresAt).toBe(NOW + 365 * DAY)
    expect(out.planChange).toBeNull()
  })

  it('grants subscription credits that expire with the period', () => {
    const periodEnd = NOW + 30 * DAY
    const out = intentsForEvent(
      event({
        eventType: 'transaction.completed',
        items: [{ priceId: 'pri_creator', quantity: 1 }],
        subscriptionId: 'sub_1',
        currentPeriodEnd: periodEnd,
      }),
      CATALOG,
      NOW,
    )
    expect(out.ledger[0]).toMatchObject({
      delta: 1000,
      reason: 'subscription_grant',
      bucket: 'subscription',
      expiresAt: periodEnd,
    })
    expect(out.planChange).toMatchObject({ planCode: 'creator', status: 'active' })
  })

  it('multiplies by quantity', () => {
    const out = intentsForEvent(
      event({ eventType: 'transaction.completed', items: [{ priceId: 'pri_topup_1000', quantity: 3 }] }),
      CATALOG,
      NOW,
    )
    expect(out.ledger[0]!.delta).toBe(3000)
  })

  it('treats a zero quantity as one rather than granting nothing', () => {
    const out = intentsForEvent(
      event({ eventType: 'transaction.completed', items: [{ priceId: 'pri_topup_1000', quantity: 0 }] }),
      CATALOG,
      NOW,
    )
    expect(out.ledger[0]!.delta).toBe(1000)
  })

  it('skips line items that are not in the catalog', () => {
    const out = intentsForEvent(
      event({
        eventType: 'transaction.completed',
        items: [
          { priceId: 'pri_unknown', quantity: 1 },
          { priceId: 'pri_topup_1000', quantity: 1 },
        ],
      }),
      CATALOG,
      NOW,
    )
    expect(out.ledger).toHaveLength(1)
  })

  it('gives every line item a distinct idempotency key', () => {
    const out = intentsForEvent(
      event({
        eventType: 'transaction.completed',
        eventId: 'evt_multi',
        items: [
          { priceId: 'pri_topup_1000', quantity: 1 },
          { priceId: 'pri_creator', quantity: 1 },
        ],
      }),
      CATALOG,
      NOW,
    )
    const keys = out.ledger.map((l) => l.idempotencyKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.every((k) => k.startsWith('evt_multi'))).toBe(true)
  })
})

describe('subscription lifecycle', () => {
  it('moves the plan on activation without granting credits again', () => {
    const out = intentsForEvent(
      event({
        eventType: 'subscription.activated',
        items: [{ priceId: 'pri_starter', quantity: 1 }],
        subscriptionId: 'sub_1',
      }),
      CATALOG,
      NOW,
    )
    // The grant rides on transaction.completed; doing it here too would double-credit.
    expect(out.ledger).toHaveLength(0)
    expect(out.planChange).toMatchObject({ planCode: 'starter', status: 'active' })
  })

  it('marks past_due from the subscription status', () => {
    const out = intentsForEvent(
      event({
        eventType: 'subscription.updated',
        items: [{ priceId: 'pri_starter', quantity: 1 }],
        status: 'past_due',
      }),
      CATALOG,
      NOW,
    )
    expect(out.planChange?.status).toBe('past_due')
  })

  it('ignores a subscription whose price is unknown', () => {
    const out = intentsForEvent(
      event({ eventType: 'subscription.updated', items: [{ priceId: 'pri_x', quantity: 1 }] }),
      CATALOG,
      NOW,
    )
    expect(out.planChange).toBeNull()
    expect(out.note).toContain('catalog')
  })

  it('drops to trial on cancellation and keeps top-up credits', () => {
    const out = intentsForEvent(
      event({ eventType: 'subscription.canceled', subscriptionId: 'sub_1' }),
      CATALOG,
      NOW,
    )
    expect(out.ledger).toHaveLength(0)
    expect(out.planChange).toMatchObject({ planCode: 'trial', status: 'canceled' })
  })

  it('starts a grace period on a failed payment instead of cutting access', () => {
    const out = intentsForEvent(
      event({ eventType: 'transaction.payment_failed', items: [{ priceId: 'pri_creator', quantity: 1 }] }),
      CATALOG,
      NOW,
    )
    expect(out.planChange).toMatchObject({ planCode: 'creator', status: 'past_due' })
  })

  it('falls back to trial when a failed payment carries no known price', () => {
    const out = intentsForEvent(event({ eventType: 'transaction.payment_failed' }), CATALOG, NOW)
    expect(out.planChange?.planCode).toBe('trial')
  })
})

describe('adjustments', () => {
  it('claws back refunded credits', () => {
    const out = intentsForEvent(
      event({ eventType: 'adjustment.created', refundCredits: 250 }),
      CATALOG,
      NOW,
    )
    expect(out.ledger[0]).toMatchObject({ delta: -250, reason: 'refund_customer' })
  })

  it('ignores an adjustment with nothing to claw back', () => {
    expect(
      intentsForEvent(event({ eventType: 'adjustment.created', refundCredits: 0 }), CATALOG, NOW)
        .ledger,
    ).toHaveLength(0)
  })
})

describe('unknown events', () => {
  it('are recorded as unhandled rather than guessed at', () => {
    const out = intentsForEvent(event({ eventType: 'customer.created' }), CATALOG, NOW)
    expect(out.ledger).toHaveLength(0)
    expect(out.planChange).toBeNull()
    expect(out.note).toContain('unhandled')
  })
})
