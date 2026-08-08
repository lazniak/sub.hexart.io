import { describe, expect, it } from 'vitest'
import { Percentile, backlogAction, displayMs, effectiveCps } from './governor.js'

const cfg = { maxCps: 17, minCardMs: 1000, maxCardMs: 6000, cardGapMs: 80 }

describe('displayMs', () => {
  it('holds a very short card for the readable minimum', () => {
    expect(displayMs('Tak.', cfg)).toBe(1000)
    expect(displayMs('', cfg)).toBe(1000)
  })

  it('scales with length up to the ceiling', () => {
    const medium = displayMs('Dzisiaj pokażę wam nowy setup do streamowania.', cfg)
    expect(medium).toBeGreaterThan(1000)
    expect(medium).toBeLessThan(6000)
  })

  it('caps long text at the maximum', () => {
    expect(displayMs('x'.repeat(500), cfg)).toBe(6000)
  })

  it('never renders faster than the reading limit', () => {
    const text = 'Dzisiaj pokażę wam nowy setup do streamowania na kanale.'
    expect(effectiveCps(text, displayMs(text, cfg))).toBeLessThanOrEqual(17.001)
  })
})

describe('effectiveCps', () => {
  it('is infinite for a zero-length display', () => {
    expect(effectiveCps('abc', 0)).toBe(Infinity)
  })
})

describe('backlogAction', () => {
  it('escalates from show to compress to drop', () => {
    expect(backlogAction(0)).toBe('show')
    expect(backlogAction(3)).toBe('show')
    expect(backlogAction(4)).toBe('compress')
    expect(backlogAction(7)).toBe('drop-oldest')
  })
})

describe('Percentile', () => {
  it('is zero when empty', () => {
    expect(new Percentile().at(95)).toBe(0)
  })

  it('reports the requested percentile', () => {
    const p = new Percentile()
    for (let i = 1; i <= 100; i++) p.add(i)
    expect(p.at(95)).toBeGreaterThanOrEqual(95)
  })

  it('ignores non-finite samples and bounds its window', () => {
    const p = new Percentile(3)
    p.add(Infinity)
    p.add(NaN)
    p.add(1)
    p.add(2)
    p.add(3)
    p.add(4)
    expect(p.at(50)).toBeGreaterThanOrEqual(2)
  })
})
