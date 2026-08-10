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

import { mkdirSync, existsSync, openSync } from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
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
import { ProtonRunner, resolveProtonBin, gameLaunchLogPath } from './runners/implementations';
import { Game } from '../types';
import * as db from './db';

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
/**
 * v1.5.20-dev.14 — richiesta utente: al lancio di un gioco che dichiara
 * requiresLauncher, il launcher condiviso deve partire insieme (molti
 * titoli Ubisoft/EA verificano che il proprio launcher sia in esecuzione
 * per DRM/funzioni online) — ma solo se non è già aperto, altrimenti
 * lo si duplicherebbe inutilmente. Stesso pattern `pgrep -f` già usato
 * altrove in gameManager.ts per verificare processi in corso — qui sul
 * nome file dell'eseguibile del launcher (già noto, salvato al
 * bootstrap), non sull'intero percorso.
 */
export function isSharedLauncherRunning(launcherId: string): boolean {
  // v1.5.20-dev.27 — BUG REALE CONFERMATO DALL'UTENTE CON QUERY DIRETTA
  // AL DB: `state.launcherExe` (tabella shared_launcher_prefixes) è
  // scritto UNA SOLA VOLTA al bootstrap iniziale e può restare sbagliato
  // per sempre (esattamente come `state.runner`, vedi dev.26) — nel caso
  // reale dell'utente valeva "windows/explorer.exe" invece del vero
  // percorso di UbisoftConnect.exe, quindi questa funzione cercava da
  // settimane un processo chiamato "explorer.exe" con `pgrep -f`, non
  // il vero launcher. `games.executablePath` (riga `${launcherId}-launcher`)
  // è invece il campo che l'utente vede/la Dashboard mantiene aggiornato
  // ad ogni lancio riuscito — unica fonte di verità, stesso principio
  // già applicato al runner in dev.26.
  const launcherGame = db.getGameById(`${launcherId}-launcher`);
  if (!launcherGame?.executablePath) return false;
  const exeBasename = path.basename(launcherGame.executablePath);
  try {
    execFileSync('pgrep', ['-f', exeBasename], { stdio: 'pipe' });
    return true;
  } catch {
    return false; // pgrep esce con codice != 0 se non trova corrispondenze
  }
}

/**
 * v1.5.20-dev.22 — richiesta utente: chiusura ESPLICITA e mirata del
 * launcher condiviso, su scelta dell'utente (notifica "tieni aperto /
 * chiudi ora" alla chiusura di un gioco dipendente — mai automatica).
 * `wineserver -k` (comando ufficiale, documentato nel man di
 * wineserver — stesso identificato durante il debug di winebrowser in
 * questa stessa sessione) termina l'INTERA sessione Wine per quella
 * prefix: manda SIGINT poi SIGKILL a tutti i processi client, non solo
 * al launcher stesso — pulisce anche eventuali processi figli residui
 * (aggiornatori, servizi in background) invece di lasciarli orfani.
 * Il wineserver da terminare è quello DELLA STESSA build Proton che il
 * launcher sta usando (mai un `wineserver` di sistema diverso — stessa
 * causa di mismatch di versione già diagnosticata per winebrowser).
 */
export async function closeSharedLauncher(launcherId: string): Promise<{ success: boolean; message: string }> {
  const launcherGame = db.getGameById(`${launcherId}-launcher`);
  const runnerId = launcherGame?.runner;
  if (!runnerId) {
    return { success: false, message: `Runner del launcher condiviso "${launcherId}" sconosciuto.` };
  }
  const protonBin = resolveProtonBin(runnerId);
  if (!protonBin) {
    return { success: false, message: `Build Proton "${runnerId}" non trovata.` };
  }
  const protonDir = path.dirname(protonBin);
  const wineserverBin = [
    path.join(protonDir, 'files', 'bin', 'wineserver'),
    path.join(protonDir, 'dist', 'bin', 'wineserver'),
  ].find(p => existsSync(p));
  if (!wineserverBin) {
    return { success: false, message: `Binario wineserver non trovato dentro la build Proton "${runnerId}".` };
  }

  const winePrefix = resolveSharedPrefixExecutionPath(launcherId);
  try {
    execFileSync(wineserverBin, ['-k'], {
      env: { ...process.env, WINEPREFIX: winePrefix },
      stdio: 'ignore',
    });
    writeLog('launch', `[SharedLauncher] Chiuso su richiesta esplicita dell'utente: "${launcherId}" (wineserver -k).`);
    return { success: true, message: `Launcher condiviso "${launcherId}" chiuso.` };
  } catch (e) {
    return { success: false, message: `Chiusura fallita: ${e}` };
  }
}

export async function launchSharedLauncher(launcherId: string): Promise<{ success: boolean; message: string; logPath?: string }> {
  const def = getThirdPartyLauncherDefinition(launcherId);
  if (!def) {
    return { success: false, message: `Launcher terzo sconosciuto: ${launcherId}` };
  }

  const state = getSharedLauncherPrefix(launcherId);
  if (!state?.bootstrappedAt) {
    return { success: false, message: `${def.displayName} non risulta ancora installato nel prefix condiviso.` };
  }

  // v1.5.20-dev.27 — BUG REALE CONFERMATO DALL'UTENTE CON QUERY DIRETTA
  // AL DB: `state.launcherExe` è scritto UNA SOLA VOLTA al bootstrap
  // iniziale nella tabella shared_launcher_prefixes — nel caso reale
  // dell'utente valeva "windows/explorer.exe" invece del vero percorso
  // relativo di UbisoftConnect.exe, sbagliato fin dal bootstrap
  // originale (29 luglio) e mai notato prima perché questa funzione
  // (l'avvio AUTOMATICO del launcher condiviso) non esisteva ancora
  // allora — l'utente ha sempre lanciato Ubisoft Connect a mano dalla
  // sua card, che usa `games.executablePath` (corretto, mantenuto
  // aggiornato dalla Dashboard) e non ha mai toccato questo campo.
  // Stessa causa profonda di dev.26 (due tabelle diverse per lo stesso
  // concetto, che driftano) — qui applicata anche all'eseguibile, non
  // solo al runner: `games.executablePath` diventa l'UNICA fonte di
  // verità, `state.launcherExe`/`state.runner` non più letti affatto.
  const launcherGame = db.getGameById(`${launcherId}-launcher`);
  if (!launcherGame?.runner || !launcherGame?.executablePath) {
    return { success: false, message: `${def.displayName}: runner o eseguibile non ancora noti sulla card — aprila almeno una volta manualmente prima di fare affidamento sull'avvio automatico.` };
  }
  const runnerId = launcherGame.runner;
  const executablePath = launcherGame.executablePath;

  const runner = new ProtonRunner(runnerId, runnerId);

  // Oggetto Game minimale — vedi commento sopra: ProtonRunner.launch()
  // usa solo executablePath/steamAppId/title per un lancio non-Steam.
  const syntheticGame = {
    id: `shared-launcher-${launcherId}`,
    title: def.displayName,
    executablePath,
  } as Partial<Game> as Game;

  const result = await runner.launch(syntheticGame, {
    prefix: getSharedPrefixBasePath(launcherId),
    // v1.5.20-dev.17 — BUG REALE trovato dall'utente: questa funzione non
    // passava mai `umuRun`, quindi il lancio del launcher condiviso
    // stesso riproduceva esattamente la finestra nera che avevamo già
    // risolto in Step 19d (container Steam Linux Runtime mancante) — il
    // fix umu-run era arrivato SOLO per il lancio manuale dalla card,
    // mai qui. Il launcher condiviso ha una riga vera in `games`
    // (convenzione id `${launcherId}-launcher`, vedi
    // UBISOFT_CONNECT_GAME_ID in ubisoftConnectPlugin.ts) con un proprio
    // CompatibilityProfile — leggiamo lì lo switch che l'utente ha già
    // impostato (e verificato funzionante) per quella card.
    umuRun: db.getCompatProfile(`${launcherId}-launcher`)?.umuRun ?? false,
  });
  writeLog('launch', `[SharedLauncher] Avvio ${def.displayName}: ${result.message ?? '(nessun messaggio)'}`);
  // v1.5.20-dev.30 — richiesta utente: invece di indovinare un tempo di
  // attesa, restituiamo anche `logPath` (già calcolato da spawnDetached
  // dentro ProtonRunner.launch(), prima scartato qui) — permette al
  // chiamante di verificare un segnale REALE ("la NOSTRA specifica
  // invocazione ha finito di preparare il container"), non un timer.
  return { success: result.success, message: result.message ?? '', logPath: result.logPath };
}

/**
 * v1.5.20-dev.30 — richiesta utente: invece di un'attesa a tempo (dev.29,
 * comunque mantenuta come rete di sicurezza finale — vedi gameManager.ts),
 * un segnale REALE legato specificamente al processo che ABBIAMO avviato
 * noi, non a "una finestra con quel nome, chiunque l'abbia aperta"
 * (proposta scartata: il titolo della finestra risulta identico anche
 * quando è nera/rotta, l'utente l'ha verificato di persona — non
 * distinguerebbe affatto i due casi).
 *
 * `umu-run` scrive (verificato: presente in OGNI log reale raccolto in
 * questa sessione, non solo al primo avvio) una sequenza riconoscibile
 * mentre prepara il container — l'ultima riga distintiva prima che il
 * controllo passi all'app vera e propria è sempre una riga `pv-adverb`.
 * Se compare, sappiamo con certezza che QUESTA specifica invocazione ha
 * finito la propria fase di preparazione — non ancora garanzia che
 * l'app sia internamente pronta (login completato ecc., limite dichiarato
 * e accettato, fuori portata senza reverse-engineering specifico), ma un
 * segnale reale, non un tempo indovinato.
 *
 * Se il marcatore non compare entro `maxWaitMs` (formato diverso di una
 * build Proton non ancora vista, o il file di log non si apre) si
 * risolve comunque `false` — il chiamante ricade sul poll esistente
 * (dev.29) come rete di sicurezza, mai un blocco indefinito.
 */
export async function waitForContainerReadyMarker(logPath: string, maxWaitMs = 15_000): Promise<boolean> {
  const marker = 'pv-adverb';
  const pollIntervalMs = 500;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      if (existsSync(logPath)) {
        const content = require('fs').readFileSync(logPath, 'utf-8');
        if (content.includes(marker)) return true;
      }
    } catch {
      // file non ancora scrivibile/leggibile in questo istante — ritenta
      // al prossimo giro, non un errore fatale.
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

/**
 * v1.5.20-dev.14/16 — richiesta utente: quando un gioco richiede un
 * launcher condiviso (requiresLauncher) ma non ha mai file scaricabili
 * tramite il proprio store d'origine (es. titoli Ubisoft riscattati su
 * Epic — vedi CHANGELOG.md), l'unico modo di sapere che è diventato
 * giocabile è cercarlo DENTRO il prefix del launcher condiviso stesso —
 * non l'intero disco, solo dove sappiamo già che deve trovarsi
 * (resolveSharedPrefixExecutionPath, già esistente). Ricerca per nome
 * di CARTELLA che assomiglia al titolo (normalizzato: minuscolo, solo
 * alfanumerico) — mai il database interno del launcher, mai
 * reverse-engineered, fuori scope — stesso principio euristico già
 * usato da findInstalledLauncherExe/resolveGogExe altrove nel progetto.
 *
 * v1.5.20-dev.16 — BUG REALE corretto: la prima versione (dev.14)
 * camminava livello per livello a mano in JS, assumendo una profondità
 * fissa (verificata solo su una struttura di TEST locale, mai su dati
 * reali) — sbagliata su hardware reale, dove Ubisoft Connect installa
 * 4 livelli sotto Program Files, non 2
 * (.../Ubisoft/Ubisoft Game Launcher/games/<TITOLO>/...). Qualunque
 * profondità fissa scelta a mano rischiava di sbagliare di nuovo alla
 * prossima struttura diversa — sostituito con `find -type d` per
 * l'enumerazione ricorsiva (fino a una profondità generosa, gestisce
 * qualunque struttura reale senza bisogno di indovinarne i livelli), il
 * confronto fuzzy per nome resta in JS (necessario: "Watch Dogs 2" vs
 * "WATCH_DOGS2" non è un confronto che un pattern shell -iname
 * gestirebbe bene da solo).
 */
export function findGameExeInSharedPrefix(launcherId: string, gameTitle: string): string | null {
  const driveC = path.join(resolveSharedPrefixExecutionPath(launcherId), 'drive_c');
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedTitle = normalize(gameTitle);
  if (!normalizedTitle) return null;

  for (const sub of ['Program Files (x86)', 'Program Files']) {
    const base = path.join(driveC, sub);
    if (!existsSync(base)) continue;

    let allDirs: string[];
    try {
      const result = execSync(
        `find "${base}" -maxdepth 6 -type d 2>/dev/null`,
        { encoding: 'utf-8', timeout: 8000 }
      );
      allDirs = result.split('\n').filter(Boolean);
    } catch {
      continue;
    }

    for (const dir of allDirs) {
      const normalizedDir = normalize(path.basename(dir));
      if (!normalizedDir) continue;
      if (!normalizedDir.includes(normalizedTitle) && !normalizedTitle.includes(normalizedDir)) continue;
      try {
        const exeResult = execSync(
          `find "${dir}" -maxdepth 3 -iname "*.exe" ` +
          `! -iname "unins*" ! -iname "*crashhandler*" ! -iname "*crashreporter*" ` +
          `! -iname "vcredist*" ! -iname "vc_redist*" ! -iname "dxsetup*" ` +
          `! -iname "*explorer*" ! -iname "*helper*" ! -iname "*updater*" ` +
          `| head -1`,
          { encoding: 'utf-8', timeout: 8000 }
        ).trim();
        if (exeResult) return exeResult;
      } catch {
        // continua col prossimo candidato
      }
    }
  }
  return null;
}

/**
 * v1.5.20-dev.21 — richiesta utente, verificata A MANO prima di scrivere
 * qualunque riga di questa funzione (non ipotizzata): lancio "leggero"
 * di un gioco con requiresLauncher, quando il launcher condiviso
 * risulta già in esecuzione. Invece di richiamare ProtonRunner.launch()
 * (che rifarebbe l'intero `proton run`/`umu-run` da capo — un secondo
 * container Steam Linux Runtime, una seconda inizializzazione), invoca
 * DIRETTAMENTE il `wine` incluso nella STESSA build Proton che il
 * launcher condiviso sta già usando, sulla STESSA prefix. Wine mantiene
 * un solo wineserver per WINEPREFIX (documentato nel man ufficiale) — un
 * secondo processo puntato alla stessa prefix si aggancia alla sessione
 * già viva invece di avviarne una nuova. Confermato empiricamente
 * dall'utente con Watch Dogs 2/Ubisoft Connect: il gioco è partito
 * correttamente, Ubisoft Connect si è ridotto a icona riconoscendolo
 * come proprio, ed è tornato in primo piano alla chiusura del gioco —
 * l'intera catena di autorizzazione ha funzionato, non solo l'avvio.
 *
 * LIMITE NOTO E ACCETTATO, non nascosto: bypassa lo script di Proton
 * stesso, quindi PROTON_EAC_RUNTIME/PROTON_BATTLEYE_RUNTIME (lette SOLO
 * da quello script, mai da wine nudo) non hanno alcun effetto qui, e il
 * processo non gira dentro il container Steam Linux Runtime (a
 * differenza del launcher condiviso, che lo usa per intero se il suo
 * switch Umu-launcher è attivo). Per questo il chiamante (gameManager.ts)
 * usa questa funzione SOLO quando il profilo del gioco non ha EAC/
 * BattlEye attivi — altrimenti resta sul lancio pieno.
 *
 * v1.5.20-dev.24 — BUG REALE CONFERMATO DALL'UTENTE: bypassare lo
 * script di Proton significa anche perdere la sua auto-rilevazione del
 * metodo di sincronizzazione (fsync/esync) — il wineserver già attivo
 * (avviato dal launcher condiviso TRAMITE quello script) nasce con
 * fsync attivo per design su un kernel moderno, ma un wine nudo lanciato
 * qui non lo sa e prova ad agganciarsi diversamente: blocco silenzioso,
 * nessuna finestra, nessun errore visibile. WINEFSYNC=1 esplicito sotto
 * risolve — verificato funzionante dall'utente sul proprio sistema.
 */
export async function launchGameInSharedPrefix(
  launcherId: string,
  exePath: string,
  args: string[] = [],
  cwd?: string,
  gameId?: string,
): Promise<{ success: boolean; pid?: number; message: string; logPath?: string }> {
  // Stessa build Proton che il launcher condiviso sta già usando — MAI
  // una build diversa: è esattamente la causa di un mismatch di
  // versione fra wine e wineserver scoperta investigando questa stessa
  // funzionalità (build "Proton - Experimental", aggiornata di frequente
  // da Steam anche senza richiesta esplicita — vedi diario di sessione).
  const launcherGame = db.getGameById(`${launcherId}-launcher`);
  const runnerId = launcherGame?.runner;
  if (!runnerId) {
    return { success: false, message: `Runner del launcher condiviso "${launcherId}" sconosciuto — impossibile risolvere la build Proton corretta.` };
  }

  const protonBin = resolveProtonBin(runnerId);
  if (!protonBin) {
    return { success: false, message: `Build Proton "${runnerId}" non trovata.` };
  }
  const protonDir = path.dirname(protonBin);
  // "files/bin/wine" (Proton 7+/GE moderne) o "dist/bin/wine" (build più
  // vecchie) — entrambe convenzioni reali viste su build diverse in
  // questo stesso progetto, non un'invenzione.
  const wineBin = [
    path.join(protonDir, 'files', 'bin', 'wine'),
    path.join(protonDir, 'dist', 'bin', 'wine'),
  ].find(p => existsSync(p));
  if (!wineBin) {
    return { success: false, message: `Binario wine non trovato dentro la build Proton "${runnerId}".` };
  }

  const winePrefix = resolveSharedPrefixExecutionPath(launcherId);
  if (!existsSync(winePrefix)) {
    return { success: false, message: `Prefix condivisa di "${launcherId}" non trovata (${winePrefix}).` };
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    WINEPREFIX: winePrefix,
    // v1.5.20-dev.38 — BUG REALE trovato indagando ACS con l'utente: il
    // file di log appena aggiunto (dev.37) risultava sempre vuoto,
    // anche a fronte di un processo che moriva subito — non perché non
    // succedesse nulla, ma perché stavamo dicendo esplicitamente a Wine
    // di sopprimere OGNI canale diagnostico, errori compresi. La stessa
    // classe di informazione che ci era servita mesi fa (WINEDEBUG=+seh,
    // trovò il crash di Xalia) restava tagliata fuori qui per
    // costruzione. `err+all` mostra solo i messaggi di livello errore
    // su tutti i canali — molto più silenzioso di un debug completo, ma
    // non nasconde più un crash reale come faceva `-all`.
    // v1.5.20-dev.39 — `err+all` (dev.38) non bastava: le due righe
    // `NtRaiseHardError...stub` ottenute confermano lo stesso pattern
    // già visto mesi fa investigando Xalia, ma senza la traccia SEH che
    // allora ci aveva mostrato l'eccezione esatta — quella traccia vive
    // su un canale a sé (`seh`), non incluso nella classe generica
    // "err" per "tutti i canali". Aggiunto esplicitamente.
    WINEDEBUG:  'err+all,+seh',
    // v1.5.20-dev.24 — BUG REALE CONFERMATO DALL'UTENTE: senza questa
    // variabile il lancio leggero restava bloccato in silenzio (nessun
    // errore visibile, semplicemente nessuna finestra) — impostando
    // WINEFSYNC=1 a mano prima di invocare lo script il gioco partiva
    // correttamente. Causa: quando Ubisoft Connect parte tramite
    // umu-run/Proton (percorso pieno), lo script di Proton rileva da
    // solo il supporto fsync del kernel e lo attiva internamente PRIMA
    // di invocare wine — il wineserver nasce quindi già con fsync
    // attivo. Il lancio leggero invoca wine nudo, bypassando del tutto
    // quello script (è il punto stesso di questa funzione) — senza
    // impostarla esplicitamente qui, il nuovo processo tenta di
    // agganciarsi con un metodo di sincronizzazione diverso da quello
    // con cui il wineserver è già stato avviato: un blocco silenzioso,
    // non un errore esplicito come il mismatch di versione (931/957)
    // già diagnosticato in precedenza — stessa causa profonda (due
    // processi sulla stessa prefix devono davvero combaciare in tutto,
    // non solo nella build Proton), diversa manifestazione.
    // Assume supporto fsync del kernel — praticamente universale sui
    // kernel Linux moderni (verificato funzionante sul sistema reale
    // dell'utente), ma non garantito su un kernel molto datato.
    WINEFSYNC:  '1',
  };

  try {
    // v1.5.20-dev.37 — BUG DIAGNOSTICO REALE: questo percorso di lancio
    // scartava sempre stdout/stderr (`stdio: 'ignore'`), a differenza di
    // ogni altro percorso di lancio del progetto (tutti scrivono un log
    // reale via `gameLaunchLogPath`, già esistente e riusato qui invece
    // di duplicato). Trovato indagando un caso reale con l'utente:
    // Assassin's Creed Syndicate spariva in silenzio pochi secondi dopo
    // l'avvio, senza mostrare mai una finestra — nessun modo di sapere
    // perché, dato che l'unico output del processo veniva buttato via
    // a prescindere. D'ora in poi qualunque crash/errore su questo
    // percorso lascia una traccia reale da ispezionare, come già
    // avviene per ogni altro tipo di lancio.
    const logPath = gameId ? gameLaunchLogPath(gameId) : undefined;
    let stdio: 'ignore' | [any, any, any] = 'ignore';
    if (logPath) {
      try {
        mkdirSync(path.dirname(logPath), { recursive: true });
        const fd = openSync(logPath, 'a');
        stdio = ['ignore', fd, fd];
      } catch (e) {
        writeLog('warning', `[SharedLauncher] Impossibile aprire il log ${logPath}: ${e} — stdout/stderr non catturati per questo lancio.`);
      }
    }
    const child = spawn(wineBin, [exePath, ...args], {
      env,
      cwd: cwd ?? path.dirname(exePath),
      detached: true,
      stdio,
    });
    child.unref();
    writeLog('launch', `[SharedLauncher] Lancio leggero (sessione già attiva di "${launcherId}"): ${wineBin} "${exePath}"`);
    return { success: true, pid: child.pid, message: `Avviato nella sessione condivisa già attiva di "${launcherId}"`, logPath };
  } catch (e) {
    return { success: false, message: `Lancio leggero fallito: ${e}` };
  }
}
