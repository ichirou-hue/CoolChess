"""Хэндлер /profile: карточка профиля и статус привязки."""

import html as _html

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

from telegram_bot.db import get_user_by_telegram_id, session_factory
from telegram_bot.keyboards import open_app_keyboard

router = Router()

_ROLE_RU = {"student": "ученик", "coach": "тренер", "admin": "админ"}


@router.message(Command("profile"))
async def cmd_profile(message: Message) -> None:
    if message.from_user is None:
        return
    async with session_factory() as session:
        user = await get_user_by_telegram_id(session, message.from_user.id)
    if user is None:
        await message.answer(
            "Этот Telegram пока не привязан к CoolChess.\n"
            "Открой Mini App — аккаунт создастся сам, "
            "или привяжи существующий через личный кабинет сайта.",
            reply_markup=open_app_keyboard(),
        )
        return
    role_ru = _ROLE_RU.get(str(user.role.value if hasattr(user.role, "value") else user.role), str(user.role))
    await message.answer(
        "♟ Твой профиль CoolChess\n\n"
        f"Ник: {_html.escape(user.display_name or '—')}\n"
        f"Статус привязки: ✅ привязан (@{_html.escape(user.telegram_username or '—')})\n"
        f"Роль: {role_ru}\n"
        f"Рейтинг: {user.elo_rating} ELO\n"
        f"Уровень: {user.level} · {user.xp} XP · {user.coins} ♟",
        reply_markup=open_app_keyboard(),
    )


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(
        "Команды CoolChess:\n"
        "/start — открыть Mini App\n"
        "/profile — карточка профиля\n\n"
        "Привязка аккаунта сайта: сгенерируй токен в личном кабинете "
        "и открой ссылку из кабинета — я попрошу подтвердить.",
        reply_markup=open_app_keyboard(),
    )
