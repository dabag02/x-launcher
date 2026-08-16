/**
 * eaAppPlugin.ts — v2.0.41-dev.17, Fase B (primo launcher condiviso dopo
 * Ubisoft Connect)
 *
 * Stessa architettura di ubisoftConnectPlugin.ts, deliberatamente
 * replicata (non accorpata in un plugin unico — deciso esplicitamente con
 * l'utente: ogni launcher condiviso resta un proprio StorePlugin per le
 * proprie particolarità, vedi commento su storeId in
 * thirdPartyLaunchers.ts). EA App trattato come un gioco vero — una riga
 * in `games` che rappresenta il launcher stesso — non un placeholder come
 * BattlenetPlugin (ancora in attesa del proprio turno, un launcher alla
 * volta).
 *
 * Fase A (card + bootstrap + lancio) e Fase B "parte 2" (scansione della
 * libreria interna, cross-store dedup) entrambe complete — stesso ordine
 * già seguito per Ubisoft Connect: bootstrap verificato su hardware reale
 * PRIMA, formato reale del registro (voci Uninstall standard di Windows,
 * filtrate su Publisher="Electronic Arts") verificato a mano dall'utente
 * POI, mai assunto.
 *
 * Stub sottile coerente con GOG/Epic/Amazon/Ubisoft Connect: la vera
 * pipeline di installazione vive in downloadManager.ts (da estendere con
 * un runEAApp, sullo stesso modello di runUbisoftConnect) — installGame()/
 * uninstallGame() qui non fanno nulla di reale.
 */
import { StorePlugin } from './base';
import { Game, LogEntry } from '../../types';
import path from 'path';
import { existsSync, readdirSync, cpSync } from 'fs';
import { execSync } from 'child_process';
import * as db from '../db';
import { getThirdPartyLauncherDefinition } from './thirdPartyLaunchers';
import { compatibilityManager } from '../compatibilityManager';
import { isLauncherBootstrapped, markLauncherBootstrapped, resolveSharedPrefixExecutionPath, getSharedPrefixBasePath } from '../sharedLauncherManager';
import { findInstalledLauncherExe } from '../downloadManager';
import { writeLog } from '../logger';
import { readWineReg, lastPathSegment, WineRegKey } from '../wineRegistry';
import { notificationEngine } from '../notificationEngine';

// Stessa replica minima di GameManager.addLog() già usata in
// ubisoftConnectPlugin.ts — i plugin non hanno un riferimento a
// GameManager, ma i log devono restare visibili nel Debug Console UI
// (file + DB persistito), non solo su file.
function pluginLog(message: string, type: LogEntry['type'] = 'system') {
  const timestamp = new Date().toLocaleTimeString([], { hour12: false });
  db.insertLog({ timestamp, message, type });
  writeLog(type, message);
}

// Id stabile — mai generato dinamicamente, un solo launcher EA App
// possibile nel sistema.
export const EA_APP_GAME_ID = 'ea-app-launcher';

// Stessa identica logica di resolveDefaultRunner() in
// ubisoftConnectPlugin.ts (bug reale già trovato lì: un default fisso
// tipo 'Proton 8.0-4' non corrispondeva a nessuna build davvero
// installata sul sistema dell'utente) — duplicata deliberatamente
// (poche righe, non vale un'estrazione in un modulo condiviso solo per
// questo).
function resolveDefaultRunner(): Game['runner'] {
  const runners = compatibilityManager.getAvailableRunners().filter(r => /proton/i.test(r.id));
  if (runners.length === 0) return 'Proton 8.0-4' as Game['runner'];
  const steamProton = runners.find(r => !/^GE-Proton|^Proton-GE/i.test(r.id));
  return (steamProton ?? runners[0]).id as Game['runner'];
}

// v2.0.41-dev.14 — richiesta utente: automatizza il fix scoperto e
// applicato a mano durante la diagnosi (vedi commento esteso su
// executableRelPathHint in thirdPartyLaunchers.ts per la causa completa,
// verificata leggendo il sorgente Wine). Riassunto: l'installer EA usa
// CreateSymbolicLinkW per popolare la cartella "stabile"
// (".../Electronic Arts/EA Desktop/EA Desktop/") come collegamento
// verso quella VERSIONATA reale (es. "13.768.0.6281-1786536582/EA
// Desktop/") — quella funzione è uno stub vuoto in Wine, ritorna
// sempre successo senza creare nulla, lasciando la cartella stabile
// vuota/incompleta. Copiamo qui il contenuto reale al posto del
// symlink mai creato. Nessuna eliminazione delle cartelle versionate
// dopo la copia (a differenza dello script di riferimento trovato
// online, che le rimuove) — deliberatamente più prudente: non
// cancelliamo mai nulla per un fix best-effort, il costo di lasciarle
// è solo un po' di spazio disco, non un rischio.
function reconcileEADesktopSymlink(driveC: string): void {
  const eaDesktopDir = path.join(driveC, 'Program Files', 'Electronic Arts', 'EA Desktop');
  if (!existsSync(eaDesktopDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(eaDesktopDir);
  } catch {
    return; // cartella non ancora creata o non leggibile — nulla da riconciliare ora
  }

  // Pattern verificato sul sistema reale dell'utente:
  // "13.768.0.6281-1786536582" (versione a 4 componenti + timestamp).
  // Solo cartelle che contengono DAVVERO "EA Desktop/EADesktop.exe" —
  // uno stesso nome che comparisse per un altro motivo non basta.
  const versionDirRegex = /^\d+\.\d+\.\d+\.\d+-\d+$/;
  const candidates = entries
    .filter(name => versionDirRegex.test(name))
    .filter(name => existsSync(path.join(eaDesktopDir, name, 'EA Desktop', 'EADesktop.exe')));

  if (candidates.length === 0) return; // niente da riconciliare — cartella stabile già a posto (o mai stata popolata)

  // La più recente per ordine naturale della stringa versione — stesso
  // criterio (sort -V) usato dallo script di riferimento trovato online
  // per lo stesso identico problema.
  candidates.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const latest = candidates[candidates.length - 1];
  const source = path.join(eaDesktopDir, latest, 'EA Desktop');
  const target = path.join(eaDesktopDir, 'EA Desktop');

  try {
    cpSync(source, target, { recursive: true, force: true });
    pluginLog(`[EA APP] Cartella "EA Desktop" stabile riconciliata da "${latest}" (bug Wine CreateSymbolicLinkW — vedi thirdPartyLaunchers.ts).`, 'system');
  } catch (e: any) {
    pluginLog(`[EA APP] Riconciliazione cartella "EA Desktop" fallita: ${e?.message ?? e}`, 'warning');
  }
}

// ---------------------------------------------------------------------------
// v2.0.41-dev.17 — libreria nativa EA App (giochi comprati/installati
// DIRETTAMENTE lì, non solo riscattati su Epic/GOG/Amazon/Steam) —
// richiesta utente, stesso schema già seguito per Ubisoft Connect: mai
// scritto un byte finché il formato reale non è stato verificato a mano
// dall'utente sul proprio sistema (vedi conversazione — Dead Space 2,
// voce Uninstall standard di Windows).
// ---------------------------------------------------------------------------

interface DetectedEAGame {
  /** GUID della chiave di registro (es. "{C549C2A2-...}") — id stabile,
   *  non derivato dal titolo: verificato che ogni voce Uninstall ne ha
   *  sempre uno, a differenza di un eventuale id numerico "Origin Games"
   *  che sul sistema dell'utente compariva solo per un titolo legacy
   *  (Dead Space 2, via compatibilità Origin) — non un dato affidabile
   *  per ogni gioco EA presente o futuro. */
  guid: string;
  title: string;
  installLocationWindows: string;
  /** Percorso .exe letto da DisplayIcon, se presente e valido — solo un
   *  hint, findExeInKnownDir sotto fa comunque una ricerca reale se
   *  manca o non è utilizzabile. */
  exeHintWindows: string | null;
}

// Stessa identica normalizzazione già in uso in
// findGameExeInSharedPrefix (sharedLauncherManager.ts) e in
// ubisoftConnectPlugin.ts — duplicata deliberatamente (una riga, non
// vale un import), qui usata per il confronto cross-store.
const normalizeTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Legge system.reg del prefix condiviso EA App e ne estrae i giochi
 * REALMENTE installati — l'equivalente EA dei file .acf di Steam o
 * della chiave Installs di Ubisoft Connect, ma qui una singola voce
 * Uninstall standard di Windows basta da sola (DisplayName +
 * InstallLocation + DisplayIcon), filtrata su Publisher — niente
 * incrocio fra due chiavi separate come serviva per Ubisoft.
 */
function scanInstalledEAGames(): DetectedEAGame[] {
  const pfxRoot = resolveSharedPrefixExecutionPath('ea-app');
  const parsed = readWineReg(path.join(pfxRoot, 'system.reg'));

  // Stessa diagnostica sempre presente, indipendente dall'esito, già
  // stabilita per Ubisoft Connect dopo un test reale che altrimenti
  // sarebbe rimasto ambiguo (vedi commento equivalente in
  // ubisoftConnectPlugin.ts per il perché).
  if (parsed === null) {
    pluginLog(`[EA APP] Scan libreria nativa: system.reg non trovato in ${path.join(pfxRoot, 'system.reg')}.`, 'warning');
    return [];
  }
  if ('error' in parsed) {
    pluginLog(`[EA APP] Scan libreria nativa: system.reg trovato ma il parsing è fallito — ${parsed.error}`, 'error');
    return [];
  }
  const keys = parsed;
  pluginLog(`[EA APP] Scan libreria nativa: ${keys.length} chiavi lette da system.reg.`, 'info');

  const results: DetectedEAGame[] = [];
  for (const k of keys) {
    if (!k.path.toLowerCase().includes('\\uninstall\\')) continue;
    if (k.values['Publisher'] !== 'Electronic Arts') continue;

    const displayName = k.values['DisplayName'];
    const installLocation = k.values['InstallLocation'];
    if (!displayName || !installLocation) continue;

    // v2.0.41-dev.17 — esclude gli strumenti/redistribuibili propri di
    // EA Desktop (verificato sul sistema reale: EA Desktop stesso e i
    // suoi componenti legacy — legacyPM, EAInstaller — hanno anch'essi
    // Publisher="Electronic Arts", ma installano dentro la propria
    // cartella o "Common Files\EAInstaller", mai come un gioco vero,
    // che sul sistema dell'utente vive altrove — "Program Files\EA
    // Games\<titolo>\" per Dead Space 2).
    const installLower = installLocation.toLowerCase();
    if (installLower.includes('electronic arts\\ea desktop') || installLower.includes('eainstaller')) {
      continue;
    }

    // Il valore, dopo l'unescape del parser, porta ancora le virgolette
    // letterali scritte nel registro attorno al percorso reale
    // (verificato sul sistema dell'utente: `"C:\...\deadspace2.exe"`) —
    // vanno tolte, insieme a un eventuale suffisso ",N" (indice icona,
    // convenzione Windows comune, non vista in questo esempio specifico
    // ma non costosa da gestire comunque).
    let exeHintWindows: string | null = null;
    const displayIcon = k.values['DisplayIcon'];
    if (displayIcon) {
      let cleaned = displayIcon.trim();
      if (cleaned.startsWith('"')) {
        const closingQuote = cleaned.indexOf('"', 1);
        cleaned = closingQuote !== -1 ? cleaned.slice(1, closingQuote) : cleaned.replace(/^"+|"+$/g, '');
      } else {
        cleaned = cleaned.replace(/,-?\d+$/, '');
      }
      if (cleaned.toLowerCase().endsWith('.exe')) exeHintWindows = cleaned;
    }

    results.push({ guid: lastPathSegment(k), title: displayName, installLocationWindows: installLocation, exeHintWindows });
  }

  pluginLog(`[EA APP] Scan libreria nativa: ${results.length} giochi risolti con nome+percorso (Publisher "Electronic Arts", esclusi i componenti di EA Desktop stesso).`, 'info');
  return results;
}

/** "C:\Program Files\EA Games\Dead Space 2\" → path assoluto Linux sotto drive_c. */
function windowsPathToLinux(driveC: string, winPath: string): string {
  const rel = winPath.replace(/^[a-zA-Z]:/, '').replace(/\\/g, '/').replace(/^\/+/, '');
  return path.join(driveC, rel);
}

/**
 * Stessi identici filtri di esclusione già usati in
 * ubisoftConnectPlugin.ts (duplicata deliberatamente) — se exeHintWindows
 * da DisplayIcon esiste già ed è valido, lo si usa direttamente invece di
 * cercare, più preciso di una ricerca alla cieca nella cartella.
 */
function findExeInKnownDir(absoluteDir: string): string | null {
  if (!existsSync(absoluteDir)) return null;
  try {
    const result = execSync(
      `find "${absoluteDir}" -maxdepth 3 -iname "*.exe" ` +
      `! -iname "unins*" ! -iname "*crashhandler*" ! -iname "*crashreporter*" ` +
      `! -iname "vcredist*" ! -iname "vc_redist*" ! -iname "dxsetup*" ` +
      `! -iname "*explorer*" ! -iname "*helper*" ! -iname "*updater*" ` +
      `| head -1`,
      { encoding: 'utf-8', timeout: 8000 }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}

export class EAAppPlugin extends StorePlugin {
  readonly id = 'EA App' as const;
  readonly name = 'EA App';
  readonly drmFree = false;
  readonly description = 'EA App — launcher condiviso richiesto dai giochi EA comprati su altri store.';
  // Nessun tool CLI: l'installer si scarica a mano dal sito ufficiale
  // (vedi installerUrl in thirdPartyLaunchers.ts, verificato con
  // web_fetch prima di scriverlo — link diretto, non dietro un trigger
  // JavaScript come Ubisoft Connect).
  readonly requiredTool = '';

  // Stesso principio già usato per Ubisoft Connect (e prima ancora per
  // SteamPlugin): "connesso" == il launcher condiviso è stato davvero
  // bootstrappato in shared-launchers/ (installer eseguito e primo
  // lancio riuscito, non solo la cartella creata).
  async isAuthenticated(): Promise<boolean> {
    return isLauncherBootstrapped('ea-app');
  }

  async getLibrary(): Promise<Game[]> {
    this.ensureSeeded();
    const launcherGame = db.getGameById(EA_APP_GAME_ID);
    const games: Game[] = launcherGame ? [launcherGame] : [];

    // Niente da scansionare finché l'utente non ha mai completato il
    // bootstrap — stesso identico controllo già in uso in
    // onLauncherProcessClosed sopra.
    if (!isLauncherBootstrapped('ea-app')) return games;

    const detected = scanInstalledEAGames();
    if (detected.length === 0) return games;

    const driveC = path.join(resolveSharedPrefixExecutionPath('ea-app'), 'drive_c');
    const allExisting = db.getAllGames();
    // Stesso dedup persistente già stabilito per Ubisoft Connect — il
    // dedup a 30s di NotificationQueue non basta (refreshLibrary() gira
    // periodicamente in background).
    const recentNotifications = notificationEngine.getRecent(200);

    for (const g of detected) {
      const nativeId = `ea-app-${g.guid.replace(/[{}]/g, '')}`;
      const normalizedTarget = normalizeTitle(g.title);

      // Riga nativa già creata da noi in un refresh precedente per
      // QUESTO stesso gioco: la ricostruiamo identica — stesso principio
      // di Steam/Ubisoft Connect, il merge generico in gameManager.ts fa
      // già "protect on conflict" per isInstalled/executablePath.
      const alreadyOwnRow = allExisting.some(existing => existing.id === nativeId);

      // Match in un ALTRO store per titolo normalizzato — mai contro la
      // card del launcher stesso, mai contro una riga nativa EA App
      // (compresa la propria, già esclusa sopra).
      const crossStoreMatch = !alreadyOwnRow
        ? allExisting.find(existing =>
            existing.id !== EA_APP_GAME_ID &&
            existing.store !== 'EA App' &&
            normalizeTitle(existing.title) === normalizedTarget
          )
        : undefined;

      if (crossStoreMatch) {
        if (crossStoreMatch.requiresLauncher === 'ea-app') {
          pluginLog(`[EA APP] "${g.title}" installato nativamente — già collegato a "${crossStoreMatch.title}" (${crossStoreMatch.store}), nessuna azione necessaria.`, 'info');
        } else {
          const alreadyAsked = recentNotifications.some(n =>
            n.source === 'shared-launcher-scan' && n.game_id === crossStoreMatch.id
          );
          if (!alreadyAsked) {
            notificationEngine.emit({
              type: 'shared-launcher-native-game-found',
              launcherId: 'ea-app',
              launcherName: 'EA App',
              nativeTitle: g.title,
              targetGameId: crossStoreMatch.id,
              targetGameTitle: crossStoreMatch.title,
              targetStore: crossStoreMatch.store,
            });
            pluginLog(`[EA APP] "${g.title}" installato nativamente — sembra corrispondere a "${crossStoreMatch.title}" (${crossStoreMatch.store}): notifica di collegamento inviata.`, 'info');
          } else {
            pluginLog(`[EA APP] "${g.title}" installato nativamente — match con "${crossStoreMatch.title}" (${crossStoreMatch.store}) già proposto in precedenza, non ripropongo.`, 'info');
          }
        }
        continue; // mai una riga nuova quando esiste già un match altrove
      }

      // Nessun match in nessun altro store: riga propria, comprato/
      // installato SOLO su EA App — stesso schema di Ubisoft Connect
      // (prefixPath proprio, non requiresLauncher: quel campo serve per
      // il DRM di un gioco comprato altrove, non per un gioco già
      // nativo del launcher).
      let exe: string | null = null;
      if (g.exeHintWindows) {
        const candidate = windowsPathToLinux(driveC, g.exeHintWindows);
        if (existsSync(candidate)) exe = candidate;
      }
      if (!exe) {
        exe = findExeInKnownDir(windowsPathToLinux(driveC, g.installLocationWindows));
      }

      games.push({
        id:            nativeId,
        title:         g.title,
        store:         'EA App',
        runner:        resolveDefaultRunner(),
        isInstalled:   true,
        playTimeHours: 0,
        coverImage:    '',
        previewImage:  '',
        description:   '',
        tags:          [],
        status:        exe ? 'Ready to Launch' : 'Not Installed',
        executablePath: exe ?? undefined,
        prefixPath:    getSharedPrefixBasePath('ea-app'),
      });
    }

    return games;
  }

  /**
   * Crea la riga "EA App" in games se non esiste ancora. Chiamata a ogni
   * refresh libreria (come ogni plugin), ma upsertGame non sovrascrive
   * mai isInstalled/executablePath/runner di un gioco già presente
   * (stesso principio "insert once, protect on conflict" già in uso per
   * executable_path — vedi commento in db.ts) — quindi è sicuro
   * richiamarla sempre, non serve un flag "già seedato" a parte.
   */
  private ensureSeeded(): void {
    if (db.getGameById(EA_APP_GAME_ID)) return;
    const def = getThirdPartyLauncherDefinition('ea-app');
    db.upsertGame({
      id:            EA_APP_GAME_ID,
      title:         def?.displayName ?? 'EA App',
      store:         'EA App',
      runner:        resolveDefaultRunner(),
      isInstalled:   false,
      playTimeHours: 0,
      coverImage:    '',
      previewImage:  '',
      description:   'Launcher EA App — richiesto da alcuni giochi EA comprati su Epic, GOG, Amazon Games o Steam. Installalo una sola volta: verrà condiviso da tutti i giochi che lo richiedono.',
      tags:          ['Launcher'],
      status:        'Not Installed',
    });
  }

  async installGame(_id: string) {
    return { success: true, message: 'Gestito da downloadManager (da estendere con runEAApp, sullo stesso modello di runUbisoftConnect).' };
  }

  async uninstallGame(_id: string) {
    return { success: true };
  }

  /**
   * Stessa identica logica di onLauncherProcessClosed() in
   * ubisoftConnectPlugin.ts — vedi quel file per il bug reale già
   * trovato lì (findMainExe() sull'intero drive_c prendeva un'utility
   * di sistema Wine invece del vero eseguibile) e per il perché questo
   * hook vive nel plugin invece che centralizzato in gameManager.ts
   * (StorePlugin.onLauncherProcessClosed).
   *
   * v2.0.41-dev.14 — reconcileEADesktopSymlink chiamata SEMPRE, non
   * solo al primo bootstrap: il problema che risolve (vedi commento
   * esteso su quella funzione) si ripresenta a ogni aggiornamento di
   * EA Desktop, non solo alla prima installazione — verificato leggendo
   * un resoconto pubblico dello stesso identico comportamento ricorrente
   * per un altro gioco EA. Il resto della funzione (rilevamento
   * eseguibile reale + markLauncherBootstrapped) resta invariato,
   * ancora una tantum solo al primo bootstrap.
   */
  async onLauncherProcessClosed(game: Game): Promise<void> {
    if (game.id !== EA_APP_GAME_ID) return;
    const realPrefixRoot = resolveSharedPrefixExecutionPath('ea-app');
    const driveC = path.join(realPrefixRoot, 'drive_c');

    reconcileEADesktopSymlink(driveC);

    if (isLauncherBootstrapped('ea-app')) return;
    const def = getThirdPartyLauncherDefinition('ea-app');
    const realExe = findInstalledLauncherExe(driveC, def?.executableRelPathHint);
    if (realExe) {
      db.updateGameConfig(game.id, { executablePath: realExe });
      const relExe = path.relative(driveC, realExe);
      markLauncherBootstrapped('ea-app', game.runner ?? 'Proton 8.0-4', relExe);
      pluginLog(`[EA APP] Bootstrap completato — eseguibile reale: ${realExe}`, 'system');
    } else {
      pluginLog(`[EA APP] Eseguibile reale non trovato dopo la chiusura dell'installer — l'utente dovrà riprovare il lancio.`, 'warning');
    }
  }
}
