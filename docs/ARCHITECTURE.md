# Архитектура CoolChess

## Общая схема

```
React SPA (Vite, :5173)
  │  HTTP + JWT Bearer (единый API helper; в dev запросы идут через Vite proxy)
  ▼
FastAPI (backend/server.py, :8080)
  ├── auth/          регистрация, JWT, роли
  ├── bot/           инференс Maia-3
  ├── puzzles/       задачи Lichess + награды
  ├── games/         партии с ботом + награды
  ├── leaderboard/   топы и позиция игрока
  ├── tournaments/   турниры и участники (REST)
  ├── pvp/           PvP-комнаты + WS + серверные часы (in-memory)
  └── integrations/  публичные API Lichess и Chess.com
  ▼
PostgreSQL (compose, :5433) или SQLite (aiosqlite, dev-режим)
  (PvP-состояние в памяти процесса, в БД не пишется)
```

Точка входа backend — `backend/server.py`: создаёт `FastAPI(title="CoolChess API")`
с `lifespan` (старт/стоп фонового таймера PvP), настраивает CORS из
`CORS_ORIGINS`, подключает доменные роутеры задач, партий, лидерборда, бота,
пользователей, турниров и PvP
и стандартные роутеры `fastapi-users` (auth / register / reset-password /
verify / users). Запуск из каталога `backend/`:
Из корня репозитория: `python -m uvicorn server:app --app-dir backend --reload --reload-dir backend --port 8080` (в compose — 1 воркер, см. ниже).

## Backend-модули

| Модуль | Файлы | Ответственность |
|---|---|---|
| `auth/` | `models.py`, `manager.py`, `schemas.py`, `db.py`, `users_routes.py` | `User`/`UserRole`, JWT backend (TTL 86400с), `require_role`/`require_superuser`, профиль, привязка Lichess, смена ролей |
| `bot/` | `bot_service.py`, `bot_routes.py` | `MaiaBotService.predict_move(fen, target_rating)`, `POST /api/bot/move` |
| `puzzles/` | `puzzle_routes.py`, `rewards.py` | выдача случайной задачи, проверка решения, `REWARD_TIERS`, `calculate_level` |
| `games/` | `models.py`, `schemas.py`, `game_routes.py`, `rewards.py` | жизненный цикл партии, валидация ходов, ход Maia в ответ, `calculate_match_rewards` |
| `leaderboard/` | `leaderboard_routes.py`, `schemas.py` | топ по `elo`/`level`/`puzzles`, `my_rank`, маскирование email |
| `tournaments/` | `models.py`, `tournament_routes.py` | Настройки турниров и участники в БД; форматы round-robin/swiss/single-elimination; создание, регистрация, выбор стороны и распределение по группам с RBAC. Автоматическое формирование пар ещё не реализовано |
| `pvp/` | `models.py`, `manager.py`, `pvp_routes.py` | `ChessGameRoom` (доска `python-chess`, часы, инкремент, TTL), `PVPConnectionManager` (синглтон `pvp_manager`, фоновый таймер 1с, `settle_ratings`), короткий пятисимвольный код комнаты, HTTP `POST /api/pvp/create` + WS `/ws/pvp/{game_id}?token=` |
| `integrations/` | `lichess_service.py`, `chesscom_service.py` | Lichess: проверка владельца по коду Bio и синхронизация рейтингов; Chess.com: чтение публичных рейтингов по нику без подтверждения владельца |
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

### Привязка рейтинговых аккаунтов
1. `GET /api/users/lichess-verification-code` — одноразовая генерация
   `coolchess-<hex>` (случайный; детерминированный от `user.id` запрещён,
   т.к. id виден в лидерборде).
2. Ученик вставляет код в Bio профиля lichess.org.
3. `POST /api/users/sync-lichess` — сервер читает публичный профиль через
   Lichess API, ищет код в Bio, при успехе сохраняет рейтинги; новичку
   (`games_played == 0`, `elo == 1200`) калибрует стартовый Elo из rapid/blitz.
4. `POST /api/users/sync-chesscom` — читает публичную статистику Chess.com по
   нику и сохраняет доступные рейтинги. Публичный endpoint не подтверждает
   владение аккаунтом. Пароли Chess.com и Lichess не запрашиваются.

### PvP-партия (HTTP create → WS)
1. `POST /api/pvp/create` (JWT в header) — уникальный пятисимвольный код комнаты,
   создатель — белые, место чёрных открыто (`black.user_id=None`,
   `waiting_opponent=true`).
   Для прямого приглашения `POST /api/pvp/rooms` часы и результат матча ждут
   подключения обоих игроков.
2. WS `GET /ws/pvp/{id}?token=` (`decode_jwt`, audience `fastapi-users:auth`);
   неуспех — закрытие `1008`. Первый чужак занимает место чёрных (`claim_black_seat`
   с подгрузкой email/elo из БД), остальные — зрители в `room.spectators`.
3. `{"action": "move"}`: проверка очерёдности (`board.turn` vs цвет), зрителям —
   `error`. `room.apply_move(uci, loop.time())`: списание времени, валидация
   через `python-chess`, инкремент сделавшему ход, проверка конца партии.
   Партия, завершённая ходом, рассылается как `game_over` (а не `move_made`).
4. `resign`/`draw_accept` — только игроки; `game_over` + `schedule_settle(room)`:
   симметричный Elo K=32 пишется в БД фоном (не блокирует WS-цикл).
5. Фоновый таймер (`lifespan` → `start_background_tasks`, тик 1с): списывает
   время активным партиям (таймаут → `game_over` + settle), чистит завершённые
   (>15 мин) и брошенные без игроков (>30 мин) комнаты.
6. Комнаты in-memory ⇒ строго 1 воркер uvicorn (`entrypoint.sh --workers 1`);
   рестарт backend сбрасывает партии.

## Frontend

React 18 + TypeScript + Vite + Tailwind, доска `chessground`, правила `chess.js`.
Hash-роутер (`useHashRoute`): `#home`, `#auth`, `#learn`, `#puzzles`, `#play`,
`#pvp`, `#tournaments`, `#community`, `#profile`. Каждый домен имеет свой API-модуль
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
