#!/usr/bin/env python3
"""Measure how far subtitle sentence starts are from the speech onsets in the broadcast audio.

Usage: python3 scripts/sync_probe.py YYYY-MM-DD [...]   (needs ffmpeg and network)
Positive offset = speech starts AFTER the subtitle, i.e. the subtitles run early.
"""
import json
import re
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build import derive_mp4_url  # noqa: E402


def speech_onsets(url: str) -> list[float]:
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", url, "-vn", "-ac", "1", "-ar", "16000",
         "-af", "silencedetect=noise=-32dB:d=0.18", "-f", "null", "-"],
        capture_output=True, text=True, check=True).stderr
    return [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]


def probe(day: str) -> None:
    doc = json.loads((ROOT / f"data/content/{day}.json").read_text())
    meta = json.loads((ROOT / f"data/meta/{day}.json").read_text())
    url = derive_mp4_url(meta)
    starts = [s["start"] for s in doc.get("sentences", []) if s.get("start") is not None]
    if not starts:
        print(f"{day}: no timed sentences ({doc.get('content_kind')})")
        return
    onsets = speech_onsets(url)
    diffs = []
    for s in starts:
        near = [o - s for o in onsets if -2.0 <= o - s <= 2.0]
        if near:
            diffs.append(min(near, key=abs))
    if not diffs:
        print(f"{day}: no matches ({len(onsets)} onsets)")
        return
    q = statistics.quantiles(diffs, n=4)
    print(f"{day}: {len(diffs)}/{len(starts)} sentences matched · median {statistics.median(diffs):+.2f}s · "
          f"IQR {q[0]:+.2f}…{q[2]:+.2f}s · video {url.rsplit('/', 1)[-1]}")


for d in sys.argv[1:]:
    probe(d)
