import Link from 'next/link'
import { redirect } from 'next/navigation'
import { planOf } from '@sub/billing'
import { currentUser } from '@/lib/auth/session'
import { TabsNav } from './_components/tabs-nav'
import { LogoutButton } from './_components/logout-button'

export const dynamic = 'force-dynamic'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // The middleware only sees the cookie; this is the check that actually resolves it.
  const user = await currentUser()
  if (!user) redirect('/login')

  const plan = planOf(user.planCode)

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <Link href="/app" className="font-semibold">
          sub.hexart.io
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted">
            {user.email} · plan {plan.name}
          </span>
          <Link href="/app/studio" className="rounded bg-accent px-3 py-2 font-medium text-ink">
            Studio
          </Link>
          <LogoutButton />
        </div>
      </header>

      {user.emailVerifiedAt ? null : (
        <div className="mb-4 rounded border border-warn px-3 py-2 text-sm text-warn">
          Potwierdź adres e-mail, żeby odebrać darmowe credits i uruchomić sesję.{' '}
          <Link href="/verify" className="underline">
            Wyślij link ponownie
          </Link>
        </div>
      )}

      <TabsNav />
      <main className="flex-1 py-6">{children}</main>
    </div>
  )
}
