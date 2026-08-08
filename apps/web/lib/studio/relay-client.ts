import {
  FRAME_MS,
  PROTOCOL_VERSION,
  RelayMessage,
  type SessionConfig,
  type StudioMessage,
} from '@sub/contracts'

type Of<T extends RelayMessage['t']> = Extract<RelayMessage, { t: T }>

export interface RelayClientHandlers {
  onReady?: (msg: Of<'ready'>) => void
  onSnapshot?: (msg: Of<'snapshot'>) => void
  onPartial?: (msg: Of<'partial'>) => void
  onCommit?: (msg: Of<'commit'>) => void
  onRetract?: (msg: Of<'retract'>) => void
  onCardEnd?: (msg: Of<'cardEnd'>) => void
  /** Studio only. Never mirror these into anything the projector renders. */
  onCredits?: (msg: Of<'credits'>) => void
  onNotice?: (msg: Of<'notice'>) => void
  onEnd?: (msg: Of<'end'>) => void
  onTransportError?: (message: string) => void
  onClosed?: () => void
}

export type RelayConnectionState = 'idle' | 'connecting' | 'live' | 'closed'

/** PRODUCT.md §7 — a three second hiccup must not cost the speaker any words. */
const AUDIO_BUFFER_MS = 3_000
const MAX_BUFFERED_FRAMES = Math.ceil(AUDIO_BUFFER_MS / FRAME_MS)

/**
 * Studio side of the relay socket.
 *
 * Holds the relay JWT in a private field and nothing else: it is single use with
 * a 60 second life, so it is never written to storage and never re-sent after
 * the socket drops. A lost connection therefore ends the session rather than
 * silently reopening one the server did not price.
 */
export class RelayClient {
  private socket: WebSocket | null = null
  private buffered: Uint8Array[] = []
  private helloSent = false
  private state: RelayConnectionState = 'idle'

  constructor(
    private readonly url: string,
    private readonly handlers: RelayClientHandlers,
  ) {}

  get connectionState(): RelayConnectionState {
    return this.state
  }

  connect(jwt: string, config: SessionConfig): void {
    if (this.socket) throw new Error('RelayClient is already connected')
    this.state = 'connecting'

    const socket = new WebSocket(this.url)
    socket.binaryType = 'arraybuffer'
    this.socket = socket

    socket.onopen = () => {
      this.send({ t: 'hello', protocolVersion: PROTOCOL_VERSION, jwt, config })
      this.helloSent = true
      this.state = 'live'
      this.flushBuffer()
    }

    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return
      let payload: unknown
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      const parsed = RelayMessage.safeParse(payload)
      if (!parsed.success) return
      this.dispatch(parsed.data)
    }

    socket.onerror = () => {
      this.handlers.onTransportError?.('Połączenie z serwerem napisów zostało przerwane.')
    }

    socket.onclose = () => {
      this.state = 'closed'
      this.socket = null
      this.buffered = []
      this.handlers.onClosed?.()
    }
  }

  sendAudio(frame: Uint8Array): void {
    if (this.state === 'closed') return
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN || !this.helloSent) {
      this.buffered.push(frame)
      if (this.buffered.length > MAX_BUFFERED_FRAMES) this.buffered.shift()
      return
    }
    socket.send(frame)
  }

  /** Force a segment boundary — the manual counterpart of the VAD commit. */
  flush(): void {
    this.send({ t: 'flush' })
  }

  configure(config: Partial<SessionConfig>): void {
    this.send({ t: 'configure', config })
  }

  /** Graceful stop: the relay settles the ledger and answers with `end`. */
  bye(): void {
    this.send({ t: 'bye' })
  }

  close(): void {
    this.socket?.close()
    this.socket = null
    this.state = 'closed'
  }

  private flushBuffer(): void {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    for (const frame of this.buffered) socket.send(frame)
    this.buffered = []
  }

  private send(message: StudioMessage): void {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(message))
  }

  private dispatch(msg: RelayMessage): void {
    switch (msg.t) {
      case 'ready':
        this.handlers.onReady?.(msg)
        break
      case 'snapshot':
        this.handlers.onSnapshot?.(msg)
        break
      case 'partial':
        this.handlers.onPartial?.(msg)
        break
      case 'commit':
        this.handlers.onCommit?.(msg)
        break
      case 'retract':
        this.handlers.onRetract?.(msg)
        break
      case 'cardEnd':
        this.handlers.onCardEnd?.(msg)
        break
      case 'credits':
        this.handlers.onCredits?.(msg)
        break
      case 'notice':
        this.handlers.onNotice?.(msg)
        break
      case 'end':
        this.handlers.onEnd?.(msg)
        break
      default:
        // tts, render and pong are for the projector; the studio ignores them.
        break
    }
  }
}
