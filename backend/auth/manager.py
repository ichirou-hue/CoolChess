import os
import uuid
import logging
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

logger = logging.getLogger(__name__)

# Окружение: development | production | test
ENV = os.getenv("ENV", "development")

# Безопасное считывание секретов.
# В dev/prod отсутствие секретов — жесткая ошибка запуска, а не молчаливый
# fallback: иначе сервер подпишет JWT известным из исходников ключом.
JWT_SECRET = os.getenv("JWT_SECRET")
VERIFY_SECRET = os.getenv("VERIFY_SECRET")

if not JWT_SECRET or not VERIFY_SECRET:
    under_pytest = "PYTEST_CURRENT_TEST" in os.environ
    if ENV in ("test", "testing") or under_pytest:
        # Запасной fallback только для локальных автотестов, если переменные не были проброшены
        JWT_SECRET = JWT_SECRET or "super_secret_jwt_key_coolchess_2026_fallback"
        VERIFY_SECRET = VERIFY_SECRET or "super_secret_verify_key_coolchess_2026_fallback"
        logger.warning("Внимание: JWT_SECRET или VERIFY_SECRET не найдены в .env, используются дефолтные тестовые ключи.")
    else:
        raise RuntimeError(
            "JWT_SECRET и VERIFY_SECRET обязаны быть заданы в окружении "
            f"(текущее ENV={ENV!r}). Сгенерируйте их и положите в backend/.env."
        )

# Лидирующий слэш обязателен для корректной авторизации через Swagger UI (/docs)
bearer_transport = BearerTransport(tokenUrl="/api/auth/jwt/login")


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=JWT_SECRET, lifetime_seconds=86400)


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = VERIFY_SECRET
    verification_token_secret = VERIFY_SECRET

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        logger.info(f"[CoolChess Auth] Пользователь {user.email} зарегистрирован.")

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        # Токен намеренно не логируем: это секрет, эквивалентный паролю.
        logger.info(f"[CoolChess Auth] Запрошена верификация для {user.email}.")


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)


fastapi_users = FastAPIUsers[User, uuid.UUID](
    get_user_manager,
    [auth_backend],
)

# Зависимости аутентификации
current_active_user = fastapi_users.current_user(active=True)
current_verified_user = fastapi_users.current_user(active=True, verified=True)
current_superuser = fastapi_users.current_user(active=True, superuser=True)
current_optional_user = fastapi_users.current_user(active=True, optional=True)


# Гибкий ролевой контроль (RBAC)
def require_role(*allowed_roles: UserRole):
    """
    Разрешает доступ пользователю, если его роль присутствует в allowed_roles,
    либо если он является superuser.
    """
    async def role_checker(user: User = Depends(current_active_user)) -> User:
        if user.is_superuser:
            return user

        if user.role not in allowed_roles:
            role_names = ", ".join([r.value for r in allowed_roles])
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Доступ запрещен. Требуется роль: {role_names}",
            )
        return user

    return role_checker


async def require_superuser(user: User = Depends(current_active_user)) -> User:
    """
    Доступ только для superuser. Отдельная зависимость (а не голый
    current_superuser из fastapi-users), чтобы проверку можно было
    покрыть тестами через подмену current_active_user.
    """
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ запрещен. Требуются права администратора.",
        )
    return user