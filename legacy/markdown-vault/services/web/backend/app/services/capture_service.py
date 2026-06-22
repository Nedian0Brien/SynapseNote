from __future__ import annotations

from dataclasses import dataclass

from app.indexer.vault_indexer import VaultIndexer

from .chat_service import ChatService
from .vault_paths import resolve_vault_path


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
        append_to_path: str | None = None,
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
        if append_to_path:
            relative_path = append_to_path.strip().strip("/")
        else:
            safe_directory = directory.strip().strip("/") if directory.strip() else ""
            relative_path = f"{safe_directory}/{safe_title}.md" if safe_directory else f"{safe_title}.md"

        target_path = resolve_vault_path(relative_path, require_markdown=True)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        content_lines = [f"# {safe_title}", ""] if not append_to_path else ["", f"## {safe_title}", ""]
        for message in messages:
            content_lines.append(str(message["content"]))
            content_lines.append("")
        content = "\n".join(content_lines).strip() + "\n"
        if append_to_path and target_path.exists():
            with target_path.open("a", encoding="utf-8") as file:
                file.write("\n" + content)
        else:
            target_path.write_text(content, encoding="utf-8")

        VaultIndexer().update_node(target_path)

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
            "mode": "append" if append_to_path else "create",
            "createdAt": capture["createdAt"],
        }
