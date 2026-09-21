# Frontend CoolChess

В этой папке находится всё, что запускается в браузере:

- `src/` — React-компоненты, страницы, логика и стили;
- `public/` — логотип и локальные данные задач;
- `index.html` — HTML-точка входа;
- `package.json` — зависимости и команды;
- `vite.config.ts` — настройки Vite;
- `tsconfig*.json` — настройки TypeScript.

Запускать команды нужно из этой папки:

```powershell
cd frontend
npx pnpm@11.19.0 install
npx pnpm@11.19.0 dev
```

Проверка production-сборки:

```powershell
npx pnpm@11.19.0 build
```
