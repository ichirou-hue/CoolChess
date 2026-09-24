"""Печать DDL схемы для backend/schema.sql.

Работает без живой БД: DDL компилируется под диалект PostgreSQL.
Запуск из каталога backend/:
    python dump_ddl.py > schema.sql
"""

import auth.models  # noqa: F401 — регистрирует таблицы в Base.metadata
import games.models  # noqa: F401
from database import Base
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable


def generate_ddl() -> str:
    dialect = postgresql.dialect()
    chunks = []
    for table in Base.metadata.sorted_tables:
        ddl = str(CreateTable(table).compile(dialect=dialect)).strip()
        chunks.append(f"{ddl};")
    return "\n\n\n".join(chunks) + "\n"


if __name__ == "__main__":
    print(generate_ddl())
