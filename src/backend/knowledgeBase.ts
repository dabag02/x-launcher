/**
 * knowledgeBase.ts — Step 15c
 *
 * Dizionario locale di soluzioni a errori noti.
 * Viene consultato PRIMA di interrogare un provider AI:
 *   - match ≥ soglia  → kb-suggestion (offline, <1ms)
 *   - nessun match    → passa al livello AI (Step 15d)
 *
 * Componenti:
 *   KnowledgeStore  — persistenza SQLite (tabella knowledge_base)
 *   KBMatcher       — fuzzy match con ranking e soglia configurabile
 *   AIWriteback     — scrive le soluzioni AI confermate nella KB
 *   KnowledgeBase   — singleton esportato
 */

import Database from 'better-sqlite3';
import path from 'path';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { DATA_DIR } from './paths';

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------

export type KBActionType =
  | 'winetricks'
  | 'config_patch'
  | 'relaunch'
  | 'open_section'
  | 'none';

export type KBSource = 'seed' | 'ai-writeback' | 'manual';
export type KBConfidence = 'high' | 'medium' | 'low';

export interface KnowledgeEntry {
  id:           string;
  pattern:      string;                      // regex o stringa da cercare nel log
  solution:     string;                      // testo in linguaggio naturale (italiano)
  // Step 19b (v1.1.58) — traduzione inglese, null per le voci che non ce
  // l'hanno ancora (tipicamente ai-writeback: un suggerimento AI arriva
  // in una sola lingua, quella impostata al momento della chiamata — non
  // esiste una "seconda lingua" da salvare per quel tipo di voce).
  solution_en:  string | null;
  action_type:  KBActionType;
  action_params: string;                     // JSON serializzato
  source:       KBSource;
  confidence:   KBConfidence;
  hit_count:    number;
  score:        number;                      // 0.0 – 1.0, aggiornato da feedback
  last_seen:    string | null;
  created_at:   string;
}

export interface KBMatch {
  entry:      KnowledgeEntry;
  matchScore: number;                        // 0.0 – 1.0
}

// Step 19b (v1.1.58) — un solo punto che decide quale campo mostrare,
// invece di ripetere lo stesso if/fallback nei due punti di
// notificationEngine.ts che consultano la KB: se la lingua corrente è
// 'en' e la voce ha una traduzione, usa quella; altrimenti il testo
// italiano originale (mai una stringa vuota — ogni voce di seed ha
// sempre "solution", solo "solution_en" può mancare).
export function localizedSolution(entry: KnowledgeEntry, language: 'it' | 'en'): string {
  return (language === 'en' && entry.solution_en) ? entry.solution_en : entry.solution;
}

// ---------------------------------------------------------------------------
// KnowledgeStore — SQLite
// ---------------------------------------------------------------------------

class KnowledgeStore {
  private db: InstanceType<typeof Database>;

  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
    this.db = new Database(path.join(DATA_DIR, 'x-launcher.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id            TEXT PRIMARY KEY,
        pattern       TEXT NOT NULL,
        solution      TEXT NOT NULL,
        action_type   TEXT NOT NULL DEFAULT 'none',
        action_params TEXT NOT NULL DEFAULT '{}',
        source        TEXT NOT NULL DEFAULT 'seed',
        confidence    TEXT NOT NULL DEFAULT 'medium',
        hit_count     INTEGER NOT NULL DEFAULT 0,
        score         REAL    NOT NULL DEFAULT 0.5,
        last_seen     TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    // Step 19b (v1.1.58) — KB bilingue, richiesta esplicita dell'utente:
    // "solution" resta il testo italiano originale (compatibilità con le
    // voci già scritte da ai-writeback, che hanno solo quello), la
    // traduzione inglese vive in una colonna separata nullable — non
    // sostituisce mai il dato esistente, un DB già popolato continua a
    // funzionare senza reimportare nulla. Stesso pattern di migrazione già
    // in uso altrove (vedi db.ts, PRAGMA table_info + ALTER TABLE ADD
    // COLUMN se manca).
    const kbCols = (this.db.prepare("PRAGMA table_info(knowledge_base)").all() as any[]).map(r => r.name);
    if (!kbCols.includes('solution_en')) {
      this.db.exec("ALTER TABLE knowledge_base ADD COLUMN solution_en TEXT");
    }
  }

  upsert(entry: KnowledgeEntry): void {
    this.db.prepare(`
      INSERT INTO knowledge_base
        (id, pattern, solution, solution_en, action_type, action_params, source, confidence,
         hit_count, score, last_seen, created_at)
      VALUES
        (@id, @pattern, @solution, @solution_en, @action_type, @action_params, @source, @confidence,
         @hit_count, @score, @last_seen, @created_at)
      ON CONFLICT(id) DO UPDATE SET
        solution     = excluded.solution,
        solution_en  = excluded.solution_en,
        action_type  = excluded.action_type,
        action_params= excluded.action_params,
        confidence   = excluded.confidence,
        score        = excluded.score,
        last_seen    = excluded.last_seen
    `).run({ ...entry, solution_en: entry.solution_en ?? null });
  }

  getAll(): KnowledgeEntry[] {
    return this.db.prepare(`SELECT * FROM knowledge_base ORDER BY score DESC, hit_count DESC`).all() as KnowledgeEntry[];
  }

  getById(id: string): KnowledgeEntry | null {
    return (this.db.prepare(`SELECT * FROM knowledge_base WHERE id = ?`).get(id) as KnowledgeEntry) ?? null;
  }

  updateHitCount(id: string): void {
    this.db.prepare(`
      UPDATE knowledge_base SET hit_count = hit_count + 1, last_seen = datetime('now') WHERE id = ?
    `).run(id);
  }

  updateScore(id: string, delta: number): void {
    // Score clampato tra 0.05 e 1.0
    this.db.prepare(`
      UPDATE knowledge_base
      SET score = MAX(0.05, MIN(1.0, score + ?))
      WHERE id = ?
    `).run(delta, id);
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM knowledge_base WHERE id = ?`).run(id);
  }

  count(): number {
    return (this.db.prepare(`SELECT COUNT(*) as n FROM knowledge_base`).get() as any).n;
  }

  countBySource(): Record<KBSource, number> {
    const rows = this.db.prepare(
      `SELECT source, COUNT(*) as n FROM knowledge_base GROUP BY source`
    ).all() as Array<{ source: string; n: number }>;
    const result: Record<string, number> = { seed: 0, 'ai-writeback': 0, manual: 0 };
    rows.forEach(r => { result[r.source] = r.n; });
    return result as Record<KBSource, number>;
  }
}

// ---------------------------------------------------------------------------
// KBMatcher — fuzzy match con soglia configurabile
// ---------------------------------------------------------------------------

class KBMatcher {
  /** Soglia minima di confidenza (0.0 – 1.0). Configurabile da Settings. */
  threshold = 0.60;

  /**
   * Cerca la soluzione migliore per il testo di errore fornito.
   * Algoritmo:
   *   1. Cerca corrispondenza regex/stringa esatta (score 1.0)
   *   2. Calcola similarità per sottostringa parziale
   *   3. Ritorna la voce con score > threshold o null
   */
  match(errorText: string, entries: KnowledgeEntry[]): KBMatch | null {
    if (!errorText || entries.length === 0) return null;

    const errorLower = errorText.toLowerCase();
    let best: KBMatch | null = null;

    for (const entry of entries) {
      const score = this.computeScore(errorLower, entry);
      if (score >= this.threshold) {
        if (!best || score > best.matchScore) {
          best = { entry, matchScore: score };
        }
      }
    }

    return best;
  }

  /** Ritorna tutte le voci che superano la soglia, ordinate per score */
  matchAll(errorText: string, entries: KnowledgeEntry[]): KBMatch[] {
    if (!errorText || entries.length === 0) return [];
    const errorLower = errorText.toLowerCase();
    return entries
      .map(entry => ({ entry, matchScore: this.computeScore(errorLower, entry) }))
      .filter(m => m.matchScore >= this.threshold)
      .sort((a, b) => b.matchScore - a.matchScore);
  }

  private computeScore(errorLower: string, entry: KnowledgeEntry): number {
    const pattern = entry.pattern.toLowerCase();

    // 1. Tentativo regex
    try {
      const re = new RegExp(entry.pattern, 'i');
      if (re.test(errorLower)) {
        // Regex match — base score dal confidence + score dell'entry
        const confBonus = entry.confidence === 'high' ? 0.2 : entry.confidence === 'medium' ? 0.1 : 0;
        return Math.min(1.0, 0.8 + confBonus) * entry.score;
      }
    } catch { /* pattern non è regex valida */ }

    // 2. Substring esatta
    if (errorLower.includes(pattern)) {
      const confBonus = entry.confidence === 'high' ? 0.1 : 0;
      return Math.min(1.0, 0.75 + confBonus) * entry.score;
    }

    // 3. Similarità per parole chiave (almeno 60% delle parole del pattern presenti)
    const patternWords = pattern.split(/\s+/).filter(w => w.length > 3);
    if (patternWords.length > 0) {
      const matchedWords = patternWords.filter(w => errorLower.includes(w));
      const wordRatio = matchedWords.length / patternWords.length;
      if (wordRatio >= 0.6) {
        return wordRatio * 0.65 * entry.score;
      }
    }

    return 0;
  }
}

// ---------------------------------------------------------------------------
// Seed loader — carica kb-seed.json nella KB se le voci non esistono
// ---------------------------------------------------------------------------

function loadSeed(store: KnowledgeStore): void {
  // Cerca il seed nella cartella del progetto
  const candidates = [
    path.join(process.cwd(), 'kb-seed.json'),
    path.join(process.cwd(), 'src', 'backend', 'kb-seed.json'),
    // v0.99.35 — import.meta.dirname non esiste in output CommonJS
    // (dist/server.cjs): esbuild lo svuota silenziosamente a build-time,
    // producendo path.join(undefined, ...) a runtime. __dirname è
    // l'equivalente nativo CJS, sempre disponibile, nessun warning.
    // Bug latente finora innocuo solo perché uno dei due candidati sopra
    // trovava sempre il file per chi lanciava da dentro la cartella
    // progetto — si sarebbe manifestato lanciando da altrove (es.
    // xdash.service con WorkingDirectory=/opt/x-launcher) se kb-seed.json
    // non fosse stato copiato lì durante l'installazione.
    path.join(__dirname, 'kb-seed.json'),
  ];

  let seedPath: string | null = null;
  for (const p of candidates) {
    if (existsSync(p)) { seedPath = p; break; }
  }

  if (!seedPath) return;

  try {
    const raw: any[] = JSON.parse(readFileSync(seedPath, 'utf-8'));
    for (const entry of raw) {
      // Non sovrascrive voci esistenti con lo stesso id
      if (!store.getById(entry.id)) {
        store.upsert({
          ...entry,
          source: 'seed',
          // Step 19b (v1.1.58) — undefined non è accettato dal driver
          // SQLite come parametro nominato: se il seed non ha ancora
          // solution_en per questa voce, normalizza esplicitamente a null.
          solution_en: entry.solution_en ?? null,
          // SQLite accetta solo stringhe — serializza action_params se è un oggetto
          action_params: typeof entry.action_params === 'string'
            ? entry.action_params
            : JSON.stringify(entry.action_params ?? {}),
        });
      }
    }
  } catch (e) {
    // Seed malformato — non blocca il boot
    console.error('[KB] Seed loading error:', e);
  }
}

// ---------------------------------------------------------------------------
// AIWriteback — scrive soluzioni AI confermate nella KB
// ---------------------------------------------------------------------------

interface WritebackParams {
  pattern:      string;
  solution:     string;
  actionType:   KBActionType;
  actionParams: Record<string, string>;
  confidence:   KBConfidence;
  existingId?:  string;   // se aggiorniamo una voce già presente
}

// ---------------------------------------------------------------------------
// KnowledgeBase — singleton
// ---------------------------------------------------------------------------

class KnowledgeBase {
  private store   = new KnowledgeStore();
  private matcher = new KBMatcher();

  constructor() {
    loadSeed(this.store);
  }

  // ── Lookup ────────────────────────────────────────────────────────────────

  /** Cerca il match migliore. Aggiorna hit_count se trovato. */
  lookup(errorText: string): KBMatch | null {
    const entries = this.store.getAll();
    const match = this.matcher.match(errorText, entries);
    if (match) {
      this.store.updateHitCount(match.entry.id);
    }
    return match;
  }

  lookupAll(errorText: string): KBMatch[] {
    return this.matcher.matchAll(errorText, this.store.getAll());
  }

  // ── Writeback AI ──────────────────────────────────────────────────────────

  /** Chiamato quando l'utente conferma che una soluzione AI ha funzionato */
  writebackResolved(params: WritebackParams): void {
    if (params.existingId) {
      // Aggiorna score positivamente
      this.store.updateScore(params.existingId, +0.1);
      this.store.updateHitCount(params.existingId);
      return;
    }
    const id = `kb-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.store.upsert({
      id,
      pattern:      params.pattern,
      solution:     params.solution,
      // Un suggerimento AI arriva in una sola lingua (quella impostata al
      // momento della chiamata, vedi Step successivo sul prompt) — nessuna
      // seconda lingua da salvare qui, a differenza delle voci di seed.
      solution_en:  null,
      action_type:  params.actionType,
      action_params: JSON.stringify(params.actionParams),
      source:       'ai-writeback',
      confidence:   params.confidence,
      hit_count:    1,
      score:        0.7,
      last_seen:    new Date().toISOString(),
      created_at:   new Date().toISOString(),
    });
  }

  /** Chiamato quando l'utente segnala che una soluzione NON ha funzionato */
  writebackFailed(id: string): void {
    this.store.updateScore(id, -0.15);
  }

  // ── Gestione entries ──────────────────────────────────────────────────────

  getAll(): KnowledgeEntry[] {
    return this.store.getAll();
  }

  delete(id: string): void {
    this.store.delete(id);
  }

  reloadSeed(): void {
    loadSeed(this.store);
  }

  resetToSeed(): void {
    // Elimina solo le voci non-seed, poi ricarica
    const all = this.store.getAll();
    for (const e of all) {
      if (e.source !== 'seed') this.store.delete(e.id);
    }
    loadSeed(this.store);
  }

  stats() {
    return {
      total:    this.store.count(),
      bySource: this.store.countBySource(),
      threshold: this.matcher.threshold,
    };
  }

  setThreshold(value: number): void {
    this.matcher.threshold = Math.max(0.1, Math.min(1.0, value));
  }
}

export const knowledgeBase = new KnowledgeBase();
