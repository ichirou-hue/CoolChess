(venv) mora@MacBook-Air-mORA CoolChess % cat Dockerfile
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Системные зависимости для компиляции python-chess / asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Установка Python-библиотек
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование исходного кода
COPY . .

# Делаем скрипт запуска исполняемым внутри контейнера
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

# Запуск через entrypoint (миграции -> uvicorn)
ENTRYPOINT ["/app/entrypoint.sh"]%                        
(venv) mora@MacBook-Air-mORA CoolChess % cat docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    container_name: coolchess_pg
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgrespassword}
      POSTGRES_DB: ${POSTGRES_DB:-coolchess}
    ports:
      - "${POSTGRES_PORT:-5433}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-coolchess}"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
(venv) mora@MacBook-Air-mORA CoolChess % 