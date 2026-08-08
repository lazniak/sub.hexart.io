# Sekrety — SOPS + age

Zgodnie z `AGENTS.md` §7 sekrety żyją **wyłącznie** jako pliki zaszyfrowane SOPS-em
w tym katalogu. Klucz prywatny age nigdy nie trafia do repo, do obrazu Dockera ani
do logów.

W tym katalogu **nie ma** plików `*.enc.*` — powstają dopiero przy pierwszej
konfiguracji środowiska (poniżej). Katalog jest w repo, bo `.sops.yaml` i ta
instrukcja są wersjonowane razem z resztą infry.

---

## 1. Dlaczego age, a nie KMS

Jeden VPS, jeden operator, brak chmury do której trzeba by się uwierzytelniać przy
starcie kontenera. age to jeden plik klucza, zero usług do utrzymania i zero
kosztów. Cena: rotacja klucza to ręczna operacja — patrz §5.

## 2. Generowanie klucza

Na maszynie administratora (nie na VPS-ie):

```bash
age-keygen -o age-prod.key
# Public key: age1qxy...   ← to trafia do .sops.yaml
```

Klucz prywatny:
- **kopia zapasowa poza tym komputerem** (menedżer haseł / sejf offline). Utrata =
  utrata dostępu do wszystkich sekretów i konieczność wygenerowania ich od nowa,
- na VPS-ie ląduje jako `/etc/sub-hexart/age.key`, `root:deploy`, tryb `0640`,
- nigdy w repo (`.gitignore` blokuje `age.key`, `*.key`, `*.pem`).

## 3. `.sops.yaml`

Plik konfiguracyjny **nie zawiera sekretu** — klucz publiczny age nie jest tajny.
Mimo to nie ma go jeszcze w repo: nie znamy realnego recipienta, a placeholder
sprawiłby tylko, że `sops` wywala się z niejasnym błędem. Utwórz go jako
`infra/secrets/.sops.yaml` przy pierwszej konfiguracji:

```yaml
creation_rules:
  - path_regex: infra/secrets/prod\.enc\.env$
    age: age1qxy...            # klucz publiczny produkcji
  - path_regex: infra/secrets/staging\.enc\.env$
    age: age1abc...            # osobny klucz staging
```

Osobne klucze per środowisko to ta sama zasada co osobne klucze providerów
(`ARCHITECTURE.md` §5): ograniczenie promienia rażenia.

## 4. Praca z sekretami

```bash
# utworzenie / edycja — SOPS otwiera $EDITOR, szyfruje przy zapisie
export SOPS_AGE_KEY_FILE=~/.config/sops/age/age-prod.key
sops infra/secrets/prod.enc.env

# podgląd bez zapisu
sops --decrypt --output-type dotenv infra/secrets/prod.enc.env
```

Format `dotenv`: `KLUCZ=wartość`, jedna para na linię, bez cudzysłowów — dokładnie
to, czego oczekuje `--env-file` docker compose. SOPS szyfruje wartości, zostawiając
nazwy kluczy jawne, więc `git diff` pokazuje **które** sekrety się zmieniły, nie
ujawniając czym.

Zawartość (nazwy — wartości nigdy w repo): pełna lista w `infra/README.md` §4.

## 5. Deploy

`infra/deploy.sh` robi to automatycznie, o ile:

```bash
export SOPS_AGE_KEY_FILE=/etc/sub-hexart/age.key
```

Skrypt odszyfrowuje `prod.enc.env` do `infra/.env` (tryb `600`, zapis przez plik
tymczasowy, więc nieudane odszyfrowanie nie kasuje działającej konfiguracji) i
dopiero wtedy uruchamia compose. `infra/.env` jest w `.gitignore` na poziomie
głównym repo (`.env` bez ukośnika łapie każdy poziom katalogów).

Jeśli `prod.enc.env` nie istnieje, deploy używa istniejącego `infra/.env` — to
ścieżka na start, zanim SOPS zostanie skonfigurowany.

## 6. Rotacja

| Kiedy | Co |
|---|---|
| co 90 dni | klucze runtime OpenRouter (rotuje relay, `ARCHITECTURE.md` §5) |
| co 12 mies. | klucz age, klucze ElevenLabs, `AUTH_SECRET`, `PROVIDER_KEY_ENC_KEY` |
| natychmiast | przy każdym podejrzeniu wycieku, bez dyskusji |

Rotacja klucza age:

```bash
age-keygen -o age-prod-new.key
# dopisz nowy klucz publiczny do .sops.yaml (oba naraz)
sops updatekeys infra/secrets/prod.enc.env
# wgraj nowy klucz na VPS, zdeployuj, sprawdź, usuń stary z .sops.yaml
sops updatekeys infra/secrets/prod.enc.env
```

Rotacja `PROVIDER_KEY_ENC_KEY` (AES-256-GCM dla `provider_keys`) to **nie** jest
sama podmiana wartości — istniejące rekordy są zaszyfrowane starym kluczem. Stąd
`PROVIDER_KEY_ENC_VERSION`: nowy klucz dostaje kolejną wersję, deszyfrowanie
wybiera klucz po wersji rekordu, a stary klucz zostaje do czasu przeszyfrowania
wszystkich wierszy.

## 7. Czego nie robić

- Nie wklejać wartości do Issue, PR, logów ani czatu z agentem.
- Nie przekazywać sekretów jako `--build-arg` — argumenty budowania są czytelne
  w historii obrazu (`docker history`). Dlatego jedyne build-argi to `NEXT_PUBLIC_*`.
- Nie commitować `infra/.env` ani żadnego `*.dec.*`. `gitleaks` w CI to złapie,
  ale wpis w historii Gita zostaje na zawsze — wtedy jedyną poprawną reakcją jest
  rotacja, nie `git rebase`.
