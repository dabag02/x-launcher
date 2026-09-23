import { useState, useEffect } from 'react';

// Un solo fetch al boot, nessuna azione entangled altrove — usato solo per
// display (sidebar, header). Estratto da App.tsx com'era, nessun cambio di
// comportamento.
export function useHostname(): string {
  const [hostname, setHostname] = useState<string>('');

  useEffect(() => {
    fetch('/api/system/hostname').then(r => r.json()).then(d => setHostname(d.hostname ?? '')).catch(() => {});
  }, []);

  return hostname;
}
