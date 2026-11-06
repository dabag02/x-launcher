/**
 * runnerSafety.ts — v3.0.2-dev.2 (audit di sicurezza, punti 2 e 3).
 *
 * Prima di questa versione l'`id` di un runner (arrivato da una richiesta HTTP) finiva in
 * stringhe passate a una shell (`exec(\`protonup -i "${id}"\`)`, `curl "${url}" | tar`,
 * `rm -rf "${target}"`): `$(...)` nell'id eseguiva comandi e `../..` faceva cancellare
 * cartelle fuori da compatibilitytools.d. Qui ci sono i controlli e l'unico helper che
 * serve per fare lo stesso lavoro SENZA shell.
 */
import { spawn } from 'child_process';
import path from 'path';

/** Nome di runner ammesso: lettere, cifre, punto, trattino, underscore; inizia con lettera o cifra. */
const RUNNER_ID_RX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isValidRunnerId(id: unknown): id is string {
  return typeof id === 'string' && RUNNER_ID_RX.test(id) && !id.includes('..');
}

/**
 * `name` risolto dentro `base`, oppure null se esce da `base` (o coincide con `base`).
 * Difesa in profondita': con isValidRunnerId non puo' succedere, ma chi cancella una
 * cartella deve controllarlo in ogni caso.
 */
export function resolveInside(base: string, name: string): string | null {
  const b = path.resolve(base);
  const t = path.resolve(b, name);
  return t !== b && t.startsWith(b + path.sep) ? t : null;
}

/**
 * Scarica `url` con curl ed estrae il tar.gz in `destDir`, senza passare da una shell
 * (due processi collegati da una pipe). `proto` limita i protocolli di curl: https per
 * default (anche sui redirect). Rifiuta se curl o tar escono con errore.
 */
export function downloadTarGz(url: string, destDir: string, proto = '=https', timeoutSec = 1800): Promise<void> {
  return new Promise((resolve, reject) => {
    const curl = spawn('curl', ['-fsSL', '--proto', proto, '--proto-redir', proto, '--max-time', String(timeoutSec), url],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    const tar = spawn('tar', ['-xz', '-C', destDir], { stdio: ['pipe', 'ignore', 'pipe'] });

    let err = '';
    let curlCode: number | null = null;
    let tarCode: number | null = null;
    let settled = false;

    const finish = (e?: Error) => {
      if (settled) return;
      if (e) { settled = true; curl.kill(); tar.kill(); reject(e); return; }
      if (curlCode === null || tarCode === null) return;
      settled = true;
      if (curlCode !== 0) reject(new Error(`curl terminato con codice ${curlCode}: ${err.trim()}`));
      else if (tarCode !== 0) reject(new Error(`tar terminato con codice ${tarCode}: ${err.trim()}`));
      else resolve();
    };

    curl.stderr.on('data', d => { err += String(d); });
    tar.stderr.on('data', d => { err += String(d); });
    curl.on('error', e => finish(e));
    tar.on('error', e => finish(e));
    tar.stdin.on('error', () => { /* tar chiuso prima: lo segnala il suo codice di uscita */ });
    curl.stdout.pipe(tar.stdin);
    curl.on('close', code => { curlCode = code ?? 1; finish(); });
    tar.on('close', code => { tarCode = code ?? 1; finish(); });
  });
}
