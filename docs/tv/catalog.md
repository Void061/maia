# MAIA TV: catalogo e riproduzione

_Stato: catalogo RaiPlay nel database con aggiornamento automatico; il frontend lo legge e riproduce i video dal dispositivo (vedi "Implementazione" e "API per il frontend"). Adapter SDM (server di casa) scritto ma non ancora provato: il server non è raggiungibile (vedi "SDM"). Niente dirette né replay: provati e tolti per scelta dell'utente (vedi decisions.md)._

## Servizi

Primo servizio: **RaiPlay**; secondo: **SDM**, il server
multimediale di casa dell'utente (vedi "SDM"). Poi, uno alla volta, gli altri,
ognuno dopo aver verificato che funziona con i vincoli sotto.

| Tipo di contenuto              | In MAIA                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| Flusso non protetto (HLS/DASH) | riprodotto nel player di MAIA                              |
| Protetto da DRM                | **non riproducibile**: niente aggiramento della protezione |

### Vincolo geografico (misurato il 2026-10-31)

Backend e frontend girano sulla VPS Contabo (`207.180.247.225`), che per i servizi è un IP
**francese**. Non si usano altre VPS né apparecchi a casa, e MAIA resta una **web app**.
Prove fatte da IP italiano (casa) e da un IP di data center a Francoforte:

|                             | Da IP italiano  | Da IP estero (data center) |
| --------------------------- | --------------- | -------------------------- |
| RaiPlay: catalogo (JSON)    | leggibile       | leggibile                  |
| RaiPlay: film (6)           | 5 ok, 1 con DRM | 0                          |
| RaiPlay: serie italiane (8) | 8 ok            | 0                          |
| RaiPlay: programmi (8)      | 8 ok            | 5                          |

- Il blocco di RaiPlay sta **solo nel relinker** (`mediapolis(vod).rai.it/relinker/...`), che
  dall'estero restituisce `video_no_available.mp4`. Il link ottenuto da un IP italiano si apre
  da ovunque e i file video hanno CORS `*`.
- Il relinker non ha CORS, quindi il browser non può leggerne la risposta con `fetch`, ma lo
  può dare direttamente a `<video src>`: Chrome 146, Edge, Safari/iOS e Android riproducono
  l'HLS in modo nativo, e un elemento video non ha bisogno di CORS. Provato con "Mare fuori"
  da una pagina di un altro dominio: parte.

## Rispetto dei servizi (regola per ogni provider)

MAIA usa servizi di altri (RaiPlay, TMDB e quelli che verranno). Vale per **qualsiasi provider**,
di catalogo o di metadati, presente o futuro: Lo scraping è morbido anche se diventa lento, mai aggressivo.

- **Tutte le richieste a un servizio passano da `polite-fetch`**: una alla volta per host, al
  massimo **1 al secondo** (`DEFAULT_GAP_MS`). Più veloce solo per un'API ufficiale che pubblica
  limiti più alti, restando molto sotto (TMDB: ~50/s consentite, noi 4/s).
- **Mai richieste in parallelo verso lo stesso servizio**, nemmeno con più worker.
- **Se il servizio dice di rallentare o ci blocca (HTTP 429 o 403)** ci si ferma subito: niente
  nuovi tentativi, il servizio va in pausa per 6 ore (gli altri errori: pausa di 30 minuti dopo 5
  di fila). Tra un tentativo e l'altro dopo un errore 5xx si aspettano 5-10 secondi.
- **Il lavoro pesante si fa di notte** (passata alle 3) e il ritmo dei controlli si adatta
  (giorno → settimana → mese): si rilegge solo quello che può essere cambiato.
- **Il server non scarica video.** Video e immagini li chiede il dispositivo di chi guarda, come
  sul sito del servizio; il server chiede al massimo un link quando l'utente avvia un video.
- **Le pagine dell'app non chiamano i servizi**: leggono dal database e dalla cache.
- **Nessun Referer verso i servizi, sempre e per tutti i provider**: `Referrer-Policy: no-referrer`
  su ogni pagina (header in `maia-fe/next.config.ts` e `<meta name="referrer">` in
  `app/layout.tsx`), così video e immagini chiesti dal browser non dicono da quale app arrivano.
  Resta solo l'`Origin` sulle richieste di hls.js (il browser non permette di toglierlo).
  Verificato il 2026-10-31: nessun Referer verso raiplay.it, i CDN video Rai e TMDB.
- **Interruttore per ogni servizio** nel pannello admin: si può fermare subito ogni richiesta a un
  servizio (vedi "Interruttori dei servizi" sotto).
- **Niente imitazioni**: mai fingersi il servizio o la sua app (intestazioni falsificate, token
  copiati, cambi di IP o identità per evitare blocchi). Se un servizio ci blocca ci si ferma.
- **Operazioni massicce** (`fill`, `resync`, misure su molti titoli, test ripetuti) solo **con
  la conferma dell'utente**, dicendo prima quante richieste comportano, e una volta sola.
- Un nuovo adapter va scritto con queste regole dall'inizio; se un servizio pubblica limiti o
  termini d'uso per le sue API, valgono quelli se più severi.

### Interruttori dei servizi

Dal pannello `/admin` (sezione Servizi) un amministratore spegne o riaccende un servizio esterno
(oggi RaiPlay, SDM e TMDB) per fermarne l'acquisizione, per esempio se il servizio ha problemi o ci
segnala qualcosa.

- **Effetto immediato:** l'interruttore sta nel database (`provider_health.enabled`, con chi e
  quando); backend e worker lo rileggono ogni 3 secondi (`ServiceSwitches`) e `polite-fetch`
  rifiuta ogni richiesta verso gli host di un servizio spento, anche quelle già in coda o in attesa
  di un nuovo tentativo. Misurato: nessun titolo letto mentre RaiPlay era spento.
- **Niente lavoro perso:** un titolo il cui servizio è spento (o TMDB, che serve all'abbinamento)
  non conta come errore: torna in coda per 10 minuti dopo; alla riaccensione i titoli rimandati
  ripartono subito. Le passate complete e le novità di un servizio spento si saltano (la prossima
  programmata parte normalmente). Non c'è pausa automatica né contatore di errori per uno stop
  deciso da noi.
- **Cosa non ferma:** la riproduzione sui dispositivi (video e immagini li chiede il browser di chi
  guarda); si ferma invece la lettura del link fatta dal server per la riserva hls.js.
- È diverso dalla **pausa automatica** (30 minuti dopo 5 errori, 6 ore su 429/403), che resta e si
  vede nello stesso pannello.
- **Ogni nuovo servizio** va aggiunto a `maia-be/src/tv/providers/services.ts` con i suoi host,
  altrimenti non compare nel pannello e non si può spegnere.

### Indirizzo delle fonti

Ogni fonte del catalogo (RaiPlay, SDM e ogni provider futuro) ha un **indirizzo modificabile**
dal pannello `/admin` (scheda Servizi, campo "Indirizzo"): è l'inizio di ogni richiesta che MAIA
le fa. Predefiniti in `maia-be/src/tv/providers/services.ts` (`baseUrl`): RaiPlay
`https://www.raiplay.it`, SDM `http://192.168.1.9`.

- Si salva in `provider_health.base_url` (vuoto = predefinito); backend e worker lo rileggono
  ogni 3 secondi insieme agli interruttori (`ServiceSwitches` → `base-urls.ts`). Gli adapter lo
  leggono a ogni richiesta (`baseUrl('<id>')`), mai fissato nel codice.
- L'host dell'indirizzo in uso conta tra gli host del servizio: lo spegnimento ferma anche il
  nuovo indirizzo. Gli altri host fissi (es. il relinker Rai) restano in `hosts`.
- Accettati solo indirizzi `http`/`https` completi, senza utente, password, `?` o `#`; la barra
  finale si toglie. Riscrivere l'indirizzo predefinito equivale a tornare al predefinito.
- **Cambiandolo, nulla si rilegge dal servizio:** i link già salvati che iniziano con il vecchio
  indirizzo (video delle fonti e degli extra, immagini di episodi ed extra, locandine e sfondi)
  vengono spostati sul nuovo con un aggiornamento del database, e la cache si svuota. Per RaiPlay
  cambia anche l'indirizzo del ritaglio delle immagini (`cropgd`). I titoli risultano "cambiati"
  una volta, al prossimo controllo, perché i link nei dati del servizio sono diversi.
- Ogni nuovo adapter deve usare `baseUrl()` per tutte le richieste e salvare i link assoluti.

Volumi attuali (RaiPlay): un titolo = 2-5 richieste; ~20 titoli al minuto; passata notturna
~qualche migliaio di richieste in qualche ora.

## Riproduzione: sempre sul dispositivo

**Il video non passa mai dal server.** Il backend sceglie la fonte e consegna al frontend
cosa riprodurre; è il browser dell'utente (in Italia) a chiedere il flusso al servizio e a
riprodurlo.

- RaiPlay: `<video src="<relinker>">` con HLS nativo del browser. Il relinker viene richiesto
  dal dispositivo, con il suo IP italiano.
- **Riserva per i flussi che l'HLS nativo rifiuta.** Alcune playlist RaiPlay (una sola qualità,
  audio e video insieme, senza `CODECS`, es. molti contenuti Rai Storia) danno a Chrome
  `DEMUXER_ERROR_COULD_NOT_PARSE`, mentre hls.js le riproduce. hls.js però ha bisogno del link
  finale, e il relinker non ha CORS: il browser non può leggerlo. Allora il player chiede a
  maia-be `GET /tv/playback/:id/stream?provider=`: il backend chiede al relinker la versione JSON
  (`output=62`) e restituisce il link della playlist (scade in pochi minuti, non si salva né va in
  cache). Il video continua a passare dal dispositivo; il server legge solo il link. Dall'estero
  (VPS) funziona per i contenuti senza blocco geografico; per quelli bloccati Rai risponde con il
  suo video "non disponibile" e l'API dà `NO_SOURCE`.
- Altri servizi: hls.js quando il flusso ha CORS aperto, altrimenti HLS nativo come sopra.
- Il link del flusso **non si salva**: si ottiene al momento del play.
- Limiti: **Firefox** non ha HLS nativo: lì si usa solo la riserva sopra (partono i contenuti
  senza blocco geografico); il player nativo dà
  meno controllo di hls.js su qualità e sottotitoli (da verificare cosa espone); dall'estero i
  contenuti bloccati non partono, come sull'app ufficiale.
- DRM: se il player non riesce a riprodurre una fonte (protetta o rotta), il frontend lo
  segnala al backend, che la segna e passa alla successiva.

## Catalogo unico nel database

Il backend tiene una copia del catalogo di tutti i servizi, in un formato unico. Il frontend
legge solo dal backend.

### Due livelli

- **Livello fonti**: quello che dice ogni servizio, così com'è (`ProviderTitle`,
  `ProviderEpisode`: identificativo e numerazione del servizio, `lastSeenAt`,
  `availableUntil`).
- **Livello MAIA**: quello che vede l'utente (`Title` → `Season` → `Episode`). Una `Source`
  collega un episodio (o un film) di un servizio all'episodio MAIA.

**L'alberatura è l'unione delle fonti.** Se RaiPlay ha gli episodi 1-3 di una stagione e un
altro servizio anche il 4, in MAIA la stagione ha 4 episodi (il 4 con una sola fonte). Un
episodio compare se ha almeno una fonte disponibile e non protetta; senza fonti si nasconde ma
non si cancella (progressi e preferiti restano).

**Extra**: highlights, clip, anticipazioni, backstage e simili non sono episodi. Si salvano come
`Extra` agganciati alla scheda (e alla stagione, quando il servizio la indica), divisi in
gruppi con il tipo (`HIGHLIGHTS`, `CLIPS`, `PREVIEWS`, `EXTRAS`) e il nome dato dal servizio
("Highlights · Stagione 6", "Ciro per sempre"). Compaiono nella sezione _Extra_ della scheda,
mai nella lista episodi. Non si abbinano a TMDB e non si uniscono tra servizi: appartengono al
titolo su cui sono stati trovati. Si riproducono come gli episodi (dal dispositivo).

### Riconoscere lo stesso contenuto

**TMDB fa da ossatura**: stagioni ed episodi (con date) vengono da TMDB, i servizi agganciano
solo le fonti.

- Film: ricerca TMDB per titolo + anno, controllo su titolo originale e durata. Punteggio:
  alto → unito da solo; medio → **coda di revisione** nel pannello admin; basso → titolo nuovo.
  Un titolo in revisione resta visibile da solo (al più un doppione, mai un buco).
- Serie: abbinata una volta; episodi per (serie TMDB, stagione, episodio).
- Numerazione diversa: per data di messa in onda (es. "Puntata del 12/03" di RaiPlay), oppure
  con una **regola di mappatura** salvata per serie e servizio (es. stagione divisa in due
  parti, numerazione assoluta).
- Episodio uscito oggi che TMDB non ha ancora: episodio _provvisorio_ dai dati del servizio,
  riconciliato quando TMDB lo aggiunge. Contenuti assenti da TMDB: la scheda nasce dai dati
  del servizio.
- Le scelte fatte a mano nel pannello admin (unire, separare, mappature) non vengono mai
  sovrascritte dagli aggiornamenti.

### Adapter per servizio

Stessa interfaccia per ogni servizio; il catalogo lo legge il backend (RaiPlay lo permette
anche dall'estero), il link del video no:

```ts
interface ProviderAdapter {
  // maia-be/src/tv/providers/provider.types.ts
  id: "raiplay" | "sdm";
  discover?(): Promise<string[]>; // tutto il catalogo (passata completa)
  getTitle(externalId): Promise<ProviderTitle | null>; // stagioni, episodi, extra, scadenze
  frontSections?: string[]; // liste in evidenza lette dal controllo
  listSection?(section): Promise<string[]>;
  resolveStream?(recipeUrl): Promise<string | null>; // riserva hls.js (RaiPlay)
}
```

Ogni richiesta parte dall'indirizzo della fonte (vedi "Indirizzo delle fonti").

Endpoint RaiPlay utili (visti anche nell'add-on Kodi KoD, GPL: si riprendono solo le idee, non
il codice): `/tipologia/<categoria>/index.json`, `/programmi/<slug>.json` con
`first_item_path` e blocchi stagione, ricerca `/atomatic/raiplay-search-service/api/v1/msearch`,
palinsesto `/palinsesto/onAir.json` e `/palinsesto/app/<canale>/<data>.json`.

## Aggiornamento del catalogo

### Fase 1: primo riempimento (catalogo vuoto, una volta per servizio)

1. Elenco completo dagli indici del servizio.
2. Dettagli di ogni titolo (stagioni, episodi, date, scadenze), poche richieste al secondo.
3. Salvataggio nel livello fonti, con ripresa da dove si era interrotto.
4. Abbinamento con TMDB in blocco; i dubbi in coda, ordinati per popolarità.
5. Il servizio diventa visibile in app solo a passata finita.

### Fase 2: aggiornamento continuo

| Cosa                                    | Quando                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Liste "ultimi arrivi"                   | ogni 3 ore                                                                            |
| Ogni serie, con **ritmo che si adatta** | ogni giorno; se ferma da 7 giorni ogni settimana; da 14 ogni mese (idea presa da KoD) |
| Serie con episodio in uscita            | il giorno indicato da TMDB, qualunque sia il ritmo                                    |
| Controllo completo (titoli tolti)       | ogni notte                                                                            |
| Scadenze "disponibile fino al"          | all'ora esatta                                                                        |
| Metadati TMDB (API _changes_)           | ogni giorno                                                                           |
| Fonte che non parte al play             | subito: segnata, si passa alla successiva                                             |

### Fase 3: nuovo servizio

Si rifà la fase 1 solo per lui: le sue fonti si agganciano ai titoli già presenti (niente
doppioni) e riempiono gli episodi mancanti.

### Reti di sicurezza

- Ogni lavoro si può ripetere: upsert per `provider + externalId`, mai doppioni.
- Coda dei lavori su Postgres (**pg-boss**, niente Redis), con ripresa dopo un'interruzione.
- Freno per servizio (limite di richieste) e _circuit breaker_: dopo molti errori il servizio
  va in pausa senza toccare gli altri (`ProviderHealth`).
- Una passata che trova molti meno titoli del solito si annulla; un titolo è "sparito" solo
  se manca due passate di fila.
- Mai cancellare: titoli ed episodi senza fonti si nascondono.
- Pannello stato per servizio (ultimo aggiornamento, titoli, errori) e prova giornaliera di un
  titolo noto, con email se fallisce.

## Fonti multiple e scelta della migliore

**Le fonti sono invisibili all'utente**: in nessuna schermata compare da quale servizio arriva
un contenuto, né che ne esistono più di uno, e l'utente non può sceglierle.

Al play (`GET /playback/:itemId`) il backend ordina le fonti disponibili e non protette:

1. stato del servizio (OK prima di DEGRADED; i servizi DOWN sono esclusi),
2. qualità massima,
3. presenza di sottotitoli / lingua scelta,
4. tasso di successo recente;

e restituisce la prima. Se non parte, il player richiede
`/playback/:itemId?exclude=<servizio>` e riprende dallo stesso punto (`WatchProgress` è legato
al contenuto, non alla fonte), senza avvisi.

## Arricchimento con TMDB

Locandine, sfondi, trame in italiano, generi e cast da TMDB (API gratuita per uso non
commerciale), oltre al riconoscimento dei titoli descritto sopra.

## Categorie

Due dimensioni indipendenti: **tipo** (`MOVIE` / `SERIES`) e **generi** (molti-a-molti).

| Voce                   | Filtro                            |
| ---------------------- | --------------------------------- |
| Film > Horror          | `kind = MOVIE` e genere `horror`  |
| Serie > Commedie       | `kind = SERIES` e genere `comedy` |
| Commedie (scorciatoia) | genere `comedy`, qualunque tipo   |

In interfaccia (organizzazione alla HBO Max, vedi [../ui.md](../ui.md)): le pagine Film e Serie
sono mini-Home con una riga per genere e i riquadri _Esplora_; la griglia completa c'è solo nella
pagina del singolo genere. Oltre ai generi, la Home ha righe editoriali (_Top 10_, _Novità_,
_In primo piano_) che il backend dovrà fornire (calcolate o scelte dal pannello admin).

Il menu è salvato nel database (`MenuEntry`: nome, posizione, voce madre, filtro), così si
aggiungono voci e raccolte scelte a mano senza toccare il codice. I generi dei servizi si
traducono nei generi di MAIA con una tabella di alias (`GenreAlias`); un genere sconosciuto va in
una lista "da associare".

**Oggi (prima di `GenreAlias`)** i generi sono quelli dei titoli, con una sola unione automatica:
le varianti che hanno lo stesso identificativo (`genreSlug`) sono **un genere solo**. RaiPlay
scrive lo stesso genere in modi diversi ("Musica" e "musica", "Storia & arte" e "storia & arte"):
`/tv/genres` li somma, li mostra con la maiuscola e i filtri per genere cercano tutte le varianti.
Prima comparivano doppi e il frontend dava errori di chiavi duplicate. È fatto in lettura: nessun
dato salvato cambia, quindi non serve `resync`.

## Modello dati

Nel database (`maia-be/prisma/schema.prisma`, migrazione `catalog`):

```
Title (kind, name, originalName, year, tmdbId unico per tipo, overview, posterUrl, backdropUrl, genres[])
  ├─ Season (number) ─ Episode (number?, name, airDate, provisional)
  └─ ExtraGroup (provider, kind, label, seasonNumber?, position) ─ Extra (name, playbackUrl, drm, durata, scadenza, available)
Source (provider + externalId unici; → Title se film o Episode; providerTitleId, playbackUrl,
        drm, geoBlocked, durata, scadenza, available, failCount, lastSeenAt)
ProviderTitle (provider + externalId unici; kind, name, year, titleId, verdict AUTO|REVIEW|NEW|MANUAL,
        matchScore, contentHash, lastSeenAt, missCount, checkIntervalDays, nextCheckAt, lastChangeAt)
MatchReview (providerTitleId, candidati TMDB con punteggio, stato PENDING|ACCEPTED|REJECTED)
ProviderHealth (provider, status OK|DEGRADED|DOWN, failStreak, retryAfter, lastSuccessAt, lastError)
SyncRun (provider, inizio/fine, trovati, messi in coda, stato, nota)
```

Previsti, non ancora fatti: generi come tabella (`Genre`, `GenreAlias`; oggi `genres[]` testuale
da TMDB o dal servizio), `MappingRule` (regole di numerazione decise a mano), `MenuEntry`,
`WatchProgress`/`Favorite`.

## Implementazione

Codice in `maia-be/src/tv/`:

| File                                    | Cosa fa                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `providers/raiplay/raiplay.adapter.ts`  | legge RaiPlay: esplorazione completa (`discover`), sezioni, titolo con stagioni, episodi, extra, immagini, DRM, scadenze                                                                         |
| `providers/sdm/sdm.adapter.ts`          | legge SDM (server di casa): catalogo completo e titolo, formato provvisorio (vedi "SDM")                                                                                                         |
| `providers/services.ts`, `base-urls.ts` | elenco dei servizi con host e indirizzo predefinito; indirizzo in uso di ogni fonte                                                                                                              |
| `providers/polite-fetch.ts`             | una richiesta alla volta per host con pausa minima (1 s per i servizi, 250 ms per l'API di TMDB), timeout, tentativi con attesa lunga; vedi "Rispetto dei servizi"                               |
| `matching/score.ts`, `subject.ts`       | punteggio e verdetto dell'abbinamento a TMDB                                                                                                                                                     |
| `matching/episodes.ts`                  | colloca un episodio nella struttura TMDB: per **data di messa in onda** (±1 giorno, stagione speciali esclusa), poi stagione + numero (anche "Stagione 2026" = edizione andata in onda nel 2026) |
| `matching/tmdb.client.ts`               | ricerca, candidati, metadati in italiano, episodi per stagione                                                                                                                                   |
| `catalog/catalog.service.ts`            | inserimento nel catalogo, fonti, extra, spegnimenti, ritmo, stato del servizio                                                                                                                   |
| `catalog/catalog.worker.ts`             | code e lavori pg-boss                                                                                                                                                                            |
| `catalog/worker.main.ts`                | worker in un processo a sé (sviluppo locale)                                                                                                                                                     |
| `probe.ts`                              | misura su un campione, senza scrivere nel database                                                                                                                                               |

**Inserimento di un titolo** (`CatalogService.ingest`):

1. Salva o aggiorna il `ProviderTitle`. Se l'hash dei dati è uguale all'ultima volta, si ferma
   lì ("invariato") e pianifica il prossimo controllo.
2. Se il titolo non è ancora collegato, lo abbina a TMDB: _auto_ → scheda TMDB (creata la prima
   volta con trama, locandina, sfondo e generi in italiano, oppure riusata se un altro servizio
   l'ha già portata); _review_ → scheda dai dati del servizio + `MatchReview`; _new_ → scheda dai
   dati del servizio. Un titolo già collegato non viene riabbinato.
3. Film: una `Source` sul titolo. Serie: ogni episodio nuovo (o provvisorio) viene collocato con
   `placeEpisode`; se TMDB non lo ha, diventa **provvisorio** con stagione e numero (o data) del
   servizio e viene ricollocato a ogni sincronizzazione finché TMDB non lo aggiunge; i provvisori
   rimasti senza fonti si cancellano. Le puntate senza numero si riconoscono per data.
4. Extra: gruppi ed extra aggiornati; quelli non più elencati diventano non disponibili.
5. Le fonti di quel servizio non più elencate per il titolo diventano non disponibili.
6. Ritmo: serie ogni giorno finché cambia qualcosa, ogni 7 giorni dopo 7 giorni senza novità,
   ogni 30 dopo 14; mai più tardi della mattina dopo il prossimo episodio indicato da TMDB. Film
   ogni 30 giorni (la sparizione la vede la passata notturna, la scadenza il controllo orario).

**Lavori** (pg-boss, schema `pgboss`):

| Coda                 | Quando                                                                                                        | Cosa                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog-discover`   | ogni giorno all'ora scelta nel pannello (`refresh`, solo in automatico), con "Aggiorna ora" o a mano (`fill`) | elenco completo del servizio, poi un controllo come `catalog-check`; _fill_ mette in coda tutti i titoli, _refresh_ solo i nuovi; i titoli non elencati contano una mancanza (alla seconda di fila le fonti si spengono); se trova meno del 70% dei titoli della passata precedente si annulla |
| `catalog-sync-title` | dai lavori sopra o a mano                                                                                     | un titolo: lettura + inserimento; una richiesta per titolo alla volta (politica `stately` con chiave), 3 tentativi con attesa crescente, 3 titoli in parallelo                                                                                                                                 |
| `catalog-check`      | ogni N ore tra una passata e l'altra, se impostato nel pannello                                               | rilegge le liste in evidenza delle sezioni (dove compaiono le novità) e mette in coda i titoli arrivati al prossimo controllo (ritmo adattivo)                                                                                                                                                 |
| `catalog-due`        | ogni ora al minuto 15, sempre                                                                                 | solo database: spegne fonti ed extra scaduti (nessuna richiesta ai servizi)                                                                                                                                                                                                                    |

**Orari di aggiornamento per fonte** (pannello `/admin`, scheda Servizi, sezione "Aggiornamento"
sotto ogni fonte di catalogo; impostazioni in `provider_health`, programmazioni scritte da
`CatalogScheduler`):

- **Manuale (predefinito)**: nessuna passata né controllo programmati; il catalogo si aggiorna solo con
  **"Aggiorna ora"** (passata completa più controllo, con conferma). Quello che è già in coda viene
  comunque smaltito; per fermarlo subito c'è l'interruttore del servizio. Una fonte nuova parte così:
  non contatta il servizio finché un amministratore non lo decide.
- **Automatico**: passata completa ogni giorno all'ora scelta (ora di Roma) e controlli ogni 1, 2,
  3, 4, 6, 8 o 12 ore nelle ore in mezzo, oppure solo la passata giornaliera. Passando ad
  automatico il pannello propone le 3:00 con controlli ogni 3 ore.
- In entrambi i casi i video scaduti si spengono ogni ora.
- Il pannello mostra l'ultima passata (quando, esito, titoli trovati), l'ultimo controllo e se una
  passata è in corso; "Aggiorna ora" non parte se il servizio è spento o se una passata è già in
  corso.
- **Passate interrotte**: c'è un solo worker per volta, quindi quando parte chiude le passate rimaste
  "in corso" dal processo precedente (riavvio, deploy). Altrimenti pg-boss le rilancerebbe da sole
  dopo ore, anche in modalità manuale.

Al termine di `catalog-discover`, di un `catalog-due` che ha spento qualcosa e di ogni `catalog-sync-title` che ha cambiato il
titolo (non quelli "invariati"), il worker **svuota tutta la cache di MAIA** in Redis. Le modifiche
ravvicinate (es. tanti titoli di fila) si raccolgono in un solo svuotamento dopo 10 secondi.
`catalog-check` mette solo in coda titoli: lo svuotamento arriva dai loro `sync-title`.
Subito dopo lo svuotamento parte il riscaldamento della cache (pagine, poi tutte le schede).

Stato del servizio: un errore di rete o 5xx incrementa il contatore; dopo 5 di fila il servizio
va in pausa 30 minuti (i suoi lavori riprovano dopo). Un 404 su un titolo conta come titolo
sparito, non come guasto del servizio.

Comandi (vedi [../dev.md](../dev.md)): `npm run catalog -- fill|refresh raiplay`,
`npm run catalog -- sync raiplay <slug...>`, `npm run catalog -- resync raiplay [--episodes]`,
`npm run catalog -- status`, `npm run catalog:worker`, `npm run catalog:probe`.

### Rileggere tutto il catalogo (`resync`)

Il ritmo dei controlli segue i cambiamenti **di RaiPlay**: un titolo fermo viene riletto anche solo
una volta al mese. Quando invece cambia **il nostro codice** e il catalogo comincia a salvare un
dato nuovo (o a leggerlo in modo diverso), i titoli già presenti lo prendono solo al loro prossimo
controllo, quindi anche dopo settimane. In quel caso si rilegge tutto subito:

```bash
npm run catalog -- resync raiplay              # tutti i titoli già nel catalogo (~6750, ~5-6 ore)
npm run catalog -- resync raiplay --episodes   # solo quelli con puntate o extra (~2700, ~2 ore e mezza)
npm run catalog -- status                      # avanzamento ("sync-title created" = ancora da fare)
```

Mette in coda un `catalog-sync-title` per ogni titolo, dai più aggiornati di recente (quelli che si
guardano prendono prima i dati nuovi). Il worker deve essere acceso; i titoli sono letti con la
solita calma verso RaiPlay (~20 al minuto). È un'operazione pesante per il servizio (migliaia di
richieste): si lancia **una volta sola** e **solo con la conferma dell'utente** (vedi "Rispetto
dei servizi"). La cache si svuota e si riscalda da sola man mano.

**Quando serve** (va fatto in locale _e_ in produzione dopo il deploy):

- l'adapter di un servizio restituisce un campo nuovo o diverso (es. immagini delle puntate,
  2026-10-31: `resync raiplay --episodes`);
- l'inserimento (`CatalogService.ingest` e seguenti) salva un dato nuovo o lo calcola in modo
  diverso (date, numerazione, abbinamenti);
- una correzione deve sistemare titoli già rovinati (es. una sincronizzazione che falliva).

**Quando non serve:** modifiche solo alle API, al frontend o alla cache (i dati salvati non
cambiano); una migrazione che aggiunge una colonna calcolabile dal database stesso (lì basta la
migrazione o uno script SQL).

Cambiare i dati restituiti dall'adapter cambia anche l'hash del titolo, quindi i titoli non
vengono scartati come "invariati": vengono davvero reinseriti.

**API per il frontend** (`maia-be/src/tv/tv.controller.ts`, solo con sessione): `GET /tv/home`,
`GET /tv/genres?kind=`, `GET /tv/titles?kind&genre&q&skip&take`, `GET /tv/titles/:id` (stagioni ed
episodi disponibili, extra, simili), `GET /tv/playback/:itemId?exclude=` (film, episodio o extra:
la fonte migliore, prima i servizi OK e con meno errori), `GET /tv/playback/:itemId/stream?provider=`
(link diretto per hls.js, vedi riproduzione), `POST /tv/playback/:itemId/failed`.
Un titolo è visibile solo se ha almeno un video disponibile e senza DRM.

**Immagini di episodi ed extra.** Ogni puntata e ogni clip ha la sua immagine su RaiPlay
(`images.landscape` dell'elemento): si salva in `episodes.image_url` / `extras.image_url` a ogni
sincronizzazione (se il servizio non ne dà una si tiene quella che c'era) e le API la restituiscono
ritagliata 640×360. Non si usano le immagini degli episodi di TMDB: quelle di RaiPlay sono del
video che si guarda davvero e ci sono anche per le puntate provvisorie.

**Date delle puntate.** La data si cerca nel nome dell'elemento e, se non c'è, nel titolo
dell'episodio (RaiPlay a volte chiama una puntata solo "Da Grande" e scrive "Puntata del
19/09/2021" nel titolo): senza data la puntata restava provvisoria in una "Edizione 2021" separata
dalla stagione TMDB in cui stava l'altra. La data vale solo se esiste davvero:
RaiPlay a volte scrive segnaposto come "00/00/1992", che prima bloccavano la sincronizzazione
dell'intero programma (Telefono giallo: 32 puntate su 41).

**Extra presentati per puntata** (`maia-be/src/tv/extras.ts`, in lettura: i dati salvati restano
quelli del servizio). Programmi come i talk e gli show hanno molte clip delle puntate in un unico
gruppo "Clip". L'API:

- ripulisce i nomi: toglie le parti che ripetono il nome del titolo o sono solo una data
  ("Lillo diventa Adriano Celentano - Da Grande - 26/09/2021" → "Lillo diventa Adriano Celentano");
- se le clip di un gruppo hanno quasi tutte una data e le date sono da 2 a 12, divide il gruppo per
  data, dalla più recente: "Clip · puntata del 26 settembre 2021" (o "Clip · 26 settembre 2021" se
  quella puntata non c'è); le clip senza data restano nel gruppo originale;
- oltre 12 date (programmi quotidiani) il gruppo resta unico, in ordine dalla più recente, per non
  avere una riga al giorno.

**Immagini RaiPlay ritagliate.** RaiPlay fornisce locandine e sfondi a piena misura (una locandina
1536×2048 pesa 0,5-1 MB; la home ne mostra quasi 200). Le API le restituiscono passando dal
servizio immagini di RaiPlay, `https://www.raiplay.it/cropgd/<L>x<A>/<percorso>`: locandine
384×512 (~45 KB), sfondi 1280×720. Nel database resta il link originale; quelle di TMDB sono già
nella misura giusta (`w500`, `w1280`).

**Cache delle risposte (Redis).** Home, generi, elenchi, schede e fonte scelta per un video sono
in cache (vedi [../architecture.md](../architecture.md), "Cache"): ogni lavoro del catalogo che
cambia qualcosa la svuota tutta.

Ancora da fare: pannello admin per la
coda di revisione e per le regole di numerazione, pannello stato, riabbinamento periodico dei
titoli _review_/_new_ (TMDB può aggiungerli in seguito).

## RaiPlay

Come è fatto (verificato il 2026-10-31):

- `/programmi/<slug>.json`: `program_info` (nome, anno, `layout` `single` = film / `multi` =
  serie o programma, tipologia, generi) e `blocks` → `sets`. Le puntate intere stanno nel
  blocco "Episodi" o "Puntate"; gli altri blocchi (Clip, Extra, Highlights, Anticipazioni,
  "Esibizioni e giudizi", spin-off come "Ballando segreto"…) e i gruppi con quei nomi dentro il
  blocco episodi diventano **Extra**. Nei film solo i blocchi con un nome da extra (il blocco
  principale contiene il film stesso).
- Il JSON di ogni gruppo (stagione) ha **tutti** gli episodi in una sola risposta (anche 174 per
  una stagione della soap) con stagione, numero, titolo, durata, relinker (`video_url`) e
  `rights_management`: non serve aprire episodio per episodio.
- **DRM noto in anticipo**: `rights.drm.VOD = true`. Si scarta subito invece di scoprirlo al
  play.
- Scadenza: `availabilities.expiration_date_iso` (sempre nei film, a volte negli episodi).
- Film: il JSON di `first_item_path` ha `video.content_url` (il relinker) e la durata.
- Numerazioni da gestire: soap con "Daily - Stagione 3…11" più "Stagione 1-2"; programmi per
  edizione con anno del titolo e stagione = anno dell'edizione in corso (2026, mentre TMDB ha
  la prima edizione, 2005, e stagioni numerate) e puntate "Puntata del 24/10/2026" (data letta
  dal nome); qualificatori nel nome ("The Beach (Serie tv)").

### Misura (2026-10-31)

Campione di 21 titoli: 5 per sezione (film, serie italiane, serie internazionali, programmi)
più la soap e Mare fuori.

|                                                    | Risultato                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Video letti                                        | 1868 su 1868 dichiarati; 23 con DRM (un film, due serie intere), 1845 riproducibili     |
| Extra                                              | 4141 in 121 gruppi (Mare fuori 74 episodi + 173 extra; La Pennicanza 10 + 1214)         |
| Abbinati a TMDB da soli                            | **19 su 21 (90%)**: tutti i film, le fiction, le serie straniere, la soap, i programmi  |
| Da rivedere                                        | 1: "Memoriae" (RaiPlay 12 episodi, TMDB meno: probabilmente puntate divise in due)      |
| Titoli nuovi                                       | 1: "La Pennicanza" (programma radio, assente da TMDB): la scheda nasce dai dati RaiPlay |
| Episodi delle serie abbinate che coincidono subito | **98%** (stagione e numero uguali a TMDB)                                               |

Accorgimenti che hanno portato dal 67% al 90%:

- nel confronto "æ" vale "ae" ("Memoriæ" su TMDB) e si tolgono i qualificatori come "(Serie tv)",
  anche dalla ricerca;
- per le serie conta come anno giusto qualsiasi anno tra la prima e l'ultima puntata TMDB, più
  l'anno dopo (edizione non ancora aggiunta a TMDB);
- le stagioni numerate per anno ("Stagione 2026") si abbinano alla stagione TMDB andata in onda
  in quell'anno; un'edizione più recente di tutte quelle su TMDB non pesa né a favore né contro;
- la ricerca TMDB si fa sia con l'anno sia senza, perché l'anno del servizio può essere quello
  dell'edizione in corso.

Le puntate dei programmi si collocano per **data di messa in onda** (`matching/episodes.ts`).
Quando TMDB non ha ancora l'edizione in corso (es. Ballando 2026), le puntate restano provvisorie
finché TMDB la aggiunge.

Elenco completo: gli indici di sezione mostrano solo una selezione (245 film, 165 serie
italiane, 229 programmi), ma rimandano a pagine di genere (`/genere/…`), raccolte, collezioni e
blocchi caricati a parte. Seguendole dalle 10 sezioni on demand si arriva a **6753 programmi**
(1250 pagine, circa 5 minuti e mezzo).

## SDM

Server multimediale dell'utente, in casa (indirizzo predefinito `http://192.168.1.9`,
modificabile dal pannello).
**Non ancora provato**: il server non è raggiungibile da MAIA. L'adapter
(`providers/sdm/sdm.adapter.ts`) è scritto su un formato **provvisorio**, da allineare a quello
vero quando il server sarà raggiungibile:

| Richiesta                         | Risposta                                          |
| --------------------------------- | ------------------------------------------------- |
| `GET <indirizzo>/api/titles`      | `{ "items": [{ "id": "…" }] }`: tutto il catalogo |
| `GET <indirizzo>/api/titles/<id>` | il titolo, `404` se non c'è più                   |

Titolo: `id`, `kind` (`movie`/`series`), `name`, `year`, `genres`, `description`, `poster`,
`backdrop`; film: `video` `{ url, durationSec, expiresAt }`; serie: `seasons`
`[{ number, name, episodes: [{ id, number, name, airDate, image, url, durationSec }] }]`;
`extras` `[{ id, name, kind: highlights|clips|previews|extras, season, videos: [{ id, name, image, url }] }]`.
I link possono essere relativi all'indirizzo: MAIA li salva assoluti.

- Stesse regole degli altri servizi (`polite-fetch`, 1 richiesta al secondo; un titolo = 1
  richiesta). Aggiornamento **manuale** di base, come ogni fonte: nessuna richiesta finché non si
  preme "Aggiorna ora". Nessuna lista in evidenza: il controllo rilegge solo i titoli arrivati al
  loro turno.
- Riproduzione: `<video src>` sul dispositivo, che va bene sia per HLS sia per file `mp4`.
- Abbinamento a TMDB come per RaiPlay.

**Da risolvere prima che funzioni davvero:**

- **Il backend gira sulla VPS**, che non vede la rete di casa: per leggere il catalogo serve un
  indirizzo raggiungibile da lì (da scegliere; l'indirizzo modificabile serve anche a questo).
- **Il dispositivo deve raggiungere i video.** Da casa `192.168.1.9` è raggiungibile, fuori casa
  no. In più MAIA è servita in `https`: Chrome non carica video e immagini `http` da una pagina
  `https` (contenuto misto) e chiede il permesso per gli indirizzi della rete locale. Servirà con
  ogni probabilità un indirizzo `https` per il server.
- Oggi c'è un solo indirizzo per fonte, usato sia dal server sia dal dispositivo; se i due
  dovranno essere diversi (es. server tramite tunnel, dispositivo in rete locale) andrà diviso.

## Ordine di sviluppo previsto

1. ~~Prototipo di misura RaiPlay~~ (fatto: 90% abbinati da soli).
2. ~~Schema Prisma del catalogo, coda pg-boss, fase 1 e fase 2 per RaiPlay~~ (fatto, vedi
   "Implementazione").
3. ~~Endpoint del catalogo e del playback, frontend collegato (HLS nativo per RaiPlay)~~ (fatto:
   `maia-be/src/tv/tv.controller.ts`, `maia-fe/lib/tv.ts`).
4. Generi unificati (oggi convivono quelli TMDB, es. "Dramma", e quelli RaiPlay, es.
   "Drammatico", "approfondimento"): tabella `GenreAlias`.
5. Pannello admin: coda di revisione, regole di numerazione, stato dei servizi.
6. Continua a guardare, preferiti, Top 10.
7. Altri servizi, uno alla volta, dopo la verifica del vincolo geografico. In corso: SDM (server
   di casa), in attesa che il server sia raggiungibile.
