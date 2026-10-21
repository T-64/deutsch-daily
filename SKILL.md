---
name: tagesschau-einfache-sprache
description: "Maintain Deutsch Daily A2–B1 broadcast lessons (official tagesschau in Einfacher Sprache subtitles + AI Chinese): whitelist, rolling-week catch-up, validate and directly publish."
version: 7.0.0
---

# Deutsch Daily — tagesschau in Einfacher Sprache 逐句课程

项目目录：`/home/tanzhaoqing/workspace/deutsch-daily`。
线上：https://t-64.github.io/deutsch-daily/

只运行简单版 `einfach`。20 点困难版已退役，禁止新抓或新生成 20uhr。
复用确定性脚本，无须 Agent 自己拼接抓取、编写 HTML、操作 git 或创建 PR。

```bash
cd /home/tanzhaoqing/workspace/deutsch-daily
python3 scripts/update_readings.py --env-file ~/.hermes/.env --publish
```

默认按 Europe/Berlin 昨天向前检查 7 天，只处理官方实际发布期数。
需要特定时间窗口时使用 `--since YYYY-MM-DD --until YYYY-MM-DD`；源字幕没变也要重生成时加 `--force`。

同一脚本也由 GitHub Actions 每天运行（`.github/workflows/update-lessons.yml`，UTC 05:17，可在 Actions 页手动触发并填 since/until/force）。
密钥放在仓库 Secrets 的 `GLM_API_KEY`（可选 `GLM_BASE_URL`、变量 `DEUTSCH_AI_MODEL`），只注入生成那一步。Hermes 与 Actions 任选其一或并用：
同一天源字幕不变时第二次运行只校验并重推，不会重复调用 AI。

## 数据流程

1. `config/reading-sources.json` 是当前来源白名单。域名、HTTPS、路径与重定向均需通过检查。只读页面与字幕文字，不下载视频（网页直接播放官方视频）。
2. 验证官方媒体日、字幕内容与节目主题，并计算字幕字节 SHA-256。已有同 SHA 的 broadcast 课程不重新调用 AI；旧的短读（reading）课程会被重生成。
3. `scripts/subtitle_sentences.py` 把字幕合并成带起止时间的句子（去掉 Gong / Untertitel / Copyright）。德语原句与时间轴只来自字幕，AI 不改写。
4. AI 只做：逐句中文翻译、按新闻分段（问候、各条新闻、天气、结束语各自成段）、每段最多 5 个词汇与 1 个语法点（用句子序号指向例句）。超过 90 句时分块翻译，再单独分段。
5. `validate-content.py` 严格校验 schema 2（每句有中文、时间递增、分段连续覆盖全部句子、词形出现在所指句子中）后原子保存 `data/content/YYYY-MM-DD.json`。失败不覆盖已有课程、不发布无效内容。
6. `publish.sh` 明确提交每期原始数据、学习内容、网页与前端产物（`docs/data`、`docs/app`），直接 push main，GitHub Pages 从 `/docs` 发布。无新 diff 时仍尝试 push，以恢复之前失败的推送。

## 边界与排障

- 不创建 PR；只暂存列出的路径（不做全仓库 `git add -A`）；不夹带其他暂存工作。
- 不发微信、邮件、PDF 或附件。任务输出仅留本机日志或 Actions 日志；不打印环境变量或密钥。
- 不把周末、缺失的节目或重复字幕写成新日期。
- 模板变动写 `templates/`，然后 `python3 build.py`；历史源数据不删除。
- 网络/API/校验失败时保留已有页面，查看本机任务输出，修复后重跑同一命令即可。
- 若工作目录移动，修复 Hermes 包装脚本路径与 skill 符号链接；不要另建一套调度器。
