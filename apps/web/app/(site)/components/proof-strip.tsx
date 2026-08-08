/**
 * Static illustration of the projector layer, not a recording and not a live feed.
 * The caption text is a fixed example so nothing here can be read as a measurement.
 */
export function ProofStrip() {
  return (
    <figure className="rounded-lg border border-line bg-ink-soft p-4">
      <div className="rounded-md border border-line bg-[repeating-conic-gradient(var(--color-ink)_0%_25%,var(--color-ink-soft)_0%_50%)] bg-[length:24px_24px] p-6 sm:p-10">
        <div className="mx-auto max-w-xl space-y-2 text-center">
          <p className="text-lg font-semibold leading-snug text-paper sm:text-2xl">
            Dzisiaj pokażę wam nowy setup.
          </p>
          <p className="text-base leading-snug text-accent sm:text-xl">
            Today I&apos;ll show you my new setup.
          </p>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-muted">
        Tak wygląda warstwa napisów wklejona do OBS jako Browser Source: przezroczyste tło, u góry
        język źródłowy, pod spodem tłumaczenie. Szachownica oznacza przezroczystość, nie jest
        częścią obrazu. Ilustracja statyczna — nie jest nagraniem ani transmisją na żywo.
      </figcaption>
    </figure>
  )
}
