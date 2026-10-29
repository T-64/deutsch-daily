# DESIGN — Deutsch Daily

这份文档描述项目的**结构**和**界面设计规范**。改代码或改界面之前先读它；改了结构或规范，同步更新它。

---

## 1. 产品一句话

跟着每天的 **tagesschau in Einfacher Sprache** 学德语（A2–B1）：原声视频 + 官方字幕逐句同步，逐句中文、跟读、单句循环、点词查义、生词导出 Anki。纯静态、零登录、零后端。

**一期只有一份文本**：官方字幕原句（带时间轴）。AI 只负责逐句中文、分段、词汇和语法，不改写、不另造一份课文。

## 2. 架构

```
config/reading-sources.json   来源白名单
        │
scripts/update_readings.py    抓节目页 + 官方字幕 → 切句（subtitle_sentences.py）→ AI 逐句中文/分段/词汇/语法
        │                     → validate-content.py → 原子写入；逐日隔离失败
        │   运行：GitHub Actions（update-lessons.yml，每天 05:17 UTC，密钥在 Secrets）或本机 Hermes
        ▼
data/content/YYYY-MM-DD.json  schema 2 "broadcast"（唯一真源）
data/meta|transcripts|subtitles  来源身份与证据
        │
build.py（Python，无 AI，无 Node）
        │  读 docs/app/index.html（Vite 构建好的外壳），每页注入 <script id="dd-data">
        │  → docs/index.html · open.html · about.html · YYYY-MM-DD.html
        │  本地课程工坊仍是旧模板：templates/studio.html + static/ → docs/studio.html + docs/assets/
        ▼
scripts/publish.sh → main → GitHub Pages (/docs)

web/（Vite + React + TS）── npm run build ──▶ docs/app/（提交进仓库）
```

### 不变量

1. **`docs/` 永远是构建产物。** 改 `web/` → `cd web && npm run build`；然后 `python3 build.py`。CI 会重新构建并在 `docs/` 有差异时失败。
2. **日更只需要 Python。** `docs/app/` 已提交，`build.py` 只往外壳里塞数据；Node 只在改前端时需要。
3. **一份文本。** 课程页只展示官方字幕句子；AI 内容挂在句子上（中文、词汇例句用句子下标）。
4. **一天出错不连累其他天。** 更新器跳过出错的日期、保留已有课程，照常发布其他日期，最后非零退出。
5. **密钥只在环境变量。** `GLM_API_KEY` 只注入 Actions 里生成那一步；`.env` 被 `.gitignore` 忽略；仓库里没有、也不能有密钥。
6. **20 点版本已退役**，数据保留不构建；三期手工旧页（7/31、8/3、8/11）冻结。

### 课程数据

`build.lesson_payload(doc)` 把三种历史格式统一成前端的 `Lesson`（`web/src/lib/data.ts`）：

| content_kind | 来源 | 句子 | 中文 |
|---|---|---|---|
| `broadcast`（现行） | 官方字幕切句 | 自带时间 | AI 逐句 |
| `video`（2026-08/09） | 编辑过的字幕段落，按句与字幕对齐 | 对齐得上的有时间 | 有 |
| `reading`（2026-10 短读，待重生成） | 官方字幕（不再显示 AI 改写） | 有时间 | 暂无，页面提示 |

`Lesson = { slug, date, show, level, kind, note, source_url, video{mp4,embed,page}, duration, sentences[{de,zh,start,end}], stories[{title,title_zh,from,to,vocab[],grammar[],background}], gloss, form_to_key, phrases }`。`stories` 的 `from..to` 连续覆盖全部句子。

### 前端模块（`web/src`）

| 路径 | 职责 |
|---|---|
| `main.tsx` | 读 `#dd-data`，按 `page` 渲染 Home / Lesson / Open / About |
| `lib/store.ts` | Zustand：偏好（persist `dd-prefs-v3`）、生词本（兼容旧键 `dd-basket`/`dd-user-gloss`，跨标签同步） |
| `lib/player.ts` | Zustand 播放引擎：注册唯一 `<video>`，句子分段、当前句、连续/逐句/循环、上一句/下一句/重听 |
| `lib/words.ts` | 德语分词（含多词短语）与释义查找 |
| `lib/anki.ts` | `.apkg` 导出（按需加载 sql.js） |
| `features/lesson/*` | Player（含环境光）、Transport、Transcript（歌词式字幕）、WordCard（查词弹层）、Study（本段词汇语法 + 生词本） |
| `components/ui/*` | shadcn 风格基础组件（Radix + cva）：Button、Tabs、Segmented、Slider、Tooltip、Drawer（vaul） |
| `components/shell.tsx` | 顶栏、Logo、设置菜单（主题/字号）、GitHub Star 按钮（首页，无实时计数）、页脚 |
| `components/Backdrop.tsx` | 全站固定背景 |

---

## 3. 界面设计 —「影院」

### 原则

1. **声音是主角。** 课程页像音乐 App 的逐句歌词：当前句全亮、略放大，已播/未播的句子退到 34% 透明度，跟着声音滚到视野上三分之一处。
2. **一屏完成跟练。** 桌面：左栏视频 + 播放控制 + 本段学习，右栏字幕；中间分隔条可拖动（react-resizable-panels，记住比例）。手机：视频吸顶，字幕在下，底部固定播放条，学习面板是底部抽屉。
3. **先听后看。** 中文三档：盲听（全隐藏，可逐句点开）/ 当前句（默认）/ 全部；`T` 循环切换。
4. **点词即查。** 任意单词可点；查词时自动暂停，关掉卡片自动继续。
5. **克制的动效。** Motion 只用于：入场（ease-out-expo 0.8–1.1s）、共享布局（分段控件滑块）、弹层（spring 520/36）、音柱。尊重 `prefers-reduced-motion`。
6. **深色优先，浅色同等完成。** 默认跟随系统，设置菜单可固定。
7. **奥卡姆剃刀。** 界面上不写标语、介绍和说明文字。能用图标就不用字；必须用字时用最短的德语（Archiv、Merken、Lektion…）。中文只出现在学习内容里：逐句译文、释义、段落中文标题（随译文开关隐藏）。

### 颜色令牌（`web/src/styles.css`，OKLCH）

| 令牌 | 深色 | 浅色 | 用途 |
|---|---|---|---|
| `--bg` / `--bg-2` | 0.145 / 0.175 中性冷灰 | 0.985 / 0.965 暖白 | 页面 / 抽屉 |
| `--surface` / `--surface-2` | 0.20 / 0.245 | 白 / 0.95 | 卡片、弹层 / 悬停、分段底 |
| `--line` / `--line-2` | 白 8% / 14% | 墨 9% / 16% | 分隔 / 描边 |
| `--fg` `--fg-2` `--muted` `--faint` | 0.97 → 0.47 | 0.20 → 0.68 | 四级文字 |
| `--accent` | 琥珀 `oklch(.84 .15 82)` | `oklch(.62 .15 60)` | 「正在播出」：当前句音柱、编号、主按钮、重点词下划线 |
| `--mark` | 琥珀 22% | 琥珀 45% | 已收藏单词底色、选区 |
| `--lyric-dim` | 0.34 | 0.40 | 非当前句透明度 |

全局只有一个强调色。新颜色必须做成令牌并给两套主题。

### 背景「On Air」

所有页面共用一层固定背景（`components/Backdrop.tsx`，样式在 `styles.css` 的 `.dd-backdrop`）：两三团极大的柔光（琥珀 `--glow-a`、墨蓝 `--glow-b`、淡玫瑰 `--glow-c`）缓慢漂移，中间一层渐隐点阵，加胶片颗粒和暗角。只用渐变 + transform，没有 blur 滤镜；`prefers-reduced-motion` 下静止。

- 页面容器保持透明，不要再给大块区域铺 `bg-bg`，否则会盖住背景。
- 吸顶元素用 `.dd-stick`：平时透明，真正吸住时（`lib/stuck.ts` 打上 `data-stuck`）才出现磨砂底。常驻的浮层（手机底部播放条）用 `.dd-frost`。
- 首页 Hero 的静音视频用 `mask-image` 淡出到背景里，不用不透明渐变遮罩。

### 字体

- **Geist Variable**（自托管，@fontsource）：界面与德语字幕正文（600，`-0.012em`）、例句、小字；中文回退苹方 / 思源黑体。
- **Instrument Serif**（正体 + 斜体，仅 400）：只用于 ≥ 20px 的展示文字——日期（首页巨型日期、课程页日期）、段落标题、词条、Archiv。小于 20px 一律用 Geist，不要给它加粗。
- 等宽：时间码、星期缩写、标签（大写 + 字距）。
- 字幕字号 `clamp(19px, 1.55vw, 25px) × --reader-scale`（设置里 5 档 88%–118%），中文 15.5px。

### 组件约定

- 按钮全部圆角胶囊（`rounded-full`），按下 `scale(.97)`；主操作 `accent`，次要 `secondary` / `outline` / `ghost`。
- 卡片圆角 20–28px，弹层带 `backdrop-blur-xl` 与 `--shadow`。
- 图标统一 Lucide，`size-4`（按钮内）/ `size-5`（特征图标，`strokeWidth 1.75`）。
- 数字用 `tabular`；时间码等宽。

### 交互与快捷键

| 操作 | 结果 |
|---|---|
| 空格 | 播放 / 暂停；逐句模式停在句末后接着播下一句 |
| ← / → | 上一句 / 下一句 |
| R | 重听当前句 |
| T | 中文：盲听 → 当前句 → 全部 |
| 点时间码 | 从这句播放 |
| 点单词 / Enter | 查词卡片（释义、来源、原句高亮、加入生词本、改释义） |
| 首页 `/` 或 ⌘K | 搜索往期 |
| 自动跟随 | 播放时当前句始终停在字幕可见区域正中（手机扣掉吸顶视频和底部播放条）。滚轮 / 触摸 / 翻页键等真实手动操作才会暂停跟随，4 秒后自动回来，也可点「回到当前句」；布局变化引起的滚动不算 |

### 本地存储（用户数据，键名不要改）

| 键 | 内容 |
|---|---|
| `dd-basket` | 生词本数组 `{key, word, zh, pos, example, exampleZh, date, topic, source, createdAt, manual}`（可拖动排序） |
| `dd-user-gloss` | 用户自填释义 |
| `dd-recent-lesson` | 最近打开的课程（首页「继续」） |
| `dd-prefs-v3` | Zustand persist：`{theme, scale, zh, mode, rate, audioOnly, follow}` |
| `dd-lesson-split` | 桌面分栏比例（react-resizable-panels） |
| `dd-local-lessons-v1` | 本地课程工坊 |

### 无障碍

Radix 原语提供焦点管理与键盘操作；德语内容标 `lang="de"`；所有图标按钮有 `aria-label`；焦点环统一 `--ring`。

---

## 4. 怎么改

| 想改什么 | 改哪里 | 之后 |
|---|---|---|
| 令牌、字体、全局样式 | `web/src/styles.css`（并更新本文第 3 节） | `npm run build` → `python3 build.py` → 提交 `docs/` |
| 课程页 / 首页 / 其它页 | `web/src/pages`、`web/src/features` | 同上 |
| 课程数据形状 | `build.lesson_payload` + `web/src/lib/data.ts` + 测试 | 同上 |
| 内容生成与规则 | `scripts/update_readings.py`、`scripts/validate-content.py` | `python3 scripts/validate-content.py --all` |
| 本地课程工坊 | `templates/studio.html`、`static/` | `python3 build.py` |

检查清单与 CI 一致：

```bash
(cd web && npm ci && npm run build)
python3 -m unittest discover -s tests -v
node tests/test_studio.js
python3 -m py_compile build.py scripts/*.py tests/*.py && bash -n scripts/*.sh
python3 scripts/validate-content.py --all
python3 build.py && git status --short -- docs   # 必须为空
```
