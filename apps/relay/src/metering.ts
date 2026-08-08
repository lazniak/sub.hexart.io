import { eq, sql } from 'drizzle-orm'
import {
  CRITICAL_SECONDS_LEFT,
  LEDGER_FLUSH_INTERVAL_MS,
  LOW_CREDITS_WARN_RATIO,
  RESERVATION_WINDOW_SECONDS,
  ZERO_BALANCE_GRACE_SECONDS,
  burnRatePerMinute,
  burnRatePerSecond,
  needsTopUp,
  planSpend,
  releaseUnused,
  reservationRemaining,
  type BucketBalance,
  type BurnConfig,
  type CreditBucket,
  type Reservation,
} from '@sub/billing'
import { SILENCE_PAUSE_MS, type NoticeCode } from '@sub/contracts'
import { creditBalances, creditLedger, type Database } from '@sub/db'

export const METER_TICK_MS = 1_000

export interface LedgerFlush {
  /** Credits burned since the previous flush. Never negative. */
  credits: number
  billableSeconds: number
  /** Monotonic per session; with the session id it makes a retried write harmless. */
  sequence: number
}

export interface ReservationResult {
  granted: number
  /** Balance left over after the grant — this is what the studio shows. */
  balanceRemaining: number
}

export interface MeterGateway {
  reserve(amount: number): Promise<ReservationResult>
  flush(entry: LedgerFlush): Promise<void>
  /** Hands an unspent reservation back. Called once, when the session closes. */
  release(amount: number): Promise<void>
}

export interface CreditsUpdate {
  remaining: number
  secondsLeft: number
  burnRatePerMin: number
}

export interface MeterEvents {
  onCredits(update: CreditsUpdate): void
  onNotice(notice: { level: 'info' | 'warn' | 'error'; code: NoticeCode }): void
  /** The grace period expired. The actor drains and closes with `credits_exhausted`. */
  onExhausted(): void
  onFlushFailed(error: unknown): void
}

export interface MeterOptions {
  burn: BurnConfig
  /** Credits `/api/session/start` already put on hold. */
  reserved: number
  /** Free balance beyond the initial reservation. */
  balanceRemaining: number
  gateway: MeterGateway
  events: MeterEvents
  now(): number
}

export interface MeterSnapshot {
  spent: number
  reserved: number
  balanceRemaining: number
  billableSeconds: number
  secondsLeft: number
  paused: boolean
  exhausted: boolean
}

/**
 * The billing clock.
 *
 * Reserves ahead so Postgres never sits on the hot path, and writes what was
 * actually burned every `LEDGER_FLUSH_INTERVAL_MS`. Two invariants matter more
 * than throughput:
 *
 *  1. Nothing is billed before it is consumed. A crash therefore loses at most
 *     one flush interval, and that loss falls on us, never on the user.
 *  2. Silence longer than `SILENCE_PAUSE_MS` stops the counter. Users leave the
 *     studio open between takes and must not pay for an idle microphone.
 */
export class Meter {
  private readonly ratePerSecond: number
  private readonly ratePerMinute: number
  private readonly reservation: Reservation
  private readonly initialAirtimeCredits: number

  private balanceRemaining: number
  private lastTickAt: number
  private lastAudioAt: number
  private lastFlushAt: number

  private pendingCredits = 0
  private billableMs = 0
  private flushedSeconds = 0
  private flushSequence = 0

  private graceStartedAt: number | null = null
  private warnedLow = false
  private warnedCritical = false
  private exhausted = false
  private closed = false

  constructor(private readonly options: MeterOptions) {
    this.ratePerSecond = burnRatePerSecond(options.burn)
    this.ratePerMinute = burnRatePerMinute(options.burn)
    this.reservation = { reserved: options.reserved, spent: 0 }
    this.balanceRemaining = options.balanceRemaining
    this.initialAirtimeCredits = round4(options.reserved + options.balanceRemaining)

    const now = options.now()
    this.lastTickAt = now
    this.lastAudioAt = now
    this.lastFlushAt = now
  }

  /** Called on every audio frame. Cheap on purpose — this runs 50 times a second. */
  markAudio(atMs: number): void {
    this.lastAudioAt = atMs
  }

  get paused(): boolean {
    return this.options.now() - this.lastAudioAt >= SILENCE_PAUSE_MS
  }

  get burnRatePerMin(): number {
    return this.ratePerMinute
  }

  snapshot(): MeterSnapshot {
    return {
      spent: this.reservation.spent,
      reserved: this.reservation.reserved,
      balanceRemaining: this.balanceRemaining,
      billableSeconds: Math.floor(this.billableMs / 1000),
      secondsLeft: this.secondsLeft(),
      paused: this.paused,
      exhausted: this.exhausted,
    }
  }

  async tick(): Promise<void> {
    if (this.closed) return

    const now = this.options.now()
    const elapsedMs = Math.max(0, now - this.lastTickAt)
    this.lastTickAt = now

    const idle = now - this.lastAudioAt >= SILENCE_PAUSE_MS
    if (!idle && elapsedMs > 0) this.charge(elapsedMs, now)

    await this.maybeTopUp(now)
    await this.maybeFlush(now)

    this.emitCredits()
    this.checkGrace(now)
  }

  /** Final flush plus the release of whatever was reserved and never used. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.flushNow(this.options.now())
    const unused = releaseUnused(this.reservation)
    if (unused > 0) {
      this.reservation.reserved = round4(this.reservation.reserved - unused)
      await this.options.gateway.release(unused)
    }
  }

  private charge(elapsedMs: number, now: number): void {
    const wanted = round4((elapsedMs / 1000) * this.ratePerSecond)
    if (wanted <= 0) return

    const available = Math.max(0, reservationRemaining(this.reservation))
    const charged = round4(Math.min(wanted, available))

    this.reservation.spent = round4(this.reservation.spent + charged)
    this.pendingCredits = round4(this.pendingCredits + charged)
    this.billableMs += (charged / wanted) * elapsedMs

    // Could not cover the full second: the reservation is dry and the top-up failed.
    if (charged < wanted) this.enterGrace(now)
  }

  private async maybeTopUp(now: number): Promise<void> {
    if (this.exhausted) return
    if (!needsTopUp(this.reservation, this.ratePerSecond, RESERVATION_WINDOW_SECONDS)) return

    const want = round4(this.ratePerSecond * RESERVATION_WINDOW_SECONDS)
    const result = await this.options.gateway.reserve(want)
    this.balanceRemaining = result.balanceRemaining

    if (result.granted > 0) {
      this.reservation.reserved = round4(this.reservation.reserved + result.granted)
      this.graceStartedAt = null
      return
    }
    // Nothing left to reserve. Grace starts now, not when the reservation runs dry,
    // so the warning reaches the studio before the captions stop.
    this.enterGrace(now)
  }

  private async maybeFlush(now: number): Promise<void> {
    if (now - this.lastFlushAt < LEDGER_FLUSH_INTERVAL_MS) return
    await this.flushNow(now)
  }

  private async flushNow(now: number): Promise<void> {
    const credits = this.pendingCredits
    const totalSeconds = Math.floor(this.billableMs / 1000)
    const seconds = Math.max(0, totalSeconds - this.flushedSeconds)
    this.lastFlushAt = now
    if (credits <= 0 && seconds <= 0) return

    // Clear before the write: if it fails we drop the interval instead of risking a
    // double charge on the next one. The loss is ours by design (ARCHITECTURE.md §6).
    this.pendingCredits = 0
    this.flushedSeconds = totalSeconds

    try {
      await this.options.gateway.flush({
        credits,
        billableSeconds: seconds,
        sequence: ++this.flushSequence,
      })
    } catch (error) {
      this.options.events.onFlushFailed(error)
    }
  }

  private enterGrace(now: number): void {
    if (this.graceStartedAt !== null) return
    this.graceStartedAt = now
    if (!this.warnedCritical) {
      this.warnedCritical = true
      this.options.events.onNotice({ level: 'error', code: 'CREDITS_CRITICAL' })
    }
  }

  private checkGrace(now: number): void {
    if (this.exhausted || this.graceStartedAt === null) return
    if (now - this.graceStartedAt < ZERO_BALANCE_GRACE_SECONDS * 1000) return
    this.exhausted = true
    this.options.events.onExhausted()
  }

  private emitCredits(): void {
    const remaining = this.remainingCredits()
    const secondsLeft = this.secondsLeft()

    this.options.events.onCredits({
      remaining,
      secondsLeft,
      burnRatePerMin: this.ratePerMinute,
    })

    if (!this.warnedCritical && secondsLeft <= CRITICAL_SECONDS_LEFT) {
      this.warnedCritical = true
      this.options.events.onNotice({ level: 'error', code: 'CREDITS_CRITICAL' })
      return
    }
    if (
      !this.warnedLow &&
      this.initialAirtimeCredits > 0 &&
      remaining / this.initialAirtimeCredits <= LOW_CREDITS_WARN_RATIO
    ) {
      this.warnedLow = true
      this.options.events.onNotice({ level: 'warn', code: 'LOW_CREDITS' })
    }
  }

  private remainingCredits(): number {
    return round4(Math.max(0, this.balanceRemaining + reservationRemaining(this.reservation)))
  }

  private secondsLeft(): number {
    if (this.ratePerSecond <= 0) return 0
    return Math.max(0, Math.floor(this.remainingCredits() / this.ratePerSecond))
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Postgres + Redis gateway
 * ──────────────────────────────────────────────────────────────────────────── */

export interface HoldCommands {
  get(key: string): Promise<string | null>
  incrbyfloat(key: string, increment: number | string): Promise<string>
  expire(key: string, seconds: number): Promise<number>
}

export interface LedgerGatewayOptions {
  db: Database
  redis: HoldCommands
  userId: string
  sessionId: string
}

/** Safety net: a relay that dies mid-session must not hold credits hostage forever. */
const HOLD_TTL_SECONDS = 15 * 60

/**
 * Reservations live in Redis, usage lives in Postgres.
 *
 * A hold is not a ledger entry — no money moved yet. Available credit is
 * `balance - hold`, so two concurrent sessions cannot both promise the same
 * minute. Only `flush` touches the append-only ledger, and it does so together
 * with the materialised balance inside one transaction.
 */
export function createLedgerGateway(options: LedgerGatewayOptions): MeterGateway {
  const { db, redis, userId, sessionId } = options
  const holdKey = `hold:${userId}`

  return {
    async reserve(amount) {
      const balances = await readBuckets(db, userId)
      const hold = Number((await redis.get(holdKey)) ?? 0)
      const available = round4(balances.reduce((sum, b) => sum + Math.max(0, b.balance), 0) - hold)
      const granted = round4(Math.max(0, Math.min(amount, available)))

      if (granted > 0) {
        await redis.incrbyfloat(holdKey, granted)
        await redis.expire(holdKey, HOLD_TTL_SECONDS)
      }
      return { granted, balanceRemaining: round4(Math.max(0, available - granted)) }
    },

    async flush(entry) {
      if (entry.credits <= 0) return
      const balances = await readBuckets(db, userId)
      const plan = planSpend(balances, entry.credits)

      await db.transaction(async (tx) => {
        for (const part of plan.perBucket) {
          if (part.amount <= 0) continue
          await tx
            .insert(creditLedger)
            .values({
              userId,
              delta: (-part.amount).toFixed(4),
              reason: 'session_usage',
              bucket: part.bucket,
              sessionId,
              idempotencyKey: `sess:${sessionId}:${entry.sequence}:${part.bucket}`,
              meta: { billableSeconds: entry.billableSeconds },
            })
            .onConflictDoNothing()
        }

        await tx
          .update(creditBalances)
          .set({
            balance: sql`${creditBalances.balance} - ${plan.covered}`,
            trialBalance: sql`${creditBalances.trialBalance} - ${bucketAmount(plan.perBucket, 'trial')}`,
            subscriptionBalance: sql`${creditBalances.subscriptionBalance} - ${bucketAmount(plan.perBucket, 'subscription')}`,
            topupBalance: sql`${creditBalances.topupBalance} - ${bucketAmount(plan.perBucket, 'topup')}`,
            updatedAt: new Date(),
          })
          .where(eq(creditBalances.userId, userId))
      })

      // The hold covered these credits; the ledger owns them now.
      await redis.incrbyfloat(holdKey, -plan.covered)
      await redis.expire(holdKey, HOLD_TTL_SECONDS)
    },

    async release(amount) {
      if (amount <= 0) return
      await redis.incrbyfloat(holdKey, -amount)
      await redis.expire(holdKey, HOLD_TTL_SECONDS)
    },
  }
}

async function readBuckets(db: Database, userId: string): Promise<BucketBalance[]> {
  const rows = await db
    .select({
      trial: creditBalances.trialBalance,
      subscription: creditBalances.subscriptionBalance,
      topup: creditBalances.topupBalance,
    })
    .from(creditBalances)
    .where(eq(creditBalances.userId, userId))
    .limit(1)

  const row = rows[0]
  return [
    { bucket: 'trial', balance: Number(row?.trial ?? 0), expiresAt: null },
    { bucket: 'subscription', balance: Number(row?.subscription ?? 0), expiresAt: null },
    { bucket: 'topup', balance: Number(row?.topup ?? 0), expiresAt: null },
  ]
}

function bucketAmount(
  parts: readonly { bucket: CreditBucket; amount: number }[],
  bucket: CreditBucket,
): number {
  return parts.find((p) => p.bucket === bucket)?.amount ?? 0
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
