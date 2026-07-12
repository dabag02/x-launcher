#!/usr/bin/env bash
# =============================================================
#  kiosk-launch.sh — Avvia X-Launcher in modalità Big Picture
# =============================================================

LAUNCHER_URL="http://localhost:3000"
WAIT_TIMEOUT=30
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- v0.99.30 — Opzione --always-on-top (default: disattivata) ---
X_LAUNCHER_ALWAYS_ON_TOP="false"
for arg in "$@"; do
  case "$arg" in
    --always-on-top) X_LAUNCHER_ALWAYS_ON_TOP="true" ;;
  esac
done
echo "[KIOSK] Always-on-top: ${X_LAUNCHER_ALWAYS_ON_TOP}" 

# --- v0.99.26 — Rilevamento sessione X11 dedicata vs sessione sopra XFCE ---
if pgrep -x xfwm4 &>/dev/null; then
  X_LAUNCHER_DEDICATED_SESSION="false" 
else
  X_LAUNCHER_DEDICATED_SESSION="true" 
fi
export X_LAUNCHER_DEDICATED_SESSION
echo "[KIOSK] Sessione dedicata (nessun DE sotto): ${X_LAUNCHER_DEDICATED_SESSION}" 

# --- Avvia il daemon se non è già in ascolto ---
# Nota v0.99.35: se xdash.service è installato e attivo
# (systemctl status xdash), questo blocco non dovrebbe mai
# eseguire — il daemon è già su dal boot. Se vedi il messaggio
# sotto in un sistema con xdash.service installato, vuol dire
# che il servizio non è partito correttamente: controlla
# `systemctl status xdash` / `journalctl -u xdash` PRIMA di
# indagare altrove, invece di considerarlo un avvio normale.
if ! curl -sf "${LAUNCHER_URL}/api/status" &>/dev/null; then
  echo "[KIOSK] Daemon non attivo — avvio come fallback locale (xdash.service non rilevato attivo)." 
  cd "$PROJECT_DIR" 

  if [ ! -f "$PROJECT_DIR/dist/server.cjs" ]; then 
    echo "[KIOSK] dist/server.cjs non trovato. Esegui prima: npm run build" 
    exit 1 
  fi 

  ENV_FILE="$PROJECT_DIR/.env" 
  if [ -f "$ENV_FILE" ]; then 
    NODE_ENV=production node --env-file="$ENV_FILE" dist/server.cjs & 
  else
    NODE_ENV=production node dist/server.cjs & 
  fi 
  DAEMON_PID=$! 
  echo "[KIOSK] Daemon avviato (PID $DAEMON_PID)" 
fi

# --- Aspetta che il daemon risponda ---
echo "[KIOSK] Attendo X-Launcher su ${LAUNCHER_URL}..." 
for i in $(seq 1 $WAIT_TIMEOUT); do 
  if curl -sf "${LAUNCHER_URL}/api/status" &>/dev/null; then 
    echo "[KIOSK] Daemon pronto (${i}s)." 
    break 
  fi 
  if [ "$i" -eq "$WAIT_TIMEOUT" ]; then 
    echo "[KIOSK] Timeout: il daemon non ha risposto in ${WAIT_TIMEOUT}s. Controlla i log." 
    exit 1 
  fi 
  sleep 1 
done 

# --- v0.99.35 — Systray (minimizza/ripristina dashboard durante il
# gioco, vedi tray.py per il dettaglio). Lanciato solo se il venv
# dedicato esiste (creato manualmente seguendo le istruzioni — non
# blocca l'avvio della dashboard se manca, è una feature accessoria).
TRAY_VENV="$PROJECT_DIR/.venv-tray"
if [ -x "$TRAY_VENV/bin/python3" ] && [ -f "$PROJECT_DIR/tray.py" ]; then
  if ! pgrep -f "tray.py" &>/dev/null; then
    "$TRAY_VENV/bin/python3" "$PROJECT_DIR/tray.py" &>/dev/null &
    echo "[KIOSK] Systray avviato (PID $!)."
  else
    echo "[KIOSK] Systray già attivo — skip."
  fi
else
  echo "[KIOSK] Systray non configurato (venv .venv-tray assente) — skip."
fi

# --- v0.99.90 — Cursore mouse: unclutter (X11), non JavaScript.
# Il meccanismo lato browser (App.tsx, timer di inattività mouse) resta
# come fallback, ma Chromium rallenta pesantemente i timer JS nelle
# finestre senza focus di sistema — senza un click che dia focus almeno
# una volta, quel timer può restare sospeso indefinitamente (limite del
# browser, non risolvibile da JS). unclutter gira a livello X11,
# indipendente da focus/Chromium, esattamente come wmctrl per la systray
# poco sopra — stesso principio, stesso motivo.
if command -v unclutter &>/dev/null; then
  if ! pgrep -x "unclutter" &>/dev/null; then
    unclutter -idle 3 -root &>/dev/null &
    echo "[KIOSK] unclutter avviato (nasconde il cursore dopo 3s di inattività, PID $!)."
  else
    echo "[KIOSK] unclutter già attivo — skip."
  fi
else
  echo "[KIOSK] unclutter non installato — cursore gestito solo dal fallback JS (attivo solo dopo il primo focus). Installa 'unclutter-xfixes' per la copertura completa indipendente dal focus."
fi

# --- Legge la preferenza displayMode persistita ---
APP_CONF="$HOME/.local/share/x-launcher/app.conf" 
DISPLAY_MODE="kiosk" 
if [ -f "$APP_CONF" ]; then 
  DM_VALUE="$(grep -m1 '^displayMode=' "$APP_CONF" | cut -d'=' -f2 | tr -d '[:space:]')" 
  if [ "$DM_VALUE" = "window" ] || [ "$DM_VALUE" = "borderless" ] || [ "$DM_VALUE" = "kiosk" ]; then 
    DISPLAY_MODE="$DM_VALUE" 
  else 
    FS_VALUE="$(grep -m1 '^fullscreen=' "$APP_CONF" | cut -d'=' -f2 | tr -d '[:space:]')" 
    if [ "$FS_VALUE" = "false" ]; then 
      DISPLAY_MODE="window" 
    fi 
  fi 
fi 
echo "[KIOSK] Modalità display: ${DISPLAY_MODE}" 

# --- Rileva il browser disponibile ---
FORCED_BROWSER="$1" 
if [ -n "$FORCED_BROWSER" ]; then 
  if ! command -v "$FORCED_BROWSER" &>/dev/null; then 
    echo "[KIOSK] Browser '$FORCED_BROWSER' non trovato nel PATH." 
    exit 1 
  fi 
  BROWSER="$FORCED_BROWSER" 
  case "$BROWSER" in 
    firefox*) BROWSER_TYPE="firefox"  ;; 
    *)        BROWSER_TYPE="chromium" ;; 
  esac 
elif command -v chromium &>/dev/null; then 
  BROWSER_TYPE="chromium" 
  BROWSER="chromium" 
elif command -v google-chrome &>/dev/null; then 
  BROWSER_TYPE="chromium" 
  BROWSER="google-chrome" 
elif command -v firefox &>/dev/null; then 
  BROWSER_TYPE="firefox" 
  BROWSER="firefox" 
else 
  echo "[KIOSK] Nessun browser trovato." 
  exit 1 
fi

# --- Gestione XFCE (solo sopra sessione DE esistente) ---
XFCE_PANEL_IDS="" 
declare -A XFCE_PANEL_AUTOHIDE_SAVED 

restore_xfce_panels() {
  for pid in $XFCE_PANEL_IDS; do 
    saved="${XFCE_PANEL_AUTOHIDE_SAVED[$pid]}" 
    if [ -n "$saved" ]; then 
      xfconf-query -c xfce4-panel -p "/panels/panel-${pid}/autohide-behavior" -n -t uint -s "$saved" 2>/dev/null 
    fi 
  done 
}

restore_xfwm4_titleless() {
  if [ -n "$XFWM4_TITLELESS_SAVED" ]; then 
    xfconf-query -c xfwm4 -p /general/titleless_maximize -s "$XFWM4_TITLELESS_SAVED" 2>/dev/null 
  fi 
  restore_xfce_panels 
}
trap restore_xfwm4_titleless EXIT 

maybe_enable_xfwm4_titleless() {
  if [ "$X_LAUNCHER_DEDICATED_SESSION" = "true" ]; then return; fi 
  if command -v xfconf-query &>/dev/null; then 
    XFWM4_TITLELESS_SAVED="$(xfconf-query -c xfwm4 -p /general/titleless_maximize 2>/dev/null)" 
    [ -z "$XFWM4_TITLELESS_SAVED" ] && XFWM4_TITLELESS_SAVED="false" 
    xfconf-query -c xfwm4 -p /general/titleless_maximize -s true 2>/dev/null 

    XFCE_PANEL_IDS="$(xfconf-query -c xfce4-panel -p /panels -l 2>/dev/null | grep -oE '/panels/panel-[0-9]+/' | grep -oE '[0-9]+' | sort -un | tr '\n' ' ')" 
    for pid in $XFCE_PANEL_IDS; do 
      current="$(xfconf-query -c xfce4-panel -p "/panels/panel-${pid}/autohide-behavior" 2>/dev/null)" 
      [ -z "$current" ] && current=0 
      XFCE_PANEL_AUTOHIDE_SAVED[$pid]="$current" 
      xfconf-query -c xfce4-panel -p "/panels/panel-${pid}/autohide-behavior" -n -t uint -s 2 2>/dev/null 
    done 
  fi 
}

focus_dashboard_window() {
  if [ "$X_LAUNCHER_DEDICATED_SESSION" = "true" ]; then return; fi 
  if command -v wmctrl &>/dev/null; then 
    sleep 1 
    for _ in $(seq 1 10); do 
      wmctrl -a "X-Launcher HTPC" 2>/dev/null 
      if [ "$X_LAUNCHER_ALWAYS_ON_TOP" = "true" ]; then 
        wmctrl -r "X-Launcher HTPC" -b add,above 2>/dev/null 
      fi 
      sleep 0.3 
    done 
  fi 
}

# --- ESECUZIONE AVVIO ---

# CASO 1: SESSIONE DEDICATA CON GAMESCOPE
if [ "$X_LAUNCHER_DEDICATED_SESSION" = "true" ]; then
  if ! command -v gamescope &>/dev/null; then
    echo "[KIOSK] ERRORE: Gamescope non è installato! Impossibile avviare la sessione dedicata."
    exit 1
  fi

  echo "[KIOSK] Avvio di X-Launcher in sessione dedicata tramite Gamescope..."
  
  if [ "$BROWSER_TYPE" = "firefox" ]; then
    # Avvio Firefox in Gamescope (-W / -H definiscono la ris virtuale, -f forza il fullscreen)
    exec gamescope -W 1920 -H 1080 -f -e -- \
      "$BROWSER" --private-window --new-instance "${LAUNCHER_URL}" 
  else
    # Avvio Chromium in Gamescope
    exec gamescope -W 1920 -H 1080 -f -e -- \
      "$BROWSER" \
        --app="${LAUNCHER_URL}" \
        --noerrdialogs \
        --disable-infobars \
        --no-first-run \
        --disable-translate \
        --autoplay-policy=no-user-gesture-required \
        --enable-gamepad-buttons-as-keys \
        --disable-features=VaapiVideoDecoder \
        --disable-background-networking \
        --log-level=3 2>/dev/null 
  fi

# CASO 2: AVVIO SOPRA UN DESKTOP ENVIRONMENT ESISTENTE (Esempio: XFCE)
else
  if [ "$BROWSER_TYPE" = "firefox" ]; then 
    "$BROWSER" --private-window --new-instance "${LAUNCHER_URL}" & 
    BROWSER_PID=$! 
    focus_dashboard_window & 
    wait "$BROWSER_PID" 
  else 
    if [ "$DISPLAY_MODE" = "kiosk" ] || [ "$DISPLAY_MODE" = "borderless" ]; then 
      maybe_enable_xfwm4_titleless 
      "$BROWSER" \
        --app="${LAUNCHER_URL}" \
        --start-maximized \
        --use-system-title-bar \
        --noerrdialogs \
        --disable-infobars \
        --no-first-run \
        --disable-translate \
        --autoplay-policy=no-user-gesture-required \
        --enable-gamepad-buttons-as-keys \
        --disable-features=VaapiVideoDecoder \
        --disable-background-networking \
        --log-level=3 2>/dev/null & 
      BROWSER_PID=$! 
      focus_dashboard_window & 
      wait "$BROWSER_PID" 
    else 
      "$BROWSER" \
        --app="${LAUNCHER_URL}" \
        --window-size=1280,800 \
        --window-position=100,100 \
        --noerrdialogs \
        --disable-infobars \
        --no-first-run \
        --disable-translate \
        --autoplay-policy=no-user-gesture-required \
        --enable-gamepad-buttons-as-keys \
        --disable-features=VaapiVideoDecoder \
        --disable-background-networking \
        --log-level=3 2>/dev/null & 
      BROWSER_PID=$! 
      focus_dashboard_window & 
      wait "$BROWSER_PID" 
    fi 
  fi 
fi