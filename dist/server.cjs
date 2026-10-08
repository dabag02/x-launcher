"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/backend/paths.ts
var import_path, import_os, DATA_DIR, ENV_PATH;
var init_paths = __esm({
  "src/backend/paths.ts"() {
    "use strict";
    import_path = __toESM(require("path"), 1);
    import_os = require("os");
    DATA_DIR = import_path.default.join((0, import_os.homedir)(), ".local", "share", "x-launcher");
    ENV_PATH = import_path.default.join(DATA_DIR, ".env");
  }
});

// src/backend/logger.ts
function rotate() {
  try {
    const stat = (0, import_fs.statSync)(LOG_PATH);
    if (stat.size <= MAX_BYTES) return;
    const log1 = LOG_PATH + ".1";
    const log2 = LOG_PATH + ".2";
    if ((0, import_fs.existsSync)(log1)) (0, import_fs.renameSync)(log1, log2);
    (0, import_fs.renameSync)(LOG_PATH, log1);
  } catch {
  }
}
function writeLog(level, message) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  const tag = level.toUpperCase();
  const line = `[${ts}] [${tag}] ${message}
`;
  process.stdout.write(line);
  rotate();
  try {
    (0, import_fs.appendFileSync)(LOG_PATH, line, "utf-8");
  } catch {
  }
}
var import_fs, import_path2, LOG_PATH, MAX_BYTES, LOG_PATH_EXPORT;
var init_logger = __esm({
  "src/backend/logger.ts"() {
    "use strict";
    import_fs = require("fs");
    import_path2 = __toESM(require("path"), 1);
    init_paths();
    LOG_PATH = import_path2.default.join(DATA_DIR, "daemon.log");
    MAX_BYTES = 5 * 1024 * 1024;
    (0, import_fs.mkdirSync)(DATA_DIR, { recursive: true });
    LOG_PATH_EXPORT = LOG_PATH;
  }
});

// src/backend/db.ts
var db_exports = {};
__export(db_exports, {
  addPlayTime: () => addPlayTime,
  countInstalledGamesForLauncher: () => countInstalledGamesForLauncher,
  default: () => db_default,
  deleteAiProviderCredential: () => deleteAiProviderCredential,
  deleteDownload: () => deleteDownload,
  deleteGamesById: () => deleteGamesById,
  deleteGamesByStoreNotIn: () => deleteGamesByStoreNotIn,
  deleteSharedLauncherPrefix: () => deleteSharedLauncherPrefix,
  exportCompatProfilesRaw: () => exportCompatProfilesRaw,
  getAiAttemptRecord: () => getAiAttemptRecord,
  getAiProviderCredential: () => getAiProviderCredential,
  getAiUsageThisMonth: () => getAiUsageThisMonth,
  getAllAiProviderCredentials: () => getAllAiProviderCredentials,
  getAllCloudBackupCredentials: () => getAllCloudBackupCredentials,
  getAllGames: () => getAllGames,
  getAllRunners: () => getAllRunners,
  getCloudBackupCredential: () => getCloudBackupCredential,
  getCompatProfile: () => getCompatProfile,
  getGameById: () => getGameById,
  getPendingDownloads: () => getPendingDownloads,
  getPluginStates: () => getPluginStates,
  getRecentLogs: () => getRecentLogs,
  getRecentlyLaunched: () => getRecentlyLaunched,
  getSharedLauncherPrefix: () => getSharedLauncherPrefix,
  getWindowClass: () => getWindowClass,
  importCompatProfilesRaw: () => importCompatProfilesRaw,
  insertLog: () => insertLog,
  loadToken: () => loadToken,
  markAiBudgetWarned: () => markAiBudgetWarned,
  markGameVerified: () => markGameVerified,
  recordAiAttemptFailure: () => recordAiAttemptFailure,
  recordAiUsage: () => recordAiUsage,
  recordGameLaunch: () => recordGameLaunch,
  resetAiAttemptsForGame: () => resetAiAttemptsForGame,
  saveToken: () => saveToken,
  setPluginEnabled: () => setPluginEnabled,
  setPredictedSizeBytes: () => setPredictedSizeBytes,
  unmarkGameVerified: () => unmarkGameVerified,
  updateGameConfig: () => updateGameConfig,
  updateGameStatus: () => updateGameStatus,
  updateGameTitle: () => updateGameTitle,
  updateWindowClass: () => updateWindowClass,
  upsertAiProviderCredential: () => upsertAiProviderCredential,
  upsertCloudBackupCredential: () => upsertCloudBackupCredential,
  upsertCompatProfile: () => upsertCompatProfile,
  upsertDownload: () => upsertDownload,
  upsertGame: () => upsertGame,
  upsertGames: () => upsertGames,
  upsertRunners: () => upsertRunners,
  upsertSharedLauncherPrefix: () => upsertSharedLauncherPrefix
});
function rowToGame(row) {
  return {
    id: row.id,
    title: row.title,
    store: row.store,
    runner: row.runner,
    isInstalled: row.is_installed === 1,
    playTimeHours: row.play_time_hours,
    coverImage: row.cover_image ?? "",
    previewImage: row.preview_image ?? "",
    description: row.description ?? "",
    tags: JSON.parse(row.tags ?? "[]"),
    genres: JSON.parse(row.genres ?? "[]"),
    categories: JSON.parse(row.categories ?? "[]"),
    rating: row.rating ?? void 0,
    installedAt: row.installed_at ?? void 0,
    releaseDate: row.release_date ?? void 0,
    status: row.status,
    trailerUrl: row.trailer_url ?? void 0,
    executablePath: row.executable_path ?? void 0,
    prefixPath: row.prefix_path ?? void 0,
    launchArgs: row.launch_args ?? void 0,
    launchCwd: row.launch_cwd ?? void 0,
    steamAppId: row.steam_app_id ?? void 0,
    dosboxConf: row.dosbox_conf ?? void 0,
    libretroCore: row.libretro_core ?? void 0,
    system: row.system ?? void 0,
    scummvmId: row.scummvm_id ?? void 0,
    scrapeTitle: row.scrape_title ?? void 0,
    windowClass: row.window_class ?? void 0,
    predictedSizeBytes: row.predicted_size_bytes ?? void 0,
    hltbHours: row.hltb_main != null ? {
      main: row.hltb_main,
      completionist: row.hltb_completionist
    } : void 0,
    achievements: row.achievements_total != null ? {
      unlocked: row.achievements_unlocked ?? 0,
      total: row.achievements_total
    } : void 0,
    verified: row.verified === 1,
    verifiedAt: row.verified_at ?? void 0,
    verificationMethod: row.verification_method ?? void 0,
    requiresLauncher: row.requires_launcher ?? void 0,
    storeInstallUnavailable: row.store_install_unavailable === 1,
    // v2.1.11-dev.2 — solo per preset 'toggle-options' (PS2/futuro N64),
    // vedi commento sulla ALTER TABLE più sopra. Per PSX/Saturn resta
    // sempre false/ignorato: quei sistemi usano ancora libretroCore.
    remasterEnabled: row.remaster_enabled === 1
  };
}
function rowToDownload(row) {
  return {
    gameId: row.game_id,
    gameTitle: row.game_title,
    progress: row.progress,
    status: row.status,
    speed: row.speed,
    bytesDownloaded: row.bytes_downloaded,
    totalBytes: row.total_bytes
  };
}
function upsertGame(game) {
  try {
    const before = db.prepare("SELECT is_installed, executable_path FROM games WHERE id = ?").get(game.id);
    if (before) {
      const beforeInstalled = Boolean(before.is_installed);
      const afterInstalled = Boolean(game.isInstalled);
      if (beforeInstalled !== afterInstalled || (before.executable_path ?? "") !== (game.executablePath ?? "")) {
        writeLog("system", `[DB] upsertGame "${game.title}": isInstalled ${beforeInstalled}\u2192${afterInstalled} | executablePath "${before.executable_path ?? "(empty)"}"\u2192"${game.executablePath ?? "(empty)"}"`);
      }
    }
  } catch {
  }
  stmtUpsertGame.run({
    id: game.id,
    title: game.title,
    store: game.store,
    runner: game.runner,
    isInstalled: game.isInstalled ? 1 : 0,
    playTimeHours: game.playTimeHours,
    coverImage: game.coverImage ?? null,
    previewImage: game.previewImage ?? null,
    description: game.description ?? null,
    tags: JSON.stringify(game.tags ?? []),
    genres: JSON.stringify(game.genres ?? []),
    categories: JSON.stringify(game.categories ?? []),
    rating: game.rating ?? null,
    installedAt: game.installedAt ?? null,
    releaseDate: game.releaseDate ?? null,
    status: game.status,
    trailerUrl: game.trailerUrl ?? null,
    executablePath: game.executablePath ?? null,
    steamAppId: game.steamAppId ?? null,
    dosboxConf: game.dosboxConf ?? null,
    libretroCore: game.libretroCore ?? null,
    scummvmId: game.scummvmId ?? null,
    scrapeTitle: game.scrapeTitle ?? null,
    system: game.system ?? null,
    hltbMain: game.hltbHours?.main ?? null,
    hltbCompletionist: game.hltbHours?.completionist ?? null,
    achievementsUnlocked: game.achievements?.unlocked ?? null,
    achievementsTotal: game.achievements?.total ?? null
  });
}
function deleteGamesByStoreNotIn(store, validIds) {
  const placeholders = validIds.length > 0 ? validIds.map(() => "?").join(",") : null;
  const sql = placeholders ? `DELETE FROM games WHERE store = ? AND id NOT IN (${placeholders})` : `DELETE FROM games WHERE store = ?`;
  const result = db.prepare(sql).run(store, ...validIds);
  return result.changes;
}
function deleteGamesById(ids) {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const result = db.prepare(`DELETE FROM games WHERE id IN (${placeholders})`).run(...ids);
  return result.changes;
}
function getAllGames() {
  return db.prepare("SELECT * FROM games ORDER BY title ASC").all().map(rowToGame);
}
function updateGameTitle(id, title) {
  db.prepare("UPDATE games SET title = ? WHERE id = ?").run(title, id);
}
function addPlayTime(id, hours) {
  if (!(hours > 0)) return;
  db.prepare("UPDATE games SET play_time_hours = play_time_hours + ? WHERE id = ?").run(hours, id);
}
function setPredictedSizeBytes(id, bytes) {
  db.prepare("UPDATE games SET predicted_size_bytes = ? WHERE id = ?").run(bytes, id);
}
function getGameById(id) {
  const row = db.prepare("SELECT * FROM games WHERE id = ?").get(id);
  return row ? rowToGame(row) : void 0;
}
function recordGameLaunch(id) {
  db.prepare(`UPDATE games SET last_launched_at = datetime('now') WHERE id = ?`).run(id);
}
function updateWindowClass(id, windowClass) {
  db.prepare("UPDATE games SET window_class = ? WHERE id = ?").run(windowClass, id);
}
function getWindowClass(id) {
  const row = db.prepare("SELECT window_class FROM games WHERE id = ?").get(id);
  return row?.window_class ?? void 0;
}
function getRecentlyLaunched(limit = 3) {
  return db.prepare(`
    SELECT id, title FROM games
    WHERE last_launched_at IS NOT NULL AND is_installed = 1
    ORDER BY last_launched_at DESC
    LIMIT ?
  `).all(limit);
}
function updateGameStatus(id, isInstalled, status) {
  const before = db.prepare("SELECT is_installed, executable_path, title FROM games WHERE id = ?").get(id);
  db.prepare(`
    UPDATE games SET is_installed = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(isInstalled ? 1 : 0, status, id);
  writeLog("system", `[DB] updateGameStatus "${before?.title ?? id}": isInstalled ${before?.is_installed ? "true" : "false"}\u2192${isInstalled} | executablePath unchanged="${before?.executable_path ?? "(empty)"}"`);
}
function markGameVerified(id, method) {
  db.prepare(`
    UPDATE games SET
      verified             = 1,
      verified_at          = datetime('now'),
      verification_method  = ?,
      updated_at            = datetime('now')
    WHERE id = ?
  `).run(method, id);
}
function unmarkGameVerified(id) {
  db.prepare(`
    UPDATE games SET
      verified             = 0,
      verified_at          = NULL,
      verification_method  = NULL,
      updated_at            = datetime('now')
    WHERE id = ?
  `).run(id);
}
function updateGameConfig(id, config) {
  const colMap = {
    executablePath: "executable_path",
    prefixPath: "prefix_path",
    launchArgs: "launch_args",
    launchCwd: "launch_cwd",
    steamAppId: "steam_app_id",
    dosboxConf: "dosbox_conf",
    libretroCore: "libretro_core",
    scummvmId: "scummvm_id",
    scrapeTitle: "scrape_title",
    windowClass: "window_class",
    runner: "runner",
    requiresLauncher: "requires_launcher"
  };
  const setClauses = [];
  const params = { id };
  for (const [jsKey, sqlCol] of Object.entries(colMap)) {
    if (jsKey in config) {
      setClauses.push(`${sqlCol} = @${jsKey}`);
      params[jsKey] = config[jsKey] ?? null;
    }
  }
  if ("storeInstallUnavailable" in config) {
    setClauses.push("store_install_unavailable = @storeInstallUnavailable");
    params.storeInstallUnavailable = config.storeInstallUnavailable ? 1 : 0;
  }
  if ("remasterEnabled" in config) {
    setClauses.push("remaster_enabled = @remasterEnabled");
    params.remasterEnabled = config.remasterEnabled ? 1 : 0;
  }
  if (setClauses.length === 0) return;
  db.prepare(`
    UPDATE games SET
      ${setClauses.join(",\n      ")},
      updated_at = datetime('now')
    WHERE id = @id
  `).run(params);
}
function upsertCompatProfile(gameId, profile) {
  db.prepare(`
    INSERT INTO compat_profiles (game_id, fsr, game_mode, mangohud, eac, battleye, custom_env, winetricks_verbs, disable_wine_sync, use_known_fixes, known_fixes_notes, umu_run, bypass_store_auth_chain, gamescope)
    VALUES (@gameId, @fsr, @gameMode, @mangohud, @eac, @battleye, @customEnv, @winetricksVerbs, @disableWineSync, @useKnownFixes, @knownFixesNotes, @umuRun, @bypassStoreAuthChain, @gamescope)
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
      known_fixes_notes = excluded.known_fixes_notes,
      umu_run           = excluded.umu_run,
      bypass_store_auth_chain = excluded.bypass_store_auth_chain,
      gamescope         = excluded.gamescope
  `).run({
    gameId,
    fsr: profile.fsr ? 1 : 0,
    gameMode: profile.gameMode ? 1 : 0,
    mangohud: profile.mangohud ?? 0,
    eac: profile.eac ? 1 : 0,
    battleye: profile.battleye ? 1 : 0,
    customEnv: JSON.stringify(profile.customEnv ?? {}),
    winetricksVerbs: JSON.stringify(profile.winetricksVerbs ?? []),
    disableWineSync: profile.disableWineSync ? 1 : 0,
    useKnownFixes: profile.useKnownFixes ? 1 : 0,
    knownFixesNotes: profile.knownFixesNotes ? JSON.stringify(profile.knownFixesNotes) : null,
    umuRun: profile.umuRun ? 1 : 0,
    bypassStoreAuthChain: profile.bypassStoreAuthChain ? 1 : 0,
    gamescope: profile.gamescope ?? 0
  });
}
function getCompatProfile(gameId) {
  const row = db.prepare("SELECT * FROM compat_profiles WHERE game_id = ?").get(gameId);
  if (!row) return void 0;
  return {
    fsr: row.fsr === 1,
    gameMode: row.game_mode === 1,
    mangohud: row.mangohud ?? 0,
    eac: row.eac === 1,
    battleye: row.battleye === 1,
    customEnv: JSON.parse(row.custom_env ?? "{}"),
    winetricksVerbs: JSON.parse(row.winetricks_verbs ?? "null") ?? void 0,
    disableWineSync: row.disable_wine_sync === 1,
    useKnownFixes: row.use_known_fixes === 1,
    knownFixesNotes: row.known_fixes_notes ? JSON.parse(row.known_fixes_notes) : void 0,
    umuRun: row.umu_run === 1,
    bypassStoreAuthChain: row.bypass_store_auth_chain === 1,
    gamescope: row.gamescope ?? 0
  };
}
function upsertRunners(runners) {
  const stmt = db.prepare(`
    INSERT INTO runners (id, version, status, detected_at)
    VALUES (@id, @version, @status, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      version     = excluded.version,
      status      = excluded.status,
      detected_at = datetime('now')
  `);
  db.transaction((rs) => {
    for (const r of rs) stmt.run(r);
  })(runners);
}
function getAllRunners() {
  return db.prepare("SELECT id, version, status FROM runners ORDER BY id").all();
}
function upsertDownload(task) {
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
    gameId: task.gameId,
    gameTitle: task.gameTitle,
    progress: task.progress,
    status: task.status,
    speed: task.speed,
    bytesDownloaded: task.bytesDownloaded,
    totalBytes: task.totalBytes
  });
}
function getPendingDownloads() {
  return db.prepare(`
    SELECT * FROM downloads WHERE status IN ('queued', 'downloading', 'paused')
  `).all().map(rowToDownload);
}
function deleteDownload(gameId) {
  db.prepare("DELETE FROM downloads WHERE game_id = ?").run(gameId);
}
function insertLog(entry) {
  db.prepare(`
    INSERT INTO logs (timestamp, message, type) VALUES (?, ?, ?)
  `).run(entry.timestamp, entry.message, entry.type);
  db.prepare(`
    DELETE FROM logs WHERE id NOT IN (
      SELECT id FROM logs ORDER BY id DESC LIMIT 500
    )
  `).run();
}
function getRecentLogs(limit = 200) {
  const rows = db.prepare(`
    SELECT timestamp, message, type FROM logs ORDER BY id DESC LIMIT ?
  `).all(limit);
  return rows.reverse().map((r) => ({ ...r, type: r.type }));
}
function saveToken(storeId, token) {
  let tokens = {};
  try {
    tokens = JSON.parse(require("fs").readFileSync(TOK_PATH, "utf-8"));
  } catch {
  }
  tokens[storeId] = token;
  require("fs").writeFileSync(TOK_PATH, JSON.stringify(tokens, null, 2), { mode: 384 });
}
function loadToken(storeId) {
  try {
    const tokens = JSON.parse(require("fs").readFileSync(TOK_PATH, "utf-8"));
    return tokens[storeId];
  } catch {
    return void 0;
  }
}
function setPluginEnabled(storeId, enabled) {
  db.prepare(`
    INSERT INTO plugin_states (id, enabled) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled
  `).run(storeId, enabled ? 1 : 0);
}
function getPluginStates() {
  return db.prepare(`SELECT id, enabled FROM plugin_states`).all().map((r) => ({ id: r.id, enabled: r.enabled === 1 }));
}
function getAiAttemptRecord(gameId, errorSignature) {
  const row = db.prepare(
    "SELECT * FROM ai_debug_attempts WHERE game_id = ? AND error_signature = ?"
  ).get(gameId, errorSignature);
  if (!row) return void 0;
  return {
    gameId: row.game_id,
    errorSignature: row.error_signature,
    attempts: JSON.parse(row.attempts || "[]"),
    givenUp: row.given_up === 1,
    lastAttemptAt: row.last_attempt_at
  };
}
function recordAiAttemptFailure(gameId, errorSignature, suggestion, maxAttempts) {
  const existing = getAiAttemptRecord(gameId, errorSignature);
  const attempts = [...existing?.attempts ?? [], { suggestion, failed: true }];
  const givenUp = attempts.length >= maxAttempts;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(`
    INSERT INTO ai_debug_attempts (game_id, error_signature, attempts, given_up, last_attempt_at)
    VALUES (@gameId, @errorSignature, @attempts, @givenUp, @lastAttemptAt)
    ON CONFLICT(game_id, error_signature) DO UPDATE SET
      attempts        = excluded.attempts,
      given_up        = excluded.given_up,
      last_attempt_at = excluded.last_attempt_at
  `).run({
    gameId,
    errorSignature,
    attempts: JSON.stringify(attempts),
    givenUp: givenUp ? 1 : 0,
    lastAttemptAt: now
  });
  return { gameId, errorSignature, attempts, givenUp, lastAttemptAt: now };
}
function resetAiAttemptsForGame(gameId) {
  db.prepare("DELETE FROM ai_debug_attempts WHERE game_id = ?").run(gameId);
}
function getAiProviderCredential(providerId) {
  const row = db.prepare("SELECT * FROM ai_provider_credentials WHERE provider_id = ?").get(providerId);
  if (!row) return void 0;
  return {
    providerId: row.provider_id,
    enabled: row.enabled === 1,
    apiKey: row.api_key ?? void 0,
    baseUrl: row.base_url ?? void 0,
    model: row.model ?? void 0,
    priority: row.priority,
    tokenBudget: row.token_budget ?? void 0,
    budgetWarnedMonth: row.budget_warned_month ?? void 0
  };
}
function getAllAiProviderCredentials() {
  return db.prepare("SELECT * FROM ai_provider_credentials ORDER BY priority ASC").all().map((row) => ({
    providerId: row.provider_id,
    enabled: row.enabled === 1,
    apiKey: row.api_key ?? void 0,
    baseUrl: row.base_url ?? void 0,
    model: row.model ?? void 0,
    priority: row.priority,
    tokenBudget: row.token_budget ?? void 0,
    budgetWarnedMonth: row.budget_warned_month ?? void 0
  }));
}
function upsertAiProviderCredential(cred) {
  if (cred.enabled) {
    db.prepare("UPDATE ai_provider_credentials SET enabled = 0 WHERE provider_id != ?").run(cred.providerId);
  }
  db.prepare(`
    INSERT INTO ai_provider_credentials (provider_id, enabled, api_key, base_url, model, priority, token_budget, budget_warned_month)
    VALUES (@providerId, @enabled, @apiKey, @baseUrl, @model, @priority, @tokenBudget, @budgetWarnedMonth)
    ON CONFLICT(provider_id) DO UPDATE SET
      enabled  = excluded.enabled,
      api_key  = excluded.api_key,
      base_url = excluded.base_url,
      model    = excluded.model,
      priority = excluded.priority,
      token_budget        = excluded.token_budget,
      budget_warned_month = excluded.budget_warned_month
  `).run({
    providerId: cred.providerId,
    enabled: cred.enabled ? 1 : 0,
    apiKey: cred.apiKey ?? null,
    baseUrl: cred.baseUrl ?? null,
    model: cred.model ?? null,
    priority: cred.priority,
    tokenBudget: cred.tokenBudget ?? null,
    budgetWarnedMonth: cred.budgetWarnedMonth ?? null
  });
}
function markAiBudgetWarned(providerId, month) {
  db.prepare("UPDATE ai_provider_credentials SET budget_warned_month = ? WHERE provider_id = ?").run(month, providerId);
}
function getCloudBackupCredential(providerId) {
  const row = db.prepare("SELECT * FROM cloud_backup_credentials WHERE provider_id = ?").get(providerId);
  if (!row) return void 0;
  return {
    providerId: row.provider_id,
    enabled: row.enabled === 1,
    clientId: row.client_id ?? void 0,
    clientSecret: row.client_secret ?? void 0,
    lastBackupAt: row.last_backup_at ?? void 0
  };
}
function getAllCloudBackupCredentials() {
  return db.prepare("SELECT * FROM cloud_backup_credentials").all().map((row) => ({
    providerId: row.provider_id,
    enabled: row.enabled === 1,
    clientId: row.client_id ?? void 0,
    clientSecret: row.client_secret ?? void 0,
    lastBackupAt: row.last_backup_at ?? void 0
  }));
}
function upsertCloudBackupCredential(cred) {
  if (cred.enabled) {
    db.prepare("UPDATE cloud_backup_credentials SET enabled = 0 WHERE provider_id != ?").run(cred.providerId);
  }
  db.prepare(`
    INSERT INTO cloud_backup_credentials (provider_id, enabled, client_id, client_secret, last_backup_at)
    VALUES (@providerId, @enabled, @clientId, @clientSecret, @lastBackupAt)
    ON CONFLICT(provider_id) DO UPDATE SET
      enabled         = excluded.enabled,
      client_id       = excluded.client_id,
      client_secret   = excluded.client_secret,
      last_backup_at  = excluded.last_backup_at
  `).run({
    providerId: cred.providerId,
    enabled: cred.enabled ? 1 : 0,
    clientId: cred.clientId ?? null,
    clientSecret: cred.clientSecret ?? null,
    lastBackupAt: cred.lastBackupAt ?? null
  });
}
function exportCompatProfilesRaw() {
  return db.prepare("SELECT * FROM compat_profiles").all();
}
function importCompatProfilesRaw(rows) {
  let imported = 0;
  let skipped = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const cols = Object.keys(row);
    if (cols.length === 0) {
      skipped++;
      continue;
    }
    const colList = cols.join(", ");
    const placeholders = cols.map((c) => `@${c}`).join(", ");
    try {
      db.prepare(`INSERT OR REPLACE INTO compat_profiles (${colList}) VALUES (${placeholders})`).run(row);
      imported++;
    } catch (err) {
      writeLog("warning", `[CloudBackup] Riga compat_profiles saltata (${row.game_id ?? "?"}): ${err}`);
      skipped++;
    }
  }
  return { imported, skipped };
}
function deleteAiProviderCredential(providerId) {
  db.prepare("DELETE FROM ai_provider_credentials WHERE provider_id = ?").run(providerId);
}
function recordAiUsage(providerId, inputTokens, outputTokens) {
  db.prepare(`
    INSERT INTO ai_usage_log (provider_id, input_tokens, output_tokens, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(providerId, inputTokens, outputTokens);
}
function getAiUsageThisMonth() {
  const now = /* @__PURE__ */ new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const rows = db.prepare(`
    SELECT provider_id, SUM(input_tokens + output_tokens) as total
    FROM ai_usage_log
    WHERE created_at >= ?
    GROUP BY provider_id
  `).all(monthStart);
  const byProvider = {};
  let totalTokens = 0;
  for (const row of rows) {
    byProvider[row.provider_id] = row.total;
    totalTokens += row.total;
  }
  return { totalTokens, byProvider };
}
function rowToSharedLauncherPrefix(row) {
  return {
    launcherId: row.launcher_id,
    prefixPath: row.prefix_path,
    launcherExe: row.launcher_exe ?? void 0,
    bootstrappedAt: row.bootstrapped_at ?? void 0,
    runner: row.runner
  };
}
function getSharedLauncherPrefix(launcherId) {
  const row = db.prepare("SELECT * FROM shared_launcher_prefixes WHERE launcher_id = ?").get(launcherId);
  return row ? rowToSharedLauncherPrefix(row) : void 0;
}
function upsertSharedLauncherPrefix(row) {
  db.prepare(`
    INSERT INTO shared_launcher_prefixes (launcher_id, prefix_path, launcher_exe, bootstrapped_at, runner)
    VALUES (@launcherId, @prefixPath, @launcherExe, @bootstrappedAt, @runner)
    ON CONFLICT(launcher_id) DO UPDATE SET
      prefix_path     = excluded.prefix_path,
      launcher_exe    = excluded.launcher_exe,
      bootstrapped_at = excluded.bootstrapped_at,
      runner          = excluded.runner
  `).run({
    launcherId: row.launcherId,
    prefixPath: row.prefixPath,
    launcherExe: row.launcherExe ?? null,
    bootstrappedAt: row.bootstrappedAt ?? null,
    runner: row.runner
  });
}
function deleteSharedLauncherPrefix(launcherId) {
  db.prepare("DELETE FROM shared_launcher_prefixes WHERE launcher_id = ?").run(launcherId);
}
function countInstalledGamesForLauncher(launcherId, excludeGameId) {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM games
    WHERE requires_launcher = ? AND is_installed = 1 AND id != ?
  `).get(launcherId, excludeGameId ?? "");
  return row.count;
}
var import_better_sqlite3, import_fs2, import_path3, DB_PATH, TOK_PATH, db, existingCols, aiProviderCols, compatCols, brokenStatusCount, stmtUpsertGame, upsertGames, db_default;
var init_db = __esm({
  "src/backend/db.ts"() {
    "use strict";
    import_better_sqlite3 = __toESM(require("better-sqlite3"), 1);
    import_fs2 = require("fs");
    import_path3 = __toESM(require("path"), 1);
    init_paths();
    init_logger();
    DB_PATH = import_path3.default.join(DATA_DIR, "x-launcher.db");
    TOK_PATH = import_path3.default.join(DATA_DIR, "tokens.json");
    (0, import_fs2.mkdirSync)(DATA_DIR, { recursive: true });
    db = new import_better_sqlite3.default(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
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
    -- Override manuale del titolo di ricerca per lo scraping metadati \u2014
    -- vedi commento esteso su Game.scrapeTitle in types.ts. NULL = usa
    -- title normale, nessun override.
    scrape_title     TEXT,
    -- v1.0.0 \u2014 chiave canonica di sistema per Classic Console (es.
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
    -- v1.1.68 \u2014 cronologia "ultimi giochi lanciati" per il menu
    -- contestuale della tray, vedi commento esteso nella migrazione qui
    -- sotto per un DB gi\xE0 esistente.
    last_launched_at      TEXT,
    -- v2.0.41-dev.33 \u2014 richiesta utente: "carta d'identit\xE0" del gioco.
    -- WM_CLASS della sua finestra reale (non il titolo, che spesso
    -- cambia durante il gioco \u2014 es. "Livello 3 - Death Stranding") \u2014
    -- appreso dal PRIMO lancio riuscito (euristica esistente su PID/
    -- nome, invariata) e salvato qui per ogni lancio SUCCESSIVO: da
    -- quel momento la si cerca in modo diretto e inequivocabile
    -- (wmctrl -lx, stesso comando gi\xE0 in uso per Steam Big Picture,
    -- server.ts) invece di indovinare pattern di nomi processo \u2014 la
    -- fonte di quasi tutti i bug della saga Gamescope. NULL finch\xE9 non
    -- ancora appreso.
    window_class          TEXT,
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS compat_profiles (
    game_id   TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    fsr       INTEGER NOT NULL DEFAULT 0,
    game_mode INTEGER NOT NULL DEFAULT 0,
    -- v1.1.104-dev.1: da booleano a 3 stati (0=off, 1=compatta, 2=completa)
    -- \u2014 colonna gi\xE0 INTEGER, nessuna migrazione necessaria, 1 esistente
    -- resta "compatta" (comportamento invariato).
    mangohud  INTEGER NOT NULL DEFAULT 0,
    eac       INTEGER NOT NULL DEFAULT 0,
    battleye  INTEGER NOT NULL DEFAULT 0,
    custom_env TEXT,
    winetricks_verbs TEXT,
    disable_wine_sync INTEGER NOT NULL DEFAULT 0,
    use_known_fixes INTEGER NOT NULL DEFAULT 0,
    known_fixes_notes TEXT,
    -- v1.5.20-dev.2 \u2014 switch "Umu-launcher" (Compatibility Layer). Bug reale
    -- v1.5.20-dev.1: il campo era stato aggiunto solo in types.ts/App.tsx,
    -- MAI qui \u2014 upsertCompatProfile/getCompatProfile hanno una lista di
    -- colonne fissa, un campo assente dalla query non genera errore, viene
    -- solo ignorato in silenzio (nessun crash che lo segnalasse). Risultato:
    -- lo switch sembrava funzionare in overlay ma non veniva mai scritto su
    -- disco, azzerato alla chiusura. Vedi CHANGELOG.md.
    umu_run INTEGER NOT NULL DEFAULT 0,
    -- v1.5.20-dev.32 \u2014 stessa identica lezione di umu_run appena sopra,
    -- applicata subito: colonna aggiunta QUI, non solo in types.ts,
    -- proprio per non ripetere quel bug.
    bypass_store_auth_chain INTEGER NOT NULL DEFAULT 0,
    -- v2.0.41-dev.24 \u2014 switch overlay "Gamescope" (per-gioco, avvolge il
    -- comando reale con gamescope -- ...), stessa identica lezione di
    -- umu_run/bypass_store_auth_chain sopra: colonna aggiunta QUI subito,
    -- non solo in types.ts, per non ripetere quel bug una terza volta.
    gamescope INTEGER NOT NULL DEFAULT 0
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

  -- v0.99.90 \u2014 Step 15d (AI Advisor): tracker dei tentativi AI, limite
  -- MAX_AI_ATTEMPTS (3, vedi aiProviders/base.ts) per combinazione
  -- gioco+errore, con lo storico dei tentativi falliti (per non
  -- riproporre la stessa ipotesi al tentativo successivo). Chiave
  -- composta game_id+error_signature: lo stesso titolo pu\xF2 avere due
  -- problemi diversi in momenti diversi, ognuno col proprio contatore
  -- indipendente. attempts \xE8 JSON (array di PastAttempt).
  CREATE TABLE IF NOT EXISTS ai_debug_attempts (
    game_id         TEXT    NOT NULL,
    error_signature TEXT    NOT NULL,
    attempts        TEXT    NOT NULL DEFAULT '[]',
    given_up        INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    PRIMARY KEY (game_id, error_signature)
  );

  -- v0.99.90 \u2014 Step 15d: credenziali/configurazione per provider AI.
  -- ATTENZIONE, decisione esplicita da segnalare: api_key qui \xE8 salvata
  -- in CHIARO, non cifrata \u2014 stessa convenzione gi\xE0 in uso in tutto il
  -- resto di questo DB (nessun altro campo sensibile del progetto \xE8
  -- cifrato) e stesso modello di minaccia (macchina locale mono-utente).
  -- Se in futuro cambia il contesto d'uso (macchina condivisa, multi-
  -- utente), va rivista una cifratura a riposo prima di fidarsi di
  -- questa tabella. priority determina l'ordine della catena di
  -- fallback silenzioso tra i provider abilitati (numero pi\xF9 basso =
  -- provato prima) \u2014 il "provider di default" \xE8 semplicemente quello
  -- con priority pi\xF9 bassa tra quelli enabled+configurati.
  CREATE TABLE IF NOT EXISTS ai_provider_credentials (
    provider_id TEXT    PRIMARY KEY,
    enabled     INTEGER NOT NULL DEFAULT 0,
    api_key     TEXT,
    base_url    TEXT,
    model       TEXT,
    priority    INTEGER NOT NULL DEFAULT 999,
    -- v1.1.108-dev.1: budget token mensile PER PROVIDER (richiesto
    -- dall'utente, sostituisce l'unico numero globale di prima). NULL per
    -- i provider locali (Ollama \u2014 nessun vincolo di consumo, mostrato come
    -- \u221E in UI). budget_warned_month traccia l'ultimo mese in cui \xE8 gi\xE0
    -- stata inviata la notifica di soglia 80% per questo provider, per
    -- non ripeterla a ogni chiamata dopo la soglia.
    token_budget         INTEGER,
    budget_warned_month  TEXT
  );

  -- v1.1.120-dev.1 \u2014 Step: Cloud Backup. Stesso pattern di
  -- ai_provider_credentials sopra: un solo provider attivo alla volta
  -- (mutua esclusivit\xE0 applicata in upsertCloudBackupCredential, stesso
  -- meccanismo di upsertAiProviderCredential). client_id/client_secret
  -- sono le credenziali OAuth "Desktop app" che l'utente crea sulla
  -- console del proprio provider (Google Cloud Console per Drive) \u2014 mai
  -- condivise/hardcoded nel codice, ogni utente usa le proprie. Il
  -- refresh token OAuth vive invece in tokens.json (permessi 600), non
  -- qui \u2014 stesso principio di separazione gi\xE0 in uso per gog/epic/ecc.
  CREATE TABLE IF NOT EXISTS cloud_backup_credentials (
    provider_id     TEXT    PRIMARY KEY,
    enabled         INTEGER NOT NULL DEFAULT 0,
    client_id       TEXT,
    client_secret   TEXT,
    last_backup_at  TEXT
  );

  -- v0.99.90 \u2014 Step 15d: log di utilizzo token, una riga per chiamata a
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

  -- Step 19d \u2014 prefix Proton CONDIVISO per launcher di terze parti
  -- (Ubisoft Connect/EA App/Battle.net/Rockstar), riusato da tutti i
  -- giochi che dichiarano games.requires_launcher = questo id, invece di
  -- un prefix isolato per-gioco. Vedi sharedLauncherManager.ts. Runner
  -- sempre Proton/GE-Proton per decisione esplicita dell'utente (supporto
  -- anticheat), mai Wine \u2014 nessun campo runner_family: sarebbe sempre
  -- 'proton', quindi solo rumore.
  CREATE TABLE IF NOT EXISTS shared_launcher_prefixes (
    launcher_id     TEXT PRIMARY KEY,
    prefix_path     TEXT NOT NULL,
    launcher_exe    TEXT,
    bootstrapped_at TEXT,
    runner          TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
    existingCols = db.prepare("PRAGMA table_info(games)").all().map((r) => r.name);
    if (!existingCols.includes("prefix_path")) {
      db.exec("ALTER TABLE games ADD COLUMN prefix_path TEXT");
    }
    if (!existingCols.includes("launch_args")) {
      db.exec("ALTER TABLE games ADD COLUMN launch_args TEXT");
    }
    if (!existingCols.includes("launch_cwd")) {
      db.exec("ALTER TABLE games ADD COLUMN launch_cwd TEXT");
    }
    if (!existingCols.includes("verified")) {
      db.exec("ALTER TABLE games ADD COLUMN verified INTEGER NOT NULL DEFAULT 0");
    }
    if (!existingCols.includes("verified_at")) {
      db.exec("ALTER TABLE games ADD COLUMN verified_at TEXT");
    }
    if (!existingCols.includes("verification_method")) {
      db.exec("ALTER TABLE games ADD COLUMN verification_method TEXT");
    }
    if (!existingCols.includes("system")) {
      db.exec("ALTER TABLE games ADD COLUMN system TEXT");
    }
    if (!existingCols.includes("last_launched_at")) {
      db.exec("ALTER TABLE games ADD COLUMN last_launched_at TEXT");
    }
    if (!existingCols.includes("scrape_title")) {
      db.exec("ALTER TABLE games ADD COLUMN scrape_title TEXT");
    }
    if (!existingCols.includes("predicted_size_bytes")) {
      db.exec("ALTER TABLE games ADD COLUMN predicted_size_bytes INTEGER");
    }
    if (!existingCols.includes("window_class")) {
      db.exec("ALTER TABLE games ADD COLUMN window_class TEXT");
    }
    if (!existingCols.includes("requires_launcher")) {
      db.exec("ALTER TABLE games ADD COLUMN requires_launcher TEXT");
    }
    if (!existingCols.includes("store_install_unavailable")) {
      db.exec("ALTER TABLE games ADD COLUMN store_install_unavailable INTEGER NOT NULL DEFAULT 0");
    }
    if (!existingCols.includes("remaster_enabled")) {
      db.exec("ALTER TABLE games ADD COLUMN remaster_enabled INTEGER NOT NULL DEFAULT 0");
    }
    aiProviderCols = db.prepare("PRAGMA table_info(ai_provider_credentials)").all().map((r) => r.name);
    if (!aiProviderCols.includes("token_budget")) {
      db.exec("ALTER TABLE ai_provider_credentials ADD COLUMN token_budget INTEGER");
    }
    if (!aiProviderCols.includes("budget_warned_month")) {
      db.exec("ALTER TABLE ai_provider_credentials ADD COLUMN budget_warned_month TEXT");
    }
    compatCols = db.prepare("PRAGMA table_info(compat_profiles)").all().map((r) => r.name);
    if (!compatCols.includes("winetricks_verbs")) {
      db.exec("ALTER TABLE compat_profiles ADD COLUMN winetricks_verbs TEXT");
    }
    if (!compatCols.includes("eac")) {
      db.exec("ALTER TABLE compat_profiles ADD COLUMN eac INTEGER NOT NULL DEFAULT 0");
    }
    if (!compatCols.includes("battleye")) {
      db.exec("ALTER TABLE compat_profiles ADD COLUMN battleye INTEGER NOT NULL DEFAULT 0");
    }
    if (!compatCols.includes("disable_wine_sync")) {
      db.exec("ALTER TABLE compat_profiles ADD COLUMN disable_wine_sync INTEGER NOT NULL DEFAULT 0");
    }
    if (!compatCols.includes("use_known_fixes")) {
      db.exec("ALTER TABLE compat_profiles ADD COLUMN use_known_fixes INTEGER NOT NULL DEFAULT 0");
    }
    if (!compatCols.includes("known_fixes_notes")) {
      db.exec("ALTER TABLE compat_profiles ADD COLUMN known_fixes_notes TEXT");
    }
    if (!compatCols.includes("umu_run")) {
      db.exec("ALTER TABLE compat_profiles ADD COLUMN umu_run INTEGER NOT NULL DEFAULT 0");
    }
    if (!compatCols.includes("bypass_store_auth_chain")) {
      db.exec("ALTER TABLE compat_profiles ADD COLUMN bypass_store_auth_chain INTEGER NOT NULL DEFAULT 0");
    }
    if (!compatCols.includes("gamescope")) {
      db.exec("ALTER TABLE compat_profiles ADD COLUMN gamescope INTEGER NOT NULL DEFAULT 0");
    }
    brokenStatusCount = db.prepare(
      "SELECT COUNT(*) as n FROM games WHERE is_installed = 1 AND status = 'Not Installed'"
    ).get()?.n ?? 0;
    if (brokenStatusCount > 0) {
      db.exec(
        "UPDATE games SET status = 'Ready to Launch' WHERE is_installed = 1 AND status = 'Not Installed'"
      );
      console.log(`[DB] Status migration: fixed ${brokenStatusCount} installed games with status='Not Installed' \u2192 'Ready to Launch'`);
    }
    stmtUpsertGame = db.prepare(`
  INSERT INTO games (
    id, title, store, runner, is_installed, play_time_hours,
    cover_image, preview_image, description, tags, genres, categories,
    rating, installed_at, release_date, status, trailer_url,
    executable_path, steam_app_id, dosbox_conf, libretro_core, scummvm_id,
    scrape_title,
    system,
    hltb_main, hltb_completionist,
    achievements_unlocked, achievements_total,
    updated_at
  ) VALUES (
    @id, @title, @store, @runner, @isInstalled, @playTimeHours,
    @coverImage, @previewImage, @description, @tags, @genres, @categories,
    @rating, @installedAt, @releaseDate, @status, @trailerUrl,
    @executablePath, @steamAppId, @dosboxConf, @libretroCore, @scummvmId,
    @scrapeTitle,
    @system,
    @hltbMain, @hltbCompletionist,
    @achievementsUnlocked, @achievementsTotal,
    datetime('now')
  )
  ON CONFLICT(id) DO UPDATE SET
    -- Bug confermato dall'utente: il titolo corretto da IGDB dopo un
    -- override scrapeTitle (vedi metadataManager.ts, "richiede
    -- scrapeTitle" nel commento su enriched.title) veniva scritto nel DB,
    -- ma alla sync libreria SUCCESSIVA (che parte anche da sola ad ogni
    -- avvio del daemon, non solo su richiesta esplicita) il plugin dello
    -- store \u2014 classicPlugin.ts per i ROM MAME, ma la stessa cosa vale per
    -- qualunque altro plugin \u2014 richiama comunque titleFromFilename() (o
    -- l'equivalente) e passa di nuovo il titolo grezzo originale in
    -- upsertGames(), che qui veniva scritto incondizionatamente. Se
    -- scrape_title \xE8 impostato (l'utente ha esplicitamente rivendicato un
    -- override per questo gioco), preserva il title gi\xE0 in DB \u2014 quello
    -- corretto scritto dall'arricchimento \u2014 invece di accettare quello
    -- "fresco" della sync, che \xE8 sempre il nome grezzo non corretto per
    -- definizione (altrimenti l'utente non avrebbe mai impostato
    -- scrape_title). Se scrape_title \xE8 NULL, comportamento identico a
    -- prima: il titolo segue sempre la sync.
    title            = CASE WHEN games.scrape_title IS NOT NULL THEN games.title ELSE excluded.title END,
    store            = excluded.store,
    is_installed     = excluded.is_installed,
    -- Bug confermato dall'utente: play_time_hours accumulato da
    -- db.addPlayTime() (sessioni di gioco reali) veniva sovrascritto alla
    -- sync di libreria SUCCESSIVA (periodica ogni 5 minuti, o on-demand)
    -- perch\xE9 GOG/Epic/Classic Console riportano SEMPRE 0 (hardcoded nei
    -- rispettivi plugin \u2014 nessuno dei tre ha una fonte reale) \u2014 "il
    -- tempo di gioco sembra funzionare, ma il dato non \xE8 persistente".
    -- Solo Steam calcola un valore reale dalla propria Web API, che deve
    -- continuare a vincere sempre (a differenza di title/scrape_title,
    -- qui NON serve un bypass diretto separato: un valore reale non \xE8
    -- mai esattamente 0, quindi "accetta il nuovo valore solo se >0,
    -- altrimenti mantieni quello gi\xE0 in DB" distingue correttamente i
    -- due casi con una sola condizione, senza dover sapere da quale
    -- store viene la sync).
    play_time_hours  = CASE WHEN excluded.play_time_hours > 0 THEN excluded.play_time_hours ELSE games.play_time_hours END,
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
    -- v0.99.35 \u2014 bug confermato (foto: card Aragami mostra NOT INSTALLED
    -- mentre pannello dettaglio mostra INSTALLED correttamente): il plugin
    -- GOG imposta sempre status='Not Installed' per tutti i titoli del
    -- catalogo senza verificare lo stato reale sul DB \u2014 e upsertGame
    -- sovrascriveva incondizionatamente. Quando il sync periodico girava
    -- dopo un'installazione completata, ripristinava lo status a
    -- 'Not Installed' anche se updateGameStatus aveva appena scritto
    -- 'Ready to Launch'. Proteggiamo status nello stesso modo in cui gi\xE0
    -- proteggiamo executable_path (non sovrascritto da upsert): se il DB
    -- ha gi\xE0 'Ready to Launch' o 'Playing', lo manteniamo.
    -- Epic non ha questo problema (plugin calcola correttamente
    -- isInstalled ? 'Ready to Launch' : 'Not Installed') \u2014 il fix qui
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
    -- v1.0.0 \u2014 a differenza di libretro_core (scelta dell'utente via gli
    -- switch nell'overlay), system \xE8 puramente derivato dalla posizione
    -- del file ROM sul disco \u2014 nessuna UI lo imposta manualmente, quindi
    -- va sempre aggiornato dall'ultima scansione senza rischio di
    -- cancellare una preferenza utente (non esiste).
    system           = excluded.system,
    updated_at       = datetime('now')
  -- NON sovrascriviamo executable_path, steam_app_id, dosbox_conf,
  -- libretro_core, scummvm_id, scrape_title: sono configurati manualmente
  -- dall'utente (Step 4; scrape_title dalla richiesta MAME/override
  -- scraping metadati)
  --
  -- v0.99.38 \u2014 bug confermato (screenshot: switch runner nell'overlay
  -- tornato su Wine dopo aver cambiato a Proton-GE 11.1 per SOMA, che con
  -- quel runner si \xE8 dimostrato funzionante \u2014 con Wine crashava). Causa:
  -- 'runner = excluded.runner' era nella SET clause sopra, quindi ad ogni
  -- sync della libreria (il plugin GOG restituisce sempre 'Wine-Lutris'
  -- come default per ogni titolo, vedi gogPlugin.ts) il valore scelto
  -- manualmente dall'utente veniva silenziosamente sovrascritto col
  -- default. Stessa classe di bug gi\xE0 risolta per status/executable_path
  -- \u2014 runner andava protetto allo stesso modo (qui rimosso del tutto
  -- dalla SET clause, come executable_path, non con una CASE come
  -- status: non esiste uno scenario in cui il default del plugin debba
  -- vincere su un valore gi\xE0 presente in DB).
`);
    upsertGames = db.transaction((games) => {
      for (const g of games) upsertGame(g);
    });
    db.prepare(`
  CREATE TABLE IF NOT EXISTS plugin_states (
    id      TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1
  )
`).run();
    db_default = db;
  }
});

// src/backend/activeDisplay.ts
function setActiveDisplay(display, waylandDisplay, kind, resolution) {
  activeDisplay = display && display.trim() !== "" ? display.trim() : void 0;
  activeWaylandDisplay = waylandDisplay && waylandDisplay.trim() !== "" ? waylandDisplay.trim() : void 0;
  if (kind === "kiosk" || kind === "desktop") {
    activeSessionKind = kind;
  }
  activeGamescopeResolution = kind === "kiosk" && resolution ? resolution : void 0;
}
function getActiveSessionInfo() {
  return { kind: activeSessionKind, ...activeGamescopeResolution ? { resolution: activeGamescopeResolution } : {} };
}
function getActiveDisplayEnv() {
  const waylandDisplay = activeWaylandDisplay ?? process.env.WAYLAND_DISPLAY;
  return {
    DISPLAY: activeDisplay ?? process.env.DISPLAY ?? ":0",
    ...waylandDisplay ? { WAYLAND_DISPLAY: waylandDisplay } : {}
  };
}
var activeDisplay, activeWaylandDisplay, activeSessionKind, activeGamescopeResolution;
var init_activeDisplay = __esm({
  "src/backend/activeDisplay.ts"() {
    "use strict";
    activeSessionKind = "desktop";
  }
});

// src/backend/knowledgeBase.ts
function localizedSolution(entry, language) {
  return language === "en" && entry.solution_en ? entry.solution_en : entry.solution;
}
function loadSeed(store) {
  const candidates = [
    import_path4.default.join(process.cwd(), "kb-seed.json"),
    import_path4.default.join(process.cwd(), "src", "backend", "kb-seed.json"),
    // v0.99.35 — import.meta.dirname non esiste in output CommonJS
    // (dist/server.cjs): esbuild lo svuota silenziosamente a build-time,
    // producendo path.join(undefined, ...) a runtime. __dirname è
    // l'equivalente nativo CJS, sempre disponibile, nessun warning.
    // Bug latente finora innocuo solo perché uno dei due candidati sopra
    // trovava sempre il file per chi lanciava da dentro la cartella
    // progetto — si sarebbe manifestato lanciando da altrove (es.
    // xdash.service con WorkingDirectory=/opt/x-launcher) se kb-seed.json
    // non fosse stato copiato lì durante l'installazione.
    import_path4.default.join(__dirname, "kb-seed.json")
  ];
  let seedPath = null;
  for (const p of candidates) {
    if ((0, import_fs3.existsSync)(p)) {
      seedPath = p;
      break;
    }
  }
  if (!seedPath) return;
  try {
    const raw = JSON.parse((0, import_fs3.readFileSync)(seedPath, "utf-8"));
    for (const entry of raw) {
      if (!store.getById(entry.id)) {
        store.upsert({
          ...entry,
          source: "seed",
          // Step 19b (v1.1.58) — undefined non è accettato dal driver
          // SQLite come parametro nominato: se il seed non ha ancora
          // solution_en per questa voce, normalizza esplicitamente a null.
          solution_en: entry.solution_en ?? null,
          // SQLite accetta solo stringhe — serializza action_params se è un oggetto
          action_params: typeof entry.action_params === "string" ? entry.action_params : JSON.stringify(entry.action_params ?? {})
        });
      }
    }
  } catch (err) {
    console.error("[KB] Seed loading error:", err);
  }
}
var import_better_sqlite32, import_path4, import_fs3, KnowledgeStore, KBMatcher, KnowledgeBase, knowledgeBase;
var init_knowledgeBase = __esm({
  "src/backend/knowledgeBase.ts"() {
    "use strict";
    import_better_sqlite32 = __toESM(require("better-sqlite3"), 1);
    import_path4 = __toESM(require("path"), 1);
    import_fs3 = require("fs");
    init_paths();
    KnowledgeStore = class {
      db;
      constructor() {
        (0, import_fs3.mkdirSync)(DATA_DIR, { recursive: true });
        this.db = new import_better_sqlite32.default(import_path4.default.join(DATA_DIR, "x-launcher.db"));
        this.db.pragma("journal_mode = WAL");
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
        const kbCols = this.db.prepare("PRAGMA table_info(knowledge_base)").all().map((r) => r.name);
        if (!kbCols.includes("solution_en")) {
          this.db.exec("ALTER TABLE knowledge_base ADD COLUMN solution_en TEXT");
        }
      }
      upsert(entry) {
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
      getAll() {
        return this.db.prepare(`SELECT * FROM knowledge_base ORDER BY score DESC, hit_count DESC`).all();
      }
      getById(id) {
        return this.db.prepare(`SELECT * FROM knowledge_base WHERE id = ?`).get(id) ?? null;
      }
      updateHitCount(id) {
        this.db.prepare(`
      UPDATE knowledge_base SET hit_count = hit_count + 1, last_seen = datetime('now') WHERE id = ?
    `).run(id);
      }
      updateScore(id, delta) {
        this.db.prepare(`
      UPDATE knowledge_base
      SET score = MAX(0.05, MIN(1.0, score + ?))
      WHERE id = ?
    `).run(delta, id);
      }
      delete(id) {
        this.db.prepare(`DELETE FROM knowledge_base WHERE id = ?`).run(id);
      }
      count() {
        return this.db.prepare(`SELECT COUNT(*) as n FROM knowledge_base`).get().n;
      }
      countBySource() {
        const rows = this.db.prepare(
          `SELECT source, COUNT(*) as n FROM knowledge_base GROUP BY source`
        ).all();
        const result = { seed: 0, "ai-writeback": 0, manual: 0 };
        rows.forEach((r) => {
          result[r.source] = r.n;
        });
        return result;
      }
    };
    KBMatcher = class {
      /** Soglia minima di confidenza (0.0 – 1.0). Configurabile da Settings. */
      threshold = 0.6;
      /**
       * Cerca la soluzione migliore per il testo di errore fornito.
       * Algoritmo:
       *   1. Cerca corrispondenza regex/stringa esatta (score 1.0)
       *   2. Calcola similarità per sottostringa parziale
       *   3. Ritorna la voce con score > threshold o null
       */
      match(errorText, entries) {
        if (!errorText || entries.length === 0) return null;
        const errorLower = errorText.toLowerCase();
        let best = null;
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
      matchAll(errorText, entries) {
        if (!errorText || entries.length === 0) return [];
        const errorLower = errorText.toLowerCase();
        return entries.map((entry) => ({ entry, matchScore: this.computeScore(errorLower, entry) })).filter((m) => m.matchScore >= this.threshold).sort((a, b) => b.matchScore - a.matchScore);
      }
      computeScore(errorLower, entry) {
        const pattern = entry.pattern.toLowerCase();
        try {
          const re = new RegExp(entry.pattern, "i");
          if (re.test(errorLower)) {
            const confBonus = entry.confidence === "high" ? 0.2 : entry.confidence === "medium" ? 0.1 : 0;
            return Math.min(1, 0.8 + confBonus) * entry.score;
          }
        } catch {
        }
        if (errorLower.includes(pattern)) {
          const confBonus = entry.confidence === "high" ? 0.1 : 0;
          return Math.min(1, 0.75 + confBonus) * entry.score;
        }
        const patternWords = pattern.split(/\s+/).filter((w) => w.length > 3);
        if (patternWords.length > 0) {
          const matchedWords = patternWords.filter((w) => errorLower.includes(w));
          const wordRatio = matchedWords.length / patternWords.length;
          if (wordRatio >= 0.6) {
            return wordRatio * 0.65 * entry.score;
          }
        }
        return 0;
      }
    };
    KnowledgeBase = class {
      store = new KnowledgeStore();
      matcher = new KBMatcher();
      constructor() {
        loadSeed(this.store);
      }
      // ── Lookup ────────────────────────────────────────────────────────────────
      /** Cerca il match migliore. Aggiorna hit_count se trovato. */
      lookup(errorText) {
        const entries = this.store.getAll();
        const match = this.matcher.match(errorText, entries);
        if (match) {
          this.store.updateHitCount(match.entry.id);
        }
        return match;
      }
      lookupAll(errorText) {
        return this.matcher.matchAll(errorText, this.store.getAll());
      }
      // ── Writeback AI ──────────────────────────────────────────────────────────
      /** Chiamato quando l'utente conferma che una soluzione AI ha funzionato */
      writebackResolved(params) {
        if (params.existingId) {
          this.store.updateScore(params.existingId, 0.1);
          this.store.updateHitCount(params.existingId);
          return;
        }
        const id = `kb-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        this.store.upsert({
          id,
          pattern: params.pattern,
          solution: params.solution,
          // Un suggerimento AI arriva in una sola lingua (quella impostata al
          // momento della chiamata, vedi Step successivo sul prompt) — nessuna
          // seconda lingua da salvare qui, a differenza delle voci di seed.
          solution_en: null,
          action_type: params.actionType,
          action_params: JSON.stringify(params.actionParams),
          source: "ai-writeback",
          confidence: params.confidence,
          hit_count: 1,
          score: 0.7,
          last_seen: (/* @__PURE__ */ new Date()).toISOString(),
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      /** Chiamato quando l'utente segnala che una soluzione NON ha funzionato */
      writebackFailed(id) {
        this.store.updateScore(id, -0.15);
      }
      // ── Gestione entries ──────────────────────────────────────────────────────
      getAll() {
        return this.store.getAll();
      }
      /**
       * v1.1.121-dev.1 — Cloud Backup: importa in blocco voci esportate da un
       * backup precedente. Riusa lo stesso upsert() già collaudato dello
       * store interno (INSERT ... ON CONFLICT DO UPDATE), una entry alla
       * volta con try/catch — una riga malformata/incompatibile viene
       * saltata invece di far fallire l'intero ripristino.
       */
      importEntries(entries) {
        let imported = 0;
        for (const e of entries) {
          try {
            this.store.upsert(e);
            imported++;
          } catch {
          }
        }
        return imported;
      }
      delete(id) {
        this.store.delete(id);
      }
      reloadSeed() {
        loadSeed(this.store);
      }
      resetToSeed() {
        const all = this.store.getAll();
        for (const e of all) {
          if (e.source !== "seed") this.store.delete(e.id);
        }
        loadSeed(this.store);
      }
      stats() {
        return {
          total: this.store.count(),
          bySource: this.store.countBySource(),
          threshold: this.matcher.threshold
        };
      }
      setThreshold(value) {
        this.matcher.threshold = Math.max(0.1, Math.min(1, value));
      }
    };
    knowledgeBase = new KnowledgeBase();
  }
});

// src/backend/appConfig.ts
function nextGamescopeResolution(current) {
  const idx = GAMESCOPE_RESOLUTION_ORDER.indexOf(current);
  return GAMESCOPE_RESOLUTION_ORDER[(idx + 1) % GAMESCOPE_RESOLUTION_ORDER.length];
}
function parseConfFile(raw) {
  const out = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key === "fullscreen") out.fullscreen = val === "true";
    if (key === "displayMode" && (val === "kiosk" || val === "window" || val === "borderless")) {
      out.displayMode = val;
    }
    if (key === "language" && (val === "it" || val === "en")) {
      out.language = val;
    }
    if (key === "avatarUrl") {
      out.avatarUrl = val === "" ? null : val;
    }
    if (key === "gamescopeResolution" && (val === "HD" || val === "FullHD" || val === "QHD" || val === "4K")) {
      out.gamescopeResolution = val;
    }
  }
  return out;
}
function readAppConfig() {
  if (!(0, import_fs4.existsSync)(CONFIG_PATH)) return { ...DEFAULTS };
  try {
    const raw = (0, import_fs4.readFileSync)(CONFIG_PATH, "utf-8");
    const parsed = parseConfFile(raw);
    if (parsed.displayMode === void 0 && parsed.fullscreen !== void 0) {
      parsed.displayMode = parsed.fullscreen ? "kiosk" : "window";
    }
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}
function hasLanguageBeenSet() {
  if (!(0, import_fs4.existsSync)(CONFIG_PATH)) return false;
  try {
    const raw = (0, import_fs4.readFileSync)(CONFIG_PATH, "utf-8");
    return parseConfFile(raw).language !== void 0;
  } catch {
    return false;
  }
}
function writeAppConfig(partial) {
  const current = readAppConfig();
  const next = { ...current, ...partial };
  if (partial.displayMode !== void 0 && partial.fullscreen === void 0) {
    next.fullscreen = partial.displayMode === "kiosk";
  }
  const body = [
    "# X-Launcher \u2014 preferenze persistite (formato chiave=valore, letto anche da kiosk-launch.sh)",
    `fullscreen=${next.fullscreen}`,
    `displayMode=${next.displayMode}`,
    `language=${next.language}`,
    `avatarUrl=${next.avatarUrl ?? ""}`,
    `gamescopeResolution=${next.gamescopeResolution}`,
    ""
  ].join("\n");
  (0, import_fs4.writeFileSync)(CONFIG_PATH, body, "utf-8");
  return next;
}
var import_fs4, import_path5, CONFIG_PATH, GAMESCOPE_RESOLUTION_ORDER, DEFAULTS;
var init_appConfig = __esm({
  "src/backend/appConfig.ts"() {
    "use strict";
    import_fs4 = require("fs");
    import_path5 = __toESM(require("path"), 1);
    init_paths();
    CONFIG_PATH = import_path5.default.join(DATA_DIR, "app.conf");
    (0, import_fs4.mkdirSync)(DATA_DIR, { recursive: true });
    GAMESCOPE_RESOLUTION_ORDER = ["HD", "FullHD", "QHD", "4K"];
    DEFAULTS = {
      fullscreen: true,
      // comportamento storico: kiosk-launch.sh avviava sempre a tutto schermo
      displayMode: "kiosk",
      // equivalente a fullscreen=true prima di v0.99.9
      language: "it",
      avatarUrl: null,
      gamescopeResolution: "QHD"
    };
  }
});

// src/backend/aiProviders/base.ts
function parseAIResponse(raw, usage) {
  const giveUp = (reason) => ({ kind: "give_up", reason, usage });
  if (!raw) return giveUp("Risposta vuota dal provider.");
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
      return giveUp("Nessun JSON riconoscibile nella risposta.");
    }
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    const kind = parsed.kind;
    if (kind === "clarify") {
      const question = typeof parsed.question === "string" ? parsed.question : null;
      const options = Array.isArray(parsed.options) ? parsed.options.filter((o) => typeof o === "string") : [];
      if (!question || options.length === 0) return giveUp("Richiesta di chiarimento malformata.");
      return { kind: "clarify", question, options, usage };
    }
    if (kind === "give_up") {
      const reason = typeof parsed.reason === "string" ? parsed.reason : "Il provider non ha trovato una soluzione affidabile.";
      return { kind: "give_up", reason, usage };
    }
    const solution = typeof parsed.solution === "string" ? parsed.solution : null;
    if (!solution) return giveUp("Suggerimento malformato (manca solution).");
    const validActionTypes = ["winetricks", "config_patch", "relaunch", "open_section", "none"];
    const actionType = validActionTypes.includes(parsed.actionType) ? parsed.actionType : "none";
    const validConfidences = ["high", "medium", "low"];
    const confidence = validConfidences.includes(parsed.confidence) ? parsed.confidence : "low";
    const actionParams = parsed.actionParams && typeof parsed.actionParams === "object" ? parsed.actionParams : {};
    return { kind: "suggestion", suggestion: { solution, actionType, actionParams, confidence }, usage };
  } catch {
    return giveUp("Risposta non in formato JSON valido.");
  }
}
function buildSystemPrompt(language = "it") {
  const langName = language === "en" ? "inglese" : "italiano";
  return `Sei un assistente che aiuta a diagnosticare problemi di compatibilit\xE0 Wine/Proton per giochi Windows lanciati su Linux tramite X-Launcher, un launcher HTPC.

Rispondi SOLO con un oggetto JSON valido, nessun testo prima o dopo, in UNO di questi tre formati:

1. Se hai una soluzione concreta da proporre:
{
  "kind": "suggestion",
  "solution": "spiegazione breve e concreta del problema e della soluzione, in ${langName}",
  "actionType": "winetricks" | "config_patch" | "relaunch" | "open_section" | "none",
  "actionParams": { "chiave": "valore" },
  "confidence": "high" | "medium" | "low"
}

2. Se ti manca un'informazione essenziale per rispondere (es. non \xE8 chiaro se il problema \xE8 video, audio, o di input):
{
  "kind": "clarify",
  "question": "domanda breve e specifica, in ${langName}",
  "options": ["opzione 1", "opzione 2", "opzione 3"]
}

3. Se non hai una risposta affidabile da dare, anche dopo aver visto i tentativi precedenti falliti:
{
  "kind": "give_up",
  "reason": "spiegazione breve del perch\xE9 non sei sicuro, in ${langName}"
}

Regole:
- Usa "winetricks" se la soluzione \xE8 installare uno o pi\xF9 verb (actionParams: {"verbs": "verb1,verb2"}).
- Usa "config_patch" se la soluzione \xE8 modificare una configurazione del gioco.
- Se ti vengono forniti tentativi precedenti gi\xE0 falliti, NON riproporre la stessa soluzione o una equivalente \u2014 se non hai altre idee valide, usa "give_up" invece di ripetere.
- Se non sei ragionevolmente sicuro della causa, usa confidence "low" invece di inventare una soluzione plausibile ma non verificata, oppure usa "give_up" se la low confidence rende il suggerimento inutile.
- PRIORIT\xC0 CRITICA: se il log contiene un errore esplicito relativo al file eseguibile o al suo percorso (es. "failed to open", "No such file", "cannot find the file specified", un percorso che termina con un'estensione insolita come .bak invece di .exe), quella \xE8 quasi sempre la causa REALE del mancato avvio \u2014 dagli priorit\xE0 assoluta rispetto a warning generici di driver grafici (libEGL, libGL, dri2, Mesa), che sono spesso rumore innocuo presente anche nei lanci riusciti e NON la causa del fallimento a meno che non siano l'unico segnale d'errore presente nel log.`;
}
var AIProviderPlugin, MAX_AI_ATTEMPTS;
var init_base = __esm({
  "src/backend/aiProviders/base.ts"() {
    "use strict";
    AIProviderPlugin = class {
      /**
       * Abilitato dall'utente — persistito, ma di default SEMPRE false: nessun
       * provider viene mai contattato senza un'attivazione esplicita, coerente
       * con "consenso per-provider, non globale" deciso in fase di progettazione.
       */
      enabled = false;
    };
    MAX_AI_ATTEMPTS = 3;
  }
});

// src/backend/aiProviders/ollama.ts
function buildUserMessage(context) {
  const parts = [];
  if (context.gameTitle) parts.push(`Gioco: ${context.gameTitle}`);
  if (context.store) parts.push(`Store: ${context.store}`);
  if (context.runner) parts.push(`Runner: ${context.runner}`);
  parts.push(`Log errore:
${context.errorText}`);
  if (context.pastAttempts.length > 0) {
    parts.push(
      `
Tentativi gi\xE0 provati e FALLITI per questo stesso errore (non riproporli):
` + context.pastAttempts.map((a, i) => `${i + 1}. ${a.suggestion.solution}`).join("\n")
    );
  }
  if (context.clarificationAnswer) {
    parts.push(`
L'utente ha risposto alla domanda di chiarimento precedente: ${context.clarificationAnswer}`);
  }
  return parts.join("\n");
}
var DEFAULT_BASE_URL, REQUEST_TIMEOUT_MS, OllamaPlugin;
var init_ollama = __esm({
  "src/backend/aiProviders/ollama.ts"() {
    "use strict";
    init_base();
    DEFAULT_BASE_URL = "http://localhost:11434";
    REQUEST_TIMEOUT_MS = 9e4;
    OllamaPlugin = class extends AIProviderPlugin {
      constructor(baseURL = DEFAULT_BASE_URL, model = "llama3.1") {
        super();
        this.baseURL = baseURL;
        this.model = model;
      }
      baseURL;
      model;
      id = "ollama";
      name = "Ollama (locale)";
      requiresPaidAccount = false;
      requiresApiKey = false;
      isConfigured() {
        return Boolean(this.baseURL) && Boolean(this.model);
      }
      async askForFix(context) {
        const emptyUsage = { inputTokens: 0, outputTokens: 0 };
        if (!this.isConfigured()) {
          return { kind: "give_up", reason: "Ollama non configurato (baseURL o model mancanti).", usage: emptyUsage };
        }
        try {
          const res = await fetch(`${this.baseURL.replace(/\/$/, "")}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: this.model,
              stream: false,
              format: "json",
              messages: [
                { role: "system", content: buildSystemPrompt(context.language) },
                { role: "user", content: buildUserMessage(context) }
              ]
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
          });
          if (!res.ok) {
            return {
              kind: "give_up",
              reason: `Ollama ha risposto con stato HTTP ${res.status} \u2014 server locale non raggiungibile o modello "${this.model}" non disponibile (verifica con 'ollama list').`,
              usage: emptyUsage
            };
          }
          const data = await res.json().catch(() => null);
          if (!data) {
            return { kind: "give_up", reason: "Risposta di Ollama non in formato JSON valido.", usage: emptyUsage };
          }
          const content = data?.message?.content;
          const usage = {
            inputTokens: typeof data?.prompt_eval_count === "number" ? data.prompt_eval_count : 0,
            outputTokens: typeof data?.eval_count === "number" ? data.eval_count : 0
          };
          if (typeof content !== "string") {
            return { kind: "give_up", reason: "Risposta di Ollama priva di contenuto testuale.", usage };
          }
          return parseAIResponse(content, usage);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          return { kind: "give_up", reason: `Chiamata a Ollama fallita: ${reason}`, usage: emptyUsage };
        }
      }
    };
  }
});

// src/backend/aiProviders/gemini.ts
function buildUserMessage2(context) {
  const parts = [];
  if (context.gameTitle) parts.push(`Gioco: ${context.gameTitle}`);
  if (context.store) parts.push(`Store: ${context.store}`);
  if (context.runner) parts.push(`Runner: ${context.runner}`);
  parts.push(`Log errore:
${context.errorText}`);
  if (context.pastAttempts.length > 0) {
    parts.push(
      `
Tentativi gi\xE0 provati e FALLITI per questo stesso errore (non riproporli):
` + context.pastAttempts.map((a, i) => `${i + 1}. ${a.suggestion.solution}`).join("\n")
    );
  }
  if (context.clarificationAnswer) {
    parts.push(`
L'utente ha risposto alla domanda di chiarimento precedente: ${context.clarificationAnswer}`);
  }
  return parts.join("\n");
}
var DEFAULT_MODEL, REQUEST_TIMEOUT_MS2, GeminiPlugin;
var init_gemini = __esm({
  "src/backend/aiProviders/gemini.ts"() {
    "use strict";
    init_base();
    DEFAULT_MODEL = "gemini-3.1-flash-lite";
    REQUEST_TIMEOUT_MS2 = 3e4;
    GeminiPlugin = class extends AIProviderPlugin {
      constructor(apiKey, model = DEFAULT_MODEL) {
        super();
        this.apiKey = apiKey;
        this.model = model;
      }
      apiKey;
      model;
      id = "gemini";
      name = "Google Gemini";
      requiresPaidAccount = false;
      // tier gratuito reale, vedi nota privacy sopra
      requiresApiKey = true;
      isConfigured() {
        return Boolean(this.apiKey);
      }
      async askForFix(context) {
        const emptyUsage = { inputTokens: 0, outputTokens: 0 };
        if (!this.isConfigured()) {
          return { kind: "give_up", reason: "Gemini non configurato (API key mancante).", usage: emptyUsage };
        }
        try {
          const { GoogleGenAI } = await import("@google/genai");
          const ai = new GoogleGenAI({ apiKey: this.apiKey });
          const response = await Promise.race([
            ai.models.generateContent({
              model: this.model,
              contents: buildUserMessage2(context),
              config: { systemInstruction: buildSystemPrompt(context.language) }
            }),
            new Promise(
              (_, reject) => setTimeout(() => reject(new Error("timeout")), REQUEST_TIMEOUT_MS2)
            )
          ]);
          const text = response.text ?? "";
          const usageMetadata = response.usageMetadata ?? {};
          const usage = {
            inputTokens: typeof usageMetadata.promptTokenCount === "number" ? usageMetadata.promptTokenCount : 0,
            outputTokens: typeof usageMetadata.candidatesTokenCount === "number" ? usageMetadata.candidatesTokenCount : 0
          };
          if (!text) {
            return { kind: "give_up", reason: "Risposta di Gemini priva di contenuto testuale.", usage };
          }
          return parseAIResponse(text, usage);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          return { kind: "give_up", reason: `Chiamata a Gemini fallita: ${reason}`, usage: emptyUsage };
        }
      }
    };
  }
});

// src/backend/aiProviders/claude.ts
function buildUserMessage3(context) {
  const parts = [];
  if (context.gameTitle) parts.push(`Gioco: ${context.gameTitle}`);
  if (context.store) parts.push(`Store: ${context.store}`);
  if (context.runner) parts.push(`Runner: ${context.runner}`);
  parts.push(`Log errore:
${context.errorText}`);
  if (context.pastAttempts.length > 0) {
    parts.push(
      `
Tentativi gi\xE0 provati e FALLITI per questo stesso errore (non riproporli):
` + context.pastAttempts.map((a, i) => `${i + 1}. ${a.suggestion.solution}`).join("\n")
    );
  }
  if (context.clarificationAnswer) {
    parts.push(`
L'utente ha risposto alla domanda di chiarimento precedente: ${context.clarificationAnswer}`);
  }
  return parts.join("\n");
}
var API_URL, ANTHROPIC_VERSION, DEFAULT_MODEL2, MAX_TOKENS, REQUEST_TIMEOUT_MS3, ClaudePlugin;
var init_claude = __esm({
  "src/backend/aiProviders/claude.ts"() {
    "use strict";
    init_base();
    API_URL = "https://api.anthropic.com/v1/messages";
    ANTHROPIC_VERSION = "2023-06-01";
    DEFAULT_MODEL2 = "claude-haiku-4-5-20251001";
    MAX_TOKENS = 1024;
    REQUEST_TIMEOUT_MS3 = 3e4;
    ClaudePlugin = class extends AIProviderPlugin {
      constructor(apiKey, model = DEFAULT_MODEL2) {
        super();
        this.apiKey = apiKey;
        this.model = model;
      }
      apiKey;
      model;
      id = "claude";
      name = "Claude (Anthropic)";
      requiresPaidAccount = true;
      requiresApiKey = true;
      isConfigured() {
        return Boolean(this.apiKey);
      }
      async askForFix(context) {
        const emptyUsage = { inputTokens: 0, outputTokens: 0 };
        if (!this.isConfigured()) {
          return { kind: "give_up", reason: "Claude non configurato (API key mancante).", usage: emptyUsage };
        }
        try {
          const res = await fetch(API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.apiKey,
              "anthropic-version": ANTHROPIC_VERSION
            },
            body: JSON.stringify({
              model: this.model,
              max_tokens: MAX_TOKENS,
              system: buildSystemPrompt(context.language),
              messages: [
                { role: "user", content: buildUserMessage3(context) }
              ]
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS3)
          });
          if (!res.ok) {
            return {
              kind: "give_up",
              reason: `Claude ha risposto con stato HTTP ${res.status} \u2014 verifica API key/quota.`,
              usage: emptyUsage
            };
          }
          const data = await res.json().catch(() => null);
          if (!data) {
            return { kind: "give_up", reason: "Risposta di Claude non in formato JSON valido.", usage: emptyUsage };
          }
          const textBlock = Array.isArray(data?.content) ? data.content.find((b) => b?.type === "text") : null;
          const text = textBlock?.text ?? "";
          const usage = {
            inputTokens: typeof data?.usage?.input_tokens === "number" ? data.usage.input_tokens : 0,
            outputTokens: typeof data?.usage?.output_tokens === "number" ? data.usage.output_tokens : 0
          };
          if (!text) {
            return { kind: "give_up", reason: "Risposta di Claude priva di contenuto testuale.", usage };
          }
          return parseAIResponse(text, usage);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          return { kind: "give_up", reason: `Chiamata a Claude fallita: ${reason}`, usage: emptyUsage };
        }
      }
    };
  }
});

// src/backend/aiProviders/openaiCompatible.ts
function buildUserMessage4(context) {
  const parts = [];
  if (context.gameTitle) parts.push(`Gioco: ${context.gameTitle}`);
  if (context.store) parts.push(`Store: ${context.store}`);
  if (context.runner) parts.push(`Runner: ${context.runner}`);
  parts.push(`Log errore:
${context.errorText}`);
  if (context.pastAttempts.length > 0) {
    parts.push(
      `
Tentativi gi\xE0 provati e FALLITI per questo stesso errore (non riproporli):
` + context.pastAttempts.map((a, i) => `${i + 1}. ${a.suggestion.solution}`).join("\n")
    );
  }
  if (context.clarificationAnswer) {
    parts.push(`
L'utente ha risposto alla domanda di chiarimento precedente: ${context.clarificationAnswer}`);
  }
  return parts.join("\n");
}
function makeDeepSeekPlugin(apiKey, model = "deepseek-chat") {
  return new OpenAICompatiblePlugin(
    "deepseek",
    "DeepSeek",
    "https://api.deepseek.com/v1",
    model,
    apiKey,
    /* requiresPaidAccount */
    false
  );
}
function makeChatGPTPlugin(apiKey, model = "gpt-5.4-nano") {
  return new OpenAICompatiblePlugin(
    "chatgpt",
    "ChatGPT (OpenAI)",
    "https://api.openai.com/v1",
    model,
    apiKey,
    /* requiresPaidAccount */
    true
  );
}
var REQUEST_TIMEOUT_MS4, OpenAICompatiblePlugin;
var init_openaiCompatible = __esm({
  "src/backend/aiProviders/openaiCompatible.ts"() {
    "use strict";
    init_base();
    REQUEST_TIMEOUT_MS4 = 3e4;
    OpenAICompatiblePlugin = class extends AIProviderPlugin {
      constructor(id, name, baseURL, model, apiKey, requiresPaidAccount, requiresApiKey = true) {
        super();
        this.baseURL = baseURL;
        this.model = model;
        this.apiKey = apiKey;
        this.id = id;
        this.name = name;
        this.requiresPaidAccount = requiresPaidAccount;
        this.requiresApiKey = requiresApiKey;
      }
      baseURL;
      model;
      apiKey;
      id;
      name;
      requiresPaidAccount;
      requiresApiKey;
      isConfigured() {
        return Boolean(this.baseURL) && Boolean(this.model) && (!this.requiresApiKey || Boolean(this.apiKey));
      }
      async askForFix(context) {
        const emptyUsage = { inputTokens: 0, outputTokens: 0 };
        if (!this.isConfigured()) {
          return { kind: "give_up", reason: `${this.name} non configurato (API key o endpoint mancanti).`, usage: emptyUsage };
        }
        try {
          const headers = { "Content-Type": "application/json" };
          if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
          const res = await fetch(`${this.baseURL.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: this.model,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: buildSystemPrompt(context.language) },
                { role: "user", content: buildUserMessage4(context) }
              ]
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS4)
          });
          if (!res.ok) {
            return {
              kind: "give_up",
              reason: `${this.name} ha risposto con stato HTTP ${res.status} \u2014 verifica API key/quota/endpoint.`,
              usage: emptyUsage
            };
          }
          const data = await res.json().catch(() => null);
          if (!data) {
            return { kind: "give_up", reason: `Risposta di ${this.name} non in formato JSON valido.`, usage: emptyUsage };
          }
          const content = data?.choices?.[0]?.message?.content;
          const usage = {
            inputTokens: typeof data?.usage?.prompt_tokens === "number" ? data.usage.prompt_tokens : 0,
            outputTokens: typeof data?.usage?.completion_tokens === "number" ? data.usage.completion_tokens : 0
          };
          if (typeof content !== "string") {
            return { kind: "give_up", reason: `Risposta di ${this.name} priva di contenuto testuale.`, usage };
          }
          return parseAIResponse(content, usage);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          return { kind: "give_up", reason: `Chiamata a ${this.name} fallita: ${reason}`, usage: emptyUsage };
        }
      }
    };
  }
});

// src/backend/aiProviders/registry.ts
var registry_exports = {};
__export(registry_exports, {
  buildProvider: () => buildProvider,
  getActiveProviders: () => getActiveProviders
});
function buildProvider(cred) {
  switch (cred.providerId) {
    case "ollama":
      return new OllamaPlugin(cred.baseUrl, cred.model);
    case "gemini":
      return new GeminiPlugin(cred.apiKey, cred.model);
    case "deepseek":
      return makeDeepSeekPlugin(cred.apiKey, cred.model);
    case "chatgpt":
      return makeChatGPTPlugin(cred.apiKey, cred.model);
    case "claude":
      return new ClaudePlugin(cred.apiKey, cred.model);
    default:
      return null;
  }
}
function getActiveProviders() {
  return getAllAiProviderCredentials().filter((c) => c.enabled).map(buildProvider).filter((p) => p !== null && p.isConfigured());
}
var init_registry = __esm({
  "src/backend/aiProviders/registry.ts"() {
    "use strict";
    init_db();
    init_ollama();
    init_gemini();
    init_claude();
    init_openaiCompatible();
  }
});

// src/backend/aiProviders/attemptTracker.ts
function deduplicateLog(errorText) {
  const lines = errorText.split("\n");
  const collapsed = [];
  for (const line of lines) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.startsWith(line + " [x")) {
      const match = last.match(/^(.*) \[x(\d+)\]$/);
      const count = match ? parseInt(match[2], 10) + 1 : 2;
      collapsed[collapsed.length - 1] = `${line} [x${count}]`;
    } else if (last === line) {
      collapsed[collapsed.length - 1] = `${line} [x2]`;
    } else {
      collapsed.push(line);
    }
  }
  return collapsed.join("\n");
}
function normalizeErrorText(errorText) {
  return deduplicateLog(errorText).replace(/0x[0-9a-fA-F]+/g, "0xADDR").replace(/\bpid[:\s]+\d+\b/gi, "pid N").replace(/\b\d{4,}\b/g, "N").replace(/\/[\w.\-\/]+/g, "/PATH").replace(/\s+/g, " ").trim().toLowerCase();
}
function computeErrorSignature(errorText) {
  const normalized = normalizeErrorText(errorText);
  return (0, import_crypto.createHash)("sha256").update(normalized).digest("hex").slice(0, 16);
}
function toAttemptRecord(row) {
  return {
    gameId: row.gameId,
    errorSignature: row.errorSignature,
    attempts: row.attempts,
    givenUp: row.givenUp,
    lastAttemptAt: row.lastAttemptAt ?? ""
  };
}
function getRecord(gameId, errorText) {
  const signature = computeErrorSignature(errorText);
  const row = getAiAttemptRecord(gameId, signature);
  return row ? toAttemptRecord(row) : void 0;
}
function canAttempt(gameId, errorText) {
  const record = getRecord(gameId, errorText);
  if (!record) return true;
  if (record.givenUp) return false;
  return record.attempts.length < MAX_AI_ATTEMPTS;
}
function getPastAttempts(gameId, errorText) {
  return getRecord(gameId, errorText)?.attempts ?? [];
}
function recordFailure(gameId, errorText, suggestion) {
  const signature = computeErrorSignature(errorText);
  const row = recordAiAttemptFailure(gameId, signature, suggestion, MAX_AI_ATTEMPTS);
  return toAttemptRecord(row);
}
function resetForGame(gameId) {
  resetAiAttemptsForGame(gameId);
}
var import_crypto;
var init_attemptTracker = __esm({
  "src/backend/aiProviders/attemptTracker.ts"() {
    "use strict";
    import_crypto = require("crypto");
    init_db();
    init_base();
  }
});

// src/backend/aiProviders/orchestrator.ts
var orchestrator_exports = {};
__export(orchestrator_exports, {
  runAdvisor: () => runAdvisor
});
function currentMonthKey() {
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
async function runAdvisor(gameId, gameTitle, errorText) {
  const cleanedErrorText = deduplicateLog(errorText);
  if (!canAttempt(gameId, cleanedErrorText)) {
    writeLog("system", `[AI] Limit of ${MAX_AI_ATTEMPTS} attempts already reached for this error \u2014 no new call.`);
    return {
      response: {
        kind: "give_up",
        reason: `Limite di ${MAX_AI_ATTEMPTS} tentativi gi\xE0 raggiunto per questo errore. Modifica manualmente la configurazione per riprovare.`,
        usage: { inputTokens: 0, outputTokens: 0 }
      }
    };
  }
  const providers = getActiveProviders();
  if (providers.length === 0) {
    return { response: null };
  }
  const pastAttempts = getPastAttempts(gameId, cleanedErrorText);
  const language = readAppConfig().language;
  const context = { errorText: cleanedErrorText, gameTitle, pastAttempts, language };
  let lastResponse = null;
  let lastProviderName;
  let lastUsageThisMonth;
  let lastMonthlyBudget;
  for (const provider of providers) {
    const cred = getAiProviderCredential(provider.id);
    const hasBudget = cred?.tokenBudget != null;
    if (hasBudget) {
      const usedSoFar = getAiUsageThisMonth().byProvider[provider.id] ?? 0;
      if (usedSoFar >= cred.tokenBudget) {
        writeLog("system", `[AI] ${provider.name}: budget esaurito (${usedSoFar}/${cred.tokenBudget}) \u2014 richiesta NON instradata.`);
        lastResponse = {
          kind: "give_up",
          reason: `Budget token esaurito per ${provider.name} (${usedSoFar.toLocaleString()}/${cred.tokenBudget.toLocaleString()} questo mese). Nessuna richiesta verr\xE0 instradata a questo provider finch\xE9 non aumenti il budget in Impostazioni dopo aver acquistato altri token, oppure passa a un modello locale (Ollama).`,
          usage: { inputTokens: 0, outputTokens: 0 }
        };
        lastProviderName = provider.name;
        lastUsageThisMonth = usedSoFar;
        lastMonthlyBudget = cred.tokenBudget;
        continue;
      }
    }
    try {
      const response = await provider.askForFix(context);
      lastResponse = response;
      lastProviderName = provider.name;
      recordAiUsage(provider.id, response.usage.inputTokens, response.usage.outputTokens);
      writeLog(
        "system",
        `[AI] ${provider.name}: ${response.kind}` + (response.kind === "give_up" ? ` \u2014 ${response.reason}` : "") + ` (${response.usage.inputTokens}+${response.usage.outputTokens} tokens)`
      );
      if (hasBudget) {
        const usedNow = getAiUsageThisMonth().byProvider[provider.id] ?? 0;
        lastUsageThisMonth = usedNow;
        lastMonthlyBudget = cred.tokenBudget;
        const month = currentMonthKey();
        if (usedNow / cred.tokenBudget >= 0.8 && cred.budgetWarnedMonth !== month) {
          markAiBudgetWarned(provider.id, month);
          try {
            const { notificationEngine: notificationEngine2 } = await Promise.resolve().then(() => (init_notificationEngine(), notificationEngine_exports));
            notificationEngine2.emit({
              type: "system",
              level: "warning",
              message: `${provider.name}: raggiunto l'80% del budget token mensile (${usedNow.toLocaleString()}/${cred.tokenBudget.toLocaleString()}). Le richieste si fermeranno automaticamente all'esaurimento, finch\xE9 non alzi il budget dopo aver acquistato altri token.`
            });
          } catch (err) {
            writeLog("warning", `[AI] Notifica soglia 80% budget non inviata per ${provider.name}: ${err}`);
          }
        }
      }
      if (response.kind !== "give_up") {
        return {
          response,
          providerName: provider.name,
          usageThisMonth: lastUsageThisMonth,
          monthlyBudget: lastMonthlyBudget
        };
      }
    } catch (err) {
      writeLog("error", `[AI] ${provider.name} violated the askForFix contract (unhandled exception): ${err instanceof Error ? err.message : err}`);
    }
  }
  return {
    response: lastResponse,
    providerName: lastProviderName,
    usageThisMonth: lastUsageThisMonth,
    monthlyBudget: lastMonthlyBudget
  };
}
var init_orchestrator = __esm({
  "src/backend/aiProviders/orchestrator.ts"() {
    "use strict";
    init_base();
    init_registry();
    init_attemptTracker();
    init_attemptTracker();
    init_logger();
    init_db();
    init_appConfig();
  }
});

// src/backend/notificationEngine.ts
var notificationEngine_exports = {};
__export(notificationEngine_exports, {
  notificationEngine: () => notificationEngine
});
var import_better_sqlite33, import_path6, import_fs5, NotificationStore, NotificationQueue, NotificationEngine, notificationEngine;
var init_notificationEngine = __esm({
  "src/backend/notificationEngine.ts"() {
    "use strict";
    import_better_sqlite33 = __toESM(require("better-sqlite3"), 1);
    import_path6 = __toESM(require("path"), 1);
    import_fs5 = require("fs");
    init_paths();
    init_knowledgeBase();
    init_appConfig();
    NotificationStore = class {
      db;
      constructor() {
        (0, import_fs5.mkdirSync)(DATA_DIR, { recursive: true });
        this.db = new import_better_sqlite33.default(import_path6.default.join(DATA_DIR, "x-launcher.db"));
        this.db.pragma("journal_mode = WAL");
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
        const existingCols2 = this.db.prepare(`PRAGMA table_info(notifications)`).all().map((c) => c.name);
        if (!existingCols2.includes("tertiary_action")) {
          this.db.exec(`ALTER TABLE notifications ADD COLUMN tertiary_action TEXT`);
        }
        if (!existingCols2.includes("link_url")) {
          this.db.exec(`ALTER TABLE notifications ADD COLUMN link_url TEXT`);
        }
        if (!existingCols2.includes("link_label")) {
          this.db.exec(`ALTER TABLE notifications ADD COLUMN link_label TEXT`);
        }
      }
      insert(n) {
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
      updateStatus(id, status) {
        this.db.prepare(`UPDATE notifications SET status = ? WHERE id = ?`).run(status, id);
      }
      getRecent(limit = 100) {
        return this.db.prepare(
          `SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?`
        ).all(limit);
      }
      getPending() {
        return this.db.prepare(
          `SELECT * FROM notifications WHERE status IN ('pending','applied') ORDER BY created_at DESC`
        ).all();
      }
    };
    NotificationQueue = class {
      /** Ultime notifiche in memoria per la dedup per fingerprint */
      recentFingerprints = /* @__PURE__ */ new Map();
      DEDUP_WINDOW_MS = 3e4;
      // 30s
      /** Ritorna true se la notifica è un duplicato recente */
      isDuplicate(fingerprint) {
        const lastSeen = this.recentFingerprints.get(fingerprint);
        if (lastSeen && Date.now() - lastSeen < this.DEDUP_WINDOW_MS) return true;
        this.recentFingerprints.set(fingerprint, Date.now());
        if (this.recentFingerprints.size > 200) {
          const cutoff = Date.now() - this.DEDUP_WINDOW_MS;
          for (const [k, v] of this.recentFingerprints) {
            if (v < cutoff) this.recentFingerprints.delete(k);
          }
        }
        return false;
      }
    };
    NotificationEngine = class {
      store = new NotificationStore();
      queue = new NotificationQueue();
      listeners = [];
      broadcast = null;
      /** Registra la funzione di broadcast SSE del server */
      setBroadcast(fn) {
        this.broadcast = fn;
      }
      /** Aggiunge un listener interno (per estensioni future) */
      on(listener) {
        this.listeners.push(listener);
      }
      /**
       * v2.0.41-dev.35 — richiesta implicita: `on()` sopra non aveva mai un
       * corrispondente `off()` — chi si registra (es. l'orchestrazione della
       * splash di lancio, un listener per gioco lanciato) deve poter
       * rimuoversi quando non serve più, altrimenti l'array cresce senza
       * limite per l'intera durata della sessione.
       */
      off(listener) {
        this.listeners = this.listeners.filter((l) => l !== listener);
      }
      /** Punto centrale di ingresso eventi dal daemon */
      emit(event) {
        this.listeners.forEach((l) => l(event));
        const notif = this.eventToNotification(event);
        if (!notif) return;
        this.push(notif);
        if ((event.type === "download-error" || event.type === "launch-error") && notif.source === "system" && event.error) {
          this.tryAIAdvisor(event.gameId, event.gameTitle, event.error).catch((err) => {
            console.error("[AI] tryAIAdvisor failed unexpectedly:", err);
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
      async tryAIAdvisor(gameId, gameTitle, errorText) {
        const { runAdvisor: runAdvisor2 } = await Promise.resolve().then(() => (init_orchestrator(), orchestrator_exports));
        const result = await runAdvisor2(gameId, gameTitle, errorText);
        if (!result.response) {
          return;
        }
        const response = result.response;
        const providerLabel = result.providerName ? ` (${result.providerName})` : "";
        const lang = readAppConfig().language;
        const usageLine = result.usageThisMonth !== void 0 && result.monthlyBudget !== void 0 ? lang === "en" ? `

\u{1F4A0} ${result.usageThisMonth.toLocaleString("en-US")} / ${result.monthlyBudget.toLocaleString("en-US")} tokens this month` : `

\u{1F4A0} ${result.usageThisMonth.toLocaleString("it-IT")} / ${result.monthlyBudget.toLocaleString("it-IT")} token questo mese` : "";
        if (response.kind === "suggestion") {
          const s = response.suggestion;
          this.push({
            id: this.mkId(),
            type: "ai-suggestion",
            status: "pending",
            title: lang === "en" ? `[EXPERIMENTAL] AI suggestion${providerLabel} \u2014 ${gameTitle}` : `[EXPERIMENTAL] Suggerimento AI${providerLabel} \u2014 ${gameTitle}`,
            body: s.solution + usageLine,
            game_id: gameId,
            game_title: gameTitle,
            raw_log: errorText,
            source: "ai",
            ai_provider: result.providerName,
            confidence: s.confidence,
            created_at: this.now(),
            primary_action: s.actionType !== "none" ? JSON.stringify({ label: this.actionLabel(s.actionType, s.actionParams, lang), handler: s.actionType, params: s.actionParams }) : void 0
          });
        } else if (response.kind === "clarify") {
          this.push({
            id: this.mkId(),
            type: "info",
            status: "pending",
            title: lang === "en" ? `[EXPERIMENTAL] AI${providerLabel} needs more information \u2014 ${gameTitle}` : `[EXPERIMENTAL] L'AI${providerLabel} ha bisogno di pi\xF9 informazioni \u2014 ${gameTitle}`,
            body: lang === "en" ? `${response.question}

Possible options: ${response.options.join(" / ")}

(interactive answering not yet available in this version \u2014 continue with manual debugging in the meantime)${usageLine}` : `${response.question}

Opzioni possibili: ${response.options.join(" / ")}

(risposta interattiva non ancora disponibile in questa versione \u2014 prosegui con il debug manuale nel frattempo)${usageLine}`,
            game_id: gameId,
            game_title: gameTitle,
            raw_log: errorText,
            source: "ai",
            created_at: this.now()
          });
        } else {
          this.push({
            id: this.mkId(),
            type: "info",
            status: "dismissed",
            title: lang === "en" ? `[EXPERIMENTAL] AI${providerLabel} found no solution \u2014 ${gameTitle}` : `[EXPERIMENTAL] L'AI${providerLabel} non ha trovato una soluzione \u2014 ${gameTitle}`,
            body: response.reason + usageLine,
            game_id: gameId,
            game_title: gameTitle,
            raw_log: errorText,
            source: "ai",
            created_at: this.now()
          });
        }
      }
      /** LogBridge — chiamato da writeLog/addLog per promuovere certi livelli */
      bridgeLog(level, message) {
        if (level === "error") {
          this.emit({ type: "system", message, level: "error" });
        } else if (level === "warning") {
          this.emit({ type: "system", message, level: "warning" });
        } else if (level === "auth") {
        }
      }
      /** Aggiorna lo stato di una notifica (confirmed/failed dall'utente) */
      updateStatus(id, status) {
        this.store.updateStatus(id, status);
        this.broadcast?.("notification-updated", { id, status });
      }
      /** Recupera notifiche recenti per il polling iniziale */
      getRecent(limit = 100) {
        return this.store.getRecent(limit);
      }
      getPending() {
        return this.store.getPending();
      }
      // ── Privato ──────────────────────────────────────────────────────────────
      push(notif) {
        const fingerprint = `${notif.type}:${notif.title}:${notif.game_id ?? ""}`;
        if (this.queue.isDuplicate(fingerprint)) return;
        const complete = {
          game_id: null,
          game_title: null,
          raw_log: null,
          primary_action: null,
          secondary_action: null,
          tertiary_action: null,
          link_url: null,
          link_label: null,
          ai_provider: null,
          confidence: null,
          ...notif
        };
        try {
          this.store.insert(complete);
        } catch (err) {
          console.error(`[NOTIFY] Failed to write notification:`, err);
          return;
        }
        this.broadcast?.("notification", complete);
      }
      mkId() {
        return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      }
      now() {
        return (/* @__PURE__ */ new Date()).toISOString();
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
      actionLabel(actionType, params, lang) {
        switch (actionType) {
          case "winetricks":
            return lang === "en" ? `Install ${params.verbs ?? "dependencies"}` : `Installa ${params.verbs ?? "dipendenze"}`;
          case "config_patch":
            return lang === "en" ? "Apply configuration" : "Applica configurazione";
          case "relaunch":
            return lang === "en" ? "Relaunch game" : "Riavvia gioco";
          case "open_section":
            return params.section === "accounts" ? lang === "en" ? "Go to Accounts" : "Vai agli Account" : params.section === "plugins" ? lang === "en" ? "Go to Plugins" : "Vai ai Plugin" : lang === "en" ? "Open settings" : "Apri impostazioni";
          default:
            return lang === "en" ? "Apply" : "Applica";
        }
      }
      eventToNotification(event) {
        const lang = readAppConfig().language;
        switch (event.type) {
          case "download-completed":
            return {
              id: this.mkId(),
              type: "success",
              status: "pending",
              title: lang === "en" ? `${event.gameTitle} installed` : `${event.gameTitle} installato`,
              body: lang === "en" ? "Installation complete. The game is ready to launch." : "Installazione completata. Il gioco \xE8 pronto per essere avviato.",
              game_id: event.gameId,
              game_title: event.gameTitle,
              source: "system",
              created_at: this.now()
            };
          case "known-fixes-result":
            return event.found ? {
              id: this.mkId(),
              type: "info",
              status: "pending",
              title: lang === "en" ? `Known fix found (Heroic) \u2014 ${event.gameTitle}` : `Known fix trovato (Heroic) \u2014 ${event.gameTitle}`,
              body: lang === "en" ? `Dependencies applied and saved as the default configuration: ${(event.verbs ?? []).join(", ")}` : `Dipendenze applicate e salvate come configurazione predefinita: ${(event.verbs ?? []).join(", ")}`,
              game_id: event.gameId,
              game_title: event.gameTitle,
              source: "system",
              created_at: this.now()
            } : {
              id: this.mkId(),
              type: "info",
              status: "pending",
              title: lang === "en" ? `No known fix (Heroic) \u2014 ${event.gameTitle}` : `Nessun known fix (Heroic) \u2014 ${event.gameTitle}`,
              body: lang === "en" ? "Installing with the default configured verbs." : "Installazione con i verb configurati di default.",
              game_id: event.gameId,
              game_title: event.gameTitle,
              source: "system",
              created_at: this.now()
            };
          case "download-error": {
            const kbMatchDl = event.error ? knowledgeBase.lookup(event.error) : null;
            if (kbMatchDl) {
              const entry = kbMatchDl.entry;
              const actionParams = (() => {
                try {
                  return JSON.parse(entry.action_params);
                } catch {
                  return {};
                }
              })();
              return {
                id: this.mkId(),
                type: "kb-suggestion",
                status: "pending",
                title: lang === "en" ? `Known solution \u2014 ${event.gameTitle}` : `Soluzione nota \u2014 ${event.gameTitle}`,
                body: localizedSolution(entry, lang),
                game_id: event.gameId,
                game_title: event.gameTitle,
                raw_log: event.error,
                source: "kb",
                created_at: this.now(),
                primary_action: entry.action_type !== "none" ? JSON.stringify({ label: this.actionLabel(entry.action_type, actionParams, lang), handler: entry.action_type, params: actionParams }) : void 0
              };
            }
            return {
              id: this.mkId(),
              type: "error",
              status: "pending",
              title: lang === "en" ? `Installation error \u2014 ${event.gameTitle}` : `Errore installazione \u2014 ${event.gameTitle}`,
              body: event.error || (lang === "en" ? "An error occurred during download or installation." : "Errore durante il download o l'installazione."),
              game_id: event.gameId,
              game_title: event.gameTitle,
              raw_log: event.error,
              source: "system",
              created_at: this.now()
            };
          }
          case "launch-error": {
            const kbMatch = event.error ? knowledgeBase.lookup(event.error) : null;
            if (kbMatch) {
              const entry = kbMatch.entry;
              const actionParams = (() => {
                try {
                  return JSON.parse(entry.action_params);
                } catch {
                  return {};
                }
              })();
              return {
                id: this.mkId(),
                type: "kb-suggestion",
                status: "pending",
                title: lang === "en" ? `Known solution \u2014 ${event.gameTitle}` : `Soluzione nota \u2014 ${event.gameTitle}`,
                body: localizedSolution(entry, lang),
                game_id: event.gameId,
                game_title: event.gameTitle,
                raw_log: event.error,
                source: "kb",
                created_at: this.now(),
                primary_action: entry.action_type !== "none" ? JSON.stringify({ label: this.actionLabel(entry.action_type, actionParams, lang), handler: entry.action_type, params: actionParams }) : void 0
              };
            }
            return {
              id: this.mkId(),
              type: "error",
              status: "pending",
              title: lang === "en" ? `Launch failed \u2014 ${event.gameTitle}` : `Avvio fallito \u2014 ${event.gameTitle}`,
              body: event.error || (lang === "en" ? "The game didn't start correctly." : "Il gioco non si \xE8 avviato correttamente."),
              game_id: event.gameId,
              game_title: event.gameTitle,
              raw_log: event.error,
              source: "system",
              created_at: this.now()
            };
          }
          case "launch-blocked":
            return {
              id: this.mkId(),
              type: "warning",
              status: "pending",
              title: lang === "en" ? `Launch blocked \u2014 ${event.gameTitle}` : `Avvio bloccato \u2014 ${event.gameTitle}`,
              body: event.reason,
              game_id: event.gameId,
              game_title: event.gameTitle,
              source: "system",
              created_at: this.now(),
              primary_action: JSON.stringify({ label: lang === "en" ? "Plugin Settings" : "Impostazioni Plugin", handler: "open_section", params: { section: "plugins" } })
            };
          case "auth-error":
            return {
              id: this.mkId(),
              type: "warning",
              status: "pending",
              title: lang === "en" ? `Session expired \u2014 ${event.store}` : `Sessione scaduta \u2014 ${event.store}`,
              body: event.message || (lang === "en" ? "The session has expired. Sign in again from the account settings." : "La sessione \xE8 scaduta. Accedi di nuovo dalle impostazioni account."),
              source: "system",
              created_at: this.now(),
              primary_action: JSON.stringify({ label: lang === "en" ? "Go to Accounts" : "Vai agli Account", handler: "open_section", params: { section: "accounts" } }),
              game_id: null,
              game_title: null,
              raw_log: null,
              secondary_action: null,
              ai_provider: null,
              confidence: null
            };
          case "auth-ok":
            return {
              id: this.mkId(),
              type: "success",
              status: "pending",
              title: lang === "en" ? `${event.store} \u2014 authentication complete` : `${event.store} \u2014 autenticazione completata`,
              body: lang === "en" ? "Session active. The library will be synced." : "Sessione attiva. La libreria verr\xE0 sincronizzata.",
              source: "system",
              created_at: this.now(),
              game_id: null,
              game_title: null,
              raw_log: null,
              primary_action: null,
              secondary_action: null,
              ai_provider: null,
              confidence: null
            };
          case "runner-installed":
            return {
              id: this.mkId(),
              type: "success",
              status: "pending",
              title: lang === "en" ? `Runner installed \u2014 ${event.runnerId}` : `Runner installato \u2014 ${event.runnerId}`,
              body: lang === "en" ? "The runner is available for use in compatibility profiles." : "Il runner \xE8 disponibile per l'uso nei profili di compatibilit\xE0.",
              source: "system",
              created_at: this.now(),
              game_id: null,
              game_title: null,
              raw_log: null,
              primary_action: null,
              secondary_action: null,
              ai_provider: null,
              confidence: null
            };
          case "runner-uninstalled":
            return {
              id: this.mkId(),
              type: "success",
              status: "pending",
              title: lang === "en" ? `Runner uninstalled \u2014 ${event.runnerId}` : `Runner disinstallato \u2014 ${event.runnerId}`,
              body: lang === "en" ? "The runner has been removed. No longer available in compatibility profiles." : "Il runner \xE8 stato rimosso. Non pi\xF9 disponibile nei profili di compatibilit\xE0.",
              source: "system",
              created_at: this.now(),
              game_id: null,
              game_title: null,
              raw_log: null,
              primary_action: null,
              secondary_action: null,
              ai_provider: null,
              confidence: null
            };
          case "runner-error":
            return {
              id: this.mkId(),
              type: "error",
              status: "pending",
              title: lang === "en" ? `Runner installation error \u2014 ${event.runnerId}` : `Errore installazione runner \u2014 ${event.runnerId}`,
              body: event.error,
              raw_log: event.error,
              source: "system",
              created_at: this.now(),
              game_id: null,
              game_title: null,
              primary_action: null,
              secondary_action: null,
              ai_provider: null,
              confidence: null
            };
          case "validation-prompt":
            return {
              id: this.mkId(),
              type: "info",
              status: "applied",
              title: lang === "en" ? `${event.gameTitle} \u2014 did it work?` : `${event.gameTitle} \u2014 ha funzionato?`,
              body: lang === "en" ? "The game just closed. If it worked correctly, confirm to mark it as verified with the current configuration (runner, verbs, launch arguments). If it didn't work, it'll stay unverified and the question will reappear the next time it closes." : "Il gioco si \xE8 appena chiuso. Se ha funzionato correttamente, conferma per marcarlo come verificato con la configurazione attuale (runner, verb, argomenti di lancio). Se non ha funzionato, rester\xE0 da testare e la domanda ricomparir\xE0 alla prossima chiusura.",
              game_id: event.gameId,
              game_title: event.gameTitle,
              source: "validation",
              created_at: this.now(),
              // v0.99.38 — FIX CRASH: better-sqlite3 con parametri nominati
              // (@raw_log, @primary_action, ecc.) richiede che la CHIAVE esista
              // nell'oggetto passato a .run(), anche solo per valorizzarla a
              // null — un campo del tutto assente (non undefined: assente)
              // fa fallire il bind con "RangeError: Missing named parameter",
              // che qui accadeva dentro un setInterval non protetto da
              // try/catch a monte, portando giù l'intero processo Node. Altri
              // case di questo stesso switch (runner-installed, auth-ok, ecc.)
              // già seguono questo pattern — qui mancava.
              raw_log: null,
              primary_action: null,
              secondary_action: null,
              ai_provider: null,
              confidence: null
            };
          case "shared-launcher-idle":
            return {
              id: this.mkId(),
              type: "info",
              status: "pending",
              title: lang === "en" ? `${event.launcherName} is still open` : `${event.launcherName} \xE8 ancora aperto`,
              body: lang === "en" ? "Keep it ready in the background for the next game that needs it, or close it now?" : "Vuoi tenerlo pronto in background per il prossimo gioco che lo richiede, o chiuderlo ora?",
              game_id: event.gameId,
              game_title: event.gameTitle,
              source: "system",
              created_at: this.now(),
              primary_action: JSON.stringify({
                label: lang === "en" ? "Close now" : "Chiudi ora",
                handler: "close_shared_launcher",
                params: { launcherId: event.launcherId }
              }),
              secondary_action: JSON.stringify({
                label: lang === "en" ? "Keep open" : "Tieni aperto"
              })
            };
          // v2.0.41-dev.4 — vedi commento sul tipo in EngineEvent sopra.
          // `game_id`/`game_title` puntano al gioco ESISTENTE da collegare
          // (non a una riga nuova che ancora non esiste finché l'utente non
          // conferma) — coerente con ogni altra notifica legata a un gioco
          // già in libreria.
          case "shared-launcher-native-game-found":
            return {
              id: this.mkId(),
              type: "info",
              status: "pending",
              title: lang === "en" ? `${event.launcherName}: game detected` : `${event.launcherName}: gioco rilevato`,
              body: lang === "en" ? `"${event.nativeTitle}" is installed directly in ${event.launcherName} and looks like the same game as "${event.targetGameTitle}" (${event.targetStore}) already in your library. Link them to avoid a duplicate entry.` : `"${event.nativeTitle}" risulta installato direttamente in ${event.launcherName} e sembra corrispondere a "${event.targetGameTitle}" (${event.targetStore}) gi\xE0 nella tua libreria. Collegali per evitare una riga duplicata.`,
              game_id: event.targetGameId,
              game_title: event.targetGameTitle,
              source: "shared-launcher-scan",
              created_at: this.now(),
              primary_action: JSON.stringify({
                label: lang === "en" ? "Link" : "Collega",
                handler: "link_shared_launcher_game",
                params: { targetGameId: event.targetGameId, launcherId: event.launcherId }
              }),
              secondary_action: JSON.stringify({
                label: lang === "en" ? "Not the same game" : "Non \xE8 lo stesso gioco"
              })
            };
          case "launcher-troubleshooting-tips": {
            const bulletPrefix = lang === "en" ? "\u2022 " : "\u2022 ";
            const body = event.tips.map((t) => `${bulletPrefix}${t}`).join("\n");
            return {
              id: this.mkId(),
              type: "info",
              status: "pending",
              title: lang === "en" ? `${event.launcherName}: suggestions` : `${event.launcherName}: suggerimenti`,
              body,
              game_id: event.gameId,
              game_title: event.gameTitle,
              source: "launcher-tips",
              created_at: this.now()
            };
          }
          case "system":
            if (event.level === "info") return null;
            return {
              id: this.mkId(),
              type: event.level === "error" ? "error" : "warning",
              status: "pending",
              title: lang === "en" ? event.level === "error" ? "System error" : "System warning" : event.level === "error" ? "Errore di sistema" : "Avviso di sistema",
              body: event.message,
              raw_log: event.message,
              source: "system",
              created_at: this.now()
            };
          default:
            return null;
        }
      }
    };
    notificationEngine = new NotificationEngine();
  }
});

// src/backend/plugins/base.ts
var StorePlugin;
var init_base2 = __esm({
  "src/backend/plugins/base.ts"() {
    "use strict";
    StorePlugin = class {
      isPublic = false;
      authenticated = false;
      /**
       * Se true, getLibrary() esegue una scansione locale esaustiva e affidabile
       * (es. file system) — un titolo non presente nel risultato significa con
       * certezza che non esiste più, quindi gameManager può rimuoverlo dal DB
       * in sicurezza ad ogni refreshLibrary(). Default false: per gli store
       * online (Steam/Epic/GOG) un risultato vuoto o parziale può derivare da
       * un errore di rete/auth temporaneo, non da una libreria realmente svuotata
       * — in quel caso cancellare sarebbe distruttivo, quindi resta false.
       */
      isExhaustiveLocalScan = false;
      /** Abilitato/disabilitato dall'utente — persistito su DB */
      enabled = true;
      async isAuthenticated() {
        return this.isPublic || this.authenticated;
      }
      async login(credentials) {
        this.authenticated = true;
        return { success: true, message: `Connected to ${this.name}` };
      }
      /**
       * Disconnette l'account. Default: non supportato — non tutti gli store
       * hanno un vero concetto di logout (Steam, ad esempio, rileva solo se il
       * client è installato localmente, non un account OAuth). I plugin che
       * supportano un logout reale (Epic, GOG) sovrascrivono questo metodo.
       */
      async logout() {
        return { success: false, message: `${this.name} non supporta la disconnessione da questa interfaccia.` };
      }
      /**
       * v1.5.20-dev.10 — richiesta esplicita dell'utente: NON un plugin unico
       * per i launcher terzi, ogni plugin gestisce le proprie particolarità.
       * Questo hook opzionale sposta fuori da gameManager.ts (dove prima era
       * un `if (game.store === 'Ubisoft' && ...)` centrale, hardcoded) la
       * logica "il processo appena chiuso era l'installer del MIO launcher,
       * ricontrolla se è stato bootstrappato" — gameManager.ts resta il
       * coordinatore generico (calcola tempo di gioco, notifiche), delega
       * solo questa parte specifica al plugin giusto via
       * `this.plugins.find(p => p.id === game.store)?.onLauncherProcessClosed?.(game)`.
       * Default: no-op — la maggioranza dei plugin (Steam, GOG, Epic...) non
       * ha alcun concetto di "processo del launcher stesso da rilevare",
       * solo chi rappresenta un launcher condiviso (UbisoftConnectPlugin, e
       * in futuro EA App/Battle.net/Rockstar) lo sovrascrive.
       */
      async onLauncherProcessClosed(_game) {
      }
      /**
       * v1.5.20-dev.14 — richiesta utente: alcuni titoli (es. Ubisoft
       * riscattati su Epic, vedi CHANGELOG.md) non hanno MAI file scaricabili
       * tramite questo store — il tool CLI lo scopre solo durante il
       * tentativo di installazione stesso, non prima (nessun modo economico
       * di saperlo in anticipo per l'intera libreria). Questo hook lascia a
       * CIASCUN plugin la propria frase/pattern di riconoscimento nell'output
       * reale del proprio tool (catturato da spawnWithProgress — vedi
       * downloadManager.ts) — nessuna logica specifica di un singolo store
       * sparsa altrove. Default: mai riconosciuto (la maggioranza degli
       * store non ha questo concetto — un download fallito è sempre e solo
       * un errore transitorio da poter ritentare).
       */
      detectUnrecoverableInstallFailure(_recentOutput) {
        return false;
      }
    };
  }
});

// src/backend/runners/base.ts
var BaseRunner;
var init_base3 = __esm({
  "src/backend/runners/base.ts"() {
    "use strict";
    BaseRunner = class {
    };
  }
});

// src/backend/processManager.ts
function ensureCapability() {
  if (capable !== null) return capable;
  try {
    const version = (0, import_child_process7.execFileSync)("systemd-run", ["--version"], { stdio: "pipe", encoding: "utf-8" });
    (0, import_child_process7.execFileSync)("systemctl", ["--user", "is-active", "--quiet", "default.target"], { stdio: "pipe" });
    writeLog("system", `[PROCESS-MANAGER] systemd-run disponibile (${version.split("\n")[0].trim()}), sessione utente systemd attiva \u2014 scope cgroup abilitati.`);
    capable = true;
  } catch (err) {
    writeLog("warning", `[PROCESS-MANAGER] systemd-run/sessione utente non disponibili \u2014 scope cgroup disabilitati per questa sessione del daemon, fallback al lancio diretto. Dettaglio: ${err}`);
    capable = false;
  }
  return capable;
}
function sanitize(s) {
  return s.replace(/[^A-Za-z0-9_.-]/g, "-");
}
function makeUnitName(kind, id) {
  return `xlauncher-${kind}-${sanitize(id)}-${Date.now()}`;
}
function wrapArgsForScope(unit, bin, args) {
  return {
    bin: "systemd-run",
    args: ["--user", "--scope", "--collect", `--unit=${unit}`, "--", bin, ...args]
  };
}
function register(info) {
  registry.set(info.unit, { ...info, startedAt: Date.now() });
}
function unregister(unit) {
  registry.delete(unit);
}
function isScopeActive(unit) {
  try {
    const out = (0, import_child_process7.execFileSync)("systemctl", ["--user", "is-active", `${unit}.scope`], { stdio: "pipe", encoding: "utf-8" });
    return out.trim() === "active";
  } catch {
    return false;
  }
}
function getScopePids(unit) {
  try {
    const cgroupPath = (0, import_child_process7.execFileSync)(
      "systemctl",
      ["--user", "show", `${unit}.scope`, "-p", "ControlGroup", "--value"],
      { stdio: "pipe", encoding: "utf-8" }
    ).trim();
    if (!cgroupPath) return [];
    const procsFile = `/sys/fs/cgroup${cgroupPath}/cgroup.procs`;
    if (!(0, import_fs9.existsSync)(procsFile)) {
      writeLog("warning", `[PROCESS-MANAGER] cgroup.procs non trovato per ${unit}: ${procsFile} (ControlGroup grezzo: "${cgroupPath}") \u2014 possibile sistema cgroup v1, mai verificato su questa macchina.`);
      return [];
    }
    return (0, import_fs9.readFileSync)(procsFile, "utf-8").split("\n").map((l) => l.trim()).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
  } catch (err) {
    writeLog("warning", `[PROCESS-MANAGER] Lettura pid reali fallita per ${unit}: ${err}`);
    return [];
  }
}
function resolveRealPidAsync(unit, maxAttempts = 8, delayMs = 250) {
  let attempt = 0;
  const tick = () => {
    attempt++;
    const pids = getScopePids(unit);
    if (pids.length > 0) {
      const entry = registry.get(unit);
      if (entry) entry.realPid = pids[0];
      return;
    }
    if (attempt < maxAttempts) {
      setTimeout(tick, delayMs);
    } else {
      writeLog("warning", `[PROCESS-MANAGER] Pid reale mai risolto per ${unit} dopo ${maxAttempts} tentativi \u2014 resta tracciato solo con il pid del supervisore systemd-run.`);
    }
  };
  setTimeout(tick, delayMs);
}
function isRealProcessAliveInScope(unit, expectedExeBasename) {
  const pids = getScopePids(unit);
  if (pids.length === 0) return false;
  const expected = expectedExeBasename.slice(0, 15);
  for (const pid of pids) {
    try {
      const comm = (0, import_fs9.readFileSync)(`/proc/${pid}/comm`, "utf-8").trim();
      if (comm.slice(0, 15) === expected) return true;
    } catch {
    }
  }
  return false;
}
function killScope(unit) {
  try {
    (0, import_child_process7.execFileSync)("systemctl", ["--user", "kill", "--kill-who=all", "--signal=SIGKILL", `${unit}.scope`], { stdio: "pipe" });
    unregister(unit);
    writeLog("launch", `[PROCESS-MANAGER] Scope terminato su richiesta: ${unit}`);
    return { success: true, message: "Processo terminato." };
  } catch (err) {
    return { success: false, message: `Terminazione fallita: ${err}` };
  }
}
function findActiveScope(kind, id) {
  for (const [unit, info] of registry) {
    if (info.kind !== kind || info.id !== id) continue;
    if (isScopeActive(unit)) return info;
    registry.delete(unit);
  }
  return void 0;
}
function getScopeInfo(unit) {
  return registry.get(unit);
}
function listActive() {
  const alive = [];
  for (const [unit, info] of registry) {
    if (isScopeActive(unit)) {
      alive.push(info);
    } else {
      registry.delete(unit);
    }
  }
  return alive;
}
var import_child_process7, import_fs9, registry, capable;
var init_processManager = __esm({
  "src/backend/processManager.ts"() {
    "use strict";
    import_child_process7 = require("child_process");
    import_fs9 = require("fs");
    init_logger();
    registry = /* @__PURE__ */ new Map();
    capable = null;
  }
});

// src/backend/runners/implementations.ts
var implementations_exports = {};
__export(implementations_exports, {
  DOSBoxRunner: () => DOSBoxRunner,
  ProtonRunner: () => ProtonRunner,
  RetroArchRunner: () => RetroArchRunner,
  ScummVMRunner: () => ScummVMRunner,
  SteamNativeRunner: () => SteamNativeRunner,
  WineRunner: () => WineRunner,
  expandHome: () => expandHome,
  gameLaunchLogPath: () => gameLaunchLogPath,
  launchEpicViaLegendary: () => launchEpicViaLegendary,
  openSteamBigPicture: () => openSteamBigPicture,
  resolveProtonBin: () => resolveProtonBin
});
function expandHome(p) {
  const withHome = p.startsWith("~") ? import_path10.default.join((0, import_os5.homedir)(), p.slice(1)) : p;
  return withHome.replace(
    /\$([A-Z_][A-Z0-9_]*)/g,
    (_, name) => process.env[name] ?? `$${name}`
  );
}
function spawnDetached(bin, args, env = {}, cwd, logPath, scopeLabel) {
  const { cwd: cwdFromEnv, ...cleanEnv } = env;
  const resolvedCwd = cwd ?? cwdFromEnv;
  let stdio = "ignore";
  if (logPath) {
    try {
      (0, import_fs10.mkdirSync)(import_path10.default.dirname(logPath), { recursive: true });
      const fd = (0, import_fs10.openSync)(logPath, "a");
      stdio = ["ignore", fd, fd];
    } catch (err) {
      writeLog("warning", `[LAUNCH] Could not open launch log ${logPath}: ${err} \u2014 stdout/stderr not captured for this launch.`);
      stdio = "ignore";
    }
  }
  const spawnOpts = {
    detached: true,
    stdio,
    // v2.2.19-dev.2 — BUG REALE CONFERMATO: process.env.DISPLAY qui è
    // quello statico di xdash.service (:0, valido solo per la sessione
    // XFCE) — con la sessione Kiosk gamescope attiva, i giochi finivano
    // invisibili sull'altro DISPLAY. getActiveDisplayEnv() riporta quello
    // della sessione realmente attiva (segnalato da kiosk-launch.sh /
    // gamescope-session.sh), con fallback al vecchio comportamento se
    // nessuna sessione l'ha ancora segnalato. ...cleanEnv resta per
    // ultimo apposta: un DISPLAY esplicito nel profilo del gioco continua
    // a vincere su entrambi.
    env: { ...process.env, ...getActiveDisplayEnv(), ...cleanEnv },
    ...resolvedCwd ? { cwd: resolvedCwd } : {}
  };
  if (scopeLabel && ensureCapability()) {
    try {
      const unit = makeUnitName(scopeLabel.kind, scopeLabel.id);
      const wrapped = wrapArgsForScope(unit, bin, args);
      const child2 = (0, import_child_process8.spawn)(wrapped.bin, wrapped.args, spawnOpts);
      child2.unref();
      const supervisorPid = child2.pid ?? 0;
      register({ unit, kind: scopeLabel.kind, id: scopeLabel.id, title: scopeLabel.title, supervisorPid });
      resolveRealPidAsync(unit);
      writeLog("launch", `[PROCESS-MANAGER] Lancio avvolto in scope ${unit} (${bin} ${args.join(" ")})`);
      return { pid: supervisorPid, unit };
    } catch (err) {
      writeLog("warning", `[PROCESS-MANAGER] Avvolgimento in scope fallito, ripiego su lancio diretto: ${err}`);
    }
  }
  const child = (0, import_child_process8.spawn)(bin, args, spawnOpts);
  child.unref();
  return { pid: child.pid ?? 0 };
}
function gameLaunchLogPath(gameId) {
  const dir = import_path10.default.join(DATA_DIR, "game-logs");
  return import_path10.default.join(dir, `${gameId}-${Date.now()}.log`);
}
function binaryExists4(bin) {
  if (bin.startsWith("/")) return (0, import_fs10.existsSync)(bin);
  try {
    (0, import_child_process8.execSync)(`which ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function resolveBinaryPath(bin) {
  if (bin.startsWith("/")) return (0, import_fs10.existsSync)(bin) ? bin : null;
  try {
    return (0, import_child_process8.execSync)(`which ${bin}`, { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}
function getBinaryVersion(bin, flag = "--version") {
  try {
    return (0, import_child_process8.execSync)(`${bin} ${flag} 2>&1`).toString().split("\n")[0].trim();
  } catch {
    return "n/a";
  }
}
function resolveCaseInsensitive(base, relPath) {
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  let current = base;
  for (const part of parts) {
    if (!(0, import_fs10.existsSync)(current)) return import_path10.default.join(base, relPath.replace(/\\/g, "/"));
    const entries = (0, import_fs10.readdirSync)(current);
    const match = entries.find((e) => e.toLowerCase() === part.toLowerCase());
    if (!match) return import_path10.default.join(base, relPath.replace(/\\/g, "/"));
    current = import_path10.default.join(current, match);
  }
  return current;
}
function resolveLaunchCwd(exePath, configCwd) {
  const exeDir = import_path10.default.dirname(exePath);
  if (!configCwd) return exeDir;
  const expandedCwd = expandHome(configCwd);
  let cwd;
  if (import_path10.default.isAbsolute(expandedCwd) && (0, import_fs10.existsSync)(expandedCwd)) {
    cwd = expandedCwd;
  } else if (import_path10.default.isAbsolute(expandedCwd)) {
    cwd = (0, import_fs10.existsSync)(expandedCwd) ? expandedCwd : resolveCaseInsensitive(exeDir, import_path10.default.basename(expandedCwd));
  } else {
    cwd = resolveCaseInsensitive(exeDir, expandedCwd);
  }
  if (!(0, import_fs10.existsSync)(cwd)) {
    writeLog("warning", `[LAUNCH] launchCwd not found: ${cwd} \u2014 using exe directory`);
    return exeDir;
  }
  return cwd;
}
function applyFsrEnv(env, config) {
  if (config?.fsr) {
    env.WINE_FULLSCREEN_FSR = "1";
    env.WINE_FULLSCREEN_FSR_STRENGTH = "2";
  }
}
function applyMangoHudEnv(env, config, logPrefix) {
  if (config?.mangohud) {
    if (binaryExists4("mangohud")) {
      env.MANGOHUD = "1";
      env.MANGOHUD_DLSYM = "1";
      if (config.mangohud === 2) env.MANGOHUD_CONFIG = "preset=4";
    } else {
      writeLog("warning", `[${logPrefix}] MangoHud requested but not found \u2014 install mangohud`);
    }
  }
}
function applyProtonAnticheatEnv(env, config, logPrefix) {
  if (config?.eac) {
    const eacPath = (0, import_child_process8.execSync)(
      'find /usr/share/steam /home -name "eac_runtime" -type d 2>/dev/null | head -1',
      { encoding: "utf-8", timeout: 3e3 }
    ).trim();
    if (eacPath) env.PROTON_EAC_RUNTIME = eacPath;
    else writeLog("warning", `[${logPrefix}] EAC runtime not found`);
  }
  if (config?.battleye) {
    const bePath = (0, import_child_process8.execSync)(
      'find /usr/share/steam /home -name "battleye_runtime" -type d 2>/dev/null | head -1',
      { encoding: "utf-8", timeout: 3e3 }
    ).trim();
    if (bePath) env.PROTON_BATTLEYE_RUNTIME = bePath;
    else writeLog("warning", `[${logPrefix}] BattlEye runtime not found`);
  }
}
function resolveGameModeWrapping(config, logPrefix) {
  const useGameMode = !!(config?.gameMode && binaryExists4("gamemoderun"));
  if (config?.gameMode && !binaryExists4("gamemoderun")) {
    writeLog("warning", `[${logPrefix}] GameMode requested but gamemoderun not found \u2014 install gamemode`);
  }
  return useGameMode;
}
function detectMonitorResolution() {
  try {
    const out = (0, import_child_process8.execSync)("xrandr --current", { encoding: "utf-8" });
    const lines = out.split("\n");
    let startIdx = lines.findIndex((l) => /\bconnected\b/.test(l) && /\bprimary\b/.test(l));
    if (startIdx === -1) {
      startIdx = lines.findIndex((l) => /\bconnected\b/.test(l) && !/\bdisconnected\b/.test(l));
    }
    if (startIdx === -1) return null;
    let endIdx = lines.findIndex((l, i) => i > startIdx && /\b(dis)?connected\b/.test(l));
    if (endIdx === -1) endIdx = lines.length;
    const block = lines.slice(startIdx, endIdx).join("\n");
    const match = block.match(/(\d+)x(\d+)\s+[\d.]+\*/);
    if (match) {
      return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    }
  } catch {
  }
  return null;
}
function resolveGamescopeWrapping(launchBin, launchArgs, config, logPrefix) {
  const level = config?.gamescope ?? 0;
  if (!level) return { bin: launchBin, args: launchArgs };
  if (!binaryExists4("gamescope")) {
    writeLog("warning", `[${logPrefix}] Gamescope requested but not found \u2014 install gamescope`);
    return { bin: launchBin, args: launchArgs };
  }
  const gamescopeArgs = [];
  if (level === 1) {
    const res = detectMonitorResolution();
    if (res) {
      writeLog("launch", `[${logPrefix}] Gamescope: risoluzione monitor rilevata ${res.width}x${res.height}.`);
      gamescopeArgs.push("-W", String(res.width), "-H", String(res.height));
    } else {
      writeLog("warning", `[${logPrefix}] Gamescope: risoluzione monitor non rilevata (xrandr) \u2014 uso il default di Gamescope stesso.`);
    }
    gamescopeArgs.push("-f");
  } else if (level === 2) {
    gamescopeArgs.push("-W", "3840", "-H", "2160", "-f");
  } else if (level === 3) {
    const res = detectMonitorResolution();
    if (res) {
      writeLog("launch", `[${logPrefix}] Gamescope: risoluzione monitor rilevata ${res.width}x${res.height}.`);
      gamescopeArgs.push("-W", String(res.width), "-H", String(res.height));
    }
  }
  return { bin: "gamescope", args: [...gamescopeArgs, "--", launchBin, ...launchArgs] };
}
function resolveProtonBin(runnerId) {
  const candidates = [
    `${(0, import_os5.homedir)()}/.steam/steam/steamapps/common/${runnerId}/proton`,
    `${(0, import_os5.homedir)()}/.local/share/Steam/steamapps/common/${runnerId}/proton`,
    `${(0, import_os5.homedir)()}/.local/share/Steam/compatibilitytools.d/${runnerId}/proton`
  ];
  for (const p of candidates) {
    if ((0, import_fs10.existsSync)(p)) return p;
  }
  return null;
}
function buildGamescopePrefixString(config, logPrefix) {
  const level = config?.gamescope ?? 0;
  if (!level) return "";
  if (!binaryExists4("gamescope")) {
    writeLog("warning", `[${logPrefix}] Gamescope requested but not found \u2014 install gamescope`);
    return "";
  }
  const parts = ["gamescope"];
  if (level === 1) {
    const res = detectMonitorResolution();
    if (res) {
      writeLog("launch", `[${logPrefix}] Gamescope: risoluzione monitor rilevata ${res.width}x${res.height}.`);
      parts.push("-W", String(res.width), "-H", String(res.height));
    } else {
      writeLog("warning", `[${logPrefix}] Gamescope: risoluzione monitor non rilevata (xrandr) \u2014 uso il default di Gamescope stesso.`);
    }
    parts.push("-f");
  } else if (level === 2) {
    parts.push("-W", "3840", "-H", "2160", "-f");
  } else if (level === 3) {
    const res = detectMonitorResolution();
    if (res) {
      writeLog("launch", `[${logPrefix}] Gamescope: risoluzione monitor rilevata ${res.width}x${res.height}.`);
      parts.push("-W", String(res.width), "-H", String(res.height));
    }
  }
  parts.push("--");
  return parts.join(" ");
}
async function launchEpicViaLegendary(game, runner, config) {
  const legendaryBin = resolveBinaryPath("legendary");
  if (!legendaryBin) {
    return { success: false, message: "legendary non trovato. Installalo con: sudo pacman -S legendary (o yay -S legendary-git)" };
  }
  const appName = game.id.replace(/^epic-/, "");
  const isProton = runner instanceof ProtonRunner;
  const args = ["launch", appName];
  const env = { ...config?.env ?? {} };
  applyMangoHudEnv(env, config, "EPIC");
  applyFsrEnv(env, config);
  if (isProton) {
    const protonBin = resolveProtonBin(runner.id);
    if (!protonBin) {
      return { success: false, message: `Proton "${runner.id}" non trovato. Installalo via Steam o ProtonUp-Qt.` };
    }
    const prefix = expandHome(config?.prefix ?? `~/.local/share/proton-prefixes/${game.id}`);
    env.PROTON_USE_XALIA = env.PROTON_USE_XALIA ?? "0";
    const umuRunBin = config?.umuRun ? resolveBinaryPath("umu-run") : null;
    if (config?.umuRun && !umuRunBin) {
      writeLog("warning", `[EPIC] Umu-launcher richiesto per ${game.title} ma umu-run non \xE8 installato \u2014 fallback al wrapper Proton diretto.`);
    }
    if (umuRunBin) {
      const gamescopePrefixEpic = buildGamescopePrefixString(config, "EPIC");
      args.push("--no-wine", "--wrapper", gamescopePrefixEpic ? `${gamescopePrefixEpic} ${umuRunBin}` : umuRunBin);
      env.WINEPREFIX = import_path10.default.join(prefix, "pfx");
      env.PROTONPATH = import_path10.default.dirname(protonBin);
      env.GAMEID = `x-launcher-${game.id}`;
    } else {
      const gamescopePrefixEpic2 = buildGamescopePrefixString(config, "EPIC");
      args.push("--no-wine", "--wrapper", gamescopePrefixEpic2 ? `${gamescopePrefixEpic2} '${protonBin}' run` : `'${protonBin}' run`);
      env.STEAM_COMPAT_DATA_PATH = prefix;
      env.STEAM_COMPAT_CLIENT_INSTALL_PATH = `${(0, import_os5.homedir)()}/.local/share/Steam`;
    }
    applyProtonAnticheatEnv(env, config, "EPIC");
  } else {
    const lutrisBin = resolveBinaryPath("wine-lutris");
    const wineBin = lutrisBin ?? resolveBinaryPath("wine");
    if (wineBin && !lutrisBin) {
      writeLog("warning", `[WINE] 'wine-lutris' non trovato nel PATH del daemon \u2014 uso '${wineBin}' (wine di sistema) al suo posto per ${game.title}. Se la build Lutris \xE8 installata altrove, verifica il PATH di xdash.service.`);
    }
    if (!wineBin) {
      return { success: false, message: "Wine non trovato. Installa con: sudo pacman -S wine" };
    }
    const prefix = expandHome(config?.prefix ?? `~/.local/share/wineprefixes/${game.id}`);
    args.push("--wine", wineBin, "--wine-prefix", prefix);
  }
  if (config?.args && config.args.length > 0) {
    args.push("--", ...config.args);
  }
  const useGameMode = resolveGameModeWrapping(config, "EPIC");
  const launchBin = useGameMode ? "gamemoderun" : legendaryBin;
  const launchArgs = useGameMode ? [legendaryBin, ...args] : args;
  writeLog("launch", `[EPIC] ${launchBin} ${launchArgs.join(" ")}`);
  const gamescopeWrap = isProton ? { bin: launchBin, args: launchArgs } : resolveGamescopeWrapping(launchBin, launchArgs, config, "EPIC");
  const logPath = gameLaunchLogPath(game.id);
  const { pid, unit } = spawnDetached(gamescopeWrap.bin, gamescopeWrap.args, env, void 0, logPath, { id: game.id, title: game.title, kind: "game" });
  const gamescopeActive = (config?.gamescope ?? 0) > 0;
  return { success: true, pid, unit, message: gamescopeActive ? `Launched via Gamescope + legendary (${runner.name})` : `Launched via legendary (${runner.name})`, logPath };
}
function findRetroarchBin() {
  if (binaryExists4("retroarch")) {
    writeLog("launch", "[RETROARCH] Found in system PATH");
    return "retroarch";
  }
  const absoluteCandidates = [
    "/usr/bin/retroarch",
    "/usr/local/bin/retroarch",
    "/bin/retroarch",
    `${(0, import_os5.homedir)()}/.local/bin/retroarch`,
    "/opt/retroarch/bin/retroarch",
    "/opt/RetroArch/retroarch"
  ];
  for (const p of absoluteCandidates) {
    if ((0, import_fs10.existsSync)(p)) {
      writeLog("launch", `[RETROARCH] Found absolute path: ${p}`);
      return p;
    }
  }
  try {
    (0, import_child_process8.execSync)("flatpak info org.libretro.RetroArch", { stdio: "ignore" });
    writeLog("launch", "[RETROARCH] Found as flatpak");
    return "flatpak run org.libretro.RetroArch";
  } catch {
  }
  writeLog("warning", `[RETROARCH] Not found. Daemon's PATH: ${process.env.PATH}`);
  return null;
}
function getCoreDirs() {
  return [
    // Installazioni utente (priorità)
    `${(0, import_os5.homedir)()}/.config/retroarch/cores`,
    `${(0, import_os5.homedir)()}/.local/share/retroarch/cores`,
    // Flatpak — container con path fisso
    `${(0, import_os5.homedir)()}/.var/app/org.libretro.RetroArch/config/retroarch/cores`,
    // Pacchetti di sistema
    "/usr/lib/libretro",
    "/usr/lib64/libretro",
    "/usr/share/libretro/cores"
  ];
}
function openSteamBigPicture() {
  if (!binaryExists4("steam")) {
    return { success: false, message: "Steam non trovato nel PATH." };
  }
  spawnDetached("steam", ["-gamepadui"]);
  return { success: true, message: "Steam Big Picture avviato." };
}
var import_child_process8, import_fs10, import_os5, import_path10, WineRunner, ProtonRunner, DOSBoxRunner, RetroArchRunner, SteamNativeRunner, ScummVMRunner;
var init_implementations = __esm({
  "src/backend/runners/implementations.ts"() {
    "use strict";
    init_base3();
    import_child_process8 = require("child_process");
    import_fs10 = require("fs");
    import_os5 = require("os");
    import_path10 = __toESM(require("path"), 1);
    init_logger();
    init_paths();
    init_processManager();
    init_activeDisplay();
    WineRunner = class extends BaseRunner {
      id = "Wine-Lutris";
      name = "Wine (Lutris Build)";
      async launch(game, config) {
        const lutrisBin = resolveBinaryPath("wine-lutris");
        const wineBin = lutrisBin ?? resolveBinaryPath("wine");
        if (wineBin && !lutrisBin) {
          writeLog("warning", `[WINE] 'wine-lutris' non trovato nel PATH del daemon \u2014 uso '${wineBin}' (wine di sistema) al suo posto per ${game.title}. Se la build Lutris \xE8 installata altrove, verifica il PATH di xdash.service.`);
        }
        if (!wineBin) {
          return { success: false, message: `Wine non trovato. Installa con: sudo pacman -S wine` };
        }
        if (!game.executablePath) {
          return { success: false, message: `Nessun percorso eseguibile per ${game.title}` };
        }
        const prefix = expandHome(config?.prefix ?? `~/.local/share/wineprefixes/${game.id}`);
        const exePath = expandHome(game.executablePath);
        const cwd = resolveLaunchCwd(exePath, config?.cwd);
        const env = {
          WINEPREFIX: prefix,
          WINEDEBUG: "-all",
          DXVK_ASYNC: "1",
          ...config?.env ?? {}
        };
        applyFsrEnv(env, config);
        applyMangoHudEnv(env, config, "WINE");
        const useGameMode = resolveGameModeWrapping(config, "WINE");
        const launchBin = useGameMode ? "gamemoderun" : wineBin;
        const launchArgs = useGameMode ? [wineBin, exePath, ...config?.args ?? []] : [exePath, ...config?.args ?? []];
        const gamescopeWrap = resolveGamescopeWrapping(launchBin, launchArgs, config, "WINE");
        writeLog("launch", `[WINE] WINEPREFIX=${prefix} cwd=${cwd} ${gamescopeWrap.bin} ${gamescopeWrap.args.join(" ")}`);
        const logPath = gameLaunchLogPath(game.id);
        const { pid, unit } = spawnDetached(gamescopeWrap.bin, gamescopeWrap.args, { ...env, cwd }, void 0, logPath, { id: game.id, title: game.title, kind: "game" });
        return { success: true, pid, unit, message: `Launched via ${gamescopeWrap.bin === "gamescope" ? `Gamescope + ${launchBin}` : launchBin} (prefix: ${prefix})`, logPath };
      }
      async isAvailable() {
        return binaryExists4("wine-lutris") || binaryExists4("wine");
      }
      async version() {
        const bin = binaryExists4("wine-lutris") ? "wine-lutris" : "wine";
        return getBinaryVersion(bin);
      }
    };
    ProtonRunner = class extends BaseRunner {
      constructor(id, name) {
        super();
        this.id = id;
        this.name = name;
      }
      id;
      name;
      findProtonBin() {
        return resolveProtonBin(this.id);
      }
      async launch(game, config) {
        if (game.steamAppId) {
          if (!binaryExists4("steam")) return { success: false, message: "Steam non trovato." };
          writeLog("launch", `[PROTON] steam steam://run/${game.steamAppId}`);
          const { pid: pid2 } = spawnDetached("steam", [`steam://run/${game.steamAppId}`]);
          return { success: true, pid: pid2, message: `Steam launch: ${game.title}` };
        }
        const protonBin = this.findProtonBin();
        if (!protonBin) {
          return { success: false, message: `Proton "${this.id}" non trovato. Installalo via Steam o ProtonUp-Qt.` };
        }
        if (!game.executablePath) {
          return { success: false, message: `Nessun eseguibile per ${game.title}` };
        }
        const prefix = expandHome(config?.prefix ?? `~/.local/share/proton-prefixes/${game.id}`);
        const env = {
          STEAM_COMPAT_DATA_PATH: prefix,
          STEAM_COMPAT_CLIENT_INSTALL_PATH: `${(0, import_os5.homedir)()}/.local/share/Steam`,
          DXVK_ASYNC: "1",
          // v1.5.20-dev.31 — BUG REALE CONFERMATO, causa già diagnosticata
          // in una sessione precedente ma mai realmente corretta (verificato
          // nel sorgente reale di Proton allora — vedi CHANGELOG.md, sezione
          // sulla saga "finestra nera" — accantonato perché non era la causa
          // di QUEL sintomo, mai cablato nel codice reale, restato solo come
          // opzione manuale in launch-debug.sh). Xalia (ponte accessibilità/
          // gamepad di Proton per app non native) può agganciare processi
          // nella stessa sessione Wine, innescando protezioni anti-manomissione
          // — stesso pattern confermato con una issue reale di Proton (Far
          // Cry 4, VMProtect + xalia.exe, spam EXCEPTION_SINGLE_STEP) e
          // riprodotto identico dal vivo con Assassin's Creed
          // Syndicate/UplayLaunch.exe condividendo la prefix di Ubisoft
          // Connect. Disattivato di default per ogni lancio Proton — nessuna
          // perdita per chi non usa strumenti di accessibilità per giocare,
          // un rischio di crash in meno per chi condivide una prefix.
          PROTON_USE_XALIA: "0",
          ...config?.env ?? {}
        };
        applyFsrEnv(env, config);
        applyMangoHudEnv(env, config, "PROTON");
        applyProtonAnticheatEnv(env, config, "PROTON");
        const useGameMode = resolveGameModeWrapping(config, "PROTON");
        const exePath = expandHome(game.executablePath);
        const cwd = resolveLaunchCwd(exePath, config?.cwd);
        const umuRunBin = config?.umuRun ? resolveBinaryPath("umu-run") : null;
        if (config?.umuRun && !umuRunBin) {
          writeLog("warning", `[PROTON] Umu-launcher richiesto per ${game.title} ma umu-run non \xE8 installato \u2014 fallback al lancio Proton diretto.`);
        }
        let launchBin;
        let launchArgs;
        if (umuRunBin) {
          env.WINEPREFIX = import_path10.default.join(prefix, "pfx");
          env.PROTONPATH = import_path10.default.dirname(protonBin);
          env.GAMEID = `x-launcher-${game.id}`;
          const umuArgs = [exePath, ...config?.args ?? []];
          launchBin = useGameMode ? "gamemoderun" : umuRunBin;
          launchArgs = useGameMode ? [umuRunBin, ...umuArgs] : umuArgs;
          writeLog("launch", `[PROTON] (umu-run) ${launchBin} ${launchArgs.join(" ")}`);
        } else {
          const protonArgs = ["run", exePath, ...config?.args ?? []];
          launchBin = useGameMode ? "gamemoderun" : protonBin;
          launchArgs = useGameMode ? [protonBin, ...protonArgs] : protonArgs;
          writeLog("launch", `[PROTON] ${launchBin} ${launchArgs.join(" ")}`);
        }
        const envDebugKeys = Object.keys(env).filter(
          (k) => /^(WINE|DXVK|VKD3D|PROTON|STEAM_COMPAT|D3D|DXGI)/i.test(k) || /^GAMEID$/i.test(k)
        ).sort();
        writeLog("launch", `[PROTON-ENV] ${envDebugKeys.map((k) => `${k}=${env[k]}`).join(" | ")}`);
        const gamescopeWrap = resolveGamescopeWrapping(launchBin, launchArgs, config, "PROTON");
        const logPath = gameLaunchLogPath(game.id);
        const { pid, unit } = spawnDetached(gamescopeWrap.bin, gamescopeWrap.args, env, cwd, logPath, { id: config?.scopeId ?? game.id, title: game.title, kind: config?.scopeKind ?? "game" });
        return { success: true, pid, unit, message: gamescopeWrap.bin === "gamescope" ? `Launched via Gamescope + ${this.name}` : `Launched via ${this.name}`, logPath };
      }
      async isAvailable() {
        return this.findProtonBin() !== null || binaryExists4("steam");
      }
      async version() {
        const bin = this.findProtonBin();
        return bin ? getBinaryVersion(bin, "--version") : "not installed";
      }
    };
    DOSBoxRunner = class extends BaseRunner {
      id = "DOSBox";
      name = "DOSBox Staging";
      get bin() {
        return binaryExists4("dosbox-staging") ? "dosbox-staging" : "dosbox";
      }
      async launch(game, config) {
        if (!binaryExists4(this.bin)) {
          return { success: false, message: `DOSBox non trovato. Installa con: sudo apt install dosbox-staging` };
        }
        const args = [];
        if (game.executablePath) {
          const dir = import_path10.default.dirname(expandHome(game.executablePath));
          const exe = import_path10.default.basename(game.executablePath);
          args.push("-c", `mount C "${dir}"`, "-c", "C:", "-c", exe, "-c", "exit");
        }
        if (game.dosboxConf) args.push("-conf", expandHome(game.dosboxConf));
        args.push(...config?.args ?? []);
        writeLog("launch", `[DOSBOX] ${this.bin} ${args.join(" ")}`);
        const { pid, unit } = spawnDetached(this.bin, args, {}, void 0, void 0, { id: game.id, title: game.title, kind: "game" });
        return { success: true, pid, unit, message: `DOSBox session active` };
      }
      async isAvailable() {
        return binaryExists4("dosbox-staging") || binaryExists4("dosbox");
      }
      async version() {
        return getBinaryVersion(this.bin);
      }
    };
    RetroArchRunner = class extends BaseRunner {
      id = "RetroArch";
      name = "RetroArch (Libretro)";
      /**
       * Risolve il core a un percorso assoluto.
       *
       * Il classicPlugin salva solo il nome file del core (es. "genesis_plus_gx_libretro.so")
       * perché al momento della scansione non conosce il path di installazione.
       * RetroArch vuole il path assoluto con -L; passare solo il nome file lo avvia
       * senza core (comportamento silente: la ROM non parte).
       *
       * Logica:
       *   1. Path assoluto esistente → usalo così com'è
       *   2. Nome file → cerca in tutte le directory (incluse flatpak)
       *   3. Non trovato → passa il valore originale, RetroArch loggherà l'errore
       */
      resolveCore(core) {
        const expanded = expandHome(core);
        if (import_path10.default.isAbsolute(expanded) && (0, import_fs10.existsSync)(expanded)) return expanded;
        const filename = import_path10.default.basename(expanded);
        for (const dir of getCoreDirs()) {
          const candidate = import_path10.default.join(dir, filename);
          if ((0, import_fs10.existsSync)(candidate)) {
            writeLog("launch", `[RETROARCH] Core resolved: ${filename} \u2192 ${candidate}`);
            return candidate;
          }
        }
        writeLog("warning", `[RETROARCH] Core not found: ${core} \u2014 passing original value`);
        return expanded;
      }
      async launch(game, config) {
        const bin = findRetroarchBin();
        if (!bin) {
          return { success: false, message: "RetroArch non trovato. Installa con: sudo pacman -S retroarch" };
        }
        const resolvedCore = game.libretroCore ? this.resolveCore(game.libretroCore) : null;
        if (game.libretroCore && !resolvedCore) {
          writeLog("warning", `[RETROARCH] Launching without core: ${game.libretroCore} not found`);
        }
        const isFlatpak = bin.startsWith("flatpak ");
        const args = [];
        if (isFlatpak) args.push("run", "org.libretro.RetroArch");
        args.push("--fullscreen");
        if (resolvedCore) args.push("-L", resolvedCore);
        if (game.executablePath) args.push(expandHome(game.executablePath));
        args.push(...config?.args ?? []);
        const binExe = isFlatpak ? "flatpak" : bin;
        const coreLabel = resolvedCore ? import_path10.default.basename(resolvedCore).replace("_libretro.so", "") : "core da DB RetroArch";
        writeLog("launch", `[RETROARCH] ${binExe} ${args.join(" ")}`);
        const logPath = gameLaunchLogPath(game.id);
        const { pid, unit } = spawnDetached(binExe, args, {}, void 0, logPath, { id: game.id, title: game.title, kind: "game" });
        return { success: true, pid, unit, message: `RetroArch avviato (${isFlatpak ? "flatpak" : "system"}) \u2014 core: ${coreLabel}`, logPath };
      }
      async isAvailable() {
        return findRetroarchBin() !== null;
      }
      async version() {
        const bin = findRetroarchBin();
        if (!bin) return "not installed";
        const cmd = bin.startsWith("flatpak ") ? "flatpak run org.libretro.RetroArch" : bin;
        return getBinaryVersion(cmd, "--version");
      }
    };
    SteamNativeRunner = class extends BaseRunner {
      id = "Steam Native";
      name = "Steam (Native)";
      async launch(game, config) {
        if (!binaryExists4("steam")) {
          return { success: false, message: "Steam non trovato nel PATH." };
        }
        if (!game.steamAppId) {
          return { success: false, message: `Nessun Steam App ID per ${game.title}` };
        }
        writeLog("launch", `[STEAM] Launching via URI: steam://rungameid/${game.steamAppId}`);
        const { pid } = spawnDetached("steam", [`steam://rungameid/${game.steamAppId}`]);
        return { success: true, pid, message: `Steam: avvio ${game.title} (AppID ${game.steamAppId})` };
      }
      async isAvailable() {
        return binaryExists4("steam");
      }
      async version() {
        return getBinaryVersion("steam", "--version");
      }
    };
    ScummVMRunner = class extends BaseRunner {
      id = "ScummVM";
      name = "ScummVM";
      async launch(game, config) {
        if (!binaryExists4("scummvm")) {
          return { success: false, message: `ScummVM non trovato. Installa con: sudo apt install scummvm` };
        }
        const args = ["--fullscreen"];
        if (game.scummvmId) {
          args.push(game.scummvmId);
        } else if (game.executablePath) {
          args.push("--path=" + expandHome(import_path10.default.dirname(game.executablePath)));
        }
        args.push(...config?.args ?? []);
        writeLog("launch", `[SCUMMVM] scummvm ${args.join(" ")}`);
        const { pid, unit } = spawnDetached("scummvm", args, {}, void 0, void 0, { id: game.id, title: game.title, kind: "game" });
        return { success: true, pid, unit, message: `ScummVM engine active` };
      }
      async isAvailable() {
        return binaryExists4("scummvm");
      }
      async version() {
        return getBinaryVersion("scummvm", "--version");
      }
    };
  }
});

// src/backend/archiveExtractors.ts
function findExtractorFor(filePath) {
  const ext = filePath.toLowerCase().slice(filePath.toLowerCase().lastIndexOf("."));
  return ARCHIVE_EXTRACTORS.find((e) => e.extensions.includes(ext));
}
function binaryExists8(bin) {
  try {
    (0, import_child_process15.execFileSync)("which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function extractArchive(archivePath, destDir) {
  const extractor = findExtractorFor(archivePath);
  if (!extractor) {
    return { success: false, message: `Nessun estrattore registrato per ${archivePath}` };
  }
  if (!extractor.supported) {
    return { success: false, message: `Formato .${extractor.extensions[0].slice(1)} non ancora supportato per l'estrazione (solo rilevato)` };
  }
  if (!(0, import_fs16.existsSync)(archivePath)) {
    return { success: false, message: `File non trovato: ${archivePath}` };
  }
  if (!binaryExists8(extractor.binary)) {
    return { success: false, message: `manca '${extractor.binary}'? installa con: sudo pacman -S ${extractor.id === "7z" ? "p7zip" : extractor.binary}` };
  }
  try {
    (0, import_child_process15.execFileSync)(extractor.binary, extractor.buildArgs(archivePath, destDir), { timeout: 12e4 });
    return { success: true };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}
var import_fs16, import_child_process15, ARCHIVE_EXTRACTORS, ARCHIVE_EXTENSIONS;
var init_archiveExtractors = __esm({
  "src/backend/archiveExtractors.ts"() {
    "use strict";
    import_fs16 = require("fs");
    import_child_process15 = require("child_process");
    ARCHIVE_EXTRACTORS = [
      {
        id: "unzip",
        extensions: [".zip"],
        binary: "unzip",
        supported: true,
        buildArgs: (archivePath, destDir) => ["-o", "-q", archivePath, "-d", destDir]
      },
      {
        id: "7z",
        extensions: [".7z"],
        binary: "7z",
        supported: true,
        buildArgs: (archivePath, destDir) => ["x", "-y", `-o${destDir}`, archivePath]
      },
      {
        id: "unrar",
        extensions: [".rar"],
        binary: "unrar",
        supported: false,
        // vedi commento in cima al file
        buildArgs: (archivePath, destDir) => ["x", "-o+", archivePath, destDir + "/"]
      }
    ];
    ARCHIVE_EXTENSIONS = new Set(ARCHIVE_EXTRACTORS.flatMap((e) => e.extensions));
  }
});

// src/backend/plugins/classicPlugin.ts
var classicPlugin_exports = {};
__export(classicPlugin_exports, {
  COMPATIBLE_CORES_BY_SYSTEM: () => COMPATIBLE_CORES_BY_SYSTEM,
  ClassicPlugin: () => ClassicPlugin,
  REMASTER_PRESETS: () => REMASTER_PRESETS,
  getDefaultCoreForSystem: () => getDefaultCoreForSystem,
  hasRemasterPreset: () => hasRemasterPreset,
  removeRemasterOptions: () => removeRemasterOptions,
  writeRemasterOptions: () => writeRemasterOptions
});
function ensureSystemFolders(romsRoot) {
  for (const folder of CANONICAL_SYSTEM_FOLDERS) {
    const dir = import_path15.default.join(romsRoot, folder);
    try {
      (0, import_fs17.mkdirSync)(dir, { recursive: true });
    } catch (err) {
      writeLog("warning", `[CLASSIC] Could not create folder ${dir}: ${err}`);
    }
  }
}
function getDefaultCoreForSystem(canonical) {
  for (const info of Object.values(SYSTEM_MAP)) {
    if (info.canonical === canonical) return info.core;
  }
  return void 0;
}
function detectSystem(dirName) {
  const key = dirName.toLowerCase();
  for (const [k, v] of Object.entries(SYSTEM_MAP)) {
    if (key === k || key.startsWith(k) || key.includes(k)) return v;
  }
  return UNKNOWN_SYSTEM;
}
function makeGameId(romPath) {
  let hash = 5381;
  for (let i = 0; i < romPath.length; i++) {
    hash = (hash << 5) + hash ^ romPath.charCodeAt(i);
    hash = hash >>> 0;
  }
  const hex = hash.toString(16).padStart(8, "0");
  const safeName = import_path15.default.basename(romPath, import_path15.default.extname(romPath)).replace(/[^a-zA-Z0-9]/g, "_").slice(0, 16).toLowerCase();
  return `classic-${safeName}-${hex}`;
}
function isRomFile(filename) {
  return ROM_EXTENSIONS.has(import_path15.default.extname(filename).toLowerCase());
}
function titleFromFilename(filename) {
  return import_path15.default.basename(filename, import_path15.default.extname(filename)).replace(/[_\-]/g, " ").replace(/\s+/g, " ").trim();
}
function findPrimaryDiscFile(dir, maxDepth = 3) {
  let currentLevelDirs = [dir];
  for (let depth = 0; depth <= maxDepth; depth++) {
    const nextLevelDirs = [];
    for (const currentDir of currentLevelDirs) {
      let entries;
      try {
        entries = (0, import_fs17.readdirSync)(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ext of [".gdi", ".cue", ".chd", ".iso"]) {
        const found = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith(ext));
        if (found) return import_path15.default.join(currentDir, found.name);
      }
      for (const e of entries) {
        if (e.isDirectory()) nextLevelDirs.push(import_path15.default.join(currentDir, e.name));
      }
    }
    currentLevelDirs = nextLevelDirs;
    if (currentLevelDirs.length === 0) break;
  }
  return null;
}
function groupDiscs(candidates, canonicalSystem) {
  const multiDisc = /* @__PURE__ */ new Map();
  if (!canonicalSystem || !MULTI_DISC_SYSTEMS.has(canonicalSystem)) {
    return { singles: candidates, multiDisc };
  }
  const groups = /* @__PURE__ */ new Map();
  const untagged = [];
  for (const candidate of candidates) {
    const stem = candidate.kind === "file" ? import_path15.default.basename(candidate.name, import_path15.default.extname(candidate.name)) : candidate.name;
    const match = stem.match(DISC_TAG_RE);
    if (!match) {
      untagged.push(candidate);
      continue;
    }
    const baseTitle = stem.slice(0, match.index).trim() || stem.replace(DISC_TAG_RE, "").trim();
    const discNumber = parseInt(match[1], 10);
    if (!groups.has(baseTitle)) groups.set(baseTitle, []);
    groups.get(baseTitle).push({ discNumber, candidate });
  }
  const singles = [...untagged];
  for (const [baseTitle, discs] of groups) {
    if (discs.length >= 2) {
      discs.sort((a, b) => a.discNumber - b.discNumber);
      multiDisc.set(baseTitle, discs);
    } else {
      singles.push(discs[0].candidate);
    }
  }
  return { singles, multiDisc };
}
function findMatchingCueInDir(dir, zipBaseName) {
  try {
    const normalizedBase = zipBaseName.toLowerCase();
    const entries = (0, import_fs17.readdirSync)(dir, { withFileTypes: true });
    for (const ext of [".gdi", ".cue", ".chd", ".iso"]) {
      const loose = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(ext)).find((e) => e.name.toLowerCase().startsWith(normalizedBase));
      if (loose) return import_path15.default.join(dir, loose.name);
    }
    const subDir = entries.find((e) => e.isDirectory() && e.name.toLowerCase() === normalizedBase);
    if (subDir) {
      const found = findPrimaryDiscFile(import_path15.default.join(dir, subDir.name));
      if (found) return found;
    }
    return null;
  } catch {
    return null;
  }
}
function hasRemasterPreset(canonicalSystem) {
  return !!canonicalSystem && canonicalSystem in REMASTER_PRESETS;
}
function writeRemasterOptions(contentPath, canonicalSystem) {
  const preset = REMASTER_PRESETS[canonicalSystem];
  if (!preset) return;
  const configHome = process.env.XDG_CONFIG_HOME || import_path15.default.join((0, import_os7.homedir)(), ".config");
  const optDir = import_path15.default.join(configHome, "retroarch", "config", preset.coreDisplayName);
  const contentName = import_path15.default.basename(contentPath, import_path15.default.extname(contentPath));
  const optPath = import_path15.default.join(optDir, `${contentName}.opt`);
  const optContent = preset.optionLines.join("\n") + "\n";
  try {
    (0, import_fs17.mkdirSync)(optDir, { recursive: true });
    if (!(0, import_fs17.existsSync)(optPath)) {
      (0, import_fs17.writeFileSync)(optPath, optContent, "utf-8");
      writeLog("info", `[CLASSIC] Preset auto-remaster (${canonicalSystem}) scritto: ${optPath}`);
    }
  } catch (err) {
    writeLog("warning", `[CLASSIC] Scrittura preset auto-remaster (${canonicalSystem}) fallita (${optPath}): ${err}`);
  }
}
function removeRemasterOptions(contentPath, canonicalSystem) {
  const preset = REMASTER_PRESETS[canonicalSystem];
  if (!preset) return;
  if (preset.mode !== "toggle-options") {
    writeLog("warning", `[CLASSIC] removeRemasterOptions chiamata su un preset 'swap-core' (${canonicalSystem}) \u2014 ignorata, il file non va rimosso in questa modalit\xE0.`);
    return;
  }
  const configHome = process.env.XDG_CONFIG_HOME || import_path15.default.join((0, import_os7.homedir)(), ".config");
  const optDir = import_path15.default.join(configHome, "retroarch", "config", preset.coreDisplayName);
  const contentName = import_path15.default.basename(contentPath, import_path15.default.extname(contentPath));
  const optPath = import_path15.default.join(optDir, `${contentName}.opt`);
  try {
    if ((0, import_fs17.existsSync)(optPath)) {
      (0, import_fs17.unlinkSync)(optPath);
      writeLog("info", `[CLASSIC] Preset auto-remaster (${canonicalSystem}) rimosso: ${optPath}`);
    }
  } catch (err) {
    writeLog("warning", `[CLASSIC] Rimozione preset auto-remaster (${canonicalSystem}) fallita (${optPath}): ${err}`);
  }
}
var import_fs17, import_os7, import_path15, SYSTEM_MAP, COMPATIBLE_CORES_BY_SYSTEM, UNKNOWN_SYSTEM, CANONICAL_SYSTEM_FOLDERS, ROM_EXTENSIONS, CD_BASED_SYSTEMS, MULTI_DISC_SYSTEMS, DISC_TAG_RE, REMASTER_PRESETS, ClassicPlugin;
var init_classicPlugin = __esm({
  "src/backend/plugins/classicPlugin.ts"() {
    "use strict";
    init_base2();
    init_logger();
    import_fs17 = require("fs");
    import_os7 = require("os");
    import_path15 = __toESM(require("path"), 1);
    init_archiveExtractors();
    SYSTEM_MAP = {
      // SNES
      "snes": { runner: "RetroArch", core: "snes9x_libretro.so", label: "Super Nintendo", genre: "Platformer", canonical: "snes" },
      "sfc": { runner: "RetroArch", core: "snes9x_libretro.so", label: "Super Famicom", genre: "Platformer", canonical: "snes" },
      // NES
      "nes": { runner: "RetroArch", core: "nestopia_libretro.so", label: "Nintendo NES", genre: "Platformer", canonical: "nes" },
      "fc": { runner: "RetroArch", core: "nestopia_libretro.so", label: "Famicom", genre: "Platformer", canonical: "nes" },
      // GBA
      "gba": { runner: "RetroArch", core: "mgba_libretro.so", label: "Game Boy Advance", genre: "Action", canonical: "gba" },
      // GBC / GB
      "gbc": { runner: "RetroArch", core: "gambatte_libretro.so", label: "Game Boy Color", genre: "Action", canonical: "gbc" },
      "gb": { runner: "RetroArch", core: "gambatte_libretro.so", label: "Game Boy", genre: "Action", canonical: "gb" },
      // Sega
      "md": { runner: "RetroArch", core: "genesis_plus_gx_libretro.so", label: "Sega Mega Drive", genre: "Action", canonical: "genesis" },
      "mega": { runner: "RetroArch", core: "genesis_plus_gx_libretro.so", label: "Sega Mega Drive", genre: "Action", canonical: "genesis" },
      "genesis": { runner: "RetroArch", core: "genesis_plus_gx_libretro.so", label: "Sega Genesis", genre: "Action", canonical: "genesis" },
      "sms": { runner: "RetroArch", core: "genesis_plus_gx_libretro.so", label: "Sega Master System", genre: "Action", canonical: "mastersystem" },
      "ms": { runner: "RetroArch", core: "genesis_plus_gx_libretro.so", label: "Sega Master System", genre: "Action", canonical: "mastersystem" },
      "mastersystem": { runner: "RetroArch", core: "genesis_plus_gx_libretro.so", label: "Sega Master System", genre: "Action", canonical: "mastersystem" },
      // PlayStation
      // v1.1.96 — segnalato dall'utente: pcsx_rearmed è ottimizzato per ARM
      // (il nome stesso lo dice) e non risulta più pacchettizzato in modo
      // affidabile per x86_64 su Arch — il pacchetto trovabile con una
      // ricerca reale è specifico per Arch Linux ARM, non per i repository
      // x86_64 standard. mednafen_psx (pacchetto Arch: libretro-beetle-psx,
      // confermato attuale su extra/x86_64) è il default più sensato su
      // desktop x86_64, e l'utente lo ha già verificato funzionante sul
      // proprio sistema con lo stesso identico gioco.
      "psx": { runner: "RetroArch", core: "mednafen_psx_libretro.so", label: "PlayStation", genre: "Action", canonical: "psx" },
      "ps1": { runner: "RetroArch", core: "mednafen_psx_libretro.so", label: "PlayStation", genre: "Action", canonical: "psx" },
      "psp": { runner: "RetroArch", core: "ppsspp_libretro.so", label: "PSP", genre: "Action", canonical: "psp" },
      // N64
      "n64": { runner: "RetroArch", core: "mupen64plus_next_libretro.so", label: "Nintendo 64", genre: "Action", canonical: "n64" },
      // Sega Saturn — core di default Yabause (Kronos è il fork potenziato,
      // usato solo con l'auto-remaster attivo, vedi REMASTER_PRESETS più sotto).
      // Dump a .cue+.bin come PSX → richiede lo stesso trattamento CD_BASED_SYSTEMS.
      "saturn": { runner: "RetroArch", core: "yabause_libretro.so", label: "Sega Saturn", genre: "Action", canonical: "saturn" },
      "sat": { runner: "RetroArch", core: "yabause_libretro.so", label: "Sega Saturn", genre: "Action", canonical: "saturn" },
      // PS2 — unico core (lrpcs2/pcsx2_libretro), sia per il default che per
      // l'auto-remaster (modalità toggle-options, vedi REMASTER_PRESETS).
      // Dump a .iso singolo file — se zippato, dalla v2.1.11-dev.8 rientra
      // comunque in CD_BASED_SYSTEMS per l'estrazione persistente (vedi
      // extractCdImageIfNeeded); se già sciolto, nessuna estrazione
      // necessaria, si comporta come i sistemi a cartuccia.
      "ps2": { runner: "RetroArch", core: "pcsx2_libretro.so", label: "PlayStation 2", genre: "Action", canonical: "ps2" },
      // Dreamcast — core flycast (unico core libretro mantenuto attivamente
      // per questo sistema), path verificato da fonte ufficiale Arch Linux
      // (pacchetto libretro-flycast, repo extra). Dump a .chd o cartella
      // GDI non zippata (.gdi+.cue+.bin sciolti, vedi findPrimaryDiscFile) —
      // se zippato, dalla v2.1.11-dev.8 rientra in CD_BASED_SYSTEMS come PS2.
      // Preset Auto-Remaster non ancora aggiunto: serve lo stesso file .opt
      // reale verificato per Saturn/PS2 prima di popolare REMASTER_PRESETS.
      "dreamcast": { runner: "RetroArch", core: "flycast_libretro.so", label: "Dreamcast", genre: "Action", canonical: "dreamcast" },
      "dc": { runner: "RetroArch", core: "flycast_libretro.so", label: "Dreamcast", genre: "Action", canonical: "dreamcast" },
      // Arcade / MAME
      "mame": { runner: "RetroArch", core: "mame_libretro.so", label: "Arcade (MAME)", genre: "Action", canonical: "arcade" },
      "arcade": { runner: "RetroArch", core: "mame_libretro.so", label: "Arcade (MAME)", genre: "Action", canonical: "arcade" },
      // DOS
      "dos": { runner: "DOSBox", core: void 0, label: "DOS", genre: "Adventure" },
      "dosbox": { runner: "DOSBox", core: void 0, label: "DOS", genre: "Adventure" },
      // ScummVM
      "scummvm": { runner: "ScummVM", core: void 0, label: "ScummVM", genre: "Adventure" },
      "adventure": { runner: "ScummVM", core: void 0, label: "Adventure", genre: "Adventure" }
    };
    COMPATIBLE_CORES_BY_SYSTEM = {
      snes: ["snes9x", "snes9x2010", "snes9x_2010", "bsnes", "bsnes_hd", "bsnes_mercury_balanced", "bsnes_mercury_accuracy", "bsnes_mercury_performance", "mesen-s", "mesen_s"],
      nes: ["nestopia", "fceumm", "mesen", "quicknes"],
      gba: ["mgba", "vba_next", "vbam", "gpsp"],
      gbc: ["gambatte", "mgba", "sameboy", "tgbdual"],
      gb: ["gambatte", "mgba", "sameboy", "tgbdual"],
      genesis: ["genesis_plus_gx", "picodrive", "blastem"],
      mastersystem: ["genesis_plus_gx", "picodrive"],
      psx: ["mednafen_psx", "mednafen_psx_hw", "beetle_psx", "beetle_psx_hw", "pcsx_rearmed", "swanstation"],
      psp: ["ppsspp"],
      n64: ["mupen64plus_next", "parallel_n64"],
      saturn: ["yabause", "kronos"],
      ps2: ["pcsx2"],
      dreamcast: ["flycast"],
      arcade: ["mame", "mame2003_plus", "mame2010", "fbneo", "fbalpha2012"]
    };
    UNKNOWN_SYSTEM = {
      runner: "RetroArch",
      label: "Classic",
      genre: "Action"
    };
    CANONICAL_SYSTEM_FOLDERS = [
      "SNES",
      "NES",
      "GBA",
      "GBC",
      "GB",
      "MD",
      "SMS",
      "PSX",
      "PSP",
      "N64",
      "SATURN",
      "PS2",
      "DREAMCAST",
      "Mame",
      "DOS",
      "ScummVM"
    ];
    ROM_EXTENSIONS = /* @__PURE__ */ new Set([
      ...ARCHIVE_EXTRACTORS.filter((e) => e.supported).flatMap((e) => e.extensions),
      ".nes",
      ".fds",
      // NES / Famicom
      ".smc",
      ".sfc",
      // SNES / Super Famicom
      ".gb",
      ".gbc",
      ".gba",
      // Game Boy line
      ".sms",
      ".gg",
      // Sega Master System / Game Gear
      ".md",
      ".gen",
      ".bin",
      // Sega Mega Drive / Genesis
      ".n64",
      ".z64",
      ".v64",
      // Nintendo 64
      ".cue",
      ".img",
      ".iso",
      ".pbp",
      // PlayStation / PSP
      ".chd",
      // formato compresso a file singolo (Dreamcast/PS2/Saturn)
      ".cso",
      // PSP compressed
      ".rom"
      // generic
    ]);
    CD_BASED_SYSTEMS = /* @__PURE__ */ new Set(["psx", "saturn", "dreamcast", "ps2"]);
    MULTI_DISC_SYSTEMS = /* @__PURE__ */ new Set(["psx", "saturn", "dreamcast"]);
    DISC_TAG_RE = /[\s._-]*[([](?:disc|disk|cd)[\s_]*0*(\d+)[)\]]/i;
    REMASTER_PRESETS = {
      // Verificato su hardware reale dall'utente, incluso un secondo giro per
      // un difetto emerso nel test (testo "posterizzato": risolto escludendo
      // il filtro dagli sprite + colore a 32bpp con dithering disabilitato,
      // entrambi documentati come fix noti per questo sintomo).
      psx: {
        mode: "swap-core",
        remasterCore: "mednafen_psx_hw_libretro.so",
        defaultCore: "mednafen_psx_libretro.so",
        coreDisplayName: "Beetle PSX HW",
        optionLines: [
          'beetle_psx_hw_renderer = "hardware_vk"',
          'beetle_psx_hw_internal_resolution = "2x"',
          'beetle_psx_hw_filter = "bilinear"',
          'beetle_psx_hw_filter_exclude_sprite = "enabled"',
          'beetle_psx_hw_depth = "32bpp"',
          'beetle_psx_hw_dither_mode = "disabled"',
          'beetle_psx_hw_msaa = "2x"',
          'beetle_psx_hw_pgxp_mode = "memory"'
        ]
      },
      // Stesso schema di PSX: Kronos è il fork potenziato di Yabause. Preset
      // preso di peso dal file .opt reale usato dall'utente per Sega Rally
      // Championship (confermato: "prendi i file Saturn e PS2 come riferimento
      // per entrambi, si può sempre modificare a mano da RetroArch se qualcosa
      // non funziona" — nessuna curatela/sottoinsieme, file verbatim).
      saturn: {
        mode: "swap-core",
        remasterCore: "kronos_libretro.so",
        defaultCore: "yabause_libretro.so",
        coreDisplayName: "Kronos",
        optionLines: [
          'kronos_addon_cartridge = "4M_backup_ram"',
          'kronos_bandingmode = "enabled"',
          'kronos_force_downsampling = "enabled"',
          'kronos_force_hle_bios = "disabled"',
          'kronos_language_id = "English"',
          'kronos_meshmode = "enabled"',
          'kronos_multitap_port1 = "disabled"',
          'kronos_multitap_port2 = "disabled"',
          'kronos_resolution_mode = "8X"',
          'kronos_service_enabled = "disabled"',
          'kronos_skipframe = "0"',
          'kronos_stv_favorite_region = "EU"',
          'kronos_use_beetle_saves = "disabled"',
          'kronos_usecache = "disabled"',
          'kronos_video_filter_type = "0"',
          'kronos_videoformattype = "auto"',
          'kronos_wireframe_mode = "disabled"'
        ]
      },
      // Unico core PS2 (lrpcs2/pcsx2_libretro): modalità toggle-options, non
      // swap-core. Preset preso di peso dal file .opt reale usato dall'utente
      // per Metal Gear Solid 3 - Snake Eater (stessa nota di Saturn sopra).
      ps2: {
        mode: "toggle-options",
        core: "pcsx2_libretro.so",
        coreDisplayName: "LRPS2",
        optionLines: [
          'pcsx2_align_sprite = "disabled"',
          'pcsx2_analog_mode1 = "disabled"',
          'pcsx2_analog_mode2 = "disabled"',
          'pcsx2_anisotropic_filtering = "8x"',
          'pcsx2_auto_flush = "disabled"',
          'pcsx2_auto_flush_software = "enabled"',
          'pcsx2_axis_deadzone1 = "15%"',
          'pcsx2_axis_deadzone2 = "15%"',
          'pcsx2_axis_scale1 = "133%"',
          'pcsx2_axis_scale2 = "133%"',
          'pcsx2_bios = "ps2-0170a-20030325.bin"',
          'pcsx2_blending_accuracy = "Medium"',
          'pcsx2_button_deadzone1 = "0%"',
          'pcsx2_button_deadzone2 = "0%"',
          'pcsx2_cpu_sprite_level = "Sprites Only"',
          'pcsx2_cpu_sprite_size = "0"',
          'pcsx2_deinterlace_mode = "Automatic"',
          'pcsx2_dev9_eth = "disabled"',
          'pcsx2_dev9_hdd = "disabled"',
          'pcsx2_dev9_hdd_size = "40 GiB"',
          'pcsx2_disable_depth_conversion = "disabled"',
          'pcsx2_disable_interlace_offset = "disabled"',
          'pcsx2_disable_partial_invalidation = "disabled"',
          'pcsx2_dithering = "Unscaled"',
          'pcsx2_ee_accurate_fpu = "enabled"',
          'pcsx2_ee_cpu = "Recompiler"',
          'pcsx2_ee_cycle_rate = "100% (Normal Speed)"',
          'pcsx2_ee_cycle_skip = "disabled"',
          'pcsx2_enable_cheats = "disabled"',
          'pcsx2_enable_hw_hacks = "disabled"',
          'pcsx2_enable_rumble1 = "100%"',
          'pcsx2_enable_rumble2 = "100%"',
          'pcsx2_fastboot = "enabled"',
          'pcsx2_fastcdvd = "disabled"',
          'pcsx2_fastmem = "enabled"',
          'pcsx2_force_sprite_position = "disabled"',
          'pcsx2_fpu_softfloat = "disabled"',
          'pcsx2_framebuffer_conversion = "disabled"',
          'pcsx2_game_enhancements_hint = "disabled"',
          'pcsx2_gpu_palette_conversion = "disabled"',
          'pcsx2_gpu_target_clut = "disabled"',
          'pcsx2_half_pixel_offset = "disabled"',
          'pcsx2_hint_language_unlock = "disabled"',
          'pcsx2_hw_download_mode = "Accurate"',
          'pcsx2_instant_vu1 = "enabled"',
          'pcsx2_invert_left_stick1 = "disabled"',
          'pcsx2_invert_left_stick2 = "disabled"',
          'pcsx2_invert_right_stick1 = "disabled"',
          'pcsx2_invert_right_stick2 = "disabled"',
          'pcsx2_merge_sprite = "disabled"',
          'pcsx2_mtvu = "disabled"',
          'pcsx2_native_scaling = "disabled"',
          'pcsx2_nointerlacing_hint = "enabled"',
          'pcsx2_pcrtc_antiblur = "enabled"',
          'pcsx2_pcrtc_screen_offsets = "disabled"',
          'pcsx2_pgs_deblur = "disabled"',
          'pcsx2_pgs_disable_mipmaps = "disabled"',
          'pcsx2_pgs_high_res_scanout = "disabled"',
          'pcsx2_pgs_ss_tex = "disabled"',
          'pcsx2_pgs_ssaa = "Native"',
          'pcsx2_preload_frame_data = "disabled"',
          'pcsx2_renderer = "Auto"',
          'pcsx2_round_sprite = "disabled"',
          'pcsx2_shared_memory_cards = "enabled"',
          'pcsx2_software_clut_render = "disabled"',
          'pcsx2_texture_filtering = "Bilinear (PS2)"',
          'pcsx2_texture_inside_rt = "disabled"',
          'pcsx2_trilinear_filtering = "Automatic"',
          'pcsx2_uncapped_framerate_hint = "disabled"',
          'pcsx2_unscaled_palette_draw = "disabled"',
          'pcsx2_upscale_multiplier = "2x Native (~720p)"',
          'pcsx2_use_external_gameindex = "disabled"',
          'pcsx2_vu0_softfloat = "disabled"',
          'pcsx2_vu1_softfloat = "disabled"',
          'pcsx2_vu_accurate_addsub = "disabled"',
          'pcsx2_vu_exact_div = "disabled"',
          'pcsx2_vu_exact_mul = "disabled"',
          'pcsx2_widescreen_hint = "enabled (16:9)"'
        ]
      },
      // Dreamcast — unico core (flycast), modalità toggle-options come PS2
      // (nessuno swap: flycast è l'unico core libretro mantenuto per questo
      // sistema, vedi SYSTEM_MAP). Preset preso di peso da un file .opt REALE
      // per Sonic Adventure 2, dopo un primo giro sbagliato: la prima lista
      // fornita usava un prefisso `flycast_` che non esiste — flycast è un
      // fork di Reicast e ha mantenuto lo stesso namespace di opzioni
      // (`reicast_*`) per compatibilità, e più della metà delle chiavi di
      // quella lista non corrispondeva comunque a nessuna opzione reale del
      // core. Il file caricato dall'utente (generato da RetroArch stesso, non
      // scritto a mano) ha risolto l'ambiguità. Verbatim come per Saturn/PS2 —
      // confrontato col default (stesso .opt caricato dall'utente prima):
      // risoluzione interna 640x480→1920x1440, cavo TV→VGA, filtro
      // anisotropico 4→8, texture filtering 0→1, PVR2 filtering e widescreen
      // entrambi attivati.
      dreamcast: {
        mode: "toggle-options",
        core: "flycast_libretro.so",
        coreDisplayName: "Flycast",
        optionLines: [
          'reicast_allow_service_buttons = "disabled"',
          'reicast_alpha_sorting = "per-triangle (normal)"',
          'reicast_analog_stick_deadzone = "15%"',
          'reicast_anisotropic_filtering = "8"',
          'reicast_auto_skip_frame = "disabled"',
          'reicast_broadcast = "NTSC"',
          'reicast_cable_type = "VGA"',
          'reicast_custom_textures = "disabled"',
          'reicast_dc_32mb_mod = "disabled"',
          'reicast_dcnet = "enabled"',
          'reicast_delay_frame_swapping = "enabled"',
          'reicast_detect_vsync_swap_interval = "disabled"',
          'reicast_device_port1_slot1 = "VMU"',
          'reicast_device_port1_slot2 = "Purupuru"',
          'reicast_device_port2_slot1 = "VMU"',
          'reicast_device_port2_slot2 = "Purupuru"',
          'reicast_device_port3_slot1 = "VMU"',
          'reicast_device_port3_slot2 = "Purupuru"',
          'reicast_device_port4_slot1 = "VMU"',
          'reicast_device_port4_slot2 = "Purupuru"',
          'reicast_digital_triggers = "disabled"',
          'reicast_dump_replaced_textures = "disabled"',
          'reicast_dump_textures = "disabled"',
          'reicast_emulate_bba = "disabled"',
          'reicast_emulate_framebuffer = "disabled"',
          'reicast_enable_dsp = "enabled"',
          'reicast_enable_rttb = "disabled"',
          'reicast_fix_upscale_bleeding_edge = "enabled"',
          'reicast_fog = "enabled"',
          'reicast_force_freeplay = "enabled"',
          'reicast_frame_skipping = "disabled"',
          'reicast_gdrom_fast_loading = "disabled"',
          'reicast_hle_bios = "disabled"',
          'reicast_internal_resolution = "1920x1440"',
          'reicast_language = "English"',
          'reicast_lightgun1_crosshair = "disabled"',
          'reicast_lightgun2_crosshair = "disabled"',
          'reicast_lightgun3_crosshair = "disabled"',
          'reicast_lightgun4_crosshair = "disabled"',
          'reicast_lightgun_crosshair_size_scaling = "100%"',
          'reicast_linked_vmu_storage = "disabled"',
          'reicast_mipmapping = "enabled"',
          'reicast_native_depth_interpolation = "disabled"',
          'reicast_network_output = "disabled"',
          'reicast_oit_abuffer_size = "512MB"',
          'reicast_oit_layers = "32"',
          'reicast_per_content_vmus = "disabled"',
          'reicast_preload_custom_textures = "disabled"',
          'reicast_pvr2_filtering = "enabled"',
          'reicast_region = "USA"',
          'reicast_screen_rotation = "horizontal"',
          'reicast_sh4clock = "200"',
          'reicast_show_lightgun_settings = "disabled"',
          'reicast_show_vmu_screen_settings = "disabled"',
          'reicast_texture_filtering = "1"',
          'reicast_texupscale = "1"',
          'reicast_texupscale_max_filtered_texture_size = "256"',
          'reicast_threaded_rendering = "enabled"',
          'reicast_trigger_deadzone = "0%"',
          'reicast_upnp = "enabled"',
          'reicast_vmu1_pixel_off_color = "DEFAULT_OFF 01"',
          'reicast_vmu1_pixel_on_color = "DEFAULT_ON 00"',
          'reicast_vmu1_screen_display = "disabled"',
          'reicast_vmu1_screen_opacity = "100%"',
          'reicast_vmu1_screen_position = "Upper Left"',
          'reicast_vmu1_screen_size_mult = "1x"',
          'reicast_vmu2_pixel_off_color = "DEFAULT_OFF 01"',
          'reicast_vmu2_pixel_on_color = "DEFAULT_ON 00"',
          'reicast_vmu2_screen_display = "disabled"',
          'reicast_vmu2_screen_opacity = "100%"',
          'reicast_vmu2_screen_position = "Upper Right"',
          'reicast_vmu2_screen_size_mult = "1x"',
          'reicast_vmu3_pixel_off_color = "DEFAULT_OFF 01"',
          'reicast_vmu3_pixel_on_color = "DEFAULT_ON 00"',
          'reicast_vmu3_screen_display = "disabled"',
          'reicast_vmu3_screen_opacity = "100%"',
          'reicast_vmu3_screen_position = "Lower Left"',
          'reicast_vmu3_screen_size_mult = "1x"',
          'reicast_vmu4_pixel_off_color = "DEFAULT_OFF 01"',
          'reicast_vmu4_pixel_on_color = "DEFAULT_ON 00"',
          'reicast_vmu4_screen_display = "disabled"',
          'reicast_vmu4_screen_opacity = "100%"',
          'reicast_vmu4_screen_position = "Lower Right"',
          'reicast_vmu4_screen_size_mult = "1x"',
          'reicast_vmu_sound = "disabled"',
          'reicast_volume_modifier_enable = "enabled"',
          'reicast_widescreen_cheats = "enabled"',
          'reicast_widescreen_hack = "enabled"'
        ]
      }
      // n64: da aggiungere quando verrà ripreso il lavoro. Userà mode:
      // 'toggle-options' (stessa logica di PS2/Dreamcast, confermato
      // dall'utente: core unico mupen64plus_next, nessuno swap con
      // parallel_n64) — ma le optionLines vanno prese da un .opt reale come
      // sopra, non assunte: ancora nessun riferimento verificato per questo
      // core.
    };
    ClassicPlugin = class extends StorePlugin {
      id = "Classic Console";
      name = "Classic Console";
      isPublic = true;
      drmFree = true;
      // ROM — nessun DRM
      description = "ROM e console classiche \u2014 RetroArch, DOSBox, ScummVM";
      requiredTool = "retroarch";
      // Scan locale del filesystem: un titolo assente dal risultato non esiste
      // più su disco con certezza → gameManager può pulire il DB in sicurezza.
      isExhaustiveLocalScan = true;
      getRomsRoot() {
        const fromEnv = process.env.ROMS_PATH;
        if (fromEnv) {
          const expanded = fromEnv.startsWith("~") ? import_path15.default.join((0, import_os7.homedir)(), fromEnv.slice(1)) : fromEnv;
          return expanded;
        }
        return import_path15.default.join((0, import_os7.homedir)(), "Roms");
      }
      async getLibrary() {
        const romsRoot = this.getRomsRoot();
        const justCreated = !(0, import_fs17.existsSync)(romsRoot);
        (0, import_fs17.mkdirSync)(romsRoot, { recursive: true });
        ensureSystemFolders(romsRoot);
        if (justCreated) {
          writeLog("info", `[CLASSIC] ROM folder created: ${romsRoot}`);
          writeLog("info", `[CLASSIC] System subfolders generated \u2014 drop ROMs into the matching one.`);
        }
        const games = [];
        const entries = (0, import_fs17.readdirSync)(romsRoot);
        for (const entry of entries) {
          const entryPath = import_path15.default.join(romsRoot, entry);
          const stat = (0, import_fs17.statSync)(entryPath);
          if (stat.isDirectory()) {
            const system = detectSystem(entry);
            let children;
            try {
              children = (0, import_fs17.readdirSync)(entryPath);
            } catch {
              continue;
            }
            const candidates = [];
            for (const child of children) {
              if (child === ".extracted") continue;
              const childPath = import_path15.default.join(entryPath, child);
              let childStat;
              try {
                childStat = (0, import_fs17.statSync)(childPath);
              } catch {
                continue;
              }
              if (childStat.isDirectory()) {
                if (findPrimaryDiscFile(childPath)) candidates.push({ name: child, kind: "folder" });
              } else if (isRomFile(child)) {
                candidates.push({ name: child, kind: "file" });
              }
            }
            const { singles, multiDisc } = groupDiscs(candidates, system.canonical);
            for (const candidate of singles) {
              if (candidate.kind === "file") {
                const romPath = import_path15.default.join(entryPath, candidate.name);
                games.push(this.buildGame(romPath, system, entry));
              } else {
                games.push(this.buildGameFromFolder(import_path15.default.join(entryPath, candidate.name), system));
              }
            }
            for (const [baseTitle, discs] of multiDisc) {
              games.push(this.buildMultiDiscGame(baseTitle, discs, system, entryPath));
            }
          } else if (isRomFile(entry)) {
            games.push(this.buildGame(entryPath, UNKNOWN_SYSTEM, ""));
          }
        }
        writeLog("info", `[CLASSIC] ${games.length} ROMs found in ${romsRoot}`);
        for (const g of games) {
          writeLog("info", `[CLASSIC]   \u2192 ${g.id} | ${g.title} | ${g.runner} | core: ${g.libretroCore ?? "auto"}`);
        }
        return games;
      }
      // Richiesta utente — diagnosi fatta da loro stessi: passando lo ZIP di un
      // gioco PSX a RetroArch, il lancio fallisce; estraendolo a mano e
      // puntando al file .cue funziona con lo stesso identico core. Causa: a
      // differenza dei sistemi a cartuccia (SNES/Genesis/MAME, un solo file
      // per ROM, RetroArch legge comodamente dentro lo zip), un dump PSX è
      // un'immagine CD (.cue + uno o più .bin) — più file con riferimenti
      // relativi fra loro, che il meccanismo generico "leggi dentro lo zip"
      // di RetroArch non gestisce allo stesso modo.
      //
      // v2.1.11-dev.8 — esteso a Dreamcast/PS2 (vedi commento su
      // CD_BASED_SYSTEMS più sopra): anche per un file singolo come .chd/.iso,
      // l'estrazione automatica di RetroArch dipende da `cache_directory` ed
      // è documentata come inconsistente se non configurato — meglio la
      // nostra estrazione persistente, verificata, uguale per tutti i sistemi
      // a disco ottico.
      extractCdImageIfNeeded(romPath, canonicalSystem) {
        if (!canonicalSystem || !CD_BASED_SYSTEMS.has(canonicalSystem)) return romPath;
        const systemDir = import_path15.default.dirname(romPath);
        const zipBaseName = import_path15.default.basename(romPath, import_path15.default.extname(romPath));
        const manualMatch = findMatchingCueInDir(systemDir, zipBaseName);
        if (manualMatch) return manualMatch;
        const extractor = findExtractorFor(romPath);
        if (!extractor || !extractor.supported) return romPath;
        const extractDir = import_path15.default.join(systemDir, ".extracted", zipBaseName);
        const cached2 = findPrimaryDiscFile(extractDir);
        if (cached2) return cached2;
        (0, import_fs17.mkdirSync)(extractDir, { recursive: true });
        const result = extractArchive(romPath, extractDir);
        if (result.success) {
          const found = findPrimaryDiscFile(extractDir);
          if (found) {
            writeLog("info", `[CLASSIC] Estratto ${import_path15.default.basename(romPath)} \u2192 ${found}`);
            return found;
          }
          writeLog("warning", `[CLASSIC] Estrazione di ${import_path15.default.basename(romPath)} riuscita ma nessun file principale (.gdi/.cue/.chd/.iso) trovato dentro \u2014 uso l'archivio originale (probabilmente non partir\xE0).`);
          return romPath;
        }
        writeLog("warning", `[CLASSIC] Estrazione di ${import_path15.default.basename(romPath)} fallita (${result.message}) \u2014 uso l'archivio originale.`);
        return romPath;
      }
      /**
       * v2.1.11-dev.7 — cartella-gioco non zippata (vedi findPrimaryDiscFile):
       * niente da estrarre, il file principale è già lì. Titolo preso dal nome
       * della cartella (non dal file interno — possono differire, es. una
       * cartella "Grandia II (USA)" con dentro sia .cue sia .gdi con lo stesso
       * stem, ma non è garantito in generale).
       */
      buildGameFromFolder(folderPath, system) {
        const primary = findPrimaryDiscFile(folderPath);
        const title = titleFromFilename(folderPath);
        const id = makeGameId(primary);
        return {
          id,
          title,
          store: "Classic Console",
          runner: system.runner,
          isInstalled: true,
          playTimeHours: 0,
          coverImage: "",
          previewImage: "",
          description: system.label ? `${system.label} \u2014 ROM` : "Classic ROM",
          tags: [system.label, "Classic", "Retro"].filter(Boolean),
          genres: [system.genre],
          categories: ["Single-player"],
          status: "Ready to Launch",
          executablePath: primary,
          libretroCore: system.core,
          system: system.canonical
        };
      }
      /**
       * v2.1.11-dev.6 — richiesta utente: un multi-disco reale diventa UN
       * solo Game (non uno per disco), lanciato tramite un .m3u generato
       * automaticamente accanto ai file/cartelle originali in systemDir. Ogni
       * riga del .m3u è il percorso RISOLTO del disco — se un disco è un file
       * zippato, estratto come per un singolo (extractCdImageIfNeeded); se è
       * una cartella non zippata (v2.1.11-dev.7), il file principale al suo
       * interno (findPrimaryDiscFile) — mai il file/cartella originale as-is:
       * RetroArch deve poter aprire ogni riga direttamente.
       *
       * Il file .m3u viene riscritto ad ogni scan (costo trascurabile, poche
       * righe di testo) invece di essere messo in cache, così un disco
       * aggiunto in un secondo momento (es. compri/scarichi il Disco 3 che
       * mancava) viene ripreso automaticamente al prossimo scan.
       */
      buildMultiDiscGame(baseTitle, discs, system, systemDir) {
        const resolvedPaths = discs.map((d) => {
          const childPath = import_path15.default.join(systemDir, d.candidate.name);
          return d.candidate.kind === "file" ? this.extractCdImageIfNeeded(childPath, system.canonical) : findPrimaryDiscFile(childPath) ?? childPath;
        });
        const m3uPath = import_path15.default.join(systemDir, `${baseTitle}.m3u`);
        try {
          (0, import_fs17.writeFileSync)(m3uPath, resolvedPaths.join("\n") + "\n", "utf-8");
        } catch (err) {
          writeLog("warning", `[CLASSIC] Scrittura .m3u multi-disco fallita per "${baseTitle}" (${m3uPath}): ${err}`);
        }
        const title = titleFromFilename(baseTitle);
        const id = makeGameId(m3uPath);
        writeLog("info", `[CLASSIC] Multi-disco rilevato: "${title}" \u2014 ${discs.length} dischi \u2192 ${m3uPath}`);
        return {
          id,
          title,
          store: "Classic Console",
          runner: system.runner,
          isInstalled: true,
          playTimeHours: 0,
          coverImage: "",
          previewImage: "",
          description: system.label ? `${system.label} \u2014 ROM (${discs.length} dischi)` : "Classic ROM",
          tags: [system.label, "Classic", "Retro"].filter(Boolean),
          genres: [system.genre],
          categories: ["Single-player"],
          status: "Ready to Launch",
          executablePath: m3uPath,
          libretroCore: system.core,
          system: system.canonical
        };
      }
      buildGame(romPath, system, systemDir) {
        const title = titleFromFilename(romPath);
        const id = makeGameId(romPath);
        const executablePath = this.extractCdImageIfNeeded(romPath, system.canonical);
        return {
          id,
          title,
          store: "Classic Console",
          runner: system.runner,
          isInstalled: true,
          // le ROM sono sempre "installate" — sono file locali
          playTimeHours: 0,
          coverImage: "",
          // Step 9: SteamGridDB coprirà anche i classici
          previewImage: "",
          description: system.label ? `${system.label} \u2014 ROM` : "Classic ROM",
          tags: [system.label, "Classic", "Retro"].filter(Boolean),
          genres: [system.genre],
          categories: ["Single-player"],
          status: "Ready to Launch",
          executablePath,
          libretroCore: system.core,
          // può essere sovrascritto dall'utente (Step 4)
          // v1.0.0 — chiave canonica di sistema, usata per filtrare quali core
          // RetroArch installati sono compatibili con questo gioco specifico
          // (vedi COMPATIBLE_CORES_BY_SYSTEM sopra) — undefined per DOS/
          // ScummVM/sistema sconosciuto, dove il concetto "core alternativo"
          // non si applica.
          system: system.canonical
        };
      }
      async installGame(_id) {
        return { success: true };
      }
      async uninstallGame(_id) {
        return { success: true };
      }
    };
  }
});

// src/backend/cloudBackup/bundle.ts
var bundle_exports = {};
__export(bundle_exports, {
  BACKUP_FILENAME: () => BACKUP_FILENAME,
  buildBackupBundle: () => buildBackupBundle,
  restoreFromBundle: () => restoreFromBundle
});
function readTextIfExists(filePath) {
  try {
    return (0, import_fs21.existsSync)(filePath) ? (0, import_fs21.readFileSync)(filePath, "utf-8") : null;
  } catch (err) {
    writeLog("warning", `[CloudBackup] Lettura fallita per ${filePath}: ${err}`);
    return null;
  }
}
function collectAvatars() {
  if (!(0, import_fs21.existsSync)(AVATAR_DIR)) return [];
  try {
    return (0, import_fs21.readdirSync)(AVATAR_DIR).filter((f) => !f.startsWith(".")).map((f) => ({
      filename: f,
      dataBase64: (0, import_fs21.readFileSync)(import_path18.default.join(AVATAR_DIR, f)).toString("base64")
    }));
  } catch (err) {
    writeLog("warning", `[CloudBackup] Lettura cartella avatars/ fallita: ${err}`);
    return [];
  }
}
function buildBackupBundle() {
  const bundle = {
    version: 1,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    compatProfiles: exportCompatProfilesRaw(),
    knowledgeBase: knowledgeBase.getAll(),
    appConf: readTextIfExists(APP_CONF_PATH),
    env: readTextIfExists(ENV_PATH),
    avatars: collectAvatars()
  };
  const json = JSON.stringify(bundle);
  writeLog("info", `[CloudBackup] Bundle costruito: ${bundle.compatProfiles.length} profili compat, ${bundle.knowledgeBase.length} voci KB, ${bundle.avatars.length} avatar, ${(json.length / 1024).toFixed(0)} KB grezzi.`);
  return (0, import_zlib.gzipSync)(json);
}
function restoreFromBundle(compressed) {
  let bundle;
  try {
    const json = (0, import_zlib.gunzipSync)(compressed).toString("utf-8");
    bundle = JSON.parse(json);
  } catch (err) {
    return { success: false, message: `Bundle corrotto o formato non riconosciuto: ${err}` };
  }
  if (bundle.version !== 1) {
    return { success: false, message: `Versione bundle non supportata: ${bundle.version}` };
  }
  const compatResult = importCompatProfilesRaw(bundle.compatProfiles ?? []);
  const kbImported = knowledgeBase.importEntries(bundle.knowledgeBase ?? []);
  if (bundle.appConf) {
    try {
      (0, import_fs21.writeFileSync)(APP_CONF_PATH, bundle.appConf, "utf-8");
    } catch (err) {
      writeLog("warning", `[CloudBackup] Scrittura app.conf fallita: ${err}`);
    }
  }
  if (bundle.env) {
    try {
      (0, import_fs21.writeFileSync)(ENV_PATH, bundle.env, "utf-8");
    } catch (err) {
      writeLog("warning", `[CloudBackup] Scrittura .env fallita: ${err}`);
    }
  }
  let avatarsRestored = 0;
  if (bundle.avatars?.length > 0) {
    try {
      (0, import_fs21.mkdirSync)(AVATAR_DIR, { recursive: true });
      for (const avatar of bundle.avatars) {
        try {
          (0, import_fs21.writeFileSync)(import_path18.default.join(AVATAR_DIR, avatar.filename), Buffer.from(avatar.dataBase64, "base64"));
          avatarsRestored++;
        } catch (err) {
          writeLog("warning", `[CloudBackup] Avatar ${avatar.filename} non ripristinato: ${err}`);
        }
      }
    } catch (err) {
      writeLog("warning", `[CloudBackup] Cartella avatars/ non creabile: ${err}`);
    }
  }
  writeLog("info", `[CloudBackup] Ripristino completato: ${compatResult.imported} profili compat (${compatResult.skipped} saltati \u2014 probabilmente libreria non ancora scansionata), ${kbImported} voci KB, ${avatarsRestored} avatar.`);
  return {
    success: true,
    message: compatResult.skipped > 0 ? `Ripristino completato. ${compatResult.skipped} profilo/i saltato/i perch\xE9 il gioco non \xE8 ancora nella libreria \u2014 scansiona la libreria e ripristina di nuovo per recuperarli.` : "Ripristino completato.",
    compatProfilesImported: compatResult.imported,
    compatProfilesSkipped: compatResult.skipped,
    knowledgeBaseImported: kbImported,
    avatarsRestored
  };
}
var import_fs21, import_path18, import_zlib, APP_CONF_PATH, AVATAR_DIR, BACKUP_FILENAME;
var init_bundle = __esm({
  "src/backend/cloudBackup/bundle.ts"() {
    "use strict";
    import_fs21 = require("fs");
    import_path18 = __toESM(require("path"), 1);
    import_zlib = require("zlib");
    init_paths();
    init_logger();
    init_db();
    init_knowledgeBase();
    APP_CONF_PATH = import_path18.default.join(DATA_DIR, "app.conf");
    AVATAR_DIR = import_path18.default.join(DATA_DIR, "avatars");
    BACKUP_FILENAME = "x-launcher-backup.json.gz";
  }
});

// src/backend/cloudBackup/googleDrive.ts
function binaryExists9(bin) {
  try {
    (0, import_child_process19.execSync)(`which ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function openInBrowser2(url) {
  if (binaryExists9("firefox")) {
    (0, import_child_process19.spawn)("firefox", [url], { detached: true, stdio: "ignore" }).unref();
  } else if (binaryExists9("xdg-open")) {
    (0, import_child_process19.spawn)("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    writeLog("warning", "[CloudBackup/GoogleDrive] Nessun browser trovato (firefox/xdg-open) \u2014 apri manualmente: " + url);
  }
}
function loadTokenSet() {
  const raw = loadToken("google-drive");
  if (!raw) return void 0;
  try {
    return JSON.parse(raw);
  } catch {
    return void 0;
  }
}
function saveTokenSet(tokens) {
  saveToken("google-drive", JSON.stringify(tokens));
}
var import_child_process19, http, GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL, DRIVE_SCOPE, OAUTH_TIMEOUT_MS, GoogleDriveProvider;
var init_googleDrive = __esm({
  "src/backend/cloudBackup/googleDrive.ts"() {
    "use strict";
    init_logger();
    init_db();
    import_child_process19 = require("child_process");
    http = __toESM(require("http"), 1);
    init_bundle();
    GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
    GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
    DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
    OAUTH_TIMEOUT_MS = 5 * 6e4;
    GoogleDriveProvider = class {
      id = "google-drive";
      name = "Google Drive";
      description = "Backup su Google Drive (cartella dati dedicata all'app, non visibile nel tuo Drive)";
      async isAuthenticated() {
        const tokens = loadTokenSet();
        return !!tokens?.refreshToken;
      }
      /**
       * Scambia il refresh token per un access token valido — chiamato prima
       * di ogni operazione reale su Drive (upload/download), non memorizzato
       * a lungo termine: gli access token Google scadono dopo ~1h, più
       * semplice richiederne uno fresco ogni volta che serve piuttosto che
       * tracciare la scadenza con precisione.
       */
      async getAccessToken() {
        const cred = getCloudBackupCredential(this.id);
        const tokens = loadTokenSet();
        if (!cred?.clientId || !cred?.clientSecret || !tokens?.refreshToken) return null;
        try {
          const res = await fetch(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: cred.clientId,
              client_secret: cred.clientSecret,
              refresh_token: tokens.refreshToken,
              grant_type: "refresh_token"
            })
          });
          if (!res.ok) {
            writeLog("warning", `[CloudBackup/GoogleDrive] Refresh token fallito (${res.status}): ${await res.text()}`);
            return null;
          }
          const data = await res.json();
          return data.access_token ?? null;
        } catch (err) {
          writeLog("error", `[CloudBackup/GoogleDrive] Errore refresh access token: ${err}`);
          return null;
        }
      }
      /**
       * Avvia il flusso OAuth loopback. Ritorna appena il browser è aperto e
       * il server locale è in ascolto — NON aspetta il completamento (il
       * chiamante fa polling su isAuthenticated()). Lo scambio codice→token
       * avviene in background quando il redirect arriva.
       */
      async login() {
        const cred = getCloudBackupCredential(this.id);
        if (!cred?.clientId || !cred?.clientSecret) {
          return {
            success: false,
            message: 'Configura prima Client ID e Client Secret (creati su Google Cloud Console, tipo client "Desktop app").'
          };
        }
        const server = http.createServer();
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            writeLog("warning", "[CloudBackup/GoogleDrive] Login OAuth scaduto (5 minuti) \u2014 nessun consenso ricevuto.");
            server.close();
          }
        }, OAUTH_TIMEOUT_MS);
        server.on("request", async (req, res) => {
          if (settled) {
            res.end();
            return;
          }
          const url = new URL(req.url ?? "", "http://127.0.0.1");
          if (url.pathname !== "/callback") {
            res.writeHead(404);
            res.end();
            return;
          }
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");
          if (error || !code) {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end("<html><body><h2>Accesso non concesso.</h2><p>Puoi chiudere questa scheda e riprovare dalla Dashboard.</p></body></html>");
            writeLog("warning", `[CloudBackup/GoogleDrive] Consenso negato o mancante: ${error ?? "nessun code nel redirect"}`);
            settled = true;
            clearTimeout(timer);
            server.close();
            return;
          }
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<html><body><h2>Fatto!</h2><p>Puoi chiudere questa scheda e tornare alla Dashboard.</p></body></html>");
          const address = server.address();
          const port = address?.port;
          try {
            const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: cred.clientId,
                client_secret: cred.clientSecret,
                code,
                grant_type: "authorization_code",
                redirect_uri: `http://127.0.0.1:${port}/callback`
              })
            });
            if (!tokenRes.ok) {
              writeLog("error", `[CloudBackup/GoogleDrive] Scambio codice\u2192token fallito (${tokenRes.status}): ${await tokenRes.text()}`);
            } else {
              const data = await tokenRes.json();
              if (data.refresh_token) {
                saveTokenSet({ refreshToken: data.refresh_token });
                writeLog("info", "[CloudBackup/GoogleDrive] Login completato, refresh token salvato.");
              } else {
                writeLog("warning", "[CloudBackup/GoogleDrive] Risposta token senza refresh_token \u2014 vedi output grezzo per capire perch\xE9.");
                writeLog("info", `[CloudBackup/GoogleDrive] Risposta token grezza: ${JSON.stringify(data).slice(0, 1e3)}`);
              }
            }
          } catch (err) {
            writeLog("error", `[CloudBackup/GoogleDrive] Errore scambio codice\u2192token: ${err}`);
          }
          settled = true;
          clearTimeout(timer);
          server.close();
        });
        return new Promise((resolve) => {
          server.listen(0, "127.0.0.1", () => {
            const port = server.address()?.port;
            const authUrl = `${GOOGLE_AUTH_URL}?` + new URLSearchParams({
              client_id: cred.clientId,
              redirect_uri: `http://127.0.0.1:${port}/callback`,
              response_type: "code",
              scope: DRIVE_SCOPE,
              access_type: "offline",
              prompt: "consent"
              // forza un nuovo refresh_token anche se già autorizzato in passato
            }).toString();
            writeLog("info", `[CloudBackup/GoogleDrive] Server OAuth locale in ascolto su porta ${port}, apertura browser...`);
            openInBrowser2(authUrl);
            resolve({
              success: true,
              message: "Completa l'accesso nel browser appena aperto. Questa card si aggiorner\xE0 da sola al termine."
            });
          });
        });
      }
      async logout() {
        try {
          saveToken("google-drive", JSON.stringify({}));
          return { success: true, message: "Disconnesso da Google Drive." };
        } catch (err) {
          return { success: false, message: `Errore durante la disconnessione: ${err}` };
        }
      }
      /**
       * Cerca un file già esistente con questo nome dentro appDataFolder —
       * un solo file di backup mantenuto e aggiornato (PATCH), non un nuovo
       * file ad ogni backup: niente accumulo da gestire/ripulire.
       */
      async findExistingFileId(accessToken, filename) {
        const url = "https://www.googleapis.com/drive/v3/files?" + new URLSearchParams({
          spaces: "appDataFolder",
          q: `name = '${filename}' and trashed = false`,
          fields: "files(id,name)"
        });
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!res.ok) {
          writeLog("warning", `[CloudBackup/GoogleDrive] Ricerca file esistente fallita (${res.status}): ${await res.text()}`);
          return null;
        }
        const data = await res.json();
        return data.files?.[0]?.id ?? null;
      }
      /**
       * Upload multipart/related — metadata JSON + contenuto binario in un
       * unico corpo, separati da un boundary. Stesso principio già usato nel
       * resto del progetto per le chiamate HTTP dirette (niente SDK Google).
       * Crea il file se non esiste (POST), altrimenti lo aggiorna sul posto
       * (PATCH) invece di duplicarlo.
       */
      async uploadBackup(bundle, filename) {
        const accessToken = await this.getAccessToken();
        if (!accessToken) return { success: false, message: "Non autenticato \u2014 connetti prima Google Drive." };
        try {
          const existingId = await this.findExistingFileId(accessToken, filename);
          const boundary = `xlauncher-${Date.now()}`;
          const metadata = existingId ? {} : { name: filename, parents: ["appDataFolder"] };
          const body = Buffer.concat([
            Buffer.from(
              `--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(metadata)}\r
--${boundary}\r
Content-Type: application/octet-stream\r
\r
`
            ),
            bundle,
            Buffer.from(`\r
--${boundary}--`)
          ]);
          const uploadUrl = existingId ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart` : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
          const res = await fetch(uploadUrl, {
            method: existingId ? "PATCH" : "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": `multipart/related; boundary=${boundary}`
            },
            body
          });
          if (!res.ok) {
            const errText = await res.text();
            writeLog("error", `[CloudBackup/GoogleDrive] Upload fallito (${res.status}): ${errText}`);
            return { success: false, message: `Upload fallito (${res.status}): ${errText.slice(0, 300)}` };
          }
          upsertCloudBackupCredential({
            ...getCloudBackupCredential(this.id) ?? { providerId: this.id, enabled: true },
            lastBackupAt: (/* @__PURE__ */ new Date()).toISOString()
          });
          writeLog("info", `[CloudBackup/GoogleDrive] Backup caricato (${(bundle.length / 1024).toFixed(0)} KB, ${existingId ? "aggiornato" : "nuovo file"}).`);
          return { success: true, message: "Backup caricato su Google Drive." };
        } catch (err) {
          writeLog("error", `[CloudBackup/GoogleDrive] Errore upload: ${err}`);
          return { success: false, message: `Errore upload: ${err}` };
        }
      }
      async downloadLatestBackup() {
        const accessToken = await this.getAccessToken();
        if (!accessToken) return { success: false, message: "Non autenticato \u2014 connetti prima Google Drive." };
        try {
          const fileId = await this.findExistingFileId(accessToken, BACKUP_FILENAME);
          if (!fileId) {
            return { success: false, message: "Nessun backup trovato su Google Drive." };
          }
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (!res.ok) {
            const errText = await res.text();
            writeLog("error", `[CloudBackup/GoogleDrive] Download fallito (${res.status}): ${errText}`);
            return { success: false, message: `Download fallito (${res.status}): ${errText.slice(0, 300)}` };
          }
          const data = Buffer.from(await res.arrayBuffer());
          writeLog("info", `[CloudBackup/GoogleDrive] Backup scaricato (${(data.length / 1024).toFixed(0)} KB).`);
          return { success: true, message: "Backup scaricato.", data };
        } catch (err) {
          writeLog("error", `[CloudBackup/GoogleDrive] Errore download: ${err}`);
          return { success: false, message: `Errore download: ${err}` };
        }
      }
    };
  }
});

// src/backend/cloudBackup/registry.ts
var registry_exports2 = {};
__export(registry_exports2, {
  getAllCloudBackupProviders: () => getAllCloudBackupProviders,
  getCloudBackupProvider: () => getCloudBackupProvider
});
function getCloudBackupProvider(id) {
  return PROVIDERS.find((p) => p.id === id);
}
function getAllCloudBackupProviders() {
  return PROVIDERS;
}
var PROVIDERS;
var init_registry2 = __esm({
  "src/backend/cloudBackup/registry.ts"() {
    "use strict";
    init_googleDrive();
    PROVIDERS = [
      new GoogleDriveProvider()
    ];
  }
});

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path19 = __toESM(require("path"), 1);
var import_vite = require("vite");

// src/backend/gameManager.ts
var import_fs18 = require("fs");
var import_child_process16 = require("child_process");

// src/backend/launchPhaseTracker.ts
var import_events = require("events");
var emitter = new import_events.EventEmitter();
emitter.setMaxListeners(0);
var lastPhaseByGame = /* @__PURE__ */ new Map();
function emitLaunchPhase(event) {
  const full = { ...event, ts: Date.now() };
  lastPhaseByGame.set(event.gameId, full);
  emitter.emit(event.gameId, full);
}
function getLastLaunchPhase(gameId) {
  return lastPhaseByGame.get(gameId);
}
function subscribeLaunchPhase(gameId, listener) {
  emitter.on(gameId, listener);
  return () => emitter.off(gameId, listener);
}
var LAUNCH_WINDOW_TIMEOUT_MS = 10 * 60 * 1e3;

// src/backend/windowDetector.ts
var import_child_process = require("child_process");
init_logger();
init_db();

// src/backend/plugins/thirdPartyLaunchers.ts
var THIRD_PARTY_LAUNCHERS = [
  {
    id: "ubisoft-connect",
    displayName: "Ubisoft Connect",
    storeId: "Ubisoft",
    installerUrl: "https://www.ubisoft.com/en-us/ubisoft-connect/download",
    executableRelPathHint: "Program Files (x86)/Ubisoft/Ubisoft Game Launcher/UbisoftConnect.exe",
    // v2.0.41-dev.6 — da 'unknown' a 'registry': scanInstalledUbisoftGames
    // (ubisoftConnectPlugin.ts) legge la libreria interna dal registro
    // Wine (system.reg, chiavi Software\Ubisoft\Launcher\Installs\<id>),
    // verificato su hardware reale con due giochi (Watch Dogs 2,
    // Assassin's Creed Syndicate).
    libraryReader: "registry",
    directLaunchUriTemplate: "uplay://launch/{id}/0",
    requiredWinetricksVerbs: [],
    installerFilenameHints: ["*ubisoft*", "*uplay*"],
    // v2.0.41-dev.6 — da false a true: bootstrap, lancio (leggero e
    // container pieno) e ora anche lettura libreria interna, tutti
    // confermati dall'utente su hardware reale con due giochi distinti.
    verified: true,
    // v2.0.41-dev.15 — esperienza reale accumulata (MILESTONE v1.5.20-Venus
    // e sessioni successive, vedi CHANGELOG.md "saga finestra nera" e
    // CHANGELOG-2.md): il problema storico più segnalato per Ubisoft
    // Connect è la finestra completamente nera dal secondo avvio in poi
    // — causa reale, confermata nel sorgente Proton: il container Steam
    // Linux Runtime mancante quando Ubisoft Connect (o un gioco che lo
    // richiede) parte senza passare da `umu-run`.
    troubleshootingTips: [
      {
        text: `Se Ubisoft Connect si apre con una finestra completamente nera (tipicamente dal secondo avvio in poi), attiva l'interruttore "Umu-launcher" in Compatibility Layer per questo gioco/launcher \u2014 manca il container Steam Linux Runtime richiesto per il rendering corretto.`,
        textEn: `If Ubisoft Connect opens with a completely black window (typically from the second launch onward), enable the "Umu-launcher" switch in Compatibility Layer for this game/launcher \u2014 it's missing the Steam Linux Runtime container needed for correct rendering.`
      }
    ],
    // v2.0.41-dev.33 — richiesta utente, osservazione diretta: la
    // finestra di Ubisoft Connect si chiama sempre "Ubisoft Connect" —
    // da riverificare con wmctrl -lx al primo utilizzo reale, non
    // ancora confermato da noi.
    knownWindowTitle: "Ubisoft Connect"
  },
  {
    id: "ea-app",
    displayName: "EA App",
    storeId: "EA App",
    // v2.0.41-dev.11 — verificato con web_fetch: link diretto presente
    // come <a href> semplice nell'HTML della pagina ufficiale
    // (ea.com/ea-app, sezione "Download the EA app" → "Windows"), NON
    // dietro un trigger JavaScript come la pagina Ubisoft Connect —
    // risolve direttamente a binary/octet-stream, nessun redirect verso
    // login/HTML, final_url identico a destination_url. Confermato anche
    // da una seconda fonte indipendente (script di installazione del
    // pacchetto Chocolatey "ea-app", stesso identico URL).
    installerUrl: "https://origin-a.akamaihd.net/EA-Desktop-Client-Download/installer-releases/EAappInstaller.exe",
    // v2.0.41-dev.13 — CONFERMATO su hardware reale (era solo un'ipotesi
    // in dev.11): questo percorso funziona davvero, ma con una premessa
    // fondamentale — l'installer EA usa CreateSymbolicLinkW per popolare
    // "EA Desktop/EA Desktop/" (la cartella "stabile" che questo path
    // referenzia) come collegamento simbolico verso la vera cartella
    // versionata (es. "13.768.x.xxxx-.../EA Desktop/"). Quella funzione
    // è uno STUB VUOTO in Wine (ritorna sempre successo senza creare
    // nulla, verificato leggendo il sorgente Wine) — quindi dopo
    // l'installazione questa cartella "stabile" resta vuota/incompleta
    // finché non si copia a mano il contenuto reale da quella versionata
    // (ricorrerà a ogni aggiornamento di EA Desktop, non solo alla prima
    // installazione — comportamento noto e documentato anche altrove per
    // lo stesso identico limite Wine). Vedi ipotesi di automazione
    // discussa con l'utente, non ancora implementata.
    executableRelPathHint: "Program Files/Electronic Arts/EA Desktop/EA Desktop/EADesktop.exe",
    libraryReader: "unknown",
    // origin2://game/launch?offerIds={id} segnalato in community
    // (BoilR/Steam launch options), mai verificato per questo progetto —
    // lasciato null finché non testato, non copiato per assunzione.
    directLaunchUriTemplate: null,
    // v2.0.41-dev.12 — richiesta utente: installer fallito con
    // INST-14-1603 ("errore fatale generico"). Causa più ricorrente
    // secondo fonti multiple, incluse le guide di risoluzione ufficiali
    // EA (help.ea.com/en-tr/help/pc/troubleshoot-vc-dll-errors/,
    // citata in un thread di supporto EA per questo stesso codice
    // errore): Visual C++ Redistributable mancanti o corrotti.
    // vcrun2022 (superset, stessa scelta già in uso come default
    // generico del progetto — DEFAULT_WINETRICKS_VERBS in
    // downloadManager.ts) + corefonts (baseline comune per qualunque
    // app con UI, già nello stesso default). Deliberatamente NON copiati
    // dxvk/vkd3d/dotnet48/mono/nine visti in un thread Arch Linux
    // sull'installazione di EA App sotto Wine — quel thread riguardava
    // un codice errore diverso (INST-14-12157) e l'autore non ha mai
    // confermato quale dei tanti verb tentati risolvesse davvero il
    // problema; aggiungerli qui sarebbe stata un'assunzione, non un
    // dato verificato.
    //
    // v2.0.41-dev.13 — questi verb da soli NON bastavano: la causa reale
    // del fallimento INST-14-1603 era altrove (custom action .NET
    // "JunoInitializeSession" dell'installer, non i verb) — risolta
    // dall'argomento EAX_LAUNCH_CLIENT=0 passato all'installer stesso
    // (trovato negli script installer ufficiali Lutris per EA App,
    // 24080 utenti — vedi Launch Arguments impostato a mano dall'utente
    // nell'overlay, non ancora un default automatico qui). I verb
    // restano comunque corretti/utili come base, solo non sufficienti da
    // soli per questo specifico errore.
    requiredWinetricksVerbs: ["vcrun2022", "corefonts"],
    installerFilenameHints: ["*eaapp*", "*ea-app*", "*ea_app*", "*origin*"],
    // v2.0.41-dev.13 — CONFERMATO dall'utente su hardware reale:
    // bootstrap, installazione (con EAX_LAUNCH_CLIENT=0 nei Launch
    // Arguments), fix manuale della cartella simlink, login e interfaccia
    // EA App tutti funzionanti con runner GE-Proton11-3. Necessario anche
    // l'interruttore "Umu-launcher" attivo in Compatibility Layer per
    // questo gioco/launcher — senza, l'interfaccia resta congelata dopo
    // il login (stesso identico problema già risolto una volta per
    // Ubisoft Connect, container Steam Linux Runtime mancante — vedi
    // MILESTONE v1.5.20-Venus in CHANGELOG.md). Non forzato per codice,
    // stessa scelta già fatta per Ubisoft Connect: resta un interruttore
    // per l'utente, non un default automatico.
    verified: true,
    // v2.0.41-dev.15 — esperienza reale accumulata durante l'intera saga
    // di bootstrap EA App (vedi CHANGELOG-3.md per il dettaglio completo
    // di ogni causa/fix, tutti verificati su hardware reale in questa
    // stessa sessione).
    troubleshootingTips: [
      {
        text: "Se l'installazione fallisce con un codice INST-14-160x, aggiungi EAX_LAUNCH_CLIENT=0 nei Launch Arguments dell'installer prima di riprovare \u2014 l'installer EA usa una custom action .NET che senza questo argomento fallisce quasi sempre sotto Wine.",
        textEn: "If installation fails with an INST-14-160x code, add EAX_LAUNCH_CLIENT=0 to the installer's Launch Arguments before retrying \u2014 EA's installer uses a .NET custom action that almost always fails under Wine without this argument."
      },
      {
        text: `Se l'app resta bloccata sulla schermata "Connessione a EA App" dopo il login, prova un runner GE-Proton (es. GE-Proton11-3) con l'interruttore "Umu-launcher" attivo in Compatibility Layer \u2014 senza il container Steam Linux Runtime, il controllo di connettivit\xE0 di rete di EA App non riceve mai risposta sotto Wine.`,
        textEn: `If the app stays stuck on the "Connecting to EA App" screen after login, try a GE-Proton runner (e.g. GE-Proton11-3) with the "Umu-launcher" switch enabled in Compatibility Layer \u2014 without the Steam Linux Runtime container, EA App's network connectivity check never gets a response under Wine.`
      },
      {
        text: `Se l'installazione sembra completarsi ma l'app non parte pi\xF9, la cartella "EA Desktop/EA Desktop" potrebbe essere vuota (bug noto di Wine: EA la popola con un collegamento simbolico che Wine non crea mai davvero) \u2014 X-Launcher prova a correggerla da solo a ogni chiusura, ma se il problema persiste segnalalo.`,
        textEn: 'If installation seems to complete but the app no longer starts, the "EA Desktop/EA Desktop" folder may be empty (known Wine bug: EA populates it via a symbolic link that Wine never actually creates) \u2014 X-Launcher tries to fix this automatically on every close, but let us know if the problem persists.'
      }
    ],
    // v2.0.41-dev.18 — richiesta utente: quando un gioco EA lancia EA App
    // come propria dipendenza, la finestra di EA App ruba il focus al
    // gioco appena avviato (bisogna alt-tab per tornare al gioco).
    // "-silentOs" NON è indovinato — è l'argomento REALE che Windows usa
    // per avviare EA App silenziosamente al login (verificato nel
    // registro dell'utente: chiave Run, valore "EADM" =
    // "...\EALauncher.exe" -silentOs). Ragionevole (non certificato da
    // documentazione EA ufficiale) che serva a evitare che la finestra
    // rubi il focus a un avvio automatico — esattamente lo scopo di
    // questo campo. Da confermare su hardware reale.
    silentLaunchArgs: ["-silentOs"],
    // v2.0.41-dev.33 — richiesta utente, osservazione diretta: la
    // finestra di EA App si chiama sempre "EA" — da riverificare con
    // wmctrl -lx al primo utilizzo reale, non ancora confermato da noi.
    knownWindowTitle: "EA"
  },
  {
    id: "battlenet",
    displayName: "Battle.net",
    storeId: "Battle.net",
    installerUrl: "",
    executableRelPathHint: "",
    libraryReader: "unknown",
    directLaunchUriTemplate: null,
    requiredWinetricksVerbs: [],
    installerFilenameHints: [],
    verified: false
  },
  {
    id: "rockstar-launcher",
    displayName: "Rockstar Games Launcher",
    storeId: "Rockstar Games Launcher",
    installerUrl: "",
    executableRelPathHint: "",
    libraryReader: "unknown",
    directLaunchUriTemplate: null,
    requiredWinetricksVerbs: [],
    installerFilenameHints: [],
    verified: false
  }
];
function getThirdPartyLauncherDefinition(id) {
  return THIRD_PARTY_LAUNCHERS.find((l) => l.id === id);
}
function getThirdPartyLauncherByStoreId(storeId) {
  return THIRD_PARTY_LAUNCHERS.find((l) => l.storeId === storeId);
}

// src/backend/windowDetector.ts
init_activeDisplay();
function listWindows() {
  try {
    const out = (0, import_child_process.execFileSync)("wmctrl", ["-lx"], { encoding: "utf-8", env: { ...process.env, ...getActiveDisplayEnv() } });
    return out.split("\n").filter(Boolean).map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        id: parts[0] ?? "",
        wmClass: parts[2] ?? "",
        title: parts.slice(4).join(" ")
      };
    });
  } catch {
    return [];
  }
}
function captureWindowSnapshot() {
  return listWindows();
}
function isSplashWindow(w) {
  return /splash/i.test(w.wmClass) || /splash/i.test(w.title);
}
function isSystemWindow(w) {
  return /^xfce4-|^xfdesktop|^xfwm4/i.test(w.wmClass);
}
var GENERIC_WM_CLASSES = /* @__PURE__ */ new Set(["steam_app_0.steam_app_0", "steam_proton.steam_proton"]);
function normalizeForMatch(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function titleLooksLikeGame(windowTitle, gameTitle) {
  if (!windowTitle || !gameTitle) return false;
  const normWindow = normalizeForMatch(windowTitle);
  const normGame = normalizeForMatch(gameTitle);
  const MIN_LEN = 6;
  if (normWindow.length >= MIN_LEN && normGame.includes(normWindow)) return true;
  if (normGame.length >= MIN_LEN && normWindow.includes(normGame)) return true;
  return false;
}
function attemptDetection(gameId, before, requiresLauncherId, state) {
  const known = getWindowClass(gameId);
  if (known) {
    const beforeIds2 = new Set(before.map((w) => w.id));
    let match = listWindows().find((w) => w.wmClass === known && !beforeIds2.has(w.id));
    if (match && GENERIC_WM_CLASSES.has(known)) {
      const gameTitle = getGameById(gameId)?.title ?? "";
      if (!titleLooksLikeGame(match.title, gameTitle)) {
        match = void 0;
      }
    }
    if (match) {
      writeLog("system", `[WINDOW] "${gameId}": corrispondenza diretta trovata \u2014 "${known}" (finestra: "${match.title}").`);
    }
    return match ? { found: true, wmClass: known, windowTitle: match.title } : { found: false };
  }
  const after = listWindows();
  const beforeIds = new Set(before.map((w) => w.id));
  let candidates = after.filter((w) => !beforeIds.has(w.id) && !isSplashWindow(w) && !isSystemWindow(w));
  if (requiresLauncherId) {
    const def = getThirdPartyLauncherDefinition(requiresLauncherId);
    if (def?.knownWindowTitle) {
      candidates = candidates.filter((w) => w.title !== def.knownWindowTitle);
    }
  }
  if (candidates.length > 1) {
    const gameTitle = getGameById(gameId)?.title ?? "";
    const titleMatches = candidates.filter((w) => titleLooksLikeGame(w.title, gameTitle));
    if (titleMatches.length === 1) {
      candidates = titleMatches;
    }
  }
  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (state.pendingId === candidate.id) {
      updateWindowClass(gameId, candidate.wmClass);
      writeLog("system", `[WINDOW] "${gameId}": window_class appreso \u2014 "${candidate.wmClass}" (finestra: "${candidate.title}").`);
      return { found: true, wmClass: candidate.wmClass, windowTitle: candidate.title };
    }
    state.pendingId = candidate.id;
    return { found: false };
  }
  if (candidates.length > 1) {
    writeLog("system", `[WINDOW] "${gameId}": ${candidates.length} finestre nuove candidate insieme, ambiguo \u2014 non salvato questo giro.`);
  }
  state.pendingId = null;
  return { found: false };
}
function waitForGameWindow(gameId, before, requiresLauncherId, timeoutMs, pollIntervalMs = 2e3) {
  return new Promise((resolve) => {
    const start = Date.now();
    const state = { pendingId: null };
    const tick = () => {
      const result = attemptDetection(gameId, before, requiresLauncherId, state);
      if (result.found) {
        resolve(result);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve({ found: false });
        return;
      }
      setTimeout(tick, pollIntervalMs);
    };
    tick();
  });
}

// src/backend/splashOrchestrator.ts
init_notificationEngine();
init_logger();
init_activeDisplay();
function waitForProcessAlive(gameId, timeoutMs, pollIntervalMs = 500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const check = gameManager.isLastLaunchedGameRunning();
      if (check.running && check.gameId === gameId) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, pollIntervalMs);
    };
    tick();
  });
}
function waitForLaunchError(gameId, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const listener = (event) => {
      if (settled) return;
      if (event.type === "launch-error" && event.gameId === gameId) {
        settled = true;
        notificationEngine.off(listener);
        resolve(true);
      }
    };
    notificationEngine.on(listener);
    setTimeout(() => {
      if (settled) return;
      settled = true;
      notificationEngine.off(listener);
      resolve(false);
    }, timeoutMs);
  });
}
var pendingCancelResolvers = /* @__PURE__ */ new Map();
function waitForCancelRequest(gameId) {
  return new Promise((resolve) => {
    pendingCancelResolvers.set(gameId, resolve);
  });
}
function requestLaunchCancel(gameId) {
  const resolve = pendingCancelResolvers.get(gameId);
  if (!resolve) return false;
  pendingCancelResolvers.delete(gameId);
  resolve();
  return true;
}
async function raceSplashClose(gameId, windowSnapshotBefore, requiresLauncherId, pidToKillOnTimeout) {
  const isKiosk = getActiveSessionInfo().kind === "kiosk";
  const windowResultPromise = isKiosk ? waitForProcessAlive(gameId, LAUNCH_WINDOW_TIMEOUT_MS).then((found) => ({ found })) : waitForGameWindow(gameId, windowSnapshotBefore, requiresLauncherId, LAUNCH_WINDOW_TIMEOUT_MS);
  const errorPromise = waitForLaunchError(gameId, LAUNCH_WINDOW_TIMEOUT_MS);
  const cancelPromise = waitForCancelRequest(gameId);
  const raceResult = await Promise.race([
    windowResultPromise.then((r) => ({ kind: "window", found: r.found })),
    errorPromise.then((found) => ({ kind: "error", found })),
    cancelPromise.then(() => ({ kind: "cancel", found: true }))
  ]);
  pendingCancelResolvers.delete(gameId);
  if (raceResult.kind === "window" && raceResult.found) {
    emitLaunchPhase({ gameId, phase: "done" });
    return;
  }
  if (raceResult.kind === "error" && raceResult.found) {
    emitLaunchPhase({ gameId, phase: "failed" });
    return;
  }
  if (raceResult.kind === "cancel") {
    emitLaunchPhase({ gameId, phase: "cancelled" });
    if (pidToKillOnTimeout) {
      writeLog("info", `[SPLASH] "${gameId}": lancio annullato dall'utente \u2014 termino il processo (PID ${pidToKillOnTimeout}).`);
      try {
        process.kill(pidToKillOnTimeout, "SIGTERM");
      } catch {
      }
      setTimeout(() => {
        try {
          process.kill(pidToKillOnTimeout, "SIGKILL");
        } catch {
        }
      }, 3e3);
    }
    return;
  }
  emitLaunchPhase({ gameId, phase: "timeout" });
  if (pidToKillOnTimeout) {
    const reason = isKiosk ? "nessun processo rilevato come attivo" : "nessuna finestra rilevata";
    writeLog("warning", `[SPLASH] "${gameId}": ${reason} entro ${LAUNCH_WINDOW_TIMEOUT_MS / 1e3}s \u2014 termino forzatamente il processo di lancio (PID ${pidToKillOnTimeout}).`);
    try {
      process.kill(pidToKillOnTimeout, "SIGTERM");
    } catch {
    }
    setTimeout(() => {
      try {
        process.kill(pidToKillOnTimeout, "SIGKILL");
      } catch {
      }
    }, 3e3);
  }
}

// src/backend/gameManager.ts
var import_path16 = __toESM(require("path"), 1);

// src/backend/plugins/gogPlugin.ts
init_base2();
init_logger();
var import_fs6 = require("fs");
var import_child_process2 = require("child_process");
var import_os2 = require("os");
var import_path7 = __toESM(require("path"), 1);
var HEROIC_INSTALLED_PATHS = [
  import_path7.default.join((0, import_os2.homedir)(), ".config", "heroic", "gog_store", "installed.json"),
  import_path7.default.join(
    (0, import_os2.homedir)(),
    ".var",
    "app",
    "com.heroicgameslauncher.hgl",
    "config",
    "heroic",
    "gog_store",
    "installed.json"
  )
];
var LGOG_CONFIG_DIR = import_path7.default.join(
  process.env.XDG_CONFIG_HOME || import_path7.default.join((0, import_os2.homedir)(), ".config"),
  "lgogdownloader"
);
var LGOG_AUTH_FILES = ["cookies.txt", "galaxy_tokens.json"];
var COVER_PLACEHOLDER = "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=400&h=533";
var PREVIEW_PLACEHOLDER = "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=800&h=450";
var LGOG_TIMEOUT_MS = 12e4;
function binaryExists(bin) {
  try {
    (0, import_child_process2.execSync)(`which ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function slugToTitle(slug) {
  return slug.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").replace(/\s*\[\d+\]\s*$/, "").trim();
}
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\^\[\[?[0-9;]*[A-Za-z]/g, "").replace(/\[\[?[0-9;]+[A-Za-z]/g, "").replace(/\^/g, "");
}
function parseSlug(line) {
  return stripAnsi(line).replace(/\s*\[\d+\]\s*$/, "").trim();
}
var GOG_SLUG_PATTERN = /^[a-z0-9_]+(?:\s*\[\d+\])?$/;
var NON_GAME_SLUG_SUFFIXES = ["_goodies_collection"];
function isValidGameSlugLine(trimmed) {
  if (!trimmed) return false;
  if (trimmed.startsWith("Getting ") || trimmed.startsWith("Loaded ") || trimmed.startsWith("Error")) return false;
  const clean = stripAnsi(trimmed);
  if (!GOG_SLUG_PATTERN.test(clean)) return false;
  const withoutSuffixTag = clean.replace(/\s*\[\d+\]\s*$/, "");
  if (NON_GAME_SLUG_SUFFIXES.some((suffix) => withoutSuffixTag.endsWith(suffix))) return false;
  return true;
}
function isJunkGogSlug(slug) {
  return !isValidGameSlugLine(slug);
}
function getLibraryFromLgog() {
  return new Promise((resolve) => {
    const proc = (0, import_child_process2.spawn)("lgogdownloader", ["--list", "games", "--no-color", "--no-platform-detection"], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const games = [];
    let buffer = "";
    const timer = setTimeout(() => {
      proc.kill();
      writeLog("warning", "[GOG] lgogdownloader --list timeout (60s) \u2014 returning partial list");
      resolve(games);
    }, LGOG_TIMEOUT_MS);
    const onData = (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/[\r\n]/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!isValidGameSlugLine(trimmed)) continue;
        const slug = parseSlug(trimmed);
        const title = slugToTitle(trimmed);
        games.push({
          id: `gog-${slug}`,
          title,
          store: "GOG Galaxy",
          runner: "Wine-Lutris",
          isInstalled: false,
          status: "Not Installed",
          coverImage: COVER_PLACEHOLDER,
          previewImage: PREVIEW_PLACEHOLDER,
          rating: 0,
          playTimeHours: 0,
          tags: [],
          genres: [],
          description: ""
        });
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("close", () => {
      clearTimeout(timer);
      if (isValidGameSlugLine(buffer.trim())) {
        const slug = parseSlug(buffer.trim());
        const title = slugToTitle(buffer.trim());
        games.push({
          id: `gog-${slug}`,
          title,
          store: "GOG Galaxy",
          runner: "Wine-Lutris",
          isInstalled: false,
          status: "Not Installed",
          coverImage: COVER_PLACEHOLDER,
          previewImage: PREVIEW_PLACEHOLDER,
          rating: 0,
          playTimeHours: 0,
          tags: [],
          genres: [],
          description: ""
        });
      }
      resolve(games);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
  });
}
function getInstalledFromHeroic() {
  const installed = /* @__PURE__ */ new Map();
  for (const filePath of HEROIC_INSTALLED_PATHS) {
    if (!(0, import_fs6.existsSync)(filePath)) continue;
    try {
      const data = JSON.parse((0, import_fs6.readFileSync)(filePath, "utf8"));
      const entries = Array.isArray(data) ? data : data.installed ?? [];
      for (const e of entries) {
        installed.set(`gog-${e.appName}`, {
          isInstalled: true,
          executablePath: e.executable ?? void 0,
          title: e.title ?? void 0
        });
      }
      break;
    } catch {
      continue;
    }
  }
  return installed;
}
var GOGPlugin = class extends StorePlugin {
  id = "GOG Galaxy";
  name = "GOG Galaxy";
  drmFree = true;
  // GOG è DRM-free by design
  description = "Libreria GOG Galaxy \u2014 DRM-free, richiede lgogdownloader";
  requiredTool = "lgogdownloader";
  async getLibrary() {
    if (!binaryExists("lgogdownloader")) {
      writeLog("warning", "[GOG] lgogdownloader not found. Install with: yay -S lgogdownloader");
      return [];
    }
    const games = await getLibraryFromLgog();
    if (games.length === 0) {
      const stillAuthenticated = await this.isAuthenticated();
      if (stillAuthenticated) {
        writeLog("warning", "[GOG] Valid API login but --list returns no titles: likely a session/cookie issue on the website (not the API token) \u2014 a known lgogdownloader behavior. Try: lgogdownloader --login from a terminal, making sure to complete the login fully with no other GOG sessions active in the browser at the same time; if it persists, consider clearing the lgogdownloader cache (~/.cache/lgogdownloader, ~/.config/lgogdownloader) before logging in again.");
      } else {
        writeLog("warning", "[GOG] No titles found and API login invalid. Run: lgogdownloader --login");
      }
      return [];
    }
    const heroicInstalled = getInstalledFromHeroic();
    for (const game of games) {
      const heroic = heroicInstalled.get(game.id);
      if (heroic) {
        if (heroic.isInstalled) game.isInstalled = true;
        if (heroic.executablePath) game.executablePath = heroic.executablePath;
        if (heroic.title) game.title = heroic.title;
      }
      const slug = game.id.replace(/^gog-/, "");
      const filesDir = import_path7.default.join((0, import_os2.homedir)(), "Games", "GOG", slug, "files");
      if (!game.isInstalled && (0, import_fs6.existsSync)(filesDir)) {
        const contents = (0, import_fs6.readdirSync)(filesDir).filter((f) => !f.startsWith("."));
        if (contents.length > 0) game.isInstalled = true;
      }
    }
    const installedCount = games.filter((g) => g.isInstalled).length;
    writeLog("info", `[GOG] ${games.length} titles (${installedCount} installed)`);
    return games;
  }
  async installGame(id) {
    const slug = id.replace(/^gog-/, "");
    if (binaryExists("lgogdownloader")) {
      return { success: true, message: `Avvia: lgogdownloader --download --game ${slug}` };
    }
    return { success: false, message: "lgogdownloader non trovato." };
  }
  async uninstallGame(_id) {
    return { success: true };
  }
  /**
   * Verifica autenticazione GOG: usa `--check-login-status`, il comando
   * dedicato a questo scopo (non `--list`). Riporta un exit code binario
   * affidabile — 0 = loggato, 1 = non loggato — invece di dover indovinare
   * lo stato dal contenuto testuale di un comando pensato per altro.
   * `--list` può fallire ("No games were found on your account") anche con
   * un login API perfettamente valido, per problemi separati legati ai
   * cookie del sito (comportamento noto e documentato di lgogdownloader) —
   * interrogarlo per "sono autenticato?" era quindi il comando sbagliato,
   * non solo un parsing fragile.
   */
  async isAuthenticated() {
    if (!binaryExists("lgogdownloader")) return false;
    return new Promise((resolve) => {
      const { spawn: spawn10 } = require("child_process");
      const proc = spawn10("lgogdownloader", ["--check-login-status"], { timeout: 1e4 });
      proc.on("close", (code) => {
        resolve(code === 0);
      });
      proc.on("error", () => resolve(false));
    });
  }
  /**
   * Disconnette l'account GOG senza cancellare nulla: rinomina i file di
   * autenticazione (cookies.txt, galaxy_tokens.json) con suffisso .unlink.
   * lgogdownloader non espone un comando --logout — questa è l'unica via
   * praticabile, e la rinomina invece della cancellazione la rende
   * reversibile: l'utente può ripristinare l'accesso rinominando i file
   * manualmente da terminale, senza aver perso le credenziali salvate.
   */
  async logout() {
    try {
      let renamed = 0;
      for (const filename of LGOG_AUTH_FILES) {
        const filePath = import_path7.default.join(LGOG_CONFIG_DIR, filename);
        if ((0, import_fs6.existsSync)(filePath)) {
          const targetPath = `${filePath}.unlink`;
          const finalTarget = (0, import_fs6.existsSync)(targetPath) ? `${filePath}.unlink.${Date.now()}` : targetPath;
          (0, import_fs6.renameSync)(filePath, finalTarget);
          renamed++;
        }
      }
      if (renamed === 0) {
        return { success: true, message: "Nessuna credenziale GOG trovata da disconnettere." };
      }
      writeLog("auth", `[GOG] logout: ${renamed} credential files renamed with .unlink suffix`);
      return { success: true, message: "Account GOG disconnesso. I file di credenziali sono stati rinominati, non cancellati." };
    } catch (e) {
      writeLog("error", `[GOG] logout error: ${e.message}`);
      return { success: false, message: `Errore durante la disconnessione: ${e.message}` };
    }
  }
  /**
   * Non tenta più di lanciare `lgogdownloader --login` dal processo backend
   * e intercettarne l'output per estrarre l'URL OAuth. Stesso motivo già
   * diagnosticato per Epic/legendary: il processo figlio del backend non ha
   * un terminale interattivo reale a cui collegarsi, e questo tipo di
   * comando si aspetta una sessione interattiva per l'intero handshake
   * OAuth (apertura browser, eventuale 2FA, redirect).
   *
   * Il login GOG richiede comunque un passaggio interattivo che solo un
   * terminale reale può gestire bene. Questo metodo si limita quindi a
   * istruire l'utente sul comando esatto da eseguire nel SUO terminale; il
   * frontend fa polling su isAuthenticated() e aggiorna la card
   * automaticamente non appena l'utente completa il login da solo.
   */
  async login() {
    if (!binaryExists("lgogdownloader")) {
      return {
        success: false,
        message: "lgogdownloader non trovato. Installa con: yay -S lgogdownloader"
      };
    }
    return {
      success: true,
      waitForBrowser: true,
      message: "Apri un terminale ed esegui: lgogdownloader --login \u2014 segui le istruzioni a schermo. Questa card si aggiorner\xE0 automaticamente al termine."
    };
  }
  /**
   * Richiesta utente — dimensione PREVISTA dell'installazione (prima di
   * scaricare), non quella reale su disco a installazione avvenuta.
   *
   * Deliberatamente diverso dal --list details/json usato per l'intero
   * catalogo (vedi commento in cima al file: scartato lì perché fa una
   * chiamata API per gioco, 128 chiamate per l'intera libreria sono
   * impraticabili) — qui invece è UN SOLO gioco alla volta, on-demand,
   * quando l'utente lo seleziona: la stessa chiamata che per l'intero
   * catalogo era impraticabile, per un singolo gioco è perfettamente
   * ragionevole.
   *
   * NOTA ONESTA: non testato dal vivo in questo ambiente (nessun account
   * GOG/lgogdownloader disponibile qui) — il nome esatto del campo JSON
   * con la dimensione non è verificato. Per questo il JSON grezzo viene
   * sempre loggato per intero al primo utilizzo: se il parsing sotto non
   * trova il campo giusto, il log mostra comunque la struttura reale,
   * invece di fallire in silenzio come è successo con l'opzione
   * --appendconfig= di RetroArch in una sessione precedente.
   */
  async getPredictedInstallSizeBytes(gameId) {
    const slug = gameId.replace(/^gog-/, "");
    if (!binaryExists("lgogdownloader")) return null;
    return new Promise((resolve) => {
      const proc = (0, import_child_process2.spawn)("lgogdownloader", ["--list", "details", "--game", `^${slug}$`, "--no-color"], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        proc.kill();
        resolve(null);
      }, 3e4);
      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      proc.on("close", () => {
        clearTimeout(timer);
        const clean = stripAnsi(stdout);
        writeLog("info", `[GOG] --list details --game ${slug} \u2014 output grezzo: ${clean.slice(0, 3e3)}`);
        if (stderr.trim()) writeLog("info", `[GOG] --list details --game ${slug} \u2014 stderr: ${stderr.slice(0, 500)}`);
        const installersSection = clean.split(/^installers:\s*$/m)[1]?.split(/^(?:extras|patches|dlcs):\s*$/m)[0] ?? "";
        const matches = [...installersSection.matchAll(/^\s*size:\s*(\d+)\s*$/gm)];
        if (matches.length === 0) {
          writeLog("info", `[GOG] Nessuna dimensione trovata nella sezione installers per ${slug} \u2014 vedi output grezzo sopra per adattare il pattern.`);
          return resolve(null);
        }
        const totalBytes = matches.reduce((acc, m) => acc + (parseInt(m[1], 10) || 0), 0);
        resolve(totalBytes > 0 ? totalBytes : null);
      });
      proc.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
  }
};

// src/wineVerbs.ts
var DEFAULT_WINE_VERBS = ["vcrun2022", "dxvk", "vkd3d", "corefonts"];
var OPTIONAL_WINE_VERBS = [
  "vcrun2019",
  "vcrun2017",
  "vcrun2015",
  "xna40",
  "d3dcompiler_47",
  "d3dcompiler_43",
  "d3d9",
  "physx",
  "msxml6",
  "mfc140",
  "dotnet48",
  "dotnet40",
  "dotnet35"
];
var OS_VERSION_VERBS = ["win10", "win81", "win7", "vista", "winxp"];
var ALL_KNOWN_WINE_VERBS = [...DEFAULT_WINE_VERBS, ...OPTIONAL_WINE_VERBS, ...OS_VERSION_VERBS];

// src/backend/plugins/steamPlugin.ts
init_base2();
init_logger();
var import_fs7 = require("fs");
var import_os3 = require("os");
var import_path8 = __toESM(require("path"), 1);
var STEAM_ROOTS = [
  import_path8.default.join((0, import_os3.homedir)(), ".local", "share", "Steam"),
  import_path8.default.join((0, import_os3.homedir)(), ".steam", "steam"),
  import_path8.default.join((0, import_os3.homedir)(), ".steam", "debian-installation"),
  "/usr/share/steam"
];
function parseVdf(content) {
  const result = {};
  const lines = content.split("\n");
  const stack = [result];
  let currentKey = "";
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("//")) continue;
    if (line === "{") {
      const newBlock = {};
      stack[stack.length - 1][currentKey] = newBlock;
      stack.push(newBlock);
      continue;
    }
    if (line === "}") {
      stack.pop();
      continue;
    }
    const match = line.match(/^"([^"]+)"\s+"([^"]*)"$/);
    if (match) {
      stack[stack.length - 1][match[1]] = match[2];
      continue;
    }
    const keyMatch = line.match(/^"([^"]+)"$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
    }
  }
  return result;
}
function findSteamRoot() {
  return STEAM_ROOTS.find((p) => (0, import_fs7.existsSync)(import_path8.default.join(p, "steamapps"))) ?? null;
}
function findAllLibraryPaths(steamRoot) {
  const paths = [import_path8.default.join(steamRoot, "steamapps")];
  const vdfPath = import_path8.default.join(steamRoot, "steamapps", "libraryfolders.vdf");
  if (!(0, import_fs7.existsSync)(vdfPath)) return paths;
  try {
    const parsed = parseVdf((0, import_fs7.readFileSync)(vdfPath, "utf-8"));
    const folders = parsed["libraryfolders"] ?? parsed["LibraryFolders"] ?? {};
    for (const key of Object.keys(folders)) {
      if (isNaN(Number(key))) continue;
      const entry = folders[key];
      const folderPath = typeof entry === "object" ? entry["path"] : entry;
      if (folderPath && (0, import_fs7.existsSync)(folderPath)) {
        const libPath = import_path8.default.join(folderPath, "steamapps");
        if (!paths.includes(libPath)) paths.push(libPath);
      }
    }
  } catch {
  }
  return paths;
}
function getActiveSteamId(steamRoot) {
  const vdfPath = import_path8.default.join(steamRoot, "config", "loginusers.vdf");
  if (!(0, import_fs7.existsSync)(vdfPath)) return null;
  try {
    const parsed = parseVdf((0, import_fs7.readFileSync)(vdfPath, "utf-8"));
    const users = parsed["users"] ?? parsed["Users"] ?? {};
    let fallback = null;
    for (const [steamId, data] of Object.entries(users)) {
      if (!fallback) fallback = steamId;
      if (data?.MostRecent === "1" || data?.mostrecent === "1") return steamId;
    }
    return fallback;
  } catch {
    return null;
  }
}
async function fetchPlaytimeMap(steamId, apiKey) {
  const map = /* @__PURE__ */ new Map();
  try {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_played_free_games=1&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8e3) });
    if (!res.ok) return map;
    const data = await res.json();
    for (const game of data?.response?.games ?? []) {
      map.set(String(game.appid), (game.playtime_forever ?? 0) / 60);
    }
  } catch {
  }
  return map;
}
function getLocalCover(steamRoot, appId) {
  const candidates = [
    import_path8.default.join(steamRoot, "appcache", "librarycache", `${appId}_library_600x900.jpg`),
    import_path8.default.join(steamRoot, "appcache", "librarycache", `${appId}_header.jpg`),
    import_path8.default.join(steamRoot, "appcache", "librarycache", `${appId}_library_hero.jpg`)
  ];
  return `https://cdn.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}
var SteamPlugin = class extends StorePlugin {
  id = "Steam";
  name = "Steam";
  isPublic = true;
  drmFree = false;
  // Steam richiede il client attivo
  description = "Libreria Steam \u2014 legge i file .acf locali";
  requiredTool = "steam";
  async isAuthenticated() {
    return findSteamRoot() !== null;
  }
  async login() {
    const root = findSteamRoot();
    if (!root) {
      return { success: false, message: "Steam non installato o cartella non trovata." };
    }
    return { success: true, message: `Steam trovato in ${root}` };
  }
  async getLibrary() {
    const steamRoot = findSteamRoot();
    if (!steamRoot) {
      writeLog("info", "[STEAM] Client not found \u2014 returning empty array.");
      return [];
    }
    const apiKey = process.env.STEAM_API_KEY ?? "";
    const steamId = process.env.STEAM_ID ?? getActiveSteamId(steamRoot) ?? "";
    let playtimeMap = /* @__PURE__ */ new Map();
    if (apiKey && steamId) {
      writeLog("info", "[STEAM] Fetching playtime via Web API...");
      playtimeMap = await fetchPlaytimeMap(steamId, apiKey);
    }
    const libraryPaths = findAllLibraryPaths(steamRoot);
    const games = [];
    for (const libPath of libraryPaths) {
      if (!(0, import_fs7.existsSync)(libPath)) continue;
      let acfFiles;
      try {
        acfFiles = (0, import_fs7.readdirSync)(libPath).filter((f) => f.startsWith("appmanifest_") && f.endsWith(".acf"));
      } catch {
        continue;
      }
      for (const acfFile of acfFiles) {
        try {
          const content = (0, import_fs7.readFileSync)(import_path8.default.join(libPath, acfFile), "utf-8");
          const parsed = parseVdf(content);
          const app = parsed["AppState"] ?? parsed["appstate"] ?? {};
          const appId = app["appid"] ?? app["AppID"] ?? "";
          const name = app["name"] ?? app["Name"] ?? "";
          const state = parseInt(app["StateFlags"] ?? "0", 10);
          if (!appId || !name) continue;
          const nameLower = name.toLowerCase();
          const isSteamTool = nameLower.startsWith("proton") || nameLower.startsWith("steam linux runtime") || nameLower.startsWith("steamworks") || nameLower.startsWith("steam vr") || nameLower.startsWith("steamvr") || nameLower.includes("redistributable") || nameLower.includes("sdk") || nameLower === "steam linux runtime";
          if (isSteamTool) continue;
          const isInstalled = (state & 4) === 4;
          const sizeOnDisk = parseInt(app["SizeOnDisk"] ?? "0", 10);
          const lastPlayed = parseInt(app["LastPlayed"] ?? "0", 10);
          const installedAt = app["LastUpdated"] ? new Date(parseInt(app["LastUpdated"], 10) * 1e3).toISOString() : void 0;
          const playHours = playtimeMap.get(appId) ?? 0;
          games.push({
            id: `steam-${appId}`,
            title: name,
            store: "Steam",
            // Il runner è sempre "steam-native": il lancio usa steam:// URI
            runner: "Steam Native",
            isInstalled,
            playTimeHours: playHours,
            coverImage: getLocalCover(steamRoot, appId),
            previewImage: `https://cdn.steamstatic.com/steam/apps/${appId}/header.jpg`,
            description: "",
            tags: [],
            status: isInstalled ? "Ready to Launch" : "Not Installed",
            steamAppId: appId,
            installedAt
          });
        } catch {
        }
      }
    }
    writeLog("info", `[STEAM] ${games.length} titles found across ${libraryPaths.length} libraries.`);
    return games;
  }
  async installGame(gameId) {
    const appId = gameId.replace("steam-", "");
    const { spawn: spawn10 } = await import("child_process");
    spawn10("steam", [`steam://install/${appId}`], { detached: true, stdio: "ignore" }).unref();
    return { success: true };
  }
  async uninstallGame(gameId) {
    const appId = gameId.replace("steam-", "");
    const { spawn: spawn10 } = await import("child_process");
    spawn10("steam", [`steam://uninstall/${appId}`], { detached: true, stdio: "ignore" }).unref();
    return { success: true };
  }
};

// src/backend/plugins/epicPlugin.ts
init_base2();
init_logger();
var import_child_process3 = require("child_process");
var COVER_PLACEHOLDER2 = "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&q=80&w=400&h=533";
var PREVIEW_PLACEHOLDER2 = "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&q=80&w=800&h=450";
var LEGENDARY_TIMEOUT_MS = 6e4;
var LEGENDARY_INSTALLED_TIMEOUT_MS = 15e3;
function binaryExists2(bin) {
  try {
    (0, import_child_process3.execSync)(`which ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function isMainGame(entry) {
  const cats = entry.metadata.categories?.map((c) => c.path) ?? [];
  if (cats.length === 0) return true;
  const hasGames = cats.some((c) => c === "games" || c === "applications");
  const isAddonOnly = cats.every(
    (c) => ["addons", "digitalextras", "audience", "developer"].includes(c)
  );
  return hasGames && !isAddonOnly;
}
function extractImages(keyImages = []) {
  const tall = keyImages.find((i) => i.type === "DieselGameBoxTall");
  const wide = keyImages.find((i) => i.type === "DieselGameBox");
  return {
    coverImage: tall?.url ?? wide?.url ?? COVER_PLACEHOLDER2,
    previewImage: wide?.url ?? tall?.url ?? PREVIEW_PLACEHOLDER2
  };
}
function getLibraryFromLegendary() {
  return new Promise((resolve) => {
    const proc = (0, import_child_process3.spawn)("legendary", ["list", "--json"], {
      stdio: ["ignore", "pipe", "pipe"]
      // stderr separato per filtrare i log di legendary
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      writeLog("warning", "[Epic] legendary list timeout (60s)");
      resolve([]);
    }, LEGENDARY_TIMEOUT_MS);
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        writeLog("warning", `[Epic] legendary list exit ${code}: ${stderr.slice(0, 200)}`);
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? parsed : []);
      } catch (err) {
        writeLog("warning", `[Epic] legendary list JSON parse error: ${err}`);
        resolve([]);
      }
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
  });
}
function getInstalledFromLegendary() {
  return new Promise((resolve) => {
    const proc = (0, import_child_process3.spawn)("legendary", ["list-installed", "--json"], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    const timer = setTimeout(() => {
      proc.kill();
      resolve(/* @__PURE__ */ new Set());
    }, LEGENDARY_INSTALLED_TIMEOUT_MS);
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout);
        const installed = new Set(
          Array.isArray(parsed) ? parsed.map((g) => g.app_name) : []
        );
        resolve(installed);
      } catch {
        resolve(/* @__PURE__ */ new Set());
      }
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(/* @__PURE__ */ new Set());
    });
  });
}
var EpicPlugin = class extends StorePlugin {
  id = "Epic Games";
  name = "Epic Games";
  drmFree = false;
  // Epic richiede EOS per la maggior parte dei titoli
  description = "Libreria Epic Games \u2014 richiede legendary";
  requiredTool = "legendary";
  async getLibrary() {
    if (!binaryExists2("legendary")) {
      writeLog("warning", "[Epic] legendary not found. Install with: yay -S legendary-gl");
      return [];
    }
    const [rawGames, installedSet] = await Promise.all([
      getLibraryFromLegendary(),
      getInstalledFromLegendary()
    ]);
    if (rawGames.length === 0) {
      writeLog("warning", "[Epic] No titles found. Have you run legendary auth?");
      return [];
    }
    const games = [];
    const seenAppNames = /* @__PURE__ */ new Set();
    for (const entry of rawGames) {
      if (!entry.asset_infos?.Windows) continue;
      if (!isMainGame(entry)) continue;
      if (seenAppNames.has(entry.app_name)) continue;
      seenAppNames.add(entry.app_name);
      const { coverImage, previewImage } = extractImages(entry.metadata.keyImages);
      const isInstalled = installedSet.has(entry.app_name);
      games.push({
        id: `epic-${entry.app_name}`,
        title: entry.app_title,
        store: "Epic Games",
        runner: "Wine-Lutris",
        isInstalled,
        status: isInstalled ? "Ready to Launch" : "Not Installed",
        coverImage,
        previewImage,
        rating: 0,
        playTimeHours: 0,
        tags: [],
        genres: [],
        description: entry.metadata.description ?? ""
      });
    }
    const installedCount = games.filter((g) => g.isInstalled).length;
    writeLog("info", `[Epic] ${games.length} titles (${installedCount} installed)`);
    return games;
  }
  async installGame(id) {
    const appName = id.replace(/^epic-/, "");
    if (binaryExists2("legendary")) {
      return { success: true, message: `Avvia: legendary install ${appName}` };
    }
    return { success: false, message: "legendary non trovato." };
  }
  async uninstallGame(id) {
    const appName = id.replace(/^epic-/, "");
    if (binaryExists2("legendary")) {
      return { success: true, message: `Avvia: legendary uninstall ${appName}` };
    }
    return { success: true };
  }
  /**
   * v1.5.20-dev.14 — riconosce il fallimento definitivo scoperto con
   * Watch Dogs 2 (vedi CHANGELOG.md): alcuni titoli Ubisoft riscattati su
   * Epic non hanno file scaricabili affatto, legendary lo dichiara con
   * questa frase esatta (verificata su un'issue reale Heroic Games
   * Launcher #2432, stesso identico messaggio) DURANTE il tentativo di
   * installazione — non prima. Nessun altro pattern qui: solo questa
   * frase, il resto degli errori legendary (rete, auth, spazio disco)
   * restano fallimenti ordinari, ritentabili come sempre.
   */
  detectUnrecoverableInstallFailure(recentOutput) {
    return recentOutput.includes("does not ship executable game files");
  }
  /**
   * Verifica autenticazione Epic: `legendary status --json`
   * Restituisce autenticato se il campo `account` è presente e non vuoto.
   */
  async isAuthenticated() {
    if (!binaryExists2("legendary")) return false;
    return new Promise((resolve) => {
      const { spawn: spawn10 } = require("child_process");
      let stdout = "";
      const proc = spawn10("legendary", ["status", "--json"], {
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 8e3
      });
      proc.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      proc.on("close", () => {
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(!!(parsed?.account && parsed.account !== "<not logged in>"));
        } catch {
          resolve(false);
        }
      });
      proc.on("error", () => resolve(false));
    });
  }
  /**
   * Disconnette l'account Epic eseguendo `legendary auth --delete`, il
   * comando reale supportato dal tool (verificato contro il sorgente
   * ufficiale e contro Heroic Games Launcher, che usa esattamente questo
   * comando in produzione per il logout, e confermato empiricamente da test
   * diretti da terminale: il comando cancella davvero le credenziali e
   * `legendary status --json` lo riflette immediatamente e correttamente).
   *
   * `--logout` non esiste nella CLI di legendary: una versione precedente
   * di questo metodo usava quel flag, che non lanciava errore (quindi
   * appariva un falso successo) ma non invalidava nulla.
   */
  async logout() {
    if (!binaryExists2("legendary")) {
      return { success: false, message: "legendary non trovato." };
    }
    try {
      const { execSync: execSync15 } = require("child_process");
      const output = execSync15("legendary auth --delete", { encoding: "utf-8", timeout: 15e3 });
      writeLog("auth", `[Epic] logout: command executed, output: ${JSON.stringify(output)}`);
      return { success: true, message: "Account Epic disconnesso." };
    } catch (e) {
      writeLog("error", `[Epic] logout error: ${e.message} | stdout: ${e.stdout ?? "n/a"} | stderr: ${e.stderr ?? "n/a"}`);
      return { success: false, message: `Errore durante la disconnessione: ${e.message}` };
    }
  }
  /**
   * Non tenta più di lanciare `legendary auth --disable-webview` dal
   * processo backend e intercettarne l'output per estrarre l'URL OAuth.
   * Quel flusso si è dimostrato fragile: il processo figlio del backend
   * non ha un terminale interattivo reale a cui collegarsi, e su questa
   * versione di legendary il comando esce subito con un errore (Python
   * traceback, exit 1) invece di restare in attesa come un terminale
   * interattivo farebbe.
   *
   * Il login Epic richiede comunque un passaggio interattivo (username,
   * password, eventuale 2FA, e poi il codice di autorizzazione copiato
   * dal browser) che solo un terminale reale può gestire bene. Questo
   * metodo si limita quindi a istruire l'utente sul comando esatto da
   * eseguire nel SUO terminale; il frontend fa polling su isAuthenticated()
   * e aggiorna la card automaticamente non appena l'utente completa il
   * login da solo, senza bisogno di nessuna conferma manuale aggiuntiva.
   */
  async login() {
    if (!binaryExists2("legendary")) {
      return { success: false, message: "legendary non trovato. Installa con: yay -S legendary-gl" };
    }
    return {
      success: true,
      waitForBrowser: true,
      message: "Apri un terminale ed esegui: legendary auth \u2014 segui le istruzioni a schermo (login + codice di autorizzazione dal browser). Questa card si aggiorner\xE0 automaticamente al termine."
    };
  }
  /**
   * Richiesta utente — dimensione PREVISTA dell'installazione (prima di
   * scaricare), non quella reale su disco a installazione avvenuta.
   * `legendary info <app_name> --json` esiste apposta per questo scopo
   * (documentato: "Prints info about specified app name or manifest").
   *
   * NOTA ONESTA: non testato dal vivo in questo ambiente (nessun account
   * Epic/legendary disponibile qui) — a differenza di `legendary list
   * --json` (la cui struttura, vedi commento in cima al file, è stata
   * verificata con un test reale in una sessione precedente), la
   * struttura di `info --json` specificamente non lo è. Il JSON grezzo
   * viene sempre loggato per intero al primo utilizzo: se il parsing
   * sotto non trova il campo giusto, il log mostra comunque la
   * struttura reale invece di fallire in silenzio.
   */
  async getPredictedInstallSizeBytes(gameId) {
    const appName = gameId.replace(/^epic-/, "");
    if (!binaryExists2("legendary")) return null;
    return new Promise((resolve) => {
      const proc = (0, import_child_process3.spawn)("legendary", ["info", appName, "--json"], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        proc.kill();
        resolve(null);
      }, 2e4);
      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      proc.on("close", () => {
        clearTimeout(timer);
        writeLog("info", `[Epic] legendary info ${appName} --json \u2014 output grezzo: ${stdout.slice(0, 2e3)}`);
        if (stderr.trim()) writeLog("info", `[Epic] legendary info ${appName} --json \u2014 stderr: ${stderr.slice(0, 500)}`);
        try {
          const parsed = JSON.parse(stdout);
          const candidates = [
            parsed?.manifest?.disk_size,
            parsed?.manifest?.install_size,
            parsed?.manifest?.download_size,
            parsed?.disk_size,
            parsed?.install_size,
            parsed?.download_size,
            parsed?.game?.disk_size,
            parsed?.game?.install_size
          ].filter((v) => typeof v === "number" && v > 0);
          if (candidates.length > 0) return resolve(candidates[0]);
          writeLog("info", `[Epic] Dimensione prevista non trovata nella struttura JSON per ${appName} \u2014 vedi output grezzo sopra per adattare il parsing.`);
          resolve(null);
        } catch (err) {
          writeLog("info", `[Epic] Output di legendary info ${appName} --json non \xE8 JSON valido \u2014 vedi output grezzo sopra.`);
          resolve(null);
        }
      });
      proc.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
  }
};

// src/backend/plugins/amazonPlugin.ts
init_base2();
init_logger();
var import_child_process4 = require("child_process");
var import_child_process5 = require("child_process");
var NILE_TIMEOUT_MS = 6e4;
var NILE_INFO_TIMEOUT_MS = 2e4;
function binaryExists3(bin) {
  try {
    (0, import_child_process5.execSync)(`which ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function getLibraryFromNile() {
  return new Promise((resolve) => {
    const proc = (0, import_child_process4.spawn)("nile", ["library", "list", "--json"], {
      stdio: ["ignore", "pipe", "pipe"]
      // stderr separato — nile logga INFO/WARNING lì
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      writeLog("warning", "[Amazon] nile library list timeout (60s)");
      resolve([]);
    }, NILE_TIMEOUT_MS);
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        writeLog("warning", `[Amazon] nile library list exit ${code}: ${stderr.slice(0, 200)}`);
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed) ? parsed : []);
      } catch (err) {
        writeLog("warning", `[Amazon] nile library list JSON parse error: ${err}`);
        resolve([]);
      }
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
  });
}
var AmazonPlugin = class extends StorePlugin {
  id = "Amazon Games";
  name = "Amazon Games";
  drmFree = false;
  description = "Libreria Amazon Games (Prime Gaming) \u2014 richiede nile";
  requiredTool = "nile";
  async getLibrary() {
    if (!binaryExists3("nile")) {
      writeLog("warning", "[Amazon] nile not found. Install with: yay -S nile-git");
      return [];
    }
    const rawEntries = await getLibraryFromNile();
    if (rawEntries.length === 0) {
      writeLog("warning", "[Amazon] No titles found. Have you run nile auth --login?");
      return [];
    }
    const games = [];
    const seenProductIds = /* @__PURE__ */ new Set();
    for (const entry of rawEntries) {
      if (entry.state && entry.state !== "LIVE") continue;
      const productId = entry.product?.id;
      if (!productId) continue;
      if (seenProductIds.has(productId)) continue;
      seenProductIds.add(productId);
      const details = entry.product.productDetail?.details;
      const isInstalled = false;
      games.push({
        id: `amazon-${productId}`,
        title: entry.product.title,
        store: "Amazon Games",
        runner: "Wine-Lutris",
        isInstalled,
        status: "Not Installed",
        // v1.1.110-dev.1 — nessun campo "boxart" verticale dedicato come
        // GOG/Epic in quanto emerso dal test reale: iconUrl (quadrata) è
        // il miglior candidato per coverImage, backgroundUrl1 (landscape)
        // per previewImage. Da rivedere se un titolo con struttura
        // diversa mostra qualcosa di più adatto.
        coverImage: entry.product.productDetail?.iconUrl ?? "",
        previewImage: details?.backgroundUrl1 ?? entry.product.productDetail?.iconUrl ?? "",
        rating: 0,
        playTimeHours: 0,
        tags: [],
        genres: details?.genres ?? [],
        description: details?.shortDescription ?? entry.product.description ?? ""
      });
    }
    const installedCount = games.filter((g) => g.isInstalled).length;
    writeLog("info", `[Amazon] ${games.length} titles (${installedCount} installed)`);
    return games;
  }
  async installGame(id) {
    const productId = id.replace(/^amazon-/, "");
    if (binaryExists3("nile")) {
      return { success: true, message: `Avvia: nile install ${productId}` };
    }
    return { success: false, message: "nile non trovato." };
  }
  async uninstallGame(id) {
    const productId = id.replace(/^amazon-/, "");
    if (binaryExists3("nile")) {
      return { success: true, message: `Avvia: nile uninstall ${productId}` };
    }
    return { success: true };
  }
  /**
   * Dimensione PREVISTA dell'installazione (prima di scaricare) — stessa
   * funzione già usata da GOG/Epic per "Dimensione Prevista" in sidebar.
   * `nile install <id> --info --json` — VERIFICATO con test reale
   * dall'utente (non un'ipotesi come per Epic): risposta esatta
   * `{"download_size": 3371488219}` per un titolo non installato.
   */
  async getPredictedInstallSizeBytes(gameId) {
    const productId = gameId.replace(/^amazon-/, "");
    if (!binaryExists3("nile")) return null;
    return new Promise((resolve) => {
      const proc = (0, import_child_process4.spawn)("nile", ["install", productId, "--info", "--json"], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        proc.kill();
        resolve(null);
      }, NILE_INFO_TIMEOUT_MS);
      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      proc.on("close", () => {
        clearTimeout(timer);
        writeLog("info", `[Amazon] nile install ${productId} --info --json \u2014 output grezzo: ${stdout.slice(0, 2e3)}`);
        if (stderr.trim()) writeLog("info", `[Amazon] nile install ${productId} --info --json \u2014 stderr: ${stderr.slice(0, 500)}`);
        try {
          const parsed = JSON.parse(stdout);
          if (typeof parsed?.download_size === "number" && parsed.download_size > 0) {
            resolve(parsed.download_size);
          } else {
            writeLog("info", `[Amazon] Campo download_size non trovato per ${productId} \u2014 vedi output grezzo sopra.`);
            resolve(null);
          }
        } catch {
          writeLog("info", `[Amazon] Output di nile install ${productId} --info --json non \xE8 JSON valido \u2014 vedi output grezzo sopra.`);
          resolve(null);
        }
      });
      proc.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
  }
  /**
   * Verifica autenticazione Amazon: `nile auth --status`. VERIFICATO con
   * output reale dall'utente: `{"Username": "Daniele", "LoggedIn": true}`
   * — JSON pulito, campo booleano `LoggedIn` senza ambiguità (a differenza
   * del caso Epic, dove `legendary status --json` usava una stringa
   * placeholder con un dettaglio facile da sbagliare — qui non c'è
   * bisogno di indovinare né di gestire quel tipo di caso).
   */
  async isAuthenticated() {
    if (!binaryExists3("nile")) return false;
    return new Promise((resolve) => {
      let stdout = "";
      const proc = (0, import_child_process4.spawn)("nile", ["auth", "--status"], {
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 8e3
      });
      proc.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      proc.on("close", () => {
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed?.LoggedIn === true);
        } catch {
          resolve(false);
        }
      });
      proc.on("error", () => resolve(false));
    });
  }
  /**
   * Login Amazon via `nile auth --login`: flusso interattivo verificato
   * dal vivo dall'utente (stampa un URL, l'utente lo apre nel browser,
   * fa login, incolla l'URL di redirect nel terminale). Stesso principio
   * già adottato per Epic in questo progetto: il processo backend non ha
   * un terminale interattivo reale a cui collegarsi, quindi non si tenta
   * di automatizzare il passaggio — si istruisce l'utente sul comando
   * esatto, il frontend fa polling su isAuthenticated() (quando pronta)
   * e aggiorna la card da sola al termine.
   */
  async login() {
    if (!binaryExists3("nile")) {
      return { success: false, message: "nile non trovato. Installa con: yay -S nile-git" };
    }
    return {
      success: true,
      waitForBrowser: true,
      message: "Apri un terminale ed esegui: nile auth --login \u2014 segui le istruzioni a schermo (apri l'URL nel browser, poi incolla qui l'URL di redirect). Questa card si aggiorner\xE0 automaticamente al termine."
    };
  }
  /**
   * Logout via `nile auth --logout` — confermato da `nile auth --help`
   * reale ("Logout from the accout and deregister"), nessuna ambiguità
   * di formato da verificare (a differenza di --status): il comando o
   * riesce o fallisce, nessun JSON da interpretare.
   */
  async logout() {
    if (!binaryExists3("nile")) {
      return { success: false, message: "nile non trovato." };
    }
    try {
      const output = (0, import_child_process5.execSync)("nile auth --logout", { encoding: "utf-8", timeout: 15e3 });
      writeLog("auth", `[Amazon] logout: command executed, output: ${JSON.stringify(output)}`);
      return { success: true, message: "Account Amazon disconnesso." };
    } catch (e) {
      writeLog("error", `[Amazon] logout error: ${e.message} | stdout: ${e.stdout ?? "n/a"} | stderr: ${e.stderr ?? "n/a"}`);
      return { success: false, message: `Errore durante la disconnessione: ${e.message}` };
    }
  }
};

// src/backend/plugins/battlenetPlugin.ts
init_base2();
var BattlenetPlugin = class extends StorePlugin {
  id = "Battle.net";
  name = "Battle.net";
  drmFree = false;
  description = "Battle.net \u2014 non ancora supportato";
  requiredTool = "";
  async getLibrary() {
    return [];
  }
  // TODO: non ancora implementato, in attesa del proprio turno (vedi thirdPartyLaunchers.ts)
  async installGame(_id) {
    return { success: true };
  }
  async uninstallGame(_id) {
    return { success: true };
  }
};

// src/backend/plugins/ubisoftConnectPlugin.ts
init_base2();
var import_path13 = __toESM(require("path"), 1);
init_db();

// src/backend/compatibilityManager.ts
var import_child_process6 = require("child_process");
var import_fs8 = require("fs");
var import_os4 = require("os");
var import_path9 = __toESM(require("path"), 1);
function getInstalledFlatpakApps() {
  try {
    const raw = (0, import_child_process6.execSync)("flatpak list --app --columns=application 2>/dev/null", {
      encoding: "utf-8",
      timeout: 3e3
    });
    return new Set(raw.split("\n").map((l) => l.trim()).filter(Boolean));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
var CompatibilityManager = class {
  // Bug segnalato dall'utente: un gioco Steam Windows-only (Limbo, senza
  // versione nativa Linux) girava correttamente tramite Proton, eppure
  // nessun runner Proton compariva né in Settings → System né nella
  // sezione Runner Bridge dell'overlay. Causa: queste due cartelle
  // coprono solo l'installazione DI DEFAULT di Steam — non le library
  // folder aggiuntive (es. un secondo disco dedicato ai giochi, comune su
  // un HTPC), dove Steam può installare la build Proton effettivamente
  // usata per quel titolo. steamPlugin.ts aveva già la soluzione corretta
  // per lo stesso identico problema applicato alla libreria giochi
  // (findSteamRoot/findAllLibraryPaths, legge libraryfolders.vdf) — mai
  // riusata qui, stesso bug in due punti diversi del codice. Calcolato a
  // ogni chiamata (non in un campo di classe): l'elenco delle library
  // folder può cambiare mentre l'app è in esecuzione (l'utente aggiunge/
  // rimuove un disco da Steam), un valore calcolato una sola volta al
  // costruttore l'avrebbe reso stantio.
  getProtonDirs() {
    const steamRoot = findSteamRoot();
    if (!steamRoot) {
      return [
        `${(0, import_os4.homedir)()}/.steam/steam/steamapps/common`,
        `${(0, import_os4.homedir)()}/.local/share/Steam/steamapps/common`,
        `${(0, import_os4.homedir)()}/.local/share/Steam/compatibilitytools.d`
      ];
    }
    const commonDirs = findAllLibraryPaths(steamRoot).map((libPath) => import_path9.default.join(libPath, "common"));
    return [...commonDirs, import_path9.default.join(steamRoot, "compatibilitytools.d")];
  }
  communityFixes = [
    {
      id: "fix-cp-audio",
      gameId: "gog-cp77",
      title: "Fix Audio Crackling",
      description: "Imposta PULSE_LATENCY_MSEC=60 per un audio pi\xF9 fluido con PulseAudio.",
      impact: "Medium"
    },
    {
      id: "fix-elden-anticheat",
      gameId: "steam-er",
      title: "EasyAntiCheat Bypass (offline)",
      description: "Rinomina start_protected_game.exe \u2192 eldenring.exe per la modalit\xE0 offline.",
      impact: "High"
    },
    {
      id: "fix-dxvk-async",
      gameId: "bnet-diablo4",
      title: "DXVK Async Pipeline",
      description: "DXVK_ASYNC=1 riduce gli stutter durante la compilazione shader.",
      impact: "High"
    }
  ];
  // Step successivo a v1.1.66 — segnalato dall'utente: Steam elenca ogni
  // Proton installato con un proprio appmanifest_<appid>.acf, ESATTAMENTE
  // come fa per un gioco — non serve dedurne la presenza scansionando
  // cartelle e cercando un file binario chiamato "proton" al suo interno
  // (v1.1.66, ancora valido come fallback per Proton-GE via ProtonUp/
  // download manuale, MAI tracciato da un appmanifest perché non
  // "installato" da Steam stesso). steamPlugin.ts legge già questi stessi
  // file per i giochi e SCARTA esplicitamente le voci che iniziano con
  // "proton" (isSteamTool) — stesso dato, mai riusato qui finora.
  getInstalledProtonFromManifests() {
    const steamRoot = findSteamRoot();
    if (!steamRoot) return [];
    const found = [];
    for (const libPath of findAllLibraryPaths(steamRoot)) {
      if (!(0, import_fs8.existsSync)(libPath)) continue;
      let acfFiles;
      try {
        acfFiles = (0, import_fs8.readdirSync)(libPath).filter((f) => f.startsWith("appmanifest_") && f.endsWith(".acf"));
      } catch {
        continue;
      }
      for (const acfFile of acfFiles) {
        try {
          const parsed = parseVdf((0, import_fs8.readFileSync)(import_path9.default.join(libPath, acfFile), "utf-8"));
          const app = parsed["AppState"] ?? parsed["appstate"] ?? {};
          const name = app["name"] ?? app["Name"] ?? "";
          if (!name.toLowerCase().startsWith("proton")) continue;
          const state = parseInt(app["StateFlags"] ?? "0", 10);
          if ((state & 4) !== 4) continue;
          found.push({ id: name, version: name, status: "installed" });
        } catch {
        }
      }
    }
    return found;
  }
  /** Scansiona l'FS e restituisce i build Proton effettivamente installati */
  getAvailableRunners() {
    const found = [];
    const seen = /* @__PURE__ */ new Set();
    for (const p of this.getInstalledProtonFromManifests()) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      found.push(p);
    }
    for (const dir of this.getProtonDirs()) {
      if (!(0, import_fs8.existsSync)(dir)) continue;
      try {
        const entries = (0, import_fs8.readdirSync)(dir);
        for (const entry of entries) {
          if (!entry.toLowerCase().includes("proton")) continue;
          if (seen.has(entry)) continue;
          seen.add(entry);
          const protonBin = import_path9.default.join(dir, entry, "proton");
          if ((0, import_fs8.existsSync)(protonBin)) {
            found.push({ id: entry, version: entry, status: "installed" });
          }
        }
      } catch {
      }
    }
    return found;
  }
  /**
   * Scarica Proton-GE.
   * Strategia:
   *   1. Se protonup CLI è disponibile → `protonup -i <version>`
   *   2. Altrimenti: download diretto da GitHub Releases via curl + tar
   */
  async downloadProton(id, onLogging) {
    onLogging(`[COMPAT] Avvio download per ${id}...`);
    if (this.binaryExists("protonup")) {
      onLogging(`[COMPAT] ProtonUp CLI trovato. Invocando protonup -i ${id}...`);
      return new Promise((resolve, reject) => {
        (0, import_child_process6.exec)(`protonup -i "${id}"`, (err, stdout, stderr) => {
          if (err) {
            onLogging(`[COMPAT] protonup fallito: ${stderr}`);
            reject(err);
          } else {
            onLogging(`[COMPAT] ${id} installato con successo via ProtonUp.`);
            resolve();
          }
        });
      });
    }
    const geVersion = id.replace("Proton-GE-", "GE-Proton");
    const tarName = `${geVersion}.tar.gz`;
    const url = `https://github.com/GloriousEggroll/proton-ge-custom/releases/download/${geVersion}/${tarName}`;
    const destDir = import_path9.default.join(findSteamRoot() ?? `${(0, import_os4.homedir)()}/.local/share/Steam`, "compatibilitytools.d");
    onLogging(`[COMPAT] Fetching: ${url}`);
    onLogging(`[COMPAT] Destinazione: ${destDir}`);
    return new Promise((resolve, reject) => {
      (0, import_child_process6.exec)(
        `mkdir -p "${destDir}" && curl -L "${url}" | tar -xz -C "${destDir}"`,
        (err, stdout, stderr) => {
          if (err) {
            onLogging(`[COMPAT] Download fallito: ${stderr}`);
            reject(err);
          } else {
            onLogging(`[COMPAT] ${id} estratto in ${destDir}. Riavvia Steam per rilevarlo.`);
            resolve();
          }
        }
      );
    });
  }
  getSuggestedFixes(gameId) {
    return this.communityFixes.filter((f) => f.gameId === gameId);
  }
  /**
   * Disinstalla un runner Proton-GE rimuovendo la sua cartella da
   * compatibilitytools.d. Vincolo di sicurezza: rifiuta esplicitamente di
   * procedere se il runner non si trova in quella cartella specifica —
   * in particolare non tocca mai steamapps/common, dove Steam gestisce
   * direttamente le proprie versioni ufficiali di Proton. Rimuovere quei
   * file manualmente romperebbe l'integrità della libreria Steam, che non
   * è compito né responsabilità di questo comando.
   */
  async uninstallProton(id, onLogging) {
    const compatDir = import_path9.default.join(findSteamRoot() ?? `${(0, import_os4.homedir)()}/.local/share/Steam`, "compatibilitytools.d");
    const target = import_path9.default.join(compatDir, id);
    if (!(0, import_fs8.existsSync)(target)) {
      const msg = `${id} non trovato in compatibilitytools.d \u2014 impossibile disinstallare (potrebbe essere un runner Steam ufficiale, gestito da Steam stesso, non da X-Launcher).`;
      onLogging(`[COMPAT] ${msg}`);
      throw new Error(msg);
    }
    onLogging(`[COMPAT] Rimozione ${id} da ${compatDir}...`);
    return new Promise((resolve, reject) => {
      (0, import_child_process6.exec)(`rm -rf "${target}"`, (err, stdout, stderr) => {
        if (err) {
          onLogging(`[COMPAT] Disinstallazione fallita: ${stderr}`);
          reject(err);
        } else {
          onLogging(`[COMPAT] ${id} disinstallato con successo.`);
          resolve();
        }
      });
    });
  }
  getAutoMapping(gameTitle) {
    if (gameTitle.includes("Cyberpunk")) return "Proton-GE-8.25";
    if (gameTitle.includes("Diablo")) return "Wine-Lutris";
    return "Proton 8.0-4";
  }
  getDefaultProfile() {
    return {
      fsr: false,
      gameMode: this.binaryExists("gamemoderun"),
      mangohud: this.binaryExists("mangohud") ? 1 : 0,
      eac: false,
      battleye: false,
      // v1.5.20-dev.1 — default spento per qualunque gioco: switch
      // opzionale, mai attivato automaticamente nemmeno per i launcher
      // condivisi (requiresLauncher) — resta una scelta esplicita
      // dell'utente in Game Options, coerente con eac/battleye/fsr sopra.
      umuRun: false
    };
  }
  /** Rileva tool di sistema utili per la UI Settings */
  detectSystemTools() {
    const eacPath = (() => {
      try {
        const r = (0, import_child_process6.execSync)(
          'find /usr/share/steam /home -name "eac_runtime" -type d 2>/dev/null | head -1',
          { encoding: "utf-8", timeout: 3e3 }
        ).trim();
        return r || null;
      } catch {
        return null;
      }
    })();
    const bePath = (() => {
      try {
        const r = (0, import_child_process6.execSync)(
          'find /usr/share/steam /home -name "battleye_runtime" -type d 2>/dev/null | head -1',
          { encoding: "utf-8", timeout: 3e3 }
        ).trim();
        return r || null;
      } catch {
        return null;
      }
    })();
    const fsrAvailable = (() => {
      try {
        const wineVer = (0, import_child_process6.execSync)("wine --version 2>/dev/null", { encoding: "utf-8", timeout: 3e3 }).trim();
        const match = wineVer.match(/wine-(\d+)\./);
        return match ? parseInt(match[1]) >= 7 : false;
      } catch {
        return false;
      }
    })();
    const flatpakApps = getInstalledFlatpakApps();
    return {
      gamescope: this.binaryExists("gamescope"),
      mangohud: this.binaryExists("mangohud"),
      gamemode: this.binaryExists("gamemoderun"),
      protonup: this.binaryExists("protonup") || flatpakApps.has("net.davidotek.pupgui2"),
      // v1.5.20-dev.1 — umu-run (umu-launcher): il comando si chiama
      // `umu-run`, il pacchetto `umu-launcher` — rilevato per nome
      // binario reale, non per nome pacchetto (stesso principio già
      // usato per gamemode/gamemoderun sopra).
      umu: this.binaryExists("umu-run"),
      lutris: this.binaryExists("lutris") || flatpakApps.has("net.lutris.Lutris"),
      steam: this.binaryExists("steam") || flatpakApps.has("com.valvesoftware.Steam"),
      retroarch: this.binaryExists("retroarch") || flatpakApps.has("org.libretro.RetroArch"),
      scummvm: this.binaryExists("scummvm") || flatpakApps.has("org.scummvm.ScummVM"),
      dosbox: this.binaryExists("dosbox-staging") || this.binaryExists("dosbox"),
      wine: this.binaryExists("wine"),
      fsr: fsrAvailable,
      eac: !!eacPath,
      battleye: !!bePath,
      eacPath: eacPath ?? "",
      bePath: bePath ?? "",
      // v1.1.105-dev.1 — tool di decompressione per Classic Console, vedi
      // archiveExtractors.ts. unrar è solo rilevato: l'estrazione .rar
      // non è ancora implementata.
      unzip: this.binaryExists("unzip"),
      p7zip: this.binaryExists("7z"),
      unrar: this.binaryExists("unrar")
    };
  }
  binaryExists(bin) {
    try {
      (0, import_child_process6.execSync)(`which ${bin}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Recupera le ultime versioni Proton-GE installabili.
   * Strategia:
   *   1. Se `protonup` è disponibile → `protonup -l` per le versioni disponibili
   *   2. Altrimenti → GitHub Releases API (ultimi 10 tag)
   * Filtra quelle già installate localmente.
   */
  async getInstallableRunners() {
    const installed = new Set(this.getAvailableRunners().map((r) => r.id));
    if (this.binaryExists("protonup")) {
      try {
        const raw = (0, import_child_process6.execSync)("protonup -l 2>/dev/null || protonup --available 2>/dev/null", {
          encoding: "utf-8",
          timeout: 1e4
        });
        const versions = raw.split("\n").map((l) => l.trim()).filter((l) => /^GE-Proton|^Proton-GE/i.test(l)).slice(0, 10);
        if (versions.length > 0) {
          return versions.map((v) => ({
            id: v,
            version: v,
            source: "protonup",
            installed: installed.has(v)
          })).filter((r) => !r.installed);
        }
      } catch {
      }
    }
    try {
      const raw = (0, import_child_process6.execSync)(
        'curl -sf --max-time 8 "https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases?per_page=10"',
        { encoding: "utf-8", timeout: 12e3 }
      );
      const releases = JSON.parse(raw);
      return releases.slice(0, 8).map((r) => ({
        id: r.tag_name,
        version: r.tag_name,
        source: "github",
        installed: installed.has(r.tag_name)
      })).filter((r) => !r.installed);
    } catch {
      return [];
    }
  }
  /**
   * Calcola lo spazio usato da ~/Games/ (dove X-Launcher installa i giochi).
   * Usa `du -sb` per la dimensione in byte, con timeout breve.
   */
  getDiskUsage() {
    const { join } = require("path");
    const gamesDir = join((0, import_os4.homedir)(), "Games");
    const fmt = (b) => b > 1e12 ? `${(b / 1e12).toFixed(2)} TB` : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${(b / 1e3).toFixed(0)} KB`;
    let usedBytes = 0;
    try {
      const raw = (0, import_child_process6.execSync)(`du -sb "${gamesDir}" 2>/dev/null`, { encoding: "utf-8", timeout: 8e3 });
      usedBytes = parseInt(raw.split("	")[0]) || 0;
    } catch {
    }
    let totalBytes = 0, freeBytes = 0;
    try {
      const df = (0, import_child_process6.execSync)(`df -B1 --output=size,avail "${(0, import_os4.homedir)()}" 2>/dev/null | tail -1`, {
        encoding: "utf-8",
        timeout: 5e3
      });
      const parts = df.trim().split(/\s+/);
      totalBytes = parseInt(parts[0]) || 0;
      freeBytes = parseInt(parts[1]) || 0;
    } catch {
    }
    const usedPercent = totalBytes > 0 ? Math.round((totalBytes - freeBytes) / totalBytes * 100) : 0;
    return {
      gamesDir,
      usedBytes,
      usedHuman: usedBytes > 0 ? fmt(usedBytes) : "\u2014",
      totalBytes,
      totalHuman: totalBytes > 0 ? fmt(totalBytes) : "\u2014",
      freeBytes,
      freeHuman: freeBytes > 0 ? fmt(freeBytes) : "\u2014",
      usedPercent
    };
  }
};
var compatibilityManager = new CompatibilityManager();

// src/backend/sharedLauncherManager.ts
var import_fs11 = require("fs");
var import_path11 = __toESM(require("path"), 1);
var import_child_process9 = require("child_process");
var import_child_process10 = require("child_process");
init_paths();
init_logger();
init_db();
init_implementations();
init_processManager();
init_db();
var SHARED_LAUNCHERS_DIR = import_path11.default.join(DATA_DIR, "shared-launchers");
function binaryExists5(bin) {
  try {
    (0, import_child_process9.execSync)(`which ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function openInBrowser(url) {
  if (binaryExists5("firefox")) {
    (0, import_child_process10.spawn)("firefox", [url], { detached: true, stdio: "ignore" }).unref();
  } else if (binaryExists5("xdg-open")) {
    (0, import_child_process10.spawn)("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    writeLog("warning", "[SharedLauncher] Nessun browser trovato (firefox/xdg-open) \u2014 apri manualmente: " + url);
  }
}
function openInstallerPage(launcherId) {
  const def = getThirdPartyLauncherDefinition(launcherId);
  if (!def) {
    return { success: false, message: `Launcher terzo sconosciuto: ${launcherId}` };
  }
  if (!def.installerUrl) {
    return { success: false, message: `Nessuna pagina di download nota ancora per ${def.displayName}.` };
  }
  openInBrowser(def.installerUrl);
  writeLog("system", `[SharedLauncher] Aperta pagina installer ${def.displayName}: ${def.installerUrl}`);
  return { success: true, message: `Pagina di download di ${def.displayName} aperta nel browser.` };
}
function getSharedPrefixBasePath(launcherId) {
  const dir = import_path11.default.join(SHARED_LAUNCHERS_DIR, launcherId, "prefix");
  (0, import_fs11.mkdirSync)(dir, { recursive: true });
  return dir;
}
function resolveSharedPrefixExecutionPath(launcherId) {
  return import_path11.default.join(getSharedPrefixBasePath(launcherId), "pfx");
}
function getSharedLauncherState(launcherId) {
  return getSharedLauncherPrefix(launcherId);
}
function isLauncherBootstrapped(launcherId) {
  const row = getSharedLauncherPrefix(launcherId);
  return !!row?.bootstrappedAt;
}
function markLauncherBootstrapped(launcherId, runner, launcherExe) {
  const def = getThirdPartyLauncherDefinition(launcherId);
  if (!def) {
    throw new Error(`Launcher terzo sconosciuto: ${launcherId}`);
  }
  upsertSharedLauncherPrefix({
    launcherId,
    prefixPath: getSharedPrefixBasePath(launcherId),
    launcherExe,
    bootstrappedAt: (/* @__PURE__ */ new Date()).toISOString(),
    runner
  });
  writeLog("system", `[SharedLauncher] ${def.displayName} bootstrappato (runner: ${runner}, exe: ${launcherExe})`);
}
function canRemoveSharedPrefix(launcherId, excludeGameId) {
  return countInstalledGamesForLauncher(launcherId, excludeGameId) === 0;
}
function isSharedLauncherRunning(launcherId) {
  if (ensureCapability()) {
    return !!findActiveScope("shared-launcher", launcherId);
  }
  const launcherGame = getGameById(`${launcherId}-launcher`);
  if (!launcherGame?.executablePath) return false;
  const exeBasename = import_path11.default.basename(launcherGame.executablePath);
  try {
    (0, import_child_process9.execFileSync)("pgrep", ["-f", exeBasename], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
async function closeSharedLauncher(launcherId) {
  const launcherGame = getGameById(`${launcherId}-launcher`);
  const runnerId = launcherGame?.runner;
  if (!runnerId) {
    return { success: false, message: `Runner del launcher condiviso "${launcherId}" sconosciuto.` };
  }
  const protonBin = resolveProtonBin(runnerId);
  if (!protonBin) {
    return { success: false, message: `Build Proton "${runnerId}" non trovata.` };
  }
  const protonDir = import_path11.default.dirname(protonBin);
  const wineserverBin = [
    import_path11.default.join(protonDir, "files", "bin", "wineserver"),
    import_path11.default.join(protonDir, "dist", "bin", "wineserver")
  ].find((p) => (0, import_fs11.existsSync)(p));
  if (!wineserverBin) {
    return { success: false, message: `Binario wineserver non trovato dentro la build Proton "${runnerId}".` };
  }
  const winePrefix = resolveSharedPrefixExecutionPath(launcherId);
  try {
    (0, import_child_process9.execFileSync)(wineserverBin, ["-k"], {
      env: { ...process.env, WINEPREFIX: winePrefix },
      stdio: "ignore"
    });
    writeLog("launch", `[SharedLauncher] Chiuso su richiesta esplicita dell'utente: "${launcherId}" (wineserver -k).`);
    return { success: true, message: `Launcher condiviso "${launcherId}" chiuso.` };
  } catch (err) {
    return { success: false, message: `Chiusura fallita: ${err}` };
  }
}
async function launchSharedLauncher(launcherId) {
  const def = getThirdPartyLauncherDefinition(launcherId);
  if (!def) {
    return { success: false, message: `Launcher terzo sconosciuto: ${launcherId}` };
  }
  const state = getSharedLauncherPrefix(launcherId);
  if (!state?.bootstrappedAt) {
    return { success: false, message: `${def.displayName} non risulta ancora installato nel prefix condiviso.` };
  }
  const launcherGame = getGameById(`${launcherId}-launcher`);
  if (!launcherGame?.runner || !launcherGame?.executablePath) {
    return { success: false, message: `${def.displayName}: runner o eseguibile non ancora noti sulla card \u2014 aprila almeno una volta manualmente prima di fare affidamento sull'avvio automatico.` };
  }
  const runnerId = launcherGame.runner;
  const executablePath = launcherGame.executablePath;
  const runner = new ProtonRunner(runnerId, runnerId);
  const syntheticGame = {
    id: `shared-launcher-${launcherId}`,
    title: def.displayName,
    executablePath
  };
  const result = await runner.launch(syntheticGame, {
    prefix: getSharedPrefixBasePath(launcherId),
    // v1.5.20-dev.17 — BUG REALE trovato dall'utente: questa funzione non
    // passava mai `umuRun`, quindi il lancio del launcher condiviso
    // stesso riproduceva esattamente la finestra nera che avevamo già
    // risolto in Step 19d (container Steam Linux Runtime mancante) — il
    // fix umu-run era arrivato SOLO per il lancio manuale dalla card,
    // mai qui. Il launcher condiviso ha una riga vera in `games`
    // (convenzione id `${launcherId}-launcher`, vedi
    // UBISOFT_CONNECT_GAME_ID in ubisoftConnectPlugin.ts) con un proprio
    // CompatibilityProfile — leggiamo lì lo switch che l'utente ha già
    // impostato (e verificato funzionante) per quella card.
    umuRun: getCompatProfile(`${launcherId}-launcher`)?.umuRun ?? false,
    // v2.0.41-dev.18 — richiesta utente: la finestra del launcher
    // condiviso rubava il focus al gioco appena avviato quando viene
    // lanciato QUI come dipendenza (mai quando l'utente lo apre a mano
    // dalla propria card — questa funzione non è mai chiamata in quel
    // caso). Argomenti extra SOLO se dichiarati/verificati nel registro
    // per questo launcher specifico (thirdPartyLaunchers.ts) — vuoto per
    // ogni launcher non ancora verificato, nessun default indovinato.
    args: def.silentLaunchArgs,
    // v2.0.41-dev.49 — Process Manager, step 2: senza questi due campi
    // questo lancio erediterebbe il default 'game' con id sintetico
    // "shared-launcher-<id>" (vedi RunnerConfig in base.ts) — tracciato
    // come se fosse un gioco qualunque invece che come riga separata
    // "launcher condiviso" nel Process Manager. `scopeId: launcherId`
    // (non `syntheticGame.id`) è anche ciò che isSharedLauncherRunning()
    // cerca con findActiveScope('shared-launcher', launcherId) — devono
    // combaciare esattamente.
    scopeKind: "shared-launcher",
    scopeId: launcherId
  });
  writeLog("launch", `[SharedLauncher] Avvio ${def.displayName}: ${result.message ?? "(nessun messaggio)"}`);
  return { success: result.success, message: result.message ?? "", logPath: result.logPath };
}
function findGameExeInSharedPrefix(launcherId, gameTitle) {
  const driveC = import_path11.default.join(resolveSharedPrefixExecutionPath(launcherId), "drive_c");
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedTitle = normalize(gameTitle);
  if (!normalizedTitle) return null;
  for (const sub of ["Program Files (x86)", "Program Files"]) {
    const base = import_path11.default.join(driveC, sub);
    if (!(0, import_fs11.existsSync)(base)) continue;
    let allDirs;
    try {
      const result = (0, import_child_process9.execSync)(
        `find "${base}" -maxdepth 6 -type d 2>/dev/null`,
        { encoding: "utf-8", timeout: 8e3 }
      );
      allDirs = result.split("\n").filter(Boolean);
    } catch {
      continue;
    }
    for (const dir of allDirs) {
      const normalizedDir = normalize(import_path11.default.basename(dir));
      if (!normalizedDir) continue;
      if (!normalizedDir.includes(normalizedTitle) && !normalizedTitle.includes(normalizedDir)) continue;
      try {
        const exeResult = (0, import_child_process9.execSync)(
          `find "${dir}" -maxdepth 3 -iname "*.exe" ! -iname "unins*" ! -iname "*crashhandler*" ! -iname "*crashreporter*" ! -iname "vcredist*" ! -iname "vc_redist*" ! -iname "dxsetup*" ! -iname "*explorer*" ! -iname "*helper*" ! -iname "*updater*" | head -1`,
          { encoding: "utf-8", timeout: 8e3 }
        ).trim();
        if (exeResult) return exeResult;
      } catch {
      }
    }
  }
  return null;
}
async function launchGameInSharedPrefix(launcherId, exePath, args = [], cwd, gameId) {
  const launcherGame = getGameById(`${launcherId}-launcher`);
  const runnerId = launcherGame?.runner;
  if (!runnerId) {
    return { success: false, message: `Runner del launcher condiviso "${launcherId}" sconosciuto \u2014 impossibile risolvere la build Proton corretta.` };
  }
  const protonBin = resolveProtonBin(runnerId);
  if (!protonBin) {
    return { success: false, message: `Build Proton "${runnerId}" non trovata.` };
  }
  const protonDir = import_path11.default.dirname(protonBin);
  const wineBin = [
    import_path11.default.join(protonDir, "files", "bin", "wine"),
    import_path11.default.join(protonDir, "dist", "bin", "wine")
  ].find((p) => (0, import_fs11.existsSync)(p));
  if (!wineBin) {
    return { success: false, message: `Binario wine non trovato dentro la build Proton "${runnerId}".` };
  }
  const winePrefix = resolveSharedPrefixExecutionPath(launcherId);
  if (!(0, import_fs11.existsSync)(winePrefix)) {
    return { success: false, message: `Prefix condivisa di "${launcherId}" non trovata (${winePrefix}).` };
  }
  const env = {
    ...process.env,
    WINEPREFIX: winePrefix,
    // v1.5.20-dev.38 — BUG REALE trovato indagando ACS con l'utente: il
    // file di log appena aggiunto (dev.37) risultava sempre vuoto,
    // anche a fronte di un processo che moriva subito — non perché non
    // succedesse nulla, ma perché stavamo dicendo esplicitamente a Wine
    // di sopprimere OGNI canale diagnostico, errori compresi. La stessa
    // classe di informazione che ci era servita mesi fa (WINEDEBUG=+seh,
    // trovò il crash di Xalia) restava tagliata fuori qui per
    // costruzione. `err+all` mostra solo i messaggi di livello errore
    // su tutti i canali — molto più silenzioso di un debug completo, ma
    // non nasconde più un crash reale come faceva `-all`.
    // v1.5.20-dev.39 — `err+all` (dev.38) non bastava: le due righe
    // `NtRaiseHardError...stub` ottenute confermano lo stesso pattern
    // già visto mesi fa investigando Xalia, ma senza la traccia SEH che
    // allora ci aveva mostrato l'eccezione esatta — quella traccia vive
    // su un canale a sé (`seh`), non incluso nella classe generica
    // "err" per "tutti i canali". Aggiunto esplicitamente.
    WINEDEBUG: "err+all,+seh",
    // v1.5.20-dev.24 — BUG REALE CONFERMATO DALL'UTENTE: senza questa
    // variabile il lancio leggero restava bloccato in silenzio (nessun
    // errore visibile, semplicemente nessuna finestra) — impostando
    // WINEFSYNC=1 a mano prima di invocare lo script il gioco partiva
    // correttamente. Causa: quando Ubisoft Connect parte tramite
    // umu-run/Proton (percorso pieno), lo script di Proton rileva da
    // solo il supporto fsync del kernel e lo attiva internamente PRIMA
    // di invocare wine — il wineserver nasce quindi già con fsync
    // attivo. Il lancio leggero invoca wine nudo, bypassando del tutto
    // quello script (è il punto stesso di questa funzione) — senza
    // impostarla esplicitamente qui, il nuovo processo tenta di
    // agganciarsi con un metodo di sincronizzazione diverso da quello
    // con cui il wineserver è già stato avviato: un blocco silenzioso,
    // non un errore esplicito come il mismatch di versione (931/957)
    // già diagnosticato in precedenza — stessa causa profonda (due
    // processi sulla stessa prefix devono davvero combaciare in tutto,
    // non solo nella build Proton), diversa manifestazione.
    // Assume supporto fsync del kernel — praticamente universale sui
    // kernel Linux moderni (verificato funzionante sul sistema reale
    // dell'utente), ma non garantito su un kernel molto datato.
    WINEFSYNC: "1"
  };
  try {
    const logPath = gameId ? gameLaunchLogPath(gameId) : void 0;
    let stdio = "ignore";
    if (logPath) {
      try {
        (0, import_fs11.mkdirSync)(import_path11.default.dirname(logPath), { recursive: true });
        const fd = (0, import_fs11.openSync)(logPath, "a");
        stdio = ["ignore", fd, fd];
      } catch (err) {
        writeLog("warning", `[SharedLauncher] Impossibile aprire il log ${logPath}: ${err} \u2014 stdout/stderr non catturati per questo lancio.`);
      }
    }
    const child = (0, import_child_process10.spawn)(wineBin, [exePath, ...args], {
      env,
      cwd: cwd ?? import_path11.default.dirname(exePath),
      detached: true,
      stdio
    });
    child.unref();
    writeLog("launch", `[SharedLauncher] Lancio leggero (sessione gi\xE0 attiva di "${launcherId}"): ${wineBin} "${exePath}"`);
    return { success: true, pid: child.pid, message: `Avviato nella sessione condivisa gi\xE0 attiva di "${launcherId}"`, logPath };
  } catch (err) {
    return { success: false, message: `Lancio leggero fallito: ${err}` };
  }
}

// src/backend/downloadManager.ts
var import_child_process12 = require("child_process");
var import_util = require("util");
var import_fs12 = require("fs");
var import_os6 = require("os");
var import_path12 = __toESM(require("path"), 1);
init_db();
init_logger();

// src/backend/winePrefixManager.ts
async function prepareWinePrefix(task, opts, spawn10, log) {
  const baseEnv = {
    WINEPREFIX: opts.prefixPath,
    WINEDEBUG: "-all",
    WINEDLLOVERRIDES: "mscoree,mshtml="
  };
  if (opts.disableWineSync) {
    baseEnv.WINE_DISABLE_FAST_SYNC = "1";
  }
  try {
    const wineBin = opts.wineBin ?? "wine";
    const wineserverBin = opts.wineserverBin ?? "wineserver";
    log(task, "system", `[PREFIX] ${wineBin} wineboot --init (con ${wineserverBin} --wait a seguire)`);
    await spawn10(task, wineBin, ["wineboot", "--init"], baseEnv, opts.wineBootTimeoutMs);
    log(task, "system", `[PREFIX] ${wineserverBin} --wait (attesa completamento inizializzazione)`);
    await spawn10(task, wineserverBin, ["--wait"], { WINEPREFIX: opts.prefixPath }, opts.wineBootTimeoutMs);
    log(task, "system", `[PREFIX] Prefix pronta.`);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log(task, "error", `[PREFIX] Preparazione fallita: ${error}`);
    return { success: false, error };
  }
}

// src/backend/downloadManager.ts
init_implementations();

// src/backend/filePicker.ts
var import_child_process11 = require("child_process");
init_logger();
function binaryExists6(bin) {
  try {
    (0, import_child_process11.execSync)(`which ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function runDialog(bin, args) {
  return new Promise((resolve) => {
    (0, import_child_process11.execFile)(bin, args, (error, stdout) => {
      const trimmed = stdout.trim();
      if (!error && trimmed) {
        resolve({ outcome: "selected", path: trimmed });
      } else {
        resolve({ outcome: "cancelled" });
      }
    });
  });
}
async function browseForFile(options) {
  if (binaryExists6("zenity")) {
    const args = ["--file-selection", `--title=${options.title}`];
    if (options.startDir) args.push(`--filename=${options.startDir.replace(/\/?$/, "/")}`);
    if (options.filter) {
      const patterns = options.filter.extensions.map((ext) => `*.${ext}`).join(" ");
      args.push(`--file-filter=${options.filter.name} | ${patterns}`);
    }
    return runDialog("zenity", args);
  }
  if (binaryExists6("kdialog")) {
    const args = ["--title", options.title, "--getopenfilename", options.startDir ?? "."];
    if (options.filter) {
      const patterns = options.filter.extensions.map((ext) => `*.${ext}`).join(" ");
      args.push(`${patterns}|${options.filter.name}`);
    }
    return runDialog("kdialog", args);
  }
  writeLog("warning", "[FilePicker] N\xE9 zenity n\xE9 kdialog disponibili \u2014 fallback a inserimento manuale del path.");
  return { outcome: "unavailable" };
}

// src/backend/downloadManager.ts
init_activeDisplay();
var execFileAsync = (0, import_util.promisify)(import_child_process12.execFile);
var GAMES_ROOT = import_path12.default.join((0, import_os6.homedir)(), "Games");
var DEFAULT_WINETRICKS_VERBS = ["vcrun2022", "dxvk", "vkd3d", "corefonts"];
function fetchGogNumericId(slug) {
  return new Promise((resolve) => {
    const proc = (0, import_child_process12.spawn)("lgogdownloader", [
      "--list",
      "details/json",
      "--game",
      `^${slug}$`,
      "--no-color"
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => {
      proc.kill();
      writeLog("warning", `[GOG] Numeric ID lookup for "${slug}" \u2014 timeout (30s), known-fixes skipped for this title.`);
      resolve(null);
    }, 3e4);
    proc.stdout.on("data", (c) => {
      out += c.toString();
    });
    proc.stderr.on("data", (c) => {
      out += c.toString();
    });
    proc.on("close", () => {
      clearTimeout(timer);
      try {
        const jsonStart = out.indexOf("{");
        const arrStart = out.indexOf("[");
        const start = arrStart !== -1 && (jsonStart === -1 || arrStart < jsonStart) ? arrStart : jsonStart;
        if (start === -1) throw new Error("nessun JSON nell'output");
        const parsed = JSON.parse(out.slice(start));
        const entry = Array.isArray(parsed) ? parsed[0] : parsed?.games?.[0] ?? parsed;
        const id = entry?.id ?? entry?.gameId ?? entry?.game_id ?? entry?.productId ?? entry?.product_id;
        if (id != null) {
          resolve(String(id));
        } else {
          writeLog("warning", `[GOG] Numeric ID lookup for "${slug}" \u2014 valid JSON but no recognized id field. Raw output: ${out.slice(0, 500)}`);
          resolve(null);
        }
      } catch (err) {
        writeLog("warning", `[GOG] Numeric ID lookup for "${slug}" failed (parsing). Raw output: ${out.slice(0, 500)}`);
        resolve(null);
      }
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}
function resolveRunnerWineEnv(runnerId, containerPrefixPath) {
  const fallback = {
    wineBin: "wine",
    wineserverBin: "wineserver",
    winePrefixPath: containerPrefixPath,
    extraEnv: {}
  };
  if (!runnerId || runnerId === "Wine-Lutris") return fallback;
  const protonBin = resolveProtonBin(runnerId);
  if (!protonBin) {
    return fallback;
  }
  const protonFilesBin = import_path12.default.join(import_path12.default.dirname(protonBin), "files", "bin");
  const wine64 = import_path12.default.join(protonFilesBin, "wine64");
  const wine32 = import_path12.default.join(protonFilesBin, "wine");
  const wineserver = import_path12.default.join(protonFilesBin, "wineserver");
  const wineBin = (0, import_fs12.existsSync)(wine64) ? wine64 : (0, import_fs12.existsSync)(wine32) ? wine32 : "wine";
  const wineserverBin = (0, import_fs12.existsSync)(wineserver) ? wineserver : "wineserver";
  return {
    wineBin,
    wineserverBin,
    winePrefixPath: import_path12.default.join(containerPrefixPath, "pfx"),
    extraEnv: { WINE: wineBin, WINE64: wineBin, WINESERVER: wineserverBin }
  };
}
async function fetchKnownFixes(appName, store) {
  const url = `https://raw.githubusercontent.com/Heroic-Games-Launcher/known-fixes/main/${store}/${appName}-${store}.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5e3) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
function sanitizeKnownFixVerbs(verbs, logPrefix, log) {
  const clean = verbs.filter((v) => ALL_KNOWN_WINE_VERBS.includes(v));
  const rejected = verbs.filter((v) => !ALL_KNOWN_WINE_VERBS.includes(v));
  if (rejected.length > 0) {
    log(`[${logPrefix}] Known fix Heroic conteneva voci non riconosciute, scartate per sicurezza: ${rejected.join(", ")}`);
  }
  return clean;
}
function isVulkanAvailable() {
  try {
    (0, import_child_process12.execSync)('vulkaninfo --summary 2>&1 | grep -q "GPU id"', {
      stdio: "ignore",
      env: buildSafeEnv(),
      timeout: 5e3
    });
    return true;
  } catch {
    try {
      (0, import_child_process12.execSync)("ldconfig -p 2>/dev/null | grep -q libvulkan", {
        stdio: "ignore",
        env: buildSafeEnv(),
        timeout: 3e3
      });
      return true;
    } catch {
      return false;
    }
  }
}
function filterVerbsForEnv(verbs) {
  if (isVulkanAvailable()) return verbs;
  const skipped = verbs.filter((v) => v === "dxvk" || v === "vkd3d");
  if (skipped.length > 0) {
    writeLog("warning", `[WINETRICKS] Vulkan not available \u2014 skipping: ${skipped.join(", ")}`);
  }
  return verbs.filter((v) => v !== "dxvk" && v !== "vkd3d");
}
var WINEBOOT_TIMEOUT_MS = 12e4;
var WINETRICK_TIMEOUT_MS = 3e5;
var WINETRICK_DOTNET_TIMEOUT_MS = 9e5;
function winetrickTimeoutFor(verb) {
  return verb.startsWith("dotnet") ? WINETRICK_DOTNET_TIMEOUT_MS : WINETRICK_TIMEOUT_MS;
}
var PHASE_LABELS = {
  queued: "In coda...",
  downloading: "Download in corso...",
  paused: "Download in pausa",
  creating_prefix: "Creazione ambiente Wine...",
  installing_deps: "Installazione dipendenze...",
  installing_game: "Installazione gioco...",
  awaiting_installer: "In attesa dell'installer...",
  completed: "Installazione completata!",
  error: "Errore durante l'installazione"
};
function binaryExists7(bin) {
  try {
    (0, import_child_process12.execSync)(`which ${bin}`, { stdio: "ignore", env: buildSafeEnv() });
    return true;
  } catch {
    return false;
  }
}
function buildSafeEnv(extra = {}) {
  const home = process.env.HOME ?? (0, import_os6.homedir)();
  const existingPath = process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin";
  const userBin = import_path12.default.join(home, ".local", "bin");
  const pathParts = existingPath.split(":");
  if (!pathParts.includes(userBin)) pathParts.unshift(userBin);
  return {
    ...process.env,
    HOME: home,
    PATH: pathParts.join(":"),
    // v2.2.19-dev.2 — stesso bug/fix di implementations.ts: DISPLAY
    // statico sostituito da quello della sessione realmente attiva.
    ...getActiveDisplayEnv(),
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1e3}`,
    // Forza winetricks in modalità non-interattiva anche se DISPLAY è disponibile
    WINETRICKS_GUI: "none",
    ...extra
  };
}
function ensureDir(dirPath) {
  if (!(0, import_fs12.existsSync)(dirPath)) (0, import_fs12.mkdirSync)(dirPath, { recursive: true });
}
function persistWinetricksVerbs(gameId, verbs) {
  try {
    const currentProfile = getCompatProfile(gameId) ?? {
      fsr: false,
      gameMode: false,
      mangohud: 0,
      eac: false,
      battleye: false
    };
    upsertCompatProfile(gameId, { ...currentProfile, winetricksVerbs: verbs });
  } catch (err) {
    writeLog("warning", `[COMPAT] Impossibile salvare winetricksVerbs per ${gameId}: ${err}`);
  }
}
function storeDir(store) {
  const name = store === "GOG Galaxy" ? "GOG" : store === "Epic Games" ? "Epic" : store;
  return import_path12.default.join(GAMES_ROOT, name);
}
function slugFromId(gameId) {
  return gameId.replace(/^(gog|epic)-/, "").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}
async function resolveEpicExe(appName) {
  try {
    const result = await execFileAsync("legendary", ["info", appName, "--json"], {
      encoding: "utf-8",
      timeout: 15e3
    });
    const data = JSON.parse(result.stdout);
    const installPath = data?.install?.install_path;
    const launchExe = data?.manifest?.launch_exe;
    const launchCmd = data?.manifest?.launch_command ?? "";
    if (!installPath || !launchExe) return null;
    const exePath = import_path12.default.join(installPath, launchExe);
    if (!(0, import_fs12.existsSync)(exePath)) return null;
    return { exePath, launchArgs: launchCmd };
  } catch {
    return null;
  }
}
function resolvePathCaseInsensitive(base, relPath) {
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  let current = base;
  for (const part of parts) {
    if (!(0, import_fs12.existsSync)(current)) return import_path12.default.join(base, relPath.replace(/\\/g, "/"));
    const entries = (0, import_fs12.readdirSync)(current);
    const match = entries.find((e) => e.toLowerCase() === part.toLowerCase());
    if (!match) return import_path12.default.join(base, relPath.replace(/\\/g, "/"));
    current = import_path12.default.join(current, match);
  }
  return current;
}
function resolveGogExe(installPath) {
  try {
    const infoFiles = (0, import_fs12.readdirSync)(installPath).filter((f) => f.startsWith("goggame-") && f.endsWith(".info"));
    if (infoFiles.length === 0) return null;
    const infoFile = infoFiles.sort()[0];
    const raw = (0, import_fs12.readFileSync)(import_path12.default.join(installPath, infoFile), "utf-8");
    const info = JSON.parse(raw);
    const playTasks = info && typeof info === "object" && "playTasks" in info ? info.playTasks : void 0;
    const primary = Array.isArray(playTasks) ? playTasks.find(
      (t) => !!t && typeof t === "object" && t.isPrimary && t.type === "FileTask" && typeof t.path === "string"
    ) : void 0;
    if (!primary) return null;
    const exePath = resolvePathCaseInsensitive(installPath, primary.path);
    const rawArgs = (primary.arguments ?? "").replace(/\\/g, "/");
    const launchArgs = rawArgs.includes("-c ") ? "" : rawArgs;
    const launchCwd = primary.workingDir ? resolvePathCaseInsensitive(installPath, primary.workingDir) : import_path12.default.dirname(exePath);
    return { exePath, launchArgs, launchCwd };
  } catch {
    return null;
  }
}
function findMainExe(basePath) {
  if (!(0, import_fs12.existsSync)(basePath)) return null;
  try {
    const result = (0, import_child_process12.execSync)(
      `find "${basePath}" -maxdepth 4 -iname "*.exe" ! -iname "unins*" ! -iname "UnityCrashHandler*" ! -iname "CrashReporter*" ! -iname "vcredist*" ! -iname "dxsetup*" ! -iname "vc_redist*" | head -1`,
      { encoding: "utf-8", timeout: 8e3 }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}
function findInstalledLauncherExe(driveCPath, hintRelPath) {
  if (hintRelPath) {
    const hinted = import_path12.default.join(driveCPath, hintRelPath);
    if ((0, import_fs12.existsSync)(hinted)) return hinted;
  }
  for (const sub of ["Program Files (x86)", "Program Files"]) {
    const base = import_path12.default.join(driveCPath, sub);
    if (!(0, import_fs12.existsSync)(base)) continue;
    try {
      const result = (0, import_child_process12.execSync)(
        `find "${base}" -maxdepth 5 -iname "*.exe" ! -iname "unins*" ! -iname "*crashhandler*" ! -iname "*crashreporter*" ! -iname "vcredist*" ! -iname "vc_redist*" ! -iname "dxsetup*" ! -iname "*explorer*" ! -iname "*helper*" ! -iname "*updater*" | head -1`,
        { encoding: "utf-8", timeout: 8e3 }
      ).trim();
      if (result) return result;
    } catch {
    }
  }
  return null;
}
function resolveDownloadsDir() {
  if (binaryExists7("xdg-user-dir")) {
    try {
      const result = (0, import_child_process12.execSync)("xdg-user-dir DOWNLOAD", { encoding: "utf-8", timeout: 3e3 }).trim();
      if (result && (0, import_fs12.existsSync)(result)) return result;
    } catch {
    }
  }
  try {
    const configPath = import_path12.default.join((0, import_os6.homedir)(), ".config", "user-dirs.dirs");
    if ((0, import_fs12.existsSync)(configPath)) {
      const content = (0, import_fs12.readFileSync)(configPath, "utf-8");
      const match = content.match(/XDG_DOWNLOAD_DIR\s*=\s*"([^"]+)"/);
      if (match) {
        const resolved = match[1].replace(/^\$HOME/, (0, import_os6.homedir)());
        if ((0, import_fs12.existsSync)(resolved)) return resolved;
      }
    }
  } catch {
  }
  for (const name of ["Downloads", "Scaricati"]) {
    const candidate = import_path12.default.join((0, import_os6.homedir)(), name);
    if ((0, import_fs12.existsSync)(candidate)) return candidate;
  }
  return null;
}
function findInstallerInDownloads(filenameHints = []) {
  const downloadsDir = resolveDownloadsDir();
  if (!downloadsDir) return null;
  const nameFilter = filenameHints.length > 0 ? ` \\( ${filenameHints.map((h) => `-iname "${h}"`).join(" -o ")} \\) ` : " ";
  try {
    const result = (0, import_child_process12.execSync)(
      `find "${downloadsDir}" -maxdepth 1 -iname "*.exe" ${nameFilter}-printf "%T@ %p\\n" | sort -rn | head -1 | cut -d' ' -f2-`,
      { encoding: "utf-8", timeout: 5e3 }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}
function makeLgogProgressParser() {
  let totalSizeMiB = null;
  const toMiB = (value, unit) => {
    switch (unit.toUpperCase()) {
      case "GIB":
      case "GB":
        return value * 1024;
      case "MIB":
      case "MB":
        return value;
      case "KIB":
      case "KB":
        return value / 1024;
      default:
        return value;
    }
  };
  return (line) => {
    const totalSizeMatch = line.match(/Total size:\s*([\d.]+)\s*(GiB|MiB|KiB|GB|MB|KB)/i);
    if (totalSizeMatch) {
      totalSizeMiB = toMiB(parseFloat(totalSizeMatch[1]), totalSizeMatch[2]);
      return null;
    }
    const remainingMatch = line.match(
      /Total:\s*([\d.]+\s*(?:GiB|MiB|KiB|GB|MB|KB)\/s)\s*\|\s*Remaining:\s*\d+\s*\(([\d.]+)\s*(GiB|MiB|KiB|GB|MB|KB)\)/i
    );
    if (remainingMatch && totalSizeMiB && totalSizeMiB > 0) {
      const remainingMiB = toMiB(parseFloat(remainingMatch[2]), remainingMatch[3]);
      const progress = Math.max(0, Math.min(99, (totalSizeMiB - remainingMiB) / totalSizeMiB * 100));
      return { progress, speed: remainingMatch[1] };
    }
    return null;
  };
}
function makeLegendaryProgressParser() {
  let lastSpeed = "";
  return (line) => {
    const speedMatch = line.match(/\+?\s*Download\s*-\s*([\d.]+\s*(?:KiB|MiB|GiB)\/s)/i);
    if (speedMatch) {
      lastSpeed = speedMatch[1];
      return null;
    }
    const progressMatch = line.match(/Progress:\s*([\d.]+)%/i);
    if (progressMatch) {
      return { progress: parseFloat(progressMatch[1]), speed: lastSpeed };
    }
    return null;
  };
}
function makeNileProgressParser() {
  let lastSpeed = "";
  return (line) => {
    const speedMatch = line.match(/\+\s*Download\s*-\s*([\d.]+\s*(?:KiB|MiB|GiB)\/s)/i);
    if (speedMatch) {
      lastSpeed = speedMatch[1];
      return null;
    }
    const bytesMatch = line.match(/Progress:\s*[\d.]+\s+(\d+)\/(\d+)/);
    if (bytesMatch) {
      const downloaded = parseInt(bytesMatch[1], 10);
      const total = parseInt(bytesMatch[2], 10);
      if (total > 0) {
        return { progress: downloaded / total * 100, speed: lastSpeed };
      }
    }
    return null;
  };
}
function parseInnoextractProgress(line) {
  const m = line.match(/([\d.]+)%\s*([\d.]+\s*(?:MiB|GiB|KiB)\/s)?/i);
  if (m) return { progress: parseFloat(m[1]), speed: m[2] ?? "" };
  return null;
}
var DownloadManager = class {
  tasks = /* @__PURE__ */ new Map();
  procs = /* @__PURE__ */ new Map();
  listeners = [];
  completeCallbacks = [];
  errorCallbacks = [];
  // v0.99.35 — notifica esito lookup Heroic known-fixes (trovato/non
  // trovato), per il toggle overlay "Usa Known Fixes (Heroic)".
  knownFixesCallbacks = [];
  // v0.99.36 — Step 2 (lock prefix): DownloadManager non ha visibilità
  // sul processo di gioco in esecuzione (tracciato in GameManager,
  // lastLaunchedGame) e non può importarlo direttamente senza creare
  // una dipendenza circolare (GameManager già importa DownloadManager).
  // Stesso pattern già usato per onComplete/onError: GameManager
  // registra un checker all'avvio, DownloadManager lo consulta prima
  // di iniziare a scrivere sulla prefix.
  runningGameChecker = null;
  onComplete(cb) {
    this.completeCallbacks.push(cb);
  }
  onError(cb) {
    this.errorCallbacks.push(cb);
  }
  onKnownFixesResult(cb) {
    this.knownFixesCallbacks.push(cb);
  }
  setRunningGameChecker(fn) {
    this.runningGameChecker = fn;
  }
  addListener(cb) {
    this.listeners.push(cb);
  }
  removeListener(cb) {
    this.listeners = this.listeners.filter((l) => l !== cb);
  }
  notify(task) {
    task.phase = task.status;
    task.phaseLabel = PHASE_LABELS[task.status] ?? task.status;
    upsertDownload(task);
    for (const cb of this.listeners) {
      try {
        cb(task);
      } catch {
      }
    }
  }
  update(task, patch) {
    Object.assign(task, patch);
    this.notify(task);
  }
  /** Scrive nel log del daemon e aggiorna phaseLabel in caso di errore */
  log(task, level, msg) {
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour12: false });
    const tag = level === "error" ? "[ERROR]" : "[SYSTEM]";
    writeLog(level === "error" ? "error" : level === "info" ? "info" : "download", msg);
    try {
      insertLog({ timestamp, message: msg, type: level === "error" ? "error" : "system" });
    } catch (err) {
      writeLog("error", `[LOG WRITE FAILED] ${err}`);
    }
    if (level === "error") {
      this.update(task, { phaseLabel: `\u26A0 ${msg}` });
    }
  }
  /** Ripristina task da DB al boot */
  restoreTask(task) {
    if (this.tasks.has(task.gameId)) return;
    if (task.status === "downloading") task.status = "paused";
    task.phase = task.status;
    task.phaseLabel = PHASE_LABELS[task.status] ?? task.status;
    this.tasks.set(task.gameId, task);
  }
  getTasks() {
    return Array.from(this.tasks.values());
  }
  // -------------------------------------------------------------------------
  // API pubblica
  // -------------------------------------------------------------------------
  addTask(gameId, title, store, winetricksVerbs = DEFAULT_WINETRICKS_VERBS, disableWineSync = false, useKnownFixes = false, installOnlyEnv) {
    if (this.tasks.has(gameId)) return { success: false, message: "Installazione gi\xE0 in corso per questo gioco" };
    if (this.runningGameChecker?.(gameId)) {
      const msg = `${title} \xE8 in esecuzione \u2014 chiudilo prima di reinstallare`;
      writeLog("error", `[INSTALL] Blocked \u2014 ${msg}`);
      try {
        insertLog({ timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour12: false }), message: `[INSTALL] Blocked \u2014 ${msg}`, type: "error" });
      } catch {
      }
      return { success: false, message: msg };
    }
    const slug = slugFromId(gameId);
    const base = import_path12.default.join(storeDir(store), slug);
    const installPath = import_path12.default.join(base, "files");
    const gameRow = getGameById(gameId);
    const requiresLauncher = gameRow?.requiresLauncher;
    const selfLauncherDef = getThirdPartyLauncherByStoreId(store);
    const prefixPath = selfLauncherDef ? getSharedPrefixBasePath(selfLauncherDef.id) : requiresLauncher ? getSharedPrefixBasePath(requiresLauncher) : import_path12.default.join(base, "prefix");
    const installerPath = import_path12.default.join(base, "installer");
    const runner = gameRow?.runner;
    const task = {
      gameId,
      gameTitle: title,
      store,
      progress: 0,
      status: "queued",
      phase: "queued",
      phaseLabel: PHASE_LABELS.queued,
      speed: "0 MB/s",
      bytesDownloaded: 0,
      totalBytes: 0,
      installPath,
      prefixPath,
      installerPath,
      winetricksVerbs,
      disableWineSync,
      useKnownFixes,
      runner,
      installOnlyEnv
    };
    this.tasks.set(gameId, task);
    this.notify(task);
    this.startTask(task);
    return { success: true };
  }
  pauseTask(gameId) {
    const task = this.tasks.get(gameId);
    if (!task || task.status !== "downloading") return;
    const proc = this.procs.get(gameId);
    if (proc) proc.kill("SIGSTOP");
    this.update(task, { status: "paused", speed: "0 MB/s" });
  }
  resumeTask(gameId) {
    const task = this.tasks.get(gameId);
    if (!task || task.status !== "paused") return;
    const proc = this.procs.get(gameId);
    if (proc) {
      proc.kill("SIGCONT");
      this.update(task, { status: "downloading" });
    } else {
      this.startTask(task);
    }
  }
  // v0.99.38 — cancelTask ora elimina davvero i dati parziali su disco
  // (installer scaricato, prefix creata, file eventualmente già estratti),
  // non solo la riga in downloads e il processo. Prima di questa modifica
  // "cancel" smetteva solo di tracciare il task, ma lasciava GB di dati
  // parziali sul disco — per un utente che ha deciso di NON installare più
  // quel titolo, è uno spreco di spazio silenzioso, scoperto solo
  // controllando manualmente ~/Games.
  //
  // Elimina l'intera cartella base del gioco (store/slug), che contiene
  // installer/, prefix/ e files/ — più sicuro e completo che cancellare i
  // tre path singolarmente (garantisce che non resti nulla, incluse
  // eventuali sottocartelle impreviste). Guardia esplicita: rifiuta di
  // cancellare se il path risolto non ricade sotto GAMES_ROOT, per non
  // rischiare mai un rm -rf fuori scope anche in caso di dati corrotti.
  cancelTask(gameId) {
    const task = this.tasks.get(gameId);
    const proc = this.procs.get(gameId);
    if (proc) proc.kill("SIGTERM");
    this.procs.delete(gameId);
    this.tasks.delete(gameId);
    deleteDownload(gameId);
    if (task) {
      const slug = slugFromId(gameId);
      const base = import_path12.default.join(storeDir(task.store), slug);
      const resolvedBase = import_path12.default.resolve(base);
      const resolvedRoot = import_path12.default.resolve(GAMES_ROOT);
      if (resolvedBase.startsWith(resolvedRoot + import_path12.default.sep) && (0, import_fs12.existsSync)(resolvedBase)) {
        try {
          (0, import_fs12.rmSync)(resolvedBase, { recursive: true, force: true });
          writeLog("system", `[CANCEL] ${task.gameTitle}: partial data removed (${resolvedBase})`);
        } catch (err) {
          writeLog("error", `[CANCEL] ${task.gameTitle}: failed to remove partial data \u2014 ${err}`);
        }
      } else if (!resolvedBase.startsWith(resolvedRoot + import_path12.default.sep)) {
        writeLog("error", `[CANCEL] ${task.gameTitle}: path "${resolvedBase}" outside GAMES_ROOT \u2014 removal refused for safety.`);
      }
    }
  }
  // -------------------------------------------------------------------------
  // Flusso principale
  // -------------------------------------------------------------------------
  async startTask(task) {
    try {
      if (task.store === "GOG Galaxy") await this.runGOG(task);
      else if (task.store === "Epic Games") await this.runEpic(task);
      else if (task.store === "Amazon Games") await this.runAmazon(task);
      else {
        const thirdPartyDef = getThirdPartyLauncherByStoreId(task.store);
        if (thirdPartyDef) await this.runThirdPartyLauncherInstall(task, thirdPartyDef);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.stack ?? err.message : String(err);
      writeLog("error", `[DOWNLOAD ERROR] ${task.gameTitle}:
${msg}`);
      insertLog({
        timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour12: false }),
        message: `[DOWNLOAD] ${task.gameTitle} \u2014 errore: ${msg}`,
        type: "error"
      });
      this.update(task, { status: "error", error: String(err), speed: "0 MB/s" });
      for (const cb of this.errorCallbacks) {
        try {
          cb(task.gameId, task.gameTitle, String(err), err instanceof Error ? err.recentOutput : void 0);
        } catch {
        }
      }
    }
  }
  // -------------------------------------------------------------------------
  // GOG: download → prefix → deps → install
  // -------------------------------------------------------------------------
  async runGOG(task) {
    const slug = slugFromId(task.gameId);
    this.log(task, "system", `[GOG] Pipeline: ${task.gameTitle} (slug: ${slug})`);
    this.log(task, "system", `[GOG] installPath:   ${task.installPath}`);
    this.log(task, "system", `[GOG] prefixPath:    ${task.prefixPath}`);
    this.log(task, "system", `[GOG] installerPath: ${task.installerPath}`);
    if (!binaryExists7("lgogdownloader")) {
      throw new Error("lgogdownloader non trovato. Installa con: yay -S lgogdownloader");
    }
    this.log(task, "system", `[GOG] lgogdownloader: OK`);
    if (task.status === "queued" || task.status === "downloading") {
      ensureDir(task.installerPath);
      this.update(task, { status: "downloading", progress: 0 });
      this.log(task, "system", `[GOG] Step 1 \u2014 Download in: ${task.installerPath}`);
      await this.spawnWithProgress(task, "lgogdownloader", [
        "--download",
        "--platform",
        "w",
        "--game",
        slug,
        "--directory",
        task.installerPath,
        "--no-color",
        "--progress-interval",
        "-1",
        // v0.99.35 — stesso bug già diagnosticato e corretto per la
        // lettura libreria (gogPlugin.ts:124, vedi commento lì per il
        // dettaglio completo): senza questo flag, lgogdownloader può
        // non rilevare correttamente la build per piattaforma "w"
        // (Windows) per alcuni titoli, restituendo un set di file
        // vuoto senza segnalare errore — esattamente il sintomo
        // osservato (processo termina con successo, cartella
        // installer resta vuota). La correzione di ieri aveva toccato
        // solo il flusso di lettura libreria, non quello di download
        // effettivo — due chiamate lgogdownloader distinte nel codice.
        "--no-platform-detection"
      ], makeLgogProgressParser());
      const downloaded = (0, import_fs12.existsSync)(task.installerPath) ? (0, import_fs12.readdirSync)(task.installerPath) : [];
      this.log(task, "system", `[GOG] Step 1 OK \u2014 file: ${downloaded.join(", ") || "(nessuno)"}`);
    }
    this.log(task, "system", `[GOG] Sync filesystem prima della creazione prefix...`);
    await execFileAsync("sync").catch(() => {
    });
    this.log(task, "system", `[GOG] Step 2 \u2014 Creazione prefix in: ${task.prefixPath}`);
    this.update(task, { status: "creating_prefix", progress: 0, speed: "" });
    ensureDir(task.prefixPath);
    const wineEnv = resolveRunnerWineEnv(task.runner, task.prefixPath);
    if (task.runner && task.runner !== "Wine-Lutris") {
      this.log(
        task,
        "system",
        wineEnv.wineBin !== "wine" ? `[GOG] Runner selezionato: ${task.runner} \u2014 prefix inizializzata con ${wineEnv.wineBin} in ${wineEnv.winePrefixPath}` : `[GOG] Runner "${task.runner}" non risolto sul disco \u2014 fallback su wine di sistema.`
      );
    }
    ensureDir(wineEnv.winePrefixPath);
    const prefixResult = await prepareWinePrefix(
      task,
      {
        prefixPath: wineEnv.winePrefixPath,
        disableWineSync: task.disableWineSync,
        wineBootTimeoutMs: WINEBOOT_TIMEOUT_MS,
        wineBin: wineEnv.wineBin,
        wineserverBin: wineEnv.wineserverBin
      },
      (t, bin, args, env, timeout) => this.spawnWithTimeout(t, bin, args, { ...env, ...wineEnv.extraEnv }, timeout),
      (t, level, msg) => this.log(t, level, msg)
    );
    if (!prefixResult.success) {
      throw new Error(prefixResult.error ?? "[GOG] Preparazione prefix fallita");
    }
    this.log(task, "system", `[GOG] Step 2 OK \u2014 prefix pronta.`);
    if (task.useKnownFixes) {
      const numericId = await fetchGogNumericId(slug);
      if (numericId) {
        const fix = await fetchKnownFixes(numericId, "gog");
        if (fix?.winetricks && fix.winetricks.length > 0) {
          const safeVerbs = sanitizeKnownFixVerbs(fix.winetricks, "GOG", (msg) => this.log(task, "error", msg));
          task.winetricksVerbs = safeVerbs;
          this.log(task, "system", `[GOG] Known fix trovato (Heroic, id ${numericId}): ${safeVerbs.join(", ")}`);
          try {
            const currentProfile = getCompatProfile(task.gameId) ?? {
              fsr: false,
              gameMode: false,
              mangohud: 0,
              eac: false,
              battleye: false
            };
            upsertCompatProfile(task.gameId, {
              ...currentProfile,
              winetricksVerbs: safeVerbs,
              // v0.99.38 — conservate solo per consultazione manuale (es.
              // dallo script di test o dall'overlay), MAI applicate in
              // automatico a executablePath/launchArgs — vedi
              // CompatibilityProfile.knownFixesNotes.
              knownFixesNotes: fix.notes
            });
            this.log(task, "system", `[GOG] Profilo compat aggiornato in modo permanente con i verb Heroic.`);
            if (fix.notes && Object.keys(fix.notes).length > 0) {
              this.log(task, "system", `[GOG] Note Heroic disponibili per questo titolo (consultabili, non applicate in automatico): ${JSON.stringify(fix.notes)}`);
            }
          } catch (err) {
            this.log(task, "error", `[GOG] Salvataggio profilo compat (Heroic) fallito: ${err}`);
          }
          for (const cb of this.knownFixesCallbacks) {
            try {
              cb(task.gameId, task.gameTitle, true, safeVerbs);
            } catch {
            }
          }
        } else {
          this.log(task, "system", `[GOG] Nessun known fix (Heroic) per id ${numericId} \u2014 uso i verb configurati.`);
          for (const cb of this.knownFixesCallbacks) {
            try {
              cb(task.gameId, task.gameTitle, false);
            } catch {
            }
          }
        }
      } else {
        this.log(task, "system", `[GOG] ID numerico non risolto \u2014 known-fixes saltato, uso i verb configurati.`);
        for (const cb of this.knownFixesCallbacks) {
          try {
            cb(task.gameId, task.gameTitle, false);
          } catch {
          }
        }
      }
    }
    const gogVerbs = filterVerbsForEnv(task.winetricksVerbs);
    if (gogVerbs.length > 0 && binaryExists7("winetricks")) {
      this.log(task, "system", `[GOG] Step 3 \u2014 Verbs: ${gogVerbs.join(", ")}`);
      this.update(task, { status: "installing_deps", progress: 0 });
      for (let i = 0; i < gogVerbs.length; i++) {
        const verb = gogVerbs[i];
        this.log(task, "system", `[GOG] Step 3 \u2014 ${verb} (${i + 1}/${gogVerbs.length})`);
        this.update(task, {
          progress: Math.round(i / gogVerbs.length * 100),
          phaseLabel: `Dipendenze: ${verb}...`
        });
        await this.spawnWithTimeout(task, "winetricks", ["--unattended", verb], {
          WINEPREFIX: wineEnv.winePrefixPath,
          WINEDEBUG: "-all",
          WINETRICKS_GUI: "none",
          ...wineEnv.extraEnv
        }, winetrickTimeoutFor(verb));
        this.log(task, "system", `[GOG] Step 3 \u2014 ${verb}: OK`);
      }
    } else if (task.winetricksVerbs.length > 0) {
      this.log(task, "error", `[GOG] winetricks non trovato \u2014 dipendenze saltate`);
    }
    persistWinetricksVerbs(task.gameId, task.winetricksVerbs);
    let findExeResult = "";
    try {
      findExeResult = (0, import_child_process12.execSync)(
        `find "${task.installerPath}" -type f -iname "setup*.exe" | head -1`,
        { encoding: "utf-8", timeout: 5e3 }
      ).trim();
    } catch {
    }
    if (!findExeResult) {
      try {
        findExeResult = (0, import_child_process12.execSync)(
          `find "${task.installerPath}" -type f -iname "*.exe" ! -path "*/extras/*" | head -1`,
          { encoding: "utf-8", timeout: 5e3 }
        ).trim();
      } catch {
      }
    }
    this.log(task, "system", `[GOG] Step 4 \u2014 Installer trovato: ${findExeResult || "(nessuno)"}`);
    if (!findExeResult) {
      const allFound = (0, import_child_process12.execSync)(`find "${task.installerPath}" -type f`, { encoding: "utf-8", timeout: 5e3 }).trim();
      this.log(task, "error", `[GOG] File trovati in installer dir:
${allFound || "(nessuno)"}`);
      throw new Error(
        `[GOG] Nessun installer .exe in ${task.installerPath}. Il download lgogdownloader e' andato a buon fine? Controlla le credenziali GOG.`
      );
    }
    const installer = findExeResult;
    this.log(task, "system", `[GOG] Step 5 \u2014 innoextract: ${installer} \u2192 ${task.installPath}`);
    this.update(task, { status: "installing_game", progress: 0, phaseLabel: "Estrazione gioco..." });
    ensureDir(task.installPath);
    if (!binaryExists7("innoextract")) {
      throw new Error("[GOG] innoextract non trovato. Installa con: sudo pacman -S innoextract");
    }
    await this.spawnWithTimeout(task, "innoextract", [
      installer,
      "--output-dir",
      task.installPath,
      "--progress=1",
      "--gog"
    ], {}, 72e5, {
      idleTimeoutMs: 3e5,
      inactivityPollMs: 1e4,
      // v0.99.35 — barra di progresso reale durante l'estrazione,
      // invece di restare ferma a 0% fino al completamento (sintomo
      // segnalato dall'utente dopo il primo test del timeout di
      // inattività). Formato verificato con test diretto sul log
      // reale di SOMA — vedi parseInnoextractProgress.
      progressParser: parseInnoextractProgress
    });
    this.log(task, "system", `[GOG] Step 5 OK \u2014 estrazione completata.`);
    const gogResolved = resolveGogExe(task.installPath);
    let gogExePath;
    let gogLaunchArgs;
    let gogLaunchCwd;
    if (gogResolved) {
      gogExePath = gogResolved.exePath;
      gogLaunchArgs = gogResolved.launchArgs || void 0;
      gogLaunchCwd = gogResolved.launchCwd || void 0;
      this.log(task, "system", `[GOG] Step 6 \u2014 Exe da goggame-*.info: ${gogExePath}`);
      if (gogLaunchArgs) this.log(task, "system", `[GOG] Step 6 \u2014 Args: ${gogLaunchArgs}`);
      if (gogLaunchCwd) this.log(task, "system", `[GOG] Step 6 \u2014 CWD: ${gogLaunchCwd}`);
    } else {
      gogExePath = findMainExe(task.installPath) ?? void 0;
      this.log(task, "system", `[GOG] Step 6 \u2014 \u26A0 Exe da filesystem (fallback): ${gogExePath ?? "non trovato"}`);
    }
    this.update(task, {
      status: "completed",
      progress: 100,
      phaseLabel: PHASE_LABELS.completed,
      executablePath: gogExePath,
      launchArgs: gogLaunchArgs,
      launchCwd: gogLaunchCwd,
      prefixPath: task.prefixPath
    });
    this.procs.delete(task.gameId);
    for (const cb of this.completeCallbacks) {
      try {
        cb(task.gameId, task.gameTitle);
      } catch {
      }
    }
  }
  // -------------------------------------------------------------------------
  // Epic: legendary install → prefix → deps
  // -------------------------------------------------------------------------
  async runEpic(task) {
    const appName = task.gameId.replace(/^epic-/, "");
    if (!binaryExists7("legendary")) {
      throw new Error("legendary non trovato. Installa con: yay -S legendary-gl");
    }
    ensureDir(task.installPath);
    this.update(task, { status: "downloading", progress: 0 });
    await this.spawnWithProgress(task, "legendary", [
      "install",
      appName,
      "--base-path",
      task.installPath,
      "--yes",
      "--skip-sdl"
      // evita prompt SDL che in alcune versioni ignora --yes
    ], makeLegendaryProgressParser());
    this.log(task, "system", `[EPIC] Sync filesystem prima della creazione prefix...`);
    await execFileAsync("sync").catch(() => {
    });
    this.update(task, { status: "creating_prefix", progress: 0, speed: "" });
    ensureDir(task.prefixPath);
    const wineEnv = resolveRunnerWineEnv(task.runner, task.prefixPath);
    if (task.runner && task.runner !== "Wine-Lutris") {
      this.log(
        task,
        "system",
        wineEnv.wineBin !== "wine" ? `[EPIC] Runner selezionato: ${task.runner} \u2014 prefix inizializzata con ${wineEnv.wineBin} in ${wineEnv.winePrefixPath}` : `[EPIC] Runner "${task.runner}" non risolto sul disco \u2014 fallback su wine di sistema.`
      );
    }
    ensureDir(wineEnv.winePrefixPath);
    const prefixResult = await prepareWinePrefix(
      task,
      {
        prefixPath: wineEnv.winePrefixPath,
        disableWineSync: task.disableWineSync,
        wineBootTimeoutMs: WINEBOOT_TIMEOUT_MS,
        wineBin: wineEnv.wineBin,
        wineserverBin: wineEnv.wineserverBin
      },
      (t, bin, args, env, timeout) => this.spawnWithTimeout(t, bin, args, { ...env, ...wineEnv.extraEnv }, timeout),
      (t, level, msg) => this.log(t, level, msg)
    );
    if (!prefixResult.success) {
      throw new Error(prefixResult.error ?? "[EPIC] Preparazione prefix fallita");
    }
    let verbsForInstall = task.winetricksVerbs;
    if (task.useKnownFixes) {
      const fix = await fetchKnownFixes(appName, "epic");
      if (fix?.winetricks && fix.winetricks.length > 0) {
        const safeVerbs = sanitizeKnownFixVerbs(fix.winetricks, "EPIC", (msg) => this.log(task, "error", msg));
        verbsForInstall = safeVerbs;
        this.log(task, "system", `[EPIC] Known fix trovato (Heroic): ${safeVerbs.join(", ")}`);
        try {
          const currentProfile = getCompatProfile(task.gameId) ?? {
            fsr: false,
            gameMode: false,
            mangohud: 0,
            eac: false,
            battleye: false
          };
          upsertCompatProfile(task.gameId, {
            ...currentProfile,
            winetricksVerbs: safeVerbs,
            knownFixesNotes: fix.notes
          });
          this.log(task, "system", `[EPIC] Profilo compat aggiornato in modo permanente con i verb Heroic.`);
          if (fix.notes && Object.keys(fix.notes).length > 0) {
            this.log(task, "system", `[EPIC] Note Heroic disponibili per questo titolo (consultabili, non applicate in automatico): ${JSON.stringify(fix.notes)}`);
          }
        } catch (err) {
          this.log(task, "error", `[EPIC] Salvataggio profilo compat (Heroic) fallito: ${err}`);
        }
        for (const cb of this.knownFixesCallbacks) {
          try {
            cb(task.gameId, task.gameTitle, true, safeVerbs);
          } catch {
          }
        }
      } else {
        this.log(task, "system", `[EPIC] Nessun known fix (Heroic) per questo gioco \u2014 uso i verb configurati.`);
        for (const cb of this.knownFixesCallbacks) {
          try {
            cb(task.gameId, task.gameTitle, false);
          } catch {
          }
        }
      }
    }
    const epicVerbs = filterVerbsForEnv(verbsForInstall);
    if (epicVerbs.length > 0 && binaryExists7("winetricks")) {
      this.update(task, { status: "installing_deps", progress: 0 });
      for (let i = 0; i < epicVerbs.length; i++) {
        const verb = epicVerbs[i];
        this.update(task, {
          progress: Math.round(i / epicVerbs.length * 100),
          phaseLabel: `Installazione dipendenze: ${verb}...`
        });
        await this.spawnWithTimeout(task, "winetricks", ["--unattended", verb], {
          WINEPREFIX: wineEnv.winePrefixPath,
          WINEDEBUG: "-all",
          WINETRICKS_GUI: "none",
          ...wineEnv.extraEnv
        }, winetrickTimeoutFor(verb));
      }
    }
    persistWinetricksVerbs(task.gameId, verbsForInstall);
    const epicResolved = await resolveEpicExe(appName);
    let exePath;
    let launchArgs;
    if (epicResolved) {
      exePath = epicResolved.exePath;
      launchArgs = epicResolved.launchArgs || void 0;
      this.log(task, "system", `[EPIC] Exe da legendary: ${exePath}`);
      if (launchArgs) this.log(task, "system", `[EPIC] Launch args: ${launchArgs}`);
    } else {
      exePath = findMainExe(task.installPath) ?? void 0;
      this.log(task, "system", `[EPIC] \u26A0 Exe da filesystem (fallback): ${exePath ?? "non trovato"}`);
    }
    this.update(task, {
      status: "completed",
      progress: 100,
      phaseLabel: PHASE_LABELS.completed,
      executablePath: exePath,
      launchArgs,
      prefixPath: task.prefixPath
    });
    this.procs.delete(task.gameId);
    for (const cb of this.completeCallbacks) {
      try {
        cb(task.gameId, task.gameTitle);
      } catch {
      }
    }
  }
  /**
   * v1.1.111-dev.1 — Step 19c, Amazon Games via nile. Stessa struttura di
   * runEpic sopra (progresso, prefix Wine, winetricks, ricerca eseguibile),
   * verificata voce per voce con output reale fornito dall'utente:
   *   - `nile install <product.id> --base-path <path>` (verificato:
   *     --install --help dice esplicitamente "It'll append save filename
   *     to that path" — stesso comportamento di legendary --base-path)
   *   - Formato di progresso VERIFICATO con log reale di un'installazione
   *     completa (Art of Fighting 3, ~53MB): righe INFO [PROGRESS] separate
   *     da newline normale (mai \r, a differenza di legendary/
   *     lgogdownloader) — vedi makeNileProgressParser sotto per il
   *     dettaglio di un artefatto di nile scoperto in quel log (la
   *     percentuale stampata è "in ritardo" di una riga rispetto alla
   *     vera frazione byte, quindi ignorata: calcolata sempre da noi).
   *
   * NON ancora implementato, esplicitamente non indovinato: known-fixes
   * Heroic per Amazon (fetchKnownFixes usa un percorso di repository
   * verificato solo per 'gog'/'epic' — non ho verificato se esiste una
   * cartella equivalente per Amazon in quel repository, quindi
   * task.useKnownFixes viene ignorato qui per ora, non applicato a
   * caso). Ricerca eseguibile: nessun equivalente verificato di
   * `legendary info --json` per nile (nessun sottocomando "info" a sé,
   * solo il flag --info su install, che per un gioco NON installato
   * mostra solo download_size — non verificato cosa mostri su un gioco
   * già installato) — usa direttamente findMainExe() sul filesystem,
   * stesso fallback già collaudato e affidabile usato da Epic quando
   * legendary info non risolve.
   */
  async runAmazon(task) {
    const productId = task.gameId.replace(/^amazon-/, "");
    if (!binaryExists7("nile")) {
      throw new Error("nile non trovato. Installa con: yay -S nile-git");
    }
    ensureDir(task.installPath);
    this.update(task, { status: "downloading", progress: 0 });
    await this.spawnWithProgress(task, "nile", [
      "install",
      productId,
      "--base-path",
      task.installPath
    ], makeNileProgressParser());
    this.log(task, "system", `[AMAZON] Sync filesystem prima della creazione prefix...`);
    await execFileAsync("sync").catch(() => {
    });
    this.update(task, { status: "creating_prefix", progress: 0, speed: "" });
    ensureDir(task.prefixPath);
    const wineEnv = resolveRunnerWineEnv(task.runner, task.prefixPath);
    if (task.runner && task.runner !== "Wine-Lutris") {
      this.log(
        task,
        "system",
        wineEnv.wineBin !== "wine" ? `[AMAZON] Runner selezionato: ${task.runner} \u2014 prefix inizializzata con ${wineEnv.wineBin} in ${wineEnv.winePrefixPath}` : `[AMAZON] Runner "${task.runner}" non risolto sul disco \u2014 fallback su wine di sistema.`
      );
    }
    ensureDir(wineEnv.winePrefixPath);
    const prefixResult = await prepareWinePrefix(
      task,
      {
        prefixPath: wineEnv.winePrefixPath,
        disableWineSync: task.disableWineSync,
        wineBootTimeoutMs: WINEBOOT_TIMEOUT_MS,
        wineBin: wineEnv.wineBin,
        wineserverBin: wineEnv.wineserverBin
      },
      (t, bin, args, env, timeout) => this.spawnWithTimeout(t, bin, args, { ...env, ...wineEnv.extraEnv }, timeout),
      (t, level, msg) => this.log(t, level, msg)
    );
    if (!prefixResult.success) {
      throw new Error(prefixResult.error ?? "[AMAZON] Preparazione prefix fallita");
    }
    const amazonVerbs = filterVerbsForEnv(task.winetricksVerbs);
    if (amazonVerbs.length > 0 && binaryExists7("winetricks")) {
      this.update(task, { status: "installing_deps", progress: 0 });
      for (let i = 0; i < amazonVerbs.length; i++) {
        const verb = amazonVerbs[i];
        this.update(task, {
          progress: Math.round(i / amazonVerbs.length * 100),
          phaseLabel: `Installazione dipendenze: ${verb}...`
        });
        await this.spawnWithTimeout(task, "winetricks", ["--unattended", verb], {
          WINEPREFIX: wineEnv.winePrefixPath,
          WINEDEBUG: "-all",
          WINETRICKS_GUI: "none",
          ...wineEnv.extraEnv
        }, winetrickTimeoutFor(verb));
      }
    }
    persistWinetricksVerbs(task.gameId, task.winetricksVerbs);
    const exePath = findMainExe(task.installPath) ?? void 0;
    this.log(task, "system", `[AMAZON] Exe da filesystem: ${exePath ?? "non trovato"}`);
    this.update(task, {
      status: "completed",
      progress: 100,
      phaseLabel: PHASE_LABELS.completed,
      executablePath: exePath,
      prefixPath: task.prefixPath
    });
    this.procs.delete(task.gameId);
    for (const cb of this.completeCallbacks) {
      try {
        cb(task.gameId, task.gameTitle);
      } catch {
      }
    }
  }
  // -------------------------------------------------------------------------
  // Step 19d/dev.10 — Launcher terzi condivisi (Ubisoft Connect, e in
  // futuro EA App/Battle.net/Rockstar): nessun tool CLI scriptabile come
  // legendary/lgogdownloader/nile, l'utente scarica l'installer a mano dal
  // sito ufficiale. "Download" per questo task finisce non appena
  // sappiamo dove si trova quel file — non lo eseguiamo qui dentro:
  // l'installer diventa l'executablePath di questo "gioco", il primo
  // lancio (pipeline Play già esistente) lo esegue, e alla chiusura
  // scatta la verifica post-lancio (v0.99.35/36, ora delegata al plugin
  // via onLauncherProcessClosed — vedi gameManager.ts) — dove il vero
  // eseguibile viene ri-risolto e il bootstrap del prefix condiviso
  // registrato. Nessuna fase installing_deps/creating_prefix qui: quelle
  // risorse le prepara il flusso di lancio dei giochi Proton esistente,
  // non serve duplicarle in questo task.
  //
  // v1.5.20-dev.10 — generalizzata da runUbisoftConnect(task) a
  // runThirdPartyLauncherInstall(task, def): decisione esplicita con
  // l'utente, NON un plugin unico — questa resta la sola parte
  // davvero comune a qualunque launcher terzo (creazione prefix +
  // ricerca installer), ogni plugin mantiene le proprie particolarità
  // altrove (card, switch, libreria interna, rilevamento bootstrap).
  // -------------------------------------------------------------------------
  async runThirdPartyLauncherInstall(task, def) {
    const logTag = `[${def.displayName.toUpperCase()}]`;
    this.log(task, "system", `${logTag} Step 1 \u2014 Creazione/verifica prefix condivisa in: ${task.prefixPath}`);
    this.update(task, { status: "creating_prefix", progress: 0, speed: "" });
    ensureDir(task.prefixPath);
    const wineEnv = resolveRunnerWineEnv(task.runner, task.prefixPath);
    if (wineEnv.wineBin === "wine") {
      throw new Error(
        `${logTag} Nessuna build Proton/GE-Proton risolta per il runner "${task.runner}" \u2014 seleziona una build Proton realmente installata in Game Options > Runner Bridge prima di installare.`
      );
    }
    ensureDir(wineEnv.winePrefixPath);
    const prefixResult = await prepareWinePrefix(
      task,
      {
        prefixPath: wineEnv.winePrefixPath,
        disableWineSync: task.disableWineSync,
        wineBootTimeoutMs: WINEBOOT_TIMEOUT_MS,
        wineBin: wineEnv.wineBin,
        wineserverBin: wineEnv.wineserverBin
      },
      (t, bin, args, env, timeout) => this.spawnWithTimeout(t, bin, args, { ...env, ...wineEnv.extraEnv }, timeout),
      (t, level, msg) => this.log(t, level, msg)
    );
    if (!prefixResult.success) {
      throw new Error(prefixResult.error ?? `${logTag} Preparazione prefix fallita`);
    }
    this.log(task, "system", `${logTag} Step 1 OK \u2014 prefix pronta.`);
    const requestedVerbs = task.winetricksVerbs.length > 0 ? task.winetricksVerbs : def.requiredWinetricksVerbs;
    const verbs = filterVerbsForEnv(requestedVerbs);
    if (verbs.length > 0 && binaryExists7("winetricks")) {
      this.log(task, "system", `${logTag} Step 2 \u2014 Verbs: ${verbs.join(", ")}`);
      this.update(task, { status: "installing_deps", progress: 0 });
      for (let i = 0; i < verbs.length; i++) {
        const verb = verbs[i];
        this.log(task, "system", `${logTag} Step 2 \u2014 ${verb} (${i + 1}/${verbs.length})`);
        this.update(task, {
          progress: Math.round(i / verbs.length * 100),
          phaseLabel: `Dipendenze: ${verb}...`
        });
        await this.spawnWithTimeout(task, "winetricks", ["--unattended", verb], {
          WINEPREFIX: wineEnv.winePrefixPath,
          WINEDEBUG: "-all",
          WINETRICKS_GUI: "none",
          ...wineEnv.extraEnv
        }, winetrickTimeoutFor(verb));
        this.log(task, "system", `${logTag} Step 2 \u2014 ${verb}: OK`);
      }
    } else if (requestedVerbs.length > 0) {
      this.log(task, "error", `${logTag} winetricks non trovato \u2014 dipendenze saltate`);
    }
    persistWinetricksVerbs(task.gameId, requestedVerbs);
    const found = findInstallerInDownloads(def.installerFilenameHints);
    if (!found) {
      this.log(task, "system", `${logTag} Step 3 \u2014 Installer non trovato in ${resolveDownloadsDir() ?? "~/Downloads"}.`);
      this.update(task, {
        status: "awaiting_installer",
        progress: 0,
        phaseLabel: PHASE_LABELS.awaiting_installer,
        downloadUrl: def.installerUrl
      });
      return;
    }
    this.completeWithInstaller(task, found);
  }
  /** Segna il task completato con l'installer trovato come executablePath
   *  temporaneo — vedi commento esteso sopra su perché non lo eseguiamo qui. */
  completeWithInstaller(task, installerPath) {
    this.log(task, "system", `[INSTALLER] ${installerPath}`);
    this.update(task, {
      status: "completed",
      progress: 100,
      phaseLabel: PHASE_LABELS.completed,
      installerPath,
      executablePath: installerPath,
      prefixPath: task.prefixPath
    });
    this.procs.delete(task.gameId);
    for (const cb of this.completeCallbacks) {
      try {
        cb(task.gameId, task.gameTitle);
      } catch {
      }
    }
  }
  /** Chiamato dall'endpoint installer-continue: l'utente dice di aver
   *  scaricato l'installer, ricontrolla la cartella Download reale. */
  continueInstaller(gameId) {
    const task = this.tasks.get(gameId);
    if (!task || task.status !== "awaiting_installer") {
      return { success: false, message: "Nessuna installazione in attesa per questo gioco." };
    }
    const def = getThirdPartyLauncherByStoreId(task.store);
    const found = findInstallerInDownloads(def?.installerFilenameHints);
    if (!found) {
      return { success: false, message: `Installer ancora non trovato in ${resolveDownloadsDir() ?? "~/Downloads"}.` };
    }
    this.completeWithInstaller(task, found);
    return { success: true, message: "Installer trovato, installazione avviata." };
  }
  /** Chiamato dall'endpoint installer-browse: apre il file picker nativo
   *  (zenity/kdialog) — vedi filePicker.ts, unico punto da sostituire in
   *  futuro con un file browser interno (in arrivo — Fase A.4). */
  async browseInstaller(gameId) {
    const task = this.tasks.get(gameId);
    if (!task || task.status !== "awaiting_installer") {
      return { success: false, message: "Nessuna installazione in attesa per questo gioco." };
    }
    const def = getThirdPartyLauncherByStoreId(task.store);
    const result = await browseForFile({
      title: `Seleziona l'installer di ${def?.displayName ?? task.gameTitle}`,
      startDir: resolveDownloadsDir() ?? void 0,
      // v1.5.20-dev.10 — richiesta utente: estesa a .msi/.cab, gli altri
      // formati comuni per un installer Windows oltre al semplice .exe.
      filter: { name: "Installer Windows", extensions: ["exe", "msi", "cab"] }
    });
    if (result.outcome !== "selected" || !result.path) {
      return { success: false, message: "Nessun file selezionato." };
    }
    this.completeWithInstaller(task, result.path);
    return { success: true, message: "Installer selezionato, installazione avviata." };
  }
  /**
   * v1.5.20-dev.12 — chiamato dall'endpoint installer-select: l'utente
   * ha scelto il file tramite il file manager nativo controller-
   * navigabile (Fase A.4), il path arriva già risolto dal client — a
   * differenza di browseInstaller() sopra, qui NON si invoca alcun
   * dialog nativo (zenity/kdialog), la selezione è già avvenuta
   * nell'overlay in-app. Stessa identica validazione/completamento.
   */
  confirmInstallerPath(gameId, filePath) {
    const task = this.tasks.get(gameId);
    if (!task || task.status !== "awaiting_installer") {
      return { success: false, message: "Nessuna installazione in attesa per questo gioco." };
    }
    if (!(0, import_fs12.existsSync)(filePath)) {
      return { success: false, message: "Il file selezionato non esiste pi\xF9." };
    }
    this.completeWithInstaller(task, filePath);
    return { success: true, message: "Installer selezionato, installazione avviata." };
  }
  //
  // IMPORTANTE: lgogdownloader e legendary aggiornano la riga di progresso
  // usando \r (carriage return), non \n. Il buffer va splittato su entrambi.
  // -------------------------------------------------------------------------
  spawnWithProgress(task, bin, args, parser) {
    return new Promise((resolve, reject) => {
      const proc = (0, import_child_process12.spawn)(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: buildSafeEnv()
      });
      this.procs.set(task.gameId, proc);
      const RECENT_LINES_CAP = 40;
      const recentLines = [];
      const onLine = (line) => {
        recentLines.push(line);
        if (recentLines.length > RECENT_LINES_CAP) recentLines.shift();
        const parsed = parser(line.trim());
        if (parsed && task.status === "downloading") {
          this.update(task, {
            progress: Math.max(task.progress, Math.min(parsed.progress, 99)),
            speed: parsed.speed || task.speed
          });
        }
      };
      let buf = "";
      const handleData = (chunk) => {
        buf += chunk.toString();
        const lines = buf.split(/\r|\n/);
        buf = lines.pop() ?? "";
        for (const l of lines) if (l.trim()) onLine(l);
      };
      proc.stdout.on("data", handleData);
      proc.stderr.on("data", handleData);
      proc.on("close", (code) => {
        this.procs.delete(task.gameId);
        if (code === 0 || code === null) {
          resolve();
        } else {
          if (recentLines.length > 0) {
            this.log(task, "error", `[${bin.toUpperCase()}] Ultime righe prima del fallimento:
${recentLines.join("\n")}`);
          }
          const err = new Error(`${bin} exited with code ${code}`);
          err.recentOutput = recentLines.join("\n");
          reject(err);
        }
      });
      proc.on("error", (err) => reject(err));
    });
  }
  // -------------------------------------------------------------------------
  // Helper: spawn silenzioso con timeout obbligatorio
  //
  // wine wineboot e winetricks possono bloccarsi indefinitamente se:
  //   - wineserver rimane zombie dopo un crash precedente
  //   - il DISPLAY è disponibile e un sottoprocesso apre una GUI
  //   - winetricks scarica un pacchetto e il server CDN non risponde
  //
  // Il timeout forza SIGKILL dopo il limite e rigetta la Promise,
  // propagando l'errore alla fase corrente invece di bloccare per sempre.
  // -------------------------------------------------------------------------
  // v0.99.35 — regola adottata: ogni funzione che lancia processi
  // esterni critici (wine/winetricks/legendary/ecc.) integra logging
  // diagnostico tramite this.log(), non console.log temporaneo — così
  // chi guarda la dashboard (LogPanel.tsx) ha sempre un dato concreto
  // da cui partire in caso di errore, senza dover aprire un terminale
  // separato o aggiungere debug ad-hoc da rimuovere dopo. task viene
  // passato esplicitamente per questo motivo: spawnWithTimeout deve
  // poter scrivere nel canale di log della dashboard come fanno già
  // installGOG/installEpic.
  /**
   * v0.99.35 — timeout di INATTIVITÀ invece di timeout assoluto fisso.
   *
   * Causa del cambio: un timeout assoluto fisso costringe a indovinare
   * un numero — troppo corto per giochi grandi (confermato: SOMA,
   * estrazione innoextract ancora a I/O pieno con STAT=D dopo 10
   * minuti, oltre 17GB già scritti, timeout scattato su un processo
   * genuinamente al lavoro), troppo lungo se applicato indistintamente
   * a operazioni piccole. Non esiste un numero fisso corretto per
   * "quanto può essere grande un'estrazione" — varia per ordini di
   * grandezza da gioco a gioco.
   *
   * Soluzione: monitorare periodicamente /proc/<pid>/io (stesso file
   * già usato per la diagnosi manuale in questa sessione — read_bytes/
   * write_bytes) e resettare il timer di inattività ogni volta che i
   * contatori crescono. Il processo viene terminato solo se NON fa
   * alcun I/O per `idleTimeoutMs` consecutivi — non se il lavoro
   * totale richiede più tempo del previsto. inactivityPollMs controlla
   * la frequenza di controllo (lettura di un file /proc, operazione
   * leggera, costo trascurabile anche a intervalli brevi).
   *
   * absoluteMaxMs resta come rete di sicurezza estrema, indipendente
   * dall'attività rilevata — protegge da un bug nel meccanismo di
   * rilevamento stesso (es. /proc non leggibile per qualche motivo),
   * non da un'estrazione lenta ma reale.
   */
  getProcIoBytes(pid) {
    try {
      const raw = (0, import_fs12.readFileSync)(`/proc/${pid}/io`, "utf-8");
      const read = raw.match(/^read_bytes:\s*(\d+)/m);
      const write = raw.match(/^write_bytes:\s*(\d+)/m);
      const r = read ? parseInt(read[1], 10) : 0;
      const w = write ? parseInt(write[1], 10) : 0;
      return r + w;
    } catch {
      return null;
    }
  }
  spawnWithTimeout(task, bin, args, env = {}, timeoutMs, opts = {}) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const label = `[WINE-DEBUG] ${bin} ${args.join(" ")}`;
      const finalEnv = { ...env };
      if (task.disableWineSync && (bin === "wine" || bin === "winetricks")) {
        finalEnv.WINE_DISABLE_FAST_SYNC = "1";
        this.log(task, "system", `${label} \u2014 WINE_DISABLE_FAST_SYNC=1 attivo (opzione utente)`);
      }
      if (task.installOnlyEnv && Object.keys(task.installOnlyEnv).length > 0) {
        Object.assign(finalEnv, task.installOnlyEnv);
        this.log(task, "system", `${label} \u2014 variabili "solo installazione" attive: ${Object.keys(task.installOnlyEnv).join(", ")}`);
      }
      this.log(task, "system", `${label} \u2014 avviato`);
      const proc = (0, import_child_process12.spawn)(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: buildSafeEnv(finalEnv)
      });
      this.log(task, "system", `${label} \u2014 PID=${proc.pid}`);
      let stderrBuf = "";
      let progressBuf = "";
      const handleProgressData = (chunk) => {
        if (!opts.progressParser) return;
        progressBuf += chunk.toString();
        const lines = progressBuf.split(/\r|\n/);
        progressBuf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.trim()) continue;
          const parsed = opts.progressParser(l.trim());
          if (parsed) {
            this.update(task, {
              progress: Math.max(task.progress, Math.min(parsed.progress, 99)),
              speed: parsed.speed || task.speed
            });
          }
        }
      };
      proc.stderr?.on("data", (chunk) => {
        stderrBuf += chunk.toString();
        if (stderrBuf.length > 2e3) stderrBuf = stderrBuf.slice(-2e3);
        handleProgressData(chunk);
      });
      proc.stdout?.on("data", opts.progressParser ? handleProgressData : () => {
      });
      let settled = false;
      const cleanupTimers = () => {
        clearTimeout(idleTimer);
        clearTimeout(absoluteTimer);
        clearInterval(pollInterval);
      };
      const killForTimeout = (reason) => {
        if (settled) return;
        settled = true;
        this.log(task, "error", `${label} \u2014 TIMEOUT (${reason}), PID=${proc.pid}, killed=${proc.killed}`);
        try {
          const psTree = (0, import_child_process12.execSync)(
            `ps --ppid ${proc.pid} -o pid,ppid,stat,etimes,cmd 2>/dev/null; ps -p ${proc.pid} -o pid,ppid,stat,etimes,cmd 2>/dev/null`,
            { encoding: "utf-8" }
          );
          this.log(task, "system", `${label} \u2014 processi al momento del timeout:
${psTree || "(nessun processo trovato \u2014 gi\xE0 terminato)"}`);
        } catch (err) {
          this.log(task, "system", `${label} \u2014 ps snapshot fallito: ${err}`);
        }
        cleanupTimers();
        proc.kill("SIGKILL");
        reject(new Error(`${bin} timeout (${reason})`));
      };
      const absoluteTimer = setTimeout(
        () => killForTimeout(`limite assoluto ${timeoutMs}ms raggiunto`),
        timeoutMs
      );
      const idleTimeoutMs = opts.idleTimeoutMs ?? timeoutMs;
      let idleTimer = setTimeout(
        () => killForTimeout(`nessuna attivit\xE0 I/O per ${idleTimeoutMs}ms`),
        idleTimeoutMs
      );
      let lastIoBytes = null;
      const pollMs = opts.inactivityPollMs ?? 1e4;
      const pollInterval = setInterval(() => {
        if (!proc.pid || settled) return;
        const current = this.getProcIoBytes(proc.pid);
        if (current === null) return;
        if (lastIoBytes === null || current > lastIoBytes) {
          lastIoBytes = current;
          clearTimeout(idleTimer);
          idleTimer = setTimeout(
            () => killForTimeout(`nessuna attivit\xE0 I/O per ${idleTimeoutMs}ms`),
            idleTimeoutMs
          );
        }
      }, pollMs);
      proc.on("exit", (code, signal) => {
        if (settled) return;
        settled = true;
        const elapsed = Date.now() - startedAt;
        this.log(task, "system", `${label} \u2014 evento 'exit' dopo ${elapsed}ms, code=${code}, signal=${signal}`);
        cleanupTimers();
        if (code === 0 || code === null) resolve();
        else {
          const detail = stderrBuf.trim().split("\n").slice(-5).join(" | ");
          reject(new Error(`${bin} exited with code ${code}${detail ? ` \u2014 ${detail}` : ""}`));
        }
      });
      proc.on("error", (err) => {
        if (settled) return;
        settled = true;
        const elapsed = Date.now() - startedAt;
        this.log(task, "error", `${label} \u2014 evento 'error' dopo ${elapsed}ms: ${err.message}`);
        cleanupTimers();
        reject(err);
      });
    });
  }
};
var downloadManager = new DownloadManager();

// src/backend/plugins/ubisoftConnectPlugin.ts
init_logger();

// src/backend/wineRegistry.ts
var import_fs13 = require("fs");
function unescapeRegValue(raw) {
  return raw.replace(/\\x([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\\\/g, "\\").replace(/\\"/g, '"');
}
function parseWineReg(content) {
  const keys = [];
  let current = null;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line) {
      current = null;
      continue;
    }
    const keyMatch = line.match(/^\[(.+)\]\s*\d*$/);
    if (keyMatch) {
      current = { path: unescapeRegValue(keyMatch[1]), values: {} };
      keys.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("#")) continue;
    const valMatch = line.match(/^"([^"]+)"="((?:[^"\\]|\\.)*)"$/);
    if (valMatch) {
      current.values[valMatch[1]] = unescapeRegValue(valMatch[2]);
    }
  }
  return keys;
}
function readWineReg(filePath) {
  if (!(0, import_fs13.existsSync)(filePath)) return null;
  try {
    return parseWineReg((0, import_fs13.readFileSync)(filePath, "utf-8"));
  } catch (e) {
    return { error: e?.message ?? String(e) };
  }
}
function lastPathSegment(key) {
  const parts = key.path.split("\\");
  return parts[parts.length - 1] ?? "";
}

// src/backend/plugins/ubisoftConnectPlugin.ts
init_notificationEngine();
var import_fs14 = require("fs");
var import_child_process13 = require("child_process");
function pluginLog(message, type = "system") {
  const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour12: false });
  insertLog({ timestamp, message, type });
  writeLog(type, message);
}
var UBISOFT_CONNECT_GAME_ID = "ubisoft-connect-launcher";
function resolveDefaultRunner() {
  const runners = compatibilityManager.getAvailableRunners().filter((r) => /proton/i.test(r.id));
  if (runners.length === 0) return "Proton 8.0-4";
  const steamProton = runners.find((r) => !/^GE-Proton|^Proton-GE/i.test(r.id));
  return (steamProton ?? runners[0]).id;
}
var normalizeTitle = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function findDisplayNamesByProductId(keys) {
  const map = /* @__PURE__ */ new Map();
  for (const k of keys) {
    if (!k.path.toLowerCase().includes("\\uninstall\\")) continue;
    const uninstallString = k.values["UninstallString"];
    const displayName = k.values["DisplayName"];
    if (!uninstallString || !displayName) continue;
    const m = uninstallString.match(/uplay:\/\/uninstall\/(\d+)/i);
    if (m) map.set(m[1], displayName);
  }
  return map;
}
function scanInstalledUbisoftGames() {
  const pfxRoot = resolveSharedPrefixExecutionPath("ubisoft-connect");
  const regPath = import_path13.default.join(pfxRoot, "system.reg");
  const parsed = readWineReg(regPath);
  if (parsed === null) {
    pluginLog(`[UBISOFT] Scan libreria nativa: system.reg non trovato in ${regPath} \u2014 il launcher non \xE8 mai stato avviato del tutto, o il prefix non \xE8 nella posizione attesa.`, "warning");
    return [];
  }
  if ("error" in parsed) {
    pluginLog(`[UBISOFT] Scan libreria nativa: system.reg trovato ma il parsing \xE8 fallito \u2014 ${parsed.error}`, "error");
    return [];
  }
  const keys = parsed;
  pluginLog(`[UBISOFT] Scan libreria nativa: ${keys.length} chiavi lette da system.reg.`, "info");
  const displayNames = findDisplayNamesByProductId(keys);
  const results = [];
  let installsKeysSeen = 0;
  for (const k of keys) {
    const parts = k.path.split("\\").map((s) => s.toLowerCase());
    if (parts.length < 4) continue;
    const tail = parts.slice(parts.length - 4, parts.length - 1).join("\\");
    if (tail !== "ubisoft\\launcher\\installs") continue;
    installsKeysSeen++;
    const productId = lastPathSegment(k);
    const installDirWindows = k.values["InstallDir"];
    if (!productId || !installDirWindows) {
      pluginLog(`[UBISOFT] Chiave Installs trovata (${k.path}) ma senza id o InstallDir leggibili \u2014 saltata.`, "warning");
      continue;
    }
    const displayName = displayNames.get(productId);
    if (!displayName) {
      pluginLog(`[UBISOFT] Prodotto installato id=${productId} trovato nel registro ma senza DisplayName corrispondente nella voce Uninstall \u2014 saltato.`, "warning");
      continue;
    }
    results.push({ productId, displayName, installDirWindows });
  }
  pluginLog(`[UBISOFT] Scan libreria nativa: ${installsKeysSeen} chiavi Installs trovate, ${results.length} giochi risolti con nome+percorso.`, "info");
  return results;
}
function windowsPathToLinux(driveC, winPath) {
  const rel = winPath.replace(/^[a-zA-Z]:/, "").replace(/\\/g, "/").replace(/^\/+/, "");
  return import_path13.default.join(driveC, rel);
}
function findExeInKnownDir(absoluteDir) {
  if (!(0, import_fs14.existsSync)(absoluteDir)) return null;
  try {
    const result = (0, import_child_process13.execSync)(
      `find "${absoluteDir}" -maxdepth 3 -iname "*.exe" ! -iname "unins*" ! -iname "*crashhandler*" ! -iname "*crashreporter*" ! -iname "vcredist*" ! -iname "vc_redist*" ! -iname "dxsetup*" ! -iname "*explorer*" ! -iname "*helper*" ! -iname "*updater*" | head -1`,
      { encoding: "utf-8", timeout: 8e3 }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}
var UbisoftConnectPlugin = class extends StorePlugin {
  id = "Ubisoft";
  name = "Ubisoft Connect";
  drmFree = false;
  description = "Ubisoft Connect \u2014 launcher condiviso richiesto da alcuni giochi Ubisoft comprati su altri store.";
  // Nessun tool CLI: l'installer si scarica a mano dal sito ufficiale
  // (vedi installerUrl in thirdPartyLaunchers.ts e runUbisoftConnect in
  // downloadManager.ts).
  requiredTool = "";
  /**
   * v1.5.20-dev.5 — bug reale segnalato dall'utente: la card in Manage
   * Accounts risultava SEMPRE "Disconnesso", anche senza alcun login
   * richiesto (Ubisoft è in NO_LOGIN_STORES). Causa: questo plugin non
   * sovrascriveva mai isAuthenticated(), ereditando il default della
   * classe base (`isPublic || authenticated`) — entrambi sempre false
   * qui, perché nessun flusso di login esiste per questo store.
   * Stesso principio già usato da SteamPlugin (isAuthenticated() ==
   * "Steam trovato su disco", non un vero login): qui "connesso" == il
   * launcher condiviso è stato davvero bootstrappato in shared-launchers/
   * (installer eseguito e primo lancio riuscito, non solo la cartella
   * creata — vedi isLauncherBootstrapped()/markLauncherBootstrapped() in
   * sharedLauncherManager.ts, più preciso di un controllo grezzo
   * sull'esistenza della cartella).
   */
  async isAuthenticated() {
    return isLauncherBootstrapped("ubisoft-connect");
  }
  async getLibrary() {
    this.ensureSeeded();
    const launcherGame = getGameById(UBISOFT_CONNECT_GAME_ID);
    const games = launcherGame ? [launcherGame] : [];
    if (!isLauncherBootstrapped("ubisoft-connect")) return games;
    const detected = scanInstalledUbisoftGames();
    if (detected.length === 0) return games;
    const driveC = import_path13.default.join(resolveSharedPrefixExecutionPath("ubisoft-connect"), "drive_c");
    const allExisting = getAllGames();
    const recentNotifications = notificationEngine.getRecent(200);
    for (const g of detected) {
      const nativeId = `ubisoft-${g.productId}`;
      const normalizedTarget = normalizeTitle(g.displayName);
      const alreadyOwnRow = allExisting.some((existing) => existing.id === nativeId);
      const crossStoreMatch = !alreadyOwnRow ? allExisting.find(
        (existing) => existing.id !== UBISOFT_CONNECT_GAME_ID && existing.store !== "Ubisoft" && normalizeTitle(existing.title) === normalizedTarget
      ) : void 0;
      if (crossStoreMatch) {
        if (crossStoreMatch.requiresLauncher === "ubisoft-connect") {
          pluginLog(`[UBISOFT] "${g.displayName}" installato nativamente \u2014 gi\xE0 collegato a "${crossStoreMatch.title}" (${crossStoreMatch.store}), nessuna azione necessaria.`, "info");
        } else {
          const alreadyAsked = recentNotifications.some(
            (n) => n.source === "shared-launcher-scan" && n.game_id === crossStoreMatch.id
          );
          if (!alreadyAsked) {
            notificationEngine.emit({
              type: "shared-launcher-native-game-found",
              launcherId: "ubisoft-connect",
              launcherName: "Ubisoft Connect",
              nativeTitle: g.displayName,
              targetGameId: crossStoreMatch.id,
              targetGameTitle: crossStoreMatch.title,
              targetStore: crossStoreMatch.store
            });
            pluginLog(`[UBISOFT] "${g.displayName}" installato nativamente \u2014 sembra corrispondere a "${crossStoreMatch.title}" (${crossStoreMatch.store}): notifica di collegamento inviata.`, "info");
          } else {
            pluginLog(`[UBISOFT] "${g.displayName}" installato nativamente \u2014 match con "${crossStoreMatch.title}" (${crossStoreMatch.store}) gi\xE0 proposto in precedenza, non ripropongo.`, "info");
          }
        }
        continue;
      }
      const exe = findExeInKnownDir(windowsPathToLinux(driveC, g.installDirWindows));
      games.push({
        id: nativeId,
        title: g.displayName,
        store: "Ubisoft",
        runner: resolveDefaultRunner(),
        isInstalled: true,
        playTimeHours: 0,
        coverImage: "",
        previewImage: "",
        description: "",
        tags: [],
        status: exe ? "Ready to Launch" : "Not Installed",
        executablePath: exe ?? void 0,
        prefixPath: getSharedPrefixBasePath("ubisoft-connect")
      });
    }
    return games;
  }
  /**
   * Crea la riga "Ubisoft Connect" in games se non esiste ancora.
   * Chiamata a ogni refresh libreria (come ogni plugin), ma upsertGame
   * non sovrascrive mai isInstalled/executablePath/runner di un gioco
   * già presente (stesso principio "insert once, protect on conflict"
   * già in uso per executable_path — vedi commento in db.ts) — quindi è
   * sicuro richiamarla sempre, non serve un flag "già seedato" a parte.
   */
  ensureSeeded() {
    if (getGameById(UBISOFT_CONNECT_GAME_ID)) return;
    const def = getThirdPartyLauncherDefinition("ubisoft-connect");
    upsertGame({
      id: UBISOFT_CONNECT_GAME_ID,
      title: def?.displayName ?? "Ubisoft Connect",
      store: "Ubisoft",
      // Risolto dinamicamente (vedi resolveDefaultRunner sopra) — l'utente
      // può comunque cambiarlo esplicitamente in Game Options (Runner
      // Bridge vincolato a sole build Proton per questo titolo).
      runner: resolveDefaultRunner(),
      isInstalled: false,
      playTimeHours: 0,
      coverImage: "",
      previewImage: "",
      description: "Launcher Ubisoft Connect \u2014 richiesto da alcuni giochi Ubisoft comprati su Epic, GOG o Amazon Games. Installalo una sola volta: verr\xE0 condiviso da tutti i giochi che lo richiedono.",
      tags: ["Launcher"],
      status: "Not Installed"
    });
  }
  async installGame(_id) {
    return { success: true, message: "Gestito da downloadManager (runUbisoftConnect)." };
  }
  async uninstallGame(_id) {
    return { success: true };
  }
  /**
   * v1.5.20-dev.10 — spostato qui da gameManager.ts (era un `if
   * (game.store === 'Ubisoft' && ...)` centrale hardcoded) — vedi
   * StorePlugin.onLauncherProcessClosed per il perché. Se il "gioco"
   * appena chiuso è Ubisoft Connect stesso e non è ancora bootstrappato,
   * il processo appena chiuso era l'INSTALLER (executablePath punta
   * ancora al file scaricato in Downloads, vedi
   * downloadManager.runThirdPartyLauncherInstall) — ora che l'utente lo
   * ha eseguito, cerchiamo il vero UbisoftConnect.exe dentro il prefix
   * condiviso e lo registriamo come bootstrappato.
   * BUG REALE TROVATO su hardware utente (invariato dalla versione
   * precedente): findMainExe() sull'intero drive_c prendeva un'utility
   * di sistema Wine (Explorer) invece del vero eseguibile —
   * findInstalledLauncherExe() restringe la ricerca a Program Files* e
   * prova prima l'hint dichiarato nel registro (thirdPartyLaunchers.ts).
   */
  async onLauncherProcessClosed(game) {
    if (game.id !== UBISOFT_CONNECT_GAME_ID || isLauncherBootstrapped("ubisoft-connect")) return;
    const realPrefixRoot = resolveSharedPrefixExecutionPath("ubisoft-connect");
    const driveC = import_path13.default.join(realPrefixRoot, "drive_c");
    const def = getThirdPartyLauncherDefinition("ubisoft-connect");
    const realExe = findInstalledLauncherExe(driveC, def?.executableRelPathHint);
    if (realExe) {
      updateGameConfig(game.id, { executablePath: realExe });
      const relExe = import_path13.default.relative(driveC, realExe);
      markLauncherBootstrapped("ubisoft-connect", game.runner ?? "Proton 8.0-4", relExe);
      pluginLog(`[UBISOFT] Bootstrap completato \u2014 eseguibile reale: ${realExe}`, "system");
    } else {
      pluginLog(`[UBISOFT] Eseguibile reale non trovato dopo la chiusura dell'installer \u2014 l'utente dovr\xE0 riprovare il lancio.`, "warning");
    }
  }
};

// src/backend/plugins/eaAppPlugin.ts
init_base2();
var import_path14 = __toESM(require("path"), 1);
var import_fs15 = require("fs");
var import_child_process14 = require("child_process");
init_db();
init_logger();
init_notificationEngine();
function pluginLog2(message, type = "system") {
  const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour12: false });
  insertLog({ timestamp, message, type });
  writeLog(type, message);
}
var EA_APP_GAME_ID = "ea-app-launcher";
function resolveDefaultRunner2() {
  const runners = compatibilityManager.getAvailableRunners().filter((r) => /proton/i.test(r.id));
  if (runners.length === 0) return "Proton 8.0-4";
  const steamProton = runners.find((r) => !/^GE-Proton|^Proton-GE/i.test(r.id));
  return (steamProton ?? runners[0]).id;
}
function reconcileEADesktopSymlink(driveC) {
  const eaDesktopDir = import_path14.default.join(driveC, "Program Files", "Electronic Arts", "EA Desktop");
  if (!(0, import_fs15.existsSync)(eaDesktopDir)) return;
  let entries;
  try {
    entries = (0, import_fs15.readdirSync)(eaDesktopDir);
  } catch {
    return;
  }
  const versionDirRegex = /^\d+\.\d+\.\d+\.\d+-\d+$/;
  const candidates = entries.filter((name) => versionDirRegex.test(name)).filter((name) => (0, import_fs15.existsSync)(import_path14.default.join(eaDesktopDir, name, "EA Desktop", "EADesktop.exe")));
  if (candidates.length === 0) return;
  candidates.sort((a, b) => a.localeCompare(b, void 0, { numeric: true, sensitivity: "base" }));
  const latest = candidates[candidates.length - 1];
  const source = import_path14.default.join(eaDesktopDir, latest, "EA Desktop");
  const target = import_path14.default.join(eaDesktopDir, "EA Desktop");
  try {
    (0, import_fs15.cpSync)(source, target, { recursive: true, force: true });
    pluginLog2(`[EA APP] Cartella "EA Desktop" stabile riconciliata da "${latest}" (bug Wine CreateSymbolicLinkW \u2014 vedi thirdPartyLaunchers.ts).`, "system");
  } catch (e) {
    pluginLog2(`[EA APP] Riconciliazione cartella "EA Desktop" fallita: ${e?.message ?? e}`, "warning");
  }
}
var normalizeTitle2 = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function scanInstalledEAGames() {
  const pfxRoot = resolveSharedPrefixExecutionPath("ea-app");
  const parsed = readWineReg(import_path14.default.join(pfxRoot, "system.reg"));
  if (parsed === null) {
    pluginLog2(`[EA APP] Scan libreria nativa: system.reg non trovato in ${import_path14.default.join(pfxRoot, "system.reg")}.`, "warning");
    return [];
  }
  if ("error" in parsed) {
    pluginLog2(`[EA APP] Scan libreria nativa: system.reg trovato ma il parsing \xE8 fallito \u2014 ${parsed.error}`, "error");
    return [];
  }
  const keys = parsed;
  pluginLog2(`[EA APP] Scan libreria nativa: ${keys.length} chiavi lette da system.reg.`, "info");
  const results = [];
  for (const k of keys) {
    if (!k.path.toLowerCase().includes("\\uninstall\\")) continue;
    if (k.values["Publisher"] !== "Electronic Arts") continue;
    const displayName = k.values["DisplayName"];
    const installLocation = k.values["InstallLocation"];
    if (!displayName || !installLocation) continue;
    const installLower = installLocation.toLowerCase();
    if (installLower.includes("electronic arts\\ea desktop") || installLower.includes("eainstaller")) {
      continue;
    }
    let exeHintWindows = null;
    const displayIcon = k.values["DisplayIcon"];
    if (displayIcon) {
      let cleaned = displayIcon.trim();
      if (cleaned.startsWith('"')) {
        const closingQuote = cleaned.indexOf('"', 1);
        cleaned = closingQuote !== -1 ? cleaned.slice(1, closingQuote) : cleaned.replace(/^"+|"+$/g, "");
      } else {
        cleaned = cleaned.replace(/,-?\d+$/, "");
      }
      if (cleaned.toLowerCase().endsWith(".exe")) exeHintWindows = cleaned;
    }
    results.push({ guid: lastPathSegment(k), title: displayName, installLocationWindows: installLocation, exeHintWindows });
  }
  pluginLog2(`[EA APP] Scan libreria nativa: ${results.length} giochi risolti con nome+percorso (Publisher "Electronic Arts", esclusi i componenti di EA Desktop stesso).`, "info");
  return results;
}
function windowsPathToLinux2(driveC, winPath) {
  const rel = winPath.replace(/^[a-zA-Z]:/, "").replace(/\\/g, "/").replace(/^\/+/, "");
  return import_path14.default.join(driveC, rel);
}
function findExeInKnownDir2(absoluteDir) {
  if (!(0, import_fs15.existsSync)(absoluteDir)) return null;
  try {
    const result = (0, import_child_process14.execSync)(
      `find "${absoluteDir}" -maxdepth 3 -iname "*.exe" ! -iname "unins*" ! -iname "*crashhandler*" ! -iname "*crashreporter*" ! -iname "vcredist*" ! -iname "vc_redist*" ! -iname "dxsetup*" ! -iname "*explorer*" ! -iname "*helper*" ! -iname "*updater*" | head -1`,
      { encoding: "utf-8", timeout: 8e3 }
    ).trim();
    return result || null;
  } catch {
    return null;
  }
}
var EAAppPlugin = class extends StorePlugin {
  id = "EA App";
  name = "EA App";
  drmFree = false;
  description = "EA App \u2014 launcher condiviso richiesto dai giochi EA comprati su altri store.";
  // Nessun tool CLI: l'installer si scarica a mano dal sito ufficiale
  // (vedi installerUrl in thirdPartyLaunchers.ts, verificato con
  // web_fetch prima di scriverlo — link diretto, non dietro un trigger
  // JavaScript come Ubisoft Connect).
  requiredTool = "";
  // Stesso principio già usato per Ubisoft Connect (e prima ancora per
  // SteamPlugin): "connesso" == il launcher condiviso è stato davvero
  // bootstrappato in shared-launchers/ (installer eseguito e primo
  // lancio riuscito, non solo la cartella creata).
  async isAuthenticated() {
    return isLauncherBootstrapped("ea-app");
  }
  async getLibrary() {
    this.ensureSeeded();
    const launcherGame = getGameById(EA_APP_GAME_ID);
    const games = launcherGame ? [launcherGame] : [];
    if (!isLauncherBootstrapped("ea-app")) return games;
    const detected = scanInstalledEAGames();
    if (detected.length === 0) return games;
    const driveC = import_path14.default.join(resolveSharedPrefixExecutionPath("ea-app"), "drive_c");
    const allExisting = getAllGames();
    const recentNotifications = notificationEngine.getRecent(200);
    for (const g of detected) {
      const nativeId = `ea-app-${g.guid.replace(/[{}]/g, "")}`;
      const normalizedTarget = normalizeTitle2(g.title);
      const alreadyOwnRow = allExisting.some((existing) => existing.id === nativeId);
      const crossStoreMatch = !alreadyOwnRow ? allExisting.find(
        (existing) => existing.id !== EA_APP_GAME_ID && existing.store !== "EA App" && normalizeTitle2(existing.title) === normalizedTarget
      ) : void 0;
      if (crossStoreMatch) {
        if (crossStoreMatch.requiresLauncher === "ea-app") {
          pluginLog2(`[EA APP] "${g.title}" installato nativamente \u2014 gi\xE0 collegato a "${crossStoreMatch.title}" (${crossStoreMatch.store}), nessuna azione necessaria.`, "info");
        } else {
          const alreadyAsked = recentNotifications.some(
            (n) => n.source === "shared-launcher-scan" && n.game_id === crossStoreMatch.id
          );
          if (!alreadyAsked) {
            notificationEngine.emit({
              type: "shared-launcher-native-game-found",
              launcherId: "ea-app",
              launcherName: "EA App",
              nativeTitle: g.title,
              targetGameId: crossStoreMatch.id,
              targetGameTitle: crossStoreMatch.title,
              targetStore: crossStoreMatch.store
            });
            pluginLog2(`[EA APP] "${g.title}" installato nativamente \u2014 sembra corrispondere a "${crossStoreMatch.title}" (${crossStoreMatch.store}): notifica di collegamento inviata.`, "info");
          } else {
            pluginLog2(`[EA APP] "${g.title}" installato nativamente \u2014 match con "${crossStoreMatch.title}" (${crossStoreMatch.store}) gi\xE0 proposto in precedenza, non ripropongo.`, "info");
          }
        }
        continue;
      }
      let exe = null;
      if (g.exeHintWindows) {
        const candidate = windowsPathToLinux2(driveC, g.exeHintWindows);
        if ((0, import_fs15.existsSync)(candidate)) exe = candidate;
      }
      if (!exe) {
        exe = findExeInKnownDir2(windowsPathToLinux2(driveC, g.installLocationWindows));
      }
      games.push({
        id: nativeId,
        title: g.title,
        store: "EA App",
        runner: resolveDefaultRunner2(),
        isInstalled: true,
        playTimeHours: 0,
        coverImage: "",
        previewImage: "",
        description: "",
        tags: [],
        status: exe ? "Ready to Launch" : "Not Installed",
        executablePath: exe ?? void 0,
        prefixPath: getSharedPrefixBasePath("ea-app")
      });
    }
    return games;
  }
  /**
   * Crea la riga "EA App" in games se non esiste ancora. Chiamata a ogni
   * refresh libreria (come ogni plugin), ma upsertGame non sovrascrive
   * mai isInstalled/executablePath/runner di un gioco già presente
   * (stesso principio "insert once, protect on conflict" già in uso per
   * executable_path — vedi commento in db.ts) — quindi è sicuro
   * richiamarla sempre, non serve un flag "già seedato" a parte.
   */
  ensureSeeded() {
    if (getGameById(EA_APP_GAME_ID)) return;
    const def = getThirdPartyLauncherDefinition("ea-app");
    upsertGame({
      id: EA_APP_GAME_ID,
      title: def?.displayName ?? "EA App",
      store: "EA App",
      runner: resolveDefaultRunner2(),
      isInstalled: false,
      playTimeHours: 0,
      coverImage: "",
      previewImage: "",
      description: "Launcher EA App \u2014 richiesto da alcuni giochi EA comprati su Epic, GOG, Amazon Games o Steam. Installalo una sola volta: verr\xE0 condiviso da tutti i giochi che lo richiedono.",
      tags: ["Launcher"],
      status: "Not Installed"
    });
  }
  async installGame(_id) {
    return { success: true, message: "Gestito da downloadManager (da estendere con runEAApp, sullo stesso modello di runUbisoftConnect)." };
  }
  async uninstallGame(_id) {
    return { success: true };
  }
  /**
   * Stessa identica logica di onLauncherProcessClosed() in
   * ubisoftConnectPlugin.ts — vedi quel file per il bug reale già
   * trovato lì (findMainExe() sull'intero drive_c prendeva un'utility
   * di sistema Wine invece del vero eseguibile) e per il perché questo
   * hook vive nel plugin invece che centralizzato in gameManager.ts
   * (StorePlugin.onLauncherProcessClosed).
   *
   * v2.0.41-dev.14 — reconcileEADesktopSymlink chiamata SEMPRE, non
   * solo al primo bootstrap: il problema che risolve (vedi commento
   * esteso su quella funzione) si ripresenta a ogni aggiornamento di
   * EA Desktop, non solo alla prima installazione — verificato leggendo
   * un resoconto pubblico dello stesso identico comportamento ricorrente
   * per un altro gioco EA. Il resto della funzione (rilevamento
   * eseguibile reale + markLauncherBootstrapped) resta invariato,
   * ancora una tantum solo al primo bootstrap.
   */
  async onLauncherProcessClosed(game) {
    if (game.id !== EA_APP_GAME_ID) return;
    const realPrefixRoot = resolveSharedPrefixExecutionPath("ea-app");
    const driveC = import_path14.default.join(realPrefixRoot, "drive_c");
    reconcileEADesktopSymlink(driveC);
    if (isLauncherBootstrapped("ea-app")) return;
    const def = getThirdPartyLauncherDefinition("ea-app");
    const realExe = findInstalledLauncherExe(driveC, def?.executableRelPathHint);
    if (realExe) {
      updateGameConfig(game.id, { executablePath: realExe });
      const relExe = import_path14.default.relative(driveC, realExe);
      markLauncherBootstrapped("ea-app", game.runner ?? "Proton 8.0-4", relExe);
      pluginLog2(`[EA APP] Bootstrap completato \u2014 eseguibile reale: ${realExe}`, "system");
    } else {
      pluginLog2(`[EA APP] Eseguibile reale non trovato dopo la chiusura dell'installer \u2014 l'utente dovr\xE0 riprovare il lancio.`, "warning");
    }
  }
};

// src/backend/gameManager.ts
init_classicPlugin();
init_activeDisplay();
init_implementations();

// src/backend/metadataManager.ts
init_logger();
var SGDB_BASE = "https://www.steamgriddb.com/api/v2";
var IGDB_BASE = "https://api.igdb.com/v4";
var TWITCH_TOKEN = "https://id.twitch.tv/oauth2/token";
var COVER_PLACEHOLDER3 = "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=400&h=533";
var PREVIEW_PLACEHOLDER3 = "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=800&h=450";
var MAX_CONCURRENT = 3;
var REQUEST_DELAY = 200;
var SGDB_KEY = process.env.STEAMGRIDDB_API_KEY ?? "";
var IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID ?? "";
var IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET ?? "";
var igdbToken = null;
var igdbTokenExpiry = 0;
async function getIgdbToken() {
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) return null;
  if (igdbToken && Date.now() < igdbTokenExpiry) return igdbToken;
  try {
    const res = await fetch(
      `${TWITCH_TOKEN}?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: "POST", signal: AbortSignal.timeout(1e4) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    igdbToken = data.access_token;
    igdbTokenExpiry = Date.now() + (data.expires_in - 3600) * 1e3;
    return igdbToken;
  } catch {
    return null;
  }
}
async function sgdbSearchGame(title) {
  if (!SGDB_KEY) return null;
  try {
    const res = await fetch(
      `${SGDB_BASE}/search/autocomplete/${encodeURIComponent(title)}`,
      { headers: { Authorization: `Bearer ${SGDB_KEY}` }, signal: AbortSignal.timeout(8e3) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.success && data.data.length > 0 ? data.data[0].id : null;
  } catch {
    return null;
  }
}
async function sgdbGetCover(gameId) {
  if (!SGDB_KEY) return null;
  try {
    const [posterRes, heroRes] = await Promise.all([
      fetch(`${SGDB_BASE}/grids/game/${gameId}?dimensions=600x900,460x215,342x482&limit=1`, {
        headers: { Authorization: `Bearer ${SGDB_KEY}` },
        signal: AbortSignal.timeout(8e3)
      }),
      fetch(`${SGDB_BASE}/heroes/game/${gameId}?limit=1`, {
        headers: { Authorization: `Bearer ${SGDB_KEY}` },
        signal: AbortSignal.timeout(8e3)
      })
    ]);
    const posterData = posterRes.ok ? await posterRes.json() : null;
    const heroData = heroRes.ok ? await heroRes.json() : null;
    const cover = posterData?.success && posterData.data.length > 0 ? posterData.data[0].url : null;
    const hero = heroData?.success && heroData.data.length > 0 ? heroData.data[0].url : null;
    if (!cover && !hero) return null;
    return {
      coverImage: cover ?? hero ?? COVER_PLACEHOLDER3,
      previewImage: hero ?? cover ?? PREVIEW_PLACEHOLDER3
    };
  } catch {
    return null;
  }
}
async function igdbSearch(title) {
  const token = await getIgdbToken();
  if (!token) return null;
  try {
    const body = `search "${title.replace(/"/g, "")}"; fields name,summary,rating,first_release_date,genres.name,game_modes.name,cover.url; limit 1;`;
    const res = await fetch(`${IGDB_BASE}/games`, {
      method: "POST",
      headers: {
        "Client-ID": IGDB_CLIENT_ID,
        "Authorization": `Bearer ${token}`,
        "Content-Type": "text/plain"
      },
      body,
      signal: AbortSignal.timeout(8e3)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.length > 0 ? data[0] : null;
  } catch {
    return null;
  }
}
async function hltbSearch(title) {
  try {
    const { HowLongToBeatService } = await import("howlongtobeat");
    const service = new HowLongToBeatService();
    const results = await service.search(title);
    if (!results || results.length === 0) return null;
    const r = results[0];
    return {
      main: Math.round(r.gameplayMain ?? 0),
      completionist: Math.round(r.gameplayCompletionist ?? 0)
    };
  } catch {
    return null;
  }
}
var RequestQueue = class {
  running = 0;
  queue = [];
  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          this.next();
        }
      });
      this.next();
    });
  }
  next() {
    if (this.running >= MAX_CONCURRENT || this.queue.length === 0) return;
    this.running++;
    const task = this.queue.shift();
    setTimeout(() => task(), REQUEST_DELAY);
  }
};
var requestQueue = new RequestQueue();
function deterministicFallback(game) {
  const seed = game.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const allGenres = ["Action", "RPG", "Adventure", "Strategy", "Simulation", "Shooter", "Platformer", "Indie"];
  return {
    rating: 75 + seed % 25,
    genres: [allGenres[seed % allGenres.length]],
    hltbHours: { main: 10 + seed % 40, completionist: 50 + seed % 80 },
    achievements: { unlocked: seed % 20, total: 50 }
  };
}
function hasRealCover(game) {
  return !!(game.coverImage && game.coverImage !== COVER_PLACEHOLDER3 && !game.coverImage.includes("unsplash.com"));
}
function hasRealMetadata(game) {
  return !!(game.rating && game.rating > 0 && game.genres?.length);
}
var MetadataManager = class {
  cache = /* @__PURE__ */ new Map();
  /**
   * @param force Salta sia la cache in memoria sia lo skip "ha già
   * metadati reali" — usato dal rifetch immediato dopo un override
   * manuale del titolo di ricerca (scrapeTitle), dove il gioco potrebbe
   * già avere un cover/rating (sbagliati, dallo scraping automatico col
   * nome ROM) che altrimenti farebbero saltare del tutto il nuovo fetch.
   */
  async enrichGameMetadata(game, force = false) {
    if (force) {
      this.cache.delete(game.id);
    } else if (this.cache.has(game.id)) {
      const cached2 = this.cache.get(game.id);
      return {
        ...game,
        coverImage: cached2.coverImage,
        previewImage: cached2.previewImage,
        rating: cached2.rating,
        genres: cached2.genres,
        description: cached2.description,
        releaseDate: cached2.releaseDate,
        hltbHours: cached2.hltbHours,
        achievements: cached2.achievements
      };
    }
    if (!force && hasRealMetadata(game) && hasRealCover(game)) {
      this.cache.set(game.id, game);
      return game;
    }
    const enriched = { ...game };
    const apisConfigured = !!(SGDB_KEY || IGDB_CLIENT_ID && IGDB_CLIENT_SECRET);
    if (!apisConfigured) {
      const fallback = deterministicFallback(game);
      if (!enriched.rating) enriched.rating = fallback.rating;
      if (!enriched.genres?.length) enriched.genres = fallback.genres;
      if (!enriched.hltbHours) enriched.hltbHours = fallback.hltbHours;
      if (!enriched.achievements) enriched.achievements = fallback.achievements;
      this.cache.set(game.id, enriched);
      return enriched;
    }
    await requestQueue.add(async () => {
      const searchTitle = (game.scrapeTitle || game.title).replace(/\s*\([^)]*\)\s*$/, "").trim();
      if ((force || !hasRealCover(game)) && SGDB_KEY) {
        const sgdbId = await sgdbSearchGame(searchTitle);
        if (sgdbId) {
          const images = await sgdbGetCover(sgdbId);
          if (images) {
            enriched.coverImage = images.coverImage;
            enriched.previewImage = images.previewImage;
            writeLog("info", `[METADATA] \u2705 Cover SGDB: ${searchTitle}`);
          } else {
            writeLog("info", `[METADATA] \u26A0 SGDB cover not found: ${searchTitle}`);
          }
        } else {
          writeLog("info", `[METADATA] \u26A0 SGDB game not found: ${searchTitle}`);
        }
      }
      if ((force || !hasRealMetadata(game)) && IGDB_CLIENT_ID) {
        const token = await getIgdbToken();
        if (!token) {
          writeLog("warning", `[METADATA] \u274C IGDB token not obtained \u2014 check IGDB_CLIENT_ID and IGDB_CLIENT_SECRET`);
        } else {
          const igdbData = await igdbSearch(searchTitle);
          if (igdbData) {
            if ((force || !enriched.rating) && igdbData.rating) enriched.rating = Math.round(igdbData.rating);
            if ((force || !enriched.genres?.length) && igdbData.genres?.length) enriched.genres = igdbData.genres.map((g) => g.name);
            if ((force || !enriched.description) && igdbData.summary) enriched.description = igdbData.summary;
            if ((force || !enriched.releaseDate) && igdbData.first_release_date) enriched.releaseDate = new Date(igdbData.first_release_date * 1e3).toISOString();
            if (game.scrapeTitle && igdbData.name) enriched.title = igdbData.name;
            writeLog("info", `[METADATA] \u2705 IGDB: ${game.title} \u2014 rating:${enriched.rating} genres:${enriched.genres?.join(",")}`);
          } else {
            writeLog("info", `[METADATA] \u26A0 IGDB no results: ${game.title}`);
          }
        }
      }
      if (force || !enriched.hltbHours) {
        const hltb = await hltbSearch(searchTitle);
        if (hltb) enriched.hltbHours = hltb;
      }
      if (!enriched.achievements) {
        const seed = game.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
        enriched.achievements = { unlocked: seed % 20, total: 50 };
      }
    });
    this.cache.set(game.id, enriched);
    return enriched;
  }
  invalidate(gameId) {
    this.cache.delete(gameId);
  }
  clearCache() {
    this.cache.clear();
  }
};
if (SGDB_KEY) writeLog("info", "[METADATA] SteamGridDB: \u2705 API key configured");
else writeLog("info", "[METADATA] SteamGridDB: \u26A0 no API key \u2014 placeholder covers");
if (IGDB_CLIENT_ID && IGDB_CLIENT_SECRET) writeLog("info", "[METADATA] IGDB: \u2705 credentials configured");
else writeLog("info", "[METADATA] IGDB: \u26A0 no credentials \u2014 deterministic metadata");
var metadataManager = new MetadataManager();

// src/backend/gameManager.ts
init_db();
init_logger();
init_notificationEngine();
init_attemptTracker();
init_processManager();
function shellSplitArgs(args) {
  const result = [];
  let current = "";
  let inQuote = null;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === " ") {
      if (current.length > 0) {
        result.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) result.push(current);
  return result.map((a) => a.replace(/\\/g, "/"));
}
var GameManager = class _GameManager {
  plugins = [
    new GOGPlugin(),
    new SteamPlugin(),
    new EpicPlugin(),
    new AmazonPlugin(),
    new BattlenetPlugin(),
    new UbisoftConnectPlugin(),
    new EAAppPlugin(),
    new ClassicPlugin()
  ];
  // v0.99.35 — tracking dell'ultimo gioco lanciato, per la feature
  // systray (minimizza dashboard durante il gioco, ripristina alla
  // chiusura). Il processo gioco è spawnato con detached:true +
  // unref() (vedi spawnDetached in runners/implementations.ts) — per
  // design, il daemon non deve aspettare che il gioco chiuda per
  // terminare lui stesso. Questo significa che Node non riceve mai un
  // evento 'exit' per quel processo: l'unico modo per sapere se è
  // ancora vivo è controllare /proc/<pid> a richiesta (vedi
  // isLastLaunchedGameRunning), non un listener passivo.
  lastLaunchedGame = null;
  // v2.0.41-dev.7 — richiesta utente: la card "Steam Big Picture" deve
  // minimizzare X-Launcher al lancio (stesso comportamento di qualunque
  // gioco reale) e farlo ritornare in primo piano al rientro — ma Big
  // Picture NON è un gioco lanciato da questo daemon (non c'è alcun
  // processo figlio nostro da tracciare: `steam steam://open/bigpicture`
  // si limita a segnalare a un client Steam che potrebbe già essere in
  // esecuzione, vedi endpoint in server.ts). Stato dedicato, del tutto
  // separato da lastLaunchedGame sopra — niente notifiche di validazione/
  // "did it work", niente polling di uscita per nome processo: quella
  // macchina è pensata per un vero gioco lanciato da noi, riusarla qui
  // produrrebbe prompt/notifiche senza senso per un semplice switch di
  // modalità del client Steam. isLastLaunchedGameRunning() sotto la
  // combina con lastLaunchedGame SOLO ai fini del booleano `running` che
  // tray.py legge per nascondere/ripristinare la finestra — tray.py non
  // usa gameId/gameTitle per quella decisione (solo per il suo menu
  // "giochi recenti", che non riguarda comunque questo caso).
  bigPictureActive = false;
  /** Chiamato da POST /api/system/steam-bigpicture — vedi bigPictureActive sopra. */
  notifyBigPictureLaunched() {
    this.bigPictureActive = true;
    this.addLog("[SYSTEM] Steam Big Picture: tracciato come attivo \u2014 la finestra Dashboard verr\xE0 nascosta dal tray.", "system");
  }
  /** Chiamato dal punto di rientro da Big Picture — vedi bigPictureActive sopra. */
  notifyBigPictureClosed() {
    this.bigPictureActive = false;
    this.addLog("[SYSTEM] Steam Big Picture: tracciato come chiuso \u2014 la finestra Dashboard verr\xE0 ripristinata dal tray.", "system");
  }
  // v1.1.32 — quanto tempo dare al processo del gioco per comparire la
  // PRIMA volta prima di trattare "non trovato" come un vero fallimento
  // di avvio. Scoperto con SIFU/Proton: il poll (ogni 4s, timer già
  // attivo da un lancio precedente) può scattare anche solo 20-50ms dopo
  // l'avvio di legendary — l'autenticazione EOS online e il bootstrap di
  // Proton richiedono diversi secondi prima che l'eseguibile Windows
  // vero e proprio compaia nell'elenco processi. Senza questa soglia,
  // "non ancora partito" veniva confuso con "non è mai partito".
  static PROCESS_NAME_STARTUP_GRACE_MS = 3e4;
  // v1.1.33 — inibitore screensaver/gestione energetica durante il
  // gioco. Un ChildProcess "sentinella" tenuto vivo per tutta la
  // sessione: se il demone stesso crashasse, il processo sentinella
  // morirebbe con lui (non è detached/unref) e systemd-inhibit
  // rilascerebbe l'inibizione automaticamente — nessun rischio di
  // restare bloccati con lo screensaver disattivato per sempre anche in
  // caso di crash, a differenza di un approccio "xset s off" seguito da
  // un "xset s on" che potrebbe non venire mai eseguito.
  screensaverInhibitProcess = null;
  /**
   * Verifica se l'ultimo gioco lanciato è ancora in esecuzione,
   * controllando se il PID esiste ancora nel sistema. Usato dallo
   * script systray per decidere quando nascondere/ripristinare la
   * finestra della dashboard.
   *
   * v0.99.90 — FIX BUG: prima azzerava lastLaunchedGame internamente non
   * appena rilevava il processo morto — un effetto collaterale
   * distruttivo che qualunque chiamante esterno (incluso /api/system/
   * game-running, richiamabile in qualunque momento) poteva innescare
   * per primo, "consumando" la transizione prima che startGameExitPolling
   * avesse la possibilità di elaborarla (rilevamento fallimento rapido /
   * prompt di validazione). Bug reale riscontrato: una semplice curl di
   * diagnostica manuale ha silenziosamente impedito la segnalazione di
   * un lancio fallito. Ora è di sola lettura — l'azzeramento dello stato
   * è responsabilità esclusiva di startGameExitPolling, fatto atomicamente
   * insieme all'elaborazione della transizione, non prima.
   */
  // v2.0.41-dev.25 — richiesta utente, bug reale confermato su hardware
  // reale (LEGO Indiana Jones + Gamescope): un `pgrep -f <hint>` da solo
  // trova ANCHE "gamescopereaper", il processo interno di Gamescope che
  // sorveglia i propri figli — che continua a mostrare la riga di
  // comando ORIGINALE (compreso il nome dell'eseguibile del gioco) come
  // proprio argomento anche dopo che il vero processo di gioco è
  // terminato (osservato dall'utente: gioco chiuso, ma
  // "gamescopereaper -- .../LEGOIndy.exe" restava comunque in `ps`,
  // Dashboard mai tornata a schermo intero). Un match che proviene SOLO
  // da gamescopereaper non conta come "il gioco è ancora aperto" — si
  // verifica il nome reale (comm) di ogni PID trovato, non ci si ferma
  // al solo esito di pgrep.
  // v2.0.41-dev.28 — richiesta utente, bug reale confermato su hardware
  // reale (LEGO Indiana Jones + Gamescope, dopo che il gioco funzionava
  // correttamente): dopo la chiusura del gioco resta attivo un processo
  // Gamescope che non riporta mai la Dashboard in primo piano. Causa: il
  // filtro qui sotto escludeva solo `gamescopereaper` (dev.25) — ma
  // `gamescope` STESSO (il compositore vero e proprio, non solo il suo
  // processo di sorveglianza interno) ha la propria riga di comando che
  // contiene anch'essa il nome dell'eseguibile del gioco (è lui che lo
  // invoca: `gamescope ... -- proton run LEGOIndy.exe`) — e può restare
  // vivo come guscio vuoto anche dopo che il gioco vero è terminato,
  // senza chiudersi da solo. `comm !== 'gamescopereaper'` da solo non
  // bastava a escluderlo. Esteso a entrambi i nomi processo. In più: se
  // gli UNICI match trovati sono processi della famiglia Gamescope (non
  // il gioco vero), li termina esplicitamente qui — altrimenti anche
  // correggendo solo il tracciamento interno, la SUA finestra (spesso a
  // schermo intero) resterebbe comunque visibile sopra la Dashboard
  // ripristinata, un problema visivo reale, non solo di bookkeeping.
  pgrepGameStillRunning(hint) {
    let pids;
    try {
      pids = (0, import_child_process16.execSync)(`pgrep -f -- "${hint}"`, { encoding: "utf-8", stdio: "pipe" }).trim().split("\n").filter(Boolean);
    } catch {
      this.addLog(`[DIAG] pgrepGameStillRunning("${hint}"): pgrep -f non ha trovato alcun processo.`, "debug");
      return false;
    }
    const diagEntries = pids.map((pid) => {
      try {
        const cmdline = (0, import_child_process16.execSync)(`ps -o args= -p ${pid}`, { encoding: "utf-8", stdio: "pipe" }).trim();
        return `pid=${pid} cmdline="${cmdline}"`;
      } catch {
        return `pid=${pid} (sparito prima di poter leggere la cmdline \u2014 race normale fra pgrep e ps)`;
      }
    });
    this.addLog(`[DIAG] pgrepGameStillRunning("${hint}"): pgrep -f ha trovato ${pids.length} PID \u2014 ${diagEntries.join(" | ")}`, "debug");
    const gamescopeFamilyPids = [];
    for (const pid of pids) {
      try {
        const comm = (0, import_child_process16.execSync)(`ps -o comm= -p ${pid}`, { encoding: "utf-8", stdio: "pipe" }).trim();
        if (comm.startsWith("gamescope")) {
          gamescopeFamilyPids.push(pid);
          continue;
        }
        if (comm) return true;
      } catch {
      }
    }
    for (const pid of gamescopeFamilyPids) {
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {
      }
    }
    this.addLog(`[DIAG] pgrepGameStillRunning("${hint}"): nessun processo reale (non-Gamescope) trovato fra i ${pids.length} PID sopra \u2014 ritorno false.`, "debug");
    return false;
  }
  isLastLaunchedGameRunning() {
    if (this.bigPictureActive) {
      return { running: true, gameId: "steam-bigpicture-launcher", gameTitle: "Steam Big Picture" };
    }
    if (!this.lastLaunchedGame) return { running: false };
    const hasPreciseNameCheck = !!this.lastLaunchedGame.processNameHint;
    const hasScope = !!this.lastLaunchedGame.unit;
    if (hasPreciseNameCheck || hasScope) {
      const stillAlive = hasScope ? hasPreciseNameCheck ? isRealProcessAliveInScope(this.lastLaunchedGame.unit, this.lastLaunchedGame.processNameHint) : getScopePids(this.lastLaunchedGame.unit).length > 0 : this.pgrepGameStillRunning(this.lastLaunchedGame.processNameHint);
      this.addLog(`[DIAG] isLastLaunchedGameRunning("${this.lastLaunchedGame.gameTitle}"): hasScope=${hasScope} hasPreciseNameCheck=${hasPreciseNameCheck} stillAlive=${stillAlive}`, "debug");
      if (stillAlive) {
        this.lastLaunchedGame.processNameSeenAtLeastOnce = true;
        return { running: true, gameId: this.lastLaunchedGame.gameId, gameTitle: this.lastLaunchedGame.gameTitle };
      } else {
        if (!this.lastLaunchedGame.processNameSeenAtLeastOnce) {
          const stillLoading = hasScope ? isScopeActive(this.lastLaunchedGame.unit) : Date.now() - this.lastLaunchedGame.launchedAt < _GameManager.PROCESS_NAME_STARTUP_GRACE_MS;
          if (stillLoading) {
            return { running: true, gameId: this.lastLaunchedGame.gameId, gameTitle: this.lastLaunchedGame.gameTitle };
          }
        }
        return { running: false };
      }
    }
    try {
      process.kill(this.lastLaunchedGame.pid, 0);
      return { running: true, gameId: this.lastLaunchedGame.gameId, gameTitle: this.lastLaunchedGame.gameTitle };
    } catch {
      return { running: false };
    }
  }
  /**
   * v2.1.10-dev.10 — Punto 2 roadmap: espone lo scope/PID del gioco
   * tracciato, senza esporre l'intero `lastLaunchedGame` privato. Usato
   * da windowFocus.ts per correlare la finestra X11 del gioco al
   * processo reale (via cgroup dello scope, stesso principio già usato
   * da isRealProcessAliveInScope per distinguere il gioco vero dal
   * wrapper Proton/umu-run) invece di un ciclo generico fra tutte le
   * finestre aperte — quello si è rivelato inaffidabile su hardware
   * reale (vedi CHANGELOG-5.md, dev.7/dev.8/dev.9): il punto di partenza
   * più comune del ciclo, la Dashboard stessa, ricade sempre sullo
   * stesso ripiego arbitrario (il primo elemento di `wmctrl -l`),
   * qualunque esso sia — nei log reali, il desktop, mai il gioco.
   * `unit` è assente per i lanci via URI Steam (mai avvolti in uno scope
   * systemd, per lo stesso motivo per cui isLastLaunchedGameRunning usa
   * lì un ramo diverso) — in quel caso il chiamante può solo ricadere
   * sul `pid` diretto, meno affidabile ma comunque un punto di partenza.
   */
  getLastLaunchedGameProcessInfo() {
    if (!this.lastLaunchedGame) return null;
    return { unit: this.lastLaunchedGame.unit, pid: this.lastLaunchedGame.pid };
  }
  // v1.1.33 — su richiesta: durante una sessione di gioco (specialmente
  // con solo controller, senza mouse/tastiera a resettare il timer di
  // inattività) lo screensaver/DPMS spegneva lo schermo e bloccava la
  // sessione, richiedendo la password per rientrare — un problema serio
  // per un setup HTPC pensato per essere usato dal divano.
  //
  // Doppio livello, per coprire sia il meccanismo X11 diretto sia quello
  // più moderno basato su logind (varia a seconda di come XFCE/la
  // distribuzione hanno configurato screensaver e blocco sessione):
  // 1) `xset s off -dpms` — disattiva l'estensione screensaver X11 e lo
  //    spegnimento automatico del monitor. La maggior parte dei
  //    screensaver/blocca-schermo su X11 (incluso xfce4-screensaver/
  //    light-locker in molte configurazioni) osservano il timer di
  //    inattività di questa stessa estensione.
  // 2) `systemd-inhibit --what=idle:sleep:handle-lid-switch` — copre il
  //    caso in cui sospensione/blocco siano invece gestiti da logind
  //    indipendentemente da X11. Il processo "sentinella" (sleep
  //    infinity) tiene viva l'inibizione finché non viene terminato.
  startScreensaverInhibit(gameTitle) {
    if (this.screensaverInhibitProcess) return;
    const home = process.env.HOME ?? require("os").homedir();
    const existingPath = process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin";
    const x11Env = {
      ...process.env,
      ...getActiveDisplayEnv(),
      PATH: [`${home}/.local/bin`, "/usr/local/bin", "/usr/bin", "/bin", existingPath].join(":")
    };
    let xsetOk = false;
    try {
      (0, import_child_process16.execFileSync)("xset", ["s", "off"], { stdio: "ignore", env: x11Env });
      (0, import_child_process16.execFileSync)("xset", ["-dpms"], { stdio: "ignore", env: x11Env });
      xsetOk = true;
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") {
        this.addLog("[POWER] xset non trovato (n\xE9 nel PATH ricostruito) \u2014 probabile pacchetto mancante. Su Arch: sudo pacman -S xorg-xset", "error");
      } else {
        this.addLog(`[POWER] xset fallito (DISPLAY=${x11Env.DISPLAY}): ${err instanceof Error ? err.message : err}`, "error");
      }
    }
    try {
      const child = (0, import_child_process16.spawn)("systemd-inhibit", [
        "--what=idle:sleep:handle-lid-switch",
        "--who=X-Launcher",
        `--why=${gameTitle} in esecuzione`,
        "--mode=block",
        "sleep",
        "infinity"
      ], { stdio: "ignore" });
      child.on("error", () => {
        this.screensaverInhibitProcess = null;
      });
      this.screensaverInhibitProcess = child;
      this.addLog(`[POWER] Screensaver/sospensione inibiti \u2014 ${gameTitle} in esecuzione. (xset: ${xsetOk ? "ok" : "FALLITO \u2014 vedi sopra"})`, "system");
    } catch {
      this.screensaverInhibitProcess = null;
    }
  }
  stopScreensaverInhibit() {
    const x11Env = { ...process.env, ...getActiveDisplayEnv() };
    try {
      (0, import_child_process16.execFileSync)("xset", ["s", "on"], { stdio: "ignore", env: x11Env });
      (0, import_child_process16.execFileSync)("xset", ["+dpms"], { stdio: "ignore", env: x11Env });
    } catch {
    }
    if (this.screensaverInhibitProcess) {
      try {
        this.screensaverInhibitProcess.kill();
      } catch {
      }
      this.screensaverInhibitProcess = null;
      this.addLog("[POWER] Screensaver/sospensione ripristinati.", "system");
    }
  }
  // v0.99.38 — test protocol: rilevamento chiusura per il prompt di
  // validazione "ha funzionato?" (vedi notificationEngine.ts,
  // 'validation-prompt'). Stesso limite già documentato sopra: il
  // processo di gioco è detached+unref, niente evento 'exit' nativo,
  // quindi polling con process.kill(pid, 0) è l'unico modo. Riusa
  // isLastLaunchedGameRunning (che già nullifica lastLaunchedGame quando
  // il processo non risponde più) — qui aggiungiamo solo la rilevazione
  // della TRANSIZIONE running→non-running e l'emissione dell'evento,
  // in modo indipendente da tray.py (che potrebbe non essere configurato,
  // vedi venv .venv-tray) o dal frontend (che oggi non interroga affatto
  // /api/system/game-running).
  gameExitPollTimer = null;
  // v0.99.90 — soglia sotto la quale una chiusura è considerata "sospetta"
  // (probabile fallimento di avvio) invece che una sessione di gioco
  // normale. Scoperto con Bioshock 2 (eseguibile rinominato in .bak): wine
  // riesce comunque a partire (PID assegnato, spawn riuscito) ma non
  // trova il file e termina quasi subito — senza questa soglia, quel
  // caso veniva trattato come "il gioco ha girato e si è chiuso
  // normalmente", nessun errore mai catturato. 8s è generoso rispetto al
  // tempo che un vero avvio di gioco impiega anche nel caso più lento
  // (caricamento shader/asset iniziali), ma breve abbastanza da
  // distinguere chiaramente un crash immediato da una sessione reale.
  static QUICK_EXIT_THRESHOLD_MS = 8e3;
  startGameExitPolling() {
    if (this.gameExitPollTimer) return;
    this.gameExitPollTimer = setInterval(async () => {
      try {
        const before = this.lastLaunchedGame;
        if (!before) return;
        const check = this.isLastLaunchedGameRunning();
        if (check.running) return;
        const game = getGameById(before.gameId);
        if (!game) return;
        const isThisGameASharedLauncherApp = THIRD_PARTY_LAUNCHERS.some((l) => `${l.id}-launcher` === game.id);
        const effectiveSharedLauncherId = isThisGameASharedLauncherApp ? void 0 : game.requiresLauncher ?? getThirdPartyLauncherByStoreId(game.store)?.id;
        const elapsedMs = Date.now() - before.launchedAt;
        const installDirName = game.executablePath ? game.executablePath.split("/").slice(-2, -1)[0] : null;
        let realProcessStillRunning = false;
        if (installDirName) {
          realProcessStillRunning = this.pgrepGameStillRunning(installDirName);
        }
        this.addLog(`[DIAG] Controllo chiusura "${before.gameTitle}": installDirName="${installDirName}" elapsedMs=${elapsedMs} realProcessStillRunning=${realProcessStillRunning} effectiveSharedLauncherId=${effectiveSharedLauncherId ?? "nessuno"}`, "debug");
        const quickExitThresholdMs = effectiveSharedLauncherId ? _GameManager.QUICK_EXIT_THRESHOLD_MS * 3 : _GameManager.QUICK_EXIT_THRESHOLD_MS;
        if (realProcessStillRunning && elapsedMs < quickExitThresholdMs) {
          this.addLog(`[LAUNCH] ${before.gameTitle}: processo tracciato chiuso dopo ${Math.round(elapsedMs / 1e3)}s, ma processi reali ancora attivi in "${installDirName}" \u2014 probabile fase di caricamento, non ancora una chiusura. In attesa del prossimo controllo.`, "system");
          return;
        }
        this.lastLaunchedGame = null;
        this.stopScreensaverInhibit();
        if (elapsedMs < quickExitThresholdMs) {
          let logContent = "";
          if (before.logPath) {
            try {
              logContent = (0, import_fs18.readFileSync)(before.logPath, "utf-8").trim();
            } catch (err) {
            }
          }
          const errorText = logContent || "Il processo si \xE8 chiuso pochi secondi dopo l'avvio, senza output catturato su stdout/stderr.";
          this.addLog(`[LAUNCH] ${before.gameTitle} chiuso dopo ${Math.round(elapsedMs / 1e3)}s \u2014 trattato come fallimento di avvio.`, "error");
          const dumpResidualProcesses = (label) => {
            try {
              const { execSync: execSync15 } = require("child_process");
              const procs = execSync15(`ps aux | grep -iE "wine|ubisoft" | grep -v grep || true`, { encoding: "utf-8" }).trim();
              this.addLog(
                procs ? `[LAUNCH-DEBUG] (${label}) Processi wine/ubisoft attivi:
${procs}` : `[LAUNCH-DEBUG] (${label}) Nessun processo wine/ubisoft trovato.`,
                "system"
              );
            } catch (err) {
              this.addLog(`[LAUNCH-DEBUG] (${label}) Verifica processi non riuscita: ${err}`, "system");
            }
          };
          dumpResidualProcesses("T+0s, subito dopo la chiusura tracciata");
          setTimeout(() => dumpResidualProcesses("T+6s, ritardato"), 6e3);
          notificationEngine.emit({ type: "launch-error", gameId: before.gameId, gameTitle: before.gameTitle, error: errorText });
          return;
        }
        addPlayTime(before.gameId, elapsedMs / (1e3 * 60 * 60));
        this.notifyLibraryRefreshed();
        const ownerPlugin = this.plugins.find((p) => p.id === game.store);
        if (ownerPlugin) await ownerPlugin.onLauncherProcessClosed(game);
        if (effectiveSharedLauncherId) {
          if (before.unit) {
            const killResult = killScope(before.unit);
            this.addLog(
              killResult.success ? `[LAUNCH] ${before.gameTitle}: catena di lancio terminata per intero (launcher condiviso "${effectiveSharedLauncherId}" incluso, era solo autenticatore per questo gioco).` : `[LAUNCH] Terminazione scope fallita per ${before.gameTitle}: ${killResult.message}`,
              killResult.success ? "system" : "warning"
            );
          } else if (isSharedLauncherRunning(effectiveSharedLauncherId)) {
            const launcherDef = getThirdPartyLauncherDefinition(effectiveSharedLauncherId);
            notificationEngine.emit({
              type: "shared-launcher-idle",
              gameId: before.gameId,
              gameTitle: before.gameTitle,
              launcherId: effectiveSharedLauncherId,
              launcherName: launcherDef?.displayName ?? effectiveSharedLauncherId
            });
          }
        }
        if (game.verified) {
          return;
        }
        this.addLog(`[VALIDATE] ${before.gameTitle} chiuso \u2014 richiesta conferma funzionamento.`, "system");
        notificationEngine.emit({ type: "validation-prompt", gameId: before.gameId, gameTitle: before.gameTitle });
      } catch (err) {
        writeLog("error", `[VALIDATE] Error while polling for close: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 4e3);
  }
  // Refresh periodico in background mentre il daemon è attivo (v0.99.2,
  // rilassato in v0.99.4): rete di sicurezza per chi resta fermo a lungo su
  // una libreria — il refresh "primario" ora avviene on-demand dal frontend
  // ad ogni apertura/cambio di libreria (vedi POST /api/library/refresh in
  // server.ts e la useEffect su activeStore in App.tsx), quindi questo timer
  // non deve più essere aggressivo: 5 minuti bastano come backstop senza
  // bombardare le CLI di Epic/GOG con chiamate ravvicinate per chi non sta
  // nemmeno guardando quegli store in quel momento.
  libraryRefreshTimer = null;
  LIBRARY_REFRESH_INTERVAL_MS = 5 * 6e4;
  staticRunners = /* @__PURE__ */ new Map([
    ["Wine-Lutris", new WineRunner()],
    ["DOSBox", new DOSBoxRunner()],
    ["RetroArch", new RetroArchRunner()],
    ["ScummVM", new ScummVMRunner()],
    ["Steam Native", new SteamNativeRunner()]
  ]);
  protonRunners = /* @__PURE__ */ new Map();
  libraryRefreshedCallbacks = [];
  libraryReady;
  onLibraryRefreshed(cb) {
    this.libraryRefreshedCallbacks.push(cb);
  }
  notifyLibraryRefreshed() {
    for (const cb of this.libraryRefreshedCallbacks) {
      try {
        cb();
      } catch {
      }
    }
  }
  constructor() {
    this.libraryReady = this.init();
    downloadManager.setRunningGameChecker((gameId) => {
      const check = this.isLastLaunchedGameRunning();
      return check.running && check.gameId === gameId;
    });
    this.startGameExitPolling();
    downloadManager.addListener((task) => {
      upsertDownload(task);
      if (task.status === "completed") {
        updateGameStatus(task.gameId, true, "Ready to Launch");
        const configUpdate = {};
        if (task.executablePath) configUpdate.executablePath = task.executablePath;
        if (task.prefixPath) configUpdate.prefixPath = task.prefixPath;
        if (task.launchArgs) configUpdate.launchArgs = task.launchArgs;
        if (task.launchCwd) configUpdate.launchCwd = task.launchCwd;
        if (Object.keys(configUpdate).length > 0) {
          updateGameConfig(task.gameId, configUpdate);
        }
        const thirdPartyDef = getThirdPartyLauncherByStoreId(task.store);
        if (thirdPartyDef && !isLauncherBootstrapped(thirdPartyDef.id)) {
          this.addLog(`[DOWNLOAD] ${task.gameTitle}: installer individuato (${task.executablePath}) \u2014 clicca di nuovo la card per eseguirlo e completare l'installazione.`, "system");
        } else if (task.executablePath) {
          this.addLog(`[DOWNLOAD] ${task.gameTitle} completato. Exe: ${task.executablePath}`, "system");
        } else {
          this.addLog(`[DOWNLOAD] ${task.gameTitle} completato. (nessun exe rilevato \u2014 imposta il percorso manualmente nell'overlay)`, "system");
        }
        deleteDownload(task.gameId);
      }
    });
  }
  waitReady() {
    return this.libraryReady;
  }
  async syncExternalInstallStates() {
    try {
      const { execFile: execFile3 } = await import("child_process");
      const { promisify: promisify2 } = await import("util");
      const execFileAsync2 = promisify2(execFile3);
      try {
        const { existsSync: existsSync19 } = await import("fs");
        const { join } = await import("path");
        const { homedir: homedir8 } = await import("os");
        const gogBase = join(homedir8(), "Games", "GOG");
        if (existsSync19(gogBase)) {
          const activeGameIds = new Set(
            downloadManager.getTasks().filter((t) => t.status !== "completed" && t.status !== "error").map((t) => t.gameId)
          );
          for (const game of getAllGames()) {
            if (game.store !== "GOG Galaxy") continue;
            if (activeGameIds.has(game.id)) continue;
            const slug = game.id.replace(/^gog-/, "");
            const filesDir = join(gogBase, slug, "files");
            let hasFiles = false;
            try {
              hasFiles = existsSync19(filesDir) && resolveGogExe(filesDir) !== null;
            } catch {
              hasFiles = false;
            }
            const filesDirExists = existsSync19(filesDir);
            if (hasFiles && !game.isInstalled) {
              updateGameStatus(game.id, true, "Ready to Launch");
              this.addLog(`[SYNC] GOG installato rilevato: ${game.title}`, "system");
            } else if (!filesDirExists && game.isInstalled) {
              updateGameStatus(game.id, false, "Not Installed");
              this.addLog(`[SYNC] GOG rimosso rilevato: ${game.title}`, "system");
            } else if (filesDirExists && !hasFiles && game.isInstalled) {
              this.addLog(`[SYNC] GOG \u2014 ${game.title}: cartella "files/" presente ma resolveGogExe non ha trovato l'eseguibile primario (goggame-*.info non interpretabile per questo titolo?). isInstalled lasciato invariato (era true) invece di revertirlo su un segnale ambiguo \u2014 verificare manualmente se il gioco risulta comunque avviabile.`, "warning");
            }
          }
        }
      } catch (err) {
        this.addLog(`[SYNC] GOG sync failed: ${err}`, "warning");
      }
      try {
        try {
          await execFileAsync2("which", ["legendary"], { timeout: 3e3 });
        } catch {
          return;
        }
        let raw;
        try {
          const result = await execFileAsync2("legendary", ["list-installed", "--json"], {
            encoding: "utf-8",
            timeout: 15e3
          });
          raw = result.stdout;
        } catch {
          return;
        }
        if (!raw || !raw.trim()) return;
        let installed = [];
        try {
          const parsed = JSON.parse(raw.trim());
          if (Array.isArray(parsed)) {
            installed = parsed;
          } else if (parsed && typeof parsed === "object") {
            installed = Object.values(parsed);
          }
        } catch {
          return;
        }
        if (!Array.isArray(installed)) return;
        const installedIds = new Set(
          installed.filter((g) => !!g && typeof g === "object" && typeof g.app_name === "string").map((g) => `epic-${g.app_name.toLowerCase()}`)
        );
        for (const game of getAllGames()) {
          if (game.store !== "Epic Games") continue;
          const isInstalled = installedIds.has(game.id.toLowerCase());
          if (!isInstalled && game.isInstalled) {
            updateGameStatus(game.id, false, "Not Installed");
            this.addLog(`[SYNC] Epic game desync fixed: ${game.title}`, "system");
          }
        }
      } catch (err) {
        this.addLog(`[SYNC] legendary sync failed: ${err}`, "warning");
      }
      try {
        for (const game of getAllGames()) {
          if (!game.requiresLauncher || game.isInstalled) continue;
          if (!isLauncherBootstrapped(game.requiresLauncher)) continue;
          const exe = findGameExeInSharedPrefix(game.requiresLauncher, game.title);
          if (exe) {
            updateGameConfig(game.id, { executablePath: exe, prefixPath: getSharedPrefixBasePath(game.requiresLauncher) });
            updateGameStatus(game.id, true, "Ready to Launch");
            this.addLog(`[SYNC] ${game.title} trovato installato nel prefix condiviso di "${game.requiresLauncher}" \u2014 eseguibile: ${exe}`, "system");
          }
        }
      } catch (err) {
        this.addLog(`[SYNC] shared-launcher reconciliation failed: ${err}`, "warning");
      }
    } catch (err) {
      this.addLog(`[SYNC] external sync failed: ${err}`, "warning");
    }
  }
  async init() {
    this.loadPluginStates();
    const pending = getPendingDownloads();
    if (pending.length > 0) {
      this.addLog(`[DAEMON] Ripristino ${pending.length} download in sospeso...`, "system");
      for (const partialTask of pending) {
        const game = getGameById(partialTask.gameId);
        if (!game) {
          this.addLog(`[DAEMON] Download in sospeso per ${partialTask.gameId} saltato \u2014 gioco non pi\xF9 in libreria.`, "warning");
          continue;
        }
        const compatProfile = getCompatProfile(partialTask.gameId);
        const task = {
          ...partialTask,
          store: game.store,
          // v1.5.4-dev.1 — phase/phaseLabel: valori solo segnaposto,
          // restoreTask() sotto li ricalcola subito da task.status
          // (comportamento auto-correttivo già presente lì) — servono
          // solo a soddisfare il tipo qui.
          phase: partialTask.status,
          phaseLabel: partialTask.status,
          installPath: import_path16.default.join(storeDir(game.store), slugFromId(partialTask.gameId), "files"),
          prefixPath: game.prefixPath ?? import_path16.default.join(storeDir(game.store), slugFromId(partialTask.gameId), "prefix"),
          winetricksVerbs: compatProfile?.winetricksVerbs ?? []
        };
        downloadManager.restoreTask(task);
      }
    }
    await this.syncExternalInstallStates();
    await this.syncProtonRunners();
    const { execSync: execSync15 } = await import("child_process");
    const hasWine = (() => {
      try {
        execSync15("which wine", { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    })();
    const hasWinetricks = (() => {
      try {
        execSync15("which winetricks", { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    })();
    if (!hasWine) this.addLog("[WARN] Wine non trovato \u2014 i giochi GOG/Epic non potranno essere installati. Installa con: sudo pacman -S wine", "error");
    if (!hasWinetricks) this.addLog("[WARN] Winetricks non trovato \u2014 le dipendenze Wine non verranno installate. Installa con: yay -S winetricks", "error");
    if (hasWine && hasWinetricks) this.addLog("[WINE] Ambiente Wine pronto.", "system");
    await this.refreshLibrary();
    this.startPeriodicRefresh();
  }
  /** Avvia il refresh periodico in background. Idempotente: non crea timer duplicati se chiamato più volte. */
  startPeriodicRefresh() {
    if (this.libraryRefreshTimer) return;
    this.libraryRefreshTimer = setInterval(() => {
      this.refreshLibrary().catch(
        (err) => this.addLog(`[DAEMON] Refresh periodico fallito: ${err}`, "error")
      );
    }, this.LIBRARY_REFRESH_INTERVAL_MS);
  }
  /** Ferma il refresh periodico. Utile per uno shutdown controllato del daemon. */
  stopPeriodicRefresh() {
    if (this.libraryRefreshTimer) {
      clearInterval(this.libraryRefreshTimer);
      this.libraryRefreshTimer = null;
    }
  }
  async syncProtonRunners() {
    const detected = compatibilityManager.getAvailableRunners();
    upsertRunners(detected);
    this.protonRunners.clear();
    for (const r of detected) {
      if (!this.staticRunners.has(r.id)) {
        this.protonRunners.set(r.id, new ProtonRunner(r.id, r.version));
      }
    }
    this.addLog(
      `[COMPAT] Runner rilevati: ${detected.length > 0 ? detected.map((r) => r.id).join(", ") : "nessuno"}`,
      "system"
    );
  }
  get allRunners() {
    return new Map([...this.staticRunners, ...this.protonRunners]);
  }
  // v1.1.26 — generalizzata da v1.1.23 dopo prova diretta nei log: il
  // fix precedente proteggeva SOLO isInstalled, e SOLO quando il plugin
  // tentava di abbassarlo a false. Log reali (test hardware, gioco GOG
  // appena installato) hanno mostrato due varianti dello stesso problema
  // non coperte:
  // 1) il plugin dice isInstalled=true (corretto — cartella con
  //    contenuti) ma non conosce l'executablePath specifico (dettaglio
  //    noto solo all'installer di QUESTA app) — la mia protezione non
  //    scattava (richiedeva un downgrade di isInstalled), e
  //    executablePath veniva scritto vuoto sopra un valore corretto.
  // 2) isInstalled stesso ribaltato a false nella FASE 2 (arricchimento
  //    metadati, dopo un giro di rete per un gioco mai processato prima
  //    da metadataManager) — la Fase 1 aveva già scritto il valore
  //    giusto, ma nessuna protezione esisteva prima della SECONDA
  //    scrittura, un'invocazione separata di upsertGames().
  // Fix: protezione applicata a OGNI upsert (Fase 1 E Fase 2), rilendo
  // lo stato DB più recente immediatamente prima di ciascuna scrittura —
  // non un controllo fatto una sola volta a inizio funzione — e estesa a
  // executablePath indipendentemente da cosa succede a isInstalled.
  protectInstalledState(gamesToWrite) {
    const existingById = new Map(getAllGames().map((g) => [g.id, g]));
    for (const g of gamesToWrite) {
      const existing = existingById.get(g.id);
      if (!existing) continue;
      if (existing.isInstalled && !g.isInstalled) {
        g.isInstalled = true;
        g.status = existing.status;
      }
      if (existing.executablePath && !g.executablePath) {
        g.executablePath = existing.executablePath;
      }
    }
  }
  async refreshLibrary() {
    this.addLog("[DAEMON] Sync libreria...", "system");
    const allGames = [];
    const gamesByExhaustivePlugin = /* @__PURE__ */ new Map();
    for (const plugin of this.plugins) {
      if (!plugin.enabled) {
        this.addLog(`[PLUGIN] ${plugin.name}: disabilitato \u2014 skip.`, "system");
        continue;
      }
      try {
        const storeGames = await plugin.getLibrary();
        allGames.push(...storeGames);
        if (plugin.isExhaustiveLocalScan) gamesByExhaustivePlugin.set(plugin.id, storeGames);
        this.addLog(`[PLUGIN] ${plugin.name}: ${storeGames.length} titoli.`, "info");
      } catch (err) {
        this.addLog(`[PLUGIN] ${plugin.name} fallito: ${err}`, "error");
      }
    }
    this.protectInstalledState(allGames);
    upsertGames(allGames);
    for (const [storeId, storeGames] of gamesByExhaustivePlugin) {
      const removed = deleteGamesByStoreNotIn(storeId, storeGames.map((g) => g.id));
      if (removed > 0) {
        this.addLog(`[DAEMON] ${storeId}: ${removed} titoli rimossi dal DB (non pi\xF9 presenti sul disco).`, "info");
      }
    }
    const gogJunkIds = getAllGames().filter((g) => g.store === "GOG Galaxy" && isJunkGogSlug(g.id.replace(/^gog-/, ""))).map((g) => g.id);
    if (gogJunkIds.length > 0) {
      const removedJunk = deleteGamesById(gogJunkIds);
      this.addLog(`[DAEMON] GOG Galaxy: ${removedJunk} voci non-gioco rimosse dal DB (goodies collection / artefatti di parsing).`, "info");
    }
    this.addLog(`[DAEMON] ${allGames.length} titoli persistiti su DB.`, "system");
    this.notifyLibraryRefreshed();
    await this.syncExternalInstallStates();
    setImmediate(async () => {
      const existing = /* @__PURE__ */ new Map();
      try {
        for (const g of getAllGames()) existing.set(g.id, g);
      } catch {
      }
      const toEnrich = allGames.map((game) => {
        const cached2 = existing.get(game.id);
        if (!cached2) return game;
        return {
          ...game,
          coverImage: cached2.coverImage && !cached2.coverImage.includes("unsplash.com") ? cached2.coverImage : game.coverImage,
          previewImage: cached2.previewImage && !cached2.previewImage.includes("unsplash.com") ? cached2.previewImage : game.previewImage,
          rating: cached2.rating ?? game.rating,
          genres: cached2.genres?.length ? cached2.genres : game.genres,
          description: cached2.description || game.description,
          releaseDate: cached2.releaseDate || game.releaseDate,
          hltbHours: cached2.hltbHours ?? game.hltbHours
        };
      });
      const enriched = [];
      for (const game of toEnrich) {
        try {
          enriched.push(await metadataManager.enrichGameMetadata(game));
        } catch {
          enriched.push(game);
        }
      }
      this.protectInstalledState(enriched);
      upsertGames(enriched);
      this.notifyLibraryRefreshed();
      this.addLog(`[DAEMON] Metadati aggiornati per ${enriched.length} titoli.`, "system");
    });
  }
  /**
   * v1.5.20-dev.14 — lookup pubblico dello StorePlugin proprietario di
   * uno store — prima solo interno (`this.plugins.find`, usato altrove
   * in questo stesso file), serve ora anche a server.ts per delegare
   * detectUnrecoverableInstallFailure() al plugin giusto senza dover
   * esporre l'intero array `plugins` (resta privato).
   */
  getPluginForStore(storeId) {
    return this.plugins.find((p) => p.id === storeId);
  }
  getGames(query) {
    let games = getAllGames();
    if (query?.store && query.store !== "All" && query.store !== "undefined") {
      const launcherDef = getThirdPartyLauncherByStoreId(query.store);
      games = games.filter((g) => g.store === query.store || !!launcherDef && g.requiresLauncher === launcherDef.id);
    }
    if (query?.search) {
      const s = query.search.toLowerCase();
      games = games.filter(
        (g) => g.title.toLowerCase().includes(s) || g.description.toLowerCase().includes(s) || g.tags?.some((t) => t.toLowerCase().includes(s))
      );
    }
    if (query?.genre) {
      games = games.filter((g) => g.genres?.includes(query.genre));
    }
    if (query?.category) {
      games = games.filter((g) => g.categories?.includes(query.category));
    }
    if (query?.sortBy) {
      const ord = query.order === "desc" ? -1 : 1;
      games.sort((a, b) => {
        if (query.sortBy === "playTime") return (a.playTimeHours - b.playTimeHours) * ord;
        if (query.sortBy === "installDate") {
          const da = a.installedAt ? new Date(a.installedAt).getTime() : 0;
          const db2 = b.installedAt ? new Date(b.installedAt).getTime() : 0;
          return (da - db2) * ord;
        }
        if (query.sortBy === "rating") return ((a.rating || 0) - (b.rating || 0)) * ord;
        if (query.sortBy === "title") return a.title.localeCompare(b.title) * ord;
        return 0;
      });
    }
    return games;
  }
  getLogs(limit = 200) {
    return getRecentLogs(limit);
  }
  addLog(message, type = "info") {
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour12: false });
    const entry = { timestamp, message, type };
    insertLog(entry);
    writeLog(type, message);
  }
  // v0.99.38 — overrideLaunchArgs: permette allo script di test (o a
  // chiunque chiami questa funzione) di provare argomenti di lancio
  // candidati — es. suggeriti dalle note Heroic known-fixes — SENZA
  // scriverli nel DB. Solo se il lancio si rivela funzionante l'utente
  // decide di persisterli via updateGameConfig/PATCH .../config, lo
  // stesso percorso già usato per il campo "Launch Arguments" manuale
  // nell'overlay. Evita di dover salvare-testare-tornare indietro ad ogni
  // tentativo durante il debug di un titolo.
  async launchGame(id, overrideLaunchArgs) {
    const game = getGameById(id);
    if (!game) return { success: false, message: "Gioco non trovato" };
    if (!game.isInstalled) {
      this.addLog(`[DAEMON] ${game.title} non installato. Avvio download.`, "download");
      this.installGame(id);
      return { success: true, message: "Download avviato" };
    }
    const activeInstall = downloadManager.getTasks().find((t) => t.gameId === id && t.status !== "completed" && t.status !== "error");
    if (activeInstall) {
      this.addLog(
        `[LAUNCH] Bloccato \u2014 installazione in corso per ${game.title} (stato: ${activeInstall.status}). Attendi il completamento prima di lanciare.`,
        "error"
      );
      return { success: false, message: `Installazione in corso (${activeInstall.status}) \u2014 attendi il completamento` };
    }
    const runningCheck = this.isLastLaunchedGameRunning();
    if (runningCheck.running && runningCheck.gameId === id) {
      this.addLog(`[LAUNCH] Bloccato \u2014 ${game.title} risulta gi\xE0 in esecuzione (PID attivo).`, "error");
      return { success: false, message: `${game.title} \xE8 gi\xE0 in esecuzione` };
    }
    const storePlugin = this.plugins.find((p) => p.id === game.store);
    if (storePlugin && !storePlugin.enabled && !storePlugin.drmFree) {
      this.addLog(
        `[LAUNCH] Bloccato \u2014 plugin "${storePlugin.name}" disabilitato. Riattivalo dalle Impostazioni > Plugins.`,
        "error"
      );
      return { success: false, message: `Plugin "${storePlugin.name}" disabilitato` };
    }
    const isThisGameASharedLauncherApp = THIRD_PARTY_LAUNCHERS.some((l) => `${l.id}-launcher` === game.id);
    const effectiveSharedLauncherId = isThisGameASharedLauncherApp ? void 0 : game.requiresLauncher ?? getThirdPartyLauncherByStoreId(game.store)?.id;
    const profile = getCompatProfile(id);
    let effectiveRunnerId = game.runner;
    let effectivePrefixPath = game.prefixPath;
    let effectiveUmuRun = profile?.umuRun ?? false;
    if (effectiveSharedLauncherId) {
      const launcherGame = getGameById(`${effectiveSharedLauncherId}-launcher`);
      if (launcherGame?.runner && launcherGame.runner !== game.runner) {
        this.addLog(
          `[LAUNCH] ${game.title}: runner "${game.runner}" ignorato, ereditato "${launcherGame.runner}" dal launcher condiviso "${effectiveSharedLauncherId}" \u2014 una prefix condivisa richiede la stessa build Proton per ogni gioco che la usa.`,
          "system"
        );
      }
      effectiveRunnerId = launcherGame?.runner ?? game.runner;
      effectivePrefixPath = getSharedPrefixBasePath(effectiveSharedLauncherId);
      effectiveUmuRun = getCompatProfile(`${effectiveSharedLauncherId}-launcher`)?.umuRun ?? false;
    }
    const runner = this.allRunners.get(effectiveRunnerId);
    if (!runner) {
      this.addLog(`[DAEMON] Runner "${effectiveRunnerId}" non disponibile per ${game.title}`, "error");
      return { success: false, message: `Runner "${effectiveRunnerId}" non trovato` };
    }
    this.addLog(`[DAEMON] Avvio ${game.title} via ${runner.name}`, "system");
    recordGameLaunch(id);
    const windowSnapshotBefore = captureWindowSnapshot();
    if (effectiveSharedLauncherId) {
      this.addLog(`[LAUNCH] ${game.title}: riconciliazione verb saltata \u2014 usa il launcher condiviso "${effectiveSharedLauncherId}", la cui prefix viene riconciliata quando \xE8 lui stesso a essere lanciato, mai da un gioco dipendente (evita di disturbare una sessione gi\xE0 attiva).`, "system");
    } else {
      await this.reconcileWinetricksVerbs(id, game, profile, effectiveRunnerId, effectivePrefixPath).catch((err) => {
        this.addLog(`[LAUNCH] Riconciliazione verb fallita (si procede comunque col lancio): ${err}`, "warning");
      });
    }
    try {
      const runnerVersion = await runner.version().catch(() => "n/a");
      this.addLog(`[LAUNCH] Runner: ${runner.name} \u2014 versione: ${runnerVersion}`, "info");
      if (game.executablePath) {
        const displayPath = game.executablePath.replace(
          /\$([A-Z_][A-Z0-9_]*)/g,
          (_, name) => process.env[name] ?? `$${name}`
        ).replace(/^~/, process.env.HOME ?? "~");
        this.addLog(`[LAUNCH] Exe: ${displayPath}`, "info");
      } else if (!game.steamAppId && !game.scummvmId) {
        this.addLog(`[LAUNCH] \u26A0 Nessun executablePath configurato per ${game.title}`, "error");
      }
      if (overrideLaunchArgs !== void 0) {
        this.addLog(`[LAUNCH] \u26A0 Argomenti di lancio TEMPORANEI in test (non salvati nel DB): "${overrideLaunchArgs}"`, "system");
      }
      const effectiveLaunchArgs = overrideLaunchArgs !== void 0 ? overrideLaunchArgs : game.launchArgs;
      const runnerConfig = {
        env: profile?.customEnv,
        prefix: effectivePrefixPath,
        args: effectiveLaunchArgs ? shellSplitArgs(effectiveLaunchArgs) : void 0,
        cwd: game.launchCwd,
        fsr: profile?.fsr ?? false,
        gameMode: profile?.gameMode ?? false,
        mangohud: profile?.mangohud ?? 0,
        eac: profile?.eac ?? false,
        battleye: profile?.battleye ?? false,
        umuRun: effectiveUmuRun,
        gamescope: profile?.gamescope ?? 0
      };
      const useSharedPrefixLightLaunch = false;
      const bypassStoreAuthChain = !!getCompatProfile(id)?.bypassStoreAuthChain;
      const result = useSharedPrefixLightLaunch ? await launchGameInSharedPrefix(
        effectiveSharedLauncherId,
        expandHome(game.executablePath),
        runnerConfig.args ?? [],
        runnerConfig.cwd,
        id
      ) : game.store === "Epic Games" && !bypassStoreAuthChain ? await launchEpicViaLegendary(game, runner, runnerConfig) : await runner.launch(game, runnerConfig);
      if (result.success) {
        this.addLog(`[LAUNCH] Sessione attiva \u2014 PID: ${result.pid} \u2014 ${result.message}`, "system");
        emitLaunchPhase({ gameId: id, phase: "launching", detail: game.store });
        if (!isThisGameASharedLauncherApp) {
          raceSplashClose(id, windowSnapshotBefore, effectiveSharedLauncherId, result.pid).catch((err) => {
            this.addLog(`[SPLASH] Orchestrazione splash fallita (non bloccante): ${err}`, "warning");
          });
        }
        if (result.pid) {
          const processNameHint = (game.store === "Epic Games" || !!effectiveSharedLauncherId || !!profile?.gamescope) && game.executablePath ? import_path16.default.basename(game.executablePath) : void 0;
          const unit = "unit" in result ? result.unit : void 0;
          this.lastLaunchedGame = { gameId: id, gameTitle: game.title, pid: result.pid, unit, launchedAt: Date.now(), logPath: result.logPath, processNameHint };
          this.startScreensaverInhibit(game.title);
        }
      } else {
        this.addLog(`[LAUNCH] Fallito: ${result.message}`, "error");
        if (!isThisGameASharedLauncherApp) {
          emitLaunchPhase({ gameId: id, phase: "failed" });
        }
        if (result.message?.includes("percorso eseguibile") || result.message?.includes("executablePath")) {
          this.addLog(`[LAUNCH] \u2192 Apri l'overlay del gioco e imposta "Executable Path" nella sezione Game Config`, "error");
        }
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.addLog(`[LAUNCH] Eccezione runner: ${msg}`, "error");
      if (!isThisGameASharedLauncherApp) {
        emitLaunchPhase({ gameId: id, phase: "failed" });
      }
      return { success: false, message: msg };
    }
  }
  /**
   * v1.5.20-dev.18/19/20 — estratta da dentro launchGame(). Stessa
   * identica logica di sempre (v1.1.117/118/119-dev.1): (1) reinstalla
   * eventuali verb aggiunti al profilo dopo l'installazione originale —
   * salta se la prefix del runner corrente non esiste ancora; (2)
   * `winetricks list-installed` per rilevare verb installati a mano da
   * terminale e sincronizzarli col profilo salvato.
   *
   * Storia dei due bug reali attraversati per arrivare qui, entrambi
   * confermati con diagnostica diretta dell'utente (non ipotizzati):
   * dev.18 l'aveva spostata a girare DOPO il lancio (fire-and-forget)
   * per risolvere un blocco di 16 minuti — ma dev.20 ha scoperto che
   * farla girare IN PARALLELO al gioco già avviato può corrompere la
   * sessione: alcuni verb (dxvk, vkd3d, d3dcompiler...) sostituiscono
   * DLL nella STESSA prefix che il gioco ha già in uso (stessa ragione
   * per cui le guide DXVK dicono sempre di chiudere il gioco prima di
   * reinstallarlo) — per Ubisoft Connect è passato inosservato, per LEGO
   * Indiana Jones (Amazon/nile) ha impedito al gioco di restare in
   * esecuzione. Riportata PRIMA del lancio (sequenziale, mai più in
   * parallela con un gioco già avviato) — il fix reale di dev.19
   * (execFileAsync invece di execSync, cosi il demone resta reattivo
   * durante l'attesa) resta comunque valido e necessario, il problema
   * originale non era la POSIZIONE ma la natura bloccante delle
   * chiamate.
   *
   * v1.5.20-dev.23 — `runnerId`/`prefixPath` ora parametri espliciti
   * invece di leggerli da `game.runner`/`game.prefixPath`: per un gioco
   * con `requiresLauncher`, quei due campi sul gioco stesso possono
   * restare vuoti o stantii per sempre (l'installazione tramite lo
   * store d'origine non completa mai per questa categoria — vedi
   * CHANGELOG.md, saga Watch Dogs 2) — il chiamante passa i valori
   * EFFETTIVI già risolti (quelli del launcher condiviso quando
   * applicabile), mai quelli grezzi del gioco.
   */
  async reconcileWinetricksVerbs(id, game, profile, runnerId, prefixPath) {
    if (prefixPath && profile?.winetricksVerbs && profile.winetricksVerbs.length > 0) {
      const wineEnv = resolveRunnerWineEnv(runnerId, prefixPath);
      try {
        const { existsSync: existsSync19 } = require("fs");
        const { execFile: execFile3 } = require("child_process");
        const { promisify: promisify2 } = require("util");
        const execFileAsync2 = promisify2(execFile3);
        const prefixAlreadyExists = existsSync19(wineEnv.winePrefixPath);
        if (!prefixAlreadyExists) {
          this.addLog(`[LAUNCH] Prefix nuova per il runner "${runnerId}" \u2014 salvataggi/impostazioni di un runner precedente non saranno presenti qui. Ripristinali a mano se necessario.`, "system");
          try {
            const { notificationEngine: notificationEngine2 } = (init_notificationEngine(), __toCommonJS(notificationEngine_exports));
            notificationEngine2.emit({
              type: "system",
              level: "warning",
              message: `${game.title}: stai usando il runner "${runnerId}" per la prima volta \u2014 \xE8 una prefix nuova, senza i salvataggi/impostazioni di un runner precedente eventualmente usato per questo gioco. Puoi ripristinarli a mano se li avevi.`
            });
          } catch (err) {
            this.addLog(`[LAUNCH] Notifica prefix nuova non inviata: ${err}`, "system");
          }
        } else {
          await execFileAsync2("which", ["winetricks"]);
          const verbTotal = profile.winetricksVerbs.length;
          let verbIndex = 0;
          for (const verb of profile.winetricksVerbs) {
            verbIndex += 1;
            this.addLog(`[LAUNCH] Verifica dipendenza: ${verb}`, "system");
            emitLaunchPhase({ gameId: id, phase: "verifying-env", index: verbIndex, total: verbTotal, detail: verb });
            try {
              await execFileAsync2("winetricks", ["--unattended", verb], {
                env: {
                  ...process.env,
                  WINEPREFIX: wineEnv.winePrefixPath,
                  WINEDEBUG: "-all",
                  WINETRICKS_GUI: "none",
                  ...wineEnv.extraEnv
                },
                timeout: 3e5
              });
              this.addLog(`[LAUNCH] ${verb}: OK`, "system");
            } catch {
              this.addLog(`[LAUNCH] ${verb}: gi\xE0 installato o errore ignorato`, "system");
            }
          }
        }
      } catch {
      }
    }
    if (prefixPath) {
      try {
        const { existsSync: existsSync19 } = require("fs");
        const { execFile: execFile3 } = require("child_process");
        const { promisify: promisify2 } = require("util");
        const execFileAsync2 = promisify2(execFile3);
        const wineEnv = resolveRunnerWineEnv(runnerId, prefixPath);
        if (existsSync19(wineEnv.winePrefixPath)) {
          await execFileAsync2("which", ["winetricks"]);
          const { stdout: listOutput } = await execFileAsync2("winetricks", ["list-installed"], {
            env: {
              ...process.env,
              WINEPREFIX: wineEnv.winePrefixPath,
              WINEDEBUG: "-all",
              ...wineEnv.extraEnv
            },
            timeout: 3e4
          });
          const installedVerbs = listOutput.split("\n").map((l) => l.trim()).filter((l) => ALL_KNOWN_WINE_VERBS.includes(l));
          const lastOsVersionIdx = installedVerbs.map((v, i) => OS_VERSION_VERBS.includes(v) ? i : -1).filter((i) => i !== -1).pop();
          const installedVerbsDeduped = installedVerbs.filter(
            (v, i) => !OS_VERSION_VERBS.includes(v) || i === lastOsVersionIdx
          );
          const trackedVerbsClean = (profile?.winetricksVerbs ?? []).filter((v) => ALL_KNOWN_WINE_VERBS.includes(v));
          const newlyFound = installedVerbsDeduped.filter((v) => !trackedVerbsClean.includes(v));
          const droppedJunk = (profile?.winetricksVerbs ?? []).length - trackedVerbsClean.length;
          if (newlyFound.length > 0 || droppedJunk > 0) {
            const incomingOsVersion = newlyFound.find((v) => OS_VERSION_VERBS.includes(v));
            const trackedWithoutStaleOs = incomingOsVersion ? trackedVerbsClean.filter((v) => !OS_VERSION_VERBS.includes(v)) : trackedVerbsClean;
            const merged = [...trackedWithoutStaleOs, ...newlyFound];
            const currentProfile = profile ?? { fsr: false, gameMode: false, mangohud: 0, eac: false, battleye: false };
            upsertCompatProfile(id, { ...currentProfile, winetricksVerbs: merged });
            if (newlyFound.length > 0) this.addLog(`[LAUNCH] Rilevati verb installati manualmente, aggiunti al profilo: ${newlyFound.join(", ")}`, "system");
            if (droppedJunk > 0) this.addLog(`[LAUNCH] Ripulite ${droppedJunk} voci non riconosciute dal profilo (banner/font di winetricks salvati per errore prima del fix).`, "system");
          }
        }
      } catch (err) {
        this.addLog(`[LAUNCH] Rilevamento verb installati manualmente non riuscito (winetricks list-installed): ${err}`, "system");
      }
    }
  }
  markGameVerified(id, method) {
    const game = getGameById(id);
    if (!game) return { success: false, message: "Gioco non trovato" };
    markGameVerified(id, method);
    this.addLog(`[VERIFY] ${game.title} marcato come verificato (${method})`, "system");
    return { success: true };
  }
  unmarkGameVerified(id) {
    const game = getGameById(id);
    if (!game) return { success: false, message: "Gioco non trovato" };
    unmarkGameVerified(id);
    this.addLog(`[VERIFY] ${game.title} \u2014 badge verificato rimosso`, "system");
    return { success: true };
  }
  installGame(id) {
    const game = getGameById(id);
    if (!game) {
      this.addLog(`[INSTALL] Errore: gioco ${id} non trovato nel DB`, "error");
      return { success: false };
    }
    const runningCheck = this.isLastLaunchedGameRunning();
    if (runningCheck.running && runningCheck.gameId === id) {
      this.addLog(`[INSTALL] Bloccato \u2014 ${game.title} \xE8 in esecuzione. Chiudi il gioco prima di reinstallare.`, "error");
      return { success: false, message: `${game.title} \xE8 in esecuzione \u2014 chiudilo prima di reinstallare` };
    }
    this.addLog(`[INSTALL] Avvio installazione: ${game.title} (store: ${game.store}, id: ${game.id})`, "system");
    return downloadManager.addTask(game.id, game.title, game.store);
  }
  async uninstallGame(id) {
    const game = getGameById(id);
    if (!game) return { success: false, message: "Gioco non trovato" };
    const thirdPartyLauncherDef = getThirdPartyLauncherByStoreId(game.store);
    const runningCheck = this.isLastLaunchedGameRunning();
    if (runningCheck.running && runningCheck.gameId === id) {
      this.addLog(`[UNINSTALL] Bloccato \u2014 ${game.title} \xE8 in esecuzione. Chiudi il gioco prima di disinstallare.`, "error");
      return { success: false, message: `${game.title} \xE8 in esecuzione \u2014 chiudilo prima di disinstallare` };
    }
    if (thirdPartyLauncherDef && isSharedLauncherRunning(thirdPartyLauncherDef.id)) {
      this.addLog(`[UNINSTALL] Bloccato \u2014 ${thirdPartyLauncherDef.displayName} \xE8 in esecuzione. Chiudilo prima di disinstallare.`, "error");
      return { success: false, message: `${thirdPartyLauncherDef.displayName} \xE8 in esecuzione \u2014 chiudilo prima di disinstallare` };
    }
    const aboutToCleanOrphan = !game.isInstalled;
    if (aboutToCleanOrphan) {
      this.addLog(`[UNINSTALL] ${game.title} \u2014 isInstalled=false, verifico comunque file orfani da installazione incompleta...`, "system");
    }
    this.addLog(`[UNINSTALL] Avvio disinstallazione: ${game.title} (store: ${game.store})`, "system");
    if (game.store === "Epic Games") {
      const appName = game.id.replace(/^epic-/, "");
      try {
        const { execSync: execSync15 } = require("child_process");
        execSync15(`legendary --yes uninstall ${appName} --keep-files`, {
          stdio: "ignore",
          timeout: 3e4
        });
        this.addLog(`[UNINSTALL] ${game.title} \u2014 legendary uninstall completato.`, "system");
      } catch (err) {
        this.addLog(`[UNINSTALL] ${game.title} \u2014 legendary uninstall non riuscito o non necessario: ${err}`, "system");
      }
    }
    if (game.store === "Amazon Games") {
      const productId = game.id.replace(/^amazon-/, "");
      try {
        const { execSync: execSync15 } = require("child_process");
        execSync15(`nile uninstall ${productId}`, {
          stdio: "ignore",
          timeout: 3e4
        });
        this.addLog(`[UNINSTALL] ${game.title} \u2014 nile uninstall completato.`, "system");
      } catch (err) {
        this.addLog(`[UNINSTALL] ${game.title} \u2014 nile uninstall non riuscito o non necessario: ${err}`, "system");
      }
    }
    const { homedir: homedir8 } = require("os");
    const { join } = require("path");
    const { existsSync: existsSync19, rmSync: rmSync2 } = require("fs");
    if (thirdPartyLauncherDef && !canRemoveSharedPrefix(thirdPartyLauncherDef.id, id)) {
      this.addLog(`[UNINSTALL] Bloccato \u2014 altri giochi installati richiedono ancora ${thirdPartyLauncherDef.displayName}.`, "error");
      return { success: false, message: `Altri giochi installati richiedono ancora ${thirdPartyLauncherDef.displayName} \u2014 disinstallali prima, o lascia questo launcher installato.` };
    }
    const storeDir2 = game.store === "GOG Galaxy" ? join(homedir8(), "Games", "GOG", game.id.replace(/^gog-/, "")) : game.store === "Epic Games" ? join(homedir8(), "Games", "Epic", game.id.replace(/^epic-/, "")) : game.store === "Amazon Games" ? join(homedir8(), "Games", "Amazon Games", game.id) : thirdPartyLauncherDef ? join(SHARED_LAUNCHERS_DIR, thirdPartyLauncherDef.id) : null;
    if (aboutToCleanOrphan && (!storeDir2 || !existsSync19(storeDir2))) {
      this.addLog(`[UNINSTALL] ${game.title} \u2014 nessun file su disco, niente da disinstallare.`, "system");
      return { success: false, message: "Gioco non installato (nessun file trovato)" };
    }
    if (storeDir2) {
      if (existsSync19(storeDir2)) {
        try {
          rmSync2(storeDir2, { recursive: true, force: true });
          this.addLog(`[UNINSTALL] ${game.title} \u2014 file rimossi: ${storeDir2}`, "system");
          if (thirdPartyLauncherDef) {
            deleteSharedLauncherPrefix(thirdPartyLauncherDef.id);
          }
        } catch (err) {
          this.addLog(`[UNINSTALL] Errore rimozione file ${game.title}: ${err}`, "error");
          return { success: false, message: `Errore rimozione file: ${err}` };
        }
      } else {
        this.addLog(`[UNINSTALL] ${game.title} \u2014 cartella non trovata: ${storeDir2}`, "system");
      }
    } else {
      this.addLog(`[UNINSTALL] ${game.title} \u2014 store non gestito: ${game.store}`, "system");
    }
    updateGameStatus(id, false, "Not Installed");
    updateGameConfig(id, {
      executablePath: null,
      prefixPath: null,
      launchArgs: null,
      launchCwd: null
    });
    this.addLog(`[UNINSTALL] ${game.title} disinstallato con successo.`, "system");
    return { success: true };
  }
  async loginToStore(storeId) {
    const plugin = this.plugins.find((p) => p.id === storeId);
    if (!plugin) return { success: false, message: "Store non trovato" };
    this.addLog(`[AUTH] Handshake con ${plugin.name}...`, "auth");
    const result = await plugin.login();
    if (result.success && !result.waitForBrowser) {
      this.addLog(`[AUTH] Autenticato su ${plugin.name}.`, "system");
      await this.refreshLibrary();
    } else if (result.success && result.waitForBrowser) {
      this.addLog(`[AUTH] Login ${plugin.name} in attesa del browser...`, "auth");
    }
    return result;
  }
  async logoutFromStore(storeId) {
    const plugin = this.plugins.find((p) => p.id === storeId);
    if (!plugin) return { success: false, message: "Store non trovato" };
    this.addLog(`[AUTH] Disconnessione da ${plugin.name}...`, "auth");
    const result = await plugin.logout();
    if (result.success) {
      this.addLog(`[AUTH] Disconnesso da ${plugin.name}.`, "system");
      await this.refreshLibrary();
    }
    return result;
  }
  async syncStores() {
    const allGames = getAllGames();
    return Promise.all(this.plugins.map(async (p) => ({
      id: p.id,
      name: p.name,
      gameCount: allGames.filter((g) => g.store === p.id && (p.enabled || g.isInstalled)).length,
      isConnected: await p.isAuthenticated(),
      enabled: p.enabled
    })));
  }
  /** Restituisce il registry completo dei plugin store per il Plugin Manager UI */
  getPluginRegistry() {
    return this.plugins.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      drmFree: p.drmFree,
      requiredTool: p.requiredTool,
      enabled: p.enabled
    }));
  }
  /** Abilita o disabilita un plugin store e persiste la scelta su DB */
  async setPluginEnabled(storeId, enabled) {
    const plugin = this.plugins.find((p) => p.id === storeId);
    if (!plugin) return { success: false };
    plugin.enabled = enabled;
    setPluginEnabled(storeId, enabled);
    this.addLog(
      `[PLUGIN] ${plugin.name} ${enabled ? "abilitato" : "disabilitato"}.`,
      "system"
    );
    if (enabled) await this.refreshLibrary();
    else this.notifyLibraryRefreshed();
    return { success: true, enabled };
  }
  /** Carica lo stato enabled dei plugin dal DB all'avvio */
  loadPluginStates() {
    const states = getPluginStates();
    for (const { id, enabled } of states) {
      const plugin = this.plugins.find((p) => p.id === id);
      if (plugin) plugin.enabled = enabled;
    }
  }
  /**
   * Richiesta utente — dimensione PREVISTA dell'installazione (prima di
   * scaricare), on-demand per un solo gioco alla volta. Solo GOG ed Epic
   * per ora (decisione esplicita dell'utente): Steam non ha una fonte
   * già cablata per il "non ancora installato" (SizeOnDisk esiste solo
   * per manifest locali, cioè giochi già installati), Classic Console
   * non si applica (le ROM sono già file completi, nessuna fase di
   * installazione separata). Ritorna null per qualunque altro store, o
   * se il plugin giusto non espone questo metodo.
   *
   * v1.1.90 — richiesto dall'utente: cache persistente invece di
   * rifare la chiamata a lgogdownloader/legendary ogni volta che il
   * gioco viene selezionato. Se già presente in DB, ritorna subito
   * quello senza richiamare il plugin; altrimenti lo recupera una
   * volta e lo scrive per le volte successive.
   */
  /**
   * Richiesta utente — "auto-remaster": due meccaniche diverse a seconda del
   * campo `mode` del preset (classicPlugin.ts, REMASTER_PRESETS), emerse
   * discutendo Saturn/PS2/N64 (non tutti i sistemi hanno due core da
   * scambiare come PSX):
   *
   * - 'swap-core' (PSX, Saturn): il core stesso è l'interruttore — nessun
   *   campo DB dedicato oltre a libretroCore. Disattivare si limita a
   *   tornare al core di default, che semplicemente ignora il file di
   *   preset (vive nella cartella di config di un core diverso). Il file
   *   NON va mai rimosso qui.
   *
   * - 'toggle-options' (PS2, futuro N64): un solo core sempre in uso — è il
   *   file di preset per-titolo l'interruttore. Attivare lo scrive (se
   *   assente), disattivare lo rimuove (removeRemasterOptions), così il
   *   gioco ricade sulla configurazione di default a livello di CORE
   *   (nessun override — confermato dall'utente per PS2/LRPS2).
   *
   * Generalizzata dal caso PSX (il primo verificato passo-passo a mano su
   * hardware reale) — funziona per qualunque sistema con una voce in
   * REMASTER_PRESETS, senza bisogno di altre modifiche qui quando in
   * futuro si aggiungerà Dreamcast.
   */
  async setRemasterEnabled(gameId, enabled) {
    const game = getGameById(gameId);
    if (!game || !hasRemasterPreset(game.system)) {
      return { success: false, message: "Nessun preset auto-remaster disponibile per questo gioco" };
    }
    const preset = REMASTER_PRESETS[game.system];
    let newCore;
    if (preset.mode === "swap-core") {
      if (enabled && game.executablePath) {
        writeRemasterOptions(game.executablePath, game.system);
      }
      newCore = enabled ? preset.remasterCore : preset.defaultCore;
      updateGameConfig(gameId, { libretroCore: newCore });
    } else {
      if (game.executablePath) {
        if (enabled) {
          writeRemasterOptions(game.executablePath, game.system);
        } else {
          removeRemasterOptions(game.executablePath, game.system);
        }
      }
      newCore = preset.core;
      updateGameConfig(gameId, { libretroCore: newCore, remasterEnabled: enabled });
    }
    this.addLog(`[CLASSIC] Auto-remaster (${game.system}) ${enabled ? "attivato" : "disattivato"} per ${game.title}.`, "system");
    return { success: true, newCore, remasterEnabled: preset.mode === "toggle-options" ? enabled : void 0 };
  }
  async getPredictedInstallSize(gameId) {
    const game = getGameById(gameId);
    if (!game) return null;
    if (typeof game.predictedSizeBytes === "number" && game.predictedSizeBytes > 0) {
      return game.predictedSizeBytes;
    }
    const plugin = this.plugins.find((p) => p.id === game.store);
    if (!plugin || typeof plugin.getPredictedInstallSizeBytes !== "function") return null;
    const bytes = await plugin.getPredictedInstallSizeBytes(gameId);
    if (typeof bytes === "number" && bytes > 0) {
      setPredictedSizeBytes(gameId, bytes);
    }
    return bytes;
  }
  async refreshRunners() {
    await this.syncProtonRunners();
    this.addLog("[COMPAT] Runner aggiornati.", "system");
    return Array.from(this.allRunners.keys());
  }
  updateGameConfig(id, config) {
    updateGameConfig(id, config);
    const summary = Object.entries(config).map(([k, v]) => `${k}=${v ?? "null"}`).join(", ");
    this.addLog(`[DAEMON] Config aggiornata per ${id}: ${summary}`, "system");
    if (config.runner && this.protonRunners.has(config.runner)) {
      this.applyVerbsToProtonPrefix(id, config.runner).catch(
        (err) => this.addLog(`[COMPAT] Applicazione verb su Proton fallita per ${id}: ${err}`, "error")
      );
    }
    if ("scrapeTitle" in config) {
      const freshGame = getGameById(id);
      if (freshGame) {
        metadataManager.enrichGameMetadata(freshGame, true).then((enriched) => {
          upsertGames([enriched]);
          if (enriched.title !== freshGame.title) {
            updateGameTitle(id, enriched.title);
          }
          this.notifyLibraryRefreshed();
          this.addLog(`[METADATA] Rifetch forzato completato per ${id} (titolo di ricerca: "${config.scrapeTitle || freshGame.title}").`, "system");
        }).catch((err) => this.addLog(`[METADATA] Rifetch forzato fallito per ${id}: ${err}`, "error"));
      }
    }
    return { success: true };
  }
  /**
   * Applica i winetricksVerbs salvati nel compat profile di un gioco
   * alla prefix Proton corrispondente al runner indicato. Eseguito in
   * background dopo un cambio runner — non blocca la UI. "Eredita"
   * la stessa selezione di verb già fatta per Wine, invece di
   * richiedere all'utente di riconfigurarla per ogni runner.
   */
  async applyVerbsToProtonPrefix(gameId, runnerId) {
    const profile = getCompatProfile(gameId);
    const verbs = profile?.winetricksVerbs;
    if (!verbs || verbs.length === 0) return;
    const { existsSync: existsSync19 } = await import("fs");
    const { join } = await import("path");
    const { homedir: homedir8 } = await import("os");
    const { spawn: spawn10 } = await import("child_process");
    const compatDataPath = join(homedir8(), ".local", "share", "proton-prefixes", gameId);
    const pfxPath = join(compatDataPath, "pfx");
    if (!existsSync19(pfxPath)) {
      this.addLog(`[COMPAT] Prefix Proton non ancora inizializzata per ${gameId} \u2014 verb da applicare al prossimo cambio runner dopo il primo lancio.`, "system");
      return;
    }
    this.addLog(`[COMPAT] Applico ${verbs.length} verb winetricks alla prefix Proton (${runnerId})...`, "system");
    for (const verb of verbs) {
      await new Promise((resolve) => {
        const proc = spawn10("winetricks", ["--unattended", verb], {
          stdio: "ignore",
          env: {
            ...process.env,
            WINEPREFIX: pfxPath,
            WINEDEBUG: "-all",
            WINETRICKS_GUI: "none"
          }
        });
        proc.on("exit", () => resolve());
        proc.on("error", (err) => {
          this.addLog(`[COMPAT] Verb ${verb} (Proton) fallito: ${err}`, "error");
          resolve();
        });
      });
    }
    this.addLog(`[COMPAT] Verb winetricks applicati alla prefix Proton per ${gameId}.`, "system");
  }
  updateCompatProfile(gameId, profile) {
    const existing = getCompatProfile(gameId);
    upsertCompatProfile(gameId, { ...existing, ...profile });
    this.addLog(`[COMPAT] Profilo aggiornato per game ${gameId}`, "system");
    resetForGame(gameId);
    return { success: true };
  }
};
var gameManager = new GameManager();

// server.ts
init_logger();
init_notificationEngine();
init_knowledgeBase();
init_db();
init_attemptTracker();
init_appConfig();

// src/backend/systemInfo.ts
var import_fs19 = __toESM(require("fs"), 1);
var import_os8 = __toESM(require("os"), 1);
var import_child_process17 = require("child_process");
init_logger();
function readFileTrim(path20) {
  try {
    const content = import_fs19.default.readFileSync(path20, "utf-8").trim();
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}
function getMotherboard() {
  const vendor = readFileTrim("/sys/class/dmi/id/board_vendor");
  const name = readFileTrim("/sys/class/dmi/id/board_name");
  if (vendor && name) return `${vendor} ${name}`;
  return vendor || name || "Non disponibile";
}
function getCPU() {
  const cpus = import_os8.default.cpus();
  if (!cpus || cpus.length === 0) return "Non disponibile";
  const model = cpus[0].model.replace(/\s+/g, " ").trim();
  return `${model} (${cpus.length} thread)`;
}
function getRAM() {
  const totalGB = import_os8.default.totalmem() / 1024 ** 3;
  return `${totalGB.toFixed(1)} GB`;
}
function getGPU() {
  try {
    const out = (0, import_child_process17.execSync)("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader", {
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).toString().trim();
    const firstLine = out.split("\n")[0]?.trim();
    if (firstLine) return firstLine;
  } catch {
  }
  try {
    const out = (0, import_child_process17.execSync)("lspci | grep -iE 'vga|3d controller'", {
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).toString().trim();
    const firstLine = out.split("\n")[0];
    if (firstLine) {
      const parts = firstLine.split(": ");
      return parts.length > 1 ? parts.slice(1).join(": ").trim() : firstLine;
    }
  } catch {
  }
  return "Non disponibile";
}
function getStorage() {
  try {
    const out = (0, import_child_process17.execSync)("df -h / | tail -1", {
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).toString().trim();
    const parts = out.split(/\s+/);
    if (parts.length >= 5) {
      return `${parts[2]} usati / ${parts[1]} totali (${parts[4]} pieno)`;
    }
    return out || "Non disponibile";
  } catch {
    return "Non disponibile";
  }
}
function getOS() {
  const osRelease = readFileTrim("/etc/os-release");
  let prettyName = null;
  if (osRelease) {
    const match = osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
    if (match) prettyName = match[1];
  }
  const kernel = import_os8.default.release();
  return prettyName ? `${prettyName} \u2014 kernel ${kernel}` : `Linux \u2014 kernel ${kernel}`;
}
var cached = null;
function getSystemInfo() {
  if (cached) return cached;
  cached = {
    motherboard: getMotherboard(),
    cpu: getCPU(),
    gpu: getGPU(),
    ram: getRAM(),
    storage: getStorage(),
    os: getOS()
  };
  writeLog("info", `[SYSTEM-INFO] ${JSON.stringify(cached)}`);
  return cached;
}

// server.ts
init_paths();

// src/backend/fileManager.ts
var import_fs20 = require("fs");
var import_path17 = __toESM(require("path"), 1);
function listDirectory(dirPath, extensions) {
  let resolved;
  try {
    resolved = import_path17.default.resolve(dirPath);
  } catch {
    return { error: "Percorso non valido." };
  }
  if (!(0, import_fs20.existsSync)(resolved)) return { error: "Cartella non trovata." };
  let stat;
  try {
    stat = (0, import_fs20.statSync)(resolved);
  } catch {
    return { error: "Impossibile leggere il percorso." };
  }
  if (!stat.isDirectory()) return { error: "Il percorso non \xE8 una cartella." };
  let names;
  try {
    names = (0, import_fs20.readdirSync)(resolved);
  } catch {
    return { error: "Permesso negato per questa cartella." };
  }
  const extSet = extensions && extensions.length > 0 ? new Set(extensions.map((e) => e.toLowerCase().replace(/^\./, ""))) : null;
  const entries = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const full = import_path17.default.join(resolved, name);
    let s;
    try {
      s = (0, import_fs20.statSync)(full);
    } catch {
      continue;
    }
    const isDir = s.isDirectory();
    if (!isDir && extSet) {
      const ext = import_path17.default.extname(name).toLowerCase().replace(/^\./, "");
      if (!extSet.has(ext)) continue;
    }
    entries.push({
      name,
      isDirectory: isDir,
      sizeBytes: isDir ? null : s.size,
      mtimeMs: isDir ? null : s.mtimeMs
    });
  }
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, void 0, { sensitivity: "base" });
  });
  const parent = import_path17.default.dirname(resolved);
  return {
    path: resolved,
    parentPath: parent !== resolved ? parent : null,
    entries
  };
}
function resolveRemovableMediaRoot() {
  const user = process.env.USER || process.env.LOGNAME;
  if (!user) return null;
  for (const base of [`/run/media/${user}`, `/media/${user}`]) {
    if ((0, import_fs20.existsSync)(base)) return base;
  }
  return null;
}

// server.ts
var import_fs22 = __toESM(require("fs"), 1);
var import_os9 = __toESM(require("os"), 1);
var import_child_process20 = require("child_process");
init_processManager();

// src/backend/windowFocus.ts
var import_child_process18 = require("child_process");
init_logger();
init_processManager();
init_activeDisplay();
var WINDOW_TITLE = "X-Launcher HTPC";
var missingToolWarned = false;
function run(cmd, args) {
  try {
    return (0, import_child_process18.execFileSync)(cmd, args, { encoding: "utf-8", timeout: 3e3, env: { ...process.env, ...getActiveDisplayEnv() } });
  } catch (err) {
    if (!missingToolWarned) {
      missingToolWarned = true;
      const message = err instanceof Error ? err.message : String(err);
      const warning = `[WindowFocus] comando "${cmd}" non disponibile o fallito (${message}) \u2014 le combo Select+L1+R1/Select+\u25C4\u25BA non potranno cambiare il focus della finestra. Verificare che wmctrl e xprop siano installati.`;
      writeLog("warning", warning);
      gameManager.addLog(warning, "warning");
    }
    return null;
  }
}
function getActiveWindowId() {
  const out = run("xprop", ["-root", "_NET_ACTIVE_WINDOW"]);
  if (!out) return null;
  const match = out.match(/#\s*(0x[0-9a-fA-F]+)/);
  if (!match) {
    writeLog("warning", `[WindowFocus] output xprop inatteso, impossibile ricavare la finestra attiva: "${out.trim()}"`);
    return null;
  }
  return match[1];
}
function parseWmctrlList() {
  const out = run("wmctrl", ["-l"]);
  if (!out) return [];
  return out.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).map((l) => {
    const parts = l.split(/\s+/);
    return { id: parts[0], title: parts.slice(3).join(" ") };
  });
}
function parseWmctrlListWithPids() {
  const out = run("wmctrl", ["-lp"]);
  if (!out) return [];
  return out.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).map((l) => {
    const parts = l.split(/\s+/);
    return { id: parts[0], pid: Number(parts[2]), title: parts.slice(4).join(" ") };
  }).filter((w) => Number.isFinite(w.pid));
}
function wakeDashboard() {
  const dashboardEntry = parseWmctrlList().find((w) => w.title.includes(WINDOW_TITLE));
  gameManager.addLog(
    `[WindowFocus] wakeDashboard: finestra Dashboard trovata = ${dashboardEntry ? `${dashboardEntry.id} "${dashboardEntry.title}"` : "NESSUNA"}`,
    "debug"
  );
  return run("wmctrl", ["-a", WINDOW_TITLE]) !== null;
}
function focusGameWindow() {
  const gameInfo = gameManager.getLastLaunchedGameProcessInfo();
  if (!gameInfo) {
    gameManager.addLog("[WindowFocus] focusGameWindow: nessun gioco tracciato (lastLaunchedGame assente).", "debug");
    return false;
  }
  const candidatePids = gameInfo.unit ? getScopePids(gameInfo.unit) : [gameInfo.pid];
  const windows = parseWmctrlListWithPids();
  const match = windows.find((w) => candidatePids.includes(w.pid));
  const activeBefore = getActiveWindowId();
  const success = match ? run("wmctrl", ["-i", "-a", match.id]) !== null : false;
  gameManager.addLog(
    `[WindowFocus] focusGameWindow: unit=${gameInfo.unit ?? "assente (Steam URI?)"} pid=${gameInfo.pid} candidatePids=${JSON.stringify(candidatePids)} \u2192 bersaglio=${match ? `${match.id} "${match.title}" (pid ${match.pid})` : "NESSUNA FINESTRA CORRISPONDENTE"} \u2014 attiva prima=${activeBefore ?? "null"} \u2014 wmctrl -i -a esito=${success}. Elenco finestre con pid: ${JSON.stringify(windows)}`,
    "debug"
  );
  return success;
}

// server.ts
init_activeDisplay();
init_appConfig();
init_paths();
function binaryExists10(bin) {
  try {
    (0, import_child_process20.execSync)(`which ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
async function startServer() {
  const app = (0, import_express.default)();
  const AVATAR_DIR2 = import_path19.default.join(DATA_DIR, "avatars");
  import_fs22.default.mkdirSync(AVATAR_DIR2, {
    recursive: true
  });
  writeLog(
    "system",
    `[AVATAR] Avatar directory: ${AVATAR_DIR2}`
  );
  writeLog(
    "system",
    `[ENV] .env ${import_fs22.default.existsSync(ENV_PATH) ? "trovato" : "NON trovato"}: ${ENV_PATH}`
  );
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "production";
  }
  const PORT = parseInt(process.env.PORT || "3000", 10);
  app.use(import_express.default.json());
  const sseClients = /* @__PURE__ */ new Set();
  notificationEngine.setBroadcast((event, payload) => {
    const data = `data: ${JSON.stringify({ event, payload })}

`;
    sseClients.forEach((client) => {
      try {
        client.write(data);
      } catch {
        sseClients.delete(client);
      }
    });
  });
  const notifyLibraryUpdated = () => {
    const data = `data: ${JSON.stringify({ event: "library-updated", ts: Date.now() })}

`;
    sseClients.forEach((client) => {
      try {
        client.write(data);
      } catch {
        sseClients.delete(client);
      }
    });
  };
  gameManager.onLibraryRefreshed(notifyLibraryUpdated);
  downloadManager.onComplete((gameId, gameTitle) => {
    const task = downloadManager.getTasks().find((t) => t.gameId === gameId);
    const thirdPartyDef = task ? THIRD_PARTY_LAUNCHERS.find((l) => l.storeId === task.store) : void 0;
    const pendingSharedLauncher = !!thirdPartyDef && !isLauncherBootstrapped(thirdPartyDef.id);
    if (!pendingSharedLauncher) {
      notificationEngine.emit({ type: "download-completed", gameId, gameTitle });
    }
    notifyLibraryUpdated();
  });
  downloadManager.onError((gameId, gameTitle, error, recentOutput) => {
    const plugin = gameManager.getPluginForStore(
      downloadManager.getTasks().find((t) => t.gameId === gameId)?.store ?? getGameById(gameId)?.store ?? ""
    );
    const unrecoverable = !!recentOutput && !!plugin?.detectUnrecoverableInstallFailure(recentOutput);
    if (unrecoverable) {
      updateGameConfig(gameId, { storeInstallUnavailable: true });
      const game = getGameById(gameId);
      const launcherDef = game?.requiresLauncher ? getThirdPartyLauncherDefinition(game.requiresLauncher) : void 0;
      const suggestion = launcherDef ? `Questo titolo non \xE8 scaricabile da qui \u2014 installalo da ${launcherDef.displayName} (gi\xE0 impostato come launcher condiviso per questo gioco).` : `Questo titolo non \xE8 scaricabile da qui \u2014 impostalo su "Launcher condiviso" nelle opzioni del gioco e installalo da l\xEC.`;
      notificationEngine.emit({ type: "download-error", gameId, gameTitle, error: suggestion });
      notifyLibraryUpdated();
      return;
    }
    notificationEngine.emit({ type: "download-error", gameId, gameTitle, error });
  });
  downloadManager.onKnownFixesResult((gameId, gameTitle, found, verbs) => {
    notificationEngine.emit({ type: "known-fixes-result", gameId, gameTitle, found, verbs });
  });
  await gameManager.waitReady();
  app.post("/api/library/refresh", async (req, res) => {
    await gameManager.refreshLibrary();
    res.json({ success: true, count: gameManager.getGames().length });
  });
  const { watch, existsSync: fsExists } = await import("fs");
  const { homedir: homedir8 } = await import("os");
  const steamappsPath = `${homedir8()}/.local/share/Steam/steamapps`;
  if (fsExists(steamappsPath)) {
    let debounceTimer = null;
    watch(steamappsPath, (eventType, filename) => {
      if (!filename?.endsWith(".acf")) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const action = eventType === "rename" ? "creato/rimosso" : "modificato";
        gameManager.addLog(`[STEAM] File ${filename} ${action} \u2014 aggiorno libreria...`, "system");
        await gameManager.refreshLibrary();
        gameManager.addLog("[STEAM] Libreria aggiornata.", "system");
      }, 8e3);
    });
    writeLog("system", `Watcher active on ${steamappsPath}`);
  } else {
    writeLog("system", "steamapps folder not found \u2014 watcher disabled.");
  }
  const romsPath = process.env.ROMS_PATH ? process.env.ROMS_PATH.startsWith("~") ? `${homedir8()}${process.env.ROMS_PATH.slice(1)}` : process.env.ROMS_PATH : `${homedir8()}/Roms`;
  if (fsExists(romsPath)) {
    let romsDebounce = null;
    watch(romsPath, { recursive: true }, (eventType, filename) => {
      if (!filename?.toLowerCase().endsWith(".zip")) return;
      if (romsDebounce) clearTimeout(romsDebounce);
      romsDebounce = setTimeout(async () => {
        gameManager.addLog(`[CLASSIC] Modifica ROM rilevata (${filename}) \u2014 aggiorno libreria...`, "system");
        await gameManager.refreshLibrary();
        gameManager.addLog("[CLASSIC] Libreria aggiornata.", "system");
      }, 2e3);
    });
    writeLog("system", `ROM watcher active on ${romsPath}`);
  } else {
    writeLog("system", `ROM folder not found (${romsPath}) \u2014 create ~/Roms/ or set ROMS_PATH in .env`);
  }
  app.get("/api/retroarch/cores", async (req, res) => {
    const { readdirSync: readdirSync10, existsSync: fsEx, realpathSync } = await import("fs");
    const { execSync: execSync15 } = await import("child_process");
    const { COMPATIBLE_CORES_BY_SYSTEM: COMPATIBLE_CORES_BY_SYSTEM2, getDefaultCoreForSystem: getDefaultCoreForSystem2 } = await Promise.resolve().then(() => (init_classicPlugin(), classicPlugin_exports));
    const systemFilter = typeof req.query.system === "string" ? req.query.system : void 0;
    const corePaths = [
      `${homedir8()}/.config/retroarch/cores`,
      `${homedir8()}/.local/share/retroarch/cores`,
      `${homedir8()}/.var/app/org.libretro.RetroArch/config/retroarch/cores`,
      "/usr/lib/libretro",
      "/usr/lib64/libretro",
      "/usr/share/libretro/cores"
    ];
    const seen = /* @__PURE__ */ new Set();
    let cores = [];
    for (const dir of corePaths) {
      if (!fsEx(dir)) continue;
      try {
        const files = readdirSync10(dir).filter((f) => f.endsWith("_libretro.so"));
        for (const file of files) {
          const fullPath = `${dir}/${file}`;
          let realPath = fullPath;
          try {
            realPath = realpathSync(fullPath);
          } catch {
          }
          if (seen.has(realPath)) continue;
          seen.add(realPath);
          cores.push({ name: file.replace("_libretro.so", ""), path: fullPath });
        }
      } catch {
      }
    }
    let defaultCore;
    if (systemFilter) {
      const compatible = COMPATIBLE_CORES_BY_SYSTEM2[systemFilter] ?? [];
      cores = cores.filter((c) => compatible.includes(c.name));
      defaultCore = getDefaultCoreForSystem2(systemFilter)?.replace("_libretro.so", "");
    }
    cores.sort((a, b) => a.name.localeCompare(b.name));
    let retroarchAvailable = false;
    let retroarchVersion = "";
    try {
      retroarchVersion = execSync15("retroarch --version 2>&1", { timeout: 3e3 }).toString().trim().split("\n")[0];
      retroarchAvailable = true;
    } catch {
    }
    res.json({ retroarchAvailable, retroarchVersion, cores, defaultCore });
  });
  app.patch("/api/games/:id/retroarch", async (req, res) => {
    const { libretroCore } = req.body;
    gameManager.updateGameConfig(req.params.id, { libretroCore });
    res.json({ success: true });
  });
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 3e4);
    sseClients.add(res);
    writeLog("system", `[SSE] Client connected (total: ${sseClients.size})`);
    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });
  app.get("/api/debug", async (req, res) => {
    const { homedir: homedir9 } = await import("os");
    const { existsSync: existsSync19, readdirSync: readdirSync10 } = await import("fs");
    const { getAllGames: getAllGames2 } = await Promise.resolve().then(() => (init_db(), db_exports));
    const steamPaths = [
      `${homedir9()}/.local/share/Steam/steamapps`,
      `${homedir9()}/.steam/steam/steamapps`,
      `${homedir9()}/.steam/debian-installation/steamapps`
    ];
    const steamDebug = {};
    for (const p of steamPaths) {
      if (existsSync19(p)) {
        const acfFiles = readdirSync10(p).filter((f) => f.endsWith(".acf"));
        steamDebug[p] = { exists: true, acfCount: acfFiles.length, acfFiles };
      } else {
        steamDebug[p] = { exists: false };
      }
    }
    const dbGames = getAllGames2();
    res.json({
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV,
      cwd: process.cwd(),
      steamPaths: steamDebug,
      dbGameCount: dbGames.length,
      dbGames: dbGames.map((g) => ({ id: g.id, title: g.title, store: g.store })),
      apiGames: gameManager.getGames().map((g) => ({ id: g.id, title: g.title, store: g.store }))
    });
  });
  app.get("/api/status", (req, res) => {
    res.json({ status: "X-Launcher Daemon Active", uptime: process.uptime() });
  });
  app.get("/api/games", (req, res) => {
    const query = req.query;
    const result = gameManager.getGames({
      store: query.store,
      search: query.search,
      genre: query.genre,
      category: query.category,
      sortBy: query.sortBy,
      order: query.order
    });
    gameManager.addLog(`[API] GET /api/games?store=${query.store ?? "All"} \u2192 ${result.length} giochi, installati: ${result.filter((g) => g.isInstalled).length}`, "system");
    res.json(result);
  });
  app.get("/api/stores", async (req, res) => {
    res.json(await gameManager.syncStores());
  });
  app.post("/api/stores/auth-code", async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: "Codice mancante" });
    try {
      let authCode = code.trim();
      if (authCode.startsWith("{")) {
        try {
          const parsed = JSON.parse(authCode);
          authCode = parsed.authorizationCode ?? parsed.sid ?? authCode;
        } catch {
        }
      }
      const { execFileSync: execFileSync8 } = require("child_process");
      execFileSync8("legendary", ["auth", "--code", authCode], { encoding: "utf-8", timeout: 2e4 });
      writeLog("auth", "[Epic] auth-code: authentication completed via authorization code");
      res.json({ success: true, message: "Autenticazione Epic completata." });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeLog("error", `[Epic] auth-code error: ${message}`);
      res.json({ success: false, message: `Errore: ${message}. Prova da terminale: legendary auth` });
    }
  });
  app.post("/api/stores/login", async (req, res) => {
    const result = await gameManager.loginToStore(req.body.id);
    res.json(result);
  });
  app.post("/api/stores/logout", async (req, res) => {
    const result = await gameManager.logoutFromStore(req.body.id);
    res.json(result);
  });
  app.get("/api/stores/login-status/:id", async (req, res) => {
    const plugin = gameManager.plugins?.find((p) => p.id === req.params.id);
    if (!plugin) return res.status(404).json({ authenticated: false });
    const authenticated = await plugin.isAuthenticated();
    res.json({ authenticated });
  });
  app.get("/api/runners/installable", async (req, res) => {
    const list = await compatibilityManager.getInstallableRunners();
    res.json(list);
  });
  app.get("/api/system/disk", (req, res) => {
    res.json(compatibilityManager.getDiskUsage());
  });
  app.get("/api/system/hostname", (_req, res) => {
    res.json({ hostname: import_os9.default.hostname() });
  });
  app.get("/api/system/game-running", (_req, res) => {
    res.json(gameManager.isLastLaunchedGameRunning());
  });
  app.post("/api/system/input-wake", (_req, res) => {
    res.json({ success: wakeDashboard() });
  });
  app.post("/api/system/input-focus-game", (_req, res) => {
    res.json({ success: focusGameWindow() });
  });
  app.post("/api/system/active-display", (req, res) => {
    const { display, waylandDisplay, kind, resolution } = req.body ?? {};
    setActiveDisplay(display, waylandDisplay, kind, resolution);
    writeLog("system", `[ACTIVE-DISPLAY] Sessione attiva segnalata: kind=${kind ?? "desktop"} DISPLAY=${display ?? "(non impostato)"} WAYLAND_DISPLAY=${waylandDisplay ?? "(non impostato)"}${resolution ? ` risoluzione=${resolution}` : ""}`);
    res.json({ success: true });
  });
  app.get("/api/system/session-info", (_req, res) => {
    res.json(getActiveSessionInfo());
  });
  app.post("/api/system/gamescope-resolution/cycle", (_req, res) => {
    const current = readAppConfig();
    const next = nextGamescopeResolution(current.gamescopeResolution);
    writeAppConfig({ gamescopeResolution: next });
    writeLog("system", `[GAMESCOPE] Risoluzione Kiosk selezionata: ${next} (era ${current.gamescopeResolution}) \u2014 non ancora applicata.`);
    res.json({ resolution: next });
  });
  app.post("/api/system/gamescope-resolution/apply", (_req, res) => {
    const { gamescopeResolution } = readAppConfig();
    const sessionInfo = getActiveSessionInfo();
    let restarted = false;
    if (sessionInfo.kind === "kiosk") {
      const pidFile = import_path19.default.join(DATA_DIR, "gamescope-session.pid");
      try {
        if (import_fs22.default.existsSync(pidFile)) {
          const pid = parseInt(import_fs22.default.readFileSync(pidFile, "utf-8").trim(), 10);
          if (Number.isFinite(pid) && pid > 0) {
            process.kill(pid, "SIGUSR1");
            restarted = true;
            writeLog("system", `[GAMESCOPE] Segnale di riavvio inviato a gamescope-session.sh (PID ${pid}) per applicare ${gamescopeResolution}.`);
          }
        } else {
          writeLog("warning", `[GAMESCOPE] Sessione Kiosk segnalata attiva ma ${pidFile} non trovato \u2014 impossibile far riavviare gamescope ora.`);
        }
      } catch (err) {
        writeLog("error", `[GAMESCOPE] Invio segnale di riavvio fallito: ${err instanceof Error ? err.message : err}`);
      }
    }
    res.json({ resolution: gamescopeResolution, restarted });
  });
  app.get("/api/logs", (req, res) => {
    const limitParam = parseInt(req.query.limit) || 200;
    const limit = Math.min(Math.max(1, limitParam), 500);
    const typeParam = req.query.type?.trim();
    let logs = gameManager.getLogs(limit);
    if (typeParam) {
      const allowed = new Set(typeParam.split(",").map((s) => s.trim().toLowerCase()));
      logs = logs.filter((l) => allowed.has(l.type));
    }
    res.json(logs);
  });
  app.post("/api/logs", (req, res) => {
    const message = req.body?.message;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ success: false, message: "message required" });
    }
    const validTypes = ["debug", "info", "system", "warning", "error", "auth", "download", "launch"];
    const type = validTypes.includes(req.body?.type) ? req.body.type : "debug";
    gameManager.addLog(message, type);
    res.json({ success: true });
  });
  app.post("/api/open-url", (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ success: false, message: "url required" });
    }
    try {
      (0, import_child_process20.execSync)("which firefox", { stdio: "ignore" });
      (0, import_child_process20.spawn)("firefox", [url], { detached: true, stdio: "ignore" }).unref();
    } catch {
      try {
        (0, import_child_process20.execSync)("which xdg-open", { stdio: "ignore" });
        (0, import_child_process20.spawn)("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
      } catch {
        writeLog("warning", `[open-url] Nessun browser trovato (firefox/xdg-open) \u2014 apri manualmente: ${url}`);
        return res.json({ success: false, message: "Nessun browser trovato." });
      }
    }
    res.json({ success: true });
  });
  app.get("/api/downloads", (req, res) => {
    res.json(downloadManager.getTasks());
  });
  app.post("/api/downloads/start", async (req, res) => {
    const { gameId, winetricksVerbs, disableWineSync, useKnownFixes, installOnlyEnv } = req.body;
    if (!gameId) return res.status(400).json({ error: "gameId required" });
    const game = gameManager.getGames().find((g) => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });
    const result = downloadManager.addTask(game.id, game.title, game.store, winetricksVerbs, disableWineSync, useKnownFixes, installOnlyEnv);
    res.json(result);
  });
  app.post("/api/downloads/pause", (req, res) => {
    downloadManager.pauseTask(req.body.gameId ?? req.body.id);
    res.json({ success: true });
  });
  app.post("/api/downloads/resume", (req, res) => {
    downloadManager.resumeTask(req.body.gameId ?? req.body.id);
    res.json({ success: true });
  });
  app.post("/api/downloads/cancel", (req, res) => {
    downloadManager.cancelTask(req.body.gameId ?? req.body.id);
    res.json({ success: true });
  });
  app.post("/api/downloads/installer-continue", (req, res) => {
    const gameId = req.body.gameId ?? req.body.id;
    if (!gameId) return res.status(400).json({ success: false, message: "gameId required" });
    res.json(downloadManager.continueInstaller(gameId));
  });
  app.post("/api/downloads/installer-browse", async (req, res) => {
    const gameId = req.body.gameId ?? req.body.id;
    if (!gameId) return res.status(400).json({ success: false, message: "gameId required" });
    res.json(await downloadManager.browseInstaller(gameId));
  });
  app.post("/api/downloads/installer-select", (req, res) => {
    const gameId = req.body.gameId ?? req.body.id;
    const filePath = req.body.path;
    if (!gameId || !filePath) return res.status(400).json({ success: false, message: "gameId e path richiesti" });
    res.json(downloadManager.confirmInstallerPath(gameId, filePath));
  });
  app.get("/api/filesystem/list", (req, res) => {
    const dirPath = req.query.path;
    if (!dirPath) return res.status(400).json({ error: "path richiesto" });
    const extensions = typeof req.query.extensions === "string" && req.query.extensions.length > 0 ? req.query.extensions.split(",") : void 0;
    res.json(listDirectory(dirPath, extensions));
  });
  app.get("/api/filesystem/quick-links", (_req, res) => {
    res.json({
      home: import_os9.default.homedir(),
      downloads: resolveDownloadsDir(),
      removableMedia: resolveRemovableMediaRoot()
    });
  });
  app.get("/api/runners", (req, res) => {
    res.json(compatibilityManager.getAvailableRunners());
  });
  app.post("/api/runners/download", async (req, res) => {
    const { id } = req.body;
    await compatibilityManager.downloadProton(id, (msg) => gameManager.addLog(msg, "system"));
    await gameManager.refreshRunners();
    res.json({ success: true });
  });
  app.get("/api/runners/install-stream", async (req, res) => {
    const id = req.query.id;
    if (!id) {
      res.status(400).end();
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = (type, data) => {
      try {
        res.write(`event: ${type}
data: ${JSON.stringify({ message: data })}

`);
      } catch {
      }
    };
    try {
      await compatibilityManager.downloadProton(id, (msg) => {
        gameManager.addLog(msg, "system");
        send("log", msg);
      });
      await gameManager.refreshRunners();
      await gameManager.refreshRunners();
      send("done", `${id} installato con successo.`);
      notificationEngine.emit({ type: "runner-installed", runnerId: id });
    } catch (err) {
      const errMsg = `Installazione fallita: ${err instanceof Error ? err.message : String(err)}`;
      send("error", errMsg);
      notificationEngine.emit({ type: "runner-error", runnerId: id, error: errMsg });
    }
    res.end();
  });
  app.get("/api/runners/uninstall-stream", async (req, res) => {
    const id = req.query.id;
    if (!id) {
      res.status(400).end();
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = (type, data) => {
      try {
        res.write(`event: ${type}
data: ${JSON.stringify({ message: data })}

`);
      } catch {
      }
    };
    try {
      await compatibilityManager.uninstallProton(id, (msg) => {
        gameManager.addLog(msg, "system");
        send("log", msg);
      });
      await gameManager.refreshRunners();
      await gameManager.refreshRunners();
      send("done", `${id} disinstallato con successo.`);
      notificationEngine.emit({ type: "runner-uninstalled", runnerId: id });
    } catch (err) {
      const errMsg = `Disinstallazione fallita: ${err instanceof Error ? err.message : String(err)}`;
      send("error", errMsg);
      notificationEngine.emit({ type: "runner-error", runnerId: id, error: errMsg });
    }
    res.end();
  });
  app.post("/api/runners/refresh", async (req, res) => {
    const runners = await gameManager.refreshRunners();
    res.json({ runners });
  });
  app.get("/api/games/:id/launch-stream", (req, res) => {
    const gameId = req.params.id;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = (event) => {
      if (!event) return;
      try {
        res.write(`event: phase
data: ${JSON.stringify(event)}

`);
      } catch {
      }
    };
    send(getLastLaunchPhase(gameId));
    const unsubscribe = subscribeLaunchPhase(gameId, send);
    req.on("close", () => {
      unsubscribe();
    });
  });
  app.post("/api/games/:id/cancel-launch", (req, res) => {
    const gameId = req.params.id;
    res.json({ success: requestLaunchCancel(gameId) });
  });
  app.post("/api/steam/bigpicture", (req, res) => {
    const { openSteamBigPicture: openSteamBigPicture2 } = (init_implementations(), __toCommonJS(implementations_exports));
    res.json(openSteamBigPicture2());
  });
  app.get("/api/shared-launchers", (_req, res) => {
    const list = THIRD_PARTY_LAUNCHERS.map((def) => {
      const state = getSharedLauncherState(def.id);
      const compatProfile = getCompatProfile(`${def.id}-launcher`);
      return {
        id: def.id,
        displayName: def.displayName,
        // v2.0.41-dev.22 — richiesta utente, bug reale confermato su
        // hardware reale (Dead Space 2/EA App: la card lanciava EA App
        // due volte, la prima bloccava tutto il resto). Causa: il
        // frontend non aveva mai ricevuto l'equivalente di
        // effectiveSharedLauncherId (gameManager.ts, dev.19) — l'unico
        // modo per l'overlay di sapere "questo gioco è nativo di QUESTO
        // launcher condiviso" (store === storeId, nessun requiresLauncher
        // esplicito) era mancante, quindi lo switch "Bypass store" non
        // poteva mai comparire per un gioco nativo, impedendo all'utente
        // di attivare esattamente l'opzione che evita il pre-avvio
        // anticipato del launcher condiviso (che confligge con il gioco
        // stesso quando è LUI a trascinarsi dietro il launcher, stesso
        // meccanismo già osservato per Assassin's Creed Syndicate).
        storeId: def.storeId,
        verified: def.verified,
        bootstrapped: !!state?.bootstrappedAt,
        runner: state?.runner ?? null,
        umuRun: compatProfile?.umuRun ?? false,
        // Step 19d — distingue i launcher gia' costruiti (Ubisoft
        // Connect, installerUrl compilato) da quelli ancora placeholder
        // (EA App/Battle.net/Rockstar, installerUrl vuoto) — usato dallo
        // switch "Launcher condiviso" in Game Options per oscurare le
        // voci non ancora selezionabili, stesso principio gia' in uso
        // per i tile EAC/BattlEye quando il runner e' incompatibile.
        available: !!def.installerUrl
      };
    });
    res.json(list);
  });
  app.get("/api/shared-launchers/:id/runners", (_req, res) => {
    const allRunners = compatibilityManager.getAvailableRunners();
    const protonRunners = allRunners.filter((r) => /proton/i.test(r.id));
    res.json(protonRunners);
  });
  app.post("/api/shared-launchers/:id/open-installer-page", (req, res) => {
    res.json(openInstallerPage(req.params.id));
  });
  app.post("/api/shared-launchers/:id/bootstrap", (req, res) => {
    const { runner, launcherExe } = req.body;
    if (!runner || !launcherExe) {
      res.status(400).json({ success: false, message: "runner e launcherExe sono richiesti." });
      return;
    }
    try {
      markLauncherBootstrapped(req.params.id, runner, launcherExe);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, message: err instanceof Error ? err.message : String(err) });
    }
  });
  app.post("/api/shared-launchers/:id/launch", async (req, res) => {
    const result = await launchSharedLauncher(req.params.id);
    res.json(result);
  });
  app.post("/api/shared-launchers/:id/close", async (req, res) => {
    const result = await closeSharedLauncher(req.params.id);
    res.json(result);
  });
  app.get("/api/process-manager/list", (_req, res) => {
    const active = listActive().map((info) => ({
      ...info,
      title: info.kind === "game" ? getGameById(info.id)?.title ?? info.title : getThirdPartyLauncherDefinition(info.id)?.displayName ?? info.title
    }));
    res.json(active);
  });
  app.post("/api/process-manager/:unit/kill", async (req, res) => {
    const info = getScopeInfo(req.params.unit);
    if (!info) {
      res.json({ success: false, message: "Processo non pi\xF9 attivo." });
      return;
    }
    const result = info.kind === "shared-launcher" ? await closeSharedLauncher(info.id) : killScope(info.unit);
    res.json(result);
  });
  app.get("/api/fixes/:gameId", (req, res) => {
    res.json(compatibilityManager.getSuggestedFixes(req.params.gameId));
  });
  app.get("/api/system-tools", (req, res) => {
    res.json(compatibilityManager.detectSystemTools());
  });
  app.post("/api/launch", async (req, res) => {
    const { id, launchArgsOverride } = req.body;
    const result = await gameManager.launchGame(id, launchArgsOverride);
    if (!result.success) {
      const game = gameManager.getGames().find((g) => g.id === id);
      const gameTitle = game?.title ?? id;
      if (result.message?.includes("disabilitato")) {
        notificationEngine.emit({ type: "launch-blocked", gameId: id, gameTitle, reason: result.message });
      } else {
        notificationEngine.emit({ type: "launch-error", gameId: id, gameTitle, error: result.message ?? "Avvio fallito" });
      }
    }
    res.json(result);
  });
  app.get("/api/games/recent", (req, res) => {
    const limit = parseInt(String(req.query.limit ?? "3"), 10) || 3;
    res.json(getRecentlyLaunched(limit));
  });
  app.patch("/api/games/:id/config", (req, res) => {
    const result = gameManager.updateGameConfig(req.params.id, req.body);
    res.json(result);
  });
  app.delete("/api/games/:id/uninstall", async (req, res) => {
    const result = await gameManager.uninstallGame(req.params.id);
    if (result.success) notifyLibraryUpdated();
    res.json(result);
  });
  app.patch("/api/games/:id/compat", (req, res) => {
    const result = gameManager.updateCompatProfile(req.params.id, req.body);
    res.json(result);
  });
  app.patch("/api/games/:id/verify", (req, res) => {
    const { method } = req.body;
    if (method !== "auto" && method !== "manual") {
      return res.status(400).json({ success: false, message: "method deve essere 'auto' o 'manual'" });
    }
    const result = gameManager.markGameVerified(req.params.id, method);
    res.json(result);
  });
  app.delete("/api/games/:id/verify", (req, res) => {
    const result = gameManager.unmarkGameVerified(req.params.id);
    res.json(result);
  });
  app.get("/api/system-info", (_req, res) => {
    try {
      res.json(getSystemInfo());
    } catch (err) {
      writeLog("error", `[API] /system-info fallita: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: "Impossibile rilevare l'hardware" });
    }
  });
  app.get("/api/games/:id/compat", (req, res) => {
    const { getCompatProfile: getCompatProfile2 } = (init_db(), __toCommonJS(db_exports));
    res.json(getCompatProfile2(req.params.id) ?? {});
  });
  app.post("/api/games/:id/remaster", async (req, res) => {
    try {
      const { enabled } = req.body;
      const result = await gameManager.setRemasterEnabled(req.params.id, enabled === true);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeLog("error", `[API] /remaster fallita per ${req.params.id}: ${message}`);
      res.status(500).json({ success: false, message: message ?? "Errore interno" });
    }
  });
  app.get("/api/games/:id/predicted-size", async (req, res) => {
    try {
      const bytes = await gameManager.getPredictedInstallSize(req.params.id);
      res.json({ bytes });
    } catch (err) {
      writeLog("error", `[API] /predicted-size fallita per ${req.params.id}: ${err instanceof Error ? err.message : String(err)}`);
      res.json({ bytes: null });
    }
  });
  app.get("/api/plugins", (_req, res) => {
    res.json(gameManager.getPluginRegistry());
  });
  app.patch("/api/plugins/:storeId", async (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
    const result = await gameManager.setPluginEnabled(
      decodeURIComponent(req.params.storeId),
      enabled
    );
    res.json(result);
  });
  app.use(
    "/avatars",
    import_express.default.static(AVATAR_DIR2)
  );
  app.get("/api/avatars/info", (_req, res) => {
    res.json({
      dir: AVATAR_DIR2,
      exists: import_fs22.default.existsSync(AVATAR_DIR2)
    });
  });
  app.get("/api/avatars", (_req, res) => {
    try {
      const avatars = import_fs22.default.readdirSync(AVATAR_DIR2).filter(
        (file) => /\.(png|jpg|jpeg|webp|gif)$/i.test(file)
      ).map((file) => ({
        name: file,
        url: `/avatars/${file}`
      }));
      res.json(avatars);
    } catch (err) {
      writeLog(
        "error",
        `[AVATAR] ${String(err)}`
      );
      res.json([]);
    }
  });
  app.get("/api/notifications", (_req, res) => {
    res.json(notificationEngine.getRecent(100));
  });
  app.get("/api/notifications/pending", (_req, res) => {
    res.json(notificationEngine.getPending());
  });
  app.patch("/api/notifications/:id/status", (req, res) => {
    const { status } = req.body;
    const allowed = ["pending", "applied", "resolved", "failed", "dismissed"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    notificationEngine.updateStatus(req.params.id, status);
    res.json({ success: true });
    if (status === "failed") {
      const notif = notificationEngine.getRecent(50).find((n) => n.id === req.params.id);
      if (notif?.source === "validation" && notif.game_id) {
        const game = getGameById(notif.game_id);
        if (game) {
          const def = THIRD_PARTY_LAUNCHERS.find((l) => l.storeId === game.store) ?? (game.requiresLauncher ? getThirdPartyLauncherDefinition(game.requiresLauncher) : void 0);
          if (def?.troubleshootingTips?.length) {
            const alreadyShown = notificationEngine.getRecent(200).some((n) => n.source === "launcher-tips" && n.game_id === game.id);
            if (!alreadyShown) {
              const lang = readAppConfig().language;
              const tips = def.troubleshootingTips.map((t) => lang === "en" && t.textEn ? t.textEn : t.text);
              notificationEngine.emit({
                type: "launcher-troubleshooting-tips",
                launcherName: def.displayName,
                gameId: game.id,
                gameTitle: game.title,
                tips
              });
            }
          }
        }
      }
    }
  });
  app.get("/api/version", (_req, res) => {
    try {
      const { readFileSync: readFileSync11 } = require("fs");
      const { join } = require("path");
      const pkg = JSON.parse(readFileSync11(join(process.cwd(), "package.json"), "utf-8"));
      res.json({ version: pkg.version ?? "0.0.0" });
    } catch {
      res.json({ version: "0.0.0" });
    }
  });
  app.get("/api/config", (_req, res) => {
    res.json({
      ...readAppConfig(),
      dedicatedSession: process.env.X_LAUNCHER_DEDICATED_SESSION === "true",
      // Step 19b (v1.1.63) — autorilevamento lingua di sistema: distingue
      // "language non è mai stato scritto nel file" (primo avvio mai, il
      // frontend deve autorilevare da navigator.language) da "è già stato
      // scritto, anche solo il default 'it'" (avvio successivo, rispetta
      // quanto persistito) — vedi hasLanguageBeenSet() in appConfig.ts.
      languageIsUserSet: hasLanguageBeenSet(),
      // Richiesta utente — preset "Filtro CRT" per RetroArch: il percorso
      // assoluto va risolto qui (il progetto può girare da /opt/x-launcher
      // o da un checkout di sviluppo in una cartella qualsiasi), non
      // hardcoded lato frontend. process.cwd() è la working directory del
      // demone Node, impostata da kiosk-launch.sh/xdash.service alla radice
      // del progetto — stesso presupposto già usato altrove (vedi
      // GAMES_ROOT in downloadManager.ts).
      //
      // v1.1.77 — test dal vivo hanno confermato che --appendconfig=
      // (il meccanismo per cui questo file .cfg era pensato) viene
      // ignorato del tutto da RetroArch, causa non ancora capita. Il
      // frontend non consuma più questo campo (il pulsante "Filtro CRT"
      // che lo usava è stato rimosso, sostituito da una shortcut
      // --set-shader nei suggerimenti della tastiera virtuale). Lasciato
      // qui, non rimosso: torna utile quando si capirà perché la
      // configurazione custom viene ignorata.
      retroarchCrtPresetPath: import_path19.default.join(process.cwd(), "assets", "retroarch-presets", "crt-easymode.cfg")
    });
  });
  app.patch("/api/config", (req, res) => {
    try {
      const next = writeAppConfig(req.body ?? {});
      writeLog("system", `[CONFIG] Preferences updated: ${JSON.stringify(next)}`);
      res.json(next);
    } catch (err) {
      res.status(500).json({ success: false, message: err instanceof Error ? err.message : String(err) });
    }
  });
  app.post("/api/library/refresh", async (_req, res) => {
    res.json({ success: true });
    await gameManager.refreshLibrary();
  });
  app.get("/api/kb", (_req, res) => {
    res.json(knowledgeBase.getAll());
  });
  app.get("/api/kb/stats", (_req, res) => {
    res.json(knowledgeBase.stats());
  });
  app.get("/api/kb/lookup", (req, res) => {
    const errorText = req.query.error ?? "";
    const match = knowledgeBase.lookup(errorText);
    res.json(match ?? null);
  });
  app.delete("/api/kb/:id", (req, res) => {
    knowledgeBase.delete(req.params.id);
    res.json({ success: true });
  });
  app.post("/api/kb/reload-seed", (_req, res) => {
    knowledgeBase.reloadSeed();
    res.json({ success: true, stats: knowledgeBase.stats() });
  });
  app.post("/api/kb/reset", (_req, res) => {
    knowledgeBase.resetToSeed();
    res.json({ success: true, stats: knowledgeBase.stats() });
  });
  app.patch("/api/kb/threshold", (req, res) => {
    const { value } = req.body;
    if (typeof value !== "number") return res.status(400).json({ error: "value required" });
    knowledgeBase.setThreshold(value);
    res.json({ success: true, threshold: value });
  });
  app.post("/api/kb/writeback/resolved", (req, res) => {
    const { pattern, solution, actionType, actionParams, confidence, existingId } = req.body;
    knowledgeBase.writebackResolved({ pattern, solution, actionType, actionParams, confidence, existingId });
    res.json({ success: true });
  });
  app.get("/api/ai/providers", (_req, res) => {
    const usage = getAiUsageThisMonth();
    res.json(getAllAiProviderCredentials().map((c) => ({
      ...c,
      // Non rimandare mai la key in chiaro nella risposta GET, anche se
      // è salvata in chiaro nel DB (vedi nota in db.ts) — nessun motivo
      // di esporla di nuovo lato client oltre al momento in cui viene
      // scritta.
      apiKey: c.apiKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : void 0,
      usageThisMonth: usage.byProvider[c.providerId] ?? 0
    })));
  });
  app.post("/api/ai/providers/:id", async (req, res) => {
    const { enabled, apiKey, baseUrl, model, priority, tokenBudget } = req.body;
    const existing = getAiProviderCredential(req.params.id);
    const { buildProvider: buildProvider2 } = await Promise.resolve().then(() => (init_registry(), registry_exports));
    const probe = buildProvider2({ providerId: req.params.id, enabled: false, priority: 0 });
    const isLocalProvider = probe ? !probe.requiresApiKey : false;
    const resolvedTokenBudget = isLocalProvider ? void 0 : typeof tokenBudget === "number" ? tokenBudget : existing?.tokenBudget ?? 5e6;
    upsertAiProviderCredential({
      providerId: req.params.id,
      enabled: Boolean(enabled),
      apiKey: apiKey !== void 0 && apiKey !== "" ? apiKey : existing?.apiKey,
      baseUrl: baseUrl !== void 0 ? baseUrl : existing?.baseUrl,
      model: model !== void 0 ? model : existing?.model,
      priority: typeof priority === "number" ? priority : existing?.priority ?? 999,
      tokenBudget: resolvedTokenBudget,
      budgetWarnedMonth: existing?.budgetWarnedMonth
    });
    res.json({ success: true });
  });
  app.delete("/api/ai/providers/:id", (req, res) => {
    deleteAiProviderCredential(req.params.id);
    res.json({ success: true });
  });
  app.post("/api/ai/providers/:id/test", async (req, res) => {
    const { apiKey, baseUrl, model } = req.body;
    const existing = getAiProviderCredential(req.params.id);
    const { buildProvider: buildProvider2 } = await Promise.resolve().then(() => (init_registry(), registry_exports));
    const provider = buildProvider2({
      providerId: req.params.id,
      enabled: true,
      apiKey: apiKey || existing?.apiKey,
      baseUrl: baseUrl || existing?.baseUrl,
      model: model || existing?.model,
      priority: 0
    });
    if (!provider) {
      return res.json({ success: false, message: "Provider sconosciuto." });
    }
    if (!provider.isConfigured()) {
      return res.json({ success: false, message: "Configurazione incompleta (API key o endpoint mancanti)." });
    }
    try {
      const response = await provider.askForFix({
        errorText: "test di connessione \u2014 ignora, nessun errore reale da diagnosticare",
        pastAttempts: []
      });
      const gotRealResponse = response.usage.inputTokens > 0 || response.usage.outputTokens > 0;
      res.json({
        success: gotRealResponse,
        message: gotRealResponse ? "Connessione riuscita." : response.kind === "give_up" ? response.reason : "Nessuna risposta valida dal provider."
      });
    } catch (err) {
      res.json({ success: false, message: `Errore inatteso: ${err instanceof Error ? err.message : err}` });
    }
  });
  app.get("/api/cloud-backup/providers", async (_req, res) => {
    const { getAllCloudBackupProviders: getAllCloudBackupProviders2 } = await Promise.resolve().then(() => (init_registry2(), registry_exports2));
    const providers = getAllCloudBackupProviders2();
    const result = await Promise.all(providers.map(async (p) => {
      const cred = getCloudBackupCredential(p.id);
      return {
        providerId: p.id,
        name: p.name,
        description: p.description,
        enabled: cred?.enabled ?? false,
        hasCredentials: !!(cred?.clientId && cred?.clientSecret),
        authenticated: await p.isAuthenticated(),
        lastBackupAt: cred?.lastBackupAt ?? null
      };
    }));
    res.json(result);
  });
  app.post("/api/cloud-backup/providers/:id", (req, res) => {
    const { enabled, clientId, clientSecret } = req.body;
    const existing = getCloudBackupCredential(req.params.id);
    upsertCloudBackupCredential({
      providerId: req.params.id,
      enabled: Boolean(enabled),
      clientId: clientId || existing?.clientId,
      clientSecret: clientSecret || existing?.clientSecret,
      lastBackupAt: existing?.lastBackupAt
    });
    res.json({ success: true });
  });
  app.post("/api/cloud-backup/providers/:id/login", async (req, res) => {
    const { getCloudBackupProvider: getCloudBackupProvider2 } = await Promise.resolve().then(() => (init_registry2(), registry_exports2));
    const provider = getCloudBackupProvider2(req.params.id);
    if (!provider) return res.status(404).json({ success: false, message: "Provider sconosciuto." });
    const result = await provider.login();
    res.json(result);
  });
  app.post("/api/cloud-backup/providers/:id/logout", async (req, res) => {
    const { getCloudBackupProvider: getCloudBackupProvider2 } = await Promise.resolve().then(() => (init_registry2(), registry_exports2));
    const provider = getCloudBackupProvider2(req.params.id);
    if (!provider) return res.status(404).json({ success: false, message: "Provider sconosciuto." });
    const result = await provider.logout();
    res.json(result);
  });
  app.post("/api/cloud-backup/backup", async (_req, res) => {
    const { getAllCloudBackupCredentials: getAllCloudBackupCredentials2 } = db_exports;
    const active = getAllCloudBackupCredentials2().find((c) => c.enabled);
    if (!active) return res.json({ success: false, message: "Nessun provider di Cloud Backup attivo." });
    const { getCloudBackupProvider: getCloudBackupProvider2 } = await Promise.resolve().then(() => (init_registry2(), registry_exports2));
    const provider = getCloudBackupProvider2(active.providerId);
    if (!provider) return res.json({ success: false, message: "Provider sconosciuto." });
    try {
      const { buildBackupBundle: buildBackupBundle2, BACKUP_FILENAME: BACKUP_FILENAME2 } = await Promise.resolve().then(() => (init_bundle(), bundle_exports));
      const bundle = buildBackupBundle2();
      const result = await provider.uploadBackup(bundle, BACKUP_FILENAME2);
      res.json(result);
    } catch (err) {
      writeLog("error", `[CloudBackup] Backup fallito: ${err}`);
      res.json({ success: false, message: `Errore inatteso: ${err}` });
    }
  });
  app.post("/api/cloud-backup/restore", async (_req, res) => {
    const active = getAllCloudBackupCredentials().find((c) => c.enabled);
    if (!active) return res.json({ success: false, message: "Nessun provider di Cloud Backup attivo." });
    const { getCloudBackupProvider: getCloudBackupProvider2 } = await Promise.resolve().then(() => (init_registry2(), registry_exports2));
    const provider = getCloudBackupProvider2(active.providerId);
    if (!provider) return res.json({ success: false, message: "Provider sconosciuto." });
    try {
      const downloadResult = await provider.downloadLatestBackup();
      if (!downloadResult.success || !downloadResult.data) {
        return res.json({ success: false, message: downloadResult.message });
      }
      const { restoreFromBundle: restoreFromBundle2 } = await Promise.resolve().then(() => (init_bundle(), bundle_exports));
      const result = restoreFromBundle2(downloadResult.data);
      res.json(result);
    } catch (err) {
      writeLog("error", `[CloudBackup] Ripristino fallito: ${err}`);
      res.json({ success: false, message: `Errore inatteso: ${err}` });
    }
  });
  app.get("/api/ai/ollama/models", async (_req, res) => {
    const baseUrl = getAiProviderCredential("ollama")?.baseUrl || "http://localhost:11434";
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
        signal: AbortSignal.timeout(2e3)
      });
      if (!response.ok) {
        return res.json({ available: false, models: [] });
      }
      const data = await response.json();
      const models = Array.isArray(data?.models) ? data.models.map((m) => ({
        name: m.name,
        sizeBytes: m.size ?? 0,
        parameterSize: m.details?.parameter_size ?? null,
        quantization: m.details?.quantization_level ?? null
      })) : [];
      res.json({ available: true, models });
    } catch {
      res.json({ available: false, models: [] });
    }
  });
  app.post("/api/kb/writeback/failed", (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    knowledgeBase.writebackFailed(id);
    res.json({ success: true });
  });
  app.post("/api/ai/attempt-failed", (req, res) => {
    const { gameId, errorText, solution, actionType, actionParams, confidence } = req.body;
    if (!gameId || !errorText) return res.status(400).json({ error: "gameId e errorText richiesti" });
    const record = recordFailure(gameId, errorText, {
      solution: solution ?? "",
      actionType: actionType ?? "none",
      actionParams: actionParams ?? {},
      confidence: confidence ?? "low"
    });
    res.json({ success: true, attempts: record.attempts.length, givenUp: record.givenUp });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path19.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("/{*path}", (req, res) => {
      res.sendFile(import_path19.default.join(distPath, "index.html"));
    });
  }
  app.post("/api/system/exit", (_req, res) => {
    const managedBySystemd = !!process.env.INVOCATION_ID;
    try {
      (0, import_child_process20.execSync)('pkill -f "tray.py"', { stdio: "ignore" });
      writeLog("system", "[SYSTEM] Python tray daemon terminated.");
    } catch {
    }
    if (managedBySystemd) {
      writeLog("system", "[SYSTEM] Exit request received \u2014 xdash.service gestisce il processo, nessuna terminazione (resta pronto per la prossima apertura).");
      res.json({ success: true, message: "Solo la finestra (e il tray) si chiudono \u2014 il servizio resta attivo." });
      return;
    }
    writeLog("system", "[SYSTEM] Shutdown request received \u2014 stopping...");
    res.json({ success: true, message: "Chiusura in corso." });
    setTimeout(() => process.exit(0), 300);
  });
  app.post("/api/system/switch-session", (req, res) => {
    if (!binaryExists10("dm-tool")) {
      writeLog("warning", "[SYSTEM] switch-session requested but dm-tool is not available \u2014 install the lightdm package (already present if LightDM is the active display manager) or check the PATH.");
      res.status(501).json({ success: false, message: "dm-tool non disponibile su questo sistema." });
      return;
    }
    const username = process.env.USER || process.env.LOGNAME || "";
    const targetSession = process.env.X_LAUNCHER_DESKTOP_SESSION || "xfce";
    if (!username) {
      writeLog("error", "[SYSTEM] switch-session: could not determine the current username (USER/LOGNAME env vars missing).");
      res.status(500).json({ success: false, message: "Username non determinabile." });
      return;
    }
    writeLog("system", `[SYSTEM] Session switch requested: ${username} \u2192 ${targetSession}`);
    res.json({ success: true, message: "Switch di sessione in corso." });
    const proc = (0, import_child_process20.spawn)("dm-tool", ["switch-to-user", username, targetSession], { stdio: "ignore" });
    proc.on("error", (e) => writeLog("error", `[SYSTEM] dm-tool switch-to-user failed: ${e.message}`));
  });
  app.post("/api/system/steam-bigpicture", (_req, res) => {
    writeLog("system", "[SYSTEM] Switch to Steam Big Picture requested.");
    gameManager.notifyBigPictureLaunched();
    res.json({ success: true, message: "Apertura Steam Big Picture in corso." });
    const proc = (0, import_child_process20.spawn)("steam", ["steam://open/bigpicture"], { stdio: "ignore" });
    proc.on("error", (e) => writeLog("error", `[SYSTEM] Failed to launch Steam Big Picture: ${e.message} \u2014 is Steam installed?`));
  });
  app.post("/api/system/steam-bigpicture-closed", (_req, res) => {
    writeLog("system", "[SYSTEM] Return from Steam Big Picture requested.");
    gameManager.notifyBigPictureClosed();
    res.json({ success: true });
    const exitProc = (0, import_child_process20.spawn)("steam", ["steam://open/main"], { stdio: "ignore" });
    exitProc.on("error", (e) => writeLog("warning", `[SYSTEM] steam://open/main failed to spawn (non-blocking): ${e.message}`));
    const pollForSteamWindow = (attemptsLeft) => {
      if (attemptsLeft <= 0) {
        writeLog("warning", "[SYSTEM] Steam window not found via wmctrl -lx after polling (3s) \u2014 giving up (non-blocking).");
        return;
      }
      try {
        const out = (0, import_child_process20.execFileSync)("wmctrl", ["-lx"], { encoding: "utf-8" });
        const line = out.split("\n").find((l) => {
          const wmClass = l.trim().split(/\s+/)[2] ?? "";
          return /steam/i.test(wmClass);
        });
        if (line) {
          const winId = line.trim().split(/\s+/)[0];
          (0, import_child_process20.execFileSync)("wmctrl", ["-i", "-r", winId, "-b", "add,hidden"], { stdio: "pipe" });
          writeLog("system", `[SYSTEM] Steam window hidden (id=${winId}).`);
          return;
        }
      } catch (err) {
        writeLog("warning", `[SYSTEM] wmctrl -lx poll failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
      }
      setTimeout(() => pollForSteamWindow(attemptsLeft - 1), 300);
    };
    setTimeout(() => pollForSteamWindow(10), 300);
  });
  app.use((err, _req, res, _next) => {
    const message = err instanceof Error ? err.message : String(err);
    writeLog("error", `[SERVER] Unhandled route error: ${message}`);
    if (res.headersSent) return;
    res.status(500).json({ success: false, message });
  });
  app.listen(PORT, "0.0.0.0", () => {
    writeLog("system", `Daemon started on http://0.0.0.0:${PORT}`);
    writeLog("system", `Log file: ${LOG_PATH_EXPORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
