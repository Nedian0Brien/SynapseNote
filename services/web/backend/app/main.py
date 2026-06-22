from __future__ import annotations

import asyncio
import logging
import os
import secrets
from datetime import datetime, timezone
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass

from fastapi import FastAPI
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.db.connection import get_db
from app.db.schema import init_schema
from app.indexer.vault_indexer import VaultIndexer
from app.indexer.vault_watcher import VaultWatcher
from app.routers.attachment_router import router as attachment_router
from app.routers.auth_router import create_auth_router
from app.routers.chat_router import create_chat_router
from app.routers.chunk_router import router as chunk_router
from app.routers.context_router import router as context_router
from app.routers.document_router import router as document_router
from app.routers.graph_router import router as graph_router
from app.routers.node_router import router as node_router
from app.routers.vault_events_router import router as vault_events_router
from app.services.capture_service import CaptureService
from app.services.chat_runtime import ChatRuntime
from app.services.chat_service import ChatService
from app.services.vault_paths import get_vault_root

logger = logging.getLogger(__name__)

APP_VERSION = "0.1.0"
SESSION_COOKIE = "synapsenote_session"


@dataclass
class AuthSettings:
    user_id: str
    password: str
    secret_key: str


def load_auth_settings() -> AuthSettings:
    return AuthSettings(
        user_id=os.environ.get("SYNAPSENOTE_USER_ID", "solo"),
        password=os.environ.get("SYNAPSENOTE_USER_PASSWORD", "solo"),
        secret_key=os.environ.get("SYNAPSENOTE_SESSION_SECRET", secrets.token_hex(32)),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── 시작 ──────────────────────────────────────────────────────────
    # 1. DB 스키마 초기화
    init_schema(get_db())

    # 2. watchdog 파일 감시 시작
    indexer = VaultIndexer()
    watcher = VaultWatcher(indexer)
    watcher.start()

    # 3. 전체 재인덱싱은 readiness를 막지 않도록 background에서 수행
    app.state.index_status.update({
        "ready": False,
        "running": True,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "completedAt": None,
        "error": None,
    })
    rebuild_task = asyncio.create_task(_run_index_rebuild(app, indexer))
    app.state.index_rebuild_task = rebuild_task

    try:
        yield
    finally:
        # ── 종료 ──────────────────────────────────────────────────────────
        watcher.stop()

        if not rebuild_task.done():
            rebuild_task.cancel()
            with suppress(asyncio.CancelledError):
                await rebuild_task


def create_app() -> FastAPI:
    settings = load_auth_settings()
    chat_service = ChatService()
    chat_runtime = ChatRuntime(chat_service=chat_service)
    capture_service = CaptureService(chat_service=chat_service)

    app = FastAPI(title="synapsenote-api", version=APP_VERSION, lifespan=lifespan)
    app.state.index_status = _initial_index_status()
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.secret_key,
        session_cookie=SESSION_COOKIE,
        same_site="lax",
        https_only=False,
        max_age=30 * 24 * 60 * 60,  # 30일
    )

    @app.get("/health")
    async def healthcheck() -> dict[str, object]:
        vault = _check_vault_health()
        return {
            "status": "ok",
            "service": "synapsenote-api",
            "version": APP_VERSION,
            "vault": vault,
            "index": _check_index_health(app),
        }

    app.include_router(create_auth_router(settings.user_id, settings.password))
    app.include_router(node_router)
    app.include_router(context_router)
    app.include_router(create_chat_router(chat_service, chat_runtime, capture_service))
    app.include_router(graph_router)
    app.include_router(document_router)
    app.include_router(attachment_router)
    app.include_router(chunk_router)
    app.include_router(vault_events_router)

    return app

def _initial_index_status() -> dict[str, object]:
    return {
        "ready": False,
        "running": False,
        "startedAt": None,
        "completedAt": None,
        "lastResult": None,
        "error": None,
    }


async def _run_index_rebuild(app: FastAPI, indexer: VaultIndexer) -> None:
    status = app.state.index_status

    try:
        result = await asyncio.to_thread(indexer.full_rebuild)
        status.update({
            "ready": True,
            "running": False,
            "completedAt": datetime.now(timezone.utc).isoformat(),
            "lastResult": result,
            "error": None,
        })
        logger.info("[indexer] full_rebuild completed: %d nodes, %d edges", result["nodes"], result["edges"])
    except asyncio.CancelledError:
        status.update({
            "running": False,
            "completedAt": datetime.now(timezone.utc).isoformat(),
            "error": "cancelled",
        })
        raise
    except Exception as exc:
        status.update({
            "ready": False,
            "running": False,
            "completedAt": datetime.now(timezone.utc).isoformat(),
            "error": str(exc),
        })
        logger.error("[indexer] full_rebuild failed: %s", exc, exc_info=True)


def _check_index_health(app: FastAPI) -> dict[str, object]:
    status = getattr(app.state, "index_status", _initial_index_status())
    return {
        "ready": bool(status.get("ready")),
        "running": bool(status.get("running")),
        "startedAt": status.get("startedAt"),
        "completedAt": status.get("completedAt"),
        "lastResult": status.get("lastResult"),
        "error": status.get("error"),
    }


def _check_vault_health() -> dict[str, object]:
    vault_root = get_vault_root()
    probe_path = vault_root / ".synapsenote" / "healthcheck.tmp"
    try:
        probe_path.parent.mkdir(parents=True, exist_ok=True)
        payload = datetime.now(timezone.utc).isoformat()
        probe_path.write_text(payload, encoding="utf-8")
        readable = probe_path.read_text(encoding="utf-8") == payload
        probe_path.unlink(missing_ok=True)
        return {
            "path": str(vault_root),
            "readable": readable,
            "writable": True,
        }
    except Exception as exc:
        return {
            "path": str(vault_root),
            "readable": False,
            "writable": False,
            "error": str(exc),
        }


app = create_app()
