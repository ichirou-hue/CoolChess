import uuid
import pytest
from unittest.mock import MagicMock
from auth.models import User, UserRole
from auth.manager import current_active_user
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

    response = await anonymous_client.get("/api/me/profile")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == mock_student.email
    assert data["role"] == UserRole.STUDENT.value
    assert data["elo"] == 1350

    app.dependency_overrides.clear()


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

    response = await anonymous_client.get("/api/coach/dashboard")
    assert response.status_code == 403
    assert "Требуется роль: coach" in response.json()["detail"]

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_coach_dashboard_success_for_coach(anonymous_client):
    """Пользователь с ролью COACH успешно заходит в панель."""
    mock_coach = create_mock_user(role=UserRole.COACH, email="coach@coolchess.com")
    app.dependency_overrides[current_active_user] = lambda: mock_coach

    response = await anonymous_client.get("/api/coach/dashboard")
    assert response.status_code == 200
    assert "Добро пожаловать в тренерскую панель" in response.json()["message"]

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_coach_dashboard_allowed_for_superuser(anonymous_client):
    """Суперпользователь (админ) может обходить ролевые ограничения."""
    mock_admin = create_mock_user(role=UserRole.STUDENT, is_superuser=True, email="admin@coolchess.com")
    app.dependency_overrides[current_active_user] = lambda: mock_admin

    response = await anonymous_client.get("/api/coach/dashboard")
    assert response.status_code == 200

    app.dependency_overrides.clear()