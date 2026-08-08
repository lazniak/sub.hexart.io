/**
 * Line breaking, following broadcast subtitle practice (EBU-TT-D and the
 * conventions Netflix publishes): at most two lines, ~42 characters each, broken
 * at the strongest available syntactic boundary rather than wherever the width
 * runs out.
 */

/** Words that should start a line rather than end one — breaking before them reads better. */
const LEADING_WORDS = new Set([
  // Polish
  'i', 'a', 'ale', 'oraz', 'lub', 'albo', 'czy', 'że', 'bo', 'gdy', 'kiedy', 'jeśli', 'aby',
  'który', 'która', 'które', 'w', 'we', 'z', 'ze', 'na', 'do', 'od', 'po', 'za', 'przez',
  'dla', 'o', 'u', 'przy', 'nad', 'pod',
  // English
  'and', 'or', 'but', 'that', 'which', 'who', 'when', 'if', 'because', 'while', 'the', 'a',
  'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'by',
])

const SENTENCE_END = /[.!?…]["'»)\]]?$/
const STRONG_PAUSE = /[:;]$/
const WEAK_PAUSE = /,$/
const NUMERIC = /^[0-9]+([.,][0-9]+)?$/

interface Candidate {
  /** Break after this token index. */
  index: number
  score: number
  width: number
}

/**
 * Break `text` into at most `maxLines` lines of at most `maxChars` characters.
 *
 * Overflow is returned separately rather than silently dropped — the caller
 * decides whether it rolls up into the next card.
 */
export function breakIntoLines(
  text: string,
  maxChars: number,
  maxLines: number,
): { lines: string[]; overflow: string } {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { lines: [], overflow: '' }

  const lines: string[] = []
  let cursor = 0

  while (cursor < words.length && lines.length < maxLines) {
    const take = chooseBreak(words, cursor, maxChars)
    lines.push(words.slice(cursor, take).join(' '))
    cursor = take
  }

  return { lines, overflow: words.slice(cursor).join(' ') }
}

/** Index one past the last word that belongs on this line. */
function chooseBreak(words: readonly string[], from: number, maxChars: number): number {
  let width = 0
  let lastFitting = from
  const candidates: Candidate[] = []

  for (let i = from; i < words.length; i++) {
    const word = words[i]!
    const next = width === 0 ? word.length : width + 1 + word.length

    if (next > maxChars) break

    width = next
    lastFitting = i + 1
    candidates.push({ index: i + 1, score: boundaryScore(words, i), width })
  }

  // A single word longer than the line: hard-split it. Only URLs and the like hit this.
  if (lastFitting === from) return from + 1

  // Only consider breaks in the back half — anything earlier wastes the line.
  const minWidth = maxChars * 0.6
  const usable = candidates.filter((c) => c.width >= minWidth && c.score > 0)
  if (usable.length === 0) return lastFitting

  let best = usable[0]!
  for (const c of usable) {
    // Higher boundary score wins; equal scores prefer the fuller line.
    if (c.score > best.score || (c.score === best.score && c.width > best.width)) best = c
  }
  return best.index
}

/** How good a break after word `i` is. Zero means "only if nothing better exists". */
function boundaryScore(words: readonly string[], i: number): number {
  const word = words[i]!
  const next = words[i + 1]

  // End of input is always a clean break.
  if (next === undefined) return 5

  // Never separate a number from its unit ("5 kg", "1080 p").
  if (NUMERIC.test(word)) return 0

  if (SENTENCE_END.test(word)) return 4
  if (STRONG_PAUSE.test(word)) return 3
  if (WEAK_PAUSE.test(word)) return 2
  if (LEADING_WORDS.has(next.toLowerCase().replace(/[^\p{L}]/gu, ''))) return 1

  return 0.5
}

/** Roll-up display: line 1 <- line 2, line 2 <- new text. */
export function rollUp(current: readonly string[], incoming: string[], maxLines: number): string[] {
  const merged = [...current, ...incoming]
  return merged.slice(Math.max(0, merged.length - maxLines))
}
