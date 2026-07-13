import enum
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy import text as sa_text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class RunStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    # Terminal, results-bearing, but NOT complete: at least one monitoring call
    # or analysis was dropped (yet coverage stayed above the trust threshold).
    # "completed" is reserved for a full run: every launched call stored AND
    # every stored response analyzed — it must never paper over failures.
    partial = "partial"
    failed = "failed"


# Statuses whose runs carry trustworthy, reportable results. Use this instead
# of `== RunStatus.completed` wherever "has results" is what's actually meant,
# so partial runs surface their (flagged) results instead of vanishing.
RESULT_STATUSES: tuple[RunStatus, ...] = (RunStatus.completed, RunStatus.partial)


class GenerationStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    skipped = "skipped"


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sa_text("gen_random_uuid()")
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[RunStatus] = mapped_column(
        SAEnum(RunStatus, name="run_status"), nullable=False, default=RunStatus.pending
    )
    generation_status: Mapped[GenerationStatus] = mapped_column(
        SAEnum(GenerationStatus, name="generation_status", create_type=False),
        nullable=False,
        default=GenerationStatus.pending,
        server_default="pending",
    )
    display_id: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True, index=True)
    total_prompts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_prompts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=sa_text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=sa_text("now()"), onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    client: Mapped["Client"] = relationship(back_populates="runs")  # noqa: F821
    responses: Mapped[list["Response"]] = relationship(back_populates="run")  # noqa: F821
