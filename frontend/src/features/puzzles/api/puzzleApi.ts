/** Loads themed puzzles and submits a student's move for server validation. */
import { fetchApi, readApiError } from '../../../shared/api/apiBase';

export type Puzzle = {
  id: string;
  fen: string;
  initial_move: string;
  rating: number;
  popularity: number;
  themes: string[];
  game_url: string | null;
};

export type PuzzleSolveResult = {
  is_correct: boolean;
  message: string;
  already_solved: boolean;
  is_complete: boolean;
  opponent_move: string | null;
  xp_earned: number;
  coins_earned: number;
  elo_change: number;
  new_level: number | null;
};

const tokenKey = 'coolchess.accessToken';

export function hasToken() {
  return typeof window !== 'undefined' && sessionStorage.getItem(tokenKey) !== null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetchApi(path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json() as Promise<T>;
}

export type PuzzleFilters = {
  theme?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'master' | 'grandmaster';
  progress?: 'unsolved' | 'solved' | 'all';
};

export function getRandomPuzzle(filters: string | PuzzleFilters = {}) {
  const normalized: PuzzleFilters = typeof filters === 'string' ? { theme: filters } : filters;
  const query = new URLSearchParams();
  if (normalized.theme) query.set('theme', normalized.theme);
  if (normalized.difficulty) query.set('difficulty', normalized.difficulty);
  if (normalized.progress === 'solved') query.set('solved_only', 'true');
  else if (normalized.progress !== 'all') query.set('exclude_solved', 'true');
  return request<Puzzle>(`/api/puzzles/random?${query.toString()}`);
}

export function getPuzzleBatch(filters: string | PuzzleFilters = {}, limit = 10) {
  const normalized: PuzzleFilters = typeof filters === 'string' ? { theme: filters } : filters;
  const query = new URLSearchParams({ limit: String(Math.min(10, Math.max(1, limit))) });
  if (normalized.theme) query.set('theme', normalized.theme);
  if (normalized.difficulty) query.set('difficulty', normalized.difficulty);
  if (normalized.progress === 'solved') query.set('solved_only', 'true');
  else if (normalized.progress !== 'all') query.set('exclude_solved', 'true');
  return request<Puzzle[]>(`/api/puzzles/batch?${query.toString()}`);
}

export function submitPuzzleMove(puzzleId: string, movesUci: string) {
  return request<PuzzleSolveResult>(`/api/puzzles/${encodeURIComponent(puzzleId)}/solve`, {
    method: 'POST',
    body: JSON.stringify({ user_moves: movesUci }),
  });
}

// --- Backward-compatible aliases (pre-merge API names) ---
// Старые имена из ветки HEAD: ServerPuzzle / SolveResult / solvePuzzle.
// Оставлены как алиасы, чтобы не ломать импорты после слияния.
export type ServerPuzzle = Puzzle;
export type SolveResult = PuzzleSolveResult;
export function solvePuzzle(puzzleId: string, movesUci: string) {
  return submitPuzzleMove(puzzleId, movesUci);
}
