# Pasy pracy — protokół dla agentów równoległych

Maszynowo czytelne rozszerzenie §3 z [`AGENTS.md`](../AGENTS.md). Z tego pliku generowany jest `.github/CODEOWNERS`.

---

## Tabela pasów

| lane | paths (glob) | depends_on | testy |
|---|---|---|---|
| `contracts` | `packages/contracts/**` | — | typecheck |
| `engine` | `packages/caption-engine/**` | `contracts` | vitest ≥ 90% |
| `relay` | `apps/relay/**` | `contracts`, `engine`, `billing` | vitest + fixture WS |
| `web-app` | `apps/web/app/(app)/**`, `apps/web/app/api/session/**`, `apps/web/lib/studio/**` | `contracts` | playwright |
| `web-site` | `apps/web/app/(site)/**`, `apps/web/app/(legal)/**`, `apps/web/messages/**` | — | a11y (axe) |
| `projector` | `apps/web/app/projector/**` | `contracts`, `engine` | playwright |
| `billing` | `packages/billing/**`, `apps/web/app/api/webhooks/paddle/**`, `apps/web/app/api/checkout/**`, `apps/web/lib/server/paddle.ts` | `data` | vitest ≥ 95% |
| `auth-sec` | `apps/web/lib/auth/**`, `apps/web/middleware.ts`, `apps/web/app/(auth)/**` | `db` | vitest + playwright |
| `data` | `packages/db/**` | — | migracja w górę i w dół |
| `infra` | `infra/**`, `.github/**`, `Dockerfile*` | — | build obrazu |

---

## Strefa wspólna — wymaga ostrożności

Te pliki może dotknąć każdy pas, ale **tylko jako część swojego zadania**, jedna zmiana na PR, nigdy „przy okazji":

```
package.json (root)   pnpm-lock.yaml   pnpm-workspace.yaml
tsconfig.base.json    eslint.config.js  .env.example
```

Konflikt w tych plikach rozwiązuje się przez rebase, nigdy przez nadpisanie cudzej zmiany.

---

## Cykl życia zadania

```
Issue (label: lane:<nazwa>, status:todo)
   ↓  agent przypisuje siebie, ustawia status:doing
branch lane/<lane>/<issue>-<slug>
   ↓  kod + testy + docs w jednym PR
PR (Closes #N)  →  CI zielone  →  review  →  squash merge
   ↓
status:done
```

**Jeden agent = jedno `status:doing` na raz.** Zadanie zablokowane > 30 min → `status:blocked` + komentarz: co próbowałeś, najkrótsza decydująca linia błędu, jakie widzisz opcje.

---

## Etykiety

| Grupa | Wartości |
|---|---|
| pas | `lane:contracts` … `lane:infra` |
| status | `status:todo`, `status:doing`, `status:blocked`, `status:review`, `status:done` |
| typ | `type:feat`, `type:fix`, `type:docs`, `type:chore`, `type:security` |
| priorytet | `p0` (blokuje wydanie), `p1`, `p2` |
| specjalne | `governance` (zmiana AGENTS.md), `legal-review` (dotyka dokumentów prawnych), `rfc` (zmiana kontraktu), `v2` (poza MVP) |

---

## Protokół zmiany kontraktu

Zmiana `packages/contracts` zatrzymuje pracę innych pasów, więc ma osobną ścieżkę:

1. Issue z `rfc` + plik `docs/rfc/NNNN-<slug>.md` (szablon: `docs/rfc/0000-template.md`)
2. Komentarze pasów `relay`, `projector`, `web-app` — minimum 1 doba na sprzeciw
3. PR **tylko** z `contracts` + bump `protocolVersion` (SemVer)
4. Osobne PR-y konsumentów po zmergowaniu
5. Zmiana łamiąca: relay i projector obsługują starą i nową wersję przez minimum jedno wydanie. **Projector żyje w cudzym OBS i nie odświeży się na zawołanie.**

---

## Checklist przed otwarciem PR

- [ ] Dotknąłem wyłącznie ścieżek swojego pasa (albo mam RFC)
- [ ] `pnpm verify` zielone lokalnie
- [ ] Testy: nowa logika ma test; naprawiony bug ma test odtwarzający
- [ ] Docs w `docs/` zaktualizowane w tym samym PR
- [ ] Zero sekretów, zero `TODO` bez numeru Issue
- [ ] Zmiana dotyka danych osobowych / płatności / audio? → etykieta `legal-review`
- [ ] Zmiana dotyka cen lub przeliczników? → **STOP**, decyzja właściciela (§10.5 AGENTS.md)
- [ ] Opis PR: co, dlaczego, jak sprawdzić ręcznie
