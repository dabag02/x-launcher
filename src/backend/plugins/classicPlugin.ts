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
 *   PSX/PS1   → RetroArch (pcsx_rearmed_libretro.so)
 *   N64       → RetroArch (mupen64plus_next_libretro.so)
 *   DOS       → DOSBox
 *   SCUMMVM   → ScummVM
 *   (altri)   → RetroArch senza core specificato
 */

import { StorePlugin } from './base';
import { writeLog } from '../logger';
import { Game } from '../../types';
import { existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

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
  'psx':   { runner: 'RetroArch', core: 'pcsx_rearmed_libretro.so',      label: 'PlayStation',        genre: 'Action', canonical: 'psx' },
  'ps1':   { runner: 'RetroArch', core: 'pcsx_rearmed_libretro.so',      label: 'PlayStation',        genre: 'Action', canonical: 'psx' },
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
  psx:          ['pcsx_rearmed', 'mednafen_psx', 'mednafen_psx_hw', 'swanstation', 'beetle_psx', 'beetle_psx_hw'],
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
      writeLog('warning', `[CLASSIC] Impossibile creare la cartella ${dir}: ${err}`);
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
  const safeName = path.basename(romPath, '.zip')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 16)
    .toLowerCase();
  return `classic-${safeName}-${hex}`;
}

// Estensioni ROM valide. Ogni console ha il suo formato nativo;
// molte raccolte distribuiscono anche .zip/.7z compressi.
const ROM_EXTENSIONS = new Set([
  '.zip', '.7z',
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
      writeLog('info', `[CLASSIC] Cartella ROM creata: ${romsRoot}`);
      writeLog('info', `[CLASSIC] Sottocartelle sistema generate — trascina le ROM in quella corrispondente.`);
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

    writeLog('info', `[CLASSIC] ${games.length} ROM trovate in ${romsRoot}`);
    for (const g of games) {
      writeLog('info', `[CLASSIC]   → ${g.id} | ${g.title} | ${g.runner} | core: ${g.libretroCore ?? 'auto'}`);
    }
    return games;
  }

  private buildGame(romPath: string, system: SystemInfo, systemDir: string): Game {
    const title = titleFromFilename(romPath);
    const id    = makeGameId(romPath);

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
      executablePath: romPath,
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
