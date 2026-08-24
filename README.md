# Deutsch Daily — 每日德语听力学习站

两条线都在首页：`T-64 · tagesschau 20:00 Uhr` 与 `T-64 · tagesschau in einfacher Sprache`。每天 7:00 抓前一晚 Berlin 媒体日。

**在线地址** https://t-64.github.io/deutsch-daily/

## 这是什么

一个全自动的德语视频学习管道，也是“把自己想看的视频变成逐句课程”的产品 MVP。每天抓取 Tagesschau **20:00 正片**和 **einfacher Sprache**（官方字幕），整理成逐句德中对照页面。手机打开即用，零登录、零后端。

适合 B1–C1（20:00）和 A2–B1（简易德语）。我准备去斯图加特留学，每天精读一条新闻。

## 两个入口

1. 首页：直接学习每天整理好的两档德语新闻。
2. 视频链接：在首页粘贴，或使用 `https://t-64.github.io/deutsch-daily/open.html#<原视频 URL>`。已收录内容会直接进入学习页；其他来源可以转到本地课程工坊。

本地课程工坊允许用户选择自己有权处理的视频/音频、德语 SRT/WebVTT 和可选逐句中文译文，在浏览器中生成可跳播、可隐藏译文、可查词的课程；字幕课程可导入/导出 JSON，媒体文件不会上传或长期保存。公开 MVP 不承诺公共字幕的一键导入，也不会绕过登录、付费、DRM 或平台限制。商业产品边界和验证路线见 [`product/COMMERCIAL-MVP.md`](product/COMMERCIAL-MVP.md)。

## 架构：数据与排版分离

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌────────────┐
│ fetch-latest│    │   AI 层      │    │  build.py   │    │ GitHub     │
│ .sh (无AI)  │ →  │ (GLM-5.3)    │ →  │  (无AI)     │ →  │ Pages      │
│ 抓取+字幕    │    │ 产 content   │    │ 固定模板渲染  │    │ /docs      │
└─────────────┘    └──────────────┘    └─────────────┘    └────────────┘
   data/meta          data/content         docs/*.html       t-64.github.io
   data/transcripts   (不写 HTML)          (可重复渲染)        /deutsch-daily/
```

**为什么这样分**：AI 只负责它擅长的（翻译、选词、语法讲解），排版交给确定性脚本。想改版面 → 改 `templates/episode.html` → `python3 build.py` 全站秒级重刷，历史所有期数统一更新，不依赖 AI 每天手写 HTML 的发挥。

## 页面功能

| 功能 | 说明 |
|---|---|
| 逐句德中对照 | 每句德语原文下紧跟对应中文译文，可一键隐藏译文先盲听 |
| 点词查义 | 点正文中的任意德语词弹出释义卡；无释义时可自行补充，已有释义也可修改 |
| 个人生词本 | 点词收集或手动录入单词/短语，支持编辑、删除，localStorage 跨期次持久保存 |
| 导出 Anki | 浏览器内生成 .apkg，牌组 `Deutsch Daily`，日期作 tag |
| 重点词汇 / 语法 | 每条新闻折叠卡片；语法最多 2 条，背景标注未经核验 |
| 逐句跳播 | 转写对得上的句子可 seek；对不上或仍是 iframe 则按钮无效 |
| 响应式视频 | 16:9；优先试官方 MP4，失败回退 iframe；手机下滑后小窗 |
| 本地课程工坊 | 用户自带媒体和 SRT/VTT，浏览器本地解析、保存字幕、导入/导出课程 JSON |

## 每日流程（真源：`SKILL.md`）

每天 07:00 Hermes cron 加载 skill `tagesschau-einfache-sprache`，按 `SKILL.md` 四步走。cron prompt 只触发，不另写流程。**日更默认 `20uhr`。**

```bash
cd ~/tagesschau-deutsch
bash scripts/fetch-latest.sh 20uhr    # 0=新/重抓  3=同身份且字幕未变  1=失败或挂着上期字幕
# bash scripts/fetch-latest.sh einfach  # 仍可补抓简易德语
python3 scripts/validate-content.py YYYY-MM-DD-20uhr
bash scripts/publish.sh YYYY-MM-DD-20uhr  # 渲一期 + 定点 git push
```

本地改版面：

```bash
python3 build.py            # 重建全部有 content 的期
python3 build.py 2026-08-13         # 简易一期
python3 build.py 2026-08-19-20uhr   # 20:00 一期
python3 -m http.server 4185 -d docs
```

## 仓库结构

```
~/tagesschau-deutsch/
├── SKILL.md                 # 每日流程唯一真源
├── build.py
├── templates/               episode / index / open / studio / about 页面
├── static/                  本地课程解析与阅读器脚本
├── scripts/
│   ├── fetch-latest.sh
│   ├── ingest_episode.py    # 日期(Berlin 媒体日) + 字幕身份
│   ├── validate-content.py
│   └── publish.sh
├── data/                    content / meta / transcripts / subtitles / dict-cache.json
├── product/                 商业 MVP、指标与合规边界
├── tests/                   切句和公共入口回归测试
├── LICENSE / NOTICE.md      代码许可证与第三方内容边界
└── docs/                    GitHub Pages 输出（T-64/deutsch-daily，/docs）
```

抓取脚本与 skill 正文在本仓库；Hermes 侧是指向这里的符号链接。GitHub Pages 发布 `docs/`（仓库设置 source = `/docs`），和源码同一个 `T-64/deutsch-daily`。

词典源文件（Wikdict / kaikii jsonl / 灌装 sqlite）不进 git，见 `data/dict/README.md`。`data/dict-cache.json` 进仓库，页面 build 时烘焙进 HTML。

## 词义来源（两级兜底）

1. **AI 词表**：每条新闻 6–10 个 lemma，带 `forms` 做短语/词形匹配
2. **离线德汉词典**（Wikdict de-zh + kaikii 中文维基德语）：`build.py --dict` 从本地 SQLite 填 `dict-cache.json`，页面标虚线

点词优先级：用户自填 > AI 词表 > 词典缓存 > 可手补。

## 技术决策记录

- **不接外部词典 API 运行时查询**：中文维基词典 API 免费、有人工释义，但覆盖率不满、还限流——所以做成 build 时一次性缓存，页面运行时零网络依赖
- **.apkg 在浏览器内生成**（sql.js + 手写 zip writer，无 JSZip 依赖）：用户在任意设备点导出就能拿到标准 Anki 包，不依赖 AnkiConnect/AnkiWeb（AnkiWeb 无公开写 API）。格式已在 Anki 26.8 真实导入验证（meta protobuf version 2 + collection.anki2/anki21 双写 + conf/dconf/tags 字段格式 + graves 表，一个都不能少）
- **旧期数据不迁移**：7/31、8/3、8/11 三期转写有缺陷，保留旧版页面不重建，新架构从干净数据开始

依赖：Python 3 标准库，无第三方包。

## 商业与内容边界

GitHub Pages 适合作为开源项目和免费样板，不应作为商业 SaaS 主站。Tagesschau/ARD 的视频、字幕和节目素材也不由 MIT License 授权；商业化前必须迁移到商业托管，并只处理获得许可、用户自有或明确开放许可的媒体。详见 [`NOTICE.md`](NOTICE.md) 和产品路线文档。

贡献方式见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。
