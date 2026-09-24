import asyncio
from database import engine, Base
from auth.models import User
from games.models import Game

async def init_tables():
    print("[DB] Подключаемся к PostgreSQL в контейнере Docker...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[DB] Таблица users и системные индексы успешно созданы!")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(init_tables())
