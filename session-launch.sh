#!/usr/bin/env bash
# =============================================================
#  session-launch.sh — Wrapper per la sessione X11 dedicata
#  X-Launcher (vedi x-launcher.desktop, sessione LightDM).
#
#  Non è il punto di ingresso "normale" del progetto — quello
#  resta kiosk-launch.sh, lanciabile sia sopra una sessione XFCE
#  esistente sia da qui. Questo wrapper aggiunge UN SOLO passo
#  preliminare specifico della sessione dedicata: avviare Steam
#  in background, silenziosamente (senza mostrare la sua UI), in
#  modo che sia già pronto a gestire steam://rungameid/<id> nel
#  momento in cui l'utente lancia il primo gioco Steam dalla
#  libreria X-Launcher — senza questo, il primo lancio Steam
#  aprirebbe l'intero client con la sua interfaccia completa,
#  esattamente il tipo di "doppia dashboard sovrapposta" che la
#  sessione dedicata vuole evitare.
#
#  v0.99.32 — Pensato per girare sia da /opt/x-launcher/ (dopo
#  l'installazione globale) sia direttamente dalla cartella di
#  sviluppo del progetto (stesso pattern di auto-rilevamento già
#  usato da kiosk-launch.sh) — nessuna installazione di sistema
#  richiesta per testare questo passo in user-space.
# =============================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- FORZATURA TEMPORANEA DEBUG — v0.99.35, da rimuovere dopo il test ---
# Bypassa la dipendenza da ~/.xprofile o env LightDM (mai verificata
# essere effettivamente nell'ambiente quando questo script parte da
# login reale) — scrive SEMPRE il log diagnostico per questo singolo
# test. RIMUOVERE questa riga una volta isolata la causa del problema
# v0.99.26, per non lasciare un log permanente in produzione.
X_LAUNCHER_SESSION_DEBUG=true

# --- Log diagnostico opzionale (v0.99.33) — disattivato di default ---
#
# Utile per riprendere il debug della sessione LightDM (vedi changelog
# v0.99.32/roadmap, sezione "diagnosi: la sessione X11 dedicata non si
# avvia" — causa non isolata con certezza al termine della sessione di
# lavoro). Attivabile esportando X_LAUNCHER_SESSION_DEBUG=true prima di
# selezionare la sessione, es. in un file ~/.xprofile o equivalente che
# LightDM esegua prima di lanciare la sessione stessa — fuori scope
# automatizzarlo qui, dato che il punto esatto da cui LightDM esegue questo
# script è proprio ciò che non è stato ancora determinato con certezza.
if [ "$X_LAUNCHER_SESSION_DEBUG" = "true" ]; then
  {
    echo "=== session-launch.sh eseguito $(date -Iseconds) ==="
    echo "whoami: $(whoami)"
    echo "USER: ${USER:-non impostata}"
    echo "HOME: ${HOME:-non impostata}"
    echo "DISPLAY: ${DISPLAY:-non impostata}"
    echo "XDG_RUNTIME_DIR: ${XDG_RUNTIME_DIR:-non impostata}"
    echo "XDG_SESSION_TYPE: ${XDG_SESSION_TYPE:-non impostata}"
    echo "PATH: ${PATH:-non impostata}"
    echo "PROJECT_DIR calcolato: ${PROJECT_DIR}"
    echo "argv: $0 $*"
  } >> /tmp/x-launcher-session-debug.log 2>&1
fi

# --- Avvia Steam silenziosamente, se installato e non già attivo ---
#
# -silent: avvia Steam senza mostrare alcuna finestra della UI
# principale (flag documentato, non un workaround) — il client
# resta comunque disponibile come handler di steam:// e per la
# lettura/scrittura dello stato di libreria. Se Steam è già in
# esecuzione (es. avviato da una sessione precedente non chiusa
# correttamente, o lanciato manualmente), non viene duplicato.
if command -v steam &>/dev/null; then
  if ! pgrep -x steam &>/dev/null; then
    echo "[SESSION] Avvio Steam in background (-silent)..."
    steam -silent &>/dev/null &
    # Attende che il processo sia avviato (non necessariamente che la
    # libreria sia completamente sincronizzata — quello avviene comunque
    # in background) prima di procedere, con un timeout di sicurezza.
    for _ in $(seq 1 30); do # ~15s di timeout (30 tentativi × 0.5s)
      if pgrep -x steam &>/dev/null; then
        echo "[SESSION] Steam avviato silenziosamente."
        break
      fi
      sleep 0.5
    done
  else
    echo "[SESSION] Steam già in esecuzione — nessun nuovo avvio necessario."
  fi
else
  echo "[SESSION] Steam non trovato sul sistema — il lancio di giochi Steam dalla libreria non sarà disponibile, ma il resto della Dashboard funziona normalmente."
fi

# --- Procede con l'avvio normale della Dashboard ---
exec "$PROJECT_DIR/kiosk-launch.sh" "$@"
