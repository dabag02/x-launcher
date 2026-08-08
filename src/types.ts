export type StoreType = 'Steam' | 'Epic Games' | 'GOG Galaxy' | 'Ubisoft' | 'EA App' | 'Amazon Games' | 'Battle.net' | 'Rockstar Games Launcher' | 'Classic Console' | 'Plugin';

export type RunnerType = 'Proton 8.0-4' | 'Proton-GE-8.25' | 'Wine-Lutris' | 'Native' | 'Proton Experimental' | 'DOSBox' | 'RetroArch' | 'ScummVM' | 'Steam Native';

export type ViewState = 'library' | 'quick-menu' | 'settings' | 'game-detail';

export type Theme = 'light' | 'dark';

export interface CompatibilityProfile {
  fsr:        boolean;   // AMD FidelityFX Super Resolution (WINE_FULLSCREEN_FSR=1)
  gameMode:   boolean;   // Feral GameMode (gamemoderun wrapper)
  // v1.1.104-dev.1 — da booleano a 3 stati: 0 = spento, 1 = compatta
  // (MANGOHUD=1 senza MANGOHUD_CONFIG), 2 = completa (MANGOHUD_CONFIG=
  // preset=4, preset "Detailed" ufficiale di MangoHud). Colonna DB già
  // INTEGER, nessuna migrazione (chi aveva 1 resta su "compatta").
  mangohud:   0 | 1 | 2;  // MangoHud overlay — vedi runners/implementations.ts
  eac:        boolean;   // EasyAntiCheat compatibilità (PROTON_EAC_RUNTIME)
  battleye:   boolean;   // BattlEye compatibilità (PROTON_BATTLEYE_RUNTIME)
  // v1.5.20-dev.1 — lancio via `umu-run` invece di `<proton> run` diretto:
  // replica il container Steam Linux Runtime (pressure-vessel) che Steam
  // usa sempre per i lanci Proton, anche per app non-Steam — il nostro
  // `proton run` diretto lo bypassa del tutto. Nato per Ubisoft Connect
  // (finestra nera dal secondo avvio, causa: proprio questo container
  // mancante — vedi CHANGELOG.md), ma generalizzato: switch disponibile
  // per QUALUNQUE gioco/runner Proton, non solo i launcher condivisi.
  // Riusa la stessa prefix già creata da resolveRunnerWineEnv/
  // prepareWinePrefix (WINEPREFIX=<containerPrefixPath>/pfx, verificato
  // compatibile — nessuna migrazione). Se `umu-run` non è installato,
  // ProtonRunner ripiega sul `proton run` diretto attuale con un log
  // di avviso, non blocca mai il lancio.
  umuRun?:    boolean;
  // v0.99.35 — disabilita il driver kernel ntsync (WINE_DISABLE_FAST_SYNC=1)
  // durante L'INSTALLAZIONE (wineboot/winetricks), non solo al lancio.
  // Causa diagnosticata su Soulstice/Epic: wineboot --init blocca a
  // tempo indeterminato dentro la syscall ntsync_schedule quando lanciato
  // dal daemon (mai riprodotto lanciando lo stesso comando a mano da
  // terminale) — sospetto su conflitto wineserver/ntsync specifico al
  // contesto daemon. Opzione manuale, non applicata di default, perché
  // la causa esatta resta da confermare gioco per gioco.
  disableWineSync?: boolean;
  // v0.99.35 — switch overlay "Usa Known Fixes (Heroic)": se attivo,
  // l'installazione interroga il repository pubblico
  // Heroic-Games-Launcher/known-fixes (GitHub) per quel gioco
  // specifico (lookup esatto via appName/store, nessuna ambiguità di
  // matching per nome) e, se trovato, usa i suoi winetricks al posto
  // di quelli salvati manualmente. Se il gioco non è coperto, fallback
  // ai winetricksVerbs già configurati (default del runner o quelli
  // selezionati dall'utente) — notificato all'utente in entrambi i
  // casi (trovato/non trovato) tramite il sistema di notifiche.
  useKnownFixes?: boolean;
  customEnv?: Record<string, string>;
  winetricksVerbs?: string[];
  // v0.99.38 — note testuali libere associate al known-fix trovato su
  // Heroic-Games-Launcher/known-fixes (se presenti), SOLO conservate per
  // consultazione manuale — mai applicate automaticamente a executablePath/
  // launchArgs. Il formato reale di questo campo nel repository non è
  // stato verificato con un caso concreto; può contenere suggerimenti utili
  // (argomenti di lancio, variabili d'ambiente per distro) in prosa libera,
  // non in una struttura affidabile da parsare in automatico senza rischio
  // di inserire argomenti sbagliati.
  knownFixesNotes?: Record<string, string>;
}

export interface Game {
  id: string;
  title: string;
  store: StoreType;
  runner: RunnerType;
  isInstalled: boolean;
  playTimeHours: number;
  coverImage: string;
  previewImage: string;
  description: string;
  tags: string[];
  genres?: string[];
  categories?: string[];
  rating?: number; // 0-100
  installedAt?: string; // ISO string
  releaseDate?: string; // ISO string
  status: 'Ready to Launch' | 'Update Available' | 'Not Installed' | 'Running';
  compatibilityProfile?: CompatibilityProfile;
  hltbHours?: {
    main: number;
    completionist: number;
  };
  achievements?: {
    unlocked: number;
    total: number;
  };
  trailerUrl?: string;

  // -------------------------------------------------------------------------
  // Campi aggiunti per il supporto Linux reale (non presenti nella versione
  // AI Studio originale che usava solo mock data)
  // -------------------------------------------------------------------------

  /** Percorso assoluto all'eseguibile (per Wine, Proton non-Steam, DOSBox, RetroArch) */
  executablePath?: string;
  prefixPath?:     string;
  launchArgs?:     string;   // argomenti fissi di lancio (es. ScummVM: "-c ../beneath.ini beneath")
  launchCwd?:      string;   // working directory relativa alla installPath (es. "ScummVM")

  /** Steam App ID numerico — se presente, il ProtonRunner usa steam:// URI */
  steamAppId?: string;

  /** Percorso al file .conf personalizzato per DOSBox */
  dosboxConf?: string;

  /**
   * Override manuale del titolo usato per lo scraping metadati
   * (SGDB/IGDB/HLTB) — richiesto dall'utente per i ROM MAME, il cui nome
   * file spesso non è un titolo riconoscibile (es. "gngt.zip"). Non
   * cambia il titolo mostrato in libreria (`title` resta invariato),
   * solo la query di ricerca metadati. Utile anche per store diversi da
   * Classic Console, se lo scraping automatico prende un abbinamento
   * sbagliato o non trova nulla.
   */
  scrapeTitle?: string;

  /**
   * Richiesta utente — dimensione prevista di installazione (GOG/Epic),
   * cache persistente: recuperata una volta da lgogdownloader/legendary,
   * scritta qui, mai più ri-richiesta automaticamente per lo stesso
   * gioco. null/undefined = non ancora recuperata o non disponibile per
   * questo store.
   */
  predictedSizeBytes?: number;

  /** Core Libretro da caricare (es. ~/.config/retroarch/cores/snes9x_libretro.so) */
  libretroCore?: string;
  // v1.0.0 — chiave canonica di sistema per i giochi Classic Console
  // (es. 'snes', 'genesis', 'psx') — usata per filtrare quali core
  // RetroArch installati sono compatibili con questo gioco specifico,
  // invece di mostrarli tutti indistintamente nell'overlay. undefined
  // per giochi non-Classic-Console o per DOS/ScummVM (dove non si applica).
  system?: string;

  /** Game ID interno di ScummVM (es. 'monkey', 'loom') */
  scummvmId?: string;

  /**
   * v0.99.32 — Marca la card speciale "Steam Big Picture", iniettata solo
   * lato frontend (mai persistita nel DB, mai restituita da
   * gameManager.getGames()) per offrire un modo nativo di passare a Steam
   * Big Picture dalla libreria X-Launcher, anche con libreria Steam vuota o
   * il plugin Steam disabilitato. Qualunque handler che riceve un Game deve
   * controllare questo flag prima di trattarlo come un titolo reale
   * (install/uninstall, overlay di compatibilità, ecc. non si applicano).
   */
  isBigPictureLauncher?: boolean;

  /**
   * v0.99.35 — Sistema di verifica: marca un gioco come testato con successo
   * con la configurazione di lancio attualmente salvata (runner + compat
   * profile). Impostato esplicitamente dall'utente dopo un test reale, mai
   * dedotto automaticamente da un lancio "riuscito" (il runner può riportare
   * successo anche se il gioco crasha subito dopo l'avvio).
   */
  verified?: boolean;
  verifiedAt?: string; // ISO string
  /**
   * 'auto'   — funzionava già con la config di default / known-fixes, nessun
   *            intervento manuale necessario.
   * 'manual' — richiesto debug (winetricks/runner/env aggiuntivi) prima che
   *            il lancio funzionasse; utile in futuro per capire se una
   *            regressione riguarda una fonte esterna (known-fixes) o una
   *            config locale stabile.
   */
  verificationMethod?: 'auto' | 'manual';

  /**
   * Step 19d — id di un launcher terzo condiviso (vedi
   * thirdPartyLaunchers.ts) da cui questo gioco dipende, es.
   * 'ubisoft-connect'. Impostato manualmente dall'utente nell'overlay —
   * mai auto-rilevato, nessun modo affidabile di sapere in anticipo se un
   * titolo lo richiede prima di provarlo. undefined = nessuna dipendenza,
   * prefix isolato per-gioco come sempre. Se impostato, prefixPath di
   * questo gioco viene risolto sul prefix condiviso di quel launcher
   * (resolveSharedPrefixExecutionPath in sharedLauncherManager.ts) invece
   * che su uno isolato — e il Runner Bridge per questo gioco resta
   * vincolato a sole build Proton/GE-Proton, mai Wine.
   */
  requiresLauncher?: string;

  /**
   * v1.5.20-dev.14 — alcuni giochi non hanno MAI file scaricabili tramite
   * il proprio store d'origine (es. titoli Ubisoft riscattati su Epic —
   * legendary lo scopre solo durante il tentativo stesso, "does not ship
   * executable game files", non prima — vedi CHANGELOG.md). Una volta
   * riconosciuto (StorePlugin.detectUnrecoverableInstallFailure), evita
   * di lasciare che l'utente riprovi un'installazione destinata a
   * fallire sempre — la card mostra un invito ad installare dal
   * launcher condiviso invece del normale pulsante "Installa". false di
   * default per qualunque store che non ha questo concetto.
   */
  storeInstallUnavailable?: boolean;

  /**
   * Step 19d, Fase 1 — marca la card virtuale "installer/launcher" di un
   * launcher terzo condiviso (es. 'ubisoft-connect'), iniettata SOLO lato
   * frontend (mai persistita, mai restituita da gameManager.getGames()) —
   * stesso principio di isBigPictureLauncher sopra, generalizzato con un
   * solo campo invece di un booleano per ciascuno dei 4 launcher futuri.
   * Qualunque handler che riceve un Game deve controllare questo campo
   * prima di trattarlo come un titolo reale.
   */
  thirdPartyLauncherCard?: string;
}

export interface Store {
  id: StoreType;
  name: string;
  gameCount: number;
  isConnected: boolean;
}

/**
 * Livelli di log standardizzati (Step 12f).
 *
 * Mappa concettuale:
 *   debug    — verbose interno, normalmente nascosto
 *   info     — eventi operativi normali
 *   system   — eventi daemon (avvio, watcher, sync)
 *   warning  — situazione anomala non bloccante
 *   error    — errore che richiede attenzione
 *   auth     — eventi autenticazione store
 *   download — progresso e stato download/install
 *   launch   — avvio e terminazione giochi
 */
export type LogLevel =
  | 'debug'
  | 'info'
  | 'system'
  | 'warning'
  | 'error'
  | 'auth'
  | 'download'
  | 'launch';

export interface LogEntry {
  timestamp: string;
  message: string;
  type: LogLevel;
}

export type DownloadPhase =
  | 'queued'
  | 'downloading'        // download binari in corso
  | 'paused'             // download in pausa
  | 'creating_prefix'    // WINEPREFIX in creazione
  | 'installing_deps'    // winetricks dipendenze
  | 'installing_game'    // setup.exe / legendary in corso
  // Step 19d — installer di un launcher terzo condiviso non trovato in
  // ~/Downloads: il task resta qui, in attesa che l'utente prema Continua
  // (dopo aver scaricato) o Sfoglia (per indicare dove si trova) dalla
  // notifica — non un errore, solo un'azione dell'utente in sospeso.
  | 'awaiting_installer'
  | 'completed'          // tutto completato
  | 'error';             // errore fatale

export interface DownloadTask {
  gameId:           string;
  gameTitle:        string;
  store:            'GOG Galaxy' | 'Epic Games' | string;
  progress:         number;        // 0-100
  status:           DownloadPhase;
  phase:            DownloadPhase; // alias di status per chiarezza UI
  phaseLabel:       string;        // messaggio human-readable
  speed:            string;        // es. "12.4 MB/s"
  bytesDownloaded:  number;
  totalBytes:       number;
  installPath:      string;        // ~/Games/GOG/<slug>/files/
  prefixPath:       string;        // ~/Games/GOG/<slug>/prefix/
  installerPath?:   string;        // ~/Games/GOG/<slug>/installer/setup.exe
  // Step 19d — pagina ufficiale di download del launcher condiviso,
  // valorizzata solo in fase awaiting_installer — consolidato nel
  // pannello Download invece che in una notifica a parte (feedback
  // utente: l'interazione per le installazioni vive sempre qui).
  downloadUrl?:     string;
  winetricksVerbs:  string[];      // dipendenze da installare
  disableWineSync?: boolean;       // v0.99.35 — WINE_DISABLE_FAST_SYNC=1 per wineboot/winetricks
  useKnownFixes?:   boolean;       // v0.99.35 — interroga Heroic known-fixes prima di winetricks
  error?:           string;        // messaggio errore
  executablePath?:  string;        // rilevato automaticamente al completamento
  launchArgs?:      string;        // argomenti fissi (da playTasks.arguments GOG o legendary)
  launchCwd?:       string;        // working dir relativa (da playTasks.workingDir GOG)
  // v0.99.38 — runner selezionato per QUESTA installazione (catturato da
  // games.runner al momento di addTask). Prima la prefix veniva sempre
  // creata con wine di sistema indipendentemente da cosa fosse
  // selezionato nell'overlay — vedi resolveRunnerWineEnv in
  // downloadManager.ts. undefined = default (Wine-Lutris/sistema).
  runner?:          string;
  // v1.1.18 — variabili d'ambiente con lo switch "solo installazione"
  // acceso nell'overlay: applicate SOLO al processo dell'installer
  // (winetricks compreso), mai scritte in compat_profiles.custom_env —
  // per costruzione non esistono più da nessuna parte una volta finita
  // questa installazione.
  installOnlyEnv?:  Record<string, string>;
}

// ---------------------------------------------------------------------------
// Runner management (Step 13)
// ---------------------------------------------------------------------------

/** Runner installato localmente (da compatibilityManager.getAvailableRunners) */
export interface RunnerInfo {
  id:      string;
  version: string;
  status:  'installed' | 'available';
}

/** Runner installabile via ProtonUp o GitHub Releases */
export interface InstallableRunner {
  id:        string;
  version:   string;
  source:    'protonup' | 'github';
  installed: boolean;
}

/** Tool di sistema rilevati (da compatibilityManager.detectSystemTools) */
export interface SystemTools {
  gamescope: boolean;
  mangohud:  boolean;
  gamemode:  boolean;
  protonup:  boolean;
  lutris:    boolean;
  steam:     boolean;
  retroarch: boolean;
  scummvm:   boolean;
  dosbox:    boolean;
  wine:      boolean;
  fsr:       boolean;
  eac:       boolean;
  battleye:  boolean;
  eacPath:   string;
  bePath:    string;
  // v1.1.105-dev.1 — tool di decompressione (Classic Console), vedi
  // archiveExtractors.ts. unrar è solo rilevato, estrazione non ancora
  // implementata.
  unzip:     boolean;
  p7zip:     boolean;
  unrar:     boolean;
  [key: string]: boolean | string;
}

/** Stato login di un store (polling durante flusso OAuth) */
export interface StoreAuthStatus {
  storeId:       string;
  authenticated: boolean;
  /** URL da aprire nel browser (Epic: redirect OAuth) */
  authUrl?:      string;
  /** true = attesa completamento browser */
  waitForBrowser?: boolean;
  message?:      string;
}

// ---------------------------------------------------------------------------
// Notification System (Step 15a)
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'info'           // informazioni generali (sync libreria, aggiornamenti)
  | 'success'        // installazione completata, lancio riuscito, auth OK
  | 'warning'        // attenzione richiesta ma non bloccante
  | 'error'          // errore critico con possibile azione correttiva
  | 'ai-suggestion'  // suggerimento elaborato da un provider AI
  | 'kb-suggestion'; // risposta dalla KnowledgeBase locale (offline)

export type NotificationStatus =
  | 'pending'   // ricevuta, nessuna azione eseguita
  | 'applied'   // azione eseguita, in attesa di conferma utente
  | 'resolved'  // utente ha confermato che ha funzionato
  | 'failed'    // utente ha confermato che non ha funzionato
  | 'dismissed'; // ignorata dall'utente

export interface NotificationAction {
  label:   string;
  handler: string;   // chiave azione: 'winetricks' | 'config_patch' | 'relaunch' | 'open_section' | 'dismiss'
  params?: Record<string, string>;
}

export interface AppNotification {
  id:             string;
  type:           NotificationType;
  status:         NotificationStatus;
  title:          string;
  body:           string;
  gameId?:        string;
  gameTitle?:     string;
  primaryAction?:   NotificationAction;
  secondaryAction?: NotificationAction;
  // Step 19d — terzo slot, introdotto per Continua/Annulla/Sfoglia
  // insieme nel flusso di installazione manuale di Ubisoft Connect —
  // generico, riusabile da qualunque notifica futura ne avesse bisogno.
  tertiaryAction?:  NotificationAction;
  /**
   * Link cliccabile/selezionabile da controller, distinto dai pulsanti
   * azione sopra — es. la pagina ufficiale di download di un launcher
   * terzo. Renderizzato come elemento a sé nella card (mai dentro
   * `body`, per evitare di dover fare parsing di link in testo libero).
   * Il click/selezione chiama sempre l'apertura nel browser esterno.
   */
  linkUrl?:  string;
  linkLabel?: string;
  rawLog?:        string;      // stderr/log grezzo, espandibile
  timestamp:      string;
  source:         'system' | 'pattern' | 'kb' | 'ai' | 'validation';
  aiProvider?:    string;
  confidence?:    'high' | 'medium' | 'low';
  // Distinto da `status`: traccia solo se l'utente ha fisicamente visto
  // questa notifica aprendo il pannello — non cambia mai automaticamente
  // (a differenza di `status`, che può passare a 'dismissed' da solo dopo
  // un timeout). Resta "non letta" per qualunque tempo finché l'utente non
  // apre davvero il pannello, anche con un gioco in primo piano a schermo
  // intero.
  seen?:          boolean;
}
