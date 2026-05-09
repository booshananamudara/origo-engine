import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin_auth import router as admin_auth_router
from app.api.admin_clients import router as admin_clients_router
from app.api.admin_competitors import router as admin_competitors_router
from app.api.admin_knowledge_base import router as admin_kb_router
from app.api.admin_prompts import router as admin_prompts_router
from app.api.admin_runs import router as admin_runs_router
from app.api.dev import router as dev_router
from app.api.prompts import router as prompts_router
from app.api.runs import router as runs_router
from app.config import settings

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()

app = FastAPI(
    title="Origo Engine API",
    description="GEO monitoring platform",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Local dev — client dashboard
        "http://localhost:5173",
        "http://localhost:3000",
        # Local dev — admin frontend
        "http://localhost:5174",
        # Production — client dashboard
        "https://origo-web-poc.up.railway.app",
        "https://origo-poc.up.railway.app",
        # Production — admin frontend
        "https://origo-admin-production.up.railway.app",
        "https://origo-admin-production.up.railway.app/",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Existing public/client-facing routes ──────────────────────────────────────
app.include_router(runs_router)
app.include_router(prompts_router)
app.include_router(dev_router)

# ── Admin routes (all require JWT via get_current_admin) ──────────────────────
app.include_router(admin_auth_router)
app.include_router(admin_clients_router)
app.include_router(admin_competitors_router)
app.include_router(admin_kb_router)
app.include_router(admin_runs_router)
app.include_router(admin_prompts_router)


@app.on_event("startup")
async def startup() -> None:
    logger.info("origo_api_startup", log_level=settings.log_level)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "origo-api"}
