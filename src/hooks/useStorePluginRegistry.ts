// useStorePluginRegistry — hook React che isola stato e logica del
// registro plugin store (tab Plugin nell'overlay Impostazioni), estratto
// da App.tsx come quinto passo di modularizzazione (v1.5.14-dev.1),
// sullo stesso modello di useCloudBackupProviders/useNotifications/
// useAiAdvisorProviders/useInputDevices.
//
// Verificato prima dell'estrazione: nessun polling condiviso con altri
// concetti (diverso da downloads/logs, scartato) — due effetti autonomi
// (mount + apertura tab plugins) più un caricatore esplicito, stessa
// forma degli altri hook già estratti.
//
// Nessun id di Focusable/neighbors/sequentialChain qui dentro — solo
// stato, fetch e funzione di supporto. Il JSX (tab Plugin) resta in
// App.tsx invariato, così come i punti che leggono soltanto
// pluginRegistry altrove nel file (es. il useMemo di pluginStateMap).
import { useState, useEffect } from 'react';
import i18n from '../i18n/i18n';

export interface StorePluginEntry {
  id: string;
  name: string;
  description: string;
  drmFree: boolean;
  requiredTool: string;
  enabled: boolean;
}

/**
 * @param activeSettingsTab tab attualmente attiva nell'overlay
 *   Impostazioni — usata per ricaricare il registro ogni volta che
 *   l'utente apre la tab Plugin (stesso principio già in uso per gli
 *   altri stati di questa sezione).
 */
export function useStorePluginRegistry(activeSettingsTab: string) {
  const [pluginRegistry, setPluginRegistry] = useState<StorePluginEntry[]>([]);
  const [pluginLoadError, setPluginLoadError] = useState<string | null>(null);

  // Carica plugin registry ogni volta che si apre il tab plugins
  const loadPluginRegistry = () => {
    setPluginLoadError(null);
    fetch('/api/plugins')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        if (Array.isArray(data)) setPluginRegistry(data);
        else throw new Error(i18n.t('settings:plugins.notAnArray'));
      })
      .catch(e => setPluginLoadError(String(e)));
  };

  useEffect(() => {
    if (activeSettingsTab !== 'plugins') return;
    loadPluginRegistry();
  }, [activeSettingsTab]);

  useEffect(() => {
    loadPluginRegistry();
  }, []);

  return {
    pluginRegistry,
    // v1.5.14-dev.1 — esposto anche il setter grezzo: il JSX in App.tsx
    // lo chiama direttamente al toggle di un plugin store (per un
    // aggiornamento ottimistico immediato) — stesso principio già usato
    // per i setter grezzi esposti negli altri hook estratti.
    setPluginRegistry,
    pluginLoadError,
    loadPluginRegistry,
  };
}
