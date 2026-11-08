# CHANGELOG-16 — da v3.2.5-Mars (CHIUSO su MILESTONE STABILE v3.2.12-Mars)

Prosegue da CHANGELOG-15.md (chiuso su MILESTONE STABILE v3.2.5-Mars).

Voci in ordine: la prima del ciclo sarà `## v3.2.6-dev.1` (o la patch che sceglie l'utente). Ad ogni consegna reale si incrementa `-dev.N` in `package.json` E nel fallback letterale di `src/App.tsx`, oltre alla voce corrispondente qui. Regola fissa: l'installer ha `--devel` accanto a `--relink-openbox`; tenerlo presente in ogni release.

Punti aperti ereditati dalla milestone: vedi «Resta aperto» nella voce della milestone in CHANGELOG-15.md.

---

## Obiettivo del ciclo — spazi 1-2 per i giochi, spazio 3 riservato a Steam

Richiesta dell'utente (sessione Openbox standalone):
- al massimo **2 giochi** contemporanei, negli spazi 1 e 2 (non più 3);
- **Steam Big Picture** lanciato dalla Dashboard in uno spazio esclusivo, il **3**, congelato come le altre app quando non ha il focus (altrimenti Steam Input intercetta il controller usato in un altro spazio).

Analisi (nessun codice): oggi Big Picture parte da xdash (`steam steam://open/bigpicture`) senza uno scope proprio, quindi non è congelabile; i giochi Steam (`steam://rungameid`) sono figli del client e restano nel suo cgroup (stesso caso già visto con Ubisoft Connect). Valutate due proposte:
- **A — gioco Steam nello stesso spazio 3 di Steam** (scelta dall'utente): Steam e gioco si congelano insieme come un unico scope; il gioco non resta mai senza client Steam vivo (API, overlay, Steam Input, DRM); i 2 slot restano liberi per gli altri giochi.
- B — gioco Steam nello spazio successivo: congelabile solo spostando i processi in un nuovo scope, ma il gioco dipende dal client Steam; con Steam congelato nello spazio 3 rischierebbe blocchi o la perdita del controller. Scartata.

Proposta dell'utente in aggiunta: avvolgere Steam e i suoi giochi in **gamescope annidato** dentro lo spazio 3. Se funziona, spaces.py vede una sola finestra (quella di gamescope, riconosciuta dallo scope) e l'ordine gioco/Big Picture lo decide gamescope con `-e`. Prima di scrivere codice va verificato su hardware reale (NVIDIA in modalità annidata, congelamento di un compositore, `-e` fuori dalla sessione dedicata, giochi lanciati dalla Dashboard che devono finire dentro gamescope).

Piano a step: dev.1 = 2 spazi per i giochi + spazio 3 riservato; poi lo scope di Steam (con o senza gamescope, secondo l'esito della prova), la classificazione in spaces.py, l'overlay e il rientro da Big Picture allo spazio 0.

### Strumento di prova (fuori versione) — `scripts/diag-steam-gamescope.sh`

Script nuovo, da lanciare via SSH con la sessione Openbox attiva. Non tocca la Dashboard né la versione dell'app.
- Prende DISPLAY, XAUTHORITY, DBUS e XDG_RUNTIME_DIR dal processo `openbox` dell'utente (via SSH il DISPLAY ereditato sarebbe sbagliato o assente).
- Chiude Steam (solo dopo conferma), passa al desktop 4 e avvia `gamescope -W/-H/-w/-h <risoluzione del primario> -f -e -- steam -gamepadui` nello scope di prova `xlauncher-steamtest-<ts>` (prefisso non gestito da spaces.py: nessuna interferenza con slot e congelamenti reali), staccato dalla sessione SSH (`setsid -f`).
- Guida l'utente con domande s/n nel terminale: T1 Big Picture e controller; T2 gioco lanciato da Big Picture (sopra BP, overlay Steam, ritorno a BP); T3 gioco lanciato dalla Dashboard (dove finisce, splash, visibile dentro gamescope); T4 freeze/thaw dell'intero scope con tempi misurati (Steam non deve reagire al controller da congelato; ripresa di video, audio, controller); T5 `steam -shutdown` e uscita di gamescope.
- Raccoglie nel log: versioni (gamescope, Steam, Xwayland, driver NVIDIA, `nvidia_drm modeset`), monitor, desktop di Openbox, `spaces.py ctl state|clients`, finestre di Openbox con PID e scope, processi dello scope con DISPLAY/WAYLAND_DISPLAY/SteamAppId, catena del gioco (`reaper SteamLaunch AppId=…`, pstree), controller con handler js prima, durante e dopo (pad virtuali di Steam), `xprop`/`xwininfo` della finestra di gamescope, output grezzo di gamescope, `console_log.txt` di Steam, righe `[spaces]` di tray.log, journal utente e kernel (Xid NVIDIA) dall'inizio della prova, riepilogo finale.
- Opzioni: `--res WxH`, `--freeze-s N`, `--gs-args "..."`, `--no-e`, `--keep-running`, `--dry-run`.
- Log: `~/.local/share/x-launcher/diag/steam-gamescope-<data>.log` (+ `…-gamescope.log`). Righe del log in inglese, domande in italiano.

**Verificato**: `bash -n`, `shellcheck -S warning` pulito, `--dry-run` con strumenti finti (rilevamento della risoluzione dal monitor primario, comando previsto). **Non ancora eseguito su hardware reale.**

### Esito della prova su hardware reale (8 novembre 2026)

`diag-steam-gamescope.sh` eseguito sull'HTPC (gamescope 3.17.0, NVIDIA 615.78.08 open, RTX 3070, 2560×1440). **gamescope annidato funziona e viene adottato**:
- T1: Big Picture a schermo intero nello spazio 3, comandabile col controller.
- T2: gioco (Limbo) lanciato da Big Picture sopra BP, overlay di Steam col tasto Guide, ritorno a BP alla chiusura.
- T3: gioco lanciato dalla Dashboard con `steam://rungameid` → finisce **dentro gamescope**, nello stesso scope di Steam (`reaper SteamLaunch` nello scope di prova); Openbox non vede finestre nuove.
- T4: freeze 5 ms, thaw 6 ms, nessuna CPU consumata da congelato; dopo il thaw ripresi immagine, audio e controller.
- T5: `steam -shutdown` → gamescope esce da solo, lo scope sparisce.
- Nessun errore Xid nel log del kernel.
- Dati per il codice: la finestra ha classe `gamescope/gamescope`, `_NET_WM_PID` = PID di gamescope; il titolo segue l'app in primo piano ("Modalità Big Picture di Steam", poi "Limbo"). Lanciando dalla Dashboard nessuno porta allo spazio 3: lo farà il backend dopo l'URI.
- Avviso di gamescope `No CAP_SYS_NICE`: lasciato così (`setcap` su gamescope può disturbare le variabili d'ambiente usate dall'overlay di Steam).

**Problema trovato durante la prova (non legato a Steam)**: nella sessione la Dashboard non si congelava. spaces.py all'avvio: `nessuno scope xlauncher-dashboard`. Diagnosi con i dati reali: kiosk-launch.sh crea regolarmente lo scope `xlauncher-dashboard-<ts>`, ma il processo principale di Chromium (156.0.8078.79) si trova in uno scope suo, `app-org.chromium.Chromium-<pid>.scope`; nel nostro restano solo crashpad, zygote, GPU, renderer e broker. Congelando solo il nostro, il processo principale (eventi della finestra e del controller) restava vivo. Escluso un altro Chromium aperto (nessuna sessione XFCE attiva). Chromium 156 è installato dal 1° novembre ma il 6 novembre il congelamento funzionava: lo spostamento non avviene a ogni avvio, causa precisa non accertata — la correzione sotto copre entrambi i casi.

---

## v3.2.6-dev.1 — 2 spazi per i giochi, spazio 3 riservato a Steam, Dashboard congelata in due scope

**`spaces.py`**
- `NUM_SLOTS = 2`: i giochi prendono gli spazi 1-2 (desktop 2-3). Nuova costante `STEAM_SPACE = 3` (desktop 4), riservato a Steam Big Picture e mai assegnato ai giochi. Il terzo gioco non ha slot e resta dov'è (come prima il quarto): la regola sul lancio in più resta in sospeso. Il log lo dice: `nessuno slot libero (max 2, spazio 3 riservato a Steam)`.
- **Dashboard come gruppo di scope**: alla comparsa della finestra, lo scope del PID della finestra (nostro `xlauncher-dashboard-*`, oppure `app-org.chromium.Chromium-<n>` creato da Chromium) più lo scope `xlauncher-dashboard-*` in cui sono rimasti i figli del browser (letti da `/proc/<pid>/task/*/children`, con ripiego sulla scansione di `/proc`). Il `Freezer` ha i gruppi: congela nell'ordine browser → figli, scongela al contrario, e un congelamento o scongelamento vale sempre per tutto il gruppo (anche quelli dell'overlay e il riallineamento al cambio di desktop). Se Chromium resta nel nostro scope, tutto come prima (un solo membro).
- `valid_scope` accetta, oltre a `xlauncher-*`, **solo** il formato esatto `app-org.chromium.Chromium-<cifre>` (niente altri scope di sistema o di altre app).
- All'avvio vengono scongelati anche eventuali `app-org.chromium.Chromium-*` rimasti congelati da una sessione interrotta.
- Nuove righe di log (in inglese): `Dashboard: window … pid=… freeze group=<membri>`, con un avviso se il browser è nello scope di Chromium ma nessun figlio è nel nostro. `ctl state` riporta i gruppi in `freeze.groups`.

**`openbox/rc.xml`** — nomi dei desktop: Dashboard, Gioco 1, Gioco 2, **Steam** (sempre 4 desktop). Commenti aggiornati. Openbox rilegge il file al riavvio della sessione (oppure `openbox --reconfigure`).

**`package.json`, `src/App.tsx`** — versione 3.2.6-dev.1 (`allowScripts` invariato).

**Verificato**: `python3 -m py_compile spaces.py`; test con systemctl finto e scope di prova (`XL_SPACES_TEST_SCOPES`, nuovo `XL_SPACES_TEST_CHILDREN`): nomi accettati/rifiutati, gruppo browser+figli, ordine di freeze e thaw, caso di un solo scope (comportamento di prima), nessuno scope, solo lo scope di Chromium, congelamento della Dashboard spento da `X_LAUNCHER_SPACES_FREEZE_DASHBOARD=0`, 2 slot e spazio 3 mai assegnato; ricerca dei figli su `/proc` reale. `rc.xml` XML valido. **Da provare su hardware reale.**

Da provare sull'HTPC:
1. All'avvio della sessione, in `tray.log`: `Dashboard: window … freeze group=app-org.chromium.Chromium-…,xlauncher-dashboard-…` (o un solo scope se Chromium non si è spostato).
2. Con un gioco nello spazio 1, la Dashboard non deve più reagire al controller (`x-launcher-spaces state` → entrambi gli scope congelati dopo circa 2 s; `systemctl --user show -p FreezerState <scope>` per ognuno).
3. Tornando allo spazio 0 la Dashboard risponde subito.
4. Un terzo gioco non riceve uno slot e lo spazio 3 non compare nell'overlay finché non c'è Steam.

**Confermato su hardware reale (8 novembre 2026, nuovo login)**: v3.2.6-dev.1 — con BioShock 2 nello spazio 1 lo scope della Dashboard risulta `frozen` e la Dashboard non reagisce al controller; tornando allo spazio 0 risponde subito. In questa sessione Chromium è rimasto nel nostro scope (`freeze group=xlauncher-dashboard-…`, un solo membro): lo spostamento in `app-org.chromium.Chromium-*` capita solo a volte. Provato anche Big Picture dalla card senza gamescope: schermo nero, finestra `steamwebhelper/steam` 1280×800 classificata `other` e lasciata nello spazio 0 — non aveva mai funzionato nella sessione Openbox (confermato dall'utente), si passa a gamescope.

---

## v3.2.6-dev.2 — Steam dentro gamescope nello spazio 3, Dashboard nel Gestore dei processi

**`src/backend/steamSession.ts`** (nuovo) — solo con il gestore degli spazi attivo (sessione Openbox); altrove `ensureSteamSession()` risponde `{ handled: false }` e tutto resta come prima.
- Avvia `systemd-run --user --scope --collect --unit=xlauncher-steam-session-<ms> gamescope -W/-H/-w/-h <primario> -f -e -- steam -gamepadui` (risoluzione da `xrandr --current`, ripiego 1920×1080; `WAYLAND_DISPLAY` tolto se la sessione è X11; output in `~/.local/share/x-launcher/steam-gamescope.log`). Lo scope finisce nel registro del Gestore dei processi (tipo `steam`).
- Sessione già aperta: inoltra l'URI (`steam steam://rungameid/<id>`) e chiede a spaces.py di passare allo spazio 3.
- Steam aperto fuori dalla sessione (avviato a mano o altrove): non ne avvia un secondo, risponde con un messaggio (IT/EN secondo la lingua della Dashboard) che compare come notifica di errore di lancio.
- Gioco con Steam chiuso: avvia la sessione, attende (max 90 s) che il client `steam` sia vivo nello scope e che esista `~/.steam/steam.pipe`, poi 5 s di margine e inoltra l'URI. Si conserva così il comportamento di sempre (il PID restituito è quello dell'inoltro, come prima).
- `shutdownSteamSession()`: `steam -shutdown`, poi SIGKILL dello scope se dopo 20 s è ancora attivo.

**`src/backend/runners/implementations.ts`** — `SteamNativeRunner.launch` passa da `ensureSteamSession`; fuori dalla sessione Openbox lancio via URI come prima.

**`server.ts`**
- `POST /api/system/steam-bigpicture`: nella sessione Openbox apre Big Picture nello spazio 3 e **non** chiama più `notifyBigPictureLaunched()` (lì la Dashboard la ferma il congelamento degli spazi; il blocco in pagina, senza un rientro esplicito, resterebbe acceso). Errori → notifica `launch-error` "Steam Big Picture".
- Gestore dei processi: l'elenco include la Dashboard (scope `xlauncher-dashboard-*`, scoperto con `systemctl`, mai nel registro) con `killable: false`; il kill di uno scope `xlauncher-dashboard-*` è rifiutato (403). Per la sessione Steam il kill è una chiusura ordinata (`shutdownSteamSession`).

**`src/backend/processManager.ts`** — tipi `steam` e `dashboard`; `listDashboardScopes()`, `isDashboardUnit()`; la ricognizione all'avvio del demone ricollega anche gli scope `xlauncher-steam-*`.

**`spaces.py`**
- Nuovo tipo di finestra `steam`: finestra di un processo nello scope `xlauncher-steam-*` (gamescope). Va nello spazio 3 e, alla prima comparsa, ci si passa. Lo spazio 3 entra nel ciclo e nell'overlay solo quando c'è Steam.
- Congelamento: lo scope di Steam si congela fuori dallo spazio 3 e si scongela prima di tornarci (anche aprendo/chiudendo l'overlay sopra Steam). Scongelati all'avvio anche eventuali `xlauncher-steam-*` rimasti congelati.
- Chiusura di Steam: dopo la tolleranza breve lo spazio 3 si libera e, se eri lì, torni allo spazio precedente (o alla Dashboard). Se la finestra ricompare entro la tolleranza lo spazio resta.
- `ctl state` riporta lo spazio 3 (`kind: "steam"`) con il titolo attuale della finestra di gamescope.
- Overlay: riquadro dello spazio 3 = il gioco Steam in corso (AppId letto da `reaper SteamLaunch AppId=<n>` nello scope; titolo e copertine dalla cache della Dashboard, chiave `steam-<AppId>`), altrimenti "Steam". La ricerca dei processi legge solo il cgroup dello scope, mai l'intero albero.
- Pad: presa e rilascio esclusivi serializzati con un lock (prima, chiudendo l'overlay, due thread potevano rilasciare insieme: `pad released (failed: [Errno 22])`).

**`overlay.py`** — colori propri per il riquadro "Steam" (blu scuro di Steam).

**`kiosk-launch.sh`** — rientro nella sessione con gli spazi: se il gestore degli spazi risponde e conosce già la finestra della Dashboard, lo script chiede solo di tornare allo spazio 0 ed esce. Serve alla card "X-Launcher" dentro Big Picture, che riesegue lo script *dentro* gamescope (dove `wmctrl` non vede nulla e sarebbe partita una seconda Dashboard nello spazio di Steam).

**`src/App.tsx`**
- Gestore dei processi: tipi Steam e Dashboard con icona e etichetta; la Dashboard mostra un lucchetto "Protetta" al posto del cestino ed è fuori dalla catena del focus (che collega solo le voci terminabili).
- Gate degli spazi: anche lo spazio di Steam conta come spazio di gioco (tornando alla Dashboard con un gioco Steam aperto, la Dashboard viene liberata).
- Versione 3.2.6-dev.2.

**`public/locales/{it,en}/processManager.json`** — `kindSteam`, `kindDashboard`, `protected`, `protectedHint`, sottotitolo aggiornato.

**Verificato**
- `tsc --noEmit` (anche su server.ts): stessi 7 errori di prima delle modifiche (import duplicati già presenti in server.ts e `howlongtobeat`), nessuno nuovo. `check-focus-ids.cjs`: invariato (111 id, il solo avviso già noto su `key-sugg-0`).
- `py_compile` di spaces.py e overlay.py; test con finestre e scope finti: Steam nello spazio 3 e passaggio automatico, Dashboard congelata, Steam congelato fuori dallo spazio 3 e scongelato al ritorno, gioco congelato andando su Steam, riquadro dell'overlay ("Steam", titolo della finestra, titolo e copertina dalla cache), chiusura di Steam con ritorno allo spazio precedente, finestra ricomparsa entro la tolleranza, spazio 3 non valido senza Steam, rilascio del pad da 4 thread insieme (un solo ioctl). Ricerca dell'AppId su `/proc` reale.
- steamSession.ts compilato con esbuild e provato con socket degli spazi e comandi finti: apertura di Big Picture (comando di gamescope corretto con la risoluzione del primario), gioco con sessione aperta (inoltro dell'URI e passaggio allo spazio 3), Steam aperto fuori (rifiuto con messaggio). Non provato qui: l'attesa del client al primo avvio con un gioco.
- `kiosk-launch.sh`: `bash -n`; rientro provato con un demone finto (Dashboard nota → `POST /api/spaces/dashboard` ed esce; Dashboard senza finestra → prosegue).
- **Da provare su hardware reale.**

Da provare sull'HTPC (sessione Openbox, Steam chiuso):
1. Card Big Picture → Steam si apre nello spazio 3, a schermo intero; nel Gestore dei processi compaiono "Steam (spazio 3)" e la Dashboard "Protetta".
2. Select + D-pad: l'overlay mostra il riquadro "Steam"; tornando alla Dashboard, Steam non reagisce più al controller (`x-launcher-spaces state` → scope `xlauncher-steam-…` in `frozen`).
3. Gioco Steam dalla Dashboard con Steam già aperto → si passa allo spazio 3 e parte il gioco; nell'overlay il riquadro prende titolo (e copertina) del gioco.
4. Gioco Steam dalla Dashboard con Steam chiuso → si apre lo spazio 3 e, dopo il caricamento del client, parte il gioco (`steam-gamescope.log` e `daemon.log` per i tempi).
5. Card "X-Launcher" dentro Big Picture → torni alla Dashboard senza una seconda finestra.
6. Esci da Steam (o "Termina" nel Gestore dei processi) → lo spazio 3 sparisce e torni alla Dashboard.
7. Steam avviato a mano fuori dalla sessione → la card Big Picture mostra il messaggio invece dello schermo nero.

**Esito su hardware reale (8 novembre 2026)**: v3.2.6-dev.2 — (1) la card Big Picture apre Steam nello spazio 3; (2) lo scope di Steam si congela tornando alla Dashboard; (3) un gioco Steam con Steam già aperto parte; con Steam chiuso invece si apriva il client desktop in finestra sopra la Dashboard, il gioco non partiva e restava uno Steam in background (fuori da qualsiasi scope `xlauncher-*`) che poi bloccava la card Big Picture; (4) dal Gestore dei processi Steam congelato non si chiudeva subito (log: `steam -shutdown`, poi kill dello scope solo dopo 20 s); (5) dalla card "X-Launcher" dentro Big Picture non si torna alla Dashboard (da indagare a parte).

Diagnosi dai log: al lancio a freddo delle 16:49:52 in `daemon.log` c'è `[STEAM] Launching via URI` senza nessuna riga `STEAM-SESSION` — il gestore degli spazi in quel momento non rispondeva (il `tray.py` attivo è nato subito dopo: sessione/tray riavviati) e il backend è ricaduto sul comportamento XFCE, `steam steam://rungameid/…` fuori da gamescope. Il collegamento non-Steam con le opzioni di avvio `%command% >> … 2>&1` (suggerite per la diagnosi) viene riscritto da Steam in `/bin/sh -c " $HOME/…/kiosk-reentry.log 2>&1 …"`: Steam prova a eseguire il file di log come comando ed esce subito. Da evitare; ora il log lo scrive lo script stesso (sotto). Anche con destinazione `/usr/local/bin/x-launcher-spaces` e opzione `dashboard` non si torna alla Dashboard e dopo pochi secondi Steam torna alla pagina del collegamento: indagine rimandata, con il nuovo log.

---

## v3.2.6-dev.3 — Steam mai fuori dallo spazio 3, chiusura con Steam congelato, log di kiosk-launch.sh

**`kiosk-launch.sh`**
- Nuovo log `~/.local/share/x-launcher/kiosk-reentry.log`: una sezione per ogni esecuzione, con processo padre, DISPLAY/WAYLAND_DISPLAY, variabili di Steam e gamescope (`SteamAppId`, `SteamGameId`, `GAMESCOPE_WAYLAND_DISPLAY`, `STEAM_COMPAT_DATA_PATH`, `LD_PRELOAD`, `LD_LIBRARY_PATH`), PATH, presenza di curl/wmctrl e del token, e ogni passo del rientro (esito di `GET /api/status`, risposta di `GET /api/spaces`, esito HTTP di `POST /api/spaces/dashboard`, quale ramo esce). Si accorcia da solo oltre ~512 KB. Righe in inglese.
- Avvio normale nella sessione Openbox: la segnalazione del DISPLAY al demone porta `"spaces":true`.

**`src/backend/activeDisplay.ts`, `server.ts`** — `POST /api/system/active-display` accetta `spaces` (booleano, validato); il demone ricorda se la sessione attiva è quella con gli spazi (`isSpacesSessionDeclared()`). La sessione Kiosk e XFCE lo azzerano.

**`src/backend/steamSession.ts`**
- Sessione con gli spazi dichiarata ma gestore degli spazi muto: attende fino a 8 s (una richiesta al secondo, risposta attesa fino a 1,5 s), poi rinuncia con un messaggio (IT/EN). **Mai più** il ripiego "come su XFCE".
- Gioco con Steam chiuso: l'URI va direttamente sulla riga di comando di Steam dentro gamescope (`… -- steam -gamepadui steam://rungameid/<id>`), senza attese né un secondo comando. Nessun PID restituito per il gioco (quello disponibile è gamescope: la splash, allo scadere, lo terminerebbe).
- Gioco con Steam aperto: prima il passaggio allo spazio 3 (spaces.py scongela Steam prima di cambiare desktop, la risposta viene attesa), poi l'URI; e solo se nello scope c'è un client Steam vivo e la sessione ha almeno 25 s (attesa fino a 45 s), altrimenti messaggio e nessun inoltro.
- Chiusura dal Gestore dei processi: prima scongela lo scope, poi `steam -shutdown` **solo** se nello scope c'è un client Steam (con Steam spento quel comando ne avvia uno nuovo: probabile origine dello Steam rimasto in background), poi kill dopo 20 s; senza client, kill diretto.

**`src/backend/spacesClient.ts`** — `waitSpacesActive(ms)` e `thawScope(unit)` (via gestore degli spazi, con ripiego su `systemctl --user thaw`).

**`server.ts`** — il kill dal Gestore dei processi scongela prima qualunque scope (giochi e launcher condivisi compresi).

**`package.json`, `src/App.tsx`** — versione 3.2.6-dev.3.

**Verificato**: `tsc --noEmit` (anche server.ts) con gli stessi 7 errori preesistenti; `bash -n kiosk-launch.sh`; rientro e log provati con un demone finto (sezione completa: ambiente, `GET /api/status` rc=0, risposta di `/api/spaces`, `POST` http=200, ramo d'uscita). steamSession.ts con esbuild, socket e comandi finti: sessione non dichiarata → comportamento di prima; dichiarata e spazi muti → rinuncia dopo 8 s senza avviare nulla; gioco a freddo → `steam -gamepadui steam://rungameid/48000` dentro gamescope, nessun inoltro; scope presente ma nessun client → passaggio allo spazio 3, nessun inoltro, messaggio dopo 45 s; chiusura → `thaw` al gestore degli spazi, poi kill (nessun `steam -shutdown` senza client). **Da provare su hardware reale.**

Da provare sull'HTPC (sessione Openbox):
1. Steam chiuso, gioco Steam dalla Dashboard → si apre lo spazio 3 e, a client pronto, parte il gioco (va verificato che Steam esegua l'URI ricevuto all'avvio).
2. Steam aperto e congelato, gioco Steam dalla Dashboard → passaggio allo spazio 3, poi il gioco.
3. Gestore dei processi con Steam congelato → Steam si chiude in pochi secondi e non resta nessuno Steam in background (`pgrep -a steam`).
4. Subito dopo il login, gioco Steam prima che il gestore degli spazi sia partito → al massimo un messaggio, mai Steam in finestra.
5. Per il rientro: collegamento non-Steam con destinazione `/opt/x-launcher/kiosk-launch.sh` e **nessuna** opzione di avvio, poi `kiosk-reentry.log`.

**Esito su hardware reale (8 novembre 2026)**: v3.2.6-dev.3 — il lancio a freddo di un gioco Steam non cambia: con l'URI sulla riga di comando (`steam -gamepadui steam://rungameid/<id>`) Steam apre prima il **client desktop** in finestra; solo chiudendolo dal menu di Steam si apre Big Picture e poi parte il gioco. Scelta dell'utente: lancio a freddo in due tempi (sempre) più l'avvio di Steam in background a inizio sessione come opzione, **spenta di default**.

---

## v3.2.6-dev.4 — lancio a freddo in due tempi, Steam in background opzionale

**`src/backend/steamSession.ts`**
- **Lancio a freddo in due tempi**: la sessione parte come quella della card Big Picture (`gamescope -e -- steam -gamepadui`, nessun URI sulla riga di comando); in background (la richiesta di lancio risponde subito) si attende che il titolo dello spazio 3, letto da spaces.py, contenga "Big Picture" (max 90 s), poi 2 s di margine e l'inoltro di `steam://rungameid/<id>`. Se il titolo non arriva entro 90 s l'URI parte comunque (con un avviso nel log); se lo scope finisce prima, niente. Il titolo della finestra di gamescope finisce nel log a ogni cambio (`window title "…"`).
- Sessione già aperta: dopo il passaggio allo spazio 3 l'URI parte quando c'è Big Picture a schermo oppure, per una sessione con più di 60 s e un gioco in primo piano, con un client Steam vivo nello scope (attesa max 60 s). Sostituisce l'euristica "25 s" della dev.3.
- **`prestartSteamSession()`**: apre la sessione in background con scope `xlauncher-steam-prestart-<ms>`; non fa nulla se Steam c'è già, dentro o fuori dalla sessione.

**`server.ts`** — `POST /api/steam/prestart`: risponde subito, l'esito va nel log (`[STEAM-SESSION] prestart: …`).

**`spaces.py`** — scope `xlauncher-steam-prestart-*`: la finestra va nello spazio 3 **senza** passarci; appena il titolo contiene "Big Picture" (o al più tardi dopo 120 s) lo scope viene congelato, se l'utente non è nello spazio 3. Da lì vale la regola normale (scongelato entrando nello spazio 3, congelato uscendo).

**`kiosk-launch.sh`** — con `X_LAUNCHER_STEAM_PRESTART=1` (es. in `~/.config/openbox/environment`; default spento) e la modalità spazi attiva, dopo l'avvio del tray attende in background che il gestore degli spazi risponda e chiama `POST /api/steam/prestart`; la richiesta finisce in `kiosk-reentry.log`.

**`package.json`, `src/App.tsx`** — versione 3.2.6-dev.4.

**Verificato**: `tsc --noEmit` (anche server.ts) con gli stessi 7 errori preesistenti; esbuild di server.ts; `bash -n kiosk-launch.sh`. steamSession.ts con socket degli spazi e comandi finti: la richiesta di lancio a freddo risponde in ~35 ms; con il titolo "gamescope" l'URI non parte; con "Modalità Big Picture di Steam" parte dopo ~2,2 s; la riga di comando di Steam non contiene l'URI; sessione aperta con Big Picture → switch, poi inoltro; prestart con sessione già aperta → nessun avvio, altrimenti scope `xlauncher-steam-prestart-*`. spaces.py: prestart senza passaggio allo spazio 3, nessun congelamento con il titolo "gamescope", congelamento con il titolo di Big Picture, congelamento allo scadere dei 120 s, nessun congelamento se l'utente è già nello spazio 3; test precedenti invariati. **Da provare su hardware reale.**

Da provare sull'HTPC (sessione Openbox):
1. Steam chiuso, gioco Steam dalla Dashboard → spazio 3 con Big Picture che si carica, poi il gioco (nessun client desktop). In `daemon.log`: `window title "…"` e `ready (Big Picture): forwarding …`.
2. Steam aperto (anche congelato) → spazio 3, poi il gioco.
3. Prestart: `X_LAUNCHER_STEAM_PRESTART=1` in `~/.config/openbox/environment`, nuovo login → Steam si carica nello spazio 3 senza mostrarsi; in `tray.log` `Steam prestart: Big Picture ready … freezing`; card Big Picture e giochi Steam immediati.

**Esito su hardware reale (8 novembre 2026)**: v3.2.6-dev.4 — il lancio a freddo apre ancora il client desktop; Big Picture e il gioco arrivano solo chiudendolo. Con la dev.4 attiva il backend fa la cosa giusta (in `daemon.log`: sessione senza URI, `window title "Modalità Big Picture di Steam"`, `ready (Big Picture): forwarding`, e in `console_log.txt` la stessa istanza in gamepadui riceve l'URI e avvia Limbo in ~3 s). La causa è **prima** di tutto questo: in `bootstrap_log.txt` alle 19:44:25 compare `Steam Client launched with: '…/steam' '-srt-logger-opened' '--version'` (senza `-gamepadui`, `GAMESCOPE_WAYLAND_DISPLAY is not set`), chiuso alle 19:45:18; subito dopo parte la sessione in gamescope e il gioco.

---

## v3.2.6-dev.5 — niente più `steam --version` prima del lancio

**Causa**: `gameManager.launchGame` scrive nel log la versione del runner prima di ogni lancio; per i giochi Steam `SteamNativeRunner.version()` eseguiva `steam --version` con `execSync`. Steam non ha quell'opzione: **con Steam chiuso il comando avvia il client desktop completo**, fuori da gamescope e sopra la Dashboard, e `execSync` resta bloccato finché quel client non si chiude. Solo allora il lancio proseguiva (sessione in gamescope → Big Picture → gioco). Con Steam già aperto il comando veniva inoltrato all'istanza in corsa, senza effetti visibili: per questo a caldo tutto funzionava. È anche l'origine dello Steam "in background" visto nella dev.2 (`pgrep`: `…/steam -srt-logger-opened --version`, fuori da ogni scope `xlauncher-*`).

**`src/backend/runners/implementations.ts`** — `SteamNativeRunner.version()` non esegue più Steam: legge la versione del pacchetto (`pacman -Q steam`), con ripiego su un testo fisso. Nessun altro punto del codice esegue il binario `steam` con opzioni che lo avviino (verificato con una ricerca: restano solo gli URI `steam://…`, già gestiti, e `steam -shutdown` solo con un client nello scope).

**`package.json`, `src/App.tsx`** — versione 3.2.6-dev.5.

**Verificato**: `tsc --noEmit` con gli stessi 7 errori preesistenti; ricerca di tutte le esecuzioni di `steam` nel backend. **Da provare su hardware reale**: con Steam chiuso, gioco Steam dalla card → nessun client desktop, Big Picture nello spazio 3 e poi il gioco; in `daemon.log` la riga `[LAUNCH] Runner: Steam (Native) — versione: steam …` non deve più far partire nulla (in `bootstrap_log.txt` nessun `'--version'`).

**Confermato su hardware reale (8 novembre 2026)**: v3.2.6-dev.5 — dopo il riavvio del demone (il ripiego di kiosk-launch.sh sulla porta 3001 aveva ancora in memoria il `server.cjs` precedente alla ricompilazione) il lancio a freddo funziona: Limbo apre Big Picture nello spazio 3 e poi il gioco, nessun client desktop. Confermata anche la chiusura di Steam dal Gestore dei processi con Steam congelato (dev.3).

Rientro dalla card "X-Launcher" in Big Picture: `kiosk-reentry.log` contiene solo gli avvii della sessione (padre `openbox/autostart`, nessuna variabile di Steam) — lo script non è mai stato eseguito da Steam. In `console_log.txt`: `/bin/sh -c " dashboard …steam-launch-wrapper … -- "/opt/x-launcher/kiosk-launch.sh""`. Le opzioni di avvio del collegamento (`%command% dashboard`, rimaste dalla prova con `x-launcher-spaces`) vengono riscritte da Steam mettendo il testo **davanti** al comando: la shell prova a eseguire `dashboard` ed esce subito. Regola: il collegamento non-Steam va lasciato **senza opzioni di avvio**. Secondo problema, che sarebbe emerso subito dopo: nella sessione di sviluppo il demone è sulla porta 3001 (`--local-server`), mentre lo script lanciato da Steam, senza argomenti, cercava solo la 3000 (xdash, spento).

---

## v3.2.6-dev.6 — rientro da Big Picture robusto

**`kiosk-launch.sh`**
- Il controllo del rientro prova i demoni sulla 3000 **e** sulla 3001 (con `--local-server` solo il proprio); il primo che risponde con il gestore degli spazi attivo e la finestra della Dashboard nota riceve `POST /api/spaces/dashboard`.
- Lanciato da Steam (`SteamAppId`/`SteamGameId`/`GAMESCOPE_WAYLAND_DISPLAY`) senza nessun demone raggiungibile: ripiego sul socket del gestore degli spazi (`openbox/spaces-ctl dashboard`).
- Dentro gamescope senza demone né socket: esce con un errore nel log invece di avviare una seconda Dashboard nello spazio di Steam. Fuori da gamescope (Steam su XFCE) prosegue verso il rientro classico con wmctrl.
- Ogni passo finisce in `kiosk-reentry.log` (URL provato, esito, ramo d'uscita).

**`package.json`, `src/App.tsx`** — versione 3.2.6-dev.6.

**Verificato**: `bash -n`; con un demone finto sulla sola porta 3001 e lancio "da Steam" senza argomenti: 3000 → rc=7, 3001 → rc=0, `POST` sulla 3001, uscita 0; senza demone né socket dentro gamescope → uscita 1 con la riga di log; fuori da gamescope → prosegue verso il ramo XFCE. **Da provare su hardware reale**: collegamento non-Steam con destinazione `"/opt/x-launcher/kiosk-launch.sh"`, cartella `"/opt/x-launcher/"`, opzioni di avvio **vuote**, nessuno strumento di compatibilità; dalla libreria di Big Picture → ritorno alla Dashboard, e in `kiosk-reentry.log` una sezione con `SteamAppId=3365871999`.

**Confermato su hardware reale (8 novembre 2026)**: v3.2.6-dev.6 — dalla libreria di Big Picture la card "X-Launcher" (destinazione `/opt/x-launcher/kiosk-launch.sh`, opzioni di avvio vuote) riporta alla Dashboard.

---

## v3.2.12-Mars — MILESTONE STABILE (8 novembre 2026)

Numero di patch scelto dall'utente (v3.2.6-dev.6 → v3.2.12-Mars).

**Installer `--devel` da cartelle con spazi e caratteri speciali** (richiesta dell'utente, in questa stessa consegna). Prima `install.sh --devel` rifiutava qualunque percorso fuori da `[A-Za-z0-9_./+-]`, perché il percorso finiva nelle righe `Exec=` dei file `.desktop` e nei `sed` che le scrivono. Ora:
- `install.sh` crea il collegamento a nome fisso **`/opt/x-launcher-devel` → cartella di sviluppo** e fa puntare lì symlink `~/.config/openbox/{rc.xml,autostart,spaces-ctl}`, `/usr/local/bin/x-launcher` e `x-launcher-spaces`, e l'`Exec=` della sessione Kiosk e di `xlaunch://`. Il nome fisso non ha bisogno di codifiche nei `.desktop` né nei `sed`; gli script risolvono il percorso reale con `readlink -f` e lo usano sempre tra virgolette (verificato: nessuna variabile di percorso senza virgolette negli script della sessione).
- Un `/opt/x-launcher-devel` già presente viene solo ripuntato se è un collegamento; se è un file o una cartella vera l'installer si ferma senza toccarlo. Controllo nuovo: con `--devel` la cartella deve contenere `kiosk-launch.sh`.
- `--uninstall` rimuove anche `/opt/x-launcher-devel` (dopo i symlink di sviluppo in `~/.config/openbox`, riconosciuti come prima).
- `build.sh`: `pip` del venv del tray lanciato come `.venv-tray/bin/python3 -m pip` (lo script `bin/pip` porta nel shebang il percorso assoluto del venv, fragile con spazi e simboli).
- Verificato da root in un ambiente di prova con la cartella `/tmp/Progetto Dashboard & co (l'ultima)/x-launcher dev` (spazi, `&`, apostrofo, parentesi): `--devel` (collegamento, comandi, symlink di Openbox, righe `Exec=`), percorso risolto correttamente da `openbox/autostart`, `kiosk-launch.sh` e `x-launcher-spaces`; `--relink-openbox` dalla stessa cartella (symlink riportati a `/opt/x-launcher`, `Exec=` a `/opt`); `--uninstall` pulito. Non ancora provato sull'HTPC.

**Riepilogo del ciclo (dev.1 → dev.6), tutto confermato su hardware reale salvo dove indicato**
- Giochi negli **spazi 1-2** (`NUM_SLOTS = 2`), **spazio 3 riservato a Steam** (`STEAM_SPACE = 3`), desktop Openbox: Dashboard, Gioco 1, Gioco 2, Steam.
- **Dashboard congelata come gruppo di scope**: `xlauncher-dashboard-*` più `app-org.chromium.Chromium-<n>` quando Chromium (156) vi sposta il processo principale; `valid_scope` accetta solo quel formato esatto oltre a `xlauncher-*`.
- **Steam Big Picture in gamescope annidato** nello spazio 3 (`src/backend/steamSession.ts`, scope `xlauncher-steam-session-<ms>`), riconosciuto da `spaces.py` dallo scope e congelato fuori dallo spazio 3 insieme al gioco Steam in corso; riquadro dell'overlay "Steam" o titolo e copertina del gioco (AppId da `reaper SteamLaunch`); chiusura di Steam → spazio 3 liberato e ritorno allo spazio precedente.
- **Giochi Steam dalla card**: a caldo passaggio allo spazio 3 (scongelamento) e poi l'URI; **a freddo in due tempi** (sessione senza URI, attesa del titolo "Big Picture", 2 s, inoltro dell'URI). Causa vera dei client desktop visti nei test: `SteamNativeRunner.version()` eseguiva `steam --version` prima di ogni lancio (Steam chiuso → client desktop completo, `execSync` bloccato fino alla sua chiusura) — sostituito da `pacman -Q steam`.
- **Mai Steam fuori dallo spazio 3** nella sessione Openbox: la sessione con gli spazi è dichiarata dal `kiosk-launch.sh` (`"spaces":true` in `active-display`); se il gestore degli spazi non risponde il backend attende fino a 8 s e poi rinuncia con un messaggio; Steam già aperto fuori dalla sessione → messaggio invece di un secondo Steam.
- **Gestore dei processi**: Steam (chiusura ordinata, scongelato prima: `steam -shutdown` solo con un client nello scope, poi kill) e Dashboard (lucchetto "Protetta", nessun pulsante, fuori dalla catena del focus, kill rifiutato dal backend con 403). Qualunque scope viene scongelato prima della chiusura.
- **Rientro dalla card "X-Launcher" di Big Picture** (`kiosk-launch.sh`): demone sulla 3000 e sulla 3001, poi socket degli spazi; dentro gamescope senza nessuno dei due esce invece di aprire una seconda Dashboard. Nuovo log `~/.local/share/x-launcher/kiosk-reentry.log`. Regola: collegamento non-Steam **senza opzioni di avvio**.
- **Pad**: presa e rilascio esclusivi serializzati (niente più `pad released (failed: [Errno 22])`).
- **Strumento di prova**: `scripts/diag-steam-gamescope.sh` (prova guidata da SSH di Steam in gamescope nello spazio riservato).

**Resta aperto (per il prossimo ciclo, CHANGELOG-17.md)**
- **Steam in background** a inizio sessione (`X_LAUNCHER_STEAM_PRESTART=1`, spento di default): implementato e provato con dati finti, mai provato sull'HTPC.
- **`--devel` da cartelle con spazi/simboli**: provato in ambiente di prova, da confermare sull'HTPC.
- **Regola sul lancio in più** (il terzo gioco non riceve uno spazio e non si congela): ancora in sospeso.
- Avviso di gamescope `No CAP_SYS_NICE` (priorità normale): lasciato così.
- Da `x-launcher-spaces` lanciato da Big Picture non si tornava alla Dashboard: la causa più probabile era la stessa delle opzioni di avvio riscritte da Steam (`%command% dashboard`); non riprovato con il collegamento corretto, superato dal rientro via `kiosk-launch.sh`.
- Steam esegue a ogni avvio `d3ddriverquery64.exe` con GE-Proton e va in timeout (`Timeout calling process … d3ddriverquery64.exe`): non tocca i giochi, non indagato.
