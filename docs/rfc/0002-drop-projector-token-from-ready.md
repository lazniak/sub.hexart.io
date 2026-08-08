# RFC 0002 — Usunięcie `projectorToken` z `RelayReady`

- **Autor:** integracja pasów
- **Pas:** `contracts`
- **Status:** wdrożony
- **Dotyczy protokołu:** tak — `1.0.0` → `1.1.0`

## Problem

`RelayReady` wymagał pola `projectorToken`. Relay nie ma skąd znać tej wartości:

- token mintuje `/api/session/start` w warstwie web,
- baza przechowuje **wyłącznie** jego skrót (`caption_sessions.projector_token_hash`),
- relay może jedynie zahashować to, co przedstawi Browser Source, i sprawdzić dopasowanie.

Implementacja obeszła ten brak, generując w relay **własny** token `pt_…` i wysyłając go w `ready`. Skutki, które wyłapał przegląd adwersaryjny:

1. **Projektor nigdy się nie łączył.** Studio wkleja do OBS `projectorUrl` z odpowiedzi API, a relay indeksował swój własny, inny token. Każdy realny attach kończył się zamknięciem 4004.
2. **Rotacja linku nic nie unieważniała.** `POST /api/session/[id]/projector-token` podmieniał skrót w bazie, którego relay w ogóle nie używał — wbrew `SECURITY.md` §3.
3. **Drugi, nieodwoływalny sekret** wyciekał do studia w `ready`.

Pole, którego nadawca musi się domyślić, to pole, które kłamie. Naprawa samego relay usunęłaby objaw, zostawiając w kontrakcie zaproszenie do powtórzenia błędu.

## Decyzja

Usunąć `projectorToken` z `RelayReady`.

Studio dostaje `projectorToken` i `projectorUrl` w `StartSessionResponse` z `/api/session/start` — od procesu, który je faktycznie mintuje. Relay rozwiązuje token wyłącznie przez skrót, przy **każdym** attachu (`resolveProjectorSession`), dzięki czemu „Wygeneruj nowy link" działa natychmiast.

Przy okazji: `ProjectorRole` jest teraz eksportowany z `@sub/contracts`. Był deklarowany ręcznie w dwóch miejscach — dokładnie ten rodzaj kopiowania kontraktu, którego zakazuje `AGENTS.md` §4.

## Zgodność wsteczna

Zmiana **łamiąca**, wdrożona bez okna zgodności — świadomie i tylko dlatego, że `1.0.0` nigdy nie trafiło na produkcję. Żaden Browser Source w świecie nie mówi tą wersją.

`SUPPORTED_PROTOCOL_VERSIONS` zawiera wyłącznie `1.1.0`. **Od tego momentu reguła z AGENTS.md §4 obowiązuje bez wyjątku**: każda kolejna zmiana łamiąca wymaga wydania, w którym relay i projektor obsługują obie wersje. Projektor żyje w cudzym OBS i nie odświeży się na zawołanie.

## Alternatywy

| Rozważone | Dlaczego odpadło |
|---|---|
| Dodać `pt` do `RelayJwtClaims` | Token wędrowałby przez trzeci proces bez powodu. Studio już go ma. |
| Zostawić pole opcjonalne | Opcjonalne pole, którego nikt nie wypełnia, to martwy kod, który ktoś kiedyś wypełni źle. |
| Relay mintuje i zapisuje skrót do bazy | Odbiera rotacji sens: relay nadpisywałby to, co właśnie zrotował panel. |

## Wpływ na bezpieczeństwo

Wyłącznie pozytywny: o jeden sekret mniej na drucie, rotacja linku faktycznie działa. Zaktualizowano też kod zamknięcia WebSocketu projektora — `EndReason` (np. `credits_exhausted`) opisuje konto i nie ma czego szukać na powierzchni antenowej, nawet w ramce close.
