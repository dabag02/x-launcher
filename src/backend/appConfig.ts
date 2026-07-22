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
// Step 19b (v1.1.38) — solo le due lingue built-in per ora. Un pacchetto di
// traduzione caricato a runtime (vedi src/i18n/i18n.ts) non richiede una
// modifica qui: questo campo resta un enum stretto perché il selettore in
// Settings deve comunque offrire un elenco chiuso di opzioni valide — un
// domani, se i pacchetti caricabili aggiungeranno lingue reali, l'elenco
// andrà generato dinamicamente da quali file sono presenti in
// public/locales/, non hardcoded qui.
export type Language = 'it' | 'en';

export interface AppConfig {
  fullscreen: boolean;
  displayMode: DisplayMode;
  // Step 19b (v1.1.38) — lingua UI scelta manualmente in Settings. Nessun
  // autorilevamento della lingua di sistema ancora implementato (roadmap):
  // il default resta 'it' finché quella parte non viene costruita.
  language: Language;
  // Step 19a (v1.1.86) — richiesto dall'utente: l'avatar selezionato era
  // salvato solo in localStorage (client-side), quindi non condiviso fra
  // Chromium e Firefox (storage separato per browser, inevitabile) e
  // azzerato ad ogni riavvio in Firefox specificamente, lanciato con
  // --private-window (che scarta tutto lo storage alla chiusura). Spostato
  // qui — persistito lato server, sopravvive sia al riavvio sia al cambio
  // di browser. null = nessun avatar selezionato (default).
  avatarUrl: string | null;
}

const DEFAULTS: AppConfig = {
  fullscreen: true,        // comportamento storico: kiosk-launch.sh avviava sempre a tutto schermo
  displayMode: 'kiosk',    // equivalente a fullscreen=true prima di v0.99.9
  language: 'it',
  avatarUrl: null,
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
    if (key === 'language' && (val === 'it' || val === 'en')) {
      out.language = val;
    }
    if (key === 'avatarUrl') {
      out.avatarUrl = val === '' ? null : val;
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

// Step 19b (v1.1.63) — autorilevamento lingua di sistema al primo avvio.
// readAppConfig() da solo non permette di distinguere "language non è mai
// stato scritto nel file" da "è stato scritto esplicitamente 'it'" — il
// merge con DEFAULTS appiattisce i due casi allo stesso valore. Questa
// funzione rilegge il file grezzo (stesso parsing di readAppConfig, non
// duplicato: richiama parseConfFile) e restituisce true solo se la chiave
// `language=` è già presente — il frontend la usa per decidere se questo
// è il primissimo avvio (autorilevare dal browser) o un avvio successivo
// (rispettare quanto già persistito, anche se è il default 'it').
export function hasLanguageBeenSet(): boolean {
  if (!existsSync(CONFIG_PATH)) return false;
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return parseConfFile(raw).language !== undefined;
  } catch {
    return false;
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
    `language=${next.language}`,
    `avatarUrl=${next.avatarUrl ?? ''}`,
    '',
  ].join('\n');
  writeFileSync(CONFIG_PATH, body, 'utf-8');
  return next;
}
