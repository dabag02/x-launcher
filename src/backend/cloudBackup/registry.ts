/**
 * cloudBackup/registry.ts — v1.1.121-dev.1
 *
 * Stesso principio del registry dei provider AI Advisor: mappa l'id
 * provider all'istanza giusta. Un solo provider registrato per ora
 * (Google Drive) — aggiungerne altri significa aggiungere una voce qui,
 * non toccare le route in server.ts.
 */

import { CloudBackupProvider } from './base';
import { GoogleDriveProvider } from './googleDrive';

const PROVIDERS: CloudBackupProvider[] = [
  new GoogleDriveProvider(),
];

export function getCloudBackupProvider(id: string): CloudBackupProvider | undefined {
  return PROVIDERS.find(p => p.id === id);
}

export function getAllCloudBackupProviders(): CloudBackupProvider[] {
  return PROVIDERS;
}
