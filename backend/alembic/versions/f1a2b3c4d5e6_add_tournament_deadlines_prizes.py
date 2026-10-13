"""Add tournament deadlines and prize descriptions.

Revision ID: f1a2b3c4d5e6
Revises: d4e6f8a0b123
Create Date: 2026-10-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "d4e6f8a0b123"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tournaments",
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "tournaments",
        sa.Column(
            "prize",
            sa.String(length=160),
            nullable=False,
            server_default="500 монет и медаль чемпиона",
        ),
    )
    connection = op.get_bind()
    if connection.dialect.name == "sqlite":
        connection.execute(sa.text("UPDATE tournaments SET ends_at = datetime(created_at, '+7 days') WHERE ends_at IS NULL"))
    else:
        connection.execute(sa.text("UPDATE tournaments SET ends_at = created_at + INTERVAL '7 days' WHERE ends_at IS NULL"))


def downgrade() -> None:
    op.drop_column("tournaments", "prize")
    op.drop_column("tournaments", "ends_at")
