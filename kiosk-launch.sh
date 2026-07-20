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

# Step 19a (v1.1.80) — FIX: il rilevamento precedente controllava SOLO
# `pgrep -x xfwm4` per decidere "sessione dedicata sì/no" — su MATE/
# GNOME/Plasma quel processo non esiste mai, quindi lo script avrebbe
# concluso "nessun DE sotto" per errore e tentato di partire in sessione
# dedicata via Gamescope, esattamente l'opposto dell'obiettivo di
# installazione entro un desktop esistente su questi tre desktop.
# $XDG_CURRENT_DESKTOP è lo standard moderno, impostato dalla sessione
# stessa (non da un singolo processo WM da indovinare) su XFCE/GNOME/
# KDE/MATE — usato qui con un fallback via pgrep sui processi WM noti
# solo per il caso limite in cui la variabile non sia impostata (sessioni
# minimali/non standard).
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
    # v1.1.71 — segnalato dall'utente: &>/dev/null qui buttava via
    # QUALUNQUE traceback o messaggio diagnostico da tray.py, rendendo
    # impossibile capire perché l'icona non comparisse in systray dopo
    # v1.1.68/70 — si andava alla cieca per davvero, non per mancanza di
    # log da parte di tray.py (che ne stampa parecchi), ma perché
    # finivano tutti su /dev/null. File di log persistente invece —
    # sovrascritto ad ogni avvio (>​ non >>), così non cresce
    # indefinitamente e mostra sempre solo l'ultima sessione.
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

# v1.1.83 — segnalato dall'utente: anche dopo il fix del profilo (v1.1.82),
# Firefox si avviava con barra degli indirizzi e tab visibili. A
# differenza di Chromium (--app=<url> nasconde tutto da solo), Firefox
# nelle versioni moderni non ha un flag CLI equivalente — verificato con
# una ricerca reale, non indovinato: l'unica via documentata è
# userChrome.css, un foglio di stile che personalizza l'interfaccia di
# Firefox stessa (va abilitato con la preferenza
# toolkit.legacyUserProfileCustomizations.stylesheets, altrimenti
# ignorato). Avendo già un profilo dedicato (v1.1.82), è il posto giusto
# per prepararlo — scritto ad ogni avvio (idempotente, stesso contenuto
# ogni volta, non fa danno riscriverlo). #titlebar nella regola CSS
# nasconde la titlebar DISEGNATA DA FIREFOX STESSO (un elemento interno
# alla sua UI, indipendente dalla decorazione del window manager rimossa
# altrove da remove_window_decorations/maybe_enable_xfwm4_titleless) —
# le due cose sono strati diversi, entrambi vanno spenti perché la
# finestra risulti davvero senza bordi.
#
# v1.1.85 — segnalato dall'utente: i suoni dell'interfaccia non si
# sentivano in Firefox (funzionano in Chromium, che ha il flag
# --autoplay-policy=no-user-gesture-required già nel comando di lancio
# più sotto — nessun equivalente CLI esiste per Firefox). Causa: la
# policy di autoplay di Firefox blocca l'audio finché non rileva un vero
# "user gesture" — e un pulsante del controller, a differenza di un
# click o una pressione da tastiera, non sempre viene contato come tale.
# Verificato con una ricerca reale la preferenza corretta e il suo
# valore attuale (non indovinato): media.autoplay.default = 0 significa
# "consentito", stesso effetto pratico del flag già usato per Chromium.
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

# Estetica XFCE-only, separata dalla rimozione decorazioni: mettere i
# pannelli in autohide mentre la Dashboard è a schermo intero. Su MATE/
# GNOME/Plasma xfconf-query non esiste, guardia già presente, non fa
# nulla lì: nessuna perdita di funzionalità core per quei desktop.
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

# Step 19a (v1.1.81) — REPRISTINO parziale dopo un test reale su XFCE:
# il meccanismo universale _MOTIF_WM_HINTS di v1.1.80 non ha risolto il
# problema nemmeno su XFCE, dove il vecchio trucco xfwm4-specifico era
# invece CONFERMATO funzionante prima di questa rewrite. Segnalato
# dall'utente, che ha suggerito esattamente questo: dispatch per-DE
# invece di un solo meccanismo universale. Ripristinato qui il vecchio
# meccanismo PROVATO per XFCE specificamente (config globale, va
# impostata PRIMA di lanciare il browser — a differenza del tentativo
# Motif, che resta comunque attivo DOPO come livello aggiuntivo per
# tutti i desktop, XFCE incluso, ora con diagnostica reale invece di
# tentare alla cieca una seconda volta — vedi remove_window_decorations
# più sotto).
maybe_enable_xfwm4_titleless() {
  if [ "$X_LAUNCHER_DEDICATED_SESSION" = "true" ]; then return; fi 
  if command -v xfconf-query &>/dev/null; then 
    XFWM4_TITLELESS_SAVED="$(xfconf-query -c xfwm4 -p /general/titleless_maximize 2>/dev/null)" 
    [ -z "$XFWM4_TITLELESS_SAVED" ] && XFWM4_TITLELESS_SAVED="false" 
    xfconf-query -c xfwm4 -p /general/titleless_maximize -s true 2>/dev/null 
    echo "[KIOSK] xfwm4 titleless_maximize impostato a true (era: ${XFWM4_TITLELESS_SAVED})." 
  fi 
}

# Step 19a (v1.1.80/81) — meccanismo universale _MOTIF_WM_HINTS, tenuto
# come livello aggiuntivo per tutti i desktop (incluso XFCE, dove ora
# gira DOPO che maybe_enable_xfwm4_titleless ha già fatto il lavoro
# principale — non dovrebbe interferire, nel peggiore dei casi è
# ridondante). Su MATE/GNOME/Plasma resta l'unico meccanismo disponibile
# per ora, non essendoci ancora un trucco per-DE provato per quei tre.
#
# v1.1.81 — AGGIUNTA DIAGNOSTICA REALE, richiesta implicitamente
# dall'esito del test dell'utente: prima si limitava a tentare in
# silenzio. Ora logga esplicitamente id finestra trovato, se xprop è
# andato a buon fine, e rilegge la proprietà subito dopo averla
# impostata per confermare che sia stata scritta davvero — stessa
# lezione della saga tray (v1.1.71): un secondo tentativo alla cieca
# senza dati concreti non avrebbe senso.
remove_window_decorations() {
  if [ "$X_LAUNCHER_DEDICATED_SESSION" = "true" ]; then return; fi 
  if ! command -v xprop &>/dev/null; then 
    echo "[KIOSK] xprop non trovato — _MOTIF_WM_HINTS non applicato (xfwm4 titleless_maximize resta comunque attivo su XFCE)." 
    echo "[KIOSK]   Installa: xorg-xprop (Arch) / x11-utils (Debian/Ubuntu) / xorg-x11-utils (Fedora)." 
    return 
  fi 
  local winid="" 
  for _ in $(seq 1 30); do 
    winid="$(wmctrl -l 2>/dev/null | grep "X-Launcher HTPC" | head -1 | awk '{print $1}')" 
    [ -n "$winid" ] && break 
    sleep 0.3 
  done 
  if [ -z "$winid" ]; then 
    echo "[KIOSK] [_MOTIF_WM_HINTS] finestra non trovata entro il timeout — decorazioni non rimosse da questo meccanismo." 
    return 
  fi 
  echo "[KIOSK] [_MOTIF_WM_HINTS] finestra trovata: $winid" 
  # flags=0x2 (MWM_HINTS_DECORATIONS), decorations=0x0 (nessuna) — vedi
  # commento esteso sopra la funzione per le fonti.
  if xprop -id "$winid" -f _MOTIF_WM_HINTS 32c -set _MOTIF_WM_HINTS "0x2, 0x0, 0x0, 0x0, 0x0" 2>&1; then 
    echo "[KIOSK] [_MOTIF_WM_HINTS] xprop -set eseguito senza errori." 
  else
    echo "[KIOSK] [_MOTIF_WM_HINTS] xprop -set ha restituito un errore (vedi sopra)." 
  fi 
  # Rilettura immediata — conferma se il WM ha davvero accettato la
  # proprietà, o se l'ha ignorata/sovrascritta subito.
  echo "[KIOSK] [_MOTIF_WM_HINTS] valore riletto dopo il set: $(xprop -id "$winid" _MOTIF_WM_HINTS 2>&1)" 
  # Doppio toggle maximize: forza alcuni WM a ridisegnare la finestra
  # tenendo conto dell'hint appena impostato, invece di ignorarlo perché
  # applicato dopo il primo map.
  wmctrl -i -r "$winid" -b remove,maximized_vert,maximized_horz 2>/dev/null 
  sleep 0.1 
  wmctrl -i -r "$winid" -b add,maximized_vert,maximized_horz 2>/dev/null 
  echo "[KIOSK] [_MOTIF_WM_HINTS] toggle maximize completato." 
}

focus_dashboard_window() {
  if [ "$X_LAUNCHER_DEDICATED_SESSION" = "true" ]; then return; fi 
  # Step 19a (v1.1.69) — xlaunch://: quando la Dashboard viene avviata solo
  # per servire un lancio esterno, deve restare nascosta (vedi
  # xlaunch-handler.sh, che la nasconde subito dopo l'apertura) — questo
  # richiamo in primo piano andrebbe altrimenti in corsa diretta con
  # quell'hide, vincendo o perdendo a seconda del timing. Un solo punto di
  # guardia qui, invece di avvolgere le tre chiamate a questa funzione più
  # sotto: più semplice da mantenere, stesso effetto.
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

# CASO 1: SESSIONE DEDICATA CON GAMESCOPE
if [ "$X_LAUNCHER_DEDICATED_SESSION" = "true" ]; then
  if ! command -v gamescope &>/dev/null; then
    echo "[KIOSK] ERRORE: Gamescope non è installato! Impossibile avviare la sessione dedicata."
    exit 1
  fi

  echo "[KIOSK] Avvio di X-Launcher in sessione dedicata tramite Gamescope..."
  
  if [ "$BROWSER_TYPE" = "firefox" ]; then
    # v1.1.81 — FIX segnalato dall'utente: --new-instance da solo non
    # basta su Linux a garantire un'istanza davvero separata — se un
    # altro Firefox era già in esecuzione (es. quello usato per navigare
    # normalmente), la Dashboard si apriva come una SCHEDA in quella
    # finestra esistente invece che in una propria, arrivando persino a
    # comparire affiancata ad altre schede aperte. Verificato con una
    # ricerca reale (bug Mozilla #855899 e documentazione ufficiale):
    # -new-instance non disattiva il meccanismo di "remote" di Firefox,
    # -no-remote sì — combinato con un profilo dedicato (altrimenti
    # Firefox rifiuta comunque di aprire due istanze sullo stesso
    # profilo).
    #
    # v1.1.82 — FIX: la documentazione Mozilla dice che --profile crea
    # la cartella da solo se assente, ma un report reale (Mozilla
    # Support, stesso identico errore "Profile cannot be loaded... may
    # be missing or inaccessible" segnalato dall'utente) mostra che in
    # pratica questo non è affidabile per un percorso annidato non
    # ancora esistente — funzionava solo quando la cartella era già
    # stata creata in anticipo. `mkdir -p` esplicita invece di fidarsi
    # del comportamento di auto-creazione di Firefox, stesso pattern già
    # usato altrove in questo file per il log della tray.
    FIREFOX_PROFILE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/x-launcher/firefox-profile"
    setup_firefox_profile 
    exec gamescope -W 1920 -H 1080 -f -e -- \
      "$BROWSER" --no-remote --profile "$FIREFOX_PROFILE_DIR" --private-window --new-instance "${LAUNCHER_URL}" 
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

# CASO 2: AVVIO SOPRA UN DESKTOP ENVIRONMENT ESISTENTE (XFCE/MATE/GNOME/Plasma)
else
  if [ "$BROWSER_TYPE" = "firefox" ]; then 
    # v1.1.81 — stesso fix del ramo Gamescope sopra: -no-remote + profilo
    # dedicato, altrimenti la Dashboard finisce come scheda in un
    # Firefox già in esecuzione (segnalato dall'utente, confermato con
    # una ricerca reale: -new-instance da solo non disattiva il
    # meccanismo di "remote" di Firefox su Linux). Anche qui non veniva
    # mai chiamato maybe_enable_xfwm4_titleless — Firefox non ha un
    # flag CLI equivalente a --start-maximized di Chromium, la
    # massimizzazione arriva comunque dal toggle wmctrl dentro
    # remove_window_decorations più sotto.
    FIREFOX_PROFILE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/x-launcher/firefox-profile"
    setup_firefox_profile 
    # v1.1.84 — FIX: segnalato dall'utente dopo un test riuscito sul
    # decoratore (xfwm4 titleless_maximize + _MOTIF_WM_HINTS confermati
    # funzionanti insieme, vedi log) — il pannello XFCE in alto non
    # spariva mai in Firefox perché questa chiamata era presente SOLO nel
    # ramo Chromium (riga più sotto), mai aggiunta qui.
    maybe_enable_xfce_panel_autohide 
    maybe_enable_xfwm4_titleless 
    "$BROWSER" --no-remote --profile "$FIREFOX_PROFILE_DIR" --private-window --new-instance "${LAUNCHER_URL}" & 
    BROWSER_PID=$! 
    focus_dashboard_window & 
    remove_window_decorations & 
    wait "$BROWSER_PID" 
  else 
    if [ "$DISPLAY_MODE" = "kiosk" ] || [ "$DISPLAY_MODE" = "borderless" ]; then 
      maybe_enable_xfce_panel_autohide 
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
      remove_window_decorations & 
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