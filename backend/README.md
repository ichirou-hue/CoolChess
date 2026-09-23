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

### 1. Инфраструктура & Auth (`auth/`)
* **Авторизация:** Регистрация, выдача/проверка JWT-токенов, безопасное завершение сессий.
* **Ролевая модель:** Поддержка ролей пользователей (`player`, `admin`, `moderator`).
* **Модель пользователя (`User`):**
  * Профиль: `id` (UUID), `email`, `hashed_password`, системные флаги (`is_active`, `is_verified`).
  * Геймификация: `xp`, `level`, `coins`, `elo_rating`.
  * Статистика: `games_played`, `tournaments_played`, `tournaments_won`, `tournaments_podium`.

### 2. Бот Maia & Inference (`bot/`)
* **Инференс ходов:** Генерация ходов с человекоподобным стилем на основе весов нейросети Maia.
* **Калибровка уровней:** Поддержка различных рейтинговых диапазонов (1100, 1500, 1900 Elo).
* **Валидация:** Проверка легальности позиции и ходов по FEN через `python-chess`.

### 3. Датасет & API тактических задач (`puzzles/`)
* **База задач:** Интеграция открытого датасета Lichess (таблица `puzzles`: FEN, UCI-цепочки ходов, рейтинг, популярность, теги тем).
* **Геймификация и начисления (`rewards.py`):**
  * Расчёт прибавки Elo, опыта (XP) и монет в зависимости от сложности решённой задачи.
  * Проверка перехода на новый уровень (`level`).
* **Защита от фарма:** Связующая таблица `user_solved_puzzles` с составным уникальным ключом `(user_id, puzzle_id)` блокирует повторное начисление наград за уже решённые задачи (`already_solved: true`).

---

## 🗄 Схема базы данных
       users (1) <─────── (0..*) user_solved_puzzles (0..*) ───────> (1) puzzles
  [id, email, xp, coins, ...]     [user_id, puzzle_id, solved_at]     [id, fen,moves, rating, ...]

## Запуск и локальная разработка

### 1. Виртуальное окружение и зависимости
PowerShell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

### 2. Запуск сервера разработки
PowerShell
uvicorn main:app --reload --port 8080
Swagger UI: http://127.0.0.1:8080/docs

ReDoc: http://127.0.0.1:8080/redoc

### 3. Тестирование
Запуск набора unit- и интеграционных тестов с подсчётом покрытия кода:

PowerShell
pytest -v --cov=. --cov-report=term-missing