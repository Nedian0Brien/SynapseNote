from __future__ import annotations

from .base import AgentAdapter


class GeminiCliAdapter(AgentAdapter):
    def __init__(self) -> None:
        super().__init__(name="gemini_cli")
