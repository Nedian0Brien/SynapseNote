from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class AgentAdapter:
    name: str

    def normalized_events(self, *, run_id: str, session_id: str, message_id: str) -> list[tuple[str, dict[str, Any]]]:
        timestamp = utc_now()
        return [
            (
                "agent_thinking",
                {
                    "runId": run_id,
                    "sessionId": session_id,
                    "agent": self.name,
                    "timestamp": timestamp,
                    "type": "agent_thinking",
                    "payload": {
                        "messageId": message_id,
                        "adapter": self.name,
                    },
                },
            )
        ]
