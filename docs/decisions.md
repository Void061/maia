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

**Organizzazione del catalogo come HBO Max.** Home a righe editoriali (Continua a guardare,
Top 10, In onda ora, Esplora, Novità, In primo piano) prima delle righe per genere; Film e Serie
come mini-Home; griglia completa solo nella pagina del genere; scheda titolo a schede (Episodi,
Altri come questo, Dettagli); titolo dentro la locandina. Sostituisce le pagine Film/Serie a
griglia con filtri.

## 2026-10-30

**Il browser parla solo con maia-fe**: `/api/*` è inoltrato a maia-be da un route handler di Next
con `API_URL` letto a runtime. Sostituisce `NEXT_PUBLIC_API_URL`. Motivo: cookie di sessione di
prima parte, niente CORS, stessa build ovunque, e l'app funziona anche aperta dall'IP di casa
(telefono, TV), dove `localhost:3000` non esisterebbe.

**Sessioni con cookie httpOnly**: access token JWT di 15 minuti + refresh token a rotazione di 30
giorni salvato come hash in `sessions`. Niente token in `localStorage` (non leggibili da script).

**Password con scrypt di `node:crypto`** invece di argon2/bcrypt: nessuna dipendenza nativa da
compilare (npm 11 blocca gli script di installazione).

**Email via SMTP generico**, con Mailpit in sviluppo: in produzione basta cambiare le variabili
per usare un provider (Resend, Brevo...).

**Approvazione da terminale** (`npm run account:approve`) finché non c'è il pannello admin.
*(Superata dal pannello admin, sotto: il comando resta solo per creare il primo amministratore.)*

**Guida iniziale obbligatoria** se l'account non ha profili: ne serve almeno uno per usare l'app.

**Profilo scelto salvato sul dispositivo, ultima app salvata nel profilo**: dispositivi diversi
possono essere su profili diversi; l'app da riaprire segue la persona.

**Pannello admin `/admin`** per approvare, rifiutare, sospendere, riattivare e promuovere gli
account. Un admin non può agire sul proprio account (niente rischio di restare senza admin).
"Approva comunque" un account con email non confermata la conta come confermata. "Rifiuta"
elimina l'account invece di lasciarlo in uno stato "rifiutato": per una casa non serve tenere
lo storico delle registrazioni scartate.

**Codice in inglese, testi in italiano.** Componenti, file, cartelle, percorsi delle pagine,
parametri, slug, identificatori e commenti in inglese; interfaccia ed email in italiano; docs in
italiano. Rinominati i percorsi esistenti (es. `/profili` → `/profiles`, `/guarda` → `/watch`,
`/stato/email` → `/status/unverified`) e gli slug dei generi e delle categorie dei canali.

**Email di benvenuto all'approvazione** invece di un semplice "account attivo".

**Tolto "Accedi con il telefono" dal login**: tornerà solo sulla TV con il login a codice.

**Deploy: tutto sulla VPS, Cloudflare davanti come proxy**, non il frontend statico su Cloudflare
(il frontend ha bisogno di un server). **Email con Resend via SMTP.**

**Configurazione minima.** Resend (host, porta, utente SMTP) è fisso nel codice: si imposta solo
`RESEND_API_KEY`, e senza chiave le email vanno a Mailpit. `COOKIE_SECURE` eliminata: i cookie sono
`Secure` quando `APP_URL` è `https://`. Variabili del backend: `DATABASE_URL`, `JWT_SECRET`,
`APP_URL`, `RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_EMAIL` (facoltativa).

**Anteprima da remoto con ngrok (`npm run remote` in maia-fe)**, sempre dietro basic auth
(`Ivan` / `12341@`), per provare le modifiche da qualsiasi rete. La basic auth la fa lo script e
non ngrok, perché ngrok vuole password di almeno 8 caratteri.

## 2026-10-31

**Video riprodotto sempre sul dispositivo, mai dal server.** La VPS (Contabo, IP francese) è
fuori dall'Italia e non si usano altre VPS, apparecchi a casa o app native. Misurato: RaiPlay
blocca dall'estero solo il relinker (film e serie 0 su 14 da un IP estero, tutti ok dall'Italia),
mentre il catalogo si legge da ovunque. Il browser dà il relinker a `<video src>` (HLS nativo,
senza CORS) e Rai vede l'IP italiano dell'utente. Tolto il proxy video nel backend previsto prima.
Limite accettato: su Firefox i contenuti Rai non partono.

**Primo servizio RaiPlay, Pluto TV rimandato.** Pluto assegna il paese dall'IP (da un IP
tedesco dà il catalogo tedesco) e le sue API accettano solo `pluto.tv`: senza IP italiano non
si può.

**Aggiornamento del catalogo a due livelli** (dati grezzi per servizio + catalogo MAIA),
alberatura = unione delle fonti, TMDB come ossatura, coda di revisione nel pannello admin,
ritmo di controllo che si adatta (giorno → settimana → mese, idea dall'add-on Kodi KoD) più la
data del prossimo episodio da TMDB. Coda dei lavori con pg-boss su Postgres. Da KoD (GPL-3) si
prendono solo idee ed endpoint, non codice.

**Extra in una sezione a parte.** Highlights, clip, anticipazioni e simili si tengono (sono molti:
nel campione RaiPlay 4141 contro 1868 episodi), ma come Extra della scheda, divisi in gruppi e
legati alla stagione quando c'è, mai nella lista episodi. Non si abbinano a TMDB: appartengono al
titolo su cui sono stati trovati.

**Catalogo costruito con pg-boss nel backend.** I lavori (passata notturna, novità ogni 3 ore,
titoli in scadenza ogni ora, un lavoro per titolo) girano nel container di maia-be, nello stesso
Postgres: niente Redis né altre risorse. In sviluppo locale girano in un processo a sé
(`npm run catalog:worker`) perché i riavvii di `start:dev` interromperebbero il riempimento.

**Episodi che TMDB non ha ancora: provvisori.** Si mostrano con stagione e numero (o data) del
servizio e si ricollocano a ogni sincronizzazione finché TMDB li aggiunge, invece di aspettare.
Le puntate dei programmi si collocano prima per data di messa in onda, poi per numero.

**Elenco completo di RaiPlay per esplorazione** delle pagine di sezione, genere, raccolta e
collezione (6753 programmi), perché RaiPlay non ha un indice A-Z pubblico.

**Frontend collegato al catalogo vero.** Film, serie, generi, ricerca, schede e player leggono
maia-be; i dati finti restano solo per le dirette (`lib/live-demo.ts`). Le pagine con parametro
hanno un solo parametro segnaposto in `generateStaticParams` (Cache Components ne vuole almeno uno)
e caricano i dati nel browser, perché il catalogo cambia di continuo. Il player non usa hls.js per
il catalogo: il link va in `<video src>` (vedi riproduzione sul dispositivo).

**Cache delle API in Redis** (chiesto dall'utente: la navigazione era lenta, la home impiegava
~1,5-2 s). Chiavi `MAIA_APP_<chiave dell'elemento>`; ogni lavoro del catalogo che cambia i dati
svuota tutta la cache di MAIA; un valore che va in errore 3 volte (`CACHE_MAX_FAILS`) si cancella e
si ricalcola. Redis è solo un acceleratore: senza, l'app funziona come prima. Cambia la decisione
precedente "niente Redis": quella riguardava la coda dei lavori, che resta su pg-boss/Postgres.

**Immagini RaiPlay ritagliate dal loro servizio `cropgd`.** Le locandine originali pesano 0,5-1 MB
(1536×2048) e la home ne carica quasi 200; ritagliate a 384×512 pesano ~45 KB.

**Il player si ferma quando si esce.** Con Cache Components Next nasconde le pagine visitate invece
di smontarle, e il video nascosto continuava a suonare (segnalato dopo schermo intero + rotazione e
uscita). Ora si mette in pausa, esce dallo schermo intero e riprende dallo stesso punto al ritorno.

**Riserva hls.js per i flussi che l'HLS nativo rifiuta.** "Le staffette della memoria" risultava
"non disponibile": la fonte c'era, ma Chrome non legge la sua playlist (una sola qualità senza
`CODECS`), mentre hls.js sì. Il relinker non ha CORS, quindi il link diretto lo legge il backend
(una richiesta, il video passa comunque dal dispositivo). Corregge la decisione "niente hls.js per
il catalogo": resta l'HLS nativo come prima scelta, hls.js è la riserva.

**Riscaldamento della cache dopo ogni svuotamento** (idea dell'utente: un "mini bot" che dopo il
job fa un giro di MAIA). Fatto dentro il backend chiamando direttamente `TvService` invece che con
richieste HTTP: niente sessione da gestire e chiavi identiche a quelle delle API per costruzione.

**Immagini vere degli episodi** (chiesto dall'utente: le miniature erano tutte lo sfondo del
titolo). Si prende l'immagine che RaiPlay dà a ogni puntata e clip, non quella di TMDB: è del video
che si riproduce e c'è anche per le puntate che TMDB non ha. Per caricarle sui dati esistenti sono
stati rimessi in coda una volta tutti i titoli con puntate o extra (2737).

**Comando `npm run catalog -- resync <servizio> [--episodes]`.** Rilegge subito tutti i titoli già
presenti. Serve quando cambia il nostro codice del catalogo (non RaiPlay): il ritmo adattivo
aggiornerebbe i titoli fermi solo dopo settimane. La regola è anche in `CLAUDE.md`, così viene
ricordata a ogni modifica di questo tipo e al deploy.

**Rispetto dei servizi come regola per ogni provider** (chiesto dall'utente: non dare fastidio ai
servizi, rischio di blocchi e denunce). RaiPlay passa da una richiesta ogni 250 ms a una al secondo
(~20 titoli al minuto invece di ~40), TMDB da richieste sovrapposte ogni 40 ms a una alla volta
ogni 250 ms; 429/403 fermano subito il servizio per 6 ore; attese più lunghe tra i tentativi;
operazioni massicce solo con conferma. Il primo riempimento e i `resync` durano circa il doppio:
accettato, girano di notte o una volta sola.

**Nessun Referer verso i servizi, per tutti i provider** (chiesto dall'utente: video e copertine non
devono rivelare l'app da cui arrivano). `Referrer-Policy: no-referrer` su tutto il frontend, in due
punti (header e meta). Limite noto: l'`Origin` delle richieste hls.js non si può togliere. Escluso
esplicitamente fingersi il servizio o copiarne i token.

**Condizioni d'uso di RaiPlay: verificate per quanto possibile, si va avanti.** Il testo ufficiale
delle condizioni non è stato trovato (non indicizzato; rai.it e raiplay.it bloccano gli strumenti
AI, che non si aggirano). La privacy policy dei prodotti multimediali Rai non parla dell'uso da app
di terzi. Le guide trovate vietano solo lo **scaricamento** con strumenti non ufficiali; nessuna
fonte conferma un divieto di embedding. La giurisprudenza della Corte di Giustizia UE (link ed
embed di contenuti liberamente accessibili non violano il diritto d'autore, salvo aggiramento di
misure tecniche contro l'embedding) va nella direzione di MAIA. Decisione dell'utente: si continua,
restando privati (uso di casa, niente soldi né diffusione) e con le regole di "Rispetto dei
servizi" (docs/tv/catalog.md). Punto da tenere d'occhio: la riserva hls.js, dove il server legge
il link del video, è la parte più vicina a un aggiramento; si toglie se emergesse un dubbio. Se
MAIA uscisse dalla cerchia di casa: leggere il testo ufficiale e sentire un legale.
