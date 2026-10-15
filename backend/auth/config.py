import os
from datetime import datetime, timezone

from dotenv import load_dotenv

# Единственный .env в корне репозитория (плюс legacy backend/.env).
BACKEND_DIR = __import__("pathlib").Path(__file__).resolve().parents[1]
ROOT_ENV = BACKEND_DIR.parent / ".env"
BACKEND_ENV = BACKEND_DIR / ".env"
load_dotenv(dotenv_path=ROOT_ENV)
load_dotenv(dotenv_path=BACKEND_ENV, override=False)


def get_bot_token() -> str | None:
    """Get the Telegram bot token from environment variables."""
    return os.getenv("BOT_TOKEN")


BOT_TOKEN = get_bot_token()