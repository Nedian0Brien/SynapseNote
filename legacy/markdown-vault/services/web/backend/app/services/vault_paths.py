from __future__ import annotations

import os
from pathlib import Path


def get_vault_root() -> Path:
    return Path(os.environ.get("VAULT_ROOT", "/vault")).resolve()


def resolve_vault_path(path: str, *, require_markdown: bool = False) -> Path:
    """Resolve a user-provided vault path and reject paths outside the vault."""
    raw_path = Path(path)
    if raw_path.is_absolute() or ".." in raw_path.parts:
        raise ValueError("path traversal not allowed")

    if require_markdown and raw_path.suffix.lower() != ".md":
        raise ValueError("only markdown (.md) files are supported")

    vault_root = get_vault_root()
    resolved = (vault_root / raw_path).resolve()
    try:
        resolved.relative_to(vault_root)
    except ValueError as exc:
        raise ValueError("path traversal not allowed") from exc

    return resolved
