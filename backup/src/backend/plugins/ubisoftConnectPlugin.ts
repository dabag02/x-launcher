/**
 * ubisoftConnectPlugin.ts — launcher condiviso Ubisoft Connect, trattato
 * come gioco vero (una riga in `games` che rappresenta il launcher
 * stesso, non una card virtuale). BattlenetPlugin resta invece un
 * semplice stub, un launcher alla volta.
 *
 * Stub sottile coerente con GOG/Epic/Amazon: la vera pipeline di
 * installazione vive in downloadManager.ts (runUbisoftConnect) —
 * installGame()/uninstallGame() qui non fanno nulla di reale.
 */
import { StorePlugin } from './base';
import { Game, LogEntry } from '../../types';
import path from 'path';
import * as db from '../db';
import { getThirdPartyLauncherDefinition } from './thirdPartyLaunchers';
import { compatibilityManager } from '../compatibilityManager';
import { isLauncherBootstrapped, markLauncherBootstrapped, resolveSharedPrefixExecutionPath, getSharedPrefixBasePath } from '../sharedLauncherManager';
import { findInstalledLauncherExe } from '../downloadManager';
import { writeLog } from '../logger';
import { readWineReg, lastPathSegment, WineRegKey } from '../wineRegistry';
import { notificationEngine } from '../notificationEngine';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

/**
 * Replica minima di GameManager.addLog(): i plugin non hanno un
 * riferimento a GameManager, ma onLauncherProcessClosed (sotto) deve
 * restare visibile nel Debug Console UI (file + DB persistito).
 */
function pluginLog(message: string, type: LogEntry['type'] = 'system') {
  const timestamp = new Date().toLocaleTimeString([], { hour12: false });
  db.insertLog({ timestamp, message, type });
  writeLog(type, message);
}

// Id stabile — mai generato dinamicamente, un solo launcher Ubisoft
// Connect possibile nel sistema.
export const UBISOFT_CONNECT_GAME_ID = 'ubisoft-connect-launcher';

/**
 * Sceglie un default per il runner al seeding — prova a risolvere una
 * build Proton/GE-Proton REALMENTE installata, invece di un segnaposto
 * fisso. Bug reale trovato: 'Proton 8.0-4' come default fisso non
 * corrispondeva a nessuna build davvero installata sul sistema
 * dell'utente, causando un fallback silenzioso a Wine di sistema in
 * downloadManager.runUbisoftConnect (ora bloccato da un safeguard lì,
 * ma meglio partire già con un default che abbia probabilità di essere
 * reale). Preferisce una Proton Steam ufficiale se presente, altrimenti
 * la prima build disponibile — stessa priorità già discussa per la
 * selezione manuale in Game Options. Se nessuna Proton è installata,
 * resta un segnaposto: il safeguard in downloadManager blocca comunque
 * l'installazione con un messaggio chiaro finché l'utente non ne
 * installa/sceglie una vera.
 */
function resolveDefaultRunner(): Game['runner'] {
  const runners = compatibilityManager.getAvailableRunners().filter(r => /proton/i.test(r.id));
  if (runners.length === 0) return 'Proton 8.0-4' as Game['runner'];
  const steamProton = runners.find(r => !/^GE-Proton|^Proton-GE/i.test(r.id));
  return (steamProton ?? runners[0]).id as Game['runner'];
}

// ---------------------------------------------------------------------------
// v2.0.41-dev.4 — libreria nativa Ubisoft Connect (Watch Dogs 2 comprato/
// installato DIRETTAMENTE lì, non solo riscattato su Epic/GOG/Amazon —
// richiesta utente, discussa e verificata a mano prima di scrivere
// questo codice: vedi conversazione, chiavi di registro reali confermate
// sul prefix dell'utente prima di assumerne il formato).
// ---------------------------------------------------------------------------

interface DetectedUbisoftGame {
  productId: string;
  displayName: string;
  installDirWindows: string;
}

// Stessa identica normalizzazione già in uso in
// findGameExeInSharedPrefix (sharedLauncherManager.ts) — qui applicata
// nella direzione opposta (da un titolo rilevato si cerca una riga
// `games` già esistente, invece che da un titolo noto si cerca una
// cartella). Duplicata deliberatamente (una riga, non vale un import
// per così poco) — se la normalizzazione cambia là, va allineata anche
// qui.
const normalizeTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Le voci Uninstall standard di Windows (`...\Uninstall\<subkey
 * arbitraria>`) sono l'UNICA fonte del nome leggibile — la chiave
 * `Launcher\Installs\<id>` ha solo InstallDir/Language, mai un nome.
 * Le due si collegano tramite l'id prodotto, presente nel valore
 * `UninstallString` come `uplay://uninstall/<id>` (verificato sul
 * prefix reale dell'utente) — non tramite il percorso della chiave
 * Uninstall stessa, che non è prevedibile.
 */
function findDisplayNamesByProductId(keys: WineRegKey[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const k of keys) {
    if (!k.path.toLowerCase().includes('\\uninstall\\')) continue;
    const uninstallString = k.values['UninstallString'];
    const displayName = k.values['DisplayName'];
    if (!uninstallString || !displayName) continue;
    const m = uninstallString.match(/uplay:\/\/uninstall\/(\d+)/i);
    if (m) map.set(m[1], displayName);
  }
  return map;
}

/**
 * Legge system.reg del prefix condiviso Ubisoft Connect e ne estrae i
 * giochi REALMENTE installati — l'equivalente per Ubisoft Connect dei
 * file .acf che Steam legge (steamPlugin.ts). Restituisce [] (mai
 * un'eccezione) se il launcher non è ancora stato bootstrappato o il
 * file non è leggibile — nessun dato da leggere in quel caso, non un
 * errore.
 */
function scanInstalledUbisoftGames(): DetectedUbisoftGame[] {
  const pfxRoot = resolveSharedPrefixExecutionPath('ubisoft-connect');
  const regPath = path.join(pfxRoot, 'system.reg');
  const parsed = readWineReg(regPath);

  // v2.0.41-dev.5 — BUG UTENTE: "sembra non succedere nulla" — causa
  // reale, il percorso di successo silenzioso (gioco già collegato, vedi
  // sotto in getLibrary) era indistinguibile nei log da un fallimento
  // silenzioso (readWineReg che ingoiava un'eccezione, o zero match
  // trovati). Diagnostica esplicita qui, SEMPRE loggata, indipendente
  // dall'esito — stessa lezione già pagata più volte in questo progetto
  // (WINEDEBUG=-all, sintassi CLI sbagliate: un fallimento silenzioso
  // costa sempre più caro di un log in più).
  if (parsed === null) {
    pluginLog(`[UBISOFT] Scan libreria nativa: system.reg non trovato in ${regPath} — il launcher non è mai stato avviato del tutto, o il prefix non è nella posizione attesa.`, 'warning');
    return [];
  }
  if ('error' in parsed) {
    pluginLog(`[UBISOFT] Scan libreria nativa: system.reg trovato ma il parsing è fallito — ${parsed.error}`, 'error');
    return [];
  }
  const keys = parsed;
  pluginLog(`[UBISOFT] Scan libreria nativa: ${keys.length} chiavi lette da system.reg.`, 'info');

  const displayNames = findDisplayNamesByProductId(keys);
  const results: DetectedUbisoftGame[] = [];
  let installsKeysSeen = 0;

  for (const k of keys) {
    // Chiave `...\Ubisoft\Launcher\Installs\<id>` — i tre segmenti
    // immediatamente PRIMA dell'id (che varia, quindi non testabile
    // alla lettera): niente ipotesi su Wow6432Node o meno davanti,
    // funziona identico con o senza quel prefisso di redirection a 32
    // bit.
    const parts = k.path.split('\\').map(s => s.toLowerCase());
    if (parts.length < 4) continue;
    const tail = parts.slice(parts.length - 4, parts.length - 1).join('\\');
    if (tail !== 'ubisoft\\launcher\\installs') continue;
    installsKeysSeen++;

    const productId = lastPathSegment(k);
    const installDirWindows = k.values['InstallDir'];
    if (!productId || !installDirWindows) {
      pluginLog(`[UBISOFT] Chiave Installs trovata (${k.path}) ma senza id o InstallDir leggibili — saltata.`, 'warning');
      continue;
    }

    const displayName = displayNames.get(productId);
    if (!displayName) {
      pluginLog(`[UBISOFT] Prodotto installato id=${productId} trovato nel registro ma senza DisplayName corrispondente nella voce Uninstall — saltato.`, 'warning');
      continue;
    }
    results.push({ productId, displayName, installDirWindows });
  }

  pluginLog(`[UBISOFT] Scan libreria nativa: ${installsKeysSeen} chiavi Installs trovate, ${results.length} giochi risolti con nome+percorso.`, 'info');
  return results;
}

/** "C:/Program Files (x86)/.../WATCH_DOGS2/" → path assoluto Linux sotto drive_c. */
function windowsPathToLinux(driveC: string, winPath: string): string {
  const rel = winPath.replace(/^[a-zA-Z]:/, '').replace(/\\/g, '/').replace(/^\/+/, '');
  return path.join(driveC, rel);
}

/**
 * A differenza di findInstalledLauncherExe (downloadManager.ts) e
 * findGameExeInSharedPrefix (sharedLauncherManager.ts), qui la cartella
 * di installazione è già NOTA per certo (InstallDir dal registro) — non
 * va cercata per nome in tutto Program Files*, solo l'.exe al suo
 * interno. Stessi identici filtri di esclusione delle due funzioni
 * sopra, per coerenza (installer/redistribuibili/updater non sono mai
 * l'eseguibile giusto).
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

export class UbisoftConnectPlugin extends StorePlugin {
  readonly id = 'Ubisoft' as const;
  readonly name = 'Ubisoft Connect';
  readonly drmFree = false;
  readonly description = 'Ubisoft Connect — launcher condiviso richiesto da alcuni giochi Ubisoft comprati su altri store.';
  // Nessun tool CLI: l'installer si scarica a mano dal sito ufficiale
  // (vedi installerUrl in thirdPartyLaunchers.ts e runUbisoftConnect in
  // downloadManager.ts).
  readonly requiredTool = '';

  /**
   * v1.5.20-dev.5 — bug reale segnalato dall'utente: la card in Manage
   * Accounts risultava SEMPRE "Disconnesso", anche senza alcun login
   * richiesto (Ubisoft è in NO_LOGIN_STORES). Causa: questo plugin non
   * sovrascriveva mai isAuthenticated(), ereditando il default della
   * classe base (`isPublic || authenticated`) — entrambi sempre false
   * qui, perché nessun flusso di login esiste per questo store.
   * Stesso principio già usato da SteamPlugin (isAuthenticated() ==
   * "Steam trovato su disco", non un vero login): qui "connesso" == il
   * launcher condiviso è stato davvero bootstrappato in shared-launchers/
   * (installer eseguito e primo lancio riuscito, non solo la cartella
   * creata — vedi isLauncherBootstrapped()/markLauncherBootstrapped() in
   * sharedLauncherManager.ts, più preciso di un controllo grezzo
   * sull'esistenza della cartella).
   */
  async isAuthenticated(): Promise<boolean> {
    return isLauncherBootstrapped('ubisoft-connect');
  }

  async getLibrary(): Promise<Game[]> {
    this.ensureSeeded();
    const launcherGame = db.getGameById(UBISOFT_CONNECT_GAME_ID);
    const games: Game[] = launcherGame ? [launcherGame] : [];

    // Niente da scansionare finché l'utente non ha mai completato il
    // bootstrap — stesso identico controllo già in uso in
    // onLauncherProcessClosed sopra.
    if (!isLauncherBootstrapped('ubisoft-connect')) return games;

    const detected = scanInstalledUbisoftGames();
    if (detected.length === 0) return games;

    const driveC = path.join(resolveSharedPrefixExecutionPath('ubisoft-connect'), 'drive_c');
    const allExisting = db.getAllGames();
    // v2.0.41-dev.4 — dedup PERSISTENTE per non riproporre la stessa
    // notifica a ogni refresh periodico (il dedup a 30s di
    // NotificationQueue serve solo per pressioni ravvicinate, non per
    // questo caso — refreshLibrary() gira ogni pochi minuti). Una volta
    // emessa per un dato gioco target, non si riemette mai più
    // (qualunque sia l'esito — confermata, ignorata, chiusa): l'utente
    // può comunque collegare a mano da Runner Bridge in qualunque
    // momento se cambia idea.
    const recentNotifications = notificationEngine.getRecent(200);

    for (const g of detected) {
      const nativeId = `ubisoft-${g.productId}`;
      const normalizedTarget = normalizeTitle(g.displayName);

      // Riga nativa già creata da noi in un refresh precedente per
      // QUESTO stesso prodotto: la ricostruiamo identica. Come Steam,
      // l'array viene ricalcolato da zero a ogni refresh — la
      // persistenza reale con "protect on conflict" (isInstalled/
      // executablePath mai sovrascritti a un valore peggiore) la fa già
      // il merge generico in gameManager.ts, non serve replicarla qui.
      const alreadyOwnRow = allExisting.some(existing => existing.id === nativeId);

      // Match in un ALTRO store per titolo normalizzato — mai contro la
      // card del launcher stesso, mai contro una riga nativa Ubisoft
      // (compresa la propria, già esclusa sopra).
      const crossStoreMatch = !alreadyOwnRow
        ? allExisting.find(existing =>
            existing.id !== UBISOFT_CONNECT_GAME_ID &&
            existing.store !== 'Ubisoft' &&
            normalizeTitle(existing.title) === normalizedTarget
          )
        : undefined;

      if (crossStoreMatch) {
        // Già collegato in un refresh precedente (l'utente ha
        // confermato, o lo aveva già impostato a mano) — nulla da fare,
        // nessuna riga nativa duplicata per questo prodotto. Loggato
        // comunque (v2.0.41-dev.5): prima questo ramo era silenzioso,
        // indistinguibile nei log da uno scan che non aveva trovato
        // nulla affatto — vedi diagnostica aggiunta in
        // scanInstalledUbisoftGames.
        if (crossStoreMatch.requiresLauncher === 'ubisoft-connect') {
          pluginLog(`[UBISOFT] "${g.displayName}" installato nativamente — già collegato a "${crossStoreMatch.title}" (${crossStoreMatch.store}), nessuna azione necessaria.`, 'info');
        } else {
          const alreadyAsked = recentNotifications.some(n =>
            n.source === 'shared-launcher-scan' && n.game_id === crossStoreMatch.id
          );
          if (!alreadyAsked) {
            notificationEngine.emit({
              type: 'shared-launcher-native-game-found',
              launcherId: 'ubisoft-connect',
              launcherName: 'Ubisoft Connect',
              nativeTitle: g.displayName,
              targetGameId: crossStoreMatch.id,
              targetGameTitle: crossStoreMatch.title,
              targetStore: crossStoreMatch.store,
            });
            pluginLog(`[UBISOFT] "${g.displayName}" installato nativamente — sembra corrispondere a "${crossStoreMatch.title}" (${crossStoreMatch.store}): notifica di collegamento inviata.`, 'info');
          } else {
            pluginLog(`[UBISOFT] "${g.displayName}" installato nativamente — match con "${crossStoreMatch.title}" (${crossStoreMatch.store}) già proposto in precedenza, non ripropongo.`, 'info');
          }
        }
        continue; // mai una riga nuova quando esiste già un match altrove
      }

      // Nessun match in nessun altro store: riga propria, comprato/
      // installato SOLO su Ubisoft Connect — stesso schema di Steam
      // (una riga per gioco installato localmente).
      const exe = findExeInKnownDir(windowsPathToLinux(driveC, g.installDirWindows));
      games.push({
        id:            nativeId,
        title:         g.displayName,
        store:         'Ubisoft',
        runner:        resolveDefaultRunner(),
        isInstalled:   true,
        playTimeHours: 0,
        coverImage:    '',
        previewImage:  '',
        description:   '',
        tags:          [],
        status:        exe ? 'Ready to Launch' : 'Not Installed',
        executablePath: exe ?? undefined,
        prefixPath:    getSharedPrefixBasePath('ubisoft-connect'),
      });
    }

    return games;
  }

  /**
   * Crea la riga "Ubisoft Connect" in games se non esiste ancora.
   * Chiamata a ogni refresh libreria (come ogni plugin), ma upsertGame
   * non sovrascrive mai isInstalled/executablePath/runner di un gioco
   * già presente (stesso principio "insert once, protect on conflict"
   * già in uso per executable_path — vedi commento in db.ts) — quindi è
   * sicuro richiamarla sempre, non serve un flag "già seedato" a parte.
   */
  private ensureSeeded(): void {
    if (db.getGameById(UBISOFT_CONNECT_GAME_ID)) return;
    const def = getThirdPartyLauncherDefinition('ubisoft-connect');
    db.upsertGame({
      id:            UBISOFT_CONNECT_GAME_ID,
      title:         def?.displayName ?? 'Ubisoft Connect',
      store:         'Ubisoft',
      // Risolto dinamicamente (vedi resolveDefaultRunner sopra) — l'utente
      // può comunque cambiarlo esplicitamente in Game Options (Runner
      // Bridge vincolato a sole build Proton per questo titolo).
      runner:        resolveDefaultRunner(),
      isInstalled:   false,
      playTimeHours: 0,
      coverImage:    '',
      previewImage:  '',
      description:   'Launcher Ubisoft Connect — richiesto da alcuni giochi Ubisoft comprati su Epic, GOG o Amazon Games. Installalo una sola volta: verrà condiviso da tutti i giochi che lo richiedono.',
      tags:          ['Launcher'],
      status:        'Not Installed',
    });
  }

  async installGame(_id: string) {
    return { success: true, message: 'Gestito da downloadManager (runUbisoftConnect).' };
  }

  async uninstallGame(_id: string) {
    return { success: true };
  }

  /**
   * v1.5.20-dev.10 — spostato qui da gameManager.ts (era un `if
   * (game.store === 'Ubisoft' && ...)` centrale hardcoded) — vedi
   * StorePlugin.onLauncherProcessClosed per il perché. Se il "gioco"
   * appena chiuso è Ubisoft Connect stesso e non è ancora bootstrappato,
   * il processo appena chiuso era l'INSTALLER (executablePath punta
   * ancora al file scaricato in Downloads, vedi
   * downloadManager.runThirdPartyLauncherInstall) — ora che l'utente lo
   * ha eseguito, cerchiamo il vero UbisoftConnect.exe dentro il prefix
   * condiviso e lo registriamo come bootstrappato.
   * BUG REALE TROVATO su hardware utente (invariato dalla versione
   * precedente): findMainExe() sull'intero drive_c prendeva un'utility
   * di sistema Wine (Explorer) invece del vero eseguibile —
   * findInstalledLauncherExe() restringe la ricerca a Program Files* e
   * prova prima l'hint dichiarato nel registro (thirdPartyLaunchers.ts).
   */
  async onLauncherProcessClosed(game: Game): Promise<void> {
    if (game.id !== UBISOFT_CONNECT_GAME_ID || isLauncherBootstrapped('ubisoft-connect')) return;
    const realPrefixRoot = resolveSharedPrefixExecutionPath('ubisoft-connect');
    const driveC = path.join(realPrefixRoot, 'drive_c');
    const def = getThirdPartyLauncherDefinition('ubisoft-connect');
    const realExe = findInstalledLauncherExe(driveC, def?.executableRelPathHint);
    if (realExe) {
      db.updateGameConfig(game.id, { executablePath: realExe });
      const relExe = path.relative(driveC, realExe);
      markLauncherBootstrapped('ubisoft-connect', game.runner ?? 'Proton 8.0-4', relExe);
      pluginLog(`[UBISOFT] Bootstrap completato — eseguibile reale: ${realExe}`, 'system');
    } else {
      pluginLog(`[UBISOFT] Eseguibile reale non trovato dopo la chiusura dell'installer — l'utente dovrà riprovare il lancio.`, 'warning');
    }
  }
}
