import type { ReactNode } from 'react'
import { LegalNav } from '../(site)/components/legal-nav'
import { SiteFooter } from '../(site)/components/site-footer'
import { SiteHeader } from '../(site)/components/site-header'
import { SkipLink } from '../(site)/components/skip-link'

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <SkipLink />
      <SiteHeader />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 lg:flex lg:gap-12">
        <LegalNav />
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
      <SiteFooter />
    </div>
  )
}
