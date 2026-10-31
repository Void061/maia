# Deploy

Deploy su **Coolify** nella VPS, come Yuma: due risorse con Build Pack Dockerfile più un
database PostgreSQL gestito da Coolify.

| Risorsa | Base directory | Porta | Variabili |
|---|---|---|---|
| maia-be | `/maia-be` | 3000 | `DATABASE_URL`, `JWT_SECRET`, `APP_URL` (pubblico, `https://`), `RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_EMAIL` (facoltativa), `TMDB_API_KEY` (catalogo) |
| maia-fe | `/maia-fe` | 3001 | `API_URL` (indirizzo interno di maia-be, es. `http://maia-be:3000`), a runtime |

maia-be non va esposto su internet: il browser passa sempre da maia-fe (`/api/*`).
`APP_URL` è l'indirizzo pubblico di maia-fe (i link nelle email puntano lì; con `https://` i
cookie diventano `Secure` da soli).
Il primo amministratore in produzione si crea dal terminale del container maia-be,
`npm run account:approve -- persona@esempio.it --admin`; gli altri account dal pannello `/admin`.

## Catalogo MAIA TV

Il backend in produzione esegue anche i lavori del catalogo (pg-boss, tabelle nello schema
`pgboss` dello stesso database): passata notturna alle 3, novità ogni 3 ore, controlli dei titoli in
scadenza ogni ora. Non serve un'altra risorsa. Il primo riempimento si avvia una volta dal
terminale del container maia-be con `npm run catalog -- fill raiplay` (qualche ora; avanzamento con
`npm run catalog -- status`). `CATALOG_WORKERS=false` li spegne.

## Email con Resend

Server, porta e utente SMTP di Resend sono fissi nel codice: basta impostare su maia-be
`RESEND_API_KEY` (la chiave `re_...`) e `MAIL_FROM` con un dominio verificato su Resend (record
DNS). Senza chiave le email andrebbero a Mailpit, che in produzione non esiste: la chiave è
obbligatoria in produzione.

## Cloudflare

Frontend e backend stanno sulla VPS (Coolify); Cloudflare sta **davanti** come DNS con proxy
(nuvola arancione): HTTPS, cache dei file statici, protezione da attacchi. Il frontend non può
essere un sito statico (gateway `/api`, `proxy.ts`, pagine dinamiche). Turnstile (anti-bot) si può
aggiungere ai moduli di registrazione e password dimenticata indipendentemente da dove gira l'app.
I video non passano mai da qui: li scarica il dispositivo direttamente dai servizi (vedi
[tv/catalog.md](tv/catalog.md)), quindi niente traffico video su VPS e Cloudflare.

## Immagini

Entrambi i Dockerfile sono multi-stage (`deps` → `builder` → `production`), su
`node:24.22.1-alpine`, con utente non root.

- **maia-fe:** `next build` con `output: "standalone"`; l'immagine finale contiene solo
  `.next/standalone`, `.next/static` e `public`, e parte con `node server.js`.
  Nessuna variabile `NEXT_PUBLIC_*`: se un giorno servisse, Next la incorpora al build, quindi va
  aggiunta come `ARG` + `ENV` nel Dockerfile e come variabile di build su Coolify.
- **maia-be:** `prisma generate` + `nest build`; a ogni avvio esegue
  `prisma migrate deploy` (nessun effetto se il database è già aggiornato) e poi
  `node dist/main.js`.

## Aggiornare Node

Per una nuova release di sicurezza di Node, aggiornare il tag `node:<versione>-alpine` nelle tre
righe `FROM` di entrambi i Dockerfile e annotarlo in [decisions.md](decisions.md).
