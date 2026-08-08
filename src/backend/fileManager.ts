/**
 * fileManager.ts — Fase A.4
 *
 * Backend del file manager nativo controller-navigabile: sostituisce
 * zenity/kdialog (vedi filePicker.ts, che restava esplicitamente pensato
 * per questo momento fin dalla sua creazione) quando l'utente naviga con
 * un controller — quei dialog nativi non rispondono affatto al gamepad.
 *
 * Nessuna restrizione artificiale sui percorsi navigabili: questa è
 * un'app desktop locale mono-utente, lo stesso confine di fiducia del
 * dialog nativo che sostituisce (zenity/kdialog vedono già l'intero
 * filesystem dell'utente).
 */
import { readdirSync, statSync, existsSync } from 'fs';
import path from 'path';

export interface FileManagerEntry {
  name: string;
  isDirectory: boolean;
  /** null per le cartelle — servirebbe una scansione ricorsiva costosa
   *  e non necessaria per navigare, vedi discussione con l'utente. */
  sizeBytes: number | null;
  /** Data di ULTIMA MODIFICA (mtime), non di creazione — su Linux la
   *  data di creazione in senso stretto spesso non è nemmeno disponibile
   *  in modo affidabile a seconda del filesystem, mtime è sempre
   *  presente ed è quella che risponde davvero a "quando è arrivato/
   *  cambiato questo file" (deciso esplicitamente con l'utente). */
  mtimeMs: number | null;
}

export interface FileManagerListing {
  path: string;
  parentPath: string | null;
  entries: FileManagerEntry[];
}

export interface FileManagerError {
  error: string;
}

/**
 * Elenca una cartella. Cartelle SEMPRE incluse indipendentemente dal
 * filtro (serve poterci entrare per cercare) — solo i FILE vengono
 * filtrati per estensione quando `extensions` è fornito e non vuoto.
 * File/cartelle nascoste (nome che inizia con '.') escluse, stesso
 * principio di qualunque file manager desktop — non rilevanti per
 * scegliere un installer.
 */
export function listDirectory(dirPath: string, extensions?: string[]): FileManagerListing | FileManagerError {
  let resolved: string;
  try {
    resolved = path.resolve(dirPath);
  } catch {
    return { error: 'Percorso non valido.' };
  }
  if (!existsSync(resolved)) return { error: 'Cartella non trovata.' };

  let stat;
  try {
    stat = statSync(resolved);
  } catch {
    return { error: 'Impossibile leggere il percorso.' };
  }
  if (!stat.isDirectory()) return { error: 'Il percorso non è una cartella.' };

  let names: string[];
  try {
    names = readdirSync(resolved);
  } catch {
    return { error: 'Permesso negato per questa cartella.' };
  }

  const extSet = extensions && extensions.length > 0
    ? new Set(extensions.map(e => e.toLowerCase().replace(/^\./, '')))
    : null;

  const entries: FileManagerEntry[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = path.join(resolved, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      // Link simbolico rotto o permesso negato sul singolo elemento —
      // salta quella voce, non blocca l'intera lista.
      continue;
    }
    const isDir = s.isDirectory();
    if (!isDir && extSet) {
      const ext = path.extname(name).toLowerCase().replace(/^\./, '');
      if (!extSet.has(ext)) continue;
    }
    entries.push({
      name,
      isDirectory: isDir,
      sizeBytes: isDir ? null : s.size,
      mtimeMs:    isDir ? null : s.mtimeMs,
    });
  }

  // Cartelle prima, poi ordine alfabetico case-insensitive — stessa
  // convenzione di qualunque file manager desktop.
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  const parent = path.dirname(resolved);
  return {
    path: resolved,
    parentPath: parent !== resolved ? parent : null,
    entries,
  };
}

/**
 * v1.5.20-dev.12 — quick-link "Supporti rimovibili": verificato (Arch
 * Wiki, non assunto) che udisks2 monta di default in
 * `/run/media/$USER/` — alcuni setup (KDE Plasma su altre distro,
 * configurazioni personalizzate) usano invece `/media/$USER/`. Prova
 * entrambi, nella stessa priorità, restituisce il primo che esiste
 * davvero su disco. null se nessuno dei due esiste — il chiamante
 * disabilita/nasconde il quick-link in quel caso, non un errore.
 */
export function resolveRemovableMediaRoot(): string | null {
  const user = process.env.USER || process.env.LOGNAME;
  if (!user) return null;
  for (const base of [`/run/media/${user}`, `/media/${user}`]) {
    if (existsSync(base)) return base;
  }
  return null;
}
