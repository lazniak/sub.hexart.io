import { describe, expect, it } from 'vitest'
import {
  burnRatePerMinute,
  burnRatePerSecond,
  checkConfigAgainstPlan,
  creditsForSeconds,
  estimateSeconds,
  formatAirtime,
} from './pricing.js'
import { PLANS } from './plans.js'

describe('burnRatePerMinute', () => {
  it('charges 1.0 for captions only', () => {
    expect(burnRatePerMinute({ targetLanguages: 0, voiceEnabled: false })).toBe(1.0)
  })

  it('adds 0.5 per target language', () => {
    expect(burnRatePerMinute({ targetLanguages: 1, voiceEnabled: false })).toBe(1.5)
    expect(burnRatePerMinute({ targetLanguages: 3, voiceEnabled: false })).toBe(2.5)
  })

  it('adds 3.0 for voice-over', () => {
    expect(burnRatePerMinute({ targetLanguages: 1, voiceEnabled: true })).toBe(4.5)
  })

  it('never goes below the caption rate on negative input', () => {
    expect(burnRatePerMinute({ targetLanguages: -5, voiceEnabled: false })).toBe(1.0)
  })
})

describe('estimateSeconds', () => {
  it('floors so the studio never over-promises airtime', () => {
    // 10 credits at 1.5/min = 400 s exactly
    expect(estimateSeconds(10, { targetLanguages: 1, voiceEnabled: false })).toBe(400)
    // 10 credits at 4.5/min = 133.33 s -> 133
    expect(estimateSeconds(10, { targetLanguages: 1, voiceEnabled: true })).toBe(133)
  })

  it('returns zero for an empty balance', () => {
    expect(estimateSeconds(0, { targetLanguages: 0, voiceEnabled: false })).toBe(0)
  })
})

describe('creditsForSeconds', () => {
  it('round-trips against estimateSeconds within a tick', () => {
    const cfg = { targetLanguages: 2, voiceEnabled: true }
    const seconds = estimateSeconds(100, cfg)
    expect(creditsForSeconds(seconds, cfg)).toBeLessThanOrEqual(100)
  })

  it('bills a single second at the per-second rate', () => {
    const cfg = { targetLanguages: 0, voiceEnabled: false }
    expect(creditsForSeconds(1, cfg)).toBe(burnRatePerSecond(cfg))
  })
})

describe('checkConfigAgainstPlan', () => {
  it('blocks voice-over on Starter', () => {
    const r = checkConfigAgainstPlan(PLANS.starter, { targetLanguages: 1, voiceEnabled: true })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('PLAN_FEATURE_LOCKED')
  })

  it('blocks more target languages than the plan allows', () => {
    const r = checkConfigAgainstPlan(PLANS.starter, { targetLanguages: 2, voiceEnabled: false })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('Starter')
  })

  it('allows a valid Creator configuration', () => {
    expect(
      checkConfigAgainstPlan(PLANS.creator, { targetLanguages: 3, voiceEnabled: true }).ok,
    ).toBe(true)
  })

  it('blocks voice-over on Trial', () => {
    expect(
      checkConfigAgainstPlan(PLANS.trial, { targetLanguages: 1, voiceEnabled: true }).ok,
    ).toBe(false)
  })
})

describe('formatAirtime', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatAirtime(45)).toBe('45 s')
    expect(formatAirtime(400)).toBe('6 min')
    expect(formatAirtime(11_460)).toBe('3 h 11 min')
  })
})
