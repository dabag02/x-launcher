/**
 * aiProviders/openaiCompatible.ts — classe PARAMETRIZZATA, non specifica
 * di un provider: ChatGPT, DeepSeek, e Ollama stesso (se si preferisce
 * il suo endpoint OpenAI-compatible invece di quello nativo usato in
 * ollama.ts) parlano tutti lo stesso schema `/chat/completions` — un
 * solo adapter invece di tre quasi identici.
 *
 * Usata per istanziare sia DeepSeek che ChatGPT con baseURL/model
 * diversi (vedi makeDeepSeekPlugin/makeChatGPTPlugin sotto).
 */

import {
  AIProviderPlugin,
  AIResponse,
  ErrorContext,
  parseAIResponse,
  buildSystemPrompt,
  type TokenUsage,
} from './base';

const REQUEST_TIMEOUT_MS = 30_000;

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

export class OpenAICompatiblePlugin extends AIProviderPlugin {
  readonly id: string;
  readonly name: string;
  readonly requiresPaidAccount: boolean;
  readonly requiresApiKey: boolean;

  constructor(
    id: string,
    name: string,
    private baseURL: string,
    private model: string,
    private apiKey: string | undefined,
    requiresPaidAccount: boolean,
    requiresApiKey: boolean = true,
  ) {
    super();
    this.id = id;
    this.name = name;
    this.requiresPaidAccount = requiresPaidAccount;
    this.requiresApiKey = requiresApiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.baseURL) && Boolean(this.model) && (!this.requiresApiKey || Boolean(this.apiKey));
  }

  async askForFix(context: ErrorContext): Promise<AIResponse> {
    const emptyUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    if (!this.isConfigured()) {
      return { kind: 'give_up', reason: `${this.name} non configurato (API key o endpoint mancanti).`, usage: emptyUsage };
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

      const res = await fetch(`${this.baseURL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          response_format: { type: 'json_object' },
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
          reason: `${this.name} ha risposto con stato HTTP ${res.status} — verifica API key/quota/endpoint.`,
          usage: emptyUsage,
        };
      }

      const data = await res.json().catch(() => null);
      if (!data) {
        return { kind: 'give_up', reason: `Risposta di ${this.name} non in formato JSON valido.`, usage: emptyUsage };
      }

      const content = data?.choices?.[0]?.message?.content;
      const usage: TokenUsage = {
        inputTokens:  typeof data?.usage?.prompt_tokens === 'number' ? data.usage.prompt_tokens : 0,
        outputTokens: typeof data?.usage?.completion_tokens === 'number' ? data.usage.completion_tokens : 0,
      };

      if (typeof content !== 'string') {
        return { kind: 'give_up', reason: `Risposta di ${this.name} priva di contenuto testuale.`, usage };
      }

      return parseAIResponse(content, usage);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { kind: 'give_up', reason: `Chiamata a ${this.name} fallita: ${reason}`, usage: emptyUsage };
    }
  }
}

/**
 * Factory per DeepSeek — priorità di sviluppo per il motivo già discusso
 * (nessun pagamento richiesto all'attivazione, 5M token gratuiti).
 * model 'deepseek-chat' è il modello economico standard, adatto a questo
 * compito (non serve il modello di ragionamento più costoso per leggere
 * un log Wine).
 */
export function makeDeepSeekPlugin(apiKey: string | undefined, model: string = 'deepseek-chat'): OpenAICompatiblePlugin {
  return new OpenAICompatiblePlugin(
    'deepseek', 'DeepSeek',
    'https://api.deepseek.com/v1',
    model, apiKey,
    /* requiresPaidAccount */ false,
  );
}

/**
 * Factory per ChatGPT — predisposta ma non attivata per priorità di
 * sviluppo (richiede una ricarica a pagamento fin dal primo utilizzo,
 * nessun tetto gratuito reale — vedi discussione su costi). Stessa
 * classe di DeepSeek, zero codice nuovo quando sarà il suo turno.
 */
export function makeChatGPTPlugin(apiKey: string | undefined, model: string = 'gpt-5.4-nano'): OpenAICompatiblePlugin {
  return new OpenAICompatiblePlugin(
    'chatgpt', 'ChatGPT (OpenAI)',
    'https://api.openai.com/v1',
    model, apiKey,
    /* requiresPaidAccount */ true,
  );
}
