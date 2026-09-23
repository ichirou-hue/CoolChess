import asyncio
from sqlalchemy import select
from database import async_session_maker
from auth.models import Puzzle

async def main():
    async with async_session_maker() as session:
        result = await session.execute(select(Puzzle.moves).where(Puzzle.id == "02BOt"))
        print("MOVES:", result.scalar())

if __name__ == "__main__":
    asyncio.run(main())