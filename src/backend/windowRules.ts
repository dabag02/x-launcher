/**
 * v3.2.29-dev.2 — regole per le finestre dei giochi, lette da spaces.py.
 *
 *   ~/.local/share/x-launcher/window-rules.json
 *   { "keepMaximized": { "<id sanitizzato>": true, ... } }
 *
 * <id sanitizzato> = id del gioco con la STESSA regola del nome dello scope
 * systemd (processManager.sanitize, coverCache.ts: tutto fuori da
 * [A-Za-z0-9_.-] diventa '-'): spaces.py lo ricava dal nome dello scope
 * (xlauncher-game-<id>-<ts>), come fa già per le copertine.
 *
 * Il file viene aggiornato a ogni lancio con lo stato dell'opzione
 * `--keep-maximized` per quel gioco (aggiunta o tolta): una voce rimasta da
 * un gioco non più in esecuzione non ha effetto, spaces.py la consulta solo
 * per le finestre di un gioco aperto. Un file indipendente dal percorso di
 * lancio (runner, prefix condiviso, legendary), perché l'ambiente del
 * processo della finestra non è affidabile: con un launcher condiviso già
 * aperto il gioco eredita l'ambiente del launcher, non il nostro.
 */
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './paths';
import { writeLog } from './logger';

export const WINDOW_RULES_PATH = path.join(DATA_DIR, 'window-rules.json');

/** Stessa regola di processManager.sanitize() e coverCache.ts. */
function ruleKey(gameId: string): string {
  return gameId.replace(/[^A-Za-z0-9_.-]/g, '-');
}

type WindowRules = { keepMaximized: Record<string, true> };

function readRules(): WindowRules {
  try {
    const raw = JSON.parse(fs.readFileSync(WINDOW_RULES_PATH, 'utf-8'));
    const km = raw && typeof raw.keepMaximized === 'object' && raw.keepMaximized ? raw.keepMaximized : {};
    const out: Record<string, true> = {};
    for (const [k, v] of Object.entries(km)) if (v === true) out[k] = true;
    return { keepMaximized: out };
  } catch {
    return { keepMaximized: {} };
  }
}

/**
 * Registra (on=true) o toglie l'opzione «mantieni massimizzato» per un gioco.
 * Scrittura atomica (file temporaneo + rename): spaces.py non legge mai un
 * file a metà. Errori solo nel log: l'opzione non deve mai bloccare un lancio.
 */
export function setKeepMaximized(gameId: string, on: boolean): void {
  try {
    const rules = readRules();
    const key = ruleKey(gameId);
    if (on === !!rules.keepMaximized[key]) return;      // nessun cambiamento
    if (on) rules.keepMaximized[key] = true;
    else delete rules.keepMaximized[key];
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${WINDOW_RULES_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rules, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, WINDOW_RULES_PATH);
    writeLog('launch', `[LAUNCH] window-rules.json: keep-maximized ${on ? 'enabled' : 'disabled'} for ${key}`);
  } catch (err) {
    writeLog('error', `[LAUNCH] window-rules.json not updated (${gameId}): ${err instanceof Error ? err.message : String(err)}`);
  }
}
