# X-Launcher — Changelog

---

## MILESTONE v1.5.20-Venus (8 agosto) — quinta Venus

Congela l'intera sessione Step 19d — dalla generalizzazione dello switch Umu-launcher fino alla chiusura completa della catena "gioco che dipende da un launcher condiviso", con Watch Dogs 2/Ubisoft Connect come primo caso reale portato fino in fondo su hardware reale. Precede v1.5.14-Venus.

### Cosa contiene, in sintesi (dettaglio completo voce per voce qui sotto, v1.5.20-dev.1→28)

**Fondamenta Umu-launcher** (dev.1-4): switch "Umu-launcher" generalizzato a qualunque gioco Proton (non solo i launcher condivisi); risolve in modo confermato il problema storico "finestra nera dal secondo avvio" di Ubisoft Connect (container Steam Linux Runtime mancante); esteso anche a Epic/legendary via `--wrapper`.

**Fase A — infrastruttura generica per launcher terzi futuri** (dev.10, dev.12): `thirdPartyLaunchers.ts`/`downloadManager.ts`/`base.ts` generalizzati per EA App/Battle.net/Rockstar (mai costruiti come plugin unico — decisione esplicita, ognuno resta un proprio `StorePlugin`); file manager nativo controller-navigabile (`fileManager.ts`) per sostituire zenity/kdialog col controller.

**Bug reale GOG** (dev.11): `--game` di lgogdownloader è un filtro regex, non un match esatto — corretto con ancoraggio `^slug$`.

**Saga Watch Dogs 2/Epic** (dev.13-17): Epic non ospita file per questa categoria di titoli Ubisoft (confermato con issue GitHub reale) — costruita una riconciliazione generica (mai scraping di libreria, per evitare doppioni) che rileva l'installazione avvenuta altrove e aggiorna la card d'origine.

**Saga controllo verb al lancio** (dev.18-20): il controllo dipendenze pre-lancio bloccava Ubisoft Connect per 16 minuti (log reali alla mano) — reso davvero asincrono (`execFileAsync`), poi riportato a girare PRIMA del lancio (mai in parallelo a un processo già attivo sulla stessa prefix — corrompeva la sessione di LEGO Indiana Jones).

**Saga lancio "leggero" nella sessione condivisa** (dev.21-28, la più estesa): verificato a mano che un secondo processo può agganciarsi al `wineserver` già attivo di un launcher condiviso invece di richiedere un secondo container — costruita l'intera catena (avvio automatico del launcher, notifica esplicita di chiusura, eredità obbligatoria di runner/prefix/Umu-launcher dal launcher condiviso, mai una scelta indipendente che il lancio reale potrebbe ignorare). **8 bug reali trovati in sequenza, quasi tutti con diagnosi diretta dell'utente** (log, query SQL dirette al DB) — mai un fix accettato come risolutivo senza conferma esplicita su hardware reale. Causa più significativa: due tabelle diverse (`games` e `shared_launcher_prefixes`) conservavano lo stesso concetto (runner/eseguibile del launcher) con proprietari di scrittura diversi, driftate silenziosamente da settimane — risolto eliminando la duplicazione, non solo il sintomo.

### Verificato

`tsc --noEmit`: 8 (baseline invariata dall'inizio della sessione). `check-focus-ids.cjs`: 103 id, stesso singolo falso positivo di sempre (`key-sugg-0`, limite noto dello script di analisi statica). **Confermato dall'utente su hardware reale**: la catena Watch Dogs 2 → Ubisoft Connect funziona end-to-end, dalla scoperta del gioco alla chiusura.

### Prossimi passi (vedi X-Launcher-Roadmap.md e CHANGELOG-2.md per lo sviluppo successivo a questa milestone)

Fase B (EA App/Battle.net/Rockstar Games Launcher, dati reali uno alla volta) non ancora iniziata. Nota aperta non urgente: `PROTON_EAC_RUNTIME` risultava impostato sulla card sbagliata di Ubisoft Connect in un log di sessione (dev.18) — mai confermato/corretto lato utente, verosimilmente un tocco accidentale sulla card sbagliata.

---

## v1.5.20-dev.1 — Step 19d: switch "Umu-launcher" generalizzato nel Compatibility Layer

Implementato il fix `umu-launcher` deciso a fine sessione precedente (vedi diario di sessione dopo v1.5.19-dev.1), ma **generalizzato su richiesta dell'utente**: non solo per i launcher condivisi, uno switch disponibile in Compatibility Layer per QUALUNQUE gioco con runner Proton.

### Verificato prima di scrivere codice (nessuna assunzione)

- **Pacchettizzazione reale per distro**: Arch → `umu-launcher` in multilib (`sudo pacman -S umu-launcher`, confermato su archlinux.org). Debian/Ubuntu e Fedora → **nessun pacchetto ufficiale nei repo** — il progetto (Open-Wine-Components/umu-launcher) pubblica `.deb` precompilati per debian-12/13/ubuntu-noble e `.rpm` per fc42/fc43 direttamente sulla pagina GitHub Releases. Il binario si chiama `umu-run` (nome diverso dal pacchetto `umu-launcher`).
- **Sintassi di invocazione reale** (man umu, wiki FAQ ufficiale): `WINEPREFIX=<prefix> PROTONPATH=<cartella build proton> GAMEID=<id arbitrario> umu-run <exe> [args]`. `PROTON_VERB=waitforexitandrun` è già il default, non serve impostarlo esplicitamente. `PROTONPATH` è la cartella che CONTIENE il binario `proton`, non il binario stesso.
- **Compatibilità con la prefix già esistente, verificata leggendo il codice reale**: `resolveRunnerWineEnv()` (downloadManager.ts) crea già oggi la vera prefix Wine in `<containerPrefixPath>/pfx` per qualunque runner Proton — esattamente il path che `umu-run` si aspetta come `WINEPREFIX` diretto. Nessuna migrazione necessaria: lo stesso prefix funziona identico attivando/disattivando lo switch.

### `src/types.ts`

Nuovo campo `umuRun?: boolean` in `CompatibilityProfile`, default `false` per qualunque gioco (mai auto-attivato, nemmeno per i launcher condivisi — scelta esplicita dell'utente come eac/battleye/fsr).

### `src/backend/compatibilityManager.ts`

`detectSystemTools()`: nuova chiave `umu: this.binaryExists('umu-run')`. `getDefaultProfile()`: `umuRun: false`.

### `src/backend/runners/base.ts` + `src/backend/gameManager.ts`

`RunnerConfig.umuRun?: boolean` aggiunto e propagato da `profile?.umuRun` nella costruzione di `runnerConfig` prima di `runner.launch()`.

### `src/backend/runners/implementations.ts` — `ProtonRunner.launch()`

Se `config.umuRun` è attivo e `umu-run` è installato: sostituisce `<protonBin> run <exe>` con `umu-run <exe>`, impostando `WINEPREFIX=<prefix>/pfx`, `PROTONPATH=<dirname(protonBin)>`, `GAMEID=x-launcher-<gameId>`. GameMode (se attivo) avvolge `umu-run` esattamente come avvolgeva `protonBin` prima. Se il toggle è attivo ma `umu-run` non è installato: log di avviso, fallback esplicito al `proton run` diretto attuale — mai un lancio bloccato. Il log diagnostico `[PROTON-ENV]` (introdotto in v1.5.18-dev.1 per il debug di Ubisoft Connect) ora include anche `GAMEID`.

**Non ancora verificato su hardware reale**: se le variabili `STEAM_COMPAT_DATA_PATH`/`STEAM_COMPAT_CLIENT_INSTALL_PATH` (già calcolate per il percorso diretto) interferiscono con la gestione interna del container fatta da `umu-run` — lasciate invariate nell'ambiente per ora, marcato esplicitamente nel codice come da confermare con un test reale.

**Fuori scope per questa voce**: il percorso Epic via `legendary --wrapper` (launchEpicViaLegendary) non è stato toccato — combinare `umu-run` con il meccanismo `--wrapper` di legendary non è stato verificato, resta sul `proton run` diretto attuale finché non si verifica esplicitamente anche quel caso.

### `src/App.tsx`

- **Tool di sistema** (tab Sistema): nuova tile `['umu', 'Umu-launcher']`, stesso trattamento informativo delle altre.
- **Compatibility Layer**: 7° tile "Umu-launcher" (`gameOptions:umuLauncher`/`umuLauncherDesc`, it+en), switch booleano semplice come FSR/GameMode. Oscurato se il runner attivo non è Proton (stessa restrizione già applicata a EAC/BattlEye, `requiresProton` esteso a includere `umuRun`). **Fix navigazione**: con 7 voci su griglia a 2 colonne l'ultima riga ha un solo elemento (non più una coppia come con 6 voci) — la formula di ancoraggio `neighbors.down` per l'ultima riga è stata generalizzata (`arr.length % 2 === 0 ? 2 : 1` invece del fisso `-2`), così non richiede un altro aggiustamento manuale alla prossima voce aggiunta.

### Traduzioni

`gameOptions.json` it+en: nuove chiavi `umuLauncher`/`umuLauncherDesc`.

### `setup-linux.sh`

`umu-run` aggiunto come dipendenza raccomandata (mai auto-installata) nei tre blocchi distro: comando diretto per Arch, link alla pagina Releases con istruzioni `dpkg`/`dnf` per Debian/Fedora (nessun pacchetto ufficiale nei repo).

### Verifica

`tsc --noEmit`: 18 errori pre-esistenti invariati, zero nuovi. `node scripts/check-focus-ids.cjs`: 94 id, zero riferimenti rotti, stessi 8 pattern dinamici non risolvibili staticamente di sempre (nessuno nuovo — `compat-${key}` è un pattern già noto, il 7° elemento dell'array non introduce un nuovo caso).

**Da fare alla prossima sessione**: test reale su Ubisoft Connect con lo switch attivato, per confermare che risolva davvero la finestra nera dal secondo avvio.

---

## v1.5.20-dev.2 — Fix bug reale: switch "Umu-launcher" non persistente

Segnalato dall'utente: lo switch si azzerava riaprendo l'overlay Game Options. Causa trovata leggendo il codice reale (non ipotizzata): il campo `umuRun` era stato aggiunto in v1.5.20-dev.1 solo in `types.ts`/`compatibilityManager.ts`/`App.tsx` — **mai nello schema SQLite**. `upsertCompatProfile`/`getCompatProfile` (db.ts) hanno una lista di colonne fissa (non dinamica); un campo assente dalla query non genera errore, viene semplicemente ignorato in silenzio — nessun crash che segnalasse il problema, il valore restava solo nello stato React locale (`localCompatProfile`) finché l'overlay restava aperto.

### `src/backend/db.ts`

- **`CREATE TABLE compat_profiles`**: aggiunta colonna `umu_run INTEGER NOT NULL DEFAULT 0`.
- **Migrazione**: nuovo blocco `if (!compatCols.includes('umu_run')) ALTER TABLE ...` — installazioni esistenti (CREATE TABLE IF NOT EXISTS non tocca tabelle già create) ottengono la colonna al prossimo avvio del daemon, stesso schema già usato per eac/battleye/disable_wine_sync in passato.
- **`upsertCompatProfile`**: `umu_run` aggiunto a INSERT, VALUES, ON CONFLICT UPDATE SET, e ai parametri bind (`umuRun: profile.umuRun ? 1 : 0`).
- **`getCompatProfile`**: aggiunta `umuRun: row.umu_run === 1` al mapping di ritorno.

Non toccato: `exportCompatProfilesRaw`/`importCompatProfilesRaw` (Cloud Backup) — leggono/scrivono le colonne dinamicamente via `Object.keys`, già compatibili senza modifiche.

### Verifica

**Test isolato con better-sqlite3 in memoria** (schema reale, stesso statement SQL di db.ts): scrittura con `umuRun:true` → lettura → PATCH simulato di un campo diverso (fsr) → rilettura pulita (simula chiusura/riapertura overlay) — `umuRun` sopravvive invariato in ogni passaggio. Testata anche la migrazione su un DB con lo schema vecchio (senza `umu_run`): colonna aggiunta correttamente, righe esistenti preservate, default `0`.

`tsc --noEmit`: 18 errori pre-esistenti invariati. `check-focus-ids.cjs`: zero riferimenti rotti (nessuna modifica alla navigazione in questa voce).

---

## v1.5.20-dev.3 — Fix bug reale: switch non visibile alla riapertura + audit tsc

Secondo bug segnalato dall'utente dopo il fix v1.5.20-dev.2: il valore era ormai salvato correttamente nel DB (confermato dall'utente via `sqlite3 PRAGMA table_info`), ma l'overlay Game Options lo mostrava **sempre spento** alla riapertura, dando l'impressione che non si salvasse affatto.

### Causa reale (trovata leggendo il codice, non ipotizzata)

`src/App.tsx` — l'`useEffect` che carica il profilo compat quando si apre l'overlay (`showGameOptions`/`selectedGame`) ricostruisce `localCompatProfile` da zero con una lista di campi **hardcoded** (`fsr`, `gameMode`, `mangohud`, `eac`, `battleye`) invece di fare merge col profilo ricevuto dal server — `umuRun` non era in quella lista, quindi veniva scartato ad ogni apertura indipendentemente da cosa contenesse il DB. Il salvataggio lato server (fix v1.5.20-dev.2) era corretto fin da subito; il problema era solo nella lettura per la visualizzazione.

### Fix

- **`src/App.tsx`**: aggiunta `umuRun: !!profile.umuRun` all'oggetto costruito in quell'effect.
- **Bug di navigazione minore trovato nello stesso punto**: `overlayNavAnchors.lastMiddleId` (usato dal campo Executable Path per il tasto "su") puntava ancora a `compat-battleye`, valido finché quello era l'ultimo tile della griglia Compatibility Layer — con l'aggiunta di `umuRun` come 7° tile in v1.5.20-dev.1, battleye è diventato il penultimo. Non rilevato da `check-focus-ids.cjs` perché `compat-battleye` è comunque un id esistente (nessun riferimento rotto, solo geometricamente impreciso). Corretto a `compat-umuRun`.

### Bonus — audit tsc: baseline abbassato da 18 a 8

Aggiungere `profile.umuRun` faceva salire tsc da 18 a 19 errori: stessa causa già presente per gli altri 9 campi dello stesso oggetto (`fsr`, `gameMode`, `mangohud`, `eac`, `battleye`, `customEnv`, `winetricksVerbs` ×2, `disableWineSync`, `useKnownFixes`) — il ramo `: {}` del ternario `r.ok ? r.json() : {}` non è una `Promise`, mentre `r.json()` lo è: TypeScript inferiva il tipo del `.then()` successivo come `{}` invece di `any`, segnalando come inesistente ogni singolo accesso a `profile.X`. Corretto con `Promise.resolve({})` al posto di `{}` — stesso comportamento a runtime, ma allinea i due rami allo stesso tipo. Risolve tutti e 10 gli accessi in un colpo solo (i 9 pre-esistenti + il nuovo `umuRun`).

**NUOVA BASELINE tsc --noEmit: 8 errori pre-esistenti** (scesa da 18 — audit esplicito, non una regressione mascherata: verificato riga per riga che i 10 errori spariti sono tutti "Property does not exist on type '{}'" sullo stesso oggetto `profile`, gli 8 rimasti sono gli altri già noti e distinti — RefObject useScrollOnceOverflow, notif.primaryAction, pendingRunnerAction ×2, mapButtons ×2, compatibilityManager execSync overload, modulo howlongtobeat mancante).

### Verifica

`tsc --noEmit`: 8 (nuova baseline, confermata riga per riga contro la baseline precedente di 18 — zero errori di categoria diversa introdotti). `check-focus-ids.cjs`: 94 id, zero riferimenti rotti.

---

## v1.5.20-dev.4 — Umu-launcher esteso a Epic Games (legendary)

Domanda dell'utente dopo il test riuscito su Ubisoft Connect: possibile anche per Epic, esplicitamente lasciato fuori scope in v1.5.20-dev.1 perché la combinazione legendary+umu-run non era verificata. **Verificato prima di scrivere codice** (non un'estensione ipotizzata): Heroic Games Launcher offre un'opzione "Use UMU as Proton runtime" per i titoli Epic esattamente tramite lo stesso meccanismo `--wrapper` di legendary già usato in questo progetto — confermato con issue reali su GitHub Heroic (log che mostrano `GAMEID` e comandi Wine passare per umu quando l'opzione è attiva). Stessa combinazione, non una nuova invenzione.

### `src/backend/runners/implementations.ts` — `launchEpicViaLegendary()`

Nel ramo Proton (`isProton`): se `config.umuRun` è attivo e `umu-run` è installato, il wrapper passato a legendary diventa `umu-run` invece di `'<protonBin>' run`, con `WINEPREFIX=<prefix>/pfx`/`PROTONPATH`/`GAMEID` al posto di `STEAM_COMPAT_DATA_PATH`/`STEAM_COMPAT_CLIENT_INSTALL_PATH` — stesso identico schema già usato in `ProtonRunner.launch()`. legendary si limita a prependere il wrapper davanti a `<exe> [argomenti EOS]`, nessun'altra differenza nel resto del flusso legendary/autenticazione EOS. Fallback esplicito con log di avviso se `umu-run` non è installato, mai lancio bloccato. EAC/BattlEye (`applyProtonAnticheatEnv`) invariati: sono variabili lette dallo script Proton stesso, che `umu-run` invoca comunque al suo interno.

Il tile "Umu-launcher" in Compatibility Layer non aveva bisogno di alcuna modifica: la sua disponibilità dipendeva già solo dal runner (Proton sì, Wine-Lutris no), mai dallo store — questa voce chiude semplicemente il gap fra cosa la UI prometteva e cosa succedeva davvero al lancio per i titoli Epic.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 94 id, zero riferimenti rotti (nessuna modifica al JSX in questa voce).

**Non ancora testato su hardware reale** — stesso principio di prudenza delle voci precedenti: verificare con un titolo Epic reale prima di considerarlo definitivo.

---

## v1.5.20-dev.5 — 4 bugfix: hold-to-clear, cursore tastiera virtuale, card Ubisoft Connect, icone store deformate

### 1) Tenere premuto Canc/Del per 4 secondi svuota il campo

`src/components/VirtualKeyboard.tsx`: `onEnter` di `Focusable` scatta solo al fronte "appena premuto" — non basta a misurare una pressione prolungata. Aggiunto un intervallo a 50ms che legge `InputManager.readPrimary().buttons.has('A')` mentre `key-back` ha il focus (stesso identico principio già usato in App.tsx per "tieni premuto B" nel test controller), unificato con un tracking separato per mouse/touch (`onMouseDown`/`onTouchStart` più `onMouseUp`/`onMouseLeave`/`onTouchEnd`/`onTouchCancel`, dato che `InputManager` non vede affatto puntatore). Riempimento progressivo visivo sul tasto stesso durante l'attesa.

### 2) Cursore visibile e spostabile nel campo di testo

Il più esteso dei quattro: prima non esisteva alcun concetto di posizione — ogni tasto scriveva sempre in fondo alla stringa, Backspace cancellava sempre l'ultimo carattere.

- **`VirtualKeyboard.tsx`**: nuovo stato `cursorPos` (parte dalla fine del valore iniziale, comportamento invariato per chi non lo sposta mai). `insertAtCursor()`/`handleBackspace()` ora operano al punto del cursore, non più sempre a fine stringa. Due nuovi tasti dedicati `key-cursor-left`/`key-cursor-right` (◄►) nella riga della barra spaziatrice (non D-pad sinistra/destra, già impegnato a navigare fra i tasti) — ogni conferma sposta di una posizione, stesso schema "un'azione per pressione" di qualunque altro tasto. `handleSuggestion`/`handlePaste` aggiornati per inserire al cursore invece che sempre in coda (eccetto `insertMode: 'append-space'`, che resta un'aggiunta di coda concettuale per i Launch Arguments). Nuova prop `onCursorChange?: (pos: number) => void` — notifica il chiamante SOLO per disegnare il cursore, stesso principio già usato per `onSuggestionFocus`.
- **`App.tsx`**: nuovo stato `vkCursorPos`, passato a `VirtualKeyboard` via `onCursorChange`. Il riquadro fluttuante che mostra il testo ora disegna un cursore lampeggiante (`animate-pulse`) al punto giusto, splittando il valore in due span attorno alla posizione (clampata sempre entro i limiti della stringa corrente, per sicurezza contro report leggermente in ritardo rispetto a un cambio di campo).
- **Verificato con un test isolato** (node, logica pura estratta e replicata): sequenza spostamento-sinistra → inserimento → backspace → backspace a inizio stringa (no-op atteso) → spostamento oltre i limiti (clamp atteso) — tutti i casi confermati corretti prima della consegna.

### 3) Card Ubisoft Connect sempre "Disconnesso" in Manage Accounts

`src/backend/plugins/ubisoftConnectPlugin.ts`: causa trovata leggendo il codice — il plugin non sovrascriveva mai `isAuthenticated()`, ereditando il default della classe base (`isPublic || authenticated`, entrambi sempre `false` qui, dato che Ubisoft è in NO_LOGIN_STORES e nessun login viene mai chiamato). Fix: sovrascritto `isAuthenticated()` per restituire `isLauncherBootstrapped('ubisoft-connect')` (sharedLauncherManager.ts, già esistente) — stesso principio già usato da `SteamPlugin.isAuthenticated()` (= trovato su disco, non un vero login), ma più preciso di un controllo grezzo sull'esistenza della cartella: verifica che il bootstrap sia stato davvero completato (installer eseguito + primo lancio riuscito), non solo che la cartella esista (creata comunque in anticipo da `getSharedPrefixBasePath`).

### 4) Icone store deformate quando l'account è sincronizzato

`src/App.tsx`, card account in Manage Accounts: causa trovata — il contenitore dell'icona (`w-12 h-12`, `<Gamepad2>` dentro) non aveva `shrink-0`. La label accanto ("Sessione attiva (N sincronizzati, M installati)") è molto più lunga di "Disconnesso": senza `shrink-0`, il flex item con `flex-shrink` di default (1) si restringeva in LARGHEZZA quando lo spazio del contenitore flex si riduceva, mentre l'altezza (governata da `h-12`, non da `flex-shrink` sull'asse riga) restava fissa — un rettangolo schiacciato invece del quadrato voluto. Aggiunto `shrink-0` al contenitore e all'icona stessa.

### Verifica

`tsc --noEmit`: 8 (baseline invariata, diff riga-per-riga confermato — stessi errori, solo spostati di poche righe per le aggiunte sopra). `check-focus-ids.cjs`: 94 id, zero riferimenti rotti (le modifiche a VirtualKeyboard.tsx non sono coperte da questo script, che analizza solo App.tsx per costruzione — verificate a mano la consistenza di `rowSpace` e dei nuovi id).

---

## v1.5.20-dev.6 — 3 richieste utente + tastiera fisica

### 1) Soglia hold-to-clear abbassata da 4 a 3 secondi

`VirtualKeyboard.tsx`: `CLEAR_HOLD_MS` 4000 → 3000, unica modifica.

### 2) Dimensioni tasti riga barra spaziatrice

Frecce cursore (◄►) ora dimensione di UN tasto, lingua/incolla dimensione di DUE, barra spaziatrice resta la più larga. Sostituite le frazioni fisse precedenti (`w-1/5` poi `w-1/6`) con pesi di crescita flex relativi (`flex-[2]`/`flex-1`/`flex-[6]`/`flex-1`/`flex-[2]`, rapporto 2:1:6:1:2) — proporzionati a qualunque larghezza di schermo, nessun valore in pixel da ricalibrare per breakpoint. **Nota — questo approccio si è rivelato insufficiente, vedi v1.5.20-dev.8 più sotto per la correzione definitiva.**

### 3) e 4) Confermate funzionanti dall'utente, nessuna ulteriore modifica.

### 6) Scrittura da tastiera fisica nella Virtual Keyboard

Implementato: premendo un tasto fisico (lettera, cifra, simbolo, Backspace/Canc, frecce sinistra/destra) si scrive/cancella/sposta il cursore come col corrispondente tasto a schermo, che si illumina di conseguenza (nuovo `findOnScreenKeyId()`, case-insensitive per le lettere — bug reale trovato con un test isolato prima della consegna: le lettere sono salvate in un'unica forma canonica maiuscola nel layout, un confronto a case esatto non avrebbe mai trovato corrispondenza digitando in minuscolo, il caso comune).

**Deliberatamente NON gestiti**: Invio e Barra spaziatrice. Motivo verificato nel codice reale: `Focusable` (FocusProvider.tsx) ha già un proprio listener globale che attiva `onEnter()` del tasto ATTUALMENTE a fuoco per un fisico Invio/Spazio (fallback di accessibilità preesistente). Gestirli anche qui avrebbe rischiato un doppio inserimento quando il fuoco a schermo non coincide con "Invio"/"Spazio" (nessuna garanzia sull'ordine fra due listener indipendenti sullo stesso `window`) — lasciarli al solo meccanismo esistente evita quella regressione. I tre esempi espliciti dell'utente (due lettere e Canc) restano comunque coperti senza alcun conflitto: `Focusable` ascolta solo Invio/Spazio, mai altri tasti. **Nota — questa scelta si è rivelata un bug reale per Invio, vedi v1.5.20-dev.8 più sotto per la correzione.**

Verificato anche che i listener globali già esistenti in App.tsx (Escape, Ctrl+F, Alt+Invio, Ctrl+Alt+K, Ctrl+H) non si sovrappongono: tutti richiedono un modificatore (il nuovo listener esce subito su Ctrl/Alt/Meta) o un tasto (Escape) mai intercettato qui.

**Test isolato** (node, logica pura estratta): corrispondenza lettera minuscola/maiuscola, simbolo con shift, carattere assente — tutti i casi confermati corretti dopo il fix case-insensitive.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 94 id, zero riferimenti rotti.

---

## v1.5.20-dev.7 — Tag da metadati sotto il campo di ricerca

Confermato dall'utente: IGDB configurato, e la semantica voluta è quella già in uso lato mouse — filtro genere/categoria in AND col testo digitato (es. "Teen" → 30 titoli → tag "Arcade" → 3 titoli), non una sostituzione del testo. Verificato leggendo `gameManager.getGames()`: i filtri search/genre/category sono già applicati in sequenza sullo stesso risultato (AND reale, non un'alternativa) — nessuna modifica lato server necessaria, il meccanismo esisteva già e funzionava correttamente, mancava solo la UI raggiungibile da controller.

- **`src/components/VirtualKeyboard.tsx`**: nuova prop opzionale `topRowExternalUpId?: string`. Quando fornita, sovrascrive SOLO il vicino "su" della riga suggerimenti (la prima, in cima), che di norma avvolge ciclicamente alla barra spaziatrice (v1.1.79) — rompe il ciclo interno esclusivamente in quel punto per raggiungere qualcosa di esterno. Retrocompatibile al 100%: quando assente (ogni altro campo — Launch Arguments, Custom Env, Executable Path), il comportamento resta invariato.
- **`src/App.tsx`**: nuova sezione di chip genere/categoria, visibile SOLO editando la ricerca (`!activeField`), tra il riquadro fluttuante del testo e la tastiera — stesso identico dato già usato dai chip mouse-only nella barra filtri libreria (`game.genres`/`game.categories`, fino a 8 generi e 5 categorie), stessa azione (`setSelectedGenre`/`setSelectedCategory`, toggle on/off). Il blocco `{showKeyboard && (...)}` è stato trasformato in una IIFE per condividere `searchGenres`/`searchCats`/`topRowExternalUpId` fra la nuova sezione tag e la prop passata a `VirtualKeyboard` più sotto, senza duplicare il calcolo.
- **Navigazione**: ogni riga (generi, categorie) usa `sequentialChain`/`chainAxis="horizontal"` per sinistra/destra, con "giù"/"su" espliciti — semplificati con lo STESSO target per ogni chip della riga (non un mapping proporzionale per colonna come la griglia a tasti fissi della tastiera): genere → categoria (se presente) altrimenti dritto in tastiera; categoria → tastiera. La tastiera stessa risale fino all'ultima riga di tag presente tramite `topRowExternalUpId`.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 96 id (94+2, i nuovi pattern `tag-genre-${i}`/`tag-cat-${i}`), 1 solo riferimento segnalato come "non dichiarato" (`key-sugg-0`) — falso positivo verificato: lo script analizza solo App.tsx, quell'id è dichiarato in VirtualKeyboard.tsx (`QUICK_SUGGESTIONS`, mai vuoto — target sempre valido). Nessun riferimento realmente rotto.

---

## v1.5.20-dev.8 — 3 correzioni dopo il test utente

### Reset dei tag genere/categoria alla chiusura della ricerca

`App.tsx`: il reset di `searchQuery` alla chiusura (Y) viveva già in un `useEffect` dedicato (`if (!showSearch) setSearchQuery('')`, separato da `toggleSearch()`) — i tag genere/categoria introdotti in dev.7 non erano inclusi in quel reset, lasciando il filtro attivo mentre il testo veniva già azzerato. Aggiunto `setSelectedGenre('')`/`setSelectedCategory('')` nello stesso effetto — stessa sorte del testo, entrambi filtri della stessa ricerca.

### Dimensioni tasti riga barra spaziatrice — corretto per davvero

Il rapporto flex relativo di dev.6 (2:1:6:1:2) non restituiva "un tasto"/"due tasti" in senso assoluto — su schermi larghi i pesi si allargano proporzionalmente all'intera riga, non a una dimensione fissa. Sostituito con gli STESSI `max-w` assoluti già usati altrove nel file per key-back/key-enter/key-shift: `max-w-[44px]` per le frecce cursore (un tasto), `max-w-[92px]` per lingua/incolla (due tasti, 44×2+gap) — coerenti con quella convenzione già esistente invece di inventarne una nuova. La barra spaziatrice resta senza `max-w`, unico elemento a consumare lo spazio residuo.

### Invio da tastiera fisica riattivava l'ultimo tasto digitato invece di inviare la ricerca

Causa reale (non ipotizzata): `Focusable` (FocusProvider.tsx) ha un proprio listener — in fase *bubble* — che attiva `onEnter()` del tasto ATTUALMENTE a fuoco su un fisico Invio/Spazio. Poiché ogni carattere digitato fisicamente (v1.5.20-dev.6) sposta il focus visivo sul tasto corrispondente, il tasto "a fuoco" al momento di premere Invio è sempre l'ultima lettera scritta, mai `key-enter` — da qui il doppio tasto invece dell'invio. Rimandato deliberatamente in dev.6 perché l'ordine fra due listener indipendenti in fase bubble sullo stesso `window` non è garantito.

**Risolto per davvero**: il listener della tastiera fisica in `VirtualKeyboard.tsx` è ora registrato in fase **CAPTURE** (`addEventListener('keydown', handler, true)`). Per specifica DOM, un listener in capture su un target viene sempre invocato PRIMA di qualunque listener in bubble sullo stesso target, indipendentemente dall'ordine di registrazione — non un'assunzione fragile come il tentativo scartato in dev.6, ma un comportamento garantito dallo standard. `stopPropagation()` impedisce all'evento di raggiungere la fase bubble, quindi il listener di `Focusable` non si attiva affatto per Invio/Spazio quando la tastiera fisica li gestisce. Fisico Invio ora chiama `onClose()` direttamente (chiude/invia la ricerca); fisico Spazio ora inserisce davvero uno spazio al cursore — entrambi i casi lasciati volutamente scoperti in dev.6 sono ora coperti correttamente con lo stesso meccanismo.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 96 id, stesso singolo falso positivo di sempre (`key-sugg-0`, cross-file). Nessuna modifica di navigazione in questa voce oltre al reset stati.

---

## v1.5.20-dev.9 — Larghezza riga barra spaziatrice allineata a Z/@ del layout italiano

Richiesta: far coincidere l'estremità sinistra di "lingua" e destra di "incolla" con l'estremità sinistra del tasto Z e destra del tasto @ della riga 4 italiana, invece delle dimensioni assolute (44px/94px) libere di dev.8, che riempivano tutto lo spazio residuo con la barra spaziatrice senza alcun rapporto con le righe sopra.

**Calcolo esatto** (stessi valori già in uso in tutto il file: 44px per tasto, 6px per gap): riga 4 italiana ha Shift + 13 tasti (Z,X,C,V,B,N,M,ù,`,`,`.`,`-`,@,apostrofo) = 694px totali. Lo span da Z a @ copre 12 di quei tasti e 11 gap interni = 594px. Verificato che Shift e l'apostrofo (esclusi dallo span) pesano esattamente uguale su entrambi i lati (44px tasto + 6px gap ciascuno) — lo span Z→@ risulta quindi centrato esattamente al centro di riga 4, ed essendo anche la riga barra spaziatrice centrata nello stesso contenitore, basta dargli la STESSA larghezza totale per ereditarne i bordi esatti.

Scomposizione dei 594px fra i 5 elementi: lingua 94px, freccia sinistra 44px, **barra spaziatrice 294px (nuovo tetto esplicito — prima senza limite)**, freccia destra 44px, incolla 94px — somma 570px + 24px di gap (4×6px) = 594px.

Verificato con un piccolo calcolo isolato prima di scrivere il codice, non solo a occhio: simmetria delle esclusioni confermata (50px su entrambi i lati), somma totale confermata uguale allo span.

**Limite intrinseco, dichiarato esplicitamente**: vale in modo esatto solo con il layout italiano attivo — la riga 4 inglese ha un tasto in meno (manca "ù", esclusivo IT), quindi passando a EN i bordi non coincidono più con la stessa precisione. Coerente con la richiesta, che si riferiva esplicitamente al layout italiano.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 96 id, stesso falso positivo di sempre. Nessuna modifica di navigazione, solo classi di larghezza.

---

## v1.5.20-dev.10 — Fase A.1/A.2/A.3: generalizzare l'installazione dei launcher terzi

Prima voce del piano concordato per estendere il supporto oltre Ubisoft Connect (EA App, Battle.net, Rockstar Games Launcher) — deciso esplicitamente CON l'utente di **non** unificare in un plugin unico: ogni launcher resta un proprio `StorePlugin` con le proprie particolarità (card, switch, libreria interna), ma la parte davvero comune a tutti — creazione prefix, ricerca dell'installer — va scritta una volta sola.

### `src/types.ts`

Aggiunto `'Rockstar Games Launcher'` a `StoreType` (EA App era già presente dalla progettazione originale, mai usato).

### `src/backend/plugins/thirdPartyLaunchers.ts`

- Nuovo campo `storeId: StoreType` — collega ogni voce del registro al proprio `StorePlugin.id` (es. `'Ubisoft'` per `ubisoft-connect`), un solo ponte fra i due spazi di id invece di stringhe duplicate sparse in gameManager.ts/downloadManager.ts.
- Nuovo campo `installerFilenameHints: string[]` — pattern (sintassi `find -iname`) per riconoscere l'installer di QUESTO launcher in Downloads, prima hardcoded dentro `findInstallerInDownloads()` (solo `*ubisoft*`/`*uplay*`). Popolato per Ubisoft Connect, vuoto per gli altri tre (da compilare quando affrontati, mai indovinato).
- Nuovo helper `getThirdPartyLauncherByStoreId(storeId)` — l'altro verso del ponte.

### `src/backend/downloadManager.ts`

- **Nuova `resolveDownloadsDir()`** — bug reale corretto, non solo preparazione per il futuro file manager: `homedir()+'Downloads'` scritto alla lettera non trova nulla su un sistema con locale italiano, dove la cartella si chiama `Scaricati`. Ordine di risoluzione verificato: `xdg-user-dir DOWNLOAD` (il comando ufficiale del pacchetto xdg-user-dirs) → lettura diretta di `~/.config/user-dirs.dirs` → `~/Downloads` letterale → `~/Scaricati` letterale come ultima rete di sicurezza. Verificata con un test isolato la regex di estrazione (`XDG_DOWNLOAD_DIR="..."`) su caso italiano, inglese e percorso assoluto personalizzato.
- `findInstallerInDownloads()` generalizzata: il pattern del nome file è ora un parametro (`filenameHints: string[]`), letto da `installerFilenameHints` invece di hardcoded.
- `runUbisoftConnect(task)` rinominata e generalizzata in `runThirdPartyLauncherInstall(task, def)` — legge `def.displayName`/`def.installerUrl`/`def.installerFilenameHints` invece di stringhe letterali "Ubisoft"/`'ubisoft-connect'` sparse nel corpo della funzione. Log prefissato con `[${def.displayName.toUpperCase()}]` invece di `[UBISOFT]` fisso.
- Dispatch in `startTask()`: da `else if (task.store === 'Ubisoft') await this.runUbisoftConnect(task)` a una ricerca generica nel registro (`getThirdPartyLauncherByStoreId(task.store)`) — un nuovo plugin non richiede più toccare questo punto.
- `addTask()`: la risoluzione del prefix (`store === 'Ubisoft' ? getSharedPrefixBasePath('ubisoft-connect') : ...`) generalizzata allo stesso modo.
- `continueInstaller()`/`browseInstaller()`: usano il registro per trovare il launcher del task corrente invece di assumere sempre Ubisoft Connect.
- `browseInstaller()`: titolo del dialogo dinamico (`def.displayName`), `startDir` ora da `resolveDownloadsDir()`, filtro esteso da solo `.exe` a `.exe/.msi/.cab` (richiesta utente, pensata originariamente per il futuro file manager ma applicata qui per coerenza sullo stesso identico caso d'uso).

### `src/backend/plugins/base.ts`

Nuovo metodo `onLauncherProcessClosed(game): Promise<void>` su `StorePlugin`, default no-op. Sposta fuori da gameManager.ts la logica "il processo appena chiuso era l'installer del MIO launcher, ricontrolla il bootstrap" — decisione esplicita con l'utente: gameManager.ts resta il coordinatore generico, ogni plugin gestisce le proprie particolarità.

### `src/backend/plugins/ubisoftConnectPlugin.ts`

Implementato `onLauncherProcessClosed()` — stessa identica logica prima hardcoded in gameManager.ts (ricerca del vero eseguibile via `findInstalledLauncherExe()`, registrazione del bootstrap). Nuova funzione interna `pluginLog()` che replica `GameManager.addLog()` (scrittura su file + persistenza DB per il Debug Console UI) — i plugin non hanno un riferimento a `GameManager`, ma il logging doveva restare visibile nell'interfaccia esattamente come prima, non degradare a solo-file.

### `src/backend/gameManager.ts`

- Il blocco hardcoded (`if (game.store === 'Ubisoft' && game.id === UBISOFT_CONNECT_GAME_ID && ...)`) sostituito da `this.plugins.find(p => p.id === game.store)?.onLauncherProcessClosed(game)` — generico per qualunque plugin futuro.
- Il callback di `startGameExitPolling()` (un `setInterval`) reso `async` per poter fare `await` sulla chiamata al plugin — il `try/catch` strutturale esistente (v0.99.38) resta la stessa rete di sicurezza, un errore nel plugin non fa crashare il daemon.
- Il secondo punto hardcoded (messaggio di log "installer individuato, clicca di nuovo la card") generalizzato con lo stesso ponte store→launcher.
- Import ripuliti: `UBISOFT_CONNECT_GAME_ID`, `resolveSharedPrefixExecutionPath`, `markLauncherBootstrapped`, `findInstalledLauncherExe`, `getThirdPartyLauncherDefinition` non più usati direttamente qui (spostati nel plugin).

### Verifica

`tsc --noEmit`: 8 (baseline invariata, zero errori nuovi introdotti dalla generalizzazione). `check-focus-ids.cjs`: 96 id, stesso falso positivo di sempre (nessuna modifica a App.tsx in questa voce). Test isolato: la regex di estrazione `XDG_DOWNLOAD_DIR` verificata su 4 casi (italiano, inglese, percorso assoluto personalizzato, riga assente) prima di considerarla affidabile.

**Non ancora testato su hardware reale**: Ubisoft Connect dovrebbe continuare a funzionare esattamente come prima (stessa logica, solo riorganizzata) — da riconfermare con un lancio reale prima di considerare questa generalizzazione definitiva, coerente con la prudenza già seguita per ogni voce precedente.

---

## v1.5.20-dev.11 — Fix bug reale: dimensione GOG non trovata per The Witcher/The Witcher 3

Segnalato dall'utente durante il ritest di Ubisoft Connect: la libreria GOG non trova il "peso" in GB solo per The Witcher e The Witcher 3 Wild Hunt (GOTY/Complete Edition), mentre funziona per altri titoli (es. The Last Blade). Log fornito dall'utente: output completamente vuoto, con "Getting product data 2 / 2" invece di "1 / 1" nel log di progresso.

### Causa reale (verificata, non ipotizzata)

`--game` di `lgogdownloader` è documentato ufficialmente come un **filtro regex** (sintassi Perl), non una corrispondenza esatta sull'id del gioco — confermato anche da una issue reale sul repository ufficiale ([Sude-/lgogdownloader#213](https://github.com/Sude-/lgogdownloader/issues/213)): *"--game army_men scarica tutti e 5 i titoli il cui nome contiene la stringa 'army_men' invece di uno solo"*, esattamente lo stesso pattern di bug. Uno slug come `the_witcher`, passato senza ancoraggio, combacia ANCHE come sottostringa con altri giochi posseduti che lo contengono — `the_witcher_3_wild_hunt_...` inizia proprio con `the_witcher`. `lgogdownloader` interroga quindi l'API per più prodotti insieme invece di uno solo (da qui "2 / 2"), un'operazione più lenta che con più prodotti/edizioni può avvicinarsi o superare il timeout di 20s esistente — stdout resta vuoto perché i dati veri vengono stampati solo a fine ciclo, mai raggiunto, mentre stderr accumula i soli messaggi di progresso.

### `src/backend/plugins/gogPlugin.ts` — `getPredictedInstallSizeBytes()`

- Il regex passato a `--game` è ora ancorato a inizio/fine stringa (`^${slug}$` invece di `slug` nudo) — combacia SOLO con lo slug esatto, indipendentemente da altri giochi/DLC/edizioni che lo contengono come sottostringa.
- Timeout alzato da 20s a 30s come margine di sicurezza aggiuntivo — il fix sopra risolve la causa reale, ma un singolo prodotto con molta storia di versioni/lingue (proprio il caso Witcher) può comunque restare più lento della media.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 96 id, stesso falso positivo di sempre (nessuna modifica a App.tsx). **Non ancora testato su hardware reale** — da confermare che The Witcher e The Witcher 3 mostrino ora correttamente la dimensione prevista.

---

## v1.5.20-dev.12 — Fase A.4: file manager nativo controller-navigabile

Sostituisce zenity/kdialog quando `inputDevice === 'controller'` (quei dialog nativi non rispondono affatto al gamepad — un vero buco nell'esperienza "solo controller"). Punto di innesto già pronto da tempo: `filePicker.ts` era stato scritto fin dall'inizio con questo momento in mente ("oggi delega a un dialog nativo... domani potrà delegare a un file browser interno alla Dashboard, controller-navigabile").

### `src/backend/fileManager.ts` (nuovo)

- `listDirectory(dirPath, extensions?)` — elenca una cartella: cartelle sempre incluse (serve poterci entrare), file filtrati per estensione solo quando richiesto. File/cartelle nascosti (nome che inizia con `.`) esclusi. Ordinamento: cartelle prima, poi alfabetico case-insensitive. Ogni voce porta `sizeBytes`/`mtimeMs` (null per le cartelle — richiederebbe una scansione ricorsiva costosa e non necessaria per navigare). **Data di ultima modifica (mtime), non di creazione** — deciso esplicitamente con l'utente: su Linux la data di creazione in senso stretto spesso non è disponibile in modo affidabile a seconda del filesystem, mtime è sempre presente.
- `resolveRemovableMediaRoot()` — quick-link "Supporti rimovibili": verificato (Arch Wiki, non assunto) che udisks2 monta di default in `/run/media/$USER/`; prova anche `/media/$USER/` come fallback per altri setup. null se nessuno dei due esiste (il quick-link si disabilita, non un errore).
- Verificato con un test isolato (node/tsx, cartella finta): ordinamento cartelle-prima-poi-file, esclusione file nascosti, filtro per estensione, errore su cartella inesistente — tutti i casi confermati corretti prima della consegna.

### `src/backend/downloadManager.ts`

- `resolveDownloadsDir()` esportata (era già stata scritta in dev.11, riusata qui per il quick-link "Downloads" — nessuna logica duplicata fra le due funzionalità).
- Nuovo metodo pubblico `confirmInstallerPath(gameId, filePath)` — stessa validazione/completamento di `browseInstaller()`, ma senza invocare alcun dialog nativo: il path arriva già risolto dal client, che lo ha ottenuto navigando nell'overlay in-app.

### `server.ts`

Tre nuovi endpoint: `POST /api/downloads/installer-select` (conferma il file scelto nell'overlay in-app), `GET /api/filesystem/list` (elenco cartella, `extensions` opzionale separato da virgola), `GET /api/filesystem/quick-links` (risolve home/downloads/supporti rimovibili una volta sola).

### `src/App.tsx`

- Nuovo overlay (z-[95], sopra il pannello Download che oggi è l'unico chiamante) — lista verticale (non griglia, a differenza della libreria Avatar: nomi di lunghezza variabile si prestano meglio a righe che a riquadri), con dimensione (KB/MB/GB auto-convertiti) e data allineati a destra per ogni file.
- Header con quick-link (Risali di un livello, Home, Downloads, Supporti rimovibili — disabilitato/in grigio se non disponibile) e switch on/off del filtro estensioni, che riusa lo stesso campo `filter` già esistente in `filePicker.ts` — nessun meccanismo nuovo da inventare.
- Navigazione: stessa convenzione della libreria Avatar (nessun `neighbors` esplicito, scoring geometrico automatico — sufficiente per una struttura semplice come questa).
- Il pulsante "Sfoglia" nel pannello Download ora apre questo overlay quando `inputDevice === 'controller'`, il dialog nativo altrimenti — nessun cambiamento per chi usa mouse/tastiera.
- Il tasto B/Indietro chiude l'overlay per primo se aperto (priorità sopra il pannello Download sottostante, che altrimenti si chiuderebbe insieme o al posto suo).
- Attenzione tecnica: `loadFileBrowserDir` riceve SEMPRE `extensions`/`filterOn` come argomenti espliciti, mai letti dallo stato al proprio interno — evita un bug di closure superata quando la funzione viene richiamata subito dopo aver appena cambiato quello stesso stato nello stesso gestore (es. alternando il filtro: `setState` è asincrono, una lettura dallo stato vedrebbe ancora il valore vecchio).
- Traduzioni: nuova sezione `fileBrowser` in `dashboard.json` (it/en).

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id (96+7, i nuovi `fb-*`), stesso singolo falso positivo di sempre (`key-sugg-0`, cross-file), zero riferimenti nuovi rotti. Test isolato di `listDirectory()` e del formattatore dimensione, entrambi confermati corretti (incluso un test con la dimensione reale di un installer già vista nei log di una sessione precedente).

**Non ancora testato su hardware reale.**

---

## v1.5.20-dev.13 — Investigazione: Watch Dogs 2 via Epic/legendary fallisce subito ("exited with code 1")

Segnalato dall'utente: tentando di installare Watch Dogs 2 (Ubisoft, posseduto su Epic) con `requiresLauncher=ubisoft-connect` e Proton-Experimental come runner, `legendary` fallisce dopo pochi secondi con `exited with code 1`, nessun altro dettaglio nel log.

### Causa reale (non un bug di X-Launcher)

Confermato con un caso reale identico su GitHub (Heroic Games Launcher #2432, **stesso gioco, stesso nome interno Epic "Angelonia"** — corrispondenza esatta col log dell'utente): Watch Dogs 2 su Epic non ha file di gioco scaricabili affatto — solo un flag *"This game requires installation via Uplay and does not ship executable game files"*. `legendary install` fallisce per design su questo titolo specifico, indipendentemente da prefix/runner/configurazione — il gioco vive interamente dentro Ubisoft Connect, Epic funge solo da rivenditore della licenza. Il modello attuale di `requiresLauncher` (Epic scarica i file, il launcher condiviso serve solo per farli girare) non si applica a questa categoria di titoli Ubisoft-su-Epic.

**Sblocco manuale**: `legendary activate --uplay Angelonia` recupera il codice di attivazione — il gioco va poi installato direttamente da Ubisoft Connect con quel codice, bypassando il flusso Epic per questo titolo.

### Bug reale trovato investigando e corretto — `src/backend/downloadManager.ts`

`spawnWithProgress()` (usata da legendary/lgogdownloader/nile) leggeva stdout/stderr **solo** per alimentare il parser di avanzamento — un fallimento (`exit != 0`) produceva solo `"legendary exited with code 1"`, scartando in silenzio il messaggio d'errore reale (che in questo caso avrebbe già rivelato la causa sopra). Aggiunto un anello circolare delle ultime 40 righe di output, scritto nel log **solo se il processo fallisce** (nessun impatto sui download riusciti, log non gonfiato).

### Verifica

`tsc --noEmit`: 8 (baseline invariata). Nessuna modifica a App.tsx in questa voce.

**Miglioramento futuro possibile, non implementato ora**: rilevare in anticipo questa categoria di titoli (legendary espone il flag "requires Uplay/does not ship executable files" prima di tentare l'install) e mostrare un messaggio chiaro invece di lasciare che l'installazione fallisca — da valutare se e quando si presenta di nuovo questo caso.

---

## v1.5.20-dev.14 — Riconciliazione requiresLauncher: notifica, rilevamento installazione, avvio automatico

Implementato il disegno discusso con l'utente per il caso Watch Dogs 2/Epic (v1.5.20-dev.13): tre parti distinte, tutte estensioni di meccanismi già esistenti, decise esplicitamente per evitare sia un plugin unico sia una doppia card nella collezione totale.

### Parte 1 — Riconoscimento del fallimento definitivo + notifica

- **`types.ts`/`db.ts`**: nuovo campo `Game.storeInstallUnavailable` (colonna `store_install_unavailable`, migrazione ALTER TABLE, stessa convenzione di `requires_launcher`). Gestito a parte nel colMap di `updateGameConfig` (booleano JS → 0/1 esplicito, better-sqlite3 rifiuta booleani diretti).
- **`base.ts`**: nuovo metodo `StorePlugin.detectUnrecoverableInstallFailure(recentOutput): boolean`, default `false` — ogni plugin riconosce la propria frase di fallimento definitivo, nessuna logica centrale specifica di un singolo store.
- **`epicPlugin.ts`**: implementato cercando la frase esatta di legendary (`"does not ship executable game files"`, verificata su un'issue reale Heroic #2432).
- **`downloadManager.ts`**: l'output reale catturato in dev.13 ora viaggia insieme all'oggetto Error (`err.recentOutput`) invece di restare solo loggato — `errorCallbacks`/`onError` esteso per portarlo a valle.
- **`gameManager.ts`**: nuovo metodo pubblico `getPluginForStore(storeId)` — `plugins` resta privato, solo un lookup mirato esposto.
- **`server.ts`**: `onError` ora interroga il plugin proprietario; se riconosce il fallimento come definitivo, marca `storeInstallUnavailable` e personalizza il messaggio suggerendo il launcher condiviso già impostato su quel gioco (se presente).

### Parte 2 — Rilevamento automatico dell'installazione (senza scraping né doppioni)

- **`sharedLauncherManager.ts`**: nuova `findGameExeInSharedPrefix(launcherId, gameTitle)` — cerca l'eseguibile di UN gioco specifico dentro il prefix condiviso già noto (`resolveSharedPrefixExecutionPath`, esistente), per nome di cartella normalizzato (minuscolo, solo alfanumerico) contro il titolo — mai il database interno del launcher, mai un'intera libreria enumerata. **Bug reale trovato con un test isolato prima della consegna**: la prima versione cercava solo un livello sotto Program Files, ma Ubisoft Connect installa i giochi DUE livelli più in profondità (`.../Ubisoft/Games/<titolo>`) — corretto ad hoc, riverificato.
- **`gameManager.ts`**: `syncExternalInstallStates()` esteso con un nuovo ramo generico — per ogni gioco con `requiresLauncher` non ancora installato (di QUALUNQUE store, non solo Epic), cerca l'eseguibile nel prefix condiviso e aggiorna la riga ESISTENTE (mai una nuova) se trovato. Questa scelta di design — riconciliare invece di scrappare l'intera libreria del launcher — è quella che evita la doppia card nella collezione totale di cui discutevamo: non viene mai creata una seconda riga.

### Parte 3 — Avvio automatico del launcher condiviso al lancio del gioco

Bug reale trovato discutendo il caso: `requiresLauncher` non veniva mai letto al momento del LANCIO effettivo, solo all'installazione (per condividere il prefix) — nessun gioco avviava mai automaticamente Ubisoft Connect/EA App insieme a sé, anche se il titolo lo richiede per DRM/funzioni online.

- **`sharedLauncherManager.ts`**: nuova `isSharedLauncherRunning(launcherId)` — stesso pattern `pgrep -f` già usato altrove nel progetto per verificare processi in corso, sul nome file dell'eseguibile del launcher (già noto dal bootstrap).
- **`gameManager.ts`**: `launchGame()` ora, se `game.requiresLauncher` è impostato e il launcher non risulta già in esecuzione, lo avvia (fire-and-forget — un fallimento qui non blocca il lancio del gioco stesso, solo un avviso in log).

### Verifica

`tsc --noEmit`: 8 (baseline invariata — un errore intermedio introdotto per una stringa di stato sbagliata, `'Installed'` invece di `'Ready to Launch'`, trovato e corretto durante la verifica). `check-focus-ids.cjs`: 103 id, stesso falso positivo di sempre (nessuna modifica a App.tsx). Test isolato di `findGameExeInSharedPrefix` (node, cartelle finte replicando la struttura reale Ubisoft Connect): trova l'eseguibile corretto ignorando il disinstallatore, `null` per un titolo assente e per un titolo vuoto — bug dei 2 livelli scoperto e corretto proprio da questo test prima della consegna.

**Non ancora testato su hardware reale.**

---

## v1.5.20-dev.15 — Fix bug reale: la riconciliazione requiresLauncher non si attivava mai

Segnalato dall'utente dopo il primo test completo (installazione riuscita da Ubisoft Connect, ma card Epic mai aggiornata): "shared launcher" risultava impostato correttamente, l'installazione era reale e funzionante, ma la card Epic continuava a proporre solo il tentativo di installazione fallito.

### Causa reale (non un problema di matching cartelle)

`syncExternalInstallStates()` — la funzione con dentro la riconciliazione aggiunta in dev.14 — veniva chiamata **una sola volta, dentro `init()`, all'avvio del demone**. Il refresh periodico esistente (`refreshLibrary()`, ogni 5 minuti via `startPeriodicRefresh()`) non la richiamava affatto. Risultato: senza un riavvio esplicito del demone dopo aver installato il gioco dal launcher condiviso, la riconciliazione non aveva mai alcuna occasione di girare — esattamente il sintomo riportato.

### `src/backend/gameManager.ts`

Aggiunta `await this.syncExternalInstallStates();` dentro `refreshLibrary()` stessa (dopo la persistenza dei titoli, prima dell'arricchimento metadati in background) — ora gira ad ogni refresh, sia periodico (ogni 5 minuti) sia al boot, sia su richiesta manuale (`POST /api/library/refresh`, già esistente) — nessun riavvio del demone più necessario perché la riconciliazione si attivi.

### Verifica

`tsc --noEmit`: 8 (baseline invariata).

### Per il prossimo test dell'utente

Per verificare subito senza aspettare 5 minuti, dopo aver applicato il fix e riavviato il demone una volta:
```bash
curl -X POST http://localhost:3000/api/library/refresh
```
Prima di considerare il fix completo, va anche confermato che l'euristica di corrispondenza cartella↔titolo (dev.14) trovi davvero l'eseguibile — non ancora verificato contro la struttura reale creata da Ubisoft Connect sul sistema dell'utente (solo su una struttura di test locale).

---

## v1.5.20-dev.16 — Fix bug reale: euristica cartella↔titolo riscritta con `find` ricorsivo

Segnalato dall'utente dopo aver applicato dev.15 (riavvio del demone incluso): la card Epic continuava a non aggiornarsi. Percorso reale fornito dall'utente:
```
.../shared-launchers/ubisoft-connect/prefix/pfx/drive_c/Program Files (x86)/Ubisoft/Ubisoft Game Launcher/games/WATCH_DOGS2/bin/WatchDogs2.exe
```

### Causa reale

`findGameExeInSharedPrefix()` (dev.14) camminava livello per livello a mano in JS, assumendo una profondità fissa — verificata SOLO su una struttura di test locale costruita da Claude, mai su dati reali. Il percorso vero mostra che Ubisoft Connect installa i giochi **4 livelli** sotto `Program Files (x86)` (`Ubisoft` → `Ubisoft Game Launcher` → `games` → `WATCH_DOGS2`), non 2 come assunto — la cartella `games` è un contenitore generico dentro la cartella del launcher stesso, non un percorso separato a fianco. Qualunque profondità fissa scelta a mano rischiava di sbagliare di nuovo alla prossima struttura diversa incontrata.

### `src/backend/sharedLauncherManager.ts`

Riscritta per usare `find "<base>" -maxdepth 6 -type d` — enumerazione ricorsiva reale invece di una camminata a mano livello per livello, gestisce qualunque profondità entro il limite senza bisogno di indovinarla. Il confronto fuzzy per nome (normalizzato: minuscolo, solo alfanumerico) resta in JS, necessario dato che un pattern shell `-iname` non gestirebbe bene differenze come "Watch Dogs 2" vs "WATCH_DOGS2". Rimossi `readdirSync`/`statSync`, non più utilizzati dopo la riscrittura.

### Verifica

Test isolato (node) **ricreando esattamente la struttura di cartelle fornita dall'utente** (non più una struttura inventata): trova correttamente `WatchDogs2.exe` ignorando `Uninstall.exe`, `null` per un titolo assente e per un titolo vuoto. `tsc --noEmit`: 8 (baseline invariata).

**Ancora da confermare dall'utente**: che la card Epic si aggiorni davvero dopo un refresh (`curl -X POST http://localhost:3000/api/library/refresh` per un test immediato) e che Ubisoft Connect si avvii al lancio.

---

## v1.5.20-dev.17 — Due bug reali nel lancio del gioco dopo la riconciliazione

Test dell'utente: la riconciliazione (dev.16) funziona — la card Epic trova ed espone il gioco. Ma al lancio: il gioco si chiude subito e Wine apre il proprio file manager sulla scrivania; lanciando manualmente il collegamento Ubisoft parte in systray con una finestra nera; solo scegliendo il gioco dal menu contestuale della tray di Ubisoft Connect funziona regolarmente.

### Bug 1 — `launchSharedLauncher()` non passava mai `umuRun`

Riproduceva esattamente la finestra nera già risolta in Step 19d (container Steam Linux Runtime mancante): il fix umu-run era arrivato solo per il lancio manuale dalla card di Ubisoft Connect (`ProtonRunner.launch()` diretto), mai per questa funzione — scritta prima ancora che umu-run esistesse, mai aggiornata quando è arrivato.

`src/backend/sharedLauncherManager.ts`: ora legge `db.getCompatProfile(`${launcherId}-launcher`)?.umuRun` (convenzione id già esistente, `UBISOFT_CONNECT_GAME_ID = 'ubisoft-connect-launcher'`) e lo passa a `runner.launch()` — stesso switch già impostato e verificato funzionante dall'utente sulla card di Ubisoft Connect stessa.

### Bug 2 — nessuna attesa fra l'avvio del launcher condiviso e il lancio del gioco

Il gioco partiva fire-and-forget, subito dopo aver chiesto l'avvio del launcher condiviso, senza aspettare login/sincronizzazione libreria. Molti giochi Ubisoft verificano la presenza/API del launcher al proprio avvio — lanciati troppo presto falliscono silenziosamente, sintomo compatibile con "il gioco si chiude, Wine apre il file manager come fallback di crash".

`src/backend/gameManager.ts` (`launchGame()`): ora attende il completamento di `launchSharedLauncher()` e, se riuscito, un margine fisso (8s) prima di procedere col gioco. **Non verificato su hardware reale quanto sia sufficiente** — un punto di partenza, non una garanzia (nessuna API per sapere quando il launcher è "davvero pronto").

### Domanda dell'utente: `uplay://launch/<id>` invece del lancio diretto?

Concettualmente la strada più corretta (come `steam://rungameid/`), ma due limiti reali segnalati all'utente prima di intraprenderla: serve l'id numerico interno di Ubisoft (non disponibile senza il lavoro di reverse-engineering rimandato alla Fase C), e una discussione precedente aveva già annotato che i protocolli diretti `uplay://` risultavano bloccarsi su "initializing" nei test — non verificato se nelle stesse condizioni rotte dei due bug sopra o come limite indipendente. Raccomandato di riverificare prima con questi due fix.

### Verifica

`tsc --noEmit`: 8 (baseline invariata).

---

## v1.5.20-dev.18 — Bug reale CONFERMATO CON LOG: il controllo verb bloccava il lancio per 16 minuti

Segnalato dall'utente ("il check verbs deve essere snellito") e poi CONFERMATO con log reali durante il debug del caso Watch Dogs 2: Ubisoft Connect sembrava non avviarsi più affatto, anche disattivando EAC.

### Causa reale (letta nei timestamp del log, non ipotizzata)

Due controlli winetricks — reinstallazione verb dichiarati (v1.1.117-dev.1) e rilevamento verb installati a mano (`winetricks list-installed`, v1.1.118/119-dev.1) — vivevano dentro `launchGame()` **PRIMA** del lancio vero e proprio, **sincroni e bloccanti**. Il primo ha un timeout di **300 secondi (5 minuti) per singolo verb**. Il log reale dell'utente mostra `dotnet48`, `d3dcompiler_43` e `d3dcompiler_47` colpire quel timeout pieno **in sequenza** — 16 minuti totali prima che `umu-run` venisse anche solo avviato. Lo script di debug esterno (`launch-debug.sh`, che salta questo controllo) ha confermato che `umu-run` fa invece progressi reali (avvio del container steamrt4, generazione locale) una volta rimosso questo collo di bottiglia — l'utente aveva ragionevolmente concluso "non parte nulla" molto prima che i 16 minuti trascorressero.

### `src/backend/gameManager.ts`

Entrambi i controlli estratti in un nuovo metodo privato `reconcileWinetricksVerbs(id, game, profile)` — stessa identica logica di prima (v1.1.117/118/119-dev.1), invariata riga per riga. La chiamata è stata spostata da PRIMA a **DOPO** il lancio riuscito (`runner.launch()`/`launchEpicViaLegendary()`), come **fire-and-forget**: il gioco/launcher parte subito, la riconciliazione dei verb gira in background senza bloccare l'utente — un suo fallimento non interferisce mai con una sessione già avviata con successo.

### Verifica

`tsc --noEmit`: 8 (baseline invariata, un errore intermedio — `CompatibilityProfile` non importato nel nuovo metodo — trovato e corretto durante la verifica). `check-focus-ids.cjs`: 103 id, stesso falso positivo di sempre (nessuna modifica a App.tsx).

**Da confermare dall'utente**: che Ubisoft Connect si avvii ora immediatamente, senza il collo di bottiglia dei 16 minuti.

**Nota separata, non ancora affrontata**: il log ha anche rivelato `PROTON_EAC_RUNTIME` impostato sul lancio di Ubisoft Connect stesso (che non ne ha bisogno) — quasi certamente uno switch attivato per errore sulla card sbagliata invece che su quella di Watch Dogs 2, ancora da confermare/correggere lato utente prima di considerare chiusa anche questa pista.

---

## v1.5.20-dev.19 — Bug reale CONFERMATO CON DIAGNOSTICA DIRETTA: dev.18 spostava il blocco, non lo eliminava

Segnalato dall'utente dopo dev.18: Ubisoft Connect ora si avvia velocemente (la finestra compare, confermata in `wmctrl -l`), ma la Dashboard non viene più minimizzata automaticamente e resta in primo piano.

### Causa reale (dimostrata, non ipotizzata)

La minimizzazione è gestita da `tray.py` (script Python separato, non toccato da questa sessione), che fa polling di `GET /api/system/game-running` ogni 2 secondi e nasconde la finestra al primo `running: true`. Diagnostica dell'utente: `wmctrl -l` mostra la finestra col titolo esatto atteso (non un problema di `tray.py`/`wmctrl`), `tray.py` è in esecuzione — ma `curl http://localhost:3000/api/system/game-running` restava **appeso**, senza mai rispondere.

Quell'endpoint fa solo un controllo istantaneo in memoria — se resta bloccato, l'unica spiegazione è che l'**intero processo Node è bloccato** a fare qualcos'altro. Il fix di dev.18 aveva spostato la *posizione* del controllo verb (da prima a dopo il lancio) ma non la sua *natura*: restava `execSync`, che blocca l'intero event loop a thread singolo di Node — indipendentemente da dove si trova nel codice o se la Promise che lo racchiude viene attesa oppure no. Il demone restava sordo a QUALUNQUE richiesta HTTP, incluso il polling di `tray.py`, per tutta la durata della riconciliazione verb in background.

### `src/backend/gameManager.ts`

`reconcileWinetricksVerbs()`: tutte le chiamate `execSync` convertite a `execFileAsync` (`promisify(execFile)`, stesso pattern già usato altrove in questo file e in `downloadManager.ts`) — libera davvero il thread principale invece di limitarsi a spostare quando il blocco avviene.

### Verifica

`tsc --noEmit`: 8 (baseline invariata, stessi errori). **Test isolato** (node, prima del commit): dimostrato con `execFileAsync` che un altro lavoro asincrono (timer da 500ms) completa regolarmente MENTRE un comando lento (`sleep 2`) è ancora in corso — tempo totale ~2011ms, non 2500ms, prova diretta di esecuzione parallela. Controprova con `execSync`: il timer da 500ms non riesce nemmeno a eseguire il proprio callback fino al termine del comando bloccante (2007ms) — conferma netta del meccanismo esatto che causava il problema.

**Da confermare dall'utente**: che la Dashboard torni a minimizzarsi automaticamente al lancio.

---

## v1.5.20-dev.20 — Bug reale CONFERMATO: riconciliazione verb in parallelo corrompeva la sessione di gioco

Segnalato dall'utente dopo dev.19: Ubisoft Connect si comporta correttamente, ma LEGO Indiana Jones: The Original Adventures (Amazon Games via nile) non parte più — il log mostra il lancio riuscito (PID assegnato, "trattato come lancio riuscito"), la riconciliazione verb che gira regolarmente (vcrun2022/dxvk/vkd3d/corefonts/d3dcompiler/d3d9 tutti OK), ma il gioco non resta in esecuzione.

### Causa reale (dedotta dalla sequenza esatta nel log, non ipotizzata)

dev.18 aveva spostato la riconciliazione verb per girare **dopo** il lancio, come fire-and-forget, per risolvere il blocco di 16 minuti. Ma alcuni di quei verb (`dxvk`, `vkd3d`, `d3dcompiler_*`) **sostituiscono file DLL dentro la prefix Wine** — la STESSA prefix che il gioco appena lanciato sta usando in quel momento. Sostituire DLL mentre un processo le ha già caricate in memoria è una causa nota di instabilità (la stessa ragione per cui ogni guida DXVK raccomanda di chiudere il gioco prima di reinstallarlo). Per Ubisoft Connect il problema è passato inosservato — evidentemente più tollerante o con verb che non toccano DLL in uso attivo — ma per LEGO Indiana Jones la riconciliazione concorrente ha impedito al gioco di restare in esecuzione.

### `src/backend/gameManager.ts`

La chiamata a `reconcileWinetricksVerbs()` è tornata a essere **sequenziale, PRIMA del lancio** (mai più in parallelo con un gioco già avviato) — ma ora `await`-ata invece che fire-and-forget. Il fix reale di dev.19 (conversione a `execFileAsync` invece di `execSync`) resta valido e necessario: il problema originale (demone/Dashboard sordi ad ogni richiesta, incluso il polling di `tray.py`) non era la POSIZIONE della chiamata ma la sua natura bloccante — il demone resta reattivo per tutta la riconciliazione anche stando PRIMA del lancio, la Dashboard continua a rispondere a `/api/system/game-running` (che ora corretamente riporta `running: false` finché il gioco non è davvero partito, non un hang) mentre il gioco parte solo a prefix stabile.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id, stesso falso positivo di sempre (nessuna modifica a App.tsx).

**Da confermare dall'utente**: che LEGO Indiana Jones torni a funzionare, e che Ubisoft Connect continui a comportarsi correttamente con la sequenza ripristinata.

---

## v1.5.20-dev.21 — Lancio "leggero" nella sessione condivisa già attiva

Implementata l'architettura discussa e **verificata a mano dall'utente prima di scrivere codice** — non un'idea teorica: con Ubisoft Connect già aperto (avviato con lo switch Umu-launcher attivo), l'utente ha lanciato manualmente `WatchDogs2.exe` con il `wine` incluso nella stessa build Proton puntato sulla stessa prefix (`WINEPREFIX=... wine "WatchDogs2.exe"`, bypassando del tutto un secondo `proton run`/`umu-run`) — il gioco è partito correttamente, Ubisoft Connect si è ridotto a icona riconoscendolo come proprio, ed è tornato in primo piano alla chiusura del gioco. L'intera catena di autorizzazione ha funzionato, confermando che Wine mantiene davvero un solo `wineserver` per `WINEPREFIX` (documentato) e che un secondo processo puntato alla stessa prefix si aggancia alla sessione già viva.

Esplorato ma scartato per ora: lancio nativo tramite `winebrowser.exe "uplay://launch/<id>/0"` (id reale verificato dall'utente su [Haoose/UPLAY_GAME_ID](https://github.com/Haoose/UPLAY_GAME_ID) e confermato dalla cartella `data/2688/` su disco) — bloccato da un errore di disallineamento versione wine/wineserver (`931/957`) mai risolto nonostante diagnosi approfondita (esclusi: processi residui, wineserver di sistema al posto di quello bundlato, disallineamento di date fra i file della build, percorsi `~/.steam/steam` divergenti). Causa più probabile: la natura "in aggiornamento continuo" del ramo Proton - Experimental. Non blocca l'implementazione — l'approccio verificato funzionante non dipende in alcun modo da questa pista, rimandata a un'eventuale ripresa futura.

### `src/backend/runners/implementations.ts`

`expandHome()` esportata (era privata) — riusata da `gameManager.ts` per il nuovo percorso di lancio.

### `src/backend/sharedLauncherManager.ts`

Nuova `launchGameInSharedPrefix(launcherId, exePath, args, cwd)` — risolve la STESSA build Proton che il launcher condiviso sta già usando (mai una build diversa: è esattamente la causa del mismatch di versione appena descritto) tramite `resolveProtonBin()` già esistente, poi il binario `wine` al suo interno (`files/bin/wine` per build moderne, `dist/bin/wine` per build più vecchie — entrambe le convenzioni gestite, verificato con test isolato). Invoca `wine <exe>` direttamente sulla prefix condivisa (`resolveSharedPrefixExecutionPath`, già esistente), bypassando `umu-run`/lo script di Proton per intero.

**Limite noto e dichiarato esplicitamente nel codice, non nascosto**: bypassando lo script di Proton, `PROTON_EAC_RUNTIME`/`PROTON_BATTLEYE_RUNTIME` (lette solo da quello script) non hanno alcun effetto, e il processo non gira dentro il container Steam Linux Runtime.

### `src/backend/gameManager.ts` (`launchGame()`)

Nuova condizione `useSharedPrefixLightLaunch`, generica per QUALUNQUE gioco con `requiresLauncher` (non specifica di Ubisoft Connect) — tutte necessarie: `requiresLauncher` impostato, `executablePath` già risolto, **nessun EAC/BattlEye richiesto per quel gioco** (altrimenti resta sul lancio pieno, che sa gestire l'anticheat), e il launcher condiviso **davvero** in esecuzione in quel momento (non solo "tentato" — il blocco già esistente prima di `db.recordGameLaunch` lo avvia se serve). Quando tutte le condizioni sono vere, sostituisce la normale chiamata a `runner.launch()`/`launchEpicViaLegendary()` con `launchGameInSharedPrefix()`.

### Verifica

`tsc --noEmit`: 8 (baseline invariata, un errore intermedio — tipo di ritorno di `launchGameInSharedPrefix` senza `logPath`, causava un conflitto di unione con l'altro ramo — trovato e corretto durante la verifica). `check-focus-ids.cjs`: 103 id, stesso falso positivo di sempre (nessuna modifica a App.tsx). Test isolato: risoluzione del binario `wine` verificata su entrambe le convenzioni di cartella (`files/bin`/`dist/bin`) e sul caso di build inesistente.

**Non ancora testato su hardware reale in questa forma automatizzata** (il percorso manuale equivalente è già stato verificato dall'utente).

---

## v1.5.20-dev.22 — Scelta esplicita dell'utente alla chiusura di un gioco col launcher condiviso

Discusso a fondo con l'utente: alla chiusura di un gioco, il launcher condiviso (es. Ubisoft Connect) resta sempre in esecuzione — nessun codice lo termina mai automaticamente (verificato, non solo osservato). Deciso di **non** costruire una pulizia automatica ("termina tutto prima di ogni lancio" avrebbe vanificato il vantaggio del lancio leggero appena costruito in dev.21, oltre a essere inutile: prefix diverse hanno wineserver indipendenti, non confliggono mai fra loro). La filosofia scelta: la Dashboard non decide da sola su una scelta con un impatto reale (RAM/CPU occupate vs. sessione pronta per il prossimo gioco) — la propone esplicitamente all'utente.

### `src/backend/notificationEngine.ts`

Nuovo evento `shared-launcher-idle` — emesso solo se il launcher condiviso risulta ANCORA in esecuzione dopo la chiusura confermata di un gioco che lo richiedeva. Notifica con due scelte, riusando il sistema `primaryAction`/`secondaryAction` già esistente (stesso pattern di ogni altra notifica azionabile nel progetto, nessun meccanismo nuovo): **"Chiudi ora"** (`handler: 'close_shared_launcher'`) e **"Tieni aperto"** (comportamento di default già esistente, nessuna azione necessaria). Testo it/en inline, stesso schema `lang === 'en' ? ... : ...` già in uso in ogni altro caso di questo file.

### `src/backend/gameManager.ts`

Nell'handler di chiusura gioco (`startGameExitPolling`), subito dopo `onLauncherProcessClosed`: se `game.requiresLauncher` è impostato e `isSharedLauncherRunning()` conferma che è ancora vivo, emette la notifica sopra.

### `src/backend/sharedLauncherManager.ts`

Nuova `closeSharedLauncher(launcherId)` — usa `wineserver -k` (comando ufficiale, documentato, lo stesso già identificato durante il debug di `winebrowser` in questa sessione) sulla **stessa build Proton** che il launcher sta usando (mai un `wineserver` di sistema diverso — stessa causa di mismatch di versione già diagnosticata). Termina l'intera sessione Wine per quella prefix con SIGINT poi SIGKILL, ripulendo anche eventuali processi figli residui (aggiornatori, servizi in background), non solo il processo principale.

### `server.ts` / `src/App.tsx`

Nuovo endpoint `POST /api/shared-launchers/:id/close`. Nuovo ramo nel dispatch delle azioni di notifica per `close_shared_launcher` — chiama l'endpoint e chiude la notifica con `dismissNotification()` (non lo stato `'applied'` usato dalle altre azioni: non ha senso un "ha funzionato?" di riscontro per un'azione fire-and-forget come questa).

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id, stesso falso positivo di sempre — nessuna modifica strutturale alla navigazione, solo logica dentro `onEnter` esistenti.

**Non ancora testato su hardware reale.**

---

## v1.5.20-dev.23 — Eredità runner/prefix per giochi col launcher condiviso + aggiornamento script diagnostico

Discusso a fondo con l'utente: cosa succede se il launcher condiviso resta attivo con una build Proton (es. Proton 10) e un gioco che lo richiede viene lanciato con una build diversa (es. Experimental/GE)? Verificato nel codice: il percorso leggero (dev.21) era già corretto per costruzione — legge il runner dal launcher condiviso, mai da quello del gioco. Il **percorso di riserva** (lancio pieno, usato quando il leggero non scatta) invece leggeva ancora `game.runner`/`game.prefixPath` — sbagliati per questa categoria di gioco, dato che l'installazione tramite lo store d'origine non completa mai (vedi saga Watch Dogs 2) e quei due campi restano vuoti o stantii. Se il gioco avesse una build diversa configurata, il percorso di riserva avrebbe tentato un secondo `proton run`/`umu-run` con una build diversa sulla stessa prefix — lo stesso identico mismatch di versione (`931/957`) già diagnosticato dal vivo durante il debug di `winebrowser`.

### `src/backend/gameManager.ts`

In `launchGame()`, prima della risoluzione del runner: se `game.requiresLauncher` è impostato, sia il runner sia il prefix vengono ora **sempre** ereditati dalla riga del launcher condiviso (`db.getGameById('\${launcherId}-launcher')`), mai da `game.runner`/`game.prefixPath` — vale per entrambi i percorsi di lancio, non solo quello leggero. Log esplicito quando avviene questa sostituzione (trasparenza, mai un'eredità silenziosa non spiegata). `reconcileWinetricksVerbs()` esteso con due nuovi parametri (`runnerId`, `prefixPath`) invece di leggere `game.runner`/`game.prefixPath` internamente — stesso principio, un gioco con `requiresLauncher` deve riconciliare i verb sulla prefix condivisa corretta, non su una propria isolata mai esistita. La riconciliazione automatica (`syncExternalInstallStates`) ora scrive anche `prefixPath` sul DB, non solo `executablePath` — dato coerente per chiunque altro lo legga in futuro, anche se il lancio non dipende più da questo campo per funzionare.

### Verifica

`tsc --noEmit`: 8 (baseline invariata, un errore intermedio — tipo `string | undefined` vs `string | null` sul nuovo parametro — trovato e corretto durante la verifica). `check-focus-ids.cjs`: 103 id, stesso falso positivo di sempre (nessuna modifica a App.tsx).

### `launch-debug.sh` — nuovo `--mode shared` (script esterno, non versionato, non parte del progetto)

Aggiunta la terza modalità richiesta dall'utente per testare fuori dalla Dashboard il meccanismo leggero/pieno appena corretto: `--mode shared` (richiede il nuovo `--launcher-exe-hint`) rileva se il launcher condiviso risulta già in esecuzione (stesso meccanismo di `isSharedLauncherRunning()`, `pgrep -f` sul nome dell'eseguibile) — se sì, lancia con `wine` incluso nella build `--runner` direttamente sulla prefix condivisa (nessun `proton run`/`umu-run`); se no, ripiega sulla stessa identica sequenza di `--mode umu`. Riepilogo pre-lancio esteso per mostrare sia la modalità richiesta sia quella effettivamente scelta.

**Bug reale trovato testando lo script stesso, corretto prima della consegna**: `pgrep -f` sul nome del launcher trovava **sempre** una corrispondenza, anche a launcher spento — perché `--launcher-exe-hint` viene passato come argomento allo script stesso, la cui riga di comando contiene quindi letteralmente il testo cercato (`pgrep -f` confronta la riga di comando intera). Confermato con un test isolato: un caso con il launcher genuinamente assente (verificato con un `pgrep` indipendente) risultava comunque "già in esecuzione" senza il fix. Corretto escludendo esplicitamente il proprio PID (`$$`) dai risultati. **Non è un bug del codice reale della Dashboard** — `isSharedLauncherRunning()` gira dentro il processo del demone Node, la cui riga di comando non contiene mai il nome del launcher cercato, quindi non soffre di questo problema — un artefatto specifico di come lo script diagnostico passa i propri parametri.

Verificato con un secondo test isolato, dopo il fix: caso "launcher attivo" (processo finto reale, confermato da un `pgrep` indipendente) → lancio leggero corretto; caso "launcher assente" (stesso, confermato assente) → ripiego su `umu-run` corretto; `--mode direct` originale non toccato dalla modifica, riverificato per esclusione di regressioni.

---

## v1.5.20-dev.24 — Bug reale CONFERMATO DALL'UTENTE: mismatch del metodo di sincronizzazione nel lancio leggero

Test dell'utente con `--mode shared` dopo dev.23: con Ubisoft Connect già attivo in systray, il lancio leggero di Watch Dogs 2 restava bloccato in silenzio (nessuna finestra, nessun errore, il processo semplicemente non progrediva). Impostando manualmente `WINEFSYNC=1` prima di invocare lo script, il gioco partiva correttamente.

### Causa reale

Quando Ubisoft Connect parte tramite il percorso pieno (`umu-run`/Proton), lo script di Proton **rileva da solo** il supporto fsync del kernel e lo attiva internamente (imposta `WINEFSYNC=1`) prima di invocare `wine` — il `wineserver` nasce quindi già con fsync attivo. Il lancio leggero (dev.21) invoca `wine` nudo, bypassando per design quello script — senza impostare esplicitamente questa variabile, il nuovo processo tenta di agganciarsi al wineserver già attivo con un metodo di sincronizzazione diverso da quello con cui è nato. A differenza del mismatch di versione (`931/957`, un errore esplicito già diagnosticato in una sessione precedente), questo si manifesta come un blocco silenzioso — stessa causa di fondo (due processi sulla stessa prefix devono combaciare in tutto, non solo nella build Proton), manifestazione diversa.

### `src/backend/sharedLauncherManager.ts`

`launchGameInSharedPrefix()`: aggiunta `WINEFSYNC: '1'` esplicita nell'ambiente passato al processo `wine`. Commento esteso aggiornato per includere questo limite accanto a quelli già noti (bypass di PROTON_EAC_RUNTIME/BATTLEYE_RUNTIME e del container SLR).

### `launch-debug.sh` (script esterno, non versionato, non parte del progetto)

Stessa correzione nel branch `light`: `export WINEFSYNC=1`. Riepilogo pre-lancio esteso per mostrarla esplicitamente quando applicata. Verificato con test isolato (binario `wine` finto che stampa le proprie variabili d'ambiente) che la variabile arriva davvero al processo, non solo al riepilogo testuale.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). Test isolato sullo script: confermato che `WINEFSYNC=1` viene ricevuto dal processo `wine` invocato nel percorso leggero.

**Limite dichiarato**: assume supporto fsync del kernel — praticamente universale sui kernel Linux moderni (verificato funzionante sul sistema reale dell'utente), non garantito su un kernel molto datato dove Proton potrebbe aver scelto un metodo diverso (esync o server-side) — in quel caso raro andrebbe rilevato dinamicamente invece di assunto, non ancora affrontato.

**Da confermare dall'utente**: che il lancio leggero funzioni ora regolarmente anche nella Dashboard vera (non solo nello script diagnostico) con questo fix.

---

## v1.5.20-dev.25 — Bug reale CONFERMATO DALL'UTENTE: riconciliazione verb disturbava il launcher già attivo

Test dell'utente dopo dev.24: dalla Dashboard, Watch Dogs 2 parte e gira correttamente con Ubisoft Connect già aperto (lancio leggero confermato funzionante) — ma alla chiusura del gioco, la finestra di Ubisoft Connect torna in primo piano **completamente nera**, seguita da un errore "rundll32" e, rispondendo No, dall'apertura del file manager di Wine. Lo stesso identico scenario riprodotto con lo script diagnostico **non presenta mai** questo problema.

### Causa reale

`reconcileWinetricksVerbs()` gira incondizionatamente prima di ogni lancio, indipendentemente dallo store o da `requiresLauncher`. Prima di dev.23, per un gioco come Watch Dogs 2 il suo `prefixPath` restava vuoto/sbagliato — quella riconciliazione era di fatto un no-op per questa categoria di gioco. Dev.23 ha corretto `effectivePrefixPath` a risolversi sempre sulla prefix condivisa vera — ma questo significa che ora, se il launcher condiviso è **già in esecuzione** al momento del lancio (esattamente lo scenario testato: un secondo gioco Ubisoft lanciato con Ubisoft Connect ancora aperto), la riconciliazione interroga davvero quella prefix **mentre il launcher la sta attivamente usando**. Il secondo blocco della riconciliazione (`winetricks list-installed`) gira sempre quando `prefixPath` è valorizzato, indipendentemente dai verb dichiarati sul gioco stesso — e può disturbare un processo GUI già attivo sulla stessa prefix. Stessa identica classe di problema di dev.20 (operazioni winetricks concorrenti a un processo già attivo sulla stessa prefix Wine), qui con un "già attivo" diverso: non un lancio precedente dello stesso gioco, ma il launcher condiviso stesso. Lo script diagnostico non lo riproduce mai perché non fa **alcuna** riconciliazione verb — da qui la differenza di comportamento osservata dall'utente.

### `src/backend/gameManager.ts`

In `launchGame()`: quando `game.requiresLauncher` è impostato, `reconcileWinetricksVerbs()` viene ora **saltata del tutto**, con un log esplicito del motivo. La riconciliazione della prefix condivisa resta comunque coperta correttamente: avviene già, sequenziale e sicura, nel momento in cui è il launcher condiviso **stesso** a essere lanciato dalla propria card — un gioco dipendente non deve né può rifarla in sicurezza sulla sessione di qualcun altro.

### Verifica

`tsc --noEmit`: 8 (baseline invariata).

**Da confermare dall'utente**: che l'intera cascata di sintomi (finestra nera, errore rundll32, file manager di Wine) sparisca del tutto con questo fix — sono tutti presumibilmente conseguenze a valle della stessa causa, non bug separati, ma resta da confermare sul sistema reale.

---

## v1.5.20-dev.26 — Bug reale CONFERMATO CON LOG: launchSharedLauncher() usava un runner congelato al bootstrap

Il fix di dev.25 non ha risolto — segnalato dall'utente con log alla mano, stavolta inequivocabile (non una nuova ipotesi da verificare): con Ubisoft Connect NON ancora in esecuzione, avviando Watch Dogs 2 dalla sua card, il log mostra:

```
[PROTON] (umu-run) /usr/bin/umu-run .../windows/explorer.exe
[PROTON-ENV] ... PROTONPATH=/home/daniele/.local/share/Steam/compatibilitytools.d/GE-Proton11-1 ...
```

Due problemi diretti, non sintomi a valle: il launcher condiviso viene avviato con **GE-Proton11-1**, mentre Watch Dogs 2 (poco dopo, correttamente) usa "Proton 10.0" — e l'eseguibile lanciato è **`windows/explorer.exe`**, non `UbisoftConnect.exe`.

### Causa reale

`launchSharedLauncher()` (la funzione che avvia il launcher condiviso quando scatta automaticamente per un gioco dipendente) leggeva il runner da `state.runner` — un valore scritto **una sola volta**, al momento del bootstrap iniziale, nella tabella `shared_launchers`. Il Runner Bridge che l'utente vede/modifica sulla card di Ubisoft Connect scrive invece su `games.runner` — un campo completamente diverso. L'utente aveva cambiato il runner di Ubisoft Connect da GE-Proton11-1 (bootstrap originale) a Proton 10.0 tramite l'overlay in una sessione precedente — quella modifica aggiorna solo `games.runner`, mai la copia congelata in `shared_launchers`, usata **solo** da questa funzione. Risultato: GE-Proton11-1, mai più usato con questa prefix da allora (ormai abituata a Proton 10.0), veniva rilanciato — `windows/explorer.exe` è il comportamento di ripiego di Proton quando qualcosa non torna nella risoluzione dell'eseguibile.

Questo è esattamente lo stesso principio già applicato in **dev.23** al gioco dipendente (che eredita il runner dalla riga `games` del launcher, mai da un valore statico) — era rimasto da applicare anche al lancio del launcher **stesso**. `closeSharedLauncher()` (dev.22) risultava già corretto fin dall'inizio, verificato per esclusione.

### `src/backend/sharedLauncherManager.ts`

`launchSharedLauncher()`: il runner viene ora letto da `db.getGameById('\${launcherId}-launcher')?.runner` — la stessa, sola fonte di verità già usata ovunque altro nel codice — con `state.runner` (il valore congelato al bootstrap) come ripiego solo se la riga `games` non ha un runner impostato. Log esplicito quando i due valori divergono, per trasparenza.

### Verifica

`tsc --noEmit`: 8 (baseline invariata).

**Da confermare dall'utente**: che Watch Dogs 2 parta ora correttamente anche a freddo (Ubisoft Connect non ancora avviato), con il launcher condiviso lanciato con la build corretta e la propria interfaccia visibile invece di `explorer.exe`.

---

## v1.5.20-dev.27 — Causa vera trovata (query DB diretta), eliminata la duplicazione, 2 fix collaterali richiesti dall'utente

Il fix di dev.26 non bastava — l'utente ha interrogato direttamente il database invece di continuare a ipotizzare, trovando la causa reale in un colpo solo.

### Causa reale, confermata con query diretta

```
launcher_id      | launcher_exe          | bootstrapped_at          | runner
ubisoft-connect  | windows/explorer.exe  | 2026-07-29T17:54:09.834Z | GE-Proton11-1
```

`launcher_exe` era sbagliato **fin dal bootstrap originale** (29 luglio) — mai un problema introdotto in questa sessione. Nessuno se n'era accorto perché la funzione che *legge* questo campo per lanciare automaticamente il launcher (`launchSharedLauncher()`, arrivata solo con dev.14) non esisteva ancora: l'utente ha sempre avviato Ubisoft Connect a mano dalla sua card, che usa `games.executablePath` — un campo diverso, sempre corretto perché mantenuto aggiornato dalla Dashboard ad ogni lancio riuscito. Stessa causa profonda di dev.26 (due tabelle per lo stesso concetto, che driftano), ma ancora più estesa: **anche** `isSharedLauncherRunning()` usava lo stesso campo corrotto per il rilevamento (`pgrep -f` sul nome base di `launcher_exe`) — cercava un processo chiamato `explorer.exe`, mai il vero launcher, da settimane. Questo spiega buona parte dell'incoerenza osservata fra script diagnostico (che riceve `--launcher-exe-hint` corretto a mano) e Dashboard in tutta questa indagine.

### `src/backend/sharedLauncherManager.ts` — eliminata la duplicazione, non solo corretto il sintomo

Su richiesta esplicita dell'utente di "distinguere runner e shared_runner": `games.executablePath`/`games.runner` (riga `${launcherId}-launcher`) diventano l'**unica** fonte di verità, ovunque:
- `isSharedLauncherRunning()`: rilevamento ora basato su `games.executablePath`, mai più su `state.launcherExe`
- `launchSharedLauncher()`: runner ed eseguibile letti **solo** da `games`, `state.launcherExe`/`state.runner` non più letti affatto (restano nello schema per compatibilità, semplicemente ignorati)

La riga corrotta nel DB resta lì ma diventa innocua — nessun codice la legge più per queste due funzioni.

### `src/App.tsx` — Runner Bridge: nasconde, non solo blocca (richiesta esplicita dell'utente)

Il blocco precedente permetteva comunque di scegliere qualunque build Proton diversa da quella del launcher condiviso (vietava solo Wine) — l'overlay mostrava una scelta che il lancio reale ignorava silenziosamente (dev.23), fonte diretta di confusione. Ora, quando un gioco eredita il runner da un launcher condiviso: le build alternative vengono **nascoste** (non solo disattivate), resta visibile solo quella realmente in uso (letta dalla riga `games` del launcher, stessa fonte di verità del backend), con una didascalia esplicita ("Ereditato dal launcher condiviso — modificalo dalla sua card", nuova chiave `gameOptions:runnerInheritedFromLauncher`, it+en). Ripiego difensivo se la riga del launcher non è ancora nota: mostra l'elenco completo bloccato invece di una sezione vuota.

### Bug reale trovato nel sistema di notifiche (richiesta esplicita dell'utente)

Segnalato: i pulsanti della notifica "tieni aperto / chiudi ora" (dev.22) sparivano dopo pochi secondi, impedendo la scelta. Causa: **due implementazioni duplicate** dell'auto-scomparsa notifiche (`useNotifications.ts` per quelle create lato client, l'handler EventSource in `App.tsx` per quelle dal backend) auto-chiudevano qualunque notifica `type:'info'` dopo 6 secondi — la mia notifica di dev.22 è `type:'info'`, quindi ci cadeva dentro senza che l'utente potesse decidere. Fix in entrambe le implementazioni: l'auto-scomparsa ora si applica solo se la notifica **non ha alcuna azione** (`primaryAction`/`secondaryAction`/`tertiaryAction` tutte assenti) — un avviso genuinamente transitorio (cambio modalità, passaggio a desktop) continua a sparire da solo; qualunque notifica con una scelta da compiere resta finché l'utente non decide davvero.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id, stesso falso positivo di sempre — nessun nuovo riferimento rotto nonostante il cambio del numero di tile effettivamente renderizzati nel Runner Bridge quando bloccato.

**Non ancora corretto in questa voce**: la riga corrotta nel DB resta fisicamente presente (innocua ma non ripulita) — non necessario dato che nessun codice la legge più, ma segnalato per trasparenza.

**Da confermare dall'utente**: che Watch Dogs 2 parta ora correttamente a freddo, che l'overlay di Watch Dogs 2 mostri solo Proton 10.0 come opzione, e che la notifica di chiusura del launcher condiviso resti visibile finché non si sceglie esplicitamente.

---

## v1.5.20-dev.28 — Ereditarietà Umu-launcher + filtro "Launcher condiviso" sulla propria card

**CONFERMATO DALL'UTENTE**: la catena Watch Dogs 2 → Ubisoft Connect funziona correttamente end-to-end. Confermato anche empiricamente che nel percorso leggero lo switch Umu-launcher sul gioco è ininfluente (eredita il container già attivo dal launcher condiviso) — ma questo non dice nulla sul percorso di riserva, dove il campo viene letto davvero e una combinazione disallineata resterebbe un caso mai verificato (due container Steam Linux Runtime potenzialmente distinti sulla stessa prefix).

Discusse 3 opzioni con l'utente per Umu-launcher (eredita/lascia invariato/oscura come il Runner Bridge) — scelta l'opzione 3, stessa filosofia già applicata al Runner Bridge in dev.27: mai offrire una scelta indipendente che il lancio reale potrebbe ignorare o, in un caso limite, generare una combinazione non testata.

### `server.ts`

`GET /api/shared-launchers` esteso con un nuovo campo `umuRun` per voce (letto da `db.getCompatProfile('\${def.id}-launcher')`) — necessario al frontend per mostrare lo stato REALE del launcher condiviso quando un gioco lo eredita, non un valore indovinato.

### `src/App.tsx` — due correzioni distinte nella stessa griglia Compatibility Layer

**1) Umu-launcher bloccato quando ereditato** (richiesta esplicita): quando `requiresLauncher` è impostato, il tile mostra lo stato reale del launcher condiviso (letto dal nuovo campo sopra) e diventa non selezionabile — riusa lo stesso guardiano `!available` già in uso per ogni altro tile oscurato (EAC/BattlEye quando il runner è incompatibile), nessun meccanismo nuovo.

**2) "Launcher condiviso" nascosto sulla card del launcher stesso** (la "finezza" richiesta): un launcher non può dipendere da sé stesso — il tile ora scompare del tutto (non solo disattivato) quando il gioco selezionato **è** uno dei launcher condivisi noti, riconosciuto per convenzione d'id (`\${launcherId}-launcher`, la stessa già usata ovunque nel backend — nessun flag nuovo, solo un confronto con l'elenco `sharedLaunchers` già caricato). Stesso principio "griglia si adatta al numero reale di tile visibili" già verificato in dev.27 per il Runner Bridge — la formula di ancoraggio dell'ultima riga si ricalcola da sola sulla lunghezza dell'array filtrato, nessun aggiustamento manuale necessario.

### Verifica

`tsc --noEmit`: 8 (baseline invariata — la struttura ad IIFE necessaria per calcolare i due filtri prima della griglia ha richiesto particolare attenzione alla chiusura delle parentesi, verificata con la compilazione reale invece che a conteggio manuale). `check-focus-ids.cjs`: 103 id, stesso falso positivo di sempre, nessun nuovo riferimento rotto nonostante il numero di tile renderizzati cambi in entrambi gli scenari nuovi (card del launcher: 6 tile invece di 7; gioco dipendente: Umu-launcher bloccato invece che libero).

**Non ancora testato su hardware reale.**

---
### Nota — script diagnostico esterno generalizzato (non versionato, non parte del progetto)

`launch-ubisoft-connect-debug.sh` riscritto e rinominato `launch-debug.sh`: non più specifico per Ubisoft Connect, ora strumento generico per qualunque gioco/launcher Proton in difficoltà. Aggiunta la modalità `--mode umu` (via `umu-run`, il fix di questa stessa voce) accanto a `--mode direct` (comportamento precedente, bypassa il container SLR) per un confronto A/B diretto sullo stesso prefix/eseguibile. Tutti i percorsi prima hardcoded (runner, prefix, eseguibile, DLL override) sono ora parametri da riga di comando (`--runner`, `--prefix`, `--gameid`, `--dll-override`, `--env`, `--gamemode`, `--game-logs`, ecc. — vedi `--help`). Log di Proton/umu-run e l'intera sessione (stdout/stderr del processo incluso) finiscono in un'unica cartella con timestamp, elencata per intero a fine esecuzione invece di assumere un nome file preciso (la naming convention interna di `steam-<appid>.log` non è stata verificata in ogni dettaglio). Testato con binari finti (`proton`/`umu-run`/`gamemoderun` mock) per entrambe le modalità, percorsi con spazi, variabili extra ed elenco log del gioco — nessun test su hardware reale ancora.

## Step 2 — Steam Plugin reale + regole di sviluppo

### Novità
- **Steam Plugin**: lettura reale dei file `.acf` da `~/.local/share/Steam/steamapps/`
- **Librerie multiple**: supporto dischi aggiuntivi via `libraryfolders.vdf`
- **Lancio nativo**: `steam://rungameid/<appId>` — Proton gestito da Steam
- **Steam Big Picture**: route `POST /api/steam/bigpicture`
- **File watcher**: aggiornamento automatico libreria quando Steam installa un gioco
- **Route debug**: `GET /api/debug` — stato completo del daemon
- **Route refresh**: `POST /api/library/refresh` — refresh manuale libreria
- **Log su file**: daemon scrive su `~/.local/share/x-launcher/daemon.log`
- **`build.sh`**: script unico per compilare e avviare
- **`patches/`**: cartella per patch incrementali (rimossa in una sessione successiva, non più in uso — vedi fondo pagina)
- Tutti i plugin mock (GOG, Epic, Amazon, Battle.net, Classic) svuotati — restituiscono `[]`

### Fix rispetto a Step 1
- Rimossi mock hardcoded da tutti i plugin
- `NODE_ENV` non più nel `.env` (causava warning Vite)
- Express 5: wildcard route corretta (`/{*path}`)

### Variabili .env aggiunte
- `STEAM_API_KEY` — opzionale, per ore di gioco
- `STEAM_ID` — opzionale, rilevato automaticamente

---

## Step 1 — Persistenza SQLite

- `better-sqlite3` aggiunto
- `src/backend/db.ts` con schema completo
- Tabelle: `games`, `compat_profiles`, `runners`, `downloads`, `logs`
- Token OAuth su `tokens.json` (permessi 600)
- Download ripristinati al boot
- Route: `PATCH /api/games/:id/config`, `PATCH /api/games/:id/compat`

---

## Step 0 — Bug fix pre-roadmap

- Fix `app.get('*')` → `app.get('/{*path}')` (Express 5)
- Fix `NODE_ENV` fallback a `production`
- Fix race condition costruttore async GameManager
- Fix runner hardcoded → rilevati da CompatibilityManager
- Fix `setNotifyCallback` → sistema multi-listener
- MetadataManager: dati deterministici, cache in memoria

---

## Step 3 — Classic Console ROM scan [MILESTONE]

### Novità
- **ClassicPlugin**: scansione `~/Roms/` con sottocartelle per sistema
- **ID ROM stabile**: hash numerico deterministico — nessuna collisione SQLite
- **Watcher ROM**: ricorsivo, debounce 2s, aggiornamento automatico libreria
- **RetroArch core picker**: overlay adattivo mostra i core installati per le ROM
- **Route** `GET /api/retroarch/cores`, `PATCH /api/games/:id/retroarch`
- **Fix SSE**: `selectedGameId` preservato durante refresh libreria
- **Fix polling**: selezione non resettata se il gioco è ancora in lista

### Validato su hardware reale
- Steam: 5 titoli rilevati e lanciabili
- Classic Console: 4 ROM (SNES, NES, Mega Drive, Master System)
- RetroArch lancia con core corretto per ogni sistema
- Mapping cartelle flessibile (MS = Master System)

### Sistemi supportati
SNES, SFC, NES, GBA, GB, GBC, MD, Genesis, SMS, PSX, PSP, N64, DOS, ScummVM

---

## Step 4 — UI configurazione per-game completa

**patch-step4-001** — `src/App.tsx`

### Problemi risolti

**Compat toggles non reattivi** (bug pre-esistente):
I toggle DXVK/VKD3D/FSR/GameMode/MangoHud leggevano lo stato
direttamente da `selectedGame`, che veniva aggiornato solo al
successivo refresh SSE (~5s dopo il click). Il toggle appariva
fermo finché il backend non notificava la libreria aggiornata.

Soluzione: stato locale `localCompatProfile` + ottimistic UI.
Il toggle scatta immediatamente, il PATCH al backend avviene in
background. In caso di errore di rete il toggle rimane nello
stato "ottimista" ma non causa crash.

**Runner bridge non reattivo** (bug pre-esistente):
Stesso problema — il badge runner nell'header dell'overlay
non si aggiornava fino al SSE. Ora aggiorna `setGames`
immediatamente.

### Nuove funzionalità

**Pannello "Game Config"** (sostituisce il singolo campo Executable Path):
- `Executable Path` — percorso assoluto all'eseguibile (tutti i runner)
- `Steam App ID` — se presente, ProtonRunner usa `steam://rungameid/`
- `DOSBox Config (.conf)` — visibile solo se runner = DOSBox
- `ScummVM Game ID` — visibile solo se runner = ScummVM (es. `monkey`, `loom`)
- `Libretro Core Path (manuale)` — visibile solo se runner = RetroArch,
  fallback testuale rispetto al core picker grafico

Tutti i campi sono controlled input (non `defaultValue`) e aggiornano:
1. Lo stato locale React immediatamente (ottimistic)
2. Il DB via PATCH al backend al `onBlur`
3. `games` via `setGames` per riflettere il valore nel dettaglio gioco

**Sezione "Custom Env Variables"**:
Editor textarea `KEY=VALUE` per riga. Al `onBlur` viene parsato
in `Record<string,string>` e persistito nel campo `custom_env`
di `compat_profiles` nel DB. Il backend lo passa al runner al lancio
tramite `runner.launch(game, { env: profile.customEnv })`.

Caricamento automatico all'apertura dell'overlay: useEffect su
`[showGameOptions, selectedGame?.id]` carica sia il profilo compat
che la config del gioco dal backend, popolando tutti i campi.

---

## Step 5 (ex Step 6) — Plugin GOG Galaxy

**patch-step5-001** — `src/backend/plugins/gogPlugin.ts`, `X-Launcher-Roadmap.md`

### Strategia
Il plugin GOG usa tre sorgenti in cascata, dalla più accurata alla meno:

1. **lgogdownloader** (`lgogdownloader --list-details --output-file=- --json`)
   Restituisce l'intera libreria GOG in JSON, inclusi titoli non installati.
   Richiede login preventivo (`lgogdownloader --login`).
   Installazione: `yay -S lgogdownloader` (AUR).

2. **Heroic Games Launcher** (`~/.config/heroic/gog_store/installed.json`)
   Supporta sia installazione nativa che Flatpak. Solo giochi installati.
   Se Heroic è presente ma lgogdownloader no, questa è la sorgente attiva.

3. **Directory ~/GOG Games** (scan `GameInfo.json` o file `gameinfo`)
   Fallback per installazioni manuali GOG. Rileva titolo ed eseguibile
   dal manifest locale.

La prima sorgente che restituisce risultati vince; directory è usata
solo come integrazione se le prime due non trovano nulla.

### Cover art
CDN pubblica GOG (`images.gog-statics.com`) — nessuna API key.
Funziona solo con ID numerici GOG reali (da lgogdownloader).
Heroic e directory usano il placeholder Unsplash fino allo Step 9
(MetadataManager con SteamGridDB).

### Lancio
I giochi GOG usano `Wine-Lutris` come runner di default.
Se l'eseguibile è rilevato dal manifest, `executablePath` è già popolato.
Se no, l'utente può impostarlo dall'overlay (Step 4).

### Log di avviso
Se 0 titoli trovati, il daemon logga un hint specifico:
- lgogdownloader presente ma 0 giochi → suggerisce `lgogdownloader --login`
- lgogdownloader assente → suggerisce installazione da AUR o Heroic

### Roadmap
Step 5 (GOG) e Step 6 (Epic) invertiti rispetto al piano originale.

---

## Step 6 — Plugin Epic Games via `legendary`

**step6-001** — `src/backend/plugins/epicPlugin.ts`

### Struttura JSON legendary (da test reale con 100+ giochi)

`legendary list --json` restituisce un array di oggetti con:
- `app_name` — ID usato da `legendary launch <app_name>`
- `app_title` — titolo leggibile
- `metadata.keyImages` — cover art dalla CDN Epic:
  - `DieselGameBoxTall` (1200x1600) → `coverImage`
  - `DieselGameBox` (2560x1440) → `previewImage`
- `metadata.categories` — usato per filtrare DLC e contenuti extra
- `asset_infos.Windows` — presenza = gioco disponibile su Windows

### Filtri applicati

L'output di legendary include DLC, artbook, soundtrack, contenuti digitali
e "audience tokens". Il plugin filtra con `isMainGame()`:
- Mantiene solo voci con `asset_infos.Windows` presente
- Esclude voci con categorie solo `addons`, `digitalextras`, `audience`, `developer`
- Deduplicazione per `app_name`

### Lancio parallelo

`legendary list` e `legendary list-installed` vengono eseguiti in parallelo
con `Promise.all()` per ridurre il tempo di attesa totale.

### Cover art reali

A differenza del plugin GOG, Epic espone URL pubblici delle cover
direttamente nel JSON — nessuna API key necessaria.

### Rilevamento installati

`legendary list-installed --json` (timeout 15s) restituisce i giochi installati.
Il plugin sovrappone questa info alla libreria: `isInstalled: true` e
`status: 'Ready to Launch'` per i titoli presenti su disco.

### Note

- legendary 0.20.34 su Python 3.14: `legendary auth --code <code>` funziona
  (il flusso `legendary auth` interattivo è buggato su Python 3.14).
- Log di legendary su stderr separati dallo stdout JSON — nessun parsing spurio.

---

## Step 7 — Compatibilità Wine runners (compat profiles)

- **CompatibilityManager**: rilevamento runner disponibili (Wine-Lutris, Proton-Experimental, GE-Proton)
- **Profili compat per-game**: DXVK, VKD3D, FSR, GameMode, MangoHud, custom env vars
- **Overlay compat**: toggle reattivi con ottimistic UI
- **Runner bridge**: cambio runner per-game persistito su DB

---

## Step 8 — Download Manager + pipeline installazione

### Architettura
- **DownloadManager**: coda di download con stati `queued → downloading → creating_prefix → installing_deps → installing_game → completed`
- **SSE live progress**: barra di avanzamento e fase corrente in tempo reale nella dashboard
- **Persistenza download**: i download interrotti vengono ripristinati al riavvio del daemon
- **Pipeline Epic** (via `legendary`):
  1. `legendary install <app_name>` — download + verifica
  2. `wine wineboot --init` — creazione prefix isolata
  3. `winetricks --unattended <verb>` per ogni dipendenza
  4. `completato` → `executablePath` auto-rilevato, `prefixPath` salvata su DB
- **Pipeline GOG** (via `lgogdownloader` + `innoextract`):
  1. `lgogdownloader --download --platform w --game <slug>` — scarica installer Windows
  2. `wine wineboot --init` — creazione prefix isolata
  3. `winetricks` per dipendenze
  4. `innoextract --gog` — estrazione diretta senza Wine (niente GUI, niente botva2)
  5. `completato` → `executablePath` auto-rilevato, `prefixPath` salvata su DB

### Fix critici risolti in questo step
- **`store` mancante** in `addTask()` → crash `path.join(undefined)` risolto
- **`COALESCE` bug DB** → `updateGameConfig` riscritta con SET dinamico: aggiorna solo le colonne presenti nel payload
- **`prefix_path` colonna** aggiunta al DB con migration automatica per DB esistenti
- **`prefixPath` persistita** al completamento install e passata al runner al lancio
- **`expandHome()`** estesa per espandere `$HOME` e `$VAR` oltre a `~`
- **Wine runner** usa `cwd` della directory exe e passa `game.prefixPath` esplicita
- **`--non-interactive` / `--no-bar`** rimossi (non supportati da questa versione lgogdownloader)
- **Ricerca installer ricorsiva**: `find` su sottocartelle invece di `readdirSync` root
- **`botva2.dll`** bypassata usando `innoextract` invece di Wine per l'estrazione GOG
- **Sync stato installato GOG**: `gogPlugin.ts` e `syncExternalInstallStates()` ora rilevano giochi installati da `~/Games/GOG/<slug>/files/`

### Dipendenze di sistema richieste
- `lgogdownloader` — `yay -S lgogdownloader`
- `innoextract` — `sudo pacman -S innoextract`
- `legendary` — già richiesto per Epic
- `wine` / `winetricks` — già richiesti

### Winetricks default
Default ridotti a `vcrun2022, dxvk, vkd3d, corefonts` (rimosso `dotnet48` — lento, raramente necessario).
`dotnet48` disponibile come opzione nell'overlay con label "lento · solo se richiesto".

### Overlay miglioramenti
- **Dipendenze Wine persistite per-game**: le spunte winetricks vengono salvate sul profilo compat del gioco ad ogni toggle
- **Runner version**: versione del runner corrente visibile nell'header overlay e nella sezione Runner Bridge
- **Executable Path**: badge verde se configurato, badge giallo "⚠ richiesto per avviare" se mancante su giochi Epic/GOG installati
- **Auto-popolamento exe**: al completamento install l'exe rilevato viene mostrato nel campo senza sovrascrivere modifiche manuali
- **Log lancio dettagliato**: runner name, versione, exe path, e output errore inclusi nel log dashboard

---

## Step 9 — MetadataManager (SteamGridDB + IGDB)

- Cover art reali da **SteamGridDB** per GOG, Epic, Classic Console
- Metadati da **IGDB**: rating, generi, descrizione, anno
- Cache in memoria, aggiornamento asincrono al sync libreria
- Configurazione via `.env`: `STEAMGRIDDB_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`

---

## Step 10 — UI Winetricks overlay (base)

- Checkbox dipendenze Wine nell'overlay gioco
- Default: `vcrun2022, dotnet48, dxvk, vkd3d, corefonts`
- Opzionali: `vcrun2019/2017/2015, xna40, d3dcompiler_47, physx, msxml6, mfc140`
- I verbs selezionati vengono passati al `DownloadManager` al momento dell'installazione

---

## Step 11 — Fix installazione Epic/GOG + persistenza prefix [MILESTONE] ✅

### Epic Games — stato attuale: FUNZIONANTE
- Download via `legendary` ✅
- Creazione prefix Wine isolata ✅
- Dipendenze winetricks (senza dotnet48) ✅
- Auto-rilevamento exe dopo install ✅
- `prefixPath` salvata su DB e usata al lancio ✅
- Runner Wine lancia il gioco con prefix corretta ✅
- **Testato**: Machinarium (Epic) — installato e lanciato con successo

### GOG Galaxy — stato attuale: FUNZIONANTE
- Download installer via `lgogdownloader` ✅
- Creazione prefix Wine isolata ✅
- Dipendenze winetricks ✅
- Estrazione via `innoextract --gog` (niente Wine, niente botva2) ✅
- Auto-rilevamento exe dopo install ✅
- `prefixPath` salvata su DB ✅
- Sync stato installato al riavvio daemon ✅
- **Testato**: Beneath a Steel Sky (GOG) — installato con successo

### Note architetturali
- `innoextract` è ora la soluzione standard per tutti i giochi GOG — superiore all'installer Wine per affidabilità, velocità e indipendenza dalla GPU
- Beneath a Steel Sky include ScummVM bundled (`scummvm/scummvm.exe`) — candidato per lancio nativo ScummVM in step futuro
- La `prefix` GOG viene creata ma non è strettamente necessaria per giochi ScummVM — ottimizzazione futura possibile

### Prossimi step suggeriti
- **Lancio GOG**: testare il lancio effettivo di Beneath a Steel Sky con runner Wine
- **ScummVM nativo**: rilevare giochi GOG con ScummVM bundled e lanciarli con ScummVM Linux
- **Fix legendary sync**: `TypeError: (void 0) is not a function` al boot (Epic sync parziale)
- **IGDB token**: intermittente — investigare refresh automatico
- **Overlay**: aggiungere campo `prefixPath` editabile per correzioni manuali

---

## Step 12f — Log management universale

### Obiettivo
Eliminare tutti i `console.*` nudi dal backend e introdurre una debug console interattiva nella dashboard con filtri per livello, auto-scroll, pausa, copia e download log.

### Backend — Livelli standardizzati

**`types.ts`**
- `LogEntry.type` espanso da `'info' | 'auth' | 'system' | 'error'` a `LogLevel`:
  `debug | info | system | warning | error | auth | download | launch`
- Nuovo tipo esportato `LogLevel` per uso condiviso frontend/backend

**`logger.ts`**
- Rotazione migliorata: `daemon.log` → `daemon.log.1` → `daemon.log.2` (3 file, max 15MB totali)
- Firma `writeLog(level: LogLevel | string, message: string)` — `string` per compatibilità retrograda
- Import `existsSync` per verificare `daemon.log.1` prima di rinominare

**Console sostituiti in tutti i moduli backend:**

| File | console.* rimossi | Livello assegnato |
|------|-------------------|-------------------|
| `runners/implementations.ts` | 19 | `launch` (avvii), `warning` (tool mancanti) |
| `plugins/gogPlugin.ts` | 4 | `info`, `warning` |
| `plugins/epicPlugin.ts` | 5 | `info`, `warning`, `error` |
| `plugins/steamPlugin.ts` | 3 | `info` |
| `plugins/classicPlugin.ts` | 4 | `info` |
| `backend/metadataManager.ts` | 7 | `info`, `warning`, `error` |
| `backend/downloadManager.ts` | 4 | `download`, `warning`, `error` |

**`downloadManager.ts`** — metodo privato `log()`:
- `console.log(`${tag} ${msg}`)` → `writeLog(level === 'error' ? 'error' : level === 'info' ? 'info' : 'download', msg)`
- Livello `download` per fasi pipeline install/prefix/deps

**`gameManager.ts`**
- `getLogs(limit = 200)` accetta parametro opzionale (usato dalla nuova route)
- `'warning'` ora è un tipo valido (era già usato ma non dichiarato in types.ts)

### Server — Route `/api/logs` con filtro

```
GET /api/logs?type=error,download&limit=200
```
- `type`: lista separata da virgola di livelli LogLevel (omesso = tutti)
- `limit`: 1–500, default 200
- Filtro applicato server-side prima della risposta

### Frontend — Debug Console v2 (Step 12f)

**Nuovi import:** `useRef`, `Pause`, `Copy`, `FileDown`, `Filter` da lucide-react

**Nuovi stati:**
- `logFilter: Set<string>` — livelli attivi (set vuoto = mostra tutto)
- `pauseScroll: boolean` — blocca auto-scroll senza perdere log
- `logScrollRef: RefObject<HTMLDivElement>` — ref al container scrollabile

**Auto-scroll effect:**
```ts
useEffect(() => {
  if (!pauseScroll && logScrollRef.current)
    logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
}, [logs, pauseScroll]);
```

**`LOG_LEVEL_META`** — mappa livello → `{ color, border, label }`:
- `debug` → grigio / DBG
- `info` → verde / INF
- `system` → blu / SYS
- `warning` → giallo / WRN
- `error` → rosso / ERR
- `auth` → viola / AUTH
- `download` → ciano / DL
- `launch` → smeraldo / RUN

**Componente Debug Console:**
- Header con badge filtro per ogni livello (toggle attivo/inattivo), pulsante `✕ ALL` per reset
- Indicatore LIVE (blu pulsante) / PAUSED (giallo fisso)
- Pulsante **Pause/Live** — blocca auto-scroll per leggere la storia
- Pulsante **Copy** — copia log filtrati negli appunti come testo plain
- Pulsante **Download** — scarica file `x-launcher-YYYY-MM-DDTHH-MM-SS.log`
- Body scrollabile con `logScrollRef`, ogni riga ha: timestamp, badge livello colorato, messaggio
- Footer: contatore voci filtrate / totali, indicazione filtro attivo
- Altezza aumentata da 160px a 260px per ospitare i controlli


---

## Step 12g — Bugfix post-log (da analisi daemon log)

Tre bug identificati dall'analisi del log prodotto in step 12f.

### Bug 1 — `launchCwd` case-insensitive (WineRunner)

**File:** `src/backend/runners/implementations.ts`

**Problema:** `innoextract` preserva il case del filesystem Windows (es. `ScummVM/`), che può variare tra installazioni diverse (`ScummVM` vs `scummvm`). Il runner passava il `cwd` grezzo a `spawn()`, che su Linux fallisce con `ENOENT` se il case non corrisponde esattamente.

**Fix:** aggiunta funzione `resolveCaseInsensitive(base, relPath)` (stessa logica di `resolvePathCaseInsensitive` già presente in `downloadManager`, ora disponibile anche nel runner). Applicata al `cwd` prima di `spawnDetached()` con tre strategie in cascata:
1. path assoluto + esiste → usalo direttamente
2. path assoluto + non esiste → risolvi case-insensitive dalla dir dell'exe
3. path relativo → `resolveCaseInsensitive(dirname(exe), cwd)`

Fallback finale: se la directory non viene trovata nemmeno dopo la risoluzione, usa `path.dirname(exePath)` e logga `[WARNING]`.

Aggiunti `readdirSync` all'import `fs` del file.

### Bug 2 — TypeError al boot in `syncExternalInstallStates` (fix 12e)

**File:** `src/backend/gameManager.ts`

**Problema:** ad ogni avvio del daemon apparivano:
```
[WARNING] [SYNC] GOG sync failed: TypeError: (void 0) is not iterable
[WARNING] [SYNC] legendary sync failed: TypeError: (void 0) is not iterable
```

Due cause distinte:

**GOG:** `readdirSync(filesDir)` veniva chiamata su ogni gioco GOG anche quando `~/Games/GOG` non esisteva. Se la cartella base non esiste `existsSync(filesDir)` è false — ok — ma in certi edge case (permessi, symlink broken) `readdirSync` poteva lanciare. Fix: guard `if (existsSync(gogBase))` prima del loop + try/catch interno per ogni singolo `readdirSync`.

**Legendary:** `execSync('legendary list-installed --json')` lancia eccezione con exit code != 0 quando legendary non è autenticato o non ha giochi installati. Il risultato veniva catturato ma il `JSON.parse` su output vuoto o di errore produceva un valore non iterabile che poi veniva passato a `Object.values()`. Fix in cascata:
1. `which legendary` prima di tutto — se non nel PATH, `return` immediato senza log
2. `execSync` con `stdio: ['ignore', 'pipe', 'ignore']` per sopprimere stderr di legendary
3. catch di `execSync` → `return` silenzioso (exit != 0 = non autenticato)
4. guard `if (!raw || !raw.trim()) return` prima del parse
5. guard `if (!Array.isArray(installed)) return` dopo il parse

### Bug 3 — Log `[AUTH]` misclassificato

**File:** `src/backend/gameManager.ts`, `launchGame()`

**Problema:** il messaggio `"${game.title} non installato. Avvio download."` usava il tipo `'auth'` — categoria semanticamente sbagliata (auth è per handshake store).

**Fix:** tipo cambiato in `'download'`.

---

## Step 13 — Store Accounts funzionale + System tab + Runner Manager

### Store Accounts

- `handleLogin()` gestisce tre casi: login immediato (Steam), OAuth browser + polling (GOG/Epic), store pubblici senza login (Amazon/Battle.net/Classic Console)
- Polling ogni 2.5s su `/api/stores/login-status/:id` — timeout 150s
- Card UI: spinner "In attesa del browser...", URL OAuth copiabile, messaggio stato, pulsante Annulla
- Re-sync stores + libreria automatico dopo auth riuscita

### System tab (ex Engine Tuning)

- Rinominata da "Engine Tuning" a "System"; i toggle mock rimossi
- **Runner installati**: scan `/api/runners`, badge verde per ognuno
- **Runner installabili**: fetch `/api/runners/installable`, pulsante Installa con SSE progress (`/api/runners/install-stream`)
- **Banner protonup/Lutris** contestuale (4 stati: entrambi presenti ✅, solo protonup, solo Lutris, nessuno ⚠️ con comandi yay)
- **Tool di sistema**: griglia 13 tool con dot verde/grigio — aggiunto Lutris
- **Spazio disco**: uso `~/Games/` via `/api/system/disk`
- Caricamento lazy al primo accesso alla tab

### Backend

- `detectSystemTools()` — aggiunto rilevamento `lutris` via `which lutris`
- `SystemTools` interface in `types.ts` — aggiunto campo `lutris: boolean`
- `types.ts` — nuovi tipi `RunnerInfo`, `InstallableRunner`, `SystemTools`, `StoreAuthStatus`
- `server.ts` — nuova route `GET /api/runners/install-stream?id=` con SSE progress streaming

### Overlay Runner Bridge esteso

- Sezione runner installati: badge selezionabili per-game con salvataggio DB immediato
- Sezione runner installabili: `+ Installa` inline con progress SSE, ultima riga visibile
- `installableRunners` caricato al primo apertura overlay (se non già in cache)
- Stato `runnerInstalling` e `runnerInstallProgress` condivisi tra System tab e overlay

---

## v0.95 alpha — Bugfix post-step13 + Plugin System funzionale

### Bug risolti

**Errore di compilazione — catena ternaria settings tab (`App.tsx`)**
- La catena ternaria `activeSettingsTab` era priva della condizione `=== 'engine'` per il tab System: il blocco era aperto con un `else` generico (`) : (`), rendendo impossibile al parser accettare il successivo `) : activeSettingsTab === 'plugins' ? (`.
- Fix: condizione `=== 'engine'` ripristinata correttamente.

**Tab System mostrava il contenuto di Input (`App.tsx`)**
- Il tab System usava l'ID interno `'engine'` (nome storico "Engine Tuning") ma la condizione JSX era stata scritta come `=== 'system'` — un ID che non esiste nello stato. Il blocco System non veniva mai renderizzato e il suo contenuto cadeva nell'`else` finale (Input tab).
- Fix: condizione corretta in `=== 'engine'`.

**Tab Plugins bloccato su "Caricamento plugin..." (`App.tsx`)**
- Il fetch di `/api/plugins` aveva dependency array `[]` (solo mount). Se al boot il server non aveva ancora i plugin pronti, `pluginRegistry` restava vuoto senza possibilità di ricarica.
- Fix: `useEffect` ora si ri-esegue ogni volta che si apre il tab Plugins (dependency `[activeSettingsTab]`), con `Array.isArray()` guard e error state visibile (`pluginLoadError`).
- Aggiunto pulsante **↻ Ricarica** / **↻ Riprova** nel tab Plugins per retry senza ricaricare l'app.

**`/api/plugins` restituiva HTML 404 invece di JSON (`server.ts`)**
- Il `dist/server.cjs` in produzione era compilato da una versione precedente di `server.ts` (pre-step13) che non conteneva le route `/api/plugins`. `grep -c "api/plugins" dist/server.cjs` restituiva `0`.
- Fix: il `server.ts` aggiornato deve essere sempre copiato nella cartella di lavoro prima di ricompilare. Usare `rsync` per sincronizzare l'intero pacchetto è il metodo consigliato.

### Nuova funzionalità — Blocco lancio per plugin disabilitato (`gameManager.ts`)

Se un plugin store viene disabilitato dall'utente, i giochi di quello store con `drmFree = false` non possono essere avviati. Il blocco avviene in `launchGame()` prima di qualsiasi altra operazione:

```ts
const storePlugin = this.plugins.find(p => p.id === game.store);
if (storePlugin && !storePlugin.enabled && !storePlugin.drmFree) {
  // blocca + log di errore
  return { success: false, message: `Plugin "${storePlugin.name}" disabilitato` };
}
```

**Logica DRM applicata:**

| Store | drmFree | Plugin disabilitato | Risultato lancio |
|-------|---------|--------------------|--------------------|
| GOG | `true` | sì | ✅ Si avvia — DRM-free |
| Classic/ROM | `true` | sì | ✅ Si avvia — DRM-free |
| Epic | `false` | sì | ❌ Bloccato + log errore |
| Steam | `false` | sì | ❌ Bloccato + log errore |
| Amazon | `false` | sì | ❌ Bloccato + log errore |
| Battle.net | `false` | sì | ❌ Bloccato + log errore |

Il messaggio di errore appare nel Debug Console con indicazione: *"plugin X disabilitato — riattivalo dalle Impostazioni > Plugins"*.

### Note operative
- Ricorda di copiare sempre **tutti i file del pacchetto** (incluso `server.ts` e `src/backend/`) con ogni aggiornamento. Comando consigliato:
  ```bash
  rsync -av --exclude='node_modules' --exclude='dist' --exclude='.git' \
    /path/to/pacchetto-estratto/ ~/Progetto\ Dashboard/x-launcher/
  ```

---

## v0.95 alpha — Patch 2: Spazio disco reale + fix UI System tab

### Bug risolto — Lettura spazio disco non funzionante (`compatibilityManager.ts`)

`getDiskUsage()` usava solo `du -sb ~/Games` per misurare lo spazio. Se la cartella `~/Games` non esisteva ancora (prima installazione o sistema pulito), il comando falliva silenziosamente e il catch restituiva `null`. La sezione "Spazio disco" nella tab System scompariva del tutto senza alcun messaggio — sembrava un mock ma era un crash silente.

**Fix — doppia sorgente reale:**
- `du -sb ~/Games` — spazio occupato dai giochi installati (0 se cartella assente, senza crash)
- `df -B1 --output=size,avail ~` — spazio totale e libero della partizione home (non fallisce mai)

**Nuovi campi restituiti dalla route `/api/system/disk`:**

```ts
{
  gamesDir: string;       // ~/Games
  usedBytes: number;      usedHuman: string;   // uso ~/Games
  totalBytes: number;     totalHuman: string;  // totale partizione
  freeBytes: number;      freeHuman: string;   // libero partizione
  usedPercent: number;                         // % usata partizione
}
```

**UI aggiornata (`App.tsx`):**
- Mostra **X.X GB liberi** in evidenza
- Barra percentuale colorata: blu → giallo >70% → rosso >90%
- Riga secondaria: % usata e totale partizione
- Riga terziaria: uso `~/Games` con nota "cartella non ancora creata" se assente
- Pulsante **↻ Aggiorna** per ricaricare senza riavviare l'app
- Stato "Lettura in corso..." durante il caricamento (invece di scomparire)

---

## v0.96 alpha — Notification Center + KnowledgeBase

### Step 15a — NotificationBar: unificazione UI

- Nuovi tipi `AppNotification`, `NotificationType`, `NotificationStatus`, `NotificationAction` in `types.ts`
- State `notifications[]`, `showNotifications`, `expandedNotifId` in `App.tsx`
- Helper `pushNotification()` con auto-dismiss 6s per info/success, `dismissNotification()`, `resolveNotification()`
- `unreadCount` calcolato su pending+applied
- Pannello "Centro Notifiche" con card per tipo (info/success/warning/error/ai-suggestion/kb-suggestion), ciclo tre stati (pending→applied→resolved/failed), log tecnico espandibile, pulsante pulisci storico
- Footer: campanella con badge numerico, download indicator clickable, i due pannelli si escludono
- Gamepad: tasto B chiude il pannello notifiche se aperto

### Step 15b — NotificationEngine: backend core

- Nuovo modulo `src/backend/notificationEngine.ts`: `NotificationStore` (SQLite tabella `notifications`), `NotificationQueue` (dedup 30s), `EventBus` (`emit()`), `LogBridge` (`bridgeLog()`)
- 8 tipi di evento gestiti: `download-completed/error`, `launch-error/blocked`, `auth-error/ok`, `runner-installed/error`
- `server.ts`: `setBroadcast()` registrato al boot; `downloadManager.onComplete/onError` agganciati; `/api/launch` emette `launch-error`/`launch-blocked`; install-stream emette `runner-installed/error`
- 3 nuove route: `GET /api/notifications`, `GET /api/notifications/pending`, `PATCH /api/notifications/:id/status`
- `downloadManager.ts`: aggiunto `onComplete()` e `onError()` con callback array, chiamati dopo transizioni `completed` (GOG ed Epic) e `error`
- `App.tsx`: boot carica notifiche persistenti da `/api/notifications/pending`; SSE gestisce evento `notification` pushato dal backend; stato persistito via PATCH

### Step 15c — KnowledgeBase: dizionario locale

- Nuovo modulo `src/backend/knowledgeBase.ts`: `KnowledgeStore` (SQLite tabella `knowledge_base`), `KBMatcher` con tre livelli di match (regex → substring → keyword ratio), soglia configurabile (default 0.60), `AIWriteback` con score +0.1 resolved / -0.15 failed
- `kb-seed.json` con 16 pattern predefiniti: d3dx9, d3dcompiler, vulkan, vcrun, dotnet, no-adapter, access violation, stack overflow, OpenGL, Epic auth, GOG auth, wine-cannot-find, xinput, msvcp, PhysX, plugin disabled
- `notificationEngine.ts`: per `launch-error` e `download-error` consulta KB prima di emettere — se match → `kb-suggestion` con soluzione e azione pronta; altrimenti errore generico
- `server.ts`: 9 nuove route KB: `GET /api/kb`, `GET /api/kb/stats`, `GET /api/kb/lookup`, `DELETE /api/kb/:id`, `POST /api/kb/reload-seed`, `POST /api/kb/reset`, `PATCH /api/kb/threshold`, `POST /api/kb/writeback/resolved`, `POST /api/kb/writeback/failed`
- `App.tsx`: `resolveNotification` chiama writeback KB — resolved → score+, failed → score-

### Bugfix

- `knowledgeBase.ts` — `loadSeed`: `action_params` serializzato in stringa JSON prima del bind SQLite (fix `SQLite3 can only bind numbers, strings, bigints, buffers, and null`)

---

## v0.96.1 alpha — Hardware fixes

### Bug risolti da test su hardware reale

**1. GOG auth — nessun browser si apre** (`gogPlugin.ts`)
`lgogdownloader --login` avvia un server OAuth locale ma non apre il browser. Fix: cattura l'URL OAuth dall'output del processo tramite regex e chiama `xdg-open` automaticamente. Se l'URL non arriva entro 15s, mostra istruzioni manuali. Il processo rimane attivo in background in attesa del completamento OAuth.

**2. Epic auth — impossibile incollare il codice JSON** (`epicPlugin.ts`, `server.ts`, `App.tsx`)
Tre fix combinati:
- `epicPlugin.ts`: `xdg-open` automatico sull'URL OAuth rilevato dall'output di `legendary auth --disable-webview`
- `server.ts`: nuova route `POST /api/stores/auth-code` che accetta il codice SID (JSON o stringa) e lo passa a `legendary auth --sid`
- `App.tsx`: campo input + pulsante "Invia" nella card Epic quando in attesa, visibile solo per Epic Games

**3. Sync libreria non parte dopo auth GOG** (`App.tsx`, `server.ts`)
Il polling di autenticazione, al rilevamento del login avvenuto, ora chiama `POST /api/library/refresh` che forza una `refreshLibrary()` in background su tutti gli store. Nuova route `POST /api/library/refresh` aggiunta al server.

**4. Flash libreria vuota al cambio store** (`App.tsx`)
Aggiunto stato `isFetchingLibrary`. La lista giochi non viene azzerata durante il fetch — si aggiorna solo quando i nuovi dati arrivano, eliminando il flash vuoto.

**5. Metadata ri-fetchati ad ogni riavvio** (`metadataManager.ts`)
Aggiunto check early-exit in `enrichGameMetadata()`: se il gioco ha già `hasRealMetadata()` (rating > 0 e generi) e `hasRealCover()` (cover non placeholder), salta completamente il fetch API e mette il gioco in cache. Riduce drasticamente le chiamate a SteamGridDB/IGDB al riavvio del daemon.

**6. Controller Bluetooth non riceve input** (`App.tsx`, `index.css`)
La Gamepad API del browser richiede un input fisico prima di attivare il gamepad. Aggiunto hint visivo animato "Premi un tasto sul controller per attivare l'input" che appare quando viene rilevato un dispositivo connesso. Animazione `fadeInOut` CSS.

**Versione dinamica nel footer** (`App.tsx`, `server.ts`)
La versione mostrata nel footer non è più hardcoded `v0.82-Alpha`. Nuova route `GET /api/version` legge `metadata.json` a runtime. Il frontend la fetch al boot e aggiorna lo stato `appVersion`.

---

## v0.98.0 alpha — Controller-first navigation completa [MILESTONE]

Sessione di lavoro estesa, interamente dedicata a portare la navigazione gamepad da "parzialmente funzionante" a "copertura completa e affidabile" su ogni area della Dashboard. Il lavoro si è svolto in cicli di test-su-hardware-reale → diagnosi → fix, con diverse cause architetturali ricorrenti risolte alla radice.

### Architettura del focus (`FocusProvider.tsx`)

- **Registry corretto**: `register()` ora aggiorna sempre il `ref` di un id già esistente invece di ignorare la re-registrazione — causa radice di focus "fantasma" agganciati a nodi DOM smontati
- **Scoring assiale**: sostituita la distanza euclidea con un punteggio direzionale (componente primaria + penalità quadratica sulla deviazione laterale), con filtro di visibilità reale nel viewport
- **`activeGroup`**: meccanismo di scope isolato — quando un overlay è aperto, stick/D-pad e mouse considerano *solo* i `Focusable` del suo group, eliminando le interferenze tra dashboard sottostante e overlay sovrapposti
- **`fallbackPriority`**: i pulsanti di chiusura (sempre nell'header, quindi geometricamente "più in alto") non vengono più scelti per errore come target di fallback quando si entra in un nuovo scope — priorità negativa esplicita
- **`neighbors`**: override di navigazione espliciti per direzione, usati per garantire percorsi certi verso elementi piccoli/defilati (pulsanti "Aggiorna") che lo scoring geometrico penalizza sempre, indipendentemente da quanto si aggiusti la formula
- **`triggerFocusedAction()`**: il fallback per il tasto A ora legge `onEnter` dal registry invece che dal DOM (`document.querySelector('[data-focused]')`), eliminando i click "a vuoto" nella finestra di desincronizzazione tra cambio di scope e aggiornamento del DOM

### Stabilità input (`useGamepad.ts`)

- **`isJustPressed` idempotente**: aggiunto `consumedRef` per impedire che lo stesso fronte di pressione fisica venga letto come "appena premuto" più volte quando il polling RAF (60fps) e il ciclo di render React (frequenza variabile) si desincronizzano — causa della selezione "impazzita" sui dorsali L1/R1
- **Stabilizzazione dei callback**: `cycleStore`, `cycleSettingsTab`, `handlePlay` e altri non dipendono più direttamente da stato che cambia frequentemente (es. `pluginRegistry`, `games`) — letture tramite ref dedicati, eliminando i remount a cascata dell'effect gamepad principale che potevano far perdere input fisici a metà frame

### Navigazione completa per area

- **Store bar**: ciclo L1/R1 con wrap-around, cambio libreria immediato senza A, isolata da D-pad/stick
- **Footer (Net Bridge/Notifiche)**: stesso meccanismo
- **Menu X-Launcher**: apertura su Start (Select per compatibilità debug), voce Avatar dedicata, icona avatar in top bar resa puramente decorativa
- **Settings**: 4 tab su L1/R1 (Store Accounts/System/Plugins/Input), focus iniziale deterministico per ogni tab invece di affidarsi al fallback geometrico
- **Avatar Library**: tutti i pulsanti header (Rimuovi/Account/Ricarica/Chiudi) ora `Focusable`
- **Cache libreria**: per store già visitati in sessione, elimina il flash vuoto/store-precedente al cambio rapido tra store

### Store Accounts — login/logout reali

- **Causa comune ai problemi di autenticazione**: diversi bug a cascata (comando CLI sbagliato, stringa di confronto sbagliata, formato OAuth cambiato da Epic, architettura di processo non interattiva) — risolti uno per uno con verifica diretta da terminale
- **Epic**: `legendary auth --delete` (non `--logout`, inesistente nella CLI) per il logout; `isAuthenticated()` corretto per il placeholder reale `'<not logged in>'`; login basato su `legendary auth --code` (formato corrente di Epic, non più `--sid`)
- **GOG**: logout via rename `.unlink` di `cookies.txt`/`galaxy_tokens.json` (nessun comando dedicato esiste in lgogdownloader) — reversibile, mai cancellazione distruttiva
- **Login per entrambi**: abbandonato il flusso "spawn processo + intercetta URL dal browser" (inaffidabile da un processo backend senza terminale interattivo reale) in favore di istruzioni a schermo + polling automatico su `isAuthenticated()`
- **Filtro libreria per stato auth**: store disconnesso → solo i titoli già installati restano visibili; store con plugin disattivato → scompare interamente da top bar e Manage Accounts
- **Card account**: conteggio reale `Synced`/`Installed` derivato da `games`, non più il composito `gameCount` lato server

### Runner tab (System)

- **Pulizia mock**: rimosso un fallback hardcoded che inventava 3 runner finti quando nessuno era rilevato su disco
- **Disinstallazione**: nuovo endpoint `uninstallProton`/`/api/runners/uninstall-stream`, con vincolo di sicurezza esplicito — rifiuta di toccare qualunque cosa fuori da `compatibilitytools.d`, non tocca mai `steamapps/common` (gestito da Steam)
- **Stato a 3 fasi**: Install/Installed (idle) → conferma a 2 tap → barra di progresso indeterminata (nessuna percentuale finta, solo feedback "lavoro in corso") → stato finale, simmetrico per install e uninstall
- **Filtro installati/installabili**: un runner già installato non compare più in entrambe le liste contemporaneamente
- **Fix notifiche**: `better-sqlite3` richiede che ogni parametro nominato nella query esista sull'oggetto bound, anche `null` — `runner-installed`/`runner-uninstalled`/`runner-error` mancavano campi opzionali e crashavano silenziosamente *dopo* che l'operazione reale era già andata a buon fine
- **Durata visiva minima**: la disinstallazione (`rm -rf`, quasi istantanea) ha ora un minimo di 900ms prima di segnalare il completamento, altrimenti l'animazione non aveva tempo di essere percepita

### Tool di sistema / Spazio disco

- Entrambe le aree informative ora `Focusable` come punto di sosta nella navigazione (nessuna azione per A oggi, predisposte per il futuro)
- Auto-refresh periodico (8s) dei Tool di sistema mentre la tab è aperta
- Soglie colore della barra disco corrette: verde (ampio margine) → giallo (30% libero) → rosso (10% libero), espresse in termini di spazio libero invece che usato

### Nuovo componente

- **`GamepadTester.tsx`**: schema SVG di un gamepad standard integrato nella tab Input, illumina pulsanti/stick in tempo reale leggendo lo stesso `gamepadState` già usato da tutta la navigazione — nessun canale di lettura separato

---

## v0.98.3 alpha — Fullscreen persistente, Exit, fix scroll/focus tab System

**Causa del bug Fullscreen**: il toggle usava la Fullscreen API del DOM, ma `kiosk-launch.sh` avvia il browser con `--kiosk`, un meccanismo nativo completamente indipendente da `document.fullscreenElement` — chiamare `requestFullscreen()`/`exitFullscreen()` su un browser già in kiosk mode non aveva mai potuto avere alcun effetto osservabile.

- **`appConfig.ts`** (nuovo): preferenze persistite in formato chiave=valore (non JSON, per essere leggibile da bash senza dipendenze) in `~/.local/share/x-launcher/app.conf`
- **`kiosk-launch.sh`**: legge la preferenza prima di costruire i flag del browser — `fullscreen=true` → `--kiosk` (default storico); `false` → modalità finestra ridimensionabile (`--window-size=1280,800`, niente `--kiosk`)
- **Toggle Fullscreen**: ON ha effetto immediato (la Fullscreen API funziona davvero fuori da `--kiosk`), OFF richiede un riavvio (uscire da `--kiosk` non è possibile a runtime) — messaggi di notifica differenziati di conseguenza
- **Nuova voce Exit** nel menu X-Launcher: conferma a 2 tap, chiude il daemon (`POST /api/system/exit`) e tenta la chiusura della finestra/tab
- **Fix scroll/focus tab System**: lo scroll manuale introdotto per evitare di muovere contenitori esterni fissi (header, tab, X di chiusura) non raggiungeva i bordi reali del contenuto; corretto il calcolo per arrivare fino a `scrollTop` 0/massimo invece di fermarsi al margine minimo. Il focus iniziale di ogni tab di Settings era deterministico solo ciclando con L1/R1, non premendo A direttamente sulla tab — unificato

---

## v0.99.0 alpha — Centro notifiche, fix autenticazione GOG, navigazione libreria rifinita

### Centro notifiche

- **L2/R2** come scorciatoie dirette per Downloads/Notifiche, simmetriche a L1/R1 per la store bar — prima raggiungibili solo navigando con D-pad/stick fino in fondo alla pagina
- **Stato "non letta" onesto**: nuovo campo `seen`, distinto da `status`. Una notifica di tipo info/success passa automaticamente a `status: 'dismissed'` dopo 6 secondi indipendentemente da cosa l'utente ha visto — il contatore sulla campana usava quel campo, quindi poteva scendere a zero anche se l'utente non aveva mai aperto il pannello (es. con un gioco in primo piano). `seen` non cambia mai automaticamente: passa a `true` solo quando l'utente apre fisicamente il pannello
- **Testo più leggibile**: titolo 12px→14px, corpo 10px→13px, metadati 9px→10px
- **"Pulisci storico"** reso `Focusable`, prima selezionabile solo col mouse

### Fix autenticazione GOG

`isAuthenticated()` interrogava `lgogdownloader --list`, deducendo lo stato di login da un'euristica sul contenuto testuale dell'output — un comando pensato per elencare giochi, non per verificare l'autenticazione. Fonte ufficiale del progetto (forum GOG, confermata dall'autore): `--list` può fallire anche con un login API perfettamente valido, per un problema separato sui cookie del sito. Sostituito con `lgogdownloader --check-login-status`, il comando dedicato, che riporta un exit code binario documentato (0 = loggato, 1 = non loggato).

### Navigazione libreria — serie di fix su scroll/focus

- **`isVisible()` separata in due funzioni distinte**: una versione semplice per lo scoring direzionale di `moveFocus` (deve poter scegliere un candidato che richiede uno scroll per diventare visibile — è lo scopo dello scroll automatico) e `isVisibleInScrollContainer` per il solo fallback generico (dove invece è corretto escludere elementi attualmente fuori vista). La conflazione delle due escludeva permanentemente ogni riga oltre la seconda in un viewport più basso (Dashboard in modalità finestra), perché `moveFocus` non le scegliera mai come target — un classico problema "uovo e gallina" con lo scroll automatico mai innescato
- **Strategia di scroll a centraggio**: la riga selezionata viene sempre centrata nello spazio visibile del contenitore (righe sopra/sotto visibili a metà come anteprima), non più "scroll minimo verso il bordo" — quella strategia precedente lasciava occasionalmente una card esattamente al bordo critico del contenitore, e la pressione direzionale successiva calcolava lo scoring contro quella posizione di confine, a volte preferendo una card adiacente sulla stessa riga e producendo una "salita laterale a scatti" visibile
- **Parametro `axis`** su `setFocusedId`: i movimenti puramente orizzontali non ricalcolano più il centraggio verticale, eliminando un micro-jitter percepibile causato da piccole differenze di altezza tra card (badge presenti/assenti, titolo su una o due righe, l'animazione `layout` di Framer Motion)
- **Scroll animato ma esplicitamente cancellabile**: un'animazione manuale con `requestAnimationFrame` (easing cubico, 220ms) restituisce la fluidità persa quando lo scroll era stato reso istantaneo per eliminare una race condition — una nuova richiesta di scroll cancella sempre quella precedente ancora in corso, garantendo che `moveFocus` legga sempre la posizione reale e mai un valore verso cui il browser sta ancora animando

---

## v0.99.1 alpha — Fix sync libreria Classic Console (ROM rimosse/rinominate non più fantasma)

### Bug risolto — Libreria Classic non si aggiornava su rimozione/rename (`gameManager.ts`, `classicPlugin.ts`, `db.ts`)

**Sintomo**: rimuovendo o rinominando una ROM, alla riapertura della Dashboard la libreria Classic Console mostrava sia il titolo eventualmente aggiunto/rinominato sia quello rimosso/col nome vecchio — quest'ultimo non più lanciabile perché il file non esiste più nel path registrato.

**Causa — due bug concorrenti:**
1. `gameManager.refreshLibrary()` esegue solo `db.upsertGames()` ad ogni scansione: non esisteva alcuna funzione per rimuovere dal DB i titoli che un plugin non restituisce più. Per gli store online (Steam/Epic/GOG) il problema è mitigato dal fatto che install/uninstall sono tracciati esplicitamente dai loro comandi dedicati; per Classic (puro file scan) non c'era alcun meccanismo equivalente — una ROM scomparsa restava per sempre nel DB.
2. `makeGameId()` deriva l'id dall'hash del **path completo** del file. Rinominare una ROM produce quindi un id completamente nuovo — non è un update della entry esistente, è un secondo titolo: quello vecchio diventa orfano esattamente come una ROM rimossa.

**Fix:**
- **`db.ts`** — nuova funzione `deleteGamesByStoreNotIn(store, validIds)`: rimuove le righe di un singolo store il cui id non è nell'elenco fresco appena scansionato.
- **`plugins/base.ts`** — nuovo flag `isExhaustiveLocalScan` (default `false`) su `StorePlugin`. Dichiara che `getLibrary()` esegue una scansione locale esaustiva e affidabile (filesystem): un titolo assente dal risultato non esiste più con certezza, quindi `gameManager` può pulire il DB in sicurezza. **Esplicitamente non attivato per gli store online** — un array vuoto o parziale da Steam/Epic/GOG può derivare da un errore di rete/auth temporaneo, non da una libreria realmente svuotata, e cancellare in quel caso sarebbe distruttivo.
- **`classicPlugin.ts`** — `isExhaustiveLocalScan = true`. `getLibrary()` ora lancia un'eccezione se la cartella ROM non è raggiungibile, invece di restituire `[]` silenziosamente come prima: un array vuoto verrebbe altrimenti letto come "scansione riuscita, libreria realmente vuota" e farebbe scattare la pulizia totale, cancellando l'intera libreria Classic se la cartella fosse solo temporaneamente irraggiungibile (es. disco esterno scollegato). Il throw fa sì che il try/catch in `gameManager` lasci intatto lo stato precedente nel DB.
- **`gameManager.ts`** — in `refreshLibrary()`, dopo l'upsert, per ogni plugin con `isExhaustiveLocalScan = true` la cui scansione è andata a buon fine (nessuna eccezione) viene chiamata `db.deleteGamesByStoreNotIn()`. Log esplicito `[DAEMON] <store>: N titoli rimossi dal DB (non più presenti sul disco)` quando la pulizia rimuove almeno una riga.

**Nota sul rename**: l'id resta derivato dal path (necessario per coerenza con config/prefix già persistite altrove), quindi rinominare una ROM continua a generare tecnicamente un nuovo id. Con questo fix la entry vecchia viene però rimossa correttamente al refresh successivo invece di restare visibile in eterno — il sintomo riportato (titolo fantasma non lanciabile) è risolto sia per la rimozione che per il rename.

**Comportamento finale:**

| Scenario | Prima del fix | Dopo il fix |
|---|---|---|
| ROM rimossa | Resta in libreria, non lanciabile | Rimossa dal DB al refresh successivo |
| ROM rinominata | Vecchio titolo fantasma + nuovo titolo duplicato | Vecchio titolo rimosso, resta solo il nuovo |
| Cartella ROM temporaneamente irraggiungibile (es. disco esterno) | N/A (nessuna pulizia esisteva) | Scansione fallisce, libreria precedente lasciata intatta — nessuna cancellazione |
| Libreria Classic realmente svuotata dall'utente | N/A | Pulizia corretta, libreria Classic risulta vuota |

---

## v0.99.2 alpha — Generazione automatica cartelle sistema Classic Console + refresh periodico libreria

### Novità — Auto-scaffolding cartelle ROM (`classicPlugin.ts`)

**Obiettivo**: eliminare la necessità di creare manualmente le sottocartelle per sistema prima di poter usare Classic Console — basta trascinare le ROM nella cartella giusta e il riconoscimento avviene in automatico.

- Ad ogni scansione, `getLibrary()` crea (se assente) la cartella ROM root (`ROMS_PATH` o default `$HOME/Roms`) e al suo interno l'intero albero di sottocartelle canoniche per sistema: `SNES`, `NES`, `GBA`, `GBC`, `GB`, `MD`, `SMS`, `PSX`, `PSP`, `N64`, `Mame`, `DOS`, `ScummVM`.
- `mkdirSync({ recursive: true })` su cartelle già esistenti non fa nulla e non lancia errore — sicuro da richiamare ad ogni scan invece che solo al primo avvio, senza bisogno di un flag "già inizializzato" da persistere.
- **Nomi canonici, non gli schemi lunghi stile community** (es. "Nintendo - Super Nintendo Entertainment System"): quello schema non è uno standard imposto da RetroArch — è solo una convenzione adottata da alcuni tool (EmulationStation) — mentre le sigle corte usate qui sono esattamente quelle già riconosciute da `detectSystem()`, garantendo che ogni cartella creata sia immediatamente funzionale.
- Cartelle già presenti con nomi diversi (es. l'utente ha già `Genesis/` invece di `MD/`) non vengono toccate né rinominate — `detectSystem()` le riconosce comunque tramite gli alias già presenti in `SYSTEM_MAP`.
- **Comportamento intenzionalmente semplice** su cartella root assente: viene sempre creata (vuota) nel path risolto da `ROMS_PATH`/default, senza distinguere "primo avvio" da "path .env sbagliato/disco scollegato" — se l'utente sposta la propria collezione, è sua responsabilità aggiornare `ROMS_PATH` di conseguenza. Conseguenza diretta: se la cartella risulta vuota per un .env non aggiornato, la libreria Classic verrà mostrata vuota e la pulizia DB introdotta in v0.99.1 rimuoverà le entry esistenti — comportamento accettato, nessuna euristica di protezione aggiuntiva.

### Novità — Supporto MAME (`classicPlugin.ts`)

- Nuova voce in `SYSTEM_MAP`: chiavi `mame`/`arcade` → core `mame2003_plus_libretro.so` (leggero, adatto a hardware Linux generico), label "Arcade (MAME)".
- Cartella canonica `Mame/` generata insieme alle altre.

### Novità — Refresh periodico libreria in background (`gameManager.ts`)

**Problema risolto**: senza un refresh periodico, modifiche al disco (ROM aggiunte/rimosse/rinominate) o ai download Epic/GOG completati mentre la Dashboard era già aperta restavano invisibili finché l'utente non premeva manualmente "Aggiorna" o riavviava il daemon.

- Nuovo timer interno al `GameManager`: richiama `refreshLibrary()` ogni 90 secondi mentre il daemon è attivo, indipendentemente dal fatto che il frontend sia aperto o no.
- Avviato automaticamente in `init()` dopo il refresh iniziale del boot; `startPeriodicRefresh()` è idempotente (non crea timer duplicati), `stopPeriodicRefresh()` disponibile per un eventuale shutdown controllato.
- Riusa `refreshLibrary()` esistente invece di un percorso parallelo dedicato a Classic: stessa protezione già in vigore per gli store online (try/catch che lascia intatto lo stato precedente su errore di rete/auth) e stessa logica di pulizia DB per i plugin `isExhaustiveLocalScan` (v0.99.1).
- Intervallo di 90s scelto come compromesso tra reattività percepita e non sovraccaricare i plugin online (Epic/GOG passano dalla stessa `refreshLibrary()`, quindi ogni ciclo del timer richiama anche le loro CLI) con chiamate troppo frequenti.

---

## v0.99.3 alpha — Fix core MAME errato (`classicPlugin.ts`)

### Bug risolto

In v0.99.2 il core assegnato alla cartella `Mame/` era stato impostato a `mame2003_plus_libretro.so` per ipotesi, senza verifica sul sistema reale dell'utente. Dal log `pacman -Ss libretro-` risulta installato `libretro-mame` (MAME completo upstream, non il fork mame2003-plus) — il cui file reale, confermato dal file-list ufficiale Arch del pacchetto, è `mame_libretro.so`, non `mame2003_plus_libretro.so`. Il core configurato non sarebbe mai stato trovato da RetroArch.

**Fix**: `SYSTEM_MAP['mame']` e `SYSTEM_MAP['arcade']` ora puntano a `mame_libretro.so`.

**Scelta tra le opzioni disponibili sul sistema** (risultavano installati sia `libretro-mame` che `libretro-mame2016`): MAME completo upstream scelto come default — manutenzione attiva e gestione automatica di romset/versioni multiple, a differenza dei fork "congelati" su un singolo romset storico (mame2016, mame2003-plus) — per la maggiore compatibilità out-of-the-box con ROM moderne, a fronte di requisiti hardware leggermente più alti.

**Nota**: questo fix non richiede alcuna azione sui file ROM esistenti — riguarda solo quale core viene assegnato di default alle ROM nella cartella `Mame/`, configurabile manualmente per singolo gioco dal pannello di overlay (Step 4) se si preferisce `mame2016_libretro.so`.

---

## v0.99.4 alpha — Fix navigazione: focus libreria, lente ricerca, overlay che si resetta sempre su GOG

### Bug risolto — Overlay Game Options puntava sempre allo stesso gioco (`App.tsx`)

**Sintomo**: aprendo l'overlay su qualsiasi card, di qualsiasi libreria, il contenuto mostrato puntava sempre allo stesso titolo (il primo gioco GOG, "A Plague Tale") — rendendo impossibile configurare o installare qualunque altro gioco tramite overlay.

**Causa — due bug concorrenti:**
1. Una `useEffect` storica ("Update selected game when games list changes (switching stores)", residuo pre-SSE dei primi step del progetto) sovrascriveva `selectedGameId` con `games[0].id` ogni volta che l'array `games` cambiava reference — **senza alcuna protezione sull'overlay aperto**, a differenza della sincronizzazione più recente già presente negli handler SSE/fetch (che hanno correttamente `if (showGameOptions) return prev;`). Con il refresh periodico introdotto in v0.99.2 questo si attivava molto più spesso, aggravando il bug.
2. Il focus iniziale dell'overlay veniva forzato con `setFocusedId('game-options-close')` — un id hardcoded che ignorava il `fallbackPriority` negativo già dichiarato su quel pulsante: quel meccanismo scatta solo dentro `moveFocus` quando il focus corrente *non* è nel pool attivo, ma scrivendo l'id direttamente lo si rendeva "valido" nel nuovo pool, quindi nessun movimento successivo lo correggeva.
3. Il click destro del mouse (apertura overlay alternativa) chiamava `setShowGameOptions(true)` direttamente, **senza** isolare lo scope (`setActiveGroup`) né impostare alcun focus iniziale — causa dell'interferenza con la dashboard sottostante segnalata, analoga al problema già risolto per Manage Accounts.

**Fix:**
- Rimossa la `useEffect` ridondante.
- Aggiunta guardia `showGameOptions` alla sync residua `selectedGameId` ← `focusedId`.
- **`FocusProvider.tsx`** — estratta la logica di scoring del fallback (priorità + posizione, "più in alto poi più a sinistra") in una funzione condivisa `pickBestFallback`, riusata sia da `moveFocus` sia da una nuova funzione esposta `focusFirstInGroup(group)`, che seleziona esplicitamente il primo elemento utile di un group interrogando il registry invece di forzare un id specifico.
- `openGameOptions` ora chiama `focusFirstInGroup('game-options')` invece di `setFocusedId('game-options-close')`.
- Il click destro del mouse ora chiama `openGameOptions(game.id)` — stesso percorso unificato di apertura, qualunque sia l'origine (tastiera/controller o mouse), isolando sempre correttamente lo scope.

### Novità — Prima card selezionata di default all'apertura libreria (`App.tsx`, `FocusProvider.tsx`)

All'apertura o al cambio di libreria, la prima card (in alto a sinistra) viene ora selezionata automaticamente, permettendo di navigare subito con D-pad/stick senza una pressione preliminare a vuoto.

- Nuovo effect dedicato, triggerato **solo** da un cambio reale di `activeStore` (tracciato con un ref confrontato contro il valore precedente) — non da `activeGroup` che torna a `null`, condizione che si verifica anche alla chiusura di un qualunque overlay generico: in quel caso il focus deve restare dove l'utente stava guardando (gestito già correttamente da `closeGameOptions` e equivalenti), non saltare alla prima card.
- Nessun effetto se un overlay è già aperto al momento del cambio store (caso limite: cambio da mouse sulla store bar mentre un overlay è sopra — il cambio gamepad L1/R1 è già bloccato in quel caso da `activeGroup === null`).

### Novità — Lente di ricerca: mouse vs controller (`App.tsx`)

- La lente non è più un `Focusable`: non selezionabile né attivabile da D-pad/stick/A del controller, solo cliccabile dal mouse.
- **Click mouse sulla lente** → nuova `openSearchWithPhysicalInput()`: apre la search bar e porta il focus diretto sull'`<input>` reale, **senza** sovrapporre la Virtual Keyboard — l'utente digita con la propria tastiera fisica. Stesso percorso ora usato anche da `Ctrl+F`/`Cmd+F` (prima apriva sempre anche la VK, ridondante per chi sta già usando una tastiera fisica).
- **Tasto Y (controller)** → `toggleSearch()` (comportamento preesistente, ora libero dalla lente): apre la search bar E la Virtual Keyboard, l'unico modo per un controller di digitare. Attivo solo quando nessun altro overlay/scope è già occupato (`activeGroup === null`).
- Gestito il caso limite di passaggio tra i due percorsi: se la ricerca era già aperta da Y (con VK) e l'utente clicca sulla lente o usa `Ctrl+F`, la VK residua viene chiusa correttamente invece di restare sovrapposta sopra il campo con focus nativo.
- Rimosso codice morto: il ramo `focusedIdRef.current === 'nav-search'` nel gestore del tasto A e il relativo `searchJustOpenedRef` (bounce-guard) non servono più — l'apertura da controller passa esclusivamente da Y, che ha la propria edge-detection indipendente.

### Refresh libreria — timer rilassato + on-demand al cambio store (`gameManager.ts`, `App.tsx`)

Sostituito il polling fisso ogni 90s (v0.99.2) con una combinazione di due meccanismi, su suggerimento per ridurre sia il carico sulle CLI esterne sia la frequenza di ri-render che alimentava indirettamente il bug dell'overlay sopra descritto:

- **On-demand**: nuovo effect in `App.tsx` che chiama `POST /api/library/refresh` ad ogni cambio reale di `activeStore` — la libreria viene ri-scansionata quando l'utente effettivamente apre/cambia store, non a intervalli fissi indipendenti da cosa sta guardando.
- **Timer di sicurezza**: il timer di background in `gameManager.ts` resta come rete di sicurezza per chi rimane fermo a lungo su una libreria, ma rilassato da 90 secondi a 5 minuti — non deve più essere aggressivo ora che il refresh primario è on-demand.

---

## v0.99.5 alpha — Fix tasto Y: la ricerca non si chiudeva più, dorsali store bloccati

### Bug risolto (`App.tsx`)

**Sintomo**: aprendo la ricerca con Y dal controller, la libreria si filtrava correttamente, ma la seconda pressione di Y non chiudeva nulla. Con la ricerca rimasta aperta, anche L1/R1 (cambio libreria) restavano sordi a qualunque pressione, e B non sembrava risolvere la situazione — l'unico modo per uscirne era aprire e richiudere il menu X-Launcher.

**Causa**: il gestore di Y introdotto in v0.99.4 era condizionato da `isJustPressed('Y') && activeGroup === null` — pensato per impedire l'apertura accidentale della ricerca mentre un altro overlay è aperto, ma con un effetto collaterale non considerato: **apertura la ricerca, `activeGroup` diventa `'keyboard'`**, quindi quella stessa guardia impediva anche a Y di richiamare `toggleSearch()` una seconda volta per chiudere. Y era diventato un tasto "solo apertura", mai chiusura. La guardia su L1/R1 (`if (activeGroup === null) { ... }`, corretta e voluta — cambiare libreria mentre si scrive nella ricerca non avrebbe senso) restava quindi bloccata di conseguenza, non per un bug proprio ma perché `activeGroup` non tornava più a `null` finché qualcos'altro non lo resettava per un altro percorso (da cui "apri e richiudi il menu" come unico sblocco).

**Fix**: condizione di Y corretta in `isJustPressed('Y') && (activeGroup === null || activeGroup === 'keyboard')` — toggle simmetrico:
- Nessun overlay attivo → Y apre la ricerca.
- L'overlay attivo è proprio quello della ricerca (aperta da Y stesso, `activeGroup === 'keyboard'`) → Y la chiude.
- Un overlay diverso occupa lo scope (Settings, Game Options, ecc.) → Y resta bloccato, nessuna interferenza.

**Regola di riferimento per il comportamento futuro**: Y è il toggle della ricerca, sempre — se la navigazione dashboard risulta bloccata dalla ricerca attiva, una pressione di Y deve sempre poter chiudere la lente e ripristinare il funzionamento normale, senza percorsi di sblocco alternativi necessari.

---

## v0.99.6 alpha — Risultati ricerca non navigabili da controller + priorità dei dorsali store

### Bug risolto — Risultati filtrati irraggiungibili dal controller (`App.tsx`)

**Sintomo**: con la ricerca attiva e la libreria filtrata, le card risultanti non erano navigabili con D-pad/stick finché non si chiudeva la ricerca — ma chiuderla resettava tutto, vanificando il filtro appena applicato.

**Causa**: `activeGroup = 'keyboard'` isola correttamente lo scope mentre si scrive sulla Virtual Keyboard (necessario: altrimenti D-pad scriverebbe lettere invece di navigare), ma il tasto "Fatto" della VK (`onClose`, caso ricerca) chiudeva solo `showKeyboard`, senza mai riportare `activeGroup` a `null`. La VK si chiudeva visivamente, ma lo scope restava bloccato su `'keyboard'` — un group ormai senza alcun `Focusable` montato dentro (la VK è smontata), quindi `moveFocus`/`triggerFocusedAction` non avevano più nulla su cui agire: la dashboard sottostante, con la libreria già correttamente filtrata nei dati, era semplicemente irraggiungibile dal controller.

**Fix**: "Fatto" sulla VK durante una ricerca ora riporta `activeGroup` a `null` e seleziona il primo risultato filtrato (`focusFirstInGroup('dashboard')`), lasciando `searchQuery`/`showSearch` intatti. L'utente può navigare, lanciare o aprire l'overlay su uno dei risultati; una successiva pressione di Y (già corretta in v0.99.5) chiude la ricerca quando l'utente ha finito.

### Novità — Priorità dei dorsali L1/R1 sulla navigazione fra store

**Regola stabilita**: se l'utente preme L1/R1, vuole guardare un'altra libreria — qualunque operazione interattiva in corso sulla dashboard corrente viene annullata automaticamente per dare spazio al cambio store, senza dover prima chiudere manualmente quell'overlay.

Distinzione tra due categorie di `activeGroup`, comportamento opposto:
- **Annullabili da L1/R1** (interrompono l'interazione con la libreria corrente): ricerca/Virtual Keyboard (`keyboard`), overlay Game Options (`game-options`), Avatar Library (`avatar-library`). L1/R1 li chiude esplicitamente e procede col cambio store.
- **Indipendenti, mai toccati da L1/R1** (processi che continuano a prescindere da quale libreria è visualizzata): menu X-Launcher (`quick-menu`), Settings (`settings`), Downloads (`downloads`), centro Notifiche (`notifications`). Un download/installazione in corso, o la configurazione di un account, non hanno alcuna relazione con "quale store sto guardando" — L1/R1 resta bloccato come prima, nessuna interferenza.

**Caso ambiguo gestito**: `activeGroup === 'keyboard'` può derivare sia dalla ricerca sia da un campo dell'overlay Game Options (es. `executablePath`), che usa la stessa VK condivisa. Distinto tramite `activeField`: se popolato, L1/R1 annulla l'intero overlay Game Options (altrimenti l'overlay resterebbe aperto e configurato su un gioco di uno store non più visualizzato); se vuoto, annulla solo la ricerca.

---

## v0.99.7 alpha — Regressione critica L1/R1 + focus iniziale post-ricerca sbagliato

### Bug risolto — L1/R1 completamente non responsivi, anche a dashboard appena caricata (`App.tsx`)

**Sintomo**: dopo il fix v0.99.6, L1/R1 non producevano più alcun effetto in nessuna condizione — né con un overlay annullabile attivo, né a dashboard appena caricata senza alcun overlay aperto.

**Causa**: `isJustPressed()` consuma il fronte di pressione alla prima lettura nel frame corrente (per design, vedi `useGamepad.ts`) — ritorna `true` una sola volta per pressione fisica, `false` ad ogni chiamata successiva finché il tasto non viene rilasciato e ripremuto. Il fix v0.99.6 chiamava `isJustPressed('L1')`/`isJustPressed('R1')` **due volte**: una nella condizione `if (isJustPressed('L1') || isJustPressed('R1'))` per decidere se annullare un overlay, e una seconda volta più sotto per `cycleStore`. La prima chiamata consumava il fronte; la seconda, sullo stesso frame, leggeva sempre `false` — `cycleStore` non veniva mai invocato, in nessuna condizione, perché il blocco veniva eseguito comunque (anche a `activeGroup === null`, dove la prima lettura avviene comunque dentro la stessa espressione).

**Fix**: L1/R1 letti una sola volta a testa (`const l1Pressed = isJustPressed('L1')`, idem per R1) e il valore booleano riusato sia per l'eventuale annullamento overlay sia per `cycleStore`.

### Bug risolto — Focus iniziale post-ricerca partiva dall'icona tastiera, non dalla prima card (`App.tsx`)

**Sintomo**: dopo aver filtrato la libreria e premuto "Fatto" sulla Virtual Keyboard, le card risultanti erano navigabili (fix v0.99.6 confermato), ma la selezione iniziale sembrava partire dall'ultima card a destra della prima riga invece che dalla prima a sinistra.

**Causa — diagnosi corretta dall'indicazione dell'utente**: non era un problema di timing o di scoring del DOM, ma una card "fantasma" nel pool. L'icona tastiera accanto al campo di ricerca (`btn-keyboard`) è un `Focusable` del group `dashboard` con `fallbackPriority` di default (0, identico alle card), ma geometricamente posizionata sopra l'intera griglia. Il fallback automatico (`pickBestFallback`, criterio "più in alto, poi più a sinistra") la selezionava sempre per prima, vincendo su qualunque card sottostante. Da lì, muovere lo stick verso il basso atterrava sul vicino direzionale più prossimo — la colonna più a destra della prima riga — percepito come "la selezione parte dall'ultima card a destra", quando in realtà partiva da un elemento sopra la griglia mai notato come tale.

**Fix**: `fallbackPriority={-1}` su `btn-keyboard`, stesso pattern già usato per i pulsanti di chiusura (es. `game-options-close`) — non più scelta come fallback automatico davanti a una card di contenuto reale, ma resta raggiungibile navigando manualmente verso l'alto.

---

## v0.99.8 alpha — Ricerca cross-store: niente più rollback allo store di partenza

### Novità (`App.tsx`)

**Workflow scoperto durante l'uso reale**: con L1/R1 che dalla v0.99.6 possono cambiare libreria mentre la ricerca resta attiva (annullandola solo se l'utente lo desidera esplicitamente — altrimenti il filtro persiste attraverso gli store), è emerso un comportamento utile non originariamente previsto: cercare un titolo di cui non si ricorda lo store, e scorrere con L1/R1 attraverso le librerie finché non risulta filtrato in una di esse. Più probabilità di trovarlo, senza dover riaprire la ricerca da capo in ogni store.

**L'unico inconveniente**: chiudendo la ricerca con Y dopo aver trovato il titolo in uno store diverso da quello di partenza (es. ricerca iniziata su GOG, titolo trovato su Epic), `toggleSearch()` eseguiva sempre `setActiveStore(previousActiveStore)` — riportando l'utente esattamente allo store di partenza (GOG, di nuovo con la libreria intera, senza filtro), vanificando la scoperta appena fatta.

**Fix**: rimosso il rollback automatico. Chiudere la ricerca (con Y, Escape, o "Fatto" su un campo) lascia ora lo store esattamente dov'è al momento della chiusura — qualunque libreria si stesse guardando in quel momento. Rimossi anche lo stato `previousActiveStore` e tutti i suoi punti di scrittura/lettura, ormai privi di scopo.

---

## v0.99.9 alpha — Modalità display "Borderless" per investigare l'input lag in kiosk

### Contesto

Osservazione dall'uso reale: la Dashboard risulta più reattiva (input lag minore sui comandi controller) in modalità finestra rispetto a schermo intero kiosk. Indagine sulla causa più probabile e introduzione di una terza modalità sperimentale per confrontare empiricamente.

**Causa più probabile identificata**: `kiosk-launch.sh` passa `--disable-gpu-compositing` a Chromium in **entrambi** i rami (kiosk e finestra) — di per sé non spiega la differenza. Il sospetto principale è invece la combinazione tra `--kiosk` e il compositor del window manager (xfwm4 su Arch/XFCE, ambiente noto del progetto): xfwm4 normalmente disabilita il proprio compositing per finestre fullscreen ("unredirect"), ma questo comportamento è documentato come non funzionante per finestre fullscreen che non siano "override redirect" (bug riportato su xfwm4 con SDL 1.3/2.0, stesso principio si applica potenzialmente a Chromium `--kiosk`). Se xfwm4 non fa l'unredirect per la finestra creata da `--kiosk`, il risultato è doppio compositing software sull'intera superficie schermo (Chromium con `--disable-gpu-compositing` + xfwm4), mentre in finestra l'area da comporre è minore e l'overhead pesa meno.

### Novità — Terza modalità display: Borderless (`appConfig.ts`, `kiosk-launch.sh`, `App.tsx`)

Aggiunta una modalità intermedia, sul modello del "borderless windowed" usato da molti giochi PC moderni per ottenere fluidità simile all'exclusive fullscreen senza i problemi di vero cambio di modalità:

- **`appConfig.ts`**: nuovo campo `displayMode: 'kiosk' | 'window' | 'borderless'`, che sostituisce concettualmente il vecchio booleano `fullscreen` (mantenuto per retrocompatibilità — derivato automaticamente da `displayMode` in lettura, scritto in parallelo per qualunque consumatore esterno che legga ancora la vecchia chiave).
- **`kiosk-launch.sh`**: legge `displayMode` (con fallback alla vecchia chiave `fullscreen` per `app.conf` di installazioni precedenti). Tre rami di avvio Chromium:
  - `kiosk` — comportamento storico, identico a prima (`--kiosk` + `--disable-gpu-compositing`).
  - `window` — comportamento storico della vecchia modalità "Off" (finestra normale ridimensionabile).
  - `borderless` — **nuovo**: nessun `--kiosk`, finestra `--app=` dimensionata e posizionata esattamente come la risoluzione dello schermo (rilevata con `xrandr`, fallback 1920×1080), risultando visivamente a tutto schermo senza il vero cambio di modalità X11. `--disable-gpu-compositing` deliberatamente **escluso** da questo ramo — è l'altra variabile sospetta, lasciarla fuori permette di isolare se è lei o `--kiosk` la causa principale dell'input lag, confrontando i tre modi sullo stesso hardware.
  - Su Firefox, `borderless` si comporta come `window` (nessun flag diretto equivalente senza un profilo `user.js` dedicato).
- **`App.tsx`**: il vecchio toggle booleano "Fullscreen" nel menu diventa "Display Mode", un ciclo a tre stati (Kiosk → Window → Borderless → Kiosk), stesso pattern già usato per "Toggle Theme". Scorciatoia `Alt+Enter` aggiornata di conseguenza.

**Nota**: come per il vecchio toggle, il cambiamento ha effetto solo al prossimo riavvio della Dashboard — Chromium non può cambiare modalità di finestra a runtime senza riavviare il processo.

---

## v0.99.10 alpha — Focus ereditato sull'icona tastiera + borderless realmente a tutto schermo

### Bug risolto — Focus su `btn-keyboard` ereditato cambiando libreria con ricerca attiva (`App.tsx`)

**Sintomo**: se una ricerca non produceva risultati in una libreria, l'icona tastiera nel campo di ricerca veniva selezionata (unico elemento disponibile nel pool). Cambiando libreria con L1/R1 mentre la ricerca restava attiva, quel focus poteva essere "ereditato": trovando card filtrate nella nuova libreria, muovere lo stick verso il basso atterrava sulla colonna più a destra della prima riga (il vicino direzionale più prossimo all'icona, posizionata sopra la griglia) invece che sulla prima card a sinistra.

**Causa**: il fix v0.99.7 (`fallbackPriority={-1}` su `btn-keyboard`) impediva la selezione automatica dell'icona **quando esistevano alternative**, ma con un pool a zero card filtrate l'icona resta l'unico elemento disponibile e viene comunque scelta — correttamente in quel momento isolato, ma quel focus non veniva mai ricorretto cambiando libreria, perché rimaneva un id "valido" nel nuovo pool.

**Fix — risolto alla radice, non solo aggiustata la priorità**: `btn-keyboard` non è più un `Focusable`. Y apre già la ricerca da controller (v0.99.4) — l'icona serve solo a chi ha aperto la ricerca dal mouse e vuole forzare la Virtual Keyboard in un secondo momento, stesso trattamento già dato alla lente di ricerca in v0.99.4. Nessun pool può più risultare "vuoto salvo l'icona", nessun focus da ereditare.

### Bug risolto — Modalità Borderless non realmente a tutto schermo, decoratore Chromium visibile (`kiosk-launch.sh`)

**Sintomo**: avviando in modalità Borderless (v0.99.9), la finestra risultava più grande del normale ma non a tutto schermo, con il decoratore di Chromium (barra del titolo, bordi) ancora visibile. Reattività comunque superiore rispetto al kiosk, confermando il sospetto sulla causa dell'input lag.

**Causa**: la v0.99.9 usava `--window-size=<risoluzione rilevata> --window-position=0,0` — flag che impostano dimensioni e posizione "richieste" di una finestra **normale**, non l'equivalente di una vera massimizzazione dal punto di vista del window manager. Solo il window manager decide se mostrare o no la decorazione, e la rimuove esclusivamente per finestre nello stato "maximized" reale (hint X11 `_NET_WM_STATE_MAXIMIZED_VERT`/`_HORZ` — lo stesso stato ottenuto cliccando il pulsante di massimizzazione nativo), non per una finestra normale dimensionata "per coincidenza" come lo schermo.

**Fix**: sostituito `--window-size`/`--window-position` con `--start-maximized`, che richiede esplicitamente questo stato a Chromium. Rimossi deliberatamente i due flag di dimensione/posizione: secondo report della community, `--start-maximized` può venire ignorato se combinato con essi (richieste contraddittorie — "dimensioni specifiche" vs "lascia decidere il WM"). Il rilevamento `xrandr` della risoluzione non serve più a questo ramo ma è stato lasciato nello script per eventuale uso futuro.

**Nota**: comportamento di `--start-maximized` in combinazione con `--app=` (modalità app, non finestra normale del browser) non è garantito al 100% identico su ogni versione Chromium/window manager — verificare su hardware reale dopo questa patch; potrebbe servire un ulteriore aggiustamento.

---

## v0.99.11 alpha — Borderless: decoratore CSD di Chromium, non del window manager

### Diagnosi confermata su hardware reale

Dopo il fix v0.99.10, il decoratore (barra del titolo "X-Launcher HTPC" con pulsanti min/max/chiudi nativi GTK) restava ancora visibile in modalità Borderless, nonostante `--start-maximized`. Causa identificata: per finestre in modalità `--app` (parente diretta delle PWA), **Chromium disegna la propria titlebar tramite CSD (client-side decoration)**, invece di lasciarla disegnare al window manager. Nessun flag che agisce "dal lato del window manager" (`--start-maximized`, `--window-state=maximized` — quest'ultimo testato dall'utente, non è nemmeno un flag CLI Chromium riconosciuto, nessun effetto) può rimuoverla, perché non è affatto xfwm4 a disegnarla: è Chromium stesso.

### Fix (`kiosk-launch.sh`)

Aggiunto `--use-system-title-bar` al ramo borderless — forza Chromium a delegare la decorazione al sistema (window manager) invece del proprio CSD. **Richiede un passaggio manuale una tantum**: la preferenza "Use system title bar and borders" deve essere impostata nel profilo Chromium stesso (`chrome://settings` → Aspetto), non è automatizzabile in modo affidabile da riga di comando su ogni versione/distribuzione — una volta impostata nel profilo, resta salvata e il flag fa il resto ad ogni avvio successivo.

---

## v0.99.12 alpha — Riprogettazione completa: niente più --kiosk reale, fullscreen via DOM al primo input

### Scoperta decisiva dall'uso reale

Dopo i fix v0.99.9-11 (tutti orientati a far funzionare `--start-maximized`/`--use-system-title-bar` per ottenere un borderless realmente senza decoratore), l'utente ha osservato un comportamento inatteso e più importante di qualunque fix precedente: **avviando la Dashboard in modalità finestra o borderless, e poi portandola a schermo intero a runtime tramite il browser stesso (non tramite `--kiosk` impostato all'avvio del processo), la reattività della modalità finestra viene mantenuta anche a schermo intero.**

Questo conferma e supera l'ipotesi originale (v0.99.9, xfwm4/unredirect compositing): il problema non è il fullscreen in sé — è specificamente **come `--kiosk` configura il processo Chromium fin dal suo avvio**, attivando un percorso di rendering/presentazione diverso da quello usato da una finestra normale, indipendentemente da come quella finestra viene successivamente dimensionata o massimizzata.

### Riprogettazione (`kiosk-launch.sh`, `App.tsx`)

**`kiosk-launch.sh` non lancia più Chromium/Firefox con `--kiosk` in NESSUNA modalità.** I rami `kiosk` e `borderless` sono stati unificati: identico avvio (`--app=`, `--start-maximized`, `--use-system-title-bar`, niente `--disable-gpu-compositing` — rimosso anche dal ramo `window`, nessun motivo di mantenerlo in nessuna modalità ora che è una causa nota di overhead). La sola differenza tra `kiosk` e `borderless` è demandata interamente al frontend.

**`App.tsx`** — nuova logica in `cycleDisplayMode` e un effect dedicato al boot:
- Se `displayMode === 'kiosk'`, un listener "una tantum" sul primo input gamepad o tastiera ricevuto dalla Dashboard richiama `document.documentElement.requestFullscreen()`. Il browser blocca la Fullscreen API se chiamata senza una gesture utente valida (protezione standard, non bypassabile in modo affidabile da riga di comando senza una policy enterprise dedicata — `AutomaticFullscreenAllowedForUrls`, fuori scope per un setup HTPC personale) — agganciare il primo input, non il mount del componente, garantisce che la richiesta avvenga sempre con una gesture valida, senza richiedere all'utente alcuna azione "in più" rispetto al normale uso (nel contesto HTPC, l'utente prende comunque in mano il controller entro pochi secondi dal boot).
- **Conseguenza pratica notevole**: dato che `kiosk` e `borderless` lanciano ora lo stesso identico processo Chromium, passare dall'uno all'altro **non richiede più alcun riavvio della Dashboard** — il click sul menu è già di per sé una gesture utente valida, quindi `cycleDisplayMode` può chiamare `requestFullscreen()`/`exitFullscreen()` immediatamente, con effetto istantaneo. Resta necessario un riavvio solo per passare da/a `window` (dimensioni di finestra decise da Chromium all'avvio) o se la Dashboard viene chiusa e riaperta in un secondo momento (kiosk-launch.sh legge comunque la preferenza persistita per partire nello stato giusto).

**Nota su `--use-system-title-bar`**: se il decoratore di xfwm4 dovesse restare visibile anche in stato massimizzato dopo il passaggio manuale nel profilo Chromium (v0.99.11), serve anche abilitare "Hide title of windows when maximized" in Window Manager Tweaks → Accessibility (impostazione xfwm4 stessa, non di Chromium) — non automatizzata da questo script perché è un'impostazione **globale** del desktop (si applicherebbe a tutte le finestre del sistema, non solo a X-Launcher), lasciata come scelta consapevole dell'utente.

---

## v0.99.13 alpha — Gestione automatica e temporanea di titleless_maximize (xfwm4)

### Contesto

Domanda dall'utente: l'impostazione xfwm4 `titleless_maximize` (necessaria per nascondere davvero il decoratore in modalità Borderless/Kiosk, complementare a `--use-system-title-bar`) è una proprietà **globale** del desktop — attivarla manualmente nasconderebbe la titlebar per *tutte* le finestre massimizzate del sistema, non solo per X-Launcher. Richiesta: poterla attivare solo durante l'uso della Dashboard e ripristinarla automaticamente alla chiusura, per non impattare il resto del desktop.

### Novità (`kiosk-launch.sh`)

Gestione automatica come "prestito temporaneo":
- **All'avvio** (solo rami Chromium `kiosk`/`borderless`, solo se `xfconf-query` è disponibile): il valore corrente di `titleless_maximize` viene letto e salvato, poi forzato a `true` per la durata della sessione.
- **Alla chiusura**, qualunque sia la causa (uscita pulita dal menu X-Launcher, Alt+F4 dell'utente, crash del browser, interruzione dello script con Ctrl+C): il valore originale viene ripristinato.
- Per intercettare la chiusura anche nei casi non puliti, lo script non termina più con `exec` per Chromium in modalità `kiosk`/`borderless` (che sostituirebbe il processo bash, impedendo qualunque codice successivo) — Chromium viene avviato in background e lo script attende la sua terminazione con `wait`, eseguendo il ripristino subito dopo tramite un handler registrato con `trap ... EXIT`. La modalità `window` e Firefox continuano a usare `exec` come prima, non necessitando di questa gestione.

---

## v0.99.14 alpha — Nascondi temporaneamente i pannelli XFCE in modalità Borderless/Kiosk

### Bug osservato — Pannello XFCE in primo piano sopra la Dashboard borderless

Dal test reale del fix v0.99.13: con `titleless_maximize=true`, la decorazione (titlebar) scompare correttamente, ma il pannello XFCE in alto resta visivamente sopra la Dashboard, "disturbando" lo spazio disponibile. Le altre finestre del desktop, inoltre, non perdevano la propria decorazione — comportamento atteso: xfwm4 applica `titleless_maximize` solo al momento in cui una finestra *transita* verso lo stato massimizzato, non retroattivamente a finestre già aperte in quello stato.

**Causa del pannello in primo piano**: anche con `titleless_maximize=true`, xfwm4 massimizza la finestra fino ai bordi *fisici* dello schermo (ignorando lo spazio che il pannello normalmente riserva), ma il pannello è gestito come layer separato, sempre sopra le finestre normali a prescindere da come queste sono dimensionate — comportamento documentato della community XFCE, non un bug del fix.

### Novità (`kiosk-launch.sh`)

Stesso pattern del "prestito temporaneo" già usato per `titleless_maximize` (v0.99.13), estendendolo ai pannelli `xfce4-panel`:
- All'avvio (rami Chromium `kiosk`/`borderless`), tutti i pannelli configurati vengono enumerati dinamicamente (channel `/panels`, gestendo correttamente un numero variabile di pannelli — alcuni setup XFCE hanno un pannello superiore e una dock separata in basso, con ID non garantiti partire da 0 o 1 secondo la distribuzione) e il valore corrente di `autohide-behavior` di ciascuno viene salvato e impostato a `2` (sempre nascosto).
- Alla chiusura, qualunque sia la causa, ogni pannello viene ripristinato al proprio valore originale — stesso handler `trap ... EXIT` già usato per `titleless_maximize`.
- Risponde alla domanda dell'utente: se questa combinazione (titlebar nascosta + pannelli nascosti, entrambi temporanei e ripristinati alla chiusura) funziona in modo stabile, la modalità Borderless può diventare la modalità fullscreen di riferimento, eliminando la necessità di indagare ulteriormente altri desktop environment.

---

## v0.99.15 alpha — Fix: i pannelli XFCE non venivano affatto rilevati

### Bug risolto — `XFCE_PANEL_IDS` risultava sempre vuoto (`kiosk-launch.sh`)

**Sintomo**: dopo il fix v0.99.14, in modalità Borderless il pannello XFCE in alto restava comunque visibile sopra la Dashboard — "non cambiava nulla".

**Causa — confermata dall'output reale dell'utente**: il pattern di estrazione degli ID pannello (`grep -oE '/panels/panel-[0-9]+$'`, che cerca righe terminanti esattamente con `panel-N`) non trovava **mai** corrispondenze, perché il formato reale di `xfconf-query -c xfce4-panel -p /panels -l` elenca solo le **sotto-property** di ciascun pannello (es. `/panels/panel-1/icon-size`, `/panels/panel-2/autohide-behavior`), non una riga "bare" `/panels/panel-1`. Risultato: `XFCE_PANEL_IDS` restava vuoto, il ciclo di nascondimento non eseguiva nulla per nessun pannello, e il bug sembrava "non aver funzionato" quando in realtà non aveva nemmeno provato a girare.

**Causa secondaria, anch'essa confermata dall'output reale**: l'utente aveva pannelli con ID `1` e `2` (non `0`/`1` come negli esempi della community usati per scrivere il fix v0.99.14), e — più rilevante — `panel-1` **non aveva affatto** la property `autohide-behavior` tra le sue property esistenti (`xfconf-query -p /panels/panel-0/autohide-behavior` falliva con "la proprietà non esiste sul canale" anche testato manualmente dall'utente su un ID diverso). Senza il flag `--create`/`-n` e un tipo esplicito (`-t uint`), `xfconf-query` rifiuta di scrivere una property inesistente — e l'errore veniva mascherato dal redirect `2>/dev/null` già presente per non sporcare l'output, facendo apparire il comando come "eseguito silenziosamente con successo" quando in realtà falliva.

**Fix**:
- Pattern di estrazione corretto: cerca `panel-N` seguito da uno slash (sotto-property), non a fine riga.
- Aggiunto `-n -t uint` a entrambe le scritture (impostazione temporanea e ripristino), per gestire correttamente i pannelli su cui `autohide-behavior` non è ancora mai stata impostata esplicitamente.

Verificato con un test isolato che riproduce esattamente l'output reale fornito dall'utente (due pannelli, ID 1 e 2, uno dei due senza `autohide-behavior` tra le proprie property) — il nuovo pattern estrae correttamente entrambi gli ID.

---

## v0.99.16 alpha — Menu semplificato a due opzioni, Borderless nascosta

### Contesto

Confermato su hardware reale (v0.99.9-15): la modalità Borderless dà una reattività ottima, equivalente alla finestra normale. Richiesta dell'utente: tenere solo "Window" e "Fullscreen" visibili nel menu — dove "Fullscreen" è ormai `displayMode='kiosk'` (avvio borderless + auto-fullscreen del DOM al primo input, non più il vecchio `--kiosk` reale abbandonato in v0.99.12) — mantenendo `borderless` come stato a sé disponibile ma nascosto, riattivabile al bisogno.

### Novità (`App.tsx`)

- **`applyDisplayMode`**: logica comune di applicazione (persistenza su `app.conf`, notifica, gestione fullscreen del DOM) estratta in una funzione condivisa, per non duplicarla tra il percorso visibile e quello nascosto.
- **`cycleDisplayMode`** (menu, `Alt+Enter`): ora cicla **solo** tra `window` e `kiosk` — due stati, non più tre. Label del menu semplificata a "Window"/"Fullscreen".
- **`activateHiddenBorderlessMode`** (nuova, **nessuna voce di menu**): attiva `displayMode='borderless'` — raggiungibile solo tramite la nuova scorciatoia **Ctrl+Alt+B**, non documentata nell'interfaccia. Utile per debug o come preferenza avanzata di chi vuole restare in finestra massimizzata senza il passaggio automatico a schermo intero che "Fullscreen" applica al primo input.

Nessuna modifica a `kiosk-launch.sh`: il backend continua a leggere e gestire tutti e tre i valori di `displayMode` esattamente come prima — la semplificazione riguarda solo l'esposizione nel menu, non il meccanismo sottostante.

---

## v0.99.17 alpha — Chiarito il ruolo di Fullscreen API: solo riserva per l'avvio a freddo

### Chiarimento dall'utente

Domanda: a cosa serve ancora il meccanismo di auto-`requestFullscreen()` al primo input, se Borderless con titlebar e pannelli XFCE nascosti è già visivamente e funzionalmente equivalente a schermo intero? Risposta: serve solo per il caso di avvio "a freddo" (Dashboard lanciata da script con `displayMode` già persistito su 'kiosk' da una sessione precedente, nessuna gesture utente ancora avvenuta) — nei cambi di modalità fatti dal menu o da scorciatoia, il click/tasto stesso è già la gesture valida, quindi il meccanismo "al primo input" non scatta mai in quel caso (resta solo ridondante, non dannoso). Deciso di mantenerlo comunque come riserva tecnica, anche se borderless puro dà già lo stesso risultato visivo nella pratica.

### Novità (`App.tsx`)

Sostituita la scorciatoia nascosta Ctrl+Alt+B (v0.99.16, attivava direttamente `borderless` senza mai renderlo visibile nel menu) con un **toggle di visibilità**:
- **Ctrl+Alt+K**: prima pressione, inserisce una terza voce "Kiosk" (= `displayMode='borderless'`, borderless puro senza il tentativo di Fullscreen API) nel ciclo del menu visibile — `cycleDisplayMode` passa da un ciclo a 2 stati (Window/Fullscreen) a uno a 3 (Window/Fullscreen/Kiosk). Seconda pressione: la voce viene rimossa di nuovo — se era quella attualmente selezionata, si ricade automaticamente su "Fullscreen", così la Dashboard non resta mai in uno stato non più raggiungibile dal menu.
- Nuovo stato `kioskOptionVisible`, **solo in memoria** (mai persistito su `app.conf`): resta sempre `false` ad ogni avvio fresco della Dashboard, coerente con la sua natura di opzione di debug/avanzata, non una preferenza stabile da ricordare tra sessioni.

---

## v0.99.18 alpha — Rimosso del tutto requestFullscreen: popup browser ad ogni avvio senza beneficio

### Bug osservato — Popup "Modalità schermo intero" del browser ad ogni avvio in Borderless

**Sintomo**: con titlebar e pannelli XFCE già nascosti (v0.99.13-15), la finestra in modalità Fullscreen/Kiosk è già visivamente indistinguibile da un vero schermo intero — ma al primo input del controller, il meccanismo introdotto in v0.99.12 chiamava comunque `requestFullscreen()`, che il browser concede con successo (nessun cambiamento visivo apprezzabile, la finestra è già massimizzata) ma mostra comunque il proprio popup informativo standard ("È entrato in modalità schermo intero, premi Esc per uscire") — un fastidio reale ripetuto ad ogni singolo avvio dell'HTPC, senza alcun beneficio.

**Fix**: rimosso del tutto il meccanismo di auto-`requestFullscreen()` al primo input (i due `useEffect` dedicati) e ogni chiamata a `requestFullscreen()`/`exitFullscreen()` in `applyDisplayMode`. `displayMode='kiosk'` ("Fullscreen" in UI) e `displayMode='borderless'` ("Kiosk" in UI, dietro Ctrl+Alt+K) sono ora **identici** a livello di comportamento del frontend — entrambi avviano semplicemente in modalità borderless con titlebar e pannelli XFCE nascosti (`kiosk-launch.sh` li gestisce già nello stesso modo), restano distinti solo come etichetta/preferenza persistita.

**Nota**: la distinzione fra le due voci nel menu (Ctrl+Alt+K per rendere visibile "Kiosk") resta comunque utile come riserva — se in futuro emergesse un caso reale in cui la vera Fullscreen API tornasse necessaria (es. monitor con risoluzione non rilevata correttamente da `xrandr`, o un browser/DE diverso che gestisce peggio il borderless), la struttura per riattivarla in modo selettivo è già pronta, semplicemente non più collegata a nessuna chiamata effettiva per ora.

---

## v0.99.19 alpha — Cursore visibile e bug navigazione: regressioni scoperte dopo l'abbandono di --kiosk

### Contesto

Conseguenza non considerata dell'abbandono del vero `--kiosk` (v0.99.12): Chromium in modalità kiosk reale nasconde automaticamente il cursore del mouse dopo un periodo di inattività — comportamento integrato, perso passando a Borderless. Due sintomi distinti riportati dall'utente dopo un test approfondito su hardware reale:

### Bug risolto — Cursore mouse sempre visibile in Borderless/Kiosk

**Fix (`App.tsx`)**: nuovo stato `cursorHidden`, applicato come classe `cursor-none` (Tailwind) all'elemento radice quando l'ultimo input registrato proviene dal gamepad (`gamepadState.buttons.size > 0`), ripristinato (`cursor: auto`) al primo vero movimento del mouse fisico (`mousemove`). Deliberatamente non un timer di inattività: in un HTPC l'utente può restare fermo a guardare la libreria per minuti con il controller in mano senza premere nulla, e un timer rimostrerebbe il cursore per errore in quel caso.

### Bug risolto — Navigazione controller "risale e poi torna giù" verso la posizione del cursore (`FocusProvider.tsx`)

**Sintomo**: navigando dall'alto verso il basso (barra librerie, footer comandi, tab Manage Account, overlay) con D-pad/stick, la risalita si blocca e la selezione "torna giù" più o meno nell'area dove si trova il cursore del mouse, anche se l'utente sta usando solo il controller.

**Causa**: il browser genera un evento nativo `mouseenter` reale ogni volta che un elemento *diverso* finisce per trovarsi sotto le coordinate del cursore — anche se il cursore fisico non si è mai mosso, semplicemente perché il layout/lo scroll hanno spostato un nuovo elemento sotto di lui. Il gestore esistente (`handleMouseEnter` in `Focusable`, introdotto per sincronizzare il focus visivo con l'hover reale del mouse) interpretava **qualunque** `mouseenter` come "l'utente ha mosso il mouse qui", rubando il focus dal controller. In modalità `--kiosk` reale questo bug era già presente in teoria, ma mascherato dal fatto che il cursore non era mai visivamente presente sullo schermo (nascosto automaticamente da Chromium) — gli eventi `mouseenter` continuavano comunque a essere generati (nascondere il cursore via CSS o tramite il comportamento nativo di Chromium non disabilita il tracking degli eventi), ma il problema passava inosservato perché non c'era un cursore visibile a suggerire "perché la selezione si comporta così".

**Fix**: nuovo listener globale `mousemove` nel `FocusProvider`, che traccia l'ultima posizione *reale* nota del cursore (`lastRealMousePos`). `handleMouseEnter` confronta le coordinate dell'evento ricevuto con quella posizione — se coincidono esattamente, il mouse fisico non si è mosso da lì: l'evento è "passivo" (causato dal layout, non da un vero movimento dell'utente) e viene ignorato. Esposto tramite il context come `isStaleMouseEnter(x, y)`, utilizzabile da qualunque `Focusable`.

**Nota**: i due fix sono complementari, non alternativi — nascondere il cursore via CSS non impedisce al browser di generare comunque eventi `mouseenter` nativi sulle sue coordinate (un cursore invisibile resta comunque "presente" agli occhi del sistema), quindi il fix di `FocusProvider.tsx` resta necessario anche con il cursore nascosto.

---

## v0.99.20 alpha — Il gamepad non funziona finché la finestra non ha il focus del window manager

### Bug osservato — Il cursore non si nasconde muovendo solo il joystick

**Sintomo riportato dall'utente**: in modalità Borderless, il cursore non interferisce più con la navigazione (fix v0.99.19), ma sparisce solo se l'utente fa prima un click su un'area non interattiva della Dashboard e poi inizia a usare il controller. Semplicemente muovendo lo stick senza prima un click, il cursore resta visibile.

**Causa — confermata da specifica W3C e documentazione**: senza `--kiosk` reale (abbandonato in v0.99.12), Chromium non riceve più automaticamente il focus della **finestra** (a livello di window manager/X11 — distinto dal focus interno React/JS che gestiamo nel codice) all'avvio. Senza quel focus, il browser non recapita **alcun dato del gamepad** alla pagina: è una misura anti-fingerprinting standard della Gamepad API — la specifica richiede esplicitamente una "gamepad user gesture" (pressione di un tasto o movimento di un asse) *mentre la pagina ha il focus* prima che `navigator.getGamepads()` ritorni dati utilizzabili. Non un bug nostro: un click reale del mouse sulla finestra le dà finalmente il focus a livello di sistema, e da quel momento il gamepad funziona normalmente — coerente esattamente con quanto osservato.

**Fix (`kiosk-launch.sh`)**: nuova funzione `focus_dashboard_window`, eseguita in background subito dopo l'avvio del browser (in tutti i rami — Chromium kiosk/borderless/window, Firefox): attende che la finestra appaia (polling `wmctrl -a` sul titolo "X-Launcher HTPC", più affidabile della classe WM, che Chromium deriva dinamicamente dall'URL in modalità `--app` e quindi non è prevedibile in modo fisso) e ne forza il focus, equivalente programmatico del click che l'utente farebbe manualmente. Richiede il pacchetto `wmctrl` (non preinstallato di default su Arch, va aggiunto con `pacman -S wmctrl`) — se assente, lo script lo segnala chiaramente e continua comunque, semplicemente senza automatizzare questo passaggio (l'utente dovrà fare un click manuale come accadeva prima di questo fix).

**Nota tecnica**: per eseguire `focus_dashboard_window` dopo l'avvio del browser, anche i rami che ancora usavano `exec` (Firefox, e la modalità `window` di Chromium) sono stati convertiti allo stesso pattern background+`wait` già introdotto in v0.99.13 per kiosk/borderless — il problema del focus del gamepad non è specifico di una modalità, si applica a qualunque finestra browser che non abbia ricevuto il focus del window manager all'avvio.

---

## v0.99.21 alpha — Fix: wmctrl riportava successo prima che Chromium fosse davvero pronto

### Bug risolto — Il fix v0.99.20 non funzionava nonostante il log riportasse successo

**Sintomo**: il log conferma regolarmente `[KIOSK] Focus della finestra forzato.`, ma la finestra non passava davvero in primo piano e il gamepad non sbloccava il cursore — finché l'utente non rilanciava manualmente lo stesso identico comando `wmctrl -a "X-Launcher HTPC"`, che a quel punto funzionava.

**Causa, confermata dall'analisi del log e dai test diagnostici dell'utente**: il loop di `focus_dashboard_window` si fermava al **primo** successo apparente di `wmctrl -a` — che ritorna codice 0 semplicemente se trova una finestra con quel titolo ed esegue la richiesta XSend di attivazione, indipendentemente dal fatto che il processo Chromium sia realmente pronto ad onorarla. Nell'istante in cui il primo tentativo girava (subito dopo l'avvio del processo), la finestra X11 esisteva già abbastanza da essere trovata per titolo, ma Chromium non aveva ancora completato l'inizializzazione necessaria per accettare realmente il focus — una finestra "in costruzione". `wmctrl` non ha modo di saperlo e riporta comunque successo, perché dal suo punto di vista ha trovato la finestra e inviato la richiesta.

**Fix (`kiosk-launch.sh`)**: `focus_dashboard_window` ora attende un secondo iniziale, poi ripete `wmctrl -a` più volte nel tempo (15 tentativi ogni 0.3s, ~4.5s totali) **anche dopo un successo apparente**, invece di fermarsi al primo. L'ultimo tentativo, eseguito quando Chromium è quasi certamente già pronto, ha probabilità realistica di funzionare davvero.

**Nota**: ripetere `wmctrl -a` più volte nei primi secondi può riportare forzatamente la Dashboard in primo piano se l'utente, in quella stessa finestra di tempo, passa rapidamente ad un'altra applicazione (es. Alt-Tab) — compromesso accettabile per un avvio HTPC, dove l'utente normalmente non interagisce con altro nei primi istanti dopo aver lanciato la Dashboard.

**Nota dal test successivo**: il fix non ha risolto completamente il problema secondo un ulteriore giro di test — indagine diagnostica in corso (build v0.99.22, non distribuita come release standard).

---

## v0.99.23 alpha — GOG: distinzione tra login API valido e cookie web scaduti

### Contesto

Segnalazione dell'utente: la card Manage Account mostra l'account GOG connesso (127 titoli sincronizzati), ma la libreria reale risulta vuota (0 titoli) — logout/login da terminale sembrano aggiornare correttamente lo stato della card, ma il problema persiste sullo scan reale. Sospetto iniziale di una regressione del plugin.

### Diagnosi — comportamento noto e documentato di `lgogdownloader`, non una regressione

`lgogdownloader` usa **due meccanismi di autenticazione separati**: un token OAuth dell'API (verificato da `--check-login-status`, il comando usato dalla card Manage Account) e i cookie di sessione del sito web (necessari specificamente per `--list`, il comando usato per leggere la libreria reale). Questi due meccanismi possono desincronizzarsi — il login API resta valido mentre i cookie del sito scadono o si invalidano indipendentemente, riportato anche da altri utenti di `lgogdownloader` in scenari identici (`--update-check` funziona, basandosi solo sull'API, mentre `--list` fallisce). Questo spiega perfettamente il sintomo: la card legge correttamente lo stato API, mentre lo scan reale (che dipende anche dai cookie web) continua a fallire.

### Novità (`gogPlugin.ts`)

`getLibrary()` ora distingue i due casi quando `--list` non restituisce titoli, invece di un unico messaggio generico che suggerisce sempre "fai il login" anche quando l'utente è già autenticato:
- **Login API ancora valido** (verificato con `isAuthenticated()`/`--check-login-status`): messaggio specifico che identifica il problema come probabile scadenza dei cookie di sessione del sito, con un suggerimento pratico (rifare `lgogdownloader --login` per intero, senza altre sessioni GOG attive in un browser nello stesso momento; se persiste, azzerare la cache di `lgogdownloader` prima di un nuovo login).
- **Login API non valido**: messaggio originale, invariato.

---

## v0.99.24 alpha — GOG: --list richiede un argomento esplicito nelle versioni recenti

### Causa reale, confermata da test diretto da terminale

Il sospetto sui cookie web (v0.99.23) era plausibile ma **non era la causa effettiva** — confermato testando direttamente `lgogdownloader --list --no-color` da terminale (anche dopo aver azzerato completamente cache e credenziali e rifatto il login da zero): il comando stampa solo le righe di progresso ("Getting product data 2/2", "Getting game names 129/129", confermando 129 titoli effettivamente recuperati) e **torna al prompt senza mai stampare l'elenco testuale dei titoli**.

Causa reale: le versioni recenti di `lgogdownloader` hanno cambiato `--list` da flag booleano puro (come nelle versioni 2.x/3.0 più vecchie, dove bastava `--list` da solo) a un comando che richiede un **argomento esplicito** per specificare cosa elencare (`games`/`g`, `details`/`d`, `json`/`j`, `tags`/`t` — visibile nella documentazione aggiornata di `lgogdownloader`, non in quella delle versioni più vecchie). Senza l'argomento, il programma esegue comunque il fetch dei dati (da cui le righe di progresso, identiche con o senza argomento) ma non emette l'elenco testuale, perché non sa in quale formato presentarlo — comportamento indistinguibile da "nessun titolo trovato" se non si controlla l'output con attenzione.

### Fix (`gogPlugin.ts`)

`getLibraryFromLgog()` ora chiama `lgogdownloader --list games --no-color` invece di `--list --no-color`. Il parsing dell'output esistente (filtro righe "Getting"/"Loaded"/"Error", poi uno slug per riga) era già corretto per questo formato — la regressione era specificamente nel comando passato, probabilmente introdotta in una sessione di sviluppo precedente non documentata in questo changelog, non nella logica di parsing o di autenticazione.

---

## v0.99.27 alpha — GOG: causa reale era stderr, non l'argomento di --list

### Causa definitiva, confermata da test diretto e inequivocabile

Il fix v0.99.24 (aggiungere l'argomento esplicito `games` a `--list`) non risolveva il problema — verificato dall'utente testando manualmente `--list`, `--list games`, `--list g`, tutti con lo stesso identico comportamento. L'output completo di `--help` (versione 3.18) ha confermato che `--list` ha già `games` come default (`[=arg(=games)]`), quindi l'argomento non era mai stato il problema.

Test diagnostico risolutivo, eseguito direttamente dall'utente:
- `lgogdownloader --list games 2>/dev/null` (scarta stderr) → **nessun output**, niente di niente.
- `lgogdownloader --list games 1>/dev/null` (scarta stdout) → mostra le righe di progresso.

Conclusione inequivocabile: `lgogdownloader` scrive **tutto** il suo output — progresso e, quasi certamente, l'elenco vero dei titoli — su **stderr**, non su stdout. Il codice del plugin (`stdio: ['ignore', 'pipe', 'ignore']`) scartava esplicitamente stderr fin dall'inizio — il nostro codice non ha mai potuto vedere l'output reale del programma, indipendentemente da quale argomento veniva passato a `--list`. Le ipotesi precedenti (v0.99.23: cookie/sessione web; v0.99.24: sintassi dell'argomento) erano entrambe plausibili sulla carta ma sbagliate nella pratica — questa è la prima causa verificata con un test diretto, non dedotta da documentazione generica.

### Fix (`gogPlugin.ts`)

`stdio` cambiato da `['ignore', 'pipe', 'ignore']` a `['ignore', 'pipe', 'pipe']` — stderr ora catturato. Lo stesso handler di parsing (`onData`) è registrato su entrambi `proc.stdout` e `proc.stderr`, con un buffer condiviso: il parsing riga per riga resta corretto indipendentemente da quale dei due stream produce ciascuna riga, senza bisogno di sapere con certezza se l'intero output sia su stderr o distribuito diversamente tra i due canali a seconda della versione/configurazione di `lgogdownloader`.

---

## v0.99.28 alpha — Cursore: timer di inattività invece di inseguire il focus della finestra

### Conferma definitiva dal test reale: always-on-top non risolve il focus dell'input

Test dell'utente con la finestra impostata always-on-top (`wmctrl -b add,above`, v0.99.25): la Dashboard resta visivamente sempre in primo piano, ma il cursore continua a restare visibile e il gamepad non viene recepito finché non avviene un'interazione esplicita (click sulla finestra, o Alt+Tab) — identico al comportamento osservato prima di quel fix. Questo conferma in modo definitivo, dopo numerosi tentativi (v0.99.20-25), che il problema non è mai stato di visibilità/posizione della finestra a livello di window manager (`above`/`raise`) — è specificamente il **focus dell'input** a livello di sistema, un concetto distinto che richiede un'interazione utente esplicita per essere acquisito, indipendentemente da quanto "sopra" sia posizionata la finestra.

### Cambio di strategia (`App.tsx`)

Dato che tenere la Dashboard sempre in primo piano sul desktop è scomodo nella pratica (impedisce di usare terminale o altre applicazioni in parallelo) e il cursore visibile non interferisce più con la navigazione da controller (fix `isStaleMouseEnter`, v0.99.19), la soluzione proposta dall'utente è la più proporzionata: un **timer di inattività del mouse**, indipendente dal focus della finestra e dal gamepad.

- Rimosso il trigger basato su `gamepadState.buttons.size > 0` — dipendeva indirettamente dal focus della finestra (senza focus, il loop che alimenta `gamepadState` non si popola in modo affidabile), quindi scattava solo dopo che l'utente aveva già dato focus manualmente: nessun vantaggio reale rispetto a prima.
- Nuovo timer (`CURSOR_IDLE_MS = 3000`): il cursore si nasconde 3 secondi dopo l'ultimo movimento reale del mouse, e ricompare immediatamente al primo movimento successivo — comportamento standard di qualunque kiosk/presentazione a schermo intero, completamente indipendente da focus della finestra o stato del gamepad.

---

## v0.99.29 alpha — Fix: cursor-none sul div radice non vinceva sui cursor specifici dei figli

### Bug risolto — Il cursore non si nascondeva affatto dopo il timer (`App.tsx`, `index.css`)

**Sintomo**: nonostante il timer di inattività (v0.99.28) scattasse correttamente, il cursore restava comunque visibile — segnalato dall'utente come "forse manca qualche libreria di sistema" (non era questo il caso: nessuna dipendenza esterna coinvolta, solo CSS/JS del browser).

**Causa**: la classe Tailwind `cursor-none` veniva applicata solo al `<div>` radice dell'app. Se il cursore si trova fisicamente sopra un qualunque elemento figlio con un proprio `cursor` esplicito — `cursor-pointer` su card della libreria, bottoni, icone, presente ovunque nel codice — quella regola più specifica vince sempre su quella del genitore più esterno, indipendentemente da dove nell'albero React la classe condizionale viene applicata: è una normale conseguenza della cascata CSS, non un bug del timer in sé (che infatti scattava correttamente).

**Fix**: nuova regola globale in `index.css` — `.cursor-hidden-global, .cursor-hidden-global * { cursor: none !important; }` — applicata con `!important` sul selettore universale, che forza `cursor: none` su **qualsiasi** discendente dell'elemento con quella classe, qualunque cursore quell'elemento dichiari altrimenti. `App.tsx` aggiornato per usare `cursor-hidden-global` al posto del semplice `cursor-none` di Tailwind — nessuna modifica necessaria ai singoli elementi con `cursor-pointer` sparsi nel codice.

---

## v0.99.30 alpha — Always-on-top diventa opzionale (--always-on-top)

### Contesto

Confermato dal test reale (v0.99.28) che `wmctrl -b add,above` non risolve il problema del focus dell'input — la finestra resta sempre sopra ma cursore/gamepad restano "spenti" finché non avviene un'interazione esplicita. Tenerla sempre attiva ha quindi solo lo svantaggio (non poter usare il desktop in parallelo senza prima disattivarla) senza il beneficio che si sperava. Su richiesta dell'utente, reso opzionale.

### Novità (`kiosk-launch.sh`)

Nuovo flag da riga di comando `--always-on-top` (default: **disattivato**). Quando assente, `focus_dashboard_window()` esegue solo l'attivazione iniziale (`wmctrl -a`, utile e senza controindicazioni note) senza marcare la finestra come persistentemente "sopra le altre" — la Dashboard si comporta come una finestra normale, completamente compatibile con l'uso parallelo del desktop. Quando presente, ripristina il comportamento già esistente (`wmctrl -r ... -b add,above`).

Documentazione dell'opzione aggiunta nell'intestazione dello script. Nota per l'utente: un eventuale switch on/off direttamente nel menu Display Mode della Dashboard, per comodità senza dover modificare la riga di comando ad ogni avvio, resta da valutare in una patch successiva.

---

## v0.99.26 alpha — Sessione X11 dedicata: il focus non è più un problema per costruzione

### Contesto

Dopo diversi tentativi di forzare il focus della finestra Chromium tramite `wmctrl` (v0.99.20-25, nessuno risolutivo secondo i test reali — il dato diagnostico mostrava `_NET_ACTIVE_WINDOW` già corretto fin dal primo tentativo, suggerendo una causa più profonda nel browser stesso o nella piattaforma), proposta dell'utente: se il vero problema è la *competizione* per il focus con altri elementi della sessione XFCE (pannelli, terminale, altre finestre), la soluzione strutturale è eliminare quella competizione — far girare X-Launcher come **sessione X11 dedicata**, selezionabile dal menu sessioni di LightDM, separata dalla sessione XFCE che resta disponibile in parallelo.

### Novità

**`x-launcher.desktop`** (nuovo file, da installare in `/usr/share/xsessions/`): voce di sessione LightDM che lancia direttamente `kiosk-launch.sh` come comando dell'intera sessione — nessun window manager, nessun pannello, X-Launcher è l'unico client connesso al display. Selezionabile dal menu a tendina della schermata di login, con autenticazione normale (nessun autologin per ora, su scelta esplicita).

**`kiosk-launch.sh`**: rilevamento automatico del contesto (presenza di `xfwm4` in esecuzione) tramite `X_LAUNCHER_DEDICATED_SESSION`, esportata come variabile d'ambiente e propagata al daemon Node. Quando true:
- `maybe_enable_xfwm4_titleless()` e `focus_dashboard_window()` ritornano immediatamente — non esiste xfwm4 da configurare né competizione per il focus da risolvere, dato che non c'è nessun altro elemento della sessione con cui Chromium debba contendersi schermo/input.
- Chromium può semplicemente occupare tutto lo schermo, perché è l'unico client.

**`server.ts`**: `GET /api/config` espone ora anche `dedicatedSession` (letto da `process.env.X_LAUNCHER_DEDICATED_SESSION`, non persistito — dipende dal contesto della sessione corrente, non da una preferenza salvata). Nuovo endpoint `POST /api/system/switch-session`, che richiama `dm-tool switch-to-user <username> <sessione-target>` — il meccanismo nativo di LightDM per il cambio sessione (lo stesso usato da "Switch User"): se la sessione target è già autenticata, ci si torna direttamente senza richiedere nuova password; altrimenti viene mostrato il greeter di login. Il nome della sessione XFCE target è configurabile con `X_LAUNCHER_DESKTOP_SESSION` (default `xfce`).

**`App.tsx`**: quando `dedicatedSession` è true, la voce "Display Mode" nel menu (che cicla Window/Fullscreen/Kiosk — privi di senso senza un desktop sotto cui mostrare una finestra) viene sostituita da "Console Mode" → "Torna al Desktop", che chiama il nuovo endpoint per tornare alla sessione XFCE. X-Launcher resta in esecuzione in background sulla propria sessione — nessuna chiusura, esattamente come "Switch User" lascerebbe intatta la sessione precedente.

**Nota**: per il passaggio simmetrico da XFCE verso X-Launcher, resta da definire uno script o una scorciatoia equivalente lato desktop — non ancora implementato in questa patch.

---

## v0.99.31 alpha — GOG: il vero fix finale, --no-platform-detection (verificato con output completo)

### Causa residua dopo v0.99.27

Anche dopo aver corretto la cattura di stderr (v0.99.27), il warning persisteva identico — confermato dall'utente dopo build e riavvio completi. Lo stesso identico sintomo da terminale (`--list games`, con o senza redirect): solo le righe di progresso, mai l'elenco. Trovato un workaround documentato dalla community Arch (pagina AUR di `lgogdownloader-git`, che referenzia l'issue upstream #313): *"se lgogdownloader restituisce una lista vuota di giochi, aggiungi l'argomento `--no-platform-detection`"* — corretto in una revisione successiva (3.18.r21) ma evidentemente non presente nella build 3.18 stabile installata.

### Verifica diretta e conferma definitiva

Testato dall'utente da terminale: `lgogdownloader --list games --no-platform-detection` stampa finalmente l'elenco completo dei 129 titoli (slug uno per riga, alcuni con suffisso `[N]` per edizioni/duplicati — es. `amnesia_a_machine_for_pigs [1]`). Verificato che il parsing esistente (`parseSlug`, `slugToTitle`) già gestiva correttamente questo formato con una regex dedicata (`\s*\[\d+\]\s*$`) — nessuna modifica necessaria lì, era già corretto da prima.

### Fix (`gogPlugin.ts`)

Aggiunto `--no-platform-detection` al comando spawnato. Applicato incondizionatamente (non solo come fallback su lista vuota): anche se la build installata avesse già la fix upstream, il flag non ha effetti collaterali negativi noti — solo un rilevamento della piattaforma più lento ma più accurato, secondo la documentazione stessa dell'opzione.

---

## v0.99.32 alpha — Sessione X11 dedicata: installazione globale, Steam silenzioso, card Big Picture

### Contesto

Ripresa e formalizzazione del lavoro sulla sessione X11 dedicata (v0.99.26): installazione standardizzata, niente più path utente hardcoded, e una prima integrazione concreta con Steam — verificare la libreria (già possibile, lettura diretta dei file `.acf`), lanciare i giochi senza la UI completa di Steam, e passare a Steam Big Picture dalla Dashboard.

### A — Installazione globale (`install.sh`, nuovo)

`/opt` è la posizione corretta secondo il Filesystem Hierarchy Standard per software auto-contenuto non pacchettizzato dal package manager della distribuzione (FHS 3.0 §3.13: "add-on application software packages"). Nuovo script `install.sh` (richiede `sudo`): copia il progetto in `/opt/x-launcher` (rsync con fallback a `cp -r`), crea il symlink `/usr/local/bin/x-launcher` → `kiosk-launch.sh`, installa la sessione LightDM in `/usr/share/xsessions/`. Supporta `--uninstall`. **Resta opzionale**: il progetto continua a funzionare identico lanciato direttamente dalla propria cartella, come oggi — nessuna installazione di sistema richiesta per il normale utilizzo o per testare le nuove funzionalità in user-space.

`x-launcher.desktop` corretto: puntava a un path hardcoded nella home dell'utente (`/home/daniele/Progetto Dashboard/...`), ora punta a `/opt/x-launcher/session-launch.sh` — necessario perché LightDM legge questo file prima ancora che un utente sia autenticato, quindi richiede strutturalmente un path assoluto fisso (l'unico punto del progetto dove ciò è inevitabile). Verificato che tutto il resto del backend (`appConfig.ts`, `db.ts`, `logger.ts`, tutti i plugin) già usa `homedir()` correttamente — nessun altro path utente hardcoded da correggere.

`xdash.service` aggiornato: `WorkingDirectory=/opt/x-launcher` come default, resta da sostituire solo `User=TUOUTENTE` (non più anche il path del progetto) — il nome utente non può essere "globale" per natura, ogni utente ha le proprie impostazioni in `~/.local/share/x-launcher`.

### B — Sessione dedicata: Steam silenzioso (`session-launch.sh`, nuovo)

Nuovo wrapper, punto di ingresso della sessione LightDM dedicata (sostituisce la versione precedente solo abbozzata): avvia `steam -silent` in background (se Steam è installato e non già in esecuzione) prima di procedere con `kiosk-launch.sh` come sempre. `-silent` è un flag documentato di Steam — il client non mostra alcuna finestra della UI principale, ma resta disponibile come handler per `steam://rungameid/<id>` e per la sincronizzazione della libreria. Senza questo passo preliminare, il primo lancio di un gioco Steam dalla libreria X-Launcher in sessione dedicata avrebbe aperto l'intero client con la sua interfaccia completa — esattamente la "doppia dashboard sovrapposta" che la sessione dedicata vuole evitare. Funziona sia da `/opt/x-launcher` sia dalla cartella di sviluppo (stesso pattern di auto-rilevamento del path di `kiosk-launch.sh`).

### C — Card "Steam Big Picture" sempre in libreria (`types.ts`, `App.tsx`, `server.ts`)

Nuovo campo `Game.isBigPictureLauncher` e funzione `appendSteamBigPictureCard()`: inietta una card speciale, **solo lato frontend** (mai persistita nel DB, mai restituita da `gameManager.getGames()`), nello store Steam/All — sempre presente, anche con libreria Steam reale vuota o il plugin disabilitato, perché il suo scopo non è "lanciare un gioco posseduto" ma offrire un modo nativo di passare a Steam Big Picture dalla Dashboard. Posizionata in coda all'elenco filtrato (non compete con la prima card reale per il fallback del focus, v0.99.4), resta raggiungibile dalla ricerca testuale come un vero elemento.

`handlePlay` e `openGameOptions` intercettano l'id speciale prima della normale ricerca in `gamesRef` (che non conterrebbe mai questa pseudo-card, causando altrimenti un ritorno silenzioso senza alcuna azione) — qualunque interazione con la card (Invio, click, X, click destro) esegue la stessa identica azione: passa a Big Picture, nessun overlay di configurazione winetricks/env vars ha senso per una card che non è un gioco installabile.

Nuovo endpoint `POST /api/system/steam-bigpicture`: esegue `steam steam://open/bigpicture`, che porta in primo piano Steam in modalità Big Picture se già in esecuzione (caso tipico in sessione dedicata, dove `-silent` lo ha già avviato) o lo apre direttamente in quella modalità se non attivo.

**Asset grafico attuale**: SVG placeholder inline in stile Steam (logo stilizzato, palette colore Steam), in attesa dell'integrazione D (artwork dedicata per X-Launcher come Non-Steam Game in Steam, ancora da implementare).

### Non ancora implementato in questa patch (v0.99.32)

**D — X-Launcher come Non-Steam Game in Steam**, con artwork dedicata (grid/hero/logo), così da Big Picture si possa tornare a X-Launcher trattandolo come un titolo qualunque della libreria Steam. Richiede generazione dell'AppID secondo l'algoritmo usato da Steam, scrittura/patch del file binario `shortcuts.vdf`, e gli asset grafici nella cartella `grid/` con la nomenclatura corretta (`<appid>.png`, `<appid>_hero.png`, `<appid>_logo.png`, `<appid>p.png`).

---

## Sessione X11 dedicata: diagnosi del fallimento di avvio (debug, nessuna release numerata)

### Sintomo

Dopo l'installazione con `install.sh` e la selezione della sessione "X-Launcher" dal menu LightDM, il sistema torna comunque alla sessione XFCE normale — confermato da `~/.xsession-errors` (log di `xfce4-session` con timestamp coincidente col tentativo).

### Tentativi diagnostici eseguiti, in ordine

1. **Permessi del file `.desktop`**: verificato che tutti gli script in `/opt/x-launcher` (incluso `session-launch.sh`) avessero correttamente il bit eseguibile — confermato `-rwxr-xr-x` su tutti. Non era la causa.
2. **Log diagnostico dedicato**: aggiunto temporaneamente a `session-launch.sh` un blocco che scrive timestamp, utente, variabili d'ambiente (`DISPLAY`, `HOME`, `PATH`, ecc.) in `/tmp/x-launcher-session-debug.log` ad ogni esecuzione. **Risultato inequivocabile: il file non viene mai scritto da un vero tentativo di login LightDM** — solo da test manuali dell'utente (riconoscibili dal path relativo nell'argv). Questo conferma con certezza che LightDM non esegue mai lo script — il problema è nel meccanismo di lancio della sessione, non nello script stesso (che funziona perfettamente se eseguito manualmente).
3. **Validazione del file `.desktop`** con `desktop-file-validate`: ha segnalato un warning su `DesktopNames` (richiederebbe prefisso `X-` secondo la specifica più vecchia) — verificato essere un **falso allarme**: lo stesso campo, senza prefisso, è usato identico nei file `.desktop` reali e funzionanti di `xfce.desktop`/`i3.desktop` su sistemi in produzione. Non era la causa.
4. **Permessi del bit eseguibile sul file `.desktop` stesso**: trovato e corretto un problema reale (`xlauncher.desktop` risultava `-rwxr-xr-x` invece di `-rw-r--r--`, probabilmente per un `chmod +x` applicato per errore insieme agli script `.sh` della stessa patch) — corretto con `chmod 644`, ma il problema di avvio è persistito anche dopo la correzione.
5. **Rinomina del file/identificatore sessione** da `x-launcher` a `xlauncher` (per escludere un'ipotesi, debole, su un possibile problema di parsing del trattino) — il file diagnostico ha continuato a non essere scritto da un vero tentativo di login. Esclusa anche questa ipotesi.

### Stato attuale: causa non isolata con certezza

Confermato con certezza che il problema è nel meccanismo con cui LightDM interpreta `~/.dmrc` (che salva correttamente `Session=x-launcher`) insieme al file in `/usr/share/xsessions/`, non nello script in sé (verificato funzionante se eseguito manualmente) né nei suoi permessi (verificati corretti). La diagnosi proposta ma non eseguita per mancanza di tempo nella sessione di lavoro: avviare LightDM con `--debug --test-mode` per ottenere il log verboso del comando esatto che tenta di eseguire al momento della selezione sessione — unico strumento rimasto che darebbe una risposta definitiva.

**Conclusione onesta**: la sessione X11 dedicata via LightDM **non funziona ancora** sul sistema di test reale, nonostante il codice di `session-launch.sh`/`kiosk-launch.sh` sia stato verificato corretto e funzionante quando eseguito direttamente. Il problema risiede nell'integrazione con LightDM stesso, non ancora isolato con certezza. **Tutto il resto del progetto (modalità Borderless/Kiosk sopra XFCE, tutti i fix di navigazione, GOG, Steam Big Picture card, ecc.) resta pienamente funzionante e non impattato da questo problema** — è una funzionalità aggiuntiva opzionale, non ha toccato il flusso principale già verificato.

---

## v0.99.34 alpha — Parte D completata: X-Launcher come Non-Steam Game, con artwork

### Limite reale confermato (issue ufficiale Valve, non un problema di progettazione)

Verificato tramite ricerca diretta nelle issue ufficiali (`ValveSoftware/steam-for-linux` #9463 e #8580): l'AppID "canonico" di uno shortcut non-Steam (scritto in `shortcuts.vdf`, usato per l'artwork) resta calcolabile in modo deterministico con CRC32 — generato e scritto correttamente da questo progetto. Il **BPID** (l'id specifico richiesto per `steam://rungameid/<BPID>`, necessario per un lancio "programmatico" dall'esterno di Steam) **non è più prevedibile a priori** nelle versioni recenti del client Steam su Linux — Steam lo assegna in modo casuale al momento dell'aggiunta dello shortcut, leggibile solo dopo averlo lanciato almeno una volta da dentro Steam (`screenshots.vdf`). Conseguenza pratica: la card "X-Launcher" in Big Picture va cliccata manualmente per lanciarla, come qualunque altro Non-Steam Game — non è possibile generare un link/pulsante precompilato per richiamarla dall'esterno.

### Novità (`scripts/setup-steam-shortcut.cjs`, nuovo)

Script standalone Node.js (CommonJS, non TypeScript — eseguito una tantum da riga di comando, non parte del daemon persistente), eseguibile sia in user-space dalla cartella di sviluppo sia da `/opt/x-launcher` dopo l'installazione globale:

- **Rilevamento SteamID**: legge `~/.steam/steam/config/loginusers.vdf` (testo, KeyValues), trova il blocco con `MostRecent=1` (l'ultimo utente loggato — coerente con la sessione `steam -silent` avviata da `session-launch.sh`), deriva la cartella `userdata/<ShortUserID>` con `LongUserID & 0xFFFFFFFF` (stesso metodo usato da `steamtinkerlaunch`).
- **AppID canonico**: `CRC32('"' + exePath + '"' + appName) | 0x80000000`, formula confermata da più fonti indipendenti (steamgrid/Ice, UWPHook, Steam-Shortcut-Manager).
- **Writer binario VDF minimale**: implementazione diretta della specifica (`0x00` mappa, `0x01` stringa, `0x02` intero LE a 32 bit, `0x08` fine mappa) — **verificata con un parser di controllo scritto appositamente per il test**, non solo assunta corretta dalla teoria. Un primo bug reale (la mappa radice del file non ha un proprio type-byte, scritto invece per errore in una prima versione) è stato trovato e corretto esattamente grazie a questo test, con un file generato che il parser di verifica rifiutava con un errore di byte inatteso.
- **Preservazione di shortcut esistenti**: se `shortcuts.vdf` esiste già con altri Non-Steam Game, vengono preservati intatti e la nuova entry X-Launcher viene aggiunta in coda — verificato con un secondo test che simula un file con uno shortcut preesistente, confermando che né l'entry originale né la nuova vengono corrotte.
- **Idempotenza**: se uno shortcut con lo stesso `AppName` esiste già (es. da un'esecuzione precedente di questo stesso script), non viene duplicato.

### Novità — Asset grafici (`assets/steam-grid/`, nuovo)

Quattro asset PNG alle dimensioni esatte richieste da Steam per la cartella `grid/`: `boxart.png` (600×900), `hero.png` (3840×1240), `logo.png` (1280×720, RGBA con trasparenza), `capsule.png` (600×350) — design coerente con l'identità visiva di X-Launcher (palette blu/scuro, badge "X", stesso stile della card Steam Big Picture). Generati con Pillow (l'ambiente di build non aveva `rsvg-convert` disponibile per convertire gli `.svg` sorgente, conservati nella stessa cartella per manutenzione futura con un convertitore SVG disponibile).

### Aggiornamenti

`install.sh` aggiunge un messaggio informativo sull'integrazione Steam opzionale (`node scripts/setup-steam-shortcut.cjs`), separata dal flusso di installazione principale — non eseguita automaticamente, perché richiede che l'utente abbia già autenticato Steam almeno una volta.

`appVersion` nel menu X-Launcher e `metadata.json` aggiornati a `0.99.34-alpha`, coerentemente con la milestone pacchettizzata in questa sessione di lavoro.

---

## v0.99.35 alpha — xdash.service: avvio al boot, indipendente dal login

### Contesto

Domanda dell'utente durante il lavoro sulla sessione X11 dedicata (v0.99.26, ancora irrisolta): oltre al WM/compositor (Gamescope, già nel ramo "CASO 1" di `kiosk-launch.sh`), serve che il server Node sia già caricato prima che la sessione grafica parta? Risposta: sì — `xdash.service` esisteva già nel repo ma non era collegato a nessun avvio automatico, ed era comunque configurato su un target sbagliato per questo scopo specifico.

### Modifiche (`xdash.service`)

- **Target cambiato da `graphical-session.target` a `multi-user.target`**: il primo è un target *per-utente*, attivato da systemd-logind solo dopo un login riuscito — esattamente la condizione che la diagnosi v0.99.26 non riesce a raggiungere con la sessione dedicata. Il secondo è un target di *sistema*, raggiunto al boot indipendentemente da qualunque login, grafico o non grafico. Effetto pratico: il daemon è già in ascolto su `:3000` prima che LightDM mostri anche solo la schermata di login, sia che poi si scelga la sessione XFCE sia quella dedicata.
- **`After=`/`Wants=` ridotti al solo `network-online.target`**: rimossa la dipendenza da `graphical-session.target`, ora incoerente con il nuovo target di destinazione.
- **Nota added su `DISPLAY`/`XDG_RUNTIME_DIR`**: questi valori restano "tipici" per la prima sessione utente locale, ma con `multi-user.target` il servizio parte strutturalmente prima che un X server esista. Nessun impatto sulle route HTTP/SQLite del daemon; impatto reale solo se il daemon stesso invoca `wine`/`winetricks` prima che una sessione grafica su quel `DISPLAY` sia attiva — non risolto in questa modifica, segnalato esplicitamente nei commenti del file come problema distinto da affrontare se e quando si manifesta.

### Modifiche (`kiosk-launch.sh`)

- Messaggio di log del fallback di avvio daemon (quando `/api/status` non risponde) riformulato per chiarire esplicitamente che, con `xdash.service` installato e attivo, questo ramo non dovrebbe mai eseguire — se compare comunque, è il segnale che il servizio systemd non è partito correttamente, da verificare con `systemctl status xdash`/`journalctl -u xdash` prima di guardare altrove.

### Non risolto in questa modifica

La diagnosi v0.99.26 sul perché LightDM non esegue affatto `session-launch.sh` resta aperta — questa modifica rimuove la dipendenza dal login per la disponibilità del daemon, ma non tocca il problema di lancio della sessione stessa. Prossimo passo proposto resta `lightdm --debug --test-mode`.

---

## v0.99.35 alpha (continua) — Fix blocco wineboot su prompt Mono + disinstallazione bloccata su installazioni incomplete

### Contesto

Tentativo di installazione Epic (Soulstice) bloccato durante la creazione della wineprefix; log daemon mostra `Error: wine timeout dopo 120s`. Rimuovendo manualmente i file della prefix, la card del gioco nell'overlay continuava a risultare "installato" anche dopo `uninstall`.

### Causa 1 — `wineboot --init` in timeout sul prompt grafico Mono/Gecko

Confermato con fonti esterne (WineHQ forum, ArchWiki, Winetricks issue tracker): `wineboot --init` su una prefix nuova mostra di default un prompt grafico "Install Wine Mono?"/Gecko quando rileva l'assenza del runtime .NET integrato. In un contesto daemon/headless quel prompt non riceve mai un click umano — il processo resta bloccato fino allo scadere di `WINEBOOT_TIMEOUT_MS` (120s), esattamente il sintomo osservato. Non era un problema di `wine`/`winetricks` mancanti (verificato: entrambi presenti in `/usr/bin`, `PATH` del processo `xdash.service` confermato via `/proc/<pid>/environ`) né del verb `mono` di winetricks (il progetto non gestisce `mono` come verb — il prompt è nativo di `wineboot`, non di winetricks).

**Fix** (`downloadManager.ts`, flussi GOG ed Epic): aggiunto `WINEDLLOVERRIDES: 'mscoree,mshtml='` come variabile d'ambiente passata a `wine wineboot --init`. Questo disabilita il prompt e crea la prefix senza mono/gecko integrati — se un gioco li richiede davvero, vanno installati successivamente via winetricks (verb dedicato), non lasciati al prompt interattivo di `wineboot`.

### Causa 2 — `uninstallGame()` rifiutava la pulizia di installazioni incomplete

`gameManager.uninstallGame()` ritornava `{ success: false, message: 'Gioco non installato' }` se `game.isInstalled === false` — condizione che si verifica esattamente per un'installazione interrotta dalla Causa 1 (mai arrivata a impostare `isInstalled: true`), lasciando però file/prefix orfani sul disco. L'utente vedeva l'opzione "Disinstalla" nell'overlay, la usava, e il backend rifiutava silenziosamente prima di raggiungere il codice di rimozione file/aggiornamento DB.

**Fix** (`gameManager.ts`): `uninstallGame()` ora procede alla pulizia file anche con `isInstalled === false`, a patto che esista una cartella reale su disco per quello store. Il rifiuto resta solo per il caso genuinamente vuoto (non installato E nessun file trovato).

### Causa 3 (concorrente) — il frontend ignorava l'esito della chiamata uninstall

`App.tsx`, gestore conferma disinstallazione: `await fetch(.../uninstall, { method: 'DELETE' })` senza leggere la risposta. Anche un rifiuto esplicito del backend (Causa 2, prima del fix) passava inosservato — il pannello si chiudeva comunque, dando l'impressione di successo.

**Fix**: la risposta viene ora letta (`res.json()`) e, se `success !== true`, viene mostrata una notifica di errore tramite `pushNotification()` con il messaggio reale del backend, invece di fallire silenziosamente.

### Non toccato in questa modifica

`epicPlugin.uninstallGame()`/`steamPlugin.uninstallGame()` (interfaccia a livello di plugin, distinta dalla funzione corretta sopra) non risultano nel percorso chiamato dalla route reale (`server.ts:488` chiama `gameManager.uninstallGame()` direttamente) — `epicPlugin.uninstallGame()` in particolare appare un placeholder che non esegue mai `legendary uninstall` realmente. Annotato per eventuale verifica futura, fuori scope per il bug segnalato oggi.

---


## v0.99.35 alpha (continua, correzione) — La vera causa del timeout wineboot: `close` vs `exit` su processi con sotto-servizi

### Contesto

Il fix `WINEDLLOVERRIDES` (sezione precedente) non ha risolto il timeout — riprodotto identico con la build aggiornata. Diagnosi approfondita con test manuali isolati dal daemon.

### Test eseguiti

`wine wineboot --init` lanciato a mano da terminale, con `WINEDEBUG=+service`, sia su una prefix nuova (`~/test-wine-nuova`) sia sulla prefix Soulstice reale (quella che andava in timeout nel daemon): **in entrambi i casi il comando termina pulito da solo** in pochi secondi, log che si conclude con `services.exe exited with code 0`. Questo esclude sia un problema di Wine sulla macchina sia una prefix corrotta — il comando, di per sé, funziona.

### Causa reale

`spawnWithTimeout()` (`downloadManager.ts`) usava l'evento `'close'` del `ChildProcess` Node per decidere quando il processo è terminato. A differenza di `'exit'`, `'close'` aspetta che **tutti** gli stream stdio del processo siano chiusi — incluse le copie dei file descriptor ereditate da eventuali sotto-processi. Il log con `WINEDEBUG=+service` mostra che `wineboot` lancia `services.exe` e, per ogni servizio whitelisted (es. `winedevice` per driver emulati), ulteriori processi figli separati che condividono gli fd ereditati dal padre. Se anche uno solo di questi processi di servizio resta vivo un istante più a lungo del processo `wine` diretto — comportamento normale per `wineserver`/processi di servizio Wine, che spesso restano residenti in background — l'evento `'close'` non scatta mai sul lato Node, e il timeout di sicurezza interviene sempre dopo `WINEBOOT_TIMEOUT_MS`, anche quando il lavoro effettivo è già completato con successo (coerente con l'osservazione iniziale: la prefix risultava sempre popolata correttamente nonostante l'errore di timeout riportato).

### Fix (`downloadManager.ts`, `spawnWithTimeout`)

Sostituito `proc.on('close', ...)` con `proc.on('exit', ...)`. `'exit'` si attiva non appena il processo diretto (`wine`) termina, indipendentemente dallo stato dei file descriptor ereditati da eventuali sotto-processi sopravvissuti — comportamento corretto per un processo come `wineboot` che delega lavoro a sotto-servizi non sincroni con la sua terminazione.

### Non toccato

`spawnWithProgress()` (stessa cartella, usata per `lgogdownloader`/`legendary`/`innoextract`) ha lo stesso pattern `'close'`, **lasciato invariato**: a differenza di `spawnWithTimeout`, qui lo stdout/stderr viene letto attivamente per il parsing del progresso — passare a `'exit'` rischierebbe di troncare l'ultima porzione di output di progresso non ancora arrivata al momento della terminazione del processo diretto. Inoltre questi binari sono processi singoli, senza il pattern di sotto-servizi di `wineboot` — il rischio del bug isolato qui non si applica nello stesso modo. Da rivalutare solo se si osserva un sintomo analogo con questi binari specifici.

## v0.99.35 alpha (continua) — Card Epic "sfarfallante" tra installato/rimosso dopo uninstall

### Sintomo

Dopo aver disinstallato un gioco Epic (file e prefix effettivamente rimossi dal disco, confermato), la card nell'overlay alternava casualmente tra "rimosso" e "installato" a seconda di quando la si controllava — non un semplice ritardo di un fetch, ma uno stato genuinamente incoerente nel tempo.

### Causa

`syncExternalInstallStates()` (chiamata a ogni `refreshLibrary()`, inclusi i trigger automatici dei watcher Steam/ROM con debounce) determina lo stato "installato" per Epic Games leggendo `legendary list-installed --json` — non il filesystem, a differenza del controllo equivalente per GOG. Il fix precedente di `uninstallGame()` rimuoveva i file e aggiornava il DB di X-Launcher, ma non diceva mai a `legendary` di disinstallare: il suo database interno continuava a considerare il gioco installato. Al primo `refreshLibrary()` successivo — anche minuti dopo, da un trigger indipendente — `syncExternalInstallStates()` rileggeva `legendary list-installed`, lo trovava ancora presente, e **rimetteva `isInstalled: true`**, contraddicendo quanto appena scritto da `uninstallGame()`. Due fonti di verità (DB X-Launcher vs database `legendary`) in disaccordo, non un problema di timing di un singolo fetch — un re-fetch più aggressivo avrebbe solo reso lo sfarfallio più frequente, non risolto la causa.

### Fix (`gameManager.ts`, `uninstallGame`)

Per `Epic Games`, prima della rimozione file: `legendary --yes uninstall <appName> --keep-files`. Il flag `--keep-files` (confermato via `legendary uninstall --help` sul sistema reale) rimuove il gioco dal database di Legendary **senza** toccare i file — la cancellazione fisica resta gestita subito dopo dal codice esistente (`rmSync`), che ha già la logica corretta per cartelle parziali/mancanti. `-y`/`--yes` è un flag **globale** di legendary (va prima del sottocomando, non dopo) — verificato sull'help reale per evitare un secondo bug di sintassi silenzioso identico nello spirito a quello appena risolto. Fallimento di questa chiamata non è trattato come fatale (es. gioco mai arrivato a installazione completa, legendary non lo conosce): loggato, la pulizia file prosegue comunque.

## v0.99.35 alpha (continua) — winetricksVerbs non coerente tra lancio diretto da card e overlay

### Sintomo / domanda dell'utente

L'installazione lanciata direttamente da una card (senza passare prima dall'overlay opzioni per quel gioco) terrebbe conto dei verbs winetricks configurati, o partirebbe con valori di default/sbagliati?

### Causa confermata

`winetricksVerbs` (stato React) viene popolato dal DB solo dentro un `useEffect` con guardia `if (!showGameOptions || !selectedGame) return` — cioè solo all'apertura dell'overlay opzioni per uno specifico gioco. Il lancio diretto da card (`handlePlay`) e il bottone "Installa" dentro l'overlay convergono nello stesso `pendingAction`/stessa chiamata `/api/downloads/start`, ma quella chiamata leggeva `winetricksVerbs` dallo stato React condiviso — se l'utente non aveva mai aperto l'overlay per QUEL gioco in questa sessione (o aveva aperto l'overlay di un gioco diverso subito prima), i verbs inviati al backend erano quelli residui dell'ultimo gioco esplorato nell'overlay, o i default, non necessariamente quelli salvati per il gioco realmente in installazione.

### Fix (`App.tsx`, conferma `pendingAction.type === 'install'`)

Prima di chiamare `/api/downloads/start`, si rilegge sempre `GET /api/games/:id/compat` per `action.gameId` (il gioco effettivamente in conferma) — stessa fonte e stesso fallback ai default già usati dal `useEffect` dell'overlay. I due percorsi (card diretta vs overlay) sono ora garantiti a inviare sempre gli stessi verbs salvati per quel gioco specifico, indipendentemente da quale overlay sia stato aperto in precedenza nella sessione.

## v0.99.35 alpha (continua) — Regola di progetto: diagnostica integrata nella console di debug, non console.log temporaneo

### Decisione

Da ora in avanti, ogni funzione che lancia processi esterni critici (wine/winetricks/legendary/lgogdownloader/ecc.) o gestisce logica a rischio di fallimento silenzioso integra logging diagnostico tramite il sistema di log esistente (`this.log()` → `writeLog()` → `LogPanel.tsx`/console di debug della dashboard), non `console.log` temporaneo da rimuovere a mano dopo. Motivazione pratica: durante la diagnosi del timeout wineboot di questa sessione, il primo logging diagnostico era stato scritto come `console.log` puro, visibile solo nel terminale da cui si lancia `./build.sh start` — invisibile a chi guarda solo la dashboard, e da eliminare manualmente una volta risolto il problema. Con la dashboard che cresce in complessità, ogni nuovo punto di fallimento deve lasciare una traccia osservabile dall'interfaccia stessa.

### Modifica (`downloadManager.ts`, `spawnWithTimeout`)

Firma aggiornata per accettare `task: DownloadTask` come primo parametro (tutte le 5 chiamate esistenti aggiornate di conseguenza — wineboot GOG/Epic, winetricks GOG/Epic, innoextract). Il logging diagnostico introdotto per isolare il bug del timeout (PID del processo, timestamp di ogni evento, snapshot `ps` dei processi ancora vivi al momento del timeout) resta **permanente**, integrato via `this.log()` invece che `console.log` — visibile nella console di debug della dashboard per qualsiasi futura diagnosi su questi step, non solo per il bug di oggi.

## v0.99.35 alpha (continua) — Switch overlay "Disabilita sync NT veloce" (WINE_DISABLE_FAST_SYNC)

### Contesto diagnostico

Logging diagnostico (vedi sezione precedente) ha isolato con certezza la causa del timeout su Soulstice: il processo `wineboot --init`, lanciato dal daemon, resta genuinamente bloccato (non zombie, non un problema di eventi Node) dentro la syscall kernel `ntsync_schedule` — il driver `ntsync` (Linux 6.14+, sincronizzazione NT in kernel-space per Wine/Proton) non viene mai notificato per liberare l'attesa. Lo stesso comando lanciato a mano da terminale non presenta il problema — causa esatta della differenza non isolata con certezza (sospetto: interazione specifica wineserver/ntsync legata al contesto daemon, da confermare). Workaround noto e documentato (Frogging-Family/wine-tkg-git #936): `WINE_DISABLE_FAST_SYNC=1` disabilita ntsync, facendo ricadere Wine sul meccanismo di sincronizzazione precedente (esync/fsync/server).

### Implementazione

Anziché applicare il workaround in modo permanente e invisibile (rischio: nasconde il problema reale, e disabilitare ntsync ha un costo prestazionale per i giochi che ne beneficiano), introdotto come **opzione manuale per-gioco**, attivabile dall'utente solo se necessario:

- **Schema** (`types.ts`, `db.ts`): nuovo campo `disableWineSync` su `CompatibilityProfile`, persistito come colonna `disable_wine_sync` in `compat_profiles` (migrazione automatica su DB esistenti, stesso pattern già usato per `eac`/`battleye`).
- **Backend** (`downloadManager.ts`): `spawnWithTimeout` inietta `WINE_DISABLE_FAST_SYNC=1` nell'ambiente quando `task.disableWineSync` è true — solo per i binari `wine`/`winetricks`, non per `innoextract`/`legendary` dove non avrebbe effetto. `addTask()` e la route `POST /api/downloads/start` aggiornate per propagare il valore dal profilo salvato.
- **Frontend** (`App.tsx`): switch nell'overlay opzioni gioco, visibile solo per GOG/Epic e solo quando il gioco non è ancora installato (riguarda esclusivamente la fase di creazione prefix/dipendenze). Persistito immediatamente al toggle, stesso pattern dei verb winetricks. Nota esplicativa in chiaro per l'utente su quando attivarlo. La conferma installazione rilegge il valore dal DB al momento della conferma (stessa logica già corretta per `winetricksVerbs`), garantendo coerenza sia lanciando dalla card sia dall'overlay.

### Non risolto

La causa esatta della differenza terminale-vs-daemon resta da confermare con certezza (richiederebbe bisect su versioni kernel/wine o un confronto più approfondito dell'ambiente di esecuzione). Questa modifica fornisce una via d'uscita pratica e mirata, non chiude la diagnosi sottostante.

## v0.99.35 alpha (continua) — Systray: input controller filtrato dalla dashboard durante il gioco

### Sintomo segnalato dall'utente

Durante una sessione di gioco (Machinarium), l'input del controller ha continuato a raggiungere la dashboard sottostante (mai chiusa, solo coperta visivamente dalla finestra del gioco), causando navigazione casuale nel menu e installazione non richiesta di due runner Proton-GE — l'utente non se ne è accorto perché impegnato col gioco in primo piano. Confermato dal log della sessione.

### Causa

Il Gamepad API di Chromium (a differenza di Firefox, che blocca esplicitamente il polling in finestre/tab in background) continua a processare l'input anche quando la finestra è semplicemente coperta da un'altra — si ferma solo quando `document.hidden` diventa vero, condizione che si verifica solo con una minimizzazione/nascondimento esplicito via window manager, non con una semplice sovrapposizione di finestre. Nessun meccanismo esistente nel progetto minimizzava la dashboard al lancio di un gioco.

### Soluzione implementata: systray + pausa gamepad su visibilitychange

Quattro componenti:

1. **`gameManager.ts`** — tracking dell'ultimo gioco lanciato (`lastLaunchedGame`), con `isLastLaunchedGameRunning()` che verifica via `process.kill(pid, 0)` se il processo (lanciato `detached`/`unref()`, quindi non osservabile con un normale evento `exit` di Node) è ancora vivo.
2. **`server.ts`** — nuova route `GET /api/system/game-running`, esposta per il polling esterno dello script systray.
3. **`tray.py`** (nuovo file, root del progetto) — script Python standalone con `pystray`, mostra un'icona persistente nella systray XFCE (già attiva e funzionante sul sistema target, nessuna configurazione plugin pannello necessaria). Polling ogni 2s su `/api/system/game-running`: nasconde automaticamente la finestra Chromium (`wmctrl -r ... -b add,hidden`) quando un gioco tracciato è in esecuzione, la ripristina alla chiusura. Click manuale sull'icona/menu per mostrare/nascondere indipendentemente dallo stato del gioco. Dipendenze (`pystray`, `pillow`, binding GTK via `python-gobject`/`gtk3`, già presenti sul sistema target) installate in un virtualenv dedicato `.venv-tray` con `--system-site-packages` (necessario: i binding `gi`/GTK sono pacchetti di sistema via `pacman`, non visibili da un venv isolato senza questo flag).
4. **`useGamepad.ts`** — listener su `visibilitychange`: ferma il loop `requestAnimationFrame` del polling gamepad quando `document.hidden` è vero, lo riavvia quando torna falso. Questa è la metà che effettivamente impedisce all'input di raggiungere la dashboard — il systray si occupa solo di rendere vero `document.hidden` nel momento giusto.
5. **`kiosk-launch.sh`** — lancia `tray.py` (dal venv dedicato) in background dopo che il daemon Node è confermato pronto, solo se `.venv-tray` esiste — non blocca l'avvio della dashboard se il systray non è stato configurato.

### Installazione richiesta (manuale, non automatizzata da install.sh in questa modifica)

```bash
cd x-launcher
python3 -m venv --system-site-packages .venv-tray
source .venv-tray/bin/activate
pip install pystray pillow
deactivate
```

### Non risolto / verificare

- Icona generata proceduralmente (X stilizzata) invece di un asset `.png` dedicato — sostituibile in futuro.
- `install.sh` non crea ancora automaticamente `.venv-tray` — passo manuale finché la feature non è stata validata su hardware reale.

## v0.99.35 alpha (continua) — Download GOG vuoto: stesso bug --no-platform-detection, ma nel comando di download non in quello di lettura libreria

### Sintomo

Installazione GOG (Beneath A Steel Sky) crea la prefix, scarica le dipendenze winetricks, ma la cartella `installer/` resta vuota — `lgogdownloader --download` termina con successo (nessuna eccezione) senza scaricare alcun file.

### Causa

Stesso bug già diagnosticato e corretto in una sessione precedente (v0.99.31, vedi commento esteso in `gogPlugin.ts:108-123`): senza `--no-platform-detection`, `lgogdownloader` può non rilevare correttamente la build disponibile per la piattaforma richiesta (`--platform w`, Windows) per alcuni titoli — comportamento noto, documentato upstream (issue #313), corretto solo in versioni più recenti del tool non garantite presenti sul sistema. La correzione precedente aveva applicato il flag solo al comando di **lettura libreria** (`gogPlugin.ts:124`, `--list games`) — il comando di **download effettivo** (`downloadManager.ts`, `--download --game <slug>`) è una chiamata `lgogdownloader` distinta, mai toccata da quella correzione, e soffriva dello stesso problema.

### Fix (`downloadManager.ts`, `runGOG`)

Aggiunto `--no-platform-detection` anche al comando `lgogdownloader --download`. Verificato che non esistano altre chiamate `--download` nel codice oltre questa (la riga in `gogPlugin.ts:310` è solo un messaggio di log per `installGame`, non esegue mai realmente il download — il flusso reale passa sempre per `downloadManager.runGOG`).

## v0.99.35 alpha (continua) — Knowledge Base: voce per innoextract mancante

### Contesto

Durante il test del fix `--no-platform-detection` (sezione precedente), l'installazione GOG ha continuato a fallire — non più per cartella download vuota, ma per `innoextract` mancante dal sistema, allo Step 5 (estrazione installer). Il codice aveva già il controllo e il messaggio corretto (`binaryExists('innoextract')`, suggerimento `sudo pacman -S innoextract` in `downloadManager.ts`) — nessuna correzione di codice applicativo necessaria, era già gestito bene. Quello che mancava era la cattura di questo caso nella Knowledge Base, per renderlo riconoscibile istantaneamente in futuro (questo progetto, AI Error Advisor pianificato in roadmap) invece di richiedere una diagnosi completa ogni volta.

### Modifica (`kb-seed.json`)

Nuova voce `seed-innoextract-missing`: pattern `"innoextract non trovato"`, `action_type: "none"` (nessuna azione automatizzabile — richiede `sudo`, che il daemon non deve mai eseguire da sé), soluzione testuale con il comando di installazione e una nota esplicita sul fatto che il download può completarsi con successo prima che questo errore emerga (per evitare che un utente futuro, vedendo "Step 1 OK" prima dell'errore, pensi erroneamente che il problema sia nel download). Nessuna migrazione richiesta: `loadSeed()` inserisce solo voci con `id` non già presenti nel DB, quindi la nuova voce viene applicata automaticamente al prossimo riavvio del daemon, anche su un DB già popolato in precedenza.

## v0.99.35 alpha (continua) — La vera causa radice del timeout wineboot: execSync blocca l'event loop durante il sync periodico

### Contesto

Dopo aver escluso ntsync (smentito da test diretto), prefix corrotte (smentito: stessa prefix funziona perfettamente a mano da terminale), e la differenza ambiente terminale/daemon (DISPLAY/PATH verificati identici), il log con il nuovo logging diagnostico mostra il dato decisivo: un `Sync libreria...` automatico scatta esattamente a metà dell'attesa di `wineboot --init` (76s dopo l'avvio, sync completo in ~9s), e il timeout scatta poco dopo la fine di quel sync.

### Causa reale, confermata dalla documentazione Node.js

`syncExternalInstallStates()` (chiamata da `startPeriodicRefresh`, ogni 5 minuti) usava `execSync('legendary list-installed --json', ...)` per il sync Epic. `execSync` è **sincrono e blocca l'intero event loop di Node.js** finché il processo lanciato non termina (documentazione ufficiale: "pausing execution of any additional code until the spawned process exits"). `wineboot --init`, lanciato con `spawn` asincrono (corretto), lavora effettivamente in background gestito dal kernel — ma l'evento `'exit'` che segnala il suo completamento può essere elaborato da Node solo quando l'event loop è libero. Se il sync periodico (alcuni secondi, bloccante) si sovrappone al momento in cui `wineboot` ha già finito, l'evento `'exit'` arriva a livello di kernel ma resta in coda — non elaborato — finché l'event loop non si libera. Se questo accade dopo lo scadere dei 120s di timeout, il task viene killato per un timeout **falso**: il processo aveva già terminato con successo, solo che Node non se ne era ancora accorto.

Questo spiega definitivamente perché lo stesso comando lanciato a mano da terminale (verificato più volte in questa sessione, sempre con successo, sia su prefix nuove sia sulla stessa prefix Soulstice) non ha mai presentato il problema: nessun altro processo Node compete per l'event loop in quel contesto.

### Fix (`gameManager.ts`, `syncExternalInstallStates`)

Sostituito `execSync('legendary list-installed --json', ...)` e `execSync('which legendary', ...)` con `execFile` asincrono (tramite `promisify`). La sezione GOG dello stesso metodo (basata su `existsSync`/`readdirSync`, non `execSync`) non necessitava modifiche — il filesystem check è rapido e non rappresenta lo stesso rischio di blocco prolungato.

### Non toccato

Le altre chiamate `execSync` rimaste nel codice (`hasWine`/`hasWinetricks` in `init()`, eseguite una sola volta al boot prima che qualunque installazione sia possibile; le chiamate dentro i flussi di disinstallazione, che girano solo su azione esplicita dell'utente e non competono con un'installazione attiva dello stesso gioco) non presentano lo stesso rischio di sovrapposizione con un timer periodico in background — lasciate invariate per non introdurre cambiamenti non motivati da un sintomo osservato.

### Nota di processo

Diagnosi lunga e con diverse piste seguite e poi smentite con i fatti (ntsync, prefix corrotta, DXVK/grafica) prima di arrivare a questa — ognuna ragionevole sulla base dei dati disponibili al momento, ma nessuna confermata dai test successivi. La causa reale è emersa solo osservando con attenzione la sovrapposizione temporale nel log con il logging diagnostico introdotto in una sessione precedente (regola di progetto: diagnostica integrata nella console di debug) — senza quel logging, questa correlazione temporale sarebbe stata invisibile.

## v0.99.35 alpha (continua) — Sync filesystem esplicito tra download e creazione prefix

### Esperimento naturale che ha isolato la vera variabile

Test dell'utente: backup della cartella file già scaricata, cancellata solo la prefix, reinstallazione tramite dashboard. `legendary install` ha verificato i file già presenti (download "lentissimo" — verifica/checksum, non trasferimento di rete reale) invece di scaricare davvero; al 100% la creazione prefix è stata "rapidissima" e l'intera installazione è completata senza alcun blocco. Questo isola la differenza chiave: il blocco si manifesta solo quando un download di rete reale e prolungato (24+ GB, anche 10+ minuti) precede `wineboot --init` nello stesso processo — non quando i file sono già presenti sul disco (questo test) né nei test manuali isolati precedenti (mai precedute da un download nello stesso processo/sessione).

### Ipotesi in verifica

Dopo un download lungo, il kernel può avere ancora pagine "dirty" (scritte in cache, non ancora sincronizzate sul disco fisico) nel momento in cui `legendary`/`lgogdownloader` segnala il completamento a Node. `wineboot --init`, scrivendo subito dopo centinaia di piccoli file (registro, dosdevices, struttura drive_c), potrebbe competere per I/O con quella sincronizzazione residua in corso — coerente con tutti i dati raccolti finora (la prefix *si popola* comunque, solo il processo non termina in tempo) e con perché il sintomo non si manifesta mai nei test manuali (dove `wineboot` non segue mai un download nello stesso processo).

### Fix preventivo (`downloadManager.ts`, `runEpic` e `runGOG`)

Aggiunta chiamata `sync` (flush esplicito del filesystem, via `execFile` asincrono — non `execSync`, coerente con la correzione precedente sull'event loop) tra la fine del download e l'inizio della creazione prefix, in entrambi i flussi. Operazione a basso rischio: costo tipicamente minimo anche con molti dati in coda, nessun effetto negativo se l'ipotesi risultasse non essere la causa completa. Applicata anche al flusso GOG per coerenza, anche se il sintomo finora documentato riguarda specificamente Epic/Soulstice.

### Non ancora confermato

La verifica diretta (controllare `/proc/meminfo` per il valore "Dirty" subito dopo un download reale, prima della modifica) non è stata completata prima di applicare il fix — l'utente ha richiesto di procedere comunque data la natura preventiva e a basso rischio della modifica. Da monitorare se il sintomo si ripresenta nonostante questo fix: in tal caso l'ipotesi sui dirty pages andrebbe scartata e la diagnosi dovrebbe proseguire su altre piste (es. throttling I/O specifico al disco usato per download+installazione contemporaneamente, comportamento del filesystem in uso).

## v0.99.35 alpha (continua) — Integrazione Heroic known-fixes (solo Epic)

### Contesto

Richiesta utente: invece di procedere per tentativi sui verb winetricks, interrogare un database di dipendenze note per titolo. Valutate due fonti: Lutris (API pubblica `lutris.net/api/games`, confermata raggiungibile) e Heroic Games Launcher (repository GitHub pubblico `Heroic-Games-Launcher/known-fixes`).

### Perché Heroic e non Lutris (per ora)

Verificato con test diretto: una ricerca Lutris per "Soulstice" restituisce 6 risultati ambigui, nessuno il gioco corretto in cima (varianti come "Devil Express: Soulstice", giochi completamente diversi che condividono solo parte del nome) — la ricerca testuale non garantisce un match affidabile. Il repository Heroic usa invece naming `<appName>-<store>.json` dove `appName` è l'ID interno esatto del gioco (lo stesso hash che X-Launcher già usa per Epic) — match esatto, zero ambiguità, formato dati (`{ winetricks: [...] }`) già nel formato che il codice usa internamente.

### Limitazione nota: solo Epic

L'`appName` Epic coincide esattamente con `task.gameId` (verificato: stesso hash a 32 caratteri sia per Heroic che per il nostro codice). Per GOG, il repository Heroic richiede l'ID numerico GOG reale — il codice attuale usa invece uno slug testuale interno (`slugFromId`), diverso e incompatibile. Estendere a GOG richiederebbe prima recuperare/conservare l'ID numerico GOG altrove nel codice — non fatto in questa modifica per non introdurre un lookup silenziosamente sbagliato (sempre 404, falso negativo silenzioso).

### Implementazione

- **`downloadManager.ts`**: `fetchKnownFixes(appName, 'epic')` — fetch GET verso `raw.githubusercontent.com`, timeout 5s, 404/errore di rete = nessun fix noto (non un errore fatale). In `runEpic`, se `task.useKnownFixes` è attivo, il risultato (se trovato) sostituisce `task.winetricksVerbs` prima dello Step 3. Nuovo callback `onKnownFixesResult` per notificare l'esito (trovato/non trovato) — stesso pattern di `onComplete`/`onError`.
- **`notificationEngine.ts`**: nuovo evento `known-fixes-result`, genera una notifica `info` in entrambi i casi (trovato: elenca i verb applicati; non trovato: informa che si procede con i verb configurati).
- **Schema** (`types.ts`, `db.ts`): nuovo campo `useKnownFixes` su `CompatibilityProfile`/`DownloadTask`, persistito come `use_known_fixes` (migrazione automatica, stesso pattern di `disable_wine_sync`).
- **Frontend** (`App.tsx`): switch nell'overlay opzioni gioco, visibile solo per Epic Games e solo quando il gioco non è ancora installato, con nota esplicativa. La conferma installazione rilegge il valore dal DB al momento della conferma (stessa logica già corretta per `winetricksVerbs`/`disableWineSync`).

### Non fatto in questa modifica

Estensione a GOG (richiede prima conservare l'ID numerico GOG nel codice) e Amazon (store non ancora attivo nel progetto). Lutris resta un'opzione futura se si risolve il problema di matching per nome (es. cercando per `gogid`/`steamid` invece che per titolo, dati disponibili nell'API Lutris ma non ancora sfruttati).

## v0.99.35 alpha (continua) — Sync GOG marcava "installato" un'estrazione interrotta a metà

### Sintomo

Installazione SOMA (GOG) interrotta manualmente con Ctrl+C durante l'estrazione innoextract (Step 5). Dopo l'interruzione, il gioco risultava comunque "installato" nella dashboard, ma la card non puntava a nessun eseguibile reale — file presenti solo parzialmente sul disco.

### Causa

`syncExternalInstallStates()`, sezione GOG: il controllo "installato" era `existsSync(filesDir) && readdirSync(filesDir).length > 0` — qualsiasi cartella non vuota veniva considerata un'installazione completa, anche con solo una frazione dei file estratti prima dell'interruzione. A differenza della sezione Epic (basata su `legendary list-installed`, fonte esterna affidabile), questo controllo filesystem-based non distingueva "alcuni file presenti" da "installazione effettivamente completa".

### Fix (`gameManager.ts`, sezione GOG di `syncExternalInstallStates`)

Sostituito il controllo con `resolveGogExe(filesDir) !== null` (funzione già esistente in `downloadManager.ts`, ora esportata per il riuso) — legge `goggame-*.info` (scritto da innoextract solo a estrazione riuscita) e verifica che il path dell'eseguibile primario dichiarato esista davvero sul disco. Condizione molto più affidabile di "la cartella contiene qualcosa": un'estrazione interrotta a metà, anche con file presenti, normalmente non ha ancora scritto/completato il file `.info` o l'eseguibile primario indicato al suo interno.

### Nota collaterale osservata durante la diagnosi

Il blocco apparente segnalato dall'utente ("creazione prefix ferma a 0%, non avanza mai") non era un vero blocco del processo: il log conferma che wineboot/winetricks/innoextract procedevano correttamente e rapidamente (nessun timeout, fix precedenti confermati efficaci anche per GOG). Il sintomo visivo era un disallineamento tra lo stato reale del backend (già avanzato a Step 5) e quanto mostrato dalla card — causa non isolata con certezza in questa sessione (il processo è stato interrotto con Ctrl+C prima di poter verificare se si trattava di un problema di polling/cache frontend o se il backend stesso fosse fermo). Da rivalutare se il sintomo si ripresenta con un'installazione lasciata completare senza interruzioni manuali.

## v0.99.35 alpha (continua) — Verifica fattuale: il bug GOG non si applica a Epic con lo stesso meccanismo

### Domanda dell'utente

Se il sync GOG marcava "installato" un'estrazione interrotta a metà, lo stesso vale per Epic (es. Soulstice se interrotto)?

### Verifica

Il bug GOG era specifico a `syncExternalInstallStates()`, sezione GOG: scriveva `isInstalled: true` basandosi solo sul filesystem ("la cartella non è vuota"), indipendentemente dal completamento reale del flusso di installazione. La sezione Epic dello stesso metodo **non scrive mai `isInstalled: true`** — corregge solo la direzione opposta (`true → false`, quando `legendary list-installed` non confema più un gioco che il DB segna installato). Il flag `true` per Epic viene scritto altrove (`gameManager.ts`, listener su `downloadManager`, riga ~133), **solo** quando `task.status === 'completed'` — condizione raggiunta solo a fine flusso `runEpic()` riuscito, dopo tutti gli step incluso la risoluzione dell'eseguibile. Un'interruzione manuale (Ctrl+C) prima di quel punto non farebbe mai scattare questa riga: il bug specifico osservato per GOG non si applica a Epic tramite lo stesso meccanismo.

### Fix preventivo applicato comunque (`downloadManager.ts`, `resolveEpicExe`)

Pur non essendo il meccanismo del bug GOG, una protezione mancante equivalente esisteva: `resolveEpicExe()` restituiva il path dell'eseguibile calcolato dal manifest `legendary info` senza mai verificare che il file esistesse davvero su disco — un'installazione interrotta dopo la scrittura del manifest ma prima della scrittura fisica dei file avrebbe potuto produrre un `executablePath` non valido nel flusso normale di completamento. Aggiunta verifica `existsSync(exePath)` prima di restituire il risultato. Convertita la funzione da sincrona (`execSync`) ad asincrona (`execFileAsync`) per coerenza con la correzione già applicata al resto del modulo — evita di bloccare l'event loop se richiamata in futuro da un contesto concorrente con altre installazioni attive.

### Non verificato con un caso reale

L'utente non aveva un'installazione Epic interrotta a disposizione per un test diretto in questa sessione — la conclusione sopra si basa sulla lettura del codice, non su una riproduzione empirica del sintomo. Da confermare se si presenta un caso reale futuro.

## v0.99.35 alpha (continua) — Known fixes Heroic: scrittura permanente sul profilo compat

### Domanda dell'utente

Se Heroic trova dipendenze diverse da quelle configurate, l'overlay le mostrerebbe spuntate dopo l'installazione?

### Verifica e correzione

No, non con l'implementazione di ieri: il fix trovato sostituiva i verb solo nella variabile locale `verbsForInstall` dentro `runEpic()` — mai scritto sul profilo compat persistito, che resta quello configurato dall'utente prima del lookup. L'overlay, leggendo sempre il profilo salvato, non avrebbe mai riflesso cosa è stato realmente installato.

Per scelta esplicita dell'utente: quando Heroic trova un fix, i suoi verb vengono ora scritti indietro sul profilo compat persistito (`db.upsertCompatProfile`), preservando gli altri campi (`fsr`/`gameMode`/ecc.) e sovrascrivendo solo `winetricksVerbs`. Diventano così la configurazione di default permanente per quel titolo — riaprendo l'overlay dopo l'installazione, i verb mostrati spuntati sono esattamente quelli realmente applicati, non quelli pre-lookup. La notifica testuale è stata aggiornata per indicare esplicitamente che il salvataggio è permanente.

## v0.99.35 alpha (continua) — Timeout esteso per verb dotnet*, niente da costruire per la cache

### Domanda dell'utente

Idea proposta: sistema di link simbolici per condividere librerie problematiche (es. dotnet46) tra tutte le prefix, evitando di riscaricarle/reinstallarle ogni volta.

### Verifica

Confermato con un test reale (`/proc/<pid>/io` su `msiexec.exe` durante un'installazione `dotnet46` per Sifu): il processo non era bloccato, stava facendo lavoro I/O reale e continuo — semplicemente un'installazione .NET Framework sotto Wine è intrinsecamente lenta (MSI reale, non solo copia file). Il timeout di 5 minuti era scaduto a 67% di progresso nonostante il lavoro procedesse normalmente.

Verificato anche, con ricerca e conferma diretta sul filesystem (`~/.cache/winetricks/dotnet46/` già popolato con il pacchetto da 65MB), che **la condivisione richiesta esiste già**: `winetricks` mantiene una cache di download condivisa in `~/.cache/winetricks/` (fuori da qualsiasi `WINEPREFIX`), riusata automaticamente da qualsiasi installazione successiva indipendentemente dalla prefix di destinazione — nessun sistema di link da costruire per questa parte.

La parte NON condivisibile in sicurezza tramite link è invece l'installazione effettiva: il registro Windows (`system.reg`) è specifico per ciascuna prefix, e fonti consultate (forum WineHQ) segnalano esplicitamente il rischio di corruzione se prefix con versioni Wine diverse condividessero file di sistema tramite symlink. Per scelta esplicita dell'utente, non perseguita questa strada più ambiziosa.

### Fix implementato (`downloadManager.ts`)

Timeout differenziato per i verb winetricks: `WINETRICK_DOTNET_TIMEOUT_MS = 900_000` (15 minuti) per qualsiasi verb che inizia con `dotnet` (tramite `winetrickTimeoutFor()`), `WINETRICK_TIMEOUT_MS` (5 minuti, invariato) per tutti gli altri verb — coerente con i tempi osservati nei test di oggi (verb semplici come `vcrun2022`/`dxvk`/`vkd3d`/`corefonts`: 2-4 secondi ciascuno; `dotnet46`: ancora in corso, lavoro reale confermato, oltre 5 minuti).

## v0.99.35 alpha (continua) — Step 1: modulo condiviso winePrefixManager.ts, ispirato a Heroic

### Contesto

Confronto diretto col codice sorgente di Heroic Games Launcher (`src/backend/launcher.ts`, funzione `prepareWineLaunch`), su richiesta esplicita dell'utente di adottare principi di affidabilità verificati su un progetto maturo, invece di continuare a correggere sintomi isolati. Trovate differenze concrete: Heroic esegue `wineboot --init && wineserver --wait` come UNICA sequenza, sempre PRIMA di qualsiasi altro step (winetricks, DXVK), con un commento esplicito nel loro codice: "If the registry isn't available yet, things like DXVK installers might fail." Il nostro codice eseguiva solo `wineboot --init`, senza il successivo `wineserver --wait` — coerente con diversi sintomi di questa sessione dove il lavoro reale procedeva ma l'evento di completamento non corrispondeva al reale stato pronto della prefix.

### Vincolo architetturale rispettato

Su richiesta esplicita: il fix non doveva rompere l'architettura a plugin/platform-agnostic del progetto (`StorePlugin` in `plugins/`, `BaseRunner` in `runners/`). La duplicazione tra `runGOG`/`runEpic` in `downloadManager.ts` (la stessa sequenza di preparazione prefix copiata in entrambi, causa concreta di fix applicati a uno store e dimenticati nell'altro più volte in questa sessione) non fa parte di quell'architettura — è codice ripetuto da consolidare, non un confine da preservare.

### Implementazione (`winePrefixManager.ts`, nuovo file)

Modulo platform/store-agnostico: non conosce GOG/Epic, solo "una prefix da preparare". Riceve `spawnWithTimeout` e `log` come parametri (dependency injection) invece di duplicarli — resta disaccoppiato dalla classe `DownloadManager`, nessun nuovo accoppiamento introdotto. Ritorna sempre `{success, error}` strutturato, mai eccezioni dirette — secondo paradigma adottato da Heroic (`prepareWineLaunch` ritorna `{success, failureReason}`).

`runGOG` e `runEpic` ora chiamano entrambi `prepareWinePrefix()` dallo stesso modulo, eliminando la duplicazione.

### Trade-off consapevole

Il tempo massimo teorico per "Step 2 — creazione prefix" raddoppia nel caso peggiore (wineboot fino a 2 min + wineserver --wait fino a 2 min, timeout indipendenti) — accettato perché il `--wait` aggiuntivo nei test pratici di questa sessione è sempre tornato in pochi secondi quando il lavoro reale era già concluso, coerente con l'intento: aspettare il completamento reale, non aggiungere lavoro.

### Verifica richiesta dall'utente prima di proseguire allo Step 2

Test di installazione completa di un titolo (GOG o Epic) dall'inizio alla fine, verificando che la card risulti correttamente installata nel sistema al termine — non il lancio del gioco, solo l'affidabilità della procedura.

## v0.99.35 alpha (continua) — Due bug GOG emersi col test Step 1: barra dente di sega + sfarfallio installato/non installato

### Sintomo 1 — barra di progresso erratica (Aragami)

Durante il download, la percentuale saliva e scendeva bruscamente (35% → 8% → 90% → 75% → 99%) prima della creazione prefix.

**Causa**: `lgogdownloader` scarica più file per alcuni titoli (extra, manuali, oltre all'installer principale) e stampa il progresso PER FILE, non aggregato. Il parser (`parseLgogProgress`) non distingue il contesto — ogni nuova riga di un file diverso viene interpretata come il progresso assoluto del task.

**Fix** (`downloadManager.ts`, `spawnWithProgress`): `Math.max(task.progress, parsed.progress)` invece del valore grezzo — il progresso mostrato non scende mai sotto il massimo già raggiunto nello step corrente. Non risolve la causa upstream (nessun vero progresso aggregato multi-file), ma elimina l'effetto visivo confuso.

### Sintomo 2 — card sfarfalla installato/non installato dopo il completamento

Dopo l'installazione, cercando il gioco la card appariva installata, poi tornava "non installato", stabile solo dopo riavvio del daemon.

**Causa**: race condition temporale tra la scrittura finale del task (`isInstalled=true`, a fine flusso `runGOG`) e il sync periodico GOG (`syncExternalInstallStates`), che può scattare nella finestra in cui `innoextract` ha già scritto i file su disco ma il task non è ancora marcato `'completed'` nel DB — `resolveGogExe()` legge una fotografia filesystem genuina ma prematura.

**Fix** (`gameManager.ts`, sezione GOG di `syncExternalInstallStates`): il sync ora salta esplicitamente i giochi che hanno un task di installazione attualmente attivo (`downloadManager.getTasks()`, status diverso da `completed`/`error`) — riduce drasticamente la finestra di race condition, anche se non la elimina del tutto (un vero lock, già pianificato come Step 2 del confronto con Heroic, è la soluzione strutturale completa).

### Nota

Questi due bug sono emersi proprio grazie al test end-to-end richiesto dall'utente prima di procedere allo Step 2 — confermano il valore del metodo "ogni step validato con un'installazione reale completa" invece di assumere che un fix isolato non abbia effetti collaterali altrove.

## v0.99.35 alpha (continua) — Timeout di inattività invece di timeout assoluto fisso

### Sintomo

SOMA (GOG) fallito su Step 5 (innoextract) con `TIMEOUT dopo 600005ms` nonostante il processo fosse genuinamente al lavoro — confermato: `STAT=D` (uninterruptible sleep, I/O), oltre 17GB già scritti con ritmo sostenuto fino all'ultimo controllo prima del timeout. SOMA pesa circa 25GB installato; l'utente segnala che esistono titoli anche più grandi.

### Causa

Un timeout assoluto fisso richiede di indovinare un numero — non esiste un valore corretto per "quanto può essere grande un'estrazione", che varia per ordini di grandezza da gioco a gioco. Lo stesso problema, risolto ieri solo per i verb `dotnet*` con un timeout esteso fisso, si è ripresentato qui con un ordine di grandezza diverso (GB scritti invece di un'installazione MSI) — un timeout fisso, per quanto esteso, sarebbe stato sempre vulnerabile al prossimo titolo abbastanza grande.

### Fix — timeout di inattività (`downloadManager.ts`, `spawnWithTimeout`)

Sostituito il singolo timeout assoluto con due timer indipendenti:
- **Timeout di inattività** (`idleTimeoutMs`): monitora `/proc/<pid>/io` ogni `inactivityPollMs` (default 10s) — se i contatori `read_bytes`/`write_bytes` crescono, il timer si resetta. Il processo viene terminato solo se NON fa alcun I/O per l'intera durata di `idleTimeoutMs` — non se il lavoro totale richiede più tempo del previsto.
- **Timeout assoluto** (`timeoutMs`, comportamento esistente): rete di sicurezza estrema, indipendente dall'attività rilevata — protegge da un bug nel meccanismo di rilevamento stesso, non da un'estrazione lenta ma reale.

Per le chiamate esistenti (wineboot, winetricks) che non specificano `opts`, il comportamento resta equivalente a prima (`idleTimeoutMs` di default coincide con `timeoutMs`). Solo lo Step 5 GOG (`innoextract`) usa ora il comportamento differenziato: `idleTimeoutMs: 300_000` (5 minuti senza I/O = davvero bloccato), `timeoutMs: 7_200_000` (2 ore come limite assoluto estremo, non operativo).

### Verifica richiesta

Re-installazione di SOMA (o altro titolo GOG di grandi dimensioni) per confermare che l'estrazione completi senza interruzioni premature, mantenendo comunque la capacità di rilevare un blocco genuino (nessun I/O per 5 minuti) come nei casi precedenti diagnosticati con successo in questa sessione.

## v0.99.35 alpha (continua) — Parser progresso GOG riscritto su dati reali (formato verificato)

### Sintomo riportato

Dopo il fix Math.max() di ieri, la barra "schizza subito a 99% e rimane in attesa di finire il download realmente" — peggio del problema originale (regressione visiva), perché ora mostra un falso completamento.

### Causa reale, confermata con un test diretto del formato

Acquisito un log completo di `lgogdownloader --download` su Aragami e analizzato riga per riga. Il formato reale (mai verificato prima, il vecchio parser era basato su un'assunzione): lgogdownloader scarica con **4 slot paralleli** (`#0`..`#3`), ognuno con la propria barra `"97% ▕███▏ 3231.17/3319.48MiB"` per il file assegnato in quel momento — non un progresso aggregato. Il vecchio parser catturava la percentuale di QUALSIASI slot indistintamente: se un file piccolo (patch/extra) arrivava al 99% mentre il file principale (3+ GB) era ancora al 10%, il `Math.max()` di ieri bloccava la barra al 99% per sempre, anche con il vero download ancora in corso sotto.

### Fix (`downloadManager.ts`, `makeLgogProgressParser`)

Parser riscritto da zero sul formato reale verificato: il log espone anche `Total size: 6.45 GiB` (una volta, a inizio task) e `Total: <speed> | Remaining: N (Y GiB) ETA: Zs` (ripetuto a ogni refresh, aggregato su tutti gli slot). Il progresso ora si calcola come `(totalSize - remaining) / totalSize` — indipendente da quale slot stia scaricando cosa. Richiede stato tra righe diverse (`totalSizeMiB` visto una volta, riusato per i calcoli successivi) — la funzione è ora una factory (`makeLgogProgressParser()`) che ritorna una closure stateful, una nuova istanza per ogni download (evita contaminazione di stato tra task paralleli/successivi). `Math.max()` in `spawnWithProgress` lasciato come rete di sicurezza minima contro eventuale jitter di arrotondamento — non più la difesa primaria contro un parsing strutturalmente sbagliato.

### Metodo

Confermato il principio guida di questa sessione: verificare il formato REALE con un test diretto prima di scrivere o correggere un parser, invece di assumere un formato plausibile. Il vecchio parser (`/(\d+)\s*%/`generico) non era mai stato confrontato con un log reale completo — solo con singole righe isolate, insufficienti a rivelare la struttura multi-slot.

## v0.99.35 alpha (continua) — Barra di progresso reale per innoextract (Step 5 GOG)

### Sintomo

Confermato dal test SOMA: il timeout di inattività funziona correttamente (installazione completata), ma la barra di progresso resta a 0% per tutta la durata dell'estrazione, schizzando al massimo solo a completamento.

### Causa

Lo Step 5 GOG (`innoextract`) usa `spawnWithTimeout`, che ignora sempre stdout/stderr ai fini del progresso (`stdout?.on('data', () => {})`) — per design, dato che è pensato per processi come `wineboot`/`winetricks` il cui output non contiene un avanzamento osservabile utile. `spawnWithProgress` (la funzione gemella, pensata per il progresso) esisteva ma non ha mai avuto il timeout di inattività appena costruito per `spawnWithTimeout`, e usa ancora l'evento `'close'` invece di `'exit'` — lo stesso bug già diagnosticato e corretto giorni fa per l'altra funzione, mai riportato qui.

### Verifica formato (`innoextract --progress=1`)

Test diretto (estrazione reale di SOMA, log completo analizzato): formato semplice, una singola barra con percentuale già aggregata sull'intera estrazione — `"[K[=================>    ] 28.9%   131 MiB/s"` — a differenza del formato multi-slot di `lgogdownloader` (vedi `makeLgogProgressParser`), qui non serve alcuna logica di stato tra righe.

### Fix (`downloadManager.ts`)

Invece di duplicare timeout/exit/logging in una seconda funzione parallela, **`spawnWithTimeout` estesa** con un parametro opzionale `progressParser` — quando presente, stdout/stderr vengono letti e parsati con lo stesso pattern già collaudato in `spawnWithProgress` (split su `\r`/`\n`, `Math.max` come rete di sicurezza), aggiornando `task.progress` durante l'esecuzione. Questo riusa il timeout di inattività appena validato (SOMA) anche per processi con avanzamento osservabile, senza introdurre una terza funzione o duplicare la logica di robustezza. Nuovo parser `parseInnoextractProgress`, collegato alla chiamata Step 5 GOG.

Le chiamate esistenti (`wineboot`, `winetricks`) restano invariate — nessun `progressParser` passato, comportamento identico a prima (stdout ignorato).

## v0.99.35 alpha (continua) — Card GOG mostrava NOT INSTALLED nonostante gioco installato

### Sintomo

Confermato da foto (Aragami): card con bordo azzurro (focus) mostra "NOT INSTALLED" in sovraimpressione, ma il pannello dettaglio destro mostra correttamente "INSTALLED". Bug apparentemente specifico a GOG.

### Causa

`upsertGame()` in `db.ts` sovrascriveva `status = excluded.status` senza condizioni. Il plugin GOG (`gogPlugin.ts`) imposta sempre `status: 'Not Installed' as const` per TUTTI i titoli del catalogo, senza verificare lo stato reale nel DB — storicamente corretto (il catalogo GOG è solo "cosa possiedi", non "cosa hai installato nella dashboard"), ma diventa un bug quando il sync periodico (`refreshLibrary`) chiama `upsertGame` dopo che `updateGameStatus` ha già scritto `status: 'Ready to Launch'` a installazione completata. Il plugin sovrascriveva questo valore con `'Not Installed'` al ciclo di sync successivo.

Epic non presentava il problema perché il suo plugin calcola già correttamente `isInstalled ? 'Ready to Launch' : 'Not Installed'` — anche se dipende da `legendary list-installed`, che ha i propri limiti già documentati altrove.

### Fix (`db.ts`, `stmtUpsertGame`)

`status` in `ON CONFLICT DO UPDATE` ora protetto con la stessa logica già usata per `executable_path` (NON sovrascritto da upsert): se il DB ha già `'Ready to Launch'` o `'Playing'`, il valore viene mantenuto indipendentemente da cosa il plugin passa. Applicato a tutti gli store per prevenzione, anche se il sintomo era specifico a GOG.

## v0.99.35 alpha (continua) — Sezione runner nell'overlay: redesign da pulsanti a switch con deseleziona esplicito

### Problema

I runner installati nell'overlay erano mostrati come pulsanti che cambiavano colore (blu) quando attivi — visivamente ambiguo: sembravano badge "installed" invece di indicatori di selezione. Mancava un modo esplicito per deselezionare un runner alternativo e tornare a Wine senza dover sapere a priori che "premere il runner già attivo" fa qualcosa di diverso da "selezionare un runner diverso".

### Fix (`App.tsx`)

Ridisegnata la sezione come lista di switch on/off (uno per ogni runner non-default). Ogni switch:
- **OFF → ON**: attiva il runner per questo gioco (persiste su DB tramite PATCH `/api/games/:id/config`), aggiorna `runnerVersion` per il badge "Runner Bridge" in alto
- **ON → OFF**: riporta al runner di default (`Wine-Lutris`), mantiene tutta la configurazione pregressa (compat profile, prefix, winetricksVerbs) invariata — solo il `runner` cambia

Il runner di default (Wine-Lutris) non compare nella lista degli switch — è implicito (viene ripristinato automaticamente deselezionando qualsiasi alternativo). L'ereditarietà della configurazione verso la prefix Proton (già implementata in `gameManager.ts`, `applyVerbsToProtonPrefix`) scatta automaticamente al primo toggle ON, e non scatta sul toggle OFF (Wine-Lutris non è in `protonRunners`).

## v0.99.35 alpha (continua) — Fix status GOG: migrazione storica mancante

### Problema

Il fix precedente in `upsertGame` (CASE su status) proteggeva solo le sovrascritture future — ma tutti i giochi GOG già installati avevano già `status='Not Installed'` scritto nel DB da sync precedenti. La card continuava a mostrare "NOT INSTALLED" per i giochi GOG installati prima del fix.

### Fix (`db.ts`)

Aggiunta migrazione one-shot all'avvio del daemon: corregge tutti i record con `is_installed=1` e `status='Not Installed'` → `'Ready to Launch'`. Condizionata al conteggio dei record da correggere (no-op se non ce ne sono, nessun overhead a regime). Il log di avvio mostra quanti record sono stati corretti per trasparenza.

## v0.99.36 alpha — Sistema di verifica per-gioco (badge "verificato")

### Contesto

Prima di procedere al test sistematico di ogni titolo della libreria, richiesto un modo per marcare i giochi il cui lancio è confermato funzionante con la configurazione attualmente salvata — badge unico indipendentemente dal fatto che abbiano funzionato subito o dopo debug manuale (decisione esplicita dell'utente: nessuna distinzione visiva tra i due casi).

### Decisione architetturale: nessun nuovo layer di lancio, nessun blob di config duplicato

Valutate e scartate due idee inizialmente proposte:
- Un ID opaco (`app_id`) generato ad hoc per il lancio unificato: `games.id` è già univoco cross-store (`epic-<hash>`, `gog-<slug>`, `steam-<appId>`) ed è già la chiave usata ovunque (`compat_profiles.game_id`, `downloads.game_id`). Nessuna migrazione necessaria — riusato così com'è.
- Un campo `launch_config` JSON per runner/winetricks/env: dati già presenti e vivi su `games` + `compat_profiles`. Duplicarli avrebbe introdotto un secondo sistema con rischio di disallineamento.
- Un `resolveAndLaunch(appID)` nuovo: `gameManager.launchGame(id)` è già il dispatch unificato store-agnostico (legge game+profilo, trova il runner, applica i verb pendenti, lancia via `runner.launch()`). Nessuna duplicazione introdotta.

Unica aggiunta reale necessaria: il flag di verifica stesso, assente in entrambi gli schemi esistenti.

### Implementazione

**`db.ts`**: 3 nuove colonne su `games` (`verified INTEGER DEFAULT 0`, `verified_at TEXT`, `verification_method TEXT`), con migrazione `ALTER TABLE` per DB esistenti. `markGameVerified(id, method: 'auto'|'manual')` e `unmarkGameVerified(id)` — entrambe fuori da `upsertGame`, quindi mai sovrascritte da un refresh/sync libreria (stesso trattamento di `executable_path`).

`verification_method` non è dedotto automaticamente: il chiamante specifica esplicitamente `'auto'` (nessun intervento manuale) o `'manual'` (richiesto debug) — un lancio "riuscito" lato runner non garantisce che il gioco sia davvero giocabile, solo un test umano può confermarlo. Motivazione per tenerlo comunque: diagnosi più rapida di eventuali regressioni future (un titolo verificato `'auto'` dipende da una fonte esterna — known-fixes Heroic — che può cambiare; uno `'manual'` ha una config locale stabile).

**`gameManager.ts`**: wrapper `markGameVerified`/`unmarkGameVerified` con logging su canale `[VERIFY]`.

**`server.ts`**: `PATCH /api/games/:id/verify` (body `{method}`), `DELETE /api/games/:id/verify` per rimuovere il badge in caso di regressione.

**`App.tsx`**: badge (icona check verde, `CheckCircle2` da lucide-react) sulla card libreria, in alto a destra della cover — a differenza dello status testuale, sempre visibile e non condizionato a focus/hover, per essere scorribile a colpo d'occhio su tutta la griglia durante il test sistematico della libreria.

### Non fatto in questa modifica

Nessuna UI dedicata per marcare/rimuovere la verifica dall'overlay — per ora solo via API diretta (`curl`/script), coerente con l'uso previsto nell'immediato (test da terminale gioco per gioco). Un pulsante nell'overlay Game Options può essere aggiunto quando il test protocol sarà rodato.

## v0.99.36 alpha (continua) — Step 2: lock sulla prefix (confronto Heroic)

### Contesto

Secondo step del piano a 4 punti nato dal confronto diretto con `launcher.ts` di Heroic Games Launcher (Step 1, `winePrefixManager.ts`, validato in sessione precedente). Obiettivo: prevenire che installazione e lancio tocchino la stessa WINEPREFIX in parallelo — lo stesso tipo di conflitto segnalato dal lock file `pfx.lock` osservato in un log di errore Proton durante questa sessione di lavoro.

### Analisi: dove viveva davvero il rischio

Verificato che `downloadManager.addTask()` già preveniva il caso "due installazioni concorrenti sullo stesso gioco" (`if (this.tasks.has(gameId)) return`). Il gap reale era negli altri due incroci, nessuno dei due protetto:

1. **Lancio durante installazione attiva** — nulla impediva a `gameManager.launchGame(id)` di invocare `runner.launch()` mentre un task di download/installazione per lo stesso `gameId` stava ancora scrivendo sulla prefix (wineboot, winetricks, estrazione).
2. **(Re)installazione/disinstallazione durante gioco in esecuzione** — nulla impediva di avviare una nuova scrittura sulla prefix (o rimuoverla) mentre il processo del gioco, tracciato in `lastLaunchedGame`, era ancora vivo.

### Implementazione

**`gameManager.ts`**:
- `isLastLaunchedGameRunning()` ora espone anche `gameId` oltre a `running`/`gameTitle` (prima solo interno, serviva al systray) — necessario per confrontare "il gioco in esecuzione" con "il gioco che si sta tentando di installare/lanciare/disinstallare".
- `launchGame(id)`: blocca con messaggio esplicito se (a) esiste un task attivo (`status !== 'completed' && status !== 'error'`) per lo stesso `gameId`, o (b) il gioco risulta già in esecuzione (evita un secondo processo wine/proton sulla stessa prefix).
- `installGame(id)` e `uninstallGame(id)`: bloccano se il gioco risulta in esecuzione.

**`downloadManager.ts`**: il vero punto di ingresso usato dalla UI per gli avvii di installazione è `addTask()` (chiamato direttamente da `POST /api/downloads/start`, non da `gameManager.installGame()` — verificato leggendo il chiamante reale in `App.tsx`). Per evitare una dipendenza circolare (`gameManager` già importa `downloadManager`), aggiunto un meccanismo di callback identico nello spirito a `onComplete`/`onError` già esistenti: `setRunningGameChecker(fn)`, registrato da `gameManager` nel costruttore. `addTask()` lo consulta prima di iniziare a scrivere sulla prefix e ora ritorna `{success, message?}` invece di `void`, per permettere ai chiamanti di propagare il rifiuto.

**`server.ts`**: `POST /api/downloads/start` propaga il risultato strutturato invece del precedente `{success: true}` fisso.

**`App.tsx`**: il ramo di conferma installazione (`pendingAction.type === 'install'`) ora legge la risposta di `/api/downloads/start` e mostra una notifica di errore se il backend rifiuta — stesso pattern già esistente per il ramo di disinstallazione, prima assente qui (la richiesta veniva lanciata e ignorata).

### Cosa NON copre questo lock

È un lock in-memory a livello di daemon (singolo processo Node), non un vero file di lock sul filesystem (`pfx.lock` di Proton è invece a livello di sistema operativo, verificabile anche da processi esterni al daemon). Sufficiente per tutti i percorsi che passano dalla dashboard, ma non protegge da un'interazione manuale da terminale che tocchi la stessa prefix mentre il daemon ha un'operazione in corso — scenario giudicato a rischio trascurabile per l'uso previsto.

### Verifica richiesta

Test reale: avviare il lancio di un gioco mentre è in corso un'installazione dello stesso titolo (o viceversa) e confermare che il secondo tentativo venga rifiutato con un messaggio chiaro invece di procedere silenziosamente o fallire in modo oscuro lato wine.

## v0.99.37 alpha — Known-fixes GOG, fix card Big Picture, fix runner non caricati

### Known-fixes Heroic esteso a GOG

`fetchKnownFixes` supportava solo Epic (match diretto per `appName`). Aggiunta `fetchGogNumericId()`: risolve lo slug testuale GOG nell'ID numerico richiesto dal naming del repository (`<id>-gog.json`) via `lgogdownloader --list details/json --game <slug>` scoped a un solo titolo (non le 128 chiamate sequenziali già scartate per l'intero catalogo). Parsing difensivo con log dell'output grezzo in caso di formato imprevisto — sintassi non verificabile in sandbox, corretta empiricamente al primo test reale (404 confermato per Soma: nessun fix disponibile per quel titolo, comportamento atteso). Blocco `runGOG` ora aggiorna anche `knownFixesNotes` nel compat profile (note testuali del fix, se presenti — mai applicate in automatico, solo consultabili). Overlay: rimossa la restrizione "solo Epic" sul toggle "Usa Known Fixes (Heroic)", rimasta dal periodo pre-estensione — il toggle era scritto nel backend ma invisibile per GOG.

### Fix card "Steam Big Picture" — info sbagliate nel pannello destro

Causa reale: la card è iniettata solo per il rendering della griglia, mai presente nello stato `games` grezzo (popolato da `/api/games`, lato server). `selectedGame = games.find(...) || games[0]` falliva sempre il lookup e cadeva sul primo gioco reale della lista corrente — da qui "appare sempre A Plague Tale: Innocence". Fix: `selectedGame` risolve esplicitamente la card via una factory dedicata (`makeSteamBigPictureCard`), i due punti che resettavano la selezione ad ogni fetch/evento SSE ora la riconoscono come sempre valida, aggiunta un'immagine dedicata 16:9 (la precedente, pensata per la card 3:4 della griglia, veniva ritagliata escludendo il testo "STEAM/BIG PICTURE" in un riquadro panoramico), badge "Steam Client" al posto di "Installed/Not Installed" (non pertinente per questa card).

### Fix runner non caricati senza aprire System

`availableRunners` (letta anche dalle switch runner nell'overlay Game Options) veniva popolata solo da un effetto lazy legato all'apertura della tab System. Aggiunto un fetch indipendente di `/api/runners` al boot dell'app — economico (nessuna scansione filesystem, solo lettura tabella già popolata), la tab System continua a ricaricarlo insieme ai dati più pesanti.

## v0.99.38 alpha — Test protocol completo: verifica, validazione automatica, cancellazione download, runner-aware install

### Sistema di verifica — completamento

`known_fixes_notes` in `compat_profiles` (note Heroic conservate per consultazione, mai applicate in automatico). Aggiunta possibilità di testare argomenti di lancio candidati senza scriverli nel DB: `launchGame(id, overrideLaunchArgs?)` e `POST /api/launch` con `launchArgsOverride`, persistiti solo dopo conferma manuale via il campo "Launch Arguments" già esistente nell'overlay.

### Prompt di validazione automatico alla chiusura

Il vero cuore del test protocol: polling ogni 4s (`gameManager.startGameExitPolling`) rileva la transizione di un gioco lanciato da "in esecuzione" a "chiuso" (unico modo possibile: il processo è spawnato detached+unref, nessun evento `exit` nativo disponibile). Se il gioco non è già `verified`, emette una notifica che riusa **integralmente** l'interfaccia "✅ Ha funzionato / ❌ Non ha funzionato" già esistente per il feedback sui suggerimenti Knowledge Base (creata direttamente con `status: 'applied'`, saltando lo stato 'pending' — qui non c'è un fix da applicare prima, la domanda è diretta). Conferma "Ha funzionato" → `markGameVerified(id, 'manual')`. Se il gioco è già verificato, il prompt non compare più; se KO (o ignorato), ricompare alla chiusura successiva.

**Bug critico scoperto e corretto**: il primo test reale ha mandato in crash l'intero daemon — `RangeError: Missing named parameter` nella scrittura SQLite, causato da campi opzionali assenti nell'oggetto passato a `better-sqlite3` con parametri nominati (una chiave *assente*, non solo `undefined`, fa fallire il bind). Un controllo automatico ha trovato lo stesso difetto in **8 blocchi su 15** in `eventToNotification` (incluso il percorso Knowledge Base, mai ancora esercitato). Corretto centralizzando la normalizzazione in un unico punto (`push()`) invece che in ogni singolo blocco, più `try/catch` a difesa di qualunque futuro fallimento di scrittura. Aggiunto anche `try/catch` strutturale al polling stesso — un'eccezione lì dentro non deve mai più poter portarsi giù l'intero processo.

### Notifiche navigabili col pad

Tutti i pulsanti del pannello notifiche (dismiss, log tecnico, OK/KO, azione primaria/secondaria) erano `<button onClick>` semplici, mai raggiungibili dalla navigazione gamepad/tastiera — solo il mouse funzionava. Convertiti in `Focusable` (gruppo `notifications`, già correttamente attivato all'apertura del pannello — mancava solo il collegamento sui singoli elementi).

### Fix: messaggio "plugin disabilitato" era un `alert()` nativo

Il controllo lato frontend che blocca il lancio di un gioco con plugin store disabilitato e DRM richiesto usava `alert()` — popup nativo di Chromium, fuori dal sistema di notifiche e non navigabile col pad, mentre il percorso backend equivalente (`notificationEngine`, evento `launch-blocked`) non veniva mai raggiunto perché il blocco avviene prima della chiamata API. Sostituito con `pushNotification(...)`, con pulsante "Vai ai Plugin" (esteso il dispatch `open_section`, che gestiva solo la sezione `accounts`).

### Cancellazione download — non solo pausa

`cancelTask` esisteva già lato backend (route mai esposta in UI) ma si limitava a fermare il processo e rimuovere la riga dal DB, lasciando sul disco i file parziali (installer scaricato, prefix, eventuale estrazione parziale) — per un titolo abbandonato a metà, GB di spazio sprecato silenziosamente. Esteso per eliminare l'intera cartella del gioco (con guardia di sicurezza: rifiuta se il path non ricade sotto `GAMES_ROOT`). Aggiunto pulsante "Cancel" nel pannello Download con conferma a due passaggi.

### Fix persistenza `runner` — sovrascritto ad ogni sync

Bug scoperto durante il debug di Soma: cambiare il runner nell'overlay (es. a Proton-GE) veniva silenziosamente annullato al sync libreria successivo, perché `upsertGame` aveva `runner = excluded.runner` nella clausola `ON CONFLICT` — il plugin GOG restituisce sempre `'Wine-Lutris'` come default per ogni titolo ad ogni sync. Rimosso `runner` dalla `SET` clause (stessa protezione già in vigore per `executable_path`).

### Installazione runner-aware — fix architetturale

Scoperto analizzando il funzionamento di Proton: l'installazione creava **sempre** la prefix con `wine` di sistema (`wineboot --init`), indipendentemente dal runner selezionato nell'overlay — il runner scelto contava solo al lancio. Per Proton questo è doppiamente sbagliato: Proton non usa il path passato come WINEPREFIX diretto, lo tratta come `STEAM_COMPAT_DATA_PATH` e cerca/crea la prefix reale in `<path>/pfx` — una prefix creata "alla wine normale" nel path diretto viene semplicemente ignorata, e Proton ne bootstrappa una nuova a sua insaputa al primo lancio (esattamente cosa è successo con Soma: sembrava funzionare "con la stessa prefix", in realtà Proton ne aveva creata una diversa).

Aggiunta `resolveRunnerWineEnv()`: risolve binario (`wine64` bundled dentro l'installazione Proton specifica, non quello di sistema) e percorso reale (`<prefix>/pfx` per Proton, diretto per Wine-family) in base al runner catturato da `games.runner` al momento di avviare l'installazione (`DownloadTask.runner`, nuovo campo). Winetricks rispetta le stesse variabili `WINE`/`WINE64`/`WINESERVER` per restare coerente col binario giusto. `resolveProtonBin` estratta da `ProtonRunner` (privata) a funzione esportata, riusabile da `downloadManager.ts` senza duplicare la logica di ricerca.

### Script `test-game.sh`

Helper da terminale per il test protocol: `list` (titoli installati non verificati), `launch <nome>` (fuzzy match), `verify`/`unverify <nome> [auto|manual]`, `id <nome>`. Complementare al prompt automatico, utile per non riscrivere `curl`+parsing JSON a mano ogni volta.

### Annotazioni per il futuro

Registrata come nota di memoria l'idea di un vero **Process Manager** della dashboard (tracking multi-processo, blocco lancio simultaneo di più giochi, identificatore `xlaunch://id-gioco`) — non progettata nei dettagli, da riprendere come sessione dedicata.

## v0.99.90 alpha — Consolidamento pacchetto

Milestone di consolidamento: nessuna nuova feature, pacchetto completo con tutto il lavoro v0.99.36→v0.99.38 sopra descritto, verificato per coerenza sintattica (`tsc --noEmit` su tutti i file backend + `App.tsx`, zero errori) prima della distribuzione.

## v1.0.0-rc.1 — AI Advisor completo, fix di regressione, polish interfaccia

Milestone maggiore: chiude lo Step 15d (AI Advisor) dall'architettura fino a un'interfaccia utente completa, corregge due regressioni reali scoperte durante il test dal vivo, e sistema diversi dettagli di interfaccia rimasti aperti. Prima release candidate — vedi nota di allineamento versione/nome in fondo.

### AI Advisor — costruzione completa

**Interfaccia comune e Knowledge Base**: `AIProviderPlugin` astratta (`src/backend/aiProviders/base.ts`), sul modello di `StorePlugin`. Contratto a tre esiti (`suggestion` / `clarify` / `give_up`) invece di un singolo suggerimento — un provider può legittimamente non sapere, o aver bisogno di più informazioni, non solo proporre una soluzione. `kb-seed.json` ampliato da 17 a 34 pattern (componenti runtime mancanti, anti-cheat non supportati, limiti esync/fsync, prefix corrotte, problemi Vulkan/libGL, salvataggi case-sensitive).

**Cinque adapter**: Ollama (locale, gratis, primo banco di prova — API nativa `/api/chat`, timeout esteso a 90s dopo aver scoperto empiricamente il cold-start del modello), Gemini (SDK `@google/genai`, nota privacy sul tier gratuito), DeepSeek e ChatGPT (`OpenAICompatiblePlugin` parametrizzato, un solo adapter per il dialetto OpenAI-compatible), Claude (Anthropic Messages API diretta). Priorità di sviluppo esplicita: provider senza pagamento diretto richiesto prima di ChatGPT/Claude.

**Persistenza**: `ai_debug_attempts` (limite `MAX_AI_ATTEMPTS=3` per combinazione gioco+errore, storico dei tentativi falliti passato come contesto ai tentativi successivi, reset legato a una modifica manuale del compat profile — non a un timer), `ai_provider_credentials` (una riga per provider, `priority` per l'ordine di fallback, API key in chiaro — scelta esplicita coerente col resto del DB, da rivedere solo se cambiasse il modello di minaccia). Firma dell'errore normalizzata (indirizzi di memoria, PID, timestamp, path assoluti sostituiti con placeholder, righe ripetute deduplicate) prima dell'hash, condivisa tra tentativo e conferma KO per evitare che le due firme divergano.

**Collegamento a `notificationEngine.ts`**: quando `knowledgeBase.lookup()` non trova nulla per un `download-error`/`launch-error`, l'advisor prova i provider abilitati in ordine di priorità (fallback silenzioso se uno risponde `give_up`), poi traduce l'esito in una notifica — sempre etichettata `[EXPERIMENTAL]` (requisito fisso: un suggerimento AI richiede debug più lungo di un match KB, l'etichetta evita di caricare aspettative premature). Il ramo `suggestion` riusa l'interfaccia OK/KO già esistente per la Knowledge Base; il ramo `clarify` resta semplificato a testo informativo (una vera cascata di scelte multiple richiede un componente frontend nuovo, non ancora costruito — annotato in roadmap).

**Contatore budget token**: `ai_usage_log` (una riga per chiamata, qualunque esito — il costo è nella richiesta processata, non nel tipo di risposta), budget mensile configurabile condiviso tra tutti i provider (in `app.conf`, non per-provider). Mostrato sia in coda a ogni notifica AI sia nella tab Impostazioni, con barra di progresso colorata.

**UI di gestione**: nuova tab "AI Advisor" in Manage Accounts — **visibile solo se Ollama è raggiungibile** (verificato al boot e ad ogni apertura di Impostazioni, timeout 2s, nessuna sezione vuota se non è installato/in esecuzione). Elenco modelli Ollama già scaricati (dimensione, quantizzazione, etichetta di peso stimato sulla dimensione — euristica, non una vera lettura della VRAM libera) con selezione a toggle: premere A sulla riga già attiva **disattiva** Ollama, su un'altra riga la seleziona e lo riattiva — stesso comportamento a toggle dei runner e dei plugin, non una selezione a senso unico. Card per i quattro provider cloud: badge gratuito/a pagamento, toggle enable (stesso pattern a rettangolo-di-focus-come-azione dei plugin, prima mancante — si vedeva la selezione solo sul pulsantino interno), campo API key mascherato che apre la tastiera on-screen, pulsante "Testa connessione" (riusa `askForFix` con un messaggio banale — un vero giro di rete riuscito si riconosce da `usage.inputTokens > 0`, anche per un legittimo "non so", senza bisogno di un metodo di test dedicato per ogni provider).

**Fix di correttezza scoperto durante la costruzione**: la route di salvataggio credenziali faceva un rimpiazzo completo — attivare solo il toggle "enabled" senza reinserire l'API key l'avrebbe cancellata, dato che il frontend non vede mai il valore vero (sempre mascherato dalla GET). Ora è un aggiornamento parziale, preserva i campi non esplicitamente inviati.

### Regressioni reali scoperte e corrette

**Generi mai più mostrati per GOG/Epic/Steam** (Classic Console non ne risentiva): `COALESCE(NULLIF(games.genres, ''), excluded.genres)` confrontava il valore esistente con la stringa vuota `''`, ma un array vuoto serializzato in JSON è `'[]'`, non `''` — dal primo sync (i plugin inviano sempre `genres: []`, l'arricchimento reale arriva dopo da `metadataManager`) il valore restava bloccato su `'[]'` per sempre, scartando silenziosamente ogni arricchimento successivo. Fix: `NULLIF(NULLIF(games.genres, ''), '[]')`. Nessuna migrazione dati necessaria — il prossimo ciclo di arricchimento si autocorregge.

**Cursore mouse non più indipendente dal focus della finestra**: il meccanismo JS (timer di inattività) è per natura limitato dal throttling che Chromium applica ai timer nelle finestre senza focus di sistema — senza un click che dia focus almeno una volta, il timer poteva restare sospeso indefinitamente. Spostata la gestione a livello di server X: `tray.py` ora usa l'estensione XFixes (via `python-xlib`, dipendenza pip aggiuntiva nel venv del tray) per nascondere/mostrare il cursore in base all'inattività reale del puntatore, indipendente da Chromium.

**Race condition nel rilevamento chiusura gioco**: `isLastLaunchedGameRunning()` azzerava `lastLaunchedGame` come effetto collaterale non appena rilevava il processo morto — una semplice `curl` di diagnostica a `/api/system/game-running` poteva "consumare" la transizione prima che il polling interno la elaborasse, impedendo silenziosamente la segnalazione di un lancio fallito. Ora è di sola lettura; l'azzeramento è responsabilità esclusiva del polling, atomico con l'elaborazione.

**Cattura log di lancio**: stdout/stderr del processo di gioco venivano sempre scartati (`stdio: 'ignore'`) — quando wine "riesce" a partire (PID assegnato) ma l'eseguibile non esiste o crasha subito, l'errore andava perso per sempre (scoperto con Bioshock 2, eseguibile rinominato `.bak`). `WineRunner`/`ProtonRunner` scrivono ora su un file di log dedicato; il polling di chiusura distingue un'uscita entro 8s dal lancio (probabile fallimento, promosso a `launch-error` con il contenuto del log) da una sessione di gioco normale.

### Polish interfaccia

Auto-scroll del pannello info (una volta sola, non un loop, per i titoli notifica troppo lunghi — `ScrollOnceTitle`, con velocità proporzionale alla lunghezza del testo, non durata fissa), fix overflow-x implicito nel pannello notifiche (stesso bug già risolto altrove: `overflow-y-auto` senza `overflow-x-hidden` esplicito eredita `auto` sull'altro asse). Tastiera virtuale riscritta due volte: prima con `-`/`_` sulla stessa chiave (shift corretto, prima entrambi fissi), slash/backslash/chiocciola, due layout completi IT/EN-US selezionabili, poi ridisegnata nello schema tradizionale a 4 righe + barra spaziatrice (backspace fine riga numeri, invio fine riga centrale che chiude la tastiera, shift inizio ultima riga lettere) con una mappa di vicini espliciti e deterministica al posto dello scoring geometrico puro, dopo che una riga risultava irraggiungibile col pad.

### Non fatto in questa milestone

Ramo `clarify` dell'AI Advisor non interattivo (solo testo informativo). Process Manager, Console/Kiosk Mode v2 e sessione X11 dedicata via LightDM restano da riprendere come sessioni dedicate — vedi roadmap.

### Nota di allineamento versione

`package.json` aveva ancora `"name": "@alkali/applet"` e `"version": "0.99.0-alpha"` — residui mai allineati al progetto reale, deliberatamente rimandati fino al raggiungimento della v1.0. Allineati ora insieme al resto: `"name": "x-launcher"`, `"version": "1.0.0-rc.1"`.

## v1.0.5-rc.1 — Pulizia overlay, fix di navigazione, e un bug critico corretto

Milestone di consolidamento dopo la 1.0.0-rc.1: quattro richieste di pulizia sull'overlay Game Options, una lunga sessione di debug su un bug di scrolling genuinamente sottile, e — per onestà — un errore mio che ha causato una regressione seria, trovato e corretto nella stessa sessione.

### Overlay Game Options — pulizia

**Runner Bridge nascosta per Classic Console**: Proton/Wine-Lutris non c'entrano con RetroArch/DOSBox/ScummVM — mostrarli confondeva soltanto l'utente.

**Core RetroArch filtrati per sistema**: prima venivano elencati tutti i core installati indipendentemente dalla piattaforma della ROM (selezionare un core SNES non fa funzionare una ROM Mega Drive). Aggiunta una chiave canonica di sistema per ogni voce della mappa sistemi in `classicPlugin.ts`, con una lista di core compatibili per ciascuna. **Bug reale scoperto e corretto**: il campo `system` era stato aggiunto all'interfaccia TypeScript e impostato dal plugin, ma mai collegato allo schema del database — veniva perso ad ogni sincronizzazione, quindi il filtro non ha mai funzionato finché non è stata aggiunta la colonna, la migrazione e la lettura/scrittura effettive (verificato con SQLite reale, non solo a occhio). La sezione ora compare solo per `runner === 'RetroArch'`, non più per qualunque gioco Classic Console — un gioco DOS/ScummVM non mostra più né Runner Bridge né core RetroArch.

**Layout Compatibility Layer**: riquadri di dimensione uniforme (`min-h` fisso, prima dipendeva dalla lunghezza della descrizione di ciascuna voce); l'ultima voce dispari (5 su griglia a 2 colonne) resta nella propria colonna con lo spazio vuoto accanto, senza stirarsi a tutta larghezza — preferenza confermata dall'utente dopo un primo tentativo (stiramento) scartato.

**Barra di scorrimento dell'overlay**: mancava la classe `custom-scrollbar` usata ovunque nel resto della dashboard — l'overlay mostrava lo scrollbar nativo del browser invece dello stile coerente.

**Navigazione asimmetrica tra sezioni corretta**: scendendo da Runner Bridge la selezione saltava completamente Compatibility Layer arrivando a Executable Path, ma risalendo passava per tutte le voci di Compatibility Layer. Causa reale: Wine-Lutris (runner di default) non viene mai mostrato come switch — per un gioco senza altri runner installati, la card Runner Bridge resta visibile ma senza alcun elemento selezionabile dentro, sfasando lo scoring geometrico in modo diverso a seconda della direzione. Aggiunta una mappa di vicini espliciti (calcolata una volta con `useMemo`, tenendo conto di tutti e tre i possibili contenuti centrali: core RetroArch, Compatibility Layer, o nessuna opzione per DOS/ScummVM) che collega deterministicamente le tre sezioni in entrambe le direzioni.

### Pannello info — box descrizione

Vincolato a un'altezza massima flessibile (`flex-1 min-h-0 max-h-[400px]`) che non eccede mai lo spazio della colonna, calcolata dal browser stesso in base a cosa c'è sopra (titolo/tag più o meno numerosi) e se la console di debug è aperta — invece di soglie fisse per ogni caso limite scoperto via test. Tempi di lettura allungati (partenza dopo 4s, velocità ridotta, pause più lunghe alle inversioni).

**Bug di scrolling sottile scoperto e corretto**: su un titolo specifico (sinossi molto lunga) il testo non scorreva mai, in modo apparentemente incoerente. Causa reale, isolata con una sessione di diagnostica approfondita (misure dal vivo di `scrollHeight`/`clientHeight`/`scrollTop` frame per frame): il browser arrotonda `scrollTop` all'intero più vicino ad ogni lettura/scrittura — l'incremento per fotogramma di quel box specifico (~0.37px) restava sempre sotto la soglia di arrotondamento, quindi la parte frazionaria veniva scartata ad ogni fotogramma invece di accumularsi, perché il codice rileggeva il valore già arrotondato dal browser come base per il calcolo successivo. Corretto con un accumulatore proprio lato JavaScript, mai riletto dal browser.

### Un errore mio, trovato e corretto nella stessa sessione

Un `useMemo` aggiunto per il fix di navigazione sopra usava `selectedGame` prima della sua vera dichiarazione più avanti nel file — un `ReferenceError` che mandava in crash l'intero render ad ogni caricamento, causando uno schermo completamente nero. Trovato con un controllo `tsc` mirato sulla categoria di errore corretta (`TS2448`, "variabile usata prima della dichiarazione"), che il metodo di verifica precedente non includeva — controllavo solo alcune categorie specifiche. Il metodo di verifica è stato esteso di conseguenza per includere questa e categorie simili (`TS2304`, `TS2454`, `TS2451`) in tutte le verifiche future.

### Note minori
Legenda `L2 Download` / `R2 Notifications` aggiunta in fondo alla dashboard, accanto a `L1 R1 Jump Store`, stesso stile a "pill" rettangolare.

## v1.1.0 — Navigation Strategy layer + debug tooling permanente

Prima uscita del modello di navigazione "device-agnostic" discusso a partire dal documento Semantic Navigation Interface (SNI) fornito dall'utente. Non una riscrittura: un livello aggiuntivo sopra al motore geometrico esistente in `FocusProvider.tsx`, a costo di regressione zero per default.

### Cosa cambia

**`NavigationStrategy`** (`'geometric' | 'sequential'`), dichiarabile per `group` via `setGroupStrategy(group, strategy)`. Default `geometric` per qualunque group non esplicitamente migrato — comportamento bit-a-bit identico a v1.0.5 ovunque non si sia intervenuti.

**`cycleSequential(group, direction, { wrap?, fromId? })`**: per group concettualmente 1D (una lista, una riga di tab), naviga per ordine visivo (top→bottom, poi left→right) invece che per scoring geometrico — nessun `neighbors` scritto a mano necessario. Il parametro `fromId` disaccoppia il riferimento dal focus visivo globale, necessario quando il "punto di ciclo" è uno stato diverso dal focus corrente (vedi sotto).

**Primo gruppo migrato: `settings-tabs`**. `cycleSettingsTab` (L1/R1 nel pannello Impostazioni) non usa più l'`indexOf`/modulo scritto a mano su un array parallelo (`settingsTabCycleIds`, rimosso) — delega a `cycleSequential`. Beneficio concreto, non solo stilistico: quell'array duplicava a mano la condizione `ollamaAvailable` già presente nel JSX (la tab "AI Advisor" compare solo se Ollama è raggiungibile) — due fonti di verità da tenere sincronizzate. `cycleSequential` legge il pool dal registry live, quindi la tab esclusa si esclude da sola dal ciclo, senza alcuna lista di appoggio.

**Bug evitato in corso d'opera**: la prima versione di `cycleSequential` usava il focus visivo globale come riferimento per calcolare l'elemento successivo/precedente — sbagliato per `cycleSettingsTab`, il cui riferimento reale è "quale tab è attiva", non dove si trova il focus (che nella quasi totalità dei casi è dentro al contenuto della tab, non sul suo bottone). Senza correzione il ciclo sarebbe ripartito sempre dalla prima tab. Aggiunto il parametro `fromId` per ancorare esplicitamente il riferimento quando necessario.

### Regola di progetto inaugurata

**Ogni nuova implementazione nel sistema di navigazione deve prevedere uno strumento di debug spegnibile senza rimuovere codice.** Primo caso applicativo: `src/lib/navDebugBus.ts`, bus disaccoppiato da React con flag `enabled` persistito in localStorage — `emit()` è un confronto booleano quando spento, quindi resta nel codice in produzione permanentemente. `src/components/NavDebugOverlay.tsx`: pannello HUD (Ctrl+Alt+N per accendere/spegnere, stesso registro di Ctrl+Alt+B/K già in uso) che mostra, per ogni movimento: group, strategia usata (`geometric`/`sequential`/`neighbor-override`), direzione, id sorgente→destinazione, dettaglio (punteggio o indice). Agganciato anche ai rami *preesistenti* del motore geometrico, non solo al nuovo meccanismo — utile da subito per diagnosticare problemi vecchi.

### Validato su hardware reale (Arch Linux, RTX 3070)

Overlay Game Options, notifiche, download/installazione, menu X-Launcher, ciclo store, ciclo tab System, navigazione menu — tutto invariato rispetto a v1.0.5, come atteso dal design a costo-zero-per-default. Ciclo tab Settings verificato con Ollama sia attivo che disattivato (`systemctl stop ollama`): la tab "AI Advisor" scompare correttamente e il ciclo resta corretto fra le sole tab visibili, senza fermarsi su una tab fantasma.

### Non fatto in questa milestone

Migrazione di Runner Bridge/Compatibility Layer/core RetroArch (il caso reale che aveva originato i `neighbors` espliciti in v1.0.0) rimandata: quella sezione condivide oggi un solo `group="game-options"` fra contenuto genuinamente 1D (Runner Bridge, lista verticale pura) e contenuto 2D (Compatibility Layer, griglia a 2 colonne) — richiede prima di separare i sotto-gruppi, non solo dichiarare una strategia. Notifiche non migrate per lo stesso motivo: header con coppia orizzontale + card con bottoni ok/ko o primary/secondary affiancati, non un elenco 1D puro.

## v1.1.1 — Fix architetturale: `sequentialChain` con asse esplicito + pulizia overlay Classic Console/Custom Env

Continuazione diretta di v1.1.0: la migrazione delle righe Custom Env Variables alla catena sequenziale ha esposto un bug strutturale nel meccanismo stesso, non nel singolo caso d'uso.

### Bug scoperto: la catena intercettava anche il movimento laterale

`sequentialChain` trattava sia `down` che `right` come "avanti nella catena". Risultato concreto: il pulsante elimina a fianco di ogni riga env-var era **irraggiungibile da controller** — premendo destra sulla riga, la catena rispondeva prima che il `neighbors` dichiarato sul pulsante elimina avesse la possibilità di essere controllato, portando invece alla riga successiva (o fuori scala, se era l'ultima).

**Fix**: aggiunto `chainAxis` (`'vertical' | 'horizontal'`, default `'vertical'`) a `RegistryItem`/`Focusable`/`register`. La catena ora risponde solo alla direzione del proprio asse primario — l'ortogonale passa direttamente al controllo `neighbors` sottostante, mai intercettata. Aggiunto il collegamento esplicito mancante `right → envvar-del-{idx}` sulla riga (il pulsante elimina aveva già `left → envvar-{idx}` fin da v1.1.0, ma senza un neighbor simmetrico sulla riga stessa e senza il guard sull'asse, non veniva mai raggiunto).

Correzione trattata come fix del meccanismo generale, non pezza sul singolo caso: qualunque futura catena mista (elementi in sequenza + un'azione laterale collegata) beneficia dello stesso guard, senza bisogno di reintrodurlo.

### Custom Env Variables — pulizia aggiuntiva

Sezione nascosta per Classic Console (stesso trattamento di Runner Bridge): una ROM funziona o non funziona con l'emulatore/core scelto, non ha env var da passare. KEY e VALUE unificati in un solo campo editabile per riga (`envvar-{idx}`, formato "KEY=VALUE"), invece dei due campi separati raggiungibili solo con sx/dx — coerente con la stessa richiesta di riduzione dei casi speciali di navigazione discussa per il resto dell'overlay.

### Verifica

`tsc --noEmit` (stesse flag del progetto): diff vuoto rispetto al baseline pre-modifica, nessun errore nelle categorie critiche (`TS2448/TS2304/TS2454/TS2451`), nessuno nelle zone toccate.

**Validato su hardware reale**: pulsante elimina raggiungibile con destra da ogni riga, sinistra torna alla riga, su/giù dal pulsante non scavalca su altre righe, navigazione verticale fra le righe invariata rispetto a prima del fix.

## v1.1.2 — Runner Bridge e core RetroArch migrati a `sequentialChain`

Proseguimento diretto della migrazione: entrambe le sezioni erano già liste verticali pure (un solo Focusable per riga, nessuno split laterale) — candidati diretti per la stessa catena sequenziale introdotta con le righe Custom Env Variables, senza bisogno di ulteriori generalizzazioni al meccanismo.

- Runner Bridge → `sequentialChain="game-options-runner-bridge"`
- Core RetroArch → `sequentialChain="game-options-retroarch-cores"`

I confini (`overlayNavAnchors.lastRunnerBridgeId`/`firstMiddleId`/`lastMiddleId`, calcolati nella `useMemo` esistente) restano `neighbors` espliciti invariati: la catena copre solo la navigazione interna a ciascuna lista, l'uscita verso la sezione successiva/precedente resta un singolo link di confine per lista, non uno per riga.

**Compatibility Layer non migrata, deliberatamente**: è una griglia reale a 2 colonne, non una lista 1D — `sequentialChain` assume un ordine unidimensionale e romperebbe i salti fra colonne. Resta `geometric`, gli unici `neighbors` restano quelli di confine (primo/ultimo elemento verso Runner Bridge/Executable Path) già presenti da v1.0.0.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al baseline, nessun errore nelle categorie critiche né nelle zone toccate.

## v1.1.3 — Due bug scoperti in test su hardware reale

### Ingresso dal pulsante di chiusura

Il pulsante di chiusura (`game-options-close`, cerchio rosso in alto a destra) non aveva mai un `neighbors` esplicito. Scendendo da lì, lo scoring geometrico puro atterrava direttamente sulla colonna destra di Compatibility Layer, scavalcando per intero Runner Bridge e i core RetroArch — lo stesso genere di bug già visto e risolto altrove nell'overlay, qui rimasto perché il pulsante di chiusura non fa parte di nessuna lista migrata.

**Fix**: aggiunto `firstOverlayContentId` alla `useMemo` `overlayNavAnchors` esistente — calcola il vero primo elemento del corpo (prima Runner Bridge se presente, poi la sezione centrale, altrimenti `field-executablePath` come fallback sempre garantito per Classic Console non-RetroArch) — e un `neighbors={{ down: ... }}` esplicito sul pulsante di chiusura. In debug questo hop compare come `neighbor-override` (un confine, non traversata interna di catena) — coerente con lo stesso trattamento già dato a tutti gli altri punti di ingresso/uscita di sezione.

### Overlay tagliato ai bordi per giochi Wine/Proton

Il modal era un unico contenitore con `max-h-[80vh] overflow-y-auto` che includeva header e corpo insieme. Per giochi Wine/Proton, dove compaiono più sezioni (Runner Bridge, Compatibility Layer/core RetroArch, Custom Env Variables, Dipendenze Wine, Game Config), il contenuto arrivava a eccedere l'altezza disponibile e veniva tagliato sopra/sotto invece di scorrere in modo prevedibile.

**Fix**: ristrutturato in header fisso (`shrink-0`, mai soggetto a scroll) + corpo scrollabile separato (`flex-1 overflow-y-auto`), contenitore esterno con `max-h-[85vh] flex flex-col overflow-hidden` — il modal intero non supera mai l'85% dell'altezza viewport, indipendentemente da quante sezioni compaiono, e titolo/pulsante di chiusura restano sempre completamente visibili.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti del baseline (confrontati ignorando i numeri di riga, shiftati dal codice aggiunto in `overlayNavAnchors`), zero errori nuovi.

## v1.1.4 — Fix impaginazione: mancava `min-h-0`

Il fix di v1.1.3 (header fisso + corpo scrollabile separato) non risolveva davvero il problema segnalato: l'overlay restava tagliato, anzi peggiorato. Causa: un figlio flex (`flex-1`) con `overflow-y-auto` ma senza `min-h-0` non si comprime MAI sotto l'altezza naturale del proprio contenuto — è il default CSS (`min-height: auto` per i flex item), non un bug isolato di questo progetto. Il corpo cresceva quanto voleva; l'unico vincolo reale restava l'`overflow-hidden` del contenitore esterno, che tagliava il risultato invece di farlo scorrere. Con l'header ora fisso in alto, il taglio si vedeva anche più netto, perché l'header sottraeva altezza utile senza che il corpo guadagnasse davvero uno scroll funzionante.

**Fix**: aggiunto `min-h-0` al corpo scrollabile.

`tsc --noEmit`: diff vuoto rispetto al baseline (ignorando i numeri di riga).

## v1.1.5 — Fix radice reale: `vh` non è relativo al canvas virtuale di `ScalingContainer`

I fix di v1.1.3 e v1.1.4 non risolvevano il problema segnalato (overlay ancora tagliato a 2560×1440) perché entrambi partivano da una diagnosi sbagliata (comportamento di flexbox). La causa reale è strutturale: `ScalingContainer.tsx` renderizza un **canvas virtuale fisso di 1920×1080px**, poi lo scala con `transform: scale(min(windowWidth/1920, windowHeight/1080))` per riempire lo schermo reale — a 2560×1440 il fattore è 1.333×.

`vh` in CSS fa sempre riferimento al **viewport reale del browser**, mai a un ancestor scalato via `transform` — per specifica, un ancestor con `transform` diventa il containing block per i discendenti `position: fixed` (motivo per cui `inset-0` sul backdrop dell'overlay si dimensiona correttamente sul canvas 1920×1080), ma questo non cambia come `vh` viene risolto. Risultato concreto: `max-h-[85vh]` calcolava 85% di 1440px **reali** = 1224px, dentro un contenitore di layout alto solo 1080px — il modal eccedeva il proprio contenitore già prima di essere scalato/ingrandito visivamente dal transform, che poi amplificava ulteriormente lo sconfinamento.

**Fix**: sostituito `max-h-[85vh]` con `max-h-[85%]`. Una percentuale si risolve contro il contenitore reale (1080px di layout), indipendentemente dal fattore di scala — corretto a qualunque risoluzione fisica, non solo a 1920×1080.

**Nota per il futuro**: qualunque nuovo overlay/modal in quest'app deve usare percentuali o valori fissi in px relativi al canvas 1920×1080, mai unità `vh`/`vw` — sono strutturalmente incompatibili con `ScalingContainer`.

`tsc --noEmit`: diff vuoto rispetto al baseline.

## v1.1.6 — Menu X-Launcher > Manage Accounts > tab System

### Bug di navigazione: confine asimmetrico fra Runner installabili e Tool di sistema

Stessa classe di bug già vista più volte in questa sessione: il ritorno (`disk-usage-refresh → up → system-tools-area`) aveva un `neighbors` esplicito da sempre, ma l'andata no — scendendo dall'ultima riga di Runner installabili, lo scoring geometrico saltava per intero la card "Tool di sistema" (larga e bassa) atterrando direttamente su "↻ Aggiorna" sotto Spazio disco.

**Fix**: aggiunto `neighbors.down = 'system-tools-area'` sull'ultima riga Runner installabili. Caso limite gestito: se l'ultimo elemento dell'array risultasse già installato (mostra solo un badge statico, nessun Focusable), l'indice "ultima riga" viene calcolato come l'ultima riga che renderizza *davvero* un Focusable, non l'ultimo indice dell'array — altrimenti il link sarebbe finito su una riga inesistente come elemento navigabile.

### Widget informativi senza azione: anello di selezione rimosso

Tool di sistema e Spazio disco sono `Focusable` con `onEnter={() => {}}` — restano tappe di navigazione per continuità su/giù, ma non offrono alcuna interazione. Su richiesta esplicita, l'anello di selezione blu (`ring-2 ring-blue-400`, lo stesso segnale usato ovunque per "questo è attivabile con A") è stato rimosso per questi due soli casi: il focus resta funzionalmente identico, ma non produce più alcun feedback visivo — nessun colore alternativo, invisibile del tutto, come richiesto.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al baseline.

## v1.1.7 — Confine mancante in risalita + stesso bug `vh` nel modal Settings

### Risalita da Tool di sistema

Bug speculare a quello di v1.1.6: `system-tools-area` aveva `neighbors.down` ma mai `neighbors.up` — risalendo da lì, lo scoring geometrico atterrava su "runners-refresh" (Aggiorna Runner installabili) invece che sull'ultima riga installabile. Aggiunto il confine mancante, con lo stesso calcolo "ultima riga con Focusable reale" di v1.1.6 — ora condiviso in un solo punto (spostato a monte del blocco tab System) invece di duplicato, così i due confini (uscita in discesa, ingresso in risalita) non possono più andare fuori sincrono fra loro.

### Overlay Manage Accounts tagliato — stesso bug strutturale di v1.1.5

Il modal Settings/Manage Accounts usava `h-[80vh]` — non solo lo stesso problema di `vh` non relativo al canvas virtuale 1920×1080 di `ScalingContainer`, ma un'altezza **fissa** anziché un tetto massimo: a 2560×1440 forzava 1152px reali dentro un contenitore di soli 1080px di layout, eccedendo sempre, indipendentemente dal contenuto della tab attiva.

**Fix**: `h-[80vh]` → `h-[80%]`. Aggiunto anche `min-h-0` mancante sul corpo scrollabile (stesso fix di v1.1.4). Verificato che non restano altri usi di `vh`/`vw` nel file.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al baseline.


## v1.1.8 — Tab Input e AI Advisor

### AI Advisor: stesso bug del pulsante di chiusura

`close-settings` (condiviso da tutte le tab del modal Settings) non aveva mai un `neighbors.down` — stesso bug già risolto in v1.1.3 per l'overlay Game Options, qui però il primo elemento corretto dipende dalla tab attiva, non è un id fisso. Calcolato per le tab dove è determinabile con certezza senza dipendere da stato per-riga (`engine`, `plugins`, `input`, `ai-models`); `accounts` resta invariata perché il suo primo elemento dipende dallo stato di connessione per store, più rischioso da calcolare alla cieca.

### Schema controller ridisegnato

Il gamepad di test (`GamepadTester.tsx`) aveva i comandi affollati in un'altezza insufficiente. La sagoma del corpo è stata scalata verticalmente di un fattore 1.35 sulle sole coordinate Y del path SVG — le curve di Bézier sono affini-invarianti, quindi il risultato è la stessa curva "stirata" esattamente, non un'approssimazione — e tutti i controlli (D-pad, tasti, stick, dorsali) sono stati ridistribuiti con margini verticali più generosi nello spazio così liberato, non semplicemente scalati insieme al corpo.

### Area di test controller: selezionabile con modalità cattura

Su richiesta, l'area di test è ora un `Focusable` (`gamepad-test-area`). Mentre ha il focus, il loop di polling principale sospende ogni interpretazione normale degli input (navigazione, cicli store, azioni A/X/Y/B, L1/R1/L2/R2) — altrimenti ogni pressione durante il test avrebbe attivato anche una funzione reale della Dashboard. Unica eccezione: una pressione prolungata di B (~1s) riporta alla navigazione normale (`moveFocus('up')`, riusando lo stesso meccanismo di confine di sezione già stabilito in questa sessione, non un id hardcoded). Suggerimento visivo ("Tieni premuto B per uscire") con barra di avanzamento e bordo ambra distintivo, mostrati solo quando l'area ha il focus — un utente che non intuisse il gesto altrimenti resterebbe bloccato senza indicazioni.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al baseline, sia per `App.tsx` che per `GamepadTester.tsx`.

## v1.1.9 — Stick destro non aggiornava il test + LED al posto della barra

### Stick destro "funzionava" solo se mosso insieme al sinistro

Bug reale in `useGamepad.ts`, non nel widget di test: il controllo che decide se propagare un nuovo stato a React guardava **solo i pulsanti**, mai gli assi. Muovere uno stick da solo non cambia alcun pulsante — e lo stick sinistro sintetizza pulsanti direzionali virtuali (`Left`/`Right`/`Up`/`Down`, per la navigazione menu via stick) solo oltre una soglia di deflessione (`XInputPlugin.ts`) — quindi il destro, che non sintetizza nulla, non faceva mai scattare l'aggiornamento di stato da solo. Muovendolo insieme al sinistro, quest'ultimo (oltre soglia) sintetizzava un pulsante e faceva scattare l'aggiornamento, che trascinava con sé anche gli assi correnti — compreso il destro, dando l'illusione che funzionasse solo in quel caso.

**Fix**: il controllo `changed` ora considera anche le variazioni degli assi (soglia 0.03 per ignorare il rumore hardware dello stick a riposo senza perdere reattività al movimento reale).

### Barra di avanzamento sostituita con LED a tre stati

Su segnalazione (barra troppo lunga, visibilmente coperta solo a metà): rimossa, sostituita con un LED — rosso quando l'area di test ha il focus (input catturati), giallo durante la pressione prolungata di B (uscita imminente), verde quando i controlli sono sbloccati (navigazione normale).

### Verifica

`tsc --noEmit`: pulito su `GamepadTester.tsx` e `useGamepad.ts`; diff vuoto rispetto al baseline su `App.tsx`.

## v1.1.10 — LED duplicato e timer di uscita che non avanzava mai

### LED doppio nell'area di test

Il pallino "connesso" accanto a "Test input live" duplicava il LED a tre stati sotto, sempre verde e quindi fuorviante. Rimosso — resta un solo indicatore, quello di stato navigazione/test.

### Il LED non passava mai a giallo durante la pressione di B

Causa reale: il calcolo della durata della pressione viveva dentro l'effetto principale di polling, che si riesegue solo quando `gamepadState` cambia (nuovo pulsante o asse, per via del fix v1.1.9). Un B tenuto premuto fermo, senza muovere alcuno stick, non cambia nulla frame dopo frame — quell'effetto semplicemente non si rieseguiva durante l'attesa, e il progresso restava fermo al valore del primo istante invece di avanzare.

**Fix**: la rilevazione della pressione prolungata è stata spostata in un `useEffect` dedicato, con un proprio `setInterval` (50ms) che legge `InputManager` direttamente — indipendente dal meccanismo "changed" di `useGamepad.ts` (che esiste per un altro scopo: evitare re-render inutili in tutta l'app, non misurare durate di pressione). Attivo solo mentre l'area di test ha il focus.

### Verifica

`tsc --noEmit`: diff vuoto su `App.tsx`, pulito su `GamepadTester.tsx`.

## v1.1.11 — Ritardo visivo prima dell'uscita effettiva dal test controller

Su richiesta: al raggiungimento della soglia di pressione prolungata, l'uscita avveniva nello stesso istante in cui il giallo terminava — il verde non era mai visibile, si saltava dritti al menu X-Launcher.

**Fix**: al raggiungimento della soglia, il LED passa subito a verde (`gamepadTestExiting` forza `captureActive` a `false` lato widget), e solo dopo un breve ritardo (400ms) avviene l'uscita effettiva (`moveFocus('up')` + suono). Il rilevamento della pressione si ferma durante questa finestra, per non rielaborare input mentre l'uscita è già decisa.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al baseline.

## v1.1.12 — Debug tab AI Advisor

### Scroll non resettato al cambio tab

Il focus atterrava correttamente sul modello locale installato all'apertura della tab, ma lo scroll del corpo restava dov'era (avanzato da un'altra tab o da una navigazione precedente) — nascondendo l'introduzione "funzione sperimentale". Focus e scroll sono due cose distinte: il primo era giusto, il secondo no. Aggiunto un reset esplicito di `scrollTop` a ogni cambio di `activeSettingsTab`.

### Cancellazione API key

Prima non esisteva alcuna route per rimuovere una credenziale provider salvata — solo `upsertAiProviderCredential` (sovrascrittura). Aggiunta `deleteAiProviderCredential` (db.ts) + route `DELETE /api/ai/providers/:id` (server.ts) + pulsante "Rimuovi key" in UI, visibile solo quando c'è davvero una key salvata o in bozza.

### Chiarimenti (nessun bug, verificato nel codice)

- **Provider multipli attivi**: non è ambiguo — `orchestrator.ts` prova i provider abilitati+configurati in ordine di `priority` crescente, fallback silenzioso al successivo se uno risponde `give_up`. Il modello locale (Ollama) ha sempre `priority: 0` (App.tsx, riga del toggle), i provider cloud `priority ≥ 1` nell'ordine di `CLOUD_PROVIDERS` — quindi il locale viene **sempre** tentato per primo se attivo, i cloud sono un fallback, non un'alternativa a scelta ambigua. Nessun meccanismo di mutua esclusione stile "runner custom" necessario: il design è già una catena di fallback, non una scelta esclusiva — ma la UI oggi non comunica questo ordine, gap di chiarezza da considerare per il futuro.
- **Errore "API key not valid" su Gemini**: nessun bug nel codice — `gemini.ts` passa la key nel modo corretto per l'SDK ufficiale `@google/genai`, e l'errore mostrato è il messaggio grezzo restituito direttamente da Google (`generativelanguage.googleapis.com`), non un'invenzione del client. Causa più probabile: una API key creata per uno scopo diverso (es. generica di Google Cloud, con restrizioni per dominio/API) invece di una key dedicata da https://aistudio.google.com/apikey.
- **Nessun login per i provider cloud**: corretto così, non manca nulla — Gemini/DeepSeek/ChatGPT/Claude sono integrazioni pure API-key based (REST stateless), la registrazione avviene sul sito del provider (fuori da X-Launcher), la key generata lì è l'unica credenziale richiesta qui.

### Verifica

`tsc --noEmit`: diff vuoto su `App.tsx`; nessun errore nuovo su `db.ts`/`server.ts` (confrontato contro un baseline con lo stesso module flag).

## v1.1.13 — Modello Gemini di default ritirato

Con una API key valida (dopo v1.1.12), il test di connessione falliva comunque con 404: `models/gemini-2.5-flash-lite is no longer available to new users`. Non un bug del client — Google ha ritirato quel modello per i progetti/API key creati dopo un certo punto (confermato via ricerca: la generazione attuale è la serie Gemini 3.x, 2.5-flash-lite non è più assegnabile a nuove key pur restando documentato per progetti esistenti).

**Fix**: `DEFAULT_MODEL` in `gemini.ts` aggiornato a `gemini-3.1-flash-lite` — equivalente attuale generalmente disponibile (GA) nella stessa fascia costo/latenza. Nessun altro riferimento al nome del modello deprecato altrove nel codice (verificato).

### Verifica

`tsc --noEmit`: pulito su `gemini.ts`.

## v1.1.13 — Race condition scroll, clipboard di sistema, riga provider cloud

### Scroll ancora non in cima: era una race condition, non la risoluzione

Il fix v1.1.12 (reset scrollTop a 0) partiva troppo presto: `FocusProvider` anima già uno scroll-to-center verso l'elemento appena a fuoco (30ms di attesa + 220ms di animazione, vedi `setFocusedId`) — quell'animazione arrivava DOPO il mio reset e lo sovrascriveva parzialmente, portando la vista in una via di mezzo invece che davvero in cima. Non era una questione di risoluzione/finestra: il reset a `scrollTop=0` resta corretto e universale, andava solo fatto vincere per ultimo. Ritardato a 280ms (oltre la durata totale dell'animazione).

### Pulsante "Incolla" nella tastiera virtuale

Nuovo tasto nell'header della tastiera (`VirtualKeyboard.tsx`), accanto al selettore lingua: legge la clipboard reale del sistema (`navigator.clipboard.readText()`, non un buffer interno alla Dashboard) e la aggiunge in fondo al campo attivo — utile soprattutto per valori generati altrove e mai digitati a mano, come le API key. Feedback breve se la clipboard è vuota o non accessibile (permesso negato).

### Riga campo/test/rimuovi in AI Advisor: stesso bug delle righe env-var

Nessun `neighbors` esplicito fra campo API key, "Testa connessione" e "Rimuovi key" — scoring geometrico puro su una riga di 2-3 elementi ravvicinati, stessa categoria di bug già vista e risolta per le righe Custom Env Variables. Applicata la stessa soluzione: `sequentialChain` orizzontale (`chainAxis="horizontal"`) per l'intera riga.

### Verifica

`tsc --noEmit`: diff vuoto su `App.tsx`; pulito su `VirtualKeyboard.tsx`.

### In sospeso

Errore "API key non valida" persistente anche con una key appena generata — in attesa dello screenshot dell'errore per una diagnosi mirata.

## v1.1.13 — Scroll AI Advisor, navigazione provider cloud, pulsante Incolla

### Scroll ancora non risolto del tutto — causa reale trovata

Il reset istantaneo di v1.1.12 perdeva la "gara" contro l'animazione di centraggio automatico di FocusProvider: quest'ultima parte 30ms dopo il cambio tab e anima per 220ms, ri-centrando l'elemento appena a fuoco — vincendo sul mio reset sincrono e lasciando comunque coperta parte dell'intestazione.

**Fix**: il reset ora è ritardato (280ms, oltre la fine dell'animazione di centraggio) così vince come ultima parola invece che come prima.

### Navigazione riga API key/Test/Rimuovi

Confermato nel codice: campo, pulsante Test e pulsante Rimuovi condividevano un'unica riga orizzontale senza alcun `neighbors` esplicito — scoring geometrico puro fra 2-3 elementi ravvicinati, la stessa categoria di inaffidabilità già risolta più volte in questa sessione per le righe env-var e Runner Bridge/core RetroArch.

**Fix**: applicato `sequentialChain` orizzontale (`cloud-provider-row-${id}`) a tutti e tre gli elementi — navigazione sx/dx deterministica per ordine visivo, non più per punteggio geometrico soggetto a comportamento incoerente a seconda di quali elementi risultano montati in un dato momento.

### Pulsante "Incolla" nella tastiera virtuale

Aggiunto in `VirtualKeyboard.tsx`, nell'header condiviso da ogni campo di testo della Dashboard (non solo l'API key — qualunque campo che usa la tastiera on-screen). Legge la clipboard reale del sistema (`navigator.clipboard.readText()`), non un buffer interno alla Dashboard — un vero "copia da fuori, incolla qui" per valori generati altrove (API key, in primis) mai pensati per essere ridigitati a mano. Feedback breve se la clipboard è vuota o non accessibile (permesso negato/API non disponibile in questo contesto), invece di fallire silenziosamente.

**Nota**: dipende dal permesso Clipboard-Read del browser nell'ambiente kiosk — se il permesso non risultasse concesso di default, potrebbe servire un flag di lancio Chromium dedicato; da verificare al primo test reale.

### Verifica

`tsc --noEmit`: diff vuoto su `App.tsx`; pulito su `VirtualKeyboard.tsx`.

## v1.1.14 — Due bug reali dietro i sintomi persistenti in AI Advisor

### Scroll: il conto del ritardo era sbagliato

280ms non bastava: il cambio tab imposta il focus tramite un proprio `setTimeout(50ms)` (vedi `onEnter` del pulsante tab) PRIMA che l'animazione di centraggio di FocusProvider parta — che a sua volta attende altri 30ms e dura 220ms. Il conto reale è 50+30+220 = 300ms dal cambio tab, non 250. Il reset a 280ms scadeva 20ms troppo presto, perdendo di nuovo la gara per un soffio.

**Fix**: ritardo portato a 400ms, con margine di sicurezza oltre il conto esatto.

### Toggle provider cloud: due bug distinti, non uno

1. La variabile `prevRowToggle` (usata come `neighbors.up` di ogni toggle) puntava al **campo API key** del provider precedente (`cloud-provider-key-…`), non al suo **toggle** (`cloud-provider-toggle-…`) — nome e comportamento disallineati fin dall'introduzione. Risalendo da un toggle non si tornava mai al toggle sopra, ma al suo campo (a volte nemmeno montato, se quel provider non era abilitato).
2. Il toggle non ha mai avuto un `neighbors.down` esplicito verso la propria riga (campo/test/rimuovi): scendendo, lo scoring geometrico saltava l'intera riga e atterrava direttamente sul toggle del provider successivo — spiegando esattamente il sintomo riportato ("posso solo attivare/disattivare il servizio", risolvibile solo scendendo al provider dopo e tornando su per un effetto collaterale della prima risalita esplicita, non una vera soluzione).

**Fix**: rinominata la variabile (`toggleUpNeighbor`) e corretto il valore per puntare davvero al toggle precedente; aggiunto `toggleDownNeighbor`, calcolato in base allo stato (`enabled` → primo elemento della riga; altrimenti → toggle del provider successivo).

### Verifica

`tsc --noEmit`: diff vuoto rispetto al baseline.

## v1.1.15 — Ristrutturazione tastiera virtuale: un solo campo di testo, lingua/incolla come tasti fisici

### Bug reale trovato: il campo fluttuante non seguiva mai il campo in modifica

Il riquadro fluttuante sopra la tastiera (quello "visibile dal divano") era agganciato **sempre** a `searchQuery`, indipendentemente da quale campo si stesse davvero modificando (`executable_path`, `custom_env`, opzioni di lancio...) — editando uno di questi, il riquadro restava vuoto o mostrava il placeholder di ricerca invece del valore vero. Un bug concreto, non solo un limite di design, coerente con lo screenshot allegato.

### Ristrutturazione su richiesta

- **Un solo campo di testo**: rimossa l'intestazione interna della tastiera (etichetta/valore/contatore caratteri) — l'unico punto dove leggere e correggere il testo è ora il riquadro fluttuante sopra, che ora riflette correttamente `activeField` quando presente (con etichetta del campo, icona dedicata) o `searchQuery` altrimenti. Supporta testo lungo: va a capo (non più troncato con un puntino su una riga) e scorre internamente oltre una certa altezza.
- **Lingua e Incolla come tasti fisici**: spostati dall'header (rimosso) alla riga della barra spaziatrice, ai lati — stessa riga logica ai fini della mappa di vicini della tastiera, navigazione sx/dx/su/giù deterministica come ogni altro tasto.

### Verifica

`tsc --noEmit`: pulito su `VirtualKeyboard.tsx`; diff vuoto su `App.tsx`.

## v1.1.16 — Shift come selettore di suggerimenti contestuali + tip esplicativo

### Launch Arguments e Custom Env Variables: suggerimenti alternativi via Shift

Su richiesta: premendo Shift mentre si modifica il campo giusto, i completamenti di default (.com/.exe/ecc.) lasciano il posto a una lista curata specifica per il contesto:

- **Launch Arguments** (`field-launchArgs`): 7 flag comuni per giochi Windows via Wine/Proton (`-windowed`, `-noborder`, `-dx9`, `-nointro`, `-novid`, `-high`, `-nojoy`) — non sono flag che Wine interpreta, ma che il motore di gioco stesso riconosce; scelti perché coprono le classi di problemi più comuni sotto Wine/Proton (fullscreen esclusivo, video di intro, ecc.), a basso rischio (un gioco che non li supporta li ignora).
- **Custom Env Variables** (righe `envvar-*`): lista diversa a seconda che `selectedGame.runner` contenga "proton" (case-insensitive) o meno — variabili Proton (`PROTON_LOG`, `DXVK_ASYNC`, ecc.) contro variabili Wine "pure" (`WINEESYNC`, `WINE_LARGE_ADDRESS_AWARE`, ecc.).

Shift continua a fare anche il suo lavoro normale (maiuscolo/minuscolo) — l'alternativa si applica solo ai chip di completamento rapido, e solo per i campi che ne hanno una.

**`insertMode` per suggerimento**: i completamenti di default restano "append" (comportamento originale), i launch argument usano "append-space" (si accodano separati da spazio, non incollati al flag precedente), le variabili d'ambiente usano "replace" (un campo rappresenta una variabile alla volta — selezionarne una sostituisce l'intero valore, non lo concatena).

### Tip contestuale

Su richiesta: quando un suggerimento (Launch Arguments o Custom Env) ha il focus — anche solo sfogliandolo con D-pad/stick, prima di premere A — un breve commento appare nell'intestazione del campo fluttuante, sotto l'etichetta ("Variabile #1 — KEY=VALUE"), spiegando cosa abilita esattamente. I completamenti di default non hanno tip (non ne hanno bisogno).

### Bug critico intercettato in corso d'opera

Il calcolo del set di suggerimenti (`keyboardAltSuggestions`) referenziava `selectedGame` da un punto del file dichiarato PRIMA della vera dichiarazione di `selectedGame` più in basso — lo stesso errore reale già documentato per `overlayNavAnchors` in v1.0.0 (schermo nero ad ogni caricamento). Il controllo `tsc` mirato sulla categoria `TS2448`, esteso permanentemente da quell'incidente, l'ha segnalato immediatamente — spostato subito dopo la dichiarazione di `selectedGame`, accanto a `overlayNavAnchors`, con un commento che rimanda esplicitamente a quel precedente.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al baseline, zero errori nelle categorie critiche (`TS2448/TS2304/TS2454/TS2451`); pulito su `VirtualKeyboard.tsx`.

## v1.1.17 — Nuova modalità catena 'flow' per liste che vanno a capo in modo imprevedibile

### Bug: chip di suggerimento lunghi non navigabili in modo coerente

Con 7 variabili d'ambiente (molto più lunghe delle estensioni file originali), la riga dei suggerimenti va a capo in modo non uniforme — 6 chip su una riga, 1 solo sulla successiva, centrato senza allinearsi a nessuna colonna sopra. Lo scoring geometrico su una riga `flex-wrap` con elementi di larghezza variabile produce salti incoerenti (destra→giù→su→un tasto della tastiera sottostante), la stessa classe di problema affrontata più volte in questa sessione, qui aggravata dal fatto che il punto di a-capo non è nemmeno prevedibile in anticipo (dipende dal contenuto).

### Fix: `chainAxis: 'flow'`

Generalizzato il meccanismo `sequentialChain` con una terza modalità, oltre a `'vertical'`/`'horizontal'`: `'flow'` cattura **tutte** le direzioni (giù e destra = avanti, su e sinistra = indietro), facendo comportare l'intera lista come un'unica sequenza in ordine di lettura, indipendente da dove il testo va effettivamente a capo. Applicata ai chip di suggerimento della tastiera virtuale (`keyboard-suggestions`).

### Verifica

`tsc --noEmit`: pulito su `VirtualKeyboard.tsx`; diff vuoto su `App.tsx`.

## v1.1.18 — Custom Env "solo installazione": switch per-riga, non persistente

Su richiesta: possibilità di marcare una singola Custom Env Variable come valida solo per la prossima installazione, senza scriverla mai nel profilo di compatibilità permanente.

### Design

Interruttore per-riga (stesso stile pill di plugin/runner), acceso di default:
- **Acceso ("Persistente")** — comportamento invariato rispetto a prima: scritta in `compat_profiles.custom_env`, riletta ad ogni lancio futuro. Chi ha già variabili salvate non nota alcuna differenza.
- **Spento ("Solo install.")** — non scritta MAI nel profilo persistente. Applicata una sola volta al processo dell'installer nel momento in cui si preme INSTALLA, poi non esiste più da nessuna parte — non per una cancellazione attiva, ma perché semplicemente non è mai stata salvata nel posto che il lancio del gioco rilegge.

Caption esplicita sotto ogni riga ("Salvata: verrà applicata anche a ogni lancio futuro" / "Non salvata: verrà applicata solo alla prossima installazione, poi dimenticata") — il colore da solo non era ritenuto sufficiente per comunicare una differenza di comportamento con conseguenze pratiche.

### Persistenza tracciata per KEY, non per indice di riga

`customEnvPersistentFlags: Record<string, boolean>`, chiave = KEY della variabile — sopravvive ad aggiunta/rimozione/riordino di righe, a differenza di un indice numerico. Migrazione del flag gestita esplicitamente quando un KEY viene rinominato (altrimenti il flag "solo installazione" andrebbe perso silenziosamente, tornando persistente per errore).

### Flusso di installazione

Snapshot delle variabili non persistenti catturato nell'istante in cui si preme INSTALLA (non alla conferma successiva): a differenza di `winetricksVerbs`/`useKnownFixes`, che hanno una copia nel database da cui ri-leggere in modo sicuro al momento della conferma, queste variabili per costruzione non vengono mai scritte nel DB — l'unica finestra affidabile per leggerle è quella cattura iniziale. Propagate tramite `pendingAction.installOnlyEnv` → `POST /api/downloads/start` → `DownloadTask.installOnlyEnv` → iniettate nell'ambiente dei processi installer (wine/winetricks/innoextract) in `downloadManager.ts`, seguendo lo stesso pattern già stabilito per `disableWineSync`.

### Navigazione controller

Catena laterale estesa di uno step: campo → switch persistenza → elimina (prima campo → elimina soltanto), con confine esplicito ad ogni passo — stessa logica già stabilita per questa riga in questa sessione, non lasciata allo scoring geometrico.

### Verifica

`tsc --noEmit`: diff vuoto su `App.tsx` e `server.ts`; nessun errore nuovo su `downloadManager.ts` (l'unico presente è lo stesso pre-esistente e non correlato già noto da `db.ts`).

## v1.1.19 — Fix reale: la disattivazione della persistenza non veniva mai salvata

Bug confermato tramite test reale: spegnendo lo switch "solo installazione" su una variabile, questa restava comunque scritta nel profilo persistente — al riavvio ricompariva come "prima riga" (l'unica voce in `profile.customEnv`), marcata di nuovo "Persistente".

### Causa

`commitLines` leggeva sempre `customEnvPersistentFlags` dalla closure del render in cui era stata creata. Il toggle di persistenza aggiornava lo stato (`setCustomEnvPersistentFlags`) e richiamava `commitLines` nello stesso gestore — ma la funzione richiamata era comunque quella catturata PRIMA dell'aggiornamento, quindi calcolava la persistenza usando il valore VECCHIO (opposto a quello appena impostato). Stesso identico problema nella migrazione del flag alla rinomina di un KEY.

### Fix

`commitLines` accetta ora un parametro esplicito `flagsOverride`. Toggle e rinomina calcolano la mappa aggiornata in modo sincrono e la passano direttamente, invece di affidarsi al timing di React per la propagazione dello stato — lo stesso genere di lezione (non fidarsi di una chiusura per un valore che sta cambiando nello stesso istante) già vista più volte in questa sessione per la navigazione, qui applicata alla logica dati.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al baseline.

## v1.1.20 — Due bug reali: card non aggiornate dopo install/uninstall, conteggi Store Accounts filtrati

### Card non si aggiornano dopo installazione/disinstallazione

Confermato: il backend legge sempre fresco dal database (`gameManager.getGames()` — "Legge sempre dal DB, fonte di verità unica"), nessuna cache stantia lato server. Il vero problema: né il completamento di un'installazione né una disinstallazione avvisavano mai il frontend che la libreria era cambiata. L'unico canale che innesca un refetch (`library-updated` via SSE) era agganciato solo a `gameManager.onLibraryRefreshed` — un refresh periodico/watcher, non l'esito di un'azione utente diretta. La card restava con lo stato vecchio finché non arrivava un `library-updated` per un altro motivo (da cui l'illusione che "cercare" risolvesse: cercare fa un fetch nuovo che casualmente mostra il dato corretto, non ripara nulla di per sé) o un riavvio completo.

**Fix**: `downloadManager.onComplete` e la route `DELETE /api/games/:id/uninstall` ora chiamano esplicitamente `notifyLibraryUpdated()` dopo un esito positivo — stesso canale già usato per i refresh periodici, semplicemente agganciato anche a questi due eventi che prima non lo toccavano.

### Conteggi Store Accounts filtrati dalla navigazione corrente

Confermato: `Synced`/`Installed` per store venivano calcolati filtrando l'array `games` — lo stesso stato usato dalla dashboard per mostrare la libreria, che riflette qualunque filtro di navigazione attivo in quel momento (store selezionato, ricerca). Navigando "Tutti i giochi" i conteggi risultavano giusti per coincidenza (nessun filtro store attivo); navigando un singolo store, `games` conteneva solo quel sottoinsieme — gli altri store mostravano sempre zero. Non un comportamento voluto.

**Fix**: nuovo stato dedicato `allGamesForAccountCounts`, popolato con una fetch indipendente (`/api/games?store=All`) quando la tab Store Accounts diventa visibile — mai influenzato da cosa si sta navigando nella dashboard.

### Verifica

`tsc --noEmit`: diff vuoto su `App.tsx`; stessi errori pre-esistenti (solo shiftati di riga) su `server.ts`.

## v1.1.21 — Il gioco "dimenticava" di essere installato: causa reale trovata

Il fix v1.1.20 (notifica al completamento) funzionava correttamente per l'aggiornamento immediato — confermato dall'utente: la card risultava installata subito, con notifica. Il problema successivo aveva una causa diversa e più subdola.

### Causa

`syncExternalInstallStates()` (gameManager.ts) rigira ogni 5 minuti (`startPeriodicRefresh`) e, per GOG, ricontrolla lo stato installato leggendo il filesystem: cerca `goggame-*.info` nella cartella `files/` e vi risolve l'eseguibile primario (`resolveGogExe`). Se questa risoluzione fallisce per un titolo specifico — cartella presente, ma il parsing del metadato non va a buon fine per qualche ragione propria di quel gioco — il sync trattava il fallimento come "disinstallato", **anche se il gioco era stato appena installato con successo e la notifica di completamento già mostrata**. Il prossimo giro di questo sync (fino a 5 minuti dopo) rimarcava silenziosamente `isInstalled=false`, e la successiva notifica `library-updated` propagava questo stato scorretto a ogni vista aperta in quel momento — spiegando "sparisce da All Games e anche tornando su GOG", nonostante il fix del punto precedente.

Un incidente simile (race condition più stretta, sync contro un'installazione ancora in corso) era già stato diagnosticato e in parte corretto in v0.99.35 — quella correzione escludeva però solo i task **attivi**, non copriva il caso di un fallimento di parsing su un'installazione già **conclusa**.

### Fix

Il controllo non è più simmetrico: rilevare un'installazione resta ottimista (cartella + eseguibile risolto → installato), ma **revertire** uno stato già installato ora richiede un segnale forte — la cartella `files/` deve essere realmente assente (vera disinstallazione esterna), non semplicemente "resolveGogExe non è riuscito a interpretarla". Se la cartella esiste ma il parsing fallisce, lo stato resta invariato e viene loggato un warning esplicito per indagine, invece di revertire silenziosamente uno stato già confermato corretto.

### Nota per il futuro

Lo stesso rischio esiste in teoria anche per il sync Epic (`legendary list-installed --json` potrebbe non riflettere ancora un'installazione appena conclusa) — non toccato in questa modifica perché richiederebbe aggiungere un timestamp di completamento al `DownloadTask` (non esiste ancora) per un caso non ancora confermato, non solo analogo. Da considerare se si presenta lo stesso sintomo su un titolo Epic.

### Come verificare che fosse davvero questa la causa

Il pannello Log dovrebbe mostrare, nella finestra tra l'installazione e la "sparizione", una riga `[SYNC] GOG rimosso rilevato: <titolo>` — con questo fix, quella stessa situazione produce invece `[SYNC] GOG — <titolo>: cartella "files/" presente ma resolveGogExe non ha trovato...` senza toccare `isInstalled`.

### Verifica

Nessun errore nuovo su `gameManager.ts` (confrontato per contenuto, non solo conteggio righe, contro l'esecuzione precedente).

## v1.1.22 — Corsa fra fetch indipendenti della libreria: causa reale trovata

Il fix v1.1.21 (GOG sync asimmetrico) affrontava una causa reale ma non era quella all'origine del sintomo più grave descritto: card che si aggiorna correttamente per un istante e poi torna da sola allo stato precedente, stabile anche per minuti, corretto solo da un riavvio completo.

### Causa

Verificato che il backend scrive sempre il database in modo sincrono, PRIMA di notificare il completamento (nessuna corsa lato server, sia per GOG che per Epic — stesso ordine sincrono `this.update()` → `completeCallbacks`). Il problema era lato frontend: **due percorsi indipendenti** chiamano entrambi `/api/games` e poi `setGames(...)` — l'effetto legato ad `activeStore`/filtri (con un proprio `AbortController`, che protegge solo contro se stesso quando i filtri cambiano) e l'handler dell'evento SSE `library-updated` (un fetch completamente separato, nessun coordinamento con l'altro). Se il secondo fetch (avviato dopo, con dati corretti — es. appena finita un'installazione) si risolve prima del primo (avviato prima, con dati vecchi, solo più lento a rispondere per normale varianza di rete), il risultato vecchio sovrascrive quello corretto **per ultimo** — e nulla lo corregge finché non arriva un altro fetch che vince la stessa corsa nella direzione giusta, cosa che può non capitare mai se l'utente resta sulla stessa vista.

### Fix

Numero di sequenza globale (`librarySeqRef`): ogni fetch cattura il proprio numero all'avvio, e applica il risultato a `setGames` solo se nessun fetch più recente è stato avviato nel frattempo. L'ultimo ad **essere avviato** vince sempre, non l'ultimo a **rispondere** — il fix standard per questa classe di corsa (risposte asincrone fuori ordine), applicato a entrambi i punti che chiamano `/api/games`.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al baseline.

## v1.1.23 — Causa radice reale trovata: refreshLibrary sovrascriveva isInstalled senza pietà

I fix precedenti (v1.1.20 notifica, v1.1.21 sync GOG asimmetrico, v1.1.22 guard di sequenza) erano tutti reali e corretti, ma nessuno toccava la causa che produceva il sintomo più severo: la card tornava "non installata" in modo stabile, non autocorrettivo nemmeno dopo minuti.

### Causa

`gameManager.refreshLibrary()` — chiamata non solo dal timer periodico (5 minuti), ma anche dal watcher Steam, dal watcher ROM, dalla route di refresh manuale, e dall'abilitazione di un plugin — ricostruisce la libreria da zero da quello che ogni plugin store restituisce (`plugin.getLibrary()`) e la scrive nel database con `db.upsertGames(allGames)`. Il plugin GOG (`gogPlugin.ts`) marca **ogni** titolo `isInstalled: false` di base (è la libreria cloud, l'elenco di tutto ciò che possiedi, non ciò che hai installato), corretto solo tramite `installed.json` di Heroic Games Launcher — uno strumento di terze parti che non sa nulla delle installazioni fatte tramite X-Launcher — o un controllo debole ("la cartella ha contenuti", senza verificare che contenga un eseguibile reale). `upsertGame` (db.ts) scrive `isInstalled` **incondizionatamente** da quello che riceve, senza mai confrontarlo con il valore già presente nel database.

Risultato: ogni volta che `refreshLibrary()` girava per QUALUNQUE motivo (non serviva nemmeno che riguardasse GOG — bastava un file `.acf` di Steam modificato altrove, o un refresh manuale), l'intero elenco veniva riscritto da capo, e un gioco appena installato correttamente da X-Launcher (quindi sconosciuto sia a Heroic sia al controllo debole del plugin) veniva silenziosamente riportato a `isInstalled=false` — cancellando quanto scritto correttamente pochi istanti prima da `downloadManager`.

### Fix

Prima di `db.upsertGames(allGames)`, ogni gioco viene confrontato con lo stato già presente nel database: se risulta già installato lì (`existing.isInstalled === true`) e il plugin restituisce `false`, il valore del plugin viene ignorato — non un downgrade silenzioso, ma una preservazione esplicita dello stato già confermato. Un'elevazione (false→true, quando il plugin trova davvero una prova) resta invece accettata senza condizioni: solo il downgrade è quello a rischio, coerente con lo stesso principio asimmetrico già applicato in v1.1.21 a `syncExternalInstallStates` — l'unica fonte autorizzata a confermare una vera disinstallazione esterna resta quel controllo più rigoroso (verifica `goggame-*.info`), non la ricostruzione generica da `plugin.getLibrary()`.

### Verifica

Nessun errore nuovo su `gameManager.ts` (stesso errore pre-esistente, solo spostato di riga).

## v1.1.24 — Causa radice reale (probabilmente quella vera): la connessione SSE veniva chiusa e riaperta ad ogni cambio store

Confermato dall'utente che i fix precedenti (v1.1.20→v1.1.23), pur essendo tutti reali e verificati nel codice, non chiudevano il problema — sintomo identico prima e dopo, deterministico: cambiare store fa tornare la card allo stato precedente all'installazione/disinstallazione, sempre, non a intermittenza.

### Causa

L'effetto che gestisce la connessione SSE (`new EventSource('/api/events')`, il canale attraverso cui il server notifica `library-updated`) aveva `activeStore, searchQuery, sortBy, sortOrder, selectedGenre, selectedCategory, showGameOptions` nella propria dependency array. Ad **ogni** cambio di store o filtro, React chiudeva la connessione esistente (`es.close()`) e ne apriva una nuova da zero.

Una connessione EventSource non ha alcun motivo di dipendere da cosa l'utente sta navigando — è un canale generico "la libreria è cambiata da qualche parte", non specifico per store o filtro. Chiuderla e riaprirla ad ogni cambio di tab crea una finestra di disconnessione durante la quale un evento `library-updated` emesso dal server (es. l'installazione appena confermata) non ha **nessun client in ascolto** — perso silenziosamente, mai riprocessato. Le card sembravano aggiornarsi "per un attimo" solo grazie al fetch normale legato alla navigazione fra store, per poi restare bloccate sull'ultimo stato noto (quello da prima dell'azione), perché l'evento che avrebbe dovuto propagare il cambiamento reale non è mai arrivato — non un problema di scrittura sul database (già verificato solido nei fix precedenti), ma di un messaggio perso per una disconnessione non necessaria.

### Fix

La connessione SSE ora si apre una sola volta (dependency array `[]`) e resta viva per tutta la sessione, invece di essere ricreata ad ogni cambio di store/filtro. L'handler legge `activeStore` e gli altri valori necessari da ref sincronizzati (`activeStoreRef`, già esistente; `searchQueryRef`/`sortByRef`/`sortOrderRef`/`selectedGenreRef`/`selectedCategoryRef`/`showGameOptionsRef`, aggiunti ora) — stesso pattern già stabilito nel progetto per `focusedIdRef`, non dalla propria closure di montaggio, che sarebbe sempre quella iniziale con una connessione persistente.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al baseline, zero errori nelle categorie critiche.

## v1.1.25 — Diagnostica mirata (nessuna nuova ipotesi, solo prove)

Dopo quattro fix reali (v1.1.20→v1.1.24), tutti verificati riga per riga e tutti indirizzati a cause concrete nel codice, il sintomo resta identico secondo l'utente: card che torna allo stato precedente cambiando store, stabile fino al riavvio. Un dettaglio nuovo emerso durante la diagnosi (l'overlay di un gioco segnalato come installato non ha alcun percorso eseguibile, e il lancio conferma l'assenza del percorso) indica un'incoerenza fra `isInstalled` e `executablePath` nello stesso record — un problema di dati, non solo di tempistica del fetch.

Verificato che `uninstallGame()` pulisce correttamente sia `isInstalled` sia `executablePath` (`db.updateGameConfig` con tutti i campi a `null`), e che i percorsi calcolati da `uninstallGame` e dal plugin GOG per determinare se un gioco è installato coincidono esattamente (stesso slug, stessa struttura `Games/GOG/<slug>/files`) — quindi non è un disallineamento di percorsi.

Invece di un quinto tentativo basato su analisi statica del codice, aggiunta diagnostica mirata per raccogliere prove dirette al prossimo test:

- `db.ts` — `updateGameStatus()` logga il valore di `isInstalled` PRIMA e DOPO ogni scrittura, con il titolo del gioco.
- `db.ts` — `upsertGame()` (chiamata da `refreshLibrary()` per ogni gioco) logga SOLO quando `isInstalled` o `executablePath` cambiano rispetto a quanto già in DB — evita rumore per la stragrande maggioranza dei giochi il cui stato non cambia mai.
- `server.ts` — la route `GET /api/games` logga lo store richiesto e quanti giochi risultano installati nella risposta.

Tutti i log passano dal sistema di log esistente (pannello Log nell'interfaccia), non da `console.log` — coerente con la convenzione già stabilita nel progetto.

### Verifica

`tsc --noEmit`: nessun errore nuovo su `db.ts`/`server.ts` (stessi errori pre-esistenti, solo spostati di riga).

### Prossimo passo

Riprodurre install→cambio store→uninstall→cambio store con questi log attivi, e leggere nel pannello Log la sequenza esatta di scritture (`[DB] updateGameStatus`/`[DB] upsertGame`) e letture (`[API] GET /api/games`) per il gioco coinvolto — questo dovrebbe mostrare con certezza CHI riscrive `isInstalled` in modo scorretto e QUANDO, invece di continuare a ipotizzare.

## v1.1.26 — Due bug confermati dai log reali, non più ipotesi

I log inviati dall'utente (install GOG "Art Of Fighting 2" → cambio store) hanno fornito la prova diretta che i fix precedenti cercavano di indovinare. Due bug distinti, entrambi dentro `refreshLibrary()`:

### Bug A — `executablePath` cancellato indipendentemente da `isInstalled`

```
[DB] upsertGame "Art Of Fighting 2": isInstalled true→true | executablePath ".../ArtOfFighting2.exe"→"(vuoto)"
```

La protezione di v1.1.23 scattava solo quando il plugin tentava di abbassare `isInstalled` a `false`. Qui il plugin GOG restituisce già `isInstalled=true` (corretto — la cartella ha contenuti), quindi quella condizione non si attivava mai — ma lo stesso oggetto del plugin non conosce l'`executablePath` specifico (un dettaglio noto solo all'installer di X-Launcher, mai al plugin), e quel campo veniva scritto vuoto sopra il valore corretto ad ogni singolo giro di `refreshLibrary()`.

### Bug B — `isInstalled` ribaltato a `false` nella seconda fase (arricchimento metadati)

```
[DB] upsertGame "Art Of Fighting 2": isInstalled true→false | executablePath ".../ArtOfFighting2.exe"→"(vuoto)"
```

Accaduto SOLO per il gioco appena installato (gli altri 4 titoli GOG già installati da prima non venivano toccati nello stesso log) — sospetto la cache di `metadataManager.enrichGameMetadata()`, che segue un percorso diverso (vere chiamate di rete) per un gioco mai arricchito prima, a differenza dei titoli già cacheati che ritornano prestissimo. La causa esatta non è stata isolata con certezza, ma non è necessaria per la difesa.

### Fix

Protezione precedente (v1.1.23) generalizzata in un metodo condiviso (`protectInstalledState`), che copre **entrambi** i campi (`isInstalled` E `executablePath`) e viene applicato **prima di ogni singola chiamata a `upsertGames()`** — sia nella Fase 1 (persistenza immediata) sia nella Fase 2 (arricchimento metadati, una seconda invocazione separata che prima non aveva alcuna protezione). Ogni applicazione rilegge lo stato DB più recente al momento della chiamata, non uno snapshot preso una sola volta a inizio funzione — cattura quindi anche scritture intermedie fra le due fasi.

### Verifica

Nessun errore nuovo su `gameManager.ts` (stesso errore pre-esistente e non correlato in `db.ts`, solo spostato di riga).

### Prossimo passo

Ripetere lo stesso identico test (install → cambio store) con questi log ancora attivi — la sequenza dovrebbe ora mostrare `executablePath` preservato in entrambe le fasi e `isInstalled` mai ribaltato a `false` per un gioco appena installato.

## v1.1.27 — Causa reale trovata (confermata dai log): cache di metadataManager restituiva l'intero oggetto stantio

Grazie al secondo giro di log (uninstall dopo il test di install, ormai stabile): l'installazione resta persistente attraverso ogni cambio di store — confermato dall'utente, i fix v1.1.23/v1.1.26 hanno chiuso quella parte. La disinstallazione, invece, continuava a "perdersi" al cambio store — ma stavolta la Fase 1 di `refreshLibrary()` si è dimostrata corretta (nessuna riscrittura errata, il plugin correttamente riporta `isInstalled=false` dopo la rimozione dei file). La colpa era altrove: la **Fase 2** (arricchimento metadati).

### Causa

`metadataManager.enrichGameMetadata()` mantiene una cache interna per evitare ri-fetch inutili verso SGDB/IGDB. Il problema: un cache-hit restituiva **l'intero oggetto gioco cacheato** — non solo i campi di metadato (cover, rating, generi, descrizione) che la cache dovrebbe davvero velocizzare, ma anche `isInstalled`, `executablePath`, `status` e ogni altro campo volatile, congelati al valore che avevano al momento della PRIMA elaborazione di quel gioco. Un titolo arricchito una prima volta mentre installato, poi disinstallato, veniva rimesso "installato" con il vecchio percorso ad ogni successivo `refreshLibrary()` — non un problema di scrittura sul database (le protezioni v1.1.23/v1.1.26 restano corrette e necessarie per i loro casi), ma un dato in **ingresso** già sbagliato che nessuna protezione a valle poteva riconoscere come tale, perché arrivava travestito da "questo è lo stato attuale".

### Fix

Il cache-hit ora restituisce il gioco **fresco** (`game`, passato in ingresso ad ogni chiamata — sempre aggiornato da chi chiama, cioè `refreshLibrary()`) con sopra solo i campi che l'arricchimento tocca davvero (`coverImage`, `previewImage`, `rating`, `genres`, `description`, `releaseDate`, `hltbHours`, `achievements`) presi dalla cache. Ogni altro campo — `isInstalled`, `executablePath`, `status`, `prefixPath`, `launchArgs`, `runner`, ecc. — viene sempre dal valore fresco, mai dalla cache.

### Verifica

`tsc --noEmit`: un solo errore, pre-esistente e non correlato (pacchetto opzionale `howlongtobeat` non installato in questo sandbox, dynamic import invariato dalla modifica).

## v1.1.28 — Notifiche: auto-dismiss troppo aggressivo + messaggio errato sul display mode

### "Notifica duplicata" dopo installazione — chiarito, non un vero duplicato

Il flusso di installazione GOG/Epic genera legittimamente **due** notifiche distinte per lo stesso gioco: `known-fixes-result` (dipendenze rilevate/applicate, durante l'installazione) e `download-completed` (completamento finale). Non è mai stato trovato un percorso che duplichi la STESSA notifica — sono due eventi diversi, ravvicinati nel tempo, entrambi relativi allo stesso titolo.

Il vero bug: **entrambe** avevano type `success`/`info` con auto-dismiss dopo soli 6 secondi — sia in `pushNotification` (frontend, locale) sia, duplicata con la stessa soglia, nell'handler SSE che riceve le notifiche dal backend. Un'installazione completata (`type: 'success'`) che scompare da sola in 6 secondi produce esattamente il sintomo descritto: se il pannello viene aperto anche solo un po' più tardi, la notifica risulta già `dismissed` — niente pulsante di chiusura (nascosto di proposito per le notifiche già chiuse), titolo che ha già terminato il suo scorrimento singolo (`ScrollOnceTitle`).

**Fix**: `success` non si auto-dismette più — un esito significativo come "gioco installato" resta visibile finché l'utente non lo chiude esplicitamente. `info` (avvisi genuinamente transitori: toggle modalità schermo, passaggio a desktop, dipendenze rilevate) continua ad auto-chiudersi dopo 6 secondi, comportamento voluto per quel tipo. Le due implementazioni duplicate (frontend locale + handler SSE) sono state allineate.

### Messaggio errato sul cambio modalità schermo

`applyDisplayMode()` mostrava "Applicato immediatamente — nessun riavvio necessario" per ogni cambio di modalità (Finestra/Fullscreen/Kiosk). Verificato nel codice: la funzione aggiorna solo lo stato React interno e persiste la preferenza su `/api/config` — che `kiosk-launch.sh` legge solo al **prossimo avvio**, non ha alcun effetto sulla sessione corrente. Confermato anche da test su hardware reale dall'utente. Messaggio corretto per riflettere la realtà: "Preferenza salvata — sarà attiva al prossimo riavvio della Dashboard."

### Verifica

`tsc --noEmit`: diff vuoto rispetto al baseline.

## v1.1.29 — Notifiche ripetute per lo stesso gioco: sostituiscono, non si affiancano

Conseguenza diretta del fix v1.1.28 (le notifiche 'success' non si auto-chiudono più): installazioni/disinstallazioni ripetute dello stesso gioco (tipico durante i test, ma anche un utente che disinstalla e reinstalla) producevano notifiche identiche impilate una sopra l'altra, mai ripulite da sole.

**Fix**: una nuova notifica sostituisce quella precedente ancora aperta (`status: 'pending'`) se ha lo stesso `gameId` **e** lo stesso `title` esatto — non solo lo stesso tipo, per non rischiare di sostituire per errore due notifiche diverse ma entrambe 'success' per lo stesso gioco. Applicato sia a `pushNotification` (locale) sia all'handler SSE (notifiche dal backend, incluso "gioco installato").

### Verifica

`tsc --noEmit`: diff vuoto rispetto al baseline.

## v1.1.30 — Lancio Epic via `legendary launch`: risolve i titoli con verifica EOS severa

Causa confermata con fonti dirette (discussione tecnica su PCGamingWiki dedicata a SIFU, issue reali GitHub legendary/Heroic): alcuni titoli Epic (SIFU è il caso concreto segnalato) verificano di essere stati avviati tramite il launcher ufficiale, richiedendo argomenti di autenticazione specifici — un `exchangecode` valido, `-EpicPortal`, `-epicuserid`, ecc. — che solo il vero launcher o `legendary launch` sanno costruire correttamente al momento del lancio. Il lancio diretto dell'eseguibile via Wine/Proton (il meccanismo usato finora per tutti gli store, GOG incluso) salta del tutto questo passaggio: funziona per i giochi Epic "semplici", produce `"Unable to detect if the game was launched through the Epic Games Launcher"` per gli altri.

### Fix

Nuova funzione `launchEpicViaLegendary` (`src/backend/runners/implementations.ts`), usata per **tutti** i lanci di giochi Epic Games (non solo quelli con verifica severa — non serviva distinguerli, legendary gestisce comunque entrambi i casi in modo identico per l'utente). Continua a usare il runner Wine/Proton già configurato dall'utente per quel gioco specifico — stesso binario, stessa prefix — tramite i flag di legendary verificati da issue reali:
- **Wine**: `legendary launch <AppName> --wine <wineBin> --wine-prefix <prefix>`
- **Proton**: `legendary launch <AppName> --no-wine --wrapper "'<protonBin>' run"`, con `STEAM_COMPAT_DATA_PATH`/`STEAM_COMPAT_CLIENT_INSTALL_PATH` nell'ambiente

Il campo Executable Path nell'overlay non cambia — resta il riferimento informativo (percorso risolto da `goggame-*.info`/legendary info), la reale invocazione del gioco per lo store Epic passa ora sempre da qui, in modo trasparente. Nessun nuovo controllo in UI: il cambiamento è scoped esclusivamente a `game.store === 'Epic Games'`, gli altri store (GOG, Steam, Classic Console) restano sul percorso di lancio invariato.

### Verifica

`tsc --noEmit`: pulito su `implementations.ts`; diff vuoto su `gameManager.ts`.

## v1.1.31 — Rilevamento "gioco ancora in esecuzione" inaffidabile per i lanci Epic

Conseguenza diretta di v1.1.30 (lancio Epic via `legendary launch`): il PID tracciato per decidere quando ripristinare la Dashboard (`isLastLaunchedGameRunning`, basato su `process.kill(pid, 0)`) è quello di `legendary`/del wrapper Proton, non del gioco vero. Quel processo top-level può terminare poco dopo aver avviato il gioco — comportamento normale di legendary/proton, che delega la supervisione effettiva più in basso nell'albero dei processi, non un bug del gioco. Risultato osservato: la Dashboard si riduceva a icona correttamente al lancio, ma si ripristinava a schermo intero poco dopo come se il gioco si fosse chiuso — mentre il gioco (SIFU, TMNT) continuava a funzionare regolarmente. La Dashboard riaperta in background continuava a intercettare gli input del controller, causando navigazione/lanci casuali. La stessa falsa transizione innescava anche una notifica di errore spuria (la soglia "chiusura sospetta" di v0.99.90, pensata per crash reali entro 8s dall'avvio).

### Fix

Per i soli giochi Epic, `lastLaunchedGame` porta ora anche un `processNameHint` (il basename dell'eseguibile risolto, es. `SIFU.exe`). Quando presente, `isLastLaunchedGameRunning()` verifica per **nome di processo** (`pgrep -f`) invece che per PID — sopravvive a qualunque processo intermedio (legendary/proton) che esca prima del gioco vero. Gli altri store (GOG, Steam, Classic Console) restano sul controllo PID diretto, invariato — nessun rischio di regressione lì.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al check precedente.

## v1.1.32 — Periodo di grazia per l'avvio dei giochi Epic via legendary

Il fix v1.1.31 (controllo per nome processo invece che per PID) era corretto in sé, ma il log reale ha mostrato un problema distinto: il poll (ogni 4s, timer già attivo da un lancio precedente nella stessa sessione del daemon) può scattare anche solo 20-50ms dopo l'avvio di `legendary` — molto prima che l'eseguibile Windows del gioco compaia davvero nell'elenco processi, perché l'autenticazione EOS online e il bootstrap di Proton richiedono diversi secondi. "Non ancora partito" veniva confuso con "non è mai partito", producendo lo stesso sintomo di prima (Dashboard ripristinata prematuramente, notifica di fallimento spuria) nonostante il gioco si avviasse regolarmente subito dopo.

### Fix

Aggiunto un periodo di grazia di 30 secondi per i soli lanci Epic: se il processo non è ancora MAI comparso (`processNameSeenAtLeastOnce` non ancora impostato) ed è passato meno tempo del periodo di grazia dal lancio, il controllo continua a riportare "in esecuzione" invece di dichiarare fallimento. Una volta visto comparire almeno una volta, torna a comportarsi come un controllo immediato — una sparizione successiva è sempre trattata come chiusura reale, senza ritardo.

### Compromesso noto, dichiarato onestamente

Un'installazione Epic che fallisse DAVVERO all'avvio (il gioco non parte proprio) verrebbe rilevata solo dopo questi 30 secondi, invece che quasi subito — e la classificazione "fallimento rapido vs sessione normale" (soglia separata, 8 secondi, invariata) potrebbe non etichettarla più come "sospetta". Compromesso accettato deliberatamente: un falso allarme durante un gioco che funziona (il sintomo appena corretto) è un problema più serio di un messaggio di log meno preciso per un caso di fallimento genuino, comunque raro.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al check precedente.

## v1.1.33 — Inibizione screensaver/gestione energetica durante il gioco

Su richiesta: con solo il controller collegato (nessun mouse/tastiera a resettare il timer di inattività), lo screensaver/DPMS spegneva lo schermo e bloccava la sessione dopo un certo tempo di gioco, richiedendo la password per rientrare — un problema serio per un setup pensato per essere usato dal divano.

### Fix

Doppio livello di inibizione, per coprire configurazioni diverse (varia a seconda di come XFCE/la distribuzione gestiscono screensaver e blocco sessione):
- **`xset s off -dpms`** — disattiva l'estensione screensaver X11 e lo spegnimento automatico del monitor. Copre la maggior parte dei blocca-schermo su X11 (incluso xfce4-screensaver/light-locker in molte configurazioni), che osservano il timer di inattività di questa stessa estensione.
- **`systemd-inhibit --what=idle:sleep:handle-lid-switch`** — copre il caso in cui sospensione/blocco siano invece gestiti da logind indipendentemente da X11.

Agganciato allo stesso ciclo di vita già usato per il rilevamento "gioco in esecuzione" (v1.1.31/v1.1.32): l'inibizione parte esattamente al lancio riuscito, si rilascia esattamente quando la chiusura del gioco viene confermata reale (non durante il periodo di grazia). Il processo sentinella `systemd-inhibit` non è detached — se il demone stesso crashasse, il processo sentinella morirebbe con lui e l'inibizione si rilascerebbe automaticamente, nessun rischio di restare bloccati con lo screensaver disattivato per sempre.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al check precedente.

## v1.1.34 — Causa reale: xset falliva silenziosamente per mancanza di DISPLAY

Confermato dal log: il demone gira sotto systemd, che (stesso motivo già documentato per `buildSafeEnv` in `downloadManager.ts`) non garantisce `DISPLAY` nell'ambiente ereditato dal processo Node. Le chiamate a `xset` in v1.1.33 non passavano alcun `env` esplicito — ereditavano l'ambiente del demone così com'è, quasi certamente senza `DISPLAY`, fallendo con "unable to open display". Il log "Screensaver/sospensione inibiti" veniva comunque scritto (non condizionato all'esito di `xset`), dando falsa sicurezza. Il solo livello `systemd-inhibit` (che non necessita di `DISPLAY`) restava attivo, ma inibisce l'idle di **logind** — XFCE gestisce il proprio timer di spegnimento schermo in modo nativo X11, indipendente da logind, quindi lo schermo si spegneva comunque al timeout DPMS configurato in XFCE Power Manager (i ~10 minuti osservati).

### Fix

`xset` ora riceve esplicitamente `DISPLAY: process.env.DISPLAY ?? ':0'` (stesso fallback già stabilito in `buildSafeEnv`). Un fallimento non è più silenzioso: se `xset` fallisce, viene loggato un errore esplicito con il `DISPLAY` usato e il messaggio d'errore — così una futura diagnosi non richiede di ripetere da capo lo stesso lavoro investigativo. Il log di conferma include ora anche l'esito di `xset` (`ok`/`FALLITO`), non solo la conferma generica.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al check precedente.

## v1.1.35 — Diagnosi precedente sbagliata: non è un problema di DISPLAY, è xset non trovato

Il log ha mostrato l'errore reale: `spawnSync xset ENOENT` — non un problema di accesso al display (la diagnosi di v1.1.34), ma il binario `xset` che non viene proprio trovato. Il fix precedente aggiungeva `DISPLAY` all'ambiente ma non toccava `PATH`, quindi non poteva risolvere questo caso specifico.

### Fix

Distinzione esplicita su `err.code === 'ENOENT'`: se il binario non si trova, il log ora dice chiaramente `"xset non trovato ... pacchetto mancante. Su Arch: sudo pacman -S xorg-xset"` invece del messaggio generico e fuorviante di prima. `PATH` ricostruito esplicitamente (stesso pattern di `buildSafeEnv` in `downloadManager.ts`, `~/.local/bin` + percorsi di sistema standard prepended) per escludere un PATH troncato come causa, prima di concludere che manca il pacchetto.

### Prossimo passo

Verificare se `xorg-xset` è installato (`which xset` o `pacman -Qs xset`); se assente, installarlo risolve direttamente, dato che il resto del meccanismo (chiamata xset, DISPLAY, PATH) è già corretto — il codice era pronto, mancava solo il binario sul sistema.

### Verifica

`tsc --noEmit`: diff vuoto rispetto al check precedente.

## v1.1.36 — Velocità di download Epic mai mostrata: causa reale trovata

Confermato con issue GitHub dirette (legendary/Heroic): il download via `legendary install` scrive percentuale e velocità su **due righe separate**, mai insieme:
```
[DLManager] INFO: = Progress: 38.98% (8181/20990), Running for 00:01:17, ETA: 00:02:00
[DLManager] INFO: + Download - 40.49 MiB/s (raw) / 45.95 MiB/s (decompressed)
```
`parseLegendaryProgress` (funzione singola, senza stato) cercava un match di velocità DENTRO la riga "Progress:" stessa — non lo trovava mai, perché nel formato reale non esiste in quella posizione. La percentuale funzionava (letta correttamente), la velocità restava sempre vuota — sia nel widget Downloads sia nella barra Net Bridge, che leggono entrambi lo stesso campo `speed` dello stesso task. GOG non ne soffriva perché `makeLgogProgressParser()` era già una factory con stato dedicata al formato multi-riga di lgogdownloader.

### Fix

`parseLegendaryProgress` trasformata in `makeLegendaryProgressParser()`, una factory con stato (stessa architettura di quella GOG): una chiusura ricorda l'ultima velocità vista sulla riga `"+ Download - ..."` e la restituisce insieme alla prossima riga `"Progress: ...%"` che arriva. Un tick di ritardo (la velocità mostrata è quella del secondo precedente, non quello corrente) — impercettibile con un aggiornamento al secondo, comunque preferibile a non mostrarla mai.

### Verifica

`tsc --noEmit`: stesso errore pre-esistente e non correlato in `db.ts` (solo spostato di riga), nessun errore nuovo.

## v1.1.37 — Step 18: consolidamento fetch libreria giochi

Cinque punti indipendenti chiamavano `/api/games` e poi `setGames(...)` per conto proprio — login store, logout store, polling autenticazione OAuth, handler SSE `library-updated`, effetto legato ad activeStore/filtri — ciascuno con la propria copia di guard di sequenza/cache/riconciliazione selezione. Il guard (`librarySeqRef`, v1.1.22) evitava dati corrotti dalla corsa fra risposte fuori ordine, ma non eliminava la duplicazione: ogni nuovo punto che in futuro chiamasse `/api/games` per conto proprio avrebbe rischiato di reintrodurre la stessa classe di bug (vedi roadmap).

### Scoperta che ha cambiato l'approccio

Login, logout e polling OAuth non avevano solo bisogno di essere consolidati nella stessa funzione: erano del tutto ridondanti. `gameManager.loginToStore()`/`logoutFromStore()` chiamano già `refreshLibrary()` internamente, che notifica `onLibraryRefreshed()` → broadcast SSE `library-updated` a tutti i client — **prima ancora** che la risposta HTTP di `/api/stores/login`/`logout` torni al frontend. Il polling OAuth chiama esplicitamente `/api/library/refresh`, che fa lo stesso. Il fetch manuale di `/api/games` in questi tre punti correva quindi sempre contro il fetch che l'handler SSE avrebbe comunque fatto per lo stesso evento.

L'unico comportamento speciale perso eliminandoli — la fusione mirata sullo store disconnesso nel logout (`setGames(prev => [...prev.filter(g => g.store !== storeId), ...gamesData])`, pensata per il caso in cui l'utente guarda uno store diverso da quello disconnesso) — non protegge nulla che non sia già coperto da `allGamesForAccountCounts` (fetch dedicato e separato per i conteggi in Manage Accounts, introdotto in v1.1.20).

### Fix

Nuova funzione condivisa `refreshGamesList()` (`src/App.tsx`): incapsula fetch + guard di sequenza + aggiornamento cache + `setGames` + riconciliazione `selectedGameId` (overlay aperto → non toccare selezione; Steam Big Picture virtuale esclusa dal controllo esistenza — stessa logica già in uso, ora scritta una sola volta). Parametrizzata su store/filtri correnti o forzati, strategia di merge (`replace` di default, `merge-by-store` mantenuta disponibile per un futuro punto che ne avesse davvero bisogno), e invalidazione cache opzionale.

Restano solo due chiamanti reali: l'handler SSE `library-updated` e l'effetto legato ad activeStore/filtri (che mantiene la propria lettura cache "stale-while-revalidate" e il fetch parallelo di `/api/stores`, non delegati alla funzione condivisa perché specifici di quell'effetto). Login, logout e polling OAuth non chiamano più `/api/games`: fanno solo il proprio fetch di `/api/stores` (che l'evento SSE non copre) e lasciano che la libreria arrivi via SSE come qualunque altro cambiamento (install/uninstall/watcher Steam/ROM).

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti e non correlati (stesso elenco di `db.ts`/`gameManager.ts`/`metadataManager.ts`/`epicPlugin.ts`/`compatibilityManager.ts` visto nelle verifiche precedenti), nessun errore nuovo introdotto da questa modifica.

## v1.1.38 — Step 19b: fondamenta i18n (prima sezione: Settings/Store Accounts)

Campionamento delle stringhe visibili in JSX confermato: mix IT/EN diffuso e senza criterio (`"By Title"`, `"Settings"`, `"No active transfers"` accanto a `"Rimuovi"`, `"Annulla"`, `"Spazio disco"`), su un `App.tsx` di ~7700 righe. Anticipato nel piano di esecuzione del ciclo 2 prima degli step 3-5 proprio per questo: ogni stringa che quegli step aggiungeranno nascerà già nel sistema di traduzione, invece di dover essere ritoccata due volte.

### Motore scelto

`i18next` + `react-i18next` + `i18next-http-backend`, non una soluzione custom. Motivazione: la richiesta esplicita di "pacchetti caricabili" (una nuova lingua senza ricompilare) è esattamente il caso d'uso di `i18next-http-backend` — file JSON serviti a runtime da `public/locales/<lingua>/<namespace>.json` (copiati in `dist/` da Vite al build, serviti dallo stesso `express.static(dist)` già in uso in `server.ts`) — oltre a gestione di fallback lingua, chiavi mancanti e interpolazione di variabili già pronte, e un pattern (`useTranslation()`/`t('chiave')`) riconoscibile da chiunque abbia lavorato con i18n in React, a differenza di una convenzione bespoke.

### Architettura

Un namespace per sezione principale della UI invece di un unico dizionario globale — solo `settings` esiste per ora (`public/locales/it|en/settings.json`), le altre sezioni diventeranno un namespace ciascuna nelle prossime sessioni. `src/i18n/i18n.ts` inizializza i18next con `lng: 'it'`/`fallbackLng: 'it'` (l'italiano resta la lingua di riferimento del progetto) e `react: { useSuspense: false }` per non dover introdurre un `<Suspense>` attorno all'albero esistente.

### Migrazione di prova

Tab bar di Settings (5 etichette) e l'intera tab Store Accounts (stato sessione, badge Synced, spinner di attesa, pulsanti Connect/Cancel/Disconnect con conferma) convertite a `t()`, con interpolazione per i conteggi (`{{synced}}`/`{{installed}}`). Le tab System/Plugins/Input/AI Advisor (~1800 delle ~2500 righe del modale Settings, l'AI Advisor da solo ne rappresenta la maggior parte) restano hardcoded, da migrare nelle prossime sessioni con lo stesso pattern.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti (solo spostati di riga per le righe aggiunte), nessun errore nuovo. Verifica visiva del testo residuo nella tab Store Accounts: nessuna stringa hardcoded rimasta.

### Selettore di lingua + persistenza

Aggiunto nella stessa v1.1.38, subito dopo la migrazione di prova, per rendere l'intera funzionalità testabile end-to-end (fino a qui non esisteva alcuna UI per vedere l'inglese renderizzato, solo modificando `src/i18n/i18n.ts` a mano). Nuovo campo `language: 'it' | 'en'` in `appConfig.ts` (stesso meccanismo chiave=valore già in uso per `displayMode`/`aiMonthlyTokenBudget`, letto/scritto da `readAppConfig()`/`writeAppConfig()`, esposto da `GET`/`PATCH /api/config`). Il frontend legge la preferenza al boot e chiama `i18n.changeLanguage()`. Nuovo selettore IT/EN in Settings → System, primo elemento della tab (il pulsante di chiusura e la lista Runner installati sono stati aggiornati di conseguenza per i loro `neighbors.down`/riferimenti al "primo elemento").

Autorilevamento della lingua di sistema all'avvio resta da fare (roadmap) — il default, in assenza di preferenza salvata, resta `'it'`.

### Fix — navigazione controller del selettore di lingua

Bug segnalato dall'utente in test su hardware reale, in due parti:

1. **Causa banale ma bloccante**: cartella creata come `public/locale/` invece di `public/locales/` — l'HTTP backend non trovava mai i file, `t()` restituiva la chiave grezza (`tabs.accounts` a schermo) per qualunque lingua, dando l'impressione che il cambio lingua non facesse nulla.
2. **Bug reale di navigazione**: il selettore era implementato come DUE `Focusable` separati (uno per IT, uno per EN) nello stesso group `"settings"` usato da tutta la navigazione su/giù della tab System — competevano con essa invece di essere un singolo stop selezionabile su/giù con sinistra/destra riservati al cambio valore, raggiungibile solo per caso muovendo lo stick. Stesso principio già risolto altrove nell'app per il cambio tab (L1/R1 isolato dallo stick, `cycleSettingsTab`) non applicato qui.

Riscritto come un solo `Focusable` (`settings-language-toggle`) — su/giù lo raggiungono come qualunque altra riga della tab, sinistra/destra intercettati nell'effetto gamepad principale (stesso schema di isolamento di L1/R1, nuova funzione `cycleUiLanguage`) cambiano il valore mentre ha il focus, A lo cicla comunque per chi preme invece di muovere lo stick lateralmente.

### Fix — ingresso in tab e risalita dal primo runner

Due bug ulteriori segnalati in test, dopo il fix del punto precedente:

1. **Entrando nella tab System** (dalla tab bar o con L1/R1), il focus atterrava sul primo runner installato, non sul selettore di lingua: `getFirstFocusableForSettingsTab('engine')` — usata sia dal click sulla tab bar sia da `cycleSettingsTab` per L1/R1 — non era stata aggiornata quando il selettore è diventato il vero primo elemento della tab, restituiva ancora l'id del vecchio primo elemento (lista runner).
2. **Risalendo dal primo runner installato**, "su" non raggiungeva il selettore (portava dritto al pulsante di chiusura), mentre "sinistra" sì — controintuitivo. Causa: il selettore di lingua è stretto e allineato a sinistra, la riga runner è larga; uno scoring puramente geometrico valuta "sinistra" (dx grande) più vicino di "su" (dy piccolo rispetto a dx) e sceglie quello. Risolto con un `neighbors.up` esplicito sul primo runner (e sul pulsante "Aggiorna" di Runner installabili, per il caso senza runner installati), stesso principio già in uso per `isLastInstalled`/`systemToolsUpNeighbor` più sotto nello stesso file — non un meccanismo nuovo.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.39 — Step 19b: migrazione tab System

Seconda sezione migrata dopo Store Accounts (v1.1.38): l'intera tab System di Settings — Runner installati/installabili, i tre banner ProtonUp-Qt/Lutris rilevati (con i nomi comando `yay -S ...` lasciati invariati, non sono testo da tradurre), Tool di sistema, Spazio disco. I nomi dei tool stessi (Wine, ProtonUp-Qt, Lutris, Steam, ecc. nella griglia "Tool di sistema") restano hardcoded intenzionalmente — sono nomi propri di prodotto, non stringhe UI.

Le stringhe con markup misto (es. banner con `<code>` colorato in mezzo al testo) sono state divise in `prefix`/`middle`/`suffix` invece di un'unica chiave con interpolazione, per preservare lo styling inline invece di appiattirlo in testo semplice.

Nuove chiavi sotto il namespace `settings`, sezione `system`, in entrambi `public/locales/it|en/settings.json`.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati con `json.load`. Verifica visiva del testo residuo nella tab System: nessuna stringa hardcoded rimasta (esclusi i nomi propri di tool/comandi shell).

## v1.1.40 — Step 19b: migrazione tab Plugins

Terza sezione migrata. Paragrafo introduttivo, pulsanti Riprova/Ricarica, badge DRM-free/DRM, "richiede: {{tool}}". Lasciati intenzionalmente hardcoded `plugin.name`/`plugin.description`/`plugin.requiredTool`: sono dati letti dal registro plugin lato backend (contenuto, non chrome della UI) — localizzarli richiederebbe i18n lato backend sui metadati di ciascun plugin, un lavoro distinto e non ancora pianificato, fuori dallo scopo di questo step.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati. Nessuna stringa hardcoded residua nella tab (esclusi i dati plugin da backend).

## v1.1.41 — Step 19b: migrazione tab Input

Quarta sezione migrata. Dispositivi connessi (badge "connesso", "Plugin assegnato: {{plugin}}"), Plugin input (intestazione + nota sul plugin Generico fallback), Test controller. Stessa scelta della tab Plugins per `plugin.name`/`plugin.description` degli input plugin: lasciati hardcoded, sono dati da backend (`InputManager.plugins`), non chrome UI.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati. Nessuna stringa hardcoded residua nella tab (esclusi i dati plugin da backend).

## v1.1.42 — Step 19b: fix traduzione plugin store/input + GamepadTester

Due gap segnalati dall'utente in test su hardware reale, con screenshot delle tab Plugins e Input in inglese:

1. **GamepadTester.tsx non era stato toccato**: componente separato da `App.tsx`, le sue stringhe ("Test input live", "Navigazione normale", i messaggi di istruzione) non comparivano nei grep fatti direttamente su `App.tsx` durante la migrazione della tab Input (v1.1.41) — una svista, non una scelta di scope. Aggiunto `useTranslation('settings')` nel componente stesso, stesse chiavi (sezione `input`) del resto della tab che lo ospita.
2. **Descrizioni plugin store/input restavano in italiano**: `plugin.description` (e `plugin.name` per gli input plugin) sono dati letti dal backend (`steamPlugin.ts`, `XInputPlugin.ts`, ecc.), non stringhe scritte in `App.tsx` — la scelta precedente di lasciarle intatte come "contenuto, non chrome UI" (v1.1.40/41) era corretta in linea di principio ma produceva un'esperienza visibilmente incoerente una volta cambiata lingua, non solo un dettaglio.

Per il punto 2, invece di spostare l'i18n lato backend (i plugin non sono pensati per restituire chiavi al posto di testo — un lavoro distinto e più invasivo), le traduzioni vivono nel frontend indicizzate per id plugin (`storePluginDescriptions`, `inputPluginDescriptions`, `inputPluginNames` nel namespace `settings`), con **fallback al testo originale del backend per qualunque plugin non presente in queste chiavi** — coerente con lo spirito "pacchetti caricabili" del resto del sistema i18n: un plugin di terze parti futuro senza traduzione mostra il proprio testo invece di rompersi o mostrare una chiave grezza. Gli id con punti (`Battle.net`) vengono sanificati prima della lookup, incompatibili altrimenti con il keySeparator di i18next.

Non toccati: i nomi propri di store/prodotto (Steam, GOG Galaxy, Xbox / XInput, DualShock 4, DualSense) — restano identici in entrambe le lingue, solo "Controller Generico"/"Generic Controller" aveva davvero bisogno di una traduzione.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati. Nessuna stringa hardcoded residua in `GamepadTester.tsx`.

## v1.1.43 — Step 19b: migrazione tab AI Advisor — Settings completo

Quinta e ultima sezione di Settings migrata: banner Sperimentale, paragrafo introduttivo modelli, Budget token mensile (con la relativa etichetta della tastiera virtuale), Modelli installati (con le etichette di peso Leggero/Medio/Pesante/Molto pesante), Provider cloud (A pagamento/Gratuito-economico, API Key, placeholder, Testa connessione, Rimuovi key).

Correzione di stima: la roadmap indicava questa tab come "la più estesa, ~1800 delle ~2500 righe del modale Settings" — una sovrastima fatta senza verificare i confini reali del blocco JSX. La tab è in realtà ~360 righe, paragonabile a System; le ~1800 righe restanti dopo la chiusura di Settings appartengono ad altri overlay (Compatibility Overlay e altri) fuori dallo scope di questo step.

`CLOUD_PROVIDERS` è una costante definita in `App.tsx` (non dati da backend come i plugin store/input) — le note di ciascun provider (`cp.note`) sono state tradotte con lo stesso pattern id→testo con fallback già usato per i plugin, per coerenza e a prova di futuri provider aggiunti senza aggiornare le chiavi. `cp.name` (Google Gemini, DeepSeek, ChatGPT (OpenAI), Claude (Anthropic)) restano invariati, sono nomi di prodotto.

Corretto anche un dettaglio non segnalato ma trovato nel passaggio: il conteggio token usava `toLocaleString('it-IT')` fisso — ora usa `i18n.language`, così la formattazione numerica (virgola/punto per le migliaia) segue la lingua scelta invece di restare sempre italiana.

Con questa voce, **tutte e cinque le tab di Settings sono migrate**. Restano: il resto della Dashboard/Quick Menu/notifiche/overlay fuori da Settings, e l'autorilevamento della lingua di sistema all'avvio.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati. Nessuna stringa hardcoded residua nella tab (esclusi i nomi di prodotto dei provider).

## v1.1.44 — Step 19b: Quick Menu, primo namespace oltre Settings

Prima sezione fuori da Settings: il pannello Quick Menu (Gestisci Account, Avatar, Modalità Gamescope, Cambia Tema, Modalità Console/Schermo, Esci). Nuovo namespace dedicato `quickMenu` (`public/locales/it|en/quickMenu.json`) invece di infilarlo dentro `settings` — è una sezione a sé, non una sotto-sezione delle Impostazioni, coerente con l'architettura "un namespace per sezione principale" già dichiarata in `src/i18n/i18n.ts`. Referenziato dal componente con il prefisso esplicito (`t('quickMenu:chiave')`) sullo stesso hook `useTranslation('settings')` già in uso in `MainApp`, senza bisogno di un secondo hook — i18next risolve il namespace dal prefisso indipendentemente da quale l'hook abbia caricato di default, purché il namespace sia elencato in `ns` nella configurazione (fatto).

"X-Launcher Core" nel footer del pannello resta invariato, è un nome di prodotto.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati (inclusi i due nuovi file `quickMenu.json`). Nessuna stringa hardcoded residua nel Quick Menu (esclusi i nomi di prodotto).

## v1.1.45 — Step 19b: layout responsivo per etichette tradotte

Bug di layout segnalato dall'utente con screenshot: "IMPOSTAZIONI" (Quick Menu) troppo lungo finiva addosso al pulsante X di chiusura, e "MODALITÀ GAMESCOPE" restava su una riga sovrapponendosi al valore invece di andare a capo come "Modalità Schermo"/"Schermo Intero" (stessa riga, stesso componente `OptionItem`, comportamento diverso solo per un caso limite del box model, non per scelta di design).

Causa: né `OptionItem` né gli header dei tre overlay laterali (Quick Menu, Deployment Manager, Notifiche) dichiaravano esplicitamente `flex-1 min-w-0` sul gruppo che deve poter restringersi/andare a capo (icona+etichetta, o icona+titolo) e `shrink-0` sul gruppo che non deve mai essere schiacciato (il valore a destra, o il pulsante di chiusura). Senza questa dichiarazione il comportamento del browser è incoerente da riga a riga — a volte va a capo per puro caso (quando il valore accanto è abbastanza lungo da forzare comunque lo shrink), a volte sovrappone.

Discussa con l'utente l'alternativa di rendere variabile la larghezza dei pannelli overlay (oggi `w-96` fisso) in base alla lingua: scartata perché farebbe spostare l'intera griglia della Dashboard dietro ogni volta che si cambia lingua, un effetto più disorientante del wrapping su due righe already visto funzionare bene. Preferita la correzione del flex/wrap: il testo tradotto va sempre a capo dentro lo spazio disponibile, il pulsante di chiusura non viene mai coperto, in ogni lingua.

Corretti: `OptionItem` (righe Quick Menu), header Quick Menu, header Deployment Manager (Downloads), header Notifiche — stesso pattern identico in tutti e tre, anche se solo i primi due erano già visibilmente rotti in italiano/inglese (Notifiche non ancora migrata a i18n, ma vulnerabile allo stesso bug non appena lo sarà — corretta preventivamente).

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati.

## v1.1.46 — Step 19b: scala header Quick Menu allineata a Downloads/Notifiche

Segnalato dall'utente con screenshot dopo il fix v1.1.45 (niente più sovrapposizione): "IMPOSTAZIONI" sembrava "più grande di prima". Verificato: non è una regressione del fix precedente — il titolo del Quick Menu era già `text-3xl` con badge icona e pulsante di chiusura `w-10 h-10` **nel codice originale caricato**, contro `text-2xl`/`w-8 h-8` di Downloads e Notifiche. Una discrepanza di scala preesistente fra i tre overlay laterali, mascherata finché il titolo si sovrapponeva alla X — il fix v1.1.45 l'ha resa visibile, non creata.

Allineato il Quick Menu alla stessa scala degli altri due overlay (`text-2xl`, badge/pulsante `w-8 h-8`, icone `size={16}`) invece di introdurre un meccanismo di ridimensionamento percentuale nuovo, discusso come alternativa: tre pannelli identici nella struttura (stessa larghezza `w-96`, stesso pattern header+lista) meritano la stessa scala tipografica, non tre scelte diverse per ciascuno.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.47 — Step 19b: header Dashboard, ricerca, ordinamento, filtri

Terzo namespace, `dashboard` (`public/locales/it|en/dashboard.json`): barra store ("Tutti i Giochi" — i nomi dei singoli store restano invariati, sono brand), indicatore di stato in alto a destra (Gamescope Standalone/Wayland Native tenuti identici in entrambe le lingue, sono nomi tecnici; Finestra/Modalità Console/Schermo Intero tradotti — stessi valori già usati nel Quick Menu, duplicati qui in `dashboard.json` invece di referenziare `quickMenu.json` da un namespace diverso, scelta deliberata: sono due sezioni distinte, la piccola duplicazione di tre parole è più economica di un accoppiamento fra namespace pensati per essere indipendenti), placeholder di ricerca (con interpolazione del nome store), le quattro opzioni di ordinamento, il filtro "Installati", le etichette Generi/Categorie, lo stato vuoto "Nessun titolo trovato" con relativo pulsante di reset filtri.

Non toccati: i nomi dei generi/categorie stessi (RPG, Azione, ecc.) — sono dati reali dei giochi (`g.genres`/`g.categories`), non stringhe UI, stesso principio già applicato ai plugin.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati (inclusi i due nuovi file `dashboard.json`).

## v1.1.48 — Step 19b: sidebar dettagli gioco

Sotto-sezione `sidebar` nel namespace `dashboard` esistente (non un namespace nuovo, è ancora la stessa area Dashboard): tooltip "Verificato" (con e senza metodo), badge "Plugin disattivato", "Client Steam"/Installato/Non Installato, Rating/HLTB (con interpolazione), Tempo di gioco, "Caricamento libreria…", pannello di benvenuto ("Bentornato, {{name}}" + testo esplicativo), conteggio titoli/verificati — questi ultimi due con la pluralizzazione nativa di i18next (`_one`/`_other`) invece del ternario manuale `count === 1 ? 'titolo' : 'titoli'` che c'era prima, per coerenza con come i18next gestisce i plurali ovunque altro serva in futuro.

Non toccato: il pannello Debug Console (Daemon Log, filtri livello, Live/Paused) — è uno strumento di sviluppo/diagnostica più che UI utente finale, deprioritizzato rispetto al resto; da valutare se vale la pena migrarlo in una sessione dedicata.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati.

## v1.1.49 — Step 19b: fix corsa selettore lingua al boot + status gioco + nome store non-brand

Tre problemi segnalati dall'utente in test su hardware reale, il primo dei tre il più serio incontrato finora in questo step:

1. **Corsa (race condition) sul selettore di lingua al primo avvio a freddo dopo il login**: il fetch di `/api/config` che applica la lingua persistita gira in un effect al mount, senza alcuna guardia contro un cambio manuale nel frattempo. Su un boot a freddo (filesystem/rete non ancora "caldi"), questo fetch può risolversi molto più tardi del solito — se l'utente raggiunge Settings e preme il selettore PRIMA che risolva, il cambio manuale funziona (suono incluso), ma quando il fetch finalmente risolve, l'effect chiamava comunque `i18n.changeLanguage()` con il valore persistito precedente, annullando silenziosamente la scelta appena fatta senza alcun feedback che lo segnalasse. Ai riavvii successivi (filesystem/rete "caldi") il fetch risolve prima che l'utente possa anche solo aprire Settings, quindi la corsa non si manifesta mai — coerente con quanto osservato. Fix: un ref (`userChangedLanguageRef`), impostato da `cycleUiLanguage` al primo cambio manuale, controllato dall'effect di boot prima di applicare il valore persistito.
2. **Le card in libreria mostravano ancora "READY TO LAUNCH"/"NOT INSTALLED" in inglese con la UI in italiano**: `game.status` è testo scritto letteralmente in inglese nel database da ciascun plugin store (`steamPlugin.ts`/`gogPlugin.ts`/`epicPlugin.ts`/`classicPlugin.ts`, persistito via `db.updateGameStatus`) — stessa categoria delle descrizioni plugin già affrontata in v1.1.42, stessa soluzione: mappa valore→traduzione con fallback al testo originale (`translateGameStatus`), namespace `dashboard`.
3. **"Classic Console" suggerito come traducibile**: a differenza di Steam/GOG/Epic/Battle.net/Amazon Games (marchi di terzi, sempre invariati), "Classic Console" è un nome descrittivo coniato dal progetto stesso — stesso principio già applicato a "Controller Generico" fra gli input plugin. Nuovo helper `translateStorePluginName`, applicato ai tre punti in cui compare il nome di uno store (barra store principale, tab Store Accounts, tab Plugins).

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati.

## v1.1.50 — Step 19b: Game Options (header + Runner Bridge)

Quarto namespace, `gameOptions` (`public/locales/it|en/gameOptions.json`): header dell'overlay (badge installato/non installato, nome store — anche qui `translateStorePluginName` per coerenza con "Classic Console"), sezione Runner Bridge (intestazione, badge "Attivo" per il runner corrente).

Overlay grande quanto le tab più estese di Settings: restano da migrare Compatibility Layer/Core (sezione adattiva RetroArch/DOSBox/ScummVM/compat layer) e l'intero Game Config (Step 4, campi launch args e altro). Stessa strategia già usata per Settings: sezioni successive nelle prossime sessioni invece di un unico passaggio rischioso su un file così esteso.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati (inclusi i due nuovi file `gameOptions.json`).

## v1.1.51 — Step 19b: Game Options completo

Chiuso l'overlay Game Options — Compatibility Layer/RetroArch Core (stato Non installato/Disponibile, messaggio di installazione mancante, badge "Attivo", "Default per questo sistema", layer di compatibilità AMD FSR/GameMode/MangoHud/EasyAntiCheat/BattlEye — nomi tecnici/brand lasciati invariati, solo l'intestazione "Layer di Compatibilità" tradotta), Game Config (badge "configurato"/"richiesto per avviare", suffisso "(manuale)" del path Libretro — i nomi dei campi stessi come Executable Path/Launch Arguments/Steam App ID restano identificatori tecnici non tradotti, stesso trattamento di "RetroArch Core"/"Runner Bridge"), Dipendenze Wine (intestazione, badge consigliato/lento, sottotitolo), Variabili d'ambiente personalizzate (etichetta tastiera virtuale, pill Persistente/Solo install., le due caption esplicative, pulsante aggiungi), i due switch finali (Disabilita sync NT veloce, Usa Known Fixes) con le rispettive descrizioni, e i due pulsanti di azione DISINSTALLA/INSTALLA.

Con questa voce l'overlay Game Options è completamente bilingue, fatta eccezione per i field name tecnici lasciati deliberatamente invariati (coerenti con le altre scelte già fatte in questo stesso overlay) e i nomi di prodotto/tecnologia (Heroic Games Launcher, AMD FSR, ecc.).

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati. Nessuna stringa hardcoded residua nell'intero overlay (esclusi field name tecnici e nomi di prodotto).

## v1.1.52 — Step 19b: contenuto interno di Downloads e Notifiche

Due nuovi namespace, `downloads` e `notifications` (gli header di entrambi gli overlay erano già a posto dal fix layout v1.1.45).

**Downloads/Deployment Manager**: dialog di conferma installa/disinstalla (titolo, descrizione, pulsanti), due titoli di notifica generati qui stesso ("Installazione non avviata"/"Disinstallazione non riuscita", tradotti nel punto in cui vengono costruiti — sono stringhe scritte in questo file, non dati da backend), stato vuoto "Nessun trasferimento attivo", etichetta di fase di download, percentuale completamento, conferma annullamento download, Riprendi/Pausa/Annulla, footer Peer Hash Cache (nome tecnico invariato) + verifica checksum, suggerimento attivazione controller.

**Notifiche**: "Pulisci storico" (il testo mancava ancora nonostante il fix di layout v1.1.45, che aveva sistemato solo lo spazio a disposizione), stato vuoto "Nessuna notifica", suffissi di stato (in attesa di conferma/risolto/non risolto), "Log tecnico", pulsanti Ha funzionato/Non ha funzionato, fallback "Chiudi".

**Non toccato, deliberatamente fuori scope**: il contenuto delle notifiche stesse (`notif.title`/`notif.body`/`notif.rawLog`, e le etichette di `primaryAction`/`secondaryAction`) — sono generate da chiamate a `pushNotification()` sparse in tutto il file (non solo qui), con testo scritto al momento della chiamata. Tradurre tutte quelle chiamate è un audit a parte, più esteso di quanto rientri in questa sessione — stesso trattamento già riservato al Debug Console.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati (inclusi i quattro nuovi file `downloads.json`/`notifications.json`).

## v1.1.53 — Step 19b: fix intestazione libreria (Collection/Titles Synced/nome store)

Tre stringhe segnalate dall'utente con screenshot, tutte nello stesso header sopra la griglia dei giochi, mai toccate nelle sessioni precedenti perché non erano emerse nei grep fatti sull'header principale (v1.1.47) — un punto diverso del file, la riga del titolo della sezione libreria:

1. **"Collection"** — sempre in inglese, hardcoded, indipendentemente dalla lingua.
2. **Il nome dello store come titolo di sezione** (es. "Classic Console" invece di "Console Classiche" quando quella tab è attiva) — non passava da `translateStorePluginName`, a differenza degli altri tre punti già corretti in v1.1.49 (barra store, tab Store Accounts, tab Plugins). Un quarto punto che mi era sfuggito.
3. **"{{n}} Titles Synced"** — hardcoded in inglese, ora con la pluralizzazione i18next (`_one`/`_other`) invece di un'unica forma fissa.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati.

## v1.1.54 — Step 19b: fix nome store nella sidebar dettagli gioco

Quinto punto mancante segnalato dall'utente con screenshot: la riga "Voto | Store | Runner" nella sidebar principale (quella sempre visibile selezionando un gioco, non l'overlay Game Options) mostrava `selectedGame.store` senza passare da `translateStorePluginName` — "Classic Console" restava tale anche in italiano. Stesso identico bug già corretto in v1.1.49/53 in altri quattro punti (barra store, tab Store Accounts, tab Plugins, titolo sezione libreria); questo quinto era in un componente diverso (la sidebar dei dettagli, non toccato in quei fix precedenti).

Trovati nello stesso passaggio, non ancora corretti — un messaggio di notifica e un dialog di conferma nativo del browser che incorporano `game.store` in una frase costruita a runtime: restano nello stesso bucket deprioritizzato dell'audit trasversale delle notifiche (v1.1.52), non un'omissione di questo fix.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.55 — Step 19b: barra footer (legenda comandi)

Segnalata dall'utente: la barra in basso con la legenda dei tasti non era mai stata toccata in questo step, restava sempre in inglese. Aggiunta una sezione `footer` al namespace `dashboard` esistente: le etichette A/B/X/Y (Select/Back/Quick Actions/Global Search), L1/R1 "Jump Store", L2/R2 "Download"/"Notifications", e il ramo alternativo per tastiera/mouse (Execute/Exit View/Next Group/Spotlight). "Net Bridge" tenuto identico in entrambe le lingue — stesso trattamento già riservato a "Runner Bridge"/"Peer Hash Cache", nomi tecnici del progetto.

Nello stesso passaggio, corretti anche "Vuoto…"/"Inizia a digitare..." nella tastiera virtuale (sezione `keyboard` nello stesso namespace) — non erano stati notati prima perché visibili solo quando il campo di ricerca/testo è vuoto, non erano nello scope dei fix precedenti.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati.

## v1.1.56 — Step 19b: fix titoli header Deployment Manager/Notifiche

Bug segnalato dall'utente: i titoli h2 stessi degli overlay Downloads e Notifiche ("Deployment Manager"/"Notifiche") restavano letterali indipendentemente dalla lingua — il fix di layout v1.1.45 aveva sistemato lo spazio/overlap attorno al titolo, ma non aveva mai sostituito il testo con `t()`; il fix del contenuto interno (v1.1.52) aveva tradotto tutto il resto di entrambi gli overlay tranne il titolo stesso. Un'omissione passata inosservata in due fix precedenti.

"Deployment Manager" tradotto ("Gestione Installazioni" in italiano) anziché lasciato come nome tecnico invariato: a differenza di "Runner Bridge"/"Peer Hash Cache"/"Net Bridge" (etichette tecniche secondarie), è il titolo principale di un intero overlay, sullo stesso piano di "Notifiche" — stessa categoria di "Classic Console"/"Controller Generico" (nomi coniati dal progetto, non brand di terzi), non quella dei nomi tecnici.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati.

## v1.1.57 — Step 19b: Avatar Library + fix "Confirm A" ed ESCI rosso

**Fix segnalato dall'utente**: la voce ESCI del Quick Menu chiedeva sempre "Confirm A" identico in italiano e inglese — bug mio, la chiave `confirmA` era stata scritta con lo stesso valore letterale in entrambi i file di traduzione fin dalla sua creazione (stesso problema anche in `settings.system.confirmA`, corretto nello stesso passaggio). Aggiunta anche la richiesta dell'utente: il pulsante ESCI ora diventa rosso mentre è in attesa di conferma (nuovo prop `pending` su `OptionItem`, passato solo per questa riga), tornando blu/normale se B annulla — la logica di annullamento con B esisteva già e funzionava correttamente, mancava solo il riscontro visivo.

**Ottavo namespace, `avatarLibrary`**: titolo overlay ("Libreria Avatar", trattato come nome coniato dal progetto — stessa categoria di "Gestione Installazioni"/"Notifiche", non un termine tecnico), suffisso tipi di file, pulsanti Rimuovi/Account, tooltip Ricarica, stato vuoto "Cartella vuota" con istruzioni, badge "● Attivo" sull'avatar selezionato.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati (inclusi i due nuovi file `avatarLibrary.json`).

## v1.1.58 — Step 19b: Knowledge Base bilingue

Su richiesta esplicita dell'utente, primo dei due lavori concordati sul backend AI Advisor (il secondo, il prompt di sistema parametrizzato sulla lingua, resta per il prossimo passaggio).

**Scoperta preliminare, non richiesta ma rilevante**: l'ipotesi dell'utente ("la lingua della risposta AI dipende da come arriva il log") non è corretta — verificato in `aiProviders/base.ts`: `AI_SYSTEM_PROMPT` ha "in italiano" scritto fisso tre volte (nei tre esiti possibili: solution/question/reason), condiviso identico da tutti e 5 i provider. L'AI è istruita a rispondere sempre in italiano, indipendentemente da log o lingua UI — se in pratica si sono viste risposte in inglese, è più probabile un'istruzione non seguita perfettamente dal modello che un vero meccanismo lingua-del-log→lingua-risposta, che nel codice non esiste.

**Schema**: nuova colonna `solution_en TEXT` nullable in `knowledge_base` (SQLite), stesso pattern di migrazione già in uso in `db.ts` (PRAGMA table_info + ALTER TABLE ADD COLUMN se manca) — un DB già popolato continua a funzionare senza reimportare nulla. `solution` resta il testo italiano originale (compatibilità con le voci `ai-writeback` già scritte, che hanno solo quello); `solution_en` è la traduzione, `null` per le voci senza — nuovo helper esportato `localizedSolution(entry, language)` che sceglie quale mostrare, con fallback a `solution` se manca la traduzione inglese (mai una stringa vuota).

**Contenuto**: tutte e 34 le voci di `kb-seed.json` tradotte in inglese (`solution_en`), verificate con uno script di conteggio (34/34).

**Uso**: `notificationEngine.ts` ora chiama `localizedSolution(entry, readAppConfig().language)` nei due punti che consultano la KB (`download-error`, `launch-error`) invece di mostrare sempre `entry.solution` grezzo.

Deliberatamente non tradotte: le voci `ai-writeback` (suggerimenti AI confermati dall'utente e salvati in KB) — arrivano in una sola lingua, quella impostata al momento della chiamata; non esiste una "seconda lingua" coerente da generare per quel tipo di voce senza richiamare di nuovo l'AI.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo (verificato specificamente: zero errori in `knowledgeBase.ts`/`notificationEngine.ts`). JSON di `kb-seed.json` validato, 34/34 voci con `solution_en` presente.

## v1.1.59 — Step 19b: fix wrap Net Bridge nel footer

Bug segnalato dall'utente: il blocco "Net Bridge / velocità download" nel footer, accanto alla campanella notifiche, restava su 2 righe in inglese ma arrivava a spezzarsi su 4 in italiano ("Net" / "Bridge" / "0.0" / "MB/s"). Causa: nessuno dei due span aveva `whitespace-nowrap`, e l'intera `<footer>` è un'unica riga flex senza priorità di shrink dichiarata fra il lato sinistro (legenda comandi) e destro (Net Bridge/notifiche/orologio) — le etichette italiane della legenda, collettivamente un po' più larghe di quelle inglesi, bastavano a far scattare lo shrink di default sul blocco più a destra, il primo a cedere spazio.

Fix: `whitespace-nowrap` sulle due righe del blocco Net Bridge (mai più "una parola per riga"), `shrink-0` sull'intero cluster destro del footer (download/notifiche/orologio — priorità informativa più alta della legenda comandi, che può ragionevolmente assorbire lo spazio mancante), `whitespace-nowrap` anche sull'etichetta del componente `Hint` condiviso dalla legenda, per coerenza preventiva.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.60 — Step 19b: prompt di sistema AI Advisor parametrizzato sulla lingua

Secondo dei due lavori concordati sul backend AI Advisor (dopo la Knowledge Base bilingue, v1.1.58).

`AI_SYSTEM_PROMPT` (costante con "in italiano" fisso tre volte, condivisa da tutti e 5 i provider) diventa `buildSystemPrompt(language)` in `base.ts` — le istruzioni al modello restano in italiano (un LLM le segue bene in qualunque lingua siano scritte, e l'utente non le vede mai), cambia solo la lingua richiesta per i tre campi di testo libero che l'utente vede davvero (`solution`/`question`/`reason`).

`ErrorContext` (sempre in `base.ts`) guadagna un campo opzionale `language?: 'it' | 'en'`, popolato da `orchestrator.ts` leggendo `readAppConfig().language` prima di chiamare ciascun provider — stesso punto che già forniva il budget token, nessuna nuova dipendenza. I quattro file provider (`ollama.ts`, `claude.ts`, `gemini.ts`, `openaiCompatible.ts` — quest'ultimo condiviso da ChatGPT e DeepSeek, cinque provider in quattro file) aggiornati per chiamare `buildSystemPrompt(context.language)` al posto della costante statica.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo (verificato specificamente sui cinque file toccati: `base.ts`, `orchestrator.ts`, `ollama.ts`, `claude.ts`, `gemini.ts`, `openaiCompatible.ts`). Nessun riferimento residuo alla vecchia costante `AI_SYSTEM_PROMPT` in tutto `src/backend/`.

## v1.1.61 — Step 19b: fix pulsante Incolla nella tastiera virtuale

Segnalato dall'utente: il pulsante "Incolla" (e i messaggi transitori "Clipboard vuota"/"Clipboard non disponibile") restava sempre in italiano, perché `VirtualKeyboard.tsx` non aveva mai `useTranslation` — non toccato finora in questo step. Aggiunte le chiavi mancanti alla sezione `keyboard` già esistente nel namespace `dashboard`.

**Precisazione importante, richiesta esplicitamente dall'utente**: il layout fisico dei tasti (`layoutId`, IT/EN-US — quali lettere/accenti compaiono, non le etichette dei pulsanti) resta **deliberatamente indipendente** dalla lingua della UI — era già così prima di questo fix (un secondo stato separato, cambiato con il suo tasto dedicato, non con il selettore di lingua di Settings), e questo fix non lo tocca: un utente può avere la UI in inglese e continuare a digitare con il layout italiano, o viceversa. Solo le etichette testuali dei pulsanti (Incolla, i due messaggi clipboard) erano il problema, non il layout.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati.

## v1.1.62 — Step 19b: audit completo del contenuto delle notifiche

Lavoro rimasto sospeso da v1.1.52, quando erano state tradotte solo le parti fisse del pannello Notifiche (titolo, pulsanti, stati) ma non il contenuto delle singole notifiche generate in giro per il codice — segnalato all'utente come "~30 stringhe in ~30 punti diversi" prima di iniziare.

**Backend (`notificationEngine.ts`)**: `actionLabel()` e l'intero `eventToNotification()` (tutti gli 11 case dello switch — download-completed/error, known-fixes-result, launch-error/blocked, auth-error/ok, runner-installed/uninstalled/error, validation-prompt, system) parametrizzati su `lang = readAppConfig().language`, letto una sola volta in testa alla funzione. Stesso trattamento per `tryAIAdvisor()`: i tre titoli `[EXPERIMENTAL]`, il testo delle opzioni di chiarimento, e — bonus trovato nello stesso passaggio — la riga di budget token usava `toLocaleString('it-IT')` fisso indipendentemente dalla lingua (stesso bug già corretto lato frontend in v1.1.43 per lo stesso identico conteggio, mai portato qui).

Non serve un sistema i18n completo lato backend per ~20 stringhe in un solo file: stesso approccio già usato per `buildSystemPrompt` — un parametro `lang` e ternari `lang === 'en' ? ... : ...` inline, non un nuovo file di traduzione.

**Frontend (`App.tsx`)**: le 4 chiamate `pushNotification()` rimaste (avvio bloccato per plugin disabilitato, toggle voce "Kiosk" nel menu Ctrl+Alt+K, cambio modalità schermo, passaggio a Desktop) migrate a `t('dashboard:notif.*')` con interpolazione, nuova sezione `notif` nel namespace `dashboard` già esistente.

Non toccato, per scelta: i due punti già segnalati in v1.1.54 (`game.store` grezzo in un corpo di notifica e in un `confirm()` nativo del browser) — non fanno parte di questo audit di per sé ma di un fix di traduzione del nome store già discusso a parte.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo (verificato specificamente: zero errori in `notificationEngine.ts`). JSON validati.

## v1.1.63 — Step 19b: autorilevamento lingua di sistema

Ultimo punto della roadmap Step 19b. Fino a qui, in assenza di preferenza salvata, la lingua di default era sempre 'it' — questa voce la sostituisce con un vero autorilevamento al primo avvio.

**Distinguere "mai impostata" da "impostata su 'it'"**: `readAppConfig()` da solo non bastava — il merge coi default appiattisce i due casi allo stesso valore. Nuova funzione `hasLanguageBeenSet()` in `appConfig.ts`, che rilegge il file grezzo e verifica se la chiave `language=` è già presente; esposta come `languageIsUserSet` nella risposta di `GET /api/config`.

**Rilevamento**: `navigator.languages[0]` (preferito a `navigator.language` singolo: riflette l'ordine di preferenza reale del sistema/browser), primary subtag BCP-47 estratto (`es-MX` → `es`, `zh-CN` → `zh`). Se è 'it' o 'en', diventa la lingua e viene persistita subito in `app.conf` — nessuna differenza pratica da una scelta manuale da questo punto in poi. Se non è supportata, fallback a 'en' (persistito anch'esso, così questo ramo non si ripete ad ogni avvio).

**Messaggio per lingua non supportata, richiesto esplicitamente dall'utente**: quando scatta il fallback, una notifica spiega la situazione — ma nella lingua REALE dell'utente, non in italiano o inglese (altrimenti non la capirebbe, vanificando lo scopo). Nuovo modulo `src/i18n/unsupportedLanguageNotices.ts`, con testi scritti per spagnolo/tedesco/francese/cinese semplificato per ora, fallback inglese generico per qualunque altra lingua rilevata non ancora coperta — il set cresce nel tempo, non è pensato per essere esaustivo subito. Deliberatamente NON un namespace i18next come gli altri: è contenuto in lingue che l'app non supporta ancora come UI, non chrome tradotto — stesso principio già usato per la Knowledge Base multilingua.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo (verificato specificamente: zero errori in `unsupportedLanguageNotices.ts`, `appConfig.ts`, `server.ts`).

## v1.1.64 — Step 19b: fix overlap "Pulisci storico"/titolo in Notifiche

Segnalato dall'utente: il pulsante "Pulisci storico" tornava a sovrapporsi al titolo "Notifiche"/"Notifications". Causa più sottile del solito: il fix v1.1.45 (`flex-1 min-w-0` sul contenitore del titolo) presupponeva che il titolo potesse restringersi andando a capo se serviva — ma "Notifiche"/"Notifications" è una singola parola, senza spazi, e una parola senza punti di rottura non può andare a capo: se badge + "Pulisci storico" + pulsante di chiusura insieme non ci stavano più sulla riga, il titolo la sovrapponeva comunque invece di restringersi, perché semplicemente non può farlo.

Fix: "Pulisci storico" spostato su una riga propria, sotto l'header, allineato a destra — non più sulla stessa riga di titolo/badge/chiusura. La riga principale ora ha solo titolo e pulsante di chiusura in competizione per lo spazio, con margine molto più ampio in entrambe le lingue; `truncate` aggiunto al titolo come rete di sicurezza ulteriore, anche se con questo riordino non dovrebbe mai più servire davvero.

**Nota per l'utente**: verificato che l'overlay Downloads/Deployment Manager non ha un pulsante equivalente di pulizia cronologia — esiste solo nel pannello Notifiche. Se serve aggiungerlo anche lì, è una richiesta a parte, non ancora fatta.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.65-rc.3 — MILESTONE: interfaccia interamente bilingue + unificazione log in inglese

Due decisioni permanenti richieste dall'utente, valide da qui in avanti:
1. Ogni nuova feature accompagnata da testo va realizzata in italiano E inglese per default — non più italiano-poi-tradotto-dopo.
2. I log di debug (`writeLog`/`console.*`) restano **solo in inglese**, mai bilingue — la lingua franca dello sviluppo è l'inglese, tradurli o tenerli doppi non ha senso.

**Unificazione log in inglese**: ~97 righe di log tradotte in 11 file del backend — `server.ts` (18), `runners/implementations.ts` (14), `metadataManager.ts` (9), `downloadManager.ts` (8), `plugins/gogPlugin.ts` (6), `plugins/epicPlugin.ts` (4), `plugins/classicPlugin.ts` (3), `aiProviders/orchestrator.ts` (3), `plugins/steamPlugin.ts` (3), `db.ts` (2), più 4 chiamate `console.error`/`console.log` sparse (`db.ts`, `knowledgeBase.ts`, `notificationEngine.ts` ×2). Verificato con un secondo giro di grep mirato su diacritici/parole italiane comuni: nessun residuo.

**Chiusura milestone**: versione bump a `v1.1.65-rc.3` in `App.tsx`/`package.json`/`metadata.json` (che guadagna anche una nuova voce riassuntiva in `patches[]` e i campi `milestone`/`notes` aggiornati). Pacchetto ricreato come `X-Launcher_v1_1_65-rc_3.zip`, stesse esclusioni di `.gitignore` (`node_modules`, `dist`, file di stato/log locali, ecc.) — 132 file, 665KB.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. `metadata.json` validato. Zip verificato: `node_modules` assente, tutti i file chiave presenti (namespace i18n inclusi).

## v1.1.66 — bugfix: rilevamento Proton su library folder Steam multiple

Segnalato dall'utente: Limbo (Steam, senza versione nativa Linux) girava correttamente tramite Proton, ma nessun runner Proton compariva né in Settings → System né nella sezione Runner Bridge dell'overlay Game Options.

Causa trovata verificando `compatibilityManager.ts`: le due cartelle scansionate per i Proton ufficiali di Steam (`~/.steam/steam/steamapps/common`, `~/.local/share/Steam/steamapps/common`) coprono solo l'installazione **di default** di Steam — non le library folder aggiuntive (es. un secondo disco dedicato ai giochi, comune su un HTPC), dove Steam può installare la build Proton effettivamente usata per un titolo specifico. `steamPlugin.ts` aveva già la soluzione corretta per lo stesso identico problema applicato alla libreria giochi (`findSteamRoot()`/`findAllLibraryPaths()`, che legge `libraryfolders.vdf` per enumerare tutte le library folder configurate in Steam) — mai riusata in `compatibilityManager.ts`, stesso bug irrisolto in due punti diversi del codice.

Fix: le due funzioni esportate da `steamPlugin.ts`, riusate in `compatibilityManager.ts` per costruire dinamicamente l'elenco delle cartelle da scansionare (`getProtonDirs()`, calcolato ad ogni chiamata, non in un campo di classe — l'elenco delle library folder può cambiare mentre l'app è in esecuzione). Stessa correzione applicata anche a `downloadProton()` e `uninstallProton()`, che assumevano `~/.local/share/Steam` come unico percorso possibile per `compatibilitytools.d` — ora usano la steam root effettivamente rilevata, con lo stesso fallback storico se il rilevamento fallisce del tutto.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti (inclusi due già presenti in `compatibilityManager.ts` prima di questo fix, non introdotti da esso), nessun errore nuovo.

## v1.1.67 — bugfix: rilevamento Proton via appmanifest (.acf), non solo scan cartelle

Osservazione dell'utente, corretta e più semplice del fix precedente: Steam elenca ogni Proton installato con un proprio `appmanifest_<appid>.acf`, esattamente come fa per un gioco — non serve dedurne la presenza scansionando cartelle alla ricerca di un file binario chiamato `proton`. `steamPlugin.ts` legge già questi stessi file per popolare la libreria giochi, e scarta esplicitamente (`isSteamTool`) le voci il cui nome inizia per "proton" — lo stesso identico dato che serviva qui, mai riusato.

Nuovo metodo `getInstalledProtonFromManifests()` in `compatibilityManager.ts`: riusa `findAllLibraryPaths()` (già esportata in v1.1.66) per leggere gli `appmanifest_*.acf` di tutte le library folder, filtra quelli il cui nome inizia per "proton" e il cui `StateFlags` indica installazione completa (bit 2, stesso controllo già usato per i giochi), restituendoli come runner disponibili — canonico, niente scan del filesystem alla cieca.

Il vecchio scan cartelle (v1.1.66) **resta**, non sostituito: copre Proton-GE installato via ProtonUp-Qt o download manuale da GitHub, che non genera mai un appmanifest perché non è "installato" da Steam stesso — le due fonti sono unite in `getAvailableRunners()` con deduplicazione per nome.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.68 — tray: cronologia ultimi 3 giochi lanciati nel menu contestuale

Richiesta dall'utente durante la discussione preliminare su Step 19a (`xlaunch://`): utile in un contesto d'uso desktop poter rilanciare al volo un gioco frequente col solo mouse, senza riportare in primo piano l'intera Dashboard.

**Backend**: nuova colonna nullable `last_launched_at` su `games` (stesso pattern di migrazione PRAGMA table_info + ALTER TABLE già in uso altrove). `db.recordGameLaunch(id)` chiamata da `gameManager.launchGame()` **solo dopo** tutti i controlli di blocco (non installato, lock installazione/gioco già attivo, plugin disabilitato) — un lancio bloccato non deve scavalcare un gioco realmente giocato di recente. `db.getRecentlyLaunched(limit)` esclude sia i giochi mai lanciati (`last_launched_at IS NULL`) sia quelli nel frattempo disinstallati. Nuovo endpoint `GET /api/games/recent?limit=3`, di sola lettura.

**Tray (`tray.py`)**: nuovo sottomenu "Giochi recenti", costruito come funzione generatrice passata a `pystray.Menu` (non una lista già pronta) — pystray la richiama ad ogni apertura del menu, quindi la cronologia mostrata è sempre quella corrente, non quella al momento dell'avvio del tray. Ogni voce cliccata chiama `POST /api/launch` — lo stesso identico endpoint già usato dal pulsante Play della Dashboard, nessuna logica di lancio duplicata nel tray.

**Bonus nello stesso passaggio**: le due voci di menu preesistenti ("Mostra/Nascondi Dashboard", "Esci dal tray") non erano mai state toccate dalla convenzione bilingue adottata durante Step 19b, essendo native Python fuori dal sistema i18next del frontend. Tradotte ora insieme alle nuove, per non introdurre la stessa incoerenza (solo il testo nuovo bilingue, quello vecchio no) risolta per l'intera UI web in questa sessione — lingua letta una sola volta all'avvio da `/api/config` (stesso campo già esposto per il frontend), nessun bisogno di un sistema i18n completo per poche stringhe native.

**Nota onesta**: il comportamento dinamico del sottomenu pystray (rigenerato ad ogni apertura tramite funzione generatrice) segue il pattern documentato della libreria ma non è stato verificato con un test dal vivo in questo ambiente (nessun server X/tray disponibile) — stesso avvertimento già presente nel modulo per la gestione XFixes del cursore.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo (verificato specificamente: zero errori in `db.ts`/`gameManager.ts`/`server.ts` nei punti toccati). `python3 -m py_compile tray.py`: sintassi valida.

## v1.1.69 — Step 19a: protocollo `xlaunch://`

Primo pezzo implementativo dopo la discussione preliminare di design (vedi X-Launcher-Roadmap.md, sezione 19a, per il ragionamento completo). Come concordato: nessuna nuova logica di lancio — `xlaunch://<id>` delega interamente a `POST /api/launch`, lo stesso endpoint già usato dal pulsante Play della Dashboard.

**Nuovo file `xlaunch-handler.sh`**: lo script effettivamente invocato dal sistema quando un link `xlaunch://<id>` viene cliccato. Estrae l'id dall'URI, verifica se daemon e finestra sono già attivi; se la finestra non esiste, avvia `kiosk-launch.sh` in background e la nasconde **subito dopo che compare**, prima che l'utente possa vederla — poi, in ogni caso, chiama `POST /api/launch` con l'id.

**Conflitto scoperto e risolto discutendone con l'utente prima di scrivere codice**: `kiosk-launch.sh` già richiama attivamente la finestra in primo piano per alcuni secondi dopo l'avvio (`focus_dashboard_window`), e mette i pannelli XFCE in autohide/titleless per l'occasione (`maybe_enable_xfwm4_titleless`) — entrambi andrebbero in corsa diretta con "la finestra deve restare nascosta". Deciso di riusare `kiosk-launch.sh` invariato nella sua logica di avvio (niente duplicazione), aggiungendo una singola variabile d'ambiente, `X_LAUNCHER_START_HIDDEN=true`, controllata all'inizio di entrambe le funzioni per saltarle quando l'avvio è per un lancio esterno nascosto.

**Registrazione a livello di sistema**: nuovo `xlaunch-protocol.desktop` (`MimeType=x-scheme-handler/xlaunch`), installato in `/usr/share/applications/` da `install.sh` (esteso, non un nuovo script) insieme alla registrazione `xdg-mime default` — eseguita esplicitamente come l'utente reale (`$SUDO_USER`, non root: altrimenti finirebbe nel `mimeapps.list` di root invece che dell'utente che userà davvero X-Launcher).

### Verifica

`bash -n` su `kiosk-launch.sh`/`xlaunch-handler.sh`/`install.sh`: sintassi valida su tutti e tre. Non testato dal vivo in questo ambiente (nessun server X/D-Bus/xdg-mime disponibile qui) — da verificare su hardware reale, in particolare il timing della corsa fra apertura finestra e `wmctrl -r ... add,hidden`.

## v1.1.70 — fix regressione: icona tray sparita dopo v1.1.68

Segnalato dall'utente: dopo aver applicato v1.1.68 (sottomenu "Giochi recenti"), l'icona del demone tray smetteva di comparire nella systray — pur con `tray.py` ancora vivo e funzionante (hide/show della finestra durante il gioco continuava a funzionare correttamente, prova che il processo non era crashato).

**Causa probabile**: il sottomenu era costruito passando una funzione generatrice a `pystray.Menu` — pattern di "menu pigro" documentato da pystray, rivalutato ad ogni apertura. Il backend AppIndicator, tipicamente usato su XFCE per la systray, si aspetta un menu GTK completamente costruito in anticipo, non generato al volo; con un menu "pigro" annidato, sembra fallire silenziosamente nel render dell'icona stessa, non solo del sottomenu — coerente con quanto osservato.

**Fix**: sottomenu ricostruito **staticamente**, valutando `fetch_recent_games()` subito invece che in una funzione generatrice. Per mantenerlo comunque aggiornato senza il pattern "pigro", `poll_loop` (già in esecuzione ogni 2s per governare l'hide/show del gioco) ora ricostruisce l'intero menu (`icon.menu = build_menu(); icon.update_menu()`) ogni 5 tick (~10s) — pattern cross-backend esplicitamente documentato da pystray per contenuto dinamico, a differenza del menu "pigro" che sembra non esserlo. Il refresh periodico è avvolto in un try/except che non deve mai far cadere il thread di polling: un aggiornamento menu fallito non deve compromettere la funzione più importante di quel loop (nascondere la finestra durante il gioco).

**Nota onesta**: la causa esatta (backend AppIndicator specificamente) è un'ipotesi ragionata sul comportamento osservato, non verificata con un test dal vivo in questo ambiente (nessun server X qui) — ma il fix (menu statico ricostruito periodicamente) è comunque il pattern più sicuro e documentato indipendentemente dalla causa esatta, quindi vale la pena applicarlo a prescindere.

### Verifica

`python3 -m py_compile tray.py`: sintassi valida. Nessun riferimento residuo al vecchio pattern a funzione generatrice.

## v1.1.71 — diagnostica tray: trovata la causa reale del silenzio

Segnalato dall'utente con log alla mano dopo che il fix v1.1.70 non aveva risolto il problema: giustamente ha chiesto strumenti di diagnosi invece di ulteriori tentativi al buio.

**Causa reale trovata**: `kiosk-launch.sh` avvia `tray.py` con `&>/dev/null` — **qualunque** output, incluso un traceback Python completo in caso di eccezione, veniva buttato via, sempre. L'ipotesi AppIndicator di v1.1.70 poteva essere giusta o sbagliata, semplicemente non c'era modo di saperlo: non si stava "andando alla cieca" per mancanza di log da parte di `tray.py` (che già ne stampava), ma perché finivano tutti su `/dev/null` prima ancora di poter essere letti.

**Fix**:
- `kiosk-launch.sh`: l'output di `tray.py` ora va su `~/.local/share/x-launcher/tray.log` (sovrascritto ad ogni avvio, non accumulato all'infinito), non più su `/dev/null`.
- `tray.py`: aggiunta diagnostica esplicita in `main()` — versione pystray, `DISPLAY`/`XDG_SESSION_TYPE`/`DBUS_SESSION_BUS_ADDRESS`, lingua rilevata, e soprattutto **quale backend concreto pystray ha scelto** (`type(icon).__module__` — AppIndicator/GTK/XOrg hanno requisiti di sistema diversi, es. AppIndicator richiede uno StatusNotifierHost nel pannello come `xfce4-statusnotifier-plugin`, non presente di default nella "Notification Area" base di XFCE che supporta solo il protocollo XEmbed legacy).
- `if __name__ == "__main__":` ora avvolge `main()` in un try/except che stampa il traceback completo di qualunque eccezione non gestita altrove, invece di terminare in silenzio.
- `sys.stdout`/`stderr` impostati a line-buffered fin dall'inizio dello script: un output reindirizzato su file normalmente bufferizza a blocchi, non riga per riga — se il processo terminasse bruscamente, gli ultimi log rischiavano di non arrivare mai al file, lo stesso tipo di "buco" diagnostico appena risolto in `kiosk-launch.sh`.

**Refuso corretto nello stesso passaggio**: un commento scritto per errore in stile C (`//`) invece che Python (`#`) nel primo giro di scrittura di questa modifica — avrebbe causato un errore di sintassi. Preso dalla verifica di sintassi che precede ogni consegna, non arrivato all'utente.

### Verifica

`python3 -m py_compile tray.py`: sintassi valida. `bash -n kiosk-launch.sh`: sintassi valida.

## v1.1.72 — trovato e corretto il vero crash (grazie alla diagnostica v1.1.71)

La diagnostica aggiunta in v1.1.71 ha funzionato esattamente come doveva: il traceback fornito dall'utente ha rivelato il crash reale al primo avvio, mai visibile prima per via di `&>/dev/null`.

```
ValueError: <function build_recent_games_menu_items.<locals>.<lambda> at 0x...>
```

**Causa esatta**: pystray valida ogni azione di `MenuItem` contando gli argomenti con `action.__code__.co_argcount`, accettando solo 0, 1 o 2 — e conta **anche i parametri con un valore di default**, non solo quelli obbligatori. Il codice di v1.1.68/70 catturava l'id del gioco nel ciclo con `lambda icon, item, gid=g["id"]: launch_game(gid)` — un trucco comune per evitare la classica insidia delle closure in un loop, ma che pystray vede come 3 argomenti totali e rifiuta con un `ValueError`, mandando in crash l'intero tray al primo avvio (non un problema di backend AppIndicator come ipotizzato in v1.1.70, che restava comunque un fix ragionevole a prescindere).

**Fix**: sostituita la lambda con parametro di default con una vera closure tramite funzione factory (`_make_launch_callback(game_id)`, che restituisce un `callback(icon, item)` con `game_id` catturato dalla funzione circostante) — la firma risultante ha esattamente 2 argomenti, il caso esplicitamente accettato da pystray.

**Verificato con un test isolato**, non solo per ragionamento sul codice: script Python separato che importa `pystray._base` direttamente (bypassando la selezione del backend, che in questo ambiente sandbox fallisce per mancanza di GTK) e costruisce `MenuItem` sia con il vecchio pattern sia con quello nuovo — confermato che il vecchio solleva lo stesso identico `ValueError` del traceback dell'utente, e il nuovo non solleva nulla.

### Verifica

`python3 -m py_compile tray.py`: sintassi valida. Test isolato con `pystray._base.MenuItem`: vecchio pattern → `ValueError` riprodotto; nuovo pattern → nessun errore.

## v1.1.73 — Step 19a: campo "Steam App ID" reso contestuale, id visibile per testare xlaunch://

Richiesta dall'utente: senza un modo comodo per vedere l'id interno di un gioco, testare `xlaunch://<id>` richiedeva aprire il database o i log a mano. Il campo "Steam App ID" nel Game Config era già lì, ma **sempre mostrato come tale anche per giochi non-Steam**, dove non ha mai significato nulla (mai usato, mai valorizzato) — occasione naturale per riusarlo invece di aggiungere un campo nuovo.

**Per giochi Steam**: invariato, resta "Steam App ID" modificabile (apre la tastiera virtuale, stesso comportamento di sempre).

**Per tutti gli altri store**: diventa "xlaunch:// App ID", di sola lettura, con l'id interno della Dashboard (`selectedGame.id`) — lo stesso valore da usare dopo `xlaunch://` per un test. Nessuna tastiera virtuale (non è un campo modificabile): Invio copia l'id negli appunti (`navigator.clipboard.writeText`), con un tooltip che lo indica esplicitamente.

Le due etichette restano invariate in entrambe le lingue (nomi tecnici/di protocollo, stesso principio già applicato a "Runner Bridge"/"RetroArch Core"); il tooltip "Invio per copiare", genuinamente conversazionale, tradotto secondo la convenzione bilingue adottata in questa sessione.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati.

## v1.1.74 — Step 19a: fix bug reale trovato dall'utente testando l'avvio a freddo

Testato dall'utente sia con Dashboard già aperta sia con avvio "a freddo" via `xlaunch://`: nel secondo caso, l'avvio nascosto funzionava correttamente (nessuna interferenza col gioco), ma alla chiusura del gioco la Dashboard riappariva **massimizzata con il decoratore XFCE visibile**, non più a schermo intero — nonostante il Quick Menu continuasse a segnalare la modalità come "Schermo Intero".

**Causa**: il guard `X_LAUNCHER_START_HIDDEN` aggiunto in v1.1.69 a `maybe_enable_xfwm4_titleless()` era basato su un ragionamento sbagliato ("evita un flicker dei pannelli mentre si gioca"). Quella funzione non è solo estetica sui pannelli XFCE: `titleless_maximize=true` al suo interno è **l'intero meccanismo** con cui la modalità "kiosk" appare senza decorazioni — Chromium qui non usa mai un vero flag `--kiosk`, si affida a `--start-maximized` + questa impostazione xfwm4 (nessuna decorazione su una finestra maximized con `titleless_maximize` attivo). Saltare la funzione lasciava quell'impostazione al suo valore precedente, e la finestra tornava visibile maximized ma con decorazione normale.

Anche il ragionamento originale non reggeva a un secondo sguardo: il cambiamento a `titleless_maximize` avviene una sola volta, all'avvio della Dashboard — non in concomitanza con l'hide/show che avviene durante la partita. Nessun flicker reale da evitare.

**Fix**: guard rimosso da `maybe_enable_xfwm4_titleless()` — viene sempre eseguita indipendentemente da `X_LAUNCHER_START_HIDDEN`, avvio a freddo o no. Il guard gemello in `focus_dashboard_window()` (che previene la vera corsa con l'hide di `xlaunch-handler.sh`) resta invariato, quello era corretto.

### Verifica

`bash -n kiosk-launch.sh`: sintassi valida. Non testato di nuovo dal vivo in questo ambiente (nessun server X qui) — da confermare su hardware reale con un nuovo test di avvio a freddo.

## v1.1.75 — RetroArch: launch argument contestuali + titolo di scraping manuale

Due migliorie richieste dall'utente per il plugin Classic Console/RetroArch.

**1) Launch Arguments contestuali per RetroArch.** Il backend supportava già tutto, senza bisogno di toccare `RetroArchRunner`: `runnerConfig.args` (costruito da `game.launchArgs` in `gameManager.ts`) viene già passato a qualunque runner in modo generico, e `RetroArchRunner.launch()` già accoda `config?.args` alla riga di comando. Mancava solo la UI: i suggerimenti Shift sulla tastiera virtuale per il campo Launch Arguments erano **sempre** quelli Wine/Proton, anche per un gioco RetroArch, dove non hanno senso.

Nuova lista `RETROARCH_LAUNCH_ARG_SUGGESTIONS` (`--appendconfig=` — la via corretta per applicare uno shader CRT per-gioco, dato che RetroArch non ha un flag diretto tipo `--shader=` in tutte le build; `-v` per la diagnostica; `--max-frames=` per test automatizzati). `keyboardAltSuggestions` ora sceglie fra questa e la lista Wine/Proton in base a `selectedGame.runner === 'RetroArch'`, esattamente come già faceva per Custom Env Variables (Wine vs Proton).

**2) Titolo di scraping manuale, per ROM MAME con nome poco significativo.** `titleFromFilename()` in `classicPlugin.ts` fa solo una pulizia ingenua del nome file — per "gngt.zip" resta "gngt", che è esattamente quello che veniva mandato a IGDB/SGDB (confermato nel log fornito dall'utente in una sessione precedente: `⚠ IGDB no results: gngt`). Un vero database MAME è fuori scala; invece, un campo di override manuale — stesso principio già in uso per "ScummVM Game ID".

Reso disponibile per **qualunque gioco**, non solo Classic Console (richiesta esplicita dell'utente): utile anche se lo scraping automatico sbaglia abbinamento per un titolo Steam/GOG/Epic. Pipeline completa:

- Nuova colonna nullable `scrape_title` su `games` (stesso pattern di migrazione PRAGMA table_info + ALTER TABLE già in uso), esplicitamente **esclusa** dalla clausola `ON CONFLICT DO UPDATE SET` di `upsertGame` — stessa protezione già in uso per `executable_path`/`steam_app_id`/ecc., altrimenti una sync automatica della libreria la cancellerebbe.
- `metadataManager.enrichGameMetadata()` usa `game.scrapeTitle || game.title` per la query di ricerca; nuovo parametro `force` che salta sia la cache in memoria sia lo skip "ha già metadati reali" — necessario perché altrimenti un gioco con già (sbagliati) cover/rating dal nome ROM non verrebbe mai ri-arricchito.
- **Rifetch immediato**, richiesto esplicitamente dall'utente invece di aspettare la prossima sync automatica: `gameManager.updateGameConfig()` lo attiva in background non appena `scrapeTitle` cambia, notificando via SSE `library-updated` (stesso meccanismo di ogni altro aggiornamento asincrono ai metadati) a fetch completato.
- Nuovo campo "Titolo per Ricerca Metadati" nel Game Config, tradotto in entrambe le lingue.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo (verificato specificamente su `db.ts`, `gameManager.ts`, `metadataManager.ts`, `types.ts`). JSON validati. Corretto durante la stesura un JSX rimasto orfano (apertura di commento/tag persa da un inserimento precedente) — preso dalla verifica di sintassi prima della consegna, non arrivato all'utente.

## v1.1.76 — titolo canonico da IGDB dopo scrapeTitle + preset "Filtro CRT" un-click

Due follow-up richiesti dall'utente dopo aver provato v1.1.75.

**1) Il titolo mostrato in libreria/sidebar restava comunque quello brutto.** `scrapeTitle` (v1.1.75) correggeva solo la query di ricerca, non il titolo visualizzato — il gioco continuava a chiamarsi "gngt" anche con cover e info corrette scaricate. Corretto in `metadataManager.ts`: quando `game.scrapeTitle` è impostato e IGDB conferma un abbinamento reale, il titolo mostrato viene aggiornato a `igdbData.name` — il nome **canonico** restituito da IGDB, non il testo scritto a mano dall'utente (che potrebbe essere solo un indizio di ricerca, capitalizzazione/nome ufficiale non garantiti). Un titolo Steam/GOG/Epic già corretto non viene mai rinominato solo perché IGDB ha trovato una corrispondenza — solo quando `scrapeTitle` è esplicitamente impostato.

Nello stesso passaggio, resi coerenti con `force` anche gli altri controlli interni di `enrichGameMetadata()` (SGDB/IGDB/HLTB, e le singole assegnazioni rating/generi/descrizione/data di uscita) — prima `force` bypassava solo il controllo più esterno; se un gioco avesse già avuto un abbinamento sbagliato da un precedente `scrapeTitle` poi corretto, i controlli interni "ha già dati" avrebbero comunque impedito la sovrascrittura con quelli nuovi.

**2) Preset "Filtro CRT" — un click, non un flag da completare a mano.** L'utente ha giustamente notato che il suggerimento `--appendconfig=` (v1.1.75) presuppone di sapere già quale file "appendere" — non praticabile per chi non vuole entrare nei tecnicismi. Nuovo file bundled `assets/retroarch-presets/crt-easymode.cfg` (shader `crt-easymode.slangp`, verificato con una ricerca reale come bundled dal pacchetto `libretro-shaders-slang` su Arch — leggero, ampiamente raccomandato come default, non un percorso indovinato). Percorso assoluto risolto lato server (`GET /api/config`, nuovo campo `retroarchCrtPresetPath` via `path.join(process.cwd(), ...)` — funziona sia da un checkout di sviluppo sia da un'installazione in `/opt/x-launcher`) ed esposto al frontend. Nuovo pulsante "📺 Filtro CRT" accanto al campo Launch Arguments, visibile solo per giochi RetroArch: un solo Invio scrive `--appendconfig=<percorso risolto>` e lo salva, zero file da creare o percorsi da conoscere.

**Sul preset "Remaster" (N64/PSX/Saturn/PS2/Dreamcast) discusso insieme all'utente ma non ancora implementato**: a differenza del filtro CRT (un solo file, universale per qualunque sistema 2D), l'upscaling della risoluzione interna richiede opzioni **specifiche per ciascun core** (Mupen64Plus-Next per N64, Beetle PSX HW per PSX, Beetle Saturn per Saturn, Flycast per Dreamcast — nomi di opzione diversi, che cambiano fra versioni dei core), e il supporto PS2 in RetroArch non è maturo/diffuso quanto gli altri. Rischio concreto di scrivere un nome di opzione sbagliato che RetroArch ignora silenziosamente invece di segnalare errore. Da affrontare come lavoro a parte, verificando le opzioni corrette core per core prima di scrivere qualunque preset — non incluso in questa voce.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati.

## v1.1.77 — due bug reali trovati dall'utente con test dal vivo

**1) `--appendconfig=` ignorato del tutto da RetroArch.** Test dal vivo dell'utente: l'unico argomento che applica davvero lo shader CRT è `--set-shader "/percorso/shader.slangp"` — `--appendconfig=` non ha alcun effetto, causa non ancora capita. Il pulsante "Filtro CRT" nell'overlay (v1.1.76, scriveva `--appendconfig=`) è stato **rimosso**: la stessa scorciatoia vive ora fra i suggerimenti Shift della tastiera virtuale per Launch Arguments (`RETROARCH_LAUNCH_ARG_SUGGESTIONS`), come voce già completa con `--set-shader` e il percorso reale del file — non un flag da completare a mano. Il file bundled `assets/retroarch-presets/crt-easymode.cfg` e il campo `retroarchCrtPresetPath` in `GET /api/config` restano nel progetto (non consumati dal frontend per ora) per quando si capirà perché la configurazione custom via file viene ignorata.

**2) Il titolo corretto in libreria/sidebar (v1.1.76) non era persistente.** Confermato dall'utente: tornava al nome grezzo del ROM alla sync successiva, e anche solo riavviando la Dashboard — nonostante il campo di testo dell'overlay continuasse a mostrare il valore corretto inserito dall'utente. Causa trovata con un test isolato (`better-sqlite3` in memoria, sequenza reale riprodotta passo per passo) invece che a naso: `title = excluded.title` nell'`ON CONFLICT DO UPDATE SET` di `upsertGame()` veniva sovrascritto incondizionatamente da qualunque sync successiva del plugin (che ripropone sempre il titolo grezzo derivato dal nome file, non sa nulla di `scrapeTitle`).

Primo fix tentato — proteggere `title` con `CASE WHEN games.scrape_title IS NOT NULL THEN games.title ELSE excluded.title END` — si è rivelato **insufficiente da solo**, e il test isolato l'ha scoperto prima che l'utente lo facesse: la stessa protezione blocca anche la scrittura legittima del titolo corretto fatta dal passaggio di arricchimento stesso, perché a quel punto `scrape_title` è già impostato dal salvataggio immediatamente precedente. Aggiunta `db.updateGameTitle(id, title)`, una UPDATE diretta e incondizionata che bypassa quella protezione — chiamata solo dal passaggio di arricchimento in `gameManager.ts`, solo quando il titolo è davvero cambiato. Sequenza completa (sync iniziale → override utente → arricchimento → sync successiva → riavvio simulato) riverificata con lo stesso test isolato dopo il fix: il titolo corretto sopravvive a tutti i passaggi.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. JSON validati. Fix della persistenza titolo verificato con un test isolato `better-sqlite3` (non solo lettura del codice) che riproduce l'intera sequenza reale (sync → PATCH → arricchimento → sync successiva → riavvio) — sia la versione col bug sia quella corretta, per confermare che il problema fosse esattamente quello ipotizzato.

## v1.1.78 — etichetta breve per i suggerimenti della tastiera virtuale

Richiesta dall'utente, confermato stabile il fix titolo di v1.1.77: il chip della scorciatoia "Filtro CRT" nella tastiera virtuale mostrava il `value` per intero (`--set-shader "/usr/share/libretro/shaders/shaders_slang/crt/crt-easymode.slangp"`), poco leggibile.

Nuovo campo opzionale `label` su `SuggestionItem` (`VirtualKeyboard.tsx`): se presente, il chip mostra quello al posto di `value` — `value` resta invariato ed è sempre quello che viene davvero inserito nel campo, `label` è solo la resa visiva. Nessuna suggestion esistente che non lo imposta cambia aspetto. La voce "Filtro CRT" ora usa `label: '📺 Filtro CRT'`.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.79 — quattro migliorie alla tastiera virtuale

Richieste dall'utente in un unico giro.

**1) Focus iniziale sulla Q.** Trovato un riferimento morto mentre si applicava la richiesta: il focus iniziale puntava a `'key-done'`, un pulsante "Fatto" che non esiste più da quando la tastiera è stata ridisegnata a 4 righe con Invio-per-chiudere — la protezione anti-rimbalzo del tasto A che quel riferimento doveva garantire non era quindi già più realmente in funzione. Corretto puntando a `'key-1-Q-0'` (id reale della Q, identico in entrambi i layout). La protezione anti-rimbalzo è stata spostata dentro `VirtualKeyboard.tsx`: una finestra di grazia di 200ms dal montaggio in cui `handleKey` ignora silenziosamente qualunque pressione, per assorbire un residuo del tasto fisico A letto come "appena premuto" nel frame successivo all'apertura.

**2) Navigazione ciclica, orizzontale e verticale.** `buildNeighborMap()` usava guard (`if (colIdx > 0)`, `if (rowIdx > 0)`) che lasciavano il vicino non impostato ai bordi, cadendo nello scoring geometrico generico (già documentato come inaffidabile in questo stesso file). Sostituiti con aritmetica modulo: dal bordo si riparte sempre dal lato opposto, sia in orizzontale (fine riga → inizio stessa riga) sia in verticale (l'intera tastiera come un ciclo).

**3) I suggerimenti impedivano di scendere ai tasti.** Causa esatta in `FocusProvider.tsx`: `chainAxis="flow"` intercetta OGNI direzione (non solo sinistra/destra), quindi "giù" da un suggerimento veniva letto come "avanti nella catena" — restava intrappolato finché non si raggiungeva l'ultimo elemento, e per uscire dal primo bisognava andare a sinistra (l'unica direzione "indietro" che cadeva fuori dai bordi). Cambiato in `chainAxis="horizontal"`: la catena cattura solo sinistra/destra (che restano in ordine di lettura come prima, nessuna differenza), su/giù cadono subito nella mappa vicini.

Risolto in modo unificato con il punto 2: i suggerimenti sono stati integrati come riga aggiuntiva in cima al ciclo verticale di `buildNeighborMap()` (`rowSugg`, ricalcolata quando cambia `activeSuggestions`) — dalla riga numeri si sale ai suggerimenti, dai suggerimenti si scende ai numeri, il ciclo li include naturalmente senza casi speciali. Sinistra/destra sui suggerimenti restano governati solo dalla sequentialChain (i due meccanismi si dividono puliti gli assi, nessun conflitto: la catena viene valutata prima della mappa vicini in `FocusProvider`, quindi eventuali sinistra/destra assegnati dalla mappa non avrebbero comunque effetto).

**4) Apostrofo mancante.** Aggiunto in fondo a `row4` in entrambi i layout (IT/EN), stesso trattamento di "," e "." — un solo carattere, nessuna variante shiftata.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo (verificato specificamente: zero errori in `VirtualKeyboard.tsx`).

## v1.1.79-Gaia — MILESTONE STABILE

Da questa versione in poi, ogni milestone stabile prende il nome di un pianeta o satellite del sistema solare — richiesta esplicita dell'utente, prima applicazione della convenzione.

Congelata dopo che l'utente ha giudicato tutte le funzioni core sufficientemente mature: libreria unificata GOG/Epic/Steam/Classic Console, interfaccia interamente bilingue IT/EN (Step 19b, chiuso da tempo), protocollo `xlaunch://` funzionante end-to-end e testato su hardware reale (Step 19a, chiuso in questa stessa sessione), Knowledge Base e risposte AI Advisor bilingui, cronologia giochi recenti nella tray, migliorie RetroArch (Launch Arguments contestuali, override del titolo di scraping, preset shader CRT), tastiera virtuale con navigazione ciclica.

Nessun cambiamento di codice in questa voce — solo il congelamento: versione aggiornata in `App.tsx`/`package.json` (`v1.1.79-Gaia`), `metadata.json` aggiornato (`version`/`milestone`/`date`/`notes` + nuova voce riassuntiva in `patches[]`), pacchetto ricreato per intero come `X-Launcher_v1_1_79-Gaia.zip`, stesse esclusioni di `.gitignore` già usate per RC3 (`node_modules`, `dist`, stato locale, log, ecc.).

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. `metadata.json` validato. Zip verificato: `node_modules` assente, tutti i file chiave presenti.

## v1.1.80 — kiosk-launch.sh: supporto cross-DE (XFCE/MATE/GNOME/Plasma)

Richiesto dall'utente: la creazione di una sessione dedicata è oggi incomplessa/non funzionante, quindi per l'apertura ai test ci si concentra sull'installazione entro un desktop environment esistente — non più solo XFCE, ma anche MATE, GNOME e Plasma (i più diffusi). `--kiosk` di Chromium scartato su indicazione esplicita dell'utente: causa problemi di prestazione, già deprecato in passato a favore dell'attuale finestra massimizzata senza bordi.

**Bug reale trovato mentre si verificava il codice esistente, non richiesto ma rilevante**: il rilevamento "sessione dedicata sì/no" controllava **solo** `pgrep -x xfwm4` — su MATE/GNOME/Plasma quel processo non esiste mai, quindi lo script avrebbe concluso erroneamente "nessun DE sotto" e tentato di partire in sessione dedicata via Gamescope, l'esatto opposto dell'obiettivo di oggi. Sostituito con `$XDG_CURRENT_DESKTOP` (standard moderno, impostato dalla sessione stessa su tutti e quattro i desktop), con fallback via `pgrep` sui processi WM noti (xfwm4/marco/gnome-shell/kwin_x11/kwin_wayland) solo per il caso limite in cui la variabile non sia impostata. Aggiunto anche un log esplicito del DE rilevato, per diagnostica futura — stessa lezione della saga tray (v1.1.71): meglio loggare che indovinare alla cieca.

**Rimozione decorazioni universale**: il vecchio meccanismo (`titleless_maximize` di xfwm4, config globale impostata prima di lanciare Chromium) funzionava solo su XFCE. Sostituito con `_MOTIF_WM_HINTS`, una proprietà X11 di basso livello verificata con una ricerca reale (non indovinata) come rispettata esplicitamente da Mutter (GNOME) e KWin (Plasma), oltre che da xfwm4/Marco in quanto WM "moderni" conformi allo stesso standard derivato da Motif — un solo meccanismo per tutti e quattro i desktop invece di quattro trucchi separati da verificare uno per uno.

Essendo una proprietà per-finestra (non una config globale), applicata DOPO che la finestra del browser esiste, non più prima del lancio: nuova funzione `remove_window_decorations()`, chiamata in parallelo a `focus_dashboard_window()` subito dopo l'avvio del browser (stesso pattern, stesso ciclo di attesa). Include un doppio toggle maximize (tolto e riapplicato) — workaround documentato dalla community per i WM che applicano l'hint solo al primo map della finestra, non dinamicamente su una già visibile.

L'autohide dei pannelli XFCE (puramente estetico, non essenziale per il look "kiosk" a differenza del vecchio `titleless_maximize`) resta come funzione separata (`maybe_enable_xfce_panel_autohide()`), XFCE-only, innocua altrove.

**Nota onesta**: il meccanismo `_MOTIF_WM_HINTS` non è stato testato dal vivo in questo ambiente (nessun server X qui) su nessuno dei quattro desktop — verificato che esiste ed è documentato come supportato dai WM target, non che si comporti in modo identico ovunque. Da confermare su hardware reale, a partire da XFCE (dove il comportamento precedente era già noto, utile come termine di paragone).

Due refusi di sintassi trovati e corretti durante la verifica prima della consegna (una doppia parentesi graffa residua da una sostituzione precedente, un riferimento a una variabile `$WINDOW_TITLE` mai definita in questo file) — presi dalla verifica di sintassi, non arrivati all'utente.

### Verifica

`bash -n kiosk-launch.sh`: sintassi valida. Conteggio funzioni/chiusure bilanciato (5/5). Nessun riferimento residuo alla vecchia funzione rinominata.

## v1.1.81 — tre bug reali trovati dall'utente testando v1.1.80

**1) `./build.sh start firefox` avviava comunque Chromium.** Bug in `build.sh`: il ramo `start)` chiamava la funzione `start` **senza inoltrarle gli argomenti** (`start ;;` invece di `start "$@"`), a differenza del ramo `all)` che lo faceva correttamente — dentro la funzione, `${2:-}` era quindi sempre vuoto, e `kiosk-launch.sh` riceveva un browser forzato vuoto, ricadendo sul rilevamento automatico (Chromium per primo). Un solo carattere di differenza fra i due rami (`"$@"` mancante), mai notato perché nessuno aveva mai testato `build.sh start <browser>` fino ad ora — solo `./kiosk-launch.sh <browser>` direttamente, che infatti funzionava già.

**2) Firefox apriva la Dashboard come scheda in una finestra già esistente**, arrivando a comparire affiancata ad altre schede aperte (segnalato: affiancata alla chat da cui l'utente scriveva). Confermato con una ricerca reale (bug Mozilla #855899 e documentazione ufficiale): `--new-instance`, l'unico flag usato finora, non disattiva il meccanismo di "remote" di Firefox su Linux — un Firefox già in esecuzione intercetta comunque la richiesta e apre solo una nuova scheda. Fix: aggiunto `--no-remote` insieme a un profilo dedicato (`~/.local/share/x-launcher/firefox-profile`, creato automaticamente da Firefox se assente) — combinazione documentata come l'unica che garantisce un'istanza davvero separata indipendentemente da cosa sia già in esecuzione. Applicato in tutti e tre i punti di lancio Firefox (sessione dedicata Gamescope, desktop esistente — quest'ultimo era anche privo della chiamata a `remove_window_decorations`/`maybe_enable_xfwm4_titleless`, mai presenti nel ramo Firefox fino ad ora).

**3) Il decoratore restava visibile anche su XFCE**, dove il vecchio meccanismo era invece confermato funzionante prima della rewrite di v1.1.80 — segno che il tentativo universale `_MOTIF_WM_HINTS` non ha funzionato come sperato, almeno non da solo. L'utente ha suggerito esattamente la soluzione giusta: dispatch per-DE invece di un solo meccanismo universale. Ripristinato `maybe_enable_xfwm4_titleless()` (il vecchio meccanismo provato, config globale xfwm4 impostata prima del lancio) per XFCE specificamente, con `_MOTIF_WM_HINTS` mantenuto come livello aggiuntivo dopo per tutti i desktop (XFCE incluso, dove nel peggiore dei casi è ridondante) — su MATE/GNOME/Plasma resta l'unico meccanismo disponibile per ora, non essendoci ancora un trucco per-DE provato per quei tre.

Aggiunta anche diagnostica reale a `remove_window_decorations()` (id finestra trovato, esito di `xprop -set`, rilettura della proprietà subito dopo averla impostata) — stessa lezione della saga tray (v1.1.71): un secondo tentativo alla cieca senza dati concreti non avrebbe senso, se il meccanismo universale continua a non funzionare anche con questi fix, il prossimo test dirà esattamente dove si ferma.

### Verifica

`bash -n kiosk-launch.sh` / `bash -n build.sh`: sintassi valida su entrambi. Non testato di nuovo dal vivo in questo ambiente (nessun server X qui) — da confermare su hardware reale.

## v1.1.82 — fix: profilo Firefox dedicato non veniva creato

Segnalato dall'utente subito dopo v1.1.81: lanciando la Dashboard in Firefox, "Your Firefox profile cannot be loaded. It may be missing or inaccessible."

Il fix precedente assumeva (citando la documentazione Mozilla) che `--profile <percorso>` creasse la cartella da solo se assente. Verificato con una ricerca reale — non bastava fidarsi della documentazione questa volta: un report utente reale su Mozilla Support mostra **esattamente lo stesso errore**, con la nota che funzionava solo quando la cartella era già stata creata in anticipo a mano. L'auto-creazione dichiarata non si è dimostrata affidabile in pratica per un percorso annidato non ancora esistente.

Fix: `mkdir -p "$FIREFOX_PROFILE_DIR"` esplicita prima di ogni lancio Firefox, in entrambi i punti che la usano (sessione dedicata Gamescope, desktop esistente) — stesso pattern già usato altrove in questo file per il log della tray, non fidarsi di un'auto-creazione che si è già dimostrata inaffidabile altrove in questa stessa sessione (`--appendconfig=` di RetroArch).

### Verifica

`bash -n kiosk-launch.sh`: sintassi valida.

## v1.1.83 — fix: barra indirizzi/tab visibile in Firefox

Segnalato dall'utente subito dopo v1.1.82: Firefox ora si avvia correttamente (fix profilo riuscito), ma con decoratore e barra degli indirizzi.

**Barra indirizzi/tab**: a differenza di Chromium (`--app=<url>` nasconde tutto da solo), Firefox nelle versioni moderne non ha un flag CLI equivalente — verificato con una ricerca reale prima di scrivere codice, non indovinato. L'unica via documentata è `userChrome.css`, un foglio di stile che personalizza l'interfaccia di Firefox stessa, che va esplicitamente abilitato tramite la preferenza `toolkit.legacyUserProfileCustomizations.stylesheets` (altrimenti ignorato in silenzio). Avendo già un profilo dedicato (v1.1.82), nuova funzione condivisa `setup_firefox_profile()` che vi scrive `user.js` (abilita la preferenza) e `chrome/userChrome.css` (nasconde `#nav-bar`, `#TabsToolbar` e `#titlebar` — quest'ultimo è la titlebar disegnata da Firefox stesso, un elemento diverso e indipendente dalla decorazione del window manager) — scritti ad ogni avvio, idempotente. Sostituisce la semplice `mkdir -p` usata nei due punti di lancio Firefox, ora unificati in questa unica funzione condivisa invece di duplicare la stessa logica.

**Decoratore ancora visibile**: non ancora affrontato in questa voce — serve l'output diagnostico aggiunto in v1.1.81 (`[_MOTIF_WM_HINTS]` nel terminale) per capire dove si ferma il meccanismo su Firefox, non ancora fornito dall'utente.

### Verifica

`bash -n kiosk-launch.sh`: sintassi valida. Conteggio funzioni/chiusure bilanciato (7/7).

## v1.1.84 — decoratore confermato funzionante, fix pannello XFCE in Firefox

**Confermato dall'utente con log alla mano**: il dispatch per-DE di v1.1.81 funziona — `xfwm4 titleless_maximize` (era `false`, impostato a `true`) e `_MOTIF_WM_HINTS` (rilettura dopo il set: `decorations=0`, confermato) lavorano insieme correttamente. Firefox ora parte a schermo intero in una finestra davvero senza bordi.

**Residuo trovato**: il pannello XFCE in alto non spariva mai in Firefox. Causa banale — `maybe_enable_xfce_panel_autohide()` era chiamata **solo** nel ramo Chromium (già presente da prima di questa sessione), mai aggiunta al ramo Firefox durante i fix precedenti (v1.1.81/82/83 avevano tutti toccato quel ramo per altri motivi, senza mai notare questa chiamata mancante). Aggiunta ora.

### Verifica

`bash -n kiosk-launch.sh`: sintassi valida.

## v1.1.85 — due bug Firefox-specifici: X/Y invertiti, audio silenzioso

Segnalati dall'utente dopo il successo di v1.1.84 (decoratore + pannello XFCE risolti su entrambi i browser).

**1) X apre la ricerca, Y apre l'overlay — invertiti, solo in Firefox.** Verificato con una ricerca reale, non indovinato: bug noto e datato della Gamepad API di Firefox su Linux (Mozilla bugzilla #1152937 — "Ubuntu 18.04.3... buttons are switched", con lo stesso identico sintomo riprodotto anche con un controller DS4: "the triangle and square button are switched" — indici 2/3, esattamente X/Y). Chromium sullo stesso sistema riporta l'ordine corretto: non è un problema di come X-Launcher legge la Gamepad API, è Firefox stesso a restituire l'indice sbagliato nel suo array `buttons`.

Fix in `InputManager.ts`, non in ciascuno dei quattro plugin di input (XInput/DS4/DS5/Generic condividono tutti la stessa convenzione di indici 0-3 per A/B/X/Y, tutti ugualmente affetti): nuova funzione `swapXY()` applicata in `readPrimary()`, l'unico punto in cui il risultato di qualunque plugin passa prima di raggiungere il resto dell'app — un solo fix invece di quattro duplicati. Attivo solo quando `navigator.userAgent` rileva Firefox.

**2) I suoni dell'interfaccia non si sentivano in Firefox.** Chromium ha già `--autoplay-policy=no-user-gesture-required` nel comando di lancio — nessun equivalente CLI esiste per Firefox, e la sua policy di autoplay blocca l'audio finché non rileva un vero "user gesture" (un pulsante del controller non sempre viene contato come tale, a differenza di un click o una pressione da tastiera). Verificato con una ricerca reale la preferenza corretta e il suo valore attuale: `media.autoplay.default = 0` ("consentito"). Aggiunta a `user.js` nel profilo Firefox dedicato, insieme alle altre due preferenze già scritte da `setup_firefox_profile()`.

### Verifica

`bash -n kiosk-launch.sh`: sintassi valida. `tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo (verificato specificamente: zero errori in `InputManager.ts`).

## v1.1.86 — avatar spostato dal localStorage al server

Segnalato dall'utente: l'avatar impostato in Chromium non veniva letto in Firefox, e si azzerava ad ogni riavvio della Dashboard in Firefox specificamente.

Causa trovata verificando il codice: l'avatar selezionato era salvato solo in `localStorage` (chiave `x-launcher-avatar`), uno storage per-browser per definizione — Chromium e Firefox non lo condividono mai, indipendentemente da qualunque fix. In più, Firefox viene lanciato con `--private-window`, che scarta l'intero storage del browser alla chiusura della finestra: anche restando sempre su Firefox, nulla sarebbe mai sopravvissuto a un riavvio.

Fix architetturale, non un cerotto locale: la selezione dell'avatar è stata spostata alla persistenza lato server già usata per `displayMode`/`language`/`aiMonthlyTokenBudget` (`app.conf`, tramite `readAppConfig()`/`writeAppConfig()` in `appConfig.ts`). Nuovo campo `avatarUrl: string | null` (null = nessun avatar, default), esposto in `GET /api/config` e scrivibile tramite lo stesso endpoint generico `PATCH /api/config` già esistente (nessuna modifica a `server.ts` necessaria, accetta già campi arbitrari). Frontend: i quattro punti che leggevano/scrivevano `localStorage` diretti sostituiti con un nuovo helper `persistAvatarUrl()`, e lo stato iniziale letto dal fetch di boot di `/api/config` invece che da `localStorage.getItem()` all'avvio.

Risolve entrambi i sintomi alla radice: l'avatar ora sopravvive sia al riavvio della Dashboard (qualunque browser) sia al cambio di browser, essendo un dato condiviso sul filesystem invece che nello storage isolato di ciascun browser.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo (verificato specificamente: zero errori in `appConfig.ts`). Nessun riferimento residuo alla vecchia chiave `x-launcher-avatar` in `localStorage`.

## v1.1.86-dev.1 — correzione stringa versione, convenzione `-dev.N` chiarita

Segnalato dall'utente: la versione mostrata nel menu X-Launcher era rimasta `v1.1.86` nudo — corretto in `v1.1.86-dev.1`, a chiarire che questa è una build di sviluppo, non una milestone stabile. La milestone stabile di riferimento resta `v1.1.79-Gaia` finché non ne verrà congelata una nuova con lo stesso rituale (nome di pianeta/satellite, pacchetto completo ricreato).

**Convenzione chiarita per il resto della sessione**: fra una milestone stabile e l'altra, le build di sviluppo intermedie portano un suffisso `-dev.N` (incrementale) sul numero di patch in corso, distinguendole chiaramente sia dalle milestone nominate sia dalle vecchie candidate `-rc.N`.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.87-dev.1 — trovata la vera causa della versione stantia

Segnalato dall'utente e diagnosticato insieme in più passaggi: la versione mostrata nel menu restava `1.1.65-rc.3` nonostante demone verificato fresco (PID/orario di avvio confermati successivi alla ricompilazione) e build verificata contenere la stringa corretta (`grep` diretto sul bundle compilato, confermato `1.1.86-dev.` presente).

**Causa reale**: un secondo `useEffect` in `App.tsx`, indipendente dal letterale `useState('v1.1.XX')` aggiornato ad ogni versione di questa sessione, faceva un fetch a `GET /api/version` (che legge `metadata.json` dal disco) e **sovrascriveva silenziosamente** `appVersion` con quel valore. `metadata.json` viene aggiornato solo ai congelamenti di milestone completi (RC3, poi Gaia) — mai nei fix quotidiani — quindi in qualunque cartella di sviluppo non risincronizzata con l'ultimo zip di milestone (esattamente il caso dell'utente: il pacchetto Gaia è tenuto a parte, mai fuso nella cartella di sviluppo), quel file restava fermo al valore della primissima build. Ogni aggiornamento di `appVersion` fatto in questa sessione veniva quindi scartato al caricamento della pagina, sostituito da quel valore stantio — **il codice era sempre stato corretto**, il problema era tutto in questo secondo effect che vinceva sempre la corsa.

Fix: effect rimosso. Il letterale in cima al componente resta ora l'unica fonte di verità per la versione mostrata. L'endpoint `GET /api/version`/`metadata.json` restano nel progetto per uso futuro (diagnostica esterna, script), non più per sovrascrivere questo valore.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.88-dev.1 — dimensione prevista di installazione (GOG + Epic)

Prima delle tre richieste della sessione (tempo di gioco, dimensione su disco, tab hardware) — chiarito dall'utente durante la discussione: la dimensione richiesta è quella **prevista prima di installare**, non quella reale occupata dopo. Scope deciso esplicitamente dall'utente: solo GOG ed Epic per ora (Steam non ha una fonte già cablata per il "non ancora installato" — `SizeOnDisk` esiste solo per manifest locali, cioè giochi già installati; Classic Console non si applica, le ROM sono già file completi).

**GOG**: `lgogdownloader --list details,json --game <slug>`, on-demand per il solo gioco selezionato — deliberatamente diverso dal `--list details/json` per l'intero catalogo, già scartato in una sessione precedente (commento esistente in `gogPlugin.ts`: 128 chiamate API sequenziali per l'intero catalogo sono impraticabili; per un solo gioco alla volta non è lo stesso problema).

**Epic**: `legendary info <app_name> --json`, comando documentato apposta per questo scopo ("Prints info about specified app name or manifest").

**Nota onesta, non aggirabile in questo ambiente**: né `lgogdownloader` né `legendary` sono disponibili qui (servirebbero account reali) — il nome esatto del campo JSON con la dimensione non è verificato dal vivo per nessuno dei due comandi. Per questo entrambe le implementazioni loggano sempre l'output JSON grezzo per intero al primo utilizzo, e provano più nomi di campo plausibili in cascata — se il campo giusto non c'è fra quelli provati, il log mostra comunque la struttura reale per poter adattare il parsing, invece di fallire in silenzio (stessa lezione di `--appendconfig=` con RetroArch in questa sessione).

Nuovo metodo `gameManager.getPredictedInstallSize(gameId)` che smista al plugin giusto in base a `game.store`; nuovo endpoint `GET /api/games/:id/predicted-size`; nuovo blocco nella sidebar (icona `HardDrive`), visibile solo per giochi GOG/Epic, fetch on-demand quando il gioco viene selezionato — non per l'intera libreria in una volta.

Due refusi di sintassi trovati e corretti durante la stesura: la chiusura del metodo `login()` di `GOGPlugin` si era rotta durante un inserimento (il nuovo metodo è finito nidificato dentro quello vecchio, mai chiuso); il nuovo `useEffect` nel frontend era stato inserito prima della dichiarazione di `selectedGame` di cui ha bisogno (stessa categoria di errore, TS2448, già documentata altrove in questo stesso file per un bug simile risolto in una sessione precedente).

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo (verificato specificamente riga per riga sul codice aggiunto). JSON delle traduzioni validati.

## v1.1.89-dev.1 — tempo di gioco reale (GOG, Epic, Classic Console)

Seconda delle tre richieste della sessione. `playTimeHours: 0` era letteralmente hardcoded in `classicPlugin.ts`, `epicPlugin.ts` e `gogPlugin.ts` — solo Steam calcola un valore reale, dalla propria Web API.

Il meccanismo per tracciarlo da soli era già quasi pronto: `gameManager.ts` calcola già `elapsedMs` (durata della sessione) alla chiusura di ogni gioco, usato finora solo per un controllo interno ("uscita troppo rapida = probabile fallimento di avvio"). Mancava solo accumulare quel valore invece di scartarlo.

Nuova funzione `db.addPlayTime(id, hours)` — `UPDATE` atomica (`play_time_hours = play_time_hours + ?`), non lettura-poi-scrittura, per evitare una corsa se due sessioni si chiudessero in rapida successione. Chiamata subito **dopo** il controllo "uscita rapida" esistente (una sessione troppo breve resta un probabile crash, non tempo di gioco reale) — applicata uniformemente a **qualunque store, Steam incluso**: la sua Web API resta comunque l'autorità finale a ogni sync di libreria (che sovrascrive `play_time_hours` per Steam), quindi l'accumulo locale viene semplicemente rimpiazzato al sync successivo per quei giochi — nessun rischio di doppio conteggio, persiste solo dove serve davvero (GOG/Epic/Classic Console, che non hanno alcuna fonte alternativa).

Aggiunta anche una notifica esplicita alla UI subito dopo l'accumulo, così la sidebar mostra il tempo aggiornato non appena il gioco si chiude, senza aspettare il prossimo sync periodico (5 minuti).

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.90-dev.1 — tre fix segnalati dall'utente con log alla mano

**1) GOG restituiva sempre vuoto.** Confermato dal log: `--list details,json --game <slug>` produceva stdout completamente vuoto. Causa quasi certa: `--list` accetta un solo valore dall'elenco (games/details/json/tags/ecc.), non una combinazione separata da virgola come assunto senza verifica in v1.1.88. Sostituito con `--list details --game <slug>` — la sintassi confermata funzionante da un esempio reale trovato con una ricerca in precedenza — e il parsing cambiato da JSON a testuale (righe con una dimensione, sommate se il gioco ha più file installer). Epic (`legendary info --json`) funziona già correttamente, nessuna modifica lì.

**2) Il tempo di gioco non era persistente.** Causa: `play_time_hours = excluded.play_time_hours` nell'`UPSERT` sovrascriveva incondizionatamente ad ogni sync di libreria — e GOG/Epic/Classic Console riportano sempre `0` (hardcoded), quindi la sync periodica (ogni 5 minuti) cancellava l'accumulo appena fatto. Corretto con `CASE WHEN excluded.play_time_hours > 0 THEN excluded.play_time_hours ELSE games.play_time_hours END`: un valore reale non è mai esattamente 0, quindi questa singola condizione distingue correttamente "sync con un placeholder" da "Steam con un valore reale", senza dover sapere da quale store viene la sync. Verificato con un test isolato `better-sqlite3` (sync iniziale → sessione di gioco → sync successiva → nuova sessione, più il caso Steam che deve sempre vincere) prima di considerarlo risolto.

**3) Dimensione prevista e tempo di gioco resi persistenti, su richiesta esplicita dell'utente** (evitare il refetch ad ogni selezione, ed evitare che una nuova installazione azzeri le ore già accumulate — "100h + nuovo tempo giocato", non un nuovo conteggio da zero). Il tempo di gioco era già persistente per costruzione (`addPlayTime` accumula nel DB, indipendente da installazioni/disinstallazioni — il fix del punto 2 sopra ne garantisce ora anche la sopravvivenza alle sync). Per la dimensione prevista: nuova colonna `predicted_size_bytes`, scritta una volta dopo il primo recupero riuscito (`db.setPredictedSizeBytes`) — `gameManager.getPredictedInstallSize()` ora controlla prima la cache e ritorna subito quella se presente, richiamando il plugin (lgogdownloader/legendary) solo al primo utilizzo per ciascun gioco. Nessuna modifica necessaria al frontend: continua a chiamare lo stesso endpoint, che ora risponde dalla cache invece di rilanciare il comando ogni volta.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. Fix della persistenza tempo di gioco verificato con un test isolato `better-sqlite3` (non solo lettura del codice).

## v1.1.91-dev.1 — GOG: trovato il vero formato, con l'output reale fornito dall'utente

Il fix v1.1.90 (sintassi `--list details --game <slug>`) era corretto, ma il parsing testuale ipotizzato ("Size: 1.23 GB") non lo era: l'utente ha fornito l'output reale del comando, che mostra `size: 1048576` — un numero di byte grezzo, **senza alcuna unità**. Il vecchio pattern richiedeva un suffisso GB/MB/KB/B e quindi non trovava mai corrispondenze.

Corretto sommando solo i valori `size:` dentro la sezione `installers:` (esclude `extras:` — contenuti bonus come avatar/wallpaper, non necessari per installare — ed esclude `patches:` — aggiornamenti da una versione precedente, irrilevanti per un'installazione nuova). Nota: `installers:` può elencare file per più piattaforme insieme (nell'esempio reale: `.exe`/`.bin` per Windows e `.sh` per Linux) — sommarli tutti sovrastima leggermente quando sono presenti entrambe le piattaforme, accettato come approssimazione ragionevole in assenza di un modo semplice per sapere quale verrà scaricata prima del download vero e proprio.

**Verificato con un test isolato usando il testo esatto fornito dall'utente** (non solo lettura del codice): il parsing trova correttamente le 3 dimensioni della sezione `installers:` di Aragami (1.048.576 + 3.480.223.744 + 3.097.493.504 byte = 6,13 GB), escludendo correttamente le sezioni `extras:`/`patches:` successive.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. Parsing verificato con un test isolato Node usando il testo reale fornito dall'utente (non un testo sintetico).

## v1.1.92-dev.1 — tab Info Hardware in Gestisci Account

Terza e ultima delle tre richieste della sessione. Verificato con una ricerca reale prima di scrivere codice: tutti i valori richiesti (Motherboard, CPU, GPU, RAM, HDD, OS) sono leggibili **senza permessi elevati** — a differenza di `dmidecode` (che richiede root per leggere le info DMI dalla BIOS), il kernel Linux espone già le stesse informazioni base via sysfs in `/sys/class/dmi/id/` (`board_vendor`/`board_name`, leggibili da qualunque utente — solo il numero di serie lì dentro richiede root, non necessario qui).

Nuovo modulo `src/backend/systemInfo.ts`:
- **Motherboard**: `/sys/class/dmi/id/board_vendor` + `board_name`
- **CPU/RAM**: API Node native (`os.cpus()`/`os.totalmem()`) — nessun comando di sistema, nessun problema di permessi possibile
- **GPU**: `nvidia-smi` se disponibile (informazione più ricca per il caso comune di questo progetto, HTPC gaming con GPU NVIDIA), fallback su `lspci` altrimenti
- **Disco**: `df -h /` — solo il filesystem radice, un riassunto a una riga
- **OS**: `/etc/os-release` (`PRETTY_NAME`) + `uname -r` per il kernel

Cache in memoria lato server (l'hardware non cambia durante l'esecuzione del demone) — un solo calcolo per l'intera sessione, non ricalcolato ad ogni apertura della tab. Nuovo endpoint `GET /api/system-info`.

Frontend: nuova tab "Info Hardware" nell'overlay Impostazioni, **sempre in ultima posizione** come richiesto esplicitamente — vive come ultimo elemento fisico del blocco tab-bar, con un commento che segnala di inserire eventuali nuove tab future PRIMA di questa, mai dopo. Il ciclo L1/R1 fra le tab (`cycleSettingsTab`) usa già un meccanismo generico basato sui Focusable effettivamente registrati, non un elenco fisso — la nuova tab vi entra automaticamente, nessuna modifica necessaria lì oltre ad allargare un tipo.

Due errori di compilazione reali trovati e corretti durante la stesura: un'icona (`Monitor`) importata due volte per errore; il tipo del parametro di `getFirstFocusableForSettingsTab` non includeva ancora `'hardware'`.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo (verificato specificamente: zero errori in `systemInfo.ts`). JSON delle traduzioni validati.

## v1.1.93-dev.1 — robustezza endpoint, pulizia e documentazione

**Robustezza**: l'utente ha segnalato un crash (`TypeError: gameManager.getPredictedInstallSize is not a function`), risultato essere causato dall'aver avviato per errore la cartella della milestone stabile (Gaia, senza le patch introdotte successivamente) contro lo stesso database condiviso (`~/.local/share/x-launcher/x-launcher.db`, legato alla home utente e non alla cartella del codice sorgente) — non un bug del codice attuale. Aggiunto comunque `try/catch` alle route `GET /api/games/:id/predicted-size` e `GET /api/system-info`, prive di qualunque protezione: un errore async non catturato in Express 4.x può destabilizzare l'intero processo invece di restituire un errore contenuto alla sola richiesta che l'ha causato, a prescindere dalla causa specifica di questo episodio.

Effetto collaterale confermato dall'utente: la versione Stable (precedente a v1.1.90) non ha la protezione `CASE WHEN` sul tempo di gioco — avviarla contro lo stesso database ha azzerato l'accumulo per un gioco. Discusso con l'utente se separare i database delle due cartelle: **deciso di mantenerlo condiviso**, prestando più attenzione a quale cartella si avvia.

**Pulizia**: rimossa la cartella `patches/` (script di patch incrementali da Step 2/3/4/12g, non più in uso da tempo).

**Documentazione**: `INSTALL.md` riscritto per intero — dipendenze complete prima di compilare (per compilare, per la tray, per la gestione finestre multi-DE, per browser, per store — GOG/Epic/Steam/Classic Console/Wine-Proton, tutte con pacchetto/comando specifico), compilazione, uso locale, installazione di sistema via `install.sh` (spiegato nel dettaglio cosa fa), variabili `.env`, log, dati persistiti. Rimosso ogni riferimento alla vecchia cartella `patches/`. `X-Launcher-Roadmap.md`: nuova sezione con le regole di sviluppo consolidate in questa sessione (bilingue di default, versionamento milestone/dev.N, consegna file, verificare prima di assumere, diagnosticare prima di ritentare, test isolati quando fattibile).

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.94-dev.1 — RetroArch: stdout/stderr mai catturati

Segnalato dall'utente con un caso reale (PSX): un gioco configurato correttamente (core giusto, BIOS al posto giusto, `.cue` funzionante se lanciato dal client ufficiale di RetroArch) falliva silenziosamente dalla Dashboard — "chiude immediatamente senza alcun log nel terminale".

**Causa trovata**: `RetroArchRunner.launch()` chiamava `spawnDetached(binExe, args)` senza il parametro `logPath` — che di default fa scartare stdout/stderr (`stdio: 'ignore'`). Non era che RetroArch non stampasse nulla: X-Launcher buttava via l'output prima ancora che l'utente potesse vederlo. Wine/Proton ed Epic (legendary) passano già `logPath` correttamente — RetroArch era rimasto scoperto insieme a ScummVM/DOSBox.

**Fix**: aggiunto `logPath` (via `gameLaunchLogPath(game.id)`, stessa funzione già condivisa dagli altri runner) alla chiamata `spawnDetached` di RetroArch. Il meccanismo di visualizzazione era già completamente cablato altrove — nessun'altra modifica necessaria: `gameManager.ts` legge già il file indicato da `logPath` quando un gioco si chiude entro la soglia "uscita rapida" (esattamente lo scenario descritto — "chiude immediatamente"), e ne mostra il contenuto nella notifica di errore mostrata all'utente. D'ora in poi, un errore reale di RetroArch (BIOS non trovato, core sbagliato, `.cue` non valido, ecc.) comparirà per intero nella notifica invece del messaggio generico attuale.

**ScummVM e DOSBox restano scoperti allo stesso modo** — non toccati in questa voce, stesso tipo di fix applicabile se emergesse lo stesso sintomo per quei runner.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.95-dev.1 — estrazione automatica ROM PSX (immagini CD)

L'utente ha diagnosticato da solo la causa reale, usando il fix v1.1.94 (log RetroArch finalmente visibile): passando lo ZIP di un gioco PSX a RetroArch il lancio fallisce, ma estraendolo a mano e puntando al file `.cue` funziona con lo stesso identico core. Causa: a differenza dei sistemi a cartuccia (SNES/Genesis/MAME — un solo file per ROM, RetroArch legge comodamente dentro lo zip), un dump PSX è un'immagine CD (`.cue` + uno o più `.bin`) — più file con riferimenti relativi fra loro, che il meccanismo generico "leggi dentro lo zip" di RetroArch non gestisce allo stesso modo.

**Fix**: `classicPlugin.ts` ora estrae automaticamente lo zip di un gioco PSX (una sola volta, cache su disco tramite verifica di un `.cue` già presente nella sottocartella `.extracted/<nome>/`) e punta `executablePath` al `.cue` reale invece del pacchetto compresso — lo stesso identico percorso che l'utente ha verificato funzionare a mano. Estendibile in futuro ad altri sistemi CD (Saturn, Dreamcast, PC Engine CD) tramite `CD_BASED_SYSTEMS`, un semplice `Set` di sistemi canonici. Nessuna nuova dipendenza npm: estrazione via `unzip` di sistema (già quasi certamente presente, o installabile con `sudo pacman -S unzip`), stesso pattern già in uso per gli altri strumenti esterni del progetto.

**Verificato con un test reale** (uno zip vero contenente un `.cue`+`.bin` fittizi, non solo lettura del codice): prima chiamata estrae correttamente, seconda chiamata riusa la cache senza ri-estrarre, un sistema non-CD (SNES) lascia il file invariato.

Risposte alle due domande dell'utente, entrambe fuori dal perimetro di un fix di codice: il core di default è assegnato da una mappa statica in `classicPlugin.ts` senza verificare se è davvero installato (un suggerimento ragionevole, non una verifica); l'Online Updater di RetroArch che mostra un core ma non lo installa è un problema di RetroArch stesso (rete/permessi), non di X-Launcher — suggerita l'installazione diretta via pacchetto di sistema (`libretro-pcsx-rearmed`) come alternativa pratica.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. Estrazione verificata con un test isolato usando un vero file zip (non solo lettura del codice).

## v1.1.96-dev.1 — PSX: default core cambiato da pcsx_rearmed a mednafen_psx

Il suggerimento `libretro-pcsx-rearmed` di v1.1.95 non era installabile (né da AUR né, come poi verificato, da `pacman` dopo un aggiornamento) — una ricerca più approfondita mostra che il pacchetto **corrente** per quel nome è specifico di Arch Linux ARM (aarch64/armv7h), non x86_64: coerente col fatto che PCSX ReARMed è ottimizzato apposta per ARM. Non è quindi affidabilmente installabile su un desktop x86_64 come quello dell'utente.

**Fix**: cambiato il core di default assegnato ai giochi PSX in `classicPlugin.ts`, da `pcsx_rearmed_libretro.so` a `mednafen_psx_libretro.so` — il core che l'utente ha già confermato funzionante sul proprio sistema con lo stesso gioco. Pacchetto Arch corrispondente verificato con una ricerca reale come attuale su `extra/x86_64`: `libretro-beetle-psx` ("Beetle PSX" è il nome con cui il progetto Libretro chiama il core Mednafen PSX). Riordinato anche l'elenco dei core alternativi mostrato nell'overlay (`COMPATIBLE_CORES_BY_SYSTEM`), con `mednafen_psx` per primo invece di `pcsx_rearmed`.

Il cambiamento riguarda **solo i nuovi giochi PSX** scoperti da qui in avanti: `libretro_core` è già protetto da sovrascrittura nelle sync regolari (stessa categoria di `executable_path`/`scrape_title`) — la scelta manuale già fatta dall'utente per il gioco in questione resta intatta.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.97-dev.1 — "Auto-Remaster" per PSX

Implementata dopo una sessione di test manuale insieme all'utente, verificando ogni passaggio da terminale prima di scrivere codice — incluso un vicolo cieco reale: `--appendconfig=` risulta letto da RetroArch (a differenza degli shader, dove veniva ignorato del tutto), ma le opzioni applicate così vengono silenziosamente sovrascritte dal file di config persistente del core (`Beetle PSX HW.opt`, riscritto ad ogni chiusura con i valori effettivamente in uso). Il meccanismo che funziona davvero è l'override **per-contenuto** nativo di RetroArch — un file con lo stesso nome del contenuto caricato, senza estensione, nella cartella di configurazione del core, con priorità più alta del file globale.

**Preset confermato su hardware reale**, incluso un secondo giro per un difetto trovato durante il test (testo "posterizzato"): renderer Vulkan, risoluzione interna 2x, filtro bilineare escluso dagli sprite (mantiene il testo nitido), colore a 32bpp con dithering disabilitato (elimina il banding, più visibile a risoluzione più alta — comportamento noto, documentato dalla stessa documentazione ufficiale del core), MSAA 2x, PGXP in modalità memoria (elimina il tremolio dei poligoni, raccomandato dalla documentazione per la miglior compatibilità).

**Implementazione**: il core stesso è l'interruttore — nessun campo DB dedicato. `classicPlugin.ts` espone `writePsxRemasterOptions()` (scrive il file di override per-contenuto, una sola volta, non sovrascrive se l'utente ha già personalizzato le opzioni per quel gioco specifico da RetroArch) e le costanti `PSX_REMASTER_CORE`/`PSX_DEFAULT_CORE`. Nuovo metodo `gameManager.setPsxRemaster()`: attivare scrive il preset e imposta il core hardware-accelerato; disattivare si limita a tornare al core software di default — che semplicemente non legge quel file di override (vive nella cartella di config di un core diverso), senza bisogno di rimuoverlo. Nuovo endpoint `POST /api/games/:id/psx-remaster`. Nuovo interruttore nell'overlay Game Config, visibile solo per giochi `system === 'psx'`, subito dopo il campo Libretro Core Path manuale.

Verificato con un test isolato (non solo lettura del codice) che il file di override venga scritto nel percorso e formato esatti confermati dall'utente.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo (un'icona duplicata trovata e corretta durante la stesura). JSON delle traduzioni validati. Scrittura del file di override verificata con un test isolato Node.

## v1.1.98-dev.1 — Auto-Remaster: architettura generalizzata

Richiesto dall'utente prima di riprendere la roadmap: generalizzare l'infrastruttura costruita per PSX, così aggiungere un futuro sistema (N64/Saturn/Dreamcast/PS2, discussi e rimandati) significhi aggiungere una voce a un registro, non ripetere l'intero lavoro da capo.

**`classicPlugin.ts`**: `PSX_REMASTER_CORE`/`PSX_DEFAULT_CORE`/`writePsxRemasterOptions()` sostituiti da un registro `REMASTER_PRESETS: Record<string, RemasterPreset>` (core remaster, core di default, nome esatto della cartella di config di RetroArch, righe di opzione) con una sola voce per ora (`psx`), più `hasRemasterPreset()` e `writeRemasterOptions()` generici che vi si appoggiano.

**`gameManager.ts`**: `setPsxRemaster()` → `setRemasterEnabled()`, cerca il preset in base a `game.system` invece di assumere PSX; ora restituisce anche il nuovo valore del core (`newCore`), così il frontend non deve duplicare i nomi esatti dei core.

**`server.ts`**: endpoint `POST /api/games/:id/psx-remaster` → `POST /api/games/:id/remaster`.

**Frontend**: nuova mappa a livello di modulo `REMASTER_HINT_BY_SYSTEM` (una sottostringa per capire se il remaster è già attivo, prima ancora di premere il pulsante — da tenere in sync con `REMASTER_PRESETS`), interruttore generalizzato per qualunque sistema presente in quella mappa, etichetta dinamica ("Auto-Remaster (PSX)", interpolata da `selectedGame.system`, pronta a mostrare "Auto-Remaster (N64)" ecc. senza una nuova chiave di traduzione per ogni sistema).

Verificato con un test isolato (non solo lettura del codice) che il registro distingua correttamente un sistema con preset (`psx`) da uno senza (`saturn`, non ancora aggiunto) e scriva il file nel formato corretto.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. Nessun riferimento residuo al vecchio codice PSX-specifico. JSON delle traduzioni validati.

## v1.1.99-dev.1 — colore viola per l'interruttore auto-remaster attivo

Richiesto dall'utente: `bg-purple-600` (abbinato all'icona `Sparkles`) è già il linguaggio visivo consolidato per "opzione intelligente" nella tab AI Advisor (badge dei suggerimenti AI, righe attive dei provider). Il pulsante auto-remaster usava `bg-blue-600` quando attivo, lo stesso blu generico di ogni altro elemento selezionato dell'interfaccia — cambiato in `bg-purple-600` per coerenza. Il bordo di focus (navigazione controller) resta blu, invariato: è l'indicatore universale di navigazione dell'app, non specifico del tema AI.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.100-dev.1 — fix: nessuna selezione visibile sul pulsante auto-remaster attivo

Segnalato dall'utente: quando l'auto-remaster è attivo (sfondo viola pieno) e si naviga fino al pulsante col controller per disattivarlo, non compare alcun indicatore di selezione. Causa: la logica del bordo assegnava una stringa vuota (`""`) ogni volta che `isEnabled` era vero, indipendentemente dal focus — il ramo `isFocused` veniva controllato solo nel caso `!isEnabled`.

Fix: quando attivo e con il focus, il pulsante mostra ora un bordo viola più chiaro (`border-purple-300`) invece di un bordo blu che stonerebbe su uno sfondo già viola pieno — il bordo blu standard resta per lo stato "non attivo", invariato.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo.

## v1.1.108-dev.1 — AI Advisor: un solo provider attivo alla volta, budget token reale e per-provider

Richiesta esplicita dell'utente, ragionata insieme prima di implementare: è improbabile che servano più AI Advisor attivi insieme — ognuno userà il provider che ha pagato o Ollama in locale. Due vincoli nuovi, entrambi confermati esplicitamente prima di scrivere il codice.

**1. Un solo provider attivo alla volta.** Prima `getActiveProviders()` non aveva nessun vincolo di esclusività — più provider potevano tecnicamente essere `enabled` insieme, con fallback silenzioso tra loro. Ora attivare un provider (cloud o Ollama) disattiva automaticamente tutti gli altri, compreso quello attivo in precedenza — stesso comportamento dei runner. Applicato in un punto solo, `db.upsertAiProviderCredential()`: quando `enabled` è vero, disattiva prima tutti gli altri provider nella stessa tabella — vale per qualunque chiamante (route cloud, route Ollama), non serve replicarlo altrove.

**2. Budget non più aggregato, ma per-provider, con blocco REALE.** Prima `aiMonthlyTokenBudget` era un unico numero globale in `appConfig.ts`, mai davvero applicato: verificato nel codice che `orchestrator.ts` non controllava mai il budget prima di chiamare un provider, era solo un contatore mostrato. Inoltre Ollama (locale, gratuito) veniva sommato allo stesso totale dei provider cloud a pagamento, gonfiando il numero senza motivo.

Ora: 
- Ogni provider cloud ha il proprio `token_budget` in `ai_provider_credentials` (nuove colonne `token_budget`/`budget_warned_month`, migrazione automatica sui DB esistenti). Default **5.000.000** alla prima configurazione.
- **Blocco reale**: a budget esaurito, `orchestrator.ts` non instrada più alcuna richiesta a quel provider — niente rete, niente consumo — finché l'utente non alza manualmente il budget (segnale implicito di "ho pagato per continuare", nessun flag separato: il numero stesso è la prova).
- **Avviso all'80%**: una notifica di sistema parte automaticamente al raggiungimento dell'80% del budget di un provider, una sola volta al mese per provider (`budget_warned_month` evita ripetizioni).
- **Ollama e provider locali → nessun budget**, riconosciuti genericamente via `requiresApiKey === false` (non hardcoded su `'ollama'`, cosi vale anche per un futuro provider locale diverso) — mostrato come **∞** in interfaccia, mai bloccato.
- Rimossi `aiMonthlyTokenBudget` da `appConfig.ts` e le vecchie route aggregate `GET /api/ai/usage`/`POST /api/ai/usage/budget` — tutto ora dentro `GET /api/ai/providers` (tokenBudget + usageThisMonth per riga, una sola chiamata).
- `App.tsx`: il vecchio widget "Budget mensile" aggregato è sparito; ogni card provider cloud ha ora il proprio campo budget editabile + contatore "usati X di Y" (rosso a esaurimento, arancio oltre l'80%); la sezione Ollama mostra "usati X di ∞", puramente informativo.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

### Nota per chi applica questo pacchetto

Questa sessione ha subito un reset dell'ambiente di lavoro a metà: il CHANGELOG di partenza qui è tornato a v1.1.100-dev.1, quindi questa voce salta direttamente da lì a v1.1.108-dev.1 — le voci intermedie (v1.1.101 → v1.1.107, già consegnate come file separati nei turni precedenti di questa stessa conversazione) restano valide ma non compaiono qui: vanno unite a mano se si vuole un unico CHANGELOG.md continuo.

## v1.1.108-dev.2 — ricostruzione completa dopo il reset del sandbox + fix mutua esclusività Ollama

Il reset dell'ambiente di lavoro segnalato in v1.1.108-dev.1 aveva lasciato diversi file (in particolare `db.ts`) regrediti a prima di fix già consegnati nella stessa conversazione — scoperto dall'utente con un warning reale di build: `Import "deleteGamesById" will always be undefined because there is no matching export in "src/backend/db.ts"`. Causa confermata: quel `db.ts` era tornato indietro a prima di v1.1.106-dev.2 (che l'aveva introdotta) e di v1.1.102-dev.1 (consolidamento `DATA_DIR`).

**Fix aggiuntivo segnalato dall'utente nello stesso giro**: i provider cloud si disattivavano correttamente a vicenda e disattivavano Ollama quando selezionati, ma selezionare/attivare un modello Ollama non escludeva più i provider cloud già attivi. Causa reale: il backend (`db.upsertAiProviderCredential`) applicava già correttamente la mutua esclusività per qualunque provider, Ollama incluso — mancava solo il refresh lato client: l'handler di selezione modello Ollama non richiamava `refreshOllamaModels()` dopo il salvataggio (a differenza di `saveCloudProvider`, che lo fa sempre), quindi le pillole dei provider cloud restavano visivamente "attive" nella sessione anche se il DB le aveva già spente.

**Ricostruiti in questo giro** (tutti riverificati con `tsc --noEmit` contro lo zip originale, stessi 23 errori pre-esistenti, zero nuovi): `paths.ts` e `archiveExtractors.ts` (ricreati da zero), `db.ts` (DATA_DIR consolidato, `deleteGamesById`, mangohud a 3 stati), `appConfig.ts`/`logger.ts`/`knowledgeBase.ts`/`notificationEngine.ts`/`server.ts` (DATA_DIR/ENV_PATH da `paths.ts`), `runners/implementations.ts` (fix cwd Proton + MangoHud completo su entrambi i runner), `runners/base.ts` e `types.ts` (mangohud 3 stati, SystemTools con unzip/p7zip/unrar), `classicPlugin.ts` (estrazione manuale sempre-prima + supporto `.7z`), `gogPlugin.ts` (filtro voci spazzatura + pulizia mirata), `gameManager.ts` (passthrough mangohud + pulizia GOG), `compatibilityManager.ts` e `downloadManager.ts` (fix mangohud), `App.tsx` (cursore MangoHud a 3 posizioni con i18n, griglia System tools, i due pulsanti Aggiorna, fix mutua esclusività Ollama), file di traduzione `gameOptions` (IT/EN), `kiosk-launch.sh`/`xdash.service`/`package.json`/`install.sh`/`INSTALL.md`/`scripts/with-env.sh` (trasloco `.env`).

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi — verificato incrementalmente ad ogni blocco di file ricostruito, non solo alla fine.

## v1.1.109-dev.1 — vista compatta/estesa per il widget Dipendenze Wine

Richiesta utente: il widget "Dipendenze Wine" mostrava sempre tutti i 15 verb (4 consigliati + 11 opzionali), allungando la navigazione fino in fondo all'overlay anche quando l'utente non deve toccare nulla oltre ai default. Proposta: vista compatta di default (solo i 4 verb consigliati), estesa a richiesta (tutti e 15), con uno switch accanto al titolo — stesso stile pill già usato altrove nella dashboard (es. griglia Compatibility Layer) — invece di un on/off nuovo di zecca.

**Implementato**: l'intestazione del widget ha ora uno switch navigabile col controller (`wine-deps-expand-toggle`) che alterna `wineDepsExpanded` — spento (default) mostra solo `DEFAULT_WINE_VERBS`, acceso aggiunge `OPTIONAL_WINE_VERBS`. Stato puramente di visualizzazione (non salvato per-gioco, non tocca il DB): riparte sempre da compatta ad ogni apertura/cambio gioco, coerente con l'idea che sia una scorciatoia di navigazione e non una preferenza di configurazione. La lista dei verb effettivamente togglabili (checkbox coi propri Focusable) resta identica in entrambe le viste — cambia solo quanti se ne vedono, l'ultimo elemento visibile si aggancia sempre correttamente alla riga successiva dell'overlay (Custom Env Variables), qualunque sia la vista attiva.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi. Nuove chiavi di traduzione (`wineDepsCompact`/`wineDepsExpanded`) aggiunte a entrambe le lingue fin da subito, come da regola di progetto.

## v1.1.109-dev.2 — fix navigazione switch Dipendenze Wine

Segnalazione utente: lo switch compatta/estesa introdotto in v1.1.109-dev.1 era raggiungibile SOLO premendo la leva a destra — scorrendo la selezione dall'alto verso il basso o viceversa, veniva scavalcato del tutto.

**Causa reale**: due punti di scoring geometrico che saltavano lo switch senza un vicino esplicito.
1. `field-steamAppId` (il campo "xlaunch:// App ID", sempre presente per store non-Steam — quindi anche GOG/Epic, unico caso in cui il widget Winetricks esiste) non aveva alcun vicino esplicito verso il basso: scendendo dall'alto, lo scoring atterrava direttamente sulla prima checkbox, scavalcando lo switch.
2. Lo switch stesso non aveva alcun vicino esplicito: risalendo dalla lista verb, lo scoring non lo trovava mai.

**Fix**: collegamento esplicito a tre punti — `field-steamAppId` → switch (down) → prima checkbox (`verb-${DEFAULT_WINE_VERBS[0]}`, sempre lo stesso id sia in vista compatta sia estesa) → switch (up dalla prima checkbox). Ora raggiungibile scorrendo su/giù come qualunque altro elemento dell'overlay, non solo con la leva destra.

Verificate anche le due domande poste dall'utente nello stesso giro (nessun fix necessario, solo chiarimento — vedi conversazione): `DEFAULT_WINE_VERBS` non è stato alterato; le differenze osservate tra card di giochi non ancora installati sono spiegate dal meccanismo "Usa Known Fixes (Heroic)" in `downloadManager.ts`, che quando trova un fix noto SOSTITUISCE (non unisce) l'intero array `winetricksVerbs` e lo scrive in modo permanente nel DB molto presto nel flusso d'installazione — anche se l'installazione fallisce o viene annullata dopo, indipendentemente dallo stato attuale del toggle. I verb richiesti da un fix Heroic ma non visibili in vista compatta vengono comunque installati (la vista è solo un filtro di visualizzazione, l'installazione legge l'array completo persistito) e appaiono correttamente spuntati passando alla vista estesa. Nessuna modifica al comportamento di sostituzione richiesta esplicitamente dall'utente ("lasciamo la questione dei verb così com'è").

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.110-dev.1 — Amazon Games: prima implementazione reale via nile (Step 19c)

Sostituito lo stub esistente (`amazonPlugin.ts`, `getLibrary()` sempre `[]`) con una prima implementazione vera, verificata passo per passo con output reale fornito dall'utente (stesso approccio già usato per GOG — mai indovinare un formato non verificato):

- **`nile library --help` / `install --help` / `launch --help`** reali → confermato `--json` su `library list` e `--installed` per il filtro solo-installati, `--info --json` su `install` per la dimensione prevista.
- **`nile auth --login`** reale eseguito dall'utente → confermato il flusso di login (URL browser + incolla redirect), libreria sincronizzata con successo.
- **`nile library list --json`** reale (un titolo completo) → confermata la struttura: `product.id` (`amzn1.adg.product.<uuid>`) è l'identificativo giusto per install/launch/uninstall — verificato per esclusione anche `product.sku` (`amzn1.resource.<uuid>`), NON è quello corretto. Nessun campo "boxart" verticale dedicato come GOG/Epic: usata `productDetail.iconUrl` (quadrata) per la cover, `productDetail.details.backgroundUrl1` (landscape) per l'anteprima.
- **`nile install <id> --info --json`** reale → risposta esatta `{"download_size": N}`, agganciato a `getPredictedInstallSizeBytes()` per la stessa funzione "Dimensione Prevista" già in sidebar per GOG/Epic — qui verificato dal vivo, a differenza della stessa funzione in `epicPlugin.ts` che ha un'onesta nota "non testato dal vivo".

**Ancora da fare, esplicitamente non indovinato**: `isAuthenticated()`/`login()`/`logout()` restano il comportamento di default ereditato da `StorePlugin` (non un'implementazione reale) — serve `nile auth --help` per sapere il comando esatto di stato/logout, sullo stesso modello di `legendary status --json`/`legendary auth --delete` in `epicPlugin.ts`. L'orchestrazione reale del download/installazione (`runAmazon` in `downloadManager.ts`, sul modello di `runEpic`/`runGog` — progresso, prefix Wine, winetricks, ricerca eseguibile finale) non è ancora scritta: `installGame`/`uninstallGame` restano stub che rimandano al comando giusto, stesso pattern transitorio già usato storicamente da `epicPlugin.ts` prima che `downloadManager.ts` venisse esteso.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.110-dev.2 — Amazon Games: login/logout reali

Verificato `nile auth --help` reale: `--login` (flusso interattivo, già visto dal vivo dall'utente nel turno precedente), `--status`, `--logout` ("Logout from the accout and deregister" — nessuna ambiguità di formato).

**Implementato**: `login()` sul modello già collaudato di `epicPlugin.ts` — il backend non ha un terminale interattivo reale a cui collegarsi, quindi istruisce l'utente sul comando esatto (`nile auth --login`) invece di tentare di automatizzare un flusso che richiede incollare un URL a mano; la card si aggiorna da sola al termine via polling su `isAuthenticated()`. `logout()` via `nile auth --logout`, diretto (nessun JSON da interpretare).

**Ancora non indovinato**: `isAuthenticated()` resta il comportamento di default ereditato da `StorePlugin` — serve l'output reale di `nile auth --status` per sapere se è testo semplice o JSON e quale campo distingue autenticato/non autenticato. Cautela non casuale: `epicPlugin.ts` ha un bug storico documentato proprio su questo punto (`legendary status --json` confrontato contro la stringa sbagliata, `'not logged in'` invece del vero `'<not logged in>'` con parentesi — qualunque account risultava sempre autenticato).

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.110-dev.3 — Amazon Games: autenticazione completa (login/logout/isAuthenticated)

Verificato output reale di `nile auth --status`: `{"Username": "Daniele", "LoggedIn": true}` — JSON pulito, campo booleano `LoggedIn` senza ambiguità (a differenza del caso storico Epic, dove `legendary status --json` usava una stringa placeholder con un dettaglio facile da sbagliare — le parentesi angolari di `<not logged in>` — che aveva causato un bug reale documentato in `epicPlugin.ts`).

**Implementato**: `isAuthenticated()` legge `parsed.LoggedIn === true` da `nile auth --status`. Con questo, l'autenticazione Amazon è completa: `login()`, `logout()`, `isAuthenticated()` tutti verificati con output reale, nessuna parte indovinata.

**Unica parte ancora mancante per un plugin Amazon Games funzionante end-to-end**: l'orchestrazione reale del download/installazione (`runAmazon` in `downloadManager.ts`, sul modello di `runEpic`/`runGog`) — progresso durante `nile install`, creazione prefix Wine, winetricks, ricerca dell'eseguibile installato. `installGame`/`uninstallGame` restano stub che rimandano al comando giusto, in attesa di quella parte.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.111-dev.1 — Amazon Games: orchestrazione reale download/installazione (runAmazon)

Ultimo pezzo mancante per un plugin Amazon Games funzionante end-to-end. Verificato con un log reale completo fornito dall'utente (installazione di "Art of Fighting 3: The Path of The Warrior", ~53MB, dall'inizio alla fine).

**Scoperta importante nel log**: a differenza di legendary/lgogdownloader (che aggiornano la stessa riga via `\r`), `nile install` stampa una riga `INFO [PROGRESS]` completa e separata da newline normale per ogni aggiornamento — parsing più semplice, nessuna gestione di `\r` necessaria. **Artefatto scoperto e deliberatamente non replicato**: la percentuale che nile stampa prima della frazione byte è "in ritardo" di una riga rispetto alla vera frazione (es. una riga con `Progress: 19.84 41670335/55301823` mostra 19.84%, ma quella frazione byte fa in realtà ~75.3% — il 19.84% corrisponde invece alla riga precedente). Il nuovo `makeNileProgressParser()` ricalcola quindi sempre la percentuale dal rapporto byte scaricati/totale, mai dal numero già stampato da nile.

**Nuovo `runAmazon()`** in `downloadManager.ts`, sul modello di `runEpic`/`runGog`: `nile install <product.id> --base-path <path>` (verificato: `--install --help` conferma lo stesso comportamento di `--base-path` di legendary), poi le stesse funzioni condivise già collaudate per gli altri store — `prepareWinePrefix`, `resolveRunnerWineEnv`, `filterVerbsForEnv`, `findMainExe` per la ricerca dell'eseguibile finale. Collegato nel dispatch di `startTask()`.

**Esplicitamente non implementato, non indovinato**: il lookup Known Fixes Heroic (`fetchKnownFixes`) non è stato esteso ad Amazon — il percorso del repository è verificato solo per `gog`/`epic`, non per una cartella Amazon equivalente, quindi `task.useKnownFixes` viene ignorato per ora invece di puntare a un percorso non verificato. Nessun sottocomando `nile info` equivalente a `legendary info --json` per risolvere l'eseguibile via API — usa direttamente `findMainExe()` su filesystem, lo stesso fallback già collaudato e affidabile usato da Epic quando l'API non risolve.

Con questo, il plugin Amazon Games (Step 19c) è completo: libreria, autenticazione, download/installazione con prefix Wine e winetricks, lancio tramite il runner Wine/Proton standard (nessuna dipendenza da `nile launch`, stesso principio già in uso per GOG/Epic).

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.112-dev.1 — Amazon Games: residui mock corretti (3 su 4 problemi segnalati)

Segnalati dall'utente dopo aver attivato il plugin per davvero. Tre erano residui del vecchio stub, mai aggiornati quando il plugin è diventato reale — il quarto (isInstalled sempre vero) resta in indagine, vedi sotto.

**1. Tab Store Accounts: "Accesso non richiesto" invece di "Account Collegato".** Causa: `'Amazon Games'` era ancora hardcoded in QUATTRO elenchi/insiemi diversi in `App.tsx` (`NO_LOGIN_STORES`, `NO_LOGIN_STORES_HANDLEPLAY`, e due varianti locali di `noLogin`) — tutti pensati per store senza un vero concetto di login (Steam, Battle.net, Classic Console), dove Amazon era stato messo per errore quando il plugin era solo uno stub. Rimosso da tutti e quattro.

**2. Tab Plugin: descrizione "Amazon Games — non ancora supportato".** Causa: non un mock nel codice — una chiave di traduzione i18next (`storePluginDescriptions.Amazon_Games` in `public/locales/{it,en}/settings.json`) che sovrascriveva la descrizione reale già corretta inviata dal backend (`amazonPlugin.ts`). Aggiornata in entrambe le lingue, stesso pattern già usato per GOG/Epic (specchio italiano + traduzione inglese, invece di lasciare che la chiave assente faccia da fallback al testo del backend).

**3. Widget "Dimensione Prevista" mancante in sidebar.** Causa: due controlli hardcoded (`selectedGame.store === 'GOG Galaxy' || selectedGame.store === 'Epic Games'`, uno per il fetch e uno per il rendering) non includevano `'Amazon Games'` — nonostante `getPredictedInstallSizeBytes()` fosse già implementata e verificata per Amazon in `amazonPlugin.ts` (v1.1.110-dev.1). Aggiunto `'Amazon Games'` a entrambi.

**4. "Tutti i giochi risultano installati" — ANCORA IN INDAGINE, non corretto alla cieca.** Ipotesi più probabile: `nile library --help` mostra la sintassi come `nile library [OPTIONS] {list,sync}` — cioè le opzioni (incluso `--installed`) PRIMA del sottocomando, non dopo come nel codice attuale (`nile library list --json --installed`). Se `--installed` piazzato dopo `list` viene silenziosamente ignorato, `nile library list --json --installed` restituirebbe l'intera libreria invece di quella filtrata, facendo risultare "installato" ogni titolo. Richiesta verifica diretta prima di correggere.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.113-dev.1 — Amazon Games: risolto il quarto bug (tutti i giochi risultavano installati)

Verificato empiricamente dall'utente, come richiesto nel turno precedente: `nile library list --json --installed`, `nile library --installed list --json` e la lista senza filtro restituiscono **tutte e tre lo stesso numero di voci** (55/55/55 in un test reale) — il flag `--installed` non filtra assolutamente nulla in questa versione di nile, indipendentemente dalla posizione. La mia ipotesi originale (ordine delle opzioni sbagliato) era quindi scorretta — la causa reale è che il flag stesso non funziona.

**Fix**: rimossa `getInstalledFromNile()` per intero — nile non offre un modo affidabile per sapere quali giochi sono installati via CLI, quindi non ha senso fidarsi di un suo output. `AmazonPlugin.getLibrary()` ora imposta sempre `isInstalled: false` nella scansione fresca, affidandosi interamente a `gameManager.protectInstalledState()` (già esistente, usato per altri scenari) per preservare lo stato reale una volta che X-Launcher installa davvero un gioco — `db.updateGameStatus()` viene scritto direttamente nel DB al completamento del download (`runAmazon()`, v1.1.111-dev.1), indipendentemente da qualunque scansione successiva della libreria.

Con questo, tutti e quattro i problemi segnalati sono risolti. Il plugin Amazon Games è ora pienamente funzionante.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.114-dev.1 — Amazon Games: widget Dipendenze Wine e Disabilita ntsync nell'overlay

Segnalato dall'utente: nell'overlay di un gioco Amazon Games mancavano il widget "Dipendenze Wine" (verb winetricks) e lo switch "Disabilita sync NT veloce" — entrambi presenti per GOG/Epic. Causa: gli stessi due controlli hardcoded (`selectedGame.store === 'GOG Galaxy' || selectedGame.store === 'Epic Games'`) che limitavano il widget "Dimensione Prevista" prima di v1.1.112-dev.1 esistevano anche qui, semplicemente non ancora corretti.

**Fix**: aggiunto `'Amazon Games'` a entrambe le condizioni. Entrambi i dati sono già effettivamente usati da `runAmazon()` in `downloadManager.ts` (`filterVerbsForEnv(task.winetricksVerbs)` e `disableWineSync` passato a `prepareWinePrefix()`, esattamente come GOG/Epic) — mancava solo il permesso di mostrarli/modificarli dall'overlay.

**Deliberatamente NON esteso**: lo switch "Usa Known Fixes (Heroic)" resta visibile solo per GOG/Epic. `runAmazon()` ignora esplicitamente `task.useKnownFixes` (commento già presente dalla v1.1.111-dev.1) perché il percorso del repository Heroic Known Fixes non è verificato per una cartella Amazon equivalente — mostrare lo switch senza che il backend lo applichi davvero sarebbe fuorviante. Da aggiungere qui solo insieme a un'implementazione reale, non prima.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.115-dev.1 — Amazon Games: fix disinstallazione (file mai rimossi, nile mai avvisato)

Segnalato dall'utente: disinstallare un gioco Amazon Games dalla Dashboard lo marcava correttamente come "non installato" nel DB, ma non rimuoveva alcun file/cartella reale da `~/Games/Amazon Games/`.

**Causa confermata**: `gameManager.ts`, funzione `uninstallGame()` — il calcolo di quale cartella cancellare (`storeDir`) gestiva solo `'GOG Galaxy'`/`'Epic Games'`, con `'Amazon Games'` che cadeva sempre nel ramo `null` — l'intero blocco di rimozione file veniva saltato, finendo nel log come "store non gestito".

**Fix**: aggiunta `'Amazon Games'` al calcolo di `storeDir` (`~/Games/Amazon Games/<gameId>/`, stessa cartella realmente usata in fase di installazione da `storeDir()` in `downloadManager.ts`). Aggiunta anche una chiamata reale a `nile uninstall <productId>` prima della pulizia file, sullo stesso modello già esistente per Epic (`legendary --yes uninstall`) — senza questa chiamata, il manifest interno di nile continuava a credere il gioco installato al vecchio path anche dopo una cancellazione manuale dei file, e questo è il sospetto principale per il terzo problema segnalato nello stesso turno (cartella `files` vuota dopo un'installazione apparentemente riuscita con GE-Proton11-1 + dotnet48): senza mai dire a nile di disinstallare, una successiva `nile install` sullo stesso ID potrebbe non riscaricare nulla, credendo che sia già a posto.

Non ancora confermato dall'utente se questo risolve completamente anche il problema 3 — da riverificare con un ciclo completo disinstalla/reinstalla dopo questo fix.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.116-dev.1 — fix trasversale: winetricksVerbs non venivano mai salvati per un'installazione con soli verb di default

Segnalato dall'utente per Amazon Games, ma il bug era in realtà **trasversale a GOG/Epic/Amazon**: l'overlay non mostrava spuntato nessun verb, nemmeno quelli di default effettivamente installati.

**Causa reale**: `db.upsertCompatProfile()` veniva chiamata per salvare `winetricksVerbs` **solo** quando "Usa Known Fixes (Heroic)" trovava effettivamente un fix per quel gioco specifico (GOG/Epic). Se l'utente installava un gioco senza mai toccare le checkbox nell'overlay (accettando i default in silenzio) e senza Known Fixes attivo/trovato — il caso più comune — nessun salvataggio avveniva mai: il profilo compat nel DB restava senza `winetricks_verbs`, e riaprendo l'overlay in un secondo momento l'array tornava vuoto, mostrando tutte le checkbox scoperte anche per verb realmente installati.

**Fix**: nuova `persistWinetricksVerbs()` condivisa, chiamata alla fine del blocco winetricks in tutte e tre le funzioni di installazione (`runGOG`, `runEpic`, `runAmazon`) — salva sempre l'elenco effettivo dei verb usati, qualunque sia la loro provenienza (default silenziosi, selezione manuale pre-installazione già salvata via `PATCH`, o override Known Fixes).

**Nota separata, non un bug**: i verb installati manualmente da terminale con `winetricks` (fuori da X-Launcher) non possono comparire nell'overlay — X-Launcher può solo tracciare ciò che passa dalla propria interfaccia, non ha modo di sapere cosa viene fatto direttamente sulla prefix da un altro processo.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.117-dev.1 — cambio runner: fix reale sul ricontrollo dipendenze + notifica prefix nuova

Discussione con l'utente su come gestire il cambio di runner (Wine ↔ Proton/Proton-GE) per un gioco già installato, senza duplicare manualmente le dipendenze né rischiare di corrompere le prefix mescolando cartelle fra generazioni Wine/Proton diverse (rischio concreto, vedi il bug "Prefix has an invalid version?!" di qualche turno fa).

**Domanda posta dall'utente**: se `protontricks` non è installato, quale strumento usa X-Launcher per i verb winetricks su un'installazione fatta con Proton? Risposta verificata nel codice: **nessuno usa `protontricks`, né oggi né con questo fix** — `resolveRunnerWineEnv()` risolve direttamente i binari `wine64`/`wine`/`wineserver` **inclusi nella build di Proton scelta** (`<cartella-Proton>/files/bin/`) e li passa come variabili d'ambiente (`WINE`/`WINE64`/`WINESERVER`) al **`winetricks` di sistema** — lo stesso strumento usato per Wine puro, solo puntato al binario giusto. `winetricks` rispetta queste variabili indipendentemente da chi ha creato la prefix.

**Bug reale trovato verificando questo**: esisteva già un meccanismo che ri-applica i verb salvati ad ogni lancio (non solo in fase di installazione) — ma usava sempre `WINEPREFIX: game.prefixPath` con wine di sistema, **indipendentemente dal runner selezionato**. Per un runner Proton, la prefix vera vive in `<prefixPath>/pfx` (non nella cartella "contenitore"), e serve il binario wine incluso in quella build di Proton — non quello di sistema. Il ricontrollo veniva quindi eseguito silenziosamente nel posto sbagliato per qualunque gioco lanciato con un runner Proton/Proton-GE, da quando questo meccanismo esiste. Corretto: `resolveRunnerWineEnv()` (già usata in fase di installazione) esportata da `downloadManager.ts` e riusata qui.

**Decisione presa insieme sui salvataggi**: niente copia automatica della cartella utente fra prefix diverse (rischio di corruzione giudicato non accettabile dall'utente) — solo una **notifica esplicita** quando si lancia un gioco con un runner la cui prefix non esiste ancora, che avvisa che salvataggi/impostazioni di un runner precedente non saranno presenti, ripristinabili a mano se lo si desidera.

**Limite onesto, dichiarato non nascosto**: al primo lancio con un runner nuovo, la prefix non esiste ancora nel momento in cui gira questo controllo (viene creata da `runner.launch()` subito dopo, con il proprio wineboot) — quindi i verb non vengono ancora riapplicati in quello stesso lancio, solo dal secondo lancio in poi con lo stesso runner. Non abbiamo integrato qui la creazione/wineboot esplicito della prefix prima del ricontrollo (richiederebbe adattare `prepareWinePrefix`, pensata per il flusso di installazione con la propria struttura `DownloadTask`) — la notifica comunque avvisa subito l'utente al primo lancio, indipendentemente da quando i verb vengono effettivamente riapplicati.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.118-dev.1 — rilevamento verb winetricks installati manualmente

Segnalato dall'utente (dopo aver verificato con una query SQL diretta sul DB che il salvataggio dei verb tracciati dalla dashboard funziona correttamente): i verb installati a mano da terminale (`winetricks d3d9 d3dcompiler_43` direttamente sulla prefix, non tramite la dashboard — il caso reale che aveva permesso a LEGO Indiana Jones di avviarsi) non finivano mai nel profilo compat salvato. Causa strutturale, non un bug da correggere: X-Launcher può tracciare solo ciò che passa dalla propria interfaccia — non ha modo di sapere cosa viene fatto direttamente sulla prefix da un altro processo.

**Soluzione**: `winetricks list-installed` — comando ufficiale e documentato di winetricks stesso — elenca tutti i verb realmente applicati a una prefix, indipendentemente da come sono stati installati. Aggiunto un controllo ad ogni lancio (`gameManager.ts`, `launchGame()`): confronta l'elenco reale (`list-installed`) con quello tracciato nel profilo compat, e se trova verb aggiunti manualmente non ancora presenti nel DB, li unisce e salva — indipendente dal blocco di ricontrollo/riapplicazione già esistente (gira anche se il profilo non aveva ancora nessun verb tracciato). Risultato: un'aggiunta manuale, una volta che il gioco è stato lanciato con successo, finisce da sola nel profilo salvato al lancio successivo, senza dover toccare le checkbox a mano nell'overlay.

Aggiunti anche `d3d9` e `d3dcompiler_43` all'elenco dei verb opzionali visibili in vista estesa (`OPTIONAL_WINE_VERBS`) — proprio i due verb del caso reale che ha fatto emergere il problema, ora selezionabili proattivamente prima di un'installazione, non solo rilevabili a posteriori.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi (2 errori di tipo impliciti emersi durante lo sviluppo — dovuti a `require('child_process')` che perde la tipizzazione di `execSync` — corretti con annotazioni esplicite prima della verifica finale).

## v1.1.119-dev.1 — fix reale: il rilevamento verb manuali salvava anche robaccia nel DB

Segnalato dall'utente con un output DB alla mano, subito dopo aver testato il fix v1.1.118: `winetricksVerbs` conteneva, oltre ai verb reali, il banner di avvio di winetricks ("Using winetricks 20260125 - sha256sum: ... con wine-10.0 e WINEARCH=win64") e singoli nomi di font installati come componenti separati di `corefonts` (andale, arial, comicsans, courier, georgia, impact, times, trebuchet...).

**Causa**: il filtro sull'output di `winetricks list-installed` (`!l.startsWith('#')`) era troppo permissivo — winetricks non stampa solo nomi di verb su quel comando.

**Fix**: nuovo modulo condiviso `src/wineVerbs.ts` (stesso principio di `types.ts`, importabile sia dal frontend sia dal backend) con `DEFAULT_WINE_VERBS`/`OPTIONAL_WINE_VERBS`/`ALL_KNOWN_WINE_VERBS` — spostati lì dalle costanti locali che prima vivevano solo dentro `App.tsx`. Il filtro ora accetta nel DB **solo** ciò che è in questo elenco riconosciuto, invece di rincorrere ogni riga indesiderata una alla volta (fragile, non avrebbe mai coperto tutti i casi). Ripulita anche la robaccia **già scritta in precedenza** nel DB da chi aveva già provato il fix v1.1.118 — non bastava filtrare solo le nuove rilevazioni, altrimenti banner/font già salvati sarebbero rimasti lì per sempre (l'unione precedente si limitava ad aggiungere, mai a togliere).

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.120-dev.1 — Cloud Backup: fondamenta + flusso OAuth Google Drive (prima parte)

Prima implementazione concreta della funzione discussa con l'utente (backup su cloud di compat_profiles, Knowledge Base AI Advisor, app.conf, cartella avatars/, .env — mai libreria/prefix/config legendary-lgogdownloader-nile/token/preferenze). Decisioni di disegno concordate: integrato nella tab Account esistente (non una nuova tab), backup/ripristino espliciti (mai sync automatica), un solo servizio cloud attivo alla volta come per l'AI Advisor.

**Verificato prima di scrivere codice** (stesso principio già seguito per Amazon/nile): la Device Flow OAuth (pensata per TV, sembrava la scelta naturale) non supporta gli scope di Drive — confermato con una segnalazione reale di errore "invalid_scope". Il flusso out-of-band (copia-incolla del codice, come GOG/Epic/Amazon) è dismesso da Google dal 2022 per client nuovi. Il redirect loopback (`http://127.0.0.1:<porta>/...`) è invece deprecato **solo** per client Android/iOS/Chrome-app — resta il meccanismo ufficialmente raccomandato per client "Desktop app" (questo caso), senza nemmeno dover registrare la porta esatta in anticipo (RFC 8252).

**Implementato in questo giro**:
- Schema DB `cloud_backup_credentials` (stesso pattern di `ai_provider_credentials`: mutua esclusività, un provider attivo alla volta) + funzioni CRUD in `db.ts`.
- Interfaccia condivisa `CloudBackupProvider` (`src/backend/cloudBackup/base.ts`), sul modello di `StorePlugin`/i provider AI Advisor.
- `GoogleDriveProvider` (`src/backend/cloudBackup/googleDrive.ts`): flusso OAuth loopback completo — server HTTP locale su porta libera, apertura del Firefox già integrato nella dashboard (fallback `xdg-open`), scambio codice→token, refresh token salvato in `tokens.json` (permessi 600, mai nel DB). Scope `drive.appdata` (cartella nascosta dedicata all'app).

**Ancora da fare, esplicitamente non scritto a caso**: `uploadBackup()`/`downloadLatestBackup()` — le chiamate reali all'API Drive v3 (upload multipart su `spaces=appDataFolder`, list/get per il download) restano stub con TODO. Il flusso OAuth era la parte con più incognite, verificata e scritta per prima; il resto segue in un prossimo giro, insieme alla logica di raccolta dei file da includere nel bundle (`compat_profiles` + Knowledge Base + `app.conf` + `avatars/` + `.env`) e alla UI nella tab Account.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.121-dev.1 — Cloud Backup: bundle, API Drive reali, route server (seconda parte)

Prosecuzione di v1.1.120-dev.1 (flusso OAuth Google Drive) — completa il backend, resta solo l'interfaccia utente.

**Nuovo `cloudBackup/bundle.ts`** — raccoglie/ripristina esattamente i dati decisi con l'utente: `compat_profiles`, Knowledge Base AI Advisor, `app.conf`, `.env`, cartella `avatars/` (immagini vere, non solo la scelta corrente). Formato: un unico JSON compresso con gzip (zlib nativo di Node, nessuna nuova dipendenza) — le immagini avatar viaggiano come base64 dentro lo stesso JSON invece di un vero archivio zip, stessa scelta "niente dipendenze in più" già seguita nel resto del progetto.

**Gestito un problema di ordinamento individuato in fase di design**: `compat_profiles.game_id` ha un vincolo `FOREIGN KEY` verso `games(id)`, applicato (`PRAGMA foreign_keys = ON`, verificato nel codice). Ripristinare un profilo per un gioco non ancora presente nella libreria (es. su un'installazione nuova, prima della prima scansione) violerebbe il vincolo. Gestito riga per riga con try/catch in `db.importCompatProfilesRaw()`: le righe compatibili si ripristinano, quelle che referenziano un gioco non ancora scansionato vengono saltate e segnalate esplicitamente all'utente ("scansiona la libreria e ripristina di nuovo"), invece di far fallire l'intero ripristino o mentire silenziosamente su cosa è stato recuperato.

**Nuovo `knowledgeBase.importEntries()`** — mancava un metodo di importazione in blocco (esisteva solo `getAll()` per l'esportazione); riusa l'`upsert()` già collaudato dello store interno.

**Chiamate reali Drive API v3** in `googleDrive.ts`: `uploadBackup()`/`downloadLatestBackup()` sostituiscono gli stub — upload multipart (crea o aggiorna sul posto, un solo file di backup mantenuto invece di accumularne uno nuovo ad ogni backup), download con `alt=media`. Nessun SDK Google, chiamate `fetch` dirette come nel resto del progetto.

**Route in `server.ts`**, stesso schema delle route AI Advisor: `GET /api/cloud-backup/providers` (stato di tutti i provider in un colpo solo), `POST /api/cloud-backup/providers/:id` (salva client ID/secret, aggiornamento parziale — un campo omesso preserva quello già salvato), `POST /api/cloud-backup/providers/:id/login`/`logout`, `POST /api/cloud-backup/backup`/`restore`.

**Ancora da fare**: l'interfaccia nella tab Account (campo Client ID/Secret, pulsanti Login/Backup/Ripristina, stato ultimo backup).

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.122-dev.1 — Cloud Backup: interfaccia nella tab Account (terza e ultima parte)

Completa la funzione avviata in v1.1.120-dev.1/v1.1.121-dev.1 (backend: OAuth Google Drive, bundle, chiamate Drive API reali) con l'interfaccia utente — integrata nella tab Account esistente, come deciso con l'utente (invece di una tab dedicata, evitando il problema di spazio nella barra tab discusso a parte).

**Aggiunto**:
- Sezione "Cloud Backup" nella tab Account, sotto la griglia degli store — card per ogni provider registrato (solo Google Drive per ora), con campi Client ID/Secret (tastiera on-screen, stesso pattern delle API key dell'AI Advisor), toggle attiva/disattiva (mutua esclusività già garantita lato backend), pulsante "Connetti" con polling automatico sul completamento del login OAuth (il flusso loopback apre il browser e ritorna subito — la card si aggiorna da sola quando l'utente completa l'accesso), pulsanti "Esegui Backup"/"Ripristina" una volta autenticato, stato dell'ultimo backup.
- Traduzioni aggiunte in italiano e inglese fin da subito (namespace `accounts` in `settings.json`), come da regola di progetto.

**Bug reale trovato e corretto durante lo sviluppo**: la nuova sezione era stata inserita come secondo elemento fratello subito dopo la griglia store, ma quel ramo del ternario dell'interfaccia (`activeSettingsTab === 'accounts' ? (...)`) può contenere un solo elemento JSX — mancava un Fragment (`<>...</>`) ad avvolgere entrambi, causando una cascata di errori di parsing apparentemente scollegati più avanti nel file. Individuato isolando la sezione inserita e verificandone il bilanciamento di parentesi/graffe (risultato bilanciato al suo interno — la causa reale era strutturale, non un carattere mancante), corretto avvolgendo griglia store + sezione Cloud Backup in un `<>...</>` comune.

Con questo, la funzione Cloud Backup è completa end-to-end: configurazione, login OAuth, backup e ripristino selettivo dei dati verificati con l'utente (compat_profiles, Knowledge Base AI Advisor, app.conf, avatars/, .env).

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.123-dev.1 — fix navigazione: sezione Cloud Backup raggiungibile in modo incoerente

Segnalato dall'utente: la sezione Cloud Backup (sotto la griglia store nella tab Account) era raggiungibile scendendo con il controller solo partendo da alcune card, in modo incoerente — funzionava scendendo da GOG Galaxy, ma da Epic o Amazon solo se l'etichetta "Cloud Backup" era già parzialmente visibile a schermo.

**Causa**: nessuno dei tre pulsanti possibili di una card store (Connetti/Annulla/Disconnetti, a seconda dello stato di autenticazione) aveva un vicino esplicito verso il basso — tutto affidato allo scoring geometrico, che si comporta in modo inaffidabile quando l'elemento sottostante richiede scroll per essere visibile, o quando (griglia a 2 colonne) una card non ha nulla direttamente sotto di sé nella propria colonna. Con 3 store visibili (GOG, Epic, Amazon) in una griglia a 2 colonne, sia Epic (prima riga, seconda colonna) sia Amazon (seconda riga, prima colonna, ultimo elemento) non hanno nulla direttamente sotto — solo GOG ce l'ha (Amazon, nella stessa colonna).

**Fix**: calcolato dinamicamente, per ogni card della griglia, se esiste un elemento nella stessa colonna alla riga successiva (`idx + 2` oltre la fine dell'elenco) — se non esiste, la card collega esplicitamente al primo elemento della sezione Cloud Backup (`cloud-backup-toggle-google-drive`), qualunque sia il pulsante attivo in quel momento (Connetti/Annulla/Disconnetti). Generico rispetto al numero di store effettivamente visibili — non fissato a 3 — continua a funzionare correttamente se in futuro se ne aggiungono o rimuovono.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.124-dev.1 — traduzione mancante Cloud Backup + padding pulsanti (notifiche comprese)

Due difetti segnalati dall'utente.

**1. Traduzione inglese mancante** per la descrizione della card Google Drive ("Backup su Google Drive..."). Causa: la `description` di `GoogleDriveProvider` è un campo readonly della classe backend, sempre in italiano — stesso identico problema già risolto per le descrizioni dei plugin store (`Amazon Games — non ancora supportato` restava in italiano anche in UI inglese). Fix: nuova `translateCloudBackupDescription()`, stesso pattern già collaudato di `translateStorePluginDescription()` — chiave i18next con fallback al testo del backend, invece di mostrare sempre la stringa grezza.

**2. Margine orizzontale insufficiente** nei pulsanti "Esegui Backup"/"Ripristina" — il testo era troppo ravvicinato ai bordi. Causa: i pulsanti usano `flex-1` (si allargano a riempire il contenitore) ma non avevano alcun `px-*` — il testo restava incollato ai bordi invece di avere respiro. Correggendo, l'utente ha segnalato che lo stesso difetto è presente anche nei pulsanti di interazione delle notifiche — verificato e confermato: `notif-ok`/`notif-ko`/`notif-primary`/`notif-secondary` avevano esattamente lo stesso problema (`flex-1 py-2` senza `px-*`). Aggiunto `px-3`/`px-4` + `text-center` a tutti e sei i pulsanti coinvolti.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.1.125-dev.1 — fix navigazione: catena interna Cloud Backup + causa reale dell'ingresso incoerente

Segnalati 4 problemi dall'utente sulla navigazione col controller nella sezione Cloud Backup.

**1. Causa reale trovata per l'ingresso incoerente (Epic vs Amazon)**: il fix precedente (v1.1.123-dev.1) calcolava "questa card ha qualcosa direttamente sotto in griglia?" contando solo se un elemento esisteva nell'array a quella posizione — ma l'elenco store reale (verificato nell'ordine di registrazione in `gameManager.ts`) è **GOG, Steam, Epic, Amazon, Battle.net, Classic Console** — 6 voci, non 3 come assunto scrivendo il fix precedente. Battle.net e Classic Console sono "noLogin" e renderizzano un **div statico, mai un Focusable** — quindi Epic (con Battle.net sotto) e Amazon (con Classic Console sotto) non avevano davvero nulla di navigabile nella propria colonna, nonostante l'array contenesse un elemento a quella posizione. Il vecchio controllo non lo sapeva, lasciava Epic e Amazon allo scoring geometrico puro — che per pura vicinanza orizzontale trovava lo switch da Amazon (più a destra, allineato) ma il campo Client ID da Epic (più a sinistra, spiegando esattamente il percorso "funzionante" scoperto dall'utente). Corretto: il calcolo ora verifica anche se lo store nella posizione sottostante è uno dei due "noLogin", trattandolo come "niente di navigabile" allo stesso modo di una posizione oltre la fine dell'elenco.

**2. Catena verticale interna completata**: mancavano i vicini espliciti tra Client Secret → Connetti/Backup (calcolato dinamicamente in base a quale blocco è realmente renderizzato), Connetti → Client Secret (risalendo), Backup/Ripristina → Client Secret (risalendo) e → Disconnetti (scendendo), Disconnetti → Backup (risalendo). Aggiunta anche una catena orizzontale esplicita fra Backup e Ripristina (stessa riga), per determinismo completo indipendentemente dallo scoring geometrico, come richiesto.

**3. Nessun indicatore di selezione quando lo switch è "Attivo"**: verificato — il ramo `isFocused` non veniva controllato affatto quando `enabled=true`, mostrando sempre lo stesso riempimento viola pieno indipendentemente dal fuoco. Aggiunto un anello (`ring-2 ring-purple-300`) distinto quando attivo+focalizzato, analogo a quello già usato per lo stato non-attivo.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.5.0-Venus — MILESTONE STABILE

Congelata su richiesta esplicita dell'utente, seguendo la stessa convenzione inaugurata con Gaia (nome di pianeta/satellite per ogni milestone stabile). Precede questa milestone `v1.1.79-Gaia`.

Rispetto a Gaia, aggiunge due funzioni maggiori — Step 19c completo (plugin Amazon Games via `nile`: libreria, autenticazione, download/installazione, lancio, tutti verificati passo per passo con output reale, mai un formato indovinato) e Cloud Backup (backup/ripristino selettivo dei dati verificati su Google Drive, un provider cloud attivo alla volta, flusso OAuth loopback per client "Desktop app" verificato prima di scrivere codice) — oltre al consolidamento infrastrutturale post-Gaia (`paths.ts` come fonte unica di `DATA_DIR`/`ENV_PATH`, `.env` riposizionato in `~/.local/share/x-launcher/`, MangoHud a 3 stati, supporto `.7z`, fix libreria GOG), al ridisegno dell'AI Advisor (un provider attivo alla volta, budget per-provider con blocco reale) e alla vista compatta/estesa del widget Dipendenze Wine. Dettaglio versione-per-versione completo (v1.1.100 → v1.1.125-dev.1) nelle voci precedenti di questo stesso file.

Nessun cambiamento di codice in questa voce — solo il congelamento: versione aggiornata in `App.tsx`/`package.json` (`v1.5.0-Venus`), `metadata.json` aggiornato (`version`/`milestone`/`date`/`notes` + cinque nuove voci riassuntive in `patches[]`, una per ciascun blocco di lavoro dall'ultima milestone), `install.sh` esteso per coprire anche `scripts/with-env.sh` (nuovo da questa milestone, non coperto dal glob `*.sh` di radice — non strettamente necessario per il funzionamento ma coerente con gli altri script), pacchetto ricreato per intero come `X-Launcher_v1_5_0-Venus.zip`, stesse esclusioni di `.gitignore` già usate per Gaia (`node_modules`, `dist`, stato locale, log, ecc.) più `LICENSE` (resta solo nel repo GitHub, mai nello zip).

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. `metadata.json` validato. Zip verificato: `node_modules` assente, tutti i file chiave presenti.

## v1.5.1-dev.1 — fix reale: il PATCH del profilo compat azzerava silenziosamente i verb non inclusi nella richiesta

Segnalato dall'utente con un caso reale (Death Stranding, Epic Games): installato dall'overlay dopo aver spuntato "Usa Known Fixes (Heroic)", nessun profilo specifico trovato, ma i verb di default non risultavano applicati né salvati (`winetricksVerbs: []` nel DB), confermato anche sulla prefix Proton reale (nessun verb realmente installato).

**Causa confermata**: `gameManager.updateCompatProfile()` passava il body della richiesta PATCH **direttamente** a `db.upsertCompatProfile()`, che scrive `profile.winetricksVerbs ?? []` — qualunque PATCH che non includesse esplicitamente `winetricksVerbs` azzerava silenziosamente il campo. Il toggle "Usa Known Fixes" (e probabilmente ogni altro toggle dell'overlay — FSR, GameMode, MangoHud, EAC, BattlEye, Disabilita sync NT — condividono lo stesso schema) rilegge il profilo dal server prima di scrivere: per un gioco mai configurato, quella lettura è vuota, quindi il PATCH risultante omette `winetricksVerbs` e lo azzera — anche se l'overlay mostra a schermo i 4 verb di default spuntati (stato solo locale, mai risincronizzato). Nel caso reale: spuntare "Usa Known Fixes" **prima** di installare ha già cancellato il profilo, prima ancora di premere Install.

**Fix**: `updateCompatProfile()` ora fonde sempre con la riga già esistente nel DB prima di scrivere — un campo omesso da una specifica richiesta PATCH preserva il valore già presente, invece di essere azzerato al default di tipo. Corregge il problema per qualunque toggle dell'overlay, non solo Known Fixes, con una singola modifica lato server invece di dover correggere ogni singolo gestore client uno per uno.

**Nota per l'utente**: questo fix previene il problema per le prossime installazioni — non ripara retroattivamente Death Stranding, che ha ancora bisogno dei verb applicati per davvero. Consigliato: riaprire l'overlay, spuntare i verb desiderati, e reinstallare (o rilanciare più volte — il rilevamento `winetricks list-installed` al lancio, già esistente, sincronizzerà comunque solo ciò che è realmente presente nella prefix, quindi senza applicarli per davvero prima non comparirebbe nulla).

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.5.2-dev.1 — fix reale: MangoHud mancante per giochi Epic Games con runner Proton

Segnalato dall'utente: MangoHud funziona regolarmente con Wine ma non compare affatto sostituendo Wine con un runner Proton.

**Causa confermata**: i giochi Epic Games passano **sempre** per `launchEpicViaLegendary()` (sia con Wine sia con Proton — commento esplicito nel codice: "sempre via legendary launch, non l'exe diretto", v1.1.30), mai per le classi `WineRunner`/`ProtonRunner` direttamente. La traduzione di `config.mangohud` (livello numerico 0/1/2) in variabili d'ambiente reali (`MANGOHUD`, `MANGOHUD_DLSYM`, `MANGOHUD_CONFIG`) esiste solo dentro quelle due classi — `launchEpicViaLegendary()` non la include in nessuno dei due rami (Wine o Proton), quindi per Epic Games MangoHud non veniva mai attivato esplicitamente in nessun caso. Verificato anche che GOG e Amazon Games non condividono questo problema: lanciano l'eseguibile direttamente tramite `WineRunner`/`ProtonRunner`, dove la logica è già corretta.

**Fix**: aggiunta la stessa identica traduzione già usata in `WineRunner`/`ProtonRunner` (duplicata qui perché questa funzione non passa da nessuno dei due), applicata prima della costruzione degli argomenti `legendary launch`.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi.

## v1.5.3-dev.1 — FSR/GameMode su Proton, EAC/BattlEye spostati nel posto giusto, disabilitati nell'interfaccia sotto Wine

Seguito diretto del fix MangoHud-per-Epic del giro precedente — l'utente ha chiesto di verificare anche FSR, GameMode, EasyAntiCheat e BattlEye. Verificato uno per uno invece di assumere che condividessero lo stesso problema.

**FSR e GameMode**: confermato mancanti in `ProtonRunner` (presenti solo in `WineRunner`) e in entrambi i rami di `launchEpicViaLegendary()` — variabili/wrapper generici Wine/Vulkan, funzionano identici sotto Proton. Aggiunti in tutti e tre i punti.

**EasyAntiCheat/BattlEye — non un semplice "mancante", un limite reale verificato**: le variabili `PROTON_EAC_RUNTIME`/`PROTON_BATTLEYE_RUNTIME` (il nome stesso lo dice) sono lette **solo** dallo script di avvio di Proton — confermato con una segnalazione diretta di uno sviluppatore su GitHub ("WINE just tries to load the game's battleye, which is the windows one"): sotto wine puro non esiste alcun modo di redirigerle verso un runtime Linux, l'anti-cheat tenta di caricare il binario Windows così com'è. Il blocco che le impostava dentro `WineRunner` non ha quindi **mai avuto effetto reale** da quando esiste. Spostato in `ProtonRunner` (dove funziona davvero) e nel ramo Proton di `launchEpicViaLegendary()` — rimosso dal ramo Wine, dove non serviva a nulla.

**Interfaccia**: su richiesta esplicita dell'utente, i tile EasyAntiCheat/BattlEye nella griglia Compatibility Layer sono ora oscurati e **non selezionabili per davvero** (non solo visivamente attenuati) quando il runner attivo per quel gioco è quello di default (Wine-Lutris) invece di un runner Proton — stessa distinzione già usata per la sezione Runner Bridge (`selectedGame.runner !== 'Wine-Lutris'`). Un tentativo di selezione su un tile oscurato viene ignorato silenziosamente (con un suono di diniego), invece di attivare un'opzione che non avrebbe comunque avuto effetto.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto, stessi 23 errori pre-esistenti, identici, zero nuovi (corretto anche un errore reale introdotto durante lo sviluppo: `play('error')` non è un `SoundType` valido nel progetto — solo `focus`/`select`/`back`/`launch` — sostituito con `play('back')`).

## v1.5.3-Venus — MILESTONE STABILE

Congelata su richiesta esplicita dell'utente, dopo tre giorni di verifica sul campo di `v1.5.0-Venus`. Precede questa milestone `v1.5.0-Venus`.

Include tre correzioni scoperte da segnalazioni reali durante l'uso quotidiano (v1.5.1-dev.1 → v1.5.3-dev.1, dettaglio completo nelle voci precedenti di questo file): il bug nel salvataggio del profilo compat che azzerava silenziosamente `winetricksVerbs` per qualunque toggle dell'overlay che non lo includesse esplicitamente nella richiesta PATCH; MangoHud/FSR/GameMode mancanti per Proton nei giochi Epic Games (che passano sempre per un percorso di lancio dedicato via `legendary`, mai per le classi runner dirette) ed EasyAntiCheat/BattlEye spostati dal punto sbagliato (`WineRunner`, dove non hanno mai avuto effetto reale) al punto giusto (`ProtonRunner`), con disabilitazione esplicita in interfaccia quando il runner attivo è Wine invece di Proton; e la reimplementazione corretta dell'aggiornamento automatico della versione nel menu.

**Quest'ultimo punto merita una nota a sé**: la versione mostrata nel menu ora si aggiorna da sola leggendo `/api/version`, che a sua volta legge `package.json` (aggiornato ad ogni singola modifica di sviluppo) — non più `metadata.json` (toccato solo ai congelamenti di milestone), la fonte sbagliata che aveva causato il bug storico v1.1.87. Nessun intervento manuale sarà più necessario per questo, a differenza di ogni milestone precedente.

Nessun altro cambiamento di codice in questa voce oltre a quanto già elencato nelle build di sviluppo precedenti — solo il congelamento: `metadata.json` aggiornato (`version`/`milestone`/`date`/`notes` + 3 nuove voci riassuntive in `patches[]`), pacchetto ricreato per intero come `X-Launcher_v1_5_3-Venus.zip`, stesse esclusioni già usate per Gaia e per la precedente Venus.

### Verifica

`tsc --noEmit`: stessi 23 errori pre-esistenti, nessun errore nuovo. `metadata.json` validato. Zip verificato: `node_modules` assente, tutti i file chiave presenti, versione corretta sia in `package.json` sia nel fallback letterale di `App.tsx`.

## v1.5.4-dev.1 — audit qualità del codice: risolti i punti A1-A4 (bug reali + sicurezza)

Primo giro di un audit richiesto esplicitamente dall'utente ("verifiche alla qualità del codice... scovare e correggere eventuali bug"). Riepilogo completo presentato prima di intervenire, poi risolto punto per punto con verifica `tsc --noEmit` ad ogni fix — **21 errori pre-esistenti invece di 23** al termine di questo giro (2 erano bug reali, non solo rumore di tipo).

**A1 — Ripristino download interrotti incompleto**: `db.ts` dichiarava di restituire un `DownloadTask` completo, ma la tabella `downloads` persiste solo 7 campi (`game_id`, `game_title`, `progress`, `status`, `speed`, `bytes_downloaded`, `total_bytes`) — `store`/`installPath`/`prefixPath`/`winetricksVerbs` non sono mai stati aggiunti allo schema. È codice attivo: `gameManager.init()` lo usa davvero per ripristinare i download in sospeso dopo un riavvio del demone, che riceveva quindi un oggetto con questi campi a `undefined`. Corretto **senza migrazione schema**: il tipo di ritorno di `rowToDownload()`/`getPendingDownloads()` ora riflette onestamente cosa viene ricostruito da lì, e `gameManager.init()` arricchisce ogni task recuperando `store`/`prefixPath` da `games` e `winetricksVerbs` da `compat_profiles` (dati già persistiti altrove), ricalcolando `installPath` con le stesse `storeDir()`/`slugFromId()` (ora esportate) usate all'installazione.

**A2 — Errore silenzioso non loggato** (`epicPlugin.ts`): `writeLog('warning', '...', e)` passava l'oggetto errore come terzo argomento — `writeLog` ne accetta solo due, il dettaglio reale dell'errore veniva scartato silenziosamente. Corretto interpolandolo nella stringa.

**A3 — Rischio reale di iniezione comandi** (`server.ts`, login Epic): il codice di autorizzazione incollato dall'utente finiva in `execSync(\`legendary auth --code "${authCode}"\`)` — le doppie virgolette non proteggono da `$(...)` in bash. Sostituito con `execFileSync('legendary', ['auth', '--code', authCode], ...)`: argomenti separati, nessuna shell coinvolta, injection eliminata strutturalmente indipendentemente dal contenuto incollato.

**A4 — Verb da Known Fixes (dati esterni) non validati** (`downloadManager.ts`, GOG ed Epic): l'array `winetricks` di un fix Heroic arriva da un repository GitHub esterno e finiva direttamente in `execSync(\`winetricks --unattended ${verb}\`)` senza alcun controllo. Nuova `sanitizeKnownFixVerbs()`: accetta solo voci presenti nell'elenco riconosciuto condiviso (`wineVerbs.ts`, lo stesso già usato per il rilevamento dei verb installati manualmente), scarta e segnala il resto invece di eseguirlo alla cieca. Applicata a entrambi i punti (installazione, salvataggio persistito, notifica) — cosa viene mostrato all'utente ora corrisponde sempre a cosa viene realmente eseguito.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto — **21 errori pre-esistenti (ridotti da 23), zero nuovi**.

## v1.5.5-dev.1 — audit qualità del codice: risolto il punto B (tipi scorretti che mascheravano problemi reali)

Secondo giro dell'audit di qualità del codice avviato su richiesta dell'utente. **19 errori pre-esistenti invece di 21**.

**B1 — `AppNotification.source` non dichiarava un valore realmente scritto**: `notificationEngine.ts` scrive davvero `source: 'validation'` per le notifiche di verifica post-chiusura gioco ("Ha funzionato?"), ma `types.ts` dichiarava solo `'system' | 'pattern' | 'kb' | 'ai'`. Il confronto in `App.tsx` (`notif.source === 'validation'`) funzionava comunque a runtime (i tipi TypeScript non esistono più a quel punto), ma il compilatore lo segnalava come impossibile — un tipo scorretto che avrebbe potuto rompersi silenziosamente al prossimo refactor. Verificato anche, cercando tutti gli usi reali di `source:` nel backend, che `'pattern'` non viene mai scritto da nessuna parte (probabile residuo vestigiale di un design precedente) — lasciato nel tipo, non causa danno.

**B2 — Percorso di import relativo sbagliato** (`gameManager.ts`): `import('./types').Game` (dinamico, solo per l'annotazione di tipo) puntava a un percorso inesistente — il file `types.ts` sta una cartella sopra (`src/backend/gameManager.ts` → `src/types.ts`), serviva `'../types'`. Innocuo a runtime (era solo un'annotazione di tipo, mai eseguita), ma il compilatore non riusciva a verificare quella riga. Semplificato riusando il tipo `Game` già importato in cima al file, invece di un secondo import ridondante con il percorso corretto.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto — **19 errori pre-esistenti (ridotti da 21), zero nuovi**.

## v1.5.6-dev.1 — audit qualità del codice: risolto il punto D (campi morti in compatibilityManager)

Terzo giro dell'audit di qualità del codice. **18 errori pre-esistenti invece di 19**.

**`compatibilityManager.getDefaultProfile()`** restituiva `dxvk`/`vkd3d` come campi booleani — non esistono affatto nel tipo `CompatibilityProfile` (in questo design DXVK/VKD3D si gestiscono tramite verb winetricks, non come toggle separati), probabile residuo di un design precedente al sistema attuale, mai ripulito. Rimossi. Nel farlo, trovato anche che l'oggetto restituito **mancava di `eac`/`battleye`** (entrambi richiesti dal tipo) — il compilatore segnalava solo la proprietà eccedente (`dxvk`), non quella mancante, per questo specifico oggetto letterale. Aggiunti con default `false`, coerente con `fsr`.

**Nota emersa verificando i chiamanti**: `getDefaultProfile()` non risulta invocata da **nessun punto** del progetto — è una funzione morta nella sua interezza, non solo nei due campi corretti. Lasciata (potrebbe tornare utile), ma ora è internamente corretta invece di restituire un oggetto strutturalmente sbagliato se mai venisse usata in futuro.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto — **18 errori pre-esistenti (ridotti da 19), zero nuovi**.

## v1.5.7-dev.1 — audit qualità del codice: risolto il punto E (deduplicazione FSR/GameMode/MangoHud/EAC/BattlEye)

Quarto e ultimo giro (per ora) dell'audit di qualità del codice. Su indicazione dell'utente, `App.tsx` resta invariato per ora (rischio di rompere silenziosamente i collegamenti di navigazione controller sparsi nel file, mai verificati dal compilatore — da riprendere in futuro con un approccio più mirato, es. `useMemo`/`useCallback` sui punti più costosi invece di uno split strutturale). Affrontata invece la parte a basso rischio: la stessa traduzione configurazione→variabili d'ambiente (FSR, MangoHud, EAC/BattlEye, GameMode) era scritta tre volte quasi identica in `WineRunner`, `ProtonRunner` e `launchEpicViaLegendary()` — dimenticata due volte in questa stessa sessione in un quarto punto (v1.5.2/v1.5.3-dev.1: MangoHud/FSR/GameMode mancanti in `ProtonRunner` e nel percorso Epic).

**Estratte quattro funzioni condivise** in `runners/implementations.ts`: `applyFsrEnv()`, `applyMangoHudEnv()`, `applyProtonAnticheatEnv()` (solo Proton, per costruzione — mai chiamata da `WineRunner`), `resolveGameModeWrapping()`. Nessun cambiamento di comportamento: stessa identica logica già verificata corretta in ognuno dei tre punti, solo centralizzata — elimina strutturalmente il rischio che un quarto punto di lancio futuro dimentichi la stessa traduzione, come già successo due volte.

**Verificato dopo il refactor**: `WINE_FULLSCREEN_FSR` ora scritto una sola volta in tutto il file (prima tre), le quattro funzioni condivise richiamate rispettivamente 3/3/2/3 volte dai punti giusti (EAC/BattlEye solo dai due punti Proton, correttamente assente da `WineRunner`).

Con questo, l'audit di qualità del codice (punti A-E) è concluso: **18 errori pre-esistenti (ridotti da 23 all'inizio dell'audit), zero nuovi**, tre bug funzionali reali corretti, un rischio di sicurezza reale eliminato, un rischio di sicurezza da dati esterni mitigato, due tipi scorretti corretti, codice morto ripulito, tre punti di duplicazione consolidati.

### Verifica

`tsc --noEmit`: confrontato riga per riga contro lo zip originale intatto — **18 errori pre-esistenti, identici, zero nuovi**.

## v1.5.7-Venus — MILESTONE STABILE

Congelata su richiesta esplicita dell'utente, terza della serie Venus. Precede questa milestone `v1.5.3-Venus`.

Contiene l'intero audit di qualità del codice richiesto dall'utente (v1.5.4-dev.1 → v1.5.7-dev.1, dettaglio completo nelle voci precedenti di questo file), condotto con un riepilogo di tutte le criticità presentato **prima** di applicare qualunque correzione, poi risolto a step confermati uno alla volta: tre bug funzionali reali (ripristino download interrotti dopo un riavvio del demone, un errore silenziosamente non loggato, verb da Known Fixes non validati prima dell'uso in un comando shell), un rischio di sicurezza reale eliminato (injection nel comando di autenticazione Epic — input utente non sanificato in una stringa shell) e uno mitigato (verb esterni da un repository GitHub ora filtrati contro un elenco riconosciuto), due tipi TypeScript scorretti che mascheravano problemi reali, codice morto ripulito, e tre punti di duplicazione (FSR/MangoHud/EasyAntiCheat/BattlEye/GameMode fra i tre punti di lancio del gioco) consolidati in funzioni condivise — la stessa dimenticanza che aveva già causato due bug reali in questa stessa sessione.

Gli errori TypeScript pre-esistenti (mai la causa di un problema reale, solo rumore accumulato nel tempo) sono scesi da **23 a 18** nel corso dell'audit — non per caso: ognuno dei 5 rimossi era un bug reale o un tipo scorretto, verificato e corretto singolarmente, mai "silenziato" con un cast o un `any`.

Nessun altro cambiamento di codice in questa voce oltre a quanto già elencato nelle build di sviluppo precedenti — solo il congelamento: `metadata.json` aggiornato (`version`/`milestone`/`date`/`notes` + 3 nuove voci riassuntive in `patches[]`), pacchetto ricreato per intero come `X-Launcher_v1_5_7-Venus.zip`, stesse esclusioni già usate per Gaia e per le due Venus precedenti.

### Verifica

`tsc --noEmit`: **18 errori pre-esistenti (invariati rispetto all'ultima build di sviluppo), zero nuovi**. `metadata.json` validato. Zip verificato: `node_modules` assente, tutti i file chiave presenti, versione corretta sia in `package.json` sia nel fallback letterale di `App.tsx`.

## v1.5.8-dev.1 — nuovo strumento: verifica statica dei riferimenti di navigazione

Primo passo verso una maggiore modularità di `App.tsx`, discusso e concordato con l'utente: prima di qualunque split strutturale (rimandato per il rischio sui collegamenti di navigazione, mai verificati dal compilatore), uno strumento a basso rischio che intercetta in automatico la stessa categoria di bug scovata più volte a mano in questa sessione — refusi, id rinominati, riferimenti dimenticati.

**Nuovo `scripts/check-focus-ids.cjs`** (estensione `.cjs`, non `.js`: il progetto ha `"type": "module"` in `package.json`, serve l'estensione esplicita per usare `require`). Analizza `App.tsx` ed estrae:
- ogni `id="..."` / `id={...}` dichiarato su un `<Focusable>` (gestisce anche variabili intermedie, es. `const toggleId = \`cloud-backup-toggle-${id}\`;` seguito da `id={toggleId}`, e template literal con interpolazioni normalizzate a pattern)
- ogni riferimento dentro `neighbors={{ up/down/left/right: ... }}`, inclusi ternari semplici e ternari annidati fra parentesi
- ogni uso di `sequentialChain`

Segnala due categorie: riferimenti che puntano a un id mai dichiarato da nessuna parte (bug quasi certo), e catene `sequentialChain` dichiarate da un solo elemento (non possono incatenare nulla — verificato in `FocusProvider.tsx`, la catena richiede più elementi con lo stesso valore).

**Eseguito per la prima volta sul vero `App.tsx` durante lo sviluppo dello strumento stesso** (non solo teorizzato): zero riferimenti a id inesistenti, ma **due scoperte reali** — `"game-options-runner-bridge"` e `"game-options-retroarch-cores"` risultano dichiarate da un solo elemento ciascuna in tutto il file, verificate manualmente con un secondo grep mirato. Non ancora corrette in questa build: restano da investigare a parte, non erano l'obiettivo di questo giro (costruire lo strumento).

Corretti anche due limiti trovati sviluppando lo script stesso: il rilevamento di `sequentialChain` con un template literal si rompeva sulle graffe annidate di `${...}` (sostituito con lo stesso abbinamento manuale delle parentesi già usato per `id={...}`/`neighbors={{...}}`); i pattern con parte variabile (es. per-provider) venivano segnalati per errore come "usati una sola volta", quando in realtà sono per costruzione univoci ad ogni istanza a runtime.

### Verifica

`tsc --noEmit`: **18 errori pre-esistenti, invariati, zero nuovi** (il nuovo script è puro JS in `scripts/`, fuori dall'ambito di compilazione del progetto — verificato che non introduca alcuna interferenza).

## v1.5.9-dev.1 — investigate le 2 catene sequentialChain segnalate: falsi positivi, corretto lo strumento

Seguito diretto di v1.5.8-dev.1: investigate le due catene `sequentialChain` segnalate come "usate una sola volta" dallo strumento appena scritto.

**Conclusione: entrambe sono falsi positivi, non bug reali.** `"game-options-runner-bridge"` e `"game-options-retroarch-cores"` vivono entrambe dentro un `.map()` (rispettivamente sui runner Proton non-default disponibili e sui core RetroArch disponibili per il sistema) — a runtime quella riga di dichiarazione viene eseguita una volta per ogni elemento disponibile, quindi con 2+ runner/core installati la catena ha davvero più membri che condividono lo stesso valore, esattamente come deve essere. Un'analisi del solo testo sorgente vede una singola occorrenza letterale e non può sapere quante volte il ciclo gira a runtime — dipende da cosa l'utente ha effettivamente installato.

**Corretto `check-focus-ids.cjs`** per non ripetere questo falso allarme: se l'`id` del `<Focusable>` associato a una dichiarazione `sequentialChain` usa un template literal con interpolazione (es. `` `game-runner-${runnerId}` ``, segnale affidabile che l'elemento è renderizzato dentro un ciclo), quella catena viene esclusa dal controllo "usata una sola volta" invece di essere segnalata. Rieseguito sul vero `App.tsx`: zero segnalazioni, entrambi i falsi positivi eliminati.

Nessun'altra modifica al codice applicativo — l'investigazione ha confermato che la navigazione di Runner Bridge e dei core RetroArch è corretta così com'è.

### Verifica

`tsc --noEmit`: **18 errori pre-esistenti, invariati, zero nuovi** (nessuna interferenza dallo script, fuori dall'ambito di compilazione del progetto).

## v1.5.10-dev.1 — primo passo di modularizzazione: hook useCloudBackupProviders

Primo passo concreto verso una `App.tsx` più mantenibile, discusso e concordato con l'utente: partire dalle estrazioni a rischio pressoché nullo (stato e logica senza alcun id di navigazione coinvolto) prima di considerare qualunque split strutturale del JSX.

**Nuovo `src/hooks/useCloudBackupProviders.ts`**: isola tutto lo stato e la logica della sezione Cloud Backup (fetch, salvataggio, login/logout OAuth, polling, avvio backup/ripristino) — nessun `id`/`neighbors`/`sequentialChain` coinvolto, solo dati. Stessa identica API restituita (stessi nomi) di prima dell'estrazione, per un cambiamento minimo nel chiamante. Il JSX che usa questi valori resta invariato in `App.tsx`.

`App.tsx` passa da 8.946 a 8.860 righe. Verificato che l'estrazione non abbia toccato la navigazione in due modi: `tsc --noEmit` (comportamento identico, stessi tipi) e `scripts/check-focus-ids.cjs` (stesso numero di id/riferimenti/catene rilevati, zero riferimenti a id inesistenti — solo i numeri di riga shiftati per la naturale riduzione).

### Verifica

`tsc --noEmit`: **18 errori pre-esistenti, invariati, zero nuovi**. `check-focus-ids.cjs`: nessuna differenza rilevata nella struttura di navigazione.

## v1.5.11-dev.1 — secondo passo di modularizzazione: hook useNotifications

Secondo hook estratto da `App.tsx`, stesso approccio a basso rischio di `useCloudBackupProviders` (v1.5.10-dev.1).

**Nuovo `src/hooks/useNotifications.ts`**: isola stato e logica del pannello Notifiche — fetch iniziale delle notifiche pendenti al boot, `pushNotification`/`dismissNotification`/`resolveNotification`, conteggio non lette. Stessa identica API restituita di prima.

**Decisione deliberata di scope**: il canale eventi in tempo reale (`EventSource('/api/events')`) **resta in `App.tsx`** — gestisce anche altri tipi di evento (es. `library-updated`) non legati alle notifiche, quindi non era un'estrazione a rischio pressoché nullo come il resto. Il suo ramo `event === 'notification'` continua a chiamare `setNotifications`, esposto dall'hook proprio per questo motivo (stesso principio già usato per `setCloudBackupProviders` nel hook precedente — il chiamante esterno che tocca direttamente il setter grezzo).

`App.tsx` passa da 8.860 a 8.735 righe. Verificato con lo stesso doppio controllo del giro precedente.

### Verifica

`tsc --noEmit`: **18 errori pre-esistenti, invariati, zero nuovi**. `check-focus-ids.cjs`: nessuna differenza nella struttura di navigazione (stesso numero di id/riferimenti/catene, zero dangling).

## v1.5.12-dev.1 — terzo passo di modularizzazione: hook useAiAdvisorProviders (con deviazione di piano documentata)

**Deviazione dal piano originale**: il prossimo candidato previsto era `useDownloadTasks()`. Investigandolo, trovato che `downloads` è intrecciato con `logs` in un **unico polling condiviso** (`fetchStatus`, che aggiorna entrambi in un solo giro), e le sue azioni (avvia/annulla/pausa/riprendi) sono chiamate `fetch` dirette dentro la JSX, non funzioni dedicate come per le notifiche — estrarlo avrebbe richiesto toccare il polling condiviso per un beneficio minimo (una riga di stato). Sostituito con `useAiAdvisorProviders()`, strutturalmente pulito e isolato quanto `useCloudBackupProviders`/`useNotifications` — stesso schema boot+refresh-on-settings-open, nessuna dipendenza da un polling condiviso con altri concetti.

**Nuovo `src/hooks/useAiAdvisorProviders.ts`**: isola stato e logica della tab AI Advisor — disponibilità/modelli Ollama, stato dei quattro provider cloud (Gemini/DeepSeek/ChatGPT/Claude), salvataggio/test/rimozione chiave API. Stessa identica API restituita di prima. Esposti anche `setActiveOllamaModel`/`setOllamaEnabled`/`setCloudProviderState` grezzi, oltre alle funzioni: la JSX in `App.tsx` li chiama direttamente in più punti (selezione modello, toggle provider, modifica budget) — stesso principio già usato per `setCloudBackupProviders` nel primo hook.

`App.tsx` passa da 8.735 a 8.612 righe.

### Verifica

`tsc --noEmit`: **18 errori pre-esistenti, invariati, zero nuovi**. `check-focus-ids.cjs`: nessuna differenza nella struttura di navigazione.

## v1.5.13-dev.1 — quarto passo di modularizzazione: hook useInputDevices

Ultimo hook della lista originale di quattro candidati. Verificato prima di procedere (dato lo scarto di `useDownloadTasks()` nel giro precedente): a differenza di `downloads`, qui non c'è alcun polling condiviso — un solo effetto autonomo legato solo all'apertura della tab Input, pulito quanto gli altri tre.

**Nuovo `src/hooks/useInputDevices.ts`**: isola stato e logica della tab Input — dispositivi controller connessi, plugin di riconoscimento. Esposto anche `setInputPlugins` grezzo: la JSX in `App.tsx` lo chiama direttamente al toggle di un plugin, stesso principio già usato per gli altri setter grezzi esposti nei hook precedenti.

`App.tsx` passa da 8.612 a 8.609 righe (estrazione piccola, come atteso — meno codice da isolare rispetto agli altri tre).

**Nota sulla verifica**: il conteggio di `tsc --noEmit` resta a 18, ma con uno spostamento — lo stesso errore di tipo benigno già scoperto e confermato innocuo nell'audit di qualità del codice (il tipo dichiarato di `inputPlugins` include metodi mai chiamati sugli elementi effettivamente memorizzati) si è spostato da `App.tsx` al nuovo file, perché è lì che ora vive il codice che lo genera — non è un errore nuovo, solo la stessa segnalazione nella sua nuova posizione.

Con questo si conclude la lista originale dei quattro hook candidati (Cloud Backup, Notifiche, AI Advisor, Input Devices) — `App.tsx` è passato da 8.946 a 8.609 righe nel corso dei quattro passaggi, senza mai toccare un solo `id`/`neighbors`/`sequentialChain`.

### Verifica

`tsc --noEmit`: **18 errori totali, invariati** (uno spostato di file, vedi sopra — zero errori genuinamente nuovi). `check-focus-ids.cjs`: nessuna differenza nella struttura di navigazione.

## v1.5.14-dev.1 — quinto passo di modularizzazione: hook useStorePluginRegistry

Candidato aggiuntivo, notato durante l'estrazione di `useInputDevices()` e verificato a fondo prima di procedere: `pluginRegistry`/`loadPluginRegistry`/`pluginLoadError` (tab Plugin store — GOG/Epic/Amazon/ecc.) risultano altrettanto isolati e privi di polling condiviso, stessa forma pulita degli altri quattro hook già estratti.

**Nuovo `src/hooks/useStorePluginRegistry.ts`**: isola stato e logica del registro plugin store — caricamento al boot e ad ogni apertura della tab Plugin, gestione errore di caricamento. Esposto anche `setPluginRegistry` grezzo: la JSX in `App.tsx` lo chiama direttamente al toggle di un plugin, stesso principio degli altri hook. I punti che leggono soltanto `pluginRegistry` altrove nel file (es. il `useMemo` di `pluginStateMap`) restano invariati in `App.tsx`, riferendosi al valore esportato dall'hook.

`App.tsx` passa da 8.609 a 8.592 righe.

Con questo sono cinque gli hook estratti in totale: `useCloudBackupProviders`, `useNotifications`, `useAiAdvisorProviders`, `useInputDevices`, `useStorePluginRegistry` — `App.tsx` complessivamente da 8.946 a 8.592 righe, mai un `id`/`neighbors`/`sequentialChain` toccato in nessuno dei cinque passaggi.

### Verifica

`tsc --noEmit`: **18 errori pre-esistenti, invariati, zero nuovi**. `check-focus-ids.cjs`: nessuna differenza nella struttura di navigazione.

## v1.5.14-Venus — MILESTONE STABILE

Congelata su richiesta esplicita dell'utente, quarta della serie Venus. Precede questa milestone `v1.5.7-Venus`.

### Nuovo strumento: analisi statica della navigazione (v1.5.8-dev.1, v1.5.9-dev.1)

`scripts/check-focus-ids.cjs` — analizza `App.tsx` ed estrae ogni `id` dichiarato su un `<Focusable>` e ogni riferimento in `neighbors={{...}}`/`sequentialChain`, segnalando riferimenti a id mai dichiarati (bug quasi certo) e catene dichiarate da un solo elemento (non possono incatenare nulla), riconoscendo il caso — verificato con un esempio reale durante lo sviluppo dello strumento stesso — in cui una dichiarazione dentro un `.map()` ha una cardinalità a runtime che il solo testo sorgente non può rivelare.

### Rimodulazione di App.tsx: cinque hook estratti (v1.5.10-dev.1 → v1.5.14-dev.1)

Primo passo concreto di modularizzazione, concordato con l'utente: **nessuno split del JSX** (il sistema di navigazione collega gli elementi tramite id testuali sparsi nel file, mai verificati dal compilatore — spezzare il JSX rischierebbe di romperli silenziosamente) — solo estrazione di **stato e logica pura**, senza alcun `id`/`neighbors`/`sequentialChain` coinvolto, in hook dedicati sotto `src/hooks/`:

- **`useCloudBackupProviders.ts`** — stato Cloud Backup, OAuth, polling
- **`useNotifications.ts`** — pannello Notifiche (il canale SSE resta deliberatamente in `App.tsx`: gestisce anche altri eventi non di notifica)
- **`useAiAdvisorProviders.ts`** — Ollama + i quattro provider cloud AI
- **`useInputDevices.ts`** — dispositivi controller connessi
- **`useStorePluginRegistry.ts`** — registro plugin store (GOG/Epic/Amazon/ecc.)

Un sesto candidato, `useDownloadTasks()`, è stato **scartato dopo investigazione**: `downloads` risultato intrecciato con `logs` in un unico polling condiviso — estrarlo avrebbe richiesto toccare quel meccanismo condiviso per un beneficio minimo (una riga di stato spostata).

**`App.tsx` è sceso da 8.946 a 8.592 righe** in cinque passaggi. Ogni singola estrazione è stata verificata con una procedura doppia, sempre nello stesso ordine: `tsc --noEmit` (zero errori nuovi — un solo errore benigno già noto si è spostato di file insieme al codice che lo genera, non è un errore nuovo) e `scripts/check-focus-ids.cjs` (stesso numero di id/riferimenti/catene, zero differenze nella struttura di navigazione).

### Architettura per gli sviluppi futuri, documentata in `X-Launcher-Roadmap.md`

Su richiesta esplicita dell'utente, i criteri usati per queste cinque estrazioni sono ora documentati come convenzione permanente (sezione "Architettura App.tsx: quando estrarre in `hooks/`"): quando una nuova funzione è un buon candidato per un hook dedicato (zero id di navigazione, nessun polling condiviso con un concetto scorrelato, setter grezzi esposti se il JSX li chiama direttamente), e la stessa procedura di verifica doppia da seguire ad ogni estrazione. Pensata per essere applicata direttamente ai prossimi sviluppi, non solo a questo giro, per non fare ricrescere `App.tsx` in modo incontrollato.

Nessun altro cambiamento di codice in questa voce oltre a quanto già elencato nelle build di sviluppo precedenti — solo il congelamento: `metadata.json` aggiornato, pacchetto ricreato per intero come `X-Launcher_v1_5_14-Venus.zip`, stesse esclusioni già usate per le milestone precedenti.

### Verifica

`tsc --noEmit`: **18 errori pre-esistenti, invariati, zero nuovi**. `check-focus-ids.cjs`: nessuna differenza nella struttura di navigazione. `metadata.json` validato. Zip verificato: `node_modules` assente, tutti i file chiave presenti (inclusi i cinque nuovi hook e lo script di verifica), versione corretta sia in `package.json` sia nel fallback letterale di `App.tsx`.

## v1.5.15-dev.1 — Step 19d, Fase 1 (parte 1): fondamenta backend per i launcher terzi condivisi

Primo passo concreto di Step 19d, dopo una sessione di studio architetturale approfondita con l'utente (modello a prefix condiviso invece di uno isolato per-gioco, verificato via ricerca reale sulla wiki di Heroic — Ubisoft Connect deve vivere nello stesso prefix dei giochi che lo richiedono, vincolo Wine/Proton reale non aggirabile con un symlink, idea scartata dall'utente dopo discussione). Runner sempre Proton/GE-Proton per tutti i launcher condivisi (mai Wine), scelta esplicita dell'utente per il supporto anticheat più versatile.

### Schema DB

- Nuova tabella `shared_launcher_prefixes` (`launcher_id` PK, `prefix_path`, `launcher_exe`, `bootstrapped_at`, `runner`) — un solo prefix per launcher, riusato da tutti i giochi che lo richiedono. Nessuna colonna `runner_family`: sarebbe sempre `'proton'`, solo rumore.
- Nuova colonna `games.requires_launcher` (nullable, impostata manualmente dall'utente nell'overlay — mai auto-rilevata, nessun modo affidabile di sapere in anticipo se un titolo la richiede prima di provarlo).

### Nuovi file

- **`src/backend/plugins/thirdPartyLaunchers.ts`** — registro dichiarativo `ThirdPartyLauncherDefinition[]`, nessuna logica per-launcher hardcoded. Solo Ubisoft Connect compilato sul serio (`verified: false` finché non testato con un bootstrap reale) — gli altri tre (EA App, Battle.net, Rockstar Games Launcher) restano placeholder, un launcher alla volta con verifica reale prima di scrivere codice, stesso principio già seguito per Amazon/nile (Step 19c). `installerUrl` per Ubisoft Connect verificato puntare alla pagina ufficiale (`ubisoft.com/en-us/ubisoft-connect/download`), **mai un `.exe` diretto**: la pagina reale triggera il download solo via JavaScript verso uno short-link non stabile.
- **`src/backend/sharedLauncherManager.ts`** — orchestrazione del prefix condiviso. Bug potenziale trovato e corretto prima che finisse in produzione, leggendo `ProtonRunner.launch()` reale: il path da passare come `config.prefix` dev'essere quello **base** (`STEAM_COMPAT_DATA_PATH`), mai già risolto con `/pfx` — passare quello sbagliato avrebbe causato un doppio annidamento silenzioso `.../pfx/pfx/`. Due funzioni distinte: `getSharedPrefixBasePath()` (per il lancio) e `resolveSharedPrefixExecutionPath()` (solo per risolvere percorsi assoluti da leggere, es. l'eseguibile del launcher). `openInstallerPage()` riusa lo stesso meccanismo Firefox/xdg-open già in `cloudBackup/googleDrive.ts`. `launchSharedLauncher()` riusa `ProtonRunner.launch()` reale con un oggetto `Game` minimale invece di duplicarne la logica di spawn/env.
- 5 nuovi endpoint in `server.ts`: `GET /api/shared-launchers`, `GET /api/shared-launchers/:id/runners` (filtrati a sole build Proton/GE-Proton via regex su `compatibilityManager.getAvailableRunners()` esistente — nessun secondo scanner), `POST .../open-installer-page`, `POST .../bootstrap`, `POST .../launch`.

### Decisioni prese durante lo studio (valide per gli altri 3 launcher quando affrontati)

- Selezione build Proton: l'utente sceglie liberamente fra quelle installate; default automatico solo se non ambiguo (Proton Steam se presente, altrimenti l'unica GE-Proton se ce n'è una sola, altrimenti scelta esplicita richiesta).
- Toggle EAC/BattlEye restano **per-gioco** anche con più titoli Ubisoft nello stesso prefix condiviso — le env var Proton sono lette per-invocazione al lancio, non stato persistito nel prefix, quindi nessun conflitto atteso fra giochi diversi nello stesso prefix (da confermare comunque su hardware reale in Fase 2).
- Lancio diretto stile `steam://rungameid` esiste (`uplay://launch/{id}/0`) ma **non è garantito** — un report reale mostra il lancio restare bloccato su "initializing" pur sembrando eseguire. Serve sempre un fallback esplicito (aprire il launcher stesso).
- Reference counting obbligatorio all'uninstall: un gioco condiviso non deve mai far rimuovere il prefix se altri giochi installati lo usano ancora.

### Verifica

`tsc --noEmit` eseguito realmente nel sandbox (npm install + build, non solo letto a vista): **zero errori nei file toccati/creati**. 26 errori totali riportati, tutti pre-esistenti altrove (App.tsx, compatibilityManager.ts, metadataManager.ts, useInputDevices.ts) — nota per sessioni future: il sandbox di verifica ha TypeScript 5.8.3 mentre `tsconfig.json` richiede 6.0 (`ignoreDeprecations`), quindi il numero 26 non è direttamente comparabile alla baseline reale di 18 su questo ambiente diverso, ma l'assenza di errori nuovi nei file toccati è confermata con certezza.

## v1.5.16-dev.1 — Step 19d, Fase 1 (parte 2): card Ubisoft Connect nella libreria

Seconda parte della Fase 1, sullo stesso principio già consolidato per la card "Steam Big Picture" — letta a fondo `FocusProvider.tsx` prima di scrivere, su richiesta esplicita dell'utente di riusare le stesse convenzioni di navigazione già stabilite invece di inventarne di nuove. Confermato leggendo il render reale della griglia: **nessuna card, nemmeno Steam Big Picture, ha `neighbors`/`fallbackPriority` espliciti** — tutto scoring geometrico puro su `grid-cols-4` — quindi la nuova card eredita lo stesso comportamento senza bisogno di alcun link esplicito, zero rischio di navigazione aggiunto.

### Aggiunto

- `UBISOFT_CONNECT_CARD_ID`, `makeUbisoftConnectCard()`/`appendThirdPartyLauncherCards()` in `App.tsx` — mirror esatto di `makeSteamBigPictureCard()`/`appendSteamBigPictureCard()`, con una differenza sostanziale: `isInstalled` riflette uno stato **reale** dal backend (`bootstrapped_at`, via `/api/shared-launchers`), non un valore sempre vero come per Steam Big Picture — la card fa quindi doppio servizio, installer guidato se non ancora bootstrappata, launcher vero e proprio se sì, esattamente come una qualunque altra card gioco (Installed/Not Installed reale), non un'eccezione a parte.
- **`src/hooks/useThirdPartyLaunchers.ts`** (nuovo file) — stesso stile esatto di `useStorePluginRegistry.ts`: stato dei launcher condivisi, `fetchAvailableRunners`, `openInstallerPage`, `bootstrapLauncher`, `launchThirdPartyLauncher`.
- `Game.thirdPartyLauncherCard` in `types.ts` — stesso principio di `isBigPictureLauncher`, generalizzato a un campo stringa (l'id del launcher) invece di un booleano dedicato per ciascuno dei 4 launcher futuri.
- `handlePlay`: lancia il launcher se già bootstrappato, apre solo la pagina ufficiale di download se no — **solo il primo passo**: l'overlay guidato di conferma bootstrap (selettore Proton/GE-Proton, conferma path eseguibile, chiamata a `bootstrapLauncher`) resta da progettare a parte, con lo stesso rigore su `activeGroup`/`focusFirstInGroup` già applicato a Manage Accounts/Game Options in passato — non abbozzato di fretta in questo giro.
- `openGameOptions`: stesso guard già in uso per Steam Big Picture — X/click destro esegue la stessa azione di Invio (nessun overlay di configurazione ancora costruito per questa card).
- Guard nella riconciliazione della selezione dopo un refresh libreria (`prev === UBISOFT_CONNECT_CARD_ID`), stesso principio già in uso per la card Big Picture — la card è virtuale, mai presente in `newGames`.

### Verifica

Doppia, stesso ordine di sempre: `node scripts/check-focus-ids.cjs` (89 id, 33 riferimenti `neighbors`, 6 catene `sequentialChain` — **zero riferimenti a id inesistenti**, gli 8 pattern dinamici non risolvibili staticamente sono gli stessi già noti da sessioni precedenti, nessuno nuovo) e `tsc --noEmit` (diff riga per riga col run precedente: solo uno spostamento di ~96 righe sugli stessi 26 errori pre-esistenti — stesso pattern "errore benigno spostato di posizione, non nuovo" già documentato in v1.5.13-dev.1).

---

**NOTA DI CORREZIONE (post v1.5.16-dev.1)**: l'architettura descritta nelle due voci sopra — una card virtuale mai persistita, mirror di Steam Big Picture — è stata **scartata** dopo discussione con l'utente. Ubisoft Connect non doveva essere una card sintetica ma un **gioco vero**, con una riga reale in `games`, trattato dalla pipeline standard di installazione/lancio/verifica senza eccezioni. Le voci sotto (v1.5.17-dev.1 in poi) descrivono l'architettura definitiva che ha sostituito questa. `UBISOFT_CONNECT_CARD_ID`, `makeUbisoftConnectCard`, `appendThirdPartyLauncherCards`, `handlePlay`/`openGameOptions` dedicati e il file `src/hooks/useThirdPartyLaunchers.ts` sono stati rimossi per intero da `App.tsx` nella correzione — non esistono più nel codice. Il lavoro backend di queste due voci (`db.ts`, `thirdPartyLaunchers.ts`, `sharedLauncherManager.ts`, i 5 endpoint `/api/shared-launchers`) **resta valido**, riusato dalla nuova architettura.

## v1.5.17-dev.1 — Step 19d: correzione architetturale — Ubisoft Connect come gioco vero

Ubisoft Connect (e ogni futuro launcher condiviso) è ora trattato **esattamente come un gioco**: una riga vera in `games`, seedata all'avvio del daemon, con una libreria/tab dedicata. A installa/lancia, X apre Game Options (Runner Bridge vincolato a sole build Proton/GE-Proton — mai Wine, scelta esplicita dell'utente per il supporto anticheat — + winetricks verb), stessa identica pipeline di installazione/verifica già in uso per GOG/Epic/Amazon, nessuna eccezione. Entra in Collection solo dopo l'installazione, come un titolo reale.

### Perché non più una card virtuale

Una card sintetica non ha overlay di configurazione, non si installa, non ha verb — Ubisoft Connect invece sì. Trattarlo come un gioco vero permette a **tutta** la pipeline esistente di funzionare senza modifiche: l'unica parte davvero speciale è che il "download" non chiama legendary/lgogdownloader/nile, cerca l'installer in `~/Downloads` e attende conferma manuale se non lo trova.

### Nuovi file

- **`src/backend/plugins/ubisoftConnectPlugin.ts`** — `UbisoftConnectPlugin extends StorePlugin`, stub sottile coerente con GOG/Epic/Amazon (`installGame()`/`uninstallGame()` non fanno nulla di reale — la vera pipeline vive in `downloadManager.ts`, **verificato leggendo il codice reale dei tre plugin esistenti** prima di scrivere questo). `ensureSeeded()` crea la riga `games` (id stabile `ubisoft-connect-launcher`) se assente, riusando lo stesso principio "insert once, protect on conflict" già in `db.ts`. Runner di default risolto dinamicamente da `compatibilityManager.getAvailableRunners()` invece di un segnaposto fisso (bug trovato più tardi in questa stessa saga — vedi v1.5.18-dev.1).
- **`src/backend/filePicker.ts`** — `browseForFile()`, un solo punto di innesto per "Sfoglia": prova `zenity` poi `kdialog` poi fallback a campo testo. Sintassi di entrambi verificata via ricerca reale prima di scrivere (`zenity --file-selection`, stdout=path, exit 0/1/5; `kdialog --getopenfilename`, argomenti posizionali). Pensato esplicitamente per essere sostituito in futuro da un file browser interno controller-navigabile (idea annotata in roadmap, non costruita ora) senza toccare i chiamanti.

### Scoperta: `battlenetPlugin.ts` esisteva già

Placeholder vuoto ("TODO Step 8" nel commento), `getLibrary()` ritorna `[]`, mai un'implementazione reale — spiega perché "Battle.net" appariva già come 6° store nel bug di navigazione di Cloud Backup (v1.1.124). Usato come modello di riferimento per lo shape minimo di `UbisoftConnectPlugin`.

### `downloadManager.ts`

- `findMainExe` esportata (riusata da `gameManager.ts`, non duplicata).
- Nuova `findInstallerInDownloads()` — euristica su nome file (`*ubisoft*`/`*uplay*` in `~/Downloads`), **non verificata su un download reale**, segnata esplicitamente come da confermare.
- `runUbisoftConnect(task)` — stesso schema di `runGOG`/`runEpic`: Step 1 (creazione prefix condivisa via `resolveRunnerWineEnv`+`prepareWinePrefix`), Step 2 (applicazione winetricks verb), Step 3 (ricerca installer). Se non trovato: fase `awaiting_installer`, altrimenti l'installer diventa l'`executablePath` temporaneo del "gioco" — il primo lancio lo esegue, e un hook post-chiusura (vedi `gameManager.ts` sotto) ri-risolve l'eseguibile vero.
- `continueInstaller(gameId)`/`browseInstaller(gameId)` — richiamati dagli endpoint sotto.
- `prefixPath` per `store === 'Ubisoft'` ora punta a `getSharedPrefixBasePath('ubisoft-connect')` invece che a un prefix isolato per-gioco (unico punto di override in `addTask`).

### `gameManager.ts`

- `UbisoftConnectPlugin` registrato nell'array plugin.
- Nuovo hook in `startGameExitPolling`: se il gioco chiuso è Ubisoft Connect stesso e non ancora bootstrappato, cerca il vero eseguibile dentro il prefix condiviso e chiama `markLauncherBootstrapped()`.

### `server.ts`

- 2 nuovi endpoint: `POST /api/downloads/installer-continue`, `POST /api/downloads/installer-browse` — stesso stile degli altri endpoint `/api/downloads` esistenti (`gameId` nel body, non come path param).

### `App.tsx` — switch "Launcher condiviso"

Per i giochi **normali** che dipendono da un launcher condiviso: switch ciclabile multi-stato in Game Options, stesso pattern del selettore MangoHud (0/1/2), qui N+1 stati (Nessuno + un launcher per ciascuno costruito, identificati per id-stringa non indice — aggiungere un launcher futuro non richiede rinumerare nulla). Vincola anche il Runner Bridge a sole build Proton per quel titolo. Fuso come 6° tile **dentro** la stessa griglia del Compatibility Layer (accanto a BattlEye, sotto EasyAntiCheat) invece di restare un blocco separato sotto — stessa dimensione degli altri 5, chevron al posto del pill on/off dato che gli stati sono più di due.

Card in Manage Accounts + toggle in Plugins: **zero codice di rendering nuovo necessario** — entrambe le sezioni erano già generiche (iterano su `stores`/`pluginRegistry`), serviva solo aggiungere `'Ubisoft'` alle liste `NO_LOGIN_STORES` già usate per Battle.net/Classic Console (5 punti nel codice) per evitare che mostrasse pulsanti Connetti/Disconnetti privi di senso.

### Traduzioni

`gameOptions.json` (`sharedLauncher`/`sharedLauncherDesc`/`sharedLauncherNone`), `dashboard.json` (`storePluginNames.Ubisoft`), `settings.json` (`storePluginDescriptions.Ubisoft` — scoperta: le description dei plugin **sono** traducibili via `translateStorePluginDescription()`, non solo hardcoded come inizialmente assunto).

### `setup-linux.sh`

`zenity`/`kdialog` aggiunte come dipendenze **raccomandate** (mai installate automaticamente) nei tre blocchi distro.

### Verifica

`node scripts/check-focus-ids.cjs` e `tsc --noEmit` eseguiti dopo ogni singola modifica di questa voce, confrontati per differenza contro la baseline nota di 18 errori pre-esistenti — zero riferimenti di navigazione rotti, zero errori nuovi in ogni passaggio.

## v1.5.18-dev.1 — Step 19d: debug su hardware reale — 8 bug trovati e corretti, 1 problema aperto

Sessione di debug estesa con l'utente su hardware reale, dopo aver reso disponibile v1.5.17-dev.1. Elenco in ordine cronologico, tutti verificati con `tsc --noEmit`/`check-focus-ids.cjs` (zero regressioni ad ogni fix).

### Bug corretti

1. **Verb winetricks invisibili nell'overlay per Ubisoft Connect** — condizione `selectedGame.store === 'GOG Galaxy' || 'Epic Games' || 'Amazon Games'` non includeva `'Ubisoft'` in `App.tsx`. Corretto — e sparito una volta senza causa chiara durante la sessione, riapplicato una seconda volta con un ancoraggio testuale più solido.
2. **I verb non venivano mai applicati davvero** — `runUbisoftConnect` (prima versione) saltava del tutto creazione prefix e applicazione winetricks, andando dritto alla ricerca dell'installer. Riscritta con lo schema Step1/Step2/Step3 descritto in v1.5.17-dev.1.
3. **Fallback silenzioso al wine di sistema** — quando il runner di default (segnaposto, prima di essere risolto dinamicamente) non corrispondeva a nessuna build Proton reale installata, `resolveRunnerWineEnv` ripiegava silenziosamente su wine di sistema, violando "sempre Proton mai Wine" per i launcher condivisi. Aggiunto un blocco esplicito: se il fallback avviene, l'installazione si ferma con un errore chiaro invece di procedere.
4. **`findMainExe()` sull'intero `drive_c` prendeva un'utility di sistema Wine** invece del vero eseguibile installato (un `drive_c` completo contiene anche `windows/`, a differenza della cartella isolata di un singolo gioco per cui quella funzione era stata scritta). Creata `findInstalledLauncherExe()`, che prova prima l'hint dichiarato nel registro e poi restringe la ricerca a `Program Files*` soltanto.
5. **Notifica "Completato!" fuorviante** quando l'installer viene solo *trovato*, non ancora eseguito — soppressa specificamente per questo caso in `server.ts`. `isInstalled=true` resta comunque necessario e non va toccato: un tentativo di lasciarlo `false` in questo stato avrebbe rotto il meccanismo (verificato) per cui cliccare la card "già installata" è ciò che esegue davvero il setup.
6. **Pulsanti Continua/Sfoglia/Annulla fuori dal widget** nel pannello Download (3 pulsanti invece dei soliti 2, contenitore senza `flex-wrap`). Corretto.
7. **`/api/open-url` non esisteva** — il link nella UI lo chiamava, sarebbe fallito silenziosamente al primo click. Creato (stesso meccanismo firefox/xdg-open già in uso altrove).
8. **Wiring mancante fra lo switch "Launcher condiviso" e l'installazione reale** — trovato dall'utente installando un gioco Ubisoft comprato su Epic: `addTask()` guardava solo `store === 'Ubisoft'` per decidere il prefix, mai `game.requiresLauncher` sui giochi normali che lo dichiarano — legendary creava sempre una prefix isolata di default, ignorando la scatola condivisa. Corretto: qualunque gioco con `requiresLauncher` impostato ora usa la scatola condivisa di quel launcher, indipendentemente dallo store.

### Consolidamento richiesto dall'utente

Il flusso "installer non trovato" (link + Continua/Sfoglia/Annulla) inizialmente viveva in una notifica separata nella colonna Notifiche — l'utente ha chiarito che le notifiche di installazione vivono sempre nel pannello Download, non ha senso spezzare il processo su due colonne diverse. Rimosso interamente il percorso via `notificationEngine` per questo flusso specifico (tipo evento dedicato, wiring in `server.ts`, dispatcher lato frontend — diventato un no-op vuoto una volta tolti i suoi soli due scopi). Tutto consolidato nella riga del task nel pannello Download: link cliccabile, pulsante "Continua" al posto di "Pausa" per questa fase, nuovo pulsante "Sfoglia" dedicato.

### Problema aperto — Ubisoft Connect inaffidabile su Proton

Diagnosi approfondita con log reali forniti dall'utente:

- Il processo tracciato (`UbisoftConnect.exe`) lancia un processo figlio reale (`upc.exe` + `UplayService.exe` + diversi `UplayWebCore.exe`, conferma di un'interfaccia CEF/Chromium) e **poi esce da solo entro ~4 secondi per design** — non un crash. La soglia `QUICK_EXIT_THRESHOLD_MS=8000` in `gameManager.ts` trattava questo come fallimento sempre, saltando l'intero ramo di codice "successo" (compreso l'hook di correzione automatica dell'eseguibile). **Corretto**: prima di dichiarare fallimento, ora si verifica con `ps`/`pgrep` se esistono processi reali ancora vivi che matchano la cartella di installazione del gioco — se sì, il lancio è trattato come riuscito.
- Con questo fix, il **primo avvio funziona davvero**: l'utente ha completato login e navigazione dell'interfaccia.
- **Dal secondo avvio in poi (una volta che la cartella cache esiste), ritorna sempre una finestra bianca o nera**, riproducibile in modo consistente, indipendentemente dalle variabili d'ambiente provate (`WINEDLLOVERRIDES` su tutta la catena D3D/DXGI, `--no-sandbox --disable-gpu`, `PROTON_USE_WINED3D`, ecc.). Nessuna soluzione trovata finora. Da decidere con l'utente come procedere: continuare l'indagine, riconsiderare Wine invece di Proton per questa scatola condivisa (rinunciando al supporto EAC/BattlEye per i giochi che vi si appoggeranno), o mettere in pausa Ubisoft Connect specificamente mantenendo valida l'architettura generale.

### Verifica

`tsc --noEmit` e `node scripts/check-focus-ids.cjs` eseguiti dopo ogni singolo fix di questa voce — 18 errori pre-esistenti invariati in ogni passaggio, zero riferimenti di navigazione rotti.

## v1.5.19-dev.1 — Step 19d: verb Versione OS + fix didascalia widget Launcher condiviso

### Aggiunto — sezione "Versione OS" nell'overlay Dipendenze Wine

Verificato leggendo il sorgente reale di `winetricks` prima di scrivere codice: i verb `win10`/`win81`/`win7`/`vista`/`winxp` sono categorizzati come `settings` (non pacchetti installabili) — chiamano `w_set_winver`, impostano solo la versione di Windows dichiarata da Wine/Proton al programma in esecuzione. A differenza dei verb esistenti (cumulabili liberamente), una prefix ha una sola versione attiva alla volta: serviva quindi una sezione a scelta singola (radio), non altre checkbox nella stessa checklist multi-selezione.

- **`src/wineVerbs.ts`**: nuovo export `OS_VERSION_VERBS`, incluso in `ALL_KNOWN_WINE_VERBS` per il filtro-rumore di `list-installed`.
- **`App.tsx`**: nuova sezione "Versione OS" nell'overlay Dipendenze Wine, sotto la checklist esistente (visibile solo a vista espansa, come `dotnet35`) — selezionarne una deseleziona automaticamente l'eventuale precedente. **Bloccata/oscurata** per i giochi con `requiresLauncher` impostato: la versione OS di una prefix condivisa (es. Ubisoft Connect richiede `win10`) non può essere cambiata dal singolo gioco che vi si appoggia, romperebbe il launcher stesso e ogni altro titolo nella stessa scatola — stesso principio già applicato al vincolo Runner Bridge per questi titoli.
- **`gameManager.ts`**: la riconciliazione da `winetricks list-installed` teneva già conto dei verb applicati manualmente da terminale — trovato un dettaglio verificando il sorgente: `winetricks.log` è un log **cumulativo** (solo append), quindi se in passato sono stati applicati sia `win10` sia `win7` manualmente, compaiono entrambi nell'output anche se solo l'ultimo è realmente attivo nel registro. La riconciliazione ora tiene solo l'ultima occorrenza cronologica fra i verb versione OS, sia nella nuova rilevazione sia nel merge con il profilo già salvato.

### Corretto — didascalia widget "Launcher condiviso"

Segnalato dall'utente: "Prefix Proton condivisa richiesta da questo titolo" era troppo verbosa. Sostituita con "Prefix condivisa" (`gameOptions:sharedLauncherDesc`, it+en) — il nome del launcher scelto (Nessuno/Ubisoft Connect/ecc.) resta visibile accanto come già era.

### Verifica

`tsc --noEmit` e `node scripts/check-focus-ids.cjs` — 18 errori pre-esistenti invariati, zero riferimenti di navigazione rotti (94 id dichiarati, +1 coerente con il nuovo pattern `os-version-*`).

---

## Diario di sessione (post v1.5.19-dev.1) — indagine completa sul lancio di Ubisoft Connect via Proton

**Nessun codice consegnato in questa sessione** — puro lavoro diagnostico, chiuso con una decisione architetturale concordata da implementare nella prossima sessione. Documentato qui per intero perché il percorso per arrivarci è stato lungo e non va perso.

### Il problema di partenza

Ubisoft Connect si installa e configura correttamente (prefix condivisa, verb winetricks, versione OS — tutto quanto costruito in v1.5.17/18/19). Al lancio dalla Dashboard, però: funziona al primo avvio (login e navigazione riusciti), ma dal secondo avvio in poi mostra sempre una finestra completamente nera o bianca, in modo riproducibile al 100%.

### Percorso di eliminazione (tutto verificato con dati reali, non ipotesi)

1. **Variabili d'ambiente**: provate sistematicamente `WINEDLLOVERRIDES` (da `d3d9=b` fino alla catena estesa `d3d9/d3d10core/d3d11/dxgi=b`), `PROTON_NO_ESYNC`/`PROTON_NO_FSYNC`, `PROTON_USE_WINED3D`, con e senza `--no-sandbox --disable-gpu`. Nessuna combinazione ha risolto il problema.
2. **Wine puro invece di Proton**: stesso identico fallimento al secondo avvio. Questo ha escluso Proton/DXVK/VKD3D come causa — non è mai stato un problema del runner.
3. **Log del launcher stesso** (non di Proton): rivelato un errore reale — `GameCatalogExtensionRegistration.cpp`, errore 5 (`ERROR_ACCESS_DENIED`). Confermato con una fonte esterna indipendente (bug report del progetto Whisky/Wine per macOS, stesso identico sintomo): Ubisoft Connect tenta di registrare voci "GCE" in un ramo di registro (`AppCompatFlags\Compatibility Assistant`) che Wine non implementa del tutto — un limite Wine noto, non risolvibile da X-Launcher, nessun workaround documentato trovato.
4. **Log diagnostico Proton (`PROTON_LOG`)**: verificato nel sorgente reale dello script `proton` che senza la variabile `SteamGameId` impostata non scrive **alcun** file — non un nome strano, nessuna scrittura affatto. Consegnato uno script bash diagnostico esterno (`launch-ubisoft-connect-debug.sh`, non parte del progetto) con `SteamGameId` fittizio per farlo scrivere davvero.
5. **Confronto diretto fra un log funzionante (Ubisoft Connect lanciato da Steam come app non-Steam) e uno rotto (stesso identico lancio dalla Dashboard)**: driver grafici/Vulkan/OpenGL identici in entrambi. Trovata un'eccezione non gestita specifica in **Xalia** — un tool di Valve stesso incluso in Proton (ponte di accessibilità/gamepad per app non native), non parte di Ubisoft Connect. Confermato con fonti esterne che Valve ha già dovuto correggere Xalia per conflitti identici con **altri** launcher terzi (EA App, Rockstar Launcher).
6. **Fix Xalia verificato**: `PROTON_USE_XALIA=0` (verificato nel sorgente reale di Proton) elimina davvero l'eccezione — ma la finestra resta nera lo stesso. Bug reale trovato e corretto, ma non la causa del sintomo principale.
7. **La differenza strutturale trovata confrontando le intestazioni dei due log**: solo il lancio via Steam mostra le righe `depot`/`pressure-vessel`/`steamrt4` — Steam avvolge **ogni** lancio Proton (anche per app non-Steam) in un proprio container (Steam Linux Runtime), che il nostro `proton run` diretto bypassa del tutto.
8. **Esperimento decisivo**: l'utente ha lanciato l'installazione di Ubisoft Connect **che funziona perfettamente da Steam** usando invece lo script diagnostico (bypass del container) — stessa finestra nera. Prova definitiva: non è mai stato un problema di Ubisoft Connect, cache, o versione — è **richiedere il container Steam Linux Runtime per renderizzare correttamente**, un requisito architetturale, non un dettaglio di configurazione.

### La soluzione trovata e concordata

**`umu-launcher`** (comando `umu-run`) — stesso strumento usato da Lutris/Heroic/Bottles sotto il cofano, creato dal team Open Wine Components (lo stesso di GE-Proton). Replica esattamente il container Steam Linux Runtime **senza richiedere Steam in esecuzione**, gestendo lui il download/aggiornamento del runtime necessario. Pacchettizzato ufficialmente per Arch (`sudo pacman -S umu-launcher`, repository multilib, nessuna compilazione).

Invocazione: `WINEPREFIX=<prefix> PROTONPATH=<build proton> GAMEID=<id> PROTON_VERB=waitforexitandrun umu-run <exe> [args]` — stesso verbo (`waitforexitandrun`) che Steam userebbe davvero.

**Chiarito**: "UMU-Proton" (visto tra i runner già installati, probabilmente via Lutris) è una **build di Proton** diversa da `umu-run` (lo strumento di invocazione) — le due cose sono indipendenti, qualunque build Proton/GE-Proton può essere usata come `PROTONPATH` con `umu-run`.

### Piano concordato per la prossima sessione (NON ancora implementato)

1. `setup-linux.sh`: `umu-launcher` come dipendenza **raccomandata** (mai auto-installata), stesso trattamento di zenity/kdialog/Lutris
2. **Scope volutamente limitato**: `umu-run` usato **solo per il flusso dei launcher condivisi** (Ubisoft Connect e futuri) — non per tutti i lanci Proton in generale, per non rischiare regressioni sui giochi normali che oggi funzionano già col meccanismo diretto
3. **Fallback esplicito**: se `umu-run` non è installato, ripiegare sul `proton run` diretto attuale con un avviso chiaro, non bloccare l'uso di Ubisoft Connect per chi non vuole aggiungere la dipendenza
4. Verificare (nuovo test reale, non assunto) che questo risolva davvero la finestra nera prima di considerare il problema chiuso

### Idea proposta dall'utente per dopo (NON ancora progettata nei dettagli, esplicitamente rimandata a dopo la verifica del fix umu-launcher)

Rilevamento automatico di launcher condivisi **già installati altrove** (es. Ubisoft Connect aggiunto a Steam come "app non-Steam", o scaricato come dipendenza di un gioco Ubisoft comprato su Steam) — se trovato, la Dashboard lo esporrebbe subito come "installato" nella propria libreria/tab dedicata (stessa card di oggi), condiviso dai giochi che lo richiedono, riusando `~/.local/share/x-launcher/shared-launchers/<id>/prefix` come **link simbolico** verso la prefix reale trovata altrove invece che una prefix propria. Tecnicamente valido (sia il meccanismo attuale sia `umu-run` seguono i link simbolici senza logica speciale), ma con due complessità reali non banali da affrontare quando ci si arriva: (a) il rilevamento richiede leggere `shortcuts.vdf` di Steam (formato binario proprietario) o scansionare le cartelle `compatdata/*/pfx/`, e il caso "dipendenza di un gioco Steam" spesso finisce dentro la prefix del gioco stesso, non in una separata; (b) un link simbolico penzolante (l'utente disinstalla l'app/gioco originale altrove) va rilevato esplicitamente, altrimenti la card resterebbe rotta silenziosamente. Da riprendere con lo stesso rigore di verifica-prima-di-scrivere-codice quando si arriva a questo punto.


