#!/usr/bin/env bash
# =============================================================
#  patch-step3-002.sh
#  Fix 1: makeGameId usava base64 con caratteri speciali (+/=)
#          che causavano collisioni ID su SQLite → solo 1 ROM visibile su 4
#          Ora usa hash numerico + nome file safe
#  Fix 2: SSE e polling non resetano più selectedGameId se il gioco
#          è ancora in lista — overlay non cambia più gioco da solo
#  Fix 3: Log dettagliato per ogni ROM trovata (debug futuro)
#
#  Uso:        bash patches/patch-step3-002.sh
#  Ripristina: bash patches/patch-step3-002.sh --restore
# =============================================================
set -e
PATCH_RESTORE="${1:-}"
source "$(dirname "$0")/patch-lib.sh"
patch_init "step3-002" "Fix ROM ID collision + fix overlay selezione"

if [ "$PATCH_RESTORE" = "--restore" ]; then patch_restore; exit 0; fi

patch_backup "src/backend/plugins/classicPlugin.ts"
patch_backup "src/App.tsx"

patch_build
