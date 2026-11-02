# CHANGELOG-11 — da v2.7.2-dev.1 (milestone v3.0.1-Mars)

Prosegue da CHANGELOG-10.md (chiuso su MILESTONE STABILE v2.7.1-Mercury). Chiuso a sua volta su MILESTONE STABILE v3.0.1-Mars (vedi in fondo); il ciclo successivo è in CHANGELOG-12.md.

Voci in ordine, la prima del ciclo è `## v2.7.2-dev.1`. Ad ogni consegna reale si incrementa `-dev.N` in `package.json` E nel fallback letterale di `src/App.tsx`, oltre alla voce corrispondente qui.

Punti aperti ereditati dalla milestone (vedi in fondo a CHANGELOG-10.md): chiusura dal Process Manager di uno scope congelato, misura del consumo con Wine, regola sul quarto lancio, indicatore del congelamento nella Dashboard, Fase 5 (gestione di sistema senza desktop), `GET /api/process-manager/list` vuoto con un gioco vivo.

## v2.7.2-dev.1

**Overlay degli spazi e dei servizi (Step 21, Fase 6): una "app" Python a schermo intero sopra qualunque gioco.** Richiesta: invece di cambiare spazio direttamente, Select + D-pad destra/sinistra apre una schermata con gli spazi aperti ("X-Launcher", "Titolo del gioco") da scegliere; in alto a destra i servizi (Bluetooth, rete LAN/Wi-Fi, volume − e +) navigabili dal controller. Scelta grafica dell'utente: **variante B, schermo intero**. L'idea di una seconda finestra Chromium è stata scartata a favore di un overlay Python richiamato come app in primo piano, attivabile/disattivabile al lancio.

### Come funziona

- **`overlay.py`** (nuovo, in radice): finestra X **override-redirect** a schermo intero sul monitor principale, disegnata con Pillow (già nel venv del tray) e inviata con python-xlib. È ospitata da `spaces.py` (stesso processo: ha il pad da evdev, i desktop e il freezer) e importata solo se serve. *Perché override-redirect*: un test in Openbox con la `rc.xml` del progetto ha mostrato che una finestra gestita dal WM che non ha il focus (sempre in primo piano, dock, notifica…) resta SOTTO un gioco a schermo intero con il focus; sta sopra solo una finestra che prende il focus oppure una non gestita. Niente compositor, quindi nessuna trasparenza: l'overlay è opaco, stile console.
- **Apertura**: Select + D-pad destra/sinistra (gli stessi tasti di prima) → l'overlay si apre con selezionato lo spazio successivo/precedente, come farebbe il cambio diretto. **Select + L1 + R1 (Dashboard) resta diretto** e funziona anche con l'overlay aperto (lo chiude passando per la Dashboard): è la via di fuga se l'overlay desse problemi.
- **Dentro l'overlay (senza tenere premuto Select)**: D-pad o levetta sinistra spostano la selezione; **A** conferma lo spazio (o attiva il servizio con il focus); **B** annulla e chiude (il gioco riprende). **Su** porta il focus ai servizi (bluetooth → Wi-Fi → LAN → − → volume → +, con sinistra/destra o levetta), **giù** torna agli spazi. Su − e + A regola il volume di 5 punti, **tenuto premuto si ripete**; su "volume" A attiva/disattiva il muto. La levetta ripete da ferma dopo 0,4 s. Chiusura automatica dopo 60 s senza input (`X_LAUNCHER_OVERLAY_IDLE_S`).
- **Mentre è aperto il gioco corrente viene congelato subito** (cgroup freezer, lo stesso del congelamento di dev.3; rispetta `spaces-nofreeze.conf`) e alla chiusura riprende (o viene scongelato quello scelto). Inoltre il **pad viene preso in esclusiva** (`EVIOCGRAB`) finché l'overlay è aperto, così nessun gioco riceve tasti o eventi accodati — vale anche per i giochi non congelabili (Steam via URI, quarto gioco). La presa parte solo a tasti tutti rilasciati e finisce solo a tasti tutti rilasciati (max 1 s di attesa), per non lasciare un tasto "incollato" nel gioco. Disattivabile con `X_LAUNCHER_OVERLAY_GRAB=0`.
- **Servizi**: il **volume** funziona (`wpctl`, in ripiego `pactl`; legge, scrive in modo coalescente, cache aggiornata subito). **Bluetooth, Wi-Fi e LAN mostrano solo lo stato** (`bluetoothctl show`, `nmcli`, in ripiego `/sys/class/net`) con pallino verde/grigio; premendo A compare "Solo stato". Sono già **predisposti come pulsanti**: `X_LAUNCHER_OVERLAY_TOGGLES=bt,wifi,lan` (in `~/.config/openbox/environment`) li rende attivabili (`bluetoothctl power`, `nmcli radio wifi`, `nmcli device connect/disconnect`); il Bluetooth non si spegne se il controller in uso è Bluetooth. **Questa parte attivabile non è provata su hardware: lasciala spenta finché non la decidi.** Uno strumento mancante rende il servizio "Non disponibile" e non selezionabile nel senso utile; l'overlay degli spazi funziona comunque. Il primo uso di ogni comando scrive l'output grezzo nel log (`services: first run of …`).
- **Testi** in italiano e inglese (lingua da `X_LAUNCHER_LANG`, `LC_ALL`, `LANG`); log di debug solo in inglese.

### Opzione di lancio

- **`kiosk-launch.sh --spaces-overlay` / `--no-spaces-overlay`** (stesso schema di `--spaces-mode`): esporta `X_LAUNCHER_SPACES_OVERLAY=1|0` a `tray.py`/`spaces.py`. Senza l'opzione l'overlay è spento e Select + D-pad cambia spazio direttamente, **esattamente come nella 2.7.1-Mercury**.
- **`openbox/autostart`** passa `--spaces-overlay` per default (solo se `kiosk-launch.sh` la conosce, come per `--spaces-mode`; segnala se manca `overlay.py`); `X_LAUNCHER_SPACES_OVERLAY=0` in `~/.config/openbox/environment` lo spegne. L'esito è in `openbox-session.log`.
- **A sessione avviata**: `x-launcher-spaces overlay on|off|open|close|status|key <left|right|up|down|a|b>` (`state` mostra anche lo stato dell'overlay).

### Rete di sicurezza (non rompere la stabilità)

- Se `overlay.py` manca, Pillow/python-xlib mancano, `DISPLAY` non c'è, o la finestra non compare entro **1,5 s**, Select + D-pad ripiega sul **cambio diretto** (log `overlay: … falling back to direct switch`).
- `build.sh compile` controlla la sintassi di `overlay.py` e che il venv possa importarlo (avviso, mai blocco).
- Alla chiusura del demone (anche SIGTERM) l'overlay viene tolto, il pad rilasciato e i giochi scongelati. Un `x-launcher-spaces next|prev|dashboard|switch N` chiude prima l'overlay.
- `spaces.py`: `Freezer.freeze_now` (congelamento immediato) e `thaw_sync` che ora prende il lock delle operazioni PRIMA del controllo (un congelamento ancora in corso non lascia più un gioco congelato dopo un annulla rapido).
- Il resto è invariato: nessuna modifica a `App.tsx` oltre alla versione, nessun nuovo desktop in `rc.xml`.

### Come provarlo

1. Copia `overlay.py` (**nuovo, nella radice del progetto accanto a `spaces.py`**), `spaces.py`, `kiosk-launch.sh`, `openbox/autostart`, `build.sh`, `package.json`, `src/App.tsx`; `./build.sh compile`; riavvia la sessione Openbox.
2. Nel log del tray: `overlay degli spazi (X_LAUNCHER_SPACES_OVERLAY): ATTIVO`, `overlay: ready`, `services: audio=wpctl bluetoothctl=True nmcli=True …`. In `openbox-session.log`: `kiosk-launch.sh: … --spaces-mode --spaces-overlay`.
3. Con un gioco aperto: Select + D-pad destra → overlay; il gioco deve fermarsi (audio compreso) e non reagire ai tasti; **A** su uno spazio → cambio; **B** → il gioco riprende senza input spuri.
4. Su → servizi; A su − / + cambia il volume (confrontalo con `wpctl get-volume @DEFAULT_AUDIO_SINK@`); tienilo premuto.
5. **Verifica nel log i codici dei tasti** (`overlay: pad key code=…`): A=304 e B=305 sono i codici standard; se il tuo pad li riporta diversi (o D-pad su/giù come asse), dimmelo con il log.
6. Per tornare al cambio diretto: `x-launcher-spaces overlay off` oppure `X_LAUNCHER_SPACES_OVERLAY=0` e riavvio.

### Verifica fatta e non fatta

- **Fatto** (Xvfb + Openbox reali, pad finto via FIFO, `systemctl`, `wpctl`, `bluetoothctl`, `nmcli` simulati, immagine del fotogramma esaminata): apertura con Select + D-pad con il gioco corrente congelato; finestra effettivamente sopra le finestre dei giochi (pixel letto da X); spostamento e conferma con A (cambio di spazio, gioco scelto scongelato); B annulla e scongela il gioco corrente; Dashboard come spazio corrente; navigazione servizi con D-pad su/giù/sinistra/destra; volume − (62→52), ripetizione tenendo premuto A, + dopo spostamento con la levetta; chiusura per inattività con scongelamento; `overlay off` → cambio diretto; `overlay on/open/close` da `ctl`; SIGTERM con overlay aperto (finestra tolta, tutto scongelato). Logica del pad con un gestore finto: apertura, presa differita a tasti rilasciati, rilascio differito, ripetizione della levetta, `X_LAUNCHER_OVERLAY_GRAB=0`. Ripiego quando la finestra non si mostra o si blocca (entro 1,5 s). Opzioni di `kiosk-launch.sh` e protezioni di `autostart` (vecchio/nuovo script, ambiente a 0).
- **Non fatto (hardware reale)**: Chromium/Dashboard e giochi veri sotto l'overlay con NVIDIA (la finestra non gestita sta sopra in Openbox, ma un gioco a schermo intero esclusivo andrebbe visto dal vivo); `EVIOCGRAB` sul pad reale (nei test il pad è una FIFO: l'`ioctl` è simulato); codici dei tasti del tuo controller; `wpctl`/`bluetoothctl`/`nmcli` veri (formati attesi, letti con output simulato — il primo uso li registra nel log); font (usa `fc-match`; senza font TrueType ripiega su quello di Pillow); interruttori Bluetooth/Wi-Fi/LAN (spenti di default).

### Aperti

- Copertine dei giochi al posto delle iniziali; scelta di una rete Wi-Fi da elenco (password col controller); eventuale "chiudi il gioco" dall'overlay; indicatore del congelamento nella Dashboard; regola sul quarto lancio (in pausa per scelta dell'utente).

## v2.7.2-dev.2

**Overlay degli spazi: lingua, dimensioni e rifiniture della legenda** (feedback sulla dev.1).

- **Doppia lingua, la stessa della Dashboard.** `overlay.py` legge `language=` da `~/.local/share/x-launcher/app.conf` (il file che la Dashboard riscrive quando cambi lingua nelle Impostazioni) **a ogni apertura**: il cambio vale subito, senza riavviare nulla. Se `app.conf` non ha la lingua si ripiega su `X_LAUNCHER_LANG`/`LANG`. Le stringhe sono in `public/locales/<lingua>/overlay.json` (nuovi file `it` e `en`, nella stessa cartella delle traduzioni della Dashboard, cercati anche in `dist/locales/`; `X_LAUNCHER_LOCALES` per un percorso diverso): **una nuova lingua si aggiunge mettendo il suo `overlay.json`**, senza toccare il codice. Le chiavi mancanti ripiegano sull'italiano; italiano e inglese restano anche incorporati nel codice, quindi l'overlay funziona pure se la cartella non c'è. Restano da fare lato Dashboard (non toccato qui): `appConfig.ts` accetta ancora solo `it`/`en` come valori di `language`.
- **Servizi e volume più piccoli**: tessere 172×64 → 138×50, pulsanti −/+ 64 → 50, valore del volume 84 → 68, icone 28 → 22, font ridotti (titoli 16 → 13, sottotitoli 13 → 11, percentuale 24 → 20), titolo "Spazi" 32 → 30.
- **Legenda in basso**: i cerchi **A** e **B** usano gli stessi colori della barra inferiore della Dashboard (verde `green-500` e rosso `red-500`, lettera nera), stessa forma e dimensione proporzionata; le etichette sono in maiuscolo come nella Dashboard. Lettere, frecce ed etichette sono ora **centrate in verticale** rispetto al cerchio (prima risultavano spostate verso l'alto); lo stesso vale per l'etichetta "Dove sei ora" nella sua pillola.
- **Rimossa la ripetizione "A · Apri"** nel riquadro dello spazio selezionato: la legenda in basso basta.

**Da provare**: cambia la lingua dalle Impostazioni della Dashboard e riapri l'overlay (Select + D-pad): testi e legenda devono seguire. File modificati/nuovi: `overlay.py`, `public/locales/it/overlay.json` (nuovo), `public/locales/en/overlay.json` (nuovo), `package.json`, `src/App.tsx` (solo versione), `CHANGELOG-11.md`.

## v2.7.2-dev.3

**Pausa tra la scelta dello spazio e lo scongelamento del gioco** (segnalato: alcuni giochi leggevano subito il tasto premuto per chiudere l'overlay).

- Dopo **A** (cambio spazio) o **B** (annulla) l'overlay sparisce e il gioco scelto passa in primo piano, ma resta **congelato e con il pad ancora in esclusiva per 0,6 s**; poi viene scongelato e solo dopo il pad torna al gioco. Così il tasto usato nell'overlay (e gli eventi accodati) non arrivano mai al gioco. Vale sia per il cambio di spazio sia per l'annulla.
- Regolabile con `X_LAUNCHER_OVERLAY_THAW_DELAY_S` in `~/.config/openbox/environment` (secondi, 0–5; `0` = scongelamento immediato come nella dev.2). Se riapri l'overlay durante l'attesa, l'attesa viene annullata (l'overlay torna padrone di congelamento e pad). Select + L1 + R1 (Dashboard) usa lo stesso meccanismo.
- `spaces.py`: `switch_space(..., thaw_delay=)`, `SpacesManager.overlay_release_later()`, `overlay_scope_of()`.
- **Fix collaterale**: se `EVIOCGRAB` fallisce (dispositivo che non lo permette), prima si ritentava ogni 50 ms riempiendo il log; ora si prova **una volta per apertura** e si registra un solo messaggio.
- Verificato (Xvfb + Openbox, pad finto): dopo A il gioco scelto è congelato a +0,15 s e in esecuzione a +1,35 s; stessa cosa dopo B; l'altro gioco resta congelato.

## v2.7.2-dev.4

**Copertine dei giochi nell'overlay degli spazi** (al posto delle iniziali).

- **Cache locale (backend)**: nuovo `src/backend/coverCache.ts`. Dopo ogni arricchimento dei metadati (e dopo un cambio di `scrapeTitle`) copia `coverImage` (poster) e `previewImage` (hero/banner) del gioco in `~/.local/share/x-launcher/covers/<id>.cover` e `<id>.hero`, con un `<id>.json` che ricorda l'URL di origine: si riscarica solo se l'URL cambia (un refresh con tutto già in cache costa pochi ms). `<id>` è l'id del gioco con la stessa sanitizzazione del nome dello scope systemd (`[^A-Za-z0-9_.-]` → `-`). Due download alla volta, timeout 15 s, massimo 8 MB, solo file che iniziano come immagine (JPEG/PNG/WebP/GIF/BMP); i segnaposto Unsplash vengono ignorati, i percorsi locali assoluti copiati; un errore non blocca nulla e la copia precedente resta. Il riempimento dei giochi già in libreria avviene da solo al primo refresh dopo l'aggiornamento (log `[COVERS] cache aggiornata: N/M giochi…` in `daemon.log`). La Dashboard continua a usare gli URL del DB: non cambia nulla lato interfaccia.
- **Nessuna dipendenza nuova**: il backend salva i file così come arrivano; ritaglio e ridimensionamento li fa `overlay.py` con Pillow (già nel venv) e li tiene in memoria (ultime 12 immagini).
- **spaces.py**: dallo scope `xlauncher-game-<id>-<ts>` ricava i file e li passa all'overlay (`game_cover_files()`); `X_LAUNCHER_COVERS_DIR` per una cartella diversa.
- **overlay.py**, modalità di visualizzazione (`X_LAUNCHER_OVERLAY_ART`): `auto` (default) = **hero** ritagliato al centro, se manca il **poster** ritagliato tenendo la parte alta (dove stanno logo e personaggi); `hero` / `cover` per forzarne una; `off` per tornare alle iniziali. Senza file (gioco mai arricchito, Steam via URI senza copertina, download fallito) restano le iniziali colorate. Angoli arrotondati, nessun costo percepibile (a 2560×1440: ~47 ms al primo disegno, ~23 ms dopo).
- Il riquadro della **Dashboard** (spazio 0) resta il logo "XL".

**Da provare**: aggiorna e compila (`./build.sh compile`), riavvia il demone, attendi il primo refresh della libreria (`[COVERS]` nel log) e controlla `ls ~/.local/share/x-launcher/covers/`; poi apri un gioco e Select + D-pad. Se la copertina non compare, il log del tray dice se `overlay.py` ha trovato i file (`game_cover_files`).

**Verifica**: cache provata contro un server HTTP locale (poster JPEG, hero PNG, file non immagine scartato, segnaposto Unsplash ignorato, seconda esecuzione senza nuovi download, id con caratteri speciali); risoluzione scope → file e disegno (hero, poster ritagliato, iniziali di ripiego) con immagini finte. **Non verificato**: download reali da SteamGridDB/Steam/Epic sulla tua rete e l'aspetto con le copertine vere.

## v2.7.2-dev.5

**Titolo dei giochi nell'overlay dal DB invece che dal nome della finestra** (segnalato: i giochi RetroArch non mostravano il titolo).

- Prima il titolo era `_NET_WM_NAME`/`WM_NAME` della finestra X: per RetroArch (e ScummVM, DOSBox…) è generico o dinamico ("RetroArch", nome del core, frame rate…) e non identifica il gioco.
- Ora `coverCache.ts` scrive anche `"title"` (titolo mostrato in libreria, quindi con l'eventuale override `scrapeTitle`) nel `<id>.json` accanto alle copertine, **anche quando il download dell'immagine fallisce**; `spaces.py` (`game_db_title()`, usata da `overlay_entries()`) lo legge dallo scope `xlauncher-game-<id>-<ts>` e lo preferisce al nome della finestra, che resta il ripiego (poi "Game N"). Il titolo compare dopo il primo refresh della libreria successivo all'aggiornamento (come le copertine).
- File: `src/backend/coverCache.ts`, `spaces.py`.
- Verificato: scrittura del titolo con id speciali e lettura dallo scope con file finti; ripiego a `None` per scope sconosciuti. Non verificato con RetroArch reale.

## Congelato — MILESTONE STABILE v3.0.1-Mars

Ciclo chiuso qui (dev.1→dev.5), confermato funzionante dall'utente su hardware reale (sessione Openbox "Shell", controller reale). **Salto di versione maggiore (2→3) con nuova serie di nome: Mars**, a segnare che la sessione Shell non è più solo "spazi isolati e congelati" ma ha una **schermata di gestione a schermo intero** richiamabile sopra qualunque gioco. Patch a 1 per scelta dell'utente (non allineata all'ultima dev).

**Overlay degli spazi e dei servizi (`overlay.py`, nuovo)**: Select + D-pad destra/sinistra apre una schermata a schermo intero (variante B dei mockup: carte grandi al centro, servizi in alto a destra, legenda dei tasti in basso) invece di cambiare spazio direttamente. D-pad o levetta spostano la selezione senza tenere premuto Select; **A** conferma, **B** annulla; **su** porta ai servizi (Bluetooth, Wi-Fi, LAN, volume −/valore/+), **giù** torna agli spazi; il **volume funziona** (`wpctl`, ripiego `pactl`; A sul − o + cambia di 5 punti, tenuto premuto si ripete, A sul valore attiva/disattiva il muto); Bluetooth, Wi-Fi e LAN mostrano lo stato e sono già predisposti come pulsanti (`X_LAUNCHER_OVERLAY_TOGGLES=bt,wifi,lan`, spenti di default, non provati su hardware). È una finestra X **override-redirect** disegnata con Pillow e ospitata da `spaces.py` (stesso processo del pad evdev, del freezer e delle azioni X): in Openbox senza compositor una finestra gestita senza focus resta sotto un gioco a schermo intero, una non gestita sta sopra. Select + L1 + R1 (Dashboard) resta diretto e chiude anche l'overlay. Chiusura automatica dopo 60 s senza input (`X_LAUNCHER_OVERLAY_IDLE_S`).

**Stabilità dei giochi mentre è aperto**: il gioco corrente viene **congelato subito** (cgroup freezer) e il pad preso **in esclusiva** (`EVIOCGRAB`, solo a tasti rilasciati e rilasciato solo a tasti rilasciati: nessun tasto incollato); dopo A/B il gioco scelto passa in primo piano ma resta congelato e il pad in esclusiva per **0,6 s** (`X_LAUNCHER_OVERLAY_THAW_DELAY_S`, 0 = subito), così non legge il tasto usato nell'overlay. Se `overlay.py` manca, mancano Pillow/python-xlib o la finestra non compare entro 1,5 s, Select + D-pad ripiega sul cambio diretto. Corretto un ritentativo ogni 50 ms di `EVIOCGRAB` quando falliva (log pieno); `thaw_sync` prende il lock delle operazioni prima del controllo (un congelamento in corso non lascia un gioco congelato dopo un annulla rapido).

**Opzione di lancio**: `kiosk-launch.sh --spaces-overlay` / `--no-spaces-overlay` (`X_LAUNCHER_SPACES_OVERLAY=1|0`), passata di default da `openbox/autostart` (`X_LAUNCHER_SPACES_OVERLAY=0` in `~/.config/openbox/environment` per tornare al cambio diretto della 2.7.1; a sessione avviata `x-launcher-spaces overlay on|off|open|close|status|key K`). Protezioni contro versioni miste dei file come per `--spaces-mode`.

**Lingua e aspetto**: testi in italiano e inglese, **la stessa lingua della Dashboard** (letta da `app.conf` a ogni apertura; stringhe in `public/locales/<lingua>/overlay.json`, nuove lingue = nuovo file, chiavi mancanti sull'italiano); widget dei servizi più piccoli; legenda con i colori dei cerchi A (verde) e B (rosso) della barra inferiore della Dashboard e testi centrati.

**Copertine e titoli** (`src/backend/coverCache.ts`, nuovo): il backend copia cover (poster) e hero (banner) dei giochi in `~/.local/share/x-launcher/covers/<id>.cover|.hero` (id sanitizzato come il nome dello scope; si riscarica solo se l'URL cambia; due download alla volta, 8 MB massimo, solo immagini vere; nessuna dipendenza nuova), insieme a `<id>.json` con URL di origine e **titolo del gioco dal DB**. L'overlay mostra l'hero ritagliato al centro (`auto`; in mancanza il poster ritagliato dalla parte alta; `X_LAUNCHER_OVERLAY_ART=auto|hero|cover|off`) e, per il titolo, il DB al posto del nome della finestra (RetroArch e simili hanno titoli di finestra generici); senza file restano le iniziali.

**Installazione (milestone)**: `install.sh` ora, se un symlink in `~/.config/openbox` punta a una copia di sviluppo, **chiede** (in terminale) se ripuntarlo a `/opt` invece di lasciarlo e basta (senza terminale resta com'è, con `--relink-openbox` si ripunta senza domande); controlla che il venv di `/opt` possa importare `overlay.py`; riepiloga i nuovi comandi. `/usr/local/bin/x-launcher` e `/usr/local/bin/x-launcher-spaces` sono già ripuntati a `/opt` ad ogni installazione (`ln -sf`). `upload-github.sh` esclude sempre le cartelle del codice compilato e dei venv (`dist/`, `dist-server/`, `node_modules/`, `.venv-tray/`, `__pycache__/`), le toglie dal tracciamento se erano già state versionate e verifica prima del commit che non ce ne sia traccia in staging.

**Approvato dall'utente dopo l'uso su hardware reale**: overlay (apertura con Select + D-pad, scelta dello spazio, layout e legenda), lingua allineata alla Dashboard, pausa prima dello scongelamento, copertine e titoli dei giochi (anche RetroArch). **Non confermati esplicitamente** (provati solo in sandbox): regolazione del volume e lettura reale di `wpctl`/`bluetoothctl`/`nmcli`, presa esclusiva reale del pad (`EVIOCGRAB`) con giochi non congelabili, interruttori BT/Wi-Fi/LAN (spenti).

### Resta aperto (non incluso in questa milestone)

- **Interruttori Bluetooth / Wi-Fi / LAN** nell'overlay (predisposti dietro `X_LAUNCHER_OVERLAY_TOGGLES`, mai provati su hardware); scelta di una rete Wi-Fi da elenco; "chiudi il gioco" dall'overlay; indicatore del congelamento nella Dashboard.
- Chiusura dal Process Manager di uno scope congelato (confermata funzionante dall'utente per la chiusura regolare; da rivedere se serve un `thaw` prima del SIGTERM), **regola sul quarto lancio** (in pausa per scelta dell'utente), giochi Steam via URI nella sessione Shell, giochi online congelati a lungo (rete).
- **Fase 5** — gestione di sistema senza desktop (spegnimento via logind, audio, risoluzione `xrandr`) e watchdog se il WM cade.
- **Bug da indagare**: `GET /api/process-manager/list` che risponde `[]` con un gioco vivo.
- Idea scartata per ora: screenshot dell'ultimo fotogramma come anteprima (inaffidabile con NVIDIA e giochi a schermo intero esclusivo).

