"""Regroup official subtitle cues into timed sentences (dependency-free, shared by updater and build)."""
from __future__ import annotations

import re

SKIP_RE = re.compile(r"^\*.*\*$|untertitel|copyright", re.I)
END_RE = re.compile(r"""[.!?:]["'»“”]?$""")


def cue_sentences(cues: list[dict]) -> list[dict]:
    """Merge consecutive cues until a sentence ends; drop gong/subtitle credits.

    Returns [{"de", "start", "end"}] with times rounded to 2 decimals.
    """
    out: list[dict] = []
    buf: list[str] = []
    start = end = None
    for row in cues or []:
        text = " ".join(str(row.get("text") or "").split())
        if not text or SKIP_RE.search(text):
            continue
        try:
            a = float(row["start"])
            b = float(row.get("end") if row.get("end") is not None else a)
        except (KeyError, TypeError, ValueError):
            continue
        if start is None:
            start = a
        buf.append(text)
        end = max(b, a)
        if END_RE.search(text):
            out.append({"de": " ".join(buf), "start": round(start, 2), "end": round(end, 2)})
            buf, start = [], None
    if buf:
        out.append({"de": " ".join(buf), "start": round(start, 2), "end": round(end, 2)})
    return out
