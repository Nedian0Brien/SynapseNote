from __future__ import annotations

from .base import AgentAdapter


class ClaudeCodeAdapter(AgentAdapter):
    def __init__(self) -> None:
        super().__init__(name="claude_code")
