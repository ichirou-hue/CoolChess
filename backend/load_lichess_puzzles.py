import csv
import io
import asyncio
import zstandard as zstd
import requests
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert
from database import engine, async_session_maker, Base
from auth.models import Puzzle

LICHESS_PUZZLES_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"

async def download_and_import_puzzles(
    limit: int = 5000,
    min_rating: int = 800,
    max_rating: int = 2400,
    min_popularity: int = 70,
):
    print(f"[Lichess] Подключение к источнику: {LICHESS_PUZZLES_URL}")
    
    # Создаем таблицы, если их еще нет
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Запуск потоковой загрузки
    response = requests.get(LICHESS_PUZZLES_URL, stream=True)
    dctx = zstd.ZstdDecompressor()
    
    records = []
    total_imported = 0

    with dctx.stream_reader(response.raw) as stream:
        text_stream = io.TextIOWrapper(stream, encoding="utf-8")
        reader = csv.reader(text_stream)
        
        # Заголовок Lichess: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
        header = next(reader)
        print(f"[Lichess] Колонки: {header}")

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

            # Фильтрация по качеству и диапазону Elo
            if not (min_rating <= rating <= max_rating):
                continue
            if popularity < min_popularity:
                continue
            if rating_dev > 90:  # Исключаем задачи с неточным рейтингом
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

            # Вставляем пачками по 500 штук
            if len(records) >= 500:
                await insert_batch(records)
                total_imported += len(records)
                records.clear()
                print(f"[Lichess] Импортировано задач: {total_imported} / {limit}")

            if total_imported >= limit:
                break

        if records:
            await insert_batch(records)
            total_imported += len(records)

    print(f"[Lichess] Загрузка успешно завершена! Всего в базе: {total_imported} качественных задач.")
    await engine.dispose()

async def insert_batch(records: list):
    async with async_session_maker() as session:
        stmt = insert(Puzzle).values(records)
        # Если задача с таким ID уже есть — пропускаем
        stmt = stmt.on_conflict_do_nothing(index_elements=["id"])
        await session.execute(stmt)
        await session.commit()

if __name__ == "__main__":
    # По умолчанию для старта загрузим 3000 отобранных задач рейтинга 800-2400
    asyncio.run(download_and_import_puzzles(limit=3000))