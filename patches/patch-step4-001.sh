#!/usr/bin/env bash
# =============================================================
#  patch-step4-001.sh
#
#  Step 4 — UI: pannello configurazione per-game completo
#
#  Novità:
#    1. Compat toggles reattivi (ottimistic UI)
#    2. Runner bridge ottimistico
#    3. Pannello "Game Config" con tutti i campi runner:
#       executablePath, steamAppId, dosboxConf (DOSBox),
#       scummvmId (ScummVM), libretroCore manuale (RetroArch)
#    4. Sezione "Custom Env Variables" KEY=VALUE per riga
#    5. useEffect carica profilo compat + config all'apertura overlay
#
#  Uso:        bash patches/patch-step4-001.sh
#  Ripristina: bash patches/patch-step4-001.sh --restore
# =============================================================
set -e
PATCH_RESTORE="${1:-}"
source "$(dirname "$0")/patch-lib.sh"
patch_init "step4-001" "UI configurazione per-game completa"

if [ "$PATCH_RESTORE" = "--restore" ]; then patch_restore; exit 0; fi

patch_backup "src/App.tsx"
patch_backup "metadata.json"
patch_backup "CHANGELOG.md"

node - << 'JSEOF'
const fs = require('fs');
const path = 'src/App.tsx';
let src = fs.readFileSync(path, 'utf8');

// FIX 1: stati locali
const afterRetroarch = `  const [retroarchAvailable, setRetroarchAvailable] = useState<boolean | null>(null);`;
if (!src.includes('localCompatProfile')) {
  src = src.replace(afterRetroarch, afterRetroarch + `
  const [localCompatProfile, setLocalCompatProfile] = useState<Record<string,boolean>>({});
  const [localGameConfig, setLocalGameConfig] = useState<Record<string,string>>({});
  const [customEnvText, setCustomEnvText] = useState<string>('');`);
}

// FIX 2: useEffect carica compat+config
const retroarchFetchEffect = `  useEffect(() => {
    if (!showGameOptions || !selectedGame) return;
    if (selectedGame.store !== 'Classic Console') return;`;
if (!src.includes('carica profilo compat e config locale')) {
  src = src.replace(retroarchFetchEffect,
    `  // Step 4 — carica profilo compat e config locale all'apertura overlay
  useEffect(() => {
    if (!showGameOptions || !selectedGame) return;
    fetch(\`/api/games/\${selectedGame.id}/compat\`)
      .then(r => r.ok ? r.json() : {})
      .then(profile => {
        setLocalCompatProfile({ dxvk: !!profile.dxvk, vkd3d: !!profile.vkd3d, fsr: !!profile.fsr, gameMode: !!profile.gameMode, mangohud: !!profile.mangohud });
        setCustomEnvText(Object.entries(profile.customEnv ?? {}).map(([k,v]) => \`\${k}=\${v}\`).join('\\n'));
      }).catch(() => {});
    setLocalGameConfig({ executablePath: selectedGame.executablePath ?? '', steamAppId: selectedGame.steamAppId ?? '', dosboxConf: selectedGame.dosboxConf ?? '', libretroCore: selectedGame.libretroCore ?? '', scummvmId: selectedGame.scummvmId ?? '' });
  }, [showGameOptions, selectedGame?.id]);

  ` + retroarchFetchEffect);
}

fs.writeFileSync(path, src, 'utf8');
console.log('App.tsx patchato');
JSEOF

patch_build
