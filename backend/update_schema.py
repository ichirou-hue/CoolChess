"""Ручная синхронизация схемы существующей БД с моделями.

LEGACY: для баз, созданных до внедрения Alembic. Источник истины схемы —
Alembic-миграции (backend/alembic/versions/): свежие БД поднимаются через
`alembic upgrade head` (см. backend/entrypoint.sh), dev-путь — init_db.py.

Этот скрипт докручивает только колонки users на давно созданных БД
и безопасен для повторного запуска. Новые таблицы он не создаёт — для них используйте Alembic.
"""

import asyncio
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from database import engine

# (таблица, колонка, DDL-тип) — полный список колонок,
# добавленных после первоначального create_all.
MISSING_COLUMNS = [
    ("users", "display_name", "VARCHAR(32) NOT NULL DEFAULT 'Игрок'"),
    ("users", "xp", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "level", "INTEGER NOT NULL DEFAULT 1"),
    ("users", "coins", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "games_played", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "tournaments_played", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "tournaments_won", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "tournaments_podium", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "lichess_username", "VARCHAR(50)"),
    ("users", "lichess_blitz_rating", "INTEGER"),
    ("users", "lichess_rapid_rating", "INTEGER"),
    ("users", "lichess_puzzle_rating", "INTEGER"),
    ("users", "lichess_verification_code", "VARCHAR(32)"),
    ("users", "lichess_verification_username", "VARCHAR(50)"),
    ("users", "lichess_verification_expires_at", "TIMESTAMP WITH TIME ZONE"),
    ("users", "lichess_verification_attempts", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "chesscom_username", "VARCHAR(50)"),
    ("users", "chesscom_blitz_rating", "INTEGER"),
    ("users", "chesscom_rapid_rating", "INTEGER"),
    ("users", "chesscom_bullet_rating", "INTEGER"),
    ("users", "chesscom_daily_rating", "INTEGER"),
    ("users", "chesscom_verification_code", "VARCHAR(32)"),
    ("users", "chesscom_verification_username", "VARCHAR(50)"),
    ("users", "chesscom_verification_expires_at", "TIMESTAMP WITH TIME ZONE"),
    ("users", "chesscom_verification_attempts", "INTEGER NOT NULL DEFAULT 0"),
    ("users", "email_verification_code_hash", "VARCHAR(64)"),
    ("users", "email_verification_expires_at", "TIMESTAMP WITH TIME ZONE"),
    ("users", "email_verification_sent_at", "TIMESTAMP WITH TIME ZONE"),
    ("users", "email_verification_attempts", "INTEGER NOT NULL DEFAULT 0"),
]


async def sync_schema():
    async with engine.begin() as conn:
        dialect = conn.dialect.name
        print(f"[DB] Диалект: {dialect}. Проверяем недостающие колонки...")
        for table, column, ddl_type in MISSING_COLUMNS:
            if dialect == "postgresql":
                stmt = f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl_type};"
            else:
                # SQLite не знает IF NOT EXISTS — ловим ошибку дубля ниже
                stmt = f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type};"
            try:
                await conn.execute(text(stmt))
                print(f"[DB] OK: {table}.{column}")
            except OperationalError as exc:
                # Колонка уже есть (SQLite) — пропускаем, остальное пробрасываем
                if "duplicate column name" in str(exc).lower():
                    print(f"[DB] SKIP (уже есть): {table}.{column}")
                else:
                    raise
    print("[DB] Структура базы данных успешно синхронизирована!")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(sync_schema())
