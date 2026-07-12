#!/usr/bin/env bash
# =============================================================
#  install.sh — Installa X-Launcher in /opt/x-launcher
#
#  /opt è la posizione corretta secondo il Filesystem Hierarchy
#  Standard per "add-on application software packages" non
#  pacchettizzati con il package manager della distribuzione (FHS
#  3.0, §3.13) — il progetto resta un albero auto-contenuto in
#  un'unica directory, leggibile da tutti gli utenti del sistema,
#  scrivibile solo da root. Le impostazioni, la cache, il
#  database e tutto ciò che è specifico di ciascun utente restano
#  in ~/.local/share/x-launcher (già gestito correttamente da
#  tutto il backend tramite homedir() — vedi appConfig.ts,
#  db.ts, logger.ts, ecc. — nessuna modifica necessaria lì).
#
#  v0.99.32 — Questo script è OPZIONALE: il progetto continua a
#  funzionare perfettamente anche lanciato direttamente dalla
#  propria cartella (come già fai oggi con ./kiosk-launch.sh) —
#  serve solo per chi vuole rendere X-Launcher disponibile come
#  sessione di login globale (xlauncher.desktop richiede
#  necessariamente un path assoluto fisso, dato che lo legge
#  LightDM prima ancora che un utente sia autenticato) o
#  raggiungibile da riga di comando con un nome breve da
#  qualunque cartella.
#
#  Uso:
#    sudo ./install.sh              # installa/aggiorna /opt/x-launcher
#    sudo ./install.sh --uninstall  # rimuove /opt/x-launcher e i link
# =============================================================
set -e

INSTALL_DIR="/opt/x-launcher"
BIN_LINK="/usr/local/bin/x-launcher"
SESSION_FILE="/usr/share/xsessions/xlauncher.desktop"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$EUID" -ne 0 ]; then
  echo "[INSTALL] Questo script richiede sudo (scrive in /opt, /usr/local/bin, /usr/share/xsessions)."
  echo "[INSTALL] Riprova con: sudo ./install.sh"
  exit 1
fi

if [ "$1" = "--uninstall" ]; then
  echo "[INSTALL] Rimozione di X-Launcher da /opt..."
  rm -rf "$INSTALL_DIR"
  rm -f "$BIN_LINK"
  rm -f "$SESSION_FILE"
  echo "[INSTALL] Rimosso. Le impostazioni utente in ~/.local/share/x-launcher NON sono state toccate (sono per-utente, non riguardano l'installazione globale)."
  exit 0
fi

if [ ! -d "$PROJECT_DIR/dist" ]; then
  echo "[INSTALL] dist/ non trovata in ${PROJECT_DIR} — esegui prima ./build.sh compile."
  exit 1
fi

echo "[INSTALL] Copio il progetto in ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"
# rsync preserva i permessi eseguibili degli script (.sh) e aggiorna solo i
# file cambiati su una reinstallazione successiva, invece di un cp -r pieno
# ogni volta — più adatto per ri-applicare aggiornamenti del progetto.
if command -v rsync &>/dev/null; then
  rsync -a --delete \
    --exclude='.git' \
    --exclude='.env' \
    "$PROJECT_DIR"/ "$INSTALL_DIR"/
else
  # Fallback se rsync non è disponibile: cp -r pieno (più lento, meno
  # incrementale, ma funziona ovunque senza dipendenze aggiuntive).
  cp -r "$PROJECT_DIR"/. "$INSTALL_DIR"/
  rm -rf "$INSTALL_DIR/.git" "$INSTALL_DIR/.env" 2>/dev/null || true
fi

# Permessi: leggibile/eseguibile da tutti, scrivibile solo da root —
# coerente con "disponibile globalmente, impostazioni per-utente altrove".
chown -R root:root "$INSTALL_DIR"
chmod -R go-w "$INSTALL_DIR"
chmod +x "$INSTALL_DIR"/*.sh

echo "[INSTALL] Creo il symlink ${BIN_LINK} → ${INSTALL_DIR}/kiosk-launch.sh..."
ln -sf "$INSTALL_DIR/kiosk-launch.sh" "$BIN_LINK"

echo "[INSTALL] Installo la sessione LightDM in ${SESSION_FILE}..."
cp "$INSTALL_DIR/xlauncher.desktop" "$SESSION_FILE"

echo ""
echo "[INSTALL] Completato."
echo "[INSTALL] - Avvio da riga di comando, qualunque cartella: x-launcher"
echo "[INSTALL] - Sessione dedicata: selezionabile dal menu sessioni alla schermata di login LightDM."
echo "[INSTALL] - Per disinstallare: sudo ${INSTALL_DIR}/install.sh --uninstall (oppure rilancia questo script con --uninstall)"
echo ""
echo "[INSTALL] Integrazione Steam (opzionale, separata — richiede Steam già autenticato almeno una volta):"
echo "[INSTALL]   node ${INSTALL_DIR}/scripts/setup-steam-shortcut.cjs"
echo "[INSTALL]   Aggiunge X-Launcher come Non-Steam Game in Steam, con artwork dedicata."
