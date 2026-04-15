from __future__ import annotations

from .base import AgentAdapter


class CodexCliAdapter(AgentAdapter):
    def __init__(self) -> None:
        super().__init__(name="codex_cli")
