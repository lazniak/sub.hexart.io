# Runbook — incydent P1

P1 = wyciek klucza lub danych, rozjazd ledgera, nieautoryzowany dostęp. Cel: **odciąć w 15 minut**, wyjaśnić później.

---

## 0. Pierwsze 15 minut

1. **Zatrzymaj krwawienie**, nie diagnozuj. Odwołaj klucz / zablokuj konto / wyłącz usługę.
2. **Zapisz czas** (UTC) i co dokładnie zaobserwowałeś — pierwszy zapis jest najtrafniejszy.
3. **Nie kasuj niczego.** Logi, rekordy, sesje zostają. `credit_ledger` i tak jest append-only.
4. Powiadom właściciela.

## 1. Wyciek klucza dostawcy

```bash
# Odwołaj u dostawcy, potem podmień — kolejność awaryjna z runbooka rotacji.
# docs/runbooks/key-rotation.md §2
```

Ustal zakres: kiedy klucz wyciekł, jakie wywołania między wyciekiem a odwołaniem nie pochodziły od nas (porównaj `usage` u dostawcy z sumą `credit_ledger` w tym oknie). Różnica to koszt incydentu.

## 2. Rozjazd ledgera

Objaw: nocne zadanie zgłasza, że `credit_balances.balance != SUM(credit_ledger.delta)`.

```sql
-- Skala rozjazdu, per użytkownik
SELECT b.user_id,
       b.balance                          AS materialized,
       COALESCE(SUM(l.delta), 0)          AS derived,
       b.balance - COALESCE(SUM(l.delta), 0) AS drift
FROM credit_balances b
LEFT JOIN credit_ledger l ON l.user_id = b.user_id
GROUP BY b.user_id, b.balance
HAVING b.balance <> COALESCE(SUM(l.delta), 0);
```

**Ledger jest prawdą.** Przelicz widok z ledgera, nigdy odwrotnie:

```sql
UPDATE credit_balances b
SET balance = d.total, updated_at = now()
FROM (SELECT user_id, SUM(delta) AS total FROM credit_ledger GROUP BY user_id) d
WHERE d.user_id = b.user_id;
```

Potem znajdź przyczynę: podwójne przetworzenie webhooka (sprawdź `idempotency_key`), flush relay bez odpowiadającego wpisu, ręczna korekta bez `audit_log`.

## 3. Wyciek danych osobowych

Zegar RODO: **72 godziny na zgłoszenie do UODO** od stwierdzenia naruszenia (art. 33).

1. Zakres: które rekordy, ilu użytkowników, jakie kategorie danych.
2. Ryzyko dla osób — jeśli wysokie, obowiązek powiadomienia użytkowników (art. 34).
3. Zgłoszenie do UODO: co się stało, kiedy, ile osób, skutki, podjęte środki.
4. Wpis do rejestru naruszeń (obowiązkowy niezależnie od tego, czy zgłaszamy).

**Audio nie jest zapisywane, transkrypcje domyślnie też nie** — to ogranicza zakres każdego wycieku do danych konta. Ta decyzja architektoniczna jest tu warta więcej niż jakakolwiek kontrola.

## 4. Nieautoryzowany dostęp do konta

```sql
-- Unieważnij wszystkie sesje użytkownika
DELETE FROM auth_sessions WHERE user_id = $1;
```

Wymuś reset hasła, sprawdź `audit_log` pod kątem zmian e-maila i 2FA, przejrzyj `credit_ledger` pod kątem nieswoich sesji, zrotuj tokeny projektora (`caption_sessions.projector_token_hash`).

---

## Po incydencie (w ciągu 48 h)

Notatka w `docs/incidents/YYYY-MM-DD-<slug>.md`:

- oś czasu w UTC — co, kiedy, kto
- przyczyna źródłowa, nie objaw
- co zadziałało, co nie
- konkretne zmiany z numerami Issue

Bez szukania winnego. Incydent, który da się powtórzyć, jest defektem systemu, nie człowieka.
