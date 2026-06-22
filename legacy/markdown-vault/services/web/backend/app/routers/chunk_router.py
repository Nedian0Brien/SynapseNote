from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from app.services.chunk_service import list_chunks

router = APIRouter(prefix="/api")


@router.get("/chunks")
async def get_chunks(
    request: Request,
    path: str | None = Query(default=None),
) -> dict[str, object]:
    if not request.session.get("user_id"):
        raise HTTPException(status_code=401, detail="unauthorized")

    chunks = list_chunks(path)
    return {"success": True, "data": chunks, "meta": {"total": len(chunks), "path": path or ""}}
