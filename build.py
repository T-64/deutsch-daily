#!/usr/bin/env python3
"""Deutsch Daily 渲染器

data/content/YYYY-MM-DD.json + templates/ → docs/YYYY-MM-DD.html (+index.html)

词义来源:
  1. content.json 的 vocab（lemma/forms）
  2. data/dict-cache.json — 本地德汉词典（Wikdict + kaikii 中文维基德语）
  3. 查不到 → 前端可自填

用法:
  python3 build.py               # 渲染全部 content → docs/
  python3 build.py 2026-08-13    # 渲染一期（+ 入口页与 assets）
  python3 build.py --dict        # 用本地词典重填 dict-cache（离线，无限流）
"""
import hashlib
import json
from html import escape
import re
import shutil
import sqlite3
import sys
from difflib import SequenceMatcher
from pathlib import Path

BASE = Path(__file__).parent
sys.path.insert(0, str(BASE / "scripts"))
from sources import SOURCES, detect_source, parse_slug, slug_for
from subtitle_sentences import cue_sentences

DATA = BASE / "data"
CONTENT = DATA / "content"
META = DATA / "meta"
TRANSCRIPTS = DATA / "transcripts"
CACHE = DATA / "dict-cache.json"
DICT_DB = DATA / "dict" / "de-zh.sqlite"
TEMPLATES = BASE / "templates"
STATIC = BASE / "static"
SITE = BASE / "docs"
FROZEN_DATES = frozenset({"2026-07-31", "2026-08-03", "2026-08-11"})

TOKEN_RE = re.compile(r"[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]*")
SENT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ])")
DE_SENT_BOUNDARY_RE = re.compile(r'([.!?…][»”"]?)(\s+)(?=[A-ZÄÖÜ„"»0-9])')
DE_NON_TERMINALS = {
    "bzw.", "ca.", "d.h.", "dr.", "etc.", "nr.", "prof.",
    "u.a.", "u.s.w.", "usw.", "z.b.",
}
# Shared page partials. Templates use __HEAD__ / __CORE__ / __FOOT__; see DESIGN.md.
THEME_BOOT = (
    "<script>try{var p=JSON.parse(localStorage.getItem('dd-prefs-v2')||'null')"
    "||{},l=JSON.parse(localStorage.getItem('dd-preferences')||'null')||{},"
    "t=p.theme||(l.theme==='dark'?'dark':'');if(t==='light'||t==='dark')"
    "document.documentElement.dataset.theme=t}catch(e){}</script>"
)
FOOTER = (
    '<footer class="foot"><div class="wrap"><span>Deutsch Daily · 简易德语新闻精读</span><nav>'
    '<a href="index.html">往期</a><a href="open.html">用视频链接学习</a>'
    '<a href="studio.html">本地课程工坊</a><a href="about.html">关于</a>'
    '<a href="https://github.com/T-64/deutsch-daily" rel="noopener">GitHub</a></nav></div></footer>'
)

SKIP_CUE = re.compile(r"(gong|untertitel|norddeutscher rundfunk|willkommen zur tagesschau|"
                      r"ich bin |das waren unsere nachrichten|das war die tagesschau)", re.I)


def load_cache():
    return json.loads(CACHE.read_text()) if CACHE.exists() else {}


def save_cache(c):
    CACHE.write_text(json.dumps(c, ensure_ascii=False, indent=1, sort_keys=True))


_DICT = None
_DICT_CJK = re.compile(r"[\u4e00-\u9fff]")


def dict_conn():
    global _DICT
    if _DICT is None:
        if not DICT_DB.exists():
            raise SystemExit(f"缺少本地词典 {DICT_DB}，先跑 python3 scripts/import-de-zh.py")
        _DICT = sqlite3.connect(f"file:{DICT_DB}?mode=ro", uri=True)
    return _DICT


def _good_zh(zh: str) -> bool:
    zh = (zh or "").strip()
    if not zh or not _DICT_CJK.search(zh):
        return False
    if any(x in zh for x in ("变格", "變格", "第三人稱", "現在時", "现在时")):
        return False
    return True


def _key_candidates(surface: str) -> list[str]:
    key = (surface or "").strip().lower()
    if not key:
        return []
    out = [key]
    folded = key.replace("ä", "a").replace("ö", "o").replace("ü", "u").replace("ß", "ss")
    if folded != key:
        out.append(folded)
    for suf in ("ern", "en", "er", "es", "e", "n", "s"):
        if len(key) > len(suf) + 3 and key.endswith(suf):
            stem = key[: -len(suf)]
            out.append(stem)
            out.append(stem.replace("ä", "a").replace("ö", "o").replace("ü", "u"))
    if key.endswith("t") and not key.endswith(("st", "heit", "keit", "schaft", "ung")):
        out.append(key[:-1] + "en")
        out.append(key[:-1] + "n")
    m = re.match(r"^([a-zäöüß]{2,})zu([a-zäöüß]{3,})$", key)
    if m:
        out.append(m.group(1) + m.group(2))
    seen = set()
    uniq = []
    for k in out:
        if k not in seen:
            seen.add(k)
            uniq.append(k)
    return uniq


def local_lookup(surface: str):
    """查本地 de-zh SQLite。优先 Wikdict 高分对译，其次 kaikii 中文释义。"""
    if not (surface or "").strip():
        return None
    tried = set()
    for key in _key_candidates(surface):
        if key in tried:
            continue
        tried.add(key)
        rows = dict_conn().execute(
            "SELECT lemma, pos, zh, source, score FROM entries WHERE key=?", (key,)
        ).fetchall()
        picked = _pick_row(rows, surface)
        if picked:
            return picked
        lemmas = {r[0] for r in rows if r[0] and r[0].lower() not in tried}
        for lemma in lemmas:
            extra = dict_conn().execute(
                "SELECT lemma, pos, zh, source, score FROM entries WHERE key=?",
                (lemma.lower(),),
            ).fetchall()
            picked = _pick_row(extra, lemma)
            if picked:
                return picked
    return None


def _pick_row(rows, surface: str):
    if not rows:
        return None
    wiki = [r for r in rows if r[3] == "wikdict" and _good_zh(r[2])]
    kai = [r for r in rows if r[3] == "kaikki" and _good_zh(r[2])]
    wiki.sort(key=lambda r: -float(r[4] or 0))
    lower = (surface or "")[:1].islower()
    if lower:
        kai_verb = [r for r in kai if r[1] == "Verb"]
        if kai_verb:
            kai = kai_verb + [r for r in kai if r not in kai_verb]
    if wiki and float(wiki[0][4] or 0) >= 5:
        lemma, pos, zh, _src, _sc = wiki[0]
        if lower:
            pos = next((r[1] for r in kai if r[1] == "Verb"), "")
        elif not pos:
            pos = next((r[1] for r in kai if r[1]), "")
        return {"word": lemma or surface, "zh": zh, "pos": pos or ""}
    if kai:
        lemma, pos, zh, _src, _sc = kai[0]
        return {"word": lemma or surface, "zh": zh, "pos": pos or ""}
    if wiki:
        lemma, pos, zh, _src, _sc = wiki[0]
        return {"word": lemma or surface, "zh": zh, "pos": pos or ""}
    return None


def update_dict_cache(limit=None):
    wanted = set()
    for f in sorted(CONTENT.glob("*.json")):
        doc = json.loads(f.read_text())
        for n in doc["news"]:
            for p in n.get("paragraphs") or []:
                for t in TOKEN_RE.findall(p):
                    if len(t) >= 3:
                        wanted.add(t)
            for v in n.get("vocab") or []:
                for form in v.get("forms") or []:
                    if " " not in form and len(form) >= 3:
                        wanted.add(form)
    items = sorted(wanted, key=str.lower)
    if limit:
        items = items[:limit]
    print(f"本地词典: 待填 {len(items)} 个词形")
    cache = {}
    done = fail = 0
    for w in items:
        r = local_lookup(w)
        if r:
            cache[w.lower()] = r
            done += 1
        else:
            cache[w.lower()] = {"word": w, "zh": "", "pos": ""}
            fail += 1
    save_cache(cache)
    print(f"完成: {done} 命中, {fail} 未命中 → {CACHE}")


def load_json(path):
    p = Path(path)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception as e:
        print(f"[warn] 读 {p.name} 失败: {e}")
        return None


def derive_mp4_url(meta):
    if not meta:
        return ""
    m3u8 = meta.get("m3u8") or ""
    m = re.search(r"/video/(\d{4}/\d{4})/(TV-[^,]+)", m3u8)
    if not m:
        return ""
    return f"https://tagesschau-progressive.ard-mcdn.de/video/{m.group(1)}/{m.group(2)}.webl.h264.mp4"


def norm_de(text):
    text = (text or "").lower().replace("ß", "ss")
    text = re.sub(r"[^a-zäöü\s]", " ", text)
    return " ".join(text.split())


def content_file(slug):
    modern = CONTENT / f"{slug}.json"
    if modern.exists():
        return modern
    date, _src = parse_slug(slug)
    return CONTENT / f"content-{date}.json"


def content_slugs():
    slugs = []
    for p in CONTENT.glob("*.json"):
        stem = p.stem
        if stem.startswith("content-"):
            stem = stem[len("content-"):]
        slugs.append(stem)
    return sorted(slugs)


def doc_slug(doc, fallback=""):
    if doc.get("slug"):
        return doc["slug"]
    source = doc.get("source") or detect_source(doc.get("video_page") or "")
    date = doc.get("date") or fallback
    return slug_for(date, source)


def load_transcript(slug):
    data = load_json(TRANSCRIPTS / f"{slug}.json")
    if not isinstance(data, list):
        return []
    cues = []
    for row in data:
        text = (row.get("text") or "").replace("\n", " ").strip()
        if not text or SKIP_CUE.search(text):
            continue
        try:
            start = float(row.get("start") or 0)
            end = float(row.get("end") or start)
        except (TypeError, ValueError):
            continue
        n = norm_de(text)
        if not n:
            continue
        cues.append({"start": start, "end": end, "norm": n})
    return cues


def listen_track(slug):
    """Official subtitles regrouped into timed sentences (shared with the lesson generator)."""
    data = load_json(TRANSCRIPTS / f"{slug}.json")
    return cue_sentences(data) if isinstance(data, list) else []


def token_set(text):
    return set(norm_de(text).split())


def window_score(target, joined):
    if not target or not joined:
        return 0.0
    ratio = SequenceMatcher(None, target, joined).ratio()
    tt, jj = token_set(target), token_set(joined)
    cover = len(tt & jj) / len(tt) if tt else 0.0
    if target in joined or joined in target:
        ratio = max(ratio, 0.9)
    return max(ratio, cover)


def split_de_sents(text):
    text = re.sub(r"\s+", " ", (text or "").strip())
    if not text:
        return []
    parts = []
    start = 0
    for match in DE_SENT_BOUNDARY_RE.finditer(text):
        before = text[start:match.start(2)].rstrip('»”"')
        token = before.rsplit(" ", 1)[-1].lower()
        # 13. August / 1. FC Kaiserslautern and common abbreviations are not
        # sentence boundaries. A real boundary may still be followed by a
        # number ("Verstörende Bilder. 1400 Polizisten ...").
        if match.group(1).startswith(".") and (
            re.fullmatch(r"\d+\.", token)
            or token in DE_NON_TERMINALS
            or re.fullmatch(r"(?:[a-zäöüß]\.){1,3}", token)
        ):
            continue
        parts.append(text[start:match.start(2)].strip())
        start = match.end(2)
    parts.append(text[start:].strip())
    return [p for p in parts if p]


def split_zh_sents(text):
    text = re.sub(r"\s+", " ", (text or "").strip())
    if not text:
        return []
    parts = re.split(r'(?<=[。！？])', text)
    return [p.strip() for p in parts if p.strip()] or [text]


def split_zh_clauses(text):
    """Expand compact Chinese translations only when sentence counts require it."""
    text = re.sub(r"\s+", " ", (text or "").strip())
    if not text:
        return []
    parts = re.split(r'(?<=[。！？；，])', text)
    return [p.strip() for p in parts if p.strip()] or [text]


def merge_to_n(parts, n, joiner=" "):
    parts = [p for p in parts if p]
    if n <= 0 or len(parts) <= n:
        return parts
    parts = list(parts)
    while len(parts) > n:
        i = min(range(len(parts) - 1), key=lambda k: len(parts[k]) + len(parts[k + 1]))
        parts[i] = parts[i] + joiner + parts[i + 1]
        del parts[i + 1]
    return parts


def pair_sentences(de, zh):
    """Keep one content paragraph, but pair each German sentence with its Chinese."""
    ds = split_de_sents(de)
    zs = split_zh_sents(zh)
    if not ds:
        return []
    # Chinese often joins two directly corresponding German sentences with a
    # comma. Split those clauses before ever coalescing German source text.
    if len(zs) < len(ds):
        clauses = split_zh_clauses(zh)
        if len(clauses) >= len(ds):
            zs = merge_to_n(clauses, len(ds), "")
    if len(zs) > len(ds):
        zs = merge_to_n(zs, len(ds), "")
    elif len(zs) < len(ds):
        # Legacy content can be a genuinely condensed paragraph translation.
        # Keep its old rendering behaviour; current content is rejected by the
        # validator before publish if it reaches this fallback.
        if zs:
            ds = merge_to_n(ds, len(zs), " ")
        else:
            zs = [""] * len(ds)
    if not zs:
        zs = [(zh or "").strip()] * len(ds)
    return [{"de": a, "zh": b} for a, b in zip(ds, zs)]


FILM_CUE_RE = re.compile(
    r"(Dazu kommt jetzt ein Film|Dazu kommt ein Film|Jetzt zeigen wir einen Film|Im Film zeigen wir)",
    re.I,
)


def coalesce_sentence_items(paragraphs, translations):
    """Regroup JSON that was stored one sentence per item into studio/film paragraphs."""
    paras = list(paragraphs or [])
    trans = list(translations or [])
    if len(paras) < 4:
        return paras, trans
    singles = sum(1 for p in paras if len(split_de_sents(p)) <= 1)
    if singles < len(paras) * 0.75:
        return paras, trans
    groups_de, groups_zh = [[]], [[]]
    for de, zh in zip(paras, trans):
        groups_de[-1].append(de)
        groups_zh[-1].append(zh)
        if FILM_CUE_RE.search(de):
            groups_de.append([])
            groups_zh.append([])
    out_de, out_zh = [], []
    for ds, zs in zip(groups_de, groups_zh):
        if not ds:
            continue
        out_de.append(" ".join(ds))
        out_zh.append("".join(zs))
    return out_de, out_zh


def align_paragraphs(paragraphs, cues, cursor=0):
    """从 cursor 起顺着字幕对齐；对不上不回退到开头。返回 (times, new_cursor)。"""
    if not cues or not paragraphs:
        return [(None, None)] * len(paragraphs), cursor
    out = []
    for para in paragraphs:
        target = norm_de(para)
        if not target:
            out.append((None, None))
            continue
        best = (0.0, None, None, cursor)
        limit = len(cues)
        prefix = " ".join(target.split()[:8])
        for i in range(cursor, limit):
            acc = []
            for j in range(i, min(limit, i + 16)):
                acc.append(cues[j]["norm"])
                joined = " ".join(acc)
                score = window_score(target, joined)
                if prefix and prefix in joined:
                    score = max(score, 0.84)
                if score > best[0]:
                    best = (score, cues[i]["start"], cues[j]["end"], j + 1)
                if len(joined) > len(target) * 1.8 and score < 0.45:
                    break
            if cues[i]["start"] - (cues[cursor]["start"] if cursor < len(cues) else 0) > 320:
                break
        if best[0] >= 0.62 and best[1] is not None:
            out.append((best[1], best[2]))
            cursor = max(cursor, best[3])
        else:
            out.append((None, None))
            print(f"  [align] miss {best[0]:.2f}: {para[:48]}")
    return out, cursor


def surface_forms(lemma, forms):
    out = [f.strip() for f in (forms or []) if f and f.strip() and "," not in f]
    head = re.split(r"[,(+]", lemma or "")[0].strip()
    head = re.sub(r"^(der|die|das|ein|eine)\s+", "", head, flags=re.I).strip()
    if head and "," not in head and head not in out:
        out.append(head)
    return out


def form_in_text(form, text):
    if " " in form:
        return form in text
    return re.search(rf"(?<![A-Za-zÄÖÜäöüß]){re.escape(form)}(?![A-Za-zÄÖÜäöüß])", text) is not None


def example_from_source(paragraphs, forms):
    ordered = sorted({f for f in forms if f}, key=lambda s: (-len(s), s.lower()))
    if not ordered:
        return ""
    for para in paragraphs or []:
        for sent in SENT_RE.split((para or "").strip()) or [para]:
            sent = (sent or "").strip()
            if not sent:
                continue
            if any(form_in_text(form, sent) for form in ordered):
                return sent
    return ""


def editorial_vocab(news):
    items = []
    paras = news.get("paragraphs") or []
    for v in news.get("vocab") or []:
        lemma = (v.get("lemma") or "").strip()
        key = (v.get("key") or "").strip()
        if not lemma or not key:
            continue
        forms = surface_forms(lemma, v.get("forms") or [])
        example = example_from_source(paras, forms) or (v.get("example_de") or "")
        items.append({
            "lemma": lemma,
            "key": key,
            "forms": forms,
            "pos": v.get("pos") or "",
            "zh": v.get("zh") or "",
            "example_de": example,
            "example_zh": v.get("example_zh") or "",
        })
    return items


def word_gloss_map(vocab_items, texts, cache):
    """vocab_items: [{key, lemma, forms, pos, zh, example_de}] → gloss, form_to_key, phrases."""
    gloss, form_to_key, phrases = {}, {}, []
    for v in vocab_items:
        gloss[v["key"]] = {"word": v["lemma"], "zh": v["zh"], "pos": v["pos"], "example": v.get("example_de", ""), "source": "editorial"}
        for form in v["forms"]:
            form_to_key[form.lower()] = v["key"]
            if " " in form.strip() and not any(ch in form for ch in ",(+"):
                phrases.append(form.strip())
    for text in texts:
        for t in TOKEN_RE.findall(text):
            key = t.lower()
            if key in form_to_key or not cache.get(key, {}).get("zh"):
                continue
            gloss[key] = {"word": cache[key].get("word") or t, "zh": cache[key]["zh"], "pos": cache[key].get("pos") or "", "example": "", "source": "dict"}
            form_to_key[key] = key
    return gloss, form_to_key, sorted(set(phrases), key=lambda x: (-len(x), x.lower()))


SHOW = "tagesschau in Einfacher Sprache"
PENDING_NOTE = ""


def _vocab_item(v, sentences=None):
    lemma = (v.get("lemma") or "").strip()
    key = (v.get("key") or "").strip()
    if not lemma or not key:
        return None
    idx = v.get("sentence")
    ex_de, ex_zh = v.get("example_de") or "", v.get("example_zh") or ""
    if sentences is not None and isinstance(idx, int) and 0 <= idx < len(sentences):
        ex_de, ex_zh = sentences[idx]["de"], sentences[idx].get("zh", "")
    return {"key": key, "lemma": lemma, "forms": surface_forms(lemma, v.get("forms") or []), "pos": v.get("pos") or "",
            "zh": v.get("zh") or "", "example_de": ex_de, "example_zh": ex_zh}


def _grammar_item(g, sentences=None):
    idx = g.get("sentence")
    ex_de, ex_zh = g.get("example_de") or "", g.get("example_zh") or ""
    if sentences is not None and isinstance(idx, int) and 0 <= idx < len(sentences):
        ex_de, ex_zh = sentences[idx]["de"], sentences[idx].get("zh", "")
    return {"title": g.get("title") or "Grammatik", "summary": g.get("summary") or "", "example_de": ex_de, "example_zh": ex_zh}


def _timed(x):
    return None if x is None else round(float(x), 2)


def _broadcast(doc):
    sentences = [{"de": s["de"], "zh": s.get("zh") or "", "start": _timed(s.get("start")), "end": _timed(s.get("end"))} for s in doc["sentences"]]
    stories = []
    for st in doc["stories"]:
        vocab = [x for x in (_vocab_item(v, sentences) for v in st.get("vocab") or []) if x]
        stories.append({"title": st["title"], "title_zh": st.get("title_zh") or "", "from": st["from"], "to": st["to"],
                        "vocab": vocab, "grammar": [_grammar_item(g, sentences) for g in st.get("grammar_points") or []],
                        "background": st.get("background") or ""})
    return sentences, stories, ""


def _legacy_video(doc, slug, date, source):
    """Aligned 08–09/2026 lessons: news paragraphs paired sentence by sentence with subtitle times."""
    cues = load_transcript(slug)
    if not cues and source == "einfach" and slug != date:
        cues = load_transcript(date)
    sentences, stories, cursor = [], [], 0
    for n in doc["news"]:
        start = len(sentences)
        paras, trans = coalesce_sentence_items(n.get("paragraphs") or [], n.get("translations") or [])
        for de, zh in zip(paras, trans):
            lines = pair_sentences(de, zh)
            times, cursor = align_paragraphs([x["de"] for x in lines], cues, cursor)
            sentences += [{"de": line["de"], "zh": line["zh"], "start": _timed(a), "end": _timed(b)} for line, (a, b) in zip(lines, times)]
        if len(sentences) == start:
            continue
        stories.append({"title": n["title"], "title_zh": n.get("title_zh") or "", "from": start, "to": len(sentences) - 1,
                        "vocab": [x for x in (_vocab_item({**v, "example_de": example_from_source(n.get("paragraphs") or [], surface_forms(v.get("lemma") or "", v.get("forms") or [])) or v.get("example_de") or ""}) for v in n.get("vocab") or []) if x],
                        "grammar": [_grammar_item(g) for g in (n.get("grammar_points") or [])[:2]],
                        "background": n.get("background") or ""})
    return sentences, stories, ""


def _legacy_reading(doc, slug, date):
    """Oct 2026 short readings: show the broadcast transcript instead of the AI rewrite until regenerated."""
    track = listen_track(slug) or listen_track(date)
    sentences = [{"de": x["de"], "zh": "", "start": x["start"], "end": x["end"]} for x in track]
    if not sentences:
        return _legacy_video(doc, slug, date, "einfach")
    text = " ".join(x["de"] for x in sentences)
    vocab, seen = [], set()
    for n in doc["news"]:
        for v in n.get("vocab") or []:
            item = _vocab_item(v)
            if not item or item["key"] in seen or not any(form_in_text(f, text) for f in item["forms"]):
                continue
            seen.add(item["key"])
            item["example_de"] = next((x["de"] for x in sentences if any(form_in_text(f, x["de"]) for f in item["forms"])), "")
            item["example_zh"] = ""
            vocab.append(item)
    stories = [{"title": "Die Sendung", "title_zh": " · ".join(n.get("title_zh") or n["title"] for n in doc["news"]),
                "from": 0, "to": len(sentences) - 1, "vocab": vocab, "grammar": [], "background": ""}]
    return sentences, stories, PENDING_NOTE


def lesson_payload(doc, fallback_slug=""):
    date = doc["date"]
    slug = doc_slug(doc, fallback_slug or date)
    source = doc.get("source") or detect_source(doc.get("video_page") or "")
    meta = load_json(META / f"{slug}.json") or (load_json(META / f"{date}.json") if slug != date else None) or {}
    kind = doc.get("content_kind") or "video"
    if kind == "broadcast":
        sentences, stories, note = _broadcast(doc)
    elif kind == "reading":
        sentences, stories, note = _legacy_reading(doc, slug, date)
    else:
        if any(len(n.get("paragraphs") or []) != len(n.get("translations") or []) for n in doc["news"]):
            raise SystemExit(f"{slug}: paragraphs 与 translations 数量不一致")
        sentences, stories, note = _legacy_video(doc, slug, date, source)
    vocab_items = [v for st in stories for v in st["vocab"]]
    gloss, form_to_key, phrases = word_gloss_map(vocab_items, [x["de"] for x in sentences], load_cache())
    for st in stories:
        for v in st["vocab"]:
            v.pop("forms", None)
    ends = [x["end"] for x in sentences if x["end"] is not None]
    return {
        "slug": slug, "date": date, "show": SHOW if source == "einfach" else SOURCES[source]["label"],
        "level": doc.get("level") or "A2–B1", "kind": kind if kind in ("broadcast", "reading") else "video", "note": note,
        "source_url": doc.get("source_url") or doc.get("video_page") or meta.get("episode_url") or "",
        "video": {"mp4": derive_mp4_url(meta), "embed": doc.get("embed_url") or "",
                  "page": meta.get("video_page") or doc.get("video_page") or ""},
        "duration": max(ends) if ends else None,
        "sentences": sentences, "stories": stories, "gloss": gloss, "form_to_key": form_to_key, "phrases": phrases,
    }


def catalog_item(doc, slug):
    """Home/archive entry, computed without subtitle alignment so a one-day build stays fast."""
    date = doc["date"]
    meta = load_json(META / f"{slug}.json") or (load_json(META / f"{date}.json") if slug != date else None) or {}
    kind = doc.get("content_kind") or "video"
    urls = []
    for url in (doc.get("video_page"), doc.get("embed_url"), doc.get("source_url"), meta.get("episode_url"), meta.get("video_page")):
        if url and url not in urls:
            urls.append(url)
    if kind == "broadcast":
        stories = [st for st in doc["stories"] if st.get("vocab")] or doc["stories"]
        titles, titles_zh = [st["title"] for st in stories], [st.get("title_zh") or "" for st in stories]
        ends = [x.get("end") for x in doc["sentences"] if x.get("end") is not None]
    else:
        titles, titles_zh = [n["title"] for n in doc["news"]], [n.get("title_zh") or "" for n in doc["news"]]
        track = listen_track(slug) or (listen_track(date) if slug != date else [])
        ends = [x["end"] for x in track]
    return {"slug": slug, "date": date, "kind": kind if kind in ("broadcast", "reading") else "video", "count": len(titles),
            "duration": round(max(ends), 2) if ends else None, "titles": titles, "titles_zh": titles_zh,
            "mp4": derive_mp4_url(meta), "urls": urls}


def render(doc):
    """Kept for tests and scripts: the lesson page for one content document."""
    lesson = lesson_payload(doc)
    return app_page({"page": "lesson", "lesson": lesson, "items": []}, de_title(lesson["date"]),
                    " · ".join(st["title"] for st in lesson["stories"][:4]))


MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]


def de_title(date):
    _, m, d = (int(x) for x in date.split("-"))
    return f"{d}. {MONTHS_DE[m - 1]}"


def to_script_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


APP_SHELL = SITE / "app" / "index.html"


def app_page(data, title, description):
    """Stamp one page from the Vite-built shell (docs/app/index.html) — no Node needed here."""
    if not APP_SHELL.exists():
        raise SystemExit("缺少 docs/app/index.html：先在 web/ 里运行 npm ci && npm run build")
    html = APP_SHELL.read_text().replace('"./assets/', '"app/assets/')
    html = html.replace("<title>Deutsch Daily</title>", f"<title>{escape(title)} — Deutsch Daily</title>")
    html = html.replace("<!--dd:head-->", f'<meta name="description" content="{escape(description)}">')
    return html.replace("<!--dd:data-->", f'<script id="dd-data" type="application/json">{to_script_json(data)}</script>')


def asset_version():
    digest = hashlib.sha256()
    for path in sorted(STATIC.iterdir()):
        if path.is_file():
            digest.update(path.name.encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()[:10]


def page(name, **replacements):
    """Legacy static template (only the local studio still uses it)."""
    v = asset_version()
    html = (TEMPLATES / name).read_text()
    html = html.replace("__HEAD__", (
        '<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n'
        '<meta name="color-scheme" content="light dark">\n'
        f'{THEME_BOOT}\n<link rel="stylesheet" href="assets/site.css?v={v}">'
    ))
    html = html.replace("__CORE__", f'<script src="assets/core.js?v={v}"></script>')
    html = html.replace("__FOOT__", FOOTER).replace("__V__", v)
    for key, value in replacements.items():
        html = html.replace(key, value)
    return html


def copy_assets():
    assets = SITE / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    wanted = {p.name for p in STATIC.iterdir() if p.is_file()}
    for stale in assets.iterdir():
        if stale.is_file() and stale.name not in wanted:
            stale.unlink()
    for name in sorted(wanted):
        shutil.copy2(STATIC / name, assets / name)


def publishable_slugs():
    return [s for s in content_slugs() if s not in FROZEN_DATES and parse_slug(s)[1] == "einfach"]


def build(slug=None):
    SITE.mkdir(parents=True, exist_ok=True)
    if slug:
        if parse_slug(slug)[1] != "einfach":
            raise SystemExit("20:00 edition is retired; only einfach is published")
        if slug in FROZEN_DATES:
            raise SystemExit(f"refusing to rebuild frozen page {slug}")
    docs = {}
    for s in sorted(publishable_slugs(), reverse=True):
        doc = json.loads(content_file(s).read_text())
        if (doc.get("source") or detect_source(doc.get("video_page") or "")) == "einfach":
            docs[doc_slug(doc, s)] = doc
    if slug and slug not in docs:
        raise SystemExit(f"no content for {slug}")
    targets = [slug] if slug else list(docs)
    for s in targets:
        lesson = lesson_payload(docs[s], s)
        html = app_page({"page": "lesson", "lesson": lesson, "items": []}, de_title(lesson["date"]),
                        " · ".join(st["title"] for st in lesson["stories"][:4]))
        (SITE / f"{s}.html").write_text(html)
        print(f"[ok] {s}.html ({len(lesson['sentences'])} 句)")
    items = [catalog_item(doc, s) for s, doc in docs.items()]
    for page_ in SITE.glob("*-20uhr.html"):
        page_.unlink()
    build_index(items)
    return targets


def build_index(items):
    desc = "tagesschau in Einfacher Sprache — Satz für Satz."
    (SITE / "index.html").write_text(app_page({"page": "home", "items": items}, "Archiv", desc))
    (SITE / "open.html").write_text(app_page({"page": "open", "items": items}, "Link", desc))
    (SITE / "about.html").write_text(app_page({"page": "about"}, "Info", desc))
    (SITE / "studio.html").write_text(page("studio.html"))
    copy_assets()
    print(f"[ok] index.html ({len(items)} 期) · open.html · about.html · studio.html · assets/")


if __name__ == "__main__":
    if "--dict" in sys.argv:
        update_dict_cache()
    else:
        build(sys.argv[1] if len(sys.argv) > 1 else None)
