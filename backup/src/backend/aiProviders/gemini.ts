/**
 * aiProviders/gemini.ts — adapter per SDK ufficiale @google/genai. Tier
 * gratuito reale con limiti di frequenza sui modelli Flash/Flash-Lite.
 * Nota privacy sul tier gratuito (prompt/risposte usabili da Google per
 * migliorare i propri modelli) già esposta all'utente in App.tsx.
 *
 * NOTA ONESTA: la forma di `usageMetadata` (nomi campi) è verificata contro
 * i tipi ufficiali della SDK (`GenerateContentResponseUsageMetadata`), non
 * con una chiamata reale — nessuna API key/rete disponibile qui. Il
 * comportamento a runtime (valori restituiti davvero dall'API) resta da
 * confermare al primo uso reale; se qualcosa non corrisponde, l'errore
 * viene comunque intercettato dal try/catch e restituito come 'give_up'
 * con il messaggio esatto, non un crash.
 */

import {
  AIProviderPlugin,
  AIResponse,
  ErrorContext,
  parseAIResponse,
  buildSystemPrompt,
  type TokenUsage,
} from './base';

// v1.1.13 — gemini-2.5-flash-lite non è più disponibile per le API key
// create dopo un certo punto ("no longer available to new users", 404
// NOT_FOUND anche con key valida) — non un bug del client, un modello
// ritirato lato Google per i nuovi progetti. gemini-3.1-flash-lite è
// l'equivalente attuale generalmente disponibile (GA) nella stessa fascia
// costo/latenza, verificato al momento di questa modifica (luglio 2026).
// Se in futuro anche questo dovesse essere ritirato, l'errore arriva
// comunque intercettato dal try/catch sotto (stesso principio già
// applicato altrove in questo file) — non un crash, solo un altro 404 da
// aggiornare qui.
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
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

export class GeminiPlugin extends AIProviderPlugin {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';
  readonly requiresPaidAccount = false; // tier gratuito reale, vedi nota privacy sopra
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
      return { kind: 'give_up', reason: 'Gemini non configurato (API key mancante).', usage: emptyUsage };
    }

    try {
      // Import dinamico: evita di caricare l'intero SDK (e la sua
      // inizializzazione) per i processi/test che non usano mai questo
      // provider — coerente con l'idea di provider realmente opt-in.
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: this.apiKey });

      const response = await Promise.race([
        ai.models.generateContent({
          model: this.model,
          contents: buildUserMessage(context),
          config: { systemInstruction: buildSystemPrompt(context.language) },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS)
        ),
      ]);

      const text = response.text ?? '';
      const usageMetadata = response.usageMetadata ?? {};
      const usage: TokenUsage = {
        inputTokens:  typeof usageMetadata.promptTokenCount === 'number' ? usageMetadata.promptTokenCount : 0,
        outputTokens: typeof usageMetadata.candidatesTokenCount === 'number' ? usageMetadata.candidatesTokenCount : 0,
      };

      if (!text) {
        return { kind: 'give_up', reason: 'Risposta di Gemini priva di contenuto testuale.', usage };
      }

      return parseAIResponse(text, usage);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { kind: 'give_up', reason: `Chiamata a Gemini fallita: ${reason}`, usage: emptyUsage };
    }
  }
}
