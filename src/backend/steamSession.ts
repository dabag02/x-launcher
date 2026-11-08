// steamSession.ts — v3.2.6-dev.2 (ciclo "spazio 3 riservato a Steam").
//
// Nella sessione Openbox "Shell" (gestore degli spazi attivo) Steam gira SEMPRE dentro
// gamescope annidato, in uno scope systemd utente "xlauncher-steam-session-<ms>":
//
//     systemd-run --user --scope --collect --unit=xlauncher-steam-session-<ms> \
//       gamescope -W <w> -H <h> -w <w> -h <h> -f -e -- steam -gamepadui
//
// Verificato su hardware reale (scripts/diag-steam-gamescope.sh, 8 novembre 2026): Big Picture
// si vede e si comanda, i giochi lanciati con steam://rungameid finiscono dentro gamescope e
// nello stesso scope, freeze/thaw dello scope fermano e riprendono tutto (gamescope, Steam,
// gioco), `steam -shutdown` chiude anche gamescope. Senza gamescope, in Openbox, Big Picture
// resta nero (nessun compositore) e finisce nello spazio della Dashboard.
//
// spaces.py riconosce la finestra di gamescope dallo scope (prefisso xlauncher-steam-), la
// mette nello spazio 3 e la congela quando non e' lo spazio corrente.
//
// Fuori dalla sessione Openbox (XFCE, Kiosk gamescope) nessuna funzione di questo modulo
// cambia nulla: ensureSteamSession() risponde { handled: false } e chi chiama fa come prima.

import { execFileSync, spawn } from 'child_process';
import { mkdirSync, openSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { writeLog } from './logger';
import { DATA_DIR } from './paths';
import { getActiveDisplayEnv, isSpacesSessionDeclared } from './activeDisplay';
import { readAppConfig } from './appConfig';
import * as processManager from './processManager';
import { sendToSpaces, isSpacesActive, waitSpacesActive, thawScope } from './spacesClient';

/** Spazio riservato a Steam (desktop 4 di Openbox), lo stesso STEAM_SPACE di spaces.py. */
export const STEAM_SPACE = 3;
export const STEAM_SCOPE_PREFIX = 'xlauncher-steam-';
const STEAM_UNIT_RX = /^xlauncher-steam-[A-Za-z0-9_.-]{1,200}$/;
const STEAM_LOG = path.join(DATA_DIR, 'steam-gamescope.log');
// v3.2.6-dev.4 — un URI si inoltra solo a Big Picture pronta. Segnale: il titolo della finestra di
// gamescope (riportato da spaces.py nello stato dello spazio 3) contiene "Big Picture" ("Modalità Big
// Picture di Steam", "Steam Big Picture Mode"), verificato su hardware. Un URI sulla riga di comando di
// Steam a freddo apre invece il client desktop prima di Big Picture (visto su hardware, dev.3), e un
// inoltro durante l'avvio ne apre un secondo fuori da gamescope (dev.2).
const BIG_PICTURE_TITLE_RX = /big picture/i;
const BIG_PICTURE_WAIT_MS = 90_000;        // primo avvio, eventuale aggiornamento del client
const BIG_PICTURE_SETTLE_MS = 2_000;
// Sessione vecchia con un gioco in primo piano (il titolo e' quello del gioco): basta un client vivo.
const STEAM_OLD_SESSION_MS = 60_000;
const STEAM_READY_WAIT_MS = 60_000;
// Attesa del gestore degli spazi quando la sessione Openbox e' dichiarata ma non risponde (appena avviata).
const SPACES_WAIT_MS = 8_000;

export type SteamSessionResult =
  | { handled: false }
  | { handled: true; success: boolean; message: string; started: boolean; unit?: string; pid?: number };

function lang(): 'it' | 'en' {
  try { return readAppConfig().language === 'en' ? 'en' : 'it'; } catch { return 'it'; }
}

function msg(it: string, en: string): string {
  return lang() === 'en' ? en : it;
}

function hasBinary(bin: string): boolean {
  try { execFileSync('which', [bin], { stdio: 'ignore' }); return true; } catch { return false; }
}

/** Scope attivo della sessione Steam (senza ".scope"), o null. */
export function findSteamScope(): string | null {
  try {
    const out = execFileSync(
      'systemctl', ['--user', 'list-units', '--type=scope', '--state=active', '--no-legend', '--plain', `${STEAM_SCOPE_PREFIX}*`],
      { stdio: 'pipe', encoding: 'utf-8' },
    );
    for (const line of out.split('\n')) {
      const unit = line.trim().split(/\s+/)[0] ?? '';
      if (!unit.endsWith('.scope')) continue;
      const name = unit.slice(0, -'.scope'.length);
      if (STEAM_UNIT_RX.test(name)) return name;
    }
  } catch { /* systemctl assente o nessuna unit: nessuna sessione */ }
  return null;
}

/** PID dei processi "steam" (il client, ubuntu12_32/steam) di questo utente. */
function steamClientPids(): number[] {
  try {
    const uid = typeof process.getuid === 'function' ? String(process.getuid()) : '';
    const out = execFileSync('pgrep', uid ? ['-u', uid, '-x', 'steam'] : ['-x', 'steam'], { stdio: 'pipe', encoding: 'utf-8' });
    return out.split('\n').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n > 0);
  } catch { return []; }
}

function scopeOfPid(pid: number): string | null {
  try {
    const m = readFileSync(`/proc/${pid}/cgroup`, 'utf-8').match(/(xlauncher-[A-Za-z0-9_.-]+)\.scope/);
    return m ? m[1] : null;
  } catch { return null; }
}

/** Chiamata solo quando NON c'e' una sessione dedicata: qualunque client Steam vivo e' "fuori". */
function steamRunningOutside(): boolean {
  return steamClientPids().some(pid => !(scopeOfPid(pid) ?? '').startsWith(STEAM_SCOPE_PREFIX));
}

/** Risoluzione del monitor primario della sessione attiva (xrandr), es. "2560x1440". */
function primaryResolution(env: NodeJS.ProcessEnv): { w: number; h: number } {
  try {
    const out = execFileSync('xrandr', ['--current'], { env, stdio: 'pipe', encoding: 'utf-8', timeout: 5000 });
    const lines = out.split('\n');
    const pick = lines.find(l => / connected primary /.test(l)) ?? lines.find(l => / connected /.test(l));
    const m = pick?.match(/(\d{3,5})x(\d{3,5})\+\d+\+\d+/);
    if (m) return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
  } catch (err) {
    writeLog('warning', `[STEAM-SESSION] xrandr failed, falling back to 1920x1080: ${err instanceof Error ? err.message : err}`);
  }
  return { w: 1920, h: 1080 };
}

function sessionEnv(): NodeJS.ProcessEnv {
  const display = getActiveDisplayEnv();
  const env: NodeJS.ProcessEnv = { ...process.env, ...display };
  // gamescope annidato sceglie il backend Wayland se trova WAYLAND_DISPLAY: nella sessione
  // Openbox (X11) va usato quello X11.
  if (!display.WAYLAND_DISPLAY) delete env.WAYLAND_DISPLAY;
  return env;
}

/** Avvia gamescope + Steam (Big Picture) nello scope della sessione. */
function startSession(mode: 'session' | 'prestart' = 'session'): { unit: string; pid: number } | { error: string } {
  if (!hasBinary('gamescope')) return { error: msg('gamescope non è installato: Steam non si può aprire nello spazio dedicato.', 'gamescope is not installed: Steam cannot be opened in its dedicated space.') };
  if (!hasBinary('steam')) return { error: msg('Steam non trovato nel PATH.', 'Steam was not found in PATH.') };
  if (!processManager.ensureCapability()) return { error: msg('systemd-run --user non è disponibile: Steam non si può aprire nello spazio dedicato.', 'systemd-run --user is not available: Steam cannot be opened in its dedicated space.') };

  const env = sessionEnv();
  const { w, h } = primaryResolution(env);
  // 'prestart' (v3.2.6-dev.4): spaces.py non ci passa alla comparsa e lo congela appena Big Picture e' pronta
  const unit = processManager.makeUnitName('steam', mode);
  const args = [
    '--user', '--scope', '--collect', '--quiet', `--unit=${unit}`,
    'gamescope', '-W', String(w), '-H', String(h), '-w', String(w), '-h', String(h), '-f', '-e',
    '--', 'steam', '-gamepadui',
  ];
  let stdio: 'ignore' | ['ignore', number, number] = 'ignore';
  try {
    mkdirSync(path.dirname(STEAM_LOG), { recursive: true });
    const fd = openSync(STEAM_LOG, 'a');
    stdio = ['ignore', fd, fd];
  } catch { /* log non disponibile: si avvia lo stesso */ }

  writeLog('launch', `[STEAM-SESSION] Starting Steam in gamescope: systemd-run ${args.join(' ')} (DISPLAY=${env.DISPLAY ?? '-'}, log ${STEAM_LOG})`);
  const child = spawn('systemd-run', args, { detached: true, stdio, env, cwd: os.homedir() });
  child.on('error', (e) => writeLog('error', `[STEAM-SESSION] systemd-run failed: ${e.message}`));
  child.unref();
  const pid = child.pid ?? 0;
  processManager.register({ unit, kind: 'steam', id: mode, title: 'Steam Big Picture', supervisorPid: pid });
  return { unit, pid };
}

/** Eta' di una sessione dal nome dello scope (xlauncher-steam-<modo>-<ms>), o Infinity se non leggibile. */
function sessionAgeMs(unit: string): number {
  const m = unit.match(/-(\d{13})$/);
  return m ? Date.now() - parseInt(m[1], 10) : Infinity;
}

/** Titolo attuale dello spazio di Steam secondo spaces.py ('' finche' la finestra non c'e'), null se non risponde. */
async function steamSpaceTitle(): Promise<string | null> {
  const st = await sendToSpaces({ cmd: 'state' }, 1500);
  if (!st) return null;
  const e = (st.spaces ?? []).find(sp => sp.kind === 'steam');
  return e ? (e.title ?? '') : '';
}

/**
 * Steam pronto a ricevere un URI: Big Picture a schermo (titolo), oppure, per una sessione vecchia con
 * un gioco in primo piano, un client vivo nello scope. false = scope finito o attesa scaduta.
 */
async function waitSteamReady(unit: string, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeoutMs) {
    const title = await steamSpaceTitle();
    if (title !== null && title !== last) {
      writeLog('system', `[STEAM-SESSION] ${unit}: window title "${title}"`);
      last = title;
    }
    if (title && BIG_PICTURE_TITLE_RX.test(title)) return true;
    if (sessionAgeMs(unit) >= STEAM_OLD_SESSION_MS && steamClientPids().some(pid => scopeOfPid(pid) === unit)) return true;
    if (!processManager.isScopeActive(unit) && Date.now() - t0 > 5000) return false;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

/** Inoltra un URI steam:// allo Steam gia' in esecuzione; restituisce il PID dell'inoltro. */
function forwardUri(uri: string): number {
  const child = spawn('steam', [uri], { detached: true, stdio: 'ignore', env: sessionEnv() });
  child.on('error', (e) => writeLog('error', `[STEAM-SESSION] steam ${uri} failed: ${e.message}`));
  child.unref();
  return child.pid ?? 0;
}

/** Passa allo spazio 3 (spaces.py scongela Steam PRIMA di cambiare desktop) e attende la risposta. */
async function switchToSteamSpace(reason: string): Promise<void> {
  const st = await sendToSpaces({ cmd: 'switch', space: STEAM_SPACE }, 4000).catch(() => null);
  writeLog('system', `[STEAM-SESSION] switch to space ${STEAM_SPACE} (${reason}): ${st ? (st.ok ? 'ok' : 'space not ready yet') : 'spaces manager not reachable'}`);
}

/**
 * Apre Steam nello spazio dedicato (uri assente = Big Picture) o vi lancia un gioco (uri =
 * steam://rungameid/<id>). Solo con il gestore degli spazi attivo; altrimenti { handled: false }.
 *  - sessione gia' aperta: inoltra l'URI (se c'e') e passa allo spazio 3;
 *  - Steam aperto fuori dalla sessione: rifiuta con un messaggio (sarebbe nero e fuori dagli spazi);
 *  - nessuno Steam: avvia la sessione; per un gioco attende che il client sia pronto e poi inoltra l'URI.
 *    Il passaggio allo spazio 3 lo fa spaces.py alla comparsa della finestra di gamescope.
 */
export async function ensureSteamSession(uri?: string): Promise<SteamSessionResult> {
  // v3.2.6-dev.3 — sessione Openbox dichiarata da kiosk-launch.sh: se il gestore degli spazi non
  // risponde (appena partito, riavvio del tray) si aspetta un po' e poi si rinuncia con un messaggio,
  // MAI il lancio "come su XFCE" (Steam in finestra, fuori da gamescope, sopra la Dashboard).
  const declared = isSpacesSessionDeclared();
  let active = await isSpacesActive();
  if (!active && declared) {
    writeLog('warning', `[STEAM-SESSION] spaces session declared but the spaces manager does not answer: waiting up to ${SPACES_WAIT_MS / 1000} s`);
    active = await waitSpacesActive(SPACES_WAIT_MS);
  }
  if (!active) {
    if (!declared) return { handled: false };
    writeLog('error', '[STEAM-SESSION] spaces manager not reachable: Steam NOT started (it would open outside its space)');
    return { handled: true, success: false, started: false,
             message: msg('Il gestore degli spazi non risponde: Steam non viene aperto fuori dal suo spazio. Riprova tra qualche secondo.',
                          'The spaces manager is not answering: Steam is not opened outside its space. Try again in a few seconds.') };
  }

  const scope = findSteamScope();
  if (scope) {
    let pid: number | undefined;
    // prima lo spazio 3 (scongela Steam), poi l'eventuale URI
    await switchToSteamSpace(uri ? 'game launch' : 'Big Picture');
    if (uri) {
      if (!(await waitSteamReady(scope, STEAM_READY_WAIT_MS))) {
        writeLog('warning', `[STEAM-SESSION] no Steam client in ${scope}: ${uri} not forwarded`);
        return { handled: true, success: false, started: false, unit: scope,
                 message: msg('Steam non risponde nel suo spazio: riprova tra qualche secondo.',
                              'Steam is not answering in its space: try again in a few seconds.') };
      }
      writeLog('launch', `[STEAM-SESSION] ${scope} already running: forwarding ${uri}`);
      pid = forwardUri(uri);
    }
    return { handled: true, success: true, started: false, unit: scope, pid,
             message: msg('Steam è già aperto nel suo spazio.', 'Steam is already open in its space.') };
  }

  if (steamRunningOutside()) {
    writeLog('warning', `[STEAM-SESSION] Steam is running outside the dedicated session (pids ${steamClientPids().join(',')}): not starting a second one`);
    return { handled: true, success: false, started: false,
             message: msg('Steam è già aperto fuori dallo spazio dedicato: chiudilo (Esci da Steam) e riprova.',
                          'Steam is already running outside its dedicated space: quit Steam and try again.') };
  }

  const started = startSession();
  if ('error' in started) {
    writeLog('error', `[STEAM-SESSION] ${started.error}`);
    return { handled: true, success: false, started: false, message: started.error };
  }
  if (uri) {
    // v3.2.6-dev.4 — lancio a freddo in due tempi, in background (la richiesta di lancio non aspetta
    // 30-40 s): Big Picture pronta (titolo), un attimo di margine, poi l'URI. Il passaggio allo
    // spazio 3 lo fa spaces.py alla comparsa della finestra di gamescope.
    const unit = started.unit;
    void (async () => {
      const ready = await waitSteamReady(unit, BIG_PICTURE_WAIT_MS);
      if (!processManager.isScopeActive(unit)) {
        writeLog('warning', `[STEAM-SESSION] ${unit} ended before Big Picture was ready: ${uri} not sent`);
        return;
      }
      if (!ready) writeLog('warning', `[STEAM-SESSION] Big Picture not detected within ${BIG_PICTURE_WAIT_MS / 1000} s: sending ${uri} anyway`);
      await new Promise(r => setTimeout(r, BIG_PICTURE_SETTLE_MS));
      writeLog('launch', `[STEAM-SESSION] ${unit} ready${ready ? ' (Big Picture)' : ''}: forwarding ${uri}`);
      forwardUri(uri);
    })();
  }
  // Nessun PID restituito per il gioco: quello di systemd-run e' gamescope stesso (la splash, allo
  // scadere, terminerebbe l'intera sessione Steam).
  return { handled: true, success: true, started: true, unit: started.unit,
           message: uri
             ? msg('Steam si apre nel suo spazio e avvia il gioco quando Big Picture è pronta.', 'Steam is opening in its space and will start the game once Big Picture is ready.')
             : msg('Apertura di Steam Big Picture nello spazio dedicato.', 'Opening Steam Big Picture in its dedicated space.') };
}

/**
 * v3.2.6-dev.4 — avvio di Steam in background all'inizio della sessione Openbox (opzione
 * X_LAUNCHER_STEAM_PRESTART=1 letta da kiosk-launch.sh, spenta di default). Scope
 * xlauncher-steam-prestart-<ms>: spaces.py lo mette nello spazio 3 senza passarci e lo congela
 * appena Big Picture e' pronta. Non fa nulla se Steam c'e' gia' (dentro o fuori dalla sessione).
 */
export async function prestartSteamSession(): Promise<{ started: boolean; message: string }> {
  if (!(await waitSpacesActive(30_000))) return { started: false, message: 'spaces manager not reachable' };
  if (!hasBinary('steam')) return { started: false, message: 'steam not installed' };
  if (findSteamScope()) return { started: false, message: 'Steam session already running' };
  if (steamRunningOutside()) return { started: false, message: 'Steam already running outside its space' };
  const started = startSession('prestart');
  if ('error' in started) return { started: false, message: started.error };
  return { started: true, message: `started in ${started.unit}` };
}

/**
 * Chiusura ordinata della sessione Steam (Gestore dei processi). v3.2.6-dev.3: prima scongela lo scope
 * (uno Steam congelato non risponde), poi `steam -shutdown` SOLO se nello scope c'e' davvero un client
 * (con Steam spento quel comando ne avvia uno nuovo), poi SIGKILL se dopo 20 s resta su.
 */
export async function shutdownSteamSession(unit: string): Promise<{ success: boolean; message: string }> {
  if (!STEAM_UNIT_RX.test(unit)) return { success: false, message: msg('Scope non valido.', 'Invalid scope.') };
  await thawScope(unit);
  const hasClient = steamClientPids().some(pid => scopeOfPid(pid) === unit);
  if (hasClient) {
    writeLog('launch', `[STEAM-SESSION] shutdown requested for ${unit}: steam -shutdown`);
    try {
      const child = spawn('steam', ['-shutdown'], { detached: true, stdio: 'ignore', env: sessionEnv() });
      child.on('error', () => {});
      child.unref();
    } catch { /* si ripiega sul kill sotto */ }
    const t0 = Date.now();
    while (Date.now() - t0 < 20_000) {
      if (!processManager.isScopeActive(unit)) {
        processManager.unregister(unit);
        return { success: true, message: msg('Steam chiuso.', 'Steam closed.') };
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    writeLog('warning', `[STEAM-SESSION] ${unit} still active 20 s after steam -shutdown: killing the scope`);
  } else {
    writeLog('warning', `[STEAM-SESSION] no Steam client in ${unit}: killing the scope directly (no steam -shutdown)`);
  }
  return processManager.killScope(unit);
}
