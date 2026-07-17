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

# v1.1.71 — quando l'output è reindirizzato su file (kiosk-launch.sh, da
# questa stessa versione, non più su /dev/null), Python bufferizza a
# blocchi anziché riga per riga: se il processo terminasse bruscamente
# (crash, kill), gli ultimi print potrebbero non arrivare mai al file —
# esattamente il tipo di "buco" che rende impossibile la diagnosi in un
# caso come questo. reconfigure() esiste da Python 3.7, riguarda anche
# tutti i print già presenti nel resto del file, non solo quelli nuovi.
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

WINDOW_TITLE = "X-Launcher HTPC"
DAEMON_URL = os.environ.get("X_LAUNCHER_URL", "http://localhost:3000")
POLL_INTERVAL_S = 2

# v1.1.68 — menu contestuale con gli ultimi giochi lanciati (richiesta
# dall'utente, contestuale allo Step 19a xlaunch://): utile in un
# contesto d'uso desktop per rilanciare al volo un gioco frequente col
# solo mouse, senza dover riportare in primo piano l'intera Dashboard.
RECENT_GAMES_LIMIT = 3
# v1.1.70 — ogni quanti tick di poll_loop (POLL_INTERVAL_S ciascuno)
# ricostruire il menu per tenere "Giochi recenti" aggiornato. 5 tick × 2s
# = ogni 10s: abbastanza reattivo per un uso interattivo del menu, senza
# rifare la richiesta HTTP a fetch_recent_games() ad ogni singolo tick di
# polling (che gira ogni 2s solo per governare hide/show del gioco).
RECENT_GAMES_REFRESH_TICKS = 5

# Da questa sessione in poi (vedi convenzione adottata durante Step 19b):
# ogni nuova feature con testo va in italiano E inglese per default — le
# due voci di menu preesistenti ("Mostra/Nascondi Dashboard", "Esci dal
# tray") non erano mai state toccate perché scritte prima di questa
# convenzione; le traduco ora nello stesso passaggio invece di introdurre
# l'incoerenza opposta (solo le voci nuove bilingui, quelle vecchie no —
# esattamente il tipo di problema affrontato per l'intera sessione sulla
# UI web). Lingua letta una sola volta all'avvio da /api/config (lo
# stesso campo già usato dal frontend) — un tray icon nativo non ha
# accesso al sistema i18next del frontend, non vale la pena introdurne
# uno solo per queste poche stringhe.
TRANSLATIONS = {
    "it": {
        "toggle": "Mostra/Nascondi Dashboard",
        "recent_games": "Giochi recenti",
        "no_recent_games": "Nessun gioco recente",
        "quit": "Esci dal tray",
    },
    "en": {
        "toggle": "Show/Hide Dashboard",
        "recent_games": "Recent Games",
        "no_recent_games": "No recent games",
        "quit": "Quit tray",
    },
}


def detect_language() -> str:
    """Legge la lingua corrente dal daemon (stesso campo di /api/config
    già usato dal frontend). Fallback 'it' se il daemon non risponde
    ancora o il campo manca — stesso default storico del resto dell'app."""
    try:
        with urllib.request.urlopen(f"{DAEMON_URL}/api/config", timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            lang = data.get("language")
            return lang if lang in TRANSLATIONS else "it"
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return "it"


def tr(key: str) -> str:
    return TRANSLATIONS.get(state["language"], TRANSLATIONS["it"])[key]


def fetch_recent_games():
    """Ritorna una lista di {"id": ..., "title": ...}, più recente prima.
    Lista vuota (non un'eccezione) se il daemon non risponde — lo stesso
    principio difensivo già usato da query_game_running qui sotto."""
    try:
        url = f"{DAEMON_URL}/api/games/recent?limit={RECENT_GAMES_LIMIT}"
        with urllib.request.urlopen(url, timeout=3) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return []


def launch_game(game_id: str):
    """POST /api/launch — stesso endpoint già usato dal pulsante Play
    della Dashboard e da gameManager.launchGame() internamente; il tray
    non duplica alcuna logica di lancio, chiede solo al daemon di farlo."""
    try:
        req = urllib.request.Request(
            f"{DAEMON_URL}/api/launch",
            data=json.dumps({"id": game_id}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"[tray] launch_game({game_id}) fallito: {e}", file=sys.stderr)


def _make_launch_callback(game_id: str):
    """v1.1.72 — FIX CRASH: pystray valida ogni azione contando i
    parametri con action.__code__.co_argcount, accettando SOLO 0, 1 o 2
    argomenti — e conta anche quelli con un default, non solo quelli
    obbligatori. La versione precedente catturava game_id con un
    parametro di default (`lambda icon, item, gid=game_id: ...`), che
    pystray vede come 3 argomenti totali e rifiuta con un ValueError,
    mandando in crash l'intero tray al primo avvio (traceback ottenuto
    dall'utente dopo aver corretto la mancanza di log in v1.1.71). Qui
    sotto una vera closure: game_id è catturato dalla funzione
    circostante, non da un parametro — il callback restituito ha
    esattamente la firma (icon, item) che pystray si aspetta."""
    def callback(icon, item):
        launch_game(game_id)
    return callback


def build_recent_games_menu_items():
    """v1.1.70 — sottomenu costruito staticamente (non con una funzione
    generatrice/menu "pigro", vedi commento storico più sotto nel diff),
    valutando fetch_recent_games() subito. Richiamata periodicamente da
    poll_loop per restare aggiornata."""
    games = fetch_recent_games()
    if not games:
        return [pystray.MenuItem(tr("no_recent_games"), None, enabled=False)]
    return [
        pystray.MenuItem(g["title"], _make_launch_callback(g["id"]))
        for g in games
    ]


def build_menu():
    return pystray.Menu(
        pystray.MenuItem(tr("toggle"), on_toggle_clicked, default=True),
        pystray.MenuItem(tr("recent_games"), pystray.Menu(*build_recent_games_menu_items())),
        pystray.MenuItem(tr("quit"), on_quit_clicked),
    )

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
    # v1.1.68 — popolata in main() prima di costruire il menu, letta una
    # sola volta all'avvio (vedi detect_language) — non ripetuta ad ogni
    # apertura menu, la lingua non cambia mentre il tray è in esecuzione
    # in pratica.
    "language": "it",
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


def poll_loop(icon):
    """
    Thread di background: controlla periodicamente se un gioco
    tracciato è in esecuzione, nascondendo/ripristinando la finestra
    di conseguenza. Solo le transizioni di stato (non ogni tick)
    azionano wmctrl, per evitare chiamate ripetute inutili.

    v1.1.70 — ricostruisce anche il menu ogni RECENT_GAMES_REFRESH_TICKS
    iterazioni, per tenere "Giochi recenti" aggiornato senza il menu
    dinamico "pigro" che ha causato la regressione (vedi
    build_recent_games_menu_items) — reassegnare icon.menu +
    icon.update_menu() periodicamente è il pattern cross-backend
    documentato da pystray per contenuto che cambia nel tempo.
    """
    was_running = False
    tick = 0
    while state["running"]:
        running = query_game_running()
        if running and not was_running:
            hide_window()
            state["auto_hidden"] = True
        elif not running and was_running and state["auto_hidden"]:
            show_window()
            state["auto_hidden"] = False
        was_running = running

        tick += 1
        if tick % RECENT_GAMES_REFRESH_TICKS == 0:
            try:
                icon.menu = build_menu()
                icon.update_menu()
            except Exception as e:
                # Non deve mai far cadere il thread di polling — hide/show
                # del gioco resta la funzione più importante di questo
                # loop, un refresh del menu fallito non deve comprometterla.
                print(f"[tray] Aggiornamento menu fallito: {e}", file=sys.stderr)

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
    # v1.1.71 — diagnostica esplicita richiesta dall'utente dopo che il
    # fix v1.1.70 non ha risolto il problema: fino ad ora si è indagato
    # alla cieca perché kiosk-launch.sh buttava via l'intero output di
    # questo script (&>/dev/null, corretto in questa stessa versione) —
    # non perché mancassero informazioni utili da stampare. Da qui in
    # avanti, se qualcosa non va, il log conterrà il motivo esatto invece
    # di un silenzio totale.
    print(f"[tray] Avvio — pystray {pystray.__version__ if hasattr(pystray, '__version__') else '?'}")
    print(f"[tray] DISPLAY={os.environ.get('DISPLAY', '(non impostato)')}  "
          f"XDG_SESSION_TYPE={os.environ.get('XDG_SESSION_TYPE', '?')}  "
          f"DBUS_SESSION_BUS_ADDRESS={'impostato' if os.environ.get('DBUS_SESSION_BUS_ADDRESS') else '(non impostato)'}")

    # v1.1.68 — lingua rilevata prima di costruire il menu: le etichette
    # (incluse le due preesistenti) devono già comparire nella lingua
    # giusta al primissimo disegno, non aggiornarsi dopo.
    state["language"] = detect_language()
    print(f"[tray] Lingua rilevata: {state['language']}")

    icon = pystray.Icon(
        "x-launcher-tray",
        make_icon_image(),
        "X-Launcher",
        menu=build_menu(),
    )
    # v1.1.71 — pystray sceglie il backend concreto in base a cosa trova
    # disponibile sul sistema (AppIndicator/GTK/XOrg su Linux) — quale sia
    # stato effettivamente scelto QUI è probabilmente l'informazione
    # singola più utile per capire perché l'icona non compare: backend
    # diversi hanno requisiti diversi (AppIndicator needs a
    # StatusNotifierHost nel pannello, es. xfce4-statusnotifier-plugin —
    # la "Notification Area" di XFCE di base supporta solo il protocollo
    # XEmbed legacy, non AppIndicator).
    print(f"[tray] Backend pystray in uso: {type(icon).__module__}.{type(icon).__name__}")

    poll_thread = threading.Thread(target=poll_loop, args=(icon,), daemon=True)
    poll_thread.start()

    cursor_thread = threading.Thread(target=cursor_loop, daemon=True)
    cursor_thread.start()

    print("[tray] Chiamo icon.run() — se l'icona non compare comunque da qui in poi, "
          "il problema è nel backend/ambiente grafico, non nel codice Python "
          "(icon.run() è bloccante e normalmente non ritorna né stampa altro "
          "finché il tray non viene chiuso).")
    icon.run()
    print("[tray] icon.run() è tornato — il tray si è fermato.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # v1.1.71 — rete di sicurezza finale: qualunque eccezione non
        # gestita altrove ora stampa il traceback COMPLETO invece di far
        # terminare il processo in silenzio (il che, combinato con
        # &>/dev/null in kiosk-launch.sh prima di questa stessa versione,
        # è probabilmente il motivo per cui finora si è indagato alla
        # cieca).
        import traceback
        print("[tray] ECCEZIONE NON GESTITA — il tray si è fermato:", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
