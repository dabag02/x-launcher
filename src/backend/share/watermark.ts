/**
 * share/watermark.ts — v3.2.29-dev.14 — filigrana «Condiviso con X-Launcher» / «Shared with X-Launcher»
 * in basso a destra di una clip da condividere (interruttore nella finestra del post).
 *
 * Una copia riconvertita in ~/.cache/x-launcher/share-tmp/<lavoro>.mp4 (su disco, non in /tmp: una clip
 * di 2 minuti a 1440p pesa centinaia di MB), cancellata a fine invio. L'originale non viene mai toccato.
 *
 * v3.2.29-dev.16 — aspetto scelto dall'utente sui mock (versione «B»):
 * - carattere dell'intestazione «MULTIMEDIA» della Dashboard: Noto Sans Black Italic, dal file del
 *   progetto (assets/fonts/NotoSans-BlackItalic.ttf; ripiego su fontconfig «Sans» grassetto corsivo);
 * - corpo 1/18 dell'altezza del video (80 px a 1440p), margine in basso e a destra 1/24 (60 px a 1440p);
 * - testo bianco con bordo grigio medio (#8c8c8c, spessore 1/14 del corpo), opacità complessiva 92%;
 * - antialias: la scritta è disegnata una sola volta a risoluzione doppia, con la maschera del bordo
 *   leggermente sfumata (gblur), e ridotta con lanczos in una striscia RGBA trasparente larga quanto il
 *   video; la riconversione la sovrappone in basso a ogni fotogramma (overlay), invece di ridisegnare il
 *   testo per ogni fotogramma.
 * Riconversione: stessa risoluzione e frequenza, NVENC -cq 19 con ripiego su libx264, audio copiato,
 * +faststart; avanzamento da -progress (out_time) sulla durata letta con ffprobe; annullabile.
 */
import { spawn, execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeLog } from '../logger';

export const SHARE_TMP_DIR = path.join(os.homedir(), '.cache', 'x-launcher', 'share-tmp');

export function watermarkText(lang: string | undefined): string {
  return lang === 'en' ? 'Shared with X-Launcher' : 'Condiviso con X-Launcher';
}

function probeVideo(src: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise(resolve => {
    execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration',
      '-of', 'json', src], { timeout: 20_000 }, (err, out) => {
      try {
        const j = err ? {} : JSON.parse(String(out));
        const st = j.streams?.[0] ?? {};
        const d = parseFloat(j.format?.duration);
        resolve({ width: Number(st.width) || 0, height: Number(st.height) || 0, duration: Number.isFinite(d) && d > 0 ? d : 0 });
      } catch { resolve({ width: 0, height: 0, duration: 0 }); }
    });
  });
}

const FONT_FILE = path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-BlackItalic.ttf');
const BORDER_COLOR = '0x8c8c8c';
const OPACITY = 0.92;

/** Protezione di un valore dentro un filtro di ffmpeg racchiuso fra apici. */
function fq(v: string): string { return v.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'"); }

/**
 * Striscia RGBA (larga quanto il video, alta quanto serve) con la scritta allineata in basso a destra,
 * disegnata a risoluzione doppia e ridotta: è l'antialias della filigrana.
 */
async function renderStrip(textFile: string, width: number, height: number, out: string): Promise<{ ok: boolean; err: string; stripH: number }> {
  const fs2 = Math.round((2 * height) / 18);        // corpo, a risoluzione doppia
  const bw = Math.max(2, Math.round(fs2 / 14));     // spessore del bordo
  const margin = Math.round((2 * height) / 24);     // margine in basso e a destra
  let sh = fs2 * 2 + margin;                         // altezza della striscia (doppia), pari
  sh += sh % 2;
  const font = fs.existsSync(FONT_FILE) ? `fontfile='${fq(FONT_FILE)}'` : `font='Sans\\:style=Bold Italic'`;
  const dt = (fill: string, border: string) =>
    `drawtext=${font}:textfile='${fq(textFile)}':expansion=none:fontsize=${fs2}:fontcolor=${fill}:borderw=${bw}:bordercolor=${border}:x=w-tw-${margin}:y=h-th-${margin}`;
  const W2 = width * 2;
  const r = await runFfmpeg([
    '-v', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=${BORDER_COLOR}:s=${W2}x${sh},format=rgb24`,
    '-f', 'lavfi', '-i', `color=c=0x000000:s=${W2}x${sh},format=rgb24`,
    '-filter_complex',
    `[0]${dt('white', BORDER_COLOR)}[c];[1]${dt('white', 'white')},extractplanes=r,gblur=sigma=1[m];` +
    `[c][m]alphamerge,scale=iw/2:ih/2:flags=lanczos,format=rgba[o]`,
    '-map', '[o]', '-frames:v', '1', out,
  ], 0, () => {}, new AbortController().signal);
  return { ok: r.ok, err: r.err, stripH: sh / 2 };
}

function runFfmpeg(args: string[], duration: number, onProgress: (frac: number) => void, signal: AbortSignal):
  Promise<{ ok: boolean; cancelled?: boolean; err: string }> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve({ ok: false, cancelled: true, err: 'cancelled' }); return; }
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let buf = '';
    const onAbort = () => { try { child.kill('SIGKILL'); } catch { /* già uscito */ } };
    signal.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);   // entrambi in microsecondi (out_time_ms è un nome storico)
        if (m && duration > 0) onProgress(Math.min(1, Number(m[1]) / 1e6 / duration));
      }
    });
    child.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-2000); });
    child.on('error', e => { signal.removeEventListener('abort', onAbort); resolve({ ok: false, err: e.message }); });
    child.on('close', code => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) resolve({ ok: false, cancelled: true, err: 'cancelled' });
      else resolve({ ok: code === 0, err: code === 0 ? '' : `exit ${code} — ${stderr.trim().slice(-400)}` });
    });
  });
}

/** Copia con la filigrana. `dst` viene creato solo a lavoro riuscito (prima è un .part). */
export async function applyWatermark(src: string, dst: string, text: string, onProgress: (frac: number) => void, signal: AbortSignal):
  Promise<{ ok: true } | { ok: false; cancelled: boolean; err: string }> {
  fs.mkdirSync(path.dirname(dst), { recursive: true, mode: 0o700 });
  const textFile = `${dst}.txt`;
  const strip = `${dst}.wm.png`;
  const part = `${dst}.part`;
  fs.writeFileSync(textFile, text, { mode: 0o600 });
  const started = Date.now();
  try {
    const v = await probeVideo(src);
    if (!v.width || !v.height) return { ok: false, cancelled: false, err: 'ffprobe: video size not found' };
    if (!fs.existsSync(FONT_FILE)) writeLog('warning', `[SHARE] Watermark font not found (${FONT_FILE}): using fontconfig "Sans" bold italic.`);
    const st = await renderStrip(textFile, v.width, v.height, strip);
    if (!st.ok) return { ok: false, cancelled: false, err: `watermark layer: ${st.err}` };
    if (signal.aborted) return { ok: false, cancelled: true, err: 'cancelled' };
    const common = ['-v', 'error', '-nostats', '-progress', 'pipe:1', '-y', '-i', src, '-loop', '1', '-i', strip,
      '-filter_complex', `[1]format=rgba,colorchannelmixer=aa=${OPACITY}[w];[0][w]overlay=x=0:y=H-h:shortest=1[v]`,
      '-map', '[v]', '-map', '0:a?'];
    const tail = ['-c:a', 'copy', '-movflags', '+faststart', '-f', 'mp4', part];
    let r = await runFfmpeg([...common, '-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '19', '-b:v', '0', ...tail], v.duration, onProgress, signal);
    if (!r.ok && !r.cancelled) {
      writeLog('warning', `[SHARE] Watermark: NVENC encode failed (${r.err}), falling back to libx264.`);
      onProgress(0);
      r = await runFfmpeg([...common, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', ...tail], v.duration, onProgress, signal);
    }
    if (!r.ok) {
      fs.rmSync(part, { force: true });
      return { ok: false, cancelled: !!r.cancelled, err: r.err };
    }
    fs.renameSync(part, dst);
    writeLog('info', `[SHARE] Watermark applied in ${((Date.now() - started) / 1000).toFixed(1)} s (${v.duration.toFixed(1)} s of ${v.width}x${v.height} video).`);
    return { ok: true };
  } finally {
    fs.rmSync(textFile, { force: true });
    fs.rmSync(strip, { force: true });
  }
}

/** Avvio del demone: copie rimaste da un invio interrotto da un riavvio. */
export function cleanShareTmp(): void {
  try {
    for (const f of fs.readdirSync(SHARE_TMP_DIR)) fs.rmSync(path.join(SHARE_TMP_DIR, f), { force: true });
  } catch { /* cartella assente */ }
}
