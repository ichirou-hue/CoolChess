"""Конфигурация Telegram-бота CoolChess.

Читает единственный `.env` в корне репозитория (для совместимости
подхватывается и legacy `backend/.env`, если он вдруг остался).
"""

import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
load_dotenv(dotenv_path=ROOT_DIR / ".env")
load_dotenv(dotenv_path=BACKEND_DIR / ".env", override=False)

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@dataclass(frozen=True)
class Settings:
    bot_token: str
    webapp_url: str
    database_url: str
    bot_username: str | None = None


def _get_settings() -> Settings:
    token = os.getenv("BOT_TOKEN", "")
    if not token or token == "SET_YOUR_BOT_TOKEN_HERE":
        raise RuntimeError(
            "BOT_TOKEN не задан. Вставьте токен от @BotFather в корневой .env."
        )
    database_url = os.getenv("DATABASE_URL") or f"sqlite+aiosqlite:///{BACKEND_DIR / 'coolchess.db'}"
    return Settings(
        bot_token=token,
        webapp_url=os.getenv("WEBAPP_URL", "http://localhost:5173").rstrip("/"),
        database_url=database_url,
        bot_username=(os.getenv("TELEGRAM_BOT_USERNAME") or "").strip().lstrip("@") or None,
    )


settings = _get_settings()
