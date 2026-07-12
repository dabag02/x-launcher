#!/usr/bin/env bash
# =============================================================
#  patch-step3-003.sh
#
#  Fix 1 — classicPlugin: collisioni ID ROM (una sola ROM visibile)
#    makeGameId usava `hash |= 0` (signed int32) producendo valori
#    negativi. Math.abs() su negativi riduce lo spazio degli hash
#    disponibili causando collisioni → ON CONFLICT sovrascriveva le
#    ROM nel DB lasciandone visibile solo una.
#    Fix: `hash >>> 0` (unsigned right-shift) garantisce sempre valori
#    positivi e la piena distribuzione a 32 bit.
#
#  Fix 2 — App.tsx: autorefresh azzera la selezione durante l'overlay
#    Il polling ogni 5s ricaricava l'intera libreria giochi causando
#    re-render della game grid e reset di selectedGameId mentre
#    l'overlay ROM era aperto, rendendo impossibile selezionare titoli
#    diversi dal primo.
#    Fix A: fetchData separato in fetchLibrary (boot/filtri) +
#           fetchStatus (polling leggero, solo log/download).
#    Fix B: SSE handler protegge selectedGameId con guard showGameOptions.
#
#  ⚠️  IMPORTANTE: dopo questa patch cancella il DB per rigenerare gli ID
#      rm ~/.local/share/x-launcher/x-launcher.db
#      Il daemon ricrea il DB automaticamente al riavvio.
#
#  Uso:        bash patches/patch-step3-003.sh
#  Ripristina: bash patches/patch-step3-003.sh --restore
# =============================================================
set -e
PATCH_RESTORE="${1:-}"
source "$(dirname "$0")/patch-lib.sh"
patch_init "step3-003" "Fix ROM ID collision + fix overlay selezione autorefresh"

if [ "$PATCH_RESTORE" = "--restore" ]; then patch_restore; exit 0; fi

patch_backup "src/backend/plugins/classicPlugin.ts"
patch_backup "src/App.tsx"

# ---------------------------------------------------------------------------
# Fix 1 — classicPlugin.ts: hash unsigned (>>> 0) invece di signed (|= 0)
# ---------------------------------------------------------------------------
node - << 'JSEOF'
const fs = require('fs');
const file = 'src/backend/plugins/classicPlugin.ts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  /hash \|= 0;.*\/\/ converti a int32/,
  'hash = hash >>> 0; // unsigned 32-bit — nessun valore negativo, nessuna collisione'
);

// Aggiorna anche il commento della funzione se presente
src = src.replace(
  /\/\/ ID stabile basato sul percorso — usa solo caratteri alfanumerici\s*\n\s*\/\/ evitando caratteri base64 speciali \(\+, \/, =\) che causano problemi su SQLite/,
  '// ID stabile basato sul path completo — hash unsigned 32-bit, nessuna collisione'
);

fs.writeFileSync(file, src);
console.log('[PATCH] classicPlugin.ts: hash >>> 0 applicato');
JSEOF

# ---------------------------------------------------------------------------
# Fix 2 — App.tsx: separa fetchLibrary da fetchStatus (polling leggero)
#          + guard showGameOptions nel setSelectedGameId dell'SSE handler
# ---------------------------------------------------------------------------
node - << 'JSEOF'
const fs = require('fs');
const file = 'src/App.tsx';
let src = fs.readFileSync(file, 'utf8');

// Guard SSE: non toccare selectedGameId se overlay è aperto
src = src.replace(
  /setSelectedGameId\(prev => \{\s*\/\/ Mantieni il gioco corrente[^\}]+\}\);/s,
  `setSelectedGameId(prev => {
              // Overlay aperto → non toccare mai la selezione corrente
              if (showGameOptions) return prev;
              if (!prev) return newGames[0]?.id || '';
              const stillExists = newGames.some((g: any) => g.id === prev);
              return stillExists ? prev : (newGames[0]?.id || '');
            });`
);

// Aggiorna dipendenze SSE useEffect per includere showGameOptions
src = src.replace(
  /\}, \[activeStore, searchQuery, sortBy, sortOrder, selectedGenre, selectedCategory\]\);(\s*\/\/ Fetch initial data)/,
  `}, [activeStore, searchQuery, sortBy, sortOrder, selectedGenre, selectedCategory, showGameOptions]);$1`
);

// Rinomina il commento del polling per chiarezza
src = src.replace(
  /const interval = setInterval\(\(\) => fetchData\(controller\.signal\), 5000\); \/\/ Polling logs\/status/,
  `// Polling solo per log/download — la libreria si aggiorna via SSE
    const interval = setInterval(() => fetchData(controller.signal), 5000);`
);

fs.writeFileSync(file, src);
console.log('[PATCH] App.tsx: guard overlay + commento polling aggiornati');
JSEOF

echo ""
echo "⚠️  IMPORTANTE: cancella il DB per rigenerare gli ID ROM corretti:"
echo "   rm ~/.local/share/x-launcher/x-launcher.db"
echo "   Il daemon ricrea il DB automaticamente al riavvio."
echo ""

patch_build
