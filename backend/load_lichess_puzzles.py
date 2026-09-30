import csv
import io
import asyncio
import zstandard as zstd
import requests
from sqlalchemy.dialects.postgresql import insert
from database import engine, async_session_maker
from auth.models import Puzzle

LICHESS_PUZZLES_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"

async def insert_batch(records: list):
    if not records:
        return
    async with async_session_maker() as session:
        stmt = insert(Puzzle).values(records)
        stmt = stmt.on_conflict_do_nothing(index_elements=["id"])
        await session.execute(stmt)
        await session.commit()

async def download_and_import_puzzles(
    limit: int = 5000,
    min_rating: int = 800,
    max_rating: int = 2400,
    min_popularity: int = 70,
):
    print(f"[Lichess] Подключение к источнику: {LICHESS_PUZZLES_URL}")

    # Потоковый GET-запрос с таймаутом на установку соединения
    response = requests.get(LICHESS_PUZZLES_URL, stream=True, timeout=30)
    response.raise_for_status()

    dctx = zstd.ZstdDecompressor()
    records = []
    total_imported = 0

    with dctx.stream_reader(response.raw) as stream:
        text_stream = io.TextIOWrapper(stream, encoding="utf-8")
        reader = csv.reader(text_stream)
        
        header = next(reader)
        print(f"[Lichess] Заголовок архива: {header}")

        for row in reader:
            if not row or len(row) < 9:
                continue

            puzzle_id = row[0]
            fen = row[1]
            moves = row[2]
            try:
                rating = int(row[3])
                rating_dev = int(row[4])
                popularity = int(row[5])
            except ValueError:
                continue
                
            themes = row[7]
            game_url = row[8]

            # Фильтрация
            if not (min_rating <= rating <= max_rating):
                continue
            if popularity < min_popularity:
                continue
            if rating_dev > 90:
                continue

            records.append({
                "id": puzzle_id,
                "fen": fen,
                "moves": moves,
                "rating": rating,
                "rating_deviation": rating_dev,
                "popularity": popularity,
                "themes": themes,
                "game_url": game_url,
            })

            if len(records) >= 500:
                await insert_batch(records)
                total_imported += len(records)
                records.clear()
                print(f"[Lichess] Импортировано: {total_imported} / {limit}")

            if total_imported >= limit:
                break

        if records:
            await insert_batch(records)
            total_imported += len(records)

    print(f"[Lichess] Импорт завершен! Успешно загружено: {total_imported} задач.")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(download_and_import_puzzles(limit=3000))