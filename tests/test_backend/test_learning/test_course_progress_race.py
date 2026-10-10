import asyncio
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.requests import Request

from auth.manager import current_active_user
from auth.models import User
from database import Base, get_async_session
from learning.models import CourseProgress
from server import app


@pytest.mark.asyncio
async def test_ten_users_keep_concurrent_course_milestones_isolated(tmp_path):
    db_path = tmp_path / "course-progress-race.sqlite3"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"timeout": 30},
    )
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: Base.metadata.create_all(
                sync_connection, tables=[User.__table__, CourseProgress.__table__]
            )
        )

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    users = {
        str(uuid.uuid4()): User(
            email=f"race-user-{index}@example.test",
            hashed_password="not-used-by-this-test",
        )
        for index in range(10)
    }
    async with session_factory() as session:
        session.add_all(users.values())
        await session.commit()

    async def test_user(request: Request):
        return users[request.headers["x-test-user"]]

    async def test_session():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[current_active_user] = test_user
    app.dependency_overrides[get_async_session] = test_session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            async def update_milestone(user_id: str, milestone: str):
                response = await client.patch(
                    "/api/learning/progress/basics-history",
                    headers={"x-test-user": user_id},
                    json={milestone: True},
                )
                assert response.status_code == 200, response.text

            await asyncio.gather(
                *(
                    update_milestone(user_id, milestone)
                    for user_id in users
                    for milestone in (
                        "theory_completed",
                        "quiz_completed",
                        "practice_completed",
                    )
                )
            )

            async def read_progress(user_id: str):
                response = await client.get(
                    "/api/learning/progress",
                    headers={"x-test-user": user_id},
                )
                assert response.status_code == 200, response.text
                return response.json()

            results = await asyncio.gather(
                *(read_progress(user_id) for user_id in users)
            )
            assert len(results) == 10
            assert all(
                result["basics-history"]
                == {
                    "theory_completed": True,
                    "quiz_completed": True,
                    "practice_completed": True,
                }
                for result in results
            )
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)
        await engine.dispose()
