#!/usr/bin/env python3
"""Deutsch Daily 渲染器

data/content/YYYY-MM-DD.json + templates/ → docs/YYYY-MM-DD.html (+index.html)

词义来源:
  1. content.json 的 vocab（lemma/forms）
  2. data/dict-cache.json — 本地德汉词典（Wikdict + kaikii 中文维基德语）
  3. 查不到 → 前端可自填

用法:
  python3 build.py               # 渲染全部 content → docs/
  python3 build.py 2026-08-13    # 渲染单期
  python3 build.py --dict        # 用本地词典重填 dict-cache（离线，无限流）
"""
import json
import re
import sqlite3
import sys
from difflib import SequenceMatcher
from pathlib import Path

BASE = Path(__file__).parent
DATA = BASE / "data"
CONTENT = DATA / "content"
META = DATA / "meta"
TRANSCRIPTS = DATA / "transcripts"
CACHE = DATA / "dict-cache.json"
DICT_DB = DATA / "dict" / "de-zh.sqlite"
TEMPLATES = BASE / "templates"
SITE = BASE / "docs"
FROZEN_DATES = frozenset({"2026-07-31", "2026-08-03", "2026-08-11"})

TOKEN_RE = re.compile(r"[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]*")
SENT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ])")
SKIP_CUE = re.compile(r"(gong|untertitel|norddeutscher rundfunk|willkommen zur tagesschau|"
                      r"ich bin |das waren unsere nachrichten)", re.I)


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


def content_file(date):
    modern = CONTENT / f"{date}.json"
    if modern.exists():
        return modern
    return CONTENT / f"content-{date}.json"


def content_dates():
    dates = []
    for p in CONTENT.glob("*.json"):
        stem = p.stem
        if stem.startswith("content-"):
            stem = stem[len("content-"):]
        dates.append(stem)
    return sorted(dates)


def load_transcript(date):
    data = load_json(TRANSCRIPTS / f"{date}.json")
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


def word_gloss_map(doc, cache):
    gloss = {}
    form_to_key = {}
    phrases = []
    for n in doc["news"]:
        for v in editorial_vocab(n):
            gloss[v["key"]] = {
                "word": v["lemma"],
                "zh": v["zh"],
                "pos": v["pos"],
                "example": v["example_de"],
                "source": "editorial",
            }
            for form in v["forms"]:
                form_to_key[form.lower()] = v["key"]
                if " " in form.strip() and not any(ch in form for ch in ",(+"):
                    phrases.append(form.strip())
    for n in doc["news"]:
        for p in n.get("paragraphs") or []:
            for t in TOKEN_RE.findall(p):
                key = t.lower()
                if key in form_to_key:
                    continue
                if key in cache and cache[key].get("zh"):
                    gloss[key] = {
                        "word": cache[key].get("word") or t,
                        "zh": cache[key]["zh"],
                        "pos": cache[key].get("pos") or "",
                        "example": "",
                        "source": "dict",
                    }
                    form_to_key[key] = key
    phrases = sorted(set(phrases), key=lambda s: (-len(s), s.lower()))
    return gloss, form_to_key, phrases


def render(doc):
    date = doc["date"]
    if any(len(n.get("paragraphs") or []) != len(n.get("translations") or []) for n in doc["news"]):
        raise SystemExit(f"{date}: paragraphs 与 translations 数量不一致")
    meta = load_json(META / f"{date}.json")
    cues = load_transcript(date)
    gloss, form_to_key, phrases = word_gloss_map(doc, load_cache())
    news_html = []
    cursor = 0
    for n in doc["news"]:
        paras = n.get("paragraphs") or []
        trans = n.get("translations") or []
        times, cursor = align_paragraphs(paras, cues, cursor)
        news_html.append({
            "title": n["title"],
            "paras": [
                {"de": de, "zh": zh, "start": start, "end": end}
                for (de, zh), (start, end) in zip(zip(paras, trans), times)
            ],
            "vocab": editorial_vocab(n),
            "grammar_points": [
                {
                    "title": g.get("title") or "Grammatik",
                    "summary": g.get("summary") or "",
                    "example_de": g.get("example_de") or "",
                    "example_zh": g.get("example_zh") or "",
                }
                for g in (n.get("grammar_points") or [])[:2]
            ],
            "background": n.get("background") or "",
        })
    duration = None
    if cues:
        duration = cues[-1]["end"]
    payload = {
        "date": date,
        "video_page": doc.get("video_page") or (meta or {}).get("video_page") or "",
        "embed_url": doc.get("embed_url") or "",
        "mp4_url": derive_mp4_url(meta),
        "duration": duration,
        "news": news_html,
        "gloss": gloss,
        "form_to_key": form_to_key,
        "phrases": phrases,
    }
    tpl = (TEMPLATES / "episode.html").read_text()
    return (
        tpl.replace("__DATE__", doc["date"])
        .replace("__PAYLOAD__", json.dumps(payload, ensure_ascii=False).replace("</", "<\\/"))
    )


def build(date=None, push=False):
    SITE.mkdir(parents=True, exist_ok=True)
    if date:
        if date in FROZEN_DATES:
            raise SystemExit(f"refusing to rebuild frozen page {date}")
        dates = [date]
    else:
        dates = [d for d in content_dates() if d not in FROZEN_DATES]
    for d in dates:
        doc = json.loads(content_file(d).read_text())
        html = render(doc)
        (SITE / f"{d}.html").write_text(html)
        print(f"[ok] {d}.html ({len(html)} bytes)")
    build_index()
    return dates


def build_index(all_dates=None):
    dates = sorted(all_dates or content_dates(), reverse=True)
    items = []
    for d in dates:
        try:
            doc = json.loads(content_file(d).read_text())
            titles = " · ".join(n["title"] for n in doc["news"][:3])
            items.append({"date": d, "titles": titles, "count": len(doc["news"])})
        except FileNotFoundError:
            pass
    tpl = (TEMPLATES / "index.html").read_text()
    html = tpl.replace("__ITEMS__", json.dumps(items, ensure_ascii=False).replace("</", "<\\/"))
    (SITE / "index.html").write_text(html)
    print(f"[ok] index.html ({len(items)} 期)")


if __name__ == "__main__":
    if "--dict" in sys.argv:
        update_dict_cache()
    else:
        build(sys.argv[1] if len(sys.argv) > 1 else None)
