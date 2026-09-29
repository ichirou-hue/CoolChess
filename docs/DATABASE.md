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
| `is_active`, `is_verified`, `is_superuser` | Bool | флаги fastapi-users |
| `role` | Enum(`UserRole`) | по умолчанию `student` |
| `elo_rating` | Integer | по умолчанию 1200, минимум 100 после матчей |
| `xp`, `level`, `coins` | Integer | геймификация (см. `docs/ECONOMY.md`) |
| `games_played`, `tournaments_played`, `tournaments_won`, `tournaments_podium` | Integer | статистика |
| `lichess_username` | VARCHAR(50), index | подтверждённый аккаунт |
| `lichess_blitz_rating`, `lichess_rapid_rating`, `lichess_puzzle_rating` | Integer, nullable | из Lichess API |
| `lichess_verification_code` | VARCHAR(32), nullable | случайный `coolchess-<hex>` |

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

### `clans`
Кланы (`backend/clans/models.py`).

| Колонка | Тип | Заметка |
|---|---|---|
| `id` | UUID | PK |
| `name` | VARCHAR(50), unique, index | 3–50 символов |
| `tag` | VARCHAR(6), unique, index | 2–6 символов, хранится в UPPER |
| `description` | VARCHAR(255), nullable | |
| `created_at` | DateTime(tz) | |
| `leader_id` | UUID → `users.id` (RESTRICT) | удаление лидера при живом клане запрещено |

### `clan_members`
Членство «1 игрок = максимум 1 клан» (`ClanRole`: `leader`/`officer`/`member`).

| Колонка | Тип | Заметка |
|---|---|---|
| `id` | UUID | PK |
| `clan_id` | UUID → `clans.id` (CASCADE) | удаление клана чистит состав |
| `user_id` | UUID → `users.id` (CASCADE), **unique** | один игрок — один клан |
| `role` | Enum(`ClanRole`) | по умолчанию `member` |
| `joined_at` | DateTime(tz) | |
| `uq_clan_member` | Unique(`clan_id`, `user_id`) | защита от дублей |

### PvP-комнаты (без таблиц)
`backend/pvp/` состояния в БД не хранит: `ChessGameRoom` (доска, часы
`white_time_left`/`black_time_left`, `result`, `termination_reason`) живёт
в `PVPConnectionManager.active_rooms` (in-memory синглтон `pvp_manager`).
Перезапуск backend обнуляет все PvP-партии — это осознанное решение для прототипа.

## Подключение

`backend/database.py`: асинхронный engine SQLAlchemy 2.0 + `async_session_maker`,
зависимость `get_async_session`.

```
# PostgreSQL (Docker/prod)
DATABASE_URL=postgresql+asyncpg://postgres:postgrespassword@localhost:5433/coolchess
# SQLite (dev без Docker)
DATABASE_URL=sqlite+aiosqlite:///./coolchess.db
```

## Управление схемой

| Скрипт | Назначение |
|---|---|
| `backend/alembic/versions/*` | **Источник истины.** История схемы; применяется через `alembic upgrade head` |
| `backend/init_db.py` | `Base.metadata.create_all` — dev-инициализация без истории (импортирует `auth`/`games`/`clans.models`) |
| `backend/update_schema.py` | **Legacy.** `ALTER TABLE ... ADD COLUMN` только для `users` на базах до Alembic; новые таблицы не создаёт |
| `backend/schema.sql` | эталонная схема для ревью (генерируется `python dump_ddl.py > schema.sql`) |
| `backend/dump_ddl.py` | дамп DDL из метаданных (импортирует `auth`/`games`/`clans.models`) |
| `backend/load_lichess_puzzles.py` | загрузка задач в таблицу `puzzles` |
| `scripts/import_lichess_puzzles.py` | компактный `frontend/public/data/puzzles.json` из `lichess_db_puzzle.csv.zst` (исходник вне Git) |

Порядок на свежей БД: `cp .env.example .env && cp backend/.env.example backend/.env`
(заполнить секреты) → `docker compose up --build -d` (entrypoint сам сделает
`alembic upgrade head`) → загрузить задачи → проверка `GET /health`.
Локально без Docker: `cd backend && alembic upgrade head` (или `python init_db.py`).
