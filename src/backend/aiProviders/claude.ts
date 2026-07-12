/**
 * aiProviders/claude.ts — Step 15d, quarto adapter (Anthropic Messages API).
 *
 * A differenza di ChatGPT/DeepSeek/Ollama (tutti sul dialetto
 * OpenAI-compatible, coperti da openaiCompatible.ts) e di Gemini (SDK
 * proprio), Claude usa un proprio schema REST — niente factory
 * riutilizzabile qui, un adapter dedicato.
 *
 * requiresPaidAccount: true — nessun tier gratuito reale per l'API
 * Anthropic, ricarica prepagata richiesta fin dal primo utilizzo (stessa
 * categoria di ChatGPT, vedi discussione su costi). Per questo è stato
 * l'ultimo dei quattro ad essere implementato, non il primo.
 *
 * Modello di default: claude-haiku-4-5-20251001 — il più economico della
 * gamma attuale, adatto a questo compito (leggere un log Wine e
 * suggerire un fix strutturato, non serve un modello di punta).
 */

import {
  AIProviderPlugin,
  AIResponse,
  ErrorContext,
  parseAIResponse,
  AI_SYSTEM_PROMPT,
  type TokenUsage,
} from './base';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024; // risposta JSON strutturata breve, non serve di più
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

export class ClaudePlugin extends AIProviderPlugin {
  readonly id = 'claude';
  readonly name = 'Claude (Anthropic)';
  readonly requiresPaidAccount = true;
  readonly requiresApiKey = true;

  constructor(
    private apiKey: string | undefined,
    private model: string = DEFAULT_MODEL,
  ) {
    super();
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async askForFix(context: ErrorContext): Promise<AIResponse> {
    const emptyUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    if (!this.isConfigured()) {
      return { kind: 'give_up', reason: 'Claude non configurato (API key mancante).', usage: emptyUsage };
    }

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey!,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: MAX_TOKENS,
          system: AI_SYSTEM_PROMPT,
          messages: [
            { role: 'user', content: buildUserMessage(context) },
          ],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        // 401 = API key non valida, 429 = rate limit/quota, altri = vari
        // — non differenziamo qui il messaggio caso per caso, il codice
        // HTTP grezzo è già sufficiente per capire cosa controllare.
        return {
          kind: 'give_up',
          reason: `Claude ha risposto con stato HTTP ${res.status} — verifica API key/quota.`,
          usage: emptyUsage,
        };
      }

      const data = await res.json().catch(() => null);
      if (!data) {
        return { kind: 'give_up', reason: 'Risposta di Claude non in formato JSON valido.', usage: emptyUsage };
      }

      // Il campo "content" è un array di blocchi (testo, tool_use, ecc.) —
      // qui ci aspettiamo solo testo, dato che non passiamo alcun tool.
      const textBlock = Array.isArray(data?.content)
        ? data.content.find((b: any) => b?.type === 'text')
        : null;
      const text = textBlock?.text ?? '';

      const usage: TokenUsage = {
        inputTokens:  typeof data?.usage?.input_tokens === 'number' ? data.usage.input_tokens : 0,
        outputTokens: typeof data?.usage?.output_tokens === 'number' ? data.usage.output_tokens : 0,
      };

      if (!text) {
        return { kind: 'give_up', reason: 'Risposta di Claude priva di contenuto testuale.', usage };
      }

      return parseAIResponse(text, usage);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { kind: 'give_up', reason: `Chiamata a Claude fallita: ${reason}`, usage: emptyUsage };
    }
  }
}
