# Documentazione di MAIA

*My Assistant In the Apartment*: hub per la casa che gira su TV, desktop, tablet e telefono.
La prima app dentro MAIA è **MAIA TV** (streaming dei servizi gratuiti con player integrato).

Questa cartella descrive cosa è stato implementato e **perché**. Va aggiornata nello stesso
commit di ogni modifica che cambia comportamento, struttura o decisioni (vedi `CLAUDE.md`).

| Documento | Contenuto |
|---|---|
| [decisions.md](decisions.md) | Registro delle decisioni, in ordine cronologico, con il motivo |
| [architecture.md](architecture.md) | Monorepo, stack, app di MAIA come moduli, tipi FE generati dal BE |
| [access.md](access.md) | Account, stati, amministratori, profili, permessi sulle app, login |
| [ui.md](ui.md) | Design system, navigazione per dispositivo, schermate, telecomando |
| [dev.md](dev.md) | Ambiente locale, Docker, porte, comandi, problemi noti |
| [deploy.md](deploy.md) | Deploy su Coolify (VPS) |
| [tv-app.md](tv-app.md) | App per Fire TV (guscio WebView), logo, `npm run tv:apk` e `npm run prod:local` |

## Stato attuale

- **Fatto:** scheletro del monorepo, Dockerfile, docker-compose locale; prototipo UI di MAIA TV con
  dati finti; **account e profili veri** (registrazione, conferma email, approvazione da terminale,
  login con sessioni, password dimenticata, guida iniziale, profili, impostazioni account,
  pannello admin per approvare e gestire gli account).
- **Non ancora fatto:** far partire i film dal server di streaming (il Play risponde "non disponibile").
