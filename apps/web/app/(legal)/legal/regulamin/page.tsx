import type { Metadata } from 'next'
import Link from 'next/link'
import {
  PLANS,
  RATE_CAPTIONS_PER_MIN,
  RATE_TRANSLATION_PER_LANG_PER_MIN,
  RATE_VOICE_PER_MIN,
  TOPUP_VALIDITY_DAYS,
} from '@sub/billing'
import { COMPANY, MERCHANT_OF_RECORD, legalDoc } from '../../../(site)/components/company'
import { LegalMeta } from '../../../(site)/components/legal-meta'
import { LegalProse } from '../../../(site)/components/legal-prose'
import { Placeholder } from '../../../(site)/components/placeholder'
import { formatCredits } from '../../../(site)/components/format'

const DOC = legalDoc('regulamin')

export const metadata: Metadata = {
  title: 'Regulamin',
  description:
    'Regulamin świadczenia usług drogą elektroniczną dla sub.hexart.io: credits, płatności, prawo odstąpienia, reklamacje, odpowiedzialność.',
  robots: { index: true, follow: true },
}

export default function TermsPage() {
  return (
    <article>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-paper sm:text-3xl">
        Regulamin świadczenia usług drogą elektroniczną
      </h1>

      <LegalMeta version={DOC.version} />

      <LegalProse>
        <p>
          Regulamin określa zasady korzystania z serwisu {COMPANY.productName} i jest regulaminem w
          rozumieniu art. 8 ustawy z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną.
          Wersją wiążącą jest wersja polska.
        </p>

        <h2 id="par-1">§ 1. Definicje</h2>
        <dl>
          <dt>Operator</dt>
          <dd>{COMPANY.legalName}, podmiot świadczący Usługę, o danych wskazanych w § 2.</dd>
          <dt>Serwis</dt>
          <dd>
            Aplikacja internetowa dostępna pod adresem {COMPANY.productUrl} wraz z jej podstronami.
          </dd>
          <dt>Usługa</dt>
          <dd>
            Generowanie napisów na żywo z mowy Użytkownika, ich opcjonalne tłumaczenie maszynowe
            oraz opcjonalne odczytanie tłumaczenia syntezatorem mowy, a także udostępnienie wyniku w
            postaci strony do wpięcia w oprogramowanie do transmisji.
          </dd>
          <dt>Użytkownik</dt>
          <dd>
            Osoba fizyczna, osoba prawna albo jednostka organizacyjna korzystająca z Usługi na
            podstawie Konta.
          </dd>
          <dt>Konsument</dt>
          <dd>
            Użytkownik będący osobą fizyczną zawierającą umowę niezwiązaną bezpośrednio z jej
            działalnością gospodarczą lub zawodową, a także przedsiębiorca na prawach konsumenta w
            rozumieniu art. 7aa ustawy o prawach konsumenta.
          </dd>
          <dt>Konto</dt>
          <dd>Zbiór zasobów i uprawnień przypisanych Użytkownikowi po rejestracji w Serwisie.</dd>
          <dt>Credits</dt>
          <dd>
            Jednostka rozliczeniowa Usługi. Nie są pieniądzem elektronicznym ani instrumentem
            płatniczym; służą wyłącznie do rozliczenia zużycia Usługi.
          </dd>
          <dt>Sesja</dt>
          <dd>
            Pojedyncze, ciągłe użycie Usługi od uruchomienia przekazu dźwięku do jego zakończenia.
          </dd>
          <dt>Projektor</dt>
          <dd>
            Strona pod unikalnym adresem z tokenem, wyświetlająca wyłącznie napisy, przeznaczona do
            wpięcia jako źródło przeglądarkowe w oprogramowaniu do transmisji.
          </dd>
          <dt>Lektor AI</dt>
          <dd>
            Funkcja odczytywania tłumaczenia głosem wygenerowanym syntetycznie przez system
            sztucznej inteligencji.
          </dd>
        </dl>

        <h2 id="par-2">§ 2. Operator</h2>
        <p>Usługę świadczy:</p>
        <ul>
          <li>{COMPANY.legalName}</li>
          <li>
            adres siedziby: <Placeholder what="adres siedziby" />
          </li>
          <li>
            KRS: <Placeholder what="KRS" />, sąd rejestrowy: <Placeholder what="sąd rejestrowy" />
          </li>
          <li>
            NIP: <Placeholder what="NIP" />, REGON: <Placeholder what="REGON" />
          </li>
          <li>
            kapitał zakładowy: <Placeholder what="kapitał zakładowy" />
          </li>
          <li>
            adres poczty elektronicznej: <Placeholder what="adres e-mail kontaktowy" />
          </li>
        </ul>

        <h2 id="par-3">§ 3. Wymagania techniczne</h2>
        <p>Do korzystania z Usługi konieczne są:</p>
        <ul>
          <li>
            aktualna przeglądarka z obsługą Web Audio API i AudioWorklet (Chrome, Edge, Firefox lub
            Safari w wersji bieżącej albo o jedną niższej),
          </li>
          <li>mikrofon oraz zgoda przeglądarki na dostęp do niego,</li>
          <li>
            łącze internetowe o przepustowości wysyłania nie mniejszej niż 1 Mb/s i stabilnym
            opóźnieniu,
          </li>
          <li>
            do wpięcia Projektora — oprogramowanie obsługujące źródło przeglądarkowe, na przykład
            OBS Studio w wersji 29 lub nowszej,
          </li>
          <li>aktywne konto poczty elektronicznej,</li>
          <li>obsługa plików cookies niezbędnych, opisanych w Polityce cookies.</li>
        </ul>
        <p>
          Operator nie odpowiada za skutki niespełnienia wymagań technicznych po stronie
          Użytkownika, w szczególności za jakość rozpoznania mowy przy zaszumionym sygnale
          mikrofonu.
        </p>

        <h2 id="par-4">§ 4. Zawarcie umowy, rejestracja, weryfikacja adresu e-mail</h2>
        <ol>
          <li>
            Umowa o świadczenie usług drogą elektroniczną zostaje zawarta z chwilą utworzenia Konta,
            to jest po podaniu adresu e-mail, ustaleniu hasła albo zalogowaniu dostawcą tożsamości i
            po akceptacji Regulaminu.
          </li>
          <li>
            Uruchomienie Sesji wymaga potwierdzenia adresu e-mail przez kliknięcie w link wysłany na
            ten adres.
          </li>
          <li>
            Rejestracja jest bezpłatna. Nowe Konto otrzymuje jednorazowo {PLANS.trial.credits}{' '}
            Credits w planie {PLANS.trial.name}, bez podawania danych karty płatniczej.
          </li>
          <li>
            Umowa jest zawierana na czas nieoznaczony. Użytkownik może ją wypowiedzieć w każdej
            chwili, usuwając Konto w panelu. Wypowiedzenie nie wpływa na obowiązek zapłaty za
            świadczenia już wykonane.
          </li>
          <li>
            Konto jest osobiste. Udostępnianie danych logowania osobom trzecim jest niedozwolone.
            Adres Projektora nie jest daną logowania i może być udostępniony — nie daje dostępu do
            Konta.
          </li>
        </ol>

        <h2 id="par-5">§ 5. Credits — charakter, przeliczniki, wygasanie</h2>
        <ol>
          <li>
            Credits są wewnętrzną jednostką rozliczeniową Usługi. Nie są pieniądzem elektronicznym w
            rozumieniu ustawy o usługach płatniczych, nie podlegają oprocentowaniu ani wymianie na
            środki pieniężne, poza zwrotem w przypadkach opisanych w § 7.
          </li>
          <li>
            Zużycie Credits zależy od konfiguracji Sesji i jest naliczane za czas, w którym
            faktycznie przesyłany jest dźwięk mowy. Przerwa w mowie dłuższa niż 20 sekund pauzuje
            naliczanie. Obowiązują przeliczniki:
            <ul>
              <li>
                napisy w języku źródłowym: {formatCredits(RATE_CAPTIONS_PER_MIN)} Credits za minutę,
              </li>
              <li>
                każdy język tłumaczenia: dodatkowo{' '}
                {formatCredits(RATE_TRANSLATION_PER_LANG_PER_MIN)} Credits za minutę,
              </li>
              <li>Lektor AI: dodatkowo {formatCredits(RATE_VOICE_PER_MIN)} Credits za minutę.</li>
            </ul>
          </li>
          <li>
            Aktualne ceny planów i pakietów doładowań są podane na stronie{' '}
            <Link href="/pricing">Cennik</Link> i stanowią część Regulaminu.
          </li>
          <li>
            <strong>
              Credits przyznane w ramach abonamentu wygasają z końcem okresu rozliczeniowego
            </strong>{' '}
            i nie przechodzą na okres kolejny. Z początkiem nowego okresu przyznawany jest pełny
            przydział.
          </li>
          <li>
            <strong>
              Credits kupione w pakiecie doładowania są ważne {TOPUP_VALIDITY_DAYS} dni od dnia
              zakupu
            </strong>{' '}
            i pozostają na Koncie także po zakończeniu subskrypcji.
          </li>
          <li>
            Kolejność zużycia odpowiada kolejności wygasania — najpierw zużywane są Credits, które
            przepadłyby najwcześniej: najpierw Credits z planu bezpłatnego, następnie Credits z
            abonamentu, na końcu Credits z doładowań. Ta kolejność jest dla Użytkownika
            najkorzystniejsza, bo najdłużej ważne Credits zostają na Koncie.
          </li>
          <li>
            Historia naliczeń jest zapisywana w rejestrze wyłącznie dopisywanym i dostępna
            Użytkownikowi w panelu. W razie awarii po stronie Operatora rozbieżność rozstrzygana
            jest na korzyść Użytkownika.
          </li>
          <li>
            Jeżeli Sesja została przerwana z przyczyn leżących po stronie Operatora lub dostawcy
            przetwarzania mowy, Credits zużyte w czasie przerwy są zwracane na Konto.
          </li>
        </ol>

        <h2 id="par-6">§ 6. Płatności — {MERCHANT_OF_RECORD.name} jako sprzedawca</h2>
        <ol>
          <li>
            <strong>
              Sprzedawcą wobec Użytkownika jest {MERCHANT_OF_RECORD.name} ({MERCHANT_OF_RECORD.role}
              ).
            </strong>{' '}
            Ten podmiot przyjmuje płatność, nalicza i rozlicza podatek od wartości dodanej zgodnie z
            krajem Użytkownika oraz wystawia dokument sprzedaży. Dane rejestrowe sprzedawcy:{' '}
            <Placeholder what="adres i numery rejestrowe Paddle.com Market Ltd" />.
          </li>
          <li>
            Operator świadczy Usługę i pozostaje stroną Regulaminu oraz Polityki prywatności.
            Reklamacje dotyczące działania Usługi kierowane są do Operatora, a reklamacje dotyczące
            samej transakcji płatniczej i dokumentu sprzedaży — do sprzedawcy.
          </li>
          <li>
            Ceny w Serwisie podawane są w kwotach netto. Kwota brutto wraz z podatkiem jest
            prezentowana przed potwierdzeniem zakupu.
          </li>
          <li>
            Użytkownik będący podatnikiem podatku od wartości dodanej w Unii Europejskiej może podać
            numer VAT UE w koszyku; sprzedawca stosuje wówczas mechanizm odwrotnego obciążenia,
            jeżeli numer zostanie zweryfikowany pozytywnie.
          </li>
          <li>
            Subskrypcja odnawia się automatycznie na kolejny okres, chyba że zostanie anulowana.
            Anulowanie następuje jednym kliknięciem w panelu, bez kontaktu z obsługą, i jest
            skuteczne z końcem opłaconego okresu.
          </li>
          <li>
            Brak skutecznego pobrania płatności za odnowienie skutkuje zawieszeniem przydziału
            Credits abonamentowych. Credits z doładowań pozostają dostępne do końca ich ważności.
          </li>
        </ol>

        <h2 id="par-7">
          § 7. Prawo odstąpienia i zgoda z art. 38 ust. 1 pkt 13 ustawy o prawach konsumenta
        </h2>
        <ol>
          <li>
            Konsument może odstąpić od umowy zawartej na odległość w terminie 14 dni bez podawania
            przyczyny, składając oświadczenie na adres e-mail Operatora albo sprzedawcy.
          </li>
          <li>
            Usługa polega na dostarczeniu treści cyfrowych niedostarczanych na nośniku materialnym.
            Zgodnie z art. 38 ust. 1 pkt 13 ustawy o prawach konsumenta{' '}
            <strong>
              prawo odstąpienia nie przysługuje, jeżeli spełnianie świadczenia rozpoczęło się za
              uprzednią wyraźną zgodą Konsumenta i po przyjęciu przez niego do wiadomości, że traci
              prawo odstąpienia z chwilą pełnego wykonania umowy przez przedsiębiorcę
            </strong>
            .
          </li>
          <li>
            W koszyku prezentowane jest osobne, niezaznaczone domyślnie pole wyboru o treści:
            <p>
              „Żądam rozpoczęcia świadczenia usługi (przyznania Credits) przed upływem terminu na
              odstąpienie od umowy. Przyjmuję do wiadomości, że po pełnym wykonaniu usługi tracę
              prawo odstąpienia.”
            </p>
          </li>
          <li>
            Jeżeli pole nie zostanie zaznaczone, Credits są przyznawane po upływie 14 dni od zakupu.
          </li>
          <li>
            <strong>
              Przy odstąpieniu w terminie Operator zwraca płatność proporcjonalnie do
              niewykorzystanej części Credits
            </strong>
            , nawet jeżeli świadczenie zostało rozpoczęte za zgodą Konsumenta. Jest to warunek
            korzystniejszy niż wynikający z przepisów i ma na celu wyeliminowanie sporów o zakres
            zużycia.
          </li>
          <li>
            Zwrot następuje tym samym kanałem płatności, w terminie 14 dni od otrzymania
            oświadczenia, przez sprzedawcę realizującego pierwotną transakcję.
          </li>
          <li>
            Fakt i moment udzielenia zgody, wraz z wersją Regulaminu i skrótem adresu IP, są
            zapisywane w rejestrze zdarzeń Operatora jako dowód spełnienia obowiązku informacyjnego.
          </li>
        </ol>

        <h2 id="par-8">§ 8. Reklamacje i rozwiązywanie sporów</h2>
        <ol>
          <li>
            Reklamacje dotyczące Usługi składa się na adres e-mail Operatora:{' '}
            <Placeholder what="adres e-mail kontaktowy" />.
          </li>
          <li>
            Reklamacja powinna zawierać adres e-mail Konta, opis nieprawidłowości, datę i
            przybliżoną godzinę zdarzenia oraz oczekiwany sposób załatwienia sprawy.
          </li>
          <li>
            Operator rozpatruje reklamację w terminie 14 dni od jej otrzymania i informuje o wyniku
            tym samym kanałem. Brak odpowiedzi w tym terminie oznacza uznanie reklamacji.
          </li>
          <li>
            Konsument może skorzystać z pozasądowych sposobów rozpatrywania reklamacji i dochodzenia
            roszczeń, w szczególności: mediacji przy wojewódzkim inspektorze Inspekcji Handlowej,
            stałego sądu polubownego przy wojewódzkim inspektorze Inspekcji Handlowej oraz pomocy
            powiatowego lub miejskiego rzecznika konsumentów. Informacje o tych trybach udostępnia
            Urząd Ochrony Konkurencji i Konsumentów.
          </li>
          <li>
            Skorzystanie z trybu pozasądowego jest dobrowolne i wymaga zgody obu stron.{' '}
            <Placeholder what="wskazanie podmiotu ADR, jeżeli Operator zdecyduje się go wyznaczyć" />
          </li>
        </ol>

        <h2 id="par-9">§ 9. Odpowiedzialność i ograniczenia zastosowania</h2>
        <ol>
          <li>Operator świadczy Usługę z należytą starannością, w modelu starannego działania.</li>
          <li>
            <strong>
              Operator nie gwarantuje poprawności rozpoznania mowy ani poprawności tłumaczenia
              maszynowego.
            </strong>{' '}
            Wynik jest generowany automatycznie i może zawierać błędy, przeinaczenia i pominięcia,
            zwłaszcza przy szumie, mowie nakładającej się, terminologii specjalistycznej i nazwach
            własnych.
          </li>
          <li>
            <strong>
              Usługi nie wolno stosować w zastosowaniach krytycznych, w których błąd napisów lub
              tłumaczenia może zagrozić życiu, zdrowiu, wolności albo istotnym interesom majątkowym.
            </strong>{' '}
            Dotyczy to w szczególności komunikacji medycznej i ratunkowej, czynności prawnych i
            sądowych, tłumaczenia przysięgłego oraz procedur bezpieczeństwa. Do takich zastosowań
            konieczny jest udział człowieka odpowiadającego za treść.
          </li>
          <li>
            Wobec Użytkownika niebędącego Konsumentem odpowiedzialność Operatora z tytułu
            niewykonania lub nienależytego wykonania umowy ogranicza się do wysokości opłat
            wniesionych przez tego Użytkownika w okresie 12 miesięcy poprzedzających zdarzenie i nie
            obejmuje utraconych korzyści. Ograniczenie nie dotyczy szkody wyrządzonej umyślnie ani
            przypadków, w których wyłączenie odpowiedzialności jest niedopuszczalne.
          </li>
          <li>
            Odpowiedzialność wobec Konsumenta kształtują wyłącznie przepisy powszechnie
            obowiązujące; żadne postanowienie Regulaminu nie ogranicza uprawnień Konsumenta.
          </li>
        </ol>

        <h2 id="par-10">§ 10. Obowiązki Użytkownika, treści zakazane, oznaczanie treści AI</h2>
        <ol>
          <li>
            Użytkownik odpowiada za posiadanie podstawy prawnej do przetwarzania głosu i wypowiedzi
            osób, których mowa trafia do Usługi, w tym za spełnienie wobec nich obowiązków
            informacyjnych i za uzyskanie wymaganych zgód.
          </li>
          <li>
            Zabronione jest wprowadzanie do Usługi treści bezprawnych, w szczególności naruszających
            prawa osób trzecich, nawołujących do przemocy lub nienawiści, a także wykorzystywanie
            Usługi do nagrywania osób bez podstawy prawnej.
          </li>
          <li>
            Zabronione jest podejmowanie działań zakłócających działanie Serwisu, obchodzenie
            limitów planu, automatyczne odpytywanie poza udostępnionym interfejsem oraz odsprzedaż
            Usługi bez odrębnej umowy.
          </li>
          <li>
            Lektor AI generuje głos syntetycznie. Zgodnie z art. 50 ust. 4 rozporządzenia (UE)
            2024/1689{' '}
            <strong>
              obowiązek oznaczenia treści wygenerowanej lub zmienionej przez sztuczną inteligencję
              przy jej publikacji spoczywa na Użytkowniku
            </strong>
            , który tę treść rozpowszechnia. Operator udostępnia trwałe oznaczenie funkcji w studiu
            oraz metadane w strumieniu lektora, a w dokumentacji rekomenduje sposób oznaczenia
            transmisji.
          </li>
          <li>
            Naruszenie ustępów 1–3 uprawnia Operatora do zawieszenia Konta po uprzednim wezwaniu, a
            w przypadku rażącego naruszenia — niezwłocznie, z jednoczesnym powiadomieniem
            Użytkownika i wskazaniem podstawy oraz trybu odwołania.
          </li>
        </ol>

        <h2 id="par-11">§ 11. Dostępność Usługi i przerwy techniczne</h2>
        <ol>
          <li>
            Operator dokłada starań, aby Usługa była dostępna w sposób ciągły, i planuje prace
            konserwacyjne w godzinach niskiego ruchu, informując o nich z wyprzedzeniem, gdy jest to
            możliwe.
          </li>
          <li>
            <strong>
              Gwarantowany poziom dostępności (SLA) obowiązuje wyłącznie w planie {PLANS.pro.name}
            </strong>{' '}
            i wymaga odrębnego dokumentu podpisanego z Operatorem. W pozostałych planach Usługa jest
            świadczona bez SLA.
          </li>
          <li>
            Operator korzysta z dostawców zewnętrznych wskazanych w wykazie{' '}
            <Link href="/legal/podprocesorzy">podprocesorów</Link>. Awaria po stronie takiego
            dostawcy może ograniczyć część funkcji; Credits zużyte w czasie takiej przerwy podlegają
            zwrotowi zgodnie z § 5 ust. 8.
          </li>
        </ol>

        <h2 id="par-12">§ 12. Zmiany Regulaminu</h2>
        <ol>
          <li>
            Operator może zmienić Regulamin z ważnych przyczyn: zmiany przepisów, zmiany zakresu lub
            sposobu świadczenia Usługi, zmiany u dostawców, względów bezpieczeństwa albo zmian
            cennika.
          </li>
          <li>
            O zmianie istotnej Operator informuje pocztą elektroniczną oraz komunikatem w panelu{' '}
            <strong>co najmniej 14 dni przed jej wejściem w życie</strong>.
          </li>
          <li>
            Użytkownik, który nie akceptuje zmiany, może wypowiedzieć umowę przed dniem jej wejścia
            w życie, bez ponoszenia kosztów. Niewykorzystane Credits kupione w doładowaniach
            podlegają wtedy zwrotowi proporcjonalnemu.
          </li>
          <li>
            Do umów zawartych przed zmianą stosuje się wersję Regulaminu z dnia zawarcia umowy.
          </li>
        </ol>

        <h2 id="par-13">§ 13. Prawo właściwe i sądy</h2>
        <ol>
          <li>Do Regulaminu i umów zawartych na jego podstawie stosuje się prawo polskie.</li>
          <li>
            Wybór prawa polskiego nie pozbawia Konsumenta ochrony wynikającej z bezwzględnie
            obowiązujących przepisów państwa jego zwykłego pobytu.
          </li>
          <li>
            Spory z Użytkownikiem niebędącym Konsumentem rozstrzyga sąd właściwy miejscowo dla
            siedziby Operatora. Spory z Konsumentem rozstrzyga sąd właściwy według przepisów
            ogólnych.
          </li>
        </ol>

        <h2 id="par-14">§ 14. Kontakt i punkt zgłoszeń</h2>
        <ul>
          <li>
            Sprawy ogólne i reklamacje: <Placeholder what="adres e-mail kontaktowy" />
          </li>
          <li>
            Ochrona danych osobowych: <Placeholder what="adres e-mail do spraw danych osobowych" />
          </li>
          <li>
            Zgłoszenia treści bezprawnych — punkt kontaktowy zgodnie z art. 11 i 12 rozporządzenia
            (UE) 2022/2065 (akt o usługach cyfrowych):{' '}
            <Placeholder what="adres e-mail punktu kontaktowego DSA" />. Językiem komunikacji jest
            polski i angielski.
          </li>
          <li>
            Zgłoszenia podatności bezpieczeństwa: zgodnie z plikiem{' '}
            <code>/.well-known/security.txt</code>.
          </li>
        </ul>
        <p>
          Zasady przetwarzania danych osobowych opisuje{' '}
          <Link href="/legal/prywatnosc">Polityka prywatności</Link>, a zasady stosowania plików
          cookies — <Link href="/legal/cookies">Polityka cookies</Link>.
        </p>
      </LegalProse>
    </article>
  )
}
