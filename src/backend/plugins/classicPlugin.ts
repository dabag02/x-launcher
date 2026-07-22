/**
 * ClassicPlugin — Step 3
 *
 * Scansiona la directory ROM (ROMS_PATH nel .env, fallback ~/Roms/)
 * cercando file .zip in modalità ibrida:
 *   - Sottocartelle per sistema (SNES/, NES/, DOS/ ecc.) → sistema dal nome cartella
 *   - File .zip nella root → sistema "Unknown", runner RetroArch generico
 *
 * Mappa sistema → runner + core libretro predefinito:
 *   SNES/SFC  → RetroArch (snes9x_libretro.so)
 *   NES/FC    → RetroArch (nestopia_libretro.so)
 *   GBA       → RetroArch (mgba_libretro.so)
 *   GBC/GB    → RetroArch (gambatte_libretro.so)
 *   MD/MEGA   → RetroArch (genesis_plus_gx_libretro.so)
 *   PSX/PS1   → RetroArch (mednafen_psx_libretro.so)
 *   N64       → RetroArch (mupen64plus_next_libretro.so)
 *   DOS       → DOSBox
 *   SCUMMVM   → ScummVM
 *   (altri)   → RetroArch senza core specificato
 */

import { StorePlugin } from './base';
import { writeLog } from '../logger';
import { Game } from '../../types';
import { existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { findExtractorFor, extractArchive, ARCHIVE_EXTRACTORS } from '../archiveExtractors';

// ---------------------------------------------------------------------------
// Mappa nome cartella → { runner, core libretro, sistema visualizzato }
// ---------------------------------------------------------------------------

interface SystemInfo {
  runner: string;
  core?: string;     // path relativo del core, l'utente può sovrascriverlo
  label: string;     // nome visualizzato nella UI
  genre: string;
  // v1.0.0 — chiave canonica di sistema (una sola per ogni "vera" console,
  // a differenza delle chiavi di SYSTEM_MAP che sono alias multipli per lo
  // stesso sistema — es. 'md'/'mega'/'genesis' condividono lo stesso
  // canonical 'genesis'). Serve a filtrare quali core RetroArch installati
  // sono compatibili con QUESTO gioco, invece di mostrarli tutti
  // indistintamente nell'overlay.
  canonical?: string;
}

const SYSTEM_MAP: Record<string, SystemInfo> = {
  // SNES
  'snes':  { runner: 'RetroArch', core: 'snes9x_libretro.so',            label: 'Super Nintendo',     genre: 'Platformer', canonical: 'snes' },
  'sfc':   { runner: 'RetroArch', core: 'snes9x_libretro.so',            label: 'Super Famicom',      genre: 'Platformer', canonical: 'snes' },
  // NES
  'nes':   { runner: 'RetroArch', core: 'nestopia_libretro.so',          label: 'Nintendo NES',       genre: 'Platformer', canonical: 'nes' },
  'fc':    { runner: 'RetroArch', core: 'nestopia_libretro.so',          label: 'Famicom',            genre: 'Platformer', canonical: 'nes' },
  // GBA
  'gba':   { runner: 'RetroArch', core: 'mgba_libretro.so',              label: 'Game Boy Advance',   genre: 'Action', canonical: 'gba' },
  // GBC / GB
  'gbc':   { runner: 'RetroArch', core: 'gambatte_libretro.so',          label: 'Game Boy Color',     genre: 'Action', canonical: 'gbc' },
  'gb':    { runner: 'RetroArch', core: 'gambatte_libretro.so',          label: 'Game Boy',           genre: 'Action', canonical: 'gb' },
  // Sega
  'md':    { runner: 'RetroArch', core: 'genesis_plus_gx_libretro.so',   label: 'Sega Mega Drive',    genre: 'Action', canonical: 'genesis' },
  'mega':  { runner: 'RetroArch', core: 'genesis_plus_gx_libretro.so',   label: 'Sega Mega Drive',    genre: 'Action', canonical: 'genesis' },
  'genesis': { runner: 'RetroArch', core: 'genesis_plus_gx_libretro.so', label: 'Sega Genesis',       genre: 'Action', canonical: 'genesis' },
  'sms':   { runner: 'RetroArch', core: 'genesis_plus_gx_libretro.so',   label: 'Sega Master System', genre: 'Action', canonical: 'mastersystem' },
  'ms':    { runner: 'RetroArch', core: 'genesis_plus_gx_libretro.so',   label: 'Sega Master System', genre: 'Action', canonical: 'mastersystem' },
  'mastersystem': { runner: 'RetroArch', core: 'genesis_plus_gx_libretro.so', label: 'Sega Master System', genre: 'Action', canonical: 'mastersystem' },
  // PlayStation
  // v1.1.96 — segnalato dall'utente: pcsx_rearmed è ottimizzato per ARM
  // (il nome stesso lo dice) e non risulta più pacchettizzato in modo
  // affidabile per x86_64 su Arch — il pacchetto trovabile con una
  // ricerca reale è specifico per Arch Linux ARM, non per i repository
  // x86_64 standard. mednafen_psx (pacchetto Arch: libretro-beetle-psx,
  // confermato attuale su extra/x86_64) è il default più sensato su
  // desktop x86_64, e l'utente lo ha già verificato funzionante sul
  // proprio sistema con lo stesso identico gioco.
  'psx':   { runner: 'RetroArch', core: 'mednafen_psx_libretro.so',      label: 'PlayStation',        genre: 'Action', canonical: 'psx' },
  'ps1':   { runner: 'RetroArch', core: 'mednafen_psx_libretro.so',      label: 'PlayStation',        genre: 'Action', canonical: 'psx' },
  'psp':   { runner: 'RetroArch', core: 'ppsspp_libretro.so',            label: 'PSP',                genre: 'Action', canonical: 'psp' },
  // N64
  'n64':   { runner: 'RetroArch', core: 'mupen64plus_next_libretro.so',  label: 'Nintendo 64',        genre: 'Action', canonical: 'n64' },
  // Arcade / MAME
  'mame':   { runner: 'RetroArch', core: 'mame_libretro.so',    label: 'Arcade (MAME)',      genre: 'Action', canonical: 'arcade' },
  'arcade': { runner: 'RetroArch', core: 'mame_libretro.so',    label: 'Arcade (MAME)',      genre: 'Action', canonical: 'arcade' },
  // DOS
  'dos':   { runner: 'DOSBox',    core: undefined,                        label: 'DOS',                genre: 'Adventure' },
  'dosbox':{ runner: 'DOSBox',    core: undefined,                        label: 'DOS',                genre: 'Adventure' },
  // ScummVM
  'scummvm': { runner: 'ScummVM', core: undefined,                        label: 'ScummVM',            genre: 'Adventure' },
  'adventure': { runner: 'ScummVM', core: undefined,                      label: 'Adventure',          genre: 'Adventure' },
};

/**
 * v1.0.0 — core RetroArch noti per essere compatibili con ciascun sistema
 * canonico (non solo quello di default) — usata per filtrare l'elenco dei
 * core installati mostrato nell'overlay di un gioco, invece di mostrarli
 * tutti indistintamente indipendentemente dalla console. Confrontata per
 * NOME BASE del file (es. "snes9x", non il path completo né l'estensione
 * "_libretro.so"), non per corrispondenza esatta dell'intero filename —
 * più tollerante a piccole variazioni di packaging tra distro diverse.
 *
 * ATTENZIONE: elenco compilato da conoscenza generale dei core libretro più
 * diffusi, non verificato empiricamente in questa sessione (nessun
 * ambiente RetroArch reale disponibile qui). Se manca un core che l'utente
 * ha davvero installato ed è compatibile, semplicemente non comparirà come
 * alternativa finché questa lista non viene aggiornata — fallimento
 * "silenzioso e innocuo", non un errore bloccante: il gioco continua a
 * funzionare con qualunque core sia già assegnato.
 */
export const COMPATIBLE_CORES_BY_SYSTEM: Record<string, string[]> = {
  snes:         ['snes9x', 'snes9x2010', 'snes9x_2010', 'bsnes', 'bsnes_hd', 'bsnes_mercury_balanced', 'bsnes_mercury_accuracy', 'bsnes_mercury_performance', 'mesen-s', 'mesen_s'],
  nes:          ['nestopia', 'fceumm', 'mesen', 'quicknes'],
  gba:          ['mgba', 'vba_next', 'vbam', 'gpsp'],
  gbc:          ['gambatte', 'mgba', 'sameboy', 'tgbdual'],
  gb:           ['gambatte', 'mgba', 'sameboy', 'tgbdual'],
  genesis:      ['genesis_plus_gx', 'picodrive', 'blastem'],
  mastersystem: ['genesis_plus_gx', 'picodrive'],
  psx:          ['mednafen_psx', 'mednafen_psx_hw', 'beetle_psx', 'beetle_psx_hw', 'pcsx_rearmed', 'swanstation'],
  psp:          ['ppsspp'],
  n64:          ['mupen64plus_next', 'parallel_n64'],
  arcade:       ['mame', 'mame2003_plus', 'mame2010', 'fbneo', 'fbalpha2012'],
};

const UNKNOWN_SYSTEM: SystemInfo = {
  runner: 'RetroArch',
  label: 'Classic',
  genre: 'Action',
};

/**
 * CANONICAL_SYSTEM_FOLDERS — una sola cartella per sistema reale, generata
 * automaticamente in Roms/ se assente. SYSTEM_MAP contiene più alias per lo
 * stesso sistema (es. 'md'/'mega'/'genesis' per Mega Drive) perché deve
 * riconoscere qualunque nome l'utente scelga per una cartella già esistente;
 * qui invece serve l'opposto — una sola cartella "ufficiale" da creare, per
 * non generare 3 cartelle diverse che puntano allo stesso emulatore e
 * confondere l'utente su dove trascinare le ROM.
 *
 * Nomi brevi (sigle), non i nomi lunghi stile "Nintendo - Super Nintendo
 * Entertainment System" usati da alcune convenzioni community: lo schema
 * lungo non è uno standard imposto da RetroArch (i file/cartelle ROM possono
 * chiamarsi come si vuole), mentre le sigle corte sono già quelle riconosciute
 * da detectSystem() in questo file — coerenza garantita tra cartella creata
 * e sistema effettivamente rilevato.
 */
const CANONICAL_SYSTEM_FOLDERS = [
  'SNES', 'NES', 'GBA', 'GBC', 'GB',
  'MD', 'SMS', 'PSX', 'PSP', 'N64',
  'Mame', 'DOS', 'ScummVM',
];

/**
 * ensureSystemFolders — crea le sottocartelle canoniche in Roms/ se non
 * esistono già. Chiamata ad ogni scan: mkdirSync({recursive:true}) su una
 * cartella già esistente non fa nulla e non lancia errore, quindi è sicura
 * da richiamare ripetutamente senza bisogno di un check "solo al primo avvio".
 * Non tocca/rinomina cartelle già presenti con nomi diversi (es. l'utente ha
 * già "Genesis/" invece di "MD/") — detectSystem() le riconosce comunque
 * tramite gli alias di SYSTEM_MAP, quindi non c'è bisogno di unificarle.
 */
function ensureSystemFolders(romsRoot: string): void {
  for (const folder of CANONICAL_SYSTEM_FOLDERS) {
    const dir = path.join(romsRoot, folder);
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      writeLog('warning', `[CLASSIC] Could not create folder ${dir}: ${err}`);
    }
  }
}

/**
 * v1.0.0 — core di default per un sistema canonico, derivato da SYSTEM_MAP
 * (più alias condividono lo stesso canonical e lo stesso core di default,
 * es. 'md'/'mega'/'genesis' → 'genesis' → genesis_plus_gx_libretro.so —
 * prende semplicemente il primo alias trovato per quel canonical, sono
 * già garantiti coerenti tra loro nella mappa sopra).
 */
export function getDefaultCoreForSystem(canonical: string): string | undefined {
  for (const info of Object.values(SYSTEM_MAP)) {
    if (info.canonical === canonical) return info.core;
  }
  return undefined;
}

function detectSystem(dirName: string): SystemInfo {
  const key = dirName.toLowerCase();
  // Cerca corrispondenza esatta o parziale
  for (const [k, v] of Object.entries(SYSTEM_MAP)) {
    if (key === k || key.startsWith(k) || key.includes(k)) return v;
  }
  return UNKNOWN_SYSTEM;
}

/**
 * makeGameId — genera un ID stabile e senza collisioni per ogni ROM.
 *
 * BUG FIX (patch-step3-003):
 * La versione precedente usava `hash |= 0` che forza un intero con segno
 * a 32 bit, producendo valori negativi. `Math.abs()` su negativi aumenta
 * drasticamente la probabilità di collisione tra ROM diverse → una sola
 * ROM visibile in libreria invece di tutte.
 * Fix: `hash >>> 0` (unsigned right-shift) mantiene sempre valori positivi
 * garantendo la piena distribuzione dello spazio a 32 bit.
 */
function makeGameId(romPath: string): string {
  let hash = 5381;
  for (let i = 0; i < romPath.length; i++) {
    hash = ((hash << 5) + hash) ^ romPath.charCodeAt(i);
    hash = hash >>> 0; // unsigned 32-bit — nessun valore negativo, nessuna collisione
  }
  const hex = hash.toString(16).padStart(8, '0');
  const safeName = path.basename(romPath, path.extname(romPath))
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 16)
    .toLowerCase();
  return `classic-${safeName}-${hex}`;
}

// Estensioni ROM valide. Ogni console ha il suo formato nativo; molte
// raccolte distribuiscono anche archivi compressi — quali siano
// riconosciuti dipende dal registry in archiveExtractors.ts (solo quelli
// con supported:true, altrimenti si ripeterebbe il problema del .7z: file
// visto in libreria ma che non parte mai perché non sappiamo estrarlo).
const ROM_EXTENSIONS = new Set([
  ...ARCHIVE_EXTRACTORS.filter(e => e.supported).flatMap(e => e.extensions),
  '.nes', '.fds',                    // NES / Famicom
  '.smc', '.sfc',                    // SNES / Super Famicom
  '.gb', '.gbc', '.gba',             // Game Boy line
  '.sms', '.gg',                     // Sega Master System / Game Gear
  '.md', '.gen', '.bin',             // Sega Mega Drive / Genesis
  '.n64', '.z64', '.v64',            // Nintendo 64
  '.cue', '.img', '.iso', '.pbp',    // PlayStation / PSP
  '.cso',                            // PSP compressed
  '.rom',                            // generic
]);

function isRomFile(filename: string): boolean {
  return ROM_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function titleFromFilename(filename: string): string {
  return path.basename(filename, path.extname(filename))
    .replace(/[_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Richiesta utente — diagnosi fatta da loro stessi: passando lo ZIP di un
// gioco PSX a RetroArch, il lancio fallisce; estraendolo a mano e puntando
// al file .cue funziona con lo stesso identico core. Causa: a differenza
// dei sistemi a cartuccia (SNES/Genesis/MAME, un solo file per ROM,
// RetroArch legge comodamente dentro lo zip), un dump PSX è un'immagine CD
// (.cue + uno o più .bin) — più file con riferimenti relativi fra loro,
// che il meccanismo generico "leggi dentro lo zip" di RetroArch non
// gestisce allo stesso modo. Estendibile in futuro ad altri sistemi CD
// (Saturn, Dreamcast, PC Engine CD) aggiungendoli qui.
const CD_BASED_SYSTEMS = new Set(['psx']);

/** Cerca un file .cue direttamente dentro la cartella indicata (non ricorsivo — un'estrazione pulita ne ha uno solo alla radice). */
function findCueFile(dir: string): string | null {
  try {
    const cue = readdirSync(dir).find(f => f.toLowerCase().endsWith('.cue'));
    return cue ? path.join(dir, cue) : null;
  } catch {
    return null;
  }
}

// v1.1.103-dev.1 — richiesta utente: se ha già estratto lo zip a mano
// DIRETTAMENTE nella cartella di emulazione (PSX/, DREAMCAST/, SATURN/,
// ecc. — non necessariamente dentro .extracted/<nome>/, dove la guardava
// solo la cache sotto), trova quel .cue e usalo invece di ritentare
// un'estrazione automatica ad ogni sync. Caso reale che ha fatto emergere
// il problema: uno zip PSX corrotto ("End-of-central-directory signature
// not found") falliva ad ogni sync periodica (ogni 5 minuti, vedi
// gameManager.ts LIBRARY_REFRESH_INTERVAL_MS), rilogando lo stesso errore
// all'infinito, anche se l'utente aveva già risolto a mano.
//
// Cerca in due punti, in ordine: (1) un .cue sciolto direttamente nella
// cartella di sistema il cui nome inizia con quello dello zip — tollera
// tag regione/revisione tipo "Crash Bandicoot (USA).cue"; (2) un .cue
// dentro una sottocartella con lo stesso nome dello zip, nel caso
// l'estrazione a mano abbia ricreato una struttura a cartelle (comune se
// lo zip stesso conteneva già una cartella di primo livello).
function findMatchingCueInDir(dir: string, zipBaseName: string): string | null {
  try {
    const normalizedBase = zipBaseName.toLowerCase();
    const entries = readdirSync(dir, { withFileTypes: true });

    const looseCue = entries
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.cue'))
      .find(e => e.name.toLowerCase().startsWith(normalizedBase));
    if (looseCue) return path.join(dir, looseCue.name);

    const subDir = entries.find(e => e.isDirectory() && e.name.toLowerCase() === normalizedBase);
    if (subDir) {
      const cue = findCueFile(path.join(dir, subDir.name));
      if (cue) return cue;
    }

    return null;
  } catch {
    return null;
  }
}

// Richiesta utente — "auto-remaster", verificato passo per passo a mano
// col vero client RetroArch prima di scrivere una riga di codice (caso
// PSX, il primo e finora unico verificato):
// - Il core software di default spesso non supporta upscaling della
//   risoluzione interna — serve una variante hardware-accelerata dedicata
//   (per PSX: mednafen_psx_hw_libretro.so, "Beetle PSX HW").
// - --appendconfig= NON funziona in modo affidabile per queste opzioni: il
//   log del test dal vivo mostra che RetroArch le legge, ma poi il file
//   PERSISTENTE del core (riscritto ad ogni chiusura) le sovrascrive
//   silenziosamente con i default. Il meccanismo che funziona davvero è
//   l'override PER-CONTENUTO che RetroArch stesso supporta nativamente:
//   un file con lo stesso nome del contenuto (senza estensione) nella
//   cartella di config del core, con priorità più alta del file globale.
//
// Struttura pensata per essere estesa un sistema alla volta (N64/Saturn/
// Dreamcast/PS2, discusso con l'utente e rimandato: ciascuno richiede la
// STESSA verifica passo-passo da terminale fatta per PSX — mai assumere
// nomi di core/opzione senza conferma reale, un core diverso ha sempre
// nomi di opzione completamente diversi). Aggiungere un sistema significa
// aggiungere una voce a REMASTER_PRESETS qui sotto — nessun'altra parte
// del codice (gameManager.ts, server.ts, l'interruttore in App.tsx) ha
// bisogno di essere toccata.
export interface RemasterPreset {
  /** Core hardware-accelerato/potenziato da usare quando il remaster è attivo. */
  remasterCore: string;
  /** Core originale (più fedele, nessun upscaling) a cui tornare quando disattivato. */
  defaultCore: string;
  /**
   * Nome ESATTO con cui RetroArch chiama il core nella propria cartella di
   * config (`~/.config/retroarch/config/<questo nome>/`) — non sempre
   * uguale al nome del file .so, verificato dal vivo caso per caso.
   */
  coreDisplayName: string;
  /** Righe `chiave = "valore"` da scrivere nel file di override per-contenuto. */
  optionLines: string[];
}

export const REMASTER_PRESETS: Record<string, RemasterPreset> = {
  // Verificato su hardware reale dall'utente, incluso un secondo giro per
  // un difetto emerso nel test (testo "posterizzato": risolto escludendo
  // il filtro dagli sprite + colore a 32bpp con dithering disabilitato,
  // entrambi documentati come fix noti per questo sintomo).
  psx: {
    remasterCore:    'mednafen_psx_hw_libretro.so',
    defaultCore:     'mednafen_psx_libretro.so',
    coreDisplayName: 'Beetle PSX HW',
    optionLines: [
      'beetle_psx_hw_renderer = "hardware_vk"',
      'beetle_psx_hw_internal_resolution = "2x"',
      'beetle_psx_hw_filter = "bilinear"',
      'beetle_psx_hw_filter_exclude_sprite = "enabled"',
      'beetle_psx_hw_depth = "32bpp"',
      'beetle_psx_hw_dither_mode = "disabled"',
      'beetle_psx_hw_msaa = "2x"',
      'beetle_psx_hw_pgxp_mode = "memory"',
    ],
  },
  // n64/saturn/dreamcast/ps2: da aggiungere quando verrà ripreso il
  // lavoro, dopo la stessa verifica da terminale fatta per psx sopra.
};

/** true se questo sistema canonico ha un preset auto-remaster verificato. */
export function hasRemasterPreset(canonicalSystem: string | undefined): boolean {
  return !!canonicalSystem && canonicalSystem in REMASTER_PRESETS;
}

/**
 * Scrive il file di override per-contenuto con il preset auto-remaster,
 * se non esiste già — richiamata quando l'utente attiva l'opzione per un
 * gioco specifico. Il nome del file deve combaciare ESATTAMENTE col nome
 * del contenuto caricato (senza estensione) — verificato dal vivo per
 * PSX: "Crash Bandicoot (USA).cue" → "Crash Bandicoot (USA).opt".
 *
 * Non serve mai RIMUOVERE questo file per tornare all'emulazione
 * originale: disattivare l'opzione si limita a cambiare il core in uso
 * (vedi defaultCore) — un core diverso legge da una cartella di config
 * diversa, quindi questo file semplicemente smette di essere rilevante,
 * senza doverlo toccare.
 */
export function writeRemasterOptions(contentPath: string, canonicalSystem: string): void {
  const preset = REMASTER_PRESETS[canonicalSystem];
  if (!preset) return;

  const configHome = process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config');
  const optDir = path.join(configHome, 'retroarch', 'config', preset.coreDisplayName);
  const contentName = path.basename(contentPath, path.extname(contentPath));
  const optPath = path.join(optDir, `${contentName}.opt`);
  const optContent = preset.optionLines.join('\n') + '\n';

  try {
    mkdirSync(optDir, { recursive: true });
    // Scrive solo se assente — se l'utente ha già modificato queste
    // impostazioni per QUESTO gioco specifico dentro RetroArch stesso
    // (es. dal menu rapido), non vogliamo sovrascrivere le sue scelte
    // ogni volta che riattiva l'opzione dalla Dashboard.
    if (!existsSync(optPath)) {
      writeFileSync(optPath, optContent, 'utf-8');
      writeLog('info', `[CLASSIC] Preset auto-remaster (${canonicalSystem}) scritto: ${optPath}`);
    }
  } catch (e) {
    writeLog('warning', `[CLASSIC] Scrittura preset auto-remaster (${canonicalSystem}) fallita (${optPath}): ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export class ClassicPlugin extends StorePlugin {
  readonly id          = 'Classic Console' as const;
  readonly name        = 'Classic Console';
  readonly isPublic    = true;
  readonly drmFree     = true;   // ROM — nessun DRM
  readonly description = 'ROM e console classiche — RetroArch, DOSBox, ScummVM';
  readonly requiredTool = 'retroarch';
  // Scan locale del filesystem: un titolo assente dal risultato non esiste
  // più su disco con certezza → gameManager può pulire il DB in sicurezza.
  readonly isExhaustiveLocalScan = true;

  private getRomsRoot(): string {
    const fromEnv = process.env.ROMS_PATH;
    if (fromEnv) {
      const expanded = fromEnv.startsWith('~')
        ? path.join(homedir(), fromEnv.slice(1))
        : fromEnv;
      return expanded;
    }
    return path.join(homedir(), 'Roms');
  }

  async getLibrary(): Promise<Game[]> {
    const romsRoot = this.getRomsRoot();

    // Genera la cartella Roms/ e l'albero di sottocartelle per sistema se
    // manca (primo avvio, oppure cartella rimossa/path .env cambiato in un
    // punto vuoto). Comportamento intenzionalmente semplice: se l'utente
    // sposta la sua collezione altrove, è sua responsabilità aggiornare
    // ROMS_PATH nel .env di conseguenza — nessuna euristica per distinguere
    // "primo avvio" da "path sbagliato", la cartella risultante decide.
    // mkdirSync({recursive:true}) su una cartella già esistente non fa nulla,
    // quindi è sicuro chiamarlo ad ogni scan invece che una sola volta.
    const justCreated = !existsSync(romsRoot);
    mkdirSync(romsRoot, { recursive: true });
    ensureSystemFolders(romsRoot);
    if (justCreated) {
      writeLog('info', `[CLASSIC] ROM folder created: ${romsRoot}`);
      writeLog('info', `[CLASSIC] System subfolders generated — drop ROMs into the matching one.`);
    }

    const games: Game[] = [];
    const entries = readdirSync(romsRoot);

    for (const entry of entries) {
      const entryPath = path.join(romsRoot, entry);
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        // Modalità sottocartella: sistema rilevato dal nome cartella
        const system = detectSystem(entry);
        let roms: string[];
        try {
          roms = readdirSync(entryPath).filter(f => isRomFile(f));
        } catch { continue; }

        for (const rom of roms) {
          const romPath = path.join(entryPath, rom);
          games.push(this.buildGame(romPath, system, entry));
        }

      } else if (isRomFile(entry)) {
        // Modalità flat: zip nella root, sistema sconosciuto
        games.push(this.buildGame(entryPath, UNKNOWN_SYSTEM, ''));
      }
    }

    writeLog('info', `[CLASSIC] ${games.length} ROMs found in ${romsRoot}`);
    for (const g of games) {
      writeLog('info', `[CLASSIC]   → ${g.id} | ${g.title} | ${g.runner} | core: ${g.libretroCore ?? 'auto'}`);
    }
    return games;
  }

  // Richiesta utente — diagnosi fatta da loro stessi: passando lo ZIP di un
  // gioco PSX a RetroArch, il lancio fallisce; estraendolo a mano e
  // puntando al file .cue funziona con lo stesso identico core. Causa: a
  // differenza dei sistemi a cartuccia (SNES/Genesis/MAME, un solo file
  // per ROM, RetroArch legge comodamente dentro lo zip), un dump PSX è
  // un'immagine CD (.cue + uno o più .bin) — più file con riferimenti
  // relativi fra loro, che il meccanismo generico "leggi dentro lo zip"
  // di RetroArch non gestisce allo stesso modo. Estendibile in futuro ad
  // altri sistemi CD (Saturn, Dreamcast, PC Engine CD) aggiungendoli qui.
  private extractCdImageIfNeeded(romPath: string, canonicalSystem: string | undefined): string {
    if (!canonicalSystem || !CD_BASED_SYSTEMS.has(canonicalSystem)) return romPath;

    const systemDir   = path.dirname(romPath);
    const zipBaseName = path.basename(romPath, path.extname(romPath));

    // v1.1.105-dev.1 — spostato PRIMA di qualunque controllo sull'estensione
    // (prima era dopo un `if (!romPath.endsWith('.zip')) return romPath`,
    // quindi non scattava mai per .7z/.rar): se il gioco è già scompattato
    // — a mano o da una scansione precedente, qualunque fosse il formato
    // originale — non ha senso cercare di ri-decomprimere nulla.
    const manualCue = findMatchingCueInDir(systemDir, zipBaseName);
    if (manualCue) return manualCue;

    // v1.1.105-dev.1 — utility-agnostic: quale estrattore usare (unzip,
    // 7z, in futuro altro) è deciso da archiveExtractors.ts, non più
    // hardcoded qui. Se il file non è un archivio riconosciuto (es. è già
    // un .cue diretto) o l'estensione è nota ma non ancora supportata per
    // l'estrazione reale (es. .rar oggi), esce senza tentare nulla.
    const extractor = findExtractorFor(romPath);
    if (!extractor || !extractor.supported) return romPath;

    const extractDir = path.join(systemDir, '.extracted', zipBaseName);

    // Cache su disco: se già estratto in un giro precedente (.cue già
    // presente), non ripetere — l'estrazione di un'immagine CD (centinaia
    // di MB) è sincrona e bloccante, accettabile solo perché avviene una
    // volta sola per gioco, non ad ogni scansione della libreria.
    const cached = findCueFile(extractDir);
    if (cached) return cached;

    mkdirSync(extractDir, { recursive: true });
    const result = extractArchive(romPath, extractDir);
    if (result.success) {
      const cue = findCueFile(extractDir);
      if (cue) {
        writeLog('info', `[CLASSIC] Estratto ${path.basename(romPath)} → ${cue}`);
        return cue;
      }
      writeLog('warning', `[CLASSIC] Estrazione di ${path.basename(romPath)} riuscita ma nessun .cue trovato dentro — uso l'archivio originale (probabilmente non partirà).`);
      return romPath;
    }
    writeLog('warning', `[CLASSIC] Estrazione di ${path.basename(romPath)} fallita (${result.message}) — uso l'archivio originale.`);
    return romPath;
  }

  private buildGame(romPath: string, system: SystemInfo, systemDir: string): Game {
    const title = titleFromFilename(romPath);
    const id    = makeGameId(romPath);
    // v1.1.95 — per sistemi CD-based (PSX per ora), estrae lo zip e
    // punta al .cue reale invece del pacchetto compresso, vedi
    // extractCdImageIfNeeded sopra. Per ogni altro sistema, ritorna
    // romPath invariato (nessun costo aggiuntivo).
    const executablePath = this.extractCdImageIfNeeded(romPath, system.canonical);

    return {
      id,
      title,
      store:         'Classic Console',
      runner:        system.runner as any,
      isInstalled:   true,   // le ROM sono sempre "installate" — sono file locali
      playTimeHours: 0,
      coverImage:    '',     // Step 9: SteamGridDB coprirà anche i classici
      previewImage:  '',
      description:   system.label ? `${system.label} — ROM` : 'Classic ROM',
      tags:          [system.label, 'Classic', 'Retro'].filter(Boolean),
      genres:        [system.genre],
      categories:    ['Single-player'],
      status:        'Ready to Launch',
      executablePath: executablePath,
      libretroCore:  system.core,   // può essere sovrascritto dall'utente (Step 4)
      // v1.0.0 — chiave canonica di sistema, usata per filtrare quali core
      // RetroArch installati sono compatibili con questo gioco specifico
      // (vedi COMPATIBLE_CORES_BY_SYSTEM sopra) — undefined per DOS/
      // ScummVM/sistema sconosciuto, dove il concetto "core alternativo"
      // non si applica.
      system: system.canonical,
    };
  }

  async installGame(_id: string)   { return { success: true }; }
  async uninstallGame(_id: string) { return { success: true }; }
}
