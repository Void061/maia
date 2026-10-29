# MAIA TV: catalogo e riproduzione

*Stato: progettato. Nel prototipo UI i dati sono finti (`maia-fe/lib/mock.ts`).*

## Servizi

Solo servizi gratuiti e legali: RaiPlay, Pluto TV, La7, Mediaset Infinity (parte gratuita),
Rakuten TV (sezione gratis), YouTube, eventuali altri.

| Tipo di contenuto | In MAIA |
|---|---|
| Flusso non protetto (HLS/DASH) | riprodotto nel player di MAIA |
| Protetto da DRM | **non riproducibile**: niente aggiramento della protezione |

Limiti noti: i link dei flussi scadono (vanno chiesti al momento), molti contenuti Rai funzionano
solo da IP italiano, i sistemi interni dei servizi possono cambiare senza preavviso.

## Catalogo unico nel database

Il backend tiene una copia del catalogo di tutti i servizi, in un formato unico. Il frontend legge
solo dal backend. Vantaggi: velocità, ricerca su tutto, un servizio guasto non blocca gli altri.

### Adapter per servizio

Ogni servizio ha un adapter con la stessa interfaccia:

```ts
interface ProviderAdapter {
  id: 'pluto' | 'raiplay' | 'la7' | ...;
  syncChannels(): Promise<ChannelDto[]>;
  syncEpg(from: Date, to: Date): Promise<EpgDto[]>;
  syncCatalog(): Promise<TitleDto[]>;
  resolvePlayback(externalId: string): Promise<PlaybackDto>;
}
```

### Aggiornamenti

Con `@nestjs/schedule`: palinsesto ogni ora, catalogo on demand una volta al giorno. Upsert per
`provider + externalId`; i titoli spariti si marcano come non disponibili, senza cancellarli.

### Arricchimento con TMDB

Locandine, sfondi, trame in italiano, generi e cast da TMDB (API gratuita per uso non commerciale).
Serve anche a riconoscere lo stesso titolo su servizi diversi: film per ID TMDB (o titolo + anno),
episodi per ID TMDB della serie + stagione + episodio. I casi dubbi finiscono in una coda di
controllo manuale invece di essere uniti per sbaglio.

## Categorie

Due dimensioni indipendenti: **tipo** (`MOVIE` / `SERIES`) e **generi** (molti-a-molti).

| Voce | Filtro |
|---|---|
| Film > Horror | `kind = MOVIE` e genere `horror` |
| Serie > Commedie | `kind = SERIES` e genere `comedy` |
| Commedie (scorciatoia) | genere `comedy`, qualunque tipo |

Il menu è salvato nel database (`MenuEntry`: nome, posizione, voce madre, filtro), così si
aggiungono voci e raccolte scelte a mano senza toccare il codice. I generi dei servizi si
traducono nei generi di MAIA con una tabella di alias (`GenreAlias`); un genere sconosciuto va in
una lista "da associare".

## Fonti multiple e scelta della migliore

Una `Source` è collegata al **film** o al **singolo episodio** (non alla serie). Un contenuto può
averne più di una (es. RaiPlay e Pluto TV).

Al play (`GET /playback/:itemId`) il backend ordina le fonti disponibili e non protette:
1. stato del servizio (OK prima di DEGRADED; i servizi DOWN sono esclusi),
2. qualità massima,
3. presenza di sottotitoli / lingua scelta,
4. preferenza dell'utente,
5. tasso di successo recente;

e prova in ordine finché una risponde. Lo stato dei servizi (`ProviderHealth`) segue il pattern
*circuit breaker*: dopo più errori di fila il servizio è escluso per un po' e poi riprovato.

**Passaggio a metà visione:** se la riproduzione si interrompe, il player richiede
`/playback/:itemId?exclude=<servizio>` e riprende dallo stesso punto (`WatchProgress` è legato al
contenuto, non alla fonte). Nel prototipo è simulato dal tasto "simula guasto della fonte".

## Riproduzione

- Il link del flusso **non si salva**: si chiede all'adapter al momento del play.
- **Proxy nel backend** per indici e segmenti video: aggira i blocchi CORS, aggiunge intestazioni
  richieste dai servizi (es. `Referer`) e, se il backend gira in Italia, risolve le restrizioni
  geografiche.
- Player nel frontend con **hls.js** (Safari/iOS usano l'HLS nativo). Qualità, sottotitoli e
  tracce audio sono quelle presenti nel flusso: il player non può aggiungerle.

## Modello dati (bozza)

```
Title (kind, name, year, tmdbId, overview, posterUrl) ─┬─ TitleGenre ─ Genre ─ GenreAlias
                                                         ├─ Season ─ Episode
                                                         └─ Source (provider, externalId, drm,
                                                                    available, maxHeight,
                                                                    audioLangs, subLangs, failCount)
Channel (provider, externalId, name, number) ─ Program (title, startsAt, endsAt)
MenuEntry (label, parentId, position, kind?, genreId?)
ProviderHealth (provider, status, failStreak, retryAfter)
WatchProgress / Favorite → per Profile
```

## Ordine di sviluppo previsto

1. Schema Prisma + adapter **Pluto TV** (canali live e palinsesto).
2. Endpoint di playback + proxy + player collegato al backend.
3. Catalogo on demand di Pluto TV + TMDB.
4. Adapter **RaiPlay**, contenuto per contenuto, marcando quelli con DRM.
