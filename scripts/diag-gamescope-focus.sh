#!/usr/bin/env bash
# =============================================================
#  diag-gamescope-focus.sh — test PICCOLO e NON DISTRUTTIVO sul controllo
#  del focus in gamescope (sessione Kiosk).
#
#  NON fa parte del runtime di X-Launcher. NON sposta, smappa, riparenta ne'
#  minimizza nessuna finestra esistente (il test lungo diag-gamespace.sh lo
#  faceva, e in Kiosk ha lasciato la sessione inutilizzabile).
#
#  Cosa verifica:
#   S1 stato      cosa dice gamescope: finestra a fuoco, app focalizzabili,
#                 mappa finestra -> appid -> pid (dalle proprieta' della root)
#   S2 sonda      una finestra NUOVA (creata dallo script, magenta, ~5 s) prende
#                 il focus? Alla chiusura il focus torna a quella di prima?
#   S3 controllo  gamescope obbedisce a proprieta' scritte sulla root?
#                 (GAMESCOPECTRL_BASELAYER_APPID / _WINDOW: i nomi sono quelli che
#                 ricordo usati da Steam, NON verificati). Dopo ogni prova
#                 ripristina il focus originale e cancella la proprieta'.
#   S4 (opzionale, --with-steam-game) imposta STEAM_GAME su una finestra e
#                 guarda se cambia l'appid visto da gamescope; poi lo rimuove.
#
#  Uso: da SSH, con la Dashboard e un gioco (avviato da X-Launcher) in esecuzione,
#  PREFERIBILMENTE col gioco in primo piano:
#    ./scripts/diag-gamescope-focus.sh --display :N
#
#  Opzioni:
#    --display :N        display X di gamescope (default: $DISPLAY / autodetect)
#    --no-interactive    nessuna domanda (niente osservazione visiva)
#    --skip-probe        salta S2 (finestra di prova)
#    --with-steam-game   abilita S4
#    --out FILE          log (default ~/x-launcher-diag-gamescope-focus-<data>.log)
# =============================================================
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

OPT_DISPLAY=""
INTERACTIVE=1
SKIP_PROBE=0
WITH_STEAMGAME=0
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$HOME/x-launcher-diag-gamescope-focus-$STAMP.log"

while [ $# -gt 0 ]; do
  case "$1" in
    --display) OPT_DISPLAY="${2:-}"; shift ;;
    --no-interactive) INTERACTIVE=0 ;;
    --skip-probe) SKIP_PROBE=1 ;;
    --with-steam-game) WITH_STEAMGAME=1 ;;
    --out) OUT_FILE="${2:-$OUT_FILE}"; shift ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "Opzione sconosciuta: $1 (usa --help)"; exit 2 ;;
  esac
  shift
done

TMP="$(mktemp -d /tmp/xl-focus.XXXXXX)"
BODY="$TMP/body.log"; HELPER="$TMP/helper.py"; : > "$BODY"
declare -a SUMMARY=()
add_s() { SUMMARY+=("$1"); }
say()  { printf '%s\n' "$*" | tee -a "$BODY"; }
note() { printf '%s\n' "$*" >> "$BODY"; }
sec()  { say ""; say "=== [$1] $2 ==="; }
trap 'rm -rf "$TMP"' EXIT
trap 'echo; echo "Interrotto."; exit 130' INT TERM

TTY_IN="${XL_DIAG_TTY:-/dev/tty}"
if [ "$INTERACTIVE" = 1 ]; then
  if ! { exec 3<"$TTY_IN"; } 2>/dev/null; then INTERACTIVE=0; echo "Nessun terminale interattivo: modalita' --no-interactive."; fi
fi
ANSWER=""
ask() { # ask "prompt" "regex" default
  ANSWER="${3:-}"
  [ "$INTERACTIVE" = 1 ] || return 0
  local a
  while true; do
    printf '%s ' "$1"
    if ! read -r -u 3 a; then ANSWER="${3:-}"; return 0; fi
    a="$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')"
    if [[ "$a" =~ $2 ]]; then ANSWER="$a"; note "    [domanda: $1 -> '$a']"; return 0; fi
  done
}

# ---------------------------------------------------------------- helper Python
cat > "$HELPER" <<'PYEOF'
#!/usr/bin/env python3
# helper di diag-gamescope-focus.sh — non va lanciato a mano
import os, sys, time, re
try:
    from Xlib import X, display, error, Xatom
except Exception as e:
    print(f"XLIB_IMPORT_FAIL: {e}", flush=True)
    sys.exit(3)

def out(*a):
    print(*a, flush=True)

def conn():
    try:
        return display.Display()
    except Exception as e:
        out(f"X_CONNECT_FAIL: {e}")
        sys.exit(4)

def aname(d, a):
    try:
        return d.get_atom_name(a)
    except Exception:
        return f"<{a}>"

def get_prop(d, w, name):
    try:
        a = d.intern_atom(name, True)
        if not a:
            return None
        return w.get_full_property(a, X.AnyPropertyType)
    except Exception:
        return None

def cards(d, w, name):
    r = get_prop(d, w, name)
    if r is None:
        return None
    try:
        return list(r.value)
    except Exception:
        return None

def text(d, w, name):
    r = get_prop(d, w, name)
    if r is None:
        return None
    v = r.value
    if isinstance(v, (bytes, bytearray)):
        return bytes(v).decode("utf-8", "replace")
    return str(v)

def winfo(d, wid):
    w = d.create_resource_object("window", wid)
    cls = ""
    try:
        c = w.get_wm_class()
        cls = "/".join(c) if c else ""
    except Exception:
        pass
    name = text(d, w, "_NET_WM_NAME") or text(d, w, "WM_NAME") or ""
    pid = (cards(d, w, "_NET_WM_PID") or [None])[0]
    scope = None
    if pid:
        try:
            cg = open(f"/proc/{pid}/cgroup").read()
            m = re.search(r"(xlauncher-(?:game|shared-launcher)-[^/]+?)\.scope", cg)
            scope = m.group(1) if m else None
        except Exception:
            pass
    if scope and scope.startswith("xlauncher-game-"):
        role = "game"
    elif re.search(r"chrom|brave|firefox", cls, re.I) or "x-launcher" in name.lower():
        role = "dashboard"
    else:
        role = "other"
    return {"id": wid, "cls": cls, "name": name, "pid": pid, "scope": scope, "role": role}

def gs_state(d):
    root = d.screen().root
    fw = cards(d, root, "GAMESCOPE_FOCUSED_WINDOW") or []
    fa = cards(d, root, "GAMESCOPE_FOCUSABLE_APPS") or []
    fwin = cards(d, root, "GAMESCOPE_FOCUSABLE_WINDOWS") or []
    trip = [(fwin[i], fwin[i + 1], fwin[i + 2]) for i in range(0, len(fwin) - 2, 3)]
    return (fw[0] if fw else None), fa, trip

def pick(d, want):
    fw, fa, trip = gs_state(d)
    cur_app = next((a for (w, a, p) in trip if w == fw), None)
    infos = {w: winfo(d, w) for (w, a, p) in trip}
    tgt = None
    for (w, a, p) in trip:
        if w == fw:
            continue
        if want == "auto" or infos[w]["role"] == want:
            tgt = (w, a, p)
            break
    return {"fw": fw, "cur_app": cur_app, "tgt": tgt, "trip": trip, "apps": fa, "infos": infos}

def poll_focus(d, secs, stop_when=None):
    root = d.screen().root
    t0 = time.time()
    last = "?"
    stable = None
    while time.time() - t0 < secs:
        fw = (cards(d, root, "GAMESCOPE_FOCUSED_WINDOW") or [None])[0]
        if fw != last:
            out(f"      +{time.time() - t0:5.2f}s FOCUSED_WINDOW={fw}")
            last = fw
            stable = time.time()
        if stop_when is not None and fw == stop_when and time.time() - stable > 0.6:
            break
        time.sleep(0.05)
    return last

def setprop(d, name, values):
    root = d.screen().root
    root.change_property(d.intern_atom(name), Xatom.CARDINAL, 32, list(values))
    d.sync()

def delprop(d, name):
    root = d.screen().root
    root.delete_property(d.intern_atom(name))
    d.sync()

def cmd_state(d):
    st = pick(d, "auto")
    out(f"FOCUSED_WINDOW={st['fw']}  FOCUSABLE_APPS={st['apps']}  app_del_focus={st['cur_app']}")
    if not st["trip"]:
        out("ATTENZIONE: GAMESCOPE_FOCUSABLE_WINDOWS vuota o assente (e' gamescope questa sessione?)")
    for (w, a, p) in st["trip"]:
        i = st["infos"][w]
        mark = "  <== a fuoco" if w == st["fw"] else ""
        out(f"ENTRY finestra={w} (0x{w:x}) appid={a} pid_gamescope={p} role={i['role']} class={i['cls']!r} "
            f"name={i['name']!r} _NET_WM_PID={i['pid']} scope={i['scope']}{mark}")
    names = sorted(aname(d, a) for a in d.screen().root.list_properties())
    ctl = [n for n in names if re.search(r"GAMESCOPECTRL|STEAM", n, re.I)]
    out(f"PROPRIETA_ROOT_CTRL_O_STEAM_PRESENTI={ctl if ctl else 'nessuna (normale: le scrive chi comanda, es. Steam)'}")
    same = all(a == w for (w, a, p) in st["trip"]) if st["trip"] else None
    out(f"SUMMARY: S1 finestra a fuoco={st['fw']}, app focalizzabili={st['apps']}; appid==id finestra per tutte le finestre={same}")
    for (w, a, p) in st["trip"]:
        i = st["infos"][w]
        out(f"SUMMARY: S1 finestra {w}: role={i['role']} class={i['cls']} scope={i['scope']} appid={a}")

def cmd_probe(d):
    root = d.screen().root
    scr = d.screen()
    fw0 = gs_state(d)[0]
    w = root.create_window(100, 100, 640, 360, 0, scr.root_depth, X.InputOutput, X.CopyFromParent,
                           background_pixel=0xCC22CC, event_mask=X.StructureNotifyMask)
    w.set_wm_name("xl-focus-probe")
    w.set_wm_class("xl-focus-probe", "XlFocusProbe")
    w.change_property(d.intern_atom("_NET_WM_PID"), Xatom.CARDINAL, 32, [os.getpid()])
    w.map()
    d.sync()
    out(f"PROBE: creata e mappata la finestra magenta 0x{w.id:x}; focus iniziale={fw0}")
    last = poll_focus(d, 4.0, stop_when=w.id)
    got = last == w.id
    out(f"PROBE_RESULT: la finestra NUOVA ha preso il focus = {got} (focus={last})")
    time.sleep(1.0)
    out("PROBE: chiudo la finestra di prova")
    w.destroy()
    d.sync()
    last2 = poll_focus(d, 4.0, stop_when=fw0)
    back = last2 == fw0
    out(f"PROBE_RESULT: dopo la chiusura il focus e' tornato alla finestra di prima = {back} (focus={last2}, prima={fw0})")
    out(f"SUMMARY: S2 una finestra nuova mappata prende il focus: {got}; alla chiusura il focus torna a quella di prima: {back}")

def cmd_trial(d, prop, mode, want):
    st = pick(d, want)
    if st["tgt"] is None or st["fw"] is None:
        out("TRIAL_SKIP: servono almeno due finestre focalizzabili distinte")
        out(f"SUMMARY: S3 {prop}/{mode}: non eseguita (finestre focalizzabili insufficienti)")
        return
    tw, ta, tp = st["tgt"]
    ti = st["infos"][tw]
    cur_w, cur_a = st["fw"], st["cur_app"]
    vals = {"appid": [ta], "appid2": [ta, cur_a], "window": [tw]}[mode]
    out(f"TRIAL {prop} [{mode}] scrivo {vals}  (a fuoco ora: finestra {cur_w} app {cur_a}; "
        f"bersaglio: finestra {tw} app {ta} role={ti['role']} {ti['cls']!r})")
    setprop(d, prop, vals)
    last = poll_focus(d, 4.0, stop_when=tw)
    moved = last == tw
    out(f"TRIAL_RESULT {prop}/{mode}: focus dopo la scrittura={last}  spostato sul bersaglio={moved}")
    back_vals = {"appid": [cur_a], "appid2": [cur_a], "window": [cur_w]}[mode]
    out(f"TRIAL_RESTORE {prop}/{mode}: riscrivo l'originale {back_vals}, poi cancello la proprieta'")
    setprop(d, prop, back_vals)
    poll_focus(d, 4.0, stop_when=cur_w)
    delprop(d, prop)
    last3 = poll_focus(d, 1.5)
    ok = last3 == cur_w
    out(f"TRIAL_RESTORE {prop}/{mode}: focus finale={last3} originale={cur_w} ripristinato={ok}")
    out(f"SUMMARY: S3 {prop} [{mode}] scritta {vals}: gamescope ha spostato il focus sul bersaglio={moved}; focus ripristinato={ok}")

def cmd_steamgame(d, wid, val):
    w = d.create_resource_object("window", wid)
    before = gs_state(d)
    out(f"STEAMGAME prima: focus={before[0]} apps={before[1]} triple={before[2]}")
    w.change_property(d.intern_atom("STEAM_GAME"), Xatom.CARDINAL, 32, [val])
    d.sync()
    time.sleep(1.5)
    mid = gs_state(d)
    out(f"STEAMGAME dopo aver impostato STEAM_GAME={val} su {wid}: focus={mid[0]} apps={mid[1]} triple={mid[2]}")
    w.delete_property(d.intern_atom("STEAM_GAME"))
    d.sync()
    time.sleep(1.5)
    after = gs_state(d)
    out(f"STEAMGAME dopo la rimozione: focus={after[0]} apps={after[1]} triple={after[2]}")
    changed = before[1] != mid[1]
    out(f"SUMMARY: S4 impostare STEAM_GAME={val} su {wid} cambia le app focalizzabili viste da gamescope: {changed}")

def main():
    sub = sys.argv[1] if len(sys.argv) > 1 else ""
    d = conn()
    if sub == "state":
        cmd_state(d)
    elif sub == "probe":
        cmd_probe(d)
    elif sub == "trial":
        cmd_trial(d, sys.argv[2], sys.argv[3], sys.argv[4])
    elif sub == "steamgame":
        cmd_steamgame(d, int(sys.argv[2]), int(sys.argv[3]))
    else:
        out(f"sottocomando sconosciuto: {sub}")
        sys.exit(2)

main()
PYEOF

hx() { # hx <timeout> subcomando args...
  local t="$1"; shift
  say "\$ [python] helper $*"
  RUN_OUT="$(timeout "$t" "$PY" "$HELPER" "$@" 2>&1 | grep -v 'Xlib.xauth')"
  [ -n "$RUN_OUT" ] && printf '%s\n' "$RUN_OUT" | sed 's/^/    /' | tee -a "$BODY"
  while IFS= read -r l; do
    case "$l" in *"SUMMARY: "*) add_s "${l#*SUMMARY: }" ;; esac
  done <<< "$RUN_OUT"
}

# ---------------------------------------------------------------- Python e display
PY=""
for cand in "$PROJECT_DIR/.venv-tray/bin/python" "$(command -v python3 || true)"; do
  [ -n "$cand" ] && [ -x "$cand" ] || continue
  if "$cand" -c 'import Xlib' 2>/dev/null; then PY="$cand"; break; fi
done
if [ -z "$PY" ]; then echo "python-xlib non trovato (ne' nel venv del tray ne' nel Python di sistema)."; exit 1; fi

pick_display() {
  if [ -n "$OPT_DISPLAY" ]; then echo "$OPT_DISPLAY"; return; fi
  if [ -n "${DISPLAY:-}" ]; then echo "$DISPLAY"; return; fi
  local hint s n
  hint="$(grep -h 'ACTIVE-DISPLAY' "$HOME/.local/share/x-launcher/daemon.log" 2>/dev/null | tail -1 | grep -o ':[0-9]\+' | head -1)"
  if [ -n "$hint" ] && DISPLAY="$hint" timeout 4 xprop -root _NET_SUPPORTED >/dev/null 2>&1; then echo "$hint"; return; fi
  for s in /tmp/.X11-unix/X*; do
    [ -e "$s" ] || continue
    n=":${s##*/X}"
    if DISPLAY="$n" timeout 4 xprop -root >/dev/null 2>&1; then echo "$n"; return; fi
  done
  echo ""
}
DISP="$(pick_display)"
if [ -z "$DISP" ]; then echo "Nessun display X raggiungibile: passa --display :N (vedi [ACTIVE-DISPLAY] in daemon.log)."; exit 1; fi
export DISPLAY="$DISP"

say "X-Launcher — test focus gamescope (non distruttivo)"
say "Data: $(date -Is)   Utente: $(id -un)   Display: $DISPLAY   Python: $PY"
GS_PROC="$(pgrep -a -x gamescope | cut -c1-160)"
say "gamescope in esecuzione: ${GS_PROC:-NO (nessun processo 'gamescope': sei nella sessione giusta?)}"

# =============================================================== S1
sec S1 "Stato: cosa dice gamescope"
hx 20 state

if [ "$INTERACTIVE" = 1 ]; then
  say ""
  say "Il test NON tocca le finestre esistenti: scrive proprieta' sulla root di gamescope e crea una"
  say "finestra magenta di prova per qualche secondo. Per prudenza salva comunque la partita."
  ask "Procedo? [s/N]" '^[sn]$' n
  if [ "$ANSWER" != "s" ]; then add_s "test annullato dall'utente dopo S1"; ABORT=1; else ABORT=0; fi
else
  ABORT=0
fi

if [ "$ABORT" = 0 ]; then
  # ============================================================= S2
  sec S2 "Sonda: una finestra nuova prende il focus?"
  if [ "$SKIP_PROBE" = 1 ]; then say "(saltato: --skip-probe)"
  else
    say "Guarda lo schermo: comparira' una finestra magenta per ~5 secondi."
    hx 30 probe
    ask "Cosa hai visto? [m=finestra magenta a schermo, n=nessun cambiamento, a=altro/nero]" '^[mna]$' n
    add_s "S2 osservazione visiva della finestra di prova: '$ANSWER'"
  fi

  # ============================================================= S3
  sec S3 "Controllo via proprieta' sulla root (nomi non verificati)"
  say "Ogni prova scrive la proprieta' puntando all'ALTRA finestra, osserva GAMESCOPE_FOCUSED_WINDOW per 4s,"
  say "poi ripristina il focus originale e cancella la proprieta'."
  for variant in "GAMESCOPECTRL_BASELAYER_APPID appid" "GAMESCOPECTRL_BASELAYER_APPID appid2" "GAMESCOPECTRL_BASELAYER_WINDOW window"; do
    set -- $variant
    say "--- prova: $1 [$2]"
    hx 40 trial "$1" "$2" auto
    ask "    Durante la prova lo schermo e' cambiato? [d=Dashboard, g=gioco, n=nulla, a=altro/nero]" '^[dgna]$' n
    add_s "S3 $1 [$2]: osservazione visiva '$ANSWER'"
  done

  # ============================================================= S4
  sec S4 "STEAM_GAME su una finestra (opzionale)"
  if [ "$WITH_STEAMGAME" = 1 ]; then
    DASH_ID="$(grep -o 'ENTRY finestra=[0-9]* ([^)]*) appid=[0-9]* pid_gamescope=[0-9]* role=dashboard' "$BODY" | head -1 | sed 's/ENTRY finestra=\([0-9]*\).*/\1/')"
    if [ -n "$DASH_ID" ]; then
      say "Imposto STEAM_GAME=1001 sulla Dashboard ($DASH_ID), poi lo rimuovo."
      hx 30 steamgame "$DASH_ID" 1001
    else
      say "Finestra Dashboard non individuata: S4 saltato."
    fi
  else
    say "(saltato: abilitalo con --with-steam-game)"
  fi
fi

sec S5 "Stato finale"
hx 20 state

{
  echo "X-Launcher — test focus gamescope"
  echo "Generato: $(date -Is)   Display: $DISPLAY"
  echo
  echo "################ RIEPILOGO ################"
  for s in "${SUMMARY[@]}"; do echo " * $s"; done
  echo "###########################################"
  echo
  cat "$BODY"
} > "$OUT_FILE"
echo
echo "Fatto. Log: $OUT_FILE"
