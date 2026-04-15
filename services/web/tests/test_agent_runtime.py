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


def create_session(client, *, edit_policy: str = "approval_required") -> str:
    response = client.post(
        "/api/chat/sessions",
        json={
            "title": "Runtime Session",
            "selectedAgent": "claude_code",
            "editPolicy": edit_policy,
            "contextNodeIds": [],
        },
    )
    assert response.status_code == 200
    return response.json()["data"]["id"]


def test_chat_run_endpoint_creates_run(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)
    session_id = create_session(client, edit_policy="auto_apply")

    response = client.post(
        f"/api/chat/sessions/{session_id}/runs",
        json={
            "messageId": "message-1",
            "agent": "claude_code",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["sessionId"] == session_id
    assert payload["data"]["agent"] == "claude_code"
    assert payload["data"]["status"] == "completed"


def test_chat_run_stream_returns_sse_events_in_order(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)
    session_id = create_session(client, edit_policy="auto_apply")

    run_response = client.post(
        f"/api/chat/sessions/{session_id}/runs",
        json={
            "messageId": "message-1",
            "agent": "claude_code",
        },
    )
    run_id = run_response.json()["data"]["id"]

    with client.stream("GET", f"/api/chat/runs/{run_id}/stream") as response:
        body = b"".join(response.iter_bytes()).decode("utf-8")

    assert response.status_code == 200
    assert "event: run_started" in body
    assert "event: run_completed" in body
    assert body.index("event: run_started") < body.index("event: run_completed")


def test_chat_run_uses_selected_agent_adapter(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)
    session_id = create_session(client)

    response = client.post(
        f"/api/chat/sessions/{session_id}/runs",
        json={
            "messageId": "message-2",
            "agent": "codex_cli",
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["agent"] == "codex_cli"

    run_id = response.json()["data"]["id"]
    with client.stream("GET", f"/api/chat/runs/{run_id}/stream") as stream_response:
        body = b"".join(stream_response.iter_bytes()).decode("utf-8")

    assert '"adapter":"codex_cli"' in body


def test_chat_run_stream_includes_normalized_thinking_event(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)
    session_id = create_session(client)

    response = client.post(
        f"/api/chat/sessions/{session_id}/runs",
        json={
            "messageId": "message-3",
            "agent": "gemini_cli",
        },
    )

    run_id = response.json()["data"]["id"]

    with client.stream("GET", f"/api/chat/runs/{run_id}/stream") as stream_response:
        body = b"".join(stream_response.iter_bytes()).decode("utf-8")

    assert "event: agent_thinking" in body
    assert '"type":"agent_thinking"' in body


def test_chat_run_stream_uses_proposed_change_for_approval_mode(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)
    session_id = create_session(client, edit_policy="approval_required")

    response = client.post(
        f"/api/chat/sessions/{session_id}/runs",
        json={"messageId": "message-4", "agent": "claude_code"},
    )
    run_id = response.json()["data"]["id"]

    with client.stream("GET", f"/api/chat/runs/{run_id}/stream") as stream_response:
        body = b"".join(stream_response.iter_bytes()).decode("utf-8")

    assert "event: proposed_change" in body
    assert "event: file_change" not in body
    assert response.json()["data"]["status"] == "pending_approval"


def test_chat_run_stream_uses_file_change_for_auto_apply_mode(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)
    session_id = create_session(client, edit_policy="auto_apply")

    response = client.post(
        f"/api/chat/sessions/{session_id}/runs",
        json={"messageId": "message-5", "agent": "claude_code"},
    )
    run_id = response.json()["data"]["id"]

    with client.stream("GET", f"/api/chat/runs/{run_id}/stream") as stream_response:
        body = b"".join(stream_response.iter_bytes()).decode("utf-8")

    assert "event: file_change" in body
    assert response.json()["data"]["status"] == "completed"


def test_chat_run_approval_endpoint_applies_pending_change(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)
    session_id = create_session(client, edit_policy="approval_required")

    run_response = client.post(
        f"/api/chat/sessions/{session_id}/runs",
        json={"messageId": "message-6", "agent": "claude_code"},
    )
    run_id = run_response.json()["data"]["id"]

    approval_response = client.post(
        f"/api/chat/runs/{run_id}/approvals",
        json={"action": "approve"},
    )

    assert approval_response.status_code == 200
    payload = approval_response.json()["data"]
    assert payload["run"]["status"] == "completed"
    assert payload["event"]["type"] == "file_change"
    assert payload["event"]["payload"]["summary"] == "승인 후 파일 변경을 반영했다."


def test_chat_run_approval_endpoint_rejects_pending_change(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)
    session_id = create_session(client, edit_policy="approval_required")

    run_response = client.post(
        f"/api/chat/sessions/{session_id}/runs",
        json={"messageId": "message-7", "agent": "claude_code"},
    )
    run_id = run_response.json()["data"]["id"]

    approval_response = client.post(
        f"/api/chat/runs/{run_id}/approvals",
        json={"action": "reject"},
    )

    assert approval_response.status_code == 200
    payload = approval_response.json()["data"]
    assert payload["run"]["status"] == "rejected"
    assert payload["event"]["type"] == "change_rejected"
    assert payload["event"]["payload"]["summary"] == "사용자가 파일 변경을 거절했다."
