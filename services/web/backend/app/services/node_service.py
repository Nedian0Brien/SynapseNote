from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from app.db.connection import get_db


@dataclass
class KnowledgeNode:
    id: str
    title: str
    type: str
    summary: str
    updated_at: str
    tags: list[str]
    x: float | None = None
    y: float | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "title": self.title,
            "type": self.type,
            "summary": self.summary,
            "updatedAt": self.updated_at,
            "tags": self.tags,
            "x": self.x,
            "y": self.y,
        }


def get_vault_root() -> Path:
    return Path(os.environ.get("VAULT_ROOT", "/vault")).resolve()


def list_nodes(query: str | None = None, node_type: str | None = None) -> list[KnowledgeNode]:
    db = get_db()
    conditions: list[str] = []
    params: list[object] = []

    if query:
        like = f"%{query}%"
        conditions.append("(id LIKE ? OR title LIKE ? OR summary LIKE ?)")
        params.extend([like, like, like])

    if node_type:
        conditions.append("type = ?")
        params.append(node_type)

    sql = "SELECT id, title, type, summary, tags, updated_at, x, y FROM nodes"
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    rows = db.execute(sql, params).fetchall()

    items: list[KnowledgeNode] = []
    for row in rows:
        try:
            tags = json.loads(row["tags"]) if row["tags"] else []
        except (json.JSONDecodeError, TypeError):
            tags = []

        items.append(
            KnowledgeNode(
                id=row["id"],
                title=row["title"],
                type=row["type"],
                summary=row["summary"] or "",
                updated_at=row["updated_at"],
                tags=tags,
                x=row["x"],
                y=row["y"],
            )
        )

    return items


def get_node(node_id: str) -> KnowledgeNode | None:
    db = get_db()
    row = db.execute(
        "SELECT id, title, type, summary, tags, updated_at, x, y FROM nodes WHERE id = ?",
        (node_id,),
    ).fetchone()

    if row is None:
        return None

    try:
        tags = json.loads(row["tags"]) if row["tags"] else []
    except (json.JSONDecodeError, TypeError):
        tags = []

    return KnowledgeNode(
        id=row["id"],
        title=row["title"],
        type=row["type"],
        summary=row["summary"] or "",
        updated_at=row["updated_at"],
        tags=tags,
        x=row["x"],
        y=row["y"],
    )
