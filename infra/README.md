# Infrastruktura — sub.hexart.io

Runbook od pustego Ubuntu 24.04 LTS do działającej instalacji. Wszystko, co jest
tutaj opisane, wykonuje się na **jednym VPS-ie**.

---

## 1. Topologia: jeden VPS

`docs/ARCHITECTURE.md` §9 zakłada Vercel (web) + Hetzner (relay) + Neon (Postgres)
+ Upstash (Redis). **Ta infrastruktura tego nie realizuje.** Wszystko — web, relay,
Postgres, Redis i Caddy — stoi na jednej maszynie, w jednym `docker compose`.

```
                     internet
                        │
              :80 :443 (TCP + UDP/QUIC)
                        │
                 ┌──────▼───────┐
                 │    caddy     │  automatyczne TLS, gzip/zstd, nagłówki
                 └──┬────────┬──┘
        sub.hexart.io│        │relay.sub.hexart.io  (+ /relay/* jako zapas)
                 ┌───▼───┐ ┌──▼──────┐
   sieć `edge`   │  web  │ │  relay  │
                 │ :3000 │ │  :8787  │
                 └───┬───┘ └──┬──────┘
                     └────┬───┘
        ─────────────────────────────────  sieć `data` (internal: true)
                     ┌────┴────┐
              ┌──────▼───┐ ┌───▼────┐
              │ postgres │ │ redis  │   bez portów na hoście, bez wyjścia w świat
              └──────────┘ └────────┘
```

**Dlaczego tak:**

- Budżet latencji z `ARCHITECTURE.md` §2 zakłada relay blisko ElevenLabs EU.
  Współlokacja web i relay usuwa jeden przeskok sieciowy (Vercel FRA1 → Hetzner
  FSN1) i zabiera ~10–25 ms z każdej ramki napisów.
- Relay to długo żyjące gniazda WebSocket i stanowe `SessionActor`-y. Platformy
  serverless są dla tego złym dopasowaniem, a skoro i tak potrzebna jest maszyna
  z procesem-demonem, dokładanie do niej Next.js kosztuje kilkaset MB RAM.
- Jeden operator i jeden rachunek zamiast czterech dostawców, każdego z własnym
  panelem, limitami i trybem awarii.

**Co za to tracimy — trzeba to wiedzieć, zanim się zacznie:**

- **Brak HA.** Restart hosta = przerwa w działaniu. Deploy relay = drain sesji
  (do 10 min — tyle daje sobie sam relay w `DRAIN_TIMEOUT_MS`; `stop_grace_period`
  w compose jest ustawiony powyżej tej wartości, żeby SIGKILL nie uciął drenu
  przed ostatnim zapisem do ledgera).
- **Backup to nasza odpowiedzialność.** Neon miał PITR, tu mamy `backup.sh` i
  dobowe okno utraty danych. Świadoma decyzja przy tej skali — jeśli przestanie
  wystarczać, pierwszym krokiem jest WAL archiving, nie zmiana dostawcy.
- **Skalowanie pionowe.** Sufit to pojemność jednego procesu relay
  (`monitoring/README.md` §2). Rozjazd z §9 architektury należy zamknąć RFC, gdy
  ten sufit zacznie uwierać.

Zapisy z `ARCHITECTURE.md` §9 o osobnych kluczach dostawców per środowisko i o
Paddle sandbox na dev/staging **obowiązują bez zmian**.

---

## 2. Czego potrzebujesz przed startem

| Rzecz | Wartość |
|---|---|
| VPS | Ubuntu 24.04 LTS, min. 4 vCPU / 8 GB RAM / 80 GB NVMe, region EU (Frankfurt) |
| DNS | `A sub.hexart.io → <IP>` i `A relay.sub.hexart.io → <IP>`, oba już wskazują na maszynę |
| Dostęp | klucz SSH; logowanie hasłem będzie wyłączone |
| Sekrety | klucze ElevenLabs, OpenRouter, Paddle, para Ed25519 do session JWT |

Domyślne ustawienia Postgresa w `docker-compose.yml` są policzone pod ~4 GB RAM
przeznaczone na bazę. Przy innym rozmiarze maszyny patrz §8.

---

## 3. Bootstrap pustego serwera

Wszystko poniżej jako `root`, jednorazowo.

### 3.1 System i aktualizacje automatyczne

```bash
apt-get update && apt-get -y upgrade
apt-get -y install ca-certificates curl git ufw age unattended-upgrades \
  apt-listchanges util-linux

# Aktualizacje bezpieczeństwa same, z automatycznym restartem o 04:00.
cat >/etc/apt/apt.conf.d/51sub-unattended <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades
```

Automatyczny restart jest tu włączony świadomie: pojedynczy VPS bez HA i tak
przerwie działanie przy każdym restarcie, więc lepiej, żeby to była kontrolowana
04:00 niż niezałatana dziura czekająca tygodniami. Kontenery mają
`restart: unless-stopped`, więc wstają same.

### 3.2 Firewall — tylko 22/80/443

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'ssh'
ufw allow 80/tcp    comment 'acme http-01 + redirect'
ufw allow 443/tcp   comment 'https'
ufw allow 443/udp   comment 'http/3'
ufw --force enable
ufw status verbose
```

> **Uwaga na Dockera i UFW.** Docker wpisuje własne reguły do `DOCKER-USER` i
> potrafi ominąć UFW przy `ports:`. W tej konfiguracji jedyne opublikowane porty
> należą do Caddy'ego (80/443) i mają być publiczne, a Postgres i Redis **nie
> publikują niczego** — nie są więc w ogóle w zasięgu tej pułapki. Jeżeli
> kiedykolwiek dodasz `ports:` do usługi wewnętrznej, bindaj do `127.0.0.1:`,
> nigdy do `0.0.0.0:`.

### 3.3 Utwardzenie SSH

```bash
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/'  /etc/ssh/sshd_config
systemctl restart ssh
```

### 3.4 Użytkownik `deploy` (nie-root)

```bash
adduser --disabled-password --gecos '' deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

`deploy` **nie dostaje sudo**. Jedyne uprawnienie ponad standard to grupa
`docker` (§3.5) — a to i tak jest równoważne rootowi na tej maszynie, więc
dokładanie sudo tylko rozszerzyłoby powierzchnię bez zysku.

### 3.5 Docker Engine + compose v2

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  >/etc/apt/sources.list.d/docker.list
apt-get update
apt-get -y install docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

usermod -aG docker deploy
systemctl enable --now docker
docker compose version    # musi pokazać v2.x
```

Rotacja logów Dockera jest ustawiona per usługa w `docker-compose.yml`
(`json-file`, 10 MB × 5), więc globalny `daemon.json` nie jest potrzebny.

### 3.6 Katalogi

```bash
install -d -m 700 -o deploy -g deploy /var/backups/sub-hexart
install -d -m 750 -o root   -g deploy /etc/sub-hexart      # tu trafi age.key
```

---

## 4. Konfiguracja: `infra/.env`

Compose **nie ma** wbudowanego pliku env w repo — czyta `infra/.env`, którego tu
nie ma i nigdy nie będzie. Powstaje z SOPS-a (`infra/secrets/README.md`) albo
ręcznie przy pierwszym uruchomieniu. Tryb `600`, właściciel `deploy`.

Nazwy kluczy — **wartości nigdzie w repo**:

```dotenv
# Edge
ACME_EMAIL=
SITE_DOMAIN=sub.hexart.io
RELAY_DOMAIN=relay.sub.hexart.io

# Dane (hasła użyte też do zbudowania DATABASE_URL i REDIS_URL w compose)
POSTGRES_USER=sub
POSTGRES_PASSWORD=
POSTGRES_DB=sub
REDIS_PASSWORD=

# Web — publiczne, wkompilowywane w bundle na etapie budowania
NEXT_PUBLIC_APP_URL=https://sub.hexart.io
NEXT_PUBLIC_RELAY_WS_URL=wss://relay.sub.hexart.io
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=

# Web — serwerowe
AUTH_SECRET=
SESSION_JWT_PRIVATE_KEY=
SESSION_JWT_PUBLIC_KEY=
IP_HASH_SALT=
PADDLE_ENV=production
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
SMTP_URL=
MAIL_FROM=noreply@sub.hexart.io
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Relay — TYLKO relay
SESSION_JWT_PUBLIC_KEY_RELAY=
ELEVENLABS_API_KEY_STT=
ELEVENLABS_API_KEY_TTS=
ELEVENLABS_STT_MODEL=scribe_v2_realtime
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
ELEVENLABS_REGION=eu
OPENROUTER_MANAGEMENT_API_KEY=
OPENROUTER_MODEL_FAST=
OPENROUTER_MODEL_QUALITY=
PROVIDER_KEY_ENC_KEY=
PROVIDER_KEY_ENC_VERSION=1

# Wspólne
LOG_LEVEL=info
SENTRY_DSN=
```

Podział kluczy dostawców jest wymuszony w `docker-compose.yml`: kontener `web`
dostaje **wyliczoną** listę zmiennych, na której nie ma żadnego
`ELEVENLABS_*`, `OPENROUTER_*` ani `PROVIDER_KEY_ENC_KEY`. Nie ma tam
`env_file:` — to nie przeoczenie, tylko właśnie ten mechanizm. Dodanie
`env_file: .env` do `web` przewróciłoby `AGENTS.md` §7 jednym wierszem.

`SESSION_JWT_PUBLIC_KEY` i `SESSION_JWT_PUBLIC_KEY_RELAY` to ta sama wartość pod
dwiema nazwami (tak samo jak w `.env.example`). Klucz **prywatny** ma tylko `web`.
Wewnątrz kontenera `relay` zmienna nazywa się `SESSION_JWT_PUBLIC_KEY` — tak ją
czyta `apps/relay/src/config.ts` — a `docker-compose.yml` robi to przemapowanie.
Nie „poprawiaj" tego z powrotem na `SESSION_JWT_PUBLIC_KEY_RELAY`: relay nie
wstanie, bo walidacja env wywali brak wymaganej zmiennej.

---

## 5. Pierwszy deploy

Jako `deploy`:

```bash
git clone https://github.com/<org>/sub.hexart.io.git ~/sub.hexart.io
cd ~/sub.hexart.io
chmod +x infra/deploy.sh infra/backup.sh

# SOPS: wgraj age.key jako root do /etc/sub-hexart/age.key (0640 root:deploy)
echo 'export SOPS_AGE_KEY_FILE=/etc/sub-hexart/age.key' >>~/.bashrc
export SOPS_AGE_KEY_FILE=/etc/sub-hexart/age.key
# albo, na start bez SOPS-a:
#   vi infra/.env && chmod 600 infra/.env

./infra/deploy.sh --dry-run    # tylko preflight, nic nie zmienia
./infra/deploy.sh
```

`deploy.sh` po kolei: odszyfrowuje sekrety → sprawdza preflight → `git pull
--ff-only` → buduje obrazy otagowane skrótem commita → podnosi Postgres i Redis →
uruchamia migracje → podnosi web i relay → sprawdza zdrowie **przez publiczne
adresy** (a więc DNS, certyfikat i routing Caddy'ego, nie tylko własny probe
kontenera) → przy porażce cofa się do poprzedniego tagu.

Skrypt jest bezpieczny do wielokrotnego uruchomienia i broni się `flock`-iem przed
dwoma deployami naraz.

Pierwsze wystawienie certyfikatu trwa kilkanaście sekund. Jeśli się nie uda,
sprawdź w tej kolejności: rekord A, `ufw status` (port 80!), `docker compose logs caddy`.

### Weryfikacja po deployu

```bash
cd ~/sub.hexart.io
docker compose --project-directory infra --env-file infra/.env \
  -f infra/docker-compose.yml ps            # wszystko `healthy`

curl -sI https://sub.hexart.io/ | head -n 1
curl -s  https://relay.sub.hexart.io/healthz

# upgrade WebSocket przechodzi przez Caddy'ego (oczekiwane: 101)
curl -sI -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://relay.sub.hexart.io/

# Postgres i Redis NIE są widoczne z zewnątrz — oba muszą odmówić połączenia
nc -z -w 3 <IP> 5432 && echo 'BŁĄD: postgres wystawiony!' || echo 'ok'
nc -z -w 3 <IP> 6379 && echo 'BŁĄD: redis wystawiony!'    || echo 'ok'
```

---

## 6. Codzienna eksploatacja

```bash
cd ~/sub.hexart.io
alias dc='docker compose --project-directory infra --env-file infra/.env -f infra/docker-compose.yml'

dc ps                       # stan i zdrowie
dc logs -f relay            # logi na żywo
dc logs --since 1h caddy
dc restart relay            # honoruje drain — przy żywej sesji potrafi trwać do 10 min
dc exec -T postgres psql -U sub -d sub
```

Aktualizacja do najnowszego `main`: po prostu `./infra/deploy.sh`.

---

## 7. Backup i cron

`infra/backup.sh` robi `pg_dump | gzip -9`, sprawdza integralność archiwum i
rozmiar, liczy sumę SHA-256 i kasuje wpisy starsze niż 14 dni. Pełna procedura
odtworzenia jest w nagłówku skryptu; `--verify-restore` odtwarza najświeższy dump
do bazy jednorazowej **dokładnie tym samym poleceniem**, liczy tabele i sprawdza
zgodność `credit_balances` z `SUM(delta)` z ledgera — czyli ścieżka restore'u jest
naprawdę testowana, a nie zakładana.

`crontab -e` jako `deploy`:

```cron
# Dump co noc o 02:00 UTC.
0 2 * * * /home/deploy/sub.hexart.io/infra/backup.sh >>/home/deploy/backup.log 2>&1

# Raz w tygodniu dump + próba odtworzenia. Backup, którego nikt nie odtworzył,
# nie jest backupem.
0 3 * * 0 /home/deploy/sub.hexart.io/infra/backup.sh --verify-restore >>/home/deploy/backup.log 2>&1
```

Kopie leżą w `/var/backups/sub-hexart` (tryb 700). **Wynieś je poza tę maszynę** —
dysk VPS-a to nie backup. Najprościej `rclone`/`restic` do S3 w EU, w osobnym
wpisie crona po 02:00. Zabierz też wolumen `caddy_data`: bez niego odtworzenie
oznacza ponowne wystawienie certyfikatów i limity Let's Encrypt.

Zapytanie kontrolne o rozjazd ledgera (co 15 min) — patrz `monitoring/README.md` §3.

---

## 8. Strojenie przy innym rozmiarze maszyny

`docker-compose.yml` ustawia Postgresowi `shared_buffers=512MB` i
`effective_cache_size=1536MB`. Reguła kciuka: `shared_buffers` ≈ 25% RAM
przeznaczonego na bazę, `effective_cache_size` ≈ 75%. `maxmemory` Redisa to
256 MB przy polityce `noeviction` — jeśli zacznie się o nią ocierać, **podnieś
limit, nie zmieniaj polityki**: `revoked:{jti}` to czarna lista session JWT i
eksmisja wpisu z niej jest dziurą w bezpieczeństwie, nie optymalizacją.

---

## 9. Rollback

```bash
./infra/deploy.sh --rollback
```

Wraca do poprzedniego tagu obrazu z `infra/.deploy-state` (trzymamy 5 ostatnich,
`prune` nigdy nie kasuje tagu z tej listy) i ponawia health check. Automatyczny
rollback po nieudanym deployu robi dokładnie to samo.

**Trzy ograniczenia, o których trzeba pamiętać w środku awarii:**

1. **Migracje się nie cofają.** Są jednokierunkowe. Jeśli winna jest migracja,
   rollback obrazu nic nie da — trzeba odtworzyć bazę z `backup.sh` (procedura w
   nagłówku skryptu), a potem dopiero cofnąć obrazy.
2. **Drzewo Gita zostaje nietknięte.** Rollback zmienia tylko `IMAGE_TAG`.
   Jeśli zepsuty jest sam `docker-compose.yml` albo `Caddyfile`, zrób ręcznie:
   `git checkout <sha> && ./infra/deploy.sh`.
3. **Sesje na żywo padają.** Rollback to `up -d` z innym obrazem. Relay dostaje
   swój pełny drain (do 10 min), ale każda sesja i tak się kończy.

Wybrany tag można sprawdzić: `head -n 5 infra/.deploy-state`.

---

## 10. Diagnostyka

| Objaw | Gdzie patrzeć |
|---|---|
| Brak certyfikatu / `ERR_SSL_*` | `dc logs caddy`; rekord A; port 80 otwarty (HTTP-01 tego wymaga) |
| 502 na `sub.hexart.io` | `dc ps` — czy `web` jest `healthy`; `dc logs web`; brakująca zmienna środowiskowa wywala `serverEnv()` przy starcie |
| WebSocket rozłącza się po ~60 s | pośrednik po stronie klienta, nie Caddy — w `Caddyfile` nie ma timeoutu odczytu na proxy; sprawdź `HEARTBEAT_*` w kontraktach |
| Napisy się zacinają | `relay_projector_dropped_cards_total` i `cpsP95` (`monitoring/README.md` §4–5) |
| Deploy staje na health checku | `dc ps`, `dc logs --tail 100 <usługa>`; rollback poszedł automatycznie |
| Brak miejsca na dysku | `docker system df`; `dc exec postgres psql -U sub -c '\l+'`; wielkość `/var/backups/sub-hexart` |
| Postgres nie startuje po upgradzie obrazu | major upgrade Postgresa **nie jest** automatyczny — dump starą wersją, `docker volume rm`, restore. Dlatego tag jest przypięty do `17-alpine` |

Obrazy są przypięte do wersji major (`caddy:2-alpine`, `postgres:17-alpine`,
`redis:7-alpine`, `node:22-alpine`, `oven/bun:1-alpine`). Nigdzie nie ma `:latest`
— na jednym VPS-ie bez środowiska równoległego nie ma gdzie wykryć, że baza się
podmieniła pod spodem.

---

## 11. Staging na tej samej maszynie

`ARCHITECTURE.md` §9 przewiduje staging obok produkcji. Realizacja: ten sam
`docker-compose.yml`, inna nazwa projektu i inne domeny — bez kopiowania plików.

```bash
COMPOSE_PROJECT_NAME=sub-hexart-staging \
SITE_DOMAIN=staging.sub.hexart.io \
RELAY_DOMAIN=relay-staging.sub.hexart.io \
ENV_FILE=infra/.env.staging \
  ./infra/deploy.sh
```

Osobna nazwa projektu to osobne wolumeny i osobne sieci. Jedyny zasób
współdzielony to porty 80/443 — więc **tylko jeden Caddy naraz**; staging musi
albo działać na innych portach za tym samym Caddym, albo mieć swoje wpisy
w `Caddyfile`. Osobne klucze dostawców i Paddle sandbox obowiązują
(`AGENTS.md` §7, `ARCHITECTURE.md` §9).

---

## 12. Zawartość katalogu

| Plik | Rola |
|---|---|
| `docker-compose.yml` | cały stack: caddy, web, relay, postgres, redis + jednorazowy `migrate` |
| `Caddyfile` | routing, TLS, nagłówki, proxy WebSocket |
| `Dockerfile.web` | Next standalone, non-root, etap `migrator` dla drizzle-kit |
| `Dockerfile.relay` | Bun + tini, non-root, drzewo zależności spłaszczone przez `pnpm deploy` |
| `.dockerignore` + `Dockerfile.*.dockerignore` | filtr kontekstu budowania (trzy kopie, patrz nagłówek pliku; `deploy.sh` pilnuje ich zgodności) |
| `deploy.sh` | deploy, migracje, health check, rollback |
| `backup.sh` | dump, retencja 14 dni, próba odtworzenia |
| `secrets/README.md` | SOPS + age |
| `monitoring/README.md` | co obserwować i przy jakich progach alarmować |
| `.env`, `.deploy-state` | tworzone na serwerze, nigdy w repo |
