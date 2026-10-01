#!/usr/bin/env bash
# =============================================================
#  gamescope-session.sh — Sessione Wayland/gamescope indipendente
#  per X-Launcher (Step 20 della roadmap).
#
#  Selezionabile come sessione di login separata dal greeter
#  LightDM (vedi xlauncher-kiosk.desktop, installato in
#  /usr/share/wayland-sessions/). A differenza di kiosk-launch.sh
#  (dove gamescope, se usato, è "-e", nested dentro una sessione
#  X11/Wayland già esistente), qui gamescope E' il compositore
#  della sessione: prende il controllo diretto di DRM/KMS dal VT
#  assegnato dal login manager, senza alcun desktop/X server sotto
#  — stile SteamOS/Steam Deck.
#
#  Confermato su hardware reale (v1.0): sessione di test via login
#  puro su tty6, backend logind (seatd non installato/non
#  necessario), GPU (RTX 3070) selezionata correttamente via
#  Vulkan, Chromium in kiosk che carica la dashboard vera su
#  localhost:3000 e risponde al controller. Confermato anche
#  tramite selezione reale dal greeter LightDM: il VT non è
#  garantito essere lo stesso del test manuale (nel test reale è
#  arrivato su vt8, non vt6 — LightDM/logind allocano i VT in
#  sequenza, XFCE già su vt7 — accettato così su richiesta
#  esplicita dell'utente, nessun bypass di LightDM necessario).
#
#  Crash noto e non bloccante: gamescope termina con segfault/core
#  dump quando l'ultimo client (Chromium) si chiude (es. pulsante
#  "Exit" del menu) — coredumpctl non cattura nulla su questo
#  sistema (da investigare separatamente se necessario). Il
#  ritorno al login manager avviene comunque correttamente: LightDM
#  considera la sessione terminata non appena questo processo
#  esce, qualunque sia la causa dell'uscita.
#
#  v2.2.19-dev.2 — BUG REALE CONFERMATO nel codice sorgente (non solo
#  nei log): xdash.service ha DISPLAY=:0 fisso, valido solo per la
#  sessione XFCE — i giochi lanciati mentre questa sessione Kiosk è
#  quella attiva finivano invisibili sull'altro DISPLAY. Vedi
#  activeDisplay.ts per la diagnosi completa. Questa versione NON fa
#  più `exec gamescope ...` diretto: lo avvia in background, ne
#  legge il log per scoprire il numero reale del suo Xwayland interno
#  (assegnato da gamescope stesso, non prevedibile in anticipo), lo
#  segnala al daemon via POST /api/system/active-display, poi resta
#  in attesa che gamescope termini — il comportamento "Exit torna al
#  login LightDM" resta identico a prima (lo script termina comunque
#  quando gamescope termina, qualunque sia la causa).
#
#  NON ANCORA GESTITO in questa versione (fuori scope per questo
#  step, vedi memoria/roadmap per il dettaglio):
#  - Avvio silenzioso di Steam (session-launch.sh lo fa per la
#    sessione X11 dentro un DE — qui non ancora replicato).
# =============================================================

set -u

LAUNCHER_URL="http://localhost:3000"
WAIT_TIMEOUT=30
GAMESCOPE_LOG_WAIT=10  # secondi massimi di attesa della riga "Xwayland :N" nel log

# v2.2.19-dev.7 — risoluzione Kiosk ciclabile dal menu della Dashboard,
# persistita in app.conf (src/backend/appConfig.ts è la fonte di verità
# per l'enum e i W×H — questa tabella va tenuta manualmente allineata a
# GAMESCOPE_RESOLUTION_SIZES lì, dato che bash non può importarla da TS).
APP_CONF="${XDG_DATA_HOME:-$HOME/.local/share}/x-launcher/app.conf"
GAMESCOPE_RES_LABEL="QHD"  # default, sovrascritto sotto se presente in app.conf
if [ -f "$APP_CONF" ]; then
  found="$(grep -E '^gamescopeResolution=' "$APP_CONF" | tail -1 | cut -d= -f2)"
  [ -n "$found" ] && GAMESCOPE_RES_LABEL="$found"
fi
case "$GAMESCOPE_RES_LABEL" in
  HD)     GAMESCOPE_W=1280; GAMESCOPE_H=720  ;;
  FullHD) GAMESCOPE_W=1920; GAMESCOPE_H=1080 ;;
  QHD)    GAMESCOPE_W=2560; GAMESCOPE_H=1440 ;;
  4K)     GAMESCOPE_W=3840; GAMESCOPE_H=2160 ;;
  *)      GAMESCOPE_W=2560; GAMESCOPE_H=1440; GAMESCOPE_RES_LABEL="QHD" ;;  # valore non riconosciuto in app.conf
esac

# Log persistente di questa sessione, sovrascritto ad ogni avvio
# (stesso pattern già in uso per il log della systray in
# kiosk-launch.sh) — utile per capire cosa succede quando lo
# script gira davvero da LightDM e non da un terminale interattivo,
# e serve anche a questo stesso script per rilevare il DISPLAY reale
# (vedi sotto).
LOG_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/x-launcher/gamescope-session.log"
mkdir -p "$(dirname "$LOG_FILE")"
exec > "$LOG_FILE" 2>&1

echo "=== gamescope-session.sh avviato $(date -Iseconds) ==="
echo "whoami: $(whoami)  TTY: $(tty 2>/dev/null)  XDG_SESSION_TYPE: ${XDG_SESSION_TYPE:-non impostata}"

# --- Attende xdash.service (multi-user.target, dovrebbe essere già
# attivo dal boot indipendentemente da quale sessione grafica viene
# poi scelta — stesso principio già in uso in kiosk-launch.sh) ---
echo "[GAMESCOPE-SESSION] Attendo il daemon X-Launcher su ${LAUNCHER_URL}..."
for i in $(seq 1 "$WAIT_TIMEOUT"); do
  if curl -sf "${LAUNCHER_URL}/api/status" &>/dev/null; then
    echo "[GAMESCOPE-SESSION] Daemon pronto (${i}s)."
    break
  fi
  if [ "$i" -eq "$WAIT_TIMEOUT" ]; then
    echo "[GAMESCOPE-SESSION] Timeout: xdash.service non risponde dopo ${WAIT_TIMEOUT}s."
    echo "[GAMESCOPE-SESSION]   Controlla: systemctl status xdash / journalctl -u xdash"
    exit 1
  fi
  sleep 1
done

if ! command -v gamescope &>/dev/null; then
  echo "[GAMESCOPE-SESSION] ERRORE: gamescope non installato — impossibile avviare la sessione."
  exit 1
fi
if ! command -v chromium &>/dev/null; then
  echo "[GAMESCOPE-SESSION] ERRORE: chromium non trovato nel PATH."
  exit 1
fi

echo "[GAMESCOPE-SESSION] Risoluzione da app.conf: ${GAMESCOPE_RES_LABEL} (${GAMESCOPE_W}x${GAMESCOPE_H})"
echo "[GAMESCOPE-SESSION] Avvio gamescope standalone (DRM/KMS) + Chromium kiosk su ${LAUNCHER_URL} (background, non più exec diretto)..."
gamescope -W "$GAMESCOPE_W" -H "$GAMESCOPE_H" -f -- \
  chromium \
    --app="${LAUNCHER_URL}" \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --no-first-run \
    --disable-translate \
    --autoplay-policy=no-user-gesture-required \
    --enable-gamepad-buttons-as-keys \
    --disable-features=VaapiVideoDecoder \
    --disable-background-networking \
    --log-level=3 &
GAMESCOPE_PID=$!
echo "[GAMESCOPE-SESSION] gamescope avviato, PID ${GAMESCOPE_PID}."

# --- Rileva il DISPLAY reale dell'Xwayland interno di gamescope ---
# Log reale osservato in un test precedente: righe come
# "[gamescope] [Info] xwayland server: Xwayland :1 -rootless ..." (il
# numero non è garantito essere sempre 1 — dipende da quali altri
# Xwayland/Xorg sono già in esecuzione sul sistema in quel momento).
FOUND_DISPLAY=""
for i in $(seq 1 "$GAMESCOPE_LOG_WAIT"); do
  FOUND_DISPLAY="$(grep -oE 'Xwayland :[0-9]+' "$LOG_FILE" | head -1 | grep -oE ':[0-9]+')"
  [ -n "$FOUND_DISPLAY" ] && break
  # Se gamescope è già morto (crash immediato) non ha senso continuare
  # ad aspettare un DISPLAY che non arriverà mai.
  kill -0 "$GAMESCOPE_PID" 2>/dev/null || break
  sleep 1
done

if [ -n "$FOUND_DISPLAY" ]; then
  echo "[GAMESCOPE-SESSION] Xwayland rilevato: DISPLAY=${FOUND_DISPLAY} — segnalo al daemon."
  curl -sf -X POST "${LAUNCHER_URL}/api/system/active-display" \
    -H "Content-Type: application/json" \
    -d "{\"display\":\"${FOUND_DISPLAY}\",\"kind\":\"kiosk\",\"resolution\":\"${GAMESCOPE_RES_LABEL}\"}" &>/dev/null \
    && echo "[GAMESCOPE-SESSION] Segnalazione riuscita." \
    || echo "[GAMESCOPE-SESSION] ATTENZIONE: segnalazione al daemon fallita (curl) — i giochi lanciati da questa sessione potrebbero non comparire a schermo."
else
  echo "[GAMESCOPE-SESSION] ATTENZIONE: DISPLAY di Xwayland non trovato nel log dopo ${GAMESCOPE_LOG_WAIT}s — nessuna segnalazione inviata, il daemon resta sul DISPLAY precedente (probabile :0, sbagliato per questa sessione)."
fi

# --- Attesa: lo script (e quindi la sessione LightDM) resta vivo finché
# gamescope non termina, qualunque sia la causa (uscita pulita dal menu
# Exit, crash noto in chiusura, kill esterno...) ---
wait "$GAMESCOPE_PID"
EXIT_CODE=$?
echo "[GAMESCOPE-SESSION] gamescope terminato (exit code ${EXIT_CODE}). Fine sessione."
exit "$EXIT_CODE"
