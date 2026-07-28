#!/usr/bin/env bash
# =============================================================
#  with-env.sh — v1.1.102-dev.1
#
#  Esegue il comando passato come argomenti aggiungendo
#  --env-file=<ENV_PATH> SOLO se il file esiste — stesso identico
#  controllo "if -f" gia usato in kiosk-launch.sh, centralizzato
#  qui per non duplicarlo una terza volta fra gli script "dev" e
#  "start" di package.json.
#
#  Senza questo file, "npm run dev" non ha mai caricato .env in
#  nessun caso.
#
#  Uso: ./scripts/with-env.sh tsx server.ts
#       ./scripts/with-env.sh node dist/server.cjs
# =============================================================
set -e

ENV_FILE="$HOME/.local/share/x-launcher/.env"
BIN="$1"
shift

if [ -f "$ENV_FILE" ]; then
  exec "$BIN" --env-file="$ENV_FILE" "$@"
else
  exec "$BIN" "$@"
fi
