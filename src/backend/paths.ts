/**
 * paths.ts — v1.1.102-dev.1
 *
 * Unica fonte di verità per la cartella dati per-utente di X-Launcher.
 * Prima duplicata identica — `const DATA_DIR = path.join(homedir(),
 * '.local', 'share', 'x-launcher')` — in almeno sei punti del backend
 * (appConfig.ts, db.ts, logger.ts, knowledgeBase.ts, notificationEngine.ts,
 * runners/implementations.ts per game-logs/). Consolidata qui perché
 * ENV_PATH (questa voce) sarebbe stata la settima copia.
 *
 * ENV_PATH — il file .env, prima cercato solo nella cartella del progetto
 * (kiosk-launch.sh, `$PROJECT_DIR/.env`): funzionava per l'unico percorso
 * di avvio che passava da lì, ma si rompeva silenziosamente per
 * `xdash.service` (che non lo caricava affatto) e per `npm run dev` (mai
 * caricato, nessun --env-file/dotenv nello script). Ora vive qui, un solo
 * posto per qualunque modo si avvii il daemon — dev, kiosk-launch.sh o
 * systemd.
 */
import path from 'path';
import { homedir } from 'os';

export const DATA_DIR = path.join(homedir(), '.local', 'share', 'x-launcher');
export const ENV_PATH  = path.join(DATA_DIR, '.env');
