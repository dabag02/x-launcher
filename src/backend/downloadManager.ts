/**
 * DownloadManager — Step 10 (fix v3)
 *
 * Flusso GOG:
 *   1. Download   → lgogdownloader --download --platform w --game <slug>
 *                   --directory <installerPath> --non-interactive
 *   2. Prefix     → WINEPREFIX=.../prefix/ wine wineboot --init (timeout 120s)
 *   3. Dipendenze → WINEPREFIX=.../prefix/ winetricks --unattended <verbs>
 *   4. Installa   → innoextract setup*.exe --output-dir <installPath> --gog
 *                   /SUPPRESSMSGBOXES /NORESTART /DIR=<installPath>
 *   5. Completato → isInstalled=true
 *
 * Flusso Epic:
 *   1. Download+Installa → legendary install <appName>
 *                          --base-path <installPath> --yes --skip-sdl
 *   2. Prefix            → wine wineboot --init (timeout 120s)
 *   3. Dipendenze        → winetricks --unattended <verbs>
 *   4. Completato        → isInstalled=true
 *
 * Fix rispetto alla versione precedente:
 *   - lgogdownloader: aggiunto --non-interactive (evita prompt "overwrite?")
 *   - lgogdownloader progress: split su \r|\n (il tool usa \r per aggiornare la riga)
 *   - legendary progress: idem, split \r|\n
 *   - wine wineboot / winetricks: timeout di sicurezza (120s / 300s per verb)
 *     per evitare blocchi infiniti con wineserver zombie o GUI nascosta
 *   - Inno Setup: /VERYSILENT /SP- /SUPPRESSMSGBOXES /NORESTART
 *     (non più /SILENT che lascia visible la progress bar)
 *   - winetricks: --unattended invece di -q (sopprime anche Zenity/xterm)
 *     e WINETRICKS_GUI=none nell'env per sicurezza aggiuntiva
 *   - buildSafeEnv: PATH + HOME + DISPLAY garantiti anche sotto systemd
 */

import { DownloadTask, DownloadPhase } from '../types';
import { spawn, execSync, execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { existsSync, readdirSync, mkdirSync, statSync, readFileSync, rmSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import * as db from './db';
import { writeLog } from './logger';
import { prepareWinePrefix } from './winePrefixManager';
import { ALL_KNOWN_WINE_VERBS } from '../wineVerbs';
import { resolveProtonBin } from './runners/implementations';
import { getSharedPrefixBasePath, resolveSharedPrefixExecutionPath } from './sharedLauncherManager';
import { getThirdPartyLauncherDefinition, getThirdPartyLauncherByStoreId, ThirdPartyLauncherDefinition } from './plugins/thirdPartyLaunchers';
import { browseForFile } from './filePicker';

// v0.99.35 — versione asincrona di execFile, usata per "sync" tra
// download e creazione prefix (vedi runEpic/runGOG). Non sostituisce
// execSync esistente in questo file (usato solo per check rapidi
// all'avvio/disinstallazione, non durante un'attesa concorrente con
// spawnWithTimeout) — quel pattern di problema è già stato corretto
// dove serviva (gameManager.ts, syncExternalInstallStates).
const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Costanti
// ---------------------------------------------------------------------------

const GAMES_ROOT = path.join(homedir(), 'Games');
const DEFAULT_WINETRICKS_VERBS = ['vcrun2022', 'dxvk', 'vkd3d', 'corefonts'];

// v0.99.35 — integrazione Heroic-Games-Launcher/known-fixes (GitHub,
// pubblico, nessuna autenticazione). Naming convention del repository:
// <appName>-<store>.json dove store è 'epic', 'gog', o 'amazon' (in
// minuscolo) — appName è l'ID interno esatto usato da Epic/GOG/Amazon,
// lo stesso che X-Launcher già usa come slug del gioco (es.
// d366ae16e31b41869cf26c6ee309e7f3 per Soulstice). Match esatto,
// nessuna ambiguità di ricerca per nome (a differenza di Lutris,
// verificato: una ricerca per "Soulstice" restituisce più giochi
// completamente diversi che condividono solo parte del titolo).
interface KnownFixEntry {
  title: string;
  winetricks?: string[];
  notes?: Record<string, string>;
}

// v0.99.37 — risolve lo slug testuale GOG (quello che X-Launcher usa come
// id interno) nell'ID numerico GOG reale, richiesto dal naming del
// repository known-fixes (<id>-gog.json). lgogdownloader --list (quello
// già usato per la libreria) non lo restituisce mai — solo lo slug.
//
// Usa `--list details/json` scoped a un SOLO gioco tramite `--game`
// (lo stesso flag già usato per --download, riga ~626 — comportamento
// verificato funzionante in questo progetto). Il commento originale in
// cima al file segnalava che `--list details/json` fa una chiamata API
// per OGNI gioco della libreria (128 chiamate sequenziali per l'intero
// catalogo → inutilizzabile per il refresh completo) — ma qui lo scope è
// un singolo titolo via regex esatta, quindi il costo reale è UNA sola
// chiamata, non 128.
//
// ATTENZIONE: la sintassi esatta dell'output JSON di lgogdownloader per
// questo comando non è stata verificata con un test diretto in questa
// sessione (nessun accesso a lgogdownloader/rete in questo ambiente) — il
// parsing sotto è difensivo (prova più nomi di campo plausibili) e logga
// l'output grezzo in caso di fallimento, cosi il primo test reale su
// Soma/altro titolo GOG produce già l'informazione necessaria per
// correggere il parsing al bisogno, stesso approccio empirico già usato
// per tutto il resto della pipeline GOG in questo progetto (vedi cronologia
// commenti v0.99.23/27/31/35 sopra).
function fetchGogNumericId(slug: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('lgogdownloader', [
      '--list', 'details/json',
      '--game', `^${slug}$`,
      '--no-color',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let out = '';
    const timer = setTimeout(() => {
      proc.kill();
      writeLog('warning', `[GOG] Numeric ID lookup for "${slug}" — timeout (30s), known-fixes skipped for this title.`);
      resolve(null);
    }, 30_000);

    proc.stdout.on('data', (c: Buffer) => { out += c.toString(); });
    proc.stderr.on('data', (c: Buffer) => { out += c.toString(); });

    proc.on('close', () => {
      clearTimeout(timer);
      try {
        // Isola il primo blocco JSON plausibile nell'output (lgogdownloader
        // può anteporre righe di progresso testuali, come già visto per
        // --list semplice in gogPlugin.ts).
        const jsonStart = out.indexOf('{');
        const arrStart  = out.indexOf('[');
        const start = (arrStart !== -1 && (jsonStart === -1 || arrStart < jsonStart)) ? arrStart : jsonStart;
        if (start === -1) throw new Error('nessun JSON nell\'output');
        const parsed = JSON.parse(out.slice(start));
        const entry = Array.isArray(parsed) ? parsed[0] : (parsed?.games?.[0] ?? parsed);
        const id = entry?.id ?? entry?.gameId ?? entry?.game_id ?? entry?.productId ?? entry?.product_id;
        if (id != null) {
          resolve(String(id));
        } else {
          writeLog('warning', `[GOG] Numeric ID lookup for "${slug}" — valid JSON but no recognized id field. Raw output: ${out.slice(0, 500)}`);
          resolve(null);
        }
      } catch (e) {
        writeLog('warning', `[GOG] Numeric ID lookup for "${slug}" failed (parsing). Raw output: ${out.slice(0, 500)}`);
        resolve(null);
      }
    });

    proc.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

/**
 * v0.99.38 — risolve quale binario wine/wineserver usare e QUALE percorso
 * è la vera WINEPREFIX, in base al runner effettivamente selezionato
 * nell'overlay prima dell'installazione — invece del comportamento
 * precedente (sempre wine di sistema, sempre task.prefixPath diretto,
 * indipendentemente dal runner scelto).
 *
 * Caso Wine-family (default, undefined, o qualunque id non riconosciuto
 * come Proton): nessun cambiamento — wine di sistema, prefixPath diretto.
 *
 * Caso Proton: Proton non usa mai il path passato come WINEPREFIX
 * diretto — lo tratta come STEAM_COMPAT_DATA_PATH e cerca/crea la vera
 * prefix in `<path>/pfx` (comportamento nativo di Proton, non
 * configurabile). Se inizializzassimo la prefix nel path "diretto" come
 * per wine, Proton la ignorerebbe e ne creerebbe silenziosamente
 * un'altra al primo lancio — esattamente il problema riscontrato con
 * Soma: sembrava funzionare "con la stessa prefix", ma Proton ne aveva
 * bootstrappata una nuova a sua insaputa. Qui inizializziamo direttamente
 * `<path>/pfx`, usando il wine64 bundled dentro l'installazione Proton
 * stessa (non quello di sistema, che potrebbe avere una versione/patch
 * set diversa da quella che Proton userà davvero al lancio).
 *
 * winetricks rispetta le variabili WINE/WINE64/WINESERVER per puntare a
 * un binario diverso da quello di sistema — sfruttate qui per lo stesso
 * motivo, altrimenti anche passando la WINEPREFIX corretta i verb
 * verrebbero comunque installati con wine di sistema invece che con
 * quello di Proton.
 */
export function resolveRunnerWineEnv(runnerId: string | undefined, containerPrefixPath: string): {
  wineBin:        string;
  wineserverBin:  string;
  winePrefixPath: string;
  extraEnv:       Record<string, string>;
} {
  const fallback = {
    wineBin: 'wine', wineserverBin: 'wineserver',
    winePrefixPath: containerPrefixPath, extraEnv: {},
  };
  if (!runnerId || runnerId === 'Wine-Lutris') return fallback;

  const protonBin = resolveProtonBin(runnerId);
  if (!protonBin) {
    // Runner sconosciuto o Proton non trovato sul disco — non è compito
    // di questa funzione decidere se bloccare l'installazione per
    // questo, si limita a ripiegare sul comportamento wine di sistema
    // già esistente. Il chiamante logga comunque il fallback.
    return fallback;
  }

  const protonFilesBin = path.join(path.dirname(protonBin), 'files', 'bin');
  const wine64      = path.join(protonFilesBin, 'wine64');
  const wine32      = path.join(protonFilesBin, 'wine');
  const wineserver  = path.join(protonFilesBin, 'wineserver');
  const wineBin       = existsSync(wine64)     ? wine64     : (existsSync(wine32) ? wine32 : 'wine');
  const wineserverBin = existsSync(wineserver) ? wineserver : 'wineserver';

  return {
    wineBin, wineserverBin,
    winePrefixPath: path.join(containerPrefixPath, 'pfx'),
    extraEnv: { WINE: wineBin, WINE64: wineBin, WINESERVER: wineserverBin },
  };
}


// v0.99.35 — Epic: match diretto, appName è già l'hash usato anche dal
// repository Heroic per il naming (<appName>-epic.json).
// v0.99.37 — GOG: stesso repository, naming <id_numerico>-gog.json.
// L'id numerico non è quello che X-Launcher usa come slug interno — va
// risolto a parte, vedi fetchGogNumericId sopra.
async function fetchKnownFixes(appName: string, store: 'epic' | 'gog'): Promise<KnownFixEntry | null> {
  const url = `https://raw.githubusercontent.com/Heroic-Games-Launcher/known-fixes/main/${store}/${appName}-${store}.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null; // 404 = nessun fix noto per questo gioco, non un errore
    return await res.json() as KnownFixEntry;
  } catch {
    // Rete irraggiungibile, timeout, JSON malformato — non fatale,
    // il chiamante ricade sui verb già configurati.
    return null;
  }
}

/**
 * v1.5.4-dev.1 — bug di sicurezza reale corretto (audit qualità del
 * codice): fix.winetricks arriva da un repository GitHub esterno
 * (Heroic Known Fixes) e finiva direttamente in
 * `execSync(\`winetricks --unattended ${verb}\`)` senza alcuna verifica —
 * se quel repository (o un fork/mirror compromesso) avesse mai
 * restituito una stringa come "corefonts; rm -rf ~", sarebbe stata
 * eseguita così com'è. Stesso principio già usato per il rilevamento dei
 * verb installati manualmente (v1.1.119 — wineVerbs.ts condiviso): si
 * accetta solo ciò che è nell'elenco riconosciuto, qualunque altra cosa
 * viene scartata e segnalata, invece di eseguirla alla cieca.
 */
function sanitizeKnownFixVerbs(verbs: string[], logPrefix: string, log: (msg: string) => void): string[] {
  const clean = verbs.filter(v => ALL_KNOWN_WINE_VERBS.includes(v));
  const rejected = verbs.filter(v => !ALL_KNOWN_WINE_VERBS.includes(v));
  if (rejected.length > 0) {
    log(`[${logPrefix}] Known fix Heroic conteneva voci non riconosciute, scartate per sicurezza: ${rejected.join(', ')}`);
  }
  return clean;
}

/**
 * Controlla se Vulkan è disponibile sul sistema.
 * Se non lo è, dxvk e vkd3d non funzioneranno e vanno saltati.
 */
function isVulkanAvailable(): boolean {
  try {
    // vulkaninfo è il check più affidabile
    execSync('vulkaninfo --summary 2>&1 | grep -q "GPU id"', {
      stdio: 'ignore', env: buildSafeEnv(), timeout: 5000,
    });
    return true;
  } catch {
    try {
      // Fallback: cerca almeno un ICD loader
      execSync('ldconfig -p 2>/dev/null | grep -q libvulkan', {
        stdio: 'ignore', env: buildSafeEnv(), timeout: 3000,
      });
      return true;
    } catch {
      return false;
    }
  }
}

function filterVerbsForEnv(verbs: string[]): string[] {
  if (isVulkanAvailable()) return verbs;
  const skipped = verbs.filter(v => v === 'dxvk' || v === 'vkd3d');
  if (skipped.length > 0) {
    writeLog('warning', `[WINETRICKS] Vulkan not available — skipping: ${skipped.join(', ')}`);
  }
  return verbs.filter(v => v !== 'dxvk' && v !== 'vkd3d');
}

// Timeout in ms per le fasi "silenziose" (wine / winetricks)
const WINEBOOT_TIMEOUT_MS    = 120_000;  // 2 min
const WINETRICK_TIMEOUT_MS   = 300_000;  // 5 min per verb
// v0.99.35 — i verb .NET (dotnet40/45/46/...) installano un vero MSI
// sotto Wine, non solo file/DLL copiati — confermato con test diretto
// (I/O reale e continuo su msiexec.exe, nessun blocco) che il lavoro
// procede correttamente ma più lentamente dei verb "semplici" (vcrun/
// dxvk/vkd3d/corefonts, tipicamente 2-4s ciascuno). Il download del
// pacchetto è condiviso automaticamente da winetricks stesso tramite
// ~/.cache/winetricks/ (verificato: stesso identico file riusato tra
// installazioni diverse, nessun re-download) — il tempo osservato è
// quasi interamente l'installazione MSI stessa, non scaricabile in
// anticipo né condivisibile tra prefix diverse (il registro Windows è
// specifico per ciascuna WINEPREFIX).
const WINETRICK_DOTNET_TIMEOUT_MS = 900_000; // 15 min per i verb dotnet*

function winetrickTimeoutFor(verb: string): number {
  return verb.startsWith('dotnet') ? WINETRICK_DOTNET_TIMEOUT_MS : WINETRICK_TIMEOUT_MS;
}
// v0.99.35 — INSTALLER_TIMEOUT_MS rimossa: lo Step 5 GOG (innoextract)
// ora usa un timeout di inattività invece di un valore assoluto fisso
// (vedi chiamata a spawnWithTimeout in runGOG), parametri passati
// inline data la natura specifica di questo singolo caso d'uso.

const PHASE_LABELS: Record<DownloadPhase, string> = {
  queued:           'In coda...',
  downloading:      'Download in corso...',
  paused:           'Download in pausa',
  creating_prefix:  'Creazione ambiente Wine...',
  installing_deps:  'Installazione dipendenze...',
  installing_game:  'Installazione gioco...',
  awaiting_installer: 'In attesa dell\'installer...',
  completed:        'Installazione completata!',
  error:            'Errore durante l\'installazione',
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function binaryExists(bin: string): boolean {
  try { execSync(`which ${bin}`, { stdio: 'ignore', env: buildSafeEnv() }); return true; }
  catch { return false; }
}

/**
 * Env sicuro per tutti gli spawn.
 * Sotto systemd PATH è minimo e HOME / DISPLAY possono mancare.
 */
function buildSafeEnv(extra: Record<string, string> = {}): Record<string, string | undefined> {
  const home = process.env.HOME ?? homedir();
  const existingPath = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin';
  const userBin = path.join(home, '.local', 'bin');
  const pathParts = existingPath.split(':');
  if (!pathParts.includes(userBin)) pathParts.unshift(userBin);

  return {
    ...process.env,
    HOME:             home,
    PATH:             pathParts.join(':'),
    DISPLAY:          process.env.DISPLAY         ?? ':0',
    WAYLAND_DISPLAY:  process.env.WAYLAND_DISPLAY ?? '',
    XDG_RUNTIME_DIR:  process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`,
    // Forza winetricks in modalità non-interattiva anche se DISPLAY è disponibile
    WINETRICKS_GUI:   'none',
    ...extra,
  };
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
}

/**
 * v1.1.116-dev.1 — bug reale segnalato dall'utente: l'overlay non mostrava
 * spuntato NEMMENO un verb di default realmente installato. Causa: prima
 * db.upsertCompatProfile() veniva chiamata SOLO quando Known Fixes
 * (Heroic) trovava effettivamente un fix (GOG/Epic) — un'installazione
 * con soli verb di default mai toccati a mano nell'overlay prima di
 * installare non veniva mai scritta nel DB. Persiste sempre, qualunque
 * sia la provenienza dei verb (default silenziosi, selezione manuale
 * pre-install già salvata via PATCH, o override Known Fixes).
 */
function persistWinetricksVerbs(gameId: string, verbs: string[]): void {
  try {
    const currentProfile = db.getCompatProfile(gameId) ?? {
      fsr: false, gameMode: false, mangohud: 0, eac: false, battleye: false,
    };
    db.upsertCompatProfile(gameId, { ...currentProfile, winetricksVerbs: verbs });
  } catch (e) {
    writeLog('warning', `[COMPAT] Impossibile salvare winetricksVerbs per ${gameId}: ${e}`);
  }
}

export function storeDir(store: string): string {
  const name = store === 'GOG Galaxy' ? 'GOG' : store === 'Epic Games' ? 'Epic' : store;
  return path.join(GAMES_ROOT, name);
}

export function slugFromId(gameId: string): string {
  return gameId.replace(/^(gog|epic)-/, '').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
}

/**
 * EPIC — legge l'exe di lancio direttamente da legendary.
 * Restituisce { exePath, launchArgs } o null se legendary non risponde.
 * exePath è già assoluto: install_path + "/" + executable
 */
export async function resolveEpicExe(appName: string): Promise<{ exePath: string; launchArgs: string } | null> {
  try {
    // v0.99.35 — execFileAsync invece di execSync: stesso motivo già
    // corretto in syncExternalInstallStates (gameManager.ts) — questa
    // funzione può essere richiamata dal sync periodico mentre
    // un'installazione concorrente è in corso, ed execSync bloccherebbe
    // l'event loop nello stesso modo già diagnosticato per il timeout
    // wineboot/winetricks.
    const result = await execFileAsync('legendary', ['info', appName, '--json'], {
      encoding: 'utf-8', timeout: 15000,
    });
    const data = JSON.parse(result.stdout);
    const installPath  = data?.install?.install_path as string | undefined;
    const launchExe    = data?.manifest?.launch_exe  as string | undefined;
    const launchCmd    = (data?.manifest?.launch_command ?? '') as string;
    if (!installPath || !launchExe) return null;
    // legendary restituisce l'exe relativo alla sottocartella del gioco
    const exePath = path.join(installPath, launchExe);
    // v0.99.35 — verifica che il file esista DAVVERO sul disco, non solo
    // che legendary lo dichiari nel manifest. Causa diagnosticata: un
    // gioco con installazione interrotta a metà (es. Ctrl+C durante il
    // download, stesso scenario osservato per GOG/SOMA) può comunque
    // apparire in `legendary list-installed`/`legendary info` — il
    // database interno di legendary non garantisce che l'estrazione sia
    // completa. Senza questo controllo, un'installazione interrotta
    // produrrebbe lo stesso falso positivo già corretto per GOG (gioco
    // marcato installato, card che non punta a un eseguibile reale).
    if (!existsSync(exePath)) return null;
    return { exePath, launchArgs: launchCmd };
  } catch {
    return null;
  }
}

/**
 * Risolve un path relativo Windows (con backslash, case-insensitive)
 * nella cartella base su Linux cercando ricorsivamente.
 * Es: "ScummVM\scummvm.exe" → trova "/files/scummvm/scummvm.exe"
 */
function resolvePathCaseInsensitive(base: string, relPath: string): string {
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

/**
 * GOG — legge l'exe di lancio dal goggame-*.info estratto da innoextract.
 * Restituisce { exePath, launchArgs, launchCwd } o null se il file non esiste.
 * exePath è assoluto con risoluzione case-insensitive per compatibilità Linux.
 */
export function resolveGogExe(installPath: string): {
  exePath:    string;
  launchArgs: string;
  launchCwd:  string;
} | null {
  try {
    const infoFiles = readdirSync(installPath)
      .filter((f: string) => f.startsWith('goggame-') && f.endsWith('.info'));
    if (infoFiles.length === 0) return null;

    const infoFile = infoFiles.sort()[0];
    const raw      = readFileSync(path.join(installPath, infoFile), 'utf-8');
    const info     = JSON.parse(raw);

    const primary = (info.playTasks as any[])?.find(
      (t: any) => t.isPrimary && t.type === 'FileTask' && t.path
    );
    if (!primary) return null;

    // Risoluzione case-insensitive del path exe
    const exePath = resolvePathCaseInsensitive(installPath, primary.path);

    // Per giochi con ScummVM bundled non passiamo argomenti —
    // ScummVM si avvia mostrando il suo client e ricorda i giochi aggiunti.
    const rawArgs = ((primary.arguments ?? '') as string).replace(/\\/g, '/');
    const launchArgs = rawArgs.includes('-c ') ? '' : rawArgs;

    // Risoluzione case-insensitive del workingDir
    const launchCwd = primary.workingDir
      ? resolvePathCaseInsensitive(installPath, primary.workingDir)
      : path.dirname(exePath);

    return { exePath, launchArgs, launchCwd };
  } catch {
    return null;
  }
}

/**
 * FALLBACK — ricerca ricorsiva nel filesystem.
 * Usato solo se le sorgenti autorevoli non sono disponibili.
 * Restituisce il path assoluto o null.
 */
export function findMainExe(basePath: string): string | null {
  if (!existsSync(basePath)) return null;
  try {
    const result = execSync(
      `find "${basePath}" -maxdepth 4 -iname "*.exe" ` +
      `! -iname "unins*" ! -iname "UnityCrashHandler*" ` +
      `! -iname "CrashReporter*" ! -iname "vcredist*" ` +
      `! -iname "dxsetup*" ! -iname "vc_redist*" ` +
      `| head -1`,
      { encoding: 'utf-8', timeout: 8000 }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Step 19d — bug reale trovato: findMainExe() sopra è pensata per la
 * cartella isolata di un singolo gioco (GOG/Epic/Amazon), MAI per un
 * drive_c intero di un prefix Wine/Proton condiviso — quest'ultimo
 * contiene anche `windows/` pieno di utility di sistema (explorer,
 * notepad, redist helper...) che possono matchare `*.exe` prima del
 * vero eseguibile installato. Verificato su hardware reale: puntare
 * findMainExe(drive_c) ha restituito l'utility Explorer di Wine invece
 * di UbisoftConnect.exe.
 *
 * Questa funzione, usata SOLO per i launcher terzi condivisi, restringe
 * la ricerca a `Program Files*` (dove finiscono le app installate),
 * MAI dentro `windows/`, e prova prima l'hint dichiarato nel registro
 * (thirdPartyLaunchers.ts) come percorso esatto.
 */
export function findInstalledLauncherExe(driveCPath: string, hintRelPath?: string): string | null {
  if (hintRelPath) {
    const hinted = path.join(driveCPath, hintRelPath);
    if (existsSync(hinted)) return hinted;
  }
  for (const sub of ['Program Files (x86)', 'Program Files']) {
    const base = path.join(driveCPath, sub);
    if (!existsSync(base)) continue;
    try {
      const result = execSync(
        `find "${base}" -maxdepth 5 -iname "*.exe" ` +
        `! -iname "unins*" ! -iname "*crashhandler*" ! -iname "*crashreporter*" ` +
        `! -iname "vcredist*" ! -iname "vc_redist*" ! -iname "dxsetup*" ` +
        `! -iname "*explorer*" ! -iname "*helper*" ! -iname "*updater*" ` +
        `| head -1`,
        { encoding: 'utf-8', timeout: 8000 }
      ).trim();
      if (result) return result;
    } catch {
      // continua col prossimo sub-percorso
    }
  }
  return null;
}

/**
 * v1.5.20-dev.10 — richiesta utente: la cartella Download può chiamarsi
 * diversamente a seconda della lingua di sistema (es. "Scaricati" su
 * locale italiano) — homedir()+'Downloads' scritto alla lettera (come
 * era prima qui sotto) non la trova affatto su quei sistemi, un limite
 * reale già presente prima di questa modifica, non solo teorico per il
 * futuro file manager.
 *
 * Ordine di risoluzione (verificato: xdg-user-dirs è lo standard
 * desktop Linux per la localizzazione di queste cartelle):
 *   1. `xdg-user-dir DOWNLOAD` — il comando ufficiale del pacchetto
 *      xdg-user-dirs, restituisce già il path risolto in una riga
 *   2. lettura diretta di ~/.config/user-dirs.dirs (stesso file che
 *      xdg-user-dir legge, per chi non ha il comando installato ma ha
 *      comunque la configurazione, es. scritta da un altro DE)
 *   3. ~/Downloads letterale
 *   4. ~/Scaricati letterale (il caso specifico segnalato dall'utente,
 *      ultima rete di sicurezza se anche la configurazione XDG manca)
 * Restituisce null solo se NESSUNA delle quattro esiste davvero su disco.
 */
/**
 * v1.5.20-dev.12 — esportata: riusata anche dal file manager nativo
 * (fileManager.ts/server.ts, quick-link "Downloads") oltre che qui.
 */
export function resolveDownloadsDir(): string | null {
  if (binaryExists('xdg-user-dir')) {
    try {
      const result = execSync('xdg-user-dir DOWNLOAD', { encoding: 'utf-8', timeout: 3000 }).trim();
      if (result && existsSync(result)) return result;
    } catch {
      // ripiega sui metodi sotto
    }
  }
  try {
    const configPath = path.join(homedir(), '.config', 'user-dirs.dirs');
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      const match = content.match(/XDG_DOWNLOAD_DIR\s*=\s*"([^"]+)"/);
      if (match) {
        // Formato dichiarato dallo standard: $HOME/relativo, o un
        // percorso assoluto — mai altro (vedi doc ufficiale letta prima
        // di scrivere questo parser).
        const resolved = match[1].replace(/^\$HOME/, homedir());
        if (existsSync(resolved)) return resolved;
      }
    }
  } catch {
    // ripiega sui letterali sotto
  }
  for (const name of ['Downloads', 'Scaricati']) {
    const candidate = path.join(homedir(), name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * v1.5.20-dev.10 — generalizzata da "cerca un installer Ubisoft Connect"
 * a "cerca l'installer di un QUALUNQUE launcher terzo": il pattern nome
 * file (prima hardcoded `*ubisoft*`/`*uplay*`) è ora un parametro,
 * letto da `installerFilenameHints` nel registro (thirdPartyLaunchers.ts)
 * — decisione esplicita con l'utente: ogni plugin gestisce le proprie
 * particolarità, questa resta la sola parte davvero comune (creazione
 * prefix + ricerca installer), non un plugin unico. Pattern euristico,
 * NON verificato contro un download reale per i launcher non ancora
 * affrontati — da confermare/correggere al primo test su hardware reale
 * di ciascuno (stesso principio già seguito per Ubisoft Connect).
 * Ordina per data di modifica decrescente: se l'utente ha scaricato più
 * volte, prendiamo il file più recente. `filenameHints` vuoto o assente
 * → nessun filtro sul nome, solo *.exe (utile finché un launcher non ha
 * ancora pattern verificati).
 */
function findInstallerInDownloads(filenameHints: string[] = []): string | null {
  const downloadsDir = resolveDownloadsDir();
  if (!downloadsDir) return null;
  const nameFilter = filenameHints.length > 0
    ? ` \\( ${filenameHints.map(h => `-iname "${h}"`).join(' -o ')} \\) `
    : ' ';
  try {
    const result = execSync(
      `find "${downloadsDir}" -maxdepth 1 -iname "*.exe" ${nameFilter}` +
      `-printf "%T@ %p\\n" | sort -rn | head -1 | cut -d' ' -f2-`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}



// ---------------------------------------------------------------------------
// Parser progresso lgogdownloader
//
// v0.99.35 — riscritto da zero dopo aver verificato il formato REALE
// (test diretto su Aragami, log completo analizzato). lgogdownloader
// scarica con 4 slot paralleli (#0..#3), ognuno con la propria barra
// "97% ▕███▏ 3231.17/3319.48MiB" per il file che gli è assegnato in
// quel momento — NON un progresso aggregato del task. Il vecchio
// parser (qualsiasi numero seguito da %) catturava la percentuale di
// QUALUNQUE slot, causando due bug distinti osservati in questa
// sessione: (1) barra a dente di sega — uno slot piccolo arriva al
// 90%+ mentre il file grande nello slot adiacente è ancora al 10%,
// ogni nuova riga sovrascriveva il valore precedente senza criterio;
// (2) dopo il fix Math.max() di ieri (pensato per impedire la
// regressione visiva), un file piccolo che raggiunge il 99% presto
// BLOCCAVA per sempre la barra a quel valore, anche con il file
// principale (3+ GB) ancora a download in corso sotto — la barra
// mentiva sul reale avanzamento.
//
// Fix corretto: il formato espone anche "Total size: 6.45 GiB" (una
// sola volta, a inizio task) e "Total: <speed> | Remaining: N (Y GiB)
// ETA: Zs" (ripetuto ad ogni refresh, per TUTTI gli slot insieme).
// Calcoliamo il progresso aggregato reale come
// (totalSize - remaining) / totalSize — indipendente da quale slot
// stia scaricando cosa in quel momento. Richiede stato tra righe
// diverse (totalSize visto una volta, riusato per ogni calcolo
// successivo) — da qui la closure invece di una funzione pura.
// ---------------------------------------------------------------------------
function makeLgogProgressParser(): (line: string) => { progress: number; speed: string } | null {
  let totalSizeMiB: number | null = null;

  const toMiB = (value: number, unit: string): number => {
    switch (unit.toUpperCase()) {
      case 'GIB': case 'GB': return value * 1024;
      case 'MIB': case 'MB': return value;
      case 'KIB': case 'KB': return value / 1024;
      default:                return value;
    }
  };

  return (line: string) => {
    const totalSizeMatch = line.match(/Total size:\s*([\d.]+)\s*(GiB|MiB|KiB|GB|MB|KB)/i);
    if (totalSizeMatch) {
      totalSizeMiB = toMiB(parseFloat(totalSizeMatch[1]), totalSizeMatch[2]);
      return null; // riga informativa, non un aggiornamento di progresso
    }

    const remainingMatch = line.match(
      /Total:\s*([\d.]+\s*(?:GiB|MiB|KiB|GB|MB|KB)\/s)\s*\|\s*Remaining:\s*\d+\s*\(([\d.]+)\s*(GiB|MiB|KiB|GB|MB|KB)\)/i
    );
    if (remainingMatch && totalSizeMiB && totalSizeMiB > 0) {
      const remainingMiB = toMiB(parseFloat(remainingMatch[2]), remainingMatch[3]);
      const progress = Math.max(0, Math.min(99, ((totalSizeMiB - remainingMiB) / totalSizeMiB) * 100));
      return { progress, speed: remainingMatch[1] };
    }

    return null;
  };
}

// ---------------------------------------------------------------------------
// Parser progresso legendary
//
// v1.1.36 — BUG REALE CONFERMATO (issue GitHub dirette legendary/Heroic):
// legendary scrive percentuale e velocità su DUE RIGHE SEPARATE, mai
// insieme sulla stessa riga come il vecchio commento/regex assumeva:
//   "[DLManager] INFO: = Progress: 38.98% (8181/20990), Running for
//    00:01:17, ETA: 00:02:00"
//   "[DLManager] INFO: + Download - 40.49 MiB/s (raw) / 45.95 MiB/s
//    (decompressed)"
// Il vecchio parser (funzione singola, senza stato) cercava un match di
// velocità DENTRO la riga "Progress:" stessa — non l'ha mai trovato,
// perché non esiste in quel formato. Risultato: la percentuale
// funzionava (letta altrove), la velocità restava sempre vuota — per
// GOG funzionava perché makeLgogProgressParser() è già una factory con
// stato dedicata a quel formato specifico (multi-riga, slot paralleli).
// Stessa soluzione qui: una chiusura ricorda l'ultima velocità vista
// sulla riga "+ Download" e la restituisce insieme alla prossima riga
// "Progress:" che arriva — un tick di ritardo (la velocità è quella del
// tick precedente, non quello corrente), impercettibile dato l'update
// una volta al secondo, comunque preferibile a non mostrarla mai.
// ---------------------------------------------------------------------------
function makeLegendaryProgressParser(): (line: string) => { progress: number; speed: string } | null {
  let lastSpeed = '';

  return (line: string) => {
    const speedMatch = line.match(/\+?\s*Download\s*-\s*([\d.]+\s*(?:KiB|MiB|GiB)\/s)/i);
    if (speedMatch) {
      lastSpeed = speedMatch[1];
      return null; // riga informativa, non un aggiornamento di percentuale
    }

    const progressMatch = line.match(/Progress:\s*([\d.]+)%/i);
    if (progressMatch) {
      return { progress: parseFloat(progressMatch[1]), speed: lastSpeed };
    }

    return null;
  };
}

// ---------------------------------------------------------------------------
// Parser progresso nile (Amazon Games)
//
// v1.1.111-dev.1 — formato VERIFICATO con log reale di un'installazione
// completa fornita dall'utente (Art of Fighting 3, ~53MB). A differenza di
// legendary/lgogdownloader (che aggiornano via \r sulla stessa riga), nile
// stampa una riga INFO [PROGRESS] completa e separata da newline normale
// per ogni aggiornamento — quindi split('\n') basta, nessuna gestione di
// \r necessaria qui.
//
// ARTEFATTO SCOPERTO nel log reale, deliberatamente NON replicato: la
// percentuale che nile stampa prima della frazione byte è "in ritardo" di
// una riga rispetto alla vera frazione — es. una riga con
// "Progress: 19.84 41670335/55301823" mostra 19.84%, ma 41670335/55301823
// fa in realtà ~75.3%; il valore 19.84 corrisponde invece alla frazione
// byte della riga PRECEDENTE (10970212/55301823 ≈ 19.84%). Per questo la
// percentuale qui sotto è SEMPRE ricalcolata da noi dal rapporto
// byte scaricati/totale, mai presa dal numero già stampato da nile.
// ---------------------------------------------------------------------------
function makeNileProgressParser(): (line: string) => { progress: number; speed: string } | null {
  let lastSpeed = '';

  return (line: string) => {
    const speedMatch = line.match(/\+\s*Download\s*-\s*([\d.]+\s*(?:KiB|MiB|GiB)\/s)/i);
    if (speedMatch) {
      lastSpeed = speedMatch[1];
      return null; // riga informativa, non un aggiornamento di percentuale
    }

    const bytesMatch = line.match(/Progress:\s*[\d.]+\s+(\d+)\/(\d+)/);
    if (bytesMatch) {
      const downloaded = parseInt(bytesMatch[1], 10);
      const total = parseInt(bytesMatch[2], 10);
      if (total > 0) {
        return { progress: (downloaded / total) * 100, speed: lastSpeed };
      }
    }

    return null;
  };
}

// ---------------------------------------------------------------------------
// Parser progresso innoextract
//
// v0.99.35 — formato verificato con test diretto (log completo
// dell'estrazione SOMA, ~6.45GB, analizzato riga per riga). A
// differenza di lgogdownloader (4 slot paralleli, vedi
// makeLgogProgressParser), innoextract usa una singola barra con
// percentuale GIÀ AGGREGATA sull'intera estrazione — formato semplice,
// nessuna logica di stato necessaria:
//   "[K[=================>    ] 28.9%   131 MiB/s"
// Il prefisso "[K" (in realtà ESC[K, sequenza ANSI "erase to end of
// line", visibile come testo letterale "[K" nel log perché il
// carattere ESC non è stampabile) precede ogni refresh della barra —
// il regex lo ignora cercando solo il pattern percentuale+velocità
// ovunque nella riga, senza richiedere un match dall'inizio.
// ---------------------------------------------------------------------------
function parseInnoextractProgress(line: string): { progress: number; speed: string } | null {
  const m = line.match(/([\d.]+)%\s*([\d.]+\s*(?:MiB|GiB|KiB)\/s)?/i);
  if (m) return { progress: parseFloat(m[1]), speed: m[2] ?? '' };
  return null;
}

// ---------------------------------------------------------------------------
// Tipo listener
// ---------------------------------------------------------------------------

type Listener = (task: DownloadTask) => void;

// ---------------------------------------------------------------------------
// DownloadManager
// ---------------------------------------------------------------------------

class DownloadManager {
  private tasks     = new Map<string, DownloadTask>();
  private procs     = new Map<string, ChildProcess>();
  private listeners: Listener[] = [];
  private completeCallbacks: Array<(gameId: string, gameTitle: string) => void> = [];
  private errorCallbacks:    Array<(gameId: string, gameTitle: string, error: string, recentOutput?: string) => void> = [];
  // v0.99.35 — notifica esito lookup Heroic known-fixes (trovato/non
  // trovato), per il toggle overlay "Usa Known Fixes (Heroic)".
  private knownFixesCallbacks: Array<(gameId: string, gameTitle: string, found: boolean, verbs?: string[]) => void> = [];
  // v0.99.36 — Step 2 (lock prefix): DownloadManager non ha visibilità
  // sul processo di gioco in esecuzione (tracciato in GameManager,
  // lastLaunchedGame) e non può importarlo direttamente senza creare
  // una dipendenza circolare (GameManager già importa DownloadManager).
  // Stesso pattern già usato per onComplete/onError: GameManager
  // registra un checker all'avvio, DownloadManager lo consulta prima
  // di iniziare a scrivere sulla prefix.
  private runningGameChecker: ((gameId: string) => boolean) | null = null;

  onComplete(cb: (gameId: string, gameTitle: string) => void)                { this.completeCallbacks.push(cb); }
  onError(cb:    (gameId: string, gameTitle: string, error: string, recentOutput?: string) => void) { this.errorCallbacks.push(cb); }
  onKnownFixesResult(cb: (gameId: string, gameTitle: string, found: boolean, verbs?: string[]) => void) { this.knownFixesCallbacks.push(cb); }
  setRunningGameChecker(fn: (gameId: string) => boolean) { this.runningGameChecker = fn; }

  addListener(cb: Listener)    { this.listeners.push(cb); }
  removeListener(cb: Listener) { this.listeners = this.listeners.filter(l => l !== cb); }

  private notify(task: DownloadTask) {
    task.phase      = task.status;
    task.phaseLabel = PHASE_LABELS[task.status] ?? task.status;
    db.upsertDownload(task);
    for (const cb of this.listeners) {
      try { cb(task); } catch { /* un listener non blocca gli altri */ }
    }
  }

  private update(task: DownloadTask, patch: Partial<DownloadTask>) {
    Object.assign(task, patch);
    this.notify(task);
  }

  /** Scrive nel log del daemon e aggiorna phaseLabel in caso di errore */
  private log(task: DownloadTask, level: 'system' | 'error' | 'info', msg: string) {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const tag = level === 'error' ? '[ERROR]' : '[SYSTEM]';
    writeLog(level === 'error' ? 'error' : level === 'info' ? 'info' : 'download', msg);
    try {
      db.insertLog({ timestamp, message: msg, type: level === 'error' ? 'error' : 'system' });
    } catch (e) {
      writeLog('error', `[LOG WRITE FAILED] ${e}`);
    }
    if (level === 'error') {
      this.update(task, { phaseLabel: `⚠ ${msg}` });
    }
  }

  /** Ripristina task da DB al boot */
  restoreTask(task: DownloadTask) {
    if (this.tasks.has(task.gameId)) return;
    if (task.status === 'downloading') task.status = 'paused';
    task.phase      = task.status;
    task.phaseLabel = PHASE_LABELS[task.status] ?? task.status;
    this.tasks.set(task.gameId, task);
  }

  getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  // -------------------------------------------------------------------------
  // API pubblica
  // -------------------------------------------------------------------------

  addTask(
    gameId:   string,
    title:    string,
    store:    string,
    winetricksVerbs: string[] = DEFAULT_WINETRICKS_VERBS,
    disableWineSync: boolean = false,
    useKnownFixes:   boolean = false,
    installOnlyEnv?: Record<string, string>
  ): { success: boolean; message?: string } {
    if (this.tasks.has(gameId)) return { success: false, message: 'Installazione già in corso per questo gioco' };

    // v0.99.36 — Step 2: non iniziare a scrivere sulla prefix
    // (wineboot/winetricks/estrazione) se il gioco risulta già in
    // esecuzione — stesso conflitto di lock che si vuole evitare in
    // senso opposto (vedi gameManager.launchGame).
    if (this.runningGameChecker?.(gameId)) {
      const msg = `${title} è in esecuzione — chiudilo prima di reinstallare`;
      writeLog('error', `[INSTALL] Blocked — ${msg}`);
      try { db.insertLog({ timestamp: new Date().toLocaleTimeString([], { hour12: false }), message: `[INSTALL] Blocked — ${msg}`, type: 'error' }); } catch {}
      return { success: false, message: msg };
    }

    const slug          = slugFromId(gameId);
    const base          = path.join(storeDir(store), slug);
    const installPath   = path.join(base, 'files');
    // v0.99.38 — cattura il runner selezionato nell'overlay PRIMA di
    // installare, cosi la prefix viene inizializzata con quel runner
    // invece che sempre con wine di sistema (vedi resolveRunnerWineEnv).
    // Step 19d — letto QUI (non più separatamente più sotto) anche per
    // requiresLauncher: BUG REALE trovato dall'utente installando un
    // gioco Ubisoft da Epic — lo switch "Launcher condiviso" in Game
    // Options scrive game.requiresLauncher, ma questa funzione guardava
    // SOLO store==='Ubisoft' (cioè solo Ubisoft Connect stesso), mai
    // questo campo sui giochi NORMALI che lo dichiarano — legendary
    // scaricava e creava sempre una prefix isolata di default, ignorando
    // del tutto la scatola condivisa. Ora qualunque gioco con
    // requiresLauncher impostato (indipendentemente dallo store) usa la
    // stessa scatola condivisa di quel launcher, esattamente come
    // Ubisoft Connect stesso.
    const gameRow = db.getGameById(gameId);
    const requiresLauncher = gameRow?.requiresLauncher;
    // v1.5.20-dev.10 — generalizzato: prima riconosceva SOLO Ubisoft
    // Connect stesso (store === 'Ubisoft' hardcoded), ora qualunque
    // launcher terzo presente nel registro (thirdPartyLaunchers.ts) —
    // installare EA App/Battle.net/Rockstar in futuro userà la stessa
    // scatola condivisa senza toccare questa riga.
    const selfLauncherDef = getThirdPartyLauncherByStoreId(store);
    const prefixPath    = selfLauncherDef
      ? getSharedPrefixBasePath(selfLauncherDef.id)
      : requiresLauncher
        ? getSharedPrefixBasePath(requiresLauncher)
        : path.join(base, 'prefix');
    const installerPath = path.join(base, 'installer');

    // db.getGameById può restituire undefined se il gioco non è ancora
    // mai stato persistito (caso limite, non dovrebbe succedere dato che
    // arriviamo qui sempre da un gioco già nella libreria sincronizzata)
    // — in quel caso resolveRunnerWineEnv ripiega comunque su wine di
    // sistema, comportamento invariato.
    const runner = gameRow?.runner;

    const task: DownloadTask = {
      gameId, gameTitle: title, store,
      progress: 0, status: 'queued', phase: 'queued',
      phaseLabel: PHASE_LABELS.queued,
      speed: '0 MB/s', bytesDownloaded: 0, totalBytes: 0,
      installPath, prefixPath, installerPath,
      winetricksVerbs,
      disableWineSync,
      useKnownFixes,
      runner,
      installOnlyEnv,
    };

    this.tasks.set(gameId, task);
    this.notify(task);
    this.startTask(task);
    return { success: true };
  }

  pauseTask(gameId: string) {
    const task = this.tasks.get(gameId);
    if (!task || task.status !== 'downloading') return;
    const proc = this.procs.get(gameId);
    if (proc) proc.kill('SIGSTOP');
    this.update(task, { status: 'paused', speed: '0 MB/s' });
  }

  resumeTask(gameId: string) {
    const task = this.tasks.get(gameId);
    if (!task || task.status !== 'paused') return;
    const proc = this.procs.get(gameId);
    if (proc) {
      proc.kill('SIGCONT');
      this.update(task, { status: 'downloading' });
    } else {
      this.startTask(task);
    }
  }

  // v0.99.38 — cancelTask ora elimina davvero i dati parziali su disco
  // (installer scaricato, prefix creata, file eventualmente già estratti),
  // non solo la riga in downloads e il processo. Prima di questa modifica
  // "cancel" smetteva solo di tracciare il task, ma lasciava GB di dati
  // parziali sul disco — per un utente che ha deciso di NON installare più
  // quel titolo, è uno spreco di spazio silenzioso, scoperto solo
  // controllando manualmente ~/Games.
  //
  // Elimina l'intera cartella base del gioco (store/slug), che contiene
  // installer/, prefix/ e files/ — più sicuro e completo che cancellare i
  // tre path singolarmente (garantisce che non resti nulla, incluse
  // eventuali sottocartelle impreviste). Guardia esplicita: rifiuta di
  // cancellare se il path risolto non ricade sotto GAMES_ROOT, per non
  // rischiare mai un rm -rf fuori scope anche in caso di dati corrotti.
  cancelTask(gameId: string) {
    const task = this.tasks.get(gameId);
    const proc = this.procs.get(gameId);
    if (proc) proc.kill('SIGTERM');
    this.procs.delete(gameId);
    this.tasks.delete(gameId);
    db.deleteDownload(gameId);

    if (task) {
      const slug = slugFromId(gameId);
      const base = path.join(storeDir(task.store), slug);
      const resolvedBase = path.resolve(base);
      const resolvedRoot = path.resolve(GAMES_ROOT);
      if (resolvedBase.startsWith(resolvedRoot + path.sep) && existsSync(resolvedBase)) {
        try {
          rmSync(resolvedBase, { recursive: true, force: true });
          writeLog('system', `[CANCEL] ${task.gameTitle}: partial data removed (${resolvedBase})`);
        } catch (e) {
          writeLog('error', `[CANCEL] ${task.gameTitle}: failed to remove partial data — ${e}`);
        }
      } else if (!resolvedBase.startsWith(resolvedRoot + path.sep)) {
        writeLog('error', `[CANCEL] ${task.gameTitle}: path "${resolvedBase}" outside GAMES_ROOT — removal refused for safety.`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Flusso principale
  // -------------------------------------------------------------------------

  private async startTask(task: DownloadTask) {
    try {
      if (task.store === 'GOG Galaxy')  await this.runGOG(task);
      else if (task.store === 'Epic Games') await this.runEpic(task);
      else if (task.store === 'Amazon Games') await this.runAmazon(task);
      else {
        // v1.5.20-dev.10 — generalizzato da "solo Ubisoft" a "qualunque
        // launcher terzo condiviso presente nel registro" — un nuovo
        // plugin (EA App, Battle.net, Rockstar) non richiede più
        // toccare questo dispatch, basta comparire in
        // thirdPartyLaunchers.ts con lo storeId giusto.
        const thirdPartyDef = getThirdPartyLauncherByStoreId(task.store);
        if (thirdPartyDef) await this.runThirdPartyLauncherInstall(task, thirdPartyDef);
      }
    } catch (err: any) {
      const msg = err?.stack ?? String(err);
      writeLog('error', `[DOWNLOAD ERROR] ${task.gameTitle}:\n${msg}`);
      db.insertLog({
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        message: `[DOWNLOAD] ${task.gameTitle} — errore: ${msg}`,
        type: 'error',
      });
      this.update(task, { status: 'error', error: String(err), speed: '0 MB/s' });
      for (const cb of this.errorCallbacks) { try { cb(task.gameId, task.gameTitle, String(err), err?.recentOutput); } catch {} }
    }
  }

  // -------------------------------------------------------------------------
  // GOG: download → prefix → deps → install
  // -------------------------------------------------------------------------

  private async runGOG(task: DownloadTask) {
    const slug = slugFromId(task.gameId);

    this.log(task, 'system', `[GOG] Pipeline: ${task.gameTitle} (slug: ${slug})`);
    this.log(task, 'system', `[GOG] installPath:   ${task.installPath}`);
    this.log(task, 'system', `[GOG] prefixPath:    ${task.prefixPath}`);
    this.log(task, 'system', `[GOG] installerPath: ${task.installerPath}`);

    if (!binaryExists('lgogdownloader')) {
      throw new Error('lgogdownloader non trovato. Installa con: yay -S lgogdownloader');
    }
    this.log(task, 'system', `[GOG] lgogdownloader: OK`);

    // Step 1: Download installer Windows
    if (task.status === 'queued' || task.status === 'downloading') {
      ensureDir(task.installerPath!);
      this.update(task, { status: 'downloading', progress: 0 });
      this.log(task, 'system', `[GOG] Step 1 — Download in: ${task.installerPath}`);

      await this.spawnWithProgress(task, 'lgogdownloader', [
        '--download',
        '--platform', 'w',
        '--game', slug,
        '--directory', task.installerPath!,
        '--no-color',
        '--progress-interval', '-1',
        // v0.99.35 — stesso bug già diagnosticato e corretto per la
        // lettura libreria (gogPlugin.ts:124, vedi commento lì per il
        // dettaglio completo): senza questo flag, lgogdownloader può
        // non rilevare correttamente la build per piattaforma "w"
        // (Windows) per alcuni titoli, restituendo un set di file
        // vuoto senza segnalare errore — esattamente il sintomo
        // osservato (processo termina con successo, cartella
        // installer resta vuota). La correzione di ieri aveva toccato
        // solo il flusso di lettura libreria, non quello di download
        // effettivo — due chiamate lgogdownloader distinte nel codice.
        '--no-platform-detection',
      ], makeLgogProgressParser());

      const downloaded = existsSync(task.installerPath!) ? readdirSync(task.installerPath!) : [];
      this.log(task, 'system', `[GOG] Step 1 OK — file: ${downloaded.join(', ') || '(nessuno)'}`);
    }

    // v0.99.35 — sync esplicito tra fine download e inizio creazione
    // prefix. Vedi commento estesso identico in runEpic — stesso
    // meccanismo ipotizzato (dirty pages residue dopo download
    // lunghi), applicato per coerenza anche qui anche se il sintomo
    // finora osservato è specifico al flusso Epic.
    this.log(task, 'system', `[GOG] Sync filesystem prima della creazione prefix...`);
    await execFileAsync('sync').catch(() => {});

    // Step 2: Crea prefix Wine isolata
    this.log(task, 'system', `[GOG] Step 2 — Creazione prefix in: ${task.prefixPath}`);
    this.update(task, { status: 'creating_prefix', progress: 0, speed: '' });
    ensureDir(task.prefixPath);

    // v0.99.38 — risolve binario e percorso reale in base al runner
    // selezionato nell'overlay PRIMA di installare (vedi
    // resolveRunnerWineEnv) — prima la prefix veniva sempre creata con
    // wine di sistema, indipendentemente dal runner scelto, causando
    // confusione in caso di malfunzionamento con un runner alternativo.
    const wineEnv = resolveRunnerWineEnv(task.runner, task.prefixPath);
    if (task.runner && task.runner !== 'Wine-Lutris') {
      this.log(task, 'system',
        wineEnv.wineBin !== 'wine'
          ? `[GOG] Runner selezionato: ${task.runner} — prefix inizializzata con ${wineEnv.wineBin} in ${wineEnv.winePrefixPath}`
          : `[GOG] Runner "${task.runner}" non risolto sul disco — fallback su wine di sistema.`
      );
    }
    ensureDir(wineEnv.winePrefixPath);

    // v0.99.35 — Step 1 del confronto con Heroic: preparazione prefix
    // estratta in winePrefixManager.ts, condivisa con runEpic, invece
    // di duplicare la stessa sequenza in entrambi i flussi. Vedi quel
    // modulo per la motivazione completa (wineboot + wineserver --wait,
    // non solo wineboot da solo).
    const prefixResult = await prepareWinePrefix(
      task,
      {
        prefixPath: wineEnv.winePrefixPath,
        disableWineSync: task.disableWineSync,
        wineBootTimeoutMs: WINEBOOT_TIMEOUT_MS,
        wineBin: wineEnv.wineBin,
        wineserverBin: wineEnv.wineserverBin,
      },
      (t, bin, args, env, timeout) => this.spawnWithTimeout(t, bin, args, { ...env, ...wineEnv.extraEnv }, timeout),
      (t, level, msg) => this.log(t, level, msg),
    );
    if (!prefixResult.success) {
      throw new Error(prefixResult.error ?? '[GOG] Preparazione prefix fallita');
    }
    this.log(task, 'system', `[GOG] Step 2 OK — prefix pronta.`);

    // v0.99.37 — stesso meccanismo già presente in runEpic (vedi commento
    // esteso lì), ora esteso a GOG. Richiede un passaggio in più rispetto
    // a Epic: risolvere lo slug testuale nell'ID numerico GOG richiesto
    // dal naming del repository Heroic (vedi fetchGogNumericId).
    if (task.useKnownFixes) {
      const numericId = await fetchGogNumericId(slug);
      if (numericId) {
        const fix = await fetchKnownFixes(numericId, 'gog');
        if (fix?.winetricks && fix.winetricks.length > 0) {
          const safeVerbs = sanitizeKnownFixVerbs(fix.winetricks, 'GOG', (msg) => this.log(task, 'error', msg));
          task.winetricksVerbs = safeVerbs;
          this.log(task, 'system', `[GOG] Known fix trovato (Heroic, id ${numericId}): ${safeVerbs.join(', ')}`);
          try {
            const currentProfile = db.getCompatProfile(task.gameId) ?? {
              fsr: false, gameMode: false, mangohud: 0, eac: false, battleye: false,
            };
            db.upsertCompatProfile(task.gameId, {
              ...currentProfile,
              winetricksVerbs: safeVerbs,
              // v0.99.38 — conservate solo per consultazione manuale (es.
              // dallo script di test o dall'overlay), MAI applicate in
              // automatico a executablePath/launchArgs — vedi
              // CompatibilityProfile.knownFixesNotes.
              knownFixesNotes: fix.notes,
            });
            this.log(task, 'system', `[GOG] Profilo compat aggiornato in modo permanente con i verb Heroic.`);
            if (fix.notes && Object.keys(fix.notes).length > 0) {
              this.log(task, 'system', `[GOG] Note Heroic disponibili per questo titolo (consultabili, non applicate in automatico): ${JSON.stringify(fix.notes)}`);
            }
          } catch (e) {
            this.log(task, 'error', `[GOG] Salvataggio profilo compat (Heroic) fallito: ${e}`);
          }
          for (const cb of this.knownFixesCallbacks) {
            try { cb(task.gameId, task.gameTitle, true, safeVerbs); } catch {}
          }
        } else {
          this.log(task, 'system', `[GOG] Nessun known fix (Heroic) per id ${numericId} — uso i verb configurati.`);
          for (const cb of this.knownFixesCallbacks) {
            try { cb(task.gameId, task.gameTitle, false); } catch {}
          }
        }
      } else {
        this.log(task, 'system', `[GOG] ID numerico non risolto — known-fixes saltato, uso i verb configurati.`);
        for (const cb of this.knownFixesCallbacks) {
          try { cb(task.gameId, task.gameTitle, false); } catch {}
        }
      }
    }

    // Step 3: Dipendenze winetricks
    const gogVerbs = filterVerbsForEnv(task.winetricksVerbs);
    if (gogVerbs.length > 0 && binaryExists('winetricks')) {
      this.log(task, 'system', `[GOG] Step 3 — Verbs: ${gogVerbs.join(', ')}`);
      this.update(task, { status: 'installing_deps', progress: 0 });
      for (let i = 0; i < gogVerbs.length; i++) {
        const verb = gogVerbs[i];
        this.log(task, 'system', `[GOG] Step 3 — ${verb} (${i + 1}/${gogVerbs.length})`);
        this.update(task, {
          progress:   Math.round((i / gogVerbs.length) * 100),
          phaseLabel: `Dipendenze: ${verb}...`,
        });
        await this.spawnWithTimeout(task, 'winetricks', ['--unattended', verb], {
          WINEPREFIX:     wineEnv.winePrefixPath,
          WINEDEBUG:      '-all',
          WINETRICKS_GUI: 'none',
          ...wineEnv.extraEnv,
        }, winetrickTimeoutFor(verb));
        this.log(task, 'system', `[GOG] Step 3 — ${verb}: OK`);
      }
    } else if (task.winetricksVerbs.length > 0) {
      this.log(task, 'error', `[GOG] winetricks non trovato — dipendenze saltate`);
    }
    persistWinetricksVerbs(task.gameId, task.winetricksVerbs);

    // Step 4: Cerca installer .exe — lgogdownloader crea una sottocartella col nome del gioco
    // Struttura attesa: installer/<slug>/setup_<slug>_<ver>.exe
    let findExeResult = '';
    try {
      findExeResult = execSync(
        `find "${task.installerPath}" -type f -iname "setup*.exe" | head -1`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
    } catch { /* find non ha trovato nulla */ }

    // Fallback: qualsiasi .exe che non sia un extra
    if (!findExeResult) {
      try {
        findExeResult = execSync(
          `find "${task.installerPath}" -type f -iname "*.exe" ! -path "*/extras/*" | head -1`,
          { encoding: 'utf-8', timeout: 5000 }
        ).trim();
      } catch { /* nessun exe */ }
    }

    this.log(task, 'system', `[GOG] Step 4 — Installer trovato: ${findExeResult || '(nessuno)'}`);

    if (!findExeResult) {
      const allFound = execSync(`find "${task.installerPath}" -type f`, { encoding: 'utf-8', timeout: 5000 }).trim();
      this.log(task, 'error', `[GOG] File trovati in installer dir:\n${allFound || '(nessuno)'}`);
      throw new Error(
        `[GOG] Nessun installer .exe in ${task.installerPath}. ` +
        `Il download lgogdownloader e' andato a buon fine? Controlla le credenziali GOG.`
      );
    }

    const installer = findExeResult;

    // Step 5: Estrazione con innoextract (no Wine, no GUI, no botva2)
    this.log(task, 'system', `[GOG] Step 5 — innoextract: ${installer} → ${task.installPath}`);
    this.update(task, { status: 'installing_game', progress: 0, phaseLabel: 'Estrazione gioco...' });
    ensureDir(task.installPath);

    if (!binaryExists('innoextract')) {
      throw new Error('[GOG] innoextract non trovato. Installa con: sudo pacman -S innoextract');
    }

    // v0.99.35 — timeout di inattività invece di assoluto fisso: SOMA
    // ha superato 17GB scritti con I/O ancora pieno (STAT=D, confermato
    // via /proc/<pid>/io) quando il vecchio timeout fisso di 10 minuti
    // ha terminato un processo genuinamente al lavoro. idleTimeoutMs
    // resta basso (il processo va ucciso rapidamente se DAVVERO smette
    // di scrivere) — timeoutMs (assoluto) sale a 2 ore solo come rete
    // di sicurezza estrema, non come limite operativo reale: per
    // installer molto grandi il vincolo che conta è "fai ancora I/O?",
    // non "quanto tempo è passato in totale".
    await this.spawnWithTimeout(task, 'innoextract', [
      installer,
      '--output-dir', task.installPath,
      '--progress=1',
      '--gog',
    ], {}, 7_200_000, {
      idleTimeoutMs:    300_000,
      inactivityPollMs: 10_000,
      // v0.99.35 — barra di progresso reale durante l'estrazione,
      // invece di restare ferma a 0% fino al completamento (sintomo
      // segnalato dall'utente dopo il primo test del timeout di
      // inattività). Formato verificato con test diretto sul log
      // reale di SOMA — vedi parseInnoextractProgress.
      progressParser:   parseInnoextractProgress,
    });
    this.log(task, 'system', `[GOG] Step 5 OK — estrazione completata.`);

    // Risoluzione exe da goggame-*.info (sorgente autorevole)
    const gogResolved = resolveGogExe(task.installPath);
    let gogExePath:    string | undefined;
    let gogLaunchArgs: string | undefined;
    let gogLaunchCwd:  string | undefined;

    if (gogResolved) {
      gogExePath    = gogResolved.exePath;
      gogLaunchArgs = gogResolved.launchArgs || undefined;
      gogLaunchCwd  = gogResolved.launchCwd  || undefined;
      this.log(task, 'system', `[GOG] Step 6 — Exe da goggame-*.info: ${gogExePath}`);
      if (gogLaunchArgs) this.log(task, 'system', `[GOG] Step 6 — Args: ${gogLaunchArgs}`);
      if (gogLaunchCwd)  this.log(task, 'system', `[GOG] Step 6 — CWD: ${gogLaunchCwd}`);
    } else {
      // Fallback filesystem
      gogExePath = findMainExe(task.installPath) ?? undefined;
      this.log(task, 'system', `[GOG] Step 6 — ⚠ Exe da filesystem (fallback): ${gogExePath ?? 'non trovato'}`);
    }

    this.update(task, {
      status: 'completed',
      progress: 100,
      phaseLabel: PHASE_LABELS.completed,
      executablePath: gogExePath,
      launchArgs:     gogLaunchArgs,
      launchCwd:      gogLaunchCwd,
      prefixPath:     task.prefixPath,
    });
    this.procs.delete(task.gameId);
    for (const cb of this.completeCallbacks) { try { cb(task.gameId, task.gameTitle); } catch {} }
  }

  // -------------------------------------------------------------------------
  // Epic: legendary install → prefix → deps
  // -------------------------------------------------------------------------

  private async runEpic(task: DownloadTask) {
    const appName = task.gameId.replace(/^epic-/, '');

    if (!binaryExists('legendary')) {
      throw new Error('legendary non trovato. Installa con: yay -S legendary-gl');
    }

    // Step 1: Download + estrazione via legendary
    // legendary installa in <base-path>/<AppName>/ — usiamo direttamente
    // task.installPath come base-path così i file vanno dove ci aspettiamo.
    ensureDir(task.installPath);
    this.update(task, { status: 'downloading', progress: 0 });

    await this.spawnWithProgress(task, 'legendary', [
      'install', appName,
      '--base-path', task.installPath,
      '--yes',
      '--skip-sdl',   // evita prompt SDL che in alcune versioni ignora --yes
    ], makeLegendaryProgressParser());

    // v0.99.35 — sync esplicito tra fine download e inizio creazione
    // prefix. Ipotesi in verifica: dopo un download lungo (24+ GB),
    // il kernel può avere ancora pagine "dirty" non sincronizzate sul
    // disco fisico nel momento in cui legendary segnala il
    // completamento — wineboot, scrivendo subito dopo centinaia di
    // piccoli file (registro, dosdevices, drive_c), potrebbe
    // competere per I/O con quella sincronizzazione residua. Spiega
    // perché il blocco si manifesta solo con download di rete reali
    // e prolungati, mai quando i file sono già presenti sul disco
    // (verificato: stesso identico flusso, file pre-esistenti, nessun
    // blocco) né nei test manuali con prefix isolate (mai precedute
    // da un download nello stesso processo). `sync` forza il flush
    // completo prima di procedere — costo tipicamente minimo (pochi
    // secondi anche con molti dati in coda), nessun effetto negativo
    // se l'ipotesi risultasse sbagliata.
    this.log(task, 'system', `[EPIC] Sync filesystem prima della creazione prefix...`);
    await execFileAsync('sync').catch(() => {
      // sync non dovrebbe mai fallire su Linux — se capita, non è
      // comunque motivo di bloccare l'installazione.
    });

    // Step 2: Crea prefix Wine isolato
    this.update(task, { status: 'creating_prefix', progress: 0, speed: '' });
    ensureDir(task.prefixPath);

    // v0.99.38 — stesso meccanismo di runGOG (vedi commento esteso lì):
    // usa il runner effettivamente selezionato nell'overlay per decidere
    // dove e con quale binario inizializzare la prefix.
    const wineEnv = resolveRunnerWineEnv(task.runner, task.prefixPath);
    if (task.runner && task.runner !== 'Wine-Lutris') {
      this.log(task, 'system',
        wineEnv.wineBin !== 'wine'
          ? `[EPIC] Runner selezionato: ${task.runner} — prefix inizializzata con ${wineEnv.wineBin} in ${wineEnv.winePrefixPath}`
          : `[EPIC] Runner "${task.runner}" non risolto sul disco — fallback su wine di sistema.`
      );
    }
    ensureDir(wineEnv.winePrefixPath);

    // v0.99.35 — Step 1 del confronto con Heroic: stesso modulo
    // condiviso usato in runGOG, vedi winePrefixManager.ts.
    const prefixResult = await prepareWinePrefix(
      task,
      {
        prefixPath: wineEnv.winePrefixPath,
        disableWineSync: task.disableWineSync,
        wineBootTimeoutMs: WINEBOOT_TIMEOUT_MS,
        wineBin: wineEnv.wineBin,
        wineserverBin: wineEnv.wineserverBin,
      },
      (t, bin, args, env, timeout) => this.spawnWithTimeout(t, bin, args, { ...env, ...wineEnv.extraEnv }, timeout),
      (t, level, msg) => this.log(t, level, msg),
    );
    if (!prefixResult.success) {
      throw new Error(prefixResult.error ?? '[EPIC] Preparazione prefix fallita');
    }

    // v0.99.35 — se l'utente ha attivato "Usa Known Fixes (Heroic)",
    // interroga il repository pubblico per un fix noto specifico a
    // questo gioco (match esatto via appName, vedi fetchKnownFixes).
    // Se trovato, i suoi winetricks sostituiscono quelli configurati
    // manualmente — altrimenti fallback silenzioso ai verb già
    // presenti su task.winetricksVerbs (default del runner o
    // selezione utente). Notifica l'esito in ogni caso, per
    // trasparenza su cosa sta realmente installando.
    let verbsForInstall = task.winetricksVerbs;
    if (task.useKnownFixes) {
      const fix = await fetchKnownFixes(appName, 'epic');
      if (fix?.winetricks && fix.winetricks.length > 0) {
        const safeVerbs = sanitizeKnownFixVerbs(fix.winetricks, 'EPIC', (msg) => this.log(task, 'error', msg));
        verbsForInstall = safeVerbs;
        this.log(task, 'system', `[EPIC] Known fix trovato (Heroic): ${safeVerbs.join(', ')}`);
        // v0.99.35 — scrittura indietro sul profilo compat persistito:
        // i verb trovati da Heroic diventano la configurazione
        // permanente di default per questo titolo, non solo
        // un'informazione temporanea di questa singola installazione.
        // Preserva tutti gli altri campi del profilo (fsr/gameMode/
        // ecc.), aggiorna solo winetricksVerbs — così riaprendo
        // l'overlay dopo l'installazione l'utente vede esattamente
        // cosa è stato realmente installato, non i verb di default
        // configurati prima del lookup.
        try {
          const currentProfile = db.getCompatProfile(task.gameId) ?? {
            fsr: false, gameMode: false, mangohud: 0, eac: false, battleye: false,
          };
          db.upsertCompatProfile(task.gameId, {
            ...currentProfile,
            winetricksVerbs: safeVerbs,
            knownFixesNotes: fix.notes,
          });
          this.log(task, 'system', `[EPIC] Profilo compat aggiornato in modo permanente con i verb Heroic.`);
          if (fix.notes && Object.keys(fix.notes).length > 0) {
            this.log(task, 'system', `[EPIC] Note Heroic disponibili per questo titolo (consultabili, non applicate in automatico): ${JSON.stringify(fix.notes)}`);
          }
        } catch (e) {
          this.log(task, 'error', `[EPIC] Salvataggio profilo compat (Heroic) fallito: ${e}`);
        }
        for (const cb of this.knownFixesCallbacks) {
          try { cb(task.gameId, task.gameTitle, true, safeVerbs); } catch {}
        }
      } else {
        this.log(task, 'system', `[EPIC] Nessun known fix (Heroic) per questo gioco — uso i verb configurati.`);
        for (const cb of this.knownFixesCallbacks) {
          try { cb(task.gameId, task.gameTitle, false); } catch {}
        }
      }
    }

    // Step 3: Dipendenze winetricks
    const epicVerbs = filterVerbsForEnv(verbsForInstall);
    if (epicVerbs.length > 0 && binaryExists('winetricks')) {
      this.update(task, { status: 'installing_deps', progress: 0 });
      for (let i = 0; i < epicVerbs.length; i++) {
        const verb = epicVerbs[i];
        this.update(task, {
          progress:   Math.round((i / epicVerbs.length) * 100),
          phaseLabel: `Installazione dipendenze: ${verb}...`,
        });
        await this.spawnWithTimeout(task, 'winetricks', ['--unattended', verb], {
          WINEPREFIX:     wineEnv.winePrefixPath,
          WINEDEBUG:      '-all',
          WINETRICKS_GUI: 'none',
          ...wineEnv.extraEnv,
        }, winetrickTimeoutFor(verb));
      }
    }
    persistWinetricksVerbs(task.gameId, verbsForInstall);

    // Risoluzione exe da sorgente autorevole (legendary info)
    const epicResolved = await resolveEpicExe(appName);
    let exePath:   string | undefined;
    let launchArgs: string | undefined;

    if (epicResolved) {
      exePath    = epicResolved.exePath;
      launchArgs = epicResolved.launchArgs || undefined;
      this.log(task, 'system', `[EPIC] Exe da legendary: ${exePath}`);
      if (launchArgs) this.log(task, 'system', `[EPIC] Launch args: ${launchArgs}`);
    } else {
      // Fallback filesystem
      exePath = findMainExe(task.installPath) ?? undefined;
      this.log(task, 'system', `[EPIC] ⚠ Exe da filesystem (fallback): ${exePath ?? 'non trovato'}`);
    }

    this.update(task, {
      status: 'completed',
      progress: 100,
      phaseLabel: PHASE_LABELS.completed,
      executablePath: exePath,
      launchArgs,
      prefixPath: task.prefixPath,
    });
    this.procs.delete(task.gameId);
    for (const cb of this.completeCallbacks) { try { cb(task.gameId, task.gameTitle); } catch {} }
  }

  /**
   * v1.1.111-dev.1 — Step 19c, Amazon Games via nile. Stessa struttura di
   * runEpic sopra (progresso, prefix Wine, winetricks, ricerca eseguibile),
   * verificata voce per voce con output reale fornito dall'utente:
   *   - `nile install <product.id> --base-path <path>` (verificato:
   *     --install --help dice esplicitamente "It'll append save filename
   *     to that path" — stesso comportamento di legendary --base-path)
   *   - Formato di progresso VERIFICATO con log reale di un'installazione
   *     completa (Art of Fighting 3, ~53MB): righe INFO [PROGRESS] separate
   *     da newline normale (mai \r, a differenza di legendary/
   *     lgogdownloader) — vedi makeNileProgressParser sotto per il
   *     dettaglio di un artefatto di nile scoperto in quel log (la
   *     percentuale stampata è "in ritardo" di una riga rispetto alla
   *     vera frazione byte, quindi ignorata: calcolata sempre da noi).
   *
   * NON ancora implementato, esplicitamente non indovinato: known-fixes
   * Heroic per Amazon (fetchKnownFixes usa un percorso di repository
   * verificato solo per 'gog'/'epic' — non ho verificato se esiste una
   * cartella equivalente per Amazon in quel repository, quindi
   * task.useKnownFixes viene ignorato qui per ora, non applicato a
   * caso). Ricerca eseguibile: nessun equivalente verificato di
   * `legendary info --json` per nile (nessun sottocomando "info" a sé,
   * solo il flag --info su install, che per un gioco NON installato
   * mostra solo download_size — non verificato cosa mostri su un gioco
   * già installato) — usa direttamente findMainExe() sul filesystem,
   * stesso fallback già collaudato e affidabile usato da Epic quando
   * legendary info non risolve.
   */
  private async runAmazon(task: DownloadTask) {
    const productId = task.gameId.replace(/^amazon-/, '');

    if (!binaryExists('nile')) {
      throw new Error('nile non trovato. Installa con: yay -S nile-git');
    }

    // Step 1: Download via nile
    ensureDir(task.installPath);
    this.update(task, { status: 'downloading', progress: 0 });

    await this.spawnWithProgress(task, 'nile', [
      'install', productId,
      '--base-path', task.installPath,
    ], makeNileProgressParser());

    // v0.99.35 — stesso sync esplicito già usato in runEpic/runGOG (vedi
    // commento esteso lì) tra fine download e inizio creazione prefix.
    this.log(task, 'system', `[AMAZON] Sync filesystem prima della creazione prefix...`);
    await execFileAsync('sync').catch(() => {});

    // Step 2: Crea prefix Wine isolato — stesso meccanismo di runEpic/runGOG.
    this.update(task, { status: 'creating_prefix', progress: 0, speed: '' });
    ensureDir(task.prefixPath);

    const wineEnv = resolveRunnerWineEnv(task.runner, task.prefixPath);
    if (task.runner && task.runner !== 'Wine-Lutris') {
      this.log(task, 'system',
        wineEnv.wineBin !== 'wine'
          ? `[AMAZON] Runner selezionato: ${task.runner} — prefix inizializzata con ${wineEnv.wineBin} in ${wineEnv.winePrefixPath}`
          : `[AMAZON] Runner "${task.runner}" non risolto sul disco — fallback su wine di sistema.`
      );
    }
    ensureDir(wineEnv.winePrefixPath);

    const prefixResult = await prepareWinePrefix(
      task,
      {
        prefixPath: wineEnv.winePrefixPath,
        disableWineSync: task.disableWineSync,
        wineBootTimeoutMs: WINEBOOT_TIMEOUT_MS,
        wineBin: wineEnv.wineBin,
        wineserverBin: wineEnv.wineserverBin,
      },
      (t, bin, args, env, timeout) => this.spawnWithTimeout(t, bin, args, { ...env, ...wineEnv.extraEnv }, timeout),
      (t, level, msg) => this.log(t, level, msg),
    );
    if (!prefixResult.success) {
      throw new Error(prefixResult.error ?? '[AMAZON] Preparazione prefix fallita');
    }

    // Step 3: Dipendenze winetricks — nessun lookup Known Fixes Heroic
    // per ora (vedi commento in cima alla funzione): usa direttamente i
    // verb configurati/selezionati dall'utente.
    const amazonVerbs = filterVerbsForEnv(task.winetricksVerbs);
    if (amazonVerbs.length > 0 && binaryExists('winetricks')) {
      this.update(task, { status: 'installing_deps', progress: 0 });
      for (let i = 0; i < amazonVerbs.length; i++) {
        const verb = amazonVerbs[i];
        this.update(task, {
          progress:   Math.round((i / amazonVerbs.length) * 100),
          phaseLabel: `Installazione dipendenze: ${verb}...`,
        });
        await this.spawnWithTimeout(task, 'winetricks', ['--unattended', verb], {
          WINEPREFIX:     wineEnv.winePrefixPath,
          WINEDEBUG:      '-all',
          WINETRICKS_GUI: 'none',
          ...wineEnv.extraEnv,
        }, winetrickTimeoutFor(verb));
      }
    }
    persistWinetricksVerbs(task.gameId, task.winetricksVerbs);

    // Risoluzione exe da filesystem — nessun equivalente verificato di
    // `legendary info --json` per nile, vedi commento in cima alla
    // funzione.
    const exePath = findMainExe(task.installPath) ?? undefined;
    this.log(task, 'system', `[AMAZON] Exe da filesystem: ${exePath ?? 'non trovato'}`);

    this.update(task, {
      status: 'completed',
      progress: 100,
      phaseLabel: PHASE_LABELS.completed,
      executablePath: exePath,
      prefixPath: task.prefixPath,
    });
    this.procs.delete(task.gameId);
    for (const cb of this.completeCallbacks) { try { cb(task.gameId, task.gameTitle); } catch {} }
  }

  // -------------------------------------------------------------------------
  // Step 19d/dev.10 — Launcher terzi condivisi (Ubisoft Connect, e in
  // futuro EA App/Battle.net/Rockstar): nessun tool CLI scriptabile come
  // legendary/lgogdownloader/nile, l'utente scarica l'installer a mano dal
  // sito ufficiale. "Download" per questo task finisce non appena
  // sappiamo dove si trova quel file — non lo eseguiamo qui dentro:
  // l'installer diventa l'executablePath di questo "gioco", il primo
  // lancio (pipeline Play già esistente) lo esegue, e alla chiusura
  // scatta la verifica post-lancio (v0.99.35/36, ora delegata al plugin
  // via onLauncherProcessClosed — vedi gameManager.ts) — dove il vero
  // eseguibile viene ri-risolto e il bootstrap del prefix condiviso
  // registrato. Nessuna fase installing_deps/creating_prefix qui: quelle
  // risorse le prepara il flusso di lancio dei giochi Proton esistente,
  // non serve duplicarle in questo task.
  //
  // v1.5.20-dev.10 — generalizzata da runUbisoftConnect(task) a
  // runThirdPartyLauncherInstall(task, def): decisione esplicita con
  // l'utente, NON un plugin unico — questa resta la sola parte
  // davvero comune a qualunque launcher terzo (creazione prefix +
  // ricerca installer), ogni plugin mantiene le proprie particolarità
  // altrove (card, switch, libreria interna, rilevamento bootstrap).
  // -------------------------------------------------------------------------

  private async runThirdPartyLauncherInstall(task: DownloadTask, def: ThirdPartyLauncherDefinition) {
    const logTag = `[${def.displayName.toUpperCase()}]`;

    // Step 1 — prefix condivisa: stesso identico schema di runGOG/runEpic
    // (prepareWinePrefix condiviso), ma sul prefix CONDIVISO tra tutti i
    // giochi che dichiarano questa dipendenza (task.prefixPath è già
    // risolto a getSharedPrefixBasePath(def.id) in addTask), non uno
    // isolato per-gioco.
    this.log(task, 'system', `${logTag} Step 1 — Creazione/verifica prefix condivisa in: ${task.prefixPath}`);
    this.update(task, { status: 'creating_prefix', progress: 0, speed: '' });
    ensureDir(task.prefixPath);
    const wineEnv = resolveRunnerWineEnv(task.runner, task.prefixPath);
    // Step 19d — un launcher condiviso DEVE sempre girare su Proton (mai
    // Wine, decisione esplicita dell'utente per il supporto anticheat) —
    // se resolveRunnerWineEnv è ripiegata sul wine di sistema (runner non
    // trovato/non reale, es. un valore segnaposto mai sostituito con una
    // build Proton davvero installata), NON procediamo silenziosamente
    // creando un prefix Wine per una "scatola" che deve restare Proton.
    if (wineEnv.wineBin === 'wine') {
      throw new Error(
        `${logTag} Nessuna build Proton/GE-Proton risolta per il runner "${task.runner}" — ` +
        `seleziona una build Proton realmente installata in Game Options > Runner Bridge prima di installare.`
      );
    }
    ensureDir(wineEnv.winePrefixPath);
    const prefixResult = await prepareWinePrefix(
      task,
      {
        prefixPath: wineEnv.winePrefixPath,
        disableWineSync: task.disableWineSync,
        wineBootTimeoutMs: WINEBOOT_TIMEOUT_MS,
        wineBin: wineEnv.wineBin,
        wineserverBin: wineEnv.wineserverBin,
      },
      (t, bin, args, env, timeout) => this.spawnWithTimeout(t, bin, args, { ...env, ...wineEnv.extraEnv }, timeout),
      (t, level, msg) => this.log(t, level, msg),
    );
    if (!prefixResult.success) {
      throw new Error(prefixResult.error ?? `${logTag} Preparazione prefix fallita`);
    }
    this.log(task, 'system', `${logTag} Step 1 OK — prefix pronta.`);

    // Step 2 — dipendenze winetricks: stesso meccanismo di runGOG/runEpic.
    //
    // v2.0.41-dev.12 — BUG UTENTE (EA App): installer fallito con
    // INST-14-1603 ("errore fatale generico"), ampiamente documentato —
    // causa più ricorrente citata anche nelle guide ufficiali EA:
    // Visual C++ Redistributable mancanti/corrotti. Causa reale trovata:
    // `def.requiredWinetricksVerbs` (thirdPartyLaunchers.ts) esiste nel
    // registro ma non veniva MAI letto qui — task.winetricksVerbs arriva
    // dal frontend (Game Options > Winetricks Dependencies), che per un
    // launcher appena seedato è un array vuoto reale (non `undefined`),
    // quindi il parametro di default di addTask() (DEFAULT_WINETRICKS_VERBS)
    // non scattava mai: nessun verb veniva installato prima
    // dell'installer, indipendentemente da cosa dichiarato nel registro.
    // Fallback SOLO quando l'utente non ha esplicitamente scelto nulla —
    // se in futuro personalizza i verb dall'overlay, quella scelta vince
    // sempre, invariato.
    const requestedVerbs = task.winetricksVerbs.length > 0 ? task.winetricksVerbs : def.requiredWinetricksVerbs;
    const verbs = filterVerbsForEnv(requestedVerbs);
    if (verbs.length > 0 && binaryExists('winetricks')) {
      this.log(task, 'system', `${logTag} Step 2 — Verbs: ${verbs.join(', ')}`);
      this.update(task, { status: 'installing_deps', progress: 0 });
      for (let i = 0; i < verbs.length; i++) {
        const verb = verbs[i];
        this.log(task, 'system', `${logTag} Step 2 — ${verb} (${i + 1}/${verbs.length})`);
        this.update(task, {
          progress:   Math.round((i / verbs.length) * 100),
          phaseLabel: `Dipendenze: ${verb}...`,
        });
        await this.spawnWithTimeout(task, 'winetricks', ['--unattended', verb], {
          WINEPREFIX:     wineEnv.winePrefixPath,
          WINEDEBUG:      '-all',
          WINETRICKS_GUI: 'none',
          ...wineEnv.extraEnv,
        }, winetrickTimeoutFor(verb));
        this.log(task, 'system', `${logTag} Step 2 — ${verb}: OK`);
      }
    } else if (requestedVerbs.length > 0) {
      this.log(task, 'error', `${logTag} winetricks non trovato — dipendenze saltate`);
    }
    // v2.0.41-dev.12 — persiste requestedVerbs (quello REALMENTE
    // applicato, incluso l'eventuale fallback al registro), non
    // task.winetricksVerbs: altrimenti l'overlay Winetricks Dependencies
    // di Game Options mostrerebbe un elenco vuoto anche dopo
    // un'installazione che ha davvero applicato dei verb.
    persistWinetricksVerbs(task.gameId, requestedVerbs);

    // Step 3 — individua l'installer scaricato: nessun tool CLI
    // scriptabile come legendary/lgogdownloader/nile, l'utente lo scarica
    // a mano dal sito ufficiale (vedi installerUrl in thirdPartyLaunchers.ts).
    const found = findInstallerInDownloads(def.installerFilenameHints);
    if (!found) {
      this.log(task, 'system', `${logTag} Step 3 — Installer non trovato in ${resolveDownloadsDir() ?? '~/Downloads'}.`);
      this.update(task, {
        status: 'awaiting_installer',
        progress: 0,
        phaseLabel: PHASE_LABELS.awaiting_installer,
        downloadUrl: def.installerUrl,
      });
      return; // nessun errore — il task resta in attesa, vedi continueInstaller/browseInstaller
    }

    this.completeWithInstaller(task, found);
  }

  /** Segna il task completato con l'installer trovato come executablePath
   *  temporaneo — vedi commento esteso sopra su perché non lo eseguiamo qui. */
  private completeWithInstaller(task: DownloadTask, installerPath: string) {
    this.log(task, 'system', `[INSTALLER] ${installerPath}`);
    this.update(task, {
      status: 'completed',
      progress: 100,
      phaseLabel: PHASE_LABELS.completed,
      installerPath,
      executablePath: installerPath,
      prefixPath: task.prefixPath,
    });
    this.procs.delete(task.gameId);
    for (const cb of this.completeCallbacks) { try { cb(task.gameId, task.gameTitle); } catch {} }
  }

  /** Chiamato dall'endpoint installer-continue: l'utente dice di aver
   *  scaricato l'installer, ricontrolla la cartella Download reale. */
  continueInstaller(gameId: string): { success: boolean; message: string } {
    const task = this.tasks.get(gameId);
    if (!task || task.status !== 'awaiting_installer') {
      return { success: false, message: 'Nessuna installazione in attesa per questo gioco.' };
    }
    const def = getThirdPartyLauncherByStoreId(task.store);
    const found = findInstallerInDownloads(def?.installerFilenameHints);
    if (!found) {
      return { success: false, message: `Installer ancora non trovato in ${resolveDownloadsDir() ?? '~/Downloads'}.` };
    }
    this.completeWithInstaller(task, found);
    return { success: true, message: 'Installer trovato, installazione avviata.' };
  }

  /** Chiamato dall'endpoint installer-browse: apre il file picker nativo
   *  (zenity/kdialog) — vedi filePicker.ts, unico punto da sostituire in
   *  futuro con un file browser interno (in arrivo — Fase A.4). */
  async browseInstaller(gameId: string): Promise<{ success: boolean; message: string }> {
    const task = this.tasks.get(gameId);
    if (!task || task.status !== 'awaiting_installer') {
      return { success: false, message: 'Nessuna installazione in attesa per questo gioco.' };
    }
    const def = getThirdPartyLauncherByStoreId(task.store);
    const result = await browseForFile({
      title: `Seleziona l'installer di ${def?.displayName ?? task.gameTitle}`,
      startDir: resolveDownloadsDir() ?? undefined,
      // v1.5.20-dev.10 — richiesta utente: estesa a .msi/.cab, gli altri
      // formati comuni per un installer Windows oltre al semplice .exe.
      filter: { name: 'Installer Windows', extensions: ['exe', 'msi', 'cab'] },
    });
    if (result.outcome !== 'selected' || !result.path) {
      return { success: false, message: 'Nessun file selezionato.' };
    }
    this.completeWithInstaller(task, result.path);
    return { success: true, message: 'Installer selezionato, installazione avviata.' };
  }

  /**
   * v1.5.20-dev.12 — chiamato dall'endpoint installer-select: l'utente
   * ha scelto il file tramite il file manager nativo controller-
   * navigabile (Fase A.4), il path arriva già risolto dal client — a
   * differenza di browseInstaller() sopra, qui NON si invoca alcun
   * dialog nativo (zenity/kdialog), la selezione è già avvenuta
   * nell'overlay in-app. Stessa identica validazione/completamento.
   */
  confirmInstallerPath(gameId: string, filePath: string): { success: boolean; message: string } {
    const task = this.tasks.get(gameId);
    if (!task || task.status !== 'awaiting_installer') {
      return { success: false, message: 'Nessuna installazione in attesa per questo gioco.' };
    }
    if (!existsSync(filePath)) {
      return { success: false, message: 'Il file selezionato non esiste più.' };
    }
    this.completeWithInstaller(task, filePath);
    return { success: true, message: 'Installer selezionato, installazione avviata.' };
  }



  //
  // IMPORTANTE: lgogdownloader e legendary aggiornano la riga di progresso
  // usando \r (carriage return), non \n. Il buffer va splittato su entrambi.
  // -------------------------------------------------------------------------

  private spawnWithProgress(
    task:   DownloadTask,
    bin:    string,
    args:   string[],
    parser: (line: string) => { progress: number; speed: string } | null
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env:   buildSafeEnv(),
      });
      this.procs.set(task.gameId, proc);

      // v1.5.20-dev.13 — bug reale trovato investigando un errore utente:
      // stdout/stderr venivano letti SOLO per alimentare il parser di
      // progresso, mai scritti nel log — un fallimento (exit != 0)
      // produceva solo "legendary exited with code 1" senza alcuna
      // indicazione del perché, scartando in silenzio il messaggio
      // d'errore vero (spesso l'unica cosa utile per capire cosa è
      // successo: auth scaduta, gioco non posseduto/non scaricabile,
      // spazio esaurito, ecc.). Anello circolare delle ultime righe
      // (non l'intero output, alcuni tool sono verbosi) — scritto nel
      // log SOLO se il processo fallisce, altrimenti scartato come
      // prima per non gonfiare il log di ogni download riuscito.
      const RECENT_LINES_CAP = 40;
      const recentLines: string[] = [];

      const onLine = (line: string) => {
        recentLines.push(line);
        if (recentLines.length > RECENT_LINES_CAP) recentLines.shift();
        const parsed = parser(line.trim());
        if (parsed && task.status === 'downloading') {
          // v0.99.35 — Math.max() qui è ora solo una rete di sicurezza
          // minima (protegge da eventuale jitter di arrotondamento sui
          // valori "Remaining" riportati da lgogdownloader). La vera
          // causa del bug osservato (barra a dente di sega, poi falso
          // 99% bloccato col fix precedente) era nel PARSER stesso —
          // riscritto in makeLgogProgressParser() per usare il
          // progresso aggregato reale (Total size / Remaining) invece
          // delle percentuali per-slot dei 4 download paralleli che
          // lgogdownloader usa internamente — vedi quella funzione per
          // il dettaglio completo, incluso il log reale analizzato.
          this.update(task, {
            progress: Math.max(task.progress, Math.min(parsed.progress, 99)),
            speed:    parsed.speed || task.speed,
          });
        }
      };

      let buf = '';
      const handleData = (chunk: Buffer) => {
        buf += chunk.toString();
        // Split su \r e \n — lgogdownloader/legendary usano \r per le righe
        // di progresso in-place. Senza questo il parser non vede mai nulla.
        const lines = buf.split(/\r|\n/);
        buf = lines.pop() ?? '';
        for (const l of lines) if (l.trim()) onLine(l);
      };

      proc.stdout.on('data', handleData);
      proc.stderr.on('data', handleData);

      proc.on('close', (code: number | null) => {
        this.procs.delete(task.gameId);
        if (code === 0 || code === null) {
          resolve();
        } else {
          // v1.5.20-dev.13 — le ultime righe reali di stdout/stderr,
          // prima scartate — quasi sempre contengono il motivo vero del
          // fallimento (es. "Game exited: ..." di legendary), non solo
          // il codice di uscita nudo.
          if (recentLines.length > 0) {
            this.log(task, 'error', `[${bin.toUpperCase()}] Ultime righe prima del fallimento:\n${recentLines.join('\n')}`);
          }
          const err = new Error(`${bin} exited with code ${code}`);
          // v1.5.20-dev.14 — l'output reale viaggia insieme all'errore
          // (non solo loggato) cosi chi lo riceve più a valle (vedi
          // errorCallbacks/onError in startTask) può riconoscere un
          // fallimento definitivo specifico del proprio store, senza
          // dover riparsare il log testuale.
          (err as any).recentOutput = recentLines.join('\n');
          reject(err);
        }
      });

      proc.on('error', (err: Error) => reject(err));
    });
  }

  // -------------------------------------------------------------------------
  // Helper: spawn silenzioso con timeout obbligatorio
  //
  // wine wineboot e winetricks possono bloccarsi indefinitamente se:
  //   - wineserver rimane zombie dopo un crash precedente
  //   - il DISPLAY è disponibile e un sottoprocesso apre una GUI
  //   - winetricks scarica un pacchetto e il server CDN non risponde
  //
  // Il timeout forza SIGKILL dopo il limite e rigetta la Promise,
  // propagando l'errore alla fase corrente invece di bloccare per sempre.
  // -------------------------------------------------------------------------

  // v0.99.35 — regola adottata: ogni funzione che lancia processi
  // esterni critici (wine/winetricks/legendary/ecc.) integra logging
  // diagnostico tramite this.log(), non console.log temporaneo — così
  // chi guarda la dashboard (LogPanel.tsx) ha sempre un dato concreto
  // da cui partire in caso di errore, senza dover aprire un terminale
  // separato o aggiungere debug ad-hoc da rimuovere dopo. task viene
  // passato esplicitamente per questo motivo: spawnWithTimeout deve
  // poter scrivere nel canale di log della dashboard come fanno già
  // installGOG/installEpic.
  /**
   * v0.99.35 — timeout di INATTIVITÀ invece di timeout assoluto fisso.
   *
   * Causa del cambio: un timeout assoluto fisso costringe a indovinare
   * un numero — troppo corto per giochi grandi (confermato: SOMA,
   * estrazione innoextract ancora a I/O pieno con STAT=D dopo 10
   * minuti, oltre 17GB già scritti, timeout scattato su un processo
   * genuinamente al lavoro), troppo lungo se applicato indistintamente
   * a operazioni piccole. Non esiste un numero fisso corretto per
   * "quanto può essere grande un'estrazione" — varia per ordini di
   * grandezza da gioco a gioco.
   *
   * Soluzione: monitorare periodicamente /proc/<pid>/io (stesso file
   * già usato per la diagnosi manuale in questa sessione — read_bytes/
   * write_bytes) e resettare il timer di inattività ogni volta che i
   * contatori crescono. Il processo viene terminato solo se NON fa
   * alcun I/O per `idleTimeoutMs` consecutivi — non se il lavoro
   * totale richiede più tempo del previsto. inactivityPollMs controlla
   * la frequenza di controllo (lettura di un file /proc, operazione
   * leggera, costo trascurabile anche a intervalli brevi).
   *
   * absoluteMaxMs resta come rete di sicurezza estrema, indipendente
   * dall'attività rilevata — protegge da un bug nel meccanismo di
   * rilevamento stesso (es. /proc non leggibile per qualche motivo),
   * non da un'estrazione lenta ma reale.
   */
  private getProcIoBytes(pid: number): number | null {
    try {
      const raw = readFileSync(`/proc/${pid}/io`, 'utf-8');
      const read  = raw.match(/^read_bytes:\s*(\d+)/m);
      const write = raw.match(/^write_bytes:\s*(\d+)/m);
      const r = read  ? parseInt(read[1], 10)  : 0;
      const w = write ? parseInt(write[1], 10) : 0;
      return r + w;
    } catch {
      // Processo già terminato, o /proc non disponibile (non-Linux,
      // permessi) — non fatale, il chiamante ricade sul timeout
      // assoluto se non riesce mai a leggere I/O.
      return null;
    }
  }

  private spawnWithTimeout(
    task:       DownloadTask,
    bin:        string,
    args:       string[],
    env:        Record<string, string> = {},
    timeoutMs:  number,
    opts:       {
      idleTimeoutMs?:     number;
      inactivityPollMs?:  number;
      // v0.99.35 — parser di progresso opzionale, per riusare il
      // meccanismo di timeout di inattività già validato (SOMA,
      // installazione completata con successo) anche per processi che
      // riportano un avanzamento osservabile (es. innoextract), invece
      // di duplicare timeout/exit/logging in una seconda funzione
      // parallela (spawnWithProgress, che non ha timeout di
      // inattività e usa ancora l'evento 'close' invece di 'exit' —
      // stesso bug già corretto qui giorni fa, mai riportato là).
      progressParser?:    (line: string) => { progress: number; speed: string } | null;
    } = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const label = `[WINE-DEBUG] ${bin} ${args.join(' ')}`;

      // v0.99.35 — switch opzionale dall'overlay ("Disabilita sync NT
      // veloce"), persistito come task.disableWineSync. Iniettato solo
      // per wine/winetricks (non innoextract/legendary, dove la
      // variabile non ha effetto) — vedi nota su CompatibilityProfile
      // in types.ts per la diagnosi che ha portato a quest'opzione.
      const finalEnv = { ...env };
      if (task.disableWineSync && (bin === 'wine' || bin === 'winetricks')) {
        finalEnv.WINE_DISABLE_FAST_SYNC = '1';
        this.log(task, 'system', `${label} — WINE_DISABLE_FAST_SYNC=1 attivo (opzione utente)`);
      }
      // v1.1.18 — Custom Env con switch "solo installazione" acceso
      // nell'overlay: applicate qui, non nell'ambiente di lancio del
      // gioco vero e proprio (vedi gameManager.ts, che legge solo
      // compat_profiles.custom_env — questa mappa non finisce mai lì).
      // Iniettate per qualunque bin (wine/winetricks/innoextract), non
      // solo wine/winetricks come disableWineSync sopra: a differenza di
      // quel caso, qui è l'utente stesso a scegliere quali variabili
      // impostare, non una singola opzione con un effetto noto solo su
      // Wine — un valore che non ha effetto sul binario in corso viene
      // semplicemente ignorato da quest'ultimo, nessun danno.
      if (task.installOnlyEnv && Object.keys(task.installOnlyEnv).length > 0) {
        Object.assign(finalEnv, task.installOnlyEnv);
        this.log(task, 'system', `${label} — variabili "solo installazione" attive: ${Object.keys(task.installOnlyEnv).join(', ')}`);
      }

      this.log(task, 'system', `${label} — avviato`);

      const proc = spawn(bin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env:   buildSafeEnv(finalEnv),
      });

      this.log(task, 'system', `${label} — PID=${proc.pid}`);

      let stderrBuf = '';
      // v0.99.35 — buffer e split \r/\n riusati dal pattern già
      // collaudato in spawnWithProgress, applicati qui solo se un
      // progressParser è stato passato (innoextract). \r perché
      // innoextract (come lgogdownloader/legendary) aggiorna la barra
      // in-place con carriage return, non newline.
      let progressBuf = '';
      const handleProgressData = (chunk: Buffer) => {
        if (!opts.progressParser) return;
        progressBuf += chunk.toString();
        const lines = progressBuf.split(/\r|\n/);
        progressBuf = lines.pop() ?? '';
        for (const l of lines) {
          if (!l.trim()) continue;
          const parsed = opts.progressParser(l.trim());
          if (parsed) {
            this.update(task, {
              progress: Math.max(task.progress, Math.min(parsed.progress, 99)),
              speed:    parsed.speed || task.speed,
            });
          }
        }
      };

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        // Tieni solo gli ultimi 2000 chars per non sprecare memoria
        if (stderrBuf.length > 2000) stderrBuf = stderrBuf.slice(-2000);
        handleProgressData(chunk);
      });
      // Se nessun progressParser è passato, lo stdout resta ignorato
      // (comportamento invariato per wine/winetricks, molto verbosi).
      proc.stdout?.on('data', opts.progressParser ? handleProgressData : () => {});

      let settled = false;
      const cleanupTimers = () => {
        clearTimeout(idleTimer);
        clearTimeout(absoluteTimer);
        clearInterval(pollInterval);
      };

      const killForTimeout = (reason: string) => {
        if (settled) return;
        settled = true;
        this.log(task, 'error', `${label} — TIMEOUT (${reason}), PID=${proc.pid}, killed=${proc.killed}`);
        try {
          const psTree = execSync(
            `ps --ppid ${proc.pid} -o pid,ppid,stat,etimes,cmd 2>/dev/null; ps -p ${proc.pid} -o pid,ppid,stat,etimes,cmd 2>/dev/null`,
            { encoding: 'utf-8' }
          );
          this.log(task, 'system', `${label} — processi al momento del timeout:\n${psTree || '(nessun processo trovato — già terminato)'}`);
        } catch (psErr) {
          this.log(task, 'system', `${label} — ps snapshot fallito: ${psErr}`);
        }
        cleanupTimers();
        proc.kill('SIGKILL');
        reject(new Error(`${bin} timeout (${reason})`));
      };

      // Timeout assoluto — rete di sicurezza estrema, indipendente
      // dall'attività I/O rilevata. Usa timeoutMs come prima (il
      // chiamante può passare un valore alto per operazioni note come
      // potenzialmente molto lunghe).
      const absoluteTimer = setTimeout(
        () => killForTimeout(`limite assoluto ${timeoutMs}ms raggiunto`),
        timeoutMs
      );

      // Timeout di inattività — quello che conta davvero per processi
      // come innoextract/winetricks con volume di lavoro variabile.
      const idleTimeoutMs = opts.idleTimeoutMs ?? timeoutMs;
      let idleTimer = setTimeout(
        () => killForTimeout(`nessuna attività I/O per ${idleTimeoutMs}ms`),
        idleTimeoutMs
      );

      let lastIoBytes: number | null = null;
      const pollMs = opts.inactivityPollMs ?? 10_000;
      const pollInterval = setInterval(() => {
        if (!proc.pid || settled) return;
        const current = this.getProcIoBytes(proc.pid);
        if (current === null) return; // processo già finito o /proc non leggibile, non resettare
        if (lastIoBytes === null || current > lastIoBytes) {
          // Attività rilevata: il processo sta facendo I/O reale.
          // Reset del timer di inattività — non del timeout assoluto.
          lastIoBytes = current;
          clearTimeout(idleTimer);
          idleTimer = setTimeout(
            () => killForTimeout(`nessuna attività I/O per ${idleTimeoutMs}ms`),
            idleTimeoutMs
          );
        }
      }, pollMs);

      proc.on('exit', (code: number | null, signal: string | null) => {
        if (settled) return;
        settled = true;
        const elapsed = Date.now() - startedAt;
        this.log(task, 'system', `${label} — evento 'exit' dopo ${elapsed}ms, code=${code}, signal=${signal}`);
        cleanupTimers();
        if (code === 0 || code === null) resolve();
        else {
          const detail = stderrBuf.trim().split('\n').slice(-5).join(' | ');
          reject(new Error(`${bin} exited with code ${code}${detail ? ` — ${detail}` : ''}`));
        }
      });

      proc.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        const elapsed = Date.now() - startedAt;
        this.log(task, 'error', `${label} — evento 'error' dopo ${elapsed}ms: ${err.message}`);
        cleanupTimers();
        reject(err);
      });
    });
  }
}

export const downloadManager = new DownloadManager();
