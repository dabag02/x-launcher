#!/usr/bin/env bash
# =============================================================
#  xlaunch-handler.sh — Handler del protocollo xlaunch:// (Step 19a)
# =============================================================
#
# Registrato a livello di sistema (vedi install-xlaunch-protocol.sh) come
# gestore di x-scheme-handler/xlaunch. Quando un link tipo
# xlaunch://gog-witcher3 viene cliccato (da un browser, uno script
# esterno, un'altra applicazione), il sistema invoca questo script
# passando l'URI intero come primo argomento.
#
# Design deciso insieme all'utente prima di scrivere questo file:
# - l'id incorpora già lo store per costruzione (gog-<slug>,
#   epic-<hex>, steam-<appid>, classic-<slug>-<hash>) — xlaunch://<id> da
#   solo basta, nessun secondo segmento <store> da riconciliare.
# - nessuna logica di lancio duplicata qui: il solo compito di questo
#   script è garantire che daemon+finestra esistano (avviandoli se serve,
#   MA NASCOSTI — mai un lampeggio visibile, per non interferire con un
#   gioco eventualmente già in corso), poi delegare tutto il resto a
#   POST /api/launch, lo stesso endpoint già usato dal pulsante Play
#   della Dashboard.
#
# Uso diretto da terminale per test (senza passare dal sistema):
#   ./xlaunch-handler.sh xlaunch://gog-witcher3

set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCHER_URL="http://localhost:3000"
WINDOW_TITLE="X-Launcher HTPC"
WAIT_TIMEOUT=30

URI="${1:-}"
if [ -z "$URI" ]; then
  echo "[XLAUNCH] Nessun URI ricevuto. Uso: $0 xlaunch://<id>" >&2
  exit 1
fi

# Estrae l'id: tutto ciò che segue "xlaunch://", meno un eventuale slash
# finale — coerente con come i browser normalizzano gli URI custom scheme
# (a volte aggiungono una "/" di trailing che non fa parte dell'id vero).
GAME_ID="${URI#xlaunch://}"
GAME_ID="${GAME_ID%/}"
if [ -z "$GAME_ID" ]; then
  echo "[XLAUNCH] URI malformato, nessun id estratto da: $URI" >&2
  exit 1
fi
echo "[XLAUNCH] Richiesta lancio per id: $GAME_ID"

daemon_up() {
  curl -sf "${LAUNCHER_URL}/api/status" &>/dev/null
}

window_up() {
  command -v wmctrl &>/dev/null && wmctrl -l 2>/dev/null | grep -q "$WINDOW_TITLE"
}

# --- La finestra serve? (daemon spento ⇒ di sicuro; daemon acceso ⇒
#     dipende se una finestra è già aperta da una sessione precedente) ---
NEEDS_WINDOW="false"
if ! daemon_up; then
  NEEDS_WINDOW="true"
elif ! window_up; then
  NEEDS_WINDOW="true"
fi

if [ "$NEEDS_WINDOW" = "true" ]; then
  echo "[XLAUNCH] Nessuna finestra Dashboard attiva — avvio nascosto in background."
  # X_LAUNCHER_START_HIDDEN=true: kiosk-launch.sh salta il richiamo in
  # primo piano e la gestione pannelli XFCE (vedi i due guard aggiunti lì
  # per questo stesso motivo) — la finestra, una volta comparsa, viene
  # nascosta qui sotto PRIMA che l'utente possa vederla, non dopo.
  X_LAUNCHER_START_HIDDEN=true "$PROJECT_DIR/kiosk-launch.sh" &>/tmp/xlaunch-kiosk.log &

  echo "[XLAUNCH] Attendo la comparsa della finestra per nasconderla..."
  for i in $(seq 1 $WAIT_TIMEOUT); do
    if window_up; then
      wmctrl -r "$WINDOW_TITLE" -b add,hidden 2>/dev/null
      echo "[XLAUNCH] Finestra nascosta (${i}s)."
      break
    fi
    sleep 0.3
  done
fi

# --- Attende che il daemon risponda (potrebbe essere ancora in bootstrap
#     anche se la finestra è già comparsa — sono processi indipendenti) ---
echo "[XLAUNCH] Attendo il daemon su ${LAUNCHER_URL}..."
for i in $(seq 1 $WAIT_TIMEOUT); do
  if daemon_up; then
    echo "[XLAUNCH] Daemon pronto (${i}s)."
    break
  fi
  if [ "$i" -eq "$WAIT_TIMEOUT" ]; then
    echo "[XLAUNCH] Timeout: il daemon non ha risposto in ${WAIT_TIMEOUT}s. Log: /tmp/xlaunch-kiosk.log" >&2
    exit 1
  fi
  sleep 1
done

# --- Delega il lancio vero e proprio — stesso endpoint del pulsante Play ---
echo "[XLAUNCH] Richiesta lancio: $GAME_ID"
curl -s -X POST "${LAUNCHER_URL}/api/launch" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"${GAME_ID}\"}"
echo ""
