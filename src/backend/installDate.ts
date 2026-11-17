/**
 * installDate.ts — v3.2.17-dev.2
 *
 * Stima della data di installazione di un gioco dal filesystem, per i
 * giochi già installati prima che la Dashboard tenesse traccia del dato
 * (o installati fuori dalla Dashboard: Heroic, legendary da terminale,
 * client Steam, ROM copiate a mano).
 *
 * Fonte: la data di CREAZIONE (birthtime, statx su ext4/btrfs/xfs) del
 * percorso indicato — cartella di installazione o eseguibile. NON la data
 * di modifica (mtime): gli installer e gli archivi conservano spesso la
 * mtime originale dei file, quindi un gioco installato ieri risulterebbe
 * "installato" nel 2015. Se il filesystem non espone la birthtime (Node
 * restituisce 0 / epoch), si ripiega sulla ctime (ultimo cambio
 * dell'inode), di norma vicina alla data di installazione.
 *
 * Il dato serve solo all'ordinamento "Installazione" della libreria:
 * vive nel DB locale (games.installed_at), che non fa parte del backup
 * Drive (bundle.ts esporta solo i profili di compatibilità).
 */

import { statSync } from 'fs';

/** Valori sotto questa soglia (1 gen 2000) sono considerati "non disponibili". */
const MIN_VALID_MS = Date.UTC(2000, 0, 1);

function birthOrCtimeMs(p: string): number | null {
  try {
    const st = statSync(p);
    if (Number.isFinite(st.birthtimeMs) && st.birthtimeMs > MIN_VALID_MS) return st.birthtimeMs;
    if (Number.isFinite(st.ctimeMs) && st.ctimeMs > MIN_VALID_MS) return st.ctimeMs;
  } catch { /* percorso inesistente o non leggibile */ }
  return null;
}

/**
 * Restituisce la data ISO stimata dal primo percorso valido dell'elenco
 * (in ordine di preferenza), oppure undefined se nessuno è utilizzabile.
 * Le date nel futuro (orologio sballato, filesystem montato da un'altra
 * macchina) vengono scartate.
 */
export function estimateInstallDate(paths: Array<string | null | undefined>): string | undefined {
  const now = Date.now();
  for (const p of paths) {
    if (!p || typeof p !== 'string') continue;
    const ms = birthOrCtimeMs(p);
    if (ms !== null && ms <= now + 60_000) return new Date(ms).toISOString();
  }
  return undefined;
}
