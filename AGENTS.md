# AGENTS.md — zasady prowadzenia repozytorium

> **Czytasz to jako pierwszy plik.** Obowiązuje wszystkich: ludzi i agentów AI.
> Repo: `sub.hexart.io` · Operator: **hexart Sp. z o.o.**
> Zmiana tego pliku = PR z etykietą `governance`, akceptacja właściciela repo.

---

## 0. TL;DR dla agenta

1. Przeczytaj `AGENTS.md` (ten plik) + `docs/ARCHITECTURE.md`.
2. Weź **jedno** zadanie z GitHub Issues, przypisz do siebie, ustaw label `status:doing`.
3. Sprawdź w §3, czy zadanie mieści się **w twoim pasie (lane)**. Jeśli dotyka cudzych ścieżek → §4 (RFC).
4. Branch: `lane/<lane>/<issue-nr>-<slug>`.
5. Pisz kod + testy. `pnpm verify` musi przechodzić lokalnie.
6. PR do `main`, szablon wypełniony, squash merge.
7. Nigdy: sekrety w repo, `--no-verify`, force push na `main`, edycja poza swoim pasem bez RFC.

---

## 1. Język i konwencje

| Element | Język |
|---|---|
| Kod, nazwy zmiennych/plików, typy | **angielski** |
| Komentarze w kodzie, JSDoc | **angielski** |
| Commity, PR title/body, nazwy branchy | **angielski** |
| Dokumentacja w `docs/`, `AGENTS.md`, RFC | **polski** |
| Teksty UI | i18n: `pl` + `en` (klucze angielskie) |
| Dokumenty prawne (`docs/legal/`) | **polski** (wersja wiążąca) + `en` (informacyjna) |

Formatowanie: Prettier + ESLint (flat config) + `tsc --noEmit`. Zero `any` bez `// eslint-disable-next-line` z uzasadnieniem w tej samej linii.

---

## 2. Struktura monorepo

```
sub.hexart.io/
├── apps/
│   ├── web/                 # Next.js 15 (App Router) — landing, auth, panel, studio, projector
│   └── relay/               # Bun + uWebSockets.js — pipeline audio, metering, cut-off
├── packages/
│   ├── contracts/           # ⚠️ ŹRÓDŁO PRAWDY: zod + typy (protokół WS, DTO API, zdarzenia)
│   ├── db/                  # Drizzle ORM: schema + migracje
│   ├── caption-engine/      # czysty TS, ZERO I/O — stabilizacja, łamanie linii, governor cps
│   ├── billing/             # czysty TS — ledger credits, wycena, plany
│   └── ui/                  # komponenty (shadcn/ui + Tailwind), design tokens
├── docs/                    # architektura, produkt, prawo, RFC
├── infra/                   # docker-compose, Caddyfile, skrypty deploy
├── .agents/                 # definicje pasów, protokół pracy równoległej
└── .github/workflows/       # CI
```

**Zasada twarda:** `packages/caption-engine` i `packages/billing` są **czyste** — bez `fetch`, bez `fs`, bez `Date.now()` w logice (czas wstrzykiwany parametrem). Dzięki temu są w 100% testowalne deterministycznie i to jest ich wymóg jakościowy (patrz §6).

---

## 3. Pasy pracy (lanes) — kto co posiada

Praca równoległa działa tylko wtedy, gdy agenci **nie dotykają tych samych plików**. Każdy pas ma wyłączność na swoje ścieżki.

| Lane | Właściciel ścieżek | Zakres |
|---|---|---|
| `contracts` | `packages/contracts/**` | Schematy zod, protokół WS, wersjonowanie |
| `engine` | `packages/caption-engine/**` | Stabilizacja partiali, łamanie linii, reading rate, cache tłumaczeń |
| `relay` | `apps/relay/**` | WS server, ElevenLabs STT/TTS, OpenRouter, metering, backpressure |
| `web-app` | `apps/web/app/(app)/**`, `apps/web/app/api/**` | Panel, studio, konto, sesje |
| `web-site` | `apps/web/app/(site)/**`, `apps/web/app/(legal)/**` | Landing, pricing, dokumenty prawne |
| `projector` | `apps/web/app/projector/**` | Warstwa OBS: render napisów, `/voice` |
| `billing` | `packages/billing/**`, `apps/web/app/api/webhooks/paddle/**` | Ledger, plany, Paddle, faktury |
| `auth-sec` | `apps/web/lib/auth/**`, `apps/web/middleware.ts` | Auth, sesje, rate limit, CSP |
| `data` | `packages/db/**` | Schema, migracje, indeksy |
| `infra` | `infra/**`, `.github/**` | CI/CD, Docker, monitoring |

Plik `.agents/lanes.md` zawiera aktualną, maszynowo czytelną wersję tej tabeli (`CODEOWNERS` jest z niej generowany).

Granice pasów są **egzekwowane w CI** — `.github/workflows/lane-guard.yml` odrzuca PR dotykający więcej niż jednego pasa (chyba że ma etykietę `rfc` lub `governance`) oraz PR wprowadzający pliki spoza jakiegokolwiek pasa.

### Reguły
- Agent pracuje **w jednym pasie na raz**.
- Plik `apps/web/package.json`, `pnpm-lock.yaml`, `tsconfig.base.json` = **strefa wspólna**: zmiana tylko wtedy, gdy jest częścią zadania, jedna zmiana na PR, nigdy refaktor „przy okazji".
- Zauważysz bug poza swoim pasem → **zakładasz Issue**, nie naprawiasz.

---

## 4. `packages/contracts` — jedyny punkt sprzęgu

Wszystko, co przechodzi przez granicę procesu (przeglądarka ↔ relay ↔ web ↔ projector), ma schemat zod w `packages/contracts`. Zero „ręcznych" typów po obu stronach.

Zmiana kontraktu:
1. RFC: `docs/rfc/NNNN-<slug>.md` (szablon: `docs/rfc/0000-template.md`).
2. Wersja protokołu w `contracts/src/version.ts` — **SemVer**.
3. Zmiana łamiąca (breaking) wymaga okna zgodności: relay i projector przez min. jedno wydanie obsługują starą i nową wersję (`protocolVersion` w handshake). Projector siedzi w cudzym OBS-ie i **nie odświeży się na zawołanie** — to nie jest opcjonalne.
4. PR z RFC + implementacją w `contracts` **osobno** od PR-ów konsumentów.

---

## 5. Git

**Branch:** `lane/<lane>/<issue>-<slug>` → `lane/engine/42-stability-window`
**Commit:** [Conventional Commits](https://www.conventionalcommits.org/), scope = lane.

```
feat(engine): add two-frame stability window for partial tokens
fix(relay): stop billing when upstream STT socket closes
docs(legal): add art. 38 pkt 13 consent checkbox copy
```

- `main` jest chroniony: PR + zielone CI + 1 review. Squash merge, historia liniowa.
- **Zakaz** `--no-verify`, `--force` na `main`, commitowania `.env*`.
- Rebase na `main` przed PR. Konflikt w cudzym pasie = sygnał, że złamałeś §3.
- Jeden PR = jedno zadanie. > 400 zmienionych linii → podziel albo uzasadnij w opisie.

---

## 6. Jakość — bramka `pnpm verify`

```bash
pnpm verify   # typecheck + lint + test + build — musi przejść przed PR
```

| Paczka | Wymóg |
|---|---|
| `caption-engine` | ≥ 90% coverage (statements+branches). Każdy bug = najpierw test odtwarzający |
| `billing` | ≥ 95% coverage. Ledger nie ma prawa się rozjechać |
| `relay` | testy integracyjne na **zamockowanym** ElevenLabs (nagrane fixture'y WS) |
| `web` | Playwright: rejestracja → trial → studio → projector → zakup (Paddle sandbox) |
| reszta | typecheck + lint |

CI odpala też: `gitleaks` (sekrety), `pnpm audit --prod`, budowę obrazu Dockera relay.

**Nigdy nie odpalaj płatnych API w testach.** ElevenLabs i OpenRouter w CI = mock. Kontrakt z realnym API weryfikuje osobny, ręcznie odpalany job `contract-check` (nightly, limit budżetu).

---

## 7. Sekrety i dane

- Sekrety **wyłącznie** w SOPS + age: `infra/secrets/*.enc.yaml`. Klucz prywatny nigdy w repo.
- Lokalnie: `.env.local` (w `.gitignore`), wzór w `.env.example` z pustymi wartościami.
- Klucze ElevenLabs / OpenRouter / Paddle **istnieją tylko w `apps/relay` i server-side `apps/web`**. Jeśli klucz może trafić do bundla klienckiego — to błąd krytyczny, PR odrzucony.
- Zakaz logowania: treści audio, transkrypcji, tokenów, e-maili w plaintext. Logi strukturalne (pino), pola wrażliwe redagowane whitelistą.
- Audio użytkownika **nie jest zapisywane** — pass-through. Każdy PR, który to zmienia, wymaga aktualizacji `docs/legal/privacy-policy.md` w tym samym PR.

---

## 8. Zależności

- Nowa zależność produkcyjna = uzasadnienie w opisie PR (co robi, dlaczego nie da się bez niej, licencja, rozmiar).
- Licencje: dozwolone MIT / Apache-2.0 / BSD / ISC. **GPL/AGPL zakaz** (produkt komercyjny zamknięty).
- Zero zależności z < 6 mies. historii dla kodu dotykającego auth, płatności, kryptografii.

---

## 9. Definition of Done

Zadanie jest skończone, gdy:

- [ ] Kod + testy w swoim pasie, `pnpm verify` zielone
- [ ] Kontrakty zaktualizowane w `packages/contracts` (jeśli dotyczy) z RFC
- [ ] Dokumentacja w `docs/` zaktualizowana w **tym samym PR**
- [ ] Brak nowych `TODO` bez numeru Issue (`// TODO(#123):`)
- [ ] Zmiana dotykająca danych osobowych / płatności / audio → checkbox „wpływ na dokumenty prawne" w PR rozstrzygnięty
- [ ] Issue zamknięte przez `Closes #N`

---

## 10. Czego agentowi nie wolno

1. Pushować na `main` bezpośrednio.
2. Edytować plików poza swoim pasem bez RFC.
3. Dodawać sekretów, kluczy, danych produkcyjnych do repo.
4. Wywoływać płatnych API (ElevenLabs, OpenRouter, Paddle live) z testów lub CI.
5. Zmieniać cennika, treści prawnych, stawek credits **bez wyraźnej decyzji właściciela** — te wartości mają jedno źródło: `packages/billing/src/plans.ts` + `docs/BILLING.md`.
6. Uruchamiać migracji na bazie produkcyjnej. Migracje idą przez pipeline.
7. Wyłączać lintera, testów, CSP, rate limitów „żeby przeszło".
8. Zgadywać zachowania API ElevenLabs/OpenRouter — sprawdzasz w aktualnej dokumentacji i linkujesz w PR.

---

## 11. Eskalacja

Blokada > 30 min → komentarz w Issue z: co próbowałeś, co zwróciło błąd (najkrótsza decydująca linia), jakie widzisz opcje. Nie improwizuj wokół blokady, jeśli obejście dotyka innego pasa.
