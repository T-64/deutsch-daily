#!/usr/bin/env python3
"""Validate one Deutsch Daily content JSON. Exit 0 = OK, 1 = FAIL."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build import pair_sentences, split_de_sents

CONTENT = ROOT / "data" / "content"
REQUIRED_TOP = ("date", "video_page", "embed_url", "news")
REQUIRED_NEWS = ("title", "title_zh", "paragraphs", "translations", "vocab", "grammar_points", "background")
REQUIRED_VOCAB = ("lemma", "key", "forms", "pos", "zh", "example_de")
REQUIRED_GRAMMAR = ("title", "summary", "example_de", "example_zh")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SLUG_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:-(20uhr))?$")


def is_wetter(title: str) -> bool:
    t = (title or "").lower()
    return "wetter" in t or t.strip() in {"das wetter", "weather"}


def vocab_range(title: str) -> tuple[int, int]:
    return (3, 8) if is_wetter(title) else (5, 10)


def load_path(arg: str) -> Path:
    p = Path(arg)
    if p.exists():
        return p
    if SLUG_RE.match(arg):
        return CONTENT / f"{arg}.json"
    raise SystemExit(f"usage: validate-content.py <file.json|YYYY-MM-DD[-20uhr]>\nnot found: {arg}")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: validate-content.py <file.json|YYYY-MM-DD[-20uhr]|--all>", file=sys.stderr)
        return 1
    if argv[1] == "--all":
        paths = [p for p in sorted(CONTENT.glob("*.json")) if p.stem >= "2026-08-18"]
        if not paths:
            print("FAIL: no current-schema content files found", file=sys.stderr)
            return 1
        return int(any([main([argv[0], str(path)]) for path in paths]))
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
    sm = SLUG_RE.match(path.stem)
    if sm:
        file_date, src_suffix = sm.group(1), sm.group(2)
        if file_date != str(doc.get("date") or ""):
            errors.append(f"filename date {file_date} != doc.date {doc.get('date')}")
        if src_suffix == "20uhr" and doc.get("source") not in (None, "", "20uhr"):
            errors.append(f"20uhr file has source={doc.get('source')!r}")
        if src_suffix == "20uhr" and not doc.get("source"):
            errors.append("20uhr file missing source=20uhr")
        if not src_suffix and doc.get("source") == "20uhr":
            errors.append("source=20uhr must live in YYYY-MM-DD-20uhr.json")

    news = doc.get("news")
    if not isinstance(news, list) or not news:
        errors.append("news must be a non-empty list")
        news = []
    reading = doc.get("content_kind") == "reading"
    if reading:
        if doc.get("source") != "einfach" or doc.get("level") != "A2–B1":
            errors.append("readings must be einfach at A2–B1")
        if len(news) != 3:
            errors.append("readings must contain exactly 3 short stories")
        if not re.fullmatch(r"[0-9a-f]{64}", str(doc.get("source_text_sha256") or "")):
            errors.append("reading requires SHA-256 of the source text")
        source_url = urlparse(str(doc.get("source_url") or ""))
        sources = json.loads((ROOT / "config/reading-sources.json").read_text())["sources"]
        if not any(s["enabled"] and source_url.scheme == "https" and source_url.hostname == s["allowed_host"]
                   and source_url.path.startswith(s["allowed_path"]) and not source_url.username
                   and not source_url.password and source_url.port in (None, 443) for s in sources):
            errors.append("reading source_url is outside the active whitelist")
        if not doc.get("adaptation") or doc.get("embed_url"):
            errors.append("readings require an adaptation disclosure and no embedded player")
        words = sum(len(re.findall(r"[A-Za-zÄÖÜäöüß]+", p)) for n in news if isinstance(n, dict)
                    for p in (n.get("paragraphs") or []) if isinstance(p, str))
        if not 90 <= words <= 180:
            errors.append(f"reading length {words} words is outside 90–180")

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
            if reading and not 3 <= len(paras) <= 4:
                errors.append(f"{prefix} reading needs 3–4 sentence pairs")
            for j, (de, zh) in enumerate(zip(paras, trans)):
                if not isinstance(de, str) or not isinstance(zh, str):
                    errors.append(f"{prefix} paragraph/translation must be strings at {j}")
                    continue
                if not str(de).strip() or not str(zh).strip():
                    errors.append(f"{prefix} empty paragraph or translation at {j}")
                    continue
                source_sentences = split_de_sents(str(de))
                if reading and len(source_sentences) != 1:
                    errors.append(f"{prefix} reading item {j} must hold exactly one sentence")
                pairs = pair_sentences(str(de), str(zh))
                if len(pairs) != len(source_sentences) or any(not p.get("zh") for p in pairs):
                    errors.append(
                        f"{prefix} sentence alignment failed at paragraph {j}: "
                        f"German={len(source_sentences)} rendered pairs={len(pairs)}"
                    )

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
                elif reading and any(not isinstance(form, str) or not form or form.casefold() not in " ".join(paras).casefold() for form in v["forms"]):
                    errors.append(f"{vp} forms must occur in the reading")
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
