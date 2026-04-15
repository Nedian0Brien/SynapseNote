"""Document read/write service for vault markdown files."""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from .node_service import get_vault_root

TITLE_PATTERN = re.compile(r"^#\s+(.+)$", re.MULTILINE)


def _validate_path(node_id: str) -> None:
    """Validate node_id to prevent path traversal and enforce .md extension."""
    if ".." in node_id.split("/"):
        raise ValueError("path traversal not allowed")
    if not node_id.lower().endswith(".md"):
        raise ValueError("only markdown (.md) files are supported")


def _extract_title(content: str, fallback_stem: str) -> str:
    """Extract first heading or fall back to filename stem."""
    match = TITLE_PATTERN.search(content)
    if match:
        return match.group(1).strip()
    return fallback_stem.replace("-", " ").strip() or fallback_stem


def read_document(node_id: str) -> dict[str, str]:
    """Read a markdown document from the vault.

    Returns dict with id, title, content, updatedAt.
    Raises FileNotFoundError if the file doesn't exist.
    Raises ValueError if node_id is a directory or invalid.
    """
    _validate_path(node_id)
    vault_root = get_vault_root()
    file_path = (vault_root / node_id).resolve()

    # Ensure resolved path is within vault
    if not str(file_path).startswith(str(vault_root)):
        raise ValueError("path traversal not allowed")

    if not file_path.exists():
        raise FileNotFoundError(f"document not found: {node_id}")

    if file_path.is_dir():
        raise ValueError(f"not a file: {node_id}")

    content = file_path.read_text(encoding="utf-8", errors="replace")
    stem = file_path.stem
    title = _extract_title(content, stem)
    updated_at = datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()

    return {
        "id": node_id,
        "title": title,
        "content": content,
        "updatedAt": updated_at,
    }


def write_document(node_id: str, content: str) -> dict[str, str]:
    """Write content to a markdown document in the vault.

    Creates parent directories if needed.
    Returns dict with id, title, updatedAt.
    Raises ValueError for invalid paths.
    """
    _validate_path(node_id)
    vault_root = get_vault_root()
    file_path = (vault_root / node_id).resolve()

    # Ensure resolved path is within vault
    if not str(file_path).startswith(str(vault_root)):
        raise ValueError("path traversal not allowed")

    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")
    stem = file_path.stem
    title = _extract_title(content, stem)
    updated_at = datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()

    return {
        "id": node_id,
        "title": title,
        "updatedAt": updated_at,
    }
