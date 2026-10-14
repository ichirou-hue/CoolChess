"""Доступ бота к общей БД сайта.

Никаких параллельных моделей: переиспользуем `database` и `auth.models`
бэкенда (каталог backend/ уже добавлен в sys.path в telegram_bot.config).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from telegram_bot.config import settings
from database import Base  # noqa: F401  (регистрируем metadata через модели ниже)
import auth.models  # noqa: F401  (регистрация User/Puzzle в Base.metadata)
from auth.models import User

engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def get_user_by_telegram_id(session: AsyncSession, telegram_id: int) -> User | None:
    result = await session.execute(select(User).where(User.telegram_id == telegram_id))
    return result.scalar_one_or_none()


async def get_user_by_bind_token(session: AsyncSession, token: str) -> User | None:
    result = await session.execute(select(User).where(User.bind_code == token))
    return result.scalar_one_or_none()
