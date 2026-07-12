/**
 * aiProviders/base.ts — Step 15d (AI Advisor), Step 1 del piano concordato.
 *
 * Interfaccia comune per i provider AI (Gemini, Ollama, ChatGPT, DeepSeek,
 * Claude, ...), sullo stesso modello di StorePlugin (src/backend/plugins/base.ts).
 *
 * v0.99.90 — riscrittura completa dopo la fase di progettazione: la prima
 * versione (Step 1 originale) assumeva un contratto request→risposta
 * singola, sempre risolutiva. Le decisioni prese dopo hanno reso quella
 * forma insufficiente su tre punti, tutti incorporati qui:
 *
 *   1. LIMITE TENTATIVI — un problema può non avere soluzione nota. Senza
 *      un limite, l'advisor rischierebbe un loop prova/fallisci infinito.
 *      Tetto a 3 tentativi per combinazione gioco+errore, con lo storico
 *      dei tentativi falliti passato come contesto ad ogni tentativo
 *      successivo (cosi il secondo/terzo tentativo è informato, non
 *      ripete alla cieca la stessa ipotesi). Reset non automatico nel
 *      tempo: solo se l'utente modifica manualmente il compat profile
 *      dopo l'ultimo tentativo fallito (segno che la situazione di
 *      partenza è cambiata).
 *
 *   2. TRE ESITI, non uno — un provider a volte non ha abbastanza
 *      informazione per proporre una soluzione, e la risposta corretta è
 *      "dimmi di più", non un suggerimento inventato per forza. AIResponse
 *      sostituisce il singolo AISuggestion con un tipo a tre rami:
 *      suggestion / clarify / give_up.
 *
 *   3. CONTEGGIO TOKEN — serve il consumo ESATTO (non stimato) di ogni
 *      chiamata per il contatore budget stile "hai ancora X/Y token
 *      questo mese" nelle notifiche. Tutti i provider previsti
 *      restituiscono questo dato nella risposta stessa — nessuna stima
 *      a priori necessaria, va solo propagato.
 *
 * Punto di innesto nel sistema esistente (deciso in fase di progettazione,
 * non ancora collegato in questo step): notificationEngine.ts, dove
 * knowledgeBase.lookup() ritorna già null oggi per download-error/
 * launch-error senza match — lì si aggancerà la chiamata al provider di
 * default, non prima. Ordine di sviluppo deciso: KB locale ampliata prima
 * (riduce quanti errori arrivano mai fino a qui), poi i provider senza
 * legame di pagamento diretto (DeepSeek, Gemini, Ollama) prima di
 * ChatGPT/Claude (entrambi richiedono una ricarica a pagamento fin dal
 * primo utilizzo, nessun tetto gratuito reale).
 * REQUISITO UI (deciso in fase di progettazione, non ancora implementato
 * — nessuna interfaccia esiste ancora per l'AI Advisor): ovunque l'utente
 * interagirà con l'esito di un provider AI nella dashboard (notifiche,
 * tab Impostazioni → AI Providers), va etichettato esplicitamente come
 * "EXPERIMENTAL" — non un dettaglio estetico. Motivo: a differenza della
 * Knowledge Base locale (pattern verificati, alta affidabilità), un
 * suggerimento AI è per natura meno prevedibile e richiederà un ciclo di
 * debug lungo e approfondito prima di potersi fidare della qualità delle
 * risposte in produzione — l'etichetta serve a non caricare aspettative
 * premature sull'utente durante quella fase. Vale per ogni superficie:
 * titolo della notifica, nome del provider in Impostazioni, eventuale
 * badge sul suggerimento stesso.
 */

import { KBActionType, KBConfidence } from '../knowledgeBase';

/**
 * Un tentativo già effettuato per questa combinazione gioco+errore, incluso
 * nel contesto delle chiamate successive — cosi il provider sa già cosa è
 * stato provato e ha fallito, invece di riproporre alla cieca la stessa
 * ipotesi (o una equivalente) al secondo/terzo tentativo.
 */
export interface PastAttempt {
  suggestion: AISuggestion;
  /** true se l'utente ha confermato che NON ha funzionato (via KO nella notifica). */
  failed: true;
}

/**
 * Contesto passato al provider per formulare un suggerimento. Il testo
 * dell'errore è già quello che oggi arriva a knowledgeBase.lookup(), quindi
 * nessuna nuova sanificazione da inventare qui: qualunque pulizia del log
 * (rimozione path assoluti/username) va fatta PRIMA di costruire questo
 * oggetto, a monte, non responsabilità del singolo provider.
 */
export interface ErrorContext {
  /** Log/stderr (già sanificato a monte) su cui il provider deve ragionare. */
  errorText: string;
  gameTitle?: string;
  store?: string;
  runner?: string;
  /**
   * Tentativi precedenti già falliti per questa combinazione gioco+errore
   * (vedi AttemptTracker sotto) — vuoto al primo tentativo.
   */
  pastAttempts: PastAttempt[];
  /**
   * Risposta dell'utente a una precedente richiesta di chiarimento
   * ('clarify'), se questo tentativo è la prosecuzione di una cascata di
   * domande invece di un tentativo ex-novo. undefined al primo giro.
   */
  clarificationAnswer?: string;
}

/**
 * Suggerimento concreto — stesso identico shape di WritebackParams già
 * usato da knowledgeBase.writebackResolved(): un suggerimento AI
 * confermato dall'utente deve poter confluire nella KB locale senza
 * alcuna conversione, gli stessi campi, nessun adattamento in mezzo.
 */
export interface AISuggestion {
  solution:     string;
  actionType:   KBActionType;
  actionParams: Record<string, string>;
  confidence:   KBConfidence;
}

/**
 * Consumo token di UNA chiamata, cosi come restituito dal provider stesso
 * (mai stimato) — propagato fino al contatore budget nelle notifiche.
 */
export interface TokenUsage {
  inputTokens:  number;
  outputTokens: number;
}

/**
 * Esito di una chiamata ad askForFix. Tre rami, non uno:
 *   - 'suggestion' — il provider propone una soluzione concreta
 *   - 'clarify'    — il provider ha bisogno di più informazioni prima di
 *                    poter rispondere; la notifica mostrerà la domanda con
 *                    le opzioni come scelte cliccabili, la risposta
 *                    dell'utente diventa clarificationAnswer nel
 *                    ErrorContext della chiamata successiva
 *   - 'give_up'    — il provider stesso conclude di non avere una
 *                    risposta affidabile (esito legittimo, non un errore)
 */
export type AIResponse =
  | { kind: 'suggestion'; suggestion: AISuggestion; usage: TokenUsage }
  | { kind: 'clarify';    question: string; options: string[]; usage: TokenUsage }
  | { kind: 'give_up';    reason: string; usage: TokenUsage };

export abstract class AIProviderPlugin {
  /** Identificativo stabile, es. 'gemini' | 'ollama' | 'chatgpt' | 'deepseek' | 'claude'. */
  abstract readonly id: string;
  /** Nome visualizzato in Impostazioni → AI Providers. */
  abstract readonly name: string;
  /**
   * true per i provider cloud a pagamento fin dal primo utilizzo
   * (ChatGPT, Claude) — nessun tetto gratuito reale, richiedono una
   * ricarica prepagata prima di poter chiamare l'API. false per i
   * provider che offrono un vero utilizzo gratuito (Gemini — tier free
   * con limiti di frequenza; DeepSeek — 5M token omaggio alla
   * registrazione) o non richiedono account a pagamento (Ollama —
   * locale). Usato per dare priorità di sviluppo/attivazione a questi
   * ultimi, come deciso in fase di progettazione.
   */
  abstract readonly requiresPaidAccount: boolean;
  /** true se il provider richiede comunque una API key (anche se gratuita) — false solo per Ollama. */
  abstract readonly requiresApiKey: boolean;

  /**
   * Abilitato dall'utente — persistito, ma di default SEMPRE false: nessun
   * provider viene mai contattato senza un'attivazione esplicita, coerente
   * con "consenso per-provider, non globale" deciso in fase di progettazione.
   */
  enabled: boolean = false;

  /**
   * true se il provider ha tutto il necessario per essere invocato (API key
   * presente per i cloud provider, endpoint raggiungibile/configurato per
   * Ollama). Non implica `enabled`.
   */
  abstract isConfigured(): boolean;

  /**
   * Chiede al provider una risposta per l'errore descritto in `context`.
   *
   * CONTRATTO IMPORTANTE, non negoziabile per chi implementa questo metodo:
   * non deve MAI lanciare un'eccezione verso il chiamante. Qualunque
   * fallimento (rete, timeout, risposta malformata, JSON non parsabile,
   * rate limit, account non valido) va intercettato internamente e
   * risolto con `{ kind: 'give_up', reason: '...', usage: {inputTokens:0,outputTokens:0} }`
   * — esattamente la lezione del crash del daemon di questa sessione
   * (v0.99.38: una scrittura SQLite non protetta ha fatto cadere l'intero
   * processo). Un chatbot è per natura meno prevedibile di una query SQL:
   * la disciplina difensiva vale doppio qui.
   */
  abstract askForFix(context: ErrorContext): Promise<AIResponse>;
}

/**
 * AttemptTracker — limite di 3 tentativi per combinazione gioco+errore,
 * con storico dei tentativi falliti. Persistenza lasciata al chiamante
 * (server.ts/notificationEngine.ts, Step successivo) tramite una tabella
 * dedicata — questa classe incapsula solo la logica, non lo storage, cosi
 * resta testabile senza un DB reale.
 *
 * NOTA: l'implementazione di storage reale (tabella `ai_debug_attempts`,
 * chiave game_id+error_signature, reset su modifica manuale del compat
 * profile) arriva nello step che collega questo modulo a
 * notificationEngine.ts — qui solo il contratto, coerente con lo scope di
 * "Step 1" concordato.
 */
export interface AttemptRecord {
  gameId:         string;
  errorSignature: string;   // hash del testo errore normalizzato
  attempts:       PastAttempt[];
  givenUp:        boolean;
  lastAttemptAt:  string;
}

export const MAX_AI_ATTEMPTS = 3;

/**
 * Helper condiviso per il parsing difensivo della risposta testuale di un
 * provider in un AIResponse — ogni adapter concreto lo userà per evitare
 * di reimplementare la stessa difensività in ognuno dei quattro/cinque
 * adapter previsti. Non lancia mai — coerente col contratto di askForFix.
 * `usage` viene passato dal chiamante (letto dalla risposta HTTP grezza
 * del provider, che varia per shape da adapter ad adapter) e semplicemente
 * incorporato nel risultato.
 */
export function parseAIResponse(raw: string, usage: TokenUsage): AIResponse {
  const giveUp = (reason: string): AIResponse => ({ kind: 'give_up', reason, usage });

  if (!raw) return giveUp('Risposta vuota dal provider.');
  try {
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
      return giveUp('Nessun JSON riconoscibile nella risposta.');
    }
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));

    const kind = parsed.kind;

    if (kind === 'clarify') {
      const question = typeof parsed.question === 'string' ? parsed.question : null;
      const options = Array.isArray(parsed.options) ? parsed.options.filter((o: unknown) => typeof o === 'string') : [];
      if (!question || options.length === 0) return giveUp('Richiesta di chiarimento malformata.');
      return { kind: 'clarify', question, options, usage };
    }

    if (kind === 'give_up') {
      const reason = typeof parsed.reason === 'string' ? parsed.reason : 'Il provider non ha trovato una soluzione affidabile.';
      return { kind: 'give_up', reason, usage };
    }

    // Default/'suggestion': stesso parsing difensivo della versione precedente.
    const solution = typeof parsed.solution === 'string' ? parsed.solution : null;
    if (!solution) return giveUp('Suggerimento malformato (manca solution).');

    const validActionTypes: KBActionType[] = ['winetricks', 'config_patch', 'relaunch', 'open_section', 'none'];
    const actionType: KBActionType = validActionTypes.includes(parsed.actionType) ? parsed.actionType : 'none';

    const validConfidences: KBConfidence[] = ['high', 'medium', 'low'];
    const confidence: KBConfidence = validConfidences.includes(parsed.confidence) ? parsed.confidence : 'low';

    const actionParams = (parsed.actionParams && typeof parsed.actionParams === 'object') ? parsed.actionParams : {};

    return { kind: 'suggestion', suggestion: { solution, actionType, actionParams, confidence }, usage };
  } catch {
    // Risposta non-JSON o malformata — esito legittimo (il modello può aver
    // risposto in prosa nonostante le istruzioni), mai un errore da propagare.
    return giveUp('Risposta non in formato JSON valido.');
  }
}

/**
 * Prompt di sistema condiviso — stessa istruzione di formato per tutti i
 * provider. I singoli adapter lo antepongono al proprio messaggio con il
 * contesto (ErrorContext), incluso lo storico dei tentativi falliti se
 * presente.
 */
export const AI_SYSTEM_PROMPT = `Sei un assistente che aiuta a diagnosticare problemi di compatibilità Wine/Proton per giochi Windows lanciati su Linux tramite X-Launcher, un launcher HTPC.

Rispondi SOLO con un oggetto JSON valido, nessun testo prima o dopo, in UNO di questi tre formati:

1. Se hai una soluzione concreta da proporre:
{
  "kind": "suggestion",
  "solution": "spiegazione breve e concreta del problema e della soluzione, in italiano",
  "actionType": "winetricks" | "config_patch" | "relaunch" | "open_section" | "none",
  "actionParams": { "chiave": "valore" },
  "confidence": "high" | "medium" | "low"
}

2. Se ti manca un'informazione essenziale per rispondere (es. non è chiaro se il problema è video, audio, o di input):
{
  "kind": "clarify",
  "question": "domanda breve e specifica, in italiano",
  "options": ["opzione 1", "opzione 2", "opzione 3"]
}

3. Se non hai una risposta affidabile da dare, anche dopo aver visto i tentativi precedenti falliti:
{
  "kind": "give_up",
  "reason": "spiegazione breve del perché non sei sicuro, in italiano"
}

Regole:
- Usa "winetricks" se la soluzione è installare uno o più verb (actionParams: {"verbs": "verb1,verb2"}).
- Usa "config_patch" se la soluzione è modificare una configurazione del gioco.
- Se ti vengono forniti tentativi precedenti già falliti, NON riproporre la stessa soluzione o una equivalente — se non hai altre idee valide, usa "give_up" invece di ripetere.
- Se non sei ragionevolmente sicuro della causa, usa confidence "low" invece di inventare una soluzione plausibile ma non verificata, oppure usa "give_up" se la low confidence rende il suggerimento inutile.
- PRIORITÀ CRITICA: se il log contiene un errore esplicito relativo al file eseguibile o al suo percorso (es. "failed to open", "No such file", "cannot find the file specified", un percorso che termina con un'estensione insolita come .bak invece di .exe), quella è quasi sempre la causa REALE del mancato avvio — dagli priorità assoluta rispetto a warning generici di driver grafici (libEGL, libGL, dri2, Mesa), che sono spesso rumore innocuo presente anche nei lanci riusciti e NON la causa del fallimento a meno che non siano l'unico segnale d'errore presente nel log.`;

