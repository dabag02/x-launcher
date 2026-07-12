#!/usr/bin/env bash
# =============================================================
#  patch-step2-005.sh
#  Nuovo UX:
#  - Click sx = lancia, Click dx = overlay opzioni avanzate
#  - Sidebar ridotta a sole info (titolo, genere, piattaforma, ore, achievements)
#  - Pulsante play rimosso dalla sidebar
#  - Overlay opzioni: runner, compat toggles, executable path, launch button
#  - Card blu = installato, card rossa = non installato
#  - Fix SSE: notifyLibraryUpdated registrato prima di waitReady
#  - Fix hover: disableHoverFocus sulle card, hover controllato da App.tsx
#  - Rimosso vecchio overlay showCompatMenu
#
#  Uso:        bash patches/patch-step2-005.sh
#  Ripristina: bash patches/patch-step2-005.sh --restore
# =============================================================
set -e
PATCH_RESTORE="${1:-}"
source "$(dirname "$0")/patch-lib.sh"
patch_init "step2-005" "Nuovo UX overlay opzioni + sidebar info + card colori"

if [ "$PATCH_RESTORE" = "--restore" ]; then patch_restore; exit 0; fi

patch_backup "src/App.tsx"
patch_backup "src/components/FocusProvider.tsx"
patch_backup "server.ts"

patch_build
