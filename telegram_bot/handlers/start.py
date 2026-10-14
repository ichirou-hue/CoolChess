"""Хэндлеры /start: обычное приветствие и диплинк привязки bind_<token>."""

import html as _html

import logging
from datetime import datetime, timezone

from aiogram import F, Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import CallbackQuery, Message

from telegram_bot.db import get_user_by_bind_token, get_user_by_telegram_id, session_factory
from telegram_bot.keyboards import bind_confirm_keyboard, open_app_keyboard

logger = logging.getLogger(__name__)
router = Router()


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject) -> None:
    if message.from_user is None:
        return
    arg = (command.args or "").strip()

    if arg.startswith("bind_"):
        await _start_bind_flow(message, arg.removeprefix("bind_"))
        return

    async with session_factory() as session:
        user = await get_user_by_telegram_id(session, message.from_user.id)
    if user is not None:
        text = (
            f"С возвращением, {_html.escape(user.display_name or 'шахматист')}! ♟\n"
            "Твой прогресс уже ждёт — открывай Mini App и продолжай партию."
        )
    else:
        text = (
            "Привет! Это CoolChess — шахматная школа в Telegram. ♟\n\n"
            "Нажми кнопку ниже: Mini App само создаст твой аккаунт, "
            "а если у тебя уже есть профиль на сайте — привяжи его "
            "через личный кабинет (кнопка «Связать Telegram»)."
        )
    await message.answer(text, reply_markup=open_app_keyboard())


async def _start_bind_flow(message: Message, token: str) -> None:
    assert message.from_user is not None
    if not token:
        await message.answer("Пустой токен привязки. Сгенерируй новый в личном кабинете сайта.")
        return
    async with session_factory() as session:
        target = await get_user_by_bind_token(session, token)
        if target is None:
            await message.answer(
                "Токен не найден. Возможно, он уже использован. "
                "Сгенерируй новый в личном кабинете сайта."
            )
            return
        expires_at = target.bind_code_expires_at
        if expires_at is None or _as_utc(expires_at) <= datetime.now(timezone.utc):
            await message.answer("Срок действия токена истёк. Сгенерируй новый в личном кабинете сайта.")
            return
        if target.telegram_id and target.telegram_id != message.from_user.id:
            await message.answer("Этот аккаунт уже привязан к другому Telegram.")
            return
        label = _html.escape(target.display_name or target.email)
        await message.answer(
            f"Связать этот Telegram с аккаунтом «{label}» на сайте?",
            reply_markup=bind_confirm_keyboard(token),
        )


@router.callback_query(F.data.startswith("bind:"))
async def bind_callback(callback: CallbackQuery) -> None:
    assert callback.data is not None and callback.from_user is not None
    try:
        _, action, token = callback.data.split(":", 2)
    except ValueError:
        await callback.answer("Некорректные данные кнопки.", show_alert=True)
        return

    if action == "cancel":
        await callback.message.edit_text("Привязка отменена. Токен остался активным — можно попробовать позже.")
        await callback.answer()
        return

    if action != "confirm":
        await callback.answer()
        return

    async with session_factory() as session:
        target = await get_user_by_bind_token(session, token)
        if target is None:
            await callback.message.edit_text("Токен уже использован или не существует.")
            await callback.answer()
            return
        expires_at = target.bind_code_expires_at
        if expires_at is None or _as_utc(expires_at) <= datetime.now(timezone.utc):
            await callback.message.edit_text("Срок действия токена истёк. Сгенерируй новый в личном кабинете.")
            await callback.answer()
            return
        # telegram_id уникален: чужой аккаунт с этим id блокирует привязку.
        existing = await get_user_by_telegram_id(session, callback.from_user.id)
        if existing is not None and existing.id != target.id:
            await callback.message.edit_text(
                "Этот Telegram уже привязан к другому аккаунту CoolChess."
            )
            await callback.answer()
            return
        target.telegram_id = callback.from_user.id
        target.telegram_username = callback.from_user.username
        target.bind_code = None
        target.bind_code_expires_at = None
        await session.commit()
        label = _html.escape(target.display_name or target.email)
        logger.info("Telegram %s bound to user %s", callback.from_user.id, target.id)

    await callback.message.edit_text(
        f"Готово! Telegram привязан к аккаунту «{label}». ✅\n"
        "Теперь открывай Mini App — вход произойдёт автоматически.",
        reply_markup=open_app_keyboard(),
    )
    await callback.answer("Аккаунт привязан!")
