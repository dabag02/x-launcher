#!/usr/bin/env bash
# X-Launcher — diagnostica per screenshot e clip (CHANGELOG-19, punto 2, prima dello step 2a).
#
# Da lanciare via SSH mentre un gioco è aperto e VISIBILE (il suo spazio è quello
# corrente) nella sessione Openbox. Non modifica nulla: crea solo file di prova in
# /tmp/xl-diag-media/ e un log in ~/xl-diag-media-<data>.log.
#
#   bash scripts/diag-media-capture.sh            # gioco dello spazio corrente (o il primo aperto)
#   bash scripts/diag-media-capture.sh 0x8600001  # finestra precisa (id dal log [spaces])
#
# Verifica:
#   1. screenshot della finestra del gioco con gpu-screen-recorder (JPEG) e con import
#      (ImageMagick, quality 85), più quello del monitor per confronto: esito, tempo,
#      dimensioni, peso, immagine nera o no;
#   2. pausa/ripresa di una registrazione via segnale (man page + prova reale:
#      9 s di registrazione con 3 s di pausa in mezzo -> se la pausa funziona la clip dura ~6 s),
#      più una clip normale di 5 s della sola finestra.
set -u

TS="$(date +%Y%m%d-%H%M%S)"
LOG="$HOME/xl-diag-media-$TS.log"
OUT="/tmp/xl-diag-media"
mkdir -p "$OUT" && chmod 700 "$OUT"
rm -f "$OUT"/*

exec > >(tee -a "$LOG") 2>&1

section() { printf '\n===== %s =====\n' "$*"; }
now_ms() { date +%s%3N; }

section "X-Launcher diag-media-capture — $(date '+%F %T')"
echo "log: $LOG"
echo "file di prova: $OUT"

# --- DISPLAY/XAUTHORITY della sessione Openbox: presi dal processo del tray (gira lì dentro)
section "Sessione X"
TRAY_PID="$(pgrep -u "$(id -u)" -f 'tray.py' | head -n1)"
if [ -n "$TRAY_PID" ] && [ -r "/proc/$TRAY_PID/environ" ]; then
  while IFS= read -r -d '' kv; do
    case "$kv" in
      DISPLAY=*) export DISPLAY="${kv#DISPLAY=}" ;;
      XAUTHORITY=*) export XAUTHORITY="${kv#XAUTHORITY=}" ;;
      XDG_RUNTIME_DIR=*) export XDG_RUNTIME_DIR="${kv#XDG_RUNTIME_DIR=}" ;;
      PULSE_SERVER=*) export PULSE_SERVER="${kv#PULSE_SERVER=}" ;;
    esac
  done < "/proc/$TRAY_PID/environ"
  echo "tray.py pid=$TRAY_PID -> DISPLAY=${DISPLAY:-?} XAUTHORITY=${XAUTHORITY:-?}"
else
  export DISPLAY="${DISPLAY:-:0}"
  echo "tray.py non trovato: uso DISPLAY=$DISPLAY"
fi
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

# --- finestra del gioco: dal gestore degli spazi (socket), o dall'argomento
section "Gestore degli spazi"
WIN_ARG="${1:-}"
STATE_JSON="$(python3 - "$XDG_RUNTIME_DIR/x-launcher-spaces.sock" <<'PY'
import json, socket, sys
try:
    s = socket.socket(socket.AF_UNIX); s.settimeout(3); s.connect(sys.argv[1])
    s.sendall(b'{"cmd":"state"}\n'); buf = b""
    while not buf.endswith(b"\n"):
        c = s.recv(65536)
        if not c: break
        buf += c
    print(buf.decode().strip())
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
PY
)"
echo "$STATE_JSON"
if [ -n "$WIN_ARG" ]; then
  WIN_HEX="$WIN_ARG"
else
  WIN_HEX="$(python3 -c '
import json, sys
st = json.loads(sys.argv[1])
if not st.get("ok"): sys.exit(0)
games = [s for s in st.get("spaces", []) if s.get("kind") == "game" and s.get("window")]
cur = [s for s in games if s.get("space") == st.get("current")]
pick = (cur or games or [None])[0]
if pick:
    print("0x%x" % pick["window"])
    print("spazio %s, titolo %r, scope %s, corrente=%s" % (pick["space"], pick.get("title"), pick.get("scope"), bool(cur)), file=sys.stderr)
' "$STATE_JSON")"
fi
if [ -z "$WIN_HEX" ]; then
  echo "ERRORE: nessun gioco aperto negli spazi 1-2 (o gestore non raggiungibile). Lancia un gioco o passa l'id della finestra."
  exit 1
fi
echo "finestra del gioco: $WIN_HEX"
if command -v xwininfo >/dev/null; then
  xwininfo -id "$WIN_HEX" 2>&1 | grep -E 'Window id|Width|Height|Map State|Absolute' || echo "(finestra non valida)"
fi
command -v xprop >/dev/null && xprop -id "$WIN_HEX" WM_NAME _NET_WM_STATE WM_STATE 2>&1 | head -n 6

section "Versioni e dispositivi"
gpu-screen-recorder --version 2>&1 | head -n1
command -v import >/dev/null && import -version 2>&1 | head -n1
command -v ffprobe >/dev/null && ffprobe -version 2>&1 | head -n1
echo "--- capture options"; gpu-screen-recorder --list-capture-options 2>&1
echo "--- audio devices";   gpu-screen-recorder --list-audio-devices 2>&1 | head -n 20

# --- utilità per le immagini: dimensioni, peso, luminosità media (0 = nero)
img_info() {
  local f="$1"
  if [ ! -s "$f" ]; then echo "    file: assente o vuoto"; return; fi
  local sz; sz="$(stat -c %s "$f")"
  if command -v identify >/dev/null; then
    local inf
    if ! inf="$(identify -format '%m %wx%h mean=%[fx:mean]' "$f" 2>/dev/null | head -n1)" || [ -z "$inf" ]; then
      echo "    file: $(basename "$f")  $((sz/1024)) KB  NON LEGGIBILE come immagine"
      return
    fi
    echo "    file: $(basename "$f")  $((sz/1024)) KB  $inf"
    if awk -v m="${inf##*mean=}" 'BEGIN { exit !(m + 0 < 0.02) }'; then
      echo "    ATTENZIONE: immagine nera o quasi (luminosità media ${inf##*mean=})"
    fi
  else
    echo "    file: $(basename "$f")  $((sz/1024)) KB"
  fi
}

run_timed() {   # run_timed <etichetta> <comando...>
  local label="$1"; shift
  local t0 t1 rc
  t0="$(now_ms)"
  "$@" >"$OUT/$label.stdout" 2>"$OUT/$label.stderr"; rc=$?
  t1="$(now_ms)"
  echo "  [$label] rc=$rc  tempo=$((t1 - t0)) ms"
  echo "  comando: $*"
  if [ -s "$OUT/$label.stderr" ]; then echo "  stderr:"; sed 's/^/    /' "$OUT/$label.stderr" | tail -n 15; fi
}

section "1. Screenshot"
echo "--- 1a. gpu-screen-recorder, finestra del gioco, JPEG"
run_timed gsr-window-jpg timeout 15 gpu-screen-recorder -w "$WIN_HEX" -o "$OUT/gsr-window.jpg"
img_info "$OUT/gsr-window.jpg"
echo "--- 1b. gpu-screen-recorder, finestra del gioco, JPEG con -q high (per la qualità)"
run_timed gsr-window-jpg-qhigh timeout 15 gpu-screen-recorder -w "$WIN_HEX" -q high -o "$OUT/gsr-window-qhigh.jpg"
img_info "$OUT/gsr-window-qhigh.jpg"
echo "--- 1c. import (ImageMagick), finestra del gioco, quality 85"
run_timed import-window-jpg timeout 15 import -silent -window "$WIN_HEX" -quality 85 "$OUT/import-window.jpg"
img_info "$OUT/import-window.jpg"
MON="$(gpu-screen-recorder --list-capture-options 2>/dev/null | grep -E '^DP-|^HDMI-' | grep '2560x1440' | head -n1 | cut -d'|' -f1)"
if [ -n "$MON" ]; then
  echo "--- 1d. gpu-screen-recorder, monitor $MON, JPEG (solo confronto)"
  run_timed gsr-monitor-jpg timeout 15 gpu-screen-recorder -w "$MON" -o "$OUT/gsr-monitor.jpg"
  img_info "$OUT/gsr-monitor.jpg"
fi

section "2. Clip e pausa"
echo "--- 2a. man page: segnali e pausa"
if man -w gpu-screen-recorder >/dev/null 2>&1; then
  MANWIDTH=120 man gpu-screen-recorder 2>/dev/null | sed 's/.\x08//g' | grep -i -n -B2 -A4 'SIGUSR\|SIGRTMIN\|SIGINT\|pause\|unpause' | head -n 80
else
  echo "man page non trovata"
fi

clip_info() {
  local f="$1"
  if [ ! -s "$f" ]; then echo "    file: assente o vuoto"; return; fi
  echo "    file: $(basename "$f")  $(( $(stat -c %s "$f") / 1024 )) KB"
  if command -v ffprobe >/dev/null; then
    ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,bit_rate \
            -of compact=p=0 "$f" 2>&1 | sed 's/^/    /'
  fi
}

record() {   # record <etichetta> <file> <script di segnali...>  — registra la finestra, segnali a tempo
  local label="$1" file="$2"; shift 2
  # Job control acceso: senza, bash avvia i processi in background con SIGINT ignorato
  # e lo stop con SIGINT (come farà spaces.py) non arriverebbe.
  set -m
  # Niente `timeout` davanti: i segnali devono arrivare a gpu-screen-recorder, non al wrapper
  # (SIGUSR2 chiuderebbe timeout stesso). Al suo posto un watchdog di 60 s.
  gpu-screen-recorder -w "$WIN_HEX" -c mp4 -k h264 -f 60 -a default_output -o "$file" \
    >"$OUT/$label.stdout" 2>"$OUT/$label.stderr" &
  local pid=$! t0; t0="$(now_ms)"
  ( sleep 60; kill -s INT "$pid" ) </dev/null >/dev/null 2>&1 &
  local watchdog=$!
  echo "  [$label] pid=$pid"
  local step
  for step in "$@"; do
    local secs="${step%%:*}" sig="${step#*:}"
    sleep "$secs"
    if kill -0 "$pid" 2>/dev/null; then
      kill -s "$sig" "$pid" && echo "  +$(( ($(now_ms) - t0) / 1000 )) s: SIG$sig inviato"
    else
      echo "  +$(( ($(now_ms) - t0) / 1000 )) s: processo già terminato prima di SIG$sig"
    fi
  done
  wait "$pid"; local rc=$?
  pkill -P "$watchdog" 2>/dev/null; kill "$watchdog" 2>/dev/null
  set +m
  echo "  [$label] rc=$rc  durata reale del processo: $(( ($(now_ms) - t0) / 1000 )) s"
  if [ -s "$OUT/$label.stderr" ]; then echo "  stderr:"; sed 's/^/    /' "$OUT/$label.stderr" | tail -n 20; fi
}

echo "--- 2b. clip normale: 5 s della sola finestra, chiusa con SIGINT"
record clip-normal "$OUT/clip-normal.mp4" "5:INT"
sleep 1; clip_info "$OUT/clip-normal.mp4"

echo "--- 2c. pausa: 3 s registrazione, SIGUSR2, 3 s pausa, SIGUSR2, 3 s registrazione, SIGINT"
echo "    (se la pausa funziona la clip dura circa 6 s invece di 9)"
record clip-pause "$OUT/clip-pause.mp4" "3:USR2" "3:USR2" "3:INT"
sleep 1; clip_info "$OUT/clip-pause.mp4"

section "Riepilogo file"
ls -l "$OUT"
echo
echo "Fatto. Condividi il log: $LOG"
echo "(i file di prova restano in $OUT finché non spegni o li cancelli)"
