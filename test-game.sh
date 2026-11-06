#!/usr/bin/env bash
# test-game.sh — helper per il test protocol di X-Launcher (v0.99.38)
#
# Con l'introduzione del prompt automatico "ha funzionato?" alla chiusura
# del gioco (vedi notificationEngine.ts / App.tsx, notifiche source
# 'validation'), questo script non è più indispensabile per il flusso
# principale — resta utile per non dover riscrivere a mano curl+jq ogni
# volta per due cose che il prompt automatico non copre:
#   - vedere a colpo d'occhio quali titoli restano da testare
#   - lanciare un gioco per nome (fuzzy) invece che dover conoscere l'id
#
# Richiede: curl, python3 (jq NON richiesto — uso python3 per il parsing
# JSON, già presente su qualunque sistema con X-Launcher installato).
#
# Uso:
#   ./test-game.sh list                 — elenca i titoli installati non ancora verificati
#   ./test-game.sh launch <nome>        — lancia il primo titolo che matcha <nome> (case-insensitive, substring)
#   ./test-game.sh verify <nome> [auto|manual]  — marca verificato (default: manual)
#   ./test-game.sh unverify <nome>      — rimuove il badge (es. dopo una regressione)
#   ./test-game.sh id <nome>            — stampa solo l'id, utile per comporre altre chiamate a mano

set -euo pipefail

DAEMON_URL="${XLAUNCHER_URL:-http://localhost:3000}"

# v3.0.2-dev.3 — il demone richiede un token (audit di sicurezza, SECURITY-AUDIT.md). Lo crea al primo
# avvio in ~/.local/share/x-launcher/api-token (0600). xl_curl = curl che lo aggiunge come header
# (passato via -K da un descrittore, non come argomento: non compare in `ps`). Letto a ogni chiamata.
XL_TOKEN_FILE="$HOME/.local/share/x-launcher/api-token"
xl_curl() {
  local t=""
  [ -r "$XL_TOKEN_FILE" ] && t="$(tr -d '[:space:]' < "$XL_TOKEN_FILE" 2>/dev/null)"
  if [ -n "$t" ]; then
    curl -K <(printf 'header = "X-XLauncher-Token: %s"\n' "$t") "$@"
  else
    curl "$@"
  fi
}

die() { echo "Errore: $*" >&2; exit 1; }

need_bin() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' non trovato nel PATH — richiesto da questo script."
}
need_bin curl
need_bin python3

# Cerca su tutta la libreria (non solo installati) e stampa i risultati
# come righe "id<TAB>title<TAB>store<TAB>installed<TAB>verified".
# Il filtro fuzzy è fatto qui in Python, non lato server — /api/games
# accetta un parametro "search" ma per sicurezza filtriamo comunque
# lato client, così lo script funziona anche se in futuro quel parametro
# dovesse cambiare comportamento.
_fetch_games() {
  xl_curl -sf "${DAEMON_URL}/api/games?store=All" || die "impossibile contattare il daemon su ${DAEMON_URL} — è attivo?"
}

cmd_list() {
  _fetch_games | python3 -c "
import json, sys
games = json.load(sys.stdin)
unverified = [g for g in games if g.get('isInstalled') and not g.get('verified')]
if not unverified:
    print('Nessun titolo installato in attesa di verifica.')
else:
    print(f'{len(unverified)} titolo/i installato/i non ancora verificato/i:')
    for g in sorted(unverified, key=lambda x: x['title']):
        print(f\"  {g['id']:<30} {g['title']} ({g['store']})\")
"
}

_find_game_json() {
  local query="$1"
  _fetch_games | python3 -c "
import json, sys
q = sys.argv[1].lower()
games = json.load(sys.stdin)
matches = [g for g in games if q in g['title'].lower()]
if not matches:
    print('', file=sys.stderr)
    sys.exit(1)
# Preferisci un match installato se ce n'è più di uno
matches.sort(key=lambda g: (not g.get('isInstalled'), g['title']))
print(json.dumps(matches[0]))
" "$query"
}

cmd_id() {
  local query="${1:-}"
  [ -n "$query" ] || die "uso: $0 id <nome>"
  local game_json
  game_json="$(_find_game_json "$query")" || die "nessun gioco trovato per \"$query\""
  echo "$game_json" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])"
}

cmd_launch() {
  local query="${1:-}"
  [ -n "$query" ] || die "uso: $0 launch <nome>"
  local game_json id title
  game_json="$(_find_game_json "$query")" || die "nessun gioco trovato per \"$query\""
  id="$(echo "$game_json"    | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")"
  title="$(echo "$game_json" | python3 -c "import json,sys; print(json.load(sys.stdin)['title'])")"
  echo "Lancio: $title ($id)"
  xl_curl -sf -X POST "${DAEMON_URL}/api/launch" \
    -H 'Content-Type: application/json' \
    -d "{\"id\":\"${id}\"}" | python3 -m json.tool
  echo
  echo "Il prompt \"ha funzionato?\" comparirà nel centro notifiche di X-Launcher alla chiusura del gioco."
  echo "In alternativa: $0 verify \"$query\" [auto|manual]"
}

cmd_verify() {
  local query="${1:-}"
  local method="${2:-manual}"
  [ -n "$query" ] || die "uso: $0 verify <nome> [auto|manual]"
  if [ "$method" != "auto" ] && [ "$method" != "manual" ]; then
    die "method deve essere 'auto' o 'manual', ricevuto: '$method'"
  fi
  local game_json id title
  game_json="$(_find_game_json "$query")" || die "nessun gioco trovato per \"$query\""
  id="$(echo "$game_json"    | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")"
  title="$(echo "$game_json" | python3 -c "import json,sys; print(json.load(sys.stdin)['title'])")"
  xl_curl -sf -X PATCH "${DAEMON_URL}/api/games/${id}/verify" \
    -H 'Content-Type: application/json' \
    -d "{\"method\":\"${method}\"}" >/dev/null
  echo "✅ $title marcato come verificato ($method)."
}

cmd_unverify() {
  local query="${1:-}"
  [ -n "$query" ] || die "uso: $0 unverify <nome>"
  local game_json id title
  game_json="$(_find_game_json "$query")" || die "nessun gioco trovato per \"$query\""
  id="$(echo "$game_json"    | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")"
  title="$(echo "$game_json" | python3 -c "import json,sys; print(json.load(sys.stdin)['title'])")"
  xl_curl -sf -X DELETE "${DAEMON_URL}/api/games/${id}/verify" >/dev/null
  echo "Badge di verifica rimosso per $title."
}

case "${1:-}" in
  list)     cmd_list ;;
  id)       shift; cmd_id "$@" ;;
  launch)   shift; cmd_launch "$@" ;;
  verify)   shift; cmd_verify "$@" ;;
  unverify) shift; cmd_unverify "$@" ;;
  *)
    echo "Uso: $0 {list|id|launch|verify|unverify} [argomenti]"
    echo
    echo "  list                        Elenca i titoli installati non ancora verificati"
    echo "  id <nome>                   Stampa l'id del gioco che matcha <nome>"
    echo "  launch <nome>                Lancia il gioco (il prompt di validazione compare alla chiusura)"
    echo "  verify <nome> [auto|manual]  Marca verificato manualmente (default: manual)"
    echo "  unverify <nome>              Rimuove il badge di verifica"
    exit 1
    ;;
esac
