/** Events as they arrive from ElevenLabs Scribe v2 Realtime, normalised. */
export type SttEvent =
  | { kind: 'partial'; text: string; atMs: number }
  | { kind: 'committed'; text: string; atMs: number }
  | { kind: 'silence'; atMs: number }

/** Operations the engine emits. The relay maps these onto the wire protocol. */
export type CaptionOp =
  | { op: 'cardOpen'; cardId: string; atMs: number }
  | { op: 'cardUpdate'; cardId: string; lines: string[]; text: string; stable: number }
  | { op: 'cardCommit'; cardId: string; lines: string[]; text: string }
  | { op: 'cardRetract'; cardId: string; lines: string[]; text: string }
  | { op: 'cardTranslate'; cardId: string; lang: string; text: string; final: boolean }
  | { op: 'cardClose'; cardId: string; atMs: number }
  | { op: 'translateRequest'; cardId: string; text: string; context: string[]; speculative: boolean }
  | { op: 'speak'; cardId: string; lang: string; text: string }

export interface EngineConfig {
  /** Consecutive identical partials before a token counts as stable. */
  stabilityFrames: number
  /** Trailing tokens never treated as stable — that is where the model guesses. */
  volatileTailTokens: number
  /** Raise stabilityFrames when the rewrite rate crosses this share. */
  adaptiveRewriteThreshold: number
  maxCharsPerLine: number
  maxLines: number
  /** Reading-rate ceiling. 17 cps is the practical limit for PL/EN. */
  maxCps: number
  minCardMs: number
  maxCardMs: number
  cardGapMs: number
  /** Stable-prefix growth, in characters, that arms a speculative translation. */
  speculativeGrowthChars: number
  /** Minimum spacing between speculative translation calls. */
  speculativeMinIntervalMs: number
  /** Committed sentences carried into the translation prompt for coherence. */
  contextSentences: number
  targetLangs: string[]
  voiceLang: string | null
  /** Below this word count a sentence is merged forward, or TTS intonation breaks. */
  minWordsForSpeech: number
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  stabilityFrames: 2,
  volatileTailTokens: 3,
  adaptiveRewriteThreshold: 0.15,
  maxCharsPerLine: 42,
  maxLines: 2,
  maxCps: 17,
  minCardMs: 1000,
  maxCardMs: 6000,
  cardGapMs: 80,
  speculativeGrowthChars: 25,
  speculativeMinIntervalMs: 400,
  contextSentences: 2,
  targetLangs: [],
  voiceLang: null,
  minWordsForSpeech: 3,
}

export interface EngineMetrics {
  rewriteRate: number
  medianStabilizeMs: number
  cardsEmitted: number
  droppedCards: number
  cpsP95: number
  translateRequests: number
  translateCacheHits: number
}
