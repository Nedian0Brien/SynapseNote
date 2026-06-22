from __future__ import annotations

import sys
from pathlib import Path

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


def test_capture_creates_vault_node_and_saved_message(monkeypatch, tmp_path: Path) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")
    monkeypatch.setenv("VAULT_ROOT", str(tmp_path))

    client = create_test_client()
    sign_in(client)

    session_response = client.post(
        "/api/chat/sessions",
        json={
            "title": "Capture Session",
            "selectedAgent": "claude_code",
            "editPolicy": "approval_required",
            "contextNodeIds": [],
        },
    )
    session_id = session_response.json()["data"]["id"]

    message_response = client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "role": "agent",
            "content": "이 대화 요약을 문서로 저장하자.",
            "agent": "claude_code",
            "blockType": "agent_response",
            "contextIds": [],
            "contextSnapshot": [],
        },
    )
    message_id = message_response.json()["data"]["id"]

    capture_response = client.post(
        "/api/chat/captures",
        json={
            "sessionId": session_id,
            "sourceMessageIds": [message_id],
            "title": "대화 요약",
            "directory": "captures",
        },
    )

    assert capture_response.status_code == 200
    payload = capture_response.json()
    assert payload["success"] is True
    assert payload["data"]["targetNodePath"] == "captures/대화 요약.md"

    saved_file = tmp_path / "captures" / "대화 요약.md"
    assert saved_file.exists()
    assert "이 대화 요약을 문서로 저장하자." in saved_file.read_text(encoding="utf-8")

    graph_response = client.get("/api/graph")
    graph_ids = {node["id"] for node in graph_response.json()["data"]["nodes"]}
    assert "captures/대화 요약.md" in graph_ids

    chunks_response = client.get("/api/chunks?path=captures%2F대화%20요약.md")
    assert chunks_response.status_code == 200
    assert chunks_response.json()["data"][0]["path"] == "captures/대화 요약.md"

    messages_response = client.get(f"/api/chat/sessions/{session_id}/messages")
    messages = messages_response.json()["data"]
    assert messages[-1]["blockType"] == "saved_as_node"
    assert messages[-1]["content"] == "captures/대화 요약.md"


def test_capture_rejects_directory_traversal(monkeypatch, tmp_path: Path) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")
    monkeypatch.setenv("VAULT_ROOT", str(tmp_path / "vault"))
    (tmp_path / "vault").mkdir()

    client = create_test_client()
    sign_in(client)

    session_response = client.post(
        "/api/chat/sessions",
        json={
            "title": "Capture Session",
            "selectedAgent": "claude_code",
            "editPolicy": "approval_required",
            "contextNodeIds": [],
        },
    )
    session_id = session_response.json()["data"]["id"]

    message_response = client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "role": "agent",
            "content": "do not escape",
            "agent": "claude_code",
            "blockType": "agent_response",
            "contextIds": [],
            "contextSnapshot": [],
        },
    )
    message_id = message_response.json()["data"]["id"]

    capture_response = client.post(
        "/api/chat/captures",
        json={
            "sessionId": session_id,
            "sourceMessageIds": [message_id],
            "title": "escape",
            "directory": "../outside",
        },
    )

    assert capture_response.status_code == 400
    assert not (tmp_path / "outside" / "escape.md").exists()


def test_capture_can_append_to_existing_document(monkeypatch, tmp_path: Path) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")
    monkeypatch.setenv("VAULT_ROOT", str(tmp_path))
    (tmp_path / "journal.md").write_text("# Journal\n\nBefore\n", encoding="utf-8")

    client = create_test_client()
    sign_in(client)

    session_response = client.post(
        "/api/chat/sessions",
        json={
            "title": "Capture Session",
            "selectedAgent": "claude_code",
            "editPolicy": "approval_required",
            "contextNodeIds": [],
        },
    )
    session_id = session_response.json()["data"]["id"]

    message_response = client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "role": "agent",
            "content": "append this",
            "agent": "claude_code",
            "blockType": "agent_response",
            "contextIds": [],
            "contextSnapshot": [],
        },
    )
    message_id = message_response.json()["data"]["id"]

    capture_response = client.post(
        "/api/chat/captures",
        json={
            "sessionId": session_id,
            "sourceMessageIds": [message_id],
            "title": "Appended",
            "directory": "",
            "appendToPath": "journal.md",
        },
    )

    assert capture_response.status_code == 200
    assert capture_response.json()["data"]["mode"] == "append"
    content = (tmp_path / "journal.md").read_text(encoding="utf-8")
    assert "# Journal" in content
    assert "## Appended" in content
    assert "append this" in content
