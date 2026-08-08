/**
 * Paddle event -> ledger intents.
 *
 * Pure by design: the webhook route does signature checking and database work,
 * this decides what should happen. Every intent carries an idempotency key
 * derived from the Paddle event id, so a redelivered webhook can never grant
 * credits twice (BILLING.md §5, §6).
 */

import { TOPUP_VALIDITY_DAYS, type PlanCode } from './plans.js'
import type { CreditBucket, LedgerReason } from './ledger.js'

const DAY_MS = 86_400_000

export type PaddleEventType =
  | 'transaction.completed'
  | 'subscription.activated'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'transaction.payment_failed'
  | 'adjustment.created'

export interface CatalogEntry {
  priceId: string
  kind: 'subscription' | 'topup'
  planCode?: PlanCode
  credits: number
}

export interface PaddleEvent {
  eventId: string
  eventType: string
  userId: string
  /** Purchased line items; a subscription renewal carries its plan price here too. */
  items: { priceId: string; quantity: number }[]
  subscriptionId?: string | null
  status?: string | null
  /** Epoch ms. Subscription credits expire with the period. */
  currentPeriodEnd?: number | null
  /** Credits to claw back on a refund. Positive number; the intent negates it. */
  refundCredits?: number | null
}

export interface LedgerIntent {
  delta: number
  reason: LedgerReason
  bucket: CreditBucket
  idempotencyKey: string
  expiresAt: number | null
}

export interface PlanChange {
  planCode: PlanCode | 'trial'
  status: 'active' | 'past_due' | 'canceled'
  subscriptionId: string | null
  currentPeriodEnd: number | null
}

export interface PaddleOutcome {
  ledger: LedgerIntent[]
  planChange: PlanChange | null
  /** Set when the event is understood but intentionally produces no ledger row. */
  note?: string
}

export function findCatalogEntry(
  catalog: readonly CatalogEntry[],
  priceId: string,
): CatalogEntry | undefined {
  return catalog.find((e) => e.priceId === priceId)
}

/**
 * @param now Epoch ms, injected so expiry maths stays deterministic in tests.
 */
export function intentsForEvent(
  event: PaddleEvent,
  catalog: readonly CatalogEntry[],
  now: number,
): PaddleOutcome {
  switch (event.eventType as PaddleEventType) {
    case 'transaction.completed':
      return completedTransaction(event, catalog, now)

    case 'subscription.activated':
    case 'subscription.updated':
      return subscriptionChange(event, catalog, now)

    case 'subscription.canceled':
      // Top-ups survive cancellation; only the recurring grant stops.
      return {
        ledger: [],
        planChange: {
          planCode: 'trial',
          status: 'canceled',
          subscriptionId: event.subscriptionId ?? null,
          currentPeriodEnd: event.currentPeriodEnd ?? null,
        },
        note: 'subscription canceled; top-up credits retained',
      }

    case 'transaction.payment_failed':
      return {
        ledger: [],
        planChange: {
          planCode: resolvePlanCode(event, catalog) ?? 'trial',
          status: 'past_due',
          subscriptionId: event.subscriptionId ?? null,
          currentPeriodEnd: event.currentPeriodEnd ?? null,
        },
        note: 'payment failed; grace period starts',
      }

    case 'adjustment.created': {
      const credits = event.refundCredits ?? 0
      if (credits <= 0) return { ledger: [], planChange: null, note: 'adjustment without credits' }
      return {
        ledger: [
          {
            delta: -credits,
            reason: 'refund_customer',
            bucket: 'topup',
            idempotencyKey: `${event.eventId}:refund`,
            expiresAt: null,
          },
        ],
        planChange: null,
      }
    }

    default:
      return { ledger: [], planChange: null, note: `unhandled event type: ${event.eventType}` }
  }
}

function completedTransaction(
  event: PaddleEvent,
  catalog: readonly CatalogEntry[],
  now: number,
): PaddleOutcome {
  const ledger: LedgerIntent[] = []
  let planChange: PlanChange | null = null

  for (const [index, item] of event.items.entries()) {
    const entry = findCatalogEntry(catalog, item.priceId)
    if (!entry) continue

    const credits = entry.credits * Math.max(1, item.quantity)

    if (entry.kind === 'topup') {
      ledger.push({
        delta: credits,
        reason: 'topup_purchase',
        bucket: 'topup',
        idempotencyKey: `${event.eventId}:${index}`,
        expiresAt: now + TOPUP_VALIDITY_DAYS * DAY_MS,
      })
      continue
    }

    ledger.push({
      delta: credits,
      reason: 'subscription_grant',
      bucket: 'subscription',
      idempotencyKey: `${event.eventId}:${index}`,
      expiresAt: event.currentPeriodEnd ?? null,
    })

    if (entry.planCode) {
      planChange = {
        planCode: entry.planCode,
        status: 'active',
        subscriptionId: event.subscriptionId ?? null,
        currentPeriodEnd: event.currentPeriodEnd ?? null,
      }
    }
  }

  return { ledger, planChange }
}

/**
 * Activation and update carry the plan but not always a payment. The grant rides
 * on `transaction.completed`; here we only move the plan, so an upgrade mid-period
 * cannot double-grant.
 */
function subscriptionChange(
  event: PaddleEvent,
  catalog: readonly CatalogEntry[],
  _now: number,
): PaddleOutcome {
  const planCode = resolvePlanCode(event, catalog)
  if (!planCode) {
    return { ledger: [], planChange: null, note: 'subscription item not in catalog' }
  }

  return {
    ledger: [],
    planChange: {
      planCode,
      status: event.status === 'past_due' ? 'past_due' : 'active',
      subscriptionId: event.subscriptionId ?? null,
      currentPeriodEnd: event.currentPeriodEnd ?? null,
    },
  }
}

function resolvePlanCode(
  event: PaddleEvent,
  catalog: readonly CatalogEntry[],
): PlanCode | undefined {
  for (const item of event.items) {
    const entry = findCatalogEntry(catalog, item.priceId)
    if (entry?.kind === 'subscription' && entry.planCode) return entry.planCode
  }
  return undefined
}
