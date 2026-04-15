from __future__ import annotations

import sqlite3


def init_schema(conn: sqlite3.Connection) -> None:
    """Create tables and indexes if they don't exist."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS nodes (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            type        TEXT NOT NULL,
            summary     TEXT DEFAULT '',
            tags        TEXT DEFAULT '[]',
            updated_at  TEXT NOT NULL,
            x           REAL,
            y           REAL
        );

        CREATE TABLE IF NOT EXISTS edges (
            source      TEXT NOT NULL,
            target      TEXT NOT NULL,
            edge_type   TEXT NOT NULL,
            weight      REAL DEFAULT 1.0,
            PRIMARY KEY (source, target, edge_type)
        );

        CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
        CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
        CREATE INDEX IF NOT EXISTS idx_nodes_type   ON nodes(type);
    """)

    # 기존 DB에 x, y 컬럼 없으면 추가 (마이그레이션)
    existing = {row[1] for row in conn.execute("PRAGMA table_info(nodes)")}
    if "x" not in existing:
        conn.execute("ALTER TABLE nodes ADD COLUMN x REAL")
    if "y" not in existing:
        conn.execute("ALTER TABLE nodes ADD COLUMN y REAL")

    conn.commit()
