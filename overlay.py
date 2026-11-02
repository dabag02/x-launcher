#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
overlay.py — Overlay degli spazi e dei servizi (v2.7.2-dev.1, Step 21, Fase 6).

Una "app" Python in primo piano sopra qualunque gioco, per la sessione Openbox
"Shell". Viene ospitata da spaces.py (stesso processo: ha gia' il pad da evdev, i
desktop e il freezer) e importata solo se serve: se questo file manca o si rompe,
spaces.py continua a funzionare con il cambio di spazio diretto di sempre.

Come sta sopra un gioco a schermo intero (provato in Openbox): una finestra
GESTITA dal WM resta sotto il gioco in primo piano se non ha il focus; una
finestra override-redirect (non gestita) sta sopra a tutto senza prendere il
focus. L'overlay e' quindi una finestra override-redirect disegnata con Pillow
(nessuna dipendenza nuova: il venv del tray ha gia' pillow e python-xlib).

Controller (letto da spaces.py, qui arrivano solo azioni gia' interpretate):
    D-pad / levetta sinistra  sposta (sinistra/destra tra gli spazi, su = servizi,
                              giu' = di nuovo agli spazi)
    A    conferma lo spazio scelto / attiva il servizio (su - e + regola il volume,
         tenuto premuto si ripete)
    B    annulla e chiude l'overlay (il gioco riprende)

Quando si apre, il gioco dello spazio corrente viene congelato (cgroup freezer) e il
pad viene "preso" in esclusiva (EVIOCGRAB) finche' l'overlay e' aperto, cosi' il gioco
non riceve ne' i tasti dell'overlay ne' eventi accodati. Alla chiusura il pad viene
rilasciato solo quando nessun tasto e' premuto (niente tasti "incollati" nel gioco).

Servizi: volume (wpctl o pactl) funzionante; Bluetooth, Wi-Fi e LAN mostrano lo stato
(bluetoothctl, nmcli, in ripiego /sys/class/net). Sono gia' predisposti come pulsanti:
si abilitano con X_LAUNCHER_OVERLAY_TOGGLES=bt,wifi,lan (default: nessuno).

Variabili:
    X_LAUNCHER_OVERLAY_TOGGLES=bt,wifi,lan   servizi attivabili con A (default vuoto)
    X_LAUNCHER_OVERLAY_GRAB=0                non prendere il pad in esclusiva
    X_LAUNCHER_OVERLAY_IDLE_S=60             chiusura automatica senza input
    X_LAUNCHER_OVERLAY_FONT=/percorso.ttf    font da usare
    XL_OVERLAY_DUMP=/percorso.png            (test) salva ogni fotogramma disegnato
"""
import json
import os
import queue
import re
import shutil
import subprocess
import threading
import time

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
    HAVE_PIL = True
    PIL_ERR = ""
except Exception as _e:  # noqa
    HAVE_PIL = False
    PIL_ERR = str(_e)

try:
    from Xlib import X, display
    HAVE_XLIB = True
except Exception as _e:  # noqa
    HAVE_XLIB = False

IDLE_S = float(os.environ.get("X_LAUNCHER_OVERLAY_IDLE_S", "60"))
SHOW_TIMEOUT_S = 1.5
VOL_STEP = 5
VOL_REPEAT_DELAY_S = 0.45
VOL_REPEAT_EVERY_S = 0.12
SERVICE_REFRESH_S = 3.0

# ordine di navigazione della riga dei servizi
ITEMS = ["bt", "wifi", "lan", "vminus", "vol", "vplus"]

BG = (13, 17, 23)
PANEL = (22, 27, 34)
CARD_SEL = (31, 38, 48)
LINE = (45, 54, 68)
TEXT = (240, 243, 246)
MUTED = (163, 173, 187)
ACCENT = (94, 194, 255)
ACCENT_INK = (6, 18, 28)
GREEN = (74, 222, 128)
GREY = (107, 118, 134)
AMBER = (255, 180, 84)
# Same colours as the Dashboard footer legend (Tailwind green-500 / red-500, black glyph).
BTN_A = (34, 197, 94)
BTN_B = (239, 68, 68)
BTN_INK = (0, 0, 0)

STR = {
    "it": {
        "title": "Spazi", "space": "SPAZIO", "here": "Dove sei ora", "open": "A · Apri",
        "choose": "Scegli", "confirm": "Apri", "cancel": "Annulla", "services": "Servizi",
        "move": "Sposta", "activate": "Attiva", "adjust": "Regola", "spaces": "Spazi",
        "bt": "Bluetooth", "wifi": "Wi-Fi", "lan": "LAN", "volume": "Volume", "muted": "Muto",
        "on": "Acceso", "off": "Spento", "na": "Non disponibile", "conn": "Collegata",
        "disc": "Scollegata", "notconn": "Non collegato", "dash": "Dashboard", "game": "Gioco",
        "readonly": "Solo stato: non attivabile", "noaudio": "Audio non disponibile",
        "btpad": "Il controller in uso è Bluetooth: non lo spengo", "failed": "Operazione non riuscita",
    },
    "en": {
        "title": "Spaces", "space": "SPACE", "here": "You are here", "open": "A · Open",
        "choose": "Select", "confirm": "Open", "cancel": "Cancel", "services": "Services",
        "move": "Move", "activate": "Toggle", "adjust": "Adjust", "spaces": "Spaces",
        "bt": "Bluetooth", "wifi": "Wi-Fi", "lan": "LAN", "volume": "Volume", "muted": "Muted",
        "on": "On", "off": "Off", "na": "Not available", "conn": "Connected",
        "disc": "Disconnected", "notconn": "Not connected", "dash": "Dashboard", "game": "Game",
        "readonly": "Status only: not switchable", "noaudio": "Audio not available",
        "btpad": "The controller in use is Bluetooth: not turning it off", "failed": "Operation failed",
    },
}


def _app_conf_path():
    return os.environ.get("X_LAUNCHER_APP_CONF") or os.path.join(
        os.path.expanduser("~"), ".local", "share", "x-launcher", "app.conf")


def _conf_language():
    """Language chosen in the Dashboard (app.conf `language=`), or None."""
    try:
        with open(_app_conf_path(), "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("language="):
                    v = line.split("=", 1)[1].strip().lower()
                    if v:
                        return v
    except Exception:
        pass
    return None


def _lang():
    """Same language as the Dashboard (app.conf is rewritten when it changes it);
    environment variables are only a fallback when app.conf has no language."""
    v = _conf_language()
    if v:
        return v
    for var in ("X_LAUNCHER_LANG", "LC_ALL", "LC_MESSAGES", "LANG"):
        v = (os.environ.get(var) or "").lower()
        if v:
            return v.replace("_", "-").split(".")[0]
    return "en"


def _locale_dirs():
    here = os.path.dirname(os.path.abspath(__file__))
    dirs = []
    env = os.environ.get("X_LAUNCHER_LOCALES")
    if env:
        dirs.append(env)
    dirs += [os.path.join(here, "dist", "locales"), os.path.join(here, "public", "locales")]
    return dirs


def load_strings(lang, log=None):
    """Strings for `lang`: built-in it/en, overridden/extended by
    <locales>/<lang>/overlay.json (same drop-in folders as the Dashboard translations,
    so a new language needs only that file). Missing keys fall back to Italian (project reference language)."""
    base = lang.replace("_", "-").lower()
    short = base.split("-")[0]
    out = dict(STR["it"])
    for cand in ((short,) if base == short else (short, base)):
        if cand in STR:
            out.update(STR[cand])
        for d in _locale_dirs():
            fp = os.path.join(d, cand, "overlay.json")
            try:
                with open(fp, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if isinstance(data, dict):
                    out.update({k: v for k, v in data.items() if isinstance(v, str)})
                break
            except FileNotFoundError:
                continue
            except Exception as e:
                if log:
                    log("overlay: cannot read %s (%s)" % (fp, e))
    return out


# --------------------------------------------------------------------------- servizi di sistema
class Services:
    """Stato e azioni di volume, Bluetooth, Wi-Fi e LAN. Tutto con timeout e mai bloccante
    per chi chiama: le letture girano in un thread a parte e l'overlay legge una cache."""

    def __init__(self, log, bt_pad_in_use=None):
        self.log = log
        self.bt_pad_in_use = bt_pad_in_use or (lambda: False)
        self.lock = threading.Lock()
        self.version = 0
        self.data = {
            "volume": {"available": False, "percent": 0, "muted": False},
            "bt": {"available": False, "on": False},
            "wifi": {"available": False, "on": False, "ssid": "", "up": False},
            "lan": {"available": False, "up": False},
        }
        self.toggles = {t.strip() for t in os.environ.get("X_LAUNCHER_OVERLAY_TOGGLES", "").split(",") if t.strip()}
        self.audio = "wpctl" if shutil.which("wpctl") else ("pactl" if shutil.which("pactl") else "")
        self.has_bt = bool(shutil.which("bluetoothctl"))
        self.has_nm = bool(shutil.which("nmcli"))
        self._logged = set()
        self._refreshing = False
        self._vol_target = None
        self._vol_thread = None
        self.log("services: audio=%s bluetoothctl=%s nmcli=%s toggles=%s"
                 % (self.audio or "none", self.has_bt, self.has_nm, sorted(self.toggles) or "none"))

    # ----- esecuzione comandi
    def _run(self, key, cmd, timeout=2.5):
        env = dict(os.environ)
        env["LC_ALL"] = "C"
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
            rc, out = r.returncode, (r.stdout or "")
        except Exception as e:  # noqa
            rc, out = -1, ""
            if key not in self._logged:
                self._logged.add(key)
                self.log("services: %s failed to run: %s" % (cmd[0], e))
            return rc, out
        if key not in self._logged:                 # primo uso: output grezzo nel log
            self._logged.add(key)
            self.log("services: first run of %r -> rc=%d out=%r" % (" ".join(cmd), rc, out[:300]))
        return rc, out

    # ----- volume
    def _vol_read(self):
        if self.audio == "wpctl":
            rc, out = self._run("wpctl-get", ["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"])
            m = re.search(r"Volume:\s*([\d.]+)", out)
            if rc == 0 and m:
                return True, int(round(float(m.group(1)) * 100)), "[MUTED]" in out
        elif self.audio == "pactl":
            rc, out = self._run("pactl-get", ["pactl", "get-sink-volume", "@DEFAULT_SINK@"])
            m = re.search(r"(\d+)%", out)
            if rc == 0 and m:
                rc2, out2 = self._run("pactl-mute", ["pactl", "get-sink-mute", "@DEFAULT_SINK@"])
                return True, int(m.group(1)), bool(re.search(r"yes", out2, re.I))
        return False, 0, False

    def _vol_write(self, percent):
        percent = max(0, min(100, int(percent)))
        if self.audio == "wpctl":
            rc, _ = self._run("wpctl-set", ["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "%.2f" % (percent / 100.0)])
        elif self.audio == "pactl":
            rc, _ = self._run("pactl-set", ["pactl", "set-sink-volume", "@DEFAULT_SINK@", "%d%%" % percent])
        else:
            return False
        return rc == 0

    def volume_step_async(self, delta):
        """Cambia il volume di delta punti. La cache si aggiorna subito (l'overlay risponde
        al volo) e le scritture sono coalescenti: contano solo l'ultimo valore richiesto."""
        with self.lock:
            v = self.data["volume"]
            if not v["available"]:
                return False
            base = self._vol_target if self._vol_target is not None else v["percent"]
            new = max(0, min(100, base + delta)) if not (base > 100 and delta > 0) else base
            self._vol_target = new
            v["percent"] = new
            self.version += 1
            if self._vol_thread is None or not self._vol_thread.is_alive():
                self._vol_thread = threading.Thread(target=self._vol_worker, daemon=True)
                self._vol_thread.start()
        return True

    def _vol_worker(self):
        while True:
            with self.lock:
                tgt = self._vol_target
                self._vol_target = None
            if tgt is None:
                return
            ok = self._vol_write(tgt)
            if not ok:
                self.log("services: volume write failed (%s)" % self.audio)
                self.refresh()
                return

    def toggle_mute(self):
        with self.lock:
            if not self.data["volume"]["available"]:
                return False
            self.data["volume"]["muted"] = not self.data["volume"]["muted"]
            self.version += 1
        if self.audio == "wpctl":
            self._run("wpctl-mute", ["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"])
        else:
            self._run("pactl-mute-set", ["pactl", "set-sink-mute", "@DEFAULT_SINK@", "toggle"])
        threading.Thread(target=self.refresh, daemon=True).start()
        return True

    # ----- Bluetooth
    def _bt_read(self):
        if not self.has_bt:
            return False, False
        rc, out = self._run("bt-show", ["bluetoothctl", "show"])
        m = re.search(r"Powered:\s*(yes|no)", out)
        if rc == 0 and m:
            return True, m.group(1) == "yes"
        return False, False

    # ----- rete
    def _net_read(self):
        wifi = {"available": False, "on": False, "ssid": "", "up": False}
        lan = {"available": False, "up": False}
        if self.has_nm:
            rc, out = self._run("nm-dev", ["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status"])
            if rc == 0:
                for line in out.splitlines():
                    parts = re.split(r"(?<!\\):", line)
                    if len(parts) < 3:
                        continue
                    typ, state = parts[1], parts[2]
                    conn = parts[3].replace("\\:", ":") if len(parts) > 3 else ""
                    if typ == "wifi":
                        wifi["available"] = True
                        if state == "connected":
                            wifi["up"] = True
                            wifi["ssid"] = conn
                    elif typ == "ethernet":
                        lan["available"] = True
                        if state == "connected":
                            lan["up"] = True
                if wifi["available"]:
                    rc2, out2 = self._run("nm-radio", ["nmcli", "radio", "wifi"])
                    wifi["on"] = out2.strip() == "enabled" if rc2 == 0 else wifi["up"]
                return wifi, lan
        # ripiego senza NetworkManager: sola lettura da sysfs
        try:
            for name in sorted(os.listdir("/sys/class/net")):
                if name == "lo":
                    continue
                base = "/sys/class/net/" + name
                try:
                    up = open(base + "/operstate").read().strip() == "up"
                except OSError:
                    continue
                if os.path.isdir(base + "/wireless"):
                    wifi["available"] = True
                    wifi["up"] = wifi["up"] or up
                    wifi["on"] = wifi["on"] or up
                elif os.path.exists(base + "/device") and not name.startswith(("veth", "docker", "br-", "virbr", "tun", "tap")):
                    lan["available"] = True
                    lan["up"] = lan["up"] or up
        except OSError:
            pass
        return wifi, lan

    # ----- aggiornamento della cache
    def refresh(self):
        try:
            vok, vpct, vmute = self._vol_read() if self.audio else (False, 0, False)
            bok, bon = self._bt_read()
            wifi, lan = self._net_read()
        except Exception as e:  # noqa
            self.log("services: refresh failed: %s" % e)
            return
        with self.lock:
            if self._vol_target is None:        # non sovrascrivere un valore in scrittura
                self.data["volume"] = {"available": vok, "percent": vpct, "muted": vmute}
            self.data["bt"] = {"available": bok, "on": bon}
            self.data["wifi"] = wifi
            self.data["lan"] = lan
            self.version += 1

    def refresh_async(self):
        with self.lock:
            if self._refreshing:
                return
            self._refreshing = True

        def work():
            try:
                self.refresh()
            finally:
                with self.lock:
                    self._refreshing = False
        threading.Thread(target=work, daemon=True).start()

    def snapshot(self):
        with self.lock:
            return {k: dict(v) for k, v in self.data.items()}, self.version

    # ----- pulsanti (predisposti; attivi solo se abilitati)
    def activate(self, name):
        """Ritorna una chiave di messaggio per il toast, oppure None."""
        if name not in self.toggles:
            return "readonly"
        snap, _ = self.snapshot()
        ok = False
        if name == "bt":
            if not snap["bt"]["available"]:
                return "na"
            turn_on = not snap["bt"]["on"]
            if not turn_on and self.bt_pad_in_use():
                return "btpad"
            rc, _ = self._run("bt-power", ["bluetoothctl", "power", "on" if turn_on else "off"], 5.0)
            ok = rc == 0
        elif name == "wifi":
            if not (self.has_nm and snap["wifi"]["available"]):
                return "na"
            rc, _ = self._run("nm-radio-set", ["nmcli", "radio", "wifi", "off" if snap["wifi"]["on"] else "on"], 5.0)
            ok = rc == 0
        elif name == "lan":
            if not (self.has_nm and snap["lan"]["available"]):
                return "na"
            rc, out = self._run("nm-dev2", ["nmcli", "-t", "-f", "DEVICE,TYPE", "device", "status"])
            devs = [l.split(":")[0] for l in out.splitlines() if l.endswith(":ethernet")]
            verb = "disconnect" if snap["lan"]["up"] else "connect"
            ok = bool(devs)
            for dev in devs:
                rc, _ = self._run("nm-lan-set", ["nmcli", "device", verb, dev], 8.0)
                ok = ok and rc == 0
        self.refresh_async()
        return None if ok else "failed"


# --------------------------------------------------------------------------- disegno
def _find_font_path(bold):
    env = os.environ.get("X_LAUNCHER_OVERLAY_FONT")
    if env and os.path.exists(env):
        return env
    try:
        r = subprocess.run(["fc-match", "-f", "%{file}", "sans:bold" if bold else "sans"],
                           capture_output=True, text=True, timeout=2.0)
        p = (r.stdout or "").strip()
        if p and os.path.exists(p):
            return p
    except Exception:
        pass
    for p in ("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/TTF/DejaVuSans.ttf",
              "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(p):
            return p
    return None


class Renderer:
    """Disegna la schermata (variante B: schermo intero) con Pillow, in coordinate 1280x720
    scalate alla risoluzione reale del monitor."""

    def __init__(self, strings):
        self.t = strings
        self._fonts = {}
        self._art_cache = {}     # (path, mtime, w, h) -> RGB crop, a few entries (covers stay in memory)
        self._masks = {}
        self._paths = {}

    def font(self, size, bold=False):
        key = (size, bold)
        f = self._fonts.get(key)
        if f is None:
            if bold not in self._paths:
                self._paths[bold] = _find_font_path(bold)
            p = self._paths[bold]
            try:
                f = ImageFont.truetype(p, size) if p else ImageFont.load_default(size)
            except Exception:
                f = ImageFont.load_default()
            self._fonts[key] = f
        return f

    # ----- primitive
    @staticmethod
    def tsize(d, text, font):
        l, t, r, b = d.textbbox((0, 0), text, font=font)
        return r - l, b - t, l, t

    def text(self, d, x, y, text, size, color, bold=False, anchor="l", maxw=None):
        font = self.font(size, bold)
        if maxw is not None:
            while len(text) > 1 and self.tsize(d, text, font)[0] > maxw:
                text = text[:-2].rstrip() + "…" if not text.endswith("…") else text[:-2] + "…"
        w, h, l, t = self.tsize(d, text, font)
        if anchor == "m":
            x = x - w // 2
        elif anchor == "r":
            x = x - w
        d.text((x - l, y - t), text, font=font, fill=color)
        return w, h

    def text_vc(self, d, x, cy, text, size, color, bold=False, anchor="l", maxw=None):
        """Like text() but `cy` is the vertical centre of the capital letters (optical centre
        of a label), independent of descenders; used for glyphs inside circles and pills."""
        font = self.font(size, bold)
        if maxw is not None:
            while len(text) > 1 and self.tsize(d, text, font)[0] > maxw:
                text = text[:-2].rstrip() + "…" if not text.endswith("…") else text[:-2] + "…"
        l, t, r, b = d.textbbox((0, 0), "H", font=font)
        w, _h, tl, _tt = self.tsize(d, text, font)
        if anchor == "m":
            x = x - w // 2
        elif anchor == "r":
            x = x - w
        d.text((x - tl, cy - (t + b) / 2.0), text, font=font, fill=color)
        return w

    def art(self, e, w, h):
        """Cached artwork of a game cropped to w x h, or None (-> initials).
        X_LAUNCHER_OVERLAY_ART: auto (hero banner, else the poster cropped) | hero | cover | off."""
        mode = (os.environ.get("X_LAUNCHER_OVERLAY_ART") or "auto").strip().lower()
        if mode == "off" or w < 8 or h < 8:
            return None
        order = {"hero": ("hero",), "cover": ("cover",)}.get(mode, ("hero", "cover"))
        for kind in order:
            path = e.get(kind)
            if not path:
                continue
            try:
                key = (path, os.path.getmtime(path), w, h)
            except OSError:
                continue
            im = self._art_cache.get(key)
            if im is None:
                try:
                    with Image.open(path) as src:
                        src = src.convert("RGB")
                    # banner: centred; poster: keep the upper part (logo/characters), where covers carry the subject
                    im = ImageOps.fit(src, (w, h), method=Image.LANCZOS,
                                      centering=(0.5, 0.5 if kind == "hero" else 0.25))
                except Exception:
                    im = False       # unreadable file: remember it, fall back to initials
                if len(self._art_cache) >= 12:
                    self._art_cache.pop(next(iter(self._art_cache)))
                self._art_cache[key] = im
            if im:
                return im
        return None

    def paste_rounded(self, img, im, box, r):
        key = (im.size, r)
        mask = self._masks.get(key)
        if mask is None:
            mask = Image.new("L", im.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.size[0] - 1, im.size[1] - 1), radius=r, fill=255)
            self._masks[key] = mask
        img.paste(im, (box[0], box[1]), mask)

    @staticmethod
    def rrect(d, box, r, fill=None, outline=None, width=1):
        d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

    # ----- icone (griglia 24, centrate in cx, cy con lato side)
    def icon(self, d, kind, cx, cy, side, color, lw):
        u = side / 24.0
        ox, oy = cx - side / 2.0, cy - side / 2.0

        def P(x, y):
            return (ox + x * u, oy + y * u)
        if kind == "bt":
            pts = [P(7, 7), P(17, 17), P(12, 22), P(12, 2), P(17, 7), P(7, 17)]
            d.line(pts, fill=color, width=lw, joint="curve")
        elif kind == "wifi":
            for rad, a in ((13, 40), (9, 40), (5, 40)):
                bb = [P(12 - rad, 19 - rad)[0], P(12 - rad, 19 - rad)[1], P(12 + rad, 19 + rad)[0], P(12 + rad, 19 + rad)[1]]
                d.arc(bb, 270 - a, 270 + a, fill=color, width=lw)
            x, y = P(12, 19.5)
            d.ellipse([x - lw, y - lw, x + lw, y + lw], fill=color)
        elif kind == "lan":
            for (x0, y0, x1, y1) in ((9, 3, 15, 8), (3, 16, 9, 21), (15, 16, 21, 21)):
                a, b = P(x0, y0), P(x1, y1)
                d.rounded_rectangle([a[0], a[1], b[0], b[1]], radius=int(u), outline=color, width=lw)
            d.line([P(12, 8), P(12, 12)], fill=color, width=lw)
            d.line([P(6, 16), P(6, 12), P(18, 12), P(18, 16)], fill=color, width=lw, joint="curve")
        elif kind == "minus":
            d.line([P(5, 12), P(19, 12)], fill=color, width=lw)
        elif kind == "plus":
            d.line([P(5, 12), P(19, 12)], fill=color, width=lw)
            d.line([P(12, 5), P(12, 19)], fill=color, width=lw)

    def arrow(self, d, direction, cx, cy, size, color):
        h = size / 2.0
        if direction == "l":
            pts = [(cx + h * 0.6, cy - h), (cx - h * 0.8, cy), (cx + h * 0.6, cy + h)]
        elif direction == "r":
            pts = [(cx - h * 0.6, cy - h), (cx + h * 0.8, cy), (cx - h * 0.6, cy + h)]
        elif direction == "u":
            pts = [(cx - h, cy + h * 0.6), (cx, cy - h * 0.8), (cx + h, cy + h * 0.6)]
        else:
            pts = [(cx - h, cy - h * 0.6), (cx, cy + h * 0.8), (cx + h, cy - h * 0.6)]
        d.polygon(pts, fill=color)

    # ----- schermata
    def render(self, W, H, model):
        t = self.t
        s = W / 1280.0

        def S(v):
            return int(round(v * s))
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        zone, sel, svc_i = model["zone"], model["sel"], model["svc"]
        entries, snap = model["entries"], model["services"]

        # titolo
        self.text(d, S(56), S(30), t["title"], S(30), TEXT, True)

        # ---- servizi in alto a destra
        tw, th, gap = S(138), S(50), S(8)
        vb = S(50)
        vw = S(68)
        total = 3 * tw + 2 * vb + vw + 5 * gap
        x = W - S(48) - total
        y = S(28)
        pos = {}

        def focus_box(i, x0, x1):
            on = zone == "services" and ITEMS[svc_i] == i
            return (ACCENT, S(4)) if on else (LINE, max(2, S(2)))

        def status_color(avail, on):
            return GREY if not avail else (GREEN if on else MUTED)

        # tile bt / wifi / lan
        tiles = [
            ("bt", "bt", snap["bt"]["available"], snap["bt"]["on"],
             t["on"] if snap["bt"]["on"] else t["off"]),
            ("wifi", "wifi", snap["wifi"]["available"], snap["wifi"]["on"] and snap["wifi"]["up"],
             (snap["wifi"]["ssid"] or t["conn"]) if snap["wifi"]["up"] else (t["off"] if not snap["wifi"]["on"] else t["notconn"])),
            ("lan", "lan", snap["lan"]["available"], snap["lan"]["up"],
             t["conn"] if snap["lan"]["up"] else t["disc"]),
        ]
        for key, ico, avail, on, label in tiles:
            col, bw = focus_box(key, x, x + tw)
            self.rrect(d, (x, y, x + tw, y + th), S(16), fill=PANEL, outline=col, width=bw)
            icol = TEXT if (avail and on) else (MUTED if avail else GREY)
            self.icon(d, ico, x + S(12) + S(11), y + th // 2, S(22), icol, max(2, S(2)))
            if not avail:
                label = t["na"]
            self.text(d, x + S(43), y + S(9), t[key], S(13), TEXT if avail else MUTED, True, maxw=tw - S(62))
            self.text(d, x + S(43), y + S(28), label, S(11), MUTED, False, maxw=tw - S(52))
            dc = status_color(avail, on)
            d.ellipse([x + tw - S(16), y + S(8), x + tw - S(9), y + S(15)], fill=dc)
            pos[key] = (x, y)
            x += tw + gap
        # volume - / valore / +
        vol = snap["volume"]
        for key, ico in (("vminus", "minus"),):
            col, bw = focus_box(key, x, x + vb)
            self.rrect(d, (x, y, x + vb, y + th), S(16), fill=PANEL, outline=col, width=bw)
            self.icon(d, ico, x + vb // 2, y + th // 2, S(22), TEXT if vol["available"] else GREY, max(2, S(2)))
            x += vb + gap
        col, bw = focus_box("vol", x, x + vw)
        self.rrect(d, (x, y, x + vw, y + th), S(16), fill=PANEL, outline=col, width=bw)
        if vol["available"]:
            label = ("%d%%" % vol["percent"]) if not vol["muted"] else t["muted"]
            self.text(d, x + vw // 2, y + S(8), label, S(20) if not vol["muted"] else S(15), TEXT if not vol["muted"] else AMBER, True, "m", maxw=vw - S(8))
        else:
            self.text(d, x + vw // 2, y + S(8), "--", S(20), GREY, True, "m")
        self.text(d, x + vw // 2, y + S(32), t["volume"], S(10), MUTED, False, "m", maxw=vw - S(6))
        x += vw + gap
        col, bw = focus_box("vplus", x, x + vb)
        self.rrect(d, (x, y, x + vb, y + th), S(16), fill=PANEL, outline=col, width=bw)
        self.icon(d, "plus", x + vb // 2, y + th // 2, S(22), TEXT if vol["available"] else GREY, max(2, S(2)))

        # ---- carte degli spazi
        n = max(1, len(entries))
        gapc = S(36)
        sel_w, sel_h = S(372), S(408)
        oth_w = min(S(300), (W - S(96) - sel_w - gapc * (n - 1)) // max(1, n - 1)) if n > 1 else S(300)
        oth_h = int(oth_w * 330 / 300)
        total_w = (sel_w + (n - 1) * oth_w + (n - 1) * gapc) if n > 0 else sel_w
        cx = (W - total_w) // 2
        area_top, area_bot = S(130), H - S(96)
        cy_mid = (area_top + area_bot) // 2
        for i, e in enumerate(entries):
            is_sel = i == sel
            cw, ch = (sel_w, sel_h) if is_sel else (oth_w, oth_h)
            cy = cy_mid - ch // 2
            border = ACCENT if (is_sel and zone == "spaces") else (LINE if not is_sel else (ACCENT if zone == "spaces" else MUTED))
            bw = S(5) if is_sel else max(2, S(2))
            self.rrect(d, (cx, cy, cx + cw, cy + ch), S(26 if is_sel else 22), fill=CARD_SEL if is_sel else PANEL, outline=border, width=bw)
            pad = S(18 if is_sel else 16)
            art_h = int(ch * (236.0 / 408 if is_sel else 190.0 / 330))
            art = (cx + pad, cy + pad, cx + cw - pad, cy + pad + art_h)
            self.rrect(d, art, S(16 if is_sel else 14), fill=e["color"])
            pic = self.art(e, art[2] - art[0], art[3] - art[1])
            if pic is not None:
                self.paste_rounded(img, pic, art, S(16 if is_sel else 14))
            else:
                self.text(d, (art[0] + art[2]) // 2, (art[1] + art[3]) // 2 - S(34 if is_sel else 26), e["initials"], S(72 if is_sel else 56), e["ink"], True, "m")
            if e.get("current"):
                tag = t["here"]
                tw2 = self.tsize(d, tag, self.font(S(13), True))[0]
                self.rrect(d, (art[0] + S(10), art[1] + S(10), art[0] + S(10) + tw2 + S(20), art[1] + S(10) + S(26)), S(10), fill=LINE)
                self.text_vc(d, art[0] + S(20), art[1] + S(10) + S(13), tag, S(13), TEXT, True)
            ty = art[3] + S(14)
            self.text(d, cx + pad, ty, "%s %d" % (t["space"], e["space"]), S(14), MUTED, True)
            self.text(d, cx + pad, ty + S(22), e["title"], S(30 if is_sel else 24), TEXT, True, maxw=cw - 2 * pad)
            cx += cw + gapc

        # ---- toast
        if model.get("toast"):
            self.rrect(d, (W // 2 - S(260), H - S(150), W // 2 + S(260), H - S(108)), S(14), fill=PANEL, outline=AMBER, width=max(2, S(2)))
            self.text(d, W // 2, H - S(139), model["toast"], S(17), AMBER, True, "m", maxw=S(500))

        # ---- suggerimenti dei tasti
        hy = H - S(64)
        if zone == "spaces":
            items = [("lr", t["choose"]), ("A", t["confirm"]), ("B", t["cancel"]), ("u", t["services"])]
        else:
            items = [("lr", t["move"]), ("A", t["activate"] if ITEMS[svc_i] in ("bt", "wifi", "lan", "vol") else t["adjust"]), ("B", t["cancel"]), ("d", t["spaces"])]
        cd = S(28)  # circle diameter, like the Dashboard footer hints
        fs = S(14)
        widths = []
        for k, label in items:
            label = label.upper()
            lw = self.tsize(d, label, self.font(fs))[0]
            kw = S(50) if k == "lr" else cd
            widths.append((kw, lw, label))
        totalh = sum(kw + S(10) + lw for kw, lw, _l in widths) + S(32) * (len(items) - 1)
        hx = (W - totalh) // 2
        cy = hy + cd // 2
        for (k, _label), (kw, lw, label) in zip(items, widths):
            if k in ("A", "B"):
                d.ellipse((hx, hy, hx + kw, hy + cd), fill=BTN_A if k == "A" else BTN_B)
            else:
                self.rrect(d, (hx, hy, hx + kw, hy + cd), cd // 2, fill=LINE)
            mid = hx + kw // 2
            if k == "lr":
                self.arrow(d, "l", mid - S(10), cy, S(9), TEXT)
                self.arrow(d, "r", mid + S(10), cy, S(9), TEXT)
            elif k in ("u", "d"):
                self.arrow(d, k, mid, cy, S(10), TEXT)
            else:
                self.text_vc(d, mid, cy, k, S(15), BTN_INK, True, "m")
            self.text_vc(d, hx + kw + S(10), cy, label, fs, MUTED)
            hx += kw + S(10) + lw + S(32)
        return img


def _entry_colors(title, kind):
    if kind == "dashboard":
        return (5, 8, 12), ACCENT
    h = sum(ord(c) * (i + 3) for i, c in enumerate(title)) % 5
    pal = [((36, 72, 71), (214, 239, 233)), ((74, 58, 36), (243, 220, 180)), ((58, 44, 84), (226, 214, 248)),
           ((80, 44, 52), (248, 214, 220)), ((40, 62, 92), (212, 228, 248))]
    return pal[h]


def _initials(title):
    words = [w for w in re.split(r"[\s:_\-]+", title) if w]
    if not words:
        return "?"
    if len(words) == 1:
        return words[0][:2].upper()
    return (words[0][0] + words[1][0]).upper()


# --------------------------------------------------------------------------- overlay
class SpacesOverlay:
    """Modello + finestra X. mgr e' il SpacesManager di spaces.py (spazi, freezer, pad)."""

    def __init__(self, mgr, log):
        self.mgr = mgr
        self.log = log
        self.lang = _lang()
        self.t = load_strings(self.lang, log)
        self.lock = threading.RLock()
        self.q = queue.Queue()
        self.opened = False
        self.zone = "spaces"
        self.sel = 0
        self.svc = 0
        self.entries = []
        self.cur = 0
        self.toast = ("", 0.0)
        self.last_input = 0.0
        self.a_down_t = None
        self.a_last = 0.0
        self.services = Services(log, getattr(mgr, "bt_pad_in_use", None))
        self.renderer = None
        self.available, self.reason = self._check_deps()
        self._thread = None
        self._win = None
        self._d = None
        self._last_entries = 0.0
        self._last_raise = 0.0
        self._last_refresh = 0.0
        self._svc_ver = -1
        self._geom = None
        self._bgr = "BGRX"
        if self.available:
            self.renderer = Renderer(self.t)
            self._thread = threading.Thread(target=self._loop, name="overlay", daemon=True)
            self._thread.start()
        else:
            self.log("overlay: NOT available (%s)" % self.reason)

    @staticmethod
    def _check_deps():
        if not HAVE_PIL:
            return False, "Pillow missing: %s" % PIL_ERR
        if not HAVE_XLIB:
            return False, "python-xlib missing"
        if not os.environ.get("DISPLAY"):
            return False, "DISPLAY not set"
        return True, ""

    # ----- API per spaces.py
    def is_open(self):
        return self.opened

    def status(self):
        return {"available": self.available, "reason": self.reason, "open": self.opened,
                "zone": self.zone, "selected": self.sel, "lang": self.lang}

    def open(self, direction=1):
        """Apre l'overlay e aspetta (al massimo SHOW_TIMEOUT_S) che la finestra sia visibile.
        True se aperto; False se non e' stato possibile (chi chiama ripiega sul cambio diretto)."""
        if not self.available:
            return False
        with self.lock:
            if self.opened:
                return True
            lang = _lang()
            if lang != self.lang:
                self.lang = lang
                self.t = load_strings(lang, self.log)
                if self.renderer is not None:
                    self.renderer.t = self.t
                self.log("overlay: language is now %s" % lang)
            entries = self.mgr.overlay_entries()
            cur = self.mgr.overlay_current_space()
            idx = next((i for i, e in enumerate(entries) if e["space"] == cur), 0)
            self.entries = entries
            self.cur = cur
            self.sel = (idx + (1 if direction >= 0 else -1)) % max(1, len(entries)) if len(entries) > 1 else 0
            self.zone = "spaces"
            self.svc = 0
            self.toast = ("", 0.0)
            self.a_down_t = None
            self.last_input = time.time()
            self._last_entries = time.time()
            self._svc_ver = -1
            self.opened = True
        ev = threading.Event()
        res = {"ok": False}
        self.q.put(("show", ev, res))
        ev.wait(SHOW_TIMEOUT_S)
        if not res["ok"]:
            self.log("overlay: window not shown within %.1fs -> falling back to direct switch" % SHOW_TIMEOUT_S)
            with self.lock:
                self.opened = False
            self.q.put(("hide",))
            return False
        self.mgr.overlay_opened()
        self.services.refresh_async()
        self._last_refresh = time.time()
        self.log("overlay: opened (current space %d, %d entries, first selection %d)" % (self.cur, len(self.entries), self.sel))
        return True

    def abort(self):
        """Chiusura senza cambiare nulla e senza scongelare (lo fa chi sta per cambiare spazio)."""
        with self.lock:
            if not self.opened:
                return
            self.opened = False
        self.q.put(("hide",))
        self.mgr.overlay_closed()

    def confirm_space(self, space):
        self._finish(space)

    def cancel(self):
        self._finish(None)

    def shutdown(self):
        self.q.put(("quit",))

    # ----- azioni dal controller
    def handle(self, action):
        if not self.opened:
            return False
        finish = None
        with self.lock:
            self.last_input = time.time()
            n = len(self.entries)
            if action in ("left", "right"):
                dlt = -1 if action == "left" else 1
                if self.zone == "spaces":
                    if n:
                        self.sel = (self.sel + dlt) % n
                else:
                    self.svc = max(0, min(len(ITEMS) - 1, self.svc + dlt))
            elif action == "up":
                self.zone = "services"
            elif action == "down":
                self.zone = "spaces"
            elif action == "b":
                finish = ("cancel", None)
            elif action == "a_up":
                self.a_down_t = None
            elif action == "a":
                if self.zone == "spaces":
                    if n:
                        finish = ("space", self.entries[self.sel]["space"])
                    else:
                        finish = ("cancel", None)
                else:
                    item = ITEMS[self.svc]
                    if item in ("vminus", "vplus"):
                        ok = self.services.volume_step_async(-VOL_STEP if item == "vminus" else VOL_STEP)
                        if ok:
                            self.a_down_t = time.time()
                            self.a_last = self.a_down_t
                        else:
                            self._set_toast("noaudio")
                    elif item == "vol":
                        if not self.services.toggle_mute():
                            self._set_toast("noaudio")
                    else:
                        msg = self.services.activate(item)
                        if msg:
                            self._set_toast(msg)
            else:
                return False
        if finish:
            self._finish(finish[1] if finish[0] == "space" else None)
        else:
            self.q.put(("draw",))
        return True

    def _set_toast(self, key):
        self.toast = (self.t.get(key, key), time.time() + 2.2)

    def _finish(self, space):
        with self.lock:
            if not self.opened:
                return
            self.opened = False
            cur = self.cur
        ok = True
        delay = getattr(self.mgr, "overlay_thaw_delay", 0.0) or 0.0
        if delay > 0 and hasattr(self.mgr, "overlay_release_later"):
            # delayed hand-back: window gone and game in front right away, but frozen and
            # with the pad still grabbed for `delay` s (see SpacesManager.overlay_release_later)
            if space is None or space == cur:
                scope = self.mgr.overlay_scope_of(cur)
            else:
                ok = self.mgr.switch_space(space, reason="overlay", thaw_delay=delay)
                scope = self.mgr.overlay_scope_of(space if ok else cur)
            self.q.put(("hide",))
            self.mgr.overlay_release_later(scope, delay)
        else:
            if space is None or space == cur:
                self.mgr.overlay_cancelled()
            else:
                ok = self.mgr.switch_space(space, reason="overlay")
                if not ok:
                    self.mgr.overlay_cancelled()
            self.q.put(("hide",))
            self.mgr.overlay_closed()
        self.log("overlay: closed (%s)" % ("cancel" if space is None or space == cur else "-> space %s%s" % (space, "" if ok else " FAILED")))

    # ----- thread X
    def _loop(self):
        while True:
            try:
                msg = self.q.get(timeout=0.15)
            except queue.Empty:
                msg = None
            try:
                if msg:
                    kind = msg[0]
                    if kind == "show":
                        msg[2]["ok"] = bool(self._x_show())
                        msg[1].set()
                    elif kind == "hide":
                        self._x_hide()
                    elif kind == "draw":
                        if self._win is not None:
                            self._x_draw()
                    elif kind == "quit":
                        self._x_hide()
                        return
                self._tick()
            except Exception as e:  # noqa
                self.log("overlay: error in loop: %r" % (e,))
                if msg and msg[0] == "show":
                    msg[2]["ok"] = False
                    msg[1].set()

    def _tick(self):
        if not self.opened or self._win is None:
            return
        now = time.time()
        redraw = False
        with self.lock:
            if now - self.last_input > IDLE_S:
                idle = True
            else:
                idle = False
        if idle:
            self.log("overlay: idle timeout -> closing")
            self._finish(None)
            return
        if now - self._last_entries > 1.0:
            self._last_entries = now
            ents = self.mgr.overlay_entries()
            with self.lock:
                if [(e["space"], e["title"]) for e in ents] != [(e["space"], e["title"]) for e in self.entries]:
                    cur_space = self.entries[self.sel]["space"] if self.entries and self.sel < len(self.entries) else None
                    self.entries = ents
                    self.sel = next((i for i, e in enumerate(ents) if e["space"] == cur_space), min(self.sel, max(0, len(ents) - 1)))
                    redraw = True
        if now - self._last_refresh > SERVICE_REFRESH_S:
            self._last_refresh = now
            self.services.refresh_async()
        _, ver = self.services.snapshot()
        if ver != self._svc_ver:
            redraw = True
        if self.toast[0] and now > self.toast[1]:
            self.toast = ("", 0.0)
            redraw = True
        # ripetizione di - / + tenendo premuto A
        with self.lock:
            hold = self.a_down_t
            item = ITEMS[self.svc] if self.zone == "services" else ""
        if hold and item in ("vminus", "vplus") and now - hold > VOL_REPEAT_DELAY_S and now - self.a_last > VOL_REPEAT_EVERY_S:
            self.a_last = now
            self.services.volume_step_async(-VOL_STEP if item == "vminus" else VOL_STEP)
            redraw = True
        if now - self._last_raise > 1.0:
            self._last_raise = now
            try:
                self._win.configure(stack_mode=X.Above)
                self._d.flush()
            except Exception:
                pass
        if redraw:
            self._x_draw()

    # ----- finestra X
    def _monitor_geometry(self, root):
        """Geometria del monitor principale (nella sessione Shell e' l'unico acceso)."""
        try:
            r = subprocess.run(["xrandr", "--listmonitors"], capture_output=True, text=True, timeout=2.0)
            first = primary = None
            for line in (r.stdout or "").splitlines():
                m = re.search(r"(\d+)/\d+x(\d+)/\d+\+(-?\d+)\+(-?\d+)", line)
                if not m:
                    continue
                g = (int(m.group(3)), int(m.group(4)), int(m.group(1)), int(m.group(2)))
                first = first or g
                if "+*" in line:
                    primary = g
            if primary or first:
                return primary or first
        except Exception:
            pass
        sc = self._d.screen()
        return 0, 0, sc.width_in_pixels, sc.height_in_pixels

    def _x_show(self):
        if self._d is None:
            self._d = display.Display()
        d = self._d
        info = d.display.info
        sc = d.screen()
        fmt = next((f for f in info.pixmap_formats if f.depth == sc.root_depth), None)
        if fmt is None or fmt.bits_per_pixel != 32:
            self.log("overlay: unsupported X pixel format (depth %s)" % sc.root_depth)
            return False
        self._bgr = "BGRX" if info.image_byte_order == 0 else "XRGB"
        x, y, w, h = self._monitor_geometry(sc.root)
        self._geom = (x, y, w, h)
        win = sc.root.create_window(x, y, w, h, 0, sc.root_depth, X.InputOutput, X.CopyFromParent,
                                    background_pixel=0x0d1117, override_redirect=1, event_mask=0)
        win.set_wm_name("X-Launcher Overlay")
        win.set_wm_class("xlauncher-overlay", "XLauncherOverlay")
        self._gc = win.create_gc()
        self._win = win
        win.map()
        win.configure(stack_mode=X.Above)
        d.sync()
        self._x_draw()
        self._last_raise = time.time()
        return True

    def _x_hide(self):
        win, self._win = self._win, None
        if win is not None:
            try:
                win.unmap()
                win.destroy()
                self._d.sync()
            except Exception as e:  # noqa
                self.log("overlay: hide error: %r" % (e,))

    def _model(self):
        with self.lock:
            snap, ver = self.services.snapshot()
            self._svc_ver = ver
            ents = []
            for e in self.entries:
                col, ink = _entry_colors(e["title"], e["kind"])
                ents.append({"space": e["space"], "title": e["title"], "kind": e["kind"], "initials": _initials(e["title"]),
                             "color": col, "ink": ink, "current": e["space"] == self.cur,
                             "cover": e.get("cover"), "hero": e.get("hero")})
            return {"zone": self.zone, "sel": self.sel, "svc": self.svc, "entries": ents, "services": snap,
                    "toast": self.toast[0]}

    def _x_draw(self):
        win = self._win
        if win is None:
            return
        _, _, w, h = self._geom
        img = self.renderer.render(w, h, self._model())
        dump = os.environ.get("XL_OVERLAY_DUMP")
        if dump:
            try:
                img.save(dump)
            except Exception:
                pass
        data = img.tobytes("raw", self._bgr)
        stride = w * 4
        maxb = max(4096, self._d.display.info.max_request_length * 4 - 256)
        rows = max(1, maxb // stride)
        d = self._d
        y0 = 0
        depth = d.screen().root_depth
        while y0 < h:
            n = min(rows, h - y0)
            win.put_image(self._gc, 0, y0, w, n, X.ZPixmap, depth, 0, data[y0 * stride:(y0 + n) * stride])
            y0 += n
        d.flush()
