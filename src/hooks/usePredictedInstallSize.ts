import { useState, useEffect } from 'react';
import { Game } from '../types';

export interface PredictedInstallSize {
  bytes: number | null;
  loading: boolean;
}

// Richiesta utente — dimensione prevista di installazione, on-demand per un
// solo gioco alla volta (solo GOG/Epic/Amazon — il backend ritorna null per
// ogni altro store, gestito qui semplicemente nascondendo il blocco in
// App.tsx). Un fetch per gioco selezionato, non per l'intera libreria in una
// volta. Estratto da App.tsx com'era, nessun cambio di comportamento.
export function usePredictedInstallSize(selectedGame: Game | null | undefined): PredictedInstallSize {
  const [bytes, setBytes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedGame || (selectedGame.store !== 'GOG Galaxy' && selectedGame.store !== 'Epic Games' && selectedGame.store !== 'Amazon Games')) {
      setBytes(null);
      setLoading(false);
      return;
    }
    setBytes(null);
    setLoading(true);
    let cancelled = false;
    fetch(`/api/games/${selectedGame.id}/predicted-size`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setBytes(typeof d.bytes === 'number' ? d.bytes : null); })
      .catch(() => { if (!cancelled) setBytes(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedGame?.id, selectedGame?.store]);

  return { bytes, loading };
}
