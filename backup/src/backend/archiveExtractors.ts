/**
 * archiveExtractors.ts — v1.1.105-dev.1
 *
 * Registry di estrattori archivio, utility-agnostic: aggiungere un nuovo
 * formato (es. domani un .rar funzionante) significa aggiungere una voce
 * qui, senza toccare classicPlugin.ts o qualunque altro chiamante — stesso
 * principio già usato per i runner (WineRunner/ProtonRunner via BaseRunner)
 * e i plugin store (StorePlugin).
 *
 * Richiesta utente: oggi solo .zip (unzip) e .7z (7z, pacchetto p7zip)
 * sono davvero supportati. .rar è nell'elenco SOLO per la rilevazione nella
 * tab System di Gestisci Account (vedi compatibilityManager.ts) — `binary`
 * punta a `unrar`, ma `supported: false` perché nessuna raccolta ROM reale
 * è stata ancora verificata con questo tool: aggiungere `unrar` qui e
 * impostare `supported: true` quando servirà davvero.
 */
import { existsSync } from 'fs';
import { execFileSync } from 'child_process';

export interface ArchiveExtractor {
  id: string;
  /** Estensioni gestite da questo estrattore, minuscole, col punto (es. '.zip'). */
  extensions: string[];
  /** Binario da invocare — usato anche per il rilevamento in detectSystemTools(). */
  binary: string;
  /** false = elencato solo per rilevamento tool, non ancora usato per estrarre davvero. */
  supported: boolean;
  /** Costruisce gli argomenti CLI per estrarre archivePath dentro destDir. */
  buildArgs(archivePath: string, destDir: string): string[];
}

export const ARCHIVE_EXTRACTORS: ArchiveExtractor[] = [
  {
    id: 'unzip',
    extensions: ['.zip'],
    binary: 'unzip',
    supported: true,
    buildArgs: (archivePath, destDir) => ['-o', '-q', archivePath, '-d', destDir],
  },
  {
    id: '7z',
    extensions: ['.7z'],
    binary: '7z',
    supported: true,
    buildArgs: (archivePath, destDir) => ['x', '-y', `-o${destDir}`, archivePath],
  },
  {
    id: 'unrar',
    extensions: ['.rar'],
    binary: 'unrar',
    supported: false, // vedi commento in cima al file
    buildArgs: (archivePath, destDir) => ['x', '-o+', archivePath, destDir + '/'],
  },
];

/** Estensioni di TUTTI gli estrattori registrati, supportati o no — usata
 *  per riconoscere "questo è un archivio", indipendentemente dal fatto
 *  che sappiamo già estrarlo. */
export const ARCHIVE_EXTENSIONS = new Set(ARCHIVE_EXTRACTORS.flatMap(e => e.extensions));

export function findExtractorFor(filePath: string): ArchiveExtractor | undefined {
  const ext = filePath.toLowerCase().slice(filePath.toLowerCase().lastIndexOf('.'));
  return ARCHIVE_EXTRACTORS.find(e => e.extensions.includes(ext));
}

function binaryExists(bin: string): boolean {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Estrae archivePath dentro destDir usando l'estrattore giusto per la sua
 * estensione. Non crea destDir (a carico del chiamante, che di solito deve
 * comunque farlo prima per altri motivi — vedi classicPlugin.ts).
 */
export function extractArchive(archivePath: string, destDir: string): { success: boolean; message?: string } {
  const extractor = findExtractorFor(archivePath);
  if (!extractor) {
    return { success: false, message: `Nessun estrattore registrato per ${archivePath}` };
  }
  if (!extractor.supported) {
    return { success: false, message: `Formato .${extractor.extensions[0].slice(1)} non ancora supportato per l'estrazione (solo rilevato)` };
  }
  if (!existsSync(archivePath)) {
    return { success: false, message: `File non trovato: ${archivePath}` };
  }
  if (!binaryExists(extractor.binary)) {
    return { success: false, message: `manca '${extractor.binary}'? installa con: sudo pacman -S ${extractor.id === '7z' ? 'p7zip' : extractor.binary}` };
  }
  try {
    execFileSync(extractor.binary, extractor.buildArgs(archivePath, destDir), { timeout: 120_000 });
    return { success: true };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}
