from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_async_session
from auth.models import User, UserRole
from auth.manager import current_active_user, require_role
from auth.schemas import (
    LichessSyncRequest,
    LichessSyncResponse,
    LichessVerificationCodeResponse,
)
from integrations.lichess_service import lichess_service

users_router = APIRouter(tags=["Player & Coach"])


def get_user_verification_code(user_id) -> str:
    # Первые 8 символов UUID пользователя дают уникальный короткий токен
    return f"coolchess-verify-{str(user_id)[:8]}"


@users_router.get("/api/me/profile", tags=["Player"])
async def get_player_profile(user: User = Depends(current_active_user)):
    return {
        "email": user.email,
        "role": user.role,
        "elo": user.elo_rating,
        "is_verified": user.is_verified,
        "lichess_username": user.lichess_username,
        "lichess_blitz_rating": user.lichess_blitz_rating,
        "lichess_rapid_rating": user.lichess_rapid_rating,
        "lichess_puzzle_rating": user.lichess_puzzle_rating,
    }


@users_router.get("/api/coach/dashboard", tags=["Coach"])
async def coach_dashboard(user: User = Depends(require_role(UserRole.COACH))):
    return {"message": f"Добро пожаловать в тренерскую панель, {user.email}!"}


@users_router.get(
    "/api/users/lichess-verification-code",
    response_model=LichessVerificationCodeResponse,
    tags=["Users"],
)
async def get_lichess_verification_code(
    current_user: User = Depends(current_active_user),
):
    """
    Генерирует проверочный код, который пользователь должен временно
    добавить в поле 'О себе' (Bio) на Lichess для подтверждения владения аккаунтом.
    """
    code = get_user_verification_code(current_user.id)
    return LichessVerificationCodeResponse(
        verification_code=code,
        instructions=(
            f"Скопируйте код '{code}' и вставьте его в поле 'О себе' (Bio) "
            "в настройках вашего профиля Lichess. После этого подтвердите привязку."
        ),
    )


@users_router.post(
    "/api/users/sync-lichess",
    response_model=LichessSyncResponse,
    tags=["Users"],
)
async def sync_lichess_account(
    body: LichessSyncRequest,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """
    Синхронизирует профиль с Lichess с проверкой био-кода на владение аккаунтом.
    """
    profile_data = await lichess_service.fetch_user_profile(body.lichess_username)

    # 1. Проверяем наличие секретного проверочного кода в Bio профиля Lichess
    expected_code = get_user_verification_code(current_user.id)
    user_bio = profile_data.get("bio", "")

    if expected_code not in user_bio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Код подтверждения '{expected_code}' не найден в профиле Lichess пользователя "
                f"'{body.lichess_username}'. Пожалуйста, вставьте его в Bio и попробуйте снова."
            ),
        )

    # 2. Фиксируем подтвержденные данные
    current_user.lichess_username = profile_data["username"]
    current_user.lichess_blitz_rating = profile_data["blitz_rating"]
    current_user.lichess_rapid_rating = profile_data["rapid_rating"]
    current_user.lichess_puzzle_rating = profile_data["puzzle_rating"]

    # 3. Калибровка стартового рейтинга для новичка
    chosen_rating = profile_data["rapid_rating"] or profile_data["blitz_rating"]
    if chosen_rating and current_user.games_played == 0 and current_user.elo_rating == 1200:
        current_user.elo_rating = chosen_rating

    await db.commit()
    await db.refresh(current_user)

    return LichessSyncResponse(
        lichess_username=current_user.lichess_username,
        lichess_blitz_rating=current_user.lichess_blitz_rating,
        lichess_rapid_rating=current_user.lichess_rapid_rating,
        lichess_puzzle_rating=current_user.lichess_puzzle_rating,
        updated_elo=current_user.elo_rating,
        message=f"Аккаунт Lichess {current_user.lichess_username} успешно верифицирован и привязан!",
    )