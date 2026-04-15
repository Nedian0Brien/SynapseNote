from __future__ import annotations

import os
import sys
import textwrap
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("SYNAPSENOTE_CHAT_STORE", "in_memory")
os.environ.setdefault("SYNAPSENOTE_USER_ID", "solo")
os.environ.setdefault("SYNAPSENOTE_USER_PASSWORD", "secret-pass")


@pytest.fixture()
def vault(tmp_path, monkeypatch):
    monkeypatch.setenv("VAULT_ROOT", str(tmp_path))
    monkeypatch.setenv("SYNAPSENOTE_CHAT_STORE", "in_memory")
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    (tmp_path / "projects").mkdir()
    (tmp_path / "projects" / "alpha.md").write_text(
        textwrap.dedent("""\
            # Alpha
            See also [[beta]].
            #ml #rag
        """),
        encoding="utf-8",
    )
    (tmp_path / "projects" / "beta.md").write_text(
        textwrap.dedent("""\
            # Beta
            Linked from [[alpha]].
            #ml
        """),
        encoding="utf-8",
    )
    return tmp_path


@pytest.fixture()
def client(vault, monkeypatch):
    from app.indexer.vault_indexer import VaultIndexer
    from app.indexer.vault_watcher import VaultWatcher
    from app.main import create_app
    from app.testing import create_sync_test_client

    monkeypatch.setattr(VaultWatcher, "start", lambda self: None)
    monkeypatch.setattr(VaultWatcher, "stop", lambda self: None)
    VaultIndexer().full_rebuild()
    yield create_sync_test_client(create_app())


def _login(client) -> None:
    response = client.post(
        "/auth/login",
        json={"userId": "solo", "password": "secret-pass"},
    )
    assert response.status_code == 200


def test_runtime_health_contract(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "synapsenote-api",
        "version": "0.1.0",
    }


def test_runtime_auth_contract(client):
    unauthorized = client.get("/auth/me")
    assert unauthorized.status_code == 401

    _login(client)

    current_user = client.get("/auth/me")
    assert current_user.status_code == 200
    assert current_user.json() == {"user": {"id": "solo"}}


def test_runtime_graph_contract(client):
    _login(client)

    response = client.get("/api/graph")
    assert response.status_code == 200

    payload = response.json()["data"]
    assert set(payload) == {"nodes", "edges", "stats"}
    assert payload["stats"]["nodes"] >= 2
    assert payload["stats"]["edges"] >= 1


def test_runtime_document_read_write_contract(client, vault):
    _login(client)

    read_response = client.get("/api/documents/projects/alpha.md")
    assert read_response.status_code == 200
    assert read_response.json()["data"]["title"] == "Alpha"

    new_content = "# Gamma\nNew runtime contract document.\n"
    write_response = client.put(
        "/api/documents/projects/gamma.md",
        json={"content": new_content},
    )
    assert write_response.status_code == 200
    assert write_response.json()["data"]["id"] == "projects/gamma.md"
    assert (vault / "projects" / "gamma.md").read_text(encoding="utf-8") == new_content
