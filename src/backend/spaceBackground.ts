/**
 * spaceBackground.ts — v3.2.29-dev.17 — sfondo del desktop dello spazio di un gioco (sessione Openbox).
 *
 * Dietro la finestra del gioco il desktop dello spazio era nero: si vedeva al caricamento, con i giochi in
 * finestra, con i popup dei launcher e alla chiusura. Ora spaces.py ci mette un'immagine del gioco a schermo
 * intero, nitida (scelta dell'utente), presa da qui:
 *
 *   ~/.local/share/x-launcher/covers/<id>.bg        immagine ad alta risoluzione, così come arriva
 *   ~/.local/share/x-launcher/covers/<id>.bg.json   { source: igdb|sgdb|none, url, title, at }
 *
 * <id> come per le copertine (coverCache.coverKey = nome dello scope systemd). Sorgente scelta dall'utente:
 * artwork 16:9 di IGDB, poi hero di SteamGridDB ad alta risoluzione (metadataManager.findSpaceArtwork).
 *
 * Quando: al lancio di un gioco (se manca, così è pronto per il caricamento o subito dopo), e in background
 * per i giochi installati dopo ogni aggiornamento dei metadati, uno alla volta e con calma (una ricerca ogni
 * 2 s: IGDB permette 4 richieste al secondo). Un gioco senza immagine non viene ricercato di nuovo per 7
 * giorni; un cambio del titolo di ricerca (scrapeTitle) rifà la ricerca. Esclusi i giochi Steam e Big Picture
 * (spazio 3, a tutto schermo in gamescope: il desktop non si vede mai) e le card Web Stream (Luna).
 * Nessun errore è bloccante: senza file lo spazio resta nero come prima.
 */
import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs';
import path from 'path';
import type { Game } from '../types';
import { COVERS_DIR, coverKey, isImage } from './coverCache';
import { findSpaceArtwork } from './metadataManager';
import { safePublicDownload } from './urlSafety';
import { writeLog } from './logger';

const MAX_BYTES = 16 * 1024 * 1024;     // un artwork 4K in JPEG resta di solito sotto i 5 MB
const TIMEOUT_MS = 30_000;
const RETRY_NONE_MS = 7 * 24 * 3600_000;
const PREFETCH_GAP_MS = 2_000;

type BgGame = Pick<Game, 'id' | 'title' | 'store' | 'runner'> & { scrapeTitle?: string };
type BgMeta = { source?: 'igdb' | 'sgdb' | 'none'; url?: string; title?: string; at?: number; width?: number; height?: number };

function eligible(g: BgGame): boolean {
  return g.store !== 'Steam' && g.runner !== 'Steam Native' && g.runner !== 'Web Stream';
}
function searchTitle(g: BgGame): string { return (g.scrapeTitle || g.title || '').trim(); }

function metaPath(key: string): string { return path.join(COVERS_DIR, `${key}.bg.json`); }
function readMeta(key: string): BgMeta {
  try { return JSON.parse(readFileSync(metaPath(key), 'utf-8')) as BgMeta; } catch { return {}; }
}
function writeAtomic(dest: string, data: Buffer | string): void {
  const tmp = `${dest}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, dest);
}

const inFlight = new Map<string, Promise<boolean>>();

/** Scarica lo sfondo di un gioco se manca. true se il file c'è (anche già prima). Non lancia mai. */
export function ensureSpaceBackground(game: BgGame, reason: string): Promise<boolean> {
  const key = coverKey(game.id);
  const running = inFlight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      if (!eligible(game)) return false;
      const title = searchTitle(game);
      if (!title) return false;
      const dest = path.join(COVERS_DIR, `${key}.bg`);
      const meta = readMeta(key);
      const sameTitle = meta.title === title;
      if (sameTitle && meta.source && meta.source !== 'none' && existsSync(dest)) return true;
      if (sameTitle && meta.source === 'none' && meta.at && Date.now() - meta.at < RETRY_NONE_MS) return false;

      const art = await findSpaceArtwork(title);
      if (!art) {
        writeAtomic(metaPath(key), JSON.stringify({ source: 'none', title, at: Date.now() }));
        writeLog('info', `[SPACE-BG] "${title}": no high-resolution artwork on IGDB or SteamGridDB (${reason}).`);
        return existsSync(dest);
      }
      const buf = await safePublicDownload(art.url, { maxBytes: MAX_BYTES, timeoutMs: TIMEOUT_MS });
      if (!buf || !isImage(buf)) {
        writeLog('warning', `[SPACE-BG] "${title}": download failed (${art.source}, ${art.url}).`);
        return existsSync(dest);        // si riprova la prossima volta (nessun .bg.json scritto)
      }
      writeAtomic(dest, buf);
      writeAtomic(metaPath(key), JSON.stringify({ source: art.source, url: art.url, title, at: Date.now(), width: art.width, height: art.height }));
      writeLog('info', `[SPACE-BG] "${title}": ${art.source} ${art.width}x${art.height}, ${(buf.length / 1048576).toFixed(1)} MB (${reason}).`);
      return true;
    } catch (e) {
      writeLog('warning', `[SPACE-BG] ${game.id}: ${(e as Error).message}`);
      return false;
    }
  })();
  // tolta a lavoro finito (non dentro la funzione: senza attese finirebbe prima di essere registrata)
  inFlight.set(key, p);
  void p.finally(() => { if (inFlight.get(key) === p) inFlight.delete(key); });
  return p;
}

let prefetching = false;

/** In background, uno alla volta: sfondi dei giochi installati che ancora non ce l'hanno. */
export async function prefetchSpaceBackgrounds(games: Array<BgGame & { isInstalled?: boolean }>): Promise<void> {
  if (prefetching) return;
  prefetching = true;
  let fetched = 0;
  try {
    for (const g of games) {
      if (!g.isInstalled || !eligible(g)) continue;
      const key = coverKey(g.id);
      const meta = readMeta(key);
      const title = searchTitle(g);
      if (meta.title === title && (meta.source === 'none' ? (meta.at && Date.now() - meta.at < RETRY_NONE_MS)
        : existsSync(path.join(COVERS_DIR, `${key}.bg`)))) continue;
      if (await ensureSpaceBackground(g, 'prefetch')) fetched++;
      await new Promise(r => setTimeout(r, PREFETCH_GAP_MS));
    }
    if (fetched) writeLog('info', `[SPACE-BG] prefetch: ${fetched} new background(s).`);
  } finally {
    prefetching = false;
  }
}
