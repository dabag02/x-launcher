/**
 * launchPhaseTracker.ts — v2.0.41-dev.32, roadmap usabilità punto 2/3
 * (splash screen di lancio)
 *
 * Publish/subscribe leggero per le fasi di avvio di un gioco, in tempo
 * reale. Diverso dal meccanismo esistente per il Debug Console
 * (GameManager.addLog, letto per polling da /api/logs): qui serve
 * un vero streaming, perché la finestra della splash apre una propria
 * connessione SSE separata da quella che ha avviato il lancio (il POST
 * /api/games/:id/launch normale, invariato) — deve poter "agganciarsi"
 * a un lancio già in corso, non essere lei stessa a guidarlo (a
 * differenza di /api/runners/install-stream, che fa entrambe le cose
 * in un'unica richiesta).
 *
 * Non sostituisce addLog — le fasi vengono comunque scritte anche lì,
 * il Debug Console resta invariato. Questo è un canale aggiuntivo,
 * pensato solo per chi sta seguendo un lancio specifico in tempo reale.
 */

import { EventEmitter } from 'events';

export type LaunchPhaseName = 'verifying-env' | 'launching' | 'done' | 'failed' | 'timeout';

export interface LaunchPhaseEvent {
  gameId: string;
  phase: LaunchPhaseName;
  /** 1-based, solo per fasi con sotto-passi noti (es. verifica verb). */
  index?: number;
  total?: number;
  /** Es. nome del verb in corso di verifica, o il nome dello store. */
  detail?: string;
  ts: number;
}

const emitter = new EventEmitter();
// Più finestre di splash potenzialmente in ascolto sullo stesso gioco
// (caso limite, ma economico da coprire) — nessun limite artificiale
// sul numero di listener.
emitter.setMaxListeners(0);

/**
 * Ultima fase nota per ogni gioco — permette a un nuovo iscritto (la
 * splash che apre la propria connessione SSE DOPO che il lancio è già
 * iniziato, per via della latenza fra il POST di lancio e l'apertura
 * della finestra) di ricevere subito lo stato corrente invece di
 * restare in attesa del prossimo evento, che potrebbe non arrivare mai
 * se il lancio è già alla fase finale.
 */
const lastPhaseByGame = new Map<string, LaunchPhaseEvent>();

export function emitLaunchPhase(event: Omit<LaunchPhaseEvent, 'ts'>): void {
  const full: LaunchPhaseEvent = { ...event, ts: Date.now() };
  lastPhaseByGame.set(event.gameId, full);
  emitter.emit(event.gameId, full);
}

export function getLastLaunchPhase(gameId: string): LaunchPhaseEvent | undefined {
  return lastPhaseByGame.get(gameId);
}

export function subscribeLaunchPhase(gameId: string, listener: (event: LaunchPhaseEvent) => void): () => void {
  emitter.on(gameId, listener);
  return () => emitter.off(gameId, listener);
}

/**
 * v2.0.41-dev.32 — richiesta utente: il timeout di sicurezza dei 120s
 * conta dal lancio EFFETTIVO del processo (fase 'launching'), non da
 * quando l'utente ha premuto play — escluse deliberatamente tutte le
 * fasi preliminari (verifica verb, che può richiedere anche svariati
 * secondi per un gioco con molte dipendenze, come visto più volte in
 * questa stessa sessione). Nessun timeout esistente da ereditare —
 * verificato nel codice, non assunto: non c'era nulla di simile prima
 * d'ora.
 */
export const LAUNCH_WINDOW_TIMEOUT_MS = 120_000;
