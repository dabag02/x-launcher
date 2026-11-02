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
    CLI:  python spaces.py ctl state|next|prev|dashboard|switch N|clients|freeze [on|off|status]|thaw [scope]|overlay [open|close|status|on|off|key K]

Uso:
    - dentro tray.py (modalita' shell): spaces.run_forever()
    - autonomo (debug):  python spaces.py daemon

  * CONGELAMENTO (dev.3). I giochi che non stanno nello spazio corrente vengono
    congelati con il freezer dei cgroup (`systemctl --user freeze <scope>`): non
    ricevono input dal controller e non consumano CPU. Tornando allo spazio del
    gioco, questo viene scongelato PRIMA di cambiare desktop. Non congelabili:
    giochi Steam via URI (nessuno scope) e il quarto gioco (nessuno slot). All'uscita
    (anche SIGTERM) e all'avvio i giochi restati congelati vengono scongelati.
        X_LAUNCHER_SPACES_FREEZE=0            disattiva il congelamento
        ~/.config/x-launcher/spaces-nofreeze.conf   scope/prefissi da NON congelare
        spaces.py ctl freeze [on|off|status]  controllo a runtime

  * OVERLAY (dev.1 del ciclo 2.7.2). Con X_LAUNCHER_SPACES_OVERLAY=1 (kiosk-launch.sh
    --spaces-overlay) Select + D-pad destra/sinistra non cambia piu' spazio direttamente:
    apre l'overlay a schermo intero di overlay.py (spazi aperti + servizi). Vedi li' i
    comandi. Se overlay.py manca, non parte o non si mostra entro 1,5 s si torna al
    cambio diretto; Select + L1 + R1 (Dashboard) funziona sempre. Controllo a runtime:
    `spaces.py ctl overlay open|close|status|on|off|key <left|right|up|down|a|b>`.

Variabili di test (non servono in produzione):
    XL_SPACES_GRACE_S / XL_SPACES_LAUNCH_GRACE_S / XL_SPACES_LAUNCH_WINDOW_S
    XL_SPACES_TEST_SCOPES=file  righe "pid scope" che sostituiscono la lettura
                                di /proc/<pid>/cgroup
    XL_SPACES_TEST_PAD=percorso file/FIFO letto come un device evdev in piu'

Dipendenza: python-xlib (gia' nel venv del tray).
"""
import atexit
import errno
import fcntl
import json
import os
import re
import select
import socket
import signal
import struct
import subprocess
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
FREEZE_DELAY_S = float(os.environ.get("XL_SPACES_FREEZE_DELAY_S", "0.4"))
THAW_SETTLE_S = float(os.environ.get("XL_SPACES_THAW_SETTLE_S", "0.25"))
NOFREEZE_FILE = os.path.join(os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config"),
                             "x-launcher", "spaces-nofreeze.conf")
SYSTEMCTL = os.environ.get("XL_SPACES_SYSTEMCTL", "systemctl")
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
ABS_X, ABS_Y, ABS_HAT0Y = 0, 1, 17
BTN_SOUTH, BTN_EAST = 304, 305
BTN_DPAD_UP, BTN_DPAD_DOWN = 544, 545
EVIOCGRAB = 0x40044590
STICK_ON, STICK_OFF = 0.6, 0.35
STICK_REPEAT_DELAY_S, STICK_REPEAT_S = 0.40, 0.14
GRAB_RELEASE_MAX_S = 1.0
# v2.7.2-dev.3 — pause between choosing a space in the overlay and handing the game the
# pad again (thaw + pad ungrab): a game thawed at once could read the very button press
# that closed the overlay. 0 disables it; override with X_LAUNCHER_OVERLAY_THAW_DELAY_S.
try:
    OVERLAY_THAW_DELAY_S = max(0.0, min(5.0, float(os.environ.get("X_LAUNCHER_OVERLAY_THAW_DELAY_S", "0.6"))))
except ValueError:
    OVERLAY_THAW_DELAY_S = 0.6
_EV_FMT = "llHHi"
_EV_SIZE = struct.calcsize(_EV_FMT)


def log(*a):
    # timestamp con millisecondi: serve a correlare le righe con [SPACES-DIAG] di daemon.log
    t = time.time()
    print("[spaces] %s.%03d" % (time.strftime("%H:%M:%S", time.localtime(t)), int((t % 1) * 1000)), *a, flush=True)


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


def covers_dir():
    return os.environ.get("X_LAUNCHER_COVERS_DIR") or os.path.join(
        os.path.expanduser("~"), ".local", "share", "x-launcher", "covers")


def game_db_title(scope):
    """Game title written by the backend (coverCache.ts) in <covers>/<id>.json, or None.
    Preferred over the X window name: RetroArch & co. use generic/dynamic window titles."""
    m = re.match(r"^xlauncher-game-(.+)-(\d+)(?:\.scope)?$", scope or "")
    if not m:
        return None
    try:
        with open(os.path.join(covers_dir(), "%s.json" % m.group(1)), "r", encoding="utf-8") as fh:
            t = json.load(fh).get("title")
        return t.strip() if isinstance(t, str) and t.strip() else None
    except Exception:
        return None


def game_cover_files(scope):
    """(cover, hero) paths of the cached artwork for a game scope, None where missing.
    Scope = xlauncher-game-<sanitized game id>-<launch timestamp>[.scope]; the backend
    (src/backend/coverCache.ts) stores <covers>/<sanitized id>.cover|.hero."""
    m = re.match(r"^xlauncher-game-(.+)-(\d+)(?:\.scope)?$", scope or "")
    if not m:
        return None, None
    key = m.group(1)
    base = covers_dir()
    out = []
    for kind in ("cover", "hero"):
        p = os.path.join(base, "%s.%s" % (key, kind))
        out.append(p if os.path.isfile(p) else None)
    return out[0], out[1]


def overlay_enabled_from_env():
    return os.environ.get("X_LAUNCHER_SPACES_OVERLAY", "0").strip().lower() in ("1", "true", "on", "yes")


# --------------------------------------------------------------------------- congelamento
def freeze_enabled_from_env():
    return os.environ.get("X_LAUNCHER_SPACES_FREEZE", "1").strip().lower() not in ("0", "false", "off", "no")


def read_nofreeze():
    """Scope (o prefissi) da non congelare: una riga ciascuno, # per i commenti."""
    out = []
    try:
        for line in open(NOFREEZE_FILE):
            line = line.split("#", 1)[0].strip()
            if line:
                out.append(line)
    except OSError:
        pass
    return out


class Freezer:
    """Congela/scongela gli scope dei giochi con il freezer dei cgroup (systemctl --user).
    Le operazioni sono serializzate; il congelamento e' ritardato e rivalutato al
    momento dell'esecuzione (should_freeze), cosi' un andirivieni rapido tra spazi non
    congela mai il gioco dello spazio corrente."""

    def __init__(self, enabled, should_freeze):
        self.enabled = enabled
        self.should_freeze = should_freeze
        self.frozen = set()
        self.state_lock = threading.Lock()
        self.op_lock = threading.Lock()
        self.errors = 0

    @staticmethod
    def freezable(scope):
        return bool(scope) and scope.startswith("xlauncher-game-")

    def excluded(self, scope):
        for pat in read_nofreeze():
            if scope == pat or scope.startswith(pat):
                return True
        return False

    def _systemctl(self, verb, scope):
        try:
            r = subprocess.run([SYSTEMCTL, "--user", verb, scope + ".scope"], capture_output=True,
                               text=True, timeout=10)
        except Exception as e:  # noqa
            log("freezer: %s %s fallito: %s" % (verb, scope, e))
            self.errors += 1
            return False
        if r.returncode != 0:
            log("freezer: %s %s -> codice %d %s" % (verb, scope, r.returncode, (r.stderr or "").strip()[:200]))
            self.errors += 1
            return False
        return True

    def thaw_sync(self, scope):
        """Scongela subito (se era congelato). True se ha scongelato qualcosa."""
        # il lock delle operazioni PRIMA del controllo: un congelamento ancora in corso
        # (freeze_now dell'overlay) deve finire, cosi' poi viene scongelato davvero
        with self.op_lock:
            with self.state_lock:
                was = scope in self.frozen
            if not was:
                return False
            ok = self._systemctl("thaw", scope)
            with self.state_lock:
                self.frozen.discard(scope)       # anche in caso di errore: non si riprova all'infinito
        log("freezer: %s scongelato%s" % (scope, "" if ok else " (con errori)"))
        return True

    def release(self, scope):
        """Il gioco e' uscito dall'indice: dimentica (e scongela per sicurezza) lo scope."""
        with self.state_lock:
            was = scope in self.frozen
            self.frozen.discard(scope)
        if was:
            with self.op_lock:
                self._systemctl("thaw", scope)

    def freeze_now(self, scope, still_wanted=None):
        """Congela subito (overlay aperto sul gioco corrente). still_wanted: callback che
        rimanda False se nel frattempo l'overlay e' stato chiuso."""
        if not self.enabled or not self.freezable(scope) or self.excluded(scope):
            return False
        with self.op_lock:
            with self.state_lock:
                if scope in self.frozen:
                    return True
            if still_wanted is not None and not still_wanted():
                return False
            if self._systemctl("freeze", scope):
                with self.state_lock:
                    self.frozen.add(scope)
                log("freezer: %s congelato (overlay)" % scope)
                return True
        return False

    def schedule_freeze(self, scope):
        if not self.enabled or not self.freezable(scope) or self.excluded(scope):
            return
        with self.state_lock:
            if scope in self.frozen:
                return
        t = threading.Timer(FREEZE_DELAY_S, self._freeze_now, args=(scope,))
        t.daemon = True
        t.start()

    def _freeze_now(self, scope):
        if not self.enabled:
            return
        with self.op_lock:
            with self.state_lock:
                if scope in self.frozen:
                    return
            if not self.should_freeze(scope):      # nel frattempo l'utente e' tornato qui
                return
            if self._systemctl("freeze", scope):
                with self.state_lock:
                    self.frozen.add(scope)
                log("freezer: %s congelato" % scope)

    def thaw_all(self):
        with self.state_lock:
            todo = list(self.frozen)
        for sc in todo:
            with self.op_lock:
                self._systemctl("thaw", sc)
            with self.state_lock:
                self.frozen.discard(sc)
        if todo:
            log("freezer: scongelati %d scope" % len(todo))

    def thaw_leftovers(self):
        """All'avvio: scongela gli scope dei giochi rimasti congelati da una sessione precedente."""
        try:
            r = subprocess.run([SYSTEMCTL, "--user", "list-units", "--all", "--no-legend", "--plain",
                                "xlauncher-game-*.scope"], capture_output=True, text=True, timeout=10)
        except Exception as e:  # noqa
            log("freezer: list-units fallito: %s" % e)
            return
        for line in (r.stdout or "").splitlines():
            parts = line.split()
            if not parts or not parts[0].endswith(".scope"):
                continue
            scope = parts[0][:-len(".scope")]
            try:
                g = subprocess.run([SYSTEMCTL, "--user", "show", "-p", "FreezerState", "--value",
                                    scope + ".scope"], capture_output=True, text=True, timeout=10)
            except Exception:
                continue
            if g.stdout.strip() in ("frozen", "freezing"):
                log("freezer: %s era rimasto congelato: scongelo" % scope)
                self._systemctl("thaw", scope)

    def set_enabled(self, on):
        self.enabled = bool(on)
        if not on:
            self.thaw_all()

    def snapshot(self):
        with self.state_lock:
            return {"enabled": self.enabled, "frozen": sorted(self.frozen), "errors": self.errors,
                    "excluded": read_nofreeze()}


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
        self.target_space = 0                # spazio verso cui si sta andando (decide i congelamenti)
        self.freezer = Freezer(freeze_enabled_from_env(), self._should_freeze)
        self.overlay = None                  # overlay.SpacesOverlay (dev.1 del ciclo 2.7.2), se attivo
        self.overlay_on = overlay_enabled_from_env()
        self.overlay_thaw_delay = OVERLAY_THAW_DELAY_S   # s between choosing a space and thawing/ungrabbing
        self.pad_listener = None
        self.bt_pad_in_use = bt_pad_in_use
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
        self.freezer.release(scope)          # fuori dal lock: evita lo stallo con _freeze_now
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

    def switch_space(self, space, activate=None, reason="richiesta", thaw_delay=0.0):
        with self.lock:
            valid = space == 0 or space in self.slots
        if not valid:
            log("switch %s ignorato: spazio non occupato" % space)
            return False
        target = activate or self.space_window(space)
        with self.lock:
            self.target_space = space
            scope_to = self.slots.get(space)
        # scongela il gioco di destinazione PRIMA di mostrarlo
        if scope_to and not thaw_delay and self.freezer.thaw_sync(scope_to):
            time.sleep(THAW_SETTLE_S)
        self.xa.switch_desktop(space)
        if target:
            self.xa.activate(target)
        log("-> spazio %d (%s)%s" % (space, reason, " finestra 0x%x" % target if target else ""))
        self._freeze_others(space)
        return True

    def _should_freeze(self, scope):
        with self.lock:
            return scope in self.scope_slot and scope != self.slots.get(self.target_space)

    def _freeze_others(self, space):
        with self.lock:
            others = [sc for sl, sc in self.slots.items() if sl != space]
        for sc in others:
            self.freezer.schedule_freeze(sc)

    def _align_freeze(self, space):
        """Il desktop e' cambiato per cause esterne (scorciatoie del WM...): riallinea i congelamenti."""
        with self.lock:
            if space == self.target_space:
                return
            self.target_space = space
            scope_to = self.slots.get(space)
        if scope_to:
            self.freezer.thaw_sync(scope_to)
        self._freeze_others(space)

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
        if self.overlay_is_open():
            self.overlay.confirm_space(0)       # chiude l'overlay passando per la Dashboard
            return True
        return self.switch_space(0, reason="dashboard")

    # ----- overlay (dev.1 del ciclo 2.7.2)
    def init_overlay(self, force=False):
        if not (self.overlay_on or force):
            return
        try:
            import overlay as _ov
            self.overlay = _ov.SpacesOverlay(self, log)
            log("overlay: %s" % ("ready" if self.overlay.available else "NOT available -> direct switching stays"))
        except Exception as e:  # noqa
            self.overlay = None
            log("overlay: module not loadable (%r) -> direct switching stays" % (e,))

    def overlay_is_open(self):
        return bool(self.overlay and self.overlay.is_open())

    def overlay_enabled(self):
        return bool(self.overlay_on and self.overlay and self.overlay.available)

    def overlay_status(self):
        base = {"enabled": self.overlay_on, "loaded": self.overlay is not None}
        if self.overlay:
            base.update(self.overlay.status())
        return base

    def overlay_open(self, direction=1):
        if not self.overlay_enabled():
            return False
        try:
            return bool(self.overlay.open(direction))
        except Exception as e:  # noqa
            log("overlay: open failed (%r)" % (e,))
            return False

    def overlay_or_cycle(self, direction):
        """Select + D-pad: apre l'overlay, oppure (disattivato o non riuscito) cambia spazio diretto."""
        if self.overlay_enabled() and self.overlay_open(direction):
            return True
        return self.cycle(direction)

    def overlay_key(self, action):
        return bool(self.overlay and self.overlay.handle(action))

    def overlay_entries(self):
        out = []
        for sp in self.state()["spaces"]:
            if sp["kind"] == "dashboard":
                out.append({"space": 0, "title": "X-Launcher", "kind": "dashboard"})
            else:
                cover, hero = game_cover_files(sp.get("scope"))
                out.append({"space": sp["space"], "kind": "game",
                            "title": game_db_title(sp.get("scope")) or sp.get("title") or ("Game %d" % sp["space"]),
                            "cover": cover, "hero": hero})
        return out

    def overlay_current_space(self):
        with self.lock:
            return self.target_space

    def overlay_opened(self):
        """Overlay appena mostrato: congela il gioco corrente e prende il pad in esclusiva."""
        with self.lock:
            scope = self.slots.get(self.target_space)
        if scope:
            threading.Thread(target=self.freezer.freeze_now, args=(scope, self.overlay_is_open), daemon=True).start()
        if self.pad_listener:
            self.pad_listener.overlay_grab(True)

    def overlay_cancelled(self):
        """Overlay chiuso senza cambiare spazio: il gioco corrente riprende."""
        with self.lock:
            scope = self.slots.get(self.target_space)
        if scope:
            self.freezer.thaw_sync(scope)

    def overlay_scope_of(self, space):
        with self.lock:
            return self.slots.get(space)

    def overlay_closed(self):
        if self.pad_listener:
            self.pad_listener.overlay_grab(False)

    def overlay_release_later(self, scope, delay):
        """After `delay` seconds: thaw the game now in front (if it is still the target and the
        overlay was not reopened) and only then give the pad back, so the game never sees
        the button press used inside the overlay."""
        def work():
            time.sleep(delay)
            if self.overlay_is_open():
                return                      # reopened meanwhile: it owns freeze and grab again
            if scope:
                with self.lock:
                    wanted = self.slots.get(self.target_space) == scope
                if wanted:
                    self.freezer.thaw_sync(scope)
            self.overlay_closed()
        threading.Thread(target=work, name="overlay-release", daemon=True).start()

    def state(self):
        with self.lock:
            spaces = [{"space": 0, "kind": "dashboard", "window": self.dashboard_wid}]
            for s in sorted(self.slots):
                scope = self.slots[s]
                spaces.append({"space": s, "kind": "game", "scope": scope,
                               "window": self.space_window(s),
                               "title": next((self.clients[w]["name"] for w in self.scope_wins.get(scope, [])
                                              if w in self.clients), "")})
            return {"ok": True, "current": self.cur_space, "previous": self.prev_space, "spaces": spaces,
                    "freeze": self.freezer.snapshot(), "overlay": self.overlay_status()}

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
        if cmd in ("next", "prev", "dashboard", "switch") and self.overlay_is_open():
            self.overlay.abort()                 # il cambio diretto scongela la destinazione
        if cmd == "overlay":
            mode = str(req.get("mode") or "status").lower()
            if mode == "on":
                self.overlay_on = True
                if self.overlay is None:
                    self.init_overlay(force=True)
            elif mode == "off":
                if self.overlay_is_open():
                    self.overlay.cancel()
                self.overlay_on = False
            elif mode == "open":
                if not self.overlay_open(+1):
                    return {"ok": False, "error": "overlay non disponibile", "overlay": self.overlay_status()}
            elif mode == "close":
                if self.overlay_is_open():
                    self.overlay.cancel()
            elif mode == "key":
                if not self.overlay_key(str(req.get("key") or "")):
                    return {"ok": False, "error": "overlay chiuso o tasto sconosciuto", "overlay": self.overlay_status()}
            elif mode != "status":
                return {"ok": False, "error": "modo non valido"}
            return {"ok": True, "overlay": self.overlay_status()}
        if cmd == "thaw":
            sc = req.get("scope")
            if sc:
                self.freezer.thaw_sync(str(sc))
            else:
                self.freezer.thaw_all()
            return {"ok": True, "freeze": self.freezer.snapshot()}
        if cmd == "freeze":
            mode = str(req.get("mode") or "status").lower()
            if mode in ("on", "off"):
                self.freezer.set_enabled(mode == "on")
                if mode == "on":
                    with self.lock:
                        sp = self.target_space
                    self._freeze_others(sp)
                log("congelamento %s (ctl)" % ("ATTIVATO" if mode == "on" else "DISATTIVATO"))
            elif mode != "status":
                return {"ok": False, "error": "modo non valido (on|off|status)"}
            return {"ok": True, "freeze": self.freezer.snapshot()}
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
                changed = c[0] != self.cur_space
                if changed:
                    self.prev_space = self.cur_space
                    self.cur_space = c[0]
                    log("desktop corrente: %d (prima %d)" % (self.cur_space, self.prev_space))
            if changed:
                self._align_freeze(c[0])

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
            threading.Thread(target=self._serve_conn, args=(conn,), daemon=True).start()

    def _serve_conn(self, conn):
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


def bt_pad_in_use():
    """True se un controller collegato e' Bluetooth (Bus=0005): spegnere il Bluetooth lo scollegherebbe."""
    try:
        blocks = open("/proc/bus/input/devices").read().strip().split("\n\n")
    except Exception:
        return False
    for b in blocks:
        if re.search(r"^I: Bus=0005", b, re.M) and re.search(r"H: Handlers=.*\bjs\d+", b):
            return True
    return False


class PadListener(threading.Thread):
    def __init__(self, mgr):
        threading.Thread.__init__(self, daemon=True)
        self.mgr = mgr
        self.fds = {}                       # fd -> (nome, percorso)
        self.sel = self.l1 = self.r1 = False
        self.hat = 0
        self.wake_latched = False
        self.last_hotkey = 0.0
        # overlay (dev.1 del ciclo 2.7.2)
        self.pressed = set()                # tasti premuti (per rilasciare il pad senza tasti "incollati")
        self.grab_wanted = False
        self.grabbed = False
        self.grab_failed = False
        self.release_since = None
        self.absrange = {}                  # (fd, codice) -> (min, max)
        self.stick = {ABS_X: 0, ABS_Y: 0}
        self.rep_action = None
        self.rep_axis = None
        self.rep_next = 0.0
        self.ov_logged = 0
        self._ioctl = fcntl.ioctl           # sostituibile nei test

    def _reset(self):
        self.sel = self.l1 = self.r1 = False
        self.hat = 0
        self.wake_latched = False
        self.pressed.clear()
        self.stick = {ABS_X: 0, ABS_Y: 0}
        self.rep_action = None

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
        if not self.fds:
            self.grabbed = False
        self._reset()

    def _hotkey(self, action):
        now = time.time()
        if now - self.last_hotkey < HOTKEY_DEBOUNCE_S:
            return
        self.last_hotkey = now
        action()

    def _dpad(self, direction):
        if self.mgr.overlay_is_open():
            self.mgr.overlay_key("right" if direction > 0 else "left")
        elif self.sel:
            self._hotkey(lambda: self.mgr.overlay_or_cycle(direction))

    # ----- overlay: tasti, levetta, presa esclusiva
    def _range(self, fd, code):
        r = self.absrange.get((fd, code))
        if r is None:
            try:
                buf = self._ioctl(fd, (2 << 30) | (24 << 16) | (0x45 << 8) | (0x40 + code), b"\0" * 24)
                _, lo, hi, _, _, _ = struct.unpack("6i", buf)
                r = (lo, hi) if hi > lo else (-32768, 32767)
            except Exception:
                r = (-32768, 32767)
            self.absrange[(fd, code)] = r
        return r

    def _overlay_extra(self, t, code, value, fd):
        """Azioni dell'overlay diverse da sinistra/destra del D-pad (gia' gestite da _dpad)."""
        if t == EV_KEY:
            if self.ov_logged < 80 and value in (0, 1):
                self.ov_logged += 1
                log("overlay: pad key code=%d value=%d" % (code, value))
            if code == BTN_SOUTH:
                self.mgr.overlay_key("a" if value == 1 else "a_up")
            elif code == BTN_EAST and value == 1:
                self.mgr.overlay_key("b")
            elif code == BTN_DPAD_UP and value == 1:
                self.mgr.overlay_key("up")
            elif code == BTN_DPAD_DOWN and value == 1:
                self.mgr.overlay_key("down")
        elif t == EV_ABS:
            if code == ABS_HAT0Y and value != 0:
                self.mgr.overlay_key("up" if value < 0 else "down")
            elif code in (ABS_X, ABS_Y):
                lo, hi = self._range(fd, code)
                mid, half = (lo + hi) / 2.0, max(1.0, (hi - lo) / 2.0)
                n = (value - mid) / half
                cur = self.stick[code]
                d = 1 if (n > STICK_ON or (cur == 1 and n > STICK_OFF)) else (-1 if (n < -STICK_ON or (cur == -1 and n < -STICK_OFF)) else 0)
                if d != cur:
                    self.stick[code] = d
                    if d:
                        act = ("right" if d > 0 else "left") if code == ABS_X else ("down" if d > 0 else "up")
                        self.mgr.overlay_key(act)
                        self.rep_action, self.rep_axis = act, code
                        self.rep_next = time.time() + STICK_REPEAT_DELAY_S
                    elif self.rep_axis == code:
                        self.rep_action = None

    def _repeat_tick(self):
        if self.rep_action:
            if not self.mgr.overlay_is_open():
                self.rep_action = None
            elif time.time() >= self.rep_next:
                self.mgr.overlay_key(self.rep_action)
                self.rep_next = time.time() + STICK_REPEAT_S

    def overlay_grab(self, on):
        """Chiamato da spaces.py all'apertura (on=True) e alla chiusura dell'overlay."""
        if os.environ.get("X_LAUNCHER_OVERLAY_GRAB", "1").strip() == "0":
            return
        if on:
            self.grab_wanted, self.release_since = True, None
            self.grab_failed = False        # one attempt per opening (no retry loop on errors)
        else:
            self.grab_wanted, self.release_since = False, time.time()
        self._grab_tick()

    def _all_up(self):
        return not self.pressed and self.hat == 0

    def _do_grab(self, on):
        failed = None
        for fd in list(self.fds):
            try:
                self._ioctl(fd, EVIOCGRAB, 1 if on else 0)
            except OSError as e:
                failed = e
        self.grabbed = bool(on and self.fds and failed is None)
        if on and failed is not None:
            self.grab_failed = True
        log("overlay: pad %s%s" % ("grabbed" if on else "released", (" (failed: %s)" % failed) if failed else ""))

    def _grab_tick(self):
        # presa solo a tasti tutti rilasciati: il gioco ha visto pressioni E rilasci (niente tasto
        # "incollato"); rilascio solo a tasti rilasciati (o dopo GRAB_RELEASE_MAX_S)
        if self.grab_wanted and not self.grabbed and not self.grab_failed and self.fds and self._all_up():
            self._do_grab(True)
        elif not self.grab_wanted and self.release_since is not None:
            if not self.grabbed:
                self.release_since = None
            elif self._all_up() or time.time() - self.release_since > GRAB_RELEASE_MAX_S:
                self._do_grab(False)
                self.release_since = None

    def _event(self, t, code, value, fd=None):
        if t == EV_KEY:
            if value == 1:
                self.pressed.add(code)
            elif value == 0:
                self.pressed.discard(code)
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
        if self.mgr.overlay_is_open():
            self._overlay_extra(t, code, value, fd)
        self._grab_tick()

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
            fast = bool(self.rep_action or self.release_since is not None or (self.grab_wanted and not self.grabbed))
            try:
                r, _, _ = select.select(list(self.fds), [], [], 0.05 if fast else 0.5)
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
                        try:
                            self._event(t, code, value, fd)
                        except Exception as e:  # noqa
                            log("errore nella gestione di un evento del pad: %r" % (e,))
            try:
                self._repeat_tick()
                self._grab_tick()
            except Exception as e:  # noqa
                log("errore nel ciclo del pad: %r" % (e,))


# --------------------------------------------------------------------------- entry point
def run_forever():
    if not HAVE_XLIB:
        log("python-xlib non disponibile (%s): gestore degli spazi non avviato" % XLIB_ERR)
        while True:
            time.sleep(3600)
    mgr = SpacesManager()
    log("congelamento dei giochi negli altri spazi: %s" % ("ATTIVO" if mgr.freezer.enabled else "disattivato"))
    log("overlay degli spazi (X_LAUNCHER_SPACES_OVERLAY): %s" % ("ATTIVO" if mgr.overlay_on else "disattivato"))
    mgr.init_overlay()

    def _cleanup():
        try:
            if mgr.overlay_is_open():
                mgr.overlay.abort()
            if mgr.pad_listener:
                mgr.pad_listener.overlay_grab(False)
                mgr.pad_listener._do_grab(False) if mgr.pad_listener.grabbed else None
        except Exception:
            pass
        mgr.freezer.thaw_all()
    atexit.register(_cleanup)

    def _bye(signum, _frame):
        _cleanup()
        sys.exit(0)
    for sg in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        try:
            signal.signal(sg, _bye)
        except Exception:  # noqa  (non nel thread principale)
            pass
    threading.Thread(target=mgr.freezer.thaw_leftovers, daemon=True).start()
    ControlServer(mgr).start()
    pad = PadListener(mgr)
    mgr.pad_listener = pad
    pad.start()
    mgr.run()


def ctl(args):
    if not args:
        print("uso: spaces.py ctl state|next|prev|dashboard|switch N|clients|freeze [on|off|status]|thaw [scope]|overlay [open|close|status|on|off|key K]", file=sys.stderr)
        return 2
    req = {"cmd": args[0]}
    if args[0] == "overlay":
        req["mode"] = args[1] if len(args) > 1 else "status"
        if req["mode"] == "key" and len(args) > 2:
            req["key"] = args[2]
    if args[0] == "thaw" and len(args) > 1:
        req["scope"] = args[1]
    if args[0] == "freeze":
        req["mode"] = args[1] if len(args) > 1 else "status"
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
