/** FEN positions and move lines for lesson board demonstrations. */
export type LessonVisual = {
  fen: string;
  moves: string[];
  title: string;
  caption: string;
  focus: string;
};

export const lessonVisuals: Record<string, LessonVisual> = {
  'basics-history': { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: ['e2e4'], title: 'Координаты начинаются с адреса', caption: 'Пешка с e2 делает первый ход на e4: вертикаль e, затем номер поля.', focus: 'e2 e4' },
  'basics-pieces': { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: ['d2d4'], title: 'Стартовая позиция', caption: 'Ферзь начинает на поле своего цвета, а пешечный центр открывает дорогу фигурам.', focus: 'd1 d2 d4' },
  'basics-moves': { fen: '4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1', moves: ['e5e6'], title: 'Пешка показывает направление', caption: 'Белая пешка с e5 идёт на e6, а бьёт по диагонали d6 и f6.', focus: 'e5 e6 d6 f6' },
  'basics-capture': { fen: '4k3/8/8/1b6/2N5/8/8/4K3 w - - 0 1', moves: ['c4b6'], title: 'Взятие должно быть оправдано', caption: 'Конь может атаковать поля вокруг, но перед взятием нужно проверить защиту.', focus: 'c4 b6' },
  'basics-checkmate': { fen: '6k1/5ppp/8/8/8/5Q2/6PP/6K1 w - - 0 1', moves: ['f3b7'], title: 'Сначала увидь все выходы', caption: 'Перед матом проверь: король может уйти, закрыться или взять нападающую фигуру?', focus: 'f3 b7' },
  'basics-draw': { fen: '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1', moves: ['f7e7'], title: 'Не перепутай мат с патом', caption: 'Перед ходом проверь, остаются ли у короля легальные поля: отсутствие ходов без шаха — это пат.', focus: 'f7 e7 h8' },
  'basics-value': { fen: '4k3/8/8/3q4/8/3R4/8/4K3 w - - 0 1', moves: ['d3d5'], title: 'Размен — это решение, а не автоматизм', caption: 'Перед разменом сравни материал, активность и безопасность короля.', focus: 'd3 d5' },
  'basics-notation': { fen: 'r1bqk2r/pppp1ppp/2n2n2/8/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 2 4', moves: ['d2d4'], title: 'Ход можно прочитать', caption: 'd4 — ход пешки на d4. Нотация превращает позицию в воспроизводимую историю.', focus: 'd2 d4' },
  'basics-special': { fen: 'r3k2r/ppp2ppp/2n5/8/8/2N5/PPP2PPP/R3K2R w KQkq - 0 1', moves: ['e1g1'], title: 'Рокировка — два действия одним ходом', caption: 'Король уходит в укрытие, а ладья занимает соседнее поле.', focus: 'e1 g1 h1 f1' },
  'opening-principles': { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'], title: 'Дебют строится из трёх идей', caption: 'Центр, развитие фигур и безопасность короля видны прямо в последовательности ходов.', focus: 'e4 e5 f3 c6 c4' },
  'mate-linear': { fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', moves: ['a1a8'], title: 'Линейный мат', caption: 'Ладья занимает восьмую горизонталь и отрезает короля от всей линии.', focus: 'a1 a8 g8' },
  'mate-queen': { fen: '7k/5Q2/5K2/8/8/8/8/8 w - - 0 1', moves: ['f7g7'], title: 'Мат ферзём', caption: 'Ферзь подходит к краю, а король защищает его от взятия.', focus: 'f7 g7 f6 h8' },
  'mate-rook': { fen: '7k/8/5K2/8/8/8/R7/8 w - - 0 1', moves: ['a2a8'], title: 'Мат ладьёй', caption: 'Ладья отсекает короля по горизонтали, а белый король контролирует поля отхода.', focus: 'a2 a8 f6 h8' },
  'mate-patterns': { fen: '6k1/5ppp/8/8/8/8/5RR1/6K1 w - - 0 1', moves: ['g2g7'], title: 'Матовая конструкция', caption: 'Две ладьи могут работать как лестница: одна отсекает, другая приближает мат.', focus: 'g2 g7 g1 g7' },
  'mate-defense': { fen: '6k1/5ppp/8/8/8/8/5Q2/6K1 b - - 0 1', moves: ['g8h8'], title: 'Три ответа на шах', caption: 'На доске проверь по очереди: уход короля, блокировку линии и взятие атакующей фигуры.', focus: 'g8 h8 f7' },
  'tactics-hanging': { fen: '4k3/8/8/3q4/8/3R4/8/4K3 w - - 0 1', moves: ['d3d5'], title: 'Незащищённая фигура', caption: 'Сначала посмотри, что защищает фигуру. Затем ищи прямой удар по ней.', focus: 'd3 d5' },
  'tactics-double': { fen: '4k3/8/8/3n4/2B5/8/8/4K3 w - - 0 1', moves: ['c4d5'], title: 'Двойной удар', caption: 'Один ход может одновременно атаковать две цели — материал и короля или две фигуры.', focus: 'c4 d5 e8' },
  'tactics-fork': { fen: '4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1', moves: ['c3d5'], title: 'Вилка', caption: 'Конь прыгает на поле, с которого атакует сразу несколько важных фигур.', focus: 'c3 d5' },
  'tactics-pin': { fen: '4k3/8/8/3r4/2B5/8/8/4K3 w - - 0 1', moves: ['c4d5'], title: 'Связка', caption: 'Фигура не может свободно уйти, если за ней стоит король или более ценная цель.', focus: 'c4 d5 e8' },
  'tactics-defender': { fen: '4k3/8/8/3q4/2B5/8/8/4K3 w - - 0 1', moves: ['c4d5'], title: 'Уничтожение защитника', caption: 'Убери фигуру, которая держит ключевое поле, и позиция соперника рассыплется.', focus: 'c4 d5' },
  'tactics-discovered': { fen: '4k3/8/8/8/2B5/2N5/8/4K3 w - - 0 1', moves: ['c3b5'], title: 'Открытое нападение', caption: 'Отход одной фигуры открывает линию для другой и создаёт двойную угрозу.', focus: 'c3 b5 c4' },
  'tactics-check': { fen: '6k1/8/4N3/8/2B5/8/8/4K3 w - - 0 1', moves: ['e6f4'], title: 'Вскрытый шах', caption: 'Конь отходит с e6, открывая слону c4 диагональ до короля g8. Если конь тоже даёт шах — это двойной шах.', focus: 'e6 f4 c4 g8' },
  'tactics-combination': { fen: '4k3/8/8/3q4/2B5/8/8/4K3 w - - 0 1', moves: ['c4d5'], title: 'Что такое комбинация', caption: 'Комбинация начинается с идеи: жертва, отвлечение или вскрытие линии меняют оценку позиции.', focus: 'c4 d5' },
  'endgame-features': { fen: '8/8/8/3k4/3P4/8/3K4/8 w - - 0 1', moves: ['d4d5'], title: 'Особенности эндшпиля', caption: 'В эндшпиле король становится активной фигурой, а каждый темп пешки имеет значение.', focus: 'd4 d5 d3' },
  'endgame-square': { fen: '8/8/8/8/3P4/8/4K3/7k w - - 0 1', moves: ['d4d5'], title: 'Правило квадрата', caption: 'Мысленно построй квадрат от пешки до поля превращения: король должен успеть войти в него.', focus: 'd4 d5 h1' },
  'endgame-passed': { fen: '8/3P4/8/8/8/8/4K3/7k w - - 0 1', moves: ['d7d8q'], title: 'Проходная пешка', caption: 'Свободная пешка идёт вперёд без препятствий и превращается в новую фигуру.', focus: 'd7 d8' },
  'endgame-doubled': { fen: '8/8/8/3pp3/3P4/8/4K3/7k w - - 0 1', moves: ['d4d5'], title: 'Слабость сдвоенных пешек', caption: 'Пешки на одной вертикали хуже поддерживают друг друга и часто становятся мишенью.', focus: 'd4 d5 e5' },
  'endgame-opposition': { fen: '8/8/8/3k4/8/4K3/8/8 w - - 0 1', moves: ['e3d3'], title: 'Оппозиция', caption: 'Короли стоят лицом друг к другу через одно поле: ход соперника определяет, кто проходит вперёд.', focus: 'e3 d3 d5' },
  'endgame-king': { fen: '8/8/8/3k4/3p4/8/3K4/8 w - - 0 1', moves: ['d2c3'], title: 'Активность короля', caption: 'В эндшпиле король должен идти к центру и помогать пешкам, а не прятаться в углу.', focus: 'd2 c3' },
  'opening-development': { fen: 'r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2', moves: ['g1f3'], title: 'Темп развития', caption: 'Развитая фигура уже влияет на центр. Каждый повторный ход одной фигурой может стоить темпа.', focus: 'g1 f3' },
  'opening-king': { fen: 'r3k2r/ppp2ppp/2n5/8/8/2N5/PPP2PPP/R3K2R w KQkq - 0 1', moves: ['e1g1'], title: 'Безопасность короля', caption: 'Рокировка прячет короля и одновременно подключает ладью к игре.', focus: 'e1 g1 h1 f1' },
  'opening-center': { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', moves: ['d7d5'], title: 'Центр позиции', caption: 'Центральные пешки определяют пространство и открывают линии для фигур.', focus: 'd7 d5 e4' },
  'opening-mistakes': { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', moves: ['d7d5'], title: 'Ошибки в дебюте', caption: 'Не гоняйся за одной пешкой: развитие, центр и безопасность короля важнее ранней жадности.', focus: 'd7 d5' },
  'middle-material': { fen: '4k3/8/8/3q4/8/3R4/8/4K3 w - - 0 1', moves: ['d3d5'], title: 'Материальное преимущество', caption: 'Лишнюю фигуру нужно превратить в активность, размены и безопасный план.', focus: 'd3 d5' },
  'middle-positional': { fen: '4k3/8/3p4/8/3P4/8/4K3/8 w - - 0 1', moves: ['d4d5'], title: 'Позиционное преимущество', caption: 'Пространство, активность и слабости соперника часто важнее мгновенного выигрыша материала.', focus: 'd4 d5' },
  'middle-pawns': { fen: '4k3/8/8/2p5/3P4/8/8/4K3 w - - 0 1', moves: ['d4d5'], title: 'Пешечная структура', caption: 'Пешки задают карту позиции: островки и слабые поля остаются надолго.', focus: 'd4 d5 c5' },
  'middle-lines': { fen: '4k3/8/8/8/2R5/8/8/4K3 w - - 0 1', moves: ['c4c8'], title: 'Открытые линии', caption: 'Ладья любит открытую линию: по ней она проникает к королю и слабым пешкам.', focus: 'c4 c8 e8' },
  'middle-pieces': { fen: '4k3/8/8/3p4/2B5/8/8/4K3 w - - 0 1', moves: ['c4d5'], title: 'Хорошие и плохие фигуры', caption: 'Хорошая фигура имеет цель и пространство. Плохая упирается в собственные пешки.', focus: 'c4 d5' },
  'middle-mistakes': { fen: '4k3/8/8/3q4/2B5/8/8/4K3 w - - 0 1', moves: ['c4d5'], title: 'Типовые ошибки', caption: 'Перед каждым ходом сделай паузу: шахи, взятия и угрозы соперника должны быть проверены первыми.', focus: 'c4 d5' },
};
