import { describe, expect, it } from 'vitest'
import { PLANS, TOPUP_PACKS, planOf } from './plans.js'

describe('planOf', () => {
  it('resolves a known plan code', () => {
    expect(planOf('creator')).toBe(PLANS.creator)
  })

  it('falls back to trial for an unknown code', () => {
    // A stale plan_code in the database must degrade to the least privileged plan,
    // never to an unrestricted one.
    expect(planOf('enterprise-that-does-not-exist')).toBe(PLANS.trial)
    expect(planOf('')).toBe(PLANS.trial)
  })
})

describe('plan definitions', () => {
  it('keeps plan codes consistent with their keys', () => {
    for (const [key, plan] of Object.entries(PLANS)) {
      expect(plan.code).toBe(key)
    }
  })

  it('gates voice-over above Starter and watermarks only Trial', () => {
    expect(PLANS.trial.voiceEnabled).toBe(false)
    expect(PLANS.starter.voiceEnabled).toBe(false)
    expect(PLANS.creator.voiceEnabled).toBe(true)
    expect(PLANS.trial.watermark).toBe(true)
    expect(PLANS.starter.watermark).toBe(false)
  })

  it('prices yearly billing at ten months', () => {
    for (const plan of Object.values(PLANS)) {
      if (!plan.priceYearly) continue
      expect(plan.priceYearly.pln).toBe(plan.priceMonthly.pln * 10)
      expect(plan.priceYearly.eur).toBe(plan.priceMonthly.eur * 10)
    }
  })

  it('gives a better rate for larger top-up packs', () => {
    const rates = TOPUP_PACKS.map((p) => p.price.pln / p.credits)
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]!).toBeLessThan(rates[i - 1]!)
    }
  })

  it('leaves the trial too small to be worth abusing', () => {
    expect(PLANS.trial.credits).toBeLessThanOrEqual(10)
    expect(PLANS.trial.priceMonthly.pln).toBe(0)
  })
})
