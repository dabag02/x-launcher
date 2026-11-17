/**
 * webArt.ts — v3.2.17-dev.9
 *
 * Immagini scelte dall'utente per le card Web Stream (Amazon Luna), per i
 * casi in cui lo scraping di SteamGridDB non trova la voce giusta o il
 * risultato non piace:
 *
 *   ~/.local/share/x-launcher/web-art/<id del gioco>/cover.(png|jpg|jpeg|webp)   poster verticale
 *   ~/.local/share/x-launcher/web-art/<id del gioco>/hero.(png|jpg|jpeg|webp)    banner orizzontale
 *
 * Per Luna: ~/.local/share/x-launcher/web-art/amazon-luna/. Hanno la
 * precedenza su SteamGridDB (metadataManager). La Dashboard le carica da
 * GET /api/web-art/<id>/<cover|hero> (server.ts, stessa sessione del
 * browser); la cache delle copertine dell'overlay le copia da qui
 * (coverCache.ts). Il parametro ?v=<mtime> nell'URL fa ricaricare
 * un'immagine sostituita con un file nuovo.
 */

import { existsSync, statSync } from 'fs';
import path from 'path';
import { DATA_DIR } from './paths';

export const WEB_ART_DIR = path.join(DATA_DIR, 'web-art');
export type WebArtKind = 'cover' | 'hero';
const EXTS = ['png', 'jpg', 'jpeg', 'webp'];
const URL_RX = /^\/api\/web-art\/([A-Za-z0-9_.-]+)\/(cover|hero)(?:\?.*)?$/;

/** Stessa regola di coverCache.coverKey / processManager.sanitize. */
function keyOf(gameId: string): string {
  return gameId.replace(/[^A-Za-z0-9_.-]/g, '-');
}

/** File locale dell'immagine, se c'è (primo formato trovato nell'ordine png, jpg, jpeg, webp). */
export function findWebArtFile(gameId: string, kind: WebArtKind): { file: string; mtimeMs: number } | null {
  const key = keyOf(gameId);
  if (!key || key === '.' || key === '..') return null;
  for (const ext of EXTS) {
    const file = path.join(WEB_ART_DIR, key, `${kind}.${ext}`);
    try {
      if (!existsSync(file)) continue;
      const st = statSync(file);
      if (st.isFile()) return { file, mtimeMs: Math.floor(st.mtimeMs) };
    } catch { /* non leggibile: si prova il formato successivo */ }
  }
  return null;
}

/** URL servito dal demone per l'immagine locale, o null se il file non c'è. */
export function webArtUrl(gameId: string, kind: WebArtKind): string | null {
  const art = findWebArtFile(gameId, kind);
  return art ? `/api/web-art/${encodeURIComponent(keyOf(gameId))}/${kind}?v=${art.mtimeMs}` : null;
}

/** True se l'URL è uno di quelli generati da webArtUrl. */
export function isWebArtUrl(src: string | undefined | null): boolean {
  return !!src && URL_RX.test(src);
}

/** Da un URL /api/web-art/... al file locale corrispondente (per la cache delle copertine). */
export function webArtFileFromUrl(src: string): string | null {
  const m = URL_RX.exec(src);
  if (!m) return null;
  return findWebArtFile(m[1], m[2] as WebArtKind)?.file ?? null;
}
