# API CoolChess

Базовый URL локально: `http://127.0.0.1:8080`. Интерактивная документация:
`/docs` (Swagger), `/redoc`. Healthcheck: `GET /health` → `{"status": "ok"}`.

Авторизация защищённых ручек: заголовок `Authorization: Bearer <jwt>`.
Токен выдаёт `POST /api/auth/jwt/login` (см. раздел Auth).

## Auth (`fastapi-users`)

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `POST` | `/api/auth/register` | нет | создаёт неподтверждённый аккаунт и отправляет email-код (`email`, `password`, `display_name`) |
| `POST` | `/api/auth/verify-email` | нет | подтверждает регистрацию (`email`, шестизначный `code`) |
| `POST` | `/api/auth/resend-verification` | нет | повторно отправляет код для ожидающего подтверждения email (ограничение 60 секунд) |
| `POST` | `/api/auth/jwt/login` | нет | вход, **только form-data**: `username`, `password` → `{access_token, token_type}` |
| `POST` | `/api/auth/jwt/logout` | да | завершение JWT-сессии |
| `GET` | `/api/users/me` | да | текущий пользователь |
| `PATCH` | `/api/users/me` | да | обновление профиля (email нельзя заменить без отдельного подтверждения) |
| `POST` | `/api/auth/forgot-password` | нет | отправляет ссылку смены пароля на email аккаунта |
| `POST` | `/api/auth/reset-password` | нет | установка нового пароля по токену |

До подтверждения email вход запрещён. SMTP настраивается переменными из
`.env.example`; код действует 10 минут и допускает не более пяти попыток.
Ссылка сброса пароля отправляется на email и ведёт на сайт (`FRONTEND_URL`).
Email нормализуется (lowercase, `+`-алиасы, точки Gmail) и проверяется против
списка одноразовых доменов. `display_name` — имя/никнейм 2–32 символа.
Подробнее — `docs/auth-contract.md`.

## Профиль, тренер, шахматные профили, админ

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `GET` | `/api/me/profile` | да | профиль игрока: `display_name`, `elo_rating`, `xp`, `level`, `coins`, рейтинги привязанных профилей Lichess и Chess.com |

Код подтверждения заново генерируется при каждом запросе, ограничен пятью
проверками и стирается после успешной привязки или истечения срока действия.
Для Lichess его нужно временно поместить в Bio; для Chess.com — в публичное
поле Location (или Bio, если оно доступно через PubAPI). Пароли платформ
CoolChess не запрашивает.
| `GET` | `/api/coach/dashboard` | роль `coach` | заглушка тренерской панели |
| `POST` | `/api/users/platform-verification-code` | да | `{"platform":"lichess"\|"chesscom","username":"..."}` → одноразовый код `coolchess-verify-<hex>`, привязанный к нику и действующий 15 минут |
| `POST` | `/api/users/verify-platform-account` | да | тот же объект платформы и ника → проверяет код в Bio Lichess или Location/Bio Chess.com, одноразово привязывает профиль и сохраняет рейтинги |
| `GET` | `/api/users/lichess-verification-code` | да | legacy-совместимость: выдать новый 15-минутный код для Bio Lichess |
| `POST` | `/api/users/sync-lichess` | да | legacy-совместимость; синхронизация теперь также требует действующий код из Bio |
| `POST` | `/api/users/sync-chesscom` | да | legacy-совместимость; синхронизация теперь требует действующий код из публичного профиля Chess.com |
| `PATCH` | `/api/admin/users/{user_id}/role` | superuser | смена роли (`student`/`coach`/`admin`) |

## Бот (`/api/bot`)

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `POST` | `/api/bot/move` | нет | ход Maia: `{"fen": "...", "difficulty": 1500}` → `{move_uci, move_san, new_fen, is_check, is_game_over}` |

`difficulty` — тир 1–5 или Elo; вне диапазона 1–3000 → `422`.
Без весов `maia3-5m.pt` возвращается первый легальный ход (fallback, поле `fallback: true` в ответе).

## Задачи (`/api/puzzles`)

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `GET` | `/api/puzzles/random` | да | случайная задача; фильтры: `difficulty` (`beginner`/`intermediate`/`advanced`/`master`/`grandmaster`), `min_rating`, `max_rating`, `theme` |
| `GET` | `/api/puzzles/batch?limit=10` | да | случайный набор задач для категории; `limit` от 1 до 10, поддерживает те же фильтры и статусы решения |
| `POST` | `/api/puzzles/{puzzle_id}/solve` | да | `{"user_moves": "e2e4"}` → `{is_correct, already_solved, xp_earned, coins_earned, elo_change, new_level}` |

Ответ `random`: `{id, fen, initial_move, rating, popularity, themes, game_url}` —
`initial_move` уже сыгран соперником, ученик отвечает первым ходом решения.
Вкладка задач загружает набор из десяти позиций и перебирает его по одной.
Соответствие тем уроков и тегов Lichess — `docs/puzzle-topic-map.md`.
Экономика — `docs/ECONOMY.md`.

## Партии (`/api/games`)

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `GET` | `/api/games/active` | да | текущая незавершённая партия или `null` |
| `POST` | `/api/games/start` | да | `{"player_color": "white", "difficulty": 1300}` (тир 1–5 или Elo 1–2500); висящие активные партии закрываются как сданные — с Elo-штрафом, без XP |
| `POST` | `/api/games/{game_id}/move` | да | `{"move_uci": "e2e4"}` → обновлённая позиция + ответный ход бота |
| `POST` | `/api/games/{game_id}/resign` | да | сдача: Elo как за поражение, без XP/монет |
| `GET` | `/api/games/my` | да | история партий (`id`, `status`, `moves_count`, `created_at`) |

Ответ партии (`GameResponse`): `status` (`in_progress`/`player_won`/`bot_won`/
`draw`/`resigned`), `current_fen`, `moves_uci`, `is_check`, `is_game_over`,
`winner`, `last_bot_move`, `xp_earned`, `coins_earned`, `elo_delta`.

## Лидерборд

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `GET` | `/api/leaderboard?category=elo\|level\|puzzles&limit=20` | опционально | топ (`rank`, `display_name`, маскированный `email`, `elo_rating`, `level`, `xp`, `puzzles_solved`) + `my_rank` для вошедшего |

Email в топе маскируются (`m***@domain`). `limit`: 1–100, по умолчанию 20.

## PvP (`/api/pvp` + `/ws/pvp/{game_id}?token=<jwt>`)

Создание комнаты — HTTP (нужен JWT в header):

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `POST` | `/api/pvp/create` | да | `{"time_control": 60–1800, "increment": 0–30}` → `{game_id, room_code, color: "white", ws_url, ...}`; `room_code` — автоматически созданный пятисимвольный код; создатель — белые, место чёрных открыто |
| `POST` | `/api/pvp/rooms` | да | `{"opponent_id": "<uuid>", ...}` → прямое приглашение, оба места заняты; матч и часы ждут подключения обоих игроков; себя → `400`, чужак → `404` |
| `GET` | `/api/pvp/rooms/{game_id}` | нет | снапшот комнаты без авторизации (для лобби); нет комнаты → `404` |
| `GET` | `/api/pvp/{game_id}` | да | снапшот комнаты (тот же `room.to_dict()`, что и `game_state`); нет комнаты → `404` |

Место чёрных занимает первый подключившийся по WS чужак (claim), остальные —
зрители. Без/битый токен — закрытие `1008`; несуществующая комната — закрытие `1008`.

Входящие (`action`):

| `action` | Поле | Что делает |
|---|---|---|
| `ping` | — | `{"type": "pong"}` |
| `move` | `move` (UCI, напр. `e2e4`) | валидация очерёдности + `python-chess`; успех → broadcast `move_made` |
| `resign` | — | завершение (`1-0`/`0-1`, `resignation`) → broadcast `game_over` |
| `draw_offer` | — | рассылка `draw_offered` оппоненту |
| `draw_accept` | — | если было предложение соперника → `1/2-1/2`, `draw_agreement` |

Исходящие (`type`): `game_state` (снапшот при подключении), `move_made`,
`game_over` (`result`, `reason`, `data`), `draw_offered`, `player_status`
(`user_id`, `connected`), `pong`, `error`. Снапшот `room.to_dict()`: `fen`,
`turn`, `is_check`, `white_time`/`black_time` (сек, округление 0.1),
`game_over`, `result` (`1-0`/`0-1`/`1/2-1/2`), `reason` (`checkmate`/`stalemate`/
`timeout`/`resignation`/`draw_agreement`/…), `waiting_opponent`, игроки
(`user_id`, `display_name`, `email`, `elo`, `connected`). Зрители получают состояние, но ходить,
сдаваться и предлагать/принимать ничью не могут (иначе `error`).
Часы: база 180с + инкремент 2с, старт после первого хода; фоновый таймер
(1с, `lifespan` в `server.py`) списывает время зависшим партиям и рассылает
`game_over` по таймауту. Итог партии засчитывается в Elo фоном
(`settle_ratings`, симметричный FIDE K=32, пол 100, `games_played` +1 обоим).
Комнаты in-memory: завершённые чистятся через 15 мин, брошенные без игроков —
через 30 мин; рестарт backend их сбрасывает (поэтому 1 воркер uvicorn).

## Турниры (`/api/tournaments`)

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `GET` | `/api/tournaments` | опционально | список турниров с настройками, участниками и признаком своей регистрации |
| `POST` | `/api/tournaments` | `coach` / `admin` / superuser | создать турнир: `name`, `description?`, `format`, `time_control`, `increment`, `max_players` |
| `GET` | `/api/tournaments/players` | `coach` / `admin` / superuser | список активных игроков для панели управления |
| `POST` | `/api/tournaments/{id}/participants` | да | записать себя; менеджер также может передать `user_id`, чтобы добавить игрока |
| `PATCH` | `/api/tournaments/{id}/me/side` | да | задать свою предпочитаемую сторону: `white`, `black`, `random` или `null` |
| `PATCH` | `/api/tournaments/{id}/participants/{user_id}` | `coach` / `admin` / superuser | назначить `group_name` и/или предпочтительную сторону участника |
| `DELETE` | `/api/tournaments/{id}/participants/{user_id}` | игрок или менеджер | выйти из турнира или удалить участника |

Форматы: `round_robin`, `swiss`, `single_elimination`. Контроль времени:
30–7200 секунд, инкремент: 0–60 секунд, лимит: 2–128 участников. Регистрация
доступна пока статус турнира `registration`. Реализация хранит расписание
параметров и состав; автоматический подбор пар и запуск партий пока не сделаны.

## Коды ошибок

- `400` — невалидный FEN / ход, код привязки не найден в Bio, одноразовый email,
- `401` — нет/просрочен JWT (REST) или закрытие WS `1008` без токена.
- `403` — чуждая роль (`coach`-панель, admin-ручка).
- `404` — партия/пользователь/аккаунт Lichess или Chess.com/комната/
  турнир/участник не найдены.
- `409` — повторная или закрытая запись в турнир, достигнут лимит участников,
  ограничение внешнего API.
- `429` — лимит Lichess или Chess.com API (подождать и повторить).
- `502/503` — внешний рейтинг недоступен или вернул ошибку.
