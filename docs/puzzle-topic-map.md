# Сопоставление тем курса CoolChess с темами Lichess

Этот mapping используется при импорте задач из официальной базы Lichess. Одна задача может попасть в несколько тем.

| Тема курса | Темы Lichess для отбора |
| --- | --- |
| Шах и мат | `mate`, `mateIn1`, `mateIn2`, `mateIn3`, `mateIn4`, `mateIn5` |
| Незащищённая фигура | `hangingPiece`, `trappedPiece`, `exposedKing` |
| Двойной удар | `fork`, `doubleCheck` |
| Вилка | `fork` |
| Связка | `pin`, `skewer` |
| Уничтожение защитника | `capturingDefender`, `deflection`, `interference` |
| Открытое нападение | `discoveredAttack`, `discoveredCheck` |
| Вскрытый шах | `discoveredCheck`, `doubleCheck` |
| Комбинация | `sacrifice`, `intermezzo`, `clearance`, `quietMove` |
| Линейный мат | `backRankMate`, `anastasiaMate`, `corridorMate` |
| Мат ферзём | `mate`, `queenEndgame` |
| Мат ладьёй | `mate`, `rookEndgame` |
| Проходная пешка | `advancedPawn`, `promotion` |
| Оппозиция | `pawnEndgame`, `zugzwang`, `defensiveMove` |
| Активность короля | `advancedPawn`, `defensiveMove`, `endgame` |
| Дебютные принципы | `opening`, `castling`, `advantage` |
| Безопасность короля | `castling`, `exposedKing`, `kingsideAttack`, `queensideAttack` |
| Центр | `opening`, `advantage` |
| Материальное преимущество | `advantage`, `crushing`, `equality` |
| Позиционное преимущество | `advantage`, `equality`, `quietMove`, `zugzwang`, `defensiveMove` |

Названия тем проверяются по официальному списку тегов Lichess при генерации индекса. Mapping служит учебной классификацией курса, а не заменяет исходные теги базы.
