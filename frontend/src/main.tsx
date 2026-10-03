/** Browser entry point: starts CoolChess and connects its main screens. */
import { StrictMode, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import { courseModules } from './data/course';
import { lessonContent } from './data/lessonContent';
import { lessonVisuals, type LessonVisual } from './data/lessonVisuals';
import { lessonQuiz, type LessonQuizQuestion } from './data/lessonQuiz';
import { awardPawns, readStudentState } from './shared/lib/studentState';
import { AuthPage as FeatureAuthPage } from './features/auth/ui/AuthPage';
import { AuthProvider } from './features/auth/model/AuthProvider';
import { useAuth } from './features/auth/model/AuthProvider';
import * as gameApi from './features/chess-game/api/gameApi';
import type { GameResponse } from './features/chess-game/api/gameApi';
import * as puzzleApi from './features/puzzles/api/puzzleApi';
import type { Puzzle } from './features/puzzles/api/puzzleApi';
import * as leaderboardApi from './features/community/api/leaderboardApi';
import * as clanApi from './features/community/api/clanApi';
import * as pvpApi from './features/community/api/pvpApi';
import type { PvpRoomState } from './features/community/api/pvpApi';
import type { LeaderboardCategory, LeaderboardResponse } from './features/community/api/leaderboardApi';
import * as profileApi from './features/profile/api/profileApi';
import type { StudentProfile } from './features/profile/api/profileApi';
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

const maiaLevels = Array.from({ length: 19 }, (_, index) => 800 + index * 100);
const maiaAchievementKey = 'coolchess.maiaAchievements.v1';

function readMaiaAchievements() {
  try { return JSON.parse(localStorage.getItem(maiaAchievementKey) ?? '[]') as number[]; }
  catch { return []; }
}

function getMoveNotation(uciMoves: string[]) {
  const chess = new Chess();
  return uciMoves.map((uci) => {
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as 'q' | 'r' | 'b' | 'n' | undefined });
      return move?.san ?? uci;
    } catch { return uci; }
  });
}

function BoardShell({ boardRef }: { boardRef: React.RefObject<HTMLDivElement | null> }) {
  return <div className="board-frame"><div ref={boardRef} className="game-board" aria-label="Шахматная доска" /><div className="board-file-label">{['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((file) => <span key={file}>{file}</span>)}</div></div>;
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
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [maiaAchievements, setMaiaAchievements] = useState<number[]>(readMaiaAchievements);
  const [thinking, setThinking] = useState(false);
  const [difficulty, setDifficulty] = useState(1500);
  const difficultyRef = useRef(1500);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const syncBoard = (response: GameResponse) => {
    const nextGame = new Chess(response.current_fen);
    gameRef.current = nextGame;
    gameStateRef.current = response;
    setGame(response);
    setResultDismissed(false);
    setDifficulty(response.bot_difficulty);
    difficultyRef.current = response.bot_difficulty;
    setMoves(getMoveNotation(response.moves_uci));
    setViewPly(null);
    const last = response.moves_uci.at(-1);
    const canMove = response.status === 'in_progress' && ((response.player_color === 'white' && nextGame.turn() === 'w') || (response.player_color === 'black' && nextGame.turn() === 'b'));
    groundRef.current?.set({
      fen: response.current_fen,
      turnColor: nextGame.turn() === 'w' ? 'white' : 'black',
      check: response.is_check ? (nextGame.turn() === 'w' ? 'white' : 'black') : false,
      lastMove: last ? [last.slice(0, 2) as Key, last.slice(2, 4) as Key] : undefined,
      movable: { color: canMove ? response.player_color : 'white', dests: canMove ? legalDests(nextGame) : new Map() },
    });
    if (response.status === 'player_won') {
      setMaiaAchievements((current) => {
        const next = [...new Set([...current, response.bot_difficulty])].sort((a, b) => a - b);
        localStorage.setItem(maiaAchievementKey, JSON.stringify(next));
        return next;
      });
    }
  };

  const showPly = (ply: number) => {
    if (!game) return;
    const chess = new Chess();
    let lastMove: [Key, Key] | undefined;
    for (const uci of game.moves_uci.slice(0, ply)) {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as 'q' | 'r' | 'b' | 'n' | undefined });
      if (move) lastMove = [move.from as Key, move.to as Key];
    }
    const isCurrentPosition = ply === game.moves_uci.length;
    const canMove = isCurrentPosition && game.status === 'in_progress' && ((game.player_color === 'white' && chess.turn() === 'w') || (game.player_color === 'black' && chess.turn() === 'b'));
    setViewPly(isCurrentPosition ? null : ply);
    groundRef.current?.set({ fen: chess.fen(), turnColor: chess.turn() === 'w' ? 'white' : 'black', check: chess.isCheck() ? chess.turn() === 'w' ? 'white' : 'black' : false, lastMove, movable: { color: canMove ? game.player_color : 'white', dests: canMove ? legalDests(chess) : new Map() } });
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
      const response = await gameApi.makeMove(currentGame.id, `${orig}${dest}${promotion}`, currentGame.moves_uci.length === 0 ? difficultyRef.current : undefined);
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

  const newGame = async () => {
    if (!sessionStorage.getItem('coolchess.accessToken')) return;
    setLoading(true);
    setError(null);
    try {
      syncBoard(await gameApi.startGame('white', difficulty));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось начать новую партию');
    } finally {
      setLoading(false);
    }
  };

  const resign = async () => {
    const currentGame = gameStateRef.current;
    if (!currentGame?.id || currentGame.status !== 'in_progress' || thinkingRef.current) return;
    setLoading(true);
    try {
      syncBoard(await gameApi.resignGame(currentGame.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сдаться');
    } finally {
      setLoading(false);
    }
  };

  const playerToMove = game?.status === 'in_progress' && ((game.player_color === 'white' && game.current_fen.split(' ')[1] === 'w') || (game.player_color === 'black' && game.current_fen.split(' ')[1] === 'b'));
  const statusText = viewPly !== null ? `Просмотр партии · ход ${viewPly}/${moves.length}` : loading ? 'Загрузка партии…' : error ?? (thinking ? 'Maia думает…' : game?.status === 'player_won' ? 'Вы победили' : game?.status === 'bot_won' ? 'Победил бот' : game?.status === 'draw' ? 'Ничья' : playerToMove ? 'Ваш ход' : game?.status === 'in_progress' ? 'Ход Maia' : 'Начните новую партию');

  const movePairs = Array.from({ length: Math.ceil(moves.length / 2) }, (_, index) => ({
    number: index + 1,
    white: moves[index * 2],
    black: moves[index * 2 + 1],
    whitePly: index * 2 + 1,
    blackPly: index * 2 + 2,
  }));
  const fullMoveCount = Math.ceil(moves.length / 2);
  const moveCountWord = fullMoveCount % 100 >= 11 && fullMoveCount % 100 <= 14 ? 'ходов' : fullMoveCount % 10 === 1 ? 'ход' : fullMoveCount % 10 >= 2 && fullMoveCount % 10 <= 4 ? 'хода' : 'ходов';
  const playerIsWhite = game?.player_color !== 'black';
  const gameResult = game && game.status !== 'in_progress' ? game.status : null;
  const resultCopy = gameResult === 'player_won'
    ? { tone: 'win', emblem: '♛', label: 'ПАРТИЯ ЗАВЕРШЕНА', title: 'Победа!', message: `Ты обыграл Maia на ${game?.bot_difficulty} ELO.` }
    : gameResult === 'bot_won'
      ? { tone: 'loss', emblem: '♟', label: 'ПАРТИЯ ЗАВЕРШЕНА', title: 'Maia победила', message: 'Хорошая партия — посмотри историю ходов и найди момент, который можно улучшить.' }
      : gameResult === 'draw'
        ? { tone: 'draw', emblem: '½', label: 'ПАРТИЯ ЗАВЕРШЕНА', title: 'Ничья', message: 'Силы оказались равны. Можно разобрать партию или сыграть ещё раз.' }
        : gameResult === 'resigned'
          ? { tone: 'loss', emblem: '↩', label: 'ПАРТИЯ ЗАВЕРШЕНА', title: 'Партия завершена', message: 'Ты сдал эту партию. Попробуй ещё раз, когда будешь готов.' }
          : null;
  return <section className="game-section" id="play">
    <div className="game-intro">
      <p className="eyebrow"><span>03</span> ИГРА ПРОТИВ MAIA</p><h2>Настоящая<br /><span>партия.</span></h2>
      <p>Сыграй партию с Maia. Выбери силу соперника и разбирай каждый ход после игры.</p>
      <label className="maia-slider"><span><b>Сила Maia</b><strong>{difficulty} ELO</strong></span><input type="range" min="800" max="2600" step="100" value={difficulty} onChange={(event) => { const value = Number(event.target.value); difficultyRef.current = value; setDifficulty(value); }} disabled={loading || thinking || Boolean(game?.moves_uci.length)} /><small>{game?.moves_uci.length ? 'Сила в этой партии уже зафиксирована' : 'Выбранная сила применится с первого хода'}</small></label>
      <div className="game-controls"><button className="button button-primary" type="button" onClick={() => void newGame()} disabled={loading || thinking}>Новая партия <span>↗</span></button>{game?.status === 'in_progress' && <button className="button button-link" type="button" onClick={() => void resign()} disabled={loading || thinking}>Сдаться</button>}<span className="engine-status"><i className={thinking ? 'thinking' : ''} /> {statusText}</span>{(error?.includes('401') || error?.includes('Сначала войдите')) && <a className="source-link" href="#auth">Войти в аккаунт ↗</a>}</div>
      <div className="maia-achievements"><div className="achievement-heading"><strong>Уровни Maia</strong><span>{maiaAchievements.length}/{maiaLevels.length} побед</span></div><div className="maia-level-map" aria-label="Пройденные уровни Maia">{maiaLevels.map((level) => <span className={maiaAchievements.includes(level) ? 'earned' : ''} title={`${level} ELO${maiaAchievements.includes(level) ? ' · победа' : ''}`} key={level}>{maiaAchievements.includes(level) ? '✓' : level}</span>)}</div></div>
    </div>
    <div className="game-layout"><div className="player-row"><span className="avatar black-avatar">♞</span><div><strong>CoolChess Maia</strong><small>{game?.bot_difficulty ?? difficulty} ELO · {playerIsWhite ? 'чёрные' : 'белые'}</small></div><span className="clock">{game?.status === 'in_progress' && !playerToMove ? 'ХОД' : 'MAIA'}</span></div><div className="game-board-stage"><BoardShell boardRef={boardRef} />{resultCopy && !resultDismissed && <div className={`game-result-overlay ${resultCopy.tone}`} role="region" aria-label={`Результат партии: ${resultCopy.title}`}><div className="game-result-card"><div className="game-result-confetti" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</div><span className="game-result-emblem" aria-hidden="true">{resultCopy.emblem}</span><span className="game-result-label">{resultCopy.label}</span><h3>{resultCopy.title}</h3><p>{resultCopy.message}</p><div className="game-result-rewards"><span><strong>{game!.elo_delta >= 0 ? '+' : ''}{game!.elo_delta}</strong><small>ELO</small></span><span><strong>+{game!.xp_earned}</strong><small>опыт</small></span><span><strong>+{game!.coins_earned} ♟</strong><small>награда</small></span></div><div className="game-result-actions"><button className="button button-primary" type="button" onClick={() => void newGame()}>Новая партия ↗</button><button className="game-result-review" type="button" onClick={() => setResultDismissed(true)}>Разобрать ходы</button></div></div></div>}</div><div className="player-row user-row"><span className="avatar user-avatar">Е</span><div><strong>Ученик</strong><small>{playerIsWhite ? 'Белые' : 'Чёрные'} · {viewPly !== null ? `просмотр ${viewPly}/${moves.length}` : playerToMove ? 'ваш ход' : 'ожидание'}</small></div><span className="clock">{game?.status === 'in_progress' && playerToMove ? 'ХОД' : 'ВЫ'}</span></div></div>
    <aside className="move-panel">
      <div className="move-panel-heading">
        <div className="move-title-wrap"><span className="move-title-icon" aria-hidden="true">♟</span><span><strong>Ходы партии</strong></span></div>
        <span className="move-count">{fullMoveCount} <small>{moveCountWord}</small></span>
      </div>
      <div className="move-columns" aria-label="Список ходов">
        <div className="move-column white-move-column"><strong><i className="move-side-dot white-side-dot" />{playerIsWhite ? 'Вы · белые' : 'Maia · белые'}</strong>{movePairs.map((pair) => <button type="button" key={pair.number} className={(viewPly ?? moves.length) === pair.whitePly ? 'active' : ''} onClick={() => showPly(pair.whitePly)} disabled={!pair.white}><small>{pair.number}.</small>{pair.white ?? '—'}</button>)}</div>
        <div className="move-column black-move-column"><strong><i className="move-side-dot black-side-dot" />{playerIsWhite ? 'Maia · чёрные' : 'Вы · чёрные'}</strong>{movePairs.map((pair) => <button type="button" key={pair.number} className={(viewPly ?? moves.length) === pair.blackPly ? 'active' : ''} onClick={() => showPly(pair.blackPly)} disabled={!pair.black}><small>{pair.number}…</small>{pair.black ?? '—'}</button>)}</div>
      </div>
      {moves.length > 0 && <div className="move-panel-actions"><button className={`move-start${viewPly === 0 ? ' active' : ''}`} type="button" onClick={() => showPly(0)}>Начало партии</button><button className="move-current" type="button" onClick={() => showPly(moves.length)} disabled={viewPly === null}>К текущей позиции</button></div>}
      {moves.length === 0 && <p className="move-empty"><span aria-hidden="true">♘</span>{loading ? 'Подключаемся к серверу…' : 'Начните партию — здесь появится её разбор.'}</p>}
    </aside>
  </section>;
}

function TheoryBoard({ visual, onLineViewed, kicker }: { visual: LessonVisual; onLineViewed?: () => void; kicker?: string }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  const gameRef = useRef(new Chess(visual.fen));
  const [step, setStep] = useState(0);
  // Мини-игра «найди поле»: клики по доске проверяем сами по координатам
  // (доска всегда в ориентации белых). Ответ прячем, пока не найден:
  // стрелки и подсветка с загаданным полем появляются только после успеха.
  const [askSolved, setAskSolved] = useState(false);
  const [askMiss, setAskMiss] = useState<string | null>(null);
  const [askHinted, setAskHinted] = useState(false);
  const askHidden = Boolean(visual.askSquare) && !askSolved;
  const boardShapes = () => {
    const arrows: { orig: Key; dest: Key; brush: 'green' | 'blue' }[] = (visual.arrows ?? [])
      .filter(([from, to]) => !askHidden || (from !== visual.askSquare && to !== visual.askSquare))
      .map(([from, to]) => ({ orig: from as Key, dest: to as Key, brush: 'green' as const }));
    if (askHinted && visual.askSquare && visual.askFrom) arrows.push({ orig: visual.askFrom as Key, dest: visual.askSquare as Key, brush: 'blue' as const });
    const marks: { orig: Key; brush: 'yellow' }[] = (visual.highlight ?? [])
      .filter((square) => !askHidden || square !== visual.askSquare)
      .map((square) => ({ orig: square as Key, brush: 'yellow' as const }));
    if (askHinted && visual.askSquare) marks.push({ orig: visual.askSquare as Key, brush: 'yellow' as const });
    return [...arrows, ...marks];
  };
  useEffect(() => { groundRef.current?.set({ drawable: { shapes: boardShapes() } }); }, [askSolved, askHinted, visual]);
  useEffect(() => { setAskSolved(false); setAskMiss(null); setAskHinted(false); }, [visual]);
  const boardClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!visual.askSquare || askSolved || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const file = Math.floor(((event.clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * 8);
    if (file < 0 || file > 7 || row < 0 || row > 7) return;
    const square = `${'abcdefgh'[file]}${8 - row}`;
    if (square === visual.askSquare) setAskSolved(true);
    else setAskMiss(square);
  };
  const resetBoard = () => { gameRef.current = new Chess(visual.fen); setStep(0); setAskSolved(false); setAskMiss(null); setAskHinted(false); groundRef.current?.set({ fen: visual.fen, lastMove: undefined, turnColor: 'white', movable: { color: 'white', dests: new Map() } }); };
  const advance = () => {
    const uci = visual.moves[step];
    if (!uci) return;
    const move = gameRef.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as 'q' | 'r' | 'b' | 'n' | undefined });
    if (move) {
      const nextStep = step + 1;
      setStep(nextStep);
      groundRef.current?.set({ fen: gameRef.current.fen(), lastMove: [move.from as Key, move.to as Key], turnColor: gameRef.current.turn() === 'w' ? 'white' : 'black' });
      if (nextStep >= visual.moves.length) onLineViewed?.();
    }
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
      if (lineStep >= visual.moves.length) { window.clearInterval(timer); onLineViewed?.(); }
    }, 720);
  };
  useEffect(() => {
    if (!boardRef.current) return;
    groundRef.current = Chessground(boardRef.current, { fen: visual.fen, coordinates: true, orientation: 'white', movable: { free: false, color: 'white', dests: new Map() }, highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 260 } });
    groundRef.current.set({ drawable: { shapes: boardShapes() } });
    const resizeObserver = new ResizeObserver(() => groundRef.current?.redrawAll());
    resizeObserver.observe(boardRef.current);
    return () => {
      resizeObserver.disconnect();
      groundRef.current?.destroy();
      groundRef.current = null;
    };
  }, [visual]);
  useEffect(() => resetBoard(), [visual]);
  const explanation = step > 0 ? visual.stepNotes?.[step - 1] ?? visual.caption : visual.caption;
  return <div className="theory-board-card"><div className="theory-board-top"><div><span className="block-kicker">{kicker ?? 'РАЗБЕРЁМ НА ДОСКЕ'}</span><strong>{visual.title}</strong></div>{visual.moves.length > 0 && <span className="theory-progress">{step} <i>/</i> {visual.moves.length} ходов</span>}</div><div className="theory-board-experience"><div className="theory-board-col"><div className="theory-board"><div ref={boardRef} className={`game-board theory-demo-board${visual.askSquare ? ' is-prompt' : ''}`} onClick={boardClick} aria-label={`Теоретическая позиция: ${visual.title}`} /></div><div className="focus-fields">{visual.focus.split(' ').map((field) => <span key={field}>{field}</span>)}</div></div><div className="theory-side-stack"><div className="theory-explain-card"><span className="theory-card-kicker">{step > 0 ? `ПОСЛЕ ХОДА ${step}` : 'СМОТРИ НА ДОСКУ'}</span><p>{explanation}</p>{visual.moves.length > 0 && <div className="theory-mini-progress"><i><b style={{ width: `${Math.min((step / visual.moves.length) * 100, 100)}%` }} /></i><small>{step === visual.moves.length ? 'Линия разобрана ✓' : `${visual.moves.length - step} ${visual.moves.length - step === 1 ? 'ход' : 'хода'} осталось`}</small></div>}</div>{visual.askSquare && <div className={`demo-ask${askSolved ? ' solved' : ''}${askMiss ? ' has-miss' : ''}`} aria-live="polite"><span className="demo-ask-icon" aria-hidden="true">{askSolved ? '✓' : askHinted ? '↗' : '✦'}</span><div className="demo-ask-copy"><span className="theory-card-kicker">{askSolved ? 'ОТЛИЧНО' : 'ТВОЙ ХОД'}</span><p>{askSolved ? 'Нашёл нужное поле! Теперь идея видна на доске.' : visual.askText}</p>{!askSolved && askMiss && <small>Поле {askMiss} не подходит. Попробуй ещё или посмотри подсказку.</small>}{!askSolved && <button type="button" onClick={() => setAskHinted((shown) => !shown)}>{askHinted ? 'Скрыть подсказку' : visual.askFrom ? 'Показать стрелку' : 'Подсветить поле'} <span aria-hidden="true">{askHinted ? '−' : '↗'}</span></button>}</div></div>}</div></div><div className="theory-board-bottom"><div>{visual.moves.length > 0 && <><button className="theory-control" type="button" onClick={resetBoard}>Сначала</button><button className="theory-control" type="button" onClick={playLine}>Показать линию</button></>}{visual.moves.length > 0 && (step >= visual.moves.length ? <span className="theory-line-done">Разбор просмотрен ✓</span> : <button className="button button-primary" type="button" onClick={advance}>Следующий ход ↗</button>)}</div></div></div>;
}

// Прогресс квизов «Проверка знаний»: помним, в каких темах ученик
// верно ответил на все вопросы. Практика разблокируется только после квиза.
const QUIZ_STORE_KEY = 'coolchess.quiz.v1';

function readQuizStore(): Record<string, boolean> {
  try {
    const raw = typeof window === 'undefined' ? null : localStorage.getItem(QUIZ_STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>;
  } catch {
    // Битое хранилище игнорируем.
  }
  return {};
}

function writeQuizStore(topicId: string) {
  try {
    const store = readQuizStore();
    store[topicId] = true;
    localStorage.setItem(QUIZ_STORE_KEY, JSON.stringify(store));
  } catch {
    // Не сохранилось — квиз просто придётся пройти заново.
  }
}

// Черновик ответов квиза: чтобы переключение вкладок не сжигало прогресс,
// храним выбранные варианты и вердикты в localStorage (сброс — при смене темы
// компонент монтируется заново через key, а внутри темы состояние живёт).
const QUIZ_ANSWERS_KEY = 'coolchess.quiz.answers.v1';

type QuizDraft = { picked: Record<number, number>; checked: Record<number, boolean> };

function readQuizDraft(topicId: string): QuizDraft {
  try {
    const raw = typeof window === 'undefined' ? null : localStorage.getItem(QUIZ_ANSWERS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') {
      const entry = (parsed as Record<string, QuizDraft>)[topicId];
      if (entry && typeof entry === 'object') return { picked: entry.picked ?? {}, checked: entry.checked ?? {} };
    }
  } catch {
    // Игнорируем битое хранилище.
  }
  return { picked: {}, checked: {} };
}

function writeQuizDraft(topicId: string, draft: QuizDraft) {
  try {
    const raw = localStorage.getItem(QUIZ_ANSWERS_KEY);
    const store: Record<string, QuizDraft> = raw ? JSON.parse(raw) : {};
    store[topicId] = draft;
    localStorage.setItem(QUIZ_ANSWERS_KEY, JSON.stringify(store));
  } catch {
    // Не сохранилось — ответы просто не переживут перезагрузку.
  }
}

// Статичная доска для вопроса квиза: только позиция, без ходов.
function QuizBoard({ fen, label }: { fen: string; label: string }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  useEffect(() => {
    if (!boardRef.current) return;
    groundRef.current = Chessground(boardRef.current, {
      fen, coordinates: true, orientation: 'white',
      movable: { free: false, color: 'white', dests: new Map() },
      highlight: { lastMove: false, check: true },
      animation: { enabled: false },
    });
    return () => groundRef.current?.destroy();
  }, [fen]);
  return <div className="quiz-board-wrap"><div ref={boardRef} className="game-board" aria-label={label} /></div>;
}

function LessonQuiz({ topicId, topicTitle, boardFen, questions, onPassed, onGoPractice }: {
  topicId: string;
  topicTitle: string;
  boardFen: string;
  questions: LessonQuizQuestion[];
  onPassed: () => void;
  onGoPractice?: () => void;
}) {
  // Ответы по индексу вопроса: выбранный вариант + вердикт проверки.
  // Черновик переживает переключение вкладок (localStorage), сброс — со сменой темы (key).
  const [picked, setPicked] = useState<Record<number, number>>(() => readQuizDraft(topicId).picked);
  const [checked, setChecked] = useState<Record<number, boolean>>(() => readQuizDraft(topicId).checked);
  const [passed, setPassed] = useState(() => readQuizStore()[topicId] ?? false);
  useEffect(() => { writeQuizDraft(topicId, { picked, checked }); }, [topicId, picked, checked]);
  const correctCount = questions.filter((question, index) => checked[index] && picked[index] === question.correct).length;
  const allCorrect = questions.length > 0 && correctCount === questions.length;
  useEffect(() => {
    if (allCorrect && !passed) {
      writeQuizStore(topicId);
      setPassed(true);
      onPassed();
    }
  }, [allCorrect]);
  const letters = ['А', 'Б', 'В', 'Г'];
  return <div className="quiz-card"><div className="quiz-heading"><div><h2>Понял идею?<br /><em>Проверь себя.</em></h2><p>Ответь верно на все вопросы — и откроется практика. Ошибка — не страшно: читай пояснение и пробуй снова.</p></div></div><div className="quiz-layout"><QuizBoard fen={boardFen} label={`Позиция к вопросам темы: ${topicTitle}`} /><div className="quiz-questions">{questions.map((question, index) => {
    const wasChecked = checked[index] ?? false;
    const isRight = wasChecked && picked[index] === question.correct;
    return <div className={`quiz-question${wasChecked ? (isRight ? ' right' : ' wrong') : ''}`} key={`${topicId}-q${index}`}><strong><span>{index + 1}</span>{question.prompt}</strong><div className="quiz-options">{question.options.map((option, optionIndex) => {
      const selected = picked[index] === optionIndex;
      const revealRight = wasChecked && optionIndex === question.correct;
      return <button type="button" key={optionIndex} disabled={wasChecked && isRight} className={`${selected ? 'selected' : ''}${revealRight ? ' correct' : ''}${selected && wasChecked && !isRight ? ' wrong' : ''}`} onClick={() => {
        if (wasChecked && isRight) return;
        setPicked((current) => ({ ...current, [index]: optionIndex }));
        setChecked((current) => ({ ...current, [index]: true }));
      }}><i>{letters[optionIndex] ?? optionIndex + 1}</i>{option}</button>;
    })}</div>{wasChecked && (isRight ? <p className="quiz-feedback ok">Верно ✓ {question.explanation}</p> : <p className="quiz-feedback bad">Пока неверно. {question.explanation} <button type="button" onClick={() => setChecked((current) => ({ ...current, [index]: false }))}>Попробовать снова</button></p>)}</div>;
  })}</div></div>{passed && <div className="quiz-unlocked"><span>Проверка пройдена ✓ — шаг практики разблокирован.</span>{onGoPractice && <button className="button button-primary" type="button" onClick={onGoPractice}>К практике →</button>}</div>}</div>;
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
  const [taskType, setTaskType] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('beginner');
  const [progressFilter, setProgressFilter] = useState<'unsolved' | 'solved' | 'all'>('unsolved');
  const [solvedByType, setSolvedByType] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('coolchess.puzzleTypeProgress.v1') ?? '{}'); }
    catch { return {}; }
  });

  const loadPuzzle = async () => {
    setStatus('loading');
    groundRef.current?.set({ movable: { color: 'white', dests: new Map() } });
    setError('');
    setReward('');
    try {
      const search = taskSearch.trim().toLocaleLowerCase('ru');
      const russianThemes: Array<[string, string]> = [['мат в 1', 'mateIn1'], ['мат за 1', 'mateIn1'], ['мат в 2', 'mateIn2'], ['мат за 2', 'mateIn2'], ['вилка', 'fork'], ['двойной удар', 'fork'], ['связка', 'pin'], ['лучший ход', 'quietMove'], ['эндшпиль', 'endgame'], ['защита', 'defensiveMove'], ['мат', 'mate']];
      const searchTheme = russianThemes.find(([phrase]) => search.includes(phrase))?.[1] ?? search;
      const theme = search ? searchTheme : taskType || undefined;
      setPuzzle(await puzzleApi.getRandomPuzzle({ theme, difficulty: difficultyFilter === 'all' ? undefined : difficultyFilter as 'beginner' | 'intermediate' | 'advanced' | 'master' | 'grandmaster', progress: progressFilter }));
      setIndex((value) => value + 1);
      setStatus('ready');
    } catch (reason) {
      setPuzzle(null);
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить задачу');
      setStatus('error');
    }
  };

  useEffect(() => { void loadPuzzle(); }, []);

  useEffect(() => {
    if (!boardRef.current || !puzzle) return;
    const game = new Chess(puzzle.fen);
    let lastMove: [Key, Key] | undefined;
    if (puzzle.initial_move) {
      try {
        const played = game.move({ from: puzzle.initial_move.slice(0, 2), to: puzzle.initial_move.slice(2, 4), promotion: puzzle.initial_move[4] as 'q' | 'r' | 'b' | 'n' | undefined });
        if (played) lastMove = [played.from as Key, played.to as Key];
      } catch {
        lastMove = undefined;
      }
    }
    gameRef.current = game;
    groundRef.current?.destroy();
    groundRef.current = Chessground(boardRef.current, { fen: game.fen(), coordinates: false, orientation: game.turn() === 'w' ? 'white' : 'black', turnColor: game.turn() === 'w' ? 'white' : 'black', lastMove, movable: { free: false, color: game.turn() === 'w' ? 'white' : 'black', dests: legalDests(game), events: { after: (orig, dest) => { void submitMove(orig as Key, dest as Key); } } }, highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 240 } });
    return () => groundRef.current?.destroy();
  }, [puzzle]);

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
      if (!result.already_solved) {
        const progressKey = taskType || 'all';
        setSolvedByType((currentProgress) => {
          const nextProgress = { ...currentProgress, [progressKey]: (currentProgress[progressKey] ?? 0) + 1 };
          localStorage.setItem('coolchess.puzzleTypeProgress.v1', JSON.stringify(nextProgress));
          return nextProgress;
        });
      }
      setReward(result.already_solved ? 'Задача уже была решена — награда не начисляется повторно.' : `Награда: +${result.xp_earned} XP · +${result.coins_earned} ♟`);
      groundRef.current?.set({ fen: current.fen(), lastMove: played ? [played.from as Key, played.to as Key] : undefined, movable: { color: current.turn() === 'w' ? 'white' : 'black', dests: new Map() } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось проверить ход');
      setStatus('error');
      groundRef.current?.set({ fen: current.fen(), turnColor: current.turn() === 'w' ? 'white' : 'black', movable: { color: 'white', dests: new Map() } });
    }
  };

  const tags = puzzle?.themes.filter((theme) => !['short', 'long', 'veryLong', 'master', 'masterVsMaster'].includes(theme)).slice(0, 4) ?? [];
  const puzzleIdea = tags.includes('mateIn1') || tags.includes('mateIn2') || tags.includes('mateIn3')
    ? 'Найди форсированный мат'
    : tags.includes('fork')
      ? 'Найди двойной удар'
      : tags.includes('pin')
        ? 'Используй связку фигуры'
        : tags.includes('skewer')
          ? 'Найди сквозной удар'
          : tags.includes('endgame')
            ? 'Найди лучший ход в эндшпиле'
            : tags.includes('defensiveMove')
              ? 'Найди единственный защитный ход'
              : 'Найди лучший ход в позиции';
  const gameUrl = puzzle?.game_url ? (puzzle.game_url.startsWith('http') ? puzzle.game_url : `https://${puzzle.game_url}`) : null;
  const needsAuth = /401|авторизац|войдите|войти/i.test(error);
  return <section className="puzzle-section" id="puzzles"><div className="section-heading"><span className="section-number">04</span><h2>Решай по шагам.<br /><span>Расти в тактике.</span></h2><p>Начни с простых задач, выбери тему и следи за своими решениями.</p></div><div className="puzzle-workshop"><div className="puzzle-filter-heading"><div><strong>Мастерская задач</strong><small>Выбери тему, сложность и статус</small></div><label className="puzzle-search">⌕<input value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadPuzzle(); }} placeholder="Поиск по теме: мат, вилка…" aria-label="Поиск задач по теме" /></label></div><div className="puzzle-type-tabs">{[{ tag: '', label: 'Все задачи' }, { tag: 'mateIn1', label: 'Мат в 1' }, { tag: 'mateIn2', label: 'Мат в 2' }, { tag: 'fork', label: 'Вилка' }, { tag: 'pin', label: 'Связка' }, { tag: 'quietMove', label: 'Лучший ход' }].map((item) => <button type="button" className={taskType === item.tag ? 'selected' : ''} key={item.tag || 'all'} onClick={() => { setTaskType(item.tag); setTaskSearch(''); }}><span>{item.label}</span><small>{solvedByType[item.tag || 'all'] ?? 0} / 10 до цели</small><i><b style={{ width: `${Math.min((solvedByType[item.tag || 'all'] ?? 0) * 10, 100)}%` }} /></i></button>)}</div><div className="puzzle-filter-row"><label>Сложность<select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)}><option value="beginner">Начинающий · до 1200</option><option value="intermediate">Средний · 1200–1599</option><option value="advanced">Продвинутый · 1600–1999</option><option value="master">Мастер · 2000–2399</option><option value="grandmaster">Гроссмейстер · 2400+</option><option value="all">Любая</option></select></label><label>Решение<select value={progressFilter} onChange={(event) => setProgressFilter(event.target.value as 'unsolved' | 'solved' | 'all')}><option value="unsolved">Не решённые</option><option value="solved">Решённые</option><option value="all">Все задачи</option></select></label><button className="button button-primary" type="button" onClick={() => void loadPuzzle()} disabled={status === 'loading' || status === 'submitting'}>Найти задачу ↗</button></div></div><div className="puzzle-layout"><div className={`puzzle-board${puzzle ? '' : ' is-empty'}`}><div ref={boardRef} className="game-board" aria-label="Доска шахматной задачи" />{!puzzle && <div className="puzzle-board-state"><span className="puzzle-board-state-icon">{status === 'loading' ? '♟' : '!'}</span><strong>{status === 'loading' ? 'Загружаем задачу…' : 'Подходящих задач нет'}</strong><small>{status === 'error' ? needsAuth ? 'Войди, чтобы загружать задачи и сохранять решения.' : 'Попробуй изменить тему, сложность или статус решения.' : 'Подключаем шахматную позицию к серверу.'}</small>{status === 'error' && (needsAuth ? <a className="source-link" href="#auth">Войти и решать задачи ↗</a> : <button className="source-link" type="button" onClick={() => void loadPuzzle()}>Повторить с этими фильтрами ↗</button>)}</div>}</div><div className="puzzle-copy"><p className="eyebrow">ЗАДАЧА {index}</p><h3>{puzzleIdea}</h3><p className="puzzle-instruction"><strong>Твоя задача:</strong> найди лучший ход за свою сторону и покажи, какую угрозу или выгоду он создаёт.</p>{puzzle && <div className="puzzle-meta"><span><strong>{puzzle.rating}</strong><small>сложность позиции</small></span><span><strong>{puzzle.popularity}</strong><small>популярность</small></span></div>}<div className={`puzzle-feedback ${status}`}><span>{status === 'correct' ? '✓' : status === 'wrong' ? '!' : '✦'}</span><strong>{status === 'correct' ? 'Отлично! Ход найден.' : status === 'wrong' ? 'Неверный ход — попробуй ещё.' : status === 'submitting' ? 'Проверяем ход…' : status === 'loading' ? 'Загружаем задачу…' : status === 'error' ? error : 'Твой ход'}</strong></div>{status === 'error' && needsAuth && <a className="source-link" href="#auth">Войти в аккаунт и повторить ↗</a>}{reward && <p className="puzzle-reward">{reward}</p>}{error && status !== 'error' && <p className="puzzle-reward">{error}</p>}<div className="puzzle-actions"><button className="button button-primary" type="button" onClick={() => void loadPuzzle()} disabled={status === 'loading' || status === 'submitting'}>Следующая задача <span>↗</span></button>{gameUrl && <a className="source-link" href={gameUrl} target="_blank" rel="noreferrer">Открыть исходную партию ↗</a>}</div></div></div></section>;
}

// Сколько уникальных задач нужно решить, чтобы закрыть практику темы.
// Зачёт идёт только за первое верное решение каждой позиции (повторы
// сервер и так не оплачивает: already_solved), прогресс храним локально,
// чтобы переживал перезагрузку и нельзя было «проходить» тему дважды.
const PRACTICE_QUOTA = 3;
// Разовый бонус за закрытую практику темы (помимо XP за каждую задачу).
const PRACTICE_BONUS = 30;
const PRACTICE_STORE_KEY = 'coolchess.practice.v1';

function readPracticeStore(): Record<string, string[]> {
  try {
    const raw = typeof window === 'undefined' ? null : localStorage.getItem(PRACTICE_STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string[]>;
  } catch {
    // Битое хранилище игнорируем и начинаем с чистого прогресса.
  }
  return {};
}

function writePracticeStore(topicId: string, ids: string[]) {
  try {
    const store = readPracticeStore();
    store[topicId] = ids.slice(-3 * PRACTICE_QUOTA);
    localStorage.setItem(PRACTICE_STORE_KEY, JSON.stringify(store));
  } catch {
    // Не удалось сохранить — практика просто не переживёт перезагрузку.
  }
}

// Трекер теории: помним, досмотрел ли ученик разбор линии до конца.
const DEMO_STORE_KEY = 'coolchess.demo.v1';

function readDemoStore(): Record<string, boolean> {
  try {
    const raw = typeof window === 'undefined' ? null : localStorage.getItem(DEMO_STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>;
  } catch {
    // Игнорируем битое хранилище.
  }
  return {};
}

function writeDemoStore(topicId: string) {
  try {
    const store = readDemoStore();
    store[topicId] = true;
    localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(store));
  } catch {
    // Игнорируем ошибки записи.
  }
}

// Офлайн-запас практики: если сервер не отдал задачу (пустая БД, сеть),
// берём позицию из public/data/puzzles.json и проверяем ход на устройстве.
// Формат совпадает с выдачей Lichess: moves[0] — показанный ход соперника,
// moves[1] — верное решение.
type LocalPracticePuzzle = {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  popularity: number;
  themes: string[];
  gameUrl: string | null;
};

let localPracticeCache: Promise<LocalPracticePuzzle[]> | null = null;

function loadLocalPracticePuzzles(): Promise<LocalPracticePuzzle[]> {
  if (!localPracticeCache) {
    localPracticeCache = fetch('data/puzzles.json').then((response) => {
      if (!response.ok) throw new Error('no local puzzles');
      return response.json() as Promise<LocalPracticePuzzle[]>;
    }).catch((reason) => {
      localPracticeCache = null;
      throw reason;
    });
  }
  return localPracticeCache;
}

// Локальная оценка за задачу по тирам сервера (только для отображения:
// серверные XP/монеты начисляет лишь онлайн-проверка).
function offlinePracticeXp(rating: number): number {
  if (rating <= 1199) return 15;
  if (rating <= 1599) return 30;
  if (rating <= 1999) return 50;
  if (rating <= 2399) return 80;
  return 120;
}

function samePracticeMove(actual: string, expected: string): boolean {
  // Совпадение полных UCI; если в эталоне нет превращения — сравниваем 4 символа.
  return expected.length === 5 ? actual === expected : actual.slice(0, 4) === expected.slice(0, 4);
}

function LessonPracticeBoard({ themes, topicId }: { themes: string[]; topicId: string }) {
  // Практика по теме идёт через сервер: задача подбирается по тегу темы,
  // ход соперника уже показан на доске, backend проверяет ключевой ход
  // и начисляет XP/монеты за первое верное решение.
  const boardRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  const gameRef = useRef<Chess | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting' | 'correct' | 'wrong' | 'error'>('loading');
  const [error, setError] = useState('');
  const [requestIndex, setRequestIndex] = useState(0);
  // Защита от гонок: поздний ответ медленного запроса не затирает свежий.
  const requestIdRef = useRef(0);
  // Свежий статус для колбэка доски (замыкание chessground иначе видит старый).
  const statusRef = useRef(status);
  statusRef.current = status;
  // Офлайн-режим: верное решение локальной задачи (null — проверяет сервер).
  const solutionRef = useRef<string | null>(null);
  // Счёт ведём через ref, а не через setState-апдейтер: апдейтеры выполняются
  // позже вызова, и запись/событие по ним отставали на один ход.
  const solvedRef = useRef<string[]>(readPracticeStore()[topicId] ?? []);
  const [, setSolvedTick] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  // Если тема уже была закрыта раньше — сразу свободный режим:
  // доска доступна, но повторного «прохождения» и дубля наград нет.
  // Разовый бонус за практику уже забран — сразу свободный режим.
  const [practiceBonus, setPracticeBonus] = useState(() => readStudentState().claimed.includes(`practice:${topicId}`));
  const themeKey = themes.join(',');
  const solvedCount = Math.min(solvedRef.current.length, PRACTICE_QUOTA);
  // Пока бонус не забран — показываем экран прохождения; после — свободный режим.
  const done = solvedRef.current.length >= PRACTICE_QUOTA && !practiceBonus;
  // Сообщаем дереву тем, что квота закрыта, чтобы пункт загорелся зелёным.
  useEffect(() => { if (done) window.dispatchEvent(new Event('coolchess:practice')); }, [done]);
  // Бонус за практику — один раз на тему: claimed-защита awardPawns
  // не даст забрать его повторно, событие обновит дерево тем.
  // Бонус начисляется прямо в обработчике хода (см. выше).

  const loadPuzzle = async (rotation = 0) => {
    const requestId = (requestIdRef.current += 1);
    setStatus('loading');
    groundRef.current?.set({ movable: { color: 'white', dests: new Map() } });
    setError('');
    const theme = themes.length ? themes[(requestIndex + rotation) % themes.length] : undefined;
    try {
      const next = await puzzleApi.getRandomPuzzle(theme);
      if (requestId !== requestIdRef.current) return;
      solutionRef.current = null;
      setPuzzle(next);
      setRequestIndex((value) => value + 1);
      setStatus('ready');
    } catch (reason) {
      if (requestId !== requestIdRef.current) return;
      const message = reason instanceof Error ? reason.message : '';
      if (/401|авторизац|войдите|войти/i.test(message)) {
        // Без входа серверные задачи и награды недоступны — зовём войти.
        solutionRef.current = null;
        setPuzzle(null);
        setError(reason instanceof Error ? reason.message : 'Не удалось загрузить задачу');
        setStatus('error');
        return;
      }
      // Сервер пуст или недоступен — играем локальный запас без серверных наград.
      try {
        const all = await loadLocalPracticePuzzles();
        if (requestId !== requestIdRef.current) return;
        const solvedIds = new Set(readPracticeStore()[topicId] ?? []);
        const themed = all.filter((item) => !theme || item.themes.includes(theme));
        const fresh = themed.filter((item) => !solvedIds.has(`local:${item.id}`));
        const pool = fresh.length ? fresh : themed;
        if (!pool.length) throw new Error('empty pool');
        const candidate = pool[Math.floor(Math.random() * pool.length)];
        solutionRef.current = candidate.moves[1] ?? null;
        setPuzzle({
          id: `local:${candidate.id}`,
          fen: candidate.fen,
          initial_move: candidate.moves[0] ?? '',
          rating: candidate.rating,
          popularity: candidate.popularity,
          themes: candidate.themes,
          game_url: candidate.gameUrl,
        });
        setRequestIndex((value) => value + 1);
        setStatus(solutionRef.current ? 'ready' : 'error');
        if (!solutionRef.current) setError('В локальной задаче нет решения.');
      } catch {
        if (requestId !== requestIdRef.current) return;
        solutionRef.current = null;
        setPuzzle(null);
        setError(reason instanceof Error ? reason.message : 'Не удалось загрузить задачу');
        setStatus('error');
      }
    }
  };

  useEffect(() => { void loadPuzzle(); }, [themeKey]);
  useEffect(() => {
    if (!boardRef.current || !puzzle) return;
    const game = new Chess(puzzle.fen);
    // Подсвечиваем ход соперника: иначе позиция выглядит статичной
    // и непонятно, что только что произошло и чей теперь ход.
    let lastMove: [Key, Key] | undefined;
    if (puzzle.initial_move) {
      try {
        const played = game.move({ from: puzzle.initial_move.slice(0, 2), to: puzzle.initial_move.slice(2, 4), promotion: puzzle.initial_move[4] as 'q' | 'r' | 'b' | 'n' | undefined });
        if (played) lastMove = [played.from as Key, played.to as Key];
      } catch {
        lastMove = undefined;
      }
    }
    gameRef.current = game;
    groundRef.current?.destroy();
    groundRef.current = Chessground(boardRef.current, { fen: game.fen(), coordinates: false, orientation: game.turn() === 'w' ? 'white' : 'black', turnColor: game.turn() === 'w' ? 'white' : 'black', lastMove, movable: { free: false, color: game.turn() === 'w' ? 'white' : 'black', dests: legalDests(game), events: { after: (orig, dest) => { void submitMove(orig as Key, dest as Key); } } }, highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 300 } });
    return () => groundRef.current?.destroy();
  }, [puzzle]);

  const submitMove = async (orig: Key, dest: Key) => {
    if (!puzzle || !gameRef.current || statusRef.current !== 'ready') return;
    const current = gameRef.current;
    const promotion = (orig[1] === '7' && dest[1] === '8') || (orig[1] === '2' && dest[1] === '1') ? 'q' : '';
    const uci = `${orig}${dest}${promotion}`;
    setStatus('submitting');
    groundRef.current?.set({ movable: { color: 'white', dests: new Map() } });
    const registerSolved = (xpEarned: number, alreadySolved: boolean) => {
      const played = current.move({ from: orig as Square, to: dest as Square, promotion: promotion || 'q' });
      if (!alreadySolved && !solvedRef.current.includes(puzzle.id)) {
        // Всё делаем синхронно здесь: ref актуален всегда, хранилище пишем
        // до события — итог практики больше не отстаёт на один ход.
        setSessionXp((value) => value + xpEarned);
        solvedRef.current = [...solvedRef.current, puzzle.id];
        writePracticeStore(topicId, solvedRef.current);
        setSolvedTick((tick) => tick + 1);
        window.dispatchEvent(new Event('coolchess:practice'));
        if (solvedRef.current.length >= PRACTICE_QUOTA) {
          const claimed = awardPawns(`practice:${topicId}`, PRACTICE_BONUS, 'puzzle');
          setPracticeBonus(claimed.claimed.includes(`practice:${topicId}`));
        }
      }
      setStatus('correct');
      groundRef.current?.set({ fen: current.fen(), lastMove: played ? [played.from as Key, played.to as Key] : undefined, movable: { color: current.turn() === 'w' ? 'white' : 'black', dests: new Map() } });
    };
    const registerWrong = () => {
      setStatus('wrong');
      groundRef.current?.set({ fen: current.fen(), turnColor: current.turn() === 'w' ? 'white' : 'black', movable: { color: current.turn() === 'w' ? 'white' : 'black', dests: legalDests(current) } });
      window.setTimeout(() => { if (statusRef.current === 'wrong') setStatus('ready'); }, 700);
    };
    // Офлайн-режим: сверяем ход с решением из локального запаса.
    const localSolution = solutionRef.current;
    if (localSolution) {
      if (!samePracticeMove(uci, localSolution)) {
        registerWrong();
        return;
      }
      const xp = offlinePracticeXp(puzzle.rating);
      const already = solvedRef.current.includes(puzzle.id);
      registerSolved(xp, already);
      return;
    }
    try {
      const result = await puzzleApi.submitPuzzleMove(puzzle.id, uci);
      if (!result.is_correct) {
        registerWrong();
        return;
      }
      registerSolved(result.xp_earned, result.already_solved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось проверить ход');
      setStatus('error');
      groundRef.current?.set({ fen: current.fen(), turnColor: current.turn() === 'w' ? 'white' : 'black', movable: { color: 'white', dests: new Map() } });
    }
  };

  // Сторона хода после показанного хода соперника: если initial_move есть,
  // очередь переходит к противоположной стороне от записанной в FEN.
  const fenSide = puzzle?.fen.split(' ')[1] ?? 'w';
  const moveSide = puzzle?.initial_move ? (fenSide === 'w' ? 'b' : 'w') : fenSide;
  const moveSideLabel = moveSide === 'w' ? 'белые' : 'чёрные';
  const needsAuth = /401|авторизац|войдите|войти/i.test(error);
  return <div className="lesson-practice"><div className="practice-header"><div><span className="block-kicker">ПРАКТИКА ПО ТЕМЕ</span><strong>Реши {PRACTICE_QUOTA} задачи по теме — каждая засчитывается один раз</strong></div></div><div className="practice-progress"><div className="practice-dots">{Array.from({ length: PRACTICE_QUOTA }, (_, position) => <i key={position} className={position < solvedCount ? 'done' : ''} />)}</div><span>Решено {solvedCount}/{PRACTICE_QUOTA}{sessionXp > 0 ? ` · +${sessionXp} XP за тему` : ''}{practiceBonus ? ' · пройдено ✓' : ''}</span></div><div className="practice-board-wrap"><div ref={boardRef} className="game-board" aria-label="Позиция по текущей теме" /></div>  {done && <div className="practice-done"><div><strong>{practiceBonus ? `Практика пройдена ✓ +${PRACTICE_BONUS} ♟` : `Практика пройдена ✓ ${solvedCount}/${PRACTICE_QUOTA}`}</strong><small>{practiceBonus ? `+${sessionXp} XP за задачи уже на твоём счёте.` : 'Начисляем бонус за практику…'}</small></div></div>}<div className="practice-info"><div><strong>{status === 'correct' ? 'Ход найден ✓' : status === 'wrong' ? 'Неверный ход — попробуй ещё' : status === 'submitting' ? 'Проверяем ход…' : status === 'error' ? (needsAuth ? 'Нужно войти в аккаунт' : error) : status === 'loading' ? 'Загружаем задачу…' : `Твой ход, ${moveSideLabel} — найди лучший ход`}</strong></div>{status === 'error' && needsAuth && <a className="source-link" href="#auth">Войти и решать за XP ↗</a>}<button type="button" className="practice-next" onClick={() => void loadPuzzle(1)} disabled={status === 'loading' || status === 'submitting'}>Другая позиция ↗</button></div></div>;
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
  const [clans, setClans] = useState<clanApi.Clan[]>([]);
  const [clansLoading, setClansLoading] = useState(true);
  const [clansError, setClansError] = useState('');
  const [clanName, setClanName] = useState('');
  const [clanTag, setClanTag] = useState('');
  const [clanDescription, setClanDescription] = useState('');
  const [clanBusy, setClanBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    leaderboardApi.getLeaderboard(category).then((result) => { if (active) setData(result); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить рейтинг'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [category]);

  const refreshClans = async () => {
    setClansLoading(true);
    try {
      setClans(await clanApi.listClans());
      setClansError('');
    } catch (reason) {
      setClansError(reason instanceof Error ? reason.message : 'Не удалось загрузить кланы');
    } finally {
      setClansLoading(false);
    }
  };

  useEffect(() => { void refreshClans(); }, []);

  const runClanAction = async (action: () => Promise<unknown>) => {
    setClanBusy(true);
    setClansError('');
    try {
      await action();
      await refreshClans();
    } catch (reason) {
      setClansError(reason instanceof Error ? reason.message : 'Не удалось изменить состояние клана');
    } finally {
      setClanBusy(false);
    }
  };

  const sortedValue = (player: LeaderboardResponse['top_players'][number]) => category === 'elo' ? `${player.elo_rating} ELO` : category === 'level' ? `ур. ${player.level}` : `${player.puzzles_solved} задач`;
  const clanPanel = <ClanPanel user={user} clans={clans} loading={clansLoading} error={clansError} busy={clanBusy} name={clanName} tag={clanTag} description={clanDescription} setName={setClanName} setTag={setClanTag} setDescription={setClanDescription} create={() => { void runClanAction(async () => { await clanApi.createClan(clanName.trim(), clanTag.trim(), clanDescription.trim()); setClanName(''); setClanTag(''); setClanDescription(''); }); }} join={(clanId) => { void runClanAction(() => clanApi.joinClan(clanId)); }} leave={() => { void runClanAction(() => clanApi.leaveClan()); }} />;
  return <section className="community-page" id="community"><div className="community-hero"><div><span className="eyebrow"><span>03</span> СООБЩЕСТВО COOLCHESS</span><h2>Решай вместе.<br /><em>Расти быстрее.</em></h2><p>Сравнивай рейтинг, уровень и количество решённых задач с учениками школы.</p></div><div className="community-live"><span className="live-label">СЕРВЕРНЫЕ ДАННЫЕ</span><strong>{data?.top_players.length ?? '—'}</strong><small>учеников в текущем списке рейтинга</small><div className="live-stack"><span>♟</span><span>♞</span><span>♜</span></div></div></div><div className="community-grid"><div className="community-card race-large"><div className="card-kicker">СОРЕВНОВАНИЯ</div><h3>Гонки и PvP</h3><p>Для живых гонок, онлайн-статуса и партий друг с другом понадобится отдельный API. Пока доступен рейтинг учеников.</p><div className="race-track"><span className="race-line" /><i style={{ left: '63%' }}>♟</i><i style={{ left: '74%' }}>♞</i></div><span className="source-link">Онлайн-лобби пока не подключено</span></div><div className="community-card online-card"><div className="community-card-title"><h3>Твоя позиция</h3><span>СЕЙЧАС</span></div>{data?.my_rank ? <><div className="community-player"><span>#{data.my_rank.rank}</span><div><strong>Твой результат</strong><small>{data.my_rank.elo_rating} ELO · уровень {data.my_rank.level}</small></div><i /></div><div className="community-player"><span>♟</span><div><strong>{data.my_rank.xp} XP</strong><small>{data.my_rank.puzzles_solved} решённых задач</small></div></div></> : <p>{loading ? 'Загружаем твоё место…' : 'Войди в аккаунт, чтобы увидеть своё место.'}</p>}</div><div className="community-card leaderboard-large"><div className="community-card-title"><h3>Рейтинг учеников</h3><div className="leaderboard-filters">{(['elo', 'level', 'puzzles'] as const).map((item) => <button className={category === item ? 'selected' : ''} key={item} type="button" onClick={() => { setError(''); setCategory(item); }}>{item === 'elo' ? 'ELO' : item === 'level' ? 'Уровень' : 'Задачи'}</button>)}</div></div>{error ? <p className="puzzle-reward">{error}</p> : loading ? <p>Загружаем рейтинг…</p> : data?.top_players.length ? data.top_players.map((player) => <div className={player.user_id === user?.id ? 'ranking-row current' : 'ranking-row'} key={player.user_id}><b>{String(player.rank).padStart(2, '0')}</b><span>{player.email.split('@')[0]}</span><small>{player.puzzles_solved} задач</small><strong>{sortedValue(player)}</strong></div>) : <p>Пока нет учеников в рейтинге.</p>}</div>{clanPanel}</div></section>;
}

function ClanPanel({
  user,
  clans,
  loading,
  error,
  busy,
  name,
  tag,
  description,
  setName,
  setTag,
  setDescription,
  create,
  join,
  leave,
}: {
  user: ReturnType<typeof useAuth>['user'];
  clans: clanApi.Clan[];
  loading: boolean;
  error: string;
  busy: boolean;
  name: string;
  tag: string;
  description: string;
  setName: (value: string) => void;
  setTag: (value: string) => void;
  setDescription: (value: string) => void;
  create: () => void;
  join: (clanId: string) => void;
  leave: () => void;
}) {
  return <div className="community-card invite-card"><span className="invite-symbol">♞</span><h3>Кланы</h3>{error && <p className="puzzle-reward">{error}</p>}{loading ? <p>Загружаем кланы…</p> : clans.length ? clans.slice(0, 3).map((clan) => <div className="community-player" key={clan.id}><span>♞</span><div><strong>[{clan.tag}] {clan.name}</strong><small>{clan.members_count} участников · {clan.total_elo} ELO</small></div>{user && <button className="button button-link" type="button" disabled={busy} onClick={() => join(clan.id)}>Вступить</button>}</div>) : <p>Кланы пока не созданы.</p>}{user ? <><form className="clan-form" onSubmit={(event) => { event.preventDefault(); create(); }}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Название клана" minLength={3} maxLength={50} required /><input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Тег" minLength={2} maxLength={6} required /><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Короткое описание" maxLength={255} /><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Сохраняем…' : 'Создать клан'}</button></form><button className="button button-link" type="button" disabled={busy} onClick={leave}>Выйти из текущего клана</button></> : <span className="source-link">Войди, чтобы создать клан или вступить в него</span>}</div>;
}

function StartLearningPanel() {
  const { user } = useAuth();
  const destinations = [
    { href: '#learn', icon: '📖', title: 'Учиться', text: 'Короткая статья и разбор идеи на доске.', cta: 'Открыть курс' },
    { href: '#puzzles', icon: '♟', title: 'Решать задачи', text: 'Начни с простых позиций и отслеживай результат.', cta: 'К задачам' },
    { href: '#play', icon: '⚔️', title: 'Играть с Maia', text: 'Закрепи навыки в партии против шахматного бота.', cta: 'Начать партию' },
    { href: '#pvp', icon: '♞', title: 'Играть с другом', text: 'Создай комнату и пригласи соперника.', cta: 'Открыть PvP' },
  ];
  return <section className="home-journey" id="start-learning">
    <div className="home-welcome"><div><span className="eyebrow">COOLCHESS · ТВОЙ ШАХМАТНЫЙ МАРШРУТ</span><h1>{user ? <>Продолжай учиться<br /><em>и играть.</em></> : <>От первого урока<br /><em>до своей победы.</em></>}</h1><p>{user ? 'Выбери, чем займёшься сегодня. Прогресс обучения, задач и партий собран в одном месте.' : 'Изучи идею, закрепи её на доске, реши задачу и сыграй партию. Начни с любого шага.'}</p><a className="button button-primary" href="#learn">{user ? 'Продолжить курс' : 'Начать с первого урок'} <span>↘</span></a></div><div className="home-chess-mark" aria-hidden="true">♞</div></div>
    <div className="journey-heading"><div><span className="block-kicker">КАРТА САЙТА</span><h2>Твой путь в CoolChess</h2></div><span>4 шага · можно возвращаться в любой момент</span></div>
    <div className="journey-map">{destinations.map((item, index) => <a className="journey-card" href={item.href} key={item.href}><span className="journey-step">0{index + 1}</span><span className="journey-icon" aria-hidden="true">{item.icon}</span><h3>{item.title}</h3><p>{item.text}</p><span className="journey-cta">{item.cta} <b>↗</b></span></a>)}</div>
    <div className="home-extra-links"><a href="#community"><span aria-hidden="true">🏆</span><span><strong>Сообщество</strong><small>Рейтинг учеников и кланы</small></span><b>↗</b></a><a href="#profile"><span aria-hidden="true">👤</span><span><strong>Мой прогресс</strong><small>Опыт, уровень и статистика</small></span><b>↗</b></a></div>
  </section>;
}
function LearnPage() {
  // Первый урок берём из данных курса, а не хардкодим:
  // иначе кнопка «Открыть первый урок» и дефолт могут разъехаться.
  const firstTopicId = courseModules[0].topics[0].id;
  const topicFromHash = () => window.location.hash.startsWith('#learn/') ? window.location.hash.split('/')[1] : firstTopicId;
  const [topicId, setTopicId] = useState(topicFromHash);
  useEffect(() => { const syncTopic = () => { const next = topicFromHash(); if (next !== firstTopicId || window.location.hash === '#learn') setTopicId(next); }; window.addEventListener('hashchange', syncTopic); return () => window.removeEventListener('hashchange', syncTopic); }, []);
  const module = courseModules.find((item) => item.topics.some((topic) => topic.id === topicId)) ?? courseModules[0];
  const topic = module.topics.find((item) => item.id === topicId) ?? module.topics[0];
  // Награда за теорию выдаётся один раз на тему (claimed в localStorage).
  const [theoryClaimed, setTheoryClaimed] = useState(() => readStudentState().claimed.includes(`theory:${topic.id}`));
  useEffect(() => {
    const syncClaim = () => {
      setTheoryClaimed(readStudentState().claimed.includes(`theory:${topic.id}`));
    };
    syncClaim();
    window.addEventListener('coolchess:state', syncClaim);
    return () => window.removeEventListener('coolchess:state', syncClaim);
  }, [topic.id]);
  // Статусы для дерева тем: перечитываем localStorage при каждом
  // событии теории/практики, чтобы пункты зеленели сразу после прохождения.
  const [statusTick, setStatusTick] = useState(0);
  useEffect(() => {
    const bump = () => setStatusTick((value) => value + 1);
    window.addEventListener('coolchess:state', bump);
    window.addEventListener('coolchess:practice', bump);
    return () => { window.removeEventListener('coolchess:state', bump); window.removeEventListener('coolchess:practice', bump); };
  }, []);
  void statusTick;
  const claimedTopics = readStudentState().claimed;
  const theoryDone = (id: string) => claimedTopics.includes(`theory:${id}`);
  // Практика закрыта, когда забран разовый бонус за квоту 3/3.
  const practiceDone = (id: string) => claimedTopics.includes(`practice:${id}`);
  const article = lessonContent[topic.id];
  const visual = lessonVisuals[topic.id] ?? { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: [], title: topic.title, caption: 'Разбери позицию и назови главную идею.', focus: 'e4 d4' };
  const completeTheory = () => {
    const next = awardPawns(`theory:${topic.id}`, 20, 'theory');
    setTheoryClaimed(next.claimed.includes(`theory:${topic.id}`));
  };
  // Трекер теории: разбор считается досмотренным, когда линия на демо-доске
  // проиграна до конца (или если ходов в ней нет вовсе).
  const [demoViewed, setDemoViewed] = useState(() => readDemoStore()[topic.id] ?? visual.moves.length === 0);
  useEffect(() => {
    setDemoViewed(readDemoStore()[topic.id] ?? (lessonVisuals[topic.id]?.moves.length ?? 0) === 0);
  }, [topic.id]);
  const markDemoViewed = () => { writeDemoStore(topic.id); setDemoViewed(true); };
  // Степпер рабочей зоны (Stepik-концепция): теория → проверка знаний → практика.
  // При выборе урока правая область полностью переключается и стартует с теории.
  type LessonStep = 'theory' | 'quiz' | 'practice';
  const [step, setStep] = useState<LessonStep>('theory');
  useEffect(() => { setStep('theory'); }, [topic.id]);
  // Переход между шагами всегда возвращает наверх рабочей зоны:
  // иначе после кнопки остаёшься в середине страницы.
  const goStep = (next: LessonStep) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // Сайдбар — полное раскрытое дерево курса: все модули и уроки всегда видны.
  // Квиз засчитывается один раз на тему; практика locked до его прохождения.
  const [quizTick, setQuizTick] = useState(0);
  void quizTick;
  const quizQuestions = lessonQuiz[topic.id] ?? [];
  const quizPassed = (readQuizStore()[topic.id] ?? false) || quizQuestions.length === 0;
  const practiceLocked = quizQuestions.length > 0 && !quizPassed;
  const markQuizPassed = () => setQuizTick((value) => value + 1);
  // Выбор урока из дерева (и кнопка «следующий урок»): переключаем рабочую зону.
  const selectTopic = (nextId: string) => {
    setTopicId(nextId);
    setStep('theory');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try { window.history.replaceState(null, '', `#learn/${nextId}`); } catch { /* hash не критичен */ }
  };
  // Следующий урок по порядку дерева — для кнопки после успешной практики.
  const allTopics = courseModules.flatMap((courseModule) => courseModule.topics);
  const nextTopic = allTopics[allTopics.findIndex((item) => item.id === topic.id) + 1] ?? null;
  // Данные для итогового табло шага 4: бонус практики и текущий счёт квоты.
  // Практика пишет счёт синхронно и шлёт событие coolchess:practice
  // о каждом зачтённом решении — по нему перечитываем хранилище.
  const practiceBonusClaimed = claimedTopics.includes(`practice:${topic.id}`);
  const practiceSolved = Math.min((readPracticeStore()[topic.id] ?? []).length, PRACTICE_QUOTA);
  return <section className="learn-page"><aside className="learn-page-sidebar"><div className="sidebar-title"><span className="sidebar-logo">♟</span><div><strong>Курс ученика</strong><small>Выбери тему для изучения</small></div></div>{courseModules.map((item) => {
    const moduleDoneCount = item.topics.filter((moduleTopic) => theoryDone(moduleTopic.id) && practiceDone(moduleTopic.id)).length;
    return <div className="learn-module" key={item.id}><strong>{item.title} · {moduleDoneCount}/{item.topics.length}</strong>{item.topics.map((itemTopic) => {
    const topicActive = itemTopic.id === topic.id;
    const topicTheoryDone = theoryDone(itemTopic.id);
    const topicPracticeDone = practiceDone(itemTopic.id);
    // Зелёным горит только полностью закрытая тема: теория + практика 3/3.
    const topicFullDone = topicTheoryDone && topicPracticeDone;
    return <button className={`learn-topic${topicActive ? ' active' : ''}${topicFullDone ? ' done-full' : ''}${topicPracticeDone ? ' done-practice' : ''}`} key={itemTopic.id} type="button" onClick={() => selectTopic(itemTopic.id)} title={topicFullDone ? 'Тема пройдена полностью ✓' : topicTheoryDone ? 'Теория пройдена — осталось решить практику 3/3' : topicPracticeDone ? 'Практика пройдена — осталось завершить теорию' : itemTopic.title}><span>{topicFullDone ? '✓' : topicActive ? '→' : '·'}</span>{itemTopic.title}</button>;
  })}</div>; })}</aside><main className="learn-page-main"><nav className="lesson-flow lesson-stepper" aria-label="Шаги урока"><button className={step === 'theory' ? 'current' : theoryClaimed ? 'done' : ''} type="button" onClick={() => goStep('theory')}><span>{theoryClaimed ? '✓' : '1'}</span>Теория</button><button className={step === 'quiz' ? 'current' : quizPassed ? 'done' : ''} type="button" onClick={() => goStep('quiz')}><span>{quizPassed ? '✓' : '2'}</span>Проверка знаний</button><button className={step === 'practice' ? 'current' : practiceBonusClaimed ? 'done' : ''} type="button" disabled={practiceLocked} title={practiceLocked ? 'Сначала верно ответь на все вопросы шага 2' : 'Интерактивная практика'} onClick={() => goStep('practice')}><span>{practiceBonusClaimed ? '✓' : '3'}</span>Практика{practiceLocked ? ' · 🔒' : ''}</button></nav>{step === 'theory' && <article className="learn-article" id="lesson-article"><div className="learn-article-text"><h1 className="learn-topic-title">{topic.title}</h1><p className="learn-topic-lead">{article.lead}</p>{article.body.map((paragraph) => <p key={paragraph.slice(0, 32)}>{paragraph}</p>)}</div><div className="learn-article-board"><TheoryBoard visual={visual} onLineViewed={markDemoViewed} kicker="ЛИСТАЙ РАЗБОР" /></div><div className="article-completion">{!theoryClaimed && <button className="button button-primary" type="button" onClick={completeTheory}>Отметить теорию изученной · +20 ♟</button>}<button className="button button-primary" type="button" onClick={() => goStep('quiz')}>К проверке знаний →</button></div></article>}{step === 'quiz' && <LessonQuiz key={topic.id} topicId={topic.id} topicTitle={topic.title} boardFen={visual.fen} questions={quizQuestions} onPassed={markQuizPassed} onGoPractice={() => goStep('practice')} />}{step === 'practice' && <section className="learn-practice lesson-tab-practice" id="lesson-practice"><div className="learn-practice-heading"><div><h2>Сделай ход сам.</h2><p>Квиз пройден — доска твоя. Найди лучший ход: сервер проверит ответ и начислит XP и монеты. Подборка — по тегам выбранной темы: {topic.puzzleThemes.join(', ') || 'базовая позиция'}.</p></div></div><LessonPracticeBoard key={topic.id} topicId={topic.id} themes={topic.puzzleThemes} />{practiceBonusClaimed && <div className="practice-success"><div><strong>Приём закреплён ✓ — практика темы пройдена!</strong><small>Так держать. Можно закрепить ещё или идти дальше по курсу.</small></div>{nextTopic && <button className="button button-primary" type="button" onClick={() => selectTopic(nextTopic.id)}>Следующий урок: {nextTopic.title} →</button>}</div>}</section>}</main></section>;
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
  return <section className="profile-page"><div className="profile-hero"><div className="profile-avatar-large">{displayName[0]?.toUpperCase() ?? 'У'}</div><div><span className="eyebrow"><span>06</span> ПРОФИЛЬ УЧЕНИКА</span><h1>{displayName} <em>в игре.</em></h1><p>{profile?.email ?? user?.email ?? 'Данные профиля загружаются с сервера.'}</p></div><div className="profile-wallet"><span>РЕЙТИНГ COOLCHESS</span><strong>{loading ? '…' : profile?.elo_rating ?? '—'}</strong><small>{profile ? `уровень ${profile.level} · ${profile.coins} ♟` : user?.role ?? 'ученик'}</small></div></div>{error && <p className="puzzle-reward">{error}</p>}<div className="profile-grid"><div className="profile-card streak-card"><span className="profile-card-kicker">ОПЫТ</span><strong>{loading ? '…' : profile?.xp ?? '—'} XP</strong><p>накопленный опыт</p><small>Уровень {loading ? '…' : profile?.level ?? '—'} · серверные данные</small></div><div className="profile-card"><span className="profile-card-kicker">БАЛАНС</span><strong>{loading ? '…' : profile?.coins ?? '—'} ♟</strong><p>доступные пешки</p><small>Подтверждено сервером</small></div><div className="profile-card"><span className="profile-card-kicker">ЗАДАЧИ</span><strong>{loading ? '…' : rankData?.my_rank?.puzzles_solved ?? '—'}</strong><p>решено правильно</p><small>{rankData?.my_rank ? `Место в рейтинге: ${rankData.my_rank.rank}` : 'Пока нет статистики'}</small></div><div className="profile-card"><span className="profile-card-kicker">LICHESS</span><strong>{profile?.lichess_username ? '✓' : '—'}</strong><p>{profile?.lichess_username ?? 'Аккаунт не привязан'}</p><small>{profile?.lichess_rapid_rating ? `Rapid ${profile.lichess_rapid_rating}` : 'Подключи профиль для синхронизации'}</small></div></div><div className="profile-activity"><div><h2>Связать Lichess</h2><p>Скопируй проверочный код в описание профиля Lichess, затем укажи свой ник здесь.</p>{verification && <p><strong>{verification}</strong></p>}{linkMessage && <p>{linkMessage}</p>}</div><div className="lichess-link-controls"><input value={lichessName} onChange={(event) => setLichessName(event.target.value)} placeholder="Ник на Lichess" aria-label="Ник на Lichess" /><button className="button button-link" type="button" onClick={() => void startLichessLink()}>Получить код</button><button className="button button-primary" type="button" disabled={!lichessName.trim() || linkBusy} onClick={() => void submitLichessLink()}>{linkBusy ? 'Проверяем…' : 'Проверить и связать'}</button></div></div></section>;
}

function PvpPage() {
  const { user } = useAuth();
  const boardRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  const chessRef = useRef<Chess | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [opponentId, setOpponentId] = useState('');
  const [room, setRoom] = useState<PvpRoomState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const syncBoard = (nextRoom: PvpRoomState) => {
    if (!boardRef.current || !user) return;
    const chess = new Chess(nextRoom.fen);
    chessRef.current = chess;
    setRoom(nextRoom);
    const myColor = nextRoom.white_player.user_id === user.id ? 'white' : 'black';
    const canMove = !nextRoom.game_over && nextRoom.turn === myColor && (myColor === 'white' ? nextRoom.white_player.connected : nextRoom.black_player.connected);
    groundRef.current?.set({
      fen: nextRoom.fen,
      orientation: myColor,
      turnColor: nextRoom.turn,
      check: nextRoom.is_check ? nextRoom.turn : false,
      movable: { color: canMove ? myColor : 'white', dests: canMove ? legalDests(chess) : new Map() },
    });
  };

  const connectRoom = (gameId: string) => {
    socketRef.current?.close();
    const socket = pvpApi.createPvpSocket(gameId, (event) => {
      if (event.data) syncBoard(event.data);
      if (event.type === 'game_over') setMessage(`Партия завершена: ${event.reason ?? event.result ?? 'готово'}`);
      if (event.type === 'draw_offered') setMessage('Соперник предложил ничью.');
      if (event.type === 'error') setError(event.message ?? 'Ошибка PvP');
    });
    socket.addEventListener('open', () => setMessage('Соединение с комнатой установлено.'));
    socket.addEventListener('close', () => setMessage('Соединение с комнатой закрыто.'));
    socket.addEventListener('error', () => setError('Не удалось подключиться к PvP-комнате.'));
    socketRef.current = socket;
  };

  useEffect(() => {
    if (!boardRef.current) return;
    groundRef.current = Chessground(boardRef.current, {
      fen: 'start', coordinates: true, orientation: 'white', turnColor: 'white',
      movable: { free: false, color: 'white', dests: new Map(), events: { after: (orig, dest) => socketRef.current?.send(JSON.stringify({ action: 'move', move: `${orig}${dest}` })) } },
      highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 180 },
    });
    return () => { socketRef.current?.close(); groundRef.current?.destroy(); };
  }, []);

  const createRoom = async () => {
    if (!opponentId.trim()) return;
    setBusy(true); setError(''); setMessage('Создаём комнату…');
    try {
      const result = await pvpApi.createPvpRoom(opponentId.trim());
      syncBoard(result.data);
      connectRoom(result.game_id);
      setOpponentId(result.game_id);
      window.history.replaceState(null, '', `#pvp/${result.game_id}`);
      setMessage(`Код комнаты: ${result.game_id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось создать комнату');
    } finally { setBusy(false); }
  };

  const joinRoom = async (roomId = opponentId.trim()) => {
    if (!roomId) return;
    setBusy(true); setError('');
    try { const result = await pvpApi.getPvpRoom(roomId); syncBoard(result); setOpponentId(result.game_id); connectRoom(result.game_id); setMessage(`Подключено к комнате ${result.game_id}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Комната не найдена'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const roomId = window.location.hash.split('/')[1];
    if (roomId) { setOpponentId(roomId); void joinRoom(roomId); }
  }, []);

  const copyInviteLink = async () => {
    if (!room) return;
    const link = `${window.location.origin}${window.location.pathname}#pvp/${room.game_id}`;
    try { await navigator.clipboard.writeText(link); setMessage('Ссылка на приглашение скопирована.'); }
    catch { setMessage(link); }
  };

  const sendAction = (action: 'resign' | 'draw_offer' | 'draw_accept') => socketRef.current?.send(JSON.stringify({ action }));
  const displayName = (email: string) => email.split('@')[0];
  if (!user) return <section className="pvp-page"><div className="community-card"><h1>PvP</h1><p>Войди в аккаунт, чтобы создать или подключить PvP-комнату.</p><a className="button button-primary" href="#auth">Войти ↗</a></div></section>;
  return <section className="pvp-page"><div className="pvp-heading"><span className="eyebrow"><span>07</span> ЖИВАЯ ПАРТИЯ</span><h1>Играй<br /><em>с человеком.</em></h1><p>Создай комнату для соперника или подключись по коду. Ходы и часы синхронизируются через WebSocket.</p></div><div className="pvp-layout"><div className="pvp-board-card"><div ref={boardRef} className="game-board" aria-label="PvP шахматная доска" />{room && <div className="pvp-clocks"><span>{displayName(room.white_player.email)} <b>{Math.ceil(room.white_time)}с</b></span><span>{displayName(room.black_player.email)} <b>{Math.ceil(room.black_time)}с</b></span></div>}</div><aside className="pvp-panel"><h2>Лобби PvP</h2><label>{room ? 'Ссылка или код комнаты' : 'UUID соперника или код комнаты'}<input value={opponentId} onChange={(event) => setOpponentId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></label><div className="pvp-actions"><button className="button button-primary" type="button" disabled={busy || !opponentId.trim() || Boolean(room)} onClick={() => void createRoom()}>Создать комнату</button><button className="button button-link" type="button" disabled={busy || !opponentId.trim()} onClick={() => void joinRoom()}>{busy ? 'Подключаемся…' : 'Подключиться'}</button>{room && <button className="button button-link" type="button" onClick={() => void copyInviteLink()}>Скопировать приглашение</button>}</div>{error && <p className="puzzle-reward">{error}</p>}{message && <p className="source-link">{message}</p>}{room && <><div className="pvp-players"><p><strong>Белые:</strong> {displayName(room.white_player.email)} {room.white_player.connected ? '●' : '○'}</p><p><strong>Чёрные:</strong> {displayName(room.black_player.email)} {room.black_player.connected ? '●' : '○'}</p></div><div className="pvp-actions"><button className="button button-link" type="button" onClick={() => sendAction('draw_offer')}>Предложить ничью</button><button className="button button-link" type="button" onClick={() => sendAction('draw_accept')}>Принять ничью</button><button className="button button-link" type="button" onClick={() => sendAction('resign')}>Сдаться</button></div></>}</aside></div></section>;
}

function AppV2() {
  const route = useHashRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  if (route === 'auth') return <FeatureAuthPage />;
  const page = route === 'learn' || route === 'theory' ? <LearnPage /> : route === 'play' ? <ChessGame /> : route === 'puzzles' ? <LichessPuzzleLibrary /> : route === 'community' ? <CommunityPage /> : route === 'pvp' ? <PvpPage /> : route === 'profile' ? <ProfilePage /> : <StartLearningPanel />;
  return <div className="app-shell"><header className="topbar"><a className="brand" href="#home" aria-label="CoolChess, на главную"><span className="brand-mark">♞</span><span>cool<span>chess</span></span></a><nav className={`main-nav${menuOpen ? ' open' : ''}`} aria-label="Основная навигация">{[{ route: 'home', href: '#home', icon: '⌂', label: 'Главная', hint: 'Маршрут по сайту' }, { route: 'learn', href: '#learn', icon: '▤', label: 'Учиться', hint: 'Статьи и разборы' }, { route: 'play', href: '#play', icon: '♟', label: 'Играть', hint: 'Партия с Maia' }, { route: 'puzzles', href: '#puzzles', icon: '◇', label: 'Задачи', hint: 'Тактика и прогресс' }, { route: 'pvp', href: '#pvp', icon: '⚔', label: 'PvP', hint: 'Партия с другом' }, { route: 'community', href: '#community', icon: '♜', label: 'Сообщество', hint: 'Рейтинг и кланы' }, ...(user ? [{ route: 'profile', href: '#profile', icon: '◉', label: 'Профиль', hint: 'Статистика и прогресс' }] : [{ route: 'auth', href: '#auth', icon: '↗', label: 'Войти / регистрация', hint: 'Вход и регистрация' }])].map((item) => <a title={item.hint} aria-label={`${item.label}: ${item.hint}`} className={`${item.route === 'profile' ? 'nav-profile ' : item.route === 'auth' ? 'nav-auth ' : ''}${(item.route === 'home' ? route === 'home' : item.route === 'learn' ? route === 'learn' || route === 'theory' : route === item.route) ? 'active' : ''}`} href={item.href} key={item.route} onClick={() => setMenuOpen(false)}><span aria-hidden="true">{item.icon}</span>{item.label}</a>)}</nav><div className="topbar-user">{user ? <><a className="profile-button" href="#profile" aria-label={`Открыть профиль ${user.email.split('@')[0]}`}><span className="profile-avatar">{user.email.split('@')[0][0]?.toUpperCase() ?? 'У'}</span><span className="profile-button-copy"><strong>Профиль</strong><small>{user.email.split('@')[0]}</small></span><span className="profile-arrow" aria-hidden="true">↗</span></a><button className="auth-nav-link" type="button" onClick={() => { void logout().then(() => { window.location.hash = '#home'; }); }}>Выйти</button></> : <a className="auth-nav-link" href="#auth">Войти / регистрация</a>}</div><button className="menu-button" type="button" aria-expanded={menuOpen} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "×" : "☰"}</button></header><main className="route-main">{page}</main><footer className="footer"><div className="footer-brand"><span className="brand-mark">♞</span><span>cool<span>chess</span></span></div><p>Шахматы, которые растут вместе с тобой.</p><small>© 2026 CoolChess. Учимся думать на несколько ходов вперёд.</small></footer></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><AuthProvider><AppV2 /></AuthProvider></StrictMode>);
