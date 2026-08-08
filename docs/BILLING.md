# Billing — credits, plany, Paddle

Źródło prawdy dla wartości liczbowych: `packages/billing/src/plans.ts`. Ten dokument opisuje **dlaczego**. Zmiana cen = decyzja właściciela + PR dotykający obu miejsc naraz.

---

## 1. Jednostka: 1 credit = 1 minuta napisów

Wybrana świadomie, bo użytkownik ma rozumieć cennik bez kalkulatora.

| Funkcja | Koszt |
|---|---|
| Napisy w języku źródłowym (STT) | **1,0 credit / min** |
| Każdy język tłumaczenia | **+0,5 credit / min** |
| Lektor AI (TTS) | **+3,0 credit / min** |

Przykłady:
- Napisy PL, bez tłumaczenia → **1,0 cr/min** = 60 cr/h
- Napisy PL + tłumaczenie EN → **1,5 cr/min** = 90 cr/h
- Napisy PL + EN + lektor EN → **4,5 cr/min** = 270 cr/h

Naliczanie w tyknięciach 1-sekundowych (0,0167 credit przy stawce 1,0). Cisza > 20 s pauzuje licznik i strumień STT.

W UI zawsze obok salda: **„≈ 6 h 40 min napisów"** przeliczone dla bieżącej konfiguracji studia. Credits to jednostka rozliczeniowa, minuty to jednostka myślenia użytkownika — pokazujemy obie.

---

## 2. Koszt własny (COGS)

| Składnik | Stawka | Na minutę |
|---|---|---|
| ElevenLabs Scribe v2 Realtime | $0,28 / h | **$0,0047** |
| OpenRouter — tłumaczenie (model fast, ~800 tok/min) | zmienna | **~$0,0004** |
| ElevenLabs TTS Flash v2.5 (~900 znaków/min) | zależne od planu | **~$0,030–0,045** |
| Infrastruktura (relay, DB, Vercel) rozłożona | — | **~$0,002** |

| Konfiguracja | COGS/min | Cena wg credits (przy 0,13 zł/cr) | Marża brutto |
|---|---|---|---|
| Napisy | ~$0,007 (≈0,028 zł) | 0,13 zł | ~78% |
| Napisy + 1 tłumaczenie | ~$0,007 (≈0,029 zł) | 0,20 zł | ~86% |
| + lektor | ~$0,040 (≈0,16 zł) | 0,59 zł | ~73% |

Lektor jest kosztowym środkiem ciężkości — stąd mnożnik ×3, nie ×2. Weryfikacja marży: job `contract-check` porównuje realne faktury ElevenLabs z sumą ledgera raz w tygodniu.

---

## 3. Plany (netto; VAT dolicza Paddle wg kraju klienta)

| Plan | Cena / mc | Credits / mc | ≈ napisy | Równoległe sesje | Uwagi |
|---|---|---|---|---|---|
| **Trial** | 0 zł | 10 (jednorazowo) | ~10 min | 1 | Bez karty. Wymaga potwierdzonego e-maila. Bez lektora. Watermark w projektorze |
| **Starter** | 39 zł / 9 € | 300 | ~5 h | 1 | Bez watermarku, 1 język docelowy |
| **Creator** | 99 zł / 23 € | 1 000 | ~16 h | 2 | 3 języki, lektor, glosariusz |
| **Pro** | 249 zł / 59 € | 3 000 | ~50 h | 4 | Bez limitu języków, priorytet kolejki, dostęp API |

**Doładowania** (bez abonamentu też dostępne, ważność 12 mc):

| Pakiet | Cena | Stawka |
|---|---|---|
| 250 cr | 39 zł | 0,156 zł/cr |
| 1 000 cr | 129 zł | 0,129 zł/cr |
| 4 000 cr | 449 zł | 0,112 zł/cr |

Roczny abonament: **−20%** (2 miesiące gratis).

---

## 4. Zasady credits

- Credits z **abonamentu** wygasają na koniec okresu rozliczeniowego (bez kumulacji ponad 1 okres — komunikowane wprost przy zakupie).
- Credits z **doładowań** są ważne 12 miesięcy i **nie przepadają** przy anulowaniu abonamentu.
- Kolejność zużycia: **najpierw abonamentowe** (te, które i tak przepadną), potem doładowania. Zawsze na korzyść użytkownika.
- Trial: 10 credits, jeden raz na konto. Bez karty (mniejsza konwersja, ale zerowe tarcie i zero ryzyka chargebacków).
- **Odwrócenie transakcji**: sesja przerwana błędem po naszej stronie → automatyczny zwrot credits (`reason: 'refund_incident'`) w ciągu 5 min, bez pytania użytkownika.

---

## 5. Ledger — model księgowy

`credit_ledger` jest **append-only**. Nie ma operacji UPDATE ani DELETE. Saldo = `SUM(delta)`.

```
reason ∈ {
  'trial_grant', 'subscription_grant', 'topup_purchase',
  'session_usage', 'refund_incident', 'refund_customer',
  'expiry_subscription', 'expiry_topup', 'manual_adjustment'
}
```

- `manual_adjustment` wymaga wpisu w `audit_log` z autorem i uzasadnieniem.
- `credit_balance` to widok materializowany, przeliczany triggerem. Zadanie nocne porównuje go z `SUM(delta)` — rozjazd = incydent P1.
- Idempotencja: każdy zapis niesie `idempotency_key` (dla Paddle = `event_id` webhooka). Powtórka webhooka nie dubluje credits.

---

## 6. Paddle jako Merchant of Record

- **Paddle jest sprzedawcą** wobec klienta końcowego. Rozlicza VAT UE/UK/US, waliduje VAT ID (reverse charge B2B), wystawia klientowi fakturę/paragon.
- hexart Sp. z o.o. wystawia **jedną fakturę miesięcznie na rzecz Paddle** (usługa poza terytorium kraju, odwrotne obciążenie) — brak rejestracji VAT OSS, brak faktur per klient, brak obowiązku KSeF wobec klientów końcowych.
- Dane firmowe klienta (nazwa, NIP, adres) zbieramy w `billing_profiles` i przekazujemy do Paddle w `customData` — trafiają na dokument Paddle.

### Webhooki → ledger

| Zdarzenie Paddle | Efekt |
|---|---|
| `transaction.completed` (jednorazowa) | `topup_purchase` +N |
| `subscription.activated` / `subscription.updated` | ustaw plan, `subscription_grant` |
| `subscription.canceled` | plan → `canceled` na koniec okresu; doładowania zostają |
| `adjustment.created` (zwrot) | `refund_customer` −N |
| `transaction.payment_failed` | grace 3 dni, potem downgrade do Trial |

Webhook: weryfikacja podpisu **przed** parsowaniem, obsługa idempotentna po `event_id`, odpowiedź 200 natychmiast, przetwarzanie w kolejce. Retry Paddle nie może zdublować przyznania.

---

## 7. Zachowanie przy kończących się credits (UX rozliczeń)

| Stan | Zachowanie |
|---|---|
| < 20% salda | `notice: LOW_CREDITS` — dyskretny pasek w studiu (**nigdy w projektorze**) |
| < 60 s zapasu | Baner + jednoklikowe doładowanie bez opuszczania studia |
| 0 | 60 s grace, potem `end(credits_exhausted)`; sesja zamyka się miękko, projector pokazuje ostatnią kartę i wygasza — **żadnego komunikatu błędu na wizji** |

**Zasada nadrzędna:** w widoku projektora nie pojawia się nigdy nic, czego nie chce widz — ani błąd, ani promocja, ani „doładuj konto". To wychodzi na antenę.

---

## 8. Konwersja z trialu

- Trial daje 10 credits = ~10 min napisów. Dość, by zobaczyć, że działa; za mało, by prowadzić stream.
- Prompt o zakup **po zakończeniu** pierwszej sesji (nie w trakcie), z konkretem: „Twoja sesja: 8 min, 3 poprawki, 142 karty. Starter = 5 h/mc."
- Po wyczerpaniu trialu: projector nadal działa jako podgląd, ale bez napisów — user widzi swój gotowy setup OBS i brakuje tylko credits.
- Zero dark patterns: brak wymogu karty, anulowanie jednym kliknięciem w panelu, jasna informacja o wygasaniu credits abonamentowych **przed** zakupem.
