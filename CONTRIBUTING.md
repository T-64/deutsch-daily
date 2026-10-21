# 参与 Deutsch Daily

欢迎修复抓取、切句、页面交互、无障碍和文档问题。新增内容来源前，请先开 source request 说明真实用户场景和内容许可边界。

## 本地检查

数据管线只依赖 Python 标准库；前端在 `web/`（Vite + React），构建结果提交在 `docs/app/`，所以日更不需要 Node。改了 `web/` 才需要：

```bash
(cd web && npm ci && npm run build)   # typecheck + 构建到 docs/app
python3 -m unittest discover -s tests -v
node tests/test_studio.js
python3 -m py_compile build.py scripts/*.py tests/*.py
bash -n scripts/*.sh
python3 scripts/validate-content.py --all
python3 build.py
git status --short -- docs   # 必须为空：提交的 docs/ 要与构建结果一致，CI 会检查
```

本地预览：

```bash
python3 -m http.server 4185 -d docs
```

界面规范、组件与本地存储键见 `DESIGN.md`。

## 改动边界

- AI 层只写 `data/content/*.json`，不要直接手写生成后的课程 HTML。
- 课程内容是 schema 2 `broadcast`：德语原句与时间轴来自官方字幕（`scripts/subtitle_sentences.py`），AI 只补中文、分段、词汇与语法。
- 日更由 `scripts/update_readings.py` 完成，可在本机（Hermes）或 GitHub Actions（`update-lessons.yml`）运行；密钥只放环境变量 / 仓库 Secrets，绝不写进文件或日志。
- 页面改动写在 `web/src/`（本地课程工坊仍在 `templates/studio.html` + `static/`），然后 `npm run build` + `python3 build.py`。
- `paragraphs` 与 `translations` 不仅段落数相同，段内句子也要逐句对应。
- 不要提交凭据、cookie、受限媒体、词典原始 dump 或用户数据。
- 不要为了支持一个站点绕过 DRM、登录、付费墙或平台限制。
- 日更发布只暂存 `publish.sh` 列出的路径，不要全仓库 `git add -A`。

## Pull request

请让一个提交只做一件事，并说明：用户看见了什么变化、怎样验证、还有什么没有测。
