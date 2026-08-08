# RFC 0001 — Cała aplikacja na jednym VPS zamiast Vercel + osobny host relay

- **Autor:** zespół
- **Pas:** `infra`
- **Status:** zaakceptowany
- **Dotyczy protokołu:** nie

## Problem

Pierwotny projekt (`docs/ARCHITECTURE.md` w wersji z 2026-08-08) zakładał warstwę web na Vercel i osobny host dla relay. Tymczasem rekord A `sub.hexart.io` już wskazuje na istniejący VPS operatora. Utrzymywanie dwóch dostawców w tej skali oznacza:

- dwa rachunki i dwa panele przy jednym produkcie,
- transfer danych między dostawcami do ujawnienia w polityce prywatności,
- dwie ścieżki deploy i dwa zestawy sekretów,
- brak realnej korzyści — ruch na starcie mieści się na jednej maszynie z zapasem.

## Decyzja

Wszystko na jednym VPS w Docker Compose za Caddy z automatycznym TLS:

```
caddy ──┬── web      (Next.js standalone, :3000)
        └── relay    (Node 22 + ws, :8787)
             ├── postgres:17-alpine   (bez portu na hoście)
             └── redis:7-alpine       (bez portu na hoście)
```

`sub.hexart.io` → `web`. `relay.sub.hexart.io` → `relay` (WebSocket upgrade, długi read timeout).

## Konsekwencje

**Dobre**

- Jeden podprocesor infrastrukturalny zamiast czterech (Vercel, Neon, Upstash, host relay) — krótsza lista w polityce prywatności i mniej DPA do podpisania.
- Latencja przeglądarka → relay → Postgres w obrębie jednej maszyny.
- Backup to `pg_dump` w cronie, nie integracja z API dostawcy.
- Pełna kontrola nad tym, gdzie leżą dane.

**Kosztowne**

- Ops po naszej stronie: aktualizacje systemu, monitoring, backup, odtwarzanie po awarii.
- Brak auto-scale. Skalowanie poziome relay wymaga sticky routingu po `sessionId` — do zrobienia dopiero, gdy jedna maszyna przestanie wystarczać.
- Jeden punkt awarii. Akceptowalne przed pierwszymi płacącymi klientami, do rewizji potem.

**Zmiany w kodzie**

- `next.config.ts`: `output: 'standalone'`.
- Relay na Node 22 + `ws` zamiast Bun + uWebSockets.js — przenośność obrazu ważniejsza niż ostatnie kilka procent przepustowości przy tej skali.
- `infra/` zawiera pełny runbook od czystej Ubuntu 24.04.

## Kiedy tę decyzję odwrócić

- Przekroczymy ~150 równoległych sesji na maszynie, albo
- pojawi się wymóg SLA, którego jedna maszyna nie udźwignie, albo
- klient enterprise zażąda redundancji geograficznej.

Wtedy pierwszym krokiem jest wydzielenie relay na drugą maszynę ze sticky routingiem — nie powrót na Vercel.
