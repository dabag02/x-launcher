// gameSpacesLimit.ts — v3.2.13-dev.1 (regola dei 2 giochi contemporanei).
//
// Nella sessione Openbox con gli spazi i giochi occupano al massimo gli spazi 1-2 (NUM_SLOTS di
// spaces.py); lo spazio 3 e' di Steam. Un terzo gioco non avrebbe uno spazio (resterebbe sopra la
// Dashboard, mai congelato, a contendersi il controller): la Dashboard non lo lancia e mostra una
// notifica (vedi POST /api/launch in server.ts). I giochi Steam (runner Steam Native) e Steam Big
// Picture sono esclusi: vanno nello spazio 3 insieme a Steam.

import * as processManager from './processManager';
import { sendToSpaces, SpacesState } from './spacesClient';

export const GAME_SPACES_MAX = 2;

/** Calcolo puro, separato per i test: lo stato di spaces.py e gli scope dei giochi attivi. */
export function limitReached(
  state: Pick<SpacesState, 'spaces'>,
  activeGames: Array<{ id: string; unit: string; startedAt: number }>,
  gameId: string,
  now: number = Date.now(),
): boolean {
  // gia' in esecuzione: non si blocca (ci pensa il lancio normale)
  if (activeGames.some(i => i.id === gameId)) return false;
  const inSpaces = new Set(state.spaces.filter(s => s.kind === 'game' && s.scope).map(s => s.scope as string));
  // lanciati da meno di 60 s e ancora senza finestra: due lanci ravvicinati non passano entrambi
  const starting = activeGames.filter(i => !inSpaces.has(i.unit) && now - i.startedAt < 60_000);
  return inSpaces.size + starting.length >= GAME_SPACES_MAX;
}

/** true se ci sono gia' GAME_SPACES_MAX giochi aperti. Fuori dalla sessione Openbox: mai. */
export async function gameSpacesLimitReached(gameId: string): Promise<boolean> {
  const state = await sendToSpaces({ cmd: 'state' });
  if (!state || !Array.isArray(state.spaces)) return false;
  const active = processManager.listActive().filter(i => i.kind === 'game');
  return limitReached(state, active, gameId);
}
