/** Loads themed puzzles and submits a student's move for server validation. */
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
  xp_earned: number;
  coins_earned: number;
  elo_change: number;
  new_level: number | null;
};

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8081').replace(/\/$/, '');

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = `Ошибка сервера (${response.status})`;
    try {
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
    method: 'POST',
    body: JSON.stringify({ user_moves: moveUci }),
  });
}
