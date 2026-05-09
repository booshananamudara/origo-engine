"""
Admin authentication endpoints.

POST /admin/auth/login    — exchange credentials for JWT tokens
POST /admin/auth/refresh  — exchange a refresh token for a new access token
GET  /admin/auth/me       — return the current admin's profile
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_dependencies import get_current_admin
from app.db import get_db
from app.models.admin_user import AdminUser
from app.services.auth_service import (
    authenticate_admin,
    create_access_token,
    create_refresh_token,
    decode_token,
)

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


# ── Request / Response schemas ────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    role: str

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: AdminUserOut


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    admin = await authenticate_admin(db, body.email, body.password)
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    return LoginResponse(
        access_token=create_access_token(str(admin.id), admin.role),
        refresh_token=create_refresh_token(str(admin.id)),
        user=AdminUserOut.model_validate(admin),
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(body: RefreshRequest) -> RefreshResponse:
    payload = decode_token(body.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expected a refresh token",
        )

    # Re-issue access token — role is not stored in refresh token so we
    # default to analyst; the client should call /me to get the current role.
    # For simplicity in this PoC we encode a placeholder — a production
    # implementation would look up the user to get the current role.
    return RefreshResponse(
        access_token=create_access_token(payload["sub"], "analyst"),
    )


@router.get("/me", response_model=AdminUserOut)
async def me(admin: AdminUser = Depends(get_current_admin)) -> AdminUserOut:
    return AdminUserOut.model_validate(admin)
