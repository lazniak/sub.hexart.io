import type { CSSProperties } from 'react'
import type { CaptionStyle } from '@sub/contracts'

/**
 * The four render presets from docs/CAPTION-ENGINE.md §9.
 *
 * Everything a preset changes is a custom property, so switching presets never
 * changes the DOM and never triggers a relayout in CEF.
 */
export interface StylePreset {
  vars: Record<string, string>
  /** Presets with an opinion about the line budget override the requested one. */
  maxLines?: number
}

const SHADOW_HARD = '0 2px 6px rgba(0, 0, 0, 0.9), 0 0 2px rgba(0, 0, 0, 0.95)'
const SHADOW_SOFT = '0 1px 4px rgba(0, 0, 0, 0.8)'

export const STYLE_PRESETS: Record<CaptionStyle, StylePreset> = {
  clean: {
    vars: {
      '--sub-color': '#ffffff',
      '--sub-stable-color': '#ffffff',
      '--sub-badge': 'transparent',
      '--sub-badge-pad': '0',
      '--sub-radius': '0',
      '--sub-weight': '600',
      '--sub-tracking': '0.005em',
      '--sub-shadow': SHADOW_HARD,
    },
  },
  broadcast: {
    vars: {
      // Black plate + amber text is the teletext convention; it survives any backdrop.
      '--sub-color': '#f7d117',
      '--sub-stable-color': '#f7d117',
      '--sub-badge': 'rgba(0, 0, 0, 0.82)',
      '--sub-badge-pad': '0.12em 0.34em',
      '--sub-radius': '3px',
      '--sub-weight': '700',
      '--sub-tracking': '0',
      '--sub-shadow': 'none',
    },
  },
  minimal: {
    vars: {
      '--sub-color': '#ffffff',
      '--sub-stable-color': '#ffffff',
      '--sub-badge': 'transparent',
      '--sub-badge-pad': '0',
      '--sub-radius': '0',
      '--sub-weight': '500',
      '--sub-tracking': '0.01em',
      '--sub-shadow': SHADOW_SOFT,
    },
    maxLines: 1,
  },
  karaoke: {
    vars: {
      // The stable prefix is the highlight; the volatile tail stays plain white.
      '--sub-color': '#ffffff',
      '--sub-stable-color': '#ffe066',
      '--sub-badge': 'rgba(0, 0, 0, 0.55)',
      '--sub-badge-pad': '0.1em 0.3em',
      '--sub-radius': '6px',
      '--sub-weight': '700',
      '--sub-tracking': '0',
      '--sub-shadow': SHADOW_HARD,
    },
  },
}

export function stylePreset(style: CaptionStyle): StylePreset {
  return STYLE_PRESETS[style]
}

/**
 * React's CSSProperties has no slot for custom properties, and every visual knob
 * in the projector travels as one. The cast is the narrowest place to admit that.
 */
export function asStyle(vars: Record<string, string>): CSSProperties {
  return vars as unknown as CSSProperties
}

/** Duration of the whole-card crossfade after a post-commit retract. */
export const CARD_SWAP_MS = 200
/** Roll-up shift of one line. */
export const ROLL_UP_MS = 120
