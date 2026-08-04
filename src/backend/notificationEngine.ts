/**
 * notificationEngine.ts — Step 15b
 *
 * Backend core del sistema di notifiche.
 * Componenti:
 *   - EventBus       pub/sub interno al daemon
 *   - NotificationQueue  coda con priorità, dedup e TTL
 *   - NotificationStore  persistenza SQLite
 *   - LogBridge      promuove log error/warning/auth a notifiche visibili
 *
 * Dipendenze zero verso server.ts — il daemon importa questo modulo e chiama
 * notificationEngine.emit(event, payload) nei punti chiave.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';
import { DATA_DIR } from './paths';

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'info' | 'success' | 'warning' | 'error'
  | 'ai-suggestion' | 'kb-suggestion';

export type NotificationStatus =
  | 'pending' | 'applied' | 'resolved' | 'failed' | 'dismissed';

export interface NotificationAction {
  label:   string;
  handler: string;
  params?: Record<string, string>;
}

export interface StoredNotification {
  id:             string;
  type:           NotificationType;
  status:         NotificationStatus;
  title:          string;
  body:           string;
  game_id?:       string;
  game_title?:    string;
  raw_log?:       string;
  primary_action?:   string;  // JSON serializzato
  secondary_action?: string;  // JSON serializzato
  // Step 19d — terzo slot, introdotto per il flusso di installazione
  // manuale di Ubisoft Connect (Continua/Annulla/Sfoglia insieme non
  // entravano nei soli 2 slot esistenti). Generico, riusabile da
  // qualunque notifica futura ne avesse bisogno.
  tertiary_action?:  string;  // JSON serializzato
  // Link cliccabile/selezionabile da controller, distinto dai pulsanti
  // azione sopra — es. la pagina ufficiale di download di un launcher
  // terzo. Renderizzato come elemento a sé nella card, non dentro `body`
  // (evita di dover fare parsing di link dentro testo libero).
  link_url?:      string;
  link_label?:    string;
  source:         string;
  ai_provider?:   string;
  confidence?:    string;
  created_at:     string;
}

/** Evento emesso internamente dal daemon */
export type EngineEvent =
  | { type: 'download-completed'; gameId: string; gameTitle: string }
  | { type: 'download-error';     gameId: string; gameTitle: string; error: string }
  | { type: 'known-fixes-result'; gameId: string; gameTitle: string; found: boolean; verbs?: string[] }
  | { type: 'launch-error';       gameId: string; gameTitle: string; error: string }
  | { type: 'launch-blocked';     gameId: string; gameTitle: string; reason: string }
  | { type: 'auth-error';         store: string; message?: string }
  | { type: 'auth-ok';            store: string }
  | { type: 'runner-installed';   runnerId: string }
  | { type: 'runner-uninstalled'; runnerId: string }
  | { type: 'runner-error';       runnerId: string; error: string }
  | { type: 'validation-prompt';  gameId: string; gameTitle: string }
  | { type: 'system';             message: string; level: 'info' | 'warning' | 'error' };

// ---------------------------------------------------------------------------
// NotificationStore — SQLite
// ---------------------------------------------------------------------------

class NotificationStore {
  private db: InstanceType<typeof Database>;

  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
    this.db = new Database(path.join(DATA_DIR, 'x-launcher.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id              TEXT PRIMARY KEY,
        type            TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',
        title           TEXT NOT NULL,
        body            TEXT NOT NULL,
        game_id         TEXT,
        game_title      TEXT,
        raw_log         TEXT,
        primary_action  TEXT,
        secondary_action TEXT,
        source          TEXT NOT NULL DEFAULT 'system',
        ai_provider     TEXT,
        confidence      TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    // Step 19d — migrazione sicura per DB già esistenti: la tabella sopra
    // potrebbe già esistere senza queste 3 colonne. Stesso pattern
    // "verifica prima di alterare" già in uso in db.ts, adattato qui dove
    // non c'è un array existingCols precalcolato.
    const existingCols = (this.db.prepare(`PRAGMA table_info(notifications)`).all() as any[]).map(c => c.name);
    if (!existingCols.includes('tertiary_action')) {
      this.db.exec(`ALTER TABLE notifications ADD COLUMN tertiary_action TEXT`);
    }
    if (!existingCols.includes('link_url')) {
      this.db.exec(`ALTER TABLE notifications ADD COLUMN link_url TEXT`);
    }
    if (!existingCols.includes('link_label')) {
      this.db.exec(`ALTER TABLE notifications ADD COLUMN link_label TEXT`);
    }
  }

  insert(n: StoredNotification): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO notifications
        (id, type, status, title, body, game_id, game_title, raw_log,
         primary_action, secondary_action, tertiary_action, link_url, link_label,
         source, ai_provider, confidence, created_at)
      VALUES
        (@id, @type, @status, @title, @body, @game_id, @game_title, @raw_log,
         @primary_action, @secondary_action, @tertiary_action, @link_url, @link_label,
         @source, @ai_provider, @confidence, @created_at)
    `).run(n);
  }

  updateStatus(id: string, status: NotificationStatus): void {
    this.db.prepare(`UPDATE notifications SET status = ? WHERE id = ?`).run(status, id);
  }

  getRecent(limit = 100): StoredNotification[] {
    return this.db.prepare(
      `SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as StoredNotification[];
  }

  getPending(): StoredNotification[] {
    return this.db.prepare(
      `SELECT * FROM notifications WHERE status IN ('pending','applied') ORDER BY created_at DESC`
    ).all() as StoredNotification[];
  }
}

// ---------------------------------------------------------------------------
// NotificationQueue — dedup in memoria
// ---------------------------------------------------------------------------

class NotificationQueue {
  /** Ultime notifiche in memoria per la dedup per fingerprint */
  private recentFingerprints = new Map<string, number>();
  private readonly DEDUP_WINDOW_MS = 30_000; // 30s

  /** Ritorna true se la notifica è un duplicato recente */
  isDuplicate(fingerprint: string): boolean {
    const lastSeen = this.recentFingerprints.get(fingerprint);
    if (lastSeen && Date.now() - lastSeen < this.DEDUP_WINDOW_MS) return true;
    this.recentFingerprints.set(fingerprint, Date.now());
    // Pulizia periodica
    if (this.recentFingerprints.size > 200) {
      const cutoff = Date.now() - this.DEDUP_WINDOW_MS;
      for (const [k, v] of this.recentFingerprints) {
        if (v < cutoff) this.recentFingerprints.delete(k);
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// EventBus + LogBridge + NotificationEngine principale
// ---------------------------------------------------------------------------

type SSEBroadcastFn = (event: string, payload: object) => void;
type EventListener = (event: EngineEvent) => void;

class NotificationEngine {
  private store    = new NotificationStore();
  private queue    = new NotificationQueue();
  private listeners: EventListener[] = [];
  private broadcast: SSEBroadcastFn | null = null;

  /** Registra la funzione di broadcast SSE del server */
  setBroadcast(fn: SSEBroadcastFn) {
    this.broadcast = fn;
  }

  /** Aggiunge un listener interno (per estensioni future) */
  on(listener: EventListener) {
    this.listeners.push(listener);
  }

  /** Punto centrale di ingresso eventi dal daemon */
  emit(event: EngineEvent) {
    this.listeners.forEach(l => l(event));
    const notif = this.eventToNotification(event);
    if (!notif) return;
    this.push(notif);

    // v0.99.90 — Step 15d, collegamento finale: se la KB locale non ha
    // trovato nulla per un errore di download/lancio (riconoscibile qui
    // da source==='system' nel branch specifico di questi due eventi,
    // vedi eventToNotification — l'unica alternativa è source==='kb'
    // quando la KB HA trovato un match), prova l'AI advisor in
    // background. emit() resta sincrono — l'utente vede subito la
    // notifica di errore generica già pushata sopra; l'eventuale esito
    // AI arriva come notifica separata quando pronto, dato che la
    // chiamata di rete è per natura asincrona e non deve bloccare il
    // resto del daemon nel frattempo.
    if (
      (event.type === 'download-error' || event.type === 'launch-error') &&
      notif.source === 'system' &&
      event.error
    ) {
      this.tryAIAdvisor(event.gameId, event.gameTitle, event.error).catch(err => {
        // Difesa ulteriore: tryAIAdvisor non dovrebbe mai lanciare (ogni
        // suo passo è già avvolto in try/catch), ma un .catch() qui è
        // gratuito e ci protegge da qualunque svista futura — un
        // fallimento in questo percorso in background non deve mai
        // propagarsi oltre un log.
        console.error('[AI] tryAIAdvisor failed unexpectedly:', err);
      });
    }
  }

  /**
   * v0.99.90 — Step 15d: interroga l'AI advisor (KB locale già esclusa a
   * monte, vedi emit()) e traduce l'esito in una notifica. Le tre
   * etichette "[EXPERIMENTAL]" sui titoli sono un requisito fisso deciso
   * in fase di progettazione, non opzionale — vedi la nota estesa in
   * aiProviders/base.ts sul perché.
   */
  private async tryAIAdvisor(gameId: string, gameTitle: string, errorText: string) {
    const { runAdvisor } = await import('./aiProviders/orchestrator');
    const result = await runAdvisor(gameId, gameTitle, errorText);

    if (!result.response) {
      // Nessun provider AI abilitato/configurato — l'utente non ha
      // attivato questa funzione, non deve vedere alcuna notifica a
      // riguardo. La notifica di errore generica già emessa resta
      // l'unico segnale, esattamente come prima di questo step.
      return;
    }

    const response = result.response;
    const providerLabel = result.providerName ? ` (${result.providerName})` : '';
    const lang = readAppConfig().language;

    // v0.99.90 — Step 15d: contatore budget token, stile "hai usato X di Y
    // token questo mese" discusso in fase di progettazione — mai
    // implementato fino ad ora nonostante il dato (TokenUsage) fosse già
    // disponibile e loggato. Costruito qui, appeso in coda al corpo di
    // ogni notifica AI, invece che in un componente a parte: la notifica
    // è già il punto in cui l'utente vede il costo di questa specifica
    // chiamata, ha senso mostrargli lì anche il totale del mese.
    // v1.1.61 — toLocaleString('it-IT') era fisso indipendentemente dalla
    // lingua (stesso bug già corretto lato frontend in v1.1.43 per lo
    // stesso identico conteggio, qui mai portato).
    const usageLine = (result.usageThisMonth !== undefined && result.monthlyBudget !== undefined)
      ? (lang === 'en'
          ? `\n\n💠 ${result.usageThisMonth.toLocaleString('en-US')} / ${result.monthlyBudget.toLocaleString('en-US')} tokens this month`
          : `\n\n💠 ${result.usageThisMonth.toLocaleString('it-IT')} / ${result.monthlyBudget.toLocaleString('it-IT')} token questo mese`)
      : '';

    if (response.kind === 'suggestion') {
      const s = response.suggestion;
      this.push({
        id: this.mkId(), type: 'ai-suggestion', status: 'pending',
        title: lang === 'en' ? `[EXPERIMENTAL] AI suggestion${providerLabel} — ${gameTitle}` : `[EXPERIMENTAL] Suggerimento AI${providerLabel} — ${gameTitle}`,
        body: s.solution + usageLine,
        game_id: gameId, game_title: gameTitle,
        raw_log: errorText,
        source: 'ai',
        ai_provider: result.providerName,
        confidence: s.confidence,
        created_at: this.now(),
        primary_action: s.actionType !== 'none'
          ? JSON.stringify({ label: this.actionLabel(s.actionType, s.actionParams, lang), handler: s.actionType, params: s.actionParams })
          : undefined,
      });
    } else if (response.kind === 'clarify') {
      // v0.99.90 — versione semplificata di questo step: domanda e
      // opzioni mostrate come testo informativo, non ancora come
      // pulsanti interattivi cliccabili — una vera cascata di scelte
      // multiple richiede un componente frontend nuovo (le notifiche
      // oggi supportano solo un'azione primaria + una secondaria),
      // lasciato come sviluppo successivo (annotato in roadmap).
      // L'obiettivo qui era che l'intera pipeline prompt→risposta a tre
      // esiti→notifica funzionasse end-to-end anche per questo caso, non
      // ancora che fosse pienamente interattiva.
      this.push({
        id: this.mkId(), type: 'info', status: 'pending',
        title: lang === 'en' ? `[EXPERIMENTAL] AI${providerLabel} needs more information — ${gameTitle}` : `[EXPERIMENTAL] L'AI${providerLabel} ha bisogno di più informazioni — ${gameTitle}`,
        body: lang === 'en'
          ? `${response.question}\n\nPossible options: ${response.options.join(' / ')}\n\n(interactive answering not yet available in this version — continue with manual debugging in the meantime)${usageLine}`
          : `${response.question}\n\nOpzioni possibili: ${response.options.join(' / ')}\n\n(risposta interattiva non ancora disponibile in questa versione — prosegui con il debug manuale nel frattempo)${usageLine}`,
        game_id: gameId, game_title: gameTitle,
        raw_log: errorText, source: 'ai', created_at: this.now(),
      });
    } else {
      // give_up — informativo, nessuna azione richiesta all'utente.
      this.push({
        id: this.mkId(), type: 'info', status: 'dismissed',
        title: lang === 'en' ? `[EXPERIMENTAL] AI${providerLabel} found no solution — ${gameTitle}` : `[EXPERIMENTAL] L'AI${providerLabel} non ha trovato una soluzione — ${gameTitle}`,
        body: response.reason + usageLine,
        game_id: gameId, game_title: gameTitle,
        raw_log: errorText, source: 'ai', created_at: this.now(),
      });
    }
  }

  /** LogBridge — chiamato da writeLog/addLog per promuovere certi livelli */
  bridgeLog(level: string, message: string) {
    if (level === 'error') {
      this.emit({ type: 'system', message, level: 'error' });
    } else if (level === 'warning') {
      this.emit({ type: 'system', message, level: 'warning' });
    } else if (level === 'auth') {
      // auth è gestito tramite eventi specifici dal daemon
    }
  }

  /** Aggiorna lo stato di una notifica (confirmed/failed dall'utente) */
  updateStatus(id: string, status: NotificationStatus) {
    this.store.updateStatus(id, status);
    this.broadcast?.('notification-updated', { id, status });
  }

  /** Recupera notifiche recenti per il polling iniziale */
  getRecent(limit = 100) {
    return this.store.getRecent(limit);
  }

  getPending() {
    return this.store.getPending();
  }

  // ── Privato ──────────────────────────────────────────────────────────────

  private push(notif: StoredNotification) {
    const fingerprint = `${notif.type}:${notif.title}:${notif.game_id ?? ''}`;
    if (this.queue.isDuplicate(fingerprint)) return;

    // v0.99.38 — FIX CRASH: better-sqlite3 con parametri nominati
    // (@raw_log, @primary_action, ecc.) richiede che la CHIAVE esista
    // nell'oggetto passato a .run(), anche solo per valorizzarla a null —
    // una chiave del tutto assente fa fallire il bind con "RangeError:
    // Missing named parameter", e se non intercettato può portarsi giù
    // l'intero processo Node (successo davvero: un caso di
    // eventToNotification senza tutti i campi ha crashato il daemon a
    // metà sessione). Verificato che 8 blocchi su 15 in eventToNotification
    // avevano questo problema — invece di correggerli uno per uno (facile
    // dimenticarsene in un blocco futuro), normalizziamo qui, nell'unico
    // punto per cui passa ogni notifica prima di arrivare a SQLite.
    // Campi esplicitamente impostati da eventToNotification vincono
    // comunque sui default null, grazie all'ordine dello spread.
    const complete: StoredNotification = {
      game_id: null as any, game_title: null as any, raw_log: null as any,
      primary_action: null as any, secondary_action: null as any,
      tertiary_action: null as any, link_url: null as any, link_label: null as any,
      ai_provider: null as any, confidence: null as any,
      ...notif,
    };

    try {
      this.store.insert(complete);
    } catch (err) {
      // Difesa aggiuntiva: qualunque altro motivo di fallimento
      // dell'insert (DB locked, disco pieno, ecc.) non deve MAI poter
      // crashare il daemon solo perché una notifica non è stata scritta.
      // console.error invece di writeLog (logger.ts) per non introdurre
      // un nuovo accoppiamento tra moduli solo per un percorso di
      // fallback così raro.
      console.error(`[NOTIFY] Failed to write notification:`, err);
      return;
    }
    this.broadcast?.('notification', complete);
  }

  private mkId() {
    return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  private now() {
    return new Date().toISOString();
  }

  // Step 19b (v1.1.61) — audit del contenuto delle notifiche: titoli e
  // corpi qui sotto erano tutti letterali in italiano, indipendentemente
  // dalla lingua UI configurata (a differenza del testo del pannello
  // Notifiche stesso, già bilingue dal v1.1.52 — questo è il contenuto
  // delle singole notifiche, generato qui). notificationEngine.ts gira
  // lato backend, senza accesso a i18next/ai file di traduzione del
  // frontend: stesso approccio già usato per buildSystemPrompt in
  // aiProviders/base.ts, un helper minimo invece di un sistema i18n
  // completo per ~20 stringhe in un solo file.
  private actionLabel(actionType: string, params: Record<string, string>, lang: 'it' | 'en'): string {
    switch (actionType) {
      case 'winetricks':    return lang === 'en' ? `Install ${params.verbs ?? 'dependencies'}` : `Installa ${params.verbs ?? 'dipendenze'}`;
      case 'config_patch':  return lang === 'en' ? 'Apply configuration' : 'Applica configurazione';
      case 'relaunch':      return lang === 'en' ? 'Relaunch game' : 'Riavvia gioco';
      case 'open_section':  return params.section === 'accounts' ? (lang === 'en' ? 'Go to Accounts' : 'Vai agli Account')
                                  : params.section === 'plugins'  ? (lang === 'en' ? 'Go to Plugins' : 'Vai ai Plugin')
                                  : (lang === 'en' ? 'Open settings' : 'Apri impostazioni');
      default:              return lang === 'en' ? 'Apply' : 'Applica';
    }
  }

  private eventToNotification(event: EngineEvent): StoredNotification | null {
    const lang = readAppConfig().language;
    switch (event.type) {

      case 'download-completed':
        return {
          id: this.mkId(), type: 'success', status: 'pending',
          title: lang === 'en' ? `${event.gameTitle} installed` : `${event.gameTitle} installato`,
          body: lang === 'en' ? 'Installation complete. The game is ready to launch.' : 'Installazione completata. Il gioco è pronto per essere avviato.',
          game_id: event.gameId, game_title: event.gameTitle,
          source: 'system', created_at: this.now(),
        };

      case 'known-fixes-result':
        return event.found
          ? {
              id: this.mkId(), type: 'info', status: 'pending',
              title: lang === 'en' ? `Known fix found (Heroic) — ${event.gameTitle}` : `Known fix trovato (Heroic) — ${event.gameTitle}`,
              body: lang === 'en'
                ? `Dependencies applied and saved as the default configuration: ${(event.verbs ?? []).join(', ')}`
                : `Dipendenze applicate e salvate come configurazione predefinita: ${(event.verbs ?? []).join(', ')}`,
              game_id: event.gameId, game_title: event.gameTitle,
              source: 'system', created_at: this.now(),
            }
          : {
              id: this.mkId(), type: 'info', status: 'pending',
              title: lang === 'en' ? `No known fix (Heroic) — ${event.gameTitle}` : `Nessun known fix (Heroic) — ${event.gameTitle}`,
              body: lang === 'en' ? 'Installing with the default configured verbs.' : 'Installazione con i verb configurati di default.',
              game_id: event.gameId, game_title: event.gameTitle,
              source: 'system', created_at: this.now(),
            };

      case 'download-error': {
        const kbMatchDl = event.error ? knowledgeBase.lookup(event.error) : null;
        if (kbMatchDl) {
          const entry = kbMatchDl.entry;
          const actionParams = (() => { try { return JSON.parse(entry.action_params); } catch { return {}; } })();
          return {
            id: this.mkId(), type: 'kb-suggestion', status: 'pending',
            title: lang === 'en' ? `Known solution — ${event.gameTitle}` : `Soluzione nota — ${event.gameTitle}`,
            body: localizedSolution(entry, lang),
            game_id: event.gameId, game_title: event.gameTitle,
            raw_log: event.error,
            source: 'kb',
            created_at: this.now(),
            primary_action: entry.action_type !== 'none'
              ? JSON.stringify({ label: this.actionLabel(entry.action_type, actionParams, lang), handler: entry.action_type, params: actionParams })
              : undefined,
          };
        }
        return {
          id: this.mkId(), type: 'error', status: 'pending',
          title: lang === 'en' ? `Installation error — ${event.gameTitle}` : `Errore installazione — ${event.gameTitle}`,
          body: event.error || (lang === 'en' ? 'An error occurred during download or installation.' : "Errore durante il download o l'installazione."),
          game_id: event.gameId, game_title: event.gameTitle,
          raw_log: event.error, source: 'system', created_at: this.now(),
        };
      }

      case 'launch-error': {
        // Consulta KB prima di emettere errore generico
        const kbMatch = event.error ? knowledgeBase.lookup(event.error) : null;
        if (kbMatch) {
          const entry = kbMatch.entry;
          const actionParams = (() => { try { return JSON.parse(entry.action_params); } catch { return {}; } })();
          return {
            id: this.mkId(), type: 'kb-suggestion', status: 'pending',
            title: lang === 'en' ? `Known solution — ${event.gameTitle}` : `Soluzione nota — ${event.gameTitle}`,
            body: localizedSolution(entry, lang),
            game_id: event.gameId, game_title: event.gameTitle,
            raw_log: event.error,
            source: 'kb',
            created_at: this.now(),
            primary_action: entry.action_type !== 'none'
              ? JSON.stringify({ label: this.actionLabel(entry.action_type, actionParams, lang), handler: entry.action_type, params: actionParams })
              : undefined,
          };
        }
        return {
          id: this.mkId(), type: 'error', status: 'pending',
          title: lang === 'en' ? `Launch failed — ${event.gameTitle}` : `Avvio fallito — ${event.gameTitle}`,
          body: event.error || (lang === 'en' ? "The game didn't start correctly." : 'Il gioco non si è avviato correttamente.'),
          game_id: event.gameId, game_title: event.gameTitle,
          raw_log: event.error, source: 'system', created_at: this.now(),
        };
      }

      case 'launch-blocked':
        return {
          id: this.mkId(), type: 'warning', status: 'pending',
          title: lang === 'en' ? `Launch blocked — ${event.gameTitle}` : `Avvio bloccato — ${event.gameTitle}`,
          body: event.reason,
          game_id: event.gameId, game_title: event.gameTitle,
          source: 'system', created_at: this.now(),
          primary_action: JSON.stringify({ label: lang === 'en' ? 'Plugin Settings' : 'Impostazioni Plugin', handler: 'open_section', params: { section: 'plugins' } }),
        };

      case 'auth-error':
        return {
          id: this.mkId(), type: 'warning', status: 'pending',
          title: lang === 'en' ? `Session expired — ${event.store}` : `Sessione scaduta — ${event.store}`,
          body: event.message || (lang === 'en' ? 'The session has expired. Sign in again from the account settings.' : 'La sessione è scaduta. Accedi di nuovo dalle impostazioni account.'),
          source: 'system', created_at: this.now(),
          primary_action: JSON.stringify({ label: lang === 'en' ? 'Go to Accounts' : 'Vai agli Account', handler: 'open_section', params: { section: 'accounts' } }),
          game_id: null as any, game_title: null as any, raw_log: null as any,
          secondary_action: null as any, ai_provider: null as any, confidence: null as any,
        };

      case 'auth-ok':
        return {
          id: this.mkId(), type: 'success', status: 'pending',
          title: lang === 'en' ? `${event.store} — authentication complete` : `${event.store} — autenticazione completata`,
          body: lang === 'en' ? 'Session active. The library will be synced.' : 'Sessione attiva. La libreria verrà sincronizzata.',
          source: 'system', created_at: this.now(),
          game_id: null as any, game_title: null as any, raw_log: null as any,
          primary_action: null as any, secondary_action: null as any,
          ai_provider: null as any, confidence: null as any,
        };

      case 'runner-installed':
        return {
          id: this.mkId(), type: 'success', status: 'pending',
          title: lang === 'en' ? `Runner installed — ${event.runnerId}` : `Runner installato — ${event.runnerId}`,
          body: lang === 'en' ? 'The runner is available for use in compatibility profiles.' : 'Il runner è disponibile per l\'uso nei profili di compatibilità.',
          source: 'system', created_at: this.now(),
          game_id: null as any, game_title: null as any, raw_log: null as any,
          primary_action: null as any, secondary_action: null as any,
          ai_provider: null as any, confidence: null as any,
        };

      case 'runner-uninstalled':
        return {
          id: this.mkId(), type: 'success', status: 'pending',
          title: lang === 'en' ? `Runner uninstalled — ${event.runnerId}` : `Runner disinstallato — ${event.runnerId}`,
          body: lang === 'en' ? 'The runner has been removed. No longer available in compatibility profiles.' : 'Il runner è stato rimosso. Non più disponibile nei profili di compatibilità.',
          source: 'system', created_at: this.now(),
          game_id: null as any, game_title: null as any, raw_log: null as any,
          primary_action: null as any, secondary_action: null as any,
          ai_provider: null as any, confidence: null as any,
        };

      case 'runner-error':
        return {
          id: this.mkId(), type: 'error', status: 'pending',
          title: lang === 'en' ? `Runner installation error — ${event.runnerId}` : `Errore installazione runner — ${event.runnerId}`,
          body: event.error,
          raw_log: event.error, source: 'system', created_at: this.now(),
          game_id: null as any, game_title: null as any,
          primary_action: null as any, secondary_action: null as any,
          ai_provider: null as any, confidence: null as any,
        };

      case 'validation-prompt':
        // v0.99.38 — test protocol: chiude il cerchio del sistema di
        // verifica per-gioco (badge 'verified'/'verification_method').
        // status 'applied' fin da subito, non 'pending': riusa
        // esattamente lo stesso blocco UI "✅ Ha funzionato / ❌ Non ha
        // funzionato" già costruito per il feedback sui suggerimenti KB
        // (vedi src/App.tsx, isDone/notif.status==='applied') — qui non
        // c'è un "fix da applicare" prima, la domanda è diretta, quindi
        // saltiamo lo stato 'pending' con la sua action singola e andiamo
        // dritti alle due scelte. source: 'validation' (non 'kb'/'ai')
        // cosi resolveNotification non attiva per errore il writeback
        // della knowledge base per questo tipo di notifica.
        return {
          id: this.mkId(), type: 'info', status: 'applied',
          title: lang === 'en' ? `${event.gameTitle} — did it work?` : `${event.gameTitle} — ha funzionato?`,
          body: lang === 'en'
            ? "The game just closed. If it worked correctly, confirm to mark it as verified with the current configuration (runner, verbs, launch arguments). If it didn't work, it'll stay unverified and the question will reappear the next time it closes."
            : 'Il gioco si è appena chiuso. Se ha funzionato correttamente, conferma per marcarlo come verificato con la configurazione attuale (runner, verb, argomenti di lancio). Se non ha funzionato, resterà da testare e la domanda ricomparirà alla prossima chiusura.',
          game_id: event.gameId, game_title: event.gameTitle,
          source: 'validation', created_at: this.now(),
          // v0.99.38 — FIX CRASH: better-sqlite3 con parametri nominati
          // (@raw_log, @primary_action, ecc.) richiede che la CHIAVE esista
          // nell'oggetto passato a .run(), anche solo per valorizzarla a
          // null — un campo del tutto assente (non undefined: assente)
          // fa fallire il bind con "RangeError: Missing named parameter",
          // che qui accadeva dentro un setInterval non protetto da
          // try/catch a monte, portando giù l'intero processo Node. Altri
          // case di questo stesso switch (runner-installed, auth-ok, ecc.)
          // già seguono questo pattern — qui mancava.
          raw_log: null as any, primary_action: null as any, secondary_action: null as any,
          ai_provider: null as any, confidence: null as any,
        };

      case 'system':
        if (event.level === 'info') return null; // i log info non diventano notifiche
        return {
          id: this.mkId(),
          type: event.level === 'error' ? 'error' : 'warning',
          status: 'pending',
          title: lang === 'en'
            ? (event.level === 'error' ? 'System error' : 'System warning')
            : (event.level === 'error' ? 'Errore di sistema' : 'Avviso di sistema'),
          body: event.message,
          raw_log: event.message,
          source: 'system', created_at: this.now(),
        };

      default:
        return null;
    }
  }
}

// Import KB (lazy per evitare circular deps al boot)
import { knowledgeBase, localizedSolution } from './knowledgeBase';
import { readAppConfig } from './appConfig';

// Singleton esportato
export const notificationEngine = new NotificationEngine();
