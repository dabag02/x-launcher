# X-Launcher — Changelog (parte 2)

Continua da **`CHANGELOG.md`**, che copre tutto lo sviluppo fino alla milestone **v1.5.20-Venus** (8 agosto) inclusa — quella parte 1 resta il riferimento completo per qualunque decisione architetturale presa fino a qui, non solo un archivio. In particolare, prima di implementare qualunque nuova funzione che assomigli a qualcosa già discusso, vale la pena rileggere lì per non reinventare un meccanismo che potrebbe già esistere:

---

## MILESTONE v2.0.40-Mercury (10 agosto) — prima Mercury, salto di versione maggiore

Prima milestone della nuova serie "Mercury" (non più una satellite Venus — salto a un nuovo pianeta, coerente con la portata delle novità: supporto ai launcher condivisi ormai generico e verificato su due giochi reali distinti, container Steam Linux Runtime esteso a ogni lancio Proton, file manager nativo integrato). Precede v1.5.20-Venus.

### Cosa contiene, in sintesi (dettaglio completo voce per voce qui sotto, v1.5.20-dev.29→40)

**Attesa "intelligente" e segnali reali invece di tempi indovinati** (dev.29-30): l'attesa fissa dopo l'avvio del launcher condiviso causava sia notifiche premature sia avvii falliti al primo caricamento in assoluto — sostituita da un poll reale sullo stato del launcher, poi ulteriormente rifinita con un segnale legato al processo specifico avviato (marcatore nel log di preparazione del container), non a una finestra generica che potrebbe appartenere a chiunque.

**Xalia disattivato di default per ogni lancio Proton** (dev.31): un bug diagnosticato mesi prima ma mai cablato nel codice reale — lo strumento di accessibilità di Proton può agganciare processi nella stessa sessione Wine e innescare protezioni anti-manomissione di giochi terzi.

**Saga Assassin's Creed Syndicate — il secondo caso reale del supporto ai launcher condivisi**, la più lunga e istruttiva di questa milestone: partita da un'ipotesi (bypassare `legendary`), corretta più volte fino alla causa reale confermata con una traccia completa dell'eccezione (un controllo anti-manomissione dentro il gioco stesso che fallisce senza il container Steam Linux Runtime). Il risultato finale: **due strategie di lancio generiche e coesistenti** per un gioco con launcher condiviso, scelte con uno switch esplicito per singolo gioco (mai un automatismo, comportamento non standardizzato fra launcher diversi) —
- **leggero**: il gioco si aggancia alla sessione Wine già attiva del launcher condiviso (Watch Dogs 2)
- **container pieno**: il gioco avvia la propria sessione container e si tira dietro il launcher condiviso come proprio processo figlio (Assassin's Creed Syndicate)

Entrambe verificate funzionanti su hardware reale, entrambe generiche per costruzione (non specifiche a un titolo).

**Miglioramenti diagnostici permanenti, non solo per questo caso**: il percorso di lancio leggero ora cattura sempre stdout/stderr in un log reale (prima scartato del tutto — il buco che aveva reso questa indagine molto più lunga del necessario), con un livello di dettaglio Wine (`err+all,+seh`) che mostra errori reali e tracce di eccezioni strutturate senza il rumore di un debug completo.

### Verificato

`tsc --noEmit`: 8 (baseline invariata dall'inizio della sessione precedente). `check-focus-ids.cjs`: 103 id, stesso singolo falso positivo di sempre. **Confermato dall'utente su hardware reale**: sia Watch Dogs 2 sia Assassin's Creed Syndicate funzionano end-to-end con lo switch "Bypass store" appropriato per ciascuno.

### Prossimi passi (vedi X-Launcher-Roadmap.md e CHANGELOG-3.md per lo sviluppo successivo a questa milestone)

Fase B (EA App/Battle.net/Rockstar Games Launcher) non ancora iniziata — l'infrastruttura e il pattern delle due strategie di lancio sono ora generici e pronti, da popolare con dati reali un launcher alla volta, mai un valore indovinato.

---

- **Launcher terzi condivisi** (Ubisoft Connect e l'infrastruttura generica per EA App/Battle.net/Rockstar) — l'intera sezione "Step 19d" in `CHANGELOG.md` e in `X-Launcher-Roadmap.md`. Copre: creazione/gestione della prefix condivisa, bootstrap, riconoscimento automatico dell'installazione avvenuta tramite il launcher invece che tramite lo store d'origine, avvio automatico del launcher condiviso, lancio "leggero" di un gioco dipendente nella sessione già attiva (senza un secondo container), eredità obbligatoria di runner/prefix/Umu-launcher dal launcher condiviso verso ogni gioco che ne dipende. Se un giorno serve estendere questa logica (es. Fase B con EA App/Battle.net/Rockstar), **quell'architettura è già pensata per essere generica** — non serve ricostruirla da zero, solo popolarla con i dati reali del nuovo launcher (stesso principio già seguito per Ubisoft Connect: mai un valore indovinato, sempre verificato con un'installazione di prova).
- **Umu-launcher** (`umu-run`) — perché esiste, cosa risolve (il container Steam Linux Runtime mancante), come si invoca, come si differenzia da un runner Proton/GE-Proton (sono ortogonali, qualunque build funziona da PROTONPATH).
- **Convenzione "verificare prima di assumere"** — la sezione permanente in cima a `CHANGELOG.md`/`X-Launcher-Roadmap.md` elenca le lezioni pagate care in questo progetto (sintassi CLI sbagliate, pacchetti con nomi diversi dall'atteso, comportamenti plausibili ma mai confermati). Vale ancora, si applica a qualunque nuova integrazione esterna.
- **Sistema di notifiche azionabili** (`primaryAction`/`secondaryAction`/`tertiaryAction`, `notificationEngine.ts`) — già pensato per qualunque scelta binaria/multipla da proporre all'utente, non serve un meccanismo nuovo per la prossima volta che serve chiedere qualcosa.
- **Pattern di blocco/eredità nell'overlay Game Options** (Runner Bridge, Umu-launcher, verb Versione OS) — quando un'opzione deve dipendere obbligatoriamente da un'altra impostazione, il pattern già stabilito è "nascondere le alternative, mostrare solo il valore ereditato con una didascalia esplicita", non lasciare una scelta indipendente che verrebbe comunque ignorata al momento del lancio.

---

## (le prossime voci di sviluppo continuano da qui sotto)

---

## v1.5.20-dev.29 — Bug reale CONFERMATO DALL'UTENTE: attesa fissa insufficiente al primo avvio a freddo

Segnalato dall'utente con un avvio a freddo reale: il gioco (e con lui Ubisoft Connect) parte, ma mentre il gioco attende che Ubisoft Connect diventi pronto, la Dashboard lo considera chiuso e torna a schermo intero, proponendo la notifica "tieni aperto/chiudi ora" del launcher condiviso ancora prima che Ubisoft Connect abbia davvero finito di caricarsi. Alla fine il gioco funziona comunque (menu raggiunto correttamente), ma alla sua chiusura la finestra di Ubisoft Connect resta aperta **completamente nera** — chiudendola e riavviandola dalla tray, la nuova istanza carica correttamente. Diagnosi dell'utente, confermata nel codice: al primo avvio in assoluto il gioco non trova Ubisoft Connect pronto in tempo e ne avvia una copia propria (comportamento già scoperto testando lo script diagnostico da solo, molte sessioni fa) — ma quella copia bypassa `umu-run`, da cui la finestra nera.

### Causa reale

Un'attesa **fissa** di 8 secondi (dev.17) tra l'avvio del launcher condiviso e quello del gioco non basta al primo avvio in assoluto — il container Steam Linux Runtime deve ancora generare le locale e completare l'inizializzazione (visto nei log di sessioni precedenti: `pv-locale-gen: Generating locale...`), può richiedere più di 8s. La **stessa identica costante** (`QUICK_EXIT_THRESHOLD_MS = 8000`) viene inoltre riusata come finestra di tolleranza "processo tracciato chiuso ma processi reali ancora attivi" — se il gioco resta in attesa di Ubisoft Connect più a lungo di quella soglia, il suo vero processo (che finalmente subentra una volta che Ubisoft Connect è pronto) arriva già fuori tempo massimo, scambiato per una chiusura genuina invece che per un lancio riuscito.

### `src/backend/gameManager.ts`

**Attesa "intelligente" invece di fissa**: sostituito `await new Promise(resolve => setTimeout(resolve, 8000))` con un ciclo che ricontrolla `isSharedLauncherRunning()` ogni secondo, procedendo subito appena il launcher risulta pronto (la maggioranza dei lanci successivi al primo, container già caldo) invece di aspettare sempre 8s a prescindere — con un tetto massimo di 25s oltre il quale si procede comunque (nessuna API per sapere "è davvero pronto" con certezza assoluta, resta un margine ragionevole, non una garanzia).

**Soglia di tolleranza "chiusura rapida" estesa** (`quickExitThresholdMs = requiresLauncher ? 8000*3 : 8000`) — solo per giochi con `requiresLauncher` impostato, che possono restare in attesa del launcher condiviso anche oltre la soglia ordinaria; nessun cambiamento per qualunque altro gioco.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id, invariato (nessuna modifica a App.tsx).

**Non ancora testato su hardware reale** — resta comunque un margine best-effort, non una garanzia assoluta: se il primo avvio a freddo dovesse ancora richiedere più di 25s in condizioni particolarmente lente, il problema si ripresenterebbe, solo con una soglia più alta.

---

---

## v1.5.20-dev.30 — Segnale reale di "container pronto" invece di indovinare col tempo

Discusso con l'utente: invece di continuare ad affinare tempi d'attesa (dev.29), costruire una vera gerarchia di avvio con segnali verificabili — proposta inizialmente scartata (controllo sul titolo della finestra via `wmctrl`): l'utente ha fatto notare, verificato di persona, che la finestra nera compare con lo **stesso identico titolo** "Ubisoft Connect" in barra anche quando rotta — un controllo sul titolo non distinguerebbe affatto i due casi. Pista corretta trovata insieme: un segnale legato **specificamente al processo che avviamo noi**, non a "una finestra con quel nome, chiunque l'abbia aperta".

### Segnale usato

`umu-run` scrive una sequenza riconoscibile mentre prepara il container Steam Linux Runtime — verificato presente in **ogni** log reale raccolto in questa sessione (non solo al primo avvio in assoluto): l'ultima riga distintiva prima che il controllo passi all'app vera e propria è sempre una riga `pv-adverb`. Se compare nel log **della nostra specifica invocazione**, sappiamo con certezza che quella preparazione è completata.

Filosofia condivisa con l'utente: non serve la garanzia assoluta che Ubisoft Connect sia internamente pronto (login completato ecc. — resta fuori portata senza reverse-engineering specifico, deliberatamente fuori scope). Basta garantire che **il container della nostra invocazione** sia pronto — se il gioco, non trovandolo ancora del tutto responsivo, decide comunque di avviare una propria copia (caso limite già noto da sessioni precedenti), quella nostra istanza avrà comunque il rendering corretto: il problema visibile (finestra nera) dipende dal container mancante, non da quale delle due copie "vince" la corsa. Nel peggiore dei casi, un'istanza duplicata recuperabile chiudendola — non un blocco.

### `src/backend/sharedLauncherManager.ts`

`launchSharedLauncher()` ora restituisce anche `logPath` (già calcolato internamente da `spawnDetached()` dentro `ProtonRunner.launch()`, prima scartato). Nuova `waitForContainerReadyMarker(logPath, maxWaitMs)`: rilegge il file di log ogni 500ms cercando `pv-adverb`, risolve `true` appena lo trova (non aspetta il tetto massimo se arriva prima) o `false` allo scadere — mai un blocco indefinito se il file non si apre o il marcatore non compare mai (formato di output diverso su una build Proton non ancora vista).

### `src/backend/gameManager.ts`

Nella sequenza di avvio automatico del launcher condiviso: il nuovo controllo (max 15s) precede — non sostituisce — il poll a tempo di dev.29 (max 25s), che resta come rete di sicurezza finale. Due segnali in sequenza invece di uno solo indovinato.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). **Test isolato** (non assunto): tre scenari verificati — marcatore che compare durante l'attesa (risolve subito, non aspetta il tetto massimo), marcatore mai presente (scade correttamente al tempo massimo), file di log mai creato (non si blocca). `check-focus-ids.cjs`: 103 id, invariato (nessuna modifica a App.tsx).

**Non ancora testato su hardware reale** — resta da confermare che `pv-adverb` compaia in modo affidabile anche nelle build Proton/GE-Proton diverse da quelle già viste nei log di questa sessione.

---

---

## v1.5.20-dev.31 — Bug reale riemerso: Xalia (accessibilità Proton) innesca l'anti-manomissione di UplayLaunch.exe

Indagine estesa dell'utente su Assassin's Creed Syndicate (Epic + launcher condiviso Ubisoft Connect): il gioco crasha dopo pochi secondi sia col percorso leggero (wine nudo) sia con un secondo `umu-run` indipendente (che si blocca competendo per la stessa prefix — controprova diretta che due container SLR distinti sulla stessa prefix non funzionano, esattamente il caso limite di cui avevamo già parlato senza mai verificarlo). Un log con `WINEDEBUG=+seh` ha rivelato la vera causa: `EXCEPTION_SINGLE_STEP` (0x80000004) intercettata da un gestore SEH, seguita da un `RtlUnwind` e un dialogo di errore soppresso in silenzio da Wine (`NtRaiseHardError...stub`).

### Causa reale

Confermata con una issue reale di Proton (Far Cry 4, ValveSoftware/Proton#9579): lo stesso identico pattern di eccezioni è causato da **Xalia**, lo strumento di accessibilità/gamepad di Proton per applicazioni non native, che può agganciarsi a processi nella stessa sessione Wine — innescando le protezioni anti-manomissione del gioco (VMProtect nel caso Far Cry 4, presumibilmente un meccanismo analogo in UplayLaunch.exe). `ps aux` durante il test ha confermato `xalia.exe` realmente attivo nella sessione di Ubisoft Connect.

**Non è un problema nuovo**: era già stato diagnosticato e **verificato nel sorgente reale di Proton** in una sessione precedente (vedi CHANGELOG.md, saga "finestra nera") — ma in quel contesto Xalia non era la causa del sintomo principale sotto indagine (quello era il container SLR mancante, poi risolto con `umu-run`), quindi il fix (`PROTON_USE_XALIA=0`) era stato verificato ma mai realmente cablato nel codice — rimasto solo come opzione manuale (`--no-xalia`) in `launch-debug.sh`. Ora, con un gioco diverso che condivide la stessa prefix di Ubisoft Connect, la stessa causa si ripresenta con un sintomo diverso (crash invece di finestra nera).

### `src/backend/runners/implementations.ts`

`PROTON_USE_XALIA=0` aggiunto come variabile d'ambiente di default per **ogni** lancio Proton — sia `ProtonRunner.launch()` (copre automaticamente anche l'avvio del launcher condiviso, che passa dalla stessa funzione) sia il ramo Proton di `launchEpicViaLegendary()` (i giochi Epic via `legendary` costruiscono il proprio ambiente separatamente). In entrambi i casi, un'eventuale variabile `PROTON_USE_XALIA` impostata esplicitamente dall'utente nel proprio ambiente personalizzato (Game Options) continua a vincere sempre — mai sovrascritta.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id, invariato (nessuna modifica a App.tsx).

**Non ancora confermato su hardware reale con questo fix applicato** — il test manuale equivalente (`--no-xalia` sullo script diagnostico, o l'aggiunta manuale di `PROTON_USE_XALIA=0` all'ambiente) andrebbe rifatto per la conferma definitiva prima di questa consegna, non ancora eseguito.

---

---

## v1.5.20-dev.32 — Switch per-gioco "bypassa autenticazione store" + bug reale Runner Bridge nella libreria Epic

### Switch esplicito, non un automatismo generalizzato

Discusso con l'utente dopo il test su Assassin's Creed Syndicate: lanciato direttamente dalla libreria di Ubisoft Connect, il gioco funziona perfettamente senza alcun argomento di autenticazione Epic — una volta che il launcher condiviso riconosce il gioco come proprio, gestisce lui l'intero DRM. Ma questo comportamento **non è detto sia standardizzato** fra launcher condivisi diversi (potrebbe non valere per EA App/Battle.net/Rockstar quando arriveranno) — deciso insieme: uno switch esplicito per singolo gioco, scritto nel profilo dopo un test verificato, non un'assunzione valida per tutti.

### `src/types.ts` / `src/backend/db.ts`

Nuovo campo `bypassStoreAuthChain?: boolean` in `CompatibilityProfile` — colonna `bypass_store_auth_chain` aggiunta allo schema **e** alla migrazione esplicita **e** a INSERT/UPDATE/lettura, tutti e quattro i punti insieme (lezione già pagata cara con `umu_run` in v1.5.20-dev.1/2, commentata esplicitamente nel codice per non ripeterla).

### `src/backend/gameManager.ts`

In `launchGame()`: nuova `bypassStoreAuthChain = !!game.requiresLauncher && !!profile?.bypassStoreAuthChain`. Quando vero, un gioco Epic salta `launchEpicViaLegendary()` e usa il percorso del launcher condiviso (leggero se già attivo, pieno altrimenti) — significativo solo quando `requiresLauncher` è impostato, un gioco Epic "normale" resta invariato su `legendary`.

### `src/App.tsx`

Nuovo 8° tile "Bypassa autenticazione store" in Compatibility Layer — visibile **solo** per un gioco Epic con launcher condiviso già attivo (altrimenti nascosto del tutto, stesso principio già applicato al tile "Launcher condiviso" sulla card del launcher stesso in dev.28 — un'opzione priva di senso in quel contesto non va lasciata visibile). Toggle booleano semplice, stesso trattamento di FSR/GameMode.

### Bug reale trovato e corretto nello stesso giro: Runner Bridge nella libreria Epic

Segnalato dall'utente: nella tab Collezione, il Runner Bridge di un gioco con launcher condiviso mostra correttamente solo il runner ereditato — ma nella libreria Epic, sia Watch Dogs 2 sia Assassin's Creed Syndicate mostravano **tutta** la lista dei runner con **ogni** switch segnato come selezionato e nessuno modificabile.

Causa trovata rileggendo il codice di dev.27: `isActive = lockedToSharedLauncher ? true : ...` — quando il gioco eredita da un launcher condiviso, **ogni** tile veniva marcato attivo, non solo quello giusto. Innocuo quando il filtro normale mostra un solo elemento (il caso comune), ma nel ripiego difensivo (runner ereditato non ancora risolto, lista intera mostrata) risultava in tutti gli switch marcati insieme — esattamente il sintomo segnalato. Corretto con un confronto esplicito (`runnerId === inheritedRunnerId`) invece di un `true` fisso.

**Non ancora chiarita la causa di fondo** del perché il ripiego scattasse proprio nella libreria Epic (perché `inheritedRunnerId` risultasse non risolto lì) — il fix applicato corregge il sintomo visibile (tutti gli switch selezionati insieme) in ogni caso, ma se il ripiego dovesse continuare a scattare inutilmente in quel contesto, resta un'indagine da riprendere.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id, stesso falso positivo di sempre, nessun nuovo riferimento rotto nonostante l'8° tile.

**Non ancora testato su hardware reale.**

---

---

## v1.5.20-dev.33 — Bug reale: lo switch "Bypass store" non restava mostrato acceso alla riapertura

Segnalato dall'utente: il nuovo switch (dev.32) non risultava salvato riaprendo l'overlay, e il lancio successivo passava comunque da `legendary` (avviava solo Ubisoft Connect, non il gioco). Etichetta accorciata su richiesta ("Bypassa autenticazione store" → "Bypass store", descrizione ridotta a "Salta legendary/EOS").

### Causa reale

Esattamente il bug già descritto — per un campo diverso — nel proprio commento lasciato in dev.3: *"Stesso identico bug avrebbe colpito qualunque nuovo campo booleano futuro aggiunto a CompatibilityProfile senza toccare anche questo punto."* La funzione che inizializza lo stato locale dell'overlay all'apertura (`useEffect` legato a `showGameOptions`/`selectedGame`) ricostruisce l'oggetto con un **elenco fisso di campi**, non un merge col profilo ricevuto dal server — `bypassStoreAuthChain` (aggiunto in dev.32 a types.ts/db.ts/gameManager.ts) non era stato aggiunto anche qui. Il campo veniva salvato correttamente nel database (tutta la catena backend era già corretta), ma scartato ad ogni riapertura dell'overlay — l'utente vedeva sempre lo switch spento, indipendentemente da cosa avesse davvero selezionato in precedenza.

**Ipotesi sul lancio "solo Ubisoft Connect"**: probabile conseguenza diretta di questo bug, non un problema separato — vedendo lo switch spento alla riapertura, è plausibile che sia stato attivato una seconda volta pensando non fosse stato registrato, riportandolo davvero a spento. Da confermare con un nuovo test ora che la visualizzazione è corretta.

### `src/App.tsx`

Aggiunta la riga mancante (`bypassStoreAuthChain: !!profile.bypassStoreAuthChain`) nell'oggetto ricostruito all'apertura dell'overlay. Nota per il futuro: `localCompatProfile` resta tipizzato come `Record<string, boolean | number>` (un dizionario generico, non un'interfaccia stretta che rispecchi `CompatibilityProfile`) — per questo `tsc` non ha segnalato l'omissione come errore. Non modificato in questo giro (andrebbe oltre il fix richiesto), ma un limite noto: un'interfaccia più stretta avrebbe reso questo bug rilevabile automaticamente.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id, invariato.

**Da confermare dall'utente**: che lo switch resti visibilmente acceso riaprendo l'overlay, e che con questo risolto il lancio effettivamente bypassi `legendary` come atteso.

---

---

## v1.5.20-dev.34 — Correzione di comprensione: il vero switch è "forza container pieno", non "salta legendary"

L'utente ha corretto un mio equivoco di fondo: avevo capito che Watch Dogs 2 funzionasse sempre grazie a un meccanismo esplicito di bypass di `legendary` — falso. Verificato nel codice insieme: `useSharedPrefixLightLaunch` dipende solo da `requiresLauncher`, vera per qualunque gioco che lo abbia impostato — la ramificazione Epic/legendary non viene mai raggiunta nel caso normale (il launcher condiviso è quasi sempre già attivo a quel punto), né per Watch Dogs 2 né per Assassin's Creed Syndicate. `legendary` non era mai stato il vero problema per nessuno dei due.

### Causa vera, isolata dall'utente con un test diretto

Assassin's Creed Syndicate ha bisogno del container Steam Linux Runtime anche quando il launcher condiviso è già attivo (wine nudo, il percorso leggero, crasha/non renderizza) — Watch Dogs 2 no. Confermato con un test mirato (`--mode umu` sull'eseguibile nella sua cartella Epic originale, mai `--mode direct`): arrivato fino alla schermata di gioco pulito.

### `src/backend/gameManager.ts`

`bypassStoreAuthChain` ridefinito: non più "salta legendary" da solo, ma **"per questo gioco, mai il percorso leggero — sempre il container pieno"** (`forceFullContainerLaunch`, nuova condizione aggiunta a `useSharedPrefixLightLaunch` per disattivarlo quando lo switch è attivo). Lo stesso switch continua anche a saltare `legendary` nel percorso di riserva risultante, dato che restava comunque vero che l'autenticazione EOS è irrilevante una volta che il launcher condiviso riconosce il gioco.

**Bug reale trovato nello stesso giro, prima che diventasse un problema silente**: il percorso di riserva forzato avrebbe comunque letto `umuRun` dal profilo del **gioco stesso** (mai impostato per questa categoria di gioco, stessa causa già vista per runner/prefix in dev.23) invece che dal launcher condiviso — risultato: nessun container nemmeno nel percorso apposta forzato per ottenerlo. Corretto estendendo la stessa eredità obbligatoria già applicata a runner/prefix anche a `umuRun` (nuova `effectiveUmuRun`, stesso principio, stesso punto del codice).

Descrizione del tile aggiornata di conseguenza ("Container pieno, salta legendary").

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id, invariato (nessuna modifica strutturale a App.tsx, solo testo di due chiavi di traduzione).

**Da confermare dall'utente**: che Assassin's Creed Syndicate con lo switch attivo si comporti ora esattamente come il test manuale riuscito (container pieno, eseguibile diretto, nessun argomento Epic).

---

---

## v1.5.20-dev.35 — Bug reale CONFERMATO DALL'UTENTE: il nostro avvio anticipato competeva con quello del gioco stesso

Confermato dall'utente con un test diretto da terminale, isolato dalla Dashboard: `ACS.exe`, lanciato dentro il container (`--mode umu`) sulla prefix condivisa **senza alcun avvio anticipato del launcher**, avvia da solo Ubisoft Connect e arriva fino al menu di gioco in un solo colpo — anche eseguito dalla sua cartella Epic originale, non da quella interna di Ubisoft Connect. Confermato anche che il "bypass di legendary" (dev.32/34) è esattamente il meccanismo osservato in questo test, valido sia per un gioco senza file propri (Watch Dogs 2) sia per uno con un'installazione reale altrove ma verificato nella libreria del launcher condiviso (Assassin's Creed Syndicate).

Riprovando lo stesso scenario nella Dashboard (con dev.34 applicato): il nostro avvio anticipato del launcher condiviso (Parte 3, dev.14) avviava Ubisoft Connect **per primo**, bloccando tutto — solo chiudendolo e lasciando che ripartisse da solo insieme al gioco, il tutto funzionava correttamente. Confermato: la nostra orchestrazione anticipata competeva con quella che il gioco fa comunque da sé.

### `src/backend/gameManager.ts`

Quando `bypassStoreAuthChain` è attivo per un gioco (già significa "questo gioco sa fare a meno del percorso leggero e di `legendary`", dev.34), l'avvio anticipato del launcher condiviso (Parte 3) viene ora saltato del tutto — si lascia che sia il gioco a occuparsene, esattamente come il test da terminale ha dimostrato che sa fare. Watch Dogs 2 (che non ha questo switch attivo) resta invariato sul percorso normale.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id, invariato (nessuna modifica a App.tsx).

**Da confermare dall'utente**: che Assassin's Creed Syndicate con lo switch attivo parta ora in un solo colpo dalla Dashboard, senza dover chiudere e far ripartire nulla.

---

---

## v1.5.20-dev.36 — Correzione: unificato il meccanismo di lancio di ACS con quello già valido per Watch Dogs 2

L'utente ha isolato con precisione l'errore di dev.34: `forceFullContainerLaunch` disattivava il percorso leggero **sempre**, anche quando il launcher condiviso era già attivo — costringendo il gioco a crearsi una sessione/container tutta sua invece di agganciarsi a quella già viva. Confermato dal confronto diretto fra due test: nella Dashboard, con Ubisoft Connect già attivo da un'altra sessione, il gioco restava bloccato finché quella non veniva chiusa; lo stesso identico scenario testato con `--mode shared` dello script (che sceglie leggero-se-attivo/pieno-altrimenti, la stessa logica già presente in `isSharedLauncherRunning`) funzionava senza mai bloccarsi, riusando la sessione. Confermato anche, con un test mirato, che Xalia (dev.31) non ha alcun impatto su questo comportamento — non è quella la causa.

### La distinzione corretta fra i due giochi

Non un meccanismo di lancio diverso (identico per qualunque gioco con `requiresLauncher`: leggero se possibile, pieno altrimenti) — solo il fatto che Assassin's Creed Syndicate ha una cartella/id reali gestiti da `legendary` (a differenza di Watch Dogs 2, che non ne ha mai avuto alcuno, unico motivo per cui "funzionava sempre" senza bisogno di alcun bypass esplicito). Senza uno switch che lo segnali, il percorso di riserva instraderebbe Assassin's Creed Syndicate verso `legendary` per errore.

### `src/backend/gameManager.ts`

`bypassStoreAuthChain` torna a fare **solo** quello per cui era stato originariamente pensato (dev.32): salta `legendary` nel percorso di riserva. Non forza più la disattivazione del percorso leggero — un gioco con questo switch attivo usa il percorso leggero quando il launcher condiviso è già attivo, esattamente come Watch Dogs 2, senza alcuna differenza di trattamento.

Ritirato anche il fix di dev.35 (che saltava l'avvio anticipato del launcher condiviso per i giochi con questo switch attivo) — era una correzione al sintomo sbagliato: il conflitto osservato non veniva dall'avvio anticipato in sé, ma dal fatto che il percorso pieno veniva forzato comunque subito dopo, creando una seconda sessione in competizione con la prima. Risolta la causa reale, l'avvio anticipato funziona identico per qualunque gioco con `requiresLauncher`.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id, invariato. Confermato che il tile "Bypass store" in overlay era già visibile in modo coerente per qualunque gioco Epic con launcher condiviso attivo (Watch Dogs 2 incluso) — nessuna modifica necessaria lì.

**Da confermare dall'utente**: che Assassin's Creed Syndicate, con lo switch attivo, si riagganci ora alla sessione già attiva di Ubisoft Connect senza mai bloccarsi, esattamente come nel test riuscito con `--mode shared`.

---

---

## v1.5.20-dev.37 — Buco diagnostico reale: il lancio leggero non catturava mai stdout/stderr

Indagando insieme all'utente perché Assassin's Creed Syndicate sparisse in silenzio pochi secondi dopo l'avvio (non bloccato — sparito: `ps aux` subito dopo non trovava più nulla, nonostante il nostro rilevamento avesse visto "processi reali ancora attivi" a 6 secondi dal lancio): scoperto che `launchGameInSharedPrefix()` (il percorso leggero, usato sia da Watch Dogs 2 sia ora da Assassin's Creed Syndicate) scartava sempre stdout/stderr del processo (`stdio: 'ignore'`) — a differenza di **ogni altro** percorso di lancio del progetto, che scrivono tutti un log reale via `gameLaunchLogPath()`. Nessun modo di sapere perché il processo moriva, dato che l'unico output veniva buttato via a prescindere.

Verificato anche, escludendolo come causa: il demone gira come processo di fallback locale (`build.sh`), non come servizio systemd — nessun sospetto di ambiente grafico incompleto (`DISPLAY`/`DBUS_SESSION_BUS_ADDRESS`).

### `src/backend/runners/implementations.ts`

`gameLaunchLogPath()` esportata (era privata) — riusata invece di duplicata.

### `src/backend/sharedLauncherManager.ts`

`launchGameInSharedPrefix()`: nuovo parametro opzionale `gameId`, usato per calcolare un percorso di log reale (stesso schema di ogni altro percorso di lancio) — stdout/stderr ora catturati con lo stesso pattern già in uso ovunque nel progetto (`spawnDetached`-style: file descriptor aperto in append, passato come stdio). Se l'apertura del file fallisse (permessi, disco pieno), ripiega su `stdio: 'ignore'` con un avviso — non deve mai impedire il lancio del gioco.

### `src/backend/gameManager.ts`

Passa `id` (l'id del gioco) alla chiamata — `result.logPath` finisce automaticamente in `this.lastLaunchedGame.logPath`, stesso meccanismo generico già esistente per ogni altro tipo di lancio, nessuna modifica aggiuntiva necessaria lì.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id, invariato (nessuna modifica a App.tsx).

**Prossimo passo**: rifare il lancio di Assassin's Creed Syndicate dalla Dashboard e leggere il nuovo file di log per capire finalmente perché il processo termina in silenzio — nessuna ipotesi ulteriore finché non abbiamo il dato reale.

---

---

## v1.5.20-dev.38 — Bug reale: il log appena aggiunto (dev.37) restava vuoto per colpa nostra

Il file `epic-Albacore-<timestamp>.log` atteso da dev.37 è comparso, ma **completamente vuoto** — nessuna riga, nemmeno di errore. Causa trovata subito: `launchGameInSharedPrefix()` imposta `WINEDEBUG: '-all'`, che sopprime **ogni** canale diagnostico di Wine, inclusi gli errori — la stessa classe di informazione che ci aveva permesso di trovare il crash di Xalia mesi fa (`WINEDEBUG=+seh`) restava tagliata fuori per costruzione, indipendentemente da cosa succedesse davvero al processo.

### `src/backend/sharedLauncherManager.ts`

`WINEDEBUG` cambiato da `-all` a `err+all` — mostra solo i messaggi di livello errore su tutti i canali, molto più silenzioso di un debug completo ma non nasconde più un crash reale.

Segnalato insieme dall'utente: la notifica "tieni aperto/chiudi ora" del launcher condiviso compare ancora prima che Ubisoft Connect abbia finito di caricarsi — coerente con un processo che muore quasi istantaneamente (il file di log vuoto lo confermava indirettamente). Non affrontato in questo giro: prima serve vedere cosa dice davvero il log con la diagnostica ora visibile, per non rincorrere un sintomo la cui causa potrebbe già emergere da lì.

### Verifica

`tsc --noEmit`: 8 (baseline invariata).

**Prossimo passo**: rifare il lancio, leggere il nuovo contenuto di `epic-Albacore-<timestamp>.log` — questa volta dovrebbe contenere qualcosa di utile.

---

---

## v1.5.20-dev.39 — WINEDEBUG ancora insufficiente: manca il canale `seh`

Il log ottenuto con `err+all` (dev.38) ha mostrato progresso reale — due righe, non più vuoto:

```
fixme:ntdll:EtwEventSetInformation (...) stub
fixme:ntdll:NtRaiseHardError 0x50000018 4 0x3 0x10ec90 0 0x10eed8: stub
```

Stesso identico pattern già incontrato mesi fa investigando il crash di Xalia (poi verificato senza impatto su questo caso specifico, dall'utente) — un'app che tenta di mostrare un errore di sistema, soppresso da Wine (`stub`). Ma manca la parte che allora si rivelò decisiva: la traccia SEH completa (indirizzo/codice dell'eccezione, gestori chiamati) che aveva permesso di identificare con precisione la causa — quella vive sul canale `seh`, non incluso nella classe generica `err` su "tutti i canali".

### `src/backend/sharedLauncherManager.ts`

`WINEDEBUG` esteso da `err+all` a `err+all,+seh` — combina gli errori generici già ottenuti con la traccia dettagliata delle eccezioni strutturate.

### Verifica

`tsc --noEmit`: 8 (baseline invariata).

**Prossimo passo**: rifare il lancio, leggere il nuovo `epic-Albacore-<timestamp>.log` — questa volta dovrebbe contenere l'intera traccia dell'eccezione, non solo la riga finale soppressa.

---

---

## v1.5.20-dev.40 — Ripristinato il container pieno per "Bypass store", stavolta con la causa reale confermata

La traccia SEH completa (dev.39) ha confermato la causa che in dev.34 era solo un'ipotesi plausibile poi ritrattata per errore in dev.36: Assassin's Creed Syndicate esegue un controllo anti-manomissione (`NtQueryInformationProcess` sul proprio processo, poi un `EXCEPTION_SINGLE_STEP` deliberato **dentro `ACS.exe` stesso** — non una libreria di sistema, l'indirizzo dell'eccezione lo mostra chiaramente) che fallisce senza il container Steam Linux Runtime. Non tollera il percorso leggero (wine nudo), indipendentemente da chi ha avviato la sessione condivisa per primo — il test riuscito con `--mode shared` dello script era caduto nel ramo pieno dello script (Ubisoft Connect non ancora rilevato come attivo in quel momento), non nel percorso leggero.

### `src/backend/gameManager.ts`

Ripristinati insieme, con commenti aggiornati per riflettere la causa ora confermata invece dell'ipotesi precedente:
- `forceFullContainerLaunch` torna a disattivare il percorso leggero quando `bypassStoreAuthChain` è attivo per quel gioco
- L'avvio anticipato del launcher condiviso (Parte 3) torna a essere saltato per la stessa categoria di gioco — il gioco si tira dietro il launcher condiviso come proprio processo figlio (verificato a mano dall'utente da terminale), il nostro avvio anticipato andrebbe in competizione con quella sessione

Il meccanismo resta **generico per costruzione**: nessun codice specifico ad Assassin's Creed Syndicate — se lo switch venisse attivato in futuro anche su Watch Dogs 2 (test in corso da parte dell'utente, prima via script poi eventualmente in Dashboard, per valutare se unificare il processo anche lì), si applicherebbe automaticamente allo stesso modo.

### Verifica

`tsc --noEmit`: 8 (baseline invariata). `check-focus-ids.cjs`: 103 id, invariato.

**Prossimo passo**: l'utente verifica se lo stesso meccanismo (container pieno, il gioco si tira dietro il launcher condiviso) funziona anche per Watch Dogs 2 — se sì, un solo meccanismo per entrambi; se no, restano entrambi (leggero per Watch Dogs 2, container pieno per Assassin's Creed Syndicate), già supportato dal codice attuale senza ulteriori modifiche.

---
