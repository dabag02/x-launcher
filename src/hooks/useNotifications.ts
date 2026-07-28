// useNotifications — hook React che isola stato e logica delle notifiche
// (pannello Notifiche), estratto da App.tsx come secondo passo di
// modularizzazione (v1.5.11-dev.1), sullo stesso modello di
// useCloudBackupProviders.
//
// Il canale SSE (EventSource('/api/events')) RESTA in App.tsx: gestisce
// anche altri tipi di evento (es. library-updated) non legati alle
// notifiche, quindi non è un'estrazione a rischio pressoché nullo come
// il resto di questo hook — mescolarlo avrebbe voluto dire toccare
// concetti che non c'entrano con le notifiche. Il ramo `event ===
// 'notification'` di quel canale continua a chiamare `setNotifications`
// (esposto qui, grezzo, per questo esatto motivo) esattamente come
// prima dell'estrazione.
//
// Nessun id di Focusable/neighbors/sequentialChain qui dentro — solo
// stato, fetch e funzioni di supporto. Il JSX (pannello notifiche,
// pulsante footer) resta in App.tsx invariato.
import { useState, useEffect } from 'react';
import { AppNotification } from '../types';

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Carica notifiche persistenti dal backend al boot
  useEffect(() => {
    fetch('/api/notifications/pending')
      .then(r => r.ok ? r.json() : [])
      .then((stored: any[]) => {
        if (!Array.isArray(stored) || stored.length === 0) return;
        const mapped = stored.map((n: any): AppNotification => ({
          id:             n.id,
          type:           n.type,
          status:         n.status,
          title:          n.title,
          body:           n.body,
          gameId:         n.game_id,
          gameTitle:      n.game_title,
          rawLog:         n.raw_log,
          primaryAction:  n.primary_action   ? JSON.parse(n.primary_action)   : undefined,
          secondaryAction:n.secondary_action ? JSON.parse(n.secondary_action) : undefined,
          source:         n.source,
          aiProvider:     n.ai_provider,
          confidence:     n.confidence,
          timestamp:      n.created_at,
        }));
        setNotifications(mapped);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Notification helpers (Step 15a) ─────────────────────────────────────
  const pushNotification = (n: Omit<AppNotification, 'id' | 'timestamp' | 'status'>) => {
    const notif: AppNotification = {
      ...n,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      status: 'pending',
      seen: n.seen ?? false,
    };
    // v1.1.29 — su richiesta: una nuova notifica per lo STESSO gioco con
    // lo STESSO titolo (es. "X installato" ripetuto da test/reinstalli
    // successivi) sostituisce quella precedente ancora aperta invece di
    // affiancarsi — non è un problema di processo che duplica, sono
    // eventi genuinamente distinti nel tempo, ma impilarli tutti quando
    // nessuno si auto-chiude più (fix v1.1.28) diventa rumore inutile.
    // Il confronto è per gameId+title esatto, non solo type: due
    // notifiche 'success' diverse per lo stesso gioco (es. "installato"
    // e, in futuro, "achievement sbloccato") restano entrambe distinte.
    setNotifications(prev => [
      notif,
      ...prev.filter(p => !(p.gameId && p.gameId === notif.gameId && p.title === notif.title && p.status === 'pending')),
    ]);
    // v1.1.28 — rimosso 'success' da qui: un'installazione completata
    // (tipo 'success') è un esito significativo, non un avviso
    // transitorio come "modalità Kiosk attivata" — auto-scomparire dopo
    // soli 6 secondi la faceva trovare già "dismissed" (niente pulsante
    // di chiusura, titolo che ha già finito di scorrere una volta sola)
    // a chi apre il pannello notifiche anche solo un po' più tardi.
    // 'info' resta con auto-dismiss: quello copre avvisi genuinamente
    // transitori (toggle modalità, passaggio a desktop, ecc.).
    if (n.type === 'info') {
      setTimeout(() => {
        setNotifications(prev =>
          prev.map(p => p.id === notif.id && p.status === 'pending' ? { ...p, status: 'dismissed' } : p)
        );
      }, 6000);
    }
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'dismissed' } : n));
    fetch(`/api/notifications/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    }).catch(() => {});
  };

  const resolveNotification = (id: string, resolved: boolean) => {
    const status = resolved ? 'resolved' : 'failed';
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status } : n));
    // Persisti stato notifica
    fetch(`/api/notifications/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => {});
    // KB writeback: aggiorna score in base all'esito
    const notif = notifications.find(n => n.id === id);
    if (notif && (notif.source === 'kb' || notif.source === 'ai')) {
      if (resolved) {
        fetch('/api/kb/writeback/resolved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pattern:      notif.rawLog ?? notif.title,
            solution:     notif.body,
            actionType:   notif.primaryAction?.handler ?? 'none',
            actionParams: notif.primaryAction?.params ?? {},
            confidence:   notif.confidence ?? 'medium',
            existingId:   notif.source === 'kb' ? id : undefined,
          }),
        }).catch(() => {});
      } else {
        fetch('/api/kb/writeback/failed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        }).catch(() => {});
      }
    }
    // v0.99.38 — test protocol: notifica "ha funzionato?" post-chiusura
    // (vedi notificationEngine.ts, 'validation-prompt'). Solo il caso
    // "Ha funzionato" richiede un'azione qui — marca il gioco verificato
    // con la config attuale. "Non ha funzionato" non richiede nulla:
    // il gioco resta verified=false, quindi la prossima chiusura
    // riproporrà la domanda automaticamente (vedi gameManager.ts,
    // startGameExitPolling), senza bisogno di ricordarselo qui.
    if (notif && notif.source === 'validation' && resolved && notif.gameId) {
      fetch(`/api/games/${notif.gameId}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'manual' }),
      }).catch(() => {});
    }

    // v0.99.90 — Step 15d: registra il tentativo AI fallito nel tracker
    // dedicato (game_id+error_signature), distinto dal writeback KB sopra
    // che riguarda solo lo scoring della Knowledge Base. Solo sul ramo
    // KO: un successo non ha bisogno di essere "contato" verso il limite
    // di MAX_AI_ATTEMPTS, il limite riguarda i tentativi che falliscono.
    if (notif && notif.source === 'ai' && !resolved && notif.gameId && notif.rawLog) {
      fetch('/api/ai/attempt-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId:       notif.gameId,
          errorText:    notif.rawLog,
          solution:     notif.body,
          actionType:   notif.primaryAction?.handler ?? 'none',
          actionParams: notif.primaryAction?.params ?? {},
          confidence:   notif.confidence ?? 'low',
        }),
      }).catch(() => {});
    }
  };

  const unreadCount = notifications.filter(n => n.seen === false).length;

  return {
    notifications,
    setNotifications,
    pushNotification,
    dismissNotification,
    resolveNotification,
    unreadCount,
  };
}
