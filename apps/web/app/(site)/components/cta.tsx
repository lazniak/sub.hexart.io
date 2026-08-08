import type { ReactNode } from 'react'

/**
 * Account routes belong to the `web-app` lane and do not exist yet, so these are
 * plain anchors rather than typed `next/link` hrefs.
 */
interface CtaProps {
  href: string
  children: ReactNode
  variant?: 'primary' | 'secondary'
}

const BASE =
  'inline-flex items-center justify-center rounded-md px-5 py-3 text-base font-semibold transition-colors'

const VARIANTS = {
  primary: 'bg-accent text-ink hover:bg-accent/85',
  secondary: 'border border-line text-paper hover:border-muted hover:bg-ink-soft',
} as const

export function Cta({ href, children, variant = 'primary' }: CtaProps) {
  return (
    <a href={href} className={`${BASE} ${VARIANTS[variant]}`}>
      {children}
    </a>
  )
}
