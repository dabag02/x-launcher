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
}

export abstract class BaseRunner {
  abstract readonly id: string;
  abstract readonly name: string;

  abstract launch(game: Game, config?: RunnerConfig): Promise<{ success: boolean; pid?: number; message?: string; logPath?: string }>;
  abstract isAvailable(): Promise<boolean>;
  abstract version(): Promise<string>;
}
