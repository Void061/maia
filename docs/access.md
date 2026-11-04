# Accesso, account e profili

*Stato: implementato (backend + frontend) per registrazione, conferma email, login, sessioni,
password dimenticata, profili, impostazioni account e pannello admin. Da fare: permessi sulle
app, login TV con codice.*

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
| `PENDING_EMAIL` | registrato, email non confermata | 403 `EMAIL_NOT_VERIFIED` | `/status/unverified` con "Rimanda l'email" |
| `PENDING_APPROVAL` | email confermata | 403 `PENDING_APPROVAL` | `/status/pending` |
| `ACTIVE` | approvato | ok | — |
| `SUSPENDED` | sospeso | 403 `SUSPENDED` | `/status/suspended` |

Lo stato viene rivelato **solo dopo una password corretta**; con password sbagliata la risposta è
sempre 401 `INVALID_CREDENTIALS`. La registrazione è aperta a chiunque (409 `EMAIL_TAKEN` se l'email
esiste già): il filtro è l'approvazione manuale.

**Approvazione:** dal pannello admin (`/admin`, vedi sotto). Quando un account conferma
l'email, il backend scrive agli account `ADMIN` attivi e a `ADMIN_EMAIL` (variabile d'ambiente)
con il link al pannello. All'utente approvato arriva l'email di **benvenuto** ("Ti diamo il
benvenuto in MAIA"): l'account è attivo, al primo accesso creerà il suo profilo (fino a 5, uno per
persona di casa), e un pulsante "Entra in MAIA".

Il **primo amministratore** si crea da terminale (nessuno può ancora approvarlo dall'app), da
`maia-be/`:

```bash
npm run account:approve -- persona@esempio.it --admin  # → ACTIVE + ruolo ADMIN
npm run account:approve -- persona@esempio.it          # → ACTIVE (senza pannello)
```

## Email e link monouso

| Email | Link | Durata |
|---|---|---|
| Conferma email (registrazione, "Rimanda l'email") | `/verify-email?token=…` | 48 ore |
| Password dimenticata | `/reset-password?token=…` | 1 ora |
| Nuovo account da approvare (agli admin) | `/admin` | — |
| Account attivato (all'utente approvato) | `/login` | — |

- Nel database c'è solo lo SHA-256 del token; ogni link si usa una volta sola e un nuovo link
  annulla i precedenti dello stesso tipo.
- "Rimanda l'email" e "Password dimenticata" rispondono sempre allo stesso modo, che l'email
  esista o no (non si può scoprire chi è registrato).
- Reimpostare la password chiude **tutte** le sessioni; cambiarla dalle impostazioni chiude tutte
  **tranne quella in uso**.
- Invio (`maia-be/src/mail`): con `RESEND_API_KEY` impostata via **Resend** (SMTP, host/porta/
  utente fissi nel codice); senza, in **Mailpit** (sviluppo, vedi [dev.md](dev.md)). Se il server
  di posta non risponde l'errore va nel log e la richiesta non fallisce.

## Sessioni

- Login → due cookie `httpOnly`, `SameSite=Lax` (`Secure` automaticamente quando `APP_URL` è `https://`):
  - `maia_at`: access token JWT, 15 minuti (`sub` = account, `sid` = sessione);
  - `maia_rt`: refresh token casuale, 30 giorni, salvato come hash nella tabella `sessions`.
- **Dispositivi connessi** (pagina Account): l'elenco delle sessioni aperte, con un nome ricavato dallo
  user agent (`auth/device.ts`, una stima) e l'ultimo uso. Ogni altro dispositivo si può disconnettere,
  uno alla volta o tutti insieme; per questo dispositivo si usa "Esci da MAIA".
- Il controllo di accesso guarda anche la sessione, non solo la firma del token
  (`auth/session-check.ts`), altrimenti un dispositivo disconnesso andrebbe avanti fino a 15 minuti. Una
  sessione confermata non viene richiesta per 15 secondi; chiusa dall'app vale subito, chiusa in altri modi
  (cambio password, sospensione) entro quei 15 secondi. Il dispositivo disconnesso torna al login alla
  richiesta successiva, o al controllo di `/me` di ogni minuto se è fermo.
- `POST /auth/refresh` ruota il refresh token (il vecchio smette di valere) e rinnova l'access.
  Il frontend lo chiama da solo alla prima risposta 401 e ripete la richiesta (`maia-fe/lib/api.ts`).
- I cookie sono di prima parte: il browser parla solo con maia-fe, che inoltra `/api/*` a maia-be
  (vedi [architecture.md](architecture.md)).
- Limite di richieste: 10 al minuto per IP sugli endpoint `/auth/*` (60 per il refresh), 120 al
  minuto sul resto.

## Ruoli

- **Amministratore** (`role: ADMIN`): usa il pannello admin; in futuro deciderà anche le app.
- **Titolare dell'account**: gestisce i propri profili e i propri dati.

## Pannello admin (`/admin`)

Visibile solo agli account `ADMIN` attivi: ci si arriva dal menu del profilo nell'app
("Amministrazione") e dalla pagina Account. Per gli altri la pagina dice che è riservata e le API
rispondono 403 `NOT_ADMIN`. Il ruolo è ricontrollato sul database a ogni chiamata, quindi togliere
il ruolo o sospendere un admin ha effetto subito.

Due schede, la cui scelta resta nell'indirizzo (`/admin?tab=services`: ricaricando si torna sulla
stessa): **Account** (badge: account da approvare) e **Servizi** (badge: servizi spenti).

- **Servizi**: un interruttore per ogni servizio esterno (SDM, TMDB) per fermare subito ogni
  richiesta verso quel servizio; mostra chi l'ha spento e quando. Lo stato è scritto accanto
  all'interruttore ("Attivo" verde / "Spento" rosso) e la riga di un servizio spento ha il bordo
  rosso, perché il solo interruttore si legge male. Sotto la sorgente dello streaming (SDM) c'è il suo
  **Indirizzo**.
- **Account** — filtri con i conteggi: **Da approvare** (si apre qui), Email da confermare, Attivi, Sospesi, Tutti;
  ricerca per nome o email.
- Ogni riga: nome, email, stato, badge Admin, data di registrazione, email confermata o no, numero
  di profili, e le azioni dello stato:

| Stato | Azioni |
|---|---|
| Da approvare | **Approva**, Rifiuta |
| Email da confermare | Approva comunque (conta come email confermata), Rifiuta |
| Attivo | Rendi admin / Togli admin, Sospendi |
| Sospeso | **Riattiva**, Elimina |

- **Rifiuta / Elimina** cancellano l'account con profili, sessioni e link; **Sospendi** chiude
  anche tutte le sue sessioni. Le tre azioni chiedono conferma con una spiegazione.
- Sul proprio account (segnato "(tu)") non ci sono azioni: un admin non può sospendersi, eliminarsi
  o togliersi il ruolo, così MAIA non resta senza amministratori per sbaglio.

## Profili

- Massimo **5** per account; nomi unici nell'account (senza distinguere maiuscole); 1-20 caratteri.
- Avatar: iniziale su un gradiente del colore scelto (`hue`, 8 colori proposti).
- **Guida iniziale** (`/welcome`) per un account senza profili: spiega i profili, fa creare il
  primo (nome proposto = nome dell'account), poi "Inizia a guardare" o "Aggiungi altri profili".
  "Chi sta guardando?" rimanda alla guida finché non c'è almeno un profilo.
- **Gestisci profili** su `/profiles`: avatar scuriti con la matita; tocco → modifica nome e colore
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

Oggi l'elenco delle app è fisso nel frontend (`maia-fe/lib/apps.ts`).

## Login col telefono (TV e computer)

Sul computer si arriva allo stesso QR con "Entra col telefono" nella pagina di login, che compare solo con
un mouse: un telefono non può inquadrare il proprio schermo.

Sulla TV la pagina di login parte da un QR e da un codice di 6 caratteri, senza scrivere nulla col
telecomando. Il QR apre `/link?code=…` sul telefono (senza QR si apre `/link` e si scrive il codice), che
deve avere già una sessione: mostra quale dispositivo chiede di entrare, e con "Conferma" la TV riceve
la sua sessione. La TV tiene un token segreto e chiede la risposta ogni 2 secondi
(`/auth/pair/poll`): il codice da solo non fa entrare nessuno. Il codice dura 5 minuti e poi la TV ne prende
uno nuovo da sola; resta il pulsante "Usa email e password". Il telefono ha già superato il suo login,
quindi la verifica in due passaggi non viene chiesta di nuovo.

## Verifica in due passaggi

Solo via email, facoltativa, da Account. Dopo la password arriva un codice di 6 cifre: vale 10 minuti e
5 tentativi, ed è legato a un token di sfida (`auth/two-factor.service.ts`, tabella `email_codes`).
Per attivarla bisogna inserire un codice ricevuto, così è dimostrato che le email arrivano; per
disattivarla serve la password. Reimpostare la password non la salta. Se le email non arrivano più:
`npm run account:2fa-off -- <email>` in `maia-be`.
Se l'email non parte l'app lo dice (`MAIL_FAILED`) invece di aspettare un codice mai spedito. Con il mittente
di prova di Resend (`onboarding@resend.dev`) le email arrivano solo al proprietario dell'account Resend: per
gli altri account serve un dominio verificato.

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
| POST | `/auth/login/verify`, `/auth/login/resend` | secondo passaggio del login |
| POST | `/auth/pair/start`, `/auth/pair/poll` | login sulla TV: QR e attesa della risposta |
| GET, POST | `/auth/pair/:code`, `/auth/pair/approve`, `/auth/pair/reject` | la risposta dal telefono |
| POST | `/me/two-factor/start`, `/enable`, `/disable` | attiva e disattiva la verifica |
| GET | `/me/sessions` | dispositivi connessi |
| DELETE | `/me/sessions/:id` | disconnette un altro dispositivo |
| DELETE | `/me/sessions` | disconnette tutti gli altri |
| POST | `/auth/forgot-password` | `{email}` |
| POST | `/auth/reset-password` | `{token, password}` |
| GET / PATCH | `/me` | account + profili / `{name}` |
| POST | `/me/password` | `{currentPassword, newPassword}` |
| GET / POST | `/profiles` | elenco / `{name, hue}` |
| PATCH / DELETE | `/profiles/:id` | `{name?, hue?, lastAppKey?}` |
| GET | `/admin/accounts` | `?status=&q=` → `{accounts, counts}` (solo ADMIN) |
| POST | `/admin/accounts/:id/approve` | da `PENDING_*` a `ACTIVE` + email all'utente |
| POST | `/admin/accounts/:id/suspend` | `SUSPENDED` + sessioni chiuse |
| POST | `/admin/accounts/:id/reactivate` | da `SUSPENDED` a `ACTIVE` |
| POST | `/admin/accounts/:id/role` | `{role: USER\|ADMIN}` |
| DELETE | `/admin/accounts/:id` | rifiuta / elimina |
| GET | `/admin/services` | servizi esterni con interruttore, pausa automatica e titoli in coda |
| POST | `/admin/services/:id` | `{enabled}`: spegne o riaccende un servizio (subito) |
| PATCH | `/admin/services/:id/sync` | `{mode: AUTO\|MANUAL, at: "HH:MM", everyHours}`: orari di aggiornamento di una fonte |
| POST | `/admin/services/:id/sync-now` | passata completa adesso (409 `SERVICE_OFF` / `ALREADY_RUNNING`) |
