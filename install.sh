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
#  v2.2.19-dev.1 — Aggiunta la seconda sessione di login
#  "X-Launcher Kiosk" (Step 20, gamescope standalone via DRM/KMS,
#  nessun desktop sotto — vedi gamescope-session.sh). A differenza
#  di xlauncher.desktop (sessione X11, cartella xsessions/), questa
#  è una sessione Wayland nativa: va in /usr/share/wayland-sessions/,
#  cartella che potrebbe non esistere ancora su un sistema che non
#  ha mai offerto sessioni Wayland — creata esplicitamente con
#  mkdir -p invece di assumerla già presente.
#
#  Uso:
#    sudo ./install.sh              # installa/aggiorna /opt/x-launcher
#    sudo ./install.sh --uninstall  # rimuove /opt/x-launcher e i link
# =============================================================
set -e

INSTALL_DIR="/opt/x-launcher"
BIN_LINK="/usr/local/bin/x-launcher"
SESSION_FILE="/usr/share/xsessions/xlauncher.desktop"
# v2.2.19-dev.1 — sessione Kiosk (Wayland/gamescope), vedi nota sopra.
KIOSK_SESSION_DIR="/usr/share/wayland-sessions"
KIOSK_SESSION_FILE="${KIOSK_SESSION_DIR}/xlauncher-kiosk.desktop"
# Step 19a (v1.1.69) — protocollo xlaunch://. Il .desktop del gestore va
# in /usr/share/applications (scoperto da xdg-mime per tutti gli utenti
# del sistema, stessa logica di FHS già seguita per INSTALL_DIR), ma la
# registrazione "questo .desktop gestisce questo scheme" (xdg-mime
# default) è per-utente — non ha senso farla come root, altrimenti
# finirebbe nel mimeapps.list di root, non dell'utente che userà
# davvero X-Launcher. Da qui SUDO_USER più sotto.
XLAUNCH_DESKTOP_FILE="/usr/share/applications/xlaunch-protocol.desktop"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$EUID" -ne 0 ]; then
  echo "[INSTALL] Questo script richiede sudo (scrive in /opt, /usr/local/bin, /usr/share/xsessions, /usr/share/wayland-sessions)."
  echo "[INSTALL] Riprova con: sudo ./install.sh"
  exit 1
fi

if [ "$1" = "--uninstall" ]; then
  echo "[INSTALL] Rimozione di X-Launcher da /opt..."
  rm -rf "$INSTALL_DIR"
  rm -f "$BIN_LINK"
  rm -f "$SESSION_FILE"
  rm -f "$KIOSK_SESSION_FILE"
  rm -f "$XLAUNCH_DESKTOP_FILE"
  update-desktop-database /usr/share/applications 2>/dev/null || true
  echo "[INSTALL] Rimosso. Le impostazioni utente in ~/.local/share/x-launcher NON sono state toccate (sono per-utente, non riguardano l'installazione globale)."
  exit 0
fi

if [ ! -d "$PROJECT_DIR/dist" ]; then
  echo "[INSTALL] dist/ non trovata in ${PROJECT_DIR} — esegui prima ./build.sh compile."
  exit 1
fi

echo "[INSTALL] Copio il progetto in ${INSTALL_DIR}..."
# rsync preserva i permessi eseguibili degli script (.sh) e aggiorna solo i
# file cambiati su una reinstallazione successiva, invece di un cp -r pieno
# ogni volta — più adatto per ri-applicare aggiornamenti del progetto.
#
# v1.1.102-dev.1 — .env non vive più in $PROJECT_DIR (spostato in
# ~/.local/share/x-launcher/.env): l'esclusione resta solo come rete di
# sicurezza per chi avesse ancora un .env residuo nella vecchia posizione.
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
# v1.5.0-Venus — scripts/with-env.sh (nuovo, caricamento .env condizionale
# per npm run dev/start) non è coperto dal glob sopra, che guarda solo la
# radice del progetto. Non è strettamente necessario per il funzionamento
# (viene invocato via "bash scripts/with-env.sh ...", bash lo esegue anche
# senza bit +x) ma resta coerente con gli altri script del progetto.
[ -f "$INSTALL_DIR/scripts/with-env.sh" ] && chmod +x "$INSTALL_DIR/scripts/with-env.sh"

echo "[INSTALL] Creo il symlink ${BIN_LINK} → ${INSTALL_DIR}/kiosk-launch.sh..."
ln -sf "$INSTALL_DIR/kiosk-launch.sh" "$BIN_LINK"

echo "[INSTALL] Installo la sessione LightDM (X11) in ${SESSION_FILE}..."
cp "$INSTALL_DIR/xlauncher.desktop" "$SESSION_FILE"

# v2.2.19-dev.1 — sessione Kiosk (Wayland/gamescope standalone). Il file
# .desktop NON va reso eseguibile (lezione della vecchia diagnosi Step 20:
# il bit eseguibile su xlauncher.desktop fu trovato come anomalia, non
# risolutiva ma comunque da evitare) — solo gamescope-session.sh lo è, già
# garantito dal chmod +x "*.sh" sopra.
echo "[INSTALL] Installo la sessione LightDM (Wayland/gamescope) in ${KIOSK_SESSION_FILE}..."
mkdir -p "$KIOSK_SESSION_DIR"
cp "$INSTALL_DIR/xlauncher-kiosk.desktop" "$KIOSK_SESSION_FILE"

echo "[INSTALL] Registro il protocollo xlaunch:// in ${XLAUNCH_DESKTOP_FILE}..."
cp "$INSTALL_DIR/xlaunch-protocol.desktop" "$XLAUNCH_DESKTOP_FILE"
update-desktop-database /usr/share/applications 2>/dev/null || true

# xdg-mime default va eseguito dall'utente reale, non da root (scrive in
# ~/.config/mimeapps.list DELL'UTENTE CHE LO ESEGUE) — SUDO_USER è
# valorizzato automaticamente da sudo con l'utente che ha invocato lo
# script, non root stesso.
if [ -n "${SUDO_USER:-}" ] && command -v xdg-mime &>/dev/null; then
  echo "[INSTALL] Imposto ${SUDO_USER} come gestore predefinito di xlaunch:// (xdg-mime)..."
  sudo -u "$SUDO_USER" xdg-mime default xlaunch-protocol.desktop x-scheme-handler/xlaunch
elif ! command -v xdg-mime &>/dev/null; then
  echo "[INSTALL] xdg-mime non trovato — installa il pacchetto xdg-utils, poi esegui manualmente:"
  echo "[INSTALL]   xdg-mime default xlaunch-protocol.desktop x-scheme-handler/xlaunch"
else
  echo "[INSTALL] Impossibile determinare l'utente reale (SUDO_USER non impostato) — registra manualmente con:"
  echo "[INSTALL]   xdg-mime default xlaunch-protocol.desktop x-scheme-handler/xlaunch"
fi

echo ""
echo "[INSTALL] Completato."
echo "[INSTALL] - Avvio da riga di comando, qualunque cartella: x-launcher"
echo "[INSTALL] - Sessione dedicata X11: selezionabile dal menu sessioni alla schermata di login LightDM."
echo "[INSTALL] - Sessione Kiosk (Wayland/gamescope, senza desktop): selezionabile come 'X-Launcher Kiosk' dallo stesso menu."
echo "[INSTALL] - Link xlaunch://<id-gioco> (da browser, script esterni, altre integrazioni) ora avviano il gioco direttamente, aprendo la Dashboard nascosta in background se non è già in esecuzione."
echo "[INSTALL] - Per disinstallare: sudo ${INSTALL_DIR}/install.sh --uninstall (oppure rilancia questo script con --uninstall)"
echo ""
echo "[INSTALL] Integrazione Steam (opzionale, separata — richiede Steam già autenticato almeno una volta):"
echo "[INSTALL]   node ${INSTALL_DIR}/scripts/setup-steam-shortcut.cjs"
echo "[INSTALL]   Aggiunge X-Launcher come Non-Steam Game in Steam, con artwork dedicata."
