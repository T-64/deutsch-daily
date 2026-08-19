#!/bin/bash
# 纯管道（无AI）：抓最新一期 tagesschau in Einfacher Sprache
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
PROXY="http://127.0.0.1:7890"
export http_proxy="$PROXY" https_proxy="$PROXY" HTTP_PROXY="$PROXY" HTTPS_PROXY="$PROXY"

echo "[1/3] Fetching episode list..." >&2
LIST_HTML=$(curl -sS --max-time 30 -x "$PROXY" \
  "https://www.tagesschau.de/tagesschau_in_einfacher_sprache")
EPISODE_PATH=$(echo "$LIST_HTML" | grep -o 'tse-[0-9]*\.html' | head -1)

if [ -z "$EPISODE_PATH" ]; then
  echo "ERROR: No episode found" >&2
  exit 1
fi

EPISODE_URL="https://www.tagesschau.de/tagesschau_in_einfacher_sprache/$EPISODE_PATH"
echo "  Episode: $EPISODE_PATH" >&2

echo "[2/3] Fetching episode page..." >&2
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
curl -sS --max-time 30 -x "$PROXY" "$EPISODE_URL" -o "$TMP"
if [ ! -s "$TMP" ]; then
  echo "ERROR: empty episode page" >&2
  exit 1
fi

echo "[3/3] Ingest (Berlin date + subtitle identity)..." >&2
python3 "$ROOT/scripts/ingest_episode.py" \
  --html "$TMP" \
  --episode-url "$EPISODE_URL" \
  --data "$DATA"
