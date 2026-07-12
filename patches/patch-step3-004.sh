#!/usr/bin/env bash
# =============================================================
#  patch-step3-004.sh
#
#  Fix 1 — RetroArchRunner: core name → path assoluto
#    classicPlugin salva solo il nome file del core (es.
#    "genesis_plus_gx_libretro.so"). RetroArch vuole il path
#    assoluto con -L; passare solo il nome file lo avvia senza
#    core (silente, ROM non parte).
#    Fix: resolveCore() cerca il file nelle directory standard
#    di libretro e restituisce il path completo.
#
#  Fix 2 — /api/retroarch/cores: deduplicazione per realpath
#    Su molte distro i core sono in una cartella ma linkati
#    da un'altra → la lista UI mostrava ogni core due volte.
#    Fix: realpathSync() per riconoscere i symlink + cartelle
#    utente con priorità su quelle di sistema + sort alfabetico.
#
#  Fix 3 — Core picker overlay: stato React aggiornato subito
#    Dopo PATCH /api/games/:id/retroarch il bottone selezionato
#    non si evidenziava e la scelta spariva al riavvio perché
#    lo stato games[] non veniva aggiornato localmente.
#    Fix: setGames() ottimistico dopo risposta ok del server.
#
#  Uso:        bash patches/patch-step3-004.sh
#  Ripristina: bash patches/patch-step3-004.sh --restore
# =============================================================
set -e
PATCH_RESTORE="${1:-}"
source "$(dirname "$0")/patch-lib.sh"
patch_init "step3-004" "Fix RetroArch core resolution + dedup + core picker state"

if [ "$PATCH_RESTORE" = "--restore" ]; then patch_restore; exit 0; fi

patch_backup "src/backend/runners/implementations.ts"
patch_backup "server.ts"
patch_backup "src/App.tsx"

patch_build
