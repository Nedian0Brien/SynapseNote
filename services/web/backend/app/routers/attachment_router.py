from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.schemas import AttachmentWritePayload
from app.services.attachment_service import (
    delete_attachment,
    list_attachments,
    read_attachment,
    write_attachment,
)
from app.services.vault_events import build_document_event, vault_event_bus

router = APIRouter(prefix="/api")


def _require_user(request: Request) -> None:
    if not request.session.get("user_id"):
        raise HTTPException(status_code=401, detail="unauthorized")


@router.get("/attachments")
async def get_attachments(request: Request) -> dict[str, object]:
    _require_user(request)
    return {"success": True, "data": list_attachments(), "meta": {}}


@router.get("/attachments/{path:path}")
async def get_attachment(path: str, request: Request) -> dict[str, object]:
    _require_user(request)
    try:
        data = read_attachment(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="attachment_not_found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"success": True, "data": data, "meta": {}}


@router.post("/attachments", status_code=201)
async def put_attachment(payload: AttachmentWritePayload, request: Request) -> dict[str, object]:
    _require_user(request)
    try:
        data = write_attachment(payload.path, payload.contentBase64)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    vault_event_bus.publish(build_document_event(action="modified", path=str(data["path"])))
    return {"success": True, "data": data, "meta": {}}


@router.delete("/attachments/{path:path}")
async def remove_attachment(path: str, request: Request) -> dict[str, object]:
    _require_user(request)
    try:
        data = delete_attachment(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="attachment_not_found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    vault_event_bus.publish(build_document_event(action="deleted", path=path))
    return {"success": True, "data": data, "meta": {}}
