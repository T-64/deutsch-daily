# 参与 Deutsch Daily

欢迎修复抓取、切句、页面交互、无障碍和文档问题。新增内容来源前，请先开 source request 说明真实用户场景和内容许可边界。

## 本地检查

项目只依赖 Python 标准库：

```bash
python3 -m unittest discover -s tests -v
python3 -m py_compile build.py scripts/*.py tests/*.py
bash -n scripts/*.sh
python3 scripts/validate-content.py --all
python3 build.py 2026-08-20-20uhr
```

本地预览：

```bash
python3 -m http.server 4185 -d docs
```

## 改动边界

- AI 层只写 `data/content/*.json`，不要直接手写生成后的课程 HTML。
- 页面改动写在 `templates/`，再用 `build.py` 渲染。
- `paragraphs` 与 `translations` 不仅段落数相同，段内句子也要逐句对应。
- 不要提交凭据、cookie、受限媒体、词典原始 dump 或用户数据。
- 不要为了支持一个站点绕过 DRM、登录、付费墙或平台限制。
- 日更发布继续使用定点 `git add`，不要 `git add -A`。

## Pull request

请让一个提交只做一件事，并说明：用户看见了什么变化、怎样验证、还有什么没有测。
