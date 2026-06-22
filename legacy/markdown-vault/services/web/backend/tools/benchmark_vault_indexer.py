from __future__ import annotations

import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db.connection import close_db, get_db
from app.db.schema import init_schema
from app.indexer.vault_indexer import VaultIndexer


def main() -> None:
    count = int(os.environ.get("SYNAPSENOTE_BENCH_DOCS", "1000"))
    tmp_dir = Path(tempfile.mkdtemp(prefix="synapsenote-index-bench-"))
    try:
        vault = tmp_dir / "vault"
        vault.mkdir()
        for index in range(count):
            target = (index + 1) % count
            (vault / f"note-{index:04d}.md").write_text(
                f"---\ntitle: Note {index}\ntags: [bench]\n---\n"
                f"# Note {index}\n"
                f"See [[note-{target:04d}]].\n"
                f"[self](note-{index:04d}.md)\n",
                encoding="utf-8",
            )

        os.environ["VAULT_ROOT"] = str(vault)
        close_db()
        init_schema(get_db())

        start = time.perf_counter()
        result = VaultIndexer().full_rebuild()
        elapsed = time.perf_counter() - start
        print(f"docs={count} nodes={result['nodes']} edges={result['edges']} elapsed_seconds={elapsed:.3f}")
    finally:
        close_db()
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
