/** Starts games and sends player moves to the backend. */
import { fetchApi, readApiError } from '../../../shared/api/apiBase';

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
  elo_delta: number;
};

export type GameHistoryItem = {
  id: string;
  status: GameResponse['status'];
  player_color: 'white' | 'black';
  bot_difficulty: number;
  moves_count: number;
  created_at: string;
};

async function request<T>(path: string, init: RequestInit = {}) {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetchApi(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
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

export function makeMove(gameId: string, moveUci: string, difficulty?: number) {
  return request<GameResponse>(`/api/games/${gameId}/move`, {
    method: 'POST',
    body: JSON.stringify({ move_uci: moveUci, ...(difficulty === undefined ? {} : { difficulty }) }),
  });
}

export function resignGame(gameId: string) {
  return request<GameResponse>(`/api/games/${gameId}/resign`, { method: 'POST' });
}

export function getMyGames() {
  return request<GameHistoryItem[]>('/api/games/my');
}
