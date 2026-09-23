/**
 * splashOrchestrator.ts — v2.0.41-dev.35, roadmap usabilità punto 2/3
 *
 * Combina i tre pezzi già costruiti in questa sessione in un'unica
 * corsa fra condizioni, esattamente come concordato con l'utente:
 * (1) finestra reale rilevata (windowDetector.ts) → splash sparisce
 * normalmente; (2) notifica launch-error intercettata (mai mostrata,
 * solo per sapere che chiudere) → messaggio di fallimento, poi
 * ritorno alla Dashboard; (3) 120s dal lancio effettivo senza
 * nessuna delle due sopra → messaggio di timeout, termina
 * forzatamente il processo di lancio, poi ritorno alla Dashboard.
 *
 * Mai un await bloccante su launchGame() — gira per conto proprio in
 * background, launchGame() prosegue/ritorna indipendentemente.
 */

import { emitLaunchPhase, LAUNCH_WINDOW_TIMEOUT_MS } from './launchPhaseTracker';
import { waitForGameWindow, WindowInfo } from './windowDetector';
import { openSplashWindow, type SplashWindowHandle } from './splashWindow';
import { notificationEngine, type EngineEvent } from './notificationEngine';
import { writeLog } from './logger';

const PORT = parseInt(process.env.PORT || '3000', 10);

function waitForLaunchError(gameId: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const listener = (event: EngineEvent) => {
      if (settled) return;
      if (event.type === 'launch-error' && event.gameId === gameId) {
        settled = true;
        notificationEngine.off(listener);
        resolve(true);
      }
    };
    notificationEngine.on(listener);
    setTimeout(() => {
      if (settled) return;
      settled = true;
      notificationEngine.off(listener);
      resolve(false);
    }, timeoutMs);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * v2.0.41-dev.36 — richiesta utente, bug reale confermato su hardware
 * reale: la splash appariva solo DOPO la verifica dei verb (che può
 * richiedere diversi secondi), non subito al lancio — perché
 * l'apertura della finestra e la corsa fra le condizioni di chiusura
 * erano nella stessa funzione, chiamata solo dopo lo spawn effettivo.
 * Separate qui: apri prima (openSplashForLaunch, chiamata da
 * gameManager.ts PRIMA della verifica verb), fai partire la corsa dopo
 * (raceSplashClose, chiamata al momento dello spawn effettivo, invariato
 * — il timeout dei 120s continua a contare da lì, come richiesto
 * esplicitamente dall'utente, non dall'apertura della finestra).
 */
export async function openSplashForLaunch(gameId: string): Promise<SplashWindowHandle | null> {
  return openSplashWindow(PORT, gameId);
}

export async function raceSplashClose(
  handle: SplashWindowHandle,
  gameId: string,
  windowSnapshotBefore: WindowInfo[],
  requiresLauncherId: string | undefined,
  pidToKillOnTimeout: number | undefined,
): Promise<void> {
  const windowResultPromise = waitForGameWindow(gameId, windowSnapshotBefore, requiresLauncherId, LAUNCH_WINDOW_TIMEOUT_MS);
  const errorPromise = waitForLaunchError(gameId, LAUNCH_WINDOW_TIMEOUT_MS);

  const raceResult = await Promise.race([
    windowResultPromise.then(r => ({ kind: 'window' as const, found: r.found })),
    errorPromise.then(found => ({ kind: 'error' as const, found })),
  ]);

  if (raceResult.kind === 'window' && raceResult.found) {
    emitLaunchPhase({ gameId, phase: 'done' });
    // v2.0.41-dev.38 — richiesta utente: la splash spariva esattamente
    // nello stesso istante in cui la finestra del gioco viene rilevata
    // (che coincide, per puro tempismo, col momento in cui la Dashboard
    // si riduce a icona — non lo stesso meccanismo, solo due rilevamenti
    // indipendenti che reagiscono quasi insieme allo stesso segnale di
    // fondo, verificato leggendo tray.py: hide_window() agisce su una
    // finestra specifica per titolo esatto, non sull'intero processo
    // browser). Due secondi di margine prima di chiudere davvero — dà
    // tempo alla finestra del gioco di diventare visibile e a fuoco.
    await sleep(2000);
    handle.close();
    return;
  }

  if (raceResult.kind === 'error' && raceResult.found) {
    emitLaunchPhase({ gameId, phase: 'failed' });
    await sleep(4000); // il messaggio di fallimento resta leggibile qualche secondo
    handle.close();
    return;
  }

  // Timeout di sicurezza — né finestra né errore entro
  // LAUNCH_WINDOW_TIMEOUT_MS. Il processo potrebbe non uscire mai da
  // solo (richiesta esplicita dell'utente): lo terminiamo qui.
  emitLaunchPhase({ gameId, phase: 'timeout' });
  if (pidToKillOnTimeout) {
    writeLog('warning', `[SPLASH] "${gameId}": nessuna finestra rilevata entro ${LAUNCH_WINDOW_TIMEOUT_MS / 1000}s — termino forzatamente il processo di lancio (PID ${pidToKillOnTimeout}).`);
    try { process.kill(pidToKillOnTimeout, 'SIGTERM'); } catch { /* già terminato */ }
    setTimeout(() => {
      try { process.kill(pidToKillOnTimeout, 'SIGKILL'); } catch { /* già terminato */ }
    }, 3000);
  }
  await sleep(4000);
  handle.close();
}
