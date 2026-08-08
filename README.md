# sub.hexart.io

Napisy na żywo do OBS — transkrypcja, tłumaczenie i lektor AI w czasie rzeczywistym.
Operator: **hexart Sp. z o.o.**

Wybierasz mikrofon i język. Dostajesz link. Wklejasz go w OBS jako Browser Source.

---

## Dokumentacja

| Dokument | Zawartość |
|---|---|
| **[AGENTS.md](./AGENTS.md)** | **Zasady prowadzenia repo — czytaj pierwsze** |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Architektura, protokół, budżet latencji, zarządzanie kluczami |
| [docs/CAPTION-ENGINE.md](./docs/CAPTION-ENGINE.md) | Silnik napisów: stabilizacja, łamanie linii, tempo, bramkowanie TTS |
| [docs/BILLING.md](./docs/BILLING.md) | Credits, plany, COGS, ledger, Paddle |
| [docs/SECURITY.md](./docs/SECURITY.md) | Model zagrożeń, tokeny, klucze, RODO w praktyce |
| [docs/LEGAL.md](./docs/LEGAL.md) | Regulamin, odstąpienie, VAT/MoR, AI Act |
| [docs/PRODUCT.md](./docs/PRODUCT.md) | Landing, onboarding, studio, przypadki brzegowe |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Milestone'y i podział pracy równoległej |
| [.agents/lanes.md](./.agents/lanes.md) | Pasy pracy dla agentów |

---

## Stack

**Web** Next.js 15 (standalone) · React 19 · Tailwind 4 · własna warstwa auth (jose + argon2id)
**Relay** Node 22 · `ws` · pino
**Dane** Postgres 17 · Redis 7 · Drizzle
**AI** ElevenLabs Scribe v2 Realtime (STT) · OpenRouter (tłumaczenie) · ElevenLabs Flash v2.5 (TTS)
**Płatności** Paddle (Merchant of Record)
**Hosting** jeden VPS, Docker Compose za Caddy (automatyczne TLS) — `sub.hexart.io`

---

## Struktura

```
apps/web           Next.js — landing, panel, studio, projektor
apps/relay         Bun WS — pipeline audio, metering, cut-off
packages/contracts Protokół i DTO (zod) — źródło prawdy
packages/caption-engine  Silnik napisów (czysty TS, zero I/O)
packages/billing   Ledger credits (czysty TS)
packages/db        Schemat i migracje
packages/ui        Komponenty
infra              Docker, Caddy, deploy
```

---

## Start

```bash
pnpm install && cp .env.example .env.local && pnpm db:migrate && pnpm dev
```

`pnpm dev` podnosi `apps/web` na `:3000` i `apps/relay` na `:8787`.

```bash
pnpm verify
```

typecheck + lint + test + build. **Musi przechodzić przed każdym PR.**

---

## Zasady w trzech zdaniach

1. Klucze dostawców nigdy nie opuszczają serwera; użytkownik nie widzi ich nawet pośrednio.
2. Audio nie jest zapisywane — przepływa i znika.
3. Widok projektora idzie na antenę: nie pojawia się w nim nic poza napisami.

---

© hexart Sp. z o.o. Kod zamknięty, wszelkie prawa zastrzeżone.
