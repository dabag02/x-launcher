# X-Launcher — Changelog (parte 3)

Continua da **`CHANGELOG-2.md`**, che copre lo sviluppo dalla milestone v1.5.20-Venus fino a **v2.0.40-Mercury** (10 agosto) inclusa — che a sua volta continua da **`CHANGELOG.md`** (tutto lo sviluppo fino a v1.5.20-Venus). Prima di implementare qualcosa che assomigli a una funzione già discussa, vale la pena rileggere quei due file per non reinventare un meccanismo che potrebbe già esistere — in particolare:

- **Launcher condiviso — architettura completa e verificata su DUE giochi reali** (`CHANGELOG-2.md`, saga Assassin's Creed Syndicate, e `CHANGELOG.md`, Step 19d/Watch Dogs 2): esistono **due strategie di lancio generiche**, scelte tramite lo switch "Bypass store" nell'overlay del gioco — leggero (si aggancia alla sessione Wine già attiva del launcher condiviso) e container pieno (il gioco avvia la propria sessione e si tira dietro il launcher condiviso come processo figlio). Nessuna delle due è "quella giusta" in assoluto: dipende da come è fatto l'eseguibile del gioco specifico, va verificato caso per caso — mai un'assunzione valida per tutti i launcher condivisi futuri (EA App, Battle.net, Rockstar).
- **Eredità obbligatoria runner/prefix/Umu-launcher dal launcher condiviso** verso ogni gioco che ne dipende — mai un valore letto dal profilo del gioco stesso per queste tre impostazioni.
- **Diagnostica**: ogni percorso di lancio ora scrive un log reale (`gameLaunchLogPath`) con `WINEDEBUG=err+all,+seh` per il percorso leggero — errori reali e tracce di eccezioni strutturate senza il rumore di un debug completo. Xalia disattivato di default (`PROTON_USE_XALIA=0`) per ogni lancio Proton.
- **Sistema di notifiche azionabili**, **pattern di blocco/eredità nell'overlay Game Options** (nascondere le alternative quando ereditate, mai lasciarle selezionabili senza effetto) — convenzioni ormai consolidate, riusabili per qualunque nuova opzione dipendente da un'altra.
- **`launch-debug.sh`** (script diagnostico esterno, non versionato) supporta `--mode direct|umu|shared` — replica fedelmente ciascuno dei percorsi di lancio reali della Dashboard per isolare un problema fuori dal demone, prima di ipotizzare nel codice.

---

## (le prossime voci di sviluppo continuano da qui sotto)

---


## v2.0.41-dev.1 — File manager integrato anche su Executable Path

**Obiettivo**: correggere l'exe rilevato dal processo di installazione (quando sbagliato) senza uscire dall'overlay Game Options, riusando il file manager nativo già esistente per la selezione installer.

**Generalizzazione file manager (App.tsx)** — `fileBrowserContext` esteso con `purpose: 'installer' | 'executable'` (era solo installer). `openFileBrowser()` accetta ora uno `startPath` opzionale: per `executable` calcola SEMPRE la cartella di partenza dal path già scritto nel campo in editing (`activeField.value`, dirname a stringhe — path sempre assoluti per questo campo), mai da Download/Home come per l'installer; se il campo è vuoto/non assoluto, fallback sul comportamento esistente. Nuova funzione `openExecutableFileBrowser()` — deve vivere DOPO la dichiarazione di `selectedGame` (stessa categoria di errore TS2448 già documentata altrove nel file: un primo tentativo di posizionarla subito dopo `confirmFileBrowserSelection`, PRIMA di `selectedGame`, ha effettivamente prodotto l'errore, trovato da `tsc` e corretto spostando il blocco). Selezionare un file per `purpose: 'executable'` aggiorna solo `activeField.value` — nessun PATCH diretto, nessuna persistenza duplicata: il salvataggio resta quello già esistente alla chiusura della tastiera (`onCommit` di `openKeyboardForField` per `field-executablePath`), stesso identico percorso di una digitazione manuale. `closeFileBrowser()` ora branch per `purpose`: `executable` fa ricomparire la tastiera (`setShowKeyboard(true)` + `activeGroup='keyboard'`), `installer` invariato (torna a `'downloads'`).

**Tasto dedicato nella tastiera virtuale (VirtualKeyboard.tsx)** — nuova prop opzionale `onOpenFileManager`, stesso principio già usato per `topRowExternalUpId`: il componente resta generico, non deve sapere "perché" esiste un file manager. Tasto `key-filemanager` (icona `FolderOpen`, dimensione standard 44px come le frecce cursore) inserito tra freccia dx e Incolla, **solo quando la prop è passata** — per ogni altro campo (Launch Arguments, Custom Env, ricerca) il layout resta esattamente com'era, nessun tasto in più, nessuna barra spaziatrice ridotta. Quando presente, la barra spaziatrice si restringe da 294px a 244px (44px del nuovo tasto + 6px di gap in più) per non alterare il totale di riga di 594px già calcolato in v1.5.20-dev.9 (allineato allo span Z→@ del layout IT). `App.tsx` passa `onOpenFileManager` al componente solo quando `activeField?.id === 'field-executablePath'`.

**Verificato**: `tsc --noEmit` — 8 errori, tutti identici alla baseline nota (stesso file/riga logica/tipo), zero nuovi. `check-focus-ids.cjs` — 103 id invariati, stesso falso positivo noto `key-sugg-0` (lo script analizza solo `App.tsx`; i nuovi id in `VirtualKeyboard.tsx` restano gestiti dalla sua `buildNeighborMap` interna, generica per costruzione).

**FIX (segnalato dall'utente dopo prima consegna)**: il file manager si apriva correttamente ma DIETRO l'overlay Game Options invece che in primo piano. Causa: `z-[95]` era stato calibrato solo per il chiamante originario (sopra il pannello Download, `z-50`) — con `purpose: 'executable'` l'overlay Game Options resta aperto sotto, ma a `z-[150]`, più alto del file manager. Corretto a `z-[160]` — sopra Game Options, sotto la tastiera virtuale (`z-[200]`, comunque nascosta mentre questo overlay è aperto). `tsc` riverificato — 8 invariato.

**FIX #2 (segnalato dall'utente dopo il fix precedente)**: overlay in primo piano correttamente, ma navigazione E selezione (anche mouse/touch) impossibili fra gli elementi. Causa reale, diversa dallo z-index: `openFileBrowser` non ha MAI impostato `activeGroup('file-browser')` né chiamato `focusFirstInGroup` — mancava il pattern che ogni altro overlay del progetto segue (vedi `openGameOptions`: `setShowX(true)` + `setActiveGroup('x')` + `focusFirstInGroup('x')` via `setTimeout`). `moveFocus` in FocusProvider naviga solo nel pool di `activeGroup ?? 'dashboard'`, e lo stesso `activeGroup` gate blocca anche i click diretti sui `Focusable` (`if (activeGroup && group !== activeGroup) return;`) — spiega perché non funzionava neppure il click. **Bug preesistente anche per `purpose: 'installer'`** (mai notato prima: richiede controller + stato `awaiting_installer` insieme, combinazione stretta mai esercitata) — fix applicato nel punto unico condiviso da entrambi i chiamanti. `tsc` riverificato — 8 invariato. `check-focus-ids.cjs` — 103 id invariati, stesso falso positivo noto.

**FIX #3 v2.0.41-dev.2 (segnalato dall'utente dopo il fix #2)**: barra grigio scura che lampeggia in basso ad ogni input di navigazione fra pulsanti header e lista file. Stessa causa già documentata e corretta altrove nel progetto (v1.1.4/v1.1.7, box scrollabile della tab Impostazioni) — il contenitore della lista (`flex-1 overflow-y-auto`) era senza `min-h-0`: un figlio flex con overflow-y-auto ma senza questo vincolo non si comprime mai sotto l'altezza del proprio contenuto, cresce oltre lo spazio disponibile del genitore (il `motion.div` `absolute inset-0` dell'overlay) e il colore piatto del fondo sotto traspare per un frame ad ogni scroll manuale innescato da FocusProvider al cambio di focus. `min-h-0` aggiunto al contenitore della lista, identico al fix già in uso per Impostazioni. `tsc` riverificato — 8 invariato. `check-focus-ids.cjs` — 103 id invariati.

**FIX #4 v2.0.41-dev.3 (segnalato dall'utente: il problema persisteva durante lo SCROLL della lista, non solo al passaggio focus header↔lista)**: causa reale diversa dal fix #3 — il contenitore della lista usava `overflow-x-visible` insieme a `overflow-y-auto`. Per spec CSS, il browser promuove silenziosamente `visible` ad `auto` sull'altro asse quando non è `visible` su entrambi — quindi l'overlay aveva di fatto una scrollbar orizzontale attiva. `.custom-scrollbar` (index.css) stila solo `width` (lo spessore della scrollbar VERTICALE), quindi quella orizzontale risultante era nativa, non stilizzata (grigia), e appariva/scompariva a ogni ricalcolo di scroll — esattamente la barra riportata. **Stesso identico bug già diagnosticato e corretto una volta nel pannello notifiche** (CHANGELOG.md, sezione "Polish interfaccia": *"overflow-y-auto senza overflow-x-hidden esplicito eredita auto sull'altro asse"*). Fix: `overflow-x-visible` → `overflow-x-hidden`, stesso pattern già in uso per il pannello notifiche e il pannello Download. Durante la stesura di questo fix un primo tentativo ha introdotto per errore un commento JSX mal posizionato dentro un'espressione ternaria (12 errori tsc, mai consegnato) — trovato e corretto nello stesso turno. `tsc` riverificato — 8 invariato. `check-focus-ids.cjs` — 103 id invariati.

**CONFERMATO DALL'UTENTE su hardware reale**: tutti e 4 i bug del file manager per Executable Path risolti end-to-end.

---

## v2.0.41-dev.4 — Libreria nativa Ubisoft Connect (Watch Dogs 2 comprato/installato direttamente lì, non solo riscattato)

**Problema identificato dall'utente**: fino a questo punto Ubisoft Connect era usato SOLO come autenticatore per giochi comprati altrove (Assassin's Creed Syndicate/Epic). Ma un gioco può essere posseduto e installato DIRETTAMENTE su Ubisoft Connect (Watch Dogs 2, nel caso reale dell'utente) — quel caso era del tutto invisibile: `UbisoftConnectPlugin.getLibrary()` restituiva solo la card del launcher stesso, mai la sua libreria interna.

**Verifica prima di scrivere codice** (mai assunta): formato reale del registro Wine dentro il prefix condiviso Ubisoft Connect ispezionato a mano dall'utente su hardware reale PRIMA di scrivere qualunque riga di parser. Confermate due chiavi utili in `system.reg`: `Software\[Wow6432Node\]Ubisoft\Launcher\Installs\<productId>` (→ `InstallDir`, l'equivalente Ubisoft dei file `.acf` di Steam) e le voci standard Windows `...\Uninstall\<subkey>` (→ `DisplayName` + `UninstallString` contenente `uplay://uninstall/<productId>`, l'unico modo per risalire dal nome leggibile all'id prodotto).

**Nuovo file `src/backend/wineRegistry.ts`**: parser generico per i file `.reg` di Wine (`parseWineReg`, `readWineReg`, `findKeysEndingWith`, `lastPathSegment`) — formato diverso dal parser VDF già esistente per Steam (steamPlugin.ts), scritto e **verificato con un fixture costruito sui dati reali incollati dall'utente** (non solo letto a occhio): unescape di backslash/virgolette confermato carattere per carattere prima di considerarlo corretto. Infrastruttura deliberatamente generica — riusabile in Fase B per qualunque altro launcher condiviso che tenga la propria libreria nel registro.

**`ubisoftConnectPlugin.ts` esteso**: `getLibrary()` ora, oltre alla card del launcher, scansiona `system.reg` (`scanInstalledUbisoftGames`) per i giochi REALMENTE installati — l'equivalente Ubisoft della scansione `.acf` di Steam. Per ciascun gioco rilevato, matching per titolo normalizzato (stessa identica normalizzazione già in uso in `findGameExeInSharedPrefix`/sharedLauncherManager.ts, duplicata deliberatamente — una riga, non vale un import) contro **tutte** le righe `games` esistenti di qualunque store:
- Match trovato E non ancora collegato (`requiresLauncher !== 'ubisoft-connect'`) → **mai un collegamento automatico** (deciso esplicitamente con l'utente: il rischio di un falso positivo su titoli quasi identici — remaster, sequel — ha un impatto reale, scrivere `requiresLauncher` sulla riga sbagliata). Notifica azionabile proposta (nuovo evento `shared-launcher-native-game-found` in `notificationEngine.ts`, pulsante "Collega" → riusa lo stesso endpoint PATCH `/api/games/:id/config` già usato da Runner Bridge in Game Options, un solo punto di scrittura per `requiresLauncher` sia manuale che da notifica).
- Match trovato E già collegato → nessuna azione, nessuna riga duplicata.
- Nessun match in nessun altro store → nuova riga propria `store: 'Ubisoft'` (stesso schema di Steam: una riga per gioco installato localmente), eseguibile risolto direttamente dentro l'`InstallDir` noto (niente ricerca alla cieca in tutto Program Files*, a differenza di `findGameExeInSharedPrefix`/`findInstalledLauncherExe` che invece cercano per nome perché non hanno un percorso già noto).

**Dedup persistente della notifica**: il dedup a 30s di `NotificationQueue` non basta (`refreshLibrary()` gira periodicamente in background) — controllo esplicito su `notificationEngine.getRecent(200)` per `source === 'shared-launcher-scan'` + `game_id` target: una volta emessa per un dato gioco, non si ripropone mai più (qualunque esito), l'utente può comunque collegare a mano da Runner Bridge in qualunque momento.

**Verificato**: parser testato con un fixture costruito sui dati reali del registro dell'utente (productId, DisplayName, InstallDir, conversione path Windows→Linux tutti confermati corretti). `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 103 id invariati. **NON ANCORA TESTATO end-to-end su hardware reale** (la scansione vera, il match con Watch Dogs 2/Epic esistente, e la notifica di collegamento non sono ancora stati eseguiti sul sistema dell'utente).

---

## v2.0.41-dev.5 — Diagnostica esplicita (il primo test reale sembrava "non fare nulla")

**Segnalato dall'utente**: dopo il primo refresh libreria su hardware reale, nessuna riga `[UBISOFT]` compariva mai nel log — "sembra che non stia accadendo nulla". Nessuna eccezione (avrebbe prodotto `[PLUGIN] Ubisoft Connect fallito: ...` nel log generico di gameManager.ts, mai vista), quindi lo scan non stava crashando.

**Causa reale del "silenzio"**: il percorso di successo più probabile in questo caso specifico — Watch Dogs 2 già collegato in precedenza tramite il meccanismo esistente (righe `[SYNC] Epic game desync fixed`/`trovato installato nel prefix condiviso`, che infatti compaiono regolarmente e funzionano) — era scritto per non fare NULLA quando il match cross-store risultava già collegato (`requiresLauncher === 'ubisoft-connect'`), correttamente per evitare di riproporre un'azione già completata. Ma quel ramo non loggava nulla: indistinguibile nei log da uno scan che non aveva trovato niente affatto (`system.reg` non letto, o parsing fallito silenziosamente in `readWineReg`, che ingoiava qualunque eccezione senza segnalarla). "1 titoli" per il plugin Ubisoft Connect era in realtà compatibile con ENTRAMBI gli scenari — impossibile distinguerli dai soli log esistenti.

**Fix — diagnostica sempre presente, indipendente dall'esito** (mai un'operazione silenziosa, stessa lezione già pagata più volte in questo progetto): `readWineReg` ora distingue esplicitamente "file non trovato" (`null`) da "file trovato ma parsing fallito" (`{ error }`, mai più ingoiato silenziosamente) — il chiamante logga entrambi i casi con un messaggio diverso. `scanInstalledUbisoftGames` logga sempre: quante chiavi lette da `system.reg`, quante chiavi `Installs` trovate, quanti giochi risolti con nome+percorso completi. Il ramo "già collegato, nessuna azione necessaria" ora logga esplicitamente invece di restare silenzioso, così come il ramo "match già proposto in precedenza, non ripropongo".

**Verificato**: `tsc --noEmit` — 8 invariato (un solo chiamante di `readWineReg`, firma aggiornata coerentemente). `check-focus-ids.cjs` — 103 id invariati. **Ancora da rifare il test su hardware reale** — questa volta il log dovrebbe dire con certezza in quale dei possibili stadi si trova lo scan.

**CONFERMATO DALL'UTENTE su hardware reale**: scan corretto — "34502 chiavi lette da system.reg", "2 chiavi Installs trovate, 2 giochi risolti" (Watch Dogs 2 E Assassin's Creed Syndicate, entrambi rilevati dallo scan generico), entrambi riconosciuti come già collegati alle rispettive righe Epic. v2.0.41-dev.4/dev.5 di fatto concluso.

---

## v2.0.41-dev.6 — I giochi linkati non comparivano nella scheda del launcher condiviso

**Segnalato dall'utente**: Watch Dogs 2 e Assassin's Creed Syndicate, pur essendo comprati su Epic e collegati correttamente a Ubisoft Connect (`requiresLauncher`), non comparivano come card quando si sfoglia la libreria filtrata su "Ubisoft" — solo la card del launcher stesso. Richiesta esplicita: mostrarli anche lì, come Steam mostra le proprie card, **senza** duplicare la riga nel DB (lo stesso principio già stabilito per lo scanner: un solo gioco, un solo posto dove vive per davvero).

**Causa**: `gameManager.getGames({ store })` filtrava con un confronto esatto (`g.store === query.store`) — un gioco il cui `store` nativo è `'Epic Games'` non passava mai il filtro `store=Ubisoft`, indipendentemente da `requiresLauncher`.

**Fix — generico, non specifico a Ubisoft Connect**: il filtro ora include anche i giochi il cui `requiresLauncher` punta al launcher condiviso associato allo store filtrato. La traduzione store↔launcherId riusa `getThirdPartyLauncherByStoreId` (già esistente in `thirdPartyLaunchers.ts`, già importata in `gameManager.ts` per altri scopi — nessun nuovo import) — stesso identico meccanismo varrà per EA App/Battle.net/Rockstar in Fase B senza scrivere altro codice, non appena avranno anche loro un `requiresLauncher` valorizzato su qualche gioco. Nessuna riga duplicata: è solo un punto d'accesso in più allo stesso gioco esistente, esattamente come richiesto.

**Registro aggiornato**: `thirdPartyLaunchers.ts`, voce Ubisoft Connect — `libraryReader: 'unknown' → 'registry'` e `verified: false → true` (bootstrap, lancio con entrambe le strategie, e ora anche lettura libreria interna, tutti confermati dall'utente su hardware reale).

**Verificato**: `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 103 id invariati. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.7 — Bugfix card "Steam Big Picture" (comportamento anomalo rispetto a tutte le altre)

**Segnalato dall'utente**, due problemi distinti prima di iniziare la Fase B:

**1) La card doveva rispondere solo ad A, come ogni altra card.** Causa trovata: `openGameOptions()` aveva un caso speciale (v0.99.32) che reindirizzava X/click destro alla stessa azione di A ("un solo significato per qualunque interazione, coerente con lo scopo della card") — esattamente il comportamento anomalo segnalato. Start/Select/dorsali non erano mai stati un problema in realtà (sono scorciatoie globali, indipendenti da quale card è a fuoco, per costruzione — nessuna card, compresa questa, li intercetta mai): solo X andava corretto. Fix: per questa card, X/click destro ora non fanno letteralmente nulla.

**2) Minimizzazione X-Launcher al lancio, ripristino al rientro.** Al lancio di un gioco vero, X-Launcher si minimizza già grazie al polling di `tray.py` su `/api/system/game-running` — ma Big Picture non passa da quel meccanismo (non è un processo lanciato da noi, `steam steam://open/bigpicture` si limita a segnalare a un client Steam eventualmente già in esecuzione). Aggiunto uno stato dedicato in `gameManager.ts` (`bigPictureActive`, deliberatamente SEPARATO da `lastLaunchedGame` — niente prompt di validazione/notifiche "did it work", pensati per un vero gioco tracciato da noi, qui fuori luogo), combinato con l'unico consumatore reale del booleano `running` (`tray.py`, che non usa `gameId`/`gameTitle` per la decisione hide/show). `POST /api/system/steam-bigpicture` ora marca `bigPictureActive=true` prima di lanciare Steam — X-Launcher si nasconde con lo stesso identico meccanismo già in uso per ogni gioco, nessun codice di hide/show duplicato.

Nuovo endpoint `POST /api/system/steam-bigpicture-closed`, pronto ma **non ancora collegato a nulla**: marca `bigPictureActive=false` (X-Launcher torna in primo piano tramite lo stesso polling) e minimizza best-effort la finestra ATTIVA al momento della chiamata (`wmctrl -r :ACTIVE: -b add,hidden`) — deliberatamente non per titolo/classe della finestra Steam, mai verificato quale sia esattamente in Big Picture; dato che l'endpoint viene per costruzione chiamato mentre Big Picture è ancora in primo piano, la finestra attiva in quel momento È Big Picture, senza bisogno di altre assunzioni. **Manca ancora il collegamento reale**: non è chiaro con quale meccanismo l'utente rientra a X-Launcher da dentro Big Picture (voce Non-Steam Game? script esterno?) — da chiarire prima di cablare la chiamata a questo endpoint.

**Verificato**: `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 103 id invariati. **Non ancora testato su hardware reale — punto 2 solo parzialmente completo (manca il trigger di rientro).**

---

## v2.0.41-dev.8 — Trigger di rientro da Big Picture completato

**Risposta dell'utente alla domanda lasciata aperta in dev.7**: X-Launcher è già registrato come Non-Steam Game dentro Steam — dettaglio confermato rileggendo `CHANGELOG.md` (Parte D, v0.99.34) e `scripts/setup-steam-shortcut.cjs`, non assunto. Verificato in quel file: lo shortcut scritto in `shortcuts.vdf` ha `Exe` = **`kiosk-launch.sh`** (default, se non passato un path diverso). Cliccare la card "X-Launcher" da dentro Big Picture riesegue quindi esattamente `kiosk-launch.sh` da capo — quello è il vero trigger di rientro, non un meccanismo nuovo da inventare.

**Problema aggiuntivo scoperto leggendo `kiosk-launch.sh`**: senza una modifica, quella riesecuzione avrebbe avviato una SECONDA istanza del browser (la finestra esistente è solo nascosta con `wmctrl -b add,hidden` da `tray.py`, mai chiusa) — comportamento sbagliato indipendentemente dalla richiesta specifica dell'utente.

**Fix**: nuovo controllo in testa a `kiosk-launch.sh`, PRIMA di qualunque rilevamento DE/browser. Se il daemon risulta già attivo E una finestra "X-Launcher HTPC" esiste già (via `wmctrl -l`, stesso comando già usato altrove nel file), questa non è una prima esecuzione — è un rientro: chiama `POST /api/system/steam-bigpicture-closed` (l'endpoint preparato in dev.7, ora collegato) e mostra la finestra esistente con `wmctrl -a "X-Launcher HTPC"` — lo stesso, identico comando già usato da `show_window()` in `tray.py`, non una nuova assunzione — poi esce, senza avviare alcun browser. Effetto collaterale positivo: questo controllo previene QUALUNQUE doppia istanza involontaria di `kiosk-launch.sh`, non solo il caso Big Picture.

**Verificato**: `bash -n kiosk-launch.sh` — sintassi corretta. `tsc --noEmit` — 8 invariato (solo un commento aggiornato in server.ts). `check-focus-ids.cjs` — 103 id invariati. **Non ancora testato su hardware reale — punto 2 ora completo nel codice, mai eseguito davvero.**

**CONFERMATO DALL'UTENTE su hardware reale (dopo aver corretto un link Steam sbagliato)**: lancio Big Picture dalla card → X-Launcher minimizzato correttamente. Segnalato però: il rientro (Steam Big Picture → X-Launcher) non libera l'input del controller — Big Picture resta in background e continua a intercettare gli stessi input della Dashboard in primo piano, nonostante la finestra fosse nascosta.

---

## v2.0.41-dev.9 — Rientro da Big Picture in due passi

**Causa probabile (ipotesi dell'utente, non ancora verificata)**: Big Picture Mode intercetta l'input del controller a un livello più basso della finestra in primo piano (Steam Input) — nasconderne solo la finestra (`wmctrl :ACTIVE: -b add,hidden`, v2.0.41-dev.8) non rilascia quell'hook.

**Fix — rientro in due passi**: `POST /api/system/steam-bigpicture-closed` ora prima chiama `steam steam://open/main` (protocollo Steam documentato da Valve per tornare alla modalità client desktop, **non** `steam://exit-bigpicture-mode`, che non risulta un protocollo Steam reale) per uscire davvero da Big Picture, poi — dopo un margine di 1200ms per la transizione (asincrona, l'UI di Steam impiega la sua parte di secondo a cambiare modalità) — nasconde la finestra del client desktop risultante con lo stesso trucco `:ACTIVE:` di prima.

**Non verificato**: se Steam Input continuasse a intercettare l'input anche in modalità client desktop (non solo in Big Picture), questo fix da solo non basterebbe — solo un nuovo test su hardware reale può confermarlo.

**Verificato**: `tsc --noEmit` — 8 invariato. **Da testare su hardware reale.**

**CONFERMATO PARZIALMENTE DALL'UTENTE**: le due chiamate lato server partono correttamente ("Return from Steam Big Picture requested." nel log). Segnalato però: schermo che lampeggia, Big Picture "sembra ridursi alla finestra di Steam" ma poi torna in primo piano — il passaggio a modalità client sembra avvenire, ma il tentativo di nasconderla fallisce o è troppo presto.

---

## v2.0.41-dev.10 — Polling per WM_CLASS invece di attesa fissa + `:ACTIVE:`

**Causa**: la transizione Big Picture→client desktop non ha una durata fissa prevedibile — l'attesa di 1200ms (dev.9) non è bastata nel test dell'utente, quindi `:ACTIVE:` puntava a una finestra transitoria (o a nulla di utile) invece che al vero client desktop, che è poi comparso DOPO senza nulla a nasconderlo.

**Fix**: sostituita l'attesa fissa con un **polling per `WM_CLASS`** (`wmctrl -lx`, non per timing): cerca ripetutamente, fino a 10 tentativi ogni 300ms (3s totali), una finestra la cui classe contenga "steam" — stabile indipendentemente da quanto impiega realmente la transizione — e la nasconde per id specifico (`wmctrl -i -r <id>`) appena la trova, invece dell'ambigua `:ACTIVE:` che dipende dal preciso istante in cui viene chiamata.

**Verificato**: `tsc --noEmit` — 8 invariato. **Da testare su hardware reale.**

**CONFERMATO DALL'UTENTE**: card Steam Big Picture completamente funzionante — solo A la lancia, minimizzazione X-Launcher al lancio, rientro pulito con Steam che torna in tray. Tutti e tre i punti chiusi.

---

## v2.0.41-dev.11 — Fase B: EA App (Fase A — bootstrap + lancio, come fu per Ubisoft Connect)

**Verificato prima di scrivere codice**: pagina ufficiale `ea.com/ea-app` ispezionata con `web_fetch` — link diretto (`<a href>` semplice, NON dietro un trigger JavaScript come Ubisoft Connect) verso `https://origin-a.akamaihd.net/EA-Desktop-Client-Download/installer-releases/EAappInstaller.exe`, confermato risolvere a `binary/octet-stream` senza redirect verso login/HTML. Stesso URL confermato anche da una seconda fonte indipendente (script di installazione del pacchetto Chocolatey "ea-app"). Cartella di installazione (`C:\Program Files\Electronic Arts\EA Desktop\EA Desktop`) confermata da un articolo ufficiale help.ea.com — il nome esatto dell'eseguibile dentro quella cartella NON è confermato da nessuna fonte, lasciato come hint (`EADesktop.exe`, ipotesi plausibile) dato che `findInstalledLauncherExe` fa comunque una ricerca reale, non dipende dal nome esatto per funzionare. `directLaunchUriTemplate` lasciato `null` — un URI (`origin2://game/launch?offerIds={id}`) circola in community ma mai verificato per questo progetto, non copiato per assunzione.

**Nuovo `src/backend/plugins/eaAppPlugin.ts`**: stessa architettura di `ubisoftConnectPlugin.ts` — card + bootstrap + lancio (Fase A soltanto, nessuna scansione della libreria interna: quella arriva solo dopo aver verificato il bootstrap su hardware reale, stesso ordine già seguito per Ubisoft Connect). Registrato in `gameManager.ts`.

**Nessuna modifica a `downloadManager.ts`**: la pipeline di installazione era già stata generalizzata durante la Fase A di Ubisoft Connect (`runThirdPartyLauncherInstall(task, def)`, guidata dal registro) — comparire in `thirdPartyLaunchers.ts` con lo `storeId` giusto è bastato.

**Punti sparsi nel frontend aggiornati per coerenza** (stessa lista di Ubisoft Connect, "noLogin" — nessun vero login via la nostra interfaccia, `isAuthenticated()` == bootstrappato): `NO_LOGIN_STORES` e `NO_LOGIN_STORES_HANDLEPLAY` in App.tsx, il calcolo del focus iniziale della tab Account, `NO_LOGIN_GRID_STORES` (navigazione D-pad nella griglia store, stesso bug già documentato in v1.1.125-dev.1 per Battle.net/Classic Console/Ubisoft), la sezione Winetricks Dependencies nell'overlay Game Options. In `server.ts`, generalizzato anche un controllo rimasto hardcoded a `'Ubisoft'` (`pendingSharedLauncher`, la notifica "Completato!" fuorviante quando in realtà è solo l'installer scaricato) — stesso principio già seguito altrove: un nuovo launcher non richiede più toccarlo.

**Verificato**: `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 103 id invariati. `esbuild server.ts` (stesso comando della build reale) — nessun errore di bundling. **Non ancora testato su hardware reale — nessun bootstrap EA App mai eseguito davvero.**

---

## v2.0.41-dev.12 — EA App: installer falliva con INST-14-1603

**Segnalato dall'utente**: prefix creata correttamente, ma l'installer EA App fallisce con `INST-14-1603` ("errore fatale generico").

**Causa** (verificata con web_search — codice errore ampiamente documentato, incluso un thread di supporto EA ufficiale per questo stesso codice e le guide di risoluzione help.ea.com): la causa più ricorrente è Visual C++ Redistributable mancanti o corrotti. Causa tecnica reale trovata nel codice: `def.requiredWinetricksVerbs` (dichiarato in `thirdPartyLaunchers.ts` per esattamente questo scopo) **non veniva mai letto** da `runThirdPartyLauncherInstall` — `task.winetricksVerbs` arriva dal frontend come array vuoto reale per un launcher appena seedato (non `undefined`), quindi il parametro di default di `addTask()` (`DEFAULT_WINETRICKS_VERBS`) non scattava mai. Bug generico della pipeline condivisa, non specifico a EA App — probabile che non fosse mai emerso perché Ubisoft Connect non aveva bisogno di alcun verb aggiuntivo.

**Fix**: `runThirdPartyLauncherInstall` ora usa `def.requiredWinetricksVerbs` come fallback SOLO quando l'utente non ha esplicitamente scelto nulla (`task.winetricksVerbs` vuoto) — una personalizzazione dall'overlay Winetricks Dependencies vince sempre, invariato. Corretta anche la persistenza (`persistWinetricksVerbs`) per salvare i verb realmente applicati, non l'elenco vuoto originale — altrimenti l'overlay avrebbe mostrato "nessuna dipendenza" anche dopo un'installazione che ne aveva applicate.

**`thirdPartyLaunchers.ts`**: EA App ora dichiara `requiredWinetricksVerbs: ['vcrun2022', 'corefonts']` — `vcrun2022` (superset, stessa scelta già in uso come default generico del progetto) e `corefonts` (baseline comune, stesso default). Deliberatamente NON copiati `dxvk`/`vkd3d`/`dotnet48`/mono/nine visti in un thread Arch Linux sull'installazione di EA App sotto Wine — quel thread riguardava un codice errore diverso (`INST-14-12157`) e l'autore non ha mai confermato quale verb risolvesse davvero il problema; aggiungerli sarebbe stata un'assunzione, non un dato verificato.

**Verificato**: `tsc --noEmit` — 8 invariato. `esbuild server.ts` — nessun errore di bundling. **Non ancora testato su hardware reale — nessuna conferma che questi verb risolvano davvero l'errore per EA App specificamente, solo la causa più corroborata dalle fonti consultate.**

---

## v2.0.41-dev.13 — EA App: bootstrap end-to-end CONFERMATO su hardware reale

**Riepilogo dell'intera saga di diagnosi** (tutta condotta senza mai modificare codice alla cieca — ogni causa trovata leggendo log reali o sorgenti verificabili):

1. **Timeout iniziale creazione prefix** (GE-Proton11-1) — non più riproposto nei test successivi, presumibilmente una lentezza del primo avvio, non un bug.
2. **INST-14-1603 durante l'installazione** — causa apparente (VC++ Redistributable mancanti, dev.12) insufficiente da sola. Causa reale trovata analizzando il log Proton riga per riga: la custom action .NET `JunoInitializeSession` dell'installer falliva. **Risolto** trovando gli script installer ufficiali Lutris per EA App (24080 utenti) e scoprendo l'argomento `EAX_LAUNCH_CLIENT=0` mai passato prima — aggiunto nei Launch Arguments dell'overlay, installazione completata.
3. **Splash "Connessione a EA App" bloccata dopo l'installazione** — causa trovata in un blog che analizza il sorgente Wine: `CreateSymbolicLinkW` (usata dall'installer EA per popolare la cartella "stabile" `EA Desktop/EA Desktop/` come collegamento verso quella versionata reale) è uno **stub vuoto in Wine**, ritorna sempre successo senza creare nulla. Fix manuale: copiato a mano il contenuto reale nella cartella stabile.
4. **Ancora bloccata su "Connessione a EA App"** dopo il fix #3 — causa trovata analizzando un log Proton da 47mila righe: `netprofm:list_manager_GetConnectivity` (Windows Network List Manager) in loop continuo senza mai una risposta — altro stub Wine, confermato con web_search essere lo stesso identico problema documentato per `Origin.exe` (predecessore di EA Desktop) su un bug tracker WineHQ, esistente da almeno il 2021.
5. **Risolto cambiando runner a GE-Proton11-3 con "Umu-launcher" attivo in Compatibility Layer** — stesso identico problema già affrontato e risolto una volta per Ubisoft Connect (container Steam Linux Runtime mancante, MILESTONE v1.5.20-Venus) — non un caso isolato di EA App, lo stesso limite strutturale. Login e interfaccia EA App **confermati funzionanti end-to-end**.

**`thirdPartyLaunchers.ts` aggiornato**: `verified: false → true`, commenti estesi con tutti i dettagli sopra per chi rileggerà questo codice in futuro — in particolare il caveat sulla cartella symlink (si romperà di nuovo a ogni aggiornamento di EA Desktop, non solo alla prima installazione, per lo stesso limite Wine).

**Non ancora automatizzato** (discusso con l'utente, da decidere se procedere): il fix manuale della cartella symlink dopo ogni installazione/aggiornamento di EA Desktop.

**Verificato**: `tsc --noEmit` — 8 invariato. **CONFERMATO END-TO-END DALL'UTENTE su hardware reale.**

---

## v2.0.41-dev.14 — Fix automatico della cartella symlink EA Desktop

**Richiesta utente**: automatizzare il fix manuale scoperto in dev.13 (copiare a mano il contenuto della cartella versionata in quella "stabile" dopo ogni installazione/aggiornamento di EA Desktop, dato che `CreateSymbolicLinkW` è uno stub vuoto in Wine e non crea mai il collegamento reale).

**`eaAppPlugin.ts`**: nuova `reconcileEADesktopSymlink()` — cerca cartelle versionate (`\d+\.\d+\.\d+\.\d+-\d+`, pattern verificato sul sistema reale dell'utente) dentro `Electronic Arts/EA Desktop/` che contengono davvero `EA Desktop/EADesktop.exe`, prende la più recente per ordine naturale della versione, e ne copia il contenuto nella cartella "stabile" (`cp` ricorsivo, mai una cancellazione — a differenza dello script di riferimento trovato online, che rimuove le cartelle versionate: qui deliberatamente più prudente, un fix best-effort non cancella mai nulla).

Integrata in `onLauncherProcessClosed()`, chiamata **a ogni chiusura** del processo (non solo al primo bootstrap) — copre sia la primissima installazione (gira subito dopo che l'installer si chiude, PRIMA della ricerca dell'eseguibile reale già esistente — ordine corretto, la cartella è già popolata quando si cerca l'exe) sia ogni futuro aggiornamento di EA Desktop, che romperà di nuovo il collegamento per lo stesso identico motivo.

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale — nessun aggiornamento EA Desktop ancora avvenuto per esercitare il ramo "post-bootstrap".**

---

## v2.0.41-dev.15 — Knowledge base proattiva per launcher condivisi

**Richiesta utente**: capitalizzare tutta l'esperienza accumulata durante le sagge di Ubisoft Connect ed EA App — quando l'utente segnala "Non ha funzionato" alla notifica di verifica post-chiusura, la Dashboard non deve fermarsi lì: se il gioco è (o richiede) un launcher condiviso con difficoltà note e già superate, propone i consigli concreti trovati.

**`thirdPartyLaunchers.ts`**: nuovo campo `troubleshootingTips` (bilingue, stesso pattern `text`/`textEn` già in uso per la Knowledge Base) su `ThirdPartyLauncherDefinition`. Popolato con l'esperienza reale documentata in questa sessione e nel changelog storico:
- **Ubisoft Connect**: finestra nera dal secondo avvio → attivare "Umu-launcher" (MILESTONE v1.5.20-Venus, "saga finestra nera").
- **EA App**: tre consigli — `EAX_LAUNCH_CLIENT=0` per l'errore INST-14-160x, GE-Proton + "Umu-launcher" per la schermata "Connessione a EA App" bloccata, e un promemoria sul fix automatico della cartella symlink (dev.14).

Deliberatamente **solo testo informativo, nessun "Apply" a un click**: sono consigli da valutare, non un'automazione — evita di rischiare di sovrascrivere una configurazione che l'utente ha già personalizzato di proposito.

**`notificationEngine.ts`**: nuovo evento `launcher-troubleshooting-tips`, corpo notifica costruito come elenco puntato (un consiglio per riga).

**`server.ts`**: `PATCH /api/notifications/:id/status` esteso — quando lo stato diventa `'failed'` per una `validation-prompt` (source `'validation'`), risolve il gioco, determina il launcher condiviso pertinente (il gioco stesso è un launcher, o lo richiede tramite `requiresLauncher`), e se ha `troubleshootingTips` propone una nuova notifica coi consigli — un solo giro per gioco (dedup, stesso principio già in uso per la notifica di collegamento libreria nativa), fire-and-forget dopo la risposta.

**Bug trovato scrivendo questa funzione**: il corpo delle notifiche non aveva mai avuto più di una riga prima d'ora — l'HTML collassava i miei `\n` in un unico paragrafo illeggibile. Corretto aggiungendo `whitespace-pre-line` al render (`App.tsx`) — un bug latente preesistente, non specifico a questa funzione, semplicemente mai emerso perché nessun corpo di notifica era mai stato multi-riga finora.

**Verificato**: `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 103 id invariati. `esbuild server.ts` — nessun errore di bundling. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.16 — Due bug per i launcher condivisi (Disinstalla, traduzione)

**Segnalati dall'utente**:

**1) Disinstalla non cancellava davvero le cartelle/prefix in `shared-launchers/`.** Causa: `gameManager.uninstallGame()` calcolava la cartella da rimuovere con uno switch che copriva solo `'GOG Galaxy' | 'Epic Games' | 'Amazon Games'` — per `'Ubisoft'`/`'EA App'` restava sempre `null`, finendo nel ramo "store non gestito": nessun file veniva mai toccato, solo i campi DB. Trovata anche infrastruttura già scritta ma **mai collegata a nulla**: `canRemoveSharedPrefix()` (reference counting sui giochi che dipendono da un launcher condiviso) esisteva già in `sharedLauncherManager.ts` ma non veniva chiamata da nessuna parte del codebase.

Fix: `storeDir` ora copre anche i launcher condivisi (l'intera cartella `shared-launchers/<id>/`, non solo `prefix/`), tramite lo stesso ponte `getThirdPartyLauncherByStoreId` già in uso altrove. Prima di cancellare: **blocca** se altri giochi installati richiedono ancora quel launcher (`canRemoveSharedPrefix`, ora davvero collegata) o se il launcher stesso è in esecuzione (`isSharedLauncherRunning`, stesso lock già esistente per un gioco in corso, mai esteso al launcher). Dopo la cancellazione riuscita, resetta anche il tracciamento del bootstrap (nuova `db.deleteSharedLauncherPrefix()`) — altrimenti `isLauncherBootstrapped()` avrebbe continuato a rispondere true puntando a un prefix ormai inesistente, rompendo qualunque reinstallazione successiva.

**2) Info del launcher nella colonna destra mostrate solo in italiano.** Causa: la card-launcher seedata da ogni plugin (`ensureSeeded()` in `eaAppPlugin.ts`/`ubisoftConnectPlugin.ts`) scrive un `description` fisso in italiano nel DB una volta sola — mostrato tale e quale a prescindere dalla lingua corrente, perché letto direttamente dal DB, mai passato da `t()`. Trovato un pattern già stabilito per questo stesso problema (`translateStorePluginDescription`, per le descrizioni dei plugin in Impostazioni) — replicato identico per le righe gioco: nuova `translateLauncherGameDescription()`, nuove chiavi `dashboard:launcherDescriptions.*` (IT/EN), applicate solo alle due card-launcher note (`ea-app-launcher`, `ubisoft-connect-launcher`) — i giochi normali continuano a mostrare la propria `description` invariata.

**Verificato**: `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 103 id invariati (stesso falso positivo noto). `esbuild server.ts` — nessun errore di bundling. JSON di localizzazione validati. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.17 — EA App: libreria nativa (Fase B "parte 2", stesso schema di Ubisoft Connect)

**Verificato prima di scrivere codice** (Dead Space 2, installato realmente sul sistema dell'utente): a differenza di Ubisoft Connect (chiave `Installs` + incrocio con le voci Uninstall per il nome), EA App basta da sola una **singola voce Uninstall standard di Windows** — `DisplayName`, `InstallLocation`, e persino l'eseguibile già dentro `DisplayIcon` — filtrata su `Publisher="Electronic Arts"`. Confermato anche `map.eacrc` (formato binario proprietario, manifest dei file del pacchetto d'installazione) — scartato come fonte: non affidabile senza reverse-engineering di un formato non documentato, a fronte di un guadagno incerto quando la via Uninstall standard bastava da sola.

**Bug reale trovato nel parser condiviso** (`wineRegistry.ts`, non specifico a EA App): `"DisplayName"="Dead Space\x2122 2"` — `\x2122` è un escape Unicode (il simbolo ™) mai gestito prima (i nomi Ubisoft erano tutti ASCII puro). Aggiunto il supporto a `unescapeRegValue()`, testato contro un fixture con i dati reali prima di considerarlo corretto.

**`eaAppPlugin.ts` esteso**: `getLibrary()` ora scansiona `system.reg` (`scanInstalledEAGames`) per le voci Uninstall con `Publisher="Electronic Arts"`, escludendo esplicitamente i componenti propri di EA Desktop (legacyPM, `Common Files\EAInstaller`) — verificato che un vero gioco installa altrove (`Program Files\EA Games\<titolo>\`), un tool/redistribuibile EA no. Id stabile per ogni gioco nativo: il **GUID della chiave di registro** stessa (`{C549...}`), non un id derivato dal titolo — più robusto di un id numerico "Origin Games" visto solo per un titolo legacy specifico, non garantito presente per ogni gioco EA. Stesso identico matching cross-store, notifica di collegamento mai automatica, e schema di creazione riga nativa già stabiliti per Ubisoft Connect (nessuna riga duplicata; `prefixPath` proprio sulla riga nativa, non `requiresLauncher` — quel campo serve al DRM di un gioco comprato altrove, non a un gioco già nativo del launcher).

**Confermato generico, nessuna modifica a `gameManager.ts`**: la catena di lancio (runner/prefix ereditati da `requiresLauncher`, percorso leggero vs container pieno, `bypassStoreAuthChain`, integrazione con `legendary` solo per lo store Epic) era già completamente generica — verificato leggendo il codice e con una query SQL reale sui dati salvati per Watch Dogs 2/Assassin's Creed Syndicate (entrambi Ubisoft Connect, ma con strutture diverse: Watch Dogs 2 vive interamente dentro la prefix condivisa — licenza Epic senza file propri — mentre Assassin's Creed Syndicate ha una prefix Epic propria e usa `bypassStoreAuthChain` per il proprio controllo anti-manomissione). Nessun codice nuovo necessario: basta impostare `requiresLauncher` correttamente sulle righe collegate, tutto il resto (riconciliazione `executablePath`/`prefixPath`, ereditarietà runner, UI Runner Bridge/Umu-launcher) è già generico per qualunque launcher condiviso.

**Verificato**: parser testato contro un fixture con i dati reali dell'utente (escape Unicode incluso). `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 103 id invariati. **Non ancora testato su hardware reale** — nessun secondo gioco EA disponibile per verificare il matching cross-store con un titolo davvero posseduto anche su un altro store.

---

## v2.0.41-dev.18 — EA App ruba il focus al gioco dipendente (parte B, focus finestra)

**Segnalato dall'utente**: lanciando Dead Space 2 (EA App come launcher condiviso, Umu-launcher attivo, runner ereditato), il gioco parte e carica correttamente fino al menu, ma va subito in background — la Dashboard torna in primo piano, ed EA App (avviato come dipendenza) si pone A SUA VOLTA sopra la Dashboard. Serve fare alt-tab per raggiungere il gioco già caricato.

**Punto B (finestra EA App che ruba il focus) — fix applicato**: trovato un argomento REALE (non indovinato) nei dati di registro già raccolti dall'utente in questa sessione — la voce di avvio automatico di Windows per EA App (`Run\EADM`) usa `-silentOs`. Ragionevole, anche se non certificato da documentazione EA ufficiale, che serva a evitare che la finestra rubi il focus a un avvio automatico — esattamente lo scopo cercato qui. Nuovo campo `silentLaunchArgs` su `ThirdPartyLauncherDefinition` (vuoto finché non verificato per un dato launcher — mai un default indovinato), popolato per EA App con `['-silentOs']`. Collegato in `launchSharedLauncher()` (`sharedLauncherManager.ts`) — SOLO quando il launcher viene avviato come dipendenza automatica di un gioco, mai quando l'utente lo apre a mano dalla propria card (lì lo vuole visibile, per costruzione mai passato per questa funzione). Verificato che `RunnerConfig.args` viene davvero consumato da `ProtonRunner.launch()` in entrambi i rami (diretto e umu-run) — nessun collegamento mancante.

**Punto A (Dashboard che torna in primo piano) — non ancora toccato**: esiste già un meccanismo di tolleranza per questa categoria di gioco (`QUICK_EXIT_THRESHOLD_MS × 3` per `requiresLauncher`, più un controllo `pgrep` sul processo reale, aggiunto durante la saga Ubisoft Connect/Watch Dogs 2 per un problema simile) — potrebbe non star scattando per questa catena specifica, ma senza un log reale della sessione non c'è abbastanza per intervenire senza rischiare un fix indovinato su un meccanismo già stratificato da più round di debug precedenti. In attesa di un estratto di log reale dall'utente prima di toccare questa parte.

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.19 — La causa reale del problema focus/timing: giochi NATIVI esclusi da tutta la logica requiresLauncher

**Segnalato dall'utente**: dopo aver testato `-silentOs` a mano nei Launch Arguments di Dead Space 2 (non ancora la mia patch di dev.18, mai ricompilata), EA App resta correttamente in tray — ma il gioco stesso va comunque in background, la Dashboard resta in primo piano, e compaiono sia la validation-prompt ("ha funzionato?") sia la notifica "chiudere EA App?" **mentre il gioco è ancora attivo**.

**Causa reale trovata rileggendo `gameManager.ts`**: l'intera logica di gestione dei launcher condivisi in `launchGame()` — eredità obbligatoria di runner/prefix/umuRun dalla card del launcher, warm-start anticipato, soglia di tolleranza tripla alla chiusura, notifica "chiudere il launcher?" — è **sempre stata condizionata unicamente su `game.requiresLauncher`**. Quel campo, per design (stesso principio già stabilito per Ubisoft Connect), **non viene mai impostato su un gioco NATIVO** di un launcher condiviso (nessun match cross-store — Dead Space 2 è esattamente questo caso, comprato/installato direttamente su EA App). Conseguenza concreta: Dead Space 2 restava con il proprio `runner` scelto autonomamente da `resolveDefaultRunner()` nello scanner — **con ogni probabilità una build Proton diversa** da quella verificata/in uso sulla card di EA App (GE-Proton11-3) — due processi Proton di versione diversa in competizione sullo stesso wineserver/prefix condivisa, lo stesso identico mismatch già diagnosticato e risolto una volta per i giochi cross-store (dev.23, v1.5.20), mai esteso ai giochi nativi perché non erano mai stati esercitati fino a questo momento. La soglia di tolleranza alla chiusura restava quella breve (8s, pensata per un gioco standalone) invece di quella tripla — causa diretta della validation-prompt prematura mentre il gioco era ancora attivo.

**Fix**: nuovo valore `effectiveSharedLauncherId` calcolato una sola volta (`game.requiresLauncher ?? getThirdPartyLauncherByStoreId(game.store)?.id` — "richiede questo launcher" e "vive dentro lo store di questo launcher" sono lo stesso identico bisogno pratico), sostituito a **ogni** occorrenza di `game.requiresLauncher` all'interno di `launchGame()` e del blocco di polling della chiusura (eredità runner/prefix/umuRun, warm-start, attesa "intelligente", soglia di tolleranza, percorso leggero, notifica "chiudere il launcher?"). Lasciato invariato solo il ciclo di riconciliazione per giochi non ancora installati (`syncExternalInstallStates`) — resta correttamente scoped a `requiresLauncher` esplicito, un gioco nativo è già `isInstalled: true` dallo scanner, quel ciclo non lo riguarda.

**Punto B (dev.18, `-silentOs`)**: mai stato eseguito per Dead Space 2 fino a questo fix — `launchSharedLauncher()` (dove `silentLaunchArgs` viene applicato) veniva chiamata solo nel warm-start anticipato, anch'esso gated su `requiresLauncher`. Ora si applicherà correttamente anche ai giochi nativi.

**Verificato**: `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 103 id invariati, stesso falso positivo noto. **Non ancora testato su hardware reale — questo è il fix da compilare, non quello di dev.18 da solo.**

---

## v2.0.41-dev.20 — La causa reale del ritorno prematuro a schermo intero: nessun margine per il PID handoff dei giochi con launcher condiviso

**Chiarito dall'utente**: con dev.19 compilato, EA App parte correttamente come daemon (`-silentOs` funziona), ma la Dashboard torna a schermo intero **subito**, considerando il gioco chiuso — chiede "ha funzionato?" e mostra "EA App ancora in esecuzione" **mentre il gioco sta ancora caricando in background**. Solo dopo il gioco appare in primo piano, ma ormai la Dashboard ha già reclamato lo schermo intero e intercetta l'input del controller destinato al gioco. Comportamento confermato intenzionale e da NON toccare: senza il collegamento al launcher condiviso, il gioco semplicemente non parte (solo EA App) — evita ambiguità fra giochi di store diversi.

**Causa reale**: `isLastLaunchedGameRunning()` ha già un meccanismo esattamente per questo scopo — `processNameHint` (introdotto per Epic/`legendary`, v1.1.31): invece di seguire il PID originariamente tracciato (che per Epic può terminare presto, delegando la supervisione più in basso nell'albero dei processi), cerca per **nome del processo**, con 30s di margine (`PROCESS_NAME_STARTUP_GRACE_MS`) prima di considerare un avvio davvero fallito. Questo hint era impostato **solo per `game.store === 'Epic Games'`** — mai per un gioco con launcher condiviso (`effectiveSharedLauncherId`, dev.19), che soffre esattamente della stessa dinamica: il gioco avvia/attende il launcher condiviso per il proprio controllo DRM, la finestra reale compare solo dopo, mentre il processo *originariamente* tracciato può terminare prima. Senza l'hint, valeva il semplice `process.kill(pid, 0)` — zero margine, Dashboard ripristinata all'istante in cui quel PID specifico termina, indipendentemente da cosa sta ancora succedendo per davvero.

**Fix**: condizione estesa da `game.store === 'Epic Games'` a `game.store === 'Epic Games' || !!effectiveSharedLauncherId` — stesso identico meccanismo già collaudato, "un tempo come per tutti gli altri giochi" (Epic in questo caso), nessun'infrastruttura nuova inventata.

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.21 — Percorso "leggero" disattivato: bypassava sempre Umu-launcher

**Segnalato dall'utente con un log reale**: con dev.20 il rilevamento chiusura prematura era davvero risolto (log conferma: "processo tracciato chiuso dopo 4s, ma processi reali ancora attivi... trattato come lancio riuscito"), ma il gioco stesso falliva comunque — con Dead Space™ 2 lanciato tramite il percorso "leggero" (riuso della sessione Wine già attiva del launcher condiviso), l'utente ha verificato a mano con lo script di debug che la stessa identica riga di comando in modalità wine diretta fallisce con un DLL mancante (`ssleay32.dll`), mentre la stessa identica riga in modalità `umu` (container Steam Linux Runtime) funziona.

**Causa**: `launchGameInSharedPrefix()` (il percorso "leggero") invoca `wine` **nudo**, bypassando interamente Proton/`umu-run` — quindi ignora completamente lo switch "Umu-launcher" della card, indipendentemente da come è impostato. L'ambiente di esecuzione risultante è diverso da quello che il gioco si aspetta (alcune DLL sono normalmente disponibili solo dentro il container SLR che `umu-run` fornisce).

**Convenzione stabilita esplicitamente con l'utente**: un gioco con un launcher condiviso — nativo o comprato altrove, nessuna differenza — lancia sempre con la stessa sintassi dello script di debug in `--mode umu`, rispettando ogni switch attivo sulla card (Umu-launcher incluso) — mai un bypass diretto di wine.

**Fix**: `useSharedPrefixLightLaunch` forzato a `false` — ogni gioco con `effectiveSharedLauncherId` passa ora sempre dal percorso standard (`runner.launch()`), che rispetta davvero `runnerConfig.umuRun` (ereditato dalla card del launcher, dev.19). Codice di `launchGameInSharedPrefix()` lasciato intatto, semplicemente non più raggiunto — nessuna riga cancellata, in caso servisse rivalutarlo in futuro. Verificato che i due casi reali già confermati funzionanti (Watch Dogs 2, Assassin's Creed Syndicate) hanno **entrambi** `bypassStoreAuthChain=1` sul proprio profilo — il percorso leggero era quindi già inutilizzato in pratica per tutto ciò che è stato verificato finora, rischio di regressione basso.

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.22 — La causa reale del doppio lancio di EA App: impossibile attivare "Bypass store" per un gioco nativo

**Segnalato dall'utente**: nella Dashboard il gioco si avvia correttamente, ma la card lancia EA App **due volte** — la prima istanza (il nostro pre-avvio anticipato, `-silentOs`) blocca il caricamento di tutto il resto; terminandola, ne parte una seconda insieme al gioco stesso.

**Causa reale**: `forceFullContainerLaunch` (`gameManager.ts`) — che salta il nostro pre-avvio anticipato del launcher condiviso quando `bypassStoreAuthChain` è attivo, lasciando che sia il gioco stesso a trascinarsi dietro il proprio launcher come processo figlio (esattamente il meccanismo già verificato funzionante per Assassin's Creed Syndicate) — non poteva mai attivarsi per Dead Space 2, perché lo switch "Bypass store" nell'overlay **non compariva nemmeno**: `showBypassStoreAuthChain` era condizionato su `selectedGame?.store === 'Epic Games'`, mai vero per un gioco EA App nativo. A monte, anche `lockedToSharedLauncherForUmu`/`lockedToSharedLauncher` (Runner Bridge) erano condizionati solo su `localGameConfig.requiresLauncher` — MAI impostato per un gioco nativo per design (stesso principio già generalizzato lato backend con `effectiveSharedLauncherId`, dev.19, mai arrivato al frontend). Il lancio reale funzionava comunque (il backend eredita sempre, indipendentemente da cosa mostra l'overlay), ma l'utente non aveva alcun modo di attivare l'opzione che avrebbe evitato il doppio lancio.

**Fix**:
- `server.ts`: `/api/shared-launchers` ora include `storeId` per ogni launcher — necessario al frontend per sapere quale store corrisponde a quale launcher condiviso, esattamente come `getThirdPartyLauncherByStoreId` fa lato backend.
- `App.tsx`: nuovo `effectiveSharedLauncherId` calcolato in entrambi i punti dell'overlay (Runner Bridge e Umu-launcher/Bypass store) — `requiresLauncher` esplicito oppure store nativo del gioco, stesso principio del backend. `lockedToSharedLauncher`/`lockedToSharedLauncherForUmu` ora lo usano al posto del solo `requiresLauncher`; `showBypassStoreAuthChain` non richiede più `store === 'Epic Games'` (quel vincolo restava valido solo per l'effetto "salta legendary", non per l'effetto — più importante qui — di evitare il pre-avvio anticipato, utile per qualunque launcher condiviso). Corretta anche la lettura di `inheritedUmuRun`, che leggeva ancora `requiresLauncher` diretto invece del valore generalizzato.
- Descrizione del toggle (`gameOptions.json`, IT/EN) corretta: non parla più solo di "salta legendary" (fuorviante per un gioco non-Epic), ora descrive anche l'effetto principale.

**Verificato**: `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 103 id invariati (stesso falso positivo noto). `esbuild server.ts` — nessun errore di bundling. JSON di localizzazione validati. **Non ancora testato su hardware reale — l'utente dovrà attivare manualmente "Bypass store" per Dead Space 2 una volta che il toggle compare.**

---

## v2.0.41-dev.23 — Rimosso il pre-avvio anticipato del launcher condiviso

**Correzione di rotta esplicita dell'utente**: le ultime versioni (dev.19-22) avevano rincorso il sintomo — un interruttore manuale ("Bypass store") per evitare il doppio lancio di EA App — invece della causa. La richiesta chiara: nessun bypass, nessuna precondizione manuale. Il gioco (Dead Space 2, come qualunque altro con un launcher condiviso) è già perfettamente capace di avviare da solo la propria dipendenza quando serve — l'unico compito della Dashboard è garantire che runner/prefix/Umu-launcher risultino già corretti quando lo fa. L'argomento `-silentOs` va semplicemente nei Launch Arguments **del gioco stesso** (impostato dall'utente, salvato nel DB per ogni lancio successivo) — non è compito nostro avviare EA App separatamente in anticipo.

**Fix**: rimosso interamente il blocco di pre-avvio anticipato del launcher condiviso in `launchGame()` (`gameManager.ts`) — nato in v1.5.20-dev.14, reso via via "più intelligente" nelle versioni successive (dev.29/30: attesa reale invece di un tempo fisso, marcatore di container pronto). Lo stesso blocco conteneva già, scritto mesi fa, il sintomo esatto che abbiamo rincorso in questi giorni: *"non trovando Ubisoft Connect ancora pronto, il gioco ne avvia una copia PROPRIA per conto suo"* — la soluzione adottata allora (farci vincere la corsa con un'attesa più lunga) curava il sintomo, non la causa. `effectiveSharedLauncherId` (dev.19, eredità di runner/prefix/Umu-launcher) resta invariato e continua a valere sia per i giochi nativi sia per quelli comprati altrove. `bypassStoreAuthChain` non controlla più nulla legato al pre-avvio (che non esiste più) — resta solo per la sua funzione originaria e indipendente: decidere se instradare un gioco Epic verso `legendary` o il lancio diretto.

**CONFERMATO DALL'UTENTE**: con il pre-avvio rimosso, la Dashboard si riduce a icona correttamente e il gioco si carica in primo piano.

**Verificato**: `tsc --noEmit` — 8 invariato.

---

## v2.0.41-dev.24 — Supporto Gamescope per-gioco (Roadmap usabilità, punto 1/3)

**Richiesta utente**: switch nell'overlay per lanciare un gioco dentro Gamescope (micro-compositore Wayland), in linea con FSR/MangoHud/anticheat già esistenti.

**Verificato prima di scrivere codice**: il rilevamento del binario `gamescope` esisteva già (`compatibilityManager.ts`, mostrato in Impostazioni > System Tools) — mancava solo il collegamento per-gioco. Trovato un pattern già pronto da imitare: `resolveGameModeWrapping()` (GameMode) avvolge già il comando reale con un binario esterno, esattamente il tipo di meccanismo che serve qui (a differenza di FSR/MangoHud, solo variabili d'ambiente).

**Implementato**:
- **`db.ts`**: nuova colonna `gamescope` su `compat_profiles` — aggiunta sia alla `CREATE TABLE` sia come migrazione esplicita per i DB già esistenti (stessa identica lezione già imparata con `umu_run`/`bypass_store_auth_chain`: una colonna dimenticata nella lista fissa di `upsertCompatProfile`/`getCompatProfile` viene ignorata in silenzio, nessun crash a segnalarlo — qui aggiunta subito in entrambi i punti).
- **`types.ts`/`runners/base.ts`**: nuovo campo `gamescope?: boolean` su `CompatibilityProfile` e `RunnerConfig`.
- **`runners/implementations.ts`**: nuova `resolveGamescopeWrapping()` — a differenza di GameMode (sostituzione di un solo binario), Gamescope deve restare sempre lo strato più **esterno** (`gamescope -- <tutto il resto>`, GameMode/umu-run inclusi se già attivi) — applicata appena prima dello spawn effettivo in tutti e tre i punti di lancio reale (`WineRunner`, `ProtonRunner`, `launchEpicViaLegendary`). Nessuna opzione di risoluzione/framerate esposta: senza argomenti, Gamescope usa già la risoluzione dello schermo.
- **`gameManager.ts`**: `gamescope: profile?.gamescope ?? false` collegato alla costruzione di `runnerConfig`.
- **`App.tsx`**: nuovo tile "Gamescope" nell'overlay Game Options, stesso trattamento semplice booleano di FSR/GameMode — nessun caso speciale necessario, la logica generica esistente gestisce già lettura/scrittura/disponibilità (legata al rilevamento reale già presente).

**Verificato**: `tsc --noEmit` — 8 invariato (un errore di sintassi reale trovato e corretto nel percorso: un backtick nel commento SQL chiudeva in anticipo il template literal). `check-focus-ids.cjs` — 103 id invariati. `esbuild server.ts` — nessun errore di bundling. JSON di localizzazione validati. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.25 — Gamescope: 3 bug reali corretti su hardware reale, da booleano a 4 stati

**Segnalato dall'utente** (LEGO Indiana Jones, Amazon Games, Gamescope attivo): dopo la chiusura del gioco resta attivo un processo `gamescopereaper` che non chiude mai la sessione e inibisce il ritorno a schermo intero della Dashboard; con Gamescope attivo il gioco parte in finestra, non a schermo intero, e non alla risoluzione del monitor. Proposta dell'utente, implementata: switch a più stati come `MangoHud` (spento | schermo intero a risoluzione monitor | override 4K | finestra) invece di un semplice on/off.

**Causa #1 (processo che non chiude mai la sessione)**: quando Gamescope avvolge il lancio, il PID che otteniamo non è più quello del gioco ma di Gamescope stesso, che genera al suo interno un processo `gamescopereaper` per sorvegliare i propri figli — tracciare quel PID diretto smette di essere affidabile, esattamente come già successo con Epic/`legendary` (dev.20) e con i launcher condivisi (dev.19). Stesso `processNameHint` esteso anche a questo caso.

**Causa #2 (il fix precedente da solo non bastava)**: verificato — `gamescopereaper` continua a mostrare la riga di comando ORIGINALE (compreso il nome dell'eseguibile del gioco) come proprio argomento anche dopo che il vero processo è terminato. Un semplice `pgrep -f <nome exe>` lo troverebbe comunque, riproponendo lo stesso identico blocco. Nuovo `pgrepGameStillRunning()` (`gameManager.ts`) — verifica il nome reale (`comm`) di ogni PID trovato da `pgrep`, un match che proviene solo da `gamescopereaper` non conta come "gioco ancora aperto". Riusato anche nel controllo esistente di tolleranza alla chiusura rapida (dev.29, stesso rischio, mai notato prima perché mai esercitato con Gamescope attivo).

**Causa #3 (finestra invece di schermo intero, risoluzione sbagliata)**: verificato con ricerca mirata (mai assunto) — Gamescope senza argomenti parte IN FINESTRA per default, e senza `-W`/`-H` la risoluzione di **output** di default è 1280×720, non quella del monitor. Serve sempre `-f` esplicito per lo schermo intero, e `-W`/`-H` espliciti per la risoluzione reale.

**Implementato**:
- `runners/implementations.ts`: nuova `detectMonitorResolution()` — legge la risoluzione realmente attiva via `xrandr --current` (riga con l'asterisco), nessuna libreria aggiuntiva. `resolveGamescopeWrapping()` riscritta per i 4 stati: 0 spento; 1 schermo intero a risoluzione rilevata automaticamente (`-f -W <rilevata> -H <rilevata>`); 2 schermo intero con override fisso 4K (`-f -W 3840 -H 2160`, per il downsampling da un monitor più piccolo — stesso caso d'uso della guida ufficiale Gamescope); 3 in finestra, dimensionata alla risoluzione del monitor se nota, mai `-f`.
- `db.ts`/`types.ts`/`runners/base.ts`: campo `gamescope` da booleano a `0 | 1 | 2 | 3`, stesso trattamento già riservato a `mangohud` (colonna DB già `INTEGER`, nessuna migrazione ulteriore necessaria).
- `App.tsx`: tile "Gamescope" ora cicla `0→1→2→3→0` come `MangoHud` (`0→1→2→0`) — stessa didascalia dinamica, stesso indicatore visivo (cursore a 4 posizioni invece di 3).
- Nuove chiavi di traduzione IT/EN per i 4 stati.

**Verificato**: `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 103 id invariati (stesso falso positivo noto). `esbuild server.ts` — nessun errore di bundling. JSON di localizzazione validati. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.26 — Selettore Gamescope non persisteva (bug ricorrente, terza occorrenza)

**Segnalato dall'utente**: scelto uno stato per Gamescope nell'overlay, chiudendo e riaprendo torna sempre alla posizione di default.

**Causa**: `setLocalCompatProfile` (App.tsx, chiamata all'apertura dell'overlay) ricostruisce l'oggetto profilo da una lista di campi scritta a mano invece di fare merge col profilo ricevuto dal server — `gamescope` non era in quella lista. **Terza occorrenza esatta dello stesso bug**, già avvertito nei commenti del codice due volte in precedenza (per `umuRun` e per `bypassStoreAuthChain`) proprio con queste parole: *"qualunque nuovo campo booleano futuro aggiunto a CompatibilityProfile senza toccare anche questo punto"*. Il valore era salvato correttamente nel DB — scartato solo alla lettura, ogni volta che l'overlay si riapriva.

**Fix**: aggiunto `gamescope: Number(profile.gamescope ?? 0)` alla lista. Verificati anche tutti gli altri campi di `CompatibilityProfile` per escludere che ce ne fossero altri dimenticati allo stesso modo — nessuno trovato (`disableWineSync`/`useKnownFixes` hanno una gestione a stato separato, corretta).

**Segnalato anche un secondo problema, non ancora risolto**: con Gamescope attivo, il gioco lanciato dalla card non mostra alcuna finestra (né in modalità finestra né schermo intero) — Dashboard resta ridotta a icona, ma né Gamescope né il gioco diventano visibili, pur risultando entrambi in esecuzione (`gamescope`/`gamescopereaper` visibili fra i processi attivi). In attesa di due dati diagnostici dall'utente prima di intervenire: la risoluzione monitor reale rilevata da `xrandr` (il comando incollato mostrava `-W 2160 -H 1440`, una combinazione non standard che potrebbe indicare un rilevamento sbagliato) e il contenuto del log di lancio più recente.

**Verificato**: `tsc --noEmit` — 8 invariato.

---

## v2.0.41-dev.27 — Gamescope apriva sul monitor sbagliato (setup multi-monitor)

**Segnalato dall'utente**: nessuna finestra Gamescope visibile dopo il lancio, pur risultando il processo attivo. Rivelato un dettaglio decisivo: configurazione multi-monitor — principale 27" a 2560×1440, secondario 14" a 2160×1440.

**Causa confermata**: `detectMonitorResolution()` prendeva il *primo* asterisco (modalità attiva) trovato in tutto l'output di `xrandr --current`, senza distinguere quale schermo fosse il principale — con due monitor collegati ha preso la risoluzione del secondario (2160×1440, combacia esattamente col comando osservato nel log reale dell'utente in un test precedente). Gamescope si è probabilmente aperto sul monitor secondario, non su quello che l'utente stava guardando.

**Fix**: `detectMonitorResolution()` ora individua prima il blocco dell'output marcato `primary` da `xrandr` stesso (fallback al primo output `connected` trovato se nessuno è marcato primary — alcuni driver/window manager non lo riportano), e cerca l'asterisco solo dentro quel blocco specifico, non nell'intero testo. **Testato** contro un output `xrandr` multi-monitor simulato (primario 2560×1440 + secondario 2160×1440, stesso identico caso dell'utente) prima di consegnare — individua correttamente il primario.

Aggiunto anche un log esplicito (`[PROTON] Gamescope: risoluzione monitor rilevata ...`) — un rilevamento sbagliato su un setup multi-monitor sarà visibile direttamente nel log della sessione, senza dover richiedere ogni volta `xrandr` a mano.

**Verificato**: `tsc --noEmit` — 8 invariato. Logica di rilevamento testata contro un fixture realistico. **Non ancora testato sul vero hardware multi-monitor dell'utente.**

---

## v2.0.41-dev.28 — Gamescope: la Dashboard non tornava mai in primo piano dopo la chiusura

**Buona notizia prima**: con `pcconfig.txt` corretto dall'utente (risoluzione nativa del monitor invece del default 1024×768 disallineato — vedi causa reale della saga xvidmode), LEGO Indiana Jones si è avviato correttamente dentro Gamescope a schermo intero.

**Segnalato dall'utente**: alla chiusura del gioco resta comunque attivo un processo Gamescope che non riporta mai la Dashboard in primo piano.

**Causa**: `pgrepGameStillRunning()` (dev.25) escludeva dal conteggio "gioco ancora aperto" solo `gamescopereaper` — ma **`gamescope` stesso** (il compositore vero e proprio, non solo il suo processo di sorveglianza interno) ha la propria riga di comando che contiene anch'essa il nome dell'eseguibile del gioco (è lui a invocarlo: `gamescope ... -- proton run LEGOIndy.exe`) — e può restare vivo come guscio vuoto anche dopo che il gioco vero è terminato, senza chiudersi da solo. Il filtro non lo escludeva.

**Fix**: esteso il filtro a entrambi i nomi processo (`gamescope` e `gamescopereaper`). In più — non solo un fix di tracciamento interno: se gli unici match trovati sono processi della famiglia Gamescope (il gioco vero è davvero finito), ora vengono **terminati esplicitamente** — altrimenti, anche correggendo solo il nostro bookkeeping interno, la finestra di Gamescope (spesso a schermo intero) sarebbe rimasta comunque visibile sopra la Dashboard ripristinata: un problema visivo reale, non solo di rilevamento.

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.29 — gamescopereaper resisteva a SIGTERM

**Segnalato dall'utente**: dopo dev.28, il compositore `gamescope` viene terminato correttamente, ma `gamescopereaper` resta comunque attivo in background.

**Causa**: `SIGTERM` è un segnale che un processo può scegliere di ignorare — `gamescopereaper`, per la sua natura di processo "sorvegliante" (pensato per sopravvivere e ripulire correttamente i propri figli), è plausibilmente uno di questi casi.

**Fix**: `SIGKILL` al posto di `SIGTERM` per la pulizia dei resti della famiglia Gamescope — non può essere ignorato. Sicuro in questo contesto: il processo del gioco vero è già escluso a monte (mai in questo elenco), qui si termina solo un residuo di wrapper, nessun rischio di dati non salvati.

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.30 — La causa reale: il compositore si chiama "gamescope-wl", non "gamescope"

**Segnalato dall'utente**: nemmeno `SIGKILL` (dev.29) termina `gamescopereaper`. Fornito un dato decisivo — `ps -eo pid,ppid,stat,comm` sul proprio sistema, sia all'avvio sia dopo la chiusura del gioco (righe identiche in entrambi i casi):

```
813814  778811  Ssl  gamescope-wl
813851  813814  S    gamescopereaper
```

**Causa reale**: `STAT` è `S` (sleep normale), non `Z` (zombie) — l'ipotesi zombie del turno precedente era sbagliata, scartata con un dato reale. Il vero problema: il confronto esatto `comm === 'gamescope'` (dev.28) non corrispondeva mai — il nome di processo reale su questo sistema è **`gamescope-wl`** (backend Wayland), non `gamescope` nudo. La funzione incontrava `gamescope-wl`, non lo riconosceva come famiglia Gamescope, e restituiva subito "un processo reale è ancora attivo" — **senza mai arrivare a considerare `gamescopereaper`**, che restava quindi sempre fuori dal ciclo di pulizia. Non era mai stato un problema del segnale inviato (SIGTERM in dev.28, poi SIGKILL in dev.29, entrambi corretti da tenere) — il processo semplicemente non veniva mai raggiunto.

**Fix**: confronto per `comm.startsWith('gamescope')` invece di un confronto esatto — cattura sia `gamescope-wl` sia `gamescopereaper` in un colpo solo, e resiste anche a varianti future del nome (es. un ipotetico backend X11 `gamescope-x11`), non solo al caso Wayland verificato qui.

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.31 — Gamescope + Epic/legendary: causa architetturale reale trovata

**Segnalato dall'utente**: "il lancio sembra fallire per i giochi che hanno attivo Umu-launcher" — testato con Death Stranding (Epic Games).

**Diagnosi condotta interamente da terminale**, isolando una variabile alla volta:
1. `umu-run` da solo dentro Gamescope → funziona (confermato all'inizio della sessione).
2. `legendary`+`umu-run` senza Gamescope → funziona.
3. `legendary` da solo dentro Gamescope (`--dry-run`) → funziona, risolve correttamente il percorso dell'eseguibile.
4. `legendary`+`umu-run` **dentro** Gamescope → fallisce, in modo incoerente fra un tentativo e l'altro (a volte un errore esplicito, a volte un'uscita silenziosa) — ma sempre con lo stesso segnale: `[gamescope] launch: Primary child shut down!` subito dopo `"Launching Boga..."`, senza che Proton arrivi mai a scrivere il proprio log dettagliato.

**Causa reale** (confermata con ricerca mirata — issue reali di Gamescope #1557/#1516/#1665, stesso identico sintomo "Primary child shut down!" con processi wine ancora vivi dopo; e con la documentazione ufficiale di Heroic Games Launcher, che usa `legendary` internamente esattamente come questo progetto): `legendary`, quando riceve `--wrapper`, avvia il wrapper come proprio **figlio** e poi **esce subito da solo** — comportamento normale, il suo compito finisce lì. Se Gamescope avvolge `legendary` dall'esterno (come facevamo), lo considera il proprio "figlio primario" e **si chiude nell'istante in cui `legendary` esce** — distruggendo la sessione nidificata mentre il vero gioco (nipote di Gamescope, non figlio diretto, generato da `umu-run`/Proton dentro il wrapper) sta ancora avviandosi al suo interno. Non un conflitto diretto fra Gamescope e Umu-launcher — un'incompatibilità fra come Gamescope sorveglia "il figlio primario" e come `legendary` gestisce il proprio wrapper.

**Fix, guidato dalla documentazione ufficiale di Heroic** (stesso identico problema, già risolto da loro): Gamescope va incorporato **dentro** l'argomento `--wrapper` passato a `legendary` (`--wrapper "gamescope ... -- umu-run"`), non più come involucro esterno dell'intero comando `legendary`. Nuova `buildGamescopePrefixString()` in `runners/implementations.ts` — stessa logica di rilevamento risoluzione di `resolveGamescopeWrapping()`, ma restituisce una stringa da incorporare nel wrapper invece di una coppia bin/argomenti separata. Applicata a entrambi i sotto-rami Proton di `launchEpicViaLegendary` (con e senza `umu-run`). L'avvolgimento esterno tramite `resolveGamescopeWrapping()` ora si applica **solo** al ramo wine puro (mai verificato per questo bug specifico, lasciato invariato per prudenza) — per i rami Proton verrebbe applicato due volte, reintroducendo esattamente il problema appena corretto.

**Verificato**: `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 103 id invariati (stesso falso positivo noto). **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.32 — Splash di lancio: prima parte del backend (roadmap punto 2/3)

**Disegno concordato con l'utente** in questa sessione, dopo una discussione approfondita: splash a schermo intero, testo della fase corrente (sostituito, non accumulato) + barra di progresso globale; scompare quando rileviamo una finestra reale (gioco, o Gamescope/`gamescope-wl` se attivo per quel lancio); su fallimento mostra un messaggio proprio e torna alla Dashboard; timeout di sicurezza di 120s dal lancio *effettivo* del processo (escluse le fasi preliminari di verifica verb) che termina forzatamente il processo. La riduzione a icona della Dashboard resta **invariata**, legata al processo come oggi — la splash è un overlay indipendente, non ne governa il comportamento.

**Implementato in questo passaggio (prima parte, solo backend)**:
- Nuovo modulo `launchPhaseTracker.ts` — publish/subscribe leggero (diverso da `addLog`/Debug Console, che resta invariato): permette a una connessione SSE di "agganciarsi" a un lancio già in corso, non di guidarlo lei stessa (diverso da `/api/runners/install-stream`, che fa entrambe le cose in un'unica richiesta). Tiene anche l'ultima fase nota per gioco, per coprire il caso in cui la splash apra la propria connessione con un po' di ritardo rispetto all'inizio del lancio vero.
- `gameManager.ts`: `launchGame()` ora emette due fasi reali — `verifying-env` (con indice/totale, per la barra di progresso, durante il ciclo di verifica dei verb) e `launching` (subito dopo l'avvio effettivo del processo — il punto esatto da cui parte il timeout dei 120s, verificato che non esistesse già nulla di simile da ereditare).
- `server.ts`: nuovo endpoint `GET /api/games/:id/launch-stream` (SSE) che espone questo streaming.
- L'intercettazione della notifica di fallimento (punto 2 del disegno) non richiede modifiche al backend: riuserà l'evento `launch-error` già esistente (con `game_id` incluso) tramite lo stream generico `/api/events` già in uso in tutta la Dashboard — filtrato lato frontend, nessun canale duplicato.

**Ancora da fare**: rilevamento finestra (gioco/Gamescope), apertura/chiusura della finestra della splash (stesso schema `--app=<url>` già collaudato per la Dashboard, mai `--kiosk`), la pagina della splash stessa, e il timeout con terminazione forzata del processo.

**Verificato**: `tsc --noEmit` — 8 invariato. `esbuild server.ts` — nessun errore di bundling.

---

## v2.0.41-dev.33 — "Carta d'identità" del gioco: window_class nel DB (idea dell'utente)

**Proposta dell'utente**, durante la progettazione della splash di lancio: invece di indovinare pattern di nomi processo/finestra caso per caso (la fonte di quasi tutti i bug reali della saga Gamescope), registrare nel DB — una volta appreso — il WM_CLASS della finestra reale di ogni gioco, da riusare in modo diretto e inequivocabile a ogni lancio successivo.

**Implementato**:
- `db.ts`: nuova colonna `window_class` sulla tabella `games` (CREATE TABLE + migrazione esplicita, stesso trattamento già dato a `gamescope`), nuove funzioni dedicate `updateWindowClass()`/`getWindowClass()` — stesso schema già in uso per `last_launched_at` (mai esposto nel tipo `Game`/`rowToGame`, solo tramite funzioni dedicate).
- `thirdPartyLaunchers.ts`: nuovo campo `knownWindowTitle` su `ThirdPartyLauncherDefinition` — popolato per EA App (`"EA"`) e Ubisoft Connect (`"Ubisoft Connect"`), osservazione diretta dell'utente, **da riverificare al primo utilizzo reale** con `wmctrl -lx`, non ancora confermato da noi.
- Nuovo modulo `windowDetector.ts` — `listWindows()` (stesso comando/formato `wmctrl -lx` già in uso in `server.ts` per Steam Big Picture), `tryLearnWindowClass()`: confronta un elenco di finestre preso *prima* del lancio con uno preso *dopo* (chiamata a ritardo crescente — 15/30/60s — dato che il tempo di comparsa varia molto da gioco a gioco), **esclude esplicitamente** la finestra nota del launcher condiviso richiesto dal gioco (se presente) prima di valutare le candidate. Se resta **esattamente una** candidata dopo il filtro, la salva; se ne restano più di una anche dopo il filtro, non salva nulla quel giro — scelta deliberatamente prudente concordata con l'utente, un lancio futuro (magari col launcher già aperto in background, non più "nuovo") sarà più chiaro.
- `gameManager.ts`: `launchGame()` cattura lo snapshot "prima" nel momento esatto dell'avvio effettivo (fase `launching`) e programma i tre tentativi ritardati — solo se `window_class` non è già noto per quel gioco (idempotente, costo pressoché nullo dopo il primo apprendimento riuscito).

**Ricaduta pratica**: questo stesso meccanismo diventerà anche il modo con cui la splash di lancio (ancora da costruire) riconoscerà "la finestra del gioco è comparsa" — una volta noto il `window_class`, la ricerca sarà diretta (`wmctrl -lx` filtrato per quella classe esatta), non più basata su euristiche di processo come nella saga Gamescope.

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale — prima verifica utile: lanciare un gioco mai lanciato prima e controllare che `window_class` compaia nel DB dopo circa 15-60s.**

---

## v2.0.41-dev.34 — window_class: da checkpoint fissi a ciclo continuo

**Domanda dell'utente**, un buco reale nel disegno di dev.33: al primo lancio di un gioco (nessun `window_class` ancora noto), come si comporta la splash? Con l'apprendimento a tre checkpoint fissi (15/30/60s) di dev.33, la splash avrebbe dovuto aspettare il prossimo checkpoint programmato invece di sparire appena la finestra compare davvero.

**Fix**: unificati apprendimento e rilevamento in un **solo ciclo di controllo continuo** (`waitForGameWindow`, ogni 2s di default) — un solo meccanismo serve entrambi gli scopi. Se `window_class` è già noto (lanci successivi al primo), la ricerca è diretta (cerca quella classe esatta). Se non ancora noto (primo lancio), il momento in cui compare esattamente una finestra nuova candidata salva il valore **e** segnala "trovata" nello stesso istante — nessun ritardo aggiuntivo rispetto a prima. Timeout parametrico, condiviso con `LAUNCH_WINDOW_TIMEOUT_MS` (120s) già introdotto in `launchPhaseTracker.ts`.

`gameManager.ts` aggiornato di conseguenza — l'apprendimento in background (senza una splash ad ascoltare, per ora) usa lo stesso ciclo, senza `await` per non rallentare `launchGame()`.

**Verificato**: `tsc --noEmit` — 8 invariato.

---

## v2.0.41-dev.35 — Splash di lancio: finestra reale, orchestrazione completa, pagina (roadmap punto 2/3)

**Ultimo pezzo mancante della splash di lancio**, disegnata e discussa nei turni precedenti — finestra reale che appare/scompare, non solo la trasmissione delle fasi (dev.32) o il rilevamento finestra (dev.33/34).

**`notificationEngine.ts`**: aggiunto `off()`, mancante — `on()` esisteva già ("per estensioni future") ma senza modo di rimuoversi, ogni lancio avrebbe accumulato un listener per sempre.

**`splashWindow.ts`** (nuovo): apre/chiude la finestra reale della splash. Punto critico verificato leggendo `kiosk-launch.sh`: l'istanza Chromium della Dashboard non specifica un proprio `--user-data-dir` — usa il profilo di default. Una seconda istanza avviata allo stesso modo rischierebbe di aprirsi come una nuova finestra nello stesso processo esistente (comportamento normale di Chromium con lo stesso profilo) invece che come processo separato — chiudere "la splash" a quel punto rischierebbe di chiudere anche la Dashboard. Qui si passa sempre un `--user-data-dir` dedicato. Stesso schema `--app=<url>` già collaudato, **mai** `--kiosk` (lag verificato dall'utente sul proprio sistema). Chiusura: SIGTERM poi SIGKILL dopo 2s (stesso principio a due segnali già consolidato per Gamescope in questa sessione).

**`splashOrchestrator.ts`** (nuovo): la vera corsa fra le tre condizioni concordate — apre la finestra, poi `Promise.race` fra rilevamento finestra (`windowDetector.ts`, dev.34) e intercettazione della notifica `launch-error` esistente (via il nuovo `notificationEngine.off()`, mai mostrata — solo per sapere che chiudere). Se nessuna delle due entro `LAUNCH_WINDOW_TIMEOUT_MS` (120s): timeout di sicurezza, termina forzatamente il processo di lancio tracciato. Mai un `await` bloccante su `launchGame()`.

**`server.ts`**: nuova rotta `GET /splash?gameId=...` — pagina HTML leggera e autosufficiente (non la Dashboard React caricata due volte), un solo `EventSource` verso lo stream di fasi già esistente. **Nessuna logica di chiusura lato pagina** — la finestra viene aperta/chiusa dal backend stesso (process management), mai da `window.close()` (permessi del browser inaffidabili per una finestra non aperta via `window.open()`). Testo in italiano/inglese secondo la lingua configurata (`readAppConfig().language`), coerente col resto della Dashboard. Aggiunta anche `escapeHtml()` — il titolo del gioco viene interpolato in HTML, andava sempre passato da un escape.

**`gameManager.ts`**: `launchGame()` ora avvia l'intera orchestrazione (non solo il rilevamento finestra in isolamento come in dev.33/34) subito dopo la fase `launching`.

**Verificato**: `tsc --noEmit` — 8 invariato. `esbuild server.ts` — nessun errore di bundling. **Non ancora testato su hardware reale — questo è il primo momento in cui la splash appare davvero come finestra, non solo come streaming di dati.**

---

## v2.0.41-dev.36 — Splash: apertura in ritardo e chiusura prematura, due bug reali

**Segnalato dall'utente**, primo test reale con finestra vera: la splash non appare subito al lancio, ma solo dopo la verifica dei verb (che può richiedere diversi secondi) — comparsa/scomparsa velocissime, molto prima della finestra di gioco vera. Comportamento incostante fra giochi diversi: per Bioshock 2 sparisce ben prima della finestra reale, per LEGO Indiana Jones (testato già molte volte in questa sessione) la transizione è lineare.

**Causa #1 (apertura in ritardo)**: la finestra della splash veniva aperta nello stesso punto in cui partiva la corsa di chiusura — subito **dopo** lo spawn effettivo del processo, che a sua volta avviene **dopo** `reconcileWinetricksVerbs()` (verifica/installazione verb, un metodo separato chiamato prima nella funzione, ma la cui posizione testuale nel file — dopo il punto in cui avevo inserito l'apertura — aveva tratto in inganno la lettura iniziale). Fix: separate apertura (`openSplashForLaunch`) e corsa di chiusura (`raceSplashClose`, prima si chiamava `runSplashForLaunch`) in `splashOrchestrator.ts` — la finestra si apre ora **prima** della verifica verb, la corsa (timeout compreso) parte comunque solo al lancio effettivo, come richiesto esplicitamente dall'utente in un turno precedente. Aggiunta anche la chiusura esplicita della splash sui due rami di fallimento dello spawn (`else`/`catch`) — prima sarebbe rimasta orfana, dato che `raceSplashClose` non viene mai raggiunta in quei casi.

**Causa #2 (chiusura prematura, incostante fra giochi)**: per un gioco senza `window_class` ancora noto (primo lancio), "esattamente una finestra nuova candidata" veniva presa per buona all'istante — ma alcuni giochi (Bioshock 2, presumibilmente) mostrano una propria finestra intermedia (caricamento, avviso) prima di quella reale, presa per errore come quella definitiva. Per LEGO Indiana Jones (`window_class` già noto da tutta la saga Gamescope di questa sessione) il problema non si presentava affatto — percorso diretto, nessuna ambiguità possibile lì, da cui l'incostanza osservata. Fix in `windowDetector.ts`: una candidata (solo nel ramo "non ancora noto") deve comparire **identica** (stesso id di finestra) su **due controlli consecutivi** prima di essere confermata — se nel frattempo sparisce o cambia, era probabilmente una finestra intermedia, non quella vera.

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.37 — La splash chiudeva subito anche con window_class già noto

**Segnalato dall'utente**: con l'apertura anticipata corretta (dev.36), la splash sparisce comunque prima della finestra di gioco vera — per LEGO Indiana Jones, che ha già un `window_class` noto (imparato durante tutta la saga Gamescope di questa sessione).

**Causa**: il percorso "diretto" (usato quando `window_class` è già noto) non confrontava affatto con lo snapshot "prima" — cercava una finestra con quella classe **ovunque nel sistema, in qualunque momento**. Se una finestra con quella stessa classe esisteva già (residuo plausibile dopo tutti i test ripetuti di Gamescope in questi giorni), veniva trovata "vera" al primissimo controllo — ancora prima che il gioco avesse davvero aperto la propria finestra nuova per QUESTO lancio.

**Fix**: il percorso diretto ora richiede, come già il percorso "non ancora noto", che la finestra sia **nuova** rispetto allo snapshot "prima" — non basta più che esista, deve essere comparsa durante questo specifico lancio.

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.38 — 2s di persistenza della splash dopo il rilevamento finestra

**Richiesta dell'utente**: la splash spariva esattamente nello stesso istante in cui la Dashboard si riduce a icona — ipotizzando che fosse l'intero processo browser a essere minimizzato insieme.

**Verificato, non solo ipotizzato**: `tray.py`, `hide_window()` usa `wmctrl -r "X-Launcher HTPC" -b add,hidden` — agisce su **una finestra specifica**, individuata per titolo esatto ("X-Launcher HTPC"), non sull'intero processo browser. Il titolo della pagina della splash ("X-Launcher", senza " HTPC") non può corrispondere a quella ricerca. Non è lo stesso meccanismo — più probabile che sia una coincidenza di tempistica: il rilevamento "finestra trovata" della splash e il rilevamento "gioco in esecuzione" di `tray.py` reagiscono quasi insieme allo stesso segnale di fondo (la finestra vera del gioco).

**Implementato comunque**, indipendentemente dalla causa esatta della coincidenza: 2 secondi di margine in `splashOrchestrator.ts` fra il rilevamento della finestra e la chiusura reale della splash — tempo per la finestra del gioco di diventare visibile e a fuoco prima che la splash sparisca.

**Verificato**: `tsc --noEmit` — 8 invariato.

---

## v2.0.41-dev.39 — La splash aveva imparato se stessa come "finestra del gioco"

**Verificato dall'utente con una query diretta al DB**: `window_class` di Bioshock 2 era `localhost__splash.Chromium` — il nome che Chromium deriva dall'URL `/splash` che le passiamo, cioè la finestra della **splash stessa**, non quella del gioco.

**Causa reale**: `openSplashWindow()` restituiva l'handle subito dopo lo spawn del processo Chromium — ma Chromium impiega un tempo reale (mai istantaneo) a creare davvero la propria finestra X11. `gameManager.ts` cattura lo snapshot "prima" subito dopo aver ricevuto l'handle: se la finestra della splash non era ancora comparsa in quel momento, il ciclo di rilevamento della finestra del gioco la vedeva come "nuova" al proprio interno, e — non avendo ancora nulla con cui confonderla, essendo l'unica candidata — la confermava per errore.

**Fix**: `openSplashWindow()` è ora `async` — attende realmente (fino a 5s, via `wmctrl`, non un'attesa fissa indovinata) che la propria finestra sia comparsa prima di restituire l'handle, garantendo che lo snapshot "prima" preso subito dopo la includa correttamente come "già esistente". Aggiunta anche una rete di sicurezza in `windowDetector.ts`: nessuna finestra riconoscibile come la splash stessa (classe/titolo contenenti "splash") può più essere confermata come finestra del gioco, indipendentemente dal tempismo — un fix alla causa vera, non due possibilità di sbagliare sullo stesso bug.

**Azione richiesta all'utente**: il valore sbagliato già salvato per Bioshock 2 va azzerato a mano (query fornita) — nessuna migrazione automatica, un caso isolato dovuto al bug appena corretto, non un problema strutturale del DB.

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.40 — Override manuale del window_class rilevato (idea dell'utente)

**Richiesta dell'utente**: un modo per correggere o cancellare a mano il `window_class` rilevato automaticamente dalla splash, sullo stesso modello già in uso per l'override del titolo di ricerca metadati (`scrapeTitle`) — nella stessa sezione Game Config dove vivono già Executable Path e Launch Arguments.

**Chiarimento durante l'implementazione**: il campo "xlaunch://" che l'utente ricordava si chiama in realtà `xlaunch://` (senza trattino) nel codice — cercato inizialmente con "x-launch://" (con trattino) senza trovarlo, poi correttamente localizzato con una ricerca più ampia. È un campo puramente informativo (id interno del gioco, usato da script esterni per testare un lancio diretto) — il nuovo campo va posizionato subito dopo, ma **fuori** dal suo ternario Steam/altri store (applicabile a qualunque gioco).

**Implementato**:
- `types.ts`/`db.ts`: `windowClass` esposto nel tipo `Game` condiviso col frontend (finora deliberatamente tenuto fuori, stesso trattamento di `last_launched_at` — ora serve mostrarlo/modificarlo nell'overlay). `updateGameConfig` (sia lato `db.ts` sia `gameManager.ts`) esteso allo stesso modo di `scrapeTitle`.
- `App.tsx`: nuovo campo "Detected Window (Splash)" nella sezione Game Config, stesso pattern esatto di `scrapeTitle` — valore vuoto = cancella, torna al rilevamento automatico dal prossimo lancio (comportamento già naturale di tutti i campi di questa sezione, `val || null`). Aggiunto anche a `localGameConfig` all'apertura dell'overlay — stessa lezione già imparata con `gamescope` (dev.26): un campo dimenticato lì mostrerebbe sempre vuoto anche con un valore reale nel DB.
- Chiavi di traduzione IT/EN aggiunte in `gameOptions.json` (etichetta, placeholder, testo esplicativo).

**Verificato**: `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 104 id (uno in più, corretto), stesso falso positivo noto, nessun nuovo problema di navigazione. Entrambi i JSON di traduzione validati.

---

## v2.0.41-dev.41 — Chiarito: l'override già guida la chiusura, mancava solo un log di conferma

**Segnalato dall'utente**: con un override manuale (`archlinux Dead Space™ 2`, testo copiato da hostname+titolo invece che dalla colonna WM_CLASS), la splash sembrava sparire al momento giusto sia all'avvio sia alla chiusura del gioco — ma in realtà restava aperta, mai chiusa davvero, anche dopo la fine del gioco.

**Chiarito, nessun bug nel confronto**: il confronto diretto (`wmClass === valore_salvato`) non può mai risultare vero con un valore nel formato hostname+titolo. Quello osservato era quasi certamente un'illusione di sovrapposizione — la splash restava aperta sotto qualunque finestra tornasse in primo piano sopra di lei (prima il gioco, poi la Dashboard), mai davvero terminata fino all'eventuale timeout dei 120s. Il campo di override condivide già lo stesso identico confronto usato per un valore appreso automaticamente — nessuna distinzione nel codice, nessun meccanismo nuovo da costruire.

**Aggiunto**: un log mancante — prima confermavamo via log solo l'*apprendimento* di un valore, mai una *corrispondenza diretta* riuscita (valore già noto, appreso o inserito a mano). Senza quel log, impossibile distinguere "il rilevamento ha funzionato per davvero" da "sembrava funzionare per sovrapposizione" — esattamente l'ambiguità di questo caso.

**Verificato**: `tsc --noEmit` — 8 invariato.

---

## v2.0.41-dev.42 — Filtro per titolo sulle classi WM_CLASS generiche (idea dell'utente)

**Confermato dall'utente con osservazione diretta su hardware reale**: `steam_app_0.steam_app_0` è il WM_CLASS che riceve **qualunque** gioco lanciato con Umu-launcher attivo (verificato su due giochi/store completamente diversi — Dead Space 2 ed EA App, Watch Dogs 2 e Ubisoft Connect — stesso identico valore), e allo stesso modo `steam_proton.steam_proton` per qualunque gioco lanciato con Proton puro. Solo i lanci Wine diretti hanno un WM_CLASS che rispecchia davvero l'eseguibile (es. `bioshock2.exe.bioshock2.exe`).

**Proposta dell'utente**: quando la classe salvata è una di queste generiche, non fidarsi della sola corrispondenza di classe — verificare anche che il **titolo** della finestra contenga il nome del gioco (tollerante a varianti: "Watch Dogs 2"/"WatchDogs2"/"watch_dogs_2").

**Implementato** in `windowDetector.ts`:
- Nuovo insieme `GENERIC_WM_CLASSES` con i due valori confermati.
- Nuova `normalizeForMatch()` — stessa identica normalizzazione già in uso in `sharedLauncherManager.ts` per il matching cross-store dei titoli, replicata qui (una riga, non vale un import cross-modulo).
- Ramo "già noto": se la classe salvata è generica, richiede ora **anche** che il titolo della finestra contenga il titolo del gioco normalizzato — altrimenti scarta la corrispondenza anche se la classe coincide.
- Ramo "non ancora noto", caso ambiguo (più candidate nuove insieme): prima di arrendersi, prova a restringere alla sola candidata il cui titolo somiglia al nome del gioco — se ne resta esattamente una, la usa invece di scartare tutto.

**Verificato**: `tsc --noEmit` — 8 invariato, stesse categorie note. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.43 — Navigazione col controller saltava il nuovo campo "Detected Window (Splash)"

**Segnalato dall'utente**: scendendo dall'alto dopo `xlaunch:// App ID`, la selezione saltava direttamente a "Dipendenze Wine" — per selezionare l'override della splash bisognava tornare indietro con la levetta.

**Causa**: stesso identico schema di un bug già corretto mesi fa (v1.1.109-dev.2) per lo stesso campo `xlaunch:// App ID` — allora lo scoring geometrico saltava "Dipendenze Wine" scendendo dall'alto, risolto con un collegamento esplicito (`neighbors.down`) direttamente a quel widget. L'aggiunta del nuovo campo "Detected Window (Splash)" (dev.40), inserito nel mezzo, veniva scavalcata da quello stesso collegamento esplicito — che continuava a puntare dritto a "Dipendenze Wine", ignorando tutto quello che nel frattempo era stato inserito fra i due.

**Fix**: il collegamento di `xlaunch:// App ID` ora punta al nuovo campo invece di scavalcarlo; il nuovo campo stesso ha ricevuto i propri collegamenti espliciti in entrambe le direzioni (`up` verso `xlaunch://`/Steam App ID — stesso id per entrambi i rami, funziona per qualunque store; `down` verso "Dipendenze Wine"). La direzione opposta (salendo da "Dipendenze Wine") non aveva mai un collegamento esplicito — è geometrica, e con il nuovo campo inserito nel mezzo dovrebbe atterrarci naturalmente senza bisogno di un collegamento esplicito lì.

**Verificato**: `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 104 id, 37 riferimenti (2 in più correttamente registrati), stesso falso positivo noto, nessun nuovo problema di navigazione.

---

## v2.0.41-dev.44 — La card del launcher condiviso risultava bloccata come se dipendesse da sé stessa

**Segnalato dall'utente**: aprendo l'overlay della card di Ubisoft Connect o EA App (non un gioco, il launcher stesso), Runner e Layer di compatibilità risultavano bloccati sul valore ereditato, esattamente come per un gioco che dipende da quel launcher — impedendo di modificarli direttamente sulla card che dovrebbe essere la fonte di quei valori, non una dipendente.

**Causa**: `effectiveSharedLauncherId` (calcolato in due punti distinti — Runner e Umu-launcher/Layer di compatibilità) ricade su `sharedLaunchers.find(sl => sl.storeId === selectedGame?.store)` quando non c'è un `requiresLauncher` esplicito. Quando la card selezionata **è** il launcher condiviso stesso, questo fallback trova **se stesso** (il proprio `store` combacia col proprio `storeId`), facendo risultare "bloccato su un launcher condiviso" — che poi risulta essere lui stesso — invece di "libero, è la fonte".

Il blocco "Layer di compatibilità" aveva già la soluzione corretta per un problema gemello (`isThisGameASharedLauncher`, usato per nascondere lo switch "Launcher condiviso" sulla propria card), ma non la applicava al calcolo di `lockedToSharedLauncherForUmu` proprio sotto; il blocco Runner non aveva il controllo per niente.

**Fix**: `isThisGameASharedLauncher` ora esclude esplicitamente `effectiveSharedLauncherId` in entrambi i punti — la card del launcher condiviso non risulta mai più bloccata su se stessa, riprendendo il controllo pieno di Runner e Layer di compatibilità come qualunque altra card indipendente.

**Verificato**: `tsc --noEmit` — 8 invariato. `check-focus-ids.cjs` — 104 id invariati.

---

## v2.0.41-dev.45 — Filtro titolo a senso unico: titoli finestra più corti del titolo salvato

**Segnalato dall'utente**, con ipotesi corretta già in partenza: LEGO Indiana Jones (classe generica `steam_proton.steam_proton`) non chiudeva la splash nonostante il log confermasse `window_class appreso`. Causa confermata con i dati reali del log: titolo salvato nel DB `"LEGO Indiana Jones: The Original Adventures"` (con sottotitolo), titolo reale della finestra `"LEGO® Indiana Jones™"` (senza sottotitolo, più corto) — il controllo introdotto in dev.42 verificava solo che *il titolo della finestra* contenesse *il titolo del gioco*, mai il verso opposto.

**Fix**: `titleLooksLikeGame()` ora bidirezionale — accetta la corrispondenza in entrambe le direzioni, con una soglia minima di 6 caratteri sulla stringa più corta prima di accettarla come sottostringa dell'altra (altrimenti un titolo finestra troppo generico rischierebbe di combaciare per caso con qualunque titolo di gioco abbastanza lungo da contenere quella parola).

**Verificato**: testato direttamente contro il caso reale del log (`LEGO® Indiana Jones™` / `LEGO Indiana Jones: The Original Adventures` → ora combacia) e contro un potenziale falso positivo con titolo generico (`Menu` → non combacia, sotto soglia). `tsc --noEmit` — 8 invariato.

---

## v2.0.41-dev.46 — Il pannello XFCE poteva essere appreso come "finestra del gioco"

**Segnalato dall'utente**: `window_class` appreso come `"xfce4-panel.Xfce4-panel"` — il pannello delle applicazioni di XFCE, non il gioco.

**Causa probabile**: il pannello ha ottenuto un nuovo id finestra proprio nella finestra di tempo fra lo snapshot "prima" del lancio e il primo controllo (un cambio di autohide/risoluzione, plausibile su un sistema con molti test Gamescope pregressi su questo stesso gioco) — vista come "nuova" dal rilevamento per differenza, unica candidata al momento, presa per buona. Il filtro escludeva già la splash stessa (`isSplashWindow`) ma nessun componente noto del desktop.

**Fix**: nuova `isSystemWindow()` — esclude qualunque finestra la cui classe inizia con `xfce4-`, `xfdesktop` o `xfwm4`, applicata allo stesso punto già usato per escludere la splash. Stessa identica filosofia: nessun componente noto del desktop può mai essere confermato come finestra del gioco, indipendentemente dal perché sia sembrato "nuovo" in quel momento.

**Azione richiesta all'utente**: il valore sbagliato già salvato per LEGO Indiana Jones va azzerato a mano (query fornita, prende qualunque residuo simile).

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale.**

---

## v2.0.41-dev.47 — Niente splash per i launcher condivisi lanciati da soli

**Segnalato dall'utente**: EA App lanciato da solo (dalla propria card, non come dipendenza di un gioco) aveva imparato il `window_class` di **Ubisoft Connect** — contaminazione incrociata. Osservazione dell'utente, corretta: la splash non ha comunque alcun senso per queste due app desktop lanciate da sole (nessuna sequenza di caricamento a fasi paragonabile a un gioco).

**Causa della contaminazione**: con entrambi i launcher potenzialmente attivi insieme, "l'unica finestra nuova" al momento del controllo può appartenere all'altro launcher, non a quello appena lanciato.

**Fix, alla radice invece che con un altro filtro**: quando il gioco lanciato è la riga sintetica di un launcher condiviso (stessa convenzione d'id già in uso ovunque nel backend, `${launcherId}-launcher`), la splash non viene proprio aperta — niente splash, niente rilevamento, niente rischio di imparare la finestra sbagliata. Risolve entrambi i problemi segnalati insieme, non solo il sintomo visibile.

**Azione richiesta all'utente**: il valore sbagliato già imparato da EA App va azzerato a mano (query fornita).

**Verificato**: `tsc --noEmit` — 8 invariato. **Non ancora testato su hardware reale.**

---

## v2.0.41-Mercury — MILESTONE STABILE

Congelata su richiesta esplicita dell'utente, seconda della serie Mercury — precede `v2.0.40-Mercury`. Nessun cambiamento di codice in questa voce oltre a quanto già elencato in dev.1 → dev.47 sopra — solo il congelamento: versione aggiornata in `App.tsx`/`package.json` (`v2.0.41-Mercury`), voce di roadmap aggiunta.

**Riassunto dei due blocchi di lavoro principali di questa milestone** (dettaglio completo in dev.1-47 sopra e nei rispettivi transcript di sessione):

1. **Gamescope per-gioco** (dev.24-31 e oltre) — switch a 4 stati (spento/schermo intero risoluzione monitor/override 4K/finestra), stesso pattern di MangoHud. Saga lunga di bug reali diagnosticati e corretti uno alla volta, mai per tentativi alla cieca: persistenza del selettore, rilevamento multi-monitor, un crash rivelatosi causato da un file di configurazione del gioco stesso mai toccato da X-Launcher (non dal nostro codice), riconoscimento del processo reale (`gamescope-wl` non `gamescope` nudo), e un'incompatibilità architetturale con `legendary`+Gamescope risolta seguendo la documentazione ufficiale di Heroic Games Launcher. Test aggiuntivi dell'utente hanno rivelato un problema più ampio e irrisolto fra Gamescope e l'inizializzazione grafica di alcuni giochi (ipotesi: la risoluzione forzata rompe motori che si aspettano di negoziarla da soli) — **parcheggiato per una sessione futura**, non affrontato in questa milestone.
2. **Splash screen di lancio** (roadmap usabilità, punto 2/3 — mai scritta prima in questo documento, vedi sezione dedicata sotto) — completata end-to-end: fasi di caricamento in tempo reale, rilevamento della finestra vera del gioco per farla sparire al momento giusto, gestione di fallimento/timeout con terminazione forzata del processo. Sottoprodotto rilevante: una "carta d'identità" per gioco (`window_class` nel DB) che si è rivelata utile anche oltre lo scopo originale della splash.

Vedi la sezione "Roadmap usabilità (Gamescope/splash/monitor processi)" più sotto per lo stato aggiornato dei tre punti e le lezioni tecniche da portare avanti.

## v2.0.41-dev.48 — Process Manager (step 1/4): scope cgroup universale per ogni lancio

**Contesto**: nuovo fronte aperto dall'utente lanciando l'intera Dashboard dentro un gamescope esterno (`gamescope -- kiosk-launch.sh`), non solo i singoli giochi. Tre problemi emersi (focus controller conteso, cursore sempre visibile, timeout 120s + rilevamento perso specificamente su Proton). Confermato via ricerca: gamescope annidato non ha alcun meccanismo di switch focus fra client (limite noto, non un nostro bug), e gamescope-dentro-gamescope (se lo switch "Gamescope per-gioco" resta attivo per quei titoli mentre l'intera Dashboard è già dentro un gamescope esterno) causa nello specifico problemi di cattura del PID per Proton — spiegherebbe perché Wine funziona e Proton no. Da qui, tre decisioni concordate: (1) invece di inseguire un focus-switch che gamescope annidato non supporta, la Dashboard smette essa stessa di reagire all'input quando un gioco è in primo piano, riattivandosi alla chiusura rilevata; (2) una combo dedicata (Select+LB+RB / Ctrl+Shift+K), controllata PRIMA del filtro "ignora se gioco attivo", riattiva sempre l'input — chiude il cerchio senza bisogno di lettura evdev raw, visto che il Gamepad API della pagina sembra restare comunque raggiungibile anche a Dashboard "silenziata"; (3) tutto questo richiede un segnale di chiusura processo affidabile — il Monitor Processi già annotato in roadmap (mai iniziato) diventa quindi prerequisito reale, non solo un miglioramento parallelo.

**Nuovo modulo `src/backend/processManager.ts`** — base del Monitor Processi, decisione architetturale già presa in una sessione precedente e qui implementata per la prima volta: `systemd-run --user --scope --collect --unit=xlauncher-<kind>-<id>-<timestamp>` avvolge l'intera catena di lancio (Proton → wine64 → gioco.exe compresi) in un cgroup interrogabile e terminabile in blocco. Espone `ensureCapability()` (verifica una sola volta per sessione del daemon, mai ripetuta a ogni lancio), `isScopeActive()`/`getScopePids()` (lettura diretta di `cgroup.procs`, cgroup v2 assunto ma non verificato su questa macchina — loggato in dettaglio se fallisce), `killScope()` (`systemctl --user kill --kill-who=all`), un registro in memoria (`register`/`unregister`/`listActive`) e `reconcileOnStartup()` per ricollegare scope superstiti a un eventuale riavvio del daemon. **Nota di cautela esplicita nel codice**: il pid restituito dallo spawn di `systemd-run` stesso NON è assunto come il pid del processo reale (che gira come figlio exec'd dentro lo scope) — viene sempre letto da `cgroup.procs` con retry (`resolveRealPidAsync`), mai dal valore di ritorno diretto.

**`runners/implementations.ts` — `spawnDetached` esteso, non sostituito**: nuovo parametro opzionale `scopeLabel: { id, title, kind: 'game' | 'shared-launcher' }`. Se assente O se `ensureCapability()` risulta false, comportamento IDENTICO a prima (fallback esplicito, mai un'eccezione che impedisca il lancio). Collegato ai lanci reali di WineRunner, ProtonRunner, Epic/legendary, DOSBox, RetroArch, ScummVM (tutti con `kind: 'game'`) — **esclusi deliberatamente** i tre lanci via URI Steam e il toggle Big Picture: lì il processo del gioco non è mai figlio del nostro spawn, lo gestisce Steam stesso (stesso principio già scritto altrove nel file: "Proton è gestito interamente da Steam").

**Non ancora fatto in questo step** (prossimi, per ordine concordato): sostituzione del `pgrep` fragile in `isSharedLauncherRunning` con la lettura dello scope; collegamento dei lanci di `sharedLauncherManager.ts` (`kind: 'shared-launcher'`); pannello UI Process Manager; voce di menu; azione di kill sulle righe.

**Verificato**: `tsc --noEmit` in ambiente pulito (dipendenze reinstallate) — 1 solo errore, preesistente e indipendente da questa modifica (`ignoreDeprecations: "6.0"` in `tsconfig.json` non valido per la versione tsc 5.8.3 risolta in questo ambiente — mismatch di toolchain, non di codice). Nessun errore nei file toccati. **Da riverificare sul hardware reale con la toolchain abituale prima di considerarlo a posto** — non verificato con lancio reale di uno scope, `systemctl --user show`, o lettura di `cgroup.procs` su questa macchina.

---

## v2.0.41-dev.49 — Process Manager (step 2/4): scope per i launcher condivisi, `isSharedLauncherRunning` non più su pgrep

**Verifica su hardware reale dello step 1** (Death Stranding via GE-Proton11-1): `ControlGroup` era vuoto in una lettura manuale immediata dopo la creazione dello scope — non un bug, la finestra breve che `resolveRealPidAsync` è pensato apposta ad assorbire (già gestita da `getScopePids()`, che torna `[]` invece di leggere la cgroup radice di sistema per errore). Ripetendo la lettura poco dopo, `ps --forest` sui pid di `cgroup.procs` ha mostrato l'albero reale completo: `legendary → proton(python3) → steam.exe(wrapper wine) → wineserver → services.exe/svchost/plugplay/winedevice → explorer.exe → DeathStranding.exe`. Step 1 confermato end-to-end, non solo scritto.

**Scoperta prima di scrivere codice** (verificare prima di assumere): `launchGameInSharedPrefix` — la funzione "lancio leggero" (wine nudo agganciato alla sessione già attiva del launcher condiviso) — è **codice morto**, disattivato esplicitamente da `useSharedPrefixLightLaunch = false` (dev.21, bug reale Dead Space 2/EA App: bypassava umu-run/Proton, DLL mancanti). Ogni gioco con `requiresLauncher` passa sempre da `runner.launch()` (il percorso standard, già strumentato nello step 1) — nessun secondo punto di spawn da collegare per i giochi. Lavoro reale rimasto solo sui due punti che riguardano il launcher condiviso in sé.

**`RunnerConfig` (`runners/base.ts`)** — due campi opzionali nuovi, `scopeKind?: 'game' | 'shared-launcher'` e `scopeId?: string`. Nessun chiamante esistente li imposta (restano sul default `'game'`/`game.id` già in uso) — servono solo a `launchSharedLauncher()`, che riusa `ProtonRunner.launch()` con un `Game` sintetico (`id: "shared-launcher-<id>"`) e senza questo override sarebbe finito tracciato come un gioco qualunque.

**`ProtonRunner.launch` (`runners/implementations.ts`)** — la scopeLabel passata a `spawnDetached` ora legge `config?.scopeKind ?? 'game'` e `config?.scopeId ?? game.id` invece del valore fisso `'game'`/`game.id` dello step 1.

**`sharedLauncherManager.ts`**:
- `isSharedLauncherRunning()` — il `pgrep -f <basename>` (dev.27, già corretto una volta dal bug del basename sbagliato ma strutturalmente ancora un match per nome processo) è ora `processManager.findActiveScope('shared-launcher', launcherId)`. Fallback esplicito al pgrep precedente se `ensureCapability()` risulta false — mai un buco silenzioso su una macchina senza sessione utente systemd.
- `launchSharedLauncher()` — aggiunti `scopeKind: 'shared-launcher'` e `scopeId: launcherId` alla config passata al runner. `scopeId: launcherId` (non l'id sintetico del Game) è deliberato: deve combaciare esattamente con la chiave che `isSharedLauncherRunning` cerca.

**`processManager.ts`** — nuova `findActiveScope(kind, id)`: cerca nel registro in memoria uno scope attivo per quella coppia, senza bisogno di conoscere il timestamp nel nome dell'unit (cambia a ogni lancio, mai riproducibile dall'esterno). Purga in lettura le entry non più attive, stesso principio già usato in `listActive()`.

**Verificato**: `tsc --noEmit` — stesso unico errore preesistente di `ignoreDeprecations` (ambiente sandbox, non hardware reale), zero errori nuovi. **Non ancora verificato su hardware reale** — la prossima volta che un gioco con `requiresLauncher` (Watch Dogs 2, Assassin's Creed Syndicate) viene lanciato, controllare nel log `[PROCESS-MANAGER] Lancio avvolto in scope xlauncher-shared-launcher-<id>-...` per il launcher e che `isSharedLauncherRunning` continui a riconoscerlo correttamente attivo (comportamento della notifica "Tieni aperto/Chiudi ora" alla chiusura del gioco, invariato ma ora dipendente dal nuovo meccanismo).

---

## v2.0.41-dev.50 — Process Manager (step 3/4): chiusura in blocco della catena gioco+launcher condiviso

**Test reale (Watch Dogs 2 via Ubisoft Connect, avvio a freddo)**: confermati due problemi distinti, entrambi diagnosticati con dati reali prima di scrivere codice (mai per assunzione):

- Il timeout 120s della splash può scadere quando il caricamento combinato launcher+gioco supera quella soglia (avvio a freddo) — **non ancora risolto in questo step**, resta aperto (vedi "Idee annotate" più sotto).
- Alla chiusura del gioco, il launcher condiviso restava aperto e la Dashboard non si massimizzava finché l'utente non chiudeva anche il launcher a mano — **nessuna notifica "Tieni aperto/Chiudi ora"** compariva mai.

**Causa reale, confermata con `ps aux` sul sistema dell'utente**: `pgrep -f WatchDogs2.exe` (il meccanismo `processNameHint` esistente, v1.1.31/v2.0.41-dev.27) trovava ancora `/usr/bin/python3 /usr/bin/umu-run .../WatchDogs2.exe` — il WRAPPER che lancia il gioco, non il gioco stesso — vivo per l'intera sessione del launcher condiviso, molto dopo che il vero processo del gioco (dentro wine) era già terminato. Un pgrep di sistema su tutta la riga di comando non ha nessuna nozione di albero di processi: non può distinguere "il nome compare in QUALCHE processo" da "il gioco è ancora vivo". Questo spiegava DA SOLO entrambi i sintomi osservati (non due bug distinti): `isLastLaunchedGameRunning()` non transitava mai a `running:false`, quindi né la notifica né il ripristino di `tray.py` (che legge lo stesso stato via `/api/system/game-running`) scattavano mai.

Inoltre, verificato che anche il semplice scope-check generico (step 1/2) avrebbe sofferto dello stesso problema in altra forma: `umu-run` e il gioco condividono lo stesso scope cgroup, quindi "lo scope è vuoto?" sarebbe rimasto vero per lo stesso motivo.

**Scoperta ulteriore, prima di scrivere codice**: `launchSharedLauncher()` (sharedLauncherManager.ts, modificata allo step 2) **non viene mai chiamata da nessuna parte** — codice morto, come `launchGameInSharedPrefix`. Il bootstrap del launcher per un gioco dipendente avviene IMPLICITAMENTE dentro la stessa catena di lancio del gioco (container Steam Linux Runtime → auth chain → gioco), un'unica scope/PID condivisi — non un secondo lancio distinto che il nostro codice etichetta separatamente. Le modifiche allo step 2 su quella funzione restano quindi inerti nella pratica (nessun regresso introdotto, ma nessun beneficio reale finché quella funzione resta non collegata).

**Decisione dell'utente, dopo la diagnosi**: invece di uno scope-check più preciso (`/proc/pid/comm` mirato, valutato come alternativa), semplificare radicalmente — dato che il launcher può comunque essere gestito/installato a parte lanciandolo standalone dalla propria card, quando è bootstrappato DENTRO la catena di un gioco (mai una sessione "sua") non ha senso lasciarlo acceso a gioco chiuso. Alla chiusura del gioco si termina l'INTERO scope (gioco + launcher + tutta la catena, umu-run/wineserver/upc.exe compresi) invece di chiedere — nessuna notifica per questo percorso. Il lancio standalone del launcher dalla propria card (proprio scope `kind:'shared-launcher'`) resta un mondo separato, mai toccato da questa logica.

**`runners/base.ts`** — `BaseRunner.launch()` ora restituisce anche `unit?: string` (il nome dello scope, quando il lancio è stato avvolto) oltre a `pid`.

**`runners/implementations.ts`** — `spawnDetached` restituisce `{ pid, unit }` invece di solo `{ pid }`; i 6 runner che passano uno `scopeLabel` (Wine, Proton, Epic/legendary, DOSBox, RetroArch, ScummVM) propagano `unit` nel proprio risultato di `launch()`.

**`processManager.ts`** — nuova `isRealProcessAliveInScope(unit, expectedExeBasename)`: legge SOLO i pid realmente dentro lo scope di questo lancio (`getScopePids`, già verificato allo step 1) e confronta il nome breve di ciascuno (`/proc/pid/comm`) — mai la riga di comando intera, quella che ha tratto in inganno il pgrep. Confronto troncato a 15 caratteri su entrambi i lati (limite del kernel su `comm`), mai una stringa intera — stessa cautela già presente altrove nel progetto per i nomi processo troncati da wine.

**`gameManager.ts`**:
- `lastLaunchedGame` ora include `unit?: string`, valorizzato al lancio da `result.unit`.
- `isLastLaunchedGameRunning()` — quando `unit` è disponibile, usa `isRealProcessAliveInScope` al posto di `pgrepGameStillRunning` per il ramo `processNameHint`. Fallback esplicito al pgrep di sistema se `unit` è assente (systemd-run non disponibile, o lancio non avvolto) — mai un buco silenzioso.
- Blocco `shared-launcher-idle`: se `unit` è disponibile, `processManager.killScope(unit)` invece della notifica — termina l'intera catena in un colpo solo. Fallback alla notifica originale se `unit` è assente.

**Verificato**: `tsc --noEmit` — stesso unico errore preesistente (`ignoreDeprecations`, ambiente sandbox), zero errori nuovi. **Non ancora verificato su hardware reale** — prossimo test: chiudere Watch Dogs 2 e controllare che (a) il launcher condiviso venga terminato insieme al gioco senza intervento manuale, (b) la Dashboard si massimizzi subito, (c) nel log compaia `[LAUNCH] ... catena di lancio terminata per intero`. **Punto 1 (timeout 120s a freddo) resta aperto** — discusso ma non ancora implementato, richiede il sistema di rilevamento finestre in due fasi proposto (attesa finestra del launcher, poi 120s standard per il gioco) — da riprendere in una sessione successiva.

---

## v2.0.41-dev.51 — REGRESSIONE dev.50: avvio di Ubisoft Connect ed EA App rotto, kill dell'intero scope durante un caricamento legittimo

**Segnalato dall'utente**: dopo dev.50, l'avvio di giochi con launcher condiviso (Ubisoft Connect, EA App) risultava rotto — rollback alla versione precedente. Alla chiusura, invece, tutto funzionava come atteso (kill dell'intera catena + ripristino Dashboard, comportamento confermato corretto).

**Causa reale**: `PROCESS_NAME_STARTUP_GRACE_MS` (30s, invariato da prima di dev.50) era calibrato sul VECCHIO meccanismo `pgrep` per riga di comando intera, che trovava corrispondenza quasi istantaneamente — la riga di comando di `umu-run` contiene già il nome dell'exe del gioco fin dal primo istante (lo stesso falso positivo corretto in dev.50, qui però era anche, per accidente, ciò che teneva viva l'attesa iniziale). Il nuovo controllo per `comm` dentro lo scope (dev.50, preciso, niente più falsi positivi in chiusura) è strutturalmente più lento a vedere la PRIMA corrispondenza: il vero processo con quel nome esiste solo dopo che l'intera catena boot+autenticazione del launcher condiviso è finita — supera abbondantemente i 30s a freddo, come già osservato in precedenza. Il timer di grazia scadeva quindi DURANTE un caricamento ancora legittimo, `isLastLaunchedGameRunning()` dichiarava "mai partito", e il blocco di chiusura di dev.50 uccideva l'intero scope — un lancio ancora in corso, non uno concluso.

**Fix**: quando è disponibile uno scope tracciato (`unit`), l'attesa "non ancora visto, ma potrebbe star solo caricando" non usa più un timer a orologio — usa `processManager.isScopeActive(unit)`: lo scope è ancora vivo (qualunque cosa ci sia dentro, launcher compreso) è un segnale diretto legato allo stato reale, non un numero da ricalibrare una seconda volta. La vera rete di sicurezza contro un lancio davvero fallito (che non produce mai né finestra né processo) resta il timeout 120s della splash — meccanismo separato in `splashOrchestrator.ts`, invariato. Il vecchio timer a 30s resta come fallback solo per lanci senza scope tracciato (systemd-run non disponibile) — comportamento identico a prima per quel caso, nessuna regressione lì.

**Verificato**: `tsc --noEmit` — stesso unico errore preesistente, zero nuovi. **Non ancora verificato su hardware reale** — prossimo test necessario: lancio a freddo di un gioco con launcher condiviso (Ubisoft Connect o EA App), confermare che il caricamento completi senza kill prematuro, poi chiusura normale per confermare che il fix di dev.50 resti intatto.

---

## v2.0.41-dev.52 — DUE REGRESSIONI REALI da dev.50/51: lancio dei launcher condivisi ancora rotto, cause diverse da quelle sospettate

**Segnalato dall'utente**: dopo dev.51, sia l'avvio standalone di EA App dalla propria card sia l'avvio di un gioco dipendente (Dead Space) venivano uccisi prematuramente — log completi forniti, entrambi diagnosticati con precisione prima di scrivere codice.

**Bug 1 — il launcher standalone veniva ucciso da se stesso**: il log mostrava `EA App: catena di lancio terminata per intero (launcher condiviso "ea-app" incluso...)` per il lancio STANDALONE di EA App — cioè il codice pensava che EA App dipendesse da "ea-app", cioè da se stesso. Causa: `effectiveSharedLauncherId = game.requiresLauncher ?? getThirdPartyLauncherByStoreId(game.store)?.id` non escludeva mai la riga del launcher stesso — il suo `store` è giocoforza categorizzato come "EA App", quindi la risoluzione per store si auto-referenziava. La stessa identità già usata altrove in questa funzione per uno scopo diverso (`isThisGameASharedLauncherApp`, per saltare la splash) esiste apposta per questo: un launcher condiviso non dipende MAI da se stesso. Portata più in alto nella funzione e riusata (anche nel blocco di polling separato, stesso principio, scope diverso) invece di una seconda dichiarazione duplicata.

**Bug 2 — un gioco dipendente reale (Dead Space via EA App) veniva ucciso a 12s da un lancio più lungo del solito**: qui il fix di dev.51 (grace period basato su `isScopeActive` invece di un timer fisso) NON era la causa — il vero processo tracciato risultava genuinamente assente a quel punto (l'intera catena boot+autenticazione di EA App non aveva ancora fatto partire il gioco). Il problema stava un livello più in basso, in un meccanismo preesistente mai toccato finora in questo lavoro: il controllo "uscita rapida ma processi reali ancora attivi" (v1.5.20-dev.29, pensato per il pattern "stub Ubisoft che rilancia ed esce"). Prima di dev.50, cadere in quel ramo portava SOLO a una notifica innocua ("tieni aperto/chiudi ora") — sbagliare per eccesso di cautela non aveva conseguenze. Da dev.50, lo stesso ramo prosegue fino al `killScope()` — lo stesso margine di errore è diventato distruttivo: uccideva un lancio ancora legittimamente in caricamento invece di limitarsi a non allarmare.

**Fix strutturale per il bug 2**: quando siamo ancora dentro la soglia di "chiusura rapida" (estesa x3 per i launcher condivisi) E un processo reale collegato al gioco risulta comunque attivo (lo stesso pgrep ampio già usato per questo scopo), il codice ora esce SENZA azzerare `lastLaunchedGame` e SENZA eseguire alcuna azione (playtime, notifica, kill) — lascia che il prossimo giro di polling (4s dopo) rivaluti con dati più maturi, esattamente lo stesso principio già applicato al rilevamento in dev.51, qui esteso al blocco di chiusura. L'azzeramento del tracciamento (`lastLaunchedGame = null`) e il rilascio dell'inibizione screensaver sono stati spostati DOPO questo controllo, non più incondizionati appena rilevata una prima assenza.

**Verificato**: `tsc --noEmit` — stesso unico errore preesistente, zero nuovi (incluso il riordino di `effectiveSharedLauncherId`/`isThisGameASharedLauncherApp`, nessun conflitto di scope). **Non ancora verificato su hardware reale** — terza iterazione su questo stesso fronte, da testare con estrema attenzione: avvio standalone di EA App/Ubisoft Connect (non deve più uccidersi da solo), avvio a freddo di un gioco dipendente (non deve essere ucciso durante il caricamento, per quanto lento), chiusura normale di un gioco dipendente (deve restare terminata l'intera catena, comportamento di dev.50 confermato prima di queste due regressioni).

---

## v2.0.41-dev.53 — Process Manager (step 4/4): pannello UI + voce di menu

Ultimo step della roadmap Process Manager, design già concordato in una sessione precedente (riuso dell'overlay file-browser/avatar-library, doppia conferma come `opt-exit`, launcher condivisi come riga propria).

**Backend**:
- `processManager.ts` — nuova `getScopeInfo(unit)`: lookup singolo per unit, usato dall'endpoint di kill per decidere COME terminare.
- `server.ts` — due nuove route: `GET /api/process-manager/list` (elenco degli scope attivi, titolo arricchito qui e non in `processManager.ts` — quel modulo non conosce deliberatamente il database, vedi commento su `reconcileOnStartup` allo step 1, per evitare un giro di dipendenze circolare) e `POST /api/process-manager/:unit/kill`, che instrada automaticamente: `closeSharedLauncher()` (wineserver -k, già testato) per un launcher condiviso lanciato standalone dalla propria card, `killScope()` generico per tutto il resto — stessa decisione già presa per la chiusura automatica in dev.50, qui applicata anche al kill manuale.

**Frontend** (`App.tsx`):
- Nuova voce "Gestore dei Processi" nel menu X-Launcher (icona `Cpu`, già disponibile), aperta con lo stesso identico pattern della libreria avatar (`setShowProcessManager(true)`, `setActiveGroup('process-manager')`, focus iniziale su `pm-close`).
- Overlay a schermo intero, stessa struttura/stile dell'avatar-library: header con pulsanti ricarica e chiudi, elenco processi attivi (icona per tipo, titolo, "Gioco"/"Launcher condiviso", tempo di esecuzione), stato vuoto quando non c'è nulla in esecuzione.
- Ogni riga ha un pulsante rosso di kill con **doppia conferma riusando esattamente il pattern di `opt-exit`**: primo invio arma la conferma (mostra il testo inline sullo stesso pulsante), secondo invio esegue; il focus che si sposta via annulla l'armamento (nuovo `useEffect` su `pendingKillUnit`, stesso identico principio del `useEffect` esistente su `pendingExit`).
- Integrato nei tre punti di navigazione controller già usati da ogni overlay esistente: `isCancellableOverlay` (L1/R1), il gestore del tasto B, il gestore Start/Select — stessi tre punti, stessa forma, mai una logica nuova inventata.
- Nuovo namespace i18n `processManager` (IT/EN), registrato in `i18n.ts`; aggiunta la chiave `quickMenu:processManager` a entrambe le lingue.

**Verificato**: `tsc --noEmit` — stesso unico errore preesistente, zero nuovi. `scripts/check-focus-ids.cjs` — nessun nuovo riferimento a id mai dichiarati (l'unico segnalato, `key-sugg-0`, è preesistente, in un'area della tastiera virtuale mai toccata da questo lavoro). **Non ancora verificato su hardware reale** — prossimo test: aprire il pannello con un gioco/launcher attivo, verificare che compaia nell'elenco con il tempo corretto, testare la doppia conferma di kill su una riga, verificare che il pulsante ricarica aggiorni l'elenco, e che l'uscita (X, B, Start/Select) riporti il focus su "Gestore dei Processi" nel menu.

---

## v2.0.53-Mercury — MILESTONE STABILE

Congelata su richiesta esplicita dell'utente, terza della serie Mercury — segue `v2.0.41-Mercury`. Nessun cambiamento di codice in questa voce oltre a quanto già elencato in dev.48 → dev.53 sopra — solo il congelamento: versione aggiornata in `App.tsx`/`package.json` (`v2.0.53-Mercury`), voce di roadmap aggiunta, punto 3/3 della "Roadmap usabilità" aggiornato a completato.

**Riassunto del lavoro di questa milestone** (dettaglio completo in dev.48-53 sopra):

Process Manager completato in 4 step, tutti verificati su hardware reale salvo l'ultimo (pannello UI, in attesa di primo test): ogni lancio (gioco o launcher condiviso) avvolto in uno scope cgroup (`systemd-run --user --scope`), rilevamento e chiusura del processo reale per nome breve dentro lo scope invece del `pgrep` di sistema fragile (bug reale trovato: il vecchio meccanismo scambiava il wrapper `umu-run` per il gioco vero), terminazione in blocco dell'intera catena gioco+launcher condiviso quando quest'ultimo è bootstrappato implicitamente (mai per un launcher lanciato standalone dalla propria card, quello resta un mondo separato), pannello "Gestore dei Processi" nel menu con kill per riga a doppia conferma. Due regressioni reali emerse durante lo sviluppo stesso, entrambe diagnosticate con dati reali (log, `ps aux`) e corrette prima di procedere — non ipotizzate a tavolino.

**Resta aperto, parcheggiato per una sessione futura**: il timeout di sicurezza 120s della splash può ancora scadere su un avvio a freddo se il caricamento combinato launcher+gioco supera quella soglia — direzione di soluzione proposta (attesa in due fasi riusando il rilevamento finestre esistente) ma non implementata in questa milestone. Vedi "Roadmap usabilità", punto 3, per il dettaglio.
