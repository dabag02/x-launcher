# X-Launcher — Audit di sicurezza (analizzata la v3.0.1-Mars; correzioni chiuse in v3.1.6-Mars)

Data: 3 novembre 2026 · Metodo: analisi statica del codice, con il punto di vista di un attaccante · Ambito: `server.ts`, `src/backend/*`, `spaces.py`, `overlay.py`, `tray.py`, script di avvio/installazione, `xdash.service`, `xlaunch-handler.sh`. Non è stato eseguito nulla su hardware reale: le gravità assumono un HTPC raggiungibile dalla rete locale.

## Sintesi

Il problema di fondo è uno solo, ed è la causa di quasi tutto il resto: **il demone ascolta su `0.0.0.0:3000`, non chiede autenticazione, non controlla l'header `Host` e non ha CORS né protezione CSRF**. Ognuna delle oltre 100 rotte è quindi a disposizione di chiunque raggiunga la porta. Diverse rotte fanno cose pericolose per progetto (lanciare programmi, cancellare cartelle, scaricare ed eseguire), e due contengono iniezioni di comandi vere e proprie.

| # | Gravità | Falla | Dove |
|---|---|---|---|
| 1 | CRITICA | API senza autenticazione, esposta in rete, esecuzione di comandi come utente | `server.ts:89,1899` + `PATCH /api/games/:id/config`, `POST /api/launch` |
| 2 | CRITICA | Iniezione di comandi tramite `id` del runner (anche con richiesta GET) | `compatibilityManager.ts:206,232` |
| 3 | CRITICA | Path traversal + `rm -rf` tramite `id` del runner (GET) | `compatibilityManager.ts:262-273` |
| 4 | ALTA | Ripristino backup cloud: scrittura di file ovunque e sovrascrittura di `.env` | `cloudBackup/bundle.ts:105-132` |
| 5 | ALTA | Segreti in chiaro: DB senza permessi ristretti, `.env` nel backup cloud non cifrato | `db.ts`, `bundle.ts:73` |
| 6 | ALTA | Fuga di informazioni senza login (file system, log, eventi, debug) | `server.ts:334,606,722` |
| 7 | MEDIA | `open-url`: iniezione di opzioni e schemi arbitrari | `server.ts:644` |
| 8 | MEDIA | `xlaunch://`: iniezione JSON, schema invocabile da qualunque sito | `xlaunch-handler.sh` |
| 9 | MEDIA | `active-display`: dirotta i processi grafici verso un altro server X | `server.ts:538` |
| 10 | MEDIA | Rotte di sistema usabili per denial of service | `server.ts:998,1721,1764` |
| 11 | MEDIA | Stringhe di shell nel backend (iniezione di secondo ordine) | `gameManager.ts:188,2318,2347`, `downloadManager.ts:1246` |
| 12 | MEDIA | SSRF (richieste verso la rete interna) | `server.ts:1624`, `coverCache.ts`, test provider AI |
| 13 | BASSA | Installer manuale: percorso arbitrario accettato | `downloadManager.ts:1831` |
| 14 | BASSA | Socket di `spaces.py` di ripiego in `/tmp`, argomento `thaw` non validato | `spaces.py:169-177` |
| 15 | BASSA | `setup-linux.sh`: `curl \| sudo bash`; `/tmp/xlaunch-kiosk.log` prevedibile | script |
| 16 | BASSA | Unit systemd poco restrittiva, nessuna intestazione di sicurezza | `xdash.service` |

---

## 1 — CRITICA: API senza autenticazione, esposta in rete

**Dove.** `server.ts:89` (`app.use(express.json())`, nessun middleware di sicurezza) e `server.ts:1899` (`app.listen(PORT, "0.0.0.0")`).

**Cosa.** Chiunque raggiunga la porta 3000 può chiamare qualunque rotta. Due rotte da sole bastano per eseguire un programma:

1. `PATCH /api/games/:id/config` accetta `executablePath`, `launchArgs`, `launchCwd`, `prefixPath`, `runner` (e `PATCH …/compat` accetta `customEnv`, quindi anche `LD_PRELOAD` e `PATH`).
2. `POST /api/launch` avvia il gioco con quella configurazione.

Verifica innocua, da eseguire sul tuo sistema (crea solo un file):

```bash
curl -X PATCH http://HTPC:3000/api/games/<ID_GIOCO>/config -H 'Content-Type: application/json' \
  -d '{"executablePath":"/usr/bin/touch","launchArgs":"/tmp/xl-poc"}'
curl -X POST  http://HTPC:3000/api/launch -H 'Content-Type: application/json' -d '{"id":"<ID_GIOCO>"}'
ls /tmp/xl-poc
```

**Chi può sfruttarla.**
- **Qualunque dispositivo della rete locale**, direttamente.
- **Una pagina web aperta su un browser della rete** tramite *DNS rebinding*: il server non controlla l'header `Host`, quindi il browser può essere indotto a parlargli come se fosse same-origin.
- **Una pagina web, senza rebinding, sulle rotte GET con effetti collaterali** (vedi 2 e 3): una richiesta GET cross-site parte comunque, anche se il browser non lascia leggere la risposta. Quanto questo sia praticabile dipende dal browser: Chrome sta introducendo restrizioni sulle richieste verso la rete locale (*Local Network Access*), Firefox meno.
- I POST/PATCH con `Content-Type: application/json` da un altro sito sono bloccati dal browser per mancanza di CORS: la mancanza di CORS qui protegge.

**Impatto.** Esecuzione di comandi arbitrari con i permessi dell'utente che esegue `xdash`: lettura e cancellazione dei file personali, installazione di persistenza, furto delle credenziali degli store.

**Rimedio (in ordine).**
1. Default `HOST=127.0.0.1`; `0.0.0.0` solo con una variabile esplicita (`X_LAUNCHER_BIND`) e solo con il token del punto 3.
2. Middleware che rifiuta ogni richiesta il cui `Host` non sia `localhost`, `127.0.0.1` o `[::1]` (chiude il DNS rebinding) e, per i metodi che modificano, controlla `Origin`/`Sec-Fetch-Site`.
3. Token casuale (file `0600` in `~/.local/share/x-launcher/`), richiesto in `Authorization` da tutto ciò che non è la pagina stessa. `tray.py`, `kiosk-launch.sh`, `gamescope-session.sh`, `xlaunch-handler.sh` e `test-game.sh` chiamano il demone con `curl`: andranno aggiornati a leggere il token. In alternativa, un socket Unix `0600`.
4. Nessun GET con effetti collaterali: spostare su POST `install-stream`, `uninstall-stream` e simili.
5. Validare i campi di `PATCH …/config` (`executablePath` deve essere un file esistente e non una directory di sistema; niente `launchArgs` da rotte non autenticate).

---

## 2 — CRITICA: iniezione di comandi tramite l'`id` del runner

**Dove.** `compatibilityManager.ts:206` (`exec(\`protonup -i "${id}"\`)`) e `:232` (`curl -L "${url}" | tar …` con `url` costruito da `id`). Raggiungibile da `POST /api/runners/download` **e da `GET /api/runners/install-stream?id=…`** (`server.ts:748,756`). Non c'è nessuna validazione di `id`.

**Come.** In una stringa tra doppi apici la shell espande `$(...)` e gli apici backtick. Con `id=$(touch /tmp/xl-poc2)` il comando viene eseguito. Essendo un GET, è attivabile anche da una pagina web (immagine o `EventSource`, vedi punto 1) senza leggere la risposta.

**Impatto.** Esecuzione di comandi arbitrari, senza passare per la configurazione dei giochi.

**Rimedio.** Validare `id` con `^[A-Za-z0-9._-]+$` (e confrontarlo con l'elenco dei runner installabili); usare `execFile`/`spawn` con array di argomenti invece di `exec` con stringa; per il download usare `fetch` e l'estrazione con `tar` in argv, senza pipe in shell; rendere POST la rotta e togliere `install-stream` come GET.

---

## 3 — CRITICA: path traversal e `rm -rf` tramite l'`id` del runner

**Dove.** `compatibilityManager.ts:262-273`: `target = path.join(compatDir, id)`, poi `rm -rf "${target}"`. Raggiungibile da `GET /api/runners/uninstall-stream?id=…` (`server.ts:787`).

**Come.** `id=../../../../home/utente/Games` fa risolvere `target` fuori da `compatibilitytools.d`. Il solo controllo è `existsSync(target)`, quindi **qualunque directory esistente viene cancellata ricorsivamente**. Il commento nel codice dichiara un "vincolo di sicurezza" che nella pratica non c'è. Anche qui la richiesta è un GET.

**Impatto.** Cancellazione arbitraria di dati dell'utente (giochi, salvataggi, documenti).

**Rimedio.** Stessa validazione di `id` del punto 2; dopo `path.resolve`, verificare che `target` sia **dentro** `compatDir` (`target.startsWith(compatDir + path.sep)`) e non sia un link simbolico; usare `fs.rm(..., {recursive:true})` invece di una shell; rendere la rotta POST/DELETE.

---

## 4 — ALTA: ripristino del backup cloud

**Dove.** `cloudBackup/bundle.ts:105-132`, invocato da `POST /api/cloud-backup/restore` (`server.ts:1595`).

**Cosa.** Il bundle scaricato da Drive è un JSON gzip senza firma né cifratura. `restoreFromBundle` fa:
- `writeFileSync(path.join(AVATAR_DIR, avatar.filename), …)`: **`filename` non è validato**, quindi `../../.bashrc` o `../../.config/autostart/x.desktop` scrivono un file ovunque l'utente possa scrivere, con contenuto deciso dal bundle;
- sovrascrive `app.conf` e **`.env`**, che `xdash.service` carica come `EnvironmentFile` (un valore come `NODE_OPTIONS=--require …` o `LD_PRELOAD` diventa codice eseguito al riavvio del demone);
- importa i profili di compatibilità, che includono `customEnv`.

**Precondizione.** Serve poter alterare il file di backup (account Drive compromesso, token OAuth rubato, file manomesso). Per questo è ALTA e non CRITICA; il punto 1 consente però a chiunque di *avviare* il ripristino.

**Rimedio.** Per gli avatar usare `path.basename(filename)`, estensione consentita e dimensione massima, e verificare che il percorso finale sia dentro `AVATAR_DIR`. Non ripristinare `.env` dal bundle (o solo una lista bianca di chiavi); validare `app.conf` e `customEnv` (vietare `LD_*`, `PATH`, `NODE_OPTIONS`). Cifrare e firmare il bundle (HMAC con una chiave locale).

---

## 5 — ALTA: segreti in chiaro

- **Database.** Le chiavi API dei provider AI (`api_key`) e `client_secret` del cloud backup sono colonne `TEXT` in chiaro (`db.ts:204,231`). In `db.ts` `chmodSync` è importato ma non è mai usato: il file SQLite nasce con la umask del processo. Se la home non è `0700`, altri utenti locali possono leggerlo.
- **Backup.** `buildBackupBundle` (`bundle.ts:73`) mette **`.env` per intero** nel bundle caricato su Drive, compresso ma non cifrato. Il token OAuth resta in `tokens.json` con `0600`, che è corretto.
- **GET /api/ai/providers** maschera la chiave: bene.

**Rimedio.** `chmod 600` su DB e cartella dati alla creazione (`umask 077` all'avvio del processo); non includere `.env` nel bundle, oppure cifrarlo con una passphrase; opzionale: cifrare le chiavi nel DB con una chiave in keyring.

---

## 6 — ALTA: fuga di informazioni senza autenticazione

- `GET /api/filesystem/list?path=…` (`server.ts:722`) elenca **qualunque directory** leggibile, senza limiti alla home.
- `GET /api/debug` (percorsi di Steam, elenco giochi), `GET /api/logs` (log che possono contenere percorsi e messaggi di errore), `GET /api/config`, `GET /api/events` (flusso SSE con tutte le notifiche), `GET /api/process-manager/list`.
- `POST /api/logs` permette di scrivere righe arbitrarie nel log (log injection).

**Impatto.** Mappa completa del sistema per preparare gli attacchi 1–4.

**Rimedio.** Con l'autenticazione del punto 1 tutto questo rientra; in più, limitare `filesystem/list` a radici consentite (home, supporti rimovibili) e togliere `/api/debug` dalla build di produzione.

---

## 7 — MEDIA: `POST /api/open-url`

`server.ts:644`: `spawn('firefox', [url])` e `spawn('xdg-open', [url])` con `url` preso dal body senza controlli. Un valore che inizia con `-` viene interpretato da Firefox come **opzione** (profilo, nuova istanza…). Con `xdg-open`, schemi come `file://` o gestori registrati (compreso `xlaunch://`) vengono aperti.

**Rimedio.** Accettare solo `http:` e `https:` (`new URL(url)`), e passare l'URL dopo `--`.

## 8 — MEDIA: `xlaunch-handler.sh`

`xlaunch://` è registrato come gestore di schema per tutto il desktop (`xdg-mime`): **qualsiasi sito web può provare ad aprirlo** (il browser chiede conferma, salvo "ricorda la scelta"). Lo script inserisce `GAME_ID` direttamente in una stringa JSON: `-d "{\"id\":\"${GAME_ID}\"}"`. Un URI come `xlaunch://x","launchArgsOverride":"…` aggiunge campi al corpo, tra cui `launchArgsOverride`, che `POST /api/launch` passa al gioco.

**Rimedio.** Validare `GAME_ID` con una lista di caratteri consentiti, costruire il JSON con `printf '%s'`/`jq -n --arg`, ignorare `launchArgsOverride` per richieste che non vengono dalla Dashboard.

## 9 — MEDIA: `POST /api/system/active-display`

`server.ts:538`: `display` e `waylandDisplay` dal body diventano il `DISPLAY` di **tutti** i processi grafici lanciati poi (giochi, wine, wmctrl, xset). Un valore come `attaccante:0` sposta le finestre e l'input dei giochi su un server X remoto, se il tuo X accetta connessioni TCP, o più semplicemente rompe l'avvio dei giochi. Validare con `^:\d+(\.\d+)?$` e `^wayland-\d+$`.

## 10 — MEDIA: denial of service

Senza autenticazione chiunque può: terminare uno scope (`POST /api/process-manager/:unit/kill`), chiudere la Dashboard e il tray (`POST /api/system/exit`), far cambiare sessione all'utente (`dm-tool switch-to-user`, `POST /api/system/switch-session`) o cambiare spazio (`POST /api/spaces/:action`). Rientra nel punto 1.

## 11 — MEDIA: stringhe di shell nel backend (secondo ordine)

Dati "di casa" finiscono in comandi costruiti a stringa: `pgrep -f -- "${hint}"` (`gameManager.ts:188`, `hint` = nome dell'eseguibile), `legendary --yes uninstall ${appName}` e `nile uninstall ${productId}` (`:2318,2347`, id arrivati da cataloghi esterni), `find "${task.installerPath}"` (`downloadManager.ts:1246-1265`), `rm -rf`, `du`, `df`. Oggi sono raggiungibili solo con il punto 1 o con dati forniti dallo store, ma bastano un nome di file creativo o un id inatteso per eseguire comandi. **Rimedio:** sostituire sistematicamente `exec`/`execSync` con `execFile`/`spawn` e array di argomenti.

## 12 — MEDIA: SSRF

Il server fa richieste verso URL controllabili: `baseUrl` di Ollama (`GET /api/ai/ollama/models`, `POST /api/ai/providers/:id` e `…/test`), e i download delle copertine (`coverCache.ts`: `fetch` con `redirect: 'follow'` verso qualunque host, anche `localhost` e la LAN; ammette anche percorsi locali assoluti/`file://` copiati nella cartella delle copertine). Rischio: sondare servizi interni. **Rimedio:** consentire solo http/https, rifiutare indirizzi privati/loopback dopo la risoluzione DNS, non seguire redirect verso reti private, limitare le copie locali a cartelle note.

---

## 13 — BASSA: installer manuale

`confirmInstallerPath` (`downloadManager.ts:1831`) accetta qualunque file esistente come "installer" (richiede solo che il task sia in stato `awaiting_installer`). Verificare che sia un `.exe`/`.msi` dentro la cartella dei download o dei supporti rimovibili.

## 14 — BASSA: `spaces.py`

- Il socket di controllo sta in `/run/user/<uid>` con permessi `0600`: corretto. Se la directory non esiste, il ripiego è `/tmp/x-launcher-spaces-<uid>.sock`, un nome prevedibile in una cartella condivisa: usare `XDG_RUNTIME_DIR` o una directory privata creata con `0700`.
- `thaw <scope>` passa il valore a `systemctl --user thaw <scope>.scope` senza controllo del formato; il suffisso `.scope` limita i danni, ma conviene accettare solo `^xlauncher-[A-Za-z0-9_.-]+$`.
- `overlay.py` legge solo JSON dalle cartelle di traduzione e immagini (Pillow): un'immagine di dimensioni enormi nella cache delle copertine potrebbe far terminare l'overlay con un'eccezione. Verificare che `Renderer.art()` la intercetti e imporre `Image.MAX_IMAGE_PIXELS`.

## 15 — BASSA: script

`setup-linux.sh:77` esegue `curl … | sudo -E bash -` (script remoto con privilegi); le righe 233-257 suggeriscono `curl … | sh` per Ollama. Meglio il pacchetto della distribuzione o il download seguito da verifica. `xlaunch-handler.sh` scrive `/tmp/xlaunch-kiosk.log` con un nome fisso: un altro utente locale può predisporre un link simbolico; usare `$XDG_RUNTIME_DIR` o `mktemp`.

## 16 — BASSA: hardening del servizio

`xdash.service` ha già `NoNewPrivileges=true` e `ProtectSystem=full`, ed è eseguito come utente, non come root: bene. Aggiungere `PrivateTmp=true`, `ProtectKernelTunables=true`, `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6`, `ProtectHome=read-only` dove compatibile. L'applicazione non invia intestazioni di sicurezza (CSP, `X-Content-Type-Options`, `Referrer-Policy`) né `Cache-Control` sulle risposte API.

---

## Cose che funzionano

- **SQL:** le query usano parametri; `updateGameConfig` mappa i campi con una lista bianca (`colMap`), quindi niente SQL injection nei punti letti.
- **Frontend:** nessun `dangerouslySetInnerHTML`, `eval` o `new Function` in `src`; React esegue l'escape dei titoli arrivati dagli store.
- **Estrazione archivi:** `unzip` e `7z` sono lanciati con `execFileSync` e array di argomenti (nessuna shell).
- **Installazione di sistema:** `/opt/x-launcher` è `root:root` con `755/644`, quindi non c'è escalation di privilegi dai file dell'applicazione; `/usr/local/bin/x-launcher*` sono link verso `/opt`.
- **Token OAuth:** `tokens.json` ha permessi `0600`; la chiave AI viene mascherata nelle risposte GET.
- **Repository:** `.gitignore` esclude `.env`, `*.db`, `dist/`, `node_modules/`, `.venv-tray/`; nell'albero non ci sono chiavi o token in chiaro.
- **Chromium** parte senza `--no-sandbox` né `--disable-web-security`.
- **`spaces.py`/`overlay.py`/`tray.py`** non contengono percorsi che terminano o eseguono comandi forniti dall'esterno: i comandi del socket sono una lista fissa.

## Ordine consigliato dei lavori

1. **Subito** (un pomeriggio): bind su `127.0.0.1` per default, controllo di `Host`, validazione e `execFile` nei punti 2 e 3, GET con effetti collaterali → POST.
2. **Poi:** token di accesso (punto 1.3) con aggiornamento di `tray.py`, `kiosk-launch.sh`, `gamescope-session.sh`, `xlaunch-handler.sh`, `test-game.sh`.
3. **Poi:** ripristino backup (punto 4), permessi del DB e `.env` fuori dal bundle (punto 5), limiti a `filesystem/list` (punto 6).
4. **Infine:** punti 7–16, e sostituzione sistematica di `exec`/`execSync` con `execFile`.

## Limiti dell'analisi

È un'analisi statica: nessuna rotta è stata eseguita. `App.tsx` (circa 9.000 righe) e i plugin degli store sono stati controllati con ricerche mirate, non letti per intero. Le dipendenze npm non sono state verificate: lancia `npm audit` e `pip-audit` sul venv. Se l'HTPC non è mai raggiungibile da altri dispositivi e non si naviga con altri browser sulla stessa macchina, i punti 1–3 sono meno urgenti nella pratica, ma restano da correggere.

---

## Stato delle correzioni

| Punto | Stato | Versione |
|---|---|---|
| 1 — API senza autenticazione | **Corretto**: ascolto su `127.0.0.1`, controllo di `Host`/`Origin`/`Sec-Fetch-Site` (dev.2) + token di accesso con cookie di sessione per il browser (dev.3). Resta aperto solo l'uso con `X_LAUNCHER_AUTH=off` | 3.0.2-dev.2 / dev.3 |
| 2 — Iniezione di comandi (id runner) | **Corretto**: validazione + `execFile`, nessuna shell | 3.0.2-dev.2 |
| 3 — Traversal e `rm -rf` (id runner) | **Corretto**: validazione + percorso verificato + `rmSync` | 3.0.2-dev.2 |
| GET con effetti collaterali → POST | **Non più necessario**: token + cookie SameSite=Strict + rifiuto cross-site li proteggono (`EventSource` richiede GET) | 3.0.2-dev.3 |
| 4 — Ripristino backup cloud | **Corretto**: avatar, `.env` (lista bianca + unione), `app.conf`, `customEnv`, limiti di dimensione. In più, **nuovo (trovato durante la correzione): iniezione SQL tramite i nomi di colonna dei profili di compatibilità**, corretta. Non fatto: cifratura/firma del bundle con passphrase | 3.0.2-dev.4 |
| 5 — Segreti in chiaro | **Mitigato**: cartella dati `0700`, DB/`.env`/token `0600`; `.env` del bundle ridotto alle chiavi documentate. Restano: chiavi API in chiaro nel DB e nel bundle su Drive (serve cifratura con passphrase / keyring) | 3.0.2-dev.4 |
| 6 — Fughe di informazioni | **Mitigato**: richiedono il token (dev.3); `POST /api/logs` ripulito; `filesystem/list` con tetto di voci. Il percorso non è limitato alla home (il selettore di file lo richiede) | 3.0.2-dev.3 / dev.4 |
| 7 — `open-url` | **Corretto**: solo http/https puliti | 3.0.2-dev.5 |
| 8 — `xlaunch-handler.sh` | **Corretto**: id validato, JSON composto dopo il controllo, log fuori da `/tmp`. Resta per scelta di progetto: una pagina web può far lanciare (con la conferma del browser) un gioco già installato, con la sua configurazione | 3.0.2-dev.5 |
| 9 — `active-display` | **Corretto**: formati `:N[.M]`, `<nome>-N`, valori noti | 3.0.2-dev.5 |
| 10 — DoS | **Coperto** dal token (dev.3) | 3.0.2-dev.3 |
| 11 — Shell di secondo ordine | **Corretto** per tutti i punti con dati esterni (`find`, `pgrep`, `ps`, `legendary`, `nile`, `du`, `df`); restano chiamate con valori fissi nel codice | 3.0.2-dev.5 |
| 12 — SSRF | **Corretto**: download copertine con filtro sugli indirizzi alla connessione, redirect riconvalidati, copie locali solo di immagini; URL dei provider AI solo http/https | 3.0.2-dev.5 |
| 13–16 | Fatto | v3.0.2-dev.6 |

Ciclo chiuso con la milestone v3.1.6-Mars (ripasso finale fatto). Restano da decidere cifratura del bundle Drive con passphrase e cifratura delle chiavi API a riposo.
