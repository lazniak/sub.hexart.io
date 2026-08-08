import { describe, expect, it } from 'vitest'
import {
  balanceOf,
  bucketBalances,
  needsTopUp,
  planSpend,
  releaseUnused,
  reservationRemaining,
  totalAvailable,
  type LedgerEntry,
} from './ledger.js'

const T0 = 1_700_000_000_000
const DAY = 86_400_000

function entry(p: Partial<LedgerEntry> & Pick<LedgerEntry, 'delta' | 'reason' | 'bucket'>): LedgerEntry {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    userId: p.userId ?? 'u1',
    sessionId: p.sessionId ?? null,
    idempotencyKey: p.idempotencyKey ?? null,
    expiresAt: p.expiresAt ?? null,
    createdAt: p.createdAt ?? T0,
    ...p,
  }
}

describe('balanceOf', () => {
  it('is the plain sum of deltas', () => {
    const entries = [
      entry({ delta: 300, reason: 'subscription_grant', bucket: 'subscription' }),
      entry({ delta: -12.5, reason: 'session_usage', bucket: 'subscription' }),
      entry({ delta: 250, reason: 'topup_purchase', bucket: 'topup' }),
    ]
    expect(balanceOf(entries)).toBe(537.5)
  })

  it('is zero for an empty ledger', () => {
    expect(balanceOf([])).toBe(0)
  })
})

describe('bucketBalances', () => {
  it('separates buckets and keeps the earliest expiry', () => {
    const entries = [
      entry({ delta: 300, reason: 'subscription_grant', bucket: 'subscription', expiresAt: T0 + 30 * DAY }),
      entry({ delta: 1000, reason: 'topup_purchase', bucket: 'topup', expiresAt: T0 + 365 * DAY }),
      entry({ delta: -50, reason: 'session_usage', bucket: 'subscription' }),
    ]
    const balances = bucketBalances(entries, T0)
    expect(balances.find((b) => b.bucket === 'subscription')?.balance).toBe(250)
    expect(balances.find((b) => b.bucket === 'topup')?.balance).toBe(1000)
    expect(balances.find((b) => b.bucket === 'subscription')?.expiresAt).toBe(T0 + 30 * DAY)
  })

  it('ignores grants that already expired', () => {
    const entries = [
      entry({ delta: 300, reason: 'subscription_grant', bucket: 'subscription', expiresAt: T0 - DAY }),
      entry({ delta: 100, reason: 'topup_purchase', bucket: 'topup' }),
    ]
    const balances = bucketBalances(entries, T0)
    expect(balances.find((b) => b.bucket === 'subscription')).toBeUndefined()
    expect(totalAvailable(balances)).toBe(100)
  })
})

describe('planSpend', () => {
  it('spends soonest-expiring credits first: trial, then subscription, then top-up', () => {
    const balances = [
      { bucket: 'topup' as const, balance: 1000, expiresAt: T0 + 365 * DAY },
      { bucket: 'subscription' as const, balance: 100, expiresAt: T0 + 30 * DAY },
      { bucket: 'trial' as const, balance: 10, expiresAt: null },
    ]
    const plan = planSpend(balances, 60)
    expect(plan.perBucket).toEqual([
      { bucket: 'trial', amount: 10 },
      { bucket: 'subscription', amount: 50 },
    ])
    expect(plan.shortfall).toBe(0)
  })

  it('reports a shortfall instead of overdrawing', () => {
    const balances = [{ bucket: 'subscription' as const, balance: 5, expiresAt: null }]
    const plan = planSpend(balances, 20)
    expect(plan.covered).toBe(5)
    expect(plan.shortfall).toBe(15)
  })

  it('skips empty and negative buckets', () => {
    const balances = [
      { bucket: 'trial' as const, balance: 0, expiresAt: null },
      { bucket: 'subscription' as const, balance: -3, expiresAt: null },
      { bucket: 'topup' as const, balance: 40, expiresAt: null },
    ]
    expect(planSpend(balances, 10).perBucket).toEqual([{ bucket: 'topup', amount: 10 }])
  })

  it('covers nothing when asked for nothing', () => {
    const plan = planSpend([{ bucket: 'topup' as const, balance: 40, expiresAt: null }], 0)
    expect(plan.covered).toBe(0)
    expect(plan.perBucket).toEqual([])
  })
})

describe('reservations', () => {
  it('reports what is left', () => {
    expect(reservationRemaining({ reserved: 10, spent: 2.5 })).toBe(7.5)
  })

  it('asks for a top-up before the window drains', () => {
    const ratePerSecond = 1.5 / 60
    // A 60 s window is 1.5 credits; top up once under ~0.51 remain.
    expect(needsTopUp({ reserved: 1.5, spent: 1.1 }, ratePerSecond, 60)).toBe(true)
    expect(needsTopUp({ reserved: 1.5, spent: 0.2 }, ratePerSecond, 60)).toBe(false)
  })

  it('releases the unused remainder and never a negative amount', () => {
    expect(releaseUnused({ reserved: 10, spent: 4 })).toBe(6)
    expect(releaseUnused({ reserved: 10, spent: 12 })).toBe(0)
  })
})
