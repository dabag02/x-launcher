import { Game, Store, LogEntry, StoreType, DownloadTask, CompatibilityProfile } from '../types';
import { readFileSync } from 'fs';
import { execFileSync, execSync, spawn } from 'child_process';
import { emitLaunchPhase } from './launchPhaseTracker';
import { captureWindowSnapshot } from './windowDetector';
import { raceSplashClose } from './splashOrchestrator';
import path from 'path';
import { MOCK_LOGS } from '../mockData';
import { StorePlugin } from './plugins/base';
import { GOGPlugin, isJunkGogSlug } from './plugins/gogPlugin';
import { ALL_KNOWN_WINE_VERBS, OS_VERSION_VERBS } from '../wineVerbs';
import { SteamPlugin } from './plugins/steamPlugin';
import { EpicPlugin } from './plugins/epicPlugin';
import { AmazonPlugin } from './plugins/amazonPlugin';
import { BattlenetPlugin } from './plugins/battlenetPlugin';
import { UbisoftConnectPlugin } from './plugins/ubisoftConnectPlugin';
import { EAAppPlugin } from './plugins/eaAppPlugin';
import { isLauncherBootstrapped, findGameExeInSharedPrefix, launchSharedLauncher, isSharedLauncherRunning, launchGameInSharedPrefix, getSharedPrefixBasePath, waitForContainerReadyMarker, canRemoveSharedPrefix, SHARED_LAUNCHERS_DIR } from './sharedLauncherManager';
import { getThirdPartyLauncherByStoreId, getThirdPartyLauncherDefinition, THIRD_PARTY_LAUNCHERS } from './plugins/thirdPartyLaunchers';
import { ClassicPlugin, REMASTER_PRESETS, hasRemasterPreset, writeRemasterOptions, removeRemasterOptions } from './plugins/classicPlugin';
import { getActiveDisplayEnv } from './activeDisplay';
import { BaseRunner } from './runners/base';
import { WineRunner, ProtonRunner, DOSBoxRunner, RetroArchRunner, ScummVMRunner, SteamNativeRunner, launchEpicViaLegendary, expandHome } from './runners/implementations';
import { downloadManager, resolveGogExe, resolveRunnerWineEnv, storeDir, slugFromId } from './downloadManager';
import { metadataManager } from './metadataManager';
import { cacheLibraryCovers, cacheGameCovers } from './coverCache';
import { compatibilityManager } from './compatibilityManager';
import * as db from './db';
import { writeLog } from './logger';
import { notificationEngine } from './notificationEngine';
import * as attemptTracker from './aiProviders/attemptTracker';
import * as processManager from './processManager';

/**
 * Splitta una stringa di argomenti rispettando le virgolette.
 * Es: `-c "../beneath.ini" beneath` → ['-c', '../beneath.ini', 'beneath']
 * Gestisce sia virgolette doppie che singole e le rimuove dal risultato.
 */
function shellSplitArgs(args: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote: '"' | "'" | null = null;

  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ' ') {
      if (current.length > 0) { result.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) result.push(current);
  // Converte backslash in slash in tutti gli argomenti (path Windows → Linux)
  return result.map(a => a.replace(/\\/g, '/'));
}

class GameManager {
  private plugins: StorePlugin[] = [
    new GOGPlugin(),
    new SteamPlugin(),
    new EpicPlugin(),
    new AmazonPlugin(),
    new BattlenetPlugin(),
    new UbisoftConnectPlugin(),
    new EAAppPlugin(),
    new ClassicPlugin(),
  ];

  // v0.99.35 — tracking dell'ultimo gioco lanciato, per la feature
  // systray (minimizza dashboard durante il gioco, ripristina alla
  // chiusura). Il processo gioco è spawnato con detached:true +
  // unref() (vedi spawnDetached in runners/implementations.ts) — per
  // design, il daemon non deve aspettare che il gioco chiuda per
  // terminare lui stesso. Questo significa che Node non riceve mai un
  // evento 'exit' per quel processo: l'unico modo per sapere se è
  // ancora vivo è controllare /proc/<pid> a richiesta (vedi
  // isLastLaunchedGameRunning), non un listener passivo.
  private lastLaunchedGame: { gameId: string; gameTitle: string; pid: number; unit?: string; launchedAt: number; logPath?: string; processNameHint?: string; processNameSeenAtLeastOnce?: boolean } | null = null;

  // v2.0.41-dev.7 — richiesta utente: la card "Steam Big Picture" deve
  // minimizzare X-Launcher al lancio (stesso comportamento di qualunque
  // gioco reale) e farlo ritornare in primo piano al rientro — ma Big
  // Picture NON è un gioco lanciato da questo daemon (non c'è alcun
  // processo figlio nostro da tracciare: `steam steam://open/bigpicture`
  // si limita a segnalare a un client Steam che potrebbe già essere in
  // esecuzione, vedi endpoint in server.ts). Stato dedicato, del tutto
  // separato da lastLaunchedGame sopra — niente notifiche di validazione/
  // "did it work", niente polling di uscita per nome processo: quella
  // macchina è pensata per un vero gioco lanciato da noi, riusarla qui
  // produrrebbe prompt/notifiche senza senso per un semplice switch di
  // modalità del client Steam. isLastLaunchedGameRunning() sotto la
  // combina con lastLaunchedGame SOLO ai fini del booleano `running` che
  // tray.py legge per nascondere/ripristinare la finestra — tray.py non
  // usa gameId/gameTitle per quella decisione (solo per il suo menu
  // "giochi recenti", che non riguarda comunque questo caso).
  private bigPictureActive: boolean = false;

  /** Chiamato da POST /api/system/steam-bigpicture — vedi bigPictureActive sopra. */
  notifyBigPictureLaunched(): void {
    this.bigPictureActive = true;
    this.addLog('[SYSTEM] Steam Big Picture: tracciato come attivo — la finestra Dashboard verrà nascosta dal tray.', 'system');
  }

  /** Chiamato dal punto di rientro da Big Picture — vedi bigPictureActive sopra. */
  notifyBigPictureClosed(): void {
    this.bigPictureActive = false;
    this.addLog('[SYSTEM] Steam Big Picture: tracciato come chiuso — la finestra Dashboard verrà ripristinata dal tray.', 'system');
  }

  // v1.1.32 — quanto tempo dare al processo del gioco per comparire la
  // PRIMA volta prima di trattare "non trovato" come un vero fallimento
  // di avvio. Scoperto con SIFU/Proton: il poll (ogni 4s, timer già
  // attivo da un lancio precedente) può scattare anche solo 20-50ms dopo
  // l'avvio di legendary — l'autenticazione EOS online e il bootstrap di
  // Proton richiedono diversi secondi prima che l'eseguibile Windows
  // vero e proprio compaia nell'elenco processi. Senza questa soglia,
  // "non ancora partito" veniva confuso con "non è mai partito".
  private static readonly PROCESS_NAME_STARTUP_GRACE_MS = 30000;

  // v1.1.33 — inibitore screensaver/gestione energetica durante il
  // gioco. Un ChildProcess "sentinella" tenuto vivo per tutta la
  // sessione: se il demone stesso crashasse, il processo sentinella
  // morirebbe con lui (non è detached/unref) e systemd-inhibit
  // rilascerebbe l'inibizione automaticamente — nessun rischio di
  // restare bloccati con lo screensaver disattivato per sempre anche in
  // caso di crash, a differenza di un approccio "xset s off" seguito da
  // un "xset s on" che potrebbe non venire mai eseguito.
  private screensaverInhibitProcess: import('child_process').ChildProcess | null = null;

  /**
   * Verifica se l'ultimo gioco lanciato è ancora in esecuzione,
   * controllando se il PID esiste ancora nel sistema. Usato dallo
   * script systray per decidere quando nascondere/ripristinare la
   * finestra della dashboard.
   *
   * v0.99.90 — FIX BUG: prima azzerava lastLaunchedGame internamente non
   * appena rilevava il processo morto — un effetto collaterale
   * distruttivo che qualunque chiamante esterno (incluso /api/system/
   * game-running, richiamabile in qualunque momento) poteva innescare
   * per primo, "consumando" la transizione prima che startGameExitPolling
   * avesse la possibilità di elaborarla (rilevamento fallimento rapido /
   * prompt di validazione). Bug reale riscontrato: una semplice curl di
   * diagnostica manuale ha silenziosamente impedito la segnalazione di
   * un lancio fallito. Ora è di sola lettura — l'azzeramento dello stato
   * è responsabilità esclusiva di startGameExitPolling, fatto atomicamente
   * insieme all'elaborazione della transizione, non prima.
   */
  // v2.0.41-dev.25 — richiesta utente, bug reale confermato su hardware
  // reale (LEGO Indiana Jones + Gamescope): un `pgrep -f <hint>` da solo
  // trova ANCHE "gamescopereaper", il processo interno di Gamescope che
  // sorveglia i propri figli — che continua a mostrare la riga di
  // comando ORIGINALE (compreso il nome dell'eseguibile del gioco) come
  // proprio argomento anche dopo che il vero processo di gioco è
  // terminato (osservato dall'utente: gioco chiuso, ma
  // "gamescopereaper -- .../LEGOIndy.exe" restava comunque in `ps`,
  // Dashboard mai tornata a schermo intero). Un match che proviene SOLO
  // da gamescopereaper non conta come "il gioco è ancora aperto" — si
  // verifica il nome reale (comm) di ogni PID trovato, non ci si ferma
  // al solo esito di pgrep.
  // v2.0.41-dev.28 — richiesta utente, bug reale confermato su hardware
  // reale (LEGO Indiana Jones + Gamescope, dopo che il gioco funzionava
  // correttamente): dopo la chiusura del gioco resta attivo un processo
  // Gamescope che non riporta mai la Dashboard in primo piano. Causa: il
  // filtro qui sotto escludeva solo `gamescopereaper` (dev.25) — ma
  // `gamescope` STESSO (il compositore vero e proprio, non solo il suo
  // processo di sorveglianza interno) ha la propria riga di comando che
  // contiene anch'essa il nome dell'eseguibile del gioco (è lui che lo
  // invoca: `gamescope ... -- proton run LEGOIndy.exe`) — e può restare
  // vivo come guscio vuoto anche dopo che il gioco vero è terminato,
  // senza chiudersi da solo. `comm !== 'gamescopereaper'` da solo non
  // bastava a escluderlo. Esteso a entrambi i nomi processo. In più: se
  // gli UNICI match trovati sono processi della famiglia Gamescope (non
  // il gioco vero), li termina esplicitamente qui — altrimenti anche
  // correggendo solo il tracciamento interno, la SUA finestra (spesso a
  // schermo intero) resterebbe comunque visibile sopra la Dashboard
  // ripristinata, un problema visivo reale, non solo di bookkeeping.
  private pgrepGameStillRunning(hint: string): boolean {
    let pids: string[];
    try {
      pids = execSync(`pgrep -f -- "${hint}"`, { encoding: 'utf-8', stdio: 'pipe' }).trim().split('\n').filter(Boolean);
    } catch {
      // v2.1.10-dev.13 — diagnostica per il bug segnalato dall'utente:
      // i giochi Proton risultano "chiusi" pochi secondi dopo l'avvio
      // (il ramo di grazia in isLastLaunchedGameRunning scatta una volta
      // sola, poi il controllo successivo non trova più nulla) mentre
      // Wine puro (Lutris Build) non ne soffre mai. Ipotesi non
      // verificata: la catena Proton passa per il container Steam Linux
      // Runtime (pressure-vessel), e il processo finale del gioco visto
      // dall'host potrebbe non riportare più il nome della cartella di
      // installazione nella propria riga di comando, a differenza del
      // processo Wine diretto che lo mantiene per tutta la sua vita.
      // Questo log dice con certezza se il problema è qui: pgrep -f che
      // non trova NULLA con questo hint, per questo hint specifico.
      this.addLog(`[DIAG] pgrepGameStillRunning("${hint}"): pgrep -f non ha trovato alcun processo.`, 'debug');
      return false; // pgrep non trova nulla — nessun processo, reale o Gamescope
    }

    // v2.1.10-dev.13 — elenco completo PID + riga di comando PRIMA di
    // qualunque filtro Gamescope sotto, per vedere esattamente cosa
    // pgrep ha trovato in questo esatto controllo — confrontabile fra
    // il primo poll (Wine: dovrebbe corrispondere; Proton: da vedere) e
    // i successivi.
    const diagEntries = pids.map(pid => {
      try {
        const cmdline = execSync(`ps -o args= -p ${pid}`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
        return `pid=${pid} cmdline="${cmdline}"`;
      } catch {
        return `pid=${pid} (sparito prima di poter leggere la cmdline — race normale fra pgrep e ps)`;
      }
    });
    this.addLog(`[DIAG] pgrepGameStillRunning("${hint}"): pgrep -f ha trovato ${pids.length} PID — ${diagEntries.join(' | ')}`, 'debug');

    const gamescopeFamilyPids: string[] = [];
    for (const pid of pids) {
      try {
        const comm = execSync(`ps -o comm= -p ${pid}`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
        // v2.0.41-dev.30 — BUG UTENTE, causa reale trovata con un dato
        // concreto (ps -eo pid,ppid,stat,comm sul sistema dell'utente):
        // il confronto ESATTO `comm === 'gamescope'` non corrispondeva
        // mai — il nome di processo reale sul suo sistema è
        // `gamescope-wl` (backend Wayland), non `gamescope` nudo. La
        // funzione incontrava `gamescope-wl`, non lo riconosceva come
        // famiglia Gamescope, e restituiva SUBITO "un processo reale è
        // ancora attivo" (riga sotto) — senza mai arrivare a considerare
        // `gamescopereaper`, che restava quindi sempre fuori dal ciclo
        // di pulizia. Non era un problema del segnale inviato (dev.29,
        // SIGKILL — comunque corretto da tenere, non fa male): il
        // processo semplicemente non veniva mai raggiunto. `startsWith`
        // invece di un confronto esatto — resiste anche a varianti
        // future del nome (es. un ipotetico backend X11 "gamescope-x11"),
        // non solo al caso Wayland verificato qui.
        if (comm.startsWith('gamescope')) {
          gamescopeFamilyPids.push(pid);
          continue;
        }
        if (comm) return true; // un processo reale, non della famiglia Gamescope
      } catch {
        // il processo è sparito fra pgrep e ps (race normale) — ignora
        // e continua a controllare gli altri PID trovati.
      }
    }
    // Solo processi Gamescope trovati (o nessuno) — il gioco vero è
    // finito. Ripulisce gli eventuali resti invece di lasciarli appesi.
    // SIGKILL (dev.29): non può essere ignorato, sicuro qui — sono solo
    // resti di un wrapper (mai il processo del gioco vero, già escluso
    // sopra), nessun rischio di dati non salvati.
    for (const pid of gamescopeFamilyPids) {
      try { process.kill(Number(pid), 'SIGKILL'); } catch { /* già terminato, ignora */ }
    }
    // v2.1.10-dev.13 — diagnostica: se arriviamo qui, o pgrep ha trovato
    // solo processi Gamescope (già gestiti sopra), o solo PID spariti
    // durante il controllo (race). Utile saperlo per distinguerlo dal
    // caso "pgrep non ha trovato nulla affatto" già loggato sopra.
    this.addLog(`[DIAG] pgrepGameStillRunning("${hint}"): nessun processo reale (non-Gamescope) trovato fra i ${pids.length} PID sopra — ritorno false.`, 'debug');
    return false;
  }

  isLastLaunchedGameRunning(): { running: boolean; gameId?: string; gameTitle?: string } {
    // v2.0.41-dev.7 — vedi bigPictureActive sopra: controllato PRIMA di
    // lastLaunchedGame, indipendente da esso — i due stati non si
    // escludono a vicenda nel modello dati, ma nella pratica non possono
    // essere entrambi rilevanti insieme (o si sta guardando un gioco
    // reale in corso, o si è passati a Big Picture), quindi l'ordine non
    // cambia il risultato per l'unico consumatore reale (tray.py, che
    // legge solo il booleano `running`).
    if (this.bigPictureActive) {
      return { running: true, gameId: 'steam-bigpicture-launcher', gameTitle: 'Steam Big Picture' };
    }
    if (!this.lastLaunchedGame) return { running: false };

    // v1.1.31 — bug reale confermato: per i giochi Epic (lanciati via
    // `legendary launch`, non più l'exe diretto — vedi v1.1.30) il PID
    // tracciato è quello di legendary/del wrapper Proton, non del gioco
    // vero. Quel processo top-level può terminare poco dopo aver avviato
    // il gioco (comportamento del tutto normale per legendary/proton,
    // che delega la supervisione effettiva più in basso nell'albero dei
    // processi) — process.kill(pid, 0) lo vedeva "morto" mentre il gioco
    // era ancora regolarmente in esecuzione, causando il ripristino
    // prematuro della Dashboard (che poi intercettava di nuovo gli
    // input del controller mentre il gioco era ancora in primo piano).
    // Fix: quando è presente un processNameHint (impostato solo per i
    // lanci Epic), il controllo verifica per NOME di processo — più
    // lento di un kill(pid,0) ma sopravvive a qualunque processo
    // intermedio (legendary/proton) che esca prima del gioco vero.
    //
    // v2.0.41-dev.50 — BUG REALE CONFERMATO SU HARDWARE (Watch Dogs 2 +
    // Ubisoft Connect, `ps aux` reale): il pgrep-per-nome sotto cerca la
    // stringa nella riga di comando di QUALUNQUE processo di sistema —
    // trovava ancora `umu-run /percorso/.../WatchDogs2.exe` (il wrapper,
    // vivo per tutta la sessione del launcher condiviso) molto DOPO che
    // il vero processo del gioco era già terminato. Quando è disponibile
    // uno scope tracciato per questo lancio (`unit`, vedi
    // processManager.ts), il controllo diventa mirato: solo i pid
    // REALMENTE dentro l'albero di QUESTO lancio, per nome breve
    // (`/proc/pid/comm`, mai la riga di comando intera). Fallback al
    // pgrep di sistema se non c'è uno scope tracciato (systemd-run non
    // disponibile, o lancio non avvolto) — mai un buco silenzioso.
    // v2.1.10-dev.14 — BUG UTENTE CONFERMATO DA LOG REALE: un gioco GOG
    // lanciato via Proton (GE-Proton, nessun launcher condiviso, nessun
    // profilo gamescope) non riceve MAI un processNameHint (impostato
    // solo per Epic/launcher condivisi/gamescope, vedi poco più sotto in
    // questo stesso file) — precipitava quindi SEMPRE nel ramo naive
    // `process.kill(pid, 0)` in fondo a questa funzione, esattamente lo
    // stesso bug già diagnosticato e risolto per Epic/legendary in
    // v1.1.31 ("il PID tracciato è il wrapper, non il gioco vero, e
    // termina presto") ma mai esteso al caso generico. Confermato da un
    // log reale (Control Ultimate Edition): il diagnostic aggiunto in
    // dev.13 mostrava `pgrep -f -- "files"` agganciare per puro caso
    // processi Chromium/Steam estranei (flag --shared-files), un segnale
    // completamente inaffidabile — il vero problema non era QUELLA
    // euristica di riserva, ma il fatto che la rilevazione precisa
    // basata su scope/cgroup non veniva mai raggiunta per questo tipo di
    // lancio.
    //
    // Su proposta dell'utente: la condizione per usare la rilevazione
    // basata su scope non dipende più dalla presenza di un
    // processNameHint specifico — se esiste uno scope tracciato (`unit`,
    // vero per qualunque lancio avvolto in systemd-run, la quasi
    // totalità: Wine E Proton, con o senza launcher condiviso), lo si usa
    // sempre. Con processNameHint disponibile resta il confronto preciso
    // per nome (necessario per distinguere il gioco vero da un launcher
    // condiviso rimasto aperto nello stesso scope — comportamento
    // INVARIATO per Epic/launcher condivisi/gamescope, mai toccato qui);
    // senza, basta che lo scope contenga QUALUNQUE processo reale — se il
    // cgroup si svuota del tutto, l'intera catena di lancio (verifica
    // ambiente, wrapper, gioco vero) è finita per davvero, qualunque sia
    // stata la sua lunghezza. Nessun confronto sul nome necessario in
    // quel caso: PID/exec non lasciano mai la cgroup vuota durante un
    // passaggio di consegne fra processi della stessa catena.
    const hasPreciseNameCheck = !!this.lastLaunchedGame.processNameHint;
    const hasScope = !!this.lastLaunchedGame.unit;
    if (hasPreciseNameCheck || hasScope) {
      const stillAlive = hasScope
        ? (hasPreciseNameCheck
            ? processManager.isRealProcessAliveInScope(this.lastLaunchedGame.unit!, this.lastLaunchedGame.processNameHint!)
            : processManager.getScopePids(this.lastLaunchedGame.unit!).length > 0)
        : this.pgrepGameStillRunning(this.lastLaunchedGame.processNameHint!);
      // v2.1.10-dev.14 — diagnostica: conferma sul prossimo lancio reale
      // quale ramo viene effettivamente preso (soprattutto il nuovo caso
      // "scope senza hint di nome", quello che copre Wine/Proton generici
      // come Control Ultimate Edition) e cosa decide.
      this.addLog(`[DIAG] isLastLaunchedGameRunning("${this.lastLaunchedGame.gameTitle}"): hasScope=${hasScope} hasPreciseNameCheck=${hasPreciseNameCheck} stillAlive=${stillAlive}`, 'debug');
      if (stillAlive) {
        // Trovato — segna che l'abbiamo visto almeno una volta, così un
        // futuro mancato match (chiusura reale) non viene più confuso
        // con "non ancora partito".
        this.lastLaunchedGame.processNameSeenAtLeastOnce = true;
        return { running: true, gameId: this.lastLaunchedGame.gameId, gameTitle: this.lastLaunchedGame.gameTitle };
      } else {
        // v1.1.32 — pgrep/scope non trova corrispondenze: due letture
        // possibili, non distinguibili dal solo risultato del comando.
        // "Il gioco non è MAI partito" (vera assenza, es. dipendenza
        // mancante) oppure "non è ancora partito" (Proton/legendary
        // stanno ancora completando l'autenticazione EOS online e il
        // bootstrap — puó richiedere diversi secondi). Se non l'abbiamo
        // mai visto comparire E siamo ancora dentro il periodo di
        // grazia, continuiamo a considerarlo "in esecuzione" — dare
        // troppo tempo nel caso peggiore (un avvio davvero fallito) è
        // preferibile a segnalare un falso fallimento su un avvio che
        // in realtà sta solo impiegando qualche secondo in più.
        //
        // v2.0.41-dev.51 — REGRESSIONE REALE CONFERMATA DALL'UTENTE
        // (Ubisoft Connect ed EA App entrambi rotti dopo dev.50):
        // PROCESS_NAME_STARTUP_GRACE_MS (30s) era calibrato sul VECCHIO
        // pgrep-per-riga-di-comando, che trovava corrispondenza quasi
        // subito (la riga di comando di umu-run contiene già il nome
        // dell'exe fin dal primo istante — lo stesso falso positivo già
        // corretto in dev.50). Il nuovo controllo per `comm` dentro lo
        // scope è preciso ma strutturalmente più lento a vedere la PRIMA
        // corrispondenza: il vero processo con quel nome esiste solo
        // DOPO che l'intera catena boot+autenticazione del launcher
        // condiviso è finita — può superare abbondantemente i 30s a
        // freddo. Il timer scadeva DURANTE un caricamento legittimo,
        // dichiarava "mai partito", e faceva scattare il kill
        // dell'intero scope introdotto in dev.50 — uccidendo un lancio
        // ancora in corso, non uno concluso.
        //
        // Quando è disponibile uno scope tracciato, niente più timer a
        // orologio per questa attesa: usiamo `isScopeActive(unit)` — lo
        // scope è ancora vivo (qualunque cosa ci sia dentro, launcher
        // compreso) è un segnale diretto, non un numero indovinato una
        // seconda volta. La vera rete di sicurezza contro un lancio
        // davvero fallito resta il timeout 120s della splash
        // (meccanismo separato in splashOrchestrator.ts, invariato) — se
        // lo scope risultasse attivo all'infinito per un lancio che non
        // produce mai una finestra, è quel meccanismo a intervenire, non
        // questo. Fallback al vecchio timer SOLO se non c'è uno scope
        // tracciato (systemd-run non disponibile, o lancio non avvolto)
        // — mai un buco silenzioso.
        if (!this.lastLaunchedGame.processNameSeenAtLeastOnce) {
          const stillLoading = hasScope
            ? processManager.isScopeActive(this.lastLaunchedGame.unit!)
            : (Date.now() - this.lastLaunchedGame.launchedAt) < GameManager.PROCESS_NAME_STARTUP_GRACE_MS;
          if (stillLoading) {
            return { running: true, gameId: this.lastLaunchedGame.gameId, gameTitle: this.lastLaunchedGame.gameTitle };
          }
        }
        // Visto in passato e ora sparito, oppure mai visto e periodo di
        // grazia scaduto — in entrambi i casi è una chiusura/fallimento
        // reale.
        return { running: false };
      }
    }

    // Nessuno scope tracciato E nessun processNameHint — oggi solo i
    // lanci Steam via URI (mai avvolti in uno scope, il processo lì non
    // è mai figlio nostro): unica eccezione strutturale rimasta, non
    // un'altra euristica indovinata. Per loro l'unico segnale disponibile
    // resta il PID diretto.
    try {
      // kill con segnale 0 non termina il processo, verifica solo
      // se esiste ed è raggiungibile dall'utente corrente — più
      // leggero di uno spawn "ps" per un controllo così frequente.
      process.kill(this.lastLaunchedGame.pid, 0);
      return { running: true, gameId: this.lastLaunchedGame.gameId, gameTitle: this.lastLaunchedGame.gameTitle };
    } catch {
      // ESRCH (processo non esiste) o EPERM — il chiamante sa che non è
      // più in esecuzione, ma NON tocchiamo più lastLaunchedGame qui.
      return { running: false };
    }
  }

  /**
   * v2.1.10-dev.10 — Punto 2 roadmap: espone lo scope/PID del gioco
   * tracciato, senza esporre l'intero `lastLaunchedGame` privato. Usato
   * da windowFocus.ts per correlare la finestra X11 del gioco al
   * processo reale (via cgroup dello scope, stesso principio già usato
   * da isRealProcessAliveInScope per distinguere il gioco vero dal
   * wrapper Proton/umu-run) invece di un ciclo generico fra tutte le
   * finestre aperte — quello si è rivelato inaffidabile su hardware
   * reale (vedi CHANGELOG-5.md, dev.7/dev.8/dev.9): il punto di partenza
   * più comune del ciclo, la Dashboard stessa, ricade sempre sullo
   * stesso ripiego arbitrario (il primo elemento di `wmctrl -l`),
   * qualunque esso sia — nei log reali, il desktop, mai il gioco.
   * `unit` è assente per i lanci via URI Steam (mai avvolti in uno scope
   * systemd, per lo stesso motivo per cui isLastLaunchedGameRunning usa
   * lì un ramo diverso) — in quel caso il chiamante può solo ricadere
   * sul `pid` diretto, meno affidabile ma comunque un punto di partenza.
   */
  getLastLaunchedGameProcessInfo(): { unit?: string; pid: number } | null {
    if (!this.lastLaunchedGame) return null;
    return { unit: this.lastLaunchedGame.unit, pid: this.lastLaunchedGame.pid };
  }

  // v1.1.33 — su richiesta: durante una sessione di gioco (specialmente
  // con solo controller, senza mouse/tastiera a resettare il timer di
  // inattività) lo screensaver/DPMS spegneva lo schermo e bloccava la
  // sessione, richiedendo la password per rientrare — un problema serio
  // per un setup HTPC pensato per essere usato dal divano.
  //
  // Doppio livello, per coprire sia il meccanismo X11 diretto sia quello
  // più moderno basato su logind (varia a seconda di come XFCE/la
  // distribuzione hanno configurato screensaver e blocco sessione):
  // 1) `xset s off -dpms` — disattiva l'estensione screensaver X11 e lo
  //    spegnimento automatico del monitor. La maggior parte dei
  //    screensaver/blocca-schermo su X11 (incluso xfce4-screensaver/
  //    light-locker in molte configurazioni) osservano il timer di
  //    inattività di questa stessa estensione.
  // 2) `systemd-inhibit --what=idle:sleep:handle-lid-switch` — copre il
  //    caso in cui sospensione/blocco siano invece gestiti da logind
  //    indipendentemente da X11. Il processo "sentinella" (sleep
  //    infinity) tiene viva l'inibizione finché non viene terminato.
  private startScreensaverInhibit(gameTitle: string) {
    if (this.screensaverInhibitProcess) return; // già attiva per un'altra sessione

    // v1.1.35 — BUG REALE nel mio stesso fix precedente: il log ha
    // mostrato "ENOENT", non un errore di accesso al display — significa
    // che il binario xset non viene proprio trovato (PATH minimo sotto
    // systemd, o il pacchetto xorg-xset semplicemente non installato su
    // questo sistema). Il messaggio di v1.1.34 ("mancanza di accesso al
    // display") era una diagnosi sbagliata per QUESTO errore specifico —
    // corretto qui con un controllo esplicito su err.code, e PATH
    // ricostruito esplicitamente (stesso pattern di buildSafeEnv in
    // downloadManager.ts) per escludere un PATH troncato come causa,
    // prima di concludere che manca davvero il pacchetto.
    const home = process.env.HOME ?? require('os').homedir();
    const existingPath = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin';
    // v2.2.19-dev.2 — stesso bug/fix di implementations.ts/downloadManager.ts:
    // DISPLAY statico sostituito da quello della sessione realmente attiva.
    const x11Env = {
      ...process.env,
      ...getActiveDisplayEnv(),
      PATH: [`${home}/.local/bin`, '/usr/local/bin', '/usr/bin', '/bin', existingPath].join(':'),
    };
    let xsetOk = false;
    try {
      execFileSync('xset', ['s', 'off'], { stdio: 'ignore', env: x11Env });
      execFileSync('xset', ['-dpms'], { stdio: 'ignore', env: x11Env });
      xsetOk = true;
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        this.addLog('[POWER] xset non trovato (né nel PATH ricostruito) — probabile pacchetto mancante. Su Arch: sudo pacman -S xorg-xset', 'error');
      } else {
        this.addLog(`[POWER] xset fallito (DISPLAY=${x11Env.DISPLAY}): ${err instanceof Error ? err.message : err}`, 'error');
      }
    }

    try {
      const child = spawn('systemd-inhibit', [
        '--what=idle:sleep:handle-lid-switch',
        '--who=X-Launcher',
        `--why=${gameTitle} in esecuzione`,
        '--mode=block',
        'sleep', 'infinity',
      ], { stdio: 'ignore' });
      child.on('error', () => {
        // systemd-inhibit non disponibile (es. sistema senza systemd) —
        // xset sopra resta comunque attivo come unico livello.
        this.screensaverInhibitProcess = null;
      });
      this.screensaverInhibitProcess = child;
      this.addLog(`[POWER] Screensaver/sospensione inibiti — ${gameTitle} in esecuzione. (xset: ${xsetOk ? 'ok' : 'FALLITO — vedi sopra'})`, 'system');
    } catch {
      this.screensaverInhibitProcess = null;
    }
  }

  private stopScreensaverInhibit() {
    const x11Env = { ...process.env, ...getActiveDisplayEnv() };
    try { execFileSync('xset', ['s', 'on'], { stdio: 'ignore', env: x11Env }); execFileSync('xset', ['+dpms'], { stdio: 'ignore', env: x11Env }); } catch {}
    if (this.screensaverInhibitProcess) {
      try { this.screensaverInhibitProcess.kill(); } catch {}
      this.screensaverInhibitProcess = null;
      this.addLog('[POWER] Screensaver/sospensione ripristinati.', 'system');
    }
  }

  // v0.99.38 — test protocol: rilevamento chiusura per il prompt di
  // validazione "ha funzionato?" (vedi notificationEngine.ts,
  // 'validation-prompt'). Stesso limite già documentato sopra: il
  // processo di gioco è detached+unref, niente evento 'exit' nativo,
  // quindi polling con process.kill(pid, 0) è l'unico modo. Riusa
  // isLastLaunchedGameRunning (che già nullifica lastLaunchedGame quando
  // il processo non risponde più) — qui aggiungiamo solo la rilevazione
  // della TRANSIZIONE running→non-running e l'emissione dell'evento,
  // in modo indipendente da tray.py (che potrebbe non essere configurato,
  // vedi venv .venv-tray) o dal frontend (che oggi non interroga affatto
  // /api/system/game-running).
  private gameExitPollTimer: NodeJS.Timeout | null = null;

  // v0.99.90 — soglia sotto la quale una chiusura è considerata "sospetta"
  // (probabile fallimento di avvio) invece che una sessione di gioco
  // normale. Scoperto con Bioshock 2 (eseguibile rinominato in .bak): wine
  // riesce comunque a partire (PID assegnato, spawn riuscito) ma non
  // trova il file e termina quasi subito — senza questa soglia, quel
  // caso veniva trattato come "il gioco ha girato e si è chiuso
  // normalmente", nessun errore mai catturato. 8s è generoso rispetto al
  // tempo che un vero avvio di gioco impiega anche nel caso più lento
  // (caricamento shader/asset iniziali), ma breve abbastanza da
  // distinguere chiaramente un crash immediato da una sessione reale.
  private static readonly QUICK_EXIT_THRESHOLD_MS = 8000;

  private startGameExitPolling() {
    if (this.gameExitPollTimer) return;
    this.gameExitPollTimer = setInterval(async () => {
      // v0.99.38 — try/catch strutturale: un'eccezione non gestita
      // dentro un setInterval fa crashare l'intero processo Node (visto
      // in pratica: un bug nella scrittura SQLite qui dentro ha buttato
      // giù tutto il daemon a metà sessione). Qualunque errore imprevisto
      // in futuro in questo blocco deve restare contenuto — nel peggiore
      // dei casi salta un prompt di validazione, non l'intero daemon.
      try {
        const before = this.lastLaunchedGame;
        if (!before) return;
        const check = this.isLastLaunchedGameRunning();
        if (check.running) return; // ancora in esecuzione, nulla da fare

        // Transizione appena avvenuta — a differenza di prima, l'azzeramento
        // dello stato è ora esplicito e avviene QUI, non dentro
        // isLastLaunchedGameRunning() — cosi resta atomico con
        // l'elaborazione che segue, invece di poter essere "rubato" da una
        // chiamata esterna concorrente (vedi fix sopra).
        const game = db.getGameById(before.gameId);
        if (!game) return;

        // v2.0.41-dev.19 — stesso identico principio di
        // effectiveSharedLauncherId in launchGame() qui sopra (vedi quel
        // commento esteso per la causa completa) — necessario anche qui,
        // scope separato (questo blocco gira nel poll periodico, non
        // dentro launchGame()).
        //
        // v2.0.41-dev.52 — BUG REALE CONFERMATO DALL'UTENTE: il lancio
        // STANDALONE di EA App dalla propria card veniva ucciso da questo
        // stesso blocco dopo pochi secondi. Causa: `game.requiresLauncher`
        // o `getThirdPartyLauncherByStoreId(game.store)` risolvevano
        // "ea-app" ANCHE per la riga del launcher stesso (il suo store è
        // giocoforza categorizzato come "EA App" — nessuna esclusione
        // esplicita di sé stesso). Stesso identificatore già usato altrove
        // in questo file (`isThisGameASharedLauncherApp`, vedi launchGame)
        // per distinguere "la card è la fonte" da "la card dipende da
        // un'altra fonte" — riusato qui per lo stesso motivo: un launcher
        // condiviso non dipende MAI da se stesso.
        const isThisGameASharedLauncherApp = THIRD_PARTY_LAUNCHERS.some(l => `${l.id}-launcher` === game.id);
        const effectiveSharedLauncherId = isThisGameASharedLauncherApp
          ? undefined
          : (game.requiresLauncher ?? getThirdPartyLauncherByStoreId(game.store)?.id);

        const elapsedMs = Date.now() - before.launchedAt;

        // Step 19d — bug reale trovato su hardware utente: Ubisoft
        // Connect (UbisoftConnect.exe) lancia un processo figlio reale
        // (upc.exe + servizi Uplay) e poi ESCE DA SOLO entro pochi
        // secondi per design — un pattern "stub che rilancia e si
        // chiude" non raro in launcher moderni. La soglia sotto trattava
        // SEMPRE questo come fallimento (elapsedMs ~4s < 8s), saltando
        // per intero il ramo di successo sotto — compreso l'hook che
        // ri-risolve l'eseguibile reale. Verificato con dati reali
        // (ps aux durante un lancio riuscito): upc.exe e i suoi processi
        // Chromium/CEF restavano vivi mentre il processo TRACCIATO
        // (il wrapper Proton) risultava già chiuso. Prima di dichiarare
        // fallimento, controlliamo quindi se esistono processi reali
        // ancora vivi che matchano la cartella di installazione del
        // gioco (non solo Ubisoft — generico, riusabile da qualunque
        // altro launcher/gioco con lo stesso pattern stub-e-rilancia).
        const installDirName = game.executablePath
          ? game.executablePath.split('/').slice(-2, -1)[0]
          : null;
        let realProcessStillRunning = false;
        if (installDirName) {
          realProcessStillRunning = this.pgrepGameStillRunning(installDirName);
        }
        // v2.1.10-dev.13 — diagnostica per il bug Proton segnalato
        // dall'utente: riassume in una riga sola la decisione di QUESTO
        // controllo, prima di qualunque branching sotto — confrontabile
        // fra il primo poll (che nel log dell'utente rilevava
        // correttamente il processo reale) e i successivi (dove
        // qualcosa cambia). effectiveSharedLauncherId incluso perché
        // altera anche la soglia (quickExitThresholdMs, calcolata poco
        // sotto ma il suo valore finale non cambia in base a questo log).
        this.addLog(`[DIAG] Controllo chiusura "${before.gameTitle}": installDirName="${installDirName}" elapsedMs=${elapsedMs} realProcessStillRunning=${realProcessStillRunning} effectiveSharedLauncherId=${effectiveSharedLauncherId ?? 'nessuno'}`, 'debug');

        // v1.5.20-dev.29 — BUG REALE segnalato dall'utente: un gioco con
        // requiresLauncher può restare per un po' in attesa che il
        // launcher condiviso diventi DAVVERO responsivo, anche dopo che
        // isSharedLauncherRunning() lo rileva già presente (il processo
        // esiste, ma potrebbe non aver ancora finito login/inizializzazione
        // interna — nessun modo di saperlo con certezza, vedi la stessa
        // attesa "intelligente" appena aggiunta prima del lancio). Quella
        // finestra d'attesa aggiuntiva, specifica di questa categoria di
        // gioco, rischia di superare la soglia ordinaria di tolleranza
        // "chiusura rapida" — il vero processo che finalmente subentra
        // arriverebbe già fuori tempo massimo, scambiato per una
        // chiusura genuina invece che per un avvio riuscito. Soglia
        // estesa SOLO per questa categoria, non per ogni gioco.
        const quickExitThresholdMs = effectiveSharedLauncherId
          ? GameManager.QUICK_EXIT_THRESHOLD_MS * 3
          : GameManager.QUICK_EXIT_THRESHOLD_MS;

        // v2.0.41-dev.52 — SECONDO BUG REALE CONFERMATO (Dead Space via
        // EA App, launcher DIPENDENTE questa volta): il processo tracciato
        // (via `comm` nello scope) può risultare "non trovato" prestissimo
        // — a 12s contro una soglia di 24s — semplicemente perché l'intera
        // catena boot+auth del launcher condiviso non ha ancora fatto
        // partire il vero processo del gioco (non un blip: la soglia
        // stessa esiste apposta per questo). Prima di dev.50, cadere in
        // questo stesso ramo "quick exit ma processi reali attivi"
        // portava SOLO a una notifica innocua ("tieni aperto/chiudi
        // ora") — sbagliare per eccesso di cautela era innocuo. Ora che
        // lo stesso ramo porta a `killScope()` (terminazione reale
        // dell'intera catena), lo stesso margine di errore è diventato
        // distruttivo: uccideva un lancio ancora legittimamente in
        // caricamento.
        //
        // Fix strutturale: quando siamo ancora dentro la soglia di
        // "chiusura rapida" E un processo reale collegato al gioco
        // risulta comunque attivo (pgrep ampio, il segnale che ESISTE
        // apposta per questa ambiguità), non trattiamo questo come una
        // chiusura vera — usciamo SENZA azzerare `lastLaunchedGame` e
        // SENZA eseguire alcuna azione (playtime, notifica, kill),
        // lasciando che il prossimo giro di polling (4s dopo) rivaluti
        // con dati più maturi. Esattamente lo stesso principio del "non
        // ancora visto, ancora in periodo di grazia" già applicato sopra
        // in isLastLaunchedGameRunning() — qui si applica al blocco di
        // CHIUSURA, non a quello di rilevamento.
        if (realProcessStillRunning && elapsedMs < quickExitThresholdMs) {
          this.addLog(`[LAUNCH] ${before.gameTitle}: processo tracciato chiuso dopo ${Math.round(elapsedMs / 1000)}s, ma processi reali ancora attivi in "${installDirName}" — probabile fase di caricamento, non ancora una chiusura. In attesa del prossimo controllo.`, 'system');
          return; // `lastLaunchedGame` resta intatto — nessuna azione distruttiva
        }

        // Da qui in poi, la decisione è definitiva — azzeriamo il
        // tracciamento e rilasciamo l'inibizione screensaver solo ora,
        // non prima: se il ramo sopra fosse scattato, il lancio resta
        // tracciato esattamente come se questo poll non fosse mai
        // avvenuto.
        this.lastLaunchedGame = null;
        this.stopScreensaverInhibit();

        if (elapsedMs < quickExitThresholdMs) {
          // v0.99.90 — uscita sospettosamente rapida: probabile fallimento
          // di avvio (exe non trovato, prefix corrotta, dipendenza
          // mancante che fa crashare subito). A differenza del prompt di
          // validazione sotto, QUESTO va segnalato anche se il gioco era
          // già verified=true — una configurazione prima funzionante che
          // ora fallisce in pochi secondi è una regressione degna di
          // nota, non una domanda ridondante "ha funzionato?" già nota.
          let logContent = '';
          if (before.logPath) {
            try {
              logContent = readFileSync(before.logPath, 'utf-8').trim();
            } catch (err) {
              // File non scrivibile/apribile per qualche motivo (vedi
              // fallback difensivo in spawnDetached) — non bloccante,
              // procediamo comunque con un messaggio generico sotto.
            }
          }
          const errorText = logContent || 'Il processo si è chiuso pochi secondi dopo l\'avvio, senza output catturato su stdout/stderr.';
          this.addLog(`[LAUNCH] ${before.gameTitle} chiuso dopo ${Math.round(elapsedMs / 1000)}s — trattato come fallimento di avvio.`, 'error');
          // Step 19d — log diagnostico richiesto dall'utente: il processo
          // TRACCIATO (quello che monitoriamo per isLastLaunchedGameRunning)
          // risulta chiuso, ma per Ubisoft Connect una finestra (nera o
          // bianca a seconda del tentativo) compare comunque DOPO QUALCHE
          // SECONDO — ben oltre un controllo immediato. Il primo giro di
          // pgrep sul solo nome exe esatto non ha trovato nulla, ma Wine/
          // Proton spesso rinominano o troncano il nome del processo
          // internamente (limite del kernel a 15 caratteri + wrapper
          // preloader di Proton) — un match troppo specifico può mancare
          // un processo realmente in esecuzione. Ora: controllo più ampio
          // (case-insensitive, "wine" o "ubisoft" ovunque nella riga di
          // comando) E ripetuto con un ritardo, per catturare esattamente
          // il momento in cui l'utente riporta che la finestra compare.
          const dumpResidualProcesses = (label: string) => {
            try {
              const { execSync } = require('child_process');
              const procs = execSync(`ps aux | grep -iE "wine|ubisoft" | grep -v grep || true`, { encoding: 'utf-8' }).trim();
              this.addLog(
                procs
                  ? `[LAUNCH-DEBUG] (${label}) Processi wine/ubisoft attivi:\n${procs}`
                  : `[LAUNCH-DEBUG] (${label}) Nessun processo wine/ubisoft trovato.`,
                'system'
              );
            } catch (err) {
              this.addLog(`[LAUNCH-DEBUG] (${label}) Verifica processi non riuscita: ${err}`, 'system');
            }
          };
          dumpResidualProcesses('T+0s, subito dopo la chiusura tracciata');
          // Non bloccante — il resto del daemon continua a girare nel frattempo.
          setTimeout(() => dumpResidualProcesses('T+6s, ritardato'), 6000);
          notificationEngine.emit({ type: 'launch-error', gameId: before.gameId, gameTitle: before.gameTitle, error: errorText });
          return;
        }

        // Richiesta utente — tempo di gioco reale (era hardcoded a 0 per
        // GOG/Epic/Classic Console, solo Steam calcola un valore reale
        // dalla propria Web API). Solo qui, DOPO il controllo di uscita
        // rapida sopra: una sessione troppo breve è già trattata come
        // probabile fallimento di avvio, non tempo di gioco reale da
        // accumulare. Vedi db.addPlayTime per il dettaglio su Steam
        // (nessun rischio di doppio conteggio, la sua Web API resta
        // comunque l'autorità finale a ogni sync).
        db.addPlayTime(before.gameId, elapsedMs / (1000 * 60 * 60));
        this.notifyLibraryRefreshed(); // la sidebar mostra il tempo aggiornato subito, non al prossimo sync periodico


        // v1.5.20-dev.10 — generalizzato: prima un `if (game.store ===
        // 'Ubisoft' && game.id === UBISOFT_CONNECT_GAME_ID && ...)`
        // hardcoded qui — vedi StorePlugin.onLauncherProcessClosed per
        // il perché del cambio. gameManager.ts resta il coordinatore
        // (tempo di gioco già calcolato sopra), delega la parte
        // specifica del launcher al plugin giusto — un plugin che non
        // rappresenta un launcher condiviso (Steam, GOG, Epic...) eredita
        // il no-op di default, nessun comportamento cambiato per loro.
        const ownerPlugin = this.plugins.find(p => p.id === game.store);
        if (ownerPlugin) await ownerPlugin.onLauncherProcessClosed(game);

        // v1.5.20-dev.22 — richiesta utente originale: il gioco appena
        // chiuso usava un launcher condiviso ancora in esecuzione —
        // chiedere esplicitamente cosa fare (notifica "tieni aperto/
        // chiudi ora") invece di deciderlo noi.
        //
        // v2.0.41-dev.50 — SEMPLIFICATO su richiesta esplicita
        // dell'utente dopo la scoperta del bug reale sopra: per un
        // launcher bootstrappato DENTRO la catena di questo gioco (mai
        // una sessione "sua", nata solo per farlo partire — il caso
        // comune per ogni gioco con requiresLauncher, verificato con
        // Watch Dogs 2/Ubisoft Connect), non ha più senso chiedere — se
        // lo si usa solo come autenticatore, lasciarlo acceso dopo la
        // chiusura del gioco non ha valore. Quando è disponibile lo
        // scope di questo lancio (`before.unit`), lo terminiamo per
        // intero (gioco + intera catena, launcher condiviso incluso:
        // umu-run, wineserver, upc.exe, tutto quello che c'è dentro,
        // stesso principio già verificato allo step 1 con `ps --forest`)
        // — nessuna notifica, la scelta "è solo un autenticatore" è già
        // stata presa qui, in generale, non caso per caso.
        //
        // La notifica resta come FALLBACK per l'unico scenario in cui
        // continua ad avere senso: nessuno scope tracciato per questo
        // lancio (systemd-run non disponibile, o lancio non avvolto) —
        // lì non abbiamo modo di terminare l'intera catena in blocco,
        // quindi si torna a chiedere come prima.
        //
        // Il lancio STANDALONE del launcher dalla propria card (proprio
        // scope, kind:'shared-launcher') non passa mai da qui — questo
        // blocco gira solo alla chiusura di un GIOCO (kind:'game'), il
        // suo ciclo di vita resta una scelta esplicita dell'utente,
        // invariato.
        if (effectiveSharedLauncherId) {
          if (before.unit) {
            const killResult = processManager.killScope(before.unit);
            this.addLog(
              killResult.success
                ? `[LAUNCH] ${before.gameTitle}: catena di lancio terminata per intero (launcher condiviso "${effectiveSharedLauncherId}" incluso, era solo autenticatore per questo gioco).`
                : `[LAUNCH] Terminazione scope fallita per ${before.gameTitle}: ${killResult.message}`,
              killResult.success ? 'system' : 'warning'
            );
          } else if (isSharedLauncherRunning(effectiveSharedLauncherId)) {
            const launcherDef = getThirdPartyLauncherDefinition(effectiveSharedLauncherId);
            notificationEngine.emit({
              type: 'shared-launcher-idle',
              gameId: before.gameId,
              gameTitle: before.gameTitle,
              launcherId: effectiveSharedLauncherId,
              launcherName: launcherDef?.displayName ?? effectiveSharedLauncherId,
            });
          }
        }

        if (game.verified) {
          // Spec: "se il gioco funziona il messaggio non appare più" —
          // una volta verificato, il prompt non deve più ripresentarsi.
          return;
        }
        this.addLog(`[VALIDATE] ${before.gameTitle} chiuso — richiesta conferma funzionamento.`, 'system');
        notificationEngine.emit({ type: 'validation-prompt', gameId: before.gameId, gameTitle: before.gameTitle });
      } catch (err) {
        writeLog('error', `[VALIDATE] Error while polling for close: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 4000);
  }

  // Refresh periodico in background mentre il daemon è attivo (v0.99.2,
  // rilassato in v0.99.4): rete di sicurezza per chi resta fermo a lungo su
  // una libreria — il refresh "primario" ora avviene on-demand dal frontend
  // ad ogni apertura/cambio di libreria (vedi POST /api/library/refresh in
  // server.ts e la useEffect su activeStore in App.tsx), quindi questo timer
  // non deve più essere aggressivo: 5 minuti bastano come backstop senza
  // bombardare le CLI di Epic/GOG con chiamate ravvicinate per chi non sta
  // nemmeno guardando quegli store in quel momento.
  private libraryRefreshTimer: NodeJS.Timeout | null = null;
  private readonly LIBRARY_REFRESH_INTERVAL_MS = 5 * 60_000;

  private staticRunners: Map<string, BaseRunner> = new Map<string, BaseRunner>([
    ['Wine-Lutris',   new WineRunner()],
    ['DOSBox',        new DOSBoxRunner()],
    ['RetroArch',     new RetroArchRunner()],
    ['ScummVM',       new ScummVMRunner()],
    ['Steam Native',  new SteamNativeRunner()],
  ]);

  private protonRunners: Map<string, BaseRunner> = new Map();
  private libraryRefreshedCallbacks: Array<() => void> = [];
  private libraryReady!: Promise<void>;

  onLibraryRefreshed(cb: () => void) {
    this.libraryRefreshedCallbacks.push(cb);
  }

  private notifyLibraryRefreshed() {
    for (const cb of this.libraryRefreshedCallbacks) {
      try { cb(); } catch {}
    }
  }

  constructor() {
    this.libraryReady = this.init();

    // v0.99.36 — Step 2: DownloadManager consulta questo checker prima
    // di iniziare a scrivere sulla prefix di un gioco (vedi
    // downloadManager.addTask).
    downloadManager.setRunningGameChecker((gameId) => {
      const check = this.isLastLaunchedGameRunning();
      return check.running && check.gameId === gameId;
    });

    this.startGameExitPolling();

    downloadManager.addListener((task) => {
      // Persiste ogni aggiornamento di stato del download su DB
      db.upsertDownload(task);

      if (task.status === 'completed') {
        // Step 19d — per Ubisoft Connect (o un futuro launcher condiviso)
        // non ancora bootstrappato, "completed" qui significa "l'installer
        // è stato individuato", non "l'app è pienamente installata" — ma
        // isInstalled=true resta corretto da impostare comunque: è quello
        // che fa funzionare il click sulla card per eseguire l'installer
        // (handlePlay controlla proprio game.isInstalled). La notifica
        // "Completato!" fuorviante è stata invece soppressa in server.ts
        // per questo caso specifico — quella sì era sbagliata, questo no.
        db.updateGameStatus(task.gameId, true, 'Ready to Launch');
        const configUpdate: {
          executablePath?: string;
          prefixPath?:     string;
          launchArgs?:     string;
          launchCwd?:      string;
        } = {};
        if (task.executablePath) configUpdate.executablePath = task.executablePath;
        if (task.prefixPath)     configUpdate.prefixPath     = task.prefixPath;
        if (task.launchArgs)     configUpdate.launchArgs     = task.launchArgs;
        if (task.launchCwd)      configUpdate.launchCwd      = task.launchCwd;
        if (Object.keys(configUpdate).length > 0) {
          db.updateGameConfig(task.gameId, configUpdate);
        }
        // v1.5.20-dev.10 — generalizzato da "solo Ubisoft" a "qualunque
        // launcher terzo condiviso presente nel registro, non ancora
        // bootstrappato" — stesso ponte store→launcher usato altrove.
        const thirdPartyDef = getThirdPartyLauncherByStoreId(task.store);
        if (thirdPartyDef && !isLauncherBootstrapped(thirdPartyDef.id)) {
          this.addLog(`[DOWNLOAD] ${task.gameTitle}: installer individuato (${task.executablePath}) — clicca di nuovo la card per eseguirlo e completare l'installazione.`, 'system');
        } else if (task.executablePath) {
          this.addLog(`[DOWNLOAD] ${task.gameTitle} completato. Exe: ${task.executablePath}`, 'system');
        } else {
          this.addLog(`[DOWNLOAD] ${task.gameTitle} completato. (nessun exe rilevato — imposta il percorso manualmente nell'overlay)`, 'system');
        }
        db.deleteDownload(task.gameId);
      }
    });
  }

  waitReady(): Promise<void> {
    return this.libraryReady;
  }


  private async syncExternalInstallStates() {
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      // -----------------------------------------------------------------------
      // GOG sync — controlla se la cartella files/ esiste ed è non vuota.
      // Salta silenziosamente se ~/Games/GOG non esiste (nessun gioco installato).
      // -----------------------------------------------------------------------
      try {
        const { existsSync } = await import('fs');
        const { join } = await import('path');
        const { homedir } = await import('os');
        const gogBase = join(homedir(), 'Games', 'GOG');

        if (existsSync(gogBase)) {
          // v0.99.35 — bug confermato (Aragami/GOG): card che sfarfalla
          // tra installato/non installato subito dopo il completamento,
          // stabile solo dopo riavvio del daemon. Causa: race condition
          // temporale tra la scrittura finale del task (isInstalled=true
          // a installazione conclusa, gameManager.ts riga ~133) e questo
          // sync periodico, che può scattare proprio nella finestra in
          // cui innoextract ha già scritto i file su disco ma il task
          // non è ancora marcato 'completed' nel DB. resolveGogExe()
          // legge lo stato del filesystem in quel preciso istante, che
          // può essere una fotografia intermedia genuina (file scritti,
          // ma il flusso non ancora arrivato a registrare il successo
          // finale) — non un dato sbagliato, solo prematuro. Skippare i
          // giochi con un task di installazione attualmente attivo
          // riduce drasticamente la finestra di rischio: il sync non
          // dovrebbe mai competere con un'installazione in corso per lo
          // stesso identico gioco.
          const activeGameIds = new Set(
            downloadManager.getTasks()
              .filter(t => t.status !== 'completed' && t.status !== 'error')
              .map(t => t.gameId)
          );

          for (const game of db.getAllGames()) {
            if (game.store !== 'GOG Galaxy') continue;
            if (activeGameIds.has(game.id)) continue;
            const slug     = game.id.replace(/^gog-/, '');
            const filesDir = join(gogBase, slug, 'files');
            // v0.99.35 — bug confermato: il vecchio controllo
            // ("la cartella files/ esiste e non è vuota") considerava
            // "installato" anche un'estrazione innoextract interrotta
            // a metà (es. Ctrl+C durante Step 5) — alcuni file erano
            // già su disco, ma non l'eseguibile principale. Risultato
            // osservato: gioco marcato installato, card che non punta
            // a nessun eseguibile reale. resolveGogExe() legge invece
            // goggame-*.info (scritto da innoextract solo a estrazione
            // riuscita) e verifica che il path dell'eseguibile primario
            // esista davvero — condizione molto più affidabile di
            // "la cartella contiene qualcosa".
            let hasFiles = false;
            try {
              hasFiles = existsSync(filesDir) && resolveGogExe(filesDir) !== null;
            } catch {
              hasFiles = false;
            }

            // v1.1.21 — bug reale confermato: un gioco installato con
            // successo (isInstalled=true, notifica di completamento
            // mostrata) veniva rimarcato "non installato" al giro
            // successivo di questo sync (ogni 5 minuti) se
            // resolveGogExe() falliva a interpretare goggame-*.info per
            // quel titolo specifico — un segnale ambiguo (la cartella
            // files/ esiste ancora, solo il parsing del metadato fallisce)
            // trattato come certezza di disinstallazione. Separato in due
            // casi: cartella REALMENTE assente (segnale forte, vera
            // disinstallazione esterna) vs cartella presente ma
            // resolveGogExe fallito (segnale ambiguo — non revertire uno
            // stato già confermato installato, solo segnalarlo per
            // indagine). Marcare come installato resta invece sempre
            // ottimista (hasFiles true → installed), non simmetrico:
            // rilevare un'installazione non ha lo stesso rischio di
            // revertirne una reale per errore.
            const filesDirExists = existsSync(filesDir);
            if (hasFiles && !game.isInstalled) {
              db.updateGameStatus(game.id, true, 'Ready to Launch');
              this.addLog(`[SYNC] GOG installato rilevato: ${game.title}`, 'system');
            } else if (!filesDirExists && game.isInstalled) {
              db.updateGameStatus(game.id, false, 'Not Installed');
              this.addLog(`[SYNC] GOG rimosso rilevato: ${game.title}`, 'system');
            } else if (filesDirExists && !hasFiles && game.isInstalled) {
              this.addLog(`[SYNC] GOG — ${game.title}: cartella "files/" presente ma resolveGogExe non ha trovato l'eseguibile primario (goggame-*.info non interpretabile per questo titolo?). isInstalled lasciato invariato (era true) invece di revertirlo su un segnale ambiguo — verificare manualmente se il gioco risulta comunque avviabile.`, 'warning');
            }
          }
        }
      } catch (err) {
        this.addLog(`[SYNC] GOG sync failed: ${err}`, 'warning');
      }

      // -----------------------------------------------------------------------
      // Legendary (Epic) sync — solo se legendary è nel PATH e autenticato.
      //
      // v0.99.35 — CAUSA RADICE DEL TIMEOUT wineboot/winetricks, isolata dopo
      // una lunga diagnosi: questo sync gira ogni 5 minuti (startPeriodicRefresh)
      // sul thread principale di Node. execSync() BLOCCA l'intero event loop
      // (documentazione Node.js: "pausing execution of any additional code
      // until the spawned process exits") — incluso il listener 'exit' del
      // processo wineboot/winetricks lanciato in parallelo durante
      // un'installazione (spawnWithTimeout usa spawn asincrono, ma l'evento
      // 'exit' che arriva dal kernel non può essere elaborato da Node finché
      // l'event loop resta bloccato qui). Se il sync (alcuni secondi, per
      // `legendary list-installed --json`) si sovrappone a un wineboot che
      // ha già finito il suo lavoro, l'evento 'exit' resta in coda finché
      // l'event loop si libera — se questo accade dopo lo scadere del
      // timeout di sicurezza, il task viene killato per un timeout "falso":
      // il processo aveva già finito, solo che Node non se ne era accorto.
      // Spiega perché lo stesso comando lanciato a mano da terminale (dove
      // nessun altro processo Node compete per l'event loop) non presenta
      // mai il problema. Fix: execFile asincrono invece di execSync — non
      // blocca l'event loop, lascia che altri eventi (incluso 'exit' di
      // processi paralleli) vengano elaborati nel frattempo.
      // -----------------------------------------------------------------------
      try {
        // 1. legendary presente?
        try { await execFileAsync('which', ['legendary'], { timeout: 3000 }); }
        catch { return; } // non installato — skip totale

        // 2. Esegui list-installed ignorando stderr (legendary stampa lì i warning)
        let raw: string;
        try {
          const result = await execFileAsync('legendary', ['list-installed', '--json'], {
            encoding: 'utf-8',
            timeout:  15000,
          });
          raw = result.stdout;
        } catch {
          return; // exit != 0 = non autenticato o nessun gioco — skip silenzioso
        }

        if (!raw || !raw.trim()) return;

        // 3. Parse JSON robusto
        let installed: unknown[] = [];
        try {
          const parsed: unknown = JSON.parse(raw.trim());
          if (Array.isArray(parsed)) {
            installed = parsed;
          } else if (parsed && typeof parsed === 'object') {
            installed = Object.values(parsed);
          }
        } catch {
          return; // JSON malformato — skip silenzioso
        }

        if (!Array.isArray(installed)) return;

        // 4. Aggiorna stati
        const installedIds = new Set(
          installed
            .filter((g): g is { app_name: string } => !!g && typeof g === 'object' && typeof (g as Record<string, unknown>).app_name === 'string')
            .map(g => `epic-${g.app_name.toLowerCase()}`)
        );

        for (const game of db.getAllGames()) {
          if (game.store !== 'Epic Games') continue;
          const isInstalled = installedIds.has(game.id.toLowerCase());
          if (!isInstalled && game.isInstalled) {
            db.updateGameStatus(game.id, false, 'Not Installed');
            this.addLog(`[SYNC] Epic game desync fixed: ${game.title}`, 'system');
          }
        }
      } catch (err) {
        this.addLog(`[SYNC] legendary sync failed: ${err}`, 'warning');
      }

      // -----------------------------------------------------------------------
      // v1.5.20-dev.14 — richiesta utente: giochi con requiresLauncher che
      // non risultano ancora installati — es. titoli Ubisoft riscattati su
      // Epic (nessun file scaricabile dal proprio store, vedi
      // CHANGELOG.md), ma vale anche per qualunque gioco che semplicemente
      // è stato installato dall'utente DIRETTAMENTE dal launcher condiviso
      // senza passare da qui. Cerca l'eseguibile dentro il prefix
      // condiviso già noto (findGameExeInSharedPrefix, sharedLauncherManager.ts)
      // — mai un'intera libreria scansionata, solo la dipendenza già
      // dichiarata per QUESTO gioco specifico, quindi nessuna riga
      // duplicata nella collezione totale.
      // -----------------------------------------------------------------------
      try {
        for (const game of db.getAllGames()) {
          if (!game.requiresLauncher || game.isInstalled) continue;
          if (!isLauncherBootstrapped(game.requiresLauncher)) continue; // il launcher stesso non è ancora pronto
          const exe = findGameExeInSharedPrefix(game.requiresLauncher, game.title);
          if (exe) {
            // v1.5.20-dev.23 — scrive anche prefixPath, non solo
            // executablePath: prima restava vuoto per sempre per questa
            // categoria di gioco (l'installazione tramite lo store
            // d'origine non completa mai), un dato incoerente sul DB
            // anche se il lancio ora lo risolve dinamicamente a monte
            // (launchGame) e non dipende più da questo campo per
            // funzionare — corretto comunque per chiunque altro lo
            // legga in futuro.
            db.updateGameConfig(game.id, { executablePath: exe, prefixPath: getSharedPrefixBasePath(game.requiresLauncher) });
            db.updateGameStatus(game.id, true, 'Ready to Launch');
            this.addLog(`[SYNC] ${game.title} trovato installato nel prefix condiviso di "${game.requiresLauncher}" — eseguibile: ${exe}`, 'system');
          }
        }
      } catch (err) {
        this.addLog(`[SYNC] shared-launcher reconciliation failed: ${err}`, 'warning');
      }
    } catch (err) {
      this.addLog(`[SYNC] external sync failed: ${err}`, 'warning');
    }
  }


  private async init() {
    // 0. Carica stato enabled dei plugin dal DB
    this.loadPluginStates();

    // 1. Ripristina download interrotti dalla sessione precedente
    //
    // v1.5.4-dev.1 — bug reale corretto (audit qualità del codice): la
    // tabella `downloads` persiste solo 7 campi (gameId, gameTitle,
    // progress, status, speed, bytesDownloaded, totalBytes) — mai
    // aggiunti allo schema store/installPath/prefixPath/winetricksVerbs,
    // pur essendo tutti campi obbligatori di DownloadTask. Un download
    // ripristinato dopo un riavvio del demone arrivava quindi a
    // downloadManager.restoreTask() con questi campi a undefined — se
    // l'utente avesse provato a riprenderlo, sarebbe stato instradato
    // allo store/percorso sbagliato. Nessuna migrazione necessaria:
    // questi dati esistono già in games (store, prefix_path) e
    // compat_profiles (winetricks_verbs) — installPath si ricalcola con
    // le stesse storeDir()/slugFromId() usate all'installazione.
    const pending = db.getPendingDownloads();
    if (pending.length > 0) {
      this.addLog(`[DAEMON] Ripristino ${pending.length} download in sospeso...`, 'system');
      for (const partialTask of pending) {
        const game = db.getGameById(partialTask.gameId);
        if (!game) {
          this.addLog(`[DAEMON] Download in sospeso per ${partialTask.gameId} saltato — gioco non più in libreria.`, 'warning');
          continue;
        }
        const compatProfile = db.getCompatProfile(partialTask.gameId);
        const task: DownloadTask = {
          ...partialTask,
          store:           game.store,
          // v1.5.4-dev.1 — phase/phaseLabel: valori solo segnaposto,
          // restoreTask() sotto li ricalcola subito da task.status
          // (comportamento auto-correttivo già presente lì) — servono
          // solo a soddisfare il tipo qui.
          phase:           partialTask.status,
          phaseLabel:      partialTask.status,
          installPath:     path.join(storeDir(game.store), slugFromId(partialTask.gameId), 'files'),
          prefixPath:      game.prefixPath ?? path.join(storeDir(game.store), slugFromId(partialTask.gameId), 'prefix'),
          winetricksVerbs: compatProfile?.winetricksVerbs ?? [],
        };
        downloadManager.restoreTask(task);
      }
    }

    // Sync stati installazione reali
    await this.syncExternalInstallStates();

    // 2. Runner Proton dal filesystem → DB
    await this.syncProtonRunners();

    // Step 10 — verifica dipendenze Wine per GOG/Epic
    const { execSync } = await import('child_process');
    const hasWine       = (() => { try { execSync('which wine',       { stdio: 'ignore' }); return true; } catch { return false; } })();
    const hasWinetricks = (() => { try { execSync('which winetricks', { stdio: 'ignore' }); return true; } catch { return false; } })();
    if (!hasWine)       this.addLog('[WARN] Wine non trovato — i giochi GOG/Epic non potranno essere installati. Installa con: sudo pacman -S wine', 'error');
    if (!hasWinetricks) this.addLog('[WARN] Winetricks non trovato — le dipendenze Wine non verranno installate. Installa con: yay -S winetricks', 'error');
    if (hasWine && hasWinetricks) this.addLog('[WINE] Ambiente Wine pronto.', 'system');

    // 3. Libreria: prima leggiamo dal DB (istantaneo), poi aggiorniamo dai plugin
    await this.refreshLibrary();

    // 4. Refresh periodico in background (v0.99.2) — mantiene la libreria
    // sincronizzata con lo stato reale del disco/store senza richiedere un
    // riavvio del daemon o un refresh manuale dall'utente.
    this.startPeriodicRefresh();
  }

  /** Avvia il refresh periodico in background. Idempotente: non crea timer duplicati se chiamato più volte. */
  startPeriodicRefresh() {
    if (this.libraryRefreshTimer) return;
    this.libraryRefreshTimer = setInterval(() => {
      this.refreshLibrary().catch(err =>
        this.addLog(`[DAEMON] Refresh periodico fallito: ${err}`, 'error')
      );
    }, this.LIBRARY_REFRESH_INTERVAL_MS);
  }

  /** Ferma il refresh periodico. Utile per uno shutdown controllato del daemon. */
  stopPeriodicRefresh() {
    if (this.libraryRefreshTimer) {
      clearInterval(this.libraryRefreshTimer);
      this.libraryRefreshTimer = null;
    }
  }

  private async syncProtonRunners() {
    const detected = compatibilityManager.getAvailableRunners();
    db.upsertRunners(detected);

    this.protonRunners.clear();
    for (const r of detected) {
      if (!this.staticRunners.has(r.id)) {
        this.protonRunners.set(r.id, new ProtonRunner(r.id, r.version));
      }
    }
    this.addLog(
      `[COMPAT] Runner rilevati: ${detected.length > 0 ? detected.map(r => r.id).join(', ') : 'nessuno'}`,
      'system'
    );
  }

  private get allRunners(): Map<string, BaseRunner> {
    return new Map([...this.staticRunners, ...this.protonRunners]);
  }

  // v1.1.26 — generalizzata da v1.1.23 dopo prova diretta nei log: il
  // fix precedente proteggeva SOLO isInstalled, e SOLO quando il plugin
  // tentava di abbassarlo a false. Log reali (test hardware, gioco GOG
  // appena installato) hanno mostrato due varianti dello stesso problema
  // non coperte:
  // 1) il plugin dice isInstalled=true (corretto — cartella con
  //    contenuti) ma non conosce l'executablePath specifico (dettaglio
  //    noto solo all'installer di QUESTA app) — la mia protezione non
  //    scattava (richiedeva un downgrade di isInstalled), e
  //    executablePath veniva scritto vuoto sopra un valore corretto.
  // 2) isInstalled stesso ribaltato a false nella FASE 2 (arricchimento
  //    metadati, dopo un giro di rete per un gioco mai processato prima
  //    da metadataManager) — la Fase 1 aveva già scritto il valore
  //    giusto, ma nessuna protezione esisteva prima della SECONDA
  //    scrittura, un'invocazione separata di upsertGames().
  // Fix: protezione applicata a OGNI upsert (Fase 1 E Fase 2), rilendo
  // lo stato DB più recente immediatamente prima di ciascuna scrittura —
  // non un controllo fatto una sola volta a inizio funzione — e estesa a
  // executablePath indipendentemente da cosa succede a isInstalled.
  private protectInstalledState(gamesToWrite: Game[]) {
    const existingById = new Map(db.getAllGames().map(g => [g.id, g]));
    for (const g of gamesToWrite) {
      const existing = existingById.get(g.id);
      if (!existing) continue;
      if (existing.isInstalled && !g.isInstalled) {
        g.isInstalled = true;
        g.status      = existing.status;
      }
      if (existing.executablePath && !g.executablePath) {
        g.executablePath = existing.executablePath;
      }
    }
  }

  async refreshLibrary() {
    this.addLog('[DAEMON] Sync libreria...', 'system');
    const allGames: Game[] = [];

    // FASE 1: legge i plugin e persiste i dati base sul DB (veloce, blocca init)
    const gamesByExhaustivePlugin = new Map<string, Game[]>();
    for (const plugin of this.plugins) {
      if (!plugin.enabled) {
        this.addLog(`[PLUGIN] ${plugin.name}: disabilitato — skip.`, 'system');
        continue;
      }
      try {
        const storeGames = await plugin.getLibrary();
        allGames.push(...storeGames);
        if (plugin.isExhaustiveLocalScan) gamesByExhaustivePlugin.set(plugin.id, storeGames);
        this.addLog(`[PLUGIN] ${plugin.name}: ${storeGames.length} titoli.`, 'info');
      } catch (err) {
        this.addLog(`[PLUGIN] ${plugin.name} fallito: ${err}`, 'error');
      }
    }

    this.protectInstalledState(allGames);

    // Persisti subito sul DB senza attendere i metadati
    db.upsertGames(allGames);

    // Pulizia: solo per plugin a scansione locale esaustiva (es. Classic Console).
    // Un titolo non più restituito dalla scansione non esiste più su disco con
    // certezza (rimosso o rinominato — un rename cambia anche l'id) → va tolto
    // dal DB, altrimenti resta visibile per sempre ma non più lanciabile.
    // Esclusa di proposito per gli store online: lì un risultato vuoto/parziale
    // può derivare da un errore di rete/auth temporaneo, non da una libreria
    // realmente svuotata, e cancellare sarebbe distruttivo (vedi try/catch sopra,
    // che per quegli store lascia intenzionalmente intatto lo stato precedente).
    for (const [storeId, storeGames] of gamesByExhaustivePlugin) {
      const removed = db.deleteGamesByStoreNotIn(storeId, storeGames.map(g => g.id));
      if (removed > 0) {
        this.addLog(`[DAEMON] ${storeId}: ${removed} titoli rimossi dal DB (non più presenti sul disco).`, 'info');
      }
    }

    // v1.1.106-dev.2 — pulizia mirata per GOG: rimuove SOLO le voci già in
    // DB che isJunkGogSlug identifica positivamente come spazzatura
    // (goodies collection, URL di re-auth scambiati per titoli) — non
    // dipende dal risultato della scansione corrente (sicura anche se
    // parziale per un errore di rete/auth), a differenza della pulizia
    // esaustiva sopra.
    const gogJunkIds = db.getAllGames()
      .filter(g => g.store === 'GOG Galaxy' && isJunkGogSlug(g.id.replace(/^gog-/, '')))
      .map(g => g.id);
    if (gogJunkIds.length > 0) {
      const removedJunk = db.deleteGamesById(gogJunkIds);
      this.addLog(`[DAEMON] GOG Galaxy: ${removedJunk} voci non-gioco rimosse dal DB (goodies collection / artefatti di parsing).`, 'info');
    }

    this.addLog(`[DAEMON] ${allGames.length} titoli persistiti su DB.`, 'system');
    this.notifyLibraryRefreshed();

    // v1.5.20-dev.15 — bug reale segnalato dall'utente: la riconciliazione
    // requiresLauncher (dev.14) non si attivava mai dopo un'installazione
    // fatta dal launcher condiviso, perché syncExternalInstallStates()
    // veniva chiamata SOLO da init() — una volta sola, all'avvio del
    // demone — mai dal refresh periodico (startPeriodicRefresh, ogni 5
    // minuti). Senza un riavvio esplicito del demone, la card Epic non
    // aveva alcuna occasione di rilevare l'installazione avvenuta altrove.
    // Chiamata qui: gira ad ogni refreshLibrary(), sia periodico sia al
    // boot — nessun riavvio richiesto perché la riconciliazione si attivi.
    await this.syncExternalInstallStates();

    // FASE 2: arricchisce i metadati in background (non blocca l'avvio)
    setImmediate(async () => {
      // Carica i dati già presenti nel DB per evitare re-fetch inutili
      const existing = new Map<string, Game>();
      try {
        for (const g of db.getAllGames()) existing.set(g.id, g);
      } catch { /* DB vuoto o errore — procedi normalmente */ }

      // Merge: se il DB ha già cover reale e metadata, usali come base
      const toEnrich = allGames.map(game => {
        const cached = existing.get(game.id);
        if (!cached) return game;
        return {
          ...game,
          coverImage:   cached.coverImage   && !cached.coverImage.includes('unsplash.com')   ? cached.coverImage   : game.coverImage,
          previewImage: cached.previewImage && !cached.previewImage.includes('unsplash.com') ? cached.previewImage : game.previewImage,
          rating:       cached.rating       ?? game.rating,
          genres:       cached.genres?.length ? cached.genres : game.genres,
          description:  cached.description  || game.description,
          releaseDate:  cached.releaseDate   || game.releaseDate,
          hltbHours:    cached.hltbHours     ?? game.hltbHours,
        };
      });

      const enriched: Game[] = [];
      for (const game of toEnrich) {
        try {
          enriched.push(await metadataManager.enrichGameMetadata(game));
        } catch { enriched.push(game); }
      }

      // v1.1.26 — stessa protezione applicata di nuovo qui: questa è
      // un'invocazione SEPARATA di upsertGames(), con il proprio
      // potenziale di riscrivere isInstalled/executablePath in modo
      // scorretto (confermato nei log reali — vedi commento sopra
      // protectInstalledState). Rilegge lo stato DB più recente
      // (che potrebbe già riflettere la scrittura della Fase 1
      // appena avvenuta), non riusa uno snapshot preso a inizio funzione.
      this.protectInstalledState(enriched);

      db.upsertGames(enriched);
      this.notifyLibraryRefreshed();
      this.addLog(`[DAEMON] Metadati aggiornati per ${enriched.length} titoli.`, 'system');
      // v2.7.2-dev.4 — copia locale delle copertine per l'overlay degli spazi (non blocca nulla)
      void cacheLibraryCovers(enriched);
    });
  }

  /**
   * v1.5.20-dev.14 — lookup pubblico dello StorePlugin proprietario di
   * uno store — prima solo interno (`this.plugins.find`, usato altrove
   * in questo stesso file), serve ora anche a server.ts per delegare
   * detectUnrecoverableInstallFailure() al plugin giusto senza dover
   * esporre l'intero array `plugins` (resta privato).
   */
  getPluginForStore(storeId: string): StorePlugin | undefined {
    return this.plugins.find(p => p.id === storeId);
  }

  getGames(query?: {
    store?: StoreType | 'All';
    search?: string;
    genre?: string;
    category?: string;
    sortBy?: 'playTime' | 'installDate' | 'rating' | 'title';
    order?: 'asc' | 'desc';
  }): Game[] {
    // Legge sempre dal DB — fonte di verità unica
    let games = db.getAllGames();

    // query.store è tipizzato StoreType | 'All' | undefined qui, ma il
    // chiamante reale (server.ts, GET /api/games) passa req.query grezzo
    // (query string sempre stringhe) — un URL malformato può quindi far
    // arrivare la stringa letterale "undefined", non il valore undefined
    // vero. Cast a string (non any) solo per il confronto, onesto sul
    // fatto che qui il contratto di tipo può non riflettere il runtime.
    if (query?.store && query.store !== 'All' && (query.store as string) !== 'undefined') {
      // v2.0.41-dev.6 — richiesta utente: un gioco comprato/riscattato su
      // uno store (es. Watch Dogs 2 su Epic) ma installato/gestito
      // tramite un launcher condiviso (requiresLauncher) deve comparire
      // ANCHE nella scheda di quel launcher condiviso — stesso principio
      // già seguito per Steam: la card resta un punto d'accesso in più
      // allo STESSO gioco, mai una riga duplicata nel DB (che infatti
      // resta una sola, sotto lo store d'acquisto originale — vedi
      // ubisoftConnectPlugin.ts/scanInstalledUbisoftGames, che per lo
      // stesso motivo evita di crearne una seconda quando trova un match).
      // getThirdPartyLauncherByStoreId traduce lo store filtrato
      // nell'id del suo eventuale launcher condiviso (es. 'Ubisoft' →
      // 'ubisoft-connect') — generico, vale già anche per Fase B senza
      // altro codice da scrivere quando EA App/Battle.net/Rockstar
      // avranno lo stesso trattamento.
      const launcherDef = getThirdPartyLauncherByStoreId(query.store);
      games = games.filter(g => g.store === query.store || (!!launcherDef && g.requiresLauncher === launcherDef.id));
    }
    if (query?.search) {
      const s = query.search.toLowerCase();
      games = games.filter(g =>
        g.title.toLowerCase().includes(s) ||
        g.description.toLowerCase().includes(s) ||
        g.tags?.some(t => t.toLowerCase().includes(s))
      );
    }
    if (query?.genre) {
      games = games.filter(g => g.genres?.includes(query.genre!));
    }
    if (query?.category) {
      games = games.filter(g => g.categories?.includes(query.category!));
    }
    if (query?.sortBy) {
      const ord = query.order === 'desc' ? -1 : 1;
      games.sort((a, b) => {
        if (query.sortBy === 'playTime')    return (a.playTimeHours - b.playTimeHours) * ord;
        if (query.sortBy === 'installDate') {
          const da = a.installedAt ? new Date(a.installedAt).getTime() : 0;
          const db2 = b.installedAt ? new Date(b.installedAt).getTime() : 0;
          return (da - db2) * ord;
        }
        if (query.sortBy === 'rating') return ((a.rating || 0) - (b.rating || 0)) * ord;
        if (query.sortBy === 'title')  return a.title.localeCompare(b.title) * ord;
        return 0;
      });
    }
    return games;
  }

  getLogs(limit = 200): LogEntry[] {
    return db.getRecentLogs(limit);
  }

  addLog(message: string, type: LogEntry['type'] = 'info') {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const entry: LogEntry = { timestamp, message, type };
    db.insertLog(entry);
    writeLog(type, message);
  }

  // v0.99.38 — overrideLaunchArgs: permette allo script di test (o a
  // chiunque chiami questa funzione) di provare argomenti di lancio
  // candidati — es. suggeriti dalle note Heroic known-fixes — SENZA
  // scriverli nel DB. Solo se il lancio si rivela funzionante l'utente
  // decide di persisterli via updateGameConfig/PATCH .../config, lo
  // stesso percorso già usato per il campo "Launch Arguments" manuale
  // nell'overlay. Evita di dover salvare-testare-tornare indietro ad ogni
  // tentativo durante il debug di un titolo.
  async launchGame(id: string, overrideLaunchArgs?: string) {
    const game = db.getGameById(id);
    if (!game) return { success: false, message: 'Gioco non trovato' };

    if (!game.isInstalled) {
      this.addLog(`[DAEMON] ${game.title} non installato. Avvio download.`, 'download');
      this.installGame(id);
      return { success: true, message: 'Download avviato' };
    }

    // v0.99.36 — Step 2 (confronto Heroic): lock sulla prefix.
    // Un'installazione in corso per questo gioco sta ancora scrivendo
    // sulla WINEPREFIX (wineboot/winetricks/estrazione) — lanciare il
    // gioco in questa finestra farebbe competere due processi wine
    // sulla stessa prefix (lo stesso tipo di conflitto segnalato dal
    // lock file `pfx.lock` di Proton). Blocchiamo esplicitamente
    // invece di lasciare che sia wine stesso a fallire in modo oscuro.
    const activeInstall = downloadManager.getTasks()
      .find(t => t.gameId === id && t.status !== 'completed' && t.status !== 'error');
    if (activeInstall) {
      this.addLog(
        `[LAUNCH] Bloccato — installazione in corso per ${game.title} (stato: ${activeInstall.status}). Attendi il completamento prima di lanciare.`,
        'error'
      );
      return { success: false, message: `Installazione in corso (${activeInstall.status}) — attendi il completamento` };
    }

    // Stesso principio in senso opposto: se questo stesso gioco risulta
    // già in esecuzione (PID ancora vivo), un secondo lancio spawnerebbe
    // un secondo processo wine/proton sulla stessa prefix in parallelo.
    const runningCheck = this.isLastLaunchedGameRunning();
    if (runningCheck.running && runningCheck.gameId === id) {
      this.addLog(`[LAUNCH] Bloccato — ${game.title} risulta già in esecuzione (PID attivo).`, 'error');
      return { success: false, message: `${game.title} è già in esecuzione` };
    }

    // Blocca il lancio se il plugin dello store è disabilitato e il gioco non è DRM-free.
    // Se drmFree=true (GOG, Classic/ROM) il gioco gira standalone — si avvia sempre.
    // Se drmFree=false (Epic, Steam, Amazon, Battle.net) il client è necessario per
    // la validazione della licenza, quindi blocchiamo se l'utente ha disabilitato il plugin.
    const storePlugin = this.plugins.find(p => p.id === game.store);
    if (storePlugin && !storePlugin.enabled && !storePlugin.drmFree) {
      this.addLog(
        `[LAUNCH] Bloccato — plugin "${storePlugin.name}" disabilitato. Riattivalo dalle Impostazioni > Plugins.`,
        'error'
      );
      return { success: false, message: `Plugin "${storePlugin.name}" disabilitato` };
    }

    // v2.0.41-dev.19 — richiesta utente, bug reale confermato su hardware
    // reale (Dead Space 2/EA App): un gioco NATIVO di un launcher
    // condiviso (nessun match cross-store, quindi requiresLauncher non è
    // mai impostato per design — stesso identico principio già in uso
    // per Ubisoft Connect, vedi ubisoftConnectPlugin.ts/eaAppPlugin.ts)
    // restava fuori da OGNI meccanismo di questa funzione gestito su
    // game.requiresLauncher: niente eredità runner/prefix dalla card del
    // launcher (rischio concreto — e osservato — di due build Proton
    // diverse in competizione sullo stesso wineserver/prefix condivisa,
    // esattamente il mismatch già diagnosticato altrove in questa stessa
    // funzione per i giochi cross-store), niente warm-start anticipato
    // del launcher (avviato invece dal gioco stesso, senza i nostri
    // argomenti come silentLaunchArgs), niente soglia di tolleranza
    // estesa alla chiusura (causa diretta della validation-prompt
    // prematura segnalata: il gioco viene giudicato "chiuso" con la
    // soglia breve, pensata per un gioco standalone, non per uno che
    // deve ancora aspettare l'intera inizializzazione del launcher).
    // "Richiede questo launcher" (comprato altrove) e "vive dentro il
    // prefix di questo launcher" (comprato/installato lì direttamente)
    // sono lo stesso identico bisogno pratico per tutto quello che segue
    // in questa funzione — unificati in un solo valore, usato ovunque
    // sotto al posto della lettura diretta di game.requiresLauncher.
    // v2.0.41-dev.52 — BUG REALE CONFERMATO DALL'UTENTE: il lancio
    // STANDALONE di EA App/Ubisoft Connect dalla propria card veniva
    // trattato come se dipendesse da se stesso — `game.requiresLauncher`
    // o `getThirdPartyLauncherByStoreId(game.store)` risolvono "ea-app"
    // ANCHE per la riga del launcher stesso (il suo store è giocoforza
    // categorizzato come "EA App", nessuna esclusione esplicita di sé
    // stesso). Un launcher condiviso non dipende MAI da se stesso — la
    // stessa identità già usata più sotto in questa funzione
    // (`isThisGameASharedLauncherApp`, per saltare la splash) va
    // calcolata PRIMA, qui, e riusata invece di una seconda
    // dichiarazione più giù.
    const isThisGameASharedLauncherApp = THIRD_PARTY_LAUNCHERS.some(l => `${l.id}-launcher` === game.id);
    const effectiveSharedLauncherId = isThisGameASharedLauncherApp
      ? undefined
      : (game.requiresLauncher ?? getThirdPartyLauncherByStoreId(game.store)?.id);

    // v2.0.41-dev.23 — RIMOSSO SU RICHIESTA ESPLICITA DELL'UTENTE: qui
    // viveva il pre-avvio anticipato del launcher condiviso (dev.14,
    // poi "intelligente" in dev.29/30) — causa diretta del problema
    // osservato con EA App/Dead Space 2: una PRIMA istanza di EA App
    // (la nostra, con -silentOs) blocca tutto il resto, seguita da una
    // SECONDA istanza avviata dal gioco stesso quando non trova la
    // nostra pronta in tempo. Lo stesso identico pattern era già
    // documentato qui in un commento precedente per Watch Dogs 2 mesi
    // fa ("il gioco ne avvia una copia PROPRIA per conto suo" se non
    // trova la nostra pronta) — la soluzione adottata allora (farci
    // vincere la corsa con un'attesa più lunga) curava il sintomo, non
    // la causa. Il gioco è già perfettamente capace di avviare il
    // proprio launcher da solo quando serve (verificato nel log reale:
    // Core/Activation.dll carica correttamente prima ancora che questo
    // blocco esistesse) — la nostra unica vera responsabilità è che
    // runner/prefix/Umu-launcher risultino già corretti quando lo fa
    // (garantito sotto tramite effectiveSharedLauncherId,
    // indipendentemente da questo blocco). Mai più un avvio nostro
    // anticipato, per nessun gioco con launcher condiviso — nativo o
    // comprato altrove, nessuna differenza: lascia sempre che sia il
    // gioco stesso a occuparsene, esattamente come chiesto.

    // Carica il profilo compat dal DB se esiste
    const profile = db.getCompatProfile(id);

    // v1.5.20-dev.23 — richiesta utente: un gioco con requiresLauncher
    // non deve MAI usare un proprio runner/prefix indipendenti — deve
    // sempre ereditare quelli del launcher condiviso. Motivo verificato
    // dal vivo, non teorico: un secondo `proton run`/`umu-run` con una
    // build DIVERSA sulla STESSA prefix riproduce esattamente il
    // mismatch di versione wine/wineserver (931/957) diagnosticato
    // durante il debug di winebrowser in questa stessa sessione — un
    // solo wineserver per prefix significa anche una sola versione
    // ammessa alla volta. Il percorso leggero (dev.21,
    // launchGameInSharedPrefix) era già corretto per costruzione — legge
    // il runner dal launcher, mai da game.runner. Questo fix allinea
    // anche il percorso di riserva sotto, che prima leggeva ancora
    // game.runner/game.prefixPath — sbagliati per questa categoria di
    // gioco: l'installazione tramite lo store d'origine non completa mai
    // (vedi CHANGELOG.md, saga Watch Dogs 2), quindi quei due campi
    // restano vuoti o stantii sul DB.
    let effectiveRunnerId  = game.runner;
    let effectivePrefixPath = game.prefixPath;
    // v1.5.20-dev.34 — stesso principio di runner/prefix appena sopra,
    // esteso a `umuRun`: un gioco con requiresLauncher non deve mai
    // usare la propria impostazione Umu-launcher indipendente (quasi
    // certamente mai impostata per questa categoria di gioco, vedi
    // stessa nota su runner/prefix) — deve ereditare quella del launcher
    // condiviso. Bug reale trovato con l'utente: il percorso di riserva
    // (forceFullContainerLaunch/bypassStoreAuthChain) instradava
    // correttamente verso runner.launch() diretto, ma senza questo fix
    // avrebbe comunque letto `profile?.umuRun` del GIOCO (mai impostato)
    // invece che del launcher — risultato: nessun container nemmeno nel
    // percorso "pieno" appositamente forzato per ottenerlo.
    let effectiveUmuRun = profile?.umuRun ?? false;
    if (effectiveSharedLauncherId) {
      const launcherGame = db.getGameById(`${effectiveSharedLauncherId}-launcher`);
      if (launcherGame?.runner && launcherGame.runner !== game.runner) {
        this.addLog(
          `[LAUNCH] ${game.title}: runner "${game.runner}" ignorato, ereditato "${launcherGame.runner}" dal launcher condiviso "${effectiveSharedLauncherId}" — una prefix condivisa richiede la stessa build Proton per ogni gioco che la usa.`,
          'system'
        );
      }
      effectiveRunnerId   = launcherGame?.runner ?? game.runner;
      effectivePrefixPath = getSharedPrefixBasePath(effectiveSharedLauncherId);
      effectiveUmuRun     = db.getCompatProfile(`${effectiveSharedLauncherId}-launcher`)?.umuRun ?? false;
    }

    const runner = this.allRunners.get(effectiveRunnerId);
    if (!runner) {
      this.addLog(`[DAEMON] Runner "${effectiveRunnerId}" non disponibile per ${game.title}`, 'error');
      return { success: false, message: `Runner "${effectiveRunnerId}" non trovato` };
    }

    this.addLog(`[DAEMON] Avvio ${game.title} via ${runner.name}`, 'system');
    // v1.1.68 — registrato qui, non prima: tutti i controlli di blocco
    // (non installato, lock installazione/gioco già attivo, plugin
    // disabilitato) sono già stati superati a questo punto — un lancio
    // bloccato non deve scavalcare un gioco realmente giocato di recente
    // nella cronologia della tray.
    db.recordGameLaunch(id);

    // v1.5.20-dev.20 — BUG REALE CONFERMATO CON LOG DELL'UTENTE (secondo
    // giro): dev.18/19 avevano spostato la riconciliazione verb per
    // girare DOPO il lancio, in parallelo al gioco già in esecuzione —
    // ma alcuni di quei verb (dxvk, vkd3d, d3dcompiler...) SOSTITUISCONO
    // DLL dentro la STESSA prefix Wine che il gioco sta usando in quel
    // momento. Per Ubisoft Connect (dev.18/19) è passato inosservato,
    // ma per LEGO Indiana Jones (Amazon/nile) la riconciliazione
    // concorrente ha impedito al gioco di restare in esecuzione — stessa
    // classe di problema per cui le guide DXVK raccomandano sempre di
    // chiudere il gioco prima di reinstallarlo: sostituire DLL mentre
    // sono già caricate in memoria da un processo attivo è una causa
    // nota di instabilità. Riportata PRIMA del lancio (sequenziale, come
    // in origine — mai più in parallelo con un gioco già avviato), ma
    // stavolta `await`-ata invece che fire-and-forget: la conversione a
    // execFileAsync (dev.19) resta comunque necessaria e sufficiente per
    // il problema originale (demone/Dashboard che restavano sordi ad
    // ogni altra richiesta, incluso il polling di tray.py) — il demone
    // resta reattivo per TUTTA la riconciliazione, il gioco parte solo
    // dopo che la prefix è stabile, esattamente come prima di dev.18 ma
    // senza più bloccare il resto del sistema nel frattempo.
    //
    // v1.5.20-dev.25 — BUG REALE CONFERMATO DALL'UTENTE, stessa classe
    // di dev.20 ma con un "già attivo" diverso: quando game.requiresLauncher
    // è impostato, dev.23 ha reso effectivePrefixPath sempre corretto
    // (la prefix condivisa vera) — ma questo significa che, se il
    // launcher condiviso è GIÀ in esecuzione al momento del lancio (il
    // caso comune: l'utente lancia un secondo gioco Ubisoft mentre
    // Ubisoft Connect è ancora aperto), questa riconciliazione ora
    // interroga davvero quella prefix (prima, con prefixPath sbagliato,
    // era di fatto un no-op per questa categoria di gioco) PROPRIO
    // MENTRE il launcher la sta attivamente usando — `winetricks
    // list-installed` (il secondo blocco, che gira SEMPRE se prefixPath
    // è valorizzato, indipendentemente dai verb dichiarati sul gioco
    // stesso) può disturbare un processo GUI già attivo sulla stessa
    // prefix. Sintomo osservato: Ubisoft Connect torna in primo piano
    // dopo la chiusura del gioco con la finestra completamente nera,
    // seguito da una notifica di errore "rundll32" e l'apertura del
    // file manager di Wine — lo script diagnostico non lo riproduce mai
    // perché non fa ALCUNA riconciliazione verb. La riconciliazione
    // della prefix condivisa resta comunque coperta: avviene già,
    // sequenziale e sicura, quando è IL LAUNCHER STESSO a essere
    // lanciato dalla sua card — un gioco dipendente non deve rifarla.
    // v2.0.41-dev.36/39 — BUG UTENTE: la splash appariva solo DOPO la
    // verifica dei verb (che può richiedere diversi secondi), non
    // subito al lancio — l'apertura della finestra era finora agganciata
    // allo spawn effettivo, che avviene DOPO reconcileWinetricksVerbs
    // sotto. Apertura spostata qui, PRIMA. `await` (dev.39): la funzione
    // ora attende davvero che la finestra sia comparsa prima di
    // restituire l'handle — altrimenti lo snapshot "prima" preso subito
    // sotto rischia di non includerla ancora, facendola sembrare "nuova"
    // al ciclo di rilevamento della finestra del gioco (bug reale
    // confermato: window_class di Bioshock 2 era finito per essere
    // quello della splash stessa).
    //
    // v2.0.41-dev.47 — BUG UTENTE: EA App lanciato da solo (dalla propria
    // card, non come dipendenza di un gioco) aveva imparato il
    // window_class di UBISOFT CONNECT (contaminazione incrociata — con
    // entrambi i launcher potenzialmente attivi insieme, "l'unica
    // finestra nuova" al momento del controllo può appartenere
    // all'altro). Osservazione giusta dell'utente: la splash non ha
    // comunque alcun senso per queste due app desktop lanciate da sole
    // (nessuna sequenza di caricamento a fasi paragonabile a un gioco) —
    // niente splash, niente rilevamento, niente rischio di imparare la
    // finestra sbagliata. Riconosciuto per la stessa convenzione d'id
    // già in uso ovunque nel backend (`${launcherId}-launcher`), non un
    // flag nuovo.
    // v2.1.10-dev.12 — RIMOSSA l'apertura della vecchia finestra splash
    // separata (openSplashForLaunch/splashHandle) — la splash è ora un
    // overlay React dentro la Dashboard stessa (vedi App.tsx), che
    // ascolta /api/games/:id/launch-stream per conto proprio, senza
    // bisogno che il backend apra o chiuda nulla qui. isThisGameASharedLauncherApp
    // resta il criterio che esclude questi due app desktop (nessuna
    // sequenza di caricamento a fasi paragonabile a un gioco, come già
    // annotato sopra) sia dal rilevamento finestra sia dagli eventi di
    // fase emessi più sotto — il frontend non mostrerà mai una splash
    // per loro, semplicemente perché nessun evento arriva mai.
    const windowSnapshotBefore = captureWindowSnapshot();

    if (effectiveSharedLauncherId) {
      this.addLog(`[LAUNCH] ${game.title}: riconciliazione verb saltata — usa il launcher condiviso "${effectiveSharedLauncherId}", la cui prefix viene riconciliata quando è lui stesso a essere lanciato, mai da un gioco dipendente (evita di disturbare una sessione già attiva).`, 'system');
    } else {
      await this.reconcileWinetricksVerbs(id, game, profile, effectiveRunnerId, effectivePrefixPath).catch(err => {
        this.addLog(`[LAUNCH] Riconciliazione verb fallita (si procede comunque col lancio): ${err}`, 'warning');
      });
    }

    try {
      // Log dettagliato pre-lancio: runner version + exe
      const runnerVersion = await runner.version().catch(() => 'n/a');
      this.addLog(`[LAUNCH] Runner: ${runner.name} — versione: ${runnerVersion}`, 'info');
      if (game.executablePath) {
        const displayPath = game.executablePath.replace(
          /\$([A-Z_][A-Z0-9_]*)/g,
          (_, name) => process.env[name] ?? `$${name}`
        ).replace(/^~/, process.env.HOME ?? '~');
        this.addLog(`[LAUNCH] Exe: ${displayPath}`, 'info');
      } else if (!game.steamAppId && !game.scummvmId) {
        this.addLog(`[LAUNCH] ⚠ Nessun executablePath configurato per ${game.title}`, 'error');
      }
      if (overrideLaunchArgs !== undefined) {
        this.addLog(`[LAUNCH] ⚠ Argomenti di lancio TEMPORANEI in test (non salvati nel DB): "${overrideLaunchArgs}"`, 'system');
      }

      const effectiveLaunchArgs = overrideLaunchArgs !== undefined ? overrideLaunchArgs : game.launchArgs;

      const runnerConfig = {
        env:      profile?.customEnv,
        prefix:   effectivePrefixPath,
        args:     effectiveLaunchArgs ? shellSplitArgs(effectiveLaunchArgs) : undefined,
        cwd:      game.launchCwd,
        fsr:      profile?.fsr      ?? false,
        gameMode: profile?.gameMode ?? false,
        mangohud: profile?.mangohud ?? 0,
        eac:      profile?.eac      ?? false,
        battleye: profile?.battleye ?? false,
        umuRun:   effectiveUmuRun,
        gamescope: profile?.gamescope ?? 0,
      };
      // v1.5.20-dev.21 — richiesta utente, disegno esplicitamente discusso
      // e verificato a mano prima di scrivere codice: quando il gioco
      // dichiara requiresLauncher, il launcher condiviso è già stato
      // avviato (o lo si è appena atteso, vedi sopra prima di
      // db.recordGameLaunch) — invece di far ripartire da capo l'intero
      // `proton run`/`umu-run` (un secondo container Steam Linux Runtime
      // sulla STESSA prefix), il gioco può caricarsi DIRETTAMENTE nella
      // sessione Wine già attiva (launchGameInSharedPrefix — vedi il
      // commento esteso lì per il perché funziona e i limiti noti).
      // Condizioni per usarlo, tutte necessarie: (a) requiresLauncher
      // impostato, (b) executablePath già risolto (la riconciliazione di
      // syncExternalInstallStates lo trova), (c) il launcher condiviso
      // risulta DAVVERO in esecuzione a questo punto (non solo "abbiamo
      // provato ad avviarlo" — se il tentativo sopra è fallito, niente
      // sessione da riusare), (d) NESSUN anticheat richiesto per QUESTO
      // gioco — EAC/BattlEye sono letti solo dallo script di Proton,
      // bypassato qui, quindi un gioco che ne ha bisogno resta sul
      // lancio pieno sotto, mai su questo percorso più veloce.
      //
      // v1.5.20-dev.34 — BUG DI COMPRENSIONE MIO, corretto dall'utente:
      // avevo capito che Watch Dogs 2 "funzionasse sempre" grazie a un
      // qualche meccanismo esplicito di bypass di legendary — falso.
      // Questa condizione dipende solo da `requiresLauncher`, vera per
      // QUALUNQUE gioco che lo abbia impostato — la ramificazione Epic/
      // legendary più sotto non viene mai raggiunta nel caso normale
      // (il launcher condiviso è quasi sempre già attivo a questo punto,
      // vedi l'attesa poco sopra), per Watch Dogs 2 come per Assassin's
      // Creed Syndicate allo stesso identico modo — legendary non era
      // mai stato il problema per nessuno dei due. La vera differenza,
      // isolata dall'utente con un test diretto: Assassin's Creed
      // Syndicate ha bisogno del container Steam Linux Runtime anche
      // quando il launcher condiviso è già attivo (wine nudo crasha/non
      // renderizza), Watch Dogs 2 no. `bypassStoreAuthChain` ridefinito
      // di conseguenza: non più "salta legendary" (che non serviva),
      // ma "per questo gioco, mai il percorso leggero — sempre il
      // container pieno", verificato funzionante a mano dall'utente.
      //
      // v1.5.20-dev.39 — RIPRISTINATO dopo essere stato tolto per
      // errore in dev.36 (quel giro aveva interpretato male il
      // conflitto osservato — vedi commento su forceFullContainerLaunch
      // qualche riga sopra, prima di db.getCompatProfile(id)). Causa
      // reale ora confermata con una traccia SEH completa: Assassin's
      // Creed Syndicate ha un controllo anti-manomissione che fallisce
      // SENZA il container Steam Linux Runtime — non tollera affatto
      // il percorso leggero (wine nudo), indipendentemente da chi ha
      // avviato la sessione per primo. `forceFullContainerLaunch`
      // (calcolato sopra, prima dell'avvio anticipato del launcher)
      // disattiva qui il percorso leggero per questa categoria di
      // gioco — resta invariato, e resta lo stesso identico meccanismo
      // di Watch Dogs 2, per ogni altro gioco con requiresLauncher.
      //
      // v2.0.41-dev.21 — DISATTIVATO SU RICHIESTA ESPLICITA DELL'UTENTE,
      // bug reale confermato su hardware reale (Dead Space 2/EA App):
      // launchGameInSharedPrefix invoca `wine` NUDO, bypassando
      // interamente Proton/umu-run — quindi ignora completamente lo
      // switch "Umu-launcher" della card (mai passato, mai rispettato),
      // a differenza del percorso standard sotto (runner.launch(),
      // che legge davvero runnerConfig.umuRun). Risultato osservato:
      // ambiente di esecuzione diverso da quello che il gioco si
      // aspetta (DLL come ssleay32.dll normalmente disponibili solo
      // dentro il container Steam Linux Runtime che umu-run fornisce —
      // verificato dall'utente lanciando la STESSA identica riga di
      // comando a mano con lo script di debug in modalità wine diretta:
      // fallisce con lo stesso errore). Convenzione stabilita
      // esplicitamente con l'utente: un gioco con un launcher condiviso
      // — nativo o comprato altrove, nessuna differenza — lancia SEMPRE
      // con la stessa sintassi dello script di debug in `--mode umu`,
      // rispettando ogni switch attivo sulla card (Umu-launcher incluso)
      // — mai un bypass diretto di wine. Verificato anche che i due
      // casi reali già confermati funzionanti (Watch Dogs 2, Assassin's
      // Creed Syndicate) hanno ENTRAMBI bypassStoreAuthChain=1 sul
      // proprio profilo — il percorso leggero era quindi già
      // inutilizzato in pratica per tutto ciò che è stato verificato
      // finora, rischio di regressione basso. Codice della funzione
      // lasciato intatto sotto (non cancellato) in caso servisse
      // rivalutarlo in futuro — semplicemente non più raggiungibile.
      const useSharedPrefixLightLaunch = false;
      // Condizioni originali, lasciate per riferimento (non più
      // valutate): !!effectiveSharedLauncherId && !!game.executablePath
      // && !runnerConfig.eac && !runnerConfig.battleye &&
      // !forceFullContainerLaunch && isSharedLauncherRunning(effectiveSharedLauncherId).

      // v1.1.30 — giochi Epic: sempre via legendary launch, non l'exe
      // diretto. Vedi launchEpicViaLegendary per il motivo esatto (alcuni
      // titoli con verifica EOS severa, es. SIFU, rifiutano il lancio
      // senza gli argomenti di autenticazione che solo legendary sa
      // costruire). Continua a usare il runner Wine/Proton già
      // configurato per questo gioco — non cambia nulla per i giochi che
      // non hanno bisogno di quella verifica, legendary li lancia allo
      // stesso modo di sempre con lo stesso wine/proton.
      //
      // v1.5.20-dev.32/34/39 — richiesta esplicita dell'utente, verificata
      // a mano su Assassin's Creed Syndicate (traccia SEH completa,
      // vedi sopra) prima di scrivere questa riga (non un automatismo
      // generalizzato, ma nemmeno più una semplice ipotesi): un gioco
      // Epic con launcher condiviso attivo, riconosciuto dalla libreria
      // interna di quel launcher, non ha bisogno degli argomenti EOS
      // che `legendary` costruirebbe — a differenza di Watch Dogs 2
      // (che non ha mai avuto nulla da gestire per `legendary`), questo
      // gioco HA una cartella/id reali tracciati da `legendary`, quindi
      // senza questo switch il percorso di riserva lo instraderebbe lì
      // per errore. Comportamento NON standardizzato fra launcher
      // condivisi diversi (potrebbe non valere per EA App/Battle.net/
      // Rockstar) — switch esplicito per singolo gioco, scritto nel
      // profilo dopo un test verificato dall'utente, mai un'assunzione
      // valida per tutti. Generico per costruzione: se attivato in
      // futuro anche su un altro gioco (es. Watch Dogs 2, per unificare
      // il processo se il test dell'utente lo confermasse necessario
      // anche lì), si applica automaticamente, nessun codice aggiuntivo.
      // v2.0.41-dev.23 — forceFullContainerLaunch non esiste più (era
      // legato solo al pre-avvio anticipato, rimosso sopra) — letto qui
      // direttamente dal profilo compat, unico scopo rimasto per questo
      // switch: decidere se instradare un gioco Epic verso `legendary`
      // o il lancio diretto, indipendente da qualunque logica di
      // pre-avvio.
      const bypassStoreAuthChain = !!db.getCompatProfile(id)?.bypassStoreAuthChain;

      const result = useSharedPrefixLightLaunch
        ? await launchGameInSharedPrefix(
            effectiveSharedLauncherId!,
            expandHome(game.executablePath!),
            runnerConfig.args ?? [],
            runnerConfig.cwd,
            id,
          )
        : (game.store === 'Epic Games' && !bypassStoreAuthChain)
          ? await launchEpicViaLegendary(game, runner, runnerConfig)
          : await runner.launch(game, runnerConfig);
      if (result.success) {
        this.addLog(`[LAUNCH] Sessione attiva — PID: ${result.pid} — ${result.message}`, 'system');
        // v2.0.41-dev.32 — richiesta utente, splash di lancio: fase
        // "launching" — il momento esatto da cui parte il timeout dei
        // 120s (LAUNCH_WINDOW_TIMEOUT_MS), deliberatamente DOPO tutte le
        // fasi preliminari (verifica verb) sopra, mai da quando l'utente
        // ha premuto play. `detail` porta lo store per il testo della
        // splash ("Avvio da {store}").
        emitLaunchPhase({ gameId: id, phase: 'launching', detail: game.store });
        // v2.0.41-dev.33/34/35/36 — richiesta utente: orchestrazione
        // della splash di lancio (vedi splashOrchestrator.ts) — combina
        // il rilevamento finestra (che imparerà window_class se non
        // ancora noto, side-effect deliberato) con l'intercettazione
        // dell'errore, il timeout di sicurezza, e (v2.1.10-dev.12)
        // l'eventuale annullamento esplicito dell'utente. Non await:
        // gira in background, non deve mai rallentare/bloccare
        // launchGame(). Gate esplicito su isThisGameASharedLauncherApp
        // — prima implicito tramite splashHandle null, ora che non c'è
        // più alcuna finestra da aprire va verificato direttamente.
        if (!isThisGameASharedLauncherApp) {
          raceSplashClose(id, windowSnapshotBefore, effectiveSharedLauncherId, result.pid).catch(err => {
            this.addLog(`[SPLASH] Orchestrazione splash fallita (non bloccante): ${err}`, 'warning');
          });
        }
        if (result.pid) {
          // v1.1.31 — processNameHint originariamente solo per Epic: è
          // il primo caso in cui il PID tracciato (legendary/wrapper
          // Proton) non è affidabile per sapere se il gioco vero è
          // ancora in esecuzione. Basename dell'eseguibile già risolto
          // (game.executablePath), non l'intero percorso — pgrep -f
          // cerca per substring nella riga di comando completa, un
          // basename è già sufficientemente specifico ed evita falsi
          // negativi se il percorso assoluto cambiasse fra una sessione
          // e l'altra.
          //
          // v2.0.41-dev.20 — richiesta utente, bug reale confermato su
          // hardware reale (Dead Space 2/EA App): stesso identico
          // problema di Epic/legendary, mai esteso ai giochi con un
          // launcher condiviso (effectiveSharedLauncherId, dev.19).
          // Qui il PID tracciato è quello del gioco stesso — ma il
          // gioco può legittimamente "passare la mano" (avvia/aspetta
          // il launcher condiviso per il proprio controllo DRM, la sua
          // finestra reale compare solo dopo) mentre il processo
          // ORIGINALE tracciato termina prima — esattamente la stessa
          // dinamica per cui questo hint esiste già per Epic. Senza,
          // isLastLaunchedGameRunning() tornava a un semplice
          // process.kill(pid,0): l'istante in cui il PID originale
          // termina, nessun margine, Dashboard torna a schermo intero
          // (e intercetta l'input del controller) anche se il gioco
          // sta ancora completando il proprio avvio. Con l'hint, si
          // ottiene automaticamente lo stesso margine di 30s già
          // collaudato per Epic (PROCESS_NAME_STARTUP_GRACE_MS) — "un
          // tempo come per tutti gli altri giochi", nessun meccanismo
          // nuovo da inventare.
          // v2.0.41-dev.25 — richiesta utente, bug reale confermato su
          // hardware reale (LEGO Indiana Jones + Gamescope): stesso
          // identico problema di Epic/launcher condiviso sopra, per un
          // motivo diverso — quando Gamescope avvolge il lancio, il PID
          // che spawnDetached restituisce non è più quello del gioco ma
          // di Gamescope stesso (che a sua volta genera un processo
          // interno "gamescopereaper" per sorvegliare i propri figli) —
          // tracciare quel PID diretto non dice più nulla di affidabile
          // su "il gioco è ancora aperto?", esattamente come con Epic/
          // legendary. Stesso hint, stessa soglia già collaudata.
          const processNameHint = (game.store === 'Epic Games' || !!effectiveSharedLauncherId || !!profile?.gamescope) && game.executablePath
            ? path.basename(game.executablePath)
            : undefined;
          // 'unit' esiste solo nel tipo di ritorno di runner.launch() (systemd
          // scope), non in quello di launchGameInSharedPrefix/
          // launchEpicViaLegendary — controllo esplicito invece di un cast,
          // così resta un errore di tipo se la forma cambia in futuro.
          const unit = 'unit' in result ? result.unit : undefined;
          this.lastLaunchedGame = { gameId: id, gameTitle: game.title, pid: result.pid, unit, launchedAt: Date.now(), logPath: result.logPath, processNameHint };
          this.startScreensaverInhibit(game.title);
        }
      } else {
        this.addLog(`[LAUNCH] Fallito: ${result.message}`, 'error');
        // v2.1.10-dev.12 — prima chiudeva esplicitamente la vecchia
        // finestra splash separata (nessun'altra parte del codice se ne
        // sarebbe occupata, dato che raceSplashClose non viene mai
        // chiamata su questo ramo). Ora che la splash è un overlay
        // React lato frontend, il segnale giusto è semplicemente
        // l'evento di fase 'failed' — il frontend la chiude da solo
        // reagendo a quello, esattamente come farebbe se fosse arrivato
        // da dentro raceSplashClose. Gate su isThisGameASharedLauncherApp:
        // per quei due app nessun evento 'launching' è mai stato emesso,
        // quindi nessuna splash è mai comparsa da chiudere.
        if (!isThisGameASharedLauncherApp) {
          emitLaunchPhase({ gameId: id, phase: 'failed' });
        }
        // Log suggerimento se manca l'exe
        if (result.message?.includes('percorso eseguibile') || result.message?.includes('executablePath')) {
          this.addLog(`[LAUNCH] → Apri l'overlay del gioco e imposta "Executable Path" nella sezione Game Config`, 'error');
        }
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.addLog(`[LAUNCH] Eccezione runner: ${msg}`, 'error');
      // v2.1.10-dev.12 — stesso motivo del ramo "else" sopra: prima
      // chiudeva la vecchia finestra splash separata, ora emette
      // semplicemente 'failed' perché il frontend la chiuda da solo.
      if (!isThisGameASharedLauncherApp) {
        emitLaunchPhase({ gameId: id, phase: 'failed' });
      }
      return { success: false, message: msg };
    }
  }

  /**
   * v1.5.20-dev.18/19/20 — estratta da dentro launchGame(). Stessa
   * identica logica di sempre (v1.1.117/118/119-dev.1): (1) reinstalla
   * eventuali verb aggiunti al profilo dopo l'installazione originale —
   * salta se la prefix del runner corrente non esiste ancora; (2)
   * `winetricks list-installed` per rilevare verb installati a mano da
   * terminale e sincronizzarli col profilo salvato.
   *
   * Storia dei due bug reali attraversati per arrivare qui, entrambi
   * confermati con diagnostica diretta dell'utente (non ipotizzati):
   * dev.18 l'aveva spostata a girare DOPO il lancio (fire-and-forget)
   * per risolvere un blocco di 16 minuti — ma dev.20 ha scoperto che
   * farla girare IN PARALLELO al gioco già avviato può corrompere la
   * sessione: alcuni verb (dxvk, vkd3d, d3dcompiler...) sostituiscono
   * DLL nella STESSA prefix che il gioco ha già in uso (stessa ragione
   * per cui le guide DXVK dicono sempre di chiudere il gioco prima di
   * reinstallarlo) — per Ubisoft Connect è passato inosservato, per LEGO
   * Indiana Jones (Amazon/nile) ha impedito al gioco di restare in
   * esecuzione. Riportata PRIMA del lancio (sequenziale, mai più in
   * parallela con un gioco già avviato) — il fix reale di dev.19
   * (execFileAsync invece di execSync, cosi il demone resta reattivo
   * durante l'attesa) resta comunque valido e necessario, il problema
   * originale non era la POSIZIONE ma la natura bloccante delle
   * chiamate.
   *
   * v1.5.20-dev.23 — `runnerId`/`prefixPath` ora parametri espliciti
   * invece di leggerli da `game.runner`/`game.prefixPath`: per un gioco
   * con `requiresLauncher`, quei due campi sul gioco stesso possono
   * restare vuoti o stantii per sempre (l'installazione tramite lo
   * store d'origine non completa mai per questa categoria — vedi
   * CHANGELOG.md, saga Watch Dogs 2) — il chiamante passa i valori
   * EFFETTIVI già risolti (quelli del launcher condiviso quando
   * applicabile), mai quelli grezzi del gioco.
   */
  private async reconcileWinetricksVerbs(id: string, game: Game, profile: CompatibilityProfile | undefined, runnerId: string, prefixPath: string | undefined): Promise<void> {
    if (prefixPath && profile?.winetricksVerbs && profile.winetricksVerbs.length > 0) {
      const wineEnv = resolveRunnerWineEnv(runnerId, prefixPath);
      try {
        const { existsSync } = require('fs');
        const { execFile } = require('child_process');
        const { promisify } = require('util');
        const execFileAsync = promisify(execFile);
        const prefixAlreadyExists = existsSync(wineEnv.winePrefixPath);
        if (!prefixAlreadyExists) {
          // v1.1.117-dev.1 — richiesta utente: quando si cambia runner
          // per un gioco già installato/giocato, la prefix del nuovo
          // runner è vuota — nessun salvataggio, nessuna impostazione
          // pregressa. Deliberatamente NON copiamo alcuna cartella
          // (rischio di corruzione fra generazioni Wine/Proton diverse,
          // vedi discussione) — solo un avviso esplicito, l'utente
          // ripristina a mano se lo desidera.
          this.addLog(`[LAUNCH] Prefix nuova per il runner "${runnerId}" — salvataggi/impostazioni di un runner precedente non saranno presenti qui. Ripristinali a mano se necessario.`, 'system');
          try {
            const { notificationEngine } = require('./notificationEngine');
            notificationEngine.emit({
              type: 'system',
              level: 'warning',
              message: `${game.title}: stai usando il runner "${runnerId}" per la prima volta — è una prefix nuova, senza i salvataggi/impostazioni di un runner precedente eventualmente usato per questo gioco. Puoi ripristinarli a mano se li avevi.`,
            });
          } catch (err) {
            this.addLog(`[LAUNCH] Notifica prefix nuova non inviata: ${err}`, 'system');
          }
        } else {
          await execFileAsync('which', ['winetricks']);
          const verbTotal = profile.winetricksVerbs.length;
          let verbIndex = 0;
          for (const verb of profile.winetricksVerbs) {
            verbIndex += 1;
            this.addLog(`[LAUNCH] Verifica dipendenza: ${verb}`, 'system');
            // v2.0.41-dev.32 — richiesta utente, splash di lancio: fase
            // "Verifica ambiente" con indice/totale, per la barra di
            // progresso globale della splash.
            emitLaunchPhase({ gameId: id, phase: 'verifying-env', index: verbIndex, total: verbTotal, detail: verb });
            try {
              await execFileAsync('winetricks', ['--unattended', verb], {
                env: {
                  ...process.env,
                  WINEPREFIX:     wineEnv.winePrefixPath,
                  WINEDEBUG:      '-all',
                  WINETRICKS_GUI: 'none',
                  ...wineEnv.extraEnv,
                },
                timeout: 300_000,
              });
              this.addLog(`[LAUNCH] ${verb}: OK`, 'system');
            } catch {
              this.addLog(`[LAUNCH] ${verb}: già installato o errore ignorato`, 'system');
            }
          }
        }
      } catch {
        // winetricks non disponibile — ignora silenziosamente
      }
    }

    // v1.1.118-dev.1 — richiesta utente: i verb installati a mano da
    // terminale (es. `winetricks d3d9 d3dcompiler_43` direttamente sulla
    // prefix, non tramite la dashboard) non finivano mai nel profilo
    // salvato — X-Launcher può tracciare solo ciò che passa dalla propria
    // interfaccia. `winetricks list-installed` (comando ufficiale,
    // documentato) elenca TUTTI i verb realmente applicati a una prefix,
    // indipendentemente da come sono stati installati — usato qui per
    // sincronizzare il profilo salvato con la realtà della prefix, ad
    // ogni lancio: un'aggiunta manuale, una volta che il gioco è stato
    // lanciato con successo, finisce nel DB da sola al lancio successivo
    // (e da questo stesso, per i lanci successivi), senza dover toccare
    // le checkbox a mano nell'overlay. Indipendente dal blocco sopra:
    // gira anche se il profilo non aveva ancora nessun verb tracciato.
    if (prefixPath) {
      try {
        const { existsSync } = require('fs');
        const { execFile } = require('child_process');
        const { promisify } = require('util');
        const execFileAsync = promisify(execFile);
        const wineEnv = resolveRunnerWineEnv(runnerId, prefixPath);
        if (existsSync(wineEnv.winePrefixPath)) {
          await execFileAsync('which', ['winetricks']);
          const { stdout: listOutput } = await execFileAsync('winetricks', ['list-installed'], {
            env: {
              ...process.env,
              WINEPREFIX: wineEnv.winePrefixPath,
              WINEDEBUG: '-all',
              ...wineEnv.extraEnv,
            },
            timeout: 30_000,
          });
          // v1.1.119-dev.1 — bug reale segnalato dall'utente con un
          // output DB alla mano: `winetricks list-installed` non stampa
          // solo nomi di verb — stampa anche il proprio banner di avvio
          // ("Using winetricks <versione> - sha256sum: ...") e i singoli
          // font installati come componenti separati di `corefonts`
          // (andale, arial, comicsans, ecc.). Il filtro precedente
          // (`!l.startsWith('#')`) era troppo permissivo. Invece di
          // inseguire ogni riga indesiderata con altre esclusioni (fragile,
          // non finirebbe mai), si accetta nel DB SOLO ciò che è nel
          // nostro stesso elenco di verb riconosciuti (ALL_KNOWN_WINE_VERBS,
          // condiviso con l'overlay via wineVerbs.ts) — qualunque altra
          // cosa list-installed stampi viene scartata a prescindere.
          const installedVerbs = listOutput
            .split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => ALL_KNOWN_WINE_VERBS.includes(l));
          // Step 19d — winetricks.log è un log cumulativo (solo append):
          // se in passato sono stati applicati sia win10 sia win7 da
          // terminale, `installedVerbs` li conterrebbe entrambi anche se
          // solo l'ultimo è realmente attivo nel registro. Teniamo solo
          // l'ULTIMA occorrenza fra i verb versione OS, nell'ordine in
          // cui compaiono nel log (= ordine cronologico di applicazione).
          const lastOsVersionIdx = installedVerbs
            .map((v: string, i: number) => OS_VERSION_VERBS.includes(v) ? i : -1)
            .filter((i: number) => i !== -1)
            .pop();
          const installedVerbsDeduped = installedVerbs.filter((v: string, i: number) =>
            !OS_VERSION_VERBS.includes(v) || i === lastOsVersionIdx
          );
          // v1.1.119-dev.1 — ripulisce anche ciò che era già stato scritto
          // in precedenza (robaccia da una sincronizzazione fatta prima
          // di questo fix, come il caso reale segnalato dall'utente): non
          // basta filtrare le nuove rilevazioni, altrimenti banner/font
          // già salvati resterebbero lì per sempre (l'unione precedente
          // si limitava ad aggiungere, mai a togliere).
          const trackedVerbsClean: string[] = (profile?.winetricksVerbs ?? []).filter((v: string) => ALL_KNOWN_WINE_VERBS.includes(v));
          const newlyFound = installedVerbsDeduped.filter((v: string) => !trackedVerbsClean.includes(v));
          const droppedJunk = (profile?.winetricksVerbs ?? []).length - trackedVerbsClean.length;
          if (newlyFound.length > 0 || droppedJunk > 0) {
            // Step 19d — se newlyFound porta una NUOVA versione OS e il
            // profilo tracciato ne aveva già una diversa, quella vecchia va
            // rimossa dal merge finale: stessa esclusività reciproca
            // applicata anche qui, non solo lato UI.
            const incomingOsVersion = newlyFound.find((v: string) => OS_VERSION_VERBS.includes(v));
            const trackedWithoutStaleOs = incomingOsVersion
              ? trackedVerbsClean.filter((v: string) => !OS_VERSION_VERBS.includes(v))
              : trackedVerbsClean;
            const merged = [...trackedWithoutStaleOs, ...newlyFound];
            const currentProfile = profile ?? { fsr: false, gameMode: false, mangohud: 0 as const, eac: false, battleye: false };
            db.upsertCompatProfile(id, { ...currentProfile, winetricksVerbs: merged });
            if (newlyFound.length > 0) this.addLog(`[LAUNCH] Rilevati verb installati manualmente, aggiunti al profilo: ${newlyFound.join(', ')}`, 'system');
            if (droppedJunk > 0) this.addLog(`[LAUNCH] Ripulite ${droppedJunk} voci non riconosciute dal profilo (banner/font di winetricks salvati per errore prima del fix).`, 'system');
          }
        }
      } catch (err) {
        this.addLog(`[LAUNCH] Rilevamento verb installati manualmente non riuscito (winetricks list-installed): ${err}`, 'system');
      }
    }
  }

  markGameVerified(id: string, method: 'auto' | 'manual') {
    const game = db.getGameById(id);
    if (!game) return { success: false, message: 'Gioco non trovato' };
    db.markGameVerified(id, method);
    this.addLog(`[VERIFY] ${game.title} marcato come verificato (${method})`, 'system');
    return { success: true };
  }

  unmarkGameVerified(id: string) {
    const game = db.getGameById(id);
    if (!game) return { success: false, message: 'Gioco non trovato' };
    db.unmarkGameVerified(id);
    this.addLog(`[VERIFY] ${game.title} — badge verificato rimosso`, 'system');
    return { success: true };
  }

  installGame(id: string) {
    const game = db.getGameById(id);
    if (!game) {
      this.addLog(`[INSTALL] Errore: gioco ${id} non trovato nel DB`, 'error');
      return { success: false };
    }
    // v0.99.36 — Step 2: stesso lock in senso opposto. Se il gioco è
    // già in esecuzione, una (re)installazione scriverebbe sulla stessa
    // WINEPREFIX di un processo wine/proton attualmente attivo.
    const runningCheck = this.isLastLaunchedGameRunning();
    if (runningCheck.running && runningCheck.gameId === id) {
      this.addLog(`[INSTALL] Bloccato — ${game.title} è in esecuzione. Chiudi il gioco prima di reinstallare.`, 'error');
      return { success: false, message: `${game.title} è in esecuzione — chiudilo prima di reinstallare` };
    }
    this.addLog(`[INSTALL] Avvio installazione: ${game.title} (store: ${game.store}, id: ${game.id})`, 'system');
    return downloadManager.addTask(game.id, game.title, game.store);
  }

  async uninstallGame(id: string): Promise<{ success: boolean; message?: string }> {
    const game = db.getGameById(id);
    if (!game) return { success: false, message: 'Gioco non trovato' };

    // v2.0.41-dev.16 — calcolato qui, riusato più sotto sia per il lock
    // "launcher in esecuzione" sia per la cartella da rimuovere/il
    // reference counting — un solo lookup, non tre.
    const thirdPartyLauncherDef = getThirdPartyLauncherByStoreId(game.store);

    // v0.99.36 — Step 2: stesso lock — non rimuovere file/prefix di un
    // gioco mentre il suo processo wine/proton è ancora attivo.
    const runningCheck = this.isLastLaunchedGameRunning();
    if (runningCheck.running && runningCheck.gameId === id) {
      this.addLog(`[UNINSTALL] Bloccato — ${game.title} è in esecuzione. Chiudi il gioco prima di disinstallare.`, 'error');
      return { success: false, message: `${game.title} è in esecuzione — chiudilo prima di disinstallare` };
    }

    // v2.0.41-dev.16 — BUG UTENTE: stesso lock di sopra, ma per il
    // processo del LAUNCHER stesso (Ubisoft Connect/EA App aperti in
    // quel momento) — isLastLaunchedGameRunning() sopra copre solo un
    // gioco lanciato da noi, non il launcher condiviso aperto per conto
    // suo (dalla propria card, o da un gioco che lo richiede).
    if (thirdPartyLauncherDef && isSharedLauncherRunning(thirdPartyLauncherDef.id)) {
      this.addLog(`[UNINSTALL] Bloccato — ${thirdPartyLauncherDef.displayName} è in esecuzione. Chiudilo prima di disinstallare.`, 'error');
      return { success: false, message: `${thirdPartyLauncherDef.displayName} è in esecuzione — chiudilo prima di disinstallare` };
    }

    // v0.99.35 — bug confermato: un'installazione interrotta a metà
    // (es. timeout wineboot/winetricks, vedi CHANGELOG v0.99.35) lascia
    // spesso file/prefix orfani sul disco MA isInstalled resta false
    // (mai stato impostato a true, perché il flusso non ha completato).
    // Il controllo precedente ("if (!game.isInstalled) return errore")
    // bloccava la pulizia esattamente nel caso in cui serve di più —
    // l'utente vede "Disinstalla" nell'overlay, lo usa, e il backend
    // rifiutava silenziosamente senza che il frontend se ne accorgesse
    // (vedi anche fix lato App.tsx sullo stesso changelog).
    // Ora si procede comunque alla pulizia file se la cartella esiste,
    // indipendentemente da isInstalled — l'unico caso da bloccare
    // davvero è "nessun file e già segnato non installato", che non ha
    // nulla da fare.
    const aboutToCleanOrphan = !game.isInstalled;
    if (aboutToCleanOrphan) {
      this.addLog(`[UNINSTALL] ${game.title} — isInstalled=false, verifico comunque file orfani da installazione incompleta...`, 'system');
    }

    this.addLog(`[UNINSTALL] Avvio disinstallazione: ${game.title} (store: ${game.store})`, 'system');

    // v0.99.35 — bug confermato: per Epic Games, rimuovere solo i file
    // sul filesystem non bastava. syncExternalInstallStates() (chiamata
    // a ogni refreshLibrary, es. dai watcher periodici) si basa per
    // Epic su `legendary list-installed --json`, NON sul filesystem
    // come fa invece il controllo GOG. Se a legendary non viene mai
    // detto di disinstallare, il suo database interno continua a
    // credere che il gioco sia presente — al primo refresh successivo
    // (anche minuti dopo, da un trigger indipendente come il watcher
    // Steam) syncExternalInstallStates rimette isInstalled=true,
    // contraddicendo quello che questa funzione aveva appena scritto.
    // Risultato osservato: la card "sfarfalla" tra installato/rimosso
    // a seconda di quando scatta il prossimo sync, non per un problema
    // di timing del fetch ma per due fonti di verità in disaccordo.
    // Chiamare `legendary uninstall` qui chiude il cerchio: la fonte
    // esterna (legendary) e quella interna (DB X-Launcher) restano
    // coerenti, eliminando la race condition alla radice invece di
    // limitarsi a un refresh più aggressivo che la sposterebbe solo.
    if (game.store === 'Epic Games') {
      const appName = game.id.replace(/^epic-/, '');
      try {
        const { execSync } = require('child_process');
        execSync(`legendary --yes uninstall ${appName} --keep-files`, {
          stdio:   'ignore',
          timeout: 30_000,
        });
        this.addLog(`[UNINSTALL] ${game.title} — legendary uninstall completato.`, 'system');
      } catch (err) {
        // Non fatale: se legendary non conosce questo gioco (es. mai
        // arrivato a installazione completa) l'exit code è != 0 — la
        // pulizia file procede comunque sotto. Logghiamo per
        // visibilità, senza bloccare la disinstallazione.
        this.addLog(`[UNINSTALL] ${game.title} — legendary uninstall non riuscito o non necessario: ${err}`, 'system');
      }
    }

    // v1.1.115-dev.1 — bug reale segnalato dall'utente: per Amazon Games
    // questa chiamata non esisteva affatto (uninstallGame() del plugin era
    // solo uno stub che restituiva un messaggio senza eseguire nulla) —
    // stesso identico problema per cui era stata aggiunta la chiamata a
    // legendary sopra per Epic (v0.99.35): senza dire a nile di
    // disinstallare, il suo manifest interno continua a credere che il
    // gioco sia installato al vecchio path, anche dopo aver cancellato i
    // file a mano — molto probabilmente la causa reale del terzo problema
    // segnalato (cartella "files" vuota dopo una reinstallazione:
    // sospetto che nile, credendo il gioco già installato secondo il suo
    // manifest, salti il download vero e proprio).
    if (game.store === 'Amazon Games') {
      const productId = game.id.replace(/^amazon-/, '');
      try {
        const { execSync } = require('child_process');
        execSync(`nile uninstall ${productId}`, {
          stdio:   'ignore',
          timeout: 30_000,
        });
        this.addLog(`[UNINSTALL] ${game.title} — nile uninstall completato.`, 'system');
      } catch (err) {
        this.addLog(`[UNINSTALL] ${game.title} — nile uninstall non riuscito o non necessario: ${err}`, 'system');
      }
    }

    // Determina la cartella da rimuovere in base allo store
    const { homedir } = require('os');
    const { join }    = require('path');
    const { existsSync, rmSync } = require('fs');

    // v2.0.41-dev.16 — BUG UTENTE: per i launcher condivisi (Ubisoft
    // Connect, EA App — game.store mappato tramite
    // getThirdPartyLauncherByStoreId, stesso ponte già usato altrove nel
    // file, es. getGames()) storeDir restava sempre null: finiva sempre
    // nel ramo "store non gestito" sotto, Disinstalla non cancellava mai
    // davvero la cartella prefix in shared-launchers/, solo i campi DB.
    //
    // La cartella dell'INTERO launcher (non solo prefix/ — vedi
    // SHARED_LAUNCHERS_DIR/getSharedPrefixBasePath in
    // sharedLauncherManager.ts, prefix/ è l'unica sottocartella scritta
    // lì) va rimossa SOLO quando si sta disinstallando la riga del
    // launcher stesso — mai quella di un gioco che lo richiede
    // (requiresLauncher), che condivide lo stesso prefix con
    // potenzialmente altri giochi ancora installati. thirdPartyLauncherDef
    // già calcolato in testa alla funzione, riusato qui.

    // canRemoveSharedPrefix esisteva già (reference counting sui giochi
    // installati che dipendono da questo launcher) ma non era MAI
    // realmente collegata da nessuna parte — stesso bug. Se un altro
    // gioco installato richiede ancora questo launcher, rifiuta invece
    // di rimuovere un prefix di cui altri hanno ancora bisogno.
    if (thirdPartyLauncherDef && !canRemoveSharedPrefix(thirdPartyLauncherDef.id, id)) {
      this.addLog(`[UNINSTALL] Bloccato — altri giochi installati richiedono ancora ${thirdPartyLauncherDef.displayName}.`, 'error');
      return { success: false, message: `Altri giochi installati richiedono ancora ${thirdPartyLauncherDef.displayName} — disinstallali prima, o lascia questo launcher installato.` };
    }

    const storeDir = game.store === 'GOG Galaxy'
      ? join(homedir(), 'Games', 'GOG',  game.id.replace(/^gog-/, ''))
      : game.store === 'Epic Games'
      ? join(homedir(), 'Games', 'Epic', game.id.replace(/^epic-/, ''))
      : game.store === 'Amazon Games'
      // v1.1.115-dev.1 — mancava: era null, quindi l'intero blocco di
      // rimozione file sotto veniva saltato per Amazon (finiva sempre nel
      // ramo "store non gestito"). Stessa cartella usata da storeDir() in
      // downloadManager.ts: GAMES_ROOT/Amazon Games/<gameId con prefisso
      // amazon- incluso, vedi slugFromId() — non ripulito qui, coerenza
      // col path realmente usato in fase di installazione).
      ? join(homedir(), 'Games', 'Amazon Games', game.id)
      : thirdPartyLauncherDef
      ? join(SHARED_LAUNCHERS_DIR, thirdPartyLauncherDef.id)
      : null;

    // Caso davvero vuoto: già segnato non installato E nessuna cartella
    // su disco — qui non c'è nulla da pulire, a differenza del caso
    // sopra (isInstalled=false ma file orfani presenti). Segnaliamo
    // onestamente "niente da fare" invece di un successo che non
    // corrisponde a nessuna azione reale, così il frontend può
    // distinguere i due casi se vuole mostrare un messaggio diverso.
    if (aboutToCleanOrphan && (!storeDir || !existsSync(storeDir))) {
      this.addLog(`[UNINSTALL] ${game.title} — nessun file su disco, niente da disinstallare.`, 'system');
      return { success: false, message: 'Gioco non installato (nessun file trovato)' };
    }

    if (storeDir) {
      if (existsSync(storeDir)) {
        try {
          rmSync(storeDir, { recursive: true, force: true });
          this.addLog(`[UNINSTALL] ${game.title} — file rimossi: ${storeDir}`, 'system');
          // v2.0.41-dev.16 — resetta il tracciamento del bootstrap SOLO
          // dopo la rimozione reale riuscita della cartella: senza,
          // isLauncherBootstrapped() continuerebbe a rispondere true
          // puntando a un prefix ormai inesistente, rompendo qualunque
          // reinstallazione successiva (isAuthenticated() del plugin
          // resterebbe "connesso" a qualcosa che non c'è più).
          if (thirdPartyLauncherDef) {
            db.deleteSharedLauncherPrefix(thirdPartyLauncherDef.id);
          }
        } catch (err) {
          this.addLog(`[UNINSTALL] Errore rimozione file ${game.title}: ${err}`, 'error');
          return { success: false, message: `Errore rimozione file: ${err}` };
        }
      } else {
        this.addLog(`[UNINSTALL] ${game.title} — cartella non trovata: ${storeDir}`, 'system');
      }
    } else {
      this.addLog(`[UNINSTALL] ${game.title} — store non gestito: ${game.store}`, 'system');
    }

    // Aggiorna DB
    db.updateGameStatus(id, false, 'Not Installed');
    db.updateGameConfig(id, {
      executablePath: null,
      prefixPath:     null,
      launchArgs:     null,
      launchCwd:      null,
    });
    this.addLog(`[UNINSTALL] ${game.title} disinstallato con successo.`, 'system');
    return { success: true };
  }

  async loginToStore(storeId: string) {
    const plugin = this.plugins.find(p => p.id === storeId);
    if (!plugin) return { success: false, message: 'Store non trovato' };
    this.addLog(`[AUTH] Handshake con ${plugin.name}...`, 'auth');
    const result = await plugin.login();
    if (result.success && !result.waitForBrowser) {
      // Login sincrono completato — aggiorna la libreria subito
      this.addLog(`[AUTH] Autenticato su ${plugin.name}.`, 'system');
      await this.refreshLibrary();
    } else if (result.success && result.waitForBrowser) {
      // Login asincrono (browser OAuth) — la libreria verrà aggiornata
      // quando il frontend chiamerà /api/stores dopo aver rilevato la connessione
      this.addLog(`[AUTH] Login ${plugin.name} in attesa del browser...`, 'auth');
    }
    return result;
  }

  async logoutFromStore(storeId: string) {
    const plugin = this.plugins.find(p => p.id === storeId);
    if (!plugin) return { success: false, message: 'Store non trovato' };
    this.addLog(`[AUTH] Disconnessione da ${plugin.name}...`, 'auth');
    const result = await plugin.logout();
    if (result.success) {
      this.addLog(`[AUTH] Disconnesso da ${plugin.name}.`, 'system');
      // Aggiorna la libreria: i giochi non installati di questo store
      // smettono di essere sincronizzati una volta persa l'autenticazione.
      await this.refreshLibrary();
    }
    return result;
  }

  async syncStores(): Promise<Store[]> {
    const allGames = db.getAllGames();
    return Promise.all(this.plugins.map(async p => ({
      id:        p.id,
      name:      p.name,
      gameCount: allGames.filter(g => g.store === p.id && (p.enabled || g.isInstalled)).length,
      isConnected: await p.isAuthenticated(),
      enabled:   p.enabled,
    })));
  }

  /** Restituisce il registry completo dei plugin store per il Plugin Manager UI */
  getPluginRegistry() {
    return this.plugins.map(p => ({
      id:           p.id,
      name:         p.name,
      description:  p.description,
      drmFree:      p.drmFree,
      requiredTool: p.requiredTool,
      enabled:      p.enabled,
    }));
  }

  /** Abilita o disabilita un plugin store e persiste la scelta su DB */
  async setPluginEnabled(storeId: string, enabled: boolean) {
    const plugin = this.plugins.find(p => p.id === storeId);
    if (!plugin) return { success: false };
    plugin.enabled = enabled;
    db.setPluginEnabled(storeId, enabled);
    this.addLog(
      `[PLUGIN] ${plugin.name} ${enabled ? 'abilitato' : 'disabilitato'}.`,
      'system'
    );
    // Se riabilitato, sincronizza subito la libreria
    if (enabled) await this.refreshLibrary();
    else this.notifyLibraryRefreshed(); // notifica per aggiornare la UI
    return { success: true, enabled };
  }

  /** Carica lo stato enabled dei plugin dal DB all'avvio */
  loadPluginStates() {
    const states = db.getPluginStates();
    for (const { id, enabled } of states) {
      const plugin = this.plugins.find(p => p.id === id);
      if (plugin) plugin.enabled = enabled;
    }
  }

  /**
   * Richiesta utente — dimensione PREVISTA dell'installazione (prima di
   * scaricare), on-demand per un solo gioco alla volta. Solo GOG ed Epic
   * per ora (decisione esplicita dell'utente): Steam non ha una fonte
   * già cablata per il "non ancora installato" (SizeOnDisk esiste solo
   * per manifest locali, cioè giochi già installati), Classic Console
   * non si applica (le ROM sono già file completi, nessuna fase di
   * installazione separata). Ritorna null per qualunque altro store, o
   * se il plugin giusto non espone questo metodo.
   *
   * v1.1.90 — richiesto dall'utente: cache persistente invece di
   * rifare la chiamata a lgogdownloader/legendary ogni volta che il
   * gioco viene selezionato. Se già presente in DB, ritorna subito
   * quello senza richiamare il plugin; altrimenti lo recupera una
   * volta e lo scrive per le volte successive.
   */
  /**
   * Richiesta utente — "auto-remaster": due meccaniche diverse a seconda del
   * campo `mode` del preset (classicPlugin.ts, REMASTER_PRESETS), emerse
   * discutendo Saturn/PS2/N64 (non tutti i sistemi hanno due core da
   * scambiare come PSX):
   *
   * - 'swap-core' (PSX, Saturn): il core stesso è l'interruttore — nessun
   *   campo DB dedicato oltre a libretroCore. Disattivare si limita a
   *   tornare al core di default, che semplicemente ignora il file di
   *   preset (vive nella cartella di config di un core diverso). Il file
   *   NON va mai rimosso qui.
   *
   * - 'toggle-options' (PS2, futuro N64): un solo core sempre in uso — è il
   *   file di preset per-titolo l'interruttore. Attivare lo scrive (se
   *   assente), disattivare lo rimuove (removeRemasterOptions), così il
   *   gioco ricade sulla configurazione di default a livello di CORE
   *   (nessun override — confermato dall'utente per PS2/LRPS2).
   *
   * Generalizzata dal caso PSX (il primo verificato passo-passo a mano su
   * hardware reale) — funziona per qualunque sistema con una voce in
   * REMASTER_PRESETS, senza bisogno di altre modifiche qui quando in
   * futuro si aggiungerà Dreamcast.
   */
  async setRemasterEnabled(gameId: string, enabled: boolean): Promise<{ success: boolean; message?: string; newCore?: string; remasterEnabled?: boolean }> {
    const game = db.getGameById(gameId);
    if (!game || !hasRemasterPreset(game.system)) {
      return { success: false, message: 'Nessun preset auto-remaster disponibile per questo gioco' };
    }
    const preset = REMASTER_PRESETS[game.system!];

    let newCore: string;
    if (preset.mode === 'swap-core') {
      if (enabled && game.executablePath) {
        writeRemasterOptions(game.executablePath, game.system!);
      }
      newCore = enabled ? preset.remasterCore : preset.defaultCore;
      db.updateGameConfig(gameId, { libretroCore: newCore });
    } else {
      // toggle-options: il core non cambia mai, cambia solo il file — lo
      // stato va quindi persistito a parte (remaster_enabled), altrimenti
      // l'overlay non ha modo di sapere se è attivo o no (bug segnalato
      // dall'utente: il pulsante Auto-Remaster per PS2 non rifletteva mai
      // lo stato reale, dato che libretroCore resta sempre lo stesso).
      if (game.executablePath) {
        if (enabled) {
          writeRemasterOptions(game.executablePath, game.system!);
        } else {
          removeRemasterOptions(game.executablePath, game.system!);
        }
      }
      newCore = preset.core;
      db.updateGameConfig(gameId, { libretroCore: newCore, remasterEnabled: enabled });
    }

    this.addLog(`[CLASSIC] Auto-remaster (${game.system}) ${enabled ? 'attivato' : 'disattivato'} per ${game.title}.`, 'system');
    return { success: true, newCore, remasterEnabled: preset.mode === 'toggle-options' ? enabled : undefined };
  }

  async getPredictedInstallSize(gameId: string): Promise<number | null> {
    const game = db.getGameById(gameId);
    if (!game) return null;
    if (typeof game.predictedSizeBytes === 'number' && game.predictedSizeBytes > 0) {
      return game.predictedSizeBytes;
    }
    const plugin = this.plugins.find(p => p.id === game.store);
    if (!plugin || typeof plugin.getPredictedInstallSizeBytes !== 'function') return null;
    const bytes = await plugin.getPredictedInstallSizeBytes(gameId);
    if (typeof bytes === 'number' && bytes > 0) {
      db.setPredictedSizeBytes(gameId, bytes);
    }
    return bytes;
  }

  async refreshRunners() {
    await this.syncProtonRunners();
    this.addLog('[COMPAT] Runner aggiornati.', 'system');
    return Array.from(this.allRunners.keys());
  }

  updateGameConfig(id: string, config: {
    executablePath?: string;
    steamAppId?: string;
    dosboxConf?: string;
    libretroCore?: string;
    scummvmId?: string;
    scrapeTitle?: string;
    windowClass?: string | null;
    runner?: string;
    // Step 19d — switch "Launcher condiviso" in Game Options.
    requiresLauncher?: string | null;
  }) {
    db.updateGameConfig(id, config);
    const summary = Object.entries(config)
      .map(([k, v]) => `${k}=${v ?? 'null'}`)
      .join(', ');
    this.addLog(`[DAEMON] Config aggiornata per ${id}: ${summary}`, 'system');

    // v0.99.35 — quando l'utente seleziona un runner Proton per un
    // gioco già installato (precedentemente su Wine), i verb
    // winetricks salvati nel compat profile (vedi overlay) non sono
    // mai stati applicati alla prefix Proton — è una prefix Steam
    // separata, fisicamente distinta da quella Wine, mai toccata dal
    // flusso di installazione originale. Senza questo, l'utente
    // dovrebbe reinstallare manualmente le stesse dipendenze ogni
    // volta che cambia runner. Non blocca la risposta HTTP — gira in
    // background, l'utente vede il runner cambiare subito, le
    // dipendenze arrivano nel frattempo (loggate in console di debug
    // come qualsiasi altra operazione di sistema).
    if (config.runner && this.protonRunners.has(config.runner)) {
      this.applyVerbsToProtonPrefix(id, config.runner).catch(err =>
        this.addLog(`[COMPAT] Applicazione verb su Proton fallita per ${id}: ${err}`, 'error')
      );
    }

    // Richiesta utente — override del titolo di ricerca metadati (nato
    // per i ROM MAME con nome file poco significativo, es. "gngt.zip",
    // ma disponibile per qualunque gioco): appena impostato, rifetch
    // immediato per QUESTO gioco invece di aspettare la prossima sync
    // automatica della libreria. Stesso pattern del ramo Proton sopra —
    // non blocca la risposta HTTP, gira in background; il fetch
    // completato notifica via SSE 'library-updated' (stesso meccanismo
    // già in uso per ogni altro aggiornamento asincrono ai metadati),
    // la Dashboard aggiorna cover/rating da sola quando arrivano.
    // 'scrapeTitle' in config, non config.scrapeTitle: un valore vuoto
    // ('' per tornare al titolo normale) deve rifare comunque il fetch,
    // non solo un valore "truthy".
    if ('scrapeTitle' in config) {
      const freshGame = db.getGameById(id);
      if (freshGame) {
        metadataManager.enrichGameMetadata(freshGame, true)
          .then(enriched => {
            db.upsertGames([enriched]);
            void cacheGameCovers(enriched);   // v2.7.2-dev.4 — copertine dell'overlay degli spazi
            // Bug confermato dall'utente con test dal vivo: senza questa
            // riga, il titolo mostrato in libreria/sidebar tornava al nome
            // grezzo del file ROM alla sync successiva (anche solo
            // riavviando la Dashboard) — db.upsertGames() sopra non basta
            // per il campo title da solo, perché games.scrape_title è già
            // impostato a questo punto (dal PATCH di poco prima) e la
            // protezione in db.ts (necessaria per bloccare le sync
            // regolari) blocca anche QUESTA scrittura legittima. Bypassa
            // quella protezione con una UPDATE diretta, solo quando il
            // titolo è davvero cambiato — se enrichGameMetadata non ha
            // trovato un abbinamento IGDB migliore, enriched.title resta
            // uguale a freshGame.title e questa riga non fa nulla di più.
            if (enriched.title !== freshGame.title) {
              db.updateGameTitle(id, enriched.title);
            }
            this.notifyLibraryRefreshed();
            this.addLog(`[METADATA] Rifetch forzato completato per ${id} (titolo di ricerca: "${config.scrapeTitle || freshGame.title}").`, 'system');
          })
          .catch(err => this.addLog(`[METADATA] Rifetch forzato fallito per ${id}: ${err}`, 'error'));
      }
    }

    return { success: true };
  }

  /**
   * Applica i winetricksVerbs salvati nel compat profile di un gioco
   * alla prefix Proton corrispondente al runner indicato. Eseguito in
   * background dopo un cambio runner — non blocca la UI. "Eredita"
   * la stessa selezione di verb già fatta per Wine, invece di
   * richiedere all'utente di riconfigurarla per ogni runner.
   */
  private async applyVerbsToProtonPrefix(gameId: string, runnerId: string) {
    const profile = db.getCompatProfile(gameId);
    const verbs   = profile?.winetricksVerbs;
    if (!verbs || verbs.length === 0) return;

    const { existsSync } = await import('fs');
    const { join }        = await import('path');
    const { homedir }     = await import('os');
    const { spawn }       = await import('child_process');

    const compatDataPath = join(homedir(), '.local', 'share', 'proton-prefixes', gameId);
    const pfxPath         = join(compatDataPath, 'pfx');

    if (!existsSync(pfxPath)) {
      // La prefix Proton non esiste ancora — verrà creata al primo
      // lancio del gioco con questo runner. Applicare verb a una
      // prefix non ancora inizializzata da Proton stesso rischia di
      // confondere la sua struttura interna — saltiamo, l'utente può
      // rilanciare il gioco una volta per inizializzarla, poi
      // riselezionare il runner per far scattare di nuovo questa logica.
      this.addLog(`[COMPAT] Prefix Proton non ancora inizializzata per ${gameId} — verb da applicare al prossimo cambio runner dopo il primo lancio.`, 'system');
      return;
    }

    this.addLog(`[COMPAT] Applico ${verbs.length} verb winetricks alla prefix Proton (${runnerId})...`, 'system');

    for (const verb of verbs) {
      await new Promise<void>((resolve) => {
        const proc = spawn('winetricks', ['--unattended', verb], {
          stdio: 'ignore',
          env: {
            ...process.env,
            WINEPREFIX:     pfxPath,
            WINEDEBUG:      '-all',
            WINETRICKS_GUI: 'none',
          },
        });
        // Stesso pattern 'exit' (non 'close') già adottato in
        // downloadManager.spawnWithTimeout — non bloccante per
        // sotto-processi residui di winetricks/wineserver.
        proc.on('exit', () => resolve());
        proc.on('error', (err) => {
          this.addLog(`[COMPAT] Verb ${verb} (Proton) fallito: ${err}`, 'error');
          resolve(); // non fatale — prosegue con i verb successivi
        });
      });
    }

    this.addLog(`[COMPAT] Verb winetricks applicati alla prefix Proton per ${gameId}.`, 'system');
  }

  updateCompatProfile(gameId: string, profile: import('../types').CompatibilityProfile) {
    // v1.5.1-dev.1 — bug reale segnalato dall'utente, verificato nel
    // codice: questo metodo passava req.body DIRETTAMENTE a
    // db.upsertCompatProfile(), che scrive `profile.winetricksVerbs ?? []`
    // — qualunque PATCH che non includesse esplicitamente
    // winetricksVerbs (es. il toggle "Usa Known Fixes", che rilegge il
    // profilo dal server invece di includere lo stato locale delle
    // checkbox — vuoto per un gioco mai configurato) scriveva
    // silenziosamente un array vuoto, cancellando qualunque
    // configurazione mostrata a schermo ma non ancora persistita.
    // Probabile per QUALUNQUE toggle dell'overlay (FSR/GameMode/
    // MangoHud/EAC/BattlEye/disableWineSync), non solo Known Fixes,
    // dato che condividono lo stesso schema fetch-poi-patch. Fix:
    // fondere sempre con la riga già esistente — un campo omesso da
    // QUESTA specifica richiesta PATCH preserva il valore già
    // presente nel DB, invece di essere azzerato al default di tipo.
    const existing = db.getCompatProfile(gameId);
    db.upsertCompatProfile(gameId, { ...existing, ...profile });
    this.addLog(`[COMPAT] Profilo aggiornato per game ${gameId}`, 'system');

    // v0.99.90 — Step 15d: reset dei tentativi AI per questo gioco. Questo
    // metodo è il vero punto di modifica MANUALE (chiamato da PATCH
    // /api/games/:id/compat, cioè dall'overlay) — distinto dalle scritture
    // automatiche di db.upsertCompatProfile fatte da downloadManager.ts
    // durante l'installazione (known-fixes writeback), che non devono
    // azzerare nulla. Solo qui, dove l'utente ha davvero cambiato
    // qualcosa a mano, ha senso dare all'AI un'altra possibilità.
    attemptTracker.resetForGame(gameId);

    return { success: true };
  }
}

export const gameManager = new GameManager();
