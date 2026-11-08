#!/usr/bin/env bash
# =============================================================
#  diag-steam-gamescope.sh — prova di Steam Big Picture dentro gamescope
#  annidato, nello spazio riservato (desktop 4 di Openbox = spazio 3).
#
#  Da lanciare via SSH mentre la sessione Openbox "Shell" e' attiva sull'HTPC.
#  Non modifica nulla della Dashboard: avvia gamescope + Steam in uno scope di
#  prova (xlauncher-steamtest-<ts>.scope, che spaces.py NON gestisce), poi ti
#  guida passo passo (domande s/n nel terminale SSH) e raccoglie i dati in un log.
#
#  Prove:
#    T1  Big Picture a schermo intero dentro gamescope, comandabile col controller
#    T2  gioco lanciato DA Big Picture: sopra BP, ritorno a BP alla chiusura
#    T3  gioco lanciato DALLA Dashboard (steam://rungameid): finisce dentro gamescope?
#    T4  congelamento dello scope (gamescope + Steam + gioco) e scongelamento
#    T5  chiusura di Steam: gamescope esce e lo scope sparisce?
#
#  Uso:
#    scripts/diag-steam-gamescope.sh [opzioni]
#      --res WxH          risoluzione di gamescope (default: quella del monitor primario)
#      --freeze-s N       durata del congelamento in T4 (default 30)
#      --gs-args "..."    argomenti extra per gamescope (es. "--backend sdl")
#      --no-e             senza integrazione Steam (-e) di gamescope
#      --keep-running     a fine prova lascia Steam/gamescope aperti
#      --dry-run          solo ambiente e informazioni di sistema, nessun lancio
#      -h | --help
#
#  Log: ~/.local/share/x-launcher/diag/steam-gamescope-<data>.log
#       (+ l'output grezzo di gamescope/Steam in ...-gamescope.log)
#  Le righe del log sono in inglese (log di debug); le domande nel terminale in italiano.
# =============================================================
set -u

RES=""
FREEZE_S=30
GS_EXTRA=""
USE_E=1
KEEP=0
DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --res)          RES="${2:-}"; shift ;;
    --freeze-s)     FREEZE_S="${2:-30}"; shift ;;
    --gs-args)      GS_EXTRA="${2:-}"; shift ;;
    --no-e)         USE_E=0 ;;
    --keep-running) KEEP=1 ;;
    --dry-run)      DRY=1 ;;
    -h|--help)      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opzione sconosciuta: $1 (vedi --help)" >&2; exit 2 ;;
  esac
  shift
done
case "$FREEZE_S" in ''|*[!0-9]*) FREEZE_S=30 ;; esac

TS="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/x-launcher/diag"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/steam-gamescope-$TS.log"
GS_LOG="$LOG_DIR/steam-gamescope-$TS-gamescope.log"
UNIT="xlauncher-steamtest-$(date +%s)"
START_EPOCH="$(date +%s)"
declare -A RESULT=()
FROZEN=0

# ------------------------------------------------------------------ helpers
log()     { printf '[%s] %s\n' "$(date +%T.%3N)" "$*" | tee -a "$LOG"; }
section() { printf '\n===== %s =====\n' "$*" | tee -a "$LOG"; }
run()     { printf '$ %s\n' "$*" >>"$LOG"; "$@" >>"$LOG" 2>&1; local rc=$?; [ $rc -ne 0 ] && echo "(exit $rc)" >>"$LOG"; return $rc; }
say()     { { printf '%s\n' "$*" >/dev/tty; } 2>/dev/null || printf '%s\n' "$*" >&2; }
die()     { log "FATAL: $*"; say "ERRORE: $*"; exit 1; }

ask() {   # ask ID "domanda"
  local id="$1" q="$2" a note
  while :; do
    printf '\n>>> %s [s/n/? = non so] ' "$q" >/dev/tty
    read -r a </dev/tty || a="?"
    case "$a" in
      s|S|si|y|Y) a=yes; break ;;
      n|N|no)     a=no; break ;;
      '?'|'')     a=unknown; break ;;
    esac
  done
  printf '    nota (Invio per nessuna): ' >/dev/tty
  read -r note </dev/tty || note=""
  RESULT[$id]="$a${note:+ — $note}"
  log "USER $id: $q -> $a${note:+ | note: $note}"
}

pause() { # pause "istruzione"
  printf '\n>>> %s\n    Premi Invio quando fatto… ' "$1" >/dev/tty
  read -r _ </dev/tty
  log "USER step done: $1"
}

# --------------------------------------------- ambiente della sessione Openbox
import_session_env() {
  local pid kv
  pid="$(pgrep -u "$(id -u)" -x openbox | head -1)"
  [ -z "$pid" ] && die "nessun processo openbox di $(id -un): la sessione Openbox \"Shell\" deve essere attiva sull'HTPC."
  # shellcheck disable=SC2163  # export "VAR=valore" è voluto
  while IFS= read -r -d '' kv; do
    case "$kv" in
      DISPLAY=*|XAUTHORITY=*|DBUS_SESSION_BUS_ADDRESS=*|XDG_RUNTIME_DIR=*|XDG_CURRENT_DESKTOP=*) export "$kv" ;;
    esac
  done < "/proc/$pid/environ"
  export DISPLAY="${DISPLAY:-:0}"
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
  log "session env from openbox pid $pid: DISPLAY=$DISPLAY XAUTHORITY=${XAUTHORITY:-} XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR DBUS=$DBUS_SESSION_BUS_ADDRESS"
}

PROJ=""
SPY=""
find_project() {
  local link="${XDG_CONFIG_HOME:-$HOME/.config}/openbox/autostart"
  [ -L "$link" ] && PROJ="$(dirname "$(dirname "$(readlink -f "$link")")")"
  if [ -n "$PROJ" ] && [ -f "$PROJ/spaces.py" ]; then
    SPY="python3"; [ -x "$PROJ/.venv-tray/bin/python3" ] && SPY="$PROJ/.venv-tray/bin/python3"
  fi
  log "project dir: ${PROJ:-not found}  spaces.py ctl via: ${SPY:-n/a}"
}
spaces_ctl() { [ -n "$SPY" ] && run "$SPY" "$PROJ/spaces.py" ctl "$@"; }

# ------------------------------------------------------------ scope e processi
scope_cg()   { systemctl --user show -p ControlGroup --value "$UNIT.scope" 2>/dev/null; }
scope_pids() {
  local cg; cg="$(scope_cg)"
  [ -n "$cg" ] && [ -d "/sys/fs/cgroup$cg" ] && find "/sys/fs/cgroup$cg" -name cgroup.procs -exec cat {} + 2>/dev/null | sort -n -u
}
scope_active() { systemctl --user is-active --quiet "$UNIT.scope" 2>/dev/null; }
pid_scope()  { grep -o 'xlauncher-[^/]*\.scope' "/proc/$1/cgroup" 2>/dev/null | tail -1; }

dump_scope() { # dump_scope "etichetta"
  section "SCOPE $UNIT — $1"
  run systemctl --user show -p ActiveState -p SubState -p FreezerState -p ControlGroup -p MemoryCurrent -p CPUUsageNSec -p TasksCurrent "$UNIT.scope"
  local pids p comm envs n=0
  pids="$(scope_pids | tr '\n' ',' | sed 's/,$//')"
  if [ -z "$pids" ]; then echo "(no processes in scope)" >>"$LOG"; return; fi
  echo "process count: $(scope_pids | wc -l)" >>"$LOG"
  printf '$ ps (scope processes)\n' >>"$LOG"
  ps -ww -o pid,ppid,stat,pcpu,rss,etime,comm,args -p "$pids" >>"$LOG" 2>&1
  echo "--- display env of key processes" >>"$LOG"
  for p in $(scope_pids); do
    comm="$(cat "/proc/$p/comm" 2>/dev/null)"
    case "$comm" in
      gamescope*|Xwayland|steam|reaper|pressure-vessel*|wine*|*.exe|steamwebhelper)
        [ "$comm" = steamwebhelper ] && { n=$((n+1)); [ $n -gt 2 ] && continue; }
        envs="$(tr '\0' '\n' < "/proc/$p/environ" 2>/dev/null | grep -E '^(DISPLAY|WAYLAND_DISPLAY|GAMESCOPE_WAYLAND_DISPLAY|SteamAppId|SteamGameId|STEAM_GAMESCOPE[A-Z_]*|SDL_VIDEODRIVER)=' | tr '\n' ' ')"
        echo "  pid=$p comm=$comm  $envs" >>"$LOG" ;;
    esac
  done
}

dump_windows() { # dump_windows "etichetta"
  section "OPENBOX WINDOWS — $1"
  echo "current desktop: $(wmctrl -d 2>/dev/null | awk '$2=="*"{print $1}')" >>"$LOG"
  local line pid
  wmctrl -lxp 2>/dev/null | while IFS= read -r line; do
    pid="$(echo "$line" | awk '{print $3}')"
    echo "$line   [scope: $(pid_scope "$pid" 2>/dev/null || true)]" >>"$LOG"
  done
}

dump_games() { # dump_games "etichetta" -> stampa i PID dei reaper trovati
  section "STEAM GAMES (reaper SteamLaunch) — $1"
  local found=0 p
  for p in $(pgrep -u "$(id -u)" -f 'SteamLaunch AppId=' 2>/dev/null); do
    found=1
    echo "reaper pid=$p scope=$(pid_scope "$p")  in-test-scope=$(scope_pids | grep -qx "$p" && echo yes || echo no)" >>"$LOG"
    tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | cut -c1-400 >>"$LOG"; echo >>"$LOG"
    command -v pstree >/dev/null && pstree -p -a "$p" 2>/dev/null | cut -c1-200 | head -40 >>"$LOG"
  done
  [ $found = 0 ] && echo "(no Steam game running)" >>"$LOG"
  return $((1 - found))
}

dump_pads() {
  section "INPUT DEVICES with joystick handler — $1"
  awk 'BEGIN{RS="";FS="\n"} /H: Handlers=[^\n]*js[0-9]/ {print; print ""}' /proc/bus/input/devices 2>/dev/null \
    | grep -E '^(I:|N:|H:)' >>"$LOG"
}

wait_games() { # wait_games secondi
  local t=0
  while [ $t -lt "$1" ]; do
    pgrep -u "$(id -u)" -f 'SteamLaunch AppId=' >/dev/null 2>&1 && return 0
    sleep 2; t=$((t+2))
  done
  return 1
}

goto_desktop() { log "wmctrl -s $1"; wmctrl -s "$1" 2>>"$LOG"; sleep 1; }

cleanup() {
  if [ "$FROZEN" = 1 ]; then
    log "cleanup: thawing $UNIT.scope"
    systemctl --user thaw "$UNIT.scope" >>"$LOG" 2>&1
  fi
  [ "$DRY" = 0 ] && wmctrl -s 0 2>/dev/null
}
trap cleanup EXIT
trap 'log "interrupted (Ctrl+C)"; exit 130' INT

# ================================================================== S0
say "Log: $LOG"
section "START diag-steam-gamescope $(date -Iseconds)"
log "options: res=${RES:-auto} freeze_s=$FREEZE_S gs_extra='$GS_EXTRA' use_e=$USE_E keep=$KEEP dry=$DRY"
import_session_env
find_project

for b in gamescope steam wmctrl xprop xwininfo xrandr systemctl systemd-run; do
  command -v "$b" >/dev/null || { [ "$b" = xwininfo ] && log "WARN: xwininfo missing (xorg-xwininfo)"; [ "$b" = xprop ] && log "WARN: xprop missing (xorg-xprop)"; case "$b" in xprop|xwininfo) ;; *) die "manca '$b'";; esac; }
done
systemctl --user show-environment >/dev/null 2>&1 || die "systemctl --user non raggiungibile (DBUS/XDG_RUNTIME_DIR?)"
wmctrl -d >/dev/null 2>&1 || die "wmctrl non parla con DISPLAY=$DISPLAY (XAUTHORITY=${XAUTHORITY:-unset})"

section "SYSTEM"
run uname -r
grep -m1 PRETTY_NAME /etc/os-release >>"$LOG" 2>&1
run gamescope --version
run pacman -Q gamescope steam xorg-xwayland xorg-server openbox nvidia nvidia-open nvidia-dkms nvidia-open-dkms nvidia-utils lib32-nvidia-utils vulkan-icd-loader
command -v nvidia-smi >/dev/null && run nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
run cat /proc/driver/nvidia/version
echo "nvidia_drm modeset=$(cat /sys/module/nvidia_drm/parameters/modeset 2>/dev/null) fbdev=$(cat /sys/module/nvidia_drm/parameters/fbdev 2>/dev/null)" >>"$LOG"
run xrandr --listmonitors
run wmctrl -d
spaces_ctl state
dump_pads "before test"
run pgrep -a -u "$(id -u)" -x steam

if [ -z "$RES" ]; then
  RES="$(xrandr --current 2>/dev/null | awk '/ connected primary/{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+x[0-9]+\+/){split($i,a,"+"); print a[1]; exit}}')"
  [ -z "$RES" ] && RES="2560x1440"
fi
W="${RES%x*}"; H="${RES#*x}"
GS_CMD=(gamescope -W "$W" -H "$H" -w "$W" -h "$H" -f)
[ "$USE_E" = 1 ] && GS_CMD+=(-e)
# shellcheck disable=SC2206
[ -n "$GS_EXTRA" ] && GS_CMD+=($GS_EXTRA)
GS_CMD+=(-- steam -gamepadui)
log "planned: systemd-run --user --scope --collect --unit=$UNIT ${GS_CMD[*]}"

if [ "$DRY" = 1 ]; then
  log "dry-run: stop here"
  say "Dry-run completato. Log: $LOG"
  exit 0
fi

# ------------------------------------------------ giochi aperti negli spazi?
if [ -n "$SPY" ] && "$SPY" "$PROJ/spaces.py" ctl state 2>/dev/null | grep -q '"kind": "game"'; then
  say "ATTENZIONE: ci sono giochi aperti negli spazi. Per una prova pulita chiudili prima."
  ask PRE_GAMES "Proseguo lo stesso?"
  [ "${RESULT[PRE_GAMES]%% *}" = yes ] || exit 0
fi

# ================================================================== S1 Steam spento
section "S1 — Steam shutdown"
if pgrep -u "$(id -u)" -x steam >/dev/null; then
  ask S1_SHUTDOWN "Steam è in esecuzione: lo chiudo con 'steam -shutdown'?"
  [ "${RESULT[S1_SHUTDOWN]%% *}" = yes ] || die "Steam deve essere chiuso per la prova."
  run steam -shutdown
  for _ in $(seq 1 40); do pgrep -u "$(id -u)" -x steam >/dev/null || break; sleep 1; done
  if pgrep -u "$(id -u)" -x steam >/dev/null; then
    run pgrep -a -u "$(id -u)" steam
    die "Steam non si è chiuso entro 40 s (vedi log). Chiudilo e rilancia lo script."
  fi
  sleep 3
fi
log "Steam not running"

# ================================================================== S2 / T1
section "S2 — launch gamescope + Steam in desktop 4 (space 3)"
goto_desktop 3
setsid -f systemd-run --user --scope --collect --unit="$UNIT" "${GS_CMD[@]}" >"$GS_LOG" 2>&1 </dev/null
for _ in $(seq 1 15); do scope_active && break; sleep 1; done
scope_active || die "lo scope $UNIT non è partito (vedi $GS_LOG)"
log "scope $UNIT active"

say "Attendo la finestra di gamescope (max 60 s)…"
GSWIN=""
for _ in $(seq 1 60); do
  for p in $(scope_pids); do
    GSWIN="$(wmctrl -lp 2>/dev/null | awk -v p="$p" '$3==p{print $1; exit}')"
    [ -n "$GSWIN" ] && break
  done
  [ -n "$GSWIN" ] && break
  sleep 1
done
if [ -n "$GSWIN" ]; then
  log "gamescope window: $GSWIN"
  section "GAMESCOPE WINDOW $GSWIN"
  command -v xprop >/dev/null && run xprop -id "$GSWIN" WM_CLASS WM_NAME _NET_WM_NAME _NET_WM_PID _NET_WM_DESKTOP _NET_WM_STATE _NET_WM_WINDOW_TYPE
  command -v xwininfo >/dev/null && run xwininfo -id "$GSWIN" -stats
else
  log "WARN: no Openbox window owned by a process of the scope after 60 s"
fi
say "Attendo che Steam carichi Big Picture (40 s)…"
sleep 40
dump_scope "after start"
dump_windows "after start"
spaces_ctl clients
dump_pads "Big Picture running"

ask T1_BP   "T1 — Sulla TV vedi Big Picture a schermo intero (dentro lo spazio 3)?"
ask T1_PAD  "T1 — Big Picture si comanda col controller (navigazione, A/B)?"
ask T1_SPACE "T1 — Select + D-pad / Select+L1+R1 fanno qualcosa mentre sei in Big Picture? (s = sì, descrivi nella nota)"

# ================================================================== T2
section "T2 — game launched FROM Big Picture"
pause "T2 — Da Big Picture avvia un gioco Steam e aspetta di essere in gioco."
if wait_games 240; then
  sleep 20
  dump_games "T2 in game"
  dump_scope "T2 in game"
  dump_windows "T2 in game"
  ask T2_ON_TOP "T2 — Il gioco è a schermo intero sopra Big Picture e si comanda col controller?"
  ask T2_OVERLAY "T2 — Il tasto Guide/Steam apre l'overlay di Steam sopra il gioco?"
  pause "T2 — Chiudi il gioco (dal gioco o dall'overlay di Steam)."
  for _ in $(seq 1 30); do pgrep -u "$(id -u)" -f 'SteamLaunch AppId=' >/dev/null || break; sleep 1; done
  dump_games "T2 after close" || true
  ask T2_BACK "T2 — Chiuso il gioco, sei tornato a Big Picture senza schermo nero?"
else
  log "T2: no game detected within 240 s"
  RESULT[T2_ON_TOP]="no game detected"
fi

# ================================================================== T3
section "T3 — game launched FROM the Dashboard (steam://rungameid)"
goto_desktop 0
spaces_ctl state
pause "T3 — Ora sei sulla Dashboard (spazio 0): lancia un gioco Steam dalla sua card. NON cambiare spazio a mano."
T3_GAME=0
if wait_games 240; then
  T3_GAME=1
  sleep 20
  dump_games "T3 in game"
  dump_scope "T3 in game"
  dump_windows "T3 in game"
  spaces_ctl state
  spaces_ctl clients
  ask T3_SPLASH "T3 — La splash di lancio della Dashboard si è chiusa da sola? (nota: dopo quanto, o cosa mostra)"
  log "switching to desktop 4 to look for the game inside gamescope"
  goto_desktop 3
  ask T3_INSIDE "T3 — Nello spazio 3 vedi il gioco a schermo intero (dentro gamescope)?"
else
  log "T3: no game detected within 240 s"
  RESULT[T3_INSIDE]="no game detected"
fi

# ================================================================== T4
section "T4 — freeze / thaw of the whole scope"
if [ "$T3_GAME" = 1 ]; then
  say "T4 si fa con il gioco di T3 ancora aperto."
else
  say "T4 si fa con Big Picture (nessun gioco aperto)."
fi
goto_desktop 0
sleep 3        # spaces.py scongela la Dashboard tornando allo spazio 0
log "freezing $UNIT.scope"
T_A="$(date +%s%3N)"
run systemctl --user freeze "$UNIT.scope" && FROZEN=1
T_B="$(date +%s%3N)"
log "freeze took $((T_B - T_A)) ms; FreezerState=$(systemctl --user show -p FreezerState --value "$UNIT.scope")"
sleep 2
dump_scope "frozen"
dump_pads "Steam frozen"
say "Scope congelato. Per ${FREEZE_S} s usa il controller sulla Dashboard (muoviti, apri il menu…)."
for s in $(seq "$FREEZE_S" -5 1); do printf '\r    %3d s ' "$s" >/dev/tty; sleep 5; done; printf '\n' >/dev/tty
ask T4_NOINPUT "T4 — Mentre era congelato, Steam o il gioco hanno reagito al controller (suoni, menu, movimenti)? (s = sì, reagivano: MALE)"
ask T4_DASH    "T4 — La Dashboard ha risposto normalmente al controller?"
log "thawing $UNIT.scope"
T_A="$(date +%s%3N)"
run systemctl --user thaw "$UNIT.scope" && FROZEN=0
T_B="$(date +%s%3N)"
log "thaw took $((T_B - T_A)) ms; FreezerState=$(systemctl --user show -p FreezerState --value "$UNIT.scope")"
sleep 0.5
goto_desktop 3
sleep 3
dump_scope "thawed"
ask T4_RESUME "T4 — Nello spazio 3 il gioco (o Big Picture) è ripreso senza schermo nero né blocchi?"
ask T4_AUDIO  "T4 — L'audio è ripreso (se c'era)?"
ask T4_PAD    "T4 — Il controller funziona di nuovo nel gioco / in Big Picture?"
if [ "$T3_GAME" = 1 ]; then
  pause "T4 — Chiudi il gioco (dal gioco o dall'overlay di Steam) e torna a Big Picture."
  for _ in $(seq 1 30); do pgrep -u "$(id -u)" -f 'SteamLaunch AppId=' >/dev/null || break; sleep 1; done
fi

# ================================================================== T5
section "T5 — Steam shutdown, gamescope exit"
if [ "$KEEP" = 1 ]; then
  log "--keep-running: Steam/gamescope left running (scope $UNIT)"
  say "Steam resta aperto nello scope $UNIT (systemctl --user stop $UNIT.scope per chiuderlo)."
else
  run steam -shutdown
  GONE=0
  for _ in $(seq 1 45); do scope_active || { GONE=1; break; }; sleep 1; done
  if [ "$GONE" = 1 ]; then
    log "T5: scope gone after Steam shutdown (gamescope exited with Steam)"
    RESULT[T5_EXIT]="yes (automatic)"
  else
    log "T5: scope still active 45 s after steam -shutdown"
    dump_scope "45 s after steam -shutdown"
    RESULT[T5_EXIT]="no — scope still active"
    run systemctl --user stop "$UNIT.scope"
  fi
fi
goto_desktop 0
dump_windows "end"

# ================================================================== log esterni
section "GAMESCOPE / STEAM OUTPUT (tail $GS_LOG)"
tail -n 300 "$GS_LOG" >>"$LOG" 2>&1
section "STEAM console_log (lines since test start, tail)"
for f in "$HOME/.local/share/Steam/logs/console_log.txt" "$HOME/.steam/steam/logs/console_log.txt"; do
  if [ -f "$f" ] && [ "$(stat -c %Y "$f")" -ge "$START_EPOCH" ]; then echo "--- $f" >>"$LOG"; tail -n 150 "$f" >>"$LOG"; break; fi
done
section "spaces.py (tray.log, tail)"
grep '\[spaces\]' "${XDG_DATA_HOME:-$HOME/.local/share}/x-launcher/tray.log" 2>/dev/null | tail -n 150 >>"$LOG"
section "journalctl --user (since test start, filtered)"
journalctl --user --since "@$START_EPOCH" --no-pager -o short-precise 2>/dev/null \
  | grep -iE 'gamescope|steam|xlauncher-steamtest|freez|thaw' | tail -n 200 >>"$LOG"
section "kernel (nvidia/drm since test start)"
journalctl -k --since "@$START_EPOCH" --no-pager -o short-precise 2>&1 \
  | grep -iE 'nvidia|NVRM|Xid|drm' | tail -n 100 >>"$LOG"
XID="$(journalctl -k --since "@$START_EPOCH" --no-pager 2>/dev/null | grep -c 'Xid')"

# ================================================================== riepilogo
section "SUMMARY"
{
  echo "gamescope: $(gamescope --version 2>&1 | head -1)"
  echo "driver:    $(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null || echo '?')"
  echo "command:   ${GS_CMD[*]}"
  echo "window:    ${GSWIN:-not found}"
  echo "Xid errors in kernel log: ${XID:-?}"
  for k in $(printf '%s\n' "${!RESULT[@]}" | sort); do printf '  %-12s %s\n' "$k" "${RESULT[$k]}"; done
} | tee -a "$LOG"
say ""
say "Fatto. Log completo: $LOG"
say "Output grezzo di gamescope: $GS_LOG"
