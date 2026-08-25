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

# --- v2.0.41-dev.7 — richiesta utente: rientro da Steam Big Picture.
if curl -sf "${LAUNCHER_URL}/api/status" &>/dev/null && command -v wmctrl &>/dev/null && wmctrl -l 2>/dev/null | grep -q "X-Launcher HTPC"; then
  echo "[KIOSK] Daemon e finestra già attivi — rientro da Steam Big Picture, nessun nuovo avvio."
  curl -s -X POST "${LAUNCHER_URL}/api/system/steam-bigpicture-closed" &>/dev/null
  wmctrl -a "X-Launcher HTPC" 2>/dev/null
  exit 0
fi

# Step 19a (v1.1.80) — FIX: rilevamento DE standard e fallback
DETECTED_DE="${XDG_CURRENT_DESKTOP:-}"
if [ -z "$DETECTED_DE" ]; then
  if   pgrep -x xfwm4              &>/dev/null; then DETECTED_DE="XFCE (rilevato da processo, XDG_CURRENT_DESKTOP assente)" 
  elif pgrep -x marco               &>/dev/null; then DETECTED_DE="MATE (rilevato da processo, XDG_CURRENT_DESKTOP assente)" 
  elif pgrep -x gnome-shell          &>/dev/null; then DETECTED_DE="GNOME (rilevato da processo, XDG_CURRENT_DESKTOP assente)" 
  elif pgrep -x kwin_x11            &>/dev/null; then DETECTED_DE="Plasma (rilevato da processo, XDG_CURRENT_DESKTOP assente)" 
  elif pgrep -x kwin_wayland         &>/dev/null; then DETECTED_DE="Plasma/Wayland (rilevato da processo, XDG_CURRENT_DESKTOP assente)" 
  fi
fi
echo "[KIOSK] Desktop environment rilevato: ${DETECTED_DE:-nessuno}" 

# --- v0.99.26 — Rilevamento sessione X11 dedicata vs sessione sopra un DE esistente ---
if [ -n "$DETECTED_DE" ]; then
  X_LAUNCHER_DEDICATED_SESSION="false" 
else
  X_LAUNCHER_DEDICATED_SESSION="true" 
fi
export X_LAUNCHER_DEDICATED_SESSION
echo "[KIOSK] Sessione dedicata (nessun DE sotto): ${X_LAUNCHER_DEDICATED_SESSION}" 

# --- Avvia il daemon se non è già in ascolto ---
if ! curl -sf "${LAUNCHER_URL}/api/status" &>/dev/null; then
  echo "[KIOSK] Daemon non attivo — avvio como fallback locale (xdash.service non rilevato attivo)." 
  cd "$PROJECT_DIR" 

  if [ ! -f "$PROJECT_DIR/dist/server.cjs" ]; then 
    echo "[KIOSK] dist/server.cjs non trovato. Esegui prima: npm run build" 
    exit 1 
  fi 

  ENV_FILE="$HOME/.local/share/x-launcher/.env" 
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

# --- v0.99.35 — Systray ---
TRAY_VENV="$PROJECT_DIR/.venv-tray"
if [ -x "$TRAY_VENV/bin/python3" ] && [ -f "$PROJECT_DIR/tray.py" ]; then
  if ! pgrep -f "tray.py" &>/dev/null; then
    TRAY_LOG="${XDG_DATA_HOME:-$HOME/.local/share}/x-launcher/tray.log"
    mkdir -p "$(dirname "$TRAY_LOG")"
    "$TRAY_VENV/bin/python3" "$PROJECT_DIR/tray.py" >"$TRAY_LOG" 2>&1 &
    echo "[KIOSK] Systray avviato (PID $!). Log: $TRAY_LOG"
  else
    echo "[KIOSK] Systray già attivo — skip."
  fi
else
  echo "[KIOSK] Systray non configurato (venv .venv-tray assente) — skip."
fi

# --- v0.99.90 — Cursore mouse: unclutter ---
if command -v unclutter &>/dev/null; then
  if ! pgrep -x "unclutter" &>/dev/null; then
    unclutter -idle 3 -root &>/dev/null &
    echo "[KIOSK] unclutter avviato (PID $!)."
  else
    echo "[KIOSK] unclutter già attivo — skip."
  fi
fi

# --- Legge la preferenza displayMode ---
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

setup_firefox_profile() {
  mkdir -p "$FIREFOX_PROFILE_DIR/chrome" 
  cat > "$FIREFOX_PROFILE_DIR/user.js" << 'EOF'
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("browser.tabs.warnOnClose", false);
user_pref("media.autoplay.default", 0);
EOF
  cat > "$FIREFOX_PROFILE_DIR/chrome/userChrome.css" << 'EOF'
#nav-bar, #TabsToolbar, #titlebar { visibility: collapse !important; }
EOF
}

# --- Gestione XFCE (solo sopra sessione DE esistente) ---
XFCE_PANEL_IDS="" 
declare -A XFCE_PANEL_AUTOHIDE_SAVED 
XFWM4_TITLELESS_SAVED="" 

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

maybe_enable_xfce_panel_autohide() {
  if [ "$X_LAUNCHER_DEDICATED_SESSION" = "true" ]; then return; fi 
  if command -v xfconf-query &>/dev/null; then 
    XFCE_PANEL_IDS="$(xfconf-query -c xfce4-panel -p /panels -l 2>/dev/null | grep -oE '/panels/panel-[0-9]+/' | grep -oE '[0-9]+' | sort -un | tr '\n' ' ')" 
    for pid in $XFCE_PANEL_IDS; do 
      current="$(xfconf-query -c xfce4-panel -p "/panels/panel-${pid}/autohide-behavior" 2>/dev/null)" 
      [ -z "$current" ] && current=0 
      XFCE_PANEL_AUTOHIDE_SAVED[$pid]="$current" 
      xfconf-query -c xfce4-panel -p "/panels/panel-${pid}/autohide-behavior" -n -t uint -s 2 2>/dev/null 
    done 
  fi 
}

maybe_enable_xfwm4_titleless() {
  if [ "$X_LAUNCHER_DEDICATED_SESSION" = "true" ]; then return; fi 
  if command -v xfconf-query &>/dev/null; then 
    XFWM4_TITLELESS_SAVED="$(xfconf-query -c xfwm4 -p /general/titleless_maximize 2>/dev/null)" 
    [ -z "$XFWM4_TITLELESS_SAVED" ] && XFWM4_TITLELESS_SAVED="false" 
    xfconf-query -c xfwm4 -p /general/titleless_maximize -s true 2>/dev/null 
    echo "[KIOSK] xfwm4 titleless_maximize impostato a true (era: ${XFWM4_TITLELESS_SAVED})." 
  fi 
}

remove_window_decorations() {
  if [ "$X_LAUNCHER_DEDICATED_SESSION" = "true" ]; then return; fi 
  if ! command -v xprop &>/dev/null; then return; fi 
  local winid="" 
  for _ in $(seq 1 30); do 
    winid="$(wmctrl -l 2>/dev/null | grep "X-Launcher HTPC" | head -1 | awk '{print $1}')" 
    [ -n "$winid" ] && break 
    sleep 0.3 
  done 
  if [ -z "$winid" ]; then return; fi 
  xprop -id "$winid" -f _MOTIF_WM_HINTS 32c -set _MOTIF_WM_HINTS "0x2, 0x0, 0x0, 0x0, 0x0" 2>/dev/null
  wmctrl -i -r "$winid" -b remove,maximized_vert,maximized_horz 2>/dev/null 
  sleep 0.1 
  wmctrl -i -r "$winid" -b add,maximized_vert,maximized_horz 2>/dev/null 
}

focus_dashboard_window() {
  if [ "$X_LAUNCHER_DEDICATED_SESSION" = "true" ]; then return; fi 
  if [ "$X_LAUNCHER_START_HIDDEN" = "true" ]; then return; fi 
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

# CASO 1: SESSIONE DEDICATA (GAMESCOPE O X11 PURO SENZA DESKTOP)
if [ "$X_LAUNCHER_DEDICATED_SESSION" = "true" ]; then
  echo "[KIOSK] Inizializzazione sessione dedicata in modalità Kiosk pura..."

  if [ "$BROWSER_TYPE" = "firefox" ]; then
    FIREFOX_PROFILE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/x-launcher/firefox-profile"
    setup_firefox_profile 
    
    # Se richiamato dentro Gamescope esegui con Gamescope, altrimenti esegui liscio per X11 puro
    if command -v gamescope &>/dev/null && [ "$XDG_SESSION_TYPE" = "wayland" ]; then
      exec gamescope -W 1920 -H 1080 -f -e -- \
        "$BROWSER" --no-remote --profile "$FIREFOX_PROFILE_DIR" --private-window --kiosk --new-instance "${LAUNCHER_URL}"
    else
      exec "$BROWSER" --no-remote --profile "$FIREFOX_PROFILE_DIR" --private-window --kiosk --new-instance "${LAUNCHER_URL}"
    fi
  else
    # Avvio Chromium / Google Chrome in modalità Kiosk forzata (--kiosk sostituisce --app)
    if command -v gamescope &>/dev/null && [ "$XDG_SESSION_TYPE" = "wayland" ]; then
      exec gamescope -W 1920 -H 1080 -f -e -- \
