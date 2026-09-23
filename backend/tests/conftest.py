import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock

from server import app
from auth.models import User, UserRole
from auth.manager import current_active_user
from database import get_async_session


@pytest.fixture
def mock_user():
    """Тестовый активный пользователь с базовыми параметрами геймификации."""
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.email = "testplayer@coolchess.com"
    user.is_active = True
    user.is_verified = True
    
    # Безопасное определение роли вне зависимости от регистра Enum
    if hasattr(UserRole, "PLAYER"):
        user.role = UserRole.PLAYER
    elif hasattr(UserRole, "player"):
        user.role = UserRole.player
    else:
        user.role = list(UserRole)[0]

    user.xp = 0
    user.coins = 0
    user.elo_rating = 1200
    user.level = 1
    return user


@pytest.fixture
def mock_db_session():
    """Мок асинхронной сессии SQLAlchemy."""
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    return session


@pytest_asyncio.fixture
async def authorized_client(mock_user, mock_db_session):
    """Асинхронный клиент с подмененной авторизацией и сессией БД."""
    app.dependency_overrides[current_active_user] = lambda: mock_user
    app.dependency_overrides[get_async_session] = lambda: mock_db_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver"
    ) as client:
        yield client, mock_user, mock_db_session

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def anonymous_client():
    """Асинхронный клиент без авторизации."""
    app.dependency_overrides.clear()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver"
    ) as client:
        yield client