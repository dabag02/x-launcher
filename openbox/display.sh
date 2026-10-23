#!/usr/bin/env bash
# =============================================================
#  X-Launcher — layout dei monitor per la sessione Openbox "Shell"
#
#  Perche' serve: in XFCE il layout dei monitor (quale e' primario, posizione,
#  rotazione, scala) lo applica XFCE stesso; in una sessione Openbox nuda non lo
#  applica nessuno, e i giochi scelgono il monitor in (0,0) o il "primario"
#  (assente, o il primo della lista). Risultato: il gioco si apre sul secondo
#  schermo. Questo script ripristina un layout DETERMINISTICO a ogni avvio:
#  l'output principale e' primario e sta a +0+0.
#
#  REGOLA DELLA SESSIONE SHELL: si lavora col SOLO monitor principale; gli altri
#  vengono SPENTI (SECONDARY="off" e' il default). Vale anche quando c'e'
#  XRANDR_ARGS: gli output diversi dal principale vengono comunque spenti e il
#  principale viene portato a +0+0. Per tenere acceso il secondo monitor serve
#  SECONDARY="keep" ESPLICITO.
#
#  Viene chiamato da openbox/autostart PRIMA di Chromium. Uso manuale:
#    bash openbox/display.sh               applica il layout
#    bash openbox/display.sh --dry-run     mostra il comando xrandr senza eseguirlo
#    bash openbox/display.sh --capture     stampa il layout ATTUALE come
#                                          XRANDR_ARGS pronto da incollare nella
#                                          configurazione (da lanciare in XFCE,
#                                          col layout che vuoi conservare)
#
#  Configurazione (opzionale): ~/.config/x-launcher/shell-display.conf
#  (sintassi shell, vedi shell-display.conf.example):
#    MAIN_OUTPUT="DP-4"    output principale (default: quello indicato da
#                          --primary in XRANDR_ARGS, altrimenti quello gia'
#                          primario, altrimenti il piu' grande)
#    MAIN_MODE="2560x1440" modo dell'output principale (default: invariato)
#    SECONDARY="off|keep"  altri monitor: SPENTI (default) o lasciati accesi.
#                          Con "off" ogni --output diverso dal principale in
#                          XRANDR_ARGS viene sostituito da "--off".
#    XRANDR_ARGS="..."     argomenti completi di xrandr; con SECONDARY="off"
#                          conta solo la parte relativa all'output principale
#    SECONDARY_SIDE="right|left|above|below"   dove metterli se "keep" senza
#                          XRANDR_ARGS (default: right)
#
#  Log: ~/.local/share/x-launcher/display.log
# =============================================================
set -u

ACTION=apply
for a in "$@"; do
  case "$a" in
    --dry-run) ACTION=dry-run ;;
    --capture) ACTION=capture ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "Opzione sconosciuta: $a"; exit 2 ;;
  esac
done

CONF="${XDG_CONFIG_HOME:-$HOME/.config}/x-launcher/shell-display.conf"
LOG_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/x-launcher"
LOG_FILE="$LOG_DIR/display.log"
mkdir -p "$LOG_DIR"
log() { printf '[%s] %s\n' "$(date -Is)" "$*" | tee -a "$LOG_FILE" >&2; }

XRANDR_ARGS=""; MAIN_OUTPUT=""; MAIN_MODE=""; SECONDARY="off"; SECONDARY_SIDE="right"
if [ -f "$CONF" ]; then
  # shellcheck disable=SC1090
  . "$CONF"
  [ "$ACTION" = capture ] || log "configurazione letta: $CONF"
elif [ "$ACTION" != capture ]; then
  log "nessuna configurazione ($CONF): modalita' automatica"
fi

# test: XL_DISPLAY_XRANDR_TXT = file con un 'xrandr --query' registrato
read_xrandr() {
  if [ -n "${XL_DISPLAY_XRANDR_TXT:-}" ]; then cat "$XL_DISPLAY_XRANDR_TXT"; else xrandr --query 2>/dev/null; fi
}

# attesa dell'X server (all'avvio della sessione puo' non essere ancora pronto)
if [ -z "${XL_DISPLAY_XRANDR_TXT:-}" ]; then
  for _ in $(seq 1 20); do xrandr --query >/dev/null 2>&1 && break; sleep 0.5; done
fi

XR_TXT="$(read_xrandr)"
if [ -z "$XR_TXT" ]; then log "ERRORE: xrandr non risponde (DISPLAY=${DISPLAY:-?})"; exit 1; fi

# ------------------------------------------------------------------ python: parsing e piano
read -r -d '' PLAN_PY <<'PYEOF'
import os, re, sys

def parse(txt):
    outs, cur = [], None
    rx = re.compile(r"^(?P<name>\S+) (?P<state>connected|disconnected)(?P<primary> primary)?"
                    r"(?: (?P<w>\d+)x(?P<h>\d+)\+(?P<x>-?\d+)\+(?P<y>-?\d+))?(?: (?P<rot>left|inverted|right))?")
    for line in txt.splitlines():
        m = rx.match(line)
        if m:
            cur = {"name": m["name"], "connected": m["state"] == "connected", "primary": bool(m["primary"]),
                   "geom": None, "rot": m["rot"] or "normal", "mode": None, "modes": []}
            if m["w"]:
                cur["geom"] = (int(m["w"]), int(m["h"]), int(m["x"]), int(m["y"]))
            outs.append(cur)
            continue
        mm = re.match(r"^\s+(\d+x\d+)\s+(.*)$", line)
        if mm and cur:
            cur["modes"].append(mm[1])
            if "*" in mm[2]:
                cur["mode"] = mm[1]
    return outs

def capture_args(outs):
    parts = []
    for o in outs:
        if not o["connected"]:
            continue
        name = o["name"]
        if not o["geom"]:
            parts.append(f"--output {name} --off")
            continue
        w, h, x, y = o["geom"]
        mode = o["mode"] or f"{w}x{h}"
        mw, mh = (int(v) for v in mode.split("x"))
        if o["rot"] in ("left", "right"):
            sx, sy = w / mh, h / mw
        else:
            sx, sy = w / mw, h / mh
        s = f"--output {name}"
        if o["primary"]:
            s += " --primary"
        s += f" --mode {mode} --pos {x}x{y} --rotate {o['rot']}"
        if abs(sx - 1) > 0.01 or abs(sy - 1) > 0.01:
            s += f" --scale {round(sx, 4):g}x{round(sy, 4):g}"
        parts.append(s)
    return " ".join(parts)

def auto_main(connected):
    prim = [o for o in connected if o["primary"]]
    if prim:
        return prim[0]["name"]
    enabled = [o for o in connected if o["geom"]] or connected
    return max(enabled, key=lambda o: (o["geom"][0] * o["geom"][1]) if o["geom"] else 0)["name"]

def main_only(args, main, connected_names):
    """Tiene solo la parte di XRANDR_ARGS relativa all'output principale (primario, a 0x0)
    e spegne tutti gli altri output connessi."""
    parts = args.split("--output ")
    prefix = parts[0].strip()
    rest_main = None
    for seg in parts[1:]:
        toks = seg.split()
        if toks and toks[0] == main:
            rest_main = toks[1:]
    toks = []
    skip = False
    for t in (rest_main or []):
        if skip:
            skip = False
            continue
        if t == "--pos":
            skip = True
            continue
        if t == "--primary":
            continue
        toks.append(t)
    out = []
    if prefix:
        out.append(prefix)
    seg_main = "--output %s --primary %s --pos 0x0" % (main, " ".join(toks))
    out.append(" ".join(seg_main.split()))
    for n in connected_names:
        if n != main:
            out.append("--output %s --off" % n)
    return " ".join(out)

def plan():
    outs = parse(sys.stdin.read())
    if os.environ.get("XL_MODE") == "capture":
        print("ARGS=" + capture_args(outs))
        return
    connected = [o for o in outs if o["connected"]]
    if not connected:
        print("NOTE=nessun output connesso")
        return
    conf_args = os.environ.get("XRANDR_ARGS", "").strip()
    main_out = os.environ.get("MAIN_OUTPUT", "").strip()
    secondary = os.environ.get("SECONDARY", "off")
    names_conn = [o["name"] for o in connected]
    if conf_args:
        if not main_out:
            for seg in conf_args.split("--output ")[1:]:
                toks = seg.split()
                if toks and "--primary" in toks:
                    main_out = toks[0]
                    break
        if not main_out:
            main_out = auto_main(connected)
            print("NOTE=in XRANDR_ARGS nessun output e' marcato --primary: uso %s come principale" % main_out)
        if main_out not in names_conn:
            print("NOTE=MAIN_OUTPUT=%s non e' connesso (connessi: %s)" % (main_out, " ".join(names_conn)))
            main_out = names_conn[0]
        if secondary == "off":
            conf_args = main_only(conf_args, main_out, names_conn)
            print("NOTE=SECONDARY=off: gli altri output vengono spenti anche se XRANDR_ARGS li descrive")
        print("MAIN=" + main_out)
        print("ARGS=" + conf_args)
        return
    if not main_out:
        main_out = auto_main(connected)
    names = [o["name"] for o in connected]
    if main_out not in names:
        print("NOTE=MAIN_OUTPUT=%s non e' connesso (connessi: %s)" % (main_out, " ".join(names)))
        main_out = names[0]
    args = f"--output {main_out} --primary --pos 0x0"
    if os.environ.get("MAIN_MODE"):
        args += " --mode " + os.environ["MAIN_MODE"]
    side = {"right": "--right-of", "left": "--left-of", "above": "--above", "below": "--below"}.get(
        os.environ.get("SECONDARY_SIDE", "right"), "--right-of")
    for o in connected:
        if o["name"] == main_out:
            continue
        if os.environ.get("SECONDARY", "off") == "off":
            args += f" --output {o['name']} --off"
        else:
            args += f" --output {o['name']} --auto {side} {main_out}"
    print("MAIN=" + main_out)
    print("ARGS=" + args)

def verify():
    outs = parse(sys.stdin.read())
    want = os.environ.get("MAIN", "")
    prim = [o for o in outs if o["connected"] and o["primary"]]
    got = prim[0] if prim else None
    enabled = [o for o in outs if o["connected"] and o["geom"]]
    if len(enabled) == 1:
        print(f"VERIFY=OK un solo output attivo ({enabled[0]['name']}): il primario e' irrilevante")
    elif not got:
        print("VERIFY=ATTENZIONE: nessun output risulta primario")
    elif want and got["name"] != want:
        print(f"VERIFY=ATTENZIONE: primario={got['name']}, atteso {want}")
    elif got["geom"] and (got["geom"][2], got["geom"][3]) != (0, 0):
        print(f"VERIFY=ATTENZIONE: il primario {got['name']} non sta a +0+0 (sta a +{got['geom'][2]}+{got['geom'][3]})")
    else:
        print(f"VERIFY=OK primario={got['name']} geometria={got['geom']}")
    en = [o["name"] for o in outs if o["connected"] and o["geom"]]
    print("VERIFY_ENABLED=" + " ".join(en))
    if os.environ.get("SECONDARY", "off") == "off" and want:
        extra = [n for n in en if n != want]
        if extra:
            print("VERIFY=ATTENZIONE: SECONDARY=off ma risultano ancora attivi: " + " ".join(extra))
        else:
            print("VERIFY=OK solo il monitor principale (%s) e' attivo" % want)

if os.environ.get("XL_STEP") == "verify":
    verify()
else:
    plan()
PYEOF

if [ "$ACTION" = capture ]; then
  OUT="$(printf '%s\n' "$XR_TXT" | XL_MODE=capture python3 -c "$PLAN_PY")"
  echo "# Incolla in $CONF"
  echo "XRANDR_ARGS=\"${OUT#ARGS=}\""
  exit 0
fi

PLAN="$(printf '%s\n' "$XR_TXT" | XL_MODE="$ACTION" XRANDR_ARGS="$XRANDR_ARGS" MAIN_OUTPUT="$MAIN_OUTPUT" \
        MAIN_MODE="$MAIN_MODE" SECONDARY="$SECONDARY" SECONDARY_SIDE="$SECONDARY_SIDE" python3 -c "$PLAN_PY")"
MAIN="$(printf '%s\n' "$PLAN" | sed -n 's/^MAIN=//p' | head -1)"
ARGS="$(printf '%s\n' "$PLAN" | sed -n 's/^ARGS=//p' | head -1)"
printf '%s\n' "$PLAN" | sed -n 's/^NOTE=/NOTA: /p' | while read -r l; do log "$l"; done

if [ -z "$ARGS" ]; then log "nessun comando xrandr da eseguire"; exit 1; fi
log "output principale: ${MAIN:-?}  |  xrandr $ARGS"

if [ "$ACTION" = dry-run ]; then echo "xrandr $ARGS"; exit 0; fi

# shellcheck disable=SC2086
if ! xrandr $ARGS >>"$LOG_FILE" 2>&1; then
  log "ERRORE: xrandr ha rifiutato il comando (vedi sopra nel log)"
  exit 1
fi
sleep 1
VER="$(xrandr --query 2>/dev/null | MAIN="$MAIN" SECONDARY="$SECONDARY" XL_STEP=verify python3 -c "$PLAN_PY")"
printf '%s\n' "$VER" | while read -r l; do log "$l"; done
exit 0
