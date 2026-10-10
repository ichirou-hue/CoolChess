/** Reads the public leaderboard and the signed-in student's rank. */
import { fetchApi, readApiError } from '../../../shared/api/apiBase';

export type LeaderboardCategory = 'elo' | 'level' | 'puzzles';

export type LeaderboardPlayer = {
  rank: number;
  user_id: string;
  display_name: string;
  email: string;
  elo_rating: number;
  level: number;
  xp: number;
  puzzles_solved: number;
};

export type LeaderboardResponse = {
  category: LeaderboardCategory;
  top_players: LeaderboardPlayer[];
  my_rank: Omit<LeaderboardPlayer, 'user_id' | 'email'> | null;
};

export async function getLeaderboard(category: LeaderboardCategory = 'elo', limit = 20) {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetchApi(`/api/leaderboard?${new URLSearchParams({ category, limit: String(limit) })}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json() as Promise<LeaderboardResponse>;
}
