/**
 * aiProviders/orchestrator.ts — punto unico chiamato da
 * notificationEngine.ts quando la Knowledge Base locale non trova nulla:
 * verifica il limite tentativi, prova i provider abilitati in ordine di
 * priorità (se uno risponde 'give_up', prova il successivo), ritorna il
 * primo esito utile o l'ultimo 'give_up'.
 *
 * Un solo provider è attivo alla volta (mutua esclusività applicata in
 * db.upsertAiProviderCredential) — il loop resta generico comunque.
 *
 * Budget token PER PROVIDER: a budget esaurito nessuna richiesta viene
 * più instradata a quel provider, finché l'utente non alza manualmente
 * il budget configurato (il numero stesso è la prova, nessun flag
 * separato). All'80% del budget, una notifica di preavviso una sola
 * volta al mese per provider (budget_warned_month). I provider locali
 * (Ollama) non hanno budget (tokenBudget undefined) e non sono mai
 * toccati da questo controllo.
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
   * v1.1.108-dev.1 — consumo/budget del provider che ha effettivamente
   * risposto (o dell'unico provider attivo, in caso di blocco per budget
   * esaurito) — non più un totale aggregato fra tutti i provider. undefined
   * quando response è null, o quando il provider è locale (Ollama — nessun
   * budget, mostrato come ∞ in UI).
   */
  usageThisMonth?: number;
  monthlyBudget?: number;
}

/** Mese corrente in formato 'YYYY-MM', per il tracciamento "già avvisato questo mese". */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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
  let lastUsageThisMonth: number | undefined;
  let lastMonthlyBudget: number | undefined;

  for (const provider of providers) {
    const cred = db.getAiProviderCredential(provider.id);
    const hasBudget = cred?.tokenBudget != null;

    // v1.1.108-dev.1 — blocco reale: se questo provider ha un budget
    // configurato (cloud) ed è già esaurito, NON lo si chiama affatto —
    // niente rete, niente consumo, solo un give_up esplicito che spiega
    // perché. Diverso da un fallimento del provider: qui non proviamo
    // nemmeno, per costruzione.
    if (hasBudget) {
      const usedSoFar = db.getAiUsageThisMonth().byProvider[provider.id] ?? 0;
      if (usedSoFar >= cred!.tokenBudget!) {
        writeLog('system', `[AI] ${provider.name}: budget esaurito (${usedSoFar}/${cred!.tokenBudget}) — richiesta NON instradata.`);
        lastResponse = {
          kind: 'give_up',
          reason: `Budget token esaurito per ${provider.name} (${usedSoFar.toLocaleString()}/${cred!.tokenBudget!.toLocaleString()} questo mese). Nessuna richiesta verrà instradata a questo provider finché non aumenti il budget in Impostazioni dopo aver acquistato altri token, oppure passa a un modello locale (Ollama).`,
          usage: { inputTokens: 0, outputTokens: 0 },
        };
        lastProviderName = provider.name;
        lastUsageThisMonth = usedSoFar;
        lastMonthlyBudget = cred!.tokenBudget!;
        continue; // prova un eventuale altro provider abilitato (in pratica non ce ne sono, per mutua esclusività)
      }
    }

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

      if (hasBudget) {
        const usedNow = db.getAiUsageThisMonth().byProvider[provider.id] ?? 0;
        lastUsageThisMonth = usedNow;
        lastMonthlyBudget = cred!.tokenBudget!;

        // v1.1.108-dev.1 — avviso all'80%, una sola volta al mese per
        // provider (budget_warned_month evita di rimandarlo a ogni
        // chiamata successiva finché non scatta il blocco vero e proprio).
        const month = currentMonthKey();
        if (usedNow / cred!.tokenBudget! >= 0.8 && cred!.budgetWarnedMonth !== month) {
          db.markAiBudgetWarned(provider.id, month);
          try {
            const { notificationEngine } = await import('../notificationEngine');
            notificationEngine.emit({
              type: 'system',
              level: 'warning',
              message: `${provider.name}: raggiunto l'80% del budget token mensile (${usedNow.toLocaleString()}/${cred!.tokenBudget!.toLocaleString()}). Le richieste si fermeranno automaticamente all'esaurimento, finché non alzi il budget dopo aver acquistato altri token.`,
            });
          } catch (err) {
            writeLog('warning', `[AI] Notifica soglia 80% budget non inviata per ${provider.name}: ${err}`);
          }
        }
      }

      if (response.kind !== 'give_up') {
        return {
          response, providerName: provider.name,
          usageThisMonth: lastUsageThisMonth,
          monthlyBudget: lastMonthlyBudget,
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
    usageThisMonth: lastUsageThisMonth,
    monthlyBudget: lastMonthlyBudget,
  };
}
