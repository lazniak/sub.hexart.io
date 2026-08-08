import { describe, expect, it } from 'vitest'
import {
  RewriteTracker,
  adaptiveFrames,
  stablePrefixChars,
  stablePrefixTokens,
  tokenize,
} from './stability.js'

const h = (...texts: string[]) => texts.map(tokenize)

describe('stablePrefixTokens', () => {
  it('returns nothing before the window is filled', () => {
    expect(stablePrefixTokens(h('dzisiaj pokażę wam nowy setup'), 2, 3)).toBe(0)
    expect(stablePrefixTokens([], 2, 3)).toBe(0)
  })

  it('holds back the volatile tail even when tokens agree', () => {
    const history = h('dzisiaj pokażę wam nowy setup', 'dzisiaj pokażę wam nowy setup')
    // 5 tokens agree, but the last 3 are where the model still guesses.
    expect(stablePrefixTokens(history, 2, 3)).toBe(2)
  })

  it('refuses to stabilise a token the model is still rewriting', () => {
    // The classic failure: "pokarze" must never freeze before it becomes "pokażę".
    const history = h('dzisiaj pokarze', 'dzisiaj pokażę wam')
    expect(stablePrefixTokens(history, 2, 3)).toBe(0)
  })

  it('grows the stable prefix as the hypothesis extends', () => {
    const history = h(
      'dzisiaj pokażę wam nowy setup do streamowania',
      'dzisiaj pokażę wam nowy setup do streamowania na',
    )
    expect(stablePrefixTokens(history, 2, 3)).toBe(5)
  })

  it('collapses to zero when the very first token changes', () => {
    expect(stablePrefixTokens(h('alfa beta gamma delta', 'omega beta gamma delta'), 2, 3)).toBe(0)
  })

  it('honours a wider window', () => {
    const history = h('a b c d e f', 'a b c d e f', 'a b c d e f')
    expect(stablePrefixTokens(history, 3, 3)).toBe(3)
  })
})

describe('stablePrefixChars', () => {
  it('counts interior spaces', () => {
    expect(stablePrefixChars(tokenize('dzisiaj pokażę wam'), 2)).toBe('dzisiaj pokażę'.length)
  })

  it('is zero for an empty prefix', () => {
    expect(stablePrefixChars(tokenize('abc def'), 0)).toBe(0)
  })

  it('clamps to the available tokens', () => {
    expect(stablePrefixChars(tokenize('abc'), 9)).toBe(3)
  })
})

describe('RewriteTracker', () => {
  it('treats pure appends as clean', () => {
    const t = new RewriteTracker()
    t.record(tokenize('a b'), tokenize('a b c'))
    t.record(tokenize('a b c'), tokenize('a b c d'))
    expect(t.rate).toBe(0)
  })

  it('counts an in-place change as a rewrite', () => {
    const t = new RewriteTracker()
    t.record(tokenize('dzisiaj pokarze'), tokenize('dzisiaj pokażę wam'))
    expect(t.rate).toBe(1)
  })

  it('is zero on an empty window and resets', () => {
    const t = new RewriteTracker()
    expect(t.rate).toBe(0)
    t.record(tokenize('a'), tokenize('b'))
    t.reset()
    expect(t.rate).toBe(0)
  })

  it('bounds the window', () => {
    const t = new RewriteTracker(3)
    for (let i = 0; i < 10; i++) t.record(tokenize('a'), tokenize('a'))
    t.record(tokenize('a'), tokenize('b'))
    expect(t.rate).toBeCloseTo(1 / 3, 5)
  })
})

describe('adaptiveFrames', () => {
  it('buys an extra frame of stability on difficult audio', () => {
    expect(adaptiveFrames(2, 0.3, 0.15)).toBe(3)
    expect(adaptiveFrames(2, 0.05, 0.15)).toBe(2)
  })
})
