from __future__ import annotations

from app.db.connection import get_db


def list_chunks(path: str | None = None) -> list[dict[str, object]]:
    db = get_db()
    if path:
        rows = db.execute(
            """
            SELECT id, path, heading, anchor, ordinal, content, content_hash, updated_at
            FROM chunks
            WHERE path = ?
            ORDER BY ordinal
            """,
            (path,),
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT id, path, heading, anchor, ordinal, content, content_hash, updated_at
            FROM chunks
            ORDER BY path, ordinal
            """
        ).fetchall()

    return [
        {
            "id": row["id"],
            "path": row["path"],
            "heading": row["heading"],
            "anchor": row["anchor"],
            "ordinal": row["ordinal"],
            "content": row["content"],
            "hash": row["content_hash"],
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]
