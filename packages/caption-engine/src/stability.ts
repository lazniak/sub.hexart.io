/**
 * Stability window.
 *
 * Scribe rewrites its own words until commit ("pokarze" -> "pokażę"). Rendering
 * raw partials therefore flickers. A token counts as stable only when it has
 * survived N consecutive partials AND sits outside the trailing K tokens, which
 * is where the model is still guessing. Dropping the second condition is what
 * lets a wrong word freeze on screen.
 */

export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0)
}

/**
 * Number of leading tokens of `history[last]` that are stable.
 *
 * @param history Recent partial hypotheses, oldest first, newest last.
 */
export function stablePrefixTokens(
  history: readonly string[][],
  frames: number,
  volatileTail: number,
): number {
  if (history.length === 0) return 0
  const current = history[history.length - 1]!
  if (history.length < frames) return 0

  const window = history.slice(-frames)
  let common = current.length
  for (const hypothesis of window) {
    let i = 0
    while (i < common && i < hypothesis.length && hypothesis[i] === current[i]) i++
    common = i
    if (common === 0) break
  }

  return Math.max(0, Math.min(common, current.length - volatileTail))
}

/** Character length of the stable prefix, for rendering the ghost tail. */
export function stablePrefixChars(tokens: readonly string[], stableTokens: number): number {
  if (stableTokens <= 0) return 0
  const n = Math.min(stableTokens, tokens.length)
  let chars = 0
  for (let i = 0; i < n; i++) chars += tokens[i]!.length
  return chars + Math.max(0, n - 1) // interior spaces
}

/**
 * Rolling rewrite rate: share of recent partials that changed an already-emitted
 * token rather than only appending. High values mean difficult audio, which is
 * the signal to widen the stability window.
 */
export class RewriteTracker {
  private readonly window: boolean[] = []

  constructor(private readonly capacity = 20) {}

  record(previous: readonly string[], next: readonly string[]): void {
    const compare = Math.min(previous.length, next.length)
    let rewrote = false
    for (let i = 0; i < compare; i++) {
      if (previous[i] !== next[i]) {
        rewrote = true
        break
      }
    }
    this.window.push(rewrote)
    if (this.window.length > this.capacity) this.window.shift()
  }

  get rate(): number {
    if (this.window.length === 0) return 0
    return this.window.filter(Boolean).length / this.window.length
  }

  reset(): void {
    this.window.length = 0
  }
}

/**
 * Difficult audio buys one extra frame of stability: ~150 ms more latency in
 * exchange for visibly fewer corrections on screen.
 */
export function adaptiveFrames(base: number, rewriteRate: number, threshold: number): number {
  return rewriteRate > threshold ? base + 1 : base
}
