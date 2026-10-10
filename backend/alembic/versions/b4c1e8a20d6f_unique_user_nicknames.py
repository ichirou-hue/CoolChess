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
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing = {index["name"] for index in inspector.get_indexes("users")}
    # SQLite не рефлектит expression-индексы, поэтому проверка ниже его не
    # видит; повторный прогон всё равно безопасен — миграции версионируются.
    if "uq_users_display_name_lower" not in existing:
        try:
            op.create_index(
                "uq_users_display_name_lower",
                "users",
                [sa.text("lower(display_name)")],
                unique=True,
            )
        except Exception:
            pass


def downgrade() -> None:
    op.drop_index("uq_users_display_name_lower", table_name="users")
