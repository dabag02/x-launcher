/**
 * SteamPlugin — legge i file .acf in ~/.local/share/Steam/steamapps/ per i
 * giochi installati, loginusers.vdf per l'utente attivo. Ore di gioco via
 * Steam Web API (opzionale, richiede STEAM_API_KEY + STEAM_ID nel .env).
 * Lancio sempre via steam://rungameid/<appId> — Proton gestito da Steam
 * nativo. Se Steam non è installato, array vuoto + log di avviso.
 * "Apri Steam Big Picture" è una voce separata gestita dal server.
 */

import { StorePlugin } from './base';
import { writeLog } from '../logger';
import { estimateInstallDate } from '../installDate';
import { Game } from '../../types';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Percorsi Steam standard su Linux
// ---------------------------------------------------------------------------

const STEAM_ROOTS = [
  path.join(homedir(), '.local', 'share', 'Steam'),
  path.join(homedir(), '.steam', 'steam'),
  path.join(homedir(), '.steam', 'debian-installation'),
  '/usr/share/steam',
];

const COVER_PLACEHOLDER = 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=400&h=533';
const PREVIEW_PLACEHOLDER = 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=800&h=450';

// ---------------------------------------------------------------------------
// Parser VDF minimale (formato Valve KeyValue usato nei file .acf/.vdf)
// Non usiamo librerie esterne per non aggiungere dipendenze.
// ---------------------------------------------------------------------------

export function parseVdf(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = content.split('\n');
  const stack: Record<string, any>[] = [result];
  let currentKey = '';

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('//')) continue;

    // Apre un nuovo blocco
    if (line === '{') {
      const newBlock: Record<string, any> = {};
      stack[stack.length - 1][currentKey] = newBlock;
      stack.push(newBlock);
      continue;
    }

    // Chiude un blocco
    if (line === '}') {
      stack.pop();
      continue;
    }

    // Coppia chiave-valore: "key" "value"
    const match = line.match(/^"([^"]+)"\s+"([^"]*)"$/);
    if (match) {
      stack[stack.length - 1][match[1]] = match[2];
      continue;
    }

    // Chiave senza valore (blocco annidato): "key"
    const keyMatch = line.match(/^"([^"]+)"$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Lettura librerie aggiuntive da libraryfolders.vdf
// ---------------------------------------------------------------------------

export function findSteamRoot(): string | null {
  return STEAM_ROOTS.find(p => existsSync(path.join(p, 'steamapps'))) ?? null;
}

export function findAllLibraryPaths(steamRoot: string): string[] {
  const paths: string[] = [path.join(steamRoot, 'steamapps')];

  const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  if (!existsSync(vdfPath)) return paths;

  try {
    const parsed = parseVdf(readFileSync(vdfPath, 'utf-8'));
    // Formato nuovo: { libraryfolders: { "0": { path: "..." }, "1": { path: "..." } } }
    const folders = parsed['libraryfolders'] ?? parsed['LibraryFolders'] ?? {};
    for (const key of Object.keys(folders)) {
      if (isNaN(Number(key))) continue;
      const entry = folders[key];
      const folderPath = typeof entry === 'object' ? entry['path'] : entry;
      if (folderPath && existsSync(folderPath)) {
        const libPath = path.join(folderPath, 'steamapps');
        if (!paths.includes(libPath)) paths.push(libPath);
      }
    }
  } catch { /* vdf malformato, ignoriamo */ }

  return paths;
}

// ---------------------------------------------------------------------------
// Lettura Steam ID utente attivo da loginusers.vdf
// ---------------------------------------------------------------------------

function getActiveSteamId(steamRoot: string): string | null {
  const vdfPath = path.join(steamRoot, 'config', 'loginusers.vdf');
  if (!existsSync(vdfPath)) return null;

  try {
    const parsed = parseVdf(readFileSync(vdfPath, 'utf-8'));
    const users = parsed['users'] ?? parsed['Users'] ?? {};
    // Prende il primo utente con MostRecent = "1", altrimenti il primo disponibile
    let fallback: string | null = null;
    for (const [steamId, data] of Object.entries(users) as [string, any][]) {
      if (!fallback) fallback = steamId;
      if (data?.MostRecent === '1' || data?.mostrecent === '1') return steamId;
    }
    return fallback;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Lettura ore di gioco via Steam Web API (opzionale)
// ---------------------------------------------------------------------------

interface SteamGetOwnedGamesResponse {
  response?: {
    game_count?: number;
    games?: Array<{ appid: number; playtime_forever?: number }>;
  };
}

async function fetchPlaytimeMap(steamId: string, apiKey: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_played_free_games=1&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return map;
    const data = await res.json() as SteamGetOwnedGamesResponse;
    for (const game of data?.response?.games ?? []) {
      map.set(String(game.appid), (game.playtime_forever ?? 0) / 60);
    }
  } catch { /* API non raggiungibile o chiave non valida */ }
  return map;
}

// ---------------------------------------------------------------------------
// v3.2.17-dev.4 — ore di gioco dal file locale del client Steam
// ---------------------------------------------------------------------------
//
// userdata/<accountId>/config/localconfig.vdf, ramo
// UserLocalConfigStore > Software > Valve > Steam > apps > <appid>:
//   "Playtime"   minuti totali  (aggiornato da Steam alla CHIUSURA del gioco)
//   "LastPlayed" epoch secondi  (aggiornato all'avvio e alla chiusura)
// Verificato sull'HTPC dell'utente (Limbo, 48000): Playtime fermo durante la
// sessione, +5 alla chiusura del gioco con Steam ancora aperto. Nessuna chiave
// API, funziona anche offline — diventa la fonte principale; la Web API resta
// come seconda fonte se configurata (vince il valore più alto dei due).

/** accountId (cartella userdata) dallo SteamID64: id64 - 76561197960265728. */
function accountIdFromSteamId64(steamId64: string): string | null {
  try {
    const id = BigInt(steamId64) - 76561197960265728n;
    return id > 0n ? id.toString() : null;
  } catch { return null; }
}

/**
 * Percorso di localconfig.vdf dell'utente: quello dell'account indicato (STEAM_ID
 * o utente MostRecent di loginusers.vdf) se esiste, altrimenti il più recente fra
 * quelli presenti (un solo account nella norma).
 */
export function findLocalConfigPath(steamRoot: string, steamId64?: string | null): string | null {
  const userdata = path.join(steamRoot, 'userdata');
  if (!existsSync(userdata)) return null;
  const preferred = steamId64 ? accountIdFromSteamId64(steamId64) : null;
  if (preferred) {
    const p = path.join(userdata, preferred, 'config', 'localconfig.vdf');
    if (existsSync(p)) return p;
  }
  let best: { p: string; mtime: number } | null = null;
  try {
    for (const dir of readdirSync(userdata)) {
      if (!/^\d+$/.test(dir) || dir === '0') continue;
      const p = path.join(userdata, dir, 'config', 'localconfig.vdf');
      try {
        const m = statSync(p).mtimeMs;
        if (!best || m > best.mtime) best = { p, mtime: m };
      } catch { /* account senza localconfig */ }
    }
  } catch { /* userdata non leggibile */ }
  return best?.p ?? null;
}

/** Ricerca di una chiave senza distinzione maiuscole/minuscole (Steam usa sia "apps" sia "Apps"). */
function ciGet(obj: any, key: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  const k = Object.keys(obj).find(x => x.toLowerCase() === key.toLowerCase());
  return k ? obj[k] : undefined;
}

/** appid → ore di gioco lette da localconfig.vdf (mappa vuota se il file manca o non si legge). */
export function readLocalPlaytimeMap(localConfigPath: string | null): Map<string, number> {
  const map = new Map<string, number>();
  if (!localConfigPath) return map;
  try {
    const parsed = parseVdf(readFileSync(localConfigPath, 'utf-8'));
    let node: any = ciGet(parsed, 'UserLocalConfigStore');
    for (const k of ['Software', 'Valve', 'Steam', 'apps']) node = ciGet(node, k);
    if (!node || typeof node !== 'object') return map;
    for (const [appId, data] of Object.entries(node) as [string, any][]) {
      const minutes = Number(ciGet(data, 'Playtime'));
      if (/^\d+$/.test(appId) && Number.isFinite(minutes) && minutes > 0) map.set(appId, minutes / 60);
    }
  } catch (err) {
    writeLog('warning', `[STEAM] Cannot read local playtime from ${localConfigPath}: ${err}`);
  }
  return map;
}

/** Steam ID attivo (STEAM_ID del .env o loginusers.vdf) — esportato per il watcher in gameManager. */
export function resolveSteamId(steamRoot: string): string | null {
  return process.env.STEAM_ID || getActiveSteamId(steamRoot);
}

// ---------------------------------------------------------------------------
// Lettura copertine dalla cache locale di Steam
// ---------------------------------------------------------------------------

function getLocalCover(steamRoot: string, appId: string): string {
  const candidates = [
    path.join(steamRoot, 'appcache', 'librarycache', `${appId}_library_600x900.jpg`),
    path.join(steamRoot, 'appcache', 'librarycache', `${appId}_header.jpg`),
    path.join(steamRoot, 'appcache', 'librarycache', `${appId}_library_hero.jpg`),
  ];
  // Non possiamo servire file locali direttamente al browser in produzione,
  // usiamo la CDN pubblica di Steam che non richiede auth per le copertine
  return `https://cdn.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export class SteamPlugin extends StorePlugin {
  readonly id          = 'Steam' as const;
  readonly name        = 'Steam';
  readonly isPublic    = true;
  readonly drmFree     = false;  // Steam richiede il client attivo
  readonly description = 'Libreria Steam — legge i file .acf locali';
  readonly requiredTool = 'steam';

  async isAuthenticated(): Promise<boolean> {
    return findSteamRoot() !== null;
  }

  async login() {
    const root = findSteamRoot();
    if (!root) {
      return { success: false, message: 'Steam non installato o cartella non trovata.' };
    }
    return { success: true, message: `Steam trovato in ${root}` };
  }

  async getLibrary(): Promise<Game[]> {
    const steamRoot = findSteamRoot();
    if (!steamRoot) {
      writeLog('info', '[STEAM] Client not found — returning empty array.');
      return [];
    }

    // Ore di gioco via API (opzionale)
    const apiKey  = process.env.STEAM_API_KEY ?? '';
    const steamId = process.env.STEAM_ID ?? getActiveSteamId(steamRoot) ?? '';
    let playtimeMap = new Map<string, number>();
    if (apiKey && steamId) {
      writeLog('info', '[STEAM] Fetching playtime via Web API...');
      playtimeMap = await fetchPlaytimeMap(steamId, apiKey);
    }
    // v3.2.17-dev.4 — ore dal file locale del client (vedi readLocalPlaytimeMap):
    // vince il valore più alto fra file locale e Web API (la Web API può essere
    // indietro di qualche minuto, il file locale non c'è se Steam non è mai
    // stato avviato con questo account).
    const localConfig = findLocalConfigPath(steamRoot, steamId);
    const localPlaytime = readLocalPlaytimeMap(localConfig);
    writeLog('info', `[STEAM] Local playtime: ${localPlaytime.size} games from ${localConfig ?? 'no localconfig.vdf found'}`);
    for (const [appId, hours] of localPlaytime) {
      if (hours > (playtimeMap.get(appId) ?? 0)) playtimeMap.set(appId, hours);
    }

    // Leggi tutte le librerie (disco principale + dischi aggiuntivi)
    const libraryPaths = findAllLibraryPaths(steamRoot);
    const games: Game[] = [];

    for (const libPath of libraryPaths) {
      if (!existsSync(libPath)) continue;

      let acfFiles: string[];
      try {
        acfFiles = readdirSync(libPath).filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'));
      } catch { continue; }

      for (const acfFile of acfFiles) {
        try {
          const content = readFileSync(path.join(libPath, acfFile), 'utf-8');
          const parsed  = parseVdf(content);
          const app     = parsed['AppState'] ?? parsed['appstate'] ?? {};

          const appId  = app['appid']  ?? app['AppID']  ?? '';
          const name   = app['name']   ?? app['Name']   ?? '';
          const state  = parseInt(app['StateFlags'] ?? '0', 10);

          if (!appId || !name) continue;

          // Filtra tool, runtime e redistribuibili Steam — non sono giochi
          // Criteri: nome che inizia con parole chiave note, o appId nei range riservati
          const nameLower = name.toLowerCase();
          const isSteamTool =
            nameLower.startsWith('proton') ||
            nameLower.startsWith('steam linux runtime') ||
            nameLower.startsWith('steamworks') ||
            nameLower.startsWith('steam vr') ||
            nameLower.startsWith('steamvr') ||
            nameLower.includes('redistributable') ||
            nameLower.includes('sdk') ||
            nameLower === 'steam linux runtime';
          if (isSteamTool) continue;

          // StateFlags: bit 2 (4) = completamente installato
          const isInstalled = (state & 4) === 4;

          const sizeOnDisk  = parseInt(app['SizeOnDisk']  ?? '0', 10);
          const lastPlayed  = parseInt(app['LastPlayed']  ?? '0', 10);
          // v3.2.17-dev.2 — data di installazione: creazione (birthtime)
          // della cartella del gioco in steamapps/common/<installdir>.
          // Prima si usava LastUpdated del manifest, che è la data
          // dell'ultimo AGGIORNAMENTO: un gioco installato anni fa e
          // aggiornato ieri finiva in cima all'ordinamento "Installazione".
          // LastUpdated resta solo come ripiego se la cartella non c'è.
          const installDir  = app['installdir'] ?? app['InstallDir'] ?? '';
          const lastUpdated = parseInt(app['LastUpdated'] ?? '0', 10);
          const installedAt = isInstalled
            ? (estimateInstallDate([installDir ? path.join(libPath, 'common', installDir) : undefined])
               ?? (lastUpdated > 0 ? new Date(lastUpdated * 1000).toISOString() : undefined))
            : undefined;

          const playHours = playtimeMap.get(appId) ?? 0;

          games.push({
            id:            `steam-${appId}`,
            title:         name,
            store:         'Steam',
            // Il runner è sempre "steam-native": il lancio usa steam:// URI
            runner:        'Steam Native',
            isInstalled,
            playTimeHours: playHours,
            coverImage:    getLocalCover(steamRoot, appId),
            previewImage:  `https://cdn.steamstatic.com/steam/apps/${appId}/header.jpg`,
            description:   '',
            tags:          [],
            status:        isInstalled ? 'Ready to Launch' : 'Not Installed',
            steamAppId:    appId,
            installedAt,
          });

        } catch { /* file .acf corrotto, saltiamo */ }
      }
    }

    writeLog('info', `[STEAM] ${games.length} titles found across ${libraryPaths.length} libraries.`);
    return games;
  }

  async installGame(gameId: string) {
    // Delega a Steam tramite URI
    const appId = gameId.replace('steam-', '');
    const { spawn } = await import('child_process');
    spawn('steam', [`steam://install/${appId}`], { detached: true, stdio: 'ignore' }).unref();
    return { success: true };
  }

  async uninstallGame(gameId: string) {
    const appId = gameId.replace('steam-', '');
    const { spawn } = await import('child_process');
    spawn('steam', [`steam://uninstall/${appId}`], { detached: true, stdio: 'ignore' }).unref();
    return { success: true };
  }
}
