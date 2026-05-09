# Import all models so SQLAlchemy and Alembic can discover them via Base.metadata
from app.models.client import Client
from app.models.prompt import Prompt
from app.models.competitor import Competitor
from app.models.run import Run, RunStatus
from app.models.response import Response, Platform
from app.models.analysis import Analysis, Prominence, Sentiment, CitationOpportunity
from app.models.audit_log import AuditLog
from app.models.admin_user import AdminUser
from app.models.client_knowledge_base import ClientKnowledgeBase

__all__ = [
    "Client",
    "Prompt",
    "Competitor",
    "Run",
    "RunStatus",
    "Response",
    "Platform",
    "Analysis",
    "Prominence",
    "Sentiment",
    "CitationOpportunity",
    "AuditLog",
    "AdminUser",
    "ClientKnowledgeBase",
]
