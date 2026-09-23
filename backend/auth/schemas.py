import uuid
from pydantic import field_validator
from fastapi import HTTPException, status
from fastapi_users import schemas
from disposable_email_domains import blocklist
from auth.models import UserRole

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


# Схема регистрации нового пользователя с проверкой безопасности
class UserCreate(schemas.BaseUserCreate):
    role: UserRole = UserRole.STUDENT
    elo_rating: int = 1200

    @field_validator("email")
    @classmethod
    def validate_email_safety(cls, v: str) -> str:
        return normalize_and_validate_email(v)


# Схема обновления профиля
class UserUpdate(schemas.BaseUserUpdate):
    role: UserRole | None = None
    elo_rating: int | None = None