import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess, type Move, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import { courseModules, finalCourseEvent } from './data/course';
import { lessonContent } from './data/lessonContent';
import { lessonVisuals, type LessonVisual } from './data/lessonVisuals';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles.css';

type GameResult = 'playing' | 'white' | 'black' | 'draw';

const modules = [
  { icon: '♟', title: 'Играть', text: 'Партия против компьютера', href: '#play', tone: 'blue' },
  { icon: '✦', title: 'Задачи', text: 'Тренируйте тактику каждый день', href: '#puzzles', tone: 'lime' },
  { icon: '▦', title: 'Курсы', text: 'Последовательная программа обучения', href: '#courses', tone: 'cream' },
];

const puzzleSet = [
  { fen: 'r1bqk2r/pppp1ppp/2n2n2/8/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 2 4', move: 'd2d4', label: 'Развитие в дебюте' },
  { fen: '6k1/5pp1/1p2p2p/3pP2q/3P2r1/2P3P1/PP3P1P/R3Q1K1 w - - 0 1', move: 'e1e2', label: 'Найди единственный ход' },
  { fen: 'r4rk1/ppp1qppp/2np4/8/2B1P3/2N2N2/PPP2PPP/R1BQR1K1 w - - 0 1', move: 'e4e5', label: 'Атакуй центр' },
];

function legalDests(game: Chess) {
  const dests = new Map<Key, Key[]>();
  for (const move of game.moves({ verbose: true })) {
    const from = move.from as Key;
    const to = move.to as Key;
    dests.set(from, [...(dests.get(from) ?? []), to]);
  }
  return dests;
}

function gameResult(game: Chess): GameResult {
  if (!game.isGameOver()) return 'playing';
  if (game.isDraw()) return 'draw';
  return game.turn() === 'w' ? 'black' : 'white';
}

function BoardShell({ game, boardRef }: { game: Chess; boardRef: React.RefObject<HTMLDivElement | null> }) {
  return <div className="board-frame"><div ref={boardRef} className="game-board" aria-label="Шахматная доска" /><div className="board-file-label">{['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((file) => <span key={file}>{file}</span>)}</div><span className="board-turn-label">{game.turn() === 'w' ? 'Ваш ход' : 'Ход компьютера'}</span></div>;
}

function ChessGame() {
  const boardRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  const gameRef = useRef(new Chess());
  const [moves, setMoves] = useState<Move[]>([]);
  const [result, setResult] = useState<GameResult>('playing');
  const [thinking, setThinking] = useState(false);

  const syncBoard = () => {
    const game = gameRef.current;
    const nextResult = gameResult(game);
    setResult(nextResult);
    if (nextResult !== 'playing') {
      awardPawns(`game:${game.history().join('|')}`, nextResult === 'white' ? 20 : nextResult === 'draw' ? 10 : 5, 'game');
    }
    groundRef.current?.set({
      fen: game.fen(),
      turnColor: game.turn() === 'w' ? 'white' : 'black',
      check: game.isCheck() ? (game.turn() === 'w' ? 'white' : 'black') : false,
      lastMove: moves.length ? [moves[moves.length - 1].from as Key, moves[moves.length - 1].to as Key] : undefined,
      movable: { color: game.turn() === 'w' ? 'white' : 'black', dests: legalDests(game) },
    });
  };

  const computerMove = () => {
    const game = gameRef.current;
    if (game.isGameOver() || game.turn() !== 'b') return;
    setThinking(true);
    window.setTimeout(() => {
      const current = gameRef.current;
      const options = current.moves({ verbose: true });
      if (!options.length) return;
      const captures = options.filter((move) => Boolean(move.captured));
      const pool = captures.length ? captures : options;
      const move = pool[Math.floor(Math.random() * pool.length)];
      const played = current.move({ from: move.from, to: move.to, promotion: 'q' });
      setMoves((previous) => [...previous, played]);
      setThinking(false);
      syncBoard();
    }, 480);
  };

  useEffect(() => {
    if (!boardRef.current) return;
    const game = gameRef.current;
    groundRef.current = Chessground(boardRef.current, {
      fen: game.fen(), orientation: 'white', coordinates: false, turnColor: 'white',
      movable: { free: false, color: 'white', dests: legalDests(game), showDests: true, events: {
        after: (orig, dest) => {
          const current = gameRef.current;
          try {
            const played = current.move({ from: orig as Square, to: dest as Square, promotion: 'q' });
            setMoves((previous) => [...previous, played]);
            syncBoard();
            window.setTimeout(computerMove, 80);
          } catch { syncBoard(); }
        },
      } },
      highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 180 },
    });
    return () => groundRef.current?.destroy();
  }, []);

  const reset = () => { gameRef.current.reset(); setMoves([]); setThinking(false); syncBoard(); };
  return <section className="game-section" id="play"><div className="game-intro"><p className="eyebrow"><span>03</span> ИГРА ПРОТИВ КОМПЬЮТЕРА</p><h2>Сделай первый<br /><span>сильный ход.</span></h2><p>Настоящая партия с легальными ходами, взятиями, рокировкой и проверкой окончания игры.</p><div className="game-controls"><button className="button button-primary" type="button" onClick={reset}>Новая партия <span>↗</span></button><span className="engine-status"><i className={thinking ? 'thinking' : ''} /> {thinking ? 'Компьютер думает…' : result === 'playing' ? 'Компьютер готов' : result === 'draw' ? 'Ничья' : result === 'white' ? 'Вы победили' : 'Компьютер победил'}</span></div></div><div className="game-layout"><div className="player-row"><span className="avatar black-avatar">♞</span><div><strong>CoolChess Bot</strong><small>Уровень 1 · 800</small></div><span className="clock">∞</span></div><BoardShell game={gameRef.current} boardRef={boardRef} /><div className="player-row user-row"><span className="avatar user-avatar">Е</span><div><strong>Егор</strong><small>Ученик · 0 XP</small></div><span className="clock">∞</span></div></div><aside className="move-panel"><div className="panel-tabs"><button className="selected" type="button">ХОДЫ</button><button type="button">ПОЗИЦИЯ</button></div><div className="move-list">{moves.length ? moves.map((move, index) => <span key={`${move.san}-${index}`}><b>{index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : ''}</b> {move.san}</span>) : <p>Сделайте ход белыми,<br />чтобы начать партию.</p>}</div><div className="game-hint"><span>✦</span><div><strong>Подсказка</strong><p>Развивайте фигуры и контролируйте центр.</p></div></div></aside></section>;
}

function PuzzleTrainer() {
  const boardRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  const gameRef = useRef(new Chess(puzzleSet[0].fen));
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<'ready' | 'correct' | 'wrong'>('ready');
  const puzzle = puzzleSet[index];

  const loadPuzzle = (nextIndex: number) => { gameRef.current = new Chess(puzzleSet[nextIndex].fen); setIndex(nextIndex); setStatus('ready'); groundRef.current?.set({ fen: gameRef.current.fen(), turnColor: 'white', movable: { color: 'white', dests: legalDests(gameRef.current) }, lastMove: undefined }); };

  useEffect(() => {
    if (!boardRef.current) return;
    groundRef.current = Chessground(boardRef.current, { fen: gameRef.current.fen(), coordinates: false, orientation: 'white', movable: { free: false, color: 'white', dests: legalDests(gameRef.current), events: { after: (orig, dest) => { if (`${orig}${dest}` === puzzleSet[index].move) { setStatus('correct'); groundRef.current?.set({ movable: { color: 'white', dests: new Map() } }); } else { setStatus('wrong'); window.setTimeout(() => setStatus('ready'), 600); } } } }, highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 180 } });
    return () => groundRef.current?.destroy();
  }, []);

  return <section className="puzzle-section" id="puzzles"><div className="section-heading"><span className="section-number">04</span><h2>Одна задача.<br /><span>Один инсайт.</span></h2></div><div className="puzzle-layout"><div className="puzzle-board"><div ref={boardRef} className="game-board" aria-label="Доска шахматной задачи" /></div><div className="puzzle-copy"><p className="eyebrow">ЗАДАЧА {index + 1} ИЗ {puzzleSet.length}</p><h3>{puzzle.label}</h3><p>Найди лучший ход за белых. Здесь нет случайных кликов — только позиция и твоя идея.</p><div className={`puzzle-feedback ${status}`}><span>{status === 'correct' ? '✓' : status === 'wrong' ? '!' : '✦'}</span><strong>{status === 'correct' ? 'Отлично! Ход найден.' : status === 'wrong' ? 'Попробуй ещё раз.' : 'Твой ход'}</strong></div><button className="button button-primary" type="button" onClick={() => loadPuzzle((index + 1) % puzzleSet.length)}>Следующая задача <span>↗</span></button></div></div></section>;
}

type ImportedPuzzle = { id: string; fen: string; moves: string[]; rating: number; ratingDeviation: number; popularity: number; plays: number; themes: string[]; gameUrl: string; openingTags: string[]; dailyDate?: string };

type StudentState = { pawns: number; totalEarned: number; solved: number; theoryCompleted: number; currentStreak: number; bestStreak: number; lastActivity: string; dailyTaskDate: string; dailyTheoryDate: string; claimed: string[] };
const studentStateKey = 'coolchess.studentState';
const defaultStudentState: StudentState = { pawns: 0, totalEarned: 0, solved: 0, theoryCompleted: 0, currentStreak: 0, bestStreak: 0, lastActivity: '', dailyTaskDate: '', dailyTheoryDate: '', claimed: [] };
function readStudentState(): StudentState { if (typeof window === 'undefined') return defaultStudentState; try { return { ...defaultStudentState, ...JSON.parse(localStorage.getItem(studentStateKey) ?? '{}') }; } catch { return defaultStudentState; } }
function activityDate(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(date); }
function awardPawns(eventId: string, reward: number, kind: 'puzzle' | 'theory' | 'game' = 'puzzle') { const state = readStudentState(); if (state.claimed.includes(eventId)) return state; const today = activityDate(); const yesterday = activityDate(new Date(Date.now() - 86400000)); const dailyTaskDate = kind === 'puzzle' ? today : state.dailyTaskDate; const dailyTheoryDate = kind === 'theory' ? today : state.dailyTheoryDate; const completedToday = dailyTaskDate === today && dailyTheoryDate === today; const completedYesterday = state.dailyTaskDate === yesterday && state.dailyTheoryDate === yesterday; const nextStreak = completedToday && state.lastActivity !== today ? completedYesterday && state.lastActivity === yesterday ? state.currentStreak + 1 : 1 : state.currentStreak; const next = { ...state, pawns: state.pawns + reward, totalEarned: state.totalEarned + reward, solved: state.solved + (kind === 'puzzle' ? 1 : 0), theoryCompleted: state.theoryCompleted + (kind === 'theory' ? 1 : 0), currentStreak: nextStreak, bestStreak: Math.max(state.bestStreak, nextStreak), lastActivity: completedToday ? today : state.lastActivity, dailyTaskDate, dailyTheoryDate, claimed: [...state.claimed, eventId] }; localStorage.setItem(studentStateKey, JSON.stringify(next)); window.dispatchEvent(new Event('coolchess:state')); return next; }

function TheoryBoard({ visual }: { visual: LessonVisual }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  const gameRef = useRef(new Chess(visual.fen));
  const [step, setStep] = useState(0);
  const resetBoard = () => { gameRef.current = new Chess(visual.fen); setStep(0); groundRef.current?.set({ fen: visual.fen, lastMove: undefined, turnColor: 'white', movable: { color: 'white', dests: new Map() } }); };
  const advance = () => {
    const uci = visual.moves[step];
    if (!uci) return;
    const move = gameRef.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as 'q' | 'r' | 'b' | 'n' | undefined });
    if (move) { setStep((value) => value + 1); groundRef.current?.set({ fen: gameRef.current.fen(), lastMove: [move.from as Key, move.to as Key], turnColor: gameRef.current.turn() === 'w' ? 'white' : 'black' }); }
  };
  const playLine = () => {
    resetBoard();
    let lineStep = 0;
    const timer = window.setInterval(() => {
      const uci = visual.moves[lineStep];
      if (!uci) { window.clearInterval(timer); return; }
      const move = gameRef.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as 'q' | 'r' | 'b' | 'n' | undefined });
      if (!move) { window.clearInterval(timer); return; }
      lineStep += 1;
      setStep(lineStep);
      groundRef.current?.set({ fen: gameRef.current.fen(), lastMove: [move.from as Key, move.to as Key], turnColor: gameRef.current.turn() === 'w' ? 'white' : 'black' });
      if (lineStep >= visual.moves.length) window.clearInterval(timer);
    }, 720);
  };
  useEffect(() => { if (!boardRef.current) return; groundRef.current = Chessground(boardRef.current, { fen: visual.fen, coordinates: true, orientation: 'white', movable: { free: false, color: 'white', dests: new Map() }, highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 260 } }); return () => groundRef.current?.destroy(); }, [visual]);
  useEffect(() => resetBoard(), [visual]);
  return <div className="theory-board-card"><div className="theory-board-top"><div><span className="block-kicker">НА ДОСКЕ</span><strong>{visual.title}</strong></div><span>{step} / {visual.moves.length} ходов</span></div><div className="theory-board"><div ref={boardRef} className="game-board" aria-label={`Теоретическая позиция: ${visual.title}`} /></div><div className="theory-board-bottom"><p>{visual.caption}</p><div><button className="theory-control" type="button" onClick={resetBoard}>Сначала</button><button className="theory-control" type="button" onClick={playLine} disabled={!visual.moves.length}>Показать линию</button><button className="button button-primary" type="button" onClick={advance} disabled={step >= visual.moves.length}>{step >= visual.moves.length ? 'Позиция разобрана ✓' : 'Следующий ход ↗'}</button></div></div><div className="focus-fields">{visual.focus.split(' ').map((field) => <span key={field}>{field}</span>)}</div></div>;
}

function OriginalLichessPuzzleLibrary() {
  const boardRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  const [library, setLibrary] = useState<ImportedPuzzle[]>([]);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<'ready' | 'correct' | 'wrong'>('ready');
  const puzzle = library[index];

  useEffect(() => {
    fetch('/data/puzzles.json').then((response) => response.json() as Promise<ImportedPuzzle[]>).then(setLibrary).catch(() => setLibrary([]));
  }, []);

  useEffect(() => {
    if (!boardRef.current || !puzzle) return;
    const game = new Chess(puzzle.fen);
    const first = puzzle.moves[0];
    if (first) game.move({ from: first.slice(0, 2), to: first.slice(2, 4), promotion: first[4] as 'q' | 'r' | 'b' | 'n' | undefined });
    setStatus('ready');
    groundRef.current = Chessground(boardRef.current, { fen: game.fen(), coordinates: false, orientation: game.turn() === 'w' ? 'white' : 'black', turnColor: game.turn() === 'w' ? 'white' : 'black', movable: { free: false, color: game.turn() === 'w' ? 'white' : 'black', dests: legalDests(game), events: { after: (orig, dest) => {
      if (`${orig}${dest}` === puzzle.moves[1]?.slice(0, 4)) { const played = game.move({ from: orig as Square, to: dest as Square, promotion: 'q' }); awardPawns(`puzzle:${puzzle.id}`, 10); setStatus('correct'); groundRef.current?.set({ fen: game.fen(), lastMove: played ? [played.from as Key, played.to as Key] : undefined, movable: { color: game.turn() === 'w' ? 'white' : 'black', dests: new Map() } }); }
      else { setStatus('wrong'); groundRef.current?.set({ fen: game.fen(), turnColor: game.turn() === 'w' ? 'white' : 'black', movable: { color: game.turn() === 'w' ? 'white' : 'black', dests: legalDests(game) } }); window.setTimeout(() => setStatus('ready'), 650); }
    } } }, highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 180 } });
    return () => groundRef.current?.destroy();
  }, [puzzle]);

  const tags = puzzle?.themes.filter((theme) => !['short', 'long', 'veryLong', 'master', 'masterVsMaster'].includes(theme)).slice(0, 4) ?? [];
  return <section className="puzzle-section" id="puzzles"><div className="section-heading"><span className="section-number">04</span><h2>Одна задача.<br /><span>Один инсайт.</span></h2></div><div className="puzzle-layout"><div className="puzzle-board"><div ref={boardRef} className="game-board" aria-label="Доска шахматной задачи" /></div><div className="puzzle-copy">{puzzle ? <><p className="eyebrow">ЗАДАЧА {index + 1} ИЗ {library.length}</p><h3>{tags.map((tag) => tag.replace(/([A-Z])/g, ' $1').toLowerCase()).join(' · ') || 'Тактическая идея'}</h3><p>Позиция из открытой базы Lichess. После хода соперника найди лучший ответ и проверь свою идею.</p><div className="puzzle-meta"><span><strong>{puzzle.rating}</strong><small>рейтинг задачи</small></span><span><strong>{puzzle.plays.toLocaleString('ru-RU')}</strong><small>решений</small></span></div><div className={`puzzle-feedback ${status}`}><span>{status === 'correct' ? '✓' : status === 'wrong' ? '!' : '✦'}</span><strong>{status === 'correct' ? 'Отлично! Ход найден.' : status === 'wrong' ? 'Попробуй ещё раз.' : 'Твой ход'}</strong></div><div className="puzzle-actions"><button className="button button-primary" type="button" onClick={() => setIndex((index + 1) % library.length)}>Следующая задача <span>↗</span></button><a className="source-link" href={`https://${puzzle.gameUrl}`} target="_blank" rel="noreferrer">Открыть исходную партию ↗</a></div></> : <><p className="eyebrow">БАЗА ЗАДАЧ</p><h3>Загрузка задач…</h3><p>Индекс Lichess загружается из локальных данных проекта.</p></>}</div></div></section>;
}

function CourseNavigator() {
  const [selectedModule, setSelectedModule] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState(0);
  const [completed, setCompleted] = useState<string[]>(() => JSON.parse(localStorage.getItem('coolchess.completedTopics') ?? '[]'));
  const module = courseModules[selectedModule];
  const topic = module.topics[selectedTopic];
  const topicKey = `${module.id}:${topic.id}`;
  const toggleComplete = () => {
    const next = completed.includes(topicKey) ? completed.filter((item) => item !== topicKey) : [...completed, topicKey];
    setCompleted(next);
    localStorage.setItem('coolchess.completedTopics', JSON.stringify(next));
  };
  const chooseModule = (index: number) => { setSelectedModule(index); setSelectedTopic(0); };
  return <section className="course-section" id="course-program"><div className="section-heading"><span className="section-number">05</span><h2>Курс<br /><span>CoolChess.</span></h2></div><p className="section-lead">39 тем от первых ходов до стратегии миттельшпиля. Проходи последовательно и возвращайся к сложным темам.</p><div className="course-layout"><aside className="course-modules">{courseModules.map((item, index) => <button className={index === selectedModule ? 'course-module active' : 'course-module'} key={item.id} type="button" onClick={() => chooseModule(index)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.title}</strong><small>{item.topics.length} тем</small></button>)}<div className="course-event"><span>ФИНАЛ</span><strong>{finalCourseEvent.title}</strong></div></aside><div className="course-lesson"><div className="lesson-topline"><span>МОДУЛЬ {selectedModule + 1} / {courseModules.length}</span><span>{completed.filter((item) => item.startsWith(`${module.id}:`)).length} / {module.topics.length} пройдено</span></div><h3>{module.title}</h3><p className="lesson-description">{module.description}</p><div className="topic-list">{module.topics.map((item, index) => <button className={index === selectedTopic ? 'topic-row selected' : 'topic-row'} key={item.id} type="button" onClick={() => setSelectedTopic(index)}><span className={completed.includes(`${module.id}:${item.id}`) ? 'topic-check done' : 'topic-check'}>{completed.includes(`${module.id}:${item.id}`) ? '✓' : String(index + 1).padStart(2, '0')}</span><span>{item.title}</span><b>↗</b></button>)}</div><div className="lesson-focus"><span className="lesson-icon">✦</span><div><small>СЕЙЧАС ИЗУЧАЕМ</small><strong>{topic.title}</strong><p>Интерактивный урок с доской, объяснением идеи и практическим заданием.</p><div className="lesson-actions"><button className="button button-primary" type="button" onClick={toggleComplete}>{completed.includes(topicKey) ? 'Тема пройдена ✓' : 'Отметить пройденной'} <span>↗</span></button><a className="button button-link" href="#puzzles">К задачам по теме ↓</a></div></div></div></div></div></section>;
}

function LessonPracticeBoard({ themes }: { themes: string[] }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  const lineIndexRef = useRef(1);
  const [library, setLibrary] = useState<ImportedPuzzle[]>([]);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState<'ready' | 'correct' | 'wrong'>('ready');
  const filtered = library.filter((puzzle) => themes.some((theme) => puzzle.themes.includes(theme)));
  const puzzle = filtered[selected % Math.max(filtered.length, 1)];

  useEffect(() => { fetch('/data/puzzles.json').then((response) => response.json() as Promise<ImportedPuzzle[]>).then(setLibrary).catch(() => setLibrary([])); }, []);
  useEffect(() => {
    if (!boardRef.current || !puzzle) return;
    const game = new Chess(puzzle.fen);
    const first = puzzle.moves[0];
    if (first) game.move({ from: first.slice(0, 2), to: first.slice(2, 4), promotion: first[4] as 'q' | 'r' | 'b' | 'n' | undefined });
    lineIndexRef.current = 1;
    setStatus('ready');
    groundRef.current = Chessground(boardRef.current, { fen: game.fen(), coordinates: false, orientation: game.turn() === 'w' ? 'white' : 'black', turnColor: game.turn() === 'w' ? 'white' : 'black', movable: { free: false, color: game.turn() === 'w' ? 'white' : 'black', dests: legalDests(game), events: { after: (orig, dest) => {
      const expected = puzzle.moves[lineIndexRef.current]?.slice(0, 4);
      if (`${orig}${dest}` !== expected) { setStatus('wrong'); groundRef.current?.set({ fen: game.fen(), turnColor: game.turn() === 'w' ? 'white' : 'black', movable: { color: game.turn() === 'w' ? 'white' : 'black', dests: legalDests(game) } }); window.setTimeout(() => setStatus('ready'), 650); return; }
      const played = game.move({ from: orig as Square, to: dest as Square, promotion: 'q' });
      if (!played) return;
      lineIndexRef.current += 1;
      awardPawns(`puzzle:${puzzle.id}`, 10);
      groundRef.current?.set({ fen: game.fen(), lastMove: [played.from as Key, played.to as Key], turnColor: game.turn() === 'w' ? 'white' : 'black', movable: { color: game.turn() === 'w' ? 'white' : 'black', dests: new Map() } });
      if (lineIndexRef.current >= puzzle.moves.length) { setStatus('correct'); return; }
      setStatus('correct');
      window.setTimeout(() => {
        const replyUci = puzzle.moves[lineIndexRef.current];
        const reply = game.move({ from: replyUci.slice(0, 2), to: replyUci.slice(2, 4), promotion: replyUci[4] as 'q' | 'r' | 'b' | 'n' | undefined });
        if (!reply) return;
        lineIndexRef.current += 1;
        const hasNext = lineIndexRef.current < puzzle.moves.length;
        groundRef.current?.set({ fen: game.fen(), lastMove: [reply.from as Key, reply.to as Key], turnColor: game.turn() === 'w' ? 'white' : 'black', movable: { color: game.turn() === 'w' ? 'white' : 'black', dests: hasNext ? legalDests(game) : new Map() } });
        setStatus(hasNext ? 'ready' : 'correct');
      }, 650);
    } } }, highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 320 } });
    return () => groundRef.current?.destroy();
  }, [puzzle]);

  if (!puzzle) return <div className="lesson-practice empty-practice"><span className="block-kicker">ПРАКТИКА ПО ТЕМЕ</span><p>Подбираем позицию из базы Lichess…</p></div>;
  return <div className="lesson-practice"><div className="practice-header"><div><span className="block-kicker">ПРАКТИКА ПО ТЕМЕ</span><strong>{filtered.length} связанных задач</strong></div><span className="practice-rating">{puzzle.rating} рейтинг</span></div><div className="practice-board-wrap"><div ref={boardRef} className="game-board" aria-label="Позиция по текущей теме" /></div><div className="practice-info"><div><strong>{status === 'correct' ? 'Ход найден ✓' : status === 'wrong' ? 'Попробуй ещё раз' : 'Найди лучший ход'}</strong><small>Ход соперника уже показан · позиция связана с тегами: {themes.join(', ')}</small></div><button type="button" className="practice-next" onClick={() => setSelected((value) => value + 1)}>Другая позиция ↗</button></div></div>;
}

function LichessPuzzleLibrary() {
  return <OriginalLichessPuzzleLibrary />;
}

function CourseArticleWorkspace() {
  const [selectedModule, setSelectedModule] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState(0);
  const [completed, setCompleted] = useState<string[]>(() => JSON.parse(localStorage.getItem('coolchess.completedTopics') ?? '[]'));
  const [joinedRace, setJoinedRace] = useState(false);
  const module = courseModules[selectedModule];
  const topic = module.topics[selectedTopic];
  const lesson = lessonContent[topic.id];
  const topicKey = `${module.id}:${topic.id}`;
  const progress = Math.round((completed.length / 39) * 100);
  const toggleComplete = () => {
    const next = completed.includes(topicKey) ? completed.filter((item) => item !== topicKey) : [...completed, topicKey];
    setCompleted(next);
    localStorage.setItem('coolchess.completedTopics', JSON.stringify(next));
  };
  return <section className="learning-app" id="course-program"><aside className="learning-sidebar"><div className="sidebar-title"><span className="sidebar-logo">♞</span><div><strong>Твой маршрут</strong><small>Ученик · уровень 1</small></div></div><div className="progress-card"><div><span>ПРОГРЕСС КУРСА</span><strong>{progress}%</strong></div><div className="progress-bar"><i style={{ width: `${progress}%` }} /></div><small>{completed.length} из 39 тем пройдено</small></div><nav className="syllabus">{courseModules.map((item, index) => <div className="syllabus-module" key={item.id}><button className={selectedModule === index ? 'syllabus-head active' : 'syllabus-head'} type="button" onClick={() => { setSelectedModule(index); setSelectedTopic(0); }}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.title}</strong><b>{selectedModule === index ? '−' : '+'}</b></button>{selectedModule === index && <div className="syllabus-topics">{item.topics.map((itemTopic, topicIndex) => <button className={topicIndex === selectedTopic ? 'syllabus-topic active' : 'syllabus-topic'} key={itemTopic.id} type="button" onClick={() => setSelectedTopic(topicIndex)}><i>{completed.includes(`${item.id}:${itemTopic.id}`) ? '✓' : String(topicIndex + 1).padStart(2, '0')}</i><span>{itemTopic.title}</span></button>)}</div>}</div>)}</nav><div className="sidebar-footer"><span className="online-dot" /> 12 учеников сейчас онлайн</div></aside><div className="learning-main"><div className="workspace-topbar"><div><span className="eyebrow"><span>01</span> УЧЕБНОЕ ПРОСТРАНСТВО</span><h2>Учись через <em>понимание.</em></h2></div><div className="workspace-actions"><button type="button" className="icon-button" aria-label="Поиск">⌕</button><button type="button" className="profile-chip"><span>Е</span> Егор <b>⌄</b></button></div></div><div className="lesson-grid"><article className="lesson-article"><div className="article-breadcrumb">КУРС / {module.title.toUpperCase()} / ТЕМА {selectedTopic + 1}</div><h1>{topic.title}</h1><p className="article-lead">{lesson.lead}</p><div className="article-tags">{lesson.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div><div className="article-block analogy-block"><span className="block-kicker">ПОНЯТНАЯ АНАЛОГИЯ</span><p>{lesson.analogy}</p></div><div className="article-block"><span className="block-kicker">РАЗБЕРЁМ НА ПРИМЕРЕ</span><p>{lesson.example}</p><div className="mini-board" aria-label="Иллюстрация шахматной позиции"><span>♜</span><span>♟</span><span>♔</span><span>♙</span><b>Идея важнее запоминания варианта</b></div></div><div className="article-block"><span className="block-kicker">ПЛАН ДЕЙСТВИЯ</span><ol>{lesson.steps.map((step) => <li key={step}>{step}</li>)}</ol></div><div className="article-footer"><button className="button button-primary" type="button" onClick={toggleComplete}>{completed.includes(topicKey) ? 'Тема пройдена ✓' : 'Отметить тему пройденной'} <span>↗</span></button><a className="button button-link" href="#puzzles">Решить задачи по теме ↓</a></div></article><aside className="learning-rail"><div className="rail-card challenge-card"><div className="rail-card-top"><span className="live-label"><i /> LIVE</span><span>5 мин</span></div><h3>Гонка задач</h3><p>Соревнуйся с учениками в скорости и точности.</p><div className="race-players"><span>А</span><span>М</span><span>К</span><span>+9</span></div><button type="button" className="button button-primary" onClick={() => setJoinedRace(!joinedRace)}>{joinedRace ? 'Ты в гонке ✓' : 'Войти в гонку'} <span>↗</span></button></div><div className="rail-card"><div className="rail-title"><strong>Сейчас онлайн</strong><a href="#community">Все</a></div>{['Мария · 1240', 'Артём · 1188', 'Кирилл · 1094'].map((player) => <div className="online-player" key={player}><span className="player-avatar">{player[0]}</span><span>{player}</span><i /></div>)}</div><div className="rail-card leaderboard-card" id="community"><div className="rail-title"><strong>Лидерборд недели</strong><span>Задачи</span></div>{['01  Ника  48', '02  Михаил  41', '03  Егор  36'].map((row) => <div className="leader-row" key={row}><span>{row}</span><b>XP</b></div>)}<button type="button" className="text-button">Открыть сообщество ↗</button></div></aside></div></div></section>;
}

function TopicPracticeSectionLegacy() {
  const [selection, setSelection] = useState('chess-basics:basics-history');
  const [moduleId, topicId] = selection.split(':');
  const currentModule = courseModules.find((item) => item.id === moduleId) ?? courseModules[0];
  const currentTopic = currentModule.topics.find((item) => item.id === topicId) ?? currentModule.topics[0];
  return <section className="topic-practice-page" id="topic-practice"><div className="topic-practice-heading"><div><span className="eyebrow"><span>02</span> СВЯЗЬ ТЕОРИИ И ПРАКТИКИ</span><h2>Прочитал —<br /><em>реши на доске.</em></h2><p>CoolChess подбирает позиции из базы Lichess по тегам именно выбранной темы.</p></div><label>Текущая тема<select value={selection} onChange={(event) => setSelection(event.target.value)}>{courseModules.flatMap((item) => item.topics.map((topic) => <option key={`${item.id}:${topic.id}`} value={`${item.id}:${topic.id}`}>{item.title} · {topic.title}</option>))}</select></label></div><div className="topic-practice-card"><div className="topic-practice-copy"><span className="block-kicker">СЕЙЧАС ТРЕНИРУЕМ</span><h3>{currentTopic.title}</h3><p>{lessonContent[currentTopic.id]?.lead}</p><div className="article-tags">{currentTopic.puzzleThemes.map((tag) => <span key={tag}>#{tag}</span>)}</div><a className="button button-link" href="#course-program">Вернуться к статье ↑</a></div><LessonPracticeBoard themes={currentTopic.puzzleThemes} /></div></section>;
}

function CommunityPage() {
  const [joined, setJoined] = useState(false);
  const [student, setStudent] = useState(readStudentState);
  useEffect(() => { const refresh = () => setStudent(readStudentState()); window.addEventListener('coolchess:state', refresh); return () => window.removeEventListener('coolchess:state', refresh); }, []);
  return <section className="community-page" id="community"><div className="community-hero"><div><span className="eyebrow"><span>03</span> СООБЩЕСТВО COOLCHESS</span><h2>Решай вместе.<br /><em>Расти быстрее.</em></h2><p>Задачи становятся интереснее, когда у каждой есть соперник, рейтинг и общий результат.</p></div><div className="community-live"><span className="live-label"><i /> LIVE NOW</span><strong>12</strong><small>учеников сейчас решают задачи</small><div className="live-stack"><span>М</span><span>А</span><span>К</span><span>Е</span><b>+8</b></div></div></div><div className="community-grid"><div className="community-card race-large"><div className="card-kicker">БЛИЖАЙШЕЕ СОБЫТИЕ · 05:00</div><h3>Гонка задач</h3><p>5 минут, 10 позиций, один общий рейтинг. Точность важнее случайной скорости.</p><div className="race-track"><span className="race-line" /><i style={{ left: '63%' }}>Е</i><i style={{ left: '74%' }}>М</i><i style={{ left: '48%' }}>А</i></div><button className="button button-primary" type="button" onClick={() => setJoined(!joined)}>{joined ? 'Ты участвуешь ✓' : 'Войти в гонку'} <span>↗</span></button></div><div className="community-card online-card"><div className="community-card-title"><h3>Онлайн сейчас</h3><a href="#community">Все игроки ↗</a></div>{['Мария', 'Артём', 'Кирилл', 'Ника'].map((name, index) => <div className="community-player" key={name}><span>{name[0]}</span><div><strong>{name}</strong><small>{1240 - index * 46} · решает задачи</small></div><i /></div>)}</div><div className="community-card leaderboard-large"><div className="community-card-title"><h3>Лидерборд недели</h3><span>ПО ПЕШКАМ</span></div>{['Ника', 'Михаил', 'Егор', 'София', 'Даниил'].map((name, index) => <div className={index === 2 ? 'ranking-row current' : 'ranking-row'} key={name}><b>{String(index + 1).padStart(2, '0')}</b><span>{name}</span><small>{48 - index * 5} задач</small><strong>♟ {name === 'Егор' ? student.pawns : 980 - index * 32}</strong></div>)}</div><div className="community-card invite-card"><span className="invite-symbol">♞</span><h3>Создай свою группу</h3><p>Собери друзей или класс и сравнивайте прогресс в одной таблице.</p><button className="button button-link" type="button">Создать группу ↗</button></div></div></section>;
}

function TheoryLessonPage() {
  const [selection, setSelection] = useState('chess-basics:basics-moves');
  const [moduleId, topicId] = selection.split(':');
  const currentModule = courseModules.find((item) => item.id === moduleId) ?? courseModules[0];
  const currentTopic = currentModule.topics.find((item) => item.id === topicId) ?? currentModule.topics[2];
  const article = lessonContent[currentTopic.id];
  const visual = lessonVisuals[currentTopic.id] ?? { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: [], title: currentTopic.title, caption: 'Разбери позицию на доске и назови главную идею темы.', focus: 'e4 d4' };
  return <section className="theory-page" id="theory"><div className="theory-page-head"><div><span className="eyebrow"><span>02</span> ИНТЕРАКТИВНАЯ ТЕОРИЯ</span><h2>Не читай ход.<br /><em>Увидь его.</em></h2><p>Каждая статья теперь связана с конкретной позицией: выбирай тему, смотри идею на доске и проходи ход за ходом.</p></div><label>Открыть тему<select value={selection} onChange={(event) => setSelection(event.target.value)}>{courseModules.flatMap((item) => item.topics.map((topic) => <option key={`${item.id}:${topic.id}`} value={`${item.id}:${topic.id}`}>{item.title} · {topic.title}</option>))}</select></label></div><div className="theory-layout"><article className="theory-copy"><div className="article-breadcrumb">{currentModule.title.toUpperCase()} / ТЕМА</div><h3>{currentTopic.title}</h3><p className="theory-lead">{article.lead}</p><div className="theory-callout"><span className="block-kicker">ПОНЯТНАЯ АНАЛОГИЯ</span><p>{article.analogy}</p></div><div className="theory-example"><span className="block-kicker">ЧТО НУЖНО УВИДЕТЬ</span><p>{article.example}</p></div><ol>{article.steps.map((step) => <li key={step}>{step}</li>)}</ol></article><TheoryBoard visual={visual} /></div></section>;
}

function TopicPracticeSection() {
  return <><TopicPracticeSectionLegacy /><TheoryLessonPage /></>;
}

function StartLearningPanel() {
  return <section className="start-panel" id="start-learning"><div className="start-copy"><span className="eyebrow"><span>01</span> СЕГОДНЯ В COOLCHESS</span><h1>Начни с идеи.<br /><em>Увидь её на доске.</em></h1><p>Короткие объяснения, настоящие позиции и задачи, которые продолжают каждый урок. Твой маршрут уже готов — осталось сделать первый ход.</p><div className="start-stats"><span><strong>39</strong><small>тем в курсе</small></span><span><strong>6 000</strong><small>задач в базе</small></span><span><strong>12</strong><small>учеников онлайн</small></span></div><a className="button button-primary" href="#theory">Открыть первый урок <span>↘</span></a></div><div className="start-board"><TheoryBoard visual={lessonVisuals['opening-principles']} /></div></section>;
}

function CourseWorkspace() {
  useEffect(() => { document.querySelector('.leaderboard-card#community')?.setAttribute('id', 'community-rail'); }, []);
  return <><StartLearningPanel /><CourseArticleWorkspace /><TopicPracticeSection /><CommunityPage /></>;
}

function LearnPage() {
  const topicFromHash = () => window.location.hash.startsWith('#learn/') ? window.location.hash.split('/')[1] : 'basics-moves';
  const [topicId, setTopicId] = useState(topicFromHash);
  useEffect(() => { const syncTopic = () => { const next = topicFromHash(); if (next !== 'basics-moves' || window.location.hash === '#learn') setTopicId(next); }; window.addEventListener('hashchange', syncTopic); return () => window.removeEventListener('hashchange', syncTopic); }, []);
  const module = courseModules.find((item) => item.topics.some((topic) => topic.id === topicId)) ?? courseModules[0];
  const topic = module.topics.find((item) => item.id === topicId) ?? module.topics[0];
  const article = lessonContent[topic.id];
  const visual = lessonVisuals[topic.id] ?? { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: [], title: topic.title, caption: 'Разбери позицию и назови главную идею.', focus: 'e4 d4' };
  const completeTheory = () => awardPawns(`theory:${topic.id}`, 20, 'theory');
  return <section className="learn-page"><aside className="learn-page-sidebar"><div className="sidebar-title"><span className="sidebar-logo">♟</span><div><strong>Курс ученика</strong><small>Выбери тему для изучения</small></div></div>{courseModules.map((item) => <div className="learn-module" key={item.id}><strong>{item.title}</strong>{item.topics.map((itemTopic) => <button className={itemTopic.id === topic.id ? 'learn-topic active' : 'learn-topic'} key={itemTopic.id} type="button" onClick={() => setTopicId(itemTopic.id)}><span>{itemTopic.id === topic.id ? '→' : '·'}</span>{itemTopic.title}</button>)}</div>)}</aside><main className="learn-page-main"><div className="learn-page-heading"><div><span className="eyebrow"><span>01</span> УЧЕБНАЯ СТРАНИЦА</span><h1>{topic.title}</h1><p>{article.lead}</p></div><div className="lesson-reward"><span>НАГРАДА ЗА ТЕМУ</span><strong>♟ +20</strong></div></div><article className="learn-article"><div className="learn-article-text"><div className="article-breadcrumb">{module.title.toUpperCase()} / ТЕМА</div><h2>Пойми идею,<br /><em>а не только правило.</em></h2><div className="learn-callout"><span className="block-kicker">ПОНЯТНАЯ АНАЛОГИЯ</span><p>{article.analogy}</p></div><div className="learn-example"><span className="block-kicker">РАЗБЕРЁМ НА ПРИМЕРЕ</span><p>{article.example}</p></div><ol>{article.steps.map((step) => <li key={step}>{step}</li>)}</ol><button className="button button-primary" type="button" onClick={completeTheory}>Завершить теорию · ♟ +20 <span>↗</span></button></div><div className="learn-article-board"><TheoryBoard visual={visual} /></div></article><section className="learn-practice"><div className="learn-practice-heading"><div><span className="block-kicker">ПРАКТИКА ЭТОЙ ТЕМЫ</span><h2>Теперь проверь идею на задаче.</h2><p>Подборка загружается только по тегам выбранной темы: {topic.puzzleThemes.join(', ') || 'базовая позиция'}.</p></div></div><LessonPracticeBoard themes={topic.puzzleThemes} /></section></main></section>;
}

function WalletBadge() {
  const [state, setState] = useState(readStudentState);
  useEffect(() => { const update = () => setState(readStudentState()); window.addEventListener('coolchess:state', update); return () => window.removeEventListener('coolchess:state', update); }, []);
  return <a className="wallet-badge" href="#profile" title="Открыть профиль">♟ <strong>{state.pawns}</strong></a>;
}

function ProfilePage() {
  const [state, setState] = useState(readStudentState);
  useEffect(() => { const update = () => setState(readStudentState()); window.addEventListener('coolchess:state', update); return () => window.removeEventListener('coolchess:state', update); }, []);
  return <section className="profile-page"><div className="profile-hero"><div className="profile-avatar-large">Е</div><div><span className="eyebrow"><span>06</span> ПРОФИЛЬ УЧЕНИКА</span><h1>Егор <em>в игре.</em></h1><p>Каждая задача и каждая тема двигают тебя вперёд.</p></div><div className="profile-wallet"><span>БАЛАНС</span><strong>♟ {state.pawns}</strong><small>{state.totalEarned} всего заработано</small></div></div><div className="profile-grid"><div className="profile-card streak-card"><span className="profile-card-kicker">СЕРИЯ</span><strong>🔥 {state.currentStreak}</strong><p>дней подряд</p><small>Лучший результат: {state.bestStreak} дней</small></div><div className="profile-card"><span className="profile-card-kicker">ЗАДАЧИ</span><strong>{state.solved}</strong><p>решено правильно</p><small>Награда начисляется один раз за позицию</small></div><div className="profile-card"><span className="profile-card-kicker">ТЕОРИЯ</span><strong>{state.theoryCompleted}</strong><p>тем завершено</p><small>Сегодня нужны задача и теория</small></div></div><div className="profile-activity"><div><h2>Активность</h2><p>Серия сохраняется, если каждый день решена задача и изучена теория.</p></div><div className="activity-calendar">{Array.from({ length: 28 }, (_, index) => <i className={index < Math.min(state.currentStreak, 28) ? 'active' : ''} key={index} />)}</div></div></section>;
}

function useHashRoute() { const get = () => window.location.hash.replace(/^#/, '').split('/')[0] || 'home'; const [route, setRoute] = useState(get); useEffect(() => { const onHash = () => setRoute(get()); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []); return route; }

function AppV2() {
  const route = useHashRoute();
  const page = route === 'learn' || route === 'theory' ? <LearnPage /> : route === 'play' ? <ChessGame /> : route === 'puzzles' ? <LichessPuzzleLibrary /> : route === 'community' ? <CommunityPage /> : route === 'profile' ? <ProfilePage /> : <StartLearningPanel />;
  return <div className="app-shell"><header className="topbar"><a className="brand" href="#home" aria-label="CoolChess, на главную"><span className="brand-mark">♞</span><span>cool<span>chess</span></span></a><nav className="main-nav" aria-label="Основная навигация"><a className={route === 'home' ? 'active' : ''} href="#home">Главная</a><a className={route === 'learn' || route === 'theory' ? 'active' : ''} href="#learn">Учиться</a><a className={route === 'play' ? 'active' : ''} href="#play">Играть</a><a className={route === 'puzzles' ? 'active' : ''} href="#puzzles">Задачи</a><a className={route === 'community' ? 'active' : ''} href="#community">Сообщество</a></nav><div className="topbar-user"><WalletBadge /><a className="profile-button" href="#profile">Мой профиль <span>↗</span></a></div><button className="menu-button" type="button" aria-label="Открыть меню">☰</button></header><main className="route-main">{page}</main><footer className="footer"><div className="footer-brand"><span className="brand-mark">♞</span><span>cool<span>chess</span></span></div><p>Шахматы, которые растут вместе с тобой.</p><small>© 2026 CoolChess. Учимся думать на несколько ходов вперёд.</small></footer></div>;
}

void modules;
void CourseNavigator;
void App;

function App() {
  return <div className="app-shell"><header className="topbar"><a className="brand" href="#top" aria-label="CoolChess, на главную"><span className="brand-mark">♞</span><span>cool<span>chess</span></span></a><nav className="main-nav" aria-label="Основная навигация"><a className="active" href="#course-program">Учиться</a><a href="#play">Играть</a><a href="#puzzles">Задачи</a><a href="#community">Сообщество</a></nav><button className="profile-button" type="button">Мой кабинет <span>↗</span></button><button className="menu-button" type="button" aria-label="Открыть меню">☰</button></header><main id="top"><CourseWorkspace /><ChessGame />{false && <PuzzleTrainer />}<LichessPuzzleLibrary /><section className="progress-strip" id="progress"><div><span className="eyebrow light-eyebrow">ТВОЙ ПРОГРЕСС</span><strong>Первый шаг уже<br />ближе, чем кажется.</strong></div><div className="progress-stat"><strong>12</strong><span>уроков впереди</span></div><div className="progress-stat"><strong>7</strong><span>задач на сегодня</span></div><button className="button button-lime" type="button">Открыть кабинет <span>↗</span></button></section></main><footer className="footer"><div className="footer-brand"><span className="brand-mark">♞</span><span>cool<span>chess</span></span></div><p>Шахматы, которые растут вместе с тобой.</p><small>© 2026 CoolChess. Учимся думать на несколько ходов вперёд.</small></footer></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><AppV2 /></StrictMode>);
