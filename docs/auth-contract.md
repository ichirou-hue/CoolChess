# Авторизация CoolChess: реальный контракт

Сейчас backend использует JWT Bearer-токен. Cookie-сессия из старой версии документа больше не используется.

## Endpoint’ы

| Метод  | Адрес                  | Что делает                       |
| ------ | ---------------------- | -------------------------------- |
| `POST` | `/api/auth/register`   | создаёт неподтверждённый аккаунт и отправляет код |
| `POST` | `/api/auth/verify-email` | подтверждает email шестизначным кодом |
| `POST` | `/api/auth/resend-verification` | повторно отправляет код |
| `POST` | `/api/auth/jwt/login`  | выдаёт JWT-токен                 |
| `POST` | `/api/auth/jwt/logout` | завершает JWT-сессию             |
| `POST` | `/api/auth/forgot-password` | отправляет ссылку для смены пароля |
| `POST` | `/api/auth/reset-password` | сохраняет пароль по одноразовой ссылке |
| `GET`  | `/api/users/me`        | возвращает текущего пользователя |
| `GET`  | `/api/me/profile`      | возвращает профиль игрока и Elo  |

## Регистрация

Frontend отправляет JSON:

```json
{
  "email": "student@example.com",
  "password": "secret-password",
  "display_name": "Имя или никнейм"
}
```

Имя/никнейм длиной 2–32 символа обязательно; пробелы нормализуются. Роль и
рейтинг назначаются сервером. Публичная таблица лидеров показывает
`display_name`, а не адрес почты.

Сразу после регистрации пользователь получает шестизначный код по email.
Код действует 10 минут, хранится в базе только как HMAC-хеш и допускает до
пяти попыток ввода. Повторная отправка ограничена 60 секундами. JWT нельзя
получить до подтверждения адреса. Отправка писем включается через SMTP-переменные
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`,
`SMTP_STARTTLS` и `SMTP_USE_SSL` в `.env`.
Смена адреса через `PATCH /api/users/me` отклоняется, пока не будет добавлен
отдельный поток подтверждения нового email.

## Вход

Login принимает не JSON, а form-data:

```text
username=student@example.com
password=secret-password
```

Успешный ответ:

```json
{
  "access_token": "jwt-token",
  "token_type": "bearer"
}
```

После входа frontend сохраняет токен на время текущей вкладки и отправляет его в каждом защищённом запросе:

```http
Authorization: Bearer jwt-token
```

## Проверка пользователя

```http
GET /api/users/me
Authorization: Bearer jwt-token
```

Сейчас ответ содержит минимум:

```json
{
  "id": "uuid",
  "email": "student@example.com",
  "display_name": "Имя или никнейм",
  "role": "student",
  "elo_rating": 1200
}
```

Профиль также включает публичное имя. В PvP доступны пятисимвольные коды
комнат (`POST /api/pvp/create`). Для рейтингов внешних шахматных сайтов
используйте привязку аккаунта по нику; вводить пароли от сторонних сервисов
CoolChess не просит.

## Где это подключено на frontend

- `frontend/src/features/auth/api/authApi.ts` — запросы к backend;
- `frontend/src/features/auth/model/AuthProvider.tsx` — текущий пользователь и состояние входа;
- `frontend/src/features/auth/ui/AuthPage.tsx` — форма входа, регистрации и кода подтверждения;
- `frontend/.env.example` — адрес backend.

## Запуск вместе

Backend запускается на `http://localhost:8080`, frontend — на `http://localhost:5173`.

В backend CORS должен разрешать оба frontend-адреса:

```text
http://localhost:5173
http://127.0.0.1:5173
```

Для браузера нельзя использовать `allow_origins=["*"]` вместе с `allow_credentials=True`. Нужно указать конкретные адреса.
