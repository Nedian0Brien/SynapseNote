from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path

_local = threading.local()


def get_db_path() -> Path:
    vault_root = Path(os.environ.get("VAULT_ROOT", "/vault"))
    db_dir = vault_root / ".synapsenote"
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / "graph.db"


def get_db() -> sqlite3.Connection:
    """Return a thread-local SQLite connection in WAL mode."""
    if not hasattr(_local, "conn") or _local.conn is None:
        conn = sqlite3.connect(str(get_db_path()), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
        from app.db.schema import init_schema
        init_schema(conn)
    return _local.conn


def close_db() -> None:
    if hasattr(_local, "conn") and _local.conn is not None:
        _local.conn.close()
        _local.conn = None
