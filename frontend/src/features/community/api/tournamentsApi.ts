import { fetchApi, readApiError } from '../../../shared/api/apiBase';

export type TournamentColor = 'white' | 'black' | 'random';

export type TournamentPlayer = {
  user_id: string;
  display_name: string;
  elo_rating: number;
  group_name: string | null;
  preferred_color: TournamentColor | null;
  joined_at: string;
};

export type Tournament = {
  id: string;
  name: string;
  description: string | null;
  format: 'round_robin' | 'swiss' | 'single_elimination';
  time_control: number;
  increment: number;
  max_players: number;
  status: string;
  created_at: string;
  participants: TournamentPlayer[];
  is_joined: boolean;
};

export type TournamentUser = {
  id: string;
  display_name: string;
  elo_rating: number;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', 'Bearer ' + token);
  const response = await fetchApi(path, { ...init, headers });
  if (!response.ok) throw new Error(await readApiError(response));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function listTournaments() {
  return request<Tournament[]>('/api/tournaments');
}

export function createTournament(payload: {
  name: string;
  description: string;
  format: Tournament['format'];
  time_control: number;
  increment: number;
  max_players: number;
}) {
  return request<Tournament>('/api/tournaments', { method: 'POST', body: JSON.stringify(payload) });
}

export function listTournamentPlayers() {
  return request<TournamentUser[]>('/api/tournaments/players');
}

export function joinTournament(id: string, userId?: string) {
  return request<Tournament>('/api/tournaments/' + encodeURIComponent(id) + '/participants', {
    method: 'POST',
    body: JSON.stringify(userId ? { user_id: userId } : {}),
  });
}

export function chooseSide(id: string, preferredColor: TournamentColor | null) {
  return request<Tournament>('/api/tournaments/' + encodeURIComponent(id) + '/me/side', {
    method: 'PATCH',
    body: JSON.stringify({ preferred_color: preferredColor }),
  });
}

export function assignGroup(id: string, userId: string, groupName: string | null) {
  return request<Tournament>(
    '/api/tournaments/' + encodeURIComponent(id) + '/participants/' + encodeURIComponent(userId),
    { method: 'PATCH', body: JSON.stringify({ group_name: groupName }) },
  );
}

export function removeParticipant(id: string, userId: string) {
  return request<void>(
    '/api/tournaments/' + encodeURIComponent(id) + '/participants/' + encodeURIComponent(userId),
    { method: 'DELETE' },
  );
}
