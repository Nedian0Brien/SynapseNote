from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _iso_timestamp(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()


def build_document_event(
    *,
    action: str,
    path: str,
    old_path: str | None = None,
    hash_value: str | None = None,
    updated_at: str | None = None,
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "type": "document_changed",
        "action": action,
        "path": path,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if old_path is not None:
        event["oldPath"] = old_path
    if hash_value is not None:
        event["hash"] = hash_value
    if updated_at is not None:
        event["updatedAt"] = updated_at
    return event


def build_document_event_from_path(
    *,
    action: str,
    file_path: Path,
    vault_root: Path,
    old_path: Path | None = None,
) -> dict[str, Any]:
    relative_path = file_path.resolve().relative_to(vault_root.resolve()).as_posix()
    old_relative_path = None
    if old_path is not None:
        old_relative_path = old_path.resolve().relative_to(vault_root.resolve()).as_posix()

    hash_value = None
    updated_at = None
    if file_path.exists() and file_path.is_file():
        content = file_path.read_text(encoding="utf-8", errors="replace")
        hash_value = content_hash(content)
        updated_at = _iso_timestamp(file_path.stat().st_mtime)

    return build_document_event(
        action=action,
        path=relative_path,
        old_path=old_relative_path,
        hash_value=hash_value,
        updated_at=updated_at,
    )


class VaultEventBus:
    def __init__(self) -> None:
        self._subscribers: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue[dict[str, Any]]]] = set()

    def subscribe(self) -> tuple[asyncio.AbstractEventLoop, asyncio.Queue[dict[str, Any]]]:
        subscriber = (asyncio.get_running_loop(), asyncio.Queue(maxsize=100))
        self._subscribers.add(subscriber)
        return subscriber

    def unsubscribe(self, subscriber: tuple[asyncio.AbstractEventLoop, asyncio.Queue[dict[str, Any]]]) -> None:
        self._subscribers.discard(subscriber)

    def publish(self, event: dict[str, Any]) -> None:
        stale: list[tuple[asyncio.AbstractEventLoop, asyncio.Queue[dict[str, Any]]]] = []
        for loop, queue in list(self._subscribers):
            if loop.is_closed():
                stale.append((loop, queue))
                continue
            loop.call_soon_threadsafe(self._put_latest, queue, event)

        for subscriber in stale:
            self._subscribers.discard(subscriber)

    @staticmethod
    def _put_latest(queue: asyncio.Queue[dict[str, Any]], event: dict[str, Any]) -> None:
        try:
            queue.put_nowait(event)
            return
        except asyncio.QueueFull:
            pass

        try:
            queue.get_nowait()
        except asyncio.QueueEmpty:
            pass

        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("Vault event queue is full; dropping event")


def format_sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


vault_event_bus = VaultEventBus()
