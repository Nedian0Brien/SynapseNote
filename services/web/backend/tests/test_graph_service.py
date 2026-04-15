from __future__ import annotations

import os
import textwrap

import pytest

os.environ.setdefault("VAULT_ROOT", "/tmp/test-vault")

from app.indexer.vault_indexer import VaultIndexer
from app.services.graph_service import build_graph


@pytest.fixture()
def vault(tmp_path, monkeypatch):
    monkeypatch.setenv("VAULT_ROOT", str(tmp_path))

    (tmp_path / "projects").mkdir()
    (tmp_path / "notes").mkdir()

    (tmp_path / "projects" / "alpha.md").write_text(
        textwrap.dedent("""\
            # Alpha Project
            This is the alpha project about ML and RAG.
            See also [[beta]] for related work.
            #ml #rag
        """),
        encoding="utf-8",
    )
    (tmp_path / "projects" / "beta.md").write_text(
        textwrap.dedent("""\
            # Beta Project
            Beta project focuses on ML pipelines.
            Reference: [[alpha]]
            #ml
        """),
        encoding="utf-8",
    )
    (tmp_path / "notes" / "orphan.md").write_text(
        textwrap.dedent("""\
            # Orphan Note
            This note has no links to other documents.
            #misc
        """),
        encoding="utf-8",
    )

    VaultIndexer().full_rebuild()
    return tmp_path


class TestBuildGraph:
    def test_returns_nodes_edges_and_stats(self, vault):
        result = build_graph()

        assert set(result) == {"nodes", "edges", "stats"}
        assert result["stats"]["nodes"] == len(result["nodes"])
        assert result["stats"]["edges"] == len(result["edges"])
        assert result["stats"]["structural_edges"] >= 3
        assert result["stats"]["semantic_edges"] == 0

    def test_query_filters_nodes_but_keeps_connected_edges(self, vault):
        result = build_graph(query="alpha")

        node_ids = {node["id"] for node in result["nodes"]}
        edge_pairs = {(edge["source"], edge["target"]) for edge in result["edges"]}

        assert "projects/alpha.md" in node_ids
        assert any("projects/alpha.md" in pair for pair in edge_pairs)

    def test_ignored_directories_do_not_appear_in_graph(self, vault):
        cache_dir = vault / ".pytest_cache"
        cache_dir.mkdir()
        (cache_dir / "README.md").write_text("cache", encoding="utf-8")

        VaultIndexer().full_rebuild()
        result = build_graph()

        node_ids = {node["id"] for node in result["nodes"]}
        assert ".pytest_cache" not in node_ids
        assert ".pytest_cache/README.md" not in node_ids

    def test_root_directory_is_included_as_directory_node(self, vault):
        result = build_graph()

        root_node = next(node for node in result["nodes"] if node["id"] == ".")
        assert root_node["type"] == "Directory"
