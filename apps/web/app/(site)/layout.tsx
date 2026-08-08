import type { ReactNode } from 'react'
import { SiteFooter } from './components/site-footer'
import { SiteHeader } from './components/site-header'
import { SkipLink } from './components/skip-link'

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
