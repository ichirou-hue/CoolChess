"""add user display names

Revision ID: e21f3a9c5b7d
Revises: d8a3c2f1b907
Create Date: 2026-10-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e21f3a9c5b7d"
down_revision: Union[str, Sequence[str], None] = "d8a3c2f1b907"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ветка feature (7d4b8f0a2c31) добавляет ту же колонку: при слиянии голов
    # upgrade выполняет обе ветки, поэтому добавление условное.
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    has_column = (
        inspector.has_table("users")
        and any(
            column["name"] == "display_name"
            for column in inspector.get_columns("users")
        )
    )
    if not has_column:
        op.add_column("users", sa.Column("display_name", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "display_name")
