"""Инлайн-клавиатуры бота CoolChess."""

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from telegram_bot.config import settings


def open_app_keyboard() -> InlineKeyboardMarkup:
    """Кнопка открытия Mini App (по ТЗ — web_app на WEBAPP_URL)."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="♟ Открыть CoolChess",
                    web_app=WebAppInfo(url=settings.webapp_url),
                )
            ]
        ]
    )


def bind_confirm_keyboard(token: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Подтвердить", callback_data=f"bind:confirm:{token}"),
                InlineKeyboardButton(text="❌ Отмена", callback_data=f"bind:cancel:{token}"),
            ]
        ]
    )
