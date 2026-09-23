#!/usr/bin/env bash
# =============================================================
#  X-Launcher HTPC — setup automatico per Linux gaming
#  v1.5.0-Venus — riscritto per supporto multi-distro
#
#  Distribuzioni supportate: Arch/derivate (pacman), Debian/Ubuntu/
#  derivate (apt), Fedora/RHEL/derivate (dnf).
#
#  STATO DI VERIFICA — onestamente dichiarato, non uniforme:
#    Arch/derivate    → verificato su hardware reale in tutta la
#                        sessione di sviluppo di questo progetto.
#    Debian/Fedora     → nomi pacchetto verificati sulla
#                        documentazione ufficiale di ciascuna
#                        distro (repository ufficiali, non
#                        indovinati), ma MAI testati su una
#                        macchina Debian/Fedora reale. Se qualcosa
#                        non funziona, segnalalo: si corregge con
#                        lo stesso output reale, mai a tentativi.
#
#  Dipendenze FONDAMENTALI (senza le quali le funzioni core non
#  partono) vengono installate automaticamente, previa conferma.
#  Dipendenze RACCOMANDATE (funzioni opzionali: Amazon Games,
#  Steam/ProtonUp per i runner, EAC/BattlEye via Lutris, AI
#  Advisor via Ollama, overlay MangoHud/GameMode, selezione file
#  via Zenity/Kdialog per Sfoglia sui launcher terzi condivisi)
#  vengono SOLO segnalate — l'installazione resta a discrezione
#  dell'utente, subito o in un secondo momento a mano.
# =============================================================
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC} $*"; }

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║   X-Launcher HTPC — Linux Setup   ║"
echo "  ╚═══════════════════════════════════╝"
echo ""

# ---------------------------------------------------------------------------
# Rilevamento distro/package manager
# ---------------------------------------------------------------------------
if command -v pacman &>/dev/null; then
  DISTRO_FAMILY="arch"
  PKG_INSTALL="sudo pacman -S --noconfirm --needed"
elif command -v apt &>/dev/null; then
  DISTRO_FAMILY="debian"
  PKG_INSTALL="sudo apt-get install -y"
elif command -v dnf &>/dev/null; then
  DISTRO_FAMILY="fedora"
  PKG_INSTALL="sudo dnf install -y"
else
  error "Package manager non riconosciuto (atteso pacman/apt/dnf)."
  error "Installa manualmente le dipendenze elencate in INSTALL.md."
  exit 1
fi
success "Famiglia distro rilevata: ${DISTRO_FAMILY}"
if [ "$DISTRO_FAMILY" != "arch" ]; then
  warn "Nomi pacchetto per questa famiglia verificati sulla documentazione"
  warn "ufficiale, ma MAI testati su hardware reale — se qualcosa non va,"
  warn "segnala l'errore esatto invece di ripetere il tentativo alla cieca."
fi
echo ""

# ---------------------------------------------------------------------------
# Node.js — necessario per compilare/eseguire la Dashboard (non incluso
# nell'elenco dipendenze gaming discusso con l'utente, a parte)
# ---------------------------------------------------------------------------
if ! command -v node &>/dev/null; then
  info "Node.js non trovato. Installazione..."
  case "$DISTRO_FAMILY" in
    arch)   $PKG_INSTALL nodejs npm base-devel ;;
    debian) curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            sudo apt-get install -y nodejs build-essential ;;
    fedora) sudo dnf install -y nodejs npm gcc-c++ make ;;
  esac
fi
success "Node.js $(node --version) disponibile"

info "Installazione dipendenze npm..."
npm install
# v2.1.10-dev.1 — npm 12+ blocca di default gli script di installazione dei
# pacchetti nativi (better-sqlite3, esbuild, protobufjs, @google/genai), pur
# con "allowScripts" dichiarato in package.json: la dichiarazione basta per un
# `npm install` a node_modules vuota, ma NON rilancia gli script su pacchetti
# già presenti in node_modules (es. una reinstallazione dopo un aggiornamento
# npm, o un node_modules parzialmente residuo). `npm rebuild` esplicito qui
# copre entrambi i casi senza costo aggiuntivo quando non serve.
info "Verifica script nativi (npm rebuild)..."
npm rebuild
success "Dipendenze npm installate"

if [ ! -f .env ]; then
  cp .env.example .env
  success ".env creato da .env.example"
else
  warn ".env già presente, lasciato invariato"
fi
echo ""

# ---------------------------------------------------------------------------
# Mappatura pacchetto per nome logico → nome reale per famiglia distro.
# Un solo posto da aggiornare se una distro rinomina un pacchetto in futuro.
# ---------------------------------------------------------------------------
pkg_name() {
  local logical="$1"
  case "$DISTRO_FAMILY:$logical" in
    arch:wine)              echo "wine" ;;
    debian:wine)            echo "wine" ;;
    fedora:wine)            echo "wine" ;;
    arch:winetricks)        echo "winetricks" ;;
    debian:winetricks)      echo "winetricks" ;;
    fedora:winetricks)      echo "winetricks" ;;
    arch:retroarch)         echo "retroarch" ;;
    debian:retroarch)       echo "retroarch" ;;
    fedora:retroarch)       echo "retroarch" ;;
    arch:scummvm)           echo "scummvm" ;;
    debian:scummvm)         echo "scummvm" ;;
    fedora:scummvm)         echo "scummvm" ;;
    arch:dosbox)            echo "dosbox-staging" ;;
    debian:dosbox)          echo "dosbox-staging" ;;
    fedora:dosbox)          echo "dosbox-staging" ;;
    arch:lgogdownloader)    echo "lgogdownloader" ;;
    debian:lgogdownloader)  echo "lgogdownloader" ;;
    # v1.5.0-Venus — verificato: pacchetto ufficiale Fedora diretto
    # (packages.fedoraproject.org/pkgs/lgogdownloader), nessun COPR
    # necessario, a differenza di quanto temuto inizialmente.
    fedora:lgogdownloader)  echo "lgogdownloader" ;;
    arch:unzip)             echo "unzip" ;;
    debian:unzip)           echo "unzip" ;;
    fedora:unzip)           echo "unzip" ;;
    # v1.5.0-Venus — p7zip ha nomi diversi fra Debian e le altre due:
    # Debian/Ubuntu impacchetta il tool "7z" dentro p7zip-full, non
    # semplicemente p7zip (che lì è solo le librerie).
    arch:p7zip)             echo "p7zip" ;;
    debian:p7zip)           echo "p7zip-full" ;;
    fedora:p7zip)           echo "p7zip p7zip-plugins" ;;
    arch:pciutils)          echo "pciutils" ;;
    debian:pciutils)        echo "pciutils" ;;
    fedora:pciutils)        echo "pciutils" ;;
    arch:python)            echo "python python-pip" ;;
    debian:python)          echo "python3 python3-pip" ;;
    fedora:python)          echo "python3 python3-pip" ;;
    arch:git)               echo "git" ;;
    debian:git)             echo "git" ;;
    fedora:git)             echo "git" ;;
  esac
}

# ---------------------------------------------------------------------------
# FONDAMENTALI — installate automaticamente (previa conferma unica)
# ---------------------------------------------------------------------------
echo ""
info "Dipendenze FONDAMENTALI (Wine/winetricks, RetroArch, ScummVM,"
info "DOSBox Staging, lgogdownloader, unzip/7zip, Python+pip, pciutils):"
echo ""

read -p "Installare ora le dipendenze fondamentali mancanti? [S/n] " -n 1 -r REPLY
echo ""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  FONDAMENTALI="wine winetricks retroarch scummvm dosbox lgogdownloader unzip p7zip python git pciutils"
  TO_INSTALL=""
  for logical in $FONDAMENTALI; do
    real=$(pkg_name "$logical")
    # binario di riferimento per il check "già presente" — non sempre
    # identico al nome pacchetto (es. dosbox-staging → binario
    # dosbox-staging, p7zip → binario 7z)
    case "$logical" in
      dosbox) bin="dosbox-staging" ;;
      p7zip)  bin="7z" ;;
      python) bin="python3" ;;
      *)      bin="$logical" ;;
    esac
    if command -v "$bin" &>/dev/null; then
      success "$logical → già presente"
    else
      TO_INSTALL="$TO_INSTALL $real"
    fi
  done
  if [ -n "$TO_INSTALL" ]; then
    info "Installo: $TO_INSTALL"
    $PKG_INSTALL $TO_INSTALL
    success "Fondamentali installate"
  else
    success "Tutte le fondamentali erano già presenti"
  fi
else
  warn "Fondamentali saltate — installale a mano prima di usare la Dashboard."
fi

# legendary (Epic Games) — pip, stessa via su qualunque distro, coerente
# con quanto già raccomandato a monte dal progetto stesso.
if ! command -v legendary &>/dev/null; then
  info "legendary (Epic Games) non trovato — installazione via pip..."
  pip install --user legendary-gl 2>/dev/null || pip3 install --user legendary-gl 2>/dev/null \
    && success "legendary installato (via pip)" \
    || warn "Installazione automatica di legendary fallita — vedi INSTALL.md per l'installazione manuale."
else
  success "legendary → già presente"
fi

echo ""
success "Setup delle dipendenze fondamentali completato!"
echo ""

# ---------------------------------------------------------------------------
# RACCOMANDATI — SOLO segnalati, mai installati automaticamente (decisione
# esplicita: sono funzioni opzionali, l'utente decide se/quando usarle).
# ---------------------------------------------------------------------------
echo ""
info "Dipendenze RACCOMANDATE (funzioni opzionali — installale quando/se ti servono):"
echo ""

check_recommended() {
  local bin="$1"; local hint="$2"; local desc="$3"
  if command -v "$bin" &>/dev/null; then
    success "$desc (${bin}) → già presente"
  else
    warn "$desc (${bin}) → non presente. $hint"
  fi
}

case "$DISTRO_FAMILY" in
  arch)
    check_recommended "nile"        "pip install --user git+https://github.com/imLinguin/nile.git  (nessun pacchetto PyPI pulito, l'AUR nile-git è l'alternativa nativa)" "Amazon Games (nile)"
    check_recommended "steam"       "sudo pacman -S steam  (o ProtonUp-Qt via Flathub, vedi sotto)" "Steam"
    check_recommended "protonup"    "pip install --user protonup-ng  oppure  ProtonUp-Qt da Flathub" "ProtonUp CLI"
    check_recommended "lutris"      "sudo pacman -S lutris" "Lutris (EAC/BattlEye)"
    check_recommended "ollama"      "curl -fsSL https://ollama.com/install.sh | sh" "Ollama (AI Advisor)"
    check_recommended "mangohud"    "sudo pacman -S mangohud" "MangoHud"
    check_recommended "gamemoderun" "sudo pacman -S gamemode" "GameMode"
    check_recommended "zenity"      "sudo pacman -S zenity" "Zenity (selezione file — Sfoglia per installer launcher terzi)"
    check_recommended "kdialog"     "sudo pacman -S kdialog  (di norma già presente su Plasma/KDE)" "Kdialog (alternativa a Zenity su desktop KDE)"
    check_recommended "umu-run"     "sudo pacman -S umu-launcher  (repository multilib)" "Umu-launcher (switch Compatibility Layer — container Steam Linux Runtime)"
    ;;
  debian)
    check_recommended "nile"        "pip install --user git+https://github.com/imLinguin/nile.git  (nessun pacchetto .deb noto)" "Amazon Games (nile)"
    check_recommended "steam"       "sudo apt install steam  (richiede repository multiverse/non-free — o ProtonUp-Qt da Flathub, vedi sotto)" "Steam"
    check_recommended "protonup"    "pip install --user protonup-ng  oppure  ProtonUp-Qt da Flathub" "ProtonUp CLI"
    check_recommended "lutris"      "sudo apt install lutris  (potrebbe richiedere il repository di Lutris, vedi lutris.net)" "Lutris (EAC/BattlEye)"
    check_recommended "ollama"      "curl -fsSL https://ollama.com/install.sh | sh" "Ollama (AI Advisor)"
    check_recommended "mangohud"    "sudo apt install mangohud" "MangoHud"
    check_recommended "gamemoderun" "sudo apt install gamemode" "GameMode"
    check_recommended "zenity"      "sudo apt install zenity" "Zenity (selezione file — Sfoglia per installer launcher terzi)"
    check_recommended "kdialog"     "sudo apt install kdialog  (di norma già presente su Kubuntu/Plasma)" "Kdialog (alternativa a Zenity su desktop KDE)"
    check_recommended "umu-run"     "nessun pacchetto ufficiale nei repo — scarica il .deb per la tua versione (debian-12/13/ubuntu-noble) da https://github.com/Open-Wine-Components/umu-launcher/releases e installa con: sudo dpkg -i python3-umu-launcher_*.deb" "Umu-launcher (switch Compatibility Layer — container Steam Linux Runtime)"
    ;;
  fedora)
    check_recommended "nile"        "pip install --user git+https://github.com/imLinguin/nile.git  (nessun pacchetto RPM noto)" "Amazon Games (nile)"
    check_recommended "steam"       "sudo dnf install steam  (richiede RPM Fusion nonfree — o ProtonUp-Qt da Flathub, vedi sotto)" "Steam"
    check_recommended "protonup"    "pip install --user protonup-ng  oppure  ProtonUp-Qt da Flathub" "ProtonUp CLI"
    check_recommended "lutris"      "sudo dnf install lutris  (richiede RPM Fusion)" "Lutris (EAC/BattlEye)"
    check_recommended "ollama"      "curl -fsSL https://ollama.com/install.sh | sh" "Ollama (AI Advisor)"
    check_recommended "mangohud"    "sudo dnf install mangohud" "MangoHud"
    check_recommended "gamemoderun" "sudo dnf install gamemode" "GameMode"
    check_recommended "zenity"      "sudo dnf install zenity" "Zenity (selezione file — Sfoglia per installer launcher terzi)"
    check_recommended "kdialog"     "sudo dnf install kdialog  (di norma già presente su Fedora KDE Spin)" "Kdialog (alternativa a Zenity su desktop KDE)"
    check_recommended "umu-run"     "nessun pacchetto ufficiale nei repo — scarica l'rpm per la tua versione (fcNN) da https://github.com/Open-Wine-Components/umu-launcher/releases e installa con: sudo dnf install ./umu-launcher-*.rpm" "Umu-launcher (switch Compatibility Layer — container Steam Linux Runtime)"
    ;;
esac

# FSR — NON è un pacchetto a sé: è una capacità della versione di Wine
# installata (>= 7.x), verificato in compatibilityManager.ts. Nessuna
# installazione separata possibile né necessaria.
info "FSR (Wine): nessuna installazione separata — disponibile automaticamente"
info "con Wine >= 7.x (verificato: già installato sopra se mancante)."

echo ""
success "Setup completato!"
echo ""
echo "  Avvio sviluppo:   npm run dev"
echo "  Build produzione: npm run build && npm start"
echo ""
echo "  Per HTPC/kiosk mode, usa:"
echo "  ./kiosk-launch.sh"
echo "  (supporta Firefox e Chromium automaticamente)"
echo ""
