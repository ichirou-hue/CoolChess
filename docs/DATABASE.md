# База данных CoolChess

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
| `backend/init_db.py` | `Base.metadata.create_all` — чистая инициализация (требует импорта `auth.models`, `games.models`) |
| `backend/update_schema.py` | `ALTER TABLE ... ADD COLUMN` для давно созданной БД (список `MISSING_COLUMNS`; в Postgres — `IF NOT EXISTS`) |
| `backend/schema.sql` | эталонная схема для ревью |
| `backend/dump_ddl.py` | дамп DDL из метаданных |
| `backend/load_lichess_puzzles.py` | загрузка задач в таблицу `puzzles` |
| `scripts/import_lichess_puzzles.py` | компактный `frontend/public/data/puzzles.json` из `lichess_db_puzzle.csv.zst` (исходник вне Git) |

Порядок на свежей БД: поднять `postgres` → `cd backend && python init_db.py` →
загрузить задачи → старт API. Alembic не используется осознанно:
схема создаётся через `create_all`, догоняется через `update_schema.py`
(см. docstring скрипта).
