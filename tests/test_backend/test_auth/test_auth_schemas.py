import pytest
from fastapi import HTTPException
from auth.models import UserRole
from auth.schemas import normalize_and_validate_email, UserCreate


def test_normalize_email_lowercase_and_strip():
    raw = "   Player@Example.COM   "
    assert normalize_and_validate_email(raw) == "player@example.com"


def test_normalize_email_plus_tag_removed():
    raw = "magnus+test1234@coolchess.com"
    assert normalize_and_validate_email(raw) == "magnus@coolchess.com"


def test_normalize_email_gmail_dots_removed():
    raw = "m.a.g.n.u.s@gmail.com"
    assert normalize_and_validate_email(raw) == "magnus@gmail.com"


def test_normalize_email_disposable_domain_blocked():
    # mailinator.com и 10minutemail.com входят в стандартный blocklist disposable_email_domains
    with pytest.raises(HTTPException) as exc_info:
        normalize_and_validate_email("cheater@mailinator.com")
    assert exc_info.value.status_code == 400
    assert "одноразовых" in exc_info.value.detail


def test_normalize_email_invalid_format():
    with pytest.raises(HTTPException) as exc_info:
        normalize_and_validate_email("not_an_email_address")
    assert exc_info.value.status_code == 400


def test_user_create_schema_defaults():
    payload = {
        "email": "student@chess.org",
        "password": "strong_password_123",
    }
    user_data = UserCreate(**payload)
    # Роль и стартовый Elo назначаются сервером (дефолты модели),
    # в схеме регистрации этих полей быть не должно.
    assert "role" not in UserCreate.model_fields
    assert "elo_rating" not in UserCreate.model_fields


def test_user_create_schema_ignores_privilege_escalation():
    # Попытка зарегистрироваться тренером: поле role игнорируется,
    # пользователь всегда создается с серверным дефолтом STUDENT.
    user_data = UserCreate(
        email="attacker@chess.org",
        password="strong_password_123",
        role="coach",  # type: ignore[call-arg] — лишнее поле отбрасывается
    )
    assert getattr(user_data, "role", None) is None