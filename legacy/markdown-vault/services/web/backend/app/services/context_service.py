from __future__ import annotations

from fastapi import HTTPException

from .chunk_service import get_chunks_by_ids
from .node_service import get_node


SESSION_KEY = "context_items"


def list_context_items(session: dict) -> list[dict[str, object]]:
    return list(session.get(SESSION_KEY, []))


def add_context_items(session: dict, node_ids: list[str]) -> list[dict[str, object]]:
    current_items = list_context_items(session)
    existing_ids = {item["id"] for item in current_items}

    for node_id in node_ids:
        if node_id in existing_ids:
            continue

        node = get_node(node_id)
        if node is None:
            raise HTTPException(status_code=404, detail=f"node_not_found:{node_id}")

        current_items.append(
            {
                "id": node.id,
                "title": node.title,
                "type": node.type,
                "summary": node.summary,
                "state": "included",
            }
        )
        existing_ids.add(node_id)

    session[SESSION_KEY] = current_items
    return current_items


def add_context_chunks(session: dict, chunk_ids: list[str]) -> list[dict[str, object]]:
    current_items = list_context_items(session)
    existing_ids = {item["id"] for item in current_items}
    chunks = get_chunks_by_ids(chunk_ids)
    found_ids = {str(chunk["id"]) for chunk in chunks}
    missing_ids = [chunk_id for chunk_id in chunk_ids if chunk_id not in found_ids]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"chunk_not_found:{missing_ids[0]}")

    for chunk in chunks:
        chunk_id = str(chunk["id"])
        if chunk_id in existing_ids:
            continue

        current_items.append(
            {
                "id": chunk_id,
                "title": chunk["heading"],
                "type": "Chunk",
                "summary": str(chunk["content"])[:180],
                "state": "included",
                "path": chunk["path"],
                "heading": chunk["heading"],
                "chunkId": chunk_id,
            }
        )
        existing_ids.add(chunk_id)

    session[SESSION_KEY] = current_items
    return current_items


def remove_context_item(session: dict, node_id: str) -> list[dict[str, object]]:
    current_items = [item for item in list_context_items(session) if item["id"] != node_id]
    session[SESSION_KEY] = current_items
    return current_items
