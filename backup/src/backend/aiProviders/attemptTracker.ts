/**
 * aiProviders/attemptTracker.ts — persistenza del limite tentativi
 * (MAX_AI_ATTEMPTS, vedi base.ts) per combinazione gioco+errore.
 *
 * Incapsula sia il calcolo della "firma" dell'errore (per riconoscere lo
 * stesso problema anche con dettagli minori diversi — PID, timestamp,
 * indirizzi di memoria) sia l'accesso alle tabelle DB dedicate
 * (ai_debug_attempts), cosi il resto del sistema lavora contro queste
 * poche funzioni invece di conoscere lo schema DB o la normalizzazione.
 */

import { createHash } from 'crypto';
import * as db from '../db';
import { AttemptRecord, AISuggestion, MAX_AI_ATTEMPTS } from './base';

/**
 * Normalizza il testo dell'errore prima di calcolarne l'hash — varianti
 * minori dello stesso problema (PID diverso, timestamp diverso, indirizzo
 * di memoria diverso in un crash altrimenti identico) devono produrre la
 * STESSA firma, altrimenti ogni chiusura genererebbe un contatore nuovo
 * invece di accumularsi sullo stesso problema.
 *
 * Deliberatamente conservativa: meglio unire per errore due problemi
 * leggermente diversi (rischio: un tentativo "sprecato" con contesto non
 * perfettamente pertinente) che separare due occorrenze dello stesso
 * problema (rischio: il limite di 3 tentativi non scatta mai perché ogni
 * volta sembra un errore "nuovo").
 */
/**
 * v0.99.90 — deduplica righe consecutive identiche prima del resto della
 * normalizzazione. Condivisa con orchestrator.ts (che la usa anche per
 * ripulire il testo mandato all'AI, non solo per la firma) — esportata da
 * qui perché la firma DEVE usare esattamente la stessa trasformazione
 * indipendentemente da dove viene calcolata: una volta dentro
 * runAdvisor() (sul log appena catturato) e una volta quando l'utente
 * conferma KO (sul raw_log memorizzato nella notifica) — se le due
 * chiamate deduplicassero in modo diverso, la stessa combinazione
 * gioco+errore produrrebbe firme diverse nei due momenti, rompendo
 * silenziosamente il conteggio dei tentativi.
 */
export function deduplicateLog(errorText: string): string {
  const lines = errorText.split('\n');
  const collapsed: string[] = [];
  for (const line of lines) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.startsWith(line + ' [x')) {
      const match = last.match(/^(.*) \[x(\d+)\]$/);
      const count = match ? parseInt(match[2], 10) + 1 : 2;
      collapsed[collapsed.length - 1] = `${line} [x${count}]`;
    } else if (last === line) {
      collapsed[collapsed.length - 1] = `${line} [x2]`;
    } else {
      collapsed.push(line);
    }
  }
  return collapsed.join('\n');
}

function normalizeErrorText(errorText: string): string {
  return deduplicateLog(errorText)
    .replace(/0x[0-9a-fA-F]+/g, '0xADDR')       // indirizzi di memoria
    .replace(/\bpid[:\s]+\d+\b/gi, 'pid N')     // PID
    .replace(/\b\d{4,}\b/g, 'N')                // altri numeri lunghi (timestamp, offset)
    .replace(/\/[\w.\-\/]+/g, '/PATH')          // path assoluti
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function computeErrorSignature(errorText: string): string {
  const normalized = normalizeErrorText(errorText);
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function toAttemptRecord(row: db.AiAttemptRecordRow): AttemptRecord {
  return {
    gameId:         row.gameId,
    errorSignature: row.errorSignature,
    attempts:       row.attempts as AttemptRecord['attempts'],
    givenUp:        row.givenUp,
    lastAttemptAt:  row.lastAttemptAt ?? '',
  };
}

export function getRecord(gameId: string, errorText: string): AttemptRecord | undefined {
  const signature = computeErrorSignature(errorText);
  const row = db.getAiAttemptRecord(gameId, signature);
  return row ? toAttemptRecord(row) : undefined;
}

/**
 * true se si può ancora tentare per questa combinazione gioco+errore —
 * false se il limite è stato raggiunto o se l'AI (o l'utente) ha già
 * concluso che non c'è una soluzione affidabile.
 */
export function canAttempt(gameId: string, errorText: string): boolean {
  const record = getRecord(gameId, errorText);
  if (!record) return true;
  if (record.givenUp) return false;
  return record.attempts.length < MAX_AI_ATTEMPTS;
}

/** Tentativi già falliti per questa combinazione — da passare come ErrorContext.pastAttempts. */
export function getPastAttempts(gameId: string, errorText: string) {
  return getRecord(gameId, errorText)?.attempts ?? [];
}

export function recordFailure(gameId: string, errorText: string, suggestion: AISuggestion): AttemptRecord {
  const signature = computeErrorSignature(errorText);
  const row = db.recordAiAttemptFailure(gameId, signature, suggestion, MAX_AI_ATTEMPTS);
  return toAttemptRecord(row);
}

/**
 * Azzera tutti i tentativi per un gioco — chiamata quando l'utente
 * modifica manualmente il compat profile (vedi gameManager.ts), non su
 * un timer. Ampio raggio deliberato: vedi motivazione in db.ts.
 */
export function resetForGame(gameId: string): void {
  db.resetAiAttemptsForGame(gameId);
}
