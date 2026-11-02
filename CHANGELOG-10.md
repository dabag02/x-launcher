# CHANGELOG-10 — da v2.6.7-dev.1

Prosegue da CHANGELOG-9.md (chiuso su MILESTONE STABILE v2.6.6-Mercury).

## v2.6.7-dev.1

**Modalità spazi: gate dell'input per spazio e diagnostica del controller, come opzione di `kiosk-launch.sh` (`--spaces-mode`).** Richiesta: partire dal primo punto aperto della milestone (la Dashboard resta congelata finché il gioco tracciato è vivo, quindi non si può lanciare un secondo gioco con il primo in un altro spazio), implementarlo come opzione passata allo script di lancio come `--local-server`, e verificare se cambiando workspace di Openbox la Dashboard perde davvero il controller — e viceversa quando si passa da uno spazio all'altro con Select + D-pad.

### Cosa cambia

- **`kiosk-launch.sh`**: nuova opzione `--spaces-mode`. Con lo stesso schema di `--local-server` (che aggiunge `?localdev=1`) aggiunge `?spaces=1` all'URL del browser (`…/?spaces=1`, oppure `…/?localdev=1&spaces=1` con le due opzioni insieme). Il `WM_CLASS` della finestra di Chromium non cambia (host `localhost`), quindi la regola di `rc.xml` e il riconoscimento di `spaces.py` restano validi.
- **`openbox/autostart`**: passa `--spaces-mode` per default nella sessione Shell; `X_LAUNCHER_SPACES_MODE=0` (in `~/.config/openbox/environment`) lo disattiva. La scelta è scritta in `openbox-session.log`.
- **`src/lib/spacesGate.ts`** (nuovo): funzione pura che decide il congelamento dell'input della Dashboard. Regole, in ordine: senza gestore degli spazi o senza gioco tracciato non decide nulla (comportamento di sempre); subito dopo un lancio la Dashboard resta congelata finché il gestore non porta in uno spazio di gioco, e se entro 45 s il gioco non è comparso in nessuno spazio (es. finestra mai creata) viene **liberata** invece di restare bloccata fino al kill; con la Dashboard che non è lo spazio corrente è **congelata**; con la Dashboard come spazio corrente e il gioco in un altro spazio è **libera** (si può lanciare un secondo gioco); se non esiste nessuno spazio di gioco non decide.
- **`src/App.tsx`**: in modalità spazi (parametro `?spaces=1`, letto una volta all'avvio) interroga `GET /api/spaces` ogni 400 ms e applica il gate; al lancio di un gioco arma l'attesa del passaggio; il blocco "Select + ◄/►" della Dashboard non ri-congela più quando la rotta risponde `handledByDaemon` (altrimenti, senza spazi verso cui passare, la Dashboard sarebbe rimasta bloccata). **Fuori dalla modalità spazi non cambia nulla** (XFCE e Kiosk gamescope invariati).
- **Diagnostica `[SPACES-DIAG]`** (nel `daemon.log` e nella Debug Console), solo in modalità spazi: `visibilityState`, `hasFocus` e spazio corrente a ogni cambio di focus/visibilità della finestra; **ogni bottone che la Dashboard riceve davvero dal Gamepad API** (indici standard: 0 A, 1 B, 2 X, 3 Y, 4 L1, 5 R1, 6 L2, 7 R2, 8 Select, 9 Start, 12-15 D-pad su/giù/sinistra/destra); quanti controller espone `getGamepads()`; ogni cambio di spazio e ogni decisione del gate con il motivo.
- **`spaces.py`**: le righe `[spaces]` ora hanno l'orario con i millisecondi, per correlarle con quelle di `daemon.log`.
- Versione `2.6.7-dev.1` in `package.json` e nel fallback di `src/App.tsx`.

### Come provarlo (e cosa cercare)

1. `./build.sh compile` nella copia di sviluppo e riavvio della sessione Openbox (l'autostart passa `--local-server --spaces-mode`).
2. **Dashboard come spazio corrente**: premi qualche bottone. Atteso: righe `la Dashboard ha ricevuto il bottone N … visibilityState=visible, hasFocus=true, spazio=0`.
3. Lancia un gioco e attendi il passaggio allo spazio 1 (`spazio corrente=1`, gate `CONGELATO`). **Nello spazio del gioco premi bottoni qualsiasi** (non le combo): se la Dashboard registra righe `ha ricevuto il bottone`, **riceve ancora il controller anche nascosta** (e il congelamento serve davvero); se non compare nulla — e magari `visibilitychange … hidden` o `finestra: blur` — Chromium non riceve il pad quando non è lo spazio corrente.
4. **Select + D-pad** per tornare alla Dashboard: atteso `spazio corrente=0`, gate `LIBERO`, righe di focus/visibilità, e i bottoni premuti di nuovo registrati. Verifica anche che Select + D-pad compaia come bottoni 8 e 14/15 sulla Dashboard: il demone lo gestisce comunque via evdev.
5. Dalla Dashboard libera lancia un **secondo gioco**: deve passare allo spazio 2 e al ritorno la Dashboard deve restare utilizzabile.
6. Cerca con `grep SPACES-DIAG ~/.local/share/x-launcher/daemon.log` e confronta con `~/.local/share/x-launcher/tray.log` (righe `[spaces]` con orario).

### Verifica fatta e non fatta

- **Fatto**: tabella delle decisioni del gate verificata con 13 casi (gestore assente o spento, nessun gioco tracciato, lancio in attesa, passaggio allo spazio 1, timeout senza finestra, appena sotto il timeout, in gioco, ritorno alla Dashboard, due giochi aperti, nessuno spazio di gioco, secondo lancio, spazio 3); costruzione dell'URL di `kiosk-launch.sh` per tutte le combinazioni di opzioni (nessuna, `--local-server`, `--spaces-mode`, entrambe, con browser forzato); `autostart` con percorso con spazi e con `X_LAUNCHER_SPACES_MODE` / `X_LAUNCHER_LOCAL_SERVER` a 0/1; controllo dei tipi e build completa (`vite` + `esbuild`).
- **Non fatto (hardware reale)**: Chromium vero con Openbox — è proprio ciò che il test deve misurare. Il blocco è tracciato solo per l'ultimo gioco lanciato (`gameStillRunningRef`): con due giochi aperti, se si chiude quello tracciato la Dashboard viene liberata anche con l'altro ancora vivo (comportamento voluto per questa iterazione).

## v2.6.7-dev.2

**Verifica di completezza dopo il primo test della modalità spazi: la modalità non era mai stata attiva, e protezioni contro versioni miste.** Il log di sessione dell'utente (`openbox-session.log`, ultima riga `kiosk-launch.sh: --local-server`, formato della vecchia `autostart`) mostrava che nella cartella di sviluppo c'era ancora la `autostart` precedente: `--spaces-mode` non veniva passato, quindi la Dashboard di sviluppo (porta 3001) girava senza gate e non si sbloccava al cambio di spazio. Il controllo di tutta la catena ha trovato altri punti scoperti, qui chiusi.

### Cosa cambia

- **`openbox/autostart`**: passa `--spaces-mode` solo se `kiosk-launch.sh` la conosce; altrimenti scrive un ATTENZIONE in `openbox-session.log` e non la passa. Prima, con un `kiosk-launch.sh` vecchio, l'opzione sarebbe stata scambiata per il nome del browser da forzare (ramo `*)` del parsing).
- **`kiosk-launch.sh`**: ogni opzione `--…` sconosciuta viene ignorata con un messaggio (`[KIOSK] Opzione sconosciuta ignorata`) invece di diventare `FORCED_BROWSER`.
- **`build.sh`**: `./build.sh start` ora **inoltra tutte** le opzioni a `kiosk-launch.sh` (prima solo la prima, `"${2:-}"`): `./build.sh start --local-server --spaces-mode`.
- **`src/App.tsx`**: **badge azzurro "Modalità spazi · spazio N · giochi M"** sotto il numero di versione nel quick-menu (stessa posizione del badge rosso "Server locale"), aggiornato quando cambia lo spazio; con il gestore spento mostra "gestore non raggiungibile". Si vede a colpo d'occhio se la modalità è attiva, senza leggere i log.
- **`INSTALL.md`**: documentata la modalità spazi (§4.1), la combinabilità delle opzioni di `build.sh start`, `X_LAUNCHER_SPACES_MODE=0` e la regola "aggiorna `autostart` e `kiosk-launch.sh` insieme".
- Versione `2.6.7-dev.2` in `package.json` e nel fallback di `src/App.tsx`.

### Verificare che la modalità spazi sia attiva

1. Il badge azzurro nel quick-menu della Dashboard (richiede aver ricompilato il frontend con `./build.sh compile`).
2. `openbox-session.log`: ultima riga `kiosk-launch.sh: --local-server --spaces-mode` (senza `--spaces-mode`, o con un ATTENZIONE, i file non sono aggiornati).
3. `kiosk-launch-openbox.log`: `[KIOSK] MODALITA' SPAZI … (URL: http://localhost:3001/?localdev=1&spaces=1)`.
4. `daemon.log`: `[SPACES-DIAG] modalità spazi attiva …`.

### File da aggiornare insieme nella cartella di sviluppo

`kiosk-launch.sh`, `openbox/autostart`, `build.sh`, `src/App.tsx`, `src/lib/spacesGate.ts`, `spaces.py`, `package.json`, poi `./build.sh compile` e riavvio della sessione.

### Verifica fatta e non fatta

- **Fatto**: `autostart` con `kiosk-launch.sh` nuovo (passa `--local-server --spaces-mode`) e vecchio (non passa l'opzione e segnala); parsing di `kiosk-launch.sh` con opzioni sconosciute (ignorate, il browser forzato resta quello giusto) e con tutte le combinazioni; inoltro di tutte le opzioni da `build.sh start`; controllo dei tipi e build completa con il badge.
- **Non fatto (hardware reale)**: la verifica con Chromium vero resta il test dell'utente.

## v2.6.7-dev.3

**Congelamento automatico dei giochi negli spazi non correnti (cgroup freezer).** Richiesta: nello spazio 0 il gioco in un altro spazio continua a ricevere gli input del controller (e, con Wine, a consumare risorse). Test dell'utente su hardware reale: `systemctl --user freeze <scope>.scope` blocca del tutto l'input del gioco e `thaw` lo riprende senza problemi, sia con Wine sia con Proton. Qui la cosa diventa automatica in `spaces.py`.

### Cosa cambia

- **`spaces.py`, classe `Freezer`** (nuova): `systemctl --user freeze|thaw xlauncher-game-*.scope`, operazioni serializzate. Congela **solo** gli scope `xlauncher-game-*` che hanno uno slot e non sono nello spazio di destinazione. Non sono congelabili: i giochi Steam lanciati via URI (nessuno scope) e il quarto gioco (nessuno slot).
- **Ordine nel cambio di spazio**: lo spazio di destinazione viene registrato (`target_space`), il suo gioco **viene scongelato prima** di mostrarlo (+250 ms di assestamento, solo se era congelato), poi si cambia desktop, poi gli altri giochi vengono congelati con 400 ms di ritardo. Al momento di congelare, la condizione viene **rivalutata**: un andirivieni rapido tra spazi non congela mai il gioco dello spazio in cui ci si trova. Se il desktop cambia per cause esterne (scorciatoie di Openbox) i congelamenti si riallineano.
- **Sicurezza**: all'avvio vengono scongelati gli scope `xlauncher-game-*` rimasti congelati da una sessione precedente (`FreezerState` frozen/freezing); all'uscita del demone (atexit, SIGTERM, SIGINT, SIGHUP) si scongela tutto; quando un gioco esce dall'indice viene dimenticato. Un errore di `systemctl` viene registrato e contato (`errors`) e non blocca mai il cambio di spazio.
- **Controllo**: `X_LAUNCHER_SPACES_FREEZE=0` disattiva il congelamento; `~/.config/x-launcher/spaces-nofreeze.conf` (uno scope o prefisso per riga, `#` commenti) esclude giochi dal congelamento; a runtime `x-launcher-spaces freeze on|off|status` (`off` scongela tutto) e `x-launcher-spaces thaw [scope]`. Lo stato (`freeze`: enabled, frozen, errors, excluded) è anche in `x-launcher-spaces state`.
- **Bug preesistente corretto**: `ControlServer._handle` sovrascriveva un metodo interno di `threading.Thread` (Python 3.13: `'_thread._ThreadHandle' object is not callable`), quindi con Python 3.13 il socket di controllo non rispondeva a nessun comando. Il metodo ora si chiama `_serve_conn`.
- Versione `2.6.7-dev.3` in `package.json` e nel fallback di `src/App.tsx`.

### Come provarlo

1. Aggiorna `spaces.py` (e riavvia la sessione). Nel log `[spaces]`: `congelamento dei giochi negli altri spazi: ATTIVO`.
2. Lancia un gioco, torna alla Dashboard (Select + D-pad): `freezer: <scope> congelato`; verifica con `systemctl --user show -p FreezerState --value <scope>.scope` = `frozen`. Gli input del gioco non devono arrivare.
3. Torna al gioco: `scongelato` **prima** di `-> spazio N`; il gioco riprende. Controlla che l'audio e la rete (giochi online) non si interrompano in modo fastidioso, ed eventualmente escludi il gioco in `spaces-nofreeze.conf`.
4. Con due giochi: in ogni spazio deve essere vivo solo il gioco di quello spazio.
5. Confronta ventole/CPU della sessione con un gioco Wine in un altro spazio: era il sospetto della Fase 4.

### Verifica fatta e non fatta

- **Fatto** (Xvfb + Openbox reali, `systemctl` simulato, finestre xterm associate a scope finti): scongelamento dei residui all'avvio; congelamento dei giochi non correnti; scongelamento prima del cambio; andirivieni rapido 2-1-2-1 (il gioco corrente resta scongelato); esclusione via file; `freeze off` (scongela tutto) / `on`; freeze che fallisce (errore contato, nessun blocco); chiusura del gioco corrente (ritorno alla Dashboard, l'altro resta congelato); SIGTERM con giochi congelati (scongelati). Compilazione di `spaces.py`.
- **Non fatto / da verificare su hardware**: il vero freezer di systemd (provato a mano dall'utente, non dal demone); **chiusura dal Process Manager di uno scope congelato**: un SIGKILL funziona anche su un cgroup congelato, un SIGTERM resta in attesa fino al thaw; se la chiusura dalla Dashboard di un gioco in un altro spazio non funziona, il rimedio immediato è `x-launcher-spaces thaw <scope>` prima del kill (da integrare nel backend se serve); giochi che perdono la connessione di rete se congelati a lungo.

