/**
 * share/providers/youtube.ts — v3.2.29-dev.11 — servizio di condivisione YouTube (solo video).
 *
 * Client OAuth creato dall'utente su Google Cloud, tipo «TVs and Limited Input devices» (l'unico che
 * accetta il flusso col codice dal telefono), con la YouTube Data API v3 abilitata. Credenziali nel
 * .env del demone: X_LAUNCHER_YOUTUBE_CLIENT_ID, X_LAUNCHER_YOUTUBE_CLIENT_SECRET (guida in INSTALL.md).
 *
 * Scope: `https://www.googleapis.com/auth/youtube`. Il flusso per dispositivi non accetta
 * `youtube.upload`: fra gli scope di YouTube consente solo `youtube` e `youtube.readonly`.
 *
 * Limiti di Google, mostrati nella Dashboard (note `youtube-private-only`, `youtube-testing-7d`):
 * - con un progetto non verificato da Google i video caricati via API restano privati;
 * - con il progetto in stato «Testing» il refresh token scade dopo 7 giorni: va pubblicato
 *   («In production»), altrimenti l'accesso va rifatto ogni settimana.
 *
 * Token: db.saveToken('share-youtube', { refreshToken, account }) — file tokens.json 0600, cifrato a
 * riposo. L'access token (1 h) resta solo in memoria.
 *
 * v3.2.29-dev.13 — upload(): caricamento ripristinabile (resumable upload) della YouTube Data API.
 *   1. POST .../upload/youtube/v3/videos?uploadType=resumable&part=snippet,status con i metadati (titolo,
 *      descrizione, categoria Giochi, privato, non destinato ai bambini) → indirizzo della sessione;
 *   2. PUT a blocchi di 4 MiB (multipli di 256 KiB come richiesto) con Content-Range; 308 = blocco
 *      ricevuto (l'intestazione Range dice fin dove), 200/201 = video creato;
 *   3. errore di rete o 5xx: attesa crescente (1, 2, 4, 8, 16 s) e richiesta dello stato della sessione
 *      (PUT vuoto con «bytes * /totale») per ripartire dall'ultimo byte ricevuto; 401 = token rinnovato.
 * Codici d'errore restituiti (tradotti dalla Dashboard): not-connected, quota, upload-limit, no-channel,
 * forbidden, bad-request, network, http-<status>.
 */
import type { ShareAccount, ShareProvider, LoginOutcome, ShareUploadRequest, ShareUploadResult } from '../base';
import { requestDeviceCode, pollDeviceToken, refreshAccessToken, postForm, DeviceCodeGrant } from '../deviceFlow';
import * as db from '../../db';
import { writeLog } from '../../logger';

const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const CHUNK = 4 * 1024 * 1024;                 // multiplo di 256 KiB
const RETRY_DELAYS_S = [1, 2, 4, 8, 16];
const GAMING_CATEGORY = '20';
const SCOPE = 'https://www.googleapis.com/auth/youtube';
const STORE_ID = 'share-youtube';
const ENV_ID = 'X_LAUNCHER_YOUTUBE_CLIENT_ID';
const ENV_SECRET = 'X_LAUNCHER_YOUTUBE_CLIENT_SECRET';

interface Stored { refreshToken?: string; account?: ShareAccount; connectedAt?: number }

function load(): Stored {
  const raw = db.loadToken(STORE_ID);
  if (!raw) return {};
  try { return JSON.parse(raw) as Stored; } catch { return {}; }
}
function save(s: Stored): void { db.saveToken(STORE_ID, JSON.stringify(s)); }

function client(): { client_id: string; client_secret: string } | null {
  const id = (process.env[ENV_ID] || '').trim();
  const secret = (process.env[ENV_SECRET] || '').trim();
  return id && secret ? { client_id: id, client_secret: secret } : null;
}

export class YouTubeShareProvider implements ShareProvider {
  readonly id = 'youtube';
  readonly name = 'YouTube';
  readonly accepts = ['video' as const];
  readonly titleMax = 100;      // limiti di YouTube per titolo e descrizione
  readonly textMax = 5000;
  readonly textMaxBytes = 5000;  // la descrizione di YouTube è limitata a 5000 byte UTF-8 (le lettere accentate valgono 2)
  readonly visibility = 'private' as const;
  readonly notes = ['youtube-private-only'];

  private access: { token: string; expiresAt: number } | null = null;

  configured() {
    const missing = [ENV_ID, ENV_SECRET].filter(k => !(process.env[k] || '').trim());
    return { ok: missing.length === 0, missing };
  }

  /** Access token valido (rinnovato se manca o scade fra meno di 60 s). Usato anche dall'upload (dev.13). */
  async accessToken(force = false): Promise<{ kind: 'ok'; token: string } | { kind: 'disconnected' } | { kind: 'error'; detail: string }> {
    const s = load();
    const c = client();
    if (!s.refreshToken) return { kind: 'disconnected' };
    if (!c) return { kind: 'error', detail: 'client credentials missing from .env' };
    if (!force && this.access && this.access.expiresAt - Date.now() > 60_000) return { kind: 'ok', token: this.access.token };
    const r = await refreshAccessToken(TOKEN_URL, c, s.refreshToken);
    if (r.kind === 'ok') {
      this.access = { token: r.token.access_token, expiresAt: Date.now() + (Number(r.token.expires_in) || 3600) * 1000 };
      return { kind: 'ok', token: this.access.token };
    }
    if (r.kind === 'revoked') {
      const days = s.connectedAt ? ((Date.now() - s.connectedAt) / 86_400_000).toFixed(1) : '?';
      writeLog('warning', `[SHARE] YouTube access no longer valid (${r.detail}) after ${days} day(s) — disconnected. ` +
        'If this happens every 7 days the Google Cloud OAuth consent screen is still in "Testing": publish it ("In production") and sign in again.');
      this.access = null;
      save({});
      return { kind: 'disconnected' };
    }
    writeLog('warning', `[SHARE] YouTube token refresh failed: ${r.detail}`);
    return { kind: 'error', detail: r.detail };
  }

  async account(verify: boolean): Promise<ShareAccount | null> {
    const s = load();
    if (!s.refreshToken || !s.account) return null;
    if (!verify || !client()) return s.account;
    const t = await this.accessToken();
    return t.kind === 'disconnected' ? null : s.account;   // errore di rete: resta collegato
  }

  async startLogin(): Promise<DeviceCodeGrant> {
    const c = client();
    if (!c) throw Object.assign(new Error('client credentials missing from .env'), { code: 'not-configured' });
    return requestDeviceCode(DEVICE_CODE_URL, { client_id: c.client_id, scope: SCOPE });
  }

  async completeLogin(grant: DeviceCodeGrant, signal: AbortSignal): Promise<LoginOutcome> {
    const c = client();
    if (!c) return { kind: 'error', code: 'not-configured' };
    const r = await pollDeviceToken(TOKEN_URL, c, grant, signal);
    if (r.kind !== 'token') return r;
    if (!r.token.refresh_token) {
      writeLog('warning', '[SHARE] YouTube sign-in returned no refresh token — cannot keep the account connected.');
      return { kind: 'error', code: 'no-refresh-token' };
    }
    if (r.token.scope && !r.token.scope.split(/\s+/).includes(SCOPE)) {
      writeLog('warning', `[SHARE] YouTube sign-in granted scopes "${r.token.scope}" without ${SCOPE}.`);
      await this.revoke(r.token.refresh_token);
      return { kind: 'error', code: 'scope-not-granted' };
    }
    // canale dell'account: senza un canale YouTube non si può caricare nulla
    let account: ShareAccount | null = null;
    try {
      const res = await fetch(CHANNELS_URL, {
        headers: { Authorization: `Bearer ${r.token.access_token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reason = j?.error?.errors?.[0]?.reason || j?.error?.status || res.status;
        writeLog('warning', `[SHARE] YouTube channel lookup failed (${res.status} ${reason}): ${String(j?.error?.message || '').slice(0, 300)}`);
        await this.revoke(r.token.refresh_token);
        return { kind: 'error', code: reason === 'accessNotConfigured' ? 'api-disabled' : 'channel-lookup', detail: String(reason) };
      }
      const ch = Array.isArray(j.items) ? j.items[0] : null;
      if (ch?.id) account = { id: String(ch.id), name: String(ch.snippet?.title || ch.id) };
    } catch (err) {
      writeLog('warning', `[SHARE] YouTube channel lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      await this.revoke(r.token.refresh_token);
      return { kind: 'error', code: 'network' };
    }
    if (!account) {
      writeLog('warning', '[SHARE] YouTube sign-in: the Google account has no YouTube channel.');
      await this.revoke(r.token.refresh_token);
      return { kind: 'error', code: 'no-channel' };
    }
    this.access = { token: r.token.access_token, expiresAt: Date.now() + (Number(r.token.expires_in) || 3600) * 1000 };
    save({ refreshToken: r.token.refresh_token, account, connectedAt: Date.now() });
    writeLog('info', `[SHARE] YouTube connected: channel "${account.name}" (${account.id}).`);
    return { kind: 'done', account };
  }

  private async revoke(token: string): Promise<boolean> {
    try {
      const r = await postForm(REVOKE_URL, { token });
      return r.status === 200;
    } catch { return false; }
  }

  async logout(): Promise<void> {
    const s = load();
    this.access = null;
    save({});
    if (s.refreshToken) {
      const ok = await this.revoke(s.refreshToken);
      writeLog('info', `[SHARE] YouTube disconnected${ok ? ' (access revoked at Google)' : ' (local tokens removed; revocation at Google not confirmed)'}.`);
    }
  }

  async upload(req: ShareUploadRequest, onProgress: (sent: number) => void, signal: AbortSignal): Promise<ShareUploadResult> {
    let tok = await this.accessToken();
    if (tok.kind === 'disconnected') return { ok: false, code: 'not-connected' };
    if (tok.kind === 'error') return { ok: false, code: 'network', detail: tok.detail };
    const errOf = async (res: Response): Promise<{ code: string; detail: string }> => {
      const j: any = await res.json().catch(() => ({}));
      const reason = String(j?.error?.errors?.[0]?.reason || j?.error?.status || '');
      const detail = `${res.status} ${reason} ${String(j?.error?.message || '').slice(0, 300)}`.trim();
      const code = reason === 'quotaExceeded' || reason === 'rateLimitExceeded' ? 'quota'
        : reason === 'uploadLimitExceeded' ? 'upload-limit'
        : reason === 'youtubeSignupRequired' ? 'no-channel'
        : res.status === 403 ? 'forbidden'
        : res.status === 400 ? 'bad-request'
        : `http-${res.status}`;
      return { code, detail };
    };

    // 1. sessione
    const meta = {
      snippet: { title: req.title, description: req.text, categoryId: GAMING_CATEGORY },
      status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
    };
    let session = '';
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(UPLOAD_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tok.token}`, 'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Length': String(req.size), 'X-Upload-Content-Type': req.mime,
          },
          body: JSON.stringify(meta),
          signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
        });
      } catch (err) {
        if (signal.aborted) return { ok: false, code: 'cancelled' };
        if (attempt >= RETRY_DELAYS_S.length) return { ok: false, code: 'network', detail: String(err) };
        if (!(await wait(RETRY_DELAYS_S[attempt] * 1000, signal))) return { ok: false, code: 'cancelled' };
        continue;
      }
      if (res.status === 401 && attempt === 0) {
        tok = await this.accessToken(true);
        if (tok.kind !== 'ok') return { ok: false, code: tok.kind === 'disconnected' ? 'not-connected' : 'network' };
        continue;
      }
      if (res.status >= 500 && attempt < RETRY_DELAYS_S.length) {
        if (!(await wait(RETRY_DELAYS_S[attempt] * 1000, signal))) return { ok: false, code: 'cancelled' };
        continue;
      }
      if (!res.ok) { const e = await errOf(res); return { ok: false, ...e }; }
      session = res.headers.get('location') || '';
      if (!session) return { ok: false, code: 'bad-response', detail: 'no upload session URL' };
      break;
    }

    // 2. blocchi
    let offset = 0;
    let failures = 0;
    let refreshed = false;
    const buf = Buffer.allocUnsafe(CHUNK);
    const nextOffset = (res: Response): number => {
      const range = res.headers.get('range');           // «bytes=0-4194303»
      const m = range && /bytes=0-(\d+)/.exec(range);
      return m ? Number(m[1]) + 1 : 0;
    };
    const finished = async (res: Response): Promise<ShareUploadResult> => {
      const j: any = await res.json().catch(() => ({}));
      if (!j?.id) return { ok: false, code: 'bad-response', detail: 'upload finished without a video id' };
      onProgress(req.size);
      return { ok: true, id: String(j.id), url: `https://youtu.be/${j.id}` };
    };
    while (true) {
      if (signal.aborted) return { ok: false, code: 'cancelled' };
      const len = Math.min(CHUNK, req.size - offset);
      let res: Response;
      try {
        let body: Uint8Array;
        if (len > 0) {
          const { bytesRead } = await req.file.read(buf, 0, len, offset);
          if (bytesRead !== len) return { ok: false, code: 'read-error', detail: `read ${bytesRead}/${len} bytes at ${offset}` };
          body = new Uint8Array(buf.buffer, buf.byteOffset, len);
        } else {
          body = new Uint8Array(0);
        }
        res = await fetch(session, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${tok.token}`, 'Content-Type': req.mime,
            'Content-Range': len > 0 ? `bytes ${offset}-${offset + len - 1}/${req.size}` : `bytes */${req.size}`,
          },
          body,
          signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
        });
      } catch (err) {
        if (signal.aborted) return { ok: false, code: 'cancelled' };
        if (failures >= RETRY_DELAYS_S.length) return { ok: false, code: 'network', detail: String(err) };
        writeLog('warning', `[SHARE] YouTube upload interrupted at ${offset}/${req.size} bytes (${err instanceof Error ? err.message : String(err)}) — retrying in ${RETRY_DELAYS_S[failures]} s.`);
        if (!(await wait(RETRY_DELAYS_S[failures++] * 1000, signal))) return { ok: false, code: 'cancelled' };
        const st = await this.queryStatus(session, tok.token, req.size, signal);
        if (st.kind === 'done') return finished(st.res);
        if (st.kind === 'offset') offset = st.offset;
        continue;
      }
      if (res.status === 200 || res.status === 201) return finished(res);
      if (res.status === 308) {
        offset = nextOffset(res);
        failures = 0;
        onProgress(offset);
        continue;
      }
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        tok = await this.accessToken(true);
        if (tok.kind !== 'ok') return { ok: false, code: tok.kind === 'disconnected' ? 'not-connected' : 'network' };
        continue;
      }
      if (res.status >= 500 && failures < RETRY_DELAYS_S.length) {
        writeLog('warning', `[SHARE] YouTube upload: server error ${res.status} at ${offset}/${req.size} bytes — retrying in ${RETRY_DELAYS_S[failures]} s.`);
        if (!(await wait(RETRY_DELAYS_S[failures++] * 1000, signal))) return { ok: false, code: 'cancelled' };
        const st = await this.queryStatus(session, tok.token, req.size, signal);
        if (st.kind === 'done') return finished(st.res);
        if (st.kind === 'offset') offset = st.offset;
        continue;
      }
      const e = await errOf(res);
      return { ok: false, ...e };
    }
  }

  /** Stato di una sessione interrotta: fin dove YouTube ha ricevuto il file (o se ha già finito). */
  private async queryStatus(session: string, token: string, size: number, signal: AbortSignal):
    Promise<{ kind: 'offset'; offset: number } | { kind: 'done'; res: Response } | { kind: 'unknown' }> {
    try {
      const res = await fetch(session, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Range': `bytes */${size}`, 'Content-Length': '0' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      });
      if (res.status === 200 || res.status === 201) return { kind: 'done', res };
      if (res.status === 308) {
        const range = res.headers.get('range');
        const m = range && /bytes=0-(\d+)/.exec(range);
        return { kind: 'offset', offset: m ? Number(m[1]) + 1 : 0 };
      }
    } catch { /* si riprova col blocco dall'ultimo punto noto */ }
    return { kind: 'unknown' };
  }
}

function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(false); return; }
    const t = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(true); }, ms);
    const onAbort = () => { clearTimeout(t); resolve(false); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
