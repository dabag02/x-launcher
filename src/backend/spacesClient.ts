// spacesClient.ts — v2.5.1-dev.4 (Step 21, gestore degli spazi).
//
// Client del gestore degli spazi (spaces.py, ospitato da tray.py nella sessione
// Openbox "Shell"). Parla con il suo socket Unix locale: una riga JSON per
// richiesta, una per risposta. Il percorso del socket va tenuto IDENTICO a
// quello calcolato da spaces.py (funzione socket_path()).
//
// Se il socket non esiste o non risponde (sessione XFCE, sessione Kiosk
// gamescope, demone spento) tutte le funzioni restituiscono null/false senza
// lanciare eccezioni: chi chiama ricade sul comportamento precedente.

import net from 'net';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export function spacesSocketPath(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const runDir = `/run/user/${uid}`;
  if (fs.existsSync(runDir)) return `${runDir}/x-launcher-spaces.sock`;
  // cartella privata 0700 creata da spaces.py (prima: /tmp/x-launcher-spaces-<uid>.sock, nome prevedibile)
  return path.join(os.homedir(), '.cache', 'x-launcher', 'spaces.sock');
}

export interface SpaceEntry {
  space: number;
  kind: 'dashboard' | 'game' | 'steam';
  scope?: string;
  window: number | null;
  title?: string;
}

export interface SpacesState {
  ok: boolean;
  current: number;
  previous: number;
  spaces: SpaceEntry[];
  error?: string;
}

export function sendToSpaces(
  req: Record<string, unknown>,
  timeoutMs = 500,
): Promise<SpacesState | null> {
  return new Promise((resolve) => {
    const sockPath = spacesSocketPath();
    if (!fs.existsSync(sockPath)) {
      resolve(null);
      return;
    }
    let done = false;
    let buf = '';
    const sock = net.createConnection(sockPath);
    const timer = setTimeout(() => finish(null), timeoutMs);
    function finish(value: SpacesState | null): void {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(value);
    }
    sock.on('connect', () => sock.write(JSON.stringify(req) + '\n'));
    sock.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      try {
        finish(JSON.parse(buf.slice(0, nl)) as SpacesState);
      } catch {
        finish(null);
      }
    });
    sock.on('error', () => finish(null));
    sock.on('close', () => finish(null));
  });
}

/** True se il gestore degli spazi e' in esecuzione e risponde. */
export async function isSpacesActive(): Promise<boolean> {
  return (await sendToSpaces({ cmd: 'state' })) !== null;
}

/**
 * v3.2.6-dev.3 — come isSpacesActive, ma con piu' pazienza: fino a `waitMs` ms, una richiesta al secondo
 * con risposta attesa fino a 1,5 s (il gestore puo' essere appena partito o occupato a congelare).
 */
export async function waitSpacesActive(waitMs: number): Promise<boolean> {
  const t0 = Date.now();
  for (;;) {
    if ((await sendToSpaces({ cmd: 'state' }, 1500)) !== null) return true;
    if (Date.now() - t0 >= waitMs) return false;
    await new Promise(r => setTimeout(r, 1000));
  }
}

/**
 * v3.2.6-dev.3 — scongela uno scope prima di chiuderlo. Passa dal gestore degli spazi (che cosi'
 * aggiorna anche il proprio stato); se non risponde, `systemctl --user thaw` diretto. Mai un errore.
 */
export async function thawScope(unit: string): Promise<void> {
  if (!/^xlauncher-[A-Za-z0-9_.@-]{1,200}$/.test(unit)) return;
  if ((await sendToSpaces({ cmd: 'thaw', scope: unit }, 3000)) !== null) return;
  await new Promise<void>(resolve => {
    execFile('systemctl', ['--user', 'thaw', `${unit}.scope`], { timeout: 10_000 }, () => resolve());
  });
}
