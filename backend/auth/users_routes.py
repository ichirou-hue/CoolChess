import asyncio
import hashlib
import hmac
import logging
import secrets
import uuid
import smtplib
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi_users.exceptions import UserAlreadyExists

from database import get_async_session
from auth.models import User, UserRole
from auth.manager import (
    VERIFY_SECRET,
    UserManager,
    current_active_user,
    get_user_manager,
    require_role,
    require_superuser,
)
from auth.schemas import (
    ChessPlatform,
    ChessComSyncRequest,
    ChessComSyncResponse,
    EmailResendRequest,
    EmailVerificationRequest,
    LichessSyncRequest,
    LichessSyncResponse,
    LichessVerificationCodeResponse,
    PlatformAccountLinkResponse,
    PlatformVerificationCodeResponse,
    PlatformVerificationRequest,
    RoleUpdateRequest,
    UserCreate,
)
from auth.email_verification import email_delivery_configured, send_verification_code
from integrations.lichess_service import lichess_service
from integrations.chesscom_service import chesscom_service

users_router = APIRouter(tags=["Player & Coach"])
logger = logging.getLogger(__name__)

EMAIL_CODE_LIFETIME = timedelta(minutes=10)
EMAIL_CODE_RESEND_DELAY = timedelta(seconds=60)
EMAIL_CODE_MAX_ATTEMPTS = 5
PLATFORM_LINK_LIFETIME = timedelta(minutes=15)
PLATFORM_LINK_MAX_ATTEMPTS = 5


def _new_email_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _email_code_digest(code: str) -> str:
    return hmac.new(
        VERIFY_SECRET.encode("utf-8"),
        code.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


async def _deliver_email_code(db: AsyncSession, user: User) -> None:
    code = _new_email_code()
    now = datetime.now(timezone.utc)
    user.email_verification_code_hash = _email_code_digest(code)
    user.email_verification_expires_at = now + EMAIL_CODE_LIFETIME
    user.email_verification_sent_at = now
    user.email_verification_attempts = 0
    await db.commit()
    try:
        await send_verification_code(user.email, code)
    except (OSError, RuntimeError, smtplib.SMTPException, ValueError) as exc:
        user.email_verification_code_hash = None
        user.email_verification_expires_at = None
        user.email_verification_sent_at = None
        user.email_verification_attempts = 0
        await db.commit()
        smtp_status = getattr(exc, "smtp_code", None)
        logger.warning(
            "Could not send email verification code (%s, smtp_status=%s).",
            type(exc).__name__,
            smtp_status,
        )
        if isinstance(exc, smtplib.SMTPAuthenticationError):
            detail = (
                f"Почтовый сервер Mail.ru отклонил SMTP-аутентификацию "
                f"(код {smtp_status}): для внешнего SMTP-доступа требуется "
                "отдельный пароль приложения. Создайте его в настройках "
                "безопасности Mail.ru и укажите вместо пароля веб-почты в "
                "SMTP_PASSWORD: https://help.mail.ru/mail/security/protection/external"
            )
        else:
            detail = (
                "Не удалось подключиться к SMTP Mail.ru. Проверьте SMTP_HOST, "
                "порт 465 и SSL в backend/.env, затем попробуйте снова."
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        ) from exc


def _require_email_delivery() -> None:
    if not email_delivery_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Не настроена отправка email на backend. Укажите SMTP_USERNAME "
                "(полный адрес Mail.ru) и SMTP_PASSWORD (пароль приложения) "
                "в backend/.env, затем перезапустите backend."
            ),
        )


async def _resend_pending_code(db: AsyncSession, user: User) -> None:
    _require_email_delivery()
    sent_at = user.email_verification_sent_at
    if sent_at is not None and datetime.now(timezone.utc) - _as_utc(sent_at) < EMAIL_CODE_RESEND_DELAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Подождите минуту перед повторной отправкой кода.",
        )
    await _deliver_email_code(db, user)


@users_router.post("/api/auth/register", status_code=status.HTTP_202_ACCEPTED, tags=["Auth"])
async def register_user(
    payload: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_async_session),
    user_manager: UserManager = Depends(get_user_manager),
):
    _require_email_delivery()
    try:
        user = await user_manager.create(payload, safe=True, request=request)
    except UserAlreadyExists as exc:
        result = await db.execute(select(User).where(User.email == payload.email))
        existing_user = result.scalar_one_or_none()
        if existing_user is not None and not existing_user.is_verified:
            await _resend_pending_code(db, existing_user)
            return {"message": "Код подтверждения отправлен на указанный email."}
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже существует.",
        ) from exc
    await _deliver_email_code(db, user)
    return {"message": "Код подтверждения отправлен на указанный email."}


@users_router.post("/api/auth/verify-email", tags=["Auth"])
async def verify_email(
    payload: EmailVerificationRequest,
    db: AsyncSession = Depends(get_async_session),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None or user.is_verified or not user.email_verification_code_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Код подтверждения недействителен или срок его действия истёк.",
        )
    if user.email_verification_attempts >= EMAIL_CODE_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Превышено число попыток. Запросите новый код.",
        )
    if (
        user.email_verification_expires_at is None
        or _as_utc(user.email_verification_expires_at) <= datetime.now(timezone.utc)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Код подтверждения недействителен или срок его действия истёк.",
        )
    if not hmac.compare_digest(
        user.email_verification_code_hash,
        _email_code_digest(payload.code),
    ):
        attempt_result = await db.execute(
            update(User)
            .where(
                User.id == user.id,
                User.email_verification_attempts < EMAIL_CODE_MAX_ATTEMPTS,
            )
            .values(email_verification_attempts=User.email_verification_attempts + 1)
        )
        await db.commit()
        if attempt_result.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Превышено число попыток. Запросите новый код.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный код подтверждения.",
        )

    user.is_verified = True
    user.email_verification_code_hash = None
    user.email_verification_expires_at = None
    user.email_verification_sent_at = None
    user.email_verification_attempts = 0
    await db.commit()
    return {"message": "Email подтверждён. Теперь можно войти."}


@users_router.post("/api/auth/resend-verification", status_code=status.HTTP_202_ACCEPTED, tags=["Auth"])
async def resend_email_verification(
    payload: EmailResendRequest,
    db: AsyncSession = Depends(get_async_session),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    accepted = {"message": "Если для этого email ожидается подтверждение, код будет отправлен."}
    if user is None or user.is_verified:
        return accepted
    await _resend_pending_code(db, user)
    return accepted


def generate_verification_code() -> str:
    return f"coolchess-verify-{secrets.token_hex(4)}"


def _platform_verification_fields(platform: ChessPlatform) -> tuple[str, str, str, str]:
    prefix = "lichess" if platform == ChessPlatform.LICHESS else "chesscom"
    return (
        f"{prefix}_verification_code",
        f"{prefix}_verification_username",
        f"{prefix}_verification_expires_at",
        f"{prefix}_verification_attempts",
    )


async def _get_db_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    """Перечитывает пользователя в текущей сессии.

    current_active_user приходит из сессии fastapi-users: мутации такого
    объекта и commit через get_async_session могут не сохраниться.
    """
    res = await db.execute(select(User).where(User.id == user_id))
    db_user = res.scalar_one_or_none()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден.",
        )
    return db_user


@users_router.post(
    "/api/users/platform-verification-code",
    response_model=PlatformVerificationCodeResponse,
    tags=["Users"],
)
async def create_platform_verification_code(
    payload: PlatformVerificationRequest,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    db_user = await _get_db_user(db, current_user.id)
    code_field, username_field, expires_field, attempts_field = _platform_verification_fields(payload.platform)
    expires_at = datetime.now(timezone.utc) + PLATFORM_LINK_LIFETIME
    setattr(db_user, code_field, generate_verification_code())
    setattr(db_user, username_field, payload.username)
    setattr(db_user, expires_field, expires_at)
    setattr(db_user, attempts_field, 0)
    await db.commit()

    if payload.platform == ChessPlatform.LICHESS:
        instructions = (
            "Добавьте код в поле «О себе» (Bio) в настройках профиля Lichess, "
            "сохраните изменения и вернитесь для подтверждения."
        )
    else:
        instructions = (
            "Добавьте код в поле Location (местоположение) в настройках профиля "
            "Chess.com, сохраните изменения и вернитесь для подтверждения."
        )
    return PlatformVerificationCodeResponse(
        platform=payload.platform,
        username=payload.username,
        verification_code=getattr(db_user, code_field),
        expires_at=expires_at,
        instructions=instructions,
    )


async def _verify_platform_link(
    db: AsyncSession,
    db_user: User,
    platform: ChessPlatform,
    username: str,
) -> PlatformAccountLinkResponse:
    code_field, username_field, expires_field, attempts_field = _platform_verification_fields(platform)
    expected_code = getattr(db_user, code_field)
    expires_at = getattr(db_user, expires_field)
    pending_username = getattr(db_user, username_field)

    if not expected_code or expires_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сначала запросите новый проверочный код для этой платформы.",
        )
    if _as_utc(expires_at) <= datetime.now(timezone.utc):
        setattr(db_user, code_field, None)
        setattr(db_user, username_field, None)
        setattr(db_user, expires_field, None)
        setattr(db_user, attempts_field, 0)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Срок действия кода истёк. Запросите новый код и повторите привязку.",
        )
    if pending_username and pending_username.casefold() != username.casefold():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Никнейм не совпадает с аккаунтом, для которого создан код. Запросите код для нужного ника.",
        )
    if getattr(db_user, attempts_field) >= PLATFORM_LINK_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Превышено число попыток проверки. Запросите новый код.",
        )

    if platform == ChessPlatform.LICHESS:
        profile = await lichess_service.fetch_user_profile(username)
        profile_text = " ".join(
            str(profile.get(field) or "") for field in ("bio", "location", "status")
        )
        ratings = profile
    else:
        profile, ratings = await asyncio.gather(
            chesscom_service.fetch_player_profile(username),
            chesscom_service.fetch_player_stats(username),
        )
        profile_text = " ".join(
            str(profile.get(field) or "") for field in ("bio", "location", "status")
        )

    if expected_code.casefold() not in profile_text.casefold():
        setattr(db_user, attempts_field, getattr(db_user, attempts_field) + 1)
        await db.commit()
        profile_field = "Bio" if platform == ChessPlatform.LICHESS else "Location"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Код не найден в поле {profile_field} профиля {platform.value}. "
                "Проверьте, что код скопирован без изменений и профиль сохранён, "
                "затем повторите попытку."
            ),
        )

    canonical_username = str(profile.get("username") or username)
    if platform == ChessPlatform.LICHESS:
        db_user.lichess_username = canonical_username
        db_user.lichess_blitz_rating = ratings.get("blitz_rating")
        db_user.lichess_rapid_rating = ratings.get("rapid_rating")
        db_user.lichess_puzzle_rating = ratings.get("puzzle_rating")
        chosen_rating = ratings.get("rapid_rating") or ratings.get("blitz_rating")
        if chosen_rating and db_user.games_played == 0 and db_user.elo_rating == 1200:
            db_user.elo_rating = chosen_rating
    else:
        db_user.chesscom_username = canonical_username
        db_user.chesscom_blitz_rating = ratings.get("blitz_rating")
        db_user.chesscom_rapid_rating = ratings.get("rapid_rating")
        db_user.chesscom_bullet_rating = ratings.get("bullet_rating")
        db_user.chesscom_daily_rating = ratings.get("daily_rating")

    setattr(db_user, code_field, None)
    setattr(db_user, username_field, None)
    setattr(db_user, expires_field, None)
    setattr(db_user, attempts_field, 0)
    await db.commit()
    await db.refresh(db_user)

    result = PlatformAccountLinkResponse(
        platform=platform,
        username=canonical_username,
        message=f"Аккаунт {platform.value} {canonical_username} успешно подтверждён и привязан.",
        updated_elo=db_user.elo_rating if platform == ChessPlatform.LICHESS else None,
    )
    if platform == ChessPlatform.LICHESS:
        result.lichess_blitz_rating = db_user.lichess_blitz_rating
        result.lichess_rapid_rating = db_user.lichess_rapid_rating
        result.lichess_puzzle_rating = db_user.lichess_puzzle_rating
    else:
        result.chesscom_blitz_rating = db_user.chesscom_blitz_rating
        result.chesscom_rapid_rating = db_user.chesscom_rapid_rating
        result.chesscom_bullet_rating = db_user.chesscom_bullet_rating
        result.chesscom_daily_rating = db_user.chesscom_daily_rating
    return result


@users_router.post(
    "/api/users/verify-platform-account",
    response_model=PlatformAccountLinkResponse,
    tags=["Users"],
)
async def verify_platform_account(
    payload: PlatformVerificationRequest,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    db_user = await _get_db_user(db, current_user.id)
    return await _verify_platform_link(db, db_user, payload.platform, payload.username)


@users_router.get("/api/me/profile", tags=["Player"])
async def get_player_profile(user: User = Depends(current_active_user)):
    return {
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "elo_rating": user.elo_rating,
        "xp": user.xp,
        "level": user.level,
        "coins": user.coins,
        "is_verified": user.is_verified,
        "lichess_username": user.lichess_username,
        "lichess_blitz_rating": user.lichess_blitz_rating,
        "lichess_rapid_rating": user.lichess_rapid_rating,
        "lichess_puzzle_rating": user.lichess_puzzle_rating,
        "chesscom_username": user.chesscom_username,
        "chesscom_blitz_rating": user.chesscom_blitz_rating,
        "chesscom_rapid_rating": user.chesscom_rapid_rating,
        "chesscom_bullet_rating": user.chesscom_bullet_rating,
        "chesscom_daily_rating": user.chesscom_daily_rating,
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
    db: AsyncSession = Depends(get_async_session),
):
    """
    Выдает (один раз генерирует и сохраняет) случайный проверочный код,
    который пользователь должен временно добавить в поле 'О себе' (Bio)
    на Lichess для подтверждения владения аккаунтом.
    """
    db_user = await _get_db_user(db, current_user.id)
    code = generate_verification_code()
    db_user.lichess_verification_code = code
    db_user.lichess_verification_username = None
    db_user.lichess_verification_expires_at = datetime.now(timezone.utc) + PLATFORM_LINK_LIFETIME
    db_user.lichess_verification_attempts = 0
    await db.commit()
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
    """Compatibility endpoint that now enforces the expiring ownership check."""
    db_user = await _get_db_user(db, current_user.id)
    linked = await _verify_platform_link(
        db, db_user, ChessPlatform.LICHESS, body.lichess_username
    )
    return LichessSyncResponse(
        lichess_username=linked.username,
        lichess_blitz_rating=linked.lichess_blitz_rating,
        lichess_rapid_rating=linked.lichess_rapid_rating,
        lichess_puzzle_rating=linked.lichess_puzzle_rating,
        updated_elo=linked.updated_elo or db_user.elo_rating,
        message=linked.message,
    )


@users_router.post(
    "/api/users/sync-chesscom",
    response_model=ChessComSyncResponse,
    tags=["Users"],
)
async def sync_chesscom_account(
    body: ChessComSyncRequest,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Compatibility endpoint that now requires proof in the public Chess.com profile."""
    db_user = await _get_db_user(db, current_user.id)
    linked = await _verify_platform_link(
        db, db_user, ChessPlatform.CHESSCOM, body.chesscom_username
    )
    return ChessComSyncResponse(
        chesscom_username=linked.username,
        chesscom_blitz_rating=linked.chesscom_blitz_rating,
        chesscom_rapid_rating=linked.chesscom_rapid_rating,
        chesscom_bullet_rating=linked.chesscom_bullet_rating,
        chesscom_daily_rating=linked.chesscom_daily_rating,
        message=linked.message,
    )


@users_router.patch(
    "/api/admin/users/{user_id}/role",
    tags=["Admin"],
)
async def set_user_role(
    user_id: uuid.UUID,
    payload: RoleUpdateRequest,
    admin: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_async_session),
):
    """
    Смена роли пользователя. Только для superuser.
    Обычные пользователи сменить роль себе не могут: поле role
    убрано из схем регистрации и обновления профиля.
    """
    res = await db.execute(select(User).where(User.id == user_id))
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден.",
        )
    target.role = payload.role
    await db.commit()
    return {"id": target.id, "email": target.email, "role": target.role}
