# Runbook — rotacja kluczy dostawców

Dotyczy: ElevenLabs (STT, TTS), OpenRouter (management + klucze runtime użytkowników), `PROVIDER_KEY_ENC_KEY`, klucze podpisu session JWT.

Rotacja planowa: **co 90 dni**. Rotacja awaryjna: **natychmiast** przy podejrzeniu wycieku (klasa P1, `docs/SECURITY.md` §8).

---

## 1. ElevenLabs — planowa

Klucze żyją tylko w kontenerze `relay`. Warstwa web ich nie dostaje.

```bash
# 1. Wygeneruj nowy klucz w panelu ElevenLabs (osobny na STT i osobny na TTS).
# 2. Podmień w zaszyfrowanym pliku sekretów.
sops infra/secrets/prod.enc.yaml

# 3. Wdroż — relay przeładuje konfigurację przy restarcie kontenera.
./infra/deploy.sh --service relay

# 4. Sprawdź, że nowe sesje wstają.
curl -fsS https://sub.hexart.io/api/health

# 5. Dopiero teraz odwołaj stary klucz w panelu ElevenLabs.
```

Kolejność jest istotna: stary klucz odwołujemy **po** potwierdzeniu, że nowy działa. Trwające sesje utrzymują otwarte sockety — odwołanie w odwrotnej kolejności urwałoby komuś napisy na wizji.

## 2. ElevenLabs — awaryjna

Odwrotna kolejność, świadomie kosztem trwających sesji:

```bash
# 1. Odwołaj klucz w panelu ElevenLabs NATYCHMIAST.
# 2. Wygeneruj nowy, podmień w sekretach, wdroż.
# 3. Zwróć credits za przerwane sesje:
#    reason 'refund_incident', zakres = sesje aktywne w momencie odwołania.
```

Zwrot jest automatyczny (relay wykrywa `upstream_error` i zwraca niewykorzystaną rezerwację), ale po awaryjnej rotacji **zweryfikuj to ręcznie** — sesje przerwane w połowie flush interval mogą wymagać korekty `manual_adjustment` z wpisem w `audit_log`.

## 3. OpenRouter — klucz zarządzający

```bash
# Nowy management key w panelu OpenRouter, podmiana w sekretach, deploy relay.
# Klucze runtime użytkowników NIE wymagają odtworzenia — zostają ważne.
```

## 4. OpenRouter — klucze runtime użytkowników

Tworzone przez relay per użytkownik, z limitem odpowiadającym saldu credits.

```bash
# Rotacja jednego użytkownika (podejrzenie nadużycia):
#   DELETE /api/v1/keys/{keyHash}   następnie
#   POST   /api/v1/keys             z limitem z bieżącego salda
# Relay robi to sam przy następnej sesji, jeśli rekord w provider_keys zniknie.

# Rotacja masowa (wyciek PROVIDER_KEY_ENC_KEY):
#   1. Odwołaj WSZYSTKIE klucze runtime przez Management API.
#   2. Nowy PROVIDER_KEY_ENC_KEY z key_enc_version + 1.
#   3. Wyczyść provider_keys — relay odtworzy klucze leniwie.
```

`key_enc_version` istnieje właśnie po to: rotacja klucza szyfrującego nie wymaga migracji danych, bo stare rekordy po prostu kasujemy.

## 5. Klucze podpisu session JWT (Ed25519)

Sesje żyją 60 s, więc rotacja jest niemal bezbolesna — wystarczy okno przekrywania.

```bash
# 1. Wygeneruj nową parę.
# 2. Relay przez jeden deploy akceptuje OBA klucze publiczne (SESSION_JWT_PUBLIC_KEY
#    i SESSION_JWT_PUBLIC_KEY_PREV).
# 3. Web podpisuje już nowym kluczem prywatnym.
# 4. Po 5 minutach usuń SESSION_JWT_PUBLIC_KEY_PREV.
```

---

## Po każdej rotacji

- [ ] Wpis w `audit_log`: `action='key_rotation'`, dostawca, powód, kto
- [ ] Data następnej rotacji w kalendarzu (+90 dni)
- [ ] Przy rotacji awaryjnej: notatka incydentu w `docs/incidents/YYYY-MM-DD-<slug>.md`
- [ ] Sprawdź, czy `usage` z OpenRouter zgadza się z ledgerem (rozjazd > 5% = osobny incydent)
