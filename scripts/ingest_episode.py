#!/usr/bin/env python3
"""Parse a tagesschau Einfacher Sprache episode page and ingest subtitle.

Canonical episode date = Europe/Berlin calendar day of the media file
(TV-YYYYMMDD / audio/YYYY/MMDD). broadcastedOnDateTime is UTC and is only
used as a fallback after converting to Berlin.

SKIP (exit 3) only when this date already has the SAME identity
(episode_id + video_id + subtitle_url) AND the remote XML bytes match
the stored file AND the transcript still matches the lead synopsis.
File existence is not enough.

Exit 1 if the page still hangs a subtitle that already belongs to another date
(the 2026-08-18 stale-subtitle pitfall).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

BERLIN = ZoneInfo("Europe/Berlin")
STOP = {
    "wetter", "nachrichten", "tagesschau", "sprache", "einfacher",
    "das", "der", "die", "und", "für", "von", "mit", "aus", "den", "dem",
    "eine", "einen", "einer", "neue", "neuen", "mehr", "gegen",
}

TTML_P = "{http://www.w3.org/ns/ttml}p"
TTML_BR = "{http://www.w3.org/ns/ttml}br"


def unescape(html: str) -> str:
    return (
        html.replace("&quot;", '"')
        .replace("&#x3D;", "=")
        .replace("&amp;", "&")
    )


def parse_broadcasted_at(html: str) -> datetime | None:
    """Parse CMS broadcastedOnDateTime. Value is UTC (+0000), often a 17:00Z placeholder."""
    text = unescape(html)
    m = re.search(
        r"broadcastedOnDateTime"
        r"""["']?\s*[:=]\s*["']?"""
        r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)"
        r"([+-]\d{2}:?\d{2}|Z)?",
        text,
    )
    if not m:
        return None
    raw_dt = m.group(1)
    off = m.group(2) or "+00:00"
    if off == "Z":
        off = "+00:00"
    off = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", off)
    try:
        dt = datetime.fromisoformat(raw_dt + off)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def media_date(html: str) -> str:
    m = re.search(r"TV-(\d{4})(\d{2})(\d{2})-", html)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.search(r"/audio/(\d{4})/(\d{2})(\d{2})/", html)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return ""


def canonical_date(html: str) -> tuple[str, str, str]:
    """Return (date, media_date, broadcasted_at_iso_berlin)."""
    md = media_date(html)
    dt = parse_broadcasted_at(html)
    berlin_iso = ""
    berlin_date = ""
    if dt:
        local = dt.astimezone(BERLIN)
        berlin_iso = local.isoformat()
        berlin_date = local.date().isoformat()
    date = md or berlin_date
    return date, md, berlin_iso


def first(html: str, pat: str) -> str:
    m = re.search(pat, html)
    return m.group(1) if m else ""


def parse_fields(html: str, episode_url: str) -> dict:
    date, md, berlin_iso = canonical_date(html)
    text = unescape(html)
    episode_id = first(episode_url, r"(tse-\d+)") or first(html, r"(tse-\d+)\.html")
    video_id = first(html, r"(video-\d+)\.html")
    subtitle_id = first(html, r"(untertitel-\d+)\.xml")
    video_page = ""
    if video_id:
        video_page = (
            "https://www.tagesschau.de/tagesschau_in_einfacher_sprache/"
            f"{video_id}.html"
        )
    m3u8 = first(html, r"(https://adaptive\.tagesschau\.de/[^\"']*master\.m3u8)")
    m3u8 = m3u8.split("&")[0]
    mp3 = first(html, r"(https://tagesschau-podcast\.ard-mcdn\.de/audio/[^\"']+\.mp3)")
    mp3 = mp3.split("?")[0].split("&")[0]
    synopsis = first(text, r'"synopsis"\s*:\s*"([^"]*)"') or first(
        html, r"synopsis&quot;:&quot;([^&]*)"
    )
    subtitle_url = ""
    if subtitle_id:
        subtitle_url = (
            "https://www.tagesschau.de/tagesschau_in_einfacher_sprache/"
            f"{subtitle_id}.xml"
        )
    dt = parse_broadcasted_at(html)
    return {
        "date": date,
        "timezone": "Europe/Berlin",
        "broadcasted_at": berlin_iso,
        "broadcasted_at_utc": dt.astimezone(timezone.utc).isoformat() if dt else "",
        "media_date": md,
        "episode_id": episode_id,
        "episode_url": episode_url,
        "video_id": video_id,
        "video_page": video_page,
        "m3u8": m3u8,
        "mp3": mp3,
        "synopsis": synopsis,
        "subtitle_id": subtitle_id,
        "subtitle_url": subtitle_url,
        "subtitle_source": "official_ebu_tt",
    }


def load_metas(meta_dir: Path) -> dict[str, dict]:
    out = {}
    if not meta_dir.exists():
        return out
    for p in meta_dir.glob("*.json"):
        try:
            doc = json.loads(p.read_text())
        except Exception:
            continue
        out[p.stem] = doc
    return out


def id_from(text: str, pat: str) -> str:
    m = re.search(pat, text or "")
    return m.group(1) if m else ""


def identity_of(doc: dict) -> tuple[str, str, str]:
    episode = doc.get("episode_id") or id_from(doc.get("episode_url") or "", r"(tse-\d+)")
    video = doc.get("video_id") or id_from(doc.get("video_page") or "", r"(video-\d+)")
    sub = doc.get("subtitle_url") or ""
    return (episode, video, sub)


def subtitle_owner(metas: dict[str, dict], subtitle_url: str, except_date: str = "") -> str:
    """Earliest other date that already stored this subtitle URL."""
    if not subtitle_url:
        return ""
    for date in sorted(metas):
        if date == except_date:
            continue
        if (metas[date].get("subtitle_url") or "") == subtitle_url:
            return date
    return ""


def ebu_to_cues(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)

    def to_seconds(ts: str) -> float:
        m = re.match(r"(\d+):(\d+):(\d+)\.(\d+)", ts or "")
        if not m:
            return 0.0
        return round(
            int(m.group(1)) * 3600
            + int(m.group(2)) * 60
            + int(m.group(3))
            + int(m.group(4)) / 1000,
            2,
        )

    cues = []
    for p in root.iter(TTML_P):
        parts = []
        if p.text:
            parts.append(p.text)
        for elem in list(p):
            if elem.tag == TTML_BR:
                parts.append("\n")
            elif elem.text:
                parts.append(elem.text)
            if elem.tail:
                parts.append(elem.tail)
        text = "".join(parts).strip()
        if not text:
            continue
        cues.append(
            {
                "start": to_seconds(p.get("begin", "")),
                "end": to_seconds(p.get("end", "")),
                "text": text,
            }
        )
    return cues


def first_topic_tokens(synopsis: str) -> list[str]:
    first = (synopsis or "").split(",")[0]
    words = re.findall(r"[A-Za-zÄÖÜäöüß]{4,}", first)
    return [w.lower() for w in words if w.lower() not in STOP]


def transcript_matches_synopsis(cues: list[dict], synopsis: str) -> bool:
    tokens = first_topic_tokens(synopsis)
    if not tokens:
        return True
    blob = " ".join((c.get("text") or "") for c in cues).lower()
    blob = blob.replace("ß", "ss")
    return any(tok.replace("ß", "ss") in blob for tok in tokens)


def fetch_bytes(url: str) -> bytes:
    proxy = (
        os.environ.get("https_proxy")
        or os.environ.get("HTTPS_PROXY")
        or os.environ.get("http_proxy")
        or os.environ.get("HTTP_PROXY")
        or "http://127.0.0.1:7890"
    )
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": proxy, "https": proxy})
    )
    req = urllib.request.Request(url, headers={"User-Agent": "deutsch-daily/1.0"})
    with opener.open(req, timeout=30) as resp:
        return resp.read()


def _maybe_enrich_meta(meta_path: Path, existing: dict, fields: dict) -> None:
    """Fill timezone / id fields on old metas without touching transcripts."""
    merged = dict(existing)
    changed = False
    for key in (
        "timezone",
        "broadcasted_at",
        "broadcasted_at_utc",
        "media_date",
        "episode_id",
        "video_id",
        "subtitle_id",
        "episode_url",
        "video_page",
        "m3u8",
        "mp3",
        "synopsis",
        "subtitle_url",
        "subtitle_source",
    ):
        val = fields.get(key)
        if val and merged.get(key) != val:
            merged[key] = val
            changed = True
    if not changed:
        return
    meta_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n")


def _skip(date: str, fields: dict, meta_path: Path, existing: dict) -> int:
    _maybe_enrich_meta(meta_path, existing, fields)
    print(
        f"SKIP: {date} identity unchanged ({fields['episode_id']} / {fields['subtitle_id']})",
        file=sys.stderr,
    )
    print(meta_path)
    return 3


def write_episode(fields: dict, xml_bytes: bytes, xml_path: Path, trans_path: Path, meta_path: Path) -> int:
    date = fields["date"]
    if not xml_bytes.strip():
        print("ERROR: subtitle download empty", file=sys.stderr)
        return 1
    cues = ebu_to_cues(xml_bytes)
    if len(cues) < 8:
        print(f"ERROR: subtitle parsed only {len(cues)} cues", file=sys.stderr)
        return 1
    if not transcript_matches_synopsis(cues, fields["synopsis"]):
        print(
            "ERROR: subtitle text does not contain the lead story from synopsis "
            f"({first_topic_tokens(fields['synopsis'])}); refusing to store as {date}",
            file=sys.stderr,
        )
        return 1
    print(f"  Date:      {date} (Europe/Berlin, media={fields['media_date'] or '—'})", file=sys.stderr)
    print(f"  Broadcast: {fields['broadcasted_at'] or '—'}", file=sys.stderr)
    print(f"  Episode:   {fields['episode_id']}  video {fields['video_id']}", file=sys.stderr)
    print(f"  Themen:    {fields['synopsis']}", file=sys.stderr)
    print(f"  Subtitle:  {fields['subtitle_url']}", file=sys.stderr)
    xml_path.write_bytes(xml_bytes)
    trans_path.write_text(json.dumps(cues, ensure_ascii=False, indent=2) + "\n")
    out = dict(fields)
    out["transcript_file"] = f"data/transcripts/{date}.json"
    meta_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    print(f"  Segments: {len(cues)}", file=sys.stderr)
    print("Done.", file=sys.stderr)
    print(meta_path)
    return 0


def ingest(html: str, episode_url: str, data: Path) -> int:
    fields = parse_fields(html, episode_url)
    date = fields["date"]
    if not date:
        print("ERROR: cannot derive episode date (no TV-YYYYMMDD, no broadcastedOnDateTime)", file=sys.stderr)
        return 1
    if not fields["subtitle_url"]:
        print("ERROR: no subtitle URL on episode page", file=sys.stderr)
        return 1
    if fields["media_date"] and fields["broadcasted_at"]:
        berlin_day = fields["broadcasted_at"][:10]
        if fields["media_date"] != berlin_day:
            print(
                f"WARN: media_date {fields['media_date']} != Berlin broadcast day {berlin_day}; using media_date",
                file=sys.stderr,
            )

    meta_dir = data / "meta"
    trans_dir = data / "transcripts"
    sub_dir = data / "subtitles"
    for d in (meta_dir, trans_dir, sub_dir):
        d.mkdir(parents=True, exist_ok=True)

    metas = load_metas(meta_dir)
    owner = subtitle_owner(metas, fields["subtitle_url"], except_date=date)
    if owner:
        print(
            f"ERROR: subtitle {fields['subtitle_id']} already stored as {owner}; "
            f"page date {date} is still hanging the previous episode's captions. Not writing.",
            file=sys.stderr,
        )
        return 1

    meta_path = meta_dir / f"{date}.json"
    trans_path = trans_dir / f"{date}.json"
    xml_path = sub_dir / f"{date}.xml"
    existing = metas.get(date)
    remote: bytes | None = None
    if existing and trans_path.exists() and trans_path.stat().st_size > 5:
        old_id = identity_of(existing)
        new_id = identity_of(fields)
        if old_id != new_id:
            print(
                f"WARN: {date} exists but identity changed {old_id} → {new_id}; re-ingesting",
                file=sys.stderr,
            )
        else:
            stored = xml_path.read_bytes() if xml_path.exists() else b""
            try:
                remote = fetch_bytes(fields["subtitle_url"])
            except Exception as exc:
                cues = json.loads(trans_path.read_text())
                if transcript_matches_synopsis(cues, fields["synopsis"]):
                    print(
                        f"WARN: could not re-check subtitle ({exc}); local transcript matches synopsis",
                        file=sys.stderr,
                    )
                    return _skip(date, fields, meta_path, existing)
                print(
                    f"ERROR: subtitle re-check failed ({exc}) and local transcript does not match synopsis",
                    file=sys.stderr,
                )
                return 1
            if stored and stored == remote:
                cues = json.loads(trans_path.read_text())
                if transcript_matches_synopsis(cues, fields["synopsis"]):
                    return _skip(date, fields, meta_path, existing)
                print(
                    "WARN: stored XML unchanged but transcript does not match synopsis; re-ingesting",
                    file=sys.stderr,
                )
            else:
                print(
                    f"WARN: {date} subtitle XML changed in place at {fields['subtitle_id']}; re-ingesting",
                    file=sys.stderr,
                )

    if remote is None:
        remote = fetch_bytes(fields["subtitle_url"])
    return write_episode(fields, remote, xml_path, trans_path, meta_path)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", required=True)
    ap.add_argument("--episode-url", required=True)
    ap.add_argument("--data", required=True)
    args = ap.parse_args()
    html = Path(args.html).read_text(encoding="utf-8", errors="replace")
    return ingest(html, args.episode_url, Path(args.data))


if __name__ == "__main__":
    raise SystemExit(main())
