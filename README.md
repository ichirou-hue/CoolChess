# CoolChess

Учебная шахматная платформа для онлайн-школы.

## Где что находится

| Папка | Что в ней лежит |
| --- | --- |
| [`frontend/`](frontend/) | Всё клиентское приложение: React, Vite, TypeScript, стили, страницы и локальные frontend-данные |
| [`backend/`](backend/) | Будущая серверная часть. Пока это только описание места для backend-кода |
| [`content/`](content/) | Статьи и база знаний курса |
| [`docs/`](docs/) | Документация, архитектура и API-контракты |
| [`scripts/`](scripts/) | Скрипты импорта задач и проверки статей |
| [`data/`](data/) | Исходные большие файлы, которые не нужны браузеру напрямую |

## Как запустить frontend

```powershell
cd frontend
npx pnpm@11.19.0 install
npx pnpm@11.19.0 dev
```

После запуска открыть адрес, который покажет Vite, обычно `http://localhost:5173`.

Сборка проверяется так:

```powershell
cd frontend
npx pnpm@11.19.0 build
```

Frontend сейчас работает без backend: часть данных временно хранится в браузере. Контракт будущего сервера находится в [`docs/auth-contract.md`](docs/auth-contract.md).

Инструкция для backend-разработчика с командами запуска находится в [`backend/README.md`](backend/README.md).
