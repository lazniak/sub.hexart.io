'use client'

import { useEffect } from 'react'

/**
 * Root error boundary. The projector has its own override that renders nothing —
 * this page must never reach a surface that is being broadcast.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The digest is the only safe correlator; the message may carry user data.
    console.error('unhandled render error', error.digest)
  }, [error])

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Coś poszło nie tak</h1>
      <p className="text-[var(--color-muted)]">
        Spróbuj ponownie. Jeśli problem wraca, napisz na kontakt@hexart.pl
        {error.digest ? ` i podaj kod ${error.digest}.` : '.'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="w-fit rounded border border-[var(--color-line)] px-4 py-2 hover:border-[var(--color-accent)]"
      >
        Spróbuj ponownie
      </button>
    </main>
  )
}
