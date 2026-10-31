# Sviluppo locale

## Requisiti

- Node 24 (`nvm4w`), npm 11
- Docker Desktop: su questo PC è installato per utente, in
  `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe` (non in `Program Files`).

## Avvio

Sviluppo di tutti i giorni: database in Docker, app in locale con ricaricamento automatico.

```bash
docker compose up -d postgres mailpit   # Postgres su :5433, Mailpit su :8025 (web) e :1025 (SMTP)
cd maia-be && npm run start:dev         # http://localhost:3000 (Swagger su /docs)
cd maia-fe && npm run dev               # http://localhost:3001
```

**Email in sviluppo:** con `RESEND_API_KEY` vuota tutte le email finiscono in Mailpit, visibile
su **http://localhost:8025** (non escono verso internet). Mettendo la chiave di Resend partono
email vere (dopo aver riavviato il backend: le variabili si leggono all'avvio).

**Primo account:** registrati dall'app, apri il link di conferma in Mailpit, poi da `maia-be/`:
`npm run account:approve -- tua@email.it --admin`. Da lì in poi gli altri account si approvano
dal pannello `/admin`.

**Database:** dopo una modifica a `prisma/schema.prisma`, `npm run db:migrate` (crea la migrazione
e rigenera il client Prisma).

**Tipi del frontend:** dopo una modifica alle API, con maia-be acceso, `npm run gen:api` in maia-fe.

**Catalogo MAIA TV:** in locale i lavori del catalogo girano in un processo a sé, così i
riavvii di `start:dev` non interrompono un riempimento di ore (`.env`: `CATALOG_WORKERS=false`
li tiene fuori dal server web). Da maia-be, con `TMDB_API_KEY` in `.env`:

```bash
npm run catalog:worker                       # i worker (lasciarlo acceso, come processo separato)
npm run catalog -- fill raiplay              # primo riempimento: tutto RaiPlay (qualche ora)
npm run catalog -- sync raiplay marefuori    # solo i titoli indicati, subito
npm run catalog -- status                    # titoli, abbinamenti, episodi, fonti, coda
```

Log del worker avviato come processo separato: `%TEMP%\maia-logs\catalog-worker.log`.

**Misura catalogo RaiPlay:** `npm run catalog:probe` in maia-be legge un campione di titoli
RaiPlay (o solo quelli indicati: `npm run catalog:probe -- marefuori`) e, con `TMDB_API_KEY`,
misura quanti si abbinano da soli a TMDB. Non scrive nel database; il resoconto completo va in
`maia-be/.probe/report.json` (ignorato da git). Vedi [tv/catalog.md](tv/catalog.md).

Tutto in container, come in produzione: `docker compose up --build`.
Spegnere: `docker compose down` (con `-v` cancella anche i dati del database).

Le porte 3000 e 3001 sono le stesse per i container e per le app in locale: non si possono usare
le due modalità insieme.

## Variabili d'ambiente

| File | Contenuto |
|---|---|
| `maia-be/.env` | `DATABASE_URL`, `JWT_SECRET`, `APP_URL` (link nelle email), `RESEND_API_KEY` (vuota = Mailpit), `MAIL_FROM`, `ADMIN_EMAIL` (facoltativa), `TMDB_API_KEY` (catalogo), `CATALOG_WORKERS` (`false` = lavori del catalogo fuori dal server web) |
| `maia-fe/.env.local` | `API_URL=http://localhost:3000` (dove il gateway `/api` trova maia-be) |

Sono ignorati da git; i modelli sono i rispettivi `.env.example`.

## Vedere l'app da telefono e TV

`next dev` ascolta su tutta la rete: da un dispositivo sulla stessa Wi-Fi si apre
`http://<IP del PC>:3001` (IP attuale del PC sulla Wi-Fi: `192.168.1.6`).

Su Windows serve che la rete sia **privata** e che la porta sia aperta nel firewall
(PowerShell come amministratore):

```powershell
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
New-NetFirewallRule -DisplayName "MAIA dev (3001)" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private
```

In più, `next dev` blocca gli script di sviluppo per chi arriva da un indirizzo diverso da
`localhost`: la pagina si vede ma nessun pulsante funziona. Per questo `next.config.ts` ha
`allowedDevOrigins: ["192.168.1.*"]`. Se la rete di casa cambia sottorete, va aggiornato lì
(e il server di sviluppo riavviato).

In sviluppo sono disattivati i pulsanti flottanti che coprivano l'app su telefono e TV:
l'indicatore "N" di Next (`devIndicators: false` in `next.config.ts`; gli errori compaiono
comunque) e i devtools di React Query (pacchetto rimosso).

## Vedere l'app da fuori casa (ngrok)

Con backend e frontend accesi, da `maia-fe/`:

```bash
npm run remote    # stampa "MAIA remote: https://….ngrok-free.app" (Ctrl+C per chiudere)
```

Il link è **sempre protetto da basic auth**: utente `Ivan`, password `12341@` (si possono
cambiare con `REMOTE_USER` / `REMOTE_PASSWORD`). L'URL cambia a ogni avvio (piano gratuito).

- Lo script (`maia-fe/scripts/remote.mjs`) usa `@ngrok/ngrok`, non serve il programma `ngrok`.
  Il token si legge da `NGROK_AUTHTOKEN` o dal file di configurazione di ngrok
  (`%LOCALAPPDATA%\ngrok\ngrok.yml` o `~/.ngrok2/ngrok.yml`).
- La basic auth la controlla un piccolo proxy dentro lo script, davanti a `next dev` (anche il
  WebSocket del ricaricamento automatico): quella di ngrok vuole password di almeno 8 caratteri.
- Basta esporre il frontend: il gateway `/api` porta le chiamate al backend lato server.
- `next.config.ts` ammette i domini ngrok in `allowedDevOrigins`, altrimenti i pulsanti non
  funzionano.
- Al primo accesso ngrok gratuito mostra una pagina di avviso: si clicca "Visit Site".
- I link nelle email puntano ancora ad `APP_URL` (localhost).

## Problemi noti

- **Prisma:** non installare `prisma@latest` (punta a una release candidate della 8 che blocca
  npm). Usare la versione fissata nel `package.json`.
- **npm `allow-scripts`:** npm 11 chiede di approvare gli script di installazione. Prisma è già
  approvato (`allowScripts` nel `package.json` del backend).
- **Next:** `params` letti fuori da `<Suspense>` producono un avviso nel dev overlay (vedi
  [architecture.md](architecture.md)).
- **Fine riga:** solo LF (`.gitattributes`, `.editorconfig`).
