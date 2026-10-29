# Accesso, account e profili

*Stato: progettato. Implementato solo come prototipo UI con dati finti (nessun backend).*

## Flusso

```
Registrazione ─▶ conferma email ─▶ approvazione dell'amministratore ─▶ account attivo

Login ─▶ Scelta profilo ─▶ ultima app usata (o l'unica disponibile)
                              └─ selettore app nel menu per passare a un'altra
```

Senza login non si entra in nessuna parte dell'app.

## Stati dell'account

| Stato | Quando | Cosa vede l'utente al login |
|---|---|---|
| `PENDING_EMAIL` | registrato, email non confermata | "Conferma la tua email", con "Rimanda l'email" |
| `PENDING_APPROVAL` | email confermata | "Account in attesa di approvazione" |
| `ACTIVE` | approvato da un amministratore | entra |
| `SUSPENDED` | sospeso o rifiutato | "Account non abilitato" |

Email previste: agli amministratori quando un account conferma l'email (da approvare); all'utente
quando viene approvato. *Provider di invio da scegliere* (es. Resend o Brevo).

La registrazione è aperta a chiunque: il filtro è l'approvazione manuale.

## Ruoli

- **Amministratore di MAIA** (`role: ADMIN`): approva e sospende gli account, decide quali app ha
  ciascun account. Gli serve un pannello admin.
- **Titolare dell'account**: gestisce i propri profili, ma non può abilitarsi app.

## Profili

- Massimo **5 profili** per account, come Netflix.
- Tutti i dati personali (avanzamento visione, preferiti, impostazioni) sono **per profilo**.
- Sul dispositivo si ricorda l'ultimo profilo usato.
- **Rimandati:** profili bambini (solo contenuti per ragazzi) e PIN sul profilo.

## Permessi sulle app

Due livelli:
1. **Account**: quali app ha (`AccountApp`). Lo decide l'amministratore.
2. **Profilo**: di default tutte le app dell'account; il titolare potrà restringere un profilo
   (`ProfileApp`). Un profilo vede solo le app abilitate su entrambi i livelli.

Dopo la scelta del profilo si apre l'**ultima app usata**; se l'account ne ha una sola si apre
quella. Il selettore delle app è nel menu (in cima alla barra laterale, o toccando il nome
dell'app sul telefono) e compare solo se ci sono più app.

## Login

- **Email e password** su telefono, tablet e desktop.
- **TV: QR code e codice di 6 caratteri.** La TV mostra il codice, lo confermi dal telefono su
  cui sei già loggato, la TV entra.
- Token come in Yuma: token di accesso brevi + token di rinnovo emessi dal backend.

## Modello dati (bozza)

```
Account (email, passwordHash, emailVerifiedAt, status, role: USER|ADMIN)
 ├─ AccountApp   (appKey)                         ← amministratore
 └─ Profile ×5   (name, avatar/hue, lastAppKey)
      └─ ProfileApp (appKey)                      ← titolare (restrizioni)
App (key: 'tv', name, enabled)
DeviceCode (code, accountId?, expiresAt)          ← login TV
```
