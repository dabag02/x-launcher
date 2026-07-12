#!/usr/bin/env bash
# =============================================================
#  patch-step2-004.sh
#  Fix: UI si aggiorna in tempo reale quando il daemon
#       modifica la libreria (installazione/disinstallazione Steam)
#  Implementazione: Server-Sent Events (SSE)
#  - GET /api/events → stream SSE
#  - gameManager.onLibraryRefreshed() → notifica tutti i client
#  - App.tsx EventSource → fetch automatico alla ricezione evento
#
#  Uso:           bash patches/patch-step2-004.sh
#  Ripristina:    bash patches/patch-step2-004.sh --restore
# =============================================================
set -e
PATCH_RESTORE="${1:-}"
source "$(dirname "$0")/patch-lib.sh"
patch_init "step2-004" "SSE: aggiornamento UI in tempo reale"

if [ "$PATCH_RESTORE" = "--restore" ]; then patch_restore; exit 0; fi

patch_backup "src/App.tsx"
patch_backup "src/backend/gameManager.ts"
patch_backup "server.ts"

patch_build
