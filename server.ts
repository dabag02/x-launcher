
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { gameManager } from './src/backend/gameManager';
import { compatibilityManager } from './src/backend/compatibilityManager';
import { downloadManager, resolveDownloadsDir } from './src/backend/downloadManager';
import { writeLog, LOG_PATH_EXPORT } from './src/backend/logger';
import { notificationEngine } from './src/backend/notificationEngine';
import { knowledgeBase } from './src/backend/knowledgeBase';
import * as db from './src/backend/db';
import * as attemptTracker from './src/backend/aiProviders/attemptTracker';
import { readAppConfig, writeAppConfig, hasLanguageBeenSet, hasThemeBeenSet } from './src/backend/appConfig';
import { getSystemInfo } from './src/backend/systemInfo';
import { DATA_DIR, ENV_PATH } from './src/backend/paths';
import { THIRD_PARTY_LAUNCHERS, getThirdPartyLauncherDefinition } from './src/backend/plugins/thirdPartyLaunchers';
import { listDirectory, resolveRemovableMediaRoot } from './src/backend/fileManager';
import {
  getSharedLauncherState,
  openInstallerPage,
  markLauncherBootstrapped,
  launchSharedLauncher,
  closeSharedLauncher,
  isLauncherBootstrapped,
} from './src/backend/sharedLauncherManager';
import fs from 'fs';
import os from 'os';
import { spawn, execSync, execFileSync } from 'child_process';
import { subscribeLaunchPhase, getLastLaunchPhase } from './src/backend/launchPhaseTracker';
import * as processManager from './src/backend/processManager';
import * as windowFocus from './src/backend/windowFocus';
import { sendToSpaces, isSpacesActive, thawScope } from './src/backend/spacesClient';
import { ensureSteamSession, shutdownSteamSession, prestartSteamSession } from './src/backend/steamSession';
import { setActiveDisplay, getActiveSessionInfo } from './src/backend/activeDisplay';
import { readAppConfig, writeAppConfig, nextGamescopeResolution } from './src/backend/appConfig';
import { DATA_DIR } from './src/backend/paths';
import { requestLaunchCancel } from './src/backend/splashOrchestrator';
import { requestGuard, buildAllowedHosts, isExposedBind } from './src/backend/requestGuard';
import { isValidRunnerId } from './src/backend/runnerSafety';
import { hardenDataPermissions } from './src/backend/dataPermissions';
import { parseHttpUrl } from './src/backend/urlSafety';
import { loadOrCreateToken, authMiddleware, authenticate, NonceStore, TOKEN_FILE_NAME } from './src/backend/authToken';
import { hasBackupPassphrase, validatePassphrase, setBackupPassphrase, clearBackupPassphrase } from './src/backend/cloudBackup/backupCrypto';

// Stesso pattern già usato in altri moduli backend (downloadManager.ts,
// runners/implementations.ts, plugins/gogPlugin.ts, plugins/epicPlugin.ts)
// — non condiviso in un modulo comune per restare coerenti con quella
// convenzione esistente nel progetto.
function binaryExists(bin: string): boolean {
  try { execSync(`which ${bin}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

// v2.0.41-dev.35 — richiesta implicita: la rotta /splash interpola
// direttamente il titolo del gioco in HTML — senza escape, un titolo
// contenente caratteri come < o & romperebbe la pagina o, nel peggiore
// dei casi, aprirebbe a un'iniezione HTML da un titolo malformato.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function startServer() {
  const app = express();
    const AVATAR_DIR = path.join(DATA_DIR, 'avatars');

    fs.mkdirSync(AVATAR_DIR, {
      recursive: true
    });

  writeLog(
    'system',
    `[AVATAR] Avatar directory: ${AVATAR_DIR}`
  );

  // v1.1.102-dev.1 — .env non vive più nella cartella progetto: caricato
  // esternamente (--env-file, dal launcher o da systemd) da ENV_PATH
  // (~/.local/share/x-launcher/.env). Log diagnostico: se qualcuno si
  // aspetta chiavi API e non arrivano, questa riga dice subito se il
  // file è stato trovato.
  writeLog(
    'system',
    `[ENV] .env ${fs.existsSync(ENV_PATH) ? 'trovato' : 'NON trovato'}: ${ENV_PATH}`
  );
  // In AI Studio NODE_ENV veniva iniettato automaticamente dalla piattaforma.
  // Su Linux locale si imposta qui come fallback sicuro.
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
  }
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // v3.0.2-dev.2 (audit di sicurezza, punto 1) — il demone ascolta di default SOLO su
  // 127.0.0.1 (prima 0.0.0.0: tutte le rotte erano aperte a tutta la rete, senza login).
  // Per raggiungerlo da un altro dispositivo: X_LAUNCHER_BIND=0.0.0.0 e
  // X_LAUNCHER_ALLOWED_HOSTS=nome-o-ip-dell'HTPC (altrimenti il controllo di `Host` rifiuta).
  const BIND_HOST = (process.env.X_LAUNCHER_BIND || '').trim() || '127.0.0.1';
  const ALLOWED_HOSTS = buildAllowedHosts(process.env.X_LAUNCHER_ALLOWED_HOSTS);

  // PRIMA di tutto il resto: rifiuta `Host` non consentiti (DNS rebinding) e, sulle rotte /api,
  // richieste cross-site e `Origin` estranee (CSRF dal browser). Non tocca curl e gli script.
  app.use(requestGuard(ALLOWED_HOSTS, (reason, r) => {
    writeLog('warning', `[SECURITY] Richiesta rifiutata (${reason}): ${(r as { originalUrl?: string }).originalUrl ?? ''}`);
  }));

  // v3.0.2-dev.6 — header di sicurezza. Le risposte /api non vanno mai in cache (contengono stato,
  // percorsi e, per alcune rotte, dati personali); niente sniffing del tipo e Referer limitato verso l'esterno (i trailer YouTube incorporati ne hanno bisogno);
  // la Dashboard non deve essere incorniciata da altri siti (clickjacking).
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // v3.0.2-dev.3 — autenticazione. Token in DATA_DIR/api-token (0600); script e tray.py lo mandano
  // nell'header X-XLauncher-Token, il browser lo ottiene con un codice monouso (vedi authToken.ts).
  // X_LAUNCHER_AUTH=off la spegne (solo per diagnosi: il demone torna senza autenticazione).
  const AUTH_ENABLED = (process.env.X_LAUNCHER_AUTH || '').trim().toLowerCase() !== 'off';
  const API_TOKEN = loadOrCreateToken(DATA_DIR);
  const NONCES = new NonceStore();
  let lastAuthLog = 0;
  app.use(authMiddleware({
    token: API_TOKEN,
    nonces: NONCES,
    enabled: AUTH_ENABLED,
    onReject: (what) => {
      const now = Date.now();                      // al massimo una riga ogni 30 s: un tab vecchio non riempie il log
      if (now - lastAuthLog < 30_000) return;
      lastAuthLog = now;
      writeLog('warning', `[SECURITY] Accesso negato: ${what}`);
    },
  }));

  // POST /api/auth/nonce — codice monouso (60 s) per aprire il browser senza mettere il token nella
  // riga di comando. Richiede l'header col token: il solo cookie del browser non basta.
  app.post('/api/auth/nonce', (req, res) => {
    if (!AUTH_ENABLED) { res.json({ success: true, nonce: null }); return; }
    if (authenticate(req.headers, API_TOKEN) !== 'token') {
      res.status(401).json({ success: false, message: 'Serve il token nell\'header.' });
      return;
    }
    res.json({ success: true, nonce: NONCES.issue() });
  });

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
    // Step 19d — bug reale segnalato dall'utente: per Ubisoft Connect (o
    // un futuro launcher condiviso) non ancora bootstrappato, questo
    // "completed" significa solo "installer individuato", non "app
    // installata" — una notifica "Completato!" qui sarebbe fuorviante,
    // l'utente deve ancora eseguire il setup lanciando la card.
    //
    // v2.0.41-dev.11 — generalizzato da "solo Ubisoft" (hardcoded) a
    // "qualunque launcher condiviso presente nel registro" — stesso
    // principio già seguito in downloadManager.ts (dispatch installer) e
    // gameManager.ts (getGames filtro per store): un nuovo launcher
    // (EA App, Battle.net, Rockstar) non richiede più toccare questo
    // punto, basta comparire in thirdPartyLaunchers.ts con lo storeId
    // giusto.
    const task = downloadManager.getTasks().find(t => t.gameId === gameId);
    const thirdPartyDef = task ? THIRD_PARTY_LAUNCHERS.find(l => l.storeId === task.store) : undefined;
    const pendingSharedLauncher = !!thirdPartyDef && !isLauncherBootstrapped(thirdPartyDef.id);
    if (!pendingSharedLauncher) {
      notificationEngine.emit({ type: 'download-completed', gameId, gameTitle });
    }
    // v1.1.20 — stesso bug del percorso di disinstallazione, versione
    // installazione: il completamento aggiornava già isInstalled nel DB
    // (vedi downloadManager, fine del flusso di installazione) ma non
    // avvisava mai il frontend di rifare il fetch — la notifica toast
    // sopra è un canale diverso (NotificationEngine), non tocca
    // library-updated. La card restava "Not Installed" finché non
    // arrivava un library-updated per un altro motivo, o un riavvio.
    notifyLibraryUpdated();
  });
  downloadManager.onError((gameId, gameTitle, error, recentOutput) => {
    // v1.5.20-dev.14 — richiesta utente: alcuni titoli (es. Ubisoft
    // riscattati su Epic) non hanno mai file scaricabili tramite il
    // proprio store — invece di lasciare che l'utente riprovi
    // un'installazione destinata a fallire sempre, il plugin proprietario
    // riconosce (se sa farlo — vedi StorePlugin.detectUnrecoverableInstallFailure,
    // no-op per la maggioranza degli store) il fallimento definitivo
    // dall'output reale già catturato (dev.13), e qui marchiamo il gioco
    // di conseguenza e suggeriamo il launcher condiviso nel messaggio.
    const plugin = gameManager.getPluginForStore(
      downloadManager.getTasks().find(t => t.gameId === gameId)?.store
        ?? db.getGameById(gameId)?.store
        ?? ''
    );
    const unrecoverable = !!recentOutput && !!plugin?.detectUnrecoverableInstallFailure(recentOutput);
    if (unrecoverable) {
      db.updateGameConfig(gameId, { storeInstallUnavailable: true });
      const game = db.getGameById(gameId);
      const launcherDef = game?.requiresLauncher ? getThirdPartyLauncherDefinition(game.requiresLauncher) : undefined;
      const suggestion = launcherDef
        ? `Questo titolo non è scaricabile da qui — installalo da ${launcherDef.displayName} (già impostato come launcher condiviso per questo gioco).`
        : `Questo titolo non è scaricabile da qui — impostalo su "Launcher condiviso" nelle opzioni del gioco e installalo da lì.`;
      notificationEngine.emit({ type: 'download-error', gameId, gameTitle, error: suggestion });
      notifyLibraryUpdated();
      return;
    }
    notificationEngine.emit({ type: 'download-error', gameId, gameTitle, error });
  });
  // v0.99.35 — esito lookup Heroic known-fixes, per trasparenza
  // all'utente su quali dipendenze sono state realmente installate.
  downloadManager.onKnownFixesResult((gameId, gameTitle, found, verbs) => {
    notificationEngine.emit({ type: 'known-fixes-result', gameId, gameTitle, found, verbs });
  });
  // Step 19d — RIMOSSO: l'installer mancante di un launcher condiviso
  // NON genera più una notifica separata (feedback utente: le
  // interazioni di installazione sono sempre vissute nel pannello
  // Download, spezzarle su un'altra colonna non ha senso). Il task
  // stesso porta già status='awaiting_installer' + downloadUrl, letti
  // direttamente dal pannello Download via il normale polling di
  // /api/downloads.

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
      const { execFileSync } = require('child_process') as typeof import('child_process');
      execFileSync('legendary', ['auth', '--code', authCode], { encoding: 'utf-8', timeout: 20000 });
      writeLog('auth', '[Epic] auth-code: authentication completed via authorization code');
      res.json({ success: true, message: 'Autenticazione Epic completata.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeLog('error', `[Epic] auth-code error: ${message}`);
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

  // POST /api/system/input-wake — v2.1.10-dev.2, combo controller
  // Select+L1+R1: la Dashboard è "congelata" (isFocusFrozen, vedi
  // App.tsx) perché un gioco reale è in esecuzione, questa è l'unica
  // combo che l'input gate lascia comunque passare. Porta la finestra
  // Dashboard in primo piano via wmctrl.
  app.post("/api/system/input-wake", async (_req, res) => {
    // v2.5.1-dev.4 (Step 21) — nella sessione Openbox "Shell" il gestore
    // degli spazi (spaces.py) legge LUI il controller da evdev e porta alla
    // Dashboard: se risponde, qui non si fa nulla, altrimenti ogni azione
    // verrebbe eseguita due volte (una dal demone, una da Chromium).
    if (await isSpacesActive()) {
      res.json({ success: true, handledByDaemon: true });
      return;
    }
    res.json({ success: windowFocus.wakeDashboard() });
  });

  // POST /api/system/input-focus-game — combo Select+◄/► (v2.1.10-dev.10,
  // sostituisce input-cycle-window — vedi windowFocus.ts per la storia
  // completa dei due tentativi precedenti, entrambi rivelatisi
  // inaffidabili su hardware reale). Porta in primo piano SPECIFICAMENTE
  // la finestra del gioco tracciato, correlata per PID/cgroup — non più
  // un ciclo fra tutte le finestre aperte.
  app.post("/api/system/input-focus-game", async (_req, res) => {
    // v2.5.1-dev.4 (Step 21) — vedi input-wake: con il gestore degli spazi
    // attivo i cambi di spazio li fa il demone via evdev.
    if (await isSpacesActive()) {
      res.json({ success: true, handledByDaemon: true });
      return;
    }
    res.json({ success: windowFocus.focusGameWindow() });
  });

  // GET /api/spaces — v2.5.1-dev.4 (Step 21). Stato del gestore degli spazi
  // (spazio corrente e spazi occupati), per l'indicatore nella Dashboard.
  // `active:false` fuori dalla sessione Openbox "Shell".
  app.get("/api/spaces", async (_req, res) => {
    const state = await sendToSpaces({ cmd: 'state' });
    if (!state) {
      res.json({ active: false });
      return;
    }
    res.json({ active: true, ...state });
  });

  // POST /api/spaces/:action — next | prev | dashboard | switch ({ space }).
  app.post("/api/spaces/:action", async (req, res) => {
    const action = String(req.params.action);
    if (!['next', 'prev', 'dashboard', 'switch'].includes(action)) {
      res.status(400).json({ success: false, error: 'azione non valida' });
      return;
    }
    const payload: Record<string, unknown> = { cmd: action };
    if (action === 'switch') payload.space = req.body?.space;
    const state = await sendToSpaces(payload);
    if (!state) {
      res.status(503).json({ success: false, active: false });
      return;
    }
    res.json({ success: state.ok, active: true, ...state });
  });

  // POST /api/system/active-display — v2.2.19-dev.2. BUG REALE
  // CONFERMATO: xdash.service ha DISPLAY=:0 fisso (valido solo per la
  // sessione XFCE, vedi commento in xdash.service) — i giochi lanciati
  // mentre la sessione Kiosk gamescope (Step 20) era quella attiva
  // finivano invisibili sull'altro DISPLAY. Ogni sessione (kiosk-launch.sh
  // per XFCE, gamescope-session.sh per la Kiosk) chiama questo endpoint
  // quando diventa quella attiva, riportando il proprio DISPLAY reale.
  // Vedi activeDisplay.ts per la diagnosi completa.
  app.post("/api/system/active-display", (req, res) => {
    const { display, waylandDisplay, kind, resolution, spaces } = req.body ?? {};
    // v3.0.2-dev.5 (audit punto 9) — DISPLAY/WAYLAND_DISPLAY diventano l'ambiente di tutti i giochi lanciati
    // dopo: si accettano solo ":N[.M]" e "<nome>-N". Valori non validi non vengono applicati.
    if (!setActiveDisplay(display, waylandDisplay, kind, resolution, spaces)) {
      writeLog('warning', `[ACTIVE-DISPLAY] Valori rifiutati (non validi): DISPLAY=${JSON.stringify(display)?.slice(0, 40)} WAYLAND_DISPLAY=${JSON.stringify(waylandDisplay)?.slice(0, 40)} kind=${JSON.stringify(kind)?.slice(0, 20)}`);
      res.status(400).json({ success: false, message: 'Valori non validi.' });
      return;
    }
    writeLog('system', `[ACTIVE-DISPLAY] Sessione attiva segnalata: kind=${kind ?? 'desktop'} DISPLAY=${display ?? '(non impostato)'} WAYLAND_DISPLAY=${waylandDisplay ?? '(non impostato)'}${resolution ? ` risoluzione=${resolution}` : ''}${spaces === true ? ' spazi=si' : ''}`);
    res.json({ success: true });
  });

  // GET /api/system/session-info — v2.2.19-dev.7. Stato reale per il
  // pulsante "Modalità Gamescope" del menu (sostituisce il mock
  // isGamescope lato frontend): se la sessione Kiosk è davvero attiva in
  // questo momento e, se sì, a quale risoluzione sta girando gamescope —
  // valori riportati da gamescope-session.sh/kiosk-launch.sh allo stesso
  // POST /api/system/active-display sopra, non rilevati da qui.
  app.get("/api/system/session-info", (_req, res) => {
    res.json(getActiveSessionInfo());
  });

  // POST /api/system/gamescope-resolution/cycle — v2.2.19-dev.9. Avanza
  // gamescopeResolution alla prossima voce (HD→FullHD→QHD→4K→HD) e la
  // persiste in app.conf. SOLO QUESTO — nessun segnale di riavvio qui.
  // Chiamato dal frontend ad OGNI pressione del pulsante, anche durante
  // il countdown di 5s: una pressione in più deve solo avanzare la
  // selezione mostrata, non far ripartire gamescope sul colpo (altrimenti
  // N pressioni durante il countdown causerebbero N riavvii reali,
  // vanificando il countdown stesso). Vedi /apply sotto per il riavvio
  // vero, chiamato una sola volta allo scadere del countdown.
  app.post("/api/system/gamescope-resolution/cycle", (_req, res) => {
    const current = readAppConfig();
    const next = nextGamescopeResolution(current.gamescopeResolution);
    writeAppConfig({ gamescopeResolution: next });
    writeLog('system', `[GAMESCOPE] Risoluzione Kiosk selezionata: ${next} (era ${current.gamescopeResolution}) — non ancora applicata.`);
    res.json({ resolution: next });
  });

  // POST /api/system/gamescope-resolution/apply — v2.2.19-dev.9. Non
  // tocca la risoluzione persistita — la applica, così com'è in questo
  // momento in app.conf (qualunque sequenza di /cycle l'abbia portata
  // lì), segnalando a gamescope-session.sh di riavviarsi SOLO se la
  // sessione Kiosk è davvero attiva ora. Chiamato dal frontend una sola
  // volta, allo scadere del countdown di 5s senza ulteriori pressioni.
  // pidfile scritto da gamescope-session.sh stesso al proprio avvio.
  app.post("/api/system/gamescope-resolution/apply", (_req, res) => {
    const { gamescopeResolution } = readAppConfig();
    const sessionInfo = getActiveSessionInfo();
    let restarted = false;
    if (sessionInfo.kind === 'kiosk') {
      const pidFile = path.join(DATA_DIR, 'gamescope-session.pid');
      try {
        if (fs.existsSync(pidFile)) {
          const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
          if (Number.isFinite(pid) && pid > 0) {
            process.kill(pid, 'SIGUSR1');
            restarted = true;
            writeLog('system', `[GAMESCOPE] Segnale di riavvio inviato a gamescope-session.sh (PID ${pid}) per applicare ${gamescopeResolution}.`);
          }
        } else {
          writeLog('warning', `[GAMESCOPE] Sessione Kiosk segnalata attiva ma ${pidFile} non trovato — impossibile far riavviare gamescope ora.`);
        }
      } catch (err) {
        writeLog('error', `[GAMESCOPE] Invio segnale di riavvio fallito: ${err instanceof Error ? err.message : err}`);
      }
    }
    res.json({ resolution: gamescopeResolution, restarted });
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

  // POST /api/logs — v2.1.10-dev.8, diagnostica per i bug del "muting"
  // input in-game (windowFocus.ts): permette al frontend di scrivere
  // nella stessa Debug Console (Ctrl+H) del backend, così i cambi di
  // document.hidden/visibilityState (frontend) e le decisioni prese in
  // windowFocus.ts (backend) finiscono nello stesso pannello, ordinabili
  // per timestamp — prima non esisteva alcun modo per il frontend di
  // finire in quel pannello, solo la console del browser (poco pratica
  // da consultare in modalità kiosk). Body atteso: { message: string,
  // type?: LogLevel } — type di default 'debug' se omesso o non valido.
  app.post("/api/logs", (req, res) => {
    const message = req.body?.message;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'message required' });
    }
    const validTypes = ['debug', 'info', 'system', 'warning', 'error', 'auth', 'download', 'launch'];
    const type = validTypes.includes(req.body?.type) ? req.body.type : 'debug';
    // v3.0.2-dev.4 — niente a-capo/caratteri di controllo (log injection: righe false nel log) e lunghezza limitata.
    const cleanMessage = message.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 2000);
    gameManager.addLog(cleanMessage, type);
    res.json({ success: true });
  });

  // Step 19d — apre un URL qualunque nel browser esterno (usato dal link
  // nel pannello Download quando un installer manuale è richiesto).
  // Stesso meccanismo firefox/xdg-open già in uso altrove nel backend
  // (sharedLauncherManager.ts/googleDrive.ts) — duplicato qui per
  // coerenza con quella convenzione (helper per-file, non un'utility
  // condivisa), non un'astrazione nuova da mantenere.
  app.post("/api/open-url", (req, res) => {
    // v3.0.2-dev.5 (audit punto 7) — solo http/https "puliti": un valore che inizia con '-' sarebbe un'OPZIONE per
    // Firefox, e con xdg-open schemi come file:// o xlaunch:// aprirebbero cose che non sono pagine web.
    if (!req.body?.url || typeof req.body.url !== 'string') {
      return res.status(400).json({ success: false, message: 'url required' });
    }
    const parsedUrl = parseHttpUrl(req.body.url);
    if (!parsedUrl) {
      return res.status(400).json({ success: false, message: 'Sono ammessi solo indirizzi http o https.' });
    }
    const url = parsedUrl.toString();
    try {
      execSync('which firefox', { stdio: 'ignore' });
      spawn('firefox', [url], { detached: true, stdio: 'ignore' }).unref();
    } catch {
      try {
        execSync('which xdg-open', { stdio: 'ignore' });
        spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
      } catch {
        writeLog('warning', `[open-url] Nessun browser trovato (firefox/xdg-open) — apri manualmente: ${url}`);
        return res.json({ success: false, message: 'Nessun browser trovato.' });
      }
    }
    res.json({ success: true });
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

  // Step 19d — flusso installer manuale Ubisoft Connect: l'utente conferma
  // di aver scaricato (ricontrolla ~/Downloads) o indica il file a mano
  // (zenity/kdialog via filePicker.ts).
  app.post("/api/downloads/installer-continue", (req, res) => {
    const gameId = req.body.gameId ?? req.body.id;
    if (!gameId) return res.status(400).json({ success: false, message: 'gameId required' });
    res.json(downloadManager.continueInstaller(gameId));
  });

  app.post("/api/downloads/installer-browse", async (req, res) => {
    const gameId = req.body.gameId ?? req.body.id;
    if (!gameId) return res.status(400).json({ success: false, message: 'gameId required' });
    res.json(await downloadManager.browseInstaller(gameId));
  });

  // v1.5.20-dev.12 — Fase A.4: file manager nativo controller-navigabile.
  // La selezione avviene già lato client (l'utente ha navigato nell'overlay
  // in-app) — qui arriva solo il path finale da confermare, stessa
  // convalida/completamento di installer-browse ma senza dialog nativo.
  app.post("/api/downloads/installer-select", (req, res) => {
    const gameId = req.body.gameId ?? req.body.id;
    const filePath = req.body.path;
    if (typeof gameId !== 'string' || typeof filePath !== 'string' || !gameId || !filePath) {
      return res.status(400).json({ success: false, message: 'gameId e path richiesti (stringhe)' });
    }
    res.json(downloadManager.confirmInstallerPath(gameId, filePath));
  });

  // v1.5.20-dev.12 — Fase A.4: elenco di una cartella arbitraria per il
  // file manager nativo. `extensions` opzionale, separato da virgola
  // (es. "exe,msi,cab") — filtra solo i FILE, le cartelle restano sempre
  // visibili per poterci navigare dentro.
  app.get("/api/filesystem/list", (req, res) => {
    const dirPath = req.query.path as string;
    if (!dirPath) return res.status(400).json({ error: 'path richiesto' });
    const extensions = typeof req.query.extensions === 'string' && req.query.extensions.length > 0
      ? req.query.extensions.split(',').slice(0, 30).map(e => e.slice(0, 16))
      : undefined;
    res.json(listDirectory(dirPath, extensions));
  });

  // v1.5.20-dev.12 — Fase A.4: percorsi di partenza per i quick-link
  // dell'header (Home/Downloads/Supporti rimovibili) — risolti una volta
  // sola qui invece che il client debba conoscerne la logica.
  app.get("/api/filesystem/quick-links", (_req, res) => {
    res.json({
      home: os.homedir(),
      downloads: resolveDownloadsDir(),
      removableMedia: resolveRemovableMediaRoot(),
    });
  });

  app.get("/api/runners", (req, res) => {
    res.json(compatibilityManager.getAvailableRunners());
  });

  // POST /api/runners/download — installa un runner con SSE progress streaming
  // Il client apre una EventSource su /api/runners/install-stream?id=<id>
  app.post("/api/runners/download", async (req, res) => {
    const { id } = req.body;
    if (!isValidRunnerId(id)) { res.status(400).json({ success: false, message: 'Identificativo runner non valido.' }); return; }
    await compatibilityManager.downloadProton(id, (msg) => gameManager.addLog(msg, 'system'));
    await gameManager.refreshRunners();
    res.json({ success: true });
  });

  // GET /api/runners/install-stream?id=<id> — SSE con progress messaggi
  app.get("/api/runners/install-stream", async (req, res) => {
    const id = req.query.id as string;
    if (!isValidRunnerId(id)) { res.status(400).end(); return; }

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
    } catch (err) {
      const errMsg = `Installazione fallita: ${err instanceof Error ? err.message : String(err)}`;
      send('error', errMsg);
      notificationEngine.emit({ type: 'runner-error', runnerId: id, error: errMsg });
    }
    res.end();
  });

  // GET /api/runners/uninstall-stream?id=<id> — SSE simmetrico a install-stream
  app.get("/api/runners/uninstall-stream", async (req, res) => {
    const id = req.query.id as string;
    if (!isValidRunnerId(id)) { res.status(400).end(); return; }

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
    } catch (err) {
      const errMsg = `Disinstallazione fallita: ${err instanceof Error ? err.message : String(err)}`;
      send('error', errMsg);
      notificationEngine.emit({ type: 'runner-error', runnerId: id, error: errMsg });
    }
    res.end();
  });

  app.post("/api/runners/refresh", async (req, res) => {
    const runners = await gameManager.refreshRunners();
    res.json({ runners });
  });

  // v2.0.41-dev.32 — richiesta utente, roadmap usabilità punto 2/3
  // (splash di lancio). Diverso dai due stream sopra: qui NON siamo noi
  // a guidare l'operazione (il lancio parte dal normale POST
  // /api/games/:id/launch, invariato) — questo endpoint si limita ad
  // "agganciarsi" a un lancio già in corso o appena avviato, per questo
  // motivo, non un semplice callback come per install/uninstall.
  // Invia SUBITO l'ultima fase nota (getLastLaunchPhase) prima di
  // restare in ascolto — copre il caso in cui la splash apra questa
  // connessione con un po' di ritardo rispetto all'inizio del lancio
  // vero, così non resta in attesa di un evento che potrebbe già essere
  // passato.
  app.get("/api/games/:id/launch-stream", (req, res) => {
    const gameId = req.params.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: ReturnType<typeof getLastLaunchPhase>) => {
      if (!event) return;
      try { res.write(`event: phase\ndata: ${JSON.stringify(event)}\n\n`); } catch {}
    };

    send(getLastLaunchPhase(gameId));
    const unsubscribe = subscribeLaunchPhase(gameId, send);

    req.on('close', () => { unsubscribe(); });
  });

  // POST /api/games/:id/cancel-launch — v2.1.10-dev.12, tasto di
  // chiusura della splash (punto c della richiesta: termina un avvio
  // molto lungo su richiesta esplicita, senza aspettare il timeout di
  // sicurezza). Risponde onestamente { success: false } se non c'è
  // alcun lancio in corso per questo gameId da annullare (già concluso
  // per conto suo, o mai iniziato) — vedi requestLaunchCancel.
  app.post("/api/games/:id/cancel-launch", (req, res) => {
    const gameId = req.params.id;
    res.json({ success: requestLaunchCancel(gameId) });
  });

  // v2.1.10-dev.12 — RIMOSSA la route GET /splash (pagina HTML generata
  // al volo per la vecchia finestra splash separata) — la splash è ora
  // un overlay React dentro la Dashboard stessa (vedi App.tsx), che
  // ascolta direttamente /api/games/:id/launch-stream qui sopra,
  // invariato. `splashWindow.ts` (apriva quella finestra) è stato
  // rimosso, nessun altro chiamante rimasto.

  // POST /api/steam/prestart — v3.2.6-dev.4. Chiamato da kiosk-launch.sh nella sessione Openbox solo con
  // X_LAUNCHER_STEAM_PRESTART=1: apre Steam (Big Picture in gamescope) in background nello spazio 3, dove
  // spaces.py lo congela appena pronto. Risponde subito; l'esito va nel log.
  app.post("/api/steam/prestart", (_req, res) => {
    // Nessun controllo su isSpacesSessionDeclared(): kiosk-launch.sh la segnala poco dopo. Basta il
    // gestore degli spazi (esiste solo nella sessione Openbox), atteso da prestartSteamSession().
    res.json({ success: true });
    prestartSteamSession()
      .then(r => writeLog(r.started ? 'system' : 'info', `[STEAM-SESSION] prestart: ${r.message}`))
      .catch(err => writeLog('error', `[STEAM-SESSION] prestart failed: ${err}`));
  });

  // Step 2 — Apri Steam Big Picture (switcha fuori dalla dashboard)
  app.post("/api/steam/bigpicture", (req, res) => {
    const { openSteamBigPicture } = require('./src/backend/runners/implementations');
    res.json(openSteamBigPicture());
  });

  // ---------------------------------------------------------------------------
  // Step 19d — Launcher terze parti condivisi (Fase 1)
  // ---------------------------------------------------------------------------

  // Stato di tutti i launcher condivisi (registro + bootstrap già fatto o
  // meno) — usato dal frontend per decidere se la card mostra "installer"
  // o "launcher" (stesso principio della card Steam Big Picture, ma qui
  // lo stato è reale, non sintetico).
  app.get("/api/shared-launchers", (_req, res) => {
    const list = THIRD_PARTY_LAUNCHERS.map(def => {
      const state = getSharedLauncherState(def.id);
      // v1.5.20-dev.28 — richiesta utente: il Runner Bridge di un gioco
      // dipendente mostra già il runner ereditato dal launcher condiviso
      // (dev.27) — lo stesso principio va applicato al tile Umu-launcher,
      // che deve mostrare (bloccato, mai una scelta indipendente) lo
      // stato REALE del launcher condiviso, non un valore indovinato.
      // `games.executablePath`/`runner` sono l'unica fonte di verità per
      // runner/eseguibile (dev.27) — qui la stessa riga games.id serve
      // anche a leggere il proprio CompatibilityProfile.umuRun.
      const compatProfile = db.getCompatProfile(`${def.id}-launcher`);
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
        available: !!def.installerUrl,
      };
    });
    res.json(list);
  });

  // Runner disponibili per il selettore di bootstrap — filtrati a sole
  // build Proton/GE-Proton (mai Wine, decisione esplicita dell'utente per
  // il supporto anticheat). Riusa compatibilityManager.getAvailableRunners()
  // esistente, nessun secondo scanner.
  app.get("/api/shared-launchers/:id/runners", (_req, res) => {
    const allRunners = compatibilityManager.getAvailableRunners();
    const protonRunners = allRunners.filter(r => /proton/i.test(r.id));
    res.json(protonRunners);
  });

  // Apre la pagina ufficiale di download nel browser — MAI un download
  // automatico, vedi nota su installerUrl in thirdPartyLaunchers.ts.
  app.post("/api/shared-launchers/:id/open-installer-page", (req, res) => {
    res.json(openInstallerPage(req.params.id));
  });

  // Conferma bootstrap completato: l'utente ha già installato manualmente
  // il launcher dentro il prefix condiviso con la Proton scelta.
  app.post("/api/shared-launchers/:id/bootstrap", (req, res) => {
    const { runner, launcherExe } = req.body;
    if (!runner || !launcherExe) {
      res.status(400).json({ success: false, message: 'runner e launcherExe sono richiesti.' });
      return;
    }
    try {
      markLauncherBootstrapped(req.params.id, runner, launcherExe);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, message: err instanceof Error ? err.message : String(err) });
    }
  });

  // Avvia il launcher terzo stesso (card in stato "launcher", dopo il
  // bootstrap) — stesso principio della card Steam Big Picture.
  app.post("/api/shared-launchers/:id/launch", async (req, res) => {
    const result = await launchSharedLauncher(req.params.id);
    res.json(result);
  });

  // v1.5.20-dev.22 — chiusura ESPLICITA su scelta dell'utente (notifica
  // "tieni aperto / chiudi ora" alla chiusura di un gioco dipendente) —
  // mai chiamato automaticamente da nessun'altra parte del demone.
  app.post("/api/shared-launchers/:id/close", async (req, res) => {
    const result = await closeSharedLauncher(req.params.id);
    res.json(result);
  });

  // v2.0.41-dev.53 — Process Manager, step 4: elenco + kill per il
  // pannello UI. Il titolo viene arricchito qui (non in processManager.ts,
  // che deliberatamente non conosce il database o i launcher condivisi —
  // vedi il commento su reconcileOnStartup — per evitare un giro di
  // dipendenze circolare con gameManager/sharedLauncherManager).
  app.get("/api/process-manager/list", (_req, res) => {
    // v3.2.6-dev.2 — in coda la Dashboard (sessione Openbox), mostrata ma non terminabile.
    const active = [...processManager.listActive(), ...processManager.listDashboardScopes()].map(info => ({
      ...info,
      title: info.kind === 'game'
        ? (db.getGameById(info.id)?.title ?? info.title)
        : info.kind === 'shared-launcher'
          ? (getThirdPartyLauncherDefinition(info.id)?.displayName ?? info.title)
          : info.title,
      killable: info.kind !== 'dashboard',
    }));
    res.json(active);
  });

  // Kill dalla UI: un launcher condiviso lanciato standalone dalla
  // propria card passa da closeSharedLauncher() (wineserver -k, già
  // testato per una sessione Wine) — non un SIGKILL generico da cgroup.
  // Tutto il resto (un gioco, launcher condiviso incluso se bootstrappato
  // implicitamente dentro la sua catena) usa killScope() generico:
  // uccidere lo scope del gioco uccide comunque l'intero albero, stesso
  // principio già verificato in dev.50.
  app.post("/api/process-manager/:unit/kill", async (req, res) => {
    // v3.2.6-dev.2 — la Dashboard non si termina da qui (si chiuderebbe da sola sotto i piedi dell'utente).
    if (processManager.isDashboardUnit(String(req.params.unit))) {
      res.status(403).json({ success: false, message: 'La Dashboard non si può terminare dal Gestore dei processi.' });
      return;
    }
    const info = processManager.getScopeInfo(req.params.unit);
    if (!info) {
      res.json({ success: false, message: 'Processo non più attivo.' });
      return;
    }
    // v3.2.6-dev.3 — uno scope congelato dal gestore degli spazi non risponde a una chiusura ordinata
    // (steam -shutdown, wineserver -k): prima si scongela.
    await thawScope(info.unit);
    const result = info.kind === 'shared-launcher'
      ? await closeSharedLauncher(info.id)
      : info.kind === 'steam'
        ? await shutdownSteamSession(info.unit)       // v3.2.6-dev.2 — chiusura ordinata di Steam (poi gamescope esce da solo)
        : processManager.killScope(info.unit);
    res.json(result);
  });

  app.get("/api/fixes/:gameId", (req, res) => {
    res.json(compatibilityManager.getSuggestedFixes(req.params.gameId));
  });

  // Rileva tool Linux installati (gamescope, mangohud, protonup, ecc.)
  app.get("/api/system-tools", (req, res) => {
    res.json(compatibilityManager.detectSystemTools());
  });

  app.post("/api/launch", async (req, res) => {
    const { id, launchArgsOverride } = req.body ?? {};
    // v3.0.2-dev.5 — tipi verificati: id stringa, argomenti temporanei (se presenti) stringa di lunghezza ragionevole.
    if (typeof id !== 'string' || id.length === 0 || id.length > 300
        || (launchArgsOverride !== undefined && (typeof launchArgsOverride !== 'string' || launchArgsOverride.length > 4000))) {
      res.status(400).json({ success: false, message: 'Richiesta di lancio non valida.' });
      return;
    }
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
    } catch (err) {
      writeLog('error', `[API] /system-info fallita: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'Impossibile rilevare l\'hardware' });
    }
  });

  app.get("/api/games/:id/compat", (req, res) => {
    const { getCompatProfile } = require('./src/backend/db');
    res.json(getCompatProfile(req.params.id) ?? {});
  });

  // Richiesta utente — "auto-remaster", on/off dall'overlay. Per i preset
  // 'swap-core' (PSX/Saturn) il core stesso è l'interruttore; per i preset
  // 'toggle-options' (PS2/futuro N64) lo stato vive nel campo DB
  // remasterEnabled, incluso nella risposta (vedi setRemasterEnabled in
  // gameManager.ts). Generalizzato dal caso PSX — funziona per qualunque
  // sistema con una voce in REMASTER_PRESETS.
  app.post("/api/games/:id/remaster", async (req, res) => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      const result = await gameManager.setRemasterEnabled(req.params.id, enabled === true);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeLog('error', `[API] /remaster fallita per ${req.params.id}: ${message}`);
      res.status(500).json({ success: false, message: message ?? 'Errore interno' });
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
    } catch (err) {
      writeLog('error', `[API] /predicted-size fallita per ${req.params.id}: ${err instanceof Error ? err.message : String(err)}`);
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

    // v2.0.41-dev.15 — richiesta utente: capitalizzare l'esperienza reale
    // accumulata installando/avviando i launcher condivisi (Ubisoft
    // Connect, EA App) per aiutare proattivamente un futuro utente nelle
    // stesse difficoltà. Quando l'utente segnala "Non ha funzionato"
    // (status 'failed') su una validation-prompt (source 'validation',
    // vedi notificationEngine.ts) per un gioco che È un launcher condiviso
    // o che ne RICHIEDE uno con troubleshootingTips noti
    // (thirdPartyLaunchers.ts), proponi quei consigli invece di lasciare
    // l'utente a sé stesso. Fire-and-forget dopo la risposta, stesso stile
    // già usato per steam-bigpicture-closed sopra — mai bloccante.
    if (status === 'failed') {
      const notif = notificationEngine.getRecent(50).find(n => n.id === req.params.id);
      if (notif?.source === 'validation' && notif.game_id) {
        const game = db.getGameById(notif.game_id);
        if (game) {
          const def = THIRD_PARTY_LAUNCHERS.find(l => l.storeId === game.store)
            ?? (game.requiresLauncher ? getThirdPartyLauncherDefinition(game.requiresLauncher) : undefined);
          if (def?.troubleshootingTips?.length) {
            // Un solo giro di consigli per gioco — non ripetuto a ogni
            // "Non ha funzionato" successivo, stesso principio di dedup
            // già usato per la notifica di collegamento libreria nativa
            // (vedi source 'shared-launcher-scan' in ubisoftConnectPlugin.ts).
            const alreadyShown = notificationEngine.getRecent(200)
              .some(n => n.source === 'launcher-tips' && n.game_id === game.id);
            if (!alreadyShown) {
              const lang = readAppConfig().language;
              const tips = def.troubleshootingTips.map(t => (lang === 'en' && t.textEn) ? t.textEn : t.text);
              notificationEngine.emit({
                type: 'launcher-troubleshooting-tips',
                launcherName: def.displayName,
                gameId: game.id,
                gameTitle: game.title,
                tips,
              });
            }
          }
        }
      }
    }
  });

  // GET /api/version — versione/milestone da metadata.json.
  // v1.1.87 — non più consumato dal frontend per il numero mostrato nel
  // menu (vedi il commento esteso in App.tsx sull'effect rimosso): questo
  // file viene aggiornato solo ai congelamenti di milestone, mai nei fix
  // quotidiani, quindi usarlo per sovrascrivere la versione mostrata
  // causava una versione stantia in ogni cartella di sviluppo non
  // risincronizzata con l'ultimo zip di milestone. Lasciato qui per uso
  // futuro (es. diagnostica esterna, script), non più per questo scopo.
  // v1.5.4-dev.1 — corretto: leggeva metadata.json, la stessa fonte che
  // aveva causato il bug v1.1.87 (metadata.json viene toccato SOLO ai
  // congelamenti di milestone, mai ai fix quotidiani — la versione
  // mostrata nel menu sarebbe rimasta ferma all'ultima milestone invece
  // di riflettere ogni singola build di sviluppo). package.json invece
  // viene aggiornato ad ogni singola modifica — fonte corretta per una
  // versione sempre fresca senza intervento manuale.
  app.get('/api/version', (_req, res) => {
    try {
      const { readFileSync } = require('fs');
      const { join } = require('path');
      const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
      res.json({ version: pkg.version ?? '0.0.0' });
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
      // v3.1.7-dev.1 — false finché app.conf non ha `theme=` (vedi hasThemeBeenSet()).
      themeIsUserSet: hasThemeBeenSet(),
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
    } catch (err) {
      res.status(500).json({ success: false, message: err instanceof Error ? err.message : String(err) });
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
    // v1.1.108-dev.1 — usageThisMonth per-provider incluso qui: prima era
    // una chiamata separata (/api/ai/usage) con un unico totale
    // aggregato; ora il budget è per-provider (vedi db.ts), quindi ogni
    // riga porta con sé sia il proprio tetto configurato sia il proprio
    // consumo — nessuna seconda chiamata necessaria lato client.
    const usage = db.getAiUsageThisMonth();
    res.json(db.getAllAiProviderCredentials().map(c => ({
      ...c,
      // Non rimandare mai la key in chiaro nella risposta GET, anche se
      // è salvata in chiaro nel DB (vedi nota in db.ts) — nessun motivo
      // di esporla di nuovo lato client oltre al momento in cui viene
      // scritta.
      apiKey: c.apiKey ? '••••••••' : undefined,
      usageThisMonth: usage.byProvider[c.providerId] ?? 0,
    })));
  });

  app.post('/api/ai/providers/:id', async (req, res) => {
    const { enabled, apiKey, baseUrl, model, priority, tokenBudget } = req.body;
    if (baseUrl !== undefined && baseUrl !== null && baseUrl !== '' && !parseHttpUrl(baseUrl)) {
      res.status(400).json({ success: false, message: 'L\'indirizzo del provider deve essere http o https.' });
      return;
    }
    // v0.99.90 — fix: prima questa route sovrascriveva SEMPRE apiKey/
    // baseUrl/model con quanto ricevuto, incluso undefined→null. Il
    // frontend non ha mai il vero valore dell'API key (mascherata come
    // '••••••••' dalla GET) — attivare solo il toggle "enabled" senza
    // reinserire la key l'avrebbe cancellata. Ora è un vero aggiornamento
    // parziale: un campo omesso (o stringa vuota per apiKey) preserva il
    // valore già salvato invece di azzerarlo.
    const existing = db.getAiProviderCredential(req.params.id);
    // v1.1.108-dev.1 — richiesto dall'utente: i provider locali (solo
    // Ollama oggi, riconosciuto via requiresApiKey===false — non
    // hardcoded sull'id, cosi vale anche per un futuro provider locale
    // diverso) non hanno mai un budget: sempre null/∞, qualunque valore
    // arrivi dal client viene ignorato. Per i provider cloud, un valore
    // esplicito nel body vince; altrimenti si preserva quello già
    // salvato; se è la primissima configurazione (nessun existing) si
    // parte da 5.000.000 (default deciso con l'utente).
    const { buildProvider } = await import('./src/backend/aiProviders/registry');
    const probe = buildProvider({ providerId: req.params.id, enabled: false, priority: 0 });
    const isLocalProvider = probe ? !probe.requiresApiKey : false;
    const resolvedTokenBudget = isLocalProvider
      ? undefined
      : (typeof tokenBudget === 'number' ? tokenBudget : (existing?.tokenBudget ?? 5_000_000));
    db.upsertAiProviderCredential({
      providerId: req.params.id,
      enabled:    Boolean(enabled),
      apiKey:     (apiKey !== undefined && apiKey !== '') ? apiKey : existing?.apiKey,
      baseUrl:    baseUrl !== undefined ? baseUrl : existing?.baseUrl,
      model:      model   !== undefined ? model   : existing?.model,
      priority:   typeof priority === 'number' ? priority : (existing?.priority ?? 999),
      tokenBudget:       resolvedTokenBudget,
      budgetWarnedMonth: existing?.budgetWarnedMonth,
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
    if (baseUrl !== undefined && baseUrl !== null && baseUrl !== '' && !parseHttpUrl(baseUrl)) {
      return res.json({ success: false, message: 'L\'indirizzo del provider deve essere http o https.' });
    }
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

  // v1.1.121-dev.1 — Cloud Backup. Stesso schema delle route AI Advisor
  // sopra: GET restituisce lo stato di tutti i provider registrati in un
  // solo colpo, POST salva le credenziali (client_id/client_secret creati
  // dall'utente sulla console del proprio provider — mai in chiaro nella
  // risposta GET, stesso principio già in uso per le API key AI Advisor).
  app.get('/api/cloud-backup/providers', async (_req, res) => {
    const { getAllCloudBackupProviders } = await import('./src/backend/cloudBackup/registry');
    const providers = getAllCloudBackupProviders();
    const result = await Promise.all(providers.map(async p => {
      const cred = db.getCloudBackupCredential(p.id);
      return {
        providerId:    p.id,
        name:          p.name,
        description:   p.description,
        enabled:       cred?.enabled ?? false,
        hasCredentials: !!(cred?.clientId && cred?.clientSecret),
        authenticated: await p.isAuthenticated(),
        lastBackupAt:  cred?.lastBackupAt ?? null,
        // v3.2.2-dev.2 — la passphrase non esce mai dal server: la UI sa solo se c'e'.
        passphraseSet: hasBackupPassphrase(),
      };
    }));
    res.json(result);
  });

  app.post('/api/cloud-backup/providers/:id', (req, res) => {
    const { enabled, clientId, clientSecret } = req.body;
    // v1.1.121-dev.1 — stesso aggiornamento parziale già collaudato per
    // le API key AI Advisor: un campo omesso preserva il valore già
    // salvato invece di azzerarlo (il client non ha mai il client_secret
    // in chiaro dopo la prima configurazione).
    const existing = db.getCloudBackupCredential(req.params.id);
    db.upsertCloudBackupCredential({
      providerId:    req.params.id,
      enabled:       Boolean(enabled),
      clientId:      clientId     || existing?.clientId,
      clientSecret:  clientSecret || existing?.clientSecret,
      lastBackupAt:  existing?.lastBackupAt,
    });
    res.json({ success: true });
  });

  // v3.2.2-dev.2 (audit punto 5) — passphrase che cifra il bundle di backup. POST la imposta (minimo 8 caratteri),
  // DELETE la rimuove (i backup successivi non saranno cifrati). Mai restituita in nessuna risposta.
  app.post('/api/cloud-backup/passphrase', (req, res) => {
    const passphrase: unknown = req.body?.passphrase;
    const problem = validatePassphrase(passphrase);
    if (problem) return res.status(400).json({ success: false, message: problem });
    try {
      setBackupPassphrase(passphrase as string);
      res.json({ success: true, message: 'Passphrase impostata: i prossimi backup saranno cifrati.' });
    } catch (err) {
      writeLog('error', `[CloudBackup] Passphrase non salvata: ${err}`);
      res.status(500).json({ success: false, message: 'Impossibile salvare la passphrase.' });
    }
  });

  app.delete('/api/cloud-backup/passphrase', (_req, res) => {
    clearBackupPassphrase();
    res.json({ success: true, message: 'Passphrase rimossa: i prossimi backup non saranno cifrati.' });
  });

  app.post('/api/cloud-backup/providers/:id/login', async (req, res) => {
    const { getCloudBackupProvider } = await import('./src/backend/cloudBackup/registry');
    const provider = getCloudBackupProvider(req.params.id);
    if (!provider) return res.status(404).json({ success: false, message: 'Provider sconosciuto.' });
    const result = await provider.login();
    res.json(result);
  });

  app.post('/api/cloud-backup/providers/:id/logout', async (req, res) => {
    const { getCloudBackupProvider } = await import('./src/backend/cloudBackup/registry');
    const provider = getCloudBackupProvider(req.params.id);
    if (!provider) return res.status(404).json({ success: false, message: 'Provider sconosciuto.' });
    const result = await provider.logout();
    res.json(result);
  });

  // POST /api/cloud-backup/backup — costruisce il bundle (compat_profiles,
  // Knowledge Base, app.conf, .env, avatars/) e lo carica tramite il
  // provider attivo (mutua esclusività già garantita a monte, vedi
  // db.upsertCloudBackupCredential — al massimo uno abilitato).
  app.post('/api/cloud-backup/backup', async (_req, res) => {
    const { getAllCloudBackupCredentials } = db;
    const active = getAllCloudBackupCredentials().find(c => c.enabled);
    if (!active) return res.json({ success: false, message: 'Nessun provider di Cloud Backup attivo.' });
    const { getCloudBackupProvider } = await import('./src/backend/cloudBackup/registry');
    const provider = getCloudBackupProvider(active.providerId);
    if (!provider) return res.json({ success: false, message: 'Provider sconosciuto.' });
    try {
      const { buildBackupPayload, BACKUP_FILENAME } = await import('./src/backend/cloudBackup/bundle');
      // v3.2.2-dev.2 — con una passphrase impostata il bundle viene cifrato prima di lasciare la macchina.
      const payload = buildBackupPayload();
      const result = await provider.uploadBackup(payload.data, BACKUP_FILENAME);
      if (result.success) {
        result.message += payload.encrypted
          ? ' (cifrato con la tua passphrase)'
          : ' — ATTENZIONE: non cifrato, imposta una passphrase in Gestisci account';
      }
      res.json(result);
    } catch (err) {
      writeLog('error', `[CloudBackup] Backup fallito: ${err}`);
      res.json({ success: false, message: `Errore inatteso: ${err}` });
    }
  });

  app.post('/api/cloud-backup/restore', async (_req, res) => {
    const active = db.getAllCloudBackupCredentials().find(c => c.enabled);
    if (!active) return res.json({ success: false, message: 'Nessun provider di Cloud Backup attivo.' });
    const { getCloudBackupProvider } = await import('./src/backend/cloudBackup/registry');
    const provider = getCloudBackupProvider(active.providerId);
    if (!provider) return res.json({ success: false, message: 'Provider sconosciuto.' });
    try {
      const downloadResult = await provider.downloadLatestBackup();
      if (!downloadResult.success || !downloadResult.data) {
        return res.json({ success: false, message: downloadResult.message });
      }
      const { restoreFromBundle } = await import('./src/backend/cloudBackup/bundle');
      const result = restoreFromBundle(downloadResult.data);
      res.json(result);
    } catch (err) {
      writeLog('error', `[CloudBackup] Ripristino fallito: ${err}`);
      res.json({ success: false, message: `Errore inatteso: ${err}` });
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
    const storedBase = db.getAiProviderCredential('ollama')?.baseUrl;
    // v3.0.2-dev.5 (audit punto 12) — l'indirizzo di Ollama puo' essere locale o in LAN (e' il suo uso normale),
    // quindi non si bloccano gli indirizzi privati; si accetta pero' solo http/https senza credenziali.
    const baseUrl = (storedBase && parseHttpUrl(storedBase)) ? storedBase : 'http://localhost:11434';
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

  // v1.1.108-dev.1 — GET /api/ai/usage e POST /api/ai/usage/budget
  // rimosse: il budget non è più un unico numero globale ma per-provider
  // (vedi ai_provider_credentials in db.ts), già incluso nella risposta
  // di GET /api/ai/providers sopra (tokenBudget + usageThisMonth per
  // riga) — nessuna chiamata separata più necessaria.

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
  //
  // v2.2.17-dev.2 — BUG REALE segnalato dall'utente: con xdash.service
  // installato (demone persistente, pensato per restare sempre attivo),
  // questo endpoint lo terminava comunque ad ogni "Chiudi la Dashboard" —
  // conveniva quando l'unico modello era "un processo usa-e-getta rilanciato
  // da kiosk-launch.sh ad ogni apertura", ma qui rendeva vano il senso
  // stesso di avere un demone persistente (serviva un `systemctl restart
  // xdash` manuale prima di ogni riapertura). `INVOCATION_ID` è impostata
  // automaticamente da systemd per i processi che avvia — assente se il
  // processo gira come fallback manuale/di sviluppo (kiosk-launch.sh senza
  // xdash attivo, o `--local-server`). Sotto systemd: il processo (e il
  // tray, stesso discorso — deve restare caldo per la prossima apertura)
  // NON vengono terminati, solo la finestra del browser si chiude (lato
  // client, vedi handleExit in App.tsx). Fallback/dev: comportamento
  // invariato, terminazione completa.
  app.post('/api/system/exit', (_req, res) => {
    const managedBySystemd = !!process.env.INVOCATION_ID;

    // v2.2.17-dev.3 — BUG segnalato dall'utente: in dev.2 il pkill del tray
    // era dentro lo stesso ramo "solo se non gestito da systemd", quindi
    // chiudendo la Dashboard con xdash attivo il tray restava aperto — non
    // era quello che voleva. Il tray è un demone indipendente da xdash (lo
    // avvia kiosk-launch.sh, non xdash), quindi la sua terminazione va
    // decisa a parte: sempre, indipendentemente da come viene gestito il
    // processo node.
    try {
      execSync('pkill -f "tray.py"', { stdio: 'ignore' });
      writeLog('system', '[SYSTEM] Python tray daemon terminated.');
    } catch {
      // pkill esce con codice diverso da 0 se non trova nessun processo
      // da terminare — non è un errore, significa solo che il tray non
      // era attivo (es. .venv-tray mai configurato, o già terminato).
    }

    if (managedBySystemd) {
      writeLog('system', '[SYSTEM] Exit request received — xdash.service gestisce il processo, nessuna terminazione (resta pronto per la prossima apertura).');
      res.json({ success: true, message: 'Solo la finestra (e il tray) si chiudono — il servizio resta attivo.' });
      return;
    }

    writeLog('system', '[SYSTEM] Shutdown request received — stopping...');
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
  app.post('/api/system/steam-bigpicture', async (_req, res) => {
    writeLog('system', '[SYSTEM] Switch to Steam Big Picture requested.');
    // v3.2.6-dev.2 — sessione Openbox con gli spazi: Big Picture si apre dentro gamescope, nello
    // spazio 3 (steamSession.ts). Niente notifyBigPictureLaunched(): la Dashboard la ferma il
    // congelamento degli spazi, non il blocco in pagina (che senza un rientro esplicito resterebbe
    // acceso). Fuori da quella sessione tutto come prima, qui sotto.
    const session = await ensureSteamSession();
    if (session.handled) {
      if (!session.success) {
        notificationEngine.emit({ type: 'launch-error', gameId: 'steam-bigpicture-launcher', gameTitle: 'Steam Big Picture', error: session.message });
      }
      res.json({ success: session.success, message: session.message });
      return;
    }
    // v2.0.41-dev.7 — richiesta utente: X-Launcher deve minimizzarsi al
    // lancio di Big Picture, esattamente come per un gioco reale. Riusa
    // il meccanismo già esistente e funzionante (tray.py fa polling su
    // /api/system/game-running e nasconde/ripristina la finestra in base
    // al booleano `running`) invece di introdurre un secondo meccanismo
    // di hide/show — vedi bigPictureActive in gameManager.ts.
    gameManager.notifyBigPictureLaunched();
    res.json({ success: true, message: 'Apertura Steam Big Picture in corso.' });
    const proc = spawn('steam', ['steam://open/bigpicture'], { stdio: 'ignore' });
    proc.on('error', (e) => writeLog('error', `[SYSTEM] Failed to launch Steam Big Picture: ${e.message} — is Steam installed?`));
  });

  // POST /api/system/steam-bigpicture-closed — punto di rientro da Big
  // Picture a X-Launcher (v2.0.41-dev.7/8, richiesta utente). Chi la
  // invoca: kiosk-launch.sh (v2.0.41-dev.8) — X-Launcher è aggiunto come
  // Non-Steam Game in Steam (scripts/setup-steam-shortcut.cjs), il cui
  // `Exe` in shortcuts.vdf punta esattamente a kiosk-launch.sh, verificato
  // leggendo quel file (mai assunto) — cliccare la card "X-Launcher" da
  // dentro Big Picture riesegue kiosk-launch.sh da capo, che ora rileva
  // "daemon+finestra già attivi" come segnale di rientro (non una prima
  // esecuzione) e chiama questo endpoint prima di mostrare la finestra
  // già esistente.
  //
  // v2.0.41-dev.9 — BUG UTENTE: nascondere solo la FINESTRA di Big
  // Picture (`wmctrl :ACTIVE: -b add,hidden`, v2.0.41-dev.8) non basta —
  // Big Picture Mode intercetta l'input del controller a un livello più
  // basso della finestra in primo piano (Steam Input), quindi restava a
  // "combattere" con la Dashboard per gli stessi input anche da nascosta.
  // Ipotesi dell'utente, plausibile e non ancora verificata su hardware
  // reale: serve un'uscita "vera" da Big Picture in due passi — (1) far
  // tornare Steam alla modalità client desktop (`steam://open/main`,
  // protocollo documentato da Valve — NON `steam://exit-bigpicture-mode`,
  // che non risulta un protocollo Steam reale), che dovrebbe rilasciare
  // l'hook Steam Input; (2) SOLO DOPO, nascondere la finestra del client
  // desktop risultante. Se Steam Input continuasse comunque a
  // intercettare l'input anche in modalità client (non solo Big
  // Picture), questo fix da solo non basterebbe — da confermare con un
  // nuovo test, non assunto qui.
  //
  // v2.0.41-dev.10 — BUG UTENTE (dev.9): un'attesa fissa (1200ms) +
  // `:ACTIVE:` non bastava — log conferma che entrambe le chiamate
  // partivano correttamente, ma "Big Picture sembra ridursi alla
  // finestra di Steam, poi torna in primo piano": la transizione
  // Big Picture→client desktop non ha una durata fissa prevedibile (system
  // apparentemente più lento di 1200ms in quel test), quindi la finestra
  // ATTIVA in quel preciso istante non era ancora quella giusta — nascosta
  // una finestra transitoria, poi la vera finestra client è comparsa DOPO
  // senza nulla a nasconderla. Sostituito con un polling per WM_CLASS
  // (non per timing): cerca ripetutamente una finestra la cui classe
  // contenga "steam" (`wmctrl -lx`, WM_CLASS è stabile qualunque sia la
  // durata reale della transizione), fino a un massimo di 10 tentativi
  // ogni 300ms (3s totali) — nasconde quella specifica appena la trova,
  // per id (`wmctrl -i -r <id>`), invece dell'ambigua `:ACTIVE:`.
  app.post('/api/system/steam-bigpicture-closed', (_req, res) => {
    writeLog('system', '[SYSTEM] Return from Steam Big Picture requested.');
    gameManager.notifyBigPictureClosed();
    res.json({ success: true });
    const exitProc = spawn('steam', ['steam://open/main'], { stdio: 'ignore' });
    exitProc.on('error', (e) => writeLog('warning', `[SYSTEM] steam://open/main failed to spawn (non-blocking): ${e.message}`));

    const pollForSteamWindow = (attemptsLeft: number) => {
      if (attemptsLeft <= 0) {
        writeLog('warning', '[SYSTEM] Steam window not found via wmctrl -lx after polling (3s) — giving up (non-blocking).');
        return;
      }
      try {
        const out = execFileSync('wmctrl', ['-lx'], { encoding: 'utf-8' });
        const line = out.split('\n').find(l => {
          const wmClass = l.trim().split(/\s+/)[2] ?? '';
          return /steam/i.test(wmClass);
        });
        if (line) {
          const winId = line.trim().split(/\s+/)[0];
          execFileSync('wmctrl', ['-i', '-r', winId, '-b', 'add,hidden'], { stdio: 'pipe' });
          writeLog('system', `[SYSTEM] Steam window hidden (id=${winId}).`);
          return;
        }
      } catch (err) {
        writeLog('warning', `[SYSTEM] wmctrl -lx poll failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
      }
      setTimeout(() => pollForSteamWindow(attemptsLeft - 1), 300);
    };
    setTimeout(() => pollForSteamWindow(10), 300);
  });

  // Error handler centralizzato — DEVE essere l'ultimo middleware registrato
  // (firma a 4 argomenti, Express lo riconosce solo così). Rete di sicurezza
  // per le route che non hanno un try/catch proprio: dalla 5.x Express
  // inoltra automaticamente le promise rifiutate dei route handler async
  // qui, ma senza questo handler la risposta di default di Express è una
  // pagina HTML — rompe silenziosamente ogni `fetch(...).then(r => r.json())`
  // del frontend con un errore di parsing invece del messaggio vero. Non
  // sostituisce i try/catch già presenti nelle singole route (che
  // rispondono da soli, prima che l'errore arrivi qui) — li integra per i
  // percorsi che ne sono ancora privi, stesso formato di risposta già in
  // uso nella maggior parte delle route esistenti.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    writeLog('error', `[SERVER] Unhandled route error: ${message}`);
    if (res.headersSent) return;
    res.status(500).json({ success: false, message });
  });

  app.listen(PORT, BIND_HOST, () => {
    writeLog('system', `Daemon started on http://${BIND_HOST}:${PORT}`);
    // v3.0.2-dev.4 — cartella dati 0700, DB/.env/token 0600 (anche i file nati dopo l'avvio, es. tokens.json).
    // v3.2.2-dev.2 — cifra a riposo i segreti ancora in chiaro (chiavi API, client secret, token), poi stringe i permessi
    // (secret.key nasce 0600 al primo uso).
    db.migrateSecretsAtRest();
    const tightened = hardenDataPermissions();
    if (tightened.length > 0) writeLog('system', `[SECURITY] Permessi stretti su: ${tightened.join(', ')}`);
    if (AUTH_ENABLED) {
      writeLog('system', `Autenticazione attiva — token in ${path.join(DATA_DIR, TOKEN_FILE_NAME)}`);
    } else {
      writeLog('warning', `[SECURITY] X_LAUNCHER_AUTH=off: le rotte NON richiedono autenticazione.`);
    }
    if (isExposedBind(BIND_HOST)) {
      writeLog('warning', `[SECURITY] Il demone e' raggiungibile dalla rete (${BIND_HOST}). Host accettati: ${Array.from(ALLOWED_HOSTS).join(', ')}.${AUTH_ENABLED ? '' : ' Senza autenticazione chiunque nella rete puo\' avviare programmi come questo utente.'}`);
    }
    writeLog('system', `Log file: ${LOG_PATH_EXPORT}`);
  });
}

startServer();
