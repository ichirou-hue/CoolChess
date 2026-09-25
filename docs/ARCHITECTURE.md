# Архитектура CoolChess

## Общая схема

```
React SPA (Vite, :5173)
  │  HTTP + JWT Bearer (VITE_API_URL, по умолчанию http://localhost:8080)
  ▼
FastAPI (backend/server.py, :8080)
  ├── auth/          регистрация, JWT, роли
  ├── bot/           инференс Maia-3
  ├── puzzles/       задачи Lichess + награды
  ├── games/         партии с ботом + награды
  ├── leaderboard/   топы и позиция игрока
  └── integrations/  Lichess API
  ▼
PostgreSQL (compose, :5433) или SQLite (aiosqlite, dev-режим)
```

Точка входа backend — `backend/server.py`: создаёт `FastAPI(title="CoolChess API")`,
настраивает CORS из `CORS_ORIGINS`, подключает 5 доменных роутеров и стандартные
роутеры `fastapi-users` (auth / register / verify / users). Запуск из каталога
`backend/`: `uvicorn server:app --reload --port 8080`.

## Backend-модули

| Модуль | Файлы | Ответственность |
|---|---|---|
| `auth/` | `models.py`, `manager.py`, `schemas.py`, `db.py`, `users_routes.py` | `User`/`UserRole`, JWT backend (TTL 86400с), `require_role`/`require_superuser`, профиль, привязка Lichess, смена ролей |
| `bot/` | `bot_service.py`, `bot_routes.py` | `MaiaBotService.predict_move(fen, target_rating)`, `POST /api/bot/move` |
| `puzzles/` | `puzzle_routes.py`, `rewards.py` | выдача случайной задачи, проверка решения, `REWARD_TIERS`, `calculate_level` |
| `games/` | `models.py`, `schemas.py`, `game_routes.py`, `rewards.py` | жизненный цикл партии, валидация ходов, ход Maia в ответ, `calculate_match_rewards` |
| `leaderboard/` | `leaderboard_routes.py`, `schemas.py` | топ по `elo`/`level`/`puzzles`, `my_rank`, маскирование email |
| `integrations/` | `lichess_service.py` | `fetch_user_profile`, парсинг `perfs`, обработка 404/429/502/503 |
| корень | `database.py`, `init_db.py`, `update_schema.py`, `schema.sql`, `dump_ddl.py`, `load_lichess_puzzles.py` | engine/сессии, создание и миграция схемы, загрузка задач |

## Ключевые потоки

### Ход в партии (`POST /api/games/{id}/move`)
1. Проверка JWT (`current_active_user`), загрузка партии пользователя.
2. Валидация UCI-хода через `python-chess` против `current_fen`.
3. Применение хода игрока, проверка конца партии.
4. Если партия продолжается — ответный ход `maia_engine.predict_move(...)`.
5. При завершении — `calculate_match_rewards` + `apply_match_rewards_to_user`
   (Elo-дельта, XP, монеты, пересчёт `level`), возврат `GameResponse`.

### Решение задачи (`POST /api/puzzles/{id}/solve`)
1. Сравнение `user_moves` с первым ходом решения из цепочки `moves`.
2. При успехе — попытка вставки в `user_solved_puzzles`; дубль по ключу
   `(user_id, puzzle_id)` даёт `already_solved: true` без повторных наград
   (`IntegrityError` + rollback гасит гонку параллельных запросов).
3. Награды — строго по тиру рейтинга задачи (`get_fixed_puzzle_rewards`).

### Привязка Lichess
1. `GET /api/users/lichess-verification-code` — одноразовая генерация
   `coolchess-<hex>` (случайный; детерминированный от `user.id` запрещён,
   т.к. id виден в лидерборде).
2. Ученик вставляет код в Bio профиля lichess.org.
3. `POST /api/users/sync-lichess` — сервер читает публичный профиль через
   Lichess API, ищет код в Bio, при успехе сохраняет рейтинги; новичку
   (`games_played == 0`, `elo == 1200`) калибрует стартовый Elo из rapid/blitz.

## Frontend

React 18 + TypeScript + Vite + Tailwind, доска `chessground`, правила `chess.js`.
Hash-роутер (`useHashRoute`): `#home`, `#auth`, `#learn`, `#puzzles`, `#play`,
`#community`, `#profile`. Каждый домен имеет свой API-модуль
(`features/*/api/*Api.ts`), читающий `VITE_API_URL`. Серверные награды —
источник истины; `shared/lib/studentState.ts` — только локальный адаптер
(пешки, серия). Целевая структура — в `docs/frontend-architecture.md`,
план — в `docs/frontend-roadmap.md`.

## Технические решения

- **Async SQLAlchemy 2.0** везде (`AsyncSession`, `async_sessionmaker`); сессии
  инжектятся через `get_async_session`.
- **JWT Bearer**, не cookie-сессии (см. `docs/auth-contract.md`).
- **Wildcard CORS запрещён** в связке с `allow_credentials=True` — только явный
  список `CORS_ORIGINS`.
- **Роль назначает только сервер** (`UserRole.STUDENT` по умолчанию); смена —
  только `PATCH /api/admin/users/{id}/role` для superuser.
- **Email в лидерборде маскируются** (`m***@domain`) — защита PII.
- **Веса Maia вне Git** (`*.pt` в `.gitignore`); отсутствие файла — штатный
  fallback, а не падение.
