import uuid
from datetime import datetime

from sqlalchemy import String
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sa_text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(server_default=sa_text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=sa_text("now()"), onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    prompts: Mapped[list["Prompt"]] = relationship(back_populates="client")  # noqa: F821
    competitors: Mapped[list["Competitor"]] = relationship(back_populates="client")  # noqa: F821
    runs: Mapped[list["Run"]] = relationship(back_populates="client")  # noqa: F821
