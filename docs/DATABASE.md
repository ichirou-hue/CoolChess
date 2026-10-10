# База данных CoolChess

Источник истины схемы — **Alembic-миграции** (`backend/alembic/versions/`).
Свежие БД поднимаются через `alembic upgrade head` (так делает
`backend/entrypoint.sh` в Docker). `backend/init_db.py` (`create_all`) —
dev-путь без истории миграций, `backend/update_schema.py` — legacy для баз,
созданных до Alembic (только колонки `users`, новые таблицы не создаёт).

UUID-колонки используют backend-агностичный `GUID`
(`fastapi_users_db_sqlalchemy.generics`) — работает и на PostgreSQL,
и на SQLite (прежний `postgresql.UUID` ломал SQLite-режим).

## Таблицы

### `users`
Профиль и геймификация (`backend/auth/models.py`, `UserRole`: `student`/`coach`/`admin`).

| Колонка | Тип | Заметка |
|---|---|---|
| `id` | UUID | PK (fastapi-users) |
| `email`, `hashed_password` | String | уникальность email; нормализация в `auth/schemas.py` |
| `display_name` | VARCHAR(40) | публичное имя/никнейм; обязателен при регистрации |
| `display_name_key` | VARCHAR(64), unique | канонический ключ ника: регистр важен, двойники из разных раскладок дают один ключ |
| `is_active`, `is_verified`, `is_superuser` | Bool | флаги fastapi-users |
| `role` | Enum(`UserRole`) | по умолчанию `student` |
| `elo_rating` | Integer | по умолчанию 1000, минимум 100 после матчей |
| `xp`, `level`, `coins` | Integer | геймификация (см. `docs/ECONOMY.md`) |
| `games_played`, `tournaments_played`, `tournaments_won`, `tournaments_podium` | Integer | статистика |
| `lichess_username` | VARCHAR(50), index | подтверждённый аккаунт |
| `lichess_blitz_rating`, `lichess_rapid_rating`, `lichess_puzzle_rating` | Integer, nullable | из Lichess API |
| `lichess_verification_code` | VARCHAR(32), nullable | случайный `coolchess-verify-<hex>`, живёт 15 минут |
| `lichess_verification_username`, `chesscom_verification_username` | VARCHAR(50), nullable | ник, к которому привязан код |
| `lichess/chesscom_verification_expires_at`, `..._attempts` | TIMESTAMP / Integer | срок кода и счётчик попыток (максимум 5) |
| `email_verification_code_hash` | VARCHAR(64), nullable | HMAC-хеш 6-значного кода (код живёт 10 минут, resend не чаще 60 секунд, максимум 5 попыток) |
| `email_verification_expires_at`, `email_verification_sent_at`, `email_verification_attempts` | TIMESTAMP / TIMESTAMP / Integer | сроки и счётчики email-верификации |
| `chesscom_username` | VARCHAR(50), index | имя публичного профиля Chess.com; владение подтверждается кодом через `verify-platform-account` |
| `chesscom_blitz_rating`, `chesscom_rapid_rating`, `chesscom_bullet_rating`, `chesscom_daily_rating` | Integer, nullable | публичная статистика Chess.com |

### `puzzles`
Задачи Lichess (`Puzzle` в `backend/auth/models.py`).

| Колонка | Тип | Заметка |
|---|---|---|
| `id` | String | PK, `PuzzleId` из дампа Lichess |
| `fen` | String | позиция после хода соперника |
| `moves` | String | UCI-цепочка решения через пробел |
| `rating`, `rating_deviation`, `popularity` | Integer | сложность и индекс `idx_puzzle_rating` |
| `themes` | String | теги через пробел (маппинг — `docs/puzzle-topic-map.md`) |
| `game_url` | String, nullable | ссылка на исходную партию |

Миграция `seed_category_puzzles` добавляет стартовый пул beginner-уровня:
не менее десяти задач для категорий «Мат в 1», «Мат в 2», «Вилка», «Связка»
и «Лучший ход».

### `user_solved_puzzles`
Many-to-many «кто что решил», защита от фарма наград.

| Колонка | Тип |
|---|---|
| `user_id` | UUID → `users.id` (CASCADE), часть составного PK |
| `puzzle_id` | String → `puzzles.id` (CASCADE), часть составного PK |
| `solved_at` | DateTime(tz) |

### `games`
Партии с ботом (`backend/games/models.py`).

| Колонка | Тип | Заметка |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID → `users.id` (CASCADE), index | владелец |
| `status` | Enum(`GameStatus`) | `in_progress`/`player_won`/`bot_won`/`draw`/`resigned`, index |
| `player_color` | Enum(`PlayerColor`) | `white`/`black` |
| `bot_difficulty` | Integer | тир 1–5 или Elo |
| `current_fen` | String | актуальная позиция |
| `moves_uci` | Text | ходы через пробел |
| `created_at`, `updated_at` | DateTime | |

### `tournaments` и `tournament_participants`
Турниры (`backend/tournaments/models.py`) доступны для просмотра всем
пользователям. Создавать события, добавлять игроков и распределять их по
группам могут тренеры (`coach`) и администраторы (`admin`); игрок может
самостоятельно записаться и выбрать желаемый цвет.

`tournaments` хранит название, описание, формат (`round_robin`, `swiss`,
`single_elimination`), контроль времени, инкремент, лимит участников и статус
регистрации. `tournament_participants` связывает турнир с игроком и хранит
группу, выбранную сторону и время регистрации; уникальная пара
`(tournament_id, user_id)` запрещает повторную запись.

### `course_progress`

Прогресс курсов: PK (`user_id`, `topic_id`), монотонные флаги
`theory_completed` / `quiz_completed` / `practice_completed` + `updated_at`.
API: `GET /api/learning/progress`, `PATCH /api/learning/progress/{topic_id}`.

### PvP-комнаты (без таблиц)
`backend/pvp/` состояния в БД не хранит: `ChessGameRoom` (доска, часы
`white_time_left`/`black_time_left`, `result`, `termination_reason`) живёт
в `PVPConnectionManager.active_rooms` (in-memory синглтон `pvp_manager`).
Комнаты получают короткий пятисимвольный код. Перезапуск backend обнуляет все
PvP-партии — это осознанное решение для прототипа.

## Подключение

`backend/database.py`: асинхронный engine SQLAlchemy 2.0 + `async_session_maker`,
зависимость `get_async_session`.

```
# PostgreSQL (Docker/prod)
DATABASE_URL=postgresql+asyncpg://postgres:postgrespassword@localhost:5433/coolchess
# SQLite (dev без Docker): дефолт привязан к backend/coolchess.db и не зависит
# от рабочего каталога (см. backend/database.py), явно задавать не нужно
```

## Управление схемой

| Скрипт | Назначение |
|---|---|
| `backend/alembic/versions/*` | **Источник истины.** История схемы; применяется через `alembic upgrade head` |
| `backend/init_db.py` | `Base.metadata.create_all` — dev-инициализация без истории (импортирует активные модели) |
| `backend/update_schema.py` | **Legacy.** `ALTER TABLE ... ADD COLUMN` только для `users` на базах до Alembic; новые таблицы не создаёт |
| `backend/schema.sql` | эталонная схема для ревью (генерируется `python dump_ddl.py > schema.sql`) |
| `backend/dump_ddl.py` | дамп DDL из активных метаданных |
| `backend/load_lichess_puzzles.py` | загрузка задач в таблицу `puzzles` |
| `scripts/import_lichess_puzzles.py` | компактный `frontend/public/data/puzzles.json` из `lichess_db_puzzle.csv.zst` (исходник вне Git) |

Порядок на свежей БД: `cp .env.example .env && cp backend/.env.example backend/.env`
(заполнить секреты) → `docker compose up --build -d` (entrypoint сам сделает
`alembic upgrade head`) → загрузить задачи → проверка `GET /health`.
Локально без Docker: `cd backend && alembic upgrade head` (или `python init_db.py`).
