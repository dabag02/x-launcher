/**
 * aiProviders/ollama.ts — adapter locale: nessun account, nessun dato
 * che lascia la macchina.
 *
 * Usa l'API nativa di Ollama (/api/chat, non l'endpoint OpenAI-compatible
 * che Ollama espone anche) — quella nativa restituisce già i conteggi
 * token per il budget, in campi diversi da OpenAI: prompt_eval_count /
 * eval_count invece di usage.prompt_tokens/completion_tokens.
 *
 * Credenziali/configurazione non gestite qui: baseURL e model arrivano
 * dal chiamante (costruttore), letti dalla configurazione persistita in
 * registry.ts.
 */

import {
  AIProviderPlugin,
  AIResponse,
  ErrorContext,
  parseAIResponse,
  buildSystemPrompt,
  type TokenUsage,
} from './base';

const DEFAULT_BASE_URL = 'http://localhost:11434';
// v0.99.90 — 90s, non 30 come i provider cloud: Ollama scarica il modello
// dal disco alla VRAM solo alla prima richiesta dopo un periodo di
// inattività ("cold start"), e quel caricamento da solo può superare
// abbondantemente 30s (confermato empiricamente: primo tentativo in
// timeout, secondo tentativo — modello già caricato — risolto in ~4s).
// Nessun costo nell'aspettare di più: locale, gratuito, non condiviso
// con altri utenti che aspettano la stessa risposta.
const REQUEST_TIMEOUT_MS = 90_000;

function buildUserMessage(context: ErrorContext): string {
  const parts: string[] = [];
  if (context.gameTitle) parts.push(`Gioco: ${context.gameTitle}`);
  if (context.store)     parts.push(`Store: ${context.store}`);
  if (context.runner)    parts.push(`Runner: ${context.runner}`);
  parts.push(`Log errore:\n${context.errorText}`);

  if (context.pastAttempts.length > 0) {
    parts.push(
      `\nTentativi già provati e FALLITI per questo stesso errore (non riproporli):\n` +
      context.pastAttempts.map((a, i) => `${i + 1}. ${a.suggestion.solution}`).join('\n')
    );
  }
  if (context.clarificationAnswer) {
    parts.push(`\nL'utente ha risposto alla domanda di chiarimento precedente: ${context.clarificationAnswer}`);
  }
  return parts.join('\n');
}

export class OllamaPlugin extends AIProviderPlugin {
  readonly id = 'ollama';
  readonly name = 'Ollama (locale)';
  readonly requiresPaidAccount = false;
  readonly requiresApiKey = false;

  constructor(
    private baseURL: string = DEFAULT_BASE_URL,
    private model: string = 'llama3.1',
  ) {
    super();
  }

  isConfigured(): boolean {
    // Nessuna API key da verificare — l'unico requisito è che baseURL e
    // model siano valorizzati (hanno comunque un default sensato).
    return Boolean(this.baseURL) && Boolean(this.model);
  }

  async askForFix(context: ErrorContext): Promise<AIResponse> {
    const emptyUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    if (!this.isConfigured()) {
      return { kind: 'give_up', reason: 'Ollama non configurato (baseURL o model mancanti).', usage: emptyUsage };
    }

    try {
      const res = await fetch(`${this.baseURL.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: buildSystemPrompt(context.language) },
            { role: 'user', content: buildUserMessage(context) },
          ],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        return {
          kind: 'give_up',
          reason: `Ollama ha risposto con stato HTTP ${res.status} — server locale non raggiungibile o modello "${this.model}" non disponibile (verifica con 'ollama list').`,
          usage: emptyUsage,
        };
      }

      const data = await res.json().catch(() => null);
      if (!data) {
        return { kind: 'give_up', reason: 'Risposta di Ollama non in formato JSON valido.', usage: emptyUsage };
      }

      const content = data?.message?.content;
      const usage: TokenUsage = {
        inputTokens:  typeof data?.prompt_eval_count === 'number' ? data.prompt_eval_count : 0,
        outputTokens: typeof data?.eval_count === 'number' ? data.eval_count : 0,
      };

      if (typeof content !== 'string') {
        return { kind: 'give_up', reason: 'Risposta di Ollama priva di contenuto testuale.', usage };
      }

      return parseAIResponse(content, usage);
    } catch (err) {
      // Qualunque fallimento (server non in ascolto, timeout, rete) —
      // mai un'eccezione propagata, coerente col contratto di askForFix.
      const reason = err instanceof Error ? err.message : String(err);
      return { kind: 'give_up', reason: `Chiamata a Ollama fallita: ${reason}`, usage: emptyUsage };
    }
  }
}
