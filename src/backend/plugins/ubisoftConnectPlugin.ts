/**
 * ubisoftConnectPlugin.ts — Step 19d
 *
 * Ubisoft Connect trattato come un gioco vero (vedi correzione
 * architetturale discussa con l'utente — la card virtuale iniziale,
 * mirror di Steam Big Picture, era sbagliata): una vera riga in `games`
 * che rappresenta il launcher stesso, non solo un placeholder come
 * BattlenetPlugin (che infatti resta un semplice stub in attesa del suo
 * turno — un launcher alla volta, stesso principio già seguito per
 * Amazon/nile).
 *
 * Stub sottile coerente con GOG/Epic/Amazon: la vera pipeline di
 * installazione vive in downloadManager.ts (runUbisoftConnect), non qui
 * — installGame()/uninstallGame() non fanno nulla di reale, esattamente
 * come negli altri tre plugin (vedi verifica fatta leggendo il codice
 * reale prima di scrivere questo file).
 */
import { StorePlugin } from './base';
import { Game, LogEntry } from '../../types';
import path from 'path';
import * as db from '../db';
import { getThirdPartyLauncherDefinition } from './thirdPartyLaunchers';
import { compatibilityManager } from '../compatibilityManager';
import { isLauncherBootstrapped, markLauncherBootstrapped, resolveSharedPrefixExecutionPath } from '../sharedLauncherManager';
import { findInstalledLauncherExe } from '../downloadManager';
import { writeLog } from '../logger';

/**
 * v1.5.20-dev.10 — replica minima di GameManager.addLog(): i plugin non
 * hanno un riferimento a GameManager, ma onLauncherProcessClosed
 * (sotto) deve restare visibile nel Debug Console UI esattamente come
 * prima (era `this.addLog(...)` in gameManager.ts, non solo un log su
 * file) — stessa formattazione timestamp, stesso doppio scritto
 * (file + DB persistito).
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
    const game = db.getGameById(UBISOFT_CONNECT_GAME_ID);
    return game ? [game] : [];
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
