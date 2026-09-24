import uuid
from unittest.mock import MagicMock, AsyncMock, patch
import pytest

from auth.models import User, UserRole
from auth.manager import current_active_user
from database import get_async_session
from server import app


def create_mock_user(role=UserRole.STUDENT, is_superuser=False, email="student@coolchess.com"):
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.email = email
    user.is_active = True
    user.is_verified = True
    user.is_superuser = is_superuser
    user.role = role
    user.elo_rating = 1350
    user.xp = 150
    user.level = 2
    user.coins = 20
    user.games_played = 5
    user.lichess_username = None
    user.lichess_blitz_rating = None
    user.lichess_rapid_rating = None
    user.lichess_puzzle_rating = None
    return user


# --- 1. ТЕСТЫ ЭНДПОИНТА /api/me/profile ---

@pytest.mark.asyncio
async def test_get_profile_unauthorized(anonymous_client):
    response = await anonymous_client.get("/api/me/profile")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_profile_authorized(anonymous_client):
    mock_student = create_mock_user(role=UserRole.STUDENT)
    app.dependency_overrides[current_active_user] = lambda: mock_student

    try:
        response = await anonymous_client.get("/api/me/profile")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == mock_student.email
        assert data["role"] == UserRole.STUDENT.value
        assert data["elo"] == 1350
    finally:
        app.dependency_overrides.pop(current_active_user, None)


# --- 2. ТЕСТЫ РОЛЕВОГО ДОСТУПА (RBAC) ДЛЯ /api/coach/dashboard ---

@pytest.mark.asyncio
async def test_coach_dashboard_unauthorized(anonymous_client):
    response = await anonymous_client.get("/api/coach/dashboard")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_coach_dashboard_forbidden_for_student(anonymous_client):
    """Студент не имеет прав тренера и получает 403 Forbidden."""
    mock_student = create_mock_user(role=UserRole.STUDENT)
    app.dependency_overrides[current_active_user] = lambda: mock_student

    try:
        response = await anonymous_client.get("/api/coach/dashboard")
        assert response.status_code == 403
        assert "Требуется роль: coach" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)


@pytest.mark.asyncio
async def test_coach_dashboard_success_for_coach(anonymous_client):
    """Пользователь с ролью COACH успешно заходит в панель."""
    mock_coach = create_mock_user(role=UserRole.COACH, email="coach@coolchess.com")
    app.dependency_overrides[current_active_user] = lambda: mock_coach

    try:
        response = await anonymous_client.get("/api/coach/dashboard")
        assert response.status_code == 200
        assert "Добро пожаловать в тренерскую панель" in response.json()["message"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)


@pytest.mark.asyncio
async def test_coach_dashboard_allowed_for_superuser(anonymous_client):
    """Суперпользователь (админ) может обходить ролевые ограничения."""
    mock_admin = create_mock_user(role=UserRole.STUDENT, is_superuser=True, email="admin@coolchess.com")
    app.dependency_overrides[current_active_user] = lambda: mock_admin

    try:
        response = await anonymous_client.get("/api/coach/dashboard")
        assert response.status_code == 200
    finally:
        app.dependency_overrides.pop(current_active_user, None)


# --- 3. ТЕСТЫ СИНХРОНИЗАЦИИ С LICHESS API ---

@pytest.mark.asyncio
async def test_sync_lichess_unauthorized(anonymous_client):
    response = await anonymous_client.post("/api/users/sync-lichess", json={"lichess_username": "magnuscarlsen"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_sync_lichess_success_calibrates_elo(anonymous_client, mock_db_session):
    mock_student = create_mock_user(role=UserRole.STUDENT)
    mock_student.games_played = 0
    mock_student.elo_rating = 1200

    app.dependency_overrides[current_active_user] = lambda: mock_student
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    fake_lichess_data = {
        "username": "MagnusCarlsen",
        "blitz_rating": 2850,
        "rapid_rating": 2820,
        "puzzle_rating": 2900,
    }

    try:
        with patch("auth.users_routes.lichess_service.fetch_user_profile", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = fake_lichess_data

            response = await anonymous_client.post(
                "/api/users/sync-lichess",
                json={"lichess_username": "MagnusCarlsen"}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["lichess_username"] == "MagnusCarlsen"
            assert data["lichess_rapid_rating"] == 2820
            assert data["lichess_blitz_rating"] == 2850
            assert data["updated_elo"] == 2820  # Новичок откалибровался по Rapid
            assert mock_student.lichess_username == "MagnusCarlsen"
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)