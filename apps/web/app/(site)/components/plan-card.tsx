import { estimateSeconds, formatAirtime, type Plan } from '@sub/billing'
import { formatMoney, monthsFreeOnYearly } from './format'

/** Airtime a plan's credits buy with captions only — the cheapest, honest baseline. */
const BASE_CONFIG = { targetLanguages: 0, voiceEnabled: false }

function features(plan: Plan): string[] {
  const list = [
    `${plan.credits} credits miesięcznie ≈ ${formatAirtime(estimateSeconds(plan.credits, BASE_CONFIG))} samych napisów`,
    `Do ${plan.maxTargetLanguages} ${plan.maxTargetLanguages === 1 ? 'języka' : 'języków'} tłumaczenia`,
    `${plan.maxConcurrentSessions} ${plan.maxConcurrentSessions === 1 ? 'sesja równoległa' : 'sesje równoległe'}`,
  ]
  if (plan.voiceEnabled) list.push('Lektor AI czyta tłumaczenie na głos')
  if (plan.glossaryEnabled) list.push('Glosariusz nazw własnych')
  if (!plan.watermark) list.push('Bez znaku wodnego w OBS')
  if (plan.prioritySttQueue) list.push('Priorytet w kolejce rozpoznawania mowy')
  if (plan.apiAccess) list.push('Dostęp do API')
  return list
}

interface PlanCardProps {
  plan: Plan
  /** Marks the plan we recommend. Purely visual — no urgency, no countdown. */
  highlighted?: boolean
}

export function PlanCard({ plan, highlighted = false }: PlanCardProps) {
  const yearly = plan.priceYearly
  const monthsFree = yearly ? monthsFreeOnYearly(plan.priceMonthly.pln, yearly.pln) : 0

  return (
    <article
      className={`flex h-full flex-col rounded-lg border p-6 ${
        highlighted ? 'border-accent bg-ink-soft' : 'border-line'
      }`}
    >
      <h3 className="text-lg font-semibold text-paper">{plan.name}</h3>

      <p className="mt-3">
        <span className="text-3xl font-semibold text-paper">
          {formatMoney(plan.priceMonthly.pln, 'pln')}
        </span>{' '}
        <span className="text-sm text-muted">netto / mies.</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        lub {formatMoney(plan.priceMonthly.eur, 'eur')} netto / mies.
      </p>
      {yearly ? (
        <p className="mt-1 text-sm text-muted">
          Rocznie {formatMoney(yearly.pln, 'pln')} — {monthsFree} miesiące gratis.
        </p>
      ) : null}

      <ul className="mt-5 flex-1 space-y-2 text-sm text-muted">
        {features(plan).map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="text-accent">
              ·
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <a
        href={`/register?plan=${plan.code}`}
        className={`mt-6 inline-flex items-center justify-center rounded-md px-4 py-3 text-sm font-semibold ${
          highlighted
            ? 'bg-accent text-ink hover:bg-accent/85'
            : 'border border-line text-paper hover:border-muted hover:bg-ink-soft'
        }`}
      >
        Wybierz {plan.name}
      </a>
    </article>
  )
}
