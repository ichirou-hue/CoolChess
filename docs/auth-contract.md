# Авторизация для backend-разработчика

Этот файл объясняет простыми словами, как подключить сервер к готовым экранам входа CoolChess.

## Что уже есть на frontend

- Экран находится в `frontend/src/features/auth/ui/AuthPage.tsx`.
- Вход открывается по адресу `#auth`.
- Регистрация открывается по адресу `#auth/register`.
- Сейчас это демонстрационная форма: она ничего не отправляет на сервер.
- После подключения API внешний вид менять не нужно — мы заменим только действие кнопки.

## Что должен сделать backend

Нужны четыре простых адреса:

| Метод и адрес | Для чего |
| --- | --- |
| `POST /api/auth/register` | создать ученика |
| `POST /api/auth/login` | войти в аккаунт |
| `POST /api/auth/logout` | выйти из аккаунта |
| `GET /api/auth/me` | проверить, кто сейчас вошёл |

Все запросы и ответы — JSON.

## 1. Регистрация

Frontend отправляет:

```json
{
  "displayName": "Егор",
  "email": "egor@example.com",
  "password": "secret-password"
}
```

Если всё хорошо, сервер отвечает кодом `201`:

```json
{
  "user": {
    "id": "uuid",
    "email": "egor@example.com",
    "displayName": "Егор",
    "role": "student"
  }
}
```

После этого сервер создаёт сессию и кладёт её в cookie.

## 2. Вход

Frontend отправляет:

```json
{
  "email": "egor@example.com",
  "password": "secret-password"
}
```

При успехе сервер отвечает кодом `200`, возвращает тот же объект `user` и устанавливает cookie сессии.

## 3. Проверка сессии

При открытии сайта frontend вызывает:

```
GET /api/auth/me
```

Если пользователь вошёл, вернуть:

```json
{
  "user": {
    "id": "uuid",
    "email": "egor@example.com",
    "displayName": "Егор",
    "role": "student"
  }
}
```

Если пользователь не вошёл, вернуть `401`.

## 4. Выход

На выходе frontend вызывает:

```
POST /api/auth/logout
```

Сервер удаляет cookie и отвечает кодом `204`.

## Как frontend будет обращаться к серверу

В frontend появится переменная:

```
VITE_API_URL=http://localhost:8080
```

Тогда запрос входа выглядит так:

```ts
fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
```

Важно: `credentials: 'include'` нужен, чтобы браузер сохранял cookie.

## Что настроить на сервере

Для локальной разработки разрешить frontend:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

В CORS включить отправку cookies: `credentials: true`.

Cookie должна быть:

- `HttpOnly`;
- `SameSite=Lax`;
- `Secure` только на настоящем HTTPS-сайте.

Пароль нужно хранить только как безопасный хэш. Сам пароль и `password_hash` никогда не возвращать frontend.

## Единый формат ошибок

При ошибке возвращать такой JSON:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Неверный email или пароль",
    "fields": {
      "email": "Проверь email или пароль"
    }
  }
}
```

Нужные коды:

- `EMAIL_ALREADY_EXISTS` — email уже занят;
- `INVALID_CREDENTIALS` — неправильный вход;
- `VALIDATION_ERROR` — ошибка конкретного поля;
- `TOO_MANY_REQUESTS` — слишком много попыток.

## Минимальные данные ученика

Сначала достаточно такой модели:

```
id
email
displayName
role = student
avatarUrl (может быть пустым)
createdAt
```

Пешки, серия, решённые задачи и статистику лучше хранить отдельно. В каждой такой записи нужен `userId`, чтобы понимать, какому ученику она принадлежит.

## Как проверить соединение вдвоём

1. Backend-разработчик запускает API, например на порту `8080`.
2. Frontend-разработчик запускает CoolChess на порту `5173`.
3. В frontend указывается `VITE_API_URL=http://localhost:8080`.
4. Проверяется регистрация.
5. Затем обновляется страница и проверяется `GET /api/auth/me`.
6. После этого проверяется выход.

Для теста используйте отдельный аккаунт, не настоящий пароль.

## Что backend-разработчик должен прислать frontend-разработчику

- адрес API;
- список готовых endpoint’ов;
- пример успешного ответа;
- пример ошибки;
- настройки CORS;
- тестовый аккаунт без настоящих личных данных.

Связанные файлы frontend:

- `frontend/src/features/auth/ui/AuthPage.tsx` — экран;
- `frontend/src/app/useHashRoute.ts` — переходы по страницам;
- `docs/frontend-architecture.md` — простая схема проекта.

После готовности API demo-обработчик формы заменяется на `fetch`. Дизайн и маршруты при этом сохраняются.
