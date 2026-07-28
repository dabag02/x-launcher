// =============================================================================
//  navDebugBus — strumento di debug per la navigazione gamepad/tastiera
// =============================================================================
// Regola di progetto (v1.1.0): ogni nuova implementazione nel sistema di
// navigazione della Dashboard deve prevedere uno strumento di debug
// "spegnibile" senza dover rimuovere codice. Questo modulo è il pattern di
// riferimento: un bus di eventi disaccoppiato da React, con un flag
// `enabled` controllato a runtime (persistito in localStorage). Quando
// disabilitato (default), `emit()` è un no-op a costo pressoché nullo — un
// solo confronto booleano prima di ogni return — quindi può restare nel
// codice di produzione permanentemente, pronto per la prossima diagnosi,
// invece di essere rimosso e riscritto ogni volta.
//
// Uso previsto: FocusProvider chiama `navDebug.emit(...)` ad ogni decisione
// di navigazione (override esplicito, scoring geometrico, ciclo sequenziale).
// NavDebugOverlay.tsx si iscrive con `subscribe()` e mostra un pannello
// visivo; il costo di rendering esiste SOLO quando il pannello è montato
// E abilitato.

export type NavStrategy = 'geometric' | 'sequential' | 'neighbor-override' | 'fallback';

export interface NavDebugEntry {
  ts: number;
  group: string;
  strategy: NavStrategy;
  direction: string;
  fromId: string | null;
  toId: string | null;
  // Dettaglio libero: punteggio vincente per 'geometric', indice per
  // 'sequential', id del neighbor dichiarato per 'neighbor-override'.
  detail?: string;
}

type Listener = (entry: NavDebugEntry) => void;

const STORAGE_KEY = 'x-launcher-nav-debug-enabled';
const RING_SIZE = 50;

class NavDebugBus {
  private listeners = new Set<Listener>();
  private _enabled = false;
  private ring: NavDebugEntry[] = [];

  constructor() {
    try {
      this._enabled = localStorage.getItem(STORAGE_KEY) === '1';
    } catch { /* ambiente senza localStorage: resta disabilitato */ }
  }

  get enabled() { return this._enabled; }

  setEnabled(v: boolean) {
    this._enabled = v;
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch {}
  }

  toggle() { this.setEnabled(!this._enabled); return this._enabled; }

  /** Ultimi eventi noti — usato da NavDebugOverlay al mount per non partire vuoto. */
  getHistory(): readonly NavDebugEntry[] { return this.ring; }

  clear() { this.ring = []; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  emit(entry: NavDebugEntry) {
    if (!this._enabled) return; // no-op a costo nullo quando spento
    this.ring.push(entry);
    if (this.ring.length > RING_SIZE) this.ring.shift();
    this.listeners.forEach(fn => fn(entry));
  }
}

// Singleton, stesso pattern di InputManager
export const navDebug = new NavDebugBus();
