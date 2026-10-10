"""seed beginner puzzles for the topic categories

Revision ID: 98a3d74f1c25
Revises: 8c31f76e9a20
Create Date: 2026-10-10
"""

import json
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "98a3d74f1c25"
down_revision: Union[str, Sequence[str], None] = "8c31f76e9a20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    seed_path = Path(__file__).resolve().parents[2] / "puzzles" / "category_seed.json"
    seed_rows = json.loads(seed_path.read_text(encoding="utf-8"))
    puzzles = sa.table(
        "puzzles",
        sa.column("id", sa.String()),
        sa.column("fen", sa.String()),
        sa.column("moves", sa.String()),
        sa.column("rating", sa.Integer()),
        sa.column("rating_deviation", sa.Integer()),
        sa.column("popularity", sa.Integer()),
        sa.column("themes", sa.String()),
        sa.column("game_url", sa.String()),
    )

    connection = op.get_bind()
    seed_ids = [row["id"] for row in seed_rows]
    existing_ids = set(
        connection.execute(
            sa.select(puzzles.c.id).where(puzzles.c.id.in_(seed_ids))
        ).scalars()
    )
    rows_to_insert = [row for row in seed_rows if row["id"] not in existing_ids]
    if rows_to_insert:
        op.bulk_insert(puzzles, rows_to_insert)


def downgrade() -> None:
    # Keep seeded content so a rollback cannot erase players' solve history.
    pass
