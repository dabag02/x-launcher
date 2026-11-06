# CHANGELOG-14 — da v3.2.0-Mars

Prosegue da CHANGELOG-13.md (chiuso su MILESTONE STABILE v3.2.0-Mars).

Ciclo chiuso con la MILESTONE STABILE v3.2.1-Mars (voce qui sotto); la serie continua in CHANGELOG-15.md. Voci: la milestone in cima, poi dev.1.

Punti aperti ereditati dalla milestone: vedi «Resta aperto» nella voce della milestone in CHANGELOG-13.md (messaggi del backend solo in italiano, temi aggiuntivi non esposti, interruttori Bluetooth/Wi-Fi/LAN dell'overlay, scelta rete Wi-Fi, «chiudi il gioco» dall'overlay, indicatore del congelamento, regola sul quarto lancio, Fase 5, bug `process-manager/list`, cifratura del bundle Drive e delle chiavi API).

## MILESTONE STABILE v3.2.1-Mars — la Dashboard si congela fuori dallo spazio 0 (ciclo dev.1)

Congelato. Il ciclo è una sola consegna (dev.1, voce qui sotto), **confermata dall'utente sull'HTPC nella sessione Openbox «Shell» standalone**: con un gioco Epic Store e con uno che dipende dal launcher EA app la Dashboard (Chromium completo) si congela quando non è lo spazio corrente e si scongela quando la si sceglie o quando il gioco viene chiuso; prova prolungata oltre un'ora senza problemi. Nella milestone cambiano solo il numero di versione e i commenti degli script; il codice è quello della dev.1.

### Cosa contiene

- **Congelamento della Dashboard** (`spaces.py`, `kiosk-launch.sh`): in modalità spazi il browser parte in uno scope `xlauncher-dashboard-<ts>` e `spaces.py` lo congela (ritardo 2 s) quando lo spazio corrente non è lo 0, scongelandolo prima di mostrarlo (anche dall'overlay, dopo la pausa di 0,6 s). Sicurezza come per i giochi: residui scongelati all'avvio, tutto scongelato all'uscita del demone. Interruttori: `X_LAUNCHER_SPACES_FREEZE_DASHBOARD=0`, `X_LAUNCHER_SPACES_FREEZE=0`, `x-launcher-spaces freeze off`.
- **Fuori dalla sessione Openbox «Shell» non cambia nulla** (XFCE e le altre: resta `isFocusFrozen` al lancio; Kiosk gamescope invariato). Lo scope della Dashboard non compare nel gestore processi.

### Resta aperto

- Messaggi del backend solo in italiano, temi aggiuntivi non esposti, interruttori Bluetooth/Wi-Fi/LAN dell'overlay, scelta della rete Wi-Fi, «chiudi il gioco» dall'overlay, indicatore del congelamento nella Dashboard, regola sul quarto lancio, Fase 5, `GET /api/process-manager/list` che risponde `[]` con un gioco vivo, cifratura del bundle Drive e delle chiavi API.
- Il tempo di gioco conta anche i periodi in cui il gioco è congelato in un altro spazio (comportamento esistente, deciso di non cambiarlo).

## v3.2.1-dev.1 — la Dashboard si congela fuori dallo spazio 0 (come i giochi)

Richiesta: nella sessione Openbox standalone, con un gioco attivo in un altro spazio, la Dashboard a volte continuava a leggere il controller. Il blocco in pagina (`spacesGate.ts`) dipende dalla pagina stessa, che deve ricevere in tempo la risposta di `/api/spaces`: ha eccezioni volute (rilascio dopo 45 s, Select + ◄/►) e non può garantire nulla. Ora `spaces.py` congela il **processo** della Dashboard con il cgroup freezer, come già fa con i giochi.

### Cosa cambia

- **`kiosk-launch.sh`** (ramo desktop/Openbox, solo con `--spaces-mode`): il browser parte in uno scope utente `xlauncher-dashboard-<ts>` (`systemd-run --user --scope`), in tutti i rami (Chromium kiosk/borderless/finestra, Firefox). Prima si prova con un `systemd-run` di prova: se non funziona, o con `X_LAUNCHER_SPACES_FREEZE_DASHBOARD=0`, il browser parte come prima e la Dashboard non si congela (resta il blocco in pagina). La sessione gamescope dedicata non cambia.
- **`spaces.py`**: riconosce lo scope `xlauncher-dashboard-*` dalla finestra della Dashboard e lo tratta come lo «scope dello spazio 0». Quando lo spazio di destinazione non è lo 0 la Dashboard si congela con **2 s di ritardo** (`XL_SPACES_DASHBOARD_FREEZE_DELAY_S`, per dare alla pagina il tempo di chiudere la splash) e con la stessa rivalutazione dei giochi: un andirivieni rapido non la congela. Prima di mostrare lo spazio 0 viene scongelata (+250 ms di assestamento); dall'overlay resta ferma durante la pausa di 0,6 s con il pad in esclusiva e si scongela solo dopo. L'overlay aperto sopra la Dashboard non la congela.
- **Sicurezza del freezer**: all'avvio vengono scongelati anche i residui `xlauncher-dashboard-*`; all'uscita del demone (anche SIGTERM) si scongela tutto; se la finestra della Dashboard sparisce lo scope viene dimenticato; i comandi `x-launcher-spaces freeze on|off|status` e `thaw [scope]` valgono anche per la Dashboard, `spaces-nofreeze.conf` anche (basta un prefisso `xlauncher-dashboard`).
- **Interruttori**: `X_LAUNCHER_SPACES_FREEZE_DASHBOARD=0` (in `~/.config/openbox/environment`) spegne solo il congelamento della Dashboard; `X_LAUNCHER_SPACES_FREEZE=0` spegne tutto. Nel log `[spaces]`: «congelamento della Dashboard fuori dallo spazio 0: ATTIVO» e, alla comparsa della finestra, `Dashboard: finestra … scope=xlauncher-dashboard-…` (senza scope compare l'avviso che la Dashboard non si congela).
- Il blocco in pagina (`spacesGate.ts`, `App.tsx`) **non è stato toccato**: resta come seconda difesa.

### Verifica fatta e non fatta

- **Fatto** (Xvfb + Openbox reali, `systemctl` simulato, xterm al posto di Chromium e dei giochi): residui scongelati all'avvio; apertura di un gioco → Dashboard congelata dopo il ritardo; ritorno allo spazio 0 → Dashboard scongelata e gioco congelato; andirivieni rapido e «spazio 1 poi 0 prima del ritardo» (Dashboard mai congelata); `freeze off/on`; chiusura del gioco → ritorno alla Dashboard scongelata (dopo la tolleranza di `RELEASE_GRACE_S`); SIGTERM del demone con la Dashboard congelata (tutto scongelato); overlay con Pillow vero: scelta della Dashboard (ferma durante la pausa, poi scongelata) e ritorno al gioco (Dashboard ricongelata). `py_compile`, `bash -n`.
- **Non fatto (hardware reale)**: il freezer vero di systemd sul browser; `systemd-run --user --scope` dentro `kiosk-launch.sh` con Chromium reale (in particolare che `--app` non si aggancia a un Chromium già aperto con lo stesso profilo: in quel caso la finestra non sarebbe nello scope e non si congelerebbe, nel log comparirebbe l'avviso); cosa fa la pagina allo scongelamento dopo molto tempo (SSE e splash che si riallineano); GPU/audio di Chromium al thaw.

### Come provarlo

1. Aggiorna `spaces.py`, `kiosk-launch.sh`, `package.json`, `src/App.tsx` (+ `./build.sh compile`) e riavvia la sessione Openbox.
2. `grep "Dashboard" ~/.local/share/x-launcher/tray.log`: deve comparire `scope=xlauncher-dashboard-…`; `systemctl --user list-units 'xlauncher-dashboard-*'`.
3. Lancia un gioco: dopo ~2 s dal passaggio `systemctl --user show -p FreezerState --value xlauncher-dashboard-<ts>.scope` = `frozen`. Il controller non deve più arrivare alla Dashboard.
4. Select + D-pad → overlay → Dashboard: dopo la pausa la Dashboard risponde subito, il gioco è congelato. Da lì lancia un secondo gioco e controlla splash e passaggio di spazio.
5. Se qualcosa non va: `x-launcher-spaces freeze off` (scongela tutto) o `X_LAUNCHER_SPACES_FREEZE_DASHBOARD=0`.

