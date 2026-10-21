#!/usr/bin/env python3
"""Validate one Deutsch Daily content JSON (broadcast schema 2 or legacy). Exit 0 = OK, 1 = FAIL."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

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


def whitelisted(url: str) -> bool:
    u = urlparse(url)
    sources = json.loads((ROOT / "config/reading-sources.json").read_text())["sources"]
    return any(s["enabled"] and u.scheme == "https" and u.hostname == s["allowed_host"]
               and u.path.startswith(s["allowed_path"]) and not u.username and not u.password
               and u.port in (None, 443) for s in sources)


def is_num(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def broadcast_errors(doc: dict) -> list[str]:
    """Schema 2: official subtitle sentences + AI zh, contiguous stories, vocab/grammar by sentence index."""
    errors: list[str] = []
    if doc.get("schema") != 2:
        errors.append("broadcast lessons need schema 2")
    if doc.get("source") != "einfach" or doc.get("level") != "A2–B1":
        errors.append("broadcast lessons must be einfach at A2–B1")
    if not re.fullmatch(r"[0-9a-f]{64}", str(doc.get("source_text_sha256") or "")):
        errors.append("broadcast requires SHA-256 of the source subtitles")
    if not whitelisted(str(doc.get("source_url") or "")):
        errors.append("source_url is outside the active whitelist")
    if doc.get("slug") != doc.get("date"):
        errors.append("slug must equal date")
    sents = doc.get("sentences")
    if not isinstance(sents, list) or not sents:
        return errors + ["sentences must be a non-empty list"]
    last = -1.0
    for i, s in enumerate(sents):
        if not isinstance(s, dict):
            errors.append(f"sentences[{i}] is not an object")
            continue
        for field in ("de", "zh"):
            if not isinstance(s.get(field), str) or not s[field].strip():
                errors.append(f"sentences[{i}] missing {field}")
        a, b = s.get("start"), s.get("end")
        if not is_num(a) or not is_num(b) or a > b:
            errors.append(f"sentences[{i}] needs numeric start <= end")
            continue
        if a < last:
            errors.append(f"sentences[{i}] starts before the previous sentence")
        last = a
    stories = doc.get("stories")
    if not isinstance(stories, list) or not stories:
        return errors + ["stories must be a non-empty list"]
    expect = 0
    for k, st in enumerate(stories):
        sp = f"stories[{k}]"
        if not isinstance(st, dict):
            errors.append(f"{sp} is not an object")
            continue
        for field in ("title", "title_zh"):
            if not isinstance(st.get(field), str) or not st[field].strip():
                errors.append(f"{sp} missing {field}")
        lo, hi = st.get("from"), st.get("to")
        if not isinstance(lo, int) or not isinstance(hi, int) or isinstance(lo, bool) or isinstance(hi, bool) or lo > hi:
            errors.append(f"{sp} needs integer from <= to")
            continue
        if lo != expect:
            errors.append(f"{sp} starts at {lo}, expected {expect} (ranges must be contiguous)")
        expect = hi + 1
        if hi >= len(sents):
            errors.append(f"{sp} ends at {hi}, beyond the last sentence {len(sents) - 1}")
            continue
        vocab = st.get("vocab")
        if not isinstance(vocab, list) or len(vocab) > 5:
            errors.append(f"{sp} vocab must be a list of at most 5")
            vocab = []
        for j, v in enumerate(vocab):
            vp = f"{sp}.vocab[{j}]"
            if not isinstance(v, dict):
                errors.append(f"{vp} is not an object")
                continue
            for field in ("lemma", "key", "pos", "zh"):
                if not isinstance(v.get(field), str) or not v[field].strip():
                    errors.append(f"{vp} missing {field}")
            idx = v.get("sentence")
            if not isinstance(idx, int) or isinstance(idx, bool) or not lo <= idx <= hi:
                errors.append(f"{vp} sentence must be an index inside {lo}-{hi}")
                continue
            forms = v.get("forms")
            text = str(sents[idx].get("de") or "").casefold() if isinstance(sents[idx], dict) else ""
            if not isinstance(forms, list) or not forms:
                errors.append(f"{vp} forms must be a non-empty list")
            elif any(not isinstance(f, str) or not f.strip() or f.casefold() not in text for f in forms):
                errors.append(f"{vp} forms must occur in sentence {idx}")
        grammar = st.get("grammar_points")
        if not isinstance(grammar, list) or len(grammar) > 1:
            errors.append(f"{sp} grammar_points must be a list of at most 1")
            grammar = []
        for j, g in enumerate(grammar):
            gp = f"{sp}.grammar_points[{j}]"
            if not isinstance(g, dict):
                errors.append(f"{gp} is not an object")
                continue
            for field in ("title", "summary"):
                if not isinstance(g.get(field), str) or not g[field].strip():
                    errors.append(f"{gp} missing {field}")
            idx = g.get("sentence")
            if not isinstance(idx, int) or isinstance(idx, bool) or not lo <= idx <= hi:
                errors.append(f"{gp} sentence must be an index inside {lo}-{hi}")
    if expect != len(sents):
        errors.append(f"stories cover sentences 0-{expect - 1}, but there are {len(sents)}")
    return errors


def report(path: Path, errors: list[str], summary: str) -> int:
    if errors:
        print(f"FAIL {path.name} ({len(errors)})")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"OK {path.name} ({summary})")
    return 0


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

    if not isinstance(doc, dict):
        print(f"FAIL {path}: top level must be an object", file=sys.stderr)
        return 1
    if doc.get("content_kind") == "broadcast":
        errors = broadcast_errors(doc)
        if not DATE_RE.match(str(doc.get("date") or "")):
            errors.append(f"bad date: {doc.get('date')!r}")
        elif SLUG_RE.match(path.stem) and path.stem != doc["date"]:
            errors.append(f"filename {path.stem} != doc.date {doc['date']}")
        n = len(doc.get("sentences") or []), len(doc.get("stories") or [])
        return report(path, errors, f"{n[0]} sentences, {n[1]} stories")

    # Legacy schema (video lessons and the retired short readings).
    from build import pair_sentences, split_de_sents

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
        if not whitelisted(str(doc.get("source_url") or "")):
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

    return report(path, errors, f"{len(news)} news")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
