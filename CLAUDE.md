# CLAUDE.md

**Przeczytaj [`AGENTS.md`](./AGENTS.md) przed pierwszą zmianą w tym repo.** Zawiera zasady pracy równoległej, podział na pasy (lanes), konwencje gita i Definition of Done. Ten plik to tylko skrót.

## Zanim zaczniesz

1. `AGENTS.md` — zasady, pasy, zakazy
2. `docs/ARCHITECTURE.md` — jak to działa
3. `.agents/lanes.md` — który pas jest twój i jakich ścieżek dotykasz

## Twarde reguły

- Pracujesz **w jednym pasie**. Poza swoim pasem: zakładasz Issue, nie naprawiasz.
- Zmiana `packages/contracts` wymaga RFC (`docs/rfc/`) i bumpu `protocolVersion`.
- `packages/caption-engine` i `packages/billing` są **czyste** — zero I/O, czas wstrzykiwany parametrem.
- Zero sekretów w repo. Zero płatnych wywołań API (ElevenLabs, OpenRouter, Paddle live) z testów i CI.
- Ceny i przeliczniki credits: tylko `packages/billing/src/plans.ts` + `docs/BILLING.md`, tylko decyzją właściciela.
- `pnpm verify` przed każdym PR. Bez `--no-verify`, bez force push na `main`.
- Nie zgadujesz zachowania API ElevenLabs/OpenRouter — sprawdzasz w aktualnej dokumentacji i linkujesz w PR.

## Język

Kod, komentarze, commity, PR — **angielski**. Dokumentacja w `docs/` i `AGENTS.md` — **polski**. UI — i18n `pl` + `en`.

## Trzy rzeczy, które łatwo zepsuć

1. **Widok projektora idzie na antenę.** Żadnych błędów, ostrzeżeń o credits ani brandingu poza trybem Trial.
2. **Ledger jest append-only.** Saldo to `SUM(delta)`, nigdy bezpośredni UPDATE.
3. **Audio nie jest zapisywane.** PR zmieniający to wymaga aktualizacji `docs/legal/privacy-policy.md` w tym samym PR.
