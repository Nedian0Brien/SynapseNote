"""Pydantic request/response models for API endpoints."""
from __future__ import annotations

from pydantic import BaseModel


class LoginPayload(BaseModel):
    userId: str
    password: str


class ContextAddPayload(BaseModel):
    nodeIds: list[str]


class ChatSessionCreatePayload(BaseModel):
    title: str
    selectedAgent: str
    editPolicy: str
    contextNodeIds: list[str]


class ChatMessageCreatePayload(BaseModel):
    role: str
    content: str
    agent: str
    blockType: str
    contextIds: list[str]
    contextSnapshot: list[dict]


class ChatAgentSwitchPayload(BaseModel):
    toAgent: str
    serverSummary: str | None = None
    agentSummary: str | None = None
    recentMessageIds: list[str]


class ChatEditPolicyPayload(BaseModel):
    editPolicy: str


class ChatRunCreatePayload(BaseModel):
    messageId: str
    agent: str


class ChatRunApprovalPayload(BaseModel):
    action: str


class ChatCaptureCreatePayload(BaseModel):
    sessionId: str
    sourceMessageIds: list[str]
    title: str
    directory: str = ""


class DocumentWritePayload(BaseModel):
    content: str
