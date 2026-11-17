# CHANGELOG-19 — da v3.2.28-Mars

Prosegue da CHANGELOG-18.md (chiuso su MILESTONE STABILE v3.2.28-Mars).

Voci in ordine: la prima del ciclo sarà `## v3.2.29-dev.1` (o la patch che sceglie l'utente). Ad ogni consegna reale si incrementa `-dev.N` in `package.json` E nel fallback letterale di `src/App.tsx`, oltre alla voce corrispondente qui. Regola fissa: l'installer ha `--devel` accanto a `--relink-openbox`; tenerlo presente in ogni release.

Punti aperti ereditati dalla milestone: vedi «Resta aperto» nella voce della milestone in CHANGELOG-18.md.

---

## v3.2.29-dev.1 — i tre punti aperti della milestone: runner delle card Web Stream, chiusura dei giochi in background, data di installazione

Scelta dell'utente: chiudere i punti 1, 2 e 3 del «Resta aperto» di v3.2.28-Mars prima delle novità del ciclo.

### 1. Le card Web Stream non perdono più il runner

**Problema**: il selettore del runner di Luna è nascosto (dev.10), ma `PATCH /api/games/:id/config` accettava ancora qualunque valore e lo scriveva nel DB; la sync non lo ripristinava (l'upsert non tocca mai il runner, scelta dell'utente per i giochi normali). Una sola richiesta rendeva la card inutilizzabile.

- **`src/backend/gameManager.ts`** — `sanitizeConfigForRunner()`, chiamata da `updateGameConfig()` prima di scrivere:
  - card Web Stream: modificabili solo indirizzo del servizio (`executablePath`, solo `https://` non vuoto: un campo svuotato o un `http://` non sostituiscono più l'indirizzo valido), argomenti di lancio, titolo per lo scraping e il runner solo se resta «Web Stream». Tutto il resto (runner diverso, launcher condiviso, prefix, core, `steamAppId`, classe della finestra…) viene ignorato, con una riga `[DAEMON] Config for <id>: ignored …` nel log;
  - giochi normali: «Web Stream» non è assegnabile (il runner accetta solo un URL `https://` come eseguibile: il lancio fallirebbe sempre);
  - se nulla della richiesta è applicabile la risposta è `success: false` (prima era sempre `true`).
- **`src/backend/db.ts`** — `upsertGame()`: se il plugin restituisce una card con runner «Web Stream» (oggi solo `amazon-luna`) e nel DB il runner è diverso, la sync lo riporta a «Web Stream» (log `[DB] upsertGame "Amazon Luna": runner restored to Web Stream.`). Ripara anche una card già rovinata prima di questa versione. Il runner scelto dall'utente per i giochi normali resta intoccabile come prima.

### 2. La chiusura di un gioco in background fa tutto ciò che fa quella dell'ultimo lanciato

**Problema** (dev.7): con due giochi aperti negli spazi, il primo passa in `backgroundSessions` e alla sua chiusura si sommava solo il tempo di gioco. Mancavano la pulizia del plugin del launcher (`onLauncherProcessClosed`), la chiusura dello scope con il launcher condiviso (EA app/Ubisoft Connect restavano accesi) e la richiesta «ha funzionato?» per i giochi non verificati.

- **`src/backend/gameManager.ts`**:
  - il blocco di chiusura del polling è estratto **senza modifiche di logica** in `handleSessionClosed(sessione, background)`, usato sia per l'ultimo gioco lanciato sia per le sessioni in background: attesa se ci sono ancora processi reali in caricamento, soglia di uscita rapida (×3 per i giochi con launcher condiviso), tempo di gioco, `onLauncherProcessClosed`, chiusura dello scope con il launcher condiviso (o notifica «tieni aperto/chiudi ora» senza scope), richiesta di validazione;
  - differenze solo per una sessione in background: un'uscita rapida non genera la notifica di «avvio fallito» (il gioco era vivo quando è stato scavalcato dal lancio successivo, quindi era partito) e non conta tempo di gioco; lo stato (lista e screensaver) lo gestisce `pollBackgroundSessions()`;
  - `pollBackgroundSessions()` asincrona: una chiusura rimandata («ancora in caricamento») lascia la sessione nella lista; un set `closingSessions` evita che un giro del polling (ogni 4 s) gestisca due volte una chiusura ancora in corso; la lista si rilegge dopo gli `await` (un lancio nel frattempo può averne aggiunta una);
  - per l'ultimo gioco lanciato il comportamento è identico a prima.

Nessuna protezione per due giochi che usano lo stesso launcher condiviso nello stesso momento: secondo l'utente non succede (Ubisoft Connect non lo permette; con EA app il secondo gioco parte in un secondo wineserver che resta invisibile finché il primo non si chiude).

### 3. La data di installazione non si perde per un errore di uno store

**Problema** (dev.2): una sync che segnalava per errore un gioco come disinstallato (es. legendary in timeout) azzerava `installed_at`; alla sync successiva il gioco riprendeva la data del giorno. Valeva anche per la fonte `event`, che perdeva la data esatta dell'installazione fatta dalla Dashboard.

- **`src/backend/db.ts`**:
  - colonna nuova `games.uninstalled_at` (migrazione semplice, nessun azzeramento);
  - una **sync** che segnala il gioco disinstallato conserva data e fonte e annota in `uninstalled_at` il momento (solo alla transizione installato → disinstallato; le sync successive non lo spostano);
  - se il gioco torna installato entro **1 ora** (`INSTALL_DATE_RESTORE_WINDOW_MS`, 12 giri della sync di 5 minuti) riprende data e fonte di prima (log `[DB] upsertGame "<titolo>": installed again N min after a sync reported it uninstalled — install date kept …`); oltre, è una reinstallazione vera e la data si ricalcola con le regole di dev.2;
  - una disinstallazione dalla **Dashboard** (`updateGameStatus`) azzera tutto subito, come prima: lì lo stato è certo;
  - `rowToGame()` espone `installedAt` solo per i giochi installati: un gioco non installato con la data conservata non entra nell'ordinamento «Data installazione».

### Altri file

- Versione 3.2.29-dev.1 in `package.json` e nel fallback di `src/App.tsx`. Nessuna modifica a frontend, `spaces.py`, `overlay.py`, installer.

**Verificato**: `tsc --noEmit` (anche `server.ts`) con gli stessi 7 errori preesistenti; `vite build` riuscito. Prove al banco:
- **DB temporaneo creato con il codice di v3.2.28-Mars**, poi aperto con la dev.1: colonna aggiunta, date esistenti conservate; falso disinstallato → data conservata e non esposta, `uninstalled_at` fermo alle sync successive; ritorno entro l'ora → data e fonte `first-seen` riprese; ritorno dopo 61 min → data ricalcolata; disinstallazione dalla Dashboard → azzerata; fonte `event` → conservata dopo un falso disinstallato; runner di Luna cambiato nel DB → ripristinato dalla sync; runner Proton scelto per un gioco normale → non toccato.
- **`GameManager` reale** su DB temporaneo: Luna rifiuta runner Wine, indirizzo vuoto e `http://`, ignora `requiresLauncher` ma salva argomenti, indirizzo `https://` e titolo per lo scraping; un gioco normale rifiuta «Web Stream» e accetta gli altri runner. Due processi al posto dei giochi: A in background, chiuso dopo 10 min → 0,167 h sommate e richiesta di validazione, B (ultimo lanciato) non toccato; uscita rapida in background → nessuna notifica, nessun tempo; gioco EA app in background con scope → chiamata la chiusura dello scope del launcher e richiesta di validazione; ultimo lanciato con uscita rapida → «avvio fallito» come prima.

**Da provare su hardware reale** (sessione Openbox):
1. Gioco con launcher condiviso (EA app o Ubisoft) nello spazio 1, poi un gioco qualsiasi nello spazio 2; chiudere il primo → log `(background session) closed after N min — play time added` seguito da `catena di lancio terminata per intero`; il launcher condiviso non resta in esecuzione (Gestore dei processi). Se il gioco non è verificato, tornando alla Dashboard compare la richiesta «ha funzionato?».
2. Opzioni di Luna: svuotare l'indirizzo del servizio → alla riapertura delle opzioni torna quello di prima; la card continua a partire.
3. Data di installazione: nessuna differenza visibile nell'uso normale. Controllo diretto dopo qualche sync: `sqlite3 ~/.local/share/x-launcher/x-launcher.db "SELECT title, is_installed, installed_at, installed_at_source, uninstalled_at FROM games WHERE uninstalled_at IS NOT NULL"`.

---

## v3.2.29-dev.2 — opzione di lancio `--keep-maximized`

Richiesta dell'utente: Dead Space 2 (EA app, ricetta URI) parte regolarmente, resta a schermo intero qualche secondo e poi si riduce a icona; nella sessione Openbox standalone non c'è modo di riportarlo su.

### Diagnosi (log di `spaces.py` dell'utente, 14 novembre 2026)

- Primo lancio: finestra `Dead Space™ 2` 2560×1440 alle 15:52:06; alle 15:52:34 compaiono nello stesso scope due finestre nuove di EA app (`EADesktop` 163×148, `EA` 635×287), con ogni probabilità notifiche del launcher. Openbox dà il focus alle finestre nuove: un gioco in fullscreen esclusivo sotto Wine che perde il focus si iconifica. Negli altri lanci del log quelle finestre non compaiono: la causa non è dimostrata in ogni caso.
- Osservazione dell'utente: tornando allo spazio del gioco dall'overlay il gioco torna a schermo intero. Nel log (16:02:27–28) `switch_space` riattiva la finestra con `_NET_ACTIVE_WINDOW`, Openbox la de-iconifica; la finestra viene rimappata e ricompare a 2560×1440. La riattivazione è quindi il rimedio, già collaudato.

### Modifiche

- **`src/backend/windowRules.ts`** (nuovo) — `~/.local/share/x-launcher/window-rules.json` (`{"keepMaximized": {"<id>": true}}`), con l'id sanitizzato come il nome dello scope (stessa regola di `processManager.sanitize` e `coverCache.ts`). `setKeepMaximized(id, on)`: scrittura atomica (temporaneo + rename, permessi 600), nessuna riscrittura se non cambia nulla, errori solo nel log (un lancio non si blocca mai per questo). Un file e non una variabile d'ambiente: con un launcher condiviso già aperto il gioco eredita l'ambiente del launcher, non quello del lancio.
- **`src/backend/gameManager.ts`** — `--keep-maximized` negli argomenti di lancio: tolto prima di passare gli argomenti al gioco (come `--no-splash`) e annotato in `window-rules.json` a ogni lancio (aggiunto o tolto).
- **`spaces.py`**:
  - `keep_maximized(scope)` legge il file (solo quando cambia, mtime) e riconosce il gioco dal nome dello scope `xlauncher-game-<id>-<ts>`;
  - `window_iconic()`: `_NET_WM_STATE_HIDDEN` (EWMH, quello di Openbox) o `WM_STATE` = IconicState (ICCCM);
  - `_keep_maximized_tick()`, a ogni giro del ciclo principale (almeno una volta al secondo): se lo spazio corrente è quello di un gioco (1–2) con l'opzione, nessun cambio di spazio è in corso, l'overlay è chiuso e la **finestra principale** del gioco (la più grande dello scope: mai le finestre di EA app) è iconificata da almeno 0,5 s (`XL_SPACES_KEEP_MAX_DELAY_S`), la riattiva con la stessa chiamata del cambio di spazio. Al massimo 3 riattivazioni in 10 s, poi pausa di 60 s con una riga nel log (dall'overlay si può sempre tornare al gioco);
  - log: `keep-maximized: finestra 0x… di <scope> ridotta a icona…` e `… riattivata (n/3 in 10 s)`.
- **`INSTALL.md`** — `--keep-maximized` nella tabella delle opzioni di lancio, accanto a `--no-splash`.
- Versione 3.2.29-dev.2 in `package.json` e nel fallback di `src/App.tsx`.

Nessun effetto sui giochi senza l'opzione, sullo spazio della Dashboard, su Steam (spazio 3) e fuori dalla sessione Openbox (senza `spaces.py` il file viene scritto ma nessuno lo legge).

**Verificato**: `tsc --noEmit` (anche `server.ts`) con gli stessi 7 errori preesistenti; `py_compile spaces.py`. Prove su Xvfb con finestre X vere e gli scope del log dell'utente (stato iconificato impostato a mano, riattivazione intercettata): senza opzione nessuna azione; con l'opzione attesa del ritardo, poi riattivata la finestra principale e non la popup di EA app; `WM_STATE` Iconic riconosciuto; nessuna azione con overlay aperto, nello spazio della Dashboard e durante un cambio di spazio; 3 riattivazioni su 5 iconificazioni ravvicinate, pausa di 60 s rispettata e poi ripresa; opzione tolta al lancio successivo → nessuna azione; file non valido → nessuna regola, nessun errore. `windowRules.ts`: chiavi sanitizzate identiche a quelle lette da `spaces.py` (anche con caratteri estranei nell'id), opzione tolta solo per quel gioco, file rovinato ricreato. Non provabile qui: la de-iconificazione vera di Openbox (comportamento già visto nel log dell'utente col cambio di spazio).

**Da provare su hardware reale** (sessione Openbox, nuovo login per `spaces.py`): argomenti di Dead Space 2 `origin2://… --no-splash --keep-maximized`; quando il gioco si riduce a icona torna a schermo intero entro circa un secondo; nel log `grep '\[spaces\] .*keep-maximized' ~/.local/share/x-launcher/tray.log`; `cat ~/.local/share/x-launcher/window-rules.json` mostra l'id di Dead Space 2.

**Confermato su hardware reale (14 novembre 2026)**: v3.2.29-dev.2 — nella sessione standalone Dead Space 2 con `--keep-maximized` viene riportato subito a schermo intero e così resta per tutta la partita.

---

## v3.2.29-dev.3 — screenshot dei giochi (punto 2, step 2a)

Primo step della funzione multimedia (screenshot, clip, sezione Multimedia), con il piano concordato con l'utente il 14 novembre 2026:
- **Ambito**: sessione Openbox con gli spazi, solo spazi dei giochi 1 e 2. Esclusi la Dashboard e lo spazio 3 (Steam ha screenshot e registrazioni suoi).
- **Scorciatoie**: Select + D-pad **su** = screenshot (questo step); Select + D-pad **giù** = avvio/arresto della clip (step 2b, oggi nessuna azione).
- **Formato**: JPEG qualità 85 (decisione dell'utente, regolabile).
- **Cartelle**: `~/.local/share/x-launcher/multimedia/<Gioco>/Screenshot` e `…/Clip`.
- Step successivi: **2b** clip (scorciatoia, pulsante Rec nell'overlay con X al centro e Rec a destra ed etichette sotto i pulsanti, 120 s, cache di 3 in `/tmp`, pausa al congelamento, pallino REC 48×48 in alto a destra con testo in sovrimpressione, «Registrazione conclusa» per 3 s); **2c** sezione Multimedia nel quick-menu (miniature, lettore, salvataggio Nativa/FHD/HD, eliminazione, «Apri Multimedia» nelle notifiche).

### Verifiche sull'HTPC prima del codice (`scripts/diag-media-capture.sh`, log dell'utente del 14/11/2026, RetroArch a schermo intero)

- `gpu-screen-recorder` 6.1.7: cattura della **finestra** del gioco (`-w <id>`) in JPEG/PNG a 2560×1440 in ~340–425 ms; `import` (ImageMagick 7.1.2) della stessa finestra in 89 ms; monitor DP-4 in 606 ms. Immagini corrette (controllate anche a vista dall'utente).
- Clip della sola finestra: H.264 NVENC 2560×1440 a ~60 fps, audio Opus, chiusa regolarmente con `SIGINT`.
- **Pausa/ripresa con `SIGUSR2` confermata** («Paused»/«Unpaused» nel log, clip di 9 s di processo con 3 s di pausa → 5,3 s): servirà nello step 2b per la pausa al congelamento.

### Modifiche

- **`spaces.py`**:
  - Select + D-pad su (come asse `ABS_HAT0Y` o come tasto `BTN_DPAD_UP`, stesse regole di Select + sinistra/destra): `SpacesManager.screenshot()`. Ignorato fuori dagli spazi 1–2, durante un cambio di spazio, con l'overlay aperto e a meno di 1 s dal precedente; Select + giù riservato. Il D-pad verticale conta anche per «tutti i tasti rilasciati» della presa esclusiva dell'overlay.
  - Cattura in un thread (il pad resta libero): la sola finestra principale del gioco in PNG con `gpu-screen-recorder`, ripiego su `import`, in `/run/user/<uid>/x-launcher-media/` (in RAM, 0700, rifiutata se non è una cartella dell'utente). Poi `POST /api/media/screenshot` al demone col token, come il pulsante X dell'overlay (`daemon_post`). Se il demone non risponde il PNG resta nella cartella di appoggio, con una riga nel log.
- **`src/backend/mediaLibrary.ts`** (nuovo):
  - `gameMediaFolder()`: cartella `multimedia/<titolo>` legata all'id del gioco da `.x-launcher.json` (cambiando il titolo si usa la stessa); omonimo di un altro gioco → `<titolo> [<id>]`; titolo ripulito da separatori, caratteri di controllo e punti iniziali (resta sempre dentro `multimedia/`).
  - `ingestScreenshot()`: accetta solo un nome `shot-<ms>-<hex>.png` della cartella di appoggio, file regolare (mai un link), chiave del gioco valida; conversione in JPEG con ImageMagick (`magick`, ripiego `convert`) alla qualità `X_LAUNCHER_SCREENSHOT_QUALITY` (predefinita 85) in `Screenshot/AAAA-MM-GG_hh-mm-ss.jpg` (ora locale, `-2`, `-3`… nello stesso secondo); senza ImageMagick si archivia il PNG così com'è. Gioco non in libreria → cartella col nome della chiave.
- **`server.ts`** — `POST /api/media/screenshot` (autenticazione come le altre rotte).
- **`src/backend/notificationEngine.ts`** — evento `media-screenshot`: **una notifica per gioco**, «Nuovi screenshot — <gioco>» con il conteggio nel corpo (IT/EN dalla lingua della Dashboard); finché l'utente non la chiude ogni nuovo screenshot la sostituisce (la precedente viene archiviata, la Dashboard sostituisce già le notifiche in attesa con stesso gioco e titolo), chiusa si riparte da 1. Esclusa dalla deduplicazione a 30 s per titolo, che la scarterebbe. `getStatus()` nello store. Per ora solo la chiusura; «Apri Multimedia» arriva con lo step 2c.
- **`scripts/diag-media-capture.sh`** (nuovo) — la diagnostica usata sopra: sessione X presa dal tray, finestra del gioco dal gestore degli spazi, screenshot con i tre metodi, clip normale e clip con pausa.
- **`INSTALL.md`** (dipendenze: `imagemagick`, `gpu-screen-recorder` da AUR; percorsi), **`.env.example`** (`X_LAUNCHER_SCREENSHOT_QUALITY`).
- Versione 3.2.29-dev.3 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc --noEmit` (anche `server.ts`) con gli stessi 7 errori preesistenti; `npm run build` riuscito (frontend e `dist/server.cjs`); `py_compile spaces.py`.
- Demone (17 prove su DB e cartelle temporanee, immagini PNG vere): JPEG 85 nella cartella giusta col nome dall'ora locale, PNG tolto dall'appoggio, `.x-launcher.json` con l'id, suffisso `-2` nello stesso secondo; seconda notifica col conteggio 2 e prima archiviata, dopo la chiusura si riparte da 1; titolo cambiato → stessa cartella; omonimi separati; titolo `../../etc/passwd` → cartella `etc passwd` dentro `multimedia/`; rifiutati nome con percorso, chiave non valida, file inesistente, link simbolico; gioco non in libreria → cartella con la chiave; senza ImageMagick → PNG archiviato.
- `spaces.py` su Xvfb con una finestra vera, `import` (qui `gpu-screen-recorder` non c'è) e un demone HTTP finto: Select + su sia come asse sia come tasto → PNG della sola finestra (640×360) in una cartella 0700, richiesta con chiave dallo scope (`classic-final_fight-5ef3bc94`) e token; ignorati: su senza Select, secondo scatto entro 1 s, Select + giù, Dashboard, Steam, cambio di spazio in corso, overlay aperto; demone irraggiungibile → PNG conservato.

**Da provare su hardware reale** (sessione Openbox, nuovo login per `spaces.py`; `sudo pacman -S imagemagick` se manca, `gpu-screen-recorder` è già installato):
1. Gioco nello spazio 1 → Select + D-pad su: nel log `grep '\[spaces\] screenshot' ~/.local/share/x-launcher/tray.log` la cattura (con `gpu-screen-recorder`) e il percorso salvato; il file in `~/.local/share/x-launcher/multimedia/<gioco>/Screenshot/`.
2. Nessun impatto percepibile sul gioco durante lo scatto (cattura di ~0,4 s, senza blocchi del pad).
3. Due o tre screenshot, poi ritorno alla Dashboard → una sola notifica «Nuovi screenshot — <gioco>» col conteggio; chiusa, lo screenshot successivo riparte da 1.
4. Nello spazio della Dashboard e in quello di Steam Select + su non fa nulla.

---

**Confermato su hardware reale (14 novembre 2026)**: v3.2.29-dev.3 — screenshot di Bioshock 2 salvati in `~/.local/share/x-launcher/multimedia/Bioshock 2/Screenshot/` (5 JPEG), notifica nella Dashboard; nessuna cattura nella Dashboard e in Steam.

## v3.2.29-dev.4 — sovrimpressione «Screenshot acquisito»

Richiesta dell'utente dopo la conferma della dev.3: come per le clip, anche lo screenshot ha un messaggio in sovrimpressione: icona 48×48 e testo «Screenshot acquisito» per 3 s a ogni scatto, IT/EN dalla lingua della Dashboard.

### Modifiche

- **`overlay.py`** — classe `Osd`, il componente di sovrimpressione che userà anche lo step 2b (pallino REC, «Registrazione conclusa»):
  - finestra **override-redirect** in alto a destra del monitor principale (32 px dai bordi), come l'overlay: sopra il gioco a schermo intero, **mai il focus** (un gioco come Dead Space 2 si ridurrebbe a icona), nessun input (forma di input vuota e angoli arrotondati con l'estensione SHAPE, se presente); rialzata ogni 0,5 s finché è visibile; thread e connessione X propri;
  - riquadro nel colore dei pannelli del tema con bordo; sopra l'icona di 48×48 px (fotocamera disegnata con antialias; `rec` = pallino rosso per lo step 2b), sotto il testo centrato;
  - testo come i sottotitoli di Avatar e Gestore dei processi: **monospaziato** (`font-mono` della Dashboard = `monospace` di fontconfig; `X_LAUNCHER_OSD_FONT` per cambiarlo), 10 px sulla tela 1920×1080 scalati all'altezza dello schermo (13 px a 1440);
  - tema e lingua letti da `app.conf` a ogni messaggio (seguono la Dashboard senza riavvii); `flash(tipo, testo, secondi)` e `hide(wait)`.
- **`spaces.py`** — `osd()`: sovrimpressione creata al primo uso e indipendente dall'overlay degli spazi (se `overlay.py` manca o non si carica, gli screenshot funzionano senza messaggio). Nello screenshot: messaggio eventualmente ancora a schermo nascosto **prima** della cattura (con `import` finirebbe nell'immagine), «Screenshot acquisito» per 3 s **dopo** una cattura riuscita; nessun messaggio se la cattura fallisce.
- **`public/locales/{it,en}/overlay.json`** — `osd_screenshot` («Screenshot acquisito» / «Screenshot captured»).
- **`INSTALL.md`** — nota sul messaggio e su `X_LAUNCHER_OSD_FONT`.
- Versione 3.2.29-dev.4 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `py_compile` di `overlay.py` e `spaces.py`. Su Xvfb 2560×1440 con finestre X vere: testo IT con tema scuro ed EN con tema chiaro (immagini controllate a vista), corpo del testo 13 px; finestra override-redirect visibile in alto a destra (x=2347, y=32, 181×92), senza focus; sparita da sola allo scadere; `hide(wait=True)` la toglie subito; nessun errore (SHAPE applicata). Flusso dello screenshot: nascondi → cattura → messaggio; con la cattura fallita nessun messaggio.

**Da provare su hardware reale** (sessione Openbox, nuovo login per `spaces.py`): Select + D-pad su in un gioco → icona e «Screenshot acquisito» in alto a destra per 3 s, il gioco resta in primo piano (anche Dead Space 2); due scatti ravvicinati → il secondo JPEG non contiene il messaggio del primo; con la Dashboard in inglese il testo è «Screenshot captured».

---

**Confermato su hardware reale (14 novembre 2026)**: v3.2.29-dev.4 — il messaggio «Screenshot acquisito» compare correttamente.

## v3.2.29-dev.5 — screenshot col tasto Share del controller

Segnalazione dell'utente: Select + D-pad è una combinazione che molti giochi usano; quando il gioco la intercetta la scorciatoia non funziona (e non funzionerebbe nemmeno quella delle clip). Proposta dell'utente: il tasto **Share** del controller Xbox (fra Select e Start), che sul desktop si comporta come F12.

### Verifica sull'HTPC (`scripts/diag-pad-keys.py`, log dell'utente del 14/11/2026)

- Driver `hid_xpadneo` v0.10.4. Il controller crea quattro device con lo stesso Uniq (`a8:8c:3e:23:86:e4`): il pad (`event21`, l'unico con `js0`, quello che `spaces.py` leggeva), «Consumer Control», «**Keyboard**» (`event23`), «Mouse».
- Share arriva come **`KEY_F12` dal device «Keyboard»**, con pressione e rilascio distinti (breve 0,16 s, tenuto 2,01 s). Select, Start e Xbox arrivano dal pad.

### Modifiche (`spaces.py`)

- **`list_pads()`** — oltre ai pad (handler `jsN`), i device «tastiera» (`kbd`, nome con «Keyboard») **dello stesso controller** (stesso Uniq, o stesso Phys se l'Uniq manca), marcati `share`: letti solo per il tasto Share. Le tastiere vere (es. il ricevitore Logitech) e gli altri device del controller restano esclusi. Elenco dei device leggibile da file per i test (`XL_SPACES_TEST_INPUT_DEVICES`).
- **`PadListener`**:
  - dai device `share` conta solo `KEY_F12`; dal pad `KEY_RECORD` (Share col driver `xpad`, via cavo); tutto il resto dei device `share` è ignorato;
  - **Share premuto e rilasciato prima di 1 s = screenshot**; **tenuto 1 s** (`X_LAUNCHER_SHARE_HOLD_S`, 0,4–3 s) = azione «tenuto», scattata una volta sola mentre il tasto è ancora premuto e riservata all'avvio/arresto della clip (step 2b: per ora solo una riga nel log); rilasciato dopo il «tenuto» non fa screenshot; autorepeat ignorato; nulla con l'overlay aperto;
  - **Select + D-pad su non fa più screenshot**: Select + su/giù tornano liberi per i giochi (lo stato del D-pad verticale conta ancora per «tutti i tasti rilasciati» della presa esclusiva);
  - la presa esclusiva dell'overlay (`EVIOCGRAB`) non tocca mai il device di Share.
- `SpacesManager.share_hold()` — segnaposto per lo step 2b.
- **`scripts/diag-pad-keys.py`** (nuovo) — la diagnostica usata sopra: driver, device del controller, tasti con device di provenienza e durata.
- **`INSTALL.md`** — Share al posto di Select + D-pad su; `X_LAUNCHER_SHARE_HOLD_S`.
- Versione 3.2.29-dev.5 in `package.json` e nel fallback di `src/App.tsx`.

Lo **step 2b** cambia di conseguenza: la clip si avvia e si ferma **tenendo premuto Share** (oltre che dal pulsante Rec dell'overlay); il testo sotto il pallino REC diventa «Tieni premuto Share per interrompere la registrazione» (da confermare con l'utente).

**Limite**: il controller non viene preso in esclusiva, quindi il gioco riceve comunque F12 dal device «Keyboard» (come già prima di questa versione). Nella sessione Openbox anche la Dashboard, nello spazio 0, riceve F12 se Share viene premuto lì.

**Verificato**: `py_compile spaces.py`. Elenco dei device ricostruito dal log dell'utente: pad = solo `event21`, Share = solo `event23` (esclusi ricevitore Logitech, Designer Mouse, Consumer Control, Mouse del controller). Pressioni simulate: Share 0,16 s → screenshot; tenuto 1,25 s → «tenuto» una volta sola, nessuno screenshot al rilascio; autorepeat senza doppioni; altri tasti del device tastiera e F12 dal pad ignorati; `KEY_RECORD` dal pad → screenshot; overlay aperto → nulla; Select + D-pad su → nulla; Select + D-pad destra → cambio di spazio come prima; presa esclusiva solo del pad; `_rescan` apre, marca e poi toglie il device Share.

**Da provare su hardware reale** (sessione Openbox, nuovo login per `spaces.py`): nel log `grep 'solo il tasto Share' ~/.local/share/x-launcher/tray.log` (device del tasto riconosciuto); in un gioco Share breve → screenshot e messaggio; Share tenuto 1 s → nessuno screenshot, riga `Share tenuto premuto` nel log; Select + D-pad su arriva di nuovo al gioco.

---

**Confermato su hardware reale (14 novembre 2026)**: v3.2.29-dev.5 — screenshot col tasto Share.

## v3.2.29-dev.6 — clip dei giochi (punto 2, step 2b)

Decisioni dell'utente: clip avviata **tenendo premuto Share** (o col pulsante **Rec** dell'overlay) e fermata **premendo Share** (testo in sovrimpressione «Premi Share per interrompere la registrazione»), dal Rec o da sola dopo 120 s; alla risoluzione corrente; al massimo 3 clip temporanee in `/tmp` (la quarta cancella la più vecchia, nessuna sopravvive allo spegnimento); avvio dall'overlay solo allo scongelamento dello spazio; nell'overlay la X di chiusura al centro, Rec a destra, etichette sotto ai pulsanti; pallino REC 48×48 in alto a destra per tutta la registrazione, poi «Registrazione conclusa» per 3 s; IT/EN dalla Dashboard. Steam (spazio 3) escluso: ha le sue registrazioni.

### `spaces.py`

- **`Recorder`** (una clip alla volta): `gpu-screen-recorder -w <finestra del gioco> -c mp4 -k h264 -f 60 -a default_output` (stessi parametri provati sull'HTPC il 14/11/2026), segnali riportati ai valori normali nel processo figlio (il tray può ignorare SIGINT). Clip in `/tmp/x-launcher-<uid>/clips/` — due cartelle create 0700 e rifiutate se non sono nostre o sono link (`/tmp` è condivisa). Arresto con SIGINT (MP4 completato; dopo 15 s `kill`), poi accanto all'MP4 il `.json` con chiave del gioco, scope, titolo, inizio, durata effettiva, risoluzione della finestra, motivo; `prune_clips(3)`; `POST /api/media/clip` al demone; log del registratore cancellato (riportato nel log in caso di errore).
- **`SpacesManager._rec_sync()`** — chiamata a ogni giro del ciclo principale e dagli agganci (cambio di spazio prima del congelamento, apertura dell'overlay prima del congelamento, chiusura dell'overlay dopo lo scongelamento):
  - avvio di una clip richiesta solo con lo spazio **davanti, fermo, senza overlay e scongelato**;
  - **pausa** (`SIGUSR2`) appena una di queste condizioni cade, **ripresa** quando tornano tutte: la clip non contiene la Dashboard, l'overlay o il gioco fermo; il pallino REC sparisce in pausa e torna alla ripresa;
  - arresto a **120 s di registrazione effettiva** (`X_LAUNCHER_CLIP_MAX_S`, le pause non contano), alla chiusura del gioco, se il registratore esce da solo, all'uscita di `spaces.py` (MP4 comunque valido).
- **Tasto Share**: tenuto 1 s → avvia la clip nello spazio corrente (o la ferma); premuto brevemente → ferma la clip in corso, altrimenti screenshot. Una richiesta su un altro spazio chiude prima la clip in corso.
- Sovrimpressione: `osd.show("rec", …)` per tutta la registrazione, `hide()` in pausa, `flash(None, "osd_rec_done")` a clip salvata.

### `overlay.py`

- **Carta selezionata**: riga dei pulsanti centrata in basso — X rossa di chiusura al centro, **Rec** a destra negli spazi dei giochi (non Steam); etichette («Chiudi», «Conferma chiusura», «Registra», «Interrompi · m:ss», «In pausa · m:ss») **sotto** ai pulsanti. Rec: pallino rosso su fondo scuro; in registrazione pulsante rosso con il quadrato di stop.
- **Carte piccole**: niente pulsanti (finivano sopra il titolo; per raggiungerli la carta viene selezionata e si ingrandisce); se lo spazio sta registrando, «● REC» accanto a «SPAZIO n».
- **Navigazione**: giù dalla carta → X; sinistra/destra percorrono un'unica riga ciclica X1, Rec1, X2, Rec2, X Steam…; su torna alla carta. **A su Rec**: con una clip in corso in quello spazio la ferma (l'overlay resta aperto), altrimenti la richiede e porta allo spazio (parte a gioco scongelato). Suggerimenti dei tasti per il Rec.
- **`Osd`**: `show()` (messaggio fisso fino a `hide()`), messaggio di solo testo senza icona; pallino rosso «rec».
- Testi IT/EN: `rec`, `rec_stop`, `rec_paused`, `rec_na`, `osd_rec_hint`, `osd_rec_done` (anche in `public/locales/{it,en}/overlay.json`).

### Demone

- **`src/backend/mediaLibrary.ts`** — `clipsTmpDir()`, `listTmpClips()` (solo clip con `.json` valido, file regolari, cartella nostra; dalla più recente; servirà alla sezione Multimedia), `announceClip()`: nome e chiave verificati contro il `.json`, notifica col numero di clip temporanee di quel gioco.
- **`server.ts`** — `POST /api/media/clip`.
- **`src/backend/notificationEngine.ts`** — evento `media-clip`: «Clip da rivedere — <gioco>», «N clip temporanee in attesa. Le clip non salvate si cancellano allo spegnimento; la cache ne tiene al massimo 3.»; una sola notifica per gioco, sostituita a ogni clip.
- **`INSTALL.md`**, **`.env.example`** (`X_LAUNCHER_CLIP_MAX_S`, `X_LAUNCHER_SHARE_HOLD_S`). Versione 3.2.29-dev.6 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc --noEmit` (anche `server.ts`) con gli stessi 7 errori preesistenti; `npm run build` riuscito; `py_compile` di `spaces.py` e `overlay.py`.
- Registratore su Xvfb con una finestra vera, un `gpu-screen-recorder` finto che annota i segnali e un demone HTTP finto (30 prove): avvio con Share tenuto (solo la finestra, H.264 60 fps, audio di sistema) e pallino REC; pausa al cambio di spazio con pallino nascosto e tempo fermo; resta in pausa finché il gioco è congelato; ripresa allo scongelamento; pausa/ripresa con l'overlay; Share breve ferma senza screenshot; MP4 + `.json` (chiave, durata, 800×450) nella cache 0700, demone avvisato, «Registrazione conclusa»; arresto alla durata massima; 5 clip → restano le 3 più recenti; gioco chiuso → clip chiusa; registratore uscito da solo → stato ripulito; nessuna clip in Steam e nella Dashboard; Rec dall'overlay in attesa finché l'overlay è aperto e il gioco congelato, poi parte; Rec sulla clip in corso la ferma; cartella delle clip che è un link → rifiutata.
- Demone (10 prove): notifica «Clip da rivedere — Dead Space™ 2» col conteggio 1 e poi 2 (la precedente archiviata), un'altra per un altro gioco; elenco dalla più recente coi metadati, clip senza `.json` esclusa; rifiutati chiave diversa, nome con percorso, clip inesistente, link simbolico.
- Overlay disegnato a 1920×1080 (controllato a vista): X selezionata, Rec selezionato, clip in pausa («Paused · 0:42» sotto lo stop), conferma di chiusura di Steam senza Rec, «● REC» su una carta piccola; navigazione X1 → Rec1 → X2 → Rec2 → X Steam → X1.

**Da provare su hardware reale** (sessione Openbox, ricompilare e nuovo login per `spaces.py`/`overlay.py`):
1. In un gioco, Share tenuto 1 s → pallino rosso e testo in alto a destra; Share → «Registrazione conclusa», MP4 in `/tmp/x-launcher-$(id -u)/clips/` (riproducibile, solo il gioco, con l'audio), notifica «Clip da rivedere» nella Dashboard. Log: `grep '\[spaces\] clip' ~/.local/share/x-launcher/tray.log`.
2. Durante una clip: overlay aperto e chiuso, poi passaggio alla Dashboard e ritorno → la clip non contiene né l'overlay né la Dashboard; il pallino sparisce e torna.
3. Overlay → giù → destra sul Rec di un gioco → A → si torna al gioco e la registrazione parte; di nuovo nell'overlay, A sul Rec («Interrompi») la ferma.
4. Quattro clip → in `/tmp/x-launcher-$(id -u)/clips/` restano le ultime 3.
5. Nessun calo di fotogrammi percepibile durante la registrazione (la cattura della sola finestra costa qualcosa solo mentre si registra).

---

**Confermato su hardware reale (14 novembre 2026)**: v3.2.29-dev.6 — screenshot e clip funzionano. Richiesta successiva dell'utente valutata e accantonata: sovrimpressione semitrasparente con sfocatura. Senza compositor nella sessione Openbox la trasparenza va simulata (fondo catturato e sfocato, fermo); un compositor come picom peserebbe sui giochi a schermo intero. Decisione dell'utente: «lascialo com'è».

## v3.2.29-dev.7 — sezione Multimedia (punto 2, step 2c)

Ultimo step della funzione multimedia: la sezione della Dashboard per rivedere screenshot e clip, salvare le clip temporanee nella risoluzione scelta ed eliminare.

### Dashboard

- **`src/components/MediaLibrary.tsx`** (nuovo, componente a sé invece di altro codice in `App.tsx`), stesso aspetto della libreria degli avatar:
  - intestazione con titolo, percorso come sottotitolo monospaziato, Ricarica e Chiudi;
  - **schede**: «Clip da rivedere» (se ce ne sono) e una per gioco, dal più recente, col numero di elementi; catena orizzontale ciclica, A sceglie;
  - **Screenshot / Clip** del gioco scelto;
  - **griglia** di miniature 16:9 (4 colonne), clip con il simbolo di riproduzione, temporanee con «Da rivedere» (o «Salvataggio in corso…»), gioco, durata, risoluzione e data;
  - **visore** a tutto schermo: precedente/successivo, riproduci/pausa, −10 s/+10 s; per una clip temporanea «Salva Nativa · 2560×1440», «Salva FHD · 1080p», «Salva HD · 720p» (solo quelle non superiori alla registrazione) e «Scarta»; per un file salvato «Elimina»; Scarta ed Elimina chiedono «Conferma con A» (scade in 4 s o spostandosi, B la annulla); il visore si chiude da solo se il suo elemento sparisce;
  - focus iniziale sulla scheda attiva; nel visore su Riproduci per i video, su Successivo per gli screenshot;
  - si ricarica da sola agli eventi del demone (clip salvata o scartata, nuovo screenshot o clip).
- **`src/App.tsx`** — voce **Multimedia** nel quick-menu (dopo Avatar); B chiude prima la conferma o il visore, poi la sezione; Start la chiude; l'azione «Apri Multimedia» delle notifiche apre la sezione (alla chiusura si torna alle notifiche invece che al quick-menu); eventi SSE `media-updated` e `notification-dismissed`.
- Testi IT/EN: **`public/locales/{it,en}/multimedia.json`** (nuovi) e `quickMenu:multimedia`; namespace `multimedia` registrato in `src/i18n/i18n.ts`.

### Demone

- **`src/backend/mediaLibrary.ts`**:
  - `mediaLibrary()`: clip temporanee (col titolo del gioco e lo stato di salvataggio) e giochi con screenshot e clip salvati, dal più recente;
  - `resolveSavedMedia()` / `resolveTmpClip()`: un file viene servito solo se è un file regolare dentro `multimedia/<cartella di un gioco>/<Screenshot|Clip>/` (nessun `..`, nessun file nascosto, nessun link che porti fuori) o una clip temporanea elencata;
  - `mediaThumb()`: miniature 480 px (ImageMagick per gli screenshot, `ffmpeg` al secondo 1 per le clip, primo fotogramma se più corte) in cache in `~/.cache/x-launcher/media-thumbs/`, generate una alla volta;
  - `saveTmpClip()`: in background; **Nativa** = copia così com'è (da tmpfs al disco); **FHD/HD** = `ffmpeg` con `h264_nvenc` (`-preset p5 -cq 21`, ripiego su `libx264` se NVENC non c'è o fallisce), audio copiato, `+faststart`; mai un ingrandimento; file `.part` rinominato a fine lavoro; temporanea e `.json` tolti; doppio salvataggio rifiutato;
  - `deleteMedia()`: scarta una temporanea (con il `.json`) o elimina un file salvato, con gli stessi controlli dei percorsi.
- **`server.ts`** — `GET /api/media/library`, `GET /api/media/saved/:cartella/:sottocartella/:nome`, `GET /api/media/tmp/:nome` (con i Range, per spostarsi nei video), `GET /api/media/thumb/...`, `POST /api/media/clip/save`, `POST /api/media/delete`; evento SSE `media-updated`. `sendFile` con `dotfiles: 'allow'`: il percorso passa da `~/.local`.
- **`src/backend/notificationEngine.ts`**:
  - pulsante **«Apri Multimedia»** sulle notifiche di screenshot, clip da rivedere e clip salvata;
  - nuova notifica **«Clip salvata — <gioco>»** (o «Clip non salvata», con l'errore);
  - «Clip da rivedere» si chiude da sola quando il gioco non ha più clip temporanee;
  - anche «Clip salvata» esclusa dalla deduplicazione a 30 s (due clip salvate di seguito ne perdevano una: trovato nelle prove).

### Correzione della dev.6

`X_LAUNCHER_SHARE_HOLD_S` e `X_LAUNCHER_CLIP_MAX_S` erano indicate nel `.env`, che legge solo il demone: le usa `spaces.py`, quindi vanno in `~/.config/openbox/environment` (`export X_LAUNCHER_SHARE_HOLD_S=2`). Corretti **`.env.example`** e **`INSTALL.md`**.

- **`INSTALL.md`** — sezione Multimedia, dipendenze (`ffmpeg`, ImageMagick). Versione 3.2.29-dev.7 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc --noEmit` (anche `server.ts`) con gli stessi 7 errori preesistenti; `npm run build` riuscito; `check-focus-ids.cjs` senza nuovi riferimenti rotti.
- Demone (24 prove su file veri: screenshot JPEG, clip MP4 2560×1440 con audio Opus generate con `ffmpeg`): elenco e titoli, percorsi con `..`, file nascosti e link rifiutati, miniature 480×270 e cache, video servito con Range (206), salvataggio nativo, HD (1280×720) e FHD (1920×1080) con audio copiato — qui senza NVENC, quindi provato anche il ripiego su x264 — nessun `.part` rimasto, notifiche «Clip salvata» con «Apri Multimedia», «Clip da rivedere» chiusa a cache vuota, eliminazione e scarto.
- **Dashboard compilata nel browser** (Chrome headless sul demone compilato, dati di prova, **controller Xbox simulato** con `navigator.getGamepads`): Start → quick-menu → Multimedia → schede e miniature → giù e A su una clip → visore con la barra dei pulsanti → destra fino a «Salva FHD» → A: clip salvata a 1920×1080 nella cartella del gioco e sparita dalle temporanee; Scarta con «Conferma con A» e secondo A; scheda di un gioco, screenshot nel visore; B chiude visore e sezione. Schermate controllate a vista.

**Da provare su hardware reale** (dopo `./build.sh compile` e il riavvio del demone o un nuovo login):
1. Quick-menu → Multimedia: schede «Clip da rivedere» e dei giochi, miniature corrette.
2. Una clip temporanea: riproduzione con l'audio, −10/+10 s; «Salva FHD» → notifica «Clip salvata», file a 1080p in `multimedia/<gioco>/Clip/` (log `[MEDIA] Clip of … saved (1080p)`; conversione con NVENC, senza `falling back to libx264` nel log).
3. «Salva Nativa» istantaneo; Scarta ed Elimina con la conferma.
4. Dalla notifica di uno screenshot, «Apri Multimedia» apre la sezione; B riporta alle notifiche.

---

**Confermato su hardware reale (14 novembre 2026)**: v3.2.29-dev.7 — sezione Multimedia funzionante, con una segnalazione sulla navigazione (vedi dev.8).

## v3.2.29-dev.8 — pulsanti della sezione Multimedia in ordine

Segnalazione dell'utente: nel visore della sezione Multimedia (clip da rivedere, sfogliando clip e immagini) la selezione dei pulsanti in basso non è sequenziale: andando a destra o a sinistra salta alcune voci e, arrivata in fondo, ricomincia da quelle saltate.

**Causa**: il FocusProvider ordina gli elementi di una catena (`sequentialChain`) per **posizione sullo schermo**: prima per bordo superiore (oltre 4 px di differenza), poi da sinistra. Nella barra del visore i pulsanti tondi (‹, −10 s, +10 s, ›, X) erano alti 40 px, quelli con testo (Riproduci, Salva…, Scarta/Elimina) circa 30 px, centrati sulla stessa riga: bordi superiori diversi di ~5 px, quindi la catena metteva prima tutti i tondi e poi tutti quelli con testo.

**Correzione** (`src/components/MediaLibrary.tsx`): tutti i pulsanti con testo della sezione alti quanto i tondi (`h-10`); la barra del visore su una sola riga (`flex-nowrap`). La riga delle schede continua ad andare a capo se i giochi sono molti: lì i pulsanti hanno tutti la stessa altezza e l'ordine resta quello di lettura. Il FocusProvider non è stato toccato (comportamento invariato per il resto della Dashboard).

- Versione 3.2.29-dev.8 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `npm run build` riuscito. Nel browser con il controller simulato, posizione orizzontale del pulsante selezionato a ogni pressione: clip temporanea, destra ×10 → ‹, −10, Riproduci, +10, Salva Nativa, Salva FHD, Salva HD, Scarta, ›, X e di nuovo ‹, con una sola ripartenza (il giro); sinistra ×10 → stesso ordine al contrario; seconda clip (pulsanti rimontati) → uguale; screenshot → ›, X, ‹, Elimina, ›.

**Da provare su hardware reale**: nel visore di una clip da rivedere, di una clip salvata e di uno screenshot, destra e sinistra percorrono i pulsanti in fila, senza salti, e ripartono dall'altro capo dopo l'ultimo.

---

**Confermato su hardware reale (15 novembre 2026)**: v3.2.29-dev.8 — pulsanti della sezione Multimedia in fila.

## v3.2.29-dev.9 — niente tearing durante la registrazione; etichette dell'overlay solo testo

### Tearing durante la registrazione

Segnalazione dell'utente: durante la registrazione, con la sovrimpressione a schermo, una linea orizzontale «spezza» l'immagine del gioco per tutta la durata della clip; la clip invece è perfetta.

**Diagnosi** (sull'HTPC, 15 novembre 2026): la stessa registrazione avviata a mano da SSH, senza sovrimpressione (`gpu-screen-recorder -w <finestra> …`), non produce artefatti. La causa è quindi la sovrimpressione: col driver NVIDIA su X11 senza compositor un gioco a schermo intero presenta i fotogrammi scambiando direttamente i buffer; con una qualunque finestra sopra (il pallino REC, fisso per tutta la registrazione e rialzato ogni 0,5 s) il driver passa alla copia non sincronizzata → tearing. La clip è perfetta perché la cattura della finestra legge fotogrammi completi; il tearing riguarda solo la presentazione sul monitor. Escluse la velocità di registrazione e la cattura della finestra.

**Regola dell'utente**, in `spaces.py` (`REC_OSD_SHOW_S`, `REC_OSD_EVERY_S`): il pallino REC con «Premi Share per interrompere la registrazione» compare **3 s all'avvio**, poi **3 s ogni 30 s** di registrazione effettiva (le pause non contano: alla ripresa nessun messaggio, il pallino torna al multiplo successivo di 30 s del tempo registrato), e **«Registrazione conclusa»** alla fine. In pausa il messaggio eventualmente a schermo sparisce subito. Il gioco resta senza finestre sopra per quasi tutta la registrazione. Restano brevi tratti di tearing nei 3 s di ogni messaggio, come per «Screenshot acquisito».

### Etichette dei pulsanti dell'overlay degli spazi

Richiesta dell'utente: le etichette sotto i pulsanti (Chiudi, Conferma chiusura, Registra, Interrompi · m:ss) erano racchiuse in un riquadro come i pulsanti. Ora (`overlay.py`, `_btn_label`) sono **solo testo**, centrato sotto il pulsante e **solo per il pulsante selezionato**; rosso per la conferma di chiusura, la chiusura in corso e la registrazione in corso.

- **`INSTALL.md`** — nuova regola del pallino REC. Versione 3.2.29-dev.9 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `py_compile` di `spaces.py` e `overlay.py`; `npm run build` riuscito. Registratore su Xvfb (registratore finto, intervallo ridotto a 1 s per la prova): un solo pallino all'avvio e nessun messaggio fisso; dopo ~2,4 s tre pallini; in pausa messaggio tolto e nessun pallino; alla ripresa nessun messaggio immediato, poi il pallino al multiplo successivo; alla fine «Registrazione conclusa» e conteggio azzerato; nuova clip di nuovo col pallino all'avvio. Le 30 prove del registratore ripetute (due aggiornate alla nuova regola). Overlay disegnato e controllato a vista: etichette di solo testo sotto Chiudi, Registra, «Paused · 0:42» e «Confirm close».

**Da provare su hardware reale** (nuovo login per `spaces.py`/`overlay.py`): durante una clip niente linea di tearing, salvo i 3 s del pallino all'avvio e ogni 30 s; nell'overlay le etichette sotto i pulsanti sono testo semplice e solo sotto quello selezionato.

**Confermato su hardware reale (15 novembre 2026)**: v3.2.29-dev.9 — niente tearing durante la registrazione fuori dai 3 s del pallino REC; etichette dell'overlay in solo testo sotto il pulsante selezionato.

---

## Piano — condivisione da Multimedia (punto 2, step 2d), concordato il 16/11/2026

Mock approvati dall'utente (canvas «X-Launcher Multimedia — barra di avanzamento e condivisione»), con queste decisioni:

- si condivide su **un servizio alla volta**, scelto ogni volta; per ora **solo YouTube** (Facebook resta fuori, l'architettura deve permettere di aggiungere servizi in modo semplice);
- **Condividi** c'è sia nelle gallerie salvate sia nelle **clip da rivedere** (per condividere senza conservare);
- per il testo del post si usa la **VirtualKeyboard** già esistente (`src/components/VirtualKeyboard.tsx`), oltre alla tastiera fisica; niente tastiera dedicata;
- i glifi A/B/X/Y dei suggerimenti hanno la lettera **centrata** (nei mock era spostata).

Limiti delle piattaforme accettati: con un progetto Google non verificato i video caricati via API restano **privati**; l'accesso si fa col **codice dal telefono** (flusso OAuth per TV e dispositivi con input limitato).

Step:

1. **dev.10** — barra di avanzamento con tempo rimanente nel visore delle clip (solo Dashboard).
2. **dev.11** — demone: registro dei servizi in `src/backend/share/` (un file per servizio in `providers/`), token salvati sull'HTPC, provider YouTube con accesso tramite codice, rotte `/api/share/*`, credenziali del client OAuth nel `.env`; guida in `INSTALL.md` per creare il client «TV e dispositivi con input limitato».
3. **dev.12** — Dashboard: pulsante Condividi nel visore, finestra di scelta del servizio, accesso con codice e QR, finestra del post con miniatura, titolo, descrizione e VirtualKeyboard, Annulla/Condividi.
4. **dev.13** — caricamento ripristinabile in background con avanzamento (SSE), annullamento, notifiche di esito con QR del link al video.

## v3.2.29-dev.10 — barra di avanzamento delle clip (step 2d.1)

Richiesta dell'utente: una barra sotto la clip che mostri la durata a scalare durante la riproduzione.

- **`src/components/MediaLibrary.tsx`** — nuovo componente `ClipProgress`, tra il video e la riga dei pulsanti del visore (solo per i video, clip salvate e da rivedere):
  - a sinistra il tempo trascorso, a destra il **tempo rimanente** col segno meno (es. `0:42` · `−1:16`); il trascorso arrotonda per difetto e il rimanente per eccesso, così la somma torna sempre alla durata e il rimanente arriva a `0:00` solo alla fine;
  - riempimento nel colore primario del tema con un indicatore bianco;
  - il riempimento si aggiorna a ogni frame **direttamente sul DOM** durante la riproduzione (nessun re-render dell'intera sezione a 60 Hz); le etichette si aggiornano solo al cambio di secondo; in pausa, dopo −10 s/+10 s e al caricamento si allinea subito;
  - se il file non dichiara una durata valida usa quella registrata dal demone per la clip temporanea;
  - non è focalizzabile: la catena dei pulsanti resta invariata, ci si sposta con −10 s/+10 s.
  - il `<video>` ora passa da un ref a callback (`bindVideo`) che lo espone anche come stato, perché la barra si riagganci quando il visore passa alla clip successiva.
- Versione 3.2.29-dev.10 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc` con gli stessi 7 errori preesistenti, nessuno nuovo; `npm run build` riuscito; `check-focus-ids.cjs` invariato (nessun nuovo id).

**Da provare su hardware reale**: aprire una clip (salvata e da rivedere): la barra avanza in modo fluido, il rimanente scende fino a `0:00`; in pausa si ferma; −10 s/+10 s spostano subito barra ed etichette; passando alla clip successiva la barra riparte da zero.

**Confermato su hardware reale (16 novembre 2026)**: v3.2.29-dev.10 — barra di avanzamento delle clip.

## v3.2.29-dev.11 — servizi di condivisione e accesso a YouTube nel demone (step 2d.2)

Solo demone: la Dashboard non cambia (finestre di scelta, accesso e post con la dev.12). Si prova dal terminale con `scripts/share-login.sh`.

### Architettura — `src/backend/share/` (nuova cartella)

- **`base.ts`** — interfaccia `ShareProvider`: id, nome, tipi accettati (`video`/`image`: Condividi comparirà solo per questi), lunghezze massime di titolo e testo, visibilità (bloccata nella finestra del post), codici delle note da mostrare; `configured()`, `account(verify)`, `startLogin()`, `completeLogin()`, `logout()`. L'upload si aggiunge con la dev.13. Il demone restituisce solo **codici** (note ed errori), tradotti dalla Dashboard; log in inglese.
- **`deviceFlow.ts`** — accesso col **codice dal telefono** (OAuth 2.0 Device Authorization Grant, RFC 8628), comune a tutti i servizi: richiesta del codice, attesa con `authorization_pending` e `slow_down` (+5 s), esiti `denied`/`expired`/`cancelled`/errore; fino a 10 errori di rete consecutivi tollerati durante l'attesa; rinnovo dell'access token col refresh token (`invalid_grant` = accesso scaduto o revocato). Timeout di 15 s per ogni richiesta.
- **`registry.ts`** — elenco dei servizi (aggiungerne uno = un file in `providers/` più una riga qui); un accesso in corso per servizio (un secondo avvio sostituisce il primo), stato consultabile per 5 minuti dopo la fine, callback a ogni esito.
- **`providers/youtube.ts`** — YouTube, solo video, titolo fino a 100 caratteri e descrizione fino a 5000, visibilità **privata**, nota `youtube-private-only`:
  - credenziali del client nel `.env`: `X_LAUNCHER_YOUTUBE_CLIENT_ID`, `X_LAUNCHER_YOUTUBE_CLIENT_SECRET` (client «TV e dispositivi con input limitato»);
  - permesso `https://www.googleapis.com/auth/youtube`: il flusso col codice di Google accetta, fra quelli di YouTube, solo `youtube` e `youtube.readonly` (non `youtube.upload`);
  - dopo l'approvazione legge il **canale** dell'account (`channels?mine=true`); senza canale, con l'API non abilitata nel progetto (`accessNotConfigured`), con il permesso non concesso o senza refresh token l'accesso fallisce con un codice (`no-channel`, `api-disabled`, `scope-not-granted`, `no-refresh-token`) e il token appena ottenuto viene revocato;
  - token in `tokens.json` (`db.saveToken('share-youtube')`, 0600, cifrato a riposo come gli altri); access token solo in memoria, rinnovato quando mancano meno di 60 s alla scadenza;
  - `account(verify)`: con `verify` rinnova il token; un `invalid_grant` scollega l'account con una riga di log che spiega il caso dei **7 giorni** (schermata di consenso ancora in «Testing»); un errore di rete o del server lascia l'account collegato (HTPC offline);
  - `logout()`: cancella i token locali e revoca l'accesso presso Google.

### Rotte (`server.ts`)

- `GET /api/share/providers` (`?verify=1` per il controllo dell'accesso), `POST|GET|DELETE /api/share/:id/login` (avvio, stato, annullamento), `POST /api/share/:id/logout`. Evento SSE **`share-updated`** `{ provider }` a fine accesso e allo scollegamento. Stessa autenticazione delle altre rotte.

### Altri file

- **`scripts/share-login.sh`** (nuovo, cartella `scripts/`) — prova dal terminale: stato dei servizi, accesso (mostra indirizzo e codice, attende «Collegato: <canale>»; Ctrl+C annulla), `verify`, `logout`.
- **`INSTALL.md`** — «Condivisione su YouTube»: creazione del client su Google Cloud (API, schermata di consenso pubblicata, tipo di client), `.env`, limiti di Google, prova con lo script. **`.env.example`** — le due variabili.
- Versione 3.2.29-dev.11 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc` con gli stessi 7 errori preesistenti, nessuno nuovo; `npm run build` riuscito. 29 prove del registro e del servizio YouTube con un Google finto (moduli compilati come nel demone, DB e `tokens.json` temporanei): non configurato (variabili mancanti, accesso rifiutato), servizio sconosciuto; accesso riuscito dopo `authorization_pending` e `slow_down` col canale letto, richiesta del codice col solo permesso `youtube` e senza segreto, attesa con segreto e grant corretto, token cifrato su disco e rileggibile, account collegato; `verify` senza chiamate con l'access token ancora valido; scollegamento con revoca; rifiuto, codice scaduto, client sbagliato (`invalid-client`), annullamento (l'attesa si ferma), secondo avvio che sostituisce il primo; account senza canale, API non abilitata, permesso non concesso (token revocato, nulla salvato); rinnovo con errore del server → resta collegato, con `invalid_grant` → scollegato e token cancellati; nel log la spiegazione dei 7 giorni e mai un token o il segreto. Demone compilato avviato su una cartella temporanea: le rotte rispondono (avvio dell'accesso qui fallisce con `network`, Google non è raggiungibile dal banco di prova).

**Da provare su hardware reale** (dopo aver creato il client come in `INSTALL.md`, `./build.sh compile` e il riavvio del demone):
1. `bash scripts/share-login.sh` → YouTube con `"configured": true`, `"connected": false`.
2. `bash scripts/share-login.sh youtube` → indirizzo `https://www.google.com/device` e un codice; inserito sul telefono e approvato (avviso «app non verificata» → Avanzate) → `Collegato: <nome del canale>`.
3. `bash scripts/share-login.sh youtube verify` → `"connected": true` col canale.
4. `bash scripts/share-login.sh youtube logout` → scollegato; su myaccount.google.com → Sicurezza → App di terze parti l'accesso non c'è più. Poi di nuovo il punto 2 per lasciare l'account collegato per la dev.12.
5. In caso di errore: `grep '\[SHARE\]' ~/.local/share/x-launcher/daemon.log`.

**Confermato su hardware reale (16 novembre 2026)**: v3.2.29-dev.11 — accesso a YouTube col codice dal telefono, account collegato.

## v3.2.29-dev.12 — finestra di condivisione nella sezione Multimedia (step 2d.3)

Solo Dashboard, secondo i mock approvati e le indicazioni dell'utente (un servizio alla volta, Condividi anche nelle clip da rivedere, VirtualKeyboard esistente, lettere dei tasti centrate). L'invio vero arriva con la dev.13.

### `src/components/ShareDialog.tsx` (nuovo, cartella `src/components/`)

Finestra sopra il visore (group `share-dialog`), tre passi:

- **Scelta del servizio** — i servizi che accettano quel tipo di contenuto, con lo stato letto con il controllo dell'accesso (`/api/share/providers?verify=1`: un accesso scaduto risulta scollegato): «Collegato · <canale>», «Non collegato · A per accedere» o «Non configurato: mancano <variabili> nel .env»; le note del servizio (per YouTube «Solo video privati…»); accanto a un servizio collegato **Scollega** con «Conferma con A» (spostarsi o B la annulla); riga tratteggiata «Altri servizi…» come nel mock; Annulla. A su un servizio collegato porta al post, su uno non collegato all'accesso.
- **Accesso col codice dal telefono** — QR dell'indirizzo di verifica (con il codice già inserito se il servizio lo fornisce; Google no), indirizzo, codice grande, «scade fra m:ss», terzo passo con l'avviso «app non verificata → Avanzate» per YouTube, «In attesa dell'accesso dal telefono…». Stato letto ogni 2 s e all'evento SSE `share-updated`; approvato → elenco ricaricato e passaggio al post; rifiutato, scaduto o errore → messaggio tradotto dal codice del demone, **Riprova** e Annulla. Annullare (pulsante, B o chiusura della finestra) annulla l'attesa anche nel demone.
- **Post** — come il mock: «Condividi su YouTube», «come <canale>», visibilità **Privato** bloccata, miniatura 16:9 con gioco, durata, risoluzione e data; **Titolo** (proposto «<gioco> · <data>», 100 caratteri, senza `<` e `>`, rifiutati da YouTube) e **Descrizione** (5000) con i contatori; Annulla, **Condividi**. Il post compare in alto, perché la tastiera occupa la metà inferiore dello schermo.
  - **VirtualKeyboard** della Dashboard: A su un campo chiama `openKeyboardForField` di `App.tsx` (lo stesso meccanismo dei campi di Game Options e Impostazioni: riquadro col testo sopra la tastiera, Invio/B confermano e il focus torna sul campo). Nessuna tastiera dedicata.
  - **Tastiera fisica**: con la VirtualKeyboard aperta funziona già (la VirtualKeyboard riceve i tasti); con un campo selezionato e la tastiera chiusa il primo tasto la apre con quel carattere già scritto.
- **Esito** — riuscito o «Condivisione non riuscita» col motivo; B torna al post con i testi intatti, Chiudi chiude.
- B torna indietro di un passo (esito → post → scelta), dalla scelta chiude la finestra; il focus torna su Condividi nel visore.
- Suggerimenti dei tasti A/B con la lettera **centrata** nel cerchio (`inline-flex`, `leading-none`), come nel footer della Dashboard.

### Altri file

- **`src/components/MediaLibrary.tsx`** — pulsante **Condividi** nella barra del visore (fra i salvataggi e Scarta/Elimina), per le clip **da rivedere** e per quelle **salvate**; compare solo per i tipi accettati da almeno un servizio, quindi oggi **non sugli screenshot** (YouTube accetta solo video). Il video va in pausa all'apertura; B chiude prima un passo della condivisione; la finestra si chiude se l'elemento sparisce (clip salvata o scartata nel frattempo). Le voci del visore hanno ora la data (`date`) per il titolo proposto.
- **`src/App.tsx`** — `openKeyboardForField` passato alla sezione Multimedia; evento SSE `share-updated` inoltrato come `xl-share-updated`. Versione 3.2.29-dev.12 nel fallback.
- **`public/locales/{it,en}/multimedia.json`** — testi della finestra e dei codici d'errore del demone (`network`, `not-configured`, `invalid-client`, `no-channel`, `api-disabled`, `scope-not-granted`, `no-refresh-token`…).
- **`package.json`** / **`package-lock.json`** — nuova dipendenza **`qrcode`** (QR in SVG nel browser; servirà anche per il link del video nella dev.13) e `@types/qrcode`. Versione 3.2.29-dev.12.

In questa versione **Condividi nel post non carica ancora nulla**: la rotta di invio non esiste e la finestra risponde «Condivisione non riuscita — Il caricamento non è ancora disponibile in questa versione» (prova del percorso d'errore). La dev.13 aggiunge l'invio.

**Verificato**: `tsc` con gli stessi 7 errori preesistenti, nessuno nuovo; `npm run build` riuscito; `check-focus-ids.cjs` senza nuovi riferimenti rotti. Nel browser sul demone compilato, con il **controller simulato** e un **Google finto** (24 prove, schermate controllate a vista):
- Condividi nella barra della clip da rivedere e di una clip salvata; nessun Condividi sugli screenshot;
- scelta: YouTube «Non collegato» con la nota;
- accesso: codice e indirizzo, QR disegnato, B torna alla scelta e annulla l'attesa;
- dopo l'approvazione, il post col nome del canale, la visibilità Privato e il titolo proposto;
- A sulla descrizione apre la VirtualKeyboard; testo dalla tastiera fisica e contatore «12 / 5000»; un tasto fisico sul titolo con la tastiera chiusa la apre con quel carattere;
- Condividi → errore atteso; B dall'esito → post con i testi; B dal post → scelta con «Collegato · <canale>»;
- Scollega con conferma, con la revoca presso Google; B chiude la finestra col focus su Condividi.

**Da provare su hardware reale**: **prima** `npm install` nella cartella del progetto (nuova dipendenza `qrcode`), poi `./build.sh compile` e il riavvio del demone.
1. Una clip da rivedere e una salvata: Condividi c'è nella barra del visore; sugli screenshot no.
2. Condividi → YouTube «Collegato · <canale>» → A → post. Titolo proposto, Privato bloccato, miniatura giusta.
3. A sulla descrizione: VirtualKeyboard; scrivere col pad e con la tastiera fisica; Invio/B → testo nel campo col contatore. Col campo selezionato e la tastiera chiusa, scrivere sulla tastiera fisica apre la VirtualKeyboard.
4. Condividi → «Condivisione non riuscita» (atteso in questa versione); B torna al post coi testi.
5. B fino alla scelta → Scollega → «Conferma con A» → A: «Non collegato». A sul servizio → codice e QR (il QR aperto col telefono porta a google.com/device); approvare → si arriva al post. Le lettere A/B dei suggerimenti sono centrate.

**Confermato su hardware reale (16 novembre 2026)**: v3.2.29-dev.12 — finestra di condivisione (scelta, accesso col QR, post con la VirtualKeyboard, Scollega).

## v3.2.29-dev.13 — invio su YouTube; riquadro del testo dei post a 5 righe (step 2d.4)

### Invio

- **`src/backend/share/base.ts`** — `upload(req, onProgress, signal)` nell'interfaccia dei servizi (file già aperto, dimensione, MIME, titolo e testo già ripuliti) e `textMaxBytes` facoltativo (limite in byte UTF-8, se diverso dai caratteri).
- **`src/backend/share/providers/youtube.ts`** — caricamento **ripristinabile** della YouTube Data API:
  - sessione con i metadati: titolo, descrizione, categoria Giochi (20), **privato**, non destinato ai bambini;
  - invio a blocchi di 4 MiB con `Content-Range` (308 = blocco ricevuto, 200/201 = video creato, link `https://youtu.be/<id>`);
  - errore di rete o 5xx → attese di 1, 2, 4, 8, 16 s e richiesta dello stato della sessione, poi ripartenza dall'ultimo byte ricevuto; 401 → token rinnovato e un nuovo tentativo;
  - codici d'errore: `quota`, `upload-limit`, `no-channel`, `forbidden`, `bad-request`, `not-connected`, `network`…;
  - `textMaxBytes = 5000`: la documentazione di YouTube limita la descrizione a 5000 **byte**, non caratteri.
- **`src/backend/share/registry.ts`** — gestione degli invii:
  - **uno alla volta** (la banda serve anche ai giochi; un secondo → `busy`);
  - titolo e testo ripuliti (niente `<` `>`, rifiutati da YouTube; titolo su una riga; titolo vuoto → nome del gioco), lunghezze in caratteri, descrizione tagliata a 5000 byte senza spezzare un carattere (riga nel log);
  - file aperto all'avvio: una clip temporanea scartata o tolta dalla cache durante l'invio resta leggibile fino alla fine;
  - avanzamento al più ogni 500 ms; annullamento; «Riprova» con gli stessi dati finché il demone resta acceso; stato in memoria per 6 ore.
- **`src/backend/mediaLibrary.ts`** — `describeShareSource()`: percorso verificato come per la riproduzione (clip temporanea elencata o file dentro `multimedia/`), MIME, gioco di appartenenza.
- **`server.ts`** — `POST /api/share/:id/upload`, `GET /api/share/jobs/active`, `GET|DELETE /api/share/jobs/:job`, `POST /api/share/jobs/:job/retry`; evento SSE `share-progress` `{ job }`; a fine invio (non per un annullamento) la notifica.
- **`src/backend/notificationEngine.ts`** — evento `share-result`: «Condiviso su YouTube — <gioco>», «Caricato come video privato: <link>» con **Mostra QR del link**; oppure «Condivisione non riuscita — <gioco>» col motivo e **Riprova**. Esclusa dalla deduplicazione a 30 s.

### Dashboard

- **`src/components/ShareDialog.tsx`**:
  - Condividi avvia l'invio e mostra il passo **caricamento** come nel mock: miniatura, titolo, barra, percentuale, MB inviati/totali, tempo stimato (dopo 3 s), **Annulla caricamento** (con «Conferma con A») e **In background**; B equivale a In background: la finestra si chiude e l'invio continua;
  - a invio riuscito, **esito col QR del link** e la nota «Il video è privato… YouTube Studio»; un invio non riuscito mostra il motivo, B torna al post; un annullamento torna al post;
  - avviso sotto il contatore quando la descrizione supera i 5000 byte di YouTube (lettere accentate);
  - contatori e limiti in caratteri veri (emoji e accenti contano 1);
  - `QrModal` (esportato): il QR di un link a tutto schermo.
- **`src/App.tsx`**:
  - **riquadro del testo sopra la VirtualKeyboard a 5 righe solo per la descrizione dei post**: altezza fissa di 5 righe, barra di scorrimento (classe `vk-rows-scrollbar`, più larga e con la guida visibile) quando il testo è più lungo, scorrimento automatico per tenere visibile il cursore, a capo fra le parole. Gli altri campi (ricerca, Game Options, Impostazioni) restano identici (verificato sul campo di ricerca);
  - `openKeyboardForField` accetta le opzioni `rows` e `maxLength`; con `maxLength` il testo non va oltre il limite mentre si scrive (col pad, con la tastiera fisica o incollando) e il contatore del riquadro diventa «N / max». La descrizione è limitata a **5000 caratteri**, il titolo a 100;
  - azioni delle notifiche `show_qr` (apre `QrModal`, B o Chiudi tornano alla notifica) e `share_retry` (nuovo invio; se non è possibile il motivo compare nella notifica);
  - evento SSE `share-progress` inoltrato come `xl-share-progress`.
- **`src/index.css`** — stile `vk-rows-scrollbar`.
- **`public/locales/{it,en}/multimedia.json`** — testi del caricamento, dell'esito, del QR, dei nuovi codici d'errore e della ripetizione; tolto il messaggio provvisorio della dev.12.
- **`INSTALL.md`** — condivisione dalla Dashboard e limite in byte. Versione 3.2.29-dev.13 in `package.json` e nel fallback di `src/App.tsx`.

**Nota sul limite di 5000 caratteri**: la Dashboard limita la descrizione a 5000 caratteri come richiesto, ma YouTube conta 5000 **byte**. Per un testo con molte lettere accentate l'ultima parte verrebbe tagliata: lo segnala l'avviso sotto il contatore e lo annota il log.

**Verificato**: `tsc` con gli stessi 7 errori preesistenti, nessuno nuovo; `npm run build` riuscito; `check-focus-ids.cjs` senza nuovi riferimenti rotti; le 29 prove della dev.11 ancora superate.

**Demone** con un YouTube finto (26 prove):
- invio rifiutato senza account collegato, con un percorso non valido (`source-missing`) e per uno screenshot (`unsupported`);
- invio di una clip da 22 MB a blocchi di 4 MiB, con il file ricevuto identico byte per byte;
- metadati: privato, categoria Giochi, non per bambini; titolo ripulito (niente `<` `>`, una riga); descrizione entro 5000 byte; intestazioni corrette;
- notifica col QR del link;
- interruzione di rete a metà: richiesta dello stato e ripresa, file identico;
- quota esaurita: errore `quota` e notifica con Riprova; Riprova completa l'invio con gli stessi testi;
- secondo invio durante il primo → `busy`; annullamento senza notifica; nel log mai un token.

**Browser** con il controller simulato (schermate controllate a vista):
- riquadro della ricerca invariato; riquadro della descrizione alto 5 righe, scorrevole oltre, scorrimento automatico sul cursore;
- limite di 5000 caratteri durante la scrittura;
- passo di caricamento con barra, MB e pulsanti; B → finestra chiusa e invio che prosegue;
- notifica «Condiviso su YouTube» → Mostra QR del link → QR a tutto schermo → B torna alla notifica;
- invio con la finestra aperta → esito col QR → Chiudi torna su Condividi.

**Da provare su hardware reale** (`./build.sh compile` e riavvio del demone; nessuna nuova dipendenza):
1. Descrizione del post: la VirtualKeyboard mostra 5 righe; con un testo più lungo compare la barra di scorrimento e il cursore resta visibile; non si va oltre 5000 caratteri. Il campo della ricerca e quelli di Game Options sono quelli di sempre.
2. Una clip breve (da rivedere) → Condividi: barra di caricamento, poi esito col QR. Il QR inquadrato col telefono apre il video (privato) su YouTube.
3. Una clip più lunga → Condividi → B (In background): la Dashboard resta usabile; a fine invio la notifica «Condiviso su YouTube» → Mostra QR del link.
4. Annulla caricamento con «Conferma con A»: si torna al post e nessun video compare in YouTube Studio (una sessione interrotta non crea il video).
5. In YouTube Studio: titolo e descrizione come scritti, categoria Giochi, visibilità Privato.
6. Log: `grep '\[SHARE\]' ~/.local/share/x-launcher/daemon.log` (avvio, eventuali riprese, durata, link).

**Confermato su hardware reale (16 novembre 2026)**: v3.2.29-dev.13 — invio su YouTube, QR del link, riquadro della descrizione a 5 righe.

## v3.2.29-dev.14 — filigrana «Condiviso con X-Launcher» e badge dei contenuti condivisi

Richieste dell'utente dopo la conferma della dev.13: (1) filigrana «condiviso con X-Launcher / shared with X-Launcher» in basso a destra delle clip condivise su YouTube, applicabile o no con un interruttore nella finestra del post; (2) badge nella galleria e nel visore sulle clip già condivise, per non condividerle più volte.

### Filigrana

- **`src/backend/share/watermark.ts`** (nuovo, cartella `src/backend/share/`):
  - copia della clip riconvertita con `drawtext`: testo «Condiviso con X-Launcher» o «Shared with X-Launcher» secondo la lingua della Dashboard;
  - aspetto: in basso a destra, bianco all'85% con bordo scuro, carattere «Sans» in grassetto (fontconfig), altezza 1/30 del video, margine 1/36 (proporzionato a ogni risoluzione);
  - il testo è letto da file (`textfile`, `expansion=none`), quindi nessun carattere speciale va protetto nel filtro;
  - stessa risoluzione e frequenza, NVENC `-cq 19` con ripiego su libx264, audio copiato, `+faststart`;
  - avanzamento da `-progress` rispetto alla durata letta con `ffprobe`;
  - annullabile (ffmpeg terminato, file parziale cancellato);
  - la copia va in `~/.cache/x-launcher/share-tmp/` (su disco, non in `/tmp`) e viene cancellata a fine invio e all'avvio del demone. **L'originale non viene mai toccato**.
- **`src/backend/share/registry.ts`**:
  - `watermark` nella richiesta d'invio, solo per i video;
  - il lavoro passa prima dalla fase **`preparing`** (`prepared` 0–1) e poi da `uploading`, con `uploadStartedAt` per il tempo stimato;
  - si invia la copia con la filigrana (dimensione aggiornata);
  - errore `watermark-failed`;
  - «Riprova» mantiene la scelta;
  - `onFinish` riceve anche la sorgente.
- **`src/components/ShareDialog.tsx`**:
  - nel post, sotto la descrizione, interruttore **Filigrana «Condiviso con X-Launcher»** (solo per i video): A lo attiva o disattiva. Predefinito attivo, ultima scelta ricordata nel browser (`localStorage`, chiave `xl-share-watermark`);
  - catena: descrizione → interruttore → Condividi/Annulla;
  - nel caricamento, fase **«Applicazione della filigrana»** con la sua barra, poi «Caricamento su YouTube» col tempo stimato calcolato dall'inizio dell'invio vero.
- **`src/backend/notificationEngine.ts`** — motivo «Non è stato possibile applicare la filigrana» per la notifica di errore.

### Badge «Condiviso»

- **`src/backend/mediaLibrary.ts`**:
  - registro `~/.local/share/x-launcher/media-shared.json` (0600, scrittura atomica): per ogni contenuto le condivisioni riuscite (servizio, link, data). Chiave `tmp:<file>` per una clip da rivedere, `saved:<cartella>/<Screenshot|Clip>/<nome>` per un file salvato;
  - **salvare** una clip condivisa sposta l'annotazione sul file salvato (anche in FHD/HD);
  - scartare o eliminare la toglie; le annotazioni di clip temporanee sparite (riavvio, cache piena) si puliscono da sole;
  - `mediaLibrary()` aggiunge `shared` a clip temporanee e file salvati.
- **`server.ts`** — a invio riuscito `markShared()` e aggiornamento della sezione Multimedia (`media-updated`); pulizia di `share-tmp` all'avvio.
- **`src/components/MediaLibrary.tsx`**:
  - badge verde **«✓ Condiviso»** in alto a destra della miniatura (accanto a «Da rivedere»);
  - nel visore **«✓ Condiviso su YouTube · data e ora»** accanto al titolo.
- **`src/components/ShareDialog.tsx`**:
  - nella scelta del servizio «Già condiviso su YouTube il <data>»;
  - nel post «Questo contenuto è già stato condiviso su YouTube il <data>: condividendolo di nuovo ne crei una seconda copia». Avviso, non blocco: si può ricondividere volutamente.
- Testi IT/EN in **`public/locales/{it,en}/multimedia.json`**; **`INSTALL.md`**. Versione 3.2.29-dev.14 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc` con gli stessi 7 errori preesistenti; `npm run build` riuscito; `check-focus-ids.cjs` senza nuovi riferimenti rotti; le 29 prove della dev.11 ancora superate.

**Filigrana** su una clip vera 1920×1080: fotogramma controllato a vista, testo in basso a destra. Qui senza NVENC, quindi provato il ripiego su x264, 2,4 s per 5 s di video. Annullamento a metà: nessun file rimasto.

**Demone** con YouTube finto (15 prove):
- fasi `preparing` → `uploading` → `done`;
- viene inviata la copia con la filigrana (video valido), copia temporanea cancellata, originale intatto;
- senza filigrana viene inviato l'originale;
- annullamento durante la preparazione senza file rimasti;
- clip segnata come condivisa con servizio e link, due condivisioni registrate;
- dopo il salvataggio il badge passa al file salvato; l'eliminazione lo toglie.

**Browser** col controller simulato (13 prove, schermate controllate a vista):
- badge nella griglia e nel visore;
- «Già condiviso» nella scelta e avviso della seconda copia nel post;
- interruttore attivo per default, A lo disattiva e riattiva, scelta ricordata;
- catena descrizione → interruttore → Condividi;
- fase «Applicazione della filigrana», poi caricamento, poi esito col QR.

**Da provare su hardware reale** (`./build.sh compile` e riavvio del demone):
1. Una clip → Condividi → interruttore Filigrana attivo → Condividi: prima «Applicazione della filigrana» (con NVENC pochi secondi per una clip di 2 minuti; nel log `Watermark applied in N s`, senza `falling back to libx264`), poi il caricamento. Su YouTube la scritta «Condiviso con X-Launcher» in basso a destra, leggibile ma discreta.
2. Con la Dashboard in inglese la scritta è «Shared with X-Launcher».
3. Interruttore disattivato: niente preparazione, video identico all'originale. Riaprendo un post l'interruttore ricorda l'ultima scelta.
4. Dopo l'invio: badge «Condiviso» sulla miniatura e «Condiviso su YouTube · data» nel visore; Condividi di nuovo → «Già condiviso…» nella scelta e l'avviso nel post.
5. Salvare la clip condivisa (Nativa o FHD): il badge resta sul file salvato. Eliminarla: sparisce.

**Confermato su hardware reale (16 novembre 2026)**: v3.2.29-dev.14 — filigrana e badge «Condiviso».

## v3.2.29-dev.15 — interruttore della filigrana in blu

Richiesta dell'utente: lo sfondo dell'interruttore «Filigrana» attivo era verde; ora usa lo stesso blu degli altri interruttori attivi della Dashboard (`bg-xl-primary-500`, come in Game Options), e da spento lo stesso grigio (`bg-xl-fill-10-strong`).

- **`src/components/ShareDialog.tsx`** — solo i colori dell'interruttore. Versione 3.2.29-dev.15 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `npm run build` riuscito.

**Da provare su hardware reale**: nella finestra del post l'interruttore della filigrana attivo è blu come gli altri della Dashboard.

**Confermato su hardware reale (16 novembre 2026)**: v3.2.29-dev.15 — interruttore della filigrana in blu.

## v3.2.29-dev.16 — nuova grafica della filigrana

Richiesta dell'utente: un carattere più «corposo», lo stesso dell'intestazione «MULTIMEDIA»; bordo grigio invece che nero; bordi ammorbiditi con l'antialias. Due mock a confronto, resi con la stessa procedura del codice su un fotogramma 2560×1440: corpo medio (1/24 dell'altezza) e corpo grande (1/18). Scelta dell'utente: **corpo grande**, con un margine in basso e a destra un po' più ampio.

- **`src/backend/share/watermark.ts`**:
  - **carattere** Noto Sans Black Italic dal file del progetto (`assets/fonts/NotoSans-BlackItalic.ttf`, lo stesso del titolo della sezione), indipendente dai font di sistema; se il file manca, ripiego su fontconfig «Sans» grassetto corsivo con una riga nel log;
  - **corpo** 1/18 dell'altezza del video (80 px a 1440p, 60 a 1080p; prima 1/30);
  - **margine** in basso e a destra 1/24 dell'altezza (60 px a 1440p; prima 1/36, 40 px);
  - **bordo grigio** medio `#8c8c8c` (spessore 1/14 del corpo) invece del nero; testo bianco; opacità complessiva 92%;
  - **antialias**: la scritta viene disegnata una sola volta a risoluzione doppia (colore e maschera di trasparenza separati, maschera del bordo appena sfumata) e ridotta con lanczos in una striscia RGBA larga quanto il video; la riconversione la sovrappone in basso a ogni fotogramma (`overlay`) invece di ridisegnare il testo per ogni fotogramma;
  - dimensioni del video lette con `ffprobe` insieme alla durata; file di appoggio (testo e striscia) cancellati a fine lavoro.
- **`INSTALL.md`** — il carattere della filigrana. Versione 3.2.29-dev.16 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc` con gli stessi 7 errori preesistenti; `npm run build` riuscito. Riconversione di una clip vera 2560×1440 di 4 s con la Dashboard in inglese: video 2560×1440, audio intatto, «Shared with X-Launcher» in basso a destra nel carattere della Dashboard, bordo grigio, bordi morbidi senza scalettature e nessuna fascia visibile intorno alla scritta (fotogramma controllato a vista). Qui senza NVENC, quindi con x264: 3,3 s. Annullamento ancora funzionante.

**Da provare su hardware reale** (`./build.sh compile` e riavvio del demone; il demone va avviato dalla cartella del progetto, come sempre, perché il carattere si trova in `assets/fonts/`): condividere una clip con la filigrana e controllare su YouTube carattere, dimensione, margine e bordi. Nel log `Watermark applied in N s (… of 2560x1440 video)` e nessuna riga `Watermark font not found`.

**Confermato su hardware reale (16 novembre 2026)**: v3.2.29-dev.16 — nuova grafica della filigrana (carattere Noto Sans Black Italic, corpo 1/18, margine 1/24, bordo grigio con antialias).

## v3.2.29-dev.17 — sfondo del desktop degli spazi dei giochi (punto 3 del ciclo)

Ultimo punto del ciclo, opzionale: sfondo dello spazio contestuale al gioco. Scelte dell'utente:
- **dove**: il desktop dello spazio, dietro la finestra del gioco, che finora era nero. Si vede al caricamento, coi giochi in finestra, coi popup dei launcher e alla chiusura. L'overlay degli spazi resta com'è;
- **sorgente**: artwork 16:9 di IGDB in alta risoluzione, in mancanza hero di SteamGridDB ad alta risoluzione ritagliato;
- **resa**: nitida, a schermo intero.

Il mock non è stato fatto: dal banco di prova non si scaricano immagini dei giochi, e con la sola resa nitida l'immagine è mostrata così com'è.

### Demone

- **`src/backend/spaceBackground.ts`** (nuovo, cartella `src/backend/`):
  - `ensureSpaceBackground()` salva l'immagine in `~/.local/share/x-launcher/covers/<id>.bg` (chiave come le copertine = nome dello scope), così come arriva, con `<id>.bg.json` (sorgente, URL, titolo cercato, data, dimensioni);
  - download con `safePublicDownload` (stesse protezioni delle copertine: niente rete locale, redirect riconvalidati), al massimo 16 MB, solo immagini vere;
  - un gioco senza immagine non viene cercato di nuovo per 7 giorni; un cambio del titolo di ricerca (`scrapeTitle`) rifà la ricerca;
  - esclusi i giochi Steam (spazio 3, a tutto schermo in gamescope: il desktop non si vede mai) e le card Web Stream;
  - una sola ricerca per gioco alla volta.
  - `prefetchSpaceBackgrounds()`: in background i giochi installati che ancora non hanno lo sfondo, uno alla volta con 2 s di pausa (IGDB permette 4 richieste al secondo).
- **`src/backend/metadataManager.ts`** — `findSpaceArtwork()`:
  - IGDB: fra gli `artworks` del gioco il più largo con proporzioni fra 1,5 e 2,0 e almeno 1280 px, in `t_original` fino a 3840 px di larghezza (oltre, `t_1080p`);
  - altrimenti SteamGridDB: hero `3840x1240` o `1920x620`, il più largo.
- **`src/backend/gameManager.ts`** — al **lancio** di un gioco lo sfondo viene cercato se manca (senza bloccare il lancio: spaces.py lo applica appena il file arriva); dopo ogni aggiornamento dei metadati parte il riempimento in background.
- **`src/backend/coverCache.ts`** — `isImage()` esportata; la pulizia delle copertine riconosce anche `.bg` e `.bg.json`.

### `spaces.py`

- **`SpaceBackground`**: thread e connessione X propri.
  - L'immagine viene ridimensionata a riempire lo schermo (ritaglio centrale, lanczos, Pillow; per i JPEG molto grandi decodifica già ridotta), caricata una volta in un pixmap e impostata come sfondo della finestra radice, con `_XROOTPMAP_ID`/`ESETROOT_PMAP_ID`.
  - Le ultime 3 immagini restano pronte nel server X (circa 15 MB l'una a 1440p): tornare su uno spazio è immediato.
  - Un file illeggibile lascia il nero, senza nuovi tentativi finché il file non cambia.
  - Senza Pillow, o senza connessione X, gli spazi restano neri con una riga nel log.
- **`_space_bg_sync()`**:
  - spazi 1–2 → sfondo del gioco dello slot; Dashboard (0), Steam (3) e slot vuoti → nero;
  - chiamata prima del cambio di desktop in `switch_space` (sfondo già pronto all'arrivo), a ogni cambio di desktop esterno e a ogni giro del ciclo principale, così un file scaricato dopo il lancio viene applicato appena arriva.
- `X_LAUNCHER_SPACE_BG=0` in `~/.config/openbox/environment` lo disattiva.

### Altri file

- **`INSTALL.md`** — sezione «Sfondo degli spazi dei giochi». **`.env.example`** — nota sulle chiavi usate e sull'interruttore. Versione 3.2.29-dev.17 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc` con gli stessi 7 errori preesistenti; `npm run build` riuscito; `py_compile spaces.py`.

**Demone** (16 prove, IGDB, SteamGridDB e download simulati):
- artwork IGDB scelto bene (scartati quelli verticali, piccoli e troppo larghi), `t_original`, file e `.bg.json` salvati;
- già presente → nessuna richiesta; ripiego sull'hero SteamGridDB più largo con le dimensioni ad alta risoluzione, chiave sanitizzata;
- nessuna immagine → nessun nuovo tentativo per 7 giorni, ma ricerca rifatta se cambia il titolo;
- esclusi Steam e Web Stream; il riempimento in background scarica i giochi installati;
- la pulizia conserva `.bg`/`.bg.json` dei giochi in libreria e toglie gli altri.
- **Trovato e corretto nelle prove**: un gioco già segnato «senza immagine» restava bloccato per sempre. La ricerca finiva prima di essere registrata fra quelle in corso e restava lì come se non fosse mai terminata, quindi un nuovo titolo di ricerca non partiva mai.

**`spaces.py` su Xvfb 2560×1440** (15 prove, lette direttamente dai pixel della finestra radice):
- immagine 3840×2160 applicata (pronta in circa 90 ms) e `_XROOTPMAP_ID` impostato;
- hero 3:1 ritagliato a riempire tutto lo schermo; nero per Dashboard, Steam e slot vuoto;
- ritorno immediato a un'immagine già pronta; file illeggibile → nero, nessun blocco;
- spazio in arrivo passato esplicitamente; file arrivato dopo il lancio applicato al giro successivo.

**Da provare su hardware reale** (`./build.sh compile`, riavvio del demone e **nuovo login** per `spaces.py`):
1. Nel log del demone, dopo un aggiornamento dei metadati: `grep '\[SPACE-BG\]' ~/.local/share/x-launcher/daemon.log` (sorgente e dimensioni per gioco); i file in `~/.local/share/x-launcher/covers/*.bg`.
2. Lanciare un gioco (meglio uno lento a caricare o con un launcher, come EA app): durante il caricamento si vede l'immagine del gioco invece del nero; nel `tray.log` `space background: <id>.bg ready in N ms`.
3. Con due giochi negli spazi 1 e 2, passando dall'uno all'altro con l'overlay: ognuno ha il suo sfondo, la Dashboard e Steam restano come prima.
4. Un gioco in finestra (non a schermo intero) mostra lo sfondo intorno; nessun calo di prestazioni in gioco (lo sfondo è un'immagine ferma).
5. `export X_LAUNCHER_SPACE_BG=0` in `~/.config/openbox/environment` e nuovo login → desktop di nuovo nero.

**Confermato su hardware reale (16 novembre 2026)**: v3.2.29-dev.17 — sfondi contestuali degli spazi dei giochi.

---

## v3.3.17-Mars — MILESTONE STABILE (16 novembre 2026)

Versione scelta dall'utente (v3.2.29-dev.17 → v3.3.17-Mars): salto di minor version (3.2→3.3) per la portata del ciclo, patch 17. Nessun cambiamento al codice delle funzioni in questa voce. Cambiano soltanto:
- il congelamento: versione in `package.json`, `package-lock.json` e nel letterale di `src/App.tsx`;
- le **nuove dipendenze** in `setup-linux.sh`, `install.sh` e `INSTALL.md`;
- changelog e roadmap.

Tutte le dev del ciclo sono state confermate dall'utente sull'HTPC.

**Riepilogo del ciclo (dev.1 → dev.17)**
- **Punti aperti della 3.2.28** (dev.1):
  - le card Web Stream non perdono più il runner (configurazione ripulita in base al runner, runner ripristinato dalla sync);
  - la chiusura di un gioco in background fa tutto ciò che fa quella dell'ultimo lanciato (tempo, plugin, launcher condiviso, richiesta di validazione);
  - la data di installazione sopravvive a un falso «disinstallato» di uno store (finestra di 1 ora).
- **`--keep-maximized`** (dev.2): un gioco che si riduce a icona (Dead Space 2) viene riportato a schermo intero da `spaces.py` (`window-rules.json`).
- **Screenshot** (dev.3 → dev.5):
  - si cattura la sola finestra del gioco negli spazi 1-2, in JPEG 85 in `multimedia/<gioco>/Screenshot/`, con una notifica per gioco e «Screenshot acquisito» in sovrimpressione;
  - la scorciatoia è il tasto **Share** (KEY_F12 dal device «Keyboard» di xpadneo) invece di Select + D-pad, che i giochi intercettavano.
- **Clip** (dev.6, dev.9):
  - Share tenuto avvia la clip, Share la ferma; c'è anche il pulsante **Rec** nell'overlay (X al centro, Rec a destra, etichette di solo testo sotto il pulsante selezionato);
  - `gpu-screen-recorder` sulla sola finestra, in pausa quando il gioco non è davanti e scongelato, al massimo 120 s, al massimo 3 clip temporanee in `/tmp`;
  - il pallino REC compare solo 3 s all'avvio e ogni 30 s: fisso causava tearing.
- **Sezione Multimedia** (dev.7, dev.8, dev.10):
  - voce del quick-menu, schede per gioco, visore con la barra di avanzamento a scalare;
  - per le clip temporanee salvataggio Nativa/FHD/HD (NVENC, ripiego x264) o scarto; per i file salvati eliminazione con conferma;
  - «Apri Multimedia» nelle notifiche; pulsanti del visore in fila.
- **Condivisione su YouTube** (dev.11 → dev.16):
  - architettura a servizi estendibile in `src/backend/share/`;
  - accesso col codice dal telefono (client OAuth «TV e dispositivi con input limitato»), token cifrati sull'HTPC;
  - finestra del post con la VirtualKeyboard (descrizione a 5 righe con scorrimento, 5000 caratteri);
  - caricamento ripristinabile in background, notifiche con QR del link o «Riprova»;
  - filigrana facoltativa «Condiviso con X-Launcher» (Noto Sans Black Italic, bordo grigio, antialias) e badge «Condiviso» in galleria e visore.
- **Sfondo degli spazi** (dev.17): artwork del gioco ad alta risoluzione (IGDB 16:9, poi hero di SteamGridDB) sul desktop dello spazio, scaricato al lancio e in background.

**Dipendenze** — le funzioni del ciclo usano strumenti di sistema che diventano **fondamentali**:
- `gpu-screen-recorder` (cattura e clip; Arch: repository extra, non più AUR), `ffmpeg`/`ffprobe` (miniature, riconversione, filigrana), ImageMagick (JPEG e miniature degli screenshot, cattura di ripiego);
- **`setup-linux.sh`**: le tre sono fra le fondamentali installate automaticamente (Arch `gpu-screen-recorder ffmpeg imagemagick`; Debian `ffmpeg imagemagick`; Fedora `ffmpeg-free ImageMagick`); per `gpu-screen-recorder` su Debian/Fedora, che non ha un pacchetto ufficiale, solo un avviso con l'indirizzo dei sorgenti; ImageMagick riconosciuto anche nella versione 6 (`convert`);
- **`install.sh`**: avviso (mai bloccante) se mancano `gpu-screen-recorder`, `ffmpeg`, `ffprobe` o ImageMagick, con i comandi per Arch e Debian;
- **`INSTALL.md`**: §1 nuova sottosezione «Screenshot, clip e Multimedia — FONDAMENTALE»; comando con `pacman` al posto di `yay`; §5 variabili `X_LAUNCHER_YOUTUBE_CLIENT_ID`/`_SECRET` e `X_LAUNCHER_SCREENSHOT_QUALITY`; §7 `multimedia/`, `media-shared.json`, `window-rules.json` e gli sfondi in `covers/`;
- dipendenza npm nuova: `qrcode` (arriva con `npm install`, già in `package.json`).

**Installer**: valgono `--devel` e `--relink-openbox` come prima. I file nuovi del ciclo entrano nella build di `./build.sh compile` come il resto: `src/backend/windowRules.ts`, `mediaLibrary.ts`, `spaceBackground.ts`, `share/`; `src/components/MediaLibrary.tsx` e `ShareDialog.tsx`; `scripts/diag-media-capture.sh`, `diag-pad-keys.py` e `share-login.sh`.

**Resta aperto (per il prossimo ciclo, CHANGELOG-20.md)**
- Condivisione: solo YouTube, con video privati per il limite di Google sulle app non verificate. Gli screenshot non hanno un servizio che li accetti (pulsante nascosto). Facebook pubblicherebbe solo su Pagine.
- YouTube conta la descrizione in byte: con molte lettere accentate un testo vicino ai 5000 caratteri viene accorciato (avviso nel post e riga nel log).
- Una clip temporanea salvata mentre è in caricamento perde il badge «Condiviso» (l'annotazione arriva a fine invio sulla clip temporanea, ormai spostata).
- Brevi tratti di tearing nei 3 s delle sovrimpressioni (screenshot, REC), accettati.
- Avviso «not loaded» nel log alla chiusura dello scope di un launcher condiviso: lasciato così per scelta.
- `gpu-screen-recorder` e `ffmpeg-free` su Debian/Fedora: nomi verificati sulla documentazione, non provati su hardware.
