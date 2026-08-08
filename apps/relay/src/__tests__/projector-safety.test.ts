import { describe, expect, it } from 'vitest'
import { CaptionEngine } from '@sub/caption-engine'
import { SessionConfig, isProjectorSafe, type RelayMessage } from '@sub/contracts'
import { createLogger } from '../logger.js'
import { Meter, type MeterEvents, type MeterGateway } from '../metering.js'
import {
  SessionActor,
  allowedForRole,
  type OutboundSocket,
  type SttHandlers,
  type SttLike,
  type TtsHandlers,
  type TtsLike,
} from '../session-actor.js'

/**
 * The projector URL lives in somebody's OBS and is regularly visible on stream.
 * Anything describing the account — balance, warnings, tokens — must never be
 * addressable from it. These tests are the enforcement of that boundary.
 */

function recorder() {
  const messages: RelayMessage[] = []
  const socket: OutboundSocket = {
    send: (payload) => {
      messages.push(JSON.parse(payload) as RelayMessage)
    },
    close: () => undefined,
  }
  return {
    socket,
    messages,
    types: () => messages.map((message) => message.t),
  }
}

const stubStt: SttLike = {
  start: () => undefined,
  sendAudio: () => undefined,
  commit: () => undefined,
  close: () => undefined,
}

const gateway: MeterGateway = {
  async reserve(amount) {
    return { granted: amount, balanceRemaining: 100 }
  },
  async flush() {},
  async release() {},
}

function makeActor(config: SessionConfig = SessionConfig.parse({})) {
  const studio = recorder()
  const clock = { t: 0 }
  let meterEvents: MeterEvents | null = null
  let sttHandlers: SttHandlers | null = null
  let ttsHandlers: TtsHandlers | null = null

  const tts: TtsLike = { start: () => undefined, speak: () => undefined, close: () => undefined }

  const actor = new SessionActor({
    sessionId: 'session-1',
    userId: 'user-1',
    projectorToken: 'pt_test',
    config,
    watermark: true,
    studio: studio.socket,
    engine: new CaptionEngine({ targetLangs: config.dstLangs, voiceLang: null }),
    translator: { translate: async () => 'translated' },
    logger: createLogger('silent'),
    now: () => clock.t,
    createMeter: (events) => {
      meterEvents = events
      return new Meter({
        burn: { targetLanguages: 0, voiceEnabled: false },
        reserved: 10,
        balanceRemaining: 100,
        gateway,
        events,
        now: () => clock.t,
      })
    },
    createStt: (handlers) => {
      sttHandlers = handlers
      return stubStt
    },
    createTts: (handlers) => {
      ttsHandlers = handlers
      return tts
    },
    onClosed: () => undefined,
    setTicker: () => 0,
    clearTicker: () => undefined,
  })

  return {
    actor,
    studio,
    clock,
    meter: () => meterEvents as MeterEvents,
    stt: () => sttHandlers as SttHandlers,
    tts: () => ttsHandlers as TtsHandlers,
  }
}

describe('projector allowlist', () => {
  it('never forwards a credits event to a projector', () => {
    const harness = makeActor()
    harness.actor.start()
    const projector = recorder()
    harness.actor.attachProjector(projector.socket, 'captions')

    harness.meter().onCredits({ remaining: 12.5, secondsLeft: 500, burnRatePerMin: 1.5 })

    expect(harness.studio.types()).toContain('credits')
    expect(projector.types()).not.toContain('credits')
  })

  it('never forwards a notice to a projector', () => {
    const harness = makeActor()
    harness.actor.start()
    const projector = recorder()
    harness.actor.attachProjector(projector.socket, 'captions')

    harness.meter().onNotice({ level: 'warn', code: 'LOW_CREDITS' })

    expect(harness.studio.types()).toContain('notice')
    expect(projector.types()).not.toContain('notice')
  })

  it('keeps ready and end off the projector too', async () => {
    const harness = makeActor()
    harness.actor.start()
    const projector = recorder()
    harness.actor.attachProjector(projector.socket, 'captions')

    await harness.actor.close('user')

    expect(harness.studio.types()).toEqual(expect.arrayContaining(['ready', 'end']))
    expect(projector.types()).not.toContain('ready')
    expect(projector.types()).not.toContain('end')
  })

  it('does forward caption traffic', () => {
    const harness = makeActor()
    harness.actor.start()
    const projector = recorder()
    harness.actor.attachProjector(projector.socket, 'captions')

    harness.stt().onEvent({ kind: 'partial', text: 'dzisiaj pokaze wam', atMs: 100 })

    expect(projector.types()).toContain('partial')
  })

  it('sends audio to the voice source and captions to the caption source', () => {
    const harness = makeActor()
    harness.actor.start()
    const captions = recorder()
    const voice = recorder()
    harness.actor.attachProjector(captions.socket, 'captions')
    harness.actor.attachProjector(voice.socket, 'voice')

    harness.stt().onEvent({ kind: 'partial', text: 'dzisiaj pokaze wam', atMs: 100 })
    harness.tts().onAudio({ cardId: 'c1', lang: 'en', chunk: 'AAAA', final: false })

    expect(captions.types()).toContain('partial')
    expect(captions.types()).not.toContain('tts')
    expect(voice.types()).toContain('tts')
    expect(voice.types()).not.toContain('partial')
  })

  it('classifies every studio-only event as unsafe', () => {
    const samples: RelayMessage[] = [
      { t: 'credits', remaining: 1, secondsLeft: 1, burnRatePerMin: 1 },
      { t: 'notice', level: 'warn', code: 'LOW_CREDITS' },
      { t: 'ready', sessionId: 's', protocolVersion: '1.1.0', burnRatePerMin: 1 },
      { t: 'end', reason: 'user', creditsSpent: 1 },
    ]
    for (const sample of samples) expect(isProjectorSafe(sample)).toBe(false)
  })

  it('narrows by role without ever widening the allowlist', () => {
    expect(allowedForRole('tts', 'voice')).toBe(true)
    expect(allowedForRole('tts', 'captions')).toBe(false)
    expect(allowedForRole('partial', 'voice')).toBe(false)
    expect(allowedForRole('partial', 'captions')).toBe(true)
  })
})

describe('projector attach', () => {
  it('sends a full snapshot so an OBS refresh loses nothing', () => {
    const harness = makeActor()
    harness.actor.start()
    harness.stt().onEvent({ kind: 'partial', text: 'dzisiaj pokaze wam', atMs: 100 })

    const projector = recorder()
    harness.actor.attachProjector(projector.socket, 'captions')

    const [first] = projector.messages
    expect(first?.t).toBe('snapshot')
    if (first?.t !== 'snapshot') throw new Error('expected a snapshot')
    expect(first.cards).toHaveLength(1)
    expect(first.watermark).toBe(true)
    expect(first.seq).toBe(harness.actor.lastSeq)
  })

  it('backfills instead of re-sending everything when the client knows its lastSeq', () => {
    const harness = makeActor()
    harness.actor.start()
    harness.stt().onEvent({ kind: 'partial', text: 'dzisiaj pokaze', atMs: 100 })
    harness.stt().onEvent({ kind: 'partial', text: 'dzisiaj pokaze wam', atMs: 200 })

    const projector = recorder()
    harness.actor.attachProjector(projector.socket, 'captions', 1)

    expect(projector.types()).not.toContain('snapshot')
    expect(projector.types()).toEqual(['partial'])
  })

  it('falls back to a snapshot when the requested range has aged out', () => {
    const harness = makeActor()
    harness.actor.start()
    harness.stt().onEvent({ kind: 'partial', text: 'dzisiaj pokaze', atMs: 100 })

    const projector = recorder()
    harness.actor.attachProjector(projector.socket, 'captions', 99)

    expect(projector.types()).toEqual(['snapshot'])
  })
})
