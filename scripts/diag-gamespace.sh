#!/usr/bin/env bash
# =============================================================
#  diag-gamespace.sh — v3.2 — script diagnostico per il "gamespace manager"
#
#  v3.2: T13 logga le proprieta' solo quando il VALORE cambia (gamescope le
#  ripubblica ~100 volte al secondo e nella v3 saturavano il log); T06b e T15
#  sono DISATTIVATI di default (--with-unmap-primitive / --with-realcontainer):
#  in Kiosk hanno rotto la sessione. Per il controllo del focus in gamescope
#  usa il test piccolo e non distruttivo: scripts/diag-gamescope-focus.sh.
#  v3 (orientata al KIOSK/gamescope): T13 registra gli eventi X (comparsa,
#  mappatura, chiusura, proprieta') per costruire l'indice dei client; T06b prova
#  la primitiva "nascondi l'altro" (XUnmapWindow/XMapWindow); ogni verifica di
#  focus legge anche le proprieta' root di gamescope/Steam (riscontro); T15
#  riparenta DASHBOARD e GIOCO REALI in un contenitore e li alterna.
#  v2 (dopo il primo log in XFCE): include nei candidati le finestre
#  minimizzate (WM_STATE Iconic), prova il reparenting con app distinguibili
#  su un solo monitor, verifica i tasti premuti via evdev invece di chiederli,
#  e aggiunge T11 (congelamento dello scope del gioco + chi legge il pad) e
#  T12 (cosa fa oggi Select+D-pad nel backend). Xephyr e T08 sono ora opt-in.
#
#  NON fa parte del runtime di X-Launcher: raccoglie in un unico log
#  tutto ciò che serve per decidere l'architettura degli spazi
#  (tray.py come shell / spazi logici / workspace nativi / display
#  annidati / reparenting) sia nella sessione XFCE sia in Kiosk
#  (gamescope).
#
#  Cosa fa (ogni test e' indipendente: se uno non e' applicabile
#  viene saltato e il log dice perche'):
#    T00 ambiente          sessione, processi, strumenti, moduli Python
#    T01 finestre          inventario top-level completo via XQueryTree
#                          (nome, classe, PID, PID via X-Resource, cgroup/scope,
#                          mappatura, proprieta' gamescope/Steam)
#    T02 root + WM         proprieta' EWMH/gamescope della root, chi e' il WM
#    T03 redirect WM       un secondo WM potrebbe installarsi? (BadAccess?)
#    T04 CLI EWMH          xdotool / wmctrl / xrandr
#    T05 backend           /api/process-manager/list + scope cgroup + log daemon
#    T13 eventi X          [interattivo] registra per N secondi comparsa/chiusura
#                          delle finestre e cambi di proprieta' mentre lanci e
#                          chiudi un gioco (base per l'indice dei client)
#    T06 cambio finestra   [interattivo] raise/focus/activate sulla Dashboard
#                          e sul gioco: quale meccanismo funziona davvero?
#                          + T06b: primitiva "nascondi l'altro" (unmap/map)
#    T07 workspace XFCE    [interattivo, solo con WM EWMH] Chromium continua a
#                          ricevere il pad con la Dashboard su un altro desktop?
#    T08 controller        [--with-controller] codici evdev di Select e D-pad
#    T09 Xephyr            [--with-xephyr] display annidato (v1: risulta software)
#    T10 reparenting       una finestra reale puo' essere "dirottata" in un
#                          contenitore? App distinguibili, solo monitor primario
#    T11 freeze + input    [interattivo, serve un gioco] congela/scongela lo scope
#                          del gioco; chi tiene aperto il controller; input
#                          arretrato al risveglio
#    T12 combo oggi        [interattivo, serve un gioco] cosa registra/fa il
#                          backend con Select+D-pad (Dashboard e gioco in
#                          primo piano), con i tasti verificati via evdev
#    T15 contenitore reale [interattivo, RISCHIOSO] sposta Dashboard e GIOCO
#                          veri in un contenitore e li alterna; poi li rimette
#                          a posto (salva la partita prima!)
#
#  Modifiche allo stato del sistema: solo temporanee e ripristinate
#  (T07 cambia il numero di desktop XFCE, se confermi; T10 apre finestre di
#  prova). Nessun file del progetto viene toccato.
#
#  Uso (dalla cartella del progetto):
#    ./scripts/diag-gamespace.sh [opzioni]
#
#  Opzioni:
#    --display :N        display X da usare (default: $DISPLAY, poi autodetect)
#    --delay S           secondi di osservazione per ogni azione (default 3)
#    --no-interactive    nessuna domanda: salta T06/T07/T08 e le domande di T10
#    --all-actions       T06: prova tutte le azioni (default: si ferma alla
#                        prima che funziona in entrambe le direzioni)
#    --with-xephyr | --with-controller   abilita T09 / T08 (default: saltati)
#    --skip-reparent | --skip-workspaces | --skip-freeze | --skip-combo
#    --skip-watch | --watch-secs N (default 60)
#    --with-unmap-primitive | --with-realcontainer   abilitano T06b / T15 (RISCHIOSI)
#    --port N            porta del backend (default 3000)
#    --out FILE          percorso del log (default ~/x-launcher-diag-gamespace-<data>.log)
#
#  IN KIOSK: lancialo da SSH o da un altro TTY, non da dentro la
#  sessione (le domande appaiono nel terminale, i test si guardano
#  sullo schermo). Per T06 avvia PRIMA un gioco dalla Dashboard e lascialo
#  in primo piano.
#  IN XFCE: lancialo da un terminale; lo script riporta in primo piano
#  il terminale dopo ogni azione (via $WINDOWID) per poter rispondere.
# =============================================================
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ---------------------------------------------------------------- opzioni
OPT_DISPLAY=""
DELAY=3
INTERACTIVE=1
ALL_ACTIONS=0
SKIP_XEPHYR=1
SKIP_REPARENT=0
SKIP_CONTROLLER=1
SKIP_WS=0
SKIP_FREEZE=0
SKIP_COMBO=0
SKIP_WATCH=0
SKIP_REAL=1
SKIP_UNMAP=1
WATCH_SECS=60
PORT="${PORT:-3000}"

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
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$HOME/x-launcher-diag-gamespace-$STAMP.log"

while [ $# -gt 0 ]; do
  case "$1" in
    --display) OPT_DISPLAY="${2:-}"; shift ;;
    --delay) DELAY="${2:-3}"; shift ;;
    --no-interactive) INTERACTIVE=0 ;;
    --all-actions) ALL_ACTIONS=1 ;;
    --skip-xephyr) SKIP_XEPHYR=1 ;;
    --with-xephyr) SKIP_XEPHYR=0 ;;
    --with-controller) SKIP_CONTROLLER=0 ;;
    --skip-freeze) SKIP_FREEZE=1 ;;
    --skip-combo) SKIP_COMBO=1 ;;
    --skip-watch) SKIP_WATCH=1 ;;
    --skip-realcontainer) SKIP_REAL=1 ;;
    --with-realcontainer) SKIP_REAL=0 ;;
    --with-unmap-primitive) SKIP_UNMAP=0 ;;
    --watch-secs) WATCH_SECS="${2:-60}"; shift ;;
    --skip-reparent) SKIP_REPARENT=1 ;;
    --skip-controller) SKIP_CONTROLLER=1 ;;
    --skip-workspaces) SKIP_WS=1 ;;
    --port) PORT="${2:-3000}"; shift ;;
    --out) OUT_FILE="${2:-$OUT_FILE}"; shift ;;
    -h|--help) sed -n '2,100p' "$0"; exit 0 ;;
    *) echo "Opzione sconosciuta: $1 (usa --help)"; exit 2 ;;
  esac
  shift
done

TMP="$(mktemp -d /tmp/xl-diag.XXXXXX)"
BODY="$TMP/body.log"
HELPER="$TMP/helper.py"
: > "$BODY"

declare -a SUMMARY=()
add_s() { SUMMARY+=("$1"); }

# ---------------------------------------------------------------- log
say()  { printf '%s\n' "$*" | tee -a "$BODY"; }
note() { printf '%s\n' "$*" >> "$BODY"; }
sec()  { say ""; say "=== [$1] $2 ==="; }

RUN_RC=0; RUN_OUT=""
run() { # run <timeout-sec> cmd args...
  local t="$1"; shift
  say "\$ $*"
  RUN_OUT="$(timeout "$t" "$@" 2>&1)"; RUN_RC=$?
  if [ -n "$RUN_OUT" ]; then printf '%s\n' "$RUN_OUT" | sed 's/^/    /' | tee -a "$BODY"; fi
  say "    [exit=$RUN_RC]"
}

# ---------------------------------------------------------------- input utente
TTY_IN="${XL_DIAG_TTY:-/dev/tty}"
if [ "$INTERACTIVE" = 1 ]; then
  if ! { exec 3<"$TTY_IN"; } 2>/dev/null; then
    INTERACTIVE=0
    echo "Nessun terminale interattivo disponibile: modalita' --no-interactive."
  fi
fi

ANSWER=""
ask() { # ask "prompt" "regex-valide" default
  ANSWER="${3:-}"
  [ "$INTERACTIVE" = 1 ] || return 0
  local a
  while true; do
    printf '%s ' "$1"
    if ! read -r -u 3 a; then ANSWER="${3:-}"; note "    [input terminato: default '$ANSWER']"; return 0; fi
    a="$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')"
    if [[ "$a" =~ $2 ]]; then ANSWER="$a"; note "    [domanda: $1 -> '$a']"; return 0; fi
  done
}
ask_free() { # ask_free "prompt" -> ANSWER (testo libero, puo' essere vuoto)
  ANSWER=""
  [ "$INTERACTIVE" = 1 ] || return 0
  printf '%s ' "$1"
  read -r -u 3 ANSWER || ANSWER=""
  note "    [domanda: $1 -> '$ANSWER']"
}

# ---------------------------------------------------------------- cleanup
XEPHYR_PID=""
WS_ORIG=""
FROZEN_UNIT=""; FROZEN_METHOD=""; FROZEN_PIDS=""
thaw_now() { # ripristina SEMPRE il gioco congelato (anche su Ctrl+C / errori)
  [ -n "$FROZEN_UNIT" ] || return 0
  if [ "$FROZEN_METHOD" = freeze ]; then
    systemctl --user thaw "$FROZEN_UNIT.scope" >/dev/null 2>&1
  else
    local p; for p in $FROZEN_PIDS; do kill -CONT "$p" 2>/dev/null; done
  fi
  FROZEN_UNIT=""
}
cleanup() {
  thaw_now
  [ -n "$XEPHYR_PID" ] && kill "$XEPHYR_PID" 2>/dev/null
  jobs -p 2>/dev/null | xargs -r kill 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT
trap 'echo; echo "Interrotto."; exit 130' INT TERM

# ---------------------------------------------------------------- helper Python
cat > "$HELPER" <<'PYEOF'
#!/usr/bin/env python3
# helper di diag-gamespace.sh — non va lanciato a mano
import os, sys, time, subprocess, select, struct, re, shutil

def out(*a):
    print(*a, flush=True)

try:
    from Xlib import X, display, error, protocol
except Exception as e:  # noqa
    out(f"XLIB_IMPORT_FAIL: {e}")
    sys.exit(3)

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

def get_prop(d, w, name, ptype=X.AnyPropertyType):
    try:
        a = d.intern_atom(name, True)
        if not a:
            return None
        return w.get_full_property(a, ptype)
    except Exception:
        return None

def text(d, w, name):
    r = get_prop(d, w, name)
    if r is None:
        return None
    v = r.value
    if isinstance(v, (bytes, bytearray)):
        return bytes(v).decode("utf-8", "replace").replace("\0", "/")
    return str(v)

def cards(d, w, name):
    r = get_prop(d, w, name)
    if r is None:
        return None
    try:
        return list(r.value)
    except Exception:
        return None

def atoms(d, w, name):
    c = cards(d, w, name)
    return None if c is None else [aname(d, x) for x in c]

def xres_pid(d, wid):
    try:
        if not d.has_extension("X-Resource"):
            return "ext-assente"
        from Xlib.ext import res
        r = d.res_query_client_ids([{"client": wid, "mask": res.LocalClientPIDMask}])
        for item in r.ids:
            if item.value:
                return int(item.value[0])
        return "nessun-pid"
    except Exception as e:
        return f"errore:{type(e).__name__}"

def proc_info(pid):
    r = {"comm": None, "cgroup": None, "cmd": None, "scope": None}
    try:
        r["comm"] = open(f"/proc/{pid}/comm").read().strip()
    except Exception:
        pass
    try:
        cg = open(f"/proc/{pid}/cgroup").read().strip().splitlines()
        r["cgroup"] = cg[-1] if cg else None
    except Exception:
        pass
    try:
        r["cmd"] = open(f"/proc/{pid}/cmdline", "rb").read().replace(b"\0", b" ").decode("utf-8", "replace")[:160]
    except Exception:
        pass
    if r["cgroup"]:
        m = re.search(r"(xlauncher-(?:game|shared-launcher)-[^/]+?)\.scope", r["cgroup"])
        if m:
            r["scope"] = m.group(1)
    return r

MAPNAMES = {0: "Unmapped", 1: "Unviewable", 2: "Viewable"}

def describe(d, w):
    try:
        g = w.get_geometry()
        a = w.get_attributes()
    except Exception:
        return None
    r = {"id": w.id, "w": g.width, "h": g.height, "geom": f"{g.width}x{g.height}+{g.x}+{g.y}",
         "map": MAPNAMES.get(a.map_state, str(a.map_state)), "or": int(bool(a.override_redirect))}
    r["name"] = text(d, w, "_NET_WM_NAME") or text(d, w, "WM_NAME") or ""
    try:
        c = w.get_wm_class()
        r["cls"] = "/".join(c) if c else ""
    except Exception:
        r["cls"] = ""
    pid = cards(d, w, "_NET_WM_PID")
    r["pid"] = pid[0] if pid else None
    r["xres_pid"] = xres_pid(d, w.id)
    eff = r["pid"] if r["pid"] else (r["xres_pid"] if isinstance(r["xres_pid"], int) else None)
    r["eff_pid"] = eff
    r["proc"] = proc_info(eff) if eff else {"comm": None, "cgroup": None, "cmd": None, "scope": None}
    r["desk"] = (cards(d, w, "_NET_WM_DESKTOP") or [None])[0]
    r["wmstate"] = cards(d, w, "WM_STATE")
    r["netstate"] = atoms(d, w, "_NET_WM_STATE")
    r["wtype"] = atoms(d, w, "_NET_WM_WINDOW_TYPE")
    r["steam_game"] = cards(d, w, "STEAM_GAME")
    r["transient"] = cards(d, w, "WM_TRANSIENT_FOR")
    try:
        r["props"] = sorted(aname(d, p) for p in w.list_properties())
    except Exception:
        r["props"] = []
    try:
        r["children"] = len(w.query_tree().children)
    except Exception:
        r["children"] = "?"
    return r

def marks(d, w):
    name = text(d, w, "_NET_WM_NAME") or text(d, w, "WM_NAME") or ""
    try:
        c = w.get_wm_class()
        cls = "/".join(c) if c else ""
    except Exception:
        cls = ""
    return bool(name or cls or cards(d, w, "WM_STATE"))

STATS = {"root_children": 0, "anonymous": 0, "framed": 0}

def clients(d, maxdepth=3):
    """Finestre 'client' (con nome/classe/WM_STATE). Con un WM che riparenta
    (xfwm4, openbox...) i figli della root sono i FRAME e il client sta un livello
    sotto: scendiamo finche' troviamo una finestra marcata. Con gamescope (nessun
    reparenting) i client sono figli diretti della root."""
    root = d.screen().root
    STATS.update({"root_children": 0, "anonymous": 0, "framed": 0})
    def walk(w, depth, parent_id):
        try:
            kids = w.query_tree().children
        except Exception:
            return
        for k in kids:
            if depth == 1:
                STATS["root_children"] += 1
            try:
                found = marks(d, k)
            except Exception:
                found = False
            if found:
                info = describe(d, k)
                if info:
                    info["depth"] = depth
                    info["parent"] = parent_id
                    if depth > 1:
                        STATS["framed"] += 1
                    yield info
            elif depth < maxdepth:
                got = False
                for sub in walk(k, depth + 1, k.id):
                    got = True
                    yield sub
                if not got and depth == 1:
                    STATS["anonymous"] += 1
    yield from walk(root, 1, root.id)

def toplevels(d):
    return clients(d)

def role_of(i):
    cls = (i["cls"] or "").lower()
    nm = (i["name"] or "").lower()
    cmd = ((i["proc"].get("cmd")) or "").lower()
    scope = i["proc"].get("scope") or ""
    if scope.startswith("xlauncher-game-"):
        return "game"
    if scope.startswith("xlauncher-shared-launcher-"):
        return "launcher"
    if i["steam_game"] or cls.startswith("steam_app") or "steam_app_" in cls:
        return "steam-game"
    if any(k in cls for k in ("chrom", "brave", "firefox", "vivaldi")) or "x-launcher" in nm or "localhost:3000" in cmd:
        return "dashboard"
    return "other"

def cmd_inventory(d):
    n = 0
    viewable = 0
    named = 0
    for i in clients(d):
        n += 1
        if i["map"] == "Viewable":
            viewable += 1
        if i["name"] or i["cls"]:
            named += 1
        fr = "" if i.get("depth", 1) == 1 else f" FRAMED(parent=0x{i['parent']:x}, depth={i['depth']})"
        out(f"W 0x{i['id']:08x} ({i['id']}) map={i['map']} or={i['or']} geom={i['geom']} children={i['children']}{fr}")
        out(f"    class={i['cls']!r} name={i['name']!r}")
        out(f"    pid(_NET_WM_PID)={i['pid']} pid(X-Resource)={i['xres_pid']} desk={i['desk']} WM_STATE={i['wmstate']}")
        out(f"    net_state={i['netstate']} type={i['wtype']} steam_game={i['steam_game']} transient={i['transient']}")
        out(f"    proc.comm={i['proc']['comm']} scope={i['proc']['scope']} role={role_of(i)}")
        out(f"    cgroup={i['proc']['cgroup']}")
        out(f"    cmd={i['proc']['cmd']}")
        out(f"    props={i['props']}")
    out(f"CLIENT_COUNT={n} root_children={STATS['root_children']} frames_con_client_dentro={STATS['framed']} anonime={STATS['anonymous']}")
    out(f"SUMMARY: figli diretti della root={STATS['root_children']}; finestre client={n} (viewable={viewable}); "
        f"client dentro un frame del WM={STATS['framed']} (se >0 il WM riparenta: le finestre NON sono figlie dirette della root)")
    # le finestre dei client senza _NET_WM_PID risolte via X-Resource?
    nopid = 0
    viaxres = 0
    for i in toplevels(d):
        if i["map"] != "Unmapped" and not i["pid"]:
            nopid += 1
            if isinstance(i["xres_pid"], int):
                viaxres += 1
    out(f"SUMMARY: finestre non-unmapped senza _NET_WM_PID={nopid} (di cui risolte via X-Resource={viaxres})")

def is_iconic(i):
    return bool(i["wmstate"]) and i["wmstate"][0] == 3

NOISE = re.compile(r"Default IME|MSCTFIME|GDI\+ Window|DDE Server|^$")

def cmd_candidates(d):
    idx = 0
    items = [i for i in toplevels(d)
             if (i["map"] != "Unmapped" or is_iconic(i)) and i["name"]
             and i["w"] > 10 and i["h"] > 10 and not NOISE.search(i["name"])]
    items.sort(key=lambda i: (i["map"] != "Viewable", i["id"]))
    for i in items:
        idx += 1
        st = "Iconic" if (i["map"] == "Unmapped" and is_iconic(i)) else i["map"]
        nm = (i["name"] or "").replace("|", "/")
        out(f"CAND|{idx}|{role_of(i)}|{i['id']}|{st}|{i['eff_pid'] or ''}|{i['proc']['scope'] or ''}|{i['cls']}|{nm}")

def cmd_root(d):
    root = d.screen().root
    scr = d.screen()
    out(f"ROOT=0x{root.id:x} screen={scr.width_in_pixels}x{scr.height_in_pixels}")
    names = sorted(aname(d, a) for a in root.list_properties())
    out("ROOT_PROPS: " + " ".join(names))
    sup = atoms(d, root, "_NET_SUPPORTED")
    out(f"NET_SUPPORTED_COUNT={len(sup) if sup else 0}")
    if sup:
        out("NET_SUPPORTED: " + " ".join(sup))
    chk = cards(d, root, "_NET_SUPPORTING_WM_CHECK")
    wmname = None
    if chk:
        try:
            cw = d.create_resource_object("window", chk[0])
            wmname = text(d, cw, "_NET_WM_NAME") or text(d, cw, "WM_NAME")
        except Exception:
            pass
    out(f"WM_NAME={wmname}")
    for p in ("_NET_CURRENT_DESKTOP", "_NET_NUMBER_OF_DESKTOPS", "_NET_ACTIVE_WINDOW",
              "_NET_CLIENT_LIST", "_NET_CLIENT_LIST_STACKING", "_NET_DESKTOP_GEOMETRY"):
        c = cards(d, root, p)
        out(f"{p}={c}")
    nd = text(d, root, "_NET_DESKTOP_NAMES")
    out(f"_NET_DESKTOP_NAMES={nd}")
    special = [n for n in names if re.search(r"gamescope|steam", n, re.I)]
    for n in special:
        c = cards(d, root, n)
        t = text(d, root, n) if c is None else None
        out(f"SPECIAL {n} = {c if c is not None else t}")
    out(f"SUMMARY: WM (_NET_SUPPORTING_WM_CHECK)={wmname}")
    out(f"SUMMARY: EWMH atomi supportati={len(sup) if sup else 0}")
    out(f"SUMMARY: proprieta' root gamescope/steam={special if special else 'nessuna'}")
    out(f"SUMMARY: X-Resource presente={d.has_extension('X-Resource')}")

def cmd_wmcheck(d):
    root = d.screen().root
    catch = error.CatchError(error.BadAccess)
    root.change_attributes(event_mask=X.SubstructureRedirectMask, onerror=catch)
    d.sync()
    err = catch.get_error()
    if err is None:
        # nessun WM: ci siamo installati noi, restituiamo subito il controllo
        root.change_attributes(event_mask=0)
        d.sync()
        out("REDIRECT=libero (nessun altro client tiene SubstructureRedirect sulla root)")
        out("SUMMARY: SubstructureRedirect sulla root = LIBERO (un WM/shell nostro puo' installarsi)")
    else:
        out(f"REDIRECT=occupato ({type(err).__name__})")
        out("SUMMARY: SubstructureRedirect sulla root = OCCUPATO (c'e' gia' un WM/compositor: un secondo WM non puo' installarsi)")

def cmd_xraise(d, wid):
    w = d.create_resource_object("window", wid)
    w.configure(stack_mode=X.Above)
    w.set_input_focus(X.RevertToParent, X.CurrentTime)
    d.sync()
    out("xraise: inviato (configure Above + XSetInputFocus)")

def cmd_ewmh_activate(d, wid):
    root = d.screen().root
    w = d.create_resource_object("window", wid)
    ev = protocol.event.ClientMessage(window=w, client_type=d.intern_atom("_NET_ACTIVE_WINDOW"),
                                      data=(32, [1, X.CurrentTime, 0, 0, 0]))
    root.send_event(ev, event_mask=X.SubstructureRedirectMask | X.SubstructureNotifyMask)
    d.sync()
    out("ewmh-activate: _NET_ACTIVE_WINDOW inviato alla root")

def gs_props(d):
    """Proprieta' della root che contengono gamescope/steam: il 'riscontro' di gamescope."""
    root = d.screen().root
    res = []
    try:
        for a in root.list_properties():
            n = aname(d, a)
            if re.search(r"gamescope|steam", n, re.I):
                c = cards(d, root, n)
                v = c if c is not None else text(d, root, n)
                res.append(f"{n}={str(v)[:140]}")
    except Exception as e:
        res.append(f"errore:{e}")
    return res

def cmd_focusinfo(d, wid):
    try:
        f = d.get_input_focus().focus
        fid = f.id if hasattr(f, "id") else f
    except Exception as e:
        fid = f"errore:{e}"
    root = d.screen().root
    aw = cards(d, root, "_NET_ACTIVE_WINDOW")
    out(f"FOCUS input_focus={fid} net_active_window={aw[0] if aw else None} target={wid} "
        f"input_focus_is_target={fid == wid} net_active_is_target={bool(aw) and aw[0] == wid}")
    gp = gs_props(d)
    out("GS_PROPS: " + (" | ".join(gp) if gp else "nessuna proprieta' gamescope/steam sulla root"))

# --------------------------------------------------------------- evdev
KEYN = {304: "BTN_SOUTH", 305: "BTN_EAST", 307: "BTN_NORTH", 308: "BTN_WEST", 310: "BTN_TL", 311: "BTN_TR",
        312: "BTN_TL2", 313: "BTN_TR2", 314: "BTN_SELECT", 315: "BTN_START", 316: "BTN_MODE",
        317: "BTN_THUMBL", 318: "BTN_THUMBR", 544: "BTN_DPAD_UP", 545: "BTN_DPAD_DOWN",
        546: "BTN_DPAD_LEFT", 547: "BTN_DPAD_RIGHT"}
ABSN = {0: "ABS_X", 1: "ABS_Y", 2: "ABS_Z", 3: "ABS_RX", 4: "ABS_RY", 5: "ABS_RZ", 16: "ABS_HAT0X", 17: "ABS_HAT0Y"}

def gamepads():
    res = []
    try:
        blocks = open("/proc/bus/input/devices").read().strip().split("\n\n")
    except Exception as e:
        out(f"INPUT_DEVICES_READ_FAIL: {e}")
        return res
    for b in blocks:
        name = re.search(r'N: Name="(.*)"', b)
        hand = re.search(r"H: Handlers=(.*)", b)
        if not hand:
            continue
        toks = hand.group(1).split()
        js = [t for t in toks if re.fullmatch(r"js\d+", t)]
        ev = [t for t in toks if re.fullmatch(r"event\d+", t)]
        if js and ev:
            res.append((name.group(1) if name else "?", ev[0], js[0]))
    return res

def cmd_evdev(secs):
    pads = gamepads()
    out(f"GAMEPADS_FOUND={len(pads)}")
    for n, ev, js in pads:
        out(f"  pad name={n!r} event={ev} js={js}")
    fds = {}
    for n, ev, js in pads:
        path = f"/dev/input/{ev}"
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
            fds[fd] = (n, path)
        except Exception as e:
            out(f"OPEN_FAIL {path}: {e}")
    if not fds:
        out("SUMMARY: controller leggibile via evdev=NO (nessun device apribile)")
        return
    fmt = "llHHi"
    size = struct.calcsize(fmt)
    seen = {}
    end = time.time() + secs
    while time.time() < end:
        r, _, _ = select.select(list(fds), [], [], 0.2)
        for fd in r:
            try:
                data = os.read(fd, size * 64)
            except OSError:
                continue
            for i in range(0, len(data) - size + 1, size):
                _, _, t, c, v = struct.unpack_from(fmt, data, i)
                if t not in (1, 3):
                    continue
                k = (fds[fd][1], t, c)
                e = seen.setdefault(k, {"min": v, "max": v, "n": 0, "vals": []})
                e["min"] = min(e["min"], v)
                e["max"] = max(e["max"], v)
                e["n"] += 1
                if v not in e["vals"] and len(e["vals"]) < 8:
                    e["vals"].append(v)
    for fd in fds:
        os.close(fd)
    if not seen:
        out("EVDEV_EVENTS=nessuno (hai premuto qualcosa?)")
        out("SUMMARY: controller leggibile via evdev=SI (device aperti) ma nessun evento ricevuto")
        return
    for (path, t, c), e in sorted(seen.items()):
        nm = KEYN.get(c, f"KEY_{c}") if t == 1 else ABSN.get(c, f"ABS_{c}")
        kind = "KEY" if t == 1 else "ABS"
        out(f"EVDEV {path} {kind} code={c} ({nm}) values={e['vals']} min={e['min']} max={e['max']} count={e['n']}")
    out("SUMMARY: controller leggibile via evdev=SI (eventi ricevuti, vedi sezione T08)")

# --------------------------------------------------------------- reparent
def find_client(d, w, depth=0):
    """Se w e' un frame del WM, restituisce la finestra client al suo interno."""
    try:
        if marks(d, w):
            return w
        if depth < 3:
            for k in w.query_tree().children:
                c = find_client(d, k, depth + 1)
                if c is not None:
                    return c
    except Exception:
        pass
    return None

def wait_new_window(d, root, before, exclude, timeout=8.0):
    end = time.time() + timeout
    while time.time() < end:
        for w in root.query_tree().children:
            if w.id in before or w.id in exclude:
                continue
            try:
                a = w.get_attributes()
            except Exception:
                continue
            if a.map_state == X.IsUnmapped:
                continue
            c = find_client(d, w)
            if c is None:
                continue
            try:
                if c.get_attributes().map_state == X.IsUnmapped:
                    continue
            except Exception:
                continue
            return w, c
        time.sleep(0.2)
    return None, None

def drain(d, tag):
    n = 0
    while d.pending_events():
        ev = d.next_event()
        n += 1
        if n <= 6:
            out(f"    evento[{tag}]: {ev.__class__.__name__}")
    if n > 6:
        out(f"    ... altri {n - 6} eventi")

def parent_id(w):
    try:
        return w.query_tree().parent.id
    except Exception:
        return None

def primary_geometry(d):
    scr = d.screen()
    try:
        mons = scr.root.xrandr_get_monitors(True).monitors
        best = None
        for m in mons:
            if best is None or m.primary:
                best = m
        if best is not None and best.width_in_pixels > 0:
            return best.x, best.y, best.width_in_pixels, best.height_in_pixels, "RandR monitor primario"
    except Exception:
        pass
    return 0, 0, scr.width_in_pixels, scr.height_in_pixels, "schermo virtuale intero (RandR non disponibile)"

def quiet_err(err, req):
    out(f"    (errore X: {type(err).__name__} sulla richiesta {req.__class__.__name__ if req else '?'} — es. finestra non visibile)")

def cmd_reparent(d, mode, logdir):
    root = d.screen().root
    scr = d.screen()
    mx, my, sw, sh, src = primary_geometry(d)
    cont = root.create_window(mx, my, sw, sh, 0, scr.root_depth, X.InputOutput, X.CopyFromParent,
                              background_pixel=scr.black_pixel,
                              override_redirect=1 if mode == "override" else 0,
                              event_mask=X.SubstructureNotifyMask | X.StructureNotifyMask)
    cont.set_wm_name("xl-diag-container")
    cont.set_wm_class("xl-diag", "XlDiag")
    cont.map()
    d.sync()
    time.sleep(1.0)
    out(f"CONTAINER id=0x{cont.id:x} mode={mode} area={sw}x{sh}+{mx}+{my} ({src})")
    avail = [c for c in ("glxgears", "xeyes", "xclock", "xterm") if shutil.which(c)]
    appA = avail[0] if avail else "own"
    appB = avail[1] if len(avail) > 1 else "own"
    out(f"APP scelte: A={appA} B={appB} ('own' = finestra colorata creata dallo script: A blu, B rossa)")
    procs, wins, logs, owns = [], [], [], []
    for label, app in (("A", appA), ("B", appB)):
        before = set(w.id for w in root.query_tree().children)
        lf = os.path.join(logdir, f"reparent-{mode}-{label}.log")
        if app == "own":
            color = 0xCC2222 if label == "B" else 0x2222CC
            ow = root.create_window(0, 0, 500, 400, 0, scr.root_depth, X.InputOutput, X.CopyFromParent,
                                    background_pixel=color, event_mask=X.StructureNotifyMask)
            ow.set_wm_name(f"xl-diag-own-{label}")
            ow.set_wm_class(f"xl-diag-{label.lower()}", "XlDiagOwn")
            ow.map()
            d.sync()
            owns.append(ow)
            procs.append(None)
        else:
            logs.append((label, app, lf))
            cmd = [app]
            if app == "glxgears":
                cmd = ["glxgears", "-geometry", "640x480+0+0"]
            if shutil.which("stdbuf"):
                cmd = ["stdbuf", "-oL", "-eL"] + cmd
            procs.append(subprocess.Popen(cmd, stdout=open(lf, "w"), stderr=subprocess.STDOUT))
        frame, w = wait_new_window(d, root, before, {cont.id})
        if w is None:
            out(f"APP {label}={app}: finestra NON comparsa entro 8s")
            wins.append(None)
        else:
            fr = "nessuno (figlia diretta della root)" if frame.id == w.id else f"frame WM 0x{frame.id:x}"
            out(f"APP {label}={app}: client 0x{w.id:x}  {fr}  parent_iniziale=0x{(parent_id(w) or 0):x}")
            wins.append(w)
    ok = True
    for label, w in zip("AB", wins):
        if w is None:
            ok = False
            continue
        try:
            w.reparent(cont, 0, 0)
            d.sync()
            w.configure(x=0, y=0, width=sw, height=sh)
            w.map()
            d.sync()
        except Exception as e:
            out(f"REPARENT {label}: ECCEZIONE {type(e).__name__}: {e}")
            ok = False
            continue
        time.sleep(0.5)
        pid_after = parent_id(w)
        out(f"REPARENT {label}: parent_dopo=0x{(pid_after or 0):x} contenitore=0x{cont.id:x} riuscito={pid_after == cont.id}")
        drain(d, f"reparent-{label}")
    for name, i in (("raise A (dovresti vedere A)", 0), ("raise B (dovresti vedere B)", 1), ("raise A (di nuovo A)", 0)):
        w = wins[i]
        if w is None:
            continue
        out(f"FASE {name} — 4s")
        try:
            w.configure(stack_mode=X.Above, onerror=quiet_err)
            w.set_input_focus(X.RevertToParent, X.CurrentTime, onerror=quiet_err)
            d.sync()
        except Exception as e:
            out(f"    errore: {type(e).__name__}: {e}")
        t_end = time.time() + 4
        while time.time() < t_end:
            drain(d, name)
            time.sleep(0.2)
        if wins[0] and wins[1]:
            out(f"    parent attuale A=0x{(parent_id(wins[0]) or 0):x} B=0x{(parent_id(wins[1]) or 0):x}")
    if wins[0] and wins[1]:
        out("FASE unmap A / map B — 4s (dovresti vedere B)")
        try:
            wins[0].unmap()
            wins[1].map()
            d.sync()
        except Exception as e:
            out(f"    errore: {type(e).__name__}: {e}")
        t_end = time.time() + 4
        while time.time() < t_end:
            drain(d, "unmap-map")
            time.sleep(0.2)
        try:
            wins[0].map()
            d.sync()
        except Exception:
            pass
    for p in procs:
        try:
            if p:
                p.terminate()
        except Exception:
            pass
    time.sleep(0.8)
    for p in procs:
        if p and p.poll() is None:
            p.kill()
    for label, app, lf in logs:
        try:
            body = open(lf).read().strip()
        except Exception:
            body = ""
        out(f"OUTPUT_APP {label} ({app}):")
        for ln in body.splitlines()[-8:]:
            out(f"    {ln}")
    for ow in owns:
        try:
            ow.destroy()
        except Exception:
            pass
    try:
        cont.destroy()
        d.sync()
    except Exception:
        pass
    fps = []
    for label, app, lf in logs:
        if app == "glxgears":
            try:
                fps += re.findall(r"= ([\d.]+) FPS", open(lf).read())
            except Exception:
                pass
    out(f"SUMMARY: reparenting [{mode}] riparentate con successo={ok}; app A={appA} B={appB}; fps glxgears={fps if fps else 'n/d'}")

def win(d, wid):
    return d.create_resource_object("window", wid)

def cmd_hide_show(d, show_id, hide_id):
    show, hide = win(d, show_id), win(d, hide_id)
    hide.unmap(onerror=quiet_err)
    show.map(onerror=quiet_err)
    show.configure(stack_mode=X.Above, onerror=quiet_err)
    d.sync()
    out(f"hide-show: unmap 0x{hide_id:x}, map+raise 0x{show_id:x}")

def cmd_map_both(d, ids):
    for i in ids:
        win(d, i).map(onerror=quiet_err)
    d.sync()
    out("map-both: rimappate " + " ".join(f"0x{i:x}" for i in ids))

def short_desc(d, w):
    try:
        i = describe(d, w)
        if not i:
            return "(finestra gia' sparita)"
        return (f"class={i['cls']!r} name={(i['name'] or '')[:50]!r} pid={i['eff_pid']} "
                f"scope={i['proc']['scope']} map={i['map']} geom={i['geom']}")
    except Exception as e:
        return f"(descrizione non disponibile: {type(e).__name__})"

def cmd_watch(d, secs):
    root = d.screen().root
    t0 = time.time()
    def ts():
        return f"+{time.time() - t0:6.2f}s"
    def quiet(err, req):
        pass
    root.change_attributes(event_mask=X.SubstructureNotifyMask | X.PropertyChangeMask, onerror=quiet)
    tracked = set()
    def track(w):
        if w.id in tracked:
            return
        tracked.add(w.id)
        w.change_attributes(event_mask=X.PropertyChangeMask | X.StructureNotifyMask, onerror=quiet)
    for w in root.query_tree().children:
        track(w)
    d.sync()
    out(f"WATCH avviato: {len(tracked)} finestre top-level gia' presenti, durata {secs}s")
    gp = gs_props(d)
    out("WATCH proprieta' gamescope/steam all'inizio: " + (" | ".join(gp) if gp else "nessuna"))
    interesting = re.compile(r"STEAM|GAMESCOPE|_NET_WM_STATE|WM_STATE|_NET_ACTIVE_WINDOW|_NET_WM_NAME|WM_NAME|_NET_WM_PID|_NET_WM_DESKTOP|WM_CLASS", re.I)
    counts = {}
    last_seen = {}
    seen_atom = {}
    last_val = {}
    changes = {}
    geom = {}
    mapped = {}
    ev_log_cap = 600
    logged = 0
    end = t0 + secs
    while time.time() < end:
        r, _, _ = select.select([d.fileno()], [], [], 0.25)
        while d.pending_events():
            ev = d.next_event()
            name = ev.__class__.__name__
            wid_ev = getattr(getattr(ev, "window", None), "id", None)
            key_dup = (name, wid_ev)
            now_t = time.time()
            if name in ("MapNotify", "UnmapNotify", "DestroyNotify", "ReparentNotify") and \
                    now_t - last_seen.get(key_dup, 0) < 0.05:
                continue  # stesso evento consegnato sia dalla root sia dalla finestra
            last_seen[key_dup] = now_t
            counts[name] = counts.get(name, 0) + 1
            line = None
            try:
                if name == "CreateNotify":
                    track(ev.window)
                    line = f"CREATE   0x{ev.window.id:x} parent=0x{ev.parent.id:x} {ev.width}x{ev.height} or={ev.override}"
                elif name == "MapNotify":
                    d.sync()
                    mapped[ev.window.id] = short_desc(d, ev.window)
                    line = f"MAP      0x{ev.window.id:x} {mapped[ev.window.id]}"
                elif name == "UnmapNotify":
                    line = f"UNMAP    0x{ev.window.id:x}"
                elif name == "DestroyNotify":
                    line = f"DESTROY  0x{ev.window.id:x}"
                    tracked.discard(ev.window.id)
                elif name == "ReparentNotify":
                    line = f"REPARENT 0x{ev.window.id:x} -> parent 0x{ev.parent.id:x}"
                elif name == "ConfigureNotify":
                    g = (ev.width, ev.height)
                    if geom.get(ev.window.id) != g:
                        geom[ev.window.id] = g
                        line = f"RESIZE   0x{ev.window.id:x} {ev.width}x{ev.height}+{ev.x}+{ev.y}"
                elif name == "PropertyNotify":
                    an = aname(d, ev.atom)
                    is_root = ev.window.id == root.id
                    if is_root or interesting.search(an):
                        k = (ev.window.id, an)
                        seen_atom[k] = seen_atom.get(k, 0) + 1
                        try:
                            if ev.state == X.PropertyNewValue:
                                c = cards(d, ev.window, an)
                                valstr = str(c if c is not None else text(d, ev.window, an))[:110]
                            else:
                                valstr = "(eliminata)"
                        except Exception:
                            valstr = "?"
                        # gamescope ripubblica le proprieta' della root ~100 volte al secondo:
                        # si logga SOLO quando il valore cambia davvero
                        if last_val.get(k) != valstr:
                            last_val[k] = valstr
                            changes[k] = changes.get(k, 0) + 1
                            who = "ROOT" if is_root else "0x%x" % ev.window.id
                            if changes[k] <= 30:
                                line = f"PROPERTY {who} {an} = {valstr}"
                            elif changes[k] == 31:
                                line = f"PROPERTY {who} {an}: troppi cambi di valore, smetto di loggare"
            except Exception as e:
                line = f"{name} (errore nel gestore: {type(e).__name__}: {e})"
            if line and logged < ev_log_cap:
                out(f"  {ts()} {line}")
                logged += 1
                if logged == ev_log_cap:
                    out("  ... limite di righe raggiunto, continuo a contare senza loggare")
    out("WATCH terminato. Conteggio eventi: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    gp = gs_props(d)
    out("WATCH proprieta' gamescope/steam alla fine: " + (" | ".join(gp) if gp else "nessuna"))
    out("WATCH finestre viste mappate durante la registrazione:")
    for wid, desc in mapped.items():
        out(f"    0x{wid:x} {desc}")
    named_scope = [d_ for d_ in mapped.values() if "scope=xlauncher-" in d_]
    out(f"SUMMARY: T13 eventi X: {sum(counts.values())} totali ({', '.join(f'{k}={v}' for k, v in sorted(counts.items()))}); "
        f"finestre mappate viste={len(mapped)}, di cui riconducibili a uno scope xlauncher={len(named_scope)}")
    props_seen = sorted(set(an for (_, an) in changes if re.search(r"STEAM|GAMESCOPE", an, re.I)))
    suppressed = sum(seen_atom.values()) - sum(changes.values())
    out(f"SUMMARY: T13 proprieta' gamescope/steam il cui VALORE e' cambiato: {props_seen if props_seen else 'nessuna'} "
        f"({suppressed} ripubblicazioni senza cambio di valore non loggate)")

def cmd_realcontainer(d, dash_id, game_id, mode, hold):
    root = d.screen().root
    scr = d.screen()
    mx, my, sw, sh, src = primary_geometry(d)
    W = {"D": win(d, dash_id), "G": win(d, game_id)}
    saved = {}
    for k, w in W.items():
        g = w.get_geometry()
        a = w.get_attributes()
        saved[k] = {"parent": parent_id(w) or root.id, "x": g.x, "y": g.y, "w": g.width, "h": g.height, "map": a.map_state}
        out(f"SALVATO {k}: 0x{w.id:x} parent=0x{saved[k]['parent']:x} geom={g.width}x{g.height}+{g.x}+{g.y} map={MAPNAMES.get(a.map_state)}")
    cont = root.create_window(mx, my, sw, sh, 0, scr.root_depth, X.InputOutput, X.CopyFromParent,
                              background_pixel=scr.black_pixel,
                              override_redirect=1 if mode == "override" else 0,
                              event_mask=X.SubstructureNotifyMask | X.StructureNotifyMask)
    cont.set_wm_name("xl-diag-realcontainer")
    cont.set_wm_class("xl-diag-real", "XlDiagReal")
    cont.map()
    d.sync()
    time.sleep(1.0)
    out(f"CONTAINER 0x{cont.id:x} mode={mode} area={sw}x{sh}+{mx}+{my} ({src})")
    ok_all = True
    try:
        for k, w in W.items():
            w.reparent(cont, 0, 0, onerror=quiet_err)
            d.sync()
            w.configure(x=0, y=0, width=sw, height=sh, onerror=quiet_err)
            w.map(onerror=quiet_err)
            d.sync()
            time.sleep(0.5)
            pa = parent_id(w)
            out(f"REPARENT {k}: parent_dopo=0x{(pa or 0):x} riuscito={pa == cont.id}")
            ok_all = ok_all and (pa == cont.id)
            drain(d, f"reparent-{k}")
        for name, k in (("Dashboard SU", "D"), ("Gioco SU", "G"), ("Dashboard SU", "D"), ("Gioco SU", "G")):
            out(f"FASE {name} — {hold}s")
            try:
                W[k].configure(stack_mode=X.Above, onerror=quiet_err)
                W[k].set_input_focus(X.RevertToParent, X.CurrentTime, onerror=quiet_err)
                d.sync()
            except Exception as e:
                out(f"    errore: {type(e).__name__}: {e}")
            gp = gs_props(d)
            if gp:
                out("    GS_PROPS: " + " | ".join(gp))
            t_end = time.time() + hold
            while time.time() < t_end:
                drain(d, name)
                time.sleep(0.2)
            for kk, ww in W.items():
                try:
                    out(f"    {kk}: map={MAPNAMES.get(ww.get_attributes().map_state)} parent=0x{(parent_id(ww) or 0):x}")
                except Exception:
                    out(f"    {kk}: NON RAGGIUNGIBILE (finestra distrutta?)")
    finally:
        out("RIPRISTINO: riporto le finestre al loro parent originale")
        for k, w in W.items():
            sv = saved[k]
            try:
                catch = error.CatchError(error.BadWindow, error.BadMatch)
                w.reparent(sv["parent"], sv["x"], sv["y"], onerror=catch)
                d.sync()
                if catch.get_error() is not None:
                    out(f"    {k}: parent originale non valido, uso la root")
                    w.reparent(root, sv["x"], sv["y"], onerror=quiet_err)
                    d.sync()
                w.configure(x=sv["x"], y=sv["y"], width=sv["w"], height=sv["h"], onerror=quiet_err)
                if sv["map"] != X.IsUnmapped:
                    w.map(onerror=quiet_err)
                d.sync()
                out(f"    {k}: parent ora 0x{(parent_id(w) or 0):x} (originale 0x{sv['parent']:x})")
            except Exception as e:
                out(f"    {k}: errore nel ripristino {type(e).__name__}: {e}")
        time.sleep(0.5)
        try:
            left = len(cont.query_tree().children)
        except Exception:
            left = -1
        if left == 0:
            cont.destroy()
            d.sync()
            out("CONTAINER distrutto (vuoto).")
        else:
            out(f"ATTENZIONE: il contenitore ha ancora {left} figli: NON lo distruggo per non uccidere le finestre.")
    out(f"SUMMARY: T15 contenitore reale [{mode}]: reparenting di Dashboard+gioco riuscito={ok_all}")

def main():
    sub = sys.argv[1] if len(sys.argv) > 1 else ""
    if sub == "evdev":
        cmd_evdev(float(sys.argv[2]) if len(sys.argv) > 2 else 10.0)
        return
    d = conn()
    if sub == "inventory":
        cmd_inventory(d)
    elif sub == "candidates":
        cmd_candidates(d)
    elif sub == "root":
        cmd_root(d)
    elif sub == "wmcheck":
        cmd_wmcheck(d)
    elif sub == "xraise":
        cmd_xraise(d, int(sys.argv[2]))
    elif sub == "ewmh-activate":
        cmd_ewmh_activate(d, int(sys.argv[2]))
    elif sub == "focusinfo":
        cmd_focusinfo(d, int(sys.argv[2]))
    elif sub == "reparent":
        cmd_reparent(d, sys.argv[2], sys.argv[3])
    elif sub == "hide-show":
        cmd_hide_show(d, int(sys.argv[2]), int(sys.argv[3]))
    elif sub == "map-both":
        cmd_map_both(d, [int(x) for x in sys.argv[2:]])
    elif sub == "watch":
        cmd_watch(d, float(sys.argv[2]))
    elif sub == "realcontainer":
        cmd_realcontainer(d, int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], float(sys.argv[5]))
    else:
        out(f"sottocomando sconosciuto: {sub}")
        sys.exit(2)

main()
PYEOF

# ---------------------------------------------------------------- scelta Python
PY=""
for cand in "$PROJECT_DIR/.venv-tray/bin/python" "$(command -v python3 || true)"; do
  [ -n "$cand" ] && [ -x "$cand" ] || continue
  if "$cand" -c 'import Xlib' 2>/dev/null; then PY="$cand"; break; fi
done
HAVE_XLIB=1
[ -n "$PY" ] || { HAVE_XLIB=0; PY="$(command -v python3 || echo python3)"; }

hx() { # helper Python con timeout; stampa e logga
  local t="$1"; shift
  say "\$ [python] helper $*"
  RUN_OUT="$(timeout "$t" "$PY" "$HELPER" "$@" 2>&1)"; RUN_RC=$?
  if [ -n "$RUN_OUT" ]; then printf '%s\n' "$RUN_OUT" | sed 's/^/    /' | tee -a "$BODY"; fi
  say "    [exit=$RUN_RC]"
  # raccoglie le righe SUMMARY: nel riepilogo
  while IFS= read -r l; do
    case "$l" in *"SUMMARY: "*) add_s "${l#*SUMMARY: }" ;; esac
  done <<< "$RUN_OUT"
}

# ---------------------------------------------------------------- intestazione
say "X-Launcher — diagnostica gamespace manager"
say "Data: $(date -Is)   Host: $(hostname)   Utente: $(id -un)"
say "Script: $0   Progetto: $PROJECT_DIR"
say "Interattivo: $INTERACTIVE   Delay: ${DELAY}s   Python: $PY (Xlib: $HAVE_XLIB)"

# =============================================================== T00 ambiente
sec T00 "Ambiente"
say "XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-}  XDG_CURRENT_DESKTOP=${XDG_CURRENT_DESKTOP:-}  XDG_SESSION_ID=${XDG_SESSION_ID:-}"
say "DISPLAY=${DISPLAY:-}  WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-}  XAUTHORITY=${XAUTHORITY:-}  WINDOWID=${WINDOWID:-}"
if [ -n "${XDG_SESSION_ID:-}" ] && command -v loginctl >/dev/null; then
  run 5 loginctl show-session "$XDG_SESSION_ID" -p Type -p Desktop -p Name -p Remote -p Class
fi
say "--- socket X11 presenti:"; ls -1 /tmp/.X11-unix 2>&1 | sed 's/^/    /' | tee -a "$BODY"
say "--- processi di interesse:"
pgrep -a -f 'gamescope|xfwm4|openbox|i3$|sway|Xwayland|Xorg|steam|chromium|chrome|tray\.py|server\.ts|dist/server|xfce4-panel|xfdesktop' 2>/dev/null \
  | cut -c1-200 | sed 's/^/    /' | tee -a "$BODY"
say "--- strumenti:"
for t in xdotool wmctrl xprop xwininfo xrandr xfconf-query Xephyr Xvfb glxinfo glxgears vkcube vulkaninfo \
         openbox i3 stdbuf systemctl curl evtest; do
  p="$(command -v "$t" 2>/dev/null || true)"
  say "    $t: ${p:-ASSENTE}"
done
say "--- Python:"
for cand in "$PROJECT_DIR/.venv-tray/bin/python" "$(command -v python3 || true)"; do
  [ -n "$cand" ] && [ -x "$cand" ] || continue
  m=""
  for mod in Xlib evdev pystray PIL; do
    if "$cand" -c "import $mod" 2>/dev/null; then m="$m $mod:si"; else m="$m $mod:no"; fi
  done
  say "    $cand ->$m"
done
say "--- gruppi utente: $(id -Gn)"
add_s "sessione: type=${XDG_SESSION_TYPE:-?} desktop=${XDG_CURRENT_DESKTOP:-?} gamescope_in_esecuzione=$(pgrep -x gamescope >/dev/null && echo SI || echo no)"
add_s "python-xlib disponibile=$([ $HAVE_XLIB = 1 ] && echo SI || echo NO) ($PY)"

if [ "$HAVE_XLIB" = 0 ]; then
  say "ATTENZIONE: python-xlib non importabile ne' dal venv del tray ne' dal Python di sistema."
  say "             I test T01-T03, T06 (azioni 6-7), T10 verranno saltati. Installa: pip install python-xlib"
fi

# ---------------------------------------------------------------- display
pick_display() {
  if [ -n "$OPT_DISPLAY" ]; then echo "$OPT_DISPLAY"; return; fi
  if [ -n "${DISPLAY:-}" ]; then echo "$DISPLAY"; return; fi
  local hint
  hint="$(grep -h 'ACTIVE-DISPLAY' "$HOME/.local/share/x-launcher/daemon.log" 2>/dev/null | tail -1 | grep -o ':[0-9]\+' | head -1)"
  if [ -n "$hint" ] && DISPLAY="$hint" timeout 4 xprop -root _NET_SUPPORTED >/dev/null 2>&1; then echo "$hint"; return; fi
  local s
  for s in /tmp/.X11-unix/X*; do
    [ -e "$s" ] || continue
    local n=":${s##*/X}"
    if DISPLAY="$n" timeout 4 xprop -root >/dev/null 2>&1; then echo "$n"; return; fi
  done
  echo ""
}
DISP="$(pick_display)"
if [ -z "$DISP" ]; then
  say "ERRORE: nessun display X raggiungibile. Passa --display :N (in Kiosk: vedi [ACTIVE-DISPLAY] in daemon.log)."
  say "        Se serve, esporta anche XAUTHORITY."
  mkdir -p "$(dirname "$OUT_FILE")"; cp "$BODY" "$OUT_FILE"; echo "Log: $OUT_FILE"; exit 1
fi
export DISPLAY="$DISP"
say "Display usato: $DISPLAY"
add_s "display usato=$DISPLAY"
say "--- ultime righe [ACTIVE-DISPLAY] dal log del daemon:"
grep -h 'ACTIVE-DISPLAY' "$HOME/.local/share/x-launcher/daemon.log" 2>/dev/null | tail -3 | cut -c1-240 | sed 's/^/    /' | tee -a "$BODY"

# =============================================================== T01 finestre
sec T01 "Inventario finestre top-level (XQueryTree + X-Resource)"
say "--- confronto: xdotool search --name \"\" -> $(timeout 8 xdotool search --name "" 2>/dev/null | wc -l) finestre; --onlyvisible -> $(timeout 8 xdotool search --onlyvisible --name "" 2>/dev/null | wc -l)"
if [ "$HAVE_XLIB" = 1 ]; then hx 30 inventory; else say "(saltato: manca python-xlib)"; fi

# =============================================================== T02 root + WM
sec T02 "Proprieta' della root e window manager"
if [ "$HAVE_XLIB" = 1 ]; then hx 20 root; else say "(saltato)"; fi
WM_NAME_FOUND="$(printf '%s\n' "${RUN_OUT:-}" | sed -n 's/^WM_NAME=//p' | head -1)"

# =============================================================== T03 redirect
sec T03 "SubstructureRedirect sulla root (un altro WM puo' installarsi?)"
if [ "$HAVE_XLIB" = 1 ]; then hx 15 wmcheck; else say "(saltato)"; fi

# =============================================================== T04 CLI
sec T04 "Strumenti da riga di comando EWMH"
if command -v wmctrl >/dev/null; then
  run 6 wmctrl -m
  WMCTRL_M_RC=$RUN_RC
  run 6 wmctrl -d
  run 6 wmctrl -lGp
else
  WMCTRL_M_RC=127; say "wmctrl assente"
fi
add_s "wmctrl -m (WM EWMH raggiungibile)=$([ "${WMCTRL_M_RC:-1}" = 0 ] && echo SI || echo NO)"
if command -v xdotool >/dev/null; then
  run 6 xdotool getdisplaygeometry
  run 6 xdotool getwindowfocus
  run 6 xdotool getactivewindow
  run 6 xdotool get_desktop
fi
command -v xrandr >/dev/null && run 8 xrandr --current

# =============================================================== T05 backend
sec T05 "Backend: Process Manager, scope cgroup, log del daemon"
PM_JSON="$TMP/pm.json"
if command -v curl >/dev/null && xl_curl -s --max-time 3 "http://127.0.0.1:$PORT/api/process-manager/list" > "$PM_JSON" 2>/dev/null && [ -s "$PM_JSON" ]; then
  say "GET /api/process-manager/list (porta $PORT):"
  sed 's/^/    /' "$PM_JSON" | cut -c1-400 | tee -a "$BODY"
  mapfile -t UNITS < <(python3 - "$PM_JSON" <<'PY'
import json, sys
try:
    data = json.load(open(sys.argv[1]))
except Exception as e:
    sys.exit(0)
def walk(o):
    if isinstance(o, dict):
        if "unit" in o:
            print("{}|{}|{}|{}".format(o.get("unit"), o.get("kind"), o.get("id"), o.get("title")))
        for v in o.values():
            walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)
walk(data)
PY
)
  say "scope attivi nel Process Manager: ${#UNITS[@]}"
  add_s "Process Manager: scope attivi=${#UNITS[@]}"
  for line in "${UNITS[@]}"; do
    unit="${line%%|*}"
    say "--- $line"
    cg="$(systemctl --user show "$unit.scope" -p ControlGroup --value 2>/dev/null)"
    say "    ControlGroup=$cg"
    if [ -n "$cg" ] && [ -r "/sys/fs/cgroup$cg/cgroup.procs" ]; then
      while read -r pid; do
        [ -n "$pid" ] && say "    pid=$pid comm=$(cat /proc/$pid/comm 2>/dev/null) cmd=$(tr '\0' ' ' < /proc/$pid/cmdline 2>/dev/null | cut -c1-120)"
      done < "/sys/fs/cgroup$cg/cgroup.procs"
    fi
  done
else
  say "Backend non raggiungibile su 127.0.0.1:$PORT (daemon spento o porta diversa: usa --port)."
  add_s "Process Manager: backend non raggiungibile (porta $PORT)"
fi
say "--- ultime righe rilevanti di daemon.log:"
grep -h -E 'PROCESS-MANAGER|WINDOW-FOCUS|WINDOW-DETECT|ACTIVE-DISPLAY|SPLASH' "$HOME/.local/share/x-launcher/daemon.log" 2>/dev/null \
  | tail -15 | cut -c1-260 | sed 's/^/    /' | tee -a "$BODY"

# =============================================================== T13 eventi X
sec T13 "Osservazione eventi X (base per l'indice dei client)"
if [ "$SKIP_WATCH" = 1 ]; then say "(saltato: --skip-watch)"
elif [ "$HAVE_XLIB" = 0 ]; then say "(saltato: manca python-xlib)"
elif [ "$INTERACTIVE" = 0 ]; then say "(saltato: serve qualcuno che lanci/chiuda un gioco durante la registrazione)"
else
  say "Registro per ${WATCH_SECS}s gli eventi X sul display $DISPLAY."
  say "Durante la registrazione: se un gioco NON e' ancora in esecuzione, AVVIALO dalla Dashboard e, se vuoi, chiudilo e riavvialo."
  say "Al termine lascia un gioco in esecuzione: servira' ai test successivi."
  ask "Invio per iniziare ('n' = salta):" '^n?$' ""
  if [ "$ANSWER" != "n" ]; then
    hx "$((WATCH_SECS + 20))" watch "$WATCH_SECS"
  else
    add_s "T13 eventi X: saltato dall'utente"
  fi
fi

# ---------------------------------------------------------------- selezione finestre
DASH_WID=""; GAME_WID=""
TERM_WID="${WINDOWID:-}"
IS_GAMESCOPE=0
pgrep -x gamescope >/dev/null 2>&1 && IS_GAMESCOPE=1
HAVE_EWMH_WM=0
[ -n "$WM_NAME_FOUND" ] && [ "$WM_NAME_FOUND" != "None" ] && HAVE_EWMH_WM=1

declare -a C_ROLE=() C_WID=() C_MAP=() C_CLS=() C_NAME=() C_SCOPE=()
GAME_SCOPE=""; GAME_ICONIC=0
select_windows() {
  [ "$HAVE_XLIB" = 1 ] || return 0
  local line idx role wid map pid scope cls name
  while IFS= read -r line; do
    IFS='|' read -r _ idx role wid map pid scope cls name <<< "$line"
    C_ROLE[$idx]="$role"; C_WID[$idx]="$wid"; C_MAP[$idx]="$map"; C_CLS[$idx]="$cls"; C_NAME[$idx]="$name"; C_SCOPE[$idx]="$scope"
  done < <(timeout 20 "$PY" "$HELPER" candidates 2>/dev/null | grep '^CAND|')
  say "Candidate (finestre con nome: visibili oppure minimizzate/Iconic):"
  local i
  for i in "${!C_WID[@]}"; do
    say "    [$i] role=${C_ROLE[$i]} id=${C_WID[$i]} (0x$(printf '%x' "${C_WID[$i]}")) map=${C_MAP[$i]} class='${C_CLS[$i]}' name='${C_NAME[$i]}'"
  done
  local auto_d="" auto_g=""
  for i in "${!C_WID[@]}"; do
    [ -z "$auto_d" ] && [ "${C_ROLE[$i]}" = "dashboard" ] && auto_d="$i"
    [ -z "$auto_g" ] && { [ "${C_ROLE[$i]}" = "game" ] || [ "${C_ROLE[$i]}" = "steam-game" ]; } && auto_g="$i"
  done
  local pick
  ask_free "Numero della finestra DASHBOARD [invio = '${auto_d:-nessuna}']:"
  pick="${ANSWER:-$auto_d}"
  [ -n "$pick" ] && [ -n "${C_WID[$pick]:-}" ] && DASH_WID="${C_WID[$pick]}"
  ask_free "Numero della finestra del GIOCO [invio = '${auto_g:-nessuna}', 'n' = nessun gioco in esecuzione]:"
  pick="${ANSWER:-$auto_g}"
  [ "$pick" = "n" ] && pick=""
  if [ -n "$pick" ] && [ -n "${C_WID[$pick]:-}" ]; then
    GAME_WID="${C_WID[$pick]}"
    GAME_SCOPE="${C_SCOPE[$pick]}"
    [ "${C_MAP[$pick]}" = "Iconic" ] && GAME_ICONIC=1
  fi
  [ -n "${XL_DIAG_FORCE_SCOPE:-}" ] && GAME_SCOPE="$XL_DIAG_FORCE_SCOPE"   # hook di test
  if [ -n "$GAME_WID" ] && [ "$GAME_ICONIC" = 1 ]; then
    say "NOTA: la finestra del gioco e' MINIMIZZATA (Iconic): un semplice raise non basta, serve ripristinarla."
  fi
  if [ -n "$GAME_SCOPE" ]; then
    say "Scope del gioco (dal cgroup della finestra): $GAME_SCOPE"
    run 6 systemctl --user is-active "$GAME_SCOPE.scope"
    local sc_active="$RUN_OUT" pm pm_has
    pm="$(xl_curl -s --max-time 3 "http://127.0.0.1:$PORT/api/process-manager/list" 2>/dev/null)"
    say "Process Manager list adesso: $(printf '%s' "$pm" | cut -c1-300)"
    if printf '%s' "$pm" | grep -q "$GAME_SCOPE"; then pm_has=SI; else pm_has=NO; fi
    add_s "scope del gioco=$GAME_SCOPE is-active=$sc_active; presente in /api/process-manager/list=$pm_has"
  else
    add_s "gioco selezionato senza scope xlauncher-game-* (finestra non riconducibile a un lancio di X-Launcher)"
  fi
  say "Selezione: DASHBOARD=${DASH_WID:-nessuna}  GIOCO=${GAME_WID:-nessuno}  TERMINALE=${TERM_WID:-sconosciuto}"
  add_s "finestre scelte: dashboard=${DASH_WID:-nessuna} gioco=${GAME_WID:-nessuno}"
}

# =============================================================== T06 cambio finestra
restore_terminal() {
  [ -n "$TERM_WID" ] || return 0
  command -v wmctrl >/dev/null && wmctrl -i -a "$(printf '0x%x' "$TERM_WID")" >/dev/null 2>&1
  command -v xdotool >/dev/null && xdotool windowraise "$TERM_WID" >/dev/null 2>&1
  return 0
}

do_action() { # do_action <indice> <wid>
  local w="$2"
  case "$1" in
    0) run 6 xdotool windowraise "$w" ;;
    1) run 6 xdotool windowfocus "$w" ;;
    2) run 6 xdotool windowmap "$w"; run 6 xdotool windowraise "$w" ;;
    3) run 6 xdotool windowactivate "$w" ;;
    4) run 6 wmctrl -i -a "$(printf '0x%x' "$w")" ;;
    5) [ "$HAVE_XLIB" = 1 ] && run 10 "$PY" "$HELPER" xraise "$w" || { say "(salta: manca python-xlib)"; RUN_RC=1; } ;;
    6) [ "$HAVE_XLIB" = 1 ] && run 10 "$PY" "$HELPER" ewmh-activate "$w" || { say "(salta: manca python-xlib)"; RUN_RC=1; } ;;
  esac
}
ACTION_NAMES=("xdotool windowraise" "xdotool windowfocus" "xdotool windowmap+windowraise" "xdotool windowactivate (EWMH)" \
              "wmctrl -i -a (EWMH)" "Xlib: configure Above + XSetInputFocus" "Xlib: client message _NET_ACTIVE_WINDOW")
declare -a WORKING=()
WORKING_IDX=""
bring_front() { # bring_front <wid>: usa l'azione che T06 ha trovato funzionante, altrimenti ripiega
  local w="$1"
  if [ -n "$WORKING_IDX" ]; then do_action "$WORKING_IDX" "$w" >/dev/null 2>&1
  elif [ "$HAVE_EWMH_WM" = 1 ] && command -v wmctrl >/dev/null; then wmctrl -i -a "$(printf '0x%x' "$w")" >/dev/null 2>&1
  else do_action 5 "$w" >/dev/null 2>&1; do_action 1 "$w" >/dev/null 2>&1; fi
  return 0
}

sec T06 "Cambio finestra: quale meccanismo porta davvero in primo piano Dashboard e gioco?"
select_windows
if [ -z "$DASH_WID" ] || [ -z "$GAME_WID" ]; then
  say "Servono sia la Dashboard sia un gioco in esecuzione: test saltato."
  say "(In Kiosk: avvia un gioco dalla Dashboard, lascialo in primo piano e rilancia lo script.)"
  add_s "T06 cambio finestra: NON eseguito (manca dashboard o gioco)"
elif [ "$INTERACTIVE" = 0 ]; then
  say "Modalita' non interattiva: provo le azioni e registro solo il focus X risultante (nessuna osservazione visiva)."
  for i in 0 1 3 4 5 6; do
    for tgt in "$DASH_WID" "$GAME_WID"; do
      say "--- azione: ${ACTION_NAMES[$i]} su $tgt"
      do_action "$i" "$tgt"; sleep "$DELAY"
      [ "$HAVE_XLIB" = 1 ] && hx 10 focusinfo "$tgt"
    done
  done
  add_s "T06 cambio finestra: eseguito senza osservazione visiva (vedi righe FOCUS nel log)"
else
  say "Per ogni azione guardo lo schermo ${DELAY}s, poi ti chiedo cosa hai visto."
  say "Risposte: d = Dashboard, g = gioco, t = il terminale, n = nulla e' cambiato, a = altro/schermo nero"
  ask "Cosa mostra ORA lo schermo? [d/g/t/a]" '^[dgta]$' a
  cur="$ANSWER"; [ "$cur" = "t" ] && cur="a"
  for i in 0 1 2 3 4 5 6; do
    if [ "$cur" = "d" ]; then tgt="$GAME_WID"; exp="g"; otgt="$DASH_WID"; oexp="d"; else tgt="$DASH_WID"; exp="d"; otgt="$GAME_WID"; oexp="g"; fi
    say "--- [${ACTION_NAMES[$i]}] verso '$exp' (finestra $tgt)"
    say "    Guarda lo schermo per ${DELAY}s..."
    do_action "$i" "$tgt"; sleep "$DELAY"
    [ "$HAVE_XLIB" = 1 ] && hx 10 focusinfo "$tgt"
    restore_terminal
    ask "    Cosa hai visto? [d/g/t/n/a]" '^[dgtna]$' a
    res="$ANSWER"
    add_s "T06 ${ACTION_NAMES[$i]} verso $exp: visto '$res' (exit=$RUN_RC)"
    if [ "$res" = "$exp" ]; then
      say "    -> funziona verso '$exp'. Provo la direzione opposta con la stessa azione."
      do_action "$i" "$otgt"; sleep "$DELAY"
      [ "$HAVE_XLIB" = 1 ] && hx 10 focusinfo "$otgt"
      restore_terminal
      ask "    Cosa hai visto? [d/g/t/n/a]" '^[dgtna]$' a
      add_s "T06 ${ACTION_NAMES[$i]} verso $oexp: visto '$ANSWER'"
      if [ "$ANSWER" = "$oexp" ]; then
        WORKING+=("${ACTION_NAMES[$i]}")
        [ -z "$WORKING_IDX" ] && WORKING_IDX="$i"
        cur="$oexp"
        [ "$ALL_ACTIONS" = 1 ] || break
      else
        case "$ANSWER" in d|g) cur="$ANSWER" ;; esac
      fi
    else
      case "$res" in d|g) cur="$res" ;; esac
    fi
  done
  say "Azioni che funzionano in entrambe le direzioni: ${WORKING[*]:-NESSUNA}"
  add_s "T06 azioni bidirezionali funzionanti: ${WORKING[*]:-NESSUNA}"
fi
if [ "$SKIP_UNMAP" = 1 ]; then
  say ""
  say "(T06b disattivato di default: smappare dall'esterno il gioco lo ha fatto smettere di presentare e ha lasciato la sessione Kiosk inutilizzabile. Abilitalo con --with-unmap-primitive.)"
fi
if [ "$SKIP_UNMAP" = 0 ] && [ -n "$DASH_WID" ] && [ -n "$GAME_WID" ] && [ "$INTERACTIVE" = 1 ] && [ "$HAVE_XLIB" = 1 ]; then
  say ""
  say "--- T06b: primitiva 'nascondi l'altro' (XUnmapWindow sull'altro client + XMapWindow/raise sul bersaglio)"
  say "ATTENZIONE: nascondere dall'esterno Chromium o il gioco puo' farli reagire male (finestra che non torna, gioco in errore)."
  say "Rimappo sempre entrambe le finestre alla fine."
  ask "Provo la primitiva? [s/N]" '^[sn]$' n
  if [ "$ANSWER" = "s" ]; then
    for want in g d g; do
      if [ "$want" = g ]; then show="$GAME_WID"; hide="$DASH_WID"; else show="$DASH_WID"; hide="$GAME_WID"; fi
      say "--- mostro '$want' e nascondo l'altro; guarda lo schermo ${DELAY}s..."
      hx 10 hide-show "$show" "$hide"
      sleep "$DELAY"
      hx 10 focusinfo "$show"
      restore_terminal
      ask "    Cosa hai visto? [d/g/t/n/a]" '^[dgtna]$' a
      add_s "T06b nascondi-l'altro, mostrando '$want': visto '$ANSWER'"
    done
    hx 10 map-both "$DASH_WID" "$GAME_WID"
    sleep 1
    hx 10 focusinfo "$DASH_WID"
    restore_terminal
    ask "    Dopo la rimappatura Dashboard e gioco sono tornati normali? [s/n/?]" '^[sn?]$' '?'
    add_s "T06b dopo la rimappatura i client sono normali: '$ANSWER'"
  else
    add_s "T06b primitiva unmap/map: saltata dall'utente"
  fi
fi
if [ -n "$GAME_WID" ] && [ "$GAME_ICONIC" = 1 ]; then
  # ripristina lo stato iniziale (gioco minimizzato)
  xdotool windowminimize "$GAME_WID" >/dev/null 2>&1
  restore_terminal
fi

# =============================================================== T07 workspace XFCE
sec T07 "Workspace nativi: Chromium riceve il pad con la Dashboard su un altro desktop?"
DLOG="$HOME/.local/share/x-launcher/daemon.log"
if [ "$SKIP_WS" = 1 ]; then say "(saltato: --skip-workspaces)"
elif [ "$HAVE_EWMH_WM" = 0 ] || [ "${WMCTRL_M_RC:-1}" != 0 ]; then
  say "Nessun WM EWMH raggiungibile (tipico di Kiosk/gamescope): test saltato."
  add_s "T07 workspace: saltato (nessun WM EWMH)"
elif [ "$INTERACTIVE" = 0 ]; then
  say "(saltato: richiede un controller in mano, usa la modalita' interattiva)"
else
  say "Il test cambia TEMPORANEAMENTE il numero di desktop e li ripristina."
  ask "Eseguire il test sui workspace? [s/N]" '^[sn]$' n
  if [ "$ANSWER" = "s" ]; then
    WS_ORIG="$(wmctrl -d | wc -l)"
    XFCONF_ORIG=""
    command -v xfconf-query >/dev/null && XFCONF_ORIG="$(xfconf-query -c xfwm4 -p /general/workspace_count 2>/dev/null)"
    say "Desktop attuali (wmctrl)=$WS_ORIG  xfconf workspace_count=${XFCONF_ORIG:-n/d}"
    run 6 wmctrl -n 3; sleep 1; run 6 wmctrl -d
    MOVED=0
    if [ -n "$GAME_WID" ]; then
      run 6 wmctrl -i -r "$(printf '0x%x' "$GAME_WID")" -t 1 && MOVED=1
    fi
    before_n="$(wc -l < "$DLOG" 2>/dev/null || echo 0)"
    run 6 wmctrl -s 1
    say "Ora sei sul desktop 2; la Dashboard e' sul desktop 1 (non visibile)."
    say "Per i prossimi 12 secondi PREMI Select + D-pad sinistra/destra sul controller, piu' volte."
    "$PY" "$HELPER" evdev 12 > "$TMP/ws-evdev.log" 2>&1 &
    wait $!
    run 6 wmctrl -s 0
    [ "$MOVED" = 1 ] && run 6 wmctrl -i -r "$(printf '0x%x' "$GAME_WID")" -t 0
    run 6 wmctrl -n "$WS_ORIG"
    if [ -n "$XFCONF_ORIG" ]; then
      now="$(xfconf-query -c xfwm4 -p /general/workspace_count 2>/dev/null)"
      [ "$now" != "$XFCONF_ORIG" ] && run 6 xfconf-query -c xfwm4 -p /general/workspace_count -s "$XFCONF_ORIG"
      say "xfconf workspace_count dopo il ripristino: $(xfconf-query -c xfwm4 -p /general/workspace_count 2>/dev/null)"
    fi
    restore_terminal
    say "--- nuove righe [DIAG] nel log del daemon durante la finestra di test:"
    tail -n +"$((before_n + 1))" "$DLOG" 2>/dev/null | grep -E 'DIAG|visibilitychange' | cut -c1-260 | sed 's/^/    /' | tee -a "$BODY"
    nd="$(tail -n +"$((before_n + 1))" "$DLOG" 2>/dev/null | grep -c 'DIAG\] Select')"
    nv="$(tail -n +"$((before_n + 1))" "$DLOG" 2>/dev/null | grep 'visibilitychange' | tail -1 | cut -c1-200)"
    say "Combo Select+direzione registrate dalla Dashboard mentre era su un altro desktop: $nd"
    add_s "T07 workspace: combo Select+dir ricevute con Dashboard su altro desktop=$nd; ultimo visibilitychange: ${nv:-nessuno}"
    sed 's/^/    /' "$TMP/ws-evdev.log" | tee -a "$BODY"
    nsel_pad="$(sed -n 's/.*BTN_SELECT.*count=\([0-9]*\).*/\1/p' "$TMP/ws-evdev.log" | head -1)"
    nhat_pad="$(sed -n 's/.*ABS_HAT0X.*count=\([0-9]*\).*/\1/p' "$TMP/ws-evdev.log" | head -1)"
    add_s "T07 workspace: eventi del pad realmente avvenuti (evdev): Select=${nsel_pad:-0}, D-pad orizzontale=${nhat_pad:-0}"
  else
    add_s "T07 workspace: saltato dall'utente"
  fi
fi

# =============================================================== T08 controller
sec T08 "Controller: Select e D-pad via evdev (lettura passiva, senza grab)"
say "--- /proc/bus/input/devices (solo periferiche con js*):"
awk 'BEGIN{RS="";ORS="\n\n"} /Handlers=.*js[0-9]/' /proc/bus/input/devices 2>/dev/null | sed 's/^/    /' | tee -a "$BODY"
ls -l /dev/input/js* 2>&1 | head -6 | sed 's/^/    /' | tee -a "$BODY"
ls -l /dev/input/event* 2>&1 | head -12 | sed 's/^/    /' | tee -a "$BODY"
if [ "$SKIP_CONTROLLER" = 1 ]; then say "(lettura saltata: abilitala con --with-controller; codici gia' noti dal log v1)"
elif [ "$INTERACTIVE" = 0 ]; then say "(lettura saltata: richiede interazione)"
else
  ask "Premi Invio, poi per 10 secondi: Select, D-pad sinistra, D-pad destra, un tasto qualsiasi (o 'n' per saltare)" '^n?$' ""
  if [ "$ANSWER" != "n" ]; then
    hx 20 evdev 10
  else
    add_s "T08 controller: saltato dall'utente"
  fi
fi

# =============================================================== T09 Xephyr
sec T09 "Display annidato (Xephyr): GL/Vulkan e fps"
if [ "$SKIP_XEPHYR" = 1 ]; then say "(saltato: abilitalo con --with-xephyr; nel log v1 Xephyr risultava software/llvmpipe)"
elif [ "$IS_GAMESCOPE" = 1 ]; then say "(saltato: rilevato gamescope — test pensato per la sessione desktop)"; add_s "T09 Xephyr: saltato (gamescope)"
elif ! command -v Xephyr >/dev/null; then say "Xephyr assente (pacchetto 'xorg-server-xephyr'): test saltato."; add_s "T09 Xephyr: non installato"
else
  XD=":97"
  for flags in "-glamor" ""; do
    say "--- avvio Xephyr $XD ${flags:-(senza glamor)}"
    Xephyr "$XD" -ac -screen 1280x720 $flags > "$TMP/xephyr.log" 2>&1 &
    XEPHYR_PID=$!
    sleep 2
    if kill -0 "$XEPHYR_PID" 2>/dev/null; then break; fi
    say "    Xephyr non e' partito con '${flags:-nessun flag}':"; sed 's/^/    /' "$TMP/xephyr.log" | head -5 | tee -a "$BODY"
    XEPHYR_PID=""
  done
  if [ -n "$XEPHYR_PID" ]; then
    command -v glxinfo >/dev/null && DISPLAY="$XD" run 12 glxinfo -B
    command -v vulkaninfo >/dev/null && DISPLAY="$XD" run 15 vulkaninfo --summary
    if command -v glxgears >/dev/null; then
      say "--- glxgears su Xephyr (12s):"
      DISPLAY="$XD" run 14 stdbuf -oL glxgears
      xfps="$(printf '%s\n' "$RUN_OUT" | grep -o '= [0-9.]* FPS' | tr '\n' ' ')"
      say "--- glxgears sul display nativo $DISP (12s):"
      DISPLAY="$DISP" run 14 stdbuf -oL glxgears
      nfps="$(printf '%s\n' "$RUN_OUT" | grep -o '= [0-9.]* FPS' | tr '\n' ' ')"
      add_s "T09 Xephyr: glxgears fps annidato=[${xfps:-n/d}] nativo=[${nfps:-n/d}]"
    fi
    if command -v vkcube >/dev/null; then
      say "--- vkcube su Xephyr (8s; exit 124 = e' rimasto in esecuzione, quindi ha presentato):"
      DISPLAY="$XD" run 8 vkcube
      add_s "T09 Xephyr: vkcube exit=$RUN_RC (124 = ok, ha girato fino al timeout)"
    fi
    kill "$XEPHYR_PID" 2>/dev/null; XEPHYR_PID=""
  else
    add_s "T09 Xephyr: non e' riuscito ad avviarsi"
  fi
fi

# =============================================================== T10 reparenting
sec T10 "Reparenting: una finestra reale puo' essere dirottata in un contenitore?"
if [ "$SKIP_REPARENT" = 1 ]; then say "(saltato: --skip-reparent)"
elif [ "$HAVE_XLIB" = 0 ]; then say "(saltato: manca python-xlib)"
else
  for mode in managed override; do
    say "--- contenitore '$mode' ($([ "$mode" = managed ] && echo 'finestra normale, gestita dal WM' || echo 'override-redirect, a tutto schermo senza WM'))"
    if [ "$INTERACTIVE" = 1 ]; then
      ask "Sta per partire il test (~25s, guarda lo schermo; potrebbe coprire il terminale). Invio per iniziare ('n' per saltare):" '^n?$' ""
      [ "$ANSWER" = "n" ] && { add_s "T10 reparenting [$mode]: saltato dall'utente"; continue; }
    fi
    hx 90 reparent "$mode" "$TMP"
    restore_terminal
    if [ "$INTERACTIVE" = 1 ]; then
      ask "Cosa hai visto? a = le due app alternarsi dentro il contenitore, p = solo una / parziale / frozen, n = nero o nulla, t = non ho potuto guardare [a/p/n/t]" '^[apnt]$' t
      add_s "T10 reparenting [$mode]: osservazione visiva='$ANSWER'"
    fi
  done
fi

# =============================================================== T11 freeze + chi legge il pad
sec T11 "Scope del gioco: chi tiene aperto il controller e congelamento"
CGROOT="${XL_DIAG_CGROOT:-/sys/fs/cgroup}"
if [ "$SKIP_FREEZE" = 1 ]; then say "(saltato: --skip-freeze)"
elif [ -z "$GAME_SCOPE" ]; then
  say "Nessuno scope di gioco identificato: serve un gioco lanciato da X-Launcher e selezionato in T06."
  add_s "T11 freeze: non eseguito (nessuno scope di gioco)"
else
  unit="$GAME_SCOPE"
  run 6 systemctl --user show "$unit.scope" -p ActiveState -p SubState -p ControlGroup -p FreezerState
  cg="$(systemctl --user show "$unit.scope" -p ControlGroup --value 2>/dev/null)"
  CGDIR="$CGROOT$cg"
  say "cgroup: $CGDIR (cgroup.procs leggibile: $([ -r "$CGDIR/cgroup.procs" ] && echo si || echo NO))"
  say "--- device di input/hidraw aperti dai processi dello scope (quanti fd, pid, comando):"
  readers="$(for pid in $(cat "$CGDIR/cgroup.procs" 2>/dev/null); do
      for fd in /proc/$pid/fd/*; do
        t="$(readlink "$fd" 2>/dev/null)"
        case "$t" in /dev/input/*|/dev/hidraw*|/dev/uinput) echo "$t (pid $pid $(cat /proc/$pid/comm 2>/dev/null))" ;; esac
      done
    done | sort | uniq -c)"
  say "${readers:-    (nessuno: il gioco non tiene aperto alcun /dev/input o hidraw)}"
  say "--- hidraw presenti:"
  for h in /sys/class/hidraw/hidraw*; do
    [ -e "$h" ] && say "    $(basename "$h"): $(grep -h HID_NAME "$h/device/uevent" 2>/dev/null)"
  done
  ls -l /dev/hidraw* 2>&1 | head -6 | sed 's/^/    /' | tee -a "$BODY"
  add_s "T11 device di input aperti dal gioco: $(printf '%s' "${readers:-nessuno}" | tr '\n' ';' | tr -s ' ')"

  if [ "$INTERACTIVE" = 0 ]; then
    say "(congelamento saltato: richiede interazione)"
  else
    ask "Congelo il gioco per ~20s e poi lo ripristino (lo ripristino anche con Ctrl+C). Se e' in una partita non salvata c'e' un piccolo rischio. Procedo? [s/N]" '^[sn]$' n
    if [ "$ANSWER" = s ]; then
      cpu() { awk '/^usage_usec/{print $2}' "$CGDIR/cpu.stat" 2>/dev/null; }
      bring_front "$GAME_WID"
      sleep 2
      u1="$(cpu)"; sleep 3; u2="$(cpu)"
      say "CPU dello scope in 3s, prima del freeze: $(( ${u2:-0} - ${u1:-0} )) usec"
      run 10 systemctl --user freeze "$unit.scope"
      if [ "$RUN_RC" = 0 ]; then
        FROZEN_UNIT="$unit"; FROZEN_METHOD=freeze
      else
        say "freeze non riuscito: ripiego su SIGSTOP dei pid dello scope"
        FROZEN_PIDS="$(tr '\n' ' ' < "$CGDIR/cgroup.procs" 2>/dev/null)"
        for pp in $FROZEN_PIDS; do kill -STOP "$pp" 2>/dev/null; done
        FROZEN_UNIT="$unit"; FROZEN_METHOD=sigstop
      fi
      sleep 1
      say "metodo=$FROZEN_METHOD FreezerState=$(systemctl --user show "$unit.scope" -p FreezerState --value 2>/dev/null) cgroup.events: $(tr '\n' ' ' < "$CGDIR/cgroup.events" 2>/dev/null)"
      u3="$(cpu)"; sleep 3; u4="$(cpu)"
      say "CPU dello scope in 3s, congelato: $(( ${u4:-0} - ${u3:-0} )) usec"
      say "ORA il gioco e' congelato: PREMI A piu' volte e muovi il D-pad per 8 secondi."
      "$PY" "$HELPER" evdev 8 > "$TMP/freeze-evdev.log" 2>&1 &
      wait $!
      sed 's/^/    /' "$TMP/freeze-evdev.log" | tee -a "$BODY"
      thaw_now
      sleep 2
      say "scongelato: FreezerState=$(systemctl --user show "$unit.scope" -p FreezerState --value 2>/dev/null)"
      restore_terminal
            add_s "T11 freeze: metodo=$FROZEN_METHOD (CPU 3s prima=$(( ${u2:-0} - ${u1:-0} )) usec, congelato=$(( ${u4:-0} - ${u3:-0} )) usec)"
      ask "Dopo lo scongelamento il gioco riprende normalmente (video, audio, tempo)? [s=si, n=no, p=con problemi]" '^[snp]$' s
      add_s "T11 ripresa dopo scongelamento: '$ANSWER'"
      ask "Il gioco ha reagito agli input premuti MENTRE era congelato (replay)? [s/n/?]" '^[sn?]$' '?'
      add_s "T11 input arretrato riprodotto al risveglio: '$ANSWER'"
      ask "Durante il congelamento l'audio era: s=silenzio, l=loop/ronzio, c=continuava, ?=non so [s/l/c/?]" '^[slc?]$' '?'
      add_s "T11 audio durante il congelamento: '$ANSWER'"
    else
      add_s "T11 freeze: saltato dall'utente"
    fi
  fi
fi

# =============================================================== T12 combo oggi
sec T12 "Select + D-pad oggi: cosa registra e cosa fa il backend"
DLOG="$HOME/.local/share/x-launcher/daemon.log"
if [ "$SKIP_COMBO" = 1 ]; then say "(saltato: --skip-combo)"
elif [ "$INTERACTIVE" = 0 ]; then say "(saltato: richiede il controller)"
elif [ -z "$DASH_WID" ] || [ -z "$GAME_WID" ]; then say "(saltato: servono Dashboard e gioco selezionati in T06)"
else
  for scen in dashboard game; do
    if [ "$scen" = dashboard ]; then wid="$DASH_WID"; else wid="$GAME_WID"; fi
    ask "Scenario '$scen in primo piano': la porto avanti io e hai 15s per premere Select+D-pad sx e dx piu' volte. Invio per iniziare ('n' = salta):" '^n?$' ""
    if [ "$ANSWER" = n ]; then add_s "T12 [$scen]: saltato dall'utente"; continue; fi
    before_n="$(wc -l < "$DLOG" 2>/dev/null || echo 0)"
    act_before="$(xprop -root _NET_ACTIVE_WINDOW 2>/dev/null | awk '{print $NF}')"
    desk_before="$(xdotool get_desktop 2>/dev/null)"
    bring_front "$wid"
    sleep 2
    say "--- [$scen] VIA: premi Select+D-pad sx e dx per 15 secondi..."
    "$PY" "$HELPER" evdev 15 > "$TMP/combo-$scen.log" 2>&1 &
    wait $!
    act_after="$(xprop -root _NET_ACTIVE_WINDOW 2>/dev/null | awk '{print $NF}')"
    desk_after="$(xdotool get_desktop 2>/dev/null)"
    restore_terminal
    sed 's/^/    /' "$TMP/combo-$scen.log" | tee -a "$BODY"
    nsel="$(sed -n 's/.*BTN_SELECT.*count=\([0-9]*\).*/\1/p' "$TMP/combo-$scen.log" | head -1)"
    nhat="$(sed -n 's/.*ABS_HAT0X.*count=\([0-9]*\).*/\1/p' "$TMP/combo-$scen.log" | head -1)"
    say "--- righe del log del daemon durante il test (filtrate):"
    tail -n +"$((before_n + 1))" "$DLOG" 2>/dev/null | grep -v 'isLastLaunchedGameRunning' \
      | grep -i -E 'DIAG|focus|select|input|window' | cut -c1-260 | head -40 | sed 's/^/    /' | tee -a "$BODY"
    ncombo="$(tail -n +"$((before_n + 1))" "$DLOG" 2>/dev/null | grep -c 'DIAG\] Select')"
    add_s "T12 [$scen in primo piano]: pad Select=${nsel:-0} D-pad=${nhat:-0}; combo registrate dalla Dashboard=$ncombo; finestra attiva $act_before -> $act_after; desktop $desk_before -> $desk_after"
  done
fi

# =============================================================== T15 contenitore con finestre reali
sec T15 "Contenitore con Dashboard e gioco REALI (reparenting) — rischioso"
if [ "$SKIP_REAL" = 1 ]; then say "(disattivato di default: in Kiosk ha lasciato lo schermo nero e la sessione inutilizzabile. Abilitalo con --with-realcontainer)"
elif [ "$INTERACTIVE" = 0 ]; then say "(saltato: richiede interazione)"
elif [ "$HAVE_XLIB" = 0 ]; then say "(saltato: manca python-xlib)"
elif [ -z "$DASH_WID" ] || [ -z "$GAME_WID" ]; then say "(saltato: servono Dashboard e gioco selezionati in T06)"
else
  say "Sposto per ~50s la finestra della DASHBOARD e quella del GIOCO dentro un contenitore, le alterno 4 volte e poi le rimetto a posto."
  say "RISCHI: schermo nero, gioco che si blocca o crasha, Chromium che non ridisegna. SALVA LA PARTITA prima di procedere."
  say "Se qualcosa va storto, riavvia il gioco o la sessione: lo script prova comunque a ripristinare le finestre."
  ask "Procedo con il contenitore reale? [s/N]" '^[sn]$' n
  if [ "$ANSWER" = "s" ]; then
    pids_before=""
    [ -n "$GAME_SCOPE" ] && pids_before="$(wc -w < "${XL_DIAG_CGROOT:-/sys/fs/cgroup}$(systemctl --user show "$GAME_SCOPE.scope" -p ControlGroup --value 2>/dev/null)/cgroup.procs" 2>/dev/null)"
    for mode in override managed; do
      if [ "$mode" = managed ] && [ "$HAVE_EWMH_WM" = 0 ]; then continue; fi
      say "--- contenitore '$mode' (guarda lo schermo: fasi da 5s)"
      ask "Invio per iniziare ('n' = salta questa modalita'):" '^n?$' ""
      if [ "$ANSWER" = "n" ]; then add_s "T15 contenitore reale [$mode]: saltato"; continue; fi
      hx 120 realcontainer "$DASH_WID" "$GAME_WID" "$mode" 5
      restore_terminal
      ask "    Hai visto alternarsi Dashboard e gioco nelle fasi? [s=si, p=parzialmente, n=no, t=non ho potuto guardare]" '^[spnt]$' t
      add_s "T15 [$mode] alternanza visiva Dashboard/gioco: '$ANSWER'"
      ask "    Il gioco era fluido (nessuno scatto, nessuno schermo nero)? [s/n/?]" '^[sn?]$' '?'
      add_s "T15 [$mode] gioco fluido nel contenitore: '$ANSWER'"
      ask "    Dopo il ripristino Dashboard e gioco sono tornati normali (immagine e input)? [s/n/?]" '^[sn?]$' '?'
      add_s "T15 [$mode] ripristino corretto: '$ANSWER'"
      if [ "$ANSWER" = "n" ]; then say "Ripristino non riuscito: salto le modalita' successive."; break; fi
    done
    if [ -n "$GAME_SCOPE" ]; then
      pids_after="$(wc -w < "${XL_DIAG_CGROOT:-/sys/fs/cgroup}$(systemctl --user show "$GAME_SCOPE.scope" -p ControlGroup --value 2>/dev/null)/cgroup.procs" 2>/dev/null)"
      say "Processi nello scope del gioco: prima=${pids_before:-?} dopo=${pids_after:-?}"
      add_s "T15 processi nello scope del gioco: prima=${pids_before:-?} dopo=${pids_after:-?}"
    fi
  else
    add_s "T15 contenitore reale: saltato dall'utente"
  fi
fi

# =============================================================== riepilogo
sec FINE "Riepilogo"
{
  echo "X-Launcher — diagnostica gamespace manager"
  echo "Generato: $(date -Is)   Display: $DISPLAY   Interattivo: $INTERACTIVE"
  echo
  echo "################ RIEPILOGO ################"
  for s in "${SUMMARY[@]}"; do echo " * $s"; done
  echo "###########################################"
  echo
  cat "$BODY"
} > "$OUT_FILE"

echo
echo "Fatto. Log completo: $OUT_FILE"
echo "Mandami questo file (contiene nomi delle finestre aperte e righe dei processi: controllalo se vuoi)."
