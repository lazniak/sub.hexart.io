# Architektura — sub.hexart.io

Live subtitles + tłumaczenie + lektor AI, wpinane do OBS jako Browser Source.

---

## 1. Widok z lotu ptaka

```
┌────────────────────┐        ┌──────────────────────┐
│  STUDIO (browser)  │        │  PROJECTOR (OBS      │
│  apps/web /studio  │        │  Browser Source)     │
│                    │        │  apps/web /projector │
│  mic → AudioWorklet│        │                      │
│  PCM16 16kHz       │        │  napisy / lektor     │
└─────────┬──────────┘        └───────────▲──────────┘
          │ WSS audio (bin)               │ WSS events (JSON)
          │ + session JWT                 │ + projector token
          ▼                               │
   ┌──────────────────────────────────────┴───────────┐
   │  RELAY  (Bun + uWebSockets.js, Hetzner FSN1, EU)  │
   │                                                   │
   │  SessionActor  ── metering (1s tick) ── cut-off   │
   │      │                                            │
   │      ├─► ElevenLabs Scribe v2 Realtime  (WSS)     │
   │      ├─► OpenRouter  /chat/completions  (HTTPS)   │
   │      └─► ElevenLabs TTS Flash v2.5      (WSS)     │
   └──────────┬────────────────────────────────────────┘
              │ ledger writes (batched 10s + on close)
              ▼
   ┌──────────────────────┐     ┌───────────────────────┐
   │ Postgres 17          │     │ Redis 7               │
   │ users, ledger, plany │     │ sesje, rate-limit, RT │
   └──────────────────────┘     └───────────────────────┘

   ┌──────────────────────┐
   │ WEB (Next.js 15      │  landing · auth · panel · studio · projektor · webhooki Paddle
   │ standalone)          │
   └──────────────────────┘
```

**Gdzie to stoi.** Wszystko na jednym VPS w Docker Compose za Caddy (automatyczne TLS).
Rekord A `sub.hexart.io` wskazuje na tę maszynę. Postgres i Redis nie wystawiają
portów na hosta — sieć wewnętrzna kontenerów. Runbook → [`infra/README.md`](../infra/README.md).

**Dlaczego relay, a nie połączenie przeglądarka → ElevenLabs?**
ElevenLabs oferuje single-use tokeny do klienta (`tokens.singleUse.create("realtime_scribe")`, 15 min). Kuszące, ale wtedy:
- nie mamy twardego cut-offu po wyczerpaniu credits (klient trzyma stream),
- nie mamy dokładnego pomiaru zużycia (tylko szacunek po fakcie),
- tłumaczenie i TTS i tak muszą iść przez nasz backend (klucz OpenRouter, kolejka TTS).

Relay kosztuje ~15–25 ms dodatkowej latencji (przeglądarka ↔ VPS ↔ ElevenLabs EU) i daje pełną kontrolę rozliczeń. Ta wymiana jest opłacalna.

---

## 2. Budżet latencji (partial caption)

| Etap | ms |
|---|---|
| Capture + AudioWorklet resample do 16 kHz mono | 20–40 |
| Browser → Relay (WSS, EU) | 10–25 |
| Relay → ElevenLabs EU | 10–20 |
| Scribe v2 Realtime `PARTIAL_TRANSCRIPT` | ~150 |
| Stabilizacja (2 klatki partiali) | 0–160 |
| Relay → Projector | 10–25 |
| Render (rAF) | 16 |
| **Napisy w języku źródłowym** | **~250–430** |
| + tłumaczenie LLM (stream, model fast) | +120–300 |
| **Napisy przetłumaczone** | **~400–730** |
| + TTS Flash v2.5 TTFB | +75 |
| **Lektor (start mowy od końca zdania)** | **~0.6–1.0 s** |

Lektor startuje dopiero na **zdaniu domkniętym** (`COMMITTED_TRANSCRIPT`), więc realne opóźnienie względem mówcy to 1,2–2,0 s — normalne dla tłumaczenia symultanicznego.

---

## 3. Komponenty

### 3.1 `apps/web` — Next.js 15, App Router, Vercel FRA1

| Trasa | Rola |
|---|---|
| `/` `(site)` | Landing — 1 ekran, co to jest, 3 kroki, cennik, CTA |
| `/pricing`, `/legal/*` | Cennik, regulamin, polityka prywatności, DPA |
| `/app` `(app)` | Panel: credits, sesje, historia, faktury, glosariusz |
| `/app/studio` | **Główny ekran**: mic + języki + start/stop + link do OBS |
| `/projector/:token` | Warstwa napisów dla OBS (transparent, zero UI) |
| `/projector/:token/voice` | Strona-tylko-audio dla lektora (OBS Browser Source) |
| `/api/session/start` | Wycena, rezerwacja credits, wydanie session JWT |
| `/api/webhooks/paddle` | Zakupy, odnowienia, zwroty → ledger |

Renderowanie: landing statyczny (ISR), panel dynamiczny, projector **czysto kliencki** (żadnego SSR — musi wstać w OBS w < 300 ms i przeżyć refresh).

### 3.2 `apps/relay` — Bun + uWebSockets.js, Hetzner FSN1

Jeden proces, N `SessionActor`. Actor = maszyna stanów jednej sesji, właściciel wszystkich socketów upstream. Bez współdzielonego stanu między sesjami poza licznikami.

```ts
SessionActor:
  states: INIT → RUNNING → DRAINING → CLOSED
  owns:   sttSocket, ttsSocket?, translateQueue, ledgerTicker
  in:     AudioFrame(bin) | Control(json)
  out:    ProjectorEvent(json)
```

Skalowanie poziome: sticky routing po `sessionId` (Caddy + consistent hash) — sesja żyje w jednym procesie, nigdy nie migruje. Restart relay = graceful drain (odmowa nowych, dokończenie istniejących do 10 min).

### 3.3 `packages/caption-engine` — czysta logika

Zero I/O. Wejście: zdarzenia Scribe + zegar wstrzyknięty. Wyjście: operacje na buforze napisów. Szczegóły → [`CAPTION-ENGINE.md`](./CAPTION-ENGINE.md).

### 3.4 Dane

**Postgres (Neon, region EU — Frankfurt)**
```
users               id, email, email_verified_at, password_hash(argon2id), totp_secret_enc, created_at
accounts_oauth      user_id, provider, provider_uid
billing_profiles    user_id, company_name, vat_id, country, address   -- do faktur B2B
subscriptions       user_id, paddle_sub_id, plan_code, status, current_period_end
credit_ledger       id, user_id, delta, reason, session_id, meta jsonb, created_at   -- APPEND-ONLY
credit_balance      user_id, balance, updated_at   -- materializowany widok, przeliczalny z ledgera
sessions            id, user_id, started_at, ended_at, src_lang, dst_langs[], voice_on, credits_spent
glossaries          user_id, name, terms text[]     -- max 50 × 20 znaków (limit Scribe keyterms)
provider_keys       user_id, provider, key_hash, key_enc(AES-256-GCM), limit, created_at
audit_log           actor, action, target, meta jsonb, ip_hash, created_at
```

`credit_balance` **nigdy nie jest mutowane bezpośrednio** — tylko przez trigger/job z `credit_ledger`. Saldo da się w każdej chwili odtworzyć jako `SUM(delta)`. To jest zabezpieczenie księgowe, nie optymalizacja.

**Redis (Upstash EU)**
- `sess:{id}` — stan sesji, TTL 15 min, do reconnectu projektora
- `rl:{scope}:{key}` — sliding window rate limit
- `conc:{userId}` — licznik równoległych sesji (limit planu)
- `revoked:{jti}` — czarna lista session JWT

**Czego NIE trzymamy:** audio (nigdy), transkrypcji (domyślnie nie; opcja „zapisz transkrypt" → TTL 24 h, kasowane jobem).

---

## 4. Protokół (`packages/contracts`)

### 4.1 Studio → Relay (binarnie + kontrola)

```
BIN:  [1B type=0x01][4B seqLE][PCM16LE 16kHz mono, ramka 20 ms = 640B]
JSON: { t:"hello", protocolVersion:"1.0.0", jwt, config:{ srcLang:"auto"|ISO, dstLangs:["en"],
        voice:{ enabled, voiceId, speed }, glossaryId?, noVerbatim:true } }
      { t:"flush" }    // ręczny commit segmentu
      { t:"bye" }
```

### 4.2 Relay → Projector

```jsonc
{ "t":"snapshot", "seq":812, "cards":[...], "config":{...} }   // przy każdym connect
{ "t":"partial",  "seq":813, "cardId":"c41", "text":"dzisiaj pokażę wam", "stable":14 }
{ "t":"commit",   "seq":814, "cardId":"c41", "text":"Dzisiaj pokażę wam nowy setup.",
                  "tr":{ "en":"Today I'll show you my new setup." } }
{ "t":"retract",  "seq":815, "cardId":"c41", "text":"..." }    // korekta po commicie (rzadko)
{ "t":"tts",      "seq":816, "cardId":"c41", "lang":"en", "chunk":"<b64 mp3_44100_128>" }
{ "t":"credits",  "remaining": 412, "secondsLeft": 1236 }
{ "t":"notice",   "level":"warn", "code":"LOW_CREDITS" }
{ "t":"end",      "reason":"user"|"credits_exhausted"|"error" }
```

`seq` monotoniczny per sesja. Projector przy reconnect wysyła `{t:"resume", lastSeq}` → relay dosyła brakujące lub pełny `snapshot`. **Projector nigdy nie traci treści przy refreshu OBS.**

---

## 5. Zarządzanie kluczami providerów

Wymóg: system sam generuje i pilnuje kluczy, użytkownik ich nigdy nie widzi.

**OpenRouter** — mamy realny mechanizm: Management API `POST /api/v1/keys` z `Authorization: Bearer {MANAGEMENT_API_KEY}`.
- Przy pierwszej sesji użytkownika relay tworzy runtime key: `name = "u_{userId}"`, `limit` = ekwiwalent USD jego salda credits, `limit_reset: null`.
- Zaszyfrowany (AES-256-GCM) ląduje w `provider_keys`. Do przeglądarki **nigdy**.
- Przy każdym doładowaniu: `PATCH /api/v1/keys/{keyHash}` podnosi `limit`.
- Odczyt `usage` / `limit_remaining` = niezależna kontrola drugiego stopnia względem naszego ledgera. Rozjazd > 5% → alert.
- Rotacja co 90 dni + natychmiast przy podejrzeniu wycieku (`DELETE` + create).

**ElevenLabs** — brak per-user kluczy poza Enterprise. Model:
- Jeden klucz workspace, **wyłącznie w env relay**.
- Izolacja użytkownika = nasz `SessionActor` + ledger, nie klucz dostawcy.
- Osobne klucze per środowisko (dev / staging / prod) i per pipeline (STT / TTS) — ograniczenie promienia rażenia.
- Single-use tokeny (`realtime_scribe`) **nie są używane** — klient nie łączy się bezpośrednio.

---

## 6. Metering i cut-off (integralność rozliczeń)

```
tick co 1 s w SessionActor:
  cost = 1s × (1.0                              // STT + napisy źródłowe
             + 0.5 × (liczba języków docelowych)
             + 3.0 × voiceOn)                   // w jednostkach: credits/min → /60
  spent += cost
  if spent ≥ reserved - GRACE:  rezerwuj kolejną transzę z salda
  if brak salda:                → notice(LOW_CREDITS, 60s) → DRAINING → CLOSED(credits_exhausted)
```

- **Rezerwacja transzami** (60 s do przodu), nie zapis co sekundę — Postgres nie jest ścieżką gorącą.
- Zapis do `credit_ledger` co 10 s + zawsze przy zamknięciu sesji + w `process.on('SIGTERM')`.
- Crash relay = utrata max 10 s rozliczenia. Świadomie **na korzyść użytkownika**.
- Naliczamy tylko czas, w którym faktycznie płynie audio (VAD/cisza > 20 s → pauza licznika i STT).

---

## 7. Bezpieczeństwo — skrót

Pełny opis → [`SECURITY.md`](./SECURITY.md).

- **Session JWT** (EdDSA, TTL 60 s, aud `relay`) — wydawany przez `/api/session/start` po sprawdzeniu salda i limitu równoległości. Relay weryfikuje podpis + `revoked:{jti}` w Redis.
- **Projector token** — osobny, nieprzewidywalny (32 B), **read-only**, ważny tylko na czas sesji, zero uprawnień do konta. Ten link ląduje w OBS i **bywa widoczny na streamie** — dlatego nie może dawać nic poza podglądem napisów. Przycisk „wygeneruj nowy" unieważnia stary natychmiast.
- CSP strict z nonce, HSTS preload, brak zewnętrznych skryptów na `/projector/*`.
- Rate limit: per IP + per konto (Redis sliding window). Limit sesji równoległych z planu.

---

## 8. Wybory technologiczne i alternatywy

| Wybór | Dlaczego | Odrzucone |
|---|---|---|
| Node 22 + `ws` w relay | Przenośny build, jeden runtime w całym repo, przewidywalny w Dockerze | Bun + uWebSockets.js (szybsze, ale gorsza przenośność obrazu), Go (podział języka w monorepo) |
| Jeden VPS, Docker Compose, Caddy | Domena już wskazuje na tę maszynę; pełna kontrola RODO, brak vendor lock-in, jeden rachunek | Vercel + osobny host relay (dwa rachunki, transfer danych między dostawcami), Cloudflare DO (limity CPU na streamie audio) |
| Postgres 17 w kontenerze | Zero zależności zewnętrznych, dane u nas, backup `pg_dump` w cronie | Neon/Supabase (kolejny podprocesor i kolejny transfer do ujawnienia) |
| Drizzle | Typy z schematu, migracje w SQL, zero magii | Prisma (waga silnika w relay) |
| Paddle | Merchant of Record — VAT UE po ich stronie | Stripe (VAT OSS + KSeF po naszej) |
| Własna warstwa auth (jose + argon2id) | Pełna kontrola nad sesjami i rotacją, dane wyłącznie u nas, zero kosztu per MAU | Clerk/Auth0 (koszt per MAU, kolejny podprocesor poza EU) |
| PCM16 16 kHz | Wymóg Scribe v2 Realtime (`PCM_16000`) | Opus (wymagałby transkodowania w relay) |

---

## 9. Środowiska

| Env | Web | Relay | DB |
|---|---|---|---|
| `dev` | localhost:3000 | localhost:8787 | Postgres w Dockerze, lokalnie |
| `prod` | sub.hexart.io | relay.sub.hexart.io | Postgres 17 w Compose na VPS |

Staging dochodzi, gdy pojawi się pierwszy płacący klient — wcześniej to koszt bez zwrotu.
Osobne klucze providerów per środowisko. Paddle sandbox poza produkcją.
**Produkcja nigdy nie jest celem testów.**
