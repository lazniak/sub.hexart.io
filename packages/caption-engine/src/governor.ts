/**
 * Reading-rate governor.
 *
 * Subtitles faster than the eye are useless. When the speaker outruns the budget
 * we queue, then compress, then drop the oldest card — but we never render at an
 * unreadable speed. Dropping a card is visible; unreadable text is worse.
 */

export interface GovernorConfig {
  maxCps: number
  minCardMs: number
  maxCardMs: number
  cardGapMs: number
}

/** How long a card must stay on screen to be readable. */
export function displayMs(text: string, cfg: GovernorConfig): number {
  const chars = text.trim().length
  if (chars === 0) return cfg.minCardMs
  const needed = (chars / cfg.maxCps) * 1000
  return Math.round(Math.min(cfg.maxCardMs, Math.max(cfg.minCardMs, needed)))
}

/** Characters per second a card would actually be shown at. */
export function effectiveCps(text: string, shownMs: number): number {
  if (shownMs <= 0) return Infinity
  return (text.trim().length / shownMs) * 1000
}

export type BacklogAction = 'show' | 'compress' | 'drop-oldest'

/**
 * Backlog policy. Compression means re-rendering from the no-verbatim transcript
 * (fillers and false starts removed), which is typically 10-20% shorter.
 */
export function backlogAction(queueDepth: number): BacklogAction {
  if (queueDepth > 6) return 'drop-oldest'
  if (queueDepth > 3) return 'compress'
  return 'show'
}

/** Rolling p95, used for the cpsP95 quality metric. */
export class Percentile {
  private readonly samples: number[] = []

  constructor(private readonly capacity = 200) {}

  add(value: number): void {
    if (!Number.isFinite(value)) return
    this.samples.push(value)
    if (this.samples.length > this.capacity) this.samples.shift()
  }

  at(p: number): number {
    if (this.samples.length === 0) return 0
    const sorted = [...this.samples].sort((a, b) => a - b)
    const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
    return sorted[index]!
  }
}
