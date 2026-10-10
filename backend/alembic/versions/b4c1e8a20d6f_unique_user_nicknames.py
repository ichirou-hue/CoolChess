"""require unique public nicknames

Revision ID: b4c1e8a20d6f
Revises: e21f3a9c5b7d
Create Date: 2026-10-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b4c1e8a20d6f"
down_revision: Union[str, Sequence[str], None] = "e21f3a9c5b7d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_users_display_name_lower",
        "users",
        [sa.text("lower(display_name)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_users_display_name_lower", table_name="users")
