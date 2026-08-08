'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** PRODUCT.md §5 — four tabs, nothing more. Studio is a separate screen. */
const TABS = [
  { href: '/app', label: 'Credits' },
  { href: '/app/sessions', label: 'Sesje' },
  { href: '/app/glossary', label: 'Glosariusz' },
  { href: '/app/account', label: 'Konto' },
] as const

export function TabsNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Panel" className="flex gap-1 border-b border-line">
      {TABS.map((tab) => {
        const active = tab.href === '/app' ? pathname === '/app' : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-3 text-sm ${
              active ? 'border-accent text-paper' : 'border-transparent text-muted hover:text-paper'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
