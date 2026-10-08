import { Chess } from 'chess.js';
import openingRows from '../../../data/openings.json';

type OpeningRow = [eco: string, name: string, pgn: string];
type OpeningEntry = { eco: string; name: string; moves: string[] };

let openingEntries: OpeningEntry[] | null = null;

const localizedRoots: Record<string, string> = {
  'Alekhine\'s Defense': 'Защита Алехина',
  'Caro-Kann Defense': 'Защита Каро — Канн',
  'English Opening': 'Английское начало',
  'French Defense': 'Французская защита',
  'Italian Game': 'Итальянская партия',
  'King\'s Gambit': 'Королевский гамбит',
  'King\'s Indian Defense': 'Староиндийская защита',
  'London System': 'Лондонская система',
  'Nimzo-Indian Defense': 'Нимцо-индийская защита',
  'Queen\'s Gambit': 'Ферзевый гамбит',
  'Ruy Lopez': 'Испанская партия',
  'Scandinavian Defense': 'Скандинавская защита',
  'Scotch Game': 'Шотландская партия',
  'Sicilian Defense': 'Сицилианская защита',
  'Slav Defense': 'Славянская защита',
  'Vienna Game': 'Венская партия',
};

function localizeOpening(name: string) {
  const [root, ...rest] = name.split(':');
  const translatedRoot = localizedRoots[root] ?? root;
  if (!rest.length) return translatedRoot;
  const variation = rest.join(':').trim()
    .replaceAll('Variation', 'вариант')
    .replaceAll('Attack', 'атака')
    .replaceAll('Gambit', 'гамбит')
    .replaceAll('Defense', 'защита');
  return `${translatedRoot}: ${variation}`;
}

function readOpeningEntries() {
  if (openingEntries) return openingEntries;
  openingEntries = (openingRows as unknown as OpeningRow[]).flatMap(([eco, name, pgn]) => {
    try {
      const game = new Chess();
      game.loadPgn(pgn);
      return [{ eco, name, moves: game.history({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ''}`) }];
    } catch {
      return [];
    }
  });
  return openingEntries;
}

/** Finds an opening at the exact position or a nearby named position on the same line. */
export function identifyOpening(moves: string[]) {
  if (moves.length < 4) return null;
  const prefixMatches = readOpeningEntries().filter((entry) => entry.moves.length >= moves.length
    && entry.moves.slice(0, moves.length).every((move, index) => move === moves[index]));
  if (!prefixMatches.length) return null;
  const exactMatches = prefixMatches.filter((entry) => entry.moves.length === moves.length);
  const pool = exactMatches.length ? exactMatches : prefixMatches.filter((entry) => entry.moves.length - moves.length <= 2);
  if (!pool.length) return null;
  const [match] = pool.sort((a, b) => (a.moves.length - moves.length) - (b.moves.length - moves.length)
    || b.name.length - a.name.length || a.eco.localeCompare(b.eco));
  const safeName = exactMatches.length ? match.name : match.name.split(':')[0];
  return { eco: match.eco, name: localizeOpening(safeName) };
}
