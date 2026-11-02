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
#  sessione di login globale o raggiungibile da riga di comando
#  con un nome breve da qualunque cartella.
#
#  v2.2.19-dev.1 — Aggiunta la sessione di login "X-Launcher Kiosk"
#  (Step 20, gamescope standalone via DRM/KMS, nessun desktop sotto
#  — vedi gamescope-session.sh), sessione Wayland nativa: va in
#  /usr/share/wayland-sessions/, cartella che potrebbe non esistere
#  ancora su un sistema che non ha mai offerto sessioni Wayland —
#  creata esplicitamente con mkdir -p invece di assumerla già
#  presente.
#
#  v2.2.19-dev.15 — Rimossa l'installazione della vecchia sessione
#  X11 (xlauncher.desktop, cartella xsessions/): non è mai stata
#  resa funzionante (diagnosi originale Step 20, causa mai isolata —
#  vedi roadmap) ed è stata sostituita a tutti gli effetti dalla
#  Kiosk, l'unica sessione standalone testata e confermata
#  funzionante. Il file xlauncher.desktop resta nel repository come
#  riferimento storico ma NON viene più installato né rimosso da
#  qui — su un sistema dove un'installazione precedente lo avesse
#  già messo in xsessions/, resta lì finché non lo si rimuove a
#  mano (`sudo rm /usr/share/xsessions/xlauncher.desktop`).
#
#  v2.2.19-dev.15 — Corretto anche un difetto nei permessi
#  post-installazione: `chmod -R go-w` toglie il bit di scrittura a
#  gruppo/altri ma NON garantisce che lettura/esecuzione siano
#  presenti — se i file sorgente avevano permessi già restrittivi
#  (es. umask 077 in fase di sviluppo/clone), il risultato poteva
#  essere una cartella leggibile dal solo root, inutilizzabile dagli
#  altri utenti senza un chmod manuale da terminale (riscontrato
#  dall'utente). Ora i permessi vengono impostati esplicitamente
#  (755 directory, 644 file, poi +x sugli script), indipendentemente
#  da cosa avesse la sorgente.
#
#  v2.6.6-Mercury — sessione Openbox "Shell" (Step 21: Dashboard e giochi in
#  spazi separati, Xorg + Openbox). Oltre a copiare in /opt i file della
#  sessione (openbox/, spaces.py, tray.py), l'installer prepara per l'UTENTE che
#  ha invocato sudo (non per root) le cartelle e i symlink che una sessione
#  Openbox pulita si aspetta — vedi setup_openbox_session() più sotto.
#
#  v2.7.1-Mercury — congelamento dei giochi negli spazi non correnti (spaces.py):
#  l'installer copia nella cartella dell'utente anche l'esempio
#  spaces-nofreeze.conf.example (giochi da escludere dal congelamento); il file
#  attivo spaces-nofreeze.conf non viene mai creato né toccato. Il comando
#  x-launcher-spaces ora accetta anche freeze on|off|status e thaw [scope].
#
#  v3.0.1-Mars — overlay degli spazi e dei servizi (overlay.py, copertine in
#  ~/.local/share/x-launcher/covers/ riempite dal backend). L'installer: (1) controlla
#  che il venv di /opt possa importare overlay.py (pillow + python-xlib), solo avviso;
#  (2) se un symlink di ~/.config/openbox punta a una copia di SVILUPPO, in un
#  terminale CHIEDE se ripuntarlo a /opt (prima lo lasciava e basta); senza terminale
#  resta com'è, con --relink-openbox si ripunta sempre senza domande. I link
#  /usr/local/bin/x-launcher e x-launcher-spaces vengono sempre ripuntati a /opt.
#
#  Uso:
#    sudo ./install.sh                    # installa/aggiorna /opt/x-launcher
#    sudo ./install.sh --relink-openbox   # idem, e riporta a /opt anche i symlink
#                                         # ~/.config/openbox che puntano altrove
#                                         # (es. a una copia di sviluppo)
#    sudo ./install.sh --no-openbox       # idem, senza toccare ~/.config dell'utente
#    sudo ./install.sh --uninstall        # rimuove /opt/x-launcher e i link
# =============================================================
set -e

INSTALL_DIR="/opt/x-launcher"
BIN_LINK="/usr/local/bin/x-launcher"
# v2.2.19-dev.1 — sessione Kiosk (Wayland/gamescope), vedi nota sopra.
# v2.2.19-dev.15 — unica sessione standalone installata: la vecchia
# X11 (xsessions/) non viene più installata né rimossa da qui.
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
# v2.6.6-Mercury — comando di controllo degli spazi, utile anche da riga di comando.
# (v2.7.1-Mercury: accetta anche freeze on|off|status e thaw [scope];
#  v3.0.1-Mars: anche overlay on|off|open|close|status|key K)
SPACES_CTL_LINK="/usr/local/bin/x-launcher-spaces"

UNINSTALL=0
RELINK_OPENBOX=0
SKIP_OPENBOX=0
for _arg in "$@"; do
  case "$_arg" in
    --uninstall) UNINSTALL=1 ;;
    --relink-openbox) RELINK_OPENBOX=1 ;;
    --no-openbox) SKIP_OPENBOX=1 ;;
    -h|--help) sed -n '/^#  Uso:/,/^# =====/p' "$0"; exit 0 ;;
    *) echo "[INSTALL] Opzione sconosciuta: $_arg (usa --help)"; exit 2 ;;
  esac
done

# -------------------------------------------------------------
# v2.6.6-Mercury — sessione Openbox "Shell" (Step 21).
#
# L'installazione di sistema (rsync in /opt) porta già con sé openbox/, spaces.py
# e tray.py. Qui si prepara la parte PER-UTENTE che la sessione si aspetta, per
# l'utente reale (SUDO_USER), mai per root:
#
#   ~/.config/openbox/            cartella (config dello user, letta da openbox-session)
#     rc.xml        -> /opt/x-launcher/openbox/rc.xml        (symlink)
#     autostart     -> /opt/x-launcher/openbox/autostart     (symlink)
#     spaces-ctl    -> /opt/x-launcher/openbox/spaces-ctl    (symlink)
#   ~/.config/x-launcher/         cartella (layout dei monitor)
#     shell-display.conf.example  copia dell'esempio (sempre aggiornata); la
#                                 shell-display.conf attiva NON viene mai creata
#                                 né toccata: senza, display.sh lavora in
#                                 automatico (output principale = primario o piu'
#                                 grande, gli altri spenti)
#     spaces-nofreeze.conf.example  copia dell'esempio dei giochi da non congelare
#                                 (la spaces-nofreeze.conf attiva NON viene mai
#                                 creata né toccata)
#   ~/.local/share/x-launcher/    cartella dei log della sessione
#
# Prudenza sui file dell'utente:
#   - un FILE normale preesistente (rc.xml/autostart personali) viene spostato in
#     <nome>.bak-<data>, mai cancellato;
#   - un SYMLINK che gia' punta a /opt e' lasciato com'e'; uno che punta ALTROVE
#     (tipicamente una copia di sviluppo) viene lasciato invariato e segnalato,
#     a meno di --relink-openbox — cosi' reinstallare in /opt non rompe un
#     ambiente di sviluppo.
# La sessione in sé è quella fornita dal pacchetto openbox (voce "Openbox" nel
# greeter): qui NON si installa nessun .desktop in xsessions.
# -------------------------------------------------------------
setup_openbox_session() {
  local user="${SUDO_USER:-}" home group
  if [ -z "$user" ] || [ "$user" = "root" ]; then
    echo "[INSTALL] Sessione Openbox: utente reale non determinabile (SUDO_USER) — configurazione utente saltata."
    echo "[INSTALL]   Per farla a mano: mkdir -p ~/.config/openbox && ln -s ${INSTALL_DIR}/openbox/{rc.xml,autostart,spaces-ctl} ~/.config/openbox/"
    return 0
  fi
  home="${INSTALL_USER_HOME:-$(getent passwd "$user" | cut -d: -f6)}"
  if [ -z "$home" ] || [ ! -d "$home" ]; then
    echo "[INSTALL] Sessione Openbox: home di ${user} non trovata — configurazione utente saltata."
    return 0
  fi
  group="$(id -gn "$user" 2>/dev/null || echo "$user")"
  _as_user() { if [ "$(id -u)" = 0 ]; then sudo -u "$user" "$@"; else "$@"; fi; }

  echo "[INSTALL] Sessione Openbox: preparo cartelle e symlink per ${user} (${home})..."
  _as_user mkdir -p "$home/.config/openbox" "$home/.config/x-launcher" "$home/.local/share/x-launcher"

  local name src dst cur bak
  for name in rc.xml autostart spaces-ctl; do
    src="$INSTALL_DIR/openbox/$name"
    dst="$home/.config/openbox/$name"
    if [ ! -e "$src" ]; then
      echo "[INSTALL]   ⚠ manca $src — ${name} non collegato."
      continue
    fi
    if [ -L "$dst" ]; then
      cur="$(readlink "$dst")"
      if [ "$cur" = "$src" ]; then
        echo "[INSTALL]   ok   $dst -> $src"
      elif [ "$RELINK_OPENBOX" = 1 ]; then
        _as_user ln -sfn "$src" "$dst"
        echo "[INSTALL]   ripuntato $dst: $cur -> $src"
      elif [ -t 0 ] && [ -t 1 ]; then
        # v3.0.1-Mars — in un terminale si chiede, invece di lasciare il link alla copia di sviluppo
        local _ans=""
        read -rp "[INSTALL]   $dst punta a $cur (non è /opt: copia di sviluppo?). Ripuntarlo a $src? [S/n] " _ans || _ans=""
        if [[ "$_ans" =~ ^[Nn]$ ]]; then
          echo "[INSTALL]   lasciato $dst -> $cur"
        else
          _as_user ln -sfn "$src" "$dst"
          echo "[INSTALL]   ripuntato $dst: $cur -> $src"
        fi
      else
        echo "[INSTALL]   lasciato $dst -> $cur (non è /opt: copia di sviluppo?). Per ripuntarlo a /opt: sudo ./install.sh --relink-openbox"
      fi
      continue
    fi
    if [ -e "$dst" ]; then
      bak="$dst.bak-$(date +%Y%m%d-%H%M%S)"
      _as_user mv "$dst" "$bak"
      echo "[INSTALL]   backup del file esistente: $bak"
    fi
    _as_user ln -s "$src" "$dst"
    echo "[INSTALL]   creato $dst -> $src"
  done

  if [ -f "$INSTALL_DIR/openbox/shell-display.conf.example" ]; then
    _as_user cp -f "$INSTALL_DIR/openbox/shell-display.conf.example" "$home/.config/x-launcher/shell-display.conf.example"
    if [ -f "$home/.config/x-launcher/shell-display.conf" ]; then
      echo "[INSTALL]   shell-display.conf esistente: non toccato (esempio aggiornato in shell-display.conf.example)"
    else
      echo "[INSTALL]   nessuna shell-display.conf: layout monitor in automatico (esempio in ~/.config/x-launcher/shell-display.conf.example)"
    fi
  fi

  if [ -f "$INSTALL_DIR/openbox/spaces-nofreeze.conf.example" ]; then
    _as_user cp -f "$INSTALL_DIR/openbox/spaces-nofreeze.conf.example" "$home/.config/x-launcher/spaces-nofreeze.conf.example"
    if [ -f "$home/.config/x-launcher/spaces-nofreeze.conf" ]; then
      echo "[INSTALL]   spaces-nofreeze.conf esistente: non toccato (esempio aggiornato in spaces-nofreeze.conf.example)"
    else
      echo "[INSTALL]   congelamento dei giochi attivo per tutti (esclusioni: copia ~/.config/x-launcher/spaces-nofreeze.conf.example in spaces-nofreeze.conf)"
    fi
  fi

  # Dipendenze della sessione: solo avvisi, mai bloccanti.
  local missing="" t
  for t in openbox wmctrl xdotool xrandr python3; do
    command -v "$t" &>/dev/null || missing="$missing $t"
  done
  if [ -n "$missing" ]; then
    echo "[INSTALL]   ⚠ Mancano per la sessione Openbox:${missing}"
    echo "[INSTALL]     Arch:   sudo pacman -S openbox wmctrl xdotool xorg-xrandr"
    echo "[INSTALL]     Debian: sudo apt install openbox wmctrl xdotool x11-xserver-utils"
  fi
  if [ ! -f /usr/share/xsessions/openbox.desktop ]; then
    echo "[INSTALL]   ⚠ /usr/share/xsessions/openbox.desktop assente: la voce \"Openbox\" non comparirà nel greeter finché non installi il pacchetto openbox."
  fi
  if [ ! -x "$INSTALL_DIR/.venv-tray/bin/python3" ]; then
    echo "[INSTALL]   ⚠ ${INSTALL_DIR}/.venv-tray assente: esegui ./build.sh compile prima di installare (tray.py e spaces.py girano con quel python)."
  elif [ -f "$INSTALL_DIR/overlay.py" ]; then
    # v3.0.1-Mars — overlay degli spazi: solo avviso (senza, Select + D-pad cambia spazio direttamente)
    if (cd "$INSTALL_DIR" && "$INSTALL_DIR/.venv-tray/bin/python3" -c 'import overlay; assert overlay.HAVE_PIL and overlay.HAVE_XLIB' &>/dev/null); then
      echo "[INSTALL]   overlay degli spazi: pronto (pillow + python-xlib nel venv)"
    else
      echo "[INSTALL]   ⚠ overlay degli spazi non utilizzabile con il venv di ${INSTALL_DIR} (manca pillow o python-xlib?): esegui ./build.sh compile nella cartella del progetto e reinstalla. Nel frattempo Select + D-pad cambia spazio direttamente."
    fi
  else
    echo "[INSTALL]   ⚠ ${INSTALL_DIR}/overlay.py assente: nessun overlay degli spazi (cambio diretto)."
  fi
}

# Disinstallazione: toglie solo i symlink dell'utente che puntano a /opt/x-launcher/openbox.
# File normali, backup e ~/.config/x-launcher (contiene scelte dell'utente) restano.
cleanup_openbox_session() {
  local user="${SUDO_USER:-}" home name dst cur
  [ -n "$user" ] && [ "$user" != "root" ] || return 0
  home="${INSTALL_USER_HOME:-$(getent passwd "$user" | cut -d: -f6)}"
  [ -n "$home" ] && [ -d "$home/.config/openbox" ] || return 0
  for name in rc.xml autostart spaces-ctl; do
    dst="$home/.config/openbox/$name"
    if [ -L "$dst" ]; then
      cur="$(readlink "$dst")"
      case "$cur" in
        "$INSTALL_DIR"/openbox/*) rm -f "$dst"; echo "[INSTALL] Rimosso symlink $dst" ;;
      esac
    fi
  done
}

if [ "$EUID" -ne 0 ]; then
  echo "[INSTALL] Questo script richiede sudo (scrive in /opt, /usr/local/bin, /usr/share/wayland-sessions)."
  echo "[INSTALL] Riprova con: sudo ./install.sh"
  exit 1
fi

if [ "$UNINSTALL" = 1 ]; then
  echo "[INSTALL] Rimozione di X-Launcher da /opt..."
  cleanup_openbox_session
  rm -rf "$INSTALL_DIR"
  rm -f "$BIN_LINK"
  rm -f "$SPACES_CTL_LINK"
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
#
# v2.2.19-dev.15 — BUG REALE CONFERMATO dall'utente: il vecchio
# `chmod -R go-w` toglie solo il bit di scrittura a gruppo/altri, non
# GARANTISCE che lettura/esecuzione siano presenti — se la sorgente
# aveva già permessi restrittivi (es. umask 077), il risultato restava
# leggibile dal solo root. Permessi ora impostati esplicitamente,
# indipendentemente da cosa avesse la sorgente.
chown -R root:root "$INSTALL_DIR"
find "$INSTALL_DIR" -type d -exec chmod 755 {} +
find "$INSTALL_DIR" -type f -exec chmod 644 {} +
chmod +x "$INSTALL_DIR"/*.sh
# v1.5.0-Venus — scripts/with-env.sh (nuovo, caricamento .env condizionale
# per npm run dev/start) non è coperto dal glob sopra, che guarda solo la
# radice del progetto. Non è strettamente necessario per il funzionamento
# (viene invocato via "bash scripts/with-env.sh ...", bash lo esegue anche
# senza bit +x) ma resta coerente con gli altri script del progetto.
[ -f "$INSTALL_DIR/scripts/with-env.sh" ] && chmod +x "$INSTALL_DIR/scripts/with-env.sh"
# v2.5.1-dev.5 — sessione Openbox "Shell": gli script in openbox/ non sono
# coperti dal glob sopra (solo radice). autostart e spaces-ctl vengono lanciati
# con "sh" e display.sh con "bash", quindi funzionerebbero anche senza, ma il
# bit +x li rende uguali agli altri script del progetto.
for _f in autostart display.sh spaces-ctl; do
  [ -f "$INSTALL_DIR/openbox/$_f" ] && chmod +x "$INSTALL_DIR/openbox/$_f"
done

echo "[INSTALL] Creo il symlink ${BIN_LINK} → ${INSTALL_DIR}/kiosk-launch.sh..."
ln -sf "$INSTALL_DIR/kiosk-launch.sh" "$BIN_LINK"
if [ -f "$INSTALL_DIR/openbox/spaces-ctl" ]; then
  echo "[INSTALL] Creo il symlink ${SPACES_CTL_LINK} → ${INSTALL_DIR}/openbox/spaces-ctl (controllo degli spazi da riga di comando)..."
  ln -sf "$INSTALL_DIR/openbox/spaces-ctl" "$SPACES_CTL_LINK"
fi

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

# v2.6.6-Mercury — cartelle e symlink della sessione Openbox "Shell" per l'utente reale.
if [ "$SKIP_OPENBOX" = 1 ]; then
  echo "[INSTALL] Sessione Openbox: configurazione utente saltata (--no-openbox)."
else
  setup_openbox_session
fi

echo ""
echo "[INSTALL] Completato."
echo "[INSTALL] - Avvio da riga di comando, qualunque cartella: x-launcher"
echo "[INSTALL] - Sessione Kiosk (Wayland/gamescope, senza desktop): selezionabile come 'X-Launcher Kiosk' dal menu sessioni alla schermata di login LightDM."
echo "[INSTALL] - Sessione Openbox 'Shell' (Xorg + Openbox, Dashboard e giochi in spazi separati; Select + D-pad per cambiare spazio): selezionabile come 'Openbox' dal greeter LightDM (richiede il pacchetto openbox). Comando di controllo: x-launcher-spaces state|next|prev|dashboard|switch N|clients|freeze on|off|status|thaw [scope]|overlay on|off|open|close|status. Select + D-pad apre l'overlay degli spazi e dei servizi (spegnerlo: X_LAUNCHER_SPACES_OVERLAY=0 in ~/.config/openbox/environment)."
echo "[INSTALL] - Link xlaunch://<id-gioco> (da browser, script esterni, altre integrazioni) ora avviano il gioco direttamente, aprendo la Dashboard nascosta in background se non è già in esecuzione."
echo "[INSTALL] - Per disinstallare: sudo ${INSTALL_DIR}/install.sh --uninstall (oppure rilancia questo script con --uninstall)"
echo ""
echo "[INSTALL] Integrazione Steam (opzionale, separata — richiede Steam già autenticato almeno una volta):"
echo "[INSTALL]   node ${INSTALL_DIR}/scripts/setup-steam-shortcut.cjs"
echo "[INSTALL]   Aggiunge X-Launcher come Non-Steam Game in Steam, con artwork dedicata."
