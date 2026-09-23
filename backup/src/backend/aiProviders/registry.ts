/**
 * aiProviders/registry.ts — costruisce le istanze concrete dei provider
 * a partire dalle credenziali salvate in ai_provider_credentials,
 * nell'ordine di priorità usato per il fallback silenzioso in
 * orchestrator.ts.
 */

import * as db from '../db';
import { AIProviderPlugin } from './base';
import { OllamaPlugin } from './ollama';
import { GeminiPlugin } from './gemini';
import { ClaudePlugin } from './claude';
import { makeDeepSeekPlugin, makeChatGPTPlugin } from './openaiCompatible';

/**
 * Esportata (non più privata) per riuso da server.ts: la route di test
 * connessione deve poter costruire un'istanza "usa e getta" con valori
 * presi direttamente dal form (non ancora salvati in DB), senza
 * duplicare qui lo switch sui provider.
 */
export function buildProvider(cred: db.AiProviderCredential): AIProviderPlugin | null {
  switch (cred.providerId) {
    case 'ollama':   return new OllamaPlugin(cred.baseUrl, cred.model);
    case 'gemini':   return new GeminiPlugin(cred.apiKey, cred.model);
    case 'deepseek': return makeDeepSeekPlugin(cred.apiKey, cred.model);
    case 'chatgpt':  return makeChatGPTPlugin(cred.apiKey, cred.model);
    case 'claude':   return new ClaudePlugin(cred.apiKey, cred.model);
    default:
      // provider_id sconosciuto (es. refuso in un futuro inserimento
      // manuale in DB) — ignorato silenziosamente, non un errore fatale.
      return null;
  }
}

/**
 * Provider realmente utilizzabili in questo momento: abilitati dall'utente
 * E configurati (API key/endpoint presenti) — non basta uno dei due.
 * Ordinati per priority crescente (usato dall'orchestrator per il
 * fallback silenzioso: il primo della lista è il "provider di default").
 */
export function getActiveProviders(): AIProviderPlugin[] {
  return db.getAllAiProviderCredentials()
    .filter(c => c.enabled)
    .map(buildProvider)
    .filter((p): p is AIProviderPlugin => p !== null && p.isConfigured());
}
