"""Тесты диплинк-привязки Telegram: POST /api/users/bind-token."""

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from auth.manager import current_active_user
from auth.models import User, UserRole
from database import get_async_session
from server import app


def _mock_student(**overrides):
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.email = "student@coolchess.com"
    user.display_name = "Тестовый игрок"
    user.is_active = True
    user.is_verified = True
    user.is_superuser = False
    user.role = UserRole.STUDENT
    user.telegram_id = None
    user.telegram_username = None
    user.bind_code = None
    user.bind_code_expires_at = None
    for key, value in overrides.items():
        setattr(user, key, value)
    return user


def _override_auth(mock_user, mock_db_session):
    app.dependency_overrides[current_active_user] = lambda: mock_user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_user
    mock_db_session.execute.return_value = mock_res


def _clear_auth_overrides():
    app.dependency_overrides.pop(current_active_user, None)
    app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_bind_token_unauthorized(anonymous_client):
    response = await anonymous_client.post("/api/users/bind-token")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_bind_token_success(anonymous_client, mock_db_session, monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_USERNAME", "CoolChessTestBot")
    mock_student = _mock_student()
    _override_auth(mock_student, mock_db_session)

    try:
        response = await anonymous_client.post("/api/users/bind-token")
        assert response.status_code == 200
        data = response.json()
        assert len(data["bind_token"]) >= 32
        assert mock_student.bind_code == data["bind_token"]
        assert mock_student.bind_code_expires_at > datetime.now(timezone.utc)
        assert data["bot_username"] == "CoolChessTestBot"
        assert data["deeplink"] == f"https://t.me/CoolChessTestBot?start=bind_{data['bind_token']}"
        mock_db_session.commit.assert_awaited()
    finally:
        _clear_auth_overrides()


@pytest.mark.asyncio
async def test_bind_token_conflict_when_linked(anonymous_client, mock_db_session):
    mock_student = _mock_student(telegram_id=123456)
    _override_auth(mock_student, mock_db_session)

    try:
        response = await anonymous_client.post("/api/users/bind-token")
        assert response.status_code == 409
    finally:
        _clear_auth_overrides()
