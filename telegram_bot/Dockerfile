FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Зависимости бота (aiogram 3 + SQLAlchemy к общей БД)
COPY telegram_bot/requirements.txt ./telegram-bot-requirements.txt
RUN pip install --no-cache-dir -r telegram-bot-requirements.txt

# Единый контур: боту нужны модели backend (auth.models, database),
# поэтому копируем backend/ рядом с telegram_bot/ и работаем через sys.path.
COPY backend/ ./backend/
COPY telegram_bot/ ./telegram_bot/

WORKDIR /app

# Long polling: бот сам ходит в Telegram Bot API, входящие порты не нужны.
CMD ["python", "-m", "telegram_bot.main"]
