#!/usr/bin/env bash
set -euo pipefail

echo "This script will stop tracking selected local/large files in git (keeps local copies)."
echo "Review the paths below before running."

gitRoot=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$gitRoot" ]; then
  echo "Not a git repository (run from repo root). Aborting." >&2
  exit 1
fi

cd "$gitRoot"

# Files and folders to untrack (keeps files on disk but removes from index)
paths=(
  "POS/Backend/database.db"
  "POS/database.db"
  "POS/Backend/postgres-data"
  "POS/postgres-data"
  "POS/Backend/eng.traineddata"
  "POS/Backend/certs"
  "estore/Backend/certs"
  "POS/Backend/docker-compose.postgres.yml"
)

for p in "${paths[@]}"; do
  if git ls-files --error-unmatch "$p" >/dev/null 2>&1; then
    echo "Untracking: $p"
    git rm --cached -r "$p" || true
  else
    echo "Not tracked (skipping): $p"
  fi
done

echo "Also untracking node_modules patterns (if tracked)."
git ls-files -- "**/node_modules/*" | sed -n '1,200p' | xargs -r git rm --cached -r || true

echo "Done. Review 'git status' and commit the changes (git add .gitignore && git commit)."
