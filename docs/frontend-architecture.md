# CoolChess frontend architecture

Цель: оставить `frontend/src/main.tsx` только точкой входа, а бизнес-логику разделить по страницам и feature-модулям. Мы не раскладываем каждую строку в отдельный файл: отдельный файл появляется у самостоятельного компонента, hook, API-модуля, модели или утилиты.

## Целевая структура

```text
frontend/src/
  app/
    App.tsx                 # корневой layout и подключение роутера
    routes.tsx              # маршруты приложения
    providers/
      AppProviders.tsx      # query client, auth provider, theme

  pages/
    home/
      HomePage.tsx
    auth/
      AuthPage.tsx
    learn/
      LearnPage.tsx
    play/
      PlayPage.tsx
    puzzles/
      PuzzlesPage.tsx
    community/
      CommunityPage.tsx
    profile/
      ProfilePage.tsx

  features/
    auth/
      api/authApi.ts
      model/authTypes.ts
      model/useAuth.ts
      ui/LoginForm.tsx
      ui/RegisterForm.tsx
    theory/
      model/useTheoryProgress.ts
      ui/TheoryBoard.tsx
      ui/TheoryArticle.tsx
    puzzles/
      api/puzzleApi.ts
      model/puzzleTypes.ts
      model/usePuzzleSession.ts
      ui/PuzzleBoard.tsx
      ui/PuzzleMeta.tsx
    chess-game/
      model/useChessGame.ts
      ui/GameBoard.tsx
      ui/MoveList.tsx
    wallet/
      model/walletTypes.ts
      model/useWallet.ts
      ui/WalletBadge.tsx
    streak/
      model/streakTypes.ts
      model/useStreak.ts
      ui/StreakCard.tsx
    community/
      ui/Leaderboard.tsx
      ui/OnlineStudents.tsx

  entities/
    user/model/userTypes.ts
    lesson/model/lessonTypes.ts
    puzzle/model/puzzleTypes.ts

  shared/
    api/httpClient.ts
    config/env.ts
    lib/date.ts
    lib/storage.ts
    ui/Button.tsx
    ui/Input.tsx
    ui/Logo.tsx
    ui/PageShell.tsx

  data/
    course.ts
    lessonContent.ts
    lessonVisuals.ts

  main.tsx
  styles.css
```

## Границы ответственности

### `pages`

Собирают экран из feature-компонентов. В page не должно быть расчёта серии, запросов к API или низкоуровневой логики шахмат.

### `features`

Содержат пользовательский сценарий: авторизация, решение задачи, изучение темы, игра, кошелёк. Здесь находятся API-вызовы конкретной области, hooks и UI этой области.

### `entities`

Общие типы и представления доменных сущностей: `User`, `Puzzle`, `Lesson`. Entity не знает о конкретной странице.

### `shared`

Переиспользуемые компоненты и инфраструктура без бизнес-логики: HTTP-клиент, кнопки, поля, layout, даты и storage.

## Правила для команды

1. Новый экран создаём в `pages`, а не добавляем в `main.tsx`.
2. Новый пользовательский сценарий создаём в `features`.
3. API не вызываем прямо из JSX: запрос находится в `features/*/api`.
4. `localStorage` используем только через `shared/lib/storage.ts`.
5. Типы ответа backend описываем рядом с API и не дублируем строками в компонентах.
6. Компонент не должен одновременно рисовать UI, хранить бизнес-правила и отправлять HTTP-запросы.
7. Не создаём файл для каждой мелкой строки или одноразового `div` — файл должен иметь самостоятельную ответственность.
8. Все новые маршруты добавляются только в `frontend/src/app/routes.tsx`.

## Состояние приложения

- Серверные данные: позже подключить TanStack Query.
- Auth session: backend HttpOnly cookie + `GET /api/auth/me`.
- Локальные UI-состояния: React hooks.
- Прогресс, пешки и серия: временно adapter в `features/wallet` и `features/streak`; после появления backend заменить adapter на API без изменения страниц.

## План миграции без остановки разработки

1. Вынести `AppV2`, hash-router и layout в `frontend/src/app`.
2. Вынести `AuthPage` и формы в `frontend/src/features/auth`.
3. Вынести `TheoryBoard`, `LessonPracticeBoard` и данные теории в `frontend/src/features/theory` и `frontend/src/features/puzzles`.
4. Вынести `ChessGame` и `BoardShell` в `frontend/src/features/chess-game`.
5. Вынести профиль, кошелёк, серию и лидерборд.
6. Удалить старые неиспользуемые компоненты из `frontend/src/main.tsx`.
7. После каждого шага запускать `pnpm build` и проверять маршруты `#home`, `#auth`, `#learn`, `#puzzles`, `#play`, `#community`, `#profile`.

## Договор с backend

Frontend ожидает отдельный API-клиент и не должен знать реализацию базы данных. Для Auth используется контракт из [auth-contract.md](./auth-contract.md). В будущем по такому же принципу добавляются `puzzleApi`, `progressApi`, `walletApi` и `communityApi`.
