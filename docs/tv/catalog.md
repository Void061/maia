# MAIA TV: catalogo e riproduzione

*Stato: progettato. Nel prototipo UI i dati sono finti (`maia-fe/lib/mock.ts`).*

## Servizi

Solo servizi gratuiti e legali. Primo servizio: **RaiPlay**. Poi, uno alla volta, gli altri
(La7, Mediaset Infinity parte gratuita, YouTube…), ognuno dopo aver verificato che funziona
con i vincoli sotto.

| Tipo di contenuto | In MAIA |
|---|---|
| Flusso non protetto (HLS/DASH) | riprodotto nel player di MAIA |
| Protetto da DRM | **non riproducibile**: niente aggiramento della protezione |

### Vincolo geografico (misurato il 2026-10-31)

Backend e frontend girano sulla VPS Contabo (`207.180.247.225`), che per i servizi è un IP
**francese**. Non si usano altre VPS né apparecchi a casa, e MAIA resta una **web app**.
Prove fatte da IP italiano (casa) e da un IP di data center a Francoforte:

| | Da IP italiano | Da IP estero (data center) |
|---|---|---|
| Pluto TV: paese | IT, 1328 titoli | DE, 1662 titoli **tedeschi** |
| RaiPlay: catalogo (JSON) | leggibile | leggibile |
| RaiPlay: film (6) | 5 ok, 1 con DRM | 0 |
| RaiPlay: serie italiane (8) | 8 ok | 0 |
| RaiPlay: programmi (8) | 8 ok | 5 |

- Il blocco di RaiPlay sta **solo nel relinker** (`mediapolis(vod).rai.it/relinker/...`), che
  dall'estero restituisce `video_no_available.mp4`. Il link ottenuto da un IP italiano si apre
  da ovunque e i file video hanno CORS `*`.
- Il relinker non ha CORS, quindi il browser non può leggerne la risposta con `fetch`, ma lo
  può dare direttamente a `<video src>`: Chrome 146, Edge, Safari/iOS e Android riproducono
  l'HLS in modo nativo, e un elemento video non ha bisogno di CORS. Provato con "Mare fuori"
  da una pagina di un altro dominio: parte.
- **Pluto TV rimandato**: assegna il paese dall'IP (sessione `boot.pluto.tv`) e le sue API
  accettano solo l'origine `pluto.tv`. Senza un IP italiano non si può avere il catalogo
  italiano.

## Riproduzione: sempre sul dispositivo

**Il video non passa mai dal server.** Il backend sceglie la fonte e consegna al frontend
cosa riprodurre; è il browser dell'utente (in Italia) a chiedere il flusso al servizio e a
riprodurlo.

- RaiPlay: `<video src="<relinker>">` con HLS nativo del browser. Il relinker viene richiesto
  dal dispositivo, con il suo IP italiano.
- Altri servizi: hls.js quando il flusso ha CORS aperto, altrimenti HLS nativo come sopra.
- Il link del flusso **non si salva**: si ottiene al momento del play.
- Limiti: **Firefox** non ha HLS nativo (i contenuti Rai non partono lì); il player nativo dà
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
("Highlights · Stagione 6", "Ciro per sempre"). Compaiono nella sezione *Extra* della scheda,
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
- Episodio uscito oggi che TMDB non ha ancora: episodio *provvisorio* dai dati del servizio,
  riconciliato quando TMDB lo aggiunge. Contenuti assenti da TMDB: la scheda nasce dai dati
  del servizio.
- Le scelte fatte a mano nel pannello admin (unire, separare, mappature) non vengono mai
  sovrascritte dagli aggiornamenti.

### Adapter per servizio

Stessa interfaccia per ogni servizio; il catalogo lo legge il backend (RaiPlay lo permette
anche dall'estero), il link del video no:

```ts
interface ProviderAdapter {
  id: 'raiplay' | 'la7' | ...;
  listCatalog(): AsyncIterable<ProviderTitleDto>;      // indici per categoria
  getTitle(externalId: string): Promise<ProviderTitleDto>; // stagioni, episodi, scadenze
  listNew(): Promise<ProviderTitleDto[]>;               // "ultimi arrivi"
  playback(externalId: string): PlaybackRecipe;         // cosa dare al player (es. relinker)
}
```

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

| Cosa | Quando |
|---|---|
| Liste "ultimi arrivi" | ogni 3 ore |
| Ogni serie, con **ritmo che si adatta** | ogni giorno; se ferma da 7 giorni ogni settimana; da 14 ogni mese (idea presa da KoD) |
| Serie con episodio in uscita | il giorno indicato da TMDB, qualunque sia il ritmo |
| Controllo completo (titoli tolti) | ogni notte |
| Scadenze "disponibile fino al" | all'ora esatta |
| Metadati TMDB (API *changes*) | ogni giorno |
| Fonte che non parte al play | subito: segnata, si passa alla successiva |

### Fase 3: nuovo servizio

Si rifà la fase 1 solo per lui: le sue fonti si agganciano ai titoli già presenti (niente
doppioni) e riempiono gli episodi mancanti.

### Reti di sicurezza

- Ogni lavoro si può ripetere: upsert per `provider + externalId`, mai doppioni.
- Coda dei lavori su Postgres (**pg-boss**, niente Redis), con ripresa dopo un'interruzione.
- Freno per servizio (limite di richieste) e *circuit breaker*: dopo molti errori il servizio
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

| Voce | Filtro |
|---|---|
| Film > Horror | `kind = MOVIE` e genere `horror` |
| Serie > Commedie | `kind = SERIES` e genere `comedy` |
| Commedie (scorciatoia) | genere `comedy`, qualunque tipo |

In interfaccia (organizzazione alla HBO Max, vedi [../ui.md](../ui.md)): le pagine Film e Serie
sono mini-Home con una riga per genere e i riquadri *Esplora*; la griglia completa c'è solo nella
pagina del singolo genere. Oltre ai generi, la Home ha righe editoriali (*Top 10*, *Novità*,
*In primo piano*) che il backend dovrà fornire (calcolate o scelte dal pannello admin).

Il menu è salvato nel database (`MenuEntry`: nome, posizione, voce madre, filtro), così si
aggiungono voci e raccolte scelte a mano senza toccare il codice. I generi dei servizi si
traducono nei generi di MAIA con una tabella di alias (`GenreAlias`); un genere sconosciuto va in
una lista "da associare".

## Modello dati (bozza)

```
Title (kind, name, year, tmdbId, overview, posterUrl) ─┬─ TitleGenre ─ Genre ─ GenreAlias
                                                         └─ Season ─ Episode (number, airDate, provisional)
Source (→ Title film o Episode; provider, externalId, drm, available, maxHeight,
        audioLangs, subLangs, failCount)
ProviderTitle (provider, externalId, name, year, lastSeenAt, titleId?) ─ ProviderEpisode
        (season/episode del servizio, airDate, duration, availableUntil, drm, lastSeenAt)
ExtraGroup (titleId, seasonNumber?, kind, label, provider, position) ─ Extra (externalId, title,
        duration, drm, availableUntil, playbackUrl)
MatchReview (providerTitleId, candidato TMDB, punteggio, stato)
MappingRule (titleId, provider, regola, manual)
SyncState (titolo/servizio: interval 1|7|30, nextCheckAt, lastChangeAt)
Channel (provider, externalId, name, number, category, logoUrl) ─ Program (title, description, startsAt, endsAt)
MenuEntry (label, parentId, position, kind?, genreId?)
ProviderHealth (provider, status, failStreak, retryAfter)
WatchProgress / Favorite → per Profile
```

## Prototipo RaiPlay (in corso)

Codice in `maia-be/src/tv/`: `providers/raiplay/raiplay.adapter.ts` (lettura e
normalizzazione), `providers/polite-fetch.ts` (una richiesta alla volta per host, pausa minima,
tentativi), `matching/score.ts` (punteggio e verdetto, con test), `matching/tmdb.client.ts`,
`probe.ts` (`npm run catalog:probe`, vedi [../dev.md](../dev.md)).

Come è fatto RaiPlay (verificato il 2026-10-31):

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

| | Risultato |
|---|---|
| Video letti | 1868 su 1868 dichiarati; 23 con DRM (un film, due serie intere), 1845 riproducibili |
| Extra | 4141 in 121 gruppi (Mare fuori 74 episodi + 173 extra; La Pennicanza 10 + 1214) |
| Abbinati a TMDB da soli | **19 su 21 (90%)**: tutti i film, le fiction, le serie straniere, la soap, i programmi |
| Da rivedere | 1: "Memoriae" (RaiPlay 12 episodi, TMDB meno: probabilmente puntate divise in due) |
| Titoli nuovi | 1: "La Pennicanza" (programma radio, assente da TMDB): la scheda nasce dai dati RaiPlay |
| Episodi delle serie abbinate che coincidono subito | **98%** (stagione e numero uguali a TMDB) |

Accorgimenti che hanno portato dal 67% al 90%:
- nel confronto "æ" vale "ae" ("Memoriæ" su TMDB) e si tolgono i qualificatori come "(Serie tv)",
  anche dalla ricerca;
- per le serie conta come anno giusto qualsiasi anno tra la prima e l'ultima puntata TMDB, più
  l'anno dopo (edizione non ancora aggiunta a TMDB);
- le stagioni numerate per anno ("Stagione 2026") si abbinano alla stagione TMDB andata in onda
  in quell'anno; un'edizione più recente di tutte quelle su TMDB non pesa né a favore né contro;
- la ricerca TMDB si fa sia con l'anno sia senza, perché l'anno del servizio può essere quello
  dell'edizione in corso.

Ancora da fare: le puntate dei programmi senza numero o con numerazione per edizione (Ballando,
Splendida Cornice: 0% diretti) vanno abbinate per **data di messa in onda**, leggendo le date
degli episodi delle stagioni TMDB (una chiamata per stagione).

## Ordine di sviluppo previsto

1. Prototipo di misura: adapter **RaiPlay** su circa 20 titoli per misurare quanti si abbinano
   da soli a TMDB (fatto: 90%, vedi sopra). Manca l'abbinamento per data delle puntate.
2. Schema Prisma del catalogo, coda pg-boss, fase 1 completa per RaiPlay.
3. Endpoint di playback e player collegato al backend (HLS nativo per RaiPlay).
4. Fase 2 (aggiornamento continuo) e pannello stato.
5. Altri servizi, uno alla volta, dopo la verifica del vincolo geografico.
