import type { Metadata } from 'next'
import Link from 'next/link'
import { COMPANY, RETENTION, legalDoc } from '../../../(site)/components/company'
import { LegalMeta } from '../../../(site)/components/legal-meta'
import { LegalProse } from '../../../(site)/components/legal-prose'
import { Placeholder } from '../../../(site)/components/placeholder'

const DOC = legalDoc('dpa')

export const metadata: Metadata = {
  title: 'Umowa powierzenia przetwarzania (DPA)',
  description:
    'Warunki powierzenia przetwarzania danych osobowych zgodne z art. 28 RODO dla klientów biznesowych sub.hexart.io.',
}

export default function DpaPage() {
  return (
    <article>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-paper sm:text-3xl">
        Umowa powierzenia przetwarzania danych osobowych
      </h1>

      <LegalMeta version={DOC.version} />

      <LegalProse>
        <p>
          Dokument określa warunki powierzenia przetwarzania danych osobowych zgodnie z art. 28
          rozporządzenia (UE) 2016/679 (RODO). Ma zastosowanie do klientów biznesowych, którzy
          przetwarzają w usłudze dane osobowe osób trzecich — na przykład wypowiedzi prelegentów i
          uczestników wydarzenia.
        </p>

        <h2 id="role">1. Role stron</h2>
        <ul>
          <li>
            <strong>Administrator</strong> — klient biznesowy. To on decyduje, czyja mowa trafia do
            usługi, w jakim celu i na jakiej podstawie prawnej, oraz wykonuje wobec tych osób
            obowiązki informacyjne.
          </li>
          <li>
            <strong>Podmiot przetwarzający</strong> — {COMPANY.legalName}, działający wyłącznie na
            udokumentowane polecenie Administratora.
          </li>
          <li>
            W zakresie danych Konta i danych rozliczeniowych {COMPANY.legalName} pozostaje
            samodzielnym administratorem; opisuje to{' '}
            <Link href="/legal/prywatnosc">Polityka prywatności</Link>.
          </li>
        </ul>
        <p>
          Użytkownik indywidualny, który przetwarza wyłącznie własną mowę, nie potrzebuje tej umowy.
        </p>

        <h2 id="przedmiot">2. Przedmiot, czas, charakter i cel przetwarzania</h2>
        <ul>
          <li>
            <strong>Przedmiot:</strong> przetwarzanie treści mowy przekazanej do usługi w celu
            wygenerowania napisów, ich tłumaczenia maszynowego i opcjonalnego odczytania
            syntezatorem mowy.
          </li>
          <li>
            <strong>Charakter:</strong> przetwarzanie zautomatyzowane, w czasie rzeczywistym, w
            trybie przepływowym, bez trwałego utrwalania dźwięku.
          </li>
          <li>
            <strong>Cel:</strong> wykonanie usługi zamówionej przez Administratora.
          </li>
          <li>
            <strong>Czas:</strong> na czas obowiązywania umowy o świadczenie usługi; polecenia
            przetwarzania wygasają wraz z zakończeniem sesji.
          </li>
        </ul>

        <h2 id="kategorie">3. Kategorie danych i osób</h2>
        <ul>
          <li>
            <strong>Kategorie osób:</strong> osoby, których mowa jest przekazywana do usługi —
            prelegenci, prowadzący, uczestnicy wydarzeń, a także użytkownicy końcowi wskazani przez
            Administratora.
          </li>
          <li>
            <strong>Kategorie danych:</strong> treść wypowiedzi oraz cechy głosu w zakresie
            niezbędnym do rozpoznania mowy; opcjonalnie tekst transkrypcji, jeżeli Administrator
            włączy jej zapis.
          </li>
          <li>
            <strong>Dane szczególnych kategorii:</strong> usługa nie jest przeznaczona do ich
            przetwarzania. Jeżeli pojawią się w wypowiedzi, przetwarzanie ogranicza się do przelotu
            i nie prowadzi do utrwalenia. Odpowiedzialność za dopuszczalność takiego przetwarzania
            spoczywa na Administratorze.
          </li>
        </ul>

        <h2 id="obowiazki">4. Obowiązki podmiotu przetwarzającego (art. 28 ust. 3 RODO)</h2>
        <ol>
          <li>
            Przetwarzamy dane wyłącznie na udokumentowane polecenie Administratora, którym jest
            konfiguracja sesji i korzystanie z usługi, także w zakresie transferu poza EOG.
          </li>
          <li>
            Osoby dopuszczone do przetwarzania są zobowiązane do zachowania poufności na podstawie
            umowy albo obowiązku ustawowego.
          </li>
          <li>Stosujemy środki bezpieczeństwa wymagane przez art. 32 RODO — opisane w pkt 6.</li>
          <li>
            Korzystamy z podprocesorów na warunkach z pkt 5 i pozostajemy odpowiedzialni za ich
            działania jak za własne.
          </li>
          <li>
            W miarę możliwości pomagamy Administratorowi odpowiadać na żądania osób, których dane
            dotyczą; udostępniamy narzędzia usuwania transkryptów i eksportu danych w panelu.
          </li>
          <li>
            Wspieramy Administratora w wypełnianiu obowiązków z art. 32–36 RODO, w tym w zgłaszaniu
            naruszeń i w ocenie skutków dla ochrony danych.
          </li>
          <li>
            Po zakończeniu świadczenia usuwamy dane albo zwracamy je Administratorowi, chyba że
            przepis prawa nakazuje ich dalsze przechowywanie — patrz pkt 8.
          </li>
          <li>
            Udostępniamy informacje niezbędne do wykazania spełnienia obowiązków oraz umożliwiamy
            audyty na zasadach z pkt 7.
          </li>
        </ol>
        <p>
          Jeżeli w naszej ocenie polecenie Administratora narusza RODO lub inne przepisy o ochronie
          danych, niezwłocznie go o tym informujemy.
        </p>

        <h2 id="podprocesorzy">5. Podprocesorzy</h2>
        <p>
          Administrator udziela ogólnej zgody na korzystanie z podprocesorów wymienionych w wykazie{' '}
          <Link href="/legal/podprocesorzy">Podprocesorzy</Link>. O zamiarze zmiany informujemy co
          najmniej 14 dni wcześniej; Administrator ma w tym czasie prawo uzasadnionego sprzeciwu, a
          w razie jego nieuwzględnienia — prawo wypowiedzenia umowy bez kosztów.
        </p>
        <p>
          Na każdego podprocesora nakładamy obowiązki nie mniej rygorystyczne niż wynikające z tej
          umowy.
        </p>

        <h2 id="bezpieczenstwo">6. Bezpieczeństwo przetwarzania (art. 32 RODO)</h2>
        <ul>
          <li>szyfrowanie danych w tranzycie (TLS) oraz kluczy dostawców w spoczynku,</li>
          <li>
            minimalizacja jako środek podstawowy — {RETENTION.audio} Transkrypcje są domyślnie
            wyłączone, a włączone usuwane po {RETENTION.transcriptHours} godzinach,
          </li>
          <li>rozdzielenie środowisk oraz kluczy dostawców per środowisko i per funkcja,</li>
          <li>
            kontrola dostępu oparta na rolach i uwierzytelnianie dwuskładnikowe dla personelu,
          </li>
          <li>
            rejestr zdarzeń administracyjnych, ograniczanie liczby zapytań, monitorowanie
            rozbieżności rozliczeń,
          </li>
          <li>okresowe testy przywracania oraz przegląd uprawnień.</li>
        </ul>

        <h2 id="audyt">7. Audyt</h2>
        <p>
          Administratorowi przysługuje prawo audytu nie częściej niż raz na 12 miesięcy, po
          uprzednim powiadomieniu z wyprzedzeniem 30 dni, w godzinach pracy i bez zakłócania
          działania usługi. Audyt może zostać zrealizowany przez przekazanie aktualnej dokumentacji
          bezpieczeństwa i wyników testów, a jeżeli okażą się niewystarczające — przez audyt na
          miejscu, prowadzony przez niezależnego audytora zobowiązanego do poufności. Koszty audytu
          na miejscu ponosi Administrator, chyba że audyt wykaże istotne naruszenie.
        </p>
        <p>
          Naruszenie ochrony danych zgłaszamy Administratorowi bez zbędnej zwłoki, nie później niż w
          ciągu 48 godzin od stwierdzenia, wraz z informacjami niezbędnymi do zgłoszenia organowi
          nadzorczemu.
        </p>

        <h2 id="usuniecie">8. Zwrot i usunięcie danych</h2>
        <ul>
          <li>Nagrania audio nie powstają, więc nie ma czego zwracać ani usuwać.</li>
          <li>
            Transkrypcje, jeżeli były włączone, usuwają się automatycznie po{' '}
            {RETENTION.transcriptHours} godzinach; Administrator może usunąć je wcześniej w panelu.
          </li>
          <li>
            Metadane sesji i dane Konta usuwamy w ciągu {RETENTION.accountAfterDeletionDays} dni od
            zakończenia umowy, z wyjątkiem danych, których przechowywania wymagają przepisy
            podatkowe i rachunkowe.
          </li>
        </ul>

        <h2 id="transfery">9. Transfery poza EOG</h2>
        <p>
          Rozpoznawanie mowy, tłumaczenie i synteza głosu wymagają dostawców spoza EOG. Transfer
          opiera się na standardowych klauzulach umownych przyjętych decyzją wykonawczą Komisji (UE)
          2021/914, wraz z oceną skutków transferu i środkami dodatkowymi. Szczegóły — w{' '}
          <Link href="/legal/prywatnosc">Polityce prywatności</Link>.
        </p>

        <h2 id="zawarcie">10. Jak zawrzeć umowę</h2>
        <p>
          Podpisany egzemplarz w formacie PDF, wraz z załącznikami i standardowymi klauzulami
          umownymi, udostępniamy na żądanie skierowane na adres{' '}
          <Placeholder what="adres e-mail do spraw danych osobowych" />. W wiadomości podaj pełną
          nazwę podmiotu, numer identyfikacji podatkowej, adres siedziby i adres e-mail konta w
          serwisie.
        </p>
        <p>
          Jeżeli Twoja organizacja wymaga własnego wzoru umowy powierzenia, prześlij go na ten sam
          adres — odniesiemy się do niego w ciągu 14 dni.{' '}
          <Placeholder what="docelowy tryb podpisu: podpis kwalifikowany albo platforma e-podpisu" />
        </p>
        <p>
          W razie sprzeczności między tym dokumentem a{' '}
          <Link href="/legal/regulamin">Regulaminem</Link> w sprawach ochrony danych rozstrzyga ten
          dokument.
        </p>
      </LegalProse>
    </article>
  )
}
