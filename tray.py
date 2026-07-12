#!/usr/bin/env python3
"""
X-Launcher — Systray daemon (v0.99.35, v0.99.90 gestione cursore)

Mostra un'icona nella systray XFCE per X-Launcher. Risolve il problema
diagnosticato durante questa sessione: Chromium (a differenza di Firefox)
non smette di processare il Gamepad API quando la sua finestra è coperta
da un'altra (es. un gioco Wine in primo piano) — solo quando è davvero
"hidden" per il browser. Questo script chiude il cerchio:

1. Mostra un'icona persistente in systray, sempre cliccabile per
   mostrare/nascondere manualmente la dashboard.
2. In background, controlla periodicamente /api/system/game-running sul
   daemon Node — se un gioco tracciato è in esecuzione, nasconde
   automaticamente la finestra Chromium (wmctrl); quando il gioco
   chiude, la ripristina automaticamente.
3. La finestra nascosta via wmctrl risulta "hidden" per il browser
   (document.hidden=true), permettendo al frontend (useGamepad.ts) di
   fermare il polling del gamepad — vedi quel file per la metà
   complementare di questa soluzione.
4. v0.99.90 — Nasconde/mostra il cursore del mouse dopo un periodo di
   inattività, via estensione XFixes di X11 (python-xlib). Motivo per
   farlo qui invece che nel frontend (App.tsx ha già un timer JS
   equivalente, lasciato come fallback): Chromium rallenta pesantemente i
   timer JavaScript nelle finestre senza focus di sistema — senza un
   click che dia focus almeno una volta, il timer lato browser può
   restare sospeso indefinitamente. XFixes agisce a livello di server X,
   indipendente da quale finestra ha il focus o da cosa sta facendo
   Chromium — stesso principio già usato per mostra/nascondi finestra
   via wmctrl al punto 2, applicato ora anche al cursore.

Uso: lanciato da kiosk-launch.sh in background, stesso pattern del
daemon Node. Termina automaticamente se KeyboardInterrupt/SIGTERM
(stesso segnale che il window manager invia in chiusura sessione).

Dipendenza aggiuntiva per la gestione cursore: python-xlib, da installare
nello stesso venv del tray:
    .venv-tray/bin/pip install python-xlib
Se non installato, o se il server X non espone l'estensione XFIXES, il
demone degrada in modo pulito: logga il motivo e continua a funzionare
normalmente per tutto il resto (systray, mostra/nascondi finestra) — la
gestione del cursore resta semplicemente affidata al solo fallback JS.
"""

import subprocess
import threading
import time
import sys
import os
import urllib.request
import urllib.error
import json

import pystray
from PIL import Image, ImageDraw

WINDOW_TITLE = "X-Launcher HTPC"
DAEMON_URL = os.environ.get("X_LAUNCHER_URL", "http://localhost:3000")
POLL_INTERVAL_S = 2

# v0.99.90 — parametri gestione cursore. CURSOR_IDLE_S allineato allo
# stesso valore (3s) già usato dal fallback JS in App.tsx, per coerenza
# percepita indipendentemente da quale dei due meccanismi sia effettivo
# in un dato momento (con XFixes attivo, quello JS diventa ridondante ma
# innocuo — vedi commento in App.tsx).
CURSOR_IDLE_S = 3.0
CURSOR_POLL_S = 0.3

# Stato condiviso tra il thread di polling e i callback del menu tray.
# auto_hidden distingue "nascosto dal nostro polling automatico" da
# "nascosto manualmente dall'utente col click" — solo nel primo caso
# vogliamo ripristinare automaticamente alla chiusura del gioco.
state = {
    "auto_hidden": False,
    "running": True,
}


def make_icon_image():
    """
    Icona generata al volo — un quadrato con una X stilizzata, evita
    di dover spedire/gestire un file .png separato. Sostituibile con
    Image.open(path) su un asset reale se il progetto ne fornisce uno
    dedicato in futuro (es. icons/tray.png).
    """
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    margin = 10
    draw.line([(margin, margin), (size - margin, size - margin)], fill=(90, 160, 255, 255), width=8)
    draw.line([(size - margin, margin), (margin, size - margin)], fill=(90, 160, 255, 255), width=8)
    return img


def window_exists() -> bool:
    try:
        out = subprocess.run(
            ["wmctrl", "-l"], capture_output=True, text=True, timeout=3
        ).stdout
        return WINDOW_TITLE in out
    except Exception:
        return False


def show_window():
    try:
        subprocess.run(["wmctrl", "-a", WINDOW_TITLE], timeout=3)
    except Exception as e:
        print(f"[tray] show_window fallito: {e}", file=sys.stderr)


def hide_window():
    try:
        # -b add,hidden imposta lo stato _NET_WM_STATE_HIDDEN sulla
        # finestra — questo è ciò che fa percepire a Chromium la
        # finestra come "not visible", impostando document.hidden=true
        # lato JS. Equivalente a una minimizzazione, ma scriptabile.
        subprocess.run(
            ["wmctrl", "-r", WINDOW_TITLE, "-b", "add,hidden"], timeout=3
        )
    except Exception as e:
        print(f"[tray] hide_window fallito: {e}", file=sys.stderr)


def query_game_running() -> bool:
    try:
        with urllib.request.urlopen(f"{DAEMON_URL}/api/system/game-running", timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return bool(data.get("running"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        # Daemon non raggiungibile/non ancora pronto — non è un errore
        # fatale per il tray, semplicemente assumiamo "nessun gioco in
        # esecuzione" e si riprova al prossimo ciclo.
        return False


def poll_loop():
    """
    Thread di background: controlla periodicamente se un gioco
    tracciato è in esecuzione, nascondendo/ripristinando la finestra
    di conseguenza. Solo le transizioni di stato (non ogni tick)
    azionano wmctrl, per evitare chiamate ripetute inutili.
    """
    was_running = False
    while state["running"]:
        running = query_game_running()
        if running and not was_running:
            hide_window()
            state["auto_hidden"] = True
        elif not running and was_running and state["auto_hidden"]:
            show_window()
            state["auto_hidden"] = False
        was_running = running
        time.sleep(POLL_INTERVAL_S)


def cursor_loop():
    """
    Thread di background: nasconde/mostra il cursore del mouse via
    estensione XFixes, in base all'inattività reale del puntatore letta
    direttamente dal server X — funziona indipendentemente dal focus
    della finestra Chromium (vedi motivazione nel docstring del modulo).

    NOTA ONESTA: l'uso esatto delle API python-xlib per XFixes qui sotto
    non è stato verificato con un test dal vivo in questo ambiente (nessun
    server X disponibile) — corretto per pattern noti d'uso reale della
    libreria, ma va considerato il primo giro empirico, come già successo
    più volte in questo progetto per l'integrazione GOG. Se qualcosa non
    torna al primo avvio reale, il log stampa il motivo esatto invece di
    fallire in silenzio.
    """
    try:
        from Xlib import display
    except ImportError:
        print(
            "[tray] python-xlib non installato — gestione cursore XFixes disabilitata "
            "(resta il solo fallback JS, attivo solo dopo il primo focus). "
            "Installa con: .venv-tray/bin/pip install python-xlib",
            file=sys.stderr,
        )
        return

    try:
        d = display.Display()
        if not d.has_extension("XFIXES"):
            print("[tray] estensione XFIXES non disponibile su questo server X — "
                  "gestione cursore delegata al solo fallback JS.", file=sys.stderr)
            return
        d.xfixes_query_version()
        root = d.screen().root
    except Exception as e:
        print(f"[tray] inizializzazione XFixes fallita ({e}) — "
              f"gestione cursore delegata al solo fallback JS.", file=sys.stderr)
        return

    print("[tray] Gestione cursore XFixes attiva.")
    last_pos = None
    idle_since = None
    hidden = False

    while state["running"]:
        try:
            pointer = root.query_pointer()
            pos = (pointer.root_x, pointer.root_y)
        except Exception as e:
            print(f"[tray] query_pointer fallita: {e}", file=sys.stderr)
            time.sleep(CURSOR_POLL_S)
            continue

        now = time.time()
        if pos != last_pos:
            last_pos = pos
            idle_since = now
            if hidden:
                try:
                    root.xfixes_show_cursor()
                    d.flush()
                except Exception as e:
                    print(f"[tray] xfixes_show_cursor fallita: {e}", file=sys.stderr)
                hidden = False
        elif idle_since is not None and (now - idle_since) >= CURSOR_IDLE_S and not hidden:
            try:
                root.xfixes_hide_cursor()
                d.flush()
                hidden = True
            except Exception as e:
                print(f"[tray] xfixes_hide_cursor fallita: {e}", file=sys.stderr)

        time.sleep(CURSOR_POLL_S)


def on_toggle_clicked(icon, item):
    """
    Click manuale sull'icona/voce di menu: toggle indipendente dal
    polling automatico. Se l'utente nasconde manualmente mentre un
    gioco NON è in esecuzione, auto_hidden resta false — il polling
    non la "riprenderà" per sbaglio al prossimo game-running check.
    """
    if window_exists() and not state["auto_hidden"]:
        # Stato attuale presunto visibile (non nascosta dal nostro
        # polling) — quindi nascondiamo manualmente.
        hide_window()
    else:
        show_window()
        state["auto_hidden"] = False


def on_quit_clicked(icon, item):
    state["running"] = False
    icon.stop()


def main():
    icon = pystray.Icon(
        "x-launcher-tray",
        make_icon_image(),
        "X-Launcher",
        menu=pystray.Menu(
            pystray.MenuItem("Mostra/Nascondi Dashboard", on_toggle_clicked, default=True),
            pystray.MenuItem("Esci dal tray", on_quit_clicked),
        ),
    )

    poll_thread = threading.Thread(target=poll_loop, daemon=True)
    poll_thread.start()

    cursor_thread = threading.Thread(target=cursor_loop, daemon=True)
    cursor_thread.start()

    icon.run()


if __name__ == "__main__":
    main()
