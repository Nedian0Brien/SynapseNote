from __future__ import annotations

from fastapi import HTTPException

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


def remove_context_item(session: dict, node_id: str) -> list[dict[str, object]]:
    current_items = [item for item in list_context_items(session) if item["id"] != node_id]
    session[SESSION_KEY] = current_items
    return current_items
