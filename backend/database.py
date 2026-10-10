import os
from pathlib import Path
from typing import AsyncGenerator
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

# .env лежит в корне репозитория (на уровень выше backend/),
# а скрипты запускают из разных CWD (корень, backend/, IDE).
# Поэтому грузим его по явному пути, а не по CWD.
ROOT_ENV = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=ROOT_ENV)

# Дефолтный SQLite-файл привязан к каталогу backend/, а не к CWD:
# иначе запуск из корня и из backend/ используют разные базы
# (пустой файл без таблиц давал 500 «no such table: users» при регистрации).
_BACKEND_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    # Safe local default; Docker Compose provides its PostgreSQL URL explicitly.
    f"sqlite+aiosqlite:///{_BACKEND_DIR / 'coolchess.db'}",
)

# Асинхронный движок SQLAlchemy
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True
)

# Фабрика сессий
async_session_maker = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session