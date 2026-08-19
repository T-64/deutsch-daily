#!/usr/bin/env python3
"""Validate one Deutsch Daily content JSON. Exit 0 = OK, 1 = FAIL."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "data" / "content"
REQUIRED_TOP = ("date", "video_page", "embed_url", "news")
REQUIRED_NEWS = ("title", "paragraphs", "translations", "vocab", "grammar_points", "background")
REQUIRED_VOCAB = ("lemma", "key", "forms", "pos", "zh", "example_de")
REQUIRED_GRAMMAR = ("title", "summary", "example_de", "example_zh")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def is_wetter(title: str) -> bool:
    t = (title or "").lower()
    return "wetter" in t or t.strip() in {"das wetter", "weather"}


def vocab_range(title: str) -> tuple[int, int]:
    return (3, 8) if is_wetter(title) else (5, 10)


def load_path(arg: str) -> Path:
    p = Path(arg)
    if p.exists():
        return p
    if DATE_RE.match(arg):
        return CONTENT / f"{arg}.json"
    raise SystemExit(f"usage: validate-content.py <file.json|YYYY-MM-DD>\nnot found: {arg}")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: validate-content.py <file.json|YYYY-MM-DD>", file=sys.stderr)
        return 1
    path = load_path(argv[1])
    errors: list[str] = []
    try:
        doc = json.loads(path.read_text())
    except Exception as e:
        print(f"FAIL {path}: cannot parse JSON ({e})", file=sys.stderr)
        return 1

    for k in REQUIRED_TOP:
        if k not in doc:
            errors.append(f"missing top-level field {k}")
    if not DATE_RE.match(str(doc.get("date") or "")):
        errors.append(f"bad date: {doc.get('date')!r}")
    if path.stem != str(doc.get("date") or path.stem) and DATE_RE.match(path.stem):
        if path.stem != doc.get("date"):
            errors.append(f"filename date {path.stem} != doc.date {doc.get('date')}")

    news = doc.get("news")
    if not isinstance(news, list) or not news:
        errors.append("news must be a non-empty list")
        news = []

    for i, item in enumerate(news):
        prefix = f"news[{i}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} is not an object")
            continue
        for k in REQUIRED_NEWS:
            if k not in item:
                errors.append(f"{prefix} missing {k}")
        paras = item.get("paragraphs") or []
        trans = item.get("translations") or []
        if not isinstance(paras, list) or not isinstance(trans, list):
            errors.append(f"{prefix} paragraphs/translations must be lists")
        elif len(paras) != len(trans):
            errors.append(f"{prefix} paragraphs={len(paras)} translations={len(trans)}")
        elif len(paras) < 1:
            errors.append(f"{prefix} has no paragraphs")
        else:
            for j, (de, zh) in enumerate(zip(paras, trans)):
                if not str(de).strip() or not str(zh).strip():
                    errors.append(f"{prefix} empty paragraph or translation at {j}")

        vocab = item.get("vocab") or []
        lo, hi = vocab_range(str(item.get("title") or ""))
        if not isinstance(vocab, list):
            errors.append(f"{prefix} vocab must be a list")
        elif not (lo <= len(vocab) <= hi):
            errors.append(f"{prefix} vocab count {len(vocab)} not in {lo}-{hi}")
        else:
            for k, v in enumerate(vocab):
                vp = f"{prefix}.vocab[{k}]"
                if not isinstance(v, dict):
                    errors.append(f"{vp} is not an object")
                    continue
                for field in REQUIRED_VOCAB:
                    if not v.get(field) and field != "example_de":
                        errors.append(f"{vp} missing {field}")
                if not isinstance(v.get("forms"), list) or not v.get("forms"):
                    errors.append(f"{vp} forms must be a non-empty list")
                if "," in str(v.get("lemma") or "") and "forms" in v:
                    pass
                example = str(v.get("example_de") or "").strip()
                joined = " ".join(str(p) for p in paras)
                if example and example not in joined:
                    errors.append(f"{vp} example_de is not copied from paragraphs")

        gp = item.get("grammar_points") or []
        if not isinstance(gp, list):
            errors.append(f"{prefix} grammar_points must be a list")
        elif len(gp) > 2:
            errors.append(f"{prefix} grammar_points={len(gp)} (max 2)")
        else:
            for k, g in enumerate(gp):
                gp_ = f"{prefix}.grammar_points[{k}]"
                if not isinstance(g, dict):
                    errors.append(f"{gp_} is not an object")
                    continue
                for field in REQUIRED_GRAMMAR:
                    if not str(g.get(field) or "").strip():
                        errors.append(f"{gp_} missing {field}")

        if item.get("background") is None:
            errors.append(f"{prefix} background must be a string (empty ok)")

    if errors:
        print(f"FAIL {path.name} ({len(errors)})")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"OK {path.name} ({len(news)} news)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
