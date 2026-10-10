import uuid
import re
from pydantic import field_validator
from fastapi import HTTPException, status
from fastapi_users import schemas
from disposable_email_domains import blocklist
from auth.models import UserRole
from pydantic import BaseModel, Field
from typing import Optional

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
    role: UserRole
    elo_rating: int
    display_name: Optional[str] = None


# Схема регистрации нового пользователя с проверкой безопасности.
#
# ВАЖНО: роль и стартовый Elo назначаются только сервером
# (дефолты колонок в models.User). Клиент не может передать их
# в теле запроса — иначе любой мог бы зарегистрироваться тренером.
class UserCreate(schemas.BaseUserCreate):
    display_name: str = Field(..., min_length=3, max_length=24)

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not re.fullmatch(r"[\w-]{3,24}", cleaned, flags=re.UNICODE):
            raise ValueError("Никнейм должен содержать 3–24 буквы, цифры, дефис или подчёркивание.")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_email_safety(cls, v: str) -> str:
        return normalize_and_validate_email(v)

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
