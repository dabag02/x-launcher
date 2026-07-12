#!/usr/bin/env bash
# =============================================================
#  X-Launcher HTPC — setup automatico per Linux gaming
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

# --- Node.js ---
if ! command -v node &>/dev/null; then
  error "Node.js non trovato. Installazione..."
  if command -v apt &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs build-essential
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm nodejs npm base-devel
  else
    error "Package manager non supportato. Installa Node.js manualmente da https://nodejs.org"
    exit 1
  fi
fi
success "Node.js $(node --version) disponibile"

# --- npm install ---
info "Installazione dipendenze npm..."
npm install
success "Dipendenze installate"

# --- .env ---
if [ ! -f .env ]; then
  cp .env.example .env
  success ".env creato da .env.example"
else
  warn ".env già presente, lasciato invariato"
fi

# --- Tool opzionali ---
echo ""
info "Verifica tool opzionali per gaming Linux:"

check_tool() {
  local bin=$1; local pkg=$2; local desc=$3
  if command -v "$bin" &>/dev/null; then
    success "$desc (${bin}) → trovato"
  else
    warn "$desc (${bin}) → non trovato. Installa con: ${pkg}"
  fi
}

check_tool "steam"        "Scarica da https://store.steampowered.com/about/"   "Steam"
check_tool "wine"         "sudo apt install wine / sudo pacman -S wine"        "Wine"
check_tool "retroarch"    "sudo apt install retroarch"                          "RetroArch"
check_tool "scummvm"      "sudo apt install scummvm"                            "ScummVM"
check_tool "dosbox-staging" "sudo apt install dosbox-staging"                  "DOSBox Staging"
check_tool "gamemoderun"  "sudo apt install gamemode"                           "GameMode"
check_tool "mangohud"     "sudo apt install mangohud"                           "MangoHud"
check_tool "gamescope"    "sudo apt install gamescope"                          "Gamescope"
check_tool "protonup"     "pip install protonup-ng  o  ProtonUp-Qt da Flathub" "ProtonUp CLI"

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
