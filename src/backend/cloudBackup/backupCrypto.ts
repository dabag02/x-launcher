/**
 * cloudBackup/backupCrypto.ts — v3.2.2-dev.2 (audit di sicurezza, punto 5).
 *
 * Cifratura del bundle di backup con una PASSPHRASE dell'utente, cosi' su Google Drive (o su qualunque provider
 * futuro) non finisce un file leggibile: contiene le chiavi di .env (Steam, IGDB, SteamGridDB), app.conf, la
 * Knowledge Base e gli avatar.
 *
 * Formato del file cifrato (binario):
 *   "XLBK" | versione(1) | salt(16) | iv(12) | tag(16) | testo cifrato   (testo = il bundle gia' compresso con gzip)
 * Chiave = scrypt(passphrase, salt, N=2^15, r=8, p=1) -> 32 byte; AES-256-GCM, intestazione come dato autenticato:
 * una passphrase sbagliata o un file alterato falliscono la verifica del tag, mai "decifrano male".
 *
 * La passphrase, scelta una volta in Gestisci account, e' salvata sul disco locale (cifrata con secretBox, file
 * 0600) cosi' i backup partono senza chiederla ogni volta; sul Drive non c'e' mai. Per ripristinare su un'altra
 * macchina va reimpostata prima del ripristino.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { DATA_DIR } from '../paths';
import { writeLog } from '../logger';
import { decryptSecret, encryptSecret } from '../secretBox';

const MAGIC = Buffer.from('XLBK');
const VERSION = 1;
const HEADER_LEN = MAGIC.length + 1 + 16 + 12 + 16;      // 49
export const PASSPHRASE_MIN_LENGTH = 8;
export const PASSPHRASE_MAX_LENGTH = 256;

export class BundleCryptoError extends Error {
  constructor(public code: 'bad-passphrase' | 'corrupt', message: string) { super(message); }
}

export function isEncryptedBundle(buf: Buffer): boolean {
  return buf.length > HEADER_LEN && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase.normalize('NFC'), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}

export function encryptBundle(gz: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const head = Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iv]);
  const c = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  c.setAAD(head);
  const ct = Buffer.concat([c.update(gz), c.final()]);
  return Buffer.concat([head, c.getAuthTag(), ct]);
}

export function decryptBundle(data: Buffer, passphrase: string): Buffer {
  if (!isEncryptedBundle(data)) throw new BundleCryptoError('corrupt', 'Il file non e\' un backup cifrato.');
  if (data[MAGIC.length] !== VERSION) throw new BundleCryptoError('corrupt', `Versione del formato cifrato non supportata: ${data[MAGIC.length]}`);
  const salt = data.subarray(5, 21);
  const iv = data.subarray(21, 33);
  const tag = data.subarray(33, 49);
  const head = data.subarray(0, 33);
  try {
    const d = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
    d.setAAD(head);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data.subarray(HEADER_LEN)), d.final()]);
  } catch {
    throw new BundleCryptoError('bad-passphrase', 'Passphrase errata oppure backup danneggiato.');
  }
}

// ---------------------------------------------------------------------------
// Passphrase salvata in locale
// ---------------------------------------------------------------------------

export function passphraseFilePath(dataDir: string = DATA_DIR): string {
  return path.join(dataDir, 'backup-passphrase.enc');
}

export function validatePassphrase(p: unknown): string | null {
  if (typeof p !== 'string') return 'Passphrase non valida.';
  if (p.length < PASSPHRASE_MIN_LENGTH) return `La passphrase deve avere almeno ${PASSPHRASE_MIN_LENGTH} caratteri.`;
  if (p.length > PASSPHRASE_MAX_LENGTH) return `La passphrase puo' avere al massimo ${PASSPHRASE_MAX_LENGTH} caratteri.`;
  return null;
}

export function setBackupPassphrase(p: string, dataDir: string = DATA_DIR): void {
  const enc = encryptSecret(p);
  if (!enc) throw new Error('cifratura non disponibile');
  const file = passphraseFilePath(dataDir);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, enc, { mode: 0o600 });
  renameSync(tmp, file);
  try { chmodSync(file, 0o600); } catch { /* ignorato */ }
  writeLog('info', '[CloudBackup] Passphrase di cifratura del backup impostata.');
}

export function getBackupPassphrase(dataDir: string = DATA_DIR): string | undefined {
  try {
    const file = passphraseFilePath(dataDir);
    if (!existsSync(file)) return undefined;
    const p = decryptSecret(readFileSync(file, 'utf-8').trim());
    return p && p.length > 0 ? p : undefined;
  } catch { return undefined; }
}

export function hasBackupPassphrase(dataDir: string = DATA_DIR): boolean {
  return existsSync(passphraseFilePath(dataDir));
}

export function clearBackupPassphrase(dataDir: string = DATA_DIR): void {
  try { rmSync(passphraseFilePath(dataDir), { force: true }); } catch { /* ignorato */ }
  writeLog('info', '[CloudBackup] Passphrase di cifratura del backup rimossa: i prossimi backup NON saranno cifrati.');
}
