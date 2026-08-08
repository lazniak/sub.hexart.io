import { TOPUP_PACKS, TOPUP_VALIDITY_DAYS, formatAirtime } from '@sub/billing'
import { airtimeSeconds, formatMoney } from './format'

const BASE_CONFIG = { targetLanguages: 0, voiceEnabled: false }

export function TopupCards() {
  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-3">
        {TOPUP_PACKS.map((pack) => (
          <li key={pack.code} className="rounded-lg border border-line p-5">
            <h3 className="text-lg font-semibold text-paper">{pack.credits} credits</h3>
            <p className="mt-2 text-2xl font-semibold text-paper">
              {formatMoney(pack.price.pln, 'pln')}{' '}
              <span className="text-sm font-normal text-muted">netto</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              lub {formatMoney(pack.price.eur, 'eur')} netto
            </p>
            <p className="mt-3 text-sm text-muted">
              ≈ {formatAirtime(airtimeSeconds(pack.credits, BASE_CONFIG))} samych napisów
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">
        Doładowania działają bez abonamentu i są ważne {TOPUP_VALIDITY_DAYS} dni od zakupu.
      </p>
    </>
  )
}
