# Accesso, account e profili

*Stato: implementato (backend + frontend) per registrazione, conferma email, login, sessioni,
password dimenticata, profili e impostazioni account. Da fare: pannello admin, permessi sulle
app, login TV con codice, notifica all'utente quando l'account viene approvato.*

## Flusso

```
Registrazione ─▶ email di conferma ─▶ approvazione dell'amministratore ─▶ account attivo

Login ─▶ (nessun profilo? guida iniziale) ─▶ Scelta profilo ─▶ ultima app del profilo
                                                                └─ selettore app nel menu
```

Senza sessione non si entra in nessuna pagina dell'app (`maia-fe/proxy.ts`).

## Stati dell'account

| Stato | Quando | Login | Schermata in maia-fe |
|---|---|---|---|
| `PENDING_EMAIL` | registrato, email non confermata | 403 `EMAIL_NOT_VERIFIED` | `/stato/email` con "Rimanda l'email" |
| `PENDING_APPROVAL` | email confermata | 403 `PENDING_APPROVAL` | `/stato/approvazione` |
| `ACTIVE` | approvato | ok | — |
| `SUSPENDED` | sospeso | 403 `SUSPENDED` | `/stato/sospeso` |

Lo stato viene rivelato **solo dopo una password corretta**; con password sbagliata la risposta è
sempre 401 `INVALID_CREDENTIALS`. La registrazione è aperta a chiunque (409 `EMAIL_TAKEN` se l'email
esiste già): il filtro è l'approvazione manuale.

**Approvazione** (finché non c'è il pannello admin), da `maia-be/`:

```bash
npm run account:approve -- persona@esempio.it          # → ACTIVE
npm run account:approve -- persona@esempio.it --admin  # → ACTIVE + ruolo ADMIN
```

Quando un account conferma l'email, il backend scrive agli account `ADMIN` attivi e a
`ADMIN_EMAIL` (variabile d'ambiente) con il comando da lanciare.

## Email e link monouso

| Email | Link | Durata |
|---|---|---|
| Conferma email (registrazione, "Rimanda l'email") | `/verifica-email?token=…` | 48 ore |
| Password dimenticata | `/reimposta-password?token=…` | 1 ora |
| Nuovo account da approvare (agli admin) | — | — |

- Nel database c'è solo lo SHA-256 del token; ogni link si usa una volta sola e un nuovo link
  annulla i precedenti dello stesso tipo.
- "Rimanda l'email" e "Password dimenticata" rispondono sempre allo stesso modo, che l'email
  esista o no (non si può scoprire chi è registrato).
- Reimpostare la password chiude **tutte** le sessioni; cambiarla dalle impostazioni chiude tutte
  **tranne quella in uso**.
- Invio via SMTP (`maia-be/src/mail`). In sviluppo: Mailpit (vedi [dev.md](dev.md)). Se il server
  di posta non risponde l'errore va nel log e la richiesta non fallisce.

## Sessioni

- Login → due cookie `httpOnly`, `SameSite=Lax` (`Secure` in produzione con `COOKIE_SECURE=true`):
  - `maia_at`: access token JWT, 15 minuti (`sub` = account, `sid` = sessione);
  - `maia_rt`: refresh token casuale, 30 giorni, salvato come hash nella tabella `sessions`.
- `POST /auth/refresh` ruota il refresh token (il vecchio smette di valere) e rinnova l'access.
  Il frontend lo chiama da solo alla prima risposta 401 e ripete la richiesta (`maia-fe/lib/api.ts`).
- I cookie sono di prima parte: il browser parla solo con maia-fe, che inoltra `/api/*` a maia-be
  (vedi [architecture.md](architecture.md)).
- Limite di richieste: 10 al minuto per IP sugli endpoint `/auth/*` (60 per il refresh), 120 al
  minuto sul resto.

## Ruoli

- **Amministratore** (`role: ADMIN`): approva e sospende gli account, decide le app (pannello da fare).
- **Titolare dell'account**: gestisce i propri profili e i propri dati.

## Profili

- Massimo **5** per account; nomi unici nell'account (senza distinguere maiuscole); 1-20 caratteri.
- Avatar: iniziale su un gradiente del colore scelto (`hue`, 8 colori proposti).
- **Guida iniziale** (`/benvenuto`) per un account senza profili: spiega i profili, fa creare il
  primo (nome proposto = nome dell'account), poi "Inizia a guardare" o "Aggiungi altri profili".
  "Chi sta guardando?" rimanda alla guida finché non c'è almeno un profilo.
- **Gestisci profili** su `/profili`: avatar scuriti con la matita; tocco → modifica nome e colore
  o elimina (con conferma). "Aggiungi" apre lo stesso modulo vuoto.
- Il profilo scelto è salvato **sul dispositivo** (`localStorage`): ogni dispositivo può essere su
  un profilo diverso. L'ultima app usata è salvata **nel profilo** (`lastAppKey`).
- Rimandati: profili bambini e PIN.

## Impostazioni account (`/account`)

Nome (modificabile), email (sola lettura per ora), cambio password (serve quella attuale), elenco
profili con "Gestisci profili", "Esci da MAIA". Dal menu del profilo nell'app: Cambia profilo,
Impostazioni account, Esci.

## Permessi sulle app (da fare)

1. **Account**: quali app ha (`AccountApp`), deciso dall'amministratore.
2. **Profilo**: restrizioni decise dal titolare (`ProfileApp`).

Oggi l'elenco delle app è ancora nei dati finti del frontend (`lib/mock.ts`).

## Login sulla TV (da fare)

QR code e codice di 6 caratteri confermati dal telefono. Oggi "Accedi con il telefono" mostra la
schermata e avvisa che arriva presto.

## Modello dati

`maia-be/prisma/schema.prisma`:

```
Account (email unique, name, passwordHash, status, role, emailVerifiedAt, approvedAt)
 ├─ Profile ×5 (name, hue, lastAppKey)
 ├─ EmailToken (type VERIFY_EMAIL|RESET_PASSWORD, tokenHash, expiresAt, usedAt)
 └─ Session (refreshTokenHash, userAgent, expiresAt, revokedAt, lastUsedAt)
```

Password con `scrypt` di `node:crypto` (`scrypt$salt$hash`), nessuna dipendenza nativa.

## API

Documentazione interattiva su `http://localhost:3000/docs` (JSON su `/docs-json`).

| Metodo | Percorso | Note |
|---|---|---|
| POST | `/auth/register` | `{name, email, password}` |
| POST | `/auth/resend-verification` | `{email}` |
| POST | `/auth/verify-email` | `{token}` → `{status}` |
| POST | `/auth/login` | `{email, password}` → cookie |
| POST | `/auth/refresh` | cookie → nuovi cookie |
| POST | `/auth/logout` | chiude la sessione |
| POST | `/auth/forgot-password` | `{email}` |
| POST | `/auth/reset-password` | `{token, password}` |
| GET / PATCH | `/me` | account + profili / `{name}` |
| POST | `/me/password` | `{currentPassword, newPassword}` |
| GET / POST | `/profiles` | elenco / `{name, hue}` |
| PATCH / DELETE | `/profiles/:id` | `{name?, hue?, lastAppKey?}` |
