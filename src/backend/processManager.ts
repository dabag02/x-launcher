/**
 * processManager.ts — v2.0.41-dev.48
 *
 * Base del "Monitor Processi" già annotato in roadmap (mai iniziato finora).
 * Decisione architetturale presa e verificata su hardware reale in una
 * sessione precedente: `systemd-run --user --scope` — funziona identico che
 * il daemon parta a mano o da `xdash.service`, perché dipende solo dalla
 * sessione utente systemd, sempre presente a un login grafico.
 *
 * Perché serve: `lastLaunchedGame`/pid singolo e il matching per nome
 * processo (`pgrep -f <basename>`, usato oggi sia per i giochi che per
 * `isSharedLauncherRunning`) hanno due limiti strutturali:
 *   1. Un solo lancio tracciabile alla volta — nessun multi-processo reale.
 *   2. Wine/Proton generano ALBERI di processi (proton → wine64 → gioco.exe,
 *      a volte con pressure-vessel/bwrap in mezzo). Il pid del comando
 *      lanciato da noi può non essere quello del processo che conta, e un
 *      kill su quel solo pid lascia orfani gli altri.
 *
 * Un cgroup scope risolve entrambi: raggruppa l'INTERO albero sotto un nome
 * univoco, interrogabile (`is-active`) e terminabile in blocco
 * (`kill --kill-who=all`) indipendentemente da quanti processi figli genera
 * la catena di lancio.
 *
 * IMPORTANTE — comportamento di `systemd-run --scope` non assunto per
 * fede: per quanto risulta dalla documentazione, il PID che
 * child_process.spawn('systemd-run', ...) restituisce è quello del
 * *supervisore* systemd-run stesso, non quello del binario reale lanciato
 * dentro lo scope (systemd-run fa da genitore in attesa, il vero comando
 * gira come figlio con esecvp all'interno dello scope). Per questo il pid
 * "reale" non viene mai assunto dal valore di ritorno di spawn: si legge
 * SEMPRE da `cgroup.procs` dopo la creazione, con retry — vedi
 * `resolveRealPid`. Se anche questa lettura fallisse in modo sistematico su
 * hardware reale, sarà il primo segnale che l'assunzione sopra è sbagliata
 * per la versione di systemd installata: va diagnosticata con l'output
 * grezzo (loggato al primo utilizzo, vedi `ensureCapability`), non
 * ricorretta alla cieca.
 */

import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { writeLog } from './logger';

export type ScopeKind = 'game' | 'shared-launcher';

export interface ScopeInfo {
  unit: string;          // nome completo dell'unit, es. xlauncher-game-foo123-1755000000000
  kind: ScopeKind;
  id: string;             // gameId o launcherId — mai il titolo (può contenere caratteri non sicuri per systemd)
  title: string;
  startedAt: number;
  supervisorPid: number;  // pid restituito da spawn('systemd-run', ...) — vedi nota sopra, NON il processo reale
  realPid?: number;       // risolto in modo best-effort da cgroup.procs, può restare assente
}

const registry = new Map<string, ScopeInfo>();

// Cache della capacità del sistema di supportare questo meccanismo,
// verificata una sola volta per sessione del daemon (non a ogni lancio —
// vedi commento in cima al file sul principio "diagnosticare prima di
// ritentare", non ha senso ritentare lo stesso comando rotto a ogni gioco).
let capable: boolean | null = null;

export function ensureCapability(): boolean {
  if (capable !== null) return capable;
  try {
    const version = execFileSync('systemd-run', ['--version'], { stdio: 'pipe', encoding: 'utf-8' });
    execFileSync('systemctl', ['--user', 'is-active', '--quiet', 'default.target'], { stdio: 'pipe' });
    writeLog('system', `[PROCESS-MANAGER] systemd-run disponibile (${version.split('\n')[0].trim()}), sessione utente systemd attiva — scope cgroup abilitati.`);
    capable = true;
  } catch (err) {
    // Nessun panico: qualunque lancio prosegue comunque, solo senza
    // tracciamento cgroup (fallback al comportamento precedente in
    // implementations.ts). Loggato una sola volta, non ad ogni lancio.
    writeLog('warning', `[PROCESS-MANAGER] systemd-run/sessione utente non disponibili — scope cgroup disabilitati per questa sessione del daemon, fallback al lancio diretto. Dettaglio: ${err}`);
    capable = false;
  }
  return capable;
}

/** Sanitizza id/kind per un nome unit systemd sicuro (solo [A-Za-z0-9_.-]). */
function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_.-]/g, '-');
}

export function makeUnitName(kind: ScopeKind, id: string): string {
  return `xlauncher-${kind}-${sanitize(id)}-${Date.now()}`;
}

/**
 * Costruisce gli argomenti da anteporre al comando reale per lanciarlo
 * dentro uno scope systemd-run. `--collect` scarica automaticamente
 * l'unit da systemd non appena termina — senza, `systemctl --user
 * list-units` accumulerebbe uno scope "morto" per ogni lancio, per
 * sempre, finché il daemon (o l'utente) non li ripulisce a mano.
 */
export function wrapArgsForScope(unit: string, bin: string, args: string[]): { bin: string; args: string[] } {
  return {
    bin: 'systemd-run',
    args: ['--user', '--scope', '--collect', `--unit=${unit}`, '--', bin, ...args],
  };
}

export function register(info: Omit<ScopeInfo, 'startedAt'>): void {
  registry.set(info.unit, { ...info, startedAt: Date.now() });
}

export function unregister(unit: string): void {
  registry.delete(unit);
}

/**
 * `systemctl --user is-active <unit>.scope` — restituisce true solo se
 * "active". execFileSync lancia su qualunque stato diverso (inactive,
 * failed, unità mai esistita): stesso trattamento per tutti questi casi,
 * per il nostro scopo "non sta girando" è l'unica distinzione che conta.
 */
export function isScopeActive(unit: string): boolean {
  try {
    const out = execFileSync('systemctl', ['--user', 'is-active', `${unit}.scope`], { stdio: 'pipe', encoding: 'utf-8' });
    return out.trim() === 'active';
  } catch {
    return false;
  }
}

/**
 * Legge i pid reali dal cgroup dello scope. Percorso cgroup v2 (unificato,
 * default su Arch Linux e sulle distro recenti in generale) — se il
 * sistema fosse su cgroup v1 questa lettura fallirebbe e tornerebbe []:
 * mai verificato di persona su questa macchina, quindi non assunto oltre
 * il try/catch. Se capita in pratica, log dell'output grezzo di
 * `ControlGroup` qui sotto è il primo posto da guardare.
 */
export function getScopePids(unit: string): number[] {
  try {
    const cgroupPath = execFileSync(
      'systemctl', ['--user', 'show', `${unit}.scope`, '-p', 'ControlGroup', '--value'],
      { stdio: 'pipe', encoding: 'utf-8' }
    ).trim();
    if (!cgroupPath) return [];
    const procsFile = `/sys/fs/cgroup${cgroupPath}/cgroup.procs`;
    if (!existsSync(procsFile)) {
      writeLog('warning', `[PROCESS-MANAGER] cgroup.procs non trovato per ${unit}: ${procsFile} (ControlGroup grezzo: "${cgroupPath}") — possibile sistema cgroup v1, mai verificato su questa macchina.`);
      return [];
    }
    return readFileSync(procsFile, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(Number)
      .filter(n => Number.isFinite(n));
  } catch (err) {
    writeLog('warning', `[PROCESS-MANAGER] Lettura pid reali fallita per ${unit}: ${err}`);
    return [];
  }
}

/**
 * Risolve il pid reale in background, con retry — la registrazione nel
 * cgroup dopo la creazione dello scope non è garantita istantanea.
 * Best-effort: se non si risolve entro il timeout, l'entry di registry
 * resta senza `realPid` (si userà comunque `supervisorPid` o il fallback
 * pgrep esistente altrove) — mai bloccante per il lancio del gioco, che è
 * già partito indipendentemente da questa risoluzione.
 */
export function resolveRealPidAsync(unit: string, maxAttempts = 8, delayMs = 250): void {
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
      writeLog('warning', `[PROCESS-MANAGER] Pid reale mai risolto per ${unit} dopo ${maxAttempts} tentativi — resta tracciato solo con il pid del supervisore systemd-run.`);
    }
  };
  setTimeout(tick, delayMs);
}

/**
 * v2.0.41-dev.50 — Process Manager, step 3: sostituisce il pgrep per nome
 * processo nella rilevazione "il gioco è ancora in esecuzione" per i lanci
 * avvolti in uno scope. BUG REALE CONFERMATO SU HARDWARE (Watch Dogs 2 +
 * Ubisoft Connect): `pgrep -f WatchDogs2.exe` trovava ancora il wrapper
 * `umu-run /percorso/.../WatchDogs2.exe` — vivo per tutta la sessione del
 * launcher condiviso — molto DOPO che il vero processo del gioco (dentro
 * wine) era già terminato. Un pgrep di sistema non può distinguere "il
 * nome compare nella riga di comando di QUALCUE processo" da "il gioco è
 * ancora vivo": non ha nessuna nozione di ALBERO.
 *
 * Qui invece leggiamo SOLO i pid realmente dentro lo scope DI QUESTO
 * lancio (`getScopePids`, già verificato su hardware reale allo step 1) e
 * controlliamo il nome breve (`/proc/<pid>/comm`) di ciascuno — non la
 * riga di comando intera, che è esattamente ciò che ha tratto in inganno
 * il pgrep. `comm` è troncato dal kernel a 15 caratteri: confrontiamo
 * quindi entrambi i lati troncati alla stessa lunghezza, mai un match
 * esatto sulla stringa intera — altrimenti un exe con basename più lungo
 * di 15 caratteri risulterebbe sempre "non trovato", stesso genere di bug
 * già visto altrove nel progetto con nomi processo troncati da wine.
 */
export function isRealProcessAliveInScope(unit: string, expectedExeBasename: string): boolean {
  const pids = getScopePids(unit);
  if (pids.length === 0) return false;
  const expected = expectedExeBasename.slice(0, 15);
  for (const pid of pids) {
    try {
      const comm = readFileSync(`/proc/${pid}/comm`, 'utf-8').trim();
      if (comm.slice(0, 15) === expected) return true;
    } catch {
      // Il processo può essere già uscito fra la lettura di cgroup.procs
      // e questa lettura (race normale, non un errore) — si prova col
      // prossimo pid, non si interrompe il controllo.
    }
  }
  return false;
}

export function killScope(unit: string): { success: boolean; message: string } {
  try {
    execFileSync('systemctl', ['--user', 'kill', '--kill-who=all', '--signal=SIGKILL', `${unit}.scope`], { stdio: 'pipe' });
    unregister(unit);
    writeLog('launch', `[PROCESS-MANAGER] Scope terminato su richiesta: ${unit}`);
    return { success: true, message: 'Processo terminato.' };
  } catch (err) {
    return { success: false, message: `Terminazione fallita: ${err}` };
  }
}

/**
 * Elenco per la UI (Process Manager, prossimo step): purga in lettura le
 * entry non più attive invece di affidarsi a un poller separato — il
 * pannello si apre di rado rispetto alla durata di una sessione di gioco,
 * un controllo pigro qui è sufficiente e più semplice di un ciclo dedicato.
 */
/**
 * Cerca uno scope attivo per (kind, id) senza conoscerne il nome esatto —
 * il nome unit include un timestamp che cambia a ogni lancio (vedi
 * makeUnitName), quindi non è mai riproducibile dall'esterno. Usato da
 * isSharedLauncherRunning() al posto del pgrep precedente: kind e id
 * dello scope contano, non il timestamp con cui è stato creato.
 */
export function findActiveScope(kind: ScopeKind, id: string): ScopeInfo | undefined {
  for (const [unit, info] of registry) {
    if (info.kind !== kind || info.id !== id) continue;
    if (isScopeActive(unit)) return info;
    registry.delete(unit); // purga in lettura, stesso principio di listActive()
  }
  return undefined;
}

/**
 * Lookup singolo per unit — usato dall'endpoint di kill del Process
 * Manager per decidere COME terminare: `closeSharedLauncher()` (wineserver
 * -k, già testato) per un launcher condiviso lanciato standalone dalla
 * propria card, `killScope()` generico per tutto il resto (un gioco,
 * launcher condiviso incluso se bootstrappato implicitamente dentro la
 * sua catena — uccidere lo scope del gioco uccide comunque l'intero
 * albero, stesso principio già verificato in dev.50).
 */
export function getScopeInfo(unit: string): ScopeInfo | undefined {
  return registry.get(unit);
}

export function listActive(): ScopeInfo[] {
  const alive: ScopeInfo[] = [];
  for (const [unit, info] of registry) {
    if (isScopeActive(unit)) {
      alive.push(info);
    } else {
      registry.delete(unit);
    }
  }
  return alive;
}

/**
 * Da chiamare una volta all'avvio del daemon: se un riavvio è avvenuto
 * mentre uno scope era ancora attivo (crash del daemon, aggiornamento),
 * la registry in memoria riparte vuota ma lo scope stesso sopravvive
 * (è gestito da systemd, non dal nostro processo Node). Ricostruisce
 * quel che può dal nome dell'unit — titolo perso (non codificato nel
 * nome), il chiamante può arricchirlo con un lookup su db.getGameById
 * usando `id`, questo modulo non conosce il database per evitare un
 * giro di dipendenze circolare con gameManager.
 */
export function reconcileOnStartup(): void {
  if (!ensureCapability()) return;
  try {
    const out = execFileSync(
      'systemctl', ['--user', 'list-units', '--type=scope', '--all', '--no-legend', '--plain', 'xlauncher-*'],
      { stdio: 'pipe', encoding: 'utf-8' }
    );
    const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const unitMatch = line.match(/^(xlauncher-(game|shared-launcher)-(.+?)-(\d+))\.scope\s+(\S+)/);
      if (!unitMatch) continue;
      const [, unit, kind, id, , activeState] = unitMatch;
      if (activeState !== 'active') continue;
      if (registry.has(unit)) continue;
      register({ unit, kind: kind as ScopeKind, id, title: id, supervisorPid: 0 });
      writeLog('system', `[PROCESS-MANAGER] Scope superstite ricollegato dopo riavvio del daemon: ${unit}`);
    }
  } catch (err) {
    writeLog('warning', `[PROCESS-MANAGER] Ricognizione scope all'avvio fallita (non bloccante): ${err}`);
  }
}
