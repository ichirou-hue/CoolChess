import enum
import uuid
from datetime import datetime
from pydantic import field_validator, model_validator
from fastapi import HTTPException, status
from fastapi_users import schemas
from disposable_email_domains import blocklist
from auth.models import UserRole
from pydantic import BaseModel, Field
from typing import Optional
import re


def validate_password_strength(
    password: str,
    email: Optional[str] = None,
    display_name: Optional[str] = None,
) -> str:
    normalized = password.casefold()
    if len(password) < 12:
        raise ValueError("Пароль должен содержать не менее 12 символов.")

    character_classes = (
        any(char.islower() for char in password),
        any(char.isupper() for char in password),
        any(char.isdigit() for char in password),
        any(not char.isalnum() for char in password),
    )
    if sum(character_classes) < 3:
        raise ValueError(
            "Добавьте в пароль символы как минимум трёх типов: "
            "строчные и заглавные буквы, цифры, специальные символы."
        )

    weak_patterns = (
        "password",
        "qwerty",
        "letmein",
        "welcome",
        "admin",
        "iloveyou",
        "abc123",
        "123456",
    )
    if any(pattern in normalized for pattern in weak_patterns):
        raise ValueError("Пароль содержит слишком распространённую комбинацию.")
    if re.search(r"(.)\1{3,}", normalized):
        raise ValueError("Не используйте четыре одинаковых символа подряд.")
    if any(sequence in normalized for sequence in ("012345", "123456", "234567", "987654", "876543", "654321")):
        raise ValueError("Не используйте последовательность цифр в пароле.")

    personal_terms = []
    if email:
        personal_terms.append(email.split("@", 1)[0].casefold())
    if display_name:
        personal_terms.extend(
            part.casefold()
            for part in re.findall(r"[^\W_]+", display_name, flags=re.UNICODE)
        )
    if any(len(term) >= 3 and term in normalized for term in personal_terms):
        raise ValueError("Пароль не должен содержать имя или часть email.")
    return password

def normalize_and_validate_email(email: str) -> str:
    cleaned = email.strip().lower()
    if "@" not in cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректный формат email адреса."
        )
    
    name_part, domain = cleaned.split("@", 1)
    
    # 1. Проверка по готовому открытому списку временных ящиков
    if domain in blocklist:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Использование одноразовых почтовых адресов запрещено."
        )
        
    # 2. Защита от мультиаккаунтов: убираем суффиксы после '+' (name+spam@domain -> name@domain)
    if "+" in name_part:
        name_part = name_part.split("+")[0]
        
    # 3. Для Gmail убираем точки (n.a.m.e@gmail.com -> name@gmail.com)
    if domain in ("gmail.com", "googlemail.com"):
        name_part = name_part.replace(".", "")
        
    return f"{name_part}@{domain}"


# Схема отдачи профиля наружу
class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: str
    role: UserRole
    elo_rating: int


# Схема регистрации нового пользователя с проверкой безопасности.
#
# ВАЖНО: роль и стартовый Elo назначаются только сервером
# (дефолты колонок в models.User). Клиент не может передать их
# в теле запроса — иначе любой мог бы зарегистрироваться тренером.
class UserCreate(schemas.BaseUserCreate):
    display_name: str = Field(..., min_length=2, max_length=32)

    @field_validator("password")
    @classmethod
    def validate_password_policy(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Имя должно содержать не менее 2 символов.")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_email_safety(cls, v: str) -> str:
        return normalize_and_validate_email(v)


class EmailVerificationRequest(BaseModel):
    email: str
    code: str = Field(..., pattern=r"^\d{6}$")

    @field_validator("email")
    @classmethod
    def validate_email_safety(cls, value: str) -> str:
        return normalize_and_validate_email(value)


class EmailResendRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email_safety(cls, value: str) -> str:
        return normalize_and_validate_email(value)


# Схема обновления профиля.
# Роль и Elo здесь отсутствуют намеренно: их меняет только
# администратор через PATCH /api/admin/users/{id}/role.
# Email нормализуем той же функцией, что при регистрации:
# иначе через PATCH /api/users/me можно было записать
# ненормализованный адрес (верхний регистр, +алиас, точки Gmail)
# и обойти защиту "1 почта = 1 аккаунт".
class UserUpdate(schemas.BaseUserUpdate):
    @field_validator("email")
    @classmethod
    def validate_email_safety(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return normalize_and_validate_email(v)


class RoleUpdateRequest(BaseModel):
    role: UserRole = Field(..., description="Новая роль пользователя")


class ChessPlatform(str, enum.Enum):
    LICHESS = "lichess"
    CHESSCOM = "chesscom"


class PlatformVerificationRequest(BaseModel):
    platform: ChessPlatform
    username: str = Field(..., min_length=2, max_length=50)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Укажите никнейм шахматного аккаунта.")
        return cleaned

    @model_validator(mode="after")
    def validate_platform_username(self):
        pattern = (
            r"^[A-Za-z0-9_-]{2,30}$"
            if self.platform == ChessPlatform.LICHESS
            else r"^[A-Za-z0-9_-]{2,25}$"
        )
        if not re.fullmatch(pattern, self.username):
            raise ValueError("Никнейм содержит недопустимые символы или имеет неверную длину.")
        return self


class PlatformVerificationCodeResponse(BaseModel):
    platform: ChessPlatform
    username: str
    verification_code: str
    expires_at: datetime
    instructions: str


class PlatformAccountLinkResponse(BaseModel):
    platform: ChessPlatform
    username: str
    message: str
    updated_elo: Optional[int] = None
    lichess_blitz_rating: Optional[int] = None
    lichess_rapid_rating: Optional[int] = None
    lichess_puzzle_rating: Optional[int] = None
    chesscom_blitz_rating: Optional[int] = None
    chesscom_rapid_rating: Optional[int] = None
    chesscom_bullet_rating: Optional[int] = None
    chesscom_daily_rating: Optional[int] = None


class LichessSyncRequest(BaseModel):
    lichess_username: str = Field(..., min_length=2, max_length=50, description="Никнейм на lichess.org")


class LichessSyncResponse(BaseModel):
    lichess_username: str
    lichess_blitz_rating: Optional[int] = None
    lichess_rapid_rating: Optional[int] = None
    lichess_puzzle_rating: Optional[int] = None
    updated_elo: int
    message: str

class LichessVerificationCodeResponse(BaseModel):
    verification_code: str
    instructions: str


class ChessComSyncRequest(BaseModel):
    chesscom_username: str = Field(..., min_length=2, max_length=25, description="Публичный ник на Chess.com")


class ChessComSyncResponse(BaseModel):
    chesscom_username: str
    chesscom_blitz_rating: Optional[int] = None
    chesscom_rapid_rating: Optional[int] = None
    chesscom_bullet_rating: Optional[int] = None
    chesscom_daily_rating: Optional[int] = None
    message: str
