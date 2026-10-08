"""add public Chess.com ratings to user profiles

Revision ID: ac92f14d7351
Revises: 7c2e9a1b4d5f
Create Date: 2026-10-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ac92f14d7351"
down_revision: Union[str, Sequence[str], None] = "7c2e9a1b4d5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("chesscom_username", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("chesscom_blitz_rating", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("chesscom_rapid_rating", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("chesscom_bullet_rating", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("chesscom_daily_rating", sa.Integer(), nullable=True))
    op.create_index("ix_users_chesscom_username", "users", ["chesscom_username"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_chesscom_username", table_name="users")
    op.drop_column("users", "chesscom_daily_rating")
    op.drop_column("users", "chesscom_bullet_rating")
    op.drop_column("users", "chesscom_rapid_rating")
    op.drop_column("users", "chesscom_blitz_rating")
    op.drop_column("users", "chesscom_username")
