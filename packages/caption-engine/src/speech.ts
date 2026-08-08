/**
 * Voice-over gating.
 *
 * TTS runs on committed sentences only. Speaking a partial makes the voice stutter
 * and re-read corrected words, which is far worse than arriving a beat later.
 */

export interface SpeechQueueItem {
  cardId: string
  lang: string
  text: string
}

export type SpeechPressure = 'normal' | 'compress' | 'skip'

export function speechPressure(depth: number): SpeechPressure {
  if (depth > 6) return 'skip'
  if (depth > 3) return 'compress'
  return 'normal'
}

/**
 * Rate adapts inside a narrow band to absorb drift. Beyond it the voice sounds
 * artificial, so we drop a sentence instead of speeding up further.
 */
export function adaptiveRate(depth: number, base: number): number {
  const boost = Math.min(0.15, Math.max(0, depth - 1) * 0.05)
  return Math.min(1.15, Math.max(0.9, base + boost))
}

/**
 * Short fragments are merged forward: a standalone "Tak." forces its own
 * generation and the intonation breaks.
 */
export function shouldMergeForward(text: string, minWords: number): boolean {
  return countWords(text) < minWords
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Bounded FIFO. Overflow drops the oldest — a 15 s late voice is worse than a gap. */
export class SpeechQueue {
  private readonly items: SpeechQueueItem[] = []
  private droppedCount = 0

  constructor(private readonly capacity = 8) {}

  push(item: SpeechQueueItem): void {
    this.items.push(item)
    while (this.items.length > this.capacity) {
      this.items.shift()
      this.droppedCount++
    }
  }

  shift(): SpeechQueueItem | undefined {
    return this.items.shift()
  }

  get depth(): number {
    return this.items.length
  }

  get dropped(): number {
    return this.droppedCount
  }
}
