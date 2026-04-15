from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .chat_store import build_chat_store


@dataclass
class ChatService:
    store: Any = field(default_factory=build_chat_store)

    def create_session(
        self,
        *,
        title: str,
        selected_agent: str,
        edit_policy: str,
        context_node_ids: list[str],
    ) -> dict[str, Any]:
        return self.store.create_session(
            title=title,
            selected_agent=selected_agent,
            edit_policy=edit_policy,
            context_node_ids=context_node_ids,
        )

    def list_sessions(self) -> list[dict[str, Any]]:
        return self.store.list_sessions()

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        return self.store.get_session(session_id)

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
        return self.store.add_message(
            session_id=session_id,
            role=role,
            content=content,
            agent=agent,
            block_type=block_type,
            context_ids=context_ids,
            context_snapshot=context_snapshot,
        )

    def list_messages(self, session_id: str) -> list[dict[str, Any]]:
        return self.store.list_messages(session_id)

    def get_message(self, session_id: str, message_id: str) -> dict[str, Any] | None:
        return self.store.get_message(session_id, message_id)

    def update_edit_policy(self, *, session_id: str, edit_policy: str) -> dict[str, Any]:
        return self.store.update_edit_policy(
            session_id=session_id,
            edit_policy=edit_policy,
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
        return self.store.create_run(
            session_id=session_id,
            message_id=message_id,
            agent=agent,
            edit_policy=edit_policy,
            status=status,
            adapter=adapter,
            started_at=started_at,
            ended_at=ended_at,
        )

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        return self.store.get_run(run_id)

    def update_run(
        self,
        *,
        run_id: str,
        status: str,
        ended_at: str | None,
    ) -> dict[str, Any]:
        return self.store.update_run(
            run_id=run_id,
            status=status,
            ended_at=ended_at,
        )

    def create_capture(
        self,
        *,
        session_id: str,
        source_message_ids: list[str],
        target_node_path: str,
        status: str,
    ) -> dict[str, Any]:
        return self.store.create_capture(
            session_id=session_id,
            source_message_ids=source_message_ids,
            target_node_path=target_node_path,
            status=status,
        )

    def list_captures(self, session_id: str) -> list[dict[str, Any]]:
        return self.store.list_captures(session_id)

    def switch_agent(
        self,
        *,
        session_id: str,
        to_agent: str,
        server_summary: str | None,
        agent_summary: str | None,
        recent_message_ids: list[str],
    ) -> dict[str, Any]:
        session = self.store.get_session(session_id)
        if session is None:
            raise KeyError(f"session_not_found:{session_id}")

        resolved_server_summary = (server_summary or "").strip() or self._build_server_summary(
            session_id=session_id
        )
        handoff = self.store.switch_agent(
            session_id=session_id,
            to_agent=to_agent,
            server_summary=resolved_server_summary,
            agent_summary=agent_summary,
            recent_message_ids=recent_message_ids,
        )
        return {
            "session": session,
            "handoff": handoff,
        }

    def _build_server_summary(self, *, session_id: str) -> str:
        session = self.store.get_session(session_id)
        messages = self.store.list_messages(session_id)
        recent_contents = [message["content"] for message in messages[-3:] if message.get("content")]
        context_ids = session.get("contextNodeIds", []) if session else []

        summary_parts: list[str] = []
        if recent_contents:
            summary_parts.append("최근 대화: " + " / ".join(recent_contents))
        if context_ids:
            summary_parts.append("활성 컨텍스트: " + ", ".join(context_ids))

        if not summary_parts:
            return "이전 대화 요약이 없어 새 에이전트가 빈 상태에서 시작한다."

        return " | ".join(summary_parts)
