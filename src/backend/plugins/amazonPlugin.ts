import { StorePlugin } from './base'; import { Game } from '../../types';
export class AmazonPlugin extends StorePlugin {
  readonly id = 'Amazon Games' as const;
  readonly name = 'Amazon Games';
  readonly drmFree = false;
  readonly description = 'Amazon Games — non ancora supportato';
  readonly requiredTool = '';
  async getLibrary(): Promise<Game[]> { return []; } // TODO Step 8
  async installGame(_id: string)   { return { success: true }; }
  async uninstallGame(_id: string) { return { success: true }; }
}
