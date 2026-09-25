/** Browser entry point: starts CoolChess and connects its main screens. */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import { courseModules } from './data/course';
import { lessonContent } from './data/lessonContent';
import { lessonVisuals, type LessonVisual } from './data/lessonVisuals';
import { awardPawns } from './shared/lib/studentState';
import { AuthPage as FeatureAuthPage } from './features/auth/ui/AuthPage';
import { AuthProvider } from './features/auth/model/AuthProvider';
import { useAuth } from './features/auth/model/AuthProvider';
import * as gameApi from './features/chess-game/api/gameApi';
import type { GameResponse } from './features/chess-game/api/gameApi';
<<<<<<< HEAD
import { getRandomPuzzle, solvePuzzle, hasToken, type ServerPuzzle, type SolveResult } from './features/puzzles/api/puzzleApi';
=======
import * as puzzleApi from './features/puzzles/api/puzzleApi';
import type { Puzzle } from './features/puzzles/api/puzzleApi';
import * as leaderboardApi from './features/community/api/leaderboardApi';
import type { LeaderboardCategory, LeaderboardResponse } from './features/community/api/leaderboardApi';
import * as profileApi from './features/profile/api/profileApi';
import type { StudentProfile } from './features/profile/api/profileApi';
>>>>>>> 6faf31c4167ec0e785bc9b57b4e8fdeed406c114
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
  const gameRef = useRef<Chess | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting' | 'correct' | 'wrong' | 'error'>('loading');
  const [error, setError] = useState('');
  const [reward, setReward] = useState('');
  const [index, setIndex] = useState(0);
<<<<<<< HEAD
  const [status, setStatus] = useState<'ready' | 'correct' | 'wrong'>('ready');
  // Серверный режим: авторизованный пользователь решает задачи backend
  // (/api/puzzles) и получает серверные награды; без токена — локальный индекс.
  const [serverPuzzle, setServerPuzzle] = useState<ServerPuzzle | null>(null);
  const [serverReward, setServerReward] = useState<SolveResult | null>(null);
  const puzzle = library[index];

  const loadLocalLibrary = () => {
    fetch('/data/puzzles.json').then((response) => response.json() as Promise<ImportedPuzzle[]>).then(setLibrary).catch(() => setLibrary([]));
  };

  useEffect(() => {
    if (!hasToken()) { loadLocalLibrary(); return; }
    getRandomPuzzle()
      .then((task) => { setServerPuzzle(task); setServerReward(null); setStatus('ready'); })
      .catch(() => loadLocalLibrary());
  }, []);
=======

  const loadPuzzle = async () => {
    setStatus('loading');
    groundRef.current?.set({ movable: { color: 'white', dests: new Map() } });
    setError('');
    setReward('');
    try {
      setPuzzle(await puzzleApi.getRandomPuzzle());
      setIndex((value) => value + 1);
      setStatus('ready');
    } catch (reason) {
      setPuzzle(null);
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить задачу');
      setStatus('error');
    }
  };

  useEffect(() => { void loadPuzzle(); }, []);
>>>>>>> 6faf31c4167ec0e785bc9b57b4e8fdeed406c114

  useEffect(() => {
    if (!boardRef.current || !puzzle) return;
    const game = new Chess(puzzle.fen);
    if (puzzle.initial_move) game.move({ from: puzzle.initial_move.slice(0, 2), to: puzzle.initial_move.slice(2, 4), promotion: puzzle.initial_move[4] as 'q' | 'r' | 'b' | 'n' | undefined });
    gameRef.current = game;
    groundRef.current?.destroy();
    groundRef.current = Chessground(boardRef.current, { fen: game.fen(), coordinates: false, orientation: game.turn() === 'w' ? 'white' : 'black', turnColor: game.turn() === 'w' ? 'white' : 'black', movable: { free: false, color: game.turn() === 'w' ? 'white' : 'black', dests: legalDests(game), events: { after: (orig, dest) => { void submitMove(orig as Key, dest as Key); } } }, highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 240 } });
    return () => groundRef.current?.destroy();
  }, [puzzle]);

<<<<<<< HEAD
  // Серверный режим: позиция и проверка хода — через backend.
  useEffect(() => {
    if (!boardRef.current || !serverPuzzle) return;
    const task = serverPuzzle;
    const game = new Chess(task.fen);
    const first = task.initial_move;
    if (first) game.move({ from: first.slice(0, 2), to: first.slice(2, 4), promotion: first[4] as 'q' | 'r' | 'b' | 'n' | undefined });
    setStatus('ready');
    setServerReward(null);
    const side = game.turn() === 'w' ? 'white' : 'black';
    groundRef.current = Chessground(boardRef.current, {
      fen: game.fen(), coordinates: false, orientation: side, turnColor: side,
      movable: {
        free: false, color: side, dests: legalDests(game),
        events: {
          after: (orig, dest) => {
            void (async () => {
              const uci = `${orig}${dest}`;
              try {
                let result = await solvePuzzle(task.id, uci);
                // Backend сверяет ход строго, включая символ превращения,
                // поэтому для хода на последнюю горизонталь пробуем и вариант с ферзем.
                if (!result.is_correct && (dest[1] === '8' || dest[1] === '1')) {
                  result = await solvePuzzle(task.id, `${uci}q`);
                }
                if (!result.is_correct) {
                  setStatus('wrong');
                  groundRef.current?.set({ fen: game.fen(), turnColor: side, movable: { color: side, dests: legalDests(game) } });
                  window.setTimeout(() => setStatus('ready'), 650);
                  return;
                }
                const played = game.move({ from: orig as Square, to: dest as Square, promotion: 'q' });
                setServerReward(result);
                setStatus('correct');
                groundRef.current?.set({ fen: game.fen(), lastMove: played ? [played.from as Key, played.to as Key] : undefined, movable: { color: side, dests: new Map() } });
              } catch {
                setStatus('ready');
                groundRef.current?.set({ fen: game.fen(), turnColor: side, movable: { color: side, dests: legalDests(game) } });
              }
            })();
          },
        },
      },
      highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 180 },
    });
    return () => groundRef.current?.destroy();
  }, [serverPuzzle]);

  const tags = puzzle?.themes.filter((theme) => !['short', 'long', 'veryLong', 'master', 'masterVsMaster'].includes(theme)).slice(0, 4) ?? [];
  const serverTags = serverPuzzle?.themes.filter((theme) => !['short', 'long', 'veryLong', 'master', 'masterVsMaster'].includes(theme)).slice(0, 4) ?? [];

  const nextTask = () => {
    if (serverPuzzle) {
      setStatus('ready');
      setServerReward(null);
      getRandomPuzzle().then(setServerPuzzle).catch(() => undefined);
      return;
    }
    if (library.length) setIndex((index + 1) % library.length);
  };

  const sourceHref = (url: string) => (url.startsWith('http') ? url : `https://${url}`);

  return <section className="puzzle-section" id="puzzles"><div className="section-heading"><span className="section-number">04</span><h2>Одна задача.<br /><span>Один инсайт.</span></h2></div><div className="puzzle-layout"><div className="puzzle-board"><div ref={boardRef} className="game-board" aria-label="Доска шахматной задачи" /></div><div className="puzzle-copy">{serverPuzzle ? <><p className="eyebrow">ЗАДАЧА С СЕРВЕРА · РЕЙТИНГ {serverPuzzle.rating}</p><h3>{serverTags.map((tag) => tag.replace(/([A-Z])/g, ' $1').toLowerCase()).join(' · ') || 'Тактическая идея'}</h3><p>Позиция из базы CoolChess. После хода соперника найди лучший ответ — сервер проверит ход и начислит награду.</p><div className="puzzle-meta"><span><strong>{serverPuzzle.rating}</strong><small>рейтинг задачи</small></span><span><strong>{serverPuzzle.popularity}</strong><small>популярность</small></span></div><div className={`puzzle-feedback ${status}`}><span>{status === 'correct' ? '✓' : status === 'wrong' ? '!' : '✦'}</span><strong>{status === 'correct' ? (serverReward && serverReward.xp_earned > 0 ? `Отлично! +${serverReward.xp_earned} XP · +${serverReward.coins_earned} монет` : 'Отлично! Ход найден.') : status === 'wrong' ? 'Попробуй ещё раз.' : 'Твой ход'}</strong></div><div className="puzzle-actions"><button className="button button-primary" type="button" onClick={nextTask}>Следующая задача <span>↗</span></button>{serverPuzzle.game_url && <a className="source-link" href={sourceHref(serverPuzzle.game_url)} target="_blank" rel="noreferrer">Открыть исходную партию ↗</a>}</div></> : puzzle ? <><p className="eyebrow">ЗАДАЧА {index + 1} ИЗ {library.length}</p><h3>{tags.map((tag) => tag.replace(/([A-Z])/g, ' $1').toLowerCase()).join(' · ') || 'Тактическая идея'}</h3><p>Позиция из открытой базы Lichess. После хода соперника найди лучший ответ и проверь свою идею.</p><div className="puzzle-meta"><span><strong>{puzzle.rating}</strong><small>рейтинг задачи</small></span><span><strong>{puzzle.plays.toLocaleString('ru-RU')}</strong><small>решений</small></span></div><div className={`puzzle-feedback ${status}`}><span>{status === 'correct' ? '✓' : status === 'wrong' ? '!' : '✦'}</span><strong>{status === 'correct' ? 'Отлично! Ход найден.' : status === 'wrong' ? 'Попробуй ещё раз.' : 'Твой ход'}</strong></div><div className="puzzle-actions"><button className="button button-primary" type="button" onClick={nextTask}>Следующая задача <span>↗</span></button><a className="source-link" href={`https://${puzzle.gameUrl}`} target="_blank" rel="noreferrer">Открыть исходную партию ↗</a></div></> : <><p className="eyebrow">БАЗА ЗАДАЧ</p><h3>Загрузка задач…</h3><p>Индекс Lichess загружается из локальных данных проекта.</p></>}</div></div></section>;
=======
  const submitMove = async (orig: Key, dest: Key) => {
    if (!puzzle || !gameRef.current || status !== 'ready') return;
    const current = gameRef.current;
    const promotion = (orig[1] === '7' && dest[1] === '8') || (orig[1] === '2' && dest[1] === '1') ? 'q' : '';
    const uci = `${orig}${dest}${promotion}`;
    setStatus('submitting');
    setError('');
    groundRef.current?.set({ movable: { color: 'white', dests: new Map() } });
    try {
      const result = await puzzleApi.submitPuzzleMove(puzzle.id, uci);
      if (!result.is_correct) {
        setStatus('wrong');
        groundRef.current?.set({ fen: current.fen(), turnColor: current.turn() === 'w' ? 'white' : 'black', movable: { color: current.turn() === 'w' ? 'white' : 'black', dests: legalDests(current) } });
        window.setTimeout(() => setStatus('ready'), 700);
        return;
      }
      const played = current.move({ from: orig as Square, to: dest as Square, promotion: promotion || 'q' });
      setStatus('correct');
      setReward(result.already_solved ? 'Задача уже была решена — награда не начисляется повторно.' : `Награда: +${result.xp_earned} XP · +${result.coins_earned} ♟`);
      groundRef.current?.set({ fen: current.fen(), lastMove: played ? [played.from as Key, played.to as Key] : undefined, movable: { color: current.turn() === 'w' ? 'white' : 'black', dests: new Map() } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось проверить ход');
      setStatus('error');
      groundRef.current?.set({ fen: current.fen(), turnColor: current.turn() === 'w' ? 'white' : 'black', movable: { color: 'white', dests: new Map() } });
    }
  };

  const tags = puzzle?.themes.filter((theme) => !['short', 'long', 'veryLong', 'master', 'masterVsMaster'].includes(theme)).slice(0, 4) ?? [];
  const gameUrl = puzzle?.game_url ? (puzzle.game_url.startsWith('http') ? puzzle.game_url : `https://${puzzle.game_url}`) : null;
  return <section className="puzzle-section" id="puzzles"><div className="section-heading"><span className="section-number">04</span><h2>Одна задача.<br /><span>Один инсайт.</span></h2></div><div className="puzzle-layout"><div className="puzzle-board"><div ref={boardRef} className="game-board" aria-label="Доска шахматной задачи" /></div><div className="puzzle-copy"><p className="eyebrow">ЗАДАЧА {index}</p><h3>{tags.map((tag) => tag.replace(/([A-Z])/g, ' $1').toLowerCase()).join(' · ') || 'Тактическая идея'}</h3><p>Позиция из базы Lichess. Сервер проверит твой ход и начислит награду.</p>{puzzle && <div className="puzzle-meta"><span><strong>{puzzle.rating}</strong><small>рейтинг задачи</small></span><span><strong>{puzzle.popularity}</strong><small>популярность</small></span></div>}<div className={`puzzle-feedback ${status}`}><span>{status === 'correct' ? '✓' : status === 'wrong' ? '!' : '✦'}</span><strong>{status === 'correct' ? 'Отлично! Ход найден.' : status === 'wrong' ? 'Неверный ход — попробуй ещё.' : status === 'submitting' ? 'Проверяем ход…' : status === 'loading' ? 'Загружаем задачу…' : status === 'error' ? error : 'Твой ход'}</strong></div>{status === 'error' && <a className="source-link" href="#auth">Войти в аккаунт и повторить ↗</a>}{reward && <p className="puzzle-reward">{reward}</p>}{error && status !== 'error' && <p className="puzzle-reward">{error}</p>}<div className="puzzle-actions"><button className="button button-primary" type="button" onClick={() => void loadPuzzle()} disabled={status === 'loading' || status === 'submitting'}>Следующая задача <span>↗</span></button>{gameUrl && <a className="source-link" href={gameUrl} target="_blank" rel="noreferrer">Открыть исходную партию ↗</a>}</div></div></div></section>;
>>>>>>> 6faf31c4167ec0e785bc9b57b4e8fdeed406c114
}

function LessonPracticeBoard({ themes }: { themes: string[] }) {
  // Практика по теме сознательно остается на локальном индексе:
  // здесь разбираются многоходовые линии с ответами соперника,
  // а backend /api/puzzles проверяет только один ключевой ход.
  // Одноходовые задачи раздела «Задачи» уже идут через сервер.
  const boardRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  const gameRef = useRef<Chess | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting' | 'correct' | 'wrong' | 'error'>('loading');
  const [error, setError] = useState('');
  const [reward, setReward] = useState('');
  const [requestIndex, setRequestIndex] = useState(0);
  const themeKey = themes.join(',');

  const loadPuzzle = async (rotation = 0) => {
    setStatus('loading');
    groundRef.current?.set({ movable: { color: 'white', dests: new Map() } });
    setError('');
    setReward('');
    const theme = themes.length ? themes[(requestIndex + rotation) % themes.length] : undefined;
    try {
      const next = await puzzleApi.getRandomPuzzle(theme);
      setPuzzle(next);
      setRequestIndex((value) => value + 1);
      setStatus('ready');
    } catch (reason) {
      setPuzzle(null);
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить задачу');
      setStatus('error');
    }
  };

  useEffect(() => { void loadPuzzle(); }, [themeKey]);
  useEffect(() => {
    if (!boardRef.current || !puzzle) return;
    const game = new Chess(puzzle.fen);
    if (puzzle.initial_move) game.move({ from: puzzle.initial_move.slice(0, 2), to: puzzle.initial_move.slice(2, 4), promotion: puzzle.initial_move[4] as 'q' | 'r' | 'b' | 'n' | undefined });
    gameRef.current = game;
    groundRef.current?.destroy();
    groundRef.current = Chessground(boardRef.current, { fen: game.fen(), coordinates: false, orientation: game.turn() === 'w' ? 'white' : 'black', turnColor: game.turn() === 'w' ? 'white' : 'black', movable: { free: false, color: game.turn() === 'w' ? 'white' : 'black', dests: legalDests(game), events: { after: (orig, dest) => { void submitMove(orig as Key, dest as Key); } } }, highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 300 } });
    return () => groundRef.current?.destroy();
  }, [puzzle]);

  const submitMove = async (orig: Key, dest: Key) => {
    if (!puzzle || !gameRef.current || status !== 'ready') return;
    const current = gameRef.current;
    const promotion = (orig[1] === '7' && dest[1] === '8') || (orig[1] === '2' && dest[1] === '1') ? 'q' : '';
    setStatus('submitting');
    groundRef.current?.set({ movable: { color: 'white', dests: new Map() } });
    try {
      const result = await puzzleApi.submitPuzzleMove(puzzle.id, `${orig}${dest}${promotion}`);
      if (!result.is_correct) {
        setStatus('wrong');
        groundRef.current?.set({ fen: current.fen(), turnColor: current.turn() === 'w' ? 'white' : 'black', movable: { color: current.turn() === 'w' ? 'white' : 'black', dests: legalDests(current) } });
        window.setTimeout(() => setStatus('ready'), 700);
        return;
      }
      const played = current.move({ from: orig as Square, to: dest as Square, promotion: promotion || 'q' });
      setStatus('correct');
      setReward(result.already_solved ? 'Задача уже решена — награда не начисляется повторно.' : `+${result.xp_earned} XP · +${result.coins_earned} ♟`);
      groundRef.current?.set({ fen: current.fen(), lastMove: played ? [played.from as Key, played.to as Key] : undefined, movable: { color: current.turn() === 'w' ? 'white' : 'black', dests: new Map() } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось проверить ход');
      setStatus('error');
      groundRef.current?.set({ fen: current.fen(), turnColor: current.turn() === 'w' ? 'white' : 'black', movable: { color: 'white', dests: new Map() } });
    }
  };

  return <div className="lesson-practice"><div className="practice-header"><div><span className="block-kicker">ПРАКТИКА ПО ТЕМЕ</span><strong>{status === 'loading' ? 'Загружаем задачу…' : themes.join(', ') || 'Случайная задача'}</strong></div>{puzzle && <span className="practice-rating">{puzzle.rating} рейтинг</span>}</div><div className="practice-board-wrap"><div ref={boardRef} className="game-board" aria-label="Позиция по текущей теме" /></div><div className="practice-info"><div><strong>{status === 'correct' ? 'Ход найден ✓' : status === 'wrong' ? 'Неверный ход — попробуй ещё' : status === 'submitting' ? 'Проверяем ход…' : status === 'error' ? error : 'Найди лучший ход'}</strong><small>{reward || `Тег задачи: ${puzzle?.themes.join(', ') ?? themes.join(', ')}`}</small></div><button type="button" className="practice-next" onClick={() => void loadPuzzle(1)} disabled={status === 'loading' || status === 'submitting'}>Другая позиция ↗</button></div></div>;
}

function LichessPuzzleLibrary() {
  return <OriginalLichessPuzzleLibrary />;
}

function CommunityPage() {
  const { user } = useAuth();
  const [category, setCategory] = useState<LeaderboardCategory>('elo');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    leaderboardApi.getLeaderboard(category).then((result) => { if (active) setData(result); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить рейтинг'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [category]);

  const sortedValue = (player: LeaderboardResponse['top_players'][number]) => category === 'elo' ? `${player.elo_rating} ELO` : category === 'level' ? `ур. ${player.level}` : `${player.puzzles_solved} задач`;
  return <section className="community-page" id="community"><div className="community-hero"><div><span className="eyebrow"><span>03</span> СООБЩЕСТВО COOLCHESS</span><h2>Решай вместе.<br /><em>Расти быстрее.</em></h2><p>Сравнивай рейтинг, уровень и количество решённых задач с учениками школы.</p></div><div className="community-live"><span className="live-label">СЕРВЕРНЫЕ ДАННЫЕ</span><strong>{data?.top_players.length ?? '—'}</strong><small>учеников в текущем списке рейтинга</small><div className="live-stack"><span>♟</span><span>♞</span><span>♜</span></div></div></div><div className="community-grid"><div className="community-card race-large"><div className="card-kicker">СОРЕВНОВАНИЯ</div><h3>Гонки и PvP</h3><p>Для живых гонок, онлайн-статуса и партий друг с другом понадобится отдельный API. Пока доступен рейтинг учеников.</p><div className="race-track"><span className="race-line" /><i style={{ left: '63%' }}>♟</i><i style={{ left: '74%' }}>♞</i></div><span className="source-link">Онлайн-лобби пока не подключено</span></div><div className="community-card online-card"><div className="community-card-title"><h3>Твоя позиция</h3><span>СЕЙЧАС</span></div>{data?.my_rank ? <><div className="community-player"><span>#{data.my_rank.rank}</span><div><strong>Твой результат</strong><small>{data.my_rank.elo_rating} ELO · уровень {data.my_rank.level}</small></div><i /></div><div className="community-player"><span>♟</span><div><strong>{data.my_rank.xp} XP</strong><small>{data.my_rank.puzzles_solved} решённых задач</small></div></div></> : <p>{loading ? 'Загружаем твоё место…' : 'Войди в аккаунт, чтобы увидеть своё место.'}</p>}</div><div className="community-card leaderboard-large"><div className="community-card-title"><h3>Рейтинг учеников</h3><div className="leaderboard-filters">{(['elo', 'level', 'puzzles'] as const).map((item) => <button className={category === item ? 'selected' : ''} key={item} type="button" onClick={() => { setError(''); setCategory(item); }}>{item === 'elo' ? 'ELO' : item === 'level' ? 'Уровень' : 'Задачи'}</button>)}</div></div>{error ? <p className="puzzle-reward">{error}</p> : loading ? <p>Загружаем рейтинг…</p> : data?.top_players.length ? data.top_players.map((player) => <div className={player.user_id === user?.id ? 'ranking-row current' : 'ranking-row'} key={player.user_id}><b>{String(player.rank).padStart(2, '0')}</b><span>{player.email.split('@')[0]}</span><small>{player.puzzles_solved} задач</small><strong>{sortedValue(player)}</strong></div>) : <p>Пока нет учеников в рейтинге.</p>}</div><div className="community-card invite-card"><span className="invite-symbol">♞</span><h3>Классы и группы</h3><p>Серверный API групп пока не подключён. Сейчас можно посмотреть общий рейтинг школы.</p><span className="button button-link">Группы появятся позже</span></div></div></section>;
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

function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [rankData, setRankData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verification, setVerification] = useState('');
  const [lichessName, setLichessName] = useState('');
  const [linkMessage, setLinkMessage] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  const refreshProfile = async () => {
    setLoading(true);
    try {
      const [nextProfile, nextRank] = await Promise.all([profileApi.getStudentProfile(), leaderboardApi.getLeaderboard('puzzles')]);
      setProfile(nextProfile);
      setRankData(nextRank);
      setLichessName(nextProfile.lichess_username ?? '');
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refreshProfile(); }, []);

  const startLichessLink = async () => {
    setLinkMessage('');
    try {
      const result = await profileApi.getLichessVerificationCode();
      setVerification(result.verification_code);
      setLinkMessage(result.instructions);
    } catch (reason) {
      setLinkMessage(reason instanceof Error ? reason.message : 'Не удалось получить код');
    }
  };

  const submitLichessLink = async () => {
    setLinkBusy(true);
    setLinkMessage('');
    try {
      const result = await profileApi.syncLichessAccount(lichessName.trim());
      setLinkMessage(result.message);
      setVerification('');
      await refreshProfile();
    } catch (reason) {
      setLinkMessage(reason instanceof Error ? reason.message : 'Не удалось привязать Lichess');
    } finally {
      setLinkBusy(false);
    }
  };

  const displayName = user?.email.split('@')[0] ?? 'Ученик';
  return <section className="profile-page"><div className="profile-hero"><div className="profile-avatar-large">{displayName[0]?.toUpperCase() ?? 'У'}</div><div><span className="eyebrow"><span>06</span> ПРОФИЛЬ УЧЕНИКА</span><h1>{displayName} <em>в игре.</em></h1><p>{profile?.email ?? user?.email ?? 'Данные профиля загружаются с сервера.'}</p></div><div className="profile-wallet"><span>РЕЙТИНГ COOLCHESS</span><strong>{loading ? '…' : profile?.elo ?? '—'}</strong><small>{profile?.role ?? user?.role ?? 'ученик'}</small></div></div>{error && <p className="puzzle-reward">{error}</p>}<div className="profile-grid"><div className="profile-card streak-card"><span className="profile-card-kicker">ОПЫТ</span><strong>{loading ? '…' : rankData?.my_rank?.xp ?? '—'} XP</strong><p>накопленный опыт</p><small>Данные рейтинга сервера</small></div><div className="profile-card"><span className="profile-card-kicker">ЗАДАЧИ</span><strong>{loading ? '…' : rankData?.my_rank?.puzzles_solved ?? '—'}</strong><p>решено правильно</p><small>{rankData?.my_rank ? `Место в рейтинге: ${rankData.my_rank.rank}` : 'Пока нет статистики'}</small></div><div className="profile-card"><span className="profile-card-kicker">LICHESS</span><strong>{profile?.lichess_username ? '✓' : '—'}</strong><p>{profile?.lichess_username ?? 'Аккаунт не привязан'}</p><small>{profile?.lichess_rapid_rating ? `Rapid ${profile.lichess_rapid_rating}` : 'Подключи профиль для синхронизации'}</small></div></div><div className="profile-activity"><div><h2>Связать Lichess</h2><p>Скопируй проверочный код в описание профиля Lichess, затем укажи свой ник здесь.</p>{verification && <p><strong>{verification}</strong></p>}{linkMessage && <p>{linkMessage}</p>}</div><div className="lichess-link-controls"><input value={lichessName} onChange={(event) => setLichessName(event.target.value)} placeholder="Ник на Lichess" aria-label="Ник на Lichess" /><button className="button button-link" type="button" onClick={() => void startLichessLink()}>Получить код</button><button className="button button-primary" type="button" disabled={!lichessName.trim() || linkBusy} onClick={() => void submitLichessLink()}>{linkBusy ? 'Проверяем…' : 'Проверить и связать'}</button></div></div></section>;
}

function AppV2() {
  const route = useHashRoute();
  const { user, logout } = useAuth();
  if (route === 'auth') return <FeatureAuthPage />;
  const page = route === 'learn' || route === 'theory' ? <LearnPage /> : route === 'play' ? <ChessGame /> : route === 'puzzles' ? <LichessPuzzleLibrary /> : route === 'community' ? <CommunityPage /> : route === 'profile' ? <ProfilePage /> : <StartLearningPanel />;
  return <div className="app-shell"><header className="topbar"><a className="brand" href="#home" aria-label="CoolChess, на главную"><span className="brand-mark">♞</span><span>cool<span>chess</span></span></a><nav className="main-nav" aria-label="Основная навигация"><a className={route === 'home' ? 'active' : ''} href="#home">Главная</a><a className={route === 'learn' || route === 'theory' ? 'active' : ''} href="#learn">Учиться</a><a className={route === 'play' ? 'active' : ''} href="#play">Играть</a><a className={route === 'puzzles' ? 'active' : ''} href="#puzzles">Задачи</a><a className={route === 'community' ? 'active' : ''} href="#community">Сообщество</a></nav><div className="topbar-user">{user ? <><a className="profile-button" href="#profile">{user.email.split('@')[0]} · профиль <span>↗</span></a><button className="auth-nav-link" type="button" onClick={() => { void logout().then(() => { window.location.hash = '#home'; }); }}>Выйти</button></> : <a className="auth-nav-link" href="#auth">Войти</a>}</div><button className="menu-button" type="button" aria-label="Открыть меню">☰</button></header><main className="route-main">{page}</main><footer className="footer"><div className="footer-brand"><span className="brand-mark">♞</span><span>cool<span>chess</span></span></div><p>Шахматы, которые растут вместе с тобой.</p><small>© 2026 CoolChess. Учимся думать на несколько ходов вперёд.</small></footer></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><AuthProvider><AppV2 /></AuthProvider></StrictMode>);
