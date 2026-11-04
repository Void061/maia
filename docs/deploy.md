# Deploy

Deploy su **Coolify** nella VPS, come Yuma: due risorse con Build Pack Dockerfile più un
database PostgreSQL e un **Redis** gestiti da Coolify (Redis senza persistenza: è solo cache).
Il catalogo è letto da TMDB e passa solo dalla cache: dare a Redis almeno 256 MB con
`maxmemory-policy allkeys-lru` (se si riempie butta le voci meno usate invece di dare errore).

| Risorsa | Base directory | Porta | Variabili |
|---|---|---|---|
| maia-be | `/maia-be` | 3000 | `DATABASE_URL`, `JWT_SECRET`, `APP_URL` (pubblico, `https://`), `RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_EMAIL` (facoltativa), `TMDB_API_KEY` (catalogo), `REDIS_URL` (indirizzo interno del Redis di Coolify; facoltativa ma senza la cache l'app è lenta) |
| maia-fe | `/maia-fe` | 3001 | `API_URL` (indirizzo interno di maia-be, es. `http://maia-be:3000`), a runtime |

maia-be non va esposto su internet: il browser passa sempre da maia-fe (`/api/*`).
`APP_URL` è l'indirizzo pubblico di maia-fe (i link nelle email puntano lì; con `https://` i
cookie diventano `Secure` da soli).
Il primo amministratore in produzione si crea dal terminale del container maia-be,
`npm run account:approve -- persona@esempio.it --admin`; gli altri account dal pannello `/admin`.

## Catalogo MAIA TV

Il catalogo non sta nel database: il backend lo legge da TMDB quando serve, quindi non ci sono
lavori da eseguire né riempimenti. Basta `TMDB_API_KEY`, obbligatoria.

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
I video passano dal backend (`GET /tv/proxy/:itemId`): ogni visione consuma banda del server
(circa 1-2 Mbit/s a schermo).

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
