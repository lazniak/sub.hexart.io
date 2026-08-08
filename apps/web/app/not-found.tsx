import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <p className="font-mono text-sm text-[var(--color-muted)]">404</p>
      <h1 className="text-2xl font-semibold">Nie ma takiej strony</h1>
      <p className="text-[var(--color-muted)]">Link mógł wygasnąć albo zawierać literówkę.</p>
      <Link href="/" className="w-fit text-[var(--color-accent)] underline underline-offset-4">
        Wróć na stronę główną
      </Link>
    </main>
  )
}
