from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from app.services.node_service import list_nodes

router = APIRouter(prefix="/api")


@router.get("/nodes")
async def get_nodes(
    request: Request,
    q: str | None = Query(default=None),
    nodeType: str | None = Query(default=None),
) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    nodes = [node.to_dict() for node in list_nodes(query=q, node_type=nodeType)]
    return {
        "success": True,
        "data": nodes,
        "meta": {"total": len(nodes), "query": q or "", "nodeType": nodeType or ""},
    }
