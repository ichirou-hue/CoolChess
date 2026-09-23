# 1. Инфраструктура & Аутентификация (Auth)

Сервис управления пользователями, сессиями, ролевой моделью и базовой инфраструктурой проекта.

## Стек
* **FastAPI** — асинхронный веб-фреймворк.
* **SQLAlchemy 2.0 (async)** + **asyncpg / aiosqlite** — ORM и асинхронный доступ к БД.
* **fastapi-users** — управление аутентификацией и JWT-токенами.
* **PostgreSQL / Docker Compose** — продакшен-база данных и контейнеризация сервиса.

## Архитектура модели User
* **Учетные данные:** `id` (UUID), `email`, `hashed_password`, `is_active`, `is_superuser`, `is_verified`.
* **Ролевой доступ:** поле `role` (перечисление `userrole`: `player`, `admin`, `moderator`).
* **Геймификация:** `xp`, `level`, `coins`, `elo_rating`.
* **Игровая статистика:** `games_played`, `tournaments_played`, `tournaments_won`, `tournaments_podium`.

## Основные эндпоинты
* `POST /auth/jwt/login` — получение JWT Bearer токена.
* `POST /auth/jwt/logout` — отзыв текущей сессии.
* `POST /auth/register` — регистрация нового пользователя.
* `GET /users/me` — получение профиля текущего пользователя и его баланса/статистики.