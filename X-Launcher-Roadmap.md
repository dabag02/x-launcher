# X-Launcher HTPC — Roadmap di sviluppo

Documento di riferimento elaborato dall'analisi tecnica del progetto
e dal confronto con il documento Analisi_XLauncher_HTPC.

## Milestone stabili

Da v1.1.79 in poi, ogni milestone stabile prende il nome di un pianeta o satellite del sistema solare (richiesta esplicita dell'utente).

- **v2.0.41-Mercury** (16 agosto 2026) — seconda della serie Mercury. Gamescope per-gioco (switch a 4 stati) e splash screen di lancio (roadmap usabilità punto 2/3) completati end-to-end, entrambi dopo lunghe sessioni di diagnosi reale su hardware — vedi CHANGELOG-3.md per il dettaglio completo (dev.1 → dev.47) e la sezione "Roadmap usabilità" più sotto per lo stato aggiornato dei tre punti (Gamescope/splash/monitor processi).
- **v2.0.40-Mercury** (10 agosto 2026) — prima Mercury, salto di versione maggiore: supporto ai launcher condivisi generico e verificato su due giochi reali distinti, container Steam Linux Runtime esteso a ogni lancio Proton, file manager nativo integrato. Vedi CHANGELOG-2.md.
- **v1.1.79-Gaia** (18 luglio 2026) — Step 18, Step 19b (i18n) e Step 19a (`xlaunch://`) tutti chiusi e testati su hardware reale; migliorie RetroArch e tastiera virtuale incluse. Vedi CHANGELOG.md per il dettaglio completo di ogni versione dalla milestone precedente fino a questa.
- v1.1.65-rc.3 (16 luglio 2026) — interfaccia interamente bilingue + log di debug unificati in inglese (milestone precedente, nome non adottato: la convenzione parte da Gaia)

## Regole di sviluppo consolidate in questa sessione

Convenzioni emerse e adottate stabilmente nel corso della sessione, valide per tutto il lavoro successivo:

- **Bilingue di default**: ogni nuova funzione che introduce testo va realizzata in italiano E inglese fin da subito, non più italiano-poi-tradotto-dopo. I log di debug (`writeLog`/`console.*`) restano invece **solo in inglese** — mai bilingue, la lingua franca dello sviluppo non va tradotta né tenuta doppia.
- **Versionamento**: ogni milestone stabile prende il nome di un pianeta o satellite del sistema solare (prima: v1.1.79-Gaia). Fra una milestone e l'altra, le build di sviluppo intermedie portano il suffisso `-dev.N` sul numero di patch corrente (es. v1.1.86-dev.1) — distinto sia dal nome della milestone sia dalle vecchie candidate `-rc.N`, ormai abbandonate.
- **Consegna file**: condividere solo i singoli file modificati, non uno zip dell'intero progetto — a meno che le modifiche non siano strutturali e coinvolgano molti file contemporaneamente, o si stia congelando una milestone stabile (dove il pacchetto completo è invece atteso).
- **Verificare prima di assumere**: quando un comando, un'opzione CLI, il nome di un campo JSON o il comportamento dichiarato di uno strumento esterno non è mai stato testato dal vivo in questo ambiente, dirlo esplicitamente e loggare l'output grezzo/reale al primo utilizzo — mai fidarsi ciecamente della documentazione o di un pattern plausibile ma non verificato. Lezione imparata a caro prezzo più volte: `--appendconfig=` di RetroArch (ignorato in silenzio), `--list details,json` di lgogdownloader (sintassi sbagliata, mai verificata), l'auto-creazione dichiarata da Mozilla per `--profile` (non affidabile in pratica).
- **Diagnosticare prima di ritentare**: di fronte a un comportamento inatteso che si ripete, aggiungere log/diagnostica reale prima di proporre un secondo tentativo di fix alla cieca — non indovinare una seconda volta senza dati concreti (saga della tray sparita, v1.1.70-72: la causa vera si è trovata solo dopo aver smesso di buttare via l'output del processo).
- **Test isolati quando fattibile**: per bug di logica SQL o parsing, verificare con uno script isolato (`node -e`, `better-sqlite3` in memoria) usando dati reali forniti dall'utente quando disponibili, invece di fidarsi del solo ragionamento sul codice — ha rivelato più volte insufficienze in un fix che sembrava corretto a prima vista (protezione titolo/tempo di gioco nell'UPSERT, parsing dimensione GOG).
- **`patches/`**: cartella rimossa (era per patch incrementali via script, non più in uso da tempo) — qualunque modifica va applicata direttamente ai file del progetto, non tramite script di patch separati.

### Architettura App.tsx: quando estrarre in `hooks/` (dal v1.5.7-Venus in poi)

`App.tsx` è un unico componente molto grande (~8.600 righe) — non verrà spezzato in componenti separati nel prossimo futuro, perché il sistema di navigazione (`Focusable`, `neighbors`, `sequentialChain`) collega gli elementi tramite ID testuali sparsi nel file, mai verificati dal compilatore: spezzare il JSX rischierebbe di rompere silenziosamente quei collegamenti. Quello che **si può e si deve fare per ogni nuova funzione**, per non farlo crescere oltre e restare mantenibile, è estrarre stato e logica (non il JSX) in un hook dedicato sotto `src/hooks/`, ogni volta che la funzione lo permette.

**Come si decide se una funzione è un buon candidato — checklist verificata su 5 estrazioni reali (v1.5.10 → v1.5.14-dev.1):**

1. **Zero `id`/`neighbors`/`sequentialChain` coinvolti.** L'hook contiene solo `useState`/`useEffect`/`useCallback`/`fetch` — nessun elemento `<Focusable>`. Il JSX che consuma i valori dell'hook resta in `App.tsx`, invariato.
2. **Nessun polling condiviso con un concetto non correlato.** Se lo stato si aggiorna dentro una funzione che aggiorna ANCHE un altro stato scorrelato nello stesso giro (es. `downloads` e `logs` insieme in un unico `fetchStatus`), non è un'estrazione a rischio pressoché nullo — il beneficio (poche righe spostate) non vale il rischio di toccare un meccanismo condiviso. **Scartato per questo motivo**: `useDownloadTasks()` (v1.5.12-dev.1).
3. **Se il JSX chiama il setter grezzo direttamente** (non solo tramite una funzione esposta dall'hook — es. un toggle che fa `setStato(...)` E poi chiama `saveStato(...)`), esporre anche quel setter dall'hook invece di refactorizzare quel punto insieme allo spostamento. Mantiene il comportamento identico con un diff minimo. Successo in tutti e 5 gli hook estratti finora.

**Procedura di verifica, sempre le stesse due, in quest'ordine, dopo ogni estrazione:**

1. `tsc --noEmit`, confrontato riga per riga contro il conteggio di errori pre-esistenti noto — zero nuovi tollerati. Se un errore benigno già noto si sposta di file insieme al codice che lo genera, non è un errore nuovo (successo in v1.5.13-dev.1 — verificarlo comunque, non darlo per scontato).
2. `node scripts/check-focus-ids.cjs` (v1.5.8-dev.1) — stesso numero di `id`/riferimenti/catene rilevati prima e dopo, zero riferimenti a id inesistenti. Conferma indipendente che l'estrazione non ha toccato la navigazione, oltre a `tsc`.

**Hook esistenti** (`src/hooks/`): `useGamepad.ts` (preesistente), `useCloudBackupProviders.ts`, `useNotifications.ts`, `useAiAdvisorProviders.ts`, `useInputDevices.ts`, `useStorePluginRegistry.ts`. Ognuno segue lo stesso schema: stato + fetch/save + eventuale polling di refresh, mai JSX.

**Se in futuro emerge un candidato che sembra pulito**: applicare la checklist sopra prima di procedere, non assumere che "sembra isolato" basti — `useDownloadTasks()` sembrava altrettanto ovvio finché non è stato investigato a fondo.

## Apertura ai test: installazione cross-DE e cross-distro (v1.1.80+)

Obiettivo dichiarato dall'utente: rendere X-Launcher installabile su qualunque distribuzione, non solo Arch, e su qualunque dei desktop environment più diffusi (XFCE/MATE/GNOME/Plasma) — non solo XFCE. Prerequisito: la creazione di una sessione dedicata (Gamescope) è oggi incompleta/non funzionante, quindi ci si concentra sull'installazione entro un DE esistente per questa prima apertura.

Formato di packaging discusso: scartati AppImage/Flatpak (l'app non è una GUI autonoma — demone Node + finestra browser + tray Python, deve gestire finestre del DE ospite e lanciare processi di sistema come Wine/RetroArch/Steam, incompatibile col modello sandboxed/containerizzato di entrambi). Confermato `install.sh`, da riscrivere per essere davvero cross-distro (rilevamento del gestore pacchetti: apt/dnf/pacman/zypper) — lavoro non ancora iniziato.

**v1.1.80 — primo passo, rilevamento DE per il kiosk mode**: `--kiosk` di Chromium scartato su indicazione esplicita dell'utente (causa problemi di prestazione, già deprecato in passato). Bug reale trovato verificando il codice: il rilevamento sessione-dedicata-sì/no si basava solo su `pgrep -x xfwm4`, avrebbe fallito silenziosamente su MATE/GNOME/Plasma — corretto con `$XDG_CURRENT_DESKTOP`. Meccanismo di rimozione decorazioni riscritto con `_MOTIF_WM_HINTS` (verificato con ricerca reale come supportato da Mutter/KWin/xfwm4/Marco), un solo meccanismo per tutti e quattro i desktop invece di quattro trucchi separati. Non ancora testato dal vivo su nessuno dei quattro DE — vedi CHANGELOG.md v1.1.80 per il dettaglio completo.

**v1.1.81 — tre bug reali dal primo test su XFCE**: `build.sh start firefox` non inoltrava l'argomento browser (bug in `build.sh`, non in `kiosk-launch.sh`); Firefox apriva la Dashboard come scheda in una finestra già in esecuzione invece che in un'istanza dedicata (`--new-instance` da solo non basta su Linux, serve `--no-remote` + profilo dedicato, confermato con ricerca reale); il decoratore restava visibile anche su XFCE nonostante `_MOTIF_WM_HINTS` — su suggerimento dell'utente, tornato a un dispatch per-DE con il vecchio meccanismo xfwm4 provato per XFCE specificamente, `_MOTIF_WM_HINTS` mantenuto come livello aggiuntivo per tutti (unico disponibile per MATE/GNOME/Plasma), più diagnostica reale aggiunta per il prossimo giro di test. Vedi CHANGELOG.md v1.1.81.

**Ancora da fare**: `install.sh` cross-distro (rilevamento gestore pacchetti, mai iniziato); conferma su hardware reale che il dispatch per-DE risolva davvero il decoratore su XFCE, e test su MATE/GNOME/Plasma quando possibile.

## Migliorie sidebar/Gestisci Account (fuori sequenza, prima di 19c)

Tre richieste dell'utente, tutte confermate funzionanti su hardware reale dopo alcuni giri di fix: dimensione prevista di installazione per GOG/Epic (v1.1.88, corretta la sintassi `lgogdownloader` in v1.1.90/91 dopo test reali — formato "size: byte grezzi" senza unità, non "1.23 GB" come ipotizzato); tempo di gioco reale accumulato per GOG/Epic/Classic Console (v1.1.89, fix persistenza in v1.1.90 — una sync di libreria sovrascriveva l'accumulo); entrambi resi persistenti su richiesta esplicita, cache in DB invece di rifare il fetch ad ogni selezione. Tab "Info Hardware" in Gestisci Account (v1.1.92) — Motherboard/CPU/GPU/RAM/HDD/OS, tutti leggibili senza permessi elevati, sempre in ultima posizione nella tab bar. Vedi CHANGELOG.md v1.1.88-92 per il dettaglio completo.

-----

## Regole di processo

1. **Compilazione prima del rilascio**: prima di creare ogni pacchetto ZIP,
   eseguire `./build.sh` e verificare che non ci siano errori TypeScript o
   di runtime. Bug evidenti vanno risolti prima del rilascio.

2. **Chromium come default post-build**: dopo la compilazione, il launcher
   usa `./kiosk-launch.sh chromium` come comando di avvio predefinito.

-----

## Stato attuale (punto di partenza)

- UI React funzionante con navigazione gamepad
- Server Express + Vite operativo su Linux
- Runner con spawn reale (Wine, Proton, DOSBox, RetroArch, ScummVM)
- HMR fix applicato (porta 3001 dedicata)
- Plugin store tutti hardcoded / mock
- Nessuna persistenza dati
- Nessun pannello configurazione per-game nell'UI

Stima attuale: 70% concept UI — 20% architettura — 10% funzionalità reali.

-----

## ✅ Step 1 — Persistenza SQLite [OK]

**Priorità: CRITICA — prerequisito per tutto il resto**

- `better-sqlite3` aggiunto come dipendenza
- `src/backend/db.ts` creato con schema completo
- Tabelle: `games`, `compat_profiles`, `runners`, `downloads`, `logs`
- Token OAuth su file separato `~/.local/share/x-launcher/tokens.json` (permessi 600)
- `gameManager` legge/scrive su DB — `getGames()` legge da SQLite, `refreshLibrary()` fa upsert batch in transazione
- `downloadManager` persiste ogni task; al boot ripristina i download interrotti (status → `paused`)
- `metadataManager` usa cache in memoria — pronta per diventare cache SQLite
- Route aggiunte: `PATCH /api/games/:id/config`, `PATCH /api/games/:id/compat`, `GET /api/games/:id/compat`

-----

## ✅ Step 2 — Plugin Steam: lettura libreria reale [OK]

**Dipendenze esterne: nessuna per la libreria; Steam Web API key per le ore**

- Parser VDF minimale senza dipendenze esterne
- Rileva automaticamente la root Steam tra i percorsi standard Linux
- Legge `libraryfolders.vdf` per trovare giochi su dischi aggiuntivi
- Legge ogni `appmanifest_<id>.acf` — nome, stato installazione, data, dimensione
- Rileva l'utente attivo da `loginusers.vdf` (per le ore via API)
- Ore di gioco via `IPlayerService/GetOwnedGames` (richiede `STEAM_API_KEY` + `STEAM_ID` nel `.env`)
- Copertine dalla CDN pubblica Steam (`cdn.steamstatic.com`) — nessuna auth
- Lancio tramite `steam://rungameid/<appId>` — Proton gestito da Steam nativo
- `SteamNativeRunner` aggiunto ai runner statici
- Route `POST /api/steam/bigpicture` per aprire Steam Big Picture
- Se Steam non è installato, il plugin restituisce array vuoto senza errori fatali

-----

## ✅ Step 3 — Plugin Classic Console: scan directory ROM [OK]

**Dipendenze esterne: RetroArch (opzionale, rilevato automaticamente)**

- Scansione `~/Roms/` (o `ROMS_PATH` nel `.env`) con sottocartelle per sistema
- Mappa sistema→runner+core: SNES→snes9x, NES→nestopia, GBA→mgba, MD/SMS→genesis_plus_gx, PSX→pcsx_rearmed, N64→mupen64plus, DOS→DOSBox, ScummVM→ScummVM
- ID ROM stabile basato su hash numerico + nome file
- Mapping nomi cartella flessibile (MS, SMS, MEGADRIVE → Mega Drive)
- Route `GET /api/retroarch/cores` e `PATCH /api/games/:id/retroarch`
- **Validato**: 5 titoli Steam + 4 ROM = 9 titoli in libreria
- **Validato**: RetroArch lancia con core specifico per ogni sistema
- **Nota**: core passato con `-L` viene ignorato da RetroArch se incompatibile con la ROM; RetroArch usa il suo DB interno
- **Correzione documentale (v0.99.1)**: il "Watcher ricorsivo con debounce 2s" precedentemente elencato qui non è presente nel codice attuale — la sync libreria avviene solo al refresh esplicito (boot, pulsante, polling SSE esistente), non via filesystem watcher. Voce rimossa da questo elenco per allineare la roadmap al codice reale.
- **Fix v0.99.1 — sync libreria su ROM rimosse/rinominate**: `refreshLibrary()` non rimuoveva mai dal DB i titoli non più restituiti da una scansione — una ROM rimossa o rinominata (rename → id diverso, derivato dal path) restava visibile in libreria come fantasma, non più lanciabile. Vedi changelog v0.99.1 per il dettaglio dei fix (`isExhaustiveLocalScan`, `deleteGamesByStoreNotIn`, throw su cartella irraggiungibile invece di `[]` silenzioso).
- **v0.99.2 — auto-scaffolding cartelle sistema + supporto MAME**: ad ogni scansione viene generato (se assente) l'intero albero di sottocartelle canoniche per sistema in `Roms/` (SNES, NES, GBA, GBC, GB, MD, SMS, PSX, PSP, N64, Mame, DOS, ScummVM) — basta trascinare le ROM nella cartella giusta, RetroArch/il runner corretto viene assegnato in automatico. Aggiunto supporto MAME. Nota: questo supera la protezione "throw su cartella irraggiungibile" introdotta in v0.99.1 — ora la cartella root viene sempre creata se assente, comportamento scelto deliberatamente semplice (vedi changelog v0.99.2 per i dettagli e le conseguenze accettate).
- **v0.99.3 — fix core MAME**: il core assegnato in v0.99.2 (`mame2003_plus_libretro.so`) era stato impostato per ipotesi, non verificato sul sistema reale — risultava installato `libretro-mame` (file reale `mame_libretro.so`), non il fork mame2003-plus. Corretto in `mame_libretro.so` — MAME completo upstream, scelto rispetto a `mame2016_libretro.so` (anche installato) per manutenzione attiva e migliore compatibilità out-of-the-box con romset moderni.
- **v0.99.2 — refresh periodico libreria**: nuovo timer interno (90s) in `GameManager` che richiama `refreshLibrary()` in background mentre il daemon è attivo, senza richiedere riavvio o refresh manuale dall'utente per vedere ROM/titoli aggiornati.

-----

## ✅ Step 4 — UI: pannello configurazione per-game [OK]

- `executablePath`, `libretroCore`, `scummvmId`, `steamAppId`, `dosboxConf`
- Override runner per singolo gioco (ottimistic UI)
- Toggle compat reattivi: DXVK, VKD3D, FSR, GameMode, MangoHud
- Variabili d'ambiente custom (KEY=VALUE per riga)
- Log lancio RetroArch include il core effettivamente usato
- **Fix patch-step4-002**: `require('path')` inline → `path.basename()` (regressione risolta)

-----

## ✅ Step 5 — Plugin GOG via `lgogdownloader` [OK]

**Dipendenze esterne: `lgogdownloader` (AUR: `yay -S lgogdownloader`)**

- Login: `lgogdownloader --login` da terminale (flusso OAuth interattivo)
- `lgogdownloader --list` come fonte dati (istantaneo vs 128 chiamate API di `--list details`)
- spawn() asincrono — non blocca l'event loop durante le chiamate di rete
- Strip sequenze ANSI/escape dall'output (forma `^[[01;34m` senza byte ESC)
- Split su `\r\n` per filtrare le righe di progresso (che usano `\r` come separatore)
- Filtro slug con regex `^[a-z0-9_]+(\s+\[\d+\])?$`
- Strip suffisso `[N]` fatto dopo il join, non prima dello split
- Tutti i 128 titoli marcati `isInstalled: false` (libreria cloud)
- Fallback Heroic Games Launcher (`installed.json`) per i giochi installati
- **Fix**: `playTimeHours` invece di `playtime`, `coverImage`/`previewImage` invece di `coverUrl`/`previewUrl`, `status: 'Not Installed'`, `tags: []`
- **Nota**: cover art placeholder fino a Step 9 (SteamGridDB)
- **Nota**: login GOG integrato nella UI previsto in fase di debug finale

-----

## ✅ Step 6 — Plugin Epic Games via `legendary` [OK]

**Dipendenze esterne: `legendary` installato nel sistema**

- `legendary` è il client CLI open source per Epic Games Store
- Comandi chiave:
  `legendary auth` per il login
  `legendary list --json` per la libreria
  `legendary launch <appName>` per avviare
- Nessuna API key propria: legendary gestisce i token Epic internamente
- Il plugin invoca i comandi e parsa il JSON restituito


-----

## 🏁 Milestone 1 — Store Core completo (Step 1→6)

**Raggiunta il 26 maggio 2026**

Tutti gli store principali leggono la libreria reale:

| Store         | Titoli rilevati | Note                                      |
|---------------|-----------------|-------------------------------------------|
| Steam         | 5               | .acf parser, copertine CDN, Proton native |
| GOG Galaxy    | 128             | lgogdownloader --list, spawn asincrono    |
| Epic Games    | 80              | legendary list --json, cover reali        |
| Classic/ROM   | 4               | scan ~/Roms, core RetroArch per sistema   |

Il daemon è stabile, non blocca l'event loop, e persiste su SQLite.
La UI mostra tutte le librerie con navigazione gamepad funzionante.

**Prossimo obiettivo — Milestone 2: Metadata + Download reali (Step 7→10)**

-----

## Step 7 — Plugin Lutris (opzionale)

**Dipendenze esterne: Lutris installato**

- Leggere `~/.local/share/lutris/pga.db` (SQLite)
- Importare giochi Lutris nella libreria X-Launcher
- Lancio via `lutris lutris:rungame/<slug>`
- Utile per coprire Battle.net e Amazon Games

-----

## Step 8 — Plugin Battle.net e Amazon Games

**Soluzione: configurazione manuale o via Lutris**

- Battle.net e Amazon Games non espongono API locali su Linux
- L'utente aggiunge i giochi con il percorso all'eseguibile nel prefix Wine
- Oppure delegare a Lutris (Step 7)

-----

## ✅ Step 9 — MetadataManager: API reali [OK]

**Dipendenze esterne: chiavi API nel .env**

- **IGDB** (via Twitch API): rating, generi, data uscita, cover art
- **SteamGridDB**: cover/banner di qualità per qualsiasi gioco (gratuita)
- **HowLongToBeat**: ore completamento (npm `howlongtobeat`)
- Cover GOG reali: CDN pubblica GOG con ID numerico (da IGDB o SteamGridDB)


-----

## 🏁 Milestone 2 — Metadata + Cover Art reali (Step 9)

**Raggiunta il 27 maggio 2026**

Cover art e metadati reali per tutti i 213 titoli in libreria:

| Store         | Cover        | Rating/Generi | Note                                      |
|---------------|--------------|---------------|-------------------------------------------|
| Steam         | ✅ CDN Steam | ✅ IGDB        | AppID → URL diretto                       |
| Epic Games    | ✅ CDN Epic  | ✅ IGDB        | URL nel JSON legendary                    |
| GOG Galaxy    | ✅ SteamGridDB | ✅ IGDB      | Fetch asincrono, cache DB persistente     |
| Classic/ROM   | ✅ SteamGridDB | ✅ IGDB      | Strip regione (USA, Europe) prima del fetch |

**Fix chiave applicati:**
- Avvio non bloccante: Fase 1 (plugin → DB) + Fase 2 (metadata, background)
- Cache persistente: `ON CONFLICT` in SQLite protegge cover/rating/generi reali
  da sovrascrittura con placeholder ad ogni riavvio
- Endpoint SGDB corretto: `/grids/game/{id}` invece di `/grids/{id}`
- `.env` caricato via `node --env-file` nel kiosk-launch.sh

**Prossimo obiettivo — Milestone 3: Download reali + Kiosk completo (Step 10→11)**

-----

## 🏁 Milestone 3 — Download e installazione reale (Step 10→11)

**Raggiunta il 30 maggio 2026**

Download, installazione e lancio funzionanti per Epic Games e GOG Galaxy:

| Store      | Download | Prefix | Winetricks | Estrazione | Lancio | Testato |
|------------|----------|--------|------------|------------|--------|---------|
| Epic Games | ✅ legendary | ✅ isolata | ✅ | ✅ legendary | ✅ Wine | Machinarium |
| GOG Galaxy | ✅ lgogdownloader | ✅ isolata | ✅ | ✅ innoextract | ✅ Wine | Beneath a Steel Sky |

**Architettura confermata**: `innoextract` come standard per GOG su Linux — superiore all'installer Wine per affidabilità e indipendenza dalla GPU.

**Prossimo obiettivo — Milestone 4: Kiosk completo + Input manager (Step 12→13)**

-----

## ✅ Step 10 — DownloadManager: spawn CLI reale [OK]

- **GOG**: `lgogdownloader --download` — progresso via stdout
- **Epic**: `legendary install <appName>` — stesso approccio
- **Steam**: `steam steam://install/<id>` (progresso non monitorabile)
- DownloadManager legge stdout in streaming con `child_process.spawn`
- Overlay Winetricks: checkbox dipendenze Wine per-game (vcrun2022, dxvk, vkd3d, corefonts + opzionali)
- Dipendenze selezionate persistite per-game nel profilo compat

-----

## ✅ Step 11 — Fix installazione Epic/GOG + persistenza prefix [MILESTONE] ✅

**Raggiunta il 30 maggio 2026**

### Epic Games — FUNZIONANTE ✅
- Download via `legendary install` con progress streaming
- Prefix Wine isolata per gioco (`~/Games/Epic/<id>/prefix/`)
- Dipendenze winetricks (default: vcrun2022, dxvk, vkd3d, corefonts)
- `dotnet48` rimosso dai default — opzionale nell'overlay
- Auto-rilevamento exe con `find` ricorsivo dopo install
- `prefixPath` persistita su DB, passata al runner al lancio
- **Testato**: Machinarium — installato e lanciato con successo

### GOG Galaxy — FUNZIONANTE ✅
- Download via `lgogdownloader --download --platform w --game <slug>`
- Prefix Wine isolata per gioco (`~/Games/GOG/<slug>/prefix/`)
- Dipendenze winetricks
- Estrazione via `innoextract --gog` — niente Wine, niente botva2, niente GPU
- Auto-rilevamento exe dopo estrazione
- `prefixPath` persistita su DB
- Sync stato installato al riavvio: `gogPlugin` e `syncExternalInstallStates()` rilevano `~/Games/GOG/<slug>/files/`
- **Testato**: Beneath a Steel Sky — installato con successo

### Fix critici risolti
- `store` mancante in `addTask()` → crash `path.join(undefined)`
- `COALESCE` bug DB → `updateGameConfig` con SET dinamico
- `prefix_path` colonna aggiunta con migration automatica
- `expandHome()` estesa per `$HOME`/`$VAR`
- `--non-interactive`/`--no-bar` rimossi (non supportati)
- Ricerca installer ricorsiva con `find`
- `botva2.dll` bypassata con `innoextract`

### Dipendenze richieste
- `lgogdownloader` — `yay -S lgogdownloader`
- `innoextract` — `sudo pacman -S innoextract`

### Prossimi step
- Lancio GOG: testare con giochi che richiedono Wine reale (non ScummVM)
- ScummVM nativo: rilevare bundled ScummVM nei giochi GOG e usare runner Linux
- Fix `legendary sync` TypeError al boot
- `prefixPath` editabile dall'overlay

-----

## Step 12 — Architettura comune + consolidamento Epic/GOG

**Obiettivo**: costruire un layer store-agnostic robusto che funzioni identicamente per Epic, GOG e qualsiasi store futuro. Nessuna logica duplicata per store.

### 12a — Rilevamento exe da sorgente autorevole (no filesystem scan)

**Problema attuale**: `findMainExe()` cerca ricorsivamente nel filesystem e trova spesso l'exe sbagliato.

**Soluzione**:
- **Epic**: dopo install, `legendary info <appName> --json` → `manifest.launch_exe` + `install_path` → exe assoluto verificato
- **GOG**: dopo `innoextract`, leggi `files/goggame-*.info` → `playTasks` → task con `isPrimary: true` → `path` (backslash → slash), `arguments`, `workingDir`
- **DB**: aggiungere colonne `launch_args TEXT` e `launch_cwd TEXT` con migration automatica — necessari per ScummVM bundled e giochi con argomenti fissi
- **Fallback**: `findMainExe()` rimane come ultimo resort con log esplicito "exe rilevato da filesystem — verifica manuale consigliata"

### 12b — Card behavior unificato (store-agnostic)

- Click su gioco **installato** → lancia immediatamente con impostazioni salvate
- Click su gioco **non installato** → chiama backend install + apre pannello download (`setShowDownloads(true)`)
- Comportamento identico per qualsiasi store — nessuna distinzione nel codice UI

### 12c — Overlay unificato store-agnostic

**Semplificazione flusso**:
- Rimuovere il pulsante "Launch with these settings" — il lancio avviene dalla card con impostazioni già salvate
- Pulsante **Install** contestuale (se non installato) → avvia pipeline + apre coda download
- Pulsante **Uninstall** (rosso, se installato) → rimuove file da disco + aggiorna DB + aggiorna card in tempo reale

**Campi configurazione** (identici per tutti gli store Wine-based):
- `Executable Path` — badge verde se configurato, giallo se mancante su gioco installato
- `Prefix Path` — editabile, badge verde/giallo
- `Launch Arguments` — da `playTasks.arguments`, editabile
- `Launch Working Dir` — da `playTasks.workingDir`, editabile
- `Runner Bridge` — selezione runner con versione
- `Compat profile` — DXVK, VKD3D, FSR, GameMode, MangoHud, custom env
- `Dipendenze Wine` — winetricks persistite per-game, caricate dal profilo compat all'apertura

**Persistenza**: ogni modifica salvata immediatamente su DB — nessun pulsante "salva", overlay è sempre in sync

### 12d — Uninstall universale

Endpoint `DELETE /api/games/:id/uninstall`:
- Determina la cartella dal store (`~/Games/Epic/<id>/` o `~/Games/GOG/<slug>/`) e la rimuove ricorsivamente
- Aggiorna DB: `isInstalled=false`, `executablePath=null`, `prefixPath=null`, `launch_args=null`, `launch_cwd=null`, `status='Not Installed'`
- Emette evento SSE → la UI aggiorna stato card in tempo reale senza refresh pagina
- Estendibile a qualsiasi store futuro aggiungendo solo la logica del path

### 12e — Fix legendary sync TypeError

`TypeError: (void 0) is not a function or its return value is not iterable` al boot di ogni avvio.
- Aggiungere validazione robusta sul risultato di `legendary list-installed --json` prima di qualsiasi `.map()` o iterazione
- Se `legendary` non è disponibile o il JSON non è valido → log warning + skip silenzioso invece di crash

### 12f — Log management universale

- Tutti i `console.log` nudi nel codice sostituiti con `writeLog()`
- Livelli standardizzati: `[DEBUG]`, `[INFO]`, `[SYSTEM]`, `[WARNING]`, `[ERROR]`, `[AUTH]`, `[DOWNLOAD]`, `[LAUNCH]`
- Rotazione migliorata: mantieni `daemon.log` + `daemon.log.1` + `daemon.log.2`
- Console di debug nella dashboard:
  - Filtro per livello (ERROR, DOWNLOAD, LAUNCH, SYSTEM, ecc.)
  - Colori per livello (rosso=error, giallo=warning, blu=system, verde=launch OK)
  - Auto-scroll con pulsante "pause scroll" per leggere
  - Pulsante "Copia log" e "Download log" per debug remoto

---

### Tabella priorità Step 12

| # | Sotto-step | Priorità | Difficoltà | Note |
|---|------------|----------|------------|------|
| 1 | 12a Exe da sorgente autorevole | Critica | Media | ✅ Verificato — Machinarium Epic OK |
| 2 | 12b Card behavior unificato | Alta | Bassa | ✅ Verificato |
| 3 | 12c Overlay unificato | Alta | Alta | ✅ Verificato |
| 4 | 12d Uninstall universale | Alta | Media | Necessario per gestione disco |
| 5 | 12e Fix legendary sync | Media | Bassa | ✅ Verificato |
| 6 | 12f Log management | Media | Media | ✅ Verificato |

-----

## 🏁 Milestone 4 — Architettura comune Epic/GOG + UX unificata (Step 12a→12d)

**Raggiunta il 3 giugno 2026**

### Verificato e funzionante

| Sotto-step | Descrizione | Test |
|------------|-------------|------|
| 12a | Exe da sorgente autorevole (legendary/goggame-*.info) | Machinarium Epic ✅ |
| 12b | Card behavior unificato + conferma install/uninstall | Epic + GOG ✅ |
| 12c | Overlay unificato store-agnostic | Epic + GOG ✅ |
| 12d | Uninstall universale con pulizia disco + DB | Epic + GOG ✅ |

### Fix critici risolti
- `winetricksVerbs` persistiti per-game nel profilo compat (colonna `winetricks_verbs` in DB)
- Pre-launch winetricks: verbs aggiunti post-install vengono installati prima del lancio
- `resolvePathCaseInsensitive()`: path GOG case-insensitive su Linux
- `shellSplitArgs()`: parsing corretto di argomenti con virgolette
- `resolveBinaryPath()`: path assoluto di wine per evitare ENOENT
- ScummVM bundled GOG: argomento `-c` rimosso — ScummVM si avvia senza argomenti
- Dialog conferma usa `/api/downloads/start` con `winetricksVerbs` invece di `/api/launch`
- Toggle DXVK/VKD3D rimossi dall'overlay (ridondanti con winetricks)
- FSR, GameMode, MangoHud: pianificati per implementazione nel runner

### Prossimi step
- 12e Fix legendary sync TypeError al boot ✅
- 12f Log management universale ✅
- Implementazione FSR/GameMode/MangoHud nel WineRunner
- Step 13 Store login UI
- Implementazione FSR/GameMode/MangoHud nel WineRunner
- Step 13 Store login UI

-----

## Step 13 — Store login UI universale

**Obiettivo**: eliminare la dipendenza dal terminale per autenticazione e gestione account store.

### 13a — Pannello Manage Accounts funzionale
- Il mock già presente nella UI diventa funzionale
- Per ogni store: badge **Connected** (verde) / **Disconnected** (rosso)
- Verifica live al fetch libreria: se il plugin restituisce 0 titoli o errore auth → badge rosso + notifica visiva in dashboard "GOG: sessione scaduta — riconnetti"

### 13b — Login GOG integrato
- `lgogdownloader --login` apre browser OAuth — integrare con `xdg-open` e polling completamento
- Dopo login: re-sync libreria automatico + aggiornamento badge Connected

### 13c — Login Epic integrato
- `legendary auth --disable-webview` → URL copiabile mostrato nella UI + campo token per completare
- Dopo auth: re-sync libreria automatico + aggiornamento badge Connected

### 13d — Architettura plugin login estendibile
- `StorePlugin.base` definisce interfaccia `login()` standard
- Ogni nuovo store implementa solo la propria logica di autenticazione
- La UI usa sempre la stessa interfaccia indipendentemente dallo store

-----

## 🏁 Milestone 5 — UI completa: Light theme + Avatar Library (Step 12g+)

**Raggiunta il 9 giugno 2026**

### Light theme — fix sistematici

Tutti i componenti adattano correttamente colori, sfondi e testi al tema chiaro:

| Componente | Fix |
|---|---|
| Settings overlay | `bg-[#12141a]` → `bg-white`, bordi e tab switcher adattivi |
| Account cards | Background, icone store, OAuth URL box, bottoni connect/disconnect |
| System tab | Runner rows, colonne ProtonUp/Lutris, banner, pill versioni |
| Game overlay | Header runner (Wine-Lutris mantiene il giallo), container pannelli |
| Compatibility Layer | Toggle button e track switch adattivi |
| VirtualKeyboard | Accetta `theme` come prop — tasti `bg-gray-100` in light |
| Dropdown sort | `bg-[#1a1d27]` → `bg-gray-100 text-gray-900` |
| Search field | Bordo rafforzato in light (`border-gray-400`) |

### Avatar Library — nuovo sistema completo

- **Cartella**: `$HOME/.local/share/x-launcher/avatars/` — creata automaticamente al boot del daemon
- **Bottone**: click diretto sul bottone avatar in alto a destra → toggle libreria (nessun menu intermedio)
- **Libreria**: overlay full-screen con griglia 7 colonne, stessa struttura visiva delle game card
- **Formati supportati**: `.jpg` `.jpeg` `.png` `.webp`
- **Selezione**: click sinistro o tasto A del controller → setta avatar + chiude libreria
- **Controller**: tasto B → chiude libreria; navigazione D-pad sulla griglia
- **Header libreria**: avatar corrente visibile, path reale della cartella (selezionabile), bottone ricarica (↺), bottone Rimuovi, link Account settings
- **Chiusura automatica**: cambio store/libreria chiude la libreria avatar
- **Endpoint server**: `GET /api/avatars` (lista), `GET /api/avatars/:filename` (serve file), `GET /api/avatars/info` (path reale per debug)
- **Fallback**: se un avatar salvato nel localStorage non è più raggiungibile (file rimosso), il bottone torna all'icona utente silenziosamente

### Fix tecnici

- Rimosso `avatarInputRef` e tutta la logica canvas/file picker precedente
- `Focusable` wrapper rimosso dal bottone avatar (causava doppio toggle che annullava il click)
- `process.env.HOME || os.homedir()` per compatibilità con ambienti systemd
- Log al boot: `Avatar dir: /home/.../avatars` visibile nella debug console
- `overflow-hidden` rimosso dall'overlay libreria per evitare clip del `scale-[1.06]` sulle card ai bordi

-----

## ✅ Step 13b — Input Plugin System + Plugin Manager (Step 13b)

**Sviluppato in sessione — da testare su hardware**

### Input Plugin Architecture

Refactoring completo di `useGamepad.ts` attorno a un sistema a plugin:

```
src/input/
  types.ts                  ← ButtonName, InputState, InputPlugin interface
  InputManager.ts           ← singleton: registro plugin, match dispositivo, readPrimary()
  plugins/
    XInputPlugin.ts         ← Xbox / XInput standard (mapping precedente)
    DS4Plugin.ts            ← DualShock 4 (Sony VID 0x054C)
    DS5Plugin.ts            ← DualSense PS5
    GenericPlugin.ts        ← fallback match-all
```

**`InputPlugin` interface:**
- `id`, `name`, `description`, `vendorIds[]`
- `enabled: boolean` — persistito in localStorage
- `mapButtons(gp: Gamepad): InputState`
- `rumble?(index, strong, weak, duration)` — opzionale

**`InputManager`** (singleton):
- Auto-match dispositivo per VID USB e stringa id browser
- `readPrimary()` — legge gamepad[0] con il plugin corretto
- `setPluginEnabled(id, bool)` + `saveConfig()`/`loadConfig()` su localStorage
- `refreshDevices()` — lista `ConnectedDevice[]` con pluginId assegnato

**`useGamepad`** aggiornato — stessa API pubblica (`GamepadState`, `isJustPressed`) per compatibilità con tutto il codice App.tsx esistente.

### Store Plugin Manager

**`StorePlugin` base** estesa con:
- `drmFree: boolean` — GOG/Classic = true, Epic/Steam = false
- `description: string`
- `requiredTool: string` (es. `lgogdownloader`, `legendary`)
- `enabled: boolean` — persistito in DB (`plugin_states` table)

**`GameManager`** aggiunto:
- `getPluginRegistry()` — lista per la UI
- `setPluginEnabled(storeId, bool)` — persiste + re-sync se riabilitato
- `loadPluginStates()` — chiamato all'`init()` del daemon
- `refreshLibrary()` salta i plugin disabilitati con log esplicito

**Nuovi endpoint server:**
- `GET /api/plugins` — registry completo
- `PATCH /api/plugins/:storeId` — `{ enabled: boolean }`

### Comportamento dashboard

| Scenario | Comportamento |
|---|---|
| Plugin disabilitato — gioco non installato | Scompare dalla libreria istantaneamente |
| Plugin disabilitato — gioco installato DRM-free (GOG) | Rimane visibile e avviabile |
| Plugin disabilitato — gioco installato con DRM (Epic/Steam) | Rimane visibile, badge "Plugin disattivato", play bloccato con messaggio |
| Plugin riabilitato | Re-sync immediato, giochi tornano con animazione normale |
| Input plugin disabilitato | Feedback immediato nel tab Input, fallback al prossimo plugin compatibile |

### Tab Settings

Aggiunti due nuovi tab nel pannello Settings:

**Tab "Plugins"** — griglia 2 colonne con tutti i plugin store:
- Toggle switch on/off con feedback visivo immediato
- Badge DRM / DRM-free
- Descrizione e tool CLI richiesto

**Tab "Input"** — due sezioni:
- Dispositivi fisici connessi con VID e plugin assegnato
- Plugin input disponibili con toggle on/off

-----

## ✅ Step 14 — GOG end-to-end su hardware reale [OK]

**Prerequisito**: hardware fisico con accelerazione GPU reale (non VM) — Arch Linux, RTX 3070.

- **Validato**: installazione completa GOG con rilevamento exe da `goggame-*.info` (SOMA, ~25GB)
- **Validato**: lancio Wine/Proton con `launchArgs`/`launchCwd` corretti — bug reale scoperto e risolto nel percorso: Proton non usa il path passato come WINEPREFIX diretto, lo tratta come `STEAM_COMPAT_DATA_PATH` e bootstrappa la prefix reale in `<path>/pfx` (vedi changelog, sessione SOMA)
- **Validato**: ScummVM bundled (Beneath a Steel Sky) lanciato con successo via Wine
- **Validato**: `prefixPath` corretta usata dal runner (stesso fix Proton di cui sopra)
- Fix emersi dall'hardware reale documentati e risolti (timeout innoextract su installazioni grandi, progress parser, prefix Proton, persistenza `runner` sovrascritta dal sync GOG)

**Correzione documentale**: voce precedentemente marcata ⬜ pianificato nella tabella riassuntiva — refuso di aggiornamento, il lavoro reale era già stato completato e documentato nel changelog (sessione SOMA + Beneath a Steel Sky).

-----

## ✅ Step 16 — Navigazione gamepad completa [MILESTONE] ✅

**Obiettivo**: ogni area della Dashboard navigabile e gestibile interamente da controller, senza dipendenze dal mouse/tastiera, validato con test iterativi su hardware reale.

### Architettura del focus

- Registry con re-registrazione corretta (fix dei "fantasmi" da nodi DOM smontati)
- Scoring direzionale assiale con filtro di visibilità reale nel viewport
- `activeGroup`: scope isolato per overlay, elimina interferenze con la dashboard sottostante
- `fallbackPriority`: pulsanti di chiusura non più scelti per errore come target di fallback
- `neighbors`: override di navigazione espliciti per elementi che lo scoring geometrico penalizza sempre
- `triggerFocusedAction()`: invocazione dell'azione tramite registry, non più tramite query DOM

### Stabilità input

- `isJustPressed` idempotente (`consumedRef`) contro la desincronizzazione tra polling RAF e render React
- Stabilizzazione dei callback principali tramite ref dedicati, eliminando i remount a cascata dell'effect gamepad che potevano far perdere input fisici

### Copertura per area — tutte verificate su hardware reale

| Area | Stato |
|------|-------|
| Store bar (L1/R1, wrap, cambio libreria immediato) | ✅ verificato |
| Footer Net Bridge/Notifiche | ✅ verificato |
| Menu X-Launcher (Start/Select, voce Avatar) | ✅ verificato |
| Settings — 4 tab su L1/R1 | ✅ verificato |
| Settings — Store Accounts (login/logout Epic+GOG) | ✅ verificato |
| Settings — System (Runner install/uninstall a conferma) | ✅ verificato |
| Settings — System (Tool di sistema/Spazio disco) | ✅ verificato |
| Settings — Plugins (toggle store) | ✅ verificato |
| Settings — Input (toggle dispositivi + Gamepad Tester) | ✅ verificato |
| Avatar Library (tutti i pulsanti header) | ✅ verificato |
| Cache libreria per store già visitati | ✅ verificato |

### Store Accounts — note tecniche sui bug risolti

Diverse cause distinte, ognuna isolata con verifica diretta da terminale prima del fix (no ipotesi non testate):
- Epic: comando di logout sbagliato (`--logout` non esiste nella CLI di legendary, corretto in `--delete`)
- Epic: stringa di confronto sbagliata in `isAuthenticated()` (placeholder reale è `'<not logged in>'`, con parentesi angolari)
- Epic: formato OAuth cambiato da Epic stesso (da `sid` a `authorizationCode`, da `legendary` 0.20.28)
- Epic + GOG: architettura di login basata su spawn-e-intercetta-output abbandonata in favore di istruzioni a terminale + polling, perché un processo backend detached non ha un terminale interattivo reale a cui collegarsi

### Runner tab — note tecniche

- Rimosso fallback hardcoded che inventava runner finti
- Nuovo endpoint di disinstallazione con vincolo di sicurezza (non tocca mai `steamapps/common`)
- Bug "successo invisibile": `better-sqlite3` richiede che ogni parametro nominato esista sull'oggetto, anche se `null` — diversi case di `notificationEngine.ts` mancavano campi opzionali e crashavano *dopo* che l'operazione reale era già riuscita

### Nuovo componente

- `GamepadTester.tsx`: test visivo del controller integrato nella tab Input, nessun canale di lettura separato dal resto della navigazione

### Rifinitura post-milestone (v0.98.3 → v0.99.0)

Lavoro di consolidamento successivo alla milestone iniziale, emerso da test ripetuti su hardware reale:

- **Fullscreen/Exit**: toggle Fullscreen reso realmente funzionante e persistito (`app.conf`, letto da `kiosk-launch.sh` all'avvio); nuova voce Exit nel menu con conferma a 2 tap
- **Centro notifiche**: L2/R2 come scorciatoie dirette, stato "non letta" onesto (`seen`, mai automatico — solo all'apertura reale del pannello, distinto da `status` che può scadere da solo), testo più leggibile, "Pulisci storico" navigabile
- **Fix autenticazione GOG**: `isAuthenticated()` interrogava il comando sbagliato (`--list` invece di `--check-login-status`), causando un falso "disconnesso" anche dopo un login riuscito da terminale
- **Navigazione libreria**: risolta una serie di problemi di scroll/focus emersi solo in modalità finestra (non in fullscreen) — `isVisible()` separata in due funzioni distinte per non escludere righe sotto la piega dallo scoring direzionale; strategia di scroll a centraggio invece di scroll-al-bordo-minimo, che eliminava il confine critico responsabile di una "salita laterale a scatti" tra card adiacenti; scroll animato ma esplicitamente cancellabile per restare fluido senza reintrodurre race condition su pressioni rapide ripetute

### Rifinitura post-milestone (v0.99.4)

Tre incongruenze di navigazione segnalate dall'uso reale, risolte insieme a una revisione della strategia di refresh libreria:

- **Focus iniziale libreria**: la prima card (in alto a sinistra) viene ora selezionata automaticamente all'apertura/cambio di libreria, riusando lo stesso meccanismo di scoring del fallback automatico di `moveFocus` (estratto in `pickBestFallback`, esposto come nuova funzione `focusFirstInGroup`) invece di lasciare la libreria senza alcun focus iniziale fino al primo input direzionale dell'utente.
- **Lente di ricerca — mouse vs controller**: non più un `Focusable` (niente più selezione/attivazione da D-pad/A); il tasto **Y** apre ora la ricerca con Virtual Keyboard da controller, mentre il click mouse (e `Ctrl+F`) porta il focus diretto sul campo di testo reale, senza sovrapporre la VK — ridondante per chi sta già usando mouse e tastiera fisica.
- **Overlay Game Options che si resettava sempre sullo stesso gioco**: causa doppia — una `useEffect` storica pre-SSE sovrascriveva `selectedGameId` senza alcuna protezione sull'overlay aperto (aggravata dal refresh periodico v0.99.2, che la innescava più spesso), e il focus iniziale dell'overlay era forzato su un id hardcoded (il pulsante di chiusura) che bypassava il `fallbackPriority` negativo già dichiarato su quel pulsante. Risolto rimuovendo la useEffect ridondante e usando `focusFirstInGroup('game-options')` al posto del `setFocusedId` forzato — sia per l'apertura da tastiera/controller sia dal click destro del mouse, che prima non isolava nemmeno lo scope di navigazione (stesso tipo di interferenza con la dashboard sottostante già risolto per Manage Accounts).
- **Strategia di refresh libreria rivista**: il polling fisso ogni 90s (v0.99.2) sostituito da refresh on-demand ad ogni cambio reale di store (`POST /api/library/refresh`) più un timer di sicurezza rilassato a 5 minuti per chi resta fermo a lungo su una libreria — riduce sia il carico sulle CLI esterne (Epic/GOG) sia la frequenza di re-render che alimentava indirettamente il bug dell'overlay sopra descritto.

Vedi changelog v0.99.4 per il dettaglio completo dei fix.

### Rifinitura immediata (v0.99.5)

Il fix della lente in v0.99.4 introduceva un effetto collaterale non considerato: la guardia `activeGroup === null` sul tasto Y impediva la chiusura della ricerca una volta apertura (apertura → `activeGroup` diventa `'keyboard'` → la stessa guardia blocca la seconda pressione). Sintomo osservato: Y apriva la ricerca ma non la richiudeva più, e con `activeGroup` bloccato su `'keyboard'` anche L1/R1 restavano sordi alla navigazione store — l'unico sblocco era passare da un altro overlay (es. il menu) che resettava lo stato per un percorso diverso. Corretto in `isJustPressed('Y') && (activeGroup === null || activeGroup === 'keyboard')` — toggle simmetrico: Y apre se nessun overlay è attivo, chiude se l'overlay attivo è proprio quello della ricerca, resta bloccato solo se un overlay diverso occupa lo scope. Regola di riferimento: Y è il toggle della ricerca, sempre — non devono esistere stati in cui l'unico modo di chiuderla sia un percorso indiretto. Vedi changelog v0.99.5.

### Rifinitura immediata (v0.99.6)

Due problemi emersi testando il fix precedente: i risultati filtrati non erano navigabili da controller (il tasto "Fatto" della VK chiudeva la tastiera ma non riportava `activeGroup` a `null`, lasciando lo scope bloccato su un group ormai vuoto), e mancava una regola di priorità per quando l'utente vuole semplicemente cambiare libreria mentre un'altra interazione è in corso. Risolto: "Fatto" ora riporta correttamente lo scope alla dashboard senza chiudere la ricerca, lasciando i risultati navigabili; e i dorsali L1/R1 hanno ora priorità assoluta sulla navigazione fra store, annullando automaticamente ricerca/Game Options/Avatar Library se attivi (categorie che interrompono l'interazione con la libreria corrente), mentre restano bloccati per menu/Settings/Downloads/Notifiche (processi indipendenti dalla libreria visualizzata, mai da annullare per un cambio di store). Vedi changelog v0.99.6.

### Rifinitura immediata (v0.99.7)

Due regressioni emerse testando il fix precedente: L1/R1 erano diventati completamente non responsivi in qualunque condizione (causa: `isJustPressed()` consuma il fronte di pressione alla prima lettura — v0.99.6 lo chiamava due volte per lo stesso tasto nello stesso frame, e la seconda chiamata leggeva sempre `false`); e il focus iniziale dopo "Fatto" sulla ricerca sembrava partire dall'ultima card a destra invece che dalla prima a sinistra (causa reale, identificata dall'indicazione dell'utente: l'icona tastiera accanto al campo di ricerca aveva `fallbackPriority` di default, identico alle card, ma essendo geometricamente sopra l'intera griglia veniva sempre scelta per prima dal fallback automatico). Entrambi risolti: L1/R1 letti una sola volta per tasto e riusati; icona tastiera impostata a `fallbackPriority={-1}`, stesso pattern già usato per i pulsanti di chiusura. Vedi changelog v0.99.7.

### Workflow scoperto: ricerca cross-store (v0.99.8)

Conseguenza piacevole non originariamente prevista dei fix L1/R1 (v0.99.6-7): con i dorsali che possono cambiare libreria mentre la ricerca resta attiva, è emerso un workflow utile — cercare un titolo di cui non si ricorda lo store, scorrere con L1/R1 attraverso le librerie finché non risulta filtrato altrove. L'unico inconveniente era che chiudere la ricerca con Y riportava sempre allo store di partenza (rollback automatico in `toggleSearch`), vanificando la scoperta se il titolo era stato trovato altrove. Rimosso il rollback: la chiusura della ricerca lascia ora lo store esattamente dov'è al momento della chiusura. Vedi changelog v0.99.8.

### Investigazione input lag: modalità Borderless (v0.99.9)

Osservazione dall'uso reale: la Dashboard risulta più reattiva in modalità finestra rispetto a schermo intero kiosk. Causa più probabile: xfwm4 potrebbe non disabilitare il proprio compositing ("unredirect") per la finestra fullscreen creata da `--kiosk` (comportamento documentato come problematico per finestre fullscreen non "override redirect"), risultando in doppio compositing software insieme a `--disable-gpu-compositing` di Chromium, già presente in entrambe le modalità precedenti. Aggiunta una terza modalità sperimentale "Borderless" (finestra massimizzata senza bordi, dimensionata come lo schermo, senza `--kiosk` né `--disable-gpu-compositing`) per confrontare empiricamente sull'hardware reale. `appConfig.ts` ha ora `displayMode: 'kiosk' | 'window' | 'borderless'` (vecchio booleano `fullscreen` mantenuto per retrocompatibilità); `kiosk-launch.sh` aggiornato con i tre rami; menu "Fullscreen" diventa "Display Mode", ciclo a tre stati. Vedi changelog v0.99.9.

### Rifinitura post-test reale (v0.99.10)

Due feedback dal primo giro di test su hardware reale. (1) Focus ereditato su `btn-keyboard`: con la libreria filtrata a zero risultati l'icona tastiera (unico elemento nel pool) veniva selezionata, e quel focus restava "ereditato" cambiando libreria con L1/R1 — risolto alla radice togliendo `Focusable` dall'icona (stesso trattamento già dato alla lente in v0.99.4: Y apre già la ricerca da controller, l'icona serve solo al percorso mouse). (2) Borderless non realmente a tutto schermo, decoratore Chromium ancora visibile: causa, `--window-size`/`--window-position` non equivalgono a una vera massimizzazione dal punto di vista del window manager, che rimuove il decoratore solo per lo stato "maximized" reale — corretto con `--start-maximized` al posto dei due flag di dimensione/posizione. Reattività superiore al kiosk già confermata dall'utente anche con la versione non ancora corretta. Vedi changelog v0.99.10.

### Diagnosi definitiva decoratore borderless (v0.99.11)

Confermato su hardware reale: `--start-maximized` non basta, il decoratore visibile (titlebar "X-Launcher HTPC" con pulsanti GTK nativi) non è disegnato da xfwm4 ma da Chromium stesso. Per finestre in modalità `--app` (parente delle PWA), Chromium usa CSD (client-side decoration) invece della decorazione del window manager — nessun flag "lato WM" può rimuoverla. Aggiunto `--use-system-title-bar`, che forza Chromium a delegare la decorazione al sistema — richiede però un passaggio manuale una tantum nel profilo Chromium (`chrome://settings` → Aspetto → preferenza titlebar di sistema), non automatizzabile in modo affidabile da riga di comando. Vedi changelog v0.99.11.

### Riprogettazione completa: niente più --kiosk reale (v0.99.12)

Scoperta decisiva dall'uso reale, che supera tutti i tentativi precedenti (v0.99.9-11) di rendere borderless visivamente identico al kiosk: avviando la Dashboard in finestra/borderless e portandola a schermo intero a runtime (Fullscreen API del DOM, non `--kiosk` impostato all'avvio del processo), la reattività della modalità finestra viene mantenuta anche a schermo intero. Il problema non è il fullscreen in sé — è specificamente come `--kiosk` configura Chromium fin dall'avvio, attivando un percorso di rendering diverso da quello di una finestra normale. `kiosk-launch.sh` non lancia più `--kiosk` in nessuna modalità: 'kiosk' e 'borderless' condividono ora lo stesso identico avvio Chromium; la differenza è demandata al frontend, che attiva `requestFullscreen()` al primo input gamepad/tastiera quando `displayMode === 'kiosk'` (il browser richiede una gesture utente valida per la Fullscreen API, quindi non può scattare al semplice mount). Conseguenza pratica: passare tra kiosk e borderless non richiede più alcun riavvio della Dashboard — il click sul menu è già una gesture valida. `--disable-gpu-compositing` rimosso anche dal ramo 'window', nessun motivo di mantenerlo in nessuna modalità. Vedi changelog v0.99.12.

### Gestione automatica e temporanea di titleless_maximize (v0.99.13)

Domanda dall'utente: `titleless_maximize` (xfwm4, necessaria per nascondere davvero il decoratore in Borderless/Kiosk) è una proprietà globale del desktop — si può attivarla solo durante l'uso di X-Launcher e ripristinarla alla chiusura, senza impattare il resto del desktop? Sì: `kiosk-launch.sh` ora salva il valore corrente prima di avviare Chromium (rami kiosk/borderless), lo forza a `true` per la sessione, e lo ripristina al valore originale alla chiusura — qualunque sia la causa (chiusura pulita, Alt+F4, crash), grazie a un handler `trap ... EXIT` e alla sostituzione di `exec` con avvio in background + `wait` (necessario per poter eseguire codice dopo la terminazione di Chromium). Vedi changelog v0.99.13.

### Nascondi temporaneamente i pannelli XFCE (v0.99.14)

Test reale del fix precedente: la decorazione scompare correttamente, ma il pannello XFCE in alto resta sopra la Dashboard borderless — xfwm4 massimizza fino ai bordi fisici dello schermo ma il pannello, gestito come layer separato, resta comunque in primo piano. Le altre finestre del desktop non perdevano la decorazione (comportamento atteso: `titleless_maximize` si applica solo alla transizione verso lo stato massimizzato, non retroattivamente). Stesso pattern del prestito temporaneo, estesto ai pannelli: enumerati dinamicamente da `/panels` (gestendo un numero variabile di pannelli/dock), `autohide-behavior` salvato e forzato a "sempre nascosto" per la sessione, ripristinato alla chiusura qualunque sia la causa. Se questa combinazione risulta stabile, Borderless può diventare la modalità fullscreen di riferimento del progetto. Vedi changelog v0.99.14.

### Fix: i pannelli XFCE non venivano affatto rilevati (v0.99.15)

Test reale: "non cambiava nulla" — causa, il pattern di estrazione ID pannello cercava una riga "bare" `/panels/panel-N` a fine riga, formato che non esiste nell'output reale di `xfconf-query -l` (solo sotto-property elencate, es. `/panels/panel-1/icon-size`). `XFCE_PANEL_IDS` risultava sempre vuoto, il ciclo di nascondimento non eseguiva nulla. Causa secondaria: uno dei pannelli reali dell'utente non aveva affatto la property `autohide-behavior` tra le esistenti — senza `--create`/`-n` e un tipo esplicito, xfconf-query rifiuta di scriverla, errore mascherato dal redirect già presente. Corretto il pattern di estrazione e aggiunto `-n -t uint` a entrambe le scritture (temporanea e ripristino), verificato con un test isolato sull'output reale fornito dall'utente. Vedi changelog v0.99.15.

### Menu semplificato a due opzioni (v0.99.16)

Confermato su hardware reale: Borderless dà reattività ottima. Il menu visibile ora mostra solo "Window" e "Fullscreen" (= `displayMode='kiosk'`, avvio borderless + auto-fullscreen al primo input). `borderless` come stato a sé resta disponibile ma non più ciclato dal menu — riattivabile con la scorciatoia nascosta Ctrl+Alt+B (sostituita in v0.99.17, vedi sotto), utile per debug o come preferenza avanzata. Logica di applicazione comune estratta in `applyDisplayMode`, condivisa tra il percorso visibile (`cycleDisplayMode`) e quello nascosto. Nessuna modifica al backend: `kiosk-launch.sh` continua a gestire tutti e tre i valori esattamente come prima. Vedi changelog v0.99.16.

### Chiarito il ruolo di Fullscreen API (v0.99.17)

Domanda dall'utente: a cosa serve ancora l'auto-`requestFullscreen()` se Borderless con titlebar e pannelli nascosti è già visivamente equivalente a schermo intero? Risposta: solo per l'avvio "a freddo" (nessuna gesture utente ancora avvenuta) — nei cambi fatti dal menu, il click stesso è già la gesture, quindi il meccanismo resta ridondante ma non dannoso in quel caso. Mantenuto come riserva tecnica su richiesta esplicita. Sostituita la scorciatoia Ctrl+Alt+B (attivava direttamente borderless senza mai mostrarlo nel menu) con un **toggle di visibilità**: Ctrl+Alt+K inserisce/rimuove una terza voce "Kiosk" (= borderless puro) nel ciclo del menu visibile, invece di attivarla direttamente in modo nascosto. Nuovo stato `kioskOptionVisible`, solo in memoria, mai persistito. Vedi changelog v0.99.17.

### Rimosso del tutto requestFullscreen (v0.99.18)

Confermato dal test reale, la "riserva tecnica" mantenuta in v0.99.17 produceva un fastidio concreto: il popup informativo del browser ("È entrato in modalità schermo intero") compariva ad ogni avvio in Fullscreen/Kiosk, senza alcun cambiamento visivo apprezzabile (la finestra è già a schermo intero grazie a titlebar+pannelli nascosti). Rimosso del tutto il meccanismo — `displayMode='kiosk'` e `displayMode='borderless'` sono ora identici a livello di comportamento del frontend, distinti solo come etichetta/preferenza persistita. Vedi changelog v0.99.18.

### Cursore visibile e bug navigazione (v0.99.19)

Conseguenza non considerata dell'abbandono di `--kiosk` reale: Chromium kiosk nascondeva automaticamente il cursore dopo inattività, comportamento perso passando a Borderless. Due fix dal test approfondito dell'utente: (1) cursore mouse sempre visibile — nuovo stato `cursorHidden`, `cursor-none` applicato quando l'ultimo input è dal gamepad, ripristinato al primo `mousemove` reale (non un timer, per non rimostrarlo per errore durante pause prolungate col controller in mano). (2) Bug più sottile e grave: navigando con D-pad/stick, la risalita "torna giù" verso l'area dove si trova il cursore — causa, il browser genera `mouseenter` reali ogni volta che il layout muove un elemento diverso sotto un cursore fermo, e il gestore esistente interpretava qualunque `mouseenter` come hover intenzionale dell'utente, rubando il focus dal controller. Mascherato in `--kiosk` reale perché il cursore non era mai visibile, ma gli eventi venivano generati comunque. Fix: tracking della posizione reale del mouse (`mousemove` globale), `mouseenter` ignorati se le coordinate coincidono con l'ultima posizione nota (nessun vero movimento). Vedi changelog v0.99.19.

### Il gamepad richiede il focus della finestra (v0.99.20)

Osservazione precisa dell'utente: il cursore si nascondeva solo dopo un click reale sulla finestra, non muovendo semplicemente lo stick. Diagnosi iniziale (rivista in v0.99.21): si sospettava un vincolo W3C sulla Gamepad API legato al focus, ma i test diagnostici dell'utente hanno mostrato che il gamepad riceve input anche senza focus — il vero problema era nello script. Fix: `kiosk-launch.sh` forza il focus della finestra subito dopo l'avvio con `wmctrl -a` (sul titolo della pagina) — richiede il pacchetto `wmctrl` (non preinstallato di default, `pacman -S wmctrl`). Applicato uniformemente a tutti i rami/browser. Vedi changelog v0.99.20.

### Fix: wmctrl riportava successo prima che Chromium fosse pronto (v0.99.21)

Nonostante il log confermasse regolarmente "Focus della finestra forzato", il problema persisteva — solo rilanciando manualmente lo stesso comando funzionava. Causa, dall'analisi del log e dai test diagnostici: il loop si fermava al primo successo apparente di `wmctrl -a`, che ritorna 0 semplicemente se trova la finestra ed esegue la richiesta, indipendentemente dal fatto che Chromium sia davvero pronto ad onorarla — nell'istante del primo tentativo la finestra X11 esiste già (può essere trovata per titolo) ma il processo non ha ancora completato l'inizializzazione necessaria. Fix: delay iniziale di 1s, poi 15 tentativi ripetuti ogni 0.3s anche dopo un successo apparente — l'ultimo tentativo, quando Chromium è quasi certamente pronto, ha probabilità realistica di funzionare. Vedi changelog v0.99.21.

**Nota**: il fix non ha risolto completamente il problema secondo un ulteriore giro di test reale — build diagnostica v0.99.22 (non distribuita come release standard, solo logging dettagliato di ogni tentativo wmctrl e dello stato `_NET_ACTIVE_WINDOW`) in corso di analisi per identificare la causa esatta.

### GOG: login API valido ma libreria vuota (v0.99.23)

Segnalazione: card Manage Account mostra l'account connesso, ma la libreria reale risulta vuota — sospetto iniziale di regressione del plugin. Diagnosi: comportamento noto e documentato di `lgogdownloader` stesso, non una regressione — usa due meccanismi di autenticazione separati (token OAuth dell'API, verificato da `--check-login-status`/la card; cookie di sessione del sito, necessari specificamente per `--list`/lo scan reale), che possono desincronizzarsi indipendentemente. `getLibrary()` ora distingue i due casi quando `--list` non restituisce titoli: se il login API risulta ancora valido, il messaggio identifica specificamente un probabile problema di cookie/sessione web con un suggerimento pratico, invece del generico "fai il login" anche quando l'utente è già autenticato. Vedi changelog v0.99.23.

### GOG: causa reale era il comando, non i cookie (v0.99.24)

Il sospetto sui cookie (v0.99.23) era plausibile ma non era la causa effettiva — confermato testando direttamente `lgogdownloader --list --no-color` da terminale (anche dopo reset completo di cache/credenziali): il comando completa il fetch (129/129 titoli) ma non stampa mai l'elenco testuale, tornando al prompt. Causa ipotizzata: le versioni recenti di `lgogdownloader` richiedono un argomento esplicito a `--list` — ipotesi poi rivelatasi sbagliata (vedi v0.99.27 più sotto). Fix tentato: `--list games`. Vedi changelog v0.99.24.

### GOG: causa reale era stderr, non l'argomento di --list (v0.99.27)

Il fix v0.99.24 non risolveva — confermato testando `--list`, `--list games`, `--list g`, tutti identici. L'output di `--help` ha confermato che `--list` ha già `games` come default — l'argomento non era mai stato il problema. Test diagnostico risolutivo: `lgogdownloader --list games 2>/dev/null` → nessun output; `1>/dev/null` → mostra il progresso. Conclusione inequivocabile: lgogdownloader scrive tutto il suo output (progresso e lista) su stderr, non su stdout — il plugin (`stdio: ['ignore', 'pipe', 'ignore']`) scartava esplicitamente stderr fin dall'inizio, indipendentemente da quale argomento veniva passato a `--list`. Fix: `stdio` cambiato a `['ignore', 'pipe', 'pipe']`, stesso handler di parsing registrato su entrambi gli stream con buffer condiviso. Prima causa verificata con un test diretto, non dedotta da documentazione generica. Vedi changelog v0.99.27.

### Focus gamepad: tentativo always-above persistente (v0.99.25)

Dato che `_NET_ACTIVE_WINDOW` risultava già corretto dal primo tentativo nei log diagnostici (v0.99.22), cambiato approccio da un singolo comando di attivazione momentanea a uno stato persistente: `wmctrl -r ... -b add,above`, che marca la finestra come "sempre sopra" a livello di window manager invece di una singola richiesta di focus che un evento successivo potrebbe vanificare.

### Sessione X11 dedicata: il focus non è più un problema per costruzione (v0.99.26)

Proposta dell'utente dopo diversi tentativi non risolutivi: se il problema è la competizione per il focus con altri elementi della sessione XFCE, la soluzione strutturale è eliminare quella competizione — sessione X11 dedicata via LightDM, dove X-Launcher è l'unico client connesso al display. Nuovo file `x-launcher.desktop` per il menu sessioni LightDM; rilevamento automatico in `kiosk-launch.sh` (presenza di xfwm4) che disabilita tutta la logica titlebar/pannelli/focus quando non serve; nuovo endpoint `dm-tool switch-to-user` per passare avanti e indietro tra le due sessioni senza chiudere X-Launcher; menu "Display Mode" sostituito da "Console Mode" quando in sessione dedicata. Resta da definire lo script di ritorno simmetrico da XFCE verso X-Launcher. Vedi changelog v0.99.26.

### Cursore: timer di inattività invece di inseguire il focus della finestra (v0.99.28)

Test reale conferma in modo definitivo che always-on-top (v0.99.25) non risolve il vero problema: cursore visibile e gamepad non recepito finché non avviene un'interazione esplicita, identico a prima — confermando che il problema non è mai stato di visibilità/posizione della finestra, ma del focus dell'input a livello di sistema. Dato che tenere la Dashboard sempre in primo piano è scomodo nella pratica e il cursore visibile non interferisce più con la navigazione (v0.99.19), proposta dell'utente adottata: timer di inattività del mouse (3s), indipendente da focus/gamepad — si nasconde dopo l'ultimo movimento reale, ricompare al primo movimento successivo. Rimosso il trigger basato su `gamepadState.buttons.size`, che dipendeva indirettamente dal focus e quindi non dava alcun vantaggio reale. Vedi changelog v0.99.28.

### Fix: cursor-none non vinceva sui cursor specifici dei figli (v0.99.29)

Il timer (v0.99.28) scattava correttamente ma il cursore restava comunque visibile — causa, `cursor-none` applicato solo al div radice perdeva sempre contro un `cursor-pointer` (o altro cursore esplicito) su un qualunque elemento figlio sotto il puntatore, normale conseguenza della cascata CSS, non un bug del timer. Fix: nuova regola globale in `index.css` con `!important` sul selettore universale (`.cursor-hidden-global, .cursor-hidden-global * { cursor: none !important; }`), che vince su qualsiasi cursore dichiarato dai discendenti senza dover toccare i singoli elementi sparsi nel codice. Vedi changelog v0.99.29.

### Always-on-top diventa opzionale (v0.99.30)

Confermato che always-above non risolve il focus dell'input (v0.99.28) — solo svantaggi (niente uso del desktop in parallelo) senza il beneficio sperato. Su richiesta dell'utente: nuovo flag `--always-on-top` su `kiosk-launch.sh`, default disattivato. Senza il flag, solo l'attivazione iniziale (`wmctrl -a`) viene eseguita; con il flag, ripristinato il comportamento precedente (`add,above` persistente). Da valutare in futuro: uno switch on/off diretto nel menu Display Mode della Dashboard. Vedi changelog v0.99.30.

### GOG: il vero fix finale (v0.99.31)

Dopo build/riavvio completi, il warning persisteva identico anche col fix v0.99.27 — la cattura di stderr era necessaria ma non sufficiente. Trovato un workaround documentato dalla community Arch (pagina AUR `lgogdownloader-git`, issue upstream #313): "se lgogdownloader restituisce una lista vuota, aggiungi `--no-platform-detection`" — corretto in una revisione successiva (3.18.r21) ma assente nella build 3.18 stabile installata. Verificato con output completo dall'utente: `--list games --no-platform-detection` stampa finalmente tutti i 129 titoli. Il parsing esistente (`parseSlug`/`slugToTitle`) già gestiva correttamente il formato (incluso il suffisso `[N]` per edizioni multiple) — nessuna modifica necessaria lì. Vedi changelog v0.99.31.

### Sessione X11 dedicata: installazione, Steam silenzioso, card Big Picture (v0.99.32)

Ripresa formale del lavoro sulla sessione dedicata (v0.99.26): **A** — `install.sh` (nuovo, opzionale) installa in `/opt/x-launcher` (scelta FHS corretta per software auto-contenuto non pacchettizzato), symlink `/usr/local/bin/x-launcher`, sessione LightDM; `x-launcher.desktop` corretto dal path hardcoded della home utente a `/opt/x-launcher` (l'unico punto dove un path fisso è strutturalmente necessario, dato che LightDM lo legge prima di qualunque login); verificato che il resto del backend già usa `homedir()` ovunque, nessun altro path da correggere. **B** — `session-launch.sh` (nuovo) avvia `steam -silent` in background prima di `kiosk-launch.sh`, così il client è già pronto a gestire `steam://rungameid/<id>` senza mai mostrare la sua UI completa al primo lancio di un gioco Steam. **C** — nuova card "Steam Big Picture" iniettata solo lato frontend nella libreria (Steam/All, sempre presente anche a libreria vuota), che passa a Big Picture tramite un nuovo endpoint `steam steam://open/bigpicture` — utile soprattutto in sessione dedicata, dove non esiste altrimenti un modo ovvio di raggiungere Steam senza uscire dalla Dashboard. Vedi changelog v0.99.32.

### Diagnosi: la sessione X11 dedicata via LightDM non si avvia (irrisolto)

Testata sul sistema reale dell'utente: selezionando "X-Launcher" dal menu sessioni LightDM, il sistema torna comunque a XFCE — confermato da `~/.xsession-errors` (log `xfce4-session` con timestamp coincidente). Cinque ipotesi verificate ed escluse una per una: (1) permessi degli script in `/opt/x-launcher` — tutti corretti; (2) un log diagnostico dedicato scritto da `session-launch.sh` in `/tmp` ha confermato con certezza che **LightDM non esegue mai lo script** ad un vero tentativo di login (solo nei test manuali dell'utente) — il problema è nel meccanismo di lancio sessione, non nello script; (3) `desktop-file-validate` ha segnalato un warning su `DesktopNames` rivelatosi un falso allarme (campo standard, usato identico in `xfce.desktop`/`i3.desktop` reali); (4) trovato e corretto un problema reale ma non risolutivo — il file `.desktop` aveva erroneamente il bit eseguibile impostato; (5) rinominato il file/identificatore da `x-launcher` a `xlauncher` per escludere un'ipotesi sul trattino — nessun cambiamento. **Causa non isolata con certezza** — il prossimo passo proposto ma non eseguito è `lightdm --debug --test-mode` per il log verboso del comando esatto tentato. Non blocca il resto del progetto, verificato pienamente funzionante sopra XFCE.

### Parte D completata: X-Launcher come Non-Steam Game, con artwork (v0.99.34)

Verificato un limite reale di Steam su Linux (issue ufficiali Valve #9463, #8580): l'AppID canonico di uno shortcut non-Steam resta calcolabile deterministicamente (CRC32), ma il BPID (necessario per un lancio programmatico esterno via `steam://rungameid/`) non è più prevedibile a priori nelle versioni recenti del client — Steam lo assegna casualmente, leggibile solo dopo il primo lancio manuale. Conseguenza accettata: la card si lancia con un click manuale da Big Picture, come qualunque altro shortcut, non con un link precompilato. Nuovo script standalone `scripts/setup-steam-shortcut.cjs` (Node.js CommonJS): rileva lo SteamID dell'utente da `loginusers.vdf`, genera l'AppID, scrive un writer binario VDF minimale **verificato con un parser di controllo dedicato** (un bug reale sulla struttura della mappa radice è stato trovato e corretto esattamente grazie a questo test), preserva eventuali shortcut esistenti (testato con un file simulato), evita duplicati. Nuovi asset `assets/steam-grid/*.png` (boxart, hero, logo, capsule) alle dimensioni esatte richieste da Steam, generati con Pillow (coerenti con lo stile X-Launcher). `appVersion` nel menu e `metadata.json` aggiornati a `0.99.34-alpha`. Vedi changelog v0.99.34.

-----

## Step 15 — Notification Center + AI Advisor

### Obiettivo

Unificare tutte le comunicazioni della dashboard verso l'utente in un sistema di notifiche strutturato, costruire un backend real-time con persistenza, e aggiungere un layer di intelligenza artificiale — con KnowledgeBase locale come primo livello e plugin AI commerciali/locali come secondo livello.

L'architettura è a quattro step progressivi e indipendenti: ogni step è funzionante e rilasciabile da solo.

---

### 15a — NotificationBar: unificazione UI

**Obiettivo**: estendere la barra in fondo (attualmente solo download) per gestire qualsiasi comunicazione della dashboard.

**Struttura barra unificata** (tre zone):
- **Download** — progress, speed, pausa/riprendi (invariato)
- **Notifiche sistema** — toast con auto-dismiss per launch, auth, errori, info
- **Centro notifiche** — pannello con storico sessione e badge contatore non letti

**Tipo `AppNotification`**:
```typescript
interface AppNotification {
  id:          string;
  type:        'info' | 'success' | 'warning' | 'error' | 'ai-suggestion' | 'kb-suggestion';
  title:       string;
  body:        string;
  gameId?:     string;
  gameTitle?:  string;
  suggestion?: string;
  primaryAction?:   { label: string; handler: string; params: any };
  secondaryAction?: { label: string; handler: string };
  rawLog?:     string;        // stderr grezzo, espandibile
  timestamp:   string;
  dismissed:   boolean;
  source:      'system' | 'pattern' | 'kb' | 'ai';
  aiProvider?: string;
  confidence?: 'high' | 'medium' | 'low';
}
```

**Sei tipi di notifica** con colore e icona distintivi:
- `info` — blu: informazioni generali (sync libreria, aggiornamenti)
- `success` — verde: installazione completata, lancio riuscito, auth OK
- `warning` — giallo: attenzione richiesta ma non bloccante
- `error` — rosso: errore critico con possibile azione correttiva
- `ai-suggestion` — viola: suggerimento elaborato da un provider AI
- `kb-suggestion` — grigio: risposta dalla KnowledgeBase locale (offline, immediata)

**Interazione con ogni card**:
- Pulsante primario → esegue azione (winetricks, config patch, relaunch, deeplink)
- Pulsante secondario → naviga alla sezione pertinente (overlay gioco, Settings)
- `▾ Log tecnico` → espande stderr grezzo inline
- Badge sul pulsante barra quando ci sono notifiche non lette

---

### 15b — NotificationEngine: backend core

**Obiettivo**: infrastruttura real-time che alimenta la UI da qualsiasi componente del daemon.

**Componenti**:

| Componente | Responsabilità |
|---|---|
| `EventBus` | pub/sub interno — qualsiasi modulo emette eventi senza accoppiamento diretto |
| `NotificationQueue` | coda con priorità, deduplicazione per `id` e TTL configurabile |
| `SSE /api/notifications` | stream Server-Sent Events verso il frontend (stessa tecnica dei download) |
| `NotificationStore` | tabella SQLite `notifications` — storico persistente tra sessioni |
| `RuleEngine` | regole configurabili: soglie, silenzia per tipo/store, dedup per pattern |
| `LogBridge` | promuove automaticamente log di livello `error`/`warning`/`auth` a notifiche visibili |

**Schema SQLite** (tabella `notifications`):
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  source       TEXT NOT NULL,    -- 'system' | 'pattern' | 'kb' | 'ai'
  game_id      TEXT,
  raw_log      TEXT,
  dismissed    INTEGER DEFAULT 0,
  created_at   TEXT NOT NULL,
  ai_provider  TEXT,
  confidence   TEXT
);
```

**LogBridge** — nessuna modifica al codice esistente richiesta. Intercetta i `writeLog()` di livello `error`/`warning`/`auth` e li promuove a notifiche con diagnosi minima automatica, evitando duplicati per pattern identici nella stessa sessione.

---

### 15c — KnowledgeBase: dizionario locale

**Obiettivo**: rispondere agli errori noti offline, senza latenza e senza dipendere dalla connettività o da credenziali AI.

**Struttura KnowledgeEntry**:
```typescript
interface KnowledgeEntry {
  id:          string;
  pattern:     string;       // regex o stringa esatta da cercare nel log/errore
  solution:    string;       // testo in linguaggio naturale
  actionType:  'winetricks' | 'config_patch' | 'relaunch' | 'open_section' | 'none';
  actionParams: Record<string, string>;
  source:      'seed' | 'ai-writeback' | 'manual';
  confidence:  'high' | 'medium' | 'low';
  hit_count:   number;       // volte in cui questo pattern ha fatto match
  score:       number;       // ranking per soluzioni alternative allo stesso pattern
  last_seen:   string;       // timestamp ultima occorrenza
}
```

**KBMatcher** — fuzzy match con soglia di confidenza configurabile:
1. Ricerca esatta del pattern nel messaggio di errore
2. Se nessun match esatto, fuzzy search per somiglianza
3. Ritorna la voce con score più alto sopra la soglia
4. Se sotto soglia → passa al livello AI (Step 15d)

**kb-seed.json** — dizionario iniziale con i casi più frequenti, curato manualmente:

| Pattern | Diagnosi | Azione |
|---|---|---|
| `err:module:import_dll.*d3dx9` | DX9 runtime mancante | winetricks `d3dx9` |
| `err:module:import_dll.*d3dcompiler` | DX Shader Compiler mancante | winetricks `d3dcompiler_47` |
| `vulkan-1.dll not found` | Vulkan non disponibile | Disabilita DXVK |
| `err:seh:setup_exception` | Crash VC++ runtime | winetricks `vcrun2019` |
| `err:ole:CoGetClassObject` | COM component mancante | winetricks `dotnet48` |
| `err:d3d:.*No adapter` | GPU non rilevata da Wine | Software rendering |
| `0xc0000005` | Access Violation generico | Disabilita DXVK/VKD3D |
| `err:ntdll:.*stack overflow` | Stack overflow | Aumenta stack Wine |
| `err:wgl:` | OpenGL context fallito | Reinstalla driver Mesa |
| `legendary.*not logged in` | Sessione Epic scaduta | Re-auth Epic in Settings |
| `lgogdownloader.*401` | Sessione GOG scaduta | Re-auth GOG in Settings |
| `wine: cannot find` | Eseguibile non trovato | Riconfigura exe in overlay |

**Ciclo di vita di una notifica AI — tre stati**:

Le notifiche di tipo `ai-suggestion` e `kb-suggestion` non si auto-dismettono come le notifiche di sistema. Restano nel centro notifiche fino a conferma esplicita dell'utente, persistite in SQLite tra sessioni.

```
[Pending]
  card visibile, azione non ancora eseguita
  → pulsante primario: [✓ Applica]
  → pulsante secondario: [Ignora]

        ↓ click su "Applica"
        il backend esegue autonomamente:
          - winetricks install <verbs> nel prefix corretto
          - oppure patcha config nel DB (launch_args, compat flags, ecc.)
          - oppure rilancia il gioco con parametri modificati
        tutte le modifiche vengono scritte nel DB e propagate via SSE
        → l'overlay del gioco si aggiorna in tempo reale se aperto

[Applied]
  azione eseguita, in attesa di conferma dall'utente
  card rimane visibile con messaggio "Soluzione applicata — prova il gioco"
  → pulsante primario: [✅ Ha funzionato]
  → pulsante secondario: [❌ Non ha funzionato]

        ↓ [✅ Ha funzionato]                ↓ [❌ Non ha funzionato]

[Resolved]                              [Failed]
  → AIWriteback scrive KnowledgeEntry     → score della voce KB abbassato
  → score aumentato, hit_count++          → se fonte AI: eventuale retry
  → card spostata nello storico           →   con provider diverso
                                          → card rimane aperta con
                                              nuovo suggerimento alternativo
```

**Sincronizzazione overlay** — quando il backend applica autonomamente una modifica (verbs, launch_args, compat flags), deve:
1. Scrivere nel DB con le colonne già esistenti (`winetricks_verbs`, `launch_args`, `launch_cwd`, i toggle compat)
2. Emettere un evento SSE `{ type: 'game-updated', gameId }` — già usato per l'uninstall
3. Il frontend intercetta l'evento e aggiorna il game state in memoria senza reload
4. Se l'overlay di quel gioco è aperto, i campi si aggiornano in tempo reale (ottimistic UI già presente)

In questo modo l'overlay riflette sempre fedelmente lo stato reale del gioco, anche dopo modifiche applicate autonomamente dal sistema di notifiche.

**AIWriteback** — chiude il loop:
- Ogni soluzione confermata (`Resolved`) viene scritta come `KnowledgeEntry` con `source: 'ai-writeback'`
- `hit_count` e `score` si aggiornano ad ogni successivo match
- I suggerimenti falliti (`Failed`) abbassano lo `score` — voci sistematicamente inefficaci vengono degradate nel ranking del `KBMatcher`
- La stessa soluzione confermata viene proposta offline alle occorrenze future, senza nuove chiamate AI

**Lookup flow completo**:
```
errore rilevato
  └─ KBMatcher
       ├─ match ≥ soglia → kb-suggestion (offline, <1ms) → [Pending]
       └─ nessun match   → AI Advisor
                               └─ risposta AI → [Pending]
                                    ↓ utente: [Applica]
                                    backend esegue + SSE game-updated → overlay sync
                                    ↓ utente: [✅ Ha funzionato]
                                    AIWriteback → KnowledgeEntry → KB locale
                                    ↓ utente: [❌ Non ha funzionato]
                                    score-- → retry con provider alternativo
```

---

### 15d — AI Advisor: plugin architecture

**Obiettivo**: analisi degli errori non coperti dalla KB tramite provider AI intercambiabili, con la stessa architettura plugin già usata per store, runner e input.

**Interfaccia base** (`src/backend/ai/base.ts`):
```typescript
export abstract class AIAdvisorPlugin {
  abstract readonly id:          string;
  abstract readonly name:        string;
  abstract readonly requiresKey: boolean;

  abstract analyze(context: ErrorContext): Promise<Suggestion[]>;
}

export interface ErrorContext {
  errorText:    string;        // log/stderr che ha generato la notifica
  game?:        Game;          // gioco coinvolto, include prefix_path e winetricks_verbs
  store?:       string;        // plugin store
  runner?:      string;        // runner usato
  osInfo:       string;        // distro, kernel, versione driver GPU
  winetricks?:  string[];      // verbs installati nel prefix
  compatFlags?: Record<string, boolean>;  // dxvk, vkd3d, fsr, gamemode, mangohud
  action?:      string;        // cosa stava facendo l'utente (launch, install, download)
}

export interface Suggestion {
  diagnosis:    string;
  suggestion:   string;
  actionType:   'winetricks' | 'config_patch' | 'relaunch' | 'open_section' | 'none';
  actionParams: Record<string, string>;
  confidence:   'high' | 'medium' | 'low';
}
```

**Quando viene attivato**: solo per errori che non hanno trovato match nella KB con confidenza sufficiente. L'`ErrorContext` include sempre `prefix_path` e `winetricks_verbs` dal DB del gioco, in modo che il provider sappia esattamente su quale prefix operare senza chiedere nulla all'utente.

**Provider implementati**:

| Plugin | File | Auth |
|---|---|---|
| Claude (Anthropic) | `ai/claudeProvider.ts` | `ANTHROPIC_API_KEY` nel `.env` |
| ChatGPT (OpenAI) | `ai/openaiProvider.ts` | `OPENAI_API_KEY` nel `.env` |
| Gemini (Google) | `ai/geminiProvider.ts` | `GEMINI_API_KEY` nel `.env` |
| DeepSeek | `ai/deepseekProvider.ts` | `DEEPSEEK_API_KEY` nel `.env` |
| Ollama (locale) | `ai/ollamaProvider.ts` | URL endpoint (default `localhost:11434`) |

Il prompt verso ogni provider è strutturato e richiede risposta JSON pura:
```
Sei un assistente tecnico per Linux gaming con Wine/Proton.
Analizza questo errore e rispondi SOLO con un array JSON di Suggestion[].

Contesto: [osInfo · runner · store · winetricks installati · compat flags]
Prefix: [prefix_path]
Errore: [errorText]
```

**Configurazione provider** persistita in `~/.local/share/x-launcher/ai.conf` (fuori dal DB, permessi 600):
```
activeProvider = claude
ollamaUrl      = http://localhost:11434
ollamaModel    = llama3
```

---

### 15e — GameDependencyProfile: database dipendenze per gioco

**Obiettivo**: memorizzare la configurazione funzionante di ogni gioco come profilo autonomo, applicabile automaticamente a future installazioni o reinstallazioni, eliminando la necessità di riscoprire le dipendenze ogni volta.

È concettualmente simile a un Dockerfile per i giochi Wine: descrive esattamente cosa serve per far girare quel titolo su quella piattaforma.

**Struttura GameDependencyProfile**:
```typescript
interface GameDependencyProfile {
  id:           string;        // gameId dal DB
  slug:         string;        // slug normalizzato (cross-store, es. "machinarium")
  store:        string;
  winetricks:   string[];      // verbs necessari al funzionamento
  launchArgs:   string;
  launchCwd:    string;
  runner:       string;        // es. "GE-Proton10-34"
  compatFlags:  Record<string, boolean>;  // dxvk, vkd3d, fsr, gamemode, mangohud
  source:       'seed' | 'ai' | 'user';  // chi ha creato/verificato il profilo
  confidence:   'high' | 'medium' | 'low';
  lastVerified: string;        // timestamp ultima conferma funzionante
  verifiedOn:   string;        // es. "Arch Linux 6.9 · Mesa 24.1 · Wine 9.12"
  notes:        string;        // note libere (es. "richiede ScummVM bundled")
}
```

**Tre sorgenti di popolamento**:

1. **Seed manuale** (`game-profiles-seed.json`) — profili noti curati a mano per i titoli più comuni: giochi GOG con ScummVM bundled, titoli notoriamente problematici con Wine, giochi che richiedono verbs specifici. Caricato al boot del daemon come la `kb-seed.json`.

2. **AI writeback** — quando una soluzione AI viene confermata (`Resolved`), il sistema non scrive solo la `KnowledgeEntry` ma aggiorna anche il `GameDependencyProfile` del gioco coinvolto, accumulando la configurazione funzionante nel tempo.

3. **Configurazione utente** — ogni modifica manuale nell'overlay (aggiunta/rimozione verb, cambio runner, modifica launch args) viene propagata al profilo con `source: 'user'`, che ha la precedenza massima.

**Applicazione automatica al reinstall**:

Quando un gioco viene reinstallato (o installato su una nuova macchina importando il DB), `launchGame()` e la pipeline di installazione controllano l'esistenza di un `GameDependencyProfile`:
- Se esiste con `confidence: 'high'` → applica automaticamente prima ancora di avviare il gioco
- Se esiste con `confidence: 'medium'` → propone all'utente come suggerimento pre-lancio
- Se non esiste → comportamento attuale (prefix vuota, verbs di default)

**`verifiedOn`** — la configurazione è versionata rispetto all'ambiente. Un profilo verificato su Wine 9 con Mesa 23 potrebbe non essere valido su Wine 11 con driver diversi. Il sistema mostra un avviso se `verifiedOn` differisce significativamente dall'ambiente corrente, suggerendo di ri-verificare.

**Relazione con l'overlay**:

Il `GameDependencyProfile` è la sorgente di verità per i campi dell'overlay. Quando l'overlay viene aperto, mostra sempre i valori dal DB del gioco (già esistente), ma se esiste un profilo con dati più recenti o con `source: 'user'`, li propone come "configurazione consigliata" con un pulsante "Applica profilo". Ogni modifica manuale nell'overlay aggiorna sia il DB del gioco che il profilo.

**Schema SQLite** (tabella `game_dependency_profiles`):
```sql
CREATE TABLE IF NOT EXISTS game_dependency_profiles (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL,
  store         TEXT NOT NULL,
  winetricks    TEXT,          -- JSON array
  launch_args   TEXT,
  launch_cwd    TEXT,
  runner        TEXT,
  compat_flags  TEXT,          -- JSON object
  source        TEXT NOT NULL DEFAULT 'user',
  confidence    TEXT NOT NULL DEFAULT 'medium',
  last_verified TEXT,
  verified_on   TEXT,
  notes         TEXT
);
```

---

### Settings → tab AI Advisor

Nuovo tab nel pannello Settings (accanto a Plugins e Input):

**Sezione provider**:
- Dropdown provider attivo (Claude / ChatGPT / Gemini / DeepSeek / Ollama)
- Campo API key (oscurata con toggle mostra/nascondi)
- Per Ollama: campo URL endpoint + dropdown modelli da `GET /api/tags`
- Toggle "Analisi automatica errori" on/off
- Toggle "Mostra log tecnico nelle card" on/off
- Pulsante "Test connessione" → ping + risposta di prova con badge ✅/❌

**Sezione KnowledgeBase**:
- Contatore voci presenti (seed + AI writeback)
- Lista voci con filtro per fonte (seed / ai-writeback / manual)
- Elimina singola voce / esporta JSON
- Slider soglia confidenza minima per KBMatcher (default 0.75)
- Pulsante "Reset KB" → ripristina solo il seed iniziale
- Pulsante "Importa seed" → ricarica `kb-seed.json` senza cancellare le voci AI writeback

**Sezione Game Dependency Profiles**:
- Lista profili presenti con filtro per store e fonte (seed / ai / user)
- Per ogni profilo: slug, runner, verbs, data ultima verifica, ambiente verificato
- Pulsante "Applica a gioco" → forza applicazione del profilo al gioco corrispondente
- Pulsante "Esporta profili" → JSON esportabile per backup o condivisione
- Pulsante "Importa seed profili" → ricarica `game-profiles-seed.json`
- Toggle "Applica automaticamente profili high-confidence al reinstall" (default on)
- Toggle "Avvisa se ambiente diverso da verifiedOn" (default on)

---

### Tabella roadmap complessiva Step 12→15

| Step | Obiettivo | Stato |
|------|-----------|-------|
| 12a | Exe da sorgente autorevole (legendary/goggame-*.info) | ✅ verificato |
| 12b | Card behavior unificato + conferma install/uninstall | ✅ verificato |
| 12c | Overlay unificato store-agnostic | ✅ verificato |
| 12d | Uninstall universale | ✅ verificato |
| 12e | Fix legendary sync TypeError | ✅ verificato |
| 12f | Log management universale | ✅ verificato |
| 12g | Fix launchCwd case-insensitive + db.getAllGames | ✅ verificato |
| 12g+ | Light theme fix completo + Avatar Library | ✅ verificato |
| 13  | Store Accounts + System tab + Runner Bridge | ✅ verificato |
| v0.95α | Bugfix post-step13 + Plugin DRM block + /api/plugins fix | ✅ milestone |
| 15a | NotificationBar — unificazione UI barra | ✅ verificato |
| 15b | NotificationEngine — EventBus, Queue, SSE, Store, LogBridge | ✅ verificato |
| 15c | KnowledgeBase — KB locale, KBMatcher, AIWriteback, kb-seed | ✅ verificato |
| v0.96α | Notification Center + KnowledgeBase locale | ✅ milestone |
| 16  | Navigazione gamepad completa (tutte le aree, store accounts, runner tab) | ✅ milestone |
| v0.98.0α | Controller-first navigation completa | ✅ milestone |
| v0.99.0α | Centro notifiche, fix GOG auth, navigazione libreria rifinita | ✅ milestone |
| v0.99.1α | Fix sync libreria Classic Console (ROM rimosse/rinominate) | ✅ verificato |
| v0.99.2α | Auto-scaffolding cartelle sistema + MAME + refresh periodico libreria | ✅ verificato |
| v0.99.3α | Fix core MAME (mame_libretro.so invece di mame2003_plus, non installato) | ✅ verificato |
| v0.99.4α | Fix navigazione: focus libreria, lente ricerca Y/mouse, overlay che si resettava su GOG, refresh on-demand | ✅ verificato |
| v0.99.5α | Fix tasto Y: toggle ricerca non simmetrico, dorsali store bloccati dopo apertura ricerca | ✅ verificato |
| v0.99.6α | Fix risultati ricerca non navigabili da controller + priorità dorsali store su overlay annullabili | ✅ verificato |
| v0.99.7α | Fix regressione critica L1/R1 (isJustPressed letto due volte) + focus iniziale post-ricerca (icona tastiera senza fallbackPriority) | ✅ verificato |
| v0.99.8α | Ricerca cross-store: rimosso rollback allo store di partenza alla chiusura | ✅ verificato |
| v0.99.9α | Modalità display "Borderless" sperimentale per investigare input lag kiosk vs finestra | 🧪 da testare |
| v0.99.10α | Fix focus ereditato su btn-keyboard + borderless realmente a tutto schermo (--start-maximized) | 🧪 da testare |
| v0.99.11α | Borderless: --use-system-title-bar per rimuovere il CSD di Chromium (richiede passaggio manuale una tantum nel profilo) | 🧪 da testare |
| v0.99.12α | Riprogettazione: niente più --kiosk reale, fullscreen via DOM al primo input — kiosk e borderless ora stesso processo | 🧪 da testare |
| v0.99.13α | Gestione automatica/temporanea di titleless_maximize (xfwm4), ripristinata alla chiusura qualunque sia la causa | 🧪 da testare |
| v0.99.14α | Nascondi temporaneamente i pannelli XFCE in Borderless/Kiosk, ripristinati alla chiusura | 🧪 da testare |
| v0.99.15α | Fix: pattern di estrazione ID pannello errato (XFCE_PANEL_IDS sempre vuoto) + --create per property mancanti | ✅ verificato |
| v0.99.16α | Menu semplificato a Window/Fullscreen, Borderless nascosta (Ctrl+Alt+B) | ✅ verificato |
| v0.99.17α | Ctrl+Alt+B → Ctrl+Alt+K: toggle di visibilità della voce "Kiosk" nel menu, invece di attivazione diretta nascosta | ✅ verificato |
| v0.99.18α | Rimosso del tutto requestFullscreen — popup browser ad ogni avvio senza beneficio visivo | ✅ verificato |
| v0.99.19α | Fix cursore mouse sempre visibile + bug navigazione controller (mouseenter passivi rubavano il focus) | ✅ verificato |
| v0.99.20α | Fix: il gamepad non funziona finché la finestra non ha il focus del window manager (wmctrl -a) | 🧪 da testare |
| v0.99.21α | Fix: wmctrl riportava successo prima che Chromium fosse davvero pronto a onorare il focus | 🧪 da testare (non risolutivo, indagine in corso v0.99.22) |
| v0.99.23α | GOG: distinzione tra login API valido e cookie web scaduti, messaggio specifico invece del generico "fai il login" | ✅ verificato (diagnosi) |
| v0.99.24α | GOG: causa reale era --list senza argomento esplicito (versioni recenti), non i cookie — ipotesi poi rivelatasi sbagliata, vedi v0.99.27 | ❌ non risolutivo |
| v0.99.25α | Focus gamepad: wmctrl always-above persistente invece di singola attivazione | 🧪 da testare |
| v0.99.26α | Sessione X11 dedicata via LightDM — elimina la competizione per il focus alla radice | ❌ NON FUNZIONANTE (vedi diagnosi sotto) |
| v0.99.27α | GOG: fix stdout/stderr — necessario ma non sufficiente, restava il bug --no-platform-detection (vedi v0.99.31) | ⚠️ parziale |
| v0.99.28α | Cursore: timer di inattività (3s) invece di inseguire il focus della finestra | ✅ verificato |
| v0.99.29α | Fix: cursor-none non vinceva sui cursor specifici dei figli (card/bottoni) — regola CSS globale con !important | ✅ verificato |
| v0.99.30α | Always-on-top reso opzionale (--always-on-top), default disattivato | ✅ verificato |
| v0.99.31α | GOG: fix finale --no-platform-detection (bug noto AUR/upstream #313) — elenco completo 129 titoli verificato da output reale | ✅ verificato |
| v0.99.32α | Sessione X11 dedicata: install.sh (/opt), Steam silenzioso, card Big Picture in libreria | ⚠️ install.sh/card funzionanti; sessione LightDM NON funzionante |
| v0.99.34α | X-Launcher come Non-Steam Game in Steam (shortcuts.vdf, AppID CRC32, artwork dedicata) — limite noto: BPID non precompilabile, click manuale richiesto | ✅ verificato (test con parser dedicato), da confermare su Steam reale |
| v0.99.36α | Sistema di verifica per-gioco (badge "verificato", verified/verified_at/verification_method) + Step 2 lock (install/lancio/uninstall mutuamente esclusivi) | ✅ verificato |
| v0.99.37α | Known-fixes Heroic esteso a GOG (fetchGogNumericId) + fix card Steam Big Picture (info sbagliate nel pannello destro) + fix runner non caricati senza aprire System | ✅ verificato |
| v0.99.38α | Test protocol completo: prompt di validazione automatico alla chiusura (+ fix crash critico scrittura notifiche, 8/15 blocchi affetti), notifiche navigabili col pad, cancellazione download con pulizia file, fix persistenza `runner`, installazione runner-aware (prefix Proton in `.../pfx`), script `test-game.sh` | ✅ verificato |
| v0.99.90α | Consolidamento pacchetto — nessuna nuova feature, verifica sintattica completa (`tsc --noEmit`) su tutti i file toccati | ✅ milestone |
| 15d | AI Advisor — completo: interfaccia comune, KB a 34 pattern, cinque adapter (Ollama/Gemini/DeepSeek/ChatGPT/Claude), persistenza tentativi/credenziali/budget, collegamento a notificationEngine.ts, UI di gestione in Manage Accounts (tab visibile solo se Ollama raggiungibile, toggle a rettangolo-di-focus per modelli e provider cloud, test connessione). **Requisito UI rispettato: ogni superficie etichettata "EXPERIMENTAL".** Unico ramo non interattivo: `clarify` (testo informativo, non pulsanti cliccabili). | ✅ completo — clarify interattivo rimandato |
| 1.0.0-rc.1 | Prima release candidate — AI Advisor completo, due regressioni reali corrette (generi GOG/Epic/Steam bloccati su `'[]'`, race condition nel rilevamento chiusura gioco), cursore mouse indipendente dal focus (XFixes via tray.py), cattura log di lancio per diagnosticare fallimenti "silenziosi", tastiera virtuale riscritta con layout IT/EN-US e vicini di navigazione espliciti. `package.json` allineato (`x-launcher`, `1.0.0-rc.1`, prima residui `@alkali/applet`/`0.99.0-alpha`). | ✅ milestone |
| 1.0.5-rc.1 | Pulizia overlay Game Options (Runner Bridge nascosta per Classic Console, core RetroArch filtrati per sistema — con un secondo bug reale corretto, il campo `system` non era mai collegato allo schema DB —, layout Compatibility Layer uniforme, scrollbar coerente, navigazione asimmetrica tra sezioni corretta con vicini espliciti). Box descrizione del pannello info reso flessibile (mai eccede la colonna) con un bug di arrotondamento sub-pixel di `scrollTop` scoperto e corretto (accumulatore JS proprio). **Un mio errore** (`selectedGame` usato prima della dichiarazione, schermo nero ad ogni caricamento) trovato e corretto nella stessa sessione — metodo di verifica esteso di conseguenza a categorie di errore prima non controllate (`TS2448`/`TS2304`/`TS2454`/`TS2451`). | ✅ milestone |
| 17 | Navigation Strategy layer (SNI-derivato): strategia `sequential` per group 1D, primo migrato `settings-tabs`; generalizzato a `sequentialChain`+`chainAxis` per liste dinamiche annidate in group 2D (righe Custom Env Variables); debug tool `navDebugBus`/`NavDebugOverlay` (Ctrl+Alt+N) come regola permanente per ogni nuova feature di navigazione | ✅ milestone — validato hardware reale |
| 14  | GOG end-to-end hardware reale (Wine/Proton su SOMA, ScummVM bundled su Beneath a Steel Sky) | ✅ verificato |
| 15e | GameDependencyProfile — DB dipendenze per gioco, seed, auto-apply al reinstall | ⬜ pianificato |
| — | **AI Advisor — cascata `clarify` interattiva** — oggi solo testo informativo nella notifica; serve un componente frontend nuovo (le notifiche oggi supportano solo un'azione primaria + una secondaria, non una lista di scelte). | ⬜ da riprendere |
| — | **Process Manager dashboard** — tracking multi-processo (oggi solo `lastLaunchedGame`/pid del più recente), blocco lancio simultaneo di più giochi, identificatore `xlaunch://id-gioco` come contenitore di stato monitorabile. Annotata come idea, non ancora progettata nei dettagli. | ⬜ da riprendere |
| — | **Sessione X11 dedicata via LightDM** — diagnosi approfondita (5 ipotesi verificate ed escluse: permessi script, validità .desktop, bit eseguibile sul .desktop, nome file con trattino), causa non isolata con certezza. Prossimo passo proposto: `lightdm --debug --test-mode`. Non blocca il resto del progetto, che resta pienamente funzionante sopra XFCE. | ⬜ da riprendere |
| — | **Console/Kiosk Mode v2** — riprogettazione discussa (non implementata): Windowed/Full Screen invariati, Console Mode "spegne" il DE attivo (XFCE/KDE/GNOME/Cinnamon) restando nella stessa sessione X11 invece di richiedere una sessione dedicata separata, con opzione di salvare la modalità al logout per il login successivo. Richiede daemon Python (oggi limitato a minimize/restore + gestione cursore XFixes) esteso al rilevamento e gestione del DE. Limite noto: funziona solo su X11, non su Wayland (il compositor Wayland *è* il server grafico, non riavviabile senza terminare la sessione). Solo XFCE testabile con l'hardware disponibile. | ⬜ da riprendere — richiede sessione dedicata di progettazione |

---

## ✅ Step 17 — Navigation Strategy layer (SNI-derivato) [OK]

**Obiettivo**: ridurre la navigazione controller-specifica scritta caso per caso (`neighbors` espliciti, cicli `indexOf`/modulo a mano), avvicinandosi al modello discusso nel documento Semantic Navigation Interface fornito dall'utente — senza riscrivere `FocusProvider.tsx`.

- `NavigationStrategy` (`'geometric' | 'sequential'`) dichiarabile per `group`, default `geometric` → zero regressioni sui group non migrati
- `cycleSequential(group, direction, {wrap, fromId})`: ordine visivo (non di registrazione), per group genuinamente 1D
- Primo group migrato: `settings-tabs` — `cycleSettingsTab` non usa più l'array parallelo `settingsTabCycleIds` (rimosso, duplicava a mano la condizione `ollamaAvailable` già nel JSX)
- **Generalizzazione a `sequentialChain`/`chainAxis`**: `activeGroup` è uno scope unico per tutto un overlay — non si può assegnare `NavigationStrategy` a una sotto-sezione senza spezzare la navigazione del resto. `sequentialChain` risolve il caso di una lista dinamica annidata in un group 2D (righe Custom Env Variables in Game Options) restando nello stesso group, con `chainAxis` (`vertical`/`horizontal`, default `vertical`) a garantire che solo la direzione dell'asse primario sia intercettata — l'ortogonale passa al normale `neighbors`, permettendo azioni laterali (es. pulsante elimina) senza che la catena le scavalchi
- **Regola di progetto inaugurata**: ogni nuova implementazione di navigazione prevede uno strumento di debug spegnibile senza rimuovere codice — vedi `navDebugBus.ts`/`NavDebugOverlay.tsx` (Ctrl+Alt+N)
- **Validato su hardware reale**: overlay, notifiche, download/installazione, menu, ciclo store, ciclo tab System invariati; ciclo tab Settings corretto con Ollama attivo/disattivato; righe Custom Env Variables navigabili verticalmente in sequenza, pulsante elimina raggiungibile lateralmente senza scavalcamenti; sezione nascosta per Classic Console

**Rimandato**: migrazione Runner Bridge/Compatibility Layer/core RetroArch — quella sezione mescola oggi 1D (Runner Bridge) e 2D (Compatibility Layer griglia 2 colonne) nello stesso `group="game-options"`; richiede prima di separare i sotto-gruppi. Notifiche non migrate per lo stesso motivo (header orizzontale + bottoni affiancati per card, non un elenco 1D puro).

-----

## ✅ Step 18 — Consolidamento fetch libreria giochi [OK — v1.1.37]

**Contesto**: durante la diagnosi dei bug v1.1.20→v1.1.23 (card che "dimentica" lo stato installato/disinstallato) è emerso che il frontend chiama `GET /api/games` da almeno cinque punti indipendenti — login store, logout store, polling autenticazione OAuth, evento SSE `library-updated`, cambio store/filtro — ciascuno con la propria chiamata `fetch` e il proprio `setGames(...)`, senza alcun coordinamento tra loro. Il guard di sequenza (`librarySeqRef`, v1.1.22) risolve la corsa fra risposte fuori ordine, ma è un cerotto sopra la duplicazione, non una sua eliminazione — ogni nuovo punto che in futuro chiamasse `/api/games` per conto proprio rischierebbe di reintrodurre la stessa classe di bug.

**Obiettivo**: una singola funzione condivisa (es. `refreshGamesList()`), che incapsuli fetch + guard di sequenza + aggiornamento cache + `setGames`, richiamata da tutti e cinque i punti invece che ciascuno duplichi la propria versione. L'API `/api/games` resta la stessa — è un refactor del lato chiamante, non un nuovo endpoint.

**Completato in v1.1.37**: nuova funzione condivisa `refreshGamesList()`. Durante l'analisi è emerso che tre dei cinque punti (login, logout, polling OAuth) erano non solo da consolidare ma del tutto ridondanti — `loginToStore()`/`logoutFromStore()`/`POST /api/library/refresh` scatenano già `refreshLibrary()` lato server, che notifica l'evento SSE `library-updated` prima che la risposta HTTP torni al frontend. Rimossi come chiamanti diretti di `/api/games`: restano solo l'handler SSE e l'effetto legato ad activeStore/filtri, entrambi ora sulla funzione condivisa. Dettaglio completo in CHANGELOG.md, v1.1.37. Da confermare su hardware reale nell'uso quotidiano (nessuna regressione attesa: `tsc --noEmit` pulito rispetto al baseline).

-----

## Step 19 — Funzionalità di secondo livello (roadmap pianificata dopo v1.1.36)

Definita dopo la chiusura del ciclo di affidabilità libreria/Epic/screensaver (v1.1.20→v1.1.36). Quattro fronti indipendenti, non ancora iniziati — ordine di elenco, non necessariamente di priorità.

### 19a — Protocollo `xlaunch://` comune a tutte le librerie

Un URI scheme unico (`xlaunch://<store>/<id>` o simile) per lanciare un gioco da fuori la Dashboard — link diretti da un browser, script esterni, o altre integrazioni — indipendentemente dallo store di provenienza. Da valutare: registrazione del protocollo a livello di sistema (`xdg-mime`/`.desktop` con `MimeType=x-scheme-handler/xlaunch`), e come risolvere l'id gioco in modo univoco fra store diversi che potrebbero avere convenzioni di id differenti (già visto in questa sessione: `gog-<slug>`, `epic-<appName esadecimale>`, `classic-<slug>-<hash>`) — **semplificato durante la discussione preliminare**: l'id di ogni gioco incorpora già lo store per costruzione, quindi `xlaunch://<id>` da solo basta, senza bisogno di un secondo segmento `<store>` separato da riconciliare. Discusso anche il comportamento a Dashboard non visibile: il demone Node gira già sempre in background via `xdash.service`, quindi il caso reale da gestire è "nessuna finestra browser aperta" — la finestra va aperta già nascosta (stesso meccanismo hide/show di `tray.py`, mai un lampeggio visibile), poi si delega a `gameManager.launchGame(id)`, la stessa funzione già usata dal pulsante Play — nessuna nuova logica di lancio da scrivere.

**v1.1.68, nato da questa discussione preliminare**: `tray.py` — nuovo sottomenu "Giochi recenti" nel menu contestuale (click destro sull'icona), con gli ultimi 3 giochi lanciati per un rilancio rapido via mouse in contesto desktop. Vedi CHANGELOG.md per il dettaglio (nuova colonna DB `last_launched_at`, endpoint `GET /api/games/recent`, e le due voci di menu preesistenti tradotte insieme alle nuove per coerenza con la convenzione bilingue).

**v1.1.69 — prima implementazione**: `xlaunch-handler.sh` (script invocato dal sistema per ogni link `xlaunch://<id>`, delega a `POST /api/launch` senza duplicare logica di lancio), `xlaunch-protocol.desktop` (registrazione `MimeType=x-scheme-handler/xlaunch`), `install.sh` esteso per installare il `.desktop` e registrare `xdg-mime default` come l'utente reale. Conflitto scoperto discutendone con l'utente prima di scrivere codice: `kiosk-launch.sh` richiama già la finestra in primo piano e gestisce i pannelli XFCE dopo l'avvio — risolto con una singola variabile d'ambiente (`X_LAUNCHER_START_HIDDEN`) che salta entrambi i passaggi quando l'avvio è per un lancio esterno nascosto, invece di duplicare la logica di avvio in un percorso separato. Non testato dal vivo in questo ambiente — vedi CHANGELOG.md v1.1.69.

**v1.1.73**: campo "Steam App ID" nel Game Config reso contestuale, richiesta dall'utente per risolvere un problema pratico di testing — senza un modo comodo per vedere l'id di un gioco, provare `xlaunch://<id>` richiedeva aprire il DB o i log a mano. Per Steam resta invariato; per tutti gli altri store diventa "xlaunch:// App ID" di sola lettura con l'id interno della Dashboard, copiabile con Invio.

### 19b — Supporto multilingua (Italiano/Inglese built-in + sistema di traduzioni caricabili) [🟡 IN CORSO — fondamenta v1.1.38]

**Problema attuale, confermato dall'utente**: l'interfaccia mescola italiano e inglese in modo incoerente — alcune stringhe sono in un lingua, altre nell'altra, senza un criterio.

**Fatto in v1.1.38**: motore `i18next`/`react-i18next`/`i18next-http-backend` scelto e configurato (`src/i18n/i18n.ts`), un namespace JSON per sezione principale in `public/locales/<lingua>/<namespace>.json` (caricati a runtime, non ricompilati — soddisfa il requisito "pacchetti caricabili" nativamente). Prima sezione migrata come prova: tab bar di Settings + tab Store Accounts per intero. Dettaglio in CHANGELOG.md, v1.1.38.

**Step 19b — CHIUSO.** Restava solo l'autorilevamento della lingua di sistema, fatto in v1.1.63. v1.1.64 — fix minore post-chiusura: overlap "Pulisci storico"/titolo in Notifiche (titolo su una singola parola non può andare a capo, spostato il pulsante su una riga propria). Rimangono solo due elementi fuori scope, deliberatamente deprioritizzati e documentati: Debug Console (strumento di sviluppo) e due punti minori con `game.store` grezzo in frasi runtime (vedi CHANGELOG.md v1.1.54).

**Fatto**: v1.1.38-43 — tutte e cinque le tab di Settings, selettore di lingua incluso. v1.1.44 — Quick Menu (namespace `quickMenu`). v1.1.45/46 — fix layout responsivo. v1.1.47 — header Dashboard, ricerca, ordinamento, filtri (namespace `dashboard`). v1.1.48 — sidebar dettagli gioco. v1.1.49 — fix corsa selettore lingua al boot + status gioco + nome store non-brand. v1.1.50/51 — overlay Game Options completo (namespace `gameOptions`). v1.1.52 — contenuto interno di Downloads e Notifiche (namespace `downloads`/`notifications`). v1.1.53/54 — fix intestazione libreria e nome store nella sidebar dettagli gioco. v1.1.55 — barra footer + placeholder tastiera virtuale. v1.1.56 — fix titoli header "Deployment Manager"/"Notifiche". v1.1.57 — Avatar Library (namespace `avatarLibrary`) + fix "Confirm A" + pulsante ESCI rosso in attesa di conferma. v1.1.58 — Knowledge Base dell'AI Advisor bilingue (34 voci). v1.1.59 — fix wrap Net Bridge nel footer. v1.1.60 — prompt di sistema AI Advisor parametrizzato sulla lingua UI. v1.1.61 — fix pulsante Incolla nella tastiera virtuale (layout fisico dei tasti resta indipendente). v1.1.62 — audit completo del contenuto delle notifiche. v1.1.63 — **autorilevamento lingua di sistema al primo avvio**, con messaggio multilingua (spagnolo/tedesco/francese/cinese semplificato, più fallback inglese) per chi ha una lingua non ancora supportata.

### Migliorie RetroArch/Classic Console (fuori sequenza, prima di 19c)

Richieste dall'utente durante una pausa prima di proseguire con 19c: v1.1.75 — Launch Arguments contestuali per RetroArch (suggerimenti Shift dedicati) invece dei soli suggerimenti Wine/Proton; nuovo campo "Titolo per Ricerca Metadati" per correggere lo scraping quando il nome ROM non è riconoscibile (es. MAME "gngt.zip"), disponibile per qualunque gioco, con rifetch immediato al salvataggio. v1.1.76 — il titolo mostrato in libreria/sidebar si corregge da solo (nome canonico IGDB) dopo uno `scrapeTitle`; preset "Filtro CRT" un-click. **v1.1.77 — due bug reali trovati dall'utente con test dal vivo**: `--appendconfig=` risulta ignorato del tutto da RetroArch (causa non capita), sostituito da una shortcut `--set-shader` nei suggerimenti tastiera, pulsante overlay rimosso; il titolo corretto non era persistente (tornava al nome ROM alla sync successiva/al riavvio) — richiedeva sia una protezione nell'UPSERT sia un percorso di scrittura diretta separato per il solo passaggio di arricchimento, il primo tentativo da solo si è rivelato insufficiente (scoperto con un test isolato prima che dall'utente). Vedi CHANGELOG.md v1.1.75/76/77 per il dettaglio completo.

**Aggiornamento — PSX fatto (v1.1.97-dev.1)**: implementato e confermato funzionante su hardware reale, vedi CHANGELOG.md. Il pattern si è rivelato solido: verifica passo-passo da terminale prima di scrivere codice (nomi di core, nomi di opzione, meccanismo di consegna — scoperto che serve l'override per-contenuto nativo di RetroArch, non `--appendconfig=`), preset conservativo (risoluzione 2x, non 4x/8x), un interruttore che sfrutta il core stesso invece di un campo DB dedicato.

**N64/Saturn/Dreamcast/PS2 — rimandato su richiesta esplicita dell'utente**, da riprendere quando si deciderà di svilupparlo, non ora. Stato di partenza molto diverso per ciascuno, verificato: N64 già supportato in X-Launcher (cartuccia, nessuna estrazione necessaria — il candidato più semplice per primo); Saturn e Dreamcast **non hanno ancora nessun supporto base** in `classicPlugin.ts` (andrebbero aggiunti da zero prima ancora di parlare di remaster); PS2 con supporto RetroArch tuttora immaturo, da rivalutare se vale la pena. Prima di implementare qualunque di questi, ripetere lo stesso rigore di verifica usato per PSX — mai assumere nomi di core/opzione senza conferma reale.

**Architettura già generalizzata (v1.1.98)**: `classicPlugin.ts` espone un registro `REMASTER_PRESETS: Record<string, RemasterPreset>` (core remaster/default, nome cartella config RetroArch, righe opzione), `hasRemasterPreset()`/`writeRemasterOptions()` generici, `gameManager.setRemasterEnabled()` e l'endpoint `POST /api/games/:id/remaster` funzionano già per qualunque sistema con una voce nel registro. Aggiungere N64/Saturn/Dreamcast/PS2 significa: verificare da terminale core/opzioni reali per quel sistema, poi aggiungere una voce a `REMASTER_PRESETS` (backend) e a `REMASTER_HINT_BY_SYSTEM` (frontend, `App.tsx`) — nessun'altra parte del codice richiede modifiche.

### 19c — Plugin store: Amazon Games e itch.io

**Amazon Games — COMPLETO (v1.5.0-Venus)**. Lo stub esistente ("disabilitato — skip" nei log) è stato sostituito con un'implementazione reale via `nile` (github.com/imLinguin/nile), ogni comando verificato con output reale prima di scrivere codice: libreria (`nile library list --json`, `product.id` come identificativo — verificato per esclusione anche `product.sku`, non corretto), autenticazione completa (`nile auth --login/--status/--logout`), dimensione prevista d'installazione, orchestrazione reale di download/installazione (`runAmazon()`, stesse funzioni condivise di `runEpic`/`runGog`), lancio via runner Wine/Proton standard. Limite noto: `nile library --installed` verificato rotto (ignora il flag) — `isInstalled` per Amazon si affida a `gameManager.protectInstalledState()` invece che al dato di nile. Dettaglio completo in CHANGELOG.md.

**itch.io — non ancora iniziato.** Da valutare da zero: non ha un client ufficiale Linux con CLI paragonabile a `legendary`/`lgogdownloader`/`nile`, andrebbe verificato se esiste un tool di terze parti equivalente o se serve un approccio diverso (es. API itch.io dirette + gestione manuale dei file scaricati).

### Cloud Backup — COMPLETO (v1.5.0-Venus, non originariamente in questo piano)

Funzione nuova, non prevista nel piano originale Step 18-20, aggiunta su richiesta dell'utente e disegnata insieme prima di scrivere codice. Backup/ripristino espliciti (mai sync automatica) di soli dati verificati utili su una nuova installazione (`compat_profiles`, Knowledge Base AI Advisor, `app.conf`, cartella `avatars/`, `.env`) — mai libreria/prefix/installazioni/config legendary-lgogdownloader-nile/token/preferenze. Integrata nella tab Account esistente. Un solo provider cloud attivo alla volta come per l'AI Advisor, Google Drive come primo provider (interfaccia `CloudBackupProvider` già generica, altri provider aggiungibili in futuro/community). OAuth verificato passo per passo prima di scrivere codice (Device Flow scartata, out-of-band scartato, redirect loopback confermato per client "Desktop app"). Dettaglio completo in CHANGELOG.md.

**Idea annotata per il futuro, non ancora iniziata**: sincronizzazione dei salvataggi di gioco personali (non solo configurazione) — problema più duro del backup di configurazione, per via del nome utente diverso fra prefix Wine e Proton (`daniele` vs `steamuser`) e dell'assenza di un percorso di salvataggio prevedibile per ogni titolo. Approccio proposto quando si riprenderà: tracciare per singolo gioco dove vive il salvataggio, invece di sincronizzare l'intera prefix.

### ✅ 19d — Supporto launcher di terze parti condivisi (Ubisoft Connect, EA App, Rockstar Games Launcher, Battle.net) [Ubisoft Connect OK, verificato su 2 giochi reali — EA App/Battle.net/Rockstar in attesa, vedi Fase B]

**STATO: architettura COMPLETA, GENERICA e CONFERMATA su DUE giochi reali distinti (Watch Dogs 2 e Assassin's Creed Syndicate) — congelata in v2.0.40-Mercury.** EA App/Battle.net/Rockstar Games Launcher: infrastruttura generica già pronta (vedi sotto), dati reali non ancora popolati — nessuno dei tre iniziato.

**Obiettivo originale, raggiunto**: questi launcher, se richiesti da un gioco (es. un titolo Ubisoft venduto su Epic o GOG che internamente richiede Ubisoft Connect), vanno installati **una sola volta** e resi disponibili a tutti i giochi di qualunque store che ne abbiano bisogno.

**Architettura finale, per esteso (dettaglio riga-per-riga in CHANGELOG.md v1.5.20-dev.1→28 e CHANGELOG-2.md v1.5.20-dev.29→40, sintesi in cima a ciascun file per le due milestone)**:

- Ogni launcher condiviso ha un prefix Proton dedicato in `~/.local/share/x-launcher/shared-launchers/<id>/prefix/` (mai Wine — anticheat), ed è trattato come un **gioco vero** (riga reale in `games`, id `<launcherId>-launcher`) — mai una card virtuale.
- `games.executablePath`/`games.runner` di quella riga sono l'**unica fonte di verità** per "quale eseguibile, quale build Proton sta usando davvero questo launcher condiviso" — non duplicati altrove (una duplicazione in `shared_launcher_prefixes` esisteva ed è stata eliminata dopo aver driftato silenziosamente per settimane, causa di più bug reali in sequenza).
- **Eredità obbligatoria** (mai una scelta indipendente): un gioco con "Launcher condiviso" attivo eredita SEMPRE runner, prefix e stato Umu-launcher dal launcher condiviso — l'overlay Game Options nasconde le alternative invece di limitarsi a disattivarle, per evitare che l'utente scelga qualcosa che il lancio reale ignorerebbe comunque o generi una combinazione instabile.
- **Due strategie di lancio generiche, mai una sola assunta valida per tutti** — scelte tramite lo switch esplicito "Bypass store" nel profilo del singolo gioco, dopo un test verificato (mai un automatismo, comportamento non standardizzato fra launcher diversi):
  - **Leggero** (switch spento): il gioco si aggancia direttamente al `wineserver` già attivo del launcher condiviso (`wine <exe>` diretto) — verificato su Watch Dogs 2. Se il launcher non è ancora attivo, si avvia per intero prima, con un'attesa reale (non un tempo indovinato — poll sullo stato + segnale dal log di preparazione del container).
  - **Container pieno** (switch acceso): il gioco avvia la propria sessione container e si tira dietro il launcher condiviso come proprio processo figlio — verificato su Assassin's Creed Syndicate, la cui protezione anti-manomissione (confermata con una traccia completa dell'eccezione) fallisce senza il container Steam Linux Runtime. In questo caso l'avvio anticipato del launcher condiviso da parte nostra viene saltato — competerebbe con la sessione che il gioco crea da sé.
- **Notifica esplicita** (mai una decisione automatica) alla chiusura di un gioco dipendente, se il launcher condiviso resta attivo: tieni aperto per il prossimo gioco, o chiudilo ora (`wineserver -k`, chiude l'intera sessione pulendo anche processi figli residui).
- Riconciliazione automatica: se un gioco (es. acquistato su uno store che non ospita affatto i propri file, caso reale scoperto con Watch Dogs 2/Epic) risulta installato tramite il launcher condiviso invece che tramite il proprio store d'origine, la card dello store d'origine se ne accorge da sola e si aggiorna — senza mai creare una seconda riga duplicata nella collezione totale.
- **Diagnostica permanente**: ogni percorso di lancio scrive un log reale (prima il percorso leggero lo scartava del tutto — il buco che aveva reso la saga di Assassin's Creed Syndicate molto più lunga del necessario), con `WINEDEBUG=err+all,+seh` per il percorso leggero — errori reali e tracce di eccezioni strutturate senza il rumore di un debug completo.

**Umu-launcher (container Steam Linux Runtime)**: adottato con successo e **generalizzato a ogni lancio Proton del progetto**, non solo ai launcher condivisi — risolve in modo confermato sia il problema storico "finestra nera dal secondo avvio" sia protezioni anti-manomissione di giochi terzi che falliscono fuori dal container. Xalia (accessibilità Proton, causa nota di crash per conflitto con anti-tamper) disattivato di default per lo stesso motivo.

**Idea proposta per dopo, non ancora affrontata**: rilevamento automatico di launcher condivisi già installati altrove (Steam come app non-Steam, o come dipendenza di un gioco Steam) via link simbolico nella cartella `shared-launchers/`, invece di richiedere una nuova installazione dalla Dashboard.

**EA App/Battle.net/Rockstar Games Launcher — Fase B, prossimo passo di questa sezione**: infrastruttura generica già pronta e verificata su due casi reali distinti (vedi sopra) — serve solo popolare i dati reali di ciascun launcher (installer URL, percorso eseguibile, verb winetricks necessari, e verificare quale delle due strategie di lancio serve per ciascun gioco che lo richiede), un launcher alla volta, con lo stesso rigore di verifica-prima-di-scrivere-codice già seguito finora — mai un valore indovinato.

-----

## Piano di sviluppo Step 18-20 (ordine di esecuzione)

Definito tenendo conto di due criteri insieme, non solo la complessità crescente: una modifica **strutturale** (che toccherebbe più lavoro futuro se rimandata) resta prioritaria anche se un lavoro "più semplice" sarebbe altrimenti in coda prima per complessità pura.

1. **Step 18 — Consolidamento fetch libreria**. Vittoria rapida, a basso rischio, nessuna nuova stringa/UI. Riduce il rischio che i nuovi plugin (punto 4) aggiungano un ulteriore punto di fetch scoordinato invece di usare quello consolidato.
2. **19b — Fondamenta multilingua**. **Priorità strutturale, non di complessità**: è l'unico dei sei fronti che tocca *come viene scritta ogni stringa in tutta l'interfaccia*, non una funzionalità isolata. Rimandarlo significherebbe ritoccare due volte ogni stringa aggiunta nel frattempo dai punti 3-5. Probabilmente il più esteso in termini di lavoro assoluto fra i quattro di "secondo livello", ma va anticipato lo stesso.
3. **19a — Protocollo `xlaunch://`**. Contenuto e autosufficiente (URI scheme → risoluzione id → `launchGame()` esistente). Fatto qui, i nuovi plugin del punto successivo possono nascere già conformi alla stessa convenzione di id invece di doverla adattare dopo.
4. **19c — Plugin Amazon Games + itch.io**. Segue un pattern di plugin già consolidato (gogPlugin/epicPlugin/steamPlugin). **Amazon Games completato in v1.5.0-Venus** via nile, verificato passo per passo; itch.io richiede prima una ricerca di fattibilità (nessun tool CLI equivalente a legendary/nile noto), non ancora iniziato.
5. **19d — Launcher di terze parti condivisi**. ✅ Completato per Ubisoft Connect (architettura generica, riusabile per EA App/Battle.net/Rockstar senza ricostruirla — vedi sezione dedicata sopra). Il più complesso dei quattro "di secondo livello": ha toccato il cuore della pipeline di lancio (`gameManager.ts`), non solo l'aggiunta di un plugin.
6. **Step 20 — Sessione Wayland/gamescope**. Il più complesso e strutturalmente indipendente in assoluto — non sblocca né dipende da nessuno degli altri cinque, resta ultimo sia per complessità sia perché nulla lo richiede prima.

-----



## Roadmap usabilità (Gamescope per-gioco / splash di lancio / monitor processi)

Discussa e in gran parte realizzata durante la sessione v2.0.41-Mercury — mai scritta qui prima d'ora. Tre punti concordati con l'utente, **non** legati allo Step 20 sotto (quello resta un'idea distinta e più ampia — una sessione Wayland/gamescope indipendente da X11, ancora mai iniziata; qui invece Gamescope avvolge un lancio singolo dentro la sessione X11 esistente, senza sostituirla).

1. **Gamescope per-gioco** — ✅ Completato. Switch a 4 stati nell'overlay Game Options (spento / schermo intero a risoluzione monitor / override 4K fisso / finestra), stesso pattern già in uso per MangoHud. Percorso di diagnosi lungo, riassunto per lezioni riusabili più che per cronologia:
   - Il rilevamento "il gioco è ancora in esecuzione" per un gioco avvolto in Gamescope non può basarsi su un solo processo — Gamescope stesso genera un processo di sorveglianza (`gamescopereaper`) e il nome reale del compositore varia per backend (`gamescope-wl` su Wayland, non `gamescope` nudo) — un confronto esatto di nome processo è fragile, va usato `startsWith`/pattern, mai un valore assunto senza verificarlo con `ps` reale.
   - Un crash che sembrava "causato dal nostro codice" (un'assertion in `xvidmode.c` di Wine) si è rivelato dipendere da un file di configurazione **del gioco stesso** (`pcconfig.txt`, risoluzione di default disallineata dal monitor reale) — mai toccato da X-Launcher. Lezione generale: un problema apparentemente introdotto da una modifica recente può avere origine in dati/config esterni scritti una tantum al momento sbagliato, indipendenti dal codice.
   - Gamescope avvolto attorno a `legendary` (per giochi Epic) causava una chiusura prematura dell'intera sessione — non un conflitto diretto Gamescope/Umu-launcher, ma un'incompatibilità fra come Gamescope sorveglia "il proprio figlio primario" e come `legendary` gestisce il proprio `--wrapper` (lo avvia come figlio e poi esce subito, comportamento normale per lui). Risolto seguendo la documentazione ufficiale di Heroic Games Launcher (usa `legendary` internamente come noi, stesso problema già affrontato da loro): Gamescope va incorporato **dentro** l'argomento `--wrapper`, mai come involucro esterno dell'intero comando `legendary`.
   - **Non risolto, parcheggiato per una sessione futura**: test successivi dell'utente hanno rivelato un problema più ampio — Gamescope con Umu-launcher attivo può impedire il caricamento di alcuni giochi Epic, e un titolo (Teenage Mutant Ninja Turtles) arriva a corrompere la propria prefix Proton. Ipotesi dell'utente da verificare per prima: l'inizializzazione forzata della risoluzione da parte di Gamescope potrebbe rompere motori grafici che si aspettano di negoziarla autonomamente al primo avvio.

2. **Splash screen di lancio** — ✅ Completata end-to-end, disegno concordato in dettaglio con l'utente prima di scrivere codice. Fasi di caricamento mostrate una alla volta (sostituite, mai accumulate) più barra di progresso globale; scompare quando viene rilevata la finestra vera del gioco (o quella di Gamescope, se attivo per quel lancio); su fallimento un messaggio proprio poi ritorno automatico alla Dashboard; timeout di sicurezza di 120s dal lancio effettivo (escluse le fasi di verifica dipendenze) che termina forzatamente il processo. È una finestra browser **separata** dalla Dashboard (stesso schema `--app=<url>` già in uso, mai `--kiosk` — lag verificato dall'utente sul proprio sistema), aperta e chiusa dal backend stesso via gestione diretta dei processi, mai da JavaScript lato pagina.

   **Sottoprodotto rilevante, idea dell'utente**: una "carta d'identità" per gioco — `window_class` (WM_CLASS reale della finestra, non il titolo che cambia durante il gioco) salvata nel DB, imparata al primo lancio riuscito e riusata nei successivi invece di indovinare pattern di nome processo ogni volta. Con un campo di override manuale nell'overlay Game Options (stesso modello già in uso per il titolo di ricerca metadati), per i casi in cui il rilevamento automatico sbaglia.

   **Lezione tecnica emersa, da tenere presente per qualunque lavoro futuro sul riconoscimento finestre**: il WM_CLASS **non è univoco per gioco** nella maggior parte dei lanci moderni — `steam_app_0.steam_app_0` è condiviso da *qualunque* gioco lanciato con Umu-launcher attivo, `steam_proton.steam_proton` da qualunque lancio Proton puro (verificato su hardware reale, titoli/store diversi, stesso valore). Solo i lanci Wine diretti hanno un WM_CLASS che rispecchia davvero l'eseguibile del gioco. Per le classi generiche, il rilevamento richiede anche che il titolo della finestra combaci (in modo tollerante/bidirezionale — un titolo può essere più corto o più lungo di quello salvato) col titolo del gioco — non basta mai la sola classe. Vanno inoltre sempre esclusi dal rilevamento: la splash stessa, e i componenti noti del desktop (pannello/desktop XFCE) — entrambi possono comparire come "finestra nuova" per puro tempismo e venire scambiati per il gioco.

3. **Monitor processi** — ⬜ Non ancora iniziato. **Decisione architetturale presa con l'utente, verificata su hardware reale, pronta per l'implementazione**: invece di continuare a inseguire pattern di nomi processo caso per caso (la fonte di quasi tutti i bug del punto 1 sopra), incapsulare l'intera catena di lancio di un gioco/launcher condiviso in una sessione tracciabile via **cgroup**, usando `systemd-run --user --scope`. Verificato che funzioni identico sia con X-Launcher lanciato a mano dalla cartella di sviluppo (locale, non systemd-managed) sia con una futura installazione globale in `/opt/` avviata da systemd — il meccanismo dipende solo dalla sessione utente systemd, presente a ogni login grafico, non da come X-Launcher stesso viene avviato. Comandi chiave verificati con test reali: `systemd-run --user --scope --unit=<nome> -- <comando>` per creare la sessione; `systemctl --user is-active <nome>.scope` per lo stato; `systemctl --user show <nome>.scope --property=ControlGroup --value` + lettura diretta di `cgroup.procs` sotto `/sys/fs/cgroup<percorso>` per i PID reali (gli scope non hanno una proprietà `MainPID` come i service — verificato, non assunto); `systemctl --user kill --kill-who=all --signal=SIGKILL <nome>.scope` termina l'intero albero di processi con un solo comando, garantito. Rollout previsto graduale: estendere `spawnDetached` con un avvolgimento opzionale via `systemd-run`, iniziare dal caso Gamescope (quello con più bug storici), poi estendere agli altri percorsi di lancio, infine usarlo come base dati per il monitor processi vero e proprio (`systemctl --user list-units 'x-launcher-*'` è già di per sé l'elenco delle sessioni attive, nessun registro da costruire da zero).

-----

## Step 20 — Sessione Wayland/gamescope indipendente (modalità console completa)

Definito insieme allo Step 19, come fronte separato e più strutturale. Obiettivo: una sessione grafica indipendente da XFCE/X11 (l'ambiente attuale), basata su **Wayland + gamescope**, per far girare la Dashboard in una modalità "console" a tutti gli effetti — stile SteamOS/Steam Deck: nessun desktop environment sotto, nessuna finestra da gestire, solo la Dashboard e i giochi lanciati a schermo intero in un compositor dedicato.

**Perché è un fronte a sé, non un'estensione di quanto già fatto**: tutto il lavoro di questa sessione (ScalingContainer, `xset`/DPMS, `xdotool`/`wmctrl`, il rilevamento finestra per minimizzare la Dashboard al lancio di un gioco) è costruito assumendo X11 — gamescope è un compositor Wayland con un modello completamente diverso (nested compositor, non gestione finestre tradizionale). Serve probabilmente un percorso di avvio alternativo (una sessione dedicata selezionabile da LightDM, analoga a come SteamOS/Steam Big Picture avviano gamescope come propria sessione), non una modifica di `kiosk-launch.sh` esistente.

**Menzionato nella roadmap già in precedenza** come "Sessione X11 dedicata via LightDM / Console-Kiosk Mode v2" (Step 17 dei rilanci iniziali) — questo Step 20 lo sostituisce e lo precisa: non più genericamente "una sessione X11 dedicata", ma specificamente **Wayland + gamescope**, la stessa base tecnica di SteamOS.

**Non ancora iniziato** — nessuna indagine di fattibilità fatta finora. Primi punti da chiarire quando si affronta: se i runner Wine/Proton già in uso funzionano invariati sotto gamescope (in generale sì, è pensato apposta per questo caso d'uso), cosa succede al meccanismo attuale di minimizzazione/rilevamento finestra durante il lancio di un gioco (probabilmente da ripensare da zero, non riusabile), e se LightDM supporta l'avvio diretto di una sessione gamescope o serve un `.desktop` di sessione dedicato scritto a mano.

-----



Convenzioni adottate durante lo sviluppo, valide per tutto il codice successivo, non solo per la milestone in cui sono state introdotte.

- **v0.99.35** — Diagnostica integrata nella console di debug, non `console.log` temporaneo. Ogni funzione che lancia processi esterni critici (wine/winetricks/legendary/lgogdownloader/ecc.) o gestisce logica a rischio di fallimento silenzioso deve scrivere tramite il sistema di log esistente (`this.log()` → `writeLog()` → `LogPanel.tsx`), non con `console.log` visibile solo dal terminale del daemon. Motivo: con la dashboard che cresce in complessità, ogni nuovo punto di fallimento deve lasciare una traccia osservabile dall'interfaccia stessa, non richiedere di aprire un terminale separato o aggiungere/rimuovere debug ad-hoc a ogni indagine.
- **v0.99.38** — Campi opzionali negli oggetti passati a `better-sqlite3` con parametri nominati (`@campo`) devono sempre includere TUTTE le chiavi previste dalla query, anche a `null` — una chiave assente (non solo `undefined`) fa fallire il bind con un errore che, se non intercettato, può portarsi giù l'intero processo Node. Normalizzare i default in un unico punto centrale (es. prima dell'insert), non in ogni singolo punto che costruisce l'oggetto.
- **v0.99.38** — Qualunque `setInterval`/polling di lunga durata in un modulo backend deve avere il proprio corpo avvolto in `try/catch` — un'eccezione non gestita al suo interno crasha l'intero daemon, non solo quel controllo periodico.
- **v0.99.38** — Nessun `alert()`/`confirm()` nativo del browser nel frontend: ogni messaggio verso l'utente passa dal sistema di notifiche (`pushNotification`/`notificationEngine`), sia per coerenza visiva sia perché solo lì la navigazione gamepad/tastiera è garantita.
- **v1.1.0** — Ogni nuova implementazione nel sistema di navigazione della Dashboard deve prevedere uno strumento di debug che possa essere spento (non necessariamente rimosso) una volta che la funzionalità è validata. Pattern di riferimento: un bus di eventi disaccoppiato da React con flag `enabled` persistito (`navDebugBus.ts`) — quando spento, l'`emit()` costa un solo confronto booleano, quindi può restare in produzione permanentemente invece di essere tolto e riscritto ad ogni nuova diagnosi.
- **v1.1.5** — Mai usare unità `vh`/`vw` per dimensionare overlay/modal: `ScalingContainer.tsx` renderizza un canvas virtuale fisso di 1920×1080px scalato via `transform`, e `vh`/`vw` fanno riferimento al viewport reale del browser, non al canvas — a qualunque risoluzione diversa da 1920×1080 il calcolo è sbagliato (a risoluzioni più alte l'elemento eccede il proprio contenitore). Usare percentuali (risolvono contro il contenitore reale, 1080px di layout) o valori fissi in px relativi al canvas virtuale.
