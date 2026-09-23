/**
 * AmazonPlugin — libreria via nile CLI (github.com/imLinguin/nile),
 * stesso backend usato da Heroic/Lutris. Tool Python — dipendenze:
 * python-pycryptodome python-zstandard python-requests python-protobuf
 * python-json5, pacchetto AUR nile-git.
 *
 * Comando: `nile library list --json`. Campi usati: product.id
 * (amzn1.adg.product.<uuid>, ID reale per install/launch/uninstall —
 * product.sku NON va usato, verificato per esclusione), product.title,
 * product.productDetail.iconUrl, .details.backgroundUrl1 (unica immagine
 * disponibile, usata come previewImage — nessun boxart verticale come in
 * GOG/Epic), .details.{developer,genres,releaseDate,...}. state: solo
 * "LIVE" osservato finora per entitlement validi — da riverificare se
 * emergono altri stati.
 *
 * Lancio: NON tramite `nile launch` — il runner Wine/Proton dell'utente
 * lancia direttamente l'eseguibile (runner: 'Wine-Lutris'). `nile
 * install`/`uninstall` restano stub: l'orchestrazione reale vive in
 * downloadManager.ts (runAmazon) — non ancora scritta.
 *
 * isInstalled: SEMPRE false qui. Il flag --installed di nile non filtra
 * nulla (verificato: con/senza flag, stesso numero di voci) — nile non
 * offre modo affidabile di saperlo via CLI. Stato reale preservato da
 * gameManager.protectInstalledState() a ogni refreshLibrary, basato su
 * ciò che X-Launcher stesso ha installato (db.updateGameStatus).
 *
 * Autenticazione: `nile auth --login/--status/--logout`.
 * Timeout: 60s lista, 20s installed (NILE_INFO_TIMEOUT_MS sotto).
 */

import { StorePlugin } from './base';
import { writeLog } from '../logger';
import { Game } from '../../types';
import { spawn } from 'child_process';
import { execSync } from 'child_process';

const NILE_TIMEOUT_MS = 60_000;
const NILE_INFO_TIMEOUT_MS = 20_000;

function binaryExists(bin: string): boolean {
  try { execSync(`which ${bin}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

interface NileProductDetail {
  developer?: string;
  genres?: string[];
  releaseDate?: string;
  shortDescription?: string;
  backgroundUrl1?: string;
}

interface NileEntitlement {
  id: string;
  state?: string;
  product: {
    id: string;
    title: string;
    description?: string;
    sku?: string;
    productDetail?: {
      iconUrl?: string;
      details?: NileProductDetail;
    };
  };
}

// ---------------------------------------------------------------------------
// Sorgente 1: nile library list --json (libreria completa)
// ---------------------------------------------------------------------------

function getLibraryFromNile(): Promise<NileEntitlement[]> {
  return new Promise((resolve) => {
    const proc = spawn('nile', ['library', 'list', '--json'], {
      stdio: ['ignore', 'pipe', 'pipe'], // stderr separato — nile logga INFO/WARNING lì
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      writeLog('warning', '[Amazon] nile library list timeout (60s)');
      resolve([]);
    }, NILE_TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        writeLog('warning', `[Amazon] nile library list exit ${code}: ${stderr.slice(0, 200)}`);
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? parsed : []);
      } catch (err) {
        writeLog('warning', `[Amazon] nile library list JSON parse error: ${err}`);
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
// v1.1.113-dev.1 — RIMOSSA una precedente getInstalledFromNile() basata su
// `nile library list --json --installed`. Verificato empiricamente
// dall'utente: il flag --installed non filtra NULLA in questa versione di
// nile, in nessuna posizione (`nile library list --json --installed`,
// `nile library --installed list --json`, e la lista senza filtro
// restituiscono tutti e tre lo stesso numero di voci — 55, l'intera
// libreria). Risultato del bug: ogni gioco Amazon risultava sempre
// "installato". Nile non offre quindi un modo affidabile per sapere quali
// giochi sono installati — isInstalled qui sotto è sempre false, e ci si
// affida interamente a gameManager.ts (protectInstalledState) per
// preservare lo stato reale una volta che X-Launcher installa davvero un
// gioco (db.updateGameStatus scritto direttamente al completamento del
// download, indipendente da qualunque scansione successiva).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Plugin principale
// ---------------------------------------------------------------------------

export class AmazonPlugin extends StorePlugin {
  readonly id = 'Amazon Games' as const;
  readonly name = 'Amazon Games';
  readonly drmFree = false;
  readonly description = 'Libreria Amazon Games (Prime Gaming) — richiede nile';
  readonly requiredTool = 'nile';

  async getLibrary(): Promise<Game[]> {
    if (!binaryExists('nile')) {
      writeLog('warning', '[Amazon] nile not found. Install with: yay -S nile-git');
      return [];
    }

    const rawEntries = await getLibraryFromNile();

    if (rawEntries.length === 0) {
      writeLog('warning', '[Amazon] No titles found. Have you run nile auth --login?');
      return [];
    }

    const games: Game[] = [];
    const seenProductIds = new Set<string>();

    for (const entry of rawEntries) {
      // v1.1.110-dev.1 — filtra entitlement non "LIVE" (revocati/scaduti).
      // Un solo stato osservato finora in un test reale con un titolo
      // valido — se emergono altri stati validi con più account/titoli,
      // va ampliato qui.
      if (entry.state && entry.state !== 'LIVE') continue;
      const productId = entry.product?.id;
      if (!productId) continue;
      if (seenProductIds.has(productId)) continue;
      seenProductIds.add(productId);

      const details = entry.product.productDetail?.details;
      // v1.1.113-dev.1 — sempre false: nile non offre un modo affidabile
      // per saperlo (vedi commento esteso sopra), lo stato reale per i
      // giochi già installati viene preservato da
      // gameManager.protectInstalledState() a ogni refreshLibrary.
      const isInstalled = false;

      games.push({
        id:            `amazon-${productId}`,
        title:         entry.product.title,
        store:         'Amazon Games' as const,
        runner:        'Wine-Lutris' as const,
        isInstalled,
        status:        'Not Installed',
        // v1.1.110-dev.1 — nessun campo "boxart" verticale dedicato come
        // GOG/Epic in quanto emerso dal test reale: iconUrl (quadrata) è
        // il miglior candidato per coverImage, backgroundUrl1 (landscape)
        // per previewImage. Da rivedere se un titolo con struttura
        // diversa mostra qualcosa di più adatto.
        coverImage:    entry.product.productDetail?.iconUrl ?? '',
        previewImage:  details?.backgroundUrl1 ?? entry.product.productDetail?.iconUrl ?? '',
        rating:        0,
        playTimeHours: 0,
        tags:          [],
        genres:        details?.genres ?? [],
        description:   details?.shortDescription ?? entry.product.description ?? '',
      });
    }

    const installedCount = games.filter(g => g.isInstalled).length;
    writeLog('info', `[Amazon] ${games.length} titles (${installedCount} installed)`);
    return games;
  }

  async installGame(id: string) {
    const productId = id.replace(/^amazon-/, '');
    if (binaryExists('nile')) {
      return { success: true, message: `Avvia: nile install ${productId}` };
    }
    return { success: false, message: 'nile non trovato.' };
  }

  async uninstallGame(id: string) {
    const productId = id.replace(/^amazon-/, '');
    if (binaryExists('nile')) {
      return { success: true, message: `Avvia: nile uninstall ${productId}` };
    }
    return { success: true };
  }

  /**
   * Dimensione PREVISTA dell'installazione (prima di scaricare) — stessa
   * funzione già usata da GOG/Epic per "Dimensione Prevista" in sidebar.
   * `nile install <id> --info --json` — VERIFICATO con test reale
   * dall'utente (non un'ipotesi come per Epic): risposta esatta
   * `{"download_size": 3371488219}` per un titolo non installato.
   */
  async getPredictedInstallSizeBytes(gameId: string): Promise<number | null> {
    const productId = gameId.replace(/^amazon-/, '');
    if (!binaryExists('nile')) return null;

    return new Promise((resolve) => {
      const proc = spawn('nile', ['install', productId, '--info', '--json'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => { proc.kill(); resolve(null); }, NILE_INFO_TIMEOUT_MS);

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', () => {
        clearTimeout(timer);
        writeLog('info', `[Amazon] nile install ${productId} --info --json — output grezzo: ${stdout.slice(0, 2000)}`);
        if (stderr.trim()) writeLog('info', `[Amazon] nile install ${productId} --info --json — stderr: ${stderr.slice(0, 500)}`);
        try {
          const parsed = JSON.parse(stdout);
          if (typeof parsed?.download_size === 'number' && parsed.download_size > 0) {
            resolve(parsed.download_size);
          } else {
            writeLog('info', `[Amazon] Campo download_size non trovato per ${productId} — vedi output grezzo sopra.`);
            resolve(null);
          }
        } catch {
          writeLog('info', `[Amazon] Output di nile install ${productId} --info --json non è JSON valido — vedi output grezzo sopra.`);
          resolve(null);
        }
      });
      proc.on('error', () => { clearTimeout(timer); resolve(null); });
    });
  }

  /**
   * Verifica autenticazione Amazon: `nile auth --status`. VERIFICATO con
   * output reale dall'utente: `{"Username": "Daniele", "LoggedIn": true}`
   * — JSON pulito, campo booleano `LoggedIn` senza ambiguità (a differenza
   * del caso Epic, dove `legendary status --json` usava una stringa
   * placeholder con un dettaglio facile da sbagliare — qui non c'è
   * bisogno di indovinare né di gestire quel tipo di caso).
   */
  async isAuthenticated(): Promise<boolean> {
    if (!binaryExists('nile')) return false;
    return new Promise(resolve => {
      let stdout = '';
      const proc = spawn('nile', ['auth', '--status'], {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 8000,
      });
      proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.on('close', () => {
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed?.LoggedIn === true);
        } catch {
          resolve(false);
        }
      });
      proc.on('error', () => resolve(false));
    });
  }

  /**
   * Login Amazon via `nile auth --login`: flusso interattivo verificato
   * dal vivo dall'utente (stampa un URL, l'utente lo apre nel browser,
   * fa login, incolla l'URL di redirect nel terminale). Stesso principio
   * già adottato per Epic in questo progetto: il processo backend non ha
   * un terminale interattivo reale a cui collegarsi, quindi non si tenta
   * di automatizzare il passaggio — si istruisce l'utente sul comando
   * esatto, il frontend fa polling su isAuthenticated() (quando pronta)
   * e aggiorna la card da sola al termine.
   */
  async login(): Promise<{ success: boolean; message: string; authUrl?: string; waitForBrowser?: boolean }> {
    if (!binaryExists('nile')) {
      return { success: false, message: 'nile non trovato. Installa con: yay -S nile-git' };
    }
    return {
      success: true,
      waitForBrowser: true,
      message: 'Apri un terminale ed esegui: nile auth --login — segui le istruzioni a schermo (apri l\'URL nel browser, poi incolla qui l\'URL di redirect). Questa card si aggiornerà automaticamente al termine.',
    };
  }

  /**
   * Logout via `nile auth --logout` — confermato da `nile auth --help`
   * reale ("Logout from the accout and deregister"), nessuna ambiguità
   * di formato da verificare (a differenza di --status): il comando o
   * riesce o fallisce, nessun JSON da interpretare.
   */
  async logout(): Promise<{ success: boolean; message: string }> {
    if (!binaryExists('nile')) {
      return { success: false, message: 'nile non trovato.' };
    }
    try {
      const output = execSync('nile auth --logout', { encoding: 'utf-8', timeout: 15000 });
      writeLog('auth', `[Amazon] logout: command executed, output: ${JSON.stringify(output)}`);
      return { success: true, message: 'Account Amazon disconnesso.' };
    } catch (e: any) {
      writeLog('error', `[Amazon] logout error: ${e.message} | stdout: ${e.stdout ?? 'n/a'} | stderr: ${e.stderr ?? 'n/a'}`);
      return { success: false, message: `Errore durante la disconnessione: ${e.message}` };
    }
  }
}
