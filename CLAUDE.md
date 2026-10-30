# MAIA

Hub per la casa (*My Assistant In the Apartment*) per TV, desktop, tablet e telefono.
Monorepo: `maia-fe/` (Next.js) e `maia-be/` (NestJS + Prisma).

## Documentazione: leggerla e aggiornarla sempre

Tutto ciò che è stato deciso e implementato è in [`docs/`](docs/README.md).

- **Prima di lavorare** su una parte, leggi il documento relativo in `docs/` (e
  `docs/decisions.md` per il perché delle scelte).
- **Ogni modifica** che cambia comportamento, struttura, configurazione o una decisione
  aggiorna la documentazione **nello stesso commit**. Una decisione nuova o cambiata si
  aggiunge in fondo a `docs/decisions.md` con data e motivo.
- Se la documentazione e il codice non coincidono, segnalalo e correggi la documentazione.

## Regole

- **Codice sempre in inglese**: nomi di componenti, file e cartelle, **percorsi delle pagine**
  (es. `/profiles`, non `/profili`), parametri e slug negli URL, identificatori, chiavi, codici di
  errore e **commenti**. In italiano restano solo i testi che l'utente legge (interfaccia, email)
  e la documentazione in `docs/`.
- Frontend: questa versione di Next.js ha API diverse da quelle note. Prima di scrivere codice
  leggi la guida in `maia-fe/node_modules/next/dist/docs/` (vedi `maia-fe/AGENTS.md`).
- Niente aggiramento del DRM e solo servizi gratuiti (vedi `docs/tv/catalog.md`).
- Prisma resta sulla versione fissata nel `package.json` del backend: non usare `prisma@latest`.
- Fine riga solo LF.
- Porte locali fisse: `maia-be` su 3000, `maia-fe` su 3001.
