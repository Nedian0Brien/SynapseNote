from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.schemas import ContextAddPayload
from app.services.context_service import (
    add_context_items,
    list_context_items,
    remove_context_item,
)

router = APIRouter(prefix="/api")


@router.get("/context")
async def get_context(request: Request) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    items = list_context_items(request.session)
    return {"success": True, "data": items, "meta": {"total": len(items)}}


@router.post("/context")
async def add_context(payload: ContextAddPayload, request: Request) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    items = add_context_items(request.session, payload.nodeIds)
    return {"success": True, "data": items, "meta": {"total": len(items)}}


@router.delete("/context/{node_id:path}")
async def delete_context(node_id: str, request: Request) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    items = remove_context_item(request.session, node_id)
    return {"success": True, "data": items, "meta": {"total": len(items)}}
