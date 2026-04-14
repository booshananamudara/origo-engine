import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    description="GEO monitoring — proof of concept",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup() -> None:
    logger.info("origo_api_startup", log_level=settings.log_level)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "origo-api"}
