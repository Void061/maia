# Architettura

## Convenzioni

- **Codice in inglese**: componenti, file, cartelle, percorsi delle pagine, parametri e slug
  (generi: `comedy`, `crime`, ...; categorie dei canali: `general`, `kids`, ...), identificatori,
  codici di errore, commenti. **Testi per l'utente in italiano** (interfaccia, email).
  Documentazione (`docs/`) in italiano.

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

### Gateway `/api` del frontend

Il browser parla **solo con maia-fe**. Le chiamate a `/api/*` passano da un route handler di Next
(`maia-fe/app/api/[...path]/route.ts`) che le inoltra a maia-be all'indirizzo `API_URL` (letto a
runtime, lato server), copiando cookie e `Set-Cookie`. Vantaggi: i cookie di sessione sono di prima
parte, niente CORS, e l'app funziona uguale da `localhost`, dall'IP di casa o dal dominio di
produzione. maia-be ha `trust proxy` attivo per leggere l'IP reale da `X-Forwarded-For`.

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
TypeScript da quella descrizione con `openapi-typescript`: `npm run gen:api` in `maia-fe` (con
maia-be acceso) scrive `lib/api-schema.d.ts`, che va committato. Se cambia un campo nel backend, si
rigenerano i tipi e il compilatore del frontend segnala dove va aggiornato il codice. I tipi usati
dal codice sono riesportati da `lib/api.ts` (`Account`, `Profile`).

## Frontend

- Next.js 16.4 con **Cache Components** e **Partial Prefetching** attivi (default del template).
  Conseguenza pratica: le pagine dinamiche che leggono `params` devono farlo dentro un
  `<Suspense>`, altrimenti il dev overlay segnala "URL data outside of Suspense". Vedi gli esempi
  in `app/status/[state]/page.tsx` e `app/tv/title/[id]/page.tsx`.
- Prima di scrivere codice Next, leggere la guida in `maia-fe/node_modules/next/dist/docs/`
  (questa versione ha API diverse da quelle note: vedi `maia-fe/AGENTS.md`).
- React Query è collegato in `app/providers.tsx`. `lib/api.ts` è il client delle chiamate (passa da
  `/api`, rinnova la sessione alla prima 401, trasforma gli errori in `ApiError` con il `code` del
  backend); `lib/account.ts` ha le query e le mutation di account e profili (`useMe`, ...).
- `proxy.ts` (il vecchio middleware di Next) blocca le pagine dell'app senza cookie di sessione e
  manda chi ha già una sessione da `/` e `/login` direttamente ai profili.
- Tailwind 4, con i token del design system in `app/globals.css` (vedi [ui.md](ui.md)).

## Backend

- NestJS 12, ESM (`"type": "module"`), Node 24.
- Prisma 7.10.1 (fissato, vedi [decisions.md](decisions.md)), config in `prisma7.config.ts`,
  client generato in `src/generated/prisma` (ignorato da git, si rigenera con `npx prisma generate`).
- Prisma 7 usa il driver adapter `@prisma/adapter-pg` (`src/prisma/prisma.service.ts`).
  `prisma migrate dev` **non** rigenera più il client: usare `npm run db:migrate` (migrate +
  generate) o lanciare `npx prisma generate`.
- Moduli: `prisma` (globale), `mail` (SMTP), `auth` (registrazione, sessioni, guard), `account`
  (`/me`), `profiles`. Configurazione con `@nestjs/config` dal file `.env`; validazione con
  `class-validator` (`ValidationPipe` con `whitelist`); limite di richieste con `@nestjs/throttler`.
- Swagger su `/docs`. Gli errori di dominio hanno sempre `{ code, message }` (es.
  `INVALID_CREDENTIALS`), così il frontend sceglie la schermata giusta senza leggere i testi.
