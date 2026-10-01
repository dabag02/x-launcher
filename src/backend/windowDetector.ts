/**
 * windowDetector.ts — v2.0.41-dev.33/34
 *
 * Rilevamento finestre reali via `wmctrl -lx` — stesso comando/formato
 * già in uso in server.ts per il riconoscimento della finestra Steam
 * Big Picture (colonne separate da spazi: id, desktop, WM_CLASS,
 * hostname, titolo).
 *
 * Due scopi, UN SOLO meccanismo (v2.0.41-dev.34 — unificati dopo una
 * domanda dell'utente su un buco reale del disegno iniziale: al primo
 * lancio di un gioco, la splash deve sapere che la finestra è comparsa
 * SUBITO, non al prossimo checkpoint fisso di un apprendimento pensato
 * per girare in background con calma): (1) apprendere il WM_CLASS
 * della finestra reale di un gioco al primo lancio riuscito, salvato
 * in games.window_class — "carta d'identità" del gioco, idea
 * dell'utente; (2) la splash di lancio usa lo stesso ciclo per sapere
 * quando sparire — se window_class è già noto (lanci successivi al
 * primo), la ricerca è diretta; se non ancora noto (primo lancio), il
 * momento in cui compare esattamente una finestra nuova candidata
 * SERVE ENTRAMBI gli scopi insieme — salva il valore E segnala
 * "trovata" nello stesso istante, nessun ritardo aggiuntivo.
 */

import { execFileSync } from 'child_process';
import { writeLog } from './logger';
import * as db from './db';
import { getThirdPartyLauncherDefinition } from './plugins/thirdPartyLaunchers';
import { getActiveDisplayEnv } from './activeDisplay';

export interface WindowInfo {
  id: string;
  wmClass: string;
  title: string;
}

export interface WindowDetectionResult {
  found: boolean;
  wmClass?: string;
  windowTitle?: string;
}

export function listWindows(): WindowInfo[] {
  try {
    // v2.2.19-dev.3 — BUG REALE CONFERMATO: senza questo env esplicito,
    // wmctrl eredita il process.env statico del daemon (DISPLAY=:0, la
    // sessione XFCE) anche quando la sessione realmente attiva è la
    // Kiosk gamescope — non vede mai la finestra del gioco, la splash
    // non si chiude mai (fino al timeout di sicurezza di 10 minuti, che
    // a quel punto termina forzatamente anche il gioco). Stesso fix già
    // applicato a runners/implementations.ts, downloadManager.ts e
    // gameManager.ts — qui mancava.
    const out = execFileSync('wmctrl', ['-lx'], { encoding: 'utf-8', env: { ...process.env, ...getActiveDisplayEnv() } });
    return out.split('\n').filter(Boolean).map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        id: parts[0] ?? '',
        wmClass: parts[2] ?? '',
        title: parts.slice(4).join(' '),
      };
    });
  } catch {
    // wmctrl non disponibile o nessuna finestra — elenco vuoto, mai
    // bloccante per chi chiama.
    return [];
  }
}

export function captureWindowSnapshot(): WindowInfo[] {
  return listWindows();
}

/**
 * Un solo tentativo. Se window_class è già noto per il gioco, cerca
 * direttamente una finestra con quella classe esatta (percorso comune,
 * veloce e preciso, nessuna instabilità possibile — una finestra con
 * quella classe o c'è o non c'è). Se non ancora noto, confronta con lo
 * snapshot "prima" per differenza — esclude esplicitamente la finestra
 * nota del launcher condiviso richiesto da questo gioco, se presente
 * (knownWindowTitle in thirdPartyLaunchers.ts, es. EA App → "EA") —
 * risolve con precisione l'ambiguità "sono comparse due finestre nuove
 * insieme", invece di indovinare.
 *
 * v2.0.41-dev.36 — BUG UTENTE, confermato su hardware reale (Bioshock 2,
 * primo lancio in assoluto, nessun window_class ancora noto): la splash
 * spariva molto PRIMA della finestra di gioco vera — alcuni giochi
 * mostrano una propria finestra intermedia (di caricamento, o un
 * avviso) prima di quella reale, e "esattamente una candidata nuova"
 * la prendeva per buona all'istante, salvandola come window_class
 * definitivo. Per LEGO Indiana Jones (window_class già noto da questa
 * stessa sessione) il problema non si presentava affatto — percorso
 * diretto sopra, nessuna ambiguità possibile lì. Fix: una candidata
 * (SOLO nel ramo "non ancora noto") deve comparire IDENTICA (stesso id
 * di finestra) su due controlli consecutivi prima di essere confermata
 * — se nel frattempo sparisce o cambia, era probabilmente una finestra
 * intermedia, non quella vera. `pendingId` viaggia fra i tentativi
 * successivi tramite l'oggetto `state` passato da waitForGameWindow.
 */
/**
 * v2.0.41-dev.39 — difesa in profondità: nessuna finestra riconoscibile
 * come la splash stessa (nome/classe generato da Chromium per la
 * nostra rotta /splash — verificato con dato reale sul sistema
 * dell'utente: "localhost__splash.Chromium") può MAI essere confermata
 * come finestra del gioco, indipendentemente dal tempismo dello
 * snapshot "prima". La causa vera è stata corretta a monte
 * (splashWindow.ts, attesa reale prima di restituire l'handle), questo
 * resta comunque come rete di sicurezza — un fix a un singolo punto,
 * mai due chance di sbagliare sullo stesso identico bug.
 */
function isSplashWindow(w: WindowInfo): boolean {
  return /splash/i.test(w.wmClass) || /splash/i.test(w.title);
}

/**
 * v2.0.41-dev.46 — BUG UTENTE, confermato su hardware reale (LEGO
 * Indiana Jones): window_class appreso come "xfce4-panel.Xfce4-panel"
 * — il pannello XFCE, non il gioco. Probabile causa: il pannello ha
 * ottenuto un nuovo id finestra proprio nella finestra di tempo fra lo
 * snapshot "prima" e il primo controllo (es. un cambio di
 * autohide/risoluzione residuo, plausibile su un sistema con tanti test
 * Gamescope pregressi su questo stesso gioco) — vista come "nuova",
 * unica candidata al momento, presa per buona. Stessa filosofia già
 * applicata a isSplashWindow sopra: nessun componente noto del desktop
 * può MAI essere confermato come finestra del gioco, indipendentemente
 * dal perché sia sembrato "nuovo" in quel momento.
 */
function isSystemWindow(w: WindowInfo): boolean {
  return /^xfce4-|^xfdesktop|^xfwm4/i.test(w.wmClass);
}

/**
 * v2.0.41-dev.42 — richiesta utente, osservazione diretta confermata su
 * hardware reale: "steam_app_0.steam_app_0" è il WM_CLASS che
 * QUALUNQUE gioco lanciato con Umu-launcher attivo riceve (verificato:
 * Dead Space 2 e Watch Dogs 2, due giochi/store completamente diversi,
 * stesso identico valore) — e allo stesso modo "steam_proton.steam_proton"
 * per qualunque gioco lanciato con Proton puro (senza Umu-launcher).
 * Solo i lanci Wine diretti hanno un WM_CLASS che rispecchia davvero
 * l'eseguibile del gioco (es. "bioshock2.exe.bioshock2.exe"). Per
 * questi due valori generici, la sola corrispondenza di classe non
 * distingue affatto un gioco da un altro — serve anche il titolo.
 */
const GENERIC_WM_CLASSES = new Set(['steam_app_0.steam_app_0', 'steam_proton.steam_proton']);

// Stessa identica normalizzazione già in uso in sharedLauncherManager.ts
// per il matching cross-store dei titoli — replicata qui (una riga, non
// vale la pena un import cross-modulo per questo).
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * v2.0.41-dev.45 — BUG UTENTE, confermato su hardware reale (LEGO
 * Indiana Jones): il controllo era a senso unico — verificava solo "il
 * titolo della finestra contiene il titolo del gioco". Qui il titolo
 * salvato nel DB è "LEGO Indiana Jones: The Original Adventures" (con
 * sottotitolo), ma la finestra reale mostra solo "LEGO® Indiana Jones™"
 * (senza sottotitolo, più corto) — il verso opposto, mai controllato.
 * Ora bidirezionale: accetta la corrispondenza in ENTRAMBE le
 * direzioni, con una soglia minima (6 caratteri) sulla stringa più
 * corta prima di accettarla come sottostringa dell'altra — altrimenti
 * un titolo finestra troppo generico (es. "Menu") rischierebbe di
 * combaciare per caso con qualunque titolo di gioco abbastanza lungo da
 * contenere quella parola.
 */
function titleLooksLikeGame(windowTitle: string, gameTitle: string): boolean {
  if (!windowTitle || !gameTitle) return false;
  const normWindow = normalizeForMatch(windowTitle);
  const normGame = normalizeForMatch(gameTitle);
  const MIN_LEN = 6;
  if (normWindow.length >= MIN_LEN && normGame.includes(normWindow)) return true;
  if (normGame.length >= MIN_LEN && normWindow.includes(normGame)) return true;
  return false;
}

function attemptDetection(gameId: string, before: WindowInfo[], requiresLauncherId: string | undefined, state: { pendingId: string | null }): WindowDetectionResult {
  const known = db.getWindowClass(gameId);
  if (known) {
    // v2.0.41-dev.37 — BUG UTENTE, confermato su hardware reale (LEGO
    // Indiana Jones, window_class già noto da tutta la saga Gamescope
    // di questa sessione): questo ramo non confrontava affatto con lo
    // snapshot "prima" — cercava una finestra con quella classe OVUNQUE
    // nel sistema, in qualunque momento. Se una finestra con quella
    // stessa classe esisteva già (residuo di una sessione precedente,
    // plausibile dopo tutti i test ripetuti di Gamescope), veniva
    // trovata vera al primissimo controllo — ancora prima che il gioco
    // avesse davvero aperto la propria finestra nuova, da cui la
    // chiusura prematura osservata. Richiede ora, come il ramo "non
    // ancora noto" sotto, che la finestra sia NUOVA rispetto allo
    // snapshot "prima" — non basta più che esista, deve essere comparsa
    // durante QUESTO lancio.
    const beforeIds = new Set(before.map(w => w.id));
    let match = listWindows().find(w => w.wmClass === known && !beforeIds.has(w.id));
    // v2.0.41-dev.42 — se la classe salvata è una di quelle generiche
    // (condivisa da QUALUNQUE gioco lanciato allo stesso modo, vedi
    // commento esteso sopra GENERIC_WM_CLASSES), la sola corrispondenza
    // di classe non basta a garantire che sia DAVVERO questo gioco —
    // richiede anche che il titolo della finestra contenga il titolo
    // del gioco (normalizzato, tollerante a spazi/maiuscole/underscore:
    // "Watch Dogs 2"/"WatchDogs2"/"watch_dogs_2" combaciano tutti).
    if (match && GENERIC_WM_CLASSES.has(known)) {
      const gameTitle = db.getGameById(gameId)?.title ?? '';
      if (!titleLooksLikeGame(match.title, gameTitle)) {
        match = undefined; // stessa classe generica, ma non è questo gioco
      }
    }
    if (match) {
      writeLog('system', `[WINDOW] "${gameId}": corrispondenza diretta trovata — "${known}" (finestra: "${match.title}").`);
    }
    return match ? { found: true, wmClass: known, windowTitle: match.title } : { found: false };
  }

  const after = listWindows();
  const beforeIds = new Set(before.map(w => w.id));
  let candidates = after.filter(w => !beforeIds.has(w.id) && !isSplashWindow(w) && !isSystemWindow(w));

  if (requiresLauncherId) {
    const def = getThirdPartyLauncherDefinition(requiresLauncherId);
    if (def?.knownWindowTitle) {
      candidates = candidates.filter(w => w.title !== def.knownWindowTitle);
    }
  }

  // v2.0.41-dev.42 — se sono comparse PIÙ candidate insieme (es. il
  // gioco e una finestra di autenticazione di un launcher condiviso non
  // ancora riconosciuta come tale), prova a restringere a quella il cui
  // titolo somiglia al nome del gioco prima di arrenderti — stesso
  // principio del ramo "già noto" sopra, qui applicato per disambiguare
  // invece che per confermare.
  if (candidates.length > 1) {
    const gameTitle = db.getGameById(gameId)?.title ?? '';
    const titleMatches = candidates.filter(w => titleLooksLikeGame(w.title, gameTitle));
    if (titleMatches.length === 1) {
      candidates = titleMatches;
    }
  }

  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (state.pendingId === candidate.id) {
      // Stessa finestra vista anche al controllo precedente — stabile,
      // confermiamo e impariamo il valore.
      db.updateWindowClass(gameId, candidate.wmClass);
      writeLog('system', `[WINDOW] "${gameId}": window_class appreso — "${candidate.wmClass}" (finestra: "${candidate.title}").`);
      return { found: true, wmClass: candidate.wmClass, windowTitle: candidate.title };
    }
    // Prima volta che vediamo questa candidata — non ancora confermata,
    // potrebbe essere una finestra intermedia (vedi commento esteso
    // sopra). Un giro in più prima di fidarcene.
    state.pendingId = candidate.id;
    return { found: false };
  }
  if (candidates.length > 1) {
    writeLog('system', `[WINDOW] "${gameId}": ${candidates.length} finestre nuove candidate insieme, ambiguo — non salvato questo giro.`);
  }
  state.pendingId = null; // nessuna candidata stabile questo giro — azzera l'attesa
  return { found: false }; // nessuna finestra nuova ancora, silenzioso — il ciclo continua
}

/**
 * v2.0.41-dev.34 — ciclo di controllo CONTINUO (ogni pollIntervalMs),
 * non più a checkpoint fissi — vedi commento esteso in testa al file
 * per il perché. Risolve appena trovata, o dopo timeoutMs (pensato per
 * essere lo stesso LAUNCH_WINDOW_TIMEOUT_MS della splash, ma
 * parametrico — l'apprendimento in background di gameManager.ts,
 * senza una splash ad ascoltare, può usare una durata diversa).
 */
export function waitForGameWindow(
  gameId: string,
  before: WindowInfo[],
  requiresLauncherId: string | undefined,
  timeoutMs: number,
  pollIntervalMs = 2000,
): Promise<WindowDetectionResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const state = { pendingId: null as string | null };
    const tick = () => {
      const result = attemptDetection(gameId, before, requiresLauncherId, state);
      if (result.found) { resolve(result); return; }
      if (Date.now() - start >= timeoutMs) { resolve({ found: false }); return; }
      setTimeout(tick, pollIntervalMs);
    };
    tick();
  });
}

