#!/usr/bin/env bash
# =============================================================
#  patch-step2-003.sh
#  Nuovo modello interazione mouse+tastiera:
#  Click sx = lancia, Click dx = blocca selezione (bordo giallo)
#  Hover aggiorna sidebar solo se selezione non bloccata
#  Esc = sblocca. Controller: A=lancia, X=blocca, B=sblocca
#
#  Uso:           bash patches/patch-step2-003.sh
#  Ripristina:    bash patches/patch-step2-003.sh --restore
# =============================================================
set -e
PATCH_RESTORE="${1:-}"
source "$(dirname "$0")/patch-lib.sh"
patch_init "step2-003" "Nuovo modello interazione mouse e tastiera"

if [ "$PATCH_RESTORE" = "--restore" ]; then patch_restore; exit 0; fi

patch_backup "src/App.tsx"
patch_backup "src/components/FocusProvider.tsx"

patch_build
