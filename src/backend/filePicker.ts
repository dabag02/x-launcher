/**
 * filePicker.ts
 *
 * Astrazione per "far scegliere un file all'utente col mouse", pensata
 * fin da subito con un solo punto di innesto: oggi delega a un dialog
 * nativo del desktop (zenity/kdialog), domani potrà delegare a un file
 * browser interno alla Dashboard, controller-navigabile (idea annotata
 * in roadmap, non ancora costruita) — nessun chiamante dovrà cambiare
 * quando arriverà quel giorno, perché tutti chiamano solo browseForFile().
 *
 * Verificato prima di scrivere (documentazione reale, non assunto):
 * `zenity --file-selection` stampa il path scelto su stdout, exit code
 * 0=OK, 1=Cancel/chiusura finestra, 5=timeout. `kdialog --getopenfilename
 * [startDir] [filtro]` (argomenti posizionali, non flag) stampa il path
 * su stdout, exit 0=OK, 1=Cancel. Nessuno dei due era già in uso nel
 * progetto — dipendenze nuove, da aggiungere come RACCOMANDATE (mai
 * automatiche) in setup-linux.sh, stesso trattamento di Steam/Lutris/Ollama.
 */
import { execSync, execFile } from 'child_process';
import { writeLog } from './logger';

// Stesso helper duplicato per file già in uso in tutto il backend
// (downloadManager.ts, archiveExtractors.ts, runners/implementations.ts,
// cloudBackup/googleDrive.ts, plugins/*Plugin.ts, sharedLauncherManager.ts).
function binaryExists(bin: string): boolean {
  try { execSync(`which ${bin}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

export interface FilePickerOptions {
  /** Titolo della finestra di dialogo. */
  title: string;
  /** Cartella di partenza — se omessa, il dialog usa il suo default. */
  startDir?: string;
  /** Es. { name: 'Installer Windows', extensions: ['exe', 'msi'] } */
  filter?: { name: string; extensions: string[] };
}

export type FilePickerOutcome = 'selected' | 'cancelled' | 'unavailable';

export interface FilePickerResult {
  outcome: FilePickerOutcome;
  /** Presente solo se outcome === 'selected'. */
  path?: string;
}

function runDialog(bin: string, args: string[]): Promise<FilePickerResult> {
  return new Promise(resolve => {
    execFile(bin, args, (error, stdout) => {
      const trimmed = stdout.trim();
      if (!error && trimmed) {
        resolve({ outcome: 'selected', path: trimmed });
      } else {
        // Exit 1 (Cancel) o 5 (timeout, solo zenity): trattati allo
        // stesso modo — l'utente ha scelto di non selezionare nulla,
        // non è un errore da segnalare.
        resolve({ outcome: 'cancelled' });
      }
    });
  });
}

/**
 * Apre un dialog nativo di selezione file — zenity se disponibile,
 * altrimenti kdialog, altrimenti 'unavailable' (il chiamante mostra un
 * fallback, es. un campo di testo dove l'utente incolla il path a mano).
 *
 * QUESTO è il solo punto da sostituire quando arriverà il file browser
 * interno controller-navigabile: stessa firma, stesso FilePickerResult,
 * corpo della funzione diverso.
 */
export async function browseForFile(options: FilePickerOptions): Promise<FilePickerResult> {
  if (binaryExists('zenity')) {
    const args = ['--file-selection', `--title=${options.title}`];
    if (options.startDir) args.push(`--filename=${options.startDir.replace(/\/?$/, '/')}`);
    if (options.filter) {
      const patterns = options.filter.extensions.map(ext => `*.${ext}`).join(' ');
      args.push(`--file-filter=${options.filter.name} | ${patterns}`);
    }
    return runDialog('zenity', args);
  }

  if (binaryExists('kdialog')) {
    const args = ['--title', options.title, '--getopenfilename', options.startDir ?? '.'];
    if (options.filter) {
      const patterns = options.filter.extensions.map(ext => `*.${ext}`).join(' ');
      args.push(`${patterns}|${options.filter.name}`);
    }
    return runDialog('kdialog', args);
  }

  writeLog('warning', '[FilePicker] Né zenity né kdialog disponibili — fallback a inserimento manuale del path.');
  return { outcome: 'unavailable' };
}
