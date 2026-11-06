/**
 * requestGuard.ts — v3.0.2-dev.2 (audit di sicurezza, punto 1 dello step "Subito").
 *
 * Middleware che chiude due vie d'attacco al demone HTTP senza cambiare il modo in cui la
 * Dashboard e gli script locali (tray.py, kiosk-launch.sh, xlaunch-handler.sh...) lo usano:
 *
 *  1. DNS rebinding: una pagina web puo' far risolvere un suo nome host su 127.0.0.1 o su
 *     un indirizzo della LAN e parlare al demone come se fosse same-origin. Il server
 *     accetta quindi solo richieste il cui header `Host` e' tra quelli consentiti
 *     (localhost, 127.0.0.1, [::1] + X_LAUNCHER_ALLOWED_HOSTS).
 *  2. Richieste cross-site (CSRF): sulle rotte /api rifiuta `Sec-Fetch-Site: cross-site` e
 *     qualunque `Origin` che non sia un host consentito. curl e gli script non inviano
 *     queste intestazioni, quindi non sono toccati.
 *
 * Non sostituisce l'autenticazione (token), che e' il passo successivo dell'audit: chiunque
 * possa raggiungere la porta SENZA essere un browser puo' ancora chiamare le rotte. Per
 * questo il demone ora ascolta di default solo su 127.0.0.1 (vedi server.ts).
 *
 * Nessuna dipendenza: i tipi di richiesta/risposta sono strutturali, cosi' il modulo e'
 * testabile da solo.
 */

export type HeaderMap = Record<string, string | string[] | undefined>;

export interface GuardRequest {
  headers: HeaderMap;
  url?: string;
  originalUrl?: string;
}

export interface GuardResponse {
  status(code: number): GuardResponse;
  json(body: unknown): unknown;
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

const DEFAULT_ALLOWED = ['localhost', '127.0.0.1', '::1'];

/** Insieme degli host consentiti: quelli di default + `extra` (separati da virgola). */
export function buildAllowedHosts(extra?: string | null): Set<string> {
  const set = new Set<string>(DEFAULT_ALLOWED);
  for (const raw of (extra ?? '').split(',')) {
    const h = raw.trim().toLowerCase();
    if (h) set.add(hostnameOf(h) || h);
  }
  return set;
}

/** Nome host di un valore `Host` ("localhost:3000", "[::1]:3000", "esempio.it") senza porta. */
export function hostnameOf(hostHeader: string): string {
  const v = hostHeader.trim().toLowerCase();
  if (!v) return '';
  if (v.startsWith('[')) {                 // IPv6 tra parentesi: [::1]:3000
    const end = v.indexOf(']');
    return end > 0 ? v.slice(1, end) : '';
  }
  const colons = v.split(':').length - 1;
  if (colons === 1) return v.slice(0, v.indexOf(':'));   // nome:porta
  return v;                                              // senza porta (o IPv6 non racchiuso)
}

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

/** Valuta una richiesta. Puro, senza effetti collaterali. */
export function checkRequest(req: GuardRequest, allowed: Set<string>): GuardResult {
  const host = hostnameOf(first(req.headers['host']));
  if (!host) return { ok: false, reason: 'header Host assente' };
  if (!allowed.has(host)) return { ok: false, reason: `Host non consentito: ${host}` };

  const url = req.originalUrl ?? req.url ?? '';
  const isApi = url === '/api' || url.startsWith('/api/') || url.startsWith('/api?');

  const origin = first(req.headers['origin']);
  if (origin) {
    let originHost = '';
    try { originHost = hostnameOf(new URL(origin).host); } catch { /* Origin "null" o malformato */ }
    if (!originHost || !allowed.has(originHost)) {
      return { ok: false, reason: `Origin non consentita: ${origin}` };
    }
  }

  if (isApi && first(req.headers['sec-fetch-site']).toLowerCase() === 'cross-site') {
    return { ok: false, reason: 'richiesta cross-site' };
  }
  return { ok: true };
}

/** Middleware Express. `onReject` serve solo per loggare. */
export function requestGuard(
  allowed: Set<string>,
  onReject?: (reason: string, req: GuardRequest) => void,
) {
  return (req: GuardRequest, res: GuardResponse, next: () => void): void => {
    const r = checkRequest(req, allowed);
    if (r.ok) { next(); return; }
    // cast esplicito: senza `strict` TypeScript non restringe l'unione discriminata su un booleano
    const reason = (r as { ok: false; reason: string }).reason;
    try { onReject?.(reason, req); } catch { /* il log non deve mai bloccare */ }
    res.status(403).json({ success: false, message: 'Richiesta rifiutata.' });
  };
}

/** true se l'indirizzo di ascolto lascia raggiungere il demone da altri dispositivi. */
export function isExposedBind(host: string): boolean {
  const h = host.trim().toLowerCase();
  return !(h === '127.0.0.1' || h === 'localhost' || h === '::1');
}
