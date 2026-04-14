import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy import text as sa_text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Prominence(str, enum.Enum):
    primary = "primary"
    secondary = "secondary"
    mentioned = "mentioned"
    not_cited = "not_cited"


class Sentiment(str, enum.Enum):
    positive = "positive"
    neutral = "neutral"
    negative = "negative"
    not_cited = "not_cited"


class CitationOpportunity(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sa_text("gen_random_uuid()")
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    response_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("responses.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    client_cited: Mapped[bool] = mapped_column(Boolean, nullable=False)
    client_prominence: Mapped[Prominence] = mapped_column(
        SAEnum(Prominence, name="prominence_type"), nullable=False
    )
    client_sentiment: Mapped[Sentiment] = mapped_column(
        SAEnum(Sentiment, name="sentiment_type"), nullable=False
    )
    client_characterization: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{"brand": str, "prominence": str, "sentiment": str}]
    competitors_cited: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # ["topic1", "topic2", ...]
    content_gaps: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    citation_opportunity: Mapped[CitationOpportunity] = mapped_column(
        SAEnum(CitationOpportunity, name="citation_opportunity_type"), nullable=False
    )
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=sa_text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=sa_text("now()"), onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    response: Mapped["Response"] = relationship(back_populates="analysis")  # noqa: F821
