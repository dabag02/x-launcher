/**
 * share/registry.ts — v3.2.29-dev.11 — servizi di condivisione registrati e stato degli accessi in corso.
 *
 * Aggiungere un servizio: un file in providers/ che implementa ShareProvider (base.ts) e una voce in
 * PROVIDERS. Nient'altro: rotte, eventi e Dashboard leggono da qui.
 *
 * Un accesso in corso per servizio (un secondo avvio annulla il primo). Lo stato resta consultabile per
 * 5 minuti dopo la fine, poi viene dimenticato. A ogni cambio di stato `onChange` (evento SSE
 * `share-updated` in server.ts).
 */
import type { ShareProvider, ShareAccount } from './base';
import { DeviceFlowError } from './deviceFlow';
import { YouTubeShareProvider } from './providers/youtube';
import { writeLog } from '../logger';
import fsp from 'fs/promises';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { applyWatermark, SHARE_TMP_DIR } from './watermark';

const PROVIDERS: ShareProvider[] = [
  new YouTubeShareProvider(),
];

export function getShareProvider(id: string): ShareProvider | undefined {
  return PROVIDERS.find(p => p.id === id);
}

export interface ShareProviderStatus {
  id: string; name: string; accepts: string[]; titleMax?: number; textMax: number; textMaxBytes?: number;
  visibility: 'private' | 'public'; notes: string[];
  configured: boolean; missing: string[];
  connected: boolean; account: ShareAccount | null;
}

export async function listShareProviders(verify: boolean): Promise<ShareProviderStatus[]> {
  return Promise.all(PROVIDERS.map(async p => {
    const cfg = p.configured();
    let account: ShareAccount | null = null;
    try { account = await p.account(verify && cfg.ok); } catch { account = null; }
    return {
      id: p.id, name: p.name, accepts: [...p.accepts], titleMax: p.titleMax, textMax: p.textMax, textMaxBytes: p.textMaxBytes,
      visibility: p.visibility, notes: [...p.notes],
      configured: cfg.ok, missing: cfg.missing,
      connected: !!account, account,
    };
  }));
}

export type LoginState =
  | { state: 'pending'; userCode: string; verificationUrl: string; verificationUrlComplete?: string; expiresAt: number }
  | { state: 'done'; account: ShareAccount }
  | { state: 'denied' | 'expired' | 'cancelled' }
  | { state: 'error'; code: string };

interface Session { id: number; abort: AbortController; status: LoginState; endedAt?: number }

const sessions = new Map<string, Session>();
let nextSession = 1;
const KEEP_ENDED_MS = 5 * 60_000;

export function getLoginState(providerId: string): LoginState | null {
  const s = sessions.get(providerId);
  if (!s) return null;
  if (s.endedAt && Date.now() - s.endedAt > KEEP_ENDED_MS) { sessions.delete(providerId); return null; }
  return s.status;
}

export async function startShareLogin(providerId: string, onChange: (id: string) => void):
  Promise<{ success: true; login: LoginState } | { success: false; code: string }> {
  const p = getShareProvider(providerId);
  if (!p) return { success: false, code: 'unknown-provider' };
  if (!p.configured().ok) return { success: false, code: 'not-configured' };
  cancelShareLogin(providerId, false);

  let grant;
  try {
    grant = await p.startLogin();
  } catch (err) {
    const code = err instanceof DeviceFlowError ? err.code : ((err as any)?.code || 'error');
    writeLog('warning', `[SHARE] ${p.name} sign-in could not start: ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, code };
  }
  const session: Session = {
    id: nextSession++,
    abort: new AbortController(),
    status: { state: 'pending', userCode: grant.userCode, verificationUrl: grant.verificationUrl,
      verificationUrlComplete: grant.verificationUrlComplete, expiresAt: grant.expiresAt },
  };
  sessions.set(providerId, session);
  writeLog('info', `[SHARE] ${p.name} sign-in started: code shown to the user, waiting for approval at ${grant.verificationUrl} ` +
    `(expires in ${Math.round((grant.expiresAt - Date.now()) / 60000)} min).`);

  p.completeLogin(grant, session.abort.signal).then(outcome => {
    if (sessions.get(providerId) !== session) return;           // sostituita da un nuovo accesso
    session.status = outcome.kind === 'done' ? { state: 'done', account: outcome.account }
      : outcome.kind === 'error' ? { state: 'error', code: outcome.code }
      : { state: outcome.kind };
    session.endedAt = Date.now();
    if (outcome.kind !== 'done') {
      writeLog(outcome.kind === 'cancelled' ? 'info' : 'warning',
        `[SHARE] ${p.name} sign-in ended: ${outcome.kind}${outcome.kind === 'error' ? ` (${outcome.code}${outcome.detail ? `: ${outcome.detail}` : ''})` : ''}.`);
    }
    onChange(providerId);
  }).catch(err => {
    if (sessions.get(providerId) !== session) return;
    session.status = { state: 'error', code: 'error' };
    session.endedAt = Date.now();
    writeLog('error', `[SHARE] ${p.name} sign-in failed: ${err instanceof Error ? err.message : String(err)}`);
    onChange(providerId);
  });

  return { success: true, login: session.status };
}

export function cancelShareLogin(providerId: string, forget = true): boolean {
  const s = sessions.get(providerId);
  if (!s) return false;
  if (!s.endedAt) s.abort.abort();
  if (forget) sessions.delete(providerId);
  return true;
}

export async function logoutShareProvider(providerId: string): Promise<boolean> {
  const p = getShareProvider(providerId);
  if (!p) return false;
  cancelShareLogin(providerId);
  await p.logout();
  return true;
}

// ---------------------------------------------------------------------------------------------------
// v3.2.29-dev.13 — invii (upload). Un invio alla volta: la banda dell'HTPC serve anche ai giochi.
// Stato in memoria (un riavvio del demone li dimentica); onProgress al più ogni 500 ms e a ogni cambio
// di stato (evento SSE share-progress), onFinish a fine invio (notifica). Un invio non riuscito resta
// ripetibile (retryShareUpload) finché il demone resta acceso e il file esiste ancora.
// ---------------------------------------------------------------------------------------------------

export interface ShareSourceResolved { path: string; kind: 'image' | 'video'; mime: string; gameId: string; gameTitle: string }

export interface ShareJobView {
  id: string; provider: string; providerName: string; gameId: string; gameTitle: string; title: string;
  state: 'uploading' | 'done' | 'error' | 'cancelled'; sent: number; size: number;
  startedAt: number; finishedAt?: number; url?: string; code?: string;
  // v3.2.29-dev.14 — con la filigrana l'invio passa prima dalla preparazione (riconversione della clip)
  phase: 'preparing' | 'uploading'; prepared: number;   // prepared = frazione 0–1 della preparazione
  watermark: boolean; uploadStartedAt?: number;          // inizio dell'invio vero (per il tempo stimato)
}

interface Job extends ShareJobView {
  source: unknown; text: string; abort: AbortController; watermarkText?: string;
}

const jobs = new Map<string, Job>();
const JOB_KEEP_MS = 6 * 3600_000;

export interface ShareUploadHooks {
  resolveSource: (source: unknown) => ShareSourceResolved | null;
  onProgress: (job: ShareJobView) => void;
  /** v3.2.29-dev.14 — riceve anche la sorgente (per annotare il contenuto come condiviso). */
  onFinish: (job: ShareJobView, source: unknown) => void;
  /** v3.2.29-dev.14 — testo della filigrana nella lingua della Dashboard. */
  watermarkText: () => string;
}

function view(j: Job): ShareJobView {
  const { source: _s, text: _t, abort: _a, watermarkText: _w, ...v } = j;
  return v;
}

function cleanText(s: unknown, max: number, oneLine: boolean): string {
  let v = typeof s === 'string' ? s : '';
  v = v.replace(/[<>]/g, '');                              // rifiutati da YouTube in titolo e descrizione
  v = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  if (oneLine) v = v.replace(/\s+/g, ' ');
  v = v.trim();
  if ([...v].length > max) v = [...v].slice(0, max).join('');
  return v;
}

/** Taglia una stringa a `max` byte UTF-8 senza spezzare un carattere (YouTube conta la descrizione in byte). */
function clipBytes(s: string, max: number): string {
  if (Buffer.byteLength(s, 'utf8') <= max) return s;
  let out = '';
  let n = 0;
  for (const ch of s) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (n + b > max) break;
    out += ch; n += b;
  }
  return out;
}

export function getShareJob(id: string): ShareJobView | null {
  const j = jobs.get(id);
  return j ? view(j) : null;
}
export function activeShareJob(): ShareJobView | null {
  for (const j of jobs.values()) if (j.state === 'uploading') return view(j);
  return null;
}

export async function startShareUpload(providerId: string, body: { source?: unknown; title?: unknown; text?: unknown; watermark?: unknown }, hooks: ShareUploadHooks):
  Promise<{ success: true; job: ShareJobView } | { success: false; code: string }> {
  const p = getShareProvider(providerId);
  if (!p) return { success: false, code: 'unknown-provider' };
  if (activeShareJob()) return { success: false, code: 'busy' };
  const src = hooks.resolveSource(body.source);
  if (!src) return { success: false, code: 'source-missing' };
  if (!p.accepts.includes(src.kind)) return { success: false, code: 'unsupported' };
  if (!(await p.account(false))) return { success: false, code: 'not-connected' };

  const title = p.titleMax ? (cleanText(body.title, p.titleMax, true) || cleanText(src.gameTitle || 'X-Launcher', p.titleMax, true)) : '';
  let text = cleanText(body.text, p.textMax, false);
  const clipped = p.textMaxBytes ? clipBytes(text, p.textMaxBytes) : text;
  if (clipped !== text) {
    writeLog('info', `[SHARE] ${p.name}: description shortened to ${p.textMaxBytes} bytes (${[...clipped].length} characters).`);
    text = clipped;
  }

  for (const [id, j] of jobs) if (j.finishedAt && Date.now() - j.finishedAt > JOB_KEEP_MS) jobs.delete(id);

  // v3.2.29-dev.14 — filigrana solo sui video; l'originale non viene mai toccato
  const watermark = body.watermark === true && src.kind === 'video';
  let size = 0;
  try { size = (await fsp.stat(src.path)).size; } catch { return { success: false, code: 'source-missing' }; }
  const job: Job = {
    id: crypto.randomBytes(6).toString('hex'), provider: p.id, providerName: p.name,
    gameId: src.gameId, gameTitle: src.gameTitle, title, text, source: body.source,
    state: 'uploading', sent: 0, size, startedAt: Date.now(), abort: new AbortController(),
    phase: watermark ? 'preparing' : 'uploading', prepared: 0, watermark, uploadStartedAt: watermark ? undefined : Date.now(),
    watermarkText: watermark ? hooks.watermarkText() : undefined,
  };
  jobs.set(job.id, job);
  writeLog('info', `[SHARE] ${p.name} upload ${job.id} started: ${src.path} (${(size / 1048576).toFixed(1)} MB, ${src.mime}${watermark ? ', with watermark' : ''}).`);
  hooks.onProgress(view(job));

  let lastEmit = 0;
  const emitThrottled = () => {
    const now = Date.now();
    if (now - lastEmit >= 500) { lastEmit = now; hooks.onProgress(view(job)); }
  };
  const marked = watermark ? path.join(SHARE_TMP_DIR, `${job.id}.mp4`) : null;

  (async () => {
    let uploadPath = src.path;
    if (marked) {
      const w = await applyWatermark(src.path, marked, job.watermarkText!, frac => { job.prepared = frac; emitThrottled(); }, job.abort.signal);
      if (!w.ok) {
        if (w.cancelled) return { ok: false as const, code: 'cancelled' };
        writeLog('warning', `[SHARE] Watermark failed for upload ${job.id}: ${w.err}`);
        return { ok: false as const, code: 'watermark-failed', detail: w.err };
      }
      uploadPath = marked;
      job.phase = 'uploading'; job.prepared = 1; job.uploadStartedAt = Date.now();
      try { job.size = (await fsp.stat(marked)).size; } catch { /* resta quella dell'originale */ }
      hooks.onProgress(view(job));
    }
    // file aperto prima dell'invio: una clip temporanea scartata nel frattempo resta leggibile
    let file: fsp.FileHandle;
    try { file = await fsp.open(uploadPath, 'r'); } catch { return { ok: false as const, code: 'source-missing' }; }
    try {
      return await p.upload({ file, size: job.size, mime: src.mime, kind: src.kind, title, text }, sent => {
        job.sent = sent;
        emitThrottled();
      }, job.abort.signal);
    } finally {
      file.close().catch(() => {});
    }
  })().then(r => {
    if (r.ok) { job.state = 'done'; job.url = r.url; job.sent = job.size; }
    else { job.state = r.code === 'cancelled' ? 'cancelled' : 'error'; job.code = r.code; }
    job.finishedAt = Date.now();
    const secs = ((job.finishedAt - job.startedAt) / 1000).toFixed(0);
    if (r.ok) writeLog('info', `[SHARE] ${p.name} upload ${job.id} done in ${secs} s: ${r.url}`);
    else writeLog(r.code === 'cancelled' ? 'info' : 'warning',
      `[SHARE] ${p.name} upload ${job.id} ${r.code === 'cancelled' ? 'cancelled' : `failed (${r.code}${'detail' in r && r.detail ? `: ${r.detail}` : ''})`} after ${secs} s at ${job.sent}/${job.size} bytes.`);
  }).catch(err => {
    job.state = 'error'; job.code = 'error'; job.finishedAt = Date.now();
    writeLog('error', `[SHARE] ${p.name} upload ${job.id} crashed: ${err instanceof Error ? err.stack || err.message : String(err)}`);
  }).finally(() => {
    if (marked) { fs.rmSync(marked, { force: true }); fs.rmSync(`${marked}.part`, { force: true }); }
    hooks.onProgress(view(job));
    if (job.state !== 'cancelled') hooks.onFinish(view(job), job.source);
  });
  return { success: true, job: view(job) };
}

export function cancelShareUpload(id: string): boolean {
  const j = jobs.get(id);
  if (!j || j.state !== 'uploading') return false;
  j.abort.abort();
  return true;
}

/** Ripete un invio non riuscito con gli stessi dati (azione «Riprova» della notifica). */
export function retryShareUpload(id: string, hooks: ShareUploadHooks) {
  const j = jobs.get(id);
  if (!j) return Promise.resolve({ success: false as const, code: 'job-expired' });
  if (j.state === 'uploading' || j.state === 'done') return Promise.resolve({ success: false as const, code: 'busy' });
  return startShareUpload(j.provider, { source: j.source, title: j.title, text: j.text, watermark: j.watermark }, hooks);
}
