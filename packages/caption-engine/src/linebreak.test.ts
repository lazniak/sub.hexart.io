import { describe, expect, it } from 'vitest'
import { breakIntoLines, rollUp } from './linebreak.js'

describe('breakIntoLines', () => {
  it('returns nothing for empty input', () => {
    expect(breakIntoLines('   ', 42, 2)).toEqual({ lines: [], overflow: '' })
  })

  it('keeps short text on one line', () => {
    expect(breakIntoLines('Dzisiaj pokażę wam nowy setup.', 42, 2).lines).toEqual([
      'Dzisiaj pokażę wam nowy setup.',
    ])
  })

  it('never exceeds the character budget', () => {
    const text =
      'Dzisiaj pokażę wam nowy setup do streamowania, który przygotowałem przez ostatni tydzień.'
    const { lines } = breakIntoLines(text, 42, 2)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(42)
  })

  it('prefers breaking after a comma over a plain space', () => {
    const { lines } = breakIntoLines(
      'Kupiłem nowy mikrofon, bo stary już nie działał dobrze',
      36,
      2,
    )
    expect(lines[0]!.endsWith(',')).toBe(true)
  })

  it('never splits a word', () => {
    const { lines, overflow } = breakIntoLines(
      'transkrypcja symultaniczna wielojęzyczna konfiguracja strumienia',
      30,
      2,
    )
    for (const line of [...lines, overflow]) {
      if (line) expect(line).not.toMatch(/\S-$/)
    }
    expect(lines.join(' ') + (overflow ? ' ' + overflow : '')).toBe(
      'transkrypcja symultaniczna wielojęzyczna konfiguracja strumienia',
    )
  })

  it('hard-splits a single word longer than the line rather than looping', () => {
    const { lines } = breakIntoLines('https://sub.hexart.io/projector/pt_verylongtoken', 20, 2)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('keeps a number with its unit', () => {
    const { lines } = breakIntoLines('Nagrywam wszystko na dysku o pojemności 5 TB bez problemu', 40, 2)
    expect(lines[0]!.trimEnd().endsWith('5')).toBe(false)
  })

  it('returns the remainder as overflow instead of dropping it', () => {
    const text = Array.from({ length: 40 }, (_, i) => `slowo${i}`).join(' ')
    const { lines, overflow } = breakIntoLines(text, 42, 2)
    expect(lines).toHaveLength(2)
    expect(overflow.length).toBeGreaterThan(0)
  })
})

describe('rollUp', () => {
  it('shifts the oldest line out', () => {
    expect(rollUp(['linia jeden', 'linia dwa'], ['linia trzy'], 2)).toEqual([
      'linia dwa',
      'linia trzy',
    ])
  })

  it('fills up before shifting', () => {
    expect(rollUp([], ['pierwsza'], 2)).toEqual(['pierwsza'])
  })
})
