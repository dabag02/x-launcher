import { StorePlugin } from './base'; import { Game } from '../../types';
export class BattlenetPlugin extends StorePlugin {
  readonly id = 'Battle.net' as const;
  readonly name = 'Battle.net';
  readonly drmFree = false;
  readonly description = 'Battle.net — non ancora supportato';
  readonly requiredTool = '';
  async getLibrary(): Promise<Game[]> { return []; } // TODO: non ancora implementato, in attesa del proprio turno (vedi thirdPartyLaunchers.ts)
  async installGame(_id: string)   { return { success: true }; }
  async uninstallGame(_id: string) { return { success: true }; }
}
