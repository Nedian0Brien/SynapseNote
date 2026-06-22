from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.schemas import LoginPayload

router = APIRouter()


def create_auth_router(user_id: str, password: str) -> APIRouter:
    r = APIRouter()

    @r.post("/auth/login")
    async def login(payload: LoginPayload, request: Request) -> dict[str, object]:
        if payload.userId != user_id or payload.password != password:
            raise HTTPException(status_code=401, detail="invalid_credentials")
        request.session["user_id"] = user_id
        return {"ok": True, "user": {"id": user_id}}

    @r.post("/auth/logout")
    async def logout(request: Request) -> dict[str, bool]:
        request.session.clear()
        return {"ok": True}

    @r.get("/auth/me")
    async def get_current_user(request: Request) -> dict[str, object]:
        uid = request.session.get("user_id")
        if not uid:
            raise HTTPException(status_code=401, detail="unauthorized")
        return {"user": {"id": str(uid)}}

    return r
