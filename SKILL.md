---
name: tagesschau-einfache-sprache
description: "Use when running Deutsch Daily: fetch Tagesschau 20:00 or einfache Sprache, write content JSON, validate, build, GitHub Pages, WeChat. Trigger on 每日德语, deutsch-daily, tagesschau, 简易德语, 德语新闻精读."
version: 5.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [deutsch, tagesschau, learning, daily]
    related_skills: []
---

# Deutsch Daily — 每日德语精读

加载本 skill 后按流水线执行，不要另找流程、不要写 HTML、不要发附件。

覆盖两个官方有字幕的节目（禁止 Whisper）：

| source | 抓取 | 文件名 |
|---|---|---|
| **20uhr**（日更默认） | `tagesschau_20_uhr` / `ts-XXXX.html` | `YYYY-MM-DD-20uhr` |
| **einfach**（存档，仍可补做） | `tagesschau_in_einfacher_sprache` / `tse-XXXX.html` | `YYYY-MM-DD` |

同一 Berlin 日历日可以两期并存。不要把 20:00 写成 `YYYY-MM-DD.json`，会盖掉简易德语。

项目根目录：`~/tagesschau-deutsch`（下文 `$ROOT`）。

线上：https://t-64.github.io/deutsch-daily/

## When to Use

- 每日 cron / 「今天的德语」「跑 Deutsch Daily」「抓 tagesschau」
- 默认抓 **20:00 正片**。只有用户明确说简易/einfach 时才 `fetch-latest.sh einfach`
- 补做某期：管道已抓到、但 content JSON 还没有
- 不要用本 skill 去改版面（改 `templates/` + `python3 build.py`）。补词典：`python3 scripts/import-de-zh.py && python3 build.py --dict`（离线）

## 每日流水线

```
① 管道层(无AI)  scripts/fetch-latest.sh 20uhr
   curl 走 127.0.0.1:7890
   剧集列表 → 最新 ts-XXXX.html（简易则 tse-XXXX.html）
   抽 Berlin 媒体日 / m3u8 / mp3 / synopsis / 字幕 URL
   幂等: 同一 slug + 同一字幕 URL + XML 没变 → exit 3
   页面仍挂着另一期的字幕 URL → exit 1（禁止写成新日期）
   下载官方 EBU-TT XML → segments
   写 data/meta/{SLUG}.json
      data/transcripts/{SLUG}.json
      data/subtitles/{SLUG}.xml
   20uhr 的 SLUG = YYYY-MM-DD-20uhr；einfach 的 SLUG = YYYY-MM-DD
   │
   ├─ exit 1  停止，不发微信
   │
   ▼
② 决策
   content JSON 不存在 → 进 AI 层
   content JSON 已存在且 fetch=3 → 只发微信
   content JSON 已存在且 fetch=0 → 跳过 AI，仍发布
   │
   ▼
③ AI 层（只写 JSON，不写 HTML）
   读 meta + transcript
   去重连续句 / 截掉片尾
   按 synopsis 逗号列表分段（丢掉 Hinweis: 及之后的法律声明）
   写 data/content/{SLUG}.json
   python3 scripts/validate-content.py {SLUG}
   不通过就改 JSON，禁止带着 FAIL 往下走
   │
   ▼
④ 渲染+发布(无AI)  scripts/publish.sh {SLUG}
   build.py 只渲这一期 + index
   git add 该期 html + index.html（禁止 git add -A）
   commit + push → Pages
   │
   ▼
⑤ 微信  hermes send -t weixin
   只发：日期 + 节目名 + 主题一句话 + Pages 链接
   不发 PDF / MD / 任何附件
```

## Step 1 — 管道层

```bash
ROOT="$HOME/tagesschau-deutsch"
set +e
META_PATH=$(bash "$ROOT/scripts/fetch-latest.sh" 20uhr)
FETCH_STATUS=$?
set -e
echo "fetch_status=$FETCH_STATUS"
echo "meta=$META_PATH"
```

用户明确要简易德语时把 `20uhr` 换成 `einfach`。不带参数时脚本也默认 `20uhr`。

| exit | 含义 | 下一步 |
|---|---|---|
| 0 | 新抓到，或身份/字幕 XML 变了后重抓 | 读 meta，记下 `date` 和 `slug` |
| 3 | 同一期、同一字幕 URL、XML 没变 | 不是失败。读 meta，记下 `date` 和 `slug` |
| 1 | 抓取失败，或页面还挂着上一期字幕 | **停**。不要编 JSON，不要发微信 |

`set -e` 下必须先 `set +e` 再跑 fetch，否则 exit 3 会被当成脚本失败。

无官方字幕 URL 时脚本直接失败（没有 Whisper 兜底）。

**日期一律用 Europe/Berlin 的媒体日**（`TV-YYYYMMDD` / `audio/YYYY/MMDD`），不是上海日历，也不是把 `broadcastedOnDateTime` 的 UTC 前缀当日期。CMS 那个字段是 UTC，而且经常是 `17:00:00+0000` 占位。cron 07:00 上海 = 01:00 柏林，抓到的是**前一晚那期**，`date` 会是昨天，这是对的。

meta 里同时记：`date`（Berlin 媒体日）、`slug`、`source`（`20uhr`|`einfach`）、`source_label`、`timezone: Europe/Berlin`、`broadcasted_at`（Berlin ISO）、`broadcasted_at_utc`、`media_date`、`episode_id` / `video_id` / `subtitle_id`。

## Step 2 — 决策

```bash
DATE=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['date'])" "$META_PATH")
SLUG=$(python3 -c "import json,sys; m=json.load(open(sys.argv[1])); print(m.get('slug') or m['date'])" "$META_PATH")
CONTENT="$ROOT/data/content/${SLUG}.json"
echo "date=$DATE slug=$SLUG"
```

- `FETCH_STATUS=3` 且 `$CONTENT` 已存在 → 跳到 Step 5
- `$CONTENT` 不存在 → Step 3（包括昨天抓成功、AI 没写完的补做）
- `FETCH_STATUS=0` 且 `$CONTENT` 已存在 → 跳过 Step 3，做 Step 4+5

## Step 3 — AI 层（只产数据）

读：

- `$ROOT/data/meta/${SLUG}.json`
- `$ROOT/data/transcripts/${SLUG}.json`

整理规则：

1. 连续完全相同的句子只留一句
2. 片尾丢掉：简易从「Das waren unsere Nachrichten」起（含）；20:00 从「Das war die tagesschau」起（含）
3. 按 meta.`synopsis` 的逗号列表切成 `news[]`，标题用 synopsis 里的德语短句。**丢掉** `Hinweis:` 及之后的版权/更正说明，不要做成一条新闻
4. 片中「Dazu kommt ein Film」这类提示留在段落里，译文加「（接下来是一段影片。）」
5. **一句一行**：`paragraphs[]` 里每项只放一句德语，对应 `translations[]` 一句中文。页面按句对照，字幕也按句高亮。不要把整段新闻揉成一个大段落
6. 20:00 是 B2–C1 正片，译文跟口语/书面新闻走，不要改写成简易德语
7. **禁止**写 HTML、课后题、整段 `grammar` 字符串、`Deutsch / 中文 / Beispielsatz` 占位行

写到 `$ROOT/data/content/${SLUG}.json`，结构必须是：

```json
{
  "date": "YYYY-MM-DD",
  "slug": "YYYY-MM-DD-20uhr",
  "source": "20uhr",
  "video_page": "<meta.video_page>",
  "embed_url": "<把 video_page 的 .html 换成 ~player.html>",
  "news": [
    {
      "title": "德语小标题",
      "title_zh": "中文小标题",
      "paragraphs": ["德语段落1", "段落2"],
      "translations": ["中文译文1", "译文2"],
      "vocab": [
        {
          "lemma": "die Feuerwehr, -en",
          "key": "feuerwehr",
          "forms": ["Feuerwehr", "Feuerwehrleute"],
          "pos": "Substantiv",
          "zh": "消防队",
          "example_de": "Die Feuerwehr hat Tag und Nacht gearbeitet.",
          "example_zh": ""
        }
      ],
      "grammar_points": [
        {
          "title": "deshalb + V2",
          "summary": "deshalb 占第一位时，动词仍在第二位。",
          "example_de": "Deshalb haben viele Menschen Angst.",
          "example_zh": "因此很多人感到害怕。"
        }
      ],
      "background": "中文背景。没有就空字符串。"
    }
  ]
}
```

字段约束：

- 20uhr 必须有 `"source": "20uhr"` 和 `"slug": "YYYY-MM-DD-20uhr"`；简易德语可省略 source（默认 einfach），文件名仍是 `YYYY-MM-DD.json`
- `paragraphs` 与 `translations` **条数必须相等**，且都不为空。每项尽量一句德语 / 一句中文
- `title_zh` 是标题的中文，跟段落译文一样随「译文」开关显示
- 普通新闻 vocab **6–10**（最少 5）；`Das Wetter` **3–8**
- 名词 lemma 带冠词；短语整条进 `lemma`；`forms` 写正文里会出现的表面形式（不要逗号串）
- `key` 小写 ASCII/德语字母，一条新闻内唯一
- `example_de` **必须整句照抄**该条 `paragraphs` 里第一次出现该词的原句，不许改写
- `grammar_points` 每条新闻 **0–2** 个；没有就 `[]`。不要再用旧的 `grammar` 字符串
- `background` 没有就 `""`

写完立刻（只校验这一期；历史稿不必重跑，早期 JSON 会 FAIL）：

```bash
python3 "$ROOT/scripts/validate-content.py" "$SLUG"
```

FAIL → 改 JSON 再跑，直到 OK。不要跳过。

## Step 4 — 渲染 + 发布

```bash
bash "$ROOT/scripts/publish.sh" "$SLUG"
```

它会 `python3 build.py $SLUG`，然后只 `git add docs/$SLUG.html docs/index.html`。

禁止：

- `git add -A`
- 改 `docs/2026-07-31.html`、`docs/2026-08-03.html`、`docs/2026-08-11.html`（旧转写，不重建）
- 日常不必跑 `build.py --dict`（本地库已离线；只有新词覆盖率不够时才重填）

点词兜底在页面里已经接好：用户自填 > AI vocab > `data/dict-cache.json` > 暂无。AI 不用手写 gloss。

## Step 5 — 微信

```bash
hermes send -t weixin "🇩🇪 Deutsch Daily ${DATE} · 20:00
${ONE_LINER}

🌐 https://t-64.github.io/deutsch-daily/${SLUG}.html"
```

`${ONE_LINER}`：用 synopsis 或各条 `title` 收成 **一句**（1–2 行）。不要贴词汇表。

不发 PDF、不发 MD、不发文件、不发本机路径、不说「点这里下载」。

## 仓库结构

```
$ROOT/
├── SKILL.md                 ← 本文件，每日流程唯一真源
├── build.py
├── templates/               episode.html / index.html
├── scripts/
│   ├── fetch-latest.sh      管道层（默认 20uhr）
│   ├── ingest_episode.py    日期 + 字幕身份（fetch 调用）
│   ├── sources.py           einfach / 20uhr
│   ├── validate-content.py  AI 层门禁
│   └── publish.sh           渲染+定点 git
├── data/                    content / meta / transcripts / subtitles / dict-cache.json
│                            （dict/ 源文件不进 git）
└── docs/                    GitHub Pages（T-64/deutsch-daily，source = /docs）
```

## Common Pitfalls

1. **cron prompt 和本 skill 打架时听本 skill。** prompt 只负责触发。
2. **把 fetch exit 3 当失败。** 先 `set +e`，再看 `FETCH_STATUS`。
3. **`git add -A`。** 会把本地实验、删文件一起推上去。只用 `publish.sh`。
4. **写 HTML / 改 templates。** AI 层只许动 `data/content/*.json`。
5. **旧路径** `content/content-YYYY-MM-DD.json`、`meta_日期.json` 已经作废。
6. **example_de 自己造句。** validator 会查是否出现在 `paragraphs` 里。
7. **无字幕还去 Whisper。** 本流程没有这一步；没字幕就该 exit 1。
8. **用「meta 文件在」当 SKIP。** CMS 常先挂上期字幕再换新 XML。身份变了必须重抓；页面字幕 URL 已属于另一期日期必须 exit 1，不能写成新日期再 SKIP。
9. **用 UTC 或上海「今天」当 `date`。** 只用 Berlin 媒体日。07:00 cron 拿到昨天的日期是正常的。

10. **20:00 写成 `YYYY-MM-DD.json`。** 会覆盖简易德语。必须用 `YYYY-MM-DD-20uhr`。

## Verification Checklist

- [ ] fetch 的 exit code 是 0/3/1 之一，且 1 时已停下
- [ ] `validate-content.py` 打印 `OK`
- [ ] `docs/${SLUG}.html` 与 `docs/index.html` 已更新
- [ ] git 暂存区只有这两个文件（或已 push）
- [ ] 微信只有日期 + 一句话 + Pages URL
- [ ] 没动 7/31、8/3、8/11 三期旧页
