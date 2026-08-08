import { z } from 'zod'

/** ISO 639-1, optionally with a region subtag. `auto` lets Scribe detect the source. */
export const LanguageCode = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'expected ISO 639-1, optionally with a region subtag')

export const SourceLanguage = z.union([z.literal('auto'), LanguageCode])

export const CaptionStyle = z.enum(['clean', 'broadcast', 'minimal', 'karaoke'])
export type CaptionStyle = z.infer<typeof CaptionStyle>

export const CaptionMode = z.enum(['rollup', 'popon'])
export type CaptionMode = z.infer<typeof CaptionMode>

export const TailMode = z.enum(['ghost', 'hide'])
export type TailMode = z.infer<typeof TailMode>

export const VoiceConfig = z.object({
  enabled: z.boolean().default(false),
  voiceId: z.string().min(1).optional(),
  /** Adaptive rate clamp; the relay narrows this further under queue pressure. */
  speed: z.number().min(0.7).max(1.2).default(1.0),
  /** Which target language the voice reads. Must be one of `dstLangs`. */
  lang: LanguageCode.optional(),
})
export type VoiceConfig = z.infer<typeof VoiceConfig>

export const RenderConfig = z.object({
  style: CaptionStyle.default('clean'),
  mode: CaptionMode.default('rollup'),
  tail: TailMode.default('ghost'),
  /** Broadcast convention: two lines, 42 characters. Tunable within readable bounds. */
  maxLines: z.number().int().min(1).max(3).default(2),
  maxCharsPerLine: z.number().int().min(24).max(60).default(42),
  fontSize: z.number().int().min(20).max(96).default(44),
  /** Title-safe margin, percent of the shorter viewport edge. */
  safeAreaPct: z.number().min(0).max(15).default(5),
  showSource: z.boolean().default(true),
  showTranslation: z.boolean().default(true),
})
export type RenderConfig = z.infer<typeof RenderConfig>

export const SessionConfig = z.object({
  srcLang: SourceLanguage.default('auto'),
  /** Empty means captions in the source language only. */
  dstLangs: z.array(LanguageCode).max(5).default([]),
  voice: VoiceConfig.default({ enabled: false, speed: 1.0 }),
  /** Scribe caps keyterms at 50 entries of 20 characters. */
  glossaryId: z.string().uuid().optional(),
  /** Strips fillers and false starts — what makes the output readable as subtitles. */
  noVerbatim: z.boolean().default(true),
  render: RenderConfig.default({}),
})
export type SessionConfig = z.infer<typeof SessionConfig>

export const GLOSSARY_MAX_TERMS = 50
export const GLOSSARY_MAX_TERM_LENGTH = 20

export const EndReason = z.enum([
  'user',
  'credits_exhausted',
  'idle_timeout',
  'server_shutdown',
  'protocol_error',
  'upstream_error',
  'superseded',
])
export type EndReason = z.infer<typeof EndReason>

export const NoticeCode = z.enum([
  'LOW_CREDITS',
  'CREDITS_CRITICAL',
  'VOICE_BEHIND',
  'STT_RECONNECTING',
  'TRANSLATION_DEGRADED',
  'TTS_UNAVAILABLE',
  'NETWORK_SLOW',
])
export type NoticeCode = z.infer<typeof NoticeCode>
