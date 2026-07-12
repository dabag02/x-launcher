#!/usr/bin/env bash
# =============================================================
#  patch-step2-002.sh
#  Fix: FocusProvider scroll automatico + Enter corretto
#       Rimosso gestore Enter duplicato in App.tsx
#       Debounce watcher aumentato a 8s per disinstallazione
#
#  Uso:           bash patches/patch-step2-002.sh
#  Ripristina:    bash patches/patch-step2-002.sh --restore
# =============================================================
set -e
PATCH_RESTORE="${1:-}"
source "$(dirname "$0")/patch-lib.sh"
patch_init "step2-002" "Fix FocusProvider scroll e debounce watcher"

if [ "$PATCH_RESTORE" = "--restore" ]; then patch_restore; exit 0; fi

patch_backup "src/App.tsx"
patch_backup "src/components/FocusProvider.tsx"
patch_backup "server.ts"

patch_build
