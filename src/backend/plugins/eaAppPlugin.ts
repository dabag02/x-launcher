/**
 * eaAppPlugin.ts — v2.0.41-dev.11, Fase B (primo launcher condiviso dopo
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
 * FASE A SOLTANTO: card + bootstrap (installazione nel prefix condiviso)
 * + lancio. Nessuna scansione della libreria interna di EA App qui —
 * quella (Fase B "parte 2", stesso ordine già seguito per Ubisoft Connect:
 * bootstrap verificato PRIMA, formato reale del manifest/registro
 * verificato a mano su hardware reale POI, mai assunto) arriva solo dopo
 * che l'utente avrà confermato il bootstrap funzionante.
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
import * as db from '../db';
import { getThirdPartyLauncherDefinition } from './thirdPartyLaunchers';
import { compatibilityManager } from '../compatibilityManager';
import { isLauncherBootstrapped, markLauncherBootstrapped, resolveSharedPrefixExecutionPath } from '../sharedLauncherManager';
import { findInstalledLauncherExe } from '../downloadManager';
import { writeLog } from '../logger';

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
    return launcherGame ? [launcherGame] : [];
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
