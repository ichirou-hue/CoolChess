# База знаний CoolChess

Каждая тема курса хранится отдельным Markdown-файлом. Имя файла соответствует `topicId` из `frontend/src/data/course.ts`.

Формат статьи:

1. YAML-поля `topicId`, `moduleId`, `title`, `level`, `puzzleThemes`.
2. Цель урока.
3. Простое объяснение.
4. Аналогия.
5. Пример с FEN и ходами.
6. Практика и источники.

Текущая папка содержит первый полностью подготовленный модуль. Остальные модули пока используют совместимый временный слой `frontend/src/data/lessonContent.ts`.

Проверка статей:

```powershell
python scripts/validate_knowledge_base.py
```
