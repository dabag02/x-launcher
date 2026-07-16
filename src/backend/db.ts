/**
 * db.ts — Strato SQLite (Step 1)
 *
 * Unico punto di accesso al database. Tutti i manager leggono e scrivono
 * esclusivamente tramite le funzioni esportate da questo modulo.
 *
 * Il file DB viene creato in ~/.local/share/x-launcher/x-launcher.db
 * così sopravvive agli aggiornamenti del progetto ed è separato dai file
 * di build.
 *
 * Schema:
 *   games            — libreria completa con metadati e configurazione per-game
 *   compat_profiles  — profilo Wine/Proton per gioco
 *   runners          — runner Proton rilevati dal filesystem
 *   tokens           — token OAuth per store (file separato con permessi 600)
 *   downloads        — coda download persistente
 *   logs             — log del daemon (ultimi 500)
 */

import Database from 'better-sqlite3';
import { mkdirSync, chmodSync, existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { Game, CompatibilityProfile, LogEntry, DownloadTask } from '../types';
// v1.1.25 — diagnostica mirata: quattro fix reali (v1.1.20→v1.1.24) non
// hanno chiuso il bug "isInstalled/executablePath incoerenti dopo
// install/uninstall, corretto solo da un riavvio" — serve tracciare CHI
// scrive cosa e quando, invece di continuare a ipotizzare sulla carta.
import { writeLog } from './logger';

// ---------------------------------------------------------------------------
// Percorso DB
// ---------------------------------------------------------------------------

const DATA_DIR  = path.join(homedir(), '.local', 'share', 'x-launcher');
const DB_PATH   = path.join(DATA_DIR, 'x-launcher.db');
const TOK_PATH  = path.join(DATA_DIR, 'tokens.json'); // permessi 600

mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Connessione
// ---------------------------------------------------------------------------

const db = new Database(DB_PATH);

// WAL mode: scritture non bloccano le letture
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    store            TEXT NOT NULL,
    runner           TEXT NOT NULL,
    is_installed     INTEGER NOT NULL DEFAULT 0,
    play_time_hours  REAL    NOT NULL DEFAULT 0,
    cover_image      TEXT,
    preview_image    TEXT,
    description      TEXT,
    tags             TEXT,   -- JSON array
    genres           TEXT,   -- JSON array
    categories       TEXT,   -- JSON array
    rating           INTEGER,
    installed_at     TEXT,
    release_date     TEXT,
    status           TEXT    NOT NULL DEFAULT 'Not Installed',
    trailer_url      TEXT,
    executable_path  TEXT,
    prefix_path      TEXT,
    launch_args      TEXT,
    launch_cwd       TEXT,
    steam_app_id     TEXT,
    dosbox_conf      TEXT,
    libretro_core    TEXT,
    scummvm_id       TEXT,
    -- v1.0.0 — chiave canonica di sistema per Classic Console (es.
    -- 'genesis', 'snes'), usata per filtrare i core RetroArch compatibili
    -- nell'overlay. Dimenticata nel primo giro: impostata dal plugin ma
    -- mai collegata allo schema, quindi sempre persa al primo salvataggio.
    system           TEXT,
    hltb_main        INTEGER,
    hltb_completionist INTEGER,
    achievements_unlocked INTEGER,
    achievements_total    INTEGER,
    verified              INTEGER NOT NULL DEFAULT 0,
    verified_at           TEXT,
    verification_method   TEXT,
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS compat_profiles (
    game_id   TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    fsr       INTEGER NOT NULL DEFAULT 0,
    game_mode INTEGER NOT NULL DEFAULT 0,
    mangohud  INTEGER NOT NULL DEFAULT 0,
    eac       INTEGER NOT NULL DEFAULT 0,
    battleye  INTEGER NOT NULL DEFAULT 0,
    custom_env TEXT,
    winetricks_verbs TEXT,
    disable_wine_sync INTEGER NOT NULL DEFAULT 0,
    use_known_fixes INTEGER NOT NULL DEFAULT 0,
    known_fixes_notes TEXT
  );

  CREATE TABLE IF NOT EXISTS runners (
    id        TEXT PRIMARY KEY,
    version   TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'installed',
    detected_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS downloads (
    game_id          TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    game_title       TEXT NOT NULL,
    progress         REAL NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'queued',
    speed            TEXT NOT NULL DEFAULT '0 MB/s',
    bytes_downloaded INTEGER NOT NULL DEFAULT 0,
    total_bytes      INTEGER NOT NULL DEFAULT 0,
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS logs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT    NOT NULL,
    message   TEXT    NOT NULL,
    type      TEXT    NOT NULL DEFAULT 'info'
  );

  -- v0.99.90 — Step 15d (AI Advisor): tracker dei tentativi AI, limite
  -- MAX_AI_ATTEMPTS (3, vedi aiProviders/base.ts) per combinazione
  -- gioco+errore, con lo storico dei tentativi falliti (per non
  -- riproporre la stessa ipotesi al tentativo successivo). Chiave
  -- composta game_id+error_signature: lo stesso titolo può avere due
  -- problemi diversi in momenti diversi, ognuno col proprio contatore
  -- indipendente. attempts è JSON (array di PastAttempt).
  CREATE TABLE IF NOT EXISTS ai_debug_attempts (
    game_id         TEXT    NOT NULL,
    error_signature TEXT    NOT NULL,
    attempts        TEXT    NOT NULL DEFAULT '[]',
    given_up        INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    PRIMARY KEY (game_id, error_signature)
  );

  -- v0.99.90 — Step 15d: credenziali/configurazione per provider AI.
  -- ATTENZIONE, decisione esplicita da segnalare: api_key qui è salvata
  -- in CHIARO, non cifrata — stessa convenzione già in uso in tutto il
  -- resto di questo DB (nessun altro campo sensibile del progetto è
  -- cifrato) e stesso modello di minaccia (macchina locale mono-utente).
  -- Se in futuro cambia il contesto d'uso (macchina condivisa, multi-
  -- utente), va rivista una cifratura a riposo prima di fidarsi di
  -- questa tabella. priority determina l'ordine della catena di
  -- fallback silenzioso tra i provider abilitati (numero più basso =
  -- provato prima) — il "provider di default" è semplicemente quello
  -- con priority più bassa tra quelli enabled+configurati.
  CREATE TABLE IF NOT EXISTS ai_provider_credentials (
    provider_id TEXT    PRIMARY KEY,
    enabled     INTEGER NOT NULL DEFAULT 0,
    api_key     TEXT,
    base_url    TEXT,
    model       TEXT,
    priority    INTEGER NOT NULL DEFAULT 999
  );

  -- v0.99.90 — Step 15d: log di utilizzo token, una riga per chiamata a
  -- un provider AI (qualunque esito: suggestion/clarify/give_up, tutti
  -- consumano token allo stesso modo). Un log invece di un semplice
  -- contatore cumulativo: permette di calcolare il consumo per QUALUNQUE
  -- intervallo (mese corrente, ma anche uno storico per provider in
  -- futuro) con una semplice somma filtrata per data, senza dover gestire
  -- a mano il reset a cavallo di ogni cambio mese.
  CREATE TABLE IF NOT EXISTS ai_usage_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id   TEXT    NOT NULL,
    input_tokens  INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    created_at    TEXT    NOT NULL
  );
`);

// ---------------------------------------------------------------------------
// Migrations — aggiunge colonne mancanti su DB esistenti
// ---------------------------------------------------------------------------
const existingCols = (db.prepare("PRAGMA table_info(games)").all() as any[]).map(r => r.name);
if (!existingCols.includes('prefix_path')) {
  db.exec("ALTER TABLE games ADD COLUMN prefix_path TEXT");
}
if (!existingCols.includes('launch_args')) {
  db.exec("ALTER TABLE games ADD COLUMN launch_args TEXT");
}
if (!existingCols.includes('launch_cwd')) {
  db.exec("ALTER TABLE games ADD COLUMN launch_cwd TEXT");
}
// v0.99.36 — sistema di verifica per-gioco (badge "verificato")
if (!existingCols.includes('verified')) {
  db.exec("ALTER TABLE games ADD COLUMN verified INTEGER NOT NULL DEFAULT 0");
}
if (!existingCols.includes('verified_at')) {
  db.exec("ALTER TABLE games ADD COLUMN verified_at TEXT");
}
if (!existingCols.includes('verification_method')) {
  db.exec("ALTER TABLE games ADD COLUMN verification_method TEXT");
}
// v1.0.0 — vedi commento sopra nello schema: dimenticata nel primo giro.
if (!existingCols.includes('system')) {
  db.exec("ALTER TABLE games ADD COLUMN system TEXT");
}
// Migration per compat_profiles
const compatCols = (db.prepare("PRAGMA table_info(compat_profiles)").all() as any[]).map(r => r.name);
if (!compatCols.includes('winetricks_verbs')) {
  db.exec("ALTER TABLE compat_profiles ADD COLUMN winetricks_verbs TEXT");
}
if (!compatCols.includes('eac')) {
  db.exec("ALTER TABLE compat_profiles ADD COLUMN eac INTEGER NOT NULL DEFAULT 0");
}
if (!compatCols.includes('battleye')) {
  db.exec("ALTER TABLE compat_profiles ADD COLUMN battleye INTEGER NOT NULL DEFAULT 0");
}
// v0.99.35 — switch overlay "Disabilita sync NT veloce" (WINE_DISABLE_FAST_SYNC)
if (!compatCols.includes('disable_wine_sync')) {
  db.exec("ALTER TABLE compat_profiles ADD COLUMN disable_wine_sync INTEGER NOT NULL DEFAULT 0");
}
// v0.99.35 — switch overlay "Usa Known Fixes (Heroic)"
if (!compatCols.includes('use_known_fixes')) {
  db.exec("ALTER TABLE compat_profiles ADD COLUMN use_known_fixes INTEGER NOT NULL DEFAULT 0");
}
// v0.99.38 — note testuali libere del known-fix trovato (se presenti),
// solo per consultazione manuale — vedi CompatibilityProfile.knownFixesNotes.
if (!compatCols.includes('known_fixes_notes')) {
  db.exec("ALTER TABLE compat_profiles ADD COLUMN known_fixes_notes TEXT");
}

// v0.99.35 — correzione storica: giochi installati con status='Not Installed'
// Causa: il plugin GOG imposta sempre status='Not Installed' per tutti i
// titoli del catalogo, e upsertGame sovrascriveva incondizionatamente.
// Colpisce tutti i giochi GOG già installati prima del fix a upsertGame —
// il CASE introdotto lì protegge solo le sovrascritture future.
// Questa UPDATE corregge il dato storico già scritto nel DB una volta sola.
const brokenStatusCount = (db.prepare(
  "SELECT COUNT(*) as n FROM games WHERE is_installed = 1 AND status = 'Not Installed'"
).get() as any)?.n ?? 0;
if (brokenStatusCount > 0) {
  db.exec(
    "UPDATE games SET status = 'Ready to Launch' WHERE is_installed = 1 AND status = 'Not Installed'"
  );
  console.log(`[DB] Status migration: fixed ${brokenStatusCount} installed games with status='Not Installed' → 'Ready to Launch'`);
}

// ---------------------------------------------------------------------------
// Helper: serializzazione
// ---------------------------------------------------------------------------

function rowToGame(row: any): Game {
  return {
    id:             row.id,
    title:          row.title,
    store:          row.store,
    runner:         row.runner,
    isInstalled:    row.is_installed === 1,
    playTimeHours:  row.play_time_hours,
    coverImage:     row.cover_image  ?? '',
    previewImage:   row.preview_image ?? '',
    description:    row.description  ?? '',
    tags:           JSON.parse(row.tags       ?? '[]'),
    genres:         JSON.parse(row.genres     ?? '[]'),
    categories:     JSON.parse(row.categories ?? '[]'),
    rating:         row.rating       ?? undefined,
    installedAt:    row.installed_at ?? undefined,
    releaseDate:    row.release_date ?? undefined,
    status:         row.status,
    trailerUrl:     row.trailer_url  ?? undefined,
    executablePath: row.executable_path ?? undefined,
    prefixPath:     row.prefix_path     ?? undefined,
    launchArgs:     row.launch_args     ?? undefined,
    launchCwd:      row.launch_cwd      ?? undefined,
    steamAppId:     row.steam_app_id    ?? undefined,
    dosboxConf:     row.dosbox_conf     ?? undefined,
    libretroCore:   row.libretro_core   ?? undefined,
    system:         row.system          ?? undefined,
    scummvmId:      row.scummvm_id      ?? undefined,
    hltbHours: (row.hltb_main != null) ? {
      main:          row.hltb_main,
      completionist: row.hltb_completionist,
    } : undefined,
    achievements: (row.achievements_total != null) ? {
      unlocked: row.achievements_unlocked ?? 0,
      total:    row.achievements_total,
    } : undefined,
    verified:           row.verified === 1,
    verifiedAt:         row.verified_at ?? undefined,
    verificationMethod: row.verification_method ?? undefined,
  };
}

function rowToDownload(row: any): DownloadTask {
  return {
    gameId:          row.game_id,
    gameTitle:       row.game_title,
    progress:        row.progress,
    status:          row.status,
    speed:           row.speed,
    bytesDownloaded: row.bytes_downloaded,
    totalBytes:      row.total_bytes,
  };
}

// ---------------------------------------------------------------------------
// API — Games
// ---------------------------------------------------------------------------

const stmtUpsertGame = db.prepare(`
  INSERT INTO games (
    id, title, store, runner, is_installed, play_time_hours,
    cover_image, preview_image, description, tags, genres, categories,
    rating, installed_at, release_date, status, trailer_url,
    executable_path, steam_app_id, dosbox_conf, libretro_core, scummvm_id,
    system,
    hltb_main, hltb_completionist,
    achievements_unlocked, achievements_total,
    updated_at
  ) VALUES (
    @id, @title, @store, @runner, @isInstalled, @playTimeHours,
    @coverImage, @previewImage, @description, @tags, @genres, @categories,
    @rating, @installedAt, @releaseDate, @status, @trailerUrl,
    @executablePath, @steamAppId, @dosboxConf, @libretroCore, @scummvmId,
    @system,
    @hltbMain, @hltbCompletionist,
    @achievementsUnlocked, @achievementsTotal,
    datetime('now')
  )
  ON CONFLICT(id) DO UPDATE SET
    title            = excluded.title,
    store            = excluded.store,
    is_installed     = excluded.is_installed,
    play_time_hours  = excluded.play_time_hours,
    cover_image      = CASE
                         WHEN games.cover_image IS NOT NULL
                          AND games.cover_image NOT LIKE '%unsplash.com%'
                          AND games.cover_image != ''
                         THEN games.cover_image
                         ELSE excluded.cover_image
                       END,
    preview_image    = CASE
                         WHEN games.preview_image IS NOT NULL
                          AND games.preview_image NOT LIKE '%unsplash.com%'
                          AND games.preview_image != ''
                         THEN games.preview_image
                         ELSE excluded.preview_image
                       END,
    description      = COALESCE(NULLIF(games.description, ''), excluded.description),
    tags             = excluded.tags,
    genres           = COALESCE(NULLIF(NULLIF(games.genres, ''), '[]'), excluded.genres),
    categories       = excluded.categories,
    rating           = CASE WHEN games.rating > 0 THEN games.rating ELSE excluded.rating END,
    installed_at     = excluded.installed_at,
    release_date     = excluded.release_date,
    -- v0.99.35 — bug confermato (foto: card Aragami mostra NOT INSTALLED
    -- mentre pannello dettaglio mostra INSTALLED correttamente): il plugin
    -- GOG imposta sempre status='Not Installed' per tutti i titoli del
    -- catalogo senza verificare lo stato reale sul DB — e upsertGame
    -- sovrascriveva incondizionatamente. Quando il sync periodico girava
    -- dopo un'installazione completata, ripristinava lo status a
    -- 'Not Installed' anche se updateGameStatus aveva appena scritto
    -- 'Ready to Launch'. Proteggiamo status nello stesso modo in cui già
    -- proteggiamo executable_path (non sovrascritto da upsert): se il DB
    -- ha già 'Ready to Launch' o 'Playing', lo manteniamo.
    -- Epic non ha questo problema (plugin calcola correttamente
    -- isInstalled ? 'Ready to Launch' : 'Not Installed') — il fix qui
    -- protegge tutti gli store, per prevenzione.
    status           = CASE
                         WHEN games.status IN ('Ready to Launch', 'Playing')
                         THEN games.status
                         ELSE excluded.status
                       END,
    trailer_url      = excluded.trailer_url,
    hltb_main        = excluded.hltb_main,
    hltb_completionist = excluded.hltb_completionist,
    achievements_unlocked = excluded.achievements_unlocked,
    achievements_total    = excluded.achievements_total,
    -- v1.0.0 — a differenza di libretro_core (scelta dell'utente via gli
    -- switch nell'overlay), system è puramente derivato dalla posizione
    -- del file ROM sul disco — nessuna UI lo imposta manualmente, quindi
    -- va sempre aggiornato dall'ultima scansione senza rischio di
    -- cancellare una preferenza utente (non esiste).
    system           = excluded.system,
    updated_at       = datetime('now')
  -- NON sovrascriviamo executable_path, steam_app_id, dosbox_conf,
  -- libretro_core, scummvm_id: sono configurati manualmente dall'utente (Step 4)
  --
  -- v0.99.38 — bug confermato (screenshot: switch runner nell'overlay
  -- tornato su Wine dopo aver cambiato a Proton-GE 11.1 per SOMA, che con
  -- quel runner si è dimostrato funzionante — con Wine crashava). Causa:
  -- 'runner = excluded.runner' era nella SET clause sopra, quindi ad ogni
  -- sync della libreria (il plugin GOG restituisce sempre 'Wine-Lutris'
  -- come default per ogni titolo, vedi gogPlugin.ts) il valore scelto
  -- manualmente dall'utente veniva silenziosamente sovrascritto col
  -- default. Stessa classe di bug già risolta per status/executable_path
  -- — runner andava protetto allo stesso modo (qui rimosso del tutto
  -- dalla SET clause, come executable_path, non con una CASE come
  -- status: non esiste uno scenario in cui il default del plugin debba
  -- vincere su un valore già presente in DB).
`);

export function upsertGame(game: Game): void {
  // v1.1.25 — diagnostica: logga SOLO se isInstalled o executablePath
  // cambiano rispetto a quanto già in DB — upsertGame viene chiamata per
  // OGNI gioco ad ogni refreshLibrary(), loggare sempre sarebbe rumore
  // inutile per la stragrande maggioranza dei giochi il cui stato non
  // cambia mai.
  try {
    const before = db.prepare('SELECT is_installed, executable_path FROM games WHERE id = ?').get(game.id) as any;
    if (before) {
      const beforeInstalled = Boolean(before.is_installed);
      const afterInstalled  = Boolean(game.isInstalled);
      if (beforeInstalled !== afterInstalled || (before.executable_path ?? '') !== (game.executablePath ?? '')) {
        writeLog('system', `[DB] upsertGame "${game.title}": isInstalled ${beforeInstalled}→${afterInstalled} | executablePath "${before.executable_path ?? '(empty)'}"→"${game.executablePath ?? '(empty)'}"`);
      }
    }
  } catch { /* diagnostica opzionale, non deve mai far fallire la scrittura reale */ }

  stmtUpsertGame.run({
    id:                   game.id,
    title:                game.title,
    store:                game.store,
    runner:               game.runner,
    isInstalled:          game.isInstalled ? 1 : 0,
    playTimeHours:        game.playTimeHours,
    coverImage:           game.coverImage   ?? null,
    previewImage:         game.previewImage ?? null,
    description:          game.description  ?? null,
    tags:                 JSON.stringify(game.tags       ?? []),
    genres:               JSON.stringify(game.genres     ?? []),
    categories:           JSON.stringify(game.categories ?? []),
    rating:               game.rating       ?? null,
    installedAt:          game.installedAt  ?? null,
    releaseDate:          game.releaseDate  ?? null,
    status:               game.status,
    trailerUrl:           game.trailerUrl       ?? null,
    executablePath:       game.executablePath    ?? null,
    steamAppId:           game.steamAppId        ?? null,
    dosboxConf:           game.dosboxConf        ?? null,
    libretroCore:         game.libretroCore      ?? null,
    scummvmId:            game.scummvmId         ?? null,
    system:               game.system            ?? null,
    hltbMain:             game.hltbHours?.main           ?? null,
    hltbCompletionist:    game.hltbHours?.completionist  ?? null,
    achievementsUnlocked: game.achievements?.unlocked     ?? null,
    achievementsTotal:    game.achievements?.total        ?? null,
  });
}

/** Upsert batch ottimizzato — una singola transazione per N giochi */
export const upsertGames = db.transaction((games: Game[]) => {
  for (const g of games) upsertGame(g);
});

/**
 * deleteGamesByStoreNotIn — rimuove dal DB le righe di un singolo store
 * il cui id non è presente nell'elenco "fresco" appena scansionato.
 *
 * USO: solo per plugin a scansione esaustiva e locale (es. Classic Console),
 * dove un titolo assente dal risultato significa con certezza che il file
 * non esiste più su disco (rimosso o rinominato — un rename produce un id
 * diverso perché derivato dal path, quindi va trattato come rimozione +
 * aggiunta, non come update).
 *
 * NON usare per store online (Steam/Epic/GOG): un array vuoto o parziale
 * può derivare da un errore di rete/auth temporaneo, non da una libreria
 * realmente svuotata — cancellare in quel caso sarebbe distruttivo.
 *
 * Ritorna il numero di righe rimosse (utile per il log del caller).
 */
export function deleteGamesByStoreNotIn(store: string, validIds: string[]): number {
  const placeholders = validIds.length > 0 ? validIds.map(() => '?').join(',') : null;
  const sql = placeholders
    ? `DELETE FROM games WHERE store = ? AND id NOT IN (${placeholders})`
    : `DELETE FROM games WHERE store = ?`; // validIds vuoto → nessuna ROM trovata, rimuovi tutto lo store
  const result = db.prepare(sql).run(store, ...validIds);
  return result.changes;
}

export function getAllGames(): Game[] {
  return (db.prepare('SELECT * FROM games ORDER BY title ASC').all() as any[]).map(rowToGame);
}

export function getGameById(id: string): Game | undefined {
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(id) as any;
  return row ? rowToGame(row) : undefined;
}

export function updateGameStatus(id: string, isInstalled: boolean, status: Game['status']): void {
  // v1.1.25 — diagnostica: valore PRIMA della scrittura, per vedere nel
  // log se questa chiamata sta davvero cambiando qualcosa o si limita a
  // riscrivere un valore già corretto (utile per distinguere "chi ha
  // causato il problema" da "chi si limita a confermarlo").
  const before = db.prepare('SELECT is_installed, executable_path, title FROM games WHERE id = ?').get(id) as any;
  db.prepare(`
    UPDATE games SET is_installed = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(isInstalled ? 1 : 0, status, id);
  writeLog('system', `[DB] updateGameStatus "${before?.title ?? id}": isInstalled ${before?.is_installed ? 'true' : 'false'}→${isInstalled} | executablePath unchanged="${before?.executable_path ?? '(empty)'}"`);
}

/**
 * markGameVerified — imposta il badge "verificato" su un gioco.
 *
 * Chiamata esplicitamente dall'utente dopo aver confermato che il lancio
 * funziona davvero con la configurazione attualmente salvata (runner +
 * compat profile) — mai dedotta automaticamente da un lancio "riuscito"
 * lato runner, che non garantisce che il gioco sia realmente giocabile.
 *
 * method: 'auto' se non è stato necessario alcun intervento manuale
 * (config di default o known-fixes bastavano), 'manual' se si è dovuto
 * debuggare (winetricks/runner/env aggiuntivi) prima che funzionasse.
 */
export function markGameVerified(id: string, method: 'auto' | 'manual'): void {
  db.prepare(`
    UPDATE games SET
      verified             = 1,
      verified_at          = datetime('now'),
      verification_method  = ?,
      updated_at            = datetime('now')
    WHERE id = ?
  `).run(method, id);
}

/**
 * unmarkGameVerified — rimuove il badge, ad es. se una regressione futura
 * (update Wine/Proton/known-fixes upstream) rompe un titolo prima verificato.
 */
export function unmarkGameVerified(id: string): void {
  db.prepare(`
    UPDATE games SET
      verified             = 0,
      verified_at          = NULL,
      verification_method  = NULL,
      updated_at            = datetime('now')
    WHERE id = ?
  `).run(id);
}

export function updateGameConfig(id: string, config: {
  executablePath?: string | null;
  prefixPath?: string | null;
  launchArgs?: string | null;
  launchCwd?: string | null;
  steamAppId?: string | null;
  dosboxConf?: string | null;
  libretroCore?: string | null;
  scummvmId?: string | null;
  runner?: string;
}): void {
  // Mappa campo JS → colonna SQL
  const colMap: Record<string, string> = {
    executablePath: 'executable_path',
    prefixPath:     'prefix_path',
    launchArgs:     'launch_args',
    launchCwd:      'launch_cwd',
    steamAppId:     'steam_app_id',
    dosboxConf:     'dosbox_conf',
    libretroCore:   'libretro_core',
    scummvmId:      'scummvm_id',
    runner:         'runner',
  };

  // Costruisce SET dinamico solo per le chiavi presenti nel payload
  const setClauses: string[] = [];
  const params: Record<string, any> = { id };

  for (const [jsKey, sqlCol] of Object.entries(colMap)) {
    if (jsKey in config) {
      setClauses.push(`${sqlCol} = @${jsKey}`);
      params[jsKey] = (config as any)[jsKey] ?? null;
    }
  }

  if (setClauses.length === 0) return;

  db.prepare(`
    UPDATE games SET
      ${setClauses.join(',\n      ')},
      updated_at = datetime('now')
    WHERE id = @id
  `).run(params);
}

// ---------------------------------------------------------------------------
// API — Compat Profiles
// ---------------------------------------------------------------------------

export function upsertCompatProfile(gameId: string, profile: CompatibilityProfile): void {
  db.prepare(`
    INSERT INTO compat_profiles (game_id, fsr, game_mode, mangohud, eac, battleye, custom_env, winetricks_verbs, disable_wine_sync, use_known_fixes, known_fixes_notes)
    VALUES (@gameId, @fsr, @gameMode, @mangohud, @eac, @battleye, @customEnv, @winetricksVerbs, @disableWineSync, @useKnownFixes, @knownFixesNotes)
    ON CONFLICT(game_id) DO UPDATE SET
      fsr               = excluded.fsr,
      game_mode         = excluded.game_mode,
      mangohud          = excluded.mangohud,
      eac               = excluded.eac,
      battleye          = excluded.battleye,
      custom_env        = excluded.custom_env,
      winetricks_verbs  = excluded.winetricks_verbs,
      disable_wine_sync = excluded.disable_wine_sync,
      use_known_fixes   = excluded.use_known_fixes,
      known_fixes_notes = excluded.known_fixes_notes
  `).run({
    gameId,
    fsr:             profile.fsr       ? 1 : 0,
    gameMode:        profile.gameMode  ? 1 : 0,
    mangohud:        profile.mangohud  ? 1 : 0,
    eac:             profile.eac       ? 1 : 0,
    battleye:        profile.battleye  ? 1 : 0,
    customEnv:       JSON.stringify(profile.customEnv ?? {}),
    winetricksVerbs: JSON.stringify(profile.winetricksVerbs ?? []),
    disableWineSync: profile.disableWineSync ? 1 : 0,
    useKnownFixes:   profile.useKnownFixes   ? 1 : 0,
    knownFixesNotes: profile.knownFixesNotes ? JSON.stringify(profile.knownFixesNotes) : null,
  });
}

export function getCompatProfile(gameId: string): CompatibilityProfile | undefined {
  const row = db.prepare('SELECT * FROM compat_profiles WHERE game_id = ?').get(gameId) as any;
  if (!row) return undefined;
  return {
    fsr:             row.fsr       === 1,
    gameMode:        row.game_mode === 1,
    mangohud:        row.mangohud  === 1,
    eac:             row.eac       === 1,
    battleye:        row.battleye  === 1,
    customEnv:       JSON.parse(row.custom_env ?? '{}'),
    winetricksVerbs: JSON.parse(row.winetricks_verbs ?? 'null') ?? undefined,
    disableWineSync: row.disable_wine_sync === 1,
    useKnownFixes:   row.use_known_fixes   === 1,
    knownFixesNotes: row.known_fixes_notes ? JSON.parse(row.known_fixes_notes) : undefined,
  };
}

// ---------------------------------------------------------------------------
// API — Runners
// ---------------------------------------------------------------------------

export function upsertRunners(runners: Array<{ id: string; version: string; status: string }>): void {
  const stmt = db.prepare(`
    INSERT INTO runners (id, version, status, detected_at)
    VALUES (@id, @version, @status, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      version     = excluded.version,
      status      = excluded.status,
      detected_at = datetime('now')
  `);
  db.transaction((rs) => { for (const r of rs) stmt.run(r); })(runners);
}

export function getAllRunners(): Array<{ id: string; version: string; status: string }> {
  return db.prepare('SELECT id, version, status FROM runners ORDER BY id').all() as any[];
}

// ---------------------------------------------------------------------------
// API — Downloads
// ---------------------------------------------------------------------------

export function upsertDownload(task: DownloadTask): void {
  db.prepare(`
    INSERT INTO downloads (game_id, game_title, progress, status, speed, bytes_downloaded, total_bytes, updated_at)
    VALUES (@gameId, @gameTitle, @progress, @status, @speed, @bytesDownloaded, @totalBytes, datetime('now'))
    ON CONFLICT(game_id) DO UPDATE SET
      progress         = excluded.progress,
      status           = excluded.status,
      speed            = excluded.speed,
      bytes_downloaded = excluded.bytes_downloaded,
      total_bytes      = excluded.total_bytes,
      updated_at       = datetime('now')
  `).run({
    gameId:          task.gameId,
    gameTitle:       task.gameTitle,
    progress:        task.progress,
    status:          task.status,
    speed:           task.speed,
    bytesDownloaded: task.bytesDownloaded,
    totalBytes:      task.totalBytes,
  });
}

export function getPendingDownloads(): DownloadTask[] {
  return (db.prepare(`
    SELECT * FROM downloads WHERE status IN ('queued', 'downloading', 'paused')
  `).all() as any[]).map(rowToDownload);
}

export function deleteDownload(gameId: string): void {
  db.prepare('DELETE FROM downloads WHERE game_id = ?').run(gameId);
}

// ---------------------------------------------------------------------------
// API — Logs
// ---------------------------------------------------------------------------

export function insertLog(entry: LogEntry): void {
  db.prepare(`
    INSERT INTO logs (timestamp, message, type) VALUES (?, ?, ?)
  `).run(entry.timestamp, entry.message, entry.type);

  // Mantieni solo gli ultimi 500 log
  db.prepare(`
    DELETE FROM logs WHERE id NOT IN (
      SELECT id FROM logs ORDER BY id DESC LIMIT 500
    )
  `).run();
}

export function getRecentLogs(limit = 200): LogEntry[] {
  return (db.prepare(`
    SELECT timestamp, message, type FROM logs ORDER BY id DESC LIMIT ?
  `).all(limit) as any[]).reverse() as LogEntry[];
}

// ---------------------------------------------------------------------------
// Token OAuth (file separato con permessi 600)
// ---------------------------------------------------------------------------

export function saveToken(storeId: string, token: string): void {
  let tokens: Record<string, string> = {};
  try {
    tokens = JSON.parse(require('fs').readFileSync(TOK_PATH, 'utf-8'));
  } catch { /* file non ancora creato */ }
  tokens[storeId] = token;
  require('fs').writeFileSync(TOK_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export function loadToken(storeId: string): string | undefined {
  try {
    const tokens = JSON.parse(require('fs').readFileSync(TOK_PATH, 'utf-8'));
    return tokens[storeId];
  } catch { return undefined; }
}

// ---------------------------------------------------------------------------
// Plugin Store states — enabled/disabled persistiti
// ---------------------------------------------------------------------------

// Migration: crea la tabella se non esiste
db.prepare(`
  CREATE TABLE IF NOT EXISTS plugin_states (
    id      TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1
  )
`).run();

export function setPluginEnabled(storeId: string, enabled: boolean): void {
  db.prepare(`
    INSERT INTO plugin_states (id, enabled) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled
  `).run(storeId, enabled ? 1 : 0);
}

export function getPluginStates(): Array<{ id: string; enabled: boolean }> {
  return (db.prepare(`SELECT id, enabled FROM plugin_states`).all() as any[])
    .map(r => ({ id: r.id, enabled: r.enabled === 1 }));
}

// ---------------------------------------------------------------------------
// Step 15d (AI Advisor) — tracker tentativi + credenziali provider
// ---------------------------------------------------------------------------

export interface AiAttemptRecordRow {
  gameId:         string;
  errorSignature: string;
  attempts:       Array<{ suggestion: { solution: string; actionType: string; actionParams: Record<string, string>; confidence: string }; failed: true }>;
  givenUp:        boolean;
  lastAttemptAt:  string | null;
}

export function getAiAttemptRecord(gameId: string, errorSignature: string): AiAttemptRecordRow | undefined {
  const row = db.prepare(
    'SELECT * FROM ai_debug_attempts WHERE game_id = ? AND error_signature = ?'
  ).get(gameId, errorSignature) as any;
  if (!row) return undefined;
  return {
    gameId: row.game_id,
    errorSignature: row.error_signature,
    attempts: JSON.parse(row.attempts || '[]'),
    givenUp: row.given_up === 1,
    lastAttemptAt: row.last_attempt_at,
  };
}

/**
 * Registra un tentativo fallito, aggiornando lo storico e — se questo era
 * il MAX_AI_ATTEMPTS-esimo tentativo — segna given_up. Il limite stesso
 * (3) vive in aiProviders/base.ts, non qui: questa funzione si limita a
 * salvare, la decisione "quanti tentativi sono troppi" resta in un unico
 * punto (vedi MAX_AI_ATTEMPTS).
 */
export function recordAiAttemptFailure(
  gameId: string,
  errorSignature: string,
  suggestion: { solution: string; actionType: string; actionParams: Record<string, string>; confidence: string },
  maxAttempts: number,
): AiAttemptRecordRow {
  const existing = getAiAttemptRecord(gameId, errorSignature);
  const attempts = [...(existing?.attempts ?? []), { suggestion, failed: true as const }];
  const givenUp = attempts.length >= maxAttempts;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO ai_debug_attempts (game_id, error_signature, attempts, given_up, last_attempt_at)
    VALUES (@gameId, @errorSignature, @attempts, @givenUp, @lastAttemptAt)
    ON CONFLICT(game_id, error_signature) DO UPDATE SET
      attempts        = excluded.attempts,
      given_up        = excluded.given_up,
      last_attempt_at = excluded.last_attempt_at
  `).run({
    gameId, errorSignature,
    attempts: JSON.stringify(attempts),
    givenUp: givenUp ? 1 : 0,
    lastAttemptAt: now,
  });

  return { gameId, errorSignature, attempts, givenUp, lastAttemptAt: now };
}

/**
 * Azzera TUTTI i tentativi AI per un gioco (non solo per una specifica
 * error_signature) — chiamata quando l'utente modifica manualmente il
 * compat profile (vedi gameManager.updateCompatProfile), segno che la
 * situazione di partenza è cambiata e l'AI merita un'altra possibilità.
 * Deliberatamente ad ampio raggio (tutte le signature del gioco, non
 * solo quella "sospettata"): un cambio di runner/verb può influenzare
 * errori che sulla carta sembravano non correlati.
 */
export function resetAiAttemptsForGame(gameId: string): void {
  db.prepare('DELETE FROM ai_debug_attempts WHERE game_id = ?').run(gameId);
}

export interface AiProviderCredential {
  providerId: string;
  enabled:    boolean;
  apiKey?:    string;
  baseUrl?:   string;
  model?:     string;
  priority:   number;
}

export function getAiProviderCredential(providerId: string): AiProviderCredential | undefined {
  const row = db.prepare('SELECT * FROM ai_provider_credentials WHERE provider_id = ?').get(providerId) as any;
  if (!row) return undefined;
  return {
    providerId: row.provider_id,
    enabled:    row.enabled === 1,
    apiKey:     row.api_key    ?? undefined,
    baseUrl:    row.base_url   ?? undefined,
    model:      row.model      ?? undefined,
    priority:   row.priority,
  };
}

/** Tutte le credenziali configurate, ordinate per priority (usata per costruire la catena di fallback). */
export function getAllAiProviderCredentials(): AiProviderCredential[] {
  return (db.prepare('SELECT * FROM ai_provider_credentials ORDER BY priority ASC').all() as any[])
    .map(row => ({
      providerId: row.provider_id,
      enabled:    row.enabled === 1,
      apiKey:     row.api_key  ?? undefined,
      baseUrl:    row.base_url ?? undefined,
      model:      row.model    ?? undefined,
      priority:   row.priority,
    }));
}

export function upsertAiProviderCredential(cred: AiProviderCredential): void {
  db.prepare(`
    INSERT INTO ai_provider_credentials (provider_id, enabled, api_key, base_url, model, priority)
    VALUES (@providerId, @enabled, @apiKey, @baseUrl, @model, @priority)
    ON CONFLICT(provider_id) DO UPDATE SET
      enabled  = excluded.enabled,
      api_key  = excluded.api_key,
      base_url = excluded.base_url,
      model    = excluded.model,
      priority = excluded.priority
  `).run({
    providerId: cred.providerId,
    enabled:    cred.enabled ? 1 : 0,
    apiKey:     cred.apiKey  ?? null,
    baseUrl:    cred.baseUrl ?? null,
    model:      cred.model   ?? null,
    priority:   cred.priority,
  });
}

// v1.1.12 — mancava un modo per cancellare una API key salvata: prima
// l'unica via era sovrascriverla con una nuova (upsert), nessuna route
// rimuoveva la riga. Rimuove l'intera credenziale (non solo la key):
// enabled torna false insieme, coerente con "questo provider non è più
// configurato" invece di lasciare enabled=true con una key vuota, stato
// che getActiveProviders() già tratta come "non configurato" ma che
// confonderebbe la UI se il toggle restasse acceso.
export function deleteAiProviderCredential(providerId: string): void {
  db.prepare('DELETE FROM ai_provider_credentials WHERE provider_id = ?').run(providerId);
}

/**
 * v0.99.90 — Step 15d: registra il consumo token di UNA chiamata a un
 * provider AI (qualunque esito). Chiamata da orchestrator.ts dopo ogni
 * askForFix, indipendentemente da suggestion/clarify/give_up.
 */
export function recordAiUsage(providerId: string, inputTokens: number, outputTokens: number): void {
  db.prepare(`
    INSERT INTO ai_usage_log (provider_id, input_tokens, output_tokens, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(providerId, inputTokens, outputTokens);
}

export interface AiUsageSummary {
  totalTokens: number;
  byProvider: Record<string, number>;
}

/**
 * Somma il consumo dal primo giorno del mese corrente (ora locale del
 * daemon) ad oggi — non un contatore separato da azzerare a mano: il
 * "reset mensile" è semplicemente che il primo del mese la finestra di
 * somma non include più nulla del mese precedente.
 */
export function getAiUsageThisMonth(): AiUsageSummary {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const rows = db.prepare(`
    SELECT provider_id, SUM(input_tokens + output_tokens) as total
    FROM ai_usage_log
    WHERE created_at >= ?
    GROUP BY provider_id
  `).all(monthStart) as any[];

  const byProvider: Record<string, number> = {};
  let totalTokens = 0;
  for (const row of rows) {
    byProvider[row.provider_id] = row.total;
    totalTokens += row.total;
  }
  return { totalTokens, byProvider };
}

export default db;
