#!/usr/bin/env bash
# diag-uri-launch.sh — prova del lancio di un gioco TRAMITE URI del launcher condiviso
# (uplay://launch/<id>/0, origin2://game/launch?offerIds=<id>), senza toccare la Dashboard.
#
# Riproduce, a mano e con log, gli stessi comandi che il backend usa oggi per il launcher
# condiviso (sharedLauncherManager.ts / ProtonRunner), cambiando una sola cosa: all'eseguibile
# del LAUNCHER si passa l'URI come argomento, invece di lanciare l'exe del gioco.
#
# Modalità (--mode):
#   light  (default) wine della build Proton, WINEFSYNC=1, stessa prefix: è il "lancio leggero"
#                    di launchGameInSharedPrefix(); giusto con il launcher GIÀ aperto, ma prova
#                    anche l'avvio a freddo (il launcher parte e poi esegue l'URI).
#   start            come light, ma con `wine start "<uri>"`: passa dal gestore di protocollo
#                    registrato nel registro della prefix (ShellExecute), non dall'exe del launcher.
#   full             lancio completo dentro uno scope systemd, come il backend lo fa per il launcher
#                    condiviso: `proton run <exe> <uri>` (con --umu: `umu-run <exe> <uri>`).
#                    È il modo per provare il LANCIO A FREDDO con container completo.
#
# Uso:
#   ./scripts/diag-uri-launch.sh ubisoft-connect 'uplay://launch/<APPID>/0'
#   ./scripts/diag-uri-launch.sh ubisoft-connect 'uplay://launch/<APPID>/0' --mode start
#   ./scripts/diag-uri-launch.sh ubisoft-connect 'uplay://launch/<APPID>/0' --mode full --umu
#   ./scripts/diag-uri-launch.sh ea-app 'origin2://game/launch?offerIds=<offerId>&autoDownload=1'
#   ./scripts/diag-uri-launch.sh ubisoft-connect --status        # solo stato (launcher/gioco in corso)
#
# Opzioni:
#   --mode light|start|full     vedi sopra
#   --umu                       solo con --mode full: usa umu-run invece di `proton run`
#   --watch SECONDI             quanto osservare i processi dopo il lancio (default 90)
#   --game-exe NOME.exe         nome del processo del gioco da cercare (es. ACS.exe); senza,
#                               mostra tutti i processi .exe nuovi comparsi nella prefix
#   --dry-run                   stampa il comando e esce
#   --exe /percorso/launcher.exe     forza l'eseguibile del launcher (default: dal daemon)
#   --runner NOME_BUILD         forza la build Proton (es. GE-Proton9-27; default: dal daemon)
# Variabili: XLAUNCHER_URL (default http://localhost:3000)
#
# Il log del lancio va in ~/.local/share/x-launcher/diag-uri/<data>.log (incolla qui le righe
# interessanti quando ne parliamo).
#
# Richiede: python3, curl (per leggere exe/runner dal daemon; con --exe e --runner non serve).

set -uo pipefail

DAEMON_URL="${XLAUNCHER_URL:-http://localhost:3000}"

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
DATA_DIR="$HOME/.local/share/x-launcher"
MODE=light; USE_UMU=0; WATCH=90; GAME_EXE=""; DRY=0; EXE=""; RUNNER=""; STATUS=0
LAUNCHER_ID="${1:-}"; shift || true
URI=""
if [ -n "${1:-}" ] && [[ "$1" != --* ]]; then URI="$1"; shift; fi
while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --umu) USE_UMU=1; shift ;;
    --watch) WATCH="${2:-90}"; shift 2 ;;
    --game-exe) GAME_EXE="${2:-}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --exe) EXE="${2:-}"; shift 2 ;;
    --runner) RUNNER="${2:-}"; shift 2 ;;
    --status) STATUS=1; shift ;;
    -h|--help) sed -n '2,/^# Richiede/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opzione sconosciuta: $1 (usa --help)" >&2; exit 2 ;;
  esac
done

die() { echo "Errore: $*" >&2; exit 1; }
[ -n "$LAUNCHER_ID" ] || die "uso: $0 <ubisoft-connect|ea-app> '<uri>' [--mode light|start|full] (vedi --help)"
case "$MODE" in light|start|full) ;; *) die "--mode deve essere light, start o full" ;; esac
[ "$STATUS" = 1 ] || [ -n "$URI" ] || die "manca l'URI da lanciare"

BASE="$DATA_DIR/shared-launchers/$LAUNCHER_ID/prefix"
PFX="$BASE/pfx"
[ -d "$PFX" ] || die "prefix condivisa non trovata: $PFX"

# --- exe del launcher e build Proton: dalla card "<id>-launcher" nel daemon (stessa fonte del backend)
if [ -z "$EXE" ] || [ -z "$RUNNER" ]; then
  GJSON="$(xl_curl -sf "${DAEMON_URL}/api/games?store=All" 2>/dev/null)" || die "daemon non raggiungibile su ${DAEMON_URL} (usa --exe e --runner per farne a meno)"
  FIELDS="$(printf '%s' "$GJSON" | python3 -c "
import json,sys
gid=sys.argv[1]+'-launcher'
for g in json.load(sys.stdin):
    if g.get('id')==gid:
        print(g.get('executablePath') or ''); print(g.get('runner') or ''); break
" "$LAUNCHER_ID")"
  [ -n "$EXE" ] || EXE="$(printf '%s\n' "$FIELDS" | sed -n 1p)"
  [ -n "$RUNNER" ] || RUNNER="$(printf '%s\n' "$FIELDS" | sed -n 2p)"
fi
[ -n "$EXE" ] || die "eseguibile del launcher sconosciuto (apri la card ${LAUNCHER_ID}-launcher almeno una volta, oppure usa --exe)"
[ -n "$RUNNER" ] || die "build Proton sconosciuta (usa --runner)"
EXE="${EXE/#\~/$HOME}"

PROTON_DIR=""; for d in \
  "$HOME/.steam/steam/steamapps/common/$RUNNER" \
  "$HOME/.local/share/Steam/steamapps/common/$RUNNER" \
  "$HOME/.local/share/Steam/compatibilitytools.d/$RUNNER"; do
  [ -x "$d/proton" ] && { PROTON_DIR="$d"; break; }
done
[ -n "$PROTON_DIR" ] || die "build Proton \"$RUNNER\" non trovata nelle cartelle di Steam"
WINE=""; for w in "$PROTON_DIR/files/bin/wine" "$PROTON_DIR/dist/bin/wine"; do [ -x "$w" ] && { WINE="$w"; break; }; done
[ -n "$WINE" ] || die "binario wine non trovato dentro $PROTON_DIR"

EXE_BASE="$(basename "$EXE")"
# winepath-like semplice: solo per mostrare; wine accetta anche il percorso unix
mkdir -p "$DATA_DIR/diag-uri"
LOG="$DATA_DIR/diag-uri/$(date +%Y%m%d-%H%M%S)-$LAUNCHER_ID.log"

snapshot() {   # processi Wine nella prefix (cmdline con .exe) + scope systemd xlauncher-*
  echo "--- processi .exe con WINEPREFIX=$PFX"
  for p in /proc/[0-9]*; do
    if cat "$p/environ" 2>/dev/null | tr '\0' '\n' | grep -qx "WINEPREFIX=$PFX"; then
      c="$(cat "$p/cmdline" 2>/dev/null | tr '\0' ' ')"
      case "$c" in *.exe*|*.EXE*) echo "  pid=${p#/proc/} $c" ;; esac
    fi
  done | sort -u
  echo "--- scope systemd xlauncher-*"
  systemctl --user list-units --type=scope --no-legend 'xlauncher-*' 2>/dev/null | sed 's/^/  /' || true
}

echo "=== diag-uri-launch ($(date +%H:%M:%S)) ==="
echo "launcher : $LAUNCHER_ID"
echo "exe      : $EXE"
echo "runner   : $RUNNER ($PROTON_DIR)"
echo "prefix   : $PFX"
echo "uri      : ${URI:-—}   modo: $MODE$([ "$USE_UMU" = 1 ] && echo " (umu-run)")"
echo "log      : $LOG"
snapshot
[ "$STATUS" = 1 ] && exit 0

export WINEPREFIX="$PFX"
case "$MODE" in
  light)
    CMD=(env WINEPREFIX="$PFX" WINEFSYNC=1 WINEDEBUG='err+all,+seh' "$WINE" "$EXE" "$URI") ;;
  start)
    CMD=(env WINEPREFIX="$PFX" WINEFSYNC=1 WINEDEBUG='err+all' "$WINE" start "$URI") ;;
  full)
    SCOPE="xlauncher-shared-launcher-${LAUNCHER_ID}-$(date +%s%3N)"
    ENVV=(STEAM_COMPAT_DATA_PATH="$BASE" STEAM_COMPAT_CLIENT_INSTALL_PATH="$HOME/.local/share/Steam" PROTON_USE_XALIA=0 DXVK_ASYNC=1)
    if [ "$USE_UMU" = 1 ]; then
      command -v umu-run >/dev/null || die "umu-run non trovato"
      ENVV+=(WINEPREFIX="$PFX" PROTONPATH="$PROTON_DIR" GAMEID="x-launcher-diag-$LAUNCHER_ID")
      CMD=(systemd-run --user --scope --collect --unit "$SCOPE" env "${ENVV[@]}" umu-run "$EXE" "$URI")
    else
      CMD=(systemd-run --user --scope --collect --unit "$SCOPE" env "${ENVV[@]}" "$PROTON_DIR/proton" run "$EXE" "$URI")
    fi ;;
esac
echo
echo "comando  : ${CMD[*]}"
[ "$DRY" = 1 ] && exit 0

echo "[$(date +%T)] lancio… (log completo in $LOG)"
{ echo "# $(date -Is)  ${CMD[*]}"; } >> "$LOG"
"${CMD[@]}" >> "$LOG" 2>&1 &
CPID=$!

echo "osservo per ${WATCH}s i processi nella prefix (CTRL+C per interrompere; il lancio resta vivo)…"
T0=$(date +%s); LAST=""
while [ $(( $(date +%s) - T0 )) -lt "$WATCH" ]; do
  sleep 3
  NOW="$(snapshot | sed -E 's/pid=[0-9]+ //')"
  if [ "$NOW" != "$LAST" ]; then
    echo; echo "[$(( $(date +%s) - T0 ))s] cambiamento:"; snapshot
    LAST="$NOW"
  fi
  if [ -n "$GAME_EXE" ] && pgrep -f "$GAME_EXE" >/dev/null 2>&1; then
    echo; echo "[$(( $(date +%s) - T0 ))s] ✔ processo del gioco ($GAME_EXE) in esecuzione:"
    pgrep -af "$GAME_EXE" | sed 's/^/  /'
    echo "  scope del gioco (cgroup):"
    for pid in $(pgrep -f "$GAME_EXE"); do sed 's/^/    /' "/proc/$pid/cgroup" 2>/dev/null | head -2; done
    break
  fi
done
echo
echo "=== fine osservazione ==="
snapshot
echo
echo "Ultime righe del log ($LOG):"; tail -n 25 "$LOG" 2>/dev/null
kill -0 "$CPID" 2>/dev/null && echo "(il comando di lancio è ancora in esecuzione: pid $CPID)"
exit 0
