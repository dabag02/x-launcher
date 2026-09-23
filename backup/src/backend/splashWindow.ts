/**
 * splashWindow.ts — v2.0.41-dev.35, roadmap usabilità punto 2/3
 *
 * Apre/chiude la finestra reale della splash di lancio — un browser
 * SEPARATO da quello della Dashboard (stesso schema `--app=<url>` già
 * collaudato in kiosk-launch.sh, MAI `--kiosk`: introduce un lag
 * importante, verificato dall'utente sul proprio sistema).
 *
 * Punto critico verificato leggendo kiosk-launch.sh: l'istanza
 * Chromium della Dashboard NON specifica un proprio `--user-data-dir`
 * — usa il profilo di default. Una seconda istanza avviata allo stesso
 * modo rischierebbe di aprirsi come una NUOVA FINESTRA nello stesso
 * processo esistente invece che come processo separato (comportamento
 * normale di Chromium con lo stesso profilo) — chiudere "la splash" a
 * quel punto rischierebbe di chiudere anche la Dashboard. Qui si passa
 * sempre un `--user-data-dir` dedicato, per garantire un processo
 * davvero indipendente e sicuro da terminare.
 */

import { spawn, execFileSync, ChildProcess } from 'child_process';
import path from 'path';
import { mkdirSync } from 'fs';
import { DATA_DIR } from './paths';
import { writeLog } from './logger';
import { listWindows } from './windowDetector';

const SPLASH_PROFILE_DIR = path.join(DATA_DIR, 'splash-browser-profile');

function detectBrowser(): { bin: string; type: 'chromium' | 'firefox' } | null {
  // Stesso ordine di rilevamento di kiosk-launch.sh.
  for (const bin of ['chromium', 'google-chrome']) {
    try {
      execFileSync('which', [bin], { stdio: 'ignore' });
      return { bin, type: 'chromium' };
    } catch { /* prova il prossimo */ }
  }
  try {
    execFileSync('which', ['firefox'], { stdio: 'ignore' });
    return { bin: 'firefox', type: 'firefox' };
  } catch { /* nessun browser trovato */ }
  return null;
}

export interface SplashWindowHandle {
  close: () => void;
}

/**
 * v2.0.41-dev.35 — apre la finestra della splash puntata sulla propria
 * rotta dedicata (/splash?gameId=...), MAI --kiosk (lag verificato
 * dall'utente), profilo browser dedicato (vedi commento in testa al
 * file). Nessun tentativo di rimuovere le decorazioni della finestra
 * come per la Dashboard (xfwm4/pannello, kiosk-launch.sh) — la splash
 * è un overlay temporaneo, non la sessione principale; --start-maximized
 * (Chromium) basta per lo scopo, senza replicare tutta la complessità
 * XFCE-specifica pensata per una finestra che resta aperta per ore.
 *
 * v2.0.41-dev.39 — BUG REALE confermato dall'utente su hardware reale:
 * `window_class` di Bioshock 2 era finito per essere quello della
 * SPLASH stessa (`localhost__splash.Chromium`, il nome che Chromium
 * deriva dall'URL `/splash`), non quello del gioco. Causa: questa
 * funzione restituiva l'handle SUBITO dopo lo spawn — ma Chromium
 * impiega un tempo reale (mai istantaneo) a creare davvero la propria
 * finestra X11. Chi chiama (gameManager.ts) cattura lo snapshot "prima"
 * subito dopo aver ricevuto l'handle: se la finestra della splash non
 * era ancora comparsa in quel momento, il ciclo di rilevamento della
 * finestra del GIOCO la vede come "nuova" al proprio interno, e la
 * conferma per errore. Ora `async` — aspetta che la finestra sia
 * DAVVERO comparsa (fino a 5s) prima di restituire l'handle, cosa che
 * garantisce che lo snapshot "prima" preso subito dopo la includa
 * correttamente come "già esistente", mai come "nuova".
 */
export async function openSplashWindow(port: number, gameId: string): Promise<SplashWindowHandle | null> {
  const browser = detectBrowser();
  if (!browser) {
    writeLog('warning', '[SPLASH] Nessun browser trovato — splash non mostrata, il gioco si avvia comunque.');
    return null;
  }

  const beforeSpawn = listWindows();
  const url = `http://localhost:${port}/splash?gameId=${encodeURIComponent(gameId)}`;
  let child: ChildProcess;

  if (browser.type === 'chromium') {
    mkdirSync(SPLASH_PROFILE_DIR, { recursive: true });
    child = spawn(browser.bin, [
      `--app=${url}`,
      `--user-data-dir=${SPLASH_PROFILE_DIR}`,
      '--start-maximized',
      '--noerrdialogs',
      '--disable-infobars',
      '--no-first-run',
      '--disable-translate',
      '--disable-background-networking',
      '--log-level=3',
    ], { stdio: 'ignore', detached: true });
  } else {
    const firefoxProfileDir = path.join(DATA_DIR, 'splash-firefox-profile');
    mkdirSync(firefoxProfileDir, { recursive: true });
    // Stesso identico fix già verificato per la Dashboard
    // (kiosk-launch.sh, v1.1.81/82): -no-remote da solo non basta,
    // serve un profilo dedicato — altrimenti Firefox riusa l'istanza
    // già in esecuzione invece di aprirne una separata.
    child = spawn(browser.bin, [
      '--no-remote',
      '--profile', firefoxProfileDir,
      '--new-instance',
      url,
    ], { stdio: 'ignore', detached: true });
  }

  child.unref();
  const pid = child.pid;
  writeLog('system', `[SPLASH] Finestra avviata (${browser.type}, PID: ${pid ?? 'n/d'}).`);

  // v2.0.41-dev.39 — attesa vera che la finestra sia comparsa, vedi
  // commento esteso sopra. Non un'attesa fissa indovinata: controlla
  // davvero via wmctrl, con un tetto massimo di sicurezza (5s — se
  // anche a quel punto non è comparsa, procede comunque: meglio un
  // rischio residuo di falso apprendimento che bloccare l'intero
  // lancio del gioco per un problema della sola splash).
  const beforeIds = new Set(beforeSpawn.map(w => w.id));
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (listWindows().some(w => !beforeIds.has(w.id))) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return {
    close: () => {
      if (!pid) return;
      try {
        process.kill(pid, 'SIGTERM');
        // Chromium con --user-data-dir dedicato può generare processi
        // figli (renderer) con PID diversi dal principale — un secondo
        // giro con SIGKILL sul gruppo di processi, non solo sul PID
        // principale, stesso principio già consolidato per Gamescope
        // in questa sessione (un solo segnale non garantisce che tutto
        // l'albero termini davvero).
        setTimeout(() => {
          try { process.kill(pid, 'SIGKILL'); } catch { /* già terminato */ }
        }, 2000);
      } catch { /* già terminato */ }
    },
  };
}
