/**
 * secretBox.ts — v3.2.2-dev.2 (audit di sicurezza, punto 5: cifratura a riposo).
 *
 * Cifra i segreti che il backend deve poter rileggere da solo (chiavi API dei provider AI, client secret OAuth del
 * Cloud Backup, token di Drive in tokens.json) con AES-256-GCM. La chiave e' casuale (32 byte), vive in un file
 * SEPARATO dal database (`secret.key`, 0600, creato al primo uso): una copia del DB, di un backup della cartella
 * dati o di un log non contiene piu' i segreti in chiaro. NON protegge da un processo che gira con lo stesso
 * utente (potrebbe leggere anche la chiave): per quello servirebbe un keyring o una passphrase a ogni avvio, che
 * su un HTPC che parte da solo non sono praticabili.
 *
 * Formato di un valore cifrato: `enc:v1:` + base64(iv[12] | tag[16] | testo cifrato). Un valore SENZA questo
 * prefisso e' considerato "vecchio, in chiaro" e viene restituito com'e' (migrazione trasparente: al primo avvio
 * i valori in chiaro vengono riscritti cifrati, vedi db.ts).
 *
 * Se `secret.key` manca ma nel DB ci sono valori cifrati (cartella dati copiata senza la chiave), decryptSecret
 * restituisce undefined e lo segnala nel log una sola volta: la chiave API va reinserita, e la nuova chiave viene
 * generata al primo salvataggio. Il file della chiave NON viene mai sovrascritto se esiste ma non e' valido.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { DATA_DIR } from './paths';
import { writeLog } from './logger';

export const SECRET_PREFIX = 'enc:v1:';
const AAD = Buffer.from('x-launcher/secret/v1');
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;
let warnedMissingKey = false;

export function secretKeyPath(dataDir: string = DATA_DIR): string {
  return path.join(dataDir, 'secret.key');
}

/** Chiave in uso. Se il file non esiste la crea (create-exclusive: due processi non si pestano). null = non utilizzabile. */
function loadKey(createIfMissing: boolean, dataDir: string = DATA_DIR): Buffer | null {
  if (cachedKey) return cachedKey;
  const file = secretKeyPath(dataDir);
  try {
    if (existsSync(file)) {
      const k = readFileSync(file);
      if (k.length !== KEY_BYTES) {
        writeLog('error', `[SECRETS] ${file} non e' una chiave valida (${k.length} byte invece di ${KEY_BYTES}): non la sovrascrivo.`);
        return null;
      }
      cachedKey = k;
      return k;
    }
    if (!createIfMissing) return null;
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const fresh = randomBytes(KEY_BYTES);
    try {
      writeFileSync(file, fresh, { mode: 0o600, flag: 'wx' });
      writeLog('info', '[SECRETS] Creata la chiave di cifratura a riposo (secret.key, 0600).');
      cachedKey = fresh;
      return fresh;
    } catch (err: any) {
      if (err?.code === 'EEXIST') return loadKey(false, dataDir);     // creata da un altro processo nel frattempo
      throw err;
    }
  } catch (err) {
    writeLog('error', `[SECRETS] Chiave di cifratura non utilizzabile: ${err}`);
    return null;
  }
}

export function isEncryptedSecret(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(SECRET_PREFIX);
}

/** Cifra. Se la chiave non e' utilizzabile restituisce il valore in chiaro (meglio un segreto in chiaro che perderlo). */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return plain === '' ? '' : null;
  if (isEncryptedSecret(plain)) return plain;
  const key = loadKey(true);
  if (!key) return plain;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(AAD);
  const ct = Buffer.concat([c.update(plain, 'utf-8'), c.final()]);
  return SECRET_PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

/** Decifra. Valore senza prefisso = vecchio in chiaro, restituito com'e'. Chiave mancante o dato alterato = undefined. */
export function decryptSecret(stored: string | null | undefined): string | undefined {
  if (stored === null || stored === undefined) return undefined;
  if (!isEncryptedSecret(stored)) return stored;
  const key = loadKey(false);
  if (!key) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      writeLog('error', '[SECRETS] Ci sono segreti cifrati ma secret.key manca o non e\' valida: vanno reinseriti (chiavi API, client secret, login di Drive).');
    }
    return undefined;
  }
  try {
    const raw = Buffer.from(stored.slice(SECRET_PREFIX.length), 'base64');
    if (raw.length < 12 + 16) return undefined;
    const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    d.setAAD(AAD);
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf-8');
  } catch {
    writeLog('error', '[SECRETS] Un segreto cifrato non si decifra (chiave diversa o dato alterato): va reinserito.');
    return undefined;
  }
}

/** Solo per i test: dimentica la chiave in cache. */
export function _resetSecretBoxForTests(): void { cachedKey = null; warnedMissingKey = false; }
