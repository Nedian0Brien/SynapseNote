from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .agent_adapters import ClaudeCodeAdapter, CodexCliAdapter, GeminiCliAdapter
from .chat_service import ChatService


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_sse(event_type: str, payload: dict[str, Any]) -> str:
    return (
        f"event: {event_type}\n"
        f"data: {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
    )


@dataclass
class ChatRuntime:
    chat_service: ChatService | None = None
    runs: dict[str, dict[str, Any]] = field(default_factory=dict)
    events_by_run: dict[str, list[str]] = field(default_factory=dict)
    pending_approvals_by_run: dict[str, dict[str, Any]] = field(default_factory=dict)
    adapters: dict[str, Any] = field(
        default_factory=lambda: {
            "claude_code": ClaudeCodeAdapter(),
            "codex_cli": CodexCliAdapter(),
            "gemini_cli": GeminiCliAdapter(),
        }
    )

    def _build_event(
        self,
        *,
        event_type: str,
        run_id: str,
        session_id: str,
        agent: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "runId": run_id,
            "sessionId": session_id,
            "agent": agent,
            "timestamp": _utc_now(),
            "type": event_type,
            "payload": payload,
        }

    def _append_event(self, run_id: str, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        run = self.runs[run_id]
        event = self._build_event(
            event_type=event_type,
            run_id=run_id,
            session_id=str(run["sessionId"]),
            agent=str(run["agent"]),
            payload=payload,
        )
        self.events_by_run.setdefault(run_id, []).append(_to_sse(event_type, event))
        return event

    def create_run(
        self,
        *,
        session_id: str,
        message_id: str,
        agent: str,
        edit_policy: str,
    ) -> dict[str, Any]:
        started_at = _utc_now()
        adapter = self.adapters.get(agent)
        if adapter is None:
            raise KeyError(f"adapter_not_found:{agent}")
        status = "pending_approval" if edit_policy == "approval_required" else "completed"
        ended_at = None if status == "pending_approval" else _utc_now()
        if self.chat_service is not None:
            run = self.chat_service.create_run(
                session_id=session_id,
                message_id=message_id,
                agent=agent,
                edit_policy=edit_policy,
                status=status,
                adapter=adapter.name,
                started_at=started_at,
                ended_at=ended_at,
            )
        else:
            run_id = str(uuid4())
            run = {
                "id": run_id,
                "sessionId": session_id,
                "messageId": message_id,
                "agent": agent,
                "adapter": adapter.name,
                "editPolicy": edit_policy,
                "status": status,
                "startedAt": started_at,
                "endedAt": ended_at,
            }
        run_id = str(run["id"])
        self.runs[run_id] = run
        self.events_by_run[run_id] = []
        self._append_event(
            run_id=run_id,
            event_type="run_started",
            payload={"messageId": message_id, "adapter": adapter.name},
        )
        for event_type, payload in adapter.normalized_events(
            run_id=run_id,
            session_id=session_id,
            message_id=message_id,
        ):
            self.events_by_run[run_id].append(_to_sse(event_type, payload))
        if edit_policy == "approval_required":
            approval_id = str(uuid4())
            self.pending_approvals_by_run[run_id] = {
                "approvalId": approval_id,
                "adapter": adapter.name,
                "path": "vault://pending-change.md",
                "summary": "에이전트가 파일 변경 승인을 요청했다.",
                "status": "pending",
            }
            self._append_event(
                run_id=run_id,
                event_type="proposed_change",
                payload={
                    "approvalId": approval_id,
                    "adapter": adapter.name,
                    "path": "vault://pending-change.md",
                    "summary": "에이전트가 파일 변경 승인을 요청했다.",
                    "status": "pending",
                },
            )
        elif edit_policy == "auto_apply":
            self._append_event(
                run_id=run_id,
                event_type="file_change",
                payload={
                    "adapter": adapter.name,
                    "path": "vault://auto-applied.md",
                    "summary": "에이전트가 파일 변경을 자동 반영했다.",
                },
            )
            self._append_event(
                run_id=run_id,
                event_type="run_completed",
                payload={"status": "completed", "adapter": adapter.name},
            )
        return run

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        return self.runs.get(run_id)

    def resolve_approval(self, *, run_id: str, action: str) -> dict[str, Any]:
        run = self.runs.get(run_id)
        if run is None:
            raise KeyError(f"run_not_found:{run_id}")

        pending = self.pending_approvals_by_run.get(run_id)
        if pending is None:
            raise KeyError(f"approval_not_found:{run_id}")

        if action == "approve":
            pending["status"] = "approved"
            ended_at = _utc_now()
            if self.chat_service is not None:
                run = self.chat_service.update_run(
                    run_id=run_id,
                    status="completed",
                    ended_at=ended_at,
                )
            else:
                run["status"] = "completed"
                run["endedAt"] = ended_at
            event = self._append_event(
                run_id=run_id,
                event_type="file_change",
                payload={
                    "approvalId": pending["approvalId"],
                    "adapter": pending["adapter"],
                    "path": pending["path"],
                    "summary": "승인 후 파일 변경을 반영했다.",
                },
            )
            self._append_event(
                run_id=run_id,
                event_type="run_completed",
                payload={"status": "completed", "adapter": pending["adapter"]},
            )
            del self.pending_approvals_by_run[run_id]
            return {"run": run, "event": event}

        if action == "reject":
            pending["status"] = "rejected"
            ended_at = _utc_now()
            if self.chat_service is not None:
                run = self.chat_service.update_run(
                    run_id=run_id,
                    status="rejected",
                    ended_at=ended_at,
                )
            else:
                run["status"] = "rejected"
                run["endedAt"] = ended_at
            event = self._append_event(
                run_id=run_id,
                event_type="change_rejected",
                payload={
                    "approvalId": pending["approvalId"],
                    "adapter": pending["adapter"],
                    "path": pending["path"],
                    "summary": "사용자가 파일 변경을 거절했다.",
                },
            )
            del self.pending_approvals_by_run[run_id]
            return {"run": run, "event": event}

        raise KeyError(f"unsupported_action:{action}")

    def stream(self, run_id: str) -> str:
        return "".join(self.events_by_run.get(run_id, []))
