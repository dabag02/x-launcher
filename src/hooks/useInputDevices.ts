// useInputDevices — hook React che isola stato e logica della tab Input
// (dispositivi controller connessi + plugin di riconoscimento), estratto
// da App.tsx come quarto passo di modularizzazione (v1.5.13-dev.1),
// sullo stesso modello di useCloudBackupProviders/useNotifications/
// useAiAdvisorProviders.
//
// A differenza di useDownloadTasks() (scartato: intrecciato con logs in
// un polling condiviso), qui non c'è alcuna condivisione — un solo
// effetto autonomo legato solo all'apertura della tab Input.
//
// Nessun id di Focusable/neighbors/sequentialChain qui dentro — solo
// stato e un effetto. Il JSX (tab Input nell'overlay Impostazioni) resta
// in App.tsx invariato.
import { useState, useEffect } from 'react';
import { InputManager } from '../input/InputManager';
import { toInputPluginSummary } from '../input/types';

export function useInputDevices(activeSettingsTab: string) {
  const [inputPlugins, setInputPlugins] = useState(
    () => InputManager.plugins.map(toInputPluginSummary)
  );
  const [connectedDevices, setConnectedDevices] = useState(InputManager.devices);

  // Aggiorna dispositivi connessi quando si apre il tab input
  useEffect(() => {
    if (activeSettingsTab !== 'input') return;
    InputManager.refreshDevices();
    setConnectedDevices([...InputManager.devices]);
    setInputPlugins(InputManager.plugins.map(toInputPluginSummary));
  }, [activeSettingsTab]);

  return {
    inputPlugins,
    // v1.5.13-dev.1 — esposto anche il setter grezzo: il JSX in App.tsx
    // lo chiama direttamente al toggle di un plugin (per un
    // aggiornamento immediato dello stato locale dopo aver chiamato
    // InputManager) — stesso principio già usato per setCloudBackupProviders
    // nel primo hook estratto.
    setInputPlugins,
    connectedDevices,
  };
}
