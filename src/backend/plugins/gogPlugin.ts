/**
 * GOGPlugin — Step 5
 *
 * Strategia definitiva (basata su test reali con lgogdownloader 3.18):
 *
 * --list details/json fa 128 chiamate API sequenziali → inutilizzabile.
 * --list (semplice) è istantaneo lato output ma impiega ~20s per le
 * chiamate di rete iniziali ("Getting product data / game names").
 *
 * FIX CRITICO: execSync blocca l'intero event loop di Node.js durante
 * l'attesa, rendendo il daemon non responsivo. Si usa spawn() con pipe
 * stdout in modo asincrono tramite Promise, così il server HTTP continua
 * a rispondere mentre lgogdownloader lavora in background.
 *
 * Flusso:
 * 1. spawn('lgogdownloader', ['--list']) → legge stdout riga per riga
 * 2. Filtra le righe di progresso ("Getting ...")
 * 3. Parsing slug → titolo leggibile, strip "[N]"
 * 4. Tutti i giochi marcati isInstalled: false (libreria cloud)
 * 5. Overlay Heroic installed.json per aggiornare isInstalled
 *
 * Timeout: 60s. Se lgogdownloader non risponde entro 60s → array vuoto.
 */

import { StorePlugin } from './base';
import { writeLog } from '../logger';
import { Game } from '../../types';
import { existsSync, readFileSync, readdirSync, renameSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { homedir } from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Percorsi Heroic (nativo e Flatpak)
// ---------------------------------------------------------------------------

const HEROIC_INSTALLED_PATHS = [
  path.join(homedir(), '.config', 'heroic', 'gog_store', 'installed.json'),
  path.join(homedir(), '.var', 'app', 'com.heroicgameslauncher.hgl',
    'config', 'heroic', 'gog_store', 'installed.json'),
];

// Cartella config di lgogdownloader: rispetta XDG_CONFIG_HOME se impostata,
// altrimenti ~/.config/lgogdownloader (default documentato dal tool).
const LGOG_CONFIG_DIR = path.join(
  process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'),
  'lgogdownloader'
);
// File che determinano lo stato di autenticazione (cookies.txt e
// galaxy_tokens.json) — lgogdownloader non espone un comando --logout, quindi
// il logout consiste nel rinominarli con suffisso .unlink: reversibile,
// l'utente può ripristinare l'accesso rinominandoli manualmente, a differenza
// di una cancellazione definitiva.
const LGOG_AUTH_FILES = ['cookies.txt', 'galaxy_tokens.json'];

const COVER_PLACEHOLDER = 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=400&h=533';
const PREVIEW_PLACEHOLDER = 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=800&h=450';

const LGOG_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function binaryExists(bin: string): boolean {
  try { execSync(`which ${bin}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function slugToTitle(slug: string): string {
  return slug
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/\s*\[\d+\]\s*$/, '')  // strip [1] [2] ecc. DOPO il join
    .trim();
}

/** Rimuove sequenze escape ANSI (es. \x1b[01;34m...\x1b[0m) dall'output colorato di lgogdownloader */
function stripAnsi(str: string): string {
  // lgogdownloader emette sequenze nel formato: ^[[01;34m  (caret + [[digits m)
  // dove ^ è il carattere caret letterale (non ESC byte)
  // eslint-disable-next-line no-control-regex
  return str
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')      // ESC[ standard
    .replace(/\^\[\[?[0-9;]*[A-Za-z]/g, '')    // ^[[ senza ESC (come da cat -v)
    .replace(/\[\[?[0-9;]+[A-Za-z]/g, '')       // [[ residui
    .replace(/\^/g, '');                          // caret residui
}

function parseSlug(line: string): string {
  return stripAnsi(line).replace(/\s*\[\d+\]\s*$/, '').trim();
}

// ---------------------------------------------------------------------------
// Sorgente 1: lgogdownloader --list (asincrono, non bloccante)
// ---------------------------------------------------------------------------

function getLibraryFromLgog(): Promise<Game[]> {
  return new Promise((resolve) => {
    // v0.99.27 — CAUSA REALE TROVATA, confermata da test diretto
    // dell'utente: `lgogdownloader --list games 2>/dev/null` non produce
    // ALCUN output (niente progresso, niente lista); `lgogdownloader
    // --list games 1>/dev/null` mostra invece le righe di progresso.
    // Conclusione: lgogdownloader scrive TUTTO il suo output — sia il
    // progresso sia, quasi certamente, l'elenco vero dei titoli — su
    // STDERR, non su stdout. Il codice precedente (v0.99.23-24, che
    // inseguiva ipotesi su cookie/sessione web e poi sulla sintassi
    // dell'argomento di --list) aveva `stdio: ['ignore', 'pipe', 'ignore']`
    // — il terzo elemento scarta esplicitamente stderr, quindi il nostro
    // codice non ha MAI potuto vedere l'output reale del programma, a
    // prescindere da quale argomento veniva passato a --list. Le ipotesi
    // precedenti erano plausibili ma sbagliate; questa è la causa
    // verificata con un test diretto e inequivocabile.
    // v0.99.31 — Trovato un workaround documentato dalla community (AUR
    // lgogdownloader-git, issue upstream #313): "se lgogdownloader
    // restituisce una lista vuota di giochi, aggiungi l'argomento
    // --no-platform-detection". Corretto in una revisione successiva
    // (3.18.r21) ma non garantito presente nella build 3.18 stabile in
    // uso — il flag resta un workaround sicuro da applicare comunque,
    // anche se la versione installata avesse già la fix (non
    // dovrebbe avere effetti collaterali in quel caso, è solo un
    // controllo di rilevamento piattaforma più lento ma più accurato).
    const proc = spawn('lgogdownloader', ['--list', 'games', '--no-color', '--no-platform-detection'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const games: Game[] = [];
    let buffer = '';

    const timer = setTimeout(() => {
      proc.kill();
      writeLog('warning', '[GOG] lgogdownloader --list timeout (60s) — returning partial list');
      resolve(games);
    }, LGOG_TIMEOUT_MS);

    // v0.99.27 — handler condiviso: lo stesso parsing va applicato a
    // entrambi i flussi, dato che non possiamo più assumere con certezza
    // se lgogdownloader scriva tutto su stderr o lo distribuisca tra i due
    // canali in modo diverso a seconda della versione/configurazione.
    // Il buffer è condiviso: righe di progresso/slug possono arrivare
    // intercalate dai due stream, ma il parsing riga per riga (split su
    // \r\n) resta corretto indipendentemente da quale stream le ha
    // prodotte.
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      // lgogdownloader usa \r per le righe di progresso e \n per gli slug
      const lines = buffer.split(/[\r\n]/);
      buffer = lines.pop() ?? ''; // l'ultima riga potrebbe essere incompleta

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Filtra righe di progresso lgogdownloader (usano \r come separatore)
        if (trimmed.startsWith('Getting ') || trimmed.startsWith('Loaded ') || trimmed.startsWith('Error')) continue;
        // Filtra righe che non sembrano slug (devono iniziare con lettera minuscola o cifra)
        if (!/^[a-z0-9]/.test(stripAnsi(trimmed))) continue;
        const slug  = parseSlug(trimmed);
        const title = slugToTitle(trimmed);
        games.push({
          id:          `gog-${slug}`,
          title,
          store:        'GOG Galaxy' as const,
          runner:       'Wine-Lutris' as const,
          isInstalled:  false,
          status:       'Not Installed' as const,
          coverImage:   COVER_PLACEHOLDER,
          previewImage: PREVIEW_PLACEHOLDER,
          rating:       0,
          playTimeHours: 0,
          tags:         [],
          genres:       [],
          description:  '',
        });
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);

    proc.on('close', () => {
      clearTimeout(timer);
      // Processa eventuale ultima riga senza newline finale
      if (buffer.trim() && !buffer.trim().startsWith('Getting ')) {
        const slug  = parseSlug(buffer.trim());
        const title = slugToTitle(buffer.trim());
        games.push({
          id:          `gog-${slug}`,
          title,
          store:        'GOG Galaxy' as const,
          runner:       'Wine-Lutris' as const,
          isInstalled:  false,
          status:       'Not Installed' as const,
          coverImage:   COVER_PLACEHOLDER,
          previewImage: PREVIEW_PLACEHOLDER,
          rating:       0,
          playTimeHours: 0,
          tags:         [],
          genres:       [],
          description:  '',
        });
      }
      resolve(games);
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve([]);
    });
  });
}

// ---------------------------------------------------------------------------
// Sorgente 2: Heroic installed.json — aggiorna isInstalled + executablePath
// ---------------------------------------------------------------------------

interface HeroicEntry {
  appName: string;
  title?: string;
  executable?: string;
}

function getInstalledFromHeroic(): Map<string, Partial<Game>> {
  const installed = new Map<string, Partial<Game>>();
  for (const filePath of HEROIC_INSTALLED_PATHS) {
    if (!existsSync(filePath)) continue;
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      const entries: HeroicEntry[] = Array.isArray(data) ? data : (data.installed ?? []);
      for (const e of entries) {
        installed.set(`gog-${e.appName}`, {
          isInstalled:    true,
          executablePath: e.executable ?? undefined,
          title:          e.title ?? undefined,
        });
      }
      break;
    } catch { continue; }
  }
  return installed;
}

// ---------------------------------------------------------------------------
// Plugin principale
// ---------------------------------------------------------------------------

export class GOGPlugin extends StorePlugin {
  readonly id          = 'GOG Galaxy' as const;
  readonly name        = 'GOG Galaxy';
  readonly drmFree     = true;   // GOG è DRM-free by design
  readonly description = 'Libreria GOG Galaxy — DRM-free, richiede lgogdownloader';
  readonly requiredTool = 'lgogdownloader';

  async getLibrary(): Promise<Game[]> {
    if (!binaryExists('lgogdownloader')) {
      writeLog('warning', '[GOG] lgogdownloader not found. Install with: yay -S lgogdownloader');
      return [];
    }

    // spawn asincrono — non blocca l'event loop
    const games = await getLibraryFromLgog();

    if (games.length === 0) {
      // v0.99.23 — distingue due cause radicalmente diverse per lo stesso
      // sintomo (0 titoli), invece di un unico messaggio generico che
      // suggerisce sempre "fai il login" anche quando l'utente è già
      // autenticato. `--check-login-status` e `--list` usano meccanismi di
      // autenticazione SEPARATI all'interno di lgogdownloader (token OAuth
      // dell'API vs cookie di sessione del sito web) — possono
      // desincronizzarsi: il login API resta valido (la card Manage
      // Account legge correttamente "connesso") mentre i cookie del sito,
      // necessari specificamente per --list, sono scaduti o invalidati
      // indipendentemente. Comportamento noto e documentato di
      // lgogdownloader stesso, non una regressione di questo plugin.
      const stillAuthenticated = await this.isAuthenticated();
      if (stillAuthenticated) {
        writeLog('warning', '[GOG] Valid API login but --list returns no titles: likely a session/cookie issue on the website (not the API token) — a known lgogdownloader behavior. Try: lgogdownloader --login from a terminal, making sure to complete the login fully with no other GOG sessions active in the browser at the same time; if it persists, consider clearing the lgogdownloader cache (~/.cache/lgogdownloader, ~/.config/lgogdownloader) before logging in again.');
      } else {
        writeLog('warning', '[GOG] No titles found and API login invalid. Run: lgogdownloader --login');
      }
      return [];
    }

    // Sovrapponi i dati di installazione da Heroic (se presente)
    const heroicInstalled = getInstalledFromHeroic();
    for (const game of games) {
      const heroic = heroicInstalled.get(game.id);
      if (heroic) {
        if (heroic.isInstalled)    game.isInstalled    = true;
        if (heroic.executablePath) game.executablePath = heroic.executablePath;
        if (heroic.title)          game.title          = heroic.title;
      }

      // Controlla anche la cartella files/ di X-Launcher
      const slug     = game.id.replace(/^gog-/, '');
      const filesDir = path.join(homedir(), 'Games', 'GOG', slug, 'files');
      if (!game.isInstalled && existsSync(filesDir)) {
        const contents = readdirSync(filesDir).filter((f: string) => !f.startsWith('.'));
        if (contents.length > 0) game.isInstalled = true;
      }
    }

    const installedCount = games.filter(g => g.isInstalled).length;
    writeLog('info', `[GOG] ${games.length} titles (${installedCount} installed)`);
    return games;
  }

  async installGame(id: string) {
    const slug = id.replace(/^gog-/, '');
    if (binaryExists('lgogdownloader')) {
      return { success: true, message: `Avvia: lgogdownloader --download --game ${slug}` };
    }
    return { success: false, message: 'lgogdownloader non trovato.' };
  }

  async uninstallGame(_id: string) {
    return { success: true };
  }

  /**
   * Verifica autenticazione GOG: usa `--check-login-status`, il comando
   * dedicato a questo scopo (non `--list`). Riporta un exit code binario
   * affidabile — 0 = loggato, 1 = non loggato — invece di dover indovinare
   * lo stato dal contenuto testuale di un comando pensato per altro.
   * `--list` può fallire ("No games were found on your account") anche con
   * un login API perfettamente valido, per problemi separati legati ai
   * cookie del sito (comportamento noto e documentato di lgogdownloader) —
   * interrogarlo per "sono autenticato?" era quindi il comando sbagliato,
   * non solo un parsing fragile.
   */
  async isAuthenticated(): Promise<boolean> {
    if (!binaryExists('lgogdownloader')) return false;
    return new Promise(resolve => {
      const { spawn } = require('child_process') as typeof import('child_process');
      const proc = spawn('lgogdownloader', ['--check-login-status'], { timeout: 10000 });
      proc.on('close', (code: number) => { resolve(code === 0); });
      proc.on('error', () => resolve(false));
    });
  }

  /**
   * Disconnette l'account GOG senza cancellare nulla: rinomina i file di
   * autenticazione (cookies.txt, galaxy_tokens.json) con suffisso .unlink.
   * lgogdownloader non espone un comando --logout — questa è l'unica via
   * praticabile, e la rinomina invece della cancellazione la rende
   * reversibile: l'utente può ripristinare l'accesso rinominando i file
   * manualmente da terminale, senza aver perso le credenziali salvate.
   */
  async logout(): Promise<{ success: boolean; message: string }> {
    try {
      let renamed = 0;
      for (const filename of LGOG_AUTH_FILES) {
        const filePath = path.join(LGOG_CONFIG_DIR, filename);
        if (existsSync(filePath)) {
          const targetPath = `${filePath}.unlink`;
          // Non sovrascrivere un .unlink già esistente da un logout precedente:
          // aggiunge un timestamp per evitare di perdere quel backup.
          const finalTarget = existsSync(targetPath)
            ? `${filePath}.unlink.${Date.now()}`
            : targetPath;
          renameSync(filePath, finalTarget);
          renamed++;
        }
      }
      if (renamed === 0) {
        return { success: true, message: 'Nessuna credenziale GOG trovata da disconnettere.' };
      }
      writeLog('auth', `[GOG] logout: ${renamed} credential files renamed with .unlink suffix`);
      return { success: true, message: 'Account GOG disconnesso. I file di credenziali sono stati rinominati, non cancellati.' };
    } catch (e: any) {
      writeLog('error', `[GOG] logout error: ${e.message}`);
      return { success: false, message: `Errore durante la disconnessione: ${e.message}` };
    }
  }

  /**
   * Non tenta più di lanciare `lgogdownloader --login` dal processo backend
   * e intercettarne l'output per estrarre l'URL OAuth. Stesso motivo già
   * diagnosticato per Epic/legendary: il processo figlio del backend non ha
   * un terminale interattivo reale a cui collegarsi, e questo tipo di
   * comando si aspetta una sessione interattiva per l'intero handshake
   * OAuth (apertura browser, eventuale 2FA, redirect).
   *
   * Il login GOG richiede comunque un passaggio interattivo che solo un
   * terminale reale può gestire bene. Questo metodo si limita quindi a
   * istruire l'utente sul comando esatto da eseguire nel SUO terminale; il
   * frontend fa polling su isAuthenticated() e aggiorna la card
   * automaticamente non appena l'utente completa il login da solo.
   */
  async login(): Promise<{ success: boolean; message: string; authUrl?: string; waitForBrowser?: boolean }> {
    if (!binaryExists('lgogdownloader')) {
      return {
        success: false,
        message: 'lgogdownloader non trovato. Installa con: yay -S lgogdownloader'
      };
    }
    return {
      success: true,
      waitForBrowser: true,
      message: 'Apri un terminale ed esegui: lgogdownloader --login — segui le istruzioni a schermo. Questa card si aggiornerà automaticamente al termine.',
    };
  }
}