# Telegram-бот CoolChess (aiogram 3, long polling)

Бот и сайт работают в едином контуре: общая PostgreSQL, общие модели
(`backend/auth/models.py`), общий `BOT_TOKEN`.

## Локальный запуск

```bash
# из корня репозитория, venv с зависимостями бота:
pip install -r telegram_bot/requirements.txt
python -m telegram_bot.main
```

Нужны переменные окружения (единственный `.env` в корне репозитория).
Локально бот и сайт по умолчанию делят sqlite `backend/coolchess.db`,
поэтому DATABASE_URL можно не задавать:

```env
BOT_TOKEN=123456:ABC...            # токен от @BotFather
WEBAPP_URL=https://<твой-домен>/   # URL Mini App (кнопка «Открыть CoolChess»)
TELEGRAM_BOT_USERNAME=CoolChessBot # опционально: для диплинков привязки
# DATABASE_URL — только если нужен локальный PostgreSQL вместо sqlite:
# DATABASE_URL=postgresql+asyncpg://postgres:...@localhost:5433/coolchess
```

> ⚠️ Хост базы для локального запуска — `localhost:5433` (проброс
> `docker-compose`: `127.0.0.1:5433 → postgres:5432`). Хост `postgres`
> резолвится только **внутри** docker-сети. Если база недоступна,
> бот не падает: пользователь получает «Сервис временно недоступен»,
> а трейс уходит в логи.

## Работа без сервера (только локально)

Кнопка `web_app` требует **публичный HTTPS**, поэтому без сервера нужен
туннель. В репозитории есть скрипт (нужен ngrok):

```bash
./scripts/dev-tunnel.sh   # туннель до vite + WEBAPP_URL и CORS в .env
```

Дальше перезапусти backend и бота (оба читают `.env` на старте).
Кнопка «♟ Открыть CoolChess» в `/start` поведёт на URL туннеля —
Mini App откроется прямо в Telegram-клиенте с реальным `initData`,
вход произойдёт автоматически. Важно: бесплатный ngrok при каждом
рестарте может сменить поддомен — тогда прогони скрипт заново
и снова перезапусти backend и бота. Привязка через Menu Button
в @BotFather (`/setmenubutton`) — опционально, на тот же URL.

## Команды

- `/start` — приветствие + кнопка Mini App. Если Telegram уже привязан —
  сразу узнаём пользователя.
- `/start bind_<token>` — диплинк из личного кабинета сайта: карточка
  аккаунта + кнопки ✅ Подтвердить / ❌ Отмена.
- `/profile` — ник, статус привязки, роль, рейтинг.
- `/help` — справка.

## Привязка аккаунта сайта

1. На сайте: профиль → «Связать Telegram» → `POST /api/users/bind-token`
   возвращает одноразовый токен (15 минут) и диплинк
   `t.me/<бот>?start=bind_<token>`.
2. В чате бота: подтвердить кнопкой. `telegram_id` сохраняется
   в `users.telegram_id`, токен сгорает.
3. Дальше Mini App логинит автоматически через `initData`.

## Важно про WEBAPP_URL

Кнопки `web_app` требуют **публичный HTTPS**. Для локальной разработки
подними туннель (ngrok/cloudflared) до фронта и укажи его в `WEBAPP_URL`,
а в @BotFather прикрепи тот же URL как Web App (`/newapp` / Menu Button).
