/**
 * share/deviceFlow.ts — v3.2.29-dev.11 — OAuth 2.0 Device Authorization Grant (RFC 8628), comune a
 * tutti i servizi di condivisione.
 *
 * 1. requestDeviceCode(): il servizio restituisce device_code (segreto, resta qui), user_code (da
 *    mostrare), indirizzo di verifica, scadenza e intervallo di attesa.
 * 2. pollDeviceToken(): chiede il token ogni `interval` finché l'utente non approva o rifiuta, il codice
 *    scade o l'attesa viene annullata. `authorization_pending` = continua; `slow_down` = +5 s
 *    all'intervallo (RFC 8628 §3.5).
 */

export interface DeviceCodeGrant {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  /** Indirizzo con il codice già compilato, se il servizio lo fornisce (per il QR). */
  verificationUrlComplete?: string;
  expiresAt: number;     // epoch ms
  intervalMs: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export type PollResult =
  | { kind: 'token'; token: TokenResponse }
  | { kind: 'denied' }
  | { kind: 'expired' }
  | { kind: 'cancelled' }
  | { kind: 'error'; code: string; detail?: string };

const HTTP_TIMEOUT_MS = 15_000;

async function postForm(url: string, params: Record<string, string>, signal?: AbortSignal): Promise<{ status: number; body: any }> {
  const timeout = AbortSignal.timeout(HTTP_TIMEOUT_MS);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: 'invalid_json', error_description: text.slice(0, 300) }; }
  return { status: res.status, body };
}

export class DeviceFlowError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export async function requestDeviceCode(endpoint: string, params: Record<string, string>): Promise<DeviceCodeGrant> {
  let r: { status: number; body: any };
  try {
    r = await postForm(endpoint, params);
  } catch (err) {
    throw new DeviceFlowError('network', `device code request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const b = r.body;
  if (r.status !== 200 || !b.device_code || !b.user_code) {
    const code = String(b.error || `http-${r.status}`);
    throw new DeviceFlowError(code.replace(/_/g, '-'), `device code request refused (${r.status}): ${code}${b.error_description ? ` — ${b.error_description}` : ''}`);
  }
  const verificationUrl = String(b.verification_uri || b.verification_url || '');
  return {
    deviceCode: String(b.device_code),
    userCode: String(b.user_code),
    verificationUrl,
    verificationUrlComplete: b.verification_uri_complete ? String(b.verification_uri_complete) : undefined,
    expiresAt: Date.now() + Math.max(60, Number(b.expires_in) || 600) * 1000,
    intervalMs: Math.max(1, Number(b.interval) || 5) * 1000,
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(false); return; }
    const t = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(true); }, ms);
    const onAbort = () => { clearTimeout(t); resolve(false); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function pollDeviceToken(
  tokenEndpoint: string,
  params: Record<string, string>,      // client_id, client_secret…
  grant: DeviceCodeGrant,
  signal: AbortSignal,
): Promise<PollResult> {
  let interval = grant.intervalMs;
  let networkErrors = 0;
  while (true) {
    if (!(await sleep(interval, signal))) return { kind: 'cancelled' };
    if (Date.now() >= grant.expiresAt) return { kind: 'expired' };
    let r: { status: number; body: any };
    try {
      r = await postForm(tokenEndpoint, {
        ...params,
        device_code: grant.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }, signal);
      networkErrors = 0;
    } catch (err) {
      if (signal.aborted) return { kind: 'cancelled' };
      // rete instabile: si riprova fino alla scadenza del codice, ma non all'infinito di fila
      if (++networkErrors >= 10) return { kind: 'error', code: 'network', detail: err instanceof Error ? err.message : String(err) };
      continue;
    }
    if (r.status === 200 && r.body.access_token) return { kind: 'token', token: r.body as TokenResponse };
    const e = String(r.body.error || '');
    if (e === 'authorization_pending') continue;
    if (e === 'slow_down') { interval += 5000; continue; }
    if (e === 'access_denied') return { kind: 'denied' };
    if (e === 'expired_token') return { kind: 'expired' };
    return { kind: 'error', code: (e || `http-${r.status}`).replace(/_/g, '-'), detail: r.body.error_description };
  }
}

/** Rinnovo dell'access token col refresh token (grant standard, RFC 6749 §6). */
export async function refreshAccessToken(tokenEndpoint: string, params: Record<string, string>, refreshToken: string):
  Promise<{ kind: 'ok'; token: TokenResponse } | { kind: 'revoked'; detail: string } | { kind: 'error'; detail: string }> {
  try {
    const r = await postForm(tokenEndpoint, { ...params, refresh_token: refreshToken, grant_type: 'refresh_token' });
    if (r.status === 200 && r.body.access_token) return { kind: 'ok', token: r.body as TokenResponse };
    const e = String(r.body.error || `http-${r.status}`);
    // invalid_grant = refresh token scaduto o revocato: l'accesso va rifatto
    if (e === 'invalid_grant') return { kind: 'revoked', detail: `${e}${r.body.error_description ? ` — ${r.body.error_description}` : ''}` };
    return { kind: 'error', detail: `${r.status} ${e}${r.body.error_description ? ` — ${r.body.error_description}` : ''}` };
  } catch (err) {
    return { kind: 'error', detail: err instanceof Error ? err.message : String(err) };
  }
}

export { postForm };
