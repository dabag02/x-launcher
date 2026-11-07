// useCloudBackupProviders — hook React che isola stato e logica della
// sezione Cloud Backup (tab Account), estratto da App.tsx come primo
// passo di modularizzazione (v1.5.10-dev.1).
//
// Nessun id di Focusable/neighbors/sequentialChain qui dentro — solo
// stato, fetch e funzioni di supporto. Il JSX (con tutti i riferimenti
// di navigazione) resta in App.tsx invariato, questo hook si limita a
// spostare *dove vive* la logica, non *come si comporta*: stessa API
// (stessi nomi restituiti) di prima, per un diff minimo nel chiamante.
import React, { useState, useEffect, useCallback } from 'react';

export interface CloudBackupProviderState {
  name: string;
  description: string;
  enabled: boolean;
  hasCredentials: boolean;
  authenticated: boolean;
  lastBackupAt: string | null;
  clientIdDraft: string;
  clientSecretDraft: string;
  // v3.2.2-dev.2 — passphrase che cifra il bundle: il server dice solo SE c'e' (passphraseSet); i due campi di
  // inserimento restano nella bozza finche' non coincidono, poi vengono inviati e svuotati.
  passphraseSet: boolean;
  passphraseDraft: string;
  passphraseConfirmDraft: string;
  connecting: boolean;
  actionStatus: { success: boolean; message: string } | null;
  actionRunning: 'backup' | 'restore' | null;
}

// Shape esatto di GET /api/cloud-backup/providers (vedi route corrispondente
// in server.ts) — providerId è l'id del provider, il resto rispecchia
// CloudBackupProviderState prima di aggiungere i campi solo-client (draft,
// connecting, ecc.).
interface RawCloudBackupProvider {
  providerId: string;
  name: string;
  description: string;
  enabled: boolean;
  hasCredentials: boolean;
  authenticated: boolean;
  lastBackupAt: string | null;
  passphraseSet?: boolean;
}

/**
 * @param showSettings true quando l'overlay Impostazioni è aperto — usato
 *   per riallineare lo stato ogni volta che l'utente lo riapre (stesso
 *   principio già in uso per gli altri stati di questa tab in App.tsx).
 */
export function useCloudBackupProviders(showSettings: boolean) {
  const [cloudBackupProviders, setCloudBackupProviders] = useState<Record<string, CloudBackupProviderState>>({});

  // v1.1.122-dev.1 — Cloud Backup: stesso ciclo di refresh (boot + ogni
  // apertura di Impostazioni) già usato per gli altri stati di questa
  // tab. Preserva i draft di Client ID/Secret già digitati in questa
  // sessione, stesso principio di apiKeyDraft per l'AI Advisor.
  const refreshCloudBackupProviders = useCallback(() => {
    fetch('/api/cloud-backup/providers')
      .then(r => r.ok ? r.json() : [])
      .then((providers: RawCloudBackupProvider[]) => {
        setCloudBackupProviders(prev => {
          const next: typeof prev = {};
          for (const p of providers) {
            next[p.providerId] = {
              name:              p.name,
              description:       p.description,
              enabled:           p.enabled,
              hasCredentials:    p.hasCredentials,
              authenticated:     p.authenticated,
              lastBackupAt:      p.lastBackupAt,
              clientIdDraft:     prev[p.providerId]?.clientIdDraft ?? '',
              clientSecretDraft: prev[p.providerId]?.clientSecretDraft ?? '',
              passphraseSet:     p.passphraseSet ?? false,
              passphraseDraft:        prev[p.providerId]?.passphraseDraft ?? '',
              passphraseConfirmDraft: prev[p.providerId]?.passphraseConfirmDraft ?? '',
              connecting:        prev[p.providerId]?.connecting ?? false,
              actionStatus:      prev[p.providerId]?.actionStatus ?? null,
              actionRunning:     prev[p.providerId]?.actionRunning ?? null,
            };
          }
          return next;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => { refreshCloudBackupProviders(); }, [refreshCloudBackupProviders]);
  useEffect(() => { if (showSettings) refreshCloudBackupProviders(); }, [showSettings, refreshCloudBackupProviders]);

  // v1.1.122-dev.1 — polling durante il login OAuth: stesso principio di
  // authPolling per gli store store, ma qui il completamento è rilevato
  // controllando authenticated invece di un messaggio testuale, dato che
  // login() ritorna appena il browser è aperto, non a login completato.
  useEffect(() => {
    const connectingId = Object.entries(cloudBackupProviders).find(([, p]) => p.connecting)?.[0];
    if (!connectingId) return;
    const interval = setInterval(async () => {
      const res: RawCloudBackupProvider[] = await fetch('/api/cloud-backup/providers').then(r => r.ok ? r.json() : []).catch(() => []);
      const found = res.find((p) => p.providerId === connectingId);
      if (found?.authenticated) {
        clearInterval(interval);
        refreshCloudBackupProviders();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [cloudBackupProviders, refreshCloudBackupProviders]);

  // v1.1.122-dev.1 — Cloud Backup: stesso principio di saveCloudProvider
  // (AI Advisor) — aggiornamento parziale, un campo omesso preserva
  // quello già salvato (vedi la route server.ts corrispondente).
  const saveCloudBackupProvider = useCallback((id: string, patch: { enabled?: boolean; clientId?: string; clientSecret?: string }) => {
    const state = cloudBackupProviders[id];
    fetch(`/api/cloud-backup/providers/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled:      patch.enabled ?? state?.enabled ?? false,
        clientId:     patch.clientId,
        clientSecret: patch.clientSecret,
      }),
    }).then(() => refreshCloudBackupProviders()).catch(() => {});
  }, [cloudBackupProviders, refreshCloudBackupProviders]);

  /**
   * v3.2.2-dev.2 — inserimento a due campi (passphrase + conferma, per non cifrare con un refuso). Quando i due
   * campi sono compilati e coincidono la passphrase viene inviata al server e le bozze svuotate; se non coincidono
   * resta un messaggio e la bozza del campo appena scritto sostituisce la precedente.
   */
  const commitBackupPassphrase = useCallback((
    id: string,
    field: 'main' | 'confirm',
    value: string,
    messages: { mismatch: string; waitingConfirm: string },
  ) => {
    const cur = cloudBackupProviders[id];
    const main    = field === 'main'    ? value : (cur?.passphraseDraft ?? '');
    const confirm = field === 'confirm' ? value : (cur?.passphraseConfirmDraft ?? '');
    const setDrafts = (m: string, c: string, status: { success: boolean; message: string } | null) =>
      setCloudBackupProviders(prev => ({ ...prev, [id]: { ...prev[id], passphraseDraft: m, passphraseConfirmDraft: c, actionStatus: status } }));
    if (!main || !confirm) {
      setDrafts(main, confirm, value ? { success: true, message: messages.waitingConfirm } : null);
      return;
    }
    if (main !== confirm) {
      setDrafts(main, confirm, { success: false, message: messages.mismatch });
      return;
    }
    fetch('/api/cloud-backup/passphrase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase: main }),
    })
      .then(r => r.json())
      .then((res: { success: boolean; message: string }) => {
        setDrafts('', '', res);
        if (res.success) refreshCloudBackupProviders();
      })
      .catch(e => setDrafts(main, confirm, { success: false, message: String(e) }));
  }, [cloudBackupProviders, refreshCloudBackupProviders]);

  const connectCloudBackupProvider = useCallback((id: string) => {
    setCloudBackupProviders(prev => ({ ...prev, [id]: { ...prev[id], connecting: true } }));
    fetch(`/api/cloud-backup/providers/${id}/login`, { method: 'POST' })
      .then(r => r.json())
      .then((res: { success: boolean; message: string }) => {
        if (!res.success) {
          setCloudBackupProviders(prev => ({ ...prev, [id]: { ...prev[id], connecting: false, actionStatus: res } }));
        }
        // Se success, resta "connecting" — lo spegne il polling in
        // useEffect sopra appena isAuthenticated diventa vero.
      })
      .catch(() => setCloudBackupProviders(prev => ({ ...prev, [id]: { ...prev[id], connecting: false } })));
  }, []);

  const disconnectCloudBackupProvider = useCallback((id: string) => {
    fetch(`/api/cloud-backup/providers/${id}/logout`, { method: 'POST' })
      .then(() => refreshCloudBackupProviders())
      .catch(() => {});
  }, [refreshCloudBackupProviders]);

  const runCloudBackupAction = useCallback((id: string, action: 'backup' | 'restore') => {
    setCloudBackupProviders(prev => ({ ...prev, [id]: { ...prev[id], actionRunning: action, actionStatus: null } }));
    fetch(`/api/cloud-backup/${action}`, { method: 'POST' })
      .then(r => r.json())
      .then((res: { success: boolean; message: string }) => {
        setCloudBackupProviders(prev => ({ ...prev, [id]: { ...prev[id], actionRunning: null, actionStatus: res } }));
        if (res.success) refreshCloudBackupProviders();
      })
      .catch((e) => setCloudBackupProviders(prev => ({ ...prev, [id]: { ...prev[id], actionRunning: null, actionStatus: { success: false, message: String(e) } } })));
  }, [refreshCloudBackupProviders]);

  return {
    cloudBackupProviders,
    // v1.5.10-dev.1 — esposto anche il setter grezzo: il JSX in App.tsx
    // lo chiama direttamente in un punto (toggle attiva/disattiva, per
    // un aggiornamento ottimistico immediato prima della risposta del
    // server) — esporlo mantiene il comportamento identico a prima
    // dell'estrazione, invece di forzare un refactor di quel punto
    // insieme allo spostamento.
    setCloudBackupProviders,
    saveCloudBackupProvider,
    commitBackupPassphrase,
    connectCloudBackupProvider,
    disconnectCloudBackupProvider,
    runCloudBackupAction,
  };
}
