"""merge nickname migration heads

Revision ID: d4e6f8a0b123
Revises: c5d8e1a4b902, c7d2a5f9e104
Create Date: 2026-10-10

Слияние голов после параллельной работы над никами: c5d8e1a4b902
(пересчёт ключей новой картой: т->t, 0->O) и c7d2a5f9e104 (тип/nullable
колонки display_name). Ветки независимы (разные колонки/индексы),
поэтому upgrade пустой — только точка слияния для одного head.
"""

from typing import Sequence, Union


revision: str = "d4e6f8a0b123"
down_revision: Union[str, Sequence[str], None] = ("c5d8e1a4b902", "c7d2a5f9e104")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
