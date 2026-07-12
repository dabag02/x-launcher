/**
 * appConfig.ts — Preferenze utente persistite, semplici e leggibili anche
 * da bash (formato chiave=valore, non JSON: kiosk-launch.sh deve poterlo
 * leggere senza dipendenze aggiuntive).
 *
 * File: ~/.local/share/x-launcher/app.conf
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

const DATA_DIR    = path.join(homedir(), '.local', 'share', 'x-launcher');
const CONFIG_PATH = path.join(DATA_DIR, 'app.conf');

mkdirSync(DATA_DIR, { recursive: true });

// v0.99.9 — displayMode sostituisce concettualmente fullscreen con una
// terza opzione: 'borderless' (finestra massimizzata, senza bordi, stessa
// finestra browser — niente vero cambio di modalità X11/compositor come fa
// --kiosk). Introdotta per valutare un sospetto di input lag più alto in
// kiosk reale rispetto alla finestra normale, probabilmente dovuto a xfwm4
// che non fa l'unredirect del compositing per la finestra fullscreen creata
// da --kiosk (comportamento documentato per finestre non "override
// redirect" — vedi changelog v0.99.9), risultando in doppio compositing
// software (Chromium con --disable-gpu-compositing + xfwm4) sull'intera
// superficie schermo.
//
// fullscreen (booleano) resta per retrocompatibilità con app.conf scritti
// da versioni precedenti — derivato automaticamente da displayMode quando
// non presente nel file, e mantenuto in scrittura perché kiosk-launch.sh di
// installazioni precedenti potrebbe ancora leggerlo prima dell'update.
export type DisplayMode = 'kiosk' | 'window' | 'borderless';

export interface AppConfig {
  fullscreen: boolean;
  displayMode: DisplayMode;
  // v0.99.90 — Step 15d: budget mensile di token per l'AI Advisor,
  // condiviso tra tutti i provider (non per-provider) — deciso in fase di
  // progettazione: un unico numero ha lo stesso significato per l'utente
  // indipendentemente da quale provider stia effettivamente rispondendo
  // in un dato momento (fallback silenzioso tra più provider abilitati).
  aiMonthlyTokenBudget: number;
}

const DEFAULTS: AppConfig = {
  fullscreen: true,        // comportamento storico: kiosk-launch.sh avviava sempre a tutto schermo
  displayMode: 'kiosk',    // equivalente a fullscreen=true prima di v0.99.9
  // Una sessione di debug tipica pesa ~5.000 token (vedi discussione sui
  // costi) — 50.000 permette circa 10 sessioni al mese prima di avvicinarsi
  // al limite, un default ragionevole senza essere arbitrariamente basso.
  aiMonthlyTokenBudget: 50_000,
};

function parseConfFile(raw: string): Partial<AppConfig> {
  const out: Partial<AppConfig> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key === 'fullscreen') out.fullscreen = val === 'true';
    if (key === 'displayMode' && (val === 'kiosk' || val === 'window' || val === 'borderless')) {
      out.displayMode = val;
    }
    if (key === 'aiMonthlyTokenBudget') {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 0) out.aiMonthlyTokenBudget = n;
    }
  }
  return out;
}

export function readAppConfig(): AppConfig {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = parseConfFile(raw);
    // Retrocompatibilità: un app.conf scritto da una versione precedente a
    // v0.99.9 ha solo `fullscreen`, non `displayMode` — lo deriviamo qui
    // così kiosk-launch.sh (che legge displayMode con fallback a
    // fullscreen comunque, vedi sotto) e il resto del codice vedono sempre
    // un displayMode coerente, senza bisogno di migrare il file su disco.
    if (parsed.displayMode === undefined && parsed.fullscreen !== undefined) {
      parsed.displayMode = parsed.fullscreen ? 'kiosk' : 'window';
    }
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeAppConfig(partial: Partial<AppConfig>): AppConfig {
  const current = readAppConfig();
  const next = { ...current, ...partial };
  // Se viene scritto solo displayMode, deriva fullscreen per compatibilità
  // con qualunque consumatore esterno che legga ancora la vecchia chiave.
  if (partial.displayMode !== undefined && partial.fullscreen === undefined) {
    next.fullscreen = partial.displayMode === 'kiosk';
  }
  const body = [
    '# X-Launcher — preferenze persistite (formato chiave=valore, letto anche da kiosk-launch.sh)',
    `fullscreen=${next.fullscreen}`,
    `displayMode=${next.displayMode}`,
    `aiMonthlyTokenBudget=${next.aiMonthlyTokenBudget}`,
    '',
  ].join('\n');
  writeFileSync(CONFIG_PATH, body, 'utf-8');
  return next;
}
