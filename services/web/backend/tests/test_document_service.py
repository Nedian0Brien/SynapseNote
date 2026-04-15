from __future__ import annotations

import os
import textwrap

import pytest

os.environ.setdefault("VAULT_ROOT", "/tmp/test-vault")

from app.services.document_service import read_document, write_document


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def vault(tmp_path, monkeypatch):
    """Temporary vault with sample documents."""
    monkeypatch.setenv("VAULT_ROOT", str(tmp_path))

    (tmp_path / "projects").mkdir()

    (tmp_path / "projects" / "alpha.md").write_text(
        textwrap.dedent("""\
            # Alpha Project
            This is the alpha project content.
            #ml #rag
        """)
    )

    (tmp_path / "readme.md").write_text(
        textwrap.dedent("""\
            # Root Readme
            Top-level readme file.
        """)
    )

    return tmp_path


# ---------------------------------------------------------------------------
# read_document
# ---------------------------------------------------------------------------


class TestReadDocument:
    def test_read_existing(self, vault):
        result = read_document("projects/alpha.md")

        assert result["id"] == "projects/alpha.md"
        assert result["title"] == "Alpha Project"
        assert "alpha project content" in result["content"].lower()
        assert "updatedAt" in result

    def test_read_root_file(self, vault):
        result = read_document("readme.md")

        assert result["id"] == "readme.md"
        assert result["title"] == "Root Readme"

    def test_read_nonexistent(self, vault):
        with pytest.raises(FileNotFoundError):
            read_document("nonexistent.md")

    def test_read_directory_rejected(self, vault):
        with pytest.raises(ValueError, match="markdown"):
            read_document("projects")


# ---------------------------------------------------------------------------
# write_document
# ---------------------------------------------------------------------------


class TestWriteDocument:
    def test_write_existing(self, vault):
        new_content = "# Alpha Project\nUpdated content.\n#ml\n"
        result = write_document("projects/alpha.md", new_content)

        assert result["id"] == "projects/alpha.md"
        assert result["title"] == "Alpha Project"
        assert "updatedAt" in result

        # Verify file was actually written
        actual = (vault / "projects" / "alpha.md").read_text()
        assert actual == new_content

    def test_write_creates_new_file(self, vault):
        new_content = "# New Doc\nNew document content.\n"
        result = write_document("notes/new.md", new_content)

        assert result["id"] == "notes/new.md"
        assert (vault / "notes" / "new.md").exists()

    def test_write_creates_parent_dirs(self, vault):
        new_content = "# Deep Doc\nDeep nested.\n"
        result = write_document("deep/nested/dir/doc.md", new_content)

        assert result["id"] == "deep/nested/dir/doc.md"
        assert (vault / "deep" / "nested" / "dir" / "doc.md").exists()

    def test_path_traversal_blocked(self, vault):
        with pytest.raises(ValueError, match="traversal"):
            write_document("../etc/passwd", "malicious")

    def test_path_traversal_middle(self, vault):
        with pytest.raises(ValueError, match="traversal"):
            write_document("projects/../../etc/passwd", "malicious")

    def test_non_markdown_rejected(self, vault):
        with pytest.raises(ValueError, match="markdown"):
            write_document("file.txt", "some text")

    def test_empty_content_allowed(self, vault):
        result = write_document("projects/empty.md", "")

        assert result["id"] == "projects/empty.md"
        assert (vault / "projects" / "empty.md").read_text() == ""
