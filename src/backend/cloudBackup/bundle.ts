/**
 * cloudBackup/bundle.ts — raccoglie/ripristina i dati del Cloud Backup.
 * MAI l'intero file x-launcher.db (conterrebbe libreria/percorsi
 * installazione/prefix, specifici della macchina):
 *
 *   SÌ: compat_profiles, Knowledge Base AI Advisor, app.conf, .env (solo le chiavi
 *       documentate in .env.example: vedi restoreSafety.ts BACKUP_ENV_KEYS),
 *       cartella avatars/ (le immagini vere, non solo la scelta corrente)
 *   NO: libreria/percorsi/prefix, config legendary/lgogdownloader/nile,
 *       tokens.json, credenziali provider AI Advisor/Cloud Backup,
 *       lingua e scelta avatar corrente (preferenze, non dati)
 *
 * Formato: un singolo oggetto JSON, compresso con gzip (zlib nativo di
 * Node) prima dell'upload. Le immagini avatar viaggiano come base64
 * dentro lo stesso JSON invece di un vero archivio zip — niente
 * dipendenze in più.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync, chmodSync } from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { DATA_DIR, ENV_PATH } from '../paths';
import { writeLog } from '../logger';
import * as db from '../db';
import { knowledgeBase } from '../knowledgeBase';
import { restoreAppConfFromText } from '../appConfig';
import { resolveInside } from '../runnerSafety';
import {
  filterEnvForBackup, mergeEnvFromBackup, isSafeAvatarName, decodeAvatar,
  AVATAR_MAX_COUNT, BUNDLE_MAX_DECOMPRESSED, BUNDLE_MAX_ROWS,
} from '../restoreSafety';

const APP_CONF_PATH = path.join(DATA_DIR, 'app.conf');
const AVATAR_DIR    = path.join(DATA_DIR, 'avatars');

export const BACKUP_FILENAME = 'x-launcher-backup.json.gz';

interface BackupBundle {
  version:   1;
  createdAt: string;
  compatProfiles: any[];
  knowledgeBase:  any[];
  appConf: string | null;
  env:     string | null;
  avatars: { filename: string; dataBase64: string }[];
}

/** Legge un file di testo se esiste, altrimenti null — mai lanciare per
 *  un file mancante (es. .env non ancora creato su questa installazione). */
function readTextIfExists(filePath: string): string | null {
  try { return existsSync(filePath) ? readFileSync(filePath, 'utf-8') : null; }
  catch (err) { writeLog('warning', `[CloudBackup] Lettura fallita per ${filePath}: ${err}`); return null; }
}

/** Scrittura atomica (file temporaneo nella stessa cartella + rename) con permessi espliciti. */
function writeFileAtomic(file: string, data: string | Buffer, mode: number): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data, { mode });
  renameSync(tmp, file);
  try { chmodSync(file, mode); } catch { /* ignorato */ }
}

function collectAvatars(): { filename: string; dataBase64: string }[] {
  if (!existsSync(AVATAR_DIR)) return [];
  try {
    return readdirSync(AVATAR_DIR)
      .filter(f => !f.startsWith('.') && isSafeAvatarName(f))   // gli stessi nomi che il ripristino accettera'
      .map(f => ({
        filename:   f,
        dataBase64: readFileSync(path.join(AVATAR_DIR, f)).toString('base64'),
      }));
  } catch (err) {
    writeLog('warning', `[CloudBackup] Lettura cartella avatars/ fallita: ${err}`);
    return [];
  }
}

/** Costruisce il bundle di backup e lo comprime — pronto per l'upload. */
export function buildBackupBundle(): Buffer {
  const bundle: BackupBundle = {
    version:   1,
    createdAt: new Date().toISOString(),
    compatProfiles: db.exportCompatProfilesRaw(),
    knowledgeBase:  knowledgeBase.getAll(),
    appConf: readTextIfExists(APP_CONF_PATH),
    env:     filterEnvForBackup(readTextIfExists(ENV_PATH)),
    avatars: collectAvatars(),
  };
  const json = JSON.stringify(bundle);
  writeLog('info', `[CloudBackup] Bundle costruito: ${bundle.compatProfiles.length} profili compat, ${bundle.knowledgeBase.length} voci KB, ${bundle.avatars.length} avatar, ${(json.length / 1024).toFixed(0)} KB grezzi.`);
  return gzipSync(json);
}

/**
 * Ripristina un bundle scaricato. Riga per riga per compat_profiles (una
 * riga che referenzia un gioco non ancora nella libreria — non ancora
 * scansionata su questa installazione — viene saltata, non blocca il
 * resto: vedi importCompatProfilesRaw in db.ts). app.conf/.env vengono
 * sovrascritti solo se presenti nel bundle.
 */
export function restoreFromBundle(compressed: Buffer): {
  success: boolean;
  message: string;
  compatProfilesImported?: number;
  compatProfilesSkipped?: number;
  knowledgeBaseImported?: number;
  avatarsRestored?: number;
} {
  // v3.0.2-dev.4 — il bundle e' input NON fidato (arriva da Drive): limiti di dimensione, struttura verificata,
  // ogni parte ripulita prima di toccare disco o DB. Vedi restoreSafety.ts.
  let bundle: BackupBundle;
  try {
    const json = gunzipSync(compressed, { maxOutputLength: BUNDLE_MAX_DECOMPRESSED }).toString('utf-8');
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('struttura non valida');
    bundle = parsed as BackupBundle;
  } catch (err) {
    return { success: false, message: `Bundle corrotto o formato non riconosciuto: ${err}` };
  }
  if (bundle.version !== 1) {
    return { success: false, message: `Versione bundle non supportata: ${bundle.version}` };
  }

  const compatResult = db.importCompatProfilesRaw(Array.isArray(bundle.compatProfiles) ? bundle.compatProfiles.slice(0, BUNDLE_MAX_ROWS) : []);
  const kbImported    = knowledgeBase.importEntries(Array.isArray(bundle.knowledgeBase) ? bundle.knowledgeBase.slice(0, BUNDLE_MAX_ROWS) : []);

  if (typeof bundle.appConf === 'string' && bundle.appConf.length <= 64 * 1024) {
    try { restoreAppConfFromText(bundle.appConf); }
    catch (err) { writeLog('warning', `[CloudBackup] Scrittura app.conf fallita: ${err}`); }
  }
  if (typeof bundle.env === 'string' && bundle.env.length <= 64 * 1024) {
    try {
      // Unione, non sostituzione: le righe locali (anche X_LAUNCHER_*) restano; dal bundle passano solo le chiavi ammesse.
      const merged = mergeEnvFromBackup(readTextIfExists(ENV_PATH), bundle.env);
      writeFileAtomic(ENV_PATH, merged.text, 0o600);
      if (merged.rejected.length > 0) {
        writeLog('warning', `[CloudBackup] .env: chiavi del bundle ignorate per sicurezza: ${merged.rejected.slice(0, 10).join(', ')}`);
      }
    } catch (err) { writeLog('warning', `[CloudBackup] Scrittura .env fallita: ${err}`); }
  }

  let avatarsRestored = 0;
  let avatarsRejected = 0;
  if (Array.isArray(bundle.avatars) && bundle.avatars.length > 0) {
    try {
      mkdirSync(AVATAR_DIR, { recursive: true });
      for (const avatar of bundle.avatars.slice(0, AVATAR_MAX_COUNT)) {
        const name = (avatar as { filename?: unknown })?.filename;
        const bytes = isSafeAvatarName(name) ? decodeAvatar((avatar as { dataBase64?: unknown }).dataBase64) : null;
        const target = isSafeAvatarName(name) ? resolveInside(AVATAR_DIR, name) : null;
        if (!bytes || !target) { avatarsRejected++; continue; }
        try {
          writeFileAtomic(target, bytes, 0o644);
          avatarsRestored++;
        } catch (err) {
          writeLog('warning', `[CloudBackup] Avatar ${name} non ripristinato: ${err}`);
        }
      }
    } catch (err) {
      writeLog('warning', `[CloudBackup] Cartella avatars/ non creabile: ${err}`);
    }
    if (avatarsRejected > 0) writeLog('warning', `[CloudBackup] ${avatarsRejected} avatar del bundle scartati (nome o contenuto non validi).`);
  }

  writeLog('info', `[CloudBackup] Ripristino completato: ${compatResult.imported} profili compat (${compatResult.skipped} saltati — probabilmente libreria non ancora scansionata), ${kbImported} voci KB, ${avatarsRestored} avatar.`);

  return {
    success: true,
    message: compatResult.skipped > 0
      ? `Ripristino completato. ${compatResult.skipped} profilo/i saltato/i perché il gioco non è ancora nella libreria — scansiona la libreria e ripristina di nuovo per recuperarli.`
      : 'Ripristino completato.',
    compatProfilesImported: compatResult.imported,
    compatProfilesSkipped:  compatResult.skipped,
    knowledgeBaseImported:  kbImported,
    avatarsRestored,
  };
}
