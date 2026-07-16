/**
 * aiProviders/orchestrator.ts — Step 15d, ultimo collegamento.
 *
 * Punto unico che notificationEngine.ts chiama quando la Knowledge Base
 * locale non ha trovato nulla: verifica il limite tentativi, prova i
 * provider abilitati in ordine di priorità (fallback silenzioso — se uno
 * risponde 'give_up', si prova il successivo), e ritorna il primo esito
 * utile o l'ultimo 'give_up' se nessuno ha trovato nulla.
 */

import { ErrorContext, AIResponse, MAX_AI_ATTEMPTS } from './base';
import { getActiveProviders } from './registry';
import * as attemptTracker from './attemptTracker';
import { deduplicateLog } from './attemptTracker';
import { writeLog } from '../logger';
import * as db from '../db';
import { readAppConfig } from '../appConfig';

export interface AdvisorResult {
  /** null = nessun provider abilitato/configurato — non è un errore, l'utente non ha attivato la funzione. */
  response: AIResponse | null;
  providerName?: string;
  /**
   * v0.99.90 — Step 15d: consumo token del mese corrente DOPO questa
   * chiamata (se ce n'è stata una) e budget mensile configurato — per il
   * contatore "hai usato X di Y token questo mese" nelle notifiche.
   * undefined quando response è null (nessun provider chiamato, nulla da
   * riportare).
   */
  usageThisMonth?: number;
  monthlyBudget?: number;
}

export async function runAdvisor(
  gameId: string,
  gameTitle: string | undefined,
  errorText: string,
): Promise<AdvisorResult> {
  const cleanedErrorText = deduplicateLog(errorText);

  if (!attemptTracker.canAttempt(gameId, cleanedErrorText)) {
    writeLog('system', `[AI] Limit of ${MAX_AI_ATTEMPTS} attempts already reached for this error — no new call.`);
    return {
      response: {
        kind: 'give_up',
        reason: `Limite di ${MAX_AI_ATTEMPTS} tentativi già raggiunto per questo errore. Modifica manualmente la configurazione per riprovare.`,
        usage: { inputTokens: 0, outputTokens: 0 },
      },
      // Nessuna chiamata reale è avvenuta qui — non registriamo consumo,
      // ma riportiamo comunque lo stato attuale del budget cosi la
      // notifica può mostrarlo pure in questo caso.
      usageThisMonth: db.getAiUsageThisMonth().totalTokens,
      monthlyBudget: readAppConfig().aiMonthlyTokenBudget,
    };
  }

  const providers = getActiveProviders();
  if (providers.length === 0) {
    // Nessun provider AI abilitato — non è un errore, l'utente
    // semplicemente non ha attivato questa funzione (opt-in esplicito).
    return { response: null };
  }

  const pastAttempts = attemptTracker.getPastAttempts(gameId, cleanedErrorText);
  // Step 19b (v1.1.60) — lingua corrente della UI, propagata a ogni
  // provider tramite ErrorContext.language invece di lasciare "in
  // italiano" fisso nel prompt di sistema (vedi buildSystemPrompt in
  // base.ts).
  const language = readAppConfig().language;
  const context: ErrorContext = { errorText: cleanedErrorText, gameTitle, pastAttempts, language };

  let lastResponse: AIResponse | null = null;
  let lastProviderName: string | undefined;

  for (const provider of providers) {
    try {
      const response = await provider.askForFix(context);
      lastResponse = response;
      lastProviderName = provider.name;

      // v0.99.90 — registra il consumo di QUESTA chiamata, qualunque sia
      // l'esito (suggestion/clarify/give_up consumano token allo stesso
      // modo — il costo è nella richiesta processata dal modello, non
      // nel tipo di risposta prodotta).
      db.recordAiUsage(provider.id, response.usage.inputTokens, response.usage.outputTokens);

      writeLog(
        'system',
        `[AI] ${provider.name}: ${response.kind}` +
        (response.kind === 'give_up' ? ` — ${response.reason}` : '') +
        ` (${response.usage.inputTokens}+${response.usage.outputTokens} tokens)`
      );

      if (response.kind !== 'give_up') {
        return {
          response, providerName: provider.name,
          usageThisMonth: db.getAiUsageThisMonth().totalTokens,
          monthlyBudget: readAppConfig().aiMonthlyTokenBudget,
        };
      }
      // give_up → fallback silenzioso al provider successivo in ordine di priorità.
    } catch (err) {
      // askForFix non dovrebbe MAI lanciare (contratto esplicito in
      // base.ts) — difesa ulteriore comunque: un provider che viola il
      // contratto non deve interrompere il fallback verso gli altri, né
      // tantomeno far cadere il resto del daemon.
      writeLog('error', `[AI] ${provider.name} violated the askForFix contract (unhandled exception): ${err instanceof Error ? err.message : err}`);
    }
  }

  // Tutti i provider hanno esaurito la lista senza un esito utile —
  // ritorna l'ultimo give_up incontrato, cosi il chiamante ha almeno una
  // motivazione da mostrare invece di un vuoto senza spiegazione.
  return {
    response: lastResponse, providerName: lastProviderName,
    usageThisMonth: db.getAiUsageThisMonth().totalTokens,
    monthlyBudget: readAppConfig().aiMonthlyTokenBudget,
  };
}
