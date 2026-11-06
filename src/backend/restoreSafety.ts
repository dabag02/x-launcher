/**
 * restoreSafety.ts — v3.0.2-dev.4 (audit di sicurezza, punti 4 e 5).
 *
 * Il bundle di Cloud Backup arriva da Google Drive: chi controlla l'account Drive (o il file) controlla
 * il suo contenuto. Prima di questa versione `restoreFromBundle` lo applicava cosi' com'era:
 *  - il nome di un avatar finiva in `path.join(AVATAR_DIR, nome)` (`../../.bashrc` scriveva fuori cartella);
 *  - `.env` veniva sostituito per intero (e xdash.service/kiosk-launch.sh lo caricano come variabili d'ambiente
 *    del demone: `NODE_OPTIONS=--require ...`, `X_LAUNCHER_AUTH=off`, `X_LAUNCHER_BIND=0.0.0.0`...);
 *  - i profili di compatibilita' erano inseriti con `INSERT ... (${Object.keys(riga)})`: i NOMI delle colonne
 *    arrivavano dal bundle (iniezione SQL);
 *  - `customEnv` di un profilo diventa l'ambiente del processo del gioco (`LD_PRELOAD`...).
 *
 * Qui ci sono solo funzioni pure (nessun accesso a disco o DB): validano e ripuliscono. Chi le usa decide dove scrivere.
 */
import path from 'path';

// ---------------------------------------------------------------------------
// .env
// ---------------------------------------------------------------------------

/** Chiavi di `.env` che possono viaggiare nel backup (quelle documentate in `.env.example`). Il resto
 *  (X_LAUNCHER_*, PORT, NODE_OPTIONS, LD_*, PATH...) e' configurazione di QUESTA macchina e di sicurezza: non si ripristina mai. */
export const BACKUP_ENV_KEYS: readonly string[] = [
  'STEAM_API_KEY', 'STEAM_ID', 'ROMS_PATH', 'STEAMGRIDDB_API_KEY', 'IGDB_CLIENT_ID', 'IGDB_CLIENT_SECRET',
];

const ENV_KEY_RX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_VALUE_MAX = 1024;

/** `KEY=VALUE` -> coppia, oppure null per righe vuote, commenti, formati strani. Il valore non contiene mai a-capo. */
function parseEnvLine(line: string): [string, string] | null {
  const t = line.trim();
  if (!t || t.startsWith('#')) return null;
  const eq = t.indexOf('=');
  if (eq <= 0) return null;
  const key = t.slice(0, eq).trim();
  if (!ENV_KEY_RX.test(key)) return null;
  return [key, t.slice(eq + 1).trim()];
}

/** true se il valore e' accettabile: niente caratteri di controllo (NUL, a-capo...), lunghezza limitata. */
export function isSafeEnvValue(v: string): boolean {
  return v.length <= ENV_VALUE_MAX && !/[\u0000-\u001f\u007f]/.test(v);
}

/** Dalle righe di un `.env`, solo le chiavi ammesse con valore valido (per costruire il bundle). */
export function filterEnvForBackup(text: string | null): string | null {
  if (!text) return null;
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const kv = parseEnvLine(line);
    if (kv && BACKUP_ENV_KEYS.includes(kv[0]) && isSafeEnvValue(kv[1])) out.push(`${kv[0]}=${kv[1]}`);
  }
  return out.length > 0 ? out.join('\n') + '\n' : null;
}

/**
 * Unisce il `.env` locale con quello del bundle: le righe locali restano (comprese quelle di sicurezza),
 * le chiavi ammesse del bundle sostituiscono/aggiungono. Restituisce il nuovo testo e le chiavi scartate.
 */
export function mergeEnvFromBackup(existing: string | null, bundleText: string): { text: string; applied: string[]; rejected: string[] } {
  const incoming = new Map<string, string>();
  const rejected: string[] = [];
  for (const line of bundleText.split(/\r?\n/)) {
    const kv = parseEnvLine(line);
    if (!kv) continue;
    if (BACKUP_ENV_KEYS.includes(kv[0]) && isSafeEnvValue(kv[1])) incoming.set(kv[0], kv[1]);
    else rejected.push(kv[0]);
  }
  const lines = (existing ?? '').split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const done = new Set<string>();
  const merged = lines.map(line => {
    const kv = parseEnvLine(line);
    if (kv && incoming.has(kv[0])) { done.add(kv[0]); return `${kv[0]}=${incoming.get(kv[0])}`; }
    return line;
  });
  for (const [k, v] of incoming) if (!done.has(k)) merged.push(`${k}=${v}`);
  return { text: merged.join('\n') + (merged.length ? '\n' : ''), applied: Array.from(incoming.keys()), rejected };
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

const AVATAR_NAME_RX = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,100}\.(png|jpe?g|webp|gif)$/i;
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MAX_COUNT = 200;

/** Nome di avatar ammesso (solo il nome, nessun separatore, estensione immagine; niente SVG: eseguirebbe script). */
export function isSafeAvatarName(name: unknown): name is string {
  return typeof name === 'string' && AVATAR_NAME_RX.test(name) && !name.includes('..') && path.basename(name) === name;
}

function startsWith(buf: Buffer, bytes: number[]): boolean {
  return buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);
}

/** Decodifica un avatar base64: restituisce i byte solo se sono davvero un'immagine PNG/JPEG/GIF/WebP entro il limite. */
export function decodeAvatar(dataBase64: unknown): Buffer | null {
  if (typeof dataBase64 !== 'string') return null;
  if (dataBase64.length > Math.ceil(AVATAR_MAX_BYTES * 4 / 3) + 8) return null;   // controllo PRIMA di decodificare
  const buf = Buffer.from(dataBase64, 'base64');
  if (buf.length === 0 || buf.length > AVATAR_MAX_BYTES) return null;
  const png  = startsWith(buf, [0x89, 0x50, 0x4e, 0x47]);
  const jpg  = startsWith(buf, [0xff, 0xd8, 0xff]);
  const gif  = startsWith(buf, [0x47, 0x49, 0x46, 0x38]);
  const webp = startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && buf.length > 12 && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  return png || jpg || gif || webp ? buf : null;
}

/** `avatarUrl` di app.conf: vuoto/null oppure `/avatars/<nome sicuro>`. */
export function isSafeAvatarUrl(v: unknown): boolean {
  if (v === null || v === '') return true;
  if (typeof v !== 'string' || !v.startsWith('/avatars/')) return false;
  return isSafeAvatarName(v.slice('/avatars/'.length));
}

// ---------------------------------------------------------------------------
// Profili di compatibilita'
// ---------------------------------------------------------------------------

/** Variabili d'ambiente che un profilo ripristinato non puo' impostare: cambiano come parte o carica codice. */
const FORBIDDEN_ENV_EXACT = new Set([
  'PATH', 'HOME', 'SHELL', 'IFS', 'ENV', 'BASH_ENV', 'SHELLOPTS', 'BASHOPTS', 'PS4', 'PROMPT_COMMAND',
  'NODE_OPTIONS', 'NODE_PATH', 'PYTHONPATH', 'PYTHONSTARTUP', 'PYTHONHOME', 'PERL5OPT', 'PERL5LIB',
  'RUBYOPT', 'RUBYLIB', 'GCONV_PATH', 'GIO_EXTRA_MODULES', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
]);
const FORBIDDEN_ENV_PREFIX = ['LD_', 'DYLD_', 'X_LAUNCHER_'];

export function isForbiddenEnvKey(key: string): boolean {
  return FORBIDDEN_ENV_EXACT.has(key) || FORBIDDEN_ENV_PREFIX.some(p => key.startsWith(p));
}

/** Ripulisce `customEnv` (oggetto): chiavi valide non vietate, valori stringa senza caratteri di controllo. */
export function sanitizeCustomEnv(input: unknown): { env: Record<string, string>; dropped: string[] } {
  const env: Record<string, string> = {};
  const dropped: string[] = [];
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (!ENV_KEY_RX.test(k) || isForbiddenEnvKey(k) || typeof v !== 'string' || !isSafeEnvValue(v)) { dropped.push(k); continue; }
      env[k] = v;
    }
  }
  return { env, dropped };
}

const VERB_RX = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

export interface SanitizedCompatRow { row: Record<string, string | number | null>; notes: string[] }

/**
 * Ripulisce una riga di `compat_profiles` del bundle: solo colonne esistenti (`allowedCols`), solo tipi
 * semplici, `custom_env` e `winetricks_verbs` ricostruiti. Restituisce null se la riga e' inutilizzabile.
 */
export function sanitizeCompatRow(raw: unknown, allowedCols: ReadonlySet<string>): SanitizedCompatRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const notes: string[] = [];
  const row: Record<string, string | number | null> = {};
  for (const [col, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowedCols.has(col) || !/^[a-z][a-z0-9_]*$/.test(col)) { notes.push(`colonna ignorata: ${col.slice(0, 40)}`); continue; }
    if (val === null) { row[col] = null; continue; }
    if (typeof val === 'number' && Number.isFinite(val)) { row[col] = val; continue; }
    if (typeof val === 'boolean') { row[col] = val ? 1 : 0; continue; }
    if (typeof val === 'string' && val.length <= 20000) { row[col] = val; continue; }
    notes.push(`valore scartato in ${col}`);
  }
  if (typeof row.game_id !== 'string' || row.game_id.length === 0 || row.game_id.length > 200) return null;

  if (typeof row.custom_env === 'string') {
    let parsed: unknown = {};
    try { parsed = JSON.parse(row.custom_env); } catch { notes.push('custom_env non valido: svuotato'); }
    const { env, dropped } = sanitizeCustomEnv(parsed);
    if (dropped.length > 0) notes.push(`variabili scartate: ${dropped.slice(0, 8).join(', ')}`);
    row.custom_env = JSON.stringify(env);
  }
  if (typeof row.winetricks_verbs === 'string') {
    let parsed: unknown = null;
    try { parsed = JSON.parse(row.winetricks_verbs); } catch { /* sotto */ }
    if (Array.isArray(parsed)) {
      const ok = parsed.filter((v): v is string => typeof v === 'string' && VERB_RX.test(v));
      if (ok.length !== parsed.length) notes.push('verbi winetricks non validi scartati');
      row.winetricks_verbs = JSON.stringify(ok);
    } else {
      row.winetricks_verbs = null;
    }
  }
  return { row, notes };
}

// ---------------------------------------------------------------------------
// Limiti generali del bundle
// ---------------------------------------------------------------------------

/** Dimensione massima del bundle scaricato e, soprattutto, decompresso (contro i "zip bomb"). */
export const BUNDLE_MAX_COMPRESSED = 40 * 1024 * 1024;
export const BUNDLE_MAX_DECOMPRESSED = 120 * 1024 * 1024;
export const BUNDLE_MAX_ROWS = 20000;
