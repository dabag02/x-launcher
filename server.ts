
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { gameManager } from './src/backend/gameManager';
import { compatibilityManager } from './src/backend/compatibilityManager';
import { downloadManager } from './src/backend/downloadManager';
import { writeLog, LOG_PATH_EXPORT } from './src/backend/logger';
import { notificationEngine } from './src/backend/notificationEngine';
import { knowledgeBase } from './src/backend/knowledgeBase';
import * as db from './src/backend/db';
import * as attemptTracker from './src/backend/aiProviders/attemptTracker';
import { readAppConfig, writeAppConfig, hasLanguageBeenSet } from './src/backend/appConfig';
import { getSystemInfo } from './src/backend/systemInfo';
import fs from 'fs';
import os from 'os';
import { spawn, execSync } from 'child_process';

// Stesso pattern già usato in altri moduli backend (downloadManager.ts,
// runners/implementations.ts, plugins/gogPlugin.ts, plugins/epicPlugin.ts)
// — non condiviso in un modulo comune per restare coerenti con quella
// convenzione esistente nel progetto.
function binaryExists(bin: string): boolean {
  try { execSync(`which ${bin}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

async function startServer() {
  const app = express();
    const AVATAR_DIR = path.join(
      os.homedir(),
      '.local',
      'share',
      'x-launcher',
      'avatars'
    );

    fs.mkdirSync(AVATAR_DIR, {
      recursive: true
    });

  writeLog(
    'system',
    `[AVATAR] Avatar directory: ${AVATAR_DIR}`
  );
  // In AI Studio NODE_ENV veniva iniettato automaticamente dalla piattaforma.
  // Su Linux locale si imposta qui come fallback sicuro.
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
  }
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());

  // Registra SSE PRIMA di waitReady — così il primo refreshLibrary del boot
  // può già notificare i client se fossero connessi
  const sseClients = new Set<import('express').Response>();

  // Registra la funzione di broadcast nel NotificationEngine (Step 15b)
  notificationEngine.setBroadcast((event, payload) => {
    const data = `data: ${JSON.stringify({ event, payload })}

`;
    sseClients.forEach(client => {
      try { client.write(data); } catch { sseClients.delete(client); }
    });
  });

  const notifyLibraryUpdated = () => {
    const data = `data: ${JSON.stringify({ event: 'library-updated', ts: Date.now() })}\n\n`;
    sseClients.forEach(client => {
      try { client.write(data); } catch { sseClients.delete(client); }
    });
  };

  gameManager.onLibraryRefreshed(notifyLibraryUpdated);

  // Aggancia gli eventi del DownloadManager al NotificationEngine
  downloadManager.onComplete((gameId, gameTitle) => {
    notificationEngine.emit({ type: 'download-completed', gameId, gameTitle });
    // v1.1.20 — stesso bug del percorso di disinstallazione, versione
    // installazione: il completamento aggiornava già isInstalled nel DB
    // (vedi downloadManager, fine del flusso di installazione) ma non
    // avvisava mai il frontend di rifare il fetch — la notifica toast
    // sopra è un canale diverso (NotificationEngine), non tocca
    // library-updated. La card restava "Not Installed" finché non
    // arrivava un library-updated per un altro motivo, o un riavvio.
    notifyLibraryUpdated();
  });
  downloadManager.onError((gameId, gameTitle, error) => {
    notificationEngine.emit({ type: 'download-error', gameId, gameTitle, error });
  });
  // v0.99.35 — esito lookup Heroic known-fixes, per trasparenza
  // all'utente su quali dipendenze sono state realmente installate.
  downloadManager.onKnownFixesResult((gameId, gameTitle, found, verbs) => {
    notificationEngine.emit({ type: 'known-fixes-result', gameId, gameTitle, found, verbs });
  });

  // Aspetta che gameManager abbia finito il boot (plugin + runner + libreria)
  // prima di accettare richieste — evita race condition sulle prime chiamate API.
  await gameManager.waitReady();

  // Route per refresh manuale della libreria
  app.post("/api/library/refresh", async (req, res) => {
    await gameManager.refreshLibrary();
    res.json({ success: true, count: gameManager.getGames().length });
  });

  // File watcher sulla cartella steamapps — aggiorna la libreria automaticamente
  // quando Steam crea/modifica/cancella un file .acf (installazione e disinstallazione)
  const { watch, existsSync: fsExists } = await import('fs');
  const { homedir } = await import('os');
  const steamappsPath = `${homedir()}/.local/share/Steam/steamapps`;

  if (fsExists(steamappsPath)) {
    let debounceTimer: NodeJS.Timeout | null = null;
    watch(steamappsPath, (eventType, filename) => {
      if (!filename?.endsWith('.acf')) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const action = eventType === 'rename' ? 'creato/rimosso' : 'modificato';
        gameManager.addLog(`[STEAM] File ${filename} ${action} — aggiorno libreria...`, 'system');
        await gameManager.refreshLibrary();
        gameManager.addLog('[STEAM] Libreria aggiornata.', 'system');
      }, 8000);
    });
    writeLog('system', `Watcher active on ${steamappsPath}`);
  } else {
    writeLog('system', 'steamapps folder not found — watcher disabled.');
  }

  // Step 3 — Watcher sulla cartella ROM
  const romsPath = process.env.ROMS_PATH
    ? (process.env.ROMS_PATH.startsWith('~')
        ? `${homedir()}${process.env.ROMS_PATH.slice(1)}`
        : process.env.ROMS_PATH)
    : `${homedir()}/Roms`;

  if (fsExists(romsPath)) {
    let romsDebounce: NodeJS.Timeout | null = null;
    watch(romsPath, { recursive: true }, (eventType, filename) => {
      if (!filename?.toLowerCase().endsWith('.zip')) return;
      if (romsDebounce) clearTimeout(romsDebounce);
      romsDebounce = setTimeout(async () => {
        gameManager.addLog(`[CLASSIC] Modifica ROM rilevata (${filename}) — aggiorno libreria...`, 'system');
        await gameManager.refreshLibrary();
        gameManager.addLog('[CLASSIC] Libreria aggiornata.', 'system');
      }, 2000);
    });
    writeLog('system', `ROM watcher active on ${romsPath}`);
  } else {
    writeLog('system', `ROM folder not found (${romsPath}) — create ~/Roms/ or set ROMS_PATH in .env`);
  }

  // Step 3 — Cerca core RetroArch installati nel sistema
  // v1.0.0 — accetta ?system=<canonical> per filtrare l'elenco ai soli
  // core compatibili con quel sistema (es. 'genesis', 'snes'), invece di
  // restituire sempre tutti i core installati indistintamente. Senza il
  // parametro, comportamento invariato (tutti i core) — usato dalla tab
  // System per la panoramica generale, distinta dall'overlay per-gioco.
  app.get('/api/retroarch/cores', async (req, res) => {
    const { readdirSync, existsSync: fsEx, realpathSync } = await import('fs');
    const { execSync } = await import('child_process');
    const { COMPATIBLE_CORES_BY_SYSTEM, getDefaultCoreForSystem } = await import('./src/backend/plugins/classicPlugin');

    const systemFilter = typeof req.query.system === 'string' ? req.query.system : undefined;

    // Cartelle utente prima: in caso di symlink viene mantenuto il path utente.
    // Include il path flatpak che usa un container isolato con path fisso.
    const corePaths = [
      `${homedir()}/.config/retroarch/cores`,
      `${homedir()}/.local/share/retroarch/cores`,
      `${homedir()}/.var/app/org.libretro.RetroArch/config/retroarch/cores`,
      '/usr/lib/libretro',
      '/usr/lib64/libretro',
      '/usr/share/libretro/cores',
    ];

    // Deduplicazione per realpath: molte distro creano symlink dello stesso
    // core in piu directory -> senza dedup la lista appare duplicata nella UI.
    const seen = new Set<string>();
    let cores: Array<{ name: string; path: string }> = [];

    for (const dir of corePaths) {
      if (!fsEx(dir)) continue;
      try {
        const files = readdirSync(dir).filter((f: string) => f.endsWith('_libretro.so'));
        for (const file of files) {
          const fullPath = `${dir}/${file}`;
          let realPath = fullPath;
          try { realPath = realpathSync(fullPath); } catch {}
          if (seen.has(realPath)) continue;
          seen.add(realPath);
          cores.push({ name: file.replace('_libretro.so', ''), path: fullPath });
        }
      } catch {}
    }

    let defaultCore: string | undefined;
    if (systemFilter) {
      const compatible = COMPATIBLE_CORES_BY_SYSTEM[systemFilter] ?? [];
      cores = cores.filter(c => compatible.includes(c.name));
      defaultCore = getDefaultCoreForSystem(systemFilter)?.replace('_libretro.so', '');
    }

    cores.sort((a, b) => a.name.localeCompare(b.name));

    // Controlla se RetroArch e installato
    let retroarchAvailable = false;
    let retroarchVersion = '';
    try {
      retroarchVersion = execSync('retroarch --version 2>&1', { timeout: 3000 }).toString().trim().split('\n')[0];
      retroarchAvailable = true;
    } catch {}

    res.json({ retroarchAvailable, retroarchVersion, cores, defaultCore });
  });

  // Step 3 — Route per aggiornare il core di una ROM specifica
  app.patch('/api/games/:id/retroarch', async (req, res) => {
    const { libretroCore } = req.body;
    gameManager.updateGameConfig(req.params.id, { libretroCore });
    res.json({ success: true });
  });
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Heartbeat ogni 30s per tenere la connessione viva
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    sseClients.add(res);
    writeLog('system', `[SSE] Client connected (total: ${sseClients.size})`);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // Mostra lo stato interno completo: plugin, DB, file system Steam
  // Chiamare con: curl -s http://localhost:3000/api/debug | python3 -m json.tool
  app.get("/api/debug", async (req, res) => {
    const { homedir } = await import('os');
    const { existsSync, readdirSync } = await import('fs');
    const { getAllGames } = await import('./src/backend/db');

    const steamPaths = [
      `${homedir()}/.local/share/Steam/steamapps`,
      `${homedir()}/.steam/steam/steamapps`,
      `${homedir()}/.steam/debian-installation/steamapps`,
    ];

    const steamDebug: Record<string, any> = {};
    for (const p of steamPaths) {
      if (existsSync(p)) {
        const acfFiles = readdirSync(p).filter((f: string) => f.endsWith('.acf'));
        steamDebug[p] = { exists: true, acfCount: acfFiles.length, acfFiles };
      } else {
        steamDebug[p] = { exists: false };
      }
    }

    const dbGames = getAllGames();

    res.json({
      nodeVersion:    process.version,
      nodeEnv:        process.env.NODE_ENV,
      cwd:            process.cwd(),
      steamPaths:     steamDebug,
      dbGameCount:    dbGames.length,
      dbGames:        dbGames.map(g => ({ id: g.id, title: g.title, store: g.store })),
      apiGames:       gameManager.getGames().map(g => ({ id: g.id, title: g.title, store: g.store })),
    });
  });
  
  app.get("/api/status", (req, res) => {
    res.json({ status: "X-Launcher Daemon Active", uptime: process.uptime() });
  });

  app.get("/api/games", (req, res) => {
    const query = req.query as any;
    const result = gameManager.getGames({
      store: query.store,
      search: query.search,
      genre: query.genre,
      category: query.category,
      sortBy: query.sortBy,
      order: query.order
    });
    // v1.1.25 — diagnostica mirata: cosa viene DAVVERO restituito ad ogni
    // chiamata, per confrontarlo con i log [DB] di db.ts e capire se
    // l'incoerenza nasce prima della lettura (scrittura sbagliata) o
    // qui (lettura sbagliata di un dato scritto correttamente).
    gameManager.addLog(`[API] GET /api/games?store=${query.store ?? 'All'} → ${result.length} giochi, installati: ${result.filter((g: any) => g.isInstalled).length}`, 'system');
    res.json(result);
  });

  app.get("/api/stores", async (req, res) => {
    res.json(await gameManager.syncStores());
  });

  // POST /api/stores/auth-code — invia il codice SID Epic a legendary
  app.post('/api/stores/auth-code', async (req, res) => {
    const { code } = req.body as { code: string };
    if (!code) return res.status(400).json({ success: false, message: 'Codice mancante' });
    try {
      // Epic ha cambiato il formato della pagina di redirect OAuth: la
      // risposta JSON moderna ha { redirectUrl, authorizationCode, sid }
      // con sid SEMPRE null — il vecchio formato { sid: "..." } non esiste
      // più. legendary stesso ha seguito questo cambiamento dalla versione
      // 0.20.28: --sid è il flag vecchio (non più funzionante in pratica,
      // perché non c'è più alcun sid da passare), --code è quello corretto
      // per il valore di authorizationCode.
      let authCode = code.trim();
      if (authCode.startsWith('{')) {
        try {
          const parsed = JSON.parse(authCode);
          authCode = parsed.authorizationCode ?? parsed.sid ?? authCode;
        } catch {}
      }
      const { execSync } = require('child_process') as typeof import('child_process');
      execSync(`legendary auth --code "${authCode}"`, { encoding: 'utf-8', timeout: 20000 });
      writeLog('auth', '[Epic] auth-code: authentication completed via authorization code');
      res.json({ success: true, message: 'Autenticazione Epic completata.' });
    } catch (e: any) {
      writeLog('error', `[Epic] auth-code error: ${e.message}`);
      res.json({ success: false, message: `Errore: ${e.message}. Prova da terminale: legendary auth` });
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

  // Polling autenticazione store — chiamato ogni 2s dalla UI durante il flusso login
  app.get("/api/stores/login-status/:id", async (req, res) => {
    const plugin = (gameManager as any).plugins?.find((p: any) => p.id === req.params.id);
    if (!plugin) return res.status(404).json({ authenticated: false });
    const authenticated = await plugin.isAuthenticated();
    res.json({ authenticated });
  });

  // Runner installabili (Proton-GE via protonup o GitHub)
  app.get("/api/runners/installable", async (req, res) => {
    const list = await compatibilityManager.getInstallableRunners();
    res.json(list);
  });

  // Spazio disco ~/Games/
  app.get("/api/system/disk", (req, res) => {
    res.json(compatibilityManager.getDiskUsage());
  });

  // v0.99.38 — nome macchina, mostrato accanto all'avatar al posto del
  // runner attivo (hardcoded finora, "Proton 8.0-4 Active" fisso
  // indipendentemente da cosa fosse davvero installato/in uso).
  app.get("/api/system/hostname", (_req, res) => {
    res.json({ hostname: os.hostname() });
  });

  // GET /api/system/game-running — v0.99.35, usata dallo script
  // systray Python per decidere quando nascondere/ripristinare la
  // finestra della dashboard. Nessuna autenticazione: stesso livello
  // di esposizione delle altre route locali del daemon.
  app.get("/api/system/game-running", (_req, res) => {
    res.json(gameManager.isLastLaunchedGameRunning());
  });

  // GET /api/logs?type=error,download&limit=200
  // type: lista separata da virgola di LogLevel; omesso = tutti
  // limit: numero massimo di voci (default 200, max 500)
  app.get("/api/logs", (req, res) => {
    const limitParam = parseInt(req.query.limit as string) || 200;
    const limit = Math.min(Math.max(1, limitParam), 500);
    const typeParam = (req.query.type as string | undefined)?.trim();
    let logs = gameManager.getLogs(limit);
    if (typeParam) {
      const allowed = new Set(typeParam.split(',').map(s => s.trim().toLowerCase()));
      logs = logs.filter(l => allowed.has(l.type));
    }
    res.json(logs);
  });

  app.get("/api/downloads", (req, res) => {
    res.json(downloadManager.getTasks());
  });

  app.post("/api/downloads/start", async (req, res) => {
    const { gameId, winetricksVerbs, disableWineSync, useKnownFixes, installOnlyEnv } = req.body;
    if (!gameId) return res.status(400).json({ error: 'gameId required' });
    const game = gameManager.getGames().find((g: any) => g.id === gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });
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

  app.get("/api/runners", (req, res) => {
    res.json(compatibilityManager.getAvailableRunners());
  });

  // POST /api/runners/download — installa un runner con SSE progress streaming
  // Il client apre una EventSource su /api/runners/install-stream?id=<id>
  app.post("/api/runners/download", async (req, res) => {
    const { id } = req.body;
    await compatibilityManager.downloadProton(id, (msg) => gameManager.addLog(msg, 'system'));
    await gameManager.refreshRunners();
    res.json({ success: true });
  });

  // GET /api/runners/install-stream?id=<id> — SSE con progress messaggi
  app.get("/api/runners/install-stream", async (req, res) => {
    const id = req.query.id as string;
    if (!id) { res.status(400).end(); return; }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (type: 'log' | 'done' | 'error', data: string) => {
      try { res.write(`event: ${type}\ndata: ${JSON.stringify({ message: data })}\n\n`); } catch {}
    };

    try {
      await compatibilityManager.downloadProton(id, (msg) => {
        gameManager.addLog(msg, 'system');
        send('log', msg);
      });
      await gameManager.refreshRunners();
      await gameManager.refreshRunners();
      send('done', `${id} installato con successo.`);
      notificationEngine.emit({ type: 'runner-installed', runnerId: id });
    } catch (e: any) {
      const errMsg = `Installazione fallita: ${e?.message ?? e}`;
      send('error', errMsg);
      notificationEngine.emit({ type: 'runner-error', runnerId: id, error: errMsg });
    }
    res.end();
  });

  // GET /api/runners/uninstall-stream?id=<id> — SSE simmetrico a install-stream
  app.get("/api/runners/uninstall-stream", async (req, res) => {
    const id = req.query.id as string;
    if (!id) { res.status(400).end(); return; }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (type: 'log' | 'done' | 'error', data: string) => {
      try { res.write(`event: ${type}\ndata: ${JSON.stringify({ message: data })}\n\n`); } catch {}
    };

    try {
      await compatibilityManager.uninstallProton(id, (msg) => {
        gameManager.addLog(msg, 'system');
        send('log', msg);
      });
      await gameManager.refreshRunners();
      await gameManager.refreshRunners();
      send('done', `${id} disinstallato con successo.`);
      notificationEngine.emit({ type: 'runner-uninstalled', runnerId: id });
    } catch (e: any) {
      const errMsg = `Disinstallazione fallita: ${e?.message ?? e}`;
      send('error', errMsg);
      notificationEngine.emit({ type: 'runner-error', runnerId: id, error: errMsg });
    }
    res.end();
  });

  app.post("/api/runners/refresh", async (req, res) => {
    const runners = await gameManager.refreshRunners();
    res.json({ runners });
  });

  // Step 2 — Apri Steam Big Picture (switcha fuori dalla dashboard)
  app.post("/api/steam/bigpicture", (req, res) => {
    const { openSteamBigPicture } = require('./src/backend/runners/implementations');
    res.json(openSteamBigPicture());
  });

  app.get("/api/fixes/:gameId", (req, res) => {
    res.json(compatibilityManager.getSuggestedFixes(req.params.gameId));
  });

  // Rileva tool Linux installati (gamescope, mangohud, protonup, ecc.)
  app.get("/api/system-tools", (req, res) => {
    res.json(compatibilityManager.detectSystemTools());
  });

  app.post("/api/launch", async (req, res) => {
    const { id, launchArgsOverride } = req.body;
    const result = await gameManager.launchGame(id, launchArgsOverride);
    if (!result.success) {
      const game = gameManager.getGames().find((g: any) => g.id === id);
      const gameTitle = game?.title ?? id;
      if (result.message?.includes('disabilitato')) {
        notificationEngine.emit({ type: 'launch-blocked', gameId: id, gameTitle, reason: result.message });
      } else {
        notificationEngine.emit({ type: 'launch-error', gameId: id, gameTitle, error: result.message ?? 'Avvio fallito' });
      }
    }
    res.json(result);
  });

  // v1.1.68 — cronologia "ultimi giochi lanciati", consumata dal menu
  // contestuale della tray (tray.py) per un lancio rapido col solo mouse.
  // GET, non richiede stato: legge solo, non modifica nulla.
  app.get("/api/games/recent", (req, res) => {
    const limit = parseInt(String(req.query.limit ?? '3'), 10) || 3;
    res.json(db.getRecentlyLaunched(limit));
  });

  // Configurazione per-game (Step 1 — persiste su DB)
  app.patch("/api/games/:id/config", (req, res) => {
    const result = gameManager.updateGameConfig(req.params.id, req.body);
    res.json(result);
  });

  app.delete("/api/games/:id/uninstall", async (req, res) => {
    const result = await gameManager.uninstallGame(req.params.id);
    // v1.1.20 — bug confermato: uninstallGame aggiorna correttamente il
    // DB (db.updateGameStatus), ma non avvisava mai il frontend che la
    // libreria era cambiata — solo gameManager.onLibraryRefreshed lo fa
    // (agganciato a notifyLibraryUpdated sopra), e questa funzione non lo
    // triggera. La card restava con lo stato vecchio finché non arrivava
    // un aggiornamento "library-updated" per un altro motivo (refresh
    // periodico, ricerca che innesca un nuovo fetch) o un riavvio.
    if (result.success) notifyLibraryUpdated();
    res.json(result);
  });

  app.patch("/api/games/:id/compat", (req, res) => {
    const result = gameManager.updateCompatProfile(req.params.id, req.body);
    res.json(result);
  });

  // v0.99.36 — sistema di verifica per-gioco (badge "verificato")
  app.patch("/api/games/:id/verify", (req, res) => {
    const { method } = req.body; // 'auto' | 'manual'
    if (method !== 'auto' && method !== 'manual') {
      return res.status(400).json({ success: false, message: "method deve essere 'auto' o 'manual'" });
    }
    const result = gameManager.markGameVerified(req.params.id, method);
    res.json(result);
  });

  app.delete("/api/games/:id/verify", (req, res) => {
    const result = gameManager.unmarkGameVerified(req.params.id);
    res.json(result);
  });

  // Richiesta utente — tab Info Hardware in Gestisci Account: Motherboard/
  // CPU/GPU/RAM/HDD/OS, tutti leggibili senza permessi elevati (vedi
  // systemInfo.ts). Cache in memoria lato server, l'hardware non cambia
  // durante l'esecuzione del demone.
  app.get('/api/system-info', (_req, res) => {
    try {
      res.json(getSystemInfo());
    } catch (e: any) {
      writeLog('error', `[API] /system-info fallita: ${e?.message ?? e}`);
      res.status(500).json({ error: 'Impossibile rilevare l\'hardware' });
    }
  });

  app.get("/api/games/:id/compat", (req, res) => {
    const { getCompatProfile } = require('./src/backend/db');
    res.json(getCompatProfile(req.params.id) ?? {});
  });

  // Richiesta utente — "auto-remaster", on/off dall'overlay. Il core
  // stesso è l'interruttore (vedi setRemasterEnabled in gameManager.ts).
  // Generalizzato dal caso PSX (il primo verificato) — funziona per
  // qualunque sistema con una voce in REMASTER_PRESETS.
  app.post("/api/games/:id/remaster", async (req, res) => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      const result = await gameManager.setRemasterEnabled(req.params.id, enabled === true);
      res.json(result);
    } catch (e: any) {
      writeLog('error', `[API] /remaster fallita per ${req.params.id}: ${e?.message ?? e}`);
      res.status(500).json({ success: false, message: e?.message ?? 'Errore interno' });
    }
  });

  // Richiesta utente — dimensione prevista di installazione, on-demand
  // per il gioco selezionato (solo GOG/Epic per ora, vedi commento su
  // getPredictedInstallSize in gameManager.ts). Volutamente non
  // richiamato per l'intera libreria in una volta — una chiamata per
  // gioco, solo quando l'utente lo seleziona davvero.
  //
  // try/catch aggiunto dopo un crash segnalato dall'utente
  // (TypeError: gameManager.getPredictedInstallSize is not a function,
  // causa più probabile: build avviata da una cartella diversa/non
  // aggiornata — ma la route non aveva comunque nessuna protezione:
  // un errore async non catturato qui può destabilizzare l'intero
  // processo invece di restituire un errore contenuto alla sola
  // richiesta che l'ha causato).
  app.get("/api/games/:id/predicted-size", async (req, res) => {
    try {
      const bytes = await gameManager.getPredictedInstallSize(req.params.id);
      res.json({ bytes });
    } catch (e: any) {
      writeLog('error', `[API] /predicted-size fallita per ${req.params.id}: ${e?.message ?? e}`);
      res.json({ bytes: null });
    }
  });
  // --- PLUGIN MANAGER ---

  app.get('/api/plugins', (_req, res) => {
    res.json(gameManager.getPluginRegistry());
  });

  app.patch('/api/plugins/:storeId', async (req, res) => {
    const { enabled } = req.body as { enabled: boolean };
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be boolean' });
    const result = await gameManager.setPluginEnabled(
      decodeURIComponent(req.params.storeId), enabled
    );
    res.json(result);
  });

	// ---------------------------------------------------------------------
// Avatar Library
// ---------------------------------------------------------------------

 app.use(
   '/avatars',
   express.static(AVATAR_DIR)
 );

  app.get('/api/avatars/info', (_req, res) => {
    res.json({
       dir: AVATAR_DIR,
       exists: fs.existsSync(AVATAR_DIR)
     });
   });

 app.get('/api/avatars', (_req, res) => {
   try {
     const avatars = fs
       .readdirSync(AVATAR_DIR)
       .filter(file =>
         /\.(png|jpg|jpeg|webp|gif)$/i.test(file)
       )
       .map(file => ({
         name: file,
         url: `/avatars/${file}`
       }));

     res.json(avatars);
   } catch (err) {
     writeLog(
       'error',
       `[AVATAR] ${String(err)}`
     );

     res.json([]);
   }
 });
  // --- NOTIFICATION ENGINE ROUTES (Step 15b) ---

  // GET /api/notifications — storico persistente (ultimi 100)
  app.get('/api/notifications', (_req, res) => {
    res.json(notificationEngine.getRecent(100));
  });

  // GET /api/notifications/pending — solo pending+applied
  app.get('/api/notifications/pending', (_req, res) => {
    res.json(notificationEngine.getPending());
  });

  // PATCH /api/notifications/:id/status — aggiorna stato da frontend
  app.patch('/api/notifications/:id/status', (req, res) => {
    const { status } = req.body as { status: string };
    const allowed = ['pending', 'applied', 'resolved', 'failed', 'dismissed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    notificationEngine.updateStatus(req.params.id, status as any);
    res.json({ success: true });
  });

  // GET /api/version — versione/milestone da metadata.json.
  // v1.1.87 — non più consumato dal frontend per il numero mostrato nel
  // menu (vedi il commento esteso in App.tsx sull'effect rimosso): questo
  // file viene aggiornato solo ai congelamenti di milestone, mai nei fix
  // quotidiani, quindi usarlo per sovrascrivere la versione mostrata
  // causava una versione stantia in ogni cartella di sviluppo non
  // risincronizzata con l'ultimo zip di milestone. Lasciato qui per uso
  // futuro (es. diagnostica esterna, script), non più per questo scopo.
  app.get('/api/version', (_req, res) => {
    try {
      const { readFileSync } = require('fs');
      const { join } = require('path');
      const meta = JSON.parse(readFileSync(join(process.cwd(), 'metadata.json'), 'utf-8'));
      res.json({ version: meta.version ?? '0.0.0', milestone: meta.milestone ?? '' });
    } catch {
      res.json({ version: '0.0.0' });
    }
  });

  // GET /api/config — preferenze persistite (es. fullscreen) + flag di
  // sessione runtime (v0.99.26). `dedicatedSession` NON è persistito su
  // disco — dipende da come kiosk-launch.sh ha lanciato il processo in
  // QUESTA sessione (export X_LAUNCHER_DEDICATED_SESSION, basato sulla
  // presenza o assenza di xfwm4), letto direttamente da process.env. Il
  // frontend lo usa per decidere se mostrare "Window" nel menu Display
  // Mode (sessione sopra XFCE) o "Desktop"/"Console Mode" al suo posto
  // (sessione X11 dedicata, nessun desktop sotto cui tornare con una
  // finestra normale — ha senso solo uno switch di sessione LightDM).
  app.get('/api/config', (_req, res) => {
    res.json({
      ...readAppConfig(),
      dedicatedSession: process.env.X_LAUNCHER_DEDICATED_SESSION === 'true',
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
      retroarchCrtPresetPath: path.join(process.cwd(), 'assets', 'retroarch-presets', 'crt-easymode.cfg'),
    });
  });

  // PATCH /api/config — aggiorna una o più preferenze persistite.
  // Nota: il cambiamento di `fullscreen` qui aggiorna solo la preferenza
  // salvata su disco — kiosk-launch.sh la legge al PROSSIMO avvio del
  // browser. Chromium in --kiosk non può passare a finestra a runtime
  // senza riavviare il processo browser stesso, quindi non c'è azione
  // immediata possibile lato server: il frontend informa l'utente che il
  // cambiamento avrà effetto al prossimo riavvio della Dashboard.
  app.patch('/api/config', (req, res) => {
    try {
      const next = writeAppConfig(req.body ?? {});
      writeLog('system', `[CONFIG] Preferences updated: ${JSON.stringify(next)}`);
      res.json(next);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // POST /api/library/refresh — forza sync libreria (es. dopo auth)
  app.post('/api/library/refresh', async (_req, res) => {
    res.json({ success: true });           // risponde subito
    await gameManager.refreshLibrary();    // esegue in background
  });

  // --- KNOWLEDGE BASE ROUTES (Step 15c) ---

  // GET /api/kb — tutte le voci
  app.get('/api/kb', (_req, res) => {
    res.json(knowledgeBase.getAll());
  });

  // GET /api/kb/stats
  app.get('/api/kb/stats', (_req, res) => {
    res.json(knowledgeBase.stats());
  });

  // GET /api/kb/lookup?error=<text> — cerca match per testo di errore
  app.get('/api/kb/lookup', (req, res) => {
    const errorText = (req.query.error as string) ?? '';
    const match = knowledgeBase.lookup(errorText);
    res.json(match ?? null);
  });

  // DELETE /api/kb/:id
  app.delete('/api/kb/:id', (req, res) => {
    knowledgeBase.delete(req.params.id);
    res.json({ success: true });
  });

  // POST /api/kb/reload-seed — ricarica kb-seed.json
  app.post('/api/kb/reload-seed', (_req, res) => {
    knowledgeBase.reloadSeed();
    res.json({ success: true, stats: knowledgeBase.stats() });
  });

  // POST /api/kb/reset — ripristina solo il seed
  app.post('/api/kb/reset', (_req, res) => {
    knowledgeBase.resetToSeed();
    res.json({ success: true, stats: knowledgeBase.stats() });
  });

  // PATCH /api/kb/threshold — aggiorna soglia match
  app.patch('/api/kb/threshold', (req, res) => {
    const { value } = req.body as { value: number };
    if (typeof value !== 'number') return res.status(400).json({ error: 'value required' });
    knowledgeBase.setThreshold(value);
    res.json({ success: true, threshold: value });
  });

  // POST /api/kb/writeback/resolved — soluzione AI confermata
  app.post('/api/kb/writeback/resolved', (req, res) => {
    const { pattern, solution, actionType, actionParams, confidence, existingId } = req.body;
    knowledgeBase.writebackResolved({ pattern, solution, actionType, actionParams, confidence, existingId });
    res.json({ success: true });
  });

  // GET/POST /api/ai/providers — v0.99.90, Step 15d: gestione minima via
  // API delle credenziali provider, in attesa della UI Impostazioni →
  // AI Providers (step separato, non ancora costruito). Permette di
  // testare l'intero collegamento (KB null → advisor → notifica) senza
  // aspettare quella UI — non è pensata per restare l'unico modo di
  // configurare i provider a lungo termine.
  app.get('/api/ai/providers', (_req, res) => {
    res.json(db.getAllAiProviderCredentials().map(c => ({
      ...c,
      // Non rimandare mai la key in chiaro nella risposta GET, anche se
      // è salvata in chiaro nel DB (vedi nota in db.ts) — nessun motivo
      // di esporla di nuovo lato client oltre al momento in cui viene
      // scritta.
      apiKey: c.apiKey ? '••••••••' : undefined,
    })));
  });

  app.post('/api/ai/providers/:id', (req, res) => {
    const { enabled, apiKey, baseUrl, model, priority } = req.body;
    // v0.99.90 — fix: prima questa route sovrascriveva SEMPRE apiKey/
    // baseUrl/model con quanto ricevuto, incluso undefined→null. Il
    // frontend non ha mai il vero valore dell'API key (mascherata come
    // '••••••••' dalla GET) — attivare solo il toggle "enabled" senza
    // reinserire la key l'avrebbe cancellata. Ora è un vero aggiornamento
    // parziale: un campo omesso (o stringa vuota per apiKey) preserva il
    // valore già salvato invece di azzerarlo.
    const existing = db.getAiProviderCredential(req.params.id);
    db.upsertAiProviderCredential({
      providerId: req.params.id,
      enabled:    Boolean(enabled),
      apiKey:     (apiKey !== undefined && apiKey !== '') ? apiKey : existing?.apiKey,
      baseUrl:    baseUrl !== undefined ? baseUrl : existing?.baseUrl,
      model:      model   !== undefined ? model   : existing?.model,
      priority:   typeof priority === 'number' ? priority : (existing?.priority ?? 999),
    });
    res.json({ success: true });
  });

  // DELETE /api/ai/providers/:id — v1.1.12: prima non esisteva alcun modo
  // di rimuovere una API key salvata, solo di sovrascriverla con una
  // nuova tramite la POST sopra. Rimuove l'intera riga (non solo la key):
  // vedi nota su deleteAiProviderCredential in db.ts.
  app.delete('/api/ai/providers/:id', (req, res) => {
    db.deleteAiProviderCredential(req.params.id);
    res.json({ success: true });
  });

  // POST /api/ai/providers/:id/test — v0.99.90: verifica una
  // configurazione PRIMA (o indipendentemente) di salvarla — i valori
  // arrivano dal form, non dal DB. Riusa askForFix con un contesto
  // banale invece di richiedere un metodo di test dedicato per ogni
  // provider: ogni adapter già distingue nel proprio `usage` un vero
  // giro di rete andato a buon fine (token > 0, anche se la risposta
  // semantica è un legittimo "non so") da un fallimento di rete/auth
  // (usage sempre a zero, vedi ogni ramo catch/give_up degli adapter) —
  // lo stesso segnale che useremmo per un test dedicato, già disponibile
  // gratis.
  app.post('/api/ai/providers/:id/test', async (req, res) => {
    const { apiKey, baseUrl, model } = req.body;
    // v0.99.90 — fallback sui valori già salvati: se l'utente sta solo
    // testando una configurazione già attiva senza aver ridigitato la
    // key (che non vede mai in chiaro, vedi mascheramento nella GET), il
    // test deve comunque usare quella già presente, non fallire per
    // "mancante" quando in realtà è già lì.
    const existing = db.getAiProviderCredential(req.params.id);
    const { buildProvider } = await import('./src/backend/aiProviders/registry');
    const provider = buildProvider({
      providerId: req.params.id, enabled: true,
      apiKey:  apiKey  || existing?.apiKey,
      baseUrl: baseUrl || existing?.baseUrl,
      model:   model   || existing?.model,
      priority: 0,
    });
    if (!provider) {
      return res.json({ success: false, message: 'Provider sconosciuto.' });
    }
    if (!provider.isConfigured()) {
      return res.json({ success: false, message: 'Configurazione incompleta (API key o endpoint mancanti).' });
    }
    try {
      const response = await provider.askForFix({
        errorText: 'test di connessione — ignora, nessun errore reale da diagnosticare',
        pastAttempts: [],
      });
      const gotRealResponse = response.usage.inputTokens > 0 || response.usage.outputTokens > 0;
      res.json({
        success: gotRealResponse,
        message: gotRealResponse
          ? 'Connessione riuscita.'
          : (response.kind === 'give_up' ? response.reason : 'Nessuna risposta valida dal provider.'),
      });
    } catch (err) {
      // Non dovrebbe mai accadere (askForFix non lancia per contratto),
      // ma il test è per natura un'operazione "a rischio" — meglio un
      // messaggio chiaro che un 500 anonimo.
      res.json({ success: false, message: `Errore inatteso: ${err instanceof Error ? err.message : err}` });
    }
  });

  // GET /api/ai/ollama/models — v0.99.90: elenca i modelli Ollama già
  // scaricati sulla macchina (via /api/tags, nativo di Ollama — nessun
  // parsing di `ollama list` da riga di comando), e serve anche come
  // verifica di raggiungibilità: se Ollama non è installato o non è in
  // esecuzione, la richiesta fallisce/va in timeout e la tab dedicata
  // nella UI resta nascosta invece di mostrare una sezione vuota e
  // inutile. Timeout breve (2s): è un controllo di presenza, non una
  // chiamata reale al modello — deve essere quasi istantaneo se Ollama
  // gira, e non deve far aspettare l'apertura di Impostazioni se non gira.
  app.get('/api/ai/ollama/models', async (_req, res) => {
    const baseUrl = db.getAiProviderCredential('ollama')?.baseUrl || 'http://localhost:11434';
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) {
        return res.json({ available: false, models: [] });
      }
      const data = await response.json();
      const models = Array.isArray(data?.models) ? data.models.map((m: any) => ({
        name:            m.name,
        sizeBytes:       m.size ?? 0,
        parameterSize:   m.details?.parameter_size ?? null,
        quantization:    m.details?.quantization_level ?? null,
      })) : [];
      res.json({ available: true, models });
    } catch {
      // Connessione rifiutata, timeout, Ollama non installato/non in
      // esecuzione — tutti trattati allo stesso modo: non disponibile,
      // mai un errore 500 per questo (è un controllo di presenza, non
      // un'operazione che deve riuscire).
      res.json({ available: false, models: [] });
    }
  });

  // GET /api/ai/usage — v0.99.90, Step 15d: consumo token del mese
  // corrente e budget configurato, per il contatore mostrato sia nelle
  // notifiche sia nella tab AI Models.
  app.get('/api/ai/usage', (_req, res) => {
    const usage = db.getAiUsageThisMonth();
    const budget = readAppConfig().aiMonthlyTokenBudget;
    res.json({ ...usage, budget });
  });

  // POST /api/ai/usage/budget — imposta il budget mensile (condiviso tra
  // tutti i provider, non per-provider — vedi motivazione in appConfig.ts).
  app.post('/api/ai/usage/budget', (req, res) => {
    const { budget } = req.body;
    if (typeof budget !== 'number' || budget < 0) {
      return res.status(400).json({ error: 'budget deve essere un numero >= 0' });
    }
    writeAppConfig({ aiMonthlyTokenBudget: Math.round(budget) });
    res.json({ success: true });
  });

  // POST /api/kb/writeback/failed — soluzione AI fallita
  app.post('/api/kb/writeback/failed', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    knowledgeBase.writebackFailed(id);
    res.json({ success: true });
  });

  // POST /api/ai/attempt-failed — v0.99.90, Step 15d: registra un
  // suggerimento AI confermato KO dall'utente nel tracker tentativi
  // (game_id+error_signature), cosi il limite di MAX_AI_ATTEMPTS scatta
  // davvero e i tentativi successivi sanno cosa è già stato provato e
  // ha fallito (vedi aiProviders/attemptTracker.ts). Distinta dalla
  // route kb/writeback/failed sopra, che riguarda solo lo scoring della
  // Knowledge Base — questa riguarda specificamente il conteggio
  // tentativi per-gioco-per-errore.
  app.post('/api/ai/attempt-failed', (req, res) => {
    const { gameId, errorText, solution, actionType, actionParams, confidence } = req.body;
    if (!gameId || !errorText) return res.status(400).json({ error: 'gameId e errorText richiesti' });
    const record = attemptTracker.recordFailure(gameId, errorText, {
      solution:     solution ?? '',
      actionType:   actionType ?? 'none',
      actionParams: actionParams ?? {},
      confidence:   confidence ?? 'low',
    });
    res.json({ success: true, attempts: record.attempts.length, givenUp: record.givenUp });
  });

  // --- VITE MIDDLEWARE ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*path}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // POST /api/system/exit — chiude il daemon (e quindi l'intera Dashboard,
  // dato che kiosk-launch.sh lancia il browser puntato a questo processo).
  // Risponde PRIMA di terminare: il client deve ricevere conferma che la
  // richiesta è stata accettata prima che il processo muoia, altrimenti la
  // fetch lato frontend fallirebbe con un errore di connessione invece di
  // un successo pulito.
  app.post('/api/system/exit', (_req, res) => {
    writeLog('system', '[SYSTEM] Shutdown request received — stopping...');

    // v0.99.90 — termina anche il demone tray Python, se attivo. Prima di
    // questo fix, in sessioni di sviluppo successive le modifiche al
    // codice di tray.py non avrebbero mai effetto finché il vecchio
    // processo restava vivo in background — stesso identico problema già
    // visto con server.ts stesso: un rebuild da solo non basta, il
    // processo va terminato esplicitamente perché quello nuovo (rilanciato
    // al prossimo avvio da kiosk-launch.sh) carichi il codice aggiornato.
    try {
      execSync('pkill -f "tray.py"', { stdio: 'ignore' });
      writeLog('system', '[SYSTEM] Python tray daemon terminated.');
    } catch {
      // pkill esce con codice diverso da 0 se non trova nessun processo
      // da terminare — non è un errore, significa solo che il tray non
      // era attivo (es. .venv-tray mai configurato, o già terminato).
    }

    res.json({ success: true, message: 'Chiusura in corso.' });
    setTimeout(() => process.exit(0), 300);
  });

  // POST /api/system/switch-session — switch di sessione LightDM (v0.99.26).
  // Usato dal pulsante "Console Mode" → "Torna al Desktop", visibile solo
  // quando la Dashboard gira come sessione X11 dedicata (vedi
  // X_LAUNCHER_DEDICATED_SESSION in kiosk-launch.sh / dedicatedSession in
  // GET /api/config). `dm-tool switch-to-user` torna alla sessione XFCE se
  // già autenticata in precedenza (stesso comportamento di "Switch User"),
  // altrimenti mostra il greeter di login — comportamento identico in
  // entrambe le direzioni (XFCE→X-Launcher e viceversa), nessuna
  // distinzione speciale necessaria qui. Il nome della sessione XFCE target
  // è configurabile con X_LAUNCHER_DESKTOP_SESSION (default 'xfce', il nome
  // standard del file /usr/share/xsessions/xfce.desktop installato dal
  // pacchetto xfce4-session su Arch) per non dover modificare il codice se
  // il nome reale differisse su un sistema specifico.
  app.post('/api/system/switch-session', (req, res) => {
    if (!binaryExists('dm-tool')) {
      writeLog('warning', '[SYSTEM] switch-session requested but dm-tool is not available — install the lightdm package (already present if LightDM is the active display manager) or check the PATH.');
      res.status(501).json({ success: false, message: 'dm-tool non disponibile su questo sistema.' });
      return;
    }
    const username = process.env.USER || process.env.LOGNAME || '';
    const targetSession = process.env.X_LAUNCHER_DESKTOP_SESSION || 'xfce';
    if (!username) {
      writeLog('error', '[SYSTEM] switch-session: could not determine the current username (USER/LOGNAME env vars missing).');
      res.status(500).json({ success: false, message: 'Username non determinabile.' });
      return;
    }
    writeLog('system', `[SYSTEM] Session switch requested: ${username} → ${targetSession}`);
    res.json({ success: true, message: 'Switch di sessione in corso.' });
    const proc = spawn('dm-tool', ['switch-to-user', username, targetSession], { stdio: 'ignore' });
    proc.on('error', (e) => writeLog('error', `[SYSTEM] dm-tool switch-to-user failed: ${e.message}`));
  });

  // POST /api/system/steam-bigpicture — passa a Steam Big Picture (v0.99.32).
  // Usato dalla card "Steam Big Picture" iniettata lato frontend nella
  // libreria (vedi appendSteamBigPictureCard in App.tsx). `steam
  // steam://open/bigpicture` apre Big Picture indipendentemente da quanto
  // segue: se Steam è già in esecuzione (es. avviato silenziosamente da
  // session-launch.sh con -silent in sessione X11 dedicata), lo porta in
  // primo piano in modalità Big Picture invece di avviarne una seconda
  // istanza; se non è in esecuzione, lo avvia direttamente in quella
  // modalità. Nessun controllo preliminare di binaryExists('steam') qui:
  // se il binario non esiste, spawn fallisce e l'errore viene loggato,
  // comportamento già sufficiente — non serve bloccare la richiesta prima.
  app.post('/api/system/steam-bigpicture', (_req, res) => {
    writeLog('system', '[SYSTEM] Switch to Steam Big Picture requested.');
    res.json({ success: true, message: 'Apertura Steam Big Picture in corso.' });
    const proc = spawn('steam', ['steam://open/bigpicture'], { stdio: 'ignore' });
    proc.on('error', (e) => writeLog('error', `[SYSTEM] Failed to launch Steam Big Picture: ${e.message} — is Steam installed?`));
  });

  app.listen(PORT, "0.0.0.0", () => {
    writeLog('system', `Daemon started on http://0.0.0.0:${PORT}`);
    writeLog('system', `Log file: ${LOG_PATH_EXPORT}`);
  });
}

startServer();
