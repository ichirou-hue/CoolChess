# Тестирование CoolChess

## Backend (pytest)

```powershell
.\venv\Scripts\python.exe -m pytest -q
```

- Сейчас: **93 теста, 0 failed** (~2 сек).
- Конфигурация — `pyproject.toml`: `pythonpath = ["backend"]`
  (импорты `server`, `database`, `auth`, ... работают из корня),
  `testpaths = ["tests"]`.
- `pytest-asyncio` — для асинхронных ручек и фикстур; `httpx.ASGITransport` —
  вызовы API без поднятого сервера.

### Фикстуры (`tests/conftest.py`)

| Фикстура | Что даёт |
|---|---|
| `mock_user` | `User` с `elo 1200`, `xp/coins 0`, роль `student` |
| `mock_db_session` | `AsyncMock` сессии (`add/execute/commit/refresh/rollback`) |
| `authorized_client` | `AsyncClient` + подмена `current_active_user` и `get_async_session` |
| `anonymous_client` | `AsyncClient` без авторизации (проверка 401) |

### Покрытие по папкам

| Папка | Что проверяется |
|---|---|
| `test_auth/` | роуты, схемы (`UserCreate` — disposable-домены, нормализация email), модель `User` |
| `test_bot/` | валидация FEN (400), инференс/ fallback `predict_move` |
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
- Контрактные тесты frontend ↔ backend по `VITE_API_URL` (порты 8080/8081,
  см. `docs/DEPLOYMENT.md`).
- Нагрузочный тест `GET /api/puzzles/random` и `POST /api/bot/move`
  (инференс Maia — самое тяжёлое место).
