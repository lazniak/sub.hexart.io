# RFC NNNN — <tytuł>

- **Autor:** <agent / osoba>
- **Pas:** <lane>
- **Status:** draft | dyskusja | zaakceptowany | odrzucony | wdrożony
- **Issue:** #N
- **Dotyczy protokołu:** tak / nie — jeśli tak: `1.2.0` → `1.3.0` (SemVer)

## Problem

Co dziś nie działa albo czego brakuje. Konkretnie, z przykładem.

## Propozycja

Zmiana w schematach / interfejsach. Wklej docelowy kod z `packages/contracts`.

```ts
```

## Wpływ na pasy

| Pas | Co musi się zmienić | Kto |
|---|---|---|
| `relay` | | |
| `projector` | | |
| `web-app` | | |

## Zgodność wsteczna

- [ ] Zmiana niełamiąca (dodanie pola opcjonalnego)
- [ ] Zmiana łamiąca — plan okna zgodności:
  - wydanie N: relay i projector obsługują obie wersje
  - wydanie N+1: usunięcie starej ścieżki

> Projector działa w cudzym OBS i nie odświeży się na zawołanie. Zmiana łamiąca bez okna zgodności urwie napisy komuś na wizji.

## Alternatywy

Co jeszcze rozważono i dlaczego odpadło.

## Wpływ na bezpieczeństwo / prawo / rozliczenia

Dotyka danych osobowych, audio, credits, cen? Jeśli tak — które dokumenty w `docs/` wymagają aktualizacji.

## Plan wdrożenia

1. PR z `contracts` + bump wersji
2. PR konsumentów (po kolei, per pas)
3. Usunięcie starej ścieżki (wydanie N+1)
