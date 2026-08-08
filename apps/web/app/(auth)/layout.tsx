import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await currentUser()) redirect('/app')

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* Plain anchor: the landing page lives in the web-site lane, so it must
          not be a typed route dependency of this one. */}
      <a href="/" className="mb-8 text-sm text-muted hover:text-paper">
        sub.hexart.io
      </a>
      {children}
    </main>
  )
}
