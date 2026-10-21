# Deutsch Daily

适合中文母语者的 A2–B1 简易德语新闻阅读站。德中逐句对照、点词查义、个人生词本和 Anki 导出；无需登录。

线上：[Deutsch Daily](https://t-64.github.io/deutsch-daily/)。GitHub Pages 从 `main` 的 `/docs` 发布。

当前只更新 **einfach 简单版**。20 点困难版退出首页、构建和日更流程；原始历史数据保留在仓库中。

## 内容更新

第一批文字来源白名单在 `config/reading-sources.json`，只启用已验证的 **tagesschau · Einfache Sprache**。以后接入 DW 或 Deutschlandfunk 时，需要同时增加域名/路径规则、专用提取器和验证，不能仅修改站点名称。

更新器只读取列表、节目页面和官方字幕文字，不下载视频、不做语音识别。根据真实新闻生成原创的 A2–B1 短读，再逐句翻译中文，附 5 个词汇和 1 个语法提示。新页面标注学习改写与 AI 来源，链接回官方原文，不将改写冒充逐字字幕。

```text
白名单 → 最近 7 天官方文字 → AI 简单德语 + 中文对照
       → 数据校验 → 原子保存 JSON → 固定模板构建 → 直接提交 main → Pages
```

日更不创建 PR。已有课程按来源文本 SHA-256 判断是否需要重新生成；同日来源修正时重新生成；失败不覆盖已有课程。重跑会再次尝试推送，修复之前未成功的部署。

```bash
# 使用现有环境中的 GLM_API_KEY / GLM_BASE_URL（默认模型 glm-5.3）
python3 scripts/update_readings.py

# 也可读取本机已有凭据文件，只导入 AI / 代理相关字段，不执行文件
python3 scripts/update_readings.py --env-file ~/.hermes/.env

# 明确日期补更（包含起止日，只补实际发布的期数）
python3 scripts/update_readings.py --since 2026-10-14 --until 2026-10-20 --env-file ~/.hermes/.env

# 自动校验并直接发布到既有 GitHub Pages
python3 scripts/update_readings.py --env-file ~/.hermes/.env --publish
```

不传日期时，以 **Europe/Berlin 昨天** 为结束日向前检查 7 天。周末和无节目日不造假；不回补全部停更月份。网络请求遵循环境中的代理配置，仓库不绑定本机代理端口。代码仅依赖 Python 标准库。

`--fetch-only` 只抓取官方文字，不调用 AI。AI 密钥不会进入源码、网页或日志；可用 `DEUTSCH_AI_MODEL` 调整兼容模型。

## 调度

本机复用现有 Hermes 任务 `tagesschau-deutsch-daily`。任务以 no-agent 模式执行 `~/.hermes/scripts/deutsch-daily-update.sh`，该包装脚本进入此 checkout 后调用上述更新器并带 `--publish`。任务输出留在本机，不发送微信消息。无需每次唤醒 Agent 操作 git 或开 PR。

项目移动后应修改包装脚本中的绝对目录，并修复 Hermes skill 的符号链接。流程与故障处理见 `SKILL.md`。

## 界面

安静阅读风：德语衬线正文、默认隐藏译文（逐句点「译」或按 `T`）、点词查义、桌面双栏（正文 + 目录/词汇/生词本侧栏）、手机底部抽屉；跟随系统深浅色，可手动切换。零依赖：系统字体 + 原生 HTML/CSS/JS。结构、设计令牌、组件与本地存储键见 [`DESIGN.md`](DESIGN.md)。

## 本地开发

```bash
python3 build.py
python3 -m http.server 4185 --bind 127.0.0.1 -d docs
```

页面结构写到 `templates/`，样式与交互写到 `static/`（构建时复制到 `docs/assets/`），不要手写生成的 `docs/*.html`；CI 会重建并检查 `docs/` 是否同步。全站构建恢复全部已有简单版课程、刷新入口并移除困难版公开页面。三个旧期（7/31、8/3、8/11）保留冻结页面。

```bash
python3 -m unittest discover -s tests -v
node tests/test_studio.js
python3 -m py_compile build.py scripts/*.py tests/*.py
bash -n scripts/*.sh
python3 scripts/validate-content.py --all
python3 build.py
```

目录：`data/content` 是学习内容，`data/meta` 是来源身份，`data/transcripts` / `data/subtitles` 是提取证据；`build.py` 只渲染，不调用 AI。发布脚本显式提交所选日期的数据与网页，不使用 `git add -A`，也不混入其他暂存改动。

原有 [本地课程工坊](https://t-64.github.io/deutsch-daily/studio.html) 与链接入口保留为辅助工具。词典来源及离线缓存见 `data/dict/README.md`。新闻与字幕权利归原权利人，翻译和学习改写可能有误；详见 `NOTICE.md`。
