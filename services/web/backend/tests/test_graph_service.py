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

    def test_frontmatter_tags_create_tag_nodes_and_edges(self, vault):
        (vault / "notes" / "frontmatter.md").write_text(
            textwrap.dedent("""\
                ---
                title: Frontmatter Title
                tags:
                  - law
                  - rag
                ---

                Body without heading.
            """),
            encoding="utf-8",
        )

        VaultIndexer().full_rebuild()
        result = build_graph()

        nodes = {node["id"]: node for node in result["nodes"]}
        edges = {(edge["source"], edge["target"], edge["edge_type"]) for edge in result["edges"]}

        assert nodes["notes/frontmatter.md"]["title"] == "Frontmatter Title"
        assert set(nodes["notes/frontmatter.md"]["tags"]) == {"law", "rag"}
        assert nodes["tag:law"]["type"] == "Tag"
        assert ("notes/frontmatter.md", "tag:law", "tag") in edges
        assert ("notes/frontmatter.md", "tag:rag", "tag") in edges

    def test_markdown_links_create_markdown_link_edges(self, vault):
        (vault / "notes" / "target.md").write_text("# Target\n", encoding="utf-8")
        (vault / "notes" / "source.md").write_text(
            "[Target](target.md)\n[External](https://example.com/out.md)\n",
            encoding="utf-8",
        )

        VaultIndexer().full_rebuild()
        result = build_graph()

        edges = {(edge["source"], edge["target"], edge["edge_type"]) for edge in result["edges"]}
        assert ("notes/source.md", "notes/target.md", "markdown_link") in edges

    def test_embeds_create_attachment_nodes_and_edges(self, vault):
        (vault / "notes" / "diagram.png").write_bytes(b"png")
        (vault / "notes" / "with-embed.md").write_text(
            "![[diagram.png]]\n",
            encoding="utf-8",
        )

        VaultIndexer().full_rebuild()
        result = build_graph()

        nodes = {node["id"]: node for node in result["nodes"]}
        edges = {(edge["source"], edge["target"], edge["edge_type"]) for edge in result["edges"]}

        assert nodes["notes/diagram.png"]["type"] == "Attachment"
        assert ("notes/with-embed.md", "notes/diagram.png", "attachment") in edges

    def test_wikilink_resolution_prefers_same_directory(self, vault):
        (vault / "projects" / "same.md").write_text("# Project Same\n", encoding="utf-8")
        (vault / "notes" / "same.md").write_text("# Note Same\n", encoding="utf-8")
        (vault / "notes" / "source.md").write_text("[[same]]\n", encoding="utf-8")

        VaultIndexer().full_rebuild()
        result = build_graph()

        edges = {(edge["source"], edge["target"], edge["edge_type"]) for edge in result["edges"]}
        assert ("notes/source.md", "notes/same.md", "wikilink") in edges
        assert ("notes/source.md", "projects/same.md", "wikilink") not in edges

    def test_wikilink_resolution_accepts_vault_relative_paths(self, vault):
        (vault / "notes" / "path-source.md").write_text("[[projects/alpha]]\n", encoding="utf-8")

        VaultIndexer().full_rebuild()
        result = build_graph()

        edges = {(edge["source"], edge["target"], edge["edge_type"]) for edge in result["edges"]}
        assert ("notes/path-source.md", "projects/alpha.md", "wikilink") in edges

    def test_callout_marker_is_not_used_as_summary(self, vault):
        (vault / "notes" / "callout.md").write_text(
            textwrap.dedent("""\
                > [!note] Important
                > Keep this point visible.
            """),
            encoding="utf-8",
        )

        VaultIndexer().full_rebuild()
        result = build_graph()

        nodes = {node["id"]: node for node in result["nodes"]}
        assert nodes["notes/callout.md"]["summary"] == "Important"
