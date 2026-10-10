import { fetchApi, readApiError, wsUrlFor } from '../../../shared/api/apiBase';

export type PvpPlayer = {
  user_id: string | null;
  email: string;
  display_name: string;
  elo: number;
  connected: boolean;
};

export type PvpRoomState = {
  game_id: string;
  fen: string;
  turn: 'white' | 'black';
  is_check: boolean;
  white_time: number;
  black_time: number;
  game_over: boolean;
  result: string | null;
  reason: string | null;
  white_player: PvpPlayer;
  black_player: PvpPlayer;
};

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

export function createPvpRoom(timeControl = 180, increment = 2) {
  return request<{ game_id: string; room_code: string; color: string; ws_url: string; time_control: number; increment: number }>('/api/pvp/create', {
    method: 'POST',
    body: JSON.stringify({ time_control: timeControl, increment }),
  });
}

export function getPvpRoom(gameId: string) {
  return request<PvpRoomState>(`/api/pvp/rooms/${encodeURIComponent(gameId)}`);
}

export function createPvpSocket(gameId: string, onMessage: (message: { type: string; data?: PvpRoomState; move?: string; result?: string; reason?: string; message?: string }) => void) {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const wsUrl = wsUrlFor(`/ws/pvp/${encodeURIComponent(gameId)}?token=${encodeURIComponent(token ?? '')}`);
  const socket = new WebSocket(wsUrl);
  socket.addEventListener('message', (event) => {
    try { onMessage(JSON.parse(event.data) as Parameters<typeof onMessage>[0]); } catch { /* Ignore malformed events. */ }
  });
  return socket;
}
