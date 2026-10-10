"""merge nickname branch heads; canonical nickname keys, elo 1000

Revision ID: a9f4c2e1b873
Revises: b4c1e8a20d6f, c21f3a8b6d90
Create Date: 2026-10-10

Слияние двух голов миграций (ветка dev: b4c1e8a20d6f, ветка feature:
c21f3a8b6d90), разошедшихся от ac92f14d7351.

Схема:
- users.display_name_key — канонический ключ ника (см.
  backend/auth/display_names.py): визуально одинаковые ники из разных
  алфавитов дают один ключ, регистр сохраняется. Backfill для существующих
  строк, затем уникальный индекс.
- Старый регистронезависимый индекс uq_users_display_name_lower удаляется:
  регистр в никах важен («Тест» и «тест» — разные ники).

Рейтинг: стартовый Elo 1000 для новых пользователей задан Python-дефолтом
колонки (Column default, без server_default), поэтому DDL-миграция для него
не требуется — меняется только models.User.elo_rating.
"""

import unicodedata
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a9f4c2e1b873"
down_revision: Union[str, Sequence[str], None] = ("b4c1e8a20d6f", "c21f3a8b6d90")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Локальная копия таблицы из backend/auth/display_names.py, чтобы миграция
# не зависела от будущего рефакторинга кода приложения.
_CONFUSABLES: dict[str, str] = {
    "А": "A", "а": "a",
    "В": "B", "в": "b",
    "С": "C", "с": "c",
    "Е": "E", "е": "e",
    "Ё": "E", "ё": "e",
    "Н": "H", "н": "h",
    "І": "I", "і": "i",
    "Ї": "I", "ї": "i",
    "Ј": "J", "ј": "j",
    "К": "K", "к": "k",
    "М": "M", "м": "m",
    "О": "O", "о": "o",
    "Р": "P", "р": "p",
    "Ѕ": "S", "ѕ": "s",
    "Т": "T", "т": "m",
    "Х": "X", "х": "x",
    "У": "Y", "у": "y",
    "Α": "A", "α": "a",
    "Β": "B", "β": "b",
    "Ε": "E", "ε": "e",
    "Η": "H", "η": "n",
    "Ι": "I", "ι": "i",
    "Κ": "K", "κ": "k",
    "Μ": "M", "μ": "u",
    "Ν": "N", "ν": "v",
    "Ο": "O", "ο": "o",
    "Ρ": "P", "ρ": "p",
    "Τ": "T", "τ": "t",
    "Χ": "X", "χ": "x",
    "Ζ": "Z", "ζ": "z",
    "Υ": "Y", "υ": "u",
    "ω": "w",
    "Ϲ": "C", "ϲ": "c",
}


def _canonicalize(value: str) -> str:
    cleaned = " ".join(unicodedata.normalize("NFKC", value).split())
    return "".join(_CONFUSABLES.get(ch, ch) for ch in cleaned)


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    columns = {
        column["name"] for column in inspector.get_columns("users")
    } if inspector.has_table("users") else set()
    if "display_name_key" not in columns:
        op.add_column("users", sa.Column("display_name_key", sa.String(length=64), nullable=True))

    # Backfill: у старых строк ключ считается из ника. При коллизии ключей
    # (два визуально одинаковых ника) побеждает более ранняя строка —
    # поздним дублям ключ обнуляется, владелец решает спор вручную.
    rows = connection.execute(
        sa.text("SELECT id, display_name FROM users WHERE display_name IS NOT NULL")
    ).fetchall()
    seen: dict[str, object] = {}
    for user_id, display_name in rows:
        key = _canonicalize(str(display_name)) or None
        if key is not None and key in seen:
            key = None
        if key is not None:
            seen[key] = user_id
        connection.execute(
            sa.text("UPDATE users SET display_name_key = :key WHERE id = :id"),
            {"key": key, "id": user_id},
        )

    existing_indexes = {index["name"] for index in inspector.get_indexes("users")}
    if "uq_users_display_name_key" not in existing_indexes:
        op.create_index(
            "uq_users_display_name_key", "users", ["display_name_key"], unique=True
        )
    # Старый регистронезависимый индекс удаляется безусловно: SQLite не умеет
    # рефлектить expression-индексы (SAWarning выше), поэтому его отсутствие
    # в existing_indexes не означает отсутствия в БД. Без дропа он продолжил
    # бы запрещать ники, отличающиеся только регистром.
    try:
        op.drop_index("uq_users_display_name_lower", table_name="users")
    except Exception:
        pass


def downgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_indexes = {index["name"] for index in inspector.get_indexes("users")}
    if "uq_users_display_name_key" in existing_indexes:
        op.drop_index("uq_users_display_name_key", table_name="users")
    if "uq_users_display_name_lower" not in existing_indexes:
        op.create_index(
            "uq_users_display_name_lower",
            "users",
            [sa.text("lower(display_name)")],
            unique=True,
        )
    columns = {
        column["name"] for column in inspector.get_columns("users")
    } if inspector.has_table("users") else set()
    if "display_name_key" in columns:
        op.drop_column("users", "display_name_key")
