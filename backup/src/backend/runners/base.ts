import { Game } from '../../types';

export interface RunnerConfig {
  env?:      Record<string, string>;
  args?:     string[];
  prefix?:   string;
  cwd?:      string;
  fsr?:      boolean;
  gameMode?: boolean;
  mangohud?: 0 | 1 | 2;
  eac?:      boolean;
  battleye?: boolean;
  // v1.5.20-dev.1 — vedi CompatibilityProfile.umuRun in types.ts. Letto
  // solo da ProtonRunner (nessun significato per WineRunner — umu-run
  // richiede sempre una build Proton come PROTONPATH).
  umuRun?:   boolean;
  // v2.0.41-dev.24/25 — vedi CompatibilityProfile.gamescope in types.ts.
  // A differenza di umuRun (solo ProtonRunner), significativo per
  // qualunque runner — Gamescope avvolge il comando finale indifferente
  // a cosa ci sia dentro (wine, proton, umu-run, gamemoderun), stesso
  // principio già di resolveGameModeWrapping. 4 stati come mangohud, non
  // un semplice booleano — vedi resolveGamescopeWrapping.
  gamescope?: 0 | 1 | 2 | 3;
  // v2.0.41-dev.49 — Process Manager, step 2: permette al chiamante di
  // etichettare lo scope cgroup diversamente dal default ('game', preso
  // da game.id/game.title in implementations.ts). Serve SOLO a
  // launchSharedLauncher() in sharedLauncherManager.ts, che riusa
  // ProtonRunner.launch() con un Game sintetico (id `shared-launcher-
  // <launcherId>`) — senza questo override quel lancio finirebbe
  // tracciato come un gioco qualunque invece che come launcher condiviso
  // nel Process Manager. Non tocca nessun chiamante esistente (tutti
  // omettono questi due campi, restano sul default).
  scopeKind?: 'game' | 'shared-launcher';
  scopeId?:   string;
}

export abstract class BaseRunner {
  abstract readonly id: string;
  abstract readonly name: string;

  // v2.0.41-dev.50 — Process Manager, step 3: `unit` risale fino a
  // gameManager.ts quando il lancio è stato avvolto in uno scope cgroup
  // (vedi spawnDetached in implementations.ts) — serve per interrogare lo
  // scope alla chiusura invece di affidarsi al pgrep per nome processo
  // (falso positivo confermato su hardware reale: `pgrep -f
  // WatchDogs2.exe` trova anche `umu-run .../WatchDogs2.exe`, il
  // wrapper, non il gioco). Assente per i lanci non avvolti (Steam URI).
  abstract launch(game: Game, config?: RunnerConfig): Promise<{ success: boolean; pid?: number; unit?: string; message?: string; logPath?: string }>;
  abstract isAvailable(): Promise<boolean>;
  abstract version(): Promise<string>;
}
