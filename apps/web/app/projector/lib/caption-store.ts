import {
  CaptionStyle,
  LanguageCode,
  RenderConfig,
  type CaptionCard,
  type CaptionMode,
  type RelayMessage,
} from '@sub/contracts'

/**
 * Render state for the projector surface.
 *
 * The reducer is total and pure: every relay event maps onto the state, and
 * nothing outside it may ever remove content. A disconnect is not an event here
 * — the last frame stays on air until the relay says otherwise.
 */

export interface ProjectorCard extends CaptionCard {
  /** Bumped by every post-commit retract; drives the whole-card crossfade. */
  rev: number
}

export interface ProjectorState {
  sessionId: string | null
  cards: ProjectorCard[]
  render: RenderConfig
  watermark: boolean
  lastSeq: number
}

/** Cards past this depth can no longer be reached by any preset's line budget. */
const MAX_CARDS = 8

export const INITIAL_STATE: ProjectorState = {
  sessionId: null,
  cards: [],
  render: RenderConfig.parse({}),
  watermark: false,
  lastSeq: 0,
}

export function applyRelayMessage(state: ProjectorState, msg: RelayMessage): ProjectorState {
  if (msg.t === 'snapshot') {
    return {
      sessionId: msg.sessionId,
      cards: msg.cards.slice(-MAX_CARDS).map((card) => ({ ...card, rev: 0 })),
      render: msg.render,
      watermark: msg.watermark,
      lastSeq: msg.seq,
    }
  }

  // Backfill after a resume replays sequences we already have; applying them
  // again would undo newer state that arrived on the fresh socket first.
  if ('seq' in msg && msg.seq <= state.lastSeq) return state

  switch (msg.t) {
    case 'render':
      return { ...state, render: msg.render, lastSeq: msg.seq }
    case 'partial':
      return withCard(state, msg.seq, msg.cardId, (card) => ({
        ...card,
        text: msg.text,
        stable: msg.stable,
        tr: msg.tr ?? card.tr,
        trFinal: false,
        state: 'live',
      }))
    case 'commit':
      return withCard(state, msg.seq, msg.cardId, (card) => ({
        ...card,
        text: msg.text,
        stable: msg.text.length,
        tr: msg.tr ?? card.tr,
        trFinal: msg.tr !== undefined || card.trFinal,
        state: 'settled',
      }))
    case 'retract':
      return withCard(state, msg.seq, msg.cardId, (card) => ({
        ...card,
        text: msg.text,
        stable: msg.text.length,
        tr: msg.tr ?? card.tr,
        trFinal: msg.tr !== undefined || card.trFinal,
        state: 'settled',
        rev: card.rev + 1,
      }))
    case 'cardEnd':
      return withCard(state, msg.seq, msg.cardId, (card) => ({ ...card, state: 'fading' }))
    default:
      return state
  }
}

function withCard(
  state: ProjectorState,
  seq: number,
  cardId: string,
  update: (card: ProjectorCard) => ProjectorCard,
): ProjectorState {
  const index = state.cards.findIndex((card) => card.cardId === cardId)
  const current = index >= 0 ? state.cards[index] : undefined
  const next = update(current ?? blankCard(cardId))

  const cards =
    current && index >= 0
      ? state.cards.map((card, i) => (i === index ? next : card))
      : [...state.cards, next].slice(-MAX_CARDS)

  return { ...state, cards, lastSeq: seq }
}

function blankCard(cardId: string): ProjectorCard {
  return { cardId, text: '', stable: 0, trFinal: false, state: 'live', at: 0, rev: 0 }
}

/**
 * The card currently on air. Pop-on waits for a committed sentence; roll-up
 * shows whatever the newest card holds, tail included.
 */
export function selectActiveCard(
  cards: readonly ProjectorCard[],
  mode: CaptionMode,
): ProjectorCard | null {
  for (let i = cards.length - 1; i >= 0; i -= 1) {
    const card = cards[i]
    if (!card) continue
    if (mode === 'popon' && card.state === 'live') continue
    return card
  }
  return null
}

/** One language block of a card. Blocks stack vertically, source above translation. */
export interface TextBlock {
  key: string
  text: string
  /** Characters of `text` treated as stable; the remainder is the volatile tail. */
  stable: number
}

export function cardBlocks(
  card: ProjectorCard,
  render: RenderConfig,
  lang: string | null,
): TextBlock[] {
  const blocks: TextBlock[] = []

  if (render.showSource && card.text.length > 0) {
    blocks.push({ key: 'src', text: card.text, stable: card.stable })
  }

  if (render.showTranslation) {
    const translation = pickTranslation(card, lang)
    if (translation) {
      // A speculative translation is whole-block volatile: it is replaced
      // atomically once the committed version lands (CAPTION-ENGINE §5).
      blocks.push({
        key: `tr:${translation.lang}`,
        text: translation.text,
        stable: card.trFinal ? translation.text.length : 0,
      })
    }
  }

  return blocks
}

function pickTranslation(
  card: ProjectorCard,
  lang: string | null,
): { lang: string; text: string } | null {
  if (!card.tr) return null
  if (lang) {
    const text = card.tr[lang]
    return text ? { lang, text } : null
  }
  const first = Object.entries(card.tr)[0]
  return first && first[1] ? { lang: first[0], text: first[1] } : null
}

export interface LineParts {
  key: string
  stable: string
  tail: string
}

/** Splits an already line-broken block, carrying the stable/volatile boundary along. */
export function toLines(block: TextBlock): LineParts[] {
  const rawLines = block.text.split('\n')
  const out: LineParts[] = []
  let offset = 0

  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i] ?? ''
    const stableInLine = Math.min(Math.max(block.stable - offset, 0), line.length)
    out.push({
      key: `${block.key}:${i}`,
      stable: line.slice(0, stableInLine),
      tail: line.slice(stableInLine),
    })
    // The newline itself occupies one position in the stable-character count.
    offset += line.length + 1
  }

  return out
}

/* ── Query-string overrides ─────────────────────────────────────────────────── */

/** Structural view of URLSearchParams so Next's readonly variant fits without a cast. */
export interface QueryReader {
  get(name: string): string | null
}

export interface ProjectorOverrides {
  render: Partial<RenderConfig>
  lang: string | null
}

/**
 * Query parameters win over the server-sent render config: the OBS URL is the
 * only knob a viewer has once the source is already on a scene.
 */
export function readOverrides(query: QueryReader): ProjectorOverrides {
  const render: Partial<RenderConfig> = {}

  const style = CaptionStyle.safeParse(query.get('style'))
  if (style.success) render.style = style.data

  // A zod default succeeds on `undefined`, so an absent parameter must never
  // reach safeParse — it would silently overwrite the server config with a default.
  const lines = toInt(query.get('lines'))
  const linesParsed = lines === undefined ? null : RenderConfig.shape.maxLines.safeParse(lines)
  if (linesParsed?.success) render.maxLines = linesParsed.data

  const size = toInt(query.get('size'))
  const sizeParsed = size === undefined ? null : RenderConfig.shape.fontSize.safeParse(size)
  if (sizeParsed?.success) render.fontSize = sizeParsed.data

  const safe = toFloat(query.get('safe'))
  const safeParsed = safe === undefined ? null : RenderConfig.shape.safeAreaPct.safeParse(safe)
  if (safeParsed?.success) render.safeAreaPct = safeParsed.data

  const lang = LanguageCode.safeParse(query.get('lang'))

  return { render, lang: lang.success ? lang.data : null }
}

export function resolveRender(base: RenderConfig, overrides: Partial<RenderConfig>): RenderConfig {
  return { ...base, ...overrides }
}

function toInt(raw: string | null): number | undefined {
  if (raw === null) return undefined
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : undefined
}

function toFloat(raw: string | null): number | undefined {
  if (raw === null) return undefined
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : undefined
}
