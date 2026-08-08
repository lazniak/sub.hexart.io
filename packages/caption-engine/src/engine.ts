import { breakIntoLines } from './linebreak.js'
import { Percentile, backlogAction, displayMs } from './governor.js'
import {
  RewriteTracker,
  adaptiveFrames,
  stablePrefixChars,
  stablePrefixTokens,
  tokenize,
} from './stability.js'
import { ContextWindow, shouldTranslate, type SpeculationState } from './translation.js'
import { SpeechQueue, shouldMergeForward } from './speech.js'
import { DEFAULT_ENGINE_CONFIG, type CaptionOp, type EngineConfig, type EngineMetrics, type SttEvent } from './types.js'

export interface CardView {
  cardId: string
  text: string
  lines: string[]
  stable: number
  tr: Record<string, string>
  trFinal: boolean
  state: 'live' | 'settled' | 'fading'
  atMs: number
}

interface LiveCard extends CardView {
  history: string[][]
  speculation: SpeculationState
}

/**
 * Turns a stream of Scribe events into caption operations.
 *
 * Deliberately pure: no clock, no I/O, no randomness. Every timestamp arrives on
 * the event and the id generator is injected, so a recorded fixture replays
 * byte-identically. That is what makes the golden tests meaningful.
 */
export class CaptionEngine {
  private readonly cfg: EngineConfig
  private readonly nextId: () => string
  private readonly rewrites = new RewriteTracker()
  private readonly context: ContextWindow
  private readonly speech = new SpeechQueue()
  private readonly cps = new Percentile()

  private live: LiveCard | null = null
  private settled: CardView[] = []
  private pendingSpeech: string | null = null

  private cardsEmitted = 0
  private droppedCards = 0
  private translateRequests = 0
  private stabilizeSamples: number[] = []

  constructor(config: Partial<EngineConfig> = {}, idGenerator?: () => string) {
    this.cfg = { ...DEFAULT_ENGINE_CONFIG, ...config }
    this.context = new ContextWindow(this.cfg.contextSentences)
    let counter = 0
    this.nextId = idGenerator ?? (() => `c${++counter}`)
  }

  push(event: SttEvent): CaptionOp[] {
    switch (event.kind) {
      case 'partial':
        return this.onPartial(event.text, event.atMs)
      case 'committed':
        return this.onCommitted(event.text, event.atMs)
      case 'silence':
        return this.onSilence(event.atMs)
    }
  }

  private onPartial(text: string, atMs: number): CaptionOp[] {
    const ops: CaptionOp[] = []
    const tokens = tokenize(text)
    if (tokens.length === 0) return ops

    if (!this.live) {
      this.live = {
        cardId: this.nextId(),
        text: '',
        lines: [],
        stable: 0,
        tr: {},
        trFinal: false,
        state: 'live',
        atMs,
        history: [],
        speculation: { lastTranslatedChars: 0, lastRequestAtMs: -Infinity },
      }
      ops.push({ op: 'cardOpen', cardId: this.live.cardId, atMs })
    }

    const card = this.live
    const previous = card.history[card.history.length - 1] ?? []
    this.rewrites.record(previous, tokens)
    card.history.push(tokens)
    if (card.history.length > 8) card.history.shift()

    const frames = adaptiveFrames(
      this.cfg.stabilityFrames,
      this.rewrites.rate,
      this.cfg.adaptiveRewriteThreshold,
    )
    const stableTokens = stablePrefixTokens(card.history, frames, this.cfg.volatileTailTokens)
    const stableChars = stablePrefixChars(tokens, stableTokens)

    if (stableTokens > 0 && card.stable === 0) {
      this.stabilizeSamples.push(atMs - card.atMs)
    }

    card.text = tokens.join(' ')
    card.stable = stableChars
    card.lines = breakIntoLines(card.text, this.cfg.maxCharsPerLine, this.cfg.maxLines).lines

    ops.push({
      op: 'cardUpdate',
      cardId: card.cardId,
      lines: card.lines,
      text: card.text,
      stable: card.stable,
    })

    // Speculative translation on meaningful growth of the stable prefix only.
    if (this.cfg.targetLangs.length > 0 && stableChars > 0) {
      const trigger = shouldTranslate(
        card.speculation,
        stableChars,
        atMs,
        this.cfg.speculativeGrowthChars,
        this.cfg.speculativeMinIntervalMs,
      )
      if (trigger.speculative) {
        card.speculation = { lastTranslatedChars: stableChars, lastRequestAtMs: atMs }
        this.translateRequests++
        ops.push({
          op: 'translateRequest',
          cardId: card.cardId,
          text: card.text.slice(0, stableChars),
          context: this.context.get(),
          speculative: true,
        })
      }
    }

    return ops
  }

  private onCommitted(text: string, atMs: number): CaptionOp[] {
    const ops: CaptionOp[] = []
    const clean = text.trim()
    if (clean.length === 0) return this.closeLive(atMs)

    const card = this.live ?? {
      cardId: this.nextId(),
      text: '',
      lines: [],
      stable: 0,
      tr: {},
      trFinal: false,
      state: 'live' as const,
      atMs,
      history: [],
      speculation: { lastTranslatedChars: 0, lastRequestAtMs: -Infinity },
    }
    if (!this.live) ops.push({ op: 'cardOpen', cardId: card.cardId, atMs })

    const rewritten = card.text.length > 0 && card.text !== clean
    const { lines } = breakIntoLines(clean, this.cfg.maxCharsPerLine, this.cfg.maxLines)

    card.text = clean
    card.lines = lines
    card.stable = clean.length
    card.state = 'settled'

    // A post-commit correction swaps the whole card at once, never word by word.
    ops.push(
      rewritten
        ? { op: 'cardRetract', cardId: card.cardId, lines, text: clean }
        : { op: 'cardCommit', cardId: card.cardId, lines, text: clean },
    )

    if (this.cfg.targetLangs.length > 0) {
      this.translateRequests++
      ops.push({
        op: 'translateRequest',
        cardId: card.cardId,
        text: clean,
        context: this.context.get(),
        speculative: false,
      })
    }

    // Voice-over: committed sentences only, short fragments merged forward.
    if (this.cfg.voiceLang) {
      const merged = this.pendingSpeech ? `${this.pendingSpeech} ${clean}` : clean
      if (shouldMergeForward(merged, this.cfg.minWordsForSpeech)) {
        this.pendingSpeech = merged
      } else {
        this.pendingSpeech = null
        this.speech.push({ cardId: card.cardId, lang: this.cfg.voiceLang, text: merged })
        // Untranslated sessions speak the source text directly.
        if (this.cfg.targetLangs.length === 0) {
          ops.push({ op: 'speak', cardId: card.cardId, lang: this.cfg.voiceLang, text: merged })
        }
      }
    }

    this.context.push(clean)
    this.cps.add(clean.length / (displayMs(clean, this.cfg) / 1000))
    this.cardsEmitted++

    if (backlogAction(this.settled.length) === 'drop-oldest') {
      const dropped = this.settled.shift()
      if (dropped) {
        this.droppedCards++
        ops.push({ op: 'cardClose', cardId: dropped.cardId, atMs })
      }
    }

    this.settled.push(this.toView(card))
    this.live = null
    this.rewrites.reset()
    return ops
  }

  private onSilence(atMs: number): CaptionOp[] {
    return this.closeLive(atMs)
  }

  private closeLive(atMs: number): CaptionOp[] {
    if (!this.live) return []
    const cardId = this.live.cardId
    this.live = null
    this.rewrites.reset()
    return [{ op: 'cardClose', cardId, atMs }]
  }

  /** Called when a translation result arrives. Speculative results are replaceable. */
  applyTranslation(cardId: string, lang: string, text: string, final: boolean): CaptionOp[] {
    const target =
      this.live?.cardId === cardId ? this.live : this.settled.find((c) => c.cardId === cardId)
    if (!target) return []
    if (target.trFinal && !final) return [] // never downgrade a final translation

    target.tr[lang] = text
    target.trFinal = final

    const ops: CaptionOp[] = [{ op: 'cardTranslate', cardId, lang, text, final }]

    if (final && this.cfg.voiceLang === lang) {
      ops.push({ op: 'speak', cardId, lang, text })
    }
    return ops
  }

  /** Full state for a projector that just attached or refreshed. */
  snapshot(): CardView[] {
    const cards = [...this.settled]
    if (this.live) cards.push(this.toView(this.live))
    return cards
  }

  metrics(): EngineMetrics {
    const sorted = [...this.stabilizeSamples].sort((a, b) => a - b)
    const median = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!
    return {
      rewriteRate: this.rewrites.rate,
      medianStabilizeMs: median,
      cardsEmitted: this.cardsEmitted,
      droppedCards: this.droppedCards + this.speech.dropped,
      cpsP95: this.cps.at(95),
      translateRequests: this.translateRequests,
      translateCacheHits: 0,
    }
  }

  private toView(card: CardView): CardView {
    return {
      cardId: card.cardId,
      text: card.text,
      lines: card.lines,
      stable: card.stable,
      tr: { ...card.tr },
      trFinal: card.trFinal,
      state: card.state,
      atMs: card.atMs,
    }
  }
}
