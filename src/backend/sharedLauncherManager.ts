/**
 * sharedLauncherManager.ts — Step 19d, Fase 1
 *
 * Orchestrazione dei prefix Proton condivisi per launcher di terze parti
 * (Ubisoft Connect/EA App/Battle.net/Rockstar). Un solo prefix per
 * launcher, riusato da tutti i giochi che dichiarano
 * games.requiresLauncher = quel launcher_id, invece di un prefix isolato
 * per-gioco — vedi discussione architetturale registrata in
 * X-Launcher-Roadmap.md, sezione Step 19d.
 *
 * Runner sempre Proton/GE-Proton per decisione esplicita dell'utente
 * (supporto anticheat più versatile di Wine) — nessun ramo Wine da
 * gestire qui, a differenza dei prefix per-gioco esistenti.
 */

import { mkdirSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { spawn } from 'child_process';
import { DATA_DIR } from './paths';
import { writeLog } from './logger';
import {
  getSharedLauncherPrefix,
  upsertSharedLauncherPrefix,
  countInstalledGamesForLauncher,
  SharedLauncherPrefixRow,
} from './db';
import { getThirdPartyLauncherDefinition } from './plugins/thirdPartyLaunchers';
import { ProtonRunner } from './runners/implementations';
import { Game } from '../types';

export const SHARED_LAUNCHERS_DIR = path.join(DATA_DIR, 'shared-launchers');

// Stesso helper duplicato per file già in uso in tutto il backend
// (downloadManager.ts, archiveExtractors.ts, runners/implementations.ts,
// cloudBackup/googleDrive.ts, plugins/*Plugin.ts) — convenzione esistente,
// non un'utility condivisa da estrarre qui.
function binaryExists(bin: string): boolean {
  try { execSync(`which ${bin}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

/**
 * Apre l'URL nel browser disponibile — stesso identico meccanismo già
 * verificato e in uso in cloudBackup/googleDrive.ts per i flussi OAuth:
 * Firefox se presente, xdg-open come fallback, log di warning con l'URL
 * se nessuno dei due è disponibile (mai un errore bloccante).
 */
function openInBrowser(url: string): void {
  if (binaryExists('firefox')) {
    spawn('firefox', [url], { detached: true, stdio: 'ignore' }).unref();
  } else if (binaryExists('xdg-open')) {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    writeLog('warning', '[SharedLauncher] Nessun browser trovato (firefox/xdg-open) — apri manualmente: ' + url);
  }
}

/**
 * Apre la pagina ufficiale di download del launcher — MAI un download
 * automatico: vedi nota su installerUrl in thirdPartyLaunchers.ts, il
 * link diretto al binario non è stabile (short-link via JS per Ubisoft
 * Connect, verificato). L'utente scarica ed esegue l'installer
 * manualmente la prima volta, dentro il prefix condiviso.
 */
export function openInstallerPage(launcherId: string): { success: boolean; message: string } {
  const def = getThirdPartyLauncherDefinition(launcherId);
  if (!def) {
    return { success: false, message: `Launcher terzo sconosciuto: ${launcherId}` };
  }
  if (!def.installerUrl) {
    return { success: false, message: `Nessuna pagina di download nota ancora per ${def.displayName}.` };
  }
  openInBrowser(def.installerUrl);
  writeLog('system', `[SharedLauncher] Aperta pagina installer ${def.displayName}: ${def.installerUrl}`);
  return { success: true, message: `Pagina di download di ${def.displayName} aperta nel browser.` };
}

/**
 * Path base del prefix condiviso — questo è il valore da passare come
 * `config.prefix` a ProtonRunner.launch() (che lo userà come
 * STEAM_COMPAT_DATA_PATH). NON passare mai resolveSharedPrefixExecutionPath()
 * qui: Proton deriva `/pfx` da solo internamente a partire da QUESTO path
 * base — passare già il path risolto causerebbe un doppio annidamento
 * `.../pfx/pfx/`. Crea la cartella su disco se non esiste ancora, ma
 * questo NON implica che il launcher sia già bootstrappato dentro: vedi
 * isLauncherBootstrapped().
 */
export function getSharedPrefixBasePath(launcherId: string): string {
  const dir = path.join(SHARED_LAUNCHERS_DIR, launcherId, 'prefix');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Path REALE dove Proton ha effettivamente scritto i file (drive_c/,
 * user.reg/system.reg, l'eseguibile del launcher) — <base>/pfx/, stesso
 * comportamento già noto dalla sessione SOMA (Step 14): Proton tratta la
 * base come STEAM_COMPAT_DATA_PATH e bootstrappa la prefix vera dentro.
 *
 * Usare SOLO per leggere/risolvere percorsi assoluti dentro il prefix già
 * bootstrappato (es. costruire il path assoluto di launcher_exe, o in
 * futuro leggere user.reg per la Fase 2) — MAI come config.prefix passato
 * a ProtonRunner.launch(), che si aspetta il path base (vedi
 * getSharedPrefixBasePath sopra) e deriva /pfx da solo.
 */
export function resolveSharedPrefixExecutionPath(launcherId: string): string {
  return path.join(getSharedPrefixBasePath(launcherId), 'pfx');
}

export function getSharedLauncherState(launcherId: string): SharedLauncherPrefixRow | undefined {
  return getSharedLauncherPrefix(launcherId);
}

export function isLauncherBootstrapped(launcherId: string): boolean {
  const row = getSharedLauncherPrefix(launcherId);
  return !!row?.bootstrappedAt;
}

/**
 * Registra il completamento del bootstrap manuale — l'utente ha già
 * scaricato l'installer dalla pagina ufficiale (vedi installerUrl in
 * thirdPartyLaunchers.ts) e lo ha eseguito dentro il prefix condiviso con
 * la Proton scelta. Questa funzione NON scarica né installa nulla: si
 * limita a persistere lo stato "fatto" e il path dell'eseguibile
 * confermato dall'utente. Chiamata dall'endpoint di bootstrap dopo che
 * l'utente conferma via UI.
 */
export function markLauncherBootstrapped(
  launcherId: string,
  runner: string,
  launcherExe: string
): void {
  const def = getThirdPartyLauncherDefinition(launcherId);
  if (!def) {
    throw new Error(`Launcher terzo sconosciuto: ${launcherId}`);
  }

  upsertSharedLauncherPrefix({
    launcherId,
    prefixPath: getSharedPrefixBasePath(launcherId),
    launcherExe,
    bootstrappedAt: new Date().toISOString(),
    runner,
  });

  writeLog('system', `[SharedLauncher] ${def.displayName} bootstrappato (runner: ${runner}, exe: ${launcherExe})`);
}

/**
 * Reference counting per l'uninstall — un gioco che condivide questo
 * prefix con altri titoli installati NON deve mai far rimuovere il
 * prefix stesso, il launcher e i suoi dati di login/DB interno restano
 * necessari agli altri giochi.
 *
 * excludeGameId = il gioco che si sta disinstallando ORA: il suo
 * is_installed potrebbe non essere ancora stato riportato a 0 nel DB nel
 * momento esatto in cui questa funzione viene chiamata durante il flusso
 * di uninstall, quindi va escluso esplicitamente dal conteggio invece di
 * fidarsi che il suo stato sia già coerente.
 */
export function canRemoveSharedPrefix(launcherId: string, excludeGameId?: string): boolean {
  return countInstalledGamesForLauncher(launcherId, excludeGameId) === 0;
}

/**
 * Avvia il launcher terzo stesso (non un gioco) — riusa ProtonRunner.launch()
 * reale invece di duplicarne la logica di spawn/env (FSR/MangoHud/EAC-
 * BattlEye vengono già gestiti lì, anche se qui non applicabili per il
 * launcher in sé). Passa un oggetto Game minimale: solo i campi che
 * ProtonRunner.launch() legge davvero (verificato leggendo il codice
 * reale — executablePath, steamAppId, title), non un gioco vero.
 *
 * config.prefix = getSharedPrefixBasePath() (il path BASE, mai quello già
 * risolto con /pfx) — vedi nota su resolveSharedPrefixExecutionPath sopra.
 */
export async function launchSharedLauncher(launcherId: string): Promise<{ success: boolean; message: string }> {
  const def = getThirdPartyLauncherDefinition(launcherId);
  if (!def) {
    return { success: false, message: `Launcher terzo sconosciuto: ${launcherId}` };
  }

  const state = getSharedLauncherPrefix(launcherId);
  if (!state?.bootstrappedAt || !state.launcherExe) {
    return { success: false, message: `${def.displayName} non risulta ancora installato nel prefix condiviso.` };
  }

  const runner = new ProtonRunner(state.runner, state.runner);
  const executablePath = path.join(resolveSharedPrefixExecutionPath(launcherId), 'drive_c', state.launcherExe);

  // Oggetto Game minimale — vedi commento sopra: ProtonRunner.launch()
  // usa solo executablePath/steamAppId/title per un lancio non-Steam.
  const syntheticGame = {
    id: `shared-launcher-${launcherId}`,
    title: def.displayName,
    executablePath,
  } as Partial<Game> as Game;

  const result = await runner.launch(syntheticGame, { prefix: getSharedPrefixBasePath(launcherId) });
  writeLog('launch', `[SharedLauncher] Avvio ${def.displayName}: ${result.message ?? '(nessun messaggio)'}`);
  return { success: result.success, message: result.message ?? '' };
}
