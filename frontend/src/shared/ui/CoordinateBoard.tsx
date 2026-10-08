import type { MouseEventHandler, RefObject } from 'react';

const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
const files = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

type CoordinateBoardProps = {
  boardRef: RefObject<HTMLDivElement | null>;
  label: string;
  boardClassName?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
};

export function CoordinateBoard({ boardRef, label, boardClassName = '', onClick }: CoordinateBoardProps) {
  const boardClasses = ['game-board', 'coordinate-board-surface', boardClassName].filter(Boolean).join(' ');

  return <div className="coordinate-board-layout">
    <div className="coordinate-board-ranks" aria-hidden="true">{ranks.map((rank) => <span key={rank}>{rank}</span>)}</div>
    <div ref={boardRef} className={boardClasses} onClick={onClick} aria-label={label} />
    <div className="coordinate-board-files" aria-hidden="true">{files.map((file) => <span key={file}>{file}</span>)}</div>
  </div>;
}
