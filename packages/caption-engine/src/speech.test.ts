import { describe, expect, it } from 'vitest'
import { SpeechQueue, adaptiveRate, countWords, shouldMergeForward, speechPressure } from './speech.js'

describe('speechPressure', () => {
  it('escalates with queue depth', () => {
    expect(speechPressure(1)).toBe('normal')
    expect(speechPressure(4)).toBe('compress')
    expect(speechPressure(8)).toBe('skip')
  })
})

describe('adaptiveRate', () => {
  it('stays inside a band that still sounds human', () => {
    expect(adaptiveRate(0, 1.0)).toBe(1.0)
    expect(adaptiveRate(10, 1.0)).toBeLessThanOrEqual(1.15)
    expect(adaptiveRate(0, 0.5)).toBeGreaterThanOrEqual(0.9)
  })
})

describe('shouldMergeForward', () => {
  it('merges fragments below the word floor', () => {
    expect(shouldMergeForward('Tak.', 3)).toBe(true)
    expect(shouldMergeForward('Zaczynamy dzisiejszy stream.', 3)).toBe(false)
  })
})

describe('countWords', () => {
  it('ignores extra whitespace', () => {
    expect(countWords('  a   b  ')).toBe(2)
    expect(countWords('   ')).toBe(0)
  })
})

describe('SpeechQueue', () => {
  it('is FIFO', () => {
    const q = new SpeechQueue()
    q.push({ cardId: 'a', lang: 'en', text: 'one' })
    q.push({ cardId: 'b', lang: 'en', text: 'two' })
    expect(q.shift()!.cardId).toBe('a')
    expect(q.depth).toBe(1)
  })

  it('drops the oldest rather than falling further behind', () => {
    const q = new SpeechQueue(2)
    q.push({ cardId: 'a', lang: 'en', text: '1' })
    q.push({ cardId: 'b', lang: 'en', text: '2' })
    q.push({ cardId: 'c', lang: 'en', text: '3' })
    expect(q.dropped).toBe(1)
    expect(q.shift()!.cardId).toBe('b')
  })

  it('returns undefined when empty', () => {
    expect(new SpeechQueue().shift()).toBeUndefined()
  })
})
