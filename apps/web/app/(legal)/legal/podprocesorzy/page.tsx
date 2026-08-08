import type { Metadata } from 'next'
import Link from 'next/link'
import { COMPANY, SUBPROCESSORS, legalDoc } from '../../../(site)/components/company'
import { LegalMeta } from '../../../(site)/components/legal-meta'
import { LegalProse, ScrollableTable } from '../../../(site)/components/legal-prose'
import { Placeholder } from '../../../(site)/components/placeholder'

const DOC = legalDoc('podprocesorzy')

export const metadata: Metadata = {
  title: 'Podprocesorzy',
  description:
    'Wykaz podmiotów przetwarzających dane w imieniu hexart Sp. z o.o., z zakresem, lokalizacją i podstawą transferu.',
}

export default function SubprocessorsPage() {
  return (
    <article>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-paper sm:text-3xl">
        Wykaz podprocesorów
      </h1>

      <LegalMeta version={DOC.version} />

      <LegalProse>
        <p>
          Wykaz realizuje obowiązek przejrzystości z art. 28 ust. 2 RODO. Wymienione podmioty
          przetwarzają dane osobowe wyłącznie na udokumentowane polecenie {COMPANY.legalName}, w
          zakresie niezbędnym do świadczenia usługi i na podstawie zawartych umów powierzenia.
        </p>

        <h2 id="wykaz">1. Podmioty</h2>
        <ScrollableTable label="Wykaz podprocesorów">
          <table>
            <caption>Stan na dzień wersji dokumentu wskazanej powyżej.</caption>
            <thead>
              <tr>
                <th scope="col">Podmiot</th>
                <th scope="col">Zakres przetwarzania</th>
                <th scope="col">Lokalizacja</th>
                <th scope="col">Podstawa transferu</th>
                <th scope="col">Jakie dane</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((entry) => (
                <tr key={entry.name}>
                  <th scope="row">{entry.name}</th>
                  <td>{entry.purpose}</td>
                  <td>{entry.location}</td>
                  <td>{entry.transferBasis}</td>
                  <td>{entry.dataScope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
        <p>
          Pełne nazwy rejestrowe, adresy i numery identyfikacyjne podprocesorów zostaną uzupełnione
          po podpisaniu umów powierzenia:{' '}
          <Placeholder what="dane rejestrowe podprocesorów z zawartych umów powierzenia" />
        </p>

        <h2 id="audio">2. Czego podprocesorzy nie otrzymują</h2>
        <ul>
          <li>
            <strong>Nagrań audio</strong> — nie powstają. Dostawca rozpoznawania mowy otrzymuje
            strumień w locie i nie przechowuje go na nasze zlecenie, a my nie przechowujemy go w
            ogóle.
          </li>
          <li>
            <strong>Haseł</strong> — przechowujemy wyłącznie skróty kryptograficzne, których nie
            przekazujemy nikomu.
          </li>
          <li>
            <strong>Kompletu danych</strong> — dostawca tłumaczenia otrzymuje tekst bez powiązania z
            tożsamością Użytkownika, dostawca płatności otrzymuje dane rozliczeniowe bez treści
            sesji.
          </li>
        </ul>

        <h2 id="zmiany">3. Zmiany wykazu</h2>
        <ol>
          <li>
            O zamiarze dodania lub zastąpienia podprocesora informujemy{' '}
            <strong>co najmniej 14 dni przed zmianą</strong> — pocztą elektroniczną do klientów
            biznesowych oraz przez aktualizację tej strony wraz z podniesieniem numeru wersji.
          </li>
          <li>
            Klient biznesowy będący administratorem danych może w tym terminie wnieść uzasadniony
            sprzeciw na adres <Placeholder what="adres e-mail do spraw danych osobowych" />.
          </li>
          <li>
            Jeżeli sprzeciwu nie da się uwzględnić bez rezygnacji ze zmiany, klient może
            wypowiedzieć umowę ze skutkiem na dzień wejścia zmiany w życie, a niewykorzystane
            Credits z doładowań podlegają zwrotowi proporcjonalnemu.
          </li>
        </ol>

        <h2 id="powiazane">4. Dokumenty powiązane</h2>
        <ul>
          <li>
            <Link href="/legal/prywatnosc">Polityka prywatności</Link> — pełna informacja z art. 13
            RODO.
          </li>
          <li>
            <Link href="/legal/dpa">Umowa powierzenia przetwarzania</Link> — warunki dla klientów
            biznesowych.
          </li>
          <li>
            <Link href="/legal/regulamin">Regulamin</Link> — zasady świadczenia usługi.
          </li>
        </ul>
      </LegalProse>
    </article>
  )
}
