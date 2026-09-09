"""Load per-novel LC glossaries from CSV files."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Dict, Iterable, List


GLOSSARY_DIR = Path(__file__).resolve().parent / "glossaries"


def _rows_from_csv(path: Path) -> Iterable[dict]:
    with path.open(encoding="utf-8") as handle:
        filtered = (line for line in handle if line.strip() and not line.lstrip().startswith("#"))
        yield from csv.DictReader(filtered)


def load_glossary_csv(path: Path) -> Dict[str, Dict]:
    """Return original -> {translation, type, description} including aliases."""
    terms: Dict[str, Dict] = {}
    for row in _rows_from_csv(path):
        original = (row.get("original") or "").strip()
        thai = (row.get("thai") or "").strip()
        if not original or not thai:
            continue
        payload = {
            "translation": thai,
            "type": (row.get("type") or "general").strip(),
            "description": (row.get("notes") or "").strip(),
            "source": (row.get("source") or "").strip(),
            "confidence": (row.get("confidence") or "").strip(),
        }
        terms[original] = payload
        aliases = [part.strip() for part in (row.get("aliases") or "").split("|") if part.strip()]
        for alias in aliases:
            # Keep CJK aliases as extra lookup keys. Thai aliases are
            # reader variants, not source-text replacements.
            if any("\u4e00" <= ch <= "\u9fff" for ch in alias):
                terms.setdefault(alias, payload)
    return terms


def load_all_glossaries() -> Dict[str, Dict]:
    merged: Dict[str, Dict] = {}
    if not GLOSSARY_DIR.exists():
        return merged
    for path in sorted(GLOSSARY_DIR.glob("*.csv")):
        merged.update(load_glossary_csv(path))
    return merged


def terms_longest_first(terms: Dict[str, Dict]) -> List[tuple[str, Dict]]:
    return sorted(terms.items(), key=lambda item: len(item[0]), reverse=True)
