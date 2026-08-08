import type { Metadata } from 'next'
import {
  TOPUP_PACKS,
  burnRatePerMinute,
  estimateSeconds,
  formatAirtime,
  planOf,
} from '@sub/billing'
import { currentUser } from '@/lib/auth/session'
import { bucketBalancesOf, recentLedger } from '@/lib/server/credits'
import { Card, EmptyState, Stat } from '../_components/ui'

export const metadata: Metadata = { title: 'Credits' }
export const dynamic = 'force-dynamic'

const BUCKET_LABEL: Record<string, string> = {
  trial: 'Trial',
  subscription: 'Abonament',
  topup: 'Doładowania',
}

const REASON_LABEL: Record<string, string> = {
  trial_grant: 'Credits na start',
  subscription_grant: 'Przydział abonamentowy',
  topup_purchase: 'Doładowanie',
  session_usage: 'Zużycie w sesji',
  refund_incident: 'Zwrot po awarii',
  refund_customer: 'Zwrot',
  expiry_subscription: 'Wygaśnięcie credits abonamentowych',
  expiry_topup: 'Wygaśnięcie doładowania',
  manual_adjustment: 'Korekta ręczna',
}

const dateFormat = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' })
const creditFormat = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 })
const moneyFormat = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })

/** The three configurations worth quoting: BILLING.md §1 uses the same examples. */
const AIRTIME_PROFILES = [
  { label: 'Same napisy', burn: { targetLanguages: 0, voiceEnabled: false } },
  { label: 'Napisy + 1 tłumaczenie', burn: { targetLanguages: 1, voiceEnabled: false } },
  { label: 'Napisy + 1 tłumaczenie + lektor', burn: { targetLanguages: 1, voiceEnabled: true } },
]

export default async function CreditsPage() {
  const user = await currentUser()
  if (!user) return null

  const plan = planOf(user.planCode)
  const [buckets, ledger] = await Promise.all([
    bucketBalancesOf(user.id),
    recentLedger(user.id, 40),
  ])

  const balance = buckets.reduce((sum, b) => sum + Math.max(0, b.balance), 0)

  return (
    <div className="grid gap-6">
      <Card title="Saldo">
        <div className="grid gap-6 sm:grid-cols-2">
          <Stat
            label="Credits"
            value={creditFormat.format(balance)}
            hint={`Plan ${plan.name} · ${plan.maxConcurrentSessions} równoległych sesji`}
          />
          <Stat
            label="To wystarczy na"
            value={formatAirtime(
              estimateSeconds(balance, { targetLanguages: 0, voiceEnabled: false }),
            )}
            hint="samych napisów w języku źródłowym"
          />
        </div>

        <table className="mt-6 w-full text-sm">
          <tbody>
            {AIRTIME_PROFILES.map((profile) => (
              <tr key={profile.label} className="border-t border-line">
                <td className="py-2 text-muted">{profile.label}</td>
                <td className="py-2 text-right tabular-nums">
                  {creditFormat.format(burnRatePerMinute(profile.burn))} cr/min
                </td>
                <td className="py-2 text-right tabular-nums">
                  ≈ {formatAirtime(estimateSeconds(balance, profile.burn))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Skąd pochodzą credits">
        {buckets.length === 0 ? (
          <EmptyState>Brak credits na koncie.</EmptyState>
        ) : (
          <ul className="grid gap-2 text-sm">
            {buckets.map((bucket) => (
              <li key={bucket.bucket} className="flex justify-between border-b border-line pb-2">
                <span>{BUCKET_LABEL[bucket.bucket] ?? bucket.bucket}</span>
                <span className="tabular-nums">
                  {creditFormat.format(bucket.balance)} cr
                  {bucket.expiresAt
                    ? ` · ważne do ${dateFormat.format(new Date(bucket.expiresAt))}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Doładowanie">
        <ul className="grid gap-3 sm:grid-cols-3">
          {TOPUP_PACKS.map((pack) => (
            <li key={pack.code} className="rounded border border-line p-4">
              <div className="text-lg font-semibold">{pack.credits} cr</div>
              <div className="text-sm text-muted">{moneyFormat.format(pack.price.pln / 100)}</div>
              <div className="mt-1 text-xs text-muted">ważne 12 miesięcy</div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          Płatność obsługuje Paddle. Przycisk zakupu podpina zespół rozliczeń.
        </p>
      </Card>

      <Card title="Historia">
        {ledger.length === 0 ? (
          <EmptyState>Jeszcze nic się tu nie wydarzyło.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2">Data</th>
                <th className="py-2">Powód</th>
                <th className="py-2 text-right">Zmiana</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((entry) => (
                <tr key={entry.id} className="border-t border-line">
                  <td className="py-2 text-muted">{dateFormat.format(entry.createdAt)}</td>
                  <td className="py-2">{REASON_LABEL[entry.reason] ?? entry.reason}</td>
                  <td
                    className={`py-2 text-right tabular-nums ${
                      entry.delta < 0 ? 'text-muted' : 'text-accent'
                    }`}
                  >
                    {entry.delta > 0 ? '+' : ''}
                    {creditFormat.format(entry.delta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
