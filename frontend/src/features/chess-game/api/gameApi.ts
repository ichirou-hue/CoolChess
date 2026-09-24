export type GameResponse = {
  id: string;
  status: 'in_progress' | 'player_won' | 'bot_won' | 'draw' | 'resigned' | string;
  player_color: 'white' | 'black';
  bot_difficulty: number;
  current_fen: string;
  moves_uci: string[];
  is_check: boolean;
  is_game_over: boolean;
  winner: 'player' | 'bot' | 'draw' | null;
  last_bot_move: string | null;
  xp_earned: number;
  coins_earned: number;
};

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8081').replace(/\/$/, '');

async function request<T>(path: string, init: RequestInit = {}) {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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
      // Keep the status message when the server did not return JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function startGame(playerColor: 'white' | 'black' = 'white', difficulty = 1500) {
  return request<GameResponse>('/api/games/start', {
    method: 'POST',
    body: JSON.stringify({ player_color: playerColor, difficulty }),
  });
}

export function getActiveGame() {
  return request<GameResponse | null>('/api/games/active');
}

export function makeMove(gameId: string, moveUci: string) {
  return request<GameResponse>(`/api/games/${gameId}/move`, {
    method: 'POST',
    body: JSON.stringify({ move_uci: moveUci }),
  });
}

export function resignGame(gameId: string) {
  return request<GameResponse>(`/api/games/${gameId}/resign`, { method: 'POST' });
}
