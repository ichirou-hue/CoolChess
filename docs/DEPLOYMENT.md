# Деплой и окружение CoolChess

## Порты

| Компонент | Порт | Как запустить |
|---|---|---|
| Backend (FastAPI) | `:8080` | Из корня: `python -m uvicorn server:app --app-dir backend --reload --reload-dir backend --port 8080` (PowerShell: `./scripts/run_backend.ps1`) |
| Frontend (Vite dev) | `:5173` | `cd frontend && npm run dev` |
| PostgreSQL (Docker) | `:5433` → `5432` | `docker compose up -d postgres` |
| Nginx (Docker) | `:80` | `docker compose up -d nginx` (прокси `/api/`, `/docs`, `/ws/`, `/health` → `backend:8080`) |
| PvP WebSocket | `:8080/ws/pvp/{game_id}?token=<jwt>` (или через nginx `:80/ws/...`) | тот же процесс uvicorn, отдельного порта нет; комнаты in-memory (`pvp_manager`), перезапуск backend их сбрасывает |

## Переменные окружения (не коммитить)

Образцы: `.env.example` (корень), `backend/.env.example` и
`frontend/.env.example`. Для Docker скопируйте первые два в `.env` и
`backend/.env` и заполните секреты. Compose читает `backend/.env`
через `env_file`, `DATABASE_URL` внутри сети compose перезаписывается
на `postgres:5432`.

| Переменная | Пример | Обязательна |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgrespassword@localhost:5433/coolchess` | да (или SQLite-вариант ниже) |
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` | да |
| `VERIFY_SECRET` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` | да |
| `ENV` | `development` | нет |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | `postgres` / уникальный сгенерированный пароль / `coolchess` / `5433` | для compose |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | нет (есть дефолт) |
| `VITE_API_URL` | пусто для Vite proxy | нет |
| `SMTP_HOST`, `SMTP_PORT` | `smtp.mail.ru`, `465` | значения по умолчанию |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | полный адрес Mail.ru и пароль приложения | да для регистрации |
| `SMTP_FROM_EMAIL` | подтверждённый адрес отправителя; по умолчанию берётся `SMTP_USERNAME` | нет |
| `SMTP_STARTTLS`, `SMTP_USE_SSL` | `false`, `true` (SSL на порту 465) | значения по умолчанию |
| `FRONTEND_URL` | `http://localhost:5173` локально; HTTPS origin сайта в production | адрес, на который ведёт ссылка сброса пароля |

Без `JWT_SECRET`/`VERIFY_SECRET` backend падает с `RuntimeError` (вне тестов).
Регистрация требует заполненных `SMTP_USERNAME` и `SMTP_PASSWORD` в
`backend/.env`. Для Mail.ru создайте пароль приложения; `SMTP_FROM_EMAIL`,
если задан, должен совпадать с почтовым ящиком SMTP-логина. Сервер отправляет
письма через Mail.ru SMTP независимым получателям, включая Mail.ru, Gmail и
Яндекс.Почту. Коды подтверждения хранятся
только в виде HMAC-хеша, действуют 10 минут и допускают до пяти попыток.
Повторная отправка ограничена интервалом в 60 секунд. Для отправки обязательно
включить `SMTP_STARTTLS` или `SMTP_USE_SSL`; при заполнении учётных данных
нужно задать и логин, и пароль.
Перед отправкой писем сброса пароля в production обязательно задайте
`FRONTEND_URL` как публичный HTTPS-адрес frontend. Если переменная не задана,
ссылка по умолчанию ведёт на `http://localhost:5173` и недоступна получателю
вне вашей машины; почтовые сервисы могут помечать такую ссылку как подозрительную.
Для SQLite без Docker: `DATABASE_URL=sqlite+aiosqlite:///./coolchess.db`.

## Порядок запуска с нуля

Для всех локальных Python-команд проекта используется одно окружение
`.venv` в корневой папке. Создайте и установите обычные backend-зависимости:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

В PowerShell окружение активируется командой
`.\.venv\Scripts\Activate.ps1`. Maia-3 и веса модели необязательны; см. раздел
ниже.

Продоподобно (всё в Docker):

```powershell
cp .env.example .env
cp backend/.env.example backend/.env
# заполнить POSTGRES_PASSWORD, JWT_SECRET и VERIFY_SECRET в корневом .env
# заполнить JWT_SECRET / VERIFY_SECRET в backend/.env
docker compose up --build -d
# опционально: python backend/load_lichess_puzzles.py
```

Compose не содержит пароля PostgreSQL по умолчанию и завершится с ошибкой,
если `POSTGRES_PASSWORD` не задан. Сгенерируйте уникальный URL-safe пароль,
например `python -c "import secrets; print(secrets.token_urlsafe(32))"`,
и задайте его только в корневом `.env`. Порт PostgreSQL опубликован только на
`127.0.0.1`; наружу доступны nginx и необходимые приложению endpoints, а не
сам сервер базы данных.

Для разработки (только БД в Docker, остальное локально):

```bash
docker compose up -d postgres
cd backend
alembic upgrade head   # или: python init_db.py
cd ..
python -m uvicorn server:app --app-dir backend --reload --reload-dir backend --port 8080
# отдельный терминал:
cd frontend; npm install; npm run dev
```

На Windows вместо `../.venv/bin/python` используйте
`..\.venv\Scripts\python.exe`.

Проверка: `GET http://localhost/health` (через nginx) или
`GET http://127.0.0.1:8080/health` напрямую, Swagger — `/docs`.

## Веса Maia-3

Файл `backend/models/maia3-5m.pt` в Git не хранится (`.gitignore`: `*.pt`,
`.dockerignore` тоже режет веса — в образ они не попадают).
Без него бот работает в fallback-режиме (первый легальный ход, поле
`fallback: true` в ответе) — это штатное поведение для dev. Для полной силы:
положить `.pt`-файл в `backend/models/` и доустановить тяжёлые пакеты
(см. блок «Maia-3» в корневом `requirements.txt`: `torch` + `maia3` с GitHub).

## Нюансы

- **Vite API URL.** При локальной разработке оставьте `VITE_API_URL` пустым:
  единый API helper отправляет относительные `/api/...` запросы через Vite proxy
  на backend `localhost:8080`. Для отдельного API-хоста задайте полный адрес,
  например `http://localhost:8080`, и перезапустите Vite после изменения `.env`.
- **CORS.** `allow_origins=["*"]` вместе с `allow_credentials=True` запрещён —
  только явный список в `CORS_ORIGINS`.
- **Login — form-data.** `POST /api/auth/jwt/login` принимает `username` +
  `password` как форму, не JSON (требование `fastapi-users`; отсюда
  `python-multipart` в зависимостях).
- **Docker.** `Dockerfile` собирает backend (`python:3.13-slim`,
  entrypoint: `alembic upgrade head` + `uvicorn server:app --host 0.0.0.0
  --port 8080 --workers 1`); `docker-compose.yml` поднимает `postgres:16-alpine`
  (volume `pgdata`, healthcheck `pg_isready`), `backend` (healthcheck `/health`)
  и `nginx:alpine` (зависит от здорового backend). Frontend в compose не входит —
  запускается локально. `.dockerignore` режет `venv`, `frontend/node_modules`,
  веса моделей и `.env`.
- **Один воркер — осознанно.** PvP-комнаты живут в памяти процесса
  (`pvp_manager`), поэтому `--workers 1`. Масштабирование потребует Redis/pub-sub.
- **Данные.** `data/source/` (дампы Lichess `*.csv.zst`), `*.sqlite3`, веса
  моделей — вне Git по `.gitignore`.

## Отложено до появления сервера

TLS/домен (в `nginx.conf` уже есть location для Let's Encrypt),
прод-`CORS_ORIGINS`, ротация секретов, CI-деплой, бэкапы (`backup.sh`
есть в корне — расписать по cron на сервере).
