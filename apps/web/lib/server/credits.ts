import { and, desc, eq, sql } from 'drizzle-orm'
import { creditLedger } from '@sub/db'
import { totalAvailable, type BucketBalance, type CreditBucket } from '@sub/billing'
import { db } from '@/lib/server/db'

export interface LedgerRow {
  id: string
  delta: number
  reason: string
  bucket: CreditBucket
  createdAt: Date
  expiresAt: Date | null
}

/**
 * Balance is derived, never read from a mutable column.
 *
 * The aggregation mirrors `bucketBalances` from @sub/billing (positive entries
 * past their expiry stop counting, spends always count) but runs in Postgres so
 * a long-lived account does not drag its whole ledger into memory on every page
 * load. BILLING.md §5 — the ledger is the only source of truth.
 */
export async function bucketBalancesOf(userId: string): Promise<BucketBalance[]> {
  const rows = await db()
    .select({
      bucket: creditLedger.bucket,
      balance: sql<string>`coalesce(sum(${creditLedger.delta}), 0)`,
      expiresAt: sql<Date | null>`min(${creditLedger.expiresAt}) filter (where ${creditLedger.delta} > 0)`,
    })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.userId, userId),
        sql`(${creditLedger.delta} < 0 or ${creditLedger.expiresAt} is null or ${creditLedger.expiresAt} > now())`,
      ),
    )
    .groupBy(creditLedger.bucket)

  return rows.map((r) => ({
    bucket: r.bucket,
    balance: Number(r.balance),
    expiresAt: r.expiresAt ? new Date(r.expiresAt).getTime() : null,
  }))
}

export async function availableCredits(userId: string): Promise<number> {
  return totalAvailable(await bucketBalancesOf(userId))
}

export async function recentLedger(userId: string, limit = 50): Promise<LedgerRow[]> {
  const rows = await db()
    .select({
      id: creditLedger.id,
      delta: creditLedger.delta,
      reason: creditLedger.reason,
      bucket: creditLedger.bucket,
      createdAt: creditLedger.createdAt,
      expiresAt: creditLedger.expiresAt,
    })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit)

  return rows.map((r) => ({ ...r, delta: Number(r.delta) }))
}
