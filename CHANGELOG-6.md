# Changelog — v2.1.11-dev.1 in poi

Prosegue da `CHANGELOG-5.md` (chiuso alla milestone v2.1.10-Mercury). Nuova
sessione feature: estensione del Classic plugin/RetroArch a Saturn,
Dreamcast, PS2 e N64, con opzioni Auto-Remaster dove applicabile —
generalizzando quanto già verificato per PSX.

---

## v2.1.11-dev.1 — Saturn e PS2: riconoscimento base + Auto-Remaster

Prima estensione reale di `REMASTER_PRESETS` (finora conteneva solo PSX).
Emerso discutendo l'architettura con l'utente: non tutti i sistemi hanno
due core distinti da scambiare come PSX — necessaria una seconda modalità.

**Modifica strutturale**: `RemasterPreset` sdoppiato in due varianti
(union discriminata su un campo `mode`):
- `'swap-core'` (PSX, ora anche Saturn): due core per lo stesso sistema,
  uno fedele e uno potenziato. Disattivare il remaster = tornare al core
  di default; il file di preset per-contenuto resta scritto ma diventa
  irrilevante (vive nella cartella di config dell'altro core). Comportamento
  invariato rispetto a prima.
- `'toggle-options'` (PS2, in futuro N64): un solo core sempre in uso — il
  file di preset per-titolo è l'interruttore stesso. Aggiunta una funzione
  nuova, `removeRemasterOptions()`, che cancella quel file quando l'utente
  disattiva l'opzione, per far ricadere il gioco sulla configurazione di
  default a livello di CORE (nessun override, confermato dall'utente per
  PS2/LRPS2 — non serve nessun file "di default" separato).

**Saturn**: core di default Yabause (`yabause_libretro.so`, cartella
config `Yabause`), core remaster Kronos (`kronos_libretro.so`, cartella
config `Kronos` — fork potenziato di Yabause). Dump a `.cue`+`.bin` come
PSX → aggiunto a `CD_BASED_SYSTEMS`, riusa la stessa logica di ricerca
`.cue` già scritta per PSX senza modifiche. Preset preso di peso da un file
`.opt` reale fornito dall'utente (Sega Rally Championship) — nessuna riga
curata a mano, per sua scelta esplicita ("si può sempre modificare a mano
da RetroArch se qualcosa non funziona").

**PS2**: core unico `pcsx2_libretro.so` (lrpcs2), cartella config `LRPS2`.
Dump a `.iso` singolo file → **non** aggiunto a `CD_BASED_SYSTEMS`, si
comporta come i sistemi a cartuccia in fase di estrazione/scansione
(confermato dall'utente). Preset preso di peso da un file `.opt` reale
(Metal Gear Solid 3 — Snake Eater), stessa logica "nessuna curatela" di
Saturn.

Aggiunte anche le voci di riconoscimento base per entrambi in `SYSTEM_MAP`
(alias `saturn`/`sat` e `ps2`), `CANONICAL_SYSTEM_FOLDERS` (`SATURN`,
`PS2`) e `COMPATIBLE_CORES_BY_SYSTEM`. Nessuna estensione ROM nuova
necessaria (`.cue`/`.img`/`.iso`/`.bin` già coperti).

`gameManager.ts` (`setRemasterEnabled`) aggiornato per ramificare sul
campo `mode` del preset invece di assumere sempre uno swap di core.

**N64**: discusso ma NON implementato in questo giro — secondo l'utente
il core (mupen64plus_next) non offre margini di miglioramento significativi
per risoluzione/filtri texture, quindi resta "standard" senza voce in
`REMASTER_PRESETS` per ora. Il riconoscimento base esisteva già da prima
di questa sessione.

**Verificato**: `tsc --noEmit` pulito su entrambi i file toccati
(`classicPlugin.ts`, `gameManager.ts`) — isolati due errori preesistenti
nello zip e non collegati a questa modifica (`tsconfig.json` con
`ignoreDeprecations` incompatibile con la versione di TypeScript
disponibile in questa sessione; modulo `howlongtobeat` non risolvibile in
`metadataManager.ts`), nessuno dei due toccato.

**Non ancora confermato su hardware reale** — in attesa che l'utente
verifichi scan/lancio di un gioco Saturn e uno PS2 dalle nuove cartelle,
più il toggle Auto-Remaster su entrambi (in particolare che PS2 rimuova
davvero il file `.opt` alla disattivazione).

**Resta aperto**: Dreamcast, ultimo sistema della roadmap — core, path,
formato dump e cartella config ancora tutti da verificare da zero.

## v2.1.11-dev.2 — Fix overlay: pulsante Auto-Remaster mancante/inconsistente per Saturn e PS2

Bug reale segnalato dall'utente, due cause distinte:

1. **Saturn**: il pulsante Auto-Remaster dedicato semplicemente non compariva
   nell'overlay — dev.1 aveva aggiunto il preset lato backend
   (`REMASTER_PRESETS.saturn`) ma non la voce corrispondente in
   `REMASTER_HINT_BY_SYSTEM` lato frontend (App.tsx), da cui dipende la
   visibilità del pulsante. Aggiunta (`saturn: 'kronos'`), stesso
   meccanismo già usato per PSX.

2. **PS2**: causa più profonda — essendo un preset `'toggle-options'` (core
   sempre `pcsx2_libretro.so`, mai swap), il meccanismo esistente per
   sapere se il remaster è attivo (sottostringa nel nome del core) non
   può funzionare: il core non cambia mai, quindi la condizione sarebbe
   sempre vera o sempre falsa a prescindere dallo stato reale. Serviva un
   indicatore di stato indipendente dal core.

**Fix**: nuova colonna DB `remaster_enabled` (default 0, ALTER TABLE
retrocompatibile — PSX/Saturn continuano a ignorarla, invariati), scritta
da `setRemasterEnabled` (gameManager.ts) solo per i preset
`toggle-options`. Aggiunto il campo `remasterEnabled` al tipo `Game` e a
`updateGameConfig`. Lato App.tsx, introdotto `REMASTER_TOGGLE_SYSTEMS`
(insieme dei sistemi che usano questo meccanismo, per ora solo `ps2`): il
pulsante calcola `isEnabled` da `selectedGame.remasterEnabled` per questi
sistemi, dalla sottostringa sul core per tutti gli altri (PSX/Saturn,
comportamento invariato).

**Verificata anche la richiesta di riconferma dell'utente** sul resto del
comportamento overlay (lista core filtrata per sistema, switch ON sul
core attivo) — già corretto e funzionante per Saturn/PS2 grazie al
riconoscimento base aggiunto in dev.1 (`COMPATIBLE_CORES_BY_SYSTEM`),
nessuna modifica necessaria lì. Per PS2 in particolare la lista non
mostra alcuno switch aggiuntivo (un solo core compatibile, sempre
default) — comportamento corretto, non un'omissione.

`tsc --noEmit` pulito (stessi due errori preesistenti isolati di dev.1,
non toccati). `check-focus-ids.cjs` invariato (109 id, nessun nuovo id
introdotto — stesso falso positivo noto `key-sugg-0`).

**Non ancora confermato su hardware reale.**

## v2.1.11-dev.3 — Fix bug reale: navigazione bloccata alla chiusura del gioco finché non si apre/richiude il quick-menu

Segnalato dall'utente, non collegato a Saturn/PS2/N64 — un bug preesistente
nella gestione della splash integrata (v2.1.10-dev.12), riemerso solo ora
testando lanci reali con i sistemi appena aggiunti.

**Causa**: `openSplashEventSource` imposta `activeGroup = 'splash'` per
isolare l'overlay di caricamento dalla dashboard sottostante (scelta
corretta), ma `closeSplash` non lo riportava MAI a `null` alla chiusura.
`moveFocus` (FocusProvider.tsx) usa `activeGroup ?? 'dashboard'` come pool
di elementi validi: con `activeGroup` bloccato su `'splash'` e nessun
Focusable di quel group più montato (la splash è sparita), il pool
risultava vuoto e ogni pressione di D-pad/analogico non produceva
letteralmente nulla — anche con `isFocusFrozen` già tornato `false` alla
chiusura reale del gioco. Aprire e richiudere il quick-menu con Start
"risolveva" per puro effetto collaterale: l'apertura imposta
`activeGroup = 'quick-menu'` (sovrascrivendo `'splash'`), la chiusura lo
riporta correttamente a `null`.

**Fix**: `closeSplash` ora resetta `activeGroup` a `null`, ma solo se è
ancora `'splash'` nel momento in cui viene chiamata (letto da un nuovo
`activeGroupRef`, per lo stesso motivo di closure stale di
`focusedIdRef`) — per non scavalcare un altro scope apertosi nel
frattempo (es. Gestore Processi via Select+L1+R1 mentre la splash era
ancora tecnicamente in corso).

`tsc --noEmit` pulito, `check-focus-ids.cjs` invariato (109 id, stesso
falso positivo noto `key-sugg-0`, nessun nuovo id introdotto).

**Da confermare su hardware reale**: che il D-pad/analogico rispondano
subito alla chiusura di un gioco, senza dover più passare dal quick-menu.

## v2.1.11-dev.4 — Reset idle via XTest nel tray, sempre attivo (non solo durante il gioco)

Richiesta dell'utente dopo aver confermato che l'inibizione esistente
(`xset`/`systemd-inhibit`, v1.1.33-v1.1.35 in `gameManager.ts`) — attiva
SOLO durante una sessione di gioco effettivamente rilevata — non basta:
il tempo passato sulla Dashboard stessa, con solo un controller
collegato, non genera alcuna attività reale osservabile dal server X (il
Gamepad API di Chromium non passa dagli stessi eventi che X11 usa per il
proprio idle timer), quindi schermo/sessione si bloccano comunque lì.

**Soluzione adottata**: nuovo thread `idle_reset_loop()` in `tray.py`
(il demone systray, già vivo per l'intera sessione HTPC dal boot,
indipendentemente da quale gioco è in esecuzione o se si è sulla
Dashboard) — ogni 60s inietta un micro-movimento del puntatore (1px
avanti e indietro) via estensione XTest (`python-xlib`, già una
dipendenza del tray per la gestione cursore XFixes esistente — nessuna
dipendenza nuova). Spostamento impercettibile e innocuo per qualunque
gioco/finestra in primo piano (nessun click, nessun tasto, netto zero),
sufficiente a far registrare "attività reale" al server X.

Scartato di proposito un vero movimento relativo (0,0): alcuni server X
non lo trattano come attività reale (nessun evento generato per un
delta nullo) — lo stesso tipo di soluzione apparentemente equivalente
ma silenziosamente inefficace già capitato in questo progetto (v1.1.34,
`xset` senza `DISPLAY`: log di successo, nessun effetto reale). Un 1px
avanti e indietro garantisce un evento di movimento vero.

Gira SEMPRE, non condizionato allo stato di gioco — complementare, non
sostitutivo, all'inibizione `xset`/`systemd-inhibit` esistente in
`gameManager.ts` (lasciata invariata): quella copre anche la sospensione
di sistema via logind, che questo meccanismo non tocca; questo copre il
tempo sulla Dashboard, che quella non copriva.

**NOTA ONESTA** (esplicitata nel codice, stesso avviso già presente per
`cursor_loop`): l'uso esatto delle API XTest di python-xlib qui non è
stato verificato con un test dal vivo in questo ambiente (nessun server
X disponibile in sandbox) — scritto secondo pattern noti d'uso reale
della libreria (lo stesso meccanismo usato internamente da `xdotool`),
ma è il primo giro empirico. Degrado pulito se l'estensione XTEST non è
disponibile o `python-xlib` non è installato (stesso pattern di
`cursor_loop` — logga il motivo, il resto del tray continua a
funzionare normalmente).

`python3 -m py_compile tray.py` pulito.

**Da confermare su hardware reale — priorità alta data la NOTA ONESTA
sopra**: che l'iniezione XTest funzioni davvero e che impedisca
effettivamente l'attivazione di screensaver/DPMS/blocco sessione dopo il
timeout configurato, sia sulla Dashboard che durante il gioco.

**Confermato su hardware reale (dev.1-dev.4 tutti):** Saturn, PS2 e il
fix di navigazione post-chiusura gioco funzionano; il reset idle via
XTest impedisce davvero l'attivazione di screensaver/risparmio
energetico.

## v2.1.11-dev.5 — Avviato Dreamcast: riconoscimento base

Core confermato **flycast** (unico core libretro Dreamcast mantenuto
attivamente) — path verificato da fonte ufficiale Arch Linux (pacchetto
`libretro-flycast`, repo `extra`: `/usr/lib/libretro/flycast_libretro.so`),
non ancora installato sul sistema dell'utente al momento di questa voce.
Dump a `.chd` (confermato dall'utente) — formato compresso a file
singolo, stesso trattamento di PS2: **non** aggiunto a
`CD_BASED_SYSTEMS`.

Aggiunte in `classicPlugin.ts`: `SYSTEM_MAP` (alias `dreamcast`/`dc`),
`CANONICAL_SYSTEM_FOLDERS` (`DREAMCAST`), `COMPATIBLE_CORES_BY_SYSTEM`,
`.chd` a `ROM_EXTENSIONS` (utile anche a PS2/Saturn, non solo Dreamcast).

**Non ancora fatto**: `REMASTER_PRESETS.dreamcast` — serve installare il
core, verificarne la cartella config reale (`~/.config/retroarch/config/`)
e un file `.opt` reale con le opzioni desiderate, stesso processo seguito
per Saturn/PS2. `tsc --noEmit` pulito.

## v2.1.11-dev.6 — Rilevamento multi-disco (nessun titolo reale ancora in libreria — verificato solo su convenzioni note)

Discusso con l'utente: nessun titolo multi-disco reale nella sua libreria
al momento di questa voce (verificato: gli esempi mostrati — Grandia II,
Sega Rally, Silent Hill — erano dischi singoli multi-traccia, non
multi-disco). Rilevamento quindi progettato astrattamente sulle
convenzioni note (Redump/No-Intro: `(Disc N)`, `(Disk N)`, `(CD N)`,
parentesi tonde o quadre), da confermare contro un titolo reale quando
capiterà.

**Decisione esplicita dell'utente**, dopo discussione sui rischi: i
dischi singoli continuano a lanciarsi direttamente dal loro file
(`.cue`/`.chd`/`.gdi`/`.iso`) — comportamento **invariato**, zero rischio
per la libreria esistente (già ampia e configurata). La generazione di un
`.m3u` scatta SOLO quando lo scan trova realmente 2+ file con lo stesso
titolo base e un tag disco — non più genericamente "sempre", come
proposto inizialmente.

**Implementazione** (`classicPlugin.ts`): nuova `groupDiscs()` — regex
`DISC_TAG_RE` isola il numero disco e il titolo base da un filename; un
gruppo con 2+ membri è un multi-disco reale (ordinato per numero disco),
un gruppo da 1 torna tra i singoli con il nome file originale intatto
(nessuna differenza rispetto a oggi). Verificato contro i tre esempi reali
dell'utente più una manciata ipotetici (Final Fantasy VII, Riven, Metal
Gear Solid, varie convenzioni di tag) — zero falsi positivi sui nomi reali
(`(Made in USA)`, `(v1.1)` non scambiati per tag disco).

Nuovo `buildMultiDiscGame()`: per un multi-disco reale, risolve il
percorso di ciascun disco (stesso `extractCdImageIfNeeded` già usato per i
singoli — se un disco è uno zip, viene estratto esattamente come
accadrebbe da solo), scrive un `.m3u` con un percorso risolto per riga
accanto ai file originali in `systemDir`, e costruisce un **unico** `Game`
il cui `executablePath` è quel `.m3u` — non più N entry separate, una per
disco. Il `.m3u` viene riscritto ad ogni scan (costo trascurabile) così un
disco aggiunto in un secondo momento viene ripreso automaticamente.

**Scoperto durante la ricerca** (non assunto): il supporto `.m3u` è
confermato per PSX, Saturn e Dreamcast/flycast — **non trovata alcuna
fonte che confermi (né smentisca) il supporto in PCSX2/lrpcs2** per PS2,
quindi `MULTI_DISC_SYSTEMS` lo esclude di proposito per ora (riaggiungibile
quando/se capiterà un titolo PS2 multi-disco reale da verificare). Il
nome del `.m3u` riusa sempre lo stesso titolo base dei dischi che
raggruppa, per coerenza con la convenzione RetroArch dei salvataggi
(nome del salvataggio = nome del contenuto caricato, `.m3u` incluso).

`tsc --noEmit` pulito. **Non testato contro un file reale** (nessuno
disponibile in libreria) — priorità alta al primo titolo multi-disco
vero che capiterà.

## v2.1.11-dev.7 — Fix bug reale: cartelle-gioco non zippate invisibili allo scan (Dreamcast GDI)

Segnalato dall'utente con repro esatto: cartella `Grandia II (USA)/` con
dentro `.cue`+`.gdi`+`.bin` sciolti (dump GDI non zippato, comune per
Dreamcast) **non veniva vista affatto** — `Sonic Adventure 2 (Europe)
(...).chd`, un file diretto, sì. Causa: lo scan (`getLibrary()`)
guardava solo i FILE con estensione riconosciuta direttamente dentro la
cartella di sistema; una sottocartella non zippata non è mai stata
prevista, a differenza dell'estrazione automatica di uno zip (che produce
comunque un file `.cue` in una cartella `.extracted/` interna, gestita).

**Fix**: nuova `findPrimaryDiscFile(dir)` — cerca dentro una cartella il
file "principale" con priorità fissa `.gdi` → `.cue` → `.chd` → `.iso`
(mai un `.bin` sciolto come ripiego: un dump con solo tracce e senza
indice è incompleto, meglio ignorarlo che indovinare). Verificato con un
test a mano contro il listing reale di Grandia II: sceglie correttamente
il `.gdi` (nativo per flycast) invece del `.cue` presente nella stessa
cartella.

Lo scan ora considera come candidati sia i file diretti sia le
sottocartelle che contengono un file principale riconoscibile (nuovo tipo
`DiscCandidate`, `kind: 'file' | 'folder'`) — esclusa esplicitamente
`.extracted` (la cache di estrazione esistente, mai un candidato).
`groupDiscs()` (dev.6) esteso per accettare entrambi i tipi di candidato
uniformemente, così una cartella-gioco può finire sia come singolo
(nuovo `buildGameFromFolder()`, titolo dal nome cartella, nessuna
estrazione necessaria) sia come parte di un multi-disco
(`buildMultiDiscGame()` aggiornato per risolvere il file giusto sia per i
candidati file sia cartella).

`tsc --noEmit` pulito. **Da confermare su hardware reale**: che
`Grandia II (USA)` compaia ora nello scan di Dreamcast e si lanci
correttamente dal `.gdi`.

## v2.1.11-dev.8 — Estesa l'estrazione persistente (.extracted/) a Dreamcast e PS2

Richiesta dell'utente, che ricordava la convenzione `.extracted/`
introdotta per PSX (v1.1.105) e ne ha chiesto l'estensione a tutti i
sistemi a disco ottico quando la ROM è un archivio zip.

**Verificato prima di implementare** (non assunto): il meccanismo
automatico di RetroArch per leggere un file singolo dentro uno zip
dipende dall'opzione `cache_directory` — documentato su GitHub upstream
come silenziosamente fallimentare se la cartella non esiste, e con
comportamento diverso da core a core se non configurato affatto. La
nostra estrazione persistente (già affidabile per PSX/Saturn) è quindi
preferibile anche per i formati a file singolo (Dreamcast `.chd`, PS2
`.iso`), non solo per il caso multi-file `.cue`+`.bin` che l'aveva
originata.

**Modifiche** (`classicPlugin.ts`): `CD_BASED_SYSTEMS` esteso da
`['psx','saturn']` a tutti e quattro i sistemi a disco ottico
(`+dreamcast, +ps2`) — ora copre l'estrazione persistente in generale,
non solo il caso cue+bin. Rimossa `findCueFile` (cue-only), sostituita
ovunque da `findPrimaryDiscFile` (dev.7 — priorità `.gdi`→`.cue`→`.chd`→
`.iso`, già usata per le cartelle non zippate): stessa funzione riusata
sia per il caso "trovato dopo estrazione" sia per il caso "estratto a
mano dall'utente" (`findMatchingCueInDir`, anch'essa generalizzata oltre
al solo `.cue`).

Nessun impatto su PSX/Saturn (stesso comportamento, solo `.cue` presente
nei loro dump). `MULTI_DISC_SYSTEMS` (dev.6) resta invariato — decisione
indipendente, PS2 ancora escluso lì per il supporto `.m3u` non
confermato.

`tsc --noEmit` pulito, nessun riferimento orfano rimasto a `findCueFile`.
**Da confermare su hardware reale**: che uno zip Dreamcast/PS2 venga
davvero estratto in `.extracted/` al primo scan invece di essere passato
crudo a RetroArch.

## v2.1.11-dev.9 — Fix bug reale (doppio): ri-estrazione ad ogni scan + sovrascrittura continua del path nel DB

Segnalato dall'utente con log reali, per Grandia 2 (Dreamcast) e Crash
Bandicoot (PSX) — entrambi ri-estratti e ri-loggati come "nessun file
principale trovato" ad ogni singolo scan/sync, nonostante fossero già
estratti correttamente e l'utente ne avesse pure corretto a mano il
path di lancio nel DB.

**Causa unica per entrambi i sintomi**: `findPrimaryDiscFile` (dev.7)
cercava solo al PRIMO livello della cartella. I due archivi in questione
impacchettano una sottocartella interna (`Grandia 2.7z` → dentro
`Grandia II (USA)/` coi file, non i file sciolti alla radice) — comune,
non tutti i packager mettono i file alla radice dell'archivio.
L'estrazione riusciva perfettamente un livello più sotto, ma la ricerca
non ci arrivava mai:

1. La stessa funzione è usata anche come **cache-check** (evitare di
   ri-estrarre se già fatto in un giro precedente) — fallendo sempre,
   il codice pensava che l'estrazione non fosse mai avvenuta e la
   **rifaceva da capo ad ogni scan** (un 7z da 850MB, bloccante e
   sincrono) — causa diretta del rallentamento cambiando libreria
   segnalato dall'utente, non un semplice fastidio nei log.
2. Ogni volta che la ricerca falliva comunque (anche dopo la
   ri-estrazione), il codice scriveva nel DB il fallback (l'archivio
   grezzo `.7z`) come `executablePath` — **cancellando ad ogni sync**
   il fix manuale dell'utente che puntava al file corretto.

**Fix**: `findPrimaryDiscFile` ora cerca in ampiezza, livello per
livello (non solo il primo), fino a 3 cartelle annidate — un file
trovato a un livello più superficiale vince sempre su uno più annidato
a parità di priorità di estensione (invariata: `.gdi`→`.cue`→`.chd`→
`.iso`). Verificato con una simulazione della struttura reale riportata
nei log (cartella con un livello di annidamento) — trova correttamente
il file. Risolve entrambi i sintomi insieme: la cache-check ora
funziona (niente più ri-estrazione ripetuta), e l'`executablePath`
risolto è quello vero — l'eventuale fix manuale dell'utente nel DB
diventa superfluo ma non viene più cancellato nemmeno se lasciato.

`tsc --noEmit` pulito. **Da confermare su hardware reale**: che Grandia 2
e Crash Bandicoot non vengano più ri-estratti ad ogni scan, e che il
rallentamento cambiando libreria sia sparito.

## v2.1.11-dev.10 — Auto-Remaster Dreamcast: chiusura del ciclo

Core config folder confermata (`Flycast`, dopo il primo lancio reale di
Grandia 2). `REMASTER_PRESETS.dreamcast` aggiunto — modalità
`toggle-options` come PS2 (unico core, nessuno swap), preset preso di
peso da una configurazione reale fornita dall'utente (stessa scelta di
Saturn/PS2: nessuna curatela/sottoinsieme, verbatim). `dreamcast`
aggiunto a `REMASTER_TOGGLE_SYSTEMS` in `App.tsx` — il pulsante
Auto-Remaster ora compare nell'overlay anche per i giochi Dreamcast.

Con questo la roadmap di questo ciclo (Saturn, Dreamcast, PS2, N64) è
completa lato codice per tutti i sistemi tranne N64, per cui l'utente ha
deciso di non procedere (mupen64plus_next non offre margini di
miglioramento significativi — resta "standard", nessuna voce in
`REMASTER_PRESETS`).

`tsc --noEmit` pulito, `check-focus-ids.cjs` invariato (nessun nuovo id).
**Da confermare su hardware reale**: che il pulsante Auto-Remaster
compaia per i giochi Dreamcast e che il preset funzioni al primo
avvio.

## v2.1.11-dev.11 — Fix bug reale: preset Dreamcast con prefisso chiavi sbagliato, ignorato silenziosamente

Segnalato dall'utente: attivando l'Auto-Remaster su un gioco Dreamcast,
il file custom veniva completamente ignorato. Causa reale, non un
errore di sintassi come sospettato inizialmente: il preset di dev.10
usava chiavi con prefisso `flycast_*`, che semplicemente non esistono —
flycast è un fork di Reicast e ha mantenuto lo stesso namespace di
opzioni (`reicast_*`) per compatibilità. Confermato confrontando con un
`.opt` di default reale caricato dall'utente: più della metà delle
chiavi della lista originale (fornita in dev.10, non verificata da un
file reale come fatto per Saturn/PS2) non corrispondeva comunque a
nessuna opzione reale del core, non solo con prefisso diverso — la
fonte di quella lista non era il menu opzioni reale di RetroArch.

**Fix**: preset sostituito interamente con un `.opt` per-titolo REALE
(Sonic Adventure 2, generato da RetroArch stesso salvando un override
dal Quick Menu, non scritto a mano) — stessa metodologia verbatim già
usata per Saturn/PS2. Confrontandolo col default: risoluzione interna
640×480→1920×1440, cavo TV (Composite)→VGA, filtro anisotropico 4→8,
texture filtering 0→1, PVR2 filtering e widescreen entrambi attivati —
un vero preset "remaster", non i placeholder inventati di dev.10.

`tsc --noEmit` pulito. **Da confermare su hardware reale**: che il
preset venga davvero applicato attivando l'Auto-Remaster su un gioco
Dreamcast (il test che aveva fatto emergere il bug).

## v2.1.11-dev.12 — Fix UI: scrollbar invisibile nel tema chiaro + scroll impreciso col mouse

Due richieste dell'utente, entrambe verificate nel codice prima di
intervenire.

**Scrollbar invisibile nel tema chiaro** (`index.css`): il pollice era
bianco al 10% di opacità — leggibile sullo sfondo quasi nero del tema
scuro, ma praticamente invisibile su uno sfondo chiaro/bianco. Sostituito
con un grigio pieno (`rgba(120,130,145,...)`), indipendente dalla
luminosità dello sfondo sottostante — stesso aspetto in entrambi i temi,
come richiesto, e visibile in tutti e due.

**Scroll impreciso col mouse nelle liste dell'overlay** (causa reale
trovata in `FocusProvider.tsx`, non nella gestione eventi del mouse in
sé, che non esiste come percorso separato): `setFocusedId` — chiamata sia
dalla navigazione a D-pad sia dall'hover del mouse (`handleMouseEnter`),
un'unica funzione condivisa — include un'animazione di ri-centraggio
automatico dello scroll, pensata per il D-pad (l'unico modo lì per
portare in vista la card selezionata). Applicata anche all'hover del
mouse, ogni volta che il cursore passava sopra un nuovo elemento durante
uno scroll a rotella l'animazione scattava e "tirava indietro" la
posizione — in competizione diretta con lo scroll manuale dell'utente,
da cui l'imprecisione osservata.

**Fix**: nuovo parametro opzionale `skipScroll` su `setFocusedId`
(retrocompatibile — tutte le chiamate esistenti, ~40 in `App.tsx`, non
lo passano e mantengono il comportamento invariato). `handleMouseEnter`
lo passa `true`: l'hover del mouse continua ad aggiornare il focus
visivo (la card sotto il cursore resta evidenziata) ma non forza più
alcuno scroll — lo scroll a rotella torna nativo e senza interferenze.

`tsc --noEmit` pulito, `check-focus-ids.cjs` invariato (109 id, nessun
nuovo id introdotto, comportamento D-pad non toccato). **Da confermare
su hardware reale**: che la scrollbar sia visibile nel tema chiaro e che
lo scroll col mouse nelle liste (overlay opzioni, menu di sistema) sia
ora fluido e preciso.

## v2.1.11-dev.13 — Fix UI: pulsanti custom env invisibili nel tema chiaro finché non selezionati

Richiesta dell'utente — stesso tipo di problema di dev.12 ma in un altro
punto dell'overlay: i tre controlli della sezione variabili d'ambiente
custom (pill "Persistente"/"Solo installazione", pulsante X per
eliminare una riga, pulsante "Aggiungi variabile") usavano classi basate
su trasparenza del bianco (`white/5`, `white/10`, `white/30`...) per lo
stato NON selezionato, mai condizionate al tema — leggibili sullo sfondo
scuro, invisibili o quasi su sfondo chiaro. Lo stato selezionato (colori
pieni: blu, rosso, ambra) non aveva questo problema, da cui "invisibili
finché non evidenziati".

Aggiunta una variante tema chiaro per lo stato non selezionato di tutti
e tre i controlli, più la caption sottostante (stesso problema, stessa
causa) — riuso della stessa coppia già presente altrove nel file
(`border-white/10 text-white/50` ↔ `border-gray-300 text-gray-500`) per
coerenza visiva con il resto dell'overlay. Stato selezionato invariato
in entrambi i temi.

`tsc --noEmit` pulito, `check-focus-ids.cjs` invariato (109 id). **Da
confermare su hardware reale**: che i tre controlli siano visibili nel
tema chiaro anche senza focus.

## v2.1.11-dev.14 — Fix UI: checkbox dipendenze Wine + sfondo runner installabili nel tema chiaro

Due richieste dell'utente, stesso tipo di problema delle due voci
precedenti.

**Checkbox verb winetricks** (overlay dipendenze Wine): il bordo dello
stato non selezionato/non a fuoco era `border-white/20`, invisibile su
sfondo chiaro. Sostituito con un grigio fisso (`border-gray-500`),
indipendente dal tema — richiesta esplicita dell'utente ("stesso grigio
del tema dark"), stessa filosofia della scrollbar (dev.12): non una
variante per tema, un colore identico in entrambi.

**Runner installabili** (Impostazioni → Account): la riga di ogni runner
non ancora installato usava uno sfondo fisso (`bg-white/5 border
border-white/5`), mai condizionato al tema — a differenza della riga
"runner installati" appena sopra, che aveva già la variante corretta.
Applicata la stessa coppia (`bg-gray-50 border-gray-200` nel tema
chiaro) anche qui, più l'icona pacchetto (stessa causa, stesso posto).

`tsc --noEmit` pulito, `check-focus-ids.cjs` invariato (109 id,
nessuna modifica alla navigazione). **Da confermare su hardware reale**:
checkbox verb e riga runner installabili visibili nel tema chiaro.

## v2.1.11-dev.15 — Fix UI: radio versione OS, stessa causa di dev.14

Richiesta dell'utente di uniformare — stesso identico problema del
checkbox verb winetricks appena corretto: l'indicatore radio (scelta
singola tra le versioni Windows del prefix Wine) usava anche lui
`border-white/20` per lo stato non selezionato/non a fuoco, invisibile
su sfondo chiaro. Sostituito con lo stesso grigio fisso `border-gray-500`
già usato per i verb, per coerenza visiva tra i due controlli
nello stesso overlay.

`tsc --noEmit` pulito, `check-focus-ids.cjs` invariato (109 id). **Da
confermare su hardware reale**: radio versione OS visibile nel tema
chiaro anche senza focus.

## v2.1.11-dev.16 — Fix UI: titolo illeggibile nelle card libreria nel tema chiaro

Richiesta dell'utente: il titolo (`<h3>`) nelle card della libreria non
aveva un colore testo esplicito — ereditava quello globale della pagina
(`text-gray-900`, quasi nero, nel tema chiaro), sovrapposto però a un
gradiente SEMPRE nero sotto il titolo (`from-black/90`, indipendente dal
tema, necessario per la leggibilità sopra la cover art) — nero su nero,
illeggibile. Nel tema scuro il colore ereditato (`text-gray-100`, quasi
bianco) funzionava per puro caso, non per un colore esplicito corretto.

**Fix**: `text-white` esplicito sul titolo — stesso colore in entrambi i
temi, come richiesto, sempre leggibile sul gradiente nero sottostante
che non cambia mai. Confermato essere l'unico punto del codice che
renderizza `game.title` nelle card (nessun'altra vista con lo stesso
problema).

`tsc --noEmit` pulito, `check-focus-ids.cjs` invariato (109 id). **Da
confermare su hardware reale**: titolo leggibile nelle card libreria nel
tema chiaro.

---

## Congelato — MILESTONE STABILE v2.2.16-Mercury

Ciclo chiuso qui (dev.1→dev.16). Riepilogo: supporto completo a Saturn,
Dreamcast e PS2 nel Classic plugin (riconoscimento base, Auto-Remaster,
multi-disco, estrazione persistente) — N64 escluso per scelta esplicita
dell'utente (nessun margine di miglioramento significativo sul core
disponibile). Un bug reale di navigazione post-splash (dev.3) e uno di
ri-estrazione infinita/sovrascrittura DB (dev.9), entrambi segnalati
dall'utente e risolti. Sei fix di leggibilità nel tema chiaro (dev.12→
dev.16), un fix di reset idle/screensaver via XTest nel tray (dev.4).

**Non tutti gli step sono stati confermati singolarmente su hardware
reale prima di questo congelamento** — Saturn/PS2/idle-reset (dev.1→
dev.4) sì, il resto (dev.5→dev.16, inclusi Dreamcast e i fix tema
chiaro) resta da verificare dal vivo dopo l'aggiornamento a questa
milestone.
