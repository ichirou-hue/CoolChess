"""add telegram fields to user

Revision ID: 86ecc6b6cfde
Revises: f1a2b3c4d5e6
Create Date: 2026-10-14 02:53:04.758896

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '86ecc6b6cfde'
down_revision: Union[str, Sequence[str], None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("users", sa.Column("telegram_id", sa.BigInteger(), nullable=True))
    op.create_index("ix_users_telegram_id", "users", ["telegram_id"], unique=True)
    op.add_column("users", sa.Column("telegram_username", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("bind_code", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("bind_code_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "bind_code_expires_at")
    op.drop_column("users", "bind_code")
    op.drop_column("users", "telegram_username")
    op.drop_index("ix_users_telegram_id", table_name="users")
    op.drop_column("users", "telegram_id")
