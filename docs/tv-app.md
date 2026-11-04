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
- **Logo:** sorgenti in `maia-tv/art/`. `tile.svg` è l'immagine 16:9, `render.cjs` la trasforma in PNG.
  Per le app installate a mano Fire TV ignora `android:banner` e mostra `android:icon` dell'activity:
  lì va il PNG 16:9 in cartelle per densità (`drawable-xhdpi` 320×180 … `xxxhdpi` 640×360), non in
  `nodpi`; l'icona dell'applicazione resta quadrata.

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
- **Movimento (`lib/tv-motion.ts`):** solo `transform`, che la scheda grafica sposta senza ridisegnare
  la pagina. Righe e pagina scivolano invece di scorrere, e un unico riquadro di selezione sopra
  tutto (`#tv-ring`) scivola sulla card: nessuna riga può tagliarlo. Nel menu scivola la pillola grigia.
- **Leggerezza:** niente sfocature, niente ombre, niente ingrandimento della card; misure intere
  e pari in pixel (a x1,5 su 1080p cadono su pixel esatti, i decimali sporcano gli angoli);
  `thumbUrl` per le card. Niente `content-visibility`: renderizzava le righe tutte insieme al primo
  movimento, un blocco di circa 400 ms.
- **Selezione:** il riquadro `#tv-ring` è solo per card, campi e ciò che ha `data-tv-ring` (l'avatar).
  I pulsanti diventano bianchi (quello principale è bianco solo quando è in focus), le schede
  mostrano solo la riga sotto. Sulla TV `:hover` non conta: una card rimasta in hover sembrava un
  secondo focus. Entrando in una hero o in una fila di schede si va sempre sul primo pulsante o
  sulla scheda aperta, da qualunque colonna si arrivi.
- **Focus:** ogni pagina si apre con il focus sul primo elemento utile, o dove era tornando indietro.
  Logo (con una sola app attiva), pallini del carosello, "+" e "Vedi tutto" non si raggiungono.

**Pagine di impostazioni su TV** (pannello admin, Account): menu a sinistra (`data-tv-side`) e schermata a
destra (`data-tv-pane`), che scorre per conto suo. Su e Giù nel menu cambiano subito la schermata, Destra
entra nel contenuto, Sinistra o Indietro tornano alla voce aperta, Indietro dal menu esce dalla pagina.
Su telefono e computer le pagine restano come sono.

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
