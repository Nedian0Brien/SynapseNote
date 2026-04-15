from __future__ import annotations

import fcntl
import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import quote
from uuid import uuid4

import requests


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_document_metadata(document: dict[str, Any] | None) -> dict[str, Any] | None:
    if document is None:
        return None

    return {
        key: value
        for key, value in document.items()
        if key not in {"_id", "_rev", "type"}
    }


def _sorted_documents(
    documents: list[dict[str, Any]],
    *,
    sort_key: str,
    reverse: bool = False,
) -> list[dict[str, Any]]:
    return sorted(
        documents,
        key=lambda document: str(document.get(sort_key, "")),
        reverse=reverse,
    )


class DocumentDatabase(Protocol):
    def ensure_database(self) -> None: ...

    def write_document(self, doc_id: str, document: dict[str, Any]) -> dict[str, Any]: ...

    def read_document(self, doc_id: str) -> dict[str, Any] | None: ...

    def find_documents(self, selector: dict[str, Any]) -> list[dict[str, Any]]: ...


@dataclass
class RequestsCouchDBDatabase:
    base_url: str
    database_name: str
    username: str | None = None
    password: str | None = None
    timeout: float = 5.0
    session: requests.Session = field(default_factory=requests.Session)

    def __post_init__(self) -> None:
        self.base_url = self.base_url.rstrip("/")

    @property
    def _database_url(self) -> str:
        return f"{self.base_url}/{quote(self.database_name, safe='')}"

    def _auth(self) -> tuple[str, str] | None:
        if self.username and self.password is not None:
            return (self.username, self.password)
        return None

    def ensure_database(self) -> None:
        response = self.session.put(
            self._database_url,
            auth=self._auth(),
            timeout=self.timeout,
        )
        if response.status_code not in {201, 202, 412}:
            response.raise_for_status()

    def write_document(self, doc_id: str, document: dict[str, Any]) -> dict[str, Any]:
        existing = self.read_document(doc_id)
        payload = dict(document)
        if existing and existing.get("_rev"):
            payload["_rev"] = existing["_rev"]

        response = self.session.put(
            f"{self._database_url}/{quote(doc_id, safe='')}",
            json=payload,
            auth=self._auth(),
            timeout=self.timeout,
        )
        if response.status_code not in {201, 202}:
            response.raise_for_status()

        saved = self.read_document(doc_id)
        if saved is None:
            raise RuntimeError(f"document_not_found_after_write:{doc_id}")
        return saved

    def read_document(self, doc_id: str) -> dict[str, Any] | None:
        response = self.session.get(
            f"{self._database_url}/{quote(doc_id, safe='')}",
            auth=self._auth(),
            timeout=self.timeout,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return dict(response.json())

    def find_documents(self, selector: dict[str, Any]) -> list[dict[str, Any]]:
        response = self.session.post(
            f"{self._database_url}/_find",
            json={"selector": selector},
            auth=self._auth(),
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        return [dict(document) for document in payload.get("docs", [])]


@dataclass
class InMemoryChatStore:
    sessions: dict[str, dict[str, Any]] = field(default_factory=dict)
    messages_by_session: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    handoffs_by_session: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    runs: dict[str, dict[str, Any]] = field(default_factory=dict)
    captures_by_session: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    def create_session(
        self,
        *,
        title: str,
        selected_agent: str,
        edit_policy: str,
        context_node_ids: list[str],
    ) -> dict[str, Any]:
        session_id = str(uuid4())
        timestamp = _utc_now()
        session = {
            "id": session_id,
            "title": title,
            "selectedAgent": selected_agent,
            "editPolicy": edit_policy,
            "contextNodeIds": list(context_node_ids),
            "createdAt": timestamp,
            "updatedAt": timestamp,
        }
        self.sessions[session_id] = session
        self.messages_by_session[session_id] = []
        self.handoffs_by_session[session_id] = []
        self.captures_by_session[session_id] = []
        return session

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        return self.sessions.get(session_id)

    def list_sessions(self) -> list[dict[str, Any]]:
        return sorted(
            self.sessions.values(),
            key=lambda session: session["updatedAt"],
            reverse=True,
        )

    def add_message(
        self,
        *,
        session_id: str,
        role: str,
        content: str,
        agent: str,
        block_type: str,
        context_ids: list[str],
        context_snapshot: list[dict[str, Any]],
    ) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if session is None:
            raise KeyError(f"session_not_found:{session_id}")

        message = {
            "id": str(uuid4()),
            "sessionId": session_id,
            "role": role,
            "content": content,
            "agent": agent,
            "blockType": block_type,
            "contextIds": list(context_ids),
            "contextSnapshot": list(context_snapshot),
            "createdAt": _utc_now(),
        }
        self.messages_by_session.setdefault(session_id, []).append(message)
        session["updatedAt"] = message["createdAt"]
        return message

    def list_messages(self, session_id: str) -> list[dict[str, Any]]:
        return list(self.messages_by_session.get(session_id, []))

    def get_message(self, session_id: str, message_id: str) -> dict[str, Any] | None:
        for message in self.messages_by_session.get(session_id, []):
            if message["id"] == message_id:
                return message
        return None

    def switch_agent(
        self,
        *,
        session_id: str,
        to_agent: str,
        server_summary: str,
        agent_summary: str | None,
        recent_message_ids: list[str],
    ) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if session is None:
            raise KeyError(f"session_not_found:{session_id}")

        handoff = {
            "id": str(uuid4()),
            "sessionId": session_id,
            "fromAgent": session["selectedAgent"],
            "toAgent": to_agent,
            "serverSummary": server_summary,
            "agentSummary": agent_summary,
            "recentMessageIds": list(recent_message_ids),
            "createdAt": _utc_now(),
        }
        self.handoffs_by_session.setdefault(session_id, []).append(handoff)
        session["selectedAgent"] = to_agent
        session["updatedAt"] = handoff["createdAt"]
        return handoff

    def list_handoffs(self, session_id: str) -> list[dict[str, Any]]:
        return list(self.handoffs_by_session.get(session_id, []))

    def update_edit_policy(self, *, session_id: str, edit_policy: str) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if session is None:
            raise KeyError(f"session_not_found:{session_id}")

        session["editPolicy"] = edit_policy
        session["updatedAt"] = _utc_now()
        return session

    def create_run(
        self,
        *,
        session_id: str,
        message_id: str,
        agent: str,
        edit_policy: str,
        status: str,
        adapter: str,
        started_at: str,
        ended_at: str | None,
    ) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if session is None:
            raise KeyError(f"session_not_found:{session_id}")

        run = {
            "id": str(uuid4()),
            "sessionId": session_id,
            "messageId": message_id,
            "agent": agent,
            "adapter": adapter,
            "editPolicy": edit_policy,
            "status": status,
            "startedAt": started_at,
            "endedAt": ended_at,
        }
        self.runs[str(run["id"])] = run
        session["updatedAt"] = ended_at or started_at
        return run

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        return self.runs.get(run_id)

    def update_run(
        self,
        *,
        run_id: str,
        status: str,
        ended_at: str | None,
    ) -> dict[str, Any]:
        run = self.runs.get(run_id)
        if run is None:
            raise KeyError(f"run_not_found:{run_id}")

        run["status"] = status
        run["endedAt"] = ended_at
        session = self.sessions.get(str(run["sessionId"]))
        if session is not None:
            session["updatedAt"] = ended_at or session["updatedAt"]
        return run

    def create_capture(
        self,
        *,
        session_id: str,
        source_message_ids: list[str],
        target_node_path: str,
        status: str,
    ) -> dict[str, Any]:
        session = self.sessions.get(session_id)
        if session is None:
            raise KeyError(f"session_not_found:{session_id}")

        capture = {
            "id": str(uuid4()),
            "sessionId": session_id,
            "sourceMessageIds": list(source_message_ids),
            "targetNodePath": target_node_path,
            "status": status,
            "createdAt": _utc_now(),
        }
        self.captures_by_session.setdefault(session_id, []).append(capture)
        session["updatedAt"] = capture["createdAt"]
        return capture

    def list_captures(self, session_id: str) -> list[dict[str, Any]]:
        return list(self.captures_by_session.get(session_id, []))


@dataclass
class CouchDBChatStore:
    database: DocumentDatabase

    def __post_init__(self) -> None:
        self.database.ensure_database()

    def _document_id(self, entity_type: str, entity_id: str) -> str:
        return f"chat_{entity_type}:{entity_id}"

    def _write_entity(
        self,
        *,
        entity_type: str,
        entity_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        document = self.database.write_document(
            self._document_id(entity_type, entity_id),
            {"type": entity_type, **payload},
        )
        stripped = _strip_document_metadata(document)
        if stripped is None:
            raise RuntimeError(f"document_write_failed:{entity_type}:{entity_id}")
        return stripped

    def _read_entity(self, *, entity_type: str, entity_id: str) -> dict[str, Any] | None:
        document = self.database.read_document(self._document_id(entity_type, entity_id))
        if document is None:
            return None
        if document.get("type") != entity_type:
            return None
        return _strip_document_metadata(document)

    def _find_entities(self, *, entity_type: str, selector: dict[str, Any]) -> list[dict[str, Any]]:
        documents = self.database.find_documents({"type": entity_type, **selector})
        return [
            stripped
            for stripped in (_strip_document_metadata(document) for document in documents)
            if stripped is not None
        ]

    def create_session(
        self,
        *,
        title: str,
        selected_agent: str,
        edit_policy: str,
        context_node_ids: list[str],
    ) -> dict[str, Any]:
        session_id = str(uuid4())
        timestamp = _utc_now()
        return self._write_entity(
            entity_type="session",
            entity_id=session_id,
            payload={
                "id": session_id,
                "title": title,
                "selectedAgent": selected_agent,
                "editPolicy": edit_policy,
                "contextNodeIds": list(context_node_ids),
                "createdAt": timestamp,
                "updatedAt": timestamp,
            },
        )

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        return self._read_entity(entity_type="session", entity_id=session_id)

    def list_sessions(self) -> list[dict[str, Any]]:
        sessions = self._find_entities(entity_type="session", selector={})
        return _sorted_documents(sessions, sort_key="updatedAt", reverse=True)

    def add_message(
        self,
        *,
        session_id: str,
        role: str,
        content: str,
        agent: str,
        block_type: str,
        context_ids: list[str],
        context_snapshot: list[dict[str, Any]],
    ) -> dict[str, Any]:
        session = self.get_session(session_id)
        if session is None:
            raise KeyError(f"session_not_found:{session_id}")

        created_at = _utc_now()
        message_id = str(uuid4())
        message = self._write_entity(
            entity_type="message",
            entity_id=message_id,
            payload={
                "id": message_id,
                "sessionId": session_id,
                "role": role,
                "content": content,
                "agent": agent,
                "blockType": block_type,
                "contextIds": list(context_ids),
                "contextSnapshot": list(context_snapshot),
                "createdAt": created_at,
            },
        )
        self._write_entity(
            entity_type="session",
            entity_id=session_id,
            payload={**session, "updatedAt": created_at},
        )
        return message

    def list_messages(self, session_id: str) -> list[dict[str, Any]]:
        messages = self._find_entities(entity_type="message", selector={"sessionId": session_id})
        return _sorted_documents(messages, sort_key="createdAt")

    def get_message(self, session_id: str, message_id: str) -> dict[str, Any] | None:
        message = self._read_entity(entity_type="message", entity_id=message_id)
        if message is None or str(message.get("sessionId")) != session_id:
            return None
        return message

    def switch_agent(
        self,
        *,
        session_id: str,
        to_agent: str,
        server_summary: str,
        agent_summary: str | None,
        recent_message_ids: list[str],
    ) -> dict[str, Any]:
        session = self.get_session(session_id)
        if session is None:
            raise KeyError(f"session_not_found:{session_id}")

        created_at = _utc_now()
        handoff_id = str(uuid4())
        handoff = self._write_entity(
            entity_type="handoff",
            entity_id=handoff_id,
            payload={
                "id": handoff_id,
                "sessionId": session_id,
                "fromAgent": session["selectedAgent"],
                "toAgent": to_agent,
                "serverSummary": server_summary,
                "agentSummary": agent_summary,
                "recentMessageIds": list(recent_message_ids),
                "createdAt": created_at,
            },
        )
        self._write_entity(
            entity_type="session",
            entity_id=session_id,
            payload={
                **session,
                "selectedAgent": to_agent,
                "updatedAt": created_at,
            },
        )
        return handoff

    def list_handoffs(self, session_id: str) -> list[dict[str, Any]]:
        handoffs = self._find_entities(entity_type="handoff", selector={"sessionId": session_id})
        return _sorted_documents(handoffs, sort_key="createdAt")

    def update_edit_policy(self, *, session_id: str, edit_policy: str) -> dict[str, Any]:
        session = self.get_session(session_id)
        if session is None:
            raise KeyError(f"session_not_found:{session_id}")

        updated_session = {
            **session,
            "editPolicy": edit_policy,
            "updatedAt": _utc_now(),
        }
        return self._write_entity(
            entity_type="session",
            entity_id=session_id,
            payload=updated_session,
        )

    def create_run(
        self,
        *,
        session_id: str,
        message_id: str,
        agent: str,
        edit_policy: str,
        status: str,
        adapter: str,
        started_at: str,
        ended_at: str | None,
    ) -> dict[str, Any]:
        session = self.get_session(session_id)
        if session is None:
            raise KeyError(f"session_not_found:{session_id}")

        run_id = str(uuid4())
        run = self._write_entity(
            entity_type="run",
            entity_id=run_id,
            payload={
                "id": run_id,
                "sessionId": session_id,
                "messageId": message_id,
                "agent": agent,
                "adapter": adapter,
                "editPolicy": edit_policy,
                "status": status,
                "startedAt": started_at,
                "endedAt": ended_at,
            },
        )
        self._write_entity(
            entity_type="session",
            entity_id=session_id,
            payload={**session, "updatedAt": ended_at or started_at},
        )
        return run

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        return self._read_entity(entity_type="run", entity_id=run_id)

    def update_run(
        self,
        *,
        run_id: str,
        status: str,
        ended_at: str | None,
    ) -> dict[str, Any]:
        run = self.get_run(run_id)
        if run is None:
            raise KeyError(f"run_not_found:{run_id}")

        updated_run = self._write_entity(
            entity_type="run",
            entity_id=run_id,
            payload={
                **run,
                "status": status,
                "endedAt": ended_at,
            },
        )
        session = self.get_session(str(run["sessionId"]))
        if session is not None:
            self._write_entity(
                entity_type="session",
                entity_id=str(run["sessionId"]),
                payload={**session, "updatedAt": ended_at or session["updatedAt"]},
            )
        return updated_run

    def create_capture(
        self,
        *,
        session_id: str,
        source_message_ids: list[str],
        target_node_path: str,
        status: str,
    ) -> dict[str, Any]:
        session = self.get_session(session_id)
        if session is None:
            raise KeyError(f"session_not_found:{session_id}")

        created_at = _utc_now()
        capture_id = str(uuid4())
        capture = self._write_entity(
            entity_type="capture",
            entity_id=capture_id,
            payload={
                "id": capture_id,
                "sessionId": session_id,
                "sourceMessageIds": list(source_message_ids),
                "targetNodePath": target_node_path,
                "status": status,
                "createdAt": created_at,
            },
        )
        self._write_entity(
            entity_type="session",
            entity_id=session_id,
            payload={**session, "updatedAt": created_at},
        )
        return capture

    def list_captures(self, session_id: str) -> list[dict[str, Any]]:
        captures = self._find_entities(entity_type="capture", selector={"sessionId": session_id})
        return _sorted_documents(captures, sort_key="createdAt")


@dataclass
class FileChatStore:
    """Vault 내 .synapsenote/chat/ 디렉토리에 세션을 JSON 파일로 영속 저장하는 스토어.

    디렉토리 레이아웃:
        <vault_root>/.synapsenote/chat/<session_id>.json
    각 파일에는 session 메타데이터, messages, handoffs, captures가 함께 저장된다.
    """

    vault_root: Path

    @property
    def _chat_dir(self) -> Path:
        d = self.vault_root / ".synapsenote" / "chat"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _session_path(self, session_id: str) -> Path:
        return self._chat_dir / f"{session_id}.json"

    def _read_session_file(self, session_id: str) -> dict[str, Any] | None:
        path = self._session_path(session_id)
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as f:
            fcntl.flock(f, fcntl.LOCK_SH)
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return None
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)

    def _write_session_file(self, session_id: str, data: dict[str, Any]) -> None:
        path = self._session_path(session_id)
        with open(path, "w", encoding="utf-8") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                json.dump(data, f, ensure_ascii=False, indent=2)
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)

    def _load_or_init(self, session_id: str) -> dict[str, Any]:
        data = self._read_session_file(session_id)
        if data is None:
            raise KeyError(f"session_not_found:{session_id}")
        return data

    def create_session(
        self,
        *,
        title: str,
        selected_agent: str,
        edit_policy: str,
        context_node_ids: list[str],
    ) -> dict[str, Any]:
        session_id = str(uuid4())
        timestamp = _utc_now()
        session = {
            "id": session_id,
            "title": title,
            "selectedAgent": selected_agent,
            "editPolicy": edit_policy,
            "contextNodeIds": list(context_node_ids),
            "createdAt": timestamp,
            "updatedAt": timestamp,
        }
        self._write_session_file(session_id, {
            "session": session,
            "messages": [],
            "handoffs": [],
            "captures": [],
        })
        return session

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        data = self._read_session_file(session_id)
        if data is None:
            return None
        return data["session"]

    def list_sessions(self) -> list[dict[str, Any]]:
        sessions = []
        for path in self._chat_dir.glob("*.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    fcntl.flock(f, fcntl.LOCK_SH)
                    try:
                        data = json.load(f)
                    finally:
                        fcntl.flock(f, fcntl.LOCK_UN)
                sessions.append(data["session"])
            except (json.JSONDecodeError, KeyError):
                continue
        return _sorted_documents(sessions, sort_key="updatedAt", reverse=True)

    def add_message(
        self,
        *,
        session_id: str,
        role: str,
        content: str,
        agent: str,
        block_type: str,
        context_ids: list[str],
        context_snapshot: list[dict[str, Any]],
    ) -> dict[str, Any]:
        data = self._load_or_init(session_id)
        created_at = _utc_now()
        message = {
            "id": str(uuid4()),
            "sessionId": session_id,
            "role": role,
            "content": content,
            "agent": agent,
            "blockType": block_type,
            "contextIds": list(context_ids),
            "contextSnapshot": list(context_snapshot),
            "createdAt": created_at,
        }
        data["messages"].append(message)
        data["session"]["updatedAt"] = created_at
        self._write_session_file(session_id, data)
        return message

    def list_messages(self, session_id: str) -> list[dict[str, Any]]:
        data = self._read_session_file(session_id)
        if data is None:
            return []
        return _sorted_documents(list(data["messages"]), sort_key="createdAt")

    def get_message(self, session_id: str, message_id: str) -> dict[str, Any] | None:
        data = self._read_session_file(session_id)
        if data is None:
            return None
        for message in data["messages"]:
            if message["id"] == message_id:
                return message
        return None

    def switch_agent(
        self,
        *,
        session_id: str,
        to_agent: str,
        server_summary: str,
        agent_summary: str | None,
        recent_message_ids: list[str],
    ) -> dict[str, Any]:
        data = self._load_or_init(session_id)
        created_at = _utc_now()
        handoff = {
            "id": str(uuid4()),
            "sessionId": session_id,
            "fromAgent": data["session"]["selectedAgent"],
            "toAgent": to_agent,
            "serverSummary": server_summary,
            "agentSummary": agent_summary,
            "recentMessageIds": list(recent_message_ids),
            "createdAt": created_at,
        }
        data["handoffs"].append(handoff)
        data["session"]["selectedAgent"] = to_agent
        data["session"]["updatedAt"] = created_at
        self._write_session_file(session_id, data)
        return handoff

    def list_handoffs(self, session_id: str) -> list[dict[str, Any]]:
        data = self._read_session_file(session_id)
        if data is None:
            return []
        return _sorted_documents(list(data["handoffs"]), sort_key="createdAt")

    def update_edit_policy(self, *, session_id: str, edit_policy: str) -> dict[str, Any]:
        data = self._load_or_init(session_id)
        data["session"]["editPolicy"] = edit_policy
        data["session"]["updatedAt"] = _utc_now()
        self._write_session_file(session_id, data)
        return data["session"]

    def create_run(
        self,
        *,
        session_id: str,
        message_id: str,
        agent: str,
        edit_policy: str,
        status: str,
        adapter: str,
        started_at: str,
        ended_at: str | None,
    ) -> dict[str, Any]:
        data = self._load_or_init(session_id)
        run = {
            "id": str(uuid4()),
            "sessionId": session_id,
            "messageId": message_id,
            "agent": agent,
            "adapter": adapter,
            "editPolicy": edit_policy,
            "status": status,
            "startedAt": started_at,
            "endedAt": ended_at,
        }
        data.setdefault("runs", {})[run["id"]] = run
        data["session"]["updatedAt"] = ended_at or started_at
        self._write_session_file(session_id, data)
        return run

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        for path in self._chat_dir.glob("*.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    fcntl.flock(f, fcntl.LOCK_SH)
                    try:
                        data = json.load(f)
                    finally:
                        fcntl.flock(f, fcntl.LOCK_UN)
                run = data.get("runs", {}).get(run_id)
                if run is not None:
                    return run
            except (json.JSONDecodeError, KeyError):
                continue
        return None

    def update_run(
        self,
        *,
        run_id: str,
        status: str,
        ended_at: str | None,
    ) -> dict[str, Any]:
        for path in self._chat_dir.glob("*.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    fcntl.flock(f, fcntl.LOCK_SH)
                    try:
                        data = json.load(f)
                    finally:
                        fcntl.flock(f, fcntl.LOCK_UN)
                runs = data.get("runs", {})
                if run_id not in runs:
                    continue
                runs[run_id]["status"] = status
                runs[run_id]["endedAt"] = ended_at
                session_id = runs[run_id]["sessionId"]
                data["session"]["updatedAt"] = ended_at or data["session"]["updatedAt"]
                self._write_session_file(session_id, data)
                return runs[run_id]
            except (json.JSONDecodeError, KeyError):
                continue
        raise KeyError(f"run_not_found:{run_id}")

    def create_capture(
        self,
        *,
        session_id: str,
        source_message_ids: list[str],
        target_node_path: str,
        status: str,
    ) -> dict[str, Any]:
        data = self._load_or_init(session_id)
        created_at = _utc_now()
        capture = {
            "id": str(uuid4()),
            "sessionId": session_id,
            "sourceMessageIds": list(source_message_ids),
            "targetNodePath": target_node_path,
            "status": status,
            "createdAt": created_at,
        }
        data["captures"].append(capture)
        data["session"]["updatedAt"] = created_at
        self._write_session_file(session_id, data)
        return capture

    def list_captures(self, session_id: str) -> list[dict[str, Any]]:
        data = self._read_session_file(session_id)
        if data is None:
            return []
        return _sorted_documents(list(data["captures"]), sort_key="createdAt")


def build_chat_store() -> InMemoryChatStore | FileChatStore | CouchDBChatStore:
    backend = os.environ.get("SYNAPSENOTE_CHAT_STORE", "file").strip().lower() or "file"
    if backend == "in_memory":
        return InMemoryChatStore()

    if backend == "file":
        vault_root = Path(os.environ.get("VAULT_ROOT", "/vault")).resolve()
        return FileChatStore(vault_root=vault_root)

    if backend != "couchdb":
        raise ValueError(f"unsupported_chat_store:{backend}")

    return CouchDBChatStore(
        database=RequestsCouchDBDatabase(
            base_url=os.environ.get("COUCHDB_URL", "http://couchdb:5984"),
            database_name=os.environ.get("SYNAPSENOTE_CHAT_DB", "synapsenote_chat"),
            username=os.environ.get("COUCHDB_USER") or None,
            password=os.environ.get("COUCHDB_PASSWORD") or None,
        )
    )
