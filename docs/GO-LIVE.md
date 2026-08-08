# Uruchomienie produkcyjne — checklista

Kod jest napisany i `pnpm verify` przechodzi. Poniższe kroki wymagają rzeczy, których repozytorium nie ma i mieć nie powinno: kluczy, dostępu do VPS-a i danych rejestrowych spółki. Kolejność ma znaczenie — każdy blok zależy od poprzedniego.

---

## 1. Konta u dostawców

- [ ] **ElevenLabs** — plan z dostępem do Scribe v2 Realtime. Wygeneruj **dwa** klucze: osobno STT i osobno TTS. Osobne klucze to nie ceremoniał: wyciek jednego nie zabiera drugiej połowy usługi.
- [ ] **OpenRouter** — konto z doładowaniem plus **Management API key** (inny byt niż zwykły klucz; zwykłym nie wywołasz `/api/v1/keys`). Aplikacja sama tworzy klucze runtime per użytkownik i sama je limituje.
- [ ] Wybór modeli tłumaczenia: `OPENROUTER_MODEL_FAST` (spekulatywne, tanie) i `OPENROUTER_MODEL_QUALITY` (po commicie). Sprawdź ceny — to jedyne miejsce, gdzie koszt tłumaczenia jest sterowalny.
- [ ] **Paddle** — konto sprzedawcy, weryfikacja firmy (hexart Sp. z o.o.), sandbox do testów.

## 2. Sekrety

```bash
# Ed25519 do podpisu session JWT
openssl genpkey -algorithm ed25519 -out jwt.key && openssl pkey -in jwt.key -pubout -out jwt.pub

# 32 bajty do szyfrowania kluczy runtime (AES-256-GCM)
openssl rand -base64 32

# AUTH_SECRET i IP_HASH_SALT
openssl rand -hex 32
```

- [ ] `infra/.env` uzupełniony (wzór zmiennych: `.env.example` + `infra/docker-compose.yml`)
- [ ] Plik zaszyfrowany SOPS/age, klucz prywatny **poza repozytorium** — `infra/secrets/README.md`
- [ ] `SESSION_JWT_PUBLIC_KEY_RELAY` = ta sama wartość co `SESSION_JWT_PUBLIC_KEY`. Relay dostaje wyłącznie połówkę publiczną: weryfikuje tokeny, nigdy ich nie wystawia.

## 3. VPS

Pełny runbook od czystej Ubuntu 24.04: [`infra/README.md`](../infra/README.md).

- [ ] Firewall: otwarte tylko 22, 80, 443
- [ ] `unattended-upgrades` włączone
- [ ] Użytkownik deploy bez roota, Docker zainstalowany
- [ ] DNS: `sub.hexart.io` **oraz** `relay.sub.hexart.io` → IP maszyny (rekord A dla `sub` już jest; **`relay` trzeba dodać**)
- [ ] `./infra/deploy.sh` — build, migracja, start, health check
- [ ] `curl https://sub.hexart.io/api/health` zwraca `{"status":"ok"}`
- [ ] Certyfikaty Caddy wystawione (sprawdź logi kontenera `caddy`)
- [ ] `infra/backup.sh` w cronie, **odtworzenie backupu przetestowane** — backup, którego nie odtworzyłeś, nie jest backupem

## 4. Pierwszy realny strumień ← **próg prawdy**

Do tego momentu nic nie dowodzi, że produkt działa: testy mockują dostawców, bo płatne API w CI są zakazane (AGENTS.md §6).

- [ ] Konto, potwierdzenie e-maila, 10 credits triala
- [ ] Studio: mikrofon, polski → angielski, START
- [ ] Napisy pojawiają się w podglądzie
- [ ] Link projektora wklejony do OBS jako Browser Source, 1920×1080, przezroczyste tło
- [ ] **Odśwież źródło w OBS** — napisy wracają bez utraty treści (`snapshot` + `resume`)
- [ ] Lektor: druga Browser Source na `/voice`, „Control audio via OBS" zaznaczone
- [ ] Zmierz w logach: `medianStabilizeMs`, `rewriteRate`, `cpsP95`, `droppedCards`
- [ ] Zużycie credits zgadza się z czasem sesji (`credit_ledger` vs `caption_sessions.billable_seconds`)
- [ ] Wyzeruj saldo w trakcie sesji — musi zamknąć się miękko, **bez komunikatu na wizji**
- [ ] Porównaj rachunek ElevenLabs z sumą ledgera. Rozjazd > 5% to incydent, nie zaokrąglenie.

## 5. Płatności

- [ ] Produkty w Paddle: 3 subskrypcje + 3 pakiety doładowań (ceny → `packages/billing/src/plans.ts`)
- [ ] `PADDLE_CATALOG` = `priceId:kind:credits[:planCode]` po przecinku
- [ ] Webhook wskazuje na `https://sub.hexart.io/api/webhooks/paddle`, sekret w `.env`
- [ ] Zakup w sandboxie → credits w ledgerze, saldo się zgadza
- [ ] **Powtórz ten sam webhook** — credits nie mogą się zdublować (idempotencja po `event_id`)
- [ ] Zwrot w sandboxie → `refund_customer` w ledgerze
- [ ] Checkbox art. 38 pkt 13 zapisuje się w `consents` z wersją regulaminu

## 6. Prawo

- [ ] Dane rejestrowe hexart Sp. z o.o. wstawione zamiast `[DO UZUPEŁNIENIA: …]` w `/legal/*` i w stopce: KRS, NIP, REGON, adres, kapitał, sąd rejestrowy, imię i nazwisko Prezesa
- [ ] Regulamin i polityka prywatności **przeczytane przez radcę prawnego**
- [ ] DPA podpisane: ElevenLabs, OpenRouter, Paddle, dostawca VPS
- [ ] Rejestr czynności przetwarzania (RODO art. 30) + pisemna decyzja o braku DPIA
- [ ] Rozliczenie Paddle potwierdzone z księgowością (VAT NP, KSeF)
- [ ] `security@hexart.pl` i `kontakt@hexart.pl` faktycznie odbierane

## 7. Zanim wpuścisz ludzi

- [ ] Beta zamknięta: 5–10 streamerów. Ich `rewriteRate` i `droppedCards` decydują o starcie, nie przeczucie.
- [ ] Rotacja kluczy w kalendarzu (+90 dni) — [`runbooks/key-rotation.md`](runbooks/key-rotation.md)
- [ ] Nocna kontrola: `credit_balances.balance` vs `SUM(credit_ledger.delta)` — [`runbooks/incident-p1.md`](runbooks/incident-p1.md)
- [ ] Alert, gdy relay nie odpowiada na `/healthz`
- [ ] Ktoś wie, co zrobić, gdy ElevenLabs padnie w środku czyjegoś streamu

---

## Czego świadomie nie ma w v1

Tłumaczenie z pliku · diaryzacja mówców · klonowanie głosu · wtyczka OBS · konta zespołowe · eksport SRT.

Każde z nich to osobne Issue z etykietą `v2`. Nie wchodzą do MVP i nie są tematem code review.
