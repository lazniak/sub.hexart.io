# Monitoring — co obserwujemy i dlaczego

Jeden VPS, jeden operator. Nie budujemy tu obserwowalności „na wyrost" — pilnujemy
pięciu rzeczy, które faktycznie potrafią zepsuć produkt albo rozliczenia, plus
higieny hosta. Wszystko poniżej da się odczytać bez wchodzenia na maszynę.

**Zasada nadrzędna:** w metrykach i alertach nie ma danych osobowych. Żadnych
e-maili, `userId` tylko jako hash w treści incydentu, zero fragmentów transkrypcji
i zero audio (`AGENTS.md` §7). Etykiety metryk mają niską kardynalność —
`sessionId` jako label to wyciek i jednocześnie zabicie bazy metryk.

---

## 1. Skąd biorą się dane

| Źródło | Co daje |
|---|---|
| `relay:8787/metrics` | metryki procesu relay w formacie Prometheus, tylko sieć `edge` — Caddy tego nie wystawia |
| `relay:8787/healthz` | liveness; używa go health check compose i aktywny probe Caddy'ego |
| Postgres | zapytania kontrolne poniżej, odpalane cronem |
| `backup.sh` | `sub_pg_backup_success`, `sub_pg_backup_timestamp_seconds` (textfile collector) |
| Caddy `/metrics` (admin API, loopback) | kody odpowiedzi, czas do wygaśnięcia certyfikatów |

Ekspozycja `/metrics` i `/healthz` po stronie relay należy do pasa `relay` — ten
dokument opisuje, czego infra od nich oczekuje.

---

## 2. Relay: liczba aktywnych sesji

`relay_sessions_active` (gauge)

Najważniejsza pojedyncza liczba w systemie. Jeden proces trzyma wszystkie
`SessionActor`-y, a sesja nigdy nie migruje między procesami
(`ARCHITECTURE.md` §3.2), więc pojemność procesu jest twardym sufitem produktu.

| Warunek | Reakcja |
|---|---|
| `> 40` przez 5 min | ostrzeżenie — zbliżamy się do sufitu jednego procesu |
| `> 60` | alert — dołóż drugi proces relay za sticky routingiem albo większy VPS |
| spadek do `0` przy `> 0` w poprzedniej minucie i braku deployu | alert — proces padł, sesje zerwane |

Obok trzymaj `relay_sessions_started_total` i `relay_sessions_ended_total{reason}`.
Rozkład `reason` to najszybsza diagnoza: nagły wzrost `upstream_error` oznacza
problem u dostawcy, wzrost `credits_exhausted` — że coś się zmieniło w wycenie
albo w saldach.

---

## 3. Ledger: rozjazd salda wobec `SUM(delta)`

`credit_balances.balance` jest materializacją append-only `credit_ledger`
(`ARCHITECTURE.md` §3.4). Rozjazd to **incydent P1** — nie „metryka do obejrzenia
rano". Ktoś albo płaci za nieswoje minuty, albo dostaje je za darmo.

```sql
select count(*) as drifted_users
from (
  select l.user_id
  from credit_ledger l
  group by l.user_id
  having abs(
    sum(l.delta) - coalesce(
      (select b.balance from credit_balances b where b.user_id = l.user_id), 0)
  ) > 0.0001
) d;
```

- Uruchamiaj co 15 min. Każdy wynik `> 0` to alert natychmiastowy.
- Próg `0.0001` to nie tolerancja księgowa, tylko dolna cyfra znacząca:
  `numeric(14,4)` w schemacie i `round4` w `packages/billing/src/pricing.ts`.
- Ten sam warunek sprawdza `backup.sh --verify-restore` na odtworzonej kopii.
  Jeśli alarm z produkcji i z restore'a zapala się jednocześnie — to nie jest
  problem backupu.

Druga linia kontroli, niezależna od naszej księgowości: `usage` / `limit_remaining`
z OpenRouter Management API. Rozjazd `> 5%` wobec naszego ledgera → alert
(`ARCHITECTURE.md` §5).

---

## 4. `droppedCards` — czy widz w ogóle to zobaczył

`relay_projector_dropped_cards_total` (counter, per sesja agregowany globalnie)

Karta napisu, której nie udało się dostarczyć do projektora: pełny bufor gniazda,
backpressure, zerwane połączenie OBS. To jedyna metryka, która mówi wprost
„produkt nie zadziałał u odbiorcy" — sesja może wyglądać zdrowo we wszystkich
pozostałych wykresach i mimo to nie pokazać ani jednego napisu na streamie.

| Warunek | Reakcja |
|---|---|
| `rate(...[5m]) > 0` | ostrzeżenie — zbadaj, czy to jeden projektor czy wszystkie |
| `> 1/s` przez 2 min | alert — backpressure w relay albo saturacja łącza VPS |

Zestawiaj z `relay_projector_connections_active` i licznikiem `resume`/`snapshot`.
Dużo `snapshot` przy stabilnej liczbie połączeń = projektor cyklicznie się
rozłącza, czyli widz ogląda migotanie.

---

## 5. `cpsP95` — czytelność napisów

`relay_caption_cps` (histogram, obserwacja per commit karty)

Znaki na sekundę wypuszczane przez governor z `packages/caption-engine`. Metryka
jakości, nie awarii — ale bezpośrednio decyduje o tym, czy napisy da się przeczytać.

| Warunek | Reakcja |
|---|---|
| `p95 > 20 cps` przez 10 min | ostrzeżenie — governor nie nadąża dławić, sprawdź konfigurację `maxCharsPerLine` |
| `p95 > 25 cps` | alert — napisy są praktycznie nieczytelne |
| `p50 < 5 cps` przy aktywnych sesjach | podejrzenie zatrzymania pipeline'u, nie sukcesu |

Konwencja nadawcza to ok. 17 znaków/s przy dwóch liniach po 42 znaki (domyślne
`RenderConfig`). Wartości powyżej to sygnał, że stabilizacja albo łamanie linii
działa inaczej niż w testach silnika.

---

## 6. Dostawcy: udział błędów

`relay_provider_requests_total{provider, outcome}` — `provider` ∈
`elevenlabs_stt` | `elevenlabs_tts` | `openrouter`, `outcome` ∈ `ok` | `client_error` |
`server_error` | `timeout`.

```
sum(rate(relay_provider_requests_total{outcome!="ok"}[5m])) by (provider)
  / sum(rate(relay_provider_requests_total[5m])) by (provider)
```

| Warunek | Reakcja |
|---|---|
| `> 1%` przez 10 min | ostrzeżenie |
| `> 5%` przez 5 min | alert — degradacja usługi u dostawcy albo u nas |
| dowolny `client_error` na `openrouter` po świeżej rotacji klucza | alert natychmiastowy — rotacja poszła źle |

Rozdzielenie `client_error` / `server_error` jest tu istotne: 5xx to problem
dostawcy i czekamy, 4xx to nasz błąd — zły klucz, przekroczony limit, zły model.
Do tego `relay_stt_reconnects_total`: reconnect Scribe'a w trakcie sesji jest
widoczny dla użytkownika jako luka w napisach, nawet jeśli nie wygenerował błędu.

---

## 7. Higiena hosta

| Metryka | Próg |
|---|---|
| wolne miejsce na `/var/lib/docker` | `< 20%` ostrzeżenie, `< 10%` alert (wolumen `pg_data` rośnie najszybciej) |
| wiek najnowszego dumpa (`sub_pg_backup_timestamp_seconds`) | `> 26 h` alert |
| `sub_pg_backup_success` | `0` alert |
| ważność certyfikatu (Caddy) | `< 14 dni` ostrzeżenie — ACME odnawia sam, więc to znaczy, że coś blokuje odnowienie |
| `redis` `used_memory` / `maxmemory` | `> 80%` alert — polityka to `noeviction`, więc przy 100% zapisy zaczną **odrzucać**, a nie eksmitować; w `revoked:{jti}` eksmisja byłaby dziurą bezpieczeństwa, dlatego wolimy twardy błąd i alert |
| RTT VPS → ElevenLabs EU | `> 40 ms` p95 — budżet latencji z `ARCHITECTURE.md` §2 przestaje się spinać |

---

## 8. Minimalny zestaw, jeśli nie stawiamy Prometheusa

Kolejność wdrażania, gdyby trzeba było wybrać:

1. Zewnętrzny uptime check na `https://sub.hexart.io/` i `https://relay.sub.hexart.io/healthz`
   (poza VPS-em — inaczej nie wykryje, że VPS leży).
2. Cron z zapytaniem o rozjazd ledgera (§3) → alert mailem. To jedyna rzecz, której
   nie da się nadrobić po fakcie.
3. Alert na wiek backupu (§7).
4. Dopiero potem metryki relay.

Punkty 1–3 to kilka linijek crona i wyłapują wszystkie kategorie awarii, po których
nie da się już posprzątać.
