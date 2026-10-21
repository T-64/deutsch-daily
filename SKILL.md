---
name: tagesschau-einfache-sprache
description: "Maintain Deutsch Daily A2–B1 simple text readings: whitelist, rolling-week catch-up, validate and directly publish."
version: 6.0.0
---

# Deutsch Daily — A2–B1 简易德语阅读

项目目录：`/home/tanzhaoqing/workspace/deutsch-daily`。
线上：https://t-64.github.io/deutsch-daily/

只运行简单版 `einfach`。20 点困难版已退役，禁止新抓或新生成 20uhr。
复用确定性脚本，无须 Agent 自己拼接抓取、编写 HTML、操作 git 或创建 PR。

```bash
cd /home/tanzhaoqing/workspace/deutsch-daily
python3 scripts/update_readings.py --env-file ~/.hermes/.env --publish
```

默认按 Europe/Berlin 昨天向前检查 7 天，只处理官方实际发布期数。
需要特定时间窗口时使用 `--since YYYY-MM-DD --until YYYY-MM-DD`。

## 数据流程

1. `config/reading-sources.json` 是当前来源白名单。域名、HTTPS、路径与重定向均需通过检查。只提取文字，不下载视频。
2. 验证官方媒体日、字幕内容与节目主题，并计算原文字节 SHA-256。若无新内容，不重新调用 AI。
3. AI 只生成简单德语短读、逐句中文翻译、重点词汇与语法。每个句对保存为一组，例句从已有句子索引提取。内容是学习改写，非全文转载或逐字字幕。
4. `validate-content.py` 校验通过后原子保存 `data/content/YYYY-MM-DD.json`。失败不覆盖已有课程、不发布无效内容。
5. `publish.sh` 明确提交每期原始数据、学习内容和网页，直接 push main，GitHub Pages 从 `/docs` 发布。无新 diff 时仍尝试 push，以恢复之前失败的推送。

## 边界与排障

- 不创建 PR；不使用 `git add -A`；不夹带其他暂存工作。
- 不发微信、邮件、PDF 或附件。任务输出仅留本机日志。
- 不把周末、缺失的节目或重复字幕写成新日期。
- 模板变动写 `templates/`，然后 `python3 build.py`；历史源数据不删除。
- 网络/API/校验失败时保留已有页面，查看本机任务输出，修复后重跑同一命令即可。
- 若工作目录移动，修复 Hermes 包装脚本路径与 skill 符号链接；不要另建一套调度器。
