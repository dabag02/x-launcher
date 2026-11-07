# CHANGELOG-15 — da v3.2.1-Mars

Prosegue da CHANGELOG-14.md (chiuso su MILESTONE STABILE v3.2.1-Mars).

Ciclo chiuso con la MILESTONE STABILE v3.2.5-Mars (voce qui sotto); la serie continua in CHANGELOG-16.md. Voci: la milestone in cima, poi dev.1, dev.2, dev.3.

Punti aperti ereditati dalla milestone: vedi «Resta aperto» nella voce della milestone in CHANGELOG-14.md.

## MILESTONE STABILE v3.2.5-Mars — cifratura a riposo, interruttori dell'overlay, `install.sh --devel` (cicli dev.1–dev.3)

Congelato. Il ciclo è di tre consegne (voci qui sotto). **Confermate dall'utente sull'HTPC**: il backup su Drive cifrato con passphrase è stato eseguito regolarmente; gli interruttori dell'overlay (stato, conferma rossa allo spegnimento, ritorno al blu) funzionano come richiesto. Il numero di patch (5) è una scelta dell'utente.

### Cosa contiene

- **Cifratura a riposo** (dev.2, audit punto 5): chiavi API dei provider AI, client secret del Cloud Backup e token di Drive cifrati con AES-256-GCM, chiave casuale in `~/.local/share/x-launcher/secret.key` (0600); i valori in chiaro di versioni precedenti si cifrano da soli al primo avvio.
- **Backup su Drive cifrato**: passphrase (minimo 8 caratteri, due campi in Gestisci account → Cloud Backup) che cifra il bundle con scrypt + AES-256-GCM; resta cifrata sul disco locale e non va mai su Drive. I vecchi backup non cifrati si ripristinano ancora; senza passphrase il backup parte non cifrato con un avviso.
- **Overlay degli spazi** (dev.3): Bluetooth, Wi-Fi e LAN sono interruttori attivi di default, con lo stato in vista; **spegnere chiede conferma** (primo A: pulsante rosso «Conferma con A»; secondo A: esegue e torna blu; B, un movimento o 4 s la annullano), accendere è immediato. Stile come il quick-menu (selezionato = pieno blu del logo). Volume −, muto, + a selezione normale. Nuova chiave `danger` nei temi.
- **Installer** (dev.1): `install.sh --devel` per le versioni di sviluppo (installa in `/opt`, ma gli script puntano al pacchetto locale; per tornare alla stabile `--relink-openbox`).
- Con questa milestone **tutti i punti di `SECURITY-AUDIT.md` sono chiusi**.

### Limiti noti

- Se si perde la passphrase il backup cifrato non è recuperabile; se si perde `secret.key` chiavi API e login Drive vanno reinseriti.
- Il `.env` locale resta in chiaro; un malware che gira con lo stesso utente può leggere anche `secret.key`.
- Spegnere la LAN dall'overlay scollega davvero l'interfaccia Ethernet (un gioco online perde la connessione).

### Resta aperto

- Messaggi del backend solo in italiano, temi aggiuntivi non esposti, scelta della rete Wi-Fi dall'overlay, «chiudi il gioco» dall'overlay, indicatore del congelamento nella Dashboard, regola sul quarto lancio, Fase 5, `GET /api/process-manager/list` che risponde `[]` con un gioco vivo.
- Il tempo di gioco conta anche i periodi in cui il gioco è congelato in un altro spazio (deciso di non cambiarlo).

## v3.2.2-dev.1 — installer: opzione `--devel` per le versioni di sviluppo

Regola di sviluppo (richiesta dell'utente, da tenere presente in ogni ciclo): accanto a `--relink-openbox` l'installer ha `--devel`, per provare le versioni di sviluppo senza perdere l'installazione di sistema.

### Cosa cambia

- **`install.sh --devel`**: installa in `/opt/x-launcher` come sempre, ma fa puntare al **pacchetto locale** (la cartella da cui si lancia l'installer): i symlink `~/.config/openbox/{rc.xml,autostart,spaces-ctl}` (ripuntati sempre, senza domande), `/usr/local/bin/x-launcher` e `x-launcher-spaces`, l'`Exec=` della sessione Kiosk e del gestore `xlaunch://`. Il controllo del venv e dell'overlay guarda il pacchetto locale. `autostart` passa da solo `--local-server` perché la cartella non è `/opt`.
- Rifiutato (messaggio e uscita 2): `--devel` insieme a `--relink-openbox` (sono opposti), `--devel` lanciato da `/opt/x-launcher`, percorso del pacchetto con spazi o caratteri speciali (finisce nei `.desktop`).
- `--uninstall` rimuove anche i symlink creati con `--devel` (solo quelli che puntano a una cartella con `kiosk-launch.sh`).
- Per tornare alla stabile: `sudo ./install.sh --relink-openbox` dalla cartella della milestone. `INSTALL.md` e l'aiuto (`--help`) aggiornati.
- Versione `3.2.2-dev.1` in `package.json` e nel fallback di `src/App.tsx`.

### Verifica fatta e non fatta

- **Fatto** (copia dell'installer con i percorsi di sistema ridirezionati in una cartella di prova e un utente di prova, eseguita come root): `--devel` crea tutti i link e i due `Exec=` verso il pacchetto; `--relink-openbox` li riporta a `/opt`; `--devel --relink-openbox` rifiutato; `--uninstall` dopo `--devel` toglie i link; `bash -n`.
- **Non fatto**: l'installer vero con `sudo` su `/opt`, `/usr/local/bin` e `/usr/share` del tuo HTPC, e una sessione Openbox avviata dai link di sviluppo (è il flusso già usato a mano con le copie di sviluppo).

## v3.2.2-dev.2 — cifratura a riposo dei segreti e del backup su Drive (audit punto 5)

Chiude i due punti rimandati dalla milestone 3.1.6-Mars. Scelte dell'utente: passphrase del backup impostata una volta in Gestisci account e conservata sul disco locale (così i backup partono senza chiederla); chiavi API e segreti con una chiave casuale in un file separato.

### Cosa cambia

- **`src/backend/secretBox.ts`** (nuovo): AES-256-GCM con chiave casuale di 32 byte in `~/.local/share/x-launcher/secret.key` (0600, creata al primo uso con creazione esclusiva). Valore cifrato = `enc:v1:` + base64(iv|tag|testo). Un valore senza prefisso è un vecchio segreto in chiaro e si legge ancora (migrazione trasparente). Chiave mancante: i segreti cifrati risultano illeggibili (`undefined`, un solo avviso nel log) e la chiave NON viene rigenerata da una lettura; chiave non valida: mai sovrascritta.
- **`db.ts`**: `api_key` dei provider AI, `client_secret` del Cloud Backup e i valori di `tokens.json` (refresh token di Drive) si scrivono cifrati e si leggono decifrati; il resto del codice non cambia. `migrateSecretsAtRest()` riscrive cifrati i valori in chiaro all'avvio del demone (idempotente, non bloccante).
- **`src/backend/cloudBackup/backupCrypto.ts`** (nuovo): bundle cifrato con la passphrase (scrypt N=2^15, r=8, p=1 + AES-256-GCM, intestazione `XLBK` autenticata); passphrase salvata in `backup-passphrase.enc` (0600, cifrata con secretBox). Minimo 8 caratteri.
- **`bundle.ts`, `server.ts`**: `buildBackupPayload()` cifra il bundle se c'è una passphrase; il messaggio del backup dice «(cifrato con la tua passphrase)» oppure avverte che non lo è. `restoreFromBundle` riconosce il file cifrato: senza passphrase salvata o con passphrase sbagliata dà un errore chiaro e non tocca nulla; i vecchi bundle non cifrati si ripristinano ancora. Nuove rotte `POST` e `DELETE /api/cloud-backup/passphrase`; `GET /api/cloud-backup/providers` aggiunge `passphraseSet` (la passphrase non esce mai dal server).
- **Dashboard** (Gestisci account → Cloud Backup): campi **Passphrase** e **Conferma** (due volte, per non cifrare con un refuso) con la stessa navigazione col controller degli altri campi, stato «cifrato / non cifrato» e testi IT/EN (`accounts.passphrase*`).
- `dataPermissions.ts`: `secret.key` e `backup-passphrase.enc` in 0600. Versione `3.2.2-dev.2`.

### Da sapere

- **`secret.key` va tenuta**: chi copia la cartella dati su un'altra macchina senza questo file deve reinserire chiavi API, client secret e login di Drive. Un backup della cartella dati che includa tutto (DB e chiave insieme) non è protetto dalla cifratura a riposo.
- **Passphrase persa = backup perso.** Non c'è modo di recuperarlo. Cambiando la passphrase, il file già su Drive resta cifrato con la vecchia finché non fai un nuovo backup.
- Il bundle Drive contiene le chiavi di `.env` (Steam, IGDB, SteamGridDB): è il motivo per cui conviene la passphrase. Il `.env` locale resta in chiaro.
- Non toglie il rischio da malware con lo stesso utente (può leggere anche `secret.key`).

### Verifica fatta e non fatta

- **Fatto**: 38 controlli automatici (`t_crypto.js`) su cifratura/decifratura, migrazione di un DB con segreti in chiaro (AI, client secret, tokens.json), idempotenza, permessi 0600, chiave mancante, chiave non valida, dato alterato, passphrase giusta/sbagliata/assente, file alterato, ripristino di un bundle cifrato e di uno vecchio, `.env` non leggibile nel file cifrato. Server vero avviato: rotte della passphrase (troppo corta, non stringa, ok, rimozione), `passphraseSet` nell'elenco, client secret mai in chiaro nel DB, header di sicurezza. `tsc --noEmit` del progetto (solo l'errore preesistente del modulo opzionale `howlongtobeat`) e `vite build`.
- **Non fatto (hardware reale)**: l'interfaccia dei campi Passphrase/Conferma col controller e la tastiera virtuale (compilata, mai vista a schermo); un backup e un ripristino veri su Google Drive con passphrase.

## v3.2.2-dev.3 — overlay: interruttori Bluetooth / Wi-Fi / LAN con stato e conferma allo spegnimento

### Cosa cambia (`overlay.py`)

- **Interruttori attivi di default**: `X_LAUNCHER_OVERLAY_TOGGLES` ora vale `bt,wifi,lan` se non impostata (prima: nessuno). Variabile vuota = solo stato; `wifi` = solo Wi-Fi.
- **Stile come il quick-menu**: il pulsante selezionato (anche − muto +) si riempie per intero del blu del logo (bordo primary-500, testo bianco) invece dell'anello di prima; i non selezionati restano scuri. Nuova chiave `danger` nella sezione `overlay` dei temi (`themes/dark.json`, `light.json`; rosso danger-600, fallback nel codice).
- **Stati sui pulsanti**: etichetta verde quando acceso/collegato (Acceso, SSID, Collegata), grigia quando spento; pallino come prima. Il Wi-Fi spento mostra «Spento» anche se NetworkManager non ha ancora aggiornato la connessione. Durante l'operazione il pulsante mostra «In corso…» e un secondo A viene ignorato.
- **Conferma prima di spegnere**, come «Esci» del quick-menu: il primo A arma il pulsante (tutto il pulsante diventa rosso con «Conferma con A», suggerimento in basso «Conferma»), il secondo A esegue e il pulsante torna blu. **B** annulla solo la richiesta (l'overlay resta aperto), così come ogni spostamento del D-pad o 4 s senza input. **Accendere non chiede conferma.**
- **Il suggerimento del tasto A** dice «Spegni» o «Accendi» secondo lo stato.
- **Bluetooth spento con il controller in uso**: il rifiuto («Il controller in uso è Bluetooth…») arriva subito, prima di chiedere la conferma.
- **Operazioni in un thread**: `nmcli`/`bluetoothctl` possono impiegare secondi (LAN fino a 8 s); prima bloccavano l'overlay, ora no.
- **Volume −, muto e +**: invariati, selezione normale senza conferma.
- Nuove stringhe it/en nel dizionario interno di `overlay.py` (`confirm_off`, `busy`, `turnoff`, `turnon`, `confirm_hint`).

### Provato

Con un `bluetoothctl` e un `nmcli` finti e un Xvfb: 20 controlli (armare, B, spostamento, scadenza, spegnere BT/Wi-Fi/LAN, accendere senza conferma, «In corso», volume senza conferma, rifiuto con pad Bluetooth, variabile vuota) e due immagini dell'overlay (conferma armata, operazione in corso). **Mai provato con i veri `bluetoothctl`/`nmcli` né su hardware.**

### Da verificare sull'HTPC

1. Select + D-pad → overlay → su: Bluetooth, Wi-Fi e LAN mostrano lo stato corretto.
2. A su un servizio acceso: «Conferma con A»; B → torna normale; di nuovo A, poi A → si spegne e lo stato si aggiorna.
3. A su uno spento: si accende subito.
4. Con il controller Bluetooth: spegnere il Bluetooth dà il messaggio di rifiuto senza conferma.
5. Spegnere la LAN con un gioco online: attenzione, scollega davvero l'interfaccia Ethernet.

