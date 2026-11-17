# CHANGELOG-18 — da v3.2.16-Mars

Prosegue da CHANGELOG-17.md (chiuso su MILESTONE STABILE v3.2.16-Mars).

Voci in ordine: la prima del ciclo sarà `## v3.2.17-dev.1` (o la patch che sceglie l'utente). Ad ogni consegna reale si incrementa `-dev.N` in `package.json` E nel fallback letterale di `src/App.tsx`, oltre alla voce corrispondente qui. Regola fissa: l'installer ha `--devel` accanto a `--relink-openbox`; tenerlo presente in ogni release.

Punti aperti ereditati dalla milestone: vedi «Resta aperto» nella voce della milestone in CHANGELOG-17.md.

---

## v3.2.17-dev.1 — filtri di ricerca delle librerie + filtri fissi nella tastiera virtuale

Richiesta dell'utente: i filtri di ricerca delle librerie non funzionano correttamente; una volta sistemati vanno portati anche nella ricerca della tastiera virtuale, come tag sotto il campo di testo. A differenza dei generi (che cambiano col contesto), questi tag sono **fissi**: a ogni apertura della ricerca si può sempre filtrare e ordinare la libreria.

### Bug trovati e corretti

1. **Tag genere/categoria "incollati" allo store di partenza** (`src/App.tsx`). Stavano in `storeFilters[activeStore]`, mentre il testo della ricerca è globale. Cambiando libreria con L1/R1 il tag restava sullo store di partenza e la chiusura della ricerca (Y, Esc, L1/R1 con la tastiera aperta) puliva solo lo store corrente: la libreria di partenza restava filtrata per genere anche a ricerca chiusa, senza nessun chip visibile. Ora i tag stanno in uno stato unico della ricerca (`searchTags`), azzerato alla chiusura qualunque sia lo store. `storeFilters` resta solo per «Installati» (preferenza di vista per store, come prima).
2. **Tag attivo che spariva** (`src/App.tsx`). I chip erano `[...new Set(games…)].slice(0, 8)` nell'ordine di comparsa: dopo la scelta di un genere la lista si ricalcolava sul risultato e il tag attivo poteva uscire dai primi 8, senza più modo di toglierlo. Ora (`contextualTags`, condiviso fra barra filtri e tastiera) i tag sono ordinati per frequenza, poi in ordine alfabetico, e quello attivo è sempre presente.
3. **Generi che portavano a zero risultati** (`src/App.tsx`). I chip erano calcolati su `games`, prima dei filtri lato client (Installati, plugin disattivati, store disconnessi). Ora sono calcolati sui giochi davvero visibili, senza la card virtuale di Big Picture.
4. **Ordinamento** (`src/backend/gameManager.ts`, `src/App.tsx`):
   - cambiando campo il verso restava quello corrente (di solito crescente): «Tempo di gioco» metteva in cima i giochi mai giocati, «Voto» quelli senza voto. Ora ogni campo parte dal verso naturale (Titolo A→Z; Tempo di gioco, Voto, Installazione dal più alto/recente); scegliere di nuovo il campo attivo inverte il verso (`selectSortField`);
   - i pareggi (decine di giochi con 0 ore, senza voto o non installati) uscivano nell'ordine del DB; ora sempre per titolo A→Z;
   - i valori mancanti (voto 0 = non trovato su IGDB, data assente o non valida) vanno sempre in fondo, in entrambi i versi;
   - titolo con confronto naturale («Doom 2» prima di «Doom 10», maiuscole e accenti ignorati).
5. Il pulsante del verso nella barra filtri mostrava `asc`/`desc` grezzi: ora «Crescente/Decrescente», «Ascending/Descending».

### Nuovo: filtri fissi nella tastiera virtuale

Nella ricerca da controller (Y), sopra le righe Generi/Categorie, una riga sempre presente:

**Filtri** — «Installati» (stesso stato del chip della barra filtri, per store) · **Ordina** — Titolo · Tempo di gioco · Voto · Installazione. Il tag di ordinamento attivo è evidenziato con la freccia ↑/↓; premendolo di nuovo si inverte il verso.

Navigazione: catena orizzontale `tag-filters` (`tag-filter-installed`, `tag-sort-<campo>`); giù → primo genere, prima categoria o primo suggerimento della tastiera; su dai generi (o dalle categorie senza generi) → «Installati»; su dalla prima riga della tastiera → l'ultima riga di tag presente. La riga non compare mentre si modificano altri campi (argomenti di lancio, variabili d'ambiente…).

Testi nuovi in IT/EN in `public/locales/{it,en}/dashboard.json`: `sortAsc`, `sortDesc`, `filters`, `sortLabel`, `sortShort.{title,playTime,rating,installDate}`.

Versione 3.2.17-dev.1 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc --noEmit` (anche server.ts) con gli stessi 7 errori preesistenti; `vite build` riuscito; `check-focus-ids.cjs` 113 id, nessun nuovo riferimento rotto (i due `key-sugg-0` segnalati sono dichiarati in `VirtualKeyboard.tsx`, fuori dall'analisi statica — falso positivo già presente); ordinamento provato con giochi finti su tutti e 4 i campi nei 2 versi (pareggi per titolo, mancanti in fondo, «doom 2» prima di «Doom 10»).

**Da provare su hardware reale**: Y → riga Filtri visibile, navigabile col D-pad, «Installati» e ordinamenti applicati subito alla griglia; genere scelto, L1/R1 su un'altra libreria, chiusura con Y → nessuna libreria resta filtrata per genere; tag attivo sempre visibile e deselezionabile; barra filtri col mouse coerente coi tag della tastiera.

---

## v3.2.17-dev.2 — data di installazione davvero tracciata

Domanda dell'utente: l'ordinamento «Installazione» ordina per spazio su disco o per data di installazione? **Per data** (`installedAt`), mai per spazio. Ma il dato di fatto non c'era: la colonna `games.installed_at` esisteva nello schema, però
- la valorizzava **solo Steam**, con `LastUpdated` del manifest, cioè la data dell'ultimo **aggiornamento** (un gioco installato anni fa e aggiornato ieri finiva in cima);
- l'upsert della sync la **sovrascriveva** sempre con quanto passato dal plugin, quindi per GOG, Epic, Amazon, Classic Console, Ubisoft ed EA restava NULL;
- `updateGameStatus` (installazione/disinstallazione completata dalla Dashboard) non la toccava.

Risultato: per tutti i giochi non Steam l'ordinamento «Installazione» finiva di fatto alfabetico (pareggi per titolo, dev.1).

### Regole nuove

La data si fissa **una volta**, al passaggio da non installato a installato, e si conserva alle sync successive; torna NULL quando il gioco risulta disinstallato. Fonti, in ordine di precisione (colonna nuova `installed_at_source`):

| Fonte | Quando |
|---|---|
| `event` | installazione completata dalla Dashboard (`updateGameStatus`): data esatta |
| `plugin` | Steam: data di **creazione** della cartella `steamapps/common/<installdir>` (ripiego su `LastUpdated` solo se la cartella manca); Epic: creazione della cartella `install_path` di `legendary list-installed` |
| `filesystem` | altri store: data di creazione dell'eseguibile o della ROM già registrati nel DB (o passati dal plugin) |
| `first-seen` | nessuna fonte disponibile: data della prima sync che vede il gioco installato |

Si usa la data di **creazione** (birthtime, statx su ext4/btrfs/xfs), non quella di modifica: installer e archivi conservano spesso la data originale dei file, che darebbe date di anni prima. Se il filesystem non espone la birthtime si ripiega sulla ctime; date anteriori al 2000 o nel futuro sono scartate.

**Migrazione**: all'avvio, se manca `installed_at_source`, la colonna viene aggiunta e **tutte** le date vecchie azzerate una volta sola (erano i `LastUpdated` di Steam): la prima sync le ricalcola con le regole nuove.

**Backup**: nessun cambiamento — il backup Drive non contiene il DB della libreria (`bundle.ts` esporta solo i profili di compatibilità), quindi la data resta solo locale, come richiesto.

### File

- **`src/backend/installDate.ts`** (nuovo) — `estimateInstallDate(percorsi)`: birthtime (o ctime) del primo percorso valido.
- **`src/backend/db.ts`** — migrazione `installed_at_source` + azzeramento una tantum; upsert con `CASE` (conserva la data esistente, NULL se disinstallato); `upsertGame` calcola la data solo quando serve (stima dal filesystem solo alla transizione → installato); `updateGameStatus` con fonte `event`.
- **`src/backend/plugins/steamPlugin.ts`** — creazione della cartella del gioco al posto di `LastUpdated`.
- **`src/backend/plugins/epicPlugin.ts`** — `getInstalledFromLegendary` restituisce anche `install_path` (Map invece di Set).
- **`public/locales/it/dashboard.json`** — tag «Installazione» → «Data installazione» (l'etichetta corta era ambigua).
- Versione 3.2.17-dev.2 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc --noEmit` con gli stessi 7 errori preesistenti; prova su un DB temporaneo reale (better-sqlite3): DB creato con lo schema di v3.2.16 con una data `LastUpdated` di Steam → azzerata dalla migrazione; prima sync: Steam con data dal plugin (`plugin`), ROM con file reale (`filesystem`), GOG senza percorsi (`first-seen`); seconda sync con una data diversa da Steam → conservata; GOG disinstallato → NULL; Epic installato dalla Dashboard → `event`, conservato alla sync successiva anche se il plugin propone un'altra data.

**Limite noto**: un gioco senza nessun percorso noto (`first-seen`) che uno store segnala per errore come disinstallato (es. legendary in timeout) perde la data e alla sync dopo prende quella del giorno. Steam, Epic, GOG con eseguibile e ROM la ricalcolano invece identica dal filesystem.

**Da provare su hardware reale**: dopo l'avvio del demone e una sync, ordinamento «Data installazione» decrescente → in cima gli ultimi giochi installati davvero (non quelli aggiornati di recente su Steam); installando un gioco dalla Dashboard → sale subito in cima. Controllo diretto: `sqlite3 ~/.local/share/x-launcher/x-launcher.db "SELECT title, installed_at, installed_at_source FROM games WHERE is_installed=1 ORDER BY installed_at DESC LIMIT 15"`.

---

## v3.2.17-dev.3 — ciclo orizzontale sulle righe di filtri e tag

Richiesta dell'utente: nella ricerca della tastiera virtuale le righe **Filtri/Ordina**, **Generi** e **Categorie** devono ciclare come le righe della tastiera: arrivati all'ultima voce a destra (o alla prima a sinistra), un nuovo input nella stessa direzione seleziona la voce dal lato opposto.

Prima, oltre il bordo di una catena orizzontale il FocusProvider usciva dalla catena verso neighbors/scoring geometrico: a destra dell'ultimo tag il focus restava fermo o saltava a un elemento vicino.

- **`src/components/FocusProvider.tsx`** — nuova opzione `chainWrap` per le catene sequenziali (`Focusable`, `RegistryItem`, `register`): ai bordi l'indice gira sul lato opposto, solo per le direzioni dell'asse della catena (sinistra/destra per `horizontal`) e solo con almeno 2 elementi. Su/giù continuano a uscire dalla riga come prima (neighbors invariati). Le catene esistenti senza `chainWrap` si comportano esattamente come prima.
- **`src/App.tsx`** — `chainWrap` sulle catene `tag-filters` (Installati + 4 ordinamenti, una sola riga: dall'ultimo ordinamento si torna a «Installati»), `tag-genres` e `tag-categories`.
- Versione 3.2.17-dev.3 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc --noEmit` con gli stessi 7 errori preesistenti; `vite build` riuscito; `check-focus-ids.cjs` senza nuovi riferimenti rotti.

**Da provare su hardware reale**: Y → riga Filtri: destra fino a «Data installazione», ancora destra → «Installati»; sinistra da «Installati» → «Data installazione»; stesso comportamento su Generi e Categorie; su/giù fra le righe e verso la tastiera invariati.

---

## v3.2.17-dev.4 — tempo di gioco dei giochi Steam letto da Steam; Big Picture senza tempo di gioco

Segnalazione dell'utente: lanciando giochi Steam o Big Picture dalla Dashboard il tempo di gioco non viene registrato. Decisione dell'utente: per i giochi Steam il dato si prende direttamente da Steam; per Big Picture la voce del tempo di gioco si nasconde, perché non serve.

### Causa (giochi Steam)

Il tempo di gioco locale si somma alla chiusura del processo tracciato in `lastLaunchedGame` (`gameManager.ts`). Per i giochi Steam quel processo era `steam steam://rungameid/<id>`, che inoltra l'URI allo Steam già aperto ed esce in circa 1 s: il controllo di chiusura lo vedeva chiuso entro 8 s e lo trattava come **avvio fallito**, quindi niente tempo di gioco (e una notifica d'errore). A Steam chiuso, nella sessione Openbox, `ensureSteamSession` non restituisce alcun PID: il gioco non veniva tracciato affatto. Per Big Picture nessun tracciamento era previsto, e la card è virtuale (nessuna riga nel DB).

### Verifica su hardware (dati dell'utente, Limbo 48000)

`~/.steam/steam/userdata/<account>/config/localconfig.vdf`: `LastPlayed` si aggiorna all'avvio del gioco; `Playtime` (minuti) resta fermo durante la sessione e sale alla chiusura del gioco (477 → 482 dopo ~4 min 42 s), con Steam ancora aperto.

### Modifiche

- **`src/backend/plugins/steamPlugin.ts`** — `findLocalConfigPath()` (cartella dell'account da STEAM_ID o dall'utente MostRecent di loginusers.vdf, altrimenti il localconfig più recente), `readLocalPlaytimeMap()` (ramo `UserLocalConfigStore > Software > Valve > Steam > apps`, chiavi senza distinzione maiuscole/minuscole), `resolveSteamId()`. In `getLibrary()` le ore vengono dal file locale e dalla Web API, se configurata: vince il valore più alto. Nessuna chiave API necessaria.
- **`src/backend/gameManager.ts`** —
  - i giochi con runner `Steam Native` non vengono più tracciati via PID: niente più falso «avvio fallito», niente somma locale (il totale lo tiene Steam);
  - `startSteamPlaytimeWatch()`: controlla la data di modifica di `localconfig.vdf` ogni 10 s (`fs.watchFile`, polling) e alla modifica aggiorna subito le ore dei giochi Steam in DB (solo verso l'alto) e la libreria, senza aspettare la sync di 5 minuti. Vale anche per i giochi avviati da dentro Big Picture. Il percorso del file viene risolto di nuovo ogni 5 minuti.
- **`src/backend/db.ts`** — `setPlayTime(id, ore)`: valore assoluto, usato dal watcher.
- **`src/App.tsx`** — riquadro «Tempo di gioco» nascosto per la card Steam Big Picture; versione 3.2.17-dev.4 (anche in `package.json`).

**Effetto collaterale, solo fuori dalla sessione Openbox (desktop XFCE)**: lanciando un gioco Steam la Dashboard non si nasconde più via tray. Prima si nascondeva per pochi secondi e tornava insieme alla notifica d'errore dell'«avvio fallito», quindi non era un comportamento funzionante. Nella sessione Openbox spazi e congelamento sono di spaces.py (spazio 3) e non cambiano.

**Verificato**: `tsc --noEmit` con gli stessi 7 errori preesistenti; `vite build` riuscito; parser provato con un `localconfig.vdf` nello stesso formato di quello dell'utente (482 minuti → 8,03 h; zeri scartati; valori con virgolette interne ignorati senza rompere la lettura; scelta dell'account da SteamID64 e ripiego sul file più recente).

**Da provare su hardware reale**: gioco Steam dalla Dashboard per qualche minuto e chiusura del gioco → entro ~10 s il tempo di gioco della card sale (log `[STEAM] Play time updated from localconfig.vdf`), nessuna notifica d'«avvio fallito»; card Big Picture senza riquadro del tempo di gioco; all'avvio del demone, log `[STEAM] Watching …/localconfig.vdf`.

---

## v3.2.17-dev.5 — cronologia del tray vuota con `--local-server`

Segnalazione dell'utente: dopo la ricompilazione della dev.4 il tray non elenca più gli ultimi 3 giochi lanciati; la Dashboard è avviata con `--local-server`.

**Causa** (non legata alle dev.1–4): `tray.py` parla col demone indicato da `X_LAUNCHER_URL`, con default `http://localhost:3000` (xdash in /opt). Con `--local-server`, `kiosk-launch.sh` sposta `LAUNCHER_URL` sulla porta 3001 del demone di sviluppo ma non lo passava al tray. Con xdash fermo o non raggiungibile `fetch_recent_games()` falliva e l'errore veniva ignorato per scelta (lista vuota → «Nessun gioco recente»). Dallo stesso indirizzo sbagliato passavano anche il lancio dal menu del tray e il controllo «gioco in corso».

- **`kiosk-launch.sh`** — il tray viene avviato con `X_LAUNCHER_URL="$LAUNCHER_URL"`: segue sempre il demone della sessione (3000 di norma, 3001 con `--local-server`). L'indirizzo compare anche nel messaggio di avvio del systray.
- **`tray.py`** — riga `[tray] Daemon: <url>` all'avvio in `tray.log`, per vedere subito con quale demone parla.
- Versione 3.2.17-dev.5 in `package.json` e nel fallback di `src/App.tsx`.

**Nota**: `kiosk-launch.sh` non riavvia il tray se ne trova già uno attivo (`pgrep -f tray.py`). Un tray rimasto da una sessione precedente conserva il vecchio indirizzo: chiuderlo (`pkill -f tray.py`) prima di rilanciare, oppure fare un nuovo login.

**Verificato**: `bash -n kiosk-launch.sh`, `py_compile tray.py`.

**Da provare su hardware reale**: sessione con `--local-server` → `tray.log` mostra `[tray] Daemon: http://localhost:3001`; dopo un lancio dalla Dashboard, entro ~10 s il gioco compare in «Giochi recenti» del tray.

---

## v3.2.17-dev.6 — Dashboard bloccata durante i giochi Steam (desktop XFCE)

Segnalazione dell'utente: lanciando un gioco Steam la Dashboard continua a intercettare il controller, invece di bloccarsi come con tutti gli altri giochi sul desktop XFCE.

**Causa**: al lancio la Dashboard si congela (`setFocusFrozen(true)`) e ogni 3 s chiede `/api/system/game-running`; si sblocca al primo «non in esecuzione». Il demone rispondeva solo in base a `lastLaunchedGame`. Fino alla dev.3 per Steam conteneva il PID di `steam steam://rungameid/<id>` (uscito dopo ~1 s → sblocco in 3–8 s, insieme al falso «avvio fallito»). Dalla dev.4 per Steam non c'è più nessun tracciamento → sblocco al primo controllo. Lo stesso segnale fa nascondere la finestra al tray.

**Verifica su hardware** (Limbo 48000, desktop XFCE): a gioco aperto esiste `…/Steam/ubuntu12_32/reaper SteamLaunch AppId=48000 -- …/Limbo/limbo`, che sparisce alla chiusura del gioco con Steam ancora aperto. `RunningAppID` non esiste in `~/.steam/registry.vdf`: scartato.

### Modifiche

- **`src/backend/gameManager.ts`**:
  - al lancio di un gioco `Steam Native` riuscito, `trackSteamLaunch()` registra gioco e AppID (anche senza PID, cioè con Steam a freddo nella sessione Openbox);
  - `checkSteamRunning()`: in corso finché esiste il processo reaper di quell'AppID (`pgrep -f "SteamLaunch AppId=<id>( |$)"`, cache di 2 s; 48000 non corrisponde a 480 o 4800, provato). Finché il reaper non è mai comparso il gioco risulta «in avvio» per 120 s, oltre i quali il lancio è considerato annullato. Comparsa e chiusura del gioco finiscono nel log `[STEAM]`;
  - `getRunningGameStatus()`: ultimo gioco lanciato (tracciamento PID/scope invariato) oppure gioco Steam in corso. `isLastLaunchedGameRunning()` resta il segnale del controllo di chiusura dei giochi non Steam (non mescolato, per non bloccare la chiusura di un gioco aperto mentre Steam gioca).
- **`server.ts`** — `/api/system/game-running` usa `getRunningGameStatus()`: la Dashboard resta bloccata e il tray nasconde la finestra per tutta la partita Steam.
- Versione 3.2.17-dev.6 in `package.json` e nel fallback di `src/App.tsx`.

**Limite**: se un lancio Steam viene annullato prima che il gioco parta, la Dashboard resta bloccata fino a 120 s (la combinazione Select+L1+R1 la riporta comunque in primo piano).

**Verificato**: `tsc --noEmit` con gli stessi 7 errori preesistenti; pattern di `pgrep` provato con un processo finto con la stessa riga di comando del reaper reale.

**Da provare su hardware reale** (desktop XFCE): gioco Steam dalla Dashboard → Dashboard bloccata e nascosta per tutta la partita (log `[STEAM] … game process detected`); chiudendo il gioco la Dashboard torna entro ~3 s (log `[STEAM] … game closed`); nella sessione Openbox la Dashboard con un gioco Steam aperto deve comportarsi come con gli altri giochi (bloccata, reattiva tornando allo spazio 0).

---

## v3.2.17-dev.7 — tempo di gioco con due giochi aperti negli spazi

Problema aperto in dev.6, scelto dall'utente: `lastLaunchedGame` (gameManager.ts) segue **un solo gioco**. Con due giochi non Steam aperti negli spazi 1 e 2, lanciare il secondo sovrascriveva il primo, che non veniva più controllato fino alla chiusura: perdeva il tempo di gioco di tutta la sessione. Stesso buco nei blocchi «gioco in esecuzione» di installazione, disinstallazione, download e rilancio, e nello stato letto da Dashboard e tray.

### Modifiche (`src/backend/gameManager.ts`)

- **`isTrackedLaunchAlive(entry)`** — il controllo «la sessione è ancora viva?» estratto **senza modifiche** da `isLastLaunchedGameRunning()` (scope/cgroup, nome del processo, margine di avvio, PID diretto), per applicarlo a qualunque sessione. `isLastLaunchedGameRunning()` ora lo richiama: comportamento identico. Il log diagnostico si chiama `[DIAG] isTrackedLaunchAlive`.
- **`backgroundSessions`** — subito prima che un nuovo lancio sovrascriva `lastLaunchedGame`, `moveLastLaunchToBackground()` sposta qui il gioco precedente **se ancora vivo** (log `[LAUNCH] … still running: its session continues in the background`). Rilanciare lo stesso gioco non sposta nulla.
- **`pollBackgroundSessions()`** — a ogni giro del polling di chiusura (4 s): alla chiusura di una sessione in background somma il tempo di gioco (stessa soglia di 8 s della «chiusura rapida») e aggiorna la libreria. Solo il tempo di gioco: prompt di validazione, notifiche e kill dello scope dei launcher condivisi restano legati all'ultimo gioco lanciato, come prima.
- **Screensaver** — viene ripristinato solo quando non resta aperto nessun gioco (prima tornava attivo alla chiusura dell'ultimo lanciato anche con l'altro ancora aperto).
- **`isGameRunningById(id)`** — usato dai blocchi di installazione, disinstallazione, download e rilancio: considera anche i giochi in background.
- **`getRunningGameStatus()`** (`/api/system/game-running`) — risulta in esecuzione anche con un solo gioco rimasto aperto in background.
- Versione 3.2.17-dev.7 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc --noEmit` con gli stessi 7 errori preesistenti; prova con un `GameManager` reale su DB temporaneo e due processi al posto dei giochi: gioco A aperto da 10 min, lancio di B → A in background e ancora «in esecuzione»; chiusura di A → 0,167 h sommate ad A, sessione rimossa; rilancio dello stesso gioco → nessuno spostamento. Il ramo con scope systemd usa la stessa funzione già in produzione, non provabile qui.

**Da provare su hardware reale** (sessione Openbox): gioco A nello spazio 1, gioco B nello spazio 2 (log `… still running: its session continues in the background`); chiudere A → log `[LAUNCH] Game A (background session) closed after N min — play time added` e tempo di gioco di A aggiornato; chiudere B → tempo di B aggiornato come sempre.

---

## v3.2.17-dev.8 — card fissa Amazon Luna nel plugin Amazon Games

Richiesta dell'utente: una card fissa, nello stile di Big Picture, che lancia il cloud gaming Amazon Luna (`https://luna.amazon.it/?g=s`), gestita come un gioco normale: al lancio Luna occupa uno scope che si congela passando dal suo spazio a un altro.

### Prova a mano sull'HTPC (prima del codice)

- Chromium con profilo separato e `--app`: login Amazon, gioco in streaming e controller funzionanti.
- Lanciato in uno scope utente (`systemd-run --user --scope --unit=xlauncher-game-luna-test`), il processo principale del browser si sposta in `app-org.chromium.Chromium-<n>.scope` (come la Dashboard), i figli restano nel nostro scope.
- Congelando entrambi gli scope il gioco si ferma e non riceve input; dopo 60 s di congelamento lo stream cade e Luna torna alla sua home con un avviso di connessione scadente — **effetto collaterale accettato dall'utente**.

### Modifiche

- **`src/backend/plugins/amazonPlugin.ts`** — card fissa `amazon-luna` (riga **vera** nel DB, non virtuale come Big Picture): store Amazon Games, runner `Web Stream`, sempre installata, presente anche senza nile o senza login Amazon Games. Copertina e anteprima segnaposto SVG senza loghi né marchi. URL da `X_LAUNCHER_LUNA_URL`, altrimenti quello predefinito; usato solo al primo inserimento (l'upsert non sovrascrive mai `executable_path`, quindi un URL cambiato dalla card resta — provato).
- **`src/backend/runners/implementations.ts`** — runner `WebStreamRunner` («Web Stream»): un secondo Chromium con `--user-data-dir=~/.local/share/x-launcher/web-profiles/<id>` (obbligatorio: con il profilo della Dashboard Chromium passerebbe l'URL all'istanza già aperta), `--app=<url>`, `--class=xlauncher-web-<id>`, `--start-fullscreen`, lanciato nello scope `xlauncher-game-<id>-<ts>` come ogni gioco. Accetta solo URL `https://`. Browser da `X_LAUNCHER_WEB_BROWSER`, altrimenti il primo fra chromium, google-chrome-stable, google-chrome.
- **`src/backend/gameManager.ts`** — runner registrato; sempre senza splash (la finestra del browser sta fuori dallo scope del gioco: la splash non la troverebbe e scatterebbe il timeout di sicurezza); installazione e disinstallazione rifiutate per le card Web Stream.
- **`src/backend/metadataManager.ts`** — nessun arricchimento SGDB/IGDB per le card Web Stream (copertina, voto e generi di un titolo omonimo sarebbero sbagliati).
- **`spaces.py`** — `web_app_scopes(pid)`: una finestra il cui processo sta in `app-org.chromium.Chromium-<n>` e i cui figli stanno in uno scope `xlauncher-game-*` è un **gioco** (slot 1/2, overlay, copertina dallo scope), congelato come gruppo browser + figli, come la Dashboard. `dashboard_child_scope` generalizzato in `child_scope_with_prefix` (stesso codice). Il riconoscimento della Dashboard, che viene prima, non cambia.
- **`src/App.tsx`** — nessun pulsante Installa/Disinstalla per le card Web Stream; descrizione tradotta della card. Versione 3.2.17-dev.8 (anche in `package.json`).
- **`src/types.ts`** — `RunnerType` comprende `'Web Stream'`.
- **`public/locales/{it,en}/dashboard.json`** — `launcherDescriptions.amazon_luna`.
- **`.env.example`** — `X_LAUNCHER_WEB_BROWSER`, `X_LAUNCHER_LUNA_URL` (commentati).

Tutto il resto viene dal percorso normale dei giochi: tempo di gioco (scope con i figli del browser), cronologia del tray, limite di 2 giochi aperti, blocco della Dashboard, Gestore dei processi.

**Verificato**: `tsc --noEmit` con gli stessi 7 errori preesistenti; `vite build` riuscito; `py_compile spaces.py`; `check-focus-ids.cjs` senza nuovi riferimenti rotti. `web_app_scopes` con scope e figli finti (`XL_SPACES_TEST_SCOPES`/`XL_SPACES_TEST_CHILDREN`): Luna → gioco con gruppo `[app-org…, xlauncher-game-amazon-luna-…]`; Dashboard → non toccata; un Chromium qualunque e un processo senza scope → ignorati. Runner con un browser finto: argomenti come sopra, URL `http://` o vuoto e browser inesistente rifiutati con messaggio. Plugin su DB temporaneo: card inserita installata con runner Web Stream, URL modificato conservato alla sync successiva, metadati non toccati.

**Limiti noti**:
- dopo un congelamento lungo lo stream di Luna cade e torna alla home di Luna (verificato, accettato);
- l'overlay degli spazi mostra il titolo, non la copertina (la cache copertine non gestisce le immagini SVG incorporate);
- le opzioni della card (runner, prefix, profilo di compatibilità) restano visibili: cambiare il runner rende la card inutilizzabile finché non si rimette «Web Stream».

**Da provare su hardware reale** (sessione Openbox):
1. Spostare il profilo della prova a mano, per conservare il login: `mv ~/.local/share/x-launcher/luna-profile ~/.local/share/x-launcher/web-profiles/amazon-luna` (creare prima `web-profiles/`).
2. Dopo la sync, card «Amazon Luna» nella libreria Amazon Games (e in Tutti), senza Installa/Disinstalla.
3. Lancio → Luna a schermo intero nello spazio 1 (o 2); nel log di spaces.py `web app xlauncher-game-amazon-luna-…: browser in app-org.chromium.Chromium-…`.
4. Ritorno alla Dashboard dall'overlay → Luna congelata (`freezer: xlauncher-game-amazon-luna-… congelato`); ritorno a Luna → scongelata.
5. Chiusura di Luna → tempo di gioco aggiornato, gioco in «Giochi recenti» del tray.
6. Chiusura dal Gestore dei processi: verificare che anche la finestra del browser si chiuda (il processo principale sta fuori dal nostro scope).

---

## v3.2.17-dev.9 — copertina e hero di Amazon Luna: SteamGridDB e cartella locale

Richiesta dell'utente: la card di Luna deve fare lo scraping di copertina e hero come i giochi normali (SteamGridDB ha già le immagini di Amazon Luna), per riusarle anche nell'overlay degli spazi; in più una cartella locale `~/.local/share/x-launcher/web-art/amazon-luna/` per i casi in cui lo scraping non trova la voce giusta.

Nella dev.8 la card era esclusa da tutto l'arricchimento online (scelta mia, pensata per i dati IGDB), quindi niente copertina reale e, nell'overlay, solo il titolo (la cache delle copertine scarta la SVG incorporata).

### Immagini delle card Web Stream, in ordine di precedenza

1. **File locali** in `~/.local/share/x-launcher/web-art/<id>/`: `cover.(png|jpg|jpeg|webp)` (poster verticale) e `hero.(png|jpg|jpeg|webp)` (banner orizzontale). Per Luna: `web-art/amazon-luna/`. Con un solo file, viene usato per entrambe.
2. **SteamGridDB, corrispondenza esatta del nome** (maiuscole, spazi e punteggiatura ignorati) sul titolo per lo scraping o, se vuoto, sul titolo della card. Il normale `sgdbSearchGame` prende il primo risultato dell'autocompletamento: per «Amazon Luna» poteva essere un qualunque gioco con «Luna» nel nome. La ricerca parte solo se la copertina è ancora il segnaposto, un'immagine locale non più presente, o con il rifetch forzato.
3. **Il segnaposto del plugin**, anche quando le immagini locali vengono tolte e SteamGridDB non dà nulla (invece di lasciare un URL locale che risponderebbe 404).

IGDB resta escluso (voto, generi e descrizione di un titolo omonimo).

### Bug corretto anche per i giochi normali

Il rifetch forzato del **titolo per lo scraping** (opzioni del gioco) riscriveva il DB con `upsertGames`, che conserva sempre una copertina già presente: per un gioco che aveva già una copertina l'override non sostituiva mai l'immagine. Ora, se le immagini cambiano, vengono scritte direttamente (`db.setGameImages`). Stesso meccanismo alla sync per le card Web Stream, il cui segnaposto altrimenti resterebbe per sempre.

### File

- **`src/backend/webArt.ts`** (nuovo) — ricerca dei file locali, URL `/api/web-art/<id>/<cover|hero>?v=<mtime>` (il parametro fa ricaricare un'immagine sostituita), conversione inversa per la cache.
- **`server.ts`** — `GET /api/web-art/:id/:kind`: solo `cover`/`hero` in quella cartella, solo file che sono davvero immagini (stesso controllo della cache delle copertine).
- **`src/backend/metadataManager.ts`** — `enrichWebStreamImages()` (le tre fonti sopra) e `sgdbSearchGameExact()`, con riga di log dei risultati.
- **`src/backend/coverCache.ts`** — le immagini `/api/web-art/...` vengono copiate dal file locale nella cache dell'overlay; `isLocalImageFile` esportato.
- **`src/backend/db.ts`** — `setGameImages(id, cover, hero)`: scrittura diretta, solo se cambia qualcosa.
- **`src/backend/gameManager.ts`** — scrittura diretta delle immagini nel rifetch forzato e, alla sync, per le card Web Stream.
- **`src/backend/plugins/amazonPlugin.ts`** — `webStreamPlaceholderImages()` per tornare al segnaposto.
- Versione 3.2.17-dev.9 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc --noEmit` con gli stessi 7 errori preesistenti; `vite build` riuscito. Prova con DB temporaneo e SteamGridDB simulato: (1) risultati «Luna Abyss» + «Amazon Luna» → scelto il secondo, poster e hero scritti in DB al posto del segnaposto; (2) sync successiva → nessuna nuova ricerca; (3) nessun nome esatto → segnaposto invariato; (4) `cover.png` + `hero.jpg` locali → hanno la precedenza; (5) copiate nella cache dell'overlay (`covers/amazon-luna.cover` e `.hero`); (6) file locali tolti → di nuovo SteamGridDB; (7) file tolti e nessun risultato esatto → segnaposto. La rotta `/api/web-art` non è provata dal vivo (usa le stesse funzioni provate sopra).

**Da provare su hardware reale**:
1. Dopo il riavvio del demone (o entro la sync di 5 minuti) la card mostra poster e hero di SteamGridDB; nel log `[METADATA] SGDB exact search "Amazon Luna": … match "…"`.
2. Lanciata Luna, l'overlay degli spazi mostra la sua copertina.
3. Mettere `cover.png`/`hero.png` in `~/.local/share/x-launcher/web-art/amazon-luna/` → alla sync successiva (o salvando il titolo per lo scraping dalle opzioni della card) la card usa quelle.
4. Su un gioco normale con copertina già presente, cambiare il titolo per lo scraping → la copertina viene davvero sostituita.

---

## v3.2.17-dev.10 — rifiniture di Amazon Luna e pulsante di chiusura negli spazi

Segnalazioni e richieste dell'utente dopo la dev.9 (card, scraping e override confermati funzionanti):

### 1. Errore di nile nel log

`nile install luna --info --json` → `Couldn't find what you are looking for`: la sidebar chiedeva la «Dimensione prevista» anche per la card di Luna, e `getPredictedInstallSize` passava l'id `amazon-luna` a nile come prodotto `luna`.
- **`src/backend/gameManager.ts`** — nessuna richiesta di dimensione per le card Web Stream.
- **`src/hooks/usePredictedInstallSize.ts`**, **`src/App.tsx`** — nessuna richiesta e riquadro «Dimensione prevista» nascosto per le card Web Stream.

### 2. Luna sempre la prima in Amazon Games

**`src/App.tsx`** (`pinAmazonLuna` in `filteredVisibleGames`): nella libreria Amazon Games la card è sempre la prima, con qualunque ordinamento e qualunque filtro (Installati, genere, categoria). Il genere è filtrato dal server, che allora non la restituisce: la card si recupera dall'ultima versione vista (`lastLunaCardRef`). Solo la ricerca testuale la può nascondere, come per la card di Big Picture. In «Tutti» segue l'ordinamento come ogni altro gioco.

### 3. Pulsante rosso con la X nell'overlay degli spazi

In ogni spazio aperto tranne la Dashboard, un pulsante rosso con la X termina il processo dello spazio senza passare dal Gestore dei processi.
- **Navigazione**: giù dal riquadro selezionato → pulsante (anello blu ed etichetta «Chiudi»); sinistra/destra passano ai pulsanti degli altri spazi saltando la Dashboard; su torna al riquadro. Primo A → «Conferma chiusura» in rosso (scade da sola dopo 4 s come quella dei servizi, la annulla ogni spostamento o B); secondo A → chiusura («Chiusura in corso…»). Chiuso lo spazio da cui si era aperto l'overlay, si torna alla Dashboard; altrimenti l'overlay resta aperto e il riquadro sparisce.
- **`overlay.py`** — zona `close`, icona `x`, disegno del pulsante e dei suggerimenti dei tasti, chiusura in un thread (`_close_space_async`), testi IT/EN (anche in `public/locales/{it,en}/overlay.json`).
- **`spaces.py`** — `overlay_close_space(space)`: scongela l'intero gruppo dello spazio (una web app ha due scope), poi `daemon_kill_unit()` chiama il demone con la **stessa rotta del Gestore dei processi** (`POST /api/process-manager/<unit>/kill`, token da `~/.local/share/x-launcher/api-token`, indirizzo da `X_LAUNCHER_URL` come il tray). Così valgono anche lo scongelamento lato demone e la chiusura ordinata di Steam nello spazio 3. Mai la Dashboard, mai uno scope non `xlauncher-*`.

### 4. Chiusura del browser delle card Web Stream

Chromium tiene il suo processo principale fuori dallo scope del gioco: terminare lo scope (Gestore dei processi o pulsante X) chiudeva solo i figli.
- **`src/backend/runners/implementations.ts`** — `stopWebStreamBrowser(id)`: `pkill -TERM -f -- '--user-data-dir=<profilo>( |$)'`, cioè solo il Chromium con il profilo dedicato della card (mai la Dashboard, nemmeno un profilo dal nome simile — provato).
- **`server.ts`** — la rotta di chiusura del Gestore dei processi lo chiama dopo `killScope` per le card Web Stream.

### 5. Opzioni della card Web Stream

**`src/App.tsx`** — nel pannello opzioni di Luna nascosti: Runner Bridge, Compatibility Layer (resta il riquadro «nessuna opzione aggiuntiva»), dipendenze Winetricks e versione OS, variabili d'ambiente, classe della finestra (serve solo alla splash). Restano: indirizzo del servizio (il campo eseguibile, con etichetta «Indirizzo del servizio»/«Service URL», nuova chiave `serviceUrl` in `public/locales/{it,en}/gameOptions.json`), argomenti di lancio, titolo per lo scraping, id `xlaunch://`. Navigazione: stesse regole dei giochi Classic Console non RetroArch (dal pulsante di chiusura giù sull'indirizzo).

Versione 3.2.17-dev.10 in `package.json` e nel fallback di `src/App.tsx`.

**Verificato**: `tsc --noEmit` con gli stessi 7 errori preesistenti; `vite build` riuscito; `py_compile` di `overlay.py` e `spaces.py`; `check-focus-ids.cjs` senza nuovi riferimenti rotti. Overlay disegnato su immagine con dati finti (pulsante normale, selezionato, conferma armata, chiusura in corso). Navigazione con un gestore finto: niente pulsante sulla Dashboard, salto della Dashboard fra i pulsanti, conferma annullata dagli spostamenti, doppio A → chiusura dello spazio giusto, chiusura dello spazio corrente → ritorno alla Dashboard. `daemon_kill_unit` contro un demone HTTP finto: rotta, token ed esito corretti, demone irraggiungibile gestito. `stopWebStreamBrowser` con processi finti: chiuso solo quello col profilo di Luna.

**Da provare su hardware reale** (sessione Openbox, nuovo login per `spaces.py`/`overlay.py`):
1. Nessun errore di nile selezionando la card di Luna.
2. Amazon Games: Luna prima con ogni ordinamento e con filtri genere/Installati.
3. Overlay: giù sul pulsante di un gioco, A, A → gioco chiuso e riquadro sparito; su Steam nello spazio 3 → chiusura ordinata di Steam; sullo spazio corrente → ritorno alla Dashboard.
4. Luna chiusa dal pulsante X e dal Gestore dei processi → si chiude anche la finestra del browser.
5. Opzioni di Luna con le sole voci utili e navigazione col controller senza salti.

---

## v3.2.17-dev.11 — giochi Steam nello spazio 3 col runtime steamrt64: copertina e congelamento

Segnalazione dell'utente (sessione standalone, installazione `--devel`): lanciando Limbo dalla Dashboard partono regolarmente Big Picture e il gioco, ma l'overlay degli spazi mostra le iniziali su sfondo colorato invece della locandina, e congelando lo spazio 3 l'audio del gioco continua (anche con un altro gioco in primo piano).

**Causa — un cambiamento di Steam, non del nostro codice** (verificato dall'utente via SSH con Limbo aperto): il client avvia ora i giochi con il runtime `steamrt64` (`steam-runtime-launch-client` → `steam-runtime-supervisor` → `steam-launch-wrapper` → `reaper SteamLaunch AppId=48000 -- …/limbo`). I wrapper restano nello scope della sessione (`xlauncher-steam-session-…`), ma il **reaper e il gioco** finiscono in uno scope systemd proprio, **`app-steam-app48000-84728.scope`** (come fa Chromium con `app-org.chromium.Chromium-<n>`). Quindi:
- si congelava solo la sessione Steam, non il gioco → audio (e gioco) sempre attivi;
- `steam_running_appid()` cercava `SteamLaunch` come argomento a sé nello scope della sessione, dove ora restano solo i wrapper (che lo hanno dentro la stringa unica del `sh -c`) → AppID non trovato, niente copertina (la cache `covers/steam-48000.*` c'era).

Ipotesi del mixer/due Chromium esclusa: un processo congelato non può produrre audio, e Dashboard e Luna hanno scope propri.

### Modifiche (`spaces.py`)

- **`steam_app_scopes(scope_sessione)`** — gli scope `app-steam-app<AppId>-<pid>` con un processo il cui padre (o un antenato vicino) sta nello scope della sessione Steam: solo i giochi avviati da quella sessione, mai quelli di un altro Steam.
- **Gruppo di congelamento dello spazio 3** (`Freezer.members`) — la sessione Steam più, calcolati al momento, gli scope dei suoi giochi: si congela prima il gioco e poi Steam, si scongela al contrario. `Freezer` ricorda i membri effettivamente congelati (`frozen_members`) e scongela esattamente quelli, anche se nel frattempo non fossero più trovabili.
- **`steam_running_appid()`** — l'AppID viene dal nome dello scope del gioco (`app-steam-app48000-…` → 48000); la vecchia ricerca del reaper nello scope resta come ripiego per i client Steam precedenti.
- **`valid_scope()`** accetta i nomi `app-steam-app<n>-<n>`; **`thaw_leftovers()`** all'avvio scongela anche questi scope, se rimasti congelati.
- Log: un congelamento programmato su uno scope già chiuso (riga `Unit … not found` del log dell'utente, subito dopo la chiusura di Steam dall'overlay) non è più contato come errore del freezer.
- Versione 3.2.17-dev.11 in `package.json` e nel fallback di `src/App.tsx`.

Lato demone nessuna modifica: il controllo «gioco Steam in corso» della dev.6 usa `pgrep -f "SteamLaunch AppId=<id>"`, che trova il reaper in qualunque scope; la chiusura ordinata di Steam chiude anche il gioco.

**Verificato**: `py_compile spaces.py`; prova con i PID, i padri e gli scope reali dell'output dell'utente (`XL_SPACES_TEST_SCOPES`/`XL_SPACES_TEST_PARENTS`) e un `systemctl` finto: trovato `app-steam-app48000-84728`, escluso un gioco con padre fuori dalla sessione; AppID 48000 dal PID di gamescope; congelamento gioco → sessione, scongelamento sessione → gioco anche quando il gioco non è più trovabile; nome con caratteri estranei rifiutato. Riconoscimento di Luna e Dashboard invariato.

**Da provare su hardware reale** (sessione Openbox, nuovo login): Limbo dalla Dashboard → overlay con la locandina di Limbo; tornando alla Dashboard o passando a un altro gioco l'audio di Limbo si ferma (log `freezer: xlauncher-steam-session-… congelato`, preceduto dal congelamento di `app-steam-app48000-…`); tornando allo spazio 3 gioco e audio riprendono.

**Confermato su hardware reale (12 novembre 2026)**: v3.2.17-dev.11 — nella sessione standalone Limbo mostra la sua locandina nell'overlay e l'audio si ferma quando lo spazio 3 viene congelato.

---

## v3.2.28-Mars — MILESTONE STABILE (12 novembre 2026)

Numero di patch scelto dall'utente (v3.2.17-dev.11 → v3.2.28-Mars). Nessun cambiamento di codice in questa voce: solo il congelamento (versione in `package.json` e nel letterale di `src/App.tsx`, changelog, roadmap, `INSTALL.md`, pacchetto completo).

**Riepilogo del ciclo (dev.1 → dev.11)** — confermato dall'utente sull'HTPC dove non indicato diversamente; per il tempo di gioco Steam da `localconfig.vdf` (dev.4) e per il pulsante X e le opzioni ridotte di Luna (dev.10) non c'è una conferma esplicita nelle prove riportate (milestone congelata dall'utente dopo la dev.11).
- **Ricerca nelle librerie** (dev.1, dev.3): tag genere/categoria legati alla ricerca e non più «incollati» a uno store; tag contestuali ordinati per frequenza, con il tag attivo sempre visibile; ordinamento con verso naturale per campo, pareggi per titolo, valori mancanti in fondo, titolo con confronto naturale. Nella tastiera virtuale una riga fissa **Filtri** (Installati) · **Ordina** (Titolo, Tempo di gioco, Voto, Data installazione; di nuovo sullo stesso tag inverte il verso). Le righe di filtri e tag ciclano a destra/sinistra come la tastiera (`chainWrap` del FocusProvider).
- **Data di installazione** (dev.2): fissata una volta al passaggio a installato e conservata (`installed_at_source`: evento della Dashboard, cartella del gioco di Steam/Epic, eseguibile o ROM, prima sync); azzeramento una tantum dei vecchi `LastUpdated` di Steam. Non entra nel backup Drive.
- **Tempo di gioco** (dev.4, dev.6, dev.7): giochi Steam da `localconfig.vdf` (aggiornato alla chiusura del gioco, letto subito da un controllo ogni 10 s; Web API come seconda fonte), niente più falso «avvio fallito» per i giochi Steam; Dashboard bloccata (e nascosta dal tray) per tutta la partita Steam grazie al processo `reaper` di Steam; con due giochi aperti negli spazi il primo non perde più la sessione (sessioni in background); card di Big Picture senza tempo di gioco.
- **Tray con `--local-server`** (dev.5): il tray (e quindi `spaces.py`) parla col demone della sessione (`X_LAUNCHER_URL` passato da `kiosk-launch.sh`).
- **Amazon Luna** (dev.8 → dev.10): card fissa del plugin Amazon Games, runner `Web Stream` (Chromium separato con profilo proprio, scope `xlauncher-game-amazon-luna-*`), riconoscimento e congelamento negli spazi (browser + figli), sempre la prima in Amazon Games, copertina e hero da SteamGridDB con nome esatto o da `web-art/amazon-luna/`, opzioni ridotte alle sole utili, nessuna richiesta a nile; chiusura anche del browser dal Gestore dei processi.
- **Override delle copertine** (dev.9): il rifetch forzato del titolo per lo scraping sostituisce davvero un'immagine già presente (prima l'upsert la conservava sempre) — vale per tutti i giochi.
- **Pulsante rosso con la X nell'overlay degli spazi** (dev.10): chiude lo spazio passando dal demone come il Gestore dei processi.
- **Giochi Steam del runtime `steamrt64`** (dev.11): gioco in uno scope proprio `app-steam-app<AppId>-<pid>`, congelato con la sessione Steam dello spazio 3; copertina dall'AppID nel nome dello scope.

**Installer e setup**: nessuna modifica necessaria. I file nuovi (`src/backend/installDate.ts`, `src/backend/webArt.ts`) entrano nella build di `./build.sh compile` come il resto di `src/backend/`; le cartelle `web-profiles/` e `web-art/` in `~/.local/share/x-launcher/` si creano da sole (la seconda la crea l'utente se vuole immagini proprie). Valgono `--devel` e `--relink-openbox` come prima. Nuove variabili opzionali in `.env.example`: `X_LAUNCHER_WEB_BROWSER`, `X_LAUNCHER_LUNA_URL`.

**Resta aperto (per il prossimo ciclo, CHANGELOG-19.md)**
- Card Web Stream: cambiare il runner dalle opzioni la rende inutilizzabile finché non si rimette «Web Stream» (il selettore del runner è nascosto, ma il valore resta modificabile via API).
- Per un gioco in background (due giochi aperti) notifiche e chiusura del launcher condiviso restano legate all'ultimo gioco lanciato.
- Gioco senza nessun percorso noto (data di installazione `first-seen`): se uno store lo segnala per errore come disinstallato, la data riparte dal giorno della sync successiva.
- Avviso di gamescope `No CAP_SYS_NICE` e timeout di `d3ddriverquery64.exe` con GE-Proton: invariati da v3.2.16-Mars.
