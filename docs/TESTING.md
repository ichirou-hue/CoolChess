# Тестирование CoolChess

## Backend (pytest)

```powershell
.\venv\Scripts\python.exe -m pytest -q
```

- Сейчас: **124 теста, 0 failed** (~1 сек).
- Конфигурация — `pyproject.toml`: `pythonpath = ["backend"]`
  (импорты `server`, `database`, `auth`, ... работают из корня),
  `testpaths = ["tests"]`.
- `pytest-asyncio` — для асинхронных ручек и фикстур; `httpx.ASGITransport` —
  вызовы API без поднятого сервера; `starlette.testclient.TestClient` —
  синхронные WebSocket-тесты PvP.
- На Python 3.14 `AsyncMock` без настроенного `return_value` возвращает
  корутину из дочерних вызовов: моки БД надо wire'ить явно
  (`execute.return_value = MagicMock(scalar_one_or_none=...)`), как в
  `test_auth_routes.py` и `test_clan_routes.py`.

### Фикстуры (`tests/conftest.py`)

| Фикстура | Что даёт |
|---|---|
| `mock_user` | `User` с `elo 1200`, `xp/coins 0`, роль `student` |
| `mock_db_session` | `AsyncMock` сессии (`execute/commit/refresh/rollback` — awaitable, `add` — sync `MagicMock`, `delete` — awaitable `AsyncMock` для выхода из клана) |
| `authorized_client` | `AsyncClient` + подмена `current_active_user` и `get_async_session` |
| `anonymous_client` | `AsyncClient` без авторизации (проверка 401; WS-тесты строят свой `TestClient(app)`) |

### Покрытие по папкам

| Папка | Что проверяется |
|---|---|
| `test_auth/` | роуты, схемы (`UserCreate` — disposable-домены, нормализация email), модель `User` |
| `test_bot/` | валидация FEN (400), difficulty (422 вне 1–3000), инференс/fallback `predict_move` |
| `test_clans/` (18) | `list` (пусто/с данными, `members_count`/`total_elo`), `create` (успех/401/уже-в-клане/дубль), `join` (успех/уже-в-клане/404), `leave` (не-в-клане/лидер-запрет/успех), `detail` (успех/404), `disband` (403/успех), `transfer` (успех/404) |
| `test_games/` | + старт с висящей партией: старая закрывается как сданная с Elo-штрафом без XP |
| `test_pvp/` (11) | `ChessGameRoom`: ходы + инкремент, таймаут; `calculate_pvp_elo_delta`; claim места чёрных; HTTP `create` (+422/404); фоновый таймаут; чистка комнат; WS: `1008` без токена, flow `game_state → ping/pong → move_made → resign/game_over` |
| `test_games/` | экономика матчей (`elo_delta`, XP/монеты, resign без наград), роуты старта/ходов/сдачи |
| `test_puzzles/` | тиры наград, `calculate_level`, anti-farm (`already_solved`, `IntegrityError`) |
| `test_leaderboard/` | категории, `my_rank`, маскирование email |
| `test_integrations/` | `lichess_service`: 404/429/502/503, парсинг `perfs` |

## База знаний (валидатор контента)

```powershell
python scripts/validate_knowledge_base.py
```

Проверяет `content/manifest.json` (9 статей `ready`): существование файла,
YAML front matter (`topicId`, `moduleId`, `title`, `level`, `puzzleThemes`),
совпадение `topicId` с манифестом, обязательные секции статьи.

## Frontend

Type-check + production-сборка:

```powershell
cd frontend
npm run build   # tsc -b && vite build
```

После рефакторинга шагов из `docs/frontend-roadmap.md` — прогон маршрутов
`#home`, `#auth`, `#learn`, `#puzzles`, `#play`, `#community`, `#profile`
на desktop/планшете/телефоне (этап 6 roadmap).

## Что добавить при развитии

- Тест гонки двух параллельных `solve` на реальной БД (сейчас — моки).
- Контрактные тесты frontend ↔ backend через Vite proxy и `VITE_API_URL`
  (см. `docs/DEPLOYMENT.md`).
- Нагрузочный тест `GET /api/puzzles/random` и `POST /api/bot/move`
  (инференс Maia — самое тяжёлое место).
