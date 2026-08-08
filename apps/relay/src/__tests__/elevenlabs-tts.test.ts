import { describe, expect, it } from 'vitest'
import { ElevenLabsTtsClient, buildTtsUrl } from '../providers/elevenlabs-tts.js'
import type { UpstreamHandlers, UpstreamSocket } from '../providers/socket.js'

interface FakeSocket extends UpstreamSocket {
  sent: string[]
  closedWith: { code?: number; reason?: string } | null
  /** Upstream events, named so a test reads as what the provider did. */
  emitOpen(): void
  emitClose(): void
  emitError(message: string): void
}

/** Collects every socket the client opens, so reconnects are countable. */
function socketHarness() {
  const sockets: FakeSocket[] = []
  const timers: { fn: () => void; ms: number }[] = []

  const createSocket = (
    _url: string,
    _headers: Record<string, string>,
    handlers: UpstreamHandlers,
  ) => {
    let opened = false
    const socket: FakeSocket = {
      sent: [],
      closedWith: null,
      get open() {
        return opened
      },
      send: (payload: string) => {
        socket.sent.push(payload)
      },
      close: (code?: number, reason?: string) => {
        opened = false
        socket.closedWith = { code, reason }
      },
      emitOpen: () => {
        opened = true
        handlers.onOpen()
      },
      emitClose: () => {
        opened = false
        handlers.onClose(1006, 'abnormal closure')
      },
      emitError: (message: string) => {
        opened = false
        handlers.onError(new Error(message))
      },
    }
    sockets.push(socket)
    return socket
  }

  return {
    sockets,
    timers,
    createSocket,
    setTimer: (fn: () => void, ms: number) => {
      timers.push({ fn, ms })
      return timers.length as unknown as ReturnType<typeof setTimeout>
    },
    clearTimer: (handle: ReturnType<typeof setTimeout>) => {
      timers.splice((handle as unknown as number) - 1, 1)
    },
    /** Fires every pending timer once, in order. */
    runTimers: () => {
      const due = timers.splice(0)
      for (const timer of due) timer.fn()
    },
  }
}

function client(harness: ReturnType<typeof socketHarness>, onError = () => {}) {
  return new ElevenLabsTtsClient({
    apiKey: 'test-key',
    model: 'eleven_flash_v2_5',
    region: 'eu',
    voiceId: 'voice-1',
    lang: 'en',
    speed: 1,
    onAudio: () => {},
    onError,
    createSocket: harness.createSocket,
    setTimer: harness.setTimer,
    clearTimer: harness.clearTimer,
  })
}

describe('buildTtsUrl', () => {
  it('carries the parameters the streaming endpoint needs', () => {
    const url = new URL(
      buildTtsUrl({ region: 'eu', voiceId: 'v/1', model: 'eleven_flash_v2_5', lang: 'pl' }),
    )
    expect(url.protocol).toBe('wss:')
    expect(url.pathname).toContain(encodeURIComponent('v/1'))
    expect(url.searchParams.get('model_id')).toBe('eleven_flash_v2_5')
    expect(url.searchParams.get('auto_mode')).toBe('true')
    expect(url.searchParams.get('language_code')).toBe('pl')
    expect(Number(url.searchParams.get('inactivity_timeout'))).toBeGreaterThan(60)
  })

  it('never puts the api key in the URL', () => {
    const url = buildTtsUrl({ region: 'eu', voiceId: 'v', model: 'm', lang: 'en' })
    expect(url).not.toContain('test-key')
    expect(url).not.toContain('xi-api-key')
  })
})

describe('session socket lifetime', () => {
  it('opens one socket and keeps it across sentences', () => {
    const h = socketHarness()
    const tts = client(h)
    tts.start()
    h.sockets[0]!.emitOpen()

    tts.speak('c1', 'Pierwsze zdanie.')
    tts.speak('c2', 'Drugie zdanie.')

    // Reconnecting per sentence would cost 150-300 ms we do not have.
    expect(h.sockets).toHaveLength(1)
    expect(h.sockets[0]!.sent.filter((s) => s.includes('flush'))).toHaveLength(2)
  })

  it('queues sentences spoken before the socket opens', () => {
    const h = socketHarness()
    const tts = client(h)
    tts.start()
    tts.speak('c1', 'Zanim się otworzy.')

    expect(h.sockets[0]!.sent).toHaveLength(0)
    h.sockets[0]!.emitOpen()
    expect(h.sockets[0]!.sent.some((s) => s.includes('Zanim'))).toBe(true)
  })
})

describe('reconnect', () => {
  it('retries a mid-session drop instead of silencing the voice for good', () => {
    const h = socketHarness()
    const tts = client(h)
    tts.start()
    h.sockets[0]!.emitOpen()

    h.sockets[0]!.emitClose()
    expect(h.timers).toHaveLength(1)
    h.runTimers()

    expect(h.sockets).toHaveLength(2)
    h.sockets[1]!.emitOpen()
    tts.speak('c1', 'Po odzyskaniu połączenia.')
    expect(h.sockets[1]!.sent.some((s) => s.includes('odzyskaniu'))).toBe(true)
  })

  it('gives up after the bounded attempts and reports once', () => {
    const h = socketHarness()
    const errors: string[] = []
    const tts = client(h, () => errors.push('tts'))
    tts.start()

    // A credential that fails the handshake never opens, so the budget never resets.
    for (let i = 0; i < 6; i++) {
      h.sockets[h.sockets.length - 1]!.emitClose()
      h.runTimers()
    }

    // One initial socket plus the two allowed retries — not a storm.
    expect(h.sockets).toHaveLength(3)
    expect(errors).toHaveLength(1)
  })

  it('resets the retry budget once a socket actually opens', () => {
    const h = socketHarness()
    const tts = client(h)
    tts.start()

    for (let i = 0; i < 3; i++) {
      h.sockets[h.sockets.length - 1]!.emitOpen()
      h.sockets[h.sockets.length - 1]!.emitClose()
      h.runTimers()
    }

    expect(h.sockets.length).toBeGreaterThan(3)
  })

  it('does not reconnect after the session closes', () => {
    const h = socketHarness()
    const tts = client(h)
    tts.start()
    h.sockets[0]!.emitOpen()

    tts.close()
    h.sockets[0]!.emitClose()
    h.runTimers()

    expect(h.sockets).toHaveLength(1)
    expect(h.timers).toHaveLength(0)
  })

  it('stops speaking once the voice track is permanently unavailable', () => {
    const h = socketHarness()
    const tts = client(h)
    tts.start()
    h.sockets[0]!.emitError('401 unauthorized')

    tts.speak('c1', 'To nie powinno nigdzie polecieć.')
    expect(h.sockets).toHaveLength(1)
    expect(h.sockets[0]!.sent).toHaveLength(0)
  })
})
