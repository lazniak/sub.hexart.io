import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import { billingProfiles, users } from '@sub/db'
import { planOf } from '@sub/billing'
import { currentUser } from '@/lib/auth/session'
import { db } from '@/lib/server/db'
import { Card } from '../../_components/ui'
import { ChangePasswordForm, DangerZone } from './account-forms'

export const metadata: Metadata = { title: 'Konto' }
export const dynamic = 'force-dynamic'

const dateFormat = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long' })

export default async function AccountPage() {
  const user = await currentUser()
  if (!user) return null

  const plan = planOf(user.planCode)
  const [account] = await db()
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  const [profile] = await db()
    .select({
      companyName: billingProfiles.companyName,
      vatId: billingProfiles.vatId,
      country: billingProfiles.country,
      city: billingProfiles.city,
    })
    .from(billingProfiles)
    .where(eq(billingProfiles.userId, user.id))
    .limit(1)

  return (
    <div className="grid gap-6">
      <Card title="Konto">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">E-mail</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt className="text-muted">Adres potwierdzony</dt>
            <dd>{user.emailVerifiedAt ? dateFormat.format(user.emailVerifiedAt) : 'nie'}</dd>
          </div>
          <div>
            <dt className="text-muted">Plan</dt>
            <dd>{plan.name}</dd>
          </div>
          <div>
            <dt className="text-muted">Konto od</dt>
            <dd>{account ? dateFormat.format(account.createdAt) : '—'}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Dane do faktury">
        {profile ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Firma</dt>
              <dd>{profile.companyName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">NIP / VAT ID</dt>
              <dd>{profile.vatId ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Kraj</dt>
              <dd>{profile.country}</dd>
            </div>
            <div>
              <dt className="text-muted">Miasto</dt>
              <dd>{profile.city ?? '—'}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted">
            Brak danych firmowych. Uzupełnisz je przy pierwszym zakupie — faktury wystawia Paddle.
          </p>
        )}
      </Card>

      <Card title="Hasło">
        <ChangePasswordForm />
      </Card>

      <Card title="Twoje dane">
        <p className="mb-4 text-sm text-muted">
          Audio i transkrypcje nie są przechowywane, więc nie ma ich w eksporcie. Zapisy księgowe
          zostają po usunięciu konta — wymagają tego przepisy podatkowe.
        </p>
        <DangerZone />
      </Card>
    </div>
  )
}
