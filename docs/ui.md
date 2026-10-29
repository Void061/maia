# Interfaccia

*Stato: prototipo cliccabile con dati finti sul branch `feature/ui-prototype`.*

## Principi

1. **Progettata per la TV, adattata agli altri dispositivi.** Se funziona col telecomando da tre
   metri funziona anche con mouse e dito. Elementi grandi, niente comandi visibili solo al
   passaggio del mouse.
2. **Tutto raggiungibile con le frecce** (navigazione spaziale), Invio per attivare,
   Esc/Backspace per tornare indietro.
3. **Tema scuro**, con un solo colore d'accento.
4. **Il layout cambia con la larghezza dello schermo**; da `md` (768px) in su c'è la barra
   laterale, sotto la barra in basso.

## Design system

Atmosfera: "il salotto la sera". Token in `maia-fe/app/globals.css` (`@theme`).

| Token | Valore | Uso |
|---|---|---|
| `ink` | `#120f1c` | sfondo |
| `dusk` | `#1c1830` | superfici |
| `haze` | `#2a2542` | superfici in rilievo, voce di menu attiva |
| `line` | `#3a3456` | bordi |
| `paper` | `#f4f0fa` | testo |
| `moon` | `#b7afd3` | testo secondario |
| `lamp` | `#f5b856` | accento: selezione, pulsante principale |

- **Font:** *Bricolage Grotesque* per i titoli (`font-display`), *Figtree* per il testo
  (`font-sans`), caricati con `next/font/google`.
- **"Luce di lampada"**: classe `.lamp` su ogni elemento selezionabile. Con il focus (o il mouse
  sopra) prende un bordo ambra e un alone caldo; `.lamp-lift` lo ingrandisce leggermente
  (locandine, profili). È l'unico elemento visivo forte: il resto resta sobrio.
  Rispetta `prefers-reduced-motion`.
- **Logo:** "maia" con il punto della *i* come una lampadina accesa (`components/logo.tsx`).

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
| `/profili` | "Chi guarda?", massimo 5 profili |
| `/tv` | Home MAIA TV: titolo in evidenza (lo sfondo segue la locandina selezionata), *Continua a guardare*, *In onda ora*, righe per genere |
| `/tv/live` | TV/desktop: griglia del palinsesto con linea dell'ora; telefono: lista dei canali |
| `/tv/film`, `/tv/serie` | griglia con filtri per genere |
| `/tv/titolo/[id]` | scheda: trama, fonti disponibili, stagioni ed episodi |
| `/tv/cerca` | ricerca con tastiera a griglia su schermi grandi |
| `/guarda/[id]`, `/guarda/live-[canale]` | player a schermo intero |

**Menu:** barra laterale stretta con icone, che si allarga con i nomi quando ci entra il focus o
il mouse. In cima il selettore delle app, in fondo l'avatar (cambia profilo, impostazioni, esci).
Sul telefono: nome dell'app e avatar in alto, barra con 5 voci in basso.

**Player:** comandi che spariscono dopo 3 secondi di riproduzione (restano visibili in pausa),
pannello "Riproduzione" con qualità, sottotitoli, lingua audio e velocità letti dal flusso.

## Note sul prototipo

- Dati finti in `maia-fe/lib/mock.ts`; profilo e ultima app in `localStorage` (`lib/session.ts`).
- Locandine e sfondi sono foto casuali di riempimento da picsum.photos.
- Il video è un flusso HLS di prova pubblico (Mux), con più qualità.
- Aprendo il player incollando l'indirizzo, il browser blocca l'avvio automatico con audio:
  compare il tasto Play al centro.
