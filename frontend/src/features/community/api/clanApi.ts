/** Client for the server-backed clan feature. */
export type Clan = {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  created_at: string;
  leader_id: string;
  members_count: number;
  total_elo: number;
};

export type ClanMember = {
  user_id: string;
  email: string;
  role: 'leader' | 'officer' | 'member' | string;
  elo_rating: number;
  joined_at: string;
};

export type ClanDetails = Clan & { members: ClanMember[] };

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

export function listClans(limit = 20, offset = 0) {
  return request<Clan[]>(`/api/clans?limit=${limit}&offset=${offset}`);
}

export function createClan(name: string, tag: string, description?: string) {
  return request<ClanDetails>('/api/clans/create', {
    method: 'POST',
    body: JSON.stringify({ name, tag, description: description || null }),
  });
}

export function joinClan(clanId: string) {
  return request<Clan>(`/api/clans/${encodeURIComponent(clanId)}/join`, { method: 'POST' });
}

export function leaveClan() {
  return request<{ message: string }>('/api/clans/leave', { method: 'POST' });
}
