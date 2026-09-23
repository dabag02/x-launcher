/**
 * windowFocus.ts — v2.1.10-dev.10
 *
 * Supporto alle combo controller del "muting" input in-game (vedi
 * App.tsx, gate isFocusFrozen):
 *   - Select+L1+R1  → risveglia la Dashboard (wakeDashboard)
 *   - Select+◄/►    → torna alla finestra del gioco tracciato (focusGameWindow)
 *
 * STORIA (per non ripetere gli stessi errori in futuro):
 *
 * dev.2 — prima versione: memorizzava un'UNICA "finestra esterna"
 * nell'istante del risveglio, assumendo un ping-pong stretto
 * Dashboard↔gioco. Con altre finestre aperte poteva puntare alla
 * finestra sbagliata o restare stale.
 *
 * dev.7 — sostituito con un ciclo Alt+Tab-like fra tutte le finestre
 * reali (interrogate ad ogni pressione, mai una memoria). Sembrava
 * corretto sulla carta, ma si è rivelato inaffidabile su hardware reale
 * per DUE motivi distinti, entrambi confermati da log forniti
 * dall'utente (mai da sole ipotesi):
 *   1) (dev.9) `xprop` e `wmctrl -l` possono riportare lo stesso ID
 *      finestra con padding degli zeri diverso ("0x6000004" vs
 *      "0x06000004") — un confronto per stringa falliva quindi SEMPRE,
 *      corretto con un confronto numerico.
 *   2) (dev.10, QUESTO fix) anche dopo il fix numerico, il ciclo restava
 *      inaffidabile per un motivo più profondo: quando l'utente preme la
 *      combo stando sulla Dashboard (il caso normale, subito dopo un
 *      risveglio), la Dashboard stessa è la finestra attiva, ma è
 *      deliberatamente esclusa dall'elenco su cui si cicla — l'indice di
 *      partenza è quindi SEMPRE -1, e il ripiego ("primo elemento della
 *      lista") ricade sempre sullo stesso risultato arbitrario. Nei due
 *      log reali forniti dall'utente: sempre il desktop ("Scrivania"),
 *      mai il gioco. Un vero Alt+Tab generico richiederebbe un ordine
 *      MRU che X11 non fornisce gratuitamente.
 *
 * dev.10 — su proposta dell'utente: invece di un ciclo generico fra
 * TUTTE le finestre (fragile, confuso da desktop/pannelli/altre app),
 * si punta DIRETTAMENTE alla finestra del gioco tracciato, correlata
 * per PID/cgroup (non per titolo — troppo vario fra i giochi) tramite
 * lo stesso meccanismo già maturato per isRealProcessAliveInScope.
 *
 * Stesso identico WINDOW_TITLE e stessa famiglia di comandi wmctrl già
 * usati e verificati in kiosk-launch.sh/tray.py. `wmctrl -lp` (con PID)
 * è invece introdotto qui per la prima volta in questo progetto — se il
 * formato differisse da quanto documentato, le righe con un PID non
 * numerico vengono scartate invece di propagare un errore.
 */
import { execFileSync } from 'child_process';
import { writeLog } from './logger';
import { gameManager } from './gameManager';
import * as processManager from './processManager';

const WINDOW_TITLE = 'X-Launcher HTPC';

// Emesso una sola volta per evitare di spammare il log a ogni chiamata
// se wmctrl/xprop non sono installati — il primo fallimento è già
// sufficiente a capire che manca il pacchetto.
let missingToolWarned = false;

function run(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { encoding: 'utf-8', timeout: 3000 });
  } catch (err) {
    if (!missingToolWarned) {
      missingToolWarned = true;
      const message = err instanceof Error ? err.message : String(err);
      const warning = `[WindowFocus] comando "${cmd}" non disponibile o fallito (${message}) — le combo Select+L1+R1/Select+◄► non potranno cambiare il focus della finestra. Verificare che wmctrl e xprop siano installati.`;
      writeLog('warning', warning);
      // Anche in addLog (non solo nel file daemon.log): così il warning
      // è visibile subito nella Debug Console (Ctrl+H) senza dover
      // andare a cercare il file su disco — importante su un HTPC dove
      // aprire un terminale è scomodo.
      gameManager.addLog(warning, 'warning');
    }
    return null;
  }
}

/** ID esadecimale (0x...) della finestra con focus X11 corrente, o null
 *  se xprop manca/non risponde o l'output non ha il formato atteso. */
export function getActiveWindowId(): string | null {
  const out = run('xprop', ['-root', '_NET_ACTIVE_WINDOW']);
  if (!out) return null;
  // Formato atteso: "_NET_ACTIVE_WINDOW(WINDOW): window id # 0x2600007"
  const match = out.match(/#\s*(0x[0-9a-fA-F]+)/);
  if (!match) {
    writeLog('warning', `[WindowFocus] output xprop inatteso, impossibile ricavare la finestra attiva: "${out.trim()}"`);
    return null;
  }
  return match[1];
}

/**
 * Elenco GREZZO di tutte le finestre riportate da `wmctrl -l`, con
 * titolo ma SENZA pid (usato solo da wakeDashboard per riconoscere la
 * Dashboard per titolo). Formato riga: "<id> <desktop> <host>
 * <titolo...>" — il titolo può contenere spazi, quindi si ricompone da
 * parts[3] in poi invece di prendere solo parts[3].
 */
function parseWmctrlList(): Array<{ id: string; title: string }> {
  const out = run('wmctrl', ['-l']);
  if (!out) return [];
  return out.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => {
      const parts = l.split(/\s+/);
      return { id: parts[0], title: parts.slice(3).join(' ') };
    });
}

/**
 * Elenco GREZZO di tutte le finestre riportate da `wmctrl -lp` (con
 * PID) — usato da focusGameWindow per correlare una finestra al
 * processo reale del gioco. Formato riga: "<id> <desktop> <pid> <host>
 * <titolo...>" — una colonna in più rispetto a `wmctrl -l`. Righe con
 * un PID non numerico vengono scartate (formato inatteso).
 */
function parseWmctrlListWithPids(): Array<{ id: string; pid: number; title: string }> {
  const out = run('wmctrl', ['-lp']);
  if (!out) return [];
  return out.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => {
      const parts = l.split(/\s+/);
      return { id: parts[0], pid: Number(parts[2]), title: parts.slice(4).join(' ') };
    })
    .filter(w => Number.isFinite(w.pid));
}

/**
 * Select+L1+R1 — porta la Dashboard in primo piano.
 */
export function wakeDashboard(): boolean {
  const dashboardEntry = parseWmctrlList().find(w => w.title.includes(WINDOW_TITLE));
  gameManager.addLog(
    `[WindowFocus] wakeDashboard: finestra Dashboard trovata = ${dashboardEntry ? `${dashboardEntry.id} "${dashboardEntry.title}"` : 'NESSUNA'}`,
    'debug',
  );
  return run('wmctrl', ['-a', WINDOW_TITLE]) !== null;
}

/**
 * Select+◄/► — porta in primo piano SPECIFICAMENTE la finestra del
 * gioco tracciato (vedi la STORIA in cima al file per il perché non è
 * più un ciclo generico fra tutte le finestre).
 *
 * Correlazione finestra↔gioco tramite PID, non tramite il titolo: i
 * titoli delle finestre di gioco sono troppo vari per un matching
 * affidabile (titoli localizzati, con emoji/caratteri invisibili come
 * osservato nei log reali, o generici/vuoti comuni con Wine/Proton). Il
 * PID direttamente tracciato da gameManager è spesso quello del
 * wrapper Proton/umu-run, non del processo che possiede davvero la
 * finestra — per questo si usa lo scope cgroup
 * (processManager.getScopePids), lo stesso meccanismo già maturato per
 * isRealProcessAliveInScope: qualunque processo discendente nello
 * stesso lancio (Proton, Wine, il game.exe finale) condivide lo stesso
 * cgroup, quindi la finestra di QUALUNQUE di questi processi viene
 * riconosciuta. Per i lanci senza scope (Steam via URI, mai avvolto in
 * systemd-run) si ricade sul solo PID diretto tracciato — meno
 * affidabile (potrebbe essere il PID del client Steam stesso, non del
 * gioco), ma comunque un tentativo migliore di niente.
 */
export function focusGameWindow(): boolean {
  const gameInfo = gameManager.getLastLaunchedGameProcessInfo();
  if (!gameInfo) {
    gameManager.addLog('[WindowFocus] focusGameWindow: nessun gioco tracciato (lastLaunchedGame assente).', 'debug');
    return false;
  }

  const candidatePids = gameInfo.unit
    ? processManager.getScopePids(gameInfo.unit)
    : [gameInfo.pid];

  const windows = parseWmctrlListWithPids();
  const match = windows.find(w => candidatePids.includes(w.pid));

  const activeBefore = getActiveWindowId();
  const success = match ? run('wmctrl', ['-i', '-a', match.id]) !== null : false;

  gameManager.addLog(
    `[WindowFocus] focusGameWindow: unit=${gameInfo.unit ?? 'assente (Steam URI?)'} pid=${gameInfo.pid} candidatePids=${JSON.stringify(candidatePids)} → bersaglio=${match ? `${match.id} "${match.title}" (pid ${match.pid})` : 'NESSUNA FINESTRA CORRISPONDENTE'} — attiva prima=${activeBefore ?? 'null'} — wmctrl -i -a esito=${success}. Elenco finestre con pid: ${JSON.stringify(windows)}`,
    'debug',
  );
  return success;
}
