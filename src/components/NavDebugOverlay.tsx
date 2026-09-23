import React, { useEffect, useState } from 'react';
import { navDebug, NavDebugEntry } from '../lib/navDebugBus';

// =============================================================================
//  NavDebugOverlay — pannello di debug per la navigazione gamepad/tastiera
// =============================================================================
// Va montato UNA volta vicino alla radice dell'app (vedi App.tsx). Renderizza
// null quando disabilitato: il costo quando spento è un solo listener
// registrato su window (keydown) più una sottoscrizione al bus che non
// riceve mai eventi (navDebug.emit è già un no-op lato bus quando disabled).
//
// Toggle: Ctrl+Alt+N — stesso registro delle altre scorciatoie nascoste già
// in uso nel progetto (Ctrl+Alt+B storico per Borderless, Ctrl+Alt+K per il
// toggle Kiosk nel menu). Persistito in localStorage tramite il bus stesso,
// quindi resta attivo tra un riavvio e l'altro finché non lo si rispegne
// esplicitamente — utile per una sessione di test prolungata su hardware
// reale senza dover riattivare il toggle ad ogni lancio.
//
// "Spegnimento": premere di nuovo Ctrl+Alt+N, oppure cancellare la chiave
// 'x-launcher-nav-debug-enabled' da localStorage. Rimuovere questo file e
// le due righe di montaggio/emit nel resto del codice riporta il progetto
// esattamente allo stato precedente, se in futuro si decide di eliminarlo
// invece di tenerlo spento.

const STRATEGY_COLOR: Record<string, string> = {
  geometric:          'text-blue-400',
  sequential:         'text-green-400',
  'neighbor-override': 'text-yellow-400',
  fallback:           'text-gray-400',
};

export const NavDebugOverlay: React.FC = () => {
  const [enabled, setEnabled] = useState(navDebug.enabled);
  const [entries, setEntries] = useState<NavDebugEntry[]>(() => [...navDebug.getHistory()]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setEnabled(navDebug.toggle());
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return navDebug.subscribe((entry) => {
      setEntries(prev => [...prev.slice(-19), entry]); // ultimi 20 in vista
    });
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-[9999] w-[420px] max-h-[45vh] overflow-y-auto rounded-xl border border-white/20 bg-black/85 backdrop-blur-sm p-3 font-mono text-[10px] text-white/80 pointer-events-none"
      data-nav-debug-overlay
    >
      <div className="flex items-center justify-between mb-2 pointer-events-auto">
        <span className="font-black uppercase tracking-widest text-white">Nav Debug</span>
        <button
          className="text-white/50 hover:text-white text-[9px] uppercase"
          onClick={() => { navDebug.clear(); setEntries([]); }}
        >pulisci</button>
      </div>
      {entries.length === 0 ? (
        <p className="opacity-40">In attesa del primo movimento…</p>
      ) : (
        <div className="space-y-1">
          {entries.slice().reverse().map((e, i) => (
            <div key={i} className="flex flex-wrap gap-x-2 border-b border-white/5 pb-1">
              <span className="opacity-40">{new Date(e.ts).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}</span>
              <span className="text-white/60">[{e.group}]</span>
              <span className={STRATEGY_COLOR[e.strategy] ?? 'text-white'}>{e.strategy}</span>
              <span className="opacity-60">{e.direction}</span>
              <span className="opacity-40">{e.fromId ?? '∅'}</span>
              <span className="opacity-40">→</span>
              <span className={e.toId ? '' : 'text-red-400'}>{e.toId ?? 'nessuno'}</span>
              {e.detail && <span className="opacity-30 italic">({e.detail})</span>}
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 opacity-30 pointer-events-auto">Ctrl+Alt+N per nascondere</p>
    </div>
  );
};
