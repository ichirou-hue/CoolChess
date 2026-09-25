<<<<<<< HEAD
// Клиент серверных задач CoolChess (backend /api/puzzles).
//
// Авторизованные пользователи решают задачи через backend и получают
// серверные награды (XP/монеты/Elo с защитой от повторного фарма).
// Без токена или при недоступности backend компонент задач
// падает назад на локальный индекс /data/puzzles.json.

export type ServerPuzzle = {
=======
/** Loads themed puzzles and submits a student's move for server validation. */
export type Puzzle = {
>>>>>>> 6faf31c4167ec0e785bc9b57b4e8fdeed406c114
  id: string;
  fen: string;
  initial_move: string;
  rating: number;
  popularity: number;
  themes: string[];
  game_url: string | null;
};

<<<<<<< HEAD
export type SolveResult = {
=======
export type PuzzleSolveResult = {
>>>>>>> 6faf31c4167ec0e785bc9b57b4e8fdeed406c114
  is_correct: boolean;
  message: string;
  already_solved: boolean;
  xp_earned: number;
  coins_earned: number;
  elo_change: number;
  new_level: number | null;
};

<<<<<<< HEAD
const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const tokenKey = 'coolchess.accessToken';

export function hasToken() {
  return typeof window !== 'undefined' && sessionStorage.getItem(tokenKey) !== null;
}

async function authedRequest<T>(path: string, init: RequestInit = {}) {
  const token = typeof window === 'undefined' ? null : sessionStorage.getItem(tokenKey);
  if (!token) throw new Error('Нужна авторизация');
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
=======
const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8081').replace(/\/$/, '');

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
>>>>>>> 6faf31c4167ec0e785bc9b57b4e8fdeed406c114
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = `Ошибка сервера (${response.status})`;
    try {
<<<<<<< HEAD
      const body = (await response.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // Keep the status message when the server did not return JSON.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function getRandomPuzzle() {
  return authedRequest<ServerPuzzle>('/api/puzzles/random');
}

export function solvePuzzle(puzzleId: string, moveUci: string) {
  return authedRequest<SolveResult>(`/api/puzzles/${puzzleId}/solve`, {
=======
      const body = await response.json() as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // Keep the status message if the server did not return JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function getRandomPuzzle(theme?: string) {
  const query = new URLSearchParams({ exclude_solved: 'true' });
  if (theme) query.set('theme', theme);
  return request<Puzzle>(`/api/puzzles/random?${query.toString()}`);
}

export function submitPuzzleMove(puzzleId: string, moveUci: string) {
  return request<PuzzleSolveResult>(`/api/puzzles/${encodeURIComponent(puzzleId)}/solve`, {
>>>>>>> 6faf31c4167ec0e785bc9b57b4e8fdeed406c114
    method: 'POST',
    body: JSON.stringify({ user_moves: moveUci }),
  });
}
