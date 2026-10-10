import pytest
from fastapi import HTTPException
from auth.models import UserRole
from auth.schemas import normalize_and_validate_email, UserCreate, UserUpdate


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
        "password": "N0tChess!R0cks_2026",
        "display_name": "Ученик",
    }
    user_data = UserCreate(**payload)
    assert user_data.display_name == "Ученик"
    # Роль и стартовый Elo назначаются сервером (дефолты модели),
    # в схеме регистрации этих полей быть не должно.
    assert "role" not in UserCreate.model_fields
    assert "elo_rating" not in UserCreate.model_fields


def test_user_create_normalizes_display_name():
    user_data = UserCreate(
        email="student@chess.org",
        password="N0tChess!R0cks_2026",
        display_name="  Сильный   Игрок  ",
    )
    assert user_data.display_name == "Сильный Игрок"


def test_user_create_rejects_blank_display_name():
    with pytest.raises(ValueError):
        UserCreate(
            email="student@chess.org",
            password="N0tChess!R0cks_2026",
            display_name="   ",
        )


def test_user_create_schema_ignores_privilege_escalation():
    # Попытка зарегистрироваться тренером: поле role игнорируется,
    # пользователь всегда создается с серверным дефолтом STUDENT.
    user_data = UserCreate(
        email="attacker@chess.org",
        password="N0tChess!R0cks_2026",
        display_name="Игрок",
        role="coach",  # type: ignore[call-arg] — лишнее поле отбрасывается
    )
    assert getattr(user_data, "role", None) is None


def test_user_update_normalizes_email_single_account():
    # PATCH /api/users/me обязан нормализовать email той же логикой,
    # что регистрация: иначе можно записать +алиас/регистр/точки Gmail
    # и завести второй аккаунт на тот же почтовый ящик.
    assert UserUpdate(email="Test+Spam@Example.COM").email == "test@example.com"
    assert UserUpdate(email="F.I.R.S.T@gmail.com").email == "first@gmail.com"


def test_user_update_none_email_stays_none():
    assert UserUpdate().email is None