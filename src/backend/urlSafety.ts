/**
 * urlSafety.ts — v3.0.2-dev.5 (audit di sicurezza, punti 7 e 12).
 *
 *  - `parseHttpUrl`: accetta solo http/https, senza credenziali nell'URL, lunghezza limitata. Serve ad
 *    `/api/open-url` (un valore che inizia con `-` veniva letto da Firefox come opzione; `file://` o gestori
 *    registrati come `xlaunch://` si aprivano con xdg-open) e alla validazione dell'indirizzo di Ollama.
 *  - `safePublicDownload`: scarica un URL esterno (copertine) senza poter essere usato per sondare la rete
 *    locale: ogni connessione passa da un `lookup` che rifiuta indirizzi privati/loopback/link-local DOPO la
 *    risoluzione DNS (nessuna finestra di "DNS rebinding"), i redirect sono seguiti a mano (max 3) e ognuno e'
 *    riconvalidato, dimensione e tempo sono limitati.
 */
import http from 'http';
import https from 'https';
import dns from 'dns';
import net from 'net';

const URL_MAX = 2048;

/** URL http/https "pulito" oppure null. */
export function parseHttpUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > URL_MAX) return null;
  if (/[\u0000- \u007f]/.test(value)) return null;          // spazi, a-capo, caratteri di controllo
  let u: URL;
  try { u = new URL(value); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (!u.hostname) return null;
  return u;
}

// ---------------------------------------------------------------------------
// Indirizzi non pubblici
// ---------------------------------------------------------------------------

const BLOCKED = new net.BlockList();
for (const [net4, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as Array<[string, number]>) BLOCKED.addSubnet(net4, bits, 'ipv4');
BLOCKED.addAddress('::', 'ipv6');
BLOCKED.addAddress('::1', 'ipv6');
for (const [net6, bits] of [['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as Array<[string, number]>) BLOCKED.addSubnet(net6, bits, 'ipv6');

/** true se l'indirizzo non e' un indirizzo pubblico instradabile (privato, loopback, link-local, multicast...). */
export function isNonPublicAddress(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 0) return true;                                     // non e' un IP: in dubbio, si rifiuta
  if (fam === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);   // IPv4 mappato in IPv6
    if (mapped) return isNonPublicAddress(mapped[1]);
    const nat64 = lower.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);  // NAT64 con IPv4 incorporato
    if (nat64) return isNonPublicAddress(nat64[1]);
    return BLOCKED.check(ip, 'ipv6');
  }
  return BLOCKED.check(ip, 'ipv4');
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** `lookup` per http(s).request: risolve e rifiuta qualunque indirizzo non pubblico PRIMA che il socket si connetta. */
function guardedLookup(hostname: string, options: dns.LookupOptions | number | undefined, cb: LookupCb): void {
  const opts: dns.LookupOptions = typeof options === 'number' ? { family: options } : { ...(options ?? {}) };
  dns.lookup(hostname, { ...opts, all: true }, (err, addrs) => {
    if (err) { cb(err, '' as string); return; }
    const list = (addrs as dns.LookupAddress[]);
    const bad = list.find(a => isNonPublicAddress(a.address));
    if (bad || list.length === 0) {
      const e: NodeJS.ErrnoException = new Error(`indirizzo non pubblico rifiutato: ${hostname}`);
      e.code = 'EBLOCKEDADDR';
      cb(e, '' as string);
      return;
    }
    if (opts.all) { cb(null, list); return; }
    cb(null, list[0].address, list[0].family);
  });
}

export interface DownloadOptions { maxBytes: number; timeoutMs: number; maxRedirects?: number }

/**
 * Scarica `url` (http/https) in un Buffer. Restituisce null per qualunque problema: URL non valido, host che
 * risolve a un indirizzo non pubblico, troppi redirect, risposta != 200, dimensione oltre `maxBytes`, timeout.
 */
export function safePublicDownload(url: string, opts: DownloadOptions): Promise<Buffer | null> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const deadline = Date.now() + opts.timeoutMs;

  const hop = (current: string, left: number): Promise<Buffer | null> => new Promise(resolve => {
    const u = parseHttpUrl(current);
    const remaining = deadline - Date.now();
    if (!u || remaining <= 0) { resolve(null); return; }
    // Un IP letterale non passa dal DNS (quindi nemmeno da `lookup`): si controlla qui.
    const bare = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(bare) && isNonPublicAddress(bare)) { resolve(null); return; }

    const mod = u.protocol === 'https:' ? https : http;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const done = (v: Buffer | null) => { if (!settled) { settled = true; if (timer) clearTimeout(timer); resolve(v); } };
    const req = mod.request(u, {
      method: 'GET',
      lookup: guardedLookup as unknown as net.LookupFunction,
      headers: { 'User-Agent': 'X-Launcher', Accept: 'image/*,*/*;q=0.5' },
      timeout: remaining,
    }, res => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (left <= 0) { done(null); return; }
        let next: string;
        try { next = new URL(res.headers.location, u).toString(); } catch { done(null); return; }
        hop(next, left - 1).then(done);
        return;
      }
      if (status !== 200) { res.resume(); done(null); return; }
      const declared = Number(res.headers['content-length'] ?? 0);
      if (declared > opts.maxBytes) { res.destroy(); done(null); return; }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on('data', (c: Buffer) => {
        total += c.length;
        if (total > opts.maxBytes) { res.destroy(); done(null); return; }
        chunks.push(c);
      });
      res.on('end', () => done(Buffer.concat(chunks)));
      res.on('error', () => done(null));
      res.on('close', () => done(null));       // chiusura anticipata: ha gia' risolto se era 'end'
    });
    req.on('timeout', () => { req.destroy(); done(null); });
    // limite di tempo TOTALE (il 'timeout' sopra misura solo l'inattivita': un server che manda un byte alla volta lo eluderebbe)
    timer = setTimeout(() => { req.destroy(); done(null); }, remaining);
    req.on('error', () => done(null));
    req.end();
  });

  return hop(url, maxRedirects);
}
