import re
import smtplib
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi_users import BaseUserManager
from fastapi_users.exceptions import UserAlreadyExists

from auth.manager import UserManager, get_user_manager
from auth.email_verification import email_delivery_configured, _send_message
from auth.models import User
from auth.schemas import UserUpdate
from auth.users_routes import _email_code_digest
from database import get_async_session
from server import app


def make_unverified_user(email: str = "newplayer@example.com"):
    user = MagicMock(spec=User)
    user.id = "user-id"
    user.email = email
    user.is_verified = False
    user.email_verification_code_hash = None
    user.email_verification_expires_at = None
    user.email_verification_sent_at = None
    user.email_verification_attempts = 0
    return user


def test_email_delivery_requires_encrypted_smtp_and_complete_credentials(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USERNAME", "coolchess")
    monkeypatch.setenv("SMTP_PASSWORD", "mail-password")
    monkeypatch.setenv("SMTP_STARTTLS", "false")
    monkeypatch.setenv("SMTP_USE_SSL", "false")
    assert email_delivery_configured() is False

    monkeypatch.setenv("SMTP_STARTTLS", "true")
    assert email_delivery_configured() is True

    monkeypatch.delenv("SMTP_PASSWORD")
    assert email_delivery_configured() is False


def test_mailru_ssl_delivery_accepts_common_recipient_domains(monkeypatch):
    for key in ("SMTP_HOST", "SMTP_PORT", "SMTP_FROM_EMAIL", "SMTP_STARTTLS", "SMTP_USE_SSL"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("SMTP_USERNAME", "coolchess@mail.ru")
    monkeypatch.setenv("SMTP_PASSWORD", "application-password")

    recipients = ("player@mail.ru", "player@gmail.com", "player@yandex.ru")
    sent_messages = []
    smtp_client = MagicMock()
    smtp_client.__enter__.return_value.send_message.side_effect = (
        lambda message: sent_messages.append(message)
    )

    with patch("auth.email_verification.smtplib.SMTP_SSL", return_value=smtp_client) as smtp_ssl:
        for recipient in recipients:
            _send_message(
                recipient,
                "Код подтверждения CoolChess",
                "Код подтверждения регистрации: 012345",
            )

    smtp_ssl.assert_called_with("smtp.mail.ru", 465, timeout=10)
    smtp_client.__enter__.return_value.login.assert_called_with(
        "coolchess@mail.ru", "application-password"
    )
    assert [message["To"] for message in sent_messages] == list(recipients)
    assert all("012345" in message.get_content() for message in sent_messages)


def test_password_strength_rejects_common_and_personal_passwords():
    from auth.schemas import validate_password_strength

    for weak_password in ("Password123!", "123456789012", "repeatAAAA!42"):
        with pytest.raises(ValueError):
            validate_password_strength(weak_password)
    with pytest.raises(ValueError, match="email"):
        validate_password_strength("NewPlayer!R0cks_2026", email="newplayer@example.com")
    assert validate_password_strength("N0tChess!R0cks_2026")


@pytest.mark.asyncio
async def test_registration_sends_code_and_verification_enables_account(anonymous_client, mock_db_session):
    user = make_unverified_user()
    manager = MagicMock()
    manager.create = AsyncMock(return_value=user)
    app.dependency_overrides[get_user_manager] = lambda: manager
    app.dependency_overrides[get_async_session] = lambda: mock_db_session
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db_session.execute.return_value = mock_result

    try:
        with (
            patch("auth.users_routes.email_delivery_configured", return_value=True),
            patch("auth.users_routes.send_verification_code", new_callable=AsyncMock) as send_code,
        ):
            response = await anonymous_client.post(
                "/api/auth/register",
                json={
                    "email": user.email,
                    "password": "N0tChess!R0cks_2026",
                    "display_name": "New Player",
                },
            )

        assert response.status_code == 202
        manager.create.assert_awaited_once()
        send_code.assert_awaited_once()
        code = send_code.await_args.args[1]
        assert re.fullmatch(r"\d{6}", code)
        assert user.email_verification_code_hash == _email_code_digest(code)
        assert user.email_verification_code_hash != code
        assert user.is_verified is False

        response = await anonymous_client.post(
            "/api/auth/verify-email",
            json={"email": user.email, "code": code},
        )
        assert response.status_code == 200
        assert user.is_verified is True
        assert user.email_verification_code_hash is None
        mock_db_session.commit.assert_awaited()
    finally:
        app.dependency_overrides.pop(get_user_manager, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_verification_rejects_wrong_code_and_increments_attempts(anonymous_client, mock_db_session):
    user = make_unverified_user()
    user.email_verification_code_hash = _email_code_digest("012345")
    user.email_verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_result.rowcount = 1
    mock_db_session.execute.return_value = mock_result
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    try:
        response = await anonymous_client.post(
            "/api/auth/verify-email",
            json={"email": user.email, "code": "999999"},
        )
        assert response.status_code == 400
        assert user.is_verified is False
        mock_db_session.commit.assert_awaited()
    finally:
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_registration_requires_smtp_configuration(anonymous_client):
    manager = MagicMock()
    manager.create = AsyncMock()
    app.dependency_overrides[get_user_manager] = lambda: manager

    try:
        with patch("auth.users_routes.email_delivery_configured", return_value=False):
            response = await anonymous_client.post(
                "/api/auth/register",
                json={
                    "email": "newplayer@example.com",
                    "password": "N0tChess!R0cks_2026",
                    "display_name": "New Player",
                },
            )
        assert response.status_code == 503
        assert "SMTP_USERNAME" in response.json()["detail"]
        assert "backend/.env" in response.json()["detail"]
        manager.create.assert_not_awaited()
    finally:
        app.dependency_overrides.pop(get_user_manager, None)


@pytest.mark.asyncio
async def test_registration_reports_mailru_authentication_failure(anonymous_client, mock_db_session):
    user = make_unverified_user()
    manager = MagicMock()
    manager.create = AsyncMock(return_value=user)
    app.dependency_overrides[get_user_manager] = lambda: manager
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    try:
        with (
            patch("auth.users_routes.email_delivery_configured", return_value=True),
            patch(
                "auth.users_routes.send_verification_code",
                new_callable=AsyncMock,
                side_effect=smtplib.SMTPAuthenticationError(535, b"auth failed"),
            ),
        ):
            response = await anonymous_client.post(
                "/api/auth/register",
                json={
                    "email": user.email,
                    "password": "N0tChess!R0cks_2026",
                    "display_name": "New Player",
                },
            )

        assert response.status_code == 502
        assert "535" in response.json()["detail"]
        assert "пароль приложения" in response.json()["detail"]
        assert user.email_verification_code_hash is None
    finally:
        app.dependency_overrides.pop(get_user_manager, None)
        app.dependency_overrides.pop(get_async_session, None)
@pytest.mark.asyncio
async def test_registration_resends_code_for_existing_unverified_account(anonymous_client, mock_db_session):
    user = make_unverified_user()
    manager = MagicMock()
    manager.create = AsyncMock(side_effect=UserAlreadyExists())
    app.dependency_overrides[get_user_manager] = lambda: manager
    app.dependency_overrides[get_async_session] = lambda: mock_db_session
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_db_session.execute.return_value = mock_result

    try:
        with (
            patch("auth.users_routes.email_delivery_configured", return_value=True),
            patch("auth.users_routes.send_verification_code", new_callable=AsyncMock) as send_code,
        ):
            response = await anonymous_client.post(
                "/api/auth/register",
                json={
                    "email": user.email,
                    "password": "N0tChess!R0cks_2026",
                    "display_name": "New Player",
                },
            )

        assert response.status_code == 202
        send_code.assert_awaited_once()
        assert user.email_verification_code_hash is not None
    finally:
        app.dependency_overrides.pop(get_user_manager, None)
        app.dependency_overrides.pop(get_async_session, None)


@pytest.mark.asyncio
async def test_user_manager_rejects_unverified_login():
    unverified_user = make_unverified_user()
    credentials = MagicMock()
    manager = UserManager.__new__(UserManager)
    with patch.object(BaseUserManager, "authenticate", new=AsyncMock(return_value=unverified_user)):
        assert await manager.authenticate(credentials) is None


@pytest.mark.asyncio
async def test_user_manager_rejects_email_change_without_confirmation():
    user = make_unverified_user("current@example.com")
    manager = UserManager.__new__(UserManager)

    with pytest.raises(HTTPException) as exc_info:
        await manager.update(UserUpdate(email="new@example.com"), user)

    assert exc_info.value.status_code == 400
