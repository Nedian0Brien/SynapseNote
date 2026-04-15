from __future__ import annotations

import sys
from pathlib import Path

from conftest import run_vault_index

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def create_test_client():
    from app.main import create_app
    from app.testing import create_sync_test_client

    return create_sync_test_client(create_app())


def use_in_memory_chat_store(monkeypatch) -> None:
    monkeypatch.setenv("SYNAPSENOTE_CHAT_STORE", "in_memory")


def sign_in(client) -> None:
    response = client.post(
        "/auth/login",
        json={"userId": "solo", "password": "secret-pass"},
    )
    assert response.status_code == 200


def test_health_endpoint_exposes_app_metadata(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    client = create_test_client()

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "synapsenote-api",
        "version": "0.1.0",
    }


def test_single_user_login_sets_session_cookie(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()

    unauthorized = client.get("/auth/me")
    assert unauthorized.status_code == 401

    response = client.post(
        "/auth/login",
        json={"userId": "solo", "password": "secret-pass"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True, "user": {"id": "solo"}}
    assert "synapsenote_session" in response.cookies

    current_user = client.get("/auth/me")

    assert current_user.status_code == 200
    assert current_user.json() == {"user": {"id": "solo"}}


def test_nodes_endpoint_returns_directories_and_documents(monkeypatch, tmp_path: Path) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")
    monkeypatch.setenv("VAULT_ROOT", str(tmp_path))

    projects = tmp_path / "projects"
    projects.mkdir()
    (tmp_path / "inbox.md").write_text("# Inbox\n\n첫 메모", encoding="utf-8")
    (projects / "rag-evaluation.md").write_text("# RAG 평가 기준\n\nprecision recall", encoding="utf-8")

    run_vault_index()

    client = create_test_client()
    sign_in(client)

    response = client.get("/api/nodes")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    node_map = {item["id"]: item["type"] for item in payload["data"]}
    assert node_map.get("projects") == "Directory"
    assert node_map.get("projects/rag-evaluation.md") == "Document"
    assert node_map.get("inbox.md") == "Document"


def test_context_endpoints_add_and_remove_nodes(monkeypatch, tmp_path: Path) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")
    monkeypatch.setenv("VAULT_ROOT", str(tmp_path))

    (tmp_path / "inbox.md").write_text("# Inbox\n\n첫 메모", encoding="utf-8")

    run_vault_index()

    client = create_test_client()
    sign_in(client)

    add_response = client.post(
        "/api/context",
        json={"nodeIds": ["inbox.md"]},
    )

    assert add_response.status_code == 200
    added = add_response.json()
    assert added["success"] is True
    assert added["meta"]["total"] == 1
    assert added["data"][0]["id"] == "inbox.md"

    get_response = client.get("/api/context")
    assert get_response.status_code == 200
    assert get_response.json()["data"][0]["title"] == "Inbox"

    remove_response = client.delete("/api/context/inbox.md")
    assert remove_response.status_code == 200
    assert remove_response.json()["meta"]["total"] == 0
