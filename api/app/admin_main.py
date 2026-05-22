"""
Origo Engine — Admin API Service

Serves all /admin/* routes.
Connects to PostgreSQL as origo_admin (BYPASSRLS).
Runs Alembic migrations on startup — this is the ONLY service that does so.
Runs the inline scheduler (replaces the in-process scheduler from main.py).

Database credential: DATABASE_URL_ADMIN (origo_admin, BYPASSRLS)
CORS: allows only ADMIN_FRONTEND_URL

To run locally (port 8001):
    uvicorn app.admin_main:app --port 8001 --reload
"""
import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import get_db, get_admin_db

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("admin_api_startup", service_role="admin")

    scheduler_task = None
    if settings.scheduler_enabled:
        from app.services.inline_scheduler import run_scheduler_loop
        scheduler_task = asyncio.create_task(run_scheduler_loop())
        logger.info("inline_scheduler_enabled")

    yield

    if scheduler_task is not None:
        scheduler_task.cancel()
        await asyncio.gather(scheduler_task, return_exceptions=True)
    logger.info("admin_api_shutdown")


app = FastAPI(
    title="Origo Engine — Admin API",
    description="GEO monitoring platform — admin interface",
    version="0.2.0",
    lifespan=lifespan,
)

# ── CORS: admin frontend only ─────────────────────────────────────────────────
# In production this is the single admin domain. In local dev it's localhost:5174.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.admin_frontend_url,
        # Local dev fallbacks
        "http://localhost:5174",
        "http://localhost:8001",
        # Production admin domains
        "https://origo-admin-production.up.railway.app",
        "https://origo-admin-production.up.railway.app/",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Dependency override: all get_db() calls use the admin engine ──────────────
# This means every admin route that uses Depends(get_db) automatically gets
# an origo_admin session (BYPASSRLS) without changing each route file.
app.dependency_overrides[get_db] = get_admin_db

# ── Admin routes only — NO client routes imported here ───────────────────────
from app.api.admin_auth import router as admin_auth_router
from app.api.admin_client_users import router as admin_client_users_router
from app.api.admin_clients import router as admin_clients_router
from app.api.admin_platforms import router as admin_platforms_router
from app.api.admin_competitors import router as admin_competitors_router
from app.api.admin_knowledge_base import router as admin_kb_router
from app.api.admin_prompts import router as admin_prompts_router
from app.api.admin_recommendations import router as admin_recommendations_router
from app.api.admin_runs import router as admin_runs_router
from app.api.admin_scheduler import client_schedule_router, scheduler_router

app.include_router(admin_auth_router)
app.include_router(admin_clients_router)
app.include_router(admin_platforms_router)
app.include_router(admin_competitors_router)
app.include_router(admin_kb_router)
app.include_router(admin_runs_router)
app.include_router(admin_prompts_router)
app.include_router(admin_client_users_router)
app.include_router(client_schedule_router)
app.include_router(scheduler_router)
app.include_router(admin_recommendations_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "origo-admin-api"}
