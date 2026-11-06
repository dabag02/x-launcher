/**
 * safeExec.ts — v3.0.2-dev.5 (audit di sicurezza, punto 11: stringhe di shell nel backend).
 *
 * Il backend costruiva comandi come `find "${cartella}" -iname "*.exe" | head -1` e li passava a `execSync`,
 * cioe' a /bin/sh: dentro le virgolette doppie la shell espande comunque `$(...)`, i backtick e `\`, quindi una
 * cartella o un id con un nome "creativo" (da un catalogo di store, da un file scaricato) eseguiva comandi.
 * Qui ci sono gli strumenti per fare le stesse cose SENZA shell: i valori viaggiano come argomenti separati e non
 * vengono mai reinterpretati.
 */
import { execFileSync } from 'child_process';
import path from 'path';

/** Esclusioni usuali quando si cerca "l'exe del gioco" e non un disinstallatore, un redistributable, un helper. */
export const EXE_EXCLUDES_STD: readonly string[] = [
  'unins*', '*crashhandler*', '*crashreporter*', 'vcredist*', 'vc_redist*', 'dxsetup*',
  '*explorer*', '*helper*', '*updater*',
];

export interface FindOptions {
  maxDepth?: number;
  type?: 'f' | 'd';
  /** Uno o piu' pattern -iname (in OR). */
  inames?: string[];
  /** Pattern -iname da escludere. */
  excludeInames?: string[];
  /** Pattern -path da escludere (es. '*\/extras/*'). */
  excludePaths?: string[];
  timeoutMs?: number;
}

function buildFindArgs(dir: string, o: FindOptions, stopAtFirst: boolean): string[] {
  // path.resolve: l'argomento inizia sempre con '/', quindi `find` non puo' scambiarlo per un'opzione.
  const args: string[] = [path.resolve(dir)];
  if (o.maxDepth !== undefined) args.push('-maxdepth', String(Math.max(0, Math.floor(o.maxDepth))));
  if (o.type) args.push('-type', o.type);
  const names = o.inames ?? [];
  if (names.length === 1) args.push('-iname', names[0]);
  else if (names.length > 1) {
    args.push('(');
    names.forEach((n, i) => { if (i > 0) args.push('-o'); args.push('-iname', n); });
    args.push(')');
  }
  for (const n of o.excludeInames ?? []) args.push('!', '-iname', n);
  for (const p of o.excludePaths ?? []) args.push('!', '-path', p);
  args.push('-print');
  if (stopAtFirst) args.push('-quit');
  return args;
}

function runFind(args: string[], timeoutMs: number): string {
  try {
    return execFileSync('find', args, {
      encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    // find esce con codice 1 anche solo per una sottocartella illeggibile, ma l'elenco trovato fin li' e' valido
    // (la vecchia pipeline `find ... 2>/dev/null | head -1` ignorava il codice di uscita allo stesso modo).
    const out = (err as { stdout?: unknown }).stdout;
    return typeof out === 'string' ? out : '';
  }
}

/** Primo risultato di `find` ('' se nessuno). Non lancia mai. */
export function findFirst(dir: string, o: FindOptions = {}): string {
  const out = runFind(buildFindArgs(dir, o, true), o.timeoutMs ?? 8000);
  return out.split('\n').find(Boolean)?.trim() ?? '';
}

/** Tutti i risultati di `find`. Non lancia mai. */
export function findAll(dir: string, o: FindOptions = {}): string[] {
  return runFind(buildFindArgs(dir, o, false), o.timeoutMs ?? 8000).split('\n').filter(Boolean);
}

/** Identificativo di catalogo (appName Epic, productId Amazon...): inizia con lettera/cifra, niente spazi ne' metacaratteri. */
export function isSafeStoreId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(id);
}

/** Pattern glob semplice (`*`, `?`) -> RegExp, senza distinzione di maiuscole. Per filtrare nomi file in JS. */
export function globToRegExp(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${esc}$`, 'i');
}
