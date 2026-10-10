"""fix nickname confusables for zero and Cyrillic te

Revision ID: c5d8e1a4b902
Revises: a9f4c2e1b873
Create Date: 2026-10-10
"""

import unicodedata

from alembic import op
import sqlalchemy as sa

revision = "c5d8e1a4b902"
down_revision = "a9f4c2e1b873"
branch_labels = None
depends_on = None

_CONFUSABLES = {
    "А": "A", "а": "a", "В": "B", "в": "b", "С": "C", "с": "c",
    "Е": "E", "е": "e", "Ё": "E", "ё": "e", "Н": "H", "н": "h",
    "І": "I", "і": "i", "Ї": "I", "ї": "i", "Ј": "J", "ј": "j",
    "К": "K", "к": "k", "М": "M", "м": "m", "О": "O", "о": "o",
    "Р": "P", "р": "p", "Ѕ": "S", "ѕ": "s", "Т": "T", "т": "t",
    "Х": "X", "х": "x", "У": "Y", "у": "y",
    "Α": "A", "α": "a", "Β": "B", "β": "b", "Ε": "E", "ε": "e",
    "Η": "H", "η": "n", "Ι": "I", "ι": "i", "Κ": "K", "κ": "k",
    "Μ": "M", "μ": "u", "Ν": "N", "ν": "v", "Ο": "O", "ο": "o",
    "Ρ": "P", "ρ": "p", "Τ": "T", "τ": "t", "Χ": "X", "χ": "x",
    "Ζ": "Z", "ζ": "z", "Υ": "Y", "υ": "u", "ω": "w",
    "Ϲ": "C", "ϲ": "c", "0": "O",
}


def _canonicalize(value: str) -> str:
    normalized = " ".join(unicodedata.normalize("NFKC", value).split())
    return "".join(_CONFUSABLES.get(char, char) for char in normalized)


def upgrade() -> None:
    connection = op.get_bind()
    indexes = {index["name"] for index in sa.inspect(connection).get_indexes("users")}
    if "uq_users_display_name_key" in indexes:
        op.drop_index("uq_users_display_name_key", table_name="users")
    rows = connection.execute(
        sa.text("SELECT id, display_name FROM users WHERE display_name IS NOT NULL ORDER BY id")
    ).fetchall()
    seen: set[str] = set()
    for user_id, display_name in rows:
        key = _canonicalize(str(display_name)) or None
        if key is not None and key in seen:
            key = None  # Existing duplicate owner must choose a new nickname.
        if key is not None:
            seen.add(key)
        connection.execute(
            sa.text("UPDATE users SET display_name_key = :key WHERE id = :id"),
            {"key": key, "id": user_id},
        )
    op.create_index("uq_users_display_name_key", "users", ["display_name_key"], unique=True)


def downgrade() -> None:
    connection = op.get_bind()
    indexes = {index["name"] for index in sa.inspect(connection).get_indexes("users")}
    if "uq_users_display_name_key" in indexes:
        op.drop_index("uq_users_display_name_key", table_name="users")
    old_mapping = dict(_CONFUSABLES)
    old_mapping.pop("0", None)
    old_mapping["т"] = "m"
    rows = connection.execute(
        sa.text("SELECT id, display_name FROM users WHERE display_name IS NOT NULL ORDER BY id")
    ).fetchall()
    seen: set[str] = set()
    for user_id, display_name in rows:
        normalized = " ".join(unicodedata.normalize("NFKC", str(display_name)).split())
        key = "".join(old_mapping.get(char, char) for char in normalized) or None
        if key is not None and key in seen:
            key = None
        if key is not None:
            seen.add(key)
        connection.execute(
            sa.text("UPDATE users SET display_name_key = :key WHERE id = :id"),
            {"key": key, "id": user_id},
        )
    op.create_index("uq_users_display_name_key", "users", ["display_name_key"], unique=True)
