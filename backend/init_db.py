import asyncio
from database import engine, Base
from auth.models import User  # noqa: F401 — регистрирует таблицы в Base.metadata
from games.models import Game  # noqa: F401
from clans.models import Clan, ClanMember  # noqa: F401

async def init_tables():
    print("[DB] Создаём таблицы через Base.metadata.create_all...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[DB] Таблицы users, puzzles, games, clans и системные индексы успешно созданы!")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(init_tables())
