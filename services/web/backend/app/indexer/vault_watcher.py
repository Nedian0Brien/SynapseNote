from __future__ import annotations

import logging
import threading
import time
from pathlib import Path

from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer

from .vault_indexer import VaultIndexer

logger = logging.getLogger(__name__)

_IGNORED_DIR = ".synapsenote"


class VaultEventHandler(FileSystemEventHandler):
    """watchdog 이벤트를 VaultIndexer 증분 업데이트로 연결."""

    DEBOUNCE_MS = 300  # 동일 경로 중복 이벤트 무시 (ms)

    def __init__(self, indexer: VaultIndexer) -> None:
        super().__init__()
        self.indexer = indexer
        self._pending: dict[str, float] = {}  # path → last_event_time
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Debounce helper
    # ------------------------------------------------------------------

    def _debounced(self, path: str, fn) -> None:
        """300ms 내 중복 이벤트를 무시하고 실제 처리 함수를 호출."""
        now = time.monotonic()
        with self._lock:
            last = self._pending.get(path, 0.0)
            if now - last < self.DEBOUNCE_MS / 1000.0:
                return
            self._pending[path] = now

        # debounce 통과 시 실제 처리
        try:
            fn()
        except Exception as exc:
            logger.error("VaultEventHandler error for %s: %s", path, exc, exc_info=True)

    # ------------------------------------------------------------------
    # Event filtering helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _is_relevant(src_path: str, is_dir: bool) -> bool:
        """처리 대상 여부 판별: .md 파일 또는 디렉터리, .synapsenote 경로 제외."""
        if _IGNORED_DIR in Path(src_path).parts:
            return False
        if is_dir:
            return True
        return src_path.endswith(".md")

    # ------------------------------------------------------------------
    # watchdog callbacks
    # ------------------------------------------------------------------

    def on_created(self, event: FileSystemEvent) -> None:
        if not self._is_relevant(event.src_path, event.is_directory):
            return
        path = event.src_path

        def _handle() -> None:
            logger.debug("on_created: %s", path)
            self.indexer.update_node(Path(path))

        self._debounced(path, _handle)

    def on_modified(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        if not self._is_relevant(event.src_path, event.is_directory):
            return
        path = event.src_path

        def _handle() -> None:
            logger.debug("on_modified: %s", path)
            self.indexer.update_node(Path(path))

        self._debounced(path, _handle)

    def on_deleted(self, event: FileSystemEvent) -> None:
        if not self._is_relevant(event.src_path, event.is_directory):
            return
        path = event.src_path

        def _handle() -> None:
            logger.debug("on_deleted: %s", path)
            self.indexer.delete_node(Path(path))

        self._debounced(path, _handle)

    def on_moved(self, event: FileSystemEvent) -> None:
        src: str = event.src_path
        dest: str = event.dest_path  # type: ignore[attr-defined]
        src_relevant = self._is_relevant(src, event.is_directory)
        dest_relevant = self._is_relevant(dest, event.is_directory)

        if not src_relevant and not dest_relevant:
            return

        def _handle() -> None:
            logger.debug("on_moved: %s → %s", src, dest)
            if src_relevant:
                self.indexer.delete_node(Path(src))
            if dest_relevant:
                self.indexer.update_node(Path(dest))

        # 이동은 dest 경로를 키로 디바운스
        self._debounced(dest, _handle)


class VaultWatcher:
    def __init__(self, indexer: VaultIndexer) -> None:
        self.indexer = indexer
        self._observer: Observer | None = None

    def start(self) -> None:
        """watchdog Observer를 daemon 스레드로 시작."""
        if self._observer is not None and self._observer.is_alive():
            logger.warning("VaultWatcher is already running")
            return

        vault_path = str(self.indexer.vault_root)
        handler = VaultEventHandler(self.indexer)

        observer = Observer()
        observer.schedule(handler, vault_path, recursive=True)
        observer.daemon = True
        observer.start()

        self._observer = observer
        logger.info("VaultWatcher started — watching %s", vault_path)

    def stop(self) -> None:
        """Observer를 중지하고 스레드가 끝날 때까지 최대 5초 대기."""
        if self._observer is None:
            return
        try:
            self._observer.stop()
            self._observer.join(timeout=5)
        except Exception as exc:
            logger.warning("VaultWatcher stop error: %s", exc)
        finally:
            self._observer = None
            logger.info("VaultWatcher stopped")
