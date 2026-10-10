# CoolChess

Учебная шахматная платформа: обучение, задачи, партии с ботом и игроками,
рейтинги и турниры. Backend — FastAPI + PostgreSQL/SQLite; frontend — React,
TypeScript и Vite. Основной язык интерфейса — русский.

## Возможности

- **Обучение:** курсы с интерактивными досками, проверкой знаний, практикой и
  библиотекой дебютов.
- **Игра с ботом:** партии с серверной проверкой ходов и наградами; Maia-3
  используется, если установлены модель и веса, иначе включается fallback.
- **PvP:** комнаты реального времени через WebSocket, с автоматически созданным
  пятисимвольным кодом, серверными часами и Elo.
- **Турниры:** роли `coach` и `admin` могут создавать турниры, выбирать формат,
  контроль времени, лимит, добавлять игроков и назначать группы. Игроки могут
  записываться и указывать предпочитаемую сторону. Турнирные пары и проведение
  матчей пока не автоматизированы.
- **Профиль и рейтинг:** при регистрации задаётся публичное имя/никнейм;
  лидерборд показывает его вместо адреса почты.
- **Внешние рейтинги:** проверенная привязка Lichess через код в Bio и
  синхронизация публичных рейтингов Chess.com по нику. Пароли внешних аккаунтов
  CoolChess не запрашивает.
- **Задачи Lichess и геймификация:** XP, уровни, Elo и монеты с защитой
  от повторного получения наград.

## Требования

- Python 3.12 или новее (основная поддерживаемая конфигурация backend в Docker —
  Python 3.13).
- Node.js, npm и Docker Compose — если запускаете соответствующие части проекта.
- Maia-3 необязателен: без весов `backend/models/maia3-5m.pt` API бота работает
  в fallback-режиме.

## Быстрый запуск локально

Все Python-команды используют одно виртуальное окружение в корне проекта —
`.venv`. Активируйте его либо вызывайте интерпретатор напрямую. Для первого
запуска:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

В PowerShell активация выглядит как `.\.venv\Scripts\Activate.ps1`.
Создайте `.env` из `.env.example`, задайте сгенерированный уникальный `POSTGRES_PASSWORD`,
а также `JWT_SECRET` и `VERIFY_SECRET` (не менее 32 символов). Для локального
backend укажите тот же пароль в `DATABASE_URL`; настройте SMTP
(`SMTP_HOST`, `SMTP_FROM_EMAIL` и параметры подключения), чтобы отправлять
коды подтверждения регистрации.
Для локального PostgreSQL при запуске через Compose используется
`localhost:5433`; без PostgreSQL можно указать:

```dotenv
DATABASE_URL=sqlite+aiosqlite:///./coolchess.db
```

Примените миграции из каталога `backend/`, а API запускайте либо из корня,
либо из `backend/` (команды отличаются — `--app-dir backend` нужен только из корня):

```bash
cd backend
alembic upgrade head   # основной путь (миграции)
# альтернатива для dev без Alembic:
# python init_db.py
# для БД, созданной до Alembic, — докрутить колонки users:
# python update_schema.py

# 4. API (слушает порт 8080)
# Вариант А — из корня репозитория:
# PowerShell:
.\scripts\run_backend.ps1
# Любая оболочка (из корня):
python -m uvicorn server:app --app-dir backend --reload --reload-dir backend --port 8080
# Вариант Б — уже находясь в каталоге backend/ (без --app-dir):
python -m uvicorn server:app --reload --port 8080

# 5. Фронтенд (отдельный терминал, порт 5173, из корня)
cd frontend && npm install && npm run dev
```

Для SQLite миграции создадут структуру базы автоматически; PostgreSQL должен
быть запущен заранее. Не используйте `init_db.py` вместо Alembic для уже
развиваемой базы.

### Демо-аккаунты для тестирования

Чтобы любой тестировщик мог войти с готовой ролью, после миграций создайте
демо-аккаунты из каталога `backend/`:

```bash
ENV=development ENABLE_DEMO_ACCOUNTS=true ../.venv/bin/python seed_demo_accounts.py
```

| Роль | Email | Пароль |
|---|---|---|
| Администратор | `admin@coolchess.com` | `Rook&River_74Moon` |
| Тренер | `coach@coolchess.com` | `Bishop!Cedar_83Lake` |
| Ученик | `student@coolchess.com` | `Knight#Cloud_59Pine` |

Повторный запуск восстановит эти пароли и роли. Скрипт намеренно требует
`ENV=development` или `ENV=test` и явный `ENABLE_DEMO_ACCOUNTS=true`; не
запускайте его на production-базе. Эти общие учётные данные предназначены
только для изолированной демонстрационной/тестовой среды. Если в старой
локальной базе остались демо-пользователи с адресами `@coolchess.local`, скрипт
обновит их email и сохранит записи пользователей.

В отдельном терминале из корня установите frontend-зависимости и запустите Vite:

```bash
cd frontend
npm install
npm run dev
```

Frontend будет доступен на `http://localhost:5173`, API — на
`http://localhost:8080`; Swagger — `http://localhost:8080/docs`.
Локально оставьте `VITE_API_URL` пустым в `frontend/.env`, чтобы запросы шли
через Vite proxy. Дополнительные параметры описаны в
[руководстве по деплою](docs/DEPLOYMENT.md).

## Запуск с PostgreSQL через Docker

Подготовьте `.env` и `backend/.env` по образцам в корне и каталоге backend,
заполните секреты и запустите сервисы:

```bash
docker compose up --build -d
curl http://localhost/health
```

Compose применяет Alembic-миграции при запуске backend. Nginx доступен на
порту 80; frontend по-прежнему запускается отдельно через Vite. Для деталей
см. [руководство по деплою](docs/DEPLOYMENT.md).

## Проверки

Из корня репозитория:

```bash
.venv/bin/python -m pytest -q
.venv/bin/python scripts/validate_knowledge_base.py
npm --prefix frontend run build
```

На Windows используйте `.venv\Scripts\python.exe` вместо `.venv/bin/python`.
Подробности — в [руководстве по тестированию](docs/TESTING.md).

## API и документы

- [Справочник API](docs/API.md) — endpoints, авторизация и WebSocket.
- [Архитектура](docs/ARCHITECTURE.md) — модули, потоки и технические решения.
- [База данных](docs/DATABASE.md) — таблицы и миграции.
- [Контракт авторизации](docs/auth-contract.md) — регистрация, имя профиля и JWT.
- [Деплой](docs/DEPLOYMENT.md) — переменные окружения и запуск сервисов.
- [Тестирование](docs/TESTING.md) — backend, frontend и валидатор контента.
- [Экономика](docs/ECONOMY.md) — XP, Elo, уровни и награды.
- [Область продукта](docs/product-scope.md) — готовые функции и ограничения.
- [Курс шахмат](content/README.md) — формат учебных материалов.

## Структура

```text
backend/
  auth/             регистрация, профили и роли
  bot/              ходы шахматного бота
  games/            партии с ботом и награды
  puzzles/          задачи и проверка решений
  leaderboard/      рейтинг игроков
  pvp/              PvP-комнаты и WebSocket
  tournaments/      турниры и управление участниками
  integrations/     Lichess и Chess.com
  alembic/versions/ миграции базы данных
frontend/
  src/features/     авторизация, игра, сообщество, профиль и обучение
tests/              pytest-тесты backend
docs/               API, архитектура, запуск и продуктовые документы
content/            материалы шахматного курса
```

PvP-комнаты живут в памяти процесса; поэтому backend запускается с одним
воркером, а перезапуск сервера завершает текущие комнаты. Турниры хранятся в
базе данных. Таблица лидеров скрывает email и показывает публичный никнейм.
