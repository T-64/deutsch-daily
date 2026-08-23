#!/bin/bash
# 渲染一期并只提交该期 HTML + 公共入口（禁止 git add -A）
# 用法: bash scripts/publish.sh YYYY-MM-DD
#        bash scripts/publish.sh YYYY-MM-DD-20uhr
set -euo pipefail

DATE="${1:-}"
if [[ ! "$DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}(-20uhr)?$ ]]; then
  echo "usage: publish.sh YYYY-MM-DD[-20uhr]" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 "$ROOT/build.py" "$DATE"

git add "docs/${DATE}.html" docs/index.html docs/open.html
if git diff --cached --quiet; then
  echo "publish: nothing to commit ($DATE)"
  exit 0
fi
git commit -m "add ${DATE}"
git push
echo "publish: pushed $DATE"
