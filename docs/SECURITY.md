# Bezpieczeństwo

Model zagrożeń i zabezpieczenia. Każdy PR dotykający auth, płatności, kluczy providerów lub ścieżki audio wymaga przejrzenia tego dokumentu i aktualizacji, jeśli zmienia założenia.

---

## 1. Model zagrożeń

| # | Zagrożenie | Skutek | Kontrola |
|---|---|---|---|
| T1 | Wyciek klucza ElevenLabs / OpenRouter | Rachunek u dostawcy, kradzież usługi | Klucze wyłącznie server-side; osobne per środowisko i per pipeline; twarde limity; rotacja 90 dni |
| T2 | Kradzież credits (obce konto / darmowe sesje) | Strata finansowa | Session JWT 60 s; rezerwacja przed startem; ledger append-only; limit równoległości |
| T3 | **Wyciek linku projektora na wizji** | Podgląd cudzych napisów | Token read-only, zero uprawnień do konta, ważny tylko w czasie sesji, natychmiastowa regeneracja |
| T4 | Nadużycie trialu (masowe konta) | Koszt COGS bez przychodu | Weryfikacja e-mail, blocklist domen jednorazowych, rate limit per IP/ASN, 10 credits to za mało na sensowne nadużycie |
| T5 | Przechwycenie audio w tranzycie | Naruszenie RODO | TLS 1.3 wszędzie; audio nigdy nie ląduje na dysku |
| T6 | Prompt injection z transkrypcji do LLM | Zatrucie tłumaczenia | Transkrypt to **dane, nie instrukcja** — twardy separator, prompt systemowy odporny, walidacja długości wyjścia |
| T7 | XSS w projektorze | Wstrzyknięcie treści na wizję | Render wyłącznie jako `textContent`; **zakaz** `innerHTML` w `apps/web/app/projector/**` (reguła ESLint) |
| T8 | Podrobiony webhook Paddle | Darmowe credits | Weryfikacja podpisu przed parsowaniem; idempotencja po `event_id` |
| T9 | Replay session JWT | Obce sesje | `jti` + czarna lista w Redis; TTL 60 s; `aud: relay`; jednorazowe zużycie |
| T10 | DoS na relay | Niedostępność | Rate limit na handshake, limit ramek/s per sesja, twardy limit sesji per proces, Caddy przed nim |

---

## 2. Uwierzytelnianie i sesje

- **Better Auth**, Postgres jako store.
- Hasła: **argon2id** (m=64 MiB, t=3, p=4). Minimum 12 znaków, sprawdzane przeciw liście wykradzionych haseł (k-anonimowość HIBP, bez wysyłania hasła).
- E-mail: weryfikacja **obowiązkowa** przed przyznaniem trial credits.
- Google OAuth jako alternatywa.
- TOTP 2FA opcjonalne; **wymagane** dla kont z rolą admin.
- Cookies sesyjne: `httpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefix. Rotacja identyfikatora przy logowaniu i zmianie hasła.
- Zmiana hasła / e-maila / 2FA → unieważnienie wszystkich pozostałych sesji + e-mail powiadamiający.
- Reset hasła: token jednorazowy, 15 min, wiązany z user-agent-family, nie ujawnia istnienia konta.

---

## 3. Tokeny — trzy różne byty, celowo rozdzielone

| Token | Nośnik | TTL | Uprawnienia |
|---|---|---|---|
| **Sesja konta** | cookie `__Host-*` | 30 dni (sliding) | Pełne konto |
| **Session JWT** | pamięć JS w studiu, nagłówek WS | **60 s**, jednorazowy | Otwarcie **jednej** sesji na relay |
| **Projector token** | URL w OBS | czas sesji | **Wyłącznie odbiór** zdarzeń jednej sesji |

Projector token dostaje osobną przestrzeń nazw (`pt_` + 32 losowe bajty, base64url). Nie jest JWT — nie da się z niego niczego wywnioskować. W panelu przycisk „Wygeneruj nowy link" unieważnia poprzedni natychmiast.

**Dlaczego to ma znaczenie:** streamer wkleja ten URL w OBS. Wcześniej czy później pokaże swój ekres ustawień na wizji. Ten link musi być bezwartościowy dla obcego poza podglądem trwających napisów.

---

## 4. Klucze dostawców

- Nie występują w żadnym bundlu klienckim. Reguła CI: skan artefaktów builda pod kątem wzorców kluczy — trafienie zatrzymuje deploy.
- `apps/relay`: klucze z env, wstrzykiwane przez SOPS w czasie startu kontenera. Nigdy w obrazie Dockera.
- Klucze runtime OpenRouter per użytkownik: AES-256-GCM, klucz szyfrujący (`PROVIDER_KEY_ENC_KEY`) tylko w env relay, wersjonowany (`key_version` w rekordzie) pod rotację bez migracji danych.
- Rotacja: harmonogram 90 dni; natychmiastowa procedura awaryjna opisana w `docs/runbooks/key-rotation.md`.
- `usage` / `limit_remaining` z OpenRouter porównywane z naszym ledgerem — niezależna kontrola drugiego stopnia.

---

## 5. Ochrona brzegu

- **CSP** budowane w `apps/web/middleware.ts`, bo wymaga nonce'a per żądanie.

  | Zakres | Polityka |
  |---|---|
  | `/projector/*` | `default-src 'none'`, `script-src 'self' 'nonce-…'`, `connect-src` tylko relay. Zero źródeł trzecich, także analityki |
  | `/app/*`, `/login`, `/register`, `/reset`, `/verify`, `/api/*` | nonce w `script-src`, bez `'unsafe-inline'` |
  | `/`, `/pricing`, `/legal/*` | `script-src 'self' 'unsafe-inline'` |

  Ostatni wiersz to świadomy kompromis, nie niedopatrzenie. Strona prerenderowana statycznie to jeden plik HTML — jej inline'owy skrypt hydratacji powstaje w czasie builda i **nie może** nieść nonce'a per żądanie, a obecność nonce'a w polityce każe przeglądarce zignorować `'unsafe-inline'`. Wysłanie polityki z nonce'em na taką stronę nie utwardza jej, tylko psuje hydratację. Te strony nie mają ciasteczek, sesji ani danych użytkownika; wszystko, co je ma, jest renderowane dynamicznie i dostaje nonce.

  `apps/web/e2e/csp.spec.ts` sprawdza dla każdej trasy, czy serwowana polityka jest wykonalna dla jej własnego HTML — dodanie strony pod dynamicznym prefiksem albo przestawienie trasy na statyczną wywala test zamiast psuć produkcję po cichu.

- **`blob:` w `script-src`** aplikacji jest wymagane: procesor AudioWorklet w studiu ładuje się z blob URL, a moduły workletów podlegają `script-src`. Bez tego mikrofon po prostu nie startuje.
- HSTS z `preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` blokujący wszystko poza `microphone=(self)`.
- Zero skryptów firm trzecich na `/projector/*` — także analityki. Ta strona idzie na antenę.
- Rate limit (Redis, sliding window):

| Zakres | Limit |
|---|---|
| logowanie / IP | 10 / 10 min |
| rejestracja / IP | 5 / h |
| reset hasła / e-mail | 3 / h |
| `/api/session/start` / konto | 20 / h |
| handshake WS / IP | 30 / min |
| ramki audio / sesja | 60 / s (twardy sufit, ramka 20 ms = 50/s) |

- Limit sesji równoległych per konto egzekwowany atomowo w Redis (`INCR` + `EXPIRE`), nie w kodzie aplikacji.

---

## 6. Dane i prywatność (RODO w praktyce)

- **Audio nie jest zapisywane.** Nigdzie. Bufory w relay są ulotne, nie ma zapisu na dysk ani do logów.
- Transkrypcje: domyślnie **nie zapisywane**. Opcja „zachowaj transkrypt sesji" — świadoma zgoda, TTL 24 h, kasowanie jobem, ręczne usunięcie w panelu.
- Logi: strukturalne (pino), pola wrażliwe przez whitelistę. Zakaz logowania treści transkrypcji, tokenów, pełnych e-maili (hash + domena). IP hashowane z solą, retencja 30 dni.
- Podprocesorzy: ElevenLabs (US), OpenRouter (US), Paddle (UK/IE), Hetzner (DE), Vercel (US/EU), Neon (EU), Upstash (EU). Transfer do US na podstawie SCC + DPF, ujawniony w polityce prywatności i rejestrze.
- Prawa: eksport danych (JSON) i usunięcie konta samoobsługowo w panelu, realizacja ≤ 30 dni.
- **Zasada:** żaden PR nie może wprowadzić trwałego zapisu audio ani transkrypcji bez równoczesnej aktualizacji polityki prywatności (`apps/web/app/(legal)/legal/prywatnosc/page.tsx`). Takie PR-y dostają etykietę `legal-review`.

---

## 7. Zapewnienia w kodzie

Wymuszane lintem/CI, nie dobrymi chęciami:

1. `no-restricted-syntax` — zakaz `innerHTML` / `dangerouslySetInnerHTML` w `apps/web/app/projector/**`.
2. `no-restricted-imports` — `packages/caption-engine` i `packages/billing` nie mogą importować niczego z I/O.
3. Skan bundla klienckiego pod wzorce kluczy (`sk_`, `xi-api-key`, `pdl_`) — blokuje deploy.
4. `gitleaks` na pre-commit i w CI.
5. Migracje dotykające `credit_ledger` w kierunku UPDATE/DELETE — CI odrzuca.
6. Testy: podpis webhooka Paddle, idempotencja, cut-off przy zerowym saldzie, unieważnienie projector tokenu.

---

## 8. Reagowanie na incydenty

| Klasa | Przykład | Reakcja |
|---|---|---|
| **P1** | Wyciek klucza, rozjazd ledgera, wyciek danych | Rotacja/odcięcie < 15 min, powiadomienie właściciela, zgłoszenie do UODO w 72 h jeśli dotyczy danych osobowych |
| **P2** | Relay down, webhooki nieprzetworzone | Przywrócenie < 1 h, kolejka odtworzona z Paddle |
| **P3** | Degradacja jakości napisów | Issue + fixture odtwarzający |

Runbooki: `docs/runbooks/`. Kontakt bezpieczeństwa: `security@hexart.pl`, `/.well-known/security.txt`, 90-dniowe okno na disclosure.

---

## 9. Zgodność

- **NIS2 / ISO 27001** — nie dotyczy w tej skali, ale kontrole z §2–§7 są kompatybilne kierunkowo.
- **EAA / WCAG 2.1 AA** — landing i panel dostępne; napisy to funkcja dostępności, więc własny produkt musi być spójny.
- **AI Act art. 50** — oznaczenie treści generowanej przez AI: informacja w regulaminie, w studiu i w metadanych ścieżki lektora.
