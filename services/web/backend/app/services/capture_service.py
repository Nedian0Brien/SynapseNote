from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .chat_service import ChatService
from .node_service import get_vault_root


def _safe_stem(value: str) -> str:
    return value.replace("/", " ").replace("\\", " ").strip() or "capture"


@dataclass
class CaptureService:
    chat_service: ChatService

    def capture_messages(
        self,
        *,
        session_id: str,
        source_message_ids: list[str],
        title: str,
        directory: str,
    ) -> dict[str, object]:
        session = self.chat_service.get_session(session_id)
        if session is None:
            raise KeyError(f"session_not_found:{session_id}")

        messages: list[dict[str, object]] = []
        for message_id in source_message_ids:
            message = self.chat_service.get_message(session_id, message_id)
            if message is None:
                raise KeyError(f"message_not_found:{message_id}")
            messages.append(message)

        safe_title = _safe_stem(title)
        safe_directory = directory.strip().strip("/") if directory.strip() else ""
        relative_path = f"{safe_directory}/{safe_title}.md" if safe_directory else f"{safe_title}.md"

        vault_root = get_vault_root()
        target_path = vault_root / Path(relative_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        content_lines = [f"# {safe_title}", ""]
        for message in messages:
            content_lines.append(str(message["content"]))
            content_lines.append("")
        target_path.write_text("\n".join(content_lines).strip() + "\n", encoding="utf-8")

        capture = self.chat_service.create_capture(
            session_id=session_id,
            source_message_ids=source_message_ids,
            target_node_path=relative_path,
            status="saved",
        )

        self.chat_service.add_message(
            session_id=session_id,
            role="system",
            content=relative_path,
            agent=str(session["selectedAgent"]),
            block_type="saved_as_node",
            context_ids=[],
            context_snapshot=[],
        )

        return {
            "id": capture["id"],
            "sessionId": session_id,
            "sourceMessageIds": list(source_message_ids),
            "targetNodePath": relative_path,
            "status": "saved",
            "createdAt": capture["createdAt"],
        }
