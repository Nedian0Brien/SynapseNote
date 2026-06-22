from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.services.vault_events import format_sse, vault_event_bus

router = APIRouter(prefix="/api")


@router.get("/vault/events")
async def stream_vault_events(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    async def event_stream():
        subscriber = vault_event_bus.subscribe()
        try:
            yield format_sse("vault", {"type": "connected"})
            while True:
                if await request.is_disconnected():
                    break

                try:
                    _loop, queue = subscriber
                    event = await asyncio.wait_for(queue.get(), timeout=25)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue

                yield format_sse("vault", event)
        finally:
            vault_event_bus.unsubscribe(subscriber)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
