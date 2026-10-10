"""add display names and tournament management

Revision ID: 7d4b8f0a2c31
Revises: ac92f14d7351
Create Date: 2026-10-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import fastapi_users_db_sqlalchemy


revision: str = "7d4b8f0a2c31"
down_revision: Union[str, Sequence[str], None] = "ac92f14d7351"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("display_name", sa.String(length=32), server_default="Игрок", nullable=False),
    )
    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, email FROM users")).fetchall()
    for user_id, email in rows:
        nickname = (email.split("@", 1)[0].strip() or "Игрок")[:32]
        connection.execute(
            sa.text("UPDATE users SET display_name = :name WHERE id = :id"),
            {"name": nickname, "id": user_id},
        )

    op.create_table(
        "tournaments",
        sa.Column("id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("format", sa.String(length=24), nullable=False),
        sa.Column("time_control", sa.Integer(), nullable=False),
        sa.Column("increment", sa.Integer(), nullable=False),
        sa.Column("max_players", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "tournament_participants",
        sa.Column("id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=False),
        sa.Column("tournament_id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=False),
        sa.Column("user_id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=False),
        sa.Column("group_name", sa.String(length=24), nullable=True),
        sa.Column("preferred_color", sa.String(length=8), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tournament_id"], ["tournaments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tournament_id", "user_id", name="uq_tournament_participant"),
    )


def downgrade() -> None:
    op.drop_table("tournament_participants")
    op.drop_table("tournaments")
    op.drop_column("users", "display_name")
