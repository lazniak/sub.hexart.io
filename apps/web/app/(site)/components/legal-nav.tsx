'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LEGAL_DOCS } from './company'

export function LegalNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Dokumenty prawne" className="mb-10 lg:mb-0 lg:w-64 lg:shrink-0">
      {/* Styled as a heading but not one: the nav precedes the document h1 in DOM order. */}
      <p className="mb-3 text-sm font-semibold text-paper">Dokumenty</p>
      <ul className="space-y-1">
        {LEGAL_DOCS.map((doc) => {
          const current = pathname === doc.href
          return (
            <li key={doc.slug}>
              <Link
                href={doc.href}
                aria-current={current ? 'page' : undefined}
                className={`block rounded-md px-3 py-2 text-sm ${
                  current
                    ? 'bg-ink-soft font-semibold text-accent'
                    : 'text-muted hover:bg-ink-soft hover:text-paper'
                }`}
              >
                {doc.title}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
