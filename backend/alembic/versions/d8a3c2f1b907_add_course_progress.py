"""store course completion per user

Revision ID: d8a3c2f1b907
Revises: ac92f14d7351
Create Date: 2026-10-10
"""

from typing import Sequence, Union

from alembic import op
import fastapi_users_db_sqlalchemy
import sqlalchemy as sa


revision: str = "d8a3c2f1b907"
down_revision: Union[str, Sequence[str], None] = "ac92f14d7351"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "course_progress",
        sa.Column("user_id", fastapi_users_db_sqlalchemy.generics.GUID(), nullable=False),
        sa.Column("topic_id", sa.String(length=100), nullable=False),
        sa.Column("theory_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("quiz_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("practice_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "topic_id"),
    )


def downgrade() -> None:
    op.drop_table("course_progress")
