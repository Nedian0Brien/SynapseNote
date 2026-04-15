from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.schemas import DocumentWritePayload
from app.services.document_service import read_document, write_document

router = APIRouter(prefix="/api")


@router.get("/documents/{node_id:path}")
async def get_document(node_id: str, request: Request) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        data = read_document(node_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="document_not_found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"success": True, "data": data, "meta": {}}


@router.put("/documents/{node_id:path}")
async def put_document(
    node_id: str,
    payload: DocumentWritePayload,
    request: Request,
) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        data = write_document(node_id, payload.content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"success": True, "data": data, "meta": {}}
