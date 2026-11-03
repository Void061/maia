# App per Fire TV (`maia-tv/`)

Un "guscio": app Android che apre MAIA a schermo intero in una WebView, senza browser intorno.
L'interfaccia resta la web app (`maia-fe`): ogni modifica al sito arriva subito sulla TV.

- **Indirizzo:** `http://192.168.1.6:3001` (il PC di casa), scritto nell'APK
  (`app/build.gradle.kts`, `-PmaiaUrl=…`). Sulla TV si cambia col tasto **Menu** (≡) del
  telecomando; "Predefinito" torna a quello dell'APK.
- **Telecomando:** frecce e OK vanno alla navigazione di MAIA (`components/spatial-nav.tsx`).
  **Indietro** diventa `Escape` per la pagina: chiude tastiera/menu/pannelli, esce dallo schermo
  intero, torna alla pagina prima; sulla prima pagina un secondo Indietro entro 2 s chiude l'app.
  **Play/pausa, avanti, indietro veloce** arrivano al player come `MediaPlayPause`,
  `MediaFastForward`, `MediaRewind` (`app/watch/[id]/player.tsx`).
- **PC spento o rete diversa:** schermata "MAIA non è raggiungibile" con *Riprova* e
  *Cambia indirizzo*.
- **Logo:** sorgenti in `maia-tv/art/`. `tile.svg` è l'immagine 16:9 usata sia come icona sia come
  banner: Fire TV mostra l'icona e centrava quella quadrata nel riquadro rettangolare.
  `render.cjs` la trasforma in PNG.

## Layout e navigazione su TV

L'app si fa riconoscere con `MaiaTV/1.0` nello user agent; `components/spatial-nav.tsx` (con
`lib/tv-device.ts`) mette allora la classe `tv` su `<html>` e fissa la pagina a 1280 px di larghezza:
vale anche per i browser delle TV. Next riscrive il tag `viewport`, quindi un observer lo rimette.

Regole in `app/globals.css` (`html.tv`), come su Netflix e Max:

- **Niente tagliato:** ogni riga contiene un numero intero di card (7 locandine o 4 riquadri),
  due righe riempiono lo spazio sotto il menu, la riga selezionata si aggancia sotto il menu.
- **Ricerca:** tastiera fissa a sinistra, risultati che scorrono a destra tre righe alla volta. Il
  campo è di sola lettura, così non si apre anche la tastiera del dispositivo.
- **Telecomando:** il focus si sposta all'istante; tenendo premuto, una mossa ogni 120 ms; sinistra
  e destra restano nella riga; Su va alla riga sopra e raggiunge il menu solo dalla prima.
- **Leggerezza:** niente sfocature e niente ingrandimento della card selezionata (solo un bordo
  bianco); righe fuori schermo non disegnate (`content-visibility`); `thumbUrl` per le card.

**Player su TV**, come Netflix (`app/watch/[id]/player.tsx`): sull'immagine sinistra e destra spostano
il video di 10 secondi, OK mette in pausa, Giù entra nella fila dei pulsanti; lì sinistra e destra
passano da un comando all'altro e Su torna all'immagine. Niente volume né schermo intero: il volume è
quello del telecomando sulla TV, il video resta al 100%.

Un livello (`data-focus-trap`) conta solo se visibile: Next tiene nascoste nel DOM le pagine
visitate, e un menu rimasto aperto lì bloccava tutti i tasti della pagina (pannello admin).

**Prova:** `maia-tv/test/tv-walk.cjs` percorre home, Film, Serie, genere, scheda, ricerca, player e admin con
tasti veri e dopo ogni pressione controlla card tagliate, focus perso, elementi a cavallo del menu e
schermo vuoto. Va lanciato dopo ogni modifica alla TV, guardando anche gli screenshot: il
controllo automatico da solo non ha visto tutti i difetti.

Attenzione al minificatore CSS: `transform: none` accanto a `scale: none` diventa
`transform: scale(1)` e perde `scale`. Dopo una modifica a queste regole controllare il CSS compilato.

## Costruire e installare

Strumenti in `%LOCALAPPDATA%\maia-android` (JDK 17, SDK Android 34; cache Gradle in
`~/.gradle`, circa 1,7 GB in tutto), installati senza toccare il sistema.

```
npm run tv:apk        # dalla radice: APK in maia-fe/public/maia-tv.apk
```

Sul Fire Stick:
1. *Impostazioni → La mia Fire TV → Info*: premere 7 volte sul nome del dispositivo per sbloccare
   le *Opzioni sviluppatore*; lì consentire le app di origine sconosciuta per *Downloader*.
2. Installare **Downloader** dall'Appstore, scrivere `http://192.168.1.6:3001/maia-tv.apk`,
   installare. L'icona MAIA compare tra le app.

Firmata con la chiave di debug di questo PC (`~/.android/debug.keystore`): gli aggiornamenti si
installano sopra solo se costruiti qui. Per riprodurre la TV fuori casa servirà un indirizzo
fisso (Tailscale o Cloudflare Tunnel, da decidere).

## MAIA in modalità produzione sul PC

```
npm run prod:local              # migrazioni, build di maia-be e maia-fe, poi avvio
npm run prod:local -- --no-build
```

Come in produzione: `node dist/main` (3000) e il server standalone di Next `node server.js` (3001, come nel Dockerfile), niente compilatore di
sviluppo, quindi pagine veloci e meno memoria. Vanno prima chiusi i server di sviluppo (stesse
porte). `public/` viene copiata a ogni avvio, quindi l'APK nuovo di `npm run tv:apk` si scarica
dopo un riavvio (`npm run prod:local -- --no-build`).
