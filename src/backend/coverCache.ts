/**
 * coverCache.ts — v2.7.2-dev.4 (Step 21, overlay degli spazi).
 *
 * Cache locale su disco delle copertine, pensata per l'overlay degli spazi
 * (overlay.py, processo Python senza rete che deve disegnare in modo istantaneo).
 * La Dashboard continua a usare gli URL salvati nel DB (coverImage/previewImage);
 * questo modulo si limita a SCARICARNE UNA COPIA in
 *
 *   ~/.local/share/x-launcher/covers/<id>.cover   (poster verticale, coverImage)
 *   ~/.local/share/x-launcher/covers/<id>.hero    (banner orizzontale, previewImage)
 *   ~/.local/share/x-launcher/covers/<id>.json    (URL di origine: serve a rifare il
 *                                                   download solo se l'URL cambia;
 *                                                   + "title": titolo del gioco nel DB,
 *                                                   che l'overlay preferisce al nome
 *                                                   della finestra — RetroArch ecc. hanno
 *                                                   titoli di finestra generici)
 *
 * <id> = id del gioco con la STESSA sanitizzazione del nome dell'unit systemd
 * (processManager.sanitize: tutto fuori da [A-Za-z0-9_.-] diventa '-'), cosi' spaces.py
 * ricava il file direttamente dal nome dello scope `xlauncher-game-<id>-<ts>`.
 *
 * Nessun ridimensionamento qui (nessuna libreria immagini nelle dipendenze): i file
 * sono salvati cosi' come arrivano; ritaglio e miniature li fa overlay.py con Pillow
 * e li tiene in memoria. Ogni errore e' non bloccante: senza file l'overlay mostra
 * le iniziali, come nella 2.7.2-dev.3.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, copyFileSync, unlinkSync, readdirSync, realpathSync, statSync, openSync, readSync, closeSync } from 'fs';
import path from 'path';
import type { Game } from '../types';
import { DATA_DIR } from './paths';
import { writeLog } from './logger';
import { safePublicDownload } from './urlSafety';

export const COVERS_DIR = path.join(DATA_DIR, 'covers');

const MAX_BYTES = 8 * 1024 * 1024;     // oltre questa dimensione l'immagine viene scartata
const TIMEOUT_MS = 15000;
const CONCURRENCY = 2;

/** Stessa regola di processManager.sanitize(): vedi nota in testa al file. */
export function coverKey(gameId: string): string {
  return gameId.replace(/[^A-Za-z0-9_.-]/g, '-');
}

type Kind = 'cover' | 'hero';
type Meta = Partial<Record<Kind, string>> & { title?: string };

function isPlaceholder(url: string): boolean {
  return !url || url.includes('unsplash.com');
}

function readMeta(key: string): Meta {
  try {
    return JSON.parse(readFileSync(path.join(COVERS_DIR, `${key}.json`), 'utf-8')) as Meta;
  } catch {
    return {};
  }
}

function isImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;                                   // JPEG
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return true;            // PNG
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return true;
  if (buf.toString('latin1', 0, 3) === 'GIF') return true;
  if (buf[0] === 0x42 && buf[1] === 0x4d) return true;                                   // BMP
  return false;
}

async function download(url: string): Promise<Buffer | null> {
  // v3.0.2-dev.5 — niente fetch verso la rete locale (audit punto 12): safePublicDownload rifiuta indirizzi
  // privati/loopback dopo la risoluzione DNS, segue a mano e riconvalida ogni redirect.
  const buf = await safePublicDownload(url, { maxBytes: MAX_BYTES, timeoutMs: TIMEOUT_MS });
  return buf && isImage(buf) ? buf : null;
}

/** File normale (non cartella/dispositivo), entro MAX_BYTES, con intestazione d'immagine riconosciuta. */
function isLocalImageFile(file: string): boolean {
  let fd: number | undefined;
  try {
    const real = realpathSync(file);
    const st = statSync(real);
    if (!st.isFile() || st.size > MAX_BYTES) return false;
    fd = openSync(real, 'r');
    const head = Buffer.alloc(16);
    const n = readSync(fd, head, 0, 16, 0);
    return isImage(head.subarray(0, n));
  } catch {
    return false;
  } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* ignorato */ } }
  }
}

function writeAtomic(dest: string, data: Buffer | string): void {
  const tmp = `${dest}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, dest);
}

/** Scarica (o copia, se e' un file locale) una singola immagine. true se il file e' ora presente. */
async function cacheOne(key: string, kind: Kind, src: string | undefined, meta: Meta): Promise<boolean> {
  const dest = path.join(COVERS_DIR, `${key}.${kind}`);
  if (!src || isPlaceholder(src)) return existsSync(dest);
  if (meta[kind] === src && existsSync(dest)) return true;     // gia' scaricata da questo URL

  try {
    if (/^https?:\/\//i.test(src)) {
      const buf = await download(src);
      if (!buf) return existsSync(dest);                        // tiene la copia precedente, se c'e'
      writeAtomic(dest, buf);
    } else {
      const local = src.startsWith('file://') ? decodeURIComponent(src.slice(7)) : src;
      if (!path.isAbsolute(local) || !existsSync(local)) return existsSync(dest);
      // v3.0.2-dev.5 — si copia solo se e' davvero un'immagine di dimensione ragionevole: prima qualunque file
      // leggibile indicato come "copertina" finiva nella cartella delle copertine (e da li' poteva essere servito).
      if (!isLocalImageFile(local)) return existsSync(dest);
      const tmp = `${dest}.tmp-${process.pid}`;
      copyFileSync(local, tmp);
      renameSync(tmp, dest);
    }
    meta[kind] = src;
    return true;
  } catch (e) {
    writeLog('warning', `[COVERS] ${key}.${kind}: ${(e as Error).message}`);
    return existsSync(dest);
  }
}

/** Mette in cache cover e hero di UN gioco. Non lancia mai. */
export async function cacheGameCovers(game: Pick<Game, 'id' | 'title' | 'coverImage' | 'previewImage'>): Promise<boolean> {
  try {
    mkdirSync(COVERS_DIR, { recursive: true });
    const key = coverKey(game.id);
    const meta = readMeta(key);
    const before = JSON.stringify(meta);
    if (game.title) meta.title = game.title;
    const a = await cacheOne(key, 'cover', game.coverImage, meta);
    const b = await cacheOne(key, 'hero', game.previewImage, meta);
    if (JSON.stringify(meta) !== before) writeAtomic(path.join(COVERS_DIR, `${key}.json`), JSON.stringify(meta));
    return a || b;
  } catch (e) {
    writeLog('warning', `[COVERS] ${game.id}: ${(e as Error).message}`);
    return false;
  }
}

let running = false;

/**
 * Riempie la cache per un insieme di giochi (due download alla volta). Si puo' chiamare
 * a ogni refresh della libreria: chi ha gia' il file dall'URL corrente costa solo una
 * lettura del .json. Una sola esecuzione per volta.
 */
export async function cacheLibraryCovers(games: Array<Pick<Game, 'id' | 'title' | 'coverImage' | 'previewImage'>>): Promise<void> {
  if (running) return;
  running = true;
  const t0 = Date.now();
  let ok = 0;
  try {
    const queue = games.slice();
    const worker = async () => {
      for (let g = queue.shift(); g; g = queue.shift()) {
        if (await cacheGameCovers(g)) ok++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    writeLog('info', `[COVERS] cache aggiornata: ${ok}/${games.length} giochi con copertina locale (${Date.now() - t0} ms)`);
  } catch (e) {
    writeLog('warning', `[COVERS] riempimento interrotto: ${(e as Error).message}`);
  } finally {
    running = false;
  }
}

/** Rimuove i file di giochi che non sono piu' in libreria (chiamabile a mano / dopo un refresh). */
export function pruneCovers(validIds: string[]): number {
  let removed = 0;
  try {
    const keep = new Set(validIds.map(coverKey));
    for (const f of readdirSync(COVERS_DIR)) {
      const key = f.replace(/\.(cover|hero|json)$/, '').replace(/\.tmp-\d+$/, '');
      if (!keep.has(key)) {
        try { unlinkSync(path.join(COVERS_DIR, f)); removed++; } catch { /* ignora */ }
      }
    }
  } catch { /* cartella assente */ }
  return removed;
}
