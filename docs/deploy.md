# Deploy

Deploy su **Coolify** nella VPS, come Yuma: due risorse con Build Pack Dockerfile più un
database PostgreSQL gestito da Coolify.

| Risorsa | Base directory | Porta | Variabili |
|---|---|---|---|
| maia-be | `/maia-be` | 3000 | `DATABASE_URL` (runtime) |
| maia-fe | `/maia-fe` | 3001 | `NEXT_PUBLIC_API_URL` come **variabile di build** |

## Immagini

Entrambi i Dockerfile sono multi-stage (`deps` → `builder` → `production`), su
`node:24.22.1-alpine`, con utente non root.

- **maia-fe:** `next build` con `output: "standalone"`; l'immagine finale contiene solo
  `.next/standalone`, `.next/static` e `public`, e parte con `node server.js`.
  Le variabili `NEXT_PUBLIC_*` vengono incorporate nel bundle al momento del build: ogni nuova
  variabile richiede la coppia `ARG` + `ENV` nel Dockerfile e va impostata su Coolify come
  variabile di build.
- **maia-be:** `prisma generate` + `nest build`; a ogni avvio esegue
  `prisma migrate deploy` (nessun effetto se il database è già aggiornato) e poi
  `node dist/main.js`.

## Aggiornare Node

Per una nuova release di sicurezza di Node, aggiornare il tag `node:<versione>-alpine` nelle tre
righe `FROM` di entrambi i Dockerfile e annotarlo in [decisions.md](decisions.md).
