# Roadmapa — praca równoległa

Milestone'y ułożone tak, żeby agenci z różnych pasów pracowali **jednocześnie**, nie czekając na siebie. Kluczem jest M0: kontrakty i schemat DB powstają pierwsze, potem reszta pracuje przeciw stabilnym interfejsom.

---

## M0 — Fundament *(sekwencyjnie, ~1 dzień, jeden agent)*

Blokuje wszystko inne. **Nikt nie startuje przed zakończeniem M0.**

- [ ] Monorepo: pnpm workspaces, TypeScript project references, Prettier, ESLint flat, Vitest
- [ ] `packages/contracts` — protokół WS v1.0.0, DTO API, zod + typy
- [ ] `packages/db` — schemat Drizzle (users, ledger, sessions, glossaries, provider_keys, audit_log), pierwsza migracja
- [ ] `packages/billing/src/plans.ts` — plany i przeliczniki jako dane
- [ ] `pnpm verify`, CI, `CODEOWNERS` z `.agents/lanes.md`, szablon PR, gitleaks
- [ ] `.env.example` + SOPS/age

---

## M1 — Rdzeń działa *(równolegle, 5 pasów)*

Cel: **własnym głosem widzę napisy w OBS.** Bez kont, bez płatności, klucze z `.env`.

| Lane | Zadanie |
|---|---|
| `engine` | Okno stabilności, bufor append-only, line breaker, governor cps, golden tests na 3 fixture'ach |
| `relay` | Serwer WS, `SessionActor`, most do Scribe v2 Realtime, fan-out do projektora, `snapshot`/`resume` |
| `projector` | Render z `contracts`, presety `Clean`/`Broadcast`, przezroczystość, reconnect, zero reflow |
| `web-app` | Studio: wybór mikrofonu, AudioWorklet → PCM16 16 kHz, start/stop, podgląd |
| `infra` | Docker relay, Caddy + TLS, deploy na Hetzner, GH Actions |

**Definicja ukończenia M1:** mówię do mikrofonu → napisy w OBS ≤ 500 ms, `pnpm verify` zielone, `rewriteRate` mierzony.

---

## M2 — Tłumaczenie i lektor *(równolegle, 3 pasy)*

| Lane | Zadanie |
|---|---|
| `engine` | Segmentacja pod tłumaczenie, okno kontekstu 2 zdań, cache LRU, spekulacja + atomowa podmiana |
| `relay` | OpenRouter (streaming, model fast + quality), TTS Flash v2.5 przez WS, kolejka z backpressure, bramkowanie zdaniami |
| `projector` | Druga linia (tłumaczenie), `/voice` jako osobne źródło audio, ducking-friendly wyjście |
| `web-app` | Wybór języków docelowych, wybór głosu, glosariusz (Scribe keyterms + prompt LLM) |

**Definicja ukończenia M2:** mówię po polsku → napisy EN ≤ 750 ms → lektor EN ≤ 1,5 s, bez jąkania i bez migotania.

---

## M3 — Konta i credits *(równolegle, 4 pasy)*

| Lane | Zadanie |
|---|---|
| `auth-sec` | Better Auth, argon2id, weryfikacja e-mail, Google OAuth, TOTP, rate limity, CSP, session JWT |
| `billing` | Ledger append-only, rezerwacja transzami, wygasanie, kolejność zużycia, `refund_incident` |
| `relay` | Metering 1 s, rezerwacje, twardy cut-off, zapis ledgera co 10 s + na SIGTERM |
| `web-app` | Panel: credits, sesje, konto, dane do faktury, limit równoległości |

**Definicja ukończenia M3:** trial 10 credits działa, zeruje się dokładnie, sesja zamyka się miękko, ledger zgadza się co do sekundy.

---

## M4 — Płatności i strona *(równolegle, 3 pasy)*

| Lane | Zadanie |
|---|---|
| `billing` | Paddle: checkout, subskrypcje, doładowania, webhooki z podpisem i idempotencją, zgoda art. 38 pkt 13 |
| `web-site` | Landing, cennik, i18n pl/en, dostępność WCAG 2.1 AA, OG/SEO |
| `web-site` | `docs/legal/*` → `/legal/*`, cookies, security.txt, punkt kontaktowy DSA |

**Definicja ukończenia M4:** zakup w Paddle sandbox → credits na koncie → sesja → zwrot działa. Dokumenty prawne opublikowane.

---

## M5 — Twardnienie *(równolegle)*

- [ ] Playwright e2e: rejestracja → trial → studio → projector → zakup
- [ ] Testy odporności: zerwanie sieci, restart relay, padnięcie providera, refresh OBS
- [ ] Telemetria jakości + alerty (`droppedCards`, `cpsP95`, rozjazd ledgera)
- [ ] Runbooki: rotacja kluczy, incydent P1, przywracanie webhooków
- [ ] Test obciążeniowy: 50 równoległych sesji na jednym relay
- [ ] Weryfikacja prawna dokumentów, podpisane DPA
- [ ] Beta zamknięta: 10 streamerów, ich `rewriteRate` i `droppedCards` decydują o starcie

---

## Zależności między pasami

```
M0 ──┬─► engine ──────────┐
     ├─► relay ───────────┼─► M1 ─┬─► engine+relay ──► M2 ──┐
     ├─► projector ───────┤       └─► projector ────────────┤
     ├─► web-app ─────────┘                                 ├─► M3 ─► M4 ─► M5
     └─► infra ────────────────────────────────────────────►┘
              auth-sec i billing mogą startować już po M0 (nie zależą od M1/M2)
```

`auth-sec` i `billing` nie mają zależności od pipeline'u audio — mogą ruszyć równolegle z M1. Realny sufit równoległości: **6–7 agentów** po zamknięciu M0.

---

## Kolejność, gdy zasoby są ograniczone

1. M1 (rdzeń) — bez tego nie ma produktu
2. M3 (credits) — bez tego nie ma biznesu
3. M2 (tłumaczenie + lektor) — to jest wyróżnik
4. M4 (płatności + strona)
5. M5 (twardnienie)

Napisy w jednym języku bez tłumaczenia to już użyteczny produkt (dostępność, napisy dla niesłyszących). Da się sprzedawać po M1+M3, jeśli zajdzie potrzeba wcześniejszego przychodu.
