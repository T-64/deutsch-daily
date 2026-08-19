# 离线德→汉词典

构建时用，页面不访问网络。

| 文件 | 来源 |
|---|---|
| `wikdict-de-zh.sqlite3` | [Wikdict de-zh](https://download.wikdict.com/dictionaries/sqlite/2/de-zh.sqlite3) |
| `kaikki-de-zh.jsonl` | [kaikki 中文维基「德语」](https://kaikki.org/zhwiktionary/德语/) |
| `de-zh.sqlite` | 上面两份灌装后的查询库 |

重灌：`python3 scripts/import-de-zh.py`
重填本期词：`python3 build.py --dict`

这三份都不进 git（体积大、可再下）。页面只用 `data/dict-cache.json`。
