import os
import uuid
from typing import Optional
from dotenv import load_dotenv
from fastapi import Depends, Request, HTTPException, status
from fastapi_users import BaseUserManager, UUIDIDMixin, FastAPIUsers
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from auth.models import User, UserRole
from auth.db import get_user_db

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "super_secret_jwt_key_coolchess_2026")
VERIFY_SECRET = os.getenv("VERIFY_SECRET", "super_secret_verify_key_coolchess_2026")

# 1. JWT Транспорт через заголовок: Authorization: Bearer <token>
bearer_transport = BearerTransport(tokenUrl="api/auth/jwt/login")

def get_jwt_strategy() -> JWTStrategy:
    # Время жизни access-токена: 24 часа (86400 секунд)
    return JWTStrategy(secret=JWT_SECRET, lifetime_seconds=86400)

auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

# 2. Менеджер управления пользователями (регистрация, подтверждение, восстановление)
class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = VERIFY_SECRET
    verification_token_secret = VERIFY_SECRET

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        print(f"[CoolChess Auth] Пользователь {user.email} зарегистрирован.")

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        # Библиотека генерирует подписанный токен верификации
        print(f"[CoolChess Auth] Токен верификации для {user.email}: {token}")

async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)

# 3. Фабрика FastAPIUsers
fastapi_users = FastAPIUsers[User, uuid.UUID](
    get_user_manager,
    [auth_backend],
)

# Базовые зависимости доступа
current_active_user = fastapi_users.current_user(active=True)
current_verified_user = fastapi_users.current_user(active=True, verified=True)
current_superuser = fastapi_users.current_user(active=True, superuser=True)

# 4. Ролевой контроль доступа (RBAC)
def require_role(required_role: UserRole):
    async def role_checker(user: User = Depends(current_active_user)) -> User:
        if user.role != required_role and not user.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Доступ запрещен. Требуется роль: {required_role.value}"
            )
        return user
    return role_checker