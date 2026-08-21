"""Deutsch Daily show sources. Filenames: YYYY-MM-DD (einfach) or YYYY-MM-DD-20uhr."""
from __future__ import annotations

import re

SLUG_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:-(.+))?$")

SOURCES = {
    "einfach": {
        "id": "einfach",
        "label": "T-64 · tagesschau in einfacher Sprache",
        "short": "einfacher Sprache",
        "list_url": "https://www.tagesschau.de/tagesschau_in_einfacher_sprache",
        "base": "https://www.tagesschau.de/tagesschau_in_einfacher_sprache/",
        "episode_re": r"(tse-\d+)",
        "episode_file_re": r"tse-[0-9]+\.html",
        "suffix": "",
        "end_markers": ("Das waren unsere Nachrichten",),
    },
    "20uhr": {
        "id": "20uhr",
        "label": "T-64 · tagesschau 20:00 Uhr",
        "short": "20:00 Uhr",
        "list_url": "https://www.tagesschau.de/tagesschau_20_uhr",
        "base": "https://www.tagesschau.de/tagesschau_20_uhr/",
        "episode_re": r"(ts-\d+)",
        "episode_file_re": r"ts-[0-9]+\.html",
        "suffix": "-20uhr",
        "end_markers": ("Das war die tagesschau", "Das war die Tagesschau"),
    },
}

ALIASES = {
    "einfach": "einfach",
    "einfache": "einfach",
    "tse": "einfach",
    "20uhr": "20uhr",
    "tagesschau": "20uhr",
    "ts": "20uhr",
    "20": "20uhr",
}


def resolve_source(name: str) -> str:
    key = (name or "").strip().lower()
    if key not in ALIASES:
        raise ValueError(f"unknown source {name!r}; use einfach or 20uhr")
    return ALIASES[key]


def detect_source(url: str, explicit: str = "") -> str:
    if explicit:
        return resolve_source(explicit)
    text = url or ""
    if "tagesschau_20_uhr" in text:
        return "20uhr"
    if "tagesschau_in_einfacher_sprache" in text:
        return "einfach"
    return "einfach"


def source_info(source: str) -> dict:
    return SOURCES[resolve_source(source)]


def slug_for(date: str, source: str) -> str:
    info = source_info(source)
    return f"{date}{info['suffix']}"


def parse_slug(stem: str) -> tuple[str, str]:
    """Return (date, source). Bare YYYY-MM-DD is einfach."""
    m = SLUG_RE.match(stem or "")
    if not m:
        return stem, "einfach"
    date, rest = m.group(1), m.group(2)
    if not rest:
        return date, "einfach"
    if rest in SOURCES:
        return date, rest
    return date, "einfach"
