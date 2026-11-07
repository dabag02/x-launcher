/**
 * dataPermissions.ts — v3.0.2-dev.4 (audit di sicurezza, punto 5).
 *
 * La cartella dati (~/.local/share/x-launcher) contiene il database SQLite (chiavi API dei provider AI,
 * client secret del cloud backup), `.env` (chiavi Steam/IGDB/SteamGridDB), `tokens.json` e `api-token`.
 * Finora nascevano con la umask del processo (di solito 022: leggibili da altri utenti locali se la home non e'
 * 0700). Qui si stringono i permessi SENZA cambiare la umask del demone (che i processi figli — giochi, Wine,
 * installer — erediterebbero).
 */
import { chmodSync, existsSync, statSync } from 'fs';
import path from 'path';
import { DATA_DIR, ENV_PATH } from './paths';

const SENSITIVE_FILES = [
  'x-launcher.db', 'x-launcher.db-wal', 'x-launcher.db-shm',
  'tokens.json', 'api-token',
  // v3.2.2-dev.2 — chiave di cifratura a riposo e passphrase (cifrata) del backup
  'secret.key', 'backup-passphrase.enc',
];

/** Cartella dati 0700 e file sensibili 0600. Solo se appartengono all'utente corrente; non lancia mai. */
export function hardenDataPermissions(dataDir: string = DATA_DIR, envPath: string = ENV_PATH): string[] {
  const changed: string[] = [];
  const uid = typeof process.getuid === 'function' ? process.getuid() : -1;
  const tighten = (p: string, mode: number) => {
    try {
      if (!existsSync(p)) return;
      const st = statSync(p);
      if (uid >= 0 && st.uid !== uid) return;                  // non e' nostro: non si tocca
      if ((st.mode & 0o777) !== mode) { chmodSync(p, mode); changed.push(path.basename(p)); }
    } catch { /* permessi non modificabili: si prosegue */ }
  };
  tighten(dataDir, 0o700);
  for (const f of SENSITIVE_FILES) tighten(path.join(dataDir, f), 0o600);
  tighten(envPath, 0o600);
  return changed;
}
