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

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function expandHome(p: string): string {
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
function gameLaunchLogPath(gameId: string): string {
  const dir = path.join(homedir(), '.local', 'share', 'x-launcher', 'game-logs');
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

    // launchCwd può essere un path relativo all'installPath (es. "ScummVM" o "scummvm").
    // Su Linux il filesystem è case-sensitive: usiamo resolveCaseInsensitive per trovare
    // la directory corretta indipendentemente dal case usato da innoextract/Windows.
    let cwd: string;
    if (config?.cwd) {
      const expandedCwd = expandHome(config.cwd);
      // Se è già assoluto e esiste, usalo direttamente
      if (path.isAbsolute(expandedCwd) && existsSync(expandedCwd)) {
        cwd = expandedCwd;
      } else if (path.isAbsolute(expandedCwd)) {
        // Assoluto ma non trovato: prova risoluzione case-insensitive dalla root
        const base = path.dirname(exePath);
        cwd = existsSync(expandedCwd) ? expandedCwd : resolveCaseInsensitive(base, path.basename(expandedCwd));
      } else {
        // Relativo: risolvi rispetto alla directory dell'eseguibile
        const base = path.dirname(exePath);
        cwd = resolveCaseInsensitive(base, expandedCwd);
      }
      // Fallback finale: directory dell'exe
      if (!existsSync(cwd)) {
        writeLog('warning', `[WINE] launchCwd not found: ${cwd} — using exe directory`);
        cwd = path.dirname(exePath);
      }
    } else {
      cwd = path.dirname(exePath);
    }

    const env: Record<string, string> = {
      WINEPREFIX:  prefix,
      WINEDEBUG:   '-all',
      DXVK_ASYNC:  '1',
      ...(config?.env ?? {}),
    };

    // FSR — AMD FidelityFX Super Resolution via Wine
    if (config?.fsr) {
      env.WINE_FULLSCREEN_FSR        = '1';
      env.WINE_FULLSCREEN_FSR_STRENGTH = '2';
    }

    // MangoHud — overlay FPS/GPU/CPU
    if (config?.mangohud) {
      if (binaryExists('mangohud')) {
        env.MANGOHUD      = '1';
        env.MANGOHUD_DLSYM = '1';
      } else {
        writeLog('warning', '[WINE] MangoHud requested but not found — install mangohud');
      }
    }

    // EasyAntiCheat runtime
    if (config?.eac) {
      const eacPath = execSync('find /usr/share/steam /home -name "eac_runtime" -type d 2>/dev/null | head -1',
        { encoding: 'utf-8', timeout: 3000 }).trim();
      if (eacPath) env.PROTON_EAC_RUNTIME = eacPath;
      else writeLog('warning', '[WINE] EAC runtime not found');
    }

    // BattlEye runtime
    if (config?.battleye) {
      const bePath = execSync('find /usr/share/steam /home -name "battleye_runtime" -type d 2>/dev/null | head -1',
        { encoding: 'utf-8', timeout: 3000 }).trim();
      if (bePath) env.PROTON_BATTLEYE_RUNTIME = bePath;
      else writeLog('warning', '[WINE] BattlEye runtime not found');
    }

    // GameMode — wrappa il lancio con gamemoderun
    const useGameMode = config?.gameMode && binaryExists('gamemoderun');
    if (config?.gameMode && !binaryExists('gamemoderun')) {
      writeLog('warning', '[WINE] GameMode requested but gamemoderun not found — install gamemode');
    }

    const launchBin  = useGameMode ? 'gamemoderun' : wineBin;
    const launchArgs = useGameMode
      ? [wineBin, exePath, ...(config?.args ?? [])]
      : [exePath, ...(config?.args ?? [])];

    writeLog('launch', `[WINE] WINEPREFIX=${prefix} cwd=${cwd} ${launchBin} ${launchArgs.join(' ')}`);
    const logPath = gameLaunchLogPath(game.id);
    const { pid } = spawnDetached(launchBin, launchArgs, { ...env, cwd } as any, undefined, logPath);
    return { success: true, pid, message: `Launched via ${launchBin} (prefix: ${prefix})`, logPath };
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
      ...(config?.env ?? {}),
    };

    const exePath = expandHome(game.executablePath);
    writeLog('launch', `[PROTON] ${protonBin} run ${exePath}`);
    const logPath = gameLaunchLogPath(game.id);
    const { pid } = spawnDetached(protonBin, ['run', exePath, ...(config?.args ?? [])], env, undefined, logPath);
    return { success: true, pid, message: `Launched via ${this.name}`, logPath };
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

  if (isProton) {
    const protonBin = resolveProtonBin(runner.id);
    if (!protonBin) {
      return { success: false, message: `Proton "${runner.id}" non trovato. Installalo via Steam o ProtonUp-Qt.` };
    }
    const prefix = expandHome(config?.prefix ?? `~/.local/share/proton-prefixes/${game.id}`);
    // Sintassi verificata (issue reali Heroic/legendary su GitHub):
    // --no-wine dice a legendary di non cercare un wine proprio,
    // --wrapper delega l'intero avvio a "<proton> run", che si aspetta
    // STEAM_COMPAT_DATA_PATH nell'ambiente — non WINEPREFIX diretto,
    // stesso principio già scoperto per il bug prefix Proton in v1.0.0.
    args.push('--no-wine', '--wrapper', `'${protonBin}' run`);
    env.STEAM_COMPAT_DATA_PATH = prefix;
    env.STEAM_COMPAT_CLIENT_INSTALL_PATH = `${homedir()}/.local/share/Steam`;
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

  writeLog('launch', `[EPIC] ${legendaryBin} ${args.join(' ')}`);
  const logPath = gameLaunchLogPath(game.id);
  const { pid } = spawnDetached(legendaryBin, args, env, undefined, logPath);
  return { success: true, pid, message: `Launched via legendary (${runner.name})`, logPath };
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
