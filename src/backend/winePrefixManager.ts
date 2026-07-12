/**
 * winePrefixManager.ts — v0.99.35, Step 1
 *
 * Modulo condiviso per la preparazione di una WINEPREFIX, estratto da
 * runGOG/runEpic in downloadManager.ts per eliminare la duplicazione
 * (la stessa sequenza era copiata identica in entrambi i flussi,
 * rischio concreto già realizzato più volte: un fix applicato a uno
 * store e dimenticato nell'altro).
 *
 * Principio adottato dal confronto diretto col codice sorgente di
 * Heroic Games Launcher (src/backend/launcher.ts, prepareWineLaunch):
 * la sequenza "wineboot --init && wineserver --wait" viene eseguita
 * UNA VOLTA, PRIMA di qualsiasi altro step (winetricks, DXVK, ecc.) —
 * non in mezzo al flusso come faceva il nostro codice precedente.
 * wineserver --wait blocca finché tutti i processi wine nella prefix
 * non terminano davvero, garantendo che il registro/le DLL di sistema
 * siano effettivamente pronti prima di procedere — coerente con un
 * commento esplicito nel codice Heroic: "If the registry isn't
 * available yet, things like DXVK installers might fail."
 *
 * Design: questo modulo non esegue mai comandi esterni direttamente —
 * riceve come parametro la funzione spawnWithTimeout già esistente in
 * DownloadManager (dependency injection), così resta disaccoppiato
 * dalla classe e non duplica la logica di logging/timeout già
 * presente. Platform/store-agnostico: non ha alcuna conoscenza di
 * GOG/Epic, solo di "una prefix da preparare".
 */

import { DownloadTask } from '../types';

export interface SpawnFn {
  (task: DownloadTask, bin: string, args: string[], env: Record<string, string>, timeoutMs: number): Promise<void>;
}

export interface PrepareWinePrefixOptions {
  prefixPath:        string;
  disableWineSync?:  boolean;
  wineBootTimeoutMs: number;
  /**
   * v0.99.38 — binario wine/wineserver da usare per l'inizializzazione,
   * invece del `wine`/`wineserver` di sistema hardcoded finora. Risolto
   * dal chiamante in base al runner effettivamente selezionato per
   * quell'installazione (vedi resolveRunnerWineEnv in downloadManager.ts)
   * — prima di questo fix la prefix veniva SEMPRE creata con wine di
   * sistema indipendentemente dal runner scelto nell'overlay, causando
   * confusione in caso di malfunzionamento ("non funziona con Proton-GE"
   * quando in realtà la prefix non era mai stata quella).
   * Default 'wine'/'wineserver' (comportamento invariato) se non forniti.
   */
  wineBin?:      string;
  wineserverBin?: string;
}

export interface PrepareWinePrefixResult {
  success: boolean;
  error?:  string;
}

/**
 * Prepara una WINEPREFIX: wineboot --init seguito da wineserver --wait,
 * eseguiti come unica sequenza prima che qualsiasi altro step tocchi
 * la prefix. Non lancia mai eccezioni — ritorna sempre un risultato
 * strutturato {success, error}, coerente con l'altro principio
 * adottato da Heroic (prepareWineLaunch ritorna {success,
 * failureReason} invece di propagare eccezioni che abortirebbero
 * l'intero processo per un singolo passo non necessariamente fatale).
 */
export async function prepareWinePrefix(
  task:    DownloadTask,
  opts:    PrepareWinePrefixOptions,
  spawn:   SpawnFn,
  log:     (task: DownloadTask, level: 'system' | 'error' | 'info', msg: string) => void,
): Promise<PrepareWinePrefixResult> {
  const baseEnv: Record<string, string> = {
    WINEPREFIX:       opts.prefixPath,
    WINEDEBUG:        '-all',
    WINEDLLOVERRIDES: 'mscoree,mshtml=',
  };
  if (opts.disableWineSync) {
    baseEnv.WINE_DISABLE_FAST_SYNC = '1';
  }

  try {
    const wineBin       = opts.wineBin       ?? 'wine';
    const wineserverBin = opts.wineserverBin ?? 'wineserver';
    log(task, 'system', `[PREFIX] ${wineBin} wineboot --init (con ${wineserverBin} --wait a seguire)`);
    await spawn(task, wineBin, ['wineboot', '--init'], baseEnv, opts.wineBootTimeoutMs);

    // v0.99.35 — il passo che mancava: senza questo, wineboot può
    // ritornare prima che wineserver/services.exe abbiano finito di
    // scrivere il registro e i file di sistema della prefix — i passi
    // successivi (winetricks, DXVK) potrebbero competere con quel
    // lavoro residuo invece di trovare una prefix genuinamente pronta.
    log(task, 'system', `[PREFIX] ${wineserverBin} --wait (attesa completamento inizializzazione)`);
    await spawn(task, wineserverBin, ['--wait'], { WINEPREFIX: opts.prefixPath }, opts.wineBootTimeoutMs);

    log(task, 'system', `[PREFIX] Prefix pronta.`);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log(task, 'error', `[PREFIX] Preparazione fallita: ${error}`);
    return { success: false, error };
  }
}
