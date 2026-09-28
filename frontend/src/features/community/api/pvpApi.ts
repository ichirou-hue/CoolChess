export type PvpPlayer = {
  user_id: string;
  email: string;
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
      // Keep the status message when the server did not return JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function createPvpRoom(opponentId: string, timeControl = 180, increment = 2) {
  return request<{ game_id: string; status: string; data: PvpRoomState }>('/api/pvp/rooms', {
    method: 'POST',
    body: JSON.stringify({ opponent_id: opponentId, time_control: timeControl, increment }),
  });
}

export function getPvpRoom(gameId: string) {
  return request<PvpRoomState>(`/api/pvp/rooms/${encodeURIComponent(gameId)}`);
}

export function createPvpSocket(gameId: string, onMessage: (message: { type: string; data?: PvpRoomState; move?: string; result?: string; reason?: string; message?: string }) => void) {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const wsUrl = apiUrl.replace(/^http/, 'ws');
  const socket = new WebSocket(`${wsUrl}/ws/pvp/${encodeURIComponent(gameId)}?token=${encodeURIComponent(token ?? '')}`);
  socket.addEventListener('message', (event) => {
    try { onMessage(JSON.parse(event.data) as Parameters<typeof onMessage>[0]); } catch { /* Ignore malformed events. */ }
  });
  return socket;
}
