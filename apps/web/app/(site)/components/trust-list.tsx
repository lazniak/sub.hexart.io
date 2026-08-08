import Link from 'next/link'
import { COMPANY, RETENTION } from './company'

export function TrustList() {
  return (
    <ul className="space-y-3 text-sm text-muted">
      <li>
        <strong className="font-semibold text-paper">Nie zapisujemy Twojego audio.</strong>{' '}
        Przepływa przez nasz serwer i znika. Transkrypcje są domyślnie wyłączone; włączone żyją{' '}
        {RETENTION.transcriptHours} godziny.{' '}
        <Link href="/legal/prywatnosc" className="text-accent underline underline-offset-2">
          Polityka prywatności
        </Link>
        .
      </li>
      <li>
        <strong className="font-semibold text-paper">Serwery i baza w Unii Europejskiej.</strong>{' '}
        Serwer i baza danych stoją na jednej maszynie w Niemczech. Dostawcy spoza EOG są wymienieni
        z nazwy.{' '}
        <Link href="/legal/podprocesorzy" className="text-accent underline underline-offset-2">
          Lista podprocesorów
        </Link>
        .
      </li>
      <li>
        <strong className="font-semibold text-paper">Operator: {COMPANY.legalName}.</strong>{' '}
        Dokumenty sprzedaży z podatkiem VAT, anulowanie subskrypcji jednym kliknięciem w panelu, bez
        rozmowy z obsługą.
      </li>
    </ul>
  )
}
