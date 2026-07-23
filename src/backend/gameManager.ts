import { Game, Store, LogEntry, StoreType } from '../types';
import { readFileSync } from 'fs';
import { execFileSync, spawn } from 'child_process';
import path from 'path';
import { MOCK_LOGS } from '../mockData';
import { StorePlugin } from './plugins/base';
import { GOGPlugin, isJunkGogSlug } from './plugins/gogPlugin';
import { SteamPlugin } from './plugins/steamPlugin';
import { EpicPlugin } from './plugins/epicPlugin';
import { AmazonPlugin } from './plugins/amazonPlugin';
import { BattlenetPlugin } from './plugins/battlenetPlugin';
import { ClassicPlugin, REMASTER_PRESETS, hasRemasterPreset, writeRemasterOptions } from './plugins/classicPlugin';
import { BaseRunner } from './runners/base';
import { WineRunner, ProtonRunner, DOSBoxRunner, RetroArchRunner, ScummVMRunner, SteamNativeRunner, launchEpicViaLegendary } from './runners/implementations';
import { downloadManager, resolveGogExe } from './downloadManager';
import { metadataManager } from './metadataManager';
import { compatibilityManager } from './compatibilityManager';
import * as db from './db';
import { writeLog } from './logger';
import { notificationEngine } from './notificationEngine';
import * as attemptTracker from './aiProviders/attemptTracker';

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
  private lastLaunchedGame: { gameId: string; gameTitle: string; pid: number; launchedAt: number; logPath?: string; processNameHint?: string; processNameSeenAtLeastOnce?: boolean } | null = null;

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
  isLastLaunchedGameRunning(): { running: boolean; gameId?: string; gameTitle?: string } {
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
    if (this.lastLaunchedGame.processNameHint) {
      try {
        execFileSync('pgrep', ['-f', this.lastLaunchedGame.processNameHint], { stdio: 'pipe' });
        // Trovato — segna che l'abbiamo visto almeno una volta, così un
        // futuro mancato match (chiusura reale) non viene più confuso
        // con "non ancora partito".
        this.lastLaunchedGame.processNameSeenAtLeastOnce = true;
        return { running: true, gameId: this.lastLaunchedGame.gameId, gameTitle: this.lastLaunchedGame.gameTitle };
      } catch {
        // v1.1.32 — pgrep non trova corrispondenze: due letture
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
        if (!this.lastLaunchedGame.processNameSeenAtLeastOnce) {
          const elapsed = Date.now() - this.lastLaunchedGame.launchedAt;
          if (elapsed < GameManager.PROCESS_NAME_STARTUP_GRACE_MS) {
            return { running: true, gameId: this.lastLaunchedGame.gameId, gameTitle: this.lastLaunchedGame.gameTitle };
          }
        }
        // Visto in passato e ora sparito, oppure mai visto e periodo di
        // grazia scaduto — in entrambi i casi è una chiusura/fallimento
        // reale.
        return { running: false };
      }
    }

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
    const x11Env = {
      ...process.env,
      DISPLAY: process.env.DISPLAY ?? ':0',
      PATH: [`${home}/.local/bin`, '/usr/local/bin', '/usr/bin', '/bin', existingPath].join(':'),
    };
    let xsetOk = false;
    try {
      execFileSync('xset', ['s', 'off'], { stdio: 'ignore', env: x11Env });
      execFileSync('xset', ['-dpms'], { stdio: 'ignore', env: x11Env });
      xsetOk = true;
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
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
    const x11Env = { ...process.env, DISPLAY: process.env.DISPLAY ?? ':0' };
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
    this.gameExitPollTimer = setInterval(() => {
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
        this.lastLaunchedGame = null;
        // v1.1.33 — rilasciata qui, nello stesso punto atomico in cui la
        // transizione running→non-running viene confermata reale (non
        // durante il periodo di grazia di v1.1.32) — non prima.
        this.stopScreensaverInhibit();

        const game = db.getGameById(before.gameId);
        if (!game) return;

        const elapsedMs = Date.now() - before.launchedAt;

        if (elapsedMs < GameManager.QUICK_EXIT_THRESHOLD_MS) {
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
            } catch (e) {
              // File non scrivibile/apribile per qualche motivo (vedi
              // fallback difensivo in spawnDetached) — non bloccante,
              // procediamo comunque con un messaggio generico sotto.
            }
          }
          const errorText = logContent || 'Il processo si è chiuso pochi secondi dopo l\'avvio, senza output catturato su stdout/stderr.';
          this.addLog(`[LAUNCH] ${before.gameTitle} chiuso dopo ${Math.round(elapsedMs / 1000)}s — trattato come fallimento di avvio.`, 'error');
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
        if (task.executablePath) {
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
      } catch (e) {
        this.addLog(`[SYNC] GOG sync failed: ${e}`, 'warning');
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
        let installed: any[] = [];
        try {
          const parsed = JSON.parse(raw.trim());
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
            .filter((g: any) => g && typeof g.app_name === 'string')
            .map((g: any) => `epic-${g.app_name.toLowerCase()}`)
        );

        for (const game of db.getAllGames()) {
          if (game.store !== 'Epic Games') continue;
          const isInstalled = installedIds.has(game.id.toLowerCase());
          if (!isInstalled && game.isInstalled) {
            db.updateGameStatus(game.id, false, 'Not Installed');
            this.addLog(`[SYNC] Epic game desync fixed: ${game.title}`, 'system');
          }
        }
      } catch (e) {
        this.addLog(`[SYNC] legendary sync failed: ${e}`, 'warning');
      }
    } catch (e) {
      this.addLog(`[SYNC] external sync failed: ${e}`, 'warning');
    }
  }


  private async init() {
    // 0. Carica stato enabled dei plugin dal DB
    this.loadPluginStates();

    // 1. Ripristina download interrotti dalla sessione precedente
    const pending = db.getPendingDownloads();
    if (pending.length > 0) {
      this.addLog(`[DAEMON] Ripristino ${pending.length} download in sospeso...`, 'system');
      for (const task of pending) {
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

    // FASE 2: arricchisce i metadati in background (non blocca l'avvio)
    setImmediate(async () => {
      // Carica i dati già presenti nel DB per evitare re-fetch inutili
      const existing = new Map<string, import('./types').Game>();
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
    });
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

    if (query?.store && query.store !== 'All' && (query.store as any) !== 'undefined') {
      games = games.filter(g => g.store === query.store);
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

    // Carica il profilo compat dal DB se esiste
    const profile = db.getCompatProfile(id);
    const runner = this.allRunners.get(game.runner);
    if (!runner) {
      this.addLog(`[DAEMON] Runner "${game.runner}" non disponibile per ${game.title}`, 'error');
      return { success: false, message: `Runner "${game.runner}" non trovato` };
    }

    this.addLog(`[DAEMON] Avvio ${game.title} via ${runner.name}`, 'system');
    // v1.1.68 — registrato qui, non prima: tutti i controlli di blocco
    // (non installato, lock installazione/gioco già attivo, plugin
    // disabilitato) sono già stati superati a questo punto — un lancio
    // bloccato non deve scavalcare un gioco realmente giocato di recente
    // nella cronologia della tray.
    db.recordGameLaunch(id);

    // Se il gioco ha una prefix e ci sono verbs nel profilo compat,
    // installa quelli eventualmente aggiunti post-installazione prima di avviare
    if (game.prefixPath && profile?.winetricksVerbs && profile.winetricksVerbs.length > 0) {
      try {
        const { execSync } = require('child_process');
        const { existsSync } = require('fs');
        if (existsSync(game.prefixPath) && execSync('which winetricks', { encoding: 'utf-8' }).trim()) {
          for (const verb of profile.winetricksVerbs) {
            this.addLog(`[LAUNCH] Verifica dipendenza: ${verb}`, 'system');
            try {
              execSync(`winetricks --unattended ${verb}`, {
                env: {
                  ...process.env,
                  WINEPREFIX:     game.prefixPath,
                  WINEDEBUG:      '-all',
                  WINETRICKS_GUI: 'none',
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
        prefix:   game.prefixPath,
        args:     effectiveLaunchArgs ? shellSplitArgs(effectiveLaunchArgs) : undefined,
        cwd:      game.launchCwd,
        fsr:      profile?.fsr      ?? false,
        gameMode: profile?.gameMode ?? false,
        mangohud: profile?.mangohud ?? 0,
        eac:      profile?.eac      ?? false,
        battleye: profile?.battleye ?? false,
      };
      // v1.1.30 — giochi Epic: sempre via legendary launch, non l'exe
      // diretto. Vedi launchEpicViaLegendary per il motivo esatto (alcuni
      // titoli con verifica EOS severa, es. SIFU, rifiutano il lancio
      // senza gli argomenti di autenticazione che solo legendary sa
      // costruire). Continua a usare il runner Wine/Proton già
      // configurato per questo gioco — non cambia nulla per i giochi che
      // non hanno bisogno di quella verifica, legendary li lancia allo
      // stesso modo di sempre con lo stesso wine/proton.
      const result = game.store === 'Epic Games'
        ? await launchEpicViaLegendary(game, runner, runnerConfig)
        : await runner.launch(game, runnerConfig);
      if (result.success) {
        this.addLog(`[LAUNCH] Sessione attiva — PID: ${result.pid} — ${result.message}`, 'system');
        if (result.pid) {
          // v1.1.31 — processNameHint solo per Epic: è l'unico store
          // dove il PID tracciato (legendary/wrapper Proton) non è
          // affidabile per sapere se il gioco vero è ancora in
          // esecuzione. Basename dell'eseguibile già risolto
          // (game.executablePath), non l'intero percorso — pgrep -f
          // cerca per substring nella riga di comando completa, un
          // basename è già sufficientemente specifico ed evita falsi
          // negativi se il percorso assoluto cambiasse fra una sessione
          // e l'altra.
          const processNameHint = game.store === 'Epic Games' && game.executablePath
            ? path.basename(game.executablePath)
            : undefined;
          this.lastLaunchedGame = { gameId: id, gameTitle: game.title, pid: result.pid, launchedAt: Date.now(), logPath: result.logPath, processNameHint };
          this.startScreensaverInhibit(game.title);
        }
      } else {
        this.addLog(`[LAUNCH] Fallito: ${result.message}`, 'error');
        // Log suggerimento se manca l'exe
        if (result.message?.includes('percorso eseguibile') || result.message?.includes('executablePath')) {
          this.addLog(`[LAUNCH] → Apri l'overlay del gioco e imposta "Executable Path" nella sezione Game Config`, 'error');
        }
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.addLog(`[LAUNCH] Eccezione runner: ${msg}`, 'error');
      return { success: false, message: msg };
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

    // v0.99.36 — Step 2: stesso lock — non rimuovere file/prefix di un
    // gioco mentre il suo processo wine/proton è ancora attivo.
    const runningCheck = this.isLastLaunchedGameRunning();
    if (runningCheck.running && runningCheck.gameId === id) {
      this.addLog(`[UNINSTALL] Bloccato — ${game.title} è in esecuzione. Chiudi il gioco prima di disinstallare.`, 'error');
      return { success: false, message: `${game.title} è in esecuzione — chiudilo prima di disinstallare` };
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

    // Determina la cartella da rimuovere in base allo store
    const { homedir } = require('os');
    const { join }    = require('path');
    const { existsSync, rmSync } = require('fs');

    const storeDir = game.store === 'GOG Galaxy'
      ? join(homedir(), 'Games', 'GOG',  game.id.replace(/^gog-/, ''))
      : game.store === 'Epic Games'
      ? join(homedir(), 'Games', 'Epic', game.id.replace(/^epic-/, ''))
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
   * Richiesta utente — "auto-remaster": attiva/disattiva passando dal core
   * originale (più fedele, nessun upscaling) al core hardware-accelerato
   * con un preset di risoluzione/AA/PGXP registrato in REMASTER_PRESETS
   * (classicPlugin.ts). Il core stesso è l'interruttore — nessun campo DB
   * dedicato: disattivare si limita a tornare al core di default, che
   * semplicemente ignora il file di preset (vive nella cartella di config
   * di un core diverso).
   *
   * Generalizzata dal caso PSX (il primo verificato passo-passo a mano su
   * hardware reale) — funziona per qualunque sistema con una voce in
   * REMASTER_PRESETS, senza bisogno di altre modifiche qui quando in
   * futuro si aggiungeranno N64/Saturn/Dreamcast/PS2.
   */
  async setRemasterEnabled(gameId: string, enabled: boolean): Promise<{ success: boolean; message?: string; newCore?: string }> {
    const game = db.getGameById(gameId);
    if (!game || !hasRemasterPreset(game.system)) {
      return { success: false, message: 'Nessun preset auto-remaster disponibile per questo gioco' };
    }
    const preset = REMASTER_PRESETS[game.system!];
    if (enabled && game.executablePath) {
      writeRemasterOptions(game.executablePath, game.system!);
    }
    const newCore = enabled ? preset.remasterCore : preset.defaultCore;
    db.updateGameConfig(gameId, { libretroCore: newCore });
    this.addLog(`[CLASSIC] Auto-remaster (${game.system}) ${enabled ? 'attivato' : 'disattivato'} per ${game.title}.`, 'system');
    return { success: true, newCore };
  }

  async getPredictedInstallSize(gameId: string): Promise<number | null> {
    const game = db.getGameById(gameId);
    if (!game) return null;
    if (typeof game.predictedSizeBytes === 'number' && game.predictedSizeBytes > 0) {
      return game.predictedSizeBytes;
    }
    const plugin = this.plugins.find(p => p.id === game.store) as any;
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
    runner?: string;
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
    db.upsertCompatProfile(gameId, profile);
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
