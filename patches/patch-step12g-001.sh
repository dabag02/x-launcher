#!/usr/bin/env bash
# =============================================================
#  patch-step12g-001 — Light theme fixes + Avatar Library
#
#  Cosa fa:
#    - Fix completo tema light (settings, accounts, system, overlay)
#    - Nuovo sistema gestione avatar via cartella locale
#      ($HOME/.local/share/x-launcher/avatars/)
#    - VirtualKeyboard adatta al tema
#    - Endpoint server GET /api/avatars e GET /api/avatars/:filename
#
#  Uso:
#    bash patches/patch-step12g-001.sh
#    bash patches/patch-step12g-001.sh --restore
# =============================================================
source "$(dirname "$0")/patch-lib.sh"

patch_init "step12g-001" "Light theme fixes + Avatar Library"

# Backup dei file che modifichiamo
patch_backup "server.ts"
patch_backup "src/App.tsx"
patch_backup "src/components/VirtualKeyboard.tsx"

echo ""
echo "[PATCH] I file modificati sono già in src/ — eseguo solo il build."
echo "[PATCH] Se vuoi applicare manualmente il sorgente, copia i file da"
echo "        questa distribuzione e riesegui: npm run build"
echo ""

patch_build
