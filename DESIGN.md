# DESIGN — Deutsch Daily

这份文档描述项目的**结构**和**界面设计规范**。改代码或改界面之前先读它；改了结构或规范，同步更新它。

---

## 1. 产品一句话

A2–B1 中文母语学习者的德语新闻精读站：每天三条 tagesschau in Einfacher Sprache 短读，**先读德语、再看中文**，点词查义，生词进 Anki。纯静态、零登录、零后端。

## 2. 架构

```
config/reading-sources.json  来源白名单
        │
scripts/update_readings.py   抓官方文字 → AI 生成短读 → 校验 → 原子写入（逐日隔离失败）
        │                    ├─ scripts/ingest_episode.py   解析节目页 / EBU-TT 字幕
        │                    └─ scripts/validate-content.py 内容 schema 与短读规则
        ▼
data/content/YYYY-MM-DD.json 学习内容（唯一真源）
data/meta|transcripts|subtitles  来源身份与证据
        │
build.py                     确定性渲染，不调用 AI
        │  templates/*.html + static/*  →  docs/*.html + docs/assets/*
        ▼
scripts/publish.sh           只提交所选日期的数据与页面 + 入口页 + assets，直接推 main
        ▼
GitHub Pages (main:/docs)
```

### 不变量

1. **`docs/` 永远是 `python3 build.py` 的产物。** 不手改 `docs/`；CI 会重建并在 `docs/` 有差异时失败。改模板或 `static/` 后跑全站构建并一起提交。
2. **数据与版式分离。** AI 只写 `data/content/*.json`；HTML 只来自 `templates/`，样式与交互只来自 `static/`。
3. **一天出错不连累其他天。** 更新器跳过出错的日期、保留它已有的课程，照常发布其他日期，最后以非零退出码报告。
4. **20 点版本已退役。** 原始数据保留在 `data/`，不再构建页面。三期手工旧页（7/31、8/3、8/11）冻结，不重建。

### 模块

| 文件 | 职责 |
|---|---|
| `build.py` | 渲染单课（`render`）、首页/入口页（`build_index`）、复制 assets（`copy_assets`）、模板片段（`page`）；句子切分与中德配对、字幕对齐（旧视频课）、词义表 |
| `scripts/sources.py` | 来源定义与 slug 规则（`YYYY-MM-DD` = einfach） |
| `scripts/update_readings.py` | 日更入口：白名单抓取、AI 生成、校验、发布 |
| `scripts/validate-content.py` | 内容校验（短读：3 条、每条 3–4 句、90–180 词、词形必须出现在原文） |
| `static/site.css` | 全站设计令牌与基础组件 |
| `static/core.js` | `window.DD`：存储、偏好、主题、设置面板、toast |
| `static/reader.css` / `reader.js` | 课程页版式与交互 |
| `static/anki.js` | `window.DDAnki.exportApkg(words, status)`，按需从 jsDelivr 加载 sql.js |
| `static/studio.js` | 本地课程工坊（字幕解析与本地课程） |

### 模板片段

`build.page(name, **repl)` 先替换共享片段，再替换页面占位符：

| 占位符 | 内容 |
|---|---|
| `__HEAD__` | charset、viewport、`color-scheme`、首屏主题脚本（避免闪烁）、`assets/site.css?v=…` |
| `__CORE__` | `assets/core.js?v=…` |
| `__FOOT__` | 全站页脚 |
| `__V__` | `static/` 内容哈希（10 位），用于缓存失效 |
| `__ITEMS__` / `__PAYLOAD__` / `__DATE__` | 首页课程列表 / 课程数据 / 日期 |

课程页的数据写成 `<script>const DATA = {...};\n</script>`，测试依赖这个格式。

---

## 3. 界面设计

### 原则

1. **安静。** 页面上最显眼的永远是德语正文。没有装饰性色块、渐变、卡片阴影堆叠；层次靠字号、字重、留白和细线。
2. **先盲读。** 译文默认隐藏。每句末一个极小的「译」按钮显示单句中文；顶栏「译文」或键盘 `T` 切换全部译文，并被记住。
3. **点词是核心。** 每个德语词都可点；本篇重点词有细下划线，收进生词本的词有柔和高亮。释义卡在桌面贴着单词弹出，在手机上是底部抽屉。
4. **桌面双栏，手机单栏。** 桌面：正文栏（约 40rem）+ 300px 侧栏（目录、本篇词汇/语法、生词本），侧栏随滚动固定。≤1080px：侧栏变成底部抽屉，由顶栏「词汇」「生词本」打开。
5. **零依赖。** 不用 Web 字体、不用框架、不用构建工具。系统字体栈，原生 HTML/CSS/JS。

### 颜色令牌（`static/site.css`）

| 令牌 | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `--bg` | `#f8f6f1` | `#151413` | 页面背景（暖纸色） |
| `--surface` | `#fffefb` | `#1c1b19` | 浮层、卡片、抽屉 |
| `--surface-2` | `#f1eee7` | `#252320` | 悬停、选中、分段控件底 |
| `--ink` | `#1e1d1a` | `#ece8e0` | 正文 |
| `--ink-2` | `#45423c` | `#c9c3b7` | 次要正文 |
| `--muted` | `#7d786e` | `#938d82` | 说明、中文译文 |
| `--faint` | `#a9a397` | `#6c675e` | 编号、标签 |
| `--line` / `--line-2` | `#e5e0d6` / `#d5cfc2` | `#2d2b27` / `#3a3732` | 分隔线 / 控件描边 |
| `--accent` | `#2d5b6e` | `#8fbccd` | 链接、焦点、当前播放句 |
| `--accent-soft` | `#e4ecef` | `#1f2d33` | 已展开译文按钮、当前单词 |
| `--mark` | `#f4e4a1` | 琥珀 26% | 已收藏单词、选区 |
| `--danger` | `#a23b2a` | `#e08a77` | 删除 |

主题：默认跟随系统（`prefers-color-scheme`），设置面板可固定浅色/深色，写在 `html[data-theme]`。新颜色一律加成令牌，两套主题都要定义；页面里不写死颜色。

### 字体

| 令牌 | 用途 |
|---|---|
| `--serif`（Iowan / Palatino / Charter / Source Serif / Georgia / 宋体回退） | 德语正文、标题、词条 |
| `--sans`（系统 UI + 苹方 / 思源黑体 / 雅黑） | 界面、中文译文 |
| `--mono` | 编号、时间码、日期列 |

正文字号 = `--reader-base`（桌面 21px，手机 19px）× `--reader-scale`（设置面板 5 档：86%–122%）。德语行高 1.66，中文 15px/1.65 灰色。

### 布局

- `--page` 72rem 外框，`--measure` 40rem 阅读栏，`--gutter` 手机 16px / 桌面 32px。
- 顶栏 `.bar` 56px（手机 52px），半透明背景 + 模糊，滚动后出现底部细线。
- 断点：720px（手机排版、释义卡变抽屉）、1080px（侧栏变抽屉）。

### 组件

| 组件 | 类名 | 说明 |
|---|---|---|
| 主按钮 | `.btn` | 墨色实底，只用于每屏一个主动作 |
| 次按钮 | `.btn.secondary` | 描边 |
| 安静按钮 | `.btn-quiet` / `.btn-icon` | 顶栏与面板内操作；`aria-pressed="true"` 表示开启 |
| 计数 | `.count` | 生词数量 |
| 标签页 | `.tabs` `.tab[aria-selected]` | 侧栏「本篇 / 生词本」 |
| 分段控件 | `.seg` | 主题选择 |
| 表单 | `.field` `.input` `.form-actions` | |
| 卡片 / 注释 | `.card` / `.note` | 注释用左侧细线，不用底色 |
| 设置面板 | `[data-settings]` → `#dd-settings` | core.js 自动挂载：外观、正文字号 |
| 提示 | `DD.toast(msg)` | 底部居中，1.7 秒 |

课程页专用（`reader.css`）：`.sent`（一句，含 `.de`、`.reveal`、`.seek`、`.zh`）、`w`（可点单词：`.ed` 重点词下划线、`.saved` 高亮、`.active` 当前）、`.pop`（释义卡）、`.side`（侧栏/抽屉）、`.toc`、`.vocab`、`.gram`、`.nb-*`（生词本）。

### 交互

| 操作 | 结果 |
|---|---|
| 点单词 / Enter | 打开释义卡：词条、词性与来源（本篇重点词 / 离线词典 / 我的释义）、中文、所在句（单词加粗）、「加入生词本」「编辑释义」 |
| 点句末「译」 | 只展开这一句的中文 |
| 顶栏「译文」/ `T` | 显示或隐藏全部译文（会记住） |
| 点句末时间码（旧视频课） | 视频跳到该句；正在播放的句子左侧出现强调色细线 |
| `Esc` | 关闭释义卡、抽屉、设置面板 |
| 滚动 | 侧栏目录与「本篇词汇」跟随当前新闻 |

### 本地存储（键名是用户数据，不要随意改）

| 键 | 内容 |
|---|---|
| `dd-basket` | 生词本数组 `{key, word, zh, pos, example, date, topic, source, createdAt, manual}` |
| `dd-user-gloss` | 用户自填释义 `{[key]: {word, zh, pos, example}}` |
| `dd-recent-lesson` | 最近打开的课程（首页「继续上次」） |
| `dd-prefs-v2` | `{theme: system|light|dark, size: 0–4, zh: bool}`；首次读取时从旧 `dd-preferences` 迁移主题和字号 |
| `dd-local-lessons-v1` | 本地课程工坊保存的字幕课程（见 `static/studio.js`） |

所有读写都包在 try/catch 里（`DD.store`），隐私模式下页面照常工作。

### 无障碍

- 所有可点元素是 `button` 或 `role="button"` + `tabindex="0"`，焦点环统一 `--accent`。
- 德语内容标 `lang="de"`，页面 `lang="zh-CN"`。
- 尊重 `prefers-reduced-motion`。

---

## 4. 怎么改

| 想改什么 | 改哪里 | 之后 |
|---|---|---|
| 颜色、字体、通用组件 | `static/site.css`（并更新本文第 3 节） | `python3 build.py`，提交 `docs/` |
| 课程页 | `templates/episode.html`、`static/reader.css`、`static/reader.js` | 同上 |
| 首页 / 入口页 / 关于 / 工坊 | `templates/*.html` | 同上 |
| 内容规则 | `scripts/validate-content.py` + AI 提示词（`update_readings.py` 的 `SYSTEM`） | `python3 scripts/validate-content.py --all` |
| 新来源 | `config/reading-sources.json` + 专用提取器 + 测试 | 见 README |

检查清单与 CI 一致：

```bash
python3 -m unittest discover -s tests -v
node tests/test_studio.js
python3 -m py_compile build.py scripts/*.py tests/*.py
bash -n scripts/*.sh
python3 scripts/validate-content.py --all
python3 build.py && git status --short -- docs   # 应该为空（或只有你预期的改动）
```
