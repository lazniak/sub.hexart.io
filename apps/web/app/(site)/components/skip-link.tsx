/** First tab stop on every page — the site sells accessibility, so it starts here. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-ink"
    >
      Przejdź do treści
    </a>
  )
}
