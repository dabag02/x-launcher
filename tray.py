#!/usr/bin/env python3
"""
X-Launcher — Systray daemon (v0.99.35, v0.99.90 gestione cursore)

Mostra un'icona nella systray XFCE per X-Launcher.

1. Mostra un'icona persistente in systray, sempre cliccabile per
   mostrare/nascondere manualmente la dashboard (on_toggle_clicked).
2. v0.99.90 — Nasconde/mostra il cursore del mouse dopo un periodo di
   inattività, via estensione XFixes di X11 (python-xlib). Motivo per
   farlo qui invece che nel frontend (App.tsx ha già un timer JS
   equivalente, lasciato come fallback): Chromium rallenta pesantemente i
   timer JavaScript nelle finestre senza focus di sistema — senza un
   click che dia focus almeno una volta, il timer lato browser può
   restare sospeso indefinitamente. XFixes agisce a livello di server X,
   indipendente da quale finestra ha il focus o da cosa sta facendo
   Chromium.

RIMOSSO in v2.1.10-dev.3: il nascondimento AUTOMATICO della finestra
quando /api/system/game-running risultava true (v0.99.35). Diagnosticato
a suo tempo: Chromium non smette di processare il Gamepad API quando la
sua finestra è semplicemente coperta da un'altra (es. un gioco Wine in
primo piano) — solo quando è davvero "hidden" per il browser
(document.hidden=true, impostato nascondendo la finestra via wmctrl).
Nascondere la finestra faceva quindi fermare il polling del gamepad lato
frontend (useGamepad.ts). Il meccanismo funzionava, ma era un martello
enorme per un problema che App.tsx ora risolve direttamente: dalla
v2.1.10-dev.2, il gate isFocusFrozen ignora l'input gamepad durante un
gioco SENZA bisogno di nascondere nulla — e anzi richiede il contrario,
che la finestra resti "viva" (non hidden), per poter intercettare la
combo Select+L1+R1 di risveglio. Con entrambi i meccanismi attivi
insieme, questo script nascondeva la finestra PRIMA che la combo potesse
mai essere letta: bug segnalato dall'utente su hardware reale (la combo
non rispondeva affatto dopo il lancio di un gioco). Il toggle manuale
dell'icona systray resta invariato, la gestione cursore pure — nessuna
delle due dipendeva dal nascondimento automatico rimosso qui.

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

# Step 21 (v2.5.1-dev.4) — modalita' SHELL: nella sessione Openbox "Shell"
# (openbox/autostart imposta XDG_CURRENT_DESKTOP=Openbox) non esiste un
# systray e il demone serve a un altro scopo: ospitare il gestore degli spazi
# (spaces.py). In quella modalita' pystray/PIL non servono e un loro eventuale
# errore di import non deve fermare nulla; nelle altre sessioni (XFCE) il
# comportamento resta ESATTAMENTE quello di prima: l'import fallito e' fatale.
SHELL_MODE = (os.environ.get("XDG_CURRENT_DESKTOP", "") == "Openbox"
              or os.environ.get("X_LAUNCHER_SHELL") == "1")

try:
    import pystray
    from PIL import Image, ImageDraw
except Exception:
    if not SHELL_MODE:
        raise
    pystray = None

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

# v3.0.2-dev.3 — il demone richiede un token (audit di sicurezza). Lo crea al primo avvio in
# ~/.local/share/x-launcher/api-token (0600). Letto a ogni richiesta, non una volta sola: il file
# puo' comparire dopo l'avvio del tray e non c'e' motivo di tenerlo in memoria piu' del necessario.
API_TOKEN_FILE = os.path.join(os.path.expanduser("~"), ".local", "share", "x-launcher", "api-token")


def _auth_headers(extra=None):
    """Header per il demone: il token se il file esiste (altrimenti niente: un demone con
    X_LAUNCHER_AUTH=off funziona senza)."""
    headers = dict(extra or {})
    try:
        with open(API_TOKEN_FILE, "r", encoding="utf-8") as f:
            token = f.read().strip()
        if token:
            headers["X-XLauncher-Token"] = token
    except OSError:
        pass
    return headers


def _daemon_get(path, timeout=3):
    """GET autenticato verso il demone; ritorna il corpo (bytes)."""
    req = urllib.request.Request(f"{DAEMON_URL}{path}", headers=_auth_headers(), method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()

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
        data = json.loads(_daemon_get("/api/config").decode("utf-8"))
        lang = data.get("language")
        return lang if lang in TRANSLATIONS else "it"
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return "it"


def tr(key: str) -> str:
    return TRANSLATIONS.get(state["language"], TRANSLATIONS["it"])[key]


def fetch_recent_games():
    """Ritorna una lista di {"id": ..., "title": ...}, più recente prima.
    Lista vuota (non un'eccezione) se il daemon non risponde — stesso
    principio difensivo usato da detect_language() qui sopra."""
    try:
        return json.loads(_daemon_get(f"/api/games/recent?limit={RECENT_GAMES_LIMIT}").decode("utf-8"))
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
            headers=_auth_headers({"Content-Type": "application/json"}),
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

# v2.1.11-dev.4 — su richiesta dell'utente: tutte le misure precedenti
# (xset s off -dpms + systemd-inhibit in gameManager.ts, v1.1.33-v1.1.35)
# restano attive SOLO durante una sessione di gioco effettivamente
# rilevata — non coprono il tempo passato sulla Dashboard stessa, dove
# con solo un controller collegato (nessun mouse/tastiera a generare
# vera attività X11) schermo/sessione si bloccano comunque. Intervallo
# suggerito dall'utente: un piccolo movimento fittizio del puntatore
# ogni 60s, abbondantemente sotto qualunque timeout screensaver/DPMS
# configurato in pratica (tipicamente minuti, non secondi) — vedi
# idle_reset_loop() più sotto per l'implementazione.
IDLE_RESET_INTERVAL_S = 60

# Stato condiviso tra il thread di polling e i callback del menu tray.
# v2.1.10-dev.3 — sostituisce auto_hidden (rimosso insieme al
# nascondimento automatico legato a game-running, vedi docstring del
# modulo): ora l'unico modo di nascondere la finestra è il click
# manuale sull'icona, quindi basta un flag semplice per sapere se
# l'ultimo toggle l'ha nascosta o mostrata.
state = {
    "manually_hidden": False,
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


def poll_loop(icon):
    """
    Thread di background: aggiorna periodicamente il menu "Giochi
    recenti" (menu dinamico "pigro", vedi build_recent_games_menu_items).

    v2.1.10-dev.3 — questo loop faceva ANCHE da hide/show automatico
    della finestra in base a /api/system/game-running (query_game_running,
    rimossa insieme a questa logica — vedi docstring del modulo). Tolta
    quella parte resta solo il refresh del menu, ma il loop e il suo
    thread dedicato sono stati lasciati invariati: un secondo timer solo
    per questo sarebbe stato più codice per lo stesso risultato.

    v1.1.70 — ricostruisce il menu ogni RECENT_GAMES_REFRESH_TICKS
    iterazioni — reassegnare icon.menu + icon.update_menu()
    periodicamente è il pattern cross-backend documentato da pystray per
    contenuto che cambia nel tempo.
    """
    tick = 0
    while state["running"]:
        tick += 1
        if tick % RECENT_GAMES_REFRESH_TICKS == 0:
            try:
                icon.menu = build_menu()
                icon.update_menu()
            except Exception as e:
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


def idle_reset_loop():
    """
    Thread di background — v2.1.11-dev.4, richiesta esplicita
    dell'utente dopo che le misure precedenti (xset/systemd-inhibit in
    gameManager.ts, solo durante un gioco rilevato) si sono rivelate
    insufficienti: il tempo passato sulla Dashboard stessa, con solo un
    controller collegato, non genera alcuna attività reale a livello X11
    (il Gamepad API di Chromium non passa per gli stessi eventi di
    input/mouse che il server X osserva per il proprio idle timer).

    Ogni IDLE_RESET_INTERVAL_S secondi inietta un micro-movimento del
    puntatore (1px e ritorno, via estensione XTest) — impercettibile e
    innocuo per qualunque gioco/finestra in primo piano (nessun click,
    nessun tasto, spostamento netto zero), ma sufficiente a far
    registrare "attività reale" al server X, sullo stesso principio di
    un vero e proprio "mouse jiggler". Gira SEMPRE, indipendentemente da
    game-running: copre sia la Dashboard sia il gioco, senza bisogno di
    coordinarsi con lo stato del demone Node (a differenza
    dell'inibizione xset/systemd-inhibit esistente, che resta comunque
    attiva invariata — copre anche il caso, diverso, della sospensione
    di sistema via logind, che questo meccanismo non tocca).

    Un vero (0,0) relativo è stato scartato di proposito: alcuni server
    X non lo trattano come "attività" (delta nullo, nessun evento reale
    generato) — esattamente il tipo di soluzione apparentemente
    equivalente ma silenziosamente inefficace già visto altrove in
    questo progetto (v1.1.34, xset senza DISPLAY: il log diceva
    "successo" ma non faceva nulla). Un 1px avanti e indietro garantisce
    un vero evento di movimento.

    NOTA ONESTA (stesso avviso di cursor_loop sopra): l'uso esatto delle
    API python-xlib per XTest qui sotto non è stato verificato con un
    test dal vivo in questo ambiente (nessun server X disponibile) —
    corretto per pattern noti d'uso reale della libreria (identico a
    quanto fa xdotool internamente), ma va considerato il primo giro
    empirico. Se non dovesse funzionare al primo avvio reale, il log
    stampa il motivo esatto invece di fallire in silenzio, e il demone
    degrada in modo pulito (resta comunque l'inibizione xset/
    systemd-inhibit esistente durante il gioco).
    """
    try:
        from Xlib import display, X
        from Xlib.ext import xtest
    except ImportError:
        print(
            "[tray] python-xlib non installato — reset idle via XTest disabilitato "
            "(resta solo l'inibizione xset/systemd-inhibit durante il gioco). "
            "Installa con: .venv-tray/bin/pip install python-xlib",
            file=sys.stderr,
        )
        return

    try:
        d = display.Display()
        if not d.has_extension("XTEST"):
            print("[tray] estensione XTEST non disponibile su questo server X — "
                  "reset idle disabilitato.", file=sys.stderr)
            return
    except Exception as e:
        print(f"[tray] inizializzazione XTest fallita ({e}) — "
              f"reset idle disabilitato.", file=sys.stderr)
        return

    print(f"[tray] Reset idle XTest attivo (ogni {IDLE_RESET_INTERVAL_S:.0f}s).")

    while state["running"]:
        time.sleep(IDLE_RESET_INTERVAL_S)
        try:
            xtest.fake_input(d, X.MotionNotify, True, x=1, y=0)
            d.sync()
            xtest.fake_input(d, X.MotionNotify, True, x=-1, y=0)
            d.sync()
        except Exception as e:
            print(f"[tray] fake_input (reset idle) fallita: {e}", file=sys.stderr)


def on_toggle_clicked(icon, item):
    """
    Click manuale sull'icona/voce di menu: mostra/nascondi la Dashboard
    a piacere. v2.1.10-dev.3 — prima doveva distinguere un nascondimento
    manuale da uno automatico (auto_hidden, rimosso insieme all'hide
    automatico legato a game-running — vedi docstring del modulo); ora
    che l'unico modo di nascondere è questo stesso click, basta il
    proprio stato per sapere in che verso andare.
    """
    if state["manually_hidden"]:
        show_window()
        state["manually_hidden"] = False
    else:
        hide_window()
        state["manually_hidden"] = True


def on_quit_clicked(icon, item):
    state["running"] = False
    icon.stop()


def run_shell_mode():
    """Sessione Openbox "Shell" (Step 21): niente icona di systray. Restano la
    gestione del cursore e il reset dell'idle (non dipendono dal tray) e si
    avvia il gestore degli spazi (spaces.py), che resta in primo piano."""
    print("[tray] Modalita' SHELL (Openbox): nessuna icona di systray, "
          "avvio il gestore degli spazi (spaces.py).")
    print(f"[tray] DISPLAY={os.environ.get('DISPLAY', '(non impostato)')}")
    threading.Thread(target=cursor_loop, daemon=True).start()
    threading.Thread(target=idle_reset_loop, daemon=True).start()
    try:
        import spaces
    except Exception:
        import traceback
        print("[tray] spaces.py non importabile — gestore degli spazi NON avviato:",
              file=sys.stderr)
        traceback.print_exc()
        while True:
            time.sleep(3600)
    spaces.run_forever()


def main():
    if SHELL_MODE:
        run_shell_mode()
        return
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

    idle_reset_thread = threading.Thread(target=idle_reset_loop, daemon=True)
    idle_reset_thread.start()

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
