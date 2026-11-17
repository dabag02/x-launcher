#!/usr/bin/env bash
# X-Launcher — prova dell'accesso a un servizio di condivisione dal terminale (v3.2.29-dev.11).
#
# Serve finché la Dashboard non ha la sua finestra di accesso (dev.12). Usa le stesse rotte della
# Dashboard (/api/share/*) col token del demone; non salva nulla per conto suo.
#
#   bash scripts/share-login.sh                  # stato dei servizi
#   bash scripts/share-login.sh youtube          # accesso: mostra indirizzo e codice, attende l'approvazione
#   bash scripts/share-login.sh youtube verify   # controlla che l'accesso sia ancora valido (rinnovo del token)
#   bash scripts/share-login.sh youtube logout   # scollega l'account
#
# Variabili: XL_URL (predefinito http://127.0.0.1:3000).
set -u
URL="${XL_URL:-http://127.0.0.1:3000}"
TOKEN_FILE="$HOME/.local/share/x-launcher/api-token"
[ -r "$TOKEN_FILE" ] || { echo "Token del demone non trovato: $TOKEN_FILE"; exit 1; }
TOKEN="$(cat "$TOKEN_FILE")"
api() { curl -sS -H "X-XLauncher-Token: $TOKEN" -H 'Content-Type: application/json' "$@"; }
pretty() { if command -v python3 >/dev/null; then python3 -m json.tool; else cat; fi; }

ID="${1:-}"
ACTION="${2:-login}"

if [ -z "$ID" ]; then api "$URL/api/share/providers" | pretty; exit 0; fi
case "$ACTION" in
  verify) api "$URL/api/share/providers?verify=1" | pretty; exit 0 ;;
  logout) api -X POST "$URL/api/share/$ID/logout" | pretty; exit 0 ;;
  login) ;;
  *) echo "Azione sconosciuta: $ACTION (login, verify, logout)"; exit 1 ;;
esac

START="$(api -X POST "$URL/api/share/$ID/login")"
read -r OK CODE VURL ERR < <(printf '%s' "$START" | python3 -c '
import json,sys
j=json.load(sys.stdin); l=j.get("login") or {}
print("1" if j.get("success") else "0", l.get("userCode","-"), l.get("verificationUrl","-"), j.get("code","-"))')
if [ "$OK" != "1" ]; then echo "Accesso non avviato: $ERR"; echo "$START"; exit 1; fi

trap 'api -X DELETE "$URL/api/share/$ID/login" >/dev/null; echo; echo "Annullato."; exit 130' INT
echo
echo "  Apri sul telefono:  $VURL"
echo "  Inserisci il codice: $CODE"
echo
echo "In attesa dell'approvazione (Ctrl+C per annullare)…"
while sleep 3; do
  STATE="$(api "$URL/api/share/$ID/login" | python3 -c '
import json,sys
l=(json.load(sys.stdin).get("login") or {})
s=l.get("state","?")
if s=="done": print("done", l["account"]["name"])
elif s=="error": print("error", l.get("code"))
else: print(s, "-")')"
  set -- $STATE
  case "$1" in
    pending) ;;
    done) shift; echo "Collegato: $*"; exit 0 ;;
    *) echo "Accesso non riuscito: $*  (dettagli: grep '\[SHARE\]' ~/.local/share/x-launcher/daemon.log)"; exit 1 ;;
  esac
done
