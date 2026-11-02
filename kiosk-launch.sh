#!/usr/bin/env bash
# =============================================================
#  kiosk-launch.sh — Avvia X-Launcher in modalità Big Picture
# =============================================================

LAUNCHER_URL="http://localhost:3000"
WAIT_TIMEOUT=30
# v2.2.17-dev.1 — BUG REALE segnalato dall'utente: install.sh crea un
# symlink in /usr/local/bin/x-launcher → questo script in /opt/x-launcher/.
# `dirname "$0"` non segue i symlink: lanciando col comando `x-launcher`
# da terminale, PROJECT_DIR risolveva a /usr/local/bin invece del vero
# /opt/x-launcher, mandando in cerca .venv-tray (e potenzialmente
# dist/server.cjs) nel posto sbagliato — da cui il systray mai avviato
# in quella modalità, pur essendo presente sul disco. `readlink -f`
# risolve il link fino al file reale prima di calcolare la cartella.
PROJECT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

# --- v0.99.30 — Opzione --always-on-top (default: disattivata) ---
# --- v2.1.10-dev.4 — Opzione --borderless (default: disattivata): forza
# il fallback storico (finestra massimizzata, decorazioni rimosse via
# trick per-DE) al posto del vero --kiosk/-kiosk ora di default — vedi
# più sotto per il dettaglio. Aggiunta qui: prima FORCED_BROWSER="$1"
# prendeva alla cieca il primo argomento posizionale, quindi
# "./kiosk-launch.sh --borderless firefox" avrebbe interpretato
# "--borderless" stesso come nome del browser richiesto. Ora entrambe le
# flag vengono riconosciute in qualunque posizione tra gli argomenti, e
# FORCED_BROWSER prende il primo argomento che non è una flag nota.
X_LAUNCHER_ALWAYS_ON_TOP="false"
X_LAUNCHER_FORCE_BORDERLESS="false"
# v2.2.17-dev.2 — richiesta utente: poter testare le modifiche locali
# senza dover fermare xdash.service in /opt per liberare la porta 3000.
# Porta dedicata e separata, MAI la stessa di xdash — le due istanze
# possono girare in parallelo senza conflitti.
X_LAUNCHER_LOCAL_SERVER="false"
LOCAL_SERVER_PORT=3001
# v2.6.7-dev.1 — sessione Openbox "Shell" (Step 21): la Dashboard si accorge di
# essere in "modalità spazi" dal parametro ?spaces=1 dell'URL (stesso schema di
# ?localdev=1) e libera il congelamento dell'input quando si torna al suo spazio
# (vedi App.tsx / lib/spacesGate.ts). La passa openbox/autostart.
X_LAUNCHER_SPACES_MODE="false"
# v2.7.2-dev.1 — overlay degli spazi e dei servizi (overlay.py, ospitato da spaces.py):
# con --spaces-overlay Select + D-pad apre un overlay a schermo intero invece di
# cambiare spazio direttamente; con --no-spaces-overlay (o senza l'opzione) resta il
# cambio diretto di sempre. La scelta viaggia a tray.py/spaces.py come variabile
# d'ambiente X_LAUNCHER_SPACES_OVERLAY (1/0). La passa openbox/autostart.
X_LAUNCHER_SPACES_OVERLAY_OPT="false"
FORCED_BROWSER=""
for arg in "$@"; do
  case "$arg" in
    --always-on-top) X_LAUNCHER_ALWAYS_ON_TOP="true" ;;
    --borderless)    X_LAUNCHER_FORCE_BORDERLESS="true" ;;
    --local-server)  X_LAUNCHER_LOCAL_SERVER="true" ;;
    --spaces-mode)   X_LAUNCHER_SPACES_MODE="true" ;;
    --spaces-overlay)    X_LAUNCHER_SPACES_OVERLAY_OPT="true" ;;
    --no-spaces-overlay) X_LAUNCHER_SPACES_OVERLAY_OPT="false" ;;
    # v2.6.7-dev.1 — un'opzione "--qualcosa" sconosciuta (es. passata da un
    # autostart più nuovo di questo script) NON è il nome di un browser: va
    # ignorata, non scambiata per FORCED_BROWSER.
    --*) echo "[KIOSK] Opzione sconosciuta ignorata: $arg" ;;
    *) [ -z "$FORCED_BROWSER" ] && FORCED_BROWSER="$arg" ;;
  esac
done
if [ "$X_LAUNCHER_SPACES_OVERLAY_OPT" = "true" ]; then
  export X_LAUNCHER_SPACES_OVERLAY=1
  echo "[KIOSK] OVERLAY DEGLI SPAZI attivo (Select + D-pad apre l'overlay; senza --spaces-overlay: cambio diretto)."
else
  export X_LAUNCHER_SPACES_OVERLAY=0
fi
echo "[KIOSK] Always-on-top: ${X_LAUNCHER_ALWAYS_ON_TOP}" 
echo "[KIOSK] Borderless forzato da CLI: ${X_LAUNCHER_FORCE_BORDERLESS}"

# v2.2.17-dev.2 — vedi commento sopra su X_LAUNCHER_LOCAL_SERVER. Da qui
# in poi LAUNCHER_URL punta alla porta dedicata: ogni controllo/apertura
# più sotto nello script la usa già senza bisogno di altre modifiche.
# BROWSER_URL (diversa da LAUNCHER_URL) è quella passata davvero al
# browser — in questa modalità porta anche ?localdev=1, letto da App.tsx
# per mostrare un indicatore in-app: utile perché in modalità kiosk/app
# la barra degli indirizzi è nascosta, quindi la porta da sola non è
# visibile guardando la finestra.
BROWSER_URL="$LAUNCHER_URL"
if [ "$X_LAUNCHER_LOCAL_SERVER" = "true" ]; then
  LAUNCHER_URL="http://localhost:${LOCAL_SERVER_PORT}"
  BROWSER_URL="${LAUNCHER_URL}/?localdev=1"
  echo "=============================================================="
  echo "[KIOSK] MODALITA' SERVER LOCALE — porta ${LOCAL_SERVER_PORT}"
  echo "[KIOSK] Dati letti/scritti dalla copia di sviluppo in:"
  echo "[KIOSK]   ${PROJECT_DIR}"
  echo "[KIOSK] xdash (/opt, porta 3000) NON viene toccato."
  echo "=============================================================="
fi
# v2.6.7-dev.1 — aggiunge ?spaces=1 (o &spaces=1 se c'è già ?localdev=1).
if [ "$X_LAUNCHER_SPACES_MODE" = "true" ]; then
  case "$BROWSER_URL" in
    *\?*) BROWSER_URL="${BROWSER_URL}&spaces=1" ;;
    *)    BROWSER_URL="${BROWSER_URL}/?spaces=1" ;;
  esac
  echo "[KIOSK] MODALITA' SPAZI — la Dashboard gestisce il congelamento dell'input per spazio (URL: ${BROWSER_URL})."
fi

# --- v2.0.41-dev.7 — richiesta utente: rientro da Steam Big Picture.
# X-Launcher è aggiunto come Non-Steam Game in Steam (scripts/setup-
# steam-shortcut.cjs), il cui `Exe` in shortcuts.vdf punta esattamente a
# QUESTO script — cliccare la card "X-Launcher" da dentro Big Picture
# riesegue kiosk-launch.sh da capo, verificato leggendo setup-steam-
# shortcut.cjs (mai assunto). Se il daemon è già su E una finestra
# X-Launcher esiste già (nascosta da tray.py durante il lancio di Big
# Picture, vedi POST /api/system/steam-bigpicture in server.ts), questa
# non è una prima esecuzione — è un rientro: NON va avviata una seconda
# istanza del browser (produrrebbe una seconda finestra sopra quella già
# nascosta, mai richiusa). Ci si ferma qui, PRIMA di qualunque rilevamento
# DE/browser sottostante, che per un semplice rientro è tutto lavoro
# sprecato. `wmctrl -a` per mostrare la finestra è lo stesso, identico
# comando già usato da show_window() in tray.py — non una nuova
# assunzione, lo stesso meccanismo già collaudato per ogni gioco.
if [ "$X_LAUNCHER_LOCAL_SERVER" != "true" ] && curl -sf "${LAUNCHER_URL}/api/status" &>/dev/null && command -v wmctrl &>/dev/null && wmctrl -l 2>/dev/null | grep -q "X-Launcher HTPC"; then
  echo "[KIOSK] Daemon e finestra già attivi — rientro da Steam Big Picture, nessun nuovo avvio."
  curl -s -X POST "${LAUNCHER_URL}/api/system/steam-bigpicture-closed" &>/dev/null
  wmctrl -a "X-Launcher HTPC" 2>/dev/null
  exit 0
fi

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
  if [ "$X_LAUNCHER_LOCAL_SERVER" = "true" ]; then
    echo "[KIOSK] Avvio server locale dedicato sulla porta ${LOCAL_SERVER_PORT}."
  else
    echo "[KIOSK] Daemon non attivo — avvio come fallback locale (xdash.service non rilevato attivo)." 
  fi
  cd "$PROJECT_DIR" 

  if [ ! -f "$PROJECT_DIR/dist/server.cjs" ]; then 
    echo "[KIOSK] dist/server.cjs non trovato. Esegui prima: npm run build" 
    exit 1 
  fi 

  # v1.1.102-dev.1 — .env spostato da $PROJECT_DIR a ~/.local/share/x-launcher/
  # (stessa cartella di db/log/config), cosi non serve piu che sia "nella
  # cartella giusta": e sempre nello stesso posto per qualunque modo si
  # avvii il daemon (dev, questo script, o xdash.service — vedi anche li).
  ENV_FILE="$HOME/.local/share/x-launcher/.env" 
  # v2.2.17-dev.2 — PORT_OVERRIDE vuota fuori da --local-server (il node
  # sottostante usa il default 3000 di server.ts), valorizzata solo qui:
  # xdash in /opt continua ad ascoltare la sua porta indisturbato.
  PORT_OVERRIDE=""
  [ "$X_LAUNCHER_LOCAL_SERVER" = "true" ] && PORT_OVERRIDE="PORT=${LOCAL_SERVER_PORT}"
  if [ -f "$ENV_FILE" ]; then 
    env $PORT_OVERRIDE NODE_ENV=production node --env-file="$ENV_FILE" dist/server.cjs & 
  else
    env $PORT_OVERRIDE NODE_ENV=production node dist/server.cjs & 
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
#
# v2.1.10-dev.4 — SEMANTICA CAMBIATA rispetto a prima: "kiosk" ora
# significa il vero --kiosk/-kiosk del browser (default), non più
# l'implementazione storica a finestra massimizzata con decorazioni
# rimosse via trick per-DE — quella è "borderless", non più selezionabile
# dal menu della Dashboard (dove le due modalità erano finora, di fatto,
# identiche — solo l'etichetta cambiava) ma ancora richiamabile
# esplicitamente da riga di comando con --borderless, per chi la vuole
# come fallback sicuro (nessun trick, ma niente rischio del lieve input
# lag noto di --kiosk reale, accettato consapevolmente come compromesso
# per il default — vedi CHANGELOG-5.md). Un vecchio app.conf con
# displayMode=borderless persistito da prima di questo cambiamento resta
# rispettato (scelta esplicita già fatta dall'utente, non va sostituita
# in silenzio con un comportamento diverso — il vero kiosk — che non ha
# mai scelto). --borderless da CLI ha priorità sia su app.conf sia sul
# default, ma NON sovrascrive una preferenza esplicita "window": chi ha
# scelto la finestra normale la ottiene comunque.
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
if [ "$X_LAUNCHER_FORCE_BORDERLESS" = "true" ] && [ "$DISPLAY_MODE" != "window" ]; then
  DISPLAY_MODE="borderless"
fi
echo "[KIOSK] Modalità display: ${DISPLAY_MODE}" 

# --- Rileva il browser disponibile ---
# FORCED_BROWSER è già stato popolato dal loop di parsing in cima al
# file (v2.1.10-dev.4) — non più "$1" alla cieca.
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
      "$BROWSER" --no-remote --profile "$FIREFOX_PROFILE_DIR" --private-window --new-instance "${BROWSER_URL}" 
  else
    # Avvio Chromium in Gamescope
    exec gamescope -W 1920 -H 1080 -f -e -- \
      "$BROWSER" \
        --app="${BROWSER_URL}" \
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
  # v2.2.19-dev.2 — BUG REALE CONFERMATO: xdash.service ha DISPLAY=:0
  # fisso — corretto finché esiste solo questa sessione, ma se prima era
  # attiva la sessione Kiosk (gamescope, DISPLAY diverso) il daemon resta
  # sul valore vecchio. Segnaliamo qui il $DISPLAY reale di QUESTA
  # sessione ogni volta che diventa quella attiva — vedi activeDisplay.ts
  # e server.ts (POST /api/system/active-display) per il dettaglio.
  # v2.2.19-dev.7 — kind:"desktop" azzera lo stato "sessione Kiosk attiva"
  # nel daemon quando si torna qui da gamescope, così il pulsante
  # "Modalità Gamescope" nel menu torna correttamente a "Disattivo".
  curl -sf -X POST "${LAUNCHER_URL}/api/system/active-display" \
    -H "Content-Type: application/json" \
    -d "{\"display\":\"${DISPLAY:-:0}\",\"kind\":\"desktop\"}" &>/dev/null \
    || echo "[KIOSK] ATTENZIONE: segnalazione DISPLAY al daemon fallita (curl)."

  if [ "$BROWSER_TYPE" = "firefox" ]; then 
    # v1.1.81 — -no-remote + profilo dedicato, altrimenti la Dashboard
    # finisce come scheda in un Firefox già in esecuzione (segnalato
    # dall'utente, confermato con una ricerca reale: -new-instance da
    # solo non disattiva il meccanismo di "remote" di Firefox su Linux).
    FIREFOX_PROFILE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/x-launcher/firefox-profile"
    setup_firefox_profile 

    if [ "$DISPLAY_MODE" = "kiosk" ]; then 
      # v2.1.10-dev.4 — DEFAULT: vero -kiosk di Firefox, verificato reale
      # (disponibile da Firefox 71+, non ipotizzato) al posto del trick
      # xfwm4/_MOTIF_WM_HINTS usato per il fallback borderless sotto —
      # stesso obiettivo dell'utente per il ramo Chromium: un solo
      # comportamento uniforme su ogni desktop, senza trick per-DE.
      echo "[KIOSK] Firefox in modalità -kiosk reale (default)." 
      "$BROWSER" -kiosk --no-remote --profile "$FIREFOX_PROFILE_DIR" --private-window --new-instance "${BROWSER_URL}" & 
      BROWSER_PID=$! 
      focus_dashboard_window & 
      wait "$BROWSER_PID" 
    else 
      # v2.1.10-dev.4 — NOTA (limite noto, non risolto in questo step):
      # questo ramo copre SIA "borderless" (fallback esplicito via
      # --borderless o displayMode persistito) SIA "window" — per
      # "window" è un limite pre-esistente, non introdotto qui: Firefox
      # non ha mai avuto un vero ramo a finestra normale in questo
      # script, DISPLAY_MODE non veniva controllato affatto prima di
      # questa riscrittura. Il profilo dedicato (userChrome.css che
      # nasconde barra indirizzi/tab/titlebar) si applica quindi anche
      # scegliendo "Finestra" dal menu — servirebbe un secondo profilo
      # Firefox senza quel CSS per separarli davvero, lavoro a sé
      # rimandato a una sessione futura.
      maybe_enable_xfce_panel_autohide 
      maybe_enable_xfwm4_titleless 
      "$BROWSER" --no-remote --profile "$FIREFOX_PROFILE_DIR" --private-window --new-instance "${BROWSER_URL}" & 
      BROWSER_PID=$! 
      focus_dashboard_window & 
      remove_window_decorations & 
      wait "$BROWSER_PID" 
    fi 
  else 
    if [ "$DISPLAY_MODE" = "window" ]; then 
      "$BROWSER" \
        --app="${BROWSER_URL}" \
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
    elif [ "$DISPLAY_MODE" = "borderless" ]; then 
      # v2.1.10-dev.4 — FALLBACK esplicito (--borderless da CLI, o un
      # vecchio app.conf con displayMode=borderless da prima di questo
      # cambiamento): implementazione storica, invariata — finestra
      # massimizzata con decorazioni rimosse via trick per-DE. Era
      # questo il comportamento di "kiosk" prima di v2.1.10-dev.4 (le
      # due modalità erano di fatto identiche, solo l'etichetta
      # cambiava — vedi CHANGELOG-5.md per la cronologia completa).
      maybe_enable_xfce_panel_autohide 
      maybe_enable_xfwm4_titleless 
      "$BROWSER" \
        --app="${BROWSER_URL}" \
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
      # v2.1.10-dev.4 — DEFAULT: vero --kiosk di Chromium, riportato dopo
      # l'abbandono in v0.99.12 (lag misurato su hardware reale, causa
      # isolata nell'inizializzazione del rendering interno di Chromium
      # quando parte già con --kiosk, non nel fullscreen in sé — vedi
      # CHANGELOG-5.md). L'utente accetta consapevolmente questo
      # compromesso per uniformare il comportamento su ogni desktop,
      # senza i trick per-DE usati nel ramo borderless sopra: con --kiosk
      # reale il WM non decora affatto la finestra, non c'è nulla da
      # rimuovere dopo. Non richiamate qui, deliberatamente:
      # maybe_enable_xfce_panel_autohide, maybe_enable_xfwm4_titleless,
      # remove_window_decorations — tutte pensate per un borderless SENZA
      # vero kiosk. Se il pannello di qualche DE dovesse comunque restare
      # visibile sopra la finestra --kiosk, è un fatto da accertare con
      # un test reale, non qualcosa su cui pre-applicare alla cieca gli
      # stessi trick che questo cambiamento vuole eliminare.
      echo "[KIOSK] Chromium in modalità --kiosk reale (default)." 
      "$BROWSER" \
        --app="${BROWSER_URL}" \
        --kiosk \
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