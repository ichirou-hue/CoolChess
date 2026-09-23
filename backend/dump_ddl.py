import asyncio
from database import Base, engine
import auth.models  # импортируем, чтобы модели зарегистрировались в Base
from sqlalchemy.schema import CreateTable

async def generate_ddl():
    async with engine.connect() as conn:
        for table in Base.metadata.sorted_tables:
            ddl = CreateTable(table).compile(conn.sync_engine)
            print(f"{ddl};\n")

if __name__ == "__main__":
    asyncio.run(generate_ddl())