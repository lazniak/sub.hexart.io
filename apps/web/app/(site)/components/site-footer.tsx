import Link from 'next/link'
import { COMPANY, LEGAL_DOCS } from './company'
import { Placeholder } from './placeholder'

const LINK = 'rounded-sm text-sm text-muted hover:text-paper'

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-ink-soft">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <section aria-labelledby="footer-operator">
          <h2 id="footer-operator" className="mb-3 text-sm font-semibold text-paper">
            Operator
          </h2>
          <address className="space-y-1.5 text-sm not-italic text-muted">
            <p className="text-paper">{COMPANY.legalName}</p>
            <p>
              Adres siedziby: <Placeholder what="adres siedziby" />
            </p>
            <p>
              KRS: <Placeholder what="KRS" />
            </p>
            <p>
              NIP: <Placeholder what="NIP" />
            </p>
            <p>
              REGON: <Placeholder what="REGON" />
            </p>
            <p>
              Kapitał zakładowy: <Placeholder what="kapitał zakładowy" />
            </p>
            <p>
              Sąd rejestrowy: <Placeholder what="sąd rejestrowy" />
            </p>
            <p>
              E-mail: <Placeholder what="adres e-mail kontaktowy" />
            </p>
          </address>
        </section>

        <nav aria-labelledby="footer-product">
          <h2 id="footer-product" className="mb-3 text-sm font-semibold text-paper">
            Produkt
          </h2>
          <ul className="space-y-2">
            <li>
              <Link href="/" className={LINK}>
                Strona główna
              </Link>
            </li>
            <li>
              <Link href="/pricing" className={LINK}>
                Cennik i doładowania
              </Link>
            </li>
            <li>
              <a href="/register" className={LINK}>
                Załóż konto
              </a>
            </li>
            <li>
              <a href="/login" className={LINK}>
                Zaloguj się
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-legal">
          <h2 id="footer-legal" className="mb-3 text-sm font-semibold text-paper">
            Dokumenty
          </h2>
          <ul className="space-y-2">
            {LEGAL_DOCS.map((doc) => (
              <li key={doc.slug}>
                <Link href={doc.href} className={LINK}>
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted">
          <p>
            © {COMPANY.legalName} · {COMPANY.productName}. Ceny podane są w kwotach netto; podatek
            VAT nalicza sprzedawca zgodnie z krajem nabywcy.
          </p>
        </div>
      </div>
    </footer>
  )
}
