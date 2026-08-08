import type { CaptionEngine, CaptionOp, CardView, SttEvent } from '@sub/caption-engine'
import {
  PROJECTOR_SAFE_EVENTS,
  PROTOCOL_VERSION,
  SILENCE_PAUSE_MS,
  isProjectorSafe,
  type AudioFrame,
  type CaptionCard,
  type EndReason,
  type NoticeCode,
  type ProjectorRole,
  type RelayMessage,
  type SessionConfig,
  type StudioMessage,
} from '@sub/contracts'
import { MAX_AUDIO_FRAMES_PER_SECOND } from './config.js'
import type { Logger } from './logger.js'
import { METER_TICK_MS, type Meter, type MeterEvents } from './metering.js'
import type { SttUpstreamError } from './providers/elevenlabs-stt.js'
import type { TtsAudioChunk } from './providers/elevenlabs-tts.js'
import type { SessionHandle } from './registry.js'

export type SessionState = 'INIT' | 'RUNNING' | 'DRAINING' | 'CLOSED'
export type { ProjectorRole }

export interface OutboundSocket {
  send(payload: string): void
  close(code?: number, reason?: string): void
}

export interface SttLike {
  start(): void
  sendAudio(pcm: Uint8Array, commit?: boolean): void
  commit(): void
  close(): void
}

export interface TtsLike {
  start(): void
  speak(cardId: string, text: string): void
  close(): void
}

export interface TranslationRequest {
  cardId: string
  lang: string
  text: string
  context: string[]
  speculative: boolean
}

export interface TranslatorLike {
  translate(request: TranslationRequest): Promise<string>
}

export interface SttHandlers {
  onEvent(event: SttEvent): void
  onError(error: SttUpstreamError): void
}

export interface TtsHandlers {
  onAudio(chunk: TtsAudioChunk): void
  onError(error: { code: NoticeCode; message: string }): void
}

export interface SessionActorDeps {
  sessionId: string
  userId: string
  projectorToken: string
  config: SessionConfig
  /** Trial plans carry a discreet watermark on the projector. */
  watermark: boolean
  studio: OutboundSocket
  engine: CaptionEngine
  translator: TranslatorLike
  logger: Logger
  now(): number
  createMeter(events: MeterEvents): Meter
  createStt(handlers: SttHandlers): SttLike
  createTts(handlers: TtsHandlers): TtsLike | null
  onClosed(sessionId: string): void
  setTicker?: (fn: () => void, ms: number) => unknown
  clearTicker?: (handle: unknown) => void
}

interface AttachedProjector {
  socket: OutboundSocket
  role: ProjectorRole
}

type TranslateJob = TranslationRequest

/** Enough backfill for a browser source that reloads; older than this and a snapshot is cheaper. */
const HISTORY_LIMIT = 500
const MAX_INFLIGHT_TRANSLATIONS = 2
const NOTICE_COOLDOWN_MS = 15_000

/**
 * One session, one actor.
 *
 * It owns every upstream socket, the caption engine, the translate queue and the
 * billing clock. Nothing else in the process may touch them, which is what makes
 * "stop billing when the audio stops" and "cut off at zero balance" enforceable in
 * one place instead of five.
 *
 * INIT → RUNNING → DRAINING → CLOSED. The transitions are one-way.
 */
export class SessionActor implements SessionHandle {
  readonly sessionId: string
  readonly userId: string
  readonly projectorToken: string

  private state: SessionState = 'INIT'
  private readonly startedAt: number
  private readonly engine: CaptionEngine
  private readonly meter: Meter
  private readonly stt: SttLike
  private readonly tts: TtsLike | null
  private config: SessionConfig

  private seq = 0
  private readonly history: { seq: number; type: RelayMessage['t']; json: string }[] = []
  private readonly projectors = new Set<AttachedProjector>()

  private readonly pendingTranslations = new Map<string, TranslateJob>()
  private inflightTranslations = 0

  private ticker: unknown = null
  private tickInFlight = false
  private lastAudioAt: number
  private silenceSignalled = false
  private frameWindowStart: number
  private framesInWindow = 0
  private readonly noticedAt = new Map<NoticeCode, number>()
  private closing: Promise<void> | null = null

  private readonly setTicker: (fn: () => void, ms: number) => unknown
  private readonly clearTicker: (handle: unknown) => void

  constructor(private readonly deps: SessionActorDeps) {
    this.sessionId = deps.sessionId
    this.userId = deps.userId
    this.projectorToken = deps.projectorToken
    this.config = deps.config
    this.engine = deps.engine
    this.startedAt = deps.now()
    this.lastAudioAt = this.startedAt
    this.frameWindowStart = this.startedAt

    this.setTicker = deps.setTicker ?? ((fn, ms) => setInterval(fn, ms))
    this.clearTicker = deps.clearTicker ?? ((handle) => clearInterval(handle as NodeJS.Timeout))

    this.meter = deps.createMeter({
      onCredits: (update) => this.emit({ t: 'credits', ...update }),
      onNotice: (notice) => this.notice(notice.code, notice.level),
      onExhausted: () => void this.close('credits_exhausted'),
      onFlushFailed: (error) =>
        deps.logger.error({ sessionId: this.sessionId, err: String(error) }, 'ledger flush failed'),
    })

    this.stt = deps.createStt({
      onEvent: (event) => this.onSttEvent(event),
      onError: (error) => this.onSttError(error),
    })

    this.tts = deps.createTts({
      onAudio: (chunk) => this.onTtsAudio(chunk),
      onError: (error) => this.notice(error.code, 'warn'),
    })
  }

  get currentState(): SessionState {
    return this.state
  }

  get lastSeq(): number {
    return this.seq
  }

  start(): void {
    if (this.state !== 'INIT') return
    this.state = 'RUNNING'
    this.stt.start()
    this.tts?.start()
    this.emit({
      t: 'ready',
      sessionId: this.sessionId,
      protocolVersion: PROTOCOL_VERSION,
      burnRatePerMin: this.meter.burnRatePerMin,
    })
    this.ticker = this.setTicker(() => void this.onTick(), METER_TICK_MS)
  }

  /* ── Studio ───────────────────────────────────────────────────────────────── */

  onAudioFrame(frame: AudioFrame): void {
    if (this.state !== 'RUNNING') return
    const now = this.deps.now()
    if (!this.acceptFrame(now)) return

    this.lastAudioAt = now
    this.silenceSignalled = false
    this.meter.markAudio(now)
    // Pass-through: the payload is encoded for the upstream socket and then dropped.
    this.stt.sendAudio(frame.pcm)
  }

  onStudioMessage(message: StudioMessage): void {
    switch (message.t) {
      case 'hello':
        // The handshake is the server's business; a second hello is a protocol error.
        break
      case 'flush':
        if (this.state === 'RUNNING') this.stt.commit()
        break
      case 'configure':
        this.applyConfigure(message.config)
        break
      case 'bye':
        void this.close('user')
        break
    }
  }

  /**
   * Render settings change live. Languages and voice do not: they re-price the
   * session, and pricing belongs to `/api/session/start`, not to the hot path.
   */
  private applyConfigure(patch: Partial<SessionConfig>): void {
    if (patch.dstLangs !== undefined || patch.voice !== undefined || patch.srcLang !== undefined) {
      this.notice('TRANSLATION_DEGRADED', 'info')
    }
    if (!patch.render) return
    this.config = { ...this.config, render: { ...this.config.render, ...patch.render } }
    this.emit({ t: 'render', seq: 0, render: this.config.render })
  }

  /* ── Projector ────────────────────────────────────────────────────────────── */

  /**
   * OBS refreshes a browser source on a whim. A reattaching projector either gets
   * exactly the frames it missed, or the whole state — never a gap.
   */
  attachProjector(
    socket: OutboundSocket,
    role: ProjectorRole,
    lastSeq?: number,
  ): AttachedProjector {
    const attached: AttachedProjector = { socket, role }
    this.projectors.add(attached)

    const backfill = lastSeq === undefined ? null : this.backfillFrom(lastSeq, role)
    if (backfill) {
      for (const json of backfill) socket.send(json)
    } else {
      socket.send(JSON.stringify(this.buildSnapshot()))
    }
    return attached
  }

  detachProjector(attached: AttachedProjector): void {
    this.projectors.delete(attached)
  }

  get projectorCount(): number {
    return this.projectors.size
  }

  buildSnapshot(): RelayMessage {
    return {
      t: 'snapshot',
      // Deliberately the current seq, not a new one: it is the client's resume baseline.
      seq: this.seq,
      sessionId: this.sessionId,
      cards: this.engine.snapshot().map((view) => toCaptionCard(view)),
      render: this.config.render,
      watermark: this.deps.watermark,
    }
  }

  private backfillFrom(lastSeq: number, role: ProjectorRole): string[] | null {
    if (lastSeq > this.seq) return null
    const oldest = this.history[0]
    if (!oldest || oldest.seq > lastSeq + 1) return null
    return this.history
      .filter(
        (entry) =>
          entry.seq > lastSeq &&
          // The allowlist is re-applied here and not merely inherited from `emit`.
          // Replay is a second way onto the projector's wire, and it must be gated
          // by the same list — not by the accident that today only safe events
          // carry a `seq` and therefore reach the history buffer.
          isProjectorSafeType(entry.type) &&
          allowedForRole(entry.type, role),
      )
      .map((entry) => entry.json)
  }

  /* ── Upstream events ──────────────────────────────────────────────────────── */

  private onSttEvent(event: SttEvent): void {
    if (this.state === 'CLOSED') return
    this.applyOps(this.engine.push(event))
  }

  private onSttError(error: SttUpstreamError): void {
    if (error.code === 'FATAL') {
      this.deps.logger.error({ sessionId: this.sessionId }, 'stt upstream exhausted retries')
      void this.close('upstream_error')
      return
    }
    this.notice(error.code, 'warn')
  }

  private onTtsAudio(chunk: TtsAudioChunk): void {
    if (this.state === 'CLOSED') return
    this.emit({
      t: 'tts',
      seq: 0,
      cardId: chunk.cardId,
      lang: chunk.lang,
      chunk: chunk.chunk,
      final: chunk.final,
    })
  }

  private applyOps(ops: CaptionOp[]): void {
    for (const op of ops) {
      switch (op.op) {
        case 'cardOpen':
          // A card first appears on the wire with its first text, not before.
          break
        case 'cardUpdate':
          this.emit({ t: 'partial', seq: 0, cardId: op.cardId, text: op.text, stable: op.stable })
          break
        case 'cardCommit':
          this.emit({ t: 'commit', seq: 0, cardId: op.cardId, text: op.text })
          break
        case 'cardRetract':
          this.emit({ t: 'retract', seq: 0, cardId: op.cardId, text: op.text })
          break
        case 'cardTranslate':
          this.emitTranslation(op.cardId)
          break
        case 'cardClose':
          this.emit({ t: 'cardEnd', seq: 0, cardId: op.cardId })
          break
        case 'translateRequest':
          this.enqueueTranslation(op)
          break
        case 'speak':
          this.tts?.speak(op.cardId, op.text)
          break
      }
    }
  }

  /**
   * A translation arriving after the commit can only be delivered by restating the
   * whole card — `retract` is the one message consumers already swap wholesale.
   */
  private emitTranslation(cardId: string): void {
    const card = this.engine.snapshot().find((view) => view.cardId === cardId)
    if (!card) return
    const tr = Object.keys(card.tr).length > 0 ? { ...card.tr } : undefined

    if (card.state === 'live') {
      this.emit({
        t: 'partial',
        seq: 0,
        cardId,
        text: card.text,
        stable: card.stable,
        ...(tr ? { tr } : {}),
      })
      return
    }
    this.emit({ t: 'retract', seq: 0, cardId, text: card.text, ...(tr ? { tr } : {}) })
  }

  /* ── Translate queue ──────────────────────────────────────────────────────── */

  private enqueueTranslation(op: Extract<CaptionOp, { op: 'translateRequest' }>): void {
    for (const lang of this.config.dstLangs) {
      const key = `${op.cardId}|${lang}`
      const queued = this.pendingTranslations.get(key)
      // A committed request outranks a speculative one for the same card.
      if (queued && !queued.speculative && op.speculative) continue
      this.pendingTranslations.set(key, {
        cardId: op.cardId,
        lang,
        text: op.text,
        context: op.context,
        speculative: op.speculative,
      })
    }
    this.pumpTranslations()
  }

  private pumpTranslations(): void {
    while (
      this.inflightTranslations < MAX_INFLIGHT_TRANSLATIONS &&
      this.pendingTranslations.size > 0 &&
      this.state !== 'CLOSED'
    ) {
      const next = this.pendingTranslations.entries().next().value
      if (!next) return
      const [key, job] = next
      this.pendingTranslations.delete(key)
      this.inflightTranslations += 1
      void this.runTranslation(job)
    }
  }

  private async runTranslation(job: TranslateJob): Promise<void> {
    try {
      const text = await this.deps.translator.translate(job)
      if (this.state === 'CLOSED') return
      this.applyOps(this.engine.applyTranslation(job.cardId, job.lang, text, !job.speculative))
    } catch (error) {
      this.notice('TRANSLATION_DEGRADED', 'warn')
      this.deps.logger.warn(
        { sessionId: this.sessionId, err: String(error) },
        'translation request failed',
      )
    } finally {
      this.inflightTranslations -= 1
      this.pumpTranslations()
    }
  }

  /* ── Clock ────────────────────────────────────────────────────────────────── */

  private async onTick(): Promise<void> {
    if (this.tickInFlight || this.state !== 'RUNNING') return
    this.tickInFlight = true
    try {
      this.signalSilenceIfIdle(this.deps.now())
      await this.meter.tick()
    } catch (error) {
      this.deps.logger.error({ sessionId: this.sessionId, err: String(error) }, 'meter tick failed')
    } finally {
      this.tickInFlight = false
    }
  }

  /** Long silence closes the open card so a half-sentence does not sit on screen. */
  private signalSilenceIfIdle(now: number): void {
    if (now - this.lastAudioAt < SILENCE_PAUSE_MS) return
    if (this.silenceSignalled) return
    this.silenceSignalled = true
    this.applyOps(this.engine.push({ kind: 'silence', atMs: now - this.startedAt }))
  }

  private acceptFrame(now: number): boolean {
    if (now - this.frameWindowStart >= 1_000) {
      this.frameWindowStart = now
      this.framesInWindow = 0
    }
    this.framesInWindow += 1
    if (this.framesInWindow <= MAX_AUDIO_FRAMES_PER_SECOND) return true
    this.notice('NETWORK_SLOW', 'warn')
    return false
  }

  /* ── Close ────────────────────────────────────────────────────────────────── */

  async close(reason: EndReason): Promise<void> {
    if (this.state === 'CLOSED') return
    if (this.closing) return this.closing
    this.state = 'DRAINING'
    this.closing = this.performClose(reason)
    await this.closing
  }

  private async performClose(reason: EndReason): Promise<void> {
    if (this.ticker !== null) this.clearTicker(this.ticker)
    this.ticker = null

    this.stt.close()
    this.tts?.close()
    this.pendingTranslations.clear()

    // Final flush before anyone is told the session ended — the ledger is the record.
    // A gateway failure must not abort the close: every caller reaches this through
    // `void close(...)`, so a rejection here would be an unhandled rejection *and*
    // would leave the sockets open and the session in the registry forever.
    try {
      await this.meter.close()
    } catch (error) {
      this.deps.logger.error(
        { sessionId: this.sessionId, err: String(error) },
        'final ledger settlement failed',
      )
    }
    const spent = this.meter.snapshot().spent

    this.emit({ t: 'end', reason, creditsSpent: spent })
    this.state = 'CLOSED'

    this.deps.studio.close(1000, reason)
    // The reason describes the account — `credits_exhausted` is not something an
    // on-air surface should ever be told, even in a close frame it does not read.
    for (const projector of this.projectors) projector.socket.close(1000, 'session_ended')
    this.projectors.clear()
    this.deps.onClosed(this.sessionId)
  }

  /* ── Wire ─────────────────────────────────────────────────────────────────── */

  private emit(message: RelayMessage): void {
    // `seq` is stamped here so callers never have to keep the counter in sync.
    const outgoing: RelayMessage = 'seq' in message ? { ...message, seq: this.nextSeq() } : message
    const json = JSON.stringify(outgoing)

    this.deps.studio.send(json)
    if ('seq' in outgoing) this.remember(outgoing.seq, outgoing.t, json)

    // The allowlist from @sub/contracts is the security boundary: credits and
    // notices describe the account, and the projector goes on air.
    if (!isProjectorSafe(outgoing)) return
    for (const projector of this.projectors) {
      if (allowedForRole(outgoing.t, projector.role)) projector.socket.send(json)
    }
  }

  private nextSeq(): number {
    this.seq += 1
    return this.seq
  }

  private remember(seq: number, type: RelayMessage['t'], json: string): void {
    this.history.push({ seq, type, json })
    while (this.history.length > HISTORY_LIMIT) this.history.shift()
  }

  private notice(code: NoticeCode, level: 'info' | 'warn' | 'error'): void {
    const now = this.deps.now()
    const last = this.noticedAt.get(code)
    if (last !== undefined && now - last < NOTICE_COOLDOWN_MS) return
    this.noticedAt.set(code, now)
    this.emit({ t: 'notice', level, code })
  }
}

export function toCaptionCard(view: CardView): CaptionCard {
  const tr = Object.keys(view.tr).length > 0 ? { ...view.tr } : undefined
  return {
    cardId: view.cardId,
    text: view.text,
    stable: view.stable,
    trFinal: view.trFinal,
    state: view.state,
    at: Math.max(0, Math.round(view.atMs)),
    ...(tr ? { tr } : {}),
  }
}

/** The allowlist from `@sub/contracts`, checked by event type alone (replay has no message). */
export function isProjectorSafeType(type: RelayMessage['t']): boolean {
  return (PROJECTOR_SAFE_EVENTS as readonly string[]).includes(type)
}

/** The `/voice` browser source is audio-only; sending it caption traffic wastes bandwidth. */
const VOICE_ROLE_EVENTS = new Set<RelayMessage['t']>(['snapshot', 'tts', 'render', 'pong'])

/**
 * Second filter, applied after `isProjectorSafe`. It narrows by role only — it
 * must never widen, so anything not already projector-safe stays out regardless.
 */
export function allowedForRole(type: RelayMessage['t'], role: ProjectorRole): boolean {
  return role === 'voice' ? VOICE_ROLE_EVENTS.has(type) : type !== 'tts'
}
