/**
 * splashOrchestrator.ts — v2.1.10-dev.12, splash integrata nella Dashboard
 *
 * STORIA: fino a v2.1.10-dev.11 la splash era una FINESTRA BROWSER
 * SEPARATA (splashWindow.ts, processo Chromium/Firefox a sé con un
 * proprio profilo dedicato), aperta e chiusa da questo stesso modulo.
 * Su richiesta esplicita dell'utente, sostituita con un overlay React
 * DENTRO la Dashboard stessa (stesso pattern del Gestore Processi/File
 * Manager) — nessuna finestra da aprire o chiudere qui: il frontend
 * ascolta direttamente lo stream di fasi già esistente
 * (/api/games/:id/launch-stream, invariato) e gestisce la propria
 * visibilità/chiusura per conto suo. `splashWindow.ts` è stato rimosso
 * (nessun altro chiamante rimasto).
 *
 * Questo modulo continua a fare le due cose che DAVVERO servivano anche
 * prima, indipendentemente dalla finestra: (1) la corsa fra rilevamento
 * finestra reale (windowDetector.ts), notifica di errore intercettata, e
 * timeout di sicurezza; (2) da questa versione, anche l'annullamento
 * esplicito richiesto dall'utente (tasto di chiusura della splash),
 * terza condizione della stessa corsa — vedi requestLaunchCancel.
 *
 * Mai un await bloccante su launchGame() — gira per conto proprio in
 * background, launchGame() prosegue/ritorna indipendentemente.
 */

import { emitLaunchPhase, LAUNCH_WINDOW_TIMEOUT_MS } from './launchPhaseTracker';
import { waitForGameWindow, WindowInfo } from './windowDetector';
import { notificationEngine, type EngineEvent } from './notificationEngine';
import { writeLog } from './logger';
import { gameManager } from './gameManager';
import { getActiveSessionInfo } from './activeDisplay';

// v2.2.19-dev.12 — Step 20 seguito: CONFERMATO su hardware reale
// (wmctrl -lx → "Cannot get client list properties (_NET_CLIENT_LIST or
// WIN_CLIENT_LIST)") che l'Xwayland interna di gamescope standalone non
// espone proprietà EWMH — la rilevazione finestra via windowDetector.ts
// è strutturalmente impossibile in questa sessione, non un bug da
// correggere. Su scelta esplicita dell'utente (opzione 1 fra le due
// proposte): nella sola sessione Kiosk, la splash si chiude non appena
// il processo di lancio risulta attivo nel gestore (stessa identica
// verifica di isLastLaunchedGameRunning, già usata altrove per lo stesso
// scopo), SENZA mai tentare la rilevazione finestra. Compromesso
// accettato consapevolmente: può chiudere la splash un istante prima che
// il gioco mostri davvero la propria finestra (la verifica diventa vera
// al primo processo reale della catena di lancio, non necessariamente
// l'eseguibile finale) — preferibile ad aspettare qualcosa che in questa
// sessione non arriverà mai. Sessione desktop (XFCE) INVARIATA: wmctrl
// funziona lì, resta il percorso basato su windowDetector.ts.
function waitForProcessAlive(gameId: string, timeoutMs: number, pollIntervalMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const check = gameManager.isLastLaunchedGameRunning();
      if (check.running && check.gameId === gameId) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, pollIntervalMs);
    };
    tick();
  });
}

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

// v2.1.10-dev.12 — un solo annullamento pendente per gioco: il flusso
// previsto è lancio → eventuale annullamento tramite il tasto di
// chiusura della splash, mai due lanci dello stesso gioco in corsa
// contemporaneamente (il gioco risulterebbe già "in esecuzione" per il
// secondo tentativo, bloccato più a monte).
const pendingCancelResolvers = new Map<string, () => void>();

function waitForCancelRequest(gameId: string): Promise<void> {
  return new Promise((resolve) => {
    pendingCancelResolvers.set(gameId, resolve);
  });
}

/**
 * Chiamata dal nuovo endpoint POST /api/games/:id/cancel-launch (tasto
 * di chiusura della splash, mentre il lancio è ancora in corso — punto
 * (c) della richiesta dell'utente). Ritorna false se non c'è alcuna
 * corsa in ascolto per questo gameId (lancio già concluso per conto
 * suo, o mai iniziato) — il chiamante lo usa per rispondere onestamente
 * al frontend invece di far finta che l'annullamento sia riuscito.
 */
export function requestLaunchCancel(gameId: string): boolean {
  const resolve = pendingCancelResolvers.get(gameId);
  if (!resolve) return false;
  pendingCancelResolvers.delete(gameId);
  resolve();
  return true;
}

export async function raceSplashClose(
  gameId: string,
  windowSnapshotBefore: WindowInfo[],
  requiresLauncherId: string | undefined,
  pidToKillOnTimeout: number | undefined,
): Promise<void> {
  // v2.2.19-dev.12 — vedi commento di waitForProcessAlive sopra: in
  // Kiosk la rilevazione finestra è impossibile per costruzione
  // (confermato su hardware reale), sostituita dalla verifica di
  // processo. Il nome del ramo nel race result resta 'window' in
  // entrambi i casi — il resto della funzione (emissione fase 'done',
  // pulizia pendingCancelResolvers) non deve sapere quale dei due ha
  // prodotto il risultato.
  const isKiosk = getActiveSessionInfo().kind === 'kiosk';
  const windowResultPromise = isKiosk
    ? waitForProcessAlive(gameId, LAUNCH_WINDOW_TIMEOUT_MS).then(found => ({ found }))
    : waitForGameWindow(gameId, windowSnapshotBefore, requiresLauncherId, LAUNCH_WINDOW_TIMEOUT_MS);
  const errorPromise = waitForLaunchError(gameId, LAUNCH_WINDOW_TIMEOUT_MS);
  const cancelPromise = waitForCancelRequest(gameId);

  const raceResult = await Promise.race([
    windowResultPromise.then(r => ({ kind: 'window' as const, found: r.found })),
    errorPromise.then(found => ({ kind: 'error' as const, found })),
    cancelPromise.then(() => ({ kind: 'cancel' as const, found: true })),
  ]);

  // Pulizia indipendentemente da chi ha vinto la corsa — se non è stato
  // il ramo cancel a vincere, il resolver resterebbe altrimenti
  // registrato per un annullamento che non arriverà mai più a
  // proposito (il lancio è già concluso in un altro modo).
  pendingCancelResolvers.delete(gameId);

  if (raceResult.kind === 'window' && raceResult.found) {
    emitLaunchPhase({ gameId, phase: 'done' });
    return;
  }

  if (raceResult.kind === 'error' && raceResult.found) {
    emitLaunchPhase({ gameId, phase: 'failed' });
    return;
  }

  if (raceResult.kind === 'cancel') {
    // v2.1.10-dev.12 — annullamento esplicito dell'utente, non un
    // timeout automatico: stessa terminazione SIGTERM poi SIGKILL, ma
    // un log a livello 'info' invece di 'warning' — non è un problema,
    // è esattamente quello che l'utente ha chiesto di fare.
    emitLaunchPhase({ gameId, phase: 'cancelled' });
    if (pidToKillOnTimeout) {
      writeLog('info', `[SPLASH] "${gameId}": lancio annullato dall'utente — termino il processo (PID ${pidToKillOnTimeout}).`);
      try { process.kill(pidToKillOnTimeout, 'SIGTERM'); } catch { /* già terminato */ }
      setTimeout(() => {
        try { process.kill(pidToKillOnTimeout, 'SIGKILL'); } catch { /* già terminato */ }
      }, 3000);
    }
    return;
  }

  // Timeout di sicurezza — né finestra né errore né annullamento entro
  // LAUNCH_WINDOW_TIMEOUT_MS. Il processo potrebbe non uscire mai da
  // solo (richiesta esplicita dell'utente): lo terminiamo qui.
  emitLaunchPhase({ gameId, phase: 'timeout' });
  if (pidToKillOnTimeout) {
    const reason = isKiosk ? 'nessun processo rilevato come attivo' : 'nessuna finestra rilevata';
    writeLog('warning', `[SPLASH] "${gameId}": ${reason} entro ${LAUNCH_WINDOW_TIMEOUT_MS / 1000}s — termino forzatamente il processo di lancio (PID ${pidToKillOnTimeout}).`);
    try { process.kill(pidToKillOnTimeout, 'SIGTERM'); } catch { /* già terminato */ }
    setTimeout(() => {
      try { process.kill(pidToKillOnTimeout, 'SIGKILL'); } catch { /* già terminato */ }
    }, 3000);
  }
}
