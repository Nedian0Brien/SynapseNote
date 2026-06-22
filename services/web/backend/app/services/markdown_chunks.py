from __future__ import annotations

import re
from pathlib import Path

from app.services.vault_events import content_hash

HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.+)$")
CALLOUT_MARKER_PATTERN = re.compile(r"^\s*>\s*\[![^\]]+\]\s*")


def build_markdown_chunks(path: str, body: str) -> list[dict[str, object]]:
    chunks: list[dict[str, object]] = []
    current_heading = Path(path).stem.replace("-", " ") or path
    current_anchor = _slugify(current_heading)
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_lines
        content = "\n".join(current_lines).strip()
        if not content:
            return
        ordinal = len(chunks)
        chunks.append({
            "id": f"{path}#chunk-{ordinal}",
            "path": path,
            "heading": current_heading,
            "anchor": current_anchor,
            "ordinal": ordinal,
            "content": content,
            "content_hash": content_hash(content),
        })
        current_lines = []

    for raw_line in body.splitlines():
        heading_match = HEADING_PATTERN.match(raw_line.strip())
        if heading_match:
            flush()
            current_heading = heading_match.group(2).strip()
            current_anchor = _slugify(current_heading)
            current_lines.append(raw_line.rstrip())
            continue
        current_lines.append(_normalize_callout_line(raw_line.rstrip()))

    flush()
    return chunks


def _normalize_callout_line(line: str) -> str:
    return CALLOUT_MARKER_PATTERN.sub("> ", line)


def _slugify(value: str) -> str:
    slug = re.sub(r"\s+", "-", value.strip().lower())
    slug = re.sub(r"[^0-9a-zA-Z가-힣_-]+", "", slug)
    return slug or "section"
