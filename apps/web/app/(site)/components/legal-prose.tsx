import type { ReactNode } from 'react'

/**
 * Typography for legal documents.
 *
 * Styling lives here as descendant selectors so the documents themselves stay
 * plain semantic HTML — easier to diff, easier for a lawyer to read in review.
 */
const PROSE = [
  'text-[0.975rem] leading-relaxed text-paper/90',
  '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-paper',
  '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-paper',
  '[&_p]:mb-4',
  '[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5',
  '[&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5',
  '[&_li>ul]:mt-2 [&_li>ol]:mt-2',
  '[&_dl]:mb-4 [&_dt]:mt-3 [&_dt]:font-semibold [&_dt]:text-paper [&_dd]:text-muted',
  '[&_strong]:font-semibold [&_strong]:text-paper',
  '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',
  '[&_table]:w-full [&_table]:min-w-[32rem] [&_table]:border-collapse [&_table]:text-sm',
  '[&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:align-top [&_th]:text-paper',
  '[&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top',
  '[&_caption]:mb-2 [&_caption]:text-left [&_caption]:text-sm [&_caption]:text-muted',
].join(' ')

export function LegalProse({ children }: { children: ReactNode }) {
  return <div className={PROSE}>{children}</div>
}

/** Wide tables must scroll inside their own box, never push the page sideways. */
export function ScrollableTable({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={`${label} — tabela przewijana w poziomie`}
      tabIndex={0}
      className="mb-6 overflow-x-auto rounded-lg border border-line"
    >
      {children}
    </div>
  )
}
