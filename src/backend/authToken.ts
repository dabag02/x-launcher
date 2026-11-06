/**
 * authToken.ts — v3.0.2-dev.3 (audit di sicurezza, punto 1: autenticazione).
 *
 * Fino alla dev.2 il demone HTTP accettava qualunque richiesta locale. Ora le rotte `/api`
 * (e `/avatars`) richiedono un token segreto:
 *
 *  - Il token (64 caratteri esadecimali, 256 bit) vive in `~/.local/share/x-launcher/api-token`
 *    con permessi 0600. Lo crea il demone al primo avvio e non cambia finche' non cancelli il file.
 *  - Script e tray.py lo mandano nell'header `X-XLauncher-Token` (o `Authorization: Bearer`).
 *  - Il browser (Chromium/Firefox lanciati da kiosk-launch.sh, gamescope-session.sh, o un altro
 *    dispositivo) lo ottiene UNA volta: apre `/?xl_nonce=<codice monouso>` oppure
 *    `/?xl_token=<token>`; il demone risponde con un cookie `xl_session` HttpOnly +
 *    SameSite=Strict e riporta il browser all'URL pulito. Il codice monouso (`POST /api/auth/nonce`,
 *    che richiede l'header col token) vale 60 secondi e una sola volta: cosi' il token vero non
 *    compare mai nella riga di comando del browser (visibile con `ps`).
 *  - Il valore del cookie NON e' il token ma un suo derivato (HMAC): chi lo ruba dal browser non
 *    ricava il token.
 *
 * Esenti: `GET /api/status` (serve agli script per sapere se il demone e' su; restituisce solo
 * lo stato e l'uptime).
 *
 * Nessuna dipendenza da Express: i tipi sono strutturali, il modulo si prova da solo.
 */
import { randomBytes, createHash, createHmac, timingSafeEqual } from 'crypto';
import { readFileSync, writeFileSync, renameSync, chmodSync, mkdirSync } from 'fs';
import path from 'path';

export const TOKEN_FILE_NAME = 'api-token';
export const SESSION_COOKIE = 'xl_session';
const TOKEN_RX = /^[0-9a-f]{64}$/;
const NONCE_TTL_MS = 60_000;
const NONCE_MAX = 32;
const COOKIE_MAX_AGE_S = 365 * 24 * 3600;

export type HeaderMap = Record<string, string | string[] | undefined>;
export type AuthVia = 'token' | 'cookie';

/** Legge il token da `dataDir/api-token`; se manca o e' malformato ne crea uno nuovo (0600). */
export function loadOrCreateToken(dataDir: string): string {
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, TOKEN_FILE_NAME);
  try {
    const cur = readFileSync(file, 'utf8').trim();
    if (TOKEN_RX.test(cur)) {
      try { chmodSync(file, 0o600); } catch { /* file di un altro utente: lo si usa comunque */ }
      return cur;
    }
  } catch { /* assente: lo creiamo */ }
  const token = randomBytes(32).toString('hex');
  // Scrittura su file temporaneo 0600 + rename: il token non esiste mai in un file leggibile da altri.
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, token + '\n', { mode: 0o600 });
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* ignorato */ }
  return token;
}

/** Confronto a tempo costante (si confrontano gli hash, quindi anche la lunghezza non trapela). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Valore del cookie di sessione: derivato dal token, non il token. */
export function sessionValue(token: string): string {
  return createHmac('sha256', token).update('xl-session-v1').digest('hex');
}

/** Codici monouso per l'apertura del browser. */
export class NonceStore {
  private map = new Map<string, number>();
  constructor(private now: () => number = Date.now) {}

  issue(): string {
    const t = this.now();
    for (const [k, exp] of this.map) if (exp <= t) this.map.delete(k);
    while (this.map.size >= NONCE_MAX) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
    const n = randomBytes(16).toString('hex');
    this.map.set(n, t + NONCE_TTL_MS);
    return n;
  }

  /** true una sola volta per codice, entro 60 secondi. */
  consume(n: string): boolean {
    const exp = this.map.get(n);
    if (exp === undefined) return false;
    this.map.delete(n);
    return exp > this.now();
  }
}

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

function cookieValue(header: string, name: string): string {
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

/** Come si e' autenticata la richiesta, o null. Il cookie vale solo come sessione del browser. */
export function authenticate(headers: HeaderMap, token: string): AuthVia | null {
  const h = first(headers['x-xlauncher-token']);
  if (h && safeEqual(h, token)) return 'token';
  const a = first(headers['authorization']);
  if (/^bearer\s+/i.test(a) && safeEqual(a.replace(/^bearer\s+/i, '').trim(), token)) return 'token';
  const c = cookieValue(first(headers['cookie']), SESSION_COOKIE);
  if (c && safeEqual(c, sessionValue(token))) return 'cookie';
  return null;
}

export interface AuthRequest {
  method?: string;
  headers: HeaderMap;
  originalUrl?: string;
  url?: string;
}

export interface AuthResponse {
  status(code: number): AuthResponse;
  json(body: unknown): unknown;
  type(t: string): AuthResponse;
  send(body: string): unknown;
  setHeader(name: string, value: string): unknown;
  redirect(code: number, url: string): unknown;
}

export interface AuthOptions {
  token: string;
  nonces: NonceStore;
  /** false = autenticazione spenta (X_LAUNCHER_AUTH=off): tutto passa. */
  enabled?: boolean;
  onReject?: (what: string) => void;
}

const PROTECTED_PREFIXES = ['/api', '/avatars'];

function isProtectedPath(p: string): boolean {
  return PROTECTED_PREFIXES.some(pre => p === pre || p.startsWith(pre + '/'));
}

const INFO_PAGE = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>X-Launcher — accesso richiesto</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px/1.5 system-ui,sans-serif;background:#0f1115;color:#e6e6e6;max-width:42rem;margin:12vh auto;padding:0 1.2rem}
code{background:#1c2029;padding:.1em .4em;border-radius:4px}h1{font-size:1.3rem}</style></head><body>
<h1>Accesso richiesto</h1>
<p>Questa Dashboard ora richiede un token. Dal computer su cui gira X-Launcher:</p>
<p><code>cat ~/.local/share/x-launcher/api-token</code></p>
<p>poi apri questo indirizzo con il token in coda (una volta sola, il browser lo ricorda):</p>
<p><code>http://&lt;indirizzo-di-questa-pagina&gt;/?xl_token=&lt;token&gt;</code></p>
<p>Se avvii la Dashboard con <code>kiosk-launch.sh</code> o <code>gamescope-session.sh</code> lo fa da solo.</p>
</body></html>`;

/**
 * Middleware. Va montato DOPO requestGuard e PRIMA delle rotte.
 *  1. Apertura del browser: `GET <non-api>?xl_nonce=…|xl_token=…` validi -> cookie + redirect all'URL pulito.
 *  2. `/api` e `/avatars` senza credenziali valide -> 401 JSON.
 *  3. Navigazioni HTML senza cookie -> pagina di istruzioni (401), cosi' non si vede una UI vuota.
 */
export function authMiddleware(opts: AuthOptions) {
  const { token, nonces, enabled = true, onReject } = opts;
  return (req: AuthRequest, res: AuthResponse, next: () => void): void => {
    if (!enabled) { next(); return; }

    const method = (req.method ?? 'GET').toUpperCase();
    const rawUrl = req.originalUrl ?? req.url ?? '/';
    let u: URL;
    try { u = new URL(rawUrl, 'http://localhost'); } catch { res.status(400).json({ success: false }); return; }
    const p = u.pathname;
    const via = authenticate(req.headers, token);

    // 1. Apertura del browser (solo su percorsi non-API, solo GET/HEAD).
    if ((method === 'GET' || method === 'HEAD') && !isProtectedPath(p)) {
      const xlToken = u.searchParams.get('xl_token');
      const xlNonce = u.searchParams.get('xl_nonce');
      if (xlToken !== null || xlNonce !== null) {
        const ok = (xlToken !== null && safeEqual(xlToken, token)) || (xlNonce !== null && nonces.consume(xlNonce));
        if (ok) {
          u.searchParams.delete('xl_token');
          u.searchParams.delete('xl_nonce');
          res.setHeader('Set-Cookie',
            `${SESSION_COOKIE}=${sessionValue(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_S}`);
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Referrer-Policy', 'no-referrer');
          res.redirect(302, u.pathname + u.search);
          return;
        }
        onReject?.('codice di apertura non valido o scaduto');
        // cade sotto: senza credenziali valide si ottiene la pagina di istruzioni
      }
    }

    if (via) { next(); return; }

    // Esente: sonda di disponibilita' degli script.
    if (method === 'GET' && p === '/api/status') { next(); return; }

    if (isProtectedPath(p)) {
      onReject?.(`${method} ${p} senza credenziali valide`);
      res.status(401).json({ success: false, message: 'Autenticazione richiesta.' });
      return;
    }

    // Pagine HTML senza cookie: istruzioni. Asset statici (js/css/immagini) passano: non sono segreti.
    if ((method === 'GET' || method === 'HEAD') && first(req.headers['accept']).includes('text/html')) {
      res.status(401).type('html').send(INFO_PAGE);
      return;
    }
    next();
  };
}
