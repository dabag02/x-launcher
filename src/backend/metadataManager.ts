/**
 * MetadataManager — Step 9
 *
 * Fonti API reali:
 *
 * 1. SteamGridDB (cover art)
 *    - API key gratuita da https://www.steamgriddb.com/profile/preferences/api
 *    - Cerca per titolo → restituisce cover portrait (600x900) e hero (1920x620)
 *    - Env: STEAMGRIDDB_API_KEY
 *    - Usata per GOG, Epic, Classic — Steam usa già la CDN nativa
 *
 * 2. IGDB (rating, generi, descrizione, data uscita)
 *    - Client ID + Secret gratuiti da https://dev.twitch.tv/console
 *    - OAuth2 con client_credentials (token cached in memoria, dura 60gg)
 *    - Env: IGDB_CLIENT_ID, IGDB_CLIENT_SECRET
 *
 * 3. HowLongToBeat (ore completamento)
 *    - Nessuna API key — scraping via API non ufficiale
 *    - Pacchetto npm: howlongtobeat (già in package.json se installato)
 *    - Fallback: skip silenzioso se il pacchetto non è disponibile
 *
 * Strategia di caching:
 *    - Cache in memoria per la sessione corrente (come prima)
 *    - I dati vengono scritti nel DB SQLite tramite updateGameConfig
 *      così sopravvivono ai riavvii (cover, rating, generi)
 *    - Se un gioco ha già coverImage != placeholder nel DB, non viene
 *      ri-fetchato (evita chiamate API ad ogni avvio)
 *
 * Rate limiting:
 *    - Le chiamate API sono fatte in modo lazy (solo quando il gioco
 *      viene visualizzato o arricchito) — MAI in batch al boot
 *    - Coda con concorrenza massima 3 richieste parallele
 *    - Delay 200ms tra richieste consecutive allo stesso provider
 *
 * Fallback:
 *    - Se le API non sono configurate (no env vars) → dati deterministici
 *      basati sull'ID (come Step 8, nessun random)
 *    - Se una chiamata fallisce → silenzioso, si riprova al prossimo avvio
 */

import { Game } from '../types';
import { existsSync } from 'fs';
import { writeLog } from './logger';
import { webArtUrl, isWebArtUrl } from './webArt';
import { webStreamPlaceholderImages } from './plugins/amazonPlugin';

// ---------------------------------------------------------------------------
// Costanti
// ---------------------------------------------------------------------------

const SGDB_BASE    = 'https://www.steamgriddb.com/api/v2';
const IGDB_BASE    = 'https://api.igdb.com/v4';
const TWITCH_TOKEN = 'https://id.twitch.tv/oauth2/token';

const COVER_PLACEHOLDER   = 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=400&h=533';
const PREVIEW_PLACEHOLDER = 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=800&h=450';

const MAX_CONCURRENT = 3;
const REQUEST_DELAY  = 200; // ms tra richieste

// ---------------------------------------------------------------------------
// Env vars
// ---------------------------------------------------------------------------

const SGDB_KEY        = process.env.STEAMGRIDDB_API_KEY ?? '';
const IGDB_CLIENT_ID  = process.env.IGDB_CLIENT_ID      ?? '';
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET ?? '';

// ---------------------------------------------------------------------------
// Token IGDB (OAuth2 client_credentials — dura ~60 giorni)
// ---------------------------------------------------------------------------

let igdbToken: string | null = null;
let igdbTokenExpiry = 0;

async function getIgdbToken(): Promise<string | null> {
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) return null;
  if (igdbToken && Date.now() < igdbTokenExpiry) return igdbToken;

  try {
    const res = await fetch(
      `${TWITCH_TOKEN}?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: 'POST', signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; expires_in: number };
    igdbToken = data.access_token;
    igdbTokenExpiry = Date.now() + (data.expires_in - 3600) * 1000;
    return igdbToken;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SteamGridDB — cover art
// ---------------------------------------------------------------------------

interface SgdbGame { id: number; name: string; }
interface SgdbImage { url: string; thumb: string; width: number; height: number; }

async function sgdbSearchGame(title: string): Promise<number | null> {
  if (!SGDB_KEY) return null;
  try {
    const res = await fetch(
      `${SGDB_BASE}/search/autocomplete/${encodeURIComponent(title)}`,
      { headers: { Authorization: `Bearer ${SGDB_KEY}` }, signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { success: boolean; data: SgdbGame[] };
    return data.success && data.data.length > 0 ? data.data[0].id : null;
  } catch { return null; }
}

// v3.2.17-dev.9 — ricerca SteamGridDB con corrispondenza ESATTA del nome
// (maiuscole, spazi e punteggiatura ignorati), per le card Web Stream:
// sgdbSearchGame prende il primo risultato dell'autocompletamento, che per
// "Amazon Luna" potrebbe essere un qualunque gioco con "Luna" nel titolo.
async function sgdbSearchGameExact(title: string): Promise<number | null> {
  if (!SGDB_KEY) return null;
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
  try {
    const res = await fetch(
      `${SGDB_BASE}/search/autocomplete/${encodeURIComponent(title)}`,
      { headers: { Authorization: `Bearer ${SGDB_KEY}` }, signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { success: boolean; data: SgdbGame[] };
    if (!data.success) return null;
    const hit = data.data.find(g => norm(g.name) === norm(title));
    writeLog('info', `[METADATA] SGDB exact search "${title}": ${data.data.length} results, ${hit ? `match "${hit.name}" (id ${hit.id})` : 'no exact match'}`);
    return hit ? hit.id : null;
  } catch { return null; }
}

async function sgdbGetCover(gameId: number): Promise<{ coverImage: string; previewImage: string } | null> {
  if (!SGDB_KEY) return null;
  try {
    // Prende poster (portrait 600x900) e hero (landscape 1920x620) in parallelo
    const [posterRes, heroRes] = await Promise.all([
      fetch(`${SGDB_BASE}/grids/game/${gameId}?dimensions=600x900,460x215,342x482&limit=1`, {
        headers: { Authorization: `Bearer ${SGDB_KEY}` }, signal: AbortSignal.timeout(8_000)
      }),
      fetch(`${SGDB_BASE}/heroes/game/${gameId}?limit=1`, {
        headers: { Authorization: `Bearer ${SGDB_KEY}` }, signal: AbortSignal.timeout(8_000)
      }),
    ]);

    const posterData = posterRes.ok
      ? await posterRes.json() as { success: boolean; data: SgdbImage[] }
      : null;
    const heroData = heroRes.ok
      ? await heroRes.json() as { success: boolean; data: SgdbImage[] }
      : null;

    const cover   = posterData?.success && posterData.data.length > 0 ? posterData.data[0].url : null;
    const hero    = heroData?.success   && heroData.data.length   > 0 ? heroData.data[0].url   : null;

    if (!cover && !hero) return null;
    return {
      coverImage:   cover   ?? hero   ?? COVER_PLACEHOLDER,
      previewImage: hero    ?? cover  ?? PREVIEW_PLACEHOLDER,
    };
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// IGDB — rating, generi, descrizione, data uscita
// ---------------------------------------------------------------------------

interface IgdbGame {
  name: string;
  summary?: string;
  rating?: number;
  first_release_date?: number;
  genres?: { name: string }[];
  game_modes?: { name: string }[];
  involved_companies?: { company: { name: string }; developer: boolean }[];
  cover?: { url: string };
}

async function igdbSearch(title: string): Promise<IgdbGame | null> {
  const token = await getIgdbToken();
  if (!token) return null;

  try {
    const body = `search "${title.replace(/"/g, '')}"; fields name,summary,rating,first_release_date,genres.name,game_modes.name,cover.url; limit 1;`;
    const res = await fetch(`${IGDB_BASE}/games`, {
      method: 'POST',
      headers: {
        'Client-ID': IGDB_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as IgdbGame[];
    return data.length > 0 ? data[0] : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// v3.2.29-dev.17 — sfondo degli spazi (spaceBackground.ts): immagine ad alta risoluzione per il
// desktop dello spazio di un gioco. Prima un artwork 16:9 di IGDB (key art ufficiale, il più largo
// fra quelli con proporzioni fra 1,5 e 2,0), poi un hero di SteamGridDB a 3840×1240 o 1920×620.
// ---------------------------------------------------------------------------

export type SpaceArtwork = { url: string; source: 'igdb' | 'sgdb'; width: number; height: number };

async function igdbArtwork(title: string): Promise<SpaceArtwork | null> {
  const token = await getIgdbToken();
  if (!token) return null;
  try {
    const body = `search "${title.replace(/"/g, '')}"; fields name,artworks.image_id,artworks.width,artworks.height; limit 1;`;
    const res = await fetch(`${IGDB_BASE}/games`, {
      method: 'POST',
      headers: { 'Client-ID': IGDB_CLIENT_ID, 'Authorization': `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { artworks?: { image_id: string; width?: number; height?: number }[] }[];
    const arts = (data[0]?.artworks ?? []).filter(a => a.image_id && a.width && a.height
      && a.width / a.height >= 1.5 && a.width / a.height <= 2.0 && a.width >= 1280);
    if (!arts.length) return null;
    const best = arts.sort((x, y) => (y.width ?? 0) - (x.width ?? 0))[0];
    // t_original oltre i 4K può superare il limite di dimensione del file: lì basta il 1080p
    const size = (best.width ?? 0) <= 3840 ? 't_original' : 't_1080p';
    return { url: `https://images.igdb.com/igdb/image/upload/${size}/${best.image_id}.jpg`, source: 'igdb',
      width: size === 't_original' ? best.width! : 1920, height: size === 't_original' ? best.height! : Math.round(1920 * best.height! / best.width!) };
  } catch { return null; }
}

async function sgdbHeroHiRes(title: string): Promise<SpaceArtwork | null> {
  if (!SGDB_KEY) return null;
  const id = await sgdbSearchGame(title);
  if (!id) return null;
  try {
    const res = await fetch(`${SGDB_BASE}/heroes/game/${id}?dimensions=3840x1240,1920x620&limit=5`, {
      headers: { Authorization: `Bearer ${SGDB_KEY}` }, signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { success: boolean; data: SgdbImage[] };
    if (!data.success || !data.data.length) return null;
    const best = data.data.slice().sort((x, y) => (y.width ?? 0) - (x.width ?? 0))[0];
    return { url: best.url, source: 'sgdb', width: best.width, height: best.height };
  } catch { return null; }
}

/** Immagine per lo sfondo dello spazio di un gioco: IGDB 16:9, poi hero di SteamGridDB. null se nessuna. */
export async function findSpaceArtwork(title: string): Promise<SpaceArtwork | null> {
  return (await igdbArtwork(title)) ?? (await sgdbHeroHiRes(title));
}

// ---------------------------------------------------------------------------
// HowLongToBeat — ore completamento (opzionale)
// ---------------------------------------------------------------------------

async function hltbSearch(title: string): Promise<{ main: number; completionist: number } | null> {
  try {
    // howlongtobeat è un pacchetto opzionale — se non installato skippa silenziosamente
    const { HowLongToBeatService } = await import('howlongtobeat');
    const service = new HowLongToBeatService();
    const results = await service.search(title);
    if (!results || results.length === 0) return null;
    const r = results[0];
    return {
      main:          Math.round((r.gameplayMain         ?? 0)),
      completionist: Math.round((r.gameplayCompletionist ?? 0)),
    };
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Coda con concorrenza limitata
// ---------------------------------------------------------------------------

class RequestQueue {
  private running = 0;
  private queue: (() => Promise<void>)[] = [];

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await fn()); }
        catch (err) { reject(err); }
        finally {
          this.running--;
          this.next();
        }
      });
      this.next();
    });
  }

  private next() {
    if (this.running >= MAX_CONCURRENT || this.queue.length === 0) return;
    this.running++;
    const task = this.queue.shift()!;
    setTimeout(() => task(), REQUEST_DELAY);
  }
}

const requestQueue = new RequestQueue();

// ---------------------------------------------------------------------------
// Dati deterministici di fallback (no API key configurata)
// ---------------------------------------------------------------------------

function deterministicFallback(game: Game): Partial<Game> {
  const seed = game.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const allGenres = ['Action', 'RPG', 'Adventure', 'Strategy', 'Simulation', 'Shooter', 'Platformer', 'Indie'];
  return {
    rating:    75 + (seed % 25),
    genres:    [allGenres[seed % allGenres.length]],
    hltbHours: { main: 10 + (seed % 40), completionist: 50 + (seed % 80) },
    achievements: { unlocked: seed % 20, total: 50 },
  };
}

// ---------------------------------------------------------------------------
// MetadataManager principale
// ---------------------------------------------------------------------------

// Cover già reali nei plugin che le forniscono direttamente (Steam, Epic)
function hasRealCover(game: Game): boolean {
  return !!(
    game.coverImage &&
    game.coverImage !== COVER_PLACEHOLDER &&
    !game.coverImage.includes('unsplash.com')
  );
}

function hasRealMetadata(game: Game): boolean {
  return !!(game.rating && game.rating > 0 && game.genres?.length);
}

class MetadataManager {
  private cache = new Map<string, Game>();

  /**
   * @param force Salta sia la cache in memoria sia lo skip "ha già
   * metadati reali" — usato dal rifetch immediato dopo un override
   * manuale del titolo di ricerca (scrapeTitle), dove il gioco potrebbe
   * già avere un cover/rating (sbagliati, dallo scraping automatico col
   * nome ROM) che altrimenti farebbero saltare del tutto il nuovo fetch.
   */
  private async enrichWebStreamImages(game: Game, force: boolean): Promise<Game> {
    const enriched = { ...game };
    const localCover = webArtUrl(game.id, 'cover');
    const localHero  = webArtUrl(game.id, 'hero');
    if (localCover || localHero) {
      enriched.coverImage   = localCover ?? localHero!;
      enriched.previewImage = localHero  ?? localCover!;
      return enriched;
    }
    const placeholder = (src?: string) => !src || src.startsWith('data:') || isWebArtUrl(src);
    const searchTitle = (game.scrapeTitle || game.title).trim();
    if (SGDB_KEY && (force || placeholder(game.coverImage) || placeholder(game.previewImage))) await requestQueue.add(async () => {
      const id = await sgdbSearchGameExact(searchTitle);
      const images = id ? await sgdbGetCover(id) : null;
      if (images) {
        enriched.coverImage   = images.coverImage;
        enriched.previewImage = images.previewImage;
        writeLog('info', `[METADATA] ✅ Cover SGDB (Web Stream): ${searchTitle}`);
      }
    });
    // Immagini locali tolte e niente da SGDB: si torna al segnaposto del plugin,
    // invece di lasciare un URL /api/web-art/... che ora risponde 404.
    if (isWebArtUrl(enriched.coverImage) || isWebArtUrl(enriched.previewImage)) {
      const ph = webStreamPlaceholderImages(game.id);
      if (ph) {
        if (isWebArtUrl(enriched.coverImage))   enriched.coverImage   = ph.coverImage;
        if (isWebArtUrl(enriched.previewImage)) enriched.previewImage = ph.previewImage;
      }
    }
    return enriched;
  }

  async enrichGameMetadata(game: Game, force = false): Promise<Game> {
    // v3.2.17-dev.8/dev.9 — card Web Stream (Amazon Luna): mai IGDB (voto, generi e
    // descrizione di un titolo omonimo sarebbero sbagliati). Immagini, in ordine:
    //   1. file dell'utente in ~/.local/share/x-launcher/web-art/<id>/ (webArt.ts);
    //   2. SteamGridDB con corrispondenza esatta del nome (titolo per lo scraping
    //      o titolo della card), solo se la copertina è ancora il segnaposto del
    //      plugin o un'immagine locale non più presente, oppure con force;
    //   3. il segnaposto del plugin.
    if (game.runner === 'Web Stream') return this.enrichWebStreamImages(game, force);
    // v1.1.27 — CAUSA REALE trovata nei log: prima, un cache-hit
    // restituiva l'INTERO oggetto cacheato — inclusi isInstalled,
    // executablePath, status e ogni altro campo VOLATILE che non ha
    // nulla a che fare con l'arricchimento metadati (cover, rating,
    // generi, descrizione). La cache è pensata per evitare ri-fetch
    // inutili di dati esterni (SGDB/IGDB), non per "congelare" lo stato
    // di installazione al momento della prima chiamata. Un gioco
    // disinstallato DOPO essere stato arricchito una prima volta veniva
    // rimesso "installato" con il vecchio executablePath ad ogni
    // successivo refreshLibrary() — non un problema di scrittura DB
    // (le protezioni v1.1.23/v1.1.26 restano corrette e necessarie per
    // altri casi), ma di un dato in INGRESSO già sbagliato, che nessuna
    // protezione a valle poteva riconoscere come tale.
    if (force) {
      this.cache.delete(game.id);
    } else if (this.cache.has(game.id)) {
      const cached = this.cache.get(game.id)!;
      // Solo i campi che questa funzione arricchisce davvero — tutto il
      // resto (isInstalled, executablePath, status, prefixPath,
      // launchArgs, runner, playTimeHours...) viene SEMPRE dal `game`
      // fresco appena passato, mai dalla cache.
      return {
        ...game,
        coverImage:   cached.coverImage,
        previewImage: cached.previewImage,
        rating:       cached.rating,
        genres:       cached.genres,
        description:  cached.description,
        releaseDate:  cached.releaseDate,
        hltbHours:    cached.hltbHours,
        achievements: cached.achievements,
      };
    }

    // Se il gioco ha già metadati reali (rating + generi) e cover reale nel DB,
    // non ri-fetchiamo — risparmia chiamate API ad ogni riavvio del daemon
    if (!force && hasRealMetadata(game) && hasRealCover(game)) {
      this.cache.set(game.id, game);
      return game;
    }

    const enriched = { ...game };
    const apisConfigured = !!(SGDB_KEY || (IGDB_CLIENT_ID && IGDB_CLIENT_SECRET));

    if (!apisConfigured) {
      // Nessuna API key — usa fallback deterministici senza log spam
      const fallback = deterministicFallback(game);
      if (!enriched.rating)          enriched.rating       = fallback.rating;
      if (!enriched.genres?.length)  enriched.genres       = fallback.genres;
      if (!enriched.hltbHours)       enriched.hltbHours    = fallback.hltbHours;
      if (!enriched.achievements)    enriched.achievements = fallback.achievements;
      this.cache.set(game.id, enriched);
      return enriched;
    }

    // API configurate — fetch asincrono in coda
    await requestQueue.add(async () => {
      // Normalizza il titolo per le ricerche: rimuove suffissi di regione ROM
      // es. "Alex Kidd in Miracle World (USA, Europe)" → "Alex Kidd in Miracle World"
      // Richiesta utente — scrapeTitle: override manuale per ROM con nome
      // file poco significativo (es. MAME "gngt.zip"), o per qualunque
      // gioco dove lo scraping automatico sul titolo normale non trova
      // nulla o sbaglia abbinamento. Ha sempre precedenza su game.title
      // quando presente.
      const searchTitle = (game.scrapeTitle || game.title).replace(/\s*\([^)]*\)\s*$/, '').trim();

      // Cover art via SteamGridDB
      if ((force || !hasRealCover(game)) && SGDB_KEY) {
        const sgdbId = await sgdbSearchGame(searchTitle);
        if (sgdbId) {
          const images = await sgdbGetCover(sgdbId);
          if (images) {
            enriched.coverImage   = images.coverImage;
            enriched.previewImage = images.previewImage;
            writeLog('info', `[METADATA] ✅ Cover SGDB: ${searchTitle}`);
          } else {
            writeLog('info', `[METADATA] ⚠ SGDB cover not found: ${searchTitle}`);
          }
        } else {
          writeLog('info', `[METADATA] ⚠ SGDB game not found: ${searchTitle}`);
        }
      }

      // Metadati via IGDB
      if ((force || !hasRealMetadata(game)) && IGDB_CLIENT_ID) {
        const token = await getIgdbToken();
        if (!token) {
          writeLog('warning', `[METADATA] ❌ IGDB token not obtained — check IGDB_CLIENT_ID and IGDB_CLIENT_SECRET`);
        } else {
          const igdbData = await igdbSearch(searchTitle);
          if (igdbData) {
            if ((force || !enriched.rating) && igdbData.rating) enriched.rating = Math.round(igdbData.rating);
            if ((force || !enriched.genres?.length) && igdbData.genres?.length) enriched.genres = igdbData.genres.map(g => g.name);
            if ((force || !enriched.description) && igdbData.summary) enriched.description = igdbData.summary;
            if ((force || !enriched.releaseDate) && igdbData.first_release_date) enriched.releaseDate = new Date(igdbData.first_release_date * 1000).toISOString();
            // Richiesta utente — dopo aver impostato scrapeTitle (nato per
            // ROM MAME con nome file poco significativo, es. "gngt.zip"),
            // il titolo mostrato in libreria/sidebar restava comunque
            // quello brutto: solo la RICERCA usava scrapeTitle, non la
            // visualizzazione. Corretto qui, non prendendo alla lettera il
            // testo scritto dall'utente (potrebbe essere solo un indizio
            // di ricerca, non necessariamente la capitalizzazione/il nome
            // ufficiale esatti) — usiamo invece igdbData.name, il nome
            // CANONICO restituito da IGDB una volta confermato un
            // abbinamento reale. Solo se scrapeTitle è impostato: un
            // titolo Steam/GOG/Epic già corretto non va mai rinominato
            // solo perché IGDB ha trovato una corrispondenza.
            if (game.scrapeTitle && igdbData.name) enriched.title = igdbData.name;
            writeLog('info', `[METADATA] ✅ IGDB: ${game.title} — rating:${enriched.rating} genres:${enriched.genres?.join(',')}`);
          } else {
            writeLog('info', `[METADATA] ⚠ IGDB no results: ${game.title}`);
          }
        }
      }

      // HowLongToBeat (opzionale)
      if (force || !enriched.hltbHours) {
        const hltb = await hltbSearch(searchTitle);
        if (hltb) enriched.hltbHours = hltb;
      }

      // Achievements placeholder se non presenti
      if (!enriched.achievements) {
        const seed = game.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        enriched.achievements = { unlocked: seed % 20, total: 50 };
      }
    });

    this.cache.set(game.id, enriched);
    return enriched;
  }

  invalidate(gameId: string)  { this.cache.delete(gameId); }
  clearCache()                { this.cache.clear(); }
}

// Log di avvio — conferma quali API sono configurate
if (SGDB_KEY)                              writeLog('info', '[METADATA] SteamGridDB: ✅ API key configured');
else                                       writeLog('info', '[METADATA] SteamGridDB: ⚠ no API key — placeholder covers');
if (IGDB_CLIENT_ID && IGDB_CLIENT_SECRET)  writeLog('info', '[METADATA] IGDB: ✅ credentials configured');
else                                       writeLog('info', '[METADATA] IGDB: ⚠ no credentials — deterministic metadata');

export const metadataManager = new MetadataManager();
