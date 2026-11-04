#!/usr/bin/env python3
"""Measure how far a broadcast's audio is shifted against its official subtitles.

Some published videos are cut differently from the broadcast the subtitles were timed on
(2026-11-02: the voice comes 2.3 s after every subtitle). We compare where people speak
(ffmpeg silencedetect) with where subtitles are shown, minute by minute, and accept one
global offset only when most minutes agree on it.

Offset > 0 means the voice comes later than the subtitle, so subtitle times must be shifted
by +offset to match the video. Needs ffmpeg; returns None when it can't measure reliably.
"""
from __future__ import annotations

import re
import shutil
import statistics
import subprocess

FRAME = 0.05            # seconds per activity frame
SEARCH = 60             # ±3 s
WINDOW = int(60 / FRAME)
MIN_AGREEMENT = 0.7     # share of frames where speech and subtitle activity match
MAX_SPREAD = 0.3        # minutes must agree within this many seconds
SKIP = re.compile(r"^\*.*\*$|untertitel|copyright", re.I)


def subtitle_activity(cues: list[dict], n: int) -> list[int]:
    on = [0] * n
    for c in cues:
        text = " ".join(str(c.get("text") or "").split())
        if not text or SKIP.search(text):
            continue
        for f in range(max(0, int(float(c["start"]) / FRAME)), min(n, int(float(c["end"]) / FRAME))):
            on[f] = 1
    return on


def estimate_offset(speech: list[int], subs: list[int]) -> tuple[float, float] | None:
    """(offset_seconds, agreement) from per-minute best shifts, or None when minutes disagree."""
    found = []
    for lo in range(0, len(subs), WINDOW):
        hi = min(len(subs), lo + WINDOW)
        if sum(subs[lo:hi]) < WINDOW * 0.15:   # too little subtitled speech in this minute
            continue
        best = (-1.0, 0)
        for k in range(-SEARCH, SEARCH + 1):
            agree = sum(1 for f in range(lo, hi) if 0 <= f + k < len(speech) and speech[f + k] == subs[f])
            best = max(best, (agree / (hi - lo), k))
        if best[0] >= MIN_AGREEMENT:
            found.append(best)
    if len(found) < 2:
        return None
    shifts = [k * FRAME for _, k in found]
    if max(shifts) - min(shifts) > MAX_SPREAD:
        return None
    return round(statistics.median(shifts), 2), round(statistics.mean(a for a, _ in found), 2)


def speech_activity(media_url: str) -> list[int] | None:
    if not shutil.which("ffmpeg"):
        return None
    try:
        err = subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostats", "-i", media_url, "-vn", "-ac", "1", "-ar", "16000",
             "-af", "silencedetect=noise=-32dB:d=0.15", "-f", "null", "-"],
            capture_output=True, text=True, timeout=300, check=True).stderr
    except (subprocess.SubprocessError, OSError):
        return None
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err)
    if not m:
        return None
    total = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
    n = int(total / FRAME) + 1
    speech = [1] * n
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else total
        for f in range(max(0, int(s / FRAME)), min(n, int(e / FRAME))):
            speech[f] = 0
    return speech


def measure(media_url: str, cues: list[dict]) -> tuple[float, float] | None:
    speech = speech_activity(media_url)
    if speech is None:
        return None
    return estimate_offset(speech, subtitle_activity(cues, len(speech)))
