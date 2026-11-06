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

# v2.2.17-dev.1 — stessa correzione di kiosk-launch.sh: `dirname "$0"`
# non segue il symlink /usr/local/bin/x-launcher creato da install.sh,
# risolvendo PROJECT_DIR nel posto sbagliato se invocato tramite quel
# comando invece che con il path reale in /opt/x-launcher.
PROJECT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
LAUNCHER_URL="http://localhost:3000"

# v3.0.2-dev.3 — il demone richiede un token (audit di sicurezza, SECURITY-AUDIT.md). Lo crea al primo
# avvio in ~/.local/share/x-launcher/api-token (0600). xl_curl = curl che lo aggiunge come header
# (passato via -K da un descrittore, non come argomento: non compare in `ps`). Letto a ogni chiamata.
XL_TOKEN_FILE="$HOME/.local/share/x-launcher/api-token"
xl_curl() {
  local t=""
  [ -r "$XL_TOKEN_FILE" ] && t="$(tr -d '[:space:]' < "$XL_TOKEN_FILE" 2>/dev/null)"
  if [ -n "$t" ]; then
    curl -K <(printf 'header = "X-XLauncher-Token: %s"\n' "$t") "$@"
  else
    curl "$@"
  fi
}
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
# v3.0.2-dev.5 (audit punto 8) — xlaunch:// e' registrato per tutto il desktop: QUALUNQUE pagina web puo' tentare
# di aprirlo. L'id finiva dentro una stringa JSON costruita a mano (un URI come xlaunch://x","launchArgsOverride":"..."
# aggiungeva campi al corpo). Ora si accettano solo gli id reali (lettere, cifre, . _ -) e nient'altro.
if ! [[ "$GAME_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$ ]]; then
  echo "[XLAUNCH] Id non valido (ammessi solo lettere, cifre, '.', '_' e '-'): rifiutato." >&2
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
  XLAUNCH_LOG="${XDG_RUNTIME_DIR:-$HOME/.cache}/xlaunch-kiosk.log"   # non in /tmp (percorso prevedibile: symlink attack)
  mkdir -p "$(dirname "$XLAUNCH_LOG")" 2>/dev/null
  X_LAUNCHER_START_HIDDEN=true "$PROJECT_DIR/kiosk-launch.sh" &>"$XLAUNCH_LOG" &

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
    echo "[XLAUNCH] Timeout: il daemon non ha risposto in ${WAIT_TIMEOUT}s. Log: ${XLAUNCH_LOG:-?}" >&2
    exit 1
  fi
  sleep 1
done

# --- Delega il lancio vero e proprio — stesso endpoint del pulsante Play ---
echo "[XLAUNCH] Richiesta lancio: $GAME_ID"
xl_curl -s -X POST "${LAUNCHER_URL}/api/launch" \
  -H "Content-Type: application/json" \
  -d "$(printf '{"id":"%s"}' "$GAME_ID")"
echo ""
