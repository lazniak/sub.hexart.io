import type { Metadata } from 'next'
import { desc, eq } from 'drizzle-orm'
import { captionSessions } from '@sub/db'
import { formatAirtime } from '@sub/billing'
import type { EndReason } from '@sub/contracts'
import { currentUser } from '@/lib/auth/session'
import { db } from '@/lib/server/db'
import { Card, EmptyState } from '../../_components/ui'

export const metadata: Metadata = { title: 'Sesje' }
export const dynamic = 'force-dynamic'

const dateFormat = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' })
const creditFormat = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 })

/** Keyed by the contract enum: a reason added upstream fails the build, not the UI. */
const END_REASON_LABEL: Record<EndReason, string> = {
  user: 'zakończona ręcznie',
  credits_exhausted: 'wyczerpane credits',
  idle_timeout: 'brak dźwięku',
  server_shutdown: 'restart serwera',
  protocol_error: 'błąd protokołu',
  upstream_error: 'awaria dostawcy',
  superseded: 'zastąpiona nową sesją',
}

export default async function SessionsPage() {
  const user = await currentUser()
  if (!user) return null

  const rows = await db()
    .select({
      id: captionSessions.id,
      srcLang: captionSessions.srcLang,
      dstLangs: captionSessions.dstLangs,
      voiceEnabled: captionSessions.voiceEnabled,
      creditsSpent: captionSessions.creditsSpent,
      billableSeconds: captionSessions.billableSeconds,
      endReason: captionSessions.endReason,
      startedAt: captionSessions.startedAt,
      endedAt: captionSessions.endedAt,
    })
    .from(captionSessions)
    .where(eq(captionSessions.userId, user.id))
    .orderBy(desc(captionSessions.startedAt))
    .limit(100)

  return (
    <Card title="Ostatnie sesje">
      {rows.length === 0 ? (
        <EmptyState>Nie masz jeszcze żadnej sesji. Zacznij od studia.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2">Start</th>
                <th className="py-2">Konfiguracja</th>
                <th className="py-2 text-right">Czas</th>
                <th className="py-2 text-right">Koszt</th>
                <th className="py-2">Zakończenie</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="py-2 text-muted">{dateFormat.format(row.startedAt)}</td>
                  <td className="py-2">
                    {row.srcLang}
                    {row.dstLangs.length > 0 ? ` → ${row.dstLangs.join(', ')}` : ''}
                    {row.voiceEnabled ? ' · lektor' : ''}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatAirtime(row.billableSeconds)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {creditFormat.format(Number(row.creditsSpent))} cr
                  </td>
                  <td className="py-2 text-muted">
                    {row.endedAt
                      ? (END_REASON_LABEL[row.endReason as EndReason] ?? row.endReason ?? '—')
                      : 'trwa'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
