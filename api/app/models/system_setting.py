from datetime import datetime

from sqlalchemy import Integer
from sqlalchemy import text as sa_text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SystemSetting(Base):
    """Singleton table — always exactly one row with id=1.

    Holds system-wide (NOT client-scoped) configuration. `default_model_config`
    is the global AI model + engine configuration that every client inherits;
    it has the same shape as a client's platform_model_config JSONB.
    """
    __tablename__ = "system_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    default_model_config: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=sa_text("'{}'::jsonb")
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=sa_text("now()"), onupdate=datetime.utcnow, nullable=False
    )
