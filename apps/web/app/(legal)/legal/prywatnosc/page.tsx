import type { Metadata } from 'next'
import Link from 'next/link'
import { TOPUP_VALIDITY_DAYS } from '@sub/billing'
import {
  COMPANY,
  MERCHANT_OF_RECORD,
  RETENTION,
  SUBPROCESSORS,
  legalDoc,
} from '../../../(site)/components/company'
import { LegalMeta } from '../../../(site)/components/legal-meta'
import { LegalProse, ScrollableTable } from '../../../(site)/components/legal-prose'
import { Placeholder } from '../../../(site)/components/placeholder'

const DOC = legalDoc('prywatnosc')

export const metadata: Metadata = {
  title: 'Polityka prywatności',
  description:
    'Informacja z art. 13 RODO: jakie dane przetwarzamy, na jakiej podstawie, jak długo i komu je powierzamy. Audio nie jest zapisywane.',
}

interface PurposeRow {
  purpose: string
  data: string
  basis: string
  retention: string
}

const PURPOSES: PurposeRow[] = [
  {
    purpose: 'Prowadzenie Konta i świadczenie Usługi',
    data: 'Adres e-mail, skrót hasła, ustawienia konta, sekret drugiego składnika (zaszyfrowany)',
    basis: 'art. 6 ust. 1 lit. b RODO — wykonanie umowy',
    retention: `Przez czas posiadania Konta i ${RETENTION.accountAfterDeletionDays} dni po jego usunięciu`,
  },
  {
    purpose: 'Rozliczenie zużycia Credits i obsługa płatności',
    data: 'Salda i historia Credits, metadane sesji (czas trwania, języki, koszt), dane do faktury',
    basis:
      'art. 6 ust. 1 lit. b RODO — wykonanie umowy; art. 6 ust. 1 lit. c RODO — obowiązki podatkowe i rachunkowe',
    retention: `Rejestr Credits — ${RETENTION.ledgerYears} lat; metadane sesji — ${RETENTION.sessionMetadataMonths} miesięcy`,
  },
  {
    purpose: 'Przetwarzanie mowy w celu wygenerowania napisów i tłumaczenia',
    data: 'Strumień audio przetwarzany w locie oraz powstający z niego tekst',
    basis: 'art. 6 ust. 1 lit. b RODO — wykonanie umowy',
    retention:
      'Audio nie jest zapisywane. Transkrypcja domyślnie nie jest zapisywana; po włączeniu opcji — ' +
      `${RETENTION.transcriptHours} godziny`,
  },
  {
    purpose: 'Bezpieczeństwo, limity zapytań, przeciwdziałanie nadużyciom',
    data: 'Skróty adresów IP, identyfikatory sesji, logi techniczne, rejestr zdarzeń',
    basis:
      'art. 6 ust. 1 lit. f RODO — prawnie uzasadniony interes polegający na ochronie usługi i jej użytkowników',
    retention: `Logi techniczne — ${RETENTION.technicalLogsDays} dni; rejestr zdarzeń — ${RETENTION.ledgerYears} lat`,
  },
  {
    purpose: 'Obsługa reklamacji i dochodzenie roszczeń',
    data: 'Korespondencja, dane Konta, dane rozliczeniowe',
    basis:
      'art. 6 ust. 1 lit. c RODO — obowiązek rozpatrzenia reklamacji; art. 6 ust. 1 lit. f RODO — ustalenie i obrona roszczeń',
    retention: 'Do upływu terminów przedawnienia roszczeń',
  },
  {
    purpose: 'Powiadomienia o istotnych zmianach dokumentów i usługi',
    data: 'Adres e-mail',
    basis: 'art. 6 ust. 1 lit. c RODO — obowiązek informacyjny wynikający z przepisów',
    retention: 'Przez czas posiadania Konta',
  },
]

export default function PrivacyPage() {
  return (
    <article>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-paper sm:text-3xl">
        Polityka prywatności
      </h1>

      <LegalMeta version={DOC.version} />

      <LegalProse>
        <p>
          Dokument realizuje obowiązek informacyjny z art. 13 rozporządzenia (UE) 2016/679 (RODO) i
          opisuje, jakie dane osobowe przetwarzamy w związku z {COMPANY.productName}, po co, na
          jakiej podstawie prawnej, jak długo i komu je powierzamy.
        </p>

        <h2 id="administrator">1. Administrator i kontakt</h2>
        <p>
          Administratorem danych jest {COMPANY.legalName}, adres siedziby:{' '}
          <Placeholder what="adres siedziby" />, KRS: <Placeholder what="KRS" />, NIP:{' '}
          <Placeholder what="NIP" />.
        </p>
        <p>
          Kontakt w sprawach danych osobowych:{' '}
          <Placeholder what="adres e-mail do spraw danych osobowych" />.
        </p>
        <p>
          Inspektor ochrony danych: <Placeholder what="informacja, czy IOD został wyznaczony" />.
        </p>

        <h2 id="audio">2. Audio — nie jest zapisywane</h2>
        <p>
          <strong>{RETENTION.audio}</strong> Dźwięk z mikrofonu przechodzi przez nasz serwer w
          ramkach dwudziestomilisekundowych, trafia do dostawcy rozpoznawania mowy i po
          przetworzeniu jest odrzucany. Nie tworzymy nagrań, nie budujemy z nich zbiorów, nie
          używamy ich do trenowania modeli i nie mamy technicznej możliwości odtworzenia przebiegu
          sesji z dźwięku.
        </p>
        <p>
          Transkrypcje są <strong>domyślnie wyłączone</strong>. Jeżeli Użytkownik świadomie włączy
          opcję zapisu transkryptu, tekst jest przechowywany przez{' '}
          <strong>{RETENTION.transcriptHours} godziny</strong> i po tym czasie usuwany zadaniem
          czyszczącym. Opcję można wyłączyć w każdej chwili, a zapisany transkrypt usunąć wcześniej
          w panelu.
        </p>
        <p>
          Jeżeli w mowie znajdą się dane szczególnych kategorii (art. 9 RODO), przetwarzanie ich
          dotyczy wyłącznie tego przelotu i nie prowadzi do utrwalenia. Odpowiedzialność za podstawę
          prawną nagrywania i przetwarzania mowy osób trzecich spoczywa na Użytkowniku — dla
          klientów biznesowych regulują to{' '}
          <Link href="/legal/dpa">warunki powierzenia przetwarzania</Link>.
        </p>

        <h2 id="cele">3. Cele, podstawy prawne i okresy przechowywania</h2>
        <ScrollableTable label="Cele i podstawy przetwarzania">
          <table>
            <caption>
              Zestawienie czynności przetwarzania prowadzonych przez administratora.
            </caption>
            <thead>
              <tr>
                <th scope="col">Cel</th>
                <th scope="col">Zakres danych</th>
                <th scope="col">Podstawa prawna</th>
                <th scope="col">Okres przechowywania</th>
              </tr>
            </thead>
            <tbody>
              {PURPOSES.map((row) => (
                <tr key={row.purpose}>
                  <th scope="row">{row.purpose}</th>
                  <td>{row.data}</td>
                  <td>{row.basis}</td>
                  <td>{row.retention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
        <p>
          Dane rozliczeniowe związane z zakupem Credits przechowujemy przez okres wymagany
          przepisami podatkowymi; ważność samych Credits z doładowań wynosi {TOPUP_VALIDITY_DAYS}{' '}
          dni i nie wpływa na te terminy.
        </p>

        <h2 id="zrodlo">4. Źródło danych i dobrowolność</h2>
        <p>
          Dane pochodzą bezpośrednio od Użytkownika: z formularza rejestracji, z ustawień konta, z
          konfiguracji sesji oraz z korespondencji. Podanie adresu e-mail jest warunkiem założenia
          Konta; podanie danych do faktury jest warunkiem zakupu. Brak ich podania uniemożliwia
          zawarcie lub wykonanie umowy.
        </p>
        <p>
          Przy logowaniu dostawcą tożsamości otrzymujemy od niego adres e-mail i identyfikator konta
          — nic ponadto.
        </p>

        <h2 id="odbiorcy">5. Odbiorcy danych i podprocesorzy</h2>
        <p>
          Dane powierzamy wyłącznie podmiotom, które przetwarzają je na nasze udokumentowane
          polecenie, na podstawie umów zawartych zgodnie z art. 28 RODO. Pełny wykaz wraz z
          zakresem, lokalizacją i podstawą transferu znajduje się na stronie{' '}
          <Link href="/legal/podprocesorzy">Podprocesorzy</Link>.
        </p>
        <ul>
          {SUBPROCESSORS.map((entry) => (
            <li key={entry.name}>
              <strong>{entry.name}</strong> — {entry.purpose}
            </li>
          ))}
        </ul>
        <p>
          {MERCHANT_OF_RECORD.name} występuje wobec Użytkownika jako sprzedawca i jest{' '}
          <strong>odrębnym administratorem</strong> danych płatniczych. Zasady przetwarzania po
          stronie tego podmiotu określa jego własna polityka prywatności.
        </p>
        <p>
          Dane mogą zostać udostępnione organom publicznym, gdy obowiązek taki wynika z przepisów
          prawa. Nie sprzedajemy danych i nie udostępniamy ich w celach marketingowych.
        </p>

        <h2 id="transfer">6. Przekazywanie danych poza Europejski Obszar Gospodarczy</h2>
        <p>
          Rozpoznawanie mowy, synteza głosu i tłumaczenie maszynowe wymagają skorzystania z
          dostawców mających siedzibę w Stanach Zjednoczonych. Transfer odbywa się na podstawie{' '}
          <strong>standardowych klauzul umownych</strong> przyjętych decyzją wykonawczą Komisji (UE)
          2021/914, uzupełnionych oceną skutków transferu i środkami dodatkowymi: szyfrowaniem w
          tranzycie, minimalizacją zakresu (do dostawcy trafia strumień mowy i tekst, nigdy dane
          Konta) oraz brakiem retencji po stronie Operatora.
        </p>
        <p>
          Tam, gdzie dostawca posiada certyfikację w ramach EU-US Data Privacy Framework, transfer
          opiera się dodatkowo na decyzji Komisji o odpowiednim stopniu ochrony.{' '}
          <Placeholder what="status certyfikacji DPF poszczególnych dostawców na dzień publikacji" />
        </p>
        <p>
          Baza danych, pamięć podręczna i serwer przetwarzający dźwięk działają w Unii Europejskiej.
          Kopię zabezpieczeń transferu można uzyskać, pisząc na adres kontaktowy do spraw danych
          osobowych.
        </p>

        <h2 id="prawa">7. Prawa osoby, której dane dotyczą</h2>
        <p>Przysługuje Ci prawo do:</p>
        <ul>
          <li>dostępu do danych i uzyskania ich kopii (art. 15 RODO),</li>
          <li>sprostowania danych nieprawidłowych lub niekompletnych (art. 16 RODO),</li>
          <li>usunięcia danych (art. 17 RODO), z zastrzeżeniem obowiązków podatkowych,</li>
          <li>ograniczenia przetwarzania (art. 18 RODO),</li>
          <li>
            przenoszenia danych przetwarzanych na podstawie umowy, w formacie nadającym się do
            odczytu maszynowego (art. 20 RODO) — eksport dostępny samodzielnie w panelu,
          </li>
          <li>
            sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie, z przyczyn
            związanych z Twoją szczególną sytuacją (art. 21 RODO),
          </li>
          <li>
            cofnięcia zgody w każdej chwili, bez wpływu na zgodność z prawem przetwarzania
            dokonanego przed cofnięciem — tam, gdzie podstawą jest zgoda.
          </li>
        </ul>
        <p>
          Wniosek realizujemy bez zbędnej zwłoki, nie później niż w ciągu miesiąca. Termin może
          zostać przedłużony o dwa miesiące przy wnioskach złożonych lub licznych — poinformujemy o
          tym wraz z uzasadnieniem.
        </p>
        <p>
          Masz prawo wniesienia skargi do organu nadzorczego — w Polsce jest nim Prezes Urzędu
          Ochrony Danych Osobowych, ul. Stawki 2, 00-193 Warszawa.
        </p>

        <h2 id="decyzje">8. Zautomatyzowane decyzje i profilowanie</h2>
        <p>
          Nie podejmujemy wobec Ciebie decyzji opartych wyłącznie na zautomatyzowanym przetwarzaniu,
          które wywoływałyby skutki prawne lub w podobny sposób istotnie na Ciebie wpływały (art. 22
          RODO). Nie profilujemy użytkowników i nie prowadzimy reklamy behawioralnej.
        </p>
        <p>
          Automatyczne jest natomiast samo działanie usługi: rozpoznanie mowy, tłumaczenie i synteza
          głosu wykonują modele sztucznej inteligencji. Ich wynik nie jest decyzją dotyczącą osoby —
          jest przetworzeniem treści.
        </p>

        <h2 id="bezpieczenstwo">9. Bezpieczeństwo</h2>
        <ul>
          <li>szyfrowanie połączeń (TLS) i strumienia audio między przeglądarką a serwerem,</li>
          <li>
            hasła przechowywane jako skróty argon2id, opcjonalne uwierzytelnianie dwuskładnikowe,
          </li>
          <li>klucze dostawców wyłącznie po stronie serwera, szyfrowane w spoczynku,</li>
          <li>
            token Projektora jest odrębny, tylko do odczytu i nie daje żadnych uprawnień do Konta —
            może więc bez ryzyka trafić na wizję,
          </li>
          <li>
            rozdzielenie środowisk, ograniczanie liczby zapytań, rejestr zdarzeń administracyjnych,
          </li>
          <li>
            zakaz logowania treści audio, transkrypcji, tokenów i adresów e-mail w postaci jawnej.
          </li>
        </ul>
        <p>
          Naruszenie ochrony danych zgłaszamy organowi nadzorczemu w ciągu 72 godzin od
          stwierdzenia, a osobom, których dane dotyczą — bez zbędnej zwłoki, gdy naruszenie może
          powodować wysokie ryzyko dla ich praw i wolności.
        </p>

        <h2 id="cookies">10. Pliki cookies</h2>
        <p>
          Stosujemy wyłącznie pliki niezbędne do działania serwisu. Szczegóły opisuje{' '}
          <Link href="/legal/cookies">Polityka cookies</Link>.
        </p>

        <h2 id="zmiany">11. Zmiany polityki</h2>
        <p>
          O istotnych zmianach informujemy pocztą elektroniczną i komunikatem w panelu co najmniej
          14 dni przed ich wejściem w życie. Wersja obowiązująca jest zawsze opublikowana na tej
          stronie wraz z numerem i datą wejścia w życie.
        </p>
      </LegalProse>
    </article>
  )
}
