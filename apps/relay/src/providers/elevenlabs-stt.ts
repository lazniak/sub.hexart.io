import {
  GLOSSARY_MAX_TERMS,
  GLOSSARY_MAX_TERM_LENGTH,
  SAMPLE_RATE,
  type NoticeCode,
} from '@sub/contracts'
import type { SttEvent } from '@sub/caption-engine'
import { elevenLabsHost, type ElevenLabsRegion } from '../config.js'
import { createWsSocket, type SocketFactory, type UpstreamSocket } from './socket.js'

/**
 * ElevenLabs Scribe v2 Realtime client.
 *
 * Wire format is fixed by the provider: PCM 16 kHz mono, base64, one JSON envelope
 * per chunk. Server frames carry a `message_type`; we normalise the three we care
 * about into the caption engine's `SttEvent` so the engine never learns who the
 * vendor is.
 *
 * https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
 */

export const MAX_RECONNECT_ATTEMPTS = 3
const BASE_BACKOFF_MS = 250
const MAX_BACKOFF_MS = 4_000

export type SttConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface SttUpstreamError {
  code: NoticeCode | 'FATAL'
  message: string
}

export interface SttClientOptions {
  apiKey: string
  model: string
  region: ElevenLabsRegion
  /** `auto` in the session config means: send no `language_code` and let Scribe decide. */
  languageCode?: string | undefined
  keyterms?: readonly string[]
  noVerbatim: boolean
  onEvent(event: SttEvent): void
  onError(error: SttUpstreamError): void
  onStateChange?(state: SttConnectionState): void
  now(): number
  /** Injected so tests never open a socket. */
  createSocket?: SocketFactory
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  /** Injected jitter source; deterministic in tests. */
  random?: () => number
}

/**
 * Full jitter over an exponential window.
 *
 * Fixed backoff makes every session in a process reconnect in lockstep and hit the
 * provider as one wave; the jitter is what spreads them out.
 */
export function backoffDelayMs(attempt: number, jitter: number): number {
  const window = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1))
  const clamped = Math.min(1, Math.max(0, jitter))
  return Math.round(window * (0.5 + clamped * 0.5))
}

/** Scribe caps keyterms at 50 entries of 20 characters; over-long terms are rejected wholesale. */
export function sanitiseKeyterms(terms: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of terms) {
    const term = raw.trim()
    if (term.length === 0 || term.length > GLOSSARY_MAX_TERM_LENGTH) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(term)
    if (out.length >= GLOSSARY_MAX_TERMS) break
  }
  return out
}

export function buildSttUrl(options: {
  region: ElevenLabsRegion
  model: string
  languageCode?: string | undefined
  keyterms: readonly string[]
  noVerbatim: boolean
}): string {
  const url = new URL(`wss://${elevenLabsHost(options.region)}/v1/speech-to-text/realtime`)
  url.searchParams.set('model_id', options.model)
  url.searchParams.set('audio_format', 'pcm_16000')
  url.searchParams.set('commit_strategy', 'vad')
  url.searchParams.set('no_verbatim', String(options.noVerbatim))
  if (options.languageCode) url.searchParams.set('language_code', options.languageCode)
  for (const term of options.keyterms) url.searchParams.append('keyterms', term)
  return url.toString()
}

export class ElevenLabsSttClient {
  private socket: UpstreamSocket | null = null
  private state: SttConnectionState = 'idle'
  private attempt = 0
  private retryHandle: unknown = null
  private stopped = false

  private readonly createSocket: SocketFactory
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void
  private readonly random: () => number
  private readonly keyterms: string[]

  constructor(private readonly options: SttClientOptions) {
    this.createSocket = options.createSocket ?? createWsSocket
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as NodeJS.Timeout))
    this.random = options.random ?? Math.random
    this.keyterms = sanitiseKeyterms(options.keyterms ?? [])
  }

  get connectionState(): SttConnectionState {
    return this.state
  }

  get reconnectAttempts(): number {
    return this.attempt
  }

  start(): void {
    this.stopped = false
    this.connect()
  }

  /** Audio is pass-through: encoded, sent, forgotten. Nothing is buffered or stored. */
  sendAudio(pcm: Uint8Array, commit = false): void {
    if (!this.socket?.open) return
    this.socket.send(
      JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: Buffer.from(pcm).toString('base64'),
        sample_rate: SAMPLE_RATE,
        ...(commit ? { commit: true } : {}),
      }),
    )
  }

  /** Forces a segment boundary — the studio's manual flush. */
  commit(): void {
    if (!this.socket?.open) return
    this.socket.send(JSON.stringify({ message_type: 'input_audio_chunk', commit: true }))
  }

  close(): void {
    this.stopped = true
    if (this.retryHandle !== null) this.clearTimer(this.retryHandle)
    this.retryHandle = null
    this.socket?.close(1000, 'session closed')
    this.socket = null
    this.setState('closed')
  }

  private connect(): void {
    if (this.stopped) return
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting')

    const url = buildSttUrl({
      region: this.options.region,
      model: this.options.model,
      languageCode: this.options.languageCode,
      keyterms: this.keyterms,
      noVerbatim: this.options.noVerbatim,
    })

    this.socket = this.createSocket(
      url,
      { 'xi-api-key': this.options.apiKey },
      {
        onOpen: () => {
          this.attempt = 0
          this.setState('open')
        },
        onMessage: (data) => this.handleMessage(data),
        onClose: () => this.handleDrop('upstream closed the transcription socket'),
        onError: (error) => this.handleDrop(error.message),
      },
    )
  }

  private handleDrop(message: string): void {
    if (this.stopped) return
    this.socket = null

    if (this.attempt >= MAX_RECONNECT_ATTEMPTS) {
      this.setState('closed')
      this.options.onError({ code: 'FATAL', message })
      return
    }

    this.attempt += 1
    this.setState('reconnecting')
    this.options.onError({ code: 'STT_RECONNECTING', message })
    this.retryHandle = this.setTimer(
      () => this.connect(),
      backoffDelayMs(this.attempt, this.random()),
    )
  }

  private handleMessage(raw: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    const event = normaliseSttMessage(parsed, this.options.now())
    if (event) {
      this.options.onEvent(event)
      return
    }
    const failure = readUpstreamError(parsed)
    if (failure) this.options.onError({ code: 'FATAL', message: failure })
  }

  private setState(state: SttConnectionState): void {
    if (this.state === state) return
    this.state = state
    this.options.onStateChange?.(state)
  }
}

/**
 * Normalises a server frame into an `SttEvent`.
 *
 * Case-insensitive on `message_type`: the REST docs spell the values in lower
 * snake case while the SDKs expose them as PARTIAL_TRANSCRIPT and friends, and
 * both forms have been observed on the wire.
 */
export function normaliseSttMessage(message: unknown, atMs: number): SttEvent | null {
  if (typeof message !== 'object' || message === null) return null
  const record = message as Record<string, unknown>

  const type = typeof record.message_type === 'string' ? record.message_type.toLowerCase() : ''
  const text = typeof record.text === 'string' ? record.text : ''

  switch (type) {
    case 'partial_transcript':
      return text.trim().length === 0 ? null : { kind: 'partial', text, atMs }
    case 'committed_transcript':
    case 'committed_transcript_with_timestamps':
      // Timestamped commits carry the same `text`; the word array is for captions we
      // do not render, so we deliberately drop it rather than widen the engine's input.
      return text.trim().length === 0
        ? { kind: 'silence', atMs }
        : { kind: 'committed', text, atMs }
    default:
      return null
  }
}

const ERROR_TYPES = new Set([
  'error',
  'auth_error',
  'quota_exceeded',
  'rate_limited',
  'input_error',
])

function readUpstreamError(message: unknown): string | null {
  if (typeof message !== 'object' || message === null) return null
  const record = message as Record<string, unknown>
  const type = typeof record.message_type === 'string' ? record.message_type.toLowerCase() : ''
  if (!ERROR_TYPES.has(type)) return null
  return typeof record.message === 'string' ? `${type}: ${record.message}` : type
}
