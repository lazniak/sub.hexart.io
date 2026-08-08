# Warstwa prawna

**Operator:** hexart Sp. z o.o.
**Uzupełnić przed uruchomieniem:** imię i nazwisko Prezesa Zarządu, adres siedziby, KRS, NIP, REGON, kapitał zakładowy, adres e-mail kontaktowy, sąd rejestrowy.

> To jest specyfikacja techniczno-organizacyjna, nie porada prawna. Teksty w `docs/legal/` przed publikacją przechodzą weryfikację przez radcę prawnego. Wersją wiążącą jest polska.

---

## 1. Dokumenty do wdrożenia

| Dokument | Podstawa | Trasa |
|---|---|---|
| Regulamin świadczenia usług drogą elektroniczną | uśude z 18.07.2002, art. 8 | `/legal/regulamin` |
| Polityka prywatności | RODO art. 13–14 | `/legal/prywatnosc` |
| Polityka cookies | Prawo telekomunikacyjne art. 173 | `/legal/cookies` |
| Umowa powierzenia (DPA) dla klientów B2B | RODO art. 28 | `/legal/dpa` (PDF na żądanie) |
| Informacja o podprocesorach | RODO art. 28 ust. 2 | `/legal/podprocesorzy` |
| Zasady zwrotów i reklamacji | uPK, uśude | sekcja regulaminu |
| security.txt | RFC 9116 | `/.well-known/security.txt` |

Wersjonowanie: każdy dokument ma datę wejścia w życie i historię. Zmiana istotna → e-mail do użytkowników **14 dni przed**, prawo wypowiedzenia bez konsekwencji.

---

## 2. Prawo odstąpienia — punkt krytyczny

Usługa dostarcza treści cyfrowe natychmiast po zakupie. Konsument ma 14 dni na odstąpienie (art. 27 uPK), **chyba że** wyraził zgodę na rozpoczęcie świadczenia przed upływem terminu i przyjął do wiadomości utratę tego prawa (**art. 38 ust. 1 pkt 13 uPK**).

Wdrożenie:
- W koszyku **osobny, niezaznaczony domyślnie checkbox**:
  > „Żądam rozpoczęcia świadczenia usługi (przyznania credits) przed upływem terminu na odstąpienie od umowy. Przyjmuję do wiadomości, że po pełnym wykonaniu usługi tracę prawo odstąpienia."
- Bez zaznaczenia: credits przyznawane po 14 dniach.
- Fakt i moment udzielenia zgody zapisywany w `audit_log` (wersja regulaminu, timestamp, IP hash).
- **Częściowo zużyte credits:** przy odstąpieniu w terminie zwrot proporcjonalny do niewykorzystanej części — zapisane w regulaminie wprost. To korzystniejsze niż minimum ustawowe i eliminuje spory.

Subskrypcje: anulowanie jednym kliknięciem w panelu, skuteczne na koniec okresu, bez rozmowy z obsługą (wymóg „łatwego wypowiedzenia").

---

## 3. Paddle jako Merchant of Record — konsekwencje

- Wobec klienta końcowego sprzedawcą jest **Paddle.com Market Ltd**. To musi być jasno napisane w regulaminie i widoczne w koszyku.
- Paddle: nalicza i odprowadza VAT wg kraju klienta, waliduje VAT ID (reverse charge B2B), wystawia dokument sprzedaży.
- hexart: wystawia Paddle jedną fakturę miesięczną (usługa poza terytorium kraju, NP/odwrotne obciążenie). **Brak rejestracji VAT OSS.**
- **KSeF** (obowiązkowy od 2026): dotyczy faktur B2B krajowych. Przy modelu MoR hexart nie wystawia faktur klientom końcowym — obowiązek sprowadza się do faktury dla Paddle (podmiot zagraniczny, poza KSeF) i faktur kosztowych. **Do potwierdzenia z księgowością przed startem.**
- Regulamin i polityka prywatności nadal są **nasze** — Paddle obsługuje płatność, nie usługę.

---

## 4. RODO — role i przepływy

| Podmiot | Rola |
|---|---|
| hexart Sp. z o.o. | Administrator danych konta; **procesor** dla treści audio klienta B2B |
| ElevenLabs (US) | Podprocesor — STT, TTS |
| OpenRouter (US) | Podprocesor — tłumaczenie |
| Paddle (UK/IE) | Niezależny administrator dla danych płatniczych (MoR) |
| Hetzner (DE), Neon (EU), Upstash (EU) | Podprocesorzy — infrastruktura |
| Vercel (US/EU) | Podprocesor — hosting warstwy web |

**Transfer do USA:** standardowe klauzule umowne + EU-US Data Privacy Framework tam, gdzie dostawca jest certyfikowany. Ujawnione w polityce prywatności i w rejestrze czynności przetwarzania.

**Minimalizacja jako argument sprzedażowy:**
- audio — **nie zapisujemy**, przepływ pass-through,
- transkrypcje — domyślnie nie zapisujemy (opcja z TTL 24 h),
- to jest realna przewaga wobec konkurencji i tak ma być komunikowane na landingu.

Do przygotowania: rejestr czynności przetwarzania (art. 30), analiza ryzyka; DPIA prawdopodobnie **niewymagana** przy braku retencji audio i braku profilowania — decyzja udokumentowana pisemnie.

---

## 5. AI Act (rozporządzenie 2024/1689)

Jesteśmy **deployerem** systemów AI ogólnego przeznaczenia (STT, LLM, TTS), nie dostawcą.

Obowiązki, które nas realnie dotyczą:
- **Art. 50 ust. 2** — treść audio generowana syntetycznie musi być oznaczona jako wygenerowana przez AI. Wdrożenie: informacja w regulaminie, stały znacznik „AI voice" w studiu, metadane w strumieniu lektora, rekomendacja oznaczenia dla nadawcy w dokumentacji.
- **Art. 50 ust. 4** — jeśli użytkownik publikuje treść generowaną przez AI, jego obowiązkiem jest ją oznaczyć. Zapis w regulaminie przenoszący tę powinność na nadawcę + praktyczna wskazówka w onboardingu.
- Transkrypcja mowy sama w sobie nie jest systemem wysokiego ryzyka w rozumieniu Aneksu III w tym zastosowaniu.

---

## 6. Regulamin — zakres merytoryczny

1. Definicje (Usługa, Credits, Sesja, Projektor, Lektor AI, Konto).
2. Operator: hexart Sp. z o.o. + pełne dane rejestrowe.
3. Wymagania techniczne (przeglądarka z Web Audio API, mikrofon, łącze ≥ 1 Mb/s upload, OBS ≥ 29).
4. Zawarcie umowy, rejestracja, weryfikacja e-mail.
5. Credits: charakter (jednostka rozliczeniowa, **nie pieniądz elektroniczny**), przeliczniki, wygasanie, kolejność zużycia.
6. Płatności przez Paddle jako MoR.
7. Prawo odstąpienia + zgoda z art. 38 pkt 13.
8. Reklamacje: 14 dni na rozpatrzenie, adres e-mail, ODR/polubowne rozwiązywanie sporów.
9. Odpowiedzialność: usługa świadczona z należytą starannością; **brak gwarancji poprawności tłumaczenia maszynowego**; zakaz stosowania w zastosowaniach krytycznych (medyczne, prawne, ratunkowe) — jasno i wprost.
10. Treści zakazane: nagrywanie osób bez podstawy prawnej to odpowiedzialność użytkownika; zakaz treści bezprawnych.
11. Dostępność usługi, przerwy techniczne, brak SLA na planach niższych niż Pro.
12. Zmiany regulaminu (14 dni, prawo wypowiedzenia).
13. Prawo właściwe: polskie; sądy właściwe wg siedziby (konsument — wg przepisów ogólnych).
14. Kontakt i punkt zgłoszeń DSA.

---

## 7. Do rozstrzygnięcia przed startem produkcyjnym

- [ ] Pełne dane rejestrowe hexart Sp. z o.o. w stopce, regulaminie i `/legal/*`
- [ ] Weryfikacja regulaminu i polityki prywatności przez radcę prawnego
- [ ] Potwierdzenie z księgowością: rozliczenie Paddle, VAT NP, KSeF
- [ ] Podpisane DPA: ElevenLabs, OpenRouter, Paddle, Hetzner, Neon, Upstash, Vercel
- [ ] Rejestr czynności przetwarzania (art. 30) + udokumentowana decyzja o braku DPIA
- [ ] Ubezpieczenie OC działalności / cyber (opcjonalne, rekomendowane od pierwszych klientów B2B)
- [ ] Zastrzeżenie znaku słownego (opcjonalne)
