# Changelog — v2.1.10-dev.1 in poi

Prosegue da `CHANGELOG-4.md` (chiuso alla milestone v2.1.9-Mercury). Sessione
dedicata ad affinare/completare le feature esistenti, con attenzione
particolare alla risoluzione di bug emergenti.

---

## v2.1.10-dev.1

Chiuso l'ultimo item aperto lasciato da v2.1.9-Mercury: mancava un `npm
rebuild` esplicito in `setup-linux.sh` dopo il suo `npm install` nudo. La
dichiarazione `allowScripts` in `package.json` (introdotta a metà della
sessione precedente) copre un `npm install` a `node_modules` vuota, ma non
rilancia gli script di build nativa (`better-sqlite3`, `esbuild` ×3,
`protobufjs`, `@google/genai`) su pacchetti già presenti in `node_modules` —
il caso tipico di una reinstallazione dopo un aggiornamento di npm. Aggiunto
`npm rebuild` subito dopo `npm install` in `setup-linux.sh`.

Aggiunta anche una nota in `INSTALL.md` (sezione 2, Compilazione) per chi
segue il percorso di installazione manuale senza passare da
`setup-linux.sh`: stesso sintomo (`Could not locate the bindings file`),
stesso rimedio (`npm rebuild` una tantum).

File toccati: `setup-linux.sh`, `INSTALL.md`, `package.json` (bump versione),
`src/App.tsx` (bump fallback letterale versione).

**Verificato**: `tsc --noEmit` — nessun errore nuovo (unico errore residuo è
il consueto mismatch di toolchain sandbox `ignoreDeprecations`, non di
codice, documentato dalle sessioni precedenti). `check-focus-ids.cjs`
invariato (108 id, stesso falso positivo noto `key-sugg-0` — nessuna
modifica alla navigazione in questo step). `bash -n setup-linux.sh` per la
sintassi.

**Non verificato su hardware reale**: il fix riguarda uno scenario di
reinstallazione specifico (npm 12+, `node_modules` non vuota) mai
riprodotto in questa sessione — resta da confermare sul campo se/quando si
ripresenta l'occasione (es. un aggiornamento di npm sulla macchina di
sviluppo).

**Confermato dall'utente**: il lancio di un gioco su hardware reale dopo la
milestone v2.1.9-Mercury è stato testato con successo — lo step
gameManager.ts/downloadManager.ts (solo tipi, mai comportamento runtime)
non ha introdotto regressioni.

**Resta aperto**: `any` residuo in `server.ts` e `App.tsx` (mai coperto da
una roadmap esplicita).

---

## v2.1.10-dev.2 — Punto 2 della roadmap: input controller durante un gioco

Investigazione preliminare (senza scrivere codice) aveva individuato due
bug reali distinti, entrambi confermati leggendo il codice, non ipotizzati:

1. **BUG CRITICO**: `handlePlay` congelava l'input gamepad al lancio
   (`setFocusFrozen(true)`) ma faceva polling su `/api/status` — un
   endpoint di healthcheck generico che risponde SEMPRE e solo
   `{ status, uptime }`, senza mai avere né `running` né `gameRunning`.
   Risultato: `isRunning` valutava sempre `false` al primo tick, e il
   freeze veniva rimosso dopo soli 3 secondi dal lancio, indipendentemente
   da quanto il gioco fosse ancora realmente in esecuzione. Con ogni
   probabilità la causa primaria di "la Dashboard intercetta l'input del
   controller durante il gioco". Fix: polling spostato su
   `/api/system/game-running` (già esistente, già usato da `tray.py` per
   lo stesso scopo, risponde `{ running, gameId?, gameTitle? }` da
   `isLastLaunchedGameRunning()`, che esclude già i launcher condivisi).
   Approfittando della stessa modifica, allineato anche il comportamento
   del ramo di errore fetch al commento che lo descriveva (sblocco dopo
   ~30s di fallimenti CONSECUTIVI, non al primo errore isolato).

2. **Bug secondario**: `InputManager.matchPlugin()` aveva un fallback
   finale incondizionato (`?? plugins[0]`) che ignorava `enabled` —
   disabilitare tutti i plugin di mappatura input (Impostazioni → Input)
   non fermava mai davvero la lettura del gamepad, contraddicendo la
   stessa documentazione di `readPrimary()` ("stato vuoto se... tutti i
   plugin compatibili sono disabilitati"). Fix: `matchPlugin` ritorna ora
   `InputPlugin | null`; i tre chiamanti (`refreshDevices`, `readPrimary`,
   `rumblePrimary`) gestiscono esplicitamente il caso null.

Con il bug (1) corretto, il freeze torna a funzionare per tutta la
durata reale del gioco — ma essendo totale e senza eccezioni, non c'era
alcun modo di riprendere il controllo dalla Dashboard (es. per
raggiungere il Gestore Processi e terminare un processo bloccato) prima
che il gioco tracciato chiudesse. Aggiunte due combo controller, entrambe
richiedono `wmctrl`/`xprop` (nuovo modulo `src/backend/windowFocus.ts`,
stesso `WINDOW_TITLE` e stessa famiglia `wmctrl -i -r`/`-a` già verificata
in `kiosk-launch.sh`/`tray.py`; degrada onestamente, con warning in log,
se questi comandi mancano):

- **Select+L1+R1** (risveglio): unica combo che il gate `isFocusFrozen`
  lascia passare mentre l'input è congelato. Porta la Dashboard in primo
  piano (`wmctrl -a`, dopo aver memorizzato quale finestra esterna aveva
  il focus) e apre direttamente il Gestore Processi.
- **Select+◄/►** (ritorno al gioco): disponibile quando la Dashboard ha
  di nuovo il controllo ma il gioco tracciato risulta ancora in
  esecuzione (`gameStillRunningRef`, popolato dallo stesso polling di
  `handlePlay` che gestisce `isFocusFrozen` — nessun secondo timer).
  Restituisce il focus alla finestra memorizzata e ri-arma il freeze
  — solo se il ripristino del focus riesce davvero, altrimenti la
  Dashboard resterebbe in primo piano ma con l'input congelato, senza
  via d'uscita se non un'altra pressione di Select+L1+R1.

Due nuovi endpoint backend: `POST /api/system/input-wake`,
`POST /api/system/input-return-focus`.

**Rimossa su richiesta esplicita**: la scorciatoia "Select da solo"
equivalente a Start per aprire il quick-menu — con Select ora
modificatore di tre combo diverse in questo stesso effetto (debug
console, risveglio, ritorno al gioco), lasciarlo anche come trigger a sé
avrebbe reso ambiguo ogni frame in cui viene premuto insieme a uno di
quei tasti. Start resta l'unico trigger del quick-menu.

**Limite noto, non un bug**: il ri-arming del freeze è sempre esplicito
(via Select+◄/►), mai automatico per cambio di focus — se dopo un
risveglio si torna al gioco per altre vie (alt-tab manuale, click su una
finestra), il freeze NON si riarma da solo finché il gioco non chiude
per conto suo. Scelta deliberata, coerente con quanto discusso: niente
listener `window.blur`/`focus` per tenere il design semplice ed
esplicito.

File toccati: `src/App.tsx`, `src/input/InputManager.ts`,
`src/backend/windowFocus.ts` (nuovo), `server.ts`, `package.json`.

**Verificato**: `tsc --noEmit` pulito, `check-focus-ids.cjs` invariato
(108 id, stesso falso positivo noto).

**Non verificato su hardware reale**: l'intera catena delle due combo
(percezione pressione mentre "congelato", chiamata endpoint, `wmctrl`/
`xprop` sull'ambiente reale, riapertura Gestore Processi) — mai
riprodotta fuori da un compile/lint check in questa sessione. Da provare
con un controller fisico e un gioco vero prima di considerarla chiusa.

**Restano aperti**: Punto 1 (kiosk mode reale come default — deciso,
non ancora implementato) e Punto 3 (bug di conteggio playtime quando la
splash screen dichiara abortito un lancio che poi parte comunque —
parcheggiato per una sessione dedicata a ripensare la splash screen).

---

## v2.1.10-dev.3 — BUG UTENTE su hardware reale: le combo non rispondevano

Segnalato dall'utente al primo test reale delle combo di dev.2: dopo il
lancio di un gioco la Dashboard veniva ridotta a icona e Select+L1+R1
non produceva alcun effetto.

**Causa**: `tray.py` (v0.99.35) nasconde automaticamente la finestra via
`wmctrl -b add,hidden` quando `/api/system/game-running` risulta true —
proprio per impostare `document.hidden=true` e far sì che
`useGamepad.ts` **fermi il polling del gamepad** durante il gioco (il
meccanismo originale, pre-dev.2, per lo stesso problema). Con l'input
gate di dev.2 (`isFocusFrozen` + combo Select+L1+R1) che richiede
l'esatto opposto — il loop RAF del gamepad deve restare vivo per poter
intercettare la combo di risveglio — i due meccanismi si annullavano a
vicenda: `tray.py` nascondeva la finestra (fermando il polling) prima
ancora che la combo potesse mai essere letta.

**Fix**: rimosso il nascondimento automatico da `tray.py` — l'hide/show
legato a `game-running` (funzione `query_game_running`, la logica in
`poll_loop`, lo stato `auto_hidden`) è stato tolto, non più necessario
ora che `isFocusFrozen` gestisce direttamente (a livello applicativo,
senza nascondere nulla) la reazione della Dashboard all'input durante un
gioco. Il toggle manuale dell'icona systray resta identico nell'uso
(ora con un flag di stato più semplice, `manually_hidden`), la gestione
cursore XFixes è indipendente e non tocca. Rimossa anche `window_exists()`,
diventata dead code.

File toccati: `tray.py`.

**Verificato**: `python3 -m py_compile tray.py` (sintassi), nessun
riferimento residuo alla logica rimossa nel file. `tsc --noEmit` e
`check-focus-ids.cjs` invariati (nessun file TS toccato in questo step).

**Non verificato su hardware reale**: la vera prova di questo fix — che
Select+L1+R1 risponda davvero ora che la finestra non viene più nascosta
— resta da fare sul campo, come già per il resto di dev.2.

**Nota per una sessione futura**: `X-Launcher-Roadmap.md` (sezione URI
scheme, feature non ancora implementata) cita ancora "il meccanismo
hide/show di tray.py" come precedente di design per aprire la finestra
già nascosta — non più accurato dopo questo step. Non toccato in questa
sessione (fuori scope, sezione di roadmap non implementata).

---

## v2.1.10-dev.4 — Punto 1 della roadmap: vero kiosk mode come default

`kiosk-launch.sh` — sopra un desktop esistente (XFCE/MATE/GNOME/Plasma,
CASO 2; la sessione dedicata Gamescope, CASO 1, non cambia):

- **Default (nuovo)**: vero `--kiosk` di Chromium / `-kiosk` di Firefox
  (verificato reale, disponibile da Firefox 71+ — non ipotizzato).
  Riportato dopo l'abbandono in v0.99.12, quando fu diagnosticato un
  input lag misurato su hardware reale, causa isolata
  nell'inizializzazione del rendering interno di Chromium quando parte
  già con `--kiosk` (non nel fullscreen in sé). L'utente accetta
  consapevolmente questo compromesso per uniformare il comportamento su
  ogni desktop senza i trick per-DE usati dal fallback qui sotto — con
  `--kiosk`/`-kiosk` reale il window manager non decora affatto la
  finestra, non c'è nulla da rimuovere dopo. Non richiamate quindi nel
  path di default: `maybe_enable_xfce_panel_autohide`,
  `maybe_enable_xfwm4_titleless`, `remove_window_decorations`.
- **Fallback esplicito**: nuovo flag CLI `--borderless` (o un vecchio
  `app.conf` con `displayMode=borderless` da prima di questo cambiamento,
  rispettato invece di sostituirlo in silenzio con un comportamento mai
  scelto) — implementazione storica invariata, finestra massimizzata con
  decorazioni rimosse via trick per-DE. Era questo il comportamento di
  "kiosk" prima di oggi (le due modalità erano di fatto identiche, solo
  l'etichetta cambiava).
- **Finestra**: invariata per Chromium.

**Fix collaterale**: il parsing degli argomenti prendeva alla cieca
`FORCED_BROWSER="$1"` — con la nuova flag `--borderless`,
`./kiosk-launch.sh --borderless firefox` avrebbe interpretato
`--borderless` stesso come nome del browser. Riscritto il parsing in
cima al file: `--always-on-top` e `--borderless` riconosciuti in
qualunque posizione tra gli argomenti, il browser è il primo argomento
che non è una flag nota.

**Per Firefox**: solo `-kiosk` (nuovo default) separato da tutto il
resto — **limite noto, non risolto in questo step**: "borderless" e
"window" restano sullo stesso identico codice di prima (profilo dedicato
con `userChrome.css` che nasconde barra indirizzi/tab/titlebar). Non è
una regressione introdotta oggi: Firefox non ha mai avuto un vero ramo a
finestra normale in questo script — `DISPLAY_MODE` non veniva
controllato affatto per Firefox prima di questa riscrittura, ogni avvio
otteneva comunque il trattamento borderless. Servirebbe un secondo
profilo Firefox senza quel CSS per separare davvero i due casi — lavoro
a sé, rimandato a una sessione futura.

File toccati: `kiosk-launch.sh`, `package.json`, `src/App.tsx` (solo bump
versione).

**Verificato**: `bash -n kiosk-launch.sh` (sintassi), tutti e tre i
valori di `DISPLAY_MODE` gestiti esplicitamente in entrambi i rami
browser (nessun caso scoperto), `tsc --noEmit` pulito (unico file TS
toccato è il bump versione).

**Non verificato su hardware reale**: l'intera modalità kiosk reale —
se il lag è davvero "convivibile" come previsto, se il focus automatico
e l'auto-hide del cursore tornano gratis (permetterebbe di semplificare
`focus_dashboard_window`/`unclutter`, lasciati invariati per ora), se
`wmctrl -a` in `focus_dashboard_window` continua a funzionare su una
finestra `--kiosk`, e se qualche pannello DE resta comunque visibile
sopra la finestra kiosk su MATE/GNOME/Plasma (mai provato, nessun trick
per-DE applicato deliberatamente nel path di default).

**Ancora da fare per chiudere il punto 1 originale**: la correzione
della funzione menu in `App.tsx` (`applyDisplayMode`/`cycleDisplayMode`,
lo stato interno 'kiosk'/'borderless' oggi identici solo per etichetta,
l'opzione nascosta dietro Ctrl+Alt+K) — non toccata in questo step,
l'utente ha chiesto esplicitamente solo lo script questa volta.

---

## v2.1.10-dev.5 — Punto 1 completato: correzione menu App.tsx

Ultimo pezzo del punto 1: la funzione menu era rimasta con la vecchia
semantica fittizia ('kiosk'/'borderless' identici, distinti solo
dall'etichetta) dopo che dev.4 li ha resi implementazioni davvero
diverse in `kiosk-launch.sh`.

- **Rimosso** interamente il toggle Ctrl+Alt+K e lo stato
  `kioskOptionVisible`: nato per rendere raggiungibile una terza voce di
  menu quando kiosk/borderless erano intercambiabili a scopo di test —
  non ha più senso ora che rappresentano un default reale e un fallback
  deliberatamente diverso, non due varianti equivalenti da esplorare.
- **`cycleDisplayMode`** ridotto a un ciclo fisso a due stati,
  `window ↔ kiosk` — 'borderless' non è più raggiungibile dal menu in
  nessun modo, resta accessibile solo da `--borderless` (CLI) o da un
  vecchio `app.conf` persistito da prima di oggi (rispettato, non
  sostituito in silenzio).
- **Fix onestà etichette**: il badge di stato (angolo in alto) e la voce
  quick-menu riusavano `t('dashboard:consoleMode')`/`t('quickMenu:consoleMode')`
  per 'borderless' — la stessa etichetta "Modalità Console" riservata alla
  futura sessione dedicata X11 (Step 20 della roadmap, non ancora
  iniziata, e già usata correttamente altrove nello stesso quick-menu per
  quel caso — invariato). Nuove chiavi dedicate `kioskMode`/
  `borderlessMode` (4 file di traduzione: `dashboard.json`/`quickMenu.json`
  × it/en) al posto del riuso fuorviante.
- **Fix convenzione i18n**: `applyDisplayMode` aveva due stringhe inglesi
  hardcoded (`'Fullscreen'`/`'Kiosk'`) invece di passare da `t()` — unico
  punto della funzione che non seguiva la convenzione IT+EN del
  progetto, 'window' la seguiva già. Corretto.
- **Rimosse** 5 chiavi di traduzione morte (`fullScreen`, e le 4
  `notif.kioskEnabled*`/`notif.kioskRemoved*` del toggle Ctrl+Alt+K
  rimosso) da tutti e 4 i file di traduzione — verificato nessun
  riferimento residuo in tutto `src/` prima di rimuoverle.

File toccati: `src/App.tsx`, `public/locales/{it,en}/dashboard.json`,
`public/locales/{it,en}/quickMenu.json`, `package.json`.

**Verificato**: `tsc --noEmit` pulito, `check-focus-ids.cjs` invariato
(108 id, stesso falso positivo noto — nessuna modifica alla
navigazione), tutti e 4 i JSON validati con `python3 -c "json.load(...)"`,
nessun riferimento residuo a `fullScreen`/`kioskOptionVisible`/le 4
chiavi notif rimosse in tutto `src/`.

**Non verificato su hardware reale**: il menu stesso (cicla
correttamente solo tra Finestra e Kiosk? le etichette compaiono giuste
nel badge e nel quick-menu?) — insieme a tutto il resto del punto 1
(dev.4), resta da provare sul campo.

**PUNTO 1 DELLA ROADMAP COMPLETO** (script + menu). Prossimo passo:
test hardware reale di tutta la modalità kiosk (lag, focus automatico,
auto-hide cursore, `wmctrl -a`, eventuali pannelli DE ancora visibili).
Resta aperto solo il punto 3 (bug conteggio playtime/splash screen,
parcheggiato per una sessione dedicata).

---

## v2.1.10-dev.6 — BUG UTENTE su hardware reale: freeze si toglieva dopo ~5 minuti

Segnalato dall'utente durante il test del punto 1: gioco in esecuzione,
la Dashboard smette correttamente di reagire al controller, ma dopo
circa 5 minuti torna a rispondere ai pulsanti (non a D-pad/analogico).
L'utente ha sospettato uno scan periodico del database — non era quello,
ma un pezzo di codice PRE-ESISTENTE mai toccato in dev.2.

**Causa**: dentro `handlePlay`, subito dopo il polling a 3s su
`/api/system/game-running` (corretto in dev.2), restava un secondo
`setTimeout` — un "fallback assoluto" ereditato dalla versione precedente
a tutto questo lavoro sul punto 2 — che chiamava `setFocusFrozen(false)`
dopo ESATTAMENTE 5 minuti, **incondizionatamente**: nessun controllo su
`consecutiveFailures`, nessuna verifica che il polling a 3s stesse
funzionando bene. Un timer cieco, indifferente a quanto a lungo si stesse
ancora giocando. Prima che esistesse la combo Select+L1+R1 (dev.2) questo
timer aveva una ragion d'essere — l'unica via d'uscita possibile da un
freeze perenne in caso di rilevamento di chiusura gioco realmente rotto.
Con quella combo ora disponibile come via d'uscita esplicita e affidabile,
il timer cieco è rimasto solo come fonte del bug.

Il sintomo "pulsanti sì, D-pad/analogico no" è coerente con questa causa,
non ne contraddice la diagnosi: una volta che `isFocusFrozen` torna
`false` per errore, TUTTO l'input tornerebbe a funzionare — inclusa la
navigazione D-pad. Ma dopo minuti di freeze il focus non ha un ancoraggio
visibile/percepibile su cui `moveFocus` produca un salto notato
dall'utente, mentre un pulsante come Start (che apre il quick-menu con un
suono) o una delle combo dà un riscontro udibile anche a schermo occupato
dal gioco — da qui l'impressione che solo "i pulsanti" rispondessero.

**Fix**: rimosso interamente il `setTimeout` a 5 minuti. Resta l'unica
rete di sicurezza automatica legittima: lo sblocco dopo ~30s di
fallimenti CONSECUTIVI del fetch (introdotto in dev.2), che si basa su
un'evidenza reale (il backend non risponde più), non su un timer alla
cieca.

File toccati: `src/App.tsx`, `package.json`.

**Verificato**: `tsc --noEmit` pulito, `check-focus-ids.cjs` invariato
(108 id, stesso falso positivo noto), nessun altro refuso di sintassi
residuo nel file (controllo esaustivo di commenti `#` invece di `//`,
già capitato due volte in questa sessione durante le modifiche a mano a
questo stesso blocco).

**Non verificato su hardware reale**: che il freeze duri correttamente
per tutta la sessione di gioco ora, senza il fallback a 5 minuti — la
vera prova di questo fix, come per il resto della modalità kiosk.

---

## v2.1.10-dev.7 — BUG UTENTE su hardware reale: Select+◄/► con più finestre aperte

Segnalato dall'utente: con altre finestre aperte oltre a Dashboard e
gioco, Select+◄/► non riapriva direttamente la finestra di gioco e
lasciava la Dashboard insensibile a ogni comando. L'utente ha proposto
la soluzione corretta: un vero Alt+Tab fra tutte le finestre aperte,
invece di un ritorno mirato a una sola.

**Causa**: il design di dev.2 memorizzava un'UNICA "finestra esterna"
(`lastExternalWindowId`) nell'istante del risveglio (Select+L1+R1),
assumendo implicitamente un ping-pong stretto Dashboard↔gioco. Con altre
finestre di mezzo quella memoria poteva:
- puntare alla finestra sbagliata, se al momento del risveglio aveva il
  focus una terza finestra e non il gioco;
- restare stale, se la finestra ricordata veniva chiusa nel frattempo.

In entrambi i casi `wmctrl -i -a <id>` non restituisce un errore
rilevabile anche quando non mette a fuoco nulla di reale — quindi
`data.success` risultava comunque `true` lato frontend, il freeze
veniva riarmato, e la Dashboard restava bloccata (salvo la combo di
risveglio Select+L1+R1, sempre disponibile) senza aver davvero ceduto
il focus a nessuno.

**Fix**: sostituito l'intero meccanismo con un vero ciclo fra le
finestre reali (`windowFocus.ts`, funzione `cycleWindow`), interrogate
via `wmctrl -l` a OGNI pressione — mai una memoria singola. Select+►
avanza, Select+◄ retrocede, un passo alla volta come un Alt+Tab. Il
punto di partenza è sempre la finestra REALMENTE attiva in quel momento
(xprop), non uno stato ricordato — se l'utente ha cambiato finestra nel
frattempo per altre vie (alt-tab da tastiera, mouse), il ciclo riparte
comunque da lì. Con una sola finestra esterna (il caso comune, solo il
gioco) il comportamento resta identico a prima: entrambe le direzioni
portano sempre a quella.

`wakeDashboard()` semplificata di conseguenza: non memorizza più nulla,
non ne ha più bisogno. Endpoint rinominato coerentemente:
`POST /api/system/input-return-focus` → `POST /api/system/input-cycle-window`
(accetta `{ direction: 'next' | 'prev' }`).

File toccati: `src/backend/windowFocus.ts` (riscritto), `server.ts`,
`src/App.tsx`, `package.json`.

**Verificato**: `tsc --noEmit` pulito, `check-focus-ids.cjs` invariato
(108 id, stesso falso positivo noto), nessun riferimento residuo a
`input-return-focus`/`restoreExternalFocus`/`lastExternalWindowId` in
tutto il progetto (solo commenti che spiegano il fix, nessun codice
vivo).

**Non verificato su hardware reale**: la vera prova di questo fix —
che Select+◄/► navighi correttamente fra tutte le finestre aperte, non
solo fra Dashboard e gioco — resta da fare sul campo con più finestre
aperte contemporaneamente, come nello scenario che ha segnalato il bug.

**PUNTO 2 DELLA ROADMAP**: tutti i bug finora segnalati su hardware
reale (dev.3, dev.6, dev.7) risolti. Resta solo il punto 3 (bug
conteggio playtime/splash screen, parcheggiato per una sessione dedicata).

---

## v2.1.10-dev.8 — Diagnostica per il bug Select+◄/► con più finestre aperte

Nessun fix in questo step — su richiesta esplicita dell'utente, prima
indaghiamo con dati reali invece di indovinare una terza volta. Sintomo
riportato: risvegliata la Dashboard (Select+L1+R1), decidendo di NON
chiudere il gioco e provando a tornarci con Select+◄/►, la Dashboard si
blocca e non risponde più a nessun input controller (nemmeno alla combo
di risveglio).

Due ipotesi discusse con l'utente, entrambe plausibili sulla carta,
nessuna delle due verificata:

- **Ipotesi A**: il vero `--kiosk` (default da dev.4) espone il titolo
  della finestra Dashboard in modo diverso rispetto alla vecchia
  implementazione borderless — se `wmctrl -l` non riporta più
  "X-Launcher HTPC" nel titolo, il filtro che esclude la Dashboard
  dall'elenco delle "altre finestre" fallisce, e `cycleWindow` potrebbe
  ciclare sulla Dashboard stessa: `wmctrl -i -a` non segnala errore in
  quel caso, il freeze si riarma comunque senza che il focus sia mai
  cambiato davvero.
- **Ipotesi B**: il vero `--kiosk` gestisce diversamente la perdita di
  focus verso un'altra applicazione (rispetto alla vecchia finestra
  massimizzata senza bordi), fermando il loop RAF del gamepad come se
  fosse una minimizzazione reale — spiegherebbe perché NESSUN input
  risponde più, nemmeno la combo di risveglio che dovrebbe restare
  sempre attiva.

L'indizio più forte per entrambe: sia la conferma "le scorciatoie
sembrano funzionanti" (dopo dev.3) sia il primo test del punto 1 erano
avvenuti PRIMA che dev.4 introducesse il vero `--kiosk` come default —
questo bug è emerso solo dopo.

**Strumentazione aggiunta**, tutta confluente nello stesso pannello
Debug Console (Ctrl+H), ordinabile per timestamp:

- `src/backend/windowFocus.ts` — `wakeDashboard()` e `cycleWindow()`
  loggano ora ad ogni pressione: l'elenco GREZZO completo di `wmctrl -l`,
  l'elenco filtrato (Dashboard esclusa), quale finestra risulta
  attualmente attiva secondo `xprop`, e quale finestra è stata scelta
  come bersaglio. Usano `gameManager.addLog(...)` invece del solo
  `writeLog` su file — così finiscono anche nella Debug Console
  visibile in-app, non solo in `daemon.log` su disco (poco pratico da
  consultare in un HTPC in modalità kiosk).
- `server.ts` — nuovo endpoint `POST /api/logs` (`{ message, type? }`):
  prima il frontend non aveva alcun modo di scrivere in quella stessa
  Debug Console. Necessario per il punto successivo.
- `src/App.tsx` — nuovo listener `visibilitychange` che logga
  `document.hidden`/`document.visibilityState` ad ogni cambiamento
  (verifica diretta dell'Ipotesi B), più un log nel momento esatto in
  cui scatta ciascuna delle due combo (incluso l'esito della risposta
  del backend per Select+◄/►).

**Refactor minore durante l'istrumentazione**: `getDashboardWindowId()`
in `windowFocus.ts` era rimasta l'unica chiamante di un parsing
duplicato rispetto alla nuova `parseWmctrlList()` — rimossa, chi cerca
la finestra Dashboard ora usa direttamente
`parseWmctrlList().find(...)`.

File toccati: `src/backend/windowFocus.ts`, `server.ts`, `src/App.tsx`,
`package.json`.

**Verificato**: `tsc --noEmit` pulito, `check-focus-ids.cjs` invariato
(108 id, stesso falso positivo noto), nessuna dipendenza circolare fra
`windowFocus.ts` e `gameManager.ts` (verificato leggendo gli import di
`gameManager.ts` prima di aggiungerlo come dipendenza).

**Prossimo passo, non ancora fatto**: riprodurre la sequenza che causa
il blocco (risveglio, NON chiudere il gioco, Select+◄/►) e leggere la
Debug Console per capire con certezza quale delle due ipotesi (o
nessuna delle due) è quella corretta — solo dopo si decide il fix.

---

## v2.1.10-dev.9 — Bug Select+◄/► RISOLTO, confermato da log su hardware reale

La diagnostica di dev.8 ha dato un risultato inequivocabile al primo
tentativo — l'utente ha fornito il log di una riproduzione reale del
bug, niente più ipotesi.

**Causa reale** (Ipotesi A, ma in una forma più precisa di come era
stata formulata): `xprop -root _NET_ACTIVE_WINDOW` e `wmctrl -l`
riportano lo stesso ID di finestra con un padding degli zeri diverso.
Nel log fornito, la Dashboard risultava:
- `0x06000004` in `wmctrl -l` (usato da `cycleWindow` per costruire
  l'elenco delle finestre)
- `0x6000004` (senza lo zero iniziale) come finestra attiva secondo
  `xprop` (usato per capire da dove far partire il ciclo)

Il confronto `w.id === activeId` in `cycleWindow` era un confronto di
**stringhe**: `"0x06000004" !== "0x6000004"` falliva sempre, per
qualunque finestra fosse davvero attiva, non solo per la Dashboard.
`currentIndex` restava quindi sempre `-1`, e il ciclo ricadeva sempre e
comunque sul primo elemento della lista per `next` (l'ultimo per
`prev`) — nel caso osservato, il desktop ("Scrivania"), non il gioco
(BioShock 2). `wmctrl -i -a` su una finestra vera come il desktop
"riesce" comunque (nessun errore), quindi il freeze si riarmava senza
che il focus fosse mai davvero tornato al gioco — esattamente il
sintomo segnalato.

Non era quindi un problema di riconoscimento del TITOLO della finestra
Dashboard (che infatti compariva correttamente, sia nell'elenco grezzo
sia escluso da quello filtrato) — era un problema di formato degli ID
fra due strumenti diversi, applicabile a QUALUNQUE finestra, non solo
alla Dashboard.

**Fix**: nuova funzione `sameWindowId(a, b)` che confronta gli ID
convertendoli a numero (`parseInt(id, 16)`) invece che come stringhe —
`cycleWindow` la usa ora al posto del confronto diretto.

File toccati: `src/backend/windowFocus.ts`, `package.json`.

**Verificato**: `tsc --noEmit` pulito, `check-focus-ids.cjs` invariato
(108 id, stesso falso positivo noto) — nessun file TS con navigazione
toccato in questo step.

**Non verificato su hardware reale**: la vera prova di questo fix —
che Select+◄/► navighi ora correttamente fra le finestre reali (incluso
tornare davvero al gioco) invece di ricadere sempre sulla prima/ultima
della lista — resta da riprovare con la stessa identica sequenza che
ha prodotto il log di dev.8.

**PUNTO 2 DELLA ROADMAP**: tutti i bug finora segnalati su hardware
reale (dev.3, dev.6, dev.9) risolti — dev.9 con causa confermata da log
reale, non solo da ragionamento sul codice. Resta solo il punto 3 (bug
conteggio playtime/splash screen, parcheggiato per una sessione
dedicata).

---

## v2.1.10-dev.10 — Select+◄/► ripensato: dal ciclo generico al puntamento diretto

Il secondo log fornito dall'utente ha mostrato che il fix numerico di
dev.9 (corretto, necessario, ma non sufficiente) non risolveva il
problema di fondo. Causa più profonda, confermata da entrambi i log
reali: `cycleWindow` esclude deliberatamente la Dashboard dall'elenco
su cui cicla — ma quando l'utente preme la combo stando sulla
Dashboard (il caso normale, subito dopo un risveglio con Select+L1+R1),
la Dashboard STESSA è la finestra attiva. L'indice di partenza nel
ciclo è quindi SEMPRE -1 in quel caso, e il ripiego ("primo elemento
della lista") ricadeva sempre sullo stesso risultato arbitrario — in
entrambi i log, il desktop ("Scrivania"), mai il gioco. Un vero
Alt+Tab generico avrebbe richiesto un ordine MRU (most-recently-used)
che X11 non fornisce gratuitamente tramite `wmctrl -l`.

**Su proposta dell'utente**: abbandonato il ciclo generico fra tutte le
finestre aperte (desktop, pannelli, terminale, altre app — troppo
rumoroso e imprevedibile), sostituito con un puntamento DIRETTO alla
finestra del gioco tracciato.

**Nuova funzione `focusGameWindow()`** in `windowFocus.ts`:
- Recupera lo scope/PID del gioco tracciato da un nuovo getter in
  `gameManager.ts` (`getLastLaunchedGameProcessInfo()`, espone solo
  `unit`/`pid` senza esporre l'intero oggetto privato `lastLaunchedGame`).
- Se esiste uno scope systemd (la quasi totalità dei lanci, esclusi
  quelli via URI Steam), usa `processManager.getScopePids(unit)` —
  stesso identico meccanismo cgroup già maturato per
  `isRealProcessAliveInScope` — per ottenere TUTTI i PID discendenti
  del lancio (il wrapper Proton/umu-run, Wine, il game.exe finale).
  Senza scope, ricade sul solo PID diretto tracciato.
- Correla questi PID con l'elenco finestre via `wmctrl -lp` (introdotto
  qui per la prima volta in questo progetto — con PID, non solo ID e
  titolo) — non per titolo, troppo vario fra i giochi (nei log si è
  vista persino un'emoji nel titolo di un altro processo).
- Se trova una corrispondenza, `wmctrl -i -a` la mette a fuoco.

Le due direzioni ◄/► ora chiamano la STESSA identica azione — con un
solo bersaglio possibile, una direzione diversa dall'altra non ha più
senso.

**Endpoint rinominato**: `POST /api/system/input-cycle-window` →
`POST /api/system/input-focus-game` (nessun body necessario, il
bersaglio è sempre "il gioco tracciato").

**Diagnostica precedente lasciata intatta** (dev.8): `focusGameWindow`
logga ora unit/pid/candidatePids/bersaglio trovato o meno, stesso
principio di prima ma sui dati rilevanti per questo nuovo meccanismo.

File toccati: `src/backend/windowFocus.ts` (riscritto), `server.ts`,
`src/App.tsx`, `src/backend/gameManager.ts` (nuovo getter), `package.json`.

**Verificato**: `tsc --noEmit` pulito, `check-focus-ids.cjs` invariato
(108 id, stesso falso positivo noto), nessuna dipendenza circolare fra
`windowFocus.ts`/`gameManager.ts`/`processManager.ts` (verificato
leggendo gli import di entrambi prima di aggiungerli come dipendenze),
nessun riferimento residuo a `cycleWindow`/`sameWindowId`/
`input-cycle-window` in tutto il progetto salvo i commenti che
spiegano la storia del fix.

**Non verificato su hardware reale**: la vera prova di questo
meccanismo — mai provato `wmctrl -lp` su questa macchina, mai
verificata la correlazione PID/cgroup→finestra per un gioco reale.
Possibili sorprese da cercare nel log della Debug Console al prossimo
test: `candidatePids` vuoto (getScopePids fallisce?), o pieno ma senza
alcuna finestra corrispondente (il gioco non crea una finestra X11
diretta per qualche motivo, es. certi giochi Proton con più processi
grafici).

**PUNTO 2 DELLA ROADMAP**: architettura ripensata su proposta
dell'utente dopo due fix insufficienti (dev.7, dev.9) — resta da
confermare sul campo prima di poterlo dire davvero chiuso. Punto 3
ancora parcheggiato.

---

## v2.1.10-dev.11 — Osservazione su Select+◄/► (accantonata) + bug reale risolto (risveglio dashboard)

**Terzo log fornito dall'utente su `focusGameWindow` (dev.10)**: il
meccanismo funziona esattamente come progettato — trova correttamente
la finestra del gioco per PID/cgroup, `wmctrl -i -a` riesce (`esito=true`).
Ma l'utente riporta che il gioco cattura l'input pur restando invisibile,
con la Dashboard che resta disegnata sopra. **Ipotesi annotata per una
sessione futura, non investigata oggi** (su richiesta esplicita
dell'utente — "per il momento lasciamola così"): `focus_dashboard_window`
in `kiosk-launch.sh`, se `X_LAUNCHER_ALWAYS_ON_TOP=true`, imposta uno
stato EWMH "sempre sopra" persistente sulla finestra Dashboard
(`wmctrl -r ... -b add,above`) al momento del lancio — plausibilmente
questo fa sì che il window manager la ridisegni comunque sopra a
qualunque altra finestra indipendentemente da chi ha il focus reale,
spiegando "cattura input ma non si vede". Da verificare se l'utente ha
quel flag attivo, prima di agire.

**Bug reale segnalato e risolto in questo step**: dopo aver risvegliato
la Dashboard (Select+L1+R1), aperto il Gestore Processi, terminato il
gioco attivo e chiuso il Gestore Processi, l'analogico/D-pad restavano
completamente bloccati sulla libreria — solo aprire e richiudere il
quick-menu con Start "risvegliava" di nuovo la navigazione.

**Causa**: il Gestore Processi può normalmente essere aperto SOLO da un
quick-menu già visibile (`viewState === 'quick-menu'`, condizione da cui
dipende la resa stessa del pannello quick-menu). Sia `pm-close` sia il
ramo "Start premuto mentre il Gestore Processi è aperto" (entrambi
codice pre-esistente, mai toccato in questa sessione) danno per scontata
questa precondizione: impostano `activeGroup('quick-menu')` senza mai
toccare `viewState`, perché normalmente è già `'quick-menu'` da prima.
La combo di risveglio (dev.2) apriva invece il Gestore Processi
DIRETTAMENTE, saltando quel passaggio — `viewState` restava `'library'`,
il pannello del quick-menu non veniva mai renderizzato, e `moveFocus`
non aveva nulla su cui muoversi in un gruppo `'quick-menu'` fantasma.
Aprire/richiudere il quick-menu con Start risincronizzava manualmente
`viewState` e `activeGroup`, "risolvendo" il sintomo senza che la causa
fosse mai chiara.

**Fix**: aggiunto `setViewState('quick-menu')` nella combo di risveglio,
replicando esattamente lo stato che l'utente avrebbe se avesse premuto
Start e poi cliccato "Gestore Processi" dal menu — nessuna modifica al
codice pre-esistente di `pm-close`/Start, che restano corretti per il
loro caso d'uso normale.

File toccati: `src/App.tsx`, `package.json`.

**Verificato**: `tsc --noEmit` pulito, `check-focus-ids.cjs` invariato
(108 id, stesso falso positivo noto).

**Non verificato su hardware reale**: la vera prova di questo fix —
che l'analogico/D-pad restino reattivi subito dopo aver terminato un
gioco dal Gestore Processi raggiunto via risveglio, senza dover più
passare da Start.

**PUNTO 2 DELLA ROADMAP**: bug del risveglio dashboard risolto. Il
meccanismo Select+◄/► (focusGameWindow) funziona correttamente per la
correlazione PID/cgroup→finestra, ma resta un problema di stacking
visivo (probabile always-on-top) accantonato su richiesta dell'utente
per una sessione futura con "le idee più lucide". Punto 3 ancora
parcheggiato.

---

## v2.1.10-dev.12 — Punto 3 della roadmap: splash integrata nella Dashboard

Richiesta esplicita dell'utente: sostituire la splash di lancio (finora
una FINESTRA BROWSER SEPARATA — processo Chromium/Firefox a sé, con un
proprio profilo dedicato, spawnato e ucciso da `splashWindow.ts`) con un
overlay React dentro la Dashboard stessa, riciclando lo stesso pattern
visivo di Gestore Processi/File Manager.

**Decisione chiave, confermata dall'utente prima di scrivere codice**:
il freeze dell'input gamepad (`isFocusFrozen`) continua a scattare
IMMEDIATAMENTE al lancio, esattamente come oggi — non spostato alla
rilevazione della finestra di gioco come inizialmente proposto e poi
scartato dall'utente. L'unica eccezione è il tasto di chiusura della
splash (punto c della richiesta), raggiungibile con una combo dedicata
mentre la splash è visibile, senza intaccare in alcun modo il freeze
normale durante il gioco vero e proprio.

**Backend**:
- `launchPhaseTracker.ts` — timeout alzato da 120s a 10 minuti (punto b:
  valore unico, nessuna differenziazione per tipo, per non abortire
  avvii lunghi su sistemi lenti — mitiga ma non risolve del tutto il bug
  noto di conteggio playtime, annotato per una sessione futura dedicata).
  Aggiunta la fase `'cancelled'`, distinta da `'timeout'` (annullamento
  esplicito dell'utente vs automatico).
- `splashOrchestrator.ts` — riscritto senza finestra separata da aprire/
  chiudere. `raceSplashClose` non prende più un `handle`, e la corsa fra
  condizioni ora ne ha TRE invece di due: finestra rilevata / errore
  intercettato / **annullamento esplicito** (nuovo, `requestLaunchCancel`,
  un resolver in attesa per gameId) — oltre al fallback di timeout
  invariato. Log a livello 'info' per l'annullamento utente (non un
  problema, è quello che ha chiesto), 'warning' per il timeout automatico.
- `splashWindow.ts` — **rimosso interamente**, nessun altro chiamante.
- `server.ts` — rimossa la vecchia route HTML `GET /splash` (pagina
  generata al volo, mai più necessaria). Nuovo endpoint
  `POST /api/games/:id/cancel-launch`, chiama `requestLaunchCancel`.
- `gameManager.ts` — rimossi tutti i riferimenti a `splashHandle`/
  `openSplashForLaunch`; i due punti che chiudevano la vecchia finestra
  in caso di lancio fallito ora emettono `phase: 'failed'` per conto
  proprio, lasciando che sia il frontend a chiudersi reagendo all'evento.

**Frontend** (`App.tsx`):
- Nuovo stato `splashInfo` (null quando non visibile — un solo stato
  invece di flag+campi separati, per non avere mai campi "vecchi"
  visibili un frame dopo la chiusura) e `splashEventSourceRef`.
- `openSplashEventSource`/`closeSplash`: aprono/chiudono la connessione
  SSE verso lo stesso endpoint già esistente
  (`/api/games/:id/launch-stream`, invariato lato backend). Le fasi
  terminali chiudono la splash da sole dopo un breve intervallo (1.5s
  per 'done', 3.5s per le altre) — stesso principio dei `sleep()` che il
  backend faceva prima di chiudere la vecchia finestra, spostato qui.
- Agganciata in `handlePlay`, aperta PRIMA del fetch di lancio (stesso
  principio già stabilito per la vecchia finestra: appare subito, non
  solo dopo la verifica verb). Esclusi i launcher condivisi standalone
  (`id.endsWith('-launcher')`, stessa convenzione già in uso lato
  backend) — nessuna sequenza di caricamento a fasi per quei due app
  desktop. Chiusura anche se il fetch di lancio stesso fallisce (rete),
  altrimenti resterebbe orfana.
- **Nuova combo Select+B**, eccezione al gate `isFocusFrozen` disponibile
  SOLO mentre `splashInfo` non è null: annulla il lancio
  (`POST /api/games/:id/cancel-launch`), chiude la splash, sblocca
  l'input immediatamente. Una volta che la splash si chiude da sola
  (fase 'done', gioco rilevato), questo ramo smette di scattare — il
  freeze normale (con la sola eccezione Select+L1+R1) prende il sopravvento
  esattamente come oggi.
- Overlay JSX: stessa struttura a schermo intero degli altri overlay
  (sfondo quasi opaco, `z-[170]` — sopra File Manager/Game Options,
  sotto la tastiera virtuale), pulsante di chiusura IDENTICO a
  `pm-close` per stile e posizione, logo "X LAUNCHER" (stesso stile del
  logo in header, nessun asset immagine), titolo gioco + testo di fase,
  barra di progresso indicativa (non un progresso reale, solo un
  riscontro visivo che la fase sta avanzando).

**Bug corretto durante l'implementazione**: un mio errore di editing
aveva accidentalmente cancellato la riga di dichiarazione di
`handlePlay` stessa, inserendo le due nuove funzioni al suo posto
invece che prima di essa — individuato subito dal fallimento di `tsc`
(conteggio parentesi graffe sbilanciato), corretto prima di proseguire.

File toccati: `src/backend/launchPhaseTracker.ts`,
`src/backend/splashOrchestrator.ts` (riscritto),
`src/backend/splashWindow.ts` (rimosso), `server.ts`,
`src/backend/gameManager.ts`, `src/App.tsx`, `package.json`.

**Verificato**: `tsc --noEmit` pulito, `check-focus-ids.cjs` — 109 id
dichiarati (109, +1 per `splash-close`), stesso falso positivo noto
invariato, nessun riferimento residuo a `splashHandle`/
`openSplashForLaunch`/`openSplashWindow`/`SplashWindowHandle` in tutto
il progetto.

**Non verificato su hardware reale**: l'intera funzionalità è nuova di
zecca in questo step — la splash che appare/aggiorna le fasi/si chiude
da sola al momento giusto, la combo Select+B che annulla davvero un
lancio, e soprattutto che il timeout a 10 minuti si comporti bene su un
lancio lento reale. Prossimo test necessario prima di considerare
questo punto chiuso.

**PUNTO 3 DELLA ROADMAP**: implementato, non ancora confermato su
hardware reale. Con questo, tutti e tre i punti della roadmap di
sessione hanno una prima implementazione completa — resta solo la
verifica sul campo di questo ultimo pezzo, più il problema di stacking
Select+◄/► (dev.10, accantonato) e il gap Firefox "finestra" (dev.4,
annotato) per una sessione futura.

---

## v2.1.10-dev.13 — Diagnostica per il bug Proton "chiusura prematura"

Segnalato dall'utente tramite log reale: i giochi lanciati con Wine
puro (Lutris Build) si avviano coerentemente, quelli lanciati con
Proton (GE-Proton) vengono dichiarati "chiusi" dopo pochi secondi
nonostante siano ancora effettivamente in esecuzione in primo piano e
visibili nel Gestore Processi — una volta dichiarati chiusi, la
Dashboard torna a intercettare tutti gli input in background.

**Lettura precisa del log fornito**: a 4s dal lancio, il ramo di grazia
esistente (`realProcessStillRunning && elapsedMs < quickExitThresholdMs`
in `isLastLaunchedGameRunning`) scatta correttamente — non tratta ancora
la chiusura come vera. Ma il controllo successivo, 4 secondi dopo
esatti, decide che il gioco è chiuso per davvero (`stopScreensaverInhibit`
scatta, tracciamento azzerato) nonostante il gioco sia ancora vivo.

**Ipotesi non verificata, da confermare con dati reali**: `pgrepGameStillRunning`
cerca un processo la cui riga di comando contenga il nome della cartella
di installazione (`pgrep -f -- "<installDirName>"`). Con Wine diretto il
processo finale mantiene quel percorso per tutta la sua vita. Con Proton,
la catena passa per il container Steam Linux Runtime
(`pressure-vessel`) — è plausibile che il processo finale del gioco,
visto dall'host, non riporti più il nome della cartella nella propria
riga di comando (namespace di mount del container), mentre il PRIMO
controllo lo agganciava ancora su un processo intermedio della catena
d'avvio che quel percorso ce l'aveva ancora.

**Nessun fix in questo step** — solo diagnostica, stesso principio già
efficace per la saga Select+◄/►: prima i dati, poi il fix.

**Diagnostica aggiunta** in `gameManager.ts` (tutta a livello 'debug',
visibile nella Debug Console Ctrl+H via `this.addLog`):
- `pgrepGameStillRunning`: logga il caso "pgrep -f non ha trovato
  nulla" esplicitamente; se trova PID, logga OGNI PID con la sua riga
  di comando COMPLETA (`ps -o args=`) prima di qualunque filtro
  Gamescope; logga anche il caso "solo processi Gamescope o nessun
  processo reale trovato" al termine, per distinguerlo dal caso "pgrep
  non ha trovato nulla affatto".
- Punto di chiamata in `isLastLaunchedGameRunning`: una riga riassuntiva
  per OGNI controllo (`installDirName`, `elapsedMs`,
  `realProcessStillRunning`, `effectiveSharedLauncherId`) prima di
  qualunque branching — così si vede la decisione completa di ogni
  singolo poll, correlabile con i dettagli PID/cmdline sopra.

File toccati: `src/backend/gameManager.ts`, `package.json`.

**Verificato**: `tsc --noEmit` pulito, `check-focus-ids.cjs` invariato
(109 id, nessun file con navigazione toccato in questo step).

**Prossimo passo, non ancora fatto**: rilanciare un gioco Proton reale
(es. Control Ultimate Edition, lo stesso del log fornito) e leggere la
Debug Console per vedere esattamente cosa trova `pgrep -f` al primo e
al secondo controllo — solo allora si potrà scrivere un fix mirato
invece di uno ipotetico.

---

## v2.1.10-dev.14 — RISOLTO: chiusura prematura dei giochi Proton

Causa confermata da log reale (dev.13) + lettura del codice, su proposta
dell'utente ("possiamo legare tutto alla presenza del gioco nel gestore
processi, senza eccezioni per tipo?" — sì, e la risposta era già quasi
tutta scritta nel codice).

**Causa reale**: `processNameHint` (necessario per attivare la
rilevazione precisa basata su scope/cgroup, `isRealProcessAliveInScope`)
viene impostato SOLO per Epic Games, lanci con launcher condiviso, o
profili Gamescope. Un gioco GOG lanciato via Proton generico (GE-Proton,
nessuna di quelle tre condizioni) non lo riceveva mai — precipitava
quindi nel ramo naive `process.kill(pid, 0)` sul PID nudo tracciato al
lancio, che per Proton è il PID del wrapper (`proton run`), non del
gioco vero: esce presto una volta consegnato il testimone al container,
esattamente lo stesso bug già diagnosticato e risolto per Epic/legendary
in v1.1.31, ma mai esteso al caso generico. Wine puro (Lutris Build) non
ne soffriva mai perché execa direttamente nel processo tracciato, senza
un livello di wrapper intermedio che esca prima del gioco.

Il diagnostic di dev.13 aveva puntato inizialmente il dito su
`pgrepGameStillRunning("files")` (che agganciava per puro caso processi
Chromium/Steam estranei, via il flag `--shared-files`) — ma quella non
era la causa reale, solo il sintomo di un ripiego di riserva
strutturalmente inadatto: il vero problema era che la rilevazione
precisa scope/cgroup non veniva mai raggiunta per questo tipo di lancio.

**Fix**: la condizione per usare la rilevazione basata su scope non
dipende più dalla presenza di un `processNameHint` specifico — se esiste
uno scope tracciato (`unit`, vero per la quasi totalità dei lanci, Wine
e Proton, con o senza launcher condiviso), lo si usa sempre:
- Con `processNameHint` disponibile: confronto preciso per nome
  (`isRealProcessAliveInScope`) — **comportamento invariato** per
  Epic/launcher condivisi/gamescope, necessario per distinguere il gioco
  vero da un launcher condiviso rimasto aperto nello stesso scope.
- Senza: basta che lo scope contenga QUALUNQUE processo reale
  (`processManager.getScopePids(unit).length > 0`) — se il cgroup si
  svuota del tutto, l'intera catena di lancio (verifica ambiente,
  wrapper, gioco vero) è finita per davvero, qualunque sia stata la sua
  lunghezza. Nessun confronto sul nome necessario: exec() non lascia mai
  la cgroup vuota durante un passaggio di consegne fra processi della
  stessa catena.
- Nessuno scope e nessun hint (solo i lanci Steam via URI, mai avvolti
  in uno scope per costruzione): unica eccezione strutturale rimasta,
  non un'altra euristica indovinata — resta il PID diretto.

Aggiunta anche una riga diagnostica (`[DIAG] isLastLaunchedGameRunning`)
per confermare sul prossimo lancio reale quale ramo viene preso.

File toccati: `src/backend/gameManager.ts`, `package.json`.

**Verificato**: `tsc --noEmit` pulito, `check-focus-ids.cjs` invariato
(109 id, nessun file con navigazione toccato).

**Non verificato su hardware reale**: la vera prova — rilanciare
Control Ultimate Edition (lo stesso gioco del log che ha rivelato il
bug) e confermare che non venga più dichiarato chiuso prematuramente.

**Nota per una sessione futura**: con questo fix, il meccanismo di
grazia "quick exit" in `startGameExitPolling()` (`pgrepGameStillRunning(installDirName)`,
diagnosticato in dev.13) diventa probabilmente in gran parte superfluo
per questa classe di bug — `isLastLaunchedGameRunning()` ora riporta
`running:true` correttamente per tutta la durata reale del lancio.
Non toccato in questo step (un fix alla volta) — da rivalutare una
volta confermato che dev.14 risolve il problema sul campo.

---

# v2.1.10-Mercury — MILESTONE CONGELATA

Chiude il ciclo di sviluppo aperto dopo v2.1.9-Mercury (dev.1→dev.14,
questo file). Tutti e tre i punti della roadmap di sessione confermati
su hardware reale, salvo un problema noto esplicitamente accantonato.

## Punto 1 — Kiosk mode reale come default
Vero `--kiosk` (Chromium) / `-kiosk` (Firefox) come default sopra un
desktop esistente (XFCE/MATE/GNOME/Plasma), al posto del trick storico
borderless-massimizzato-senza-decorazioni (ora fallback esplicito via
`--borderless` o un vecchio `app.conf`). Menu corretto di conseguenza
(ciclo a 2 stati, etichette oneste). **Confermato su hardware reale**:
lag accettabile come previsto.

## Punto 2 — Input controller durante un gioco
Due bug reali corretti all'origine (`handlePlay` interrogava l'endpoint
sbagliato; un fallback in `InputManager` ignorava `enabled`). Aggiunte
due combo: Select+L1+R1 (risveglia la Dashboard, apre il Gestore
Processi) e Select+◄/► (torna alla finestra del gioco tracciato,
correlata per PID/cgroup). Corretti altri tre bug reali emersi dai test
(freeze che si toglieva da solo dopo 5 minuti; analogico bloccato dopo
aver terminato un gioco dal Gestore Processi; chiusura prematura dei
lanci Proton, causa e fix entrambi in `isLastLaunchedGameRunning`).
**Confermato su hardware reale** per tutti i bug sopra.

**Resta aperto, accantonato su richiesta esplicita dell'utente per una
sessione futura "con le idee più lucide"**: con più finestre aperte,
Select+◄/► sposta correttamente il focus di input sul gioco (verificato
da log reale) ma la Dashboard resta visivamente disegnata sopra —
sospetto non verificato: `X_LAUNCHER_ALWAYS_ON_TOP` in `kiosk-launch.sh`
imposta uno stato EWMH "sempre sopra" persistente che potrebbe
interferire indipendentemente da chi ha il focus.

## Punto 3 — Splash integrata nella Dashboard
Sostituita la vecchia finestra browser separata con un overlay React
nella Dashboard stessa, stesso stream SSE già esistente. Il freeze
scatta comunque immediatamente al lancio (scelta esplicita
dell'utente); nuova combo Select+B annulla un lancio lungo senza
intaccare il freeze normale in-game. Timeout di sicurezza alzato da
120s a 10 minuti. **Confermato su hardware reale**, con un beneficio
collaterale non previsto: boot dei giochi sensibilmente più veloce
(un intero processo browser in meno da avviare ad ogni lancio).

## Altri limiti noti, non risolti in questo ciclo
- Per Firefox, la modalità "finestra" condivide ancora lo stesso
  profilo/CSS della modalità borderless (gap pre-esistente, mai un vero
  ramo distinto — servirebbe un secondo profilo dedicato).
- Il meccanismo di grazia "quick exit" in `startGameExitPolling`
  (`pgrepGameStillRunning(installDirName)`) è probabilmente in gran
  parte superfluo dopo il fix Proton di dev.14 — non toccato, da
  rivalutare in futuro.
- `X-Launcher-Roadmap.md` (sezione URI scheme) cita ancora il vecchio
  meccanismo hide/show di `tray.py`, rimosso in dev.3 — da correggere
  quando/se si riprende quel punto di roadmap.

## Verifica finale prima del congelamento
`tsc --noEmit` pulito, `check-focus-ids.cjs` invariato (109 id
dichiarati, stesso falso positivo noto `key-sugg-0` di inizio sessione).
