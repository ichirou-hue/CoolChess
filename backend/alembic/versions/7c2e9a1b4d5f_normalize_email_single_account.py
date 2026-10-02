"""single account per email: normalize legacy rows + lower(email) unique

Revision ID: 7c2e9a1b4d5f
Revises: 2e9fe1e0f0ff
Create Date: 2026-10-02

Защита "1 почта = 1 аккаунт" на уровне БД (оборона в глубину):
- get_by_email в fastapi-users уже case-insensitive (lower()),
  но уникальный индекс ix_users_email в Postgres case-sensitive.
  Добавляем функциональный UNIQUE lower(email).
- Нормализуем накопленные строки той же логикой, что auth.schemas:
  trim + lower, срез "+алиаса", точки для gmail/googlemail.
  Без backfill легаси-строка `User+Tag@X.com` не совпадала бы
  с новой `user@x.com` даже по lower() и давала второй аккаунт
  на тот же ящик.
- При коллизии двух строк в один нормализованный адрес миграция
  падает с понятным списком (удалять аккаунты молча нельзя).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c2e9a1b4d5f"
down_revision: Union[str, Sequence[str], None] = "2e9fe1e0f0ff"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalize(email: str) -> str:
    cleaned = email.strip().lower()
    if "@" not in cleaned:
        return cleaned
    name_part, domain = cleaned.split("@", 1)
    if "+" in name_part:
        name_part = name_part.split("+")[0]
    if domain in ("gmail.com", "googlemail.com"):
        name_part = name_part.replace(".", "")
    return f"{name_part}@{domain}"


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text('SELECT id, email FROM users')).fetchall()

    # Группируем по нормализованному адресу для поиска коллизий.
    by_normalized: dict[str, list[tuple[object, str]]] = {}
    for user_id, email in rows:
        normalized = _normalize(email)
        by_normalized.setdefault(normalized, []).append((user_id, email))

    collisions = {k: v for k, v in by_normalized.items() if len(v) > 1}
    if collisions:
        details = "; ".join(
            f"{norm} <- {', '.join(old for _, old in group)}"
            for norm, group in sorted(collisions.items())
        )
        raise RuntimeError(
            "Миграция 7c2e9a1b4d5f: несколько аккаунтов нормализуются "
            f"в один email ({details}). Разрешите дубли вручную "
            "(оставьте один аккаунт на ящик) и повторите upgrade."
        )

    for normalized, group in by_normalized.items():
        user_id, old_email = group[0]
        if old_email != normalized:
            conn.execute(
                sa.text("UPDATE users SET email = :email WHERE id = :id"),
                {"email": normalized, "id": str(user_id)},
            )

    # Case-insensitive backstop под get_by_email(lower()):
    # точные дубли нормализованных адресов теперь ловит и БД (гонки,
    # прямые INSERT, обход валидации), а не только Python.
    op.execute(
        sa.text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_lower "
            "ON users (lower(email))"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_users_email_lower"))
