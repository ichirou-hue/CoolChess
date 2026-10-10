"""align users.display_name with the model (nullable, 40 chars)

Revision ID: c7d2a5f9e104
Revises: a9f4c2e1b873
Create Date: 2026-10-10

Ветка feature создавала колонку как VARCHAR(32) NOT NULL DEFAULT 'Игрок',
а модель требует String(40) nullable (ветка dev). Без выравнивания
`alembic check` сообщает о дрифте. Ограничение 3–24 символа держит
валидатор схемы, длина в БД запасом. batch-режим — для совместимости
с SQLite (пересоздание таблицы с сохранением данных).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7d2a5f9e104"
down_revision: Union[str, Sequence[str], None] = "a9f4c2e1b873"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "display_name",
            existing_type=sa.VARCHAR(length=32),
            type_=sa.String(length=40),
            existing_nullable=False,
            nullable=True,
            existing_server_default=sa.text("'Игрок'"),
            server_default=None,
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "display_name",
            existing_type=sa.String(length=40),
            type_=sa.VARCHAR(length=32),
            existing_nullable=True,
            nullable=False,
            server_default=sa.text("'Игрок'"),
        )
