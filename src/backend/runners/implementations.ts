/**
 * Runner implementations — versione Linux reale.
 *
 * Gli stub originali stampavano su console e restituivano un PID casuale.
 * Su Linux gaming i runner devono:
 *   1. Verificare che il binario sia disponibile (which/existsSync)
 *   2. Costruire il comando con le variabili d'ambiente corrette
 *   3. Lanciare il processo con child_process.spawn (detached)
 *   4. Restituire il PID reale
 */

import { BaseRunner, RunnerConfig } from './base';
import { Game } from '../../types';
import { spawn, execSync } from 'child_process';
import { existsSync, readdirSync, mkdirSync, openSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { writeLog } from '../logger';
import { DATA_DIR } from '../paths';

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function expandHome(p: string): string {
  // Espande ~ e variabili d'ambiente tipo $HOME, $XDG_DATA_HOME, ecc.
  const withHome = p.startsWith('~') ? path.join(homedir(), p.slice(1)) : p;
  return withHome.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, name) =>
    process.env[name] ?? `$${name}`
  );
}

/**
 * v0.99.90 — fix del buco scoperto con Soma e ricomparso identico con
 * Bioshock 2 (eseguibile rinominato .bak): finora stdout/stderr del
 * processo di gioco venivano sempre scartati (stdio: 'ignore'), quindi
 * quando wine "riesce" a partire (PID assegnato) ma non trova l'exe o
 * crasha subito, qualunque messaggio d'errore stampato da wine andava
 * perso per sempre — nessun log, nessuna possibilità per la Knowledge
 * Base o l'AI Advisor di vederlo.
 *
 * Se logPath è fornito, stdout+stderr vengono aperti come file descriptor
 * su quel percorso (append) invece che ignorati — passati direttamente a
 * spawn() come fd numerici, non come stream Node: evita completamente il
 * problema di backpressure di una pipe Node non consumata (il processo è
 * detached e vive ben oltre la vita di questo modulo, non avremmo comunque
 * un buon momento per drenare uno stream). Il chiamante (gameManager.ts)
 * decide poi, in base a quanto rapidamente il processo termina, se questo
 * contenuto va promosso a un evento 'launch-error' (vedi
 * startGameExitPolling).
 */
function spawnDetached(bin: string, args: string[], env: Record<string, string> = {}, cwd?: string, logPath?: string): { pid: number } {
  const { cwd: cwdFromEnv, ...cleanEnv } = env as any;
  const resolvedCwd = cwd ?? cwdFromEnv;

  let stdio: 'ignore' | [any, any, any] = 'ignore';
  if (logPath) {
    try {
      mkdirSync(path.dirname(logPath), { recursive: true });
      const fd = openSync(logPath, 'a');
      stdio = ['ignore', fd, fd];
    } catch (e) {
      // Se anche solo l'apertura del file fallisce (permessi, disco
      // pieno), non deve mai impedire il lancio del gioco stesso — si
      // ripiega sul comportamento precedente (scartato), non un crash.
      writeLog('warning', `[LAUNCH] Could not open launch log ${logPath}: ${e} — stdout/stderr not captured for this launch.`);
      stdio = 'ignore';
    }
  }

  const child = spawn(bin, args, {
    detached: true,
    stdio,
    env: { ...process.env, ...cleanEnv },
    ...(resolvedCwd ? { cwd: resolvedCwd } : {}),
  });
  child.unref();
  return { pid: child.pid ?? 0 };
}

/**
 * v0.99.90 — percorso del file di log per un singolo lancio, in una
 * cartella dedicata separata dai log generali del daemon (quelli passano
 * da logger.ts/LogPanel.tsx — questi sono per-lancio, potenzialmente
 * voluminosi, e destinati solo a essere letti programmaticamente in caso
 * di uscita rapida sospetta, non mostrati di default nell'interfaccia).
 */
export function gameLaunchLogPath(gameId: string): string {
  const dir = path.join(DATA_DIR, 'game-logs');
  return path.join(dir, `${gameId}-${Date.now()}.log`);
}

function binaryExists(bin: string): boolean {
  if (bin.startsWith('/')) return existsSync(bin);
  try {
    execSync(`which ${bin}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Restituisce il path assoluto del binario o null se non trovato */
function resolveBinaryPath(bin: string): string | null {
  if (bin.startsWith('/')) return existsSync(bin) ? bin : null;
  try {
    return execSync(`which ${bin}`, { encoding: 'utf-8' }).trim() || null;
  } catch {
    return null;
  }
}

function getBinaryVersion(bin: string, flag = '--version'): string {
  try {
    return execSync(`${bin} ${flag} 2>&1`).toString().split('\n')[0].trim();
  } catch {
    return 'n/a';
  }
}

/**
 * Risolve un path relativo (con backslash Windows) rispetto a una base,
 * confrontando i segmenti in modo case-insensitive sul filesystem Linux.
 * Usato per launchCwd e executablePath provenienti da goggame-*.info.
 */
function resolveCaseInsensitive(base: string, relPath: string): string {
  const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
  let current = base;
  for (const part of parts) {
    if (!existsSync(current)) return path.join(base, relPath.replace(/\\/g, '/'));
    const entries = readdirSync(current);
    const match = entries.find(e => e.toLowerCase() === part.toLowerCase());
    if (!match) return path.join(base, relPath.replace(/\\/g, '/'));
    current = path.join(current, match);
  }
  return current;
}

// ---------------------------------------------------------------------------
// WineRunner
// ---------------------------------------------------------------------------

/**
 * resolveLaunchCwd — v1.1.101-dev.1. Estratta dalla logica (corretta) che
 * WineRunner aveva già, per essere condivisa anche da ProtonRunner: prima
 * quest'ultimo passava sempre cwd:undefined a spawnDetached, ereditando
 * la cwd del daemon Node invece di quella del gioco — bug reale trovato
 * dall'utente (cache DXVK scritta nella cartella del progetto invece che
 * accanto all'eseguibile).
 */
function resolveLaunchCwd(exePath: string, configCwd?: string): string {
  const exeDir = path.dirname(exePath);
  if (!configCwd) return exeDir;

  const expandedCwd = expandHome(configCwd);
  let cwd: string;
  if (path.isAbsolute(expandedCwd) && existsSync(expandedCwd)) {
    cwd = expandedCwd;
  } else if (path.isAbsolute(expandedCwd)) {
    cwd = existsSync(expandedCwd) ? expandedCwd : resolveCaseInsensitive(exeDir, path.basename(expandedCwd));
  } else {
    cwd = resolveCaseInsensitive(exeDir, expandedCwd);
  }

  if (!existsSync(cwd)) {
    writeLog('warning', `[LAUNCH] launchCwd not found: ${cwd} — using exe directory`);
    return exeDir;
  }
  return cwd;
}

/**
 * v1.5.7-dev.1 — funzioni condivise estratte da WineRunner/ProtonRunner/
 * launchEpicViaLegendary (audit qualità del codice, punto E): la stessa
 * traduzione configurazione→variabili d'ambiente era scritta tre volte
 * quasi identica — dimenticata due volte in questa stessa sessione in un
 * quarto punto di lancio (MangoHud/FSR/GameMode mancanti in ProtonRunner
 * e nel percorso Epic via legendary). Centralizzata qui per eliminare
 * strutturalmente il rischio che succeda una terza volta.
 */

/** FSR — variabile Wine/DXVK generica, funziona identica sotto Wine e Proton. */
function applyFsrEnv(env: Record<string, string>, config?: RunnerConfig): void {
  if (config?.fsr) {
    env.WINE_FULLSCREEN_FSR        = '1';
    env.WINE_FULLSCREEN_FSR_STRENGTH = '2';
  }
}

/** MangoHud a 3 livelli (spento/compatta/completa) — v1.1.104-dev.1. */
function applyMangoHudEnv(env: Record<string, string>, config: RunnerConfig | undefined, logPrefix: string): void {
  if (config?.mangohud) {
    if (binaryExists('mangohud')) {
      env.MANGOHUD      = '1';
      env.MANGOHUD_DLSYM = '1';
      if (config.mangohud === 2) env.MANGOHUD_CONFIG = 'preset=4';
    } else {
      writeLog('warning', `[${logPrefix}] MangoHud requested but not found — install mangohud`);
    }
  }
}

/**
 * EAC/BattlEye — SOLO Proton: le variabili PROTON_EAC_RUNTIME/
 * PROTON_BATTLEYE_RUNTIME le legge solo lo script di avvio di Proton
 * (verificato con una segnalazione diretta di uno sviluppatore su
 * GitHub — v1.5.3-dev.1). Chiamare solo dai punti Proton, mai da
 * WineRunner (dove non ha mai avuto effetto reale).
 */
function applyProtonAnticheatEnv(env: Record<string, string>, config: RunnerConfig | undefined, logPrefix: string): void {
  if (config?.eac) {
    const eacPath = execSync('find /usr/share/steam /home -name "eac_runtime" -type d 2>/dev/null | head -1',
      { encoding: 'utf-8', timeout: 3000 }).trim();
    if (eacPath) env.PROTON_EAC_RUNTIME = eacPath;
    else writeLog('warning', `[${logPrefix}] EAC runtime not found`);
  }
  if (config?.battleye) {
    const bePath = execSync('find /usr/share/steam /home -name "battleye_runtime" -type d 2>/dev/null | head -1',
      { encoding: 'utf-8', timeout: 3000 }).trim();
    if (bePath) env.PROTON_BATTLEYE_RUNTIME = bePath;
    else writeLog('warning', `[${logPrefix}] BattlEye runtime not found`);
  }
}

/** GameMode — wrapper generico, avvolge indifferentemente wine o proton. */
function resolveGameModeWrapping(config: RunnerConfig | undefined, logPrefix: string): boolean {
  const useGameMode = !!(config?.gameMode && binaryExists('gamemoderun'));
  if (config?.gameMode && !binaryExists('gamemoderun')) {
    writeLog('warning', `[${logPrefix}] GameMode requested but gamemoderun not found — install gamemode`);
  }
  return useGameMode;
}

/**
 * v2.0.41-dev.25 — legge la risoluzione REALMENTE attiva del monitor via
 * `xrandr` (riga con l'asterisco accanto alla modalità corrente, sotto
 * l'output connesso — verificato: xrandr è lo strumento standard su
 * X11/XFCE, lo stack di questo progetto, nessuna libreria aggiuntiva
 * richiesta). La riga "Screen 0: ... current 2560 x 1440 ..." in cima
 * all'output NON viene confusa con questa: quella ha spazi attorno alla
 * "x" ("2560 x 1440"), le righe di modalità no ("2560x1440") — il
 * pattern usato richiede "x" senza spazi, quindi non serve escluderla
 * esplicitamente. Nessuna cache: chiamata solo al momento del lancio,
 * non in un ciclo caldo.
 *
 * v2.0.41-dev.27 — BUG REALE confermato su hardware reale dall'utente:
 * con più monitor collegati (nel suo caso un 27" principale a
 * 2560×1440 e un secondo schermo a 2160×1440), prendere il primo
 * asterisco trovato in TUTTO l'output di xrandr non distingue quale
 * sia il monitor principale — ha preso la risoluzione del secondario
 * (2160×1440, combaciava esattamente col comando osservato dall'utente
 * nel log reale), molto probabilmente aprendo Gamescope su uno schermo
 * diverso da quello che l'utente stava guardando. Ora si individua
 * prima il blocco dell'output marcato "primary" da xrandr stesso
 * (fallback al primo output "connected" trovato se nessuno è marcato
 * primary — alcuni driver/window manager non lo riportano), e si
 * cerca l'asterisco SOLO dentro quel blocco, non nell'intero testo.
 */
function detectMonitorResolution(): { width: number; height: number } | null {
  try {
    const out = execSync('xrandr --current', { encoding: 'utf-8' });
    const lines = out.split('\n');
    let startIdx = lines.findIndex(l => /\bconnected\b/.test(l) && /\bprimary\b/.test(l));
    if (startIdx === -1) {
      startIdx = lines.findIndex(l => /\bconnected\b/.test(l) && !/\bdisconnected\b/.test(l));
    }
    if (startIdx === -1) return null;
    let endIdx = lines.findIndex((l, i) => i > startIdx && /\b(dis)?connected\b/.test(l));
    if (endIdx === -1) endIdx = lines.length;
    const block = lines.slice(startIdx, endIdx).join('\n');
    const match = block.match(/(\d+)x(\d+)\s+[\d.]+\*/);
    if (match) {
      return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    }
  } catch {
    // xrandr non disponibile o sessione non X11 — nessun dato, il
    // chiamante ripiega sul default di Gamescope stesso.
  }
  return null;
}

/**
 * v2.0.41-dev.24/25 — Gamescope: micro-compositore Wayland pensato per
 * sessioni gaming/console, avvolge il comando FINALE (dopo un eventuale
 * GameMode/umu-run già applicato) — va sempre lo strato più esterno,
 * per costruzione: `gamescope [opzioni] -- <tutto il resto>`. Stesso
 * principio di resolveGameModeWrapping sopra, ma restituisce
 * direttamente la coppia bin/args finale invece di un solo booleano.
 *
 * 4 stati (0-3), non un semplice on/off — verificato su hardware reale
 * dall'utente: Gamescope senza argomenti parte IN FINESTRA a 1280×720
 * (default reale del programma, non la risoluzione del monitor) — un
 * booleano da solo non copriva "voglio schermo intero alla risoluzione
 * vera del mio monitor" in modo affidabile.
 */
function resolveGamescopeWrapping(
  launchBin: string,
  launchArgs: string[],
  config: RunnerConfig | undefined,
  logPrefix: string,
): { bin: string; args: string[] } {
  const level = config?.gamescope ?? 0;
  if (!level) return { bin: launchBin, args: launchArgs };
  if (!binaryExists('gamescope')) {
    writeLog('warning', `[${logPrefix}] Gamescope requested but not found — install gamescope`);
    return { bin: launchBin, args: launchArgs };
  }

  const gamescopeArgs: string[] = [];
  if (level === 1) {
    // Schermo intero, risoluzione rilevata automaticamente.
    const res = detectMonitorResolution();
    if (res) {
      // v2.0.41-dev.27 — log esplicito della risoluzione realmente
      // usata: unico modo per diagnosticare da remoto un rilevamento
      // sbagliato su un setup multi-monitor come quello che ha appena
      // rivelato il bug corretto sopra, senza dover chiedere ogni
      // volta all'utente di lanciare xrandr a mano.
      writeLog('launch', `[${logPrefix}] Gamescope: risoluzione monitor rilevata ${res.width}x${res.height}.`);
      gamescopeArgs.push('-W', String(res.width), '-H', String(res.height));
    } else {
      writeLog('warning', `[${logPrefix}] Gamescope: risoluzione monitor non rilevata (xrandr) — uso il default di Gamescope stesso.`);
    }
    gamescopeArgs.push('-f');
  } else if (level === 2) {
    // Schermo intero, override fisso 4K (utile per il downsampling da
    // un monitor più piccolo — stesso caso d'uso della guida ufficiale
    // Gamescope).
    gamescopeArgs.push('-W', '3840', '-H', '2160', '-f');
  } else if (level === 3) {
    // In finestra — dimensionata alla risoluzione del monitor se nota
    // (altrimenti il default di Gamescope stesso), MAI -f.
    const res = detectMonitorResolution();
    if (res) {
      writeLog('launch', `[${logPrefix}] Gamescope: risoluzione monitor rilevata ${res.width}x${res.height}.`);
      gamescopeArgs.push('-W', String(res.width), '-H', String(res.height));
    }
  }

  return { bin: 'gamescope', args: [...gamescopeArgs, '--', launchBin, ...launchArgs] };
}

export class WineRunner extends BaseRunner {
  readonly id = 'Wine-Lutris';
  readonly name = 'Wine (Lutris Build)';

  async launch(game: Game, config?: RunnerConfig) {
    const wineBin = resolveBinaryPath('wine-lutris') ?? resolveBinaryPath('wine');
    if (!wineBin) {
      return { success: false, message: `Wine non trovato. Installa con: sudo pacman -S wine` };
    }
    if (!game.executablePath) {
      return { success: false, message: `Nessun percorso eseguibile per ${game.title}` };
    }

    const prefix  = expandHome(config?.prefix ?? `~/.local/share/wineprefixes/${game.id}`);
    const exePath = expandHome(game.executablePath);

    const cwd = resolveLaunchCwd(exePath, config?.cwd);

    const env: Record<string, string> = {
      WINEPREFIX:  prefix,
      WINEDEBUG:   '-all',
      DXVK_ASYNC:  '1',
      ...(config?.env ?? {}),
    };

    // v1.5.7-dev.1 — FSR/MangoHud/GameMode: funzioni condivise, vedi
    // commento sopra WineRunner. Stessa identica logica di prima, solo
    // centralizzata invece di duplicata in tre punti.
    applyFsrEnv(env, config);
    applyMangoHudEnv(env, config, 'WINE');

    // v1.5.3-dev.1 — RIMOSSO il blocco EAC/BattlEye che viveva qui: le
    // variabili PROTON_EAC_RUNTIME/PROTON_BATTLEYE_RUNTIME sono lette
    // SOLO dallo script di avvio di Proton — con wine puro non hanno mai
    // avuto alcun effetto reale (verificato con una segnalazione diretta
    // di uno sviluppatore su GitHub: "WINE just tries to load the game's
    // battleye, which is the windows one" — nessun modo di redirigerlo
    // verso un runtime Linux sotto wine puro, limite reale dell'anti-
    // cheat su Linux, non una scelta di questo progetto). Spostato in
    // ProtonRunner sotto, l'unico posto dove ha effetto reale. La UI
    // disabilita questi due toggle quando il runner selezionato non è
    // Proton, invece di lasciarli sembrare attivi senza esserlo.
    const useGameMode = resolveGameModeWrapping(config, 'WINE');

    const launchBin  = useGameMode ? 'gamemoderun' : wineBin;
    const launchArgs = useGameMode
      ? [wineBin, exePath, ...(config?.args ?? [])]
      : [exePath, ...(config?.args ?? [])];

    // v2.0.41-dev.24 — Gamescope, sempre l'ultimo strato applicato
    // (avvolge quello che c'è già, GameMode incluso se attivo).
    const gamescopeWrap = resolveGamescopeWrapping(launchBin, launchArgs, config, 'WINE');

    writeLog('launch', `[WINE] WINEPREFIX=${prefix} cwd=${cwd} ${gamescopeWrap.bin} ${gamescopeWrap.args.join(' ')}`);
    const logPath = gameLaunchLogPath(game.id);
    const { pid } = spawnDetached(gamescopeWrap.bin, gamescopeWrap.args, { ...env, cwd } as any, undefined, logPath);
    return { success: true, pid, message: `Launched via ${gamescopeWrap.bin === 'gamescope' ? `Gamescope + ${launchBin}` : launchBin} (prefix: ${prefix})`, logPath };
  }

  async isAvailable() { return binaryExists('wine-lutris') || binaryExists('wine'); }
  async version() {
    const bin = binaryExists('wine-lutris') ? 'wine-lutris' : 'wine';
    return getBinaryVersion(bin);
  }
}

// ---------------------------------------------------------------------------
// ProtonRunner
// ---------------------------------------------------------------------------

/**
 * v0.99.38 — estratta da ProtonRunner.findProtonBin (che ora la richiama)
 * per essere riusabile anche da downloadManager.ts: l'installazione deve
 * poter risolvere lo stesso binario Proton che verrà usato al lancio, per
 * inizializzare la prefix nel punto che Proton stesso si aspetterà di
 * trovare (vedi resolveRunnerWineEnv in downloadManager.ts) invece di
 * creare sempre una prefix "alla wine normale" indipendentemente dal
 * runner scelto nell'overlay.
 */
export function resolveProtonBin(runnerId: string): string | null {
  const candidates = [
    `${homedir()}/.steam/steam/steamapps/common/${runnerId}/proton`,
    `${homedir()}/.local/share/Steam/steamapps/common/${runnerId}/proton`,
    `${homedir()}/.local/share/Steam/compatibilitytools.d/${runnerId}/proton`,
  ];
  for (const p of candidates) { if (existsSync(p)) return p; }
  return null;
}

export class ProtonRunner extends BaseRunner {
  constructor(public readonly id: string, public readonly name: string) { super(); }

  private findProtonBin(): string | null {
    return resolveProtonBin(this.id);
  }

  async launch(game: Game, config?: RunnerConfig) {
    // Giochi Steam nativi: delega URI a Steam direttamente
    if (game.steamAppId) {
      if (!binaryExists('steam')) return { success: false, message: 'Steam non trovato.' };
      writeLog('launch', `[PROTON] steam steam://run/${game.steamAppId}`);
      const { pid } = spawnDetached('steam', [`steam://run/${game.steamAppId}`]);
      return { success: true, pid, message: `Steam launch: ${game.title}` };
    }

    const protonBin = this.findProtonBin();
    if (!protonBin) {
      return { success: false, message: `Proton "${this.id}" non trovato. Installalo via Steam o ProtonUp-Qt.` };
    }
    if (!game.executablePath) {
      return { success: false, message: `Nessun eseguibile per ${game.title}` };
    }

    const prefix = expandHome(config?.prefix ?? `~/.local/share/proton-prefixes/${game.id}`);
    const env: Record<string, string> = {
      STEAM_COMPAT_DATA_PATH: prefix,
      STEAM_COMPAT_CLIENT_INSTALL_PATH: `${homedir()}/.local/share/Steam`,
      DXVK_ASYNC: '1',
      // v1.5.20-dev.31 — BUG REALE CONFERMATO, causa già diagnosticata
      // in una sessione precedente ma mai realmente corretta (verificato
      // nel sorgente reale di Proton allora — vedi CHANGELOG.md, sezione
      // sulla saga "finestra nera" — accantonato perché non era la causa
      // di QUEL sintomo, mai cablato nel codice reale, restato solo come
      // opzione manuale in launch-debug.sh). Xalia (ponte accessibilità/
      // gamepad di Proton per app non native) può agganciare processi
      // nella stessa sessione Wine, innescando protezioni anti-manomissione
      // — stesso pattern confermato con una issue reale di Proton (Far
      // Cry 4, VMProtect + xalia.exe, spam EXCEPTION_SINGLE_STEP) e
      // riprodotto identico dal vivo con Assassin's Creed
      // Syndicate/UplayLaunch.exe condividendo la prefix di Ubisoft
      // Connect. Disattivato di default per ogni lancio Proton — nessuna
      // perdita per chi non usa strumenti di accessibilità per giocare,
      // un rischio di crash in meno per chi condivide una prefix.
      PROTON_USE_XALIA: '0',
      ...(config?.env ?? {}),
    };

    // v1.5.7-dev.1 — FSR/MangoHud/EAC-BattlEye/GameMode: funzioni
    // condivise, vedi commento sopra WineRunner. Stessa identica logica
    // di prima (v1.5.3-dev.1), solo centralizzata invece di duplicata.
    applyFsrEnv(env, config);
    applyMangoHudEnv(env, config, 'PROTON');
    applyProtonAnticheatEnv(env, config, 'PROTON');
    const useGameMode = resolveGameModeWrapping(config, 'PROTON');

    const exePath = expandHome(game.executablePath);
    // v1.1.101-dev.1 — bug reale: prima passava sempre cwd:undefined a
    // spawnDetached, ereditando la cwd del daemon Node invece di quella
    // del gioco (cache DXVK finiva nella cartella progetto invece che
    // accanto all'eseguibile). Stessa resolveLaunchCwd già usata da
    // WineRunner sopra.
    const cwd = resolveLaunchCwd(exePath, config?.cwd);

    // v1.5.20-dev.1 — switch "Umu-launcher" (Compatibility Layer): rimpiazza
    // `<protonBin> run <exe>` con `umu-run <exe>`, che replica il container
    // Steam Linux Runtime (pressure-vessel) che Steam avvolge SEMPRE
    // attorno ai lanci Proton — anche per app non-Steam — e che il nostro
    // `proton run` diretto bypassa del tutto (causa reale del problema
    // "finestra nera dal secondo avvio" di Ubisoft Connect, vedi
    // CHANGELOG.md). Generalizzato: disponibile per QUALUNQUE gioco Proton,
    // non solo i launcher condivisi.
    //
    // WINEPREFIX punta a `<prefix>/pfx` — la vera prefix Wine, esattamente
    // dove resolveRunnerWineEnv/prepareWinePrefix (downloadManager.ts) la
    // creano già oggi per questo stesso runner: nessuna prefix separata,
    // nessuna migrazione, verificato leggendo il codice reale invece di
    // assumere. PROTONPATH è la cartella che CONTIENE il binario `proton`
    // (non il binario stesso — sintassi verificata su man umu/wiki
    // ufficiale). GAMEID è un id arbitrario (prefissato per non collidere
    // per errore con un vero id del database umu, che qui non serve:
    // nessun protonfix specifico applicato). PROTON_VERB non impostato:
    // `waitforexitandrun` è già il default di umu-run, stesso verbo che
    // userebbe Steam.
    //
    // NON ancora verificato su hardware reale se le variabili
    // STEAM_COMPAT_DATA_PATH/STEAM_COMPAT_CLIENT_INSTALL_PATH già presenti
    // in `env` (calcolate sopra per il percorso diretto) interferiscono con
    // la gestione interna del container fatta da umu-run — lasciate
    // invariate per ora, da confermare con un test reale prima di
    // considerare la feature definitiva.
    const umuRunBin = config?.umuRun ? resolveBinaryPath('umu-run') : null;
    if (config?.umuRun && !umuRunBin) {
      writeLog('warning', `[PROTON] Umu-launcher richiesto per ${game.title} ma umu-run non è installato — fallback al lancio Proton diretto.`);
    }

    let launchBin: string;
    let launchArgs: string[];
    if (umuRunBin) {
      env.WINEPREFIX = path.join(prefix, 'pfx');
      env.PROTONPATH = path.dirname(protonBin);
      env.GAMEID = `x-launcher-${game.id}`;
      const umuArgs = [exePath, ...(config?.args ?? [])];
      launchBin  = useGameMode ? 'gamemoderun' : umuRunBin;
      launchArgs = useGameMode ? [umuRunBin, ...umuArgs] : umuArgs;
      writeLog('launch', `[PROTON] (umu-run) ${launchBin} ${launchArgs.join(' ')}`);
    } else {
      // v1.5.3-dev.1 — useGameMode calcolato sopra ma mai applicato al
      // lancio vero e proprio: stesso schema "launchBin" già usato da
      // WineRunner, gamemoderun avvolge indifferentemente proton o wine.
      const protonArgs = ['run', exePath, ...(config?.args ?? [])];
      launchBin  = useGameMode ? 'gamemoderun' : protonBin;
      launchArgs = useGameMode ? [protonBin, ...protonArgs] : protonArgs;
      writeLog('launch', `[PROTON] ${launchBin} ${launchArgs.join(' ')}`);
    }
    // Step 19d — log diagnostico richiesto dall'utente durante il debug
    // del crash/finestra nera di Ubisoft Connect: dump di TUTTE le
    // variabili d'ambiente rilevanti (WINE*/DXVK*/VKD3D*/PROTON*/
    // STEAM_COMPAT*/D3D*/DXGI*) passate a questo lancio specifico, per
    // confrontarle riga per riga con un comando `wine` manuale che
    // funziona — invece di continuare a indovinare quale override
    // provare. Filtrato (non l'intero process.env, che include molto
    // rumore non pertinente) — un solo log per lancio, non per ogni riga.
    // v1.5.20-dev.1 — GAMEID aggiunto come alternativa esatta al filtro
    // (non un prefisso come le altre): rilevante solo per il ramo umu-run
    // sopra, assente — quindi innocuo — per il lancio diretto.
    const envDebugKeys = Object.keys(env).filter(k =>
      /^(WINE|DXVK|VKD3D|PROTON|STEAM_COMPAT|D3D|DXGI)/i.test(k) || /^GAMEID$/i.test(k)
    ).sort();
    writeLog('launch', `[PROTON-ENV] ${envDebugKeys.map(k => `${k}=${env[k]}`).join(' | ')}`);
    // v2.0.41-dev.24 — Gamescope, sempre l'ultimo strato applicato
    // (avvolge quello che c'è già, umu-run/GameMode inclusi se attivi).
    const gamescopeWrap = resolveGamescopeWrapping(launchBin, launchArgs, config, 'PROTON');
    const logPath = gameLaunchLogPath(game.id);
    const { pid } = spawnDetached(gamescopeWrap.bin, gamescopeWrap.args, env, cwd, logPath);
    return { success: true, pid, message: gamescopeWrap.bin === 'gamescope' ? `Launched via Gamescope + ${this.name}` : `Launched via ${this.name}`, logPath };
  }

  async isAvailable() { return this.findProtonBin() !== null || binaryExists('steam'); }
  async version() {
    const bin = this.findProtonBin();
    return bin ? getBinaryVersion(bin, '--version') : 'not installed';
  }
}

// ---------------------------------------------------------------------------
// Lancio Epic via legendary — v1.1.30
// ---------------------------------------------------------------------------

/**
 * v1.1.30 — bug reale confermato: alcuni titoli Epic con verifica di
 * proprietà EOS più severa (es. SIFU — vedi discussione PCGamingWiki
 * Talk:Sifu) rifiutano di avviarsi se l'eseguibile non riceve argomenti
 * di autenticazione specifici (un "exchangecode" valido, -EpicPortal,
 * -epicuserid, ecc.) — esattamente quello che solo il launcher ufficiale
 * o `legendary launch` sanno costruire correttamente al momento del
 * lancio. Il lancio diretto dell'exe via wine/proton (WineRunner/
 * ProtonRunner sopra) salta del tutto questo passaggio: funziona per
 * molti giochi Epic "semplici" (che non verificano il lancio in modo
 * severo), ma produce "Unable to detect if the game was launched
 * through the Epic Games Launcher" per gli altri.
 *
 * Fix: per lo store Epic, il lancio passa sempre da `legendary launch`
 * invece che dall'exe diretto — legendary gestisce lui l'autenticazione
 * EOS online (modalità di default, non --offline), ma continua a usare
 * il runner Wine/Proton già configurato dall'utente per QUESTO gioco
 * (stesso binario, stessa prefix) tramite i suoi flag `--wine`/
 * `--wine-prefix` (Wine) o `--no-wine --wrapper` (Proton) — verificati
 * da issue reali su GitHub legendary/Heroic, non ipotizzati. I giochi
 * che non hanno bisogno di questa verifica severa continuano a
 * funzionare identicamente: legendary si limita a lanciare lo stesso
 * eseguibile con lo stesso wine/proton, semplicemente passando anche gli
 * argomenti EOS che quei titoli ignorano se non li richiedono.
 */
/**
 * v2.0.41-dev.31 — richiesta utente, causa reale confermata: Gamescope
 * NON deve avvolgere `legendary` dall'esterno per i giochi Epic —
 * verificato con report reali (issue Gamescope #1557/#1516/#1665,
 * stesso identico sintomo "Primary child shut down!" con processi wine
 * ancora vivi dopo) e con la documentazione ufficiale di Heroic Games
 * Launcher (usa `legendary` internamente esattamente come noi): il modo
 * corretto è passare Gamescope COME wrapper a legendary
 * (`--wrapper "gamescope ... -- <comando reale>"`), non come involucro
 * esterno dell'intero comando legendary. Motivo verificato: `legendary`
 * avvia il proprio wrapper come FIGLIO e poi esce subito da solo (il
 * suo lavoro finisce lì, comportamento normale) — se Gamescope avvolge
 * legendary dall'esterno, lo considera il proprio "figlio primario" e
 * si chiude nell'istante in cui legendary esce, DISTRUGGENDO la
 * sessione nidificata mentre il vero gioco (nipote di Gamescope, non
 * figlio diretto) sta ancora avviandosi al suo interno.
 *
 * Restituisce una STRINGA pronta per essere incorporata dentro
 * l'argomento --wrapper (non una coppia bin/args come
 * resolveGamescopeWrapping, usata per gli altri runner) — stringa
 * vuota se Gamescope non è attivo per questo lancio.
 */
function buildGamescopePrefixString(config: RunnerConfig | undefined, logPrefix: string): string {
  const level = config?.gamescope ?? 0;
  if (!level) return '';
  if (!binaryExists('gamescope')) {
    writeLog('warning', `[${logPrefix}] Gamescope requested but not found — install gamescope`);
    return '';
  }
  const parts: string[] = ['gamescope'];
  if (level === 1) {
    const res = detectMonitorResolution();
    if (res) {
      writeLog('launch', `[${logPrefix}] Gamescope: risoluzione monitor rilevata ${res.width}x${res.height}.`);
      parts.push('-W', String(res.width), '-H', String(res.height));
    } else {
      writeLog('warning', `[${logPrefix}] Gamescope: risoluzione monitor non rilevata (xrandr) — uso il default di Gamescope stesso.`);
    }
    parts.push('-f');
  } else if (level === 2) {
    parts.push('-W', '3840', '-H', '2160', '-f');
  } else if (level === 3) {
    const res = detectMonitorResolution();
    if (res) {
      writeLog('launch', `[${logPrefix}] Gamescope: risoluzione monitor rilevata ${res.width}x${res.height}.`);
      parts.push('-W', String(res.width), '-H', String(res.height));
    }
  }
  parts.push('--');
  return parts.join(' ');
}

export async function launchEpicViaLegendary(game: Game, runner: BaseRunner, config?: RunnerConfig) {
  const legendaryBin = resolveBinaryPath('legendary');
  if (!legendaryBin) {
    return { success: false, message: 'legendary non trovato. Installalo con: sudo pacman -S legendary (o yay -S legendary-git)' };
  }

  // L'AppName di legendary è l'id senza il prefisso "epic-" che X-Launcher
  // usa internamente — stessa estrazione già usata altrove (uninstallGame,
  // resolveEpicExe).
  const appName = game.id.replace(/^epic-/, '');
  const isProton = runner instanceof ProtonRunner;

  const args: string[] = ['launch', appName];
  const env: Record<string, string> = { ...(config?.env ?? {}) };

  // v1.5.7-dev.1 — MangoHud/FSR: funzioni condivise, vedi commento
  // sopra WineRunner. Prima duplicati qui (v1.5.2/v1.5.3-dev.1) perché
  // questa funzione non passa dai due runner diretti (sempre via
  // legendary launch, vedi commento v1.1.30 più sotto).
  applyMangoHudEnv(env, config, 'EPIC');
  applyFsrEnv(env, config);

  if (isProton) {
    const protonBin = resolveProtonBin(runner.id);
    if (!protonBin) {
      return { success: false, message: `Proton "${runner.id}" non trovato. Installalo via Steam o ProtonUp-Qt.` };
    }
    const prefix = expandHome(config?.prefix ?? `~/.local/share/proton-prefixes/${game.id}`);

    // v1.5.20-dev.31 — stesso fix appena aggiunto a ProtonRunner.launch()
    // (vedi commento esteso lì per il perché), qui perché questa funzione
    // costruisce il proprio ambiente Proton separatamente (non passa da
    // ProtonRunner.launch(), sempre via legendary — v1.1.30). `?? '0'`
    // invece di un'assegnazione diretta: se l'utente ha esplicitamente
    // impostato PROTON_USE_XALIA nel proprio ambiente personalizzato
    // (Game Options), quella scelta vince sempre — mai sovrascritta.
    env.PROTON_USE_XALIA = env.PROTON_USE_XALIA ?? '0';

    // v1.5.20-dev.4 — switch "Umu-launcher": stesso principio già applicato
    // a ProtonRunner.launch(), qui per il percorso Epic via legendary
    // (esplicitamente lasciato fuori scope in v1.5.20-dev.1 perché la
    // combinazione legendary+umu-run non era ancora stata verificata).
    // Confermato ora che è una combinazione reale e supportata: Heroic
    // Games Launcher offre "Use UMU as Proton runtime" per i titoli Epic
    // esattamente tramite questo stesso meccanismo --wrapper di legendary
    // (non un'estensione nostra — verificato con issue reali Heroic su
    // GitHub prima di scrivere questo, stesso rigore del resto del file).
    const umuRunBin = config?.umuRun ? resolveBinaryPath('umu-run') : null;
    if (config?.umuRun && !umuRunBin) {
      writeLog('warning', `[EPIC] Umu-launcher richiesto per ${game.title} ma umu-run non è installato — fallback al wrapper Proton diretto.`);
    }

    if (umuRunBin) {
      // Stesso identico schema WINEPREFIX/PROTONPATH/GAMEID di
      // ProtonRunner.launch() — qui passato come --wrapper a legendary
      // invece che invocato direttamente, legendary si limita a
      // prependere questo wrapper davanti a <exe> [argomenti EOS] esattamente
      // come faceva finora con "'<proton>' run" (nessun'altra differenza
      // nel resto del flusso legendary/EOS sotto).
      //
      // v2.0.41-dev.31 — Gamescope (se attivo) incorporato QUI, dentro
      // la stringa --wrapper insieme a umu-run — vedi commento esteso
      // su buildGamescopePrefixString sopra per il perché non va mai
      // applicato come involucro esterno dell'intero comando legendary.
      const gamescopePrefixEpic = buildGamescopePrefixString(config, 'EPIC');
      args.push('--no-wine', '--wrapper', gamescopePrefixEpic ? `${gamescopePrefixEpic} ${umuRunBin}` : umuRunBin);
      env.WINEPREFIX = path.join(prefix, 'pfx');
      env.PROTONPATH = path.dirname(protonBin);
      env.GAMEID = `x-launcher-${game.id}`;
    } else {
      // Sintassi verificata (issue reali Heroic/legendary su GitHub):
      // --no-wine dice a legendary di non cercare un wine proprio,
      // --wrapper delega l'intero avvio a "<proton> run", che si aspetta
      // STEAM_COMPAT_DATA_PATH nell'ambiente — non WINEPREFIX diretto,
      // stesso principio già scoperto per il bug prefix Proton in v1.0.0.
      //
      // v2.0.41-dev.31 — stesso identico principio del ramo umu-run
      // sopra: Gamescope (se attivo) incorporato dentro questa stessa
      // stringa --wrapper, mai come involucro esterno di legendary.
      const gamescopePrefixEpic2 = buildGamescopePrefixString(config, 'EPIC');
      args.push('--no-wine', '--wrapper', gamescopePrefixEpic2 ? `${gamescopePrefixEpic2} '${protonBin}' run` : `'${protonBin}' run`);
      env.STEAM_COMPAT_DATA_PATH = prefix;
      env.STEAM_COMPAT_CLIENT_INSTALL_PATH = `${homedir()}/.local/share/Steam`;
    }

    // v1.5.7-dev.1 — EAC/BattlEye: funzione condivisa, vedi commento
    // sopra WineRunner. Funzionano SOLO qui (ramo Proton), mai sotto
    // wine puro — verificato v1.5.3-dev.1. Invariato dal ramo umu-run
    // sopra: sono variabili lette dallo script Proton stesso, che
    // umu-run invoca comunque al suo interno.
    applyProtonAnticheatEnv(env, config, 'EPIC');
  } else {
    const wineBin = resolveBinaryPath('wine-lutris') ?? resolveBinaryPath('wine');
    if (!wineBin) {
      return { success: false, message: 'Wine non trovato. Installa con: sudo pacman -S wine' };
    }
    const prefix = expandHome(config?.prefix ?? `~/.local/share/wineprefixes/${game.id}`);
    args.push('--wine', wineBin, '--wine-prefix', prefix);
  }

  // Argomenti di lancio del gioco (Launch Arguments dell'overlay) — dopo
  // "--", passati da legendary al gioco stesso, non a legendary.
  if (config?.args && config.args.length > 0) {
    args.push('--', ...config.args);
  }

  // v1.5.7-dev.1 — GameMode: funzione condivisa, vedi commento sopra
  // WineRunner. Avvolge l'intero comando legendary (che a sua volta
  // lancia proton/wine al suo interno) — stesso schema "launchBin" già
  // usato da WineRunner/ProtonRunner.
  const useGameMode = resolveGameModeWrapping(config, 'EPIC');
  const launchBin  = useGameMode ? 'gamemoderun' : legendaryBin;
  const launchArgs = useGameMode ? [legendaryBin, ...args] : args;

  writeLog('launch', `[EPIC] ${launchBin} ${launchArgs.join(' ')}`);
  // v2.0.41-dev.31 — Gamescope: per i rami Proton (isProton===true) è
  // già stato incorporato PIÙ SOPRA dentro l'argomento --wrapper (vedi
  // buildGamescopePrefixString) — applicarlo ANCHE qui, come involucro
  // esterno dell'intero comando legendary, lo farebbe scattare due
  // volte e reintrodurrebbe esattamente il bug appena corretto (Gamescope
  // tratterebbe di nuovo `legendary` come proprio figlio primario). Va
  // saltato qui SOLO per quel motivo — resta invariato per il ramo wine
  // puro (!isProton), mai verificato per questo bug specifico, nessuna
  // modifica lì finché non c'è un caso reale da correggere.
  const gamescopeWrap = isProton
    ? { bin: launchBin, args: launchArgs }
    : resolveGamescopeWrapping(launchBin, launchArgs, config, 'EPIC');
  const logPath = gameLaunchLogPath(game.id);
  const { pid } = spawnDetached(gamescopeWrap.bin, gamescopeWrap.args, env, undefined, logPath);
  // v2.0.41-dev.31 — gamescopeWrap.bin === 'gamescope' non basta più a
  // rilevare Gamescope attivo per i rami Proton (ora incorporato dentro
  // --wrapper, mai il binario esterno) — controllo diretto sul livello
  // configurato invece.
  const gamescopeActive = (config?.gamescope ?? 0) > 0;
  return { success: true, pid, message: gamescopeActive ? `Launched via Gamescope + legendary (${runner.name})` : `Launched via legendary (${runner.name})`, logPath };
}

export class DOSBoxRunner extends BaseRunner {
  readonly id = 'DOSBox';
  readonly name = 'DOSBox Staging';
  private get bin() { return binaryExists('dosbox-staging') ? 'dosbox-staging' : 'dosbox'; }

  async launch(game: Game, config?: RunnerConfig) {
    if (!binaryExists(this.bin)) {
      return { success: false, message: `DOSBox non trovato. Installa con: sudo apt install dosbox-staging` };
    }

    const args: string[] = [];
    if (game.executablePath) {
      const dir = path.dirname(expandHome(game.executablePath));
      const exe = path.basename(game.executablePath);
      args.push('-c', `mount C "${dir}"`, '-c', 'C:', '-c', exe, '-c', 'exit');
    }
    if (game.dosboxConf) args.push('-conf', expandHome(game.dosboxConf));
    args.push(...(config?.args ?? []));

    writeLog('launch', `[DOSBOX] ${this.bin} ${args.join(' ')}`);
    const { pid } = spawnDetached(this.bin, args);
    return { success: true, pid, message: `DOSBox session active` };
  }

  async isAvailable() { return binaryExists('dosbox-staging') || binaryExists('dosbox'); }
  async version() { return getBinaryVersion(this.bin); }
}

// ---------------------------------------------------------------------------
// RetroArchRunner
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// RetroArch — helper per rilevare binary e core indipendentemente
// dall'installazione (pacman, flatpak, snap, AppImage, path manuale)
// ---------------------------------------------------------------------------

/**
 * Cerca il binary retroarch in tutti i contesti di installazione noti.
 * Restituisce il comando da usare (stringa) o null se non trovato.
 *
 * Ordine di preferenza:
 *   1. retroarch nel PATH di sistema (pacman / apt / portage)
 *   2. wrapper flatpak org.libretro.RetroArch
 *   3. path assoluti comuni (AppImage, installazioni manuali)
 */
function findRetroarchBin(): string | null {
  // Prova prima nel PATH ereditato dal processo
  if (binaryExists('retroarch')) {
    writeLog('launch', '[RETROARCH] Found in system PATH');
    return 'retroarch';
  }

  // PATH del daemon (systemd) può essere diverso da quello dell'utente.
  // Cerca nei path assoluti comuni di Arch Linux e altre distro.
  const absoluteCandidates = [
    '/usr/bin/retroarch',
    '/usr/local/bin/retroarch',
    '/bin/retroarch',
    `${homedir()}/.local/bin/retroarch`,
    '/opt/retroarch/bin/retroarch',
    '/opt/RetroArch/retroarch',
  ];
  for (const p of absoluteCandidates) {
    if (existsSync(p)) {
      writeLog('launch', `[RETROARCH] Found absolute path: ${p}`);
      return p;
    }
  }

  // Flatpak come ultima risorsa
  try {
    execSync('flatpak info org.libretro.RetroArch', { stdio: 'ignore' });
    writeLog('launch', '[RETROARCH] Found as flatpak');
    return 'flatpak run org.libretro.RetroArch';
  } catch {}

  // Log diagnostico: mostra il PATH visto dal daemon
  writeLog('warning', `[RETROARCH] Not found. Daemon's PATH: ${process.env.PATH}`);
  return null;
}

/**
 * Restituisce tutte le directory dove cercare i core libretro,
 * incluse quelle specifiche per flatpak.
 */
function getCoreDirs(): string[] {
  return [
    // Installazioni utente (priorità)
    `${homedir()}/.config/retroarch/cores`,
    `${homedir()}/.local/share/retroarch/cores`,
    // Flatpak — container con path fisso
    `${homedir()}/.var/app/org.libretro.RetroArch/config/retroarch/cores`,
    // Pacchetti di sistema
    '/usr/lib/libretro',
    '/usr/lib64/libretro',
    '/usr/share/libretro/cores',
  ];
}

export class RetroArchRunner extends BaseRunner {
  readonly id = 'RetroArch';
  readonly name = 'RetroArch (Libretro)';

  /**
   * Risolve il core a un percorso assoluto.
   *
   * Il classicPlugin salva solo il nome file del core (es. "genesis_plus_gx_libretro.so")
   * perché al momento della scansione non conosce il path di installazione.
   * RetroArch vuole il path assoluto con -L; passare solo il nome file lo avvia
   * senza core (comportamento silente: la ROM non parte).
   *
   * Logica:
   *   1. Path assoluto esistente → usalo così com'è
   *   2. Nome file → cerca in tutte le directory (incluse flatpak)
   *   3. Non trovato → passa il valore originale, RetroArch loggherà l'errore
   */
  private resolveCore(core: string): string {
    const expanded = expandHome(core);
    if (path.isAbsolute(expanded) && existsSync(expanded)) return expanded;

    const filename = path.basename(expanded);
    for (const dir of getCoreDirs()) {
      const candidate = path.join(dir, filename);
      if (existsSync(candidate)) {
        writeLog('launch', `[RETROARCH] Core resolved: ${filename} → ${candidate}`);
        return candidate;
      }
    }
    writeLog('warning', `[RETROARCH] Core not found: ${core} — passing original value`);
    return expanded;
  }

  async launch(game: Game, config?: RunnerConfig) {
    const bin = findRetroarchBin();
    if (!bin) {
      return { success: false, message: 'RetroArch non trovato. Installa con: sudo pacman -S retroarch' };
    }

    const resolvedCore = game.libretroCore ? this.resolveCore(game.libretroCore) : null;
    if (game.libretroCore && !resolvedCore) {
      writeLog('warning', `[RETROARCH] Launching without core: ${game.libretroCore} not found`);
    }

    // flatpak run non accetta argomenti con spazi come singola stringa:
    // va spawnato separando il comando dagli argomenti.
    const isFlatpak = bin.startsWith('flatpak ');
    const args: string[] = [];
    if (isFlatpak) args.push('run', 'org.libretro.RetroArch');
    args.push('--fullscreen');
    if (resolvedCore) args.push('-L', resolvedCore);
    if (game.executablePath) args.push(expandHome(game.executablePath));
    args.push(...(config?.args ?? []));

    const binExe = isFlatpak ? 'flatpak' : bin;
    const coreLabel = resolvedCore ? path.basename(resolvedCore).replace('_libretro.so', '') : 'core da DB RetroArch';
    writeLog('launch', `[RETROARCH] ${binExe} ${args.join(' ')}`);
    // Segnalato dall'utente (PSX/RetroArch): il gioco si chiudeva subito
    // "senza alcun log nel terminale" — non perché RetroArch non stampasse
    // nulla, ma perché spawnDetached() scarta stdout/stderr per default
    // quando non le viene passato un logPath esplicito (stdio: 'ignore').
    // Wine/Proton ed Epic (legendary) già lo fanno — RetroArch no, unico
    // runner rimasto scoperto insieme a ScummVM/DOSBox. Un errore di
    // RetroArch (BIOS mancante, core sbagliato, .cue non valido, ecc.)
    // sarebbe stato perfettamente visibile fin dall'inizio con questo log.
    const logPath = gameLaunchLogPath(game.id);
    const { pid } = spawnDetached(binExe, args, {}, undefined, logPath);
    return { success: true, pid, message: `RetroArch avviato (${isFlatpak ? 'flatpak' : 'system'}) — core: ${coreLabel}`, logPath };
  }

  async isAvailable() { return findRetroarchBin() !== null; }
  async version() {
    const bin = findRetroarchBin();
    if (!bin) return 'not installed';
    const cmd = bin.startsWith('flatpak ') ? 'flatpak run org.libretro.RetroArch' : bin;
    return getBinaryVersion(cmd, '--version');
  }
}

// ---------------------------------------------------------------------------
// SteamNativeRunner — Step 2
// Lancia giochi Steam tramite steam:// URI. Proton è gestito interamente
// da Steam; X-Launcher non tocca Proton direttamente per i giochi Steam.
// ---------------------------------------------------------------------------

export class SteamNativeRunner extends BaseRunner {
  readonly id = 'Steam Native';
  readonly name = 'Steam (Native)';

  async launch(game: Game, config?: RunnerConfig) {
    if (!binaryExists('steam')) {
      return { success: false, message: 'Steam non trovato nel PATH.' };
    }
    if (!game.steamAppId) {
      return { success: false, message: `Nessun Steam App ID per ${game.title}` };
    }
    writeLog('launch', `[STEAM] Launching via URI: steam://rungameid/${game.steamAppId}`);
    const { pid } = spawnDetached('steam', [`steam://rungameid/${game.steamAppId}`]);
    return { success: true, pid, message: `Steam: avvio ${game.title} (AppID ${game.steamAppId})` };
  }

  async isAvailable() { return binaryExists('steam'); }
  async version()     { return getBinaryVersion('steam', '--version'); }
}

// ---------------------------------------------------------------------------
// openSteamBigPicture — non è un runner, è un'utility chiamata dal server
// ---------------------------------------------------------------------------

export function openSteamBigPicture(): { success: boolean; message: string } {
  if (!binaryExists('steam')) {
    return { success: false, message: 'Steam non trovato nel PATH.' };
  }
  spawnDetached('steam', ['-gamepadui']);
  return { success: true, message: 'Steam Big Picture avviato.' };
}


export class ScummVMRunner extends BaseRunner {
  readonly id = 'ScummVM';
  readonly name = 'ScummVM';

  async launch(game: Game, config?: RunnerConfig) {
    if (!binaryExists('scummvm')) {
      return { success: false, message: `ScummVM non trovato. Installa con: sudo apt install scummvm` };
    }

    const args: string[] = ['--fullscreen'];
    if (game.scummvmId) {
      args.push(game.scummvmId);
    } else if (game.executablePath) {
      args.push('--path=' + expandHome(path.dirname(game.executablePath)));
    }
    args.push(...(config?.args ?? []));

    writeLog('launch', `[SCUMMVM] scummvm ${args.join(' ')}`);
    const { pid } = spawnDetached('scummvm', args);
    return { success: true, pid, message: `ScummVM engine active` };
  }

  async isAvailable() { return binaryExists('scummvm'); }
  async version() { return getBinaryVersion('scummvm', '--version'); }
}
