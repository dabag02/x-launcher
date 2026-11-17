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
    prende uno slot libero (max 2, v3.2.6-dev.1) = desktop 2-3 (indici 1-2). Alla
    comparsa della finestra di un gioco la sposta sul desktop del suo slot e ci passa.
    Alla chiusura (dopo una breve tolleranza) libera lo slot e torna allo spazio
    precedente (o alla Dashboard). Il terzo gioco non ha slot: resta dov'e'
    (la regola vera sul lancio in piu' e' ancora in sospeso).
    Lo spazio 3 (desktop 4) e' RISERVATO a Steam Big Picture (dentro gamescope, ciclo
    v3.2.6): non viene mai assegnato ai giochi.

  * STEAM (v3.2.6-dev.2). Il backend (src/backend/steamSession.ts) avvia
    `gamescope -e -- steam -gamepadui` nello scope xlauncher-steam-session-<ms>. La finestra di
    gamescope (classe gamescope/gamescope, _NET_WM_PID = gamescope) e' riconosciuta dallo scope
    (kind "steam"), spostata nello spazio 3 e congelata come un gioco quando non e' lo spazio
    corrente: Steam, Big Picture e il gioco Steam in corso (tutti dentro gamescope) si fermano
    insieme. Il titolo della finestra segue l'app in primo piano dentro gamescope.

  * DASHBOARD IN DUE SCOPE (v3.2.6-dev.1). kiosk-launch.sh avvia il browser nello
    scope xlauncher-dashboard-<ts>, ma Chromium (visto con la 156) puo' spostare il
    proprio processo principale in uno scope suo, app-org.chromium.Chromium-<pid>:
    nel nostro restano solo i processi figli (zygote, GPU, renderer). La Dashboard e'
    quindi un GRUPPO: lo scope del PID della finestra (se ha quella forma esatta) piu'
    lo scope xlauncher-dashboard-* dei suoi figli. Si congelano e scongelano insieme.

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
        Share (breve)           -> screenshot del gioco (v3.2.29-dev.5); durante una clip la ferma
        Share (tenuto 1 s)      -> avvia/ferma la clip del gioco (v3.2.29-dev.6)
    Codici verificati su hardware reale (Xbox Wireless Controller): BTN_SELECT
    (314), BTN_TL/BTN_TR (310/311), D-pad come ABS_HAT0X (-1/0/+1); supporta
    anche D-pad come BTN_DPAD_LEFT/RIGHT (546/547). Riconosce il pad per nome,
    rileva il collegamento e lo scollegamento (riscansione ogni 3 s).

  * CANALE LOCALE. Socket Unix (stesso percorso calcolato dal backend):
        /run/user/<uid>/x-launcher-spaces.sock  (altrimenti ~/.cache/x-launcher/spaces.sock,
        in una cartella 0700: mai piu' un percorso prevedibile in /tmp)
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

  * MANTIENI MASSIMIZZATO (v3.2.29-dev.2). Un gioco lanciato con `--keep-maximized` negli argomenti
    (il demone lo annota in ~/.local/share/x-launcher/window-rules.json) che si riduce a icona mentre il
    suo spazio e' quello corrente viene riattivato dopo KEEP_MAX_DELAY_S, come fa il cambio di spazio
    dall'overlay; al massimo 3 volte in 10 s, poi pausa di 60 s.

  * CLIP (v3.2.29-dev.6). Share tenuto premuto (o Rec nell'overlay): gpu-screen-recorder della sola finestra
    del gioco, H.264 60 fps + audio di sistema, in /tmp/x-launcher-<uid>/clips (0700, tmpfs: cancellate allo
    spegnimento), al massimo 3 (prune_clips). Classe Recorder + SpacesManager._rec_sync(): avvio solo a spazio
    davanti, fermo, senza overlay e scongelato; pausa/ripresa con SIGUSR2 quando cambiano queste condizioni;
    arresto con Share, Rec, CLIP_MAX_S (120 s effettivi), chiusura del gioco o uscita di spaces.py. A clip
    chiusa: .json accanto all'MP4, POST /api/media/clip al demone, «Registrazione conclusa».

  * SCREENSHOT (v3.2.29-dev.3; tasto Share da dev.5). Share premuto brevemente negli spazi dei giochi
    (1..NUM_SLOTS; non la Dashboard, non Steam): cattura della sola finestra del gioco in PNG
    (gpu-screen-recorder, ripiego `import`) in /run/user/<uid>/x-launcher-media, poi POST
    /api/media/screenshot al demone (conversione in JPEG, archivio in
    ~/.local/share/x-launcher/multimedia/<gioco>/Screenshot, notifica). Share e' KEY_F12 dal device
    "Keyboard" del controller (xpadneo, stesso Uniq del pad) o KEY_RECORD dal pad (xpad); tenuto per
    X_LAUNCHER_SHARE_HOLD_S (1 s) avvia/ferma le clip (vedi CLIP). Select + D-pad su/giu' sono di nuovo liberi per
    i giochi. Dopo lo scatto, «Screenshot acquisito» con l'icona per 3 s in alto a destra (v3.2.29-dev.4,
    overlay.Osd: finestra override-redirect, mai il focus, nascosta prima di ogni scatto).

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
import urllib.parse
import urllib.request

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

NUM_SLOTS = 2                 # v3.2.6-dev.1 — giochi negli spazi 1-2 (prima 3)
STEAM_SPACE = 3               # v3.2.6-dev.1 — spazio (desktop 4) riservato a Steam Big Picture
# Tolleranza prima di liberare lo slot di un gioco rimasto senza finestre. Nei primi
# LAUNCH_WINDOW_S secondi dalla prima finestra del gioco la tolleranza e' piu' lunga
# (LAUNCH_GRACE_S): alcune applicazioni (es. RetroArch al caricamento del core)
# distruggono e ricreano la finestra durante l'avvio, anche dopo parecchi secondi.
RELEASE_GRACE_S = float(os.environ.get("XL_SPACES_GRACE_S", "3.0"))
LAUNCH_GRACE_S = float(os.environ.get("XL_SPACES_LAUNCH_GRACE_S", "20.0"))
LAUNCH_WINDOW_S = float(os.environ.get("XL_SPACES_LAUNCH_WINDOW_S", "45.0"))
FREEZE_DELAY_S = float(os.environ.get("XL_SPACES_FREEZE_DELAY_S", "0.4"))
THAW_SETTLE_S = float(os.environ.get("XL_SPACES_THAW_SETTLE_S", "0.25"))
# v3.2.29-dev.2 — `--keep-maximized` (window-rules.json, scritto dal demone a ogni lancio): una finestra di
# gioco ridotta a icona mentre il suo spazio e' quello corrente viene riattivata (stessa chiamata del cambio
# di spazio dall'overlay, che la riporta a schermo intero). Al massimo KEEP_MAX_RESTORES volte ogni
# KEEP_MAX_WINDOW_S secondi, poi pausa di KEEP_MAX_PAUSE_S: un gioco che continua a iconificarsi non entra
# in un ciclo infinito con il gestore.
KEEP_MAX_DELAY_S = float(os.environ.get("XL_SPACES_KEEP_MAX_DELAY_S", "0.5"))
KEEP_MAX_RESTORES = 3
KEEP_MAX_WINDOW_S = 10.0
KEEP_MAX_PAUSE_S = 60.0
# v3.2.29-dev.3 — screenshot (tasto Share da v3.2.29-dev.5, prima Select + D-pad su) degli spazi dei giochi 1..NUM_SLOTS (Steam ha i suoi):
# cattura della sola finestra del gioco in PNG nella cartella di appoggio (in RAM, privata), poi il demone
# la converte in JPEG, la archivia in ~/.local/share/x-launcher/multimedia/<gioco>/Screenshot e notifica.
SCREENSHOT_MIN_INTERVAL_S = 1.0
# v3.2.29-dev.5 — tasto Share del controller (al posto di Select + D-pad, che i giochi intercettano):
# xpadneo lo manda come KEY_F12 da un device "tastiera" a parte, stesso Uniq del pad (verificato
# sull'HTPC: "Xbox Wireless Controller Keyboard"); xpad (cavo) come KEY_RECORD dal pad stesso.
# Premuto e rilasciato prima di SHARE_HOLD_S = screenshot; tenuto SHARE_HOLD_S = clip (step 2b).
# v3.2.29-dev.6 — clip (Share tenuto premuto o pulsante Rec dell'overlay): solo la finestra del gioco, alla
# risoluzione corrente, H.264 NVENC + audio di sistema; al massimo CLIP_MAX_S secondi di registrazione
# effettiva (le pause non contano); temporanee in /tmp/x-launcher-<uid>/clips (tmpfs: sparisce allo
# spegnimento), al massimo CLIP_KEEP: la quarta cancella la piu' vecchia. Pausa (SIGUSR2, verificata
# sull'HTPC il 14/11/2026) quando lo spazio non e' piu' quello davanti o si apre l'overlay; ripresa
# allo scongelamento.
try:
    CLIP_MAX_S = max(5.0, min(600.0, float(os.environ.get("X_LAUNCHER_CLIP_MAX_S", "120"))))
except ValueError:
    CLIP_MAX_S = 120.0
CLIP_KEEP = 3
# v3.2.29-dev.9 — il pallino REC non resta a schermo per tutta la registrazione: una finestra sopra un gioco a
# schermo intero toglie al driver NVIDIA (X11, senza compositor) lo scambio diretto dei buffer e il gioco
# mostra tearing (verificato dall'utente: registrando da SSH senza sovrimpressione nessun artefatto).
# Regola dell'utente: 3 s all'avvio, poi 3 s ogni 30 s di registrazione, e «Registrazione conclusa» alla fine.
REC_OSD_SHOW_S = 3.0
REC_OSD_EVERY_S = 30.0
CLIP_STOP_TIMEOUT_S = 15.0
KEY_F12, KEY_RECORD = 88, 167
SHARE_KEYS = (KEY_F12, KEY_RECORD)
try:
    SHARE_HOLD_S = max(0.4, min(3.0, float(os.environ.get("X_LAUNCHER_SHARE_HOLD_S", "1.0"))))
except ValueError:
    SHARE_HOLD_S = 1.0
SCREENSHOT_TIMEOUT_S = 15
# v3.2.1-dev.1 — la Dashboard si congela piu' tardi dei giochi: la pagina deve fare in tempo a ricevere
# "gioco pronto" e a chiudere la splash prima di fermarsi.
try:
    DASHBOARD_FREEZE_DELAY_S = max(0.0, min(30.0, float(os.environ.get("XL_SPACES_DASHBOARD_FREEZE_DELAY_S", "2.0"))))
except ValueError:
    DASHBOARD_FREEZE_DELAY_S = 2.0
NOFREEZE_FILE = os.path.join(os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config"),
                             "x-launcher", "spaces-nofreeze.conf")
SYSTEMCTL = os.environ.get("XL_SPACES_SYSTEMCTL", "systemctl")
DASHBOARD_TITLE = "X-Launcher HTPC"
HOTKEY_DEBOUNCE_S = 0.25
PAD_RESCAN_S = 3.0

SCOPE_RX = re.compile(r"(xlauncher-(?:game|shared-launcher|dashboard|steam)-[^/]+?)\.scope")
# v3.2.6-dev.2 — sessione Steam in gamescope (src/backend/steamSession.ts)
STEAM_SCOPE_PREFIX = "xlauncher-steam-"
STEAM_APPID_ARG_RX = re.compile(r"^AppId=(\d{1,10})$")
# v3.2.6-dev.4 — Steam avviato in background a inizio sessione (X_LAUNCHER_STEAM_PRESTART=1): scope
# xlauncher-steam-prestart-<ms>. Nessun passaggio allo spazio 3 alla comparsa; congelato (fuori dallo
# spazio 3) appena il titolo dice che Big Picture e' pronta, o al piu' tardi dopo PRESTART_FREEZE_MAX_S.
STEAM_PRESTART_MARK = "-prestart-"
BIG_PICTURE_RX = re.compile(r"big picture", re.I)
PRESTART_FREEZE_MAX_S = 120.0
# v3.2.1-dev.1 — scope della Dashboard (kiosk-launch.sh avvia il browser in "xlauncher-dashboard-<ts>")
DASHBOARD_SCOPE_PREFIX = "xlauncher-dashboard-"
# v3.2.6-dev.1 — scope che Chromium crea da solo per il proprio processo principale (vedi docstring)
CHROMIUM_APP_SCOPE_RX = re.compile(r"(app-org\.chromium\.Chromium-\d{1,10})\.scope")
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
    # fallback: cartella privata dell'utente (prima era /tmp/x-launcher-spaces-<uid>.sock, un nome
    # prevedibile in una cartella scrivibile da tutti). Va tenuto identico a spacesClient.ts.
    return os.path.join(os.path.expanduser("~"), ".cache", "x-launcher", "spaces.sock")


_SCOPE_RE = re.compile(r"^xlauncher-[A-Za-z0-9_.@-]{1,200}$")
_CHROMIUM_APP_SCOPE_RE = re.compile(r"^app-org\.chromium\.Chromium-\d{1,10}$")
# v3.2.17-dev.11 — Steam col runtime steamrt64 (steam-launch-wrapper) mette il gioco (reaper + eseguibile) in
# uno scope systemd suo, app-steam-app<AppId>-<pid>.scope, fuori dalla sessione xlauncher-steam-session-*
# (verificato sull'HTPC con Limbo: app-steam-app48000-84728.scope; nella sessione restano solo i wrapper).
STEAM_APP_SCOPE_RX = re.compile(r"(app-steam-app(\d{1,10})-\d{1,10})\.scope")
_STEAM_APP_SCOPE_RE = re.compile(r"^app-steam-app\d{1,10}-\d{1,10}$")


def valid_scope(sc):
    """Nome di scope accettato dal freezer: 'xlauncher-...' (niente spazi, '/' o '--' iniziali) oppure,
    unica eccezione (v3.2.6-dev.1), lo scope del browser della Dashboard 'app-org.chromium.Chromium-<n>'."""
    return isinstance(sc, str) and (_SCOPE_RE.fullmatch(sc) is not None
                                    or _CHROMIUM_APP_SCOPE_RE.fullmatch(sc) is not None
                                    or _STEAM_APP_SCOPE_RE.fullmatch(sc) is not None)   # v3.2.17-dev.11


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


def _cgroup_text(pid):
    """Contenuto di /proc/<pid>/cgroup (o, nei test, la riga 'pid scope' di XL_SPACES_TEST_SCOPES
    trasformata in un percorso finto '<scope>.scope')."""
    tf = os.environ.get("XL_SPACES_TEST_SCOPES")
    if tf:
        try:
            for line in open(tf):
                p = line.split()
                if len(p) >= 2 and p[0] == str(pid):
                    return "0::/test/%s.scope\n" % p[1]
        except Exception:
            pass
    try:
        return open("/proc/%d/cgroup" % int(pid)).read()
    except Exception:
        return ""


def scope_of_pid(pid):
    if not pid:
        return None
    m = SCOPE_RX.search(_cgroup_text(pid))
    return m.group(1) if m else None


def chromium_app_scope_of_pid(pid):
    """v3.2.6-dev.1 — scope 'app-org.chromium.Chromium-<n>' del processo, se ci sta (vedi docstring)."""
    if not pid:
        return None
    m = CHROMIUM_APP_SCOPE_RX.search(_cgroup_text(pid))
    return m.group(1) if m else None


def _child_pids(pid):
    """Figli diretti di un processo: /proc/<pid>/task/*/children, con ripiego sulla scansione di /proc."""
    kids = []
    try:
        for tid in os.listdir("/proc/%d/task" % pid):
            try:
                kids += [int(x) for x in open("/proc/%d/task/%s/children" % (pid, tid)).read().split()]
            except (OSError, ValueError):
                pass
    except OSError:
        pass
    if kids:
        return kids
    for name in os.listdir("/proc") if os.path.isdir("/proc") else []:
        if not name.isdigit():
            continue
        try:
            st = open("/proc/%s/stat" % name).read()
            if int(st.rsplit(")", 1)[1].split()[1]) == pid:
                kids.append(int(name))
        except (OSError, ValueError, IndexError):
            pass
    return kids


def dashboard_child_scope(pid):
    """Scope xlauncher-dashboard-* in cui sono rimasti i figli del browser (zygote, GPU...), o None."""
    return child_scope_with_prefix(pid, DASHBOARD_SCOPE_PREFIX)


def child_scope_with_prefix(pid, prefix):
    """v3.2.17-dev.8 — generalizzazione di dashboard_child_scope (stesso codice): primo scope con il
    prefisso indicato fra quelli dei figli diretti del processo, o None."""
    tf = os.environ.get("XL_SPACES_TEST_CHILDREN")          # test: righe "pid figlio1 figlio2 ..."
    kids = []
    if tf:
        try:
            for line in open(tf):
                p = line.split()
                if p and p[0] == str(pid):
                    kids = [int(x) for x in p[1:]]
        except (OSError, ValueError):
            pass
    else:
        kids = _child_pids(int(pid))
    for k in kids:
        sc = scope_of_pid(k)
        if sc and sc.startswith(prefix):
            return sc
    return None


# v3.2.17-dev.10 — demone e token per il pulsante di chiusura dell'overlay (stessi di tray.py, che ospita
# spaces.py nella sessione Openbox: X_LAUNCHER_URL gli arriva da kiosk-launch.sh, 3001 con --local-server).
DAEMON_URL = os.environ.get("X_LAUNCHER_URL", "http://localhost:3000").rstrip("/")
API_TOKEN_FILE = os.path.join(os.path.expanduser("~"), ".local", "share", "x-launcher", "api-token")


def daemon_kill_unit(unit, timeout=20):
    """POST /api/process-manager/<unit>/kill al demone. (ok, messaggio)."""
    headers = {"Content-Type": "application/json"}
    try:
        with open(API_TOKEN_FILE, "r", encoding="utf-8") as f:
            tok = f.read().strip()
        if tok:
            headers["X-XLauncher-Token"] = tok
    except OSError:
        pass
    url = "%s/api/process-manager/%s/kill" % (DAEMON_URL, urllib.parse.quote(unit, safe=""))
    try:
        req = urllib.request.Request(url, data=b"{}", headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8") or "{}")
        return bool(body.get("success")), str(body.get("message") or "")
    except Exception as e:  # noqa
        return False, "%s: %s" % (type(e).__name__, e)


def web_app_scopes(pid):
    """v3.2.17-dev.8 — finestra di una web app lanciata come gioco (runner 'Web Stream', es. Amazon
    Luna): un secondo Chromium con profilo proprio, avviato dal demone nello scope
    xlauncher-game-<id>-<ts>. Come per la Dashboard, Chromium sposta il proprio processo principale
    (quello della finestra) in uno scope suo, app-org.chromium.Chromium-<n> (verificato sull'HTPC con
    Luna), mentre i figli (zygote, GPU, renderer) restano nel nostro. Rimanda (scope del gioco,
    scope del browser) oppure (None, None) se la finestra non e' di questo tipo."""
    app = chromium_app_scope_of_pid(pid)
    if not app:
        return None, None
    game = child_scope_with_prefix(pid, "xlauncher-game-")
    return (game, app) if game else (None, None)


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

    def window_name(self, wid):
        """Titolo attuale di una finestra (v3.2.6-dev.2: quello di gamescope segue l'app in primo piano)."""
        if not wid:
            return ""
        with self.lock:
            try:
                w = self.d.create_resource_object("window", wid)
                return _text(self.d, w, "_NET_WM_NAME") or _text(self.d, w, "WM_NAME") or ""
            except Exception:
                return ""


def covers_dir():
    return os.environ.get("X_LAUNCHER_COVERS_DIR") or os.path.join(
        os.path.expanduser("~"), ".local", "share", "x-launcher", "covers")


# --------------------------------------------------------------------------- sfondo degli spazi
# v3.2.29-dev.17 — sfondo del desktop dello spazio di un gioco: l'immagine ad alta risoluzione
# scaricata dal demone (src/backend/spaceBackground.ts) in <covers>/<id>.bg, a schermo intero e
# nitida, come sfondo della finestra radice mentre lo spazio corrente e' quello del gioco (1-2).
# Dashboard (0) e Steam (3) restano neri: li' una finestra a tutto schermo copre sempre il desktop.
# X_LAUNCHER_SPACE_BG=0 in ~/.config/openbox/environment lo disattiva.
SPACE_BG_CACHE = 3            # immagini gia' pronte tenute nel server X (circa 15 MB l'una a 1440p)


def space_bg_enabled_from_env():
    return os.environ.get("X_LAUNCHER_SPACE_BG", "1").strip().lower() not in ("0", "off", "no", "false")


def game_bg_file(scope):
    """<covers>/<id>.bg dello scope di un gioco, se esiste."""
    m = re.match(r"^xlauncher-game-(.+)-(\d+)(?:\.scope)?$", scope or "")
    if not m:
        return None
    p = os.path.join(covers_dir(), "%s.bg" % m.group(1))
    return p if os.path.isfile(p) else None


class SpaceBackground(threading.Thread):
    """Sfondo della finestra radice. Thread e connessione X propri (Xlib non e' thread-safe): le
    richieste arrivano con request(percorso|"") e vengono applicate in ordine, l'ultima vince.
    Immagine ridimensionata a riempire lo schermo (ritaglio centrale, lanczos) con Pillow, caricata
    una volta in un pixmap e tenuta pronta (SPACE_BG_CACHE): tornare su uno spazio e' immediato.
    Imposta anche _XROOTPMAP_ID/ESETROOT_PMAP_ID, come gli strumenti per lo sfondo."""

    def __init__(self):
        threading.Thread.__init__(self, daemon=True)
        self.cond = threading.Condition()
        self.want = ""
        self.applied = None           # (percorso, mtime) applicato
        self.cache = []               # [(percorso, mtime, pixmap)], dal piu' recente
        self.bad = {}                 # percorso -> mtime di un file che non si apre (niente tentativi a vuoto)
        self.d = None
        self.disabled = False

    def request(self, path):
        path = path or ""
        with self.cond:
            if path != self.want:
                self.want = path
                self.cond.notify()

    def _key(self, path):
        if not path:
            return ("", 0)
        try:
            return (path, os.stat(path).st_mtime)
        except OSError:
            return ("", 0)

    def run(self):
        try:
            self.d = display.Display()
        except Exception as e:  # noqa
            log("space background: no X connection (%r) -> disabled" % (e,))
            self.disabled = True
            return
        while True:
            with self.cond:
                while self._key(self.want) == self.applied:
                    self.cond.wait(2.0)       # anche un file sostituito (nuovo mtime) viene riapplicato
                path = self.want
            key = self._key(path)
            try:
                self._apply(key)
            except Exception as e:  # noqa
                log("space background: %s not applied (%r)" % (key[0] or "black", e))
            self.applied = key

    def _apply(self, key):
        path, mtime = key
        sc = self.d.screen()
        root = sc.root
        pix = None
        if path and self.bad.get(path) != mtime:
            for i, (p, m, px) in enumerate(self.cache):
                if p == path and m == mtime:
                    pix = px
                    self.cache.insert(0, self.cache.pop(i))
                    break
            if pix is None:
                t0 = time.time()
                pix = self._render(path)
                if pix is None:
                    self.bad[path] = mtime
                else:
                    self.cache.insert(0, (path, mtime, pix))
                    for _p, _m, old in self.cache[SPACE_BG_CACHE:]:
                        try:
                            old.free()
                        except Exception:  # noqa
                            pass
                    del self.cache[SPACE_BG_CACHE:]
                    log("space background: %s ready in %.0f ms" % (os.path.basename(path), (time.time() - t0) * 1000))
        if pix is None:
            root.change_attributes(background_pixel=sc.black_pixel)
            for name in ("_XROOTPMAP_ID", "ESETROOT_PMAP_ID"):
                root.delete_property(self.d.intern_atom(name))
        else:
            root.change_attributes(background_pixmap=pix)
            pixmap_atom = self.d.intern_atom("PIXMAP")
            for name in ("_XROOTPMAP_ID", "ESETROOT_PMAP_ID"):
                root.change_property(self.d.intern_atom(name), pixmap_atom, 32, [pix.id])
        root.clear_area(0, 0, 0, 0, False)
        self.d.flush()
        log("space background: %s" % (os.path.basename(path) if pix is not None else "black"))

    def _render(self, path):
        try:
            from PIL import Image, ImageOps
        except Exception as e:  # noqa
            if not self.disabled:
                log("space background: Pillow not available (%r) -> spaces stay black" % (e,))
            self.disabled = True
            return None
        sc = self.d.screen()
        info = self.d.display.info
        fmt = next((f for f in info.pixmap_formats if f.depth == sc.root_depth), None)
        if fmt is None or fmt.bits_per_pixel != 32:
            log("space background: unsupported X pixel format (depth %s)" % sc.root_depth)
            return None
        w, h = sc.width_in_pixels, sc.height_in_pixels
        try:
            img = Image.open(path)
            img.draft("RGB", (w, h))              # JPEG: decodifica gia' ridotta se e' molto piu' grande
            img = ImageOps.fit(img.convert("RGB"), (w, h), Image.LANCZOS, centering=(0.5, 0.5))
        except Exception as e:  # noqa
            log("space background: %s unreadable (%r)" % (os.path.basename(path), e))
            return None
        root = sc.root
        pix = root.create_pixmap(w, h, sc.root_depth)
        gc = pix.create_gc()
        data = img.tobytes("raw", "BGRX" if info.image_byte_order == 0 else "XRGB")
        stride = w * 4
        rows = max(1, max(4096, info.max_request_length * 4 - 256) // stride)
        y = 0
        while y < h:
            n = min(rows, h - y)
            pix.put_image(gc, 0, y, w, n, X.ZPixmap, sc.root_depth, 0, data[y * stride:(y + n) * stride])
            y += n
        gc.free()
        return pix


def cover_key_title(key):
    """Title written by the backend (coverCache.ts) in <covers>/<key>.json, or None."""
    if not key or not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}", key):
        return None
    try:
        with open(os.path.join(covers_dir(), "%s.json" % key), "r", encoding="utf-8") as fh:
            t = json.load(fh).get("title")
        return t.strip() if isinstance(t, str) and t.strip() else None
    except Exception:
        return None


def cover_key_files(key):
    """(cover, hero) cached for a cover key (coverCache.ts: sanitized game id), None where missing."""
    if not key or not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}", key):
        return None, None
    out = []
    for kind in ("cover", "hero"):
        p = os.path.join(covers_dir(), "%s.%s" % (key, kind))
        out.append(p if os.path.isfile(p) else None)
    return out[0], out[1]


def scope_procs_of_pid(pid):
    """PIDs of the whole cgroup (scope) the process is in, read from cgroup v2."""
    path = None
    for line in _cgroup_text(pid).splitlines():
        if line.startswith("0::"):
            path = line[3:].strip()
    if not path or path == "/" or ".." in path or ".scope" not in path:
        return []                            # solo dentro uno scope: mai l'intero albero dei cgroup
    pids = []
    for root, _dirs, files in os.walk("/sys/fs/cgroup" + path):
        if "cgroup.procs" in files:
            try:
                pids += [int(x) for x in open(os.path.join(root, "cgroup.procs")).read().split()]
            except (OSError, ValueError):
                pass
    return pids


def _all_pids():
    """PIDs di /proc (nei test: quelli di XL_SPACES_TEST_SCOPES)."""
    tf = os.environ.get("XL_SPACES_TEST_SCOPES")
    if tf:
        try:
            return [int(l.split()[0]) for l in open(tf) if l.split()]
        except Exception:
            return []
    try:
        return [int(n) for n in os.listdir("/proc") if n.isdigit()]
    except OSError:
        return []


def _ppid(pid):
    """Processo padre (nei test: righe "pid ppid" di XL_SPACES_TEST_PARENTS)."""
    tf = os.environ.get("XL_SPACES_TEST_PARENTS")
    if tf:
        try:
            for line in open(tf):
                p = line.split()
                if len(p) >= 2 and p[0] == str(pid):
                    return int(p[1])
        except Exception:
            pass
        return 0
    try:
        return int(open("/proc/%d/stat" % pid).read().rsplit(")", 1)[1].split()[1])
    except Exception:
        return 0


def steam_app_scopes(steam_scope):
    """v3.2.17-dev.11 — scope app-steam-app<id>-<pid> dei giochi avviati DA QUESTA sessione Steam: quelli
    con un processo il cui padre (o un antenato vicino) sta nello scope della sessione. Il controllo
    dell'antenato evita di prendere giochi di un altro Steam (es. una sessione desktop)."""
    out = []
    if not steam_scope:
        return out
    for pid in _all_pids():
        m = STEAM_APP_SCOPE_RX.search(_cgroup_text(pid))
        if not m or m.group(1) in out:
            continue
        p = pid
        for _ in range(8):
            p = _ppid(p)
            if p <= 1:
                break
            sc = scope_of_pid(p)
            if sc == steam_scope:
                out.append(m.group(1))
                break
            if sc:                                   # antenato in un altro scope nostro: non e' di questa sessione
                break
    return out


def steam_running_appid(pid):
    """AppId of the Steam game running in the same scope as `pid` (reaper SteamLaunch AppId=N), or None.
    v3.2.17-dev.11 — with the steamrt64 runtime the game has its own app-steam-app<AppId>-<pid> scope:
    the AppId then comes from that scope's name."""
    sc = scope_of_pid(pid)
    for app_scope in steam_app_scopes(sc) if sc else []:
        m = re.match(r"^app-steam-app(\d{1,10})-", app_scope)
        if m:
            return m.group(1)
    for p in scope_procs_of_pid(pid):
        try:
            args = open("/proc/%d/cmdline" % p, "rb").read().split(b"\0")
        except OSError:
            continue
        if b"SteamLaunch" not in args:
            continue
        for a in args:
            m = STEAM_APPID_ARG_RX.match(a.decode("utf-8", "replace"))
            if m:
                return m.group(1)
    return None


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


def window_rules_path():
    return os.environ.get("X_LAUNCHER_WINDOW_RULES") or os.path.join(
        os.path.expanduser("~"), ".local", "share", "x-launcher", "window-rules.json")


_rules_cache = {"mtime": None, "keep": frozenset()}


def keep_maximized(scope):
    """v3.2.29-dev.2 — True se il gioco dello scope (xlauncher-game-<id>-<ts>) e' stato lanciato con
    `--keep-maximized`. Il file viene riletto solo quando cambia (mtime)."""
    m = re.match(r"^xlauncher-game-(.+)-(\d+)(?:\.scope)?$", scope or "")
    if not m:
        return False
    path = window_rules_path()
    try:
        mt = os.stat(path).st_mtime_ns
    except OSError:
        _rules_cache["mtime"], _rules_cache["keep"] = None, frozenset()
        return False
    if mt != _rules_cache["mtime"]:
        keep = frozenset()
        try:
            with open(path, "r", encoding="utf-8") as fh:
                km = (json.load(fh) or {}).get("keepMaximized") or {}
            if isinstance(km, dict):
                keep = frozenset(k for k, v in km.items() if v is True)
        except Exception as e:  # noqa
            log("window-rules: lettura fallita (%r)" % (e,))
        _rules_cache["mtime"], _rules_cache["keep"] = mt, keep
    return m.group(1) in _rules_cache["keep"]


def window_iconic(d, w):
    """Finestra ridotta a icona: _NET_WM_STATE_HIDDEN (EWMH, Openbox) o WM_STATE = IconicState (3, ICCCM)."""
    if "_NET_WM_STATE_HIDDEN" in _atoms(d, w, "_NET_WM_STATE"):
        return True
    st = _cards(d, w, "WM_STATE")
    return bool(st) and st[0] == 3


def media_staging_dir():
    """v3.2.29-dev.3 — cartella di appoggio degli screenshot appena catturati (stesso calcolo del demone,
    src/backend/mediaLibrary.ts): /run/user/<uid>/x-launcher-media, altrimenti ~/.cache/x-launcher/media-staging.
    Creata 0700; rifiutata se non e' una cartella nostra (mai seguire un link messo da altri)."""
    run_dir = "/run/user/%d" % os.getuid()
    base = os.path.join(run_dir, "x-launcher-media") if os.path.isdir(run_dir) else \
        os.path.join(os.path.expanduser("~"), ".cache", "x-launcher", "media-staging")
    os.makedirs(base, mode=0o700, exist_ok=True)
    st = os.lstat(base)
    import stat as _stat
    if not _stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid():
        raise OSError("cartella di appoggio non valida: %s" % base)
    if st.st_mode & 0o077:
        os.chmod(base, 0o700)
    return base


def clips_dir():
    """v3.2.29-dev.6 — clip temporanee: /tmp/x-launcher-<uid>/clips (stesso calcolo del demone,
    mediaLibrary.ts). /tmp e' condivisa: le due cartelle devono essere nostre, vere cartelle (mai link)
    e senza permessi per gli altri, altrimenti niente clip."""
    import stat as _stat
    base = os.environ.get("X_LAUNCHER_CLIPS_DIR") or os.path.join("/tmp", "x-launcher-%d" % os.getuid(), "clips")
    for d in (os.path.dirname(base), base):
        try:
            os.mkdir(d, 0o700)
        except FileExistsError:
            pass
        st = os.lstat(d)
        if not _stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid():
            raise OSError("cartella delle clip non valida (non e' una nostra cartella): %s" % d)
        if st.st_mode & 0o077:
            os.chmod(d, 0o700)
    return base


def _rec_child_signals():
    # il registratore deve poter ricevere SIGINT (stop) e SIGUSR2 (pausa) anche se il tray li ignora
    for sig in (signal.SIGINT, signal.SIGUSR1, signal.SIGUSR2, signal.SIGTERM):
        signal.signal(sig, signal.SIG_DFL)


class Recorder:
    """v3.2.29-dev.6 — una clip alla volta, gestita da SpacesManager._rec_sync() (thread del ciclo X e
    agganci di spazi e overlay). Stati: inattivo / in attesa (parte allo scongelamento) / in registrazione /
    in pausa / in chiusura."""

    def __init__(self, mgr):
        self.mgr = mgr
        self.lock = threading.RLock()
        self.pending = None          # (spazio, scope) da avviare appena lo spazio e' davanti e scongelato
        self.proc = None
        self.info = None             # dict della clip in corso
        self.paused = False
        self.active_s = 0.0          # secondi registrati prima dell'ultima ripresa
        self.seg_t0 = None           # inizio del tratto in corso (None in pausa)
        self.stopping = False

    def busy(self):
        with self.lock:
            return bool(self.pending or self.proc or self.stopping)

    def recording_space(self):
        with self.lock:
            if self.info:
                return self.info["space"]
            return self.pending[0] if self.pending else None

    def elapsed(self):
        with self.lock:
            return self.active_s + ((time.time() - self.seg_t0) if self.seg_t0 else 0.0)

    def status(self):
        with self.lock:
            if not (self.proc or self.pending):
                return None
            return {"space": self.recording_space(), "elapsed": int(self.elapsed()), "paused": self.paused,
                    "pending": bool(self.pending and not self.proc)}

    def start(self, space, scope, wid):
        m = re.match(r"^xlauncher-game-(.+)-(\d+)(?:\.scope)?$", scope or "")
        if not m:
            return False
        try:
            folder = clips_dir()
        except Exception as e:  # noqa
            log("clip: %s" % e)
            return False
        if not shutil_which("gpu-screen-recorder"):
            log("clip: gpu-screen-recorder non installato")
            return False
        t0 = time.time()
        name = "clip-%d-%s" % (int(t0 * 1000), os.urandom(3).hex())
        path = os.path.join(folder, name + ".mp4")
        cmd = ["gpu-screen-recorder", "-w", "0x%x" % wid, "-c", "mp4", "-k", "h264", "-f", "60",
               "-a", "default_output", "-o", path]
        errlog = open(os.path.join(folder, name + ".log"), "wb")
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=errlog, stderr=errlog,
                                    preexec_fn=_rec_child_signals)
        except Exception as e:  # noqa
            errlog.close()
            log("clip: avvio non riuscito (%r)" % (e,))
            return False
        errlog.close()
        with self.lock:
            self.proc, self.paused, self.active_s, self.seg_t0, self.pending = proc, False, 0.0, t0, None
            self.info = {"space": space, "scope": scope, "key": m.group(1), "wid": wid, "name": name,
                         "path": path, "startedAt": int(t0 * 1000),
                         "title": game_db_title(scope) or self.mgr.xa.window_name(wid) or m.group(1)}
        log("clip: registrazione avviata (%s, finestra 0x%x, pid %d) -> %s" % (scope, wid, proc.pid, path))
        return True

    def _signal(self, sig):
        with self.lock:
            p = self.proc
        if p and p.poll() is None:
            try:
                p.send_signal(sig)
                return True
            except Exception as e:  # noqa
                log("clip: segnale %s non inviato (%r)" % (sig, e))
        return False

    def pause(self):
        with self.lock:
            if not self.proc or self.paused:
                return False
            if self._signal(signal.SIGUSR2):
                self.active_s += time.time() - (self.seg_t0 or time.time())
                self.seg_t0, self.paused = None, True
                log("clip: in pausa (%.0f s registrati)" % self.active_s)
                return True
        return False

    def resume(self):
        with self.lock:
            if not self.proc or not self.paused:
                return False
            if self._signal(signal.SIGUSR2):
                self.seg_t0, self.paused = time.time(), False
                log("clip: ripresa")
                return True
        return False

    def stop(self, reason, done=None):
        """Chiude la clip (SIGINT, il file MP4 viene completato) e la archivia in un thread."""
        with self.lock:
            if self.pending and not self.proc:
                log("clip: richiesta annullata (%s)" % reason)
                self.pending = None
                return False
            if not self.proc or self.stopping:
                return False
            self.stopping = True
            proc, info = self.proc, dict(self.info)
            info["duration"] = round(self.elapsed(), 1)
            self.seg_t0 = None
        log("clip: arresto (%s, %.0f s)" % (reason, info["duration"]))
        threading.Thread(target=self._finish, args=(proc, info, reason, done), daemon=True).start()
        return True

    def _finish(self, proc, info, reason, done):
        try:
            if proc.poll() is None:
                proc.send_signal(signal.SIGINT)
            try:
                proc.wait(CLIP_STOP_TIMEOUT_S)
            except subprocess.TimeoutExpired:
                log("clip: il registratore non si chiude, lo termino")
                proc.kill()
                proc.wait(5)
            ok = os.path.isfile(info["path"]) and os.path.getsize(info["path"]) > 0
            logf = os.path.join(os.path.dirname(info["path"]), info["name"] + ".log")
            if not ok:
                tail = ""
                try:
                    with open(logf, "rb") as fh:
                        tail = fh.read()[-400:].decode("utf-8", "replace").strip()
                except OSError:
                    pass
                log("clip: nessun file valido (rc=%s) %s" % (proc.returncode, tail))
            else:
                meta = {k: info[k] for k in ("key", "scope", "title", "startedAt", "duration")}
                meta.update({"file": os.path.basename(info["path"]), "reason": reason,
                             "size": os.path.getsize(info["path"])})
                try:
                    with self.mgr.xa.lock:
                        g = self.mgr.xa.d.create_resource_object("window", info["wid"]).get_geometry()
                    meta["width"], meta["height"] = g.width, g.height
                except Exception:
                    pass
                tmp = os.path.join(os.path.dirname(info["path"]), info["name"] + ".json.tmp")
                with open(tmp, "w", encoding="utf-8") as fh:
                    json.dump(meta, fh)
                os.replace(tmp, os.path.join(os.path.dirname(info["path"]), info["name"] + ".json"))
                log("clip: salvata nella cache temporanea %s (%.0f s, %d KB)"
                    % (info["path"], info["duration"], meta["size"] // 1024))
            try:
                os.unlink(logf)
            except OSError:
                pass
            prune_clips(CLIP_KEEP)
            if ok:
                okd, body = daemon_post("/api/media/clip", {"key": info["key"], "file": os.path.basename(info["path"])})
                if not okd:
                    log("clip: notifica al demone non riuscita (%s)" % body.get("message"))
        except Exception as e:  # noqa
            log("clip: errore in chiusura (%r)" % (e,))
            ok = False
        finally:
            with self.lock:
                self.proc, self.info, self.paused, self.stopping = None, None, False, False
                self.active_s, self.seg_t0 = 0.0, None
            if done:
                done(ok)

    def check_exit(self):
        """Il registratore e' uscito da solo (finestra del gioco chiusa, errore)?"""
        with self.lock:
            p = self.proc
            if not p or self.stopping:
                return False
        if p.poll() is not None:
            self.stop("registratore uscito da solo (rc=%s)" % p.returncode)
            return True
        return False


def prune_clips(keep):
    """Tiene solo le `keep` clip temporanee piu' recenti (con i loro .json): la quarta cancella la piu' vecchia."""
    try:
        folder = clips_dir()
        clips = sorted((f for f in os.listdir(folder) if re.fullmatch(r"clip-\d+-[0-9a-f]+\.mp4", f)),
                       key=lambda f: int(f.split("-")[1]))
    except Exception as e:  # noqa
        log("clip: pulizia non riuscita (%r)" % (e,))
        return
    for f in clips[:-keep] if keep > 0 else clips:
        base = f[:-4]
        for ext in (".mp4", ".json"):
            try:
                os.unlink(os.path.join(folder, base + ext))
            except OSError:
                pass
        log("clip: cache piena (max %d), cancellata la piu' vecchia %s" % (keep, f))


def capture_window_png(wid, out_path):
    """Screenshot della sola finestra `wid` in PNG: gpu-screen-recorder (provato sull'HTPC il 14/11/2026:
    finestra 2560x1440 in ~400 ms), con ripiego su `import` di ImageMagick. (ok, metodo, ms, errore)."""
    attempts = []
    if shutil_which("gpu-screen-recorder"):
        attempts.append(("gpu-screen-recorder", ["gpu-screen-recorder", "-w", "0x%x" % wid, "-o", out_path]))
    if shutil_which("import"):
        attempts.append(("import", ["import", "-silent", "-window", "0x%x" % wid, out_path]))
    if not attempts:
        return False, None, 0, "ne' gpu-screen-recorder ne' import (ImageMagick) installati"
    err = ""
    for name, cmd in attempts:
        t0 = time.time()
        try:
            r = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                               timeout=SCREENSHOT_TIMEOUT_S)
            ms = int((time.time() - t0) * 1000)
            if r.returncode == 0 and os.path.isfile(out_path) and os.path.getsize(out_path) > 0:
                return True, name, ms, ""
            err = "%s rc=%s %s" % (name, r.returncode, (r.stderr or b"").decode("utf-8", "replace").strip()[-300:])
        except Exception as e:  # noqa
            err = "%s: %r" % (name, e)
        log("screenshot: %s non riuscito (%s)%s" % (name, err, ", provo il ripiego" if name != attempts[-1][0] else ""))
        try:
            os.unlink(out_path)
        except OSError:
            pass
    return False, None, 0, err


def shutil_which(cmd):
    import shutil
    return shutil.which(cmd)


def daemon_post(path, payload, timeout=30):
    """POST JSON al demone col token (come daemon_kill_unit). (ok, corpo della risposta o messaggio)."""
    headers = {"Content-Type": "application/json"}
    try:
        with open(API_TOKEN_FILE, "r", encoding="utf-8") as f:
            tok = f.read().strip()
        if tok:
            headers["X-XLauncher-Token"] = tok
    except OSError:
        pass
    try:
        req = urllib.request.Request(DAEMON_URL + path, data=json.dumps(payload).encode("utf-8"),
                                     headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8") or "{}")
        return bool(body.get("success")), body
    except Exception as e:  # noqa
        return False, {"message": "%s: %s" % (type(e).__name__, e)}


def overlay_enabled_from_env():
    return os.environ.get("X_LAUNCHER_SPACES_OVERLAY", "0").strip().lower() in ("1", "true", "on", "yes")


# --------------------------------------------------------------------------- congelamento
def freeze_enabled_from_env():
    return os.environ.get("X_LAUNCHER_SPACES_FREEZE", "1").strip().lower() not in ("0", "false", "off", "no")


def freeze_dashboard_from_env():
    """v3.2.1-dev.1 — congela anche la Dashboard negli altri spazi (X_LAUNCHER_SPACES_FREEZE_DASHBOARD=0 per spegnerlo)."""
    return os.environ.get("X_LAUNCHER_SPACES_FREEZE_DASHBOARD", "1").strip().lower() not in ("0", "false", "off", "no")


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
        self.dashboard_enabled = freeze_dashboard_from_env()
        # v3.2.6-dev.1 — gruppi: uno scope "principale" che sta per piu' scope reali, congelati e
        # scongelati insieme (la Dashboard: scope del browser + scope dei suoi figli). Ordine dei membri
        # = ordine di congelamento; lo scongelamento va al contrario.
        self.groups = {}
        self.frozen_members = {}     # v3.2.17-dev.11 — principale -> membri effettivamente congelati

    def set_group(self, primary, members):
        members = [m for m in members if m]
        with self.state_lock:
            if len(members) > 1:
                self.groups[primary] = list(members)
            else:
                self.groups.pop(primary, None)

    def members(self, scope):
        with self.state_lock:
            base = list(self.groups.get(scope, [scope]))
        if scope and scope.startswith(STEAM_SCOPE_PREFIX):
            # v3.2.17-dev.11 — gioco Steam in uno scope suo (steamrt64): congelato insieme alla sessione,
            # prima il gioco poi Steam (lo scongelamento va al contrario). Calcolato al momento: il gioco
            # parte e finisce mentre la sessione resta.
            extra = [a for a in steam_app_scopes(scope) if a not in base]
            base = extra + base
        return base

    def freezable(self, scope):
        if not scope:
            return False
        if scope.startswith(DASHBOARD_SCOPE_PREFIX) or _CHROMIUM_APP_SCOPE_RE.fullmatch(scope):
            return self.dashboard_enabled
        return scope.startswith("xlauncher-game-") or scope.startswith(STEAM_SCOPE_PREFIX)

    def excluded(self, scope):
        for pat in read_nofreeze():
            if scope == pat or scope.startswith(pat):
                return True
        return False

    def _systemctl(self, verb, scope):
        """freeze/thaw di uno scope o, se e' il principale di un gruppo, di tutti i suoi membri."""
        members = self.members(scope)
        # v3.2.17-dev.11 — si scongela esattamente cio' che si era congelato (piu' i membri attuali):
        # i membri dinamici (gioco Steam in uno scope suo) potrebbero non essere piu' trovati dopo
        with self.state_lock:
            if verb == "freeze":
                self.frozen_members[scope] = list(members)
            else:
                stored = self.frozen_members.pop(scope, [])
                members = stored + [m for m in members if m not in stored]
        if verb == "thaw":
            members = list(reversed(members))
        ok = True
        for m in members:
            ok = self._systemctl_one(verb, m) and ok
        return ok

    def _systemctl_one(self, verb, scope):
        if not valid_scope(scope):
            log("freezer: scope rifiutato: %r" % (scope,))
            return False
        try:
            r = subprocess.run([SYSTEMCTL, "--user", verb, scope + ".scope"], capture_output=True,
                               text=True, timeout=10)
        except Exception as e:  # noqa
            log("freezer: %s %s fallito: %s" % (verb, scope, e))
            self.errors += 1
            return False
        if r.returncode != 0:
            err = (r.stderr or "").strip()
            if "not found" in err or "not loaded" in err:
                # v3.2.17-dev.11 — scope gia' chiuso (es. congelamento programmato appena dopo la chiusura di
                # Steam dall'overlay): niente da fare, non e' un errore del freezer
                log("freezer: %s %s: scope no longer exists, skipped" % (verb, scope))
                return False
            log("freezer: %s %s -> codice %d %s" % (verb, scope, r.returncode, err[:200]))
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
        with self.state_lock:
            self.groups.pop(scope, None)

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

    def schedule_freeze(self, scope, delay=None):
        if not self.enabled or not self.freezable(scope) or self.excluded(scope):
            return
        with self.state_lock:
            if scope in self.frozen:
                return
        t = threading.Timer(FREEZE_DELAY_S if delay is None else delay, self._freeze_now, args=(scope,))
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
                                "xlauncher-game-*.scope", "xlauncher-dashboard-*.scope", "xlauncher-steam-*.scope",
                                "app-org.chromium.Chromium-*.scope", "app-steam-app*.scope"],
                               capture_output=True, text=True, timeout=10)
        except Exception as e:  # noqa
            log("freezer: list-units fallito: %s" % e)
            return
        for line in (r.stdout or "").splitlines():
            parts = line.split()
            if not parts or not parts[0].endswith(".scope"):
                continue
            scope = parts[0][:-len(".scope")]
            if not valid_scope(scope):
                continue
            try:
                g = subprocess.run([SYSTEMCTL, "--user", "show", "-p", "FreezerState", "--value",
                                    scope + ".scope"], capture_output=True, text=True, timeout=10)
            except Exception:
                continue
            if g.stdout.strip() in ("frozen", "freezing"):
                log("freezer: %s era rimasto congelato: scongelo" % scope)
                self._systemctl_one("thaw", scope)

    def set_enabled(self, on):
        self.enabled = bool(on)
        if not on:
            self.thaw_all()

    def snapshot(self):
        with self.state_lock:
            return {"enabled": self.enabled, "frozen": sorted(self.frozen), "errors": self.errors,
                    "excluded": read_nofreeze(), "groups": {k: list(v) for k, v in self.groups.items()}}


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
        self.dashboard_scope = None          # scope principale del gruppo della Dashboard (vedi _apply), o None
        self.steam_wid = None                # v3.2.6-dev.2 — finestra di gamescope (Steam), spazio STEAM_SPACE
        self.steam_scope = None
        self.steam_timer = None
        self.steam_settle = None             # v3.2.6-dev.4 — prestart: istante della finestra, finche' non congelato
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
        self.km_seen = {}                    # v3.2.29-dev.2 — wid -> istante in cui e' stata vista iconificata
        self.km_hist = {}                    # scope -> istanti delle ultime riattivazioni
        self.km_pause = {}                   # scope -> fino a quando non riattivare (troppe iconificazioni)
        self.last_shot = 0.0                 # v3.2.29-dev.3 — ultimo screenshot (anti-ripetizione)
        self._osd = None                     # v3.2.29-dev.4 — sovrimpressione (overlay.Osd), creata al primo uso
        self.recorder = Recorder(self)       # v3.2.29-dev.6 — clip
        self.space_bg = None                 # v3.2.29-dev.17 — sfondo del desktop degli spazi (SpaceBackground)
        if HAVE_XLIB and space_bg_enabled_from_env():
            self.space_bg = SpaceBackground()
            self.space_bg.start()
        self._rec_osd_next = None           # v3.2.29-dev.9 — secondi di registrazione del prossimo pallino REC
        self._osd_tried = False

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
        elif scope and scope.startswith(STEAM_SCOPE_PREFIX):
            kind = "steam"
        elif scope and scope.startswith("xlauncher-game-"):
            kind = "game"
        elif scope and scope.startswith("xlauncher-shared-launcher-"):
            kind = "launcher"
        else:
            m = STEAM_CLASS_RX.match(inst) or STEAM_CLASS_RX.match(klass)
            if m:
                kind = "game"
                scope = "steam-%s" % m.group(1)
        app_scope = None
        if kind == "other" and (pid or xpid):
            # v3.2.17-dev.8 — web app lanciata come gioco (vedi web_app_scopes): e' un gioco a tutti
            # gli effetti (slot, overlay, copertina dallo scope), congelata come gruppo browser+figli.
            gscope, ascope = web_app_scopes(pid or xpid)
            if gscope:
                kind, scope, app_scope = "game", gscope, ascope
        noise = (not name or bool(NOISE_NAME_RX.search(name)) or g.width <= 10 or g.height <= 10
                 or any(t in IGNORED_TYPES for t in types))
        return {"wid": wid, "name": name, "class": "%s/%s" % (inst, klass), "pid": pid or xpid,
                "scope": scope, "kind": kind, "noise": noise, "w": g.width, "h": g.height,
                "app_scope": app_scope,
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
            # v3.2.6-dev.1 — gruppo della Dashboard: scope del processo della finestra (nostro, o quello che
            # Chromium si crea da solo) + scope xlauncher-dashboard-* rimasto ai suoi figli.
            sc = info.get("scope")
            pid = info.get("pid")
            own = sc if (sc and sc.startswith(DASHBOARD_SCOPE_PREFIX)) else None
            app = chromium_app_scope_of_pid(pid) if not own else None
            ours = own or (dashboard_child_scope(pid) if pid else None)
            members = [m for m in (app, ours) if m]          # prima il browser (eventi/input), poi i figli
            primary = ours or app
            self.freezer.set_group(primary, members)
            with self.lock:
                self.dashboard_wid = wid
                self.dashboard_scope = primary
            log("Dashboard: window 0x%x (%s) pid=%s freeze group=%s%s" % (
                wid, info["class"], pid, ",".join(members) or "-",
                "" if members else "  [no scope found: the Dashboard is not frozen, the in-page lock stays]"))
            if app and not ours:
                log("Dashboard: WARNING browser in %s but no xlauncher-dashboard scope among its children "
                    "(only the main process will be frozen)" % app)
            return
        if kind == "steam":
            if info["noise"]:
                return
            with self.lock:
                first = self.steam_wid is None
                self.steam_wid = wid
                self.steam_scope = info["scope"]
                t = self.steam_timer
                self.steam_timer = None
            if t:
                t.cancel()
            prestart = STEAM_PRESTART_MARK in (info["scope"] or "")
            log("Steam: window 0x%x '%s' (%dx%d) scope=%s -> space %d (desktop %d)%s"
                % (wid, info["name"], info["w"], info["h"], info["scope"], STEAM_SPACE, STEAM_SPACE + 1,
                   " [prestart: stays in background, frozen once Big Picture is ready]" if prestart else ""))
            self.xa.move_window(wid, STEAM_SPACE)
            if first and prestart:
                with self.lock:
                    self.steam_settle = time.time()
            elif first and not initial:
                self.switch_space(STEAM_SPACE, activate=wid, reason="Steam")
            return
        if kind == "launcher":
            log("launcher %s: finestra 0x%x '%s' — nessuno slot" % (info["scope"], wid, info["name"]))
            return
        if kind != "game" or info["noise"]:
            return
        scope = info["scope"]
        if info.get("app_scope"):
            # v3.2.17-dev.8 — web app: browser (finestra, input) e figli congelati insieme, come la Dashboard
            self.freezer.set_group(scope, [info["app_scope"], scope])
            log("web app %s: browser in %s, freeze group=%s,%s" % (scope, info["app_scope"], info["app_scope"], scope))
        slot = self.assign_slot(scope)
        if slot is None:
            log("gioco %s: nessuno slot libero (max %d, spazio %d riservato a Steam) — finestra 0x%x lasciata dov'e'"
                % (scope, NUM_SLOTS, STEAM_SPACE, wid))
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
                    gone_scope, self.dashboard_scope = self.dashboard_scope, None
                else:
                    gone_scope = None
            log("Dashboard: finestra 0x%x chiusa" % wid)
            if gone_scope:
                self.freezer.release(gone_scope)     # fuori dal lock: evita lo stallo con _freeze_now
            return
        if info["kind"] == "steam":
            with self.lock:
                if self.steam_wid != wid:
                    return
                self.steam_wid = None
                tm = threading.Timer(RELEASE_GRACE_S, self.release_steam)
                tm.daemon = True
                old, self.steam_timer = self.steam_timer, tm
            if old:
                old.cancel()
            log("Steam: window 0x%x closed, releasing space %d in %.0f s" % (wid, STEAM_SPACE, RELEASE_GRACE_S))
            tm.start()
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

    def release_steam(self):
        """La finestra di gamescope non e' ricomparsa: Steam e' chiuso, lo spazio 3 si libera."""
        with self.lock:
            if self.steam_wid is not None:
                return                       # ricomparsa nel frattempo
            scope, self.steam_scope = self.steam_scope, None
            self.steam_timer = None
            self.steam_settle = None
            was_current = self.cur_space == STEAM_SPACE
            target = self.prev_space if (self.prev_space == 0 or self.prev_space in self.slots) else 0
        if scope:
            self.freezer.release(scope)
        log("Steam: space %d released (%s)" % (STEAM_SPACE, scope or "-"))
        if was_current:
            self.switch_space(target, reason="Steam chiuso")

    def steam_present(self):
        with self.lock:
            return self.steam_wid is not None

    # ----- spazi
    def space_window(self, space):
        with self.lock:
            if space == 0:
                return self.dashboard_wid
            if space == STEAM_SPACE:
                return self.steam_wid
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
            valid = space == 0 or space in self.slots or (space == STEAM_SPACE and self.steam_wid is not None)
        if not valid:
            log("switch %s ignorato: spazio non occupato" % space)
            return False
        target = activate or self.space_window(space)
        with self.lock:
            self.target_space = space
            scope_to = self.scope_for_space(space)
        self._rec_sync()                     # v3.2.29-dev.6 — clip in pausa prima che il suo gioco si congeli
        self._space_bg_sync(space)           # v3.2.29-dev.17 — sfondo pronto prima del cambio di desktop
        # scongela il gioco (o la Dashboard) di destinazione PRIMA di mostrarlo
        if scope_to and not thaw_delay and self.freezer.thaw_sync(scope_to):
            time.sleep(THAW_SETTLE_S)
        self.xa.switch_desktop(space)
        if target:
            self.xa.activate(target)
        log("-> spazio %d (%s)%s" % (space, reason, " finestra 0x%x" % target if target else ""))
        self._freeze_others(space)
        return True

    def scope_for_space(self, space):
        """Scope da congelare/scongelare per uno spazio: il gioco dello slot, o (spazio 0) la Dashboard."""
        with self.lock:
            if space == STEAM_SPACE:
                return self.steam_scope
            return self.dashboard_scope if space == 0 else self.slots.get(space)

    def _should_freeze(self, scope):
        with self.lock:
            if scope and scope == self.dashboard_scope:
                return self.target_space != 0
            if scope and scope == self.steam_scope:
                return self.target_space != STEAM_SPACE
            return scope in self.scope_slot and scope != self.slots.get(self.target_space)

    def _freeze_others(self, space):
        with self.lock:
            others = [sc for sl, sc in self.slots.items() if sl != space]
            if self.steam_scope and space != STEAM_SPACE:
                others.append(self.steam_scope)
            dash = self.dashboard_scope if space != 0 else None
        for sc in others:
            self.freezer.schedule_freeze(sc)
        if dash:
            self.freezer.schedule_freeze(dash, DASHBOARD_FREEZE_DELAY_S)

    def _align_freeze(self, space):
        """Il desktop e' cambiato per cause esterne (scorciatoie del WM...): riallinea i congelamenti."""
        with self.lock:
            if space == self.target_space:
                return
            self.target_space = space
            scope_to = self.scope_for_space(space)
        if scope_to:
            self.freezer.thaw_sync(scope_to)
        self._freeze_others(space)

    def occupied(self):
        with self.lock:
            return [0] + sorted(self.slots) + ([STEAM_SPACE] if self.steam_wid is not None else [])

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
            elif sp["kind"] == "steam":
                out.append(self.steam_entry(sp))
            else:
                cover, hero = game_cover_files(sp.get("scope"))
                out.append({"space": sp["space"], "kind": "game",
                            "title": game_db_title(sp.get("scope")) or sp.get("title") or ("Game %d" % sp["space"]),
                            "cover": cover, "hero": hero})
        return out

    def steam_entry(self, sp):
        """Riquadro dello spazio 3: il gioco Steam in corso (titolo e copertine dalla cache della
        Dashboard, chiave steam-<AppId>) oppure "Steam" quando c'e' solo Big Picture."""
        with self.lock:
            info = self.clients.get(sp.get("window")) or {}
        appid = steam_running_appid(info.get("pid")) if info.get("pid") else None
        name = (sp.get("title") or "").strip()
        bp = not name or name.lower() in ("gamescope", "steam") or "big picture" in name.lower()
        if appid:
            key = "steam-%s" % appid
            cover, hero = cover_key_files(key)
            title = cover_key_title(key) or (name if not bp else "Steam")
            return {"space": STEAM_SPACE, "kind": "steam", "title": title, "cover": cover, "hero": hero}
        return {"space": STEAM_SPACE, "kind": "steam", "title": "Steam" if bp else name}

    def overlay_current_space(self):
        with self.lock:
            return self.target_space

    def overlay_opened(self):
        """Overlay appena mostrato: congela il gioco corrente e prende il pad in esclusiva."""
        self._rec_sync()                     # v3.2.29-dev.6 — clip in pausa prima del congelamento
        with self.lock:
            scope = self.steam_scope if self.target_space == STEAM_SPACE else self.slots.get(self.target_space)
        if scope:
            threading.Thread(target=self.freezer.freeze_now, args=(scope, self.overlay_is_open), daemon=True).start()
        if self.pad_listener:
            self.pad_listener.overlay_grab(True)

    def overlay_cancelled(self):
        """Overlay chiuso senza cambiare spazio: il gioco corrente riprende."""
        with self.lock:
            scope = self.steam_scope if self.target_space == STEAM_SPACE else self.slots.get(self.target_space)
        if scope:
            self.freezer.thaw_sync(scope)

    def overlay_scope_of(self, space):
        return self.scope_for_space(space)

    def overlay_close_space(self, space):
        """v3.2.17-dev.10 — pulsante rosso con la X dell'overlay: termina il processo dello spazio (gioco,
        web app come Amazon Luna, o Steam nello spazio 3) passando dal demone, con la STESSA rotta del Gestore
        dei processi (/api/process-manager/<unit>/kill): li' ci sono gia' lo scongelamento, la chiusura
        ordinata di Steam e (per le web app) la chiusura del browser. Mai la Dashboard (spazio 0).
        Prima si scongela qui l'intero gruppo (una web app ha due scope), poi la richiesta.
        Ritorna (ok, chiave del messaggio dell'overlay)."""
        if space == 0:
            return False, "close_na"
        scope = self.scope_for_space(space)
        if not scope or not scope.startswith("xlauncher-") or not valid_scope(scope):
            log("overlay: space %s has no closable scope (%r)" % (space, scope))
            return False, "close_na"
        try:
            self.freezer.thaw_sync(scope)
        except Exception as e:  # noqa
            log("overlay: thaw before close of %s failed: %r" % (scope, e))
        ok, msg = daemon_kill_unit(scope)
        log("overlay: close space %s (%s) -> %s%s" % (space, scope, "ok" if ok else "FAILED", (" — " + msg) if msg else ""))
        return ok, (None if ok else "close_failed")

    def overlay_closed(self):
        if self.pad_listener:
            self.pad_listener.overlay_grab(False)
        self._rec_sync()                     # v3.2.29-dev.6 — avvio/ripresa della clip a gioco scongelato

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
                    wanted = self.scope_for_space(self.target_space) == scope
                if wanted:
                    self.freezer.thaw_sync(scope)
            self.overlay_closed()            # (riallinea anche la clip: avvio o ripresa)
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
            steam_wid, steam_scope = self.steam_wid, self.steam_scope
        if steam_wid is not None:
            spaces.append({"space": STEAM_SPACE, "kind": "steam", "scope": steam_scope, "window": steam_wid,
                           "title": self.xa.window_name(steam_wid)})
        with self.lock:
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
                if not valid_scope(sc):
                    return {"ok": False, "error": "scope non valido"}
                self.freezer.thaw_sync(sc)
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
                self._space_bg_sync()        # v3.2.29-dev.17 — anche per un cambio di desktop esterno

    def _space_bg_sync(self, space=None):
        """v3.2.29-dev.17 — sfondo del desktop per lo spazio corrente (o per quello in arrivo).
        Ogni giro del ciclo: il file dello sfondo puo' arrivare dopo il lancio (download del demone)."""
        if not self.space_bg:
            return
        with self.lock:
            sp = self.cur_space if space is None else space
            scope = self.slots.get(sp) if sp not in (0, STEAM_SPACE) else None
        self.space_bg.request(game_bg_file(scope) if scope else "")

    def _prestart_tick(self, now):
        """v3.2.6-dev.4 — Steam in background: congela lo scope appena Big Picture e' pronta (titolo),
        se nel frattempo l'utente non e' andato nello spazio 3."""
        with self.lock:
            t0, wid, scope, target = self.steam_settle, self.steam_wid, self.steam_scope, self.target_space
        if t0 is None:
            return
        if wid is None or scope is None or target == STEAM_SPACE:
            with self.lock:
                self.steam_settle = None     # chiuso, o l'utente ci e' andato: da qui vale la regola normale
            return
        title = self.xa.window_name(wid)
        late = now - t0 >= PRESTART_FREEZE_MAX_S
        if BIG_PICTURE_RX.search(title or "") or late:
            with self.lock:
                self.steam_settle = None
            log("Steam prestart: %s after %.0f s (title %r): freezing %s"
                % ("Big Picture ready" if not late else "timeout", now - t0, title, scope))
            self.freezer.schedule_freeze(scope)

    def _keep_maximized_tick(self, now):
        """v3.2.29-dev.2 — riattiva la finestra principale di un gioco con `--keep-maximized` ridotta a icona
        mentre il suo spazio e' quello corrente (e l'overlay e' chiuso). Solo spazi dei giochi (1..NUM_SLOTS)."""
        with self.lock:
            space = self.cur_space
            if space != self.target_space or not (1 <= space <= NUM_SLOTS):
                self.km_seen.clear()
                return
            scope = self.slots.get(space)
        if not scope or self.overlay_is_open() or not keep_maximized(scope):
            self.km_seen.clear()
            return
        wid = self.space_window(space)
        if not wid:
            return
        try:
            iconic = window_iconic(self.de, self.de.create_resource_object("window", wid))
        except Exception:
            iconic = False
        if not iconic:
            self.km_seen.pop(wid, None)
            return
        seen = self.km_seen.setdefault(wid, now)
        if seen == now:
            log("keep-maximized: finestra 0x%x di %s ridotta a icona nello spazio corrente %d" % (wid, scope, space))
        if now - seen < KEEP_MAX_DELAY_S:
            return
        if now < self.km_pause.get(scope, 0.0):
            return
        hist = [t for t in self.km_hist.get(scope, []) if now - t < KEEP_MAX_WINDOW_S]
        if len(hist) >= KEEP_MAX_RESTORES:
            self.km_pause[scope] = now + KEEP_MAX_PAUSE_S
            self.km_hist[scope] = []
            log("keep-maximized: %s ridotto a icona %d volte in %.0f s — riattivazione sospesa per %.0f s "
                "(dall'overlay si puo' sempre tornare al gioco)"
                % (scope, KEEP_MAX_RESTORES, KEEP_MAX_WINDOW_S, KEEP_MAX_PAUSE_S))
            return
        hist.append(now)
        self.km_hist[scope] = hist
        self.km_seen.pop(wid, None)
        self.xa.activate(wid)
        log("keep-maximized: finestra 0x%x di %s riattivata (%d/%d in %.0f s)"
            % (wid, scope, len(hist), KEEP_MAX_RESTORES, KEEP_MAX_WINDOW_S))

    # ----- v3.2.29-dev.3 — screenshot (tasto Share, v3.2.29-dev.5)
    def screenshot(self):
        """Screenshot della finestra del gioco dello spazio corrente (solo spazi 1..NUM_SLOTS, overlay chiuso,
        nessun cambio di spazio in corso). La cattura e l'invio al demone girano in un thread: il pad resta libero."""
        now = time.time()
        with self.lock:
            space, target = self.cur_space, self.target_space
            scope = self.slots.get(space) if 1 <= space <= NUM_SLOTS else None
        if space != target or not scope:
            why = ("Steam ha i suoi screenshot" if space == STEAM_SPACE else
                   "cambio di spazio in corso" if space != target else "non e' lo spazio di un gioco")
            log("screenshot ignorato: spazio %s (%s)" % (space, why))
            return False
        if self.overlay_is_open():
            return False
        if now - self.last_shot < SCREENSHOT_MIN_INTERVAL_S:
            return False
        wid = self.space_window(space)
        m = re.match(r"^xlauncher-game-(.+)-(\d+)(?:\.scope)?$", scope)
        if not wid or not m:
            log("screenshot ignorato: nessuna finestra o scope non riconosciuto (%s)" % scope)
            return False
        self.last_shot = now
        threading.Thread(target=self._screenshot_work, args=(wid, m.group(1), scope, now), daemon=True).start()
        return True

    # ----- v3.2.29-dev.6 — tasto Share e clip
    def share_short(self):
        """Share premuto brevemente: ferma la clip in corso, altrimenti screenshot."""
        if self.recorder.busy():
            self.clip_stop("Share")
        else:
            self.screenshot()

    def share_hold(self):
        """Share tenuto premuto: avvia la clip nello spazio corrente (o la ferma se e' in corso)."""
        if self.recorder.busy():
            self.clip_stop("Share")
            return
        with self.lock:
            space = self.cur_space
        self.clip_request(space, "Share")

    def clip_request(self, space, origin):
        """Avvio di una clip nello spazio `space` (1..NUM_SLOTS): parte appena lo spazio e' davanti,
        scongelato e senza overlay (dall'overlay: dopo la chiusura). Una clip alla volta."""
        with self.lock:
            scope = self.slots.get(space) if 1 <= space <= NUM_SLOTS else None
        if not scope:
            log("clip ignorata (%s): spazio %s %s" % (origin, space, "(Steam ha le sue registrazioni)"
                                                     if space == STEAM_SPACE else "(non e' lo spazio di un gioco)"))
            return False
        if self.recorder.busy():
            if self.recorder.recording_space() == space:
                return True
            self.clip_stop("nuova clip in un altro spazio")
        with self.recorder.lock:
            self.recorder.pending = (space, scope)
        log("clip richiesta (%s) per lo spazio %d (%s)" % (origin, space, scope))
        self._rec_sync()
        return True

    def clip_stop(self, origin):
        with self.lock:
            space = self.cur_space
        stopped = self.recorder.stop(origin, done=lambda ok: self._clip_done(ok, space))
        self._rec_osd(False)
        return stopped

    def _clip_done(self, ok, space):
        osd = self.osd()
        if osd and ok:
            osd.flash(None, "osd_rec_done")

    def _rec_osd(self, on):
        """v3.2.29-dev.9 — on=True all'avvio della clip: pallino REC per REC_OSD_SHOW_S, poi di nuovo ogni
        REC_OSD_EVERY_S secondi di registrazione effettiva (_rec_osd_tick). on=False (pausa, arresto):
        il messaggio eventualmente a schermo sparisce subito; all'arresto il conteggio si azzera."""
        osd = self.osd()
        if on:
            self._rec_osd_next = REC_OSD_EVERY_S
            if osd:
                osd.flash("rec", "osd_rec_hint", REC_OSD_SHOW_S)
        else:
            if self._rec_osd_next is not None and osd:
                osd.hide()
            if self.recorder.proc is None or self.recorder.stopping:
                self._rec_osd_next = None

    def _rec_osd_tick(self):
        """Pallino REC periodico: ogni REC_OSD_EVERY_S secondi di registrazione (le pause non contano)."""
        if self._rec_osd_next is None:
            return
        rec = self.recorder
        if rec.paused or rec.proc is None or rec.stopping:
            return
        if rec.elapsed() >= self._rec_osd_next:
            self._rec_osd_next += REC_OSD_EVERY_S
            osd = self.osd()
            if osd:
                osd.flash("rec", "osd_rec_hint", REC_OSD_SHOW_S)

    def _rec_space_live(self, space, scope):
        """Lo spazio della clip e' davanti, fermo (nessun cambio in corso), senza overlay e scongelato?"""
        with self.lock:
            ok = self.cur_space == space and self.target_space == space and self.slots.get(space) == scope
        if not ok or self.overlay_is_open():
            return False
        with self.freezer.state_lock:
            return scope not in self.freezer.frozen

    def _rec_sync(self):
        """Allinea la clip allo stato degli spazi: avvio in attesa, pausa, ripresa, limite di durata,
        gioco chiuso. Chiamata dal ciclo principale e dagli agganci di spazi e overlay."""
        rec = self.recorder
        if rec.check_exit():
            self._rec_osd(False)
            return
        with rec.lock:
            pending, info, stopping = rec.pending, rec.info, rec.stopping
        if stopping:
            return
        if pending:
            space, scope = pending
            with self.lock:
                still = self.slots.get(space) == scope
            if not still:
                rec.stop("gioco chiuso prima dell'avvio")
                return
            if self._rec_space_live(space, scope):
                wid = self.space_window(space)
                if wid and rec.start(space, scope, wid):
                    self._rec_osd(True)
                else:
                    with rec.lock:
                        rec.pending = None
            return
        if not info:
            return
        with self.lock:
            still = self.slots.get(info["space"]) == info["scope"]
        if not still:
            self.clip_stop("gioco chiuso")
            return
        if rec.elapsed() >= CLIP_MAX_S:
            log("clip: raggiunti %d s" % CLIP_MAX_S)
            self.clip_stop("durata massima")
            return
        live = self._rec_space_live(info["space"], info["scope"])
        if live and rec.paused:
            rec.resume()                     # v3.2.29-dev.9 — alla ripresa nessun messaggio: torna al prossimo multiplo di 30 s
        elif not live and not rec.paused:
            rec.pause()
            self._rec_osd(False)
        elif live:
            self._rec_osd_tick()

    def clip_status(self):
        """Per l'overlay: {"space", "elapsed", "paused", "pending"} della clip, o None."""
        return self.recorder.status()

    def overlay_rec(self, space):
        """Pulsante Rec dell'overlay: ferma la clip di quello spazio se e' in corso (True, False), altrimenti
        la richiede (False, ok): partira' dopo la chiusura dell'overlay, a spazio scongelato."""
        if self.recorder.busy() and self.recorder.recording_space() == space:
            self.clip_stop("overlay")
            return True, True
        return False, self.clip_request(space, "overlay")

    def clip_shutdown(self):
        """Uscita di spaces.py: la clip in corso viene chiusa (il file MP4 resta valido)."""
        with self.recorder.lock:
            p = self.recorder.proc
        if p and p.poll() is None:
            try:
                p.send_signal(signal.SIGINT)
                p.wait(CLIP_STOP_TIMEOUT_S)
            except Exception:
                pass

    def osd(self):
        """v3.2.29-dev.4 — sovrimpressione in alto a destra (overlay.Osd), indipendente dall'overlay degli
        spazi: se overlay.py manca o non si carica, screenshot e clip funzionano senza messaggi a schermo."""
        if not self._osd_tried:
            self._osd_tried = True
            try:
                import overlay as _ov
                self._osd = _ov.Osd(log)
                log("osd: %s" % ("ready" if self._osd.available else "NOT available (Pillow/python-xlib)"))
            except Exception as e:  # noqa
                self._osd = None
                log("osd: module not loadable (%r) -> no on-screen messages" % (e,))
        return self._osd if (self._osd and self._osd.available) else None

    def _screenshot_work(self, wid, key, scope, taken):
        try:
            staging = media_staging_dir()
        except Exception as e:  # noqa
            log("screenshot: cartella di appoggio non disponibile (%r)" % (e,))
            return
        name = "shot-%d-%s.png" % (int(taken * 1000), os.urandom(3).hex())
        out = os.path.join(staging, name)
        osd = self.osd()
        if osd:
            osd.hide(wait=True)              # un messaggio ancora a schermo non deve finire nello scatto
        ok, method, ms, err = capture_window_png(wid, out)
        if not ok:
            log("screenshot di %s fallito: %s" % (scope, err))
            return
        log("screenshot di %s: finestra 0x%x catturata con %s in %d ms" % (scope, wid, method, ms))
        if osd:
            osd.flash("screenshot", "osd_screenshot")
        ok, body = daemon_post("/api/media/screenshot", {"key": key, "file": name, "takenAt": int(taken * 1000)})
        if ok:
            log("screenshot salvato: %s" % body.get("path"))
        else:
            log("screenshot: il demone non l'ha archiviato (%s) — resta in %s" % (body.get("message"), out))

    def _tick(self):
        now = time.time()
        try:
            self._prestart_tick(now)
        except Exception as e:  # noqa
            log("Steam prestart: check failed (%r)" % (e,))
        try:
            self._keep_maximized_tick(now)
        except Exception as e:  # noqa
            log("keep-maximized: check failed (%r)" % (e,))
        try:
            self._rec_sync()
        except Exception as e:  # noqa
            log("clip: check failed (%r)" % (e,))
        try:
            self._space_bg_sync()
        except Exception as e:  # noqa
            log("space background: check failed (%r)" % (e,))
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
            parent = os.path.dirname(self.path)
            if not parent.startswith("/run/user/"):
                os.makedirs(parent, mode=0o700, exist_ok=True)
                os.chmod(parent, 0o700)
            s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            old_umask = os.umask(0o177)          # il socket nasce gia' 0600 (niente finestra fra bind e chmod)
            try:
                s.bind(self.path)
            finally:
                os.umask(old_umask)
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
def _input_blocks():
    try:
        return open(os.environ.get("XL_SPACES_TEST_INPUT_DEVICES", "/proc/bus/input/devices")).read().strip().split("\n\n")
    except Exception:
        return []


def list_pads():
    """Controller riconosciuti dal kernel (hanno un handler jsN): [(nome, /dev/input/eventN)].
    v3.2.29-dev.5 — in piu', marcati come ("nome", percorso, "share"), i device "tastiera" dello stesso
    controller (stesso Uniq, o stesso Phys se l'Uniq manca) che portano il tasto Share (KEY_F12 di
    xpadneo): letti solo per quel tasto, mai presi in esclusiva."""
    pads, uniqs, shares = [], set(), []
    for b in _input_blocks():
        name = re.search(r'N: Name="(.*)"', b)
        hand = re.search(r"H: Handlers=(.*)", b)
        if not hand:
            continue
        uniq = (re.search(r"U: Uniq=(.*)", b) or [None, ""])[1].strip()
        phys = (re.search(r"P: Phys=(.*)", b) or [None, ""])[1].strip()
        toks = hand.group(1).split()
        ev = [t for t in toks if re.fullmatch(r"event\d+", t)]
        if not ev:
            continue
        label = name.group(1) if name else "?"
        if any(re.fullmatch(r"js\d+", t) for t in toks):
            pads.append((label, "/dev/input/" + ev[0]))
            uniqs.add(uniq or ("phys:" + phys))
        elif "kbd" in toks and re.search(r"keyboard", label, re.I):
            shares.append((label, "/dev/input/" + ev[0], uniq or ("phys:" + phys)))
    pads += [(n, p, "share") for n, p, u in shares if u and u in uniqs]
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
        self.hat_y = 0                      # v3.2.29-dev.3 — D-pad verticale (conta per "tasti rilasciati")
        self.share_fds = set()              # v3.2.29-dev.5 — device letti solo per il tasto Share
        self.share_down = None              # istante della pressione di Share, se premuto
        self.share_hold_fired = False
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
        self.grab_lock = threading.RLock()  # v3.2.6-dev.2 — presa/rilascio da piu' thread (pad, overlay)

    def _reset(self):
        self.sel = self.l1 = self.r1 = False
        self.hat = 0
        self.hat_y = 0
        self.share_down = None
        self.share_hold_fired = False
        self.wake_latched = False
        self.pressed.clear()
        self.stick = {ABS_X: 0, ABS_Y: 0}
        self.rep_action = None

    def _rescan(self):
        pads = list_pads()
        paths = {e[1] for e in pads}
        for fd, (n, p) in list(self.fds.items()):
            if p not in paths:
                log("controller scollegato: %s" % n)
                self._close(fd)
        have = {p for _, p in self.fds.values()}
        for entry in pads:
            n, p = entry[0], entry[1]
            share_only = len(entry) > 2 and entry[2] == "share"
            if p in have:
                continue
            try:
                fd = os.open(p, os.O_RDONLY | os.O_NONBLOCK)
            except OSError as e:
                log("controller %s (%s): impossibile aprire il device: %s" % (n, p, e))
                continue
            self.fds[fd] = (n, p)
            if share_only:
                self.share_fds.add(fd)
            log("controller collegato: %s (%s)%s" % (n, p, " — solo il tasto Share" if share_only else ""))

    def _close(self, fd):
        try:
            os.close(fd)
        except OSError:
            pass
        self.fds.pop(fd, None)
        self.share_fds.discard(fd)
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

    # ----- v3.2.29-dev.5 — tasto Share: breve = screenshot, tenuto = clip (step 2b)
    def _share(self, value):
        now = time.time()
        if value == 1:
            if self.share_down is None:
                self.share_down, self.share_hold_fired = now, False
        elif value == 0 and self.share_down is not None:
            held = now - self.share_down
            fired = self.share_hold_fired
            self.share_down, self.share_hold_fired = None, False
            if not fired and held < SHARE_HOLD_S and not self.mgr.overlay_is_open():
                self.mgr.share_short()

    def _share_tick(self):
        if self.share_down is not None and not self.share_hold_fired and time.time() - self.share_down >= SHARE_HOLD_S:
            self.share_hold_fired = True
            if not self.mgr.overlay_is_open():
                self.mgr.share_hold()

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
        with self.grab_lock:
            if on:
                self.grab_wanted, self.release_since = True, None
                self.grab_failed = False    # one attempt per opening (no retry loop on errors)
            else:
                self.grab_wanted, self.release_since = False, time.time()
            self._grab_tick_locked()

    def _all_up(self):
        return not self.pressed and self.hat == 0 and self.hat_y == 0

    def _do_grab(self, on):
        failed = None
        for fd in list(self.fds):
            if fd in self.share_fds:
                continue                    # v3.2.29-dev.5 — il device "tastiera" del tasto Share mai in esclusiva
            try:
                self._ioctl(fd, EVIOCGRAB, 1 if on else 0)
            except OSError as e:
                failed = e
        self.grabbed = bool(on and self.fds and failed is None)
        if on and failed is not None:
            self.grab_failed = True
        log("overlay: pad %s%s" % ("grabbed" if on else "released", (" (failed: %s)" % failed) if failed else ""))

    def _grab_tick(self):
        with self.grab_lock:
            self._grab_tick_locked()

    def _grab_tick_locked(self):
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
        if fd is not None and fd in self.share_fds:
            # device "tastiera" del controller: conta solo Share (KEY_F12), tutto il resto e' ignorato
            if t == EV_KEY and code in SHARE_KEYS and value in (0, 1):
                self._share(value)
            return
        if t == EV_KEY and code == KEY_RECORD and value in (0, 1):
            self._share(value)             # Share sul pad stesso (driver xpad)
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
        elif t == EV_ABS and code == ABS_HAT0Y:
            self.hat_y = value
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
            fast = bool(self.rep_action or self.release_since is not None or (self.grab_wanted and not self.grabbed)
                        or self.share_down is not None)
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
                self._share_tick()
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
    log("congelamento della Dashboard fuori dallo spazio 0: %s (ritardo %.1f s)" % (
        "ATTIVO" if (mgr.freezer.enabled and mgr.freezer.dashboard_enabled) else "disattivato", DASHBOARD_FREEZE_DELAY_S))
    log("overlay degli spazi (X_LAUNCHER_SPACES_OVERLAY): %s" % ("ATTIVO" if mgr.overlay_on else "disattivato"))
    mgr.init_overlay()

    def _cleanup():
        try:
            mgr.clip_shutdown()              # v3.2.29-dev.6 — la clip in corso resta un MP4 valido
        except Exception:
            pass
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
