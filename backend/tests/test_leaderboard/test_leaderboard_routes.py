import uuid
import pytest
from unittest.mock import MagicMock
from server import app
from database import get_async_session
from auth.models import User
from auth.manager import current_optional_user


def make_player(email: str, elo: int, level: int, xp: int, user_id=None):
    user = MagicMock(spec=User)
    user.id = user_id or uuid.uuid4()
    user.email = email
    user.elo_rating = elo
    user.level = level
    user.xp = xp
    user.is_active = True
    return user


@pytest.mark.asyncio
async def test_get_leaderboard_anonymous_by_elo(anonymous_client, mock_db_session):
    # Мокаем и сессию БД, и опционального пользователя (None для гостя)
    app.dependency_overrides[get_async_session] = lambda: mock_db_session
    app.dependency_overrides[current_optional_user] = lambda: None

    u1 = make_player("magnus@chess.com", elo=2850, level=50, xp=10000)
    u2 = make_player("hikaru@chess.com", elo=2820, level=48, xp=9500)

    mock_res = MagicMock()
    mock_res.all.return_value = [(u1, 150), (u2, 120)]
    mock_db_session.execute.return_value = mock_res

    try:
        res = await anonymous_client.get("/api/leaderboard?category=elo&limit=10")
        assert res.status_code == 200
        data = res.json()
        assert data["category"] == "elo"
        assert len(data["top_players"]) == 2
        assert data["top_players"][0]["email"] == "magnus@chess.com"
        assert data["top_players"][0]["rank"] == 1
        assert data["top_players"][0]["puzzles_solved"] == 150
        assert data["my_rank"] is None
    finally:
        app.dependency_overrides.pop(get_async_session, None)
        app.dependency_overrides.pop(current_optional_user, None)


@pytest.mark.asyncio
async def test_get_leaderboard_user_in_top(authorized_client):
    client, user, db = authorized_client
    # Связываем текущего пользователя с опциональной зависимостью
    app.dependency_overrides[current_optional_user] = lambda: user

    other_user = make_player("top1@chess.com", elo=2500, level=20, xp=5000)

    mock_res = MagicMock()
    # Текущий пользователь на 2 месте
    mock_res.all.return_value = [(other_user, 50), (user, 25)]
    db.execute.return_value = mock_res

    try:
        res = await client.get("/api/leaderboard?category=level")
        assert res.status_code == 200
        data = res.json()
        assert data["category"] == "level"
        assert len(data["top_players"]) == 2
        assert data["my_rank"] is not None
        assert data["my_rank"]["rank"] == 2
        assert data["my_rank"]["puzzles_solved"] == 25
    finally:
        app.dependency_overrides.pop(current_optional_user, None)


@pytest.mark.asyncio
async def test_get_leaderboard_user_outside_top(authorized_client):
    client, user, db = authorized_client
    app.dependency_overrides[current_optional_user] = lambda: user

    u1 = make_player("pro@chess.com", elo=2000, level=10, xp=2000)

    mock_top = MagicMock()
    mock_top.all.return_value = [(u1, 30)]

    mock_puzzles_cnt = MagicMock()
    mock_puzzles_cnt.scalar_one_or_none.return_value = 5

    mock_rank_cnt = MagicMock()
    mock_rank_cnt.scalar_one_or_none.return_value = 42

    db.execute.side_effect = [mock_top, mock_puzzles_cnt, mock_rank_cnt]

    try:
        res = await client.get("/api/leaderboard?category=elo")
        assert res.status_code == 200
        data = res.json()
        assert len(data["top_players"]) == 1
        assert data["my_rank"] is not None
        assert data["my_rank"]["rank"] == 43  # 42 + 1
        assert data["my_rank"]["puzzles_solved"] == 5
    finally:
        app.dependency_overrides.pop(current_optional_user, None)


@pytest.mark.asyncio
async def test_get_leaderboard_by_puzzles(authorized_client):
    client, user, db = authorized_client
    app.dependency_overrides[current_optional_user] = lambda: user

    mock_top = MagicMock()
    mock_top.all.return_value = []
    mock_puzzles_cnt = MagicMock()
    mock_puzzles_cnt.scalar_one_or_none.return_value = 10
    mock_rank_cnt = MagicMock()
    mock_rank_cnt.scalar_one_or_none.return_value = 0

    db.execute.side_effect = [mock_top, mock_puzzles_cnt, mock_rank_cnt]

    try:
        res = await client.get("/api/leaderboard?category=puzzles")
        assert res.status_code == 200
        data = res.json()
        assert data["category"] == "puzzles"
        assert data["my_rank"] is not None
        assert data["my_rank"]["rank"] == 1
    finally:
        app.dependency_overrides.pop(current_optional_user, None)

@pytest.mark.asyncio
async def test_get_leaderboard_invalid_parameters(anonymous_client):
    # limit превышает допустимый максимум (le=100)
    res_limit = await anonymous_client.get("/api/leaderboard?limit=150")
    assert res_limit.status_code == 422

    # limit меньше допустимого минимума (ge=1)
    res_zero = await anonymous_client.get("/api/leaderboard?limit=0")
    assert res_zero.status_code == 422

    # несуществующая категория
    res_cat = await anonymous_client.get("/api/leaderboard?category=invalid_category")
    assert res_cat.status_code == 422


@pytest.mark.asyncio
async def test_get_leaderboard_empty_db(anonymous_client, mock_db_session):
    app.dependency_overrides[get_async_session] = lambda: mock_db_session
    app.dependency_overrides[current_optional_user] = lambda: None

    mock_res = MagicMock()
    mock_res.all.return_value = []
    mock_db_session.execute.return_value = mock_res

    try:
        res = await anonymous_client.get("/api/leaderboard")
        assert res.status_code == 200
        data = res.json()
        assert data["top_players"] == []
        assert data["my_rank"] is None
    finally:
        app.dependency_overrides.pop(get_async_session, None)
        app.dependency_overrides.pop(current_optional_user, None)


@pytest.mark.asyncio
async def test_get_leaderboard_user_outside_top_by_level(authorized_client):
    client, user, db = authorized_client
    app.dependency_overrides[current_optional_user] = lambda: user

    mock_top = MagicMock()
    mock_top.all.return_value = []

    mock_puzzles_cnt = MagicMock()
    mock_puzzles_cnt.scalar_one_or_none.return_value = 0

    mock_rank_cnt = MagicMock()
    mock_rank_cnt.scalar_one_or_none.return_value = 15

    db.execute.side_effect = [mock_top, mock_puzzles_cnt, mock_rank_cnt]

    try:
        res = await client.get("/api/leaderboard?category=level")
        assert res.status_code == 200
        data = res.json()
        assert data["category"] == "level"
        assert data["my_rank"]["rank"] == 16  # 15 + 1
        assert data["my_rank"]["puzzles_solved"] == 0
    finally:
        app.dependency_overrides.pop(current_optional_user, None)


@pytest.mark.asyncio
async def test_get_leaderboard_default_limit(anonymous_client, mock_db_session):
    app.dependency_overrides[get_async_session] = lambda: mock_db_session
    app.dependency_overrides[current_optional_user] = lambda: None

    mock_res = MagicMock()
    mock_res.all.return_value = []
    mock_db_session.execute.return_value = mock_res

    try:
        res = await anonymous_client.get("/api/leaderboard")
        assert res.status_code == 200
        data = res.json()
        assert data["category"] == "elo"
    finally:
        app.dependency_overrides.pop(get_async_session, None)
        app.dependency_overrides.pop(current_optional_user, None)