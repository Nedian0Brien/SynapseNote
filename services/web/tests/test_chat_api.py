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


def test_chat_store_creates_session_with_agent_and_policy() -> None:
    from app.services.chat_store import InMemoryChatStore

    store = InMemoryChatStore()

    session = store.create_session(
        title="Sprint 3",
        selected_agent="claude_code",
        edit_policy="approval_required",
        context_node_ids=["projects/rag-evaluation.md"],
    )

    assert session["title"] == "Sprint 3"
    assert session["selectedAgent"] == "claude_code"
    assert session["editPolicy"] == "approval_required"
    assert session["contextNodeIds"] == ["projects/rag-evaluation.md"]


def test_chat_store_persists_messages_under_session() -> None:
    from app.services.chat_store import InMemoryChatStore

    store = InMemoryChatStore()
    session = store.create_session(
        title="Session A",
        selected_agent="codex_cli",
        edit_policy="auto_apply",
        context_node_ids=[],
    )

    message = store.add_message(
        session_id=str(session["id"]),
        role="user",
        content="현재 상태를 요약해줘",
        agent="codex_cli",
        block_type="user_message",
        context_ids=["inbox.md"],
        context_snapshot=[{"id": "inbox.md", "title": "Inbox"}],
    )

    messages = store.list_messages(str(session["id"]))

    assert len(messages) == 1
    assert messages[0]["id"] == message["id"]
    assert messages[0]["content"] == "현재 상태를 요약해줘"
    assert messages[0]["contextIds"] == ["inbox.md"]


def test_chat_store_records_agent_switch_handoff() -> None:
    from app.services.chat_store import InMemoryChatStore

    store = InMemoryChatStore()
    session = store.create_session(
        title="Session B",
        selected_agent="claude_code",
        edit_policy="approval_required",
        context_node_ids=[],
    )

    handoff = store.switch_agent(
        session_id=str(session["id"]),
        to_agent="gemini_cli",
        server_summary="현재 목표는 Sprint 3 채팅 구현",
        agent_summary="직전 에이전트가 저장 계층 초안을 남김",
        recent_message_ids=["m-1", "m-2"],
    )

    refreshed = store.get_session(str(session["id"]))

    assert refreshed is not None
    assert refreshed["selectedAgent"] == "gemini_cli"
    assert handoff["fromAgent"] == "claude_code"
    assert handoff["toAgent"] == "gemini_cli"
    assert handoff["serverSummary"] == "현재 목표는 Sprint 3 채팅 구현"
    assert handoff["agentSummary"] == "직전 에이전트가 저장 계층 초안을 남김"
    assert handoff["recentMessageIds"] == ["m-1", "m-2"]


def test_couchdb_chat_store_persists_session_run_and_capture_records() -> None:
    from app.services.chat_store import CouchDBChatStore

    class FakeDocumentDatabase:
        def __init__(self) -> None:
            self.docs: dict[str, dict] = {}
            self.ensure_called = False

        def ensure_database(self) -> None:
            self.ensure_called = True

        def write_document(self, doc_id: str, document: dict) -> dict:
            existing = self.docs.get(doc_id)
            next_rev = str(int(existing.get("_rev", "0")) + 1) if existing else "1"
            stored = dict(document)
            stored["_id"] = doc_id
            stored["_rev"] = next_rev
            self.docs[doc_id] = stored
            return dict(stored)

        def read_document(self, doc_id: str) -> dict | None:
            stored = self.docs.get(doc_id)
            return dict(stored) if stored else None

        def find_documents(self, selector: dict) -> list[dict]:
            matches: list[dict] = []
            for document in self.docs.values():
                if all(document.get(key) == value for key, value in selector.items()):
                    matches.append(dict(document))
            return matches

    database = FakeDocumentDatabase()
    store = CouchDBChatStore(database=database)

    session = store.create_session(
        title="Sprint 3",
        selected_agent="claude_code",
        edit_policy="approval_required",
        context_node_ids=["projects/rag-evaluation.md"],
    )
    message = store.add_message(
        session_id=str(session["id"]),
        role="user",
        content="현재 상태를 저장해줘",
        agent="claude_code",
        block_type="user_message",
        context_ids=["projects/rag-evaluation.md"],
        context_snapshot=[{"id": "projects/rag-evaluation.md", "title": "RAG"}],
    )
    handoff = store.switch_agent(
        session_id=str(session["id"]),
        to_agent="codex_cli",
        server_summary="최근 대화 요약",
        agent_summary="직전 에이전트가 저장 상태를 남겼다.",
        recent_message_ids=[str(message["id"])],
    )
    run = store.create_run(
        session_id=str(session["id"]),
        message_id=str(message["id"]),
        agent="codex_cli",
        edit_policy="approval_required",
        status="pending_approval",
        adapter="codex_cli",
        started_at="2026-03-27T12:00:00+00:00",
        ended_at=None,
    )
    updated_run = store.update_run(
        run_id=str(run["id"]),
        status="completed",
        ended_at="2026-03-27T12:01:00+00:00",
    )
    capture = store.create_capture(
        session_id=str(session["id"]),
        source_message_ids=[str(message["id"])],
        target_node_path="captures/sprint-3.md",
        status="saved",
    )

    assert database.ensure_called is True
    assert store.get_session(str(session["id"]))["title"] == "Sprint 3"
    assert store.list_messages(str(session["id"]))[0]["content"] == "현재 상태를 저장해줘"
    assert store.list_handoffs(str(session["id"]))[0]["id"] == handoff["id"]
    assert store.get_run(str(run["id"]))["status"] == "completed"
    assert updated_run["endedAt"] == "2026-03-27T12:01:00+00:00"
    assert store.list_captures(str(session["id"]))[0]["targetNodePath"] == "captures/sprint-3.md"
    assert capture["status"] == "saved"


def test_chat_session_endpoints_create_list_and_detail(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)

    create_response = client.post(
        "/api/chat/sessions",
        json={
            "title": "Sprint 3 Session",
            "selectedAgent": "claude_code",
            "editPolicy": "approval_required",
            "contextNodeIds": ["inbox.md"],
        },
    )

    assert create_response.status_code == 200
    created = create_response.json()
    assert created["success"] is True
    assert created["data"]["selectedAgent"] == "claude_code"

    list_response = client.get("/api/chat/sessions")
    assert list_response.status_code == 200
    assert list_response.json()["meta"]["total"] == 1

    session_id = created["data"]["id"]
    detail_response = client.get(f"/api/chat/sessions/{session_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["title"] == "Sprint 3 Session"


def test_chat_message_endpoints_create_and_list(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)

    session_response = client.post(
        "/api/chat/sessions",
        json={
            "title": "Message Session",
            "selectedAgent": "codex_cli",
            "editPolicy": "auto_apply",
            "contextNodeIds": [],
        },
    )
    session_id = session_response.json()["data"]["id"]

    message_response = client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "role": "user",
            "content": "현재 구현 상태를 요약해줘",
            "agent": "codex_cli",
            "blockType": "user_message",
            "contextIds": [],
            "contextSnapshot": [],
        },
    )

    assert message_response.status_code == 200
    assert message_response.json()["data"]["content"] == "현재 구현 상태를 요약해줘"

    list_response = client.get(f"/api/chat/sessions/{session_id}/messages")
    assert list_response.status_code == 200
    assert list_response.json()["meta"]["total"] == 1
    assert list_response.json()["data"][0]["blockType"] == "user_message"


def test_chat_agent_switch_endpoint_updates_session_and_handoff(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)

    session_response = client.post(
        "/api/chat/sessions",
        json={
            "title": "Switch Session",
            "selectedAgent": "claude_code",
            "editPolicy": "approval_required",
            "contextNodeIds": [],
        },
    )
    session_id = session_response.json()["data"]["id"]

    switch_response = client.post(
        f"/api/chat/sessions/{session_id}/agent",
        json={
            "toAgent": "gemini_cli",
            "serverSummary": "현재 구현 범위는 세션과 메시지 API다.",
            "agentSummary": "직전 에이전트는 저장 계층을 만들었다.",
            "recentMessageIds": ["message-1"],
        },
    )

    assert switch_response.status_code == 200
    payload = switch_response.json()
    assert payload["success"] is True
    assert payload["data"]["session"]["selectedAgent"] == "gemini_cli"
    assert payload["data"]["handoff"]["fromAgent"] == "claude_code"


def test_chat_agent_switch_generates_server_summary_from_recent_messages(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)

    session_response = client.post(
        "/api/chat/sessions",
        json={
            "title": "Summary Session",
            "selectedAgent": "claude_code",
            "editPolicy": "approval_required",
            "contextNodeIds": ["inbox.md"],
        },
    )
    session_id = session_response.json()["data"]["id"]

    client.post(
        f"/api/chat/sessions/{session_id}/messages",
        json={
            "role": "user",
            "content": "채팅 저장 구조를 먼저 구현하자",
            "agent": "claude_code",
            "blockType": "user_message",
            "contextIds": ["inbox.md"],
            "contextSnapshot": [{"id": "inbox.md", "title": "Inbox"}],
        },
    )

    switch_response = client.post(
        f"/api/chat/sessions/{session_id}/agent",
        json={
            "toAgent": "codex_cli",
            "agentSummary": "직전 에이전트는 저장 계층과 API를 만들었다.",
            "recentMessageIds": [],
        },
    )

    assert switch_response.status_code == 200
    payload = switch_response.json()["data"]["handoff"]
    assert "채팅 저장 구조를 먼저 구현하자" in payload["serverSummary"]
    assert payload["agentSummary"] == "직전 에이전트는 저장 계층과 API를 만들었다."


def test_chat_edit_policy_endpoint_updates_session(monkeypatch) -> None:
    use_in_memory_chat_store(monkeypatch)
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")

    client = create_test_client()
    sign_in(client)

    session_response = client.post(
        "/api/chat/sessions",
        json={
            "title": "Policy Session",
            "selectedAgent": "claude_code",
            "editPolicy": "approval_required",
            "contextNodeIds": [],
        },
    )
    session_id = session_response.json()["data"]["id"]

    policy_response = client.post(
        f"/api/chat/sessions/{session_id}/policy",
        json={"editPolicy": "auto_apply"},
    )

    assert policy_response.status_code == 200
    payload = policy_response.json()
    assert payload["success"] is True
    assert payload["data"]["editPolicy"] == "auto_apply"

    detail_response = client.get(f"/api/chat/sessions/{session_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["editPolicy"] == "auto_apply"
