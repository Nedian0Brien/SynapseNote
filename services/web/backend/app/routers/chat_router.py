from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from starlette.responses import Response

from app.schemas import (
    ChatAgentSwitchPayload,
    ChatCaptureCreatePayload,
    ChatEditPolicyPayload,
    ChatMessageCreatePayload,
    ChatRunApprovalPayload,
    ChatRunCreatePayload,
    ChatSessionCreatePayload,
)
from app.services.chat_service import ChatService
from app.services.chat_runtime import ChatRuntime
from app.services.capture_service import CaptureService


def create_chat_router(
    chat_service: ChatService,
    chat_runtime: ChatRuntime,
    capture_service: CaptureService,
) -> APIRouter:
    r = APIRouter(prefix="/api/chat")

    @r.post("/sessions")
    async def create_chat_session(
        payload: ChatSessionCreatePayload, request: Request,
    ) -> dict[str, object]:
        user_id = request.session.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="unauthorized")

        session = chat_service.create_session(
            title=payload.title,
            selected_agent=payload.selectedAgent,
            edit_policy=payload.editPolicy,
            context_node_ids=payload.contextNodeIds,
        )
        return {"success": True, "data": session, "meta": {}}

    @r.get("/sessions")
    async def list_chat_sessions(request: Request) -> dict[str, object]:
        user_id = request.session.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="unauthorized")

        sessions = chat_service.list_sessions()
        return {"success": True, "data": sessions, "meta": {"total": len(sessions)}}

    @r.get("/sessions/{session_id}")
    async def get_chat_session(session_id: str, request: Request) -> dict[str, object]:
        user_id = request.session.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="unauthorized")

        session = chat_service.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="session_not_found")

        return {"success": True, "data": session, "meta": {}}

    @r.post("/sessions/{session_id}/messages")
    async def create_chat_message(
        session_id: str, payload: ChatMessageCreatePayload, request: Request,
    ) -> dict[str, object]:
        user_id = request.session.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="unauthorized")

        session = chat_service.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="session_not_found")

        message = chat_service.add_message(
            session_id=session_id,
            role=payload.role,
            content=payload.content,
            agent=payload.agent,
            block_type=payload.blockType,
            context_ids=payload.contextIds,
            context_snapshot=payload.contextSnapshot,
        )
        return {"success": True, "data": message, "meta": {}}

    @r.get("/sessions/{session_id}/messages")
    async def list_chat_messages(session_id: str, request: Request) -> dict[str, object]:
        user_id = request.session.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="unauthorized")

        session = chat_service.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="session_not_found")

        messages = chat_service.list_messages(session_id)
        return {"success": True, "data": messages, "meta": {"total": len(messages)}}

    @r.post("/sessions/{session_id}/agent")
    async def switch_chat_agent(
        session_id: str, payload: ChatAgentSwitchPayload, request: Request,
    ) -> dict[str, object]:
        user_id = request.session.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="unauthorized")

        session = chat_service.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="session_not_found")

        result = chat_service.switch_agent(
            session_id=session_id,
            to_agent=payload.toAgent,
            server_summary=payload.serverSummary,
            agent_summary=payload.agentSummary,
            recent_message_ids=payload.recentMessageIds,
        )
        return {"success": True, "data": result, "meta": {}}

    @r.post("/sessions/{session_id}/policy")
    async def update_chat_edit_policy(
        session_id: str, payload: ChatEditPolicyPayload, request: Request,
    ) -> dict[str, object]:
        user_id = request.session.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="unauthorized")

        session = chat_service.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="session_not_found")

        updated_session = chat_service.update_edit_policy(
            session_id=session_id, edit_policy=payload.editPolicy,
        )
        return {"success": True, "data": updated_session, "meta": {}}

    @r.post("/sessions/{session_id}/runs")
    async def create_chat_run(
        session_id: str, payload: ChatRunCreatePayload, request: Request,
    ) -> dict[str, object]:
        user_id = request.session.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="unauthorized")

        session = chat_service.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="session_not_found")

        run = chat_runtime.create_run(
            session_id=session_id,
            message_id=payload.messageId,
            agent=payload.agent,
            edit_policy=str(session["editPolicy"]),
        )
        return {"success": True, "data": run, "meta": {}}

    @r.get("/runs/{run_id}/stream")
    async def stream_chat_run(run_id: str, request: Request) -> Response:
        user_id = request.session.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="unauthorized")

        run = chat_runtime.get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="run_not_found")

        return Response(chat_runtime.stream(run_id), media_type="text/event-stream")

    @r.post("/runs/{run_id}/approvals")
    async def resolve_chat_run_approval(
        run_id: str, payload: ChatRunApprovalPayload, request: Request,
    ) -> dict[str, object]:
        user_id = request.session.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="unauthorized")

        run = chat_runtime.get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="run_not_found")

        try:
            result = chat_runtime.resolve_approval(run_id=run_id, action=payload.action)
        except KeyError as error:
            detail = str(error)
            if detail.startswith("'approval_not_found:"):
                raise HTTPException(status_code=404, detail="approval_not_found") from error
            raise HTTPException(status_code=400, detail="unsupported_action") from error

        return {"success": True, "data": result, "meta": {}}

    @r.post("/captures")
    async def create_chat_capture(
        payload: ChatCaptureCreatePayload, request: Request,
    ) -> dict[str, object]:
        user_id = request.session.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="unauthorized")

        try:
            record = capture_service.capture_messages(
                session_id=payload.sessionId,
                source_message_ids=payload.sourceMessageIds,
                title=payload.title,
                directory=payload.directory,
            )
        except KeyError as error:
            detail = str(error)
            if detail.startswith("'session_not_found:"):
                raise HTTPException(status_code=404, detail="session_not_found") from error
            raise HTTPException(status_code=404, detail="message_not_found") from error

        return {"success": True, "data": record, "meta": {}}

    return r
