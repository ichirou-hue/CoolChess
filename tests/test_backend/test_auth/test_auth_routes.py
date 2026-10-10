import uuid
from datetime import datetime, timedelta, timezone
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
    user.display_name = "Тестовый игрок"
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
    user.lichess_verification_code = None
    user.lichess_verification_username = None
    user.lichess_verification_expires_at = None
    user.lichess_verification_attempts = 0
    user.chesscom_verification_code = None
    user.chesscom_verification_username = None
    user.chesscom_verification_expires_at = None
    user.chesscom_verification_attempts = 0
    user.chesscom_username = None
    user.chesscom_blitz_rating = None
    user.chesscom_rapid_rating = None
    user.chesscom_bullet_rating = None
    user.chesscom_daily_rating = None
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
        assert data["display_name"] == mock_student.display_name
        assert data["role"] == UserRole.STUDENT.value
        assert data["elo_rating"] == 1350
        assert data["xp"] == 150
        assert data["level"] == 2
        assert data["coins"] == 20
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
async def test_get_lichess_verification_code_generates_and_reuses(anonymous_client, mock_db_session):
    mock_student = create_mock_user(role=UserRole.STUDENT)
    app.dependency_overrides[current_active_user] = lambda: mock_student
    app.dependency_overrides[get_async_session] = lambda: mock_db_session
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_student
    mock_db_session.execute.return_value = mock_res

    try:
        # Legacy endpoint remains compatible but issues a fresh expiring code.
        response = await anonymous_client.get("/api/users/lichess-verification-code")
        assert response.status_code == 200
        data = response.json()
        assert data["verification_code"].startswith("coolchess-verify-")
        assert data["verification_code"] in data["instructions"]
        assert mock_student.lichess_verification_code == data["verification_code"]
        assert mock_student.lichess_verification_expires_at > datetime.now(timezone.utc)
        mock_db_session.commit.assert_awaited()

        # A reissue rotates the secret rather than extending its lifetime.
        response2 = await anonymous_client.get("/api/users/lichess-verification-code")
        assert response2.json()["verification_code"] != data["verification_code"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_sync_lichess_requires_issued_code(anonymous_client, mock_db_session):
    # У пользователя нет выданного кода — просим сначала получить его
    mock_student = create_mock_user(role=UserRole.STUDENT)
    app.dependency_overrides[current_active_user] = lambda: mock_student
    app.dependency_overrides[get_async_session] = lambda: mock_db_session
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_student
    mock_db_session.execute.return_value = mock_res

    try:
        with patch("auth.users_routes.lichess_service.fetch_user_profile", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = {
                "username": "MagnusCarlsen",
                "bio": "Just a normal chess fan bio",
                "blitz_rating": 2850,
                "rapid_rating": 2820,
                "puzzle_rating": 2900,
            }

            response = await anonymous_client.post(
                "/api/users/sync-lichess",
                json={"lichess_username": "MagnusCarlsen"}
            )

            assert response.status_code == 400
            assert "проверочный код" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_sync_lichess_fails_without_verification_code_in_bio(anonymous_client, mock_db_session):
    mock_student = create_mock_user(role=UserRole.STUDENT)
    mock_student.lichess_verification_code = "coolchess-abc12345"
    mock_student.lichess_verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    app.dependency_overrides[current_active_user] = lambda: mock_student
    app.dependency_overrides[get_async_session] = lambda: mock_db_session
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_student
    mock_db_session.execute.return_value = mock_res

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
            assert "не найден в поле Bio профиля lichess" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_sync_lichess_success_with_verification_code(anonymous_client, mock_db_session):
    mock_student = create_mock_user(role=UserRole.STUDENT)
    mock_student.games_played = 0
    mock_student.elo_rating = 1000

    app.dependency_overrides[current_active_user] = lambda: mock_student
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    code = "coolchess-abc12345"
    mock_student.lichess_verification_code = code
    mock_student.lichess_verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_student
    mock_db_session.execute.return_value = mock_res
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


@pytest.mark.asyncio
async def test_platform_verification_code_is_bound_to_username_and_expires(
    anonymous_client, mock_db_session
):
    user = create_mock_user()
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db_session.execute.return_value = mock_result

    try:
        response = await anonymous_client.post(
            "/api/users/platform-verification-code",
            json={"platform": "chesscom", "username": "Player_One"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["verification_code"].startswith("coolchess-verify-")
        assert data["platform"] == "chesscom"
        assert data["username"] == "Player_One"
        assert "Location" in data["instructions"]
        assert user.chesscom_verification_code == data["verification_code"]
        assert user.chesscom_verification_username == "Player_One"
        assert user.chesscom_verification_expires_at > datetime.now(timezone.utc)
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_verify_platform_lichess_bio_saves_ratings_and_consumes_code(
    anonymous_client, mock_db_session
):
    user = create_mock_user()
    user.games_played = 0
    user.elo_rating = 1000
    code = "coolchess-verify-a1b2c3d4"
    user.lichess_verification_code = code
    user.lichess_verification_username = "MagnusCarlsen"
    user.lichess_verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db_session.execute.return_value = mock_result
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    try:
        with patch(
            "auth.users_routes.lichess_service.fetch_user_profile",
            new_callable=AsyncMock,
            return_value={
                "username": "MagnusCarlsen",
                "bio": f"Verified: {code}",
                "blitz_rating": 2800,
                "rapid_rating": 2750,
                "puzzle_rating": 2900,
            },
        ) as fetch_profile:
            response = await anonymous_client.post(
                "/api/users/verify-platform-account",
                json={"platform": "lichess", "username": "MagnusCarlsen"},
            )

        assert response.status_code == 200
        assert response.json()["lichess_rapid_rating"] == 2750
        assert user.lichess_username == "MagnusCarlsen"
        assert user.elo_rating == 2750
        assert user.lichess_verification_code is None
        assert user.lichess_verification_expires_at is None
        fetch_profile.assert_awaited_once_with("MagnusCarlsen")
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_verify_platform_chesscom_location_saves_public_ratings(
    anonymous_client, mock_db_session
):
    user = create_mock_user()
    code = "coolchess-verify-a1b2c3d4"
    user.chesscom_verification_code = code
    user.chesscom_verification_username = "Player_One"
    user.chesscom_verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db_session.execute.return_value = mock_result
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    try:
        with (
            patch(
                "auth.users_routes.chesscom_service.fetch_player_profile",
                new_callable=AsyncMock,
                return_value={"username": "Player_One", "location": f"Berlin {code}", "bio": "", "status": ""},
            ),
            patch(
                "auth.users_routes.chesscom_service.fetch_player_stats",
                new_callable=AsyncMock,
                return_value={
                    "username": "Player_One",
                    "rapid_rating": 1900,
                    "blitz_rating": 1800,
                    "bullet_rating": 1700,
                    "daily_rating": 1600,
                },
            ),
        ):
            response = await anonymous_client.post(
                "/api/users/verify-platform-account",
                json={"platform": "chesscom", "username": "Player_One"},
            )

        assert response.status_code == 200
        assert response.json()["chesscom_rapid_rating"] == 1900
        assert response.json()["chesscom_blitz_rating"] == 1800
        assert user.chesscom_username == "Player_One"
        assert user.chesscom_verification_code is None
        assert user.chesscom_verification_expires_at is None
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_verify_platform_rejects_expired_code(anonymous_client, mock_db_session):
    user = create_mock_user()
    user.lichess_verification_code = "coolchess-verify-a1b2c3d4"
    user.lichess_verification_username = "MagnusCarlsen"
    user.lichess_verification_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db_session.execute.return_value = mock_result
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    try:
        with patch("auth.users_routes.lichess_service.fetch_user_profile", new_callable=AsyncMock) as fetch_profile:
            response = await anonymous_client.post(
                "/api/users/verify-platform-account",
                json={"platform": "lichess", "username": "MagnusCarlsen"},
            )
        assert response.status_code == 400
        assert "Срок действия кода истёк" in response.json()["detail"]
        assert user.lichess_verification_code is None
        fetch_profile.assert_not_awaited()
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_verify_platform_missing_profile_code_increments_attempts(
    anonymous_client, mock_db_session
):
    user = create_mock_user()
    user.chesscom_verification_code = "coolchess-verify-a1b2c3d4"
    user.chesscom_verification_username = "Player_One"
    user.chesscom_verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db_session.execute.return_value = mock_result
    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    try:
        with (
            patch(
                "auth.users_routes.chesscom_service.fetch_player_profile",
                new_callable=AsyncMock,
                return_value={"username": "Player_One", "location": "Berlin", "bio": "", "status": ""},
            ),
            patch(
                "auth.users_routes.chesscom_service.fetch_player_stats",
                new_callable=AsyncMock,
                return_value={"username": "Player_One"},
            ),
        ):
            response = await anonymous_client.post(
                "/api/users/verify-platform-account",
                json={"platform": "chesscom", "username": "Player_One"},
            )
        assert response.status_code == 400
        assert "Location" in response.json()["detail"]
        assert user.chesscom_verification_attempts == 1
        assert user.chesscom_username is None
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


# --- 4. ТЕСТЫ СМЕНЫ РОЛИ АДМИНИСТРАТОРОМ ---

@pytest.mark.asyncio
async def test_set_user_role_forbidden_for_student(anonymous_client):
    mock_student = create_mock_user(role=UserRole.STUDENT)
    app.dependency_overrides[current_active_user] = lambda: mock_student

    try:
        response = await anonymous_client.patch(
            f"/api/admin/users/{uuid.uuid4()}/role",
            json={"role": "coach"},
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(current_active_user, None)


@pytest.mark.asyncio
async def test_set_user_role_success_for_superuser(anonymous_client, mock_db_session):
    mock_admin = create_mock_user(role=UserRole.STUDENT, is_superuser=True, email="admin@coolchess.com")
    target = create_mock_user(role=UserRole.STUDENT, email="target@coolchess.com")
    app.dependency_overrides[current_active_user] = lambda: mock_admin
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = target
    mock_db_session.execute.return_value = mock_res

    try:
        response = await anonymous_client.patch(
            f"/api/admin/users/{target.id}/role",
            json={"role": "coach"},
        )
        assert response.status_code == 200
        assert response.json()["role"] == "coach"
        assert target.role == UserRole.COACH
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_set_user_role_not_found(anonymous_client, mock_db_session):
    mock_admin = create_mock_user(role=UserRole.STUDENT, is_superuser=True, email="admin@coolchess.com")
    app.dependency_overrides[current_active_user] = lambda: mock_admin
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = None
    mock_db_session.execute.return_value = mock_res

    try:
        response = await anonymous_client.patch(
            f"/api/admin/users/{uuid.uuid4()}/role",
            json={"role": "coach"},
        )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(current_active_user, None)
        app.dependency_overrides.pop(get_async_session, None)