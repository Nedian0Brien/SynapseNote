from __future__ import annotations

import sys
from pathlib import Path

import pytest

TESTS_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = TESTS_DIR.parent / "backend"


def _ensure_backend_in_path() -> bool:
    """backend/ 가 sys.path에 있고 FastAPI app 패키지를 임포트할 수 있으면 True."""
    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))
    try:
        import importlib
        importlib.import_module("app.db.connection")
        return True
    except ModuleNotFoundError:
        return False


@pytest.fixture(autouse=True)
def reset_db_connection():
    """각 테스트 전후로 thread-local DB 커넥션을 초기화해 테스트 간 격리를 보장.

    active runtime인 FastAPI backend를 import할 수 없는 환경에서는 조용히 건너뛴다.
    """
    if not _ensure_backend_in_path():
        yield
        return

    from app.db.connection import close_db
    close_db()
    yield
    close_db()


def run_vault_index() -> None:
    """현재 VAULT_ROOT를 기준으로 vault를 동기 인덱싱한다."""
    _ensure_backend_in_path()
    from app.indexer.vault_indexer import VaultIndexer
    VaultIndexer().full_rebuild()
