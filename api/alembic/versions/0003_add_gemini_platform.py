"""add gemini to platform_type enum

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-26

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL 12+ allows ALTER TYPE ... ADD VALUE inside a transaction.
    # IF NOT EXISTS makes this idempotent on repeated runs.
    op.execute("ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'gemini'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values.
    # To fully revert: recreate the type without 'gemini' and migrate existing rows.
    # For a PoC we simply leave the value in place — it causes no harm when unused.
    pass
