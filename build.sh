#!/usr/bin/env bash
# =============================================================
#  build.sh — Compila e avvia X-Launcher
#  Uso:
#    ./build.sh          → compila e avvia
#    ./build.sh compile  → solo compila
#    ./build.sh start    → solo avvia (senza ricompilare)
#    ./build.sh dev      → modalità sviluppo con HMR
# =============================================================
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

ACTION="${1:-all}"

compile() {
  echo "[BUILD] Compilazione in corso..."
  npm run build
  echo "[BUILD] ✅ Compilazione completata — $(date '+%Y-%m-%d %H:%M:%S')"

  compile_tray

  echo "[BUILD] Per applicare: pkill -f 'dist/server.cjs' && ./build.sh start"
  echo "[BUILD] (oppure 'sudo systemctl restart xdash' se il daemon è gestito da systemd sulla tua macchina)"
}

# v0.99.90 — prepara/aggiorna il venv del systray Python (pystray, pillow,
# python-xlib per la gestione cursore via XFixes) insieme al resto della
# build, cosi un solo comando basta per essere pronti al test completo
# invece di dover ricordare i passaggi manuali del venv a parte.
#
# Passo accessorio, MAI bloccante: se python3/venv/pip falliscono per
# qualunque motivo (rete assente, python3-venv non installato, ecc.), la
# funzione logga il motivo e ritorna — kiosk-launch.sh già gestisce da solo
# l'assenza di .venv-tray saltando systray/cursore senza impedire l'avvio
# del resto della dashboard (vedi quello script). Nessun 'set -e' rischiato
# qui: ogni comando che può fallire è dentro un if esplicito.
#
# v2.5.1-dev.5 — i sorgenti Python (tray.py, spaces.py) NON si compilano: girano
# come script, lanciati da kiosk-launch.sh con il python del venv, e spaces.py
# viene importato da tray.py perché sta nella stessa cartella (nessun elenco di
# file da aggiornare qui). Prima di questa versione un errore di sintassi emergeva
# solo a sessione avviata, nel log del tray: ora lo si vede già in build.
check_tray_sources() {
  local f err
  for f in tray.py spaces.py; do
    if [ ! -f "$DIR/$f" ]; then
      echo "[BUILD] ⚠ $f non trovato in $DIR."
      continue
    fi
    if err="$(python3 -c 'import ast, sys; ast.parse(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1])' "$DIR/$f" 2>&1)"; then
      echo "[BUILD] ✅ Sintassi di $f ok."
    else
      echo "[BUILD] ⚠ ERRORE DI SINTASSI in $f — il tray/gestore degli spazi non partirebbe:"
      echo "$err" | tail -4
    fi
  done
}

compile_tray() {
  echo "[BUILD] Preparazione tray Python (systray + gestione cursore)..."

  if ! command -v python3 &>/dev/null; then
    echo "[BUILD] ⚠ python3 non trovato — tray saltata (systray/gestione cursore XFixes non disponibili, il resto della dashboard non è impattato)."
    return 0
  fi

  check_tray_sources

  if [ ! -d "$DIR/.venv-tray" ]; then
    echo "[BUILD] Creazione venv .venv-tray (--system-site-packages)..."
    if ! python3 -m venv --system-site-packages "$DIR/.venv-tray"; then
      echo "[BUILD] ⚠ Creazione venv .venv-tray fallita — tray saltata."
      return 0
    fi
  fi

  echo "[BUILD] Installazione/aggiornamento dipendenze tray (pystray, pillow, python-xlib)..."
  if ! "$DIR/.venv-tray/bin/pip" install --quiet --upgrade pystray pillow python-xlib; then
    echo "[BUILD] ⚠ Installazione dipendenze tray fallita (verifica connessione di rete) — tray non aggiornata, ma il resto della dashboard non è impattato."
    return 0
  fi

  # v2.5.1-dev.5 — il venv deve poter importare python-xlib e spaces.py
  # (gestore degli spazi della sessione Openbox "Shell"): avviso, mai blocco.
  if ! "$DIR/.venv-tray/bin/python3" -c 'import Xlib' &>/dev/null; then
    echo "[BUILD] ⚠ python-xlib non importabile dal venv .venv-tray — gestore degli spazi e gestione cursore non partirebbero."
  elif [ -f "$DIR/spaces.py" ] && ! (cd "$DIR" && "$DIR/.venv-tray/bin/python3" -c 'import spaces' &>/dev/null); then
    echo "[BUILD] ⚠ spaces.py non importabile con il python del venv — verifica gli errori con: cd \"$DIR\" && .venv-tray/bin/python3 -c 'import spaces'"
  fi

  echo "[BUILD] ✅ Tray pronta (.venv-tray)."
}

start() {
  echo "[BUILD] Avvio daemon + browser..."
  ./kiosk-launch.sh "${2:-}"
}

case "$ACTION" in
  compile) compile ;;
  start)   start "$@" ;;
  dev)     npm run dev ;;
  all)     compile && start "$@" ;;
  *)       echo "Uso: ./build.sh [compile|start|dev|all] [browser]"; exit 1 ;;
esac
