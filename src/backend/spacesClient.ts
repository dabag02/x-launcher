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
import fs from 'fs';

export function spacesSocketPath(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const runDir = `/run/user/${uid}`;
  if (fs.existsSync(runDir)) return `${runDir}/x-launcher-spaces.sock`;
  return `/tmp/x-launcher-spaces-${uid}.sock`;
}

export interface SpaceEntry {
  space: number;
  kind: 'dashboard' | 'game';
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
