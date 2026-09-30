FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Системные зависимости для сборки asyncpg и healthcheck (curl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Установка Python-зависимостей (отдельным слоем для кэширования)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Исходники backend (миграции Alembic едут вместе с кодом)
COPY backend/ ./backend/
COPY scripts/ ./scripts/

WORKDIR /app/backend

RUN chmod +x /app/backend/entrypoint.sh

EXPOSE 8080

# Entrypoint: alembic upgrade head -> uvicorn server:app :8080
ENTRYPOINT ["/app/backend/entrypoint.sh"]
