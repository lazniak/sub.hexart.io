## Co i dlaczego

<!-- 2-4 zdania. Problem → rozwiązanie. -->

Closes #

**Pas (lane):** `lane:`

## Jak sprawdzić ręcznie

1.
2.

## Checklist

- [ ] Dotknąłem wyłącznie ścieżek swojego pasa (`.agents/lanes.md`) — albo dołączam RFC
- [ ] `pnpm verify` zielone lokalnie
- [ ] Nowa logika ma test; naprawiony bug ma test odtwarzający
- [ ] Dokumentacja w `docs/` zaktualizowana w tym PR
- [ ] Zero sekretów, zero `TODO` bez `(#nr)`
- [ ] Zmiana kontraktu → RFC w `docs/rfc/` + bump `protocolVersion`

## Wpływ

- [ ] Dane osobowe / audio / transkrypcje → etykieta `legal-review`, `docs/legal/*` zaktualizowane
- [ ] Płatności lub ledger → testy idempotencji i cut-offu
- [ ] Ceny lub przeliczniki credits → **wymaga decyzji właściciela**, link do niej:
- [ ] Nowa zależność produkcyjna → uzasadnienie, licencja, rozmiar:
