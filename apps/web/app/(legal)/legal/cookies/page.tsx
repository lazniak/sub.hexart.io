import type { Metadata } from 'next'
import Link from 'next/link'
import { COMPANY, MERCHANT_OF_RECORD, legalDoc } from '../../../(site)/components/company'
import { LegalMeta } from '../../../(site)/components/legal-meta'
import { LegalProse, ScrollableTable } from '../../../(site)/components/legal-prose'
import { Placeholder } from '../../../(site)/components/placeholder'

const DOC = legalDoc('cookies')

export const metadata: Metadata = {
  title: 'Polityka cookies',
  description:
    'Jakie pliki cookies i jaką pamięć lokalną stosuje sub.hexart.io. Wyłącznie mechanizmy niezbędne — bez analityki i bez marketingu.',
}

interface CookieRow {
  name: string
  purpose: string
  type: string
  lifetime: string
}

/**
 * Only mechanisms the application actually sets. A cookie listed here that no code
 * writes is a false statement in a published document, so nothing goes on this list
 * on the strength of a plan. There is deliberately no CSRF-token cookie: cross-site
 * request forgery is held off by `SameSite=Lax` on the session cookie itself
 * (apps/web/lib/auth/session.ts). If a token cookie is ever introduced, it is added
 * here in the same change.
 */
const COOKIES: CookieRow[] = [
  {
    name: 'Cookie sesji zalogowanego użytkownika',
    purpose:
      'Utrzymanie zalogowania między żądaniami oraz — dzięki atrybutowi SameSite=Lax — ochrona przed sfałszowaniem żądania z innej witryny. Bez niego panel i studio nie działają.',
    type: 'Niezbędne, własne, HttpOnly, Secure, SameSite=Lax',
    lifetime: 'Do wylogowania, nie dłużej niż 30 dni',
  },
  {
    name: 'Pamięć lokalna ustawień studia',
    purpose:
      'Zapamiętanie wybranego mikrofonu, języków i stylu napisów, żeby nie ustawiać ich za każdym razem.',
    type: 'Niezbędne do funkcji wybranej przez użytkownika, localStorage, nie jest wysyłane na serwer',
    lifetime: 'Do wyczyszczenia danych przeglądarki',
  },
  {
    name: `Mechanizmy koszyka ${MERCHANT_OF_RECORD.name}`,
    purpose:
      'Obsługa procesu płatności i wykrywanie nadużyć po stronie sprzedawcy. Ustawiane dopiero po otwarciu koszyka.',
    type: 'Podmiotu trzeciego, niezbędne do realizacji transakcji',
    lifetime: 'Zgodnie z polityką sprzedawcy',
  },
]

export default function CookiesPage() {
  return (
    <article>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-paper sm:text-3xl">
        Polityka cookies
      </h1>

      <LegalMeta version={DOC.version} />

      <LegalProse>
        <p>
          Dokument opisuje przechowywanie informacji w urządzeniu końcowym użytkownika i dostęp do
          nich, zgodnie z art. 173 ustawy Prawo telekomunikacyjne oraz z dyrektywą 2002/58/WE.
          Administratorem serwisu jest {COMPANY.legalName}.
        </p>

        <h2 id="zasada">1. Zasada</h2>
        <p>
          <strong>
            Stosujemy wyłącznie mechanizmy niezbędne do świadczenia usługi żądanej przez
            użytkownika.
          </strong>{' '}
          Nie używamy cookies analitycznych, statystycznych, reklamowych ani śledzących. Nie
          osadzamy skryptów zewnętrznych na stronie informacyjnej, w panelu i w studiu. Dlatego nie
          wyświetlamy okna zgody na cookies — dla plików niezbędnych zgoda nie jest wymagana.
        </p>
        <p>
          Strona Projektora, wpinana do oprogramowania transmisyjnego, nie zapisuje żadnych plików
          cookies i nie ładuje żadnych zasobów zewnętrznych.
        </p>

        <h2 id="wykaz">2. Wykaz stosowanych mechanizmów</h2>
        <ScrollableTable label="Wykaz plików cookies i pamięci lokalnej">
          <table>
            <caption>Stan na dzień wersji dokumentu wskazanej powyżej.</caption>
            <thead>
              <tr>
                <th scope="col">Mechanizm</th>
                <th scope="col">Cel</th>
                <th scope="col">Rodzaj</th>
                <th scope="col">Czas przechowywania</th>
              </tr>
            </thead>
            <tbody>
              {COOKIES.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td>{row.purpose}</td>
                  <td>{row.type}</td>
                  <td>{row.lifetime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
        <p>
          Dokładne nazwy techniczne plików ustala biblioteka uwierzytelniania i mogą się zmienić po
          jej aktualizacji:{' '}
          <Placeholder what="nazwy techniczne cookies po wdrożeniu warstwy auth" />
        </p>

        <h2 id="zarzadzanie">3. Zarządzanie</h2>
        <p>
          Przechowywaniem plików cookies można zarządzać w ustawieniach przeglądarki: zablokować je,
          ograniczyć do wybranych witryn albo usunąć już zapisane. Zablokowanie plików niezbędnych
          uniemożliwi zalogowanie się i korzystanie ze studia — nie da się utrzymać sesji bez
          zapisania jej identyfikatora.
        </p>
        <p>
          Wyczyszczenie pamięci lokalnej przeglądarki usuwa zapamiętane ustawienia studia. Konto,
          saldo Credits i historia sesji pozostają nienaruszone, ponieważ są przechowywane po
          stronie serwera.
        </p>

        <h2 id="zmiany">4. Zmiany</h2>
        <p>
          Wprowadzenie jakiegokolwiek mechanizmu innego niż niezbędny wymagałoby uprzedniej zgody
          użytkownika i aktualizacji tego dokumentu. O takiej zmianie poinformujemy z wyprzedzeniem
          14 dni, na zasadach opisanych w <Link href="/legal/regulamin">Regulaminie</Link>.
        </p>
        <p>
          Szerszy opis przetwarzania danych osobowych zawiera{' '}
          <Link href="/legal/prywatnosc">Polityka prywatności</Link>.
        </p>
      </LegalProse>
    </article>
  )
}
