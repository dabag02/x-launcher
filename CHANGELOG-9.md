# CHANGELOG-9 — da v2.5.1-dev.1 (milestone v2.6.6-Mercury)

Prosegue da CHANGELOG-8.md (chiuso su MILESTONE STABILE v2.5.0-Mercury).

## v2.5.1-dev.1

Apre lo **Step 21 — Gestore degli spazi (gamespace manager)**: gestire in modo distinto la finestra della Dashboard e quelle dei giochi (fino a 3) e navigarle con Select + D-pad sx/dx del controller, come fra spazi desktop. Serve soprattutto nella sessione standalone, non sul desktop XFCE. Vedi anche X-Launcher-Roadmap.md, Step 21.

### Diagnosi (hardware reale, mai per assunzione)

Fatta con due script di sola diagnostica, nessuno dei quali fa parte del runtime (`scripts/diag-gamespace.sh` v3.2 e `scripts/diag-gamescope-focus.sh`), su sessione XFCE e su sessione Kiosk (gamescope):

- **Il WM dell'Xwayland di gamescope è gamescope stesso** (`steamcompmgr`, 5 atomi EWMH). La redirezione sulla root è occupata: un secondo window manager non può installarsi.
- **gamescope ignora le richieste esterne di focus.** `xdotool windowraise/windowfocus/windowactivate`, `wmctrl -a`, Xlib (configure Above + XSetInputFocus) e il client message `_NET_ACTIVE_WINDOW` tornano tutti exit 0 senza spostare il focus (verificato sia dal focus X sia da `GAMESCOPE_FOCUSED_WINDOW`). Le proprietà `GAMESCOPECTRL_BASELAYER_APPID` e `_WINDOW` non hanno effetto in modalità standalone.
- **Regola osservata del focus**: una finestra nuova mappata prende il focus entro ~50 ms; alla sua chiusura il focus torna alla precedente.
- **Ogni escursione del focus fuori dal gioco ha lasciato lo schermo nero** (con una breve linea chiara in alto a sinistra) e la sessione inutilizzabile, da recuperare con riavvio di lightdm da TTY: smappare/rimappare il gioco, contenitore con reparenting di Dashboard e gioco, finestra di prova. Non è stato isolato se la causa sia Wine/DXVK o gamescope (test con client semplice a schermo intero mai eseguito).
- **Indice dei client gratuito ma in sola lettura**: gamescope pubblica sulla root `GAMESCOPE_FOCUSED_WINDOW`, `GAMESCOPE_FOCUSABLE_APPS` e `GAMESCOPE_FOCUSABLE_WINDOWS` (triple finestra, appid, PID; senza `STEAM_GAME` l'appid è l'id finestra). Il PID corrisponde a `_NET_WM_PID` e risale allo scope `xlauncher-game-*` via cgroup.
- **Il controller è leggibile via evdev senza root** (Select = `BTN_SELECT`, D-pad = `ABS_HAT0X` con valori -1/0/+1), sia in XFCE sia in Kiosk. Il gioco riceve gli input a prescindere dal focus X, quindi gli spazi non isolano l'input da soli: serve congelare (o prendere in esclusiva) i giochi non attivi.
- **Il freeze funziona meccanicamente**: `systemctl --user freeze <scope>` porta la CPU dello scope da ~6,5 s per 3 s a 0 (`FreezerState=frozen`). L'esito della ripresa non è attendibile (stato già compromesso dai test precedenti).
- **Display annidato (Xephyr) scartato**: `glxinfo` dentro Xephyr riporta `llvmpipe`, `Accelerated: no`.
- **Reparenting grezzo**: tecnicamente riesce (il parent cambia, glxgears ~58-60 fps), ma sotto gamescope ha lasciato schermo nero; sotto xfwm4/Openbox il WM riadotta le finestre.

### Decisione

Nuova sessione **"Shell"**: Xorg + **Openbox** configurato da noi (nessuna barra, menu o decorazione), accanto alla sessione Kiosk gamescope, che resta invariata (si sceglie dal greeter LightDM). Dashboard = desktop 1 (spazio 0), giochi = desktop 2-4 (spazi 1-3). Openbox parla EWMH, quindi `wmctrl`, `windowFocus.ts`, `windowDetector.ts` e la splash con rilevazione finestra tornano utilizzabili senza modifiche. Il window manager proprio (fork di Openbox o dwm) resta un'opzione solo se emerge un limite concreto.

### Cosa contiene questa build (Fase 1)

- **`openbox/rc.xml`** (nuovo, cartella `openbox/` nella radice del progetto): 4 desktop con nome (Dashboard, Gioco 1-3), nessuna decorazione, nessun margine riservato, nessun binding di mouse e tastiera tranne **Ctrl+Alt+Q = esci dalla sessione** (rete di sicurezza in sviluppo). Regola per la Dashboard (`WM_CLASS` localhost / Chromium) sul desktop 1.
- **`openbox/autostart`** (nuovo, stessa cartella, eseguibile): ricava la cartella del progetto dal symlink in `~/.config/openbox/` (funziona con percorsi contenenti spazi), esporta `XDG_CURRENT_DESKTOP=Openbox` perché `kiosk-launch.sh` prenda il ramo "sopra un desktop" (Chromium `--kiosk`, segnalazione del DISPLAY al daemon con `kind:"desktop"`, tray.py) e non il vecchio ramo "sessione dedicata" (`gamescope -e`), spegne screensaver/DPMS, lancia `kiosk-launch.sh` e, quando termina, esegue `openbox --exit` (torna il login). Log in `~/.local/share/x-launcher/openbox-session.log` e `kiosk-launch-openbox.log`.
- Versione `2.5.1-dev.1` in `package.json` e nel fallback `useState` di `src/App.tsx` (nessun'altra modifica al codice).

### Installazione e verifica

1. `sudo pacman -S openbox` (il pacchetto installa la sessione "Openbox" nel greeter LightDM).
2. Symlink della configurazione (adatta il percorso del progetto):
   `mkdir -p ~/.config/openbox`
   `ln -sf "$HOME/Progetto Dashboard/x-launcher-dev/openbox/rc.xml" ~/.config/openbox/rc.xml`
   `ln -sf "$HOME/Progetto Dashboard/x-launcher-dev/openbox/autostart" ~/.config/openbox/autostart`
   (se esiste già una configurazione Openbox personale, farne prima un backup.)
3. Uscire dalla sessione e scegliere **Openbox** nel greeter. Atteso: Dashboard a schermo intero senza bordi; un gioco lanciato compare come finestra senza bordi sul desktop corrente; Select + ◄/► (wmctrl) torna a funzionare.
4. Se la sessione torna a XFCE: leggere `~/.xsession-errors` e `/var/log/lightdm/lightdm.log` — è il vecchio problema della sessione X11 dedicata, e il test con la sessione "Openbox" del pacchetto dice se la causa era il nostro file `.desktop` o il percorso in generale.

### Verifica fatta e non fatta

- **Fatto (ambiente simulato, Xvfb)**: `rc.xml` valido XML e accettato da Openbox senza avvisi; 4 desktop con nome; finestre senza decorazioni (`_NET_FRAME_EXTENTS` 0,0,0,0); regola della Dashboard applicata (desktop 1); `autostart` provato con uno stub di `kiosk-launch.sh` in un percorso con spazi: `XDG_CURRENT_DESKTOP` impostato, `openbox --exit` eseguito alla fine.
- **Non fatto**: avvio reale da LightDM, Chromium reale, `tsc` (cambiata solo una stringa letterale), comportamento di `tray.py` senza un systray host (l'icona probabilmente non comparirà; le altre funzioni del daemon vanno verificate).

### Resta aperto

- **Fasi 2-6 dello Step 21** (indice e slot nel daemon, Select + D-pad via evdev, congelamento dei giochi non attivi, gestione di sistema senza desktop, opzionale gamescope per gioco): vedi roadmap.
- **Bug da indagare**: `GET /api/process-manager/list` ha risposto `[]` con un gioco vivo; `listActive()` elimina dal registry le voci per cui `is-active` non risponde "active". Causa non isolata.
- **Non isolato**: perché l'escursione del focus lascia lo schermo nero sotto gamescope (Wine/DXVK o gamescope).

## v2.5.1-dev.2

**Multimonitor: i giochi si aprono sul display principale.** Segnalazione: nella sessione Openbox "Shell" Bioshock si apriva sul secondo display; il requisito è che i giochi si aprano sempre sul display principale (e, in Fase 2, in un secondo workspace/gamespace).

### Cause individuate

1. **Il layout dei monitor non è più quello di XFCE** (causa principale, ipotesi coerente con i dati). Nel log XFCE del 9 ottobre: DP-4 primario 2560×1440 a `+0+0`; HDMI-0 sotto a `+458+1440`, ruotato di 180° e scalato (modo 2160×1440 mostrato 1728×1152). Quel layout sta nelle impostazioni di XFCE e lo applica XFCE; in una sessione Openbox nuda non lo applica nessuno, quindi X usa la disposizione di default e nessun output è marcato `primary` (HDMI-0 è anche il primo della lista di `xrandr`). I giochi scelgono il monitor in (0,0) o il primario. Da confermare in sessione con `xrandr --query | grep " connected"`.
2. **`rc.xml` (errore mio, parziale)**: `<monitor>Primary</monitor>` e `<primaryMonitor>1</primaryMonitor>` si riferiscono al monitor *1 della lista di Openbox* (di norma quello in alto a sinistra), non all'output `primary` di RandR, e valgono solo per finestre senza posizione propria; Bioshock dichiara la sua.
3. **Il "secondo workspace" non è un difetto**: oggi il gioco si apre sul desktop corrente; assegnarlo al desktop 2-4 è la Fase 2.

### Cosa cambia

- **`openbox/display.sh`** (nuovo): applica un layout deterministico a ogni avvio della sessione, prima di Chromium. Con `~/.config/x-launcher/shell-display.conf` il layout è esattamente quello scritto in `XRANDR_ARGS`; senza, rende primario l'output già primario (o il più grande) a `+0+0` e mette gli altri a destra. `--capture` stampa il layout attuale come `XRANDR_ARGS` (da lanciare in XFCE per conservare il layout), `--dry-run` mostra il comando. Opzione `SECONDARY="off"` per spegnere gli altri monitor (garanzia assoluta). Verifica a fine applicazione e log in `~/.local/share/x-launcher/display.log`.
- **`openbox/shell-display.conf.example`** (nuovo): esempio con il layout XFCE del 9 ottobre (DP-4 principale, HDMI-0 sotto, ruotato 180°, scala 0.8).
- **`openbox/rc.xml`**: la regola generica ora **forza** ogni finestra sul monitor 1 al momento della mappatura (`<position force="yes">`, centro, monitor 1); commento sul significato di "monitor 1" e sul rapporto con `display.sh`.
- **`openbox/autostart`**: chiama `display.sh` (con timeout) prima di `kiosk-launch.sh`.
- Versione `2.5.1-dev.2` in `package.json` e nel fallback di `src/App.tsx`.

### Uso

1. In XFCE, col layout che vuoi conservare: `bash openbox/display.sh --capture`.
2. `mkdir -p ~/.config/x-launcher` e salva la riga stampata (o copia `openbox/shell-display.conf.example`) in `~/.config/x-launcher/shell-display.conf`.
3. Avviare la sessione Openbox; verificare `~/.local/share/x-launcher/display.log` (riga `VERIFY=OK`).

### Verifica fatta e non fatta

- **Fatto**: `display.sh` con un `xrandr --query` registrato dal log XFCE reale — `--capture` ricostruisce il layout (inclusi rotazione e scala 0.8), modalità automatica sceglie DP-4, `SECONDARY=off` e `XRANDR_ARGS` funzionano; con `xrandr` reale su X virtuale. Openbox su un server a **due head Xinerama** (Xephyr): una finestra che chiede il secondo monitor (`x=1500`) senza la regola atterra sul secondo (controllo), con la regola atterra al centro del monitor 1; una finestra Chromium a schermo intero copre esattamente il monitor 1 sul desktop 1. `autostart` con percorso con spazi: `display.sh` gira prima di `kiosk-launch.sh`.
- **Non fatto (hardware reale)**: applicazione di rotazione e scala con NVIDIA via `xrandr`, comportamento di Bioshock/Wine a schermo intero col nuovo layout, scelta del monitor da parte di Chromium `--kiosk`. La regola `force` agisce solo alla prima mappatura: se un gioco sposta la finestra dopo, serve il riposizionamento del daemon (Fase 2).

## v2.5.1-dev.3

**Regola di sessione: nella sessione Openbox "Shell" si lavora col solo monitor principale; il secondario è spento.** Se in futuro si troverà un modo intelligente di usare il secondo monitor per la Dashboard, lo si riaccenderà.

### Problema

Con `SECONDARY="off"` in `shell-display.conf` il secondo monitor restava acceso (e ruotato di 180°), mentre i giochi si aprivano correttamente sul principale. Causa: nel file era presente anche `XRANDR_ARGS` (copiato dall'esempio), che nella dev.2 aveva la precedenza su tutto e faceva ignorare in silenzio `SECONDARY`; la rotazione di 180° applicata al secondo schermo è la prova che quella riga era attiva. Difetto di progetto: due impostazioni in conflitto non devono farsi ignorare a vicenda.

### Cosa cambia

- **`openbox/display.sh`**: `SECONDARY="off"` è ora il **default** e vale **anche con `XRANDR_ARGS`**: di quest'ultimo si conserva solo la parte dell'output principale (portato a `--primary --pos 0x0`, anche se la configurazione lo metteva altrove) e ogni altro output connesso viene spento con `--off`. Per tenere acceso il secondo monitor serve `SECONDARY="keep"` esplicito. Se `XRANDR_ARGS` non marca nessun output come `--primary`, usa `MAIN_OUTPUT` o sceglie lui (primario già attivo, altrimenti il più grande) e lo segnala nel log. La verifica finale controlla che resti attivo solo il principale (`VERIFY=OK solo il monitor principale …` oppure `ATTENZIONE: … risultano ancora attivi`).
- **`openbox/shell-display.conf.example`** riscritto: configurazione minima (`MAIN_OUTPUT`, `MAIN_MODE`, `SECONDARY="off"`); il layout a due monitor resta come esempio commentato per il caso `keep`.
- Versione `2.5.1-dev.3` in `package.json` e nel fallback di `src/App.tsx`. Nessun'altra modifica al codice.

### Cosa fare sul tuo sistema

Apri `~/.config/x-launcher/shell-display.conf`: con questa build anche la vecchia configurazione (con `XRANDR_ARGS` e `SECONDARY="off"`) funziona come previsto; per una configurazione pulita copia il nuovo `shell-display.conf.example`. Dopo l'avvio della sessione: `~/.local/share/x-launcher/display.log` deve contenere `VERIFY=OK solo il monitor principale (DP-4) è attivo`.

### Verifica fatta e non fatta

- **Fatto** (`xrandr --query` reale registrato dal log XFCE, modalità `--dry-run`): configurazione dell'utente (XRANDR_ARGS + SECONDARY="off") → `xrandr --output DP-4 --primary --mode 2560x1440 --rotate normal --pos 0x0 --output HDMI-0 --off`; stesso con `SECONDARY` non specificato; `SECONDARY="keep"` lascia il comando invariato; principale con `--pos 300x200` riportato a `0x0` con HDMI-0 spento; solo `MAIN_OUTPUT`; nessuna configurazione; `XRANDR_ARGS` senza `--primary`. Verifica finale distingue "solo il principale attivo" da "restano attivi altri output".
- **Non fatto (hardware reale)**: lo spegnimento effettivo di HDMI-0 con NVIDIA via `xrandr`, e il ridimensionamento dello schermo virtuale dopo lo spegnimento. Se `xrandr` rifiuta il comando, l'errore è in `display.log`.

## v2.5.1-dev.4

**Step 21, Fasi 2 e 3: gestore degli spazi (`spaces.py`) con indice dei client, slot su desktop e controller via evdev.** Motivo: nella sessione Openbox Select + D-pad non spostava nulla (con un gioco in primo piano restava in primo piano) e i giochi si aprivano sul desktop corrente, non in un loro spazio.

### Cosa fa

- **`spaces.py`** (nuovo, radice del progetto), ospitato da `tray.py` solo nella sessione Openbox. **Indice dei client**: ascolta `_NET_CLIENT_LIST` sulla root e classifica ogni finestra: Dashboard (Chromium `localhost` / titolo "X-Launcher HTPC"); gioco (finestra di uno scope `xlauncher-game-*`, PID da `_NET_WM_PID` con ripiego su X-Resource per i giochi in container come Proton, poi `/proc/<pid>/cgroup`; oppure classe `steam_app_<id>` per i giochi Steam via URI); launcher (scope `xlauncher-shared-launcher-*`, nessuno slot). Le finestre di servizio di Wine (IME, GDI+, minuscole, tipi menu/tooltip/dock) sono filtrate. L'indice non usa `/api/process-manager/list`, risultata vuota con un gioco vivo.
- **Spazi**: spazio 0 = Dashboard = desktop 1; ogni gioco prende uno slot libero (max 3) = desktop 2-4. Alla comparsa della finestra la sposta sul desktop dello slot (`_NET_WM_DESKTOP`) e ci passa (`_NET_CURRENT_DESKTOP` + `_NET_ACTIVE_WINDOW`). Alla chiusura, dopo 3 s senza finestre, libera lo slot e torna allo spazio precedente (o alla Dashboard). Il quarto gioco non ha slot e resta dov'è (la regola vera è della Fase 4).
- **Controller** (Fase 3), letto da evdev senza grab e senza dipendere da Chromium: **Select + D-pad destra** = spazio successivo, **Select + D-pad sinistra** = precedente (ciclico sugli spazi occupati), **Select + L1 + R1** = Dashboard. Codici verificati sul pad reale: `BTN_SELECT` 314, `BTN_TL`/`BTN_TR` 310/311, D-pad `ABS_HAT0X` ±1 (supportati anche `BTN_DPAD_LEFT/RIGHT`). Rileva collegamento e scollegamento (riscansione ogni 3 s). Debounce 250 ms.
- **Canale locale**: socket Unix `/run/user/<uid>/x-launcher-spaces.sock` (altrimenti `/tmp/x-launcher-spaces-<uid>.sock`); una riga JSON per richiesta. CLI: `python spaces.py ctl state|next|prev|dashboard|switch N` (exit 1 se rifiutato).
- **`tray.py`**: in modalità shell (`XDG_CURRENT_DESKTOP=Openbox` o `X_LAUNCHER_SHELL=1`) non crea l'icona di systray (non esiste), tiene gestione cursore e reset dell'idle e avvia `spaces.run_forever()`; l'import di pystray/PIL non è più fatale in quella modalità. **Fuori dalla modalità shell (XFCE) il comportamento è identico a prima.**
- **Backend**: `src/backend/spacesClient.ts` (nuovo) e `server.ts`: `GET /api/spaces` (stato; `active:false` fuori dalla sessione Shell), `POST /api/spaces/{next|prev|dashboard|switch}`. Le rotte `/api/system/input-wake` e `/api/system/input-focus-game` non fanno più nulla (`handledByDaemon:true`) quando il gestore risponde: le combo le gestisce il demone via evdev e ogni azione verrebbe altrimenti eseguita due volte (anche da Chromium). Senza gestore (XFCE, Kiosk gamescope) restano com'erano.
- **Openbox**: `openbox/rc.xml` con scorciatoie di tastiera di sviluppo (Ctrl+Alt+Destra/Sinistra/Su = successivo/precedente/Dashboard) e `openbox/spaces-ctl` (nuovo, wrapper che usa il venv del tray); `openbox/autostart` ne crea il symlink in `~/.config/openbox/spaces-ctl`.
- Versione `2.5.1-dev.4` in `package.json` e nel fallback di `src/App.tsx`.

### Installazione

Salva i file (nuovi: `spaces.py`, `openbox/spaces-ctl`, `src/backend/spacesClient.ts`; modificati: `tray.py`, `server.ts`, `openbox/rc.xml`, `openbox/autostart`, `package.json`, `src/App.tsx`, `CHANGELOG-9.md`, `X-Launcher-Roadmap.md`). Rifai la build del backend come di consueto e riavvia la sessione Openbox. Il log del gestore è nel log del tray (`[spaces] …`): all'avvio deve comparire "pronto: spazio corrente 0".

### Verifica fatta e non fatta

- **Fatto (Openbox reale su X virtuale, finestre finte)**: Dashboard riconosciuta; tre giochi → slot 1-3 = desktop 2-4 con cambio di spazio; finestra "Default IME" nello stesso scope ignorata; quarto gioco senza slot e lasciato dov'è; `next`/`prev` ciclici (0→1→2→3→0); `dashboard`; `switch` su spazio non occupato rifiutato; chiusura del gioco corrente → slot liberato dopo 3 s e ritorno allo spazio precedente; slot riutilizzato dal gioco successivo; controller simulato (FIFO con eventi evdev reali): Select + destra/sinistra cicla, D-pad senza Select non fa nulla, Select + L1 + R1 → Dashboard; scorciatoie di tastiera Ctrl+Alt+Destra/Sinistra/Su tramite Openbox; `tray.py` in modalità shell senza pystray. `tsc`: nessun errore nuovo (restano quelli già presenti: modulo `howlongtobeat` mancante nel mio ambiente di prova, e `ignoreDeprecations: "6.0"` rifiutato da TypeScript 5.8.3, aggirato con una configurazione temporanea).
- **Non fatto (hardware reale)**: PID/cgroup dei giochi Proton in container (c'è il ripiego X-Resource, non provato); spostamento tra desktop di finestre Wine a schermo intero; comportamento di Chromium con la Dashboard su un desktop non visibile; le rotte del backend a runtime (solo controllo dei tipi); il pad reale con le combo (i codici sono quelli misurati). Si può vedere un breve lampo della finestra del gioco sul desktop 1 prima che venga spostata, perché Openbox la mappa sul desktop corrente.
- **Non incluso**: indicatore dello spazio attivo nella Dashboard, congelamento dei giochi non attivi (Fase 4), regola sul quarto lancio.

## v2.5.1-dev.5

**Quale versione gira nella sessione Openbox, e controllo di sintassi dei sorgenti Python in build.** Domande dell'utente: la sessione lancia la copia in `/opt/x-launcher` (stabile 2.5.0) o la copia di sviluppo? E `spaces.py` viene "compilato" insieme a `tray.py` da `build.sh compile`?

### Quale versione gira (analisi del codice)

La sessione prende **parti da posti diversi**:

- **Dalla copia di sviluppo** (la cartella a cui puntano i symlink in `~/.config/openbox/`): `openbox/autostart`, `display.sh`, `spaces-ctl`, e, tramite `readlink -f`, `kiosk-launch.sh`, `tray.py`, `spaces.py` e `.venv-tray`.
- **Da `/opt/x-launcher`**: la Dashboard e il backend sulla porta 3000, cioè `xdash.service` (`WorkingDirectory=/opt/x-launcher`, `dist/server.cjs` installato), perché `kiosk-launch.sh` senza `--local-server` usa il daemon che trova già attivo e non avvia il proprio.

Conseguenza: con la dev.4 il gestore degli spazi (Python) girava dalla copia di sviluppo, mentre le rotte del backend (`/api/spaces`, combo rese inerti) **non erano attive**, perché il backend era quello stabile: con la Dashboard in primo piano le vecchie combo Select + ◄/► (`wmctrl`) potevano quindi sovrapporsi a quelle del demone.

### Cosa cambia

- **`openbox/autostart`**: se la cartella del progetto **non** è `/opt/x-launcher` (copia di sviluppo) passa `--local-server` a `kiosk-launch.sh`: avvia `dist/server.cjs` **di quella copia** sulla porta 3001 (con `?localdev=1`, indicatore in-app) e lascia in pace `xdash` sulla 3000. Serve aver compilato la copia di sviluppo (`./build.sh compile`). Forzatura da `~/.config/openbox/environment`: `X_LAUNCHER_LOCAL_SERVER=1` (sempre locale) o `=0` (mai). Dal log (`~/.local/share/x-launcher/openbox-session.log`) si legge la scelta fatta.
- **`build.sh`**: `compile_tray` non compilava nulla di Python — prepara solo il venv `.venv-tray` (pystray, pillow, python-xlib) —, e `tray.py` gira come script. Non serve un elenco di file: `spaces.py` viene importato da `tray.py` perché sta nella stessa cartella. Aggiunto, **senza mai bloccare la build**: controllo di sintassi di `tray.py` e `spaces.py` (nuova `check_tray_sources`, prima della preparazione del venv) e verifica che il venv importi `Xlib` e `spaces`. Un errore di sintassi emergeva prima solo a sessione avviata, nel log del tray.
- **`install.sh`**: `chmod +x` sugli script di `openbox/` in `/opt/x-launcher` (il glob esistente copre solo la radice). `rsync` copia già `spaces.py` e `openbox/` senza modifiche (esclude solo `.git` e `.env`).
- Versione `2.5.1-dev.5` in `package.json` e nel fallback di `src/App.tsx`.

### Verifica fatta e non fatta

- **Fatto**: `check_tray_sources` e `compile_tray` eseguiti in una cartella di prova con un venv reale: sorgenti validi → due righe di sintassi ok e "Tray pronta"; `spaces.py` con un errore di sintassi → avviso con le ultime righe dell'errore, e avviso aggiuntivo "spaces.py non importabile", senza bloccare. `autostart` provato con percorso con spazi e stub di `kiosk-launch.sh`: modalità automatica → `--local-server`; `X_LAUNCHER_LOCAL_SERVER=0` → nessun argomento; `=1` → `--local-server`.
- **Non fatto**: avvio reale del server locale sulla porta 3001 dalla sessione Openbox. Dopo `./build.sh compile` verificare in `openbox-session.log` la riga `kiosk-launch.sh: --local-server` e che la Dashboard mostri l'indicatore di sviluppo.

## v2.5.1-dev.6

**Gestore degli spazi: diagnostica completa e robustezza per applicazioni che ricreano la finestra (RetroArch).** Esito del test della sessione Shell (dev.5), riferito dall'utente: scorciatoia da tastiera e Select + D-pad dx/sx cambiano spazio; alla chiusura di un gioco si torna alla Dashboard; con Proton funziona meglio che con Wine diretto, che cambia spazio molto più lentamente e con carico maggiore (le ventole salgono finché non si è completato il passaggio). **RetroArch**: il gioco prova ad aprirsi, poi resta la Dashboard sul primo spazio, il processo è ancora attivo nel gestore dei processi ma non è visibile in nessuno spazio, e solo il kill sblocca le interazioni con la Dashboard.

### Ipotesi su RetroArch (non ancora confermate)

La Dashboard non risponde perché il gate `isFocusFrozen` del frontend la blocca finché il gioco tracciato è vivo (comportamento ereditato dalla sessione XFCE). Perché la finestra non si veda dipende da cosa fa il gestore degli spazi, e le cause candidate sono: la finestra viene distrutta e ricreata durante il caricamento del core (RetroArch lo fa) e dopo la tolleranza di 3 s lo slot veniva liberato, lasciando la finestra su un desktop non più raggiungibile col ciclo; il titolo viene impostato dopo la mappatura e la finestra, scartata come "rumore", non veniva mai rivalutata; la finestra non è riconducibile allo scope (Flatpak: scope `app-flatpak-…`, o PID non risolto); la finestra non viene mai gestita da Openbox (es. `video_monitor_index` di RetroArch che punta al secondo monitor, ora spento).

### Cosa cambia in `spaces.py`

- **Log completo**: ogni finestra che compare è registrata con classe, titolo, PID, scope, tipo, dimensioni e classificazione, **anche se ignorata**; le variazioni di classificazione e l'attesa prima di liberare uno slot sono registrate.
- **Nuovo comando** `ctl clients` (e `openbox/spaces-ctl clients`): l'indice completo con il desktop reale di ogni finestra, per vedere a colpo d'occhio cosa il gestore sa.
- **Tolleranza più lunga all'avvio**: nei primi 45 s dalla prima finestra di un gioco, se resta senza finestre lo slot viene liberato dopo 20 s invece di 3 s (la chiusura normale a gioco avviato da tempo resta a 3 s). Quando una finestra ricompare in uno scope rimasto senza finestre è considerata "prima" e porta al suo spazio.
- **Rivalutazione**: le finestre classificate "altro" o "rumore" vengono rivalutate per 30 s (titolo, classe e PID che arrivano dopo la mappatura).
- Variabili di taratura/test: `XL_SPACES_GRACE_S`, `XL_SPACES_LAUNCH_GRACE_S`, `XL_SPACES_LAUNCH_WINDOW_S`.
- Versione `2.5.1-dev.6` in `package.json` e nel fallback di `src/App.tsx`.

### Per diagnosticare RetroArch al prossimo lancio

1. `~/.local/share/x-launcher/tray.log`: le righe `[spaces] client …` intorno al lancio.
2. Con RetroArch "bloccato": `openbox/spaces-ctl clients` (da SSH o dalla tastiera).
3. Il log di lancio di RetroArch: `~/.local/share/x-launcher/game-logs/<id>-<timestamp>.log`.
4. `grep video_monitor_index ~/.config/retroarch/retroarch.cfg`.

### Verifica fatta e non fatta

- **Fatto (Openbox reale su X virtuale)**: finestra distrutta e ricreata 6 s dopo (oltre i 3 s normali, dentro la tolleranza di avvio) → slot mantenuto, nessun ritorno alla Dashboard, la nuova finestra porta al suo spazio; finestra con titolo vuoto poi impostato → rivalutata, slot assegnato e passaggio al suo desktop; chiusura normale a gioco "maturo" → slot liberato dopo 3 s e ritorno allo spazio precedente; `ctl clients` con desktop reale; log completo.
- **Non fatto**: RetroArch reale (nativo e Flatpak), cause non confermate. Non è stato toccato nulla riguardo alla lentezza di Wine (vedi roadmap: Fase 4) né al gate `isFocusFrozen`.

## Congelato — MILESTONE STABILE v2.6.6-Mercury

Ciclo chiuso qui (dev.1→dev.6), confermato funzionante dall'utente su hardware reale. Salto di minor version (2.5→2.6) a segnare la portata del ciclo e patch allineata all'ultima dev (6): lo **Step 21 — gestore degli spazi** è arrivato in fondo con una **seconda sessione standalone**, la sessione **"Shell"** (Xorg + Openbox, nessun desktop sotto), accanto alla sessione Kiosk gamescope della v2.5.0, che resta invariata. Dashboard e giochi vivono in spazi distinti (desktop 1 = Dashboard, 2-4 = giochi, fino a 3 contemporanei) e si naviga con Select + D-pad sx/dx del controller.

**Perché una sessione nuova invece di estendere la Kiosk — diagnosi su hardware reale, mai per assunzione.** Con due script di sola diagnostica (`scripts/diag-gamespace.sh`, `scripts/diag-gamescope-focus.sh`) su XFCE e su Kiosk: in gamescope standalone il window manager dell'Xwayland è gamescope stesso (nessun secondo WM possibile); **ignora tutte le richieste esterne di focus** (raise, `XSetInputFocus`, `_NET_ACTIVE_WINDOW`, `wmctrl`, messaggi client) e le proprietà `GAMESCOPECTRL_BASELAYER_*` non hanno effetto; una finestra nuova prende il focus e alla chiusura torna la precedente; e **ogni escursione del focus fuori dal gioco lasciava lo schermo nero** con la sessione inutilizzabile (riavvio di lightdm da TTY) — causa mai isolata (Wine/DXVK o gamescope), quindi nessuna architettura costruibile sopra. Altri esiti: Xephyr scartato (rende in software, llvmpipe), reparenting grezzo scartato; il controller è leggibile da evdev senza root (Select = `BTN_SELECT`, D-pad = `ABS_HAT0X`) e il gioco lo riceve a prescindere dal focus; il freeze del cgroup (`systemctl --user freeze`) funziona meccanicamente.

**Sessione Shell (dev.1→dev.3)**: `openbox/rc.xml` (4 desktop con nome, nessuna decorazione/menu/barra, nessun binding di mouse; unica rete di sicurezza Ctrl+Alt+Q = esci) e `openbox/autostart` (ricava la cartella del progetto dal symlink, imposta `XDG_CURRENT_DESKTOP=Openbox` perché `kiosk-launch.sh` prenda il ramo "sopra un desktop" invece del vecchio `gamescope -e`, esce da Openbox quando la Dashboard si chiude). **Multimonitor**: nella sessione nuda nessuno applicava il layout che XFCE gestiva (primario, posizione, rotazione, scala) e i giochi si aprivano sul secondo schermo; `openbox/display.sh` applica un layout deterministico a ogni avvio e — **regola di sessione** — si lavora col **solo monitor principale**, gli altri spenti (`SECONDARY="off"` di default, valido anche con `XRANDR_ARGS`; `--capture` esporta il layout attuale da XFCE); `rc.xml` forza inoltre ogni finestra sul monitor 1 alla mappatura. Un difetto di progetto (precedenza di `XRANDR_ARGS` che faceva ignorare in silenzio `SECONDARY`) è stato trovato dal log reale dell'utente e corretto nella dev.3.

**Gestore degli spazi (dev.4, dev.6)**: `spaces.py`, ospitato da `tray.py` in modalità shell (niente icona di systray; XFCE e Kiosk invariati). **Indice dei client** da `_NET_CLIENT_LIST` + PID + cgroup (ripiego X-Resource per Proton in container, classe `steam_app_*` per Steam via URI), senza usare `/api/process-manager/list`; filtro delle finestre di servizio di Wine; **slot** 1-3 = desktop 2-4; passaggio automatico allo spazio del gioco appena aperto; alla chiusura torna allo spazio precedente (o alla Dashboard). **Controller** letto da evdev, senza grab e indipendente da Chromium: Select + D-pad dx/sx = spazio successivo/precedente (ciclico), Select + L1 + R1 = Dashboard; riconosce collegamento e scollegamento del pad. Socket Unix locale (`/run/user/<uid>/x-launcher-spaces.sock`) con CLI `spaces-ctl state|next|prev|dashboard|switch N|clients`. Backend: `GET /api/spaces`, `POST /api/spaces/{next|prev|dashboard|switch}`, e le vecchie rotte delle combo (`input-wake`, `input-focus-game`) rese inerti quando il gestore risponde per non eseguire ogni azione due volte. Dal test su hardware reale: **RetroArch** non creava il suo spazio — il gestore ora logga ogni finestra (anche se ignorata), tollera la ricreazione della finestra durante l'avvio, rivaluta le finestre con titolo impostato dopo la mappatura, e `ctl clients` mostra l'indice con il desktop reale; confermato risolto dall'utente.

**Strumenti di sviluppo e installazione (dev.5, milestone)**: nella sessione Shell, per una copia di sviluppo (cartella diversa da `/opt/x-launcher`) `autostart` passa `--local-server` a `kiosk-launch.sh` (backend della copia sulla porta 3001, `xdash` di sistema intatto; `X_LAUNCHER_LOCAL_SERVER=0|1` per forzare); `build.sh compile` ora controlla la sintassi di `tray.py` e `spaces.py` e che il venv importi `Xlib` e `spaces` (avvisi, mai blocco): i sorgenti Python non si compilano, girano come script. **`install.sh`**: installa in `/opt` anche `spaces.py` e `openbox/` (rsync, `chmod +x` degli script), crea il link `/usr/local/bin/x-launcher-spaces` e prepara per l'**utente reale** (SUDO_USER, mai root) le cartelle e i symlink di una sessione Openbox pulita — `~/.config/openbox/{rc.xml,autostart,spaces-ctl}` → `/opt/x-launcher/openbox/…`, `~/.config/x-launcher/` con `shell-display.conf.example`, `~/.local/share/x-launcher/` —, con backup dei file esistenti, symlink verso una copia di sviluppo lasciati invariati (salvo `--relink-openbox`), dipendenze mancanti segnalate, opzione `--no-openbox`; la disinstallazione rimuove i link di sistema e solo i symlink utente che puntano a `/opt`, mai file normali, backup o `shell-display.conf`.

**Confermato dall'utente su hardware reale**: la sessione Openbox si avvia con la Dashboard a schermo intero; due giochi (uno Wine, uno Proton) si aprono sul monitor principale, ciascuno nel proprio spazio; secondo monitor spento; cambio di spazio con la scorciatoia da tastiera e con Select + D-pad; alla chiusura di un gioco si torna alla Dashboard; RetroArch (classic console) crea il suo spazio e si naviga con il controller.

### Resta aperto (non incluso in questa milestone)

- **Consumo di risorse con Wine diretto** (cambio di spazio più lento, ventole che salgono, meglio con Proton): causa non misurata; candidato principale il lavoro del gioco mentre la finestra viene nascosta/mostrata → **Fase 4**, congelamento dei giochi non attivi (da validare: effetti su audio/rete, input arretrato al risveglio).
- **Gate `isFocusFrozen` della Dashboard** (input bloccato finché il gioco tracciato è vivo): in modalità shell va rilassato per poter lanciare un secondo gioco mentre il primo è in un altro spazio; regola sul quarto lancio (blocco con notifica); indicatore dello spazio attivo nella Dashboard; giochi Steam via URI nella sessione Shell (non provati).
- **Fase 5** — gestione di sistema senza desktop (spegnimento via logind, audio, risoluzione `xrandr`) e watchdog se il WM cade.
- **Bug da indagare**: `GET /api/process-manager/list` ha risposto `[]` con un gioco vivo (`listActive()` elimina dal registry le voci per cui `is-active` non risponde "active"); perché in gamescope l'escursione del focus lasciava lo schermo nero.
- **Non provato dal vivo**: il nuovo `install.sh` con `sudo` reale (verificato in sandbox con home e cartella di installazione finte, installazione pulita, seconda esecuzione, file e symlink preesistenti, `--relink-openbox`, disinstallazione).
