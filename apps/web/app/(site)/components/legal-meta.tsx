import { Placeholder } from './placeholder'

interface LegalMetaProps {
  version: string
  /** Set once the document has been reviewed by counsel and published. */
  reviewed?: boolean
}

/**
 * Version stamp shown at the top of every legal document. The effective date is a
 * placeholder until the entity paperwork and the counsel review are done
 * (docs/LEGAL.md §7) — an invented date on a binding document is worse than none.
 */
export function LegalMeta({ version, reviewed = false }: LegalMetaProps) {
  return (
    <div className="mb-8 space-y-3 rounded-lg border border-line bg-ink-soft p-4 text-sm">
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <dt className="text-muted">W mocy od</dt>
          <dd className="mt-1">
            <Placeholder what="data wejścia w życie" />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Wersja dokumentu</dt>
          <dd className="mt-1 font-mono text-paper">{version}</dd>
        </div>
        <div>
          <dt className="text-muted">Wersja wiążąca</dt>
          <dd className="mt-1 text-paper">polska</dd>
        </div>
      </dl>

      {reviewed ? null : (
        <p className="border-t border-line pt-3 text-warn">
          Projekt dokumentu. Treść czeka na weryfikację przez radcę prawnego i uzupełnienie danych
          rejestrowych operatora. Do czasu publikacji wersji oznaczonej datą wejścia w życie nie
          stanowi wiążącego wzorca umownego.
        </p>
      )}
    </div>
  )
}
