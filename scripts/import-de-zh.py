#!/usr/bin/env python3
"""灌装离线德→汉词典 SQLite。

来源（都是离线文件，无 API）:
  1. Wikdict de-zh      data/dict/wikdict-de-zh.sqlite3
  2. kaikii 中文维基德语  data/dict/kaikki-de-zh.jsonl  （词形/词性补全）

用法:
  python3 scripts/import-de-zh.py
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT = ROOT / "data" / "dict"
WIKDICT = DICT / "wikdict-de-zh.sqlite3"
KAIKKI = DICT / "kaikki-de-zh.jsonl"
DB = DICT / "de-zh.sqlite"

POS_MAP = {
    "noun": "Substantiv", "name": "Substantiv", "verb": "Verb",
    "adj": "Adjektiv", "adv": "Adverb", "pron": "Pronomen",
    "prep": "Präposition", "postp": "Präposition", "conj": "Konjunktion",
    "num": "Zahl", "phrase": "Phrase", "prep_phrase": "Phrase",
    "article": "Artikel", "det": "Determinativ", "particle": "Partikel",
    "intj": "Interjektion", "prefix": "Präfix", "suffix": "Suffix",
    "abbrev": "Abkürzung", "contraction": "Zusammenziehung",
}
CJK = re.compile(r"[\u4e00-\u9fff]")
NOISE = re.compile(
    r"^(國際音標|国际音标|音標|IPA|相關詞|相关词汇|近義詞|近义词|反義詞|反义词|"
    r"变格|變格|变形|搭配|參見|参见|延伸阅读|來源|来源|第三人稱|第一人稱|第二人稱|"
    r"過去時|现在时|現在時|分詞|属格|屬格)"
)


def good_zh(s: str) -> bool:
    s = (s or "").strip()
    if not s or not CJK.search(s) or NOISE.match(s):
        return False
    if "变格" in s or "變格" in s:
        return False
    return True


def clip(s: str) -> str:
    s = re.sub(r"\s+", " ", (s or "").strip())
    return (s[:80].rstrip() + "…") if len(s) > 80 else s


def pick_kaikki_gloss(senses: list) -> str:
    for sense in senses or []:
        for g in sense.get("glosses") or []:
            if good_zh(str(g)):
                return clip(str(g))
    return ""


def collect_forms(obj: dict) -> set[str]:
    out = set()
    word = (obj.get("word") or "").strip()
    if word:
        out.add(word)
    for item in obj.get("forms") or []:
        form = (item.get("form") or "").strip()
        if form and " " not in form and 2 <= len(form) <= 40:
            out.add(form)
    return out


def import_all() -> None:
    if not WIKDICT.exists():
        raise SystemExit(f"missing {WIKDICT}")
    if not KAIKKI.exists():
        raise SystemExit(f"missing {KAIKKI}")
    if DB.exists():
        DB.unlink()
    out = sqlite3.connect(DB)
    out.execute(
        "CREATE TABLE entries ("
        " key TEXT NOT NULL, lemma TEXT, pos TEXT, zh TEXT,"
        " source TEXT, score REAL)"
    )
    rows: list[tuple] = []

    wik = sqlite3.connect(f"file:{WIKDICT}?mode=ro", uri=True)
    n_w = 0
    for written, trans, score in wik.execute(
        "SELECT written_rep, trans_list, max_score FROM simple_translation"
    ):
        lemma = (written or "").strip()
        if not lemma or " " in lemma:
            continue
        parts = [p.strip() for p in str(trans or "").split("|") if good_zh(p)]
        if not parts:
            continue
        zh = clip("；".join(parts[:2]))
        rows.append((lemma.lower(), lemma, "", zh, "wikdict", float(score or 0)))
        n_w += 1
    wik.close()

    n_k = 0
    with KAIKKI.open(encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            lemma = (obj.get("word") or "").strip()
            if not lemma:
                continue
            zh = pick_kaikki_gloss(obj.get("senses") or [])
            pos = POS_MAP.get((obj.get("pos") or "").lower(), "")
            for form in collect_forms(obj):
                rows.append((form.lower(), lemma, pos, zh, "kaikki", 1.0 if zh else 0.0))
                n_k += 1

    out.executemany(
        "INSERT INTO entries(key, lemma, pos, zh, source, score) VALUES (?,?,?,?,?,?)",
        rows,
    )
    out.execute("CREATE INDEX idx_key ON entries(key)")
    out.commit()
    n_keys = out.execute("SELECT COUNT(DISTINCT key) FROM entries").fetchone()[0]
    n_zh = out.execute("SELECT COUNT(DISTINCT key) FROM entries WHERE zh!=''").fetchone()[0]
    out.close()
    print(f"wikdict {n_w} + kaikii rows {n_k} → distinct keys {n_keys} (with zh {n_zh}) → {DB}")


if __name__ == "__main__":
    import_all()
    sys.exit(0)
