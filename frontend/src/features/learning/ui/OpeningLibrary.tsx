import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import { CoordinateBoard } from '../../../shared/ui/CoordinateBoard';
import openingRows from '../../../data/openings.json';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';

type OpeningRow = [eco: string, name: string, pgn: string];
type OpeningLine = { id: string; eco: string; name: string; label: string; pgn: string };
type OpeningFamily = { name: string; lines: OpeningLine[] };
type Side = 'white' | 'black';
type Mode = 'study' | 'practice';

const localizedNames: Record<string, string> = {
  "Alekhine's Defense": 'Защита Алехина',
  "Benko Gambit": 'Гамбит Бенко',
  "Benoni Defense": 'Защита Бенони',
  "Bird Opening": 'Дебют Берда',
  "Caro-Kann Defense": 'Защита Каро — Канн',
  "Catalan Opening": 'Каталонское начало',
  "Dutch Defense": 'Голландская защита',
  "English Opening": 'Английское начало',
  "French Defense": 'Французская защита',
  "Grünfeld Defense": 'Защита Грюнфельда',
  "Italian Game": 'Итальянская партия',
  "King's Gambit": 'Королевский гамбит',
  "King's Indian Defense": 'Староиндийская защита',
  "London System": 'Лондонская система',
  "Nimzo-Indian Defense": 'Нимцо-индийская защита',
  "Petrov's Defense": 'Защита Петрова',
  "Pirc Defense": 'Защита Пирца',
  "Queen's Gambit": 'Ферзевый гамбит',
  "Reti Opening": 'Дебют Рети',
  "Ruy Lopez": 'Испанская партия',
  "Scandinavian Defense": 'Скандинавская защита',
  "Scotch Game": 'Шотландская партия',
  "Sicilian Defense": 'Сицилианская защита',
  "Slav Defense": 'Славянская защита',
  "Vienna Game": 'Венская партия',
};

function displayName(name: string) {
  return localizedNames[name] ?? name;
}

const openingFamilies: OpeningFamily[] = (() => {
  const grouped = new Map<string, OpeningLine[]>();
  (openingRows as unknown as OpeningRow[]).forEach(([eco, name, pgn], index) => {
    const separator = name.indexOf(':');
    const family = separator < 0 ? name : name.slice(0, separator).trim();
    const label = separator < 0 ? 'Базовая линия' : name.slice(separator + 1).trim();
    const lines = grouped.get(family) ?? [];
    if (!lines.some((line) => line.pgn === pgn)) lines.push({ id: `${eco}-${index}`, eco, name, label, pgn });
    grouped.set(family, lines);
  });
  return [...grouped].map(([name, lines]) => ({ name, lines })).sort((a, b) => displayName(a.name).localeCompare(displayName(b.name), 'ru'));
})();

const lineMoveCache = new Map<string, string[]>();
const lineNotationCache = new Map<string, string[]>();

function movesForLine(line: OpeningLine) {
  const cached = lineMoveCache.get(line.id);
  if (cached) return cached;
  const chess = new Chess();
  chess.loadPgn(line.pgn);
  const moves = chess.history({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ''}`);
  lineMoveCache.set(line.id, moves);
  return moves;
}

function notationForLine(line: OpeningLine) {
  const cached = lineNotationCache.get(line.id);
  if (cached) return cached;
  const chess = new Chess();
  chess.loadPgn(line.pgn);
  const notation = chess.history();
  lineNotationCache.set(line.id, notation);
  return notation;
}

function legalDests(game: Chess) {
  const dests = new Map<Key, Key[]>();
  for (const move of game.moves({ verbose: true })) {
    const from = move.from as Key;
    dests.set(from, [...(dests.get(from) ?? []), move.to as Key]);
  }
  return dests;
}

function parseUci(chess: Chess, uci: string) {
  return chess.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] as 'q' | 'r' | 'b' | 'n' | undefined });
}

type OpeningPreviewPiece = { row: number; col: number; glyph: string; color: 'white' | 'black' };
type OpeningPreviewFrame = { pieces: OpeningPreviewPiece[]; lastMove?: [[number, number], [number, number]] };

const previewGlyphs = {
  white: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  black: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
} as const;

const openingPreviewCache = new Map<string, OpeningPreviewFrame[]>();

function previewFrames(line: OpeningLine): OpeningPreviewFrame[] {
  const cached = openingPreviewCache.get(line.id);
  if (cached) return cached;
  const chess = new Chess();
  const frames: OpeningPreviewFrame[] = [];
  const captureFrame = (lastMove?: [[number, number], [number, number]]) => {
    const pieces = chess.board().flatMap((rank, row) => rank.flatMap((piece, col) => piece ? [{
      row,
      col,
      glyph: previewGlyphs[piece.color === 'w' ? 'white' : 'black'][piece.type],
      color: piece.color === 'w' ? 'white' as const : 'black' as const,
    }] : []));
    frames.push({ pieces, lastMove });
  };
  captureFrame();
  for (const uci of movesForLine(line)) {
    const move = parseUci(chess, uci);
    if (!move) break;
    captureFrame([
      [8 - Number(move.from[1]), move.from.charCodeAt(0) - 97],
      [8 - Number(move.to[1]), move.to.charCodeAt(0) - 97],
    ]);
  }
  openingPreviewCache.set(line.id, frames);
  return frames;
}

function OpeningFamilyPreview({ family }: { family: OpeningFamily }) {
  const previewRef = useRef<HTMLSpanElement>(null);
  const frames = useMemo(() => family.lines[0] ? previewFrames(family.lines[0]) : [], [family]);
  const [isVisible, setIsVisible] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { rootMargin: '100px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || frames.length < 2) return;
    setFrameIndex(0);
    let index = 0;
    const timer = window.setInterval(() => {
      index = (index + 1) % frames.length;
      setFrameIndex(index);
    }, 760);
    return () => window.clearInterval(timer);
  }, [frames, isVisible]);

  const frame = frames[frameIndex] ?? frames[0];
  return <span ref={previewRef} className="opening-family-preview" aria-hidden="true">
    <span className="coordinate-board-layout opening-family-preview-layout">
      <span className="coordinate-board-ranks">{[8, 7, 6, 5, 4, 3, 2, 1].map((rank) => <span key={rank}>{rank}</span>)}</span>
      <span className="opening-family-preview-board coordinate-board-surface">
        {frame?.lastMove?.map(([row, col], index) => <i key={`last-${index}`} className="opening-family-preview-last" style={{ gridRow: row + 1, gridColumn: col + 1 }} />)}
        {frame?.pieces.map((piece, index) => <i key={`${piece.row}-${piece.col}-${index}`} className={`opening-family-preview-piece ${piece.color}`} style={{ gridRow: piece.row + 1, gridColumn: piece.col + 1 }}>{piece.glyph}</i>)}
      </span>
      <span className="coordinate-board-files">{['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((file) => <span key={file}>{file}</span>)}</span>
    </span>
  </span>;
}

function OpeningLineBoard({ family, line, onComplete }: { family: OpeningFamily; line: OpeningLine; onComplete?: () => void }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<Api | null>(null);
  const gameRef = useRef(new Chess());
  const timerRef = useRef<number | null>(null);
  const lineRef = useRef(line);
  const familyRef = useRef(family);
  const sideRef = useRef<Side>('white');
  const modeRef = useRef<Mode>('study');
  const stepRef = useRef(0);
  const completedRef = useRef(false);
  const previousSettingsRef = useRef('study:white');
  const [mode, setMode] = useState<Mode>('study');
  const [side, setSide] = useState<Side>('white');
  const [previewing, setPreviewing] = useState(true);
  const [step, setStep] = useState(0);
  const [activeLine, setActiveLine] = useState(line);
  const [feedback, setFeedback] = useState('Выбери вариант и реши, хочешь его разобрать или сыграть без подсказки.');
  const [wrongMove, setWrongMove] = useState(false);
  const moves = useMemo(() => movesForLine(activeLine), [activeLine]);
  const notation = useMemo(() => notationForLine(activeLine), [activeLine]);
  const movesRef = useRef(moves);
  lineRef.current = activeLine;
  familyRef.current = family;
  sideRef.current = side;
  modeRef.current = mode;
  movesRef.current = moves;

  const setStepValue = (value: number) => {
    stepRef.current = value;
    setStep(value);
  };

  const configureBoard = () => {
    const game = gameRef.current;
    const practiceTurn = modeRef.current === 'practice' && (game.turn() === 'w' ? 'white' : 'black') === sideRef.current;
    const expected = movesRef.current[stepRef.current];
    groundRef.current?.set({
      fen: game.fen(),
      turnColor: game.turn() === 'w' ? 'white' : 'black',
      check: game.isCheck() ? game.turn() === 'w' ? 'white' : 'black' : false,
      movable: practiceTurn && expected
        ? { color: sideRef.current, dests: legalDests(game) }
        : { color: 'white', dests: new Map() },
    });
  };

  const stopTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const scheduleOpponentMove = () => {
    stopTimer();
    const index = stepRef.current;
    if (modeRef.current !== 'practice' || index >= movesRef.current.length) {
      if (index >= movesRef.current.length && !completedRef.current) {
        completedRef.current = true;
        setFeedback('Линия пройдена. Выбери соседний вариант или смени сторону и сыграй её ещё раз.');
        onComplete?.();
      }
      return;
    }
    const currentSide = gameRef.current.turn() === 'w' ? 'white' : 'black';
    if (currentSide === sideRef.current) return;
    timerRef.current = window.setTimeout(() => {
      const move = parseUci(gameRef.current, movesRef.current[stepRef.current]);
      if (!move) {
        setFeedback('Вариант не удалось продолжить. Выбери другую линию.');
        return;
      }
      setStepValue(stepRef.current + 1);
      configureBoard();
      scheduleOpponentMove();
    }, 420);
  };

  const resetLine = (nextMode = modeRef.current, nextSide = sideRef.current) => {
    stopTimer();
    setPreviewing(false);
    modeRef.current = nextMode;
    sideRef.current = nextSide;
    gameRef.current = new Chess();
    completedRef.current = false;
    setWrongMove(false);
    setFeedback(nextMode === 'practice' ? 'Ходи сам. Ответ соперника появится после твоего хода.' : 'Разбирай выбранную линию ход за ходом.');
    setStepValue(0);
    configureBoard();
    if (nextMode === 'practice') scheduleOpponentMove();
  };

  const advanceStudy = (delta: number) => {
    const target = Math.max(0, Math.min(movesRef.current.length, stepRef.current + delta));
    const nextGame = new Chess();
    let lastMove: [Key, Key] | undefined;
    for (const uci of movesRef.current.slice(0, target)) {
      const move = parseUci(nextGame, uci);
      if (move) lastMove = [move.from as Key, move.to as Key];
    }
    gameRef.current = nextGame;
    setStepValue(target);
    groundRef.current?.set({ fen: nextGame.fen(), turnColor: nextGame.turn() === 'w' ? 'white' : 'black', lastMove, movable: { color: 'white', dests: new Map() } });
    if (target === movesRef.current.length && !completedRef.current) {
      completedRef.current = true;
      onComplete?.();
    }
  };

  useEffect(() => {
    if (!boardRef.current) return;
    resetLine('study', 'white');
    groundRef.current = Chessground(boardRef.current, {
      fen: gameRef.current.fen(), orientation: 'white', coordinates: false,
      movable: { free: false, color: 'white', dests: new Map(), events: { after: (from, to) => {
        if (modeRef.current !== 'practice') return;
        const current = gameRef.current;
        const attempted = new Chess(current.fen());
        const promotes = (from[1] === '7' && to[1] === '8') || (from[1] === '2' && to[1] === '1');
        const played = attempted.move({ from: from as Square, to: to as Square, promotion: promotes ? 'q' : undefined });
        if (!played) return;
        const playedUci = `${played.from}${played.to}${played.promotion ?? ''}`;
        const prefix = movesRef.current.slice(0, stepRef.current);
        const branch = familyRef.current.lines.find((candidate) => {
          const candidateMoves = movesForLine(candidate);
          return candidateMoves.length > stepRef.current
            && prefix.every((move, index) => candidateMoves[index] === move)
            && candidateMoves[stepRef.current] === playedUci;
        });
        if (!branch) {
          setWrongMove(true);
          const expected = movesRef.current[stepRef.current];
          setFeedback('Такого ответа нет в выбранной линии. Попробуй ещё раз; после попытки правильный ход отмечен стрелкой.');
          groundRef.current?.set({ fen: current.fen(), movable: { color: sideRef.current, dests: legalDests(current) }, drawable: { shapes: expected ? [{ orig: expected.slice(0, 2) as Key, dest: expected.slice(2, 4) as Key, brush: 'green' }] : [] } });
          return;
        }
        const previousLineId = lineRef.current.id;
        gameRef.current = attempted;
        lineRef.current = branch;
        setActiveLine(branch);
        movesRef.current = movesForLine(branch);
        setWrongMove(false);
        if (branch.id !== previousLineId) setFeedback(`Продолжаем по ответвлению: ${branch.label}.`);
        setStepValue(stepRef.current + 1);
        groundRef.current?.set({ fen: attempted.fen(), turnColor: attempted.turn() === 'w' ? 'white' : 'black', lastMove: [played.from as Key, played.to as Key], drawable: { shapes: [] }, movable: { color: 'white', dests: new Map() } });
        scheduleOpponentMove();
      } } },
      highlight: { lastMove: true, check: true }, animation: { enabled: true, duration: 240 },
    });
    configureBoard();
    setPreviewing(true);
    setFeedback('Смотри полную линию. После неё можно будет разобрать ходы по очереди.');
    let previewStep = 0;
    const playPreviewMove = () => {
      const uci = movesRef.current[previewStep];
      if (!uci) {
        setPreviewing(false);
        setFeedback('Полная линия показана. Если хочешь, разбери её по ходам или проверь себя.');
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
        return;
      }
      const move = parseUci(gameRef.current, uci);
      if (!move) {
        stopTimer();
        setPreviewing(false);
        setFeedback('Не удалось показать продолжение этой линии. Выбери другой вариант.');
        return;
      }
      previewStep += 1;
      setStepValue(previewStep);
      groundRef.current?.set({ fen: gameRef.current.fen(), lastMove: [move.from as Key, move.to as Key], turnColor: gameRef.current.turn() === 'w' ? 'white' : 'black' });
      timerRef.current = window.setTimeout(playPreviewMove, 360);
    };
    timerRef.current = window.setTimeout(playPreviewMove, 420);
    const observer = new ResizeObserver(() => groundRef.current?.redrawAll());
    observer.observe(boardRef.current);
    return () => { stopTimer(); observer.disconnect(); groundRef.current?.destroy(); groundRef.current = null; };
  }, [line.id]);

  useEffect(() => {
    const nextSettings = `${mode}:${side}`;
    if (previousSettingsRef.current !== nextSettings) resetLine(mode, side);
    else configureBoard();
    previousSettingsRef.current = nextSettings;
  }, [mode, side]);

  const linePly = step;
  return <div className="opening-line-trainer">
    <div className="opening-line-toolbar">
      <div><span className="opening-kicker">{previewing ? 'ПОЛНАЯ ЛИНИЯ' : mode === 'study' ? 'РАЗБОР ДЕБЮТА' : 'ПРАКТИКА'}</span><strong>{activeLine.label === 'Базовая линия' ? 'Основная линия' : activeLine.label}</strong></div>
      {!previewing && <div className="opening-mode-switch"><button type="button" className={mode === 'study' ? 'active' : ''} onClick={() => setMode('study')}>Разобрать</button><button type="button" className={mode === 'practice' ? 'active' : ''} onClick={() => setMode('practice')}>Проверить себя</button></div>}
    </div>
    {mode === 'practice' && <div className="opening-side-switch" aria-label="Выбери сторону"><span>Играю за</span><button type="button" className={side === 'white' ? 'active' : ''} onClick={() => setSide('white')}>Белых</button><button type="button" className={side === 'black' ? 'active' : ''} disabled={moves.length < 2} title={moves.length < 2 ? 'В этой линии нет ответа за чёрных. Выбери более длинный вариант.' : undefined} onClick={() => setSide('black')}>Чёрных</button></div>}
    <div className={`opening-line-content${wrongMove ? ' has-wrong-move' : ''}`}>
      <div className="opening-line-board"><CoordinateBoard boardRef={boardRef} label={`Доска: ${displayName(family.name)}`} boardClassName="theory-demo-board opening-catalog-board" /></div>
      <div className="opening-line-notes"><span className="opening-kicker">{previewing ? 'СМОТРИ НА ДОСКУ' : mode === 'study' ? 'РАЗБОР ЛИНИИ' : 'ТВОЯ ОЧЕРЕДЬ'}</span><p>{feedback}</p><small>{linePly} из {moves.length} полуходов</small>
        <div className="opening-move-list" aria-label="История ходов линии"><div className="opening-move-header"><span>№</span><span>Белые</span><span>Чёрные</span></div>{Array.from({ length: Math.ceil(moves.length / 2) }, (_, index) => {
          const whitePly = index * 2 + 1;
          const blackPly = index * 2 + 2;
          return <div className="opening-move-row" key={index}><span className="opening-move-number">{index + 1}.</span><span className={`opening-move-notation${linePly === whitePly ? ' active' : linePly > whitePly ? ' seen' : ''}`}>{notation[whitePly - 1] ?? '—'}</span><span className={`opening-move-notation${linePly === blackPly ? ' active' : linePly > blackPly ? ' seen' : ''}`}>{notation[blackPly - 1] ?? '—'}</span></div>;
        })}</div>
        {mode === 'study' && !previewing && step >= moves.length && <button className="opening-restart" type="button" onClick={() => resetLine('study', side)}>Разобрать линию</button>}
        {mode === 'study' && !previewing && step < moves.length && <div className="opening-line-controls"><button type="button" onClick={() => advanceStudy(-1)} disabled={step === 0}>← Назад</button><button type="button" onClick={() => advanceStudy(1)} disabled={step >= moves.length}>Следующий ход →</button><button type="button" onClick={() => resetLine('study', side)}>Сначала</button></div>}
        {mode === 'practice' && <button className="opening-restart" type="button" onClick={() => resetLine('practice', side)}>Начать линию заново</button>}
      </div>
    </div>
  </div>;
}

export function OpeningLibrary({ onComplete, initialOpening, onFamilyChange }: { onComplete?: () => void; initialOpening?: string; onFamilyChange?: (name: string | null) => void }) {
  const initialFamily = openingFamilies.find((family) => family.name === initialOpening) ?? null;
  const [query, setQuery] = useState('');
  const [ecoGroup, setEcoGroup] = useState('Все');
  const [sideFilter, setSideFilter] = useState('Все');
  const [selectedFamily, setSelectedFamily] = useState<OpeningFamily | null>(initialFamily);
  const [selectedLine, setSelectedLine] = useState<OpeningLine | null>(initialFamily?.lines[0] ?? null);
  const [lineQuery, setLineQuery] = useState('');

  const visibleLines = useMemo(() => selectedFamily?.lines.filter((line) => !lineQuery || `${line.eco} ${line.name} ${line.label}`.toLowerCase().includes(lineQuery.toLowerCase())) ?? [], [selectedFamily, lineQuery]);

  const visibleFamilies = useMemo(() => openingFamilies.filter((family) => {
    const matchesQuery = !query || `${displayName(family.name)} ${family.name} ${family.lines.map((line) => `${line.eco} ${line.name}`).join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const matchesEco = ecoGroup === 'Все' || family.lines.some((line) => line.eco.startsWith(ecoGroup));
    const isBlackDefense = /(defen[cs]e|counter|Englund|Albin|Budapest|Benko|Latvian|Elephant|Stafford)/i.test(family.name);
    const matchesSide = sideFilter === 'Все' || (sideFilter === 'За чёрных' ? isBlackDefense : !isBlackDefense);
    return matchesQuery && matchesEco && matchesSide;
  }), [query, ecoGroup, sideFilter]);

  const chooseFamily = (family: OpeningFamily) => {
    setSelectedFamily(family);
    setSelectedLine(family.lines[0] ?? null);
    setLineQuery('');
    onFamilyChange?.(displayName(family.name));
  };

  return <section className="opening-library">
    {!selectedFamily ? <>
      <header className="opening-library-heading"><div><span className="opening-kicker">БИБЛИОТЕКА ДЕБЮТОВ</span><h2>Выбери, что разыграть.</h2><p>Открой дебют и выбери линию. Сначала увидишь её целиком, затем сможешь разобрать ходы или проверить себя.</p></div></header>
      <div className="opening-filters"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, вариант или ECO-код" aria-label="Поиск по дебютам"/><select value={sideFilter} onChange={(event) => setSideFilter(event.target.value)} aria-label="Фильтр стороны"><option>Все</option><option>За белых</option><option>За чёрных</option></select><select value={ecoGroup} onChange={(event) => setEcoGroup(event.target.value)} aria-label="Фильтр ECO"><option>Все</option>{['A', 'B', 'C', 'D', 'E'].map((group) => <option key={group} value={group}>ECO {group}</option>)}</select></div>
      <div className="opening-family-grid">{visibleFamilies.map((family) => <button className="opening-family-card" type="button" key={family.name} onClick={() => chooseFamily(family)}><span className="opening-family-copy"><span className="opening-family-code">{family.lines[0]?.eco ?? 'ECO'}</span><strong>{displayName(family.name)}</strong><small>{family.lines[0]?.name}</small><b>Открыть дебют ↗</b></span><OpeningFamilyPreview family={family} /></button>)}</div>
      {visibleFamilies.length === 0 && <p className="opening-more-note">Ничего не найдено. Попробуй другое название или код ECO.</p>}
      <small className="opening-source-note">Названия, ECO-коды и линии взяты из открытого каталога Lichess CC0.</small>
    </> : <>
      <div className="opening-detail-top"><button type="button" onClick={() => { setSelectedFamily(null); setSelectedLine(null); onFamilyChange?.(null); }}>← Все дебюты</button></div>
      <div className="opening-variation-tools"><input type="search" value={lineQuery} onChange={(event) => setLineQuery(event.target.value)} placeholder="Найти вариант или ECO-код" aria-label="Поиск по вариантам"/></div>
      <div className="opening-variation-grid">{visibleLines.slice(0, 100).map((line) => <button type="button" key={line.id} className={selectedLine?.id === line.id ? 'active' : ''} onClick={() => setSelectedLine(line)}><span>{line.eco}</span><strong>{line.label === 'Базовая линия' ? 'Основная линия' : line.label}</strong><small>{line.name}</small></button>)}</div>
      {visibleLines.length > 100 && <p className="opening-more-note">Список сокращён. Уточни поиск, чтобы найти нужную линию.</p>}
      {selectedLine && <OpeningLineBoard key={selectedLine.id} family={selectedFamily} line={selectedLine} onComplete={onComplete}/>}
    </>}
  </section>;
}
