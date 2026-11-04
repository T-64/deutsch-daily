#!/usr/bin/env python3
"""Measure subtitle/audio offset per minute of a broadcast (speech activity vs subtitle activity).

Usage: python3 scripts/sync_probe.py YYYY-MM-DD [...]   (needs ffmpeg and network)
Offset > 0: the voice comes LATER than the subtitle, i.e. subtitles run early.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
from build import derive_mp4_url  # noqa: E402

FRAME = 0.05


def speech_frames(url: str) -> tuple[list[int], float]:
    err = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", url, "-vn", "-ac", "1", "-ar", "16000",
         "-af", "silencedetect=noise=-32dB:d=0.15", "-f", "null", "-"],
        capture_output=True, text=True, check=True).stderr
    dur = float(re.findall(r"time=(\d+):(\d+):([\d.]+)", err)[-1][2]) if False else None
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err)
    total = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
    n = int(total / FRAME) + 1
    speech = [1] * n
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else total
        for f in range(int(s / FRAME), min(n, int(e / FRAME))):
            speech[f] = 0
    return speech, total


def subtitle_frames(cues: list[dict], n: int) -> list[int]:
    on = [0] * n
    for c in cues:
        text = " ".join(str(c.get("text") or "").split())
        if not text or re.search(r"^\*.*\*$|untertitel|copyright", text, re.I):
            continue
        for f in range(int(float(c["start"]) / FRAME), min(n, int(float(c["end"]) / FRAME))):
            on[f] = 1
    return on


def best_offset(speech, subs, lo, hi):
    best = (-1.0, 0.0)
    for k in range(-60, 61):  # ±3 s
        agree = 0
        for f in range(lo, hi):
            g = f + k
            if 0 <= g < len(speech):
                agree += speech[g] == subs[f]
        best = max(best, (agree / max(1, hi - lo), k * FRAME))
    return best


def probe(day: str) -> None:
    meta = json.loads((ROOT / f"data/meta/{day}.json").read_text())
    cues = json.loads((ROOT / f"data/transcripts/{day}.json").read_text())
    url = derive_mp4_url(meta)
    speech, total = speech_frames(url)
    subs = subtitle_frames(cues, len(speech))
    last_cue = max(float(c["end"]) for c in cues)
    print(f"{day}: video {total:.1f}s, last subtitle ends {last_cue:.1f}s ({url.rsplit('/', 1)[-1]})")
    win = int(60 / FRAME)
    row = []
    for lo in range(0, len(speech), win):
        hi = min(len(speech), lo + win)
        score, off = best_offset(speech, subs, lo, hi)
        row.append(f"{int(lo * FRAME // 60):02d}′ {off:+.2f}s ({score:.0%})")
    print("   " + " · ".join(row))


for d in sys.argv[1:]:
    probe(d)
