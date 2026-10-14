import uuid

import pytest
import pytest_asyncio
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from auth.manager import current_optional_user
from auth.models import Puzzle, User, user_solved_puzzles
from database import Base, get_async_session
from server import app


@pytest_asyncio.fixture
async def leaderboard_database():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.begin() as connection:
            await connection.run_sync(lambda conn: Base.metadata.create_all(
                conn, tables=[User.__table__, Puzzle.__table__, user_solved_puzzles]
            ))
        users = [dict(
            id=uuid.UUID(int=index), email=f"player{index}@example.test",
            hashed_password="unused", display_name=f"Игрок {index}", is_active=True,
            elo_rating=1000 + index % 4 * 10, level=1 + index % 3, xp=index % 5 * 20,
        ) for index in range(1, 143)]
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            await session.execute(insert(User), [*users, dict(
                id=uuid.UUID(int=999), email="inactive@example.test", hashed_password="unused", is_active=False,
            )])
            await session.execute(insert(Puzzle), [dict(
                id=f"puzzle{index}", fen="8/8/8/8/8/2k5/8/K7 w - - 0 1", moves="a1b1", rating=800, themes="endgame",
            ) for index in range(2)])
            await session.execute(insert(user_solved_puzzles), [dict(
                user_id=user["id"], puzzle_id=f"puzzle{index}",
            ) for user in users for index in range(user["id"].int % 3)])
            await session.commit()
            yield session, users
    finally:
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("category", ["elo", "level", "puzzles"])
async def test_pages_cover_all_players_and_keep_global_rank(anonymous_client, leaderboard_database, category):
    session, users = leaderboard_database
    keys = {
        "elo": lambda user: (-user["elo_rating"], -user["xp"], user["id"].int),
        "level": lambda user: (-user["level"], -user["xp"], -user["elo_rating"], user["id"].int),
        "puzzles": lambda user: (-user["id"].int % 3, -user["elo_rating"], user["id"].int),
    }
    # The solved count is id % 3; negate the whole count for descending order.
    keys["puzzles"] = lambda user: (-(user["id"].int % 3), -user["elo_rating"], user["id"].int)
    ordered = sorted(users, key=keys[category])
    current = await session.get(User, ordered[101]["id"])
    app.dependency_overrides[get_async_session] = lambda: session
    app.dependency_overrides[current_optional_user] = lambda: current
    try:
        ids = []
        ranks = []
        for offset, expected_count in [(0, 50), (50, 50), (100, 42), (150, 0)]:
            response = await anonymous_client.get(f"/api/leaderboard?category={category}&limit=50&offset={offset}")
            assert response.status_code == 200
            data = response.json()
            assert data["total_players"] == 142
            assert len(data["top_players"]) == expected_count
            assert data["my_rank"]["rank"] == 102
            ids.extend(player["user_id"] for player in data["top_players"])
            ranks.extend(player["rank"] for player in data["top_players"])
        assert ids == [str(user["id"]) for user in ordered]
        assert len(set(ids)) == 142
        assert ranks == list(range(1, 143))
        again = await anonymous_client.get(f"/api/leaderboard?category={category}&limit=50&offset=50")
        assert [player["user_id"] for player in again.json()["top_players"]] == ids[50:100]
    finally:
        app.dependency_overrides.pop(get_async_session, None)
        app.dependency_overrides.pop(current_optional_user, None)
