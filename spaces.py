#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
spaces.py — Gestore degli spazi (Step 21, Fasi 2-3) per la sessione Openbox "Shell".

Cosa fa, nella sessione Openbox (XDG_CURRENT_DESKTOP=Openbox, impostato da
openbox/autostart):

  * INDICE DEI CLIENT. Ascolta `_NET_CLIENT_LIST` sulla root (Openbox la
    aggiorna a ogni finestra gestita) e classifica ogni nuova finestra:
      - Dashboard  : Chromium in modalità app su localhost (classe
                     localhost/Chromium o titolo "X-Launcher HTPC");
      - gioco      : la finestra appartiene a uno scope systemd
                     `xlauncher-game-<id>-<ts>.scope` (PID da `_NET_WM_PID`, con
                     ripiego su X-Resource per i giochi in container come Proton,
                     poi /proc/<pid>/cgroup), oppure ha classe `steam_app_<id>`
                     (giochi Steam via URI: non passano dal Process Manager);
      - launcher   : scope `xlauncher-shared-launcher-*` (nessuno slot);
      - altro      : ignorato.
    Le finestre "di servizio" di Wine (IME, GDI+, finestre minuscole, tipi
    menu/tooltip/dock) vengono filtrate.

  * SPAZI. Spazio 0 = Dashboard = desktop 1 di Openbox (indice 0). Ogni gioco
    prende uno slot libero (max 3) = desktop 2-4 (indici 1-3). Alla comparsa
    della finestra di un gioco la sposta sul desktop del suo slot e ci passa.
    Alla chiusura (dopo una breve tolleranza) libera lo slot e torna allo spazio
    precedente (o alla Dashboard). Il quarto gioco non ha slot: resta dov'e'
    (la regola vera sul quarto lancio e' della Fase 4).

  * DIAGNOSTICA (dev.6). Ogni finestra che compare viene registrata nel log con
    classe, titolo, PID, scope, tipo, dimensioni e classificazione (anche se
    ignorata), e `spaces.py ctl clients` elenca tutto l'indice con il desktop
    reale di ogni finestra. Le finestre classificate "altro" o "rumore" vengono
    rivalutate per 30 s (il titolo di alcune applicazioni, es. RetroArch, viene
    impostato dopo la mappatura).

  * CONTROLLER (Fase 3). Legge il pad direttamente da evdev (/dev/input/event*),
    senza grab e senza dipendere da Chromium, quindi funziona qualunque finestra
    sia in primo piano:
        Select + D-pad destra  -> spazio successivo (ciclico)
        Select + D-pad sinistra -> spazio precedente (ciclico)
        Select + L1 + R1        -> Dashboard (spazio 0)
    Codici verificati su hardware reale (Xbox Wireless Controller): BTN_SELECT
    (314), BTN_TL/BTN_TR (310/311), D-pad come ABS_HAT0X (-1/0/+1); supporta
    anche D-pad come BTN_DPAD_LEFT/RIGHT (546/547). Riconosce il pad per nome,
    rileva il collegamento e lo scollegamento (riscansione ogni 3 s).

  * CANALE LOCALE. Socket Unix (stesso percorso calcolato dal backend):
        /run/user/<uid>/x-launcher-spaces.sock  (altrimenti /tmp/...)
    Protocollo: una riga JSON per richiesta, una per risposta.
        {"cmd":"state"} | {"cmd":"next"} | {"cmd":"prev"} |
        {"cmd":"switch","space":N} | {"cmd":"dashboard"}
    {"cmd":"clients"}  (diagnostica: l'indice completo)
    CLI:  python spaces.py ctl state|next|prev|dashboard|switch N|clients

Uso:
    - dentro tray.py (modalita' shell): spaces.run_forever()
    - autonomo (debug):  python spaces.py daemon

Variabili di test (non servono in produzione):
    XL_SPACES_GRACE_S / XL_SPACES_LAUNCH_GRACE_S / XL_SPACES_LAUNCH_WINDOW_S
    XL_SPACES_TEST_SCOPES=file  righe "pid scope" che sostituiscono la lettura
                                di /proc/<pid>/cgroup
    XL_SPACES_TEST_PAD=percorso file/FIFO letto come un device evdev in piu'

Dipendenza: python-xlib (gia' nel venv del tray).
"""
import atexit
import errno
import json
import os
import re
import select
import socket
import struct
import sys
import threading
import time

try:
    from Xlib import X, display, protocol
    HAVE_XLIB = True
    XLIB_ERR = ""
except Exception as _e:  # noqa
    HAVE_XLIB = False
    XLIB_ERR = str(_e)

try:
    from Xlib.ext import res as _xres_ext
except Exception:  # noqa
    _xres_ext = None

NUM_SLOTS = 3
# Tolleranza prima di liberare lo slot di un gioco rimasto senza finestre. Nei primi
# LAUNCH_WINDOW_S secondi dalla prima finestra del gioco la tolleranza e' piu' lunga
# (LAUNCH_GRACE_S): alcune applicazioni (es. RetroArch al caricamento del core)
# distruggono e ricreano la finestra durante l'avvio, anche dopo parecchi secondi.
RELEASE_GRACE_S = float(os.environ.get("XL_SPACES_GRACE_S", "3.0"))
LAUNCH_GRACE_S = float(os.environ.get("XL_SPACES_LAUNCH_GRACE_S", "20.0"))
LAUNCH_WINDOW_S = float(os.environ.get("XL_SPACES_LAUNCH_WINDOW_S", "45.0"))
DASHBOARD_TITLE = "X-Launcher HTPC"
HOTKEY_DEBOUNCE_S = 0.25
PAD_RESCAN_S = 3.0

SCOPE_RX = re.compile(r"(xlauncher-(?:game|shared-launcher)-[^/]+?)\.scope")
STEAM_CLASS_RX = re.compile(r"^steam_app_(\d+)$")
NOISE_NAME_RX = re.compile(r"Default IME|MSCTFIME|GDI\+ Window|DDE Server")
IGNORED_TYPES = {
    "_NET_WM_WINDOW_TYPE_DOCK", "_NET_WM_WINDOW_TYPE_TOOLBAR", "_NET_WM_WINDOW_TYPE_MENU",
    "_NET_WM_WINDOW_TYPE_DROPDOWN_MENU", "_NET_WM_WINDOW_TYPE_POPUP_MENU",
    "_NET_WM_WINDOW_TYPE_TOOLTIP", "_NET_WM_WINDOW_TYPE_NOTIFICATION",
    "_NET_WM_WINDOW_TYPE_COMBO", "_NET_WM_WINDOW_TYPE_DND", "_NET_WM_WINDOW_TYPE_DESKTOP",
}

# evdev
EV_KEY, EV_ABS = 1, 3
BTN_SELECT, BTN_TL, BTN_TR = 314, 310, 311
BTN_DPAD_LEFT, BTN_DPAD_RIGHT = 546, 547
ABS_HAT0X = 16
_EV_FMT = "llHHi"
_EV_SIZE = struct.calcsize(_EV_FMT)


def log(*a):
    print("[spaces]", *a, flush=True)


def socket_path():
    """Stesso calcolo del backend (src/backend/spacesClient.ts)."""
    uid = os.getuid()
    run_dir = "/run/user/%d" % uid
    if os.path.isdir(run_dir):
        return os.path.join(run_dir, "x-launcher-spaces.sock")
    return "/tmp/x-launcher-spaces-%d.sock" % uid


# --------------------------------------------------------------------------- X helpers
def _prop(d, w, name):
    try:
        a = d.intern_atom(name, True)
        if not a:
            return None
        return w.get_full_property(a, X.AnyPropertyType)
    except Exception:
        return None


def _cards(d, w, name):
    r = _prop(d, w, name)
    if r is None:
        return None
    try:
        return list(r.value)
    except Exception:
        return None


def _text(d, w, name):
    r = _prop(d, w, name)
    if r is None:
        return None
    v = r.value
    if isinstance(v, (bytes, bytearray)):
        return bytes(v).decode("utf-8", "replace")
    return str(v)


def _atoms(d, w, name):
    c = _cards(d, w, name)
    if c is None:
        return []
    out = []
    for x in c:
        try:
            out.append(d.get_atom_name(x))
        except Exception:
            pass
    return out


def _xres_pid(d, wid):
    """PID del client X via X-Resource (utile per i giochi in container, dove
    _NET_WM_PID e' un PID di un'altra namespace)."""
    try:
        if _xres_ext is None or not d.has_extension("X-Resource"):
            return None
        r = d.res_query_client_ids([{"client": wid, "mask": _xres_ext.LocalClientPIDMask}])
        for item in r.ids:
            if item.value:
                return int(item.value[0])
    except Exception:
        pass
    return None


def scope_of_pid(pid):
    if not pid:
        return None
    tf = os.environ.get("XL_SPACES_TEST_SCOPES")
    if tf:
        try:
            for line in open(tf):
                p = line.split()
                if len(p) >= 2 and p[0] == str(pid):
                    return p[1]
        except Exception:
            pass
    try:
        cg = open("/proc/%d/cgroup" % int(pid)).read()
    except Exception:
        return None
    m = SCOPE_RX.search(cg)
    return m.group(1) if m else None


class XActions:
    """Azioni EWMH verso il WM, su una connessione X dedicata e protetta da lock."""

    def __init__(self):
        self.d = display.Display()
        self.root = self.d.screen().root
        self.lock = threading.Lock()

    def _send(self, window, atom_name, data):
        ev = protocol.event.ClientMessage(window=window, client_type=self.d.intern_atom(atom_name),
                                          data=(32, data))
        self.root.send_event(ev, event_mask=X.SubstructureRedirectMask | X.SubstructureNotifyMask,
                             onerror=lambda err, req: None)

    def switch_desktop(self, idx):
        with self.lock:
            self._send(self.root, "_NET_CURRENT_DESKTOP", [int(idx), X.CurrentTime, 0, 0, 0])
            self.d.sync()

    def move_window(self, wid, idx):
        with self.lock:
            w = self.d.create_resource_object("window", wid)
            self._send(w, "_NET_WM_DESKTOP", [int(idx), 2, 0, 0, 0])
            self.d.sync()

    def activate(self, wid):
        with self.lock:
            w = self.d.create_resource_object("window", wid)
            self._send(w, "_NET_ACTIVE_WINDOW", [2, X.CurrentTime, 0, 0, 0])
            self.d.sync()

    def current_desktop(self):
        with self.lock:
            c = _cards(self.d, self.root, "_NET_CURRENT_DESKTOP")
        return c[0] if c else None


# --------------------------------------------------------------------------- gestore
class SpacesManager:
    def __init__(self):
        self.xa = XActions()
        self.de = display.Display()          # connessione degli eventi e delle letture
        self.root = self.de.screen().root
        self.lock = threading.RLock()
        self.clients = {}                    # wid -> info
        self.slots = {}                      # slot -> scope
        self.scope_slot = {}                 # scope -> slot
        self.scope_wins = {}                 # scope -> set(wid) delle finestre "vere"
        self.scope_t0 = {}                   # scope -> istante della prima finestra
        self.timers = {}                     # scope -> threading.Timer
        self.dashboard_wid = None
        self.cur_space = 0
        self.prev_space = 0
        self._last_sync = 0.0
        self._last_retry = 0.0

    # ----- classificazione
    def describe(self, wid):
        d = self.de
        w = d.create_resource_object("window", wid)
        try:
            g = w.get_geometry()
            w.get_attributes()
        except Exception:
            return None
        name = _text(d, w, "_NET_WM_NAME") or _text(d, w, "WM_NAME") or ""
        try:
            c = w.get_wm_class()
            inst, klass = (c[0], c[1]) if c else ("", "")
        except Exception:
            inst, klass = "", ""
        pids = _cards(d, w, "_NET_WM_PID")
        pid = pids[0] if pids else None
        scope = scope_of_pid(pid)
        xpid = None
        if not scope:
            xpid = _xres_pid(d, wid)
            scope = scope_of_pid(xpid)
        types = _atoms(d, w, "_NET_WM_WINDOW_TYPE")
        kind = "other"
        if "chrom" in klass.lower() and (inst == "localhost" or name == DASHBOARD_TITLE
                                         or "x-launcher" in name.lower()):
            kind = "dashboard"
        elif scope and scope.startswith("xlauncher-game-"):
            kind = "game"
        elif scope and scope.startswith("xlauncher-shared-launcher-"):
            kind = "launcher"
        else:
            m = STEAM_CLASS_RX.match(inst) or STEAM_CLASS_RX.match(klass)
            if m:
                kind = "game"
                scope = "steam-%s" % m.group(1)
        noise = (not name or bool(NOISE_NAME_RX.search(name)) or g.width <= 10 or g.height <= 10
                 or any(t in IGNORED_TYPES for t in types))
        return {"wid": wid, "name": name, "class": "%s/%s" % (inst, klass), "pid": pid or xpid,
                "scope": scope, "kind": kind, "noise": noise, "w": g.width, "h": g.height,
                "types": [t.replace("_NET_WM_WINDOW_TYPE_", "") for t in types],
                "t": time.time(), "tries": 0}

    # ----- indice
    def sync_clients(self, initial=False):
        cl = _cards(self.de, self.root, "_NET_CLIENT_LIST")
        cur = set(cl or [])
        with self.lock:
            known = set(self.clients)
        for wid in sorted(cur - known):
            self.on_new(wid, initial)
        for wid in sorted(known - cur):
            self.on_gone(wid)
        self._last_sync = time.time()

    def on_new(self, wid, initial=False):
        info = self.describe(wid)
        if info is None:
            return
        with self.lock:
            self.clients[wid] = info
        log("client 0x%x kind=%s%s class=%s name=%r pid=%s scope=%s tipo=%s %dx%d"
            % (wid, info["kind"], " (rumore)" if info["noise"] else "", info["class"], info["name"],
               info["pid"], info["scope"], ",".join(info["types"]) or "-", info["w"], info["h"]))
        self._apply(info, initial)

    def _apply(self, info, initial):
        wid, kind = info["wid"], info["kind"]
        if kind == "dashboard":
            with self.lock:
                self.dashboard_wid = wid
            log("Dashboard: finestra 0x%x (%s)" % (wid, info["class"]))
            return
        if kind == "launcher":
            log("launcher %s: finestra 0x%x '%s' — nessuno slot" % (info["scope"], wid, info["name"]))
            return
        if kind != "game" or info["noise"]:
            return
        scope = info["scope"]
        slot = self.assign_slot(scope)
        if slot is None:
            log("gioco %s: nessuno slot libero (max %d) — finestra 0x%x lasciata dov'e'" % (scope, NUM_SLOTS, wid))
            return
        with self.lock:
            first = not self.scope_wins.get(scope)     # il gioco non aveva finestre: questa e' la "prima"
            self.scope_wins.setdefault(scope, set()).add(wid)
            self.scope_t0.setdefault(scope, time.time())
            t = self.timers.pop(scope, None)
        if t:
            t.cancel()
        log("gioco %s: finestra 0x%x '%s' (%dx%d) -> spazio %d (desktop %d)"
            % (scope, wid, info["name"], info["w"], info["h"], slot, slot + 1))
        self.xa.move_window(wid, slot)
        if first and not initial:
            self.switch_space(slot, activate=wid, reason="nuovo gioco")

    def on_gone(self, wid):
        with self.lock:
            info = self.clients.pop(wid, None)
        if not info:
            return
        if info["kind"] == "dashboard":
            with self.lock:
                if self.dashboard_wid == wid:
                    self.dashboard_wid = None
            log("Dashboard: finestra 0x%x chiusa" % wid)
            return
        if info["kind"] != "game" or info["noise"]:
            return
        scope = info["scope"]
        with self.lock:
            wins = self.scope_wins.get(scope)
            if wins:
                wins.discard(wid)
            empty = not wins
            if empty:
                young = time.time() - self.scope_t0.get(scope, 0) < LAUNCH_WINDOW_S
                grace = LAUNCH_GRACE_S if young else RELEASE_GRACE_S
                log("gioco %s senza finestre: attendo %.0f s prima di liberare lo slot%s"
                    % (scope, grace, " (avvio in corso)" if young else ""))
                tm = threading.Timer(grace, self.release_scope, args=(scope,))
                tm.daemon = True
                old = self.timers.pop(scope, None)
                self.timers[scope] = tm
            else:
                tm = None
                old = None
        if old:
            old.cancel()
        if tm:
            tm.start()

    def assign_slot(self, scope):
        with self.lock:
            if scope in self.scope_slot:
                return self.scope_slot[scope]
            for s in range(1, NUM_SLOTS + 1):
                if s not in self.slots:
                    self.slots[s] = scope
                    self.scope_slot[scope] = s
                    log("slot %d assegnato a %s" % (s, scope))
                    return s
        return None

    def release_scope(self, scope):
        with self.lock:
            if self.scope_wins.get(scope):
                return                       # nel frattempo e' ricomparsa una finestra
            slot = self.scope_slot.pop(scope, None)
            if slot is not None:
                self.slots.pop(slot, None)
            self.scope_wins.pop(scope, None)
            self.scope_t0.pop(scope, None)
            self.timers.pop(scope, None)
            was_current = slot is not None and self.cur_space == slot
            target = self.prev_space if (self.prev_space == 0 or self.prev_space in self.slots) else 0
        if slot is None:
            return
        log("slot %d liberato (%s senza finestre)" % (slot, scope))
        if was_current:
            self.switch_space(target, reason="gioco chiuso")

    # ----- spazi
    def space_window(self, space):
        with self.lock:
            if space == 0:
                return self.dashboard_wid
            scope = self.slots.get(space)
            wins = self.scope_wins.get(scope) or set()
            best, best_area = None, -1
            for w in wins:
                i = self.clients.get(w)
                if i and i["w"] * i["h"] > best_area:
                    best, best_area = w, i["w"] * i["h"]
            return best

    def switch_space(self, space, activate=None, reason="richiesta"):
        with self.lock:
            valid = space == 0 or space in self.slots
        if not valid:
            log("switch %s ignorato: spazio non occupato" % space)
            return False
        target = activate or self.space_window(space)
        self.xa.switch_desktop(space)
        if target:
            self.xa.activate(target)
        log("-> spazio %d (%s)%s" % (space, reason, " finestra 0x%x" % target if target else ""))
        return True

    def occupied(self):
        with self.lock:
            return [0] + sorted(self.slots)

    def cycle(self, delta):
        sp = self.occupied()
        with self.lock:
            cur = self.cur_space
        i = sp.index(cur) if cur in sp else 0
        return self.switch_space(sp[(i + delta) % len(sp)], reason="ciclo %+d" % delta)

    def go_dashboard(self):
        return self.switch_space(0, reason="dashboard")

    def state(self):
        with self.lock:
            spaces = [{"space": 0, "kind": "dashboard", "window": self.dashboard_wid}]
            for s in sorted(self.slots):
                scope = self.slots[s]
                spaces.append({"space": s, "kind": "game", "scope": scope,
                               "window": self.space_window(s),
                               "title": next((self.clients[w]["name"] for w in self.scope_wins.get(scope, [])
                                              if w in self.clients), "")})
            return {"ok": True, "current": self.cur_space, "previous": self.prev_space, "spaces": spaces}

    def clients_dump(self):
        out = []
        with self.lock:
            infos = list(self.clients.values())
        for i in sorted(infos, key=lambda x: x["wid"]):
            c = _cards(self.de, self.de.create_resource_object("window", i["wid"]), "_NET_WM_DESKTOP")
            out.append({"window": i["wid"], "kind": i["kind"], "noise": i["noise"], "class": i["class"],
                        "name": i["name"], "pid": i["pid"], "scope": i["scope"], "types": i["types"],
                        "size": "%dx%d" % (i["w"], i["h"]), "desktop": c[0] if c else None,
                        "age_s": round(time.time() - i["t"], 1)})
        return {"ok": True, "clients": out}

    def command(self, req):
        cmd = (req or {}).get("cmd")
        if cmd == "state":
            return self.state()
        if cmd == "clients":
            return self.clients_dump()
        if cmd == "next":
            ok = self.cycle(+1)
        elif cmd == "prev":
            ok = self.cycle(-1)
        elif cmd == "dashboard":
            ok = self.go_dashboard()
        elif cmd == "switch":
            try:
                ok = self.switch_space(int(req.get("space")), reason="ctl")
            except (TypeError, ValueError):
                return {"ok": False, "error": "space non valido"}
        else:
            return {"ok": False, "error": "comando sconosciuto: %s" % cmd}
        out = self.state()
        out["ok"] = bool(ok)
        return out

    # ----- ciclo eventi X
    def _read_current_desktop(self):
        c = _cards(self.de, self.root, "_NET_CURRENT_DESKTOP")
        if c:
            with self.lock:
                if c[0] != self.cur_space:
                    self.prev_space = self.cur_space
                    self.cur_space = c[0]
                    log("desktop corrente: %d (prima %d)" % (self.cur_space, self.prev_space))

    def _tick(self):
        now = time.time()
        if now - self._last_sync > 5.0:
            self.sync_clients()
        if now - self._last_retry > 1.0:
            self._last_retry = now
            with self.lock:
                young = [i for i in self.clients.values()
                         if (i["kind"] == "other" or i["noise"]) and now - i["t"] < 30 and i["tries"] < 25]
            for i in young:
                new = self.describe(i["wid"])
                if new is None:
                    continue
                new["tries"] = i["tries"] + 1
                new["t"] = i["t"]
                with self.lock:
                    self.clients[i["wid"]] = new
                changed = (new["kind"] != i["kind"]) or (i["noise"] and not new["noise"])
                if changed:
                    log("client 0x%x rivalutato: kind=%s%s class=%s name=%r scope=%s"
                        % (i["wid"], new["kind"], " (rumore)" if new["noise"] else "", new["class"],
                           new["name"], new["scope"]))
                if changed and new["kind"] != "other":
                    self._apply(new, False)

    def run(self):
        self.root.change_attributes(event_mask=X.PropertyChangeMask)
        self.de.sync()
        self._read_current_desktop()
        self.sync_clients(initial=True)
        log("pronto: spazio corrente %d, client noti %d" % (self.cur_space, len(self.clients)))
        while True:
            select.select([self.de.fileno()], [], [], 1.0)
            while self.de.pending_events():
                ev = self.de.next_event()
                if ev.type == X.PropertyNotify and ev.window.id == self.root.id:
                    try:
                        an = self.de.get_atom_name(ev.atom)
                    except Exception:
                        continue
                    if an == "_NET_CLIENT_LIST":
                        self.sync_clients()
                    elif an == "_NET_CURRENT_DESKTOP":
                        self._read_current_desktop()
            self._tick()


# --------------------------------------------------------------------------- socket di controllo
class ControlServer(threading.Thread):
    def __init__(self, mgr):
        threading.Thread.__init__(self, daemon=True)
        self.mgr = mgr
        self.path = socket_path()

    def run(self):
        try:
            if os.path.exists(self.path):
                probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                probe.settimeout(0.3)
                try:
                    probe.connect(self.path)
                    log("socket gia' in uso da un altro processo (%s): controllo non avviato" % self.path)
                    return
                except OSError:
                    os.unlink(self.path)
                finally:
                    probe.close()
            s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            s.bind(self.path)
            os.chmod(self.path, 0o600)
            s.listen(4)
        except Exception as e:
            log("socket di controllo non avviato: %s" % e)
            return
        atexit.register(lambda: os.path.exists(self.path) and os.unlink(self.path))
        log("socket di controllo: %s" % self.path)
        while True:
            try:
                conn, _ = s.accept()
            except OSError:
                return
            threading.Thread(target=self._handle, args=(conn,), daemon=True).start()

    def _handle(self, conn):
        try:
            conn.settimeout(2.0)
            data = b""
            while b"\n" not in data and len(data) < 4096:
                chunk = conn.recv(1024)
                if not chunk:
                    break
                data += chunk
            try:
                req = json.loads(data.decode("utf-8", "replace").strip() or "{}")
            except ValueError:
                req = {}
            conn.sendall((json.dumps(self.mgr.command(req)) + "\n").encode("utf-8"))
        except Exception as e:
            log("errore nel gestore del socket: %s" % e)
        finally:
            conn.close()


# --------------------------------------------------------------------------- controller (evdev)
def list_pads():
    """Controller riconosciuti dal kernel (hanno un handler jsN): [(nome, /dev/input/eventN)]."""
    pads = []
    try:
        blocks = open("/proc/bus/input/devices").read().strip().split("\n\n")
    except Exception:
        blocks = []
    for b in blocks:
        name = re.search(r'N: Name="(.*)"', b)
        hand = re.search(r"H: Handlers=(.*)", b)
        if not hand:
            continue
        toks = hand.group(1).split()
        if any(re.fullmatch(r"js\d+", t) for t in toks):
            ev = [t for t in toks if re.fullmatch(r"event\d+", t)]
            if ev:
                pads.append((name.group(1) if name else "?", "/dev/input/" + ev[0]))
    test = os.environ.get("XL_SPACES_TEST_PAD")
    if test:
        pads.append(("test-pad", test))
    return pads


class PadListener(threading.Thread):
    def __init__(self, mgr):
        threading.Thread.__init__(self, daemon=True)
        self.mgr = mgr
        self.fds = {}                       # fd -> (nome, percorso)
        self.sel = self.l1 = self.r1 = False
        self.hat = 0
        self.wake_latched = False
        self.last_hotkey = 0.0

    def _reset(self):
        self.sel = self.l1 = self.r1 = False
        self.hat = 0
        self.wake_latched = False

    def _rescan(self):
        pads = list_pads()
        paths = {p for _, p in pads}
        for fd, (n, p) in list(self.fds.items()):
            if p not in paths:
                log("controller scollegato: %s" % n)
                self._close(fd)
        have = {p for _, p in self.fds.values()}
        for n, p in pads:
            if p in have:
                continue
            try:
                fd = os.open(p, os.O_RDONLY | os.O_NONBLOCK)
            except OSError as e:
                log("controller %s (%s): impossibile aprire il device: %s" % (n, p, e))
                continue
            self.fds[fd] = (n, p)
            log("controller collegato: %s (%s)" % (n, p))

    def _close(self, fd):
        try:
            os.close(fd)
        except OSError:
            pass
        self.fds.pop(fd, None)
        self._reset()

    def _hotkey(self, action):
        now = time.time()
        if now - self.last_hotkey < HOTKEY_DEBOUNCE_S:
            return
        self.last_hotkey = now
        action()

    def _dpad(self, direction):
        if self.sel:
            self._hotkey(lambda: self.mgr.cycle(direction))

    def _event(self, t, code, value):
        if t == EV_KEY:
            if code == BTN_SELECT:
                self.sel = bool(value)
            elif code == BTN_TL:
                self.l1 = bool(value)
            elif code == BTN_TR:
                self.r1 = bool(value)
            elif code in (BTN_DPAD_LEFT, BTN_DPAD_RIGHT) and value == 1:
                self._dpad(-1 if code == BTN_DPAD_LEFT else 1)
            if self.sel and self.l1 and self.r1 and not self.wake_latched:
                self.wake_latched = True
                self._hotkey(self.mgr.go_dashboard)
            if not (self.l1 and self.r1):
                self.wake_latched = False
        elif t == EV_ABS and code == ABS_HAT0X:
            if value != self.hat:
                self.hat = value
                if value in (-1, 1):
                    self._dpad(value)

    def run(self):
        last_scan = 0.0
        while True:
            now = time.time()
            if now - last_scan >= PAD_RESCAN_S:
                last_scan = now
                try:
                    self._rescan()
                except Exception as e:
                    log("riscansione controller fallita: %s" % e)
            if not self.fds:
                time.sleep(1.0)
                continue
            try:
                r, _, _ = select.select(list(self.fds), [], [], 0.5)
            except (OSError, ValueError):
                continue
            for fd in r:
                try:
                    data = os.read(fd, _EV_SIZE * 64)
                except BlockingIOError:
                    continue
                except OSError as e:
                    if e.errno in (errno.ENODEV, errno.EIO, errno.EBADF):
                        log("controller perso (%s): chiudo il device" % self.fds.get(fd, ("?",))[0])
                        self._close(fd)
                    continue
                if not data:
                    time.sleep(0.05)         # EOF (FIFO di test senza scrittore)
                    continue
                for i in range(0, len(data) - _EV_SIZE + 1, _EV_SIZE):
                    _, _, t, code, value = struct.unpack_from(_EV_FMT, data, i)
                    if t in (EV_KEY, EV_ABS):
                        self._event(t, code, value)


# --------------------------------------------------------------------------- entry point
def run_forever():
    if not HAVE_XLIB:
        log("python-xlib non disponibile (%s): gestore degli spazi non avviato" % XLIB_ERR)
        while True:
            time.sleep(3600)
    mgr = SpacesManager()
    ControlServer(mgr).start()
    PadListener(mgr).start()
    mgr.run()


def ctl(args):
    if not args:
        print("uso: spaces.py ctl state|next|prev|dashboard|switch N|clients", file=sys.stderr)
        return 2
    req = {"cmd": args[0]}
    if args[0] == "switch":
        if len(args) < 2:
            print("uso: spaces.py ctl switch N", file=sys.stderr)
            return 2
        req["space"] = args[1]
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(3.0)
    try:
        s.connect(socket_path())
        s.sendall((json.dumps(req) + "\n").encode("utf-8"))
        data = b""
        while b"\n" not in data:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
    except OSError as e:
        print("gestore degli spazi non raggiungibile (%s): %s" % (socket_path(), e), file=sys.stderr)
        return 1
    finally:
        s.close()
    text = data.decode("utf-8", "replace").strip()
    print(text)
    try:
        return 0 if json.loads(text).get("ok") else 1
    except ValueError:
        return 1


def main(argv):
    if len(argv) > 1 and argv[1] == "ctl":
        return ctl(argv[2:])
    if len(argv) > 1 and argv[1] not in ("daemon",):
        print("uso: spaces.py daemon | ctl <comando>", file=sys.stderr)
        return 2
    try:
        run_forever()
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
