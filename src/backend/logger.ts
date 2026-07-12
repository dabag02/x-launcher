/**
 * logger.ts — Scrive i log su file e su stdout  (Step 12f)
 *
 * File: ~/.local/share/x-launcher/daemon.log
 * Rotazione automatica a 5MB — mantiene daemon.log + daemon.log.1 + daemon.log.2
 *
 * Livelli: debug | info | system | warning | error | auth | download | launch
 */
import { mkdirSync, statSync, renameSync, appendFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import type { LogLevel } from '../types';

const DATA_DIR  = path.join(homedir(), '.local', 'share', 'x-launcher');
const LOG_PATH  = path.join(DATA_DIR, 'daemon.log');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

mkdirSync(DATA_DIR, { recursive: true });

/** Ruota daemon.log → daemon.log.1 → daemon.log.2 (massimo 3 file) */
function rotate() {
  try {
    const stat = statSync(LOG_PATH);
    if (stat.size <= MAX_BYTES) return;
    // daemon.log.1 → daemon.log.2  (sovrascrive se esiste)
    const log1 = LOG_PATH + '.1';
    const log2 = LOG_PATH + '.2';
    if (existsSync(log1)) renameSync(log1, log2);
    renameSync(LOG_PATH, log1);
  } catch { /* file non ancora creato — nessun problema */ }
}

/**
 * Scrive una riga di log su stdout e su file.
 * Accetta sia i LogLevel tipizzati che stringhe libere (per compatibilità
 * con il codice esistente che passava livelli come 'info', 'system', ecc.)
 */
export function writeLog(level: LogLevel | string, message: string) {
  const ts   = new Date().toISOString();
  const tag  = level.toUpperCase();
  const line = `[${ts}] [${tag}] ${message}\n`;

  process.stdout.write(line);

  rotate();
  try {
    appendFileSync(LOG_PATH, line, 'utf-8');
  } catch { /* non bloccare il daemon se il log fallisce */ }
}

export const LOG_PATH_EXPORT = LOG_PATH;
