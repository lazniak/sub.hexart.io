import { describe, expect, it } from 'vitest'
import { CaptionEngine } from './engine.js'
import type { CaptionOp, SttEvent } from './types.js'

function run(engine: CaptionEngine, events: SttEvent[]): CaptionOp[] {
  return events.flatMap((e) => engine.push(e))
}

const partial = (text: string, atMs: number): SttEvent => ({ kind: 'partial', text, atMs })
const committed = (text: string, atMs: number): SttEvent => ({ kind: 'committed', text, atMs })

describe('CaptionEngine', () => {
  it('opens a card on the first partial and reuses it afterwards', () => {
    const engine = new CaptionEngine()
    const ops = run(engine, [partial('dzisiaj', 100), partial('dzisiaj pokażę', 300)])
    expect(ops.filter((o) => o.op === 'cardOpen')).toHaveLength(1)
    expect(ops.filter((o) => o.op === 'cardUpdate')).toHaveLength(2)
  })

  it('withholds stability from a token still being rewritten', () => {
    const engine = new CaptionEngine()
    const ops = run(engine, [
      partial('dzisiaj po', 100),
      partial('dzisiaj pokarze', 300),
      partial('dzisiaj pokażę wam', 500),
    ])
    const updates = ops.filter((o) => o.op === 'cardUpdate')
    // "pokarze" was wrong, so nothing may have frozen on screen.
    expect(updates.every((u) => u.op === 'cardUpdate' && u.stable === 0)).toBe(true)
  })

  it('commits cleanly when the text matches the last partial', () => {
    const engine = new CaptionEngine()
    const ops = run(engine, [
      partial('Dzisiaj pokażę wam nowy setup.', 100),
      committed('Dzisiaj pokażę wam nowy setup.', 400),
    ])
    expect(ops.some((o) => o.op === 'cardCommit')).toBe(true)
    expect(ops.some((o) => o.op === 'cardRetract')).toBe(false)
  })

  it('retracts as one atomic swap when the commit differs', () => {
    const engine = new CaptionEngine()
    const ops = run(engine, [
      partial('dzisiaj pokarze wam', 100),
      committed('Dzisiaj pokażę wam nowy setup.', 400),
    ])
    const retracts = ops.filter((o) => o.op === 'cardRetract')
    expect(retracts).toHaveLength(1)
    expect(ops.filter((o) => o.op === 'cardCommit')).toHaveLength(0)
  })

  it('emits no translate requests when no target language is configured', () => {
    const engine = new CaptionEngine({ targetLangs: [] })
    const ops = run(engine, [partial('dzisiaj pokażę wam nowy setup', 100), committed('Dzisiaj pokażę wam nowy setup.', 400)])
    expect(ops.some((o) => o.op === 'translateRequest')).toBe(false)
  })

  it('always translates a committed segment', () => {
    const engine = new CaptionEngine({ targetLangs: ['en'] })
    const ops = run(engine, [committed('Dzisiaj pokażę wam nowy setup.', 400)])
    const req = ops.find((o) => o.op === 'translateRequest')
    expect(req).toBeDefined()
    expect(req!.op === 'translateRequest' && req!.speculative).toBe(false)
  })

  it('rate-limits speculative translation instead of firing on every partial', () => {
    const engine = new CaptionEngine({
      targetLangs: ['en'],
      speculativeGrowthChars: 10,
      speculativeMinIntervalMs: 400,
    })
    const ops = run(engine, [
      partial('dzisiaj pokażę wam nowy setup do streamowania', 100),
      partial('dzisiaj pokażę wam nowy setup do streamowania na', 150),
      partial('dzisiaj pokażę wam nowy setup do streamowania na kanale', 200),
    ])
    const speculative = ops.filter((o) => o.op === 'translateRequest' && o.speculative)
    // Three partials 50 ms apart must not produce three calls.
    expect(speculative.length).toBeLessThanOrEqual(1)
  })

  it('carries preceding sentences as translation context', () => {
    const engine = new CaptionEngine({ targetLangs: ['en'], contextSentences: 2 })
    run(engine, [committed('Zdanie pierwsze.', 100), committed('Zdanie drugie.', 200)])
    const ops = engine.push(committed('Zdanie trzecie.', 300))
    const req = ops.find((o) => o.op === 'translateRequest')
    expect(req!.op === 'translateRequest' && req!.context).toEqual([
      'Zdanie pierwsze.',
      'Zdanie drugie.',
    ])
  })

  it('never downgrades a final translation to a speculative one', () => {
    const engine = new CaptionEngine({ targetLangs: ['en'] })
    run(engine, [committed('Dzisiaj pokażę wam nowy setup.', 100)])
    const cardId = engine.snapshot()[0]!.cardId
    engine.applyTranslation(cardId, 'en', "Today I'll show you my new setup.", true)
    const ops = engine.applyTranslation(cardId, 'en', 'Today I show', false)
    expect(ops).toHaveLength(0)
    expect(engine.snapshot()[0]!.tr.en).toBe("Today I'll show you my new setup.")
  })

  it('ignores translations for unknown cards', () => {
    const engine = new CaptionEngine({ targetLangs: ['en'] })
    expect(engine.applyTranslation('nope', 'en', 'x', true)).toHaveLength(0)
  })

  it('speaks only committed sentences, never partials', () => {
    const engine = new CaptionEngine({ voiceLang: 'pl' })
    const ops = run(engine, [
      partial('dzisiaj pokażę wam', 100),
      partial('dzisiaj pokażę wam nowy setup', 200),
    ])
    expect(ops.some((o) => o.op === 'speak')).toBe(false)
    const after = engine.push(committed('Dzisiaj pokażę wam nowy setup.', 400))
    expect(after.some((o) => o.op === 'speak')).toBe(true)
  })

  it('merges a too-short fragment forward instead of speaking it alone', () => {
    const engine = new CaptionEngine({ voiceLang: 'pl', minWordsForSpeech: 3 })
    const first = engine.push(committed('Tak.', 100))
    expect(first.some((o) => o.op === 'speak')).toBe(false)
    const second = engine.push(committed('Zaczynamy dzisiejszy stream.', 300))
    const speak = second.find((o) => o.op === 'speak')
    expect(speak!.op === 'speak' && speak!.text).toBe('Tak. Zaczynamy dzisiejszy stream.')
  })

  it('speaks the translation, not the source, when translating', () => {
    const engine = new CaptionEngine({ targetLangs: ['en'], voiceLang: 'en' })
    const commitOps = engine.push(committed('Dzisiaj pokażę wam nowy setup.', 100))
    expect(commitOps.some((o) => o.op === 'speak')).toBe(false)
    const cardId = engine.snapshot()[0]!.cardId
    const ops = engine.applyTranslation(cardId, 'en', "Today I'll show you my new setup.", true)
    const speak = ops.find((o) => o.op === 'speak')
    expect(speak!.op === 'speak' && speak!.text).toBe("Today I'll show you my new setup.")
  })

  it('closes the live card on silence', () => {
    const engine = new CaptionEngine()
    run(engine, [partial('dzisiaj', 100)])
    const ops = engine.push({ kind: 'silence', atMs: 20_000 })
    expect(ops.some((o) => o.op === 'cardClose')).toBe(true)
    expect(engine.push({ kind: 'silence', atMs: 21_000 })).toHaveLength(0)
  })

  it('exposes a snapshot that survives a projector refresh', () => {
    const engine = new CaptionEngine()
    run(engine, [
      committed('Zdanie pierwsze.', 100),
      committed('Zdanie drugie.', 200),
      partial('trzecie w toku', 300),
    ])
    const snap = engine.snapshot()
    expect(snap.map((c) => c.text)).toEqual([
      'Zdanie pierwsze.',
      'Zdanie drugie.',
      'trzecie w toku',
    ])
  })

  it('drops the oldest card rather than letting the backlog grow without bound', () => {
    const engine = new CaptionEngine()
    for (let i = 0; i < 12; i++) engine.push(committed(`Zdanie numer ${i}.`, i * 1000))
    expect(engine.metrics().droppedCards).toBeGreaterThan(0)
    expect(engine.snapshot().length).toBeLessThanOrEqual(8)
  })

  it('reports quality metrics', () => {
    const engine = new CaptionEngine()
    run(engine, [
      partial('dzisiaj pokażę wam nowy setup', 100),
      partial('dzisiaj pokażę wam nowy setup do', 250),
      committed('Dzisiaj pokażę wam nowy setup.', 500),
    ])
    const m = engine.metrics()
    expect(m.cardsEmitted).toBe(1)
    expect(m.cpsP95).toBeGreaterThan(0)
    expect(m.cpsP95).toBeLessThanOrEqual(17)
  })

  it('ignores empty partials and empty commits', () => {
    const engine = new CaptionEngine()
    expect(engine.push(partial('   ', 100))).toHaveLength(0)
    expect(engine.push(committed('  ', 200))).toHaveLength(0)
  })

  it('uses an injected id generator so fixtures replay identically', () => {
    let n = 0
    const engine = new CaptionEngine({}, () => `fixed-${n++}`)
    const ops = engine.push(partial('dzisiaj', 100))
    expect(ops[0]!.op === 'cardOpen' && ops[0]!.cardId).toBe('fixed-0')
  })
})
