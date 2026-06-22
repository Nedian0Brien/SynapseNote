"""Document read/write service for vault markdown files."""
from __future__ import annotations

import os
import re
import shutil
import tempfile
from datetime import datetime, timezone

from .vault_paths import resolve_vault_path
from .vault_events import content_hash

TITLE_PATTERN = re.compile(r"^#\s+(.+)$", re.MULTILINE)


class DocumentConflictError(Exception):
    """Raised when a write is based on a stale document revision."""


def _document_path(node_id: str):
    return resolve_vault_path(node_id, require_markdown=True)


def _extract_title(content: str, fallback_stem: str) -> str:
    """Extract first heading or fall back to filename stem."""
    match = TITLE_PATTERN.search(content)
    if match:
        return match.group(1).strip()
    return fallback_stem.replace("-", " ").strip() or fallback_stem


def _updated_at(file_path) -> str:
    return datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()


def _atomic_write_text(file_path, content: str) -> None:
    tmp_name = None
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=file_path.parent,
        delete=False,
    ) as tmp_file:
        tmp_name = tmp_file.name
        tmp_file.write(content)
        tmp_file.flush()
        os.fsync(tmp_file.fileno())

    try:
        os.replace(tmp_name, file_path)
    except Exception:
        if tmp_name:
            try:
                os.unlink(tmp_name)
            except FileNotFoundError:
                pass
        raise


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
    updated_at = _updated_at(file_path)

    return {
        "id": node_id,
        "title": title,
        "content": content,
        "updatedAt": updated_at,
        "hash": content_hash(content),
    }


def write_document(node_id: str, content: str, base_hash: str | None = None) -> dict[str, str]:
    """Write content to a markdown document in the vault.

    Creates parent directories if needed.
    Returns dict with id, title, updatedAt.
    Raises ValueError for invalid paths.
    """
    file_path = _document_path(node_id)

    file_path.parent.mkdir(parents=True, exist_ok=True)
    if base_hash is not None:
        if not file_path.exists():
            raise DocumentConflictError(f"document revision conflict: {node_id}")
        current_content = file_path.read_text(encoding="utf-8", errors="replace")
        if content_hash(current_content) != base_hash:
            raise DocumentConflictError(f"document revision conflict: {node_id}")

    _atomic_write_text(file_path, content)
    stem = file_path.stem
    title = _extract_title(content, stem)
    updated_at = _updated_at(file_path)

    return {
        "id": node_id,
        "title": title,
        "updatedAt": updated_at,
        "hash": content_hash(content),
    }


def create_document(path: str, content: str = "") -> dict[str, str]:
    """Create a new markdown document inside the vault."""
    file_path = _document_path(path)

    if file_path.exists():
        raise FileExistsError(f"document already exists: {path}")

    file_path.parent.mkdir(parents=True, exist_ok=True)
    _atomic_write_text(file_path, content)

    stem = file_path.stem
    title = _extract_title(content, stem)
    updated_at = _updated_at(file_path)

    return {
        "id": path,
        "title": title,
        "updatedAt": updated_at,
        "hash": content_hash(content),
    }


def delete_document(node_id: str) -> dict[str, str]:
    """Move a markdown document to the vault trash."""
    file_path = _document_path(node_id)

    if not file_path.exists():
        raise FileNotFoundError(f"document not found: {node_id}")

    if file_path.is_dir():
        raise ValueError(f"not a file: {node_id}")

    trash_path = _trash_path(node_id)
    trash_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(file_path), str(trash_path))
    return {"id": node_id, "trashedPath": trash_path.relative_to(resolve_vault_path(".")).as_posix()}


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
    updated_at = _updated_at(dst_path)

    return {
        "id": new_path,
        "title": title,
        "updatedAt": updated_at,
        "hash": content_hash(content),
    }


def _trash_path(node_id: str):
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    safe_relative = node_id.strip("/")
    return resolve_vault_path(f".synapsenote/trash/{timestamp}/{safe_relative}")
