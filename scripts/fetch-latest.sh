#!/bin/bash
# 纯管道（无AI）：抓最新一期
#   bash scripts/fetch-latest.sh            # 默认简易德语
#   bash scripts/fetch-latest.sh 20uhr
#   bash scripts/fetch-latest.sh einfach    # 简易德语
# 日期以 Europe/Berlin 的媒体文件日（TV-YYYYMMDD）为准。
# 幂等按身份（episode + video + subtitle URL），不是“文件在就 SKIP”。
#
# 退出码:
#   0  新内容或身份变化后重抓
#   3  SKIP（同一期、同一字幕已入库）
#   1  错误 / 页面仍挂着上一期字幕
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/data"
SOURCE="${1:-einfach}"
case "$SOURCE" in
  einfach|einfache|tse) SOURCE=einfach ;;
  20uhr|tagesschau|ts|20) echo "20:00 edition is retired; use einfach" >&2; exit 1 ;;
  *)
    echo "usage: fetch-latest.sh [einfach|20uhr]" >&2
    exit 1
    ;;
esac

if [ "$SOURCE" = "20uhr" ]; then
  LIST_URL="https://www.tagesschau.de/tagesschau_20_uhr"
  BASE_URL="https://www.tagesschau.de/tagesschau_20_uhr"
  EPISODE_GREP='ts-[0-9]*\.html'
else
  LIST_URL="https://www.tagesschau.de/tagesschau_in_einfacher_sprache"
  BASE_URL="https://www.tagesschau.de/tagesschau_in_einfacher_sprache"
  EPISODE_GREP='tse-[0-9]*\.html'
fi

echo "[1/3] Fetching $SOURCE episode list..." >&2
LIST_HTML=$(curl -fsS --max-time 45 "$LIST_URL")
EPISODE_PATH=$(echo "$LIST_HTML" | grep -o "$EPISODE_GREP" | head -1)

if [ -z "$EPISODE_PATH" ]; then
  echo "ERROR: No $SOURCE episode found" >&2
  exit 1
fi

EPISODE_URL="$BASE_URL/$EPISODE_PATH"
echo "  Episode: $EPISODE_PATH" >&2

echo "[2/3] Fetching episode page..." >&2
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
curl -fsS --max-time 45 "$EPISODE_URL" -o "$TMP"
if [ ! -s "$TMP" ]; then
  echo "ERROR: empty episode page" >&2
  exit 1
fi

echo "[3/3] Ingest (Berlin date + subtitle identity)..." >&2
python3 "$ROOT/scripts/ingest_episode.py" \
  --html "$TMP" \
  --episode-url "$EPISODE_URL" \
  --source "$SOURCE" \
  --data "$DATA"
