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
- **Dimensioni:** la WebView del Fire Stick mostra MAIA a circa 960×540 px CSS (densità 2):
  testo e schede grandi, adatti alla distanza della TV.
- **Logo:** sorgenti in `maia-tv/art/`. `tile.svg` è l'immagine 16:9 usata sia come icona sia come
  banner: Fire TV mostra l'icona e centrava quella quadrata nel riquadro rettangolare.
  `render.cjs` la trasforma in PNG.

## Velocità sul Fire Stick

L'app si fa riconoscere con `MaiaTV/1.0` nello user agent; `components/spatial-nav.tsx` mette
allora la classe `tv` su `<html>` (vale anche per i browser delle TV). In modalità TV:

- il focus si sposta all'istante, senza scorrimento animato; tenendo premuto un tasto, una mossa
  ogni 120 ms;
- sinistra e destra restano nella riga e si fermano alla sua fine;
- da una riga Su va alla riga sopra: il menu, fisso in alto, si raggiunge solo dalla prima;
- niente sfocature, niente ingrandimento della card selezionata (solo un bordo bianco), righe fuori
  schermo non disegnate (`content-visibility`). Le card orizzontali usano `thumbUrl`, non lo sfondo
  da 1280 px.

Misure sul PC con CPU rallentata 6 volte, 960x540 a densità 2, stessi tasti: lavoro del browser
da circa 3400 a circa 1400 ms, fotogrammi sopra 50 ms da 65 a 4. Resta un blocco una tantum di
300-450 ms lasciando il banner in alto, causa non ancora chiarita: limitare la misura alle righe
vicine (`closeRows`) non lo ha tolto. Nessuna misura è stata fatta su un Fire Stick vero.

Attenzione al minificatore CSS: `transform: none` accanto a `scale: none` diventa
`transform: scale(1)` e perde `scale`; `backdrop-filter` accanto alla versione `-webkit-` veniva
perso. Dopo una modifica a queste regole controllare il CSS compilato.

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
