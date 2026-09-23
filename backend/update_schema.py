import asyncio
from sqlalchemy import text
from database import engine

async def add_gamification_columns():
    async with engine.begin() as conn:
        print("[DB] Проверяем и добавляем колонки геймификации в таблицу users...")
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS games_played INTEGER NOT NULL DEFAULT 0;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tournaments_played INTEGER NOT NULL DEFAULT 0;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tournaments_won INTEGER NOT NULL DEFAULT 0;"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tournaments_podium INTEGER NOT NULL DEFAULT 0;"))
    print("[DB] Структура базы данных успешно синхронизирована!")
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(add_gamification_columns())
