import { PLANS, formatAirtime, type Plan, type PlanCode } from '@sub/billing'
import { airtimeSeconds, formatMoney } from './format'

const ORDER: PlanCode[] = ['trial', 'starter', 'creator', 'pro']
const BASE_CONFIG = { targetLanguages: 0, voiceEnabled: false }

const yesNo = (value: boolean) => (value ? 'tak' : 'nie')

interface Row {
  label: string
  value: (plan: Plan) => string
}

const ROWS: Row[] = [
  {
    label: 'Cena netto miesięcznie',
    value: (plan) =>
      plan.priceMonthly.pln === 0 ? 'bezpłatnie' : formatMoney(plan.priceMonthly.pln, 'pln'),
  },
  {
    label: 'Cena netto rocznie',
    value: (plan) => (plan.priceYearly ? formatMoney(plan.priceYearly.pln, 'pln') : '—'),
  },
  { label: 'Credits w okresie', value: (plan) => String(plan.credits) },
  {
    label: 'To znaczy samych napisów',
    value: (plan) => formatAirtime(airtimeSeconds(plan.credits, BASE_CONFIG)),
  },
  { label: 'Języki docelowe', value: (plan) => String(plan.maxTargetLanguages) },
  { label: 'Sesje równoległe', value: (plan) => String(plan.maxConcurrentSessions) },
  { label: 'Lektor AI', value: (plan) => yesNo(plan.voiceEnabled) },
  { label: 'Glosariusz', value: (plan) => yesNo(plan.glossaryEnabled) },
  { label: 'Znak wodny w OBS', value: (plan) => yesNo(plan.watermark) },
  { label: 'Priorytet rozpoznawania mowy', value: (plan) => yesNo(plan.prioritySttQueue) },
  { label: 'API', value: (plan) => yesNo(plan.apiAccess) },
]

export function PlanComparison() {
  return (
    <div
      role="region"
      aria-label="Porównanie planów — tabela przewijana w poziomie"
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-line"
    >
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <caption className="px-4 py-3 text-left text-sm text-muted">
          Wszystkie ceny są kwotami netto. Podatek VAT nalicza sprzedawca zgodnie z krajem nabywcy.
        </caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-4 py-3 text-left font-semibold text-paper">
              Parametr
            </th>
            {ORDER.map((code) => (
              <th key={code} scope="col" className="px-4 py-3 text-left font-semibold text-paper">
                {PLANS[code].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-b border-line last:border-b-0">
              <th scope="row" className="px-4 py-3 text-left font-normal text-muted">
                {row.label}
              </th>
              {ORDER.map((code) => (
                <td key={code} className="px-4 py-3 text-paper">
                  {row.value(PLANS[code])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
