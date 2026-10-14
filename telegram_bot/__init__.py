"""Telegram-бот CoolChess (aiogram 3).

Единый контур с сайтом: те же таблицы БД (модели backend/auth/models.py),
тот же BOT_TOKEN, что используется для проверки подписи Mini App.
Запуск: `python -m telegram_bot.main` из корня репозитория.
"""

from telegram_bot.config import settings

__all__ = ["settings"]
