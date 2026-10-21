#!/bin/bash
# Deterministic direct publishing: content data AND generated pages, without a PR.
# Usage: bash scripts/publish.sh YYYY-MM-DD [YYYY-MM-DD ...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ "$#" -eq 0 ]; then
  echo "usage: publish.sh YYYY-MM-DD [YYYY-MM-DD ...]" >&2; exit 1
fi
if [ "$(git branch --show-current)" != main ]; then
  echo "publish: must run on main" >&2; exit 1
fi
if ! git diff --cached --quiet; then
  echo "publish: index contains other staged work; refusing to include it" >&2; exit 1
fi
paths=(docs/index.html docs/open.html docs/about.html docs/studio.html docs/assets/studio.js)
for day in "$@"; do
  if [[ ! "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "publish: only simple editions (YYYY-MM-DD) are enabled" >&2; exit 1
  fi
  python3 scripts/validate-content.py "$day"
  paths+=("data/content/$day.json" "docs/$day.html")
  for path in "data/meta/$day.json" "data/transcripts/$day.json" "data/subtitles/$day.xml"; do
    if [ -f "$path" ]; then paths+=("$path"); fi
  done
 done
for day in "$@"; do python3 build.py "$day"; done
git add -- "${paths[@]}"
if ! git diff --cached --quiet; then
  git commit -m "content: update simple readings $*"
fi
# Retry a previously failed push even when no local files changed this time.
git push origin main
echo "publish: pushed simple readings $*"
