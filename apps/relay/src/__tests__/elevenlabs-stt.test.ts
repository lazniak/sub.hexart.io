import { describe, expect, it } from 'vitest'
import type { SttEvent } from '@sub/caption-engine'
import {
  ElevenLabsSttClient,
  MAX_RECONNECT_ATTEMPTS,
  backoffDelayMs,
  buildSttUrl,
  normaliseSttMessage,
  sanitiseKeyterms,
  type SttUpstreamError,
} from '../providers/elevenlabs-stt.js'
import type { SocketFactory, UpstreamHandlers, UpstreamSocket } from '../providers/socket.js'

/** Records every connection attempt and hands the test control of the socket. */
function recordingFactory() {
  const opened: { url: string; headers: Record<string, string>; handlers: UpstreamHandlers }[] = []
  const factory: SocketFactory = (url, headers, handlers) => {
    opened.push({ url, headers, handlers })
    const socket: UpstreamSocket = {
      send: () => undefined,
      close: () => undefined,
      open: false,
    }
    return socket
  }
  return { factory, opened }
}

function makeClient(overrides: { random?: () => number } = {}) {
  const recorder = recordingFactory()
  const timers: { fn: () => void; ms: number }[] = []
  const events: SttEvent[] = []
  const errors: SttUpstreamError[] = []

  const client = new ElevenLabsSttClient({
    apiKey: 'test-key',
    model: 'scribe_v2_realtime',
    region: 'eu',
    noVerbatim: true,
    onEvent: (event) => events.push(event),
    onError: (error) => errors.push(error),
    now: () => 0,
    createSocket: recorder.factory,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length - 1
    },
    clearTimer: () => undefined,
    random: overrides.random ?? (() => 0.5),
  })

  const drop = () => {
    const last = recorder.opened[recorder.opened.length - 1]
    last?.handlers.onError(new Error('connection reset'))
  }
  const runPendingTimer = () => {
    const next = timers.shift()
    next?.fn()
  }

  return { client, recorder, timers, events, errors, drop, runPendingTimer }
}

describe('backoffDelayMs', () => {
  it('grows exponentially and stays inside the jitter window', () => {
    expect(backoffDelayMs(1, 0)).toBe(125)
    expect(backoffDelayMs(1, 1)).toBe(250)
    expect(backoffDelayMs(2, 1)).toBe(500)
    expect(backoffDelayMs(3, 1)).toBe(1_000)
  })

  it('never returns the same delay for different jitter, so retries do not synchronise', () => {
    expect(backoffDelayMs(2, 0)).not.toBe(backoffDelayMs(2, 1))
  })

  it('caps the window', () => {
    expect(backoffDelayMs(20, 1)).toBe(4_000)
  })

  it('tolerates a jitter source outside [0,1]', () => {
    expect(backoffDelayMs(1, -5)).toBe(125)
    expect(backoffDelayMs(1, 5)).toBe(250)
  })
})

describe('reconnect', () => {
  it('retries three times with growing backoff, then gives up with a fatal error', () => {
    const harness = makeClient()
    harness.client.start()
    expect(harness.recorder.opened).toHaveLength(1)

    const delays: number[] = []
    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt += 1) {
      harness.drop()
      const scheduled = harness.timers[harness.timers.length - 1]
      expect(scheduled).toBeDefined()
      delays.push(scheduled?.ms ?? 0)
      harness.runPendingTimer()
    }

    expect(harness.recorder.opened).toHaveLength(1 + MAX_RECONNECT_ATTEMPTS)
    expect(delays).toEqual([...delays].sort((a, b) => a - b))
    expect(harness.errors.map((error) => error.code)).toEqual([
      'STT_RECONNECTING',
      'STT_RECONNECTING',
      'STT_RECONNECTING',
    ])

    // One drop past the budget: no further socket, one fatal error.
    harness.drop()
    expect(harness.recorder.opened).toHaveLength(1 + MAX_RECONNECT_ATTEMPTS)
    expect(harness.errors[harness.errors.length - 1]?.code).toBe('FATAL')
    expect(harness.client.connectionState).toBe('closed')
  })

  it('resets the budget once a connection comes back up', () => {
    const harness = makeClient()
    harness.client.start()

    harness.drop()
    harness.runPendingTimer()
    harness.recorder.opened[1]?.handlers.onOpen()

    expect(harness.client.reconnectAttempts).toBe(0)
    expect(harness.client.connectionState).toBe('open')
  })

  it('stops reconnecting after close', () => {
    const harness = makeClient()
    harness.client.start()
    harness.client.close()
    harness.drop()

    expect(harness.recorder.opened).toHaveLength(1)
    expect(harness.errors).toHaveLength(0)
  })
})

describe('normaliseSttMessage', () => {
  it('maps the three transcript frames onto engine events', () => {
    expect(normaliseSttMessage({ message_type: 'partial_transcript', text: 'ala ma' }, 5)).toEqual({
      kind: 'partial',
      text: 'ala ma',
      atMs: 5,
    })
    expect(
      normaliseSttMessage({ message_type: 'committed_transcript', text: 'Ala ma kota.' }, 7),
    ).toEqual({ kind: 'committed', text: 'Ala ma kota.', atMs: 7 })
    expect(
      normaliseSttMessage(
        { message_type: 'COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS', text: 'Ala ma kota.', words: [] },
        9,
      ),
    ).toEqual({ kind: 'committed', text: 'Ala ma kota.', atMs: 9 })
  })

  it('treats an empty commit as silence and ignores empty partials', () => {
    expect(normaliseSttMessage({ message_type: 'committed_transcript', text: '  ' }, 3)).toEqual({
      kind: 'silence',
      atMs: 3,
    })
    expect(normaliseSttMessage({ message_type: 'partial_transcript', text: '' }, 3)).toBeNull()
  })

  it('ignores frames it does not model', () => {
    expect(normaliseSttMessage({ message_type: 'session_started' }, 1)).toBeNull()
    expect(normaliseSttMessage(null, 1)).toBeNull()
    expect(normaliseSttMessage('nonsense', 1)).toBeNull()
  })
})

describe('keyterms', () => {
  it('drops over-long terms, de-duplicates and stops at the Scribe limit', () => {
    const terms = [
      'hexart',
      'HEXART',
      '  spacing  ',
      'x'.repeat(21),
      ...Array.from({ length: 60 }, (_, i) => `term${i}`),
    ]
    const result = sanitiseKeyterms(terms)

    expect(result).toHaveLength(50)
    expect(result).toContain('hexart')
    expect(result).not.toContain('HEXART')
    expect(result).toContain('spacing')
    expect(result.some((term) => term.length > 20)).toBe(false)
  })
})

describe('buildSttUrl', () => {
  it('pins the residency host and the wire format the browser already produces', () => {
    const url = new URL(
      buildSttUrl({
        region: 'eu',
        model: 'scribe_v2_realtime',
        languageCode: 'pl',
        keyterms: ['hexart'],
        noVerbatim: true,
      }),
    )

    expect(url.host).toBe('api.eu.residency.elevenlabs.io')
    expect(url.searchParams.get('audio_format')).toBe('pcm_16000')
    expect(url.searchParams.get('no_verbatim')).toBe('true')
    expect(url.searchParams.get('language_code')).toBe('pl')
    expect(url.searchParams.getAll('keyterms')).toEqual(['hexart'])
  })

  it('omits the language when the source is auto-detected', () => {
    const url = new URL(
      buildSttUrl({
        region: 'eu',
        model: 'scribe_v2_realtime',
        keyterms: [],
        noVerbatim: false,
      }),
    )
    expect(url.searchParams.has('language_code')).toBe(false)
  })
})
