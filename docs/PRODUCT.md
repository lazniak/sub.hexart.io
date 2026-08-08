# Produkt — UX i treść

Zasada nadrzędna: **od wejścia na stronę do napisów w OBS w mniej niż 3 minuty, bez czytania instrukcji.**

---

## 1. Landing (`/`) — jeden ekran, zero przewijania po odpowiedź

**Nagłówek**
> ### Napisy na żywo do OBS. Po polsku, po angielsku, w 90 językach.
> Wybierasz mikrofon i język. Dostajesz link. Wklejasz go w OBS jako Browser Source.
> Opcjonalnie: lektor AI czyta tłumaczenie na głos.
>
> **[ Wypróbuj za darmo — 10 minut ]** · bez karty

**Trzy kroki** (ikony, po jednym zdaniu):
1. **Wybierz mikrofon i język** — źródło i to, na co tłumaczyć.
2. **Skopiuj link do OBS** — Browser Source, przezroczyste tło, gotowe.
3. **Mów** — napisy pojawiają się po ~0,4 s. Lektor po ~1 s.

**Dowód, że działa** — pętla wideo 12 s: mówca po polsku, po prawej OBS z napisami EN. Bez lektora (widz obejrzy z wyłączonym dźwiękiem).

**Dla kogo** (trzy kafle, po linijce): streamerzy · webinary i konferencje · dostępność (napisy dla niesłyszących).

**Cennik** — trzy plany + „albo kup credits bez abonamentu".

**Zaufanie** (krótka lista, bez ozdobników):
- Nie zapisujemy Twojego audio. Przepływa i znika.
- Serwery i baza w Unii Europejskiej.
- Operator: hexart Sp. z o.o., faktury VAT, anulowanie jednym kliknięciem.

**Czego na landingu NIE ma:** karuzeli logo, fałszywych opinii, licznika „327 osób ogląda", pop-upu z rabatem, chatbota. Produkt techniczny dla ludzi technicznych.

---

## 2. Onboarding — 4 kroki, każdy < 20 s

```
[1] E-mail + hasło (albo Google)   →   [2] Klik w link z maila
                                          ↓
[4] Link do OBS + „skopiuj"        ←   [3] Wybór mikrofonu (uprawnienie przeglądarki)
```

Po kroku 3 — **natychmiastowy podgląd na żywo**: user mówi „raz, dwa, trzy" i widzi swoje słowa. To jest moment prawdy i musi nastąpić **przed** jakąkolwiek rozmową o pieniądzach.

Instrukcja OBS: 4 zdania + animowany GIF (Źródła → + → Browser Source → wklej URL → 1920×1080 → OK). Bez wideo, bez rejestracji na webinar.

---

## 3. Studio (`/app/studio`) — jeden ekran, siedem kontrolek

```
┌──────────────────────────────────────────────────────────────┐
│  Mikrofon  [ Yeti X ▾ ]        ▁▃▅▇▅▃▁  poziom              │
│                                                              │
│  Mówię po  [ polsku ▾ ]   →   Napisy [ + angielski ▾ ]      │
│                                                              │
│  Lektor AI  [ ○ wył. ]        Głos [ Adam ▾ ]  (od Creator)  │
│                                                              │
│  ────────────────────────────────────────────────────────    │
│  Link do OBS                                                 │
│  https://sub.hexart.io/projector/pt_9fK…      [ Kopiuj ]     │
│  Styl [ Clean ▾ ]                             [ Nowy link ]  │
│  ────────────────────────────────────────────────────────    │
│                                                              │
│         ▶  START            saldo: 287 cr ≈ 3 h 11 min       │
│                                                              │
│  ┌── podgląd ──────────────────────────────────────────┐    │
│  │  Dzisiaj pokażę wam nowy setup.                     │    │
│  │  Today I'll show you my new setup.                  │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

**To wszystko.** Reszta (glosariusz, rozmiar czcionki, margines, prędkość lektora, roll-up/pop-on, próg ciszy) siedzi pod „Więcej ustawień" i ma sensowne domyślne. Ustawienia zapamiętywane per konto.

Szacunek kosztu **przed** startem: „Ta konfiguracja: 1,5 cr/min — starczy na 3 h 11 min."

---

## 4. Projektor (`/projector/:token`)

- Przezroczyste tło, zero UI, zero brandingu (poza Trial: dyskretny znak wodny w rogu).
- Query params dla power-userów: `?style=broadcast&lines=2&size=44&lang=en&safe=5`.
- Ten sam token + `/voice` = strona-tylko-audio dla lektora (dodawana w OBS jako drugie Browser Source z zaznaczonym „Control audio via OBS").
- Ustawienia zmieniane w studiu wchodzą **na żywo**, bez odświeżania źródła w OBS.
- Odświeżenie Browser Source nie gubi treści (`snapshot` + `resume`).
- **Nigdy** nie wyświetla błędów, ostrzeżeń o credits ani komunikatów systemowych. Wszystko idzie do studia.

---

## 5. Panel (`/app`)

Cztery zakładki, nic więcej: **Credits** (saldo, historia, doładowanie) · **Sesje** (data, czas, konfiguracja, koszt) · **Glosariusz** · **Konto** (dane do faktury, hasło, 2FA, eksport danych, usunięcie konta).

Faktury: linki do dokumentów Paddle. Anulowanie subskrypcji: jeden przycisk, jedno potwierdzenie, bez ankiety wyjściowej.

---

## 6. Ścieżka konwersji

| Moment | Komunikat |
|---|---|
| Rejestracja | „Masz 10 minut na sprawdzenie, czy to działa u Ciebie." |
| Pierwsze słowa w podglądzie | *(nic — nie przerywamy momentu)* |
| 3 min pozostałe | Dyskretny pasek w studiu: „Zostało 3 min triala." |
| Koniec sesji trialowej | Podsumowanie z konkretem: „8 min · 142 karty napisów · 3 poprawki. Starter to 5 h miesięcznie za 39 zł." + jeden przycisk |
| Trial wyczerpany | Studio i link OBS nadal działają, napisy się nie pojawiają. Setup gotowy, brakuje credits. |
| Saldo < 20% | Pasek w studiu + doładowanie bez wychodzenia z ekranu |

Zero: e-maili „ostatnia szansa", odliczania, sztucznych rabatów. Produkt sprzedaje się tym, że działa.

---

## 7. Obsługiwane przypadki brzegowe (bo w live nie ma dubla)

| Sytuacja | Zachowanie |
|---|---|
| Zerwanie sieci u nadawcy | Bufor 3 s, auto-reconnect z backoff, projector trzyma ostatnią kartę zamiast czyścić ekran |
| Odświeżenie Browser Source w OBS | `resume(lastSeq)` — zero utraty treści |
| Zmiana mikrofonu w trakcie | Płynne przełączenie bez zrywania sesji |
| Cisza > 20 s | Pauza licznika i strumienia STT, projector wygasza po 6 s |
| Padnie ElevenLabs STT | 3 próby reconnect, `notice` w studiu, zwrot credits za przerwę |
| Padnie tłumaczenie | Napisy w języku źródłowym lecą dalej, tłumaczenie wraca po odzyskaniu |
| Padnie TTS | Napisy działają, lektor cichnie, `notice` w studiu |
| Muzyka / brak mowy | VAD nie commituje — brak fałszywych napisów |
| Dwie osoby mówią naraz | Scribe zwraca jeden strumień; diaryzacja poza zakresem v1 (świadomie) |

---

## 8. Świadomie poza zakresem v1

Tłumaczenie z pliku wideo · diaryzacja mówców · klonowanie głosu użytkownika · aplikacja desktop / wtyczka OBS · konta zespołowe · napisy dwukierunkowe (rozmowa) · eksport SRT z sesji.

Każda z nich to osobne Issue z etykietą `v2`. Nie wchodzą do MVP i nie są przedmiotem dyskusji przy code review.
