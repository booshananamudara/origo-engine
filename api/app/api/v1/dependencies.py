"""
Auth + error handling for the /v1 Audit API.

Auth is a stopgap for staging: a single shared static token per environment,
sent as ``X-API-Key: <token>`` and compared against ``settings.audit_api_key``.
Per-environment key management / rotation is out of scope for M1 (that's M2).

Errors follow the /v1 contract: standard HTTP status codes with a body of
``{"error": {"code", "message", "details"}}``. These handlers are scoped to the
/v1 path so the existing admin/JWT routes keep FastAPI's default error format.
"""
import hmac

import structlog
from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import settings

logger = structlog.get_logger()

_API_KEY_HEADER = "X-API-Key"


class V1Error(Exception):
    """A /v1 error rendered as {"error": {code, message, details}}."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict | list | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)


def _error_body(code: str, message: str, details=None) -> dict:
    return {"error": {"code": code, "message": message, "details": details}}


# ── Auth dependency ───────────────────────────────────────────────────────────

async def require_api_key(request: Request) -> None:
    """Validate the X-API-Key header against the configured shared token.

    Raises V1Error(401) if the token is missing, malformed, or does not match.
    If no token is configured for this environment, all /v1 requests are
    rejected (fail closed).
    """
    configured = settings.audit_api_key or ""
    if not configured:
        logger.warning("v1_api_key_not_configured")
        raise V1Error(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="unauthorized",
            message="Audit API is not configured for this environment.",
        )

    presented = request.headers.get(_API_KEY_HEADER, "")
    # Constant-time comparison to avoid leaking the token via timing.
    if not presented or not hmac.compare_digest(presented, configured):
        raise V1Error(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="unauthorized",
            message=f"Missing or invalid {_API_KEY_HEADER} header.",
        )


# ── Exception handlers (registered on the app, path-scoped to /v1) ────────────

async def v1_error_handler(request: Request, exc: V1Error) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(exc.code, exc.message, exc.details),
    )


async def v1_validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Reformat request-validation errors for /v1 only.

    Non-/v1 routes fall back to FastAPI's default 422 body so existing admin
    behaviour is unchanged.
    """
    if not request.url.path.startswith("/v1"):
        # Mirror FastAPI's default response for everything else.
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": exc.errors()},
        )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_error_body(
            "validation_error",
            "Request body failed validation.",
            details=[
                {"loc": list(e.get("loc", [])), "msg": e.get("msg"), "type": e.get("type")}
                for e in exc.errors()
            ],
        ),
    )


def register_v1_error_handlers(app) -> None:
    """Attach the /v1 error handlers to a FastAPI app (additive)."""
    app.add_exception_handler(V1Error, v1_error_handler)
    app.add_exception_handler(RequestValidationError, v1_validation_exception_handler)
