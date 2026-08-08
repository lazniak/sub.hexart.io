import { z } from 'zod'
import { EndReason, NoticeCode, RenderConfig, SessionConfig } from './session.js'

/* ────────────────────────────────────────────────────────────────────────────
 * Studio → Relay (control channel; audio travels as binary frames, see audio.ts)
 * ──────────────────────────────────────────────────────────────────────────── */

export const StudioHello = z.object({
  t: z.literal('hello'),
  protocolVersion: z.string(),
  /** Short-lived EdDSA JWT minted by /api/session/start after the credit check. */
  jwt: z.string().min(16),
  config: SessionConfig,
})

/** Force a segment boundary — push-to-talk workflows and manual chunking. */
export const StudioFlush = z.object({ t: z.literal('flush') })

/** Live config change. Render settings apply instantly; language changes re-price. */
export const StudioConfigure = z.object({
  t: z.literal('configure'),
  config: SessionConfig.partial(),
})

export const StudioBye = z.object({ t: z.literal('bye') })

export const StudioMessage = z.discriminatedUnion('t', [
  StudioHello,
  StudioFlush,
  StudioConfigure,
  StudioBye,
])
export type StudioMessage = z.infer<typeof StudioMessage>

/* ────────────────────────────────────────────────────────────────────────────
 * Projector → Relay
 * ──────────────────────────────────────────────────────────────────────────── */

export const ProjectorAttach = z.object({
  t: z.literal('attach'),
  protocolVersion: z.string(),
  token: z.string().min(16),
  /** Set after an OBS Browser Source refresh so the relay can backfill. */
  lastSeq: z.number().int().nonnegative().optional(),
  /** `voice` receives TTS audio only; `captions` receives text only. */
  role: z.enum(['captions', 'voice']).default('captions'),
})

export const ProjectorPing = z.object({ t: z.literal('ping') })

export const ProjectorMessage = z.discriminatedUnion('t', [ProjectorAttach, ProjectorPing])
export type ProjectorMessage = z.infer<typeof ProjectorMessage>

/* ────────────────────────────────────────────────────────────────────────────
 * Relay → Projector / Studio
 * ──────────────────────────────────────────────────────────────────────────── */

export const CaptionCard = z.object({
  cardId: z.string(),
  /** Source-language text, already line-broken by the caption engine. */
  text: z.string(),
  /** Characters of `text` considered stable; the remainder is the volatile tail. */
  stable: z.number().int().nonnegative(),
  /** Translations keyed by target language. Absent until the first result lands. */
  tr: z.record(z.string()).optional(),
  /** True once the translation matches a committed (not speculative) segment. */
  trFinal: z.boolean().default(false),
  state: z.enum(['live', 'settled', 'fading']),
  /** Relay clock, milliseconds since session start. */
  at: z.number().int().nonnegative(),
})
export type CaptionCard = z.infer<typeof CaptionCard>

/** Full state, sent on every attach so a refreshed OBS source loses nothing. */
export const RelaySnapshot = z.object({
  t: z.literal('snapshot'),
  seq: z.number().int().nonnegative(),
  sessionId: z.string(),
  cards: z.array(CaptionCard),
  render: RenderConfig,
  /** Trial sessions carry a discreet watermark; paid plans do not. */
  watermark: z.boolean().default(false),
})

export const RelayPartial = z.object({
  t: z.literal('partial'),
  seq: z.number().int().nonnegative(),
  cardId: z.string(),
  text: z.string(),
  stable: z.number().int().nonnegative(),
  tr: z.record(z.string()).optional(),
})

export const RelayCommit = z.object({
  t: z.literal('commit'),
  seq: z.number().int().nonnegative(),
  cardId: z.string(),
  text: z.string(),
  tr: z.record(z.string()).optional(),
})

/** Post-commit correction. Consumers swap the whole card at once — never word by word. */
export const RelayRetract = z.object({
  t: z.literal('retract'),
  seq: z.number().int().nonnegative(),
  cardId: z.string(),
  text: z.string(),
  tr: z.record(z.string()).optional(),
})

export const RelayCardEnd = z.object({
  t: z.literal('cardEnd'),
  seq: z.number().int().nonnegative(),
  cardId: z.string(),
})

/** TTS audio, base64. Chunked as it arrives from the upstream socket. */
export const RelayTts = z.object({
  t: z.literal('tts'),
  seq: z.number().int().nonnegative(),
  cardId: z.string(),
  lang: z.string(),
  chunk: z.string(),
  final: z.boolean().default(false),
})

export const RelayRender = z.object({
  t: z.literal('render'),
  seq: z.number().int().nonnegative(),
  render: RenderConfig,
})

/** Studio-only. Never reaches the projector — that view goes on air. */
export const RelayCredits = z.object({
  t: z.literal('credits'),
  remaining: z.number(),
  secondsLeft: z.number().int().nonnegative(),
  burnRatePerMin: z.number(),
})

/** Studio-only, for the same reason. */
export const RelayNotice = z.object({
  t: z.literal('notice'),
  level: z.enum(['info', 'warn', 'error']),
  code: NoticeCode,
  detail: z.string().optional(),
})

export const RelayReady = z.object({
  t: z.literal('ready'),
  sessionId: z.string(),
  projectorToken: z.string(),
  protocolVersion: z.string(),
  burnRatePerMin: z.number(),
})

export const RelayEnd = z.object({
  t: z.literal('end'),
  reason: EndReason,
  creditsSpent: z.number(),
})

export const RelayPong = z.object({ t: z.literal('pong') })

export const RelayMessage = z.discriminatedUnion('t', [
  RelaySnapshot,
  RelayPartial,
  RelayCommit,
  RelayRetract,
  RelayCardEnd,
  RelayTts,
  RelayRender,
  RelayCredits,
  RelayNotice,
  RelayReady,
  RelayEnd,
  RelayPong,
])
export type RelayMessage = z.infer<typeof RelayMessage>

/** Events safe to forward to the projector — the allowlist is the security boundary. */
export const PROJECTOR_SAFE_EVENTS = [
  'snapshot',
  'partial',
  'commit',
  'retract',
  'cardEnd',
  'tts',
  'render',
  'pong',
] as const satisfies readonly RelayMessage['t'][]

export function isProjectorSafe(msg: RelayMessage): boolean {
  return (PROJECTOR_SAFE_EVENTS as readonly string[]).includes(msg.t)
}

/** Projector heartbeat; a gap longer than the watchdog triggers a reconnect. */
export const HEARTBEAT_INTERVAL_MS = 5_000
export const HEARTBEAT_WATCHDOG_MS = 12_000
