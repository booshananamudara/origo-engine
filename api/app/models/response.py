import enum
import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy import text as sa_text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Platform(str, enum.Enum):
    perplexity = "perplexity"
    openai = "openai"
    anthropic = "anthropic"


class Response(Base):
    """
    Append-only — never UPDATE or DELETE rows.
    Each run × prompt × platform combination produces one row.
    """

    __tablename__ = "responses"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sa_text("gen_random_uuid()")
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    prompt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("prompts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform: Mapped[Platform] = mapped_column(
        SAEnum(Platform, name="platform_type"), nullable=False
    )
    raw_response: Mapped[str] = mapped_column(Text, nullable=False)
    model_used: Mapped[str] = mapped_column(String(100), nullable=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=sa_text("now()"), nullable=False)
    # updated_at intentionally omitted — this table is append-only
    updated_at: Mapped[datetime] = mapped_column(server_default=sa_text("now()"), nullable=False)

    # Relationships
    run: Mapped["Run"] = relationship(back_populates="responses")  # noqa: F821
    prompt: Mapped["Prompt"] = relationship(back_populates="responses")  # noqa: F821
    analysis: Mapped["Analysis | None"] = relationship(back_populates="response")  # noqa: F821
