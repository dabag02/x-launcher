import { useState, useEffect } from 'react';

export interface SystemInfo {
  motherboard: string;
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
  os: string;
}

// Richiesta utente — Info Hardware: un solo fetch alla prima apertura della
// tab 'hardware' (resta null finché non è mai stata aperta), non ad ogni
// riselezione. Estratto da App.tsx com'era, nessun cambio di comportamento.
export function useSystemInfo(activeSettingsTab: string): SystemInfo | null {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    if (activeSettingsTab === 'hardware' && !systemInfo) {
      fetch('/api/system-info').then(r => r.json()).then(setSystemInfo).catch(() => {});
    }
  }, [activeSettingsTab, systemInfo]);

  return systemInfo;
}
