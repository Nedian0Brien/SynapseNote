from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.schemas import DocumentCreatePayload, DocumentMovePayload, DocumentWritePayload
from app.services.document_service import (
    DocumentConflictError,
    create_document,
    delete_document,
    move_document,
    read_document,
    write_document,
)
from app.services.vault_events import build_document_event, vault_event_bus

router = APIRouter(prefix="/api")


@router.post("/documents", status_code=201)
async def post_document(
    payload: DocumentCreatePayload,
    request: Request,
) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        data = create_document(payload.path, payload.content)
    except FileExistsError:
        raise HTTPException(status_code=409, detail="document_already_exists")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    vault_event_bus.publish(build_document_event(
        action="created",
        path=data["id"],
        hash_value=data.get("hash"),
        updated_at=data.get("updatedAt"),
    ))
    return {"success": True, "data": data, "meta": {}}


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


@router.delete("/documents/{node_id:path}")
async def delete_document_endpoint(
    node_id: str,
    request: Request,
) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        data = delete_document(node_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="document_not_found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    vault_event_bus.publish(build_document_event(action="deleted", path=data["id"]))
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
        data = write_document(node_id, payload.content, payload.baseHash)
    except DocumentConflictError:
        raise HTTPException(status_code=409, detail="document_revision_conflict")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    vault_event_bus.publish(build_document_event(
        action="modified",
        path=data["id"],
        hash_value=data.get("hash"),
        updated_at=data.get("updatedAt"),
    ))
    return {"success": True, "data": data, "meta": {}}


@router.post("/documents/{node_id:path}/move")
async def move_document_endpoint(
    node_id: str,
    payload: DocumentMovePayload,
    request: Request,
) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        data = move_document(node_id, payload.new_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="document_not_found")
    except FileExistsError:
        raise HTTPException(status_code=409, detail="destination_already_exists")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    vault_event_bus.publish(build_document_event(
        action="moved",
        path=data["id"],
        old_path=node_id,
        hash_value=data.get("hash"),
        updated_at=data.get("updatedAt"),
    ))
    return {"success": True, "data": data, "meta": {}}
