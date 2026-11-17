/**
 * v3.2.29-dev.3 — libreria multimedia (CHANGELOG-19, punto 2, step 2a: screenshot).
 *
 *   ~/.local/share/x-launcher/multimedia/<Titolo del gioco>/Screenshot/AAAA-MM-GG_hh-mm-ss.jpg
 *   ~/.local/share/x-launcher/multimedia/<Titolo del gioco>/.x-launcher.json   { gameId, title, created }
 *
 * Il file .x-launcher.json lega la cartella all'id del gioco: se il titolo cambia
 * si continua a usare la stessa cartella invece di crearne una doppia; due giochi
 * con lo stesso titolo non si mescolano (al secondo si aggiunge l'id al nome).
 *
 * Flusso di uno screenshot: spaces.py cattura la finestra del gioco in PNG nella
 * cartella di appoggio (in RAM, privata: /run/user/<uid>/x-launcher-media) e chiama
 * POST /api/media/screenshot con la chiave del gioco (id sanitizzato, ricavato dal
 * nome dello scope) e il nome del file. Qui il PNG viene convertito in JPEG
 * (qualità X_LAUNCHER_SCREENSHOT_QUALITY, predefinita 85, decisione dell'utente),
 * archiviato e cancellato dalla cartella di appoggio; poi la notifica raggruppata.
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import crypto from 'crypto';
import os from 'os';
import { DATA_DIR } from './paths';
import { writeLog } from './logger';
import * as db from './db';
import { notificationEngine } from './notificationEngine';

export const MEDIA_DIR = path.join(DATA_DIR, 'multimedia');
const FOLDER_META = '.x-launcher.json';

/** Stessa cartella di appoggio di spaces.py (media_staging_dir). */
export function mediaStagingDir(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const runDir = `/run/user/${uid}`;
  return fs.existsSync(runDir)
    ? path.join(runDir, 'x-launcher-media')
    : path.join(process.env.HOME || '', '.cache', 'x-launcher', 'media-staging');
}

/** Stessa regola di processManager.sanitize() (nome dello scope). */
export function mediaKey(gameId: string): string {
  return gameId.replace(/[^A-Za-z0-9_.-]/g, '-');
}

export function screenshotQuality(): number {
  const q = parseInt(process.env.X_LAUNCHER_SCREENSHOT_QUALITY || '', 10);
  return Number.isFinite(q) && q >= 1 && q <= 100 ? q : 85;
}

/** Nome di cartella leggibile dal titolo: niente separatori, caratteri di controllo, punti iniziali. */
export function safeFolderName(title: string, fallback: string): string {
  let n = (title || '')
    .replace(/[\/\\\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '');
  if (n.length > 80) n = n.slice(0, 80).trim();
  return n || fallback;
}

function readFolderMeta(dir: string): { gameId?: string } | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, FOLDER_META), 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Cartella del gioco (creata se manca). Ordine: cartella già legata a questo id
 * (anche con un titolo vecchio) → cartella col nome del titolo libera o già sua →
 * nome del titolo con l'id fra parentesi quadre (omonimo di un altro gioco).
 */
export function gameMediaFolder(gameId: string, title: string): string {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  for (const ent of fs.readdirSync(MEDIA_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(MEDIA_DIR, ent.name);
    if (readFolderMeta(dir)?.gameId === gameId) return dir;
  }
  const key = mediaKey(gameId);
  const base = safeFolderName(title, key);
  let dir = path.join(MEDIA_DIR, base);
  if (fs.existsSync(dir)) {
    const meta = readFolderMeta(dir);
    if (meta?.gameId !== gameId) dir = path.join(MEDIA_DIR, `${base} [${key}]`);
  }
  fs.mkdirSync(dir, { recursive: true });
  const metaPath = path.join(dir, FOLDER_META);
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, JSON.stringify({ gameId, title, created: new Date().toISOString() }, null, 2) + '\n');
  }
  return dir;
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** AAAA-MM-GG_hh-mm-ss nell'ora locale; con un suffisso -2, -3… se il file esiste già. */
function freeTimestampName(dir: string, when: Date, ext: string): string {
  const stamp = `${when.getFullYear()}-${pad2(when.getMonth() + 1)}-${pad2(when.getDate())}_` +
                `${pad2(when.getHours())}-${pad2(when.getMinutes())}-${pad2(when.getSeconds())}`;
  let name = `${stamp}.${ext}`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${stamp}-${i}.${ext}`;
  return name;
}

function run(bin: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; err: string }> {
  return new Promise(resolve => {
    execFile(bin, args, { timeout: timeoutMs }, (error, _stdout, stderr) => {
      resolve({ ok: !error, err: error ? `${error.message}${stderr ? ` — ${String(stderr).trim().slice(-300)}` : ''}` : '' });
    });
  });
}

/** PNG → JPEG con ImageMagick (7: `magick`, 6: `convert`). */
async function convertToJpeg(src: string, dst: string, quality: number): Promise<{ ok: boolean; err: string }> {
  const args = [src, '-quality', String(quality), dst];
  const r7 = await run('magick', args, 30_000);
  if (r7.ok) return r7;
  const r6 = await run('convert', args, 30_000);
  return r6.ok ? r6 : { ok: false, err: `magick: ${r7.err}; convert: ${r6.err}` };
}

const STAGED_NAME_RX = /^shot-\d{10,16}-[0-9a-f]{1,16}\.png$/;
const KEY_RX = /^[A-Za-z0-9_.-]{1,200}$/;

export type IngestResult = { success: boolean; message?: string; path?: string };

/**
 * Archivia uno screenshot appena catturato da spaces.py. Accetta solo un nome di
 * file della forma che usa spaces.py, nella cartella di appoggio, file regolare
 * (mai un link): la rotta non può essere usata per leggere o spostare altri file.
 */
export async function ingestScreenshot(key: unknown, file: unknown, takenAt: unknown): Promise<IngestResult> {
  if (typeof key !== 'string' || !KEY_RX.test(key)) return { success: false, message: 'Chiave del gioco non valida.' };
  if (typeof file !== 'string' || !STAGED_NAME_RX.test(file)) return { success: false, message: 'Nome del file non valido.' };
  const src = path.join(mediaStagingDir(), file);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(src);
  } catch {
    return { success: false, message: 'File non trovato nella cartella di appoggio.' };
  }
  if (!st.isFile()) return { success: false, message: 'Non è un file regolare.' };

  const game = db.getAllGames().find(g => mediaKey(g.id) === key);
  const gameId = game?.id ?? key;
  const title = game?.title ?? key;
  const when = typeof takenAt === 'number' && Number.isFinite(takenAt) ? new Date(takenAt) : new Date();

  let dir: string;
  try {
    dir = path.join(gameMediaFolder(gameId, title), 'Screenshot');
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    return { success: false, message: `Cartella non creata: ${err instanceof Error ? err.message : String(err)}` };
  }

  const quality = screenshotQuality();
  let dst = path.join(dir, freeTimestampName(dir, when, 'jpg'));
  const conv = await convertToJpeg(src, dst, quality);
  if (conv.ok) {
    fs.rmSync(src, { force: true });
  } else {
    // Senza ImageMagick lo screenshot non va perso: si archivia il PNG così com'è.
    dst = path.join(dir, freeTimestampName(dir, when, 'png'));
    try {
      fs.copyFileSync(src, dst);
      fs.rmSync(src, { force: true });
    } catch (err) {
      return { success: false, message: `Conversione e copia non riuscite: ${conv.err}; ${err instanceof Error ? err.message : String(err)}` };
    }
    writeLog('warning', `[MEDIA] ${title}: JPEG conversion failed (${conv.err}) — PNG saved instead.`);
  }
  writeLog('system', `[MEDIA] Screenshot of ${title} saved: ${dst}${conv.ok ? ` (JPEG q${quality})` : ''}`);
  notificationEngine.emit({ type: 'media-screenshot', gameId, gameTitle: title, folder: path.dirname(dir) });
  return { success: true, path: dst };
}

// ---------------------------------------------------------------------------
// v3.2.29-dev.6 — clip temporanee (step 2b)
// ---------------------------------------------------------------------------

/**
 * Stessa cartella di spaces.py (clips_dir): /tmp/x-launcher-<uid>/clips. È in tmpfs: le clip non
 * salvate spariscono allo spegnimento. spaces.py ne tiene al massimo 3 (la quarta cancella la più
 * vecchia) e accanto a ogni clip-<ms>-<hex>.mp4 scrive clip-<ms>-<hex>.json con gioco, durata e risoluzione.
 */
export function clipsTmpDir(): string {
  if (process.env.X_LAUNCHER_CLIPS_DIR) return process.env.X_LAUNCHER_CLIPS_DIR;
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  return path.join('/tmp', `x-launcher-${uid}`, 'clips');
}

const CLIP_NAME_RX = /^clip-\d{10,16}-[0-9a-f]{1,16}\.mp4$/;

export type TmpClip = { file: string; key: string; title: string; startedAt: number; duration: number; width?: number; height?: number; size: number };

/** Clip temporanee presenti (solo quelle con il loro .json valido), dalla più recente. */
export function listTmpClips(): TmpClip[] {
  const dir = clipsTmpDir();
  let names: string[] = [];
  try {
    const st = fs.lstatSync(dir);
    if (!st.isDirectory() || (typeof process.getuid === 'function' && st.uid !== process.getuid())) return [];
    names = fs.readdirSync(dir).filter(n => CLIP_NAME_RX.test(n));
  } catch {
    return [];
  }
  const out: TmpClip[] = [];
  for (const file of names) {
    try {
      const st = fs.lstatSync(path.join(dir, file));
      if (!st.isFile()) continue;
      const meta = JSON.parse(fs.readFileSync(path.join(dir, file.replace(/\.mp4$/, '.json')), 'utf-8'));
      if (typeof meta?.key !== 'string' || !KEY_RX.test(meta.key)) continue;
      out.push({
        file, key: meta.key, title: typeof meta.title === 'string' ? meta.title : meta.key,
        startedAt: Number(meta.startedAt) || 0, duration: Number(meta.duration) || 0,
        width: Number(meta.width) || undefined, height: Number(meta.height) || undefined, size: st.size,
      });
    } catch {
      // .json mancante o illeggibile: clip ancora in chiusura, o rovinata — non elencata
    }
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Chiamata da spaces.py a clip chiusa: notifica «Clip da rivedere — <gioco>» col numero di clip
 * temporanee di quel gioco. Accetta solo un nome di clip della cartella delle clip, file regolare,
 * con il suo .json e la stessa chiave.
 */
export async function announceClip(key: unknown, file: unknown): Promise<IngestResult> {
  if (typeof key !== 'string' || !KEY_RX.test(key)) return { success: false, message: 'Chiave del gioco non valida.' };
  if (typeof file !== 'string' || !CLIP_NAME_RX.test(file)) return { success: false, message: 'Nome della clip non valido.' };
  const clips = listTmpClips();
  const clip = clips.find(c => c.file === file);
  if (!clip || clip.key !== key) return { success: false, message: 'Clip non trovata nella cartella temporanea.' };
  const game = db.getAllGames().find(g => mediaKey(g.id) === key);
  const gameId = game?.id ?? key;
  const title = game?.title ?? clip.title;
  const count = clips.filter(c => c.key === key).length;
  writeLog('system', `[MEDIA] Clip of ${title} in the temporary cache: ${path.join(clipsTmpDir(), file)} (${clip.duration}s, ${Math.round(clip.size / 1024)} KB; ${clips.length} temporary clip(s) in total)`);
  notificationEngine.emit({ type: 'media-clip', gameId, gameTitle: title, count });
  return { success: true, path: path.join(clipsTmpDir(), file) };
}

// ---------------------------------------------------------------------------
// v3.2.29-dev.7 — sezione Multimedia della Dashboard (step 2c): elenco, file, miniature, salvataggio
// delle clip temporanee in tre risoluzioni, eliminazione.
// ---------------------------------------------------------------------------

export const MEDIA_SUBDIRS = ['Screenshot', 'Clip'] as const;
export type MediaSub = typeof MEDIA_SUBDIRS[number];
const SAVED_NAME_RX = /^[^/\\.][^/\\]{0,200}\.(jpg|jpeg|png|mp4)$/i;
const THUMB_DIR = path.join(os.homedir(), '.cache', 'x-launcher', 'media-thumbs');

export type MediaItem = { name: string; url: string; thumb: string; mtime: number; size: number; kind: 'image' | 'video'; shared?: ShareRecord[] };
export type MediaGame = { folder: string; gameId: string; title: string; screenshots: MediaItem[]; clips: MediaItem[]; latest: number };

function enc(v: string): string { return encodeURIComponent(v); }

/** Elenco completo: clip temporanee (dalla più recente) e giochi con screenshot e clip salvati. */
export function mediaLibrary(): { root: string; clipsDir: string; tmpClips: (TmpClip & { url: string; thumb: string; gameId: string; saving: boolean; shared?: ShareRecord[] })[]; games: MediaGame[] } {
  const games: MediaGame[] = [];
  const sharedMap = readShared();
  let dirs: fs.Dirent[] = [];
  try { dirs = fs.readdirSync(MEDIA_DIR, { withFileTypes: true }); } catch { /* cartella non ancora creata */ }
  for (const ent of dirs) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const dir = path.join(MEDIA_DIR, ent.name);
    const meta = readFolderMeta(dir) as { gameId?: string; title?: string } | null;
    const g: MediaGame = { folder: ent.name, gameId: meta?.gameId ?? ent.name, title: ent.name, screenshots: [], clips: [], latest: 0 };
    const dbGame = meta?.gameId ? db.getGameById(meta.gameId) : undefined;
    if (dbGame?.title) g.title = dbGame.title;
    for (const sub of MEDIA_SUBDIRS) {
      let names: string[] = [];
      try { names = fs.readdirSync(path.join(dir, sub)); } catch { continue; }
      for (const name of names) {
        if (!SAVED_NAME_RX.test(name)) continue;
        let st: fs.Stats;
        try { st = fs.lstatSync(path.join(dir, sub, name)); } catch { continue; }
        if (!st.isFile()) continue;
        const rel = `${enc(ent.name)}/${sub}/${enc(name)}`;
        const item: MediaItem = {
          name, mtime: st.mtimeMs, size: st.size, kind: /\.mp4$/i.test(name) ? 'video' : 'image',
          url: `/api/media/saved/${rel}?v=${Math.round(st.mtimeMs)}`, thumb: `/api/media/thumb/saved/${rel}?v=${Math.round(st.mtimeMs)}`,
          shared: sharedMap[savedKey(ent.name, sub, name)],
        };
        (sub === 'Screenshot' ? g.screenshots : g.clips).push(item);
        g.latest = Math.max(g.latest, st.mtimeMs);
      }
    }
    if (!g.screenshots.length && !g.clips.length) continue;
    g.screenshots.sort((a, b) => b.mtime - a.mtime);
    g.clips.sort((a, b) => b.mtime - a.mtime);
    games.push(g);
  }
  games.sort((a, b) => b.latest - a.latest);
  const all = db.getAllGames();
  const tmpClips = listTmpClips().map(c => ({
    ...c,
    gameId: all.find(g => mediaKey(g.id) === c.key)?.id ?? c.key,
    title: all.find(g => mediaKey(g.id) === c.key)?.title ?? c.title,
    url: `/api/media/tmp/${enc(c.file)}`, thumb: `/api/media/thumb/tmp/${enc(c.file)}`,
    saving: savingClips.has(c.file),
    shared: sharedMap[tmpKey(c.file)],
  }));
  // annotazioni di clip temporanee sparite (scartate da fuori, cache piena, riavvio): via
  const live = new Set(tmpClips.map(c => tmpKey(c.file)));
  const stale = Object.keys(sharedMap).filter(k => k.startsWith('tmp:') && !live.has(k) && !savingClips.has(k.slice(4)));
  if (stale.length) { for (const k of stale) delete sharedMap[k]; writeShared(sharedMap); }
  return { root: MEDIA_DIR, clipsDir: clipsTmpDir(), tmpClips, games };
}

/**
 * Percorso reale di un file della libreria, solo se esiste, è un file regolare e sta davvero dentro
 * multimedia/<cartella di un gioco>/<Screenshot|Clip>/ (nessun «..», nessun link fuori). null altrimenti.
 */
export function resolveSavedMedia(folder: string, sub: string, name: string): string | null {
  if (!(MEDIA_SUBDIRS as readonly string[]).includes(sub)) return null;
  if (!folder || folder.startsWith('.') || /[\/\\\u0000]/.test(folder) || !SAVED_NAME_RX.test(name)) return null;
  const p = path.join(MEDIA_DIR, folder, sub, name);
  try {
    const st = fs.lstatSync(p);
    if (!st.isFile()) return null;
    const real = fs.realpathSync(p);
    const root = fs.realpathSync(MEDIA_DIR);
    return real.startsWith(root + path.sep) ? real : null;
  } catch {
    return null;
  }
}

/** Percorso di una clip temporanea elencata (vedi listTmpClips), o null. */
export function resolveTmpClip(file: string): string | null {
  if (!CLIP_NAME_RX.test(file)) return null;
  return listTmpClips().some(c => c.file === file) ? path.join(clipsTmpDir(), file) : null;
}

// ----- miniature (cache in ~/.cache/x-launcher/media-thumbs, una alla volta: niente raffiche di ffmpeg)
let thumbQueue: Promise<unknown> = Promise.resolve();

export function mediaThumb(src: string): Promise<string | null> {
  let st: fs.Stats;
  try { st = fs.statSync(src); } catch { return Promise.resolve(null); }
  const key = crypto.createHash('sha1').update(`${src}|${st.mtimeMs}|${st.size}`).digest('hex');
  const out = path.join(THUMB_DIR, `${key}.jpg`);
  if (fs.existsSync(out)) return Promise.resolve(out);
  const job = thumbQueue.then(async () => {
    if (fs.existsSync(out)) return out;
    fs.mkdirSync(THUMB_DIR, { recursive: true });
    const tmp = `${out}.${process.pid}.tmp.jpg`;
    const isVideo = /\.mp4$/i.test(src);
    const r = isVideo
      ? await run('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', src, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', tmp], 30_000)
      : await run('magick', [src, '-auto-orient', '-thumbnail', '480x480>', '-quality', '80', tmp], 30_000)
          .then(r1 => r1.ok ? r1 : run('convert', [src, '-auto-orient', '-thumbnail', '480x480>', '-quality', '80', tmp], 30_000));
    if (isVideo && (!r.ok || !fs.existsSync(tmp))) {
      // clip più corta di 1 s: primo fotogramma
      const r0 = await run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', tmp], 30_000);
      if (!r0.ok) { writeLog('warning', `[MEDIA] Thumbnail not created for ${src}: ${r0.err}`); return null; }
    } else if (!r.ok) {
      writeLog('warning', `[MEDIA] Thumbnail not created for ${src}: ${r.err}`);
      return null;
    }
    fs.renameSync(tmp, out);
    return out;
  });
  thumbQueue = job.catch(() => null);
  return job as Promise<string | null>;
}

// ----- salvataggio delle clip temporanee
export type ClipQuality = 'native' | 'fhd' | 'hd';
const QUALITY_HEIGHT: Record<Exclude<ClipQuality, 'native'>, number> = { fhd: 1080, hd: 720 };
const savingClips = new Set<string>();

export function isClipSaving(file: string): boolean { return savingClips.has(file); }

async function encodeScaled(src: string, dst: string, height: number): Promise<{ ok: boolean; err: string }> {
  // NVENC come per la registrazione; ripiego su x264 se l'encoder hardware non c'è o fallisce.
  const common = ['-v', 'error', '-y', '-i', src, '-vf', `scale=-2:${height}:flags=lanczos`];
  const tail = ['-c:a', 'copy', '-movflags', '+faststart', '-f', 'mp4', dst];
  const nv = await run('ffmpeg', [...common, '-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '21', '-b:v', '0', ...tail], 600_000);
  if (nv.ok) return nv;
  writeLog('warning', `[MEDIA] NVENC encode failed (${nv.err}), falling back to libx264`);
  const sw = await run('ffmpeg', [...common, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', ...tail], 1_200_000);
  return sw.ok ? sw : { ok: false, err: `h264_nvenc: ${nv.err}; libx264: ${sw.err}` };
}

/**
 * Salva una clip temporanea nella cartella Clip del gioco: «native» la copia così com'è (istantaneo),
 * «fhd»/«hd» la riconvertono a 1080/720 righe (mai ingrandita: se la clip è già più bassa resta nativa).
 * Gira in background: a fine lavoro la clip temporanea viene tolta, notifica e aggiornamento della sezione.
 */
export function saveTmpClip(file: unknown, quality: unknown, onDone?: () => void): IngestResult {
  if (typeof file !== 'string' || !CLIP_NAME_RX.test(file)) return { success: false, message: 'Nome della clip non valido.' };
  if (quality !== 'native' && quality !== 'fhd' && quality !== 'hd') return { success: false, message: 'Risoluzione non valida.' };
  const clip = listTmpClips().find(c => c.file === file);
  if (!clip) return { success: false, message: 'Clip non trovata nella cartella temporanea.' };
  if (savingClips.has(file)) return { success: false, message: 'Salvataggio già in corso.' };
  savingClips.add(file);
  const game = db.getAllGames().find(g => mediaKey(g.id) === clip.key);
  const gameId = game?.id ?? clip.key;
  const title = game?.title ?? clip.title;
  const src = path.join(clipsTmpDir(), file);
  const target = quality === 'native' ? null : QUALITY_HEIGHT[quality];
  const scale = target !== null && (!clip.height || clip.height > target) ? target : null;
  (async () => {
    let ok = false; let err = ''; let dst = '';
    try {
      const dir = path.join(gameMediaFolder(gameId, title), 'Clip');
      fs.mkdirSync(dir, { recursive: true });
      dst = path.join(dir, freeTimestampName(dir, new Date(clip.startedAt || Date.now()), 'mp4'));
      const part = `${dst}.part`;
      if (scale) {
        const r = await encodeScaled(src, part, scale);
        ok = r.ok; err = r.err;
      } else {
        await fs.promises.copyFile(src, part);   // /tmp (tmpfs) -> disco: copia, non rename
        ok = true;
      }
      if (ok) {
        fs.renameSync(part, dst);
        fs.rmSync(src, { force: true });
        fs.rmSync(src.replace(/\.mp4$/, '.json'), { force: true });
        // v3.2.29-dev.14 — una clip già condivisa resta segnata anche dopo il salvataggio
        moveShared(tmpKey(file), savedKey(path.basename(path.dirname(path.dirname(dst))), 'Clip', path.basename(dst)));
      } else {
        fs.rmSync(part, { force: true });
      }
    } catch (e) {
      ok = false; err = e instanceof Error ? e.message : String(e);
    } finally {
      savingClips.delete(file);
    }
    const label = scale ? `${scale}p` : (quality === 'native' ? 'native' : 'native (already ≤ target)');
    if (ok) writeLog('system', `[MEDIA] Clip of ${title} saved (${label}): ${dst}`);
    else writeLog('error', `[MEDIA] Clip of ${title} not saved (${label}): ${err}`);
    notificationEngine.emit({ type: 'media-clip-saved', gameId, gameTitle: title, ok, quality: scale ? `${scale}p` : 'native', error: err || undefined });
    notificationEngine.emit({ type: 'media-clip', gameId, gameTitle: title, count: listTmpClips().filter(c => c.key === clip.key).length });
    onDone?.();
  })();
  return { success: true, message: scale ? `Conversione a ${scale}p avviata.` : 'Salvataggio avviato.' };
}

/** Elimina una clip temporanea (con il suo .json) o un file salvato. */
export function deleteMedia(body: { scope?: unknown; file?: unknown; folder?: unknown; sub?: unknown; name?: unknown }): IngestResult {
  if (body.scope === 'tmp') {
    const p = typeof body.file === 'string' ? resolveTmpClip(body.file) : null;
    if (!p) return { success: false, message: 'Clip non trovata.' };
    if (savingClips.has(body.file as string)) return { success: false, message: 'Salvataggio in corso.' };
    const clip = listTmpClips().find(c => c.file === body.file);
    fs.rmSync(p, { force: true });
    fs.rmSync(p.replace(/\.mp4$/, '.json'), { force: true });
    forgetShared(tmpKey(body.file as string));
    writeLog('system', `[MEDIA] Temporary clip discarded: ${p}`);
    if (clip) {
      const game = db.getAllGames().find(g => mediaKey(g.id) === clip.key);
      notificationEngine.emit({ type: 'media-clip', gameId: game?.id ?? clip.key, gameTitle: game?.title ?? clip.title,
                                count: listTmpClips().filter(c => c.key === clip.key).length });
    }
    return { success: true };
  }
  if (body.scope === 'saved' && typeof body.folder === 'string' && typeof body.sub === 'string' && typeof body.name === 'string') {
    const p = resolveSavedMedia(body.folder, body.sub, body.name);
    if (!p) return { success: false, message: 'File non trovato.' };
    fs.rmSync(p, { force: true });
    forgetShared(savedKey(body.folder, body.sub, body.name));
    writeLog('system', `[MEDIA] Deleted: ${p}`);
    return { success: true };
  }
  return { success: false, message: 'Richiesta non valida.' };
}


// ----- v3.2.29-dev.13 — contenuto da condividere (src/backend/share/): percorso verificato come per la
// riproduzione (resolveTmpClip / resolveSavedMedia), tipo MIME e gioco di appartenenza
export type ShareSourceInfo = { path: string; kind: 'image' | 'video'; mime: string; gameId: string; gameTitle: string };

function mimeOf(file: string): { kind: 'image' | 'video'; mime: string } | null {
  if (/\.mp4$/i.test(file)) return { kind: 'video', mime: 'video/mp4' };
  if (/\.jpe?g$/i.test(file)) return { kind: 'image', mime: 'image/jpeg' };
  if (/\.png$/i.test(file)) return { kind: 'image', mime: 'image/png' };
  return null;
}

export function describeShareSource(src: unknown): ShareSourceInfo | null {
  const s = (src ?? {}) as { scope?: unknown; file?: unknown; folder?: unknown; sub?: unknown; name?: unknown };
  if (s.scope === 'tmp' && typeof s.file === 'string') {
    const p = resolveTmpClip(s.file);
    const m = p && mimeOf(p);
    if (!p || !m) return null;
    const c = mediaLibrary().tmpClips.find(x => x.file === s.file);
    return { path: p, ...m, gameId: c?.gameId ?? '', gameTitle: c?.title ?? '' };
  }
  if (s.scope === 'saved' && typeof s.folder === 'string' && typeof s.sub === 'string' && typeof s.name === 'string') {
    const p = resolveSavedMedia(s.folder, s.sub, s.name);
    const m = p && mimeOf(p);
    if (!p || !m) return null;
    const meta = readFolderMeta(path.join(MEDIA_DIR, s.folder)) as { gameId?: string } | null;
    const dbGame = meta?.gameId ? db.getGameById(meta.gameId) : undefined;
    return { path: p, ...m, gameId: meta?.gameId ?? s.folder, gameTitle: dbGame?.title ?? s.folder };
  }
  return null;
}

// ----- v3.2.29-dev.14 — contenuti già condivisi (badge nella galleria e nel visore, avviso prima di
// ricondividere). ~/.local/share/x-launcher/media-shared.json: { "<chiave>": [ { provider, providerName,
// url, at } ] }, chiave «tmp:<file>» per una clip temporanea, «saved:<cartella>/<Screenshot|Clip>/<nome>»
// per un file salvato. Il salvataggio di una clip sposta l'annotazione, scarto ed eliminazione la tolgono.
export type ShareRecord = { provider: string; providerName: string; url?: string; at: number };
const SHARED_FILE = path.join(DATA_DIR, 'media-shared.json');

function tmpKey(file: string): string { return `tmp:${file}`; }
function savedKey(folder: string, sub: string, name: string): string { return `saved:${folder}/${sub}/${name}`; }

function readShared(): Record<string, ShareRecord[]> {
  try {
    const j = JSON.parse(fs.readFileSync(SHARED_FILE, 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch { return {}; }
}
function writeShared(m: Record<string, ShareRecord[]>): void {
  try {
    const tmp = `${SHARED_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(m, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, SHARED_FILE);
  } catch (e) {
    writeLog('warning', `[MEDIA] Could not write ${SHARED_FILE}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
function moveShared(from: string, to: string): void {
  const m = readShared();
  if (!m[from]) return;
  m[to] = [...(m[to] ?? []), ...m[from]];
  delete m[from];
  writeShared(m);
}
function forgetShared(key: string): void {
  const m = readShared();
  if (!m[key]) return;
  delete m[key];
  writeShared(m);
}

/** Annota un contenuto come condiviso (chiamata a invio riuscito). */
export function markShared(source: unknown, rec: ShareRecord): void {
  const s = (source ?? {}) as { scope?: unknown; file?: unknown; folder?: unknown; sub?: unknown; name?: unknown };
  let key: string | null = null;
  if (s.scope === 'tmp' && typeof s.file === 'string' && CLIP_NAME_RX.test(s.file)) key = tmpKey(s.file);
  else if (s.scope === 'saved' && typeof s.folder === 'string' && typeof s.sub === 'string' && typeof s.name === 'string'
    && resolveSavedMedia(s.folder, s.sub, s.name)) key = savedKey(s.folder, s.sub, s.name);
  if (!key) return;
  const m = readShared();
  m[key] = [...(m[key] ?? []), rec];
  writeShared(m);
}
