"""
FastAPI dependencies for client dashboard authentication.

SECURITY NOTES:
- Client JWTs (type='client') are NEVER accepted on admin endpoints.
- Admin JWTs (type='admin') are NEVER accepted on client dashboard endpoints.
- The client_id comes ONLY from the JWT — never from URL params or the request body.
"""
import uuid

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.client import Client
from app.models.client_user import ClientUser
from app.services.auth_service import decode_token


async def get_current_client_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ClientUser:
    """
    Extract and validate a client Bearer JWT.
    Rejects admin tokens (type != 'client').
    Sets request.state.client_id for downstream use.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing or malformed",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header.removeprefix("Bearer ").strip()
    payload = decode_token(token)

    if payload.get("type") != "client":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expected a client token — admin tokens are not accepted here",
        )

    client_id_str = payload.get("client_id")
    user_id_str = payload.get("sub")
    try:
        user_id = uuid.UUID(user_id_str)
        client_id = uuid.UUID(client_id_str)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
        )

    # Validate user exists and is active
    user = (
        await db.execute(
            select(ClientUser).where(
                ClientUser.id == user_id,
                ClientUser.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Validate the client (from JWT) exists and is not archived
    client = (
        await db.execute(select(Client).where(Client.id == client_id))
    ).scalar_one_or_none()

    if client is None or client.status == "archived":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Client account is unavailable",
        )

    # Store client_id on request state — downstream dependencies read from here
    request.state.client_id = str(client_id)
    request.state.client_name = client.name

    return user


def get_client_id_from_token(request: Request) -> str:
    """
    Returns the client_id set by get_current_client_user.
    Use as a FastAPI Depends in endpoint signatures.

    CRITICAL: This is the ONLY authorised source of client_id in dashboard
    endpoints. Never read client_id from URL parameters or the request body.
    """
    client_id = getattr(request.state, "client_id", None)
    if client_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="client_id not available — ensure get_current_client_user runs first",
        )
    return client_id
