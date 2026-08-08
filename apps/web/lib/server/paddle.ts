import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { creditLedger, subscriptions, users } from '@sub/db'
import {
  intentsForEvent,
  type CatalogEntry,
  type PaddleEvent,
  type PaddleOutcome,
  type PlanCode,
} from '@sub/billing'
import { db } from '@/lib/server/db'
import { recordAudit } from '@/lib/server/audit'

/**
 * Catalog: Paddle price id -> what the customer actually bought.
 *
 * Kept in the environment rather than the code because the ids differ between
 * the sandbox and production catalogs, and a wrong mapping would grant the wrong
 * number of credits. Format: `priceId:kind:credits[:planCode]`, comma separated.
 *
 *   PADDLE_CATALOG="pri_abc:subscription:300:starter,pri_xyz:topup:1000"
 */
export function loadCatalog(raw = process.env.PADDLE_CATALOG ?? ''): CatalogEntry[] {
  const entries: CatalogEntry[] = []

  for (const chunk of raw.split(',')) {
    const parts = chunk.trim().split(':')
    if (parts.length < 3) continue

    const [priceId, kind, credits, planCode] = parts
    if (!priceId || (kind !== 'subscription' && kind !== 'topup')) continue

    const amount = Number(credits)
    if (!Number.isFinite(amount) || amount <= 0) continue

    entries.push({
      priceId,
      kind,
      credits: amount,
      ...(planCode ? { planCode: planCode as PlanCode } : {}),
    })
  }

  return entries
}

/**
 * Paddle signs the raw body: `Paddle-Signature: ts=<unix>;h1=<hmac>`, where the
 * HMAC covers `<ts>:<rawBody>`. Verification runs before any parsing — an
 * unsigned payload must never reach the JSON parser, let alone the ledger.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): boolean {
  if (!signatureHeader || !secret) return false

  let ts: string | undefined
  let h1: string | undefined
  for (const part of signatureHeader.split(';')) {
    const [key, value] = part.split('=')
    if (key === 'ts') ts = value
    if (key === 'h1') h1 = value
  }
  if (!ts || !h1) return false

  // Reject stale signatures so a captured webhook cannot be replayed later.
  const age = Math.abs(nowSeconds - Number(ts))
  if (!Number.isFinite(age) || age > toleranceSeconds) return false

  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(h1, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Applies an outcome inside one transaction.
 *
 * Ledger writes rely on the unique index over `idempotency_key`: a redelivered
 * webhook collides and is skipped instead of granting credits twice.
 */
export async function applyOutcome(
  userId: string,
  outcome: PaddleOutcome,
  eventId: string,
): Promise<{ applied: number; skipped: number }> {
  let applied = 0
  let skipped = 0

  await db().transaction(async (tx) => {
    for (const intent of outcome.ledger) {
      const inserted = await tx
        .insert(creditLedger)
        .values({
          userId,
          delta: String(intent.delta),
          reason: intent.reason,
          bucket: intent.bucket,
          idempotencyKey: intent.idempotencyKey,
          expiresAt: intent.expiresAt ? new Date(intent.expiresAt) : null,
          meta: { paddleEventId: eventId },
        })
        .onConflictDoNothing({ target: creditLedger.idempotencyKey })
        .returning({ id: creditLedger.id })

      if (inserted.length > 0) applied++
      else skipped++
    }

    const change = outcome.planChange
    if (change) {
      await tx.update(users).set({ planCode: change.planCode }).where(eq(users.id, userId))

      if (change.subscriptionId) {
        await tx
          .insert(subscriptions)
          .values({
            userId,
            paddleSubscriptionId: change.subscriptionId,
            planCode: change.planCode,
            status: change.status,
            currentPeriodEnd: change.currentPeriodEnd ? new Date(change.currentPeriodEnd) : null,
            canceledAt: change.status === 'canceled' ? new Date() : null,
          })
          .onConflictDoUpdate({
            target: subscriptions.paddleSubscriptionId,
            set: {
              planCode: change.planCode,
              status: change.status,
              currentPeriodEnd: change.currentPeriodEnd
                ? new Date(change.currentPeriodEnd)
                : null,
              canceledAt: change.status === 'canceled' ? new Date() : null,
            },
          })
      }
    }
  })

  await recordAudit({
    actorUserId: null,
    action: 'billing.paddle_event',
    target: eventId,
    meta: {
      applied,
      skipped,
      planCode: outcome.planChange?.planCode ?? null,
      note: outcome.note ?? null,
    },
  })

  return { applied, skipped }
}

/** Refreshes the materialised balance from the ledger. Never the other way round. */
export async function refreshBalance(userId: string): Promise<void> {
  await db().execute(sql`
    INSERT INTO credit_balances (user_id, balance, trial_balance, subscription_balance, topup_balance, updated_at)
    SELECT
      ${userId}::uuid,
      COALESCE(SUM(delta), 0),
      COALESCE(SUM(delta) FILTER (WHERE bucket = 'trial'), 0),
      COALESCE(SUM(delta) FILTER (WHERE bucket = 'subscription'), 0),
      COALESCE(SUM(delta) FILTER (WHERE bucket = 'topup'), 0),
      now()
    FROM credit_ledger
    WHERE user_id = ${userId}::uuid
      AND (delta < 0 OR expires_at IS NULL OR expires_at > now())
    ON CONFLICT (user_id) DO UPDATE SET
      balance = EXCLUDED.balance,
      trial_balance = EXCLUDED.trial_balance,
      subscription_balance = EXCLUDED.subscription_balance,
      topup_balance = EXCLUDED.topup_balance,
      updated_at = now()
  `)
}

export function outcomeFor(event: PaddleEvent, catalog: readonly CatalogEntry[]): PaddleOutcome {
  return intentsForEvent(event, catalog, Date.now())
}
