#!/usr/bin/env bash
# =============================================================
#  patch-step3-001.sh — Pacchetto base Step 3
#  Classic Console ROM scan:
#  - Scansione ~/Roms/ con sottocartelle per sistema
#  - Watcher ricorsivo con debounce 2s
#  - GET /api/retroarch/cores
#  - PATCH /api/games/:id/retroarch
#  - Overlay adattivo: core RetroArch per ROM, compat per altri
#  - Messaggio installazione se RetroArch non trovato
#
#  Uso:        bash patches/patch-step3-001.sh
#  Ripristina: bash patches/patch-step3-001.sh --restore
# =============================================================
set -e
PATCH_RESTORE="${1:-}"
source "$(dirname "$0")/patch-lib.sh"
patch_init "step3-001" "Classic Console ROM scan + RetroArch core picker"

if [ "$PATCH_RESTORE" = "--restore" ]; then patch_restore; exit 0; fi

patch_backup "src/App.tsx"
patch_backup "src/backend/plugins/classicPlugin.ts"
patch_backup "server.ts"
patch_backup ".env.example"

patch_build
