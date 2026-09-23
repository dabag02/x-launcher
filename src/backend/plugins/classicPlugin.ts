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
import { existsSync, readdirSync, statSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
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
  // Chiave canonica di sistema — una sola per "vera" console, a differenza
  // delle chiavi di SYSTEM_MAP che sono alias multipli per lo stesso
  // sistema (es. 'md'/'mega'/'genesis' → canonical 'genesis'). Filtra
  // quali core RetroArch installati sono compatibili con QUESTO gioco.
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
  // Sega Saturn — core di default Yabause (Kronos è il fork potenziato,
  // usato solo con l'auto-remaster attivo, vedi REMASTER_PRESETS più sotto).
  // Dump a .cue+.bin come PSX → richiede lo stesso trattamento CD_BASED_SYSTEMS.
  'saturn':{ runner: 'RetroArch', core: 'yabause_libretro.so',           label: 'Sega Saturn',        genre: 'Action', canonical: 'saturn' },
  'sat':   { runner: 'RetroArch', core: 'yabause_libretro.so',           label: 'Sega Saturn',        genre: 'Action', canonical: 'saturn' },
  // PS2 — unico core (lrpcs2/pcsx2_libretro), sia per il default che per
  // l'auto-remaster (modalità toggle-options, vedi REMASTER_PRESETS).
  // Dump a .iso singolo file — se zippato, dalla v2.1.11-dev.8 rientra
  // comunque in CD_BASED_SYSTEMS per l'estrazione persistente (vedi
  // extractCdImageIfNeeded); se già sciolto, nessuna estrazione
  // necessaria, si comporta come i sistemi a cartuccia.
  'ps2':   { runner: 'RetroArch', core: 'pcsx2_libretro.so',             label: 'PlayStation 2',      genre: 'Action', canonical: 'ps2' },
  // Dreamcast — core flycast (unico core libretro mantenuto attivamente
  // per questo sistema), path verificato da fonte ufficiale Arch Linux
  // (pacchetto libretro-flycast, repo extra). Dump a .chd o cartella
  // GDI non zippata (.gdi+.cue+.bin sciolti, vedi findPrimaryDiscFile) —
  // se zippato, dalla v2.1.11-dev.8 rientra in CD_BASED_SYSTEMS come PS2.
  // Preset Auto-Remaster non ancora aggiunto: serve lo stesso file .opt
  // reale verificato per Saturn/PS2 prima di popolare REMASTER_PRESETS.
  'dreamcast': { runner: 'RetroArch', core: 'flycast_libretro.so',       label: 'Dreamcast',          genre: 'Action', canonical: 'dreamcast' },
  'dc':        { runner: 'RetroArch', core: 'flycast_libretro.so',       label: 'Dreamcast',          genre: 'Action', canonical: 'dreamcast' },
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
  saturn:       ['yabause', 'kronos'],
  ps2:          ['pcsx2'],
  dreamcast:    ['flycast'],
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
  'SATURN', 'PS2', 'DREAMCAST',
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
  '.chd',                            // formato compresso a file singolo (Dreamcast/PS2/Saturn)
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
// (Dreamcast, PC Engine CD) aggiungendoli qui — PS2 NON va qui: l'utente
// usa dump a .iso singolo file, che si comporta già come i sistemi a
// cartuccia senza bisogno di questo trattamento.
// v2.1.11-dev.8 — richiesta utente: esteso da "solo psx/saturn (dump
// multi-file .cue+.bin)" a QUALUNQUE sistema a disco ottico, dopo aver
// verificato che il meccanismo automatico di RetroArch per leggere un
// singolo file dentro uno zip dipende da `cache_directory` ed è
// documentato come inconsistente/silenziosamente fallimentare tra i core
// se non configurato — la nostra estrazione persistente in .extracted/
// (già affidabile per PSX/Saturn) è quindi preferibile anche per i
// sistemi a file singolo (Dreamcast .chd, PS2 .iso), non solo per il
// caso multi-file cue+bin che l'ha originata. Vedi findPrimaryDiscFile
// più sotto per la ricerca del file principale post-estrazione (non più
// solo .cue).
const CD_BASED_SYSTEMS = new Set(['psx', 'saturn', 'dreamcast', 'ps2']);

// v2.1.11-dev.6 — richiesta utente: rilevamento astratto multi-disco
// (nessun titolo multi-disco reale ancora in libreria al momento della
// progettazione — confermato dall'utente — quindi verificato solo contro
// convenzioni di naming note, non contro file reali). Scelta esplicita
// dell'utente: i dischi singoli continuano a lanciarsi direttamente dal
// loro file (comportamento invariato, zero rischio per la libreria
// esistente) — la generazione di un .m3u scatta SOLO quando lo scan trova
// davvero 2+ dischi con lo stesso titolo base. PS2 escluso di proposito:
// nessuna fonte trovata che confermi il supporto .m3u in pcsx2_libretro/
// lrpcs2 (a differenza di PSX/Saturn/Dreamcast, confermati). Riaggiungibile
// in un secondo momento se/quando capiterà un titolo PS2 multi-disco reale
// da verificare.
const MULTI_DISC_SYSTEMS = new Set(['psx', 'saturn', 'dreamcast']);

// Riconosce "(Disc 1)", "(Disc1)", "(Disk 2)", "(CD 3)", "[Disc 1]" ecc.,
// case-insensitive. Un file che non matcha resta un gioco a sé stante
// (comportamento invariato) — matcha ma è l'unico della sua serie (nessun
// "Disc 2" corrispondente) → trattato comunque come singolo, col nome
// file originale intatto, non quello ripulito dal tag.
const DISC_TAG_RE = /[\s._-]*[([](?:disc|disk|cd)[\s_]*0*(\d+)[)\]]/i;

/**
 * v2.1.11-dev.7 — BUG REALE segnalato dall'utente: una cartella con dentro
 * `.cue`/`.gdi`/`.bin` sciolti (dump non zippato — tipico per Dreamcast in
 * formato GDI, spesso distribuito già come cartella invece che come zip)
 * non veniva vista affatto dallo scan, che guardava solo i FILE
 * direttamente dentro la cartella di sistema — un `.chd` singolo (Sonic
 * Adventure 2) funzionava, una cartella (Grandia II) no. Cerca il file
 * "principale" dentro una cartella-gioco NON zippata, con priorità fissa:
 * .gdi prima di .cue (più affidabile per il multi-traccia, e flycast lo
 * preferisce nativamente) poi .chd/.iso. Deliberatamente NON ripiega su un
 * .bin sciolto se manca l'indice — un dump con solo tracce e senza .cue/
 * .gdi è incompleto, meglio ignorarlo che indovinare quale .bin lanciare.
 *
 * v2.1.11-dev.9 — BUG REALE (secondo giro), segnalato dall'utente con log
 * reali: cercava SOLO al primo livello della cartella. Un archivio 7z/zip
 * che al suo interno impacchetta una sottocartella (es. "Grandia 2.7z" →
 * dentro c'è "Grandia II (USA)/" coi file, non i file sciolti alla radice
 * — comunissimo, non tutti i packager mettono i file alla radice
 * dell'archivio) faceva fallire la ricerca anche con l'estrazione riuscita
 * perfettamente. Effetto a cascata, tutto osservato nei log dall'utente:
 * (1) la cache-check (stessa funzione, usata anche per capire se un gioco
 * è già stato estratto in un giro precedente) falliva sempre → RI-
 * ESTRAZIONE COMPLETA ad ogni scan/sync, non una volta sola come da
 * commento originale — da cui il rallentamento sensibile passando da una
 * libreria all'altra; (2) ogni volta che l'estrazione "riusciva" ma la
 * ricerca falliva comunque, il codice sovrascriveva l'executablePath nel
 * DB col fallback (l'archivio grezzo) — cancellando ad ogni sync un fix
 * manuale fatto dall'utente stesso puntando al file corretto.
 *
 * Ora cerca in ampiezza (livello per livello, non in profondità) fino a
 * MAX_DEPTH cartelle annidate, applicando la stessa priorità di estensione
 * ad ogni livello prima di scendere al successivo — un file principale al
 * primo livello vince sempre su uno più annidato, a parità di priorità.
 */
function findPrimaryDiscFile(dir: string, maxDepth = 3): string | null {
  let currentLevelDirs = [dir];
  for (let depth = 0; depth <= maxDepth; depth++) {
    const nextLevelDirs: string[] = [];
    for (const currentDir of currentLevelDirs) {
      let entries: import('fs').Dirent[];
      try { entries = readdirSync(currentDir, { withFileTypes: true }); } catch { continue; }

      for (const ext of ['.gdi', '.cue', '.chd', '.iso']) {
        const found = entries.find(e => e.isFile() && e.name.toLowerCase().endsWith(ext));
        if (found) return path.join(currentDir, found.name);
      }
      for (const e of entries) {
        if (e.isDirectory()) nextLevelDirs.push(path.join(currentDir, e.name));
      }
    }
    currentLevelDirs = nextLevelDirs;
    if (currentLevelDirs.length === 0) break;
  }
  return null;
}

/** Un candidato "gioco" prima del raggruppamento multi-disco — un file diretto o una cartella-gioco non zippata (vedi findPrimaryDiscFile). */
export interface DiscCandidate {
  /** Nome file (con estensione) per i file, nome cartella per le cartelle — è quello che DISC_TAG_RE controlla. */
  name: string;
  kind: 'file' | 'folder';
}

/**
 * Raggruppa i candidati (file o cartelle) di una cartella-sistema per
 * titolo base (tag disco rimosso), solo per i sistemi in
 * MULTI_DISC_SYSTEMS. Ogni gruppo con 2+ membri è un multi-disco reale
 * (ordinato per numero disco); i gruppi da 1 elemento tornano nei
 * "singoli" — stesso identico comportamento di prima di questa modifica,
 * nome originale non toccato.
 */
function groupDiscs(
  candidates: DiscCandidate[],
  canonicalSystem: string | undefined,
): { singles: DiscCandidate[]; multiDisc: Map<string, { discNumber: number; candidate: DiscCandidate }[]> } {
  const multiDisc = new Map<string, { discNumber: number; candidate: DiscCandidate }[]>();
  if (!canonicalSystem || !MULTI_DISC_SYSTEMS.has(canonicalSystem)) {
    return { singles: candidates, multiDisc };
  }

  const groups = new Map<string, { discNumber: number; candidate: DiscCandidate }[]>();
  const untagged: DiscCandidate[] = [];

  for (const candidate of candidates) {
    // Le cartelle non hanno estensione da togliere — il nome è già lo stem.
    const stem = candidate.kind === 'file'
      ? path.basename(candidate.name, path.extname(candidate.name))
      : candidate.name;
    const match = stem.match(DISC_TAG_RE);
    if (!match) { untagged.push(candidate); continue; }
    const baseTitle = stem.slice(0, match.index).trim() || stem.replace(DISC_TAG_RE, '').trim();
    const discNumber = parseInt(match[1], 10);
    if (!groups.has(baseTitle)) groups.set(baseTitle, []);
    groups.get(baseTitle)!.push({ discNumber, candidate });
  }

  const singles = [...untagged];
  for (const [baseTitle, discs] of groups) {
    if (discs.length >= 2) {
      discs.sort((a, b) => a.discNumber - b.discNumber);
      multiDisc.set(baseTitle, discs);
    } else {
      // Tag disco trovato ma nessun secondo disco corrispondente — non è
      // davvero un multi-disco, torna come singolo col nome intatto.
      singles.push(discs[0].candidate);
    }
  }
  return { singles, multiDisc };
}

// v1.1.103-dev.1 — richiesta utente: se ha già estratto lo zip a mano
// DIRETTAMENTE nella cartella di emulazione (PSX/, DREAMCAST/, SATURN/,
// ecc. — non necessariamente dentro .extracted/<nome>/), trova quel file
// e usalo invece di ritentare un'estrazione automatica ad ogni sync.
//
// Cerca in due punti, in ordine: (1) un file sciolto (priorità
// .gdi/.cue/.chd/.iso, vedi findPrimaryDiscFile — non più solo .cue dalla
// v2.1.11-dev.8, per coprire anche Dreamcast/PS2) direttamente nella
// cartella di sistema il cui nome inizia con quello dello zip — tollera
// tag regione/revisione tipo "Crash Bandicoot (USA).cue"; (2) lo stesso
// file dentro una sottocartella con lo stesso nome dello zip, nel caso
// l'estrazione a mano abbia ricreato una struttura a cartelle.
function findMatchingCueInDir(dir: string, zipBaseName: string): string | null {
  try {
    const normalizedBase = zipBaseName.toLowerCase();
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const ext of ['.gdi', '.cue', '.chd', '.iso']) {
      const loose = entries
        .filter(e => e.isFile() && e.name.toLowerCase().endsWith(ext))
        .find(e => e.name.toLowerCase().startsWith(normalizedBase));
      if (loose) return path.join(dir, loose.name);
    }

    const subDir = entries.find(e => e.isDirectory() && e.name.toLowerCase() === normalizedBase);
    if (subDir) {
      const found = findPrimaryDiscFile(path.join(dir, subDir.name));
      if (found) return found;
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
// Dreamcast/PS2, discusso con l'utente: ciascuno richiede la STESSA verifica
// passo-passo da terminale fatta per PSX — mai assumere nomi di core/opzione
// senza conferma reale, un core diverso ha sempre nomi di opzione
// completamente diversi). Aggiungere un sistema significa aggiungere una
// voce a REMASTER_PRESETS qui sotto — nessun'altra parte del codice
// (server.ts, l'interruttore in App.tsx) ha bisogno di essere toccata;
// gameManager.ts (setRemasterEnabled) legge solo il campo `mode`.
//
// Due modalità, emerse discutendo Saturn/PS2/N64 con l'utente — non tutti i
// sistemi hanno due core distinti da scambiare come PSX:
//
// - 'swap-core' (PSX, Saturn): esistono due core per lo stesso sistema, uno
//   fedele/originale e uno potenziato. Disattivare il remaster = tornare al
//   core originale; il file di preset resta scritto ma diventa irrilevante
//   perché vive nella cartella di config dell'ALTRO core. Non va mai rimosso.
//
// - 'toggle-options' (PS2, N64): un solo core usato sempre. Il file di
//   preset per-titolo (`<contenuto>.opt`, dentro coreDisplayName) è
//   l'interruttore stesso: se presente il gioco carica il preset, se assente
//   ricade sulla configurazione di default a livello di CORE (nessun file
//   equivalente da gestire per il default — "nessun override" è già la
//   versione base, confermato dall'utente). Disattivare quindi RIMUOVE
//   il file (vedi removeRemasterOptions), a differenza di swap-core.
export interface SwapCoreRemasterPreset {
  mode: 'swap-core';
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

export interface ToggleOptionsRemasterPreset {
  mode: 'toggle-options';
  /** Unico core usato sia con remaster attivo che disattivato. */
  core: string;
  /** Vedi SwapCoreRemasterPreset.coreDisplayName. */
  coreDisplayName: string;
  /** Righe `chiave = "valore"` da scrivere nel file di override per-contenuto. */
  optionLines: string[];
}

export type RemasterPreset = SwapCoreRemasterPreset | ToggleOptionsRemasterPreset;

export const REMASTER_PRESETS: Record<string, RemasterPreset> = {
  // Verificato su hardware reale dall'utente, incluso un secondo giro per
  // un difetto emerso nel test (testo "posterizzato": risolto escludendo
  // il filtro dagli sprite + colore a 32bpp con dithering disabilitato,
  // entrambi documentati come fix noti per questo sintomo).
  psx: {
    mode:            'swap-core',
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
  // Stesso schema di PSX: Kronos è il fork potenziato di Yabause. Preset
  // preso di peso dal file .opt reale usato dall'utente per Sega Rally
  // Championship (confermato: "prendi i file Saturn e PS2 come riferimento
  // per entrambi, si può sempre modificare a mano da RetroArch se qualcosa
  // non funziona" — nessuna curatela/sottoinsieme, file verbatim).
  saturn: {
    mode:            'swap-core',
    remasterCore:    'kronos_libretro.so',
    defaultCore:     'yabause_libretro.so',
    coreDisplayName: 'Kronos',
    optionLines: [
      'kronos_addon_cartridge = "4M_backup_ram"',
      'kronos_bandingmode = "enabled"',
      'kronos_force_downsampling = "enabled"',
      'kronos_force_hle_bios = "disabled"',
      'kronos_language_id = "English"',
      'kronos_meshmode = "enabled"',
      'kronos_multitap_port1 = "disabled"',
      'kronos_multitap_port2 = "disabled"',
      'kronos_resolution_mode = "8X"',
      'kronos_service_enabled = "disabled"',
      'kronos_skipframe = "0"',
      'kronos_stv_favorite_region = "EU"',
      'kronos_use_beetle_saves = "disabled"',
      'kronos_usecache = "disabled"',
      'kronos_video_filter_type = "0"',
      'kronos_videoformattype = "auto"',
      'kronos_wireframe_mode = "disabled"',
    ],
  },
  // Unico core PS2 (lrpcs2/pcsx2_libretro): modalità toggle-options, non
  // swap-core. Preset preso di peso dal file .opt reale usato dall'utente
  // per Metal Gear Solid 3 - Snake Eater (stessa nota di Saturn sopra).
  ps2: {
    mode:            'toggle-options',
    core:            'pcsx2_libretro.so',
    coreDisplayName: 'LRPS2',
    optionLines: [
      'pcsx2_align_sprite = "disabled"',
      'pcsx2_analog_mode1 = "disabled"',
      'pcsx2_analog_mode2 = "disabled"',
      'pcsx2_anisotropic_filtering = "8x"',
      'pcsx2_auto_flush = "disabled"',
      'pcsx2_auto_flush_software = "enabled"',
      'pcsx2_axis_deadzone1 = "15%"',
      'pcsx2_axis_deadzone2 = "15%"',
      'pcsx2_axis_scale1 = "133%"',
      'pcsx2_axis_scale2 = "133%"',
      'pcsx2_bios = "ps2-0170a-20030325.bin"',
      'pcsx2_blending_accuracy = "Medium"',
      'pcsx2_button_deadzone1 = "0%"',
      'pcsx2_button_deadzone2 = "0%"',
      'pcsx2_cpu_sprite_level = "Sprites Only"',
      'pcsx2_cpu_sprite_size = "0"',
      'pcsx2_deinterlace_mode = "Automatic"',
      'pcsx2_dev9_eth = "disabled"',
      'pcsx2_dev9_hdd = "disabled"',
      'pcsx2_dev9_hdd_size = "40 GiB"',
      'pcsx2_disable_depth_conversion = "disabled"',
      'pcsx2_disable_interlace_offset = "disabled"',
      'pcsx2_disable_partial_invalidation = "disabled"',
      'pcsx2_dithering = "Unscaled"',
      'pcsx2_ee_accurate_fpu = "enabled"',
      'pcsx2_ee_cpu = "Recompiler"',
      'pcsx2_ee_cycle_rate = "100% (Normal Speed)"',
      'pcsx2_ee_cycle_skip = "disabled"',
      'pcsx2_enable_cheats = "disabled"',
      'pcsx2_enable_hw_hacks = "disabled"',
      'pcsx2_enable_rumble1 = "100%"',
      'pcsx2_enable_rumble2 = "100%"',
      'pcsx2_fastboot = "enabled"',
      'pcsx2_fastcdvd = "disabled"',
      'pcsx2_fastmem = "enabled"',
      'pcsx2_force_sprite_position = "disabled"',
      'pcsx2_fpu_softfloat = "disabled"',
      'pcsx2_framebuffer_conversion = "disabled"',
      'pcsx2_game_enhancements_hint = "disabled"',
      'pcsx2_gpu_palette_conversion = "disabled"',
      'pcsx2_gpu_target_clut = "disabled"',
      'pcsx2_half_pixel_offset = "disabled"',
      'pcsx2_hint_language_unlock = "disabled"',
      'pcsx2_hw_download_mode = "Accurate"',
      'pcsx2_instant_vu1 = "enabled"',
      'pcsx2_invert_left_stick1 = "disabled"',
      'pcsx2_invert_left_stick2 = "disabled"',
      'pcsx2_invert_right_stick1 = "disabled"',
      'pcsx2_invert_right_stick2 = "disabled"',
      'pcsx2_merge_sprite = "disabled"',
      'pcsx2_mtvu = "disabled"',
      'pcsx2_native_scaling = "disabled"',
      'pcsx2_nointerlacing_hint = "enabled"',
      'pcsx2_pcrtc_antiblur = "enabled"',
      'pcsx2_pcrtc_screen_offsets = "disabled"',
      'pcsx2_pgs_deblur = "disabled"',
      'pcsx2_pgs_disable_mipmaps = "disabled"',
      'pcsx2_pgs_high_res_scanout = "disabled"',
      'pcsx2_pgs_ss_tex = "disabled"',
      'pcsx2_pgs_ssaa = "Native"',
      'pcsx2_preload_frame_data = "disabled"',
      'pcsx2_renderer = "Auto"',
      'pcsx2_round_sprite = "disabled"',
      'pcsx2_shared_memory_cards = "enabled"',
      'pcsx2_software_clut_render = "disabled"',
      'pcsx2_texture_filtering = "Bilinear (PS2)"',
      'pcsx2_texture_inside_rt = "disabled"',
      'pcsx2_trilinear_filtering = "Automatic"',
      'pcsx2_uncapped_framerate_hint = "disabled"',
      'pcsx2_unscaled_palette_draw = "disabled"',
      'pcsx2_upscale_multiplier = "2x Native (~720p)"',
      'pcsx2_use_external_gameindex = "disabled"',
      'pcsx2_vu0_softfloat = "disabled"',
      'pcsx2_vu1_softfloat = "disabled"',
      'pcsx2_vu_accurate_addsub = "disabled"',
      'pcsx2_vu_exact_div = "disabled"',
      'pcsx2_vu_exact_mul = "disabled"',
      'pcsx2_widescreen_hint = "enabled (16:9)"',
    ],
  },
  // Dreamcast — unico core (flycast), modalità toggle-options come PS2
  // (nessuno swap: flycast è l'unico core libretro mantenuto per questo
  // sistema, vedi SYSTEM_MAP). Preset preso di peso da un file .opt REALE
  // per Sonic Adventure 2, dopo un primo giro sbagliato: la prima lista
  // fornita usava un prefisso `flycast_` che non esiste — flycast è un
  // fork di Reicast e ha mantenuto lo stesso namespace di opzioni
  // (`reicast_*`) per compatibilità, e più della metà delle chiavi di
  // quella lista non corrispondeva comunque a nessuna opzione reale del
  // core. Il file caricato dall'utente (generato da RetroArch stesso, non
  // scritto a mano) ha risolto l'ambiguità. Verbatim come per Saturn/PS2 —
  // confrontato col default (stesso .opt caricato dall'utente prima):
  // risoluzione interna 640x480→1920x1440, cavo TV→VGA, filtro
  // anisotropico 4→8, texture filtering 0→1, PVR2 filtering e widescreen
  // entrambi attivati.
  dreamcast: {
    mode:            'toggle-options',
    core:            'flycast_libretro.so',
    coreDisplayName: 'Flycast',
    optionLines: [
      'reicast_allow_service_buttons = "disabled"',
      'reicast_alpha_sorting = "per-triangle (normal)"',
      'reicast_analog_stick_deadzone = "15%"',
      'reicast_anisotropic_filtering = "8"',
      'reicast_auto_skip_frame = "disabled"',
      'reicast_broadcast = "NTSC"',
      'reicast_cable_type = "VGA"',
      'reicast_custom_textures = "disabled"',
      'reicast_dc_32mb_mod = "disabled"',
      'reicast_dcnet = "enabled"',
      'reicast_delay_frame_swapping = "enabled"',
      'reicast_detect_vsync_swap_interval = "disabled"',
      'reicast_device_port1_slot1 = "VMU"',
      'reicast_device_port1_slot2 = "Purupuru"',
      'reicast_device_port2_slot1 = "VMU"',
      'reicast_device_port2_slot2 = "Purupuru"',
      'reicast_device_port3_slot1 = "VMU"',
      'reicast_device_port3_slot2 = "Purupuru"',
      'reicast_device_port4_slot1 = "VMU"',
      'reicast_device_port4_slot2 = "Purupuru"',
      'reicast_digital_triggers = "disabled"',
      'reicast_dump_replaced_textures = "disabled"',
      'reicast_dump_textures = "disabled"',
      'reicast_emulate_bba = "disabled"',
      'reicast_emulate_framebuffer = "disabled"',
      'reicast_enable_dsp = "enabled"',
      'reicast_enable_rttb = "disabled"',
      'reicast_fix_upscale_bleeding_edge = "enabled"',
      'reicast_fog = "enabled"',
      'reicast_force_freeplay = "enabled"',
      'reicast_frame_skipping = "disabled"',
      'reicast_gdrom_fast_loading = "disabled"',
      'reicast_hle_bios = "disabled"',
      'reicast_internal_resolution = "1920x1440"',
      'reicast_language = "English"',
      'reicast_lightgun1_crosshair = "disabled"',
      'reicast_lightgun2_crosshair = "disabled"',
      'reicast_lightgun3_crosshair = "disabled"',
      'reicast_lightgun4_crosshair = "disabled"',
      'reicast_lightgun_crosshair_size_scaling = "100%"',
      'reicast_linked_vmu_storage = "disabled"',
      'reicast_mipmapping = "enabled"',
      'reicast_native_depth_interpolation = "disabled"',
      'reicast_network_output = "disabled"',
      'reicast_oit_abuffer_size = "512MB"',
      'reicast_oit_layers = "32"',
      'reicast_per_content_vmus = "disabled"',
      'reicast_preload_custom_textures = "disabled"',
      'reicast_pvr2_filtering = "enabled"',
      'reicast_region = "USA"',
      'reicast_screen_rotation = "horizontal"',
      'reicast_sh4clock = "200"',
      'reicast_show_lightgun_settings = "disabled"',
      'reicast_show_vmu_screen_settings = "disabled"',
      'reicast_texture_filtering = "1"',
      'reicast_texupscale = "1"',
      'reicast_texupscale_max_filtered_texture_size = "256"',
      'reicast_threaded_rendering = "enabled"',
      'reicast_trigger_deadzone = "0%"',
      'reicast_upnp = "enabled"',
      'reicast_vmu1_pixel_off_color = "DEFAULT_OFF 01"',
      'reicast_vmu1_pixel_on_color = "DEFAULT_ON 00"',
      'reicast_vmu1_screen_display = "disabled"',
      'reicast_vmu1_screen_opacity = "100%"',
      'reicast_vmu1_screen_position = "Upper Left"',
      'reicast_vmu1_screen_size_mult = "1x"',
      'reicast_vmu2_pixel_off_color = "DEFAULT_OFF 01"',
      'reicast_vmu2_pixel_on_color = "DEFAULT_ON 00"',
      'reicast_vmu2_screen_display = "disabled"',
      'reicast_vmu2_screen_opacity = "100%"',
      'reicast_vmu2_screen_position = "Upper Right"',
      'reicast_vmu2_screen_size_mult = "1x"',
      'reicast_vmu3_pixel_off_color = "DEFAULT_OFF 01"',
      'reicast_vmu3_pixel_on_color = "DEFAULT_ON 00"',
      'reicast_vmu3_screen_display = "disabled"',
      'reicast_vmu3_screen_opacity = "100%"',
      'reicast_vmu3_screen_position = "Lower Left"',
      'reicast_vmu3_screen_size_mult = "1x"',
      'reicast_vmu4_pixel_off_color = "DEFAULT_OFF 01"',
      'reicast_vmu4_pixel_on_color = "DEFAULT_ON 00"',
      'reicast_vmu4_screen_display = "disabled"',
      'reicast_vmu4_screen_opacity = "100%"',
      'reicast_vmu4_screen_position = "Lower Right"',
      'reicast_vmu4_screen_size_mult = "1x"',
      'reicast_vmu_sound = "disabled"',
      'reicast_volume_modifier_enable = "enabled"',
      'reicast_widescreen_cheats = "enabled"',
      'reicast_widescreen_hack = "enabled"',
    ],
  },
  // n64: da aggiungere quando verrà ripreso il lavoro. Userà mode:
  // 'toggle-options' (stessa logica di PS2/Dreamcast, confermato
  // dall'utente: core unico mupen64plus_next, nessuno swap con
  // parallel_n64) — ma le optionLines vanno prese da un .opt reale come
  // sopra, non assunte: ancora nessun riferimento verificato per questo
  // core.
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
  } catch (err) {
    writeLog('warning', `[CLASSIC] Scrittura preset auto-remaster (${canonicalSystem}) fallita (${optPath}): ${err}`);
  }
}

/**
 * Rimuove il file di override per-contenuto — SOLO per preset in modalità
 * 'toggle-options' (es. PS2), dove un solo core è sempre in uso e il file
 * stesso è l'interruttore: senza di esso il gioco ricade sulla
 * configurazione di default a livello di core (nessun override).
 *
 * Per i preset 'swap-core' (PSX/Saturn) questa funzione non va MAI chiamata
 * — lì disattivare significa cambiare core, non toccare il file (vedi
 * commento su writeRemasterOptions: potrebbe contenere modifiche manuali
 * dell'utente fatte dopo l'attivazione, che con swap-core restano
 * semplicemente inutilizzate finché non si riattiva). Per sicurezza la
 * funzione si rifiuta comunque di procedere se il preset non è in modalità
 * toggle-options, loggando un avviso invece di cancellare per errore.
 */
export function removeRemasterOptions(contentPath: string, canonicalSystem: string): void {
  const preset = REMASTER_PRESETS[canonicalSystem];
  if (!preset) return;
  if (preset.mode !== 'toggle-options') {
    writeLog('warning', `[CLASSIC] removeRemasterOptions chiamata su un preset 'swap-core' (${canonicalSystem}) — ignorata, il file non va rimosso in questa modalità.`);
    return;
  }

  const configHome = process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config');
  const optDir = path.join(configHome, 'retroarch', 'config', preset.coreDisplayName);
  const contentName = path.basename(contentPath, path.extname(contentPath));
  const optPath = path.join(optDir, `${contentName}.opt`);

  try {
    if (existsSync(optPath)) {
      unlinkSync(optPath);
      writeLog('info', `[CLASSIC] Preset auto-remaster (${canonicalSystem}) rimosso: ${optPath}`);
    }
  } catch (err) {
    writeLog('warning', `[CLASSIC] Rimozione preset auto-remaster (${canonicalSystem}) fallita (${optPath}): ${err}`);
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
        let children: string[];
        try {
          children = readdirSync(entryPath);
        } catch { continue; }

        const candidates: DiscCandidate[] = [];
        for (const child of children) {
          if (child === '.extracted') continue; // cache di estrazione, mai un candidato
          const childPath = path.join(entryPath, child);
          let childStat;
          try { childStat = statSync(childPath); } catch { continue; }
          if (childStat.isDirectory()) {
            // v2.1.11-dev.7 — cartella-gioco non zippata (dump sciolto,
            // tipico GDI Dreamcast): candidata solo se contiene un file
            // principale riconoscibile, altrimenti ignorata silenziosamente
            // (potrebbe essere qualunque altra cosa, non necessariamente un
            // gioco andato storto).
            if (findPrimaryDiscFile(childPath)) candidates.push({ name: child, kind: 'folder' });
          } else if (isRomFile(child)) {
            candidates.push({ name: child, kind: 'file' });
          }
        }

        const { singles, multiDisc } = groupDiscs(candidates, system.canonical);

        for (const candidate of singles) {
          if (candidate.kind === 'file') {
            const romPath = path.join(entryPath, candidate.name);
            games.push(this.buildGame(romPath, system, entry));
          } else {
            games.push(this.buildGameFromFolder(path.join(entryPath, candidate.name), system));
          }
        }
        for (const [baseTitle, discs] of multiDisc) {
          games.push(this.buildMultiDiscGame(baseTitle, discs, system, entryPath));
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
  // di RetroArch non gestisce allo stesso modo.
  //
  // v2.1.11-dev.8 — esteso a Dreamcast/PS2 (vedi commento su
  // CD_BASED_SYSTEMS più sopra): anche per un file singolo come .chd/.iso,
  // l'estrazione automatica di RetroArch dipende da `cache_directory` ed
  // è documentata come inconsistente se non configurato — meglio la
  // nostra estrazione persistente, verificata, uguale per tutti i sistemi
  // a disco ottico.
  private extractCdImageIfNeeded(romPath: string, canonicalSystem: string | undefined): string {
    if (!canonicalSystem || !CD_BASED_SYSTEMS.has(canonicalSystem)) return romPath;

    const systemDir   = path.dirname(romPath);
    const zipBaseName = path.basename(romPath, path.extname(romPath));

    // v1.1.105-dev.1 — spostato PRIMA di qualunque controllo sull'estensione
    // (prima era dopo un `if (!romPath.endsWith('.zip')) return romPath`,
    // quindi non scattava mai per .7z/.rar): se il gioco è già scompattato
    // — a mano o da una scansione precedente, qualunque fosse il formato
    // originale — non ha senso cercare di ri-decomprimere nulla.
    const manualMatch = findMatchingCueInDir(systemDir, zipBaseName);
    if (manualMatch) return manualMatch;

    // v1.1.105-dev.1 — utility-agnostic: quale estrattore usare (unzip,
    // 7z, in futuro altro) è deciso da archiveExtractors.ts, non più
    // hardcoded qui.
    const extractor = findExtractorFor(romPath);
    if (!extractor || !extractor.supported) return romPath;

    const extractDir = path.join(systemDir, '.extracted', zipBaseName);

    // Cache su disco: se già estratto in un giro precedente (file
    // principale già presente), non ripetere — l'estrazione di un'immagine
    // CD/DVD (centinaia di MB, anche 4+ GB per PS2) è sincrona e
    // bloccante, accettabile solo perché avviene una volta sola per
    // gioco, non ad ogni scansione della libreria.
    const cached = findPrimaryDiscFile(extractDir);
    if (cached) return cached;

    mkdirSync(extractDir, { recursive: true });
    const result = extractArchive(romPath, extractDir);
    if (result.success) {
      const found = findPrimaryDiscFile(extractDir);
      if (found) {
        writeLog('info', `[CLASSIC] Estratto ${path.basename(romPath)} → ${found}`);
        return found;
      }
      writeLog('warning', `[CLASSIC] Estrazione di ${path.basename(romPath)} riuscita ma nessun file principale (.gdi/.cue/.chd/.iso) trovato dentro — uso l'archivio originale (probabilmente non partirà).`);
      return romPath;
    }
    writeLog('warning', `[CLASSIC] Estrazione di ${path.basename(romPath)} fallita (${result.message}) — uso l'archivio originale.`);
    return romPath;
  }

  /**
   * v2.1.11-dev.7 — cartella-gioco non zippata (vedi findPrimaryDiscFile):
   * niente da estrarre, il file principale è già lì. Titolo preso dal nome
   * della cartella (non dal file interno — possono differire, es. una
   * cartella "Grandia II (USA)" con dentro sia .cue sia .gdi con lo stesso
   * stem, ma non è garantito in generale).
   */
  private buildGameFromFolder(folderPath: string, system: SystemInfo): Game {
    const primary = findPrimaryDiscFile(folderPath)!; // già verificato prima di candidare
    const title = titleFromFilename(folderPath);
    const id    = makeGameId(primary);
    return {
      id,
      title,
      store:         'Classic Console',
      runner:        system.runner as any,
      isInstalled:   true,
      playTimeHours: 0,
      coverImage:    '',
      previewImage:  '',
      description:   system.label ? `${system.label} — ROM` : 'Classic ROM',
      tags:          [system.label, 'Classic', 'Retro'].filter(Boolean),
      genres:        [system.genre],
      categories:    ['Single-player'],
      status:        'Ready to Launch',
      executablePath: primary,
      libretroCore:  system.core,
      system:        system.canonical,
    };
  }

  /**
   * v2.1.11-dev.6 — richiesta utente: un multi-disco reale diventa UN
   * solo Game (non uno per disco), lanciato tramite un .m3u generato
   * automaticamente accanto ai file/cartelle originali in systemDir. Ogni
   * riga del .m3u è il percorso RISOLTO del disco — se un disco è un file
   * zippato, estratto come per un singolo (extractCdImageIfNeeded); se è
   * una cartella non zippata (v2.1.11-dev.7), il file principale al suo
   * interno (findPrimaryDiscFile) — mai il file/cartella originale as-is:
   * RetroArch deve poter aprire ogni riga direttamente.
   *
   * Il file .m3u viene riscritto ad ogni scan (costo trascurabile, poche
   * righe di testo) invece di essere messo in cache, così un disco
   * aggiunto in un secondo momento (es. compri/scarichi il Disco 3 che
   * mancava) viene ripreso automaticamente al prossimo scan.
   */
  private buildMultiDiscGame(
    baseTitle: string,
    discs: { discNumber: number; candidate: DiscCandidate }[],
    system: SystemInfo,
    systemDir: string,
  ): Game {
    const resolvedPaths = discs.map(d => {
      const childPath = path.join(systemDir, d.candidate.name);
      return d.candidate.kind === 'file'
        ? this.extractCdImageIfNeeded(childPath, system.canonical)
        : (findPrimaryDiscFile(childPath) ?? childPath); // già verificato in candidatura, il ?? è solo difensivo
    });

    const m3uPath = path.join(systemDir, `${baseTitle}.m3u`);
    try {
      writeFileSync(m3uPath, resolvedPaths.join('\n') + '\n', 'utf-8');
    } catch (err) {
      writeLog('warning', `[CLASSIC] Scrittura .m3u multi-disco fallita per "${baseTitle}" (${m3uPath}): ${err}`);
    }

    const title = titleFromFilename(baseTitle);
    const id    = makeGameId(m3uPath);

    writeLog('info', `[CLASSIC] Multi-disco rilevato: "${title}" — ${discs.length} dischi → ${m3uPath}`);

    return {
      id,
      title,
      store:         'Classic Console',
      runner:        system.runner as any,
      isInstalled:   true,
      playTimeHours: 0,
      coverImage:    '',
      previewImage:  '',
      description:   system.label ? `${system.label} — ROM (${discs.length} dischi)` : 'Classic ROM',
      tags:          [system.label, 'Classic', 'Retro'].filter(Boolean),
      genres:        [system.genre],
      categories:    ['Single-player'],
      status:        'Ready to Launch',
      executablePath: m3uPath,
      libretroCore:  system.core,
      system:        system.canonical,
    };
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
