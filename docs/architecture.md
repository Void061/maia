# Architettura

## Monorepo

```
maia/
├── docs/                 documentazione (questa cartella)
├── docker-compose.yml    ambiente locale: postgres + maia-be + maia-fe
├── maia-be/              NestJS + Prisma (PostgreSQL)
└── maia-fe/              Next.js (App Router) + Tailwind + React Query
```

`maia-be` e `maia-fe` sono due app indipendenti, ognuna con il suo `package.json` e il suo
lockfile. Comunicano solo via HTTP (REST). Non c'è un workspace npm condiviso.

| App | Porta locale | Note |
|---|---|---|
| maia-be | 3000 | `PORT` da env, default 3000 |
| maia-fe | 3001 | `npm run dev` / `npm run start` usano `-p 3001` |

Repository GitHub privato: `Void061/maia`, branch `main` e `develop`.

## Le app di MAIA come moduli

MAIA è un contenitore di app (MAIA TV, in futuro altre). Ogni app è:
- un **modulo Nest separato** nel backend (es. `src/modules/tv/`);
- un **gruppo di pagine** nel frontend sotto il proprio percorso (es. `app/tv/`), con la sua
  shell di navigazione;
- una riga nel **registro delle app** nel database (`App`, chiave es. `tv`), abilitata per account
  dagli amministratori. Vedi [access.md](access.md).

Un controllo d'accesso unico nel backend (guard Nest) verifica per ogni chiamata: account attivo,
profilo valido e app abilitata per account e profilo.

## Tipi condivisi tra FE e BE

Il backend descrive le sue API con `@nestjs/swagger` (OpenAPI). Il frontend genera i tipi
TypeScript da quella descrizione con `openapi-typescript` (comando previsto: `npm run gen:api`).
Se cambia un campo nel backend, si rigenerano i tipi e il compilatore del frontend segnala
dove va aggiornato il codice. *Stato: non ancora installato.*

## Frontend

- Next.js 16.4 con **Cache Components** e **Partial Prefetching** attivi (default del template).
  Conseguenza pratica: le pagine dinamiche che leggono `params` devono farlo dentro un
  `<Suspense>`, altrimenti il dev overlay segnala "URL data outside of Suspense". Vedi gli esempi
  in `app/stato/[stato]/page.tsx` e `app/tv/titolo/[id]/page.tsx`.
- Prima di scrivere codice Next, leggere la guida in `maia-fe/node_modules/next/dist/docs/`
  (questa versione ha API diverse da quelle note: vedi `maia-fe/AGENTS.md`).
- React Query è collegato in `app/providers.tsx`; si userà per le parti interattive (player,
  progressi, ricerca), mentre le pagine di catalogo potranno leggere i dati lato server.
- Tailwind 4, con i token del design system in `app/globals.css` (vedi [ui.md](ui.md)).

## Backend

- NestJS 12, ESM (`"type": "module"`), Node 24.
- Prisma 7.10.1 (fissato, vedi [decisions.md](decisions.md)), config in `prisma7.config.ts`,
  client generato in `src/generated/prisma` (ignorato da git, si rigenera con `npx prisma generate`).
- Prisma 7 richiede un driver adapter a runtime: quando scriveremo il primo accesso al database
  servirà `@prisma/adapter-pg`.
