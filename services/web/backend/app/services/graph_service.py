"""Graph service backed by SQLite.

Reads pre-computed nodes and edges from the database instead of
scanning the filesystem or computing similarity on the fly.
"""
from __future__ import annotations

from app.db.connection import get_db
from .node_service import KnowledgeNode, list_nodes


def build_graph(
    query: str | None = None,
    threshold: float = 0.5,
) -> dict[str, object]:
    """Build the full graph response with nodes, edges, and stats.

    ``threshold`` is accepted for API compatibility but no longer used for
    semantic edge computation (semantic edges are sourced from the DB).
    """
    db = get_db()

    nodes = list_nodes(query=query)
    node_dicts = [n.to_dict() for n in nodes]

    if query:
        queried_ids = {n.id for n in nodes}
        if queried_ids:
            placeholders = ",".join("?" * len(queried_ids))
            id_list = list(queried_ids)
            rows = db.execute(
                f"SELECT source, target, edge_type, weight FROM edges "
                f"WHERE source IN ({placeholders}) OR target IN ({placeholders})",
                id_list + id_list,
            ).fetchall()
        else:
            rows = []
    else:
        rows = db.execute(
            "SELECT source, target, edge_type, weight FROM edges"
        ).fetchall()

    edges: list[dict[str, object]] = [
        {
            "source": row["source"],
            "target": row["target"],
            "edge_type": row["edge_type"],
            "weight": row["weight"],
        }
        for row in rows
    ]

    # Stats
    connected_ids: set[str] = set()
    structural_count = 0

    for edge in edges:
        connected_ids.add(str(edge["source"]))
        connected_ids.add(str(edge["target"]))
        if edge["edge_type"] in ("directory", "wikilink"):
            structural_count += 1

    all_ids = {n.id for n in nodes}
    orphan_count = len(all_ids - connected_ids)

    stats: dict[str, int] = {
        "nodes": len(nodes),
        "edges": len(edges),
        "structural_edges": structural_count,
        "semantic_edges": 0,
        "orphan_nodes": orphan_count,
    }

    return {
        "nodes": node_dicts,
        "edges": edges,
        "stats": stats,
    }
