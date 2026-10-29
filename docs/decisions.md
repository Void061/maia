# Registro delle decisioni

Una voce per decisione, la più recente in fondo. Se una decisione viene cambiata, non si
cancella: si aggiunge una nuova voce che la sostituisce e si segna quella vecchia come superata.

## 2026-10-29

**Nome: MAIA** (*My Assistant In the Apartment*). Nome femminile "da assistente", pensato per
un hub della casa e non solo per lo streaming. Le sezioni si chiamano *MAIA + nome* (es. MAIA TV).

**Solo servizi gratuiti e legali; niente aggiramento del DRM.** I contenuti protetti da DRM non
si riproducono nel player di MAIA. I contenuti non protetti di servizi senza API ufficiale
(RaiPlay, Pluto TV) si usano per uso personale, accettando che i sistemi interni dei servizi
possano cambiare e rompere l'adapter.

**Player proprio per ogni servizio**: MAIA ricava il link del flusso (HLS/DASH) dal servizio e lo
riproduce nel proprio player, con qualità, sottotitoli, lingue e velocità.

**Stack: Next.js (maia-fe) + NestJS con Prisma (maia-be)**, in un monorepo con due app
indipendenti (come Yuma), non un workspace npm condiviso.

**Tipi del frontend generati dall'OpenAPI del backend** (`@nestjs/swagger` + `openapi-typescript`)
invece di un pacchetto condiviso: il backend resta l'unica fonte di verità e le app restano
indipendenti. *Non ancora installato.*

**Catalogo unico salvato nel database**, aggiornato periodicamente dagli adapter dei servizi;
il frontend non interroga mai direttamente i servizi. Vedi [tv/catalog.md](tv/catalog.md).

**Categorie come tipo × genere**, non come albero: "Film > Horror" è un filtro, le scorciatoie
(es. "Commedie" su film e serie insieme) sono voci di menu salvate nel database.

**Più fonti per lo stesso film/episodio**, con scelta automatica della migliore e passaggio
automatico a un'altra se una non risponde, anche a metà visione.

**Immagini Docker `node:24.22.1-alpine`**: release con le correzioni di sicurezza di ottobre 2026
(Brotli RCE, CVE-2026-111497). Node 24 perché Nest 12 e il progetto sono già impostati su Node 24.

**Prisma fissato a 7.10.1.** Il tag npm `latest` di Prisma punta a `8.0.0-rc.28`, che blocca
`npm install`. Non aggiornare a `latest` finché la 8 non è stabile.

**`prisma` e `dotenv` tra le dipendenze di produzione** del backend, perché il container esegue
`prisma migrate deploy` a ogni avvio.

**Client Prisma generato in `maia-be/src/generated/prisma`**, dentro `src/`, così `nest build`
lo compila insieme all'app.

**Postgres locale sulla porta 5433** dell'host, per convivere con quello di Yuma (5432).

**Accesso:** app chiusa senza login; registrazione aperta a chiunque → conferma email →
approvazione manuale dell'amministratore. Account con massimo 5 profili. Gli amministratori
abilitano le app per account. Dopo la scelta del profilo si riapre l'ultima app usata.
Profili bambini e PIN: rimandati. Vedi [access.md](access.md).

**Login sulla TV con QR e codice** confermato dal telefono, al posto di email e password col telecomando.

**UI unica per tutti i dispositivi**, progettata prima per la TV (telecomando) e adattata a
desktop, tablet e telefono. Vedi [ui.md](ui.md).

**Documentazione in `docs/`** nella radice del monorepo, aggiornata a ogni modifica.

**Stile grafico: Apple TV / HBO Max** *(sostituisce lo stile "salotto la sera" con accento ambra
e barra laterale)*. Nero vero, grigi di sistema Apple, bianco come colore interattivo, materiale
vetro, menu in alto a pillola, selezione stile tvOS, font Inter. Motivo: lo stile precedente non
piaceva; questi riferimenti sono familiari per un'app di streaming sulla TV. Vedi [ui.md](ui.md).

**Le fonti non si mostrano e non si scelgono.** L'utente non sa che un contenuto può avere più
fonti: niente "Disponibile su", niente "Da RaiPlay" nel player, nessun avviso quando MAIA cambia
fonte. Rimossa la scelta manuale prevista prima. Vedi [tv/catalog.md](tv/catalog.md).
