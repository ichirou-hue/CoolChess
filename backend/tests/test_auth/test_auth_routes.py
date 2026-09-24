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
    mock_admin = create_mock_user(role=UserRole.STUDENT, is_superuser=True, email="admin@coolchess.com")
    app.dependency_overrides[current_active_user] = lambda: mock_admin

    try:
        response = await anonymous_client.get("/api/coach/dashboard")
        assert response.status_code == 200
    finally:
        app.dependency_overrides.pop(current_active_user, None)


# --- 3. ТЕСТЫ ВЕРИФИКАЦИИ И СИНХРОНИЗАЦИИ LICHESS ---

@pytest.mark.asyncio
async def test_sync_lichess_unauthorized(anonymous_client):
    response = await anonymous_client.post("/api/users/sync-lichess", json={"lichess_username": "magnuscarlsen"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_lichess_verification_code(anonymous_client):
    mock_student = create_mock_user(role=UserRole.STUDENT)
    app.dependency_overrides[current_active_user] = lambda: mock_student

    try:
        response = await anonymous_client.get("/api/users/lichess-verification-code")
        assert response.status_code == 200
        data = response.json()
        assert "coolchess-verify-" in data["verification_code"]
        assert data["verification_code"] in data["instructions"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)


@pytest.mark.asyncio
async def test_sync_lichess_fails_without_verification_code_in_bio(anonymous_client, mock_db_session):
    mock_student = create_mock_user(role=UserRole.STUDENT)
    app.dependency_overrides[current_active_user] = lambda: mock_student
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    fake_lichess_data = {
        "username": "MagnusCarlsen",
        "bio": "Just a normal chess fan bio without secret token",
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

            assert response.status_code == 400
            assert "не найден в профиле Lichess" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_sync_lichess_success_with_verification_code(anonymous_client, mock_db_session):
    mock_student = create_mock_user(role=UserRole.STUDENT)
    mock_student.games_played = 0
    mock_student.elo_rating = 1200

    app.dependency_overrides[current_active_user] = lambda: mock_student
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    code = f"coolchess-verify-{str(mock_student.id)[:8]}"
    fake_lichess_data = {
        "username": "MagnusCarlsen",
        "bio": f"Hello world! Verifying: {code}",
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
            assert data["updated_elo"] == 2820
            assert mock_student.lichess_username == "MagnusCarlsen"
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)