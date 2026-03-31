"""Parse YAML frontmatter from prompt.md."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

PROMPT_PATH = Path(__file__).parent / "prompt.md"

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def _parse_yaml_simple(text: str) -> dict[str, str]:
    """Minimal YAML parser for flat key: value pairs. No dependency on PyYAML."""
    result: dict[str, str] = {}
    for line in text.strip().splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            result[key.strip()] = value.strip()
    return result


def load_prompt() -> tuple[dict[str, Any], str]:
    """Return (frontmatter_dict, prompt_body) from prompt.md.

    If no frontmatter, returns ({}, full_text).
    """
    raw = PROMPT_PATH.read_text()
    match = _FRONTMATTER_RE.match(raw)
    if not match:
        return {}, raw
    meta = _parse_yaml_simple(match.group(1))
    body = raw[match.end():]
    return meta, body


def get_app_config() -> dict[str, Any]:
    """Return app config from prompt frontmatter, with defaults."""
    meta, _ = load_prompt()
    return {
        "title": meta.get("title", "App"),
        **({"subtitle": meta["subtitle"]} if "subtitle" in meta else {}),
    }
