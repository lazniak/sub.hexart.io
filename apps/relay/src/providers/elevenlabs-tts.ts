import type { NoticeCode } from '@sub/contracts'
import { elevenLabsHost, type ElevenLabsRegion } from '../config.js'
import { createWsSocket, type SocketFactory, type UpstreamSocket } from './socket.js'

/**
 * ElevenLabs TTS stream-input client.
 *
 * ONE socket for the whole session. Reconnecting per sentence costs 150-300 ms of
 * handshake, which is most of the latency budget the voice track has (see the
 * table in ARCHITECTURE.md §2). `inactivity_timeout` is set well past the longest
 * plausible pause between sentences so the provider does not close it for us.
 *
 * https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input
 */

/** Matches the projector's `mp3_44100_128` decoder. */
export const TTS_OUTPUT_FORMAT = 'mp3_44100_128'
const INACTIVITY_TIMEOUT_SECONDS = 180

export interface TtsAudioChunk {
  cardId: string
  lang: string
  /** Base64 MP3, straight from the provider. Forwarded, never written to disk. */
  chunk: string
  final: boolean
}

export interface TtsClientOptions {
  apiKey: string
  model: string
  region: ElevenLabsRegion
  voiceId: string
  lang: string
  /** Clamped by the caption engine's governor before it reaches us. */
  speed: number
  onAudio(chunk: TtsAudioChunk): void
  onError(error: { code: NoticeCode; message: string }): void
  createSocket?: SocketFactory
}

export function buildTtsUrl(options: {
  region: ElevenLabsRegion
  voiceId: string
  model: string
  lang: string
}): string {
  const host = elevenLabsHost(options.region)
  const url = new URL(
    `wss://${host}/v1/text-to-speech/${encodeURIComponent(options.voiceId)}/stream-input`,
  )
  url.searchParams.set('model_id', options.model)
  url.searchParams.set('output_format', TTS_OUTPUT_FORMAT)
  url.searchParams.set('auto_mode', 'true')
  url.searchParams.set('inactivity_timeout', String(INACTIVITY_TIMEOUT_SECONDS))
  url.searchParams.set('language_code', options.lang)
  return url.toString()
}

interface PendingUtterance {
  cardId: string
  lang: string
}

export class ElevenLabsTtsClient {
  private socket: UpstreamSocket | null = null
  private opened = false
  private closed = false
  /**
   * The provider does not echo a correlation id, so utterances are attributed in
   * order: audio belongs to the head of this queue until `isFinal` retires it.
   * Sending one sentence per flush is what keeps that assumption true.
   */
  private readonly pending: PendingUtterance[] = []
  private readonly backlog: string[] = []

  constructor(private readonly options: TtsClientOptions) {}

  start(): void {
    if (this.socket || this.closed) return
    const factory = this.options.createSocket ?? createWsSocket
    this.socket = factory(
      buildTtsUrl({
        region: this.options.region,
        voiceId: this.options.voiceId,
        model: this.options.model,
        lang: this.options.lang,
      }),
      { 'xi-api-key': this.options.apiKey },
      {
        onOpen: () => this.handleOpen(),
        onMessage: (data) => this.handleMessage(data),
        onClose: () => this.handleClose(),
        onError: (error) =>
          this.options.onError({ code: 'TTS_UNAVAILABLE', message: error.message }),
      },
    )
  }

  /** One committed sentence. Flushed immediately — the voice must not wait for the next one. */
  speak(cardId: string, text: string): void {
    const clean = text.trim()
    if (clean.length === 0 || this.closed) return

    this.pending.push({ cardId, lang: this.options.lang })
    // The protocol requires text to end with a single space.
    this.write(JSON.stringify({ text: `${clean} `, flush: true }))
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    if (this.opened) this.socket?.send(JSON.stringify({ text: '' }))
    this.socket?.close(1000, 'session closed')
    this.socket = null
    this.opened = false
  }

  private handleOpen(): void {
    this.opened = true
    // The initial message must be a blank space; it carries the voice settings.
    this.socket?.send(
      JSON.stringify({
        text: ' ',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed: this.options.speed,
        },
      }),
    )
    for (const queued of this.backlog.splice(0)) this.socket?.send(queued)
  }

  private handleClose(): void {
    this.opened = false
    this.socket = null
    if (this.closed) return
    // A mid-session close is not retried: the voice track degrades, captions do not.
    this.options.onError({ code: 'TTS_UNAVAILABLE', message: 'voice socket closed' })
  }

  private handleMessage(raw: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof parsed !== 'object' || parsed === null) return
    const record = parsed as Record<string, unknown>

    const final = record.isFinal === true
    const audio = typeof record.audio === 'string' ? record.audio : null
    const head = this.pending[0]
    if (!head) return

    if (audio) this.options.onAudio({ cardId: head.cardId, lang: head.lang, chunk: audio, final })
    if (final) {
      this.pending.shift()
      if (!audio)
        this.options.onAudio({ cardId: head.cardId, lang: head.lang, chunk: '', final: true })
    }
  }

  private write(payload: string): void {
    if (!this.socket) this.start()
    if (this.opened) this.socket?.send(payload)
    else this.backlog.push(payload)
  }
}
