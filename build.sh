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
compile_tray() {
  echo "[BUILD] Preparazione tray Python (systray + gestione cursore)..."

  if ! command -v python3 &>/dev/null; then
    echo "[BUILD] ⚠ python3 non trovato — tray saltata (systray/gestione cursore XFixes non disponibili, il resto della dashboard non è impattato)."
    return 0
  fi

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

  echo "[BUILD] ✅ Tray pronta (.venv-tray)."
}

start() {
  echo "[BUILD] Avvio daemon + browser..."
  ./kiosk-launch.sh "${2:-}"
}

case "$ACTION" in
  compile) compile ;;
  start)   start ;;
  dev)     npm run dev ;;
  all)     compile && start "$@" ;;
  *)       echo "Uso: ./build.sh [compile|start|dev|all] [browser]"; exit 1 ;;
esac
