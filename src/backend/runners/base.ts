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
}

export abstract class BaseRunner {
  abstract readonly id: string;
  abstract readonly name: string;

  abstract launch(game: Game, config?: RunnerConfig): Promise<{ success: boolean; pid?: number; message?: string; logPath?: string }>;
  abstract isAvailable(): Promise<boolean>;
  abstract version(): Promise<string>;
}
