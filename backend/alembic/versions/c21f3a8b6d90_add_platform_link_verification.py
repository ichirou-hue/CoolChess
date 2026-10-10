"""add expiring ownership verification for chess platforms

Revision ID: c21f3a8b6d90
Revises: b5e81a0c4d72
Create Date: 2026-10-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c21f3a8b6d90"
down_revision: Union[str, Sequence[str], None] = "b5e81a0c4d72"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("lichess_verification_username", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("lichess_verification_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "users",
        sa.Column("lichess_verification_attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("users", sa.Column("chesscom_verification_code", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("chesscom_verification_username", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("chesscom_verification_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "users",
        sa.Column("chesscom_verification_attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.execute(
        "UPDATE users SET lichess_verification_code = NULL "
        "WHERE lichess_verification_code IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("users", "chesscom_verification_attempts")
    op.drop_column("users", "chesscom_verification_expires_at")
    op.drop_column("users", "chesscom_verification_username")
    op.drop_column("users", "chesscom_verification_code")
    op.drop_column("users", "lichess_verification_attempts")
    op.drop_column("users", "lichess_verification_expires_at")
    op.drop_column("users", "lichess_verification_username")
