import { describe, expect, it } from 'vitest'
import { SILENCE_PAUSE_MS, type NoticeCode } from '@sub/contracts'
import { ZERO_BALANCE_GRACE_SECONDS } from '@sub/billing'
import { Meter, type LedgerFlush, type MeterEvents, type MeterGateway } from '../metering.js'

function makeClock(start = 0) {
  let t = start
  return {
    now: () => t,
    advance(ms: number) {
      t += ms
    },
  }
}

function makeGateway(available: number) {
  const flushes: LedgerFlush[] = []
  let pool = available
  let released = 0

  const gateway: MeterGateway = {
    async reserve(amount) {
      const granted = Math.min(amount, pool)
      pool = round4(pool - granted)
      return { granted, balanceRemaining: pool }
    },
    async flush(entry) {
      flushes.push(entry)
    },
    async release(amount) {
      released += amount
      pool = round4(pool + amount)
    },
  }

  return {
    gateway,
    flushes,
    get released() {
      return released
    },
    get flushedCredits() {
      return round4(flushes.reduce((sum, f) => sum + f.credits, 0))
    },
  }
}

function makeEvents() {
  const notices: NoticeCode[] = []
  const credits: number[] = []
  let exhausted = 0
  const events: MeterEvents = {
    onCredits: (update) => credits.push(update.remaining),
    onNotice: (notice) => notices.push(notice.code),
    onExhausted: () => {
      exhausted += 1
    },
    onFlushFailed: () => undefined,
  }
  return {
    events,
    notices,
    credits,
    get exhausted() {
      return exhausted
    },
  }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

describe('Meter arithmetic', () => {
  it('burns captions plus one target language at 1.5 credits per minute', async () => {
    const clock = makeClock()
    const gw = makeGateway(100)
    const sink = makeEvents()
    const meter = new Meter({
      burn: { targetLanguages: 1, voiceEnabled: false },
      reserved: 10,
      balanceRemaining: 100,
      gateway: gw.gateway,
      events: sink.events,
      now: clock.now,
    })

    expect(meter.burnRatePerMin).toBe(1.5)

    for (let i = 0; i < 4; i += 1) {
      clock.advance(1_000)
      meter.markAudio(clock.now())
      await meter.tick()
    }

    // 1.5 credits/min → 0.025 credits/s → four seconds of airtime.
    expect(meter.snapshot().spent).toBeCloseTo(0.1, 6)
    expect(meter.snapshot().billableSeconds).toBe(4)
  })

  it('adds the voice surcharge', () => {
    const clock = makeClock()
    const gw = makeGateway(100)
    const meter = new Meter({
      burn: { targetLanguages: 2, voiceEnabled: true },
      reserved: 10,
      balanceRemaining: 100,
      gateway: gw.gateway,
      events: makeEvents().events,
      now: clock.now,
    })
    // 1.0 captions + 2 × 0.5 translation + 3.0 voice
    expect(meter.burnRatePerMin).toBe(5)
  })

  it('flushes exactly what it burned, never more', async () => {
    const clock = makeClock()
    const gw = makeGateway(100)
    const meter = new Meter({
      burn: { targetLanguages: 0, voiceEnabled: false },
      reserved: 2,
      balanceRemaining: 100,
      gateway: gw.gateway,
      events: makeEvents().events,
      now: clock.now,
    })

    for (let i = 0; i < 45; i += 1) {
      clock.advance(1_000)
      meter.markAudio(clock.now())
      await meter.tick()
    }
    await meter.close()

    // 1.0 credit/min rounds to 0.0167 credits/s — the rate the ledger actually uses.
    expect(gw.flushedCredits).toBeCloseTo(meter.snapshot().spent, 6)
    expect(gw.flushedCredits).toBeCloseTo(45 * 0.0167, 6)
  })
})

describe('silence', () => {
  it('pauses the counter once the microphone has been quiet for the grace window', async () => {
    const clock = makeClock()
    const gw = makeGateway(1_000)
    const meter = new Meter({
      burn: { targetLanguages: 1, voiceEnabled: false },
      reserved: 5,
      balanceRemaining: 1_000,
      gateway: gw.gateway,
      events: makeEvents().events,
      now: clock.now,
    })

    // Audio arrives at t=0 only; every later tick is progressively more idle.
    for (let t = 1_000; t <= SILENCE_PAUSE_MS - 1_000; t += 1_000) {
      clock.advance(1_000)
      await meter.tick()
    }
    const spentBeforePause = meter.snapshot().spent
    expect(spentBeforePause).toBeCloseTo(19 * 0.025, 6)

    for (let t = 0; t < 30; t += 1) {
      clock.advance(1_000)
      await meter.tick()
    }

    expect(meter.paused).toBe(true)
    expect(meter.snapshot().spent).toBeCloseTo(spentBeforePause, 6)
  })

  it('resumes charging as soon as audio comes back', async () => {
    const clock = makeClock()
    const gw = makeGateway(1_000)
    const meter = new Meter({
      burn: { targetLanguages: 0, voiceEnabled: false },
      reserved: 5,
      balanceRemaining: 1_000,
      gateway: gw.gateway,
      events: makeEvents().events,
      now: clock.now,
    })

    clock.advance(SILENCE_PAUSE_MS + 5_000)
    await meter.tick()
    expect(meter.snapshot().spent).toBe(0)

    clock.advance(1_000)
    meter.markAudio(clock.now())
    await meter.tick()
    expect(meter.snapshot().spent).toBeCloseTo(0.0167, 6)
  })
})

describe('zero balance', () => {
  it('warns, holds the line for the grace window, then cuts the session off', async () => {
    const clock = makeClock()
    // Nothing left to reserve: the initial hold is all the airtime there is.
    const gw = makeGateway(0)
    const sink = makeEvents()
    const meter = new Meter({
      burn: { targetLanguages: 1, voiceEnabled: false },
      reserved: 0.05,
      balanceRemaining: 0,
      gateway: gw.gateway,
      events: sink.events,
      now: clock.now,
    })

    let exhaustedAt: number | null = null
    for (let i = 0; i < 90; i += 1) {
      clock.advance(1_000)
      meter.markAudio(clock.now())
      await meter.tick()
      if (exhaustedAt === null && sink.exhausted > 0) exhaustedAt = clock.now()
    }

    expect(sink.notices).toContain('CREDITS_CRITICAL')
    expect(sink.exhausted).toBe(1)
    expect(exhaustedAt).not.toBeNull()
    // Grace starts on the first failed top-up, one tick in.
    expect(exhaustedAt).toBeLessThanOrEqual((ZERO_BALANCE_GRACE_SECONDS + 2) * 1_000)
  })

  it('never bills past the reservation, so an over-run lands on us and not the user', async () => {
    const clock = makeClock()
    const gw = makeGateway(0)
    const meter = new Meter({
      burn: { targetLanguages: 1, voiceEnabled: false },
      reserved: 0.05,
      balanceRemaining: 0,
      gateway: gw.gateway,
      events: makeEvents().events,
      now: clock.now,
    })

    for (let i = 0; i < 30; i += 1) {
      clock.advance(1_000)
      meter.markAudio(clock.now())
      await meter.tick()
    }
    await meter.close()

    expect(meter.snapshot().spent).toBeCloseTo(0.05, 6)
    expect(gw.flushedCredits).toBeCloseTo(0.05, 6)
  })

  it('returns the unspent reservation when the session closes', async () => {
    const clock = makeClock()
    const gw = makeGateway(100)
    const meter = new Meter({
      burn: { targetLanguages: 0, voiceEnabled: false },
      reserved: 5,
      balanceRemaining: 100,
      gateway: gw.gateway,
      events: makeEvents().events,
      now: clock.now,
    })

    clock.advance(1_000)
    meter.markAudio(clock.now())
    await meter.tick()
    await meter.close()

    expect(gw.released).toBeGreaterThan(4.9)
  })
})
