# Deploy

Deploy su **Coolify** nella VPS, come Yuma: due risorse con Build Pack Dockerfile più un
database PostgreSQL gestito da Coolify.

| Risorsa | Base directory | Porta | Variabili |
|---|---|---|---|
| maia-be | `/maia-be` | 3000 | `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `ADMIN_EMAIL`, `COOKIE_SECURE=true` |
| maia-fe | `/maia-fe` | 3001 | `API_URL` (indirizzo interno di maia-be, es. `http://maia-be:3000`), a runtime |

maia-be non va esposto su internet: il browser passa sempre da maia-fe (`/api/*`).
`APP_URL` è l'indirizzo pubblico di maia-fe (i link nelle email puntano lì). Per l'SMTP serve un
provider vero (es. Resend o Brevo, piano gratuito) con il dominio verificato per `MAIL_FROM`.
Approvare un account in produzione: dal terminale del container maia-be,
`npm run account:approve -- persona@esempio.it`.

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
