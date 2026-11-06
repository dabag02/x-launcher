# CHANGELOG-12 — da v3.0.1-Mars

Prosegue da CHANGELOG-11.md (chiuso su MILESTONE STABILE v3.0.1-Mars).

Ciclo chiuso con la MILESTONE STABILE v3.1.6-Mars (voce qui sotto); la serie continua in CHANGELOG-13.md. Voci in ordine (dalla più recente): milestone, poi dev.6→dev.1. Ad ogni consegna reale si incrementa `-dev.N` in `package.json` E nel fallback letterale di `src/App.tsx`, oltre alla voce corrispondente qui.

Punti aperti ereditati dalla milestone (vedi in fondo a CHANGELOG-11.md): interruttori Bluetooth/Wi-Fi/LAN dell'overlay, scelta della rete Wi-Fi, "chiudi il gioco" dall'overlay, indicatore del congelamento nella Dashboard, regola sul quarto lancio (in pausa), giochi Steam via URI nella sessione Shell, Fase 5 (gestione di sistema senza desktop), `GET /api/process-manager/list` che risponde `[]` con un gioco vivo. Idea in sospeso (non implementata): congelare anche la Dashboard quando non è lo spazio corrente — appunti nella Roadmap, Step 21.

## MILESTONE STABILE v3.1.6-Mars — sicurezza (ciclo dev.1→dev.6)

Ciclo chiuso qui. Parte da v3.0.1-Mars e chiude i 16 punti di `SECURITY-AUDIT.md` (analisi del 3 novembre 2026), più l'opzione `--no-splash`. Il numero salta da 3.0.1 a 3.1.6 per scelta dell'utente (minor 3.1, patch 6 come il sesto passo del ciclo).

**Novità visibili**
- **Accesso con token.** Il demone ascolta solo su `127.0.0.1` e ogni rotta `/api` e `/avatars` chiede il token (`~/.local/share/x-launcher/api-token`, `0600`). Gli script e `tray.py` lo mandano da soli; il browser lo riceve con un codice monouso da 60 s e un cookie di sessione `HttpOnly`/`SameSite=Strict`. Apertura manuale: `/?xl_token=<token>`. Variabili nel `.env`: `X_LAUNCHER_BIND`, `X_LAUNCHER_ALLOWED_HOSTS`, `X_LAUNCHER_AUTH=off` (solo diagnosi). Dettagli in INSTALL.md, «Accesso e token».
- **`--no-splash`** per i singoli giochi (campo argomenti di lancio): il gioco parte senza splash né timeout di sicurezza. La logica della splash resta quella della v3.0.1-Mars.
- **Cloud Backup più sicuro**: il ripristino non scrive più fuori dalle cartelle previste e non sostituisce il `.env` (solo le chiavi documentate, unite a quelle locali).

**Correzioni di sicurezza (16 punti dell'audit)**
- **Critici (1–3):** API senza autenticazione/CSRF/DNS rebinding; iniezione di comandi e `rm -rf` tramite l'id dei runner (ora validato, senza shell).
- **Alti (4–6):** ripristino backup (avatar, `.env`, `app.conf`, `customEnv`, limiti di dimensione) e un'**iniezione SQL sui nomi di colonna dei profili di compatibilità** trovata durante la correzione; permessi (`0700` cartella dati, `0600` DB/`.env`/token); fughe di informazioni e log injection.
- **Medi (7–12):** `open-url` (solo http/https); `xlaunch://` (id validato); `active-display`; shell di secondo ordine (`find`/`pgrep`/`ps`/`legendary`/`nile`/`du`/`df` senza shell); SSRF delle copertine (filtro sugli indirizzi alla connessione, redirect riconvalidati, tetti di dimensione e tempo).
- **Bassi (13–16):** validazione dell'installer manuale; socket di `spaces.py` fuori da `/tmp` e scope `thaw` validato; limiti sulle immagini dell'overlay; `setup-linux.sh` senza `curl | sudo bash`; `xdash.service` più restrittivo; header di sicurezza HTTP.

**Verifiche.** dev.2→dev.6 compilati, avviati e confermati dall'utente sull'HTPC (compreso il ripristino di un backup reale su Google Drive e `xlaunch://` dal browser). La v3.1.6-Mars è confermata funzionante nella sessione Openbox «Shell» standalone, con il demone avviato da `xdash.service` (systemd) con le nuove restrizioni.

**Da sapere all'aggiornamento.** Riavvia demone, tray e finestra della Dashboard (le vecchie ricevono 401). Se usi il servizio di sistema ricopia `xdash.service` e fai `daemon-reload`. Le copertine con URL verso `localhost`/LAN non si scaricano più.

### Resta aperto (non incluso in questa milestone)

- **Cifratura** del bundle su Drive (passphrase) e delle chiavi API a riposo nel DB (punto 5 dell'audit, mitigato non chiuso): rimandate per scelta dell'utente.
- Un processo con i tuoi stessi permessi sull'HTPC può leggere `api-token`: il token protegge dalla rete e dai siti web, non dal malware locale.
- Restano gli aperti ereditati dalla v3.0.1-Mars: interruttori Bluetooth/Wi-Fi/LAN dell'overlay, scelta della rete Wi-Fi, «chiudi il gioco» dall'overlay, indicatore del congelamento nella Dashboard, regola sul quarto lancio (in pausa), giochi Steam via URI nella sessione Shell, Fase 5, `GET /api/process-manager/list` che risponde `[]` con un gioco vivo. Idea in sospeso, non implementata: congelare anche la Dashboard.

## v3.0.2-dev.6 — sicurezza, passo 5 dell'audit: punti 13–16 (installer, spaces.py, script, hardening)

- **Installer manuale (punto 13):** `validateInstallerFile` in `downloadManager.ts`, usata da `installer-select` e da "Sfoglia": serve una stringa, percorso assoluto, un file regolare (symlink risolto) con estensione `.exe`/`.msi`/`.cab`. Nessuna restrizione sulla cartella. Prima qualunque file esistente indicato via API veniva eseguito sotto Wine. La rotta controlla anche che `gameId` e `path` siano stringhe.
- **`spaces.py` (punto 14):** il socket di ripiego non è più `/tmp/x-launcher-spaces-<uid>.sock` (nome prevedibile in cartella scrivibile da tutti) ma `~/.cache/x-launcher/spaces.sock`, in cartella `0700`; il socket nasce già `0600` (umask) senza finestra fra `bind` e `chmod`. Cambiato in modo identico in `src/backend/spacesClient.ts`. Con `/run/user/<uid>` (il tuo caso) non cambia nulla. Il comando `thaw <scope>` accetta solo `xlauncher-[A-Za-z0-9_.@-]` (max 200) e `_systemctl` rifiuta il resto. `overlay.py`: `Image.MAX_IMAGE_PIXELS` = 40 Mpx, controllo dimensioni prima della decodifica, `draft()` per i JPEG.
- **`setup-linux.sh` (punto 15):** niente più `curl | sudo bash` per NodeSource (Debian/Ubuntu): lo script è scaricato in un file temporaneo e lanciato solo dopo conferma. I suggerimenti per Ollama (script e `INSTALL.md`) diventano scarica, leggi, esegui. Il log `/tmp/xlaunch-kiosk.log` era già stato corretto in dev.5.
- **Hardening (punto 16):** `xdash.service` aggiunge `ProtectKernelModules`, `ProtectKernelLogs`, `ProtectClock`, `RestrictSUIDSGID`, `LockPersonality`, `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK`. Volutamente NON `PrivateTmp`, `ProtectHome`, `RestrictNamespaces`, `MemoryDenyWriteExecute`, `ProtectControlGroups`, `ProtectKernelTunables`: il demone avvia i giochi e li romperebbero (spiegato nel file). `server.ts`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin` (i trailer YouTube ne hanno bisogno), `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store` su `/api/`. Nessuna CSP: il frontend Vite usa stili e script inline, la romperebbe.
- **Cambia per te:** nulla di visibile con la sessione Shell. Se usi il servizio di sistema, ricopia `xdash.service` e fai `daemon-reload` + restart.
- **Verifiche:** 13 casi di percorso installer (file, symlink valido, symlink verso `.sh`, directory `.exe`, relativo, inesistente, non stringa, byte nullo, `/etc/passwd`, `/dev/null`); `thaw` con scope validi e 11 ostili; socket reale creato con cartella `0700` e file `0600`; `py_compile`, `bash -n`; type-check `strict`. Non provato su hardware reale (né `xdash.service` con systemd).

## v3.0.2-dev.5 — sicurezza, passo 4 dell'audit: punti 7–12 (open-url, xlaunch://, DISPLAY, shell di secondo ordine, SSRF)

- **`POST /api/open-url` (punto 7):** nuovo `src/backend/urlSafety.ts`. Si accettano solo `http:`/`https:`, senza credenziali, senza spazi/a-capo, max 2048 caratteri. Prima un valore come `--new-instance` o `-profile ...` era letto da Firefox come opzione, e con `xdg-open` si aprivano `file://` o gestori come `xlaunch://`.
- **`xlaunch-handler.sh` (punto 8):** `xlaunch://` è registrato per tutto il desktop, quindi qualunque pagina web può provare ad aprirlo. L'id doveva già finire in una stringa JSON costruita a mano: un URI come `xlaunch://x","launchArgsOverride":"..."` aggiungeva campi al corpo. Ora l'id deve rispettare `^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$` (tutti gli id reali: `gog-`, `steam-`, `epic-`, `amazon-amzn1.adg.product.…`, `classic-<nome>-<hash>`), altrimenti il lancio è rifiutato; il JSON è composto solo dopo il controllo. Il log passa da `/tmp/xlaunch-kiosk.log` (percorso prevedibile, attaccabile con un symlink) a `$XDG_RUNTIME_DIR/xlaunch-kiosk.log` (o `~/.cache/`). `POST /api/launch` verifica inoltre i tipi (`id` stringa, `launchArgsOverride` stringa ≤ 4000 caratteri).
- **`POST /api/system/active-display` (punto 9):** `activeDisplay.ts` accetta solo `DISPLAY` nella forma `:N[.M]`, `WAYLAND_DISPLAY` come nome di socket (`wayland-0`, `gamescope-0`), `kind` `desktop|kiosk`, risoluzione `HD|FullHD|QHD|4K`. Un valore non valido non viene applicato e la rotta risponde 400 (prima un `attaccante:0` diventava il DISPLAY di tutti i giochi lanciati dopo). Gli script `kiosk-launch.sh`/`gamescope-session.sh` inviano già solo valori validi.
- **DoS (punto 10):** coperto dal token (dev.3); `process-manager/:unit/kill` agisce solo su scope presenti nel registro interno.
- **Shell di secondo ordine (punto 11):** nuovo `src/backend/safeExec.ts`. Eliminati tutti i `find "${cartella}" ... | head -1` costruiti a stringa (dentro le virgolette doppie la shell espande comunque `$(...)` e i backtick: una cartella o un id dal nome ostile eseguiva comandi): `sharedLauncherManager.ts`, `ubisoftConnectPlugin.ts`, `eaAppPlugin.ts`, `downloadManager.ts` (ricerca exe, installer GOG, Download) ora usano `find` con argomenti separati (`-print -quit`, che si ferma al primo risultato); `findInstallerInDownloads` è in JS (elenco, filtro e ordine per data). `gameManager.ts`: `pgrep`/`ps` con `execFileSync`; `legendary uninstall` e `nile uninstall` con `execFileSync` e id validato (`isSafeStoreId`: niente metacaratteri, non può iniziare con `-`). `compatibilityManager.ts`: `du`/`df` con `execFileSync`. **Restano** (valori fissi nel codice, non dati esterni): `which ${bin}` con nomi di programmi costanti, `ps aux | grep wine`, `ps --ppid ${proc.pid}` (pid numerico), `find /usr/share/steam /home -name eac_runtime` e `curl` verso l'API GitHub.
- **SSRF (punto 12):** `safePublicDownload` (urlSafety.ts) per le copertine: ogni connessione passa da un `lookup` che rifiuta indirizzi privati, loopback, link-local (compreso `169.254.169.254`), CGNAT, multicast e IPv6 equivalenti (anche mappati/NAT64) **dopo** la risoluzione DNS; redirect seguiti a mano (max 3) e riconvalidati; tetto di 8 MB; limite di tempo totale. Le copertine locali (percorso o `file://`) si copiano solo se sono davvero immagini (firma PNG/JPEG/GIF/WebP/BMP, ≤ 8 MB, file normale, symlink risolto): prima qualunque file leggibile indicato come "copertina" finiva nella cartella copertine. L'indirizzo di Ollama e dei provider AI deve essere `http`/`https` senza credenziali (non si bloccano gli indirizzi privati: Ollama è normalmente locale o in LAN); se salvato in modo non valido si usa il default.
- **`gameManager.ts`:** il file consegnato include di nuovo l'opzione `--no-splash` della dev.1 (la mia copia di lavoro era ripartita dalla Mars): se ti risulta diverso dal tuo, confrontalo prima di sovrascrivere.
- **Cambia per te:** (1) `xlaunch://` con un id che contiene caratteri strani non parte più (nessun id reale ne ha); (2) le copertine con URL che puntano a `localhost`/LAN non vengono più scaricate; (3) il log di `xlaunch-handler.sh` non è più in `/tmp`.
- **Verifiche:** type-check `strict` dei file toccati senza errori nuovi. Prove reali: cartelle chiamate `x$(touch PWNED1)y`, `a"; touch PWNED2; "b`, `` `touch PWNED3` ``, `-evil name` → `find` le attraversa senza eseguire nulla; confermato che il vecchio `pgrep -f -- "$(touch ...)"` ESEGUIVA il comando e il nuovo no. 20 casi di URL e 25 indirizzi (privati/pubblici). Server locali di prova: loopback, `localhost`, `[::1]`, metadata e `file://` rifiutati senza che il server riceva alcuna richiesta; redirect verso indirizzo bloccato, `file://` e loop fermati; risposta troppo grande, risposta che non finisce e server che manda un byte ogni 50 ms fermati. Cover cache: chiave privata, falso `.jpg`, symlink e cartella non copiati, PNG valido sì. Id `xlaunch://` ostili (`","launchArgsOverride":"`, `$(id)`, `;`, spazi) rifiutati, id reali accettati. Non provato sul tuo hardware.

## v3.0.2-dev.4 — sicurezza, passo 3 dell'audit: ripristino backup, permessi, log (SECURITY-AUDIT.md, punti 4, 5 e 6 in parte)

- **Ripristino del Cloud Backup trattato come input non fidato** (nuovo `src/backend/restoreSafety.ts`, usato da `cloudBackup/bundle.ts`):
  - **Avatar:** solo nomi semplici `nome.png|jpg|jpeg|webp|gif` (niente `../`, percorsi assoluti, SVG), contenuto verificato (firma PNG/JPEG/GIF/WebP), max 5 MB e 200 file, scrittura atomica dentro `avatars/`. Chiude la scrittura di file ovunque.
  - **`.env`:** dal bundle passano solo le chiavi documentate in `.env.example` (`STEAM_API_KEY`, `STEAM_ID`, `ROMS_PATH`, `STEAMGRIDDB_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`), **unite** al `.env` locale invece di sostituirlo: `X_LAUNCHER_*`, `NODE_OPTIONS`, `PATH`, `LD_*` ecc. non si ripristinano mai e le righe locali restano. Anche il bundle in uscita contiene ora solo quelle chiavi. File scritto con permessi `0600`.
  - **`app.conf`:** non si scrive il testo del bundle; si leggono solo le chiavi note con valori validi e il file è riscritto da `writeAppConfig`. `avatarUrl` deve essere `/avatars/<nome sicuro>`.
  - **Profili di compatibilità (iniezione SQL):** `importCompatProfilesRaw` costruiva l'`INSERT` con i NOMI delle colonne presi dal bundle (non nell'audit originale; scoperto leggendo il codice: l'SQL si poteva alterare, gli statement multipli no perché better-sqlite3 li rifiuta). Ora le colonne ammesse sono quelle reali della tabella, i valori solo stringa/numero/null, `custom_env` ripulito (scartate `LD_*`, `PATH`, `NODE_OPTIONS`, `BASH_ENV`, `PYTHONPATH`, `X_LAUNCHER_*`... e chiavi malformate) e `winetricks_verbs` ridotti a nomi validi.
  - **Dimensioni:** download da Drive max 40 MB, bundle decompresso max 120 MB (`maxOutputLength`: niente zip bomb), max 20.000 righe per sezione.
- **Permessi** (nuovo `src/backend/dataPermissions.ts`, chiamato all'apertura del DB e all'avvio del demone): cartella `~/.local/share/x-launcher` a `0700`; DB (e `-wal`/`-shm`), `.env`, `tokens.json`, `api-token` a `0600`. La umask del demone non cambia (i giochi e Wine la erediterebbero). Se qualcosa non è tuo, non viene toccato.
- **Log:** `POST /api/logs` toglie a-capo e caratteri di controllo e limita il messaggio a 2000 caratteri (log injection).
- **File manager:** `GET /api/filesystem/list` esamina al massimo 5000 voci per cartella e al massimo 30 estensioni di filtro. Il percorso NON è limitato alla home: il selettore deve poter arrivare a `/mnt`, `/run/media` ecc., e ora serve il token.
- **Cambia per te:** (1) il ripristino da backup ora *unisce* il `.env` e ignora le chiavi non documentate; (2) variabili come `LD_PRELOAD` in `customEnv` di un profilo ripristinato vengono scartate (nel log `[CloudBackup] Profilo ...: variabili scartate`): riaggiungile a mano dalla card del gioco se ti servono; (3) la cartella dati diventa `0700`: altri utenti del sistema (o servizi che girano con un altro utente) non possono più leggerla.
- **Non fatto:** cifratura del bundle con passphrase (richiede un campo nell'interfaccia: il bundle su Drive contiene ancora le chiavi API in chiaro, come prima ma senza più le impostazioni X_LAUNCHER_*) e cifratura a riposo delle chiavi nel DB.
- **Verifiche:** con better-sqlite3 reale e HOME temporanea, un bundle manomesso (avatar `../../.bashrc`, `../evil.png`, percorso assoluto, `.svg`, falso PNG con script, immagine da 8 MB; `.env` con `NODE_OPTIONS`/`X_LAUNCHER_AUTH=off`/`BIND`; `app.conf` con `avatarUrl` esterno; profilo con nome-colonna SQL, `LD_PRELOAD`, verbo `x; rm -rf ~`; zip bomb da 200 MB) non scrive nulla fuori da `avatars/`, non altera la tabella, non cambia le impostazioni di sicurezza e viene fermato dai limiti; cartella dati 755→700, DB e `.env` 0600. Non provato con un vero backup su Google Drive né sul tuo hardware.

## v3.0.2-dev.3 — sicurezza, passo 2 dell'audit: autenticazione con token (SECURITY-AUDIT.md, punto 1)

- **Token di accesso.** Nuovo `src/backend/authToken.ts`: token casuale (256 bit) in `~/.local/share/x-launcher/api-token`, permessi `0600`, creato al primo avvio (scrittura su file temporaneo + rename). Le rotte `/api` e `/avatars` rispondono 401 senza credenziali valide. Confronto a tempo costante. Unica rotta libera: `GET /api/status`.
- **Script e tray.** Header `X-XLauncher-Token` (o `Authorization: Bearer`). `tray.py`: `_auth_headers()`/`_daemon_get()`. Script shell: funzione `xl_curl` (il token passa a curl via `-K` da descrittore, non negli argomenti) in `kiosk-launch.sh`, `gamescope-session.sh`, `xlaunch-handler.sh`, `test-game.sh`, `scripts/diag-uri-launch.sh`, `scripts/diag-gamespace.sh`. Le sonde `GET /api/status` non cambiano.
- **Browser.** `POST /api/auth/nonce` (richiede l'header col token, non basta il cookie) restituisce un codice monouso valido 60 s. `kiosk-launch.sh` (entrambi i rami) e `gamescope-session.sh` lo aggiungono all'URL (`xl_browser_url`): il demone lo scambia con il cookie `xl_session` (HttpOnly, SameSite=Strict, valore derivato dal token con HMAC, non il token) e riporta il browser all'URL pulito, mantenendo `?localdev=1&spaces=1`. Il token vero non compare mai nella riga di comando del browser. Apertura manuale/altro dispositivo: `/?xl_token=<token>`; senza cookie, una pagina «Accesso richiesto» spiega come.
- **Interruttore:** `X_LAUNCHER_AUTH=off` nel `.env` spegne l'autenticazione (diagnosi / rientro rapido); scrive un avviso.
- **Log:** un solo avviso `[SECURITY] Accesso negato` ogni 30 s al massimo.
- **GET con effetti collaterali:** non convertiti in POST. Con token + cookie SameSite=Strict + rifiuto di `Sec-Fetch-Site: cross-site` (dev.2) un sito esterno non può più attivarli, quindi la conversione non è più necessaria per la sicurezza.
- **Verifiche:** server Express di prova con la stessa guardia e lo stesso middleware: senza token 401, token sbagliato 401, header/Bearer 200, token in query su `/api` rifiutato, codice monouso usabile una sola volta, `Host` estraneo 403 anche col token giusto; funzioni `xl_curl`/`xl_browser_url` degli script; `tray.py` (con e senza file token); Chromium reale: apertura col codice, cookie HttpOnly/SameSite=Strict che non contiene il token, `fetch` dell'API riuscito, ricarica col solo cookie, pagina senza cookie = «Accesso richiesto», pagina esterna che chiama il demone bloccata. Type-check: nessun errore nuovo (restano gli import duplicati di `server.ts` già presenti nella v3.0.1-Mars). **Non provato sul tuo hardware** né con `EventSource` (SSE) nel browser reale.
- **Da sapere:** dopo l'aggiornamento riavvia demone, tray e finestra della Dashboard (le vecchie ricevono 401). Se la Dashboard apre ma è vuota o l'avvio dei giochi non risponde: controlla `~/.local/share/x-launcher/logs` per le righe `[SECURITY]`, oppure prova con `X_LAUNCHER_AUTH=off` per isolare il problema. Il server di sviluppo (`npm run dev`) usa lo stesso middleware; il WebSocket HMR di Vite non passa dal middleware.

## v3.0.2-dev.2 — sicurezza, passo 1 dell'audit (SECURITY-AUDIT.md, punti 1 parziale, 2 e 3)

- **Ascolto solo locale.** `server.ts` ora fa `app.listen(PORT, '127.0.0.1')` invece di `0.0.0.0`. Per l'accesso da altri dispositivi: `X_LAUNCHER_BIND=0.0.0.0` (log di avviso) e `X_LAUNCHER_ALLOWED_HOSTS=nome1,nome2` nel `.env`.
- **Controllo delle richieste** (nuovo `src/backend/requestGuard.ts`, montato prima di `express.json()`): `Host` deve essere tra quelli ammessi (contro il DNS rebinding); un `Origin` presente deve essere ammesso; sulle rotte `/api` è rifiutato `Sec-Fetch-Site: cross-site`. Risposta 403 `{success:false}` e riga `[SECURITY]` nel log. curl e gli script locali non inviano `Origin`/`Sec-Fetch-Site` e non sono toccati.
- **Id dei runner validato** (nuovo `src/backend/runnerSafety.ts`): `/api/runners/download`, `install-stream`, `uninstall-stream` accettano solo `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` senza `..`; altrimenti 400.
- **Niente shell nei runner** (`compatibilityManager.ts`): `protonup` con `execFile`; il download manuale è `curl --proto =https | tar` come due processi collegati, senza shell; la cancellazione usa `rmSync` su un percorso verificato dentro `compatibilitytools.d`. Chiude l'iniezione di comandi (punto 2) e il path traversal con `rm -rf` (punto 3).
- **Non fatto in questo passo:** il passaggio GET→POST delle rotte con effetti collaterali. `install-stream`/`uninstall-stream` restano GET perché `EventSource` può usare solo GET: la protezione definitiva è il token di accesso (passo successivo), che coprirà anche quelle. Il controllo `Sec-Fetch-Site` le protegge nel frattempo dai siti terzi.
- **Verifiche:** controllo dei tipi dei file toccati senza nuovi errori (gli import duplicati di `readAppConfig`/`writeAppConfig`/`DATA_DIR` in `server.ts` sono già nella v3.0.1-Mars e non sono stati toccati); prova HTTP reale della guardia con Express (Host/Origin/cross-site respinti con 403, richieste locali 200, id con `$(...)`, `../..`, `;` e vuoto respinti con 400). Non provato sul tuo hardware.
- **Da sapere:** `127.0.0.1` è solo IPv4; `localhost` che risolve a `::1` verso un demone in ascolto su IPv4 è gestito dai client che ritentano (Chromium, curl). Se qualche tuo script usa `[::1]`, usa `127.0.0.1`.

## v3.0.2-dev.1 — opzione `--no-splash` per i singoli giochi

Al posto di cambiare la logica della splash per tutti (tentativo annullato, vedi la diagnosi sotto), un'opzione per gioco:
- Scrivi `--no-splash` nel campo **argomenti di lancio** della card (anche insieme ad altri, es. `--no-splash -windowed`; non nel percorso dell'eseguibile).
- `App.tsx`: se gli argomenti del gioco contengono `--no-splash` la splash non si apre.
- `gameManager.ts`: `--no-splash` viene tolto dagli argomenti (il gioco non lo riceve) e `raceSplashClose()` non parte: niente rilevamento finestra e niente timeout di sicurezza di 10 minuti che termina il processo. Vale anche per gli argomenti temporanei di test.
- Senza l'opzione, comportamento identico alla v3.0.1-Mars.
- Per quel gioco: niente barra di avanzamento né annullamento dalla splash, `window_class` non viene appreso (serve solo al rilevamento e al campo manuale), un gioco bloccato all'avvio si chiude dal Process Manager.

## Diagnosi — splash che resta aperta con i launcher condivisi (sessione Openbox) — nessuna modifica al codice

Con i giochi che usano un launcher condiviso la splash restava aperta in background perché il rilevamento finestra (`wmctrl`, `windowDetector.ts`) non riconosceva la finestra del gioco; allo scadere dei 10 minuti (`LAUNCH_WINDOW_TIMEOUT_MS` in `launchPhaseTracker.ts`) `splashOrchestrator.ts` terminava il processo di lancio (SIGTERM, poi SIGKILL). Il Process Manager invece identificava correttamente il gioco. `spaces.py`/`overlay.py` non terminano processi e non c'entrano. Un tentativo di correzione (v3.0.2-dev.1: chiusura della splash basata sul Process Manager + timeout non letale) è stato provato e **annullato** su richiesta: si torna al comportamento della v3.0.1-Mars.

## Note d'uso — Avvio di un gioco tramite URI del launcher condiviso (verificato, nessuna modifica al codice)

Provato su hardware reale: per lanciare un gioco passando dal launcher condiviso (invece di avviare l'exe del gioco, che si tira dietro il launcher) si usano **i campi già presenti nella card del gioco**. La Dashboard continua a comportarsi come prima per default.

Nella card del gioco:
- **Percorso eseguibile**: l'exe del launcher dentro la prefix condivisa;
- **Argomenti di lancio**: l'URI del gioco, senza virgolette (il backend non passa dalla shell, quindi la `&` non va protetta).

### Ricetta Ubisoft Connect
- Exe: `.../shared-launchers/ubisoft-connect/prefix/pfx/drive_c/Program Files (x86)/Ubisoft/Ubisoft Game Launcher/UbisoftConnect.exe` (o l'exe già usato dalla card `ubisoft-connect-launcher`)
- Argomenti: `uplay://launch/<APPID>/0`
- Verificato con Assassin's Creed Syndicate e Watch Dogs 2.

### Ricetta EA app
- Exe: `.../shared-launchers/ea-app/prefix/pfx/drive_c/Program Files/Electronic Arts/EA Desktop/EA Desktop/EADesktop.exe` (se la cartella "stabile" è vuota, copiarvi il contenuto di quella versionata: lo stub di `CreateSymbolicLinkW` in Wine non crea il link)
- Argomenti: `origin2://game/launch?offerIds=<contentID>&autoDownload=1`
- `<contentID>` = uno dei `<contentID>` in `<cartella del gioco>/__Installer/installerdata.xml` (dipende dall'offerta acquistata: provarli in ordine). Per Dead Space (2008) funziona `1002975`.
- Verificato con Dead Space.

### Come trovare l'id
- Ubisoft: l'APPID numerico del gioco nell'URI `uplay://launch/<APPID>/0`.
- EA: `contentID` in `installerdata.xml`, oppure il formato `Origin.OFR.50.<n>`.

### Limiti noti (invariati)
- A freddo, launcher e gioco finiscono nello scope `xlauncher-game-<id>-<ts>` del gioco: chiudere il gioco dal Process Manager chiude anche il launcher.
- Con il launcher già aperto, un secondo gioco finisce nello scope del launcher o del primo gioco: niente congelamento/chiusura per singolo gioco.
- Possibile evoluzione (NON implementata, solo su richiesta): interruttore "Avvio tramite URI" con adozione del processo in uno scope `xlauncher-game-<id>-<ts>` (`StartTransientUnit`), fallback al lancio attuale. Provato a mano: il congelamento del solo scope del gioco funziona e il launcher resta interattivo.

Script di supporto: `scripts/diag-uri-launch.sh` (modalità light/start/full, `--umu`, `--watch`, `--game-exe`).
