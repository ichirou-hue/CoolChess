// Клиент серверных задач CoolChess (backend /api/puzzles).
//
// Авторизованные пользователи решают задачи через backend и получают
// серверные награды (XP/монеты/Elo с защитой от повторного фарма).
// Без токена или при недоступности backend компонент задач
// падает назад на локальный индекс /data/puzzles.json.

export type ServerPuzzle = {
  id: string;
  fen: string;
  initial_move: string;
  rating: number;
  popularity: number;
  themes: string[];
  game_url: string | null;
};

export type SolveResult = {
  is_correct: boolean;
  message: string;
  already_solved: boolean;
  xp_earned: number;
  coins_earned: number;
  elo_change: number;
  new_level: number | null;
};

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
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = `Ошибка сервера (${response.status})`;
    try {
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
    method: 'POST',
    body: JSON.stringify({ user_moves: moveUci }),
  });
}
