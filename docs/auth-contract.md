# Авторизация CoolChess: реальный контракт

Сейчас backend использует JWT Bearer-токен. Cookie-сессия из старой версии документа больше не используется.

## Endpoint’ы

| Метод  | Адрес                  | Что делает                       |
| ------ | ---------------------- | -------------------------------- |
| `POST` | `/api/auth/register`   | создаёт ученика                  |
| `POST` | `/api/auth/jwt/login`  | выдаёт JWT-токен                 |
| `POST` | `/api/auth/jwt/logout` | завершает JWT-сессию             |
| `GET`  | `/api/users/me`        | возвращает текущего пользователя |
| `GET`  | `/api/me/profile`      | возвращает профиль игрока и Elo  |

## Регистрация

Frontend отправляет JSON:

```json
{
  "email": "student@example.com",
  "password": "secret-password",
  "role": "student",
  "elo_rating": 1200
}
```

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
  "role": "student",
  "elo_rating": 1200
}
```

Позже в `UserRead` нужно добавить `xp`, `level`, `coins` и статистику игр, чтобы frontend мог показывать настоящий профиль.

## Где это подключено на frontend

- `frontend/src/features/auth/api/authApi.ts` — запросы к backend;
- `frontend/src/features/auth/model/AuthProvider.tsx` — текущий пользователь и состояние входа;
- `frontend/src/features/auth/ui/AuthPage.tsx` — форма входа и регистрации;
- `frontend/.env.example` — адрес backend.

## Запуск вместе

Backend запускается на `http://localhost:8080`, frontend — на `http://localhost:5173`.

В backend CORS должен разрешать оба frontend-адреса:

```text
http://localhost:5173
http://127.0.0.1:5173
```

Для браузера нельзя использовать `allow_origins=["*"]` вместе с `allow_credentials=True`. Нужно указать конкретные адреса.
