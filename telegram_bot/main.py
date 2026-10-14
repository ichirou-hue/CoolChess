"""Точка входа Telegram-бота CoolChess (long polling, aiogram 3).

Запуск из корня репозитория:
    python -m telegram_bot.main

БД общая с сайтом: локально это backend/coolchess.db по умолчанию
(переменная DATABASE_URL не нужна), в docker — postgres
(см. docker-compose.yml).
"""

import asyncio
import logging
import sys

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import ErrorEvent

from telegram_bot.config import ROOT_DIR, settings

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from telegram_bot.handlers import profile as profile_handlers  # noqa: E402
from telegram_bot.handlers import start as start_handlers  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("telegram_bot")


async def on_error(event: ErrorEvent) -> None:
    """Фолбэк: любая необработанная ошибка хэндлера (обычно недоступная БД).

    Polling при этом продолжается; пользователь получает понятный ответ
    вместо тишины, а полный трейс остаётся в логах.
    """
    update = event.update
    update_id = update.update_id if update is not None else None
    logger.exception("Unhandled error for update %s", update_id, exc_info=event.exception)
    text = "Сервис временно недоступен (не могу достучаться до базы). Попробуй через минуту."
    try:
        if update is not None and update.callback_query is not None:
            await update.callback_query.answer(text, show_alert=True)
        elif update is not None and update.message is not None:
            await update.message.answer(text)
    except Exception:
        logger.warning("Could not send fallback error message.", exc_info=True)


async def main() -> None:
    bot = Bot(
        token=settings.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dispatcher = Dispatcher()
    dispatcher.include_routers(start_handlers.router, profile_handlers.router)
    dispatcher.errors.register(on_error)
    await dispatcher.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
