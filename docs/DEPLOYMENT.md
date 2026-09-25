# Деплой и окружение CoolChess

## Порты

| Компонент | Порт | Как запустить |
|---|---|---|
| Backend (FastAPI) | `:8080` | `cd backend && uvicorn server:app --reload --port 8080` |
| Frontend (Vite dev) | `:5173` | `cd frontend && npm run dev` |
| PostgreSQL (Docker) | `:5433` → `5432` | `docker compose up -d postgres` |

## Переменные окружения (`.env` в корне, не коммитить)

| Переменная | Пример | Обязательна |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgrespassword@localhost:5433/coolchess` | да (или SQLite-вариант ниже) |
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` | да |
| `VERIFY_SECRET` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` | да |
| `ENV` | `development` | нет |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | `postgres` / `postgrespassword` / `coolchess` / `5433` | для compose |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | нет (есть дефолт) |
| `VITE_API_URL` | `http://localhost:8080` | см. нюанс ниже |

Без `JWT_SECRET`/`VERIFY_SECRET` backend падает с `RuntimeError` (вне тестов).
Для SQLite без Docker: `DATABASE_URL=sqlite+aiosqlite:///./coolchess.db`.

## Порядок запуска с нуля

```powershell
docker compose up -d postgres
cd backend
python init_db.py
# опционально: python load_lichess_puzzles.py
uvicorn server:app --reload --port 8080
# отдельный терминал:
cd frontend; npm install; npm run dev
```

Проверка: `GET http://127.0.0.1:8080/health`, Swagger — `/docs`.

## Веса Maia-3

Файл `backend/models/maia3-5m.pt` в Git не хранится (`.gitignore`: `*.pt`).
Без него бот работает в fallback-режиме (первый легальный ход) — это штатное
поведение для dev. Для полной силы: положить `.pt`-файл в `backend/models/`
и доустановить тяжёлые пакеты (см. блок «Maia-3» в `requirements.txt`:
`torch` + `maia3` с GitHub).

## Нюансы

- **Vite API URL.** Модули фронтенда читают `VITE_API_URL`, но дефолты в коде
  расходятся: `authApi`/`gameApi`/`puzzleApi` — `http://localhost:8080`,
  `leaderboardApi`/`profileApi` — `http://localhost:8081`. Чтобы все модули
  точно ходили в один backend, задайте `VITE_API_URL=http://localhost:8080`
  в `frontend/.env` явно. Долгосрочно — свести все модули к одному helper.
- **CORS.** `allow_origins=["*"]` вместе с `allow_credentials=True` запрещён —
  только явный список в `CORS_ORIGINS`.
- **Login — form-data.** `POST /api/auth/jwt/login` принимает `username` +
  `password` как форму, не JSON (требование `fastapi-users`; отсюда
  `python-multipart` в зависимостях).
- **Docker.** `Dockerfile` собирает backend (`python:3.13-slim`,
  `uvicorn server:app --host 0.0.0.0 --port 8080`); `docker-compose.yml`
  поднимает только `postgres:16-alpine` с volume `pgdata` и healthcheck
  `pg_isready`. Frontend и backend в compose не входят — запускаются локально.
- **Данные.** `data/source/` (дампы Lichess `*.csv.zst`), `*.sqlite3`, веса
  моделей — вне Git по `.gitignore`.
