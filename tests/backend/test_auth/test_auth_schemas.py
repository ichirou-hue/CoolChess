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
    assert user_data.role == UserRole.STUDENT
    assert user_data.elo_rating == 1200