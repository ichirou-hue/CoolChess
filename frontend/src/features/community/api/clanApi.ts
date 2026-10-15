/** API для работы с кланом (кланом).
 * 
 * Эндпоинты:
 * - GET /api/clans — список кланов
 * - POST /api/clans — создать клан
 * - POST /api/clans/join/{clan_id} — присоединиться к клану
 * - POST /api/clans/leave — покинуть клан
 */

import { fetchApi, readApiError } from '../../../shared/api/apiBase';

export type Clan = {
  id: string;
  name: string;
  tag: string;
  description: string;
  created_at: string;
  member_count: number;
  owner: {
    id: string;
    display_name: string;
    email: string;
  };
  members: Array<{
    id: string;
    display_name: string;
    email: string;
    role: 'owner' | 'admin' | 'member';
  }>;
};

export type ClanPanelProps = {
  user: any;
  clans: Clan[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  name: string;
  tag: string;
  description: string;
  setName: (name: string) => void;
  setTag: (tag: string) => void;
  setDescription: (description: string) => void;
  create: () => Promise<void>;
  join: (clanId: string) => Promise<void>;
  leave: () => Promise<void>;
};

export async function listClans(): Promise<Clan[]> {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetchApi('/api/clans', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json() as Promise<Clan[]>;
}

export async function createClan(clanName: string, clanTag: string, clanDescription: string) {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetchApi('/api/clans', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ name: clanName, tag: clanTag, description: clanDescription }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json();
}

export async function joinClan(clanId: string) {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetchApi(`/api/clans/join/${clanId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json();
}

export async function leaveClan() {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetchApi('/api/clans/leave', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json();
}