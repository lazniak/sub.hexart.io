/**
 * Display formatting for money, credits and airtime.
 *
 * Deliberately hand-rolled instead of Intl: the same input must render the same
 * string on the server and in the browser, and ICU data differs between runtimes.
 */

import { burnRatePerMinute, type BurnConfig } from '@sub/billing'

export type Currency = 'pln' | 'eur'

const CURRENCY_SUFFIX: Record<Currency, string> = { pln: 'zł', eur: '€' }

/** `minor` is the net price in minor units, exactly as stored in @sub/billing. */
export function formatMoney(minor: number, currency: Currency): string {
  const major = minor / 100
  const digits = Number.isInteger(major) ? String(major) : major.toFixed(2).replace('.', ',')
  return `${digits} ${CURRENCY_SUFFIX[currency]}`
}

/** Credits carry fractions; trim to two decimals and use the Polish decimal comma. */
export function formatCredits(credits: number): string {
  const rounded = Math.round(credits * 100) / 100
  return String(rounded).replace('.', ',')
}

/** Burn rate as shown next to every configuration, e.g. `1,5 cr/min`. */
export function formatBurnRate(creditsPerMinute: number): string {
  return `${formatCredits(creditsPerMinute)} cr/min`
}

/**
 * Airtime a credit balance buys, in seconds.
 *
 * NOT `estimateSeconds` from @sub/billing: that helper rounds the per-second rate
 * to four decimals *before* dividing, so 1/60 becomes 0.0167 and every figure
 * loses about 0.2%. On the page that read as 10 trial credits buying "9 min" and
 * Starter's 300 credits buying "4 h 59 min", directly under the promise that one
 * credit is one minute. Dividing by the per-minute rate keeps the rate itself
 * sourced from @sub/billing and makes the arithmetic on screen check out. Floors,
 * so airtime is still never over-promised.
 *
 * The underlying rounding in `burnRatePerSecond` is a @sub/billing concern; this
 * lane only fixes what it renders.
 */
export function airtimeSeconds(credits: number, cfg: BurnConfig): number {
  const perMinute = burnRatePerMinute(cfg)
  if (perMinute <= 0) return 0
  return Math.max(0, Math.floor((credits / perMinute) * 60))
}

/** Yearly billing is expressed as a discount in months, derived from the two prices. */
export function monthsFreeOnYearly(monthlyMinor: number, yearlyMinor: number): number {
  if (monthlyMinor <= 0) return 0
  return Math.round(12 - yearlyMinor / monthlyMinor)
}
