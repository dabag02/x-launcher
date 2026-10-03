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
#  segnala al daemon via POST /api/system/active-display.
#
#  v2.2.19-dev.8 — Step 20 seguito, Step 2/3: il pulsante "Modalità
#  Gamescope" del menu deve poter cambiare risoluzione SENZA chiudere
#  la sessione (il riavvio di gamescope non deve far tornare al login
#  LightDM). Lo script non fa più un singolo avvio+wait: gira in un
#  ciclo, con un trap su SIGUSR1 che il daemon invia (vedi server.ts,
#  endpoint POST /api/system/gamescope-resolution/cycle) per chiedere
#  un riavvio con la risoluzione aggiornata in app.conf. Il PID dello
#  script stesso (non quello di gamescope, che cambia ad ogni ciclo)
#  viene scritto in un pidfile perché il daemon possa trovarlo. Una
#  USCITA NATURALE di gamescope (Exit dal menu, crash) resta invece
#  l'uscita vera dello script — comportamento "Exit torna al login
#  LightDM" invariato, cambia solo il caso "cambio risoluzione".
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

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/x-launcher"
APP_CONF="${DATA_DIR}/app.conf"
LOG_FILE="${DATA_DIR}/gamescope-session.log"
# v2.2.19-dev.8 — il daemon legge questo file per sapere a chi mandare
# SIGUSR1 quando l'utente cicla la risoluzione dal menu.
PID_FILE="${DATA_DIR}/gamescope-session.pid"

mkdir -p "$DATA_DIR"
exec > "$LOG_FILE" 2>&1

echo "=== gamescope-session.sh avviato $(date -Iseconds) ==="
echo "whoami: $(whoami)  TTY: $(tty 2>/dev/null)  XDG_SESSION_TYPE: ${XDG_SESSION_TYPE:-non impostata}"
echo "$$" > "$PID_FILE"

# v2.2.19-dev.7 — risoluzione Kiosk ciclabile dal menu della Dashboard,
# persistita in app.conf (src/backend/appConfig.ts è la fonte di verità
# per l'enum e i W×H — questa tabella va tenuta manualmente allineata a
# GAMESCOPE_RESOLUTION_SIZES lì, dato che bash non può importarla da TS).
# Letta ad OGNI ciclo (non solo all'avvio dello script) così un cambio
# risoluzione durante la sessione prende effetto al riavvio richiesto.
read_resolution_from_config() {
  GAMESCOPE_RES_LABEL="QHD"  # default, sovrascritto sotto se presente in app.conf
  if [ -f "$APP_CONF" ]; then
    local found
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
}

echo "[GAMESCOPE-SESSION] Attendo il daemon X-Launcher su ${LAUNCHER_URL}..."
for i in $(seq 1 "$WAIT_TIMEOUT"); do
  if curl -sf "${LAUNCHER_URL}/api/status" &>/dev/null; then
    echo "[GAMESCOPE-SESSION] Daemon pronto (${i}s)."
    break
  fi
  if [ "$i" -eq "$WAIT_TIMEOUT" ]; then
    echo "[GAMESCOPE-SESSION] Timeout: xdash.service non risponde dopo ${WAIT_TIMEOUT}s."
    echo "[GAMESCOPE-SESSION]   Controlla: systemctl status xdash / journalctl -u xdash"
    rm -f "$PID_FILE"
    exit 1
  fi
  sleep 1
done

if ! command -v gamescope &>/dev/null; then
  echo "[GAMESCOPE-SESSION] ERRORE: gamescope non installato — impossibile avviare la sessione."
  rm -f "$PID_FILE"
  exit 1
fi
if ! command -v chromium &>/dev/null; then
  echo "[GAMESCOPE-SESSION] ERRORE: chromium non trovato nel PATH."
  rm -f "$PID_FILE"
  exit 1
fi

# v2.2.19-dev.8 — avvia gamescope con la risoluzione corrente (già letta
# da read_resolution_from_config), rileva il suo DISPLAY e lo segnala al
# daemon. Imposta la variabile globale GAMESCOPE_PID. Non contiene più
# l'attesa finale (wait) — quella resta nel ciclo principale sotto, per
# poterla interrompere con SIGUSR1 senza uscire dallo script.
launch_gamescope() {
  echo "[GAMESCOPE-SESSION] Risoluzione da app.conf: ${GAMESCOPE_RES_LABEL} (${GAMESCOPE_W}x${GAMESCOPE_H})"
  echo "[GAMESCOPE-SESSION] Avvio gamescope standalone (DRM/KMS) + Chromium kiosk su ${LAUNCHER_URL}..."
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
  # v2.2.19-dev.11 — BUG REALE CONFERMATO dal log di produzione: il
  # messaggio vero di gamescope è "[xwayland/server.c:107] Starting
  # Xwayland on :0" — con "on" in mezzo. La regex precedente cercava
  # "Xwayland :N" (senza "on"), non ha MAI trovato nulla su nessun
  # avvio — causa di TUTTI i sintomi osservati (icona sempre
  # "Disattivo", countdown che non riavvia mai nulla): la segnalazione
  # kind:"kiosk" al daemon non partiva mai, non perché il daemon la
  # rifiutasse, ma perché questo script non la inviava proprio. Pattern
  # ora tollerante a testo variabile fra "Xwayland" e i due punti
  # (copre sia "Xwayland on :N" che il vecchio "Xwayland :N", nel caso
  # il testo cambi ancora in una futura versione di gamescope). Il
  # numero del display non è garantito essere sempre lo stesso — può
  # cambiare da un riavvio all'altro — per questo lo ricerchiamo da capo
  # ad ogni chiamata di questa funzione, non solo al primo avvio.
  local found_display=""
  for i in $(seq 1 "$GAMESCOPE_LOG_WAIT"); do
    found_display="$(tail -n 200 "$LOG_FILE" | grep -oE 'Xwayland[^0-9]*:[0-9]+' | tail -1 | grep -oE ':[0-9]+$')"
    [ -n "$found_display" ] && break
    kill -0 "$GAMESCOPE_PID" 2>/dev/null || break
    sleep 1
  done

  if [ -n "$found_display" ]; then
    echo "[GAMESCOPE-SESSION] Xwayland rilevato: DISPLAY=${found_display} — segnalo al daemon."
    curl -sf -X POST "${LAUNCHER_URL}/api/system/active-display" \
      -H "Content-Type: application/json" \
      -d "{\"display\":\"${found_display}\",\"kind\":\"kiosk\",\"resolution\":\"${GAMESCOPE_RES_LABEL}\"}" &>/dev/null \
      && echo "[GAMESCOPE-SESSION] Segnalazione riuscita." \
      || echo "[GAMESCOPE-SESSION] ATTENZIONE: segnalazione al daemon fallita (curl) — i giochi lanciati da questa sessione potrebbero non comparire a schermo."
  else
    echo "[GAMESCOPE-SESSION] ATTENZIONE: DISPLAY di Xwayland non trovato nel log dopo ${GAMESCOPE_LOG_WAIT}s — nessuna segnalazione inviata."
  fi
}

# v2.2.19-dev.8 — SIGUSR1 = "il daemon chiede un riavvio con la nuova
# risoluzione" (il countdown di 5s è gestito lato frontend/daemon, PRIMA
# di inviare questo segnale — qui arriviamo già a riavvio deciso). Il
# trap si limita a marcare una richiesta pendente: la terminazione vera
# di gamescope e il riavvio avvengono nel ciclo principale, non qui
# dentro (un trap handler che manipola processi in modo complesso è
# fragile in bash — meglio solo impostare un flag).
reload_requested=0
trap 'reload_requested=1' SIGUSR1

while true; do
  read_resolution_from_config
  launch_gamescope

  # `wait` su un bash con un trap installato ritorna non appena il trap
  # scatta (SIGUSR1 ricevuto), anche se gamescope è ancora vivo — da qui
  # il controllo esplicito su reload_requested sotto, invece di fidarsi
  # del solo exit code di wait.
  wait "$GAMESCOPE_PID"
  EXIT_CODE=$?

  if [ "$reload_requested" -eq 1 ]; then
    reload_requested=0
    echo "[GAMESCOPE-SESSION] Richiesta di cambio risoluzione ricevuta — termino l'istanza corrente di gamescope (PID ${GAMESCOPE_PID}) e riavvio."
    kill "$GAMESCOPE_PID" 2>/dev/null
    wait "$GAMESCOPE_PID" 2>/dev/null  # attende la terminazione vera prima di rilanciare, evita sovrapposizioni
    continue
  fi

  # Uscita naturale (Exit dal menu, crash) — comportamento invariato:
  # lo script termina, LightDM torna al login.
  echo "[GAMESCOPE-SESSION] gamescope terminato (exit code ${EXIT_CODE}). Fine sessione."
  rm -f "$PID_FILE"
  exit "$EXIT_CODE"
done
