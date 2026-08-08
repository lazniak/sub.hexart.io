import Link from 'next/link'

const LINK = 'rounded-sm px-1 py-0.5 text-sm text-paper hover:text-accent'

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4">
        <Link href="/" className="rounded-sm text-base font-semibold tracking-tight text-paper">
          sub.<span className="text-accent">hexart</span>.io
        </Link>

        <nav aria-label="Nawigacja główna">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <li>
              <Link href="/pricing" className={LINK}>
                Cennik
              </Link>
            </li>
            <li>
              <a href="/login" className={LINK}>
                Zaloguj
              </a>
            </li>
            <li>
              <a
                href="/register"
                className="inline-flex items-center rounded-md bg-accent px-3 py-2 text-sm font-semibold text-ink hover:bg-accent/85"
              >
                Wypróbuj za darmo
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
