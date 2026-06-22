from __future__ import annotations

import base64
import mimetypes
import binascii
from datetime import datetime
from pathlib import Path

from .vault_paths import get_vault_root, resolve_vault_path

_IGNORED_DIRS = {".git", ".obsidian", ".synapsenote", "__pycache__", ".pytest_cache"}


def _attachment_path(path: str) -> Path:
    file_path = resolve_vault_path(path)
    if file_path.suffix.lower() == ".md":
        raise ValueError("markdown files are documents, not attachments")
    if ".synapsenote" in file_path.relative_to(get_vault_root()).parts:
        raise ValueError("internal synapsenote files are not attachments")
    return file_path


def _to_attachment(file_path: Path) -> dict[str, object]:
    vault_root = get_vault_root()
    stat = file_path.stat()
    rel_path = file_path.relative_to(vault_root).as_posix()
    mime_type, _encoding = mimetypes.guess_type(file_path.name)
    return {
        "path": rel_path,
        "name": file_path.name,
        "size": stat.st_size,
        "mimeType": mime_type or "application/octet-stream",
        "updatedAt": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


def list_attachments() -> list[dict[str, object]]:
    vault_root = get_vault_root()
    if not vault_root.exists():
        return []

    attachments: list[dict[str, object]] = []
    for file_path in sorted(vault_root.rglob("*")):
        if not file_path.is_file():
            continue
        rel_parts = file_path.relative_to(vault_root).parts
        if any(part in _IGNORED_DIRS for part in rel_parts):
            continue
        if file_path.suffix.lower() == ".md":
            continue
        attachments.append(_to_attachment(file_path))
    return attachments


def read_attachment(path: str) -> dict[str, object]:
    file_path = _attachment_path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"attachment not found: {path}")
    if file_path.is_dir():
        raise ValueError(f"not a file: {path}")

    data = _to_attachment(file_path)
    data["contentBase64"] = base64.b64encode(file_path.read_bytes()).decode("ascii")
    return data


def write_attachment(path: str, content_base64: str) -> dict[str, object]:
    file_path = _attachment_path(path)
    try:
        payload = base64.b64decode(content_base64.encode("ascii"), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("invalid base64 attachment content") from exc

    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(payload)
    return _to_attachment(file_path)


def delete_attachment(path: str) -> dict[str, object]:
    file_path = _attachment_path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"attachment not found: {path}")
    if file_path.is_dir():
        raise ValueError(f"not a file: {path}")

    file_path.unlink()
    return {"path": path}
