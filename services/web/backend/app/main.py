from __future__ import annotations

import asyncio
import logging
import os
import secrets
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.db.connection import get_db
from app.db.schema import init_schema
from app.indexer.vault_indexer import VaultIndexer
from app.indexer.vault_watcher import VaultWatcher
from app.routers.auth_router import create_auth_router
from app.routers.chat_router import create_chat_router
from app.routers.context_router import router as context_router
from app.routers.document_router import router as document_router
from app.routers.graph_router import router as graph_router
from app.routers.node_router import router as node_router
from app.services.capture_service import CaptureService
from app.services.chat_runtime import ChatRuntime
from app.services.chat_service import ChatService

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

    # 2. 전체 재인덱싱 (thread pool에서 실행해 이벤트 루프 블로킹 방지)
    indexer = VaultIndexer()
    try:
        result = await asyncio.to_thread(indexer.full_rebuild)
        logger.info("[indexer] full_rebuild completed: %d nodes, %d edges", result["nodes"], result["edges"])
    except Exception as exc:
        logger.error("[indexer] full_rebuild failed: %s", exc, exc_info=True)

    # 3. watchdog 파일 감시 시작
    watcher = VaultWatcher(indexer)
    watcher.start()

    yield

    # ── 종료 ──────────────────────────────────────────────────────────
    watcher.stop()


def create_app() -> FastAPI:
    settings = load_auth_settings()
    chat_service = ChatService()
    chat_runtime = ChatRuntime(chat_service=chat_service)
    capture_service = CaptureService(chat_service=chat_service)

    app = FastAPI(title="synapsenote-api", version=APP_VERSION, lifespan=lifespan)
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
    async def healthcheck() -> dict[str, str]:
        return {
            "status": "ok",
            "service": "synapsenote-api",
            "version": APP_VERSION,
        }

    app.include_router(create_auth_router(settings.user_id, settings.password))
    app.include_router(node_router)
    app.include_router(context_router)
    app.include_router(create_chat_router(chat_service, chat_runtime, capture_service))
    app.include_router(graph_router)
    app.include_router(document_router)

    return app


app = create_app()
