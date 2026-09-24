# CoolChess Backend API

Асинхронный бэкенд шахматной платформы CoolChess на базе FastAPI, PostgreSQL/SQLite, нейросетевого движка Maia Chess и системы тактических задач Lichess с элементами геймификации.

---

## 🛠 Технологический стек

* **Фреймворк:** FastAPI (Python 3.11+)
* **Базы данных & ORM:** PostgreSQL (продакшен через `asyncpg`), SQLite (`aiosqlite` для локальной разработки), SQLAlchemy 2.0 (Async)
* **Аутентификация & Безопасность:** `fastapi-users`, JWT Bearer токены, пароли на bcrypt
* **Шахматная логика:** `python-chess`, веса Maia Chess (нейросетевой инференс)
* **Тестирование:** `pytest`, `pytest-asyncio`, `httpx`, `pytest-cov`

---

## 📦 Архитектура реализованных модулей

### 1. Инфраструктура & Auth (`backend/auth/`)
* **Авторизация:** Регистрация, выдача/проверка JWT-токенов, безопасное завершение сессий.
* **Ролевая модель:** Поддержка ролей пользователей (`student`, `coach`, `admin`); роль назначает только сервер, смена — только через superuser-эндпоинт `PATCH /api/admin/users/{id}/role`.
* **Модель пользователя (`User`):**
  * Профиль: `id` (UUID), `email`, `hashed_password`, системные флаги (`is_active`, `is_verified`).
  * Геймификация: `xp`, `level`, `coins`, `elo_rating`.
  * Статистика: `games_played`, `tournaments_played`, `tournaments_won`, `tournaments_podium`.
  * Lichess: `lichess_username`, рейтинги, случайный `lichess_verification_code` для привязки.

### 2. Бот Maia & Inference (`backend/bot/`)
* **Инференс ходов:** Генерация ходов с человекоподобным стилем на основе весов нейросети Maia.
* **Калибровка уровней:** Поддержка различных рейтинговых диапазонов (1100, 1500, 1900 Elo).
* **Валидация:** Проверка легальности позиции и ходов по FEN через `python-chess`.

### 3. Датасет & API тактических задач (`backend/puzzles/`)
* **База задач:** Интеграция открытого датасета Lichess (таблица `puzzles`: FEN, UCI-цепочки ходов, рейтинг, популярность, теги тем).
* **Геймификация и начисления (`rewards.py`):**
  * Расчёт прибавки Elo, опыта (XP) и монет в зависимости от сложности решённой задачи.
  * Проверка перехода на новый уровень (`level`).
* **Защита от фарма:** Связующая таблица `user_solved_puzzles` с составным уникальным ключом `(user_id, puzzle_id)` блокирует повторное начисление наград за уже решённые задачи (`already_solved: true`); гонка параллельных запросов гасится через `IntegrityError` + rollback.

### 4. Партии с ботом (`backend/games/`)
* Старт/продолжение/сдача партии, серверная валидация ходов, ответный ход Maia.
* Награды за матч по формуле Elo (`rewards.py`); сдача (`resign`) не приносит XP/монеты — только Elo как за поражение.

### 5. Лидерборд (`backend/leaderboard/`) и Lichess (`backend/integrations/`)
* Топ по Elo / уровню / числу задач + позиция текущего игрока; email в топе маскируются.
* Привязка Lichess-аккаунта через случайный код в Bio профиля.

---

## 🗄 Схема базы данных
       users (1) <─────── (0..*) user_solved_puzzles (0..*) ───────> (1) puzzles
  [id, email, xp, coins, ...]     [user_id, puzzle_id, solved_at]     [id, fen,moves, rating, ...]

## Запуск и локальная разработка

### 0. Окружение backend
Скопируйте пример и заполните секреты (JWT_SECRET и VERIFY_SECRET обязательны):

PowerShell
Copy-Item backend\.env.example backend\.env
# затем впишите секреты, например: python -c "import secrets; print(secrets.token_urlsafe(32))"

### 1. Виртуальное окружение и зависимости
PowerShell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

### 2. База данных
Вариант А — Docker (порт хоста задается через POSTGRES_PORT, по умолчанию 5433):

PowerShell
docker compose up -d postgres

Вариант Б — локальный PostgreSQL/SQLite через DATABASE_URL в `backend/.env`.

Инициализация схемы для свежей БД (из каталога `backend/`):

PowerShell
cd backend
python init_db.py
# для давно созданной БД — докрутить недостающие колонки:
python update_schema.py

### 3. Запуск сервера разработки
Из каталога `backend/` (backend слушает порт 8080):

PowerShell
cd backend
uvicorn server:app --reload --port 8080
Swagger UI: http://127.0.0.1:8080/docs

ReDoc: http://127.0.0.1:8080/redoc

### 4. Тестирование
Запуск набора unit- и интеграционных тестов из корня репозитория:

PowerShell
.\venv\Scripts\python.exe -m pytest -q