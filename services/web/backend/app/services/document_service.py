"""Document read/write service for vault markdown files."""
from __future__ import annotations

import re
import shutil
from datetime import datetime

from .vault_paths import resolve_vault_path

TITLE_PATTERN = re.compile(r"^#\s+(.+)$", re.MULTILINE)


def _document_path(node_id: str):
    return resolve_vault_path(node_id, require_markdown=True)


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
    file_path = _document_path(node_id)

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
    file_path = _document_path(node_id)

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


def create_document(path: str, content: str = "") -> dict[str, str]:
    """Create a new markdown document inside the vault."""
    file_path = _document_path(path)

    if file_path.exists():
        raise FileExistsError(f"document already exists: {path}")

    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")

    stem = file_path.stem
    title = _extract_title(content, stem)
    updated_at = datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()

    return {
        "id": path,
        "title": title,
        "updatedAt": updated_at,
    }


def delete_document(node_id: str) -> dict[str, str]:
    """Delete a markdown document from the vault."""
    file_path = _document_path(node_id)

    if not file_path.exists():
        raise FileNotFoundError(f"document not found: {node_id}")

    if file_path.is_dir():
        raise ValueError(f"not a file: {node_id}")

    file_path.unlink()
    return {"id": node_id}


def move_document(node_id: str, new_path: str) -> dict[str, str]:
    """Move or rename a markdown document inside the vault."""
    src_path = _document_path(node_id)
    dst_path = _document_path(new_path)

    if not src_path.exists():
        raise FileNotFoundError(f"document not found: {node_id}")
    if src_path.is_dir():
        raise ValueError(f"not a file: {node_id}")
    if dst_path.exists():
        raise FileExistsError(f"destination already exists: {new_path}")

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src_path), str(dst_path))

    content = dst_path.read_text(encoding="utf-8", errors="replace")
    stem = dst_path.stem
    title = _extract_title(content, stem)
    updated_at = datetime.fromtimestamp(dst_path.stat().st_mtime).isoformat()

    return {
        "id": new_path,
        "title": title,
        "updatedAt": updated_at,
    }
