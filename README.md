# CoolChess

Учебная шахматная платформа для школьников: игра против человекоподобного бота, тактические задачи, курсы и геймификация.

Собирает задачи Lichess, валидирует ходы через `python-chess`, генерирует ответы бота через ML-модель Maia-3 (веса `maia3-5m.pt`, вне Git), начисляет XP/монеты/Elo с защитой от фарма, синхронизирует рейтинги Lichess и отдаёт всё через FastAPI + React SPA (Vite + chessground).

## Возможности

- **Партии с ботом** — старт/продолжение/сдача, серверная валидация ходов, ответный ход Maia-3 (`1100–1900 Elo`)
- **Тактические задачи** — датасет Lichess (FEN, UCI-цепочки, рейтинг, популярность, темы), фильтры по сложности и теме
- **Геймификация** — XP, уровни, монеты (`пешки ♟`), Elo; защита от повторного фарма (`user_solved_puzzles`, `IntegrityError` + rollback)
- **Аутентификация** — `fastapi-users`, JWT Bearer, роли `student` / `coach` / `admin` (смена роли только через superuser)
- **Лидерборд** — топ по Elo / уровню / задачам + позиция текущего игрока, маскирование email
- **Lichess-интеграция** — привязка аккаунта через код в Bio, подтяжка blitz/rapid/puzzle рейтингов
- **Курсы и база знаний** — Markdown-статьи в `content/` с YAML-фронтматтером, валидатор статей
- **Фронтенд** — React SPA: доска Chessground, `chess.js`, кабинет, курсы, задачи, профиль, сообщество, hash-роутер

## Структура проекта

```plaintext
📁 CoolChess/
│
├── 📁 backend/                         # FastAPI API (порт 8080)
│   ├── 📄 server.py                    # Точка входа, CORS, подключение роутеров
│   ├── 📄 database.py                  # Async engine + async_session_maker (asyncpg / aiosqlite)
│   ├── 📄 schema.sql                   # Эталонная схема для свежей БД
│   ├── 📄 init_db.py                   # Создание таблиц (Base.metadata.create_all)
│   ├── 📄 update_schema.py             # Докрутка колонок на старой БД
│   ├── 📄 dump_ddl.py                  # Дамп DDL
│   ├── 📄 load_lichess_puzzles.py      # Загрузка задач Lichess в БД
│   ├── 📁 auth/                        # Инфраструктура и Auth
│   │   ├── 📄 models.py                # User, Puzzle, user_solved_puzzles
│   │   ├── 📄 manager.py               # fastapi-users, JWT backend, require_role
│   │   ├── 📄 schemas.py               # UserRead / UserCreate / UserUpdate
│   │   ├── 📄 users_routes.py          # /api/me/profile, lichess-bind, admin role
│   │   └── 📄 db.py                    # Адаптер БД для fastapi-users
│   ├── 📁 bot/                         # Бот Maia-3
│   │   ├── 📄 bot_service.py           # Maia3UCIEngine, predict_move(fen, rating)
│   │   └── 📄 bot_routes.py            # POST /api/bot/move
│   ├── 📁 puzzles/                     # Тактические задачи
│   │   ├── 📄 puzzle_routes.py         # GET /api/puzzles/random, POST /api/puzzles/{id}/solve
│   │   └── 📄 rewards.py               # REWARD_TIERS, calculate_level
│   ├── 📁 games/                       # Партии с ботом
│   │   ├── 📄 models.py                # Game (status, fen, moves_uci)
│   │   ├── 📄 schemas.py               # GameCreateRequest, GameResponse
│   │   ├── 📄 game_routes.py           # /api/games/start|move|resign|active|history
│   │   └── 📄 rewards.py               # calculate_match_rewards (Elo FIDE)
│   ├── 📁 leaderboard/
│   │   ├── 📄 leaderboard_routes.py    # GET /api/leaderboard?category=elo|level|puzzles
│   │   └── 📄 schemas.py
│   ├── 📁 integrations/
│   │   └── 📄 lichess_service.py       # Lichess API: fetch_user_profile, парсинг perfs
│   └── 📁 models/
│       └── 📄 maia3-5m.pt              # Веса Maia-3 (вне Git, правило *.pt)
│
├── 📁 frontend/                        # React SPA (Vite + TypeScript)
│   ├── 📁 src/
│   │   ├── 📄 main.tsx                 # Точка входа, экраны, ChessGame, BoardShell
│   │   ├── 📄 styles.css               # Tailwind + тема CoolChess
│   │   ├── 📁 app/
│   │   │   └── 📄 useHashRoute.ts      # Hash-роутер (#home, #play, #puzzles, ...)
│   │   ├── 📁 data/
│   │   │   ├── 📄 course.ts            # Модули и topicId курсов
│   │   │   ├── 📄 lessonContent.ts     # Временный слой контента уроков
│   │   │   └── 📄 lessonVisuals.ts     # Визуалы уроков (FEN, стрелки)
│   │   ├── 📁 features/
│   │   │   ├── 📁 auth/api/authApi.ts
│   │   │   ├── 📁 auth/model/AuthProvider.tsx
│   │   │   ├── 📁 auth/ui/AuthPage.tsx
│   │   │   ├── 📁 chess-game/api/gameApi.ts
│   │   │   ├── 📁 puzzles/api/puzzleApi.ts
│   │   │   ├── 📁 community/api/leaderboardApi.ts
│   │   │   └── 📁 profile/api/profileApi.ts
│   │   └── 📁 shared/lib/studentState.ts  # Локальное состояние ученика (пешки, серия)
│   ├── 📁 public/
│   │   ├── 📄 coolchess-logo.svg
│   │   └── 📁 data/puzzles.json        # Компактный оффлайн-индекс задач
│   ├── 📄 package.json
│   ├── 📄 vite.config.ts
│   └── 📄 index.html
│
├── 📁 content/                         # База знаний (Markdown-статьи)
│   ├── 📄 README.md                    # Формат статей + проверка
│   ├── 📄 manifest.json                # topicId -> path, status
│   └── 📁 course/chess-basics/         # 9 статей: history, pieces, moves, capture, ...
│
├── 📁 docs/
│   ├── 📄 auth-contract.md             # Контракт JWT (endpoint'ы, form-data login)
│   ├── 📄 frontend-architecture.md     # Целевая FSD-структура frontend
│   ├── 📄 frontend-audit.md            # Аудит текущего frontend
│   ├── 📄 frontend-roadmap.md          # Этапы 1–6 + что согласовать с backend
│   ├── 📄 product-scope.md             # Scope прототипа, экраны, визуал
│   └── 📄 puzzle-topic-map.md          # Маппинг урок -> теги Lichess
│
├── 📁 tests/                           # pytest (93 теста)
│   ├── 📄 conftest.py                  # mock_user, mock_db_session, authorized_client
│   └── 📁 test_backend/
│       ├── 📁 test_auth/               # Роуты, схемы, модель User
│       ├── 📁 test_bot/                # bot_service, bot_routes
│       ├── 📁 test_games/              # game_routes, game_rewards
│       ├── 📁 test_puzzles/            # puzzle_routes, rewards
│       ├── 📁 test_leaderboard/        # leaderboard_routes
│       └── 📁 test_integrations/       # lichess_service
│
├── 📁 scripts/
│   ├── 📄 import_lichess_puzzles.py    # CSV.zst дампа Lichess -> puzzles.json
│   └── 📄 validate_knowledge_base.py   # Проверка front matter и секций статей
│
├── 📄 docker-compose.yml               # postgres:16-alpine (host-порт 5433)
├── 📄 Dockerfile                       # python:3.13-slim + uvicorn server:app :8080
├── 📄 requirements.txt                 # Зависимости backend
├── 📄 pyproject.toml                   # pytest: pythonpath=["backend"], testpaths=["tests"]
├── 📄 .env                             # Локальные секреты (не коммитить)
├── 📄 .gitignore                       # .env, *.pt, data/source, venv, dist
└── 📄 README.md
```

## Быстрый старт

```bash
# 1. Установка (backend)
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# 2. Окружение (JWT_SECRET и VERIFY_SECRET обязательны)
# Создайте .env в корне по образцу из README (DATABASE_URL, JWT_SECRET, VERIFY_SECRET, CORS_ORIGINS)
# Секрет можно сгенерировать: python -c "import secrets; print(secrets.token_urlsafe(32))"

# 3. База данных + схема (из каталога backend/)
cd backend
python init_db.py
# для давно созданной БД — докрутить недостающие колонки:
python update_schema.py

# 4. API (из каталога backend/, слушает порт 8080)
uvicorn server:app --reload --port 8080

# 5. Фронтенд (отдельный терминал, порт 5173)
cd frontend && npm install && npm run dev
```

## Запуск через Docker

### Предварительные требования

- Установленные [Docker](https://docs.docker.com/get-docker/) и Docker Compose
- Файл `.env` в корне проекта с переменными:
  ```bash
  POSTGRES_USER=postgres
  POSTGRES_PASSWORD=postgrespassword
  POSTGRES_DB=coolchess
  POSTGRES_PORT=5433
  DATABASE_URL=postgresql+asyncpg://postgres:postgrespassword@localhost:5433/coolchess
  JWT_SECRET=<секрет_32+_символов>
  VERIFY_SECRET=<секрет_32+_символов>
  CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
  ```
- Веса Maia `backend/models/maia3-5m.pt` (в Git не хранятся, правило `*.pt`). Без файла бот работает в fallback-режиме

### Полный запуск (БД в Docker, backend и frontend локально)

```bash
# Поднять PostgreSQL
docker compose up -d postgres

# Просмотр логов
docker compose logs -f postgres

# Дальше — по разделу "Быстрый старт": init_db.py, uvicorn :8080, vite :5173
```

### Выборочный запуск (без Docker, SQLite)

Если PostgreSQL не нужен:

```bash
# В .env указать SQLite:
# DATABASE_URL=sqlite+aiosqlite:///./coolchess.db
cd backend
python init_db.py
uvicorn server:app --reload --port 8080
```

### Состав сервисов

| Сервис | Назначение | Порт |
|--------|-----------|------|
| `postgres` | PostgreSQL 16 (volume `pgdata`, healthcheck `pg_isready`) | `:5433` -> `5432` |
| `backend` | FastAPI локально через `uvicorn` (не в compose) | `:8080` |
| `frontend` | Vite dev-server локально через `npm run dev` (не в compose) | `:5173` |

### Доступ к сервисам

| Ссылка | Описание |
|--------|----------|
| http://127.0.0.1:8080/docs | Swagger-документация API |
| http://127.0.0.1:8080/redoc | ReDoc-документация API |
| http://127.0.0.1:8080/health | Healthcheck `{"status": "ok"}` |
| http://localhost:5173 | Frontend (hash-маршруты `#home`, `#play`, `#puzzles`, `#profile`) |

### Остановка и управление

```bash
# Остановить PostgreSQL
docker compose down

# Остановить с удалением тома БД (данные пропадут!)
docker compose down -v

# Перезапустить БД
docker compose restart postgres

# Логи БД
docker compose logs -f postgres
```

### Возможные проблемы

1. **Backend не стартует — нет `JWT_SECRET`** — заполните `JWT_SECRET` и `VERIFY_SECRET` в `.env` (минимум 32 символа).
2. **`maia3-5m.pt` не найден** — это нормально для dev: бот отвечает fallback-логикой, в лог пишется `[MaiaBot Warning]`. Положите файл в `backend/models/`.
3. **CORS ошибка в браузере** — проверьте `CORS_ORIGINS` в `.env`: должны быть `http://localhost:5173,http://127.0.0.1:5173`, wildcard с `allow_credentials=True` запрещён.
4. **Login не работает с JSON** — `POST /api/auth/jwt/login` принимает только `form-data` (`username`, `password`), а не JSON.
5. **Порт PostgreSQL занят** — смените `POSTGRES_PORT` в `.env` (по умолчанию `5433`, чтобы не конфликтовать с локальным `5432`).
6. **Frontend пустая страница после build** — для dev используйте `npm run dev`, для prod — `npm run build` + `vite preview`.

## Зависимости

**Python:** fastapi, uvicorn[standard], pydantic, python-multipart, fastapi-users[sqlalchemy], fastapi-users-db-sqlalchemy, email-validator, bcrypt, PyJWT, sqlalchemy[asyncio], asyncpg, aiosqlite, python-dotenv, disposable-email-domains, python-chess, httpx, requests, zstandard, pytest, pytest-asyncio, pytest-cov (опционально: torch + maia3 с GitHub — инференс бота)

**Frontend:** React 18, TypeScript, Vite 8, chessground 9.2, chess.js 1.4, tailwindcss 4.3

## Метрики

### Уровень (level)
Уровень растёт нелинейно от суммарного опыта — каждые 100 XP дают прогрессию по квадратному корню:

```
level(xp) = isqrt(xp // 100) + 1
```

`0–99 XP → 1`, `100–399 XP → 2`, `400–899 XP → 3`, `900–1599 XP → 4`, `1600+ XP → 5`.

### Награды за задачи (фиксированные тиры по рейтингу задачи)
Награда зависит только от рейтинга самой задачи, а не от силы игрока:

```
<=1199: XP 15,  монет 5,  Elo +5
<=1599: XP 30,  монет 10, Elo +8
<=1999: XP 50,  монет 20, Elo +12
<=2399: XP 80,  монет 35, Elo +16
 2400+: XP 120, монет 50, Elo +20
```

Повторное решение той же задачи наград не даёт (`already_solved: true`, ключ `(user_id, puzzle_id)`).

### Награды за матч (формула Elo FIDE, K=32)
Ожидаемый счёт считается по классической формуле, дельта — от фактического результата:

```
expected = 1 / (1 + 10 ^ ((bot_elo - user_elo) / 400))
elo_delta = round(32 * (actual - expected))   # win=1.0, draw=0.5, loss/resign=0.0
```

XP/монеты масштабируются от силы бота (`bot_elo / 15` за победу). Сдача (`resign`) не приносит XP/монет — только Elo как за поражение. Сложность `1–5` маппится в рейтинг `1100/1300/1500/1700/1900`.

## Тестирование

```bash
.\venv\Scripts\python.exe -m pytest -q
```

- 93 теста, 0 failed (mock-сессии БД, `authorized_client` / `anonymous_client`)
- E2E-направления: auth (роли, схемы), bot (FEN-валидация, инференс), games (награды, resign-экономика), puzzles (тиры наград, anti-farm, `IntegrityError`), leaderboard (маскирование email), lichess (404/429/502/503)
- Проверка базы знаний отдельно: `python scripts/validate_knowledge_base.py` (9 статей `ready`)

## Примеры

```bash
# Здоровье API
curl http://127.0.0.1:8080/health

# Регистрация + вход (вход — form-data!)
curl -X POST http://127.0.0.1:8080/api/auth/register -H "Content-Type: application/json" -d "{\"email\":\"student@example.com\",\"password\":\"secret-password\"}"
curl -X POST http://127.0.0.1:8080/api/auth/jwt/login -d "username=student@example.com&password=secret-password"

# Случайная задача + решение (нужен Bearer-токен)
curl "http://127.0.0.1:8080/api/puzzles/random?difficulty=beginner&theme=fork" -H "Authorization: Bearer <jwt>"
curl -X POST http://127.0.0.1:8080/api/puzzles/<id>/solve -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d "{\"user_moves\":\"e2e4\"}"

# Ход бота без авторизации
curl -X POST http://127.0.0.1:8080/api/bot/move -H "Content-Type: application/json" -d "{\"fen\":\"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\",\"difficulty\":1500}"

# Партия: старт -> ход -> сдача
curl -X POST http://127.0.0.1:8080/api/games/start -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d "{\"bot_difficulty\":1500}"
curl http://127.0.0.1:8080/api/leaderboard?category=elo -H "Authorization: Bearer <jwt>"
```

## Мониторинг и инфраструктура

Лёгкий стек без внешних сервисов — всё поднимается локально, см. раздел [Запуск через Docker](#запуск-через-docker).

- **PostgreSQL 16** — основная БД (`pgdata` volume, healthcheck `pg_isready`, интервал 5s)
- **Healthcheck API** — `GET /health` (`{"status": "ok", "app": "CoolChess Server"}`)
- **Swagger / ReDoc** — `GET /docs`, `GET /redoc` на порту `8080`
- **Логи Maia** — `[MaiaBot Warning]` при отсутствии весов, `[MaiaBot Error]` при ошибке инференса
- **Оффлайн-индекс задач** — `frontend/public/data/puzzles.json` как fallback, если API недоступен
- **Валидатор контента** — `scripts/validate_knowledge_base.py` в CI перед деплоем статей

## Скрипты (корень проекта)

| Файл | Назначение |
|------|------------|
| `backend/init_db.py` | Создание всех таблиц (`Base.metadata.create_all`). Запуск: `cd backend && python init_db.py` |
| `backend/update_schema.py` | Докрутка недостающих колонок на давно созданной БД |
| `backend/dump_ddl.py` | Дамп DDL схемы |
| `backend/load_lichess_puzzles.py` | Загрузка задач Lichess напрямую в БД (таблица `puzzles`) |
| `scripts/import_lichess_puzzles.py` | Сборка компактного `puzzles.json` из `lichess_db_puzzle.csv.zst`: `python scripts/import_lichess_puzzles.py data/source/lichess_db_puzzle.csv.zst frontend/public/data/puzzles.json --max-per-tag 500` |
| `scripts/validate_knowledge_base.py` | Проверка `content/manifest.json` + front matter статей. Запуск: `python scripts/validate_knowledge_base.py` |
| `docker-compose.yml` | Только `postgres:16-alpine` (`${POSTGRES_PORT:-5433}:5432`, volume `pgdata`) |
| `Dockerfile` | Сборка backend: `python:3.13-slim` + `uvicorn server:app --host 0.0.0.0 --port 8080` |

## Документация

- `docs/ARCHITECTURE.md` — архитектура backend/frontend, потоки ходов и наград
- `docs/API.md` — полный справочник эндпоинтов с примерами
- `docs/DATABASE.md` — таблицы, подключение, управление схемой
- `docs/ECONOMY.md` — формулы XP/уровня/Elo/монет и защита от фарма
- `docs/DEPLOYMENT.md` — окружение, порты, веса Maia, нюансы (VITE_API_URL, CORS)
- `docs/TESTING.md` — pytest, фикстуры, валидатор базы знаний, frontend-проверки
- `docs/product-scope.md` — scope прототипа, экраны, визуальное направление
- `docs/auth-contract.md` — реальный контракт JWT (endpoint'ы, form-data, CORS)
- `docs/frontend-architecture.md` — целевая FSD-структура frontend
- `docs/frontend-audit.md` — аудит текущего frontend
- `docs/frontend-roadmap.md` — этапы 1–6, что согласовать с бэкендером
- `docs/puzzle-topic-map.md` — маппинг уроков на теги Lichess
- `content/README.md` — формат статей базы знаний
