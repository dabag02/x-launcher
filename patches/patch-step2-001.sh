#!/usr/bin/env bash
# =============================================================
#  patch-step2-001.sh
#  Fix: A/Enter su card sposta focus su play button
#       B/Esc riporta il focus alla libreria
#       Watcher Steam rileva anche la disinstallazione
#
#  Uso:           bash patches/patch-step2-001.sh
#  Ripristina:    bash patches/patch-step2-001.sh --restore
# =============================================================
set -e
PATCH_RESTORE="${1:-}"
source "$(dirname "$0")/patch-lib.sh"
patch_init "step2-001" "Fix focus play button e watcher Steam"

if [ "$PATCH_RESTORE" = "--restore" ]; then patch_restore; exit 0; fi

patch_backup "src/App.tsx"
patch_backup "src/components/FocusProvider.tsx"
patch_backup "server.ts"

# I sorgenti nel pacchetto sono già aggiornati
patch_build
