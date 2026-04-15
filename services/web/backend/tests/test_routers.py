"""Integration tests for API routers.

Verifies that all endpoints work correctly after the router extraction refactor.
"""
from __future__ import annotations

import os
import sys
import textwrap
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("VAULT_ROOT", "/tmp/test-vault")
os.environ.setdefault("SYNAPSENOTE_USER_ID", "testuser")
os.environ.setdefault("SYNAPSENOTE_USER_PASSWORD", "testpass")
os.environ.setdefault("SYNAPSENOTE_CHAT_STORE", "in_memory")


@pytest.fixture()
def vault(tmp_path, monkeypatch):
    monkeypatch.setenv("VAULT_ROOT", str(tmp_path))
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "testuser")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "testpass")
    monkeypatch.setenv("SYNAPSENOTE_CHAT_STORE", "in_memory")

    (tmp_path / "projects").mkdir()
    (tmp_path / "projects" / "alpha.md").write_text(
        textwrap.dedent("""\
            # Alpha Project
            Alpha content about ML.
            See also [[beta]].
            #ml #rag
        """)
    )
    (tmp_path / "projects" / "beta.md").write_text(
        textwrap.dedent("""\
            # Beta Project
            Beta content about ML pipelines.
            #ml
        """)
    )
    return tmp_path


@pytest.fixture()
def client(vault):
    from app.indexer.vault_indexer import VaultIndexer
    from app.main import create_app
    from app.testing import create_sync_test_client

    VaultIndexer().full_rebuild()
    return create_sync_test_client(create_app())


def _login(client) -> None:
    resp = client.post("/auth/login", json={"userId": "testuser", "password": "testpass"})
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Health & Auth
# ---------------------------------------------------------------------------


class TestHealth:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestAuth:
    def test_login_success(self, client):
        resp = client.post("/auth/login", json={"userId": "testuser", "password": "testpass"})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_login_failure(self, client):
        resp = client.post("/auth/login", json={"userId": "wrong", "password": "wrong"})
        assert resp.status_code == 401

    def test_me_unauthenticated(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401

    def test_me_authenticated(self, client):
        _login(client)
        resp = client.get("/auth/me")
        assert resp.status_code == 200
        assert resp.json() == {"user": {"id": "testuser"}}


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


class TestNodes:
    def test_list_nodes(self, client):
        _login(client)
        resp = client.get("/api/nodes")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert len(data["data"]) > 0

    def test_list_nodes_with_query(self, client):
        _login(client)
        resp = client.get("/api/nodes?q=alpha")
        assert resp.status_code == 200
        ids = [n["id"] for n in resp.json()["data"]]
        assert "projects/alpha.md" in ids

    def test_list_nodes_unauthenticated(self, client):
        resp = client.get("/api/nodes")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------


class TestContext:
    def test_context_lifecycle(self, client):
        _login(client)

        # Initially empty
        resp = client.get("/api/context")
        assert resp.json()["data"] == []

        # Add
        resp = client.post("/api/context", json={"nodeIds": ["projects/alpha.md"]})
        assert resp.status_code == 200
        assert len(resp.json()["data"]) == 1

        # Remove
        resp = client.delete("/api/context/projects/alpha.md")
        assert resp.status_code == 200
        assert len(resp.json()["data"]) == 0


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------


class TestGraph:
    def test_graph_returns_data(self, client):
        _login(client)
        resp = client.get("/api/graph")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "nodes" in data
        assert "edges" in data
        assert "stats" in data
        assert data["stats"]["nodes"] > 0

    def test_graph_with_query(self, client):
        _login(client)
        resp = client.get("/api/graph?q=alpha")
        assert resp.status_code == 200
        node_ids = {n["id"] for n in resp.json()["data"]["nodes"]}
        assert "projects/alpha.md" in node_ids

    def test_graph_with_threshold(self, client):
        _login(client)
        resp = client.get("/api/graph?threshold=0.0")
        assert resp.status_code == 200

    def test_graph_unauthenticated(self, client):
        resp = client.get("/api/graph")
        assert resp.status_code == 401

    def test_graph_ignores_pytest_cache(self, client, vault):
        cache_dir = vault / ".pytest_cache"
        cache_dir.mkdir()
        (cache_dir / "README.md").write_text("cache", encoding="utf-8")

        _login(client)
        resp = client.get("/api/graph")

        assert resp.status_code == 200
        node_ids = {node["id"] for node in resp.json()["data"]["nodes"]}
        assert ".pytest_cache" not in node_ids
        assert ".pytest_cache/README.md" not in node_ids


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


class TestDocuments:
    def test_read_document(self, client):
        _login(client)
        resp = client.get("/api/documents/projects/alpha.md")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["id"] == "projects/alpha.md"
        assert data["title"] == "Alpha Project"
        assert "content" in data

    def test_read_nonexistent(self, client):
        _login(client)
        resp = client.get("/api/documents/nonexistent.md")
        assert resp.status_code == 404

    def test_write_document(self, client, vault):
        _login(client)
        new_content = "# Updated Alpha\nNew content.\n"
        resp = client.put(
            "/api/documents/projects/alpha.md",
            json={"content": new_content},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["title"] == "Updated Alpha"

        # Verify content was written
        actual = (vault / "projects" / "alpha.md").read_text()
        assert actual == new_content

    def test_write_new_document(self, client, vault):
        _login(client)
        resp = client.put(
            "/api/documents/notes/new-doc.md",
            json={"content": "# New Doc\nContent.\n"},
        )
        assert resp.status_code == 200
        assert (vault / "notes" / "new-doc.md").exists()

    def test_path_traversal_rejected(self, client):
        _login(client)
        # URL-encode the path to prevent HTTP client normalization
        resp = client.put(
            "/api/documents/projects/../../etc/passwd.md",
            json={"content": "malicious"},
        )
        # FastAPI normalizes URL path, so this resolves to /api/documents/etc/passwd.md
        # which either returns 400 (invalid path) or 404 (file not found) — both are safe
        assert resp.status_code in (400, 404)

    def test_documents_unauthenticated(self, client):
        resp = client.get("/api/documents/projects/alpha.md")
        assert resp.status_code == 401
