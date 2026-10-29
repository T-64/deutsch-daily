<p align="center">
  <a href="https://t-64.github.io/deutsch-daily/">
    <img src=".github/assets/home-dark.png#gh-dark-mode-only" alt="Deutsch Daily" width="100%">
    <img src=".github/assets/home-light.png#gh-light-mode-only" alt="Deutsch Daily" width="100%">
  </a>
</p>

<h1 align="center">Deutsch <i>Daily</i></h1>

<p align="center">
  <i>tagesschau in Einfacher Sprache — Satz für Satz.</i><br>
  <a href="https://t-64.github.io/deutsch-daily/"><b>t-64.github.io/deutsch-daily</b></a>
</p>

<br>

每天一期 tagesschau 简易德语新闻。原声视频配官方字幕，逐句同步、逐句中文；跟读、循环、点词即查，生词导出 Anki。A2–B1，无需登录。

|  |  |
|---|---|
| **原声** | 当天节目视频，官方字幕按句切分、带时间轴，当前句跟着声音高亮 |
| **跟练** | 连续 · 逐句跟读（每句后暂停）· 单句循环 · 0.75–1× · 仅音频 |
| **译文** | 盲听 · 只看当前句 · 全部 |
| **查词** | 任意单词可点，查词时自动暂停；重点词汇与语法按段整理 |
| **复习** | 生词本可拖动排序，一键导出 `.apkg` |

<br>

## Pipeline

```
tagesschau.de ─▶ 官方字幕 ─▶ 切句 + 时间轴 ─▶ AI 逐句中文 · 分段 · 词汇 · 语法 ─▶ 校验 ─▶ GitHub Pages
```

每天由 [GitHub Actions](.github/workflows/update-lessons.yml) 自动运行（05:17 UTC，14:43 UTC 补跑）。德语原文与时间只取自官方字幕，AI 不改写；单日失败不影响其他日期。

## Develop

```bash
python3 build.py                                   # data/content → docs/
python3 -m http.server 4185 -d docs                # 预览
(cd web && npm ci && npm run build)                # 改前端时：React → docs/app
python3 scripts/update_readings.py --env-file .env # 本地生成（需 GLM_API_KEY）
```

前端 Vite · React · Radix · Motion · Zustand；数据管线只用 Python 标准库。
结构与设计规范见 [`DESIGN.md`](DESIGN.md)，贡献方式见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

<br>

<p align="center">
  <sub>Video &amp; Untertitel © ARD / NDR tagesschau · 仅供个人语言学习 · 译文由 AI 生成 · <a href="NOTICE.md">Notice</a> · <a href="LICENSE">MIT</a></sub>
</p>
