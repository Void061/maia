# Interfaccia

*Stato: prototipo cliccabile con dati finti sul branch `feature/ui-prototype`.*

## Principi

1. **Progettata per la TV, adattata agli altri dispositivi.** Se funziona col telecomando da tre
   metri funziona anche con mouse e dito. Elementi grandi, niente comandi visibili solo al
   passaggio del mouse.
2. **Tutto raggiungibile con le frecce** (navigazione spaziale), Invio per attivare,
   Esc/Backspace per tornare indietro.
3. **Tema scuro**, con il bianco come unico colore interattivo.
4. **Il layout cambia con la larghezza dello schermo**: da `md` (768px) in su le voci del menu
   stanno nella barra in alto, sotto c'è anche la barra in basso del telefono.

## Design system

Direzione: **Apple TV / HBO Max** (decisa il 2026-10-29, sostituisce il primo stile "salotto la
sera" con accento ambra). Token in `maia-fe/app/globals.css` (`@theme`).

| Token | Valore | Uso |
|---|---|---|
| `canvas` | `#000000` | sfondo (nero vero) |
| `surface` | `#1c1c1e` | superfici (grigio di sistema Apple) |
| `raised` | `#2c2c2e` | superfici in rilievo |
| `hairline` | `#38383a` | bordi |
| `label` | `#f5f5f7` | testo |
| `muted` | `#a1a1a6` | testo secondario |
| `faint` | `#6e6e73` | testo terziario, didascalie |
| `accent` | `#ffffff` | colore interattivo: il pulsante principale è bianco con testo nero |
| `brand`, `brand-2` | `#3d6bff`, `#8c5bff` | gradiente di marca, solo nel logo e nell'icona delle app |

- **Font:** *Inter* (`next/font/google`), l'alternativa libera più vicina a SF Pro; titoli con
  spaziatura stretta (`-0.025em`), pesi 700-800.
- **Materiale vetro** (`.glass`): sfondo grigio traslucido con sfocatura, per menu in alto, barra
  in basso del telefono, pannelli e comandi del player.
- **Velo notte** (`.night`): gradiente blu/viola in cima alle pagine senza immagine, alla Max.
- **Selezione stile tvOS:** l'elemento selezionato si solleva (`.lift`, scala 1.06) con un bordo
  bianco sottile e un'ombra profonda; i pulsanti e le voci a pillola (`.pill-focus`) diventano
  bianchi con testo nero. Niente aloni colorati. Rispetta `prefers-reduced-motion`.
- **Card** (`components/poster.tsx`):
  - `Poster` 2:3, stile Max: il titolo sta **dentro** l'immagine, in basso, su una sfumatura nera
    forte (metà altezza) così resta leggibile su qualunque foto;
  - `Tile` 16:9 per *Continua a guardare*, *Novità*, canali live ed episodi, con didascalia sotto;
  - `Top10Card`: numero enorme a contorno **accanto** alla locandina (non sovrapposto);
  - `GenreCard`: riquadro 16:9 con il nome del genere, porta d'ingresso alla categoria.
- **Leggibilità:** il testo sopra un'immagine sta sempre su una sfumatura nera (hero, card,
  riga in primo piano); il menu in alto diventa quasi opaco (`bg-black/85` + sfocatura) quando
  la pagina scorre sotto. Testo per lettori di schermo (`sr-only`) solo dentro contenitori
  `relative`, altrimenti allarga la pagina.
- **Logo:** "maia" in grassetto stretto con il gradiente di marca, seguito da "TV" nella sezione.

## Navigazione col telecomando

`components/spatial-nav.tsx`, montato nel layout principale:
- le frecce spostano il focus all'elemento più vicino in quella direzione (pesando di più chi sta
  sulla stessa riga/colonna);
- un livello modale con `data-focus-trap` (selettore app, menu profilo, impostazioni del player)
  tiene la navigazione al suo interno e si chiude con Esc/Backspace;
- un contenitore con `data-own-keys` gestisce da sé le frecce (il player: avanti/indietro di 10
  secondi, su/giù per cambiare canale nei live).

## Schermate

| Percorso | Schermata |
|---|---|
| `/login` | email e password, oppure "Accedi con il telefono" (QR + codice) |
| `/registrati` | creazione account |
| `/stato/email`, `/stato/approvazione`, `/stato/sospeso` | account non ancora attivo |
| `/profili` | "Chi sta guardando?", massimo 5 profili |
| `/tv` | Home, organizzata come HBO Max: hero a carosello (8 s, si ferma col telecomando sopra), *Continua a guardare*, *Top 10 di oggi*, *In onda ora*, *Esplora* (riquadri dei generi), *Novità*, riga *In primo piano*, poi una riga per genere |
| `/tv/live` | TV/desktop: griglia del palinsesto con linea dell'ora; telefono: lista dei canali |
| `/tv/film`, `/tv/serie` | mini-Home del tipo: hero, Top dei film/serie, *Esplora per genere*, una riga per genere |
| `/tv/film/[genere]`, `/tv/serie/[genere]` | pagina del genere: hero corto e griglia completa |
| `/tv/genere/[genere]` | scorciatoia su film **e** serie insieme (es. "Commedie") |
| `/tv/titolo/[id]` | scheda: hero con Guarda/Riprendi, poi le schede *Episodi* (con le stagioni), *Altri come questo*, *Dettagli*; nessuna indicazione delle fonti |
| `/tv/cerca` | ricerca con tastiera a griglia su schermi grandi |
| `/guarda/[id]`, `/guarda/live-[canale]` | player a schermo intero |

**Menu (TV, desktop, tablet):** barra in alto, trasparente sopra l'immagine e in vetro quando si
scorre. A sinistra "maia TV" (apre il selettore delle app), al centro le voci a pillola (Home,
Live, Film, Serie), a destra Cerca e l'avatar (cambia profilo, impostazioni, esci).
**Telefono:** stessa barra in alto, più una barra in basso con 5 voci, come iOS. La barra in basso
è **quasi opaca** (`bg-black/90` + sfocatura) e le voci non attive sono grigio chiaro (`muted`):
con il vetro trasparente e il grigio scuro non si leggeva sopra le immagini chiare.

**Player:** comandi in una barra di vetro in basso; spariscono dopo 3 secondi di riproduzione
(restano visibili in pausa).
- **Barra di avanzamento** (`Scrubber`) con **perno** bianco, tempo trascorso a sinistra e tempo
  **rimanente in positivo** a destra. Mentre la trascini (mouse o dito, area di tocco alta 32px)
  perno e tempi seguono subito il puntatore e sopra il perno compare il tempo di arrivo; il video
  salta solo al rilascio, così un salto lento non fa restare indietro la barra. Anche i salti di
  ±10 secondi (frecce, doppio tocco) aggiornano la barra subito.
- **Schermo intero:** tasto in fondo a destra della barra e tasto **F**. Va a schermo intero
  l'intero player (non solo il video), così i comandi restano; sul telefono prova a ruotare in
  orizzontale. Su iPhone, dove Safari non lo permette, usa lo schermo intero nativo del video. Pannello
"Riproduzione" con qualità, sottotitoli, lingua audio e velocità letti dal flusso. Il player non
mostra mai da quale servizio arriva il video.

## Note sul prototipo

- Dati finti in `maia-fe/lib/mock.ts`; profilo e ultima app in `localStorage` (`lib/session.ts`).
- Locandine e sfondi sono foto casuali di riempimento da picsum.photos.
- Il video è un flusso HLS di prova pubblico (Mux), con più qualità.
- Aprendo il player incollando l'indirizzo, il browser blocca l'avvio automatico con audio:
  compare il tasto Play al centro.
