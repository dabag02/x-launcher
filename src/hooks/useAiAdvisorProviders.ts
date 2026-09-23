// useAiAdvisorProviders — hook React che isola stato e logica della tab
// AI Advisor (Ollama locale + i quattro provider cloud Gemini/DeepSeek/
// ChatGPT/Claude), estratto da App.tsx come terzo passo di
// modularizzazione (v1.5.12-dev.1), sullo stesso modello di
// useCloudBackupProviders/useNotifications.
//
// Nessun id di Focusable/neighbors/sequentialChain qui dentro — solo
// stato, fetch e funzioni di supporto. Il JSX (tab AI Advisor
// nell'overlay Impostazioni) resta in App.tsx invariato, questo hook si
// limita a spostare *dove vive* la logica: stessa API (stessi nomi
// restituiti) di prima, per un diff minimo nel chiamante.
import React, { useState, useEffect } from 'react';

export interface CloudProviderState {
  enabled: boolean;
  hasStoredKey: boolean;
  apiKeyDraft: string;
  testing: boolean;
  testResult: { success: boolean; message: string } | null;
  // v1.1.108-dev.1 — budget per-provider (richiesto dall'utente: ogni
  // provider cloud mostra il proprio credito reale, non un totale
  // mescolato). tokenBudget è sempre presente per un provider cloud
  // (default 5.000.000 assegnato da server.ts alla prima
  // configurazione) — undefined solo prima che la GET iniziale risponda.
  tokenBudget?: number;
  usageThisMonth?: number;
}

export interface OllamaModel {
  name: string;
  sizeBytes: number;
  parameterSize: string | null;
  quantization: string | null;
}

// Shape esatto di GET /api/ai/providers (vedi route corrispondente in
// server.ts) — spread di AiProviderCredential (db.ts) con apiKey mascherata
// e usageThisMonth aggiunto lato server, mai il tipo grezzo del DB.
interface RawAiProvider {
  providerId: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  priority: number;
  tokenBudget?: number;
  budgetWarnedMonth?: string;
  usageThisMonth: number;
}

/**
 * @param showSettings true quando l'overlay Impostazioni è aperto — usato
 *   per riallineare lo stato ogni volta che l'utente lo riapre (stesso
 *   principio già in uso per gli altri stati di questa tab in App.tsx).
 * @param cloudProviderIds elenco ordinato degli id provider cloud (es.
 *   CLOUD_PROVIDERS.map(p => p.id)) — serve solo per calcolare la
 *   priorità inviata al server in saveCloudProvider, non duplicato qui.
 */
export function useAiAdvisorProviders(showSettings: boolean, cloudProviderIds: string[]) {
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [activeOllamaModel, setActiveOllamaModel] = useState<string | null>(null);
  // v0.99.90 — tracciato separatamente dal modello attivo: serve per
  // sapere se il provider Ollama è acceso o spento, non solo quale
  // modello userebbe se fosse acceso (premere A sulla riga già
  // selezionata deve spegnere Ollama, non limitarsi a riselezionarla).
  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  const [ollamaUsageThisMonth, setOllamaUsageThisMonth] = useState<number>(0);
  // v0.99.90 — Step 15d: stato dei quattro provider cloud. apiKeyDraft è
  // ciò che l'utente ha digitato in QUESTA sessione tramite la tastiera
  // on-screen — mai il vero valore salvato (la GET restituisce sempre
  // '••••••••' se una key è già presente, mai in chiaro, vedi server.ts).
  // hasStoredKey distingue "una key è già salvata, anche se non la vedo"
  // da "nessuna key mai inserita".
  const [cloudProviderState, setCloudProviderState] = useState<Record<string, CloudProviderState>>({});

  // v0.99.90 — Step 15d: verifica raggiungibilità Ollama + elenco modelli.
  // Al boot (una volta) e ad ogni apertura di Impostazioni (cosi se Ollama
  // viene avviato DOPO il boot della dashboard, la tab compare comunque
  // la prossima volta che l'utente apre Impostazioni, senza dover
  // riavviare l'intera dashboard). Timeout breve lato server (2s) — non
  // deve mai far percepire un ritardo all'apertura del pannello.
  const refreshOllamaModels = React.useCallback(() => {
    fetch('/api/ai/ollama/models')
      .then(r => r.json())
      .then(data => {
        setOllamaAvailable(Boolean(data?.available));
        setOllamaModels(Array.isArray(data?.models) ? data.models : []);
      })
      .catch(() => { setOllamaAvailable(false); setOllamaModels([]); });
    fetch('/api/ai/providers')
      .then(r => r.json())
      .then((providers: RawAiProvider[]) => {
        const ollama = providers.find(p => p.providerId === 'ollama');
        setActiveOllamaModel(ollama?.model ?? null);
        setOllamaEnabled(Boolean(ollama?.enabled));
        // v1.1.108-dev.1 — Ollama non ha budget (provider locale, vedi
        // requiresApiKey===false in registry.ts) ma il consumo resta
        // informativo da mostrare comunque, accanto al simbolo ∞.
        setOllamaUsageThisMonth(ollama?.usageThisMonth ?? 0);

        // v0.99.90 — stato dei quattro provider cloud dalla stessa
        // risposta — nessuna chiamata separata. Preserva apiKeyDraft
        // già digitato in questa sessione (non sovrascriverlo con
        // vuoto solo perché abbiamo ri-fatto il fetch), aggiorna solo
        // enabled/hasStoredKey/testResult/tokenBudget/usageThisMonth.
        setCloudProviderState(prev => {
          const next = { ...prev };
          for (const id of ['gemini', 'deepseek', 'chatgpt', 'claude']) {
            const p = providers.find((x) => x.providerId === id);
            next[id] = {
              enabled:      Boolean(p?.enabled),
              hasStoredKey: Boolean(p?.apiKey), // mascherata ma non vuota = presente
              apiKeyDraft:  prev[id]?.apiKeyDraft ?? '',
              testing:      false,
              testResult:   prev[id]?.testResult ?? null,
              // v1.1.108-dev.1 — budget per-provider, incluso qui invece
              // che in una chiamata /api/ai/usage separata (rimossa).
              tokenBudget:     p?.tokenBudget ?? 5_000_000,
              usageThisMonth:  p?.usageThisMonth ?? 0,
            };
          }
          return next;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => { refreshOllamaModels(); }, [refreshOllamaModels]);
  useEffect(() => { if (showSettings) refreshOllamaModels(); }, [showSettings, refreshOllamaModels]);

  // v0.99.90 — Step 15d: salva enabled/apiKey per un provider cloud.
  // Aggiornamento parziale lato server (vedi fix in server.ts) — inviare
  // solo apiKeyDraft se non vuoto evita di cancellare una key già salvata
  // quando l'utente tocca solo il toggle enabled.
  // v1.1.108-dev.1 — patch.tokenBudget: quando l'utente alza il budget
  // dopo aver esaurito quello configurato (segnale implicito di "ho
  // pagato per continuare", vedi orchestrator.ts), passa da qui.
  const saveCloudProvider = React.useCallback((id: string, patch: { enabled?: boolean; apiKey?: string; tokenBudget?: number }) => {
    const state = cloudProviderState[id];
    fetch(`/api/ai/providers/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled:     patch.enabled ?? state?.enabled ?? false,
        apiKey:      patch.apiKey,
        tokenBudget: patch.tokenBudget ?? state?.tokenBudget,
        priority: cloudProviderIds.findIndex(pid => pid === id) + 1, // 0 è Ollama
      }),
    }).then(() => refreshOllamaModels()).catch(() => {});
  }, [cloudProviderState, refreshOllamaModels, cloudProviderIds]);

  const testCloudProvider = React.useCallback((id: string) => {
    setCloudProviderState(prev => ({ ...prev, [id]: { ...prev[id], testing: true, testResult: null } }));
    const draft = cloudProviderState[id]?.apiKeyDraft;
    fetch(`/api/ai/providers/${id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: draft || undefined }),
    })
      .then(r => r.json())
      .then(data => {
        setCloudProviderState(prev => ({
          ...prev,
          [id]: { ...prev[id], testing: false, testResult: { success: Boolean(data?.success), message: data?.message ?? 'Nessuna risposta.' } },
        }));
      })
      .catch(() => {
        setCloudProviderState(prev => ({
          ...prev,
          [id]: { ...prev[id], testing: false, testResult: { success: false, message: 'Richiesta fallita — daemon non raggiungibile?' } },
        }));
      });
  }, [cloudProviderState]);

  // v1.1.12 — prima l'unico modo per liberarsi di una API key salvata
  // (es. non valida, generata per lo scopo sbagliato) era sovrascriverla
  // con una nuova: nessuna via per tornare a "nessuna key" senza averne
  // già un'altra pronta. Rimuove l'intera credenziale lato server —
  // enabled torna false insieme, coerente con "provider non configurato".
  const removeCloudProviderKey = React.useCallback((id: string) => {
    fetch(`/api/ai/providers/${id}`, { method: 'DELETE' })
      .then(() => {
        setCloudProviderState(prev => ({
          ...prev,
          [id]: { ...prev[id], enabled: false, apiKeyDraft: '', hasStoredKey: false, testResult: null },
        }));
      })
      .catch(() => {});
  }, []);

  return {
    ollamaAvailable,
    ollamaModels,
    activeOllamaModel,
    setActiveOllamaModel,
    ollamaEnabled,
    setOllamaEnabled,
    ollamaUsageThisMonth,
    cloudProviderState,
    setCloudProviderState,
    refreshOllamaModels,
    saveCloudProvider,
    testCloudProvider,
    removeCloudProviderKey,
  };
}
