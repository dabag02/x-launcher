#!/usr/bin/env bash
# =============================================================
#  patch-step3-005.sh
#
#  Fix 1 — RetroArch flatpak non rilevato dal daemon
#    Il daemon gira in un environment systemd con PATH ridotto.
#    retroarch instalato via flatpak non è visibile con `which`.
#    Fix: findRetroarchBin() prova in ordine: PATH di sistema,
#    `flatpak info org.libretro.RetroArch`, path assoluti comuni.
#    Il launch gestisce correttamente lo spawn di flatpak
#    separando binary e argomenti.
#
#  Fix 2 — Core flatpak non trovati da /api/retroarch/cores
#    I core flatpak stanno in:
#    ~/.var/app/org.libretro.RetroArch/config/retroarch/cores/
#    non rilevata dalle patch precedenti. Aggiunta alla lista.
#
#  Fix 3 — Core picker non funziona col gamepad
#    I bottoni core erano <button> plain — il gamepad naviga
#    tramite <Focusable> con onEnter. Enter non triggerava mai
#    onClick. Fix: ogni bottone core wrappato in <Focusable
#    id="core-N" onEnter={...}> con render prop (isFocused) => ...
#    come richiesto dalla firma di Focusable.
#
#  Fix 4 — Cartella MS non riconosciuta dalla SYSTEM_MAP
#    La mappa aveva solo 'sms' come chiave. La cartella ~/Roms/MS
#    diventava 'ms' ma non matchava. Aggiunte chiavi 'ms' e
#    'mastersystem' per coprire le nomenclature più comuni.
#
#  Fix 5 — ROM Master System non scansionate (estensione .sms)
#    Il plugin cercava solo file .zip. Le ROM SMS native hanno
#    estensione .sms. Aggiunta ROM_EXTENSIONS con tutte le
#    estensioni native delle console supportate.
#
#  Uso:        bash patches/patch-step3-005.sh
#  Ripristina: bash patches/patch-step3-005.sh --restore
# =============================================================
set -e
PATCH_RESTORE="${1:-}"
source "$(dirname "$0")/patch-lib.sh"
patch_init "step3-005" "Fix RetroArch flatpak + core picker gamepad + MS detection + ROM extensions"

if [ "$PATCH_RESTORE" = "--restore" ]; then patch_restore; exit 0; fi

patch_backup "src/backend/runners/implementations.ts"
patch_backup "server.ts"
patch_backup "src/App.tsx"
patch_backup "src/backend/plugins/classicPlugin.ts"

patch_build
