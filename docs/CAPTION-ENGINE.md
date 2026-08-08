# Caption Engine — silnik napisów

`packages/caption-engine` · czysty TypeScript · zero I/O · zegar wstrzykiwany · ≥ 90% coverage

To jest serce produktu. Scribe v2 Realtime daje surowe `PARTIAL_TRANSCRIPT` / `COMMITTED_TRANSCRIPT`. Wyświetlenie ich wprost daje migoczącą, nieczytelną kaszę. Poniżej mechanizm, który zamienia to w napisy nadające się na antenę.

---

## 0. Problem

Scribe emituje partiale co ~100–200 ms i **wolno mu przepisać własne słowa** aż do commitu:

```
t=0.4  "dzisiaj po"
t=0.6  "dzisiaj poka"
t=0.8  "dzisiaj pokarze"      ← błąd
t=1.0  "dzisiaj pokażę wam"   ← poprawka wstecz
t=1.3  "dzisiaj pokażę wam no"
t=1.6  COMMITTED: "Dzisiaj pokażę wam nowy setup."
```

Naiwny render = tekst skacze, widz nie nadąża, a lektor jąka się na każdej poprawce. Rozwiązanie to siedem współpracujących mechanizmów.

---

## 1. Okno stabilności (stability window)

Token uznajemy za **stabilny**, gdy spełnia oba warunki:

1. przeżył `N = 2` kolejne partiale bez zmiany,
2. **nie leży w ogonie** — czyli nie jest jednym z ostatnich `K = 3` tokenów bieżącej hipotezy.

Warunek (2) jest kluczowy: ogon hipotezy to miejsce, gdzie model zgaduje. Bez niego „pokarze" zdążyłoby się utrwalić.

```ts
stablePrefixLength(history: Hypothesis[], n = 2, k = 3): number
```

Render:
- **prefiks stabilny** → pełna nieprzezroczystość,
- **ogon niestabilny** → `opacity: 0.55` (tryb `ghost`) albo ukryty (`tail: "hide"`).

Domyślnie `ghost` — widz dostaje informację ~200 ms wcześniej, a wzrok sam ignoruje przygaszony fragment. Dla przekazów formalnych `hide`.

**Parametry adaptacyjne.** `N` rośnie do 3, gdy w ostatnich 10 s wskaźnik przepisań (`rewriteRate`) przekroczy 15% — trudne audio (hałas, akcent) stabilizujemy mocniej kosztem +150 ms.

---

## 2. Bufor append-only + korekta atomowa

Tekst raz pokazany jako stabilny **nie znika**. Gdy Scribe przy commicie przyśle jednak inną treść:

- różnica tylko na granicy ostatniego zdania → cicha podmiana z 200 ms crossfade,
- różnica głębsza → zdarzenie `retract` i **wymiana całej karty naraz** (nie słowo po słowie).

Zasada: **jedna zmiana widoczna na raz**. Migotanie bierze się z częstości zmian, nie z ich wielkości.

---

## 3. Łamanie linii (line breaker)

Standard zgodny z praktyką nadawczą (EBU-TT-D / wytyczne Netflix):

- max **2 linie**, domyślnie **42 znaki** na linię (konfigurowalne 32–48),
- łamanie po priorytecie: **koniec zdania** > `:` `;` > `,` > granica frazy (przyimek/spójnik zaczyna nową linię) > ostatnia spacja,
- **nigdy** w środku słowa, liczby, adresu URL ani między liczbą a jednostką („5 kg" trzyma się razem),
- linia górna nie powinna być drastycznie dłuższa od dolnej — przy równym wyborze preferuj układ piramidy odwróconej (górna dłuższa) tylko dla zdań pełnych.

Tryb **roll-up** (domyślny dla live): gdy linia 2 się zapełni, linia 1 ← linia 2, linia 2 ← nowy tekst. Płynne przesunięcie w pionie (120 ms `translateY`), bez przeskoku.

Tryb **pop-on** (dla tłumaczeń, jakość > szybkość): karta pojawia się dopiero jako całe, domknięte zdanie.

---

## 4. Governor tempa czytania

Napisy szybsze niż wzrok są bezużyteczne. Limity:

| Parametr | Wartość | Uwaga |
|---|---|---|
| max prędkość | **17 znaków/s** | próg czytelności dla PL/EN |
| min czas karty | **1000 ms** | nawet dla „Tak." |
| max czas karty | **6000 ms** | potem wygaszenie |
| przerwa między kartami | **80 ms** | oko potrzebuje sygnału zmiany |

Gdy mówca przekracza budżet, **nie przyspieszamy** — kolejkujemy, a przy przepełnieniu kolejki (> 2 karty zaległości) skracamy najstarszą przez `no_verbatim` (wycięte „yyy", fałszywe starty). Jeśli to nie wystarczy, najstarsza karta jest porzucana z licznikiem `droppedCards` w telemetrii. **Nigdy nie renderujemy nieczytelnie szybko.**

---

## 5. Segmentacja pod tłumaczenie

Tłumaczenie każdego partiala = koszt × 10 i migotanie tłumaczenia. Wyzwalacze:

| Wyzwalacz | Warunek | Model |
|---|---|---|
| **speculative** | stabilny prefiks urósł o ≥ 25 znaków **i** minęło ≥ 400 ms od poprzedniego wywołania | fast (tani, streaming) |
| **final** | `COMMITTED_TRANSCRIPT` | quality (droższy, kontekstowy) |

Tłumaczenie spekulatywne wyświetlamy jako `ghost`. Przy commicie **atomowa** podmiana na wersję finalną. Użytkownik widzi tłumaczenie ~400 ms po mówcy, a poprawną wersję ~900 ms — zamiast czekać sekundę na cokolwiek.

### Okno kontekstu
Prompt do LLM zawsze niesie **2 ostatnie zdania domknięte** (źródło + tłumaczenie). Bez tego zaimki, rodzaj gramatyczny i terminologia rozjeżdżają się między zdaniami. To najtańszy pojedynczy skok jakości w całym pipelinie.

### Cache
Klucz `sha1(srcLang|dstLang|glossaryVersion|stablePrefix)`. Partiale mają wysoki współczynnik pokrycia prefiksów — cache LRU (1000 wpisów/sesja) obcina ~40% wywołań spekulatywnych.

---

## 6. Glosariusz

Jedna lista terminów użytkownika (nicki, nazwy marek, żargon) zasila **dwa** miejsca:

1. **Scribe** — `keyterms` (limit twardy: 50 terminów × 20 znaków). Poprawia rozpoznanie u źródła.
2. **LLM** — sekcja systemowa: „zachowaj te terminy bez zmian, nie tłumacz ich".

Bez tego „HEXART" staje się „heksart", a nick widza „xQc" — „iks ku ce". Dla streamera to różnica między zabawką a narzędziem.

---

## 7. Bramkowanie lektora (TTS)

Reguły niepodlegające negocjacji:

1. TTS **wyłącznie** na segmentach domkniętych. Nigdy na partialu.
2. Kolejka FIFO z backpressure: > 3 zdania zaległości → tryb kompresji (`no_verbatim`, skracanie wtrąceń).
3. > 6 zdań zaległości → pomijamy najstarsze i emitujemy `notice: VOICE_BEHIND`. Lektor spóźniony o 15 s jest gorszy niż lektor, który opuścił zdanie.
4. Prędkość mowy adaptacyjna w zakresie 0.9–1.15× — wyrównuje dryf bez „chipmunk effect".
5. Zdania < 3 słów łączymy z następnym (`chunk_length_schedule` i tak wymusiłby flush; osobne wywołanie = przerywana intonacja).
6. Połączenie TTS WS trzymamy otwarte przez całą sesję (`inactivity_timeout` max, `auto_mode: true`) — koszt zestawienia socketu to 150–300 ms na zdanie, których nie mamy.

---

## 8. Maszyna stanów karty

```
        partial(stable>0)          commit             timer
IDLE ────────────────────► LIVE ────────────► SETTLED ────────► FADING ──► GONE
                            │                    │  ▲
                            │  retract           │  │ retract
                            └────────────────────┴──┘
```

`cardId` jest stabilny przez cały cykl — projector animuje na miejscu, zamiast tworzyć nowy element DOM (co powodowałoby przeskok layoutu w OBS).

---

## 9. Render w projektorze

- **Zero re-layoutu**: karty pozycjonowane absolutnie, animacje wyłącznie `transform` + `opacity` (kompozytor GPU). OBS renderuje w CEF — każdy reflow to zgubiona klatka.
- **Tekst**: `text-wrap: balance`, `font-variant-numeric: tabular-nums`, cień/obwódka gwarantujące kontrast na dowolnym tle (podwójny `text-shadow` + opcjonalna półprzezroczysta plakietka).
- **Bezpieczny margines** 5% (title-safe) — konfigurowalny.
- **Presety**: `Clean` (biały tekst, cień), `Broadcast` (czarna plakietka, żółty tekst), `Minimal` (tylko jedna linia), `Karaoke` (podświetlenie stabilnego prefiksu).
- **Odporność na refresh**: `snapshot` przy connect + `resume(lastSeq)`. Odświeżenie Browser Source w OBS nie gubi ani jednej karty.
- Watchdog: brak `seq` przez 10 s → dyskretny wskaźnik reconnectu **poza kadrem title-safe** (nigdy nie wchodzi na wizję).
- `prefers-reduced-motion` respektowane w podglądzie w panelu (w OBS bez znaczenia).

---

## 10. Telemetria jakości

Zbierane per sesja (agregaty, **nigdy treść**):

`rewriteRate` · `medianStabilizeMs` · `cardsPerMin` · `droppedCards` · `cpsP95` · `translateCacheHitRate` · `ttsQueueDepthP95` · `sttReconnects`

Progi alertowe: `droppedCards > 0` lub `cpsP95 > 20` lub `ttsQueueDepthP95 > 4` → wpis diagnostyczny. Te liczby są jedynym obiektywnym miernikiem „czy napisy są dobre".

---

## 11. Testowanie

Silnik jest czysty, więc testujemy deterministycznie na **nagranych ścieżkach zdarzeń**:

```
packages/caption-engine/fixtures/
  pl-fast-speaker.jsonl      # 180 słów/min, dużo przepisań
  en-accented.jsonl          # wysoki rewriteRate
  pl-with-glossary.jsonl     # nicki i marki
  silence-gaps.jsonl         # pauzy > 20 s (pauza licznika)
  scribe-reconnect.jsonl     # zerwanie i wznowienie streamu
```

Golden tests: dla każdego fixture'a snapshot pełnej sekwencji operacji wyjściowych. Zmiana snapshotu wymaga uzasadnienia w PR. Każdy zgłoszony bug wchodzi najpierw jako nowy fixture.
