import os
import uuid
import logging
from pathlib import Path
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
from auth.schemas import normalize_and_validate_email

# Load env files by project path, independent of the process working directory.
# The root .env is canonical for local development; backend/.env is a fallback
# for setups that only created the backend-specific file (for example Docker).
BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_ENV = BACKEND_DIR.parent / ".env"
BACKEND_ENV = BACKEND_DIR / ".env"
load_dotenv(dotenv_path=ROOT_ENV)
load_dotenv(dotenv_path=BACKEND_ENV, override=False)

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

    async def authenticate(self, credentials):
        """Логин с той же нормализацией email, что при регистрации.

        Без этого пользователь, зарегистрировавшийся как
        `Ivan.Petrov+chess@gmail.com` (в БД лежит `ivanpetrov@gmail.com`),
        не смог бы войти под исходным адресом: поиск шёл бы по
        ненормализованной строке и возвращал LOGIN_BAD_CREDENTIALS.
        """
        try:
            credentials.username = normalize_and_validate_email(credentials.username)
        except HTTPException:
            # Ненормализуемый ввод пропускаем как есть —
            # штатная проверка вернёт корректную ошибку входа.
            pass
        return await super().authenticate(credentials)

    async def create(self, user_create, safe: bool = False, request: Optional[Request] = None):
        """Создание с защитной нормализацией email (оборона в глубину).

        Схема UserCreate уже нормализует адрес, но нормализация здесь
        гарантирует "1 почта = 1 аккаунт" даже при прямом вызове менеджера
        или обходе схемы (админские роуты, скрипты, тесты).
        """
        try:
            user_create.email = normalize_and_validate_email(user_create.email)
        except HTTPException:
            pass
        return await super().create(user_create, safe=safe, request=request)

    async def update(self, user_update, user: User, safe: bool = False, request: Optional[Request] = None):
        """Обновление с нормализацией смены email.

        Без этого через PATCH /api/users/me можно было записать
        ненормализованный адрес (регистр, +алиас, точки Gmail) и тем самым
        завести второй аккаунт на тот же почтовый ящик.
        """
        update_dict = (
            user_update.create_update_dict()
            if safe
            else user_update.create_update_dict_superuser()
        )
        if "email" in update_dict and update_dict["email"]:
            # Нормализуем до проверки дубликата в super().update():
            # _update сравнивает через get_by_email (case-insensitive),
            # а +алиасы/точки ловит только нормализация.
            update_dict["email"] = normalize_and_validate_email(update_dict["email"])
            # Подменяем объект обновления нормализованным значением,
            # чтобы super().update() проверил дубликат уже по нему.
            try:
                object.__setattr__(user_update, "email", update_dict["email"])
            except Exception:
                user_update.email = update_dict["email"]
        return await super().update(user_update, user, safe=safe, request=request)

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        logger.info(f"[CoolChess Auth] Пользователь {user.email} зарегистрирован.")

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        # Токен намеренно не логируем: это секрет, эквивалентный паролю.
        logger.info(f"[CoolChess Auth] Запрошена верификация для {user.email}.")

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        # SMTP не настроен: токен никуда не отправляется (см. POST /api/auth/forgot-password).
        # Токен намеренно не логируем. После подключения почты — отправить письмо здесь.
        logger.info(
            f"[CoolChess Auth] Запрошен сброс пароля для {user.email} "
            "(email-отправка не настроена, настройте SMTP)."
        )


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
