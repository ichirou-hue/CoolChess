export type CourseTopic = {
  id: string;
  title: string;
  puzzleThemes: string[];
};

export type CourseModule = {
  id: string;
  title: string;
  description: string;
  topics: CourseTopic[];
};

const topic = (id: string, title: string, puzzleThemes: string[] = []) => ({ id, title, puzzleThemes });

export const courseModules: CourseModule[] = [
  {
    id: 'chess-basics', title: 'Шахматная азбука', description: 'Познакомимся с доской, фигурами и правилами игры.', topics: [
      topic('basics-history', 'История игры. Шахматная доска, поля и координаты', ['oneMove']),
      topic('basics-pieces', 'Фигуры и их начальная расстановка', ['oneMove']),
      topic('basics-moves', 'Как ходят фигуры', ['oneMove']),
      topic('basics-capture', 'Взятие, нападение и защита', ['hangingPiece', 'trappedPiece']),
      topic('basics-checkmate', 'Шах и мат', ['mate', 'mateIn1']),
      topic('basics-draw', 'Ничья. Разновидности ничьей', ['equality']),
      topic('basics-value', 'Ценность фигур. Размен', ['advantage']),
      topic('basics-notation', 'Нотация', ['opening']),
      topic('basics-special', 'Специальные правила. Рокировка. Взятие на проходе', ['castling']),
    ],
  },
  {
    id: 'checkmate', title: 'Мат — как цель игры', description: 'Научимся видеть и создавать простейшие матовые конструкции.', topics: [
      topic('mate-linear', 'Линейный мат', ['backRankMate', 'mate']), topic('mate-queen', 'Мат ферзем', ['mate', 'queenEndgame']), topic('mate-rook', 'Мат ладьёй', ['mate', 'rookEndgame']), topic('mate-patterns', 'Простейшие матовые конструкции', ['mate']), topic('mate-defense', 'Способы защиты от шаха', ['defensiveMove', 'exposedKing']),
    ],
  },
  {
    id: 'tactics', title: 'Тактические приёмы', description: 'Разберём идеи, которые выигрывают материал и партию за несколько ходов.', topics: [
      topic('tactics-hanging', 'Что такое незащищённая фигура? Тактическая слабость', ['hangingPiece']), topic('tactics-double', 'Двойной удар', ['fork', 'doubleCheck']), topic('tactics-fork', 'Вилка', ['fork']), topic('tactics-pin', 'Связка. Защита от связки', ['pin', 'skewer']), topic('tactics-defender', 'Уничтожение защитника', ['capturingDefender', 'deflection']), topic('tactics-discovered', 'Открытое нападение', ['discoveredAttack']), topic('tactics-check', 'Вскрытый шах', ['discoveredCheck', 'doubleCheck']), topic('tactics-combination', 'Что такое комбинация', ['sacrifice', 'intermezzo', 'clearance']),
    ],
  },
  {
    id: 'endgame', title: 'Эндшпиль', description: 'Учимся превращать небольшое преимущество в победу.', topics: [
      topic('endgame-features', 'Особенности игры в эндшпиле', ['endgame']), topic('endgame-square', 'Правило квадрата', ['pawnEndgame']), topic('endgame-passed', 'Проходная пешка', ['advancedPawn', 'promotion']), topic('endgame-doubled', 'Почему сдвоенные пешки — это плохо?', ['pawnEndgame']), topic('endgame-opposition', 'Оппозиция', ['pawnEndgame', 'zugzwang']), topic('endgame-king', 'Активность короля', ['endgame', 'defensiveMove']),
    ],
  },
  {
    id: 'opening', title: 'Дебют', description: 'Первые ходы с понятным планом, а не заучиванием вариантов.', topics: [
      topic('opening-principles', 'Три главных дебютных принципа', ['opening', 'advantage']), topic('opening-development', 'Сила быстрого развития фигур. Понятие темпа', ['opening', 'advantage']), topic('opening-king', 'Безопасность короля', ['castling', 'exposedKing']), topic('opening-center', 'Какой бывает центр. Зачем нужен центр', ['opening', 'advantage']), topic('opening-mistakes', 'Критические ошибки в дебюте', ['opening', 'hangingPiece']),
    ],
  },
  {
    id: 'middlegame', title: 'Миттельшпиль: стратегия в шахматах', description: 'Переходим от отдельных тактик к планированию позиции.', topics: [
      topic('middle-material', 'Материальное преимущество. Принципы его использования', ['advantage', 'crushing']), topic('middle-positional', 'Позиционное преимущество. Разновидности и особенности использования', ['advantage', 'equality', 'quietMove']), topic('middle-pawns', 'Расположение пешек. Островки и слабости', ['endgame', 'zugzwang']), topic('middle-lines', 'Открытые линии', ['discoveredAttack', 'clearance']), topic('middle-pieces', 'Хорошие и плохие фигуры', ['quietMove', 'defensiveMove']), topic('middle-mistakes', 'Типовые ошибки в миттельшпиле', ['hangingPiece', 'advantage']),
    ],
  },
];

