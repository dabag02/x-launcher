/**
 * EpicPlugin — Step 6
 *
 * Fonte: legendary CLI (open source Epic Games client)
 * Comando: legendary list --json
 *
 * Struttura JSON (da test reale su legendary 0.20.34):
 *   Array di oggetti con:
 *   - app_name: string           → ID per legendary launch
 *   - app_title: string          → titolo leggibile
 *   - metadata.keyImages: array  → cover art dalla CDN Epic
 *     tipo "DieselGameBoxTall" = portrait 1200x1600 (coverImage)
 *     tipo "DieselGameBox"     = landscape 2560x1440 (previewImage)
 *   - metadata.categories: array → filtrare DLC/addons
 *   - asset_infos.Windows: obj   → conferma disponibilità Windows
 *
 * Filtri applicati:
 *   - Solo voci con asset_infos.Windows presente
 *   - Escludi entrate che hanno SOLO categorie addons/digitalextras/audience
 *     (DLC, contenuti digitali, soundtrack, artbook ecc.)
 *   - Escludi duplicati per app_name
 *
 * Lancio: legendary launch <app_name>
 * isInstalled: rilevato da legendary list-installed --json
 *   (spawn separato, non bloccante)
 *
 * Timeout: 60s per legendary list, 15s per legendary list-installed
 */

import { StorePlugin } from './base';
import { writeLog } from '../logger';
import { Game } from '../../types';
import { execSync, spawn } from 'child_process';
import path from 'path';

const COVER_PLACEHOLDER = 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&q=80&w=400&h=533';
const PREVIEW_PLACEHOLDER = 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&q=80&w=800&h=450';

const LEGENDARY_TIMEOUT_MS = 60_000;
const LEGENDARY_INSTALLED_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function binaryExists(bin: string): boolean {
  try { execSync(`which ${bin}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

interface LegendaryKeyImage {
  type: string;
  url: string;
  width: number;
  height: number;
}

interface LegendaryCategory {
  path: string;
}

interface LegendaryGame {
  app_name: string;
  app_title: string;
  metadata: {
    keyImages?: LegendaryKeyImage[];
    categories?: LegendaryCategory[];
    description?: string;
    developer?: string;
  };
  asset_infos?: {
    Windows?: {
      app_name: string;
      build_version?: string;
    };
  };
  dlcs?: unknown[];
}

/**
 * Restituisce true se la voce è un gioco principale (non un DLC/addon/extra).
 * Legendary include DLC, artbook, soundtrack, extra digitali nella lista.
 * Un "gioco" ha almeno la categoria "games" e NON ha solo "addons"/"digitalextras".
 */
function isMainGame(entry: LegendaryGame): boolean {
  const cats = entry.metadata.categories?.map(c => c.path) ?? [];
  if (cats.length === 0) return true; // se non ha categorie, includiamo
  const hasGames = cats.some(c => c === 'games' || c === 'applications');
  const isAddonOnly = cats.every(c =>
    ['addons', 'digitalextras', 'audience', 'developer'].includes(c)
  );
  return hasGames && !isAddonOnly;
}

/**
 * Estrae la cover art dalla lista keyImages di legendary.
 * Preferisce DieselGameBoxTall (portrait) per coverImage.
 * Preferisce DieselGameBox (landscape) per previewImage.
 */
function extractImages(keyImages: LegendaryKeyImage[] = []): { coverImage: string; previewImage: string } {
  const tall = keyImages.find(i => i.type === 'DieselGameBoxTall');
  const wide = keyImages.find(i => i.type === 'DieselGameBox');
  return {
    coverImage:   tall?.url ?? wide?.url ?? COVER_PLACEHOLDER,
    previewImage: wide?.url ?? tall?.url ?? PREVIEW_PLACEHOLDER,
  };
}

// ---------------------------------------------------------------------------
// Sorgente 1: legendary list --json (libreria completa)
// ---------------------------------------------------------------------------

function getLibraryFromLegendary(): Promise<LegendaryGame[]> {
  return new Promise((resolve) => {
    const proc = spawn('legendary', ['list', '--json'], {
      stdio: ['ignore', 'pipe', 'pipe'], // stderr separato per filtrare i log di legendary
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      writeLog('warning', '[Epic] legendary list timeout (60s)');
      resolve([]);
    }, LEGENDARY_TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        writeLog('warning', `[Epic] legendary list exit ${code}: ${stderr.slice(0, 200)}`);
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? parsed : []);
      } catch (e) {
        writeLog('warning', '[Epic] legendary list JSON parse error:', e);
        resolve([]);
      }
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve([]);
    });
  });
}

// ---------------------------------------------------------------------------
// Sorgente 2: legendary list-installed --json (giochi installati)
// ---------------------------------------------------------------------------

interface LegendaryInstalled {
  app_name: string;
  install_path?: string;
  executable?: string;
}

function getInstalledFromLegendary(): Promise<Set<string>> {
  return new Promise((resolve) => {
    const proc = spawn('legendary', ['list-installed', '--json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    const timer = setTimeout(() => {
      proc.kill();
      resolve(new Set());
    }, LEGENDARY_INSTALLED_TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });

    proc.on('close', () => {
      clearTimeout(timer);
      try {
        const parsed: LegendaryInstalled[] = JSON.parse(stdout);
        const installed = new Set(
          Array.isArray(parsed) ? parsed.map(g => g.app_name) : []
        );
        resolve(installed);
      } catch {
        resolve(new Set());
      }
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve(new Set());
    });
  });
}

// ---------------------------------------------------------------------------
// Plugin principale
// ---------------------------------------------------------------------------

export class EpicPlugin extends StorePlugin {
  readonly id          = 'Epic Games' as const;
  readonly name        = 'Epic Games';
  readonly drmFree     = false;  // Epic richiede EOS per la maggior parte dei titoli
  readonly description = 'Libreria Epic Games — richiede legendary';
  readonly requiredTool = 'legendary';

  async getLibrary(): Promise<Game[]> {
    if (!binaryExists('legendary')) {
      writeLog('warning', '[Epic] legendary not found. Install with: yay -S legendary-gl');
      return [];
    }

    // Lancia entrambe le chiamate in parallelo per ridurre il tempo di attesa
    const [rawGames, installedSet] = await Promise.all([
      getLibraryFromLegendary(),
      getInstalledFromLegendary(),
    ]);

    if (rawGames.length === 0) {
      writeLog('warning', '[Epic] No titles found. Have you run legendary auth?');
      return [];
    }

    const games: Game[] = [];
    const seenAppNames = new Set<string>();

    for (const entry of rawGames) {
      // Salta voci senza Windows support
      if (!entry.asset_infos?.Windows) continue;
      // Salta DLC e contenuti extra
      if (!isMainGame(entry)) continue;
      // Salta duplicati
      if (seenAppNames.has(entry.app_name)) continue;
      seenAppNames.add(entry.app_name);

      const { coverImage, previewImage } = extractImages(entry.metadata.keyImages);
      const isInstalled = installedSet.has(entry.app_name);

      games.push({
        id:           `epic-${entry.app_name}`,
        title:        entry.app_title,
        store:        'Epic Games' as const,
        runner:       'Wine-Lutris' as const,
        isInstalled,
        status:       isInstalled ? 'Ready to Launch' : 'Not Installed',
        coverImage,
        previewImage,
        rating:       0,
        playTimeHours: 0,
        tags:         [],
        genres:       [],
        description:  entry.metadata.description ?? '',
      });
    }

    const installedCount = games.filter(g => g.isInstalled).length;
    writeLog('info', `[Epic] ${games.length} titles (${installedCount} installed)`);
    return games;
  }

  async installGame(id: string) {
    const appName = id.replace(/^epic-/, '');
    if (binaryExists('legendary')) {
      return { success: true, message: `Avvia: legendary install ${appName}` };
    }
    return { success: false, message: 'legendary non trovato.' };
  }

  async uninstallGame(id: string) {
    const appName = id.replace(/^epic-/, '');
    if (binaryExists('legendary')) {
      return { success: true, message: `Avvia: legendary uninstall ${appName}` };
    }
    return { success: true };
  }

  /**
   * Verifica autenticazione Epic: `legendary status --json`
   * Restituisce autenticato se il campo `account` è presente e non vuoto.
   */
  async isAuthenticated(): Promise<boolean> {
    if (!binaryExists('legendary')) return false;
    return new Promise(resolve => {
      const { spawn } = require('child_process') as typeof import('child_process');
      let stdout = '';
      const proc = spawn('legendary', ['status', '--json'], {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 8000,
      });
      proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.on('close', () => {
        try {
          const parsed = JSON.parse(stdout.trim());
          // legendary status --json: il valore placeholder reale per "non
          // autenticato" è la stringa letterale '<not logged in>' (con le
          // parentesi angolari), verificato eseguendo il comando a mano da
          // terminale. Il controllo precedente confrontava contro
          // 'not logged in' (senza parentesi) — una stringa diversa che non
          // corrispondeva mai, quindi qualunque account NON autenticato
          // veniva interpretato come autenticato (la stringa non vuota
          // superava il check `!!parsed?.account`, e il confronto di
          // disuguaglianza era sempre vero perché le due stringhe non
          // coincidevano mai). Bug puramente di stringa, non di timing né
          // di cache di legendary — entrambe ipotesi già escluse con test
          // diretti da terminale prima di arrivare qui.
          resolve(!!(parsed?.account && parsed.account !== '<not logged in>'));
        } catch {
          resolve(false);
        }
      });
      proc.on('error', () => resolve(false));
    });
  }

  /**
   * Disconnette l'account Epic eseguendo `legendary auth --delete`, il
   * comando reale supportato dal tool (verificato contro il sorgente
   * ufficiale e contro Heroic Games Launcher, che usa esattamente questo
   * comando in produzione per il logout, e confermato empiricamente da test
   * diretti da terminale: il comando cancella davvero le credenziali e
   * `legendary status --json` lo riflette immediatamente e correttamente).
   *
   * `--logout` non esiste nella CLI di legendary: una versione precedente
   * di questo metodo usava quel flag, che non lanciava errore (quindi
   * appariva un falso successo) ma non invalidava nulla.
   */
  async logout(): Promise<{ success: boolean; message: string }> {
    if (!binaryExists('legendary')) {
      return { success: false, message: 'legendary non trovato.' };
    }
    try {
      const { execSync } = require('child_process') as typeof import('child_process');
      const output = execSync('legendary auth --delete', { encoding: 'utf-8', timeout: 15000 });
      writeLog('auth', `[Epic] logout: command executed, output: ${JSON.stringify(output)}`);
      return { success: true, message: 'Account Epic disconnesso.' };
    } catch (e: any) {
      writeLog('error', `[Epic] logout error: ${e.message} | stdout: ${e.stdout ?? 'n/a'} | stderr: ${e.stderr ?? 'n/a'}`);
      return { success: false, message: `Errore durante la disconnessione: ${e.message}` };
    }
  }

  /**
   * Non tenta più di lanciare `legendary auth --disable-webview` dal
   * processo backend e intercettarne l'output per estrarre l'URL OAuth.
   * Quel flusso si è dimostrato fragile: il processo figlio del backend
   * non ha un terminale interattivo reale a cui collegarsi, e su questa
   * versione di legendary il comando esce subito con un errore (Python
   * traceback, exit 1) invece di restare in attesa come un terminale
   * interattivo farebbe.
   *
   * Il login Epic richiede comunque un passaggio interattivo (username,
   * password, eventuale 2FA, e poi il codice di autorizzazione copiato
   * dal browser) che solo un terminale reale può gestire bene. Questo
   * metodo si limita quindi a istruire l'utente sul comando esatto da
   * eseguire nel SUO terminale; il frontend fa polling su isAuthenticated()
   * e aggiorna la card automaticamente non appena l'utente completa il
   * login da solo, senza bisogno di nessuna conferma manuale aggiuntiva.
   */
  async login(): Promise<{ success: boolean; message: string; authUrl?: string; waitForBrowser?: boolean }> {
    if (!binaryExists('legendary')) {
      return { success: false, message: 'legendary non trovato. Installa con: yay -S legendary-gl' };
    }
    return {
      success: true,
      waitForBrowser: true,
      message: 'Apri un terminale ed esegui: legendary auth — segui le istruzioni a schermo (login + codice di autorizzazione dal browser). Questa card si aggiornerà automaticamente al termine.',
    };
  }

  /**
   * Richiesta utente — dimensione PREVISTA dell'installazione (prima di
   * scaricare), non quella reale su disco a installazione avvenuta.
   * `legendary info <app_name> --json` esiste apposta per questo scopo
   * (documentato: "Prints info about specified app name or manifest").
   *
   * NOTA ONESTA: non testato dal vivo in questo ambiente (nessun account
   * Epic/legendary disponibile qui) — a differenza di `legendary list
   * --json` (la cui struttura, vedi commento in cima al file, è stata
   * verificata con un test reale in una sessione precedente), la
   * struttura di `info --json` specificamente non lo è. Il JSON grezzo
   * viene sempre loggato per intero al primo utilizzo: se il parsing
   * sotto non trova il campo giusto, il log mostra comunque la
   * struttura reale invece di fallire in silenzio.
   */
  async getPredictedInstallSizeBytes(gameId: string): Promise<number | null> {
    const appName = gameId.replace(/^epic-/, '');
    if (!binaryExists('legendary')) return null;

    return new Promise((resolve) => {
      const proc = spawn('legendary', ['info', appName, '--json'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => { proc.kill(); resolve(null); }, 20_000);

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', () => {
        clearTimeout(timer);
        writeLog('info', `[Epic] legendary info ${appName} --json — output grezzo: ${stdout.slice(0, 2000)}`);
        if (stderr.trim()) writeLog('info', `[Epic] legendary info ${appName} --json — stderr: ${stderr.slice(0, 500)}`);
        try {
          const parsed = JSON.parse(stdout);
          // Più nomi di campo plausibili, in punti plausibili della
          // struttura — non verificato dal vivo quale sia quello reale,
          // vedi nota sopra.
          const candidates = [
            parsed?.manifest?.disk_size, parsed?.manifest?.install_size,
            parsed?.manifest?.download_size,
            parsed?.disk_size, parsed?.install_size, parsed?.download_size,
            parsed?.game?.disk_size, parsed?.game?.install_size,
          ].filter((v) => typeof v === 'number' && v > 0);
          if (candidates.length > 0) return resolve(candidates[0]);
          writeLog('info', `[Epic] Dimensione prevista non trovata nella struttura JSON per ${appName} — vedi output grezzo sopra per adattare il parsing.`);
          resolve(null);
        } catch (e) {
          writeLog('info', `[Epic] Output di legendary info ${appName} --json non è JSON valido — vedi output grezzo sopra.`);
          resolve(null);
        }
      });
      proc.on('error', () => { clearTimeout(timer); resolve(null); });
    });
  }
}
