from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from app.services.graph_service import build_graph

router = APIRouter(prefix="/api")


@router.get("/graph")
async def get_graph(
    request: Request,
    q: str | None = Query(default=None),
    threshold: float = Query(default=0.5, ge=0.0, le=1.0),
) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    data = build_graph(query=q, threshold=threshold)
    return {"success": True, "data": data, "meta": {}}
