# Тестирование CoolChess

## Backend (pytest)

```bash
.venv/bin/python -m pytest -q
```

- Используйте единое Python-окружение `.venv` в корневой папке проекта.
  В Windows команда: `.venv\Scripts\python.exe -m pytest -q`.
- Последняя проверка: **159 тестов, 0 failed**.
- Конфигурация — `pyproject.toml`: `pythonpath = ["backend"]`
  (импорты `server`, `database`, `auth`, ... работают из корня),
  `testpaths = ["tests"]`.
- `pytest-asyncio` — для асинхронных ручек и фикстур; `httpx.ASGITransport` —
  вызовы API без поднятого сервера; `starlette.testclient.TestClient` —
  синхронные WebSocket-тесты PvP.
- На Python 3.14 `AsyncMock` без настроенного `return_value` возвращает
  корутину из дочерних вызовов: моки БД надо wire'ить явно
  (`execute.return_value = MagicMock(scalar_one_or_none=...)`), как в
  `test_auth_routes.py`.

  ### Демо-аккаунты для ручной проверки

  Чтобы развернуть готовые входы всех ролей в локальной или тестовой базе,
  перейдите в `backend/` и выполните:

  ```bash
  ENV=development ENABLE_DEMO_ACCOUNTS=true ../.venv/bin/python seed_demo_accounts.py
  ```

  | Роль | Email | Пароль |
  |---|---|---|
  | Администратор | `admin@coolchess.com` | `Rook&River_74Moon` |
  | Тренер | `coach@coolchess.com` | `Bishop!Cedar_83Lake` |
  | Ученик | `student@coolchess.com` | `Knight#Cloud_59Pine` |

  Скрипт идемпотентен и при повторном запуске сбрасывает эти три аккаунта на
  указанные роли и пароли. В production запуск запрещён; не используйте общие
  демо-пароли в публичной или рабочей базе. Старые локальные email на домене
  `@coolchess.local` автоматически заменяются на валидные `@coolchess.com`.

  ### Фикстуры (`tests/conftest.py`)

| Фикстура | Что даёт |
|---|---|
| `mock_user` | `User` с `elo 1200`, `xp/coins 0`, роль `student` |
| `mock_db_session` | `AsyncMock` сессии (`execute/commit/refresh/rollback` — awaitable, `add` — sync `MagicMock`) |
| `authorized_client` | `AsyncClient` + подмена `current_active_user` и `get_async_session` |
| `anonymous_client` | `AsyncClient` без авторизации (проверка 401; WS-тесты строят свой `TestClient(app)`) |

### Покрытие по папкам

| Папка | Что проверяется |
|---|---|
| `test_auth/` | регистрация и подтверждение email-кодом, повторная отправка, запрет входа до подтверждения, схемы и нормализация email |
| `test_bot/` | валидация FEN (400), difficulty (422 вне 1–3000), инференс/fallback `predict_move` |
| `test_games/` | + старт с висящей партией: старая закрывается как сданная с Elo-штрафом без XP |
| `test_pvp/` (11) | `ChessGameRoom`: ходы + инкремент, таймаут; `calculate_pvp_elo_delta`; claim места чёрных; HTTP `create` (+422/404); фоновый таймаут; чистка комнат; WS: `1008` без токена, flow `game_state → ping/pong → move_made → resign/game_over` |
| `test_tournaments/` | RBAC создания, валидация параметров, создание тренером и выбор стороны игроком |
| `test_games/` | экономика матчей (`elo_delta`, XP/монеты, resign без наград), роуты старта/ходов/сдачи |
| `test_puzzles/` | тиры наград, `calculate_level`, anti-farm (`already_solved`, `IntegrityError`) |
| `test_leaderboard/` | категории, `my_rank`, маскирование email |
| `test_integrations/` | сервисы Lichess и Chess.com: валидация ника, обработка HTTP-ошибок и парсинг рейтингов |

## База знаний (валидатор контента)

```bash
.venv/bin/python scripts/validate_knowledge_base.py
```

Проверяет `content/manifest.json` (9 статей `ready`): существование файла,
YAML front matter (`topicId`, `moduleId`, `title`, `level`, `puzzleThemes`),
совпадение `topicId` с манифестом, обязательные секции статьи.

## Frontend

Type-check + production-сборка:

```bash
cd frontend
npm run build   # tsc -b && vite build
```

После сборки рекомендуется вручную проверить маршруты `#home`, `#auth`,
`#learn`, `#puzzles`, `#play`, `#pvp`, `#tournaments`, `#community`, `#profile`
на desktop/планшете/телефоне.

## Что добавить при развитии

- Тест гонки двух параллельных `solve` на реальной БД (сейчас — моки).
- Контрактные тесты frontend ↔ backend через Vite proxy и `VITE_API_URL`
  (см. `docs/DEPLOYMENT.md`).
- Нагрузочный тест `GET /api/puzzles/random` и `POST /api/bot/move`
  (инференс Maia — самое тяжёлое место).
