import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer
from sqlalchemy import text as sa_text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class ClientKnowledgeBase(Base):
    __tablename__ = "client_knowledge_bases"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sa_text("gen_random_uuid()")
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    brand_profile: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    target_audience: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    brand_voice: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    industry_context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        server_default=sa_text("now()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=sa_text("now()"), onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    client: Mapped["Client"] = relationship(back_populates="knowledge_base")  # noqa: F821
