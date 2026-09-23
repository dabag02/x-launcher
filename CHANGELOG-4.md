# CHANGELOG-4 — Sessione di ottimizzazione e correzione bug

Nuovo file changelog, aperto pulito per questa sessione dedicata esclusivamente a
manutenzione: nessuna nuova funzione, solo bugfix, ottimizzazione e leggibilità
del codice esistente. Riprende da `v2.0.53-Mercury` (fine di `CHANGELOG-3.md`).

Roadmap di questa sessione (8 step, difficoltà crescente):
1. Uniformare il naming delle variabili `catch`
2. Condensare i commenti storici nei moduli backend isolati
3. Risolvere gli 8 errori `tsc` preesistenti
4. Ridurre `any` nei moduli piccoli non-`App.tsx`
5. Middleware di errore centralizzato in `server.ts`
6. Estrazione hook da `App.tsx` (solo stato/logica pura)
7. Riduzione `any` in `db.ts` e `notificationEngine.ts`
8. Revisione mirata di `gameManager.ts`/`downloadManager.ts` (se resta margine)

Escluso esplicitamente da questa sessione: `FocusProvider.tsx`, `VirtualKeyboard.tsx`
(sistema di navigazione controller-first, ID mai verificati dal compilatore — rischio
troppo alto rispetto al beneficio).

---

## v2.0.53-dev.1 — Step 1/8: naming uniforme dei blocchi `catch`

**Cosa cambia**: tutte le variabili di blocchi `catch` diverse da `err` (48 occorrenze
totali: 47 `catch (e)` + 1 `catch (psErr)` in `downloadManager.ts`) rinominate a
`catch (err)`, incluso ogni uso della variabile all'interno del blocco stesso.
Nessuna modifica di logica — solo naming, per coerenza in tutto il progetto.

**File toccati** (16): `server.ts`, `src/backend/downloadManager.ts`,
`src/backend/gameManager.ts`, `src/backend/archiveExtractors.ts`,
`src/backend/knowledgeBase.ts`, `src/backend/sharedLauncherManager.ts`,
`src/backend/metadataManager.ts`, `src/backend/processManager.ts`,
`src/backend/db.ts`, `src/backend/runners/implementations.ts`,
`src/backend/cloudBackup/bundle.ts`, `src/backend/cloudBackup/googleDrive.ts`,
`src/backend/aiProviders/orchestrator.ts`, `src/backend/plugins/amazonPlugin.ts`,
`src/backend/plugins/classicPlugin.ts`, `src/backend/plugins/epicPlugin.ts`.

**Verificato**: `tsc --noEmit` — stessa identica baseline di 8 errori preesistenti
(nessuno introdotto, nessuno risolto — previsto, questo step non li tocca). Diff
puramente cosmetica, nessun test su hardware reale necessario per questo step.

---

## v2.0.53-dev.2 — Step 2/8: condensazione commenti storici (moduli backend isolati)

**Cosa cambia**: testate commento condensate in 21 file tra `src/backend/plugins/`,
`src/backend/aiProviders/`, `src/backend/cloudBackup/` — rimossi riferimenti a
"Step N"/`-dev.N` ormai privi di significato operativo e narrazione del processo
di sviluppo ("deciso con l'utente", "fase di progettazione"), mantenute tutte le
informazioni tecniche pertinenti (formati JSON reali, timeout, comandi CLI,
vincoli OAuth, ragioni di scelte architetturali). Nessuna modifica di logica.

**Due imprecisioni reali corrette, trovate durante la condensazione**:
- `amazonPlugin.ts`: il commento dichiarava "15s installed" ma la costante
  reale (`NILE_INFO_TIMEOUT_MS`) è 20s — allineato il testo al valore vero.
- `aiProviders/base.ts` e `aiProviders/gemini.ts`: le note descrivevano la
  connessione a `notificationEngine.ts` e l'etichetta "EXPERIMENTAL" come
  "non ancora implementate" — verificato nel codice reale che sono invece
  già cablate (`notificationEngine.ts` + `App.tsx`), corretto il testo.
- `cloudBackup/base.ts`: duplicava per intero la lista inclusioni/esclusioni
  del backup già presente in `bundle.ts` (rischio di disallineamento futuro
  tra le due liste) — ora rimanda a `bundle.ts` come unica fonte di verità.

**File toccati** (21): tutti i file in `src/backend/plugins/` (esclusi `base.ts`,
che era già pulito), tutti i file in `src/backend/aiProviders/`, tutti i file in
`src/backend/cloudBackup/`.

**Non toccato in questo step**: i numerosi commenti inline con tag di versione
sparsi nel corpo di alcuni file (`thirdPartyLaunchers.ts`, `gogPlugin.ts`,
`ubisoftConnectPlugin.ts`) — contengono causa-radice di bug reali già
diagnosticati, valore informativo alto nonostante il tag di versione stale;
lasciati per non rischiare di perdere contesto utile per un guadagno marginale.

**Verificato**: `tsc --noEmit` — stessa baseline di 8 errori preesistenti,
nessuna regressione. Diff puramente su commenti/documentazione.

---

## v2.0.53-dev.3 — Step 3/8: risolti tutti gli errori `tsc` preesistenti

**Cosa cambia**: risolti tutti gli 8 errori `tsc --noEmit` preesistenti — per la
prima volta il progetto compila con **zero errori** (confermato anche installando
il modulo opzionale `howlongtobeat`, l'unico dei 9 errori originari che non era
un bug del progetto ma un pacchetto opzionale mancante).

**Fix applicati** (dal più isolato al più centrale, ognuno verificato con
`tsc --noEmit` singolarmente prima del successivo):

1. `src/backend/compatibilityManager.ts` — `execSync(..., { shell: true })`:
   l'opzione `shell` di `ExecSyncOptions` accetta solo un path di shell
   (string), non un booleano. Rimossa: `execSync` usa già una shell di
   default, necessaria per il fallback `||` nel comando.
2. `src/backend/gameManager.ts` — `result.unit` non esiste in uno dei due rami
   dell'union type restituito da `launchGameInSharedPrefix`/
   `launchEpicViaLegendary` (solo `runner.launch()` ha `unit`). Sostituito
   l'accesso diretto con `'unit' in result ? result.unit : undefined`.
3. `src/hooks/useInputDevices.ts` + `src/App.tsx` (2 errori, stessa causa
   radice) — lo stato React `inputPlugins` era tipizzato sull'intero oggetto
   plugin (con `mapButtons`/`rumble`, mai usati dalla UI), ma due punti su tre
   che lo aggiornavano costruivano un sottoinsieme più stretto. Introdotto un
   tipo dedicato `InputPluginSummary` + helper `toInputPluginSummary()` in
   `src/input/types.ts`, riusato nei 3 punti che prima duplicavano lo stesso
   literal — elimina anche la duplicazione, non solo l'errore di tipo.
4. `src/App.tsx` — firma di `useScrollOnceOverflow` allargata da
   `RefObject<HTMLInputElement>` a `RefObject<HTMLInputElement | null>`, per
   riflettere il tipo reale prodotto da `useRef<HTMLInputElement>(null)`.
5. `src/App.tsx` — `notif.primaryAction` "possibly undefined" dentro la
   closure di `onEnter`/`(isFocused) =>`: la narrowing di TS su un guard
   esterno (`notif.primaryAction && (...)`) non attraversa il confine di una
   closure annidata. Estratta una `const primaryAction` locale (catturata per
   valore, quindi narrowabile) e riusata in tutti i riferimenti del blocco.
6. `src/App.tsx` — `pendingRunnerAction` "possibly null" in due punti
   (righe pulsanti install/uninstall dei runner): la forma
   `pendingRunnerAction?.id === r.id && pendingRunnerAction.action === ...`
   non narrowa il secondo accesso. Corretto in forma esplicita
   `pendingRunnerAction && pendingRunnerAction.id === ... && pendingRunnerAction.action === ...`.

**File toccati** (5): `src/backend/compatibilityManager.ts`,
`src/backend/gameManager.ts`, `src/hooks/useInputDevices.ts`,
`src/input/types.ts`, `src/App.tsx`.

**Verificato**: `tsc --noEmit` — 8 errori → 0. Ogni fix testato singolarmente,
nessuna regressione lungo il percorso. Nessun test su hardware reale necessario
(correzioni di tipo, nessuna modifica di comportamento runtime — verificato
leggendo ogni fix per assicurarsi che il valore effettivo a runtime non
cambiasse, solo la sua rappresentazione ai fini del type-checking).

---

## v2.0.53-dev.4 — Fix ambientale: `package.json` mancava `allowScripts`

**Non uno step della roadmap** — bug reale segnalato dall'utente dopo la
ricompilazione post-Step 3: l'avvio falliva con `Could not locate the bindings
file` per `better-sqlite3` (crash al semplice `module-load` di `db.ts`, prima
di qualunque logica applicativa — **non causato dai fix TypeScript dello Step
3**).

**Causa**: npm 11.16+ blocca di default gli script `install`/`postinstall` dei
pacchetti — inclusa la compilazione nativa di `better-sqlite3` — a meno che
non siano esplicitamente autorizzati nel campo `allowScripts` di
`package.json`, assente nel progetto. Su npm 12 (versione dell'utente) il
blocco è attivo di default, non solo un avviso.

**Fix**: popolato `allowScripts` con tutti i 6 pacchetti del progetto che
dichiarano script di installazione: `better-sqlite3@11.10.0` (build nativo),
`esbuild` in tre versioni annidate distinte (`0.28.0` diretta, `0.27.7` sotto
`tsx`, `0.25.12` sotto `vite` — necessario per `npm run build`),
`protobufjs@7.5.8` e `@google/genai@1.52.0` (provider Gemini dell'AI Advisor).
Confermato dall'utente su hardware reale dopo `npm rebuild` (un `npm install`
da solo non basta: non rilancia gli script per pacchetti già presenti in
`node_modules`, serve forzare la ricostruzione esplicitamente).

**File toccati** (1): `package.json`.

**Da fare al prossimo congelamento in milestone** (annotato, non eseguito ora
per non deviare dalla sequenza degli step di questa sessione): aggiungere
`npm rebuild` in `setup-linux.sh` subito dopo il suo `npm install` nudo
attuale — utile per qualunque installazione pulita su una macchina con npm
12+, non solo per questo caso specifico.

---

## v2.0.53-dev.5 — Step 4/8: ridotto `any` nei moduli backend/hooks piccoli

**Cosa cambia**: rimossi tutti i 20 usi di `any` in 11 file isolati (hooks
React minori, provider AI/cloud backup piccoli, plugin input/store non
centrali) — restano solo nei moduli grandi riservati agli step successivi
(`App.tsx`, `db.ts`, `notificationEngine.ts`, `server.ts`, `gameManager.ts`,
`downloadManager.ts`). Nessuna modifica di comportamento runtime, solo
tipizzazione — verificato caso per caso leggendo lo shape reale dietro
ogni cast prima di sostituirlo.

**Fix per file**:
- `hooks/useNotifications.ts`, `useCloudBackupProviders.ts`,
  `useAiAdvisorProviders.ts` — introdotte interfacce `RawNotificationRow`/
  `RawCloudBackupProvider`/`RawAiProvider` che rispecchiano esattamente lo
  shape delle rispettive route in `server.ts` (verificato leggendole), al
  posto di `any[]`. In `useNotifications.ts` la prima stesura usava tipi
  troppo larghi per `type`/`status`/`source`/`confidence` — corretto
  riusando gli stessi union type di `AppNotification` invece di
  `string`/`number` generici (l'errore `tsc` risultante ha confermato il
  problema, non un dettaglio cosmetico).
- `aiProviders/gemini.ts` — cast `any` sostituiti con i tipi ufficiali
  della SDK `@google/genai` (`GenerateContentResponse`/
  `GenerateContentResponseUsageMetadata`, verificati leggendo i `.d.ts`
  reali del pacchetto installato) — anche la "NOTA ONESTA" in testa al
  file aggiornata per riflettere che ora è verificato contro i tipi
  ufficiali, non più solo "uso noto dell'SDK".
- `cloudBackup/googleDrive.ts` — cast `any` su `server.address()`
  sostituiti col vero tipo `AddressInfo` di Node.
- `knowledgeBase.ts` — 3 cast sostituiti: `PRAGMA table_info` → `{ name:
  string }[]`, `SELECT COUNT(*)` → `{ n: number }`, seed JSON → nuova
  interfaccia `SeedKnowledgeEntry` (rivela che `action_params` nel seed
  arriva sia come oggetto che come stringa — già gestito correttamente dal
  codice esistente, solo non tipizzato).
- `runners/implementations.ts` — 2 cast **erano completamente superflui**
  (rimossi senza sostituzione: `env`/`cwd` erano già `Record<string,
  string>`/`string`, nessun conflitto reale mai esistito).
- `plugins/steamPlugin.ts` — un cast superfluo rimosso (`runner` in `Game`
  è già `string`, nessun union type da aggirare), l'altro sostituito con
  `SteamGetOwnedGamesResponse` per la risposta della Steam Web API.
- `input/plugins/XInputPlugin.ts`, `DS4Plugin.ts`, `DS5Plugin.ts` — i 3 cast
  su `vibrationActuator` erano giustificati da una nota che lo descriveva
  come "API sperimentale non tipizzata": verificato nei `.d.ts` di
  TypeScript che invece è già pienamente tipizzata
  (`GamepadHapticActuator.playEffect`) in questa versione — cast rimossi
  senza sostituzione, non serviva nemmeno un'interfaccia di estensione.

**File toccati** (11): `src/hooks/useNotifications.ts`,
`src/hooks/useCloudBackupProviders.ts`, `src/hooks/useAiAdvisorProviders.ts`,
`src/backend/aiProviders/gemini.ts`, `src/backend/cloudBackup/googleDrive.ts`,
`src/backend/knowledgeBase.ts`, `src/backend/runners/implementations.ts`,
`src/backend/plugins/steamPlugin.ts`, `src/input/plugins/XInputPlugin.ts`,
`src/input/plugins/DS4Plugin.ts`, `src/input/plugins/DS5Plugin.ts`.

**Verificato**: `tsc --noEmit` — 0 errori (invariato). Conteggio `any` nel
progetto: 176 → 156 (tutti i 20 rimossi appartenevano a questo step, nessun
altro toccato). Un errore di battitura intermedio (import lasciato a metà in
`DS4Plugin.ts`) è stato individuato e corretto dalla stessa verifica `tsc`
prima della consegna.

---

## v2.0.53-dev.6 — Step 5/8: middleware di errore centralizzato in server.ts

**Cosa cambia**: aggiunta una middleware Express di gestione errori
centralizzata, registrata come ultimo `app.use` prima di `app.listen`
(firma a 4 argomenti, l'unica forma che Express riconosce come error
handler). Copre le **23 route async su 94 che non avevano un try/catch
proprio** — scoperta fatta scansionando l'intero file: da Express 5.x le
promise rifiutate nei route handler vengono già inoltrate automaticamente
a un error handler, ma senza uno registrato la risposta di default di
Express è una pagina HTML, non JSON — rompendo silenziosamente ogni
`fetch(...).then(r => r.json())` del frontend con un errore di parsing
invece del messaggio reale. La middleware non tocca le route che già
gestiscono i propri errori (rispondono e ritornano prima che l'errore
possa arrivarci) — le integra solo per i percorsi che ne erano privi,
usando lo stesso formato `{success: false, message}` già dominante nel
resto del file (verificato contando i pattern di risposta esistenti prima
di scegliere questo formato, non l'altro minoritario `{error: ...}` in
uso in un numero minore di route più vecchie).

**Pulizia aggiuntiva scoperta durante il lavoro**: 9 blocchi `catch (e:
any)` erano sfuggiti alla normalizzazione dello Step 1 (il regex di
allora cercava solo `catch (varname)` senza annotazione di tipo esplicita
— questi la avevano). Rinominati a `catch (err)` con narrowing sicuro
(`err instanceof Error ? err.message : String(err)`), stesso pattern già
in uso nei blocchi già normalizzati nello stesso file. Nessun cambio di
messaggio prodotto per il caso reale (istanze di `Error`, la quasi totalità
dei casi pratici).

**Verificato**: `tsc --noEmit` — 0 errori. Testato con una build reale
(`npm run build` + avvio di `dist/server.cjs`): confermato che una route
di test che lancia un errore deliberato senza try/catch riceve ora
`HTTP 500` con `{"success":false,"message":"..."}` invece della vecchia
pagina HTML — e che le route esistenti (`/api/stores`, `/api/debug`,
`/api/runners/installable`) rispondono esattamente come prima, nessuna
regressione. Route di test rimossa prima della consegna.

**File toccati** (1): `server.ts`.

**Non toccato in questo step** (rischio/beneficio non favorevole per un
singolo turno, lasciato per un secondo passaggio se si vorrà approfondire
questo step): la migrazione riga-per-riga dei ~50 blocchi try/catch
esistenti nelle altre route per farli confluire nella nuova middleware
invece di rispondere autonomamente — la middleware è già una rete di
sicurezza pienamente funzionante per le route scoperte, senza bisogno di
toccare quelle già protette.

---

## v2.0.53-dev.7 — Step 6/8: estrazione hook da App.tsx (stato/logica pura)

**Cosa cambia**: estratti 3 blocchi stato+effetto completamente isolati da
`App.tsx` in hook dedicati sotto `src/hooks/` — nessun ID di navigazione
controller toccato (verificato con `check-focus-ids.cjs` prima/dopo,
risultato identico). Candidati scelti proprio per l'isolamento: ognuno
dipende al più da un singolo valore già presente altrove nel file (mai
azioni/setter usati altrove), riducendo al minimo il rischio.

1. **`useHostname()`** — nessuna dipendenza, un solo fetch al boot, letto
   in 2 punti JSX per display. Il candidato più semplice possibile.
2. **`useSystemInfo(activeSettingsTab)`** — un fetch alla prima apertura
   del tab Impostazioni → Hardware, mai più finché non cambia identità
   dell'oggetto. Letto in un solo blocco JSX (le 6 righe hardware).
3. **`usePredictedInstallSize(selectedGame)`** — fetch on-demand per
   gioco selezionato (solo GOG/Epic/Amazon), con cleanup (`cancelled`
   flag) per evitare race condition su cambio rapido di selezione.
   Restituisce `{ bytes, loading }`. Mantenuto l'ordine di dichiarazione
   originale (dopo `selectedGame`, per lo stesso motivo — errore TS2448 —
   già documentato nel commento originale).

**Candidati scartati per questo step** (troppo entangled per un'estrazione
sicura in un solo turno, annotati per una eventuale continuazione):
`availableRunners`/`installableRunners` — usati e modificati da **6 punti
diversi** sparsi nel file (SSE, refresh manuale, completamento
install/uninstall), non un singolo blocco isolato come i tre sopra;
estrarli richiederebbe toccare tutti e 6 i call site nello stesso turno,
rischio superiore a quanto ragionevole per questo step.

**File toccati** (4): `src/App.tsx`, `src/hooks/useHostname.ts` (nuovo),
`src/hooks/useSystemInfo.ts` (nuovo), `src/hooks/usePredictedInstallSize.ts`
(nuovo).

**Verificato**: `tsc --noEmit` — 0 errori (invariato). `check-focus-ids.cjs`
— 108 id dichiarati (invariato), stesso unico falso positivo noto
(`key-sugg-0`, solo spostato di riga per via delle rimozioni), stessi 8
riferimenti non risolvibili staticamente di prima — nessuna regressione di
navigazione. Build reale (`npm run build`) completata senza errori.
`App.tsx`: 10117 → 10088 righe, `useState` 30→29, `useEffect` 62→59
(esattamente i 3 blocchi estratti).

---

## v2.0.53-dev.8 — Step 7/8: ridotto `any` in db.ts e notificationEngine.ts

**Cosa cambia**: rimossi tutti i 50 usi di `any` nei due moduli grandi
rimasti (29 in `db.ts`, 21 in `notificationEngine.ts`). Nessuna modifica
di comportamento runtime salvo un bug reale corretto (vedi sotto).
Progetto totale: 156 → 70 (i 20 rimossi allo Step 4, i restanti 50 in
questi due file — l'`any` residuo nel progetto è ora confinato a
`server.ts`, `App.tsx`, `gameManager.ts`, `downloadManager.ts`, non
pienamente coperti dalla roadmap di questa sessione).

**`db.ts`**: definite interfacce dedicate per ogni riga grezza SQLite
(`GameRow`, `DownloadRow`, `CompatProfileRow`, `AiProviderCredentialRow`,
`CloudBackupCredentialRow`, `SharedLauncherPrefixDbRow`, più tipi puntuali
per le query parziali) al posto di `as any`/`as any[]` sparsi ovunque —
riflettono la realtà delle colonne SQLite (snake_case, `number | null`
dove la colonna non ha vincolo NOT NULL, mai `undefined` diretto dato che
better-sqlite3 restituisce sempre `null` per le colonne vuote).
`exportCompatProfilesRaw`/`importCompatProfilesRaw` (schema dinamico per
design, colonne lette con `Object.keys()`) tipizzate `Record<string,
unknown>[]` invece di `any[]` — genericità preservata senza aprire alla
manipolazione arbitraria che `any` permetteva.

**Bug reale trovato e corretto**: `Game.hltbHours.completionist` era
dichiarato `number` in `types.ts`, ma la colonna `hltb_completionist
INTEGER` non ha vincolo NOT NULL — l'API HowLongToBeat può restituire il
tempo "main story" senza quello "completionist". Verificato che il campo
non è mai letto in `App.tsx` (solo `.main` è mostrato in UI), quindi
corretto il tipo a `number | null` senza alcun rischio di rompere un
consumatore esistente.

**`notificationEngine.ts`**: fix strutturale, non solo cosmetico. Tutti i
20 cast `null as any` sparsi nel file condividevano la stessa causa
radice: `StoredNotification` dichiarava i campi opzionali come `field?:
string` (`string | undefined`), ma il codice deve scrivere esplicitamente
`null` (better-sqlite3 richiede la chiave presente anche per i parametri
nominati nulli — comportamento già documentato in un commento del file,
con la storia di un crash reale del demone causato da questo in passato).
`null` non è assegnabile a `undefined`, da cui il bisogno di aggirare il
controllo con `as any` ad ogni singola scrittura. Corretto in un solo
punto — il tipo dei campi in `StoredNotification` cambiato da `string` a
`string | null` — che ha eliminato automaticamente il bisogno di tutti i
20 cast sparsi nel file, invece di rimuoverli uno per uno.

**File toccati** (3): `src/backend/db.ts`, `src/backend/notificationEngine.ts`,
`src/types.ts` (solo il campo `hltbHours.completionist`).

**Verificato**: `tsc --noEmit` sull'intero progetto — 0 errori. Entrambi i
file confermati a zero `any` residui (una sola menzione testuale in un
commento di `notificationEngine.ts`, non codice).

---

## v2.0.53-dev.9 — Step 8/8: revisione mirata gameManager.ts/downloadManager.ts

**Cosa cambia**: rimossi tutti gli 11 `any` rimasti nei due moduli più
delicati del progetto (7 in `gameManager.ts`, 4 in `downloadManager.ts`).
**Deliberatamente NON un refactor strutturale** — coerente con l'avviso di
rischio di questo step nella roadmap (storia della saga Process Manager):
nessuna riga di logica di spawn/kill/gestione processi toccata, solo
correzioni di tipo pure, verificate con `tsc --noEmit` e una build reale
(`npm run build`) ad ogni checkpoint.

**`gameManager.ts`**:
- `catch (err: any)` (xset/DISPLAY) → `catch (err)` con narrowing
  `err instanceof Error && 'code' in err` per il controllo ENOENT.
- Parsing dell'output `legendary list-installed` (Epic): `any[]` → tipizzato
  `unknown[]` con un type predicate esplicito sul solo campo usato
  (`app_name`), stesso principio già applicato a `db.ts`/altri moduli negli
  step precedenti.
- `(query.store as any) !== 'undefined'`: **verificato il motivo reale del
  cast** (non arbitrario) — `query.store` è tipizzato `StoreType | 'All' |
  undefined`, ma il chiamante (`server.ts`, `GET /api/games`) passa
  `req.query` grezzo, che a runtime può contenere la stringa letterale
  `"undefined"` da un URL malformato. Sostituito con `as string` (più
  onesto di `any`, dato che qui si confronta solo una stringa) e
  documentato il motivo nel commento.
- `plugin as any` per chiamare `getPredictedInstallSizeBytes` (metodo
  presente solo su 3 dei plugin store, non sulla classe base): aggiunta
  la dichiarazione **opzionale** `getPredictedInstallSizeBytes?(gameId):
  Promise<number | null>` sulla classe astratta `StorePlugin` — zero
  impatto runtime (pure dichiarazione di tipo), elimina il cast e rende
  il controllo `typeof plugin.getPredictedInstallSizeBytes === 'function'`
  finalmente type-safe.

**`downloadManager.ts`**:
- Parsing di `goggame-*.info` (manifest GOG): stesso trattamento del
  parsing Epic sopra — `unknown` + type predicate sui soli campi usati
  (`isPrimary`, `type`, `path`, più `arguments`/`workingDir` opzionali).
- `catch (err: any)` → `catch (err)` con narrowing `err instanceof Error`.
- `(err as any).recentOutput = ...`: nuova interfaccia `RunnerExitError
  extends Error { recentOutput?: string }`, usata sia al punto di scrittura
  (dove l'errore viene creato) sia al punto di lettura (`errorCallbacks`) —
  stesso identico comportamento a runtime, ma tipizzato su entrambi i lati
  invece di un cast isolato solo alla scrittura.

**File toccati** (3): `src/backend/gameManager.ts`,
`src/backend/downloadManager.ts`, `src/backend/plugins/base.ts`.

**Verificato**: `tsc --noEmit` sull'intero progetto — 0 errori. Build reale
(`npm run build`) completata senza errori. **Non verificato su hardware
reale** — nessuna riga di comportamento runtime toccata in questo step
(solo tipi, zero modifiche a spawn/kill/timing/gestione segnali), ma dato
il rischio storico di quest'area, un avvio reale con lancio/installazione
di almeno un gioco resta la verifica finale raccomandata prima di
considerare la milestone chiusa.

**Roadmap di sessione completata (8/8 step)**. Con questo si chiude il
lavoro pianificato in `CHANGELOG-4.md`. `any` residuo nel progetto: solo
in `server.ts` e `App.tsx` (non coperti esplicitamente da nessuno step di
questa roadmap) — candidati per un'eventuale sessione futura.

---

## v2.1.9-Mercury — MILESTONE STABILE

Congelata su richiesta esplicita dell'utente. Nessun cambiamento di codice
in questa voce oltre a quanto già elencato in dev.1 → dev.9 sopra — solo
il congelamento: versione aggiornata in `App.tsx`/`package.json`
(`v2.1.9-Mercury`), minor version incrementata (2.0→2.1) per segnare che
questa milestone è una passata di ottimizzazione trasversale a tutto il
progetto, distinta per portata dai cicli di sviluppo feature-per-feature
delle Mercury precedenti.

**Riassunto del lavoro di questa milestone** (dettaglio completo in
dev.1-9 sopra, roadmap in 8 step di difficoltà crescente):

Sessione di sola ottimizzazione e correzione bug, nessuna nuova funzione —
partita da v2.0.53-Mercury. Naming uniforme dei blocchi `catch` in tutto
il progetto; commenti storici condensati nei moduli backend isolati (3
imprecisioni reali corrette nel processo); **tutti** gli 8 errori `tsc`
preesistenti risolti, compilazione completamente pulita per la prima
volta nella storia del progetto; **tutti** i 176 usi di `any` originari
ridotti a 70 (rimasti solo in `server.ts`/`App.tsx`, mai coperti da
questa roadmap); middleware di errore centralizzata in `server.ts` (23
route async prive di protezione propria, ora coperte); 3 hook estratti da
`App.tsx` con zero impatto sulla navigazione controller
(`check-focus-ids.cjs` invariato); 2 bug reali trovati e corretti durante
il lavoro di tipizzazione (`Game.hltbHours.completionist` nullable mai
riflesso nel tipo, `StoredNotification` con 20 cast `any` che
condividevano la stessa causa radice strutturale). Un bug ambientale
imprevisto emerso e risolto a metà sessione: `package.json` privo del
campo `allowScripts` (npm 12+ blocca di default gli script di
installazione dei pacchetti nativi), confermato risolto dall'utente su
hardware reale.

**Non verificato su hardware reale**: lo Step 8 (gameManager.ts/
downloadManager.ts) ha toccato solo tipi, mai comportamento runtime — ma
dato il rischio storico di quest'area (saga Process Manager), un avvio
con lancio/installazione di almeno un gioco resta la verifica raccomandata
prima di fare pieno affidamento su questa milestone in produzione.

**Resta aperto, parcheggiato per una sessione futura**: `any` residuo in
`server.ts` e `App.tsx` (mai assegnati a uno step esplicito di questa
roadmap); aggiungere `npm rebuild` in `setup-linux.sh` dopo il suo `npm
install` nudo, per evitare che il bug `allowScripts` di questa sessione
si ripresenti a una nuova installazione pulita su npm 12+.
