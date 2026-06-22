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
        _chunk_row_to_dict(row)
        for row in rows
    ]


def get_chunks_by_ids(chunk_ids: list[str]) -> list[dict[str, object]]:
    if not chunk_ids:
        return []
    db = get_db()
    placeholders = ",".join("?" * len(chunk_ids))
    rows = db.execute(
        f"""
        SELECT id, path, heading, anchor, ordinal, content, content_hash, updated_at
        FROM chunks
        WHERE id IN ({placeholders})
        ORDER BY path, ordinal
        """,
        chunk_ids,
    ).fetchall()
    return [_chunk_row_to_dict(row) for row in rows]


def _chunk_row_to_dict(row) -> dict[str, object]:
    return {
        "id": row["id"],
        "path": row["path"],
        "heading": row["heading"],
        "anchor": row["anchor"],
        "ordinal": row["ordinal"],
        "content": row["content"],
        "hash": row["content_hash"],
        "updatedAt": row["updated_at"],
    }
