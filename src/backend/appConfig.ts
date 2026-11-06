/**
 * appConfig.ts — Preferenze utente persistite, semplici e leggibili anche
 * da bash (formato chiave=valore, non JSON: kiosk-launch.sh deve poterlo
 * leggere senza dipendenze aggiuntive).
 *
 * File: ~/.local/share/x-launcher/app.conf
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { DATA_DIR } from './paths';
import { isSafeAvatarUrl } from './restoreSafety';

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

// v2.2.19-dev.7 — Step 20 seguito: risoluzione della sessione Kiosk
// (gamescope standalone), ciclabile dal menu quick-menu della Dashboard
// e persistita qui (stesso file bash-readable) così gamescope-session.sh
// la legge direttamente all'avvio senza passare dal backend Node.
export type GamescopeResolution = 'HD' | 'FullHD' | 'QHD' | '4K';

// v3.1.7-dev.1 — id del tema della Dashboard (file themes/<id>.json). Non un enum chiuso: i temi
// sono predisposti per essere aggiunti come file; qui si controlla solo la forma dell'id. Un id
// valido ma senza file viene ignorato dal frontend e dall'overlay (ricadono su 'dark').
export const THEME_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
export function isValidThemeId(v: unknown): v is string {
  return typeof v === 'string' && THEME_ID_RE.test(v);
}

// Ordine di ciclo del pulsante "Modalità Gamescope" — HD → FullHD → QHD →
// 4K → di nuovo HD. Tenuto qui (non solo in gamescope-session.sh) perché
// sia il backend (endpoint di ciclo, Step 2) sia lo script bash devono
// concordare sullo stesso ordine e sugli stessi W×H — vedi il mapping
// duplicato in gamescope-session.sh (bash puro, non può importare da qui)
// con un commento che rimanda a questa fonte di verità.
export const GAMESCOPE_RESOLUTION_ORDER: GamescopeResolution[] = ['HD', 'FullHD', 'QHD', '4K'];

export const GAMESCOPE_RESOLUTION_SIZES: Record<GamescopeResolution, { width: number; height: number }> = {
  HD:     { width: 1280, height: 720 },
  FullHD: { width: 1920, height: 1080 },
  QHD:    { width: 2560, height: 1440 },
  '4K':   { width: 3840, height: 2160 },
};

export function nextGamescopeResolution(current: GamescopeResolution): GamescopeResolution {
  const idx = GAMESCOPE_RESOLUTION_ORDER.indexOf(current);
  return GAMESCOPE_RESOLUTION_ORDER[(idx + 1) % GAMESCOPE_RESOLUTION_ORDER.length];
}

export interface AppConfig {
  fullscreen: boolean;
  displayMode: DisplayMode;
  // v2.2.19-dev.7 — vedi sopra. Default 'QHD': era il valore hardcoded in
  // gamescope-session.sh prima di questo step (2560x1440, la risoluzione
  // reale del monitor dell'utente) — mantenuto come default per non
  // cambiare comportamento a chi aggiorna senza aver ancora mai toccato
  // il nuovo pulsante.
  gamescopeResolution: GamescopeResolution;
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
  // v3.1.7-dev.1 — tema della Dashboard, letto anche da overlay.py. Prima solo in localStorage.
  theme: string;
}

const DEFAULTS: AppConfig = {
  fullscreen: true,        // comportamento storico: kiosk-launch.sh avviava sempre a tutto schermo
  displayMode: 'kiosk',    // equivalente a fullscreen=true prima di v0.99.9
  language: 'it',
  avatarUrl: null,
  gamescopeResolution: 'QHD',
  theme: 'dark',
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
    if (key === 'gamescopeResolution' && (val === 'HD' || val === 'FullHD' || val === 'QHD' || val === '4K')) {
      out.gamescopeResolution = val;
    }
    if (key === 'theme' && isValidThemeId(val)) {
      out.theme = val;
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

// v3.1.7-dev.1 — come hasLanguageBeenSet(): true se `theme=` è già scritto in app.conf. Il
// frontend lo usa per copiarvi, la prima volta, il tema che prima stava solo nel browser.
export function hasThemeBeenSet(): boolean {
  if (!existsSync(CONFIG_PATH)) return false;
  try {
    return parseConfFile(readFileSync(CONFIG_PATH, 'utf-8')).theme !== undefined;
  } catch {
    return false;
  }
}

export function writeAppConfig(partial: Partial<AppConfig>): AppConfig {
  const current = readAppConfig();
  // v3.1.7-dev.1 — PATCH /api/config passa qui il corpo della richiesta: un tema con id non
  // valido non viene scritto (il file è letto anche da bash e da Python).
  if (partial.theme !== undefined && !isValidThemeId(partial.theme)) {
    partial = { ...partial };
    delete partial.theme;
  }
  // Riga `theme=` solo se il tema è già nel file o arriva ora: scrivere un'altra preferenza non
  // deve far risultare "scelto" il tema di default (vedi hasThemeBeenSet()).
  const writeTheme = partial.theme !== undefined || hasThemeBeenSet();
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
    `gamescopeResolution=${next.gamescopeResolution}`,
    ...(writeTheme ? [`theme=${next.theme}`] : []),
    '',
  ].join('\n');
  writeFileSync(CONFIG_PATH, body, 'utf-8');
  return next;
}

/**
 * v3.0.2-dev.4 — ripristino di app.conf da un bundle Cloud Backup (input non fidato). Non si scrive il testo
 * del bundle: se ne leggono solo le chiavi note con valori validi (parseConfFile controlla gli enum;
 * avatarUrl deve essere `/avatars/<nome sicuro>`) e il file viene riscritto da writeAppConfig().
 */
export function restoreAppConfFromText(raw: string): AppConfig {
  const parsed = parseConfFile(raw);
  if (parsed.avatarUrl !== undefined && !isSafeAvatarUrl(parsed.avatarUrl)) delete parsed.avatarUrl;
  return writeAppConfig(parsed);
}
