# MAIA

Hub per la casa (_My Assistant In the Apartment_) per TV, desktop, tablet e telefono.
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
- Prisma resta sulla versione fissata nel `package.json` del backend: non usare `prisma@latest`.
- **Rispetto dei servizi (ogni provider, anche futuro):** mai pesare su RaiPlay, TMDB o altri.
  Tutte le richieste passano da `polite-fetch` (una alla volta, max 1/s), stop immediato su
  429/403, niente operazioni massicce (`fill`, `resync`, misure, test ripetuti) senza la conferma
  dell'utente e senza dire prima quante richieste comportano. Ogni servizio esterno va registrato
  in `maia-be/src/tv/providers/services.ts` (host inclusi), così ha il suo interruttore nel
  pannello admin. Il frontend non manda mai il Referer
  (`no-referrer` su tutte le pagine); niente token copiati né imitazioni dei servizi. Dettagli: `docs/tv/catalog.md`,
  "Rispetto dei servizi".
- **Catalogo: se una modifica cambia cosa salva il catalogo** (adapter di un servizio o
  inserimento in `CatalogService`), i titoli già presenti non si aggiornano da soli prima del loro
  prossimo controllo (anche un mese). Dopo la modifica **proponi** all'utente
  `npm run catalog -- resync raiplay` (o `--episodes`) in locale e ricordagli di lanciarlo anche in
  produzione dopo il deploy (è pesante: va confermato, vedi la regola sopra). Quando serve e quando no: `docs/tv/catalog.md`, "Rileggere tutto il catalogo".
- **Cache Redis:** se un valore messo in cache cambia a parità di dati (forma del DTO o del tipo
  interno, oppure come l'API lo calcola), alza
  `CACHE_VERSION` in `maia-be/src/cache/cache.service.ts` (vedi `docs/architecture.md`, "Cache").
- **Frontend senza errori in console:** dopo una modifica al frontend naviga l'app in Chrome
  (desktop e formato telefono: home, Film, Serie, generi, una scheda, il player, ricerca) e
  controlla che non compaiano errori o avvisi di React/Next nella console; vanno risolti prima del
  commit.
- Fine riga solo LF.
- Porte locali fisse: `maia-be` su 3000, `maia-fe` su 3001.
- **Server di sviluppo e tunnel sempre come processi separati**, mai come comandi in background
  dell'agente (vengono chiusi dopo 2 ore). Da PowerShell, log in `%TEMP%\maia-logs\`:
  `Start-Process cmd.exe -ArgumentList '/c','npm run dev > "%TEMP%\maia-logs\fe.log" 2>&1' -WorkingDirectory maia-fe -WindowStyle Hidden`
  (stesso schema per il backend e `npm run remote` in maia-fe → `remote.log`, che contiene l'URL
  ngrok). Prima di rilanciarli, controllare che le porte 3000/3001 non siano già occupate.
- **Backend in locale sempre con `npm run start:debug`** (non `start:dev`), log in `be.log`:
  ricarica come `start:dev` e apre il debugger sulla porta 9229, così da VS Code ci si aggancia con
  "MAIA: aggancia il backend già avviato (9229)" senza riavviare niente (chiesto dall'utente,
  vedi `docs/dev.md`, "Debug con VS Code").

**Tollerabilità negli algoritmi**, A volte potrebbe esser necessario riprendere logiche che funzionano bene da script discutibili, che comunque si devono implemnetare, in quanto rispettano la norma del server locale: 192.168.1.9 => Pellicole del nostro teatro amatoriale, NAS raggiungibile solo quando si è dentro la rete del teatro.
