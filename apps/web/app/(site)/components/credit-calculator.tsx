'use client'

import { useId, useState } from 'react'
import {
  PLANS,
  burnRatePerMinute,
  creditsForSeconds,
  formatAirtime,
  type PlanCode,
} from '@sub/billing'
import { airtimeSeconds, formatBurnRate, formatCredits } from './format'

const PAID_ORDER: PlanCode[] = ['starter', 'creator', 'pro']
const MAX_LANGS = PLANS.pro.maxTargetLanguages
const LANG_OPTIONS = Array.from({ length: MAX_LANGS + 1 }, (_, index) => index)

const FIELD =
  'w-full rounded-md border border-line bg-ink px-3 py-2 text-base text-paper hover:border-muted'

/** Cheapest plan whose periodic grant covers the requested credits, if any. */
function smallestPlanCovering(credits: number): string {
  const match = PAID_ORDER.find((code) => PLANS[code].credits >= credits)
  return match ? PLANS[match].name : 'żaden — potrzebne doładowanie ponad plan Pro'
}

export function CreditCalculator() {
  const langsId = useId()
  const voiceId = useId()
  const minutesId = useId()
  const creditsId = useId()

  const [targetLanguages, setTargetLanguages] = useState(1)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [credits, setCredits] = useState(PLANS.starter.credits)

  const config = { targetLanguages, voiceEnabled }
  const rate = burnRatePerMinute(config)
  const seconds = airtimeSeconds(credits, config)
  const minutes = Math.round(seconds / 60)

  const onMinutesChange = (raw: string) => {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 0) return
    setCredits(creditsForSeconds(Math.round(parsed) * 60, config))
  }

  const onCreditsChange = (raw: string) => {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 0) return
    setCredits(parsed)
  }

  return (
    <div className="rounded-lg border border-line bg-ink-soft p-5 sm:p-6">
      <fieldset className="border-0 p-0">
        <legend className="mb-4 text-base font-semibold text-paper">
          Ile credits zużyje Twoja konfiguracja
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={langsId} className="mb-1.5 block text-sm text-muted">
              Języki tłumaczenia
            </label>
            <select
              id={langsId}
              className={FIELD}
              value={targetLanguages}
              onChange={(event) => setTargetLanguages(Number(event.target.value))}
            >
              {LANG_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count === 0 ? 'bez tłumaczenia' : `${count}`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <div className="flex items-center gap-3 pb-2">
              <input
                id={voiceId}
                type="checkbox"
                className="h-5 w-5 rounded border-line accent-[var(--color-accent)]"
                checked={voiceEnabled}
                onChange={(event) => setVoiceEnabled(event.target.checked)}
              />
              <label htmlFor={voiceId} className="text-sm text-paper">
                Lektor AI czyta tłumaczenie
              </label>
            </div>
          </div>

          <div>
            <label htmlFor={minutesId} className="mb-1.5 block text-sm text-muted">
              Minuty na antenie
            </label>
            <input
              id={minutesId}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className={FIELD}
              value={minutes}
              onChange={(event) => onMinutesChange(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor={creditsId} className="mb-1.5 block text-sm text-muted">
              Credits
            </label>
            <input
              id={creditsId}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              className={FIELD}
              value={Math.round(credits * 100) / 100}
              onChange={(event) => onCreditsChange(event.target.value)}
            />
          </div>
        </div>
      </fieldset>

      <p aria-live="polite" className="mt-5 text-sm leading-relaxed text-muted">
        Ta konfiguracja zużywa{' '}
        <strong className="font-semibold text-paper">{formatBurnRate(rate)}</strong>.{' '}
        <strong className="font-semibold text-paper">{formatCredits(credits)} credits</strong>{' '}
        wystarczy na <strong className="font-semibold text-paper">{formatAirtime(seconds)}</strong>{' '}
        na antenie. Najmniejszy plan z takim przydziałem w okresie rozliczeniowym:{' '}
        {smallestPlanCovering(credits)}.
      </p>

      <p className="mt-3 text-sm text-muted">
        Naliczamy tylko czas, w którym faktycznie płynie mowa. Cisza dłuższa niż 20 sekund pauzuje
        licznik.
      </p>
    </div>
  )
}
