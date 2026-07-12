#!/usr/bin/env bash
# =============================================================
#  patch-lib.sh — Libreria condivisa per il sistema di patch
#  NON eseguire direttamente. Source-ato dalle singole patch.
#
#  Uso nelle patch:
#    source "$(dirname "$0")/patch-lib.sh"
#    patch_init "step2-001" "Descrizione della patch"
#    patch_backup "src/backend/gameManager.ts"
#    patch_backup "server.ts"
#    # ... modifica i file ...
#    patch_build
#
#  Per ripristinare:
#    bash patches/patch-step2-001.sh --restore
# =============================================================

PATCH_NAME=""
PATCH_DIR=""
BACKUP_DIR=""

patch_init() {
  local name="$1"
  local description="$2"
  PATCH_NAME="$name"
  PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
  PROJECT_DIR="$(cd "$PATCH_DIR/.." && pwd)"
  BACKUP_DIR="$PATCH_DIR/.backups/$PATCH_NAME"

  echo "=================================================="
  echo " PATCH: $PATCH_NAME"
  echo " $description"
  echo "=================================================="
  echo " Progetto: $PROJECT_DIR"

  [ -f "$PROJECT_DIR/package.json" ] || {
    echo "ERRORE: $PROJECT_DIR non è la cartella x-launcher"
    exit 1
  }
  cd "$PROJECT_DIR"

  # Se --restore è passato come argomento, ripristina e termina
  if [[ "${1:-}" == "--restore" ]] || [[ "${PATCH_RESTORE:-}" == "1" ]]; then
    patch_restore
    exit 0
  fi
}

patch_backup() {
  local file="$1"
  local backup_path="$BACKUP_DIR/$file"
  local backup_folder="$(dirname "$backup_path")"

  if [ ! -f "$PROJECT_DIR/$file" ]; then
    echo "[BACKUP] WARN: $file non esiste, skip."
    return
  fi

  mkdir -p "$backup_folder"
  cp "$PROJECT_DIR/$file" "$backup_path"
  echo "[BACKUP] $file → .backups/$PATCH_NAME/$file"
}

patch_restore() {
  echo ""
  echo "[RESTORE] Ripristino $PATCH_NAME..."

  if [ ! -d "$BACKUP_DIR" ]; then
    echo "[RESTORE] ERRORE: Nessun backup trovato in $BACKUP_DIR"
    echo "[RESTORE] La patch non è mai stata applicata o il backup è stato cancellato."
    exit 1
  fi

  # Ripristina tutti i file nel backup mantenendo la struttura
  find "$BACKUP_DIR" -type f | while read -r backup_file; do
    local relative="${backup_file#$BACKUP_DIR/}"
    cp "$backup_file" "$PROJECT_DIR/$relative"
    echo "[RESTORE] ✅ $relative"
  done

  echo ""
  echo "[RESTORE] File ripristinati. Ricompilo..."
  cd "$PROJECT_DIR" && npm run build
  echo "[RESTORE] ✅ Ripristino completato. Riavvia con: ./kiosk-launch.sh chromium"
}

patch_build() {
  echo ""
  echo "[BUILD] Compilazione..."
  cd "$PROJECT_DIR" && npm run build
  echo ""
  echo "✅ Patch $PATCH_NAME applicata."
  echo "   Per ripristinare: bash patches/patch-${PATCH_NAME}.sh --restore"
}
