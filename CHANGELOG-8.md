# CHANGELOG-8 — da v2.2.19-dev.1

Prosegue da CHANGELOG-7.md (chiuso su MILESTONE STABILE v2.2.18-Mercury).

## v2.2.19-dev.1

Ripresa dello **Step 20** della roadmap (sessione Wayland/gamescope
indipendente, mai completata nei tentativi precedenti — vedi diagnosi
irrisolta in X-Launcher-Roadmap.md sulla vecchia sessione X11 dedicata,
dove LightDM non eseguiva mai lo script al login reale).

**Verifica preliminare (hardware reale)**: confermato che la sessione
XFCE attuale gira su Xorg puro (non Xwayland) — `loginctl` → `Type=x11`,
`Xorg` su vt7. Nessun conflitto quindi nell'affiancare una seconda
sessione Wayland nativa su un VT diverso: lo switch tra le due avviene
via logout/re-login dal greeter LightDM, non come sessioni concorrenti.

**Validato con un test manuale isolato, prima di toccare LightDM** (per
separare "gamescope+Chromium funzionano" da "LightDM esegue lo script
giusto", causa mai isolata nel vecchio tentativo): login testuale diretto
su tty6 (nessun desktop sotto), poi `gamescope -W 1920 -H 1080 -f --
chromium --app=http://localhost:3000 --kiosk ...` lanciato a mano.
Risultato: gamescope standalone in modalità DRM/KMS (backend `logind`,
`seatd` non installato/non necessario), GPU RTX 3070 selezionata
correttamente via Vulkan, Chromium in kiosk che carica la dashboard reale
(servita da `xdash.service`, già attivo da `multi-user.target`) e
risponde ai comandi del controller. `loginctl session-status` conferma
`Seat: seat0; vc6`, `TTY: tty6`, `Type: wayland` — esattamente il target
(desktop su tty7, kiosk su tty6).

**Nuovi file**:
- `gamescope-session.sh` — script di sessione per il caso reale (non più
  il comando lanciato a mano): attende `xdash.service`, poi avvia
  gamescope standalone con Chromium in kiosk puntato sulla dashboard.
- `xlauncher-kiosk.desktop` — voce di sessione per il greeter LightDM,
  installata in `/usr/share/wayland-sessions/` (non `xsessions/`, dato
  che è una sessione Wayland nativa, non nested su X11). Identificatore
  (`xlauncher-kiosk`) deliberatamente diverso da `xlauncher` esistente,
  per escludere a priori qualunque interferenza con la vecchia sessione
  X11 mai funzionante.

**File modificati**:
- `install.sh` — installa anche la nuova sessione Kiosk (crea
  `/usr/share/wayland-sessions/` con `mkdir -p`, dato che potrebbe non
  esistere ancora su un sistema senza sessioni Wayland pregresse);
  rimozione simmetrica in `--uninstall`. Il file `.desktop` non viene
  reso eseguibile (lezione della vecchia diagnosi: il bit eseguibile su
  `xlauncher.desktop` fu un'anomalia reale trovata all'epoca, seppur non
  risolutiva).
- `package.json` — versione a `2.2.19-dev.1`.
- `src/App.tsx` — fallback letterale `appVersion` allineato a
  `v2.2.19-dev.1`.

**Comportamento "Exit" confermato dall'utente**: deve tornare al login
manager, non solo chiudere Chromium. Nessuna logica aggiuntiva
necessaria in `gamescope-session.sh` per questo — è il comportamento
standard di LightDM quando il processo `Exec` della sessione termina,
qualunque sia la causa dell'uscita (compreso il crash sotto).

**Crash noto, non bloccante**: gamescope termina con segfault/core dump
quando l'ultimo client (Chromium) si chiude — osservato lanciando "Exit"
dal menu. `coredumpctl list/gdb gamescope` non producono nulla su questo
sistema (coredump non catturati — non configurato `systemd-coredump` /
`kernel.core_pattern`, o `ulimit -c 0`). Verificato che il cambio VT
funziona regolarmente subito dopo — non impedisce il ritorno al login.
Trattato per ora come cosmetico, non prioritario; da riprendere solo se
si presentano sintomi reali oltre al messaggio di crash.

**Non ancora funzionante, PARCHEGGIATO per una sessione futura dopo aver
completato la sessione dashboard di base**: lancio giochi dall'interno
della sessione Kiosk. Testato con Bioshock 2, Crash Bandicoot (RetroArch)
e LEGO Indiana Jones (Proton 10.0): tutti partono (PID assegnato,
`isLastLaunchedGameRunning` rileva `stillAlive=true` per la durata
dell'esecuzione) ma senza nulla a schermo nella sessione kiosk. Nello
stesso log, `wmctrl` fallisce per le combo Select+L1+R1 ("finestra
Dashboard trovata = NESSUNA"). **Ipotesi non verificata** da controllare
per prima in una sessione dedicata: `xdash.service` ha `DISPLAY=:0`
hardcoded nel proprio systemd unit (puntato alla sessione X11 esistente
su tty7), non all'Xwayland interno alla sessione gamescope su tty6 — i
processi dei giochi lanciati dal daemon erediterebbero quel DISPLAY
sbagliato. Da confermare con log reali, non da dare per assodato.

`tsc --noEmit` da rieseguire dopo aver applicato la modifica a
`App.tsx` (una sola riga, nessun impatto atteso su `check-focus-ids.cjs`).

**Da verificare al prossimo avvio reale via LightDM (non più test manuale
da getty)**: se il VT assegnato è davvero tty6 come nel test manuale, o
se LightDM/logind lo allocano diversamente per una sessione selezionata
dal greeter rispetto a un login diretto da console — non garantito
identico, da confermare con `loginctl session-status` appena disponibile.

## v2.2.19-dev.2

Diagnosi del bug parcheggiato in dev.1 (giochi lanciati dalla Kiosk
gamescope invisibili a schermo). **Causa confermata leggendo il codice
sorgente reale, non solo i log**: `xdash.service` ha `Environment=DISPLAY=:0`
fisso — valore già segnalato come "tipico, non garantito" nel commento
del file stesso (v0.99.35), ma mai realmente messo alla prova finché non
è esistita una seconda sessione grafica con un DISPLAY diverso da `:0`.
`spawnDetached()` in `runners/implementations.ts` (unico punto reale di
lancio per Wine/Proton/legendary — tutti gli altri passano da lì) eredita
`process.env` del daemon, quindi quel `:0` fisso, **anche quando la
sessione realmente attiva è la Kiosk** (la cui Xwayland interna gira su
un DISPLAY diverso, es. `:1`): il gioco si apriva quindi, invisibile,
sulla sessione XFCE (se ancora viva su un altro VT), non su quella che
l'utente stava guardando. Stessa causa in `buildSafeEnv()`
(`downloadManager.ts`, wine/winetricks durante l'installazione) e nei
due `x11Env` di `gameManager.ts` (screensaver inhibit).

**Fix**: invece di un valore statico deciso all'avvio del daemon (prima
ancora che una sessione grafica esista), ogni sessione segnala al
daemon, quando diventa quella attiva, il proprio DISPLAY reale.

**Nuovo file**:
- `src/backend/activeDisplay.ts` — stato in memoria (nessuna
  persistenza, si azzera ad ogni riavvio del daemon tornando al vecchio
  fallback statico) con `setActiveDisplay()`/`getActiveDisplayEnv()`.

**File modificati**:
- `server.ts` — nuovo endpoint `POST /api/system/active-display`
  (stesso stile di `/api/system/input-wake`/`input-focus-game`).
- `src/backend/runners/implementations.ts` — `spawnDetached()` ora usa
  `getActiveDisplayEnv()` invece di `process.env` statico (il fix vero e
  proprio del bug: unico spawn reale di gioco). `...cleanEnv` resta per
  ultimo nel merge: un DISPLAY esplicito nel profilo del gioco continua
  a vincere.
- `src/backend/downloadManager.ts` — stesso fix in `buildSafeEnv()`.
- `src/backend/gameManager.ts` — stesso fix nei due `x11Env` di
  `startScreensaverInhibit()`/`stopScreensaverInhibit()`.
- `gamescope-session.sh` — non fa più `exec gamescope ...` diretto: lo
  avvia in background, legge il proprio log per scoprire il numero reale
  dell'Xwayland interno di gamescope (non prevedibile in anticipo — nel
  test reale è stato `:1`, ma non garantito), lo segnala al daemon via
  POST, poi resta in `wait` sul PID di gamescope — comportamento "Exit
  torna al login LightDM" invariato.
- `kiosk-launch.sh` — CASO 2 (sessione sopra un DE esistente, il ramo
  usato oggi per XFCE) segnala il proprio `$DISPLAY` all'avvio, per
  resettare correttamente il valore se prima era attiva la Kiosk.
  **CASO 1 (gamescope nested `-e` sotto X11, mai stato il percorso
  realmente usato) lasciato invariato — fuori scope per questo fix.**
- `xdash.service` — commento aggiornato: il limite noto (DISPLAY statico
  pre-login) resta per la finestra fra boot e prima segnalazione, non
  più per il caso "sessione sbagliata già attiva".

**Non verificato su hardware reale** (unica cosa mancante prima di
considerare questo fix chiuso): serve un nuovo test — lanciare un gioco
dalla Kiosk dopo l'aggiornamento, confermare che compaia davvero a
schermo lì (non più sulla sessione XFCE in background). Per verificare
che la segnalazione sia arrivata: log del daemon (`[ACTIVE-DISPLAY]
Sessione attiva segnalata: ...`) oppure il log di
`gamescope-session.sh`/`kiosk-launch.sh` stesso.

`tsc --noEmit` da rieseguire sul progetto reale (non eseguibile in questo
ambiente — node_modules non installati qui): nessun impatto strutturale
atteso (solo firme di funzioni invariate, un modulo nuovo con export
tipizzati espliciti).

## v2.2.19-dev.3

**BUG UTENTE, confermato su hardware reale**: con la sessione Kiosk
funzionante e i giochi finalmente visibili (dev.2), è emerso un problema
nuovo — la splash di lancio non si chiude più, resta in sovraimpressione
durante tutta la sessione di gioco.

**Causa**: stesso identico bug del DISPLAY statico corretto in dev.2, ma
in due file che quel fix non copriva. `windowDetector.ts` (`listWindows()`,
usata da `raceSplashClose` per sapere quando la finestra del gioco è
comparsa) e `windowFocus.ts` (`run()`, usata dalle combo controller
Select+L1+R1/Select+◄►) chiamano `wmctrl`/`xprop` con `execFileSync`
**senza alcun `env` esplicito** — ereditano quindi sempre il
`process.env` grezzo del daemon, ancora fisso su `:0` anche dopo dev.2
(quel fix aveva toccato solo i punti di spawn dei giochi, non questi due
moduli di rilevamento finestre). Il gioco ora si vede perché lo spawn è
corretto; il rilevamento della sua finestra continuava a interrogare la
sessione XFCE sbagliata.

**Perché sembrava "restare per sempre" e non solo "un po' lenta"**:
`LAUNCH_WINDOW_TIMEOUT_MS` (`launchPhaseTracker.ts`) è impostato a **10
minuti** — un timeout di sicurezza pensato per giochi che impiegano
genuinamente tanto ad aprire la prima finestra, non per una rilevazione
strutturalmente impossibile come questa. **Importante**: scaduti quei 10
minuti, `raceSplashClose` non si limita a chiudere la splash — termina
forzatamente (`SIGTERM` poi `SIGKILL`) anche il processo del gioco
(`pidToKillOnTimeout`). Senza questo fix, ogni sessione di gioco nella
Kiosk sarebbe stata interrotta a forza dopo 10 minuti.

**Fix**: stesso pattern di dev.2 (`getActiveDisplayEnv()`), applicato qui
a `listWindows()` in `windowDetector.ts` e a `run()` in `windowFocus.ts`.

**File modificati**:
- `src/backend/windowDetector.ts` — `wmctrl -lx` ora riceve
  `env: { ...process.env, ...getActiveDisplayEnv() }`.
- `src/backend/windowFocus.ts` — `wmctrl -l`/`-lp`/`xprop` (funzione
  `run()`, unico punto di spawn condiviso da `wakeDashboard()` e
  `focusGameWindow()`) stesso fix.

**Non verificato — riserva esplicita**: questo fix corregge sicuramente
il DISPLAY interrogato, ma resta da confermare su hardware reale che
`wmctrl -lx` riesca DAVVERO a elencare le finestre dentro l'Xwayland
interno di gamescope. `wmctrl` si basa sulla proprietà EWMH
`_NET_CLIENT_LIST`, normalmente mantenuta da un window manager reale
(xfwm4 in sessione XFCE) — non è verificato se/quanto gamescope la
espone per la propria Xwayland rootless. Se dopo questo fix la splash
continuasse a non chiudersi, il prossimo passo NON è ripetere questo
stesso fix altrove, ma verificare con un test diretto (`wmctrl -lx` a
mano, con lo stesso DISPLAY della sessione Kiosk, mentre un gioco è in
esecuzione) se gamescope popola quella proprietà.

## v2.2.19-dev.4

**BUG UTENTE, confermato rileggendo il codice (regressione introdotta da
dev.2)**: testando dev.3, sul desktop XFCE il gioco lanciato dalla
Dashboard veniva chiuso poco dopo la sparizione della splash — "non si
aggancia al display corrente" nelle parole dell'utente. Causa:
`getActiveDisplayEnv()` restituiva sempre anche `WAYLAND_DISPLAY`, con
fallback a stringa vuota `''` quando non c'era nulla da riportare (il
caso normale per la sessione XFCE, dove non esiste alcun Wayland).
Iniettata nell'ambiente del processo del gioco, una `WAYLAND_DISPLAY=""`
impostata-ma-vuota non equivale ad assente per molti toolkit (SDL2 su
tutti) — alcuni giochi la vedevano "presente" e tentavano comunque il
backend Wayland invece di quello X11 corretto, fallendo nel creare una
finestra e uscendo quasi subito. Prima di dev.2 questa variabile non
veniva mai toccata (se assente in `process.env`, restava assente anche
nel gioco) — la regressione è arrivata proprio con l'introduzione del
meccanismo di segnalazione DISPLAY.

**Fix**: `getActiveDisplayEnv()` ora omette del tutto la chiave
`WAYLAND_DISPLAY` quando non c'è un valore reale da riportare, invece di
impostarla vuota — chi fa `{ ...process.env, ...getActiveDisplayEnv() }`
senza un valore segnalato si comporta quindi esattamente come prima di
dev.2. Firma di ritorno aggiornata (`WAYLAND_DISPLAY` ora opzionale nel
tipo) — nessun altro file ha bisogno di modifiche, tutti i chiamanti
usano già lo spread `...getActiveDisplayEnv()`.

**File modificati**:
- `src/backend/activeDisplay.ts` — vedi sopra.

**Kiosk: NESSUNA modifica in questa versione.** Il problema "splash
resta in background" segnalato dall'utente persiste anche dopo dev.3
(fix DISPLAY su wmctrl applicato, ma il sintomo non cambia) — deliberatamente
NON si ripete un'altra iterazione dello stesso fix senza il dato mancante
già richiesto: il test manuale `DISPLAY=:N wmctrl -lx` (da un'altra shell,
con un gioco in esecuzione nella Kiosk) per confermare se gamescope
espone davvero `_NET_CLIENT_LIST` per la propria Xwayland interna. Senza
quel dato, qualunque ulteriore modifica qui sarebbe un altro tentativo
alla cieca sullo stesso possibile buco architetturale già segnalato in
dev.3.

## v2.2.19-dev.5

**BUG UTENTE, log reale allegato**: sul desktop, dopo il fix dev.4, il
gioco (Bioshock 2, runner "Wine (Lutris Build)") apre ancora brevemente
una finestra dopo la verifica dei verbs, poi il processo termina da solo
dopo ~16s. **Non è più un problema di DISPLAY/WAYLAND_DISPLAY** (lo
screensaver-inhibit funziona correttamente nel log, `xset: ok`, prova che
il fix di dev.2/dev.4 tiene). Causa isolata dalla riga di log stessa:

```
which: no wine-lutris in (/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:
  /home/daniele/.local/share/flatpak/exports/bin:...)
```

`resolveBinaryPath('wine-lutris')` fallisce (binario non nel PATH del
daemon) e il codice fa **fallback silenzioso** a `resolveBinaryPath('wine')`
— il `wine` di sistema (11.14 plain), non la build Lutris scelta per
questo gioco. Il log continuava comunque a riportare "Runner: Wine
(Lutris Build)", nascondendo il fallback. Il wine di sistema apre una
finestra ma poi crasha — plausibilmente privo delle patch/runtime che
avevano motivato la scelta di quel runner specifico per questo gioco.

**Fix applicato (indipendente dalla causa di fondo)**: il fallback ora
produce un avviso esplicito nel log (`[WINE] 'wine-lutris' non trovato
nel PATH del daemon — uso '...' al suo posto...`), in entrambi i punti
dove esisteva lo stesso pattern silenzioso (`WineRunner.launch` e il ramo
legendary/Epic di `ProtonRunner.launch`).

**File modificati**:
- `src/backend/runners/implementations.ts` — avviso di fallback in
  entrambi i punti.

**Non risolto — richiede una risposta dell'utente prima di procedere**:
il PATH osservato nel log (niente `/home/daniele/.local/bin`, presenti
invece i path flatpak) non corrisponde al `Environment=PATH=...` che
`xdash.service` dichiara esplicitamente nel repository (che include
`/home/TUOUTENTE/.local/bin` proprio per questo scenario — vedi
commento "PATH esplicito" nel file). Ipotesi da confermare con l'utente,
non da assumere: il servizio effettivamente in esecuzione durante questo
test non è (o non è più) quello installato da `xdash.service`, oppure è
una copia non aggiornata/diversa da quella nel repository. Prossimo
passo: chiedere come viene avviato realmente il daemon in questo test
(systemd `xdash.service` vs `npm start`/`node dist/server.cjs` a mano),
e se via systemd, verificare `systemctl cat xdash` sul sistema reale per
confermare che TUOUTENTE sia stato sostituito correttamente nella riga
PATH.

## v2.2.19-dev.6

**BUG UTENTE risolto — chiuso il filone DISPLAY/wine-lutris**: causa
reale del crash Bioshock 2/LEGO Indiana Jones isolata dall'utente stesso
con test manuali fuori da X-Launcher — non era DISPLAY, non era
wine-lutris. Log finale: `NtUserChangeDisplaySettings ... DISPLAY1
returned -2` (`DISP_CHANGE_BADMODE`) su `EnterFullscreenMode` — DXVK in
fullscreen esclusivo chiedeva a Wine un cambio modalità video reale
(XRandR) che falliva. Fix (fuori dal codice, lato prefix Wine
dell'utente): abilitato temporaneamente il desktop virtuale via
`winecfg`, impostata la risoluzione corretta del monitor (2560x1440),
disabilitato di nuovo il desktop virtuale — il gioco ora parte
correttamente anche dalla Dashboard sul desktop.

**Unica modifica di codice in questa versione**: `gamescope-session.sh`
aveva `-W 1920 -H 1080` hardcoded (placeholder mai aggiornato dal primo
test) — corretto a `-W 2560 -H 1440`, la risoluzione reale del monitor.

**File modificati**:
- `gamescope-session.sh` — risoluzione gamescope.

**Stato del filone DISPLAY (dev.2-dev.5)**: tutti i fix restano validi e
necessari (DISPLAY dinamico per sessione, WAYLAND_DISPLAY non più
iniettato vuoto, avviso di fallback wine-lutris) — semplicemente non
erano la causa di QUESTO specifico crash, che era un problema di
modalità video del prefix Wine, indipendente.

**Ancora aperto**: il problema originale della splash bloccata nella
sessione Kiosk (dev.3) — resta in attesa del test manuale `wmctrl -lx`
mai ancora riportato.

## v2.2.19-dev.7

**Nuova feature, Step 1/3 — "Modalità Gamescope" reale nel menu**: il
pulsante esisteva già nel menu ma era un mock (`isGamescope` = semplice
`useState(false)` locale, nessuna rilevazione reale, nessuna risoluzione
persistita). Obiettivo finale (3 step, questo è il primo): icona verde +
risoluzione reale quando la Kiosk è attiva; pulsante ciclico HD → FullHD
→ QHD → 4K con countdown di 5s (resettabile da una nuova pressione)
prima del riavvio di gamescope alla nuova risoluzione; scelta persistita
anche dopo l'uscita dalla sessione.

**Questo step (persistenza + segnalazione, nessuna UI ancora)**:
- `src/backend/appConfig.ts` — nuovo campo `gamescopeResolution`
  (`'HD' | 'FullHD' | 'QHD' | '4K'`, default `'QHD'` — era il valore
  hardcoded precedente), con mapping W×H ed helper di ciclo
  (`nextGamescopeResolution`), nello stesso file bash-readable già usato
  per `displayMode`.
- `gamescope-session.sh` — legge `gamescopeResolution` da `app.conf`
  invece di `-W 2560 -H 1440` hardcoded (mapping bash duplicato,
  manualmente allineato a `GAMESCOPE_RESOLUTION_SIZES` in appConfig.ts —
  bash non può importare da TS); segnala al daemon anche `kind:"kiosk"` e
  la risoluzione nella stessa POST `/api/system/active-display` già
  esistente per il DISPLAY.
- `kiosk-launch.sh` (CASO 2) — segnala `kind:"desktop"` nella stessa
  POST, per azzerare correttamente lo stato "Kiosk attiva" quando si
  torna su XFCE.
- `src/backend/activeDisplay.ts` — nuovo stato in memoria
  `activeSessionKind`/`activeGamescopeResolution` (stesso
  non-persistere del DISPLAY: si azzera ad ogni riavvio del daemon) e
  nuova `getActiveSessionInfo()`.
- `server.ts` — `POST /api/system/active-display` ora accetta anche
  `kind`/`resolution`; nuovo `GET /api/system/session-info` per la
  lettura da frontend.

**Ancora NON fatto** (Step 2 e 3, prossimi): endpoint per ciclare/
impostare la risoluzione (che deve anche far riavviare gamescope senza
chiudere la sessione se la Kiosk è attiva in quel momento — il pezzo
tecnicamente più delicato, il self-restart dentro `gamescope-session.sh`
non esiste ancora); frontend (sostituire il mock `isGamescope`, icona
verde, pulsante ciclico, countdown rosso sotto la versione app — stesso
punto dove compare già l'indicatore "Server locale" —, stringhe IT/EN).

## v2.2.19-dev.8

**Step 2/3 — ciclo risoluzione + riavvio di gamescope senza chiudere la
sessione.**

**`gamescope-session.sh` ristrutturato** (da singolo avvio+wait a ciclo
riavviabile): la lettura della risoluzione e l'avvio di gamescope sono
ora funzioni (`read_resolution_from_config`, `launch_gamescope`)
richiamabili più volte. Il proprio PID viene scritto in
`gamescope-session.pid` (stessa cartella dati) perché il daemon possa
trovarlo. Un trap su `SIGUSR1` marca una richiesta di riavvio pendente;
il ciclo principale, quando `wait` ritorna per quel segnale, termina
l'istanza corrente di gamescope e ne avvia una nuova con la risoluzione
aggiornata — **senza uscire dallo script**, quindi senza tornare al
login LightDM. Un'uscita naturale (Exit dal menu, crash) resta invece
l'uscita vera dello script, comportamento identico a prima.

**Nuovo endpoint `POST /api/system/gamescope-resolution/cycle`**
(`server.ts`): avanza `gamescopeResolution` in `app.conf` alla voce
successiva (HD→FullHD→QHD→4K→HD) e, solo se `getActiveSessionInfo()`
riporta la Kiosk come sessione attiva in questo momento, legge il
pidfile e invia `SIGUSR1` a `gamescope-session.sh` per il riavvio.
Se la Kiosk non è attiva (es. si cicla da desktop), la risoluzione viene
comunque persistita per il prossimo avvio della Kiosk, senza alcun
segnale da inviare. Il countdown di 5s mostrato all'utente resta
interamente lato frontend (Step 3, prossimo) — arrivati a questo
endpoint il riavvio è già deciso.

**File modificati**:
- `gamescope-session.sh` — ristrutturato in funzioni + ciclo + trap
  SIGUSR1 + pidfile (riscritto per intero, cambi troppo estesi per un
  patch mirato).
- `server.ts` — nuovo endpoint, import di `readAppConfig`/
  `writeAppConfig`/`nextGamescopeResolution` da `appConfig.ts` e
  `DATA_DIR` da `paths.ts` (niente import duplicati: `fs`/`path` erano
  già presenti nel file).

**Ancora NON fatto (Step 3, prossimo)**: tutto il frontend — sostituire
il mock `isGamescope` con `GET /api/system/session-info`, icona verde,
pulsante ciclico con countdown di 5s in rosso sotto la versione app
(stesso punto del badge "Server locale"), reset del countdown su nuova
pressione, chiamata a `POST /api/system/gamescope-resolution/cycle` allo
scadere, stringhe IT/EN.

**Promemoria dell'utente, da fare DOPO aver concluso tutti gli step
previsti per questa feature**: ripulire `install.sh` dalle sessioni
LightDM non più in uso — lasciare solo "X-Launcher Kiosk" come
alternativa al desktop (la vecchia sessione X11 `xlauncher.desktop`,
mai stata funzionante secondo la diagnosi Step 20 originale, va
rimossa dall'installer).

## v2.2.19-dev.9

**Step 3/3 completato — "Modalità Gamescope" reale nel menu.** Feature
chiusa (i tre step pianificati nella sessione sono tutti consegnati).

**Correzione al disegno di dev.8**: l'endpoint unico `.../cycle`
(persisti + riavvia) avrebbe causato un riavvio reale di gamescope per
OGNI pressione del pulsante durante il countdown di 5s, vanificandolo.
Diviso in due:
- `POST /api/system/gamescope-resolution/cycle` — avanza e persiste
  soltanto, nessun segnale di riavvio. Chiamato dal frontend ad ogni
  pressione, anche durante il countdown.
- `POST /api/system/gamescope-resolution/apply` — non cambia la
  risoluzione, applica quella già persistita (segnale SIGUSR1 a
  `gamescope-session.sh`, solo se la Kiosk è attiva ora). Chiamato una
  sola volta, allo scadere del countdown.

**Frontend** (`src/App.tsx`):
- `isGamescope` non è più un mock: polling di `GET
  /api/system/session-info` ogni 5s (stessa cadenza/pattern del polling
  log/download già esistente). Stesso stato alimenta sia la label
  "GAMESCOPE STANDALONE / WAYLAND NATIVE" nell'header (uso preesistente,
  automaticamente corretto) sia il pulsante nel quick-menu.
- Pulsante "Modalità Gamescope": icona verde (`OptionItem` ha ora un
  prop `iconClassName`, nuovo) quando la Kiosk è attiva; valore mostrato
  = risoluzione reale invece di "Attivo"/"Disattivo".
- Click → `handleGamescopeCycle`: chiama `.../cycle`, mostra subito la
  risoluzione scelta (`pendingGamescopeResolution`), avvia un countdown
  di 5s; una pressione durante il countdown lo resetta e avanza
  ulteriormente (confermato dall'utente); allo scadere, chiama
  `.../apply` una sola volta.
- Countdown mostrato in rosso sotto "X-Launcher Core {versione}", stesso
  punto/stile del badge "Server locale" già lì (richiesta esplicita
  dell'utente) — stringa `quickMenu:gamescopeApplyCountdown` (IT/EN).

**File modificati**:
- `server.ts` — endpoint diviso in `/cycle` + `/apply` (sostituisce
  l'unico `/cycle` di dev.8).
- `public/locales/it/quickMenu.json` / `en/quickMenu.json` — nuova
  stringa `gamescopeApplyCountdown`.
- `src/App.tsx` — vedi sopra (diff puntuali nella risposta, non il file
  intero: oltre 10.500 righe).

**Promemoria ancora aperto** (da fare ora che la feature è conclusa, su
richiesta esplicita dell'utente): ripulire `install.sh` dalle sessioni
LightDM non in uso — lasciare solo "X-Launcher Kiosk", rimuovere la
vecchia `xlauncher.desktop` (X11, mai funzionante).

**Non verificato su hardware reale**: l'intera feature (Step 1-3) non è
ancora stata testata end-to-end dall'utente.

## v2.2.19-dev.10

**BUG MIO, confermato — schermata nera segnalata dall'utente**: in
dev.9 ho usato `safeJson` nel nuovo polling `session-info` e in
`handleGamescopeCycle`, ma quel nome era già usato nel progetto per un
helper definito **localmente dentro un altro `useEffect`** — fuori
scope per qualunque altro codice. `esbuild`/il bundler non lo segnala
(JS non tipizzato a runtime, l'errore emerge solo quando la funzione
viene davvero chiamata): `Uncaught ReferenceError: safeJson is not
defined`, da cui la Dashboard restava nera. Confermato riproducendo la
diagnosi con un diff puntuale fra una copia di riferimento con le
modifiche di dev.9 applicate correttamente e il file dell'utente, poi
verificando entrambi con `esbuild` — zero errori di sintassi in
entrambi, la causa reale era questo riferimento fuori scope, non un
errore di trascrizione dell'utente.

**Fix**: nuovo helper di modulo `parseJsonResponse` (stessa identica
logica del `safeJson` locale preesistente, lasciato invariato dov'era —
nessun altro codice toccato), usato nei due punti nuovi di dev.9.

**Trovato nello stesso giro, separato — transcription error
dell'utente, non mio**: il blocco del countdown era finito annidato
dentro il blocco `isLocalDevServer` invece che come fratello dopo la
sua chiusura — sintatticamente valido (compila), ma il countdown
sarebbe comparso solo quando `isLocalDevServer` è vero. Segnalato
all'utente con la correzione, non applicato qui (il nostro riferimento
era già corretto).

**File modificati**:
- `src/App.tsx` — nuovo helper `parseJsonResponse` + due riferimenti
  corretti (righe indicate nella risposta, non il file intero: oltre
  10.500 righe).

## v2.2.19-dev.11

**BUG MIO, confermato dal log reale — causa di TUTTI i sintomi "Modalità
Gamescope" segnalati dall'utente** (icona sempre "Disattivo", countdown
che non riavvia mai nulla, unico modo per applicare la risoluzione era
uscire e rientrare da LightDM). Il messaggio reale di gamescope è:

```
[xwayland/server.c:107] Starting Xwayland on :0
```

La regex di rilevazione in `gamescope-session.sh` cercava `Xwayland
:[0-9]+` (senza la parola "on" in mezzo) — non ha **mai** trovato nulla,
su nessun avvio, fin dalla sua introduzione in dev.2. Di conseguenza la
segnalazione `kind:"kiosk"` al daemon non partiva mai (non un rifiuto
del backend: lo script non la inviava proprio), `session-info` restava
sempre `kind:"desktop"`, e l'endpoint `.../apply` non inviava mai
`SIGUSR1` (gate su `kind === 'kiosk'`). L'unico motivo per cui la nuova
risoluzione risultava comunque applicata uscendo e rientrando dalla
sessione è che `.../cycle` persiste correttamente in `app.conf`
indipendentemente da questo bug — un riavvio completo della sessione la
legge comunque da capo.

**Fix**: pattern reso tollerante al testo intermedio
(`Xwayland[^0-9]*:[0-9]+`), copre sia "Xwayland on :N" (il formato
reale) sia il vecchio "Xwayland :N" ipotizzato, nel caso il testo
cambi ancora in una futura versione di gamescope.

**File modificati**:
- `gamescope-session.sh` — regex di rilevazione DISPLAY corretta.

**Diagnosi parallela chiusa senza modifiche**: il crash Mesa/DRM
("Permission denied" su `dri_gbm.so`) nel log precedente dell'utente —
permessi del file verificati normali, nessun mount `noexec`, AppArmor
non attivo. L'utente conferma che la sessione Kiosk parte sempre
correttamente: quel crash resta un episodio isolato, non riprodotto,
non più indagato per ora.

**Non ancora verificato su hardware reale**: il fix di questa versione.

## v2.2.19-dev.12

**Splash in sessione Kiosk — Opzione 1 implementata** (scelta
dell'utente dopo conferma definitiva: `wmctrl -lx` nella Kiosk restituisce
"Cannot get client list properties (_NET_CLIENT_LIST or
WIN_CLIENT_LIST)" — l'Xwayland interna di gamescope standalone non
espone proprietà EWMH, la rilevazione finestra è strutturalmente
impossibile in questa sessione, non un bug da rincorrere ulteriormente).

**`src/backend/splashOrchestrator.ts`**: nuova `waitForProcessAlive()`,
stessa identica verifica di `gameManager.isLastLaunchedGameRunning()`
(scope/cgroup o pgrep, già matura e testata altrove) invece
dell'attesa finestra. `raceSplashClose()` ora biforca su
`getActiveSessionInfo().kind`: in Kiosk usa `waitForProcessAlive`, su
desktop XFCE resta invariato `waitForGameWindow` (wmctrl funziona lì,
nessuna regressione). Compromesso accettato esplicitamente dall'utente:
la splash può chiudersi un istante prima che il gioco mostri davvero la
propria finestra (il processo risulta "attivo" al primo processo reale
della catena di lancio) — preferibile ad aspettare un segnale che in
Kiosk non arriverà mai, fino allo scadere dei 10 minuti di sicurezza con
conseguente kill del gioco.

**File modificati**:
- `src/backend/splashOrchestrator.ts` — vedi sopra. Nessuna modifica a
  `windowDetector.ts`/`windowFocus.ts` (restano il percorso desktop,
  invariati) né al frontend (le fasi emesse restano le stesse:
  `done`/`failed`/`cancelled`/`timeout`).

**Diagnosi chiusa, non più da riaprire**: la domanda aperta dal dev.3 in
poi su EWMH/gamescope ha ora una risposta definitiva e negativa,
confermata su hardware reale — non ripetere test `wmctrl` in Kiosk in
futuro, la risposta non cambierà senza un cambio di versione/backend di
gamescope.

**In corso, parallelo**: l'utente sta verificando `xdotool search` nella
stessa sessione, per capire se è disponibile un'alternativa a EWMH utile
per il futuro "gestore degli spazi" (non collegato a questo fix, che non
ne ha bisogno).

**Non ancora verificato su hardware reale**: questo fix.

## v2.2.19-dev.13

**Pulsante "Modalità Gamescope" nascosto fuori dalla sessione Kiosk**
(richiesta esplicita dell'utente, in coda dopo il fix della splash).

`src/App.tsx`: l'`OptionItem` del quick-menu ora è renderizzato solo
quando `isGamescope` è vero (sessione Kiosk realmente attiva, stato già
reale da dev.9 — non un nuovo meccanismo). Nessuna gestione aggiuntiva
per il controller: verificato che `FocusProvider` registra/deregistra i
`Focusable` al mount/smontaggio e lo scoring geometrico lavora solo su
quelli effettivamente presenti — nessun altro `Focusable` referenzia
`"opt-gamescope"` come vicino esplicito altrove, quindi nascondere
l'item è sicuro di per sé, lo scoring salta automaticamente al più
vicino fra quelli rimasti. Semplificata anche l'espressione del valore
mostrato (`value`/`iconClassName`), dato che ora l'item esiste solo nel
ramo "attivo" — rimossa la diramazione per il caso "Disattivo", non più
raggiungibile.

**File modificati**:
- `src/App.tsx` — vedi sopra (patch puntuale, non il file intero: oltre
  10.600 righe).

**Ancora pendente**: output di `xdotool search --name ""` nella sessione
Kiosk (test dell'utente in corso, per il futuro gestore degli spazi);
pulizia di `install.sh` (sessioni LightDM non in uso).

## v2.2.19-dev.14

**Rilevazione pacchetti installati via flatpak, tab Gestione Account >
Sistema** (richiesta dell'utente: ProtonUp-Qt via flatpak non veniva
rilevato, più in generale altri strumenti installati così).

**Causa confermata** (verificato sul manifest Flathub ufficiale, non
assunto): `detectSystemTools()` controllava solo
`binaryExists('protonup')` — il binario della CLI `protonup` (pip/AUR).
Un'installazione flatpak di ProtonUp-Qt (`net.davidotek.pupgui2`) è
sandboxata ed espone sul PATH dell'host solo il comando
`net.davidotek.pupgui2` (la GUI), mai `protonup` — strutturalmente
invisibile alla vecchia rilevazione, qualunque fosse lo stato del
sistema.

**Fix**: nuova `getInstalledFlatpakApps()` (una sola chiamata a
`flatpak list --app --columns=application`, riusata per tutte le voci),
aggiunta in OR a `binaryExists(...)` per le app standalone con un ID
Flathub verificato sul manifest ufficiale: ProtonUp-Qt
(`net.davidotek.pupgui2`), Lutris (`net.lutris.Lutris`), Steam
(`com.valvesoftware.Steam`), RetroArch (`org.libretro.RetroArch`),
ScummVM (`org.scummvm.ScummVM`).

**Deliberatamente NON estesa** a gamemode/mangohud/gamescope/wine/umu:
sono librerie/shim che devono integrarsi con processi lanciati
nativamente sull'host (LD_PRELOAD, compositor) — una loro ipotetica
versione flatpak sandboxata non avrebbe comunque alcun effetto sui
giochi lanciati da X-Launcher. DOSBox-staging lasciato fuori: nessun ID
Flathub verificato con sufficiente certezza al momento — va aggiunto
solo dopo una verifica puntuale, non per coerenza con gli altri.

**Non toccato apposta**: il codice che invoca realmente `protonup -i
<id>` per installare Proton-GE (altra occorrenza di
`binaryExists('protonup')`, circa riga 167) resta legato alla sola CLI
nativa — un ProtonUp-Qt flatpak è sandboxato e non espone quella CLI
scriptabile dall'host, quindi non potrebbe comunque essere invocato così.
Questa rilevazione serve solo a non fuorviare l'utente con "non
installato" per uno strumento che in realtà usa a mano dalla sua GUI
flatpak.

**File modificati**:
- `src/backend/compatibilityManager.ts` — vedi sopra.

## v2.2.19-dev.15

**Pulizia `install.sh`** (richiesta dell'utente, in coda da diverse
versioni): rimossa l'installazione della vecchia sessione LightDM X11
(`xlauncher.desktop`, cartella `xsessions/`) — mai resa funzionante
(diagnosi originale Step 20, causa mai isolata), sostituita a tutti gli
effetti dalla Kiosk, l'unica sessione standalone testata e confermata
funzionante su hardware reale. Il file `xlauncher.desktop` resta nel
repository come riferimento storico ma non viene più installato né
rimosso dallo script; su un sistema con un'installazione precedente,
resta in `xsessions/` finché non rimosso a mano.

**BUG REALE CONFERMATO dall'utente — permessi post-installazione**:
dopo un'installazione pulita, `/opt/x-launcher` risultava accessibile
al solo root, costringendo a un `chmod` manuale da terminale. Causa:
`chmod -R go-w "$INSTALL_DIR"` toglie il bit di scrittura a
gruppo/altri ma **non garantisce** che lettura/esecuzione siano
presenti — se i file sorgente avevano già permessi restrittivi (es.
`umask 077` in fase di sviluppo/clone), il risultato restava illeggibile
per chiunque non fosse root, indipendentemente da `chown`. Fix:
permessi impostati esplicitamente — `755` per le directory, `644` per i
file, poi `+x` sugli script — invece di dipendere da cosa avesse la
sorgente.

**File modificati**:
- `install.sh` — entrambe le correzioni sopra; intestazione e messaggi
  aggiornati di conseguenza (nessun riferimento residuo a
  `/usr/share/xsessions`).

Verificato con `bash -n install.sh` — sintassi corretta. Comportamento
da riverificare su un'installazione pulita reale (`sudo ./install.sh`
su un sistema senza `/opt/x-launcher` preesistente).

---

## Congelato — MILESTONE STABILE v2.5.0-Mercury

Ciclo chiuso qui (dev.1→dev.15), tutto confermato funzionante
dall'utente su hardware reale. Salto di minor version (2.2→2.5) a
segnare la portata del ciclo: non solo correzioni, ma lo **Step 20
completato** — sessione Kiosk standalone (gamescope su DRM/KMS, nessun
desktop sotto), selezionabile dal greeter LightDM accanto al desktop
XFCE, dopo anni di tentativi falliti mai arrivati in fondo.

**Step 20 — sessione Kiosk indipendente**: compositore gamescope
confermato funzionante da zero, con un'intera famiglia di bug reali
diagnosticati e risolti via log reali, mai per assunzione — xdash.service
con `DISPLAY` statico che faceva lanciare i giochi sulla sessione
sbagliata (dev.2/dev.4, inclusa una regressione mia su
`WAYLAND_DISPLAY` iniettata vuota); fallback silenzioso a wine di
sistema quando `wine-lutris` non era nel PATH del daemon (dev.5, reso
visibile nel log); risoluzione gamescope hardcoded (dev.6); regex di
rilevazione del DISPLAY di Xwayland che non ha mai corrisposto al
formato reale del log, causa di ogni sintomo della feature "Modalità
Gamescope" (dev.11).

**Feature "Modalità Gamescope"** (dev.7→dev.13): icona/risoluzione
reali nel menu al posto del vecchio mock, pulsante ciclico HD/FullHD/
QHD/4K con countdown di 5s e riavvio di gamescope sul posto (nessun
ritorno al login), nascosto fuori dalla sessione Kiosk dove non è
azionabile.

**Splash screen in Kiosk**: diagnosi definitiva — `wmctrl -lx`
conferma che l'Xwayland interna di gamescope non espone proprietà EWMH,
rendendo la rilevazione finestra strutturalmente impossibile in questa
sessione (non un bug, un limite del compositor). Risolta chiudendo la
splash non appena il processo di lancio risulta attivo nel gestore
(`isLastLaunchedGameRunning`), invece di attendere una finestra che non
sarebbe mai stata rilevabile — sessione desktop XFCE invariata, dove
`wmctrl` funziona regolarmente.

**Altri fix reali inclusi nel ciclo**: causa vera dei crash
Bioshock 2/LEGO Indiana Jones isolata dall'utente stesso (modalità
video fullscreen esclusiva DXVK, non DISPLAY/wine-lutris come
inizialmente sospettato); rilevazione pacchetti installati via flatpak
(ProtonUp-Qt e altri) oltre a pacman/yay; `install.sh` ripulito dalla
vecchia sessione X11 mai funzionante e permessi post-installazione
corretti (restavano leggibili dal solo root su alcune installazioni).

**Resta aperto, non ancora iniziato**: il "gestore degli spazi"
("gamespace manager") proposto dall'utente per il prossimo ciclo —
spazio 0 fisso per la Dashboard, spazi 1-3 per giochi attivi, switch
con Select+D-pad. Fattibilità sul desktop XFCE presumibile (workspace
nativi + wmctrl); su Kiosk **sconosciuta**, dato che EWMH è escluso
(vedi sopra) — l'output di `xdotool search --name ""` come possibile
alternativa non-EWMH era stato richiesto ma non ancora riportato alla
chiusura di questo ciclo.
