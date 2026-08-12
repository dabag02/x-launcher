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
