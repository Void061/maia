# Sviluppo locale

## Requisiti

- Node 24 (`nvm4w`), npm 11
- Docker Desktop: su questo PC è installato per utente, in
  `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe` (non in `Program Files`).

## Avvio

Sviluppo di tutti i giorni: database in Docker, app in locale con ricaricamento automatico.

```bash
docker compose up -d postgres      # Postgres su localhost:5433
cd maia-be && npm run start:dev    # http://localhost:3000
cd maia-fe && npm run dev          # http://localhost:3001
```

Tutto in container, come in produzione: `docker compose up --build`.
Spegnere: `docker compose down` (con `-v` cancella anche i dati del database).

Le porte 3000 e 3001 sono le stesse per i container e per le app in locale: non si possono usare
le due modalità insieme.

## Variabili d'ambiente

| File | Contenuto |
|---|---|
| `maia-be/.env` | `DATABASE_URL` (verso `localhost:5433`) |
| `maia-fe/.env.local` | `NEXT_PUBLIC_API_URL=http://localhost:3000` |

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

## Problemi noti

- **Prisma:** non installare `prisma@latest` (punta a una release candidate della 8 che blocca
  npm). Usare la versione fissata nel `package.json`.
- **npm `allow-scripts`:** npm 11 chiede di approvare gli script di installazione. Prisma è già
  approvato (`allowScripts` nel `package.json` del backend).
- **Next:** `params` letti fuori da `<Suspense>` producono un avviso nel dev overlay (vedi
  [architecture.md](architecture.md)).
- **Fine riga:** solo LF (`.gitattributes`, `.editorconfig`).
