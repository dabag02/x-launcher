#!/bin/bash
# =============================================================================
#  upload-github.sh — pubblicazione interattiva del progetto/aggiornamenti
#  su GitHub, con esclusione automatica dei file di backup (.bak, .bak0,
#  .bak1, .bak2, ecc.) ovunque si trovino nell'albero del progetto.
#
#  v3.0.1-Mars — esclude SEMPRE anche il codice compilato e gli ambienti
#  generati: dist/ (build Vite + server.cjs), dist-server/, node_modules/,
#  .venv-tray/ (venv Python del tray/overlay), __pycache__/ e *.pyc,
#  *.tsbuildinfo. Le regole vengono aggiunte al .gitignore se mancano, le
#  cartelle già finite per errore nel repository vengono tolte dal
#  tracciamento (git rm --cached: i file su disco restano) e, dopo
#  "git add", si verifica che niente di tutto questo sia in staging.
#
#  Uso:
#    chmod +x upload-github.sh
#    ./upload-github.sh
# =============================================================================

set -e

# Colori minimi per leggibilità — nessuna dipendenza esterna
verde()  { echo -e "\033[32m$1\033[0m"; }
giallo() { echo -e "\033[33m$1\033[0m"; }
rosso()  { echo -e "\033[31m$1\033[0m"; }

echo "=== X-Launcher — Upload su GitHub ==="
echo

# -----------------------------------------------------------------------
# 1) Repository Git — inizializza se non esiste
# -----------------------------------------------------------------------
if [ ! -d .git ]; then
  giallo "Nessun repository Git trovato in questa cartella."
  read -rp "Vuoi inizializzarlo ora? [s/N] " init_choice
  if [[ "$init_choice" =~ ^[Ss]$ ]]; then
    git init
    git branch -M main
    verde "Repository inizializzato."
  else
    rosso "Operazione annullata."
    exit 1
  fi
fi

# -----------------------------------------------------------------------
# 2) .gitignore — assicura la regola *.bak* (qualunque suffisso numerico)
# -----------------------------------------------------------------------
GITIGNORE=".gitignore"
[ -f "$GITIGNORE" ] || touch "$GITIGNORE"

if ! grep -qE '^\*\.bak\*?$' "$GITIGNORE" 2>/dev/null; then
  {
    echo ""
    echo "# File di backup (.bak, .bak0, .bak1, .bak2, ...) — aggiunto"
    echo "# automaticamente da upload-github.sh"
    echo "*.bak*"
  } >> "$GITIGNORE"
  verde "Aggiunta la regola '*.bak*' al .gitignore."
fi

# -----------------------------------------------------------------------
# 2b) Codice compilato e ambienti generati — mai versionati
#     (stessa lista nel .gitignore, nella rimozione dal tracciamento e nel
#      controllo finale sullo staging)
# -----------------------------------------------------------------------
EXCLUDE_DIRS=(dist dist-server node_modules .venv-tray __pycache__)
EXCLUDE_GLOBS=('*.pyc' '*.tsbuildinfo')

for d in "${EXCLUDE_DIRS[@]}"; do
  if ! grep -qE "^/?${d//./\\.}/?$" "$GITIGNORE" 2>/dev/null; then
    {
      echo ""
      echo "# Codice compilato / ambiente generato — aggiunto da upload-github.sh"
      echo "${d}/"
    } >> "$GITIGNORE"
    verde "Aggiunta la regola '${d}/' al .gitignore."
  fi
done
for g in "${EXCLUDE_GLOBS[@]}"; do
  if ! grep -qxF "$g" "$GITIGNORE" 2>/dev/null; then
    printf '\n# Codice compilato — aggiunto da upload-github.sh\n%s\n' "$g" >> "$GITIGNORE"
    verde "Aggiunta la regola '${g}' al .gitignore."
  fi
done

# Se in passato qualcosa di tutto questo è finito nel repository, lo si toglie
# dal tracciamento (i file restano su disco): .gitignore da solo non basta per
# file già tracciati.
TRACKED_EXCL=$(git ls-files 2>/dev/null | grep -E '(^|/)(dist|dist-server|node_modules|\.venv-tray|__pycache__)/|\.pyc$|\.tsbuildinfo$' || true)
if [ -n "$TRACKED_EXCL" ]; then
  giallo "Questi file compilati/generati risultano già tracciati — li tolgo dal repository (restano sul disco):"
  echo "$TRACKED_EXCL" | head -20
  [ "$(echo "$TRACKED_EXCL" | wc -l)" -gt 20 ] && echo "... e altri $(( $(echo "$TRACKED_EXCL" | wc -l) - 20 ))"
  echo "$TRACKED_EXCL" | xargs -r -d '\n' git rm --cached -q --
fi

# -----------------------------------------------------------------------
# 3) Ricerca file .bak* effettivamente presenti — solo informativo,
#    il .gitignore sopra li tiene già fuori da Git
# -----------------------------------------------------------------------
echo
echo "--- Ricerca file di backup (.bak, .bak0, .bak1, .bak2, ...) ---"
BAK_FILES=$(find . -type f \( -iname "*.bak" -o -iregex ".*\.bak[0-9]+$" \) \
              -not -path "./node_modules/*" -not -path "./.venv-tray/*" -not -path "./dist/*" -not -path "./.git/*" 2>/dev/null || true)
if [ -n "$BAK_FILES" ]; then
  giallo "Trovati (ignorati automaticamente da Git):"
  echo "$BAK_FILES"
else
  echo "Nessun file di backup trovato."
fi

# -----------------------------------------------------------------------
# 4) Stato attuale del repository
# -----------------------------------------------------------------------
echo
echo "--- Stato attuale (git status) ---"
git status --short
echo

read -rp "Vuoi aggiungere tutte le modifiche mostrate sopra? [S/n] " add_choice
if [[ "$add_choice" =~ ^[Nn]$ ]]; then
  giallo "Operazione annullata. Aggiungi manualmente i file che vuoi con 'git add <file>'."
  exit 0
fi

git add .

# Rete di sicurezza: nulla di compilato/generato in staging, qualunque cosa dica il .gitignore.
STAGED_EXCL=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '(^|/)(dist|dist-server|node_modules|\.venv-tray|__pycache__)/|\.pyc$|\.tsbuildinfo$' || true)
if [ -n "$STAGED_EXCL" ]; then
  giallo "Rimuovo dallo staging file compilati/generati (non vanno versionati):"
  echo "$STAGED_EXCL" | head -20
  echo "$STAGED_EXCL" | xargs -r -d '\n' git reset -q --
fi

# Rete di sicurezza aggiuntiva: se per qualunque motivo un .bak* fosse
# comunque finito in staging (es. .gitignore modificato a mano dopo),
# lo rimuove esplicitamente prima del commit.
STAGED_BAK=$(git diff --cached --name-only | grep -E '\.bak[0-9]*$' || true)
if [ -n "$STAGED_BAK" ]; then
  giallo "Rimuovo dallo staging questi file .bak* (non vanno versionati):"
  echo "$STAGED_BAK"
  echo "$STAGED_BAK" | xargs -r git reset --
fi

# -----------------------------------------------------------------------
# 5) Messaggio di commit
# -----------------------------------------------------------------------
echo
read -rp "Messaggio di commit: " commit_msg
if [ -z "$commit_msg" ]; then
  commit_msg="Aggiornamento $(date +%Y-%m-%d)"
  giallo "Nessun messaggio inserito, uso: \"$commit_msg\""
fi

if git commit -m "$commit_msg"; then
  verde "Commit registrato."
else
  giallo "Nulla da committare (nessuna modifica in staging)."
  exit 0
fi

# -----------------------------------------------------------------------
# 6) Milestone / tag (facoltativo)
# -----------------------------------------------------------------------
echo
tag_name=""
read -rp "È una milestone da taggare? [s/N] " tag_choice
if [[ "$tag_choice" =~ ^[Ss]$ ]]; then
  read -rp "Nome del tag (es. v1.1.35-rc.2): " tag_name
  if [ -n "$tag_name" ]; then
    git tag "$tag_name"
    verde "Tag '$tag_name' creato."

    # Promemoria .env.example per le milestone (convenzione di progetto)
    if [ -f ".env" ] && [ -f ".env.example" ]; then
      echo
      read -rp "Rigenerare .env.example dalla struttura del tuo .env attuale (valori azzerati)? [s/N] " env_choice
      if [[ "$env_choice" =~ ^[Ss]$ ]]; then
        sed -E 's/=(.+)/=/' .env > .env.example
        git add .env.example
        git commit -m "Aggiorna .env.example per $tag_name" --amend --no-edit 2>/dev/null || \
          git commit -m "Aggiorna .env.example per $tag_name"
        verde ".env.example rigenerato e incluso."
      fi
    fi
  fi
fi

# -----------------------------------------------------------------------
# 7) Push
# -----------------------------------------------------------------------
echo
read -rp "Procedere con il push su GitHub? [S/n] " push_choice
if [[ "$push_choice" =~ ^[Nn]$ ]]; then
  giallo "Push annullato. Puoi farlo manualmente con 'git push' (e 'git push --tags' se hai creato un tag)."
  exit 0
fi

if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git push
else
  giallo "Nessun remote configurato ancora."
  read -rp "URL del repository GitHub (es. https://github.com/tuo-utente/x-launcher.git): " remote_url
  if [ -n "$remote_url" ]; then
    git remote add origin "$remote_url" 2>/dev/null || git remote set-url origin "$remote_url"
    git push -u origin main
  else
    rosso "Nessun URL fornito, push annullato."
    exit 1
  fi
fi
verde "Push completato."

if [ -n "$tag_name" ]; then
  git push --tags
  verde "Tag '$tag_name' pubblicato."
fi

echo
verde "=== Completato ==="
