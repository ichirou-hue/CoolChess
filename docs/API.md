# API CoolChess

Базовый URL локально: `http://127.0.0.1:8080`. Интерактивная документация:
`/docs` (Swagger), `/redoc`. Healthcheck: `GET /health` → `{"status": "ok"}`.

Авторизация защищённых ручек: заголовок `Authorization: Bearer <jwt>`.
Токен выдаёт `POST /api/auth/jwt/login` (см. раздел Auth).

## Auth (`fastapi-users`)

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `POST` | `/api/auth/register` | нет | регистрация (`email`, `password`; роль всегда `student`) |
| `POST` | `/api/auth/jwt/login` | нет | вход, **только form-data**: `username`, `password` → `{access_token, token_type}` |
| `POST` | `/api/auth/jwt/logout` | да | завершение JWT-сессии |
| `GET` | `/api/users/me` | да | текущий пользователь |
| `PATCH` | `/api/users/me` | да | обновление профиля (без смены роли) |
| `POST` | `/api/auth/request-verify-token` | да | запрос письма подтверждения |
| `POST` | `/api/auth/verify` | нет | подтверждение email по токену |

Email нормализуется (lowercase, `+`-алиасы, точки Gmail) и проверяется против
списка одноразовых доменов. Подробнее — `docs/auth-contract.md`.

## Профиль, тренер, Lichess, админ

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `GET` | `/api/me/profile` | да | профиль игрока: `elo_rating`, `xp`, `level`, `coins`, рейтинги Lichess |
| `GET` | `/api/coach/dashboard` | роль `coach` | заглушка тренерской панели |
| `GET` | `/api/users/lichess-verification-code` | да | выдать/создать код `coolchess-<hex>` для Bio на Lichess |
| `POST` | `/api/users/sync-lichess` | да | `{"lichess_username": "..."}` → проверка кода в Bio, сохранение рейтингов, калибровка Elo новичка |
| `PATCH` | `/api/admin/users/{user_id}/role` | superuser | смена роли (`student`/`coach`/`admin`) |

## Бот (`/api/bot`)

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `POST` | `/api/bot/move` | нет | ход Maia: `{"fen": "...", "difficulty": 1500}` → `{move_uci, move_san, new_fen, is_check, is_game_over}` |

`difficulty` — целевой Elo (1100–1900) или тир 1–5 в партиях. Невалидный FEN → 400.
Без весов `maia3-5m.pt` возвращается первый легальный ход (fallback).

## Задачи (`/api/puzzles`)

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `GET` | `/api/puzzles/random` | да | случайная задача; фильтры: `difficulty` (`beginner`/`intermediate`/`advanced`/`master`/`grandmaster`), `min_rating`, `max_rating`, `theme` |
| `POST` | `/api/puzzles/{puzzle_id}/solve` | да | `{"user_moves": "e2e4"}` → `{is_correct, already_solved, xp_earned, coins_earned, elo_change, new_level}` |

Ответ `random`: `{id, fen, initial_move, rating, popularity, themes, game_url}` —
`initial_move` уже сыгран соперником, ученик отвечает первым ходом решения.
Соответствие тем уроков и тегов Lichess — `docs/puzzle-topic-map.md`.
Экономика — `docs/ECONOMY.md`.

## Партии (`/api/games`)

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `GET` | `/api/games/active` | да | текущая незавершённая партия или `null` |
| `POST` | `/api/games/start` | да | `{"player_color": "white", "difficulty": 1300}` (тир 1–5 или Elo 1–2500) |
| `POST` | `/api/games/{game_id}/move` | да | `{"move_uci": "e2e4"}` → обновлённая позиция + ответный ход бота |
| `POST` | `/api/games/{game_id}/resign` | да | сдача: Elo как за поражение, без XP/монет |
| `GET` | `/api/games/my` | да | история партий (`id`, `status`, `moves_count`, `created_at`) |

Ответ партии (`GameResponse`): `status` (`in_progress`/`player_won`/`bot_won`/
`draw`/`resigned`), `current_fen`, `moves_uci`, `is_check`, `is_game_over`,
`winner`, `last_bot_move`, `xp_earned`, `coins_earned`, `elo_delta`.

## Лидерборд

| Метод | Адрес | Auth | Что делает |
|---|---|---|---|
| `GET` | `/api/leaderboard?category=elo\|level\|puzzles&limit=20` | опционально | топ (`rank`, `elo_rating`, `level`, `xp`, `puzzles_solved`) + `my_rank` для вошедшего |

Email в топе маскируются (`m***@domain`). `limit`: 1–100, по умолчанию 20.

## Коды ошибок

- `400` — невалидный FEN / ход, код привязки не найден в Bio, одноразовый email.
- `401` — нет/просрочен JWT.
- `403` — чуждая роль (`coach`-панель, admin-ручка).
- `404` — партия/пользователь/Lichess-аккаунт не найден.
- `429` — лимит Lichess API (подождать и повторить).
- `502/503` — Lichess недоступен.
