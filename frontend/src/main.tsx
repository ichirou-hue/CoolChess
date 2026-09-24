import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import { courseModules } from './data/course';
import { lessonContent } from './data/lessonContent';
import { lessonVisuals, type LessonVisual } from './data/lessonVisuals';
import { awardPawns, readStudentState } from './shared/lib/studentState';
import { AuthPage as FeatureAuthPage } from './features/auth/ui/AuthPage';
import { AuthProvider } from './features/auth/model/AuthProvider';
import * as gameApi from './features/chess-game/api/gameApi';
import type { GameResponse } from './features/chess-game/api/gameApi';
import { useHashRoute } from './app/useHashRoute';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles.css';

function legalDests(game: Chess) {
  const dests = new Map<Key, Key[]>();
  for (const move of game.moves({ verbose: true })) {
    const from = move.from as Key;
    const to = move.to as Key;
    dests.set(from, [...(dests.get(from) ?? []), to]);
  }
  return dests;
}

function BoardShell({ game, boardRef }: { game: Chess; boardRef: React.RefObject<HTMLDivElement | null> }) {
  return <div className="board-frame"><div ref={boardRef} className="game-board" aria-label="Шахматная доска" /><div className="board-file-label">{['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((file) => <span key={file}>{file}</span>)}</div><span className="board-turn-label">{game.turn() === 'w' ? 'Ход белых' : 'Ход чёрных'}</span></div>;
}

function ChessGame() {
  const boardRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  const gameRef = useRef(new Chess());
  const startedRef = useRef(false);
  const gameStateRef = useRef<GameResponse | null>(null);
  const thinkingRef = useRef(false);
  const [game, setGame] = useState<GameResponse | null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const syncBoard = (response: GameResponse) => {
    const nextGame = new Chess(response.current_fen);
    gameRef.current = nextGame;
    gameStateRef.current = response;
    setGame(response);
    setMoves(response.moves_uci);
    const last = response.moves_uci.at(-1);
    const canMove = response.status === 'in_progress' && ((response.player_color === 'white' && nextGame.turn() === 'w') || (response.player_color === 'black' && nextGame.turn() === 'b'));
    groundRef.current?.set({
      fen: response.current_fen,
      turnColor: nextGame.turn() === 'w' ? 'white' : 'black',
      check: response.is_check ? (nextGame.turn() === 'w' ? 'white' : 'black') : false,
      lastMove: last ? [last.slice(0, 2) as Key, last.slice(2, 4) as Key] : undefined,
      movable: { color: canMove ? response.player_color : 'white', dests: canMove ? legalDests(nextGame) : new Map() },
    });
  };

  const loadGame = async () => {
    setLoading(true);
    setError(null);
    if (!sessionStorage.getItem('coolchess.accessToken')) {
      setError('Сначала войдите в аккаунт');
      setLoading(false);
      return;
    }
    try {
      const active = await gameApi.getActiveGame();
      syncBoard(active ?? await gameApi.startGame());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить партию');
    } finally {
      setLoading(false);
    }
  };

  const sendMove = async (orig: Key, dest: Key) => {
    const currentGame = gameStateRef.current;
    if (!currentGame?.id || thinkingRef.current || currentGame.status !== 'in_progress') return;
    const current = gameRef.current;
    const promotion = (orig[1] === '7' && dest[1] === '8') || (orig[1] === '2' && dest[1] === '1') ? 'q' : '';
    try {
      current.move({ from: orig as Square, to: dest as Square, promotion: promotion || 'q' });
      thinkingRef.current = true;
      setThinking(true);
      const response = await gameApi.makeMove(currentGame.id, `${orig}${dest}${promotion}`);
      syncBoard(response);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отправить ход');
      await loadGame();
    } finally {
      thinkingRef.current = false;
      setThinking(false);
    }
  };

  useEffect(() => {
    if (!boardRef.current) return;
    groundRef.current = Chessground(boardRef.current, {
      fen: gameRef.current.fen(), orientation: 'white', coordinates: false, turnColor: 'white',
      movable: { free: false, color: 'white', dests: new Map(), showDests: true, events: { after: (orig, dest) => { void sendMove(orig as Key, dest as Key); } } },
      highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 220 },
    });
    if (!startedRef.current) { startedRef.current = true; void loadGame(); }
    return () => groundRef.current?.destroy();
  }, []);

  const newGame = () => { void loadGame(); };
  const statusText = loading ? 'Загрузка партии…' : error ?? (thinking ? 'Maia думает…' : game?.status === 'player_won' ? 'Вы победили' : game?.status === 'bot_won' ? 'Победил бот' : game?.status === 'draw' ? 'Ничья' : 'Ваша очередь');

  return <section className="game-section" id="play"><div className="game-intro"><p className="eyebrow"><span>03</span> ИГРА ПРОТИВ MAIA</p><h2>Настоящая<br /><span>партия.</span></h2><p>Сервер проверяет каждый ход, сохраняет партию и отвечает ходом Maia.</p><div className="game-controls"><button className="button button-primary" type="button" onClick={newGame} disabled={loading || thinking}>Новая партия <span>↗</span></button><span className="engine-status"><i className={thinking ? 'thinking' : ''} /> {statusText}</span>{(error?.includes('401') || error?.includes('Сначала войдите')) && <a className="source-link" href="#auth">Войти в аккаунт ↗</a>}</div></div><div className="game-layout"><div className="player-row"><span className="avatar black-avatar">♞</span><div><strong>CoolChess Maia</strong><small>Серверная партия · {game?.bot_difficulty ?? 1500}</small></div><span className="clock">∞</span></div><BoardShell game={gameRef.current} boardRef={boardRef} /><div className="player-row user-row"><span className="avatar user-avatar">Е</span><div><strong>Ученик</strong><small>{game?.player_color === 'black' ? 'Чёрные' : 'Белые'}</small></div><span className="clock">∞</span></div></div><aside className="move-panel"><div className="panel-tabs"><button className="selected" type="button">ХОДЫ</button><button type="button">ПАРТИЯ</button></div><div className="move-list">{moves.length ? moves.map((move, index) => <span key={`${move}-${index}`}><b>{index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : ''}</b> {move}</span>) : <p>{loading ? 'Подключаемся к серверу…' : 'Начните новую партию.'}</p>}</div><div className="game-hint"><span>✦</span><div><strong>Серверная проверка</strong><p>Нелегальный ход не будет принят backend.</p></div></div></aside></section>;
}

type ImportedPuzzle = { id: string; fen: string; moves: string[]; rating: number; ratingDeviation: number; popularity: number; plays: number; themes: string[]; gameUrl: string; openingTags: string[]; dailyDate?: string };

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

function CommunityPage() {
  const [joined, setJoined] = useState(false);
  const [student, setStudent] = useState(readStudentState);
  useEffect(() => { const refresh = () => setStudent(readStudentState()); window.addEventListener('coolchess:state', refresh); return () => window.removeEventListener('coolchess:state', refresh); }, []);
  return <section className="community-page" id="community"><div className="community-hero"><div><span className="eyebrow"><span>03</span> СООБЩЕСТВО COOLCHESS</span><h2>Решай вместе.<br /><em>Расти быстрее.</em></h2><p>Задачи становятся интереснее, когда у каждой есть соперник, рейтинг и общий результат.</p></div><div className="community-live"><span className="live-label"><i /> LIVE NOW</span><strong>12</strong><small>учеников сейчас решают задачи</small><div className="live-stack"><span>М</span><span>А</span><span>К</span><span>Е</span><b>+8</b></div></div></div><div className="community-grid"><div className="community-card race-large"><div className="card-kicker">БЛИЖАЙШЕЕ СОБЫТИЕ · 05:00</div><h3>Гонка задач</h3><p>5 минут, 10 позиций, один общий рейтинг. Точность важнее случайной скорости.</p><div className="race-track"><span className="race-line" /><i style={{ left: '63%' }}>Е</i><i style={{ left: '74%' }}>М</i><i style={{ left: '48%' }}>А</i></div><button className="button button-primary" type="button" onClick={() => setJoined(!joined)}>{joined ? 'Ты участвуешь ✓' : 'Войти в гонку'} <span>↗</span></button></div><div className="community-card online-card"><div className="community-card-title"><h3>Онлайн сейчас</h3><a href="#community">Все игроки ↗</a></div>{['Мария', 'Артём', 'Кирилл', 'Ника'].map((name, index) => <div className="community-player" key={name}><span>{name[0]}</span><div><strong>{name}</strong><small>{1240 - index * 46} · решает задачи</small></div><i /></div>)}</div><div className="community-card leaderboard-large"><div className="community-card-title"><h3>Лидерборд недели</h3><span>ПО ПЕШКАМ</span></div>{['Ника', 'Михаил', 'Егор', 'София', 'Даниил'].map((name, index) => <div className={index === 2 ? 'ranking-row current' : 'ranking-row'} key={name}><b>{String(index + 1).padStart(2, '0')}</b><span>{name}</span><small>{48 - index * 5} задач</small><strong>♟ {name === 'Егор' ? student.pawns : 980 - index * 32}</strong></div>)}</div><div className="community-card invite-card"><span className="invite-symbol">♞</span><h3>Создай свою группу</h3><p>Собери друзей или класс и сравнивайте прогресс в одной таблице.</p><button className="button button-link" type="button">Создать группу ↗</button></div></div></section>;
}

function StartLearningPanel() {
  return <section className="start-panel" id="start-learning"><div className="start-copy"><span className="eyebrow"><span>01</span> СЕГОДНЯ В COOLCHESS</span><h1>Начни с идеи.<br /><em>Увидь её на доске.</em></h1><p>Короткие объяснения, настоящие позиции и задачи, которые продолжают каждый урок. Твой маршрут уже готов — осталось сделать первый ход.</p><div className="start-stats"><span><strong>39</strong><small>тем в курсе</small></span><span><strong>6 000</strong><small>задач в базе</small></span><span><strong>12</strong><small>учеников онлайн</small></span></div><div className="flex flex-wrap items-center gap-4"><a className="button button-primary" href="#theory">Открыть первый урок <span>↘</span></a><a className="button button-link" href="#auth">Войти / регистрация ↗</a></div></div><div className="start-board"><TheoryBoard visual={lessonVisuals['opening-principles']} /></div></section>;
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

function AppV2() {
  const route = useHashRoute();
  if (route === 'auth') return <FeatureAuthPage />;
  const page = route === 'learn' || route === 'theory' ? <LearnPage /> : route === 'play' ? <ChessGame /> : route === 'puzzles' ? <LichessPuzzleLibrary /> : route === 'community' ? <CommunityPage /> : route === 'profile' ? <ProfilePage /> : <StartLearningPanel />;
  return <div className="app-shell"><header className="topbar"><a className="brand" href="#home" aria-label="CoolChess, на главную"><span className="brand-mark">♞</span><span>cool<span>chess</span></span></a><nav className="main-nav" aria-label="Основная навигация"><a className={route === 'home' ? 'active' : ''} href="#home">Главная</a><a className={route === 'learn' || route === 'theory' ? 'active' : ''} href="#learn">Учиться</a><a className={route === 'play' ? 'active' : ''} href="#play">Играть</a><a className={route === 'puzzles' ? 'active' : ''} href="#puzzles">Задачи</a><a className={route === 'community' ? 'active' : ''} href="#community">Сообщество</a></nav><div className="topbar-user"><a className="auth-nav-link" href="#auth">Войти</a><WalletBadge /><a className="profile-button" href="#profile">Мой профиль <span>↗</span></a></div><button className="menu-button" type="button" aria-label="Открыть меню">☰</button></header><main className="route-main">{page}</main><footer className="footer"><div className="footer-brand"><span className="brand-mark">♞</span><span>cool<span>chess</span></span></div><p>Шахматы, которые растут вместе с тобой.</p><small>© 2026 CoolChess. Учимся думать на несколько ходов вперёд.</small></footer></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><AuthProvider><AppV2 /></AuthProvider></StrictMode>);
