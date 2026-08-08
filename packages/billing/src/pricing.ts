import {
  RATE_CAPTIONS_PER_MIN,
  RATE_TRANSLATION_PER_LANG_PER_MIN,
  RATE_VOICE_PER_MIN,
  type Plan,
} from './plans.js'

export interface BurnConfig {
  targetLanguages: number
  voiceEnabled: boolean
}

/** Credits consumed per minute of billable airtime for a given configuration. */
export function burnRatePerMinute(cfg: BurnConfig): number {
  const langs = Math.max(0, cfg.targetLanguages)
  const rate =
    RATE_CAPTIONS_PER_MIN +
    langs * RATE_TRANSLATION_PER_LANG_PER_MIN +
    (cfg.voiceEnabled ? RATE_VOICE_PER_MIN : 0)
  return round4(rate)
}

export function burnRatePerSecond(cfg: BurnConfig): number {
  return round4(burnRatePerMinute(cfg) / 60)
}

/** How long a balance lasts at the current rate. Floors — never over-promise airtime. */
export function estimateSeconds(credits: number, cfg: BurnConfig): number {
  const perSecond = burnRatePerSecond(cfg)
  if (perSecond <= 0) return 0
  return Math.max(0, Math.floor(credits / perSecond))
}

export function creditsForSeconds(seconds: number, cfg: BurnConfig): number {
  return round4(seconds * burnRatePerSecond(cfg))
}

export interface ConfigCheck {
  ok: boolean
  reason?: 'PLAN_FEATURE_LOCKED' | 'INVALID_CONFIG'
  message?: string
}

/** Plan gate. Runs server-side before a session starts — the studio UI only mirrors it. */
export function checkConfigAgainstPlan(plan: Plan, cfg: BurnConfig): ConfigCheck {
  if (cfg.voiceEnabled && !plan.voiceEnabled) {
    return {
      ok: false,
      reason: 'PLAN_FEATURE_LOCKED',
      message: `AI voice-over requires the Creator plan or higher (current: ${plan.name}).`,
    }
  }
  if (cfg.targetLanguages > plan.maxTargetLanguages) {
    return {
      ok: false,
      reason: 'PLAN_FEATURE_LOCKED',
      message: `${plan.name} allows ${plan.maxTargetLanguages} target language(s), requested ${cfg.targetLanguages}.`,
    }
  }
  return { ok: true }
}

/** Human-facing airtime string. The UI always shows minutes next to raw credits. */
export function formatAirtime(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

/** Credits carry fractions of a second; four decimals keeps rounding drift below a cent. */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
