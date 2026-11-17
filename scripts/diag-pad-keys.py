#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
X-Launcher — diagnostica dei tasti del controller (CHANGELOG-19, scorciatoia per screenshot e clip).

Elenca i dispositivi di input del controller (anche quelli "tastiera" separati che alcuni driver
creano per il tasto Share) e stampa i tasti premuti per 20 secondi, con il dispositivo da cui
arrivano. Solo libreria standard di Python, nessun permesso speciale (stesso accesso di spaces.py).

    python3 scripts/diag-pad-keys.py            # 20 s
    python3 scripts/diag-pad-keys.py 40         # 40 s

Durante la prova premi, uno alla volta e con qualche secondo fra l'uno e l'altro:
    Share (breve)  ->  Share tenuto premuto ~2 s  ->  Select  ->  Start  ->  Xbox (guida)
Il log viene scritto anche in ~/xl-diag-pad-keys-<data>.log.
"""
import glob
import os
import select
import struct
import sys
import time

DURATION = float(sys.argv[1]) if len(sys.argv) > 1 else 20.0
LOG = os.path.expanduser("~/xl-diag-pad-keys-%s.log" % time.strftime("%Y%m%d-%H%M%S"))
FMT = "llHHi"
SIZE = struct.calcsize(FMT)
EV_NAMES = {0: "EV_SYN", 1: "EV_KEY", 3: "EV_ABS", 4: "EV_MSC"}
KEY_NAMES = {
    88: "KEY_F12", 167: "KEY_RECORD", 99: "KEY_SYSRQ", 210: "KEY_PRINT", 139: "KEY_MENU",
    172: "KEY_HOMEPAGE", 158: "KEY_BACK", 113: "KEY_MUTE",
    304: "BTN_SOUTH(A)", 305: "BTN_EAST(B)", 307: "BTN_NORTH(X/Y)", 308: "BTN_WEST(Y/X)",
    310: "BTN_TL(LB)", 311: "BTN_TR(RB)", 312: "BTN_TL2", 313: "BTN_TR2",
    314: "BTN_SELECT", 315: "BTN_START", 316: "BTN_MODE(Xbox)", 317: "BTN_THUMBL", 318: "BTN_THUMBR",
    544: "BTN_DPAD_UP", 545: "BTN_DPAD_DOWN", 546: "BTN_DPAD_LEFT", 547: "BTN_DPAD_RIGHT",
    0x2c0: "BTN_TRIGGER_HAPPY1", 0x2c1: "BTN_TRIGGER_HAPPY2", 0x2c2: "BTN_TRIGGER_HAPPY3",
    0x2c3: "BTN_TRIGGER_HAPPY4", 0x2c4: "BTN_TRIGGER_HAPPY5",
}
PAD_WORDS = ("xbox", "microsoft", "x-box", "controller", "gamepad", "xpad", "pad")

out = open(LOG, "w", encoding="utf-8")


def p(*a):
    line = " ".join(str(x) for x in a)
    print(line, flush=True)
    out.write(line + "\n")
    out.flush()


def dev_name(path):
    ev = os.path.basename(path)
    try:
        with open("/sys/class/input/%s/device/name" % ev, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return "?"


def dev_phys_uniq(path):
    ev = os.path.basename(path)
    vals = []
    for k in ("phys", "uniq"):
        try:
            with open("/sys/class/input/%s/device/%s" % (ev, k), encoding="utf-8") as f:
                vals.append("%s=%s" % (k, f.read().strip() or "-"))
        except OSError:
            pass
    try:
        vals.append("driver=%s" % os.path.basename(os.readlink("/sys/class/input/%s/device/device/driver" % ev)))
    except OSError:
        pass
    return " ".join(vals)


p("=== X-Launcher diag-pad-keys — %s ===" % time.strftime("%F %T"))
p("log:", LOG)
try:
    with open("/sys/module/hid_xpadneo/version") as f:
        p("xpadneo:", f.read().strip())
except OSError:
    p("xpadneo: non caricato (o senza versione)")
for mod in ("xpad", "hid_microsoft", "hid_xpadneo", "xone", "xpadneo"):
    if os.path.isdir("/sys/module/%s" % mod):
        p("modulo kernel presente:", mod)

p("\n--- dispositivi di input")
fds = {}
for path in sorted(glob.glob("/dev/input/event*"), key=lambda s: int(s.rsplit("event", 1)[1])):
    name = dev_name(path)
    is_pad = any(w in name.lower() for w in PAD_WORDS)
    p("%-20s %-50s %s%s" % (path, name, dev_phys_uniq(path), "   <-- letto" if is_pad else ""))
    if is_pad:
        try:
            fds[os.open(path, os.O_RDONLY | os.O_NONBLOCK)] = (path, name)
        except OSError as e:
            p("   impossibile aprire:", e)

if not fds:
    p("\nNessun controller trovato: accendilo/collegalo e rilancia.")
    sys.exit(1)

p("\n--- premi i tasti adesso (%d s): Share breve, Share tenuto ~2 s, Select, Start, Xbox" % DURATION)
t_end = time.time() + DURATION
down = {}
while time.time() < t_end:
    r, _, _ = select.select(list(fds), [], [], 0.5)
    for fd in r:
        try:
            data = os.read(fd, SIZE * 64)
        except OSError:
            continue
        path, name = fds[fd]
        for i in range(0, len(data) - SIZE + 1, SIZE):
            sec, usec, t, code, value = struct.unpack(FMT, data[i:i + SIZE])
            if t == 1:   # EV_KEY
                label = KEY_NAMES.get(code, "code %d" % code)
                state = {0: "rilasciato", 1: "premuto", 2: "ripetuto"}.get(value, str(value))
                extra = ""
                if value == 1:
                    down[(fd, code)] = sec + usec / 1e6
                elif value == 0 and (fd, code) in down:
                    extra = "  (tenuto %.2f s)" % (sec + usec / 1e6 - down.pop((fd, code)))
                p("%s  %-12s %-22s %-10s  <- %s (%s)%s" % (time.strftime("%H:%M:%S"), "EV_KEY", label, state, path, name, extra))
            elif t == 4 and code == 4:   # EV_MSC/MSC_SCAN: codice HID grezzo, utile se il tasto non ha un EV_KEY
                p("%s  %-12s scan=0x%x  <- %s (%s)" % (time.strftime("%H:%M:%S"), "EV_MSC", value & 0xffffffff, path, name))
            elif t == 3 and code in (16, 17) and value != 0:   # D-pad come asse, solo per riferimento
                p("%s  %-12s %s=%d  <- %s" % (time.strftime("%H:%M:%S"), "EV_ABS", "HAT0X" if code == 16 else "HAT0Y", value, path))

p("\nFatto. Condividi il log:", LOG)
